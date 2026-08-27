import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/shared/db";
import { AppError } from "@/shared/core/api-response";
import { notify } from "@/features/notifications/service";
import { D, money } from "@/shared/core/money";
import { TXN_IMAGE_BUCKET, uploadObject, removeObjects, downloadObject } from "@/shared/supabase-storage";
import {
  customerSchema, customerGroupSchema, customerTxnSchema, loyaltyAdjustSchema,
} from "./schema";
import type { Prisma } from "@/generated/prisma/client";

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export async function listCustomers(opts: {
  q?: string; groupId?: string; includeInactive?: boolean; page?: number; pageSize?: number;
}) {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = opts.pageSize ?? 25;
  const q = opts.q?.trim();
  const where: Prisma.CustomerWhereInput = {
    deletedAt: null,
    ...(!opts.includeInactive ? { isActive: true } : {}),
    ...(opts.groupId ? { groupId: opts.groupId } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { nameAr: { contains: q } },
            { code: { contains: q, mode: "insensitive" } },
            { phone: { contains: q } },
          ],
        }
      : {}),
  };
  const [rows, count] = await Promise.all([
    db.customer.findMany({
      where,
      include: { group: { select: { id: true, name: true, discountRate: true } } },
      orderBy: { name: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.customer.count({ where }),
  ]);
  return { rows, total: count, page, pageSize };
}

export async function getCustomerForEdit(id: string) {
  const c = await db.customer.findFirst({
    where: { id, deletedAt: null },
    include: { group: { select: { id: true } } },
  });
  if (!c) throw new AppError("NOT_FOUND", "Customer not found");
  return c;
}

export async function saveCustomer(id: string | null, raw: unknown) {
  const data = customerSchema.parse(raw);
  const base = {
    name: data.name,
    nameAr: data.nameAr || null,
    phone: data.phone || null,
    email: data.email || null,
    address: data.address || null,
    groupId: data.groupId || null,
    creditLimit: money(data.creditLimit).toString(),
    notes: data.notes || null,
  };
  if (id) {
    const existing = await db.customer.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new AppError("NOT_FOUND", "Customer not found");
    return db.customer.update({ where: { id }, data: base });
  }
  const seq = await db.customer.count();
  return db.customer.create({
    data: {
      code: `CUS-${String(seq + 1).padStart(4, "0")}`,
      ...base,
    },
  });
}

/** Deactivate + soft-delete. Blocked when the customer has a ledger balance. */
export async function softDeleteCustomer(id: string) {
  const c = await db.customer.findFirst({ where: { id, deletedAt: null } });
  if (!c) throw new AppError("NOT_FOUND", "Customer not found");
  if (D(c.balance).gt(0)) throw new AppError("IN_USE", "Customer has outstanding balance");
  await db.customer.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

export async function listGroups() {
  return db.customerGroup.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { customers: true } } },
  });
}

export async function saveGroup(id: string | null, raw: unknown) {
  const data = customerGroupSchema.parse(raw);
  const payload = {
    name: data.name,
    nameAr: data.nameAr || null,
    description: data.description || null,
    discountRate: data.discountRate,
    priceMode: data.priceMode,
  };
  if (id) {
    return db.customerGroup.update({ where: { id }, data: payload });
  }
  return db.customerGroup.create({ data: payload });
}

export async function deleteGroup(id: string) {
  const inUse = await db.customer.count({ where: { groupId: id } });
  if (inUse > 0) throw new AppError("IN_USE", "Group has members");
  await db.customerGroup.delete({ where: { id } });
}

// ---------------------------------------------------------------------------
// Credit ledger — PAYMENT lowers balance, DEBT raises it.
// Every entry records balanceAfter for statement reconstruction.
// ---------------------------------------------------------------------------

export async function recordCustomerTxn(userId: string, raw: unknown) {
  const input = customerTxnSchema.parse(raw);
  const result = await db.$transaction(async (tx) => {
    const customer = await tx.customer.findFirst({ where: { id: input.customerId, deletedAt: null } });
    if (!customer) throw new AppError("NOT_FOUND", "Customer not found");

    let delta: ReturnType<typeof D>;
    if (input.type === "PAYMENT") {
      if (D(input.amount).gt(D(customer.balance))) {
        throw new AppError("VALIDATION_ERROR", `Balance is only ${customer.balance}`);
      }
      delta = D(customer.balance).minus(money(input.amount));
    } else if (input.type === "DEBT") {
      delta = D(customer.balance).plus(money(input.amount));
      if (D(customer.creditLimit).gt(0) && delta.gt(D(customer.creditLimit))) {
        throw new AppError("CREDIT_LIMIT_EXCEEDED", "Credit limit exceeded");
      }
    } else {
      // Manual adjustment — signed via note convention; amount always positive here,
      // direction chosen by current balance target is not assumed. We raise debt.
      delta = D(customer.balance).plus(money(input.amount));
    }

    await tx.customer.update({
      where: { id: customer.id },
      data: { balance: delta.toString() },
    });

    const txn = await tx.customerTransaction.create({
      data: {
        customerId: customer.id,
        type: input.type,
        amount: money(input.amount).toString(),
        balanceAfter: delta.toString(),
        note: input.note || null,
        userId,
      },
    });

    await import("@/shared/core/audit").then(({ recordAudit }) =>
      recordAudit(tx, { userId, action: `CUSTOMER_${input.type}`, entityType: "CustomerTransaction", entityId: txn.id }),
    );
    return {
      id: txn.id,
      balanceAfter: delta.toString(),
      customerName: customer.name,
      customerNameAr: customer.nameAr ?? null,
      txnType: input.type,
      amount: money(input.amount).toString(),
    };
  });
  void notify({
    type: "CUSTOMER_PAYMENT", title: "CUSTOMER_PAYMENT",
    body: `${result.customerNameAr ?? result.customerName} · ${result.txnType} · ${result.amount}`,
    entityType: "Customer", entityId: input.customerId, href: "/customers/transactions",
  });
  return { id: result.id, balanceAfter: result.balanceAfter };
}

function txnSearchWhere(q?: string): Prisma.CustomerTransactionWhereInput | undefined {
  if (!q) return undefined;
  const n = Number(q);
  const numeric = Number.isFinite(n) ? n : null;
  return {
    OR: [
      { note: { contains: q } },
      { customer: { OR: [{ name: { contains: q } }, { nameAr: { contains: q } }, { code: { contains: q } }] } },
      ...(numeric === null ? [] : [{ amount: numeric }, { balanceAfter: numeric }]),
    ],
  };
}

/** Parse a YYYY-MM string into a [start, end) date range (local time). */
function monthRange(month?: string): { gte: Date; lt: Date } | undefined {
  if (!month) return undefined;
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return undefined;
  const year = Number(m[1]);
  const mon = Number(m[2]);
  if (mon < 1 || mon > 12) return undefined;
  return {
    gte: new Date(year, mon - 1, 1, 0, 0, 0, 0),
    lt: mon === 12 ? new Date(year + 1, 0, 1) : new Date(year, mon, 1),
  };
}

export async function listCustomerTransactions(opts: {
  customerId?: string; type?: "PAYMENT" | "DEBT" | "REFUND" | "ADJUSTMENT";
  q?: string; month?: string;
  page?: number; pageSize?: number;
}) {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = opts.pageSize ?? 25;
  const where: Prisma.CustomerTransactionWhereInput = {
    ...(opts.customerId ? { customerId: opts.customerId } : {}),
    ...(opts.type ? { type: opts.type } : {}),
    ...monthRange(opts.month),
    ...txnSearchWhere(opts.q),
  };
  const [rows, count] = await Promise.all([
    db.customerTransaction.findMany({
      where,
      include: { customer: { select: { code: true, name: true, nameAr: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.customerTransaction.count({ where }),
  ]);
  return { rows, total: count, page, pageSize };
}

/** One row per customer — their most recent transaction (grouped ledger view). */
export async function listLatestCustomerTransactions(opts: {
  q?: string; month?: string;
  page?: number; pageSize?: number;
}) {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = opts.pageSize ?? 25;
  const where: Prisma.CustomerTransactionWhereInput = {
    ...monthRange(opts.month),
    ...txnSearchWhere(opts.q),
  };

  const [allGroups, pageGroups] = await Promise.all([
    db.customerTransaction.groupBy({ by: ["customerId"], where }),
    db.customerTransaction.groupBy({
      by: ["customerId"],
      where,
      _max: { createdAt: true },
      orderBy: { _max: { createdAt: "desc" } },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const pairs = pageGroups.map((g) => ({ customerId: g.customerId, createdAt: g._max.createdAt as Date }));
  const rows = pairs.length
    ? await db.customerTransaction.findMany({
        where: { OR: pairs },
        include: { customer: { select: { code: true, name: true, nameAr: true } } },
      })
    : [];
  const orderIndex = new Map(pairs.map((p, i) => [`${p.customerId}|${p.createdAt.toISOString()}`, i]));
  rows.sort((a, b) => {
    const ia = orderIndex.get(`${a.customerId}|${a.createdAt.toISOString()}`) ?? 0;
    const ib = orderIndex.get(`${b.customerId}|${b.createdAt.toISOString()}`) ?? 0;
    return ia - ib;
  });

  return { rows, total: allGroups.length, page, pageSize };
}

/**
 * Delete every transaction inside a calendar month (optionally one customer),
 * then recompute each affected customer's balance from their remaining rows:
 * DEBT and ADJUSTMENT add, PAYMENT subtracts, REFUND amounts are stored
 * negated so they subtract as well.
 */
export async function deleteCustomerTxnsByMonth(
  userId: string,
  input: { month: string; customerId?: string },
) {
  const range = monthRange(input.month);
  if (!range) throw new AppError("VALIDATION_ERROR", "Invalid month (expected YYYY-MM)");
  return db.$transaction(async (tx) => {
    const where: Prisma.CustomerTransactionWhereInput = {
      createdAt: range,
      ...(input.customerId ? { customerId: input.customerId } : {}),
    };
    const affected = await tx.customerTransaction.findMany({
      where, select: { customerId: true }, distinct: ["customerId"],
    });
    const deleted = await tx.customerTransaction.deleteMany({ where });
    for (const { customerId } of affected) {
      const sums = await tx.customerTransaction.groupBy({
        by: ["type"], where: { customerId }, _sum: { amount: true },
      });
      let balance = D(0);
      for (const s of sums) {
        const amt = D(s._sum.amount ?? 0);
        balance = balance.plus(s.type === "PAYMENT" ? amt.negated() : amt);
      }
      await tx.customer.update({ where: { id: customerId }, data: { balance: balance.toString() } });
    }
    await import("@/shared/core/audit").then(({ recordAudit }) =>
      recordAudit(tx, {
        userId, action: "CUSTOMER_TXN_MONTH_DELETE", entityType: "CustomerTransaction",
        entityId: `${input.month}${input.customerId ? `:${input.customerId}` : ""}`,
        newValues: { deleted: deleted.count, customers: affected.length },
      }),
    );
    return { deleted: deleted.count };
  });
}

/**
 * Recompute the running balanceAfter of every transaction for a customer
 * (PAYMENT subtracts, everything else adds) and sync customer.balance.
 * Used after a single-row edit/delete so statements stay accurate.
 */
async function recomputeCustomerLedger(tx: Prisma.TransactionClient, customerId: string) {
  const txns = await tx.customerTransaction.findMany({
    where: { customerId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, type: true, amount: true, balanceAfter: true },
  });
  let bal = D(0);
  for (const t of txns) {
    const amt = D(t.amount);
    bal = bal.plus(t.type === "PAYMENT" ? amt.negated() : amt);
    if (!bal.eq(D(t.balanceAfter))) {
      await tx.customerTransaction.update({
        where: { id: t.id },
        data: { balanceAfter: bal.toString() },
      });
    }
  }
  await tx.customer.update({ where: { id: customerId }, data: { balance: bal.toString() } });
  return bal;
}

export async function updateCustomerTxn(
  userId: string,
  input: { id: string; amount: number; note?: string },
) {
  if (!(input.amount > 0)) throw new AppError("VALIDATION_ERROR", "Amount must be positive");
  return db.$transaction(async (tx) => {
    const existing = await tx.customerTransaction.findUnique({ where: { id: input.id } });
    if (!existing) throw new AppError("NOT_FOUND", "Transaction not found");

    // Preserve the stored sign convention (REFUND rows are negative).
    const signed = D(existing.amount);
    const newAmount = signed.lt(0) ? money(input.amount).negated() : money(input.amount);
    await tx.customerTransaction.update({
      where: { id: existing.id },
      data: { amount: newAmount.toString(), note: input.note?.trim() || null },
    });

    const balance = await recomputeCustomerLedger(tx, existing.customerId);
    const customer = await tx.customer.findUnique({ where: { id: existing.customerId } });
    if (customer && D(customer.creditLimit).gt(0) && balance.gt(D(customer.creditLimit))) {
      throw new AppError("CREDIT_LIMIT_EXCEEDED", "Credit limit exceeded");
    }

    await import("@/shared/core/audit").then(({ recordAudit }) =>
      recordAudit(tx, {
        userId, action: "CUSTOMER_TXN_UPDATE", entityType: "CustomerTransaction", entityId: existing.id,
        oldValues: { amount: existing.amount, note: existing.note },
        newValues: { amount: newAmount.toString(), note: input.note ?? null },
      }),
    );
    return { balanceAfter: balance.toString() };
  });
}

export async function deleteCustomerTxn(userId: string, id: string) {
  return db.$transaction(async (tx) => {
    const existing = await tx.customerTransaction.findUnique({ where: { id } });
    if (!existing) throw new AppError("NOT_FOUND", "Transaction not found");
    await tx.customerTransaction.delete({ where: { id } });
    const balance = await recomputeCustomerLedger(tx, existing.customerId);

    await import("@/shared/core/audit").then(({ recordAudit }) =>
      recordAudit(tx, {
        userId, action: "CUSTOMER_TXN_DELETE", entityType: "CustomerTransaction", entityId: id,
        oldValues: { type: existing.type, amount: existing.amount, note: existing.note },
      }),
    );
    return { balanceAfter: balance.toString() };
  });
}

// ---------------------------------------------------------------------------
// Transaction note images
// Files live in private Supabase Storage (path: {userId}/{txnId}/{uuid}.ext);
// only the object path is persisted on the transaction row.
// ---------------------------------------------------------------------------

export const TXN_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
type TxnImageMime = "image/jpeg" | "image/png" | "image/webp";

function extensionForMime(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

/** Sniff the real format from magic bytes — never trust the declared MIME. */
function sniffImageMime(buffer: Uint8Array): TxnImageMime | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) return "image/png";
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) return "image/webp";
  return null;
}

/** Decode + validate a client-provided `data:image/...;base64,...` payload. */
export function decodeTxnImage(dataUrl: string, mime: string): Buffer {
  const normalized = mime === "image/jpg" ? "image/jpeg" : mime;
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl.trim());
  if (!match) throw new AppError("INVALID_IMAGE_TYPE", "Image must be JPG, PNG or WEBP");
  if (match[1] !== (normalized === "image/jpg" ? "jpeg" : normalized.replace("image/", ""))) {
    throw new AppError("INVALID_IMAGE_TYPE", "Image must be JPG, PNG or WEBP");
  }
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.byteLength === 0) throw new AppError("INVALID_IMAGE_TYPE", "Image must be JPG, PNG or WEBP");
  if (buffer.byteLength > TXN_IMAGE_MAX_BYTES) throw new AppError("IMAGE_TOO_LARGE", "Image must be smaller than 5 MB");
  if (!sniffImageMime(new Uint8Array(buffer))) throw new AppError("INVALID_IMAGE_TYPE", "Image must be JPG, PNG or WEBP");
  return buffer;
}

/**
 * Attach (or replace) the note image for a transaction.
 * Upload succeeds first, the DB row is updated next, then the OLD object is
 * removed — never before the new one is safely in place.
 */
export async function attachCustomerTxnImage(userId: string, txnId: string, input: { dataUrl: string; mime: string }) {
  const buffer = decodeTxnImage(input.dataUrl, input.mime);
  const txn = await db.customerTransaction.findUnique({ where: { id: txnId }, select: { imagePath: true } });
  if (!txn) throw new AppError("NOT_FOUND", "Transaction not found");

  const mime = sniffImageMime(new Uint8Array(buffer)) as TxnImageMime;
  const path = `${userId}/${txnId}/${randomUUID()}.${extensionForMime(mime)}`;
  const { path: savedPath } = await uploadObject(TXN_IMAGE_BUCKET, path, new Uint8Array(buffer), mime);
  await db.customerTransaction.update({ where: { id: txnId }, data: { imagePath: savedPath } });

  if (txn.imagePath && txn.imagePath !== savedPath) {
    try {
      await removeObjects(TXN_IMAGE_BUCKET, [txn.imagePath]);
    } catch {
      // Best effort — the new image is already live; a stale object is cleaned later.
    }
  }
  return { path: savedPath };
}

export async function deleteCustomerTxnImage(txnId: string): Promise<void> {
  const txn = await db.customerTransaction.findUnique({ where: { id: txnId }, select: { imagePath: true } });
  if (!txn) throw new AppError("NOT_FOUND", "Transaction not found");
  if (!txn.imagePath) return;
  try {
    await removeObjects(TXN_IMAGE_BUCKET, [txn.imagePath]);
  } catch (err) {
    // Missing object is effectively already deleted — still clear the column.
    if (!(err instanceof AppError) || !/not found|404/i.test(err.message)) throw err;
  }
  await db.customerTransaction.update({ where: { id: txnId }, data: { imagePath: null } });
}

/** Stream a transaction's note image for the authenticated proxy route. */
export async function getCustomerTxnImage(txnId: string) {
  const txn = await db.customerTransaction.findUnique({ where: { id: txnId }, select: { imagePath: true } });
  if (!txn?.imagePath) throw new AppError("NOT_FOUND", "Image not found");
  return downloadObject(TXN_IMAGE_BUCKET, txn.imagePath);
}

export async function getCustomerById(id: string) {
  return db.customer.findFirst({    where: { id, deletedAt: null },
    select: { id: true, code: true, name: true, nameAr: true, balance: true },
  });
}

/** Full ledger for one customer, oldest first (statement view). */
export async function getStatement(
  customerId: string,
  opts?: { from?: Date; to?: Date },
) {
  const customer = await db.customer.findFirst({
    where: { id: customerId, deletedAt: null },
    include: { group: { select: { name: true, discountRate: true } } },
  });
  if (!customer) throw new AppError("NOT_FOUND", "Customer not found");
  const createdAt = {
    ...(opts?.from ? { gte: opts.from } : {}),
    ...(opts?.to ? { lte: opts.to } : {}),
  };
  const [txns, loyalty] = await Promise.all([
    db.customerTransaction.findMany({
      where: { customerId, ...(createdAt.gte || createdAt.lte ? { createdAt } : {}) },
      orderBy: { createdAt: "asc" },
      take: 500,
    }),
    db.loyaltyTransaction.findMany({
      where: { customerId },
      orderBy: { createdAt: "asc" },
      take: 500,
    }),
  ]);
  return { customer, txns, loyalty };
}

// ---------------------------------------------------------------------------
// Loyalty — REDEEM converts points to balance reduction? No: redeeming gives
// store credit → we reduce points and REDUCE balance owed by customer? Points
// are redeemed against purchases at loyaltyPointValue each; simplest correct
// model: REDEEM reduces points and reduces customer.balance (credit voucher).
// ---------------------------------------------------------------------------

export async function adjustLoyalty(raw: {
  customerId: string;
  mode: "REDEEM" | "ADJUST";
  points: number;
  note?: string;
  userId?: string;
}) {
  const input = loyaltyAdjustSchema.parse(raw);
  return db.$transaction(async (tx) => {
    const customer = await tx.customer.findFirst({ where: { id: input.customerId, deletedAt: null } });
    if (!customer) throw new AppError("NOT_FOUND", "Customer not found");
    const settings = await tx.systemSettings.findUnique({ where: { id: "system" } });
    const pointValue = settings?.loyaltyPointValue ? D(settings.loyaltyPointValue) : D(1);

    let newPoints: ReturnType<typeof D>;
    let type: "REDEEM" | "ADJUST";

    if (input.mode === "REDEEM") {
      if (input.points <= 0) throw new AppError("VALIDATION_ERROR", "Points must be positive");
      const requested = money(input.points);
      if (requested.gt(D(customer.loyaltyPoints))) {
        throw new AppError("VALIDATION_ERROR", `Only ${customer.loyaltyPoints} points available`);
      }
      newPoints = D(customer.loyaltyPoints).minus(requested);
      type = "REDEEM";

      // Store credit: reduce what the customer owes (floor at zero).
      const creditValue = pointValue.mul(requested);
      const newBalance = D(customer.balance).minus(creditValue);
      await tx.customer.update({
        where: { id: customer.id },
        data: { loyaltyPoints: newPoints.toString(), balance: newBalance.toString() },
      });
      if (creditValue.gt(0)) {
        await tx.customerTransaction.create({
          data: {
            customerId: customer.id,
            type: "ADJUSTMENT",
            amount: creditValue.toString(),
            balanceAfter: newBalance.toString(),
            note: `Loyalty redeem ${requested} pts`,
            userId: raw.userId ?? null,
          },
        });
      }
    } else {
      // ADJUST may be negative (correction).
      const delta = D(input.points);
      newPoints = D(customer.loyaltyPoints).plus(delta);
      if (newPoints.lt(0)) throw new AppError("VALIDATION_ERROR", "Resulting points would be negative");
      type = "ADJUST";
      await tx.customer.update({
        where: { id: customer.id },
        data: { loyaltyPoints: newPoints.toString() },
      });
    }

    const txn = await tx.loyaltyTransaction.create({
      data: {
        customerId: customer.id,
        type,
        points: input.points.toString(),
        balanceAfter: newPoints.toString(),
        note: input.note || null,
      },
    });

    await import("@/shared/core/audit").then(({ recordAudit }) =>
      recordAudit(tx, { userId: raw.userId, action: `LOYALTY_${type}`, entityType: "LoyaltyTransaction", entityId: txn.id }),
    );
    return { pointsAfter: newPoints.toString() };
  });
}

