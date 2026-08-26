import "server-only";
import { db } from "@/shared/db";
import { AppError } from "@/shared/core/api-response";
import { notify } from "@/features/notifications/service";
import { money } from "@/shared/core/money";
import { expenseSchema, expenseCategorySchema, type ExpenseInput } from "./schema";
import { Prisma } from "@/generated/prisma/client";

export async function listExpenses(opts: {
  categoryId?: string; page?: number; pageSize?: number;
  from?: string; to?: string;
}) {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = opts.pageSize ?? 25;
  const where: Prisma.ExpenseWhereInput = {
    ...(opts.categoryId ? { categoryId: opts.categoryId } : {}),
    ...(opts.from || opts.to
      ? {
          expenseDate: {
            ...(opts.from ? { gte: new Date(`${opts.from}T00:00:00`) } : {}),
            ...(opts.to ? { lte: new Date(`${opts.to}T23:59:59`) } : {}),
          },
        }
      : {}),
  };
  const [rows, count, totalAgg] = await Promise.all([
    db.expense.findMany({
      where,
      include: {
        category: { select: { name: true, nameAr: true } },
        user: { select: { fullName: true, fullNameAr: true } },
      },
      orderBy: { expenseDate: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.expense.count({ where }),
    db.expense.aggregate({ _sum: { amount: true }, where }),
  ]);
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const deletableIds = new Set(rows.filter((r) => r.createdAt.getTime() > cutoff).map((r) => r.id));
  return {
    rows: rows.map((r) => ({ ...r, deletable: deletableIds.has(r.id) })),
    total: count, page, pageSize,
    totalAmount: money(totalAgg._sum?.amount ?? 0).toNumber(),
  };
}

export async function saveExpense(userId: string, raw: unknown) {
  const data = expenseSchema.parse(raw);
  const category = await db.expenseCategory.findUnique({ where: { id: data.categoryId } });
  if (!category) throw new AppError("VALIDATION_ERROR", "Unknown expense category");

  const result = await db.$transaction(async (tx) => {
    const seq = await tx.expense.count();
    const expense = await tx.expense.create({
      data: {
        expenseNumber: `EXP-${String(seq + 1).padStart(6, "0")}`,
        categoryId: data.categoryId,
        amount: money(data.amount).toString(),
        method: data.method,
        description: data.description || null,
        notes: data.notes || null,
        ...(data.expenseDate ? { expenseDate: new Date(`${data.expenseDate}T12:00:00`) } : {}),
        userId,
      },
    });
    const { recordAudit } = await import("@/shared/core/audit");
    await recordAudit(tx, {
      userId, action: "EXPENSE_CREATE", entityType: "Expense", entityId: expense.id,
    });
    return expense;
  });
  void notify({
    type: "EXPENSE", title: "EXPENSE",
    body: `${result.expenseNumber} · ${result.amount} · ${category.name}`,
    entityType: "Expense", entityId: result.id, href: "/expenses",
  });
  return result;
}

/** Expenses are financial records — delete is restricted to same-day voids. */
export async function deleteExpense(id: string) {
  const e = await db.expense.findUnique({ where: { id } });
  if (!e) throw new AppError("NOT_FOUND", "Expense not found");
  const ageMs = Date.now() - e.createdAt.getTime();
  if (ageMs > 24 * 60 * 60 * 1000) {
    throw new AppError("VALIDATION_ERROR", "Only expenses recorded in the last 24h can be deleted");
  }
  await db.expense.delete({ where: { id } });
  void notify({
    type: "EXPENSE", title: "EXPENSE",
    body: `${e.expenseNumber} · VOID · ${e.amount}`,
    entityType: "Expense", entityId: id, href: "/expenses",
  });
}

export async function listCategories() {
  return db.expenseCategory.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    include: { _count: { select: { expenses: true } } },
  });
}

export async function saveCategory(id: string | null, raw: unknown) {
  const data = expenseCategorySchema.parse(raw);
  const payload = {
    name: data.name,
    nameAr: data.nameAr || null,
    description: data.description || null,
  };
  if (id) {
    return db.expenseCategory.update({ where: { id }, data: payload });
  }
  return db.expenseCategory.create({ data: payload });
}

export async function deleteCategory(id: string) {
  const inUse = await db.expense.count({ where: { categoryId: id } });
  if (inUse > 0) throw new AppError("IN_USE", "Category has expenses");
  await db.expenseCategory.delete({ where: { id } });
}

export type ExpenseInputT = ExpenseInput;
