import { db } from "@/shared/db";
import { D } from "@/shared/core/money";
import { assertValidClientId } from "@/shared/core/clientid";
import { ledgerDelta } from "./ledger";

/**
 * Scan every customer transaction for retry-duplicates (identical customer /
 * type / amount / note / cashier rows landing inside the dedupe window) and
 * purge them server-side: the earliest row of each burst is kept, deleted
 * rows' idempotency keys are tombstoned so a stale offline replay can never
 * resurrect them, and every affected ledger (balanceAfter chain + customer
 * balance) is rebuilt exactly.
 *
 * A second sweep removes resurrection rows: any live transaction whose
 * idempotency key is already tombstoned (a write-time guard was bypassed —
 * exactly what happened live for CUS-0004's second 1950) is purged
 * regardless of the window — the key itself proves it is a copy of a
 * deliberately removed operation.
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
    select: {
      id: true, customerId: true, type: true, amount: true, note: true, userId: true, clientId: true, createdAt: true,
    },
  });

  const clusters = new Map<string, (typeof txns)[number][]>();
  for (const t of txns) {
    const key = [t.customerId, t.type, String(t.amount), t.note ?? "", t.userId ?? ""].join("|");
    const list = clusters.get(key) ?? ([] as (typeof txns)[number][]);
    list.push(t);
    clusters.set(key, list);
  }

  const doomed = new Map<string, string>(); // txn id -> customerId
  for (const list of clusters.values()) {
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1];
      const cur = list[i];
      if (cur.createdAt.getTime() - prev.createdAt.getTime() <= windowMs) {
        doomed.set(cur.id, cur.customerId);
      }
    }
  }

  // Resurrection sweep: any live row whose key is tombstoned.
  const seals = await db.deletedKey.findMany({ select: { clientId: true } });
  if (seals.length > 0) {
    const resurrections = await db.customerTransaction.findMany({
      where: { clientId: { in: seals.map((s) => s.clientId) } },
      select: { id: true, customerId: true },
    });
    for (const r of resurrections) doomed.set(r.id, r.customerId);
  }

  if (doomed.size === 0) {
    return { scanned: txns.length, purged: 0, affectedCustomers: [] };
  }

  const toDelete = txns.filter((t) => doomed.has(t.id));
  const affected = [...new Set(doomed.values())];

  await db.$transaction(async (tx) => {
    for (const t of toDelete) {
      await tx.customerTransaction.delete({ where: { id: t.id } });
      if (t.clientId) {
        assertValidClientId(t.clientId);
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
        balance = balance.plus(ledgerDelta(r.type, r.amount));
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

  return { scanned: txns.length, purged: toDelete.length, affectedCustomers: affected };
}