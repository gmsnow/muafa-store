// Deduplicate customer transactions that were double-recorded before the
// idempotency guards landed (or by a retry that minted a fresh clientId, or
// a manual re-submit after a timed-out-but-committed request).
//
// A duplicate is a row whose closest earlier record for the SAME customer,
// type, amount, note and cashier was created within the dedupe window
// (default 60s — the same criteria the server applies). ONLY the duplicate is
// removed; the earliest row of each burst is kept, and balanceAfter chains +
// customer.balance are rebuilt for every affected customer.
//
// Filters (all optional, ANDed together):
//   --customer <code>    only the customer whose code matches (e.g. CUS-0031)
//   --amount <number>    only rows with that exact amount (e.g. 1600)
//   --since <ISO>        only rows created at/after that instant
//   --window <seconds>   duplicate window (default 60)
//
// Examples:
//   npx tsx scripts/dedupe-customer-txns.ts --customer CUS-0031 --amount 1600 --since 2026-09-20T23:30:00
//   npx tsx scripts/dedupe-customer-txns.ts --customer CUS-0031 --amount 1600 --since 2026-09-20T23:30:00 --apply
import "dotenv/config";
import { db } from "../src/shared/db";
import { D } from "../src/shared/core/money";
import type { CustomerTransaction } from "../src/generated/prisma/client";

function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const apply = process.argv.includes("--apply");
const customerCode = argValue("--customer");
const amountFilter = argValue("--amount");
const sinceRaw = argValue("--since");
const windowRaw = argValue("--window");
const DUP_WINDOW_MS = (windowRaw ? Number(windowRaw) : 60) * 1000;

function key(t: CustomerTransaction): string {
  return [t.customerId, t.type, String(t.amount), t.note ?? "", t.userId ?? ""].join("|");
}

async function main() {
  const customerId = customerCode
    ? (await db.customer.findFirst({ where: { code: customerCode }, select: { id: true } }))?.id
    : undefined;
  if (customerCode && !customerId) {
    console.error(`no customer with code "${customerCode}"`);
    process.exitCode = 1;
    return;
  }
  const sinceDate = sinceRaw ? new Date(sinceRaw) : undefined;
  if (sinceRaw && (!sinceDate || Number.isNaN(sinceDate.getTime()))) {
    console.error(`invalid --since "${sinceRaw}" (use ISO, e.g. 2026-09-20T23:30:00)`);
    process.exitCode = 1;
    return;
  }
  const amountVal = amountFilter !== undefined && amountFilter !== "" ? D(amountFilter) : undefined;
  if (amountVal && Number.isNaN(amountVal.toNumber())) {
    console.error(`invalid --amount "${amountFilter}"`);
    process.exitCode = 1;
    return;
  }

  const txns = await db.customerTransaction.findMany({
    where: {
      ...(customerId ? { customerId } : {}),
      ...(amountVal ? { amount: amountVal } : {}),
      ...(sinceDate ? { createdAt: { gte: sinceDate } } : {}),
    },
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
  console.log(`scanned ${txns.length} customer transactions (window ${DUP_WINDOW_MS / 1000}s)`);
  console.log(`duplicates found: ${toDelete.length} (across ${affected.size} customers)`);
  console.log(`duplicates carrying a note image (object will be orphaned): ${withImages}`);
  if (toDelete.length === 0) {
    console.log("nothing to do");
    return;
  }
  const sample = toDelete.slice(0, 20).map((t) => ({
    customer: customerCode ?? t.customerId,
    type: t.type,
    amount: String(t.amount),
    note: t.note,
    hasImage: Boolean(t.imagePath),
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
    for (const cid of affected) {
      const rows = await tx.customerTransaction.findMany({
        where: { customerId: cid },
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
      await tx.customer.update({ where: { id: cid }, data: { balance: bal.toString() } });
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