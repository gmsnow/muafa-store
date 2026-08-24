"use server";

import { guard, ok } from "@/shared/core/api-response";
import { requirePermission } from "@/features/auth/session";
import { saveExpense, deleteExpense, saveCategory, deleteCategory } from "./service";

export async function saveExpenseAction(raw: unknown) {
  return guard(async () => {
    const user = await requirePermission("expenses.manage");
    const e = await saveExpense(user.id, raw);
    return ok({ id: e.id, expenseNumber: e.expenseNumber });
  });
}

export async function deleteExpenseAction(id: string) {
  return guard(async () => {
    await requirePermission("expenses.manage");
    await deleteExpense(id);
    return ok({ deleted: true });
  });
}

export async function saveExpenseCategoryAction(id: string | null, raw: unknown) {
  return guard(async () => {
    await requirePermission("expenses.manage");
    return ok(await saveCategory(id, raw));
  });
}

export async function deleteExpenseCategoryAction(id: string) {
  return guard(async () => {
    await requirePermission("expenses.manage");
    await deleteCategory(id);
    return ok({ deleted: true });
  });
}
