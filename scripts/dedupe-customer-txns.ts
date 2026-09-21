// Deduplicate customer transactions that were double-recorded before the
// idempotency guards landed (or by a retry that minted a fresh clientId).
//
// A duplicate is a row whose closest earlier record for the SAME customer,
// type, amount, note and cashier was created within the last minute — exactly
// the criteria the server dedupe uses to swallow retries.
//
// Dry-run by default (prints what WOULD be removed, touches nothing):
//   npx tsx scripts/dedupe-customer-txns.ts
//
// Apply against the target DB (Vercel: `vercel env pull .env.local` first):
//   npx tsx scripts/dedupe-customer-txns.ts --apply
//
// The earliest row of each identical burst is kept; balanceAfter chains and
// customer.balance are rebuilt for every affected customer (same convention
// as recomputeCustomerLedger).
import "dotenv/config";
import { db } from "../src/shared/db";
import { D } from "../src/shared/core/money";
import type { CustomerTransaction } from "../src/generated/prisma/client";

const DUP_WINDOW_MS = 60_000;
const apply = process.argv.includes("--apply");

function key(t: CustomerTransaction): string {
  return [t.customerId, t.type, String(t.amount), t.note ?? "", t.userId ?? ""].join("|");
}

async function main() {
  const txns = await db.customerTransaction.findMany({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  const clusters = new Map<string, CustomerTransaction[]>();
  for (const t of txns) {
    const k = key(t);
    const list = clusters.get(k) ?? [];
    list.push(t);
    clusters.set(k, list);
  }

  const toDelete: CustomerTransaction[] = [];
  const affected = new Set<string>();
  for (const list of clusters.values()) {
    if (list.length < 2) continue;
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1];
      const cur = list[i];
      if (cur.createdAt.getTime() - prev.createdAt.getTime() <= DUP_WINDOW_MS) {
        toDelete.push(cur);
        affected.add(cur.customerId);
      }
    }
  }

  const withImages = toDelete.filter((t) => t.imagePath).length;
  console.log(`scanned ${txns.length} customer transactions`);
  console.log(`duplicates found: ${toDelete.length} (across ${affected.size} customers)`);
  console.log(`duplicates carrying a note image (object will be orphaned): ${withImages}`);
  if (toDelete.length === 0) {
    console.log("nothing to do");
    return;
  }
  const sample = toDelete.slice(0, 20).map((t) => ({
    id: t.id,
    customerId: t.customerId,
    type: t.type,
    amount: String(t.amount),
    note: t.note,
    createdAt: t.createdAt.toISOString(),
  }));
  console.table(sample);

  if (!apply) {
    console.log("dry run — nothing changed. Re-run with --apply to delete.");
    return;
  }

  await db.$transaction(async (tx) => {
    for (const t of toDelete) {
      await tx.customerTransaction.delete({ where: { id: t.id } });
    }
    for (const customerId of affected) {
      const rows = await tx.customerTransaction.findMany({
        where: { customerId },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true, type: true, amount: true, balanceAfter: true },
      });
      let bal = D(0);
      for (const r of rows) {
        const amt = D(r.amount);
        bal = bal.plus(r.type === "PAYMENT" ? amt.negated() : amt);
        if (!bal.eq(D(r.balanceAfter))) {
          await tx.customerTransaction.update({
            where: { id: r.id },
            data: { balanceAfter: bal.toString() },
          });
        }
      }
      await tx.customer.update({ where: { id: customerId }, data: { balance: bal.toString() } });
    }
  });

  console.log(`deleted ${toDelete.length} duplicate rows and rebuilt ${affected.size} ledgers`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());