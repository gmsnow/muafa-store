import { db } from "@/shared/db";
import { D } from "@/shared/core/money";
import type { CustomerTransaction } from "@/generated/prisma/client";

/**
 * Scan every customer transaction for retry-duplicates (identical customer /
 * type / amount / note / cashier rows landing inside the dedupe window) and
 * purge them server-side: the earliest row of each burst is kept, deleted
 * rows' idempotency keys are tombstoned so a stale offline replay can never
 * resurrect them, and every affected ledger (balanceAfter chain + customer
 * balance) is rebuilt exactly.
 */
export interface DuplicateGuardResult {
  scanned: number;
  purged: number;
  affectedCustomers: string[];
}

export async function purgeDuplicateTxns(
  windowMs = 6 * 60 * 60 * 1000,
): Promise<DuplicateGuardResult> {
  const txns = await db.customerTransaction.findMany({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  const clusters = new Map<string, CustomerTransaction[]>();
  for (const t of txns) {
    const key = [t.customerId, t.type, String(t.amount), t.note ?? "", t.userId ?? ""].join("|");
    const list = clusters.get(key) ?? [];
    list.push(t);
    clusters.set(key, list);
  }

  const toDelete: CustomerTransaction[] = [];
  const affected = new Set<string>();
  for (const list of clusters.values()) {
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1];
      const cur = list[i];
      if (cur.createdAt.getTime() - prev.createdAt.getTime() <= windowMs) {
        toDelete.push(cur);
        affected.add(cur.customerId);
      }
    }
  }

  if (toDelete.length === 0) {
    return { scanned: txns.length, purged: 0, affectedCustomers: [] };
  }

  await db.$transaction(async (tx) => {
    for (const t of toDelete) {
      await tx.customerTransaction.delete({ where: { id: t.id } });
      if (t.clientId) {
        await tx.deletedKey.upsert({
          where: { clientId: t.clientId },
          create: { clientId: t.clientId, reason: "cron-dupe-purge" },
          update: {},
        });
      }
    }

    // Rebuild every affected ledger the same way deleteCustomerTxn does.
    for (const customerId of affected) {
      const rows = await tx.customerTransaction.findMany({
        where: { customerId },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true, type: true, amount: true, balanceAfter: true },
      });
      let balance = D(0);
      for (const r of rows) {
        const amt = D(r.amount);
        balance = balance.plus(r.type === "PAYMENT" ? amt.negated() : amt);
        if (!balance.eq(D(r.balanceAfter))) {
          await tx.customerTransaction.update({
            where: { id: r.id },
            data: { balanceAfter: balance.toString() },
          });
        }
      }
      await tx.customer.update({ where: { id: customerId }, data: { balance: balance.toString() } });
    }
  });

  return { scanned: txns.length, purged: toDelete.length, affectedCustomers: [...affected] };
}