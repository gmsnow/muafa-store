// Duplicate-guard smoke test (M-…): npx tsx scripts/smoke-dupe-guard.ts
//
// Simulates exactly the bug that produced 5× "auto-added" 1600 DEBT rows:
//   A) the SAME offline-outbox replay firing 3× with the same clientId
//   B) 3 near-identical submissions landing within 60s (with fresh keys)
//      — like a double-tap / retry-mints-new-key storm
// Asserts ONLY ONE ledger row is created in each case, then cleans up.
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { db } from "../src/shared/db";
import { saveCustomer, recordCustomerTxn, findCustomerTxnDuplicate, clearCustomerAccount, deleteCustomerTxn } from "../src/features/customers/service";
import { purgeDuplicateTxns } from "../src/features/customers/dedupe";
import { AppError } from "../src/shared/core/api-response";

const usedClientIds: string[] = [];

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) console.log(`  PASS ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main() {
  const user = await db.user.findFirstOrThrow();
  const customer = await saveCustomer(null, {
    name: "Dupe Guard Smoke", phone: "778888101", creditLimit: 0,
  });
  const customerId = (customer as unknown as { id: string }).id;

  try {
    // A — same clientId replayed (offline outbox retry storm).
    const keyA = randomUUID();
    usedClientIds.push(keyA);
    const payloadA = { customerId, type: "DEBT" as const, amount: 100, note: "smoke-same-key", clientId: keyA };
    const r1 = await recordCustomerTxn(user.id, payloadA);
    const r2 = await recordCustomerTxn(user.id, payloadA);
    const r3 = await recordCustomerTxn(user.id, payloadA);
    const countA = await db.customerTransaction.count({
      where: { customerId, amount: 100, note: "smoke-same-key" },
    });
    check("same clientId ×3 → one ledger row", countA === 1, `count=${countA}`);
    check("replays return the original id", r2.id === r1.id && r3.id === r1.id);

    // B — identical submissions with fresh keys within 60s (double-tap storm).
    for (let i = 0; i < 3; i++) {
      const k = randomUUID();
      usedClientIds.push(k);
      await recordCustomerTxn(user.id, {
        customerId, type: "DEBT", amount: 200, note: "smoke-burst", clientId: k,
      });
    }
    const countB = await db.customerTransaction.count({
      where: { customerId, amount: 200, note: "smoke-burst" },
    });
    check("fresh-key identical ×3 within 60s → one ledger row", countB === 1, `count=${countB}`);

    // CUS-0004 regression — an identical retry that lands MORE than a minute
    // later with a fresh key (the 1950 burst was 5.5/6 min apart) must still
    // resolve to the original row, thanks to the 6h horizon.
    await new Promise((r) => setTimeout(r, 75_000));
    const lateKey = randomUUID();
    usedClientIds.push(lateKey);
    await recordCustomerTxn(user.id, {
      customerId, type: "DEBT", amount: 200, note: "smoke-burst", clientId: lateKey,
    });
    const countLate = await db.customerTransaction.count({
      where: { customerId, amount: 200, note: "smoke-burst" },
    });
    check("fresh-key retry >60s later still one row", countLate === 1, `count=${countLate}`);

    // D — legacy outbox replay (queued BEFORE idempotency keys, so NO clientId)
    // fires days later. The replay path now asks "does an identical row exist?"
    // instead of indeling a fresh one — over any horizon, not just 60s.
    const legacyMatch = await findCustomerTxnDuplicate(user.id, {
      customerId, type: "DEBT", amount: 200, note: "smoke-burst",
    });
    check("legacy replay of a committed row is recognized", !!legacyMatch, `match=${legacyMatch?.id ?? "none"}`);

    // Distinct entry must still be created (guard must not over-block).
    await recordCustomerTxn(user.id, { customerId, type: "DEBT", amount: 55, note: "smoke-distinct" });
    const countC = await db.customerTransaction.count({
      where: { customerId, amount: 55, note: "smoke-distinct" },
    });
    check("distinct entry still records", countC === 1, `count=${countC}`);

    // F — resurrection guard (the CUS-0004 21:01 bug): a row whose clientId
    // was deliberately deleted (manual delete / dedupe purge / clear account)
    // is tombstoned. A stale offline replay carrying the SAME key later must
    // NOT create a fresh copy of the removed row.
    const tombKey = randomUUID();
    usedClientIds.push(tombKey);
    const fr = await recordCustomerTxn(user.id, {
      customerId, type: "DEBT", amount: 77, note: "smoke-tombstone", clientId: tombKey,
    });
    const countF0 = await db.customerTransaction.count({ where: { customerId, amount: 77 } });
    check("resurrection checkpoint: row exists first", countF0 === 1, `count=${countF0}`);
    await deleteCustomerTxn(user.id, fr.id);
    const sealed = await db.deletedKey.findUnique({ where: { clientId: tombKey } });
    check("delete seals the idempotency key", !!sealed, `sealed=${sealed?.reason ?? "none"}`);
    let threw = "";
    try {
      await recordCustomerTxn(user.id, {
        customerId, type: "DEBT", amount: 77, note: "smoke-tombstone", clientId: tombKey,
      });
    } catch (e) {
      threw = e instanceof AppError ? e.code : String((e as Error)?.message);
    }
    check("replaying a deleted key is rejected", threw === "DELETED_KEY", `threw=${threw}`);
    const countF = await db.customerTransaction.count({ where: { customerId, amount: 77 } });
    check("deleted txn is not resurrected", countF === 0, `count=${countF}`);

    // G — daily guard cron: purgeDuplicateTxns scans ALL customers and deletes
    // retry-duplicates (the same work /api/cron/duplicate-guard runs nightly).
    // Seeded with raw rows that bypass the app guards to emulate dupes.
    const cronKeys = [0, 1, 2].map(() => randomUUID());
    usedClientIds.push(...cronKeys);
    await db.customerTransaction.createMany({
      data: cronKeys.map((key, i) => ({
        customerId, type: "DEBT" as const, amount: 88, note: "smoke-cron", userId: user.id,
        balanceAfter: (88 * (i + 1)).toFixed(2), clientId: key,
        createdAt: new Date(Date.now() - (2 - i) * 5 * 60 * 1000),
      })),
    });
    const cronResult = await purgeDuplicateTxns();
    const cronLeft = await db.customerTransaction.count({ where: { customerId, amount: 88, note: "smoke-cron" } });
    const cronCust = await db.customer.findUnique({ where: { id: customerId }, select: { balance: true } });
    const cronSealed = await db.deletedKey.count({ where: { clientId: { in: cronKeys } } });
    check("daily guard purges retry-duplicates", cronResult.purged === 2, `purged=${cronResult.purged}`);
    check("only the earliest row survives purge", cronLeft === 1, `left=${cronLeft}`);
    // Rebuilt ledger = every remaining row for this customer (A 100 + B 200 + C 55 + G 88).
    check("ledger rebuilt after purge", cronCust?.balance.toString() === "443", `balance=${cronCust?.balance}`);
    check("purged keys are sealed", cronSealed === 2, `sealed=${cronSealed}`);

    // H — resurrection sweep (the live CUS-0004 hole): a row that already
    // exists while its key is tombstoned means a write-time guard was
    // bypassed. The nightly scan must remove it REGARDLESS of the 6h window —
    // the key itself proves it is a copy of a deliberately removed operation.
    const resKey = randomUUID();
    usedClientIds.push(resKey);
    await db.deletedKey.upsert({
      where: { clientId: resKey },
      create: { clientId: resKey, reason: "smoke-seal" },
      update: {},
    });
    await db.customerTransaction.createMany({
      data: [{
        customerId, type: "DEBT" as const, amount: 99, note: "smoke-resurrect", userId: user.id,
        balanceAfter: "999", clientId: resKey, createdAt: new Date(),
      }],
    });
    const resResult = await purgeDuplicateTxns();
    const resLeft = await db.customerTransaction.count({ where: { customerId, amount: 99, note: "smoke-resurrect" } });
    check("nightly scan purges a row whose key is tombstoned", resLeft === 0, `left=${resLeft}`);
    check("resurrection purge counted in the result", resResult.purged >= 1, `purged=${resResult.purged}`);
    const resCust = await db.customer.findUnique({ where: { id: customerId }, select: { balance: true } });
    check("ledger rebuilt after resurrection purge", resCust?.balance.toString() === "443", `balance=${resCust?.balance}`);

    // E — تصفية الحساب: clear account deletes ALL txns and zeroes the balance.
    const clear = await clearCustomerAccount(user.id, customerId);
    const afterClear = await db.customerTransaction.count({ where: { customerId } });
    const clearedCust = await db.customer.findUnique({ where: { id: customerId }, select: { balance: true } });
    check("clear account deletes every txn", clear.deleted === 4 && afterClear === 0, `deleted=${clear.deleted} left=${afterClear}`);
    check("clear account zeroes balance", clearedCust?.balance.toString() === "0", `balance=${clearedCust?.balance}`);
  } finally {
    // Leave no trace in the target DB.
    await db.customerTransaction.deleteMany({ where: { customerId } });
    await db.deletedKey.deleteMany({ where: { clientId: { in: usedClientIds } } });
    await db.customer.deleteMany({ where: { id: customerId } });
  }

  console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURES`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
}).finally(() => db.$disconnect());