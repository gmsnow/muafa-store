// Customers/credit/loyalty smoke test (M7): npx tsx scripts/smoke-customers.ts
import "dotenv/config";
import { db } from "../src/shared/db";
import { AppError } from "../src/shared/core/api-response";
import {
  saveCustomer, softDeleteCustomer, saveGroup, deleteGroup,
  recordCustomerTxn, getStatement, adjustLoyalty,
} from "../src/features/customers/service";

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) console.log(`  PASS ${name}`);
  else { failures++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
}

async function main() {
  const user = await db.user.findFirstOrThrow({ where: { username: "manager" } });

  // ---- group
  const grp = await saveGroup(null, { name: "Smoke Group", discountRate: 5, priceMode: "retail" });
  check("group created", Boolean(grp.id), grp.name);

  // ---- customer create + code gen (member of the smoke group)
  const c = await saveCustomer(null, {
    name: "Smoke Customer", phone: "771234567",
    creditLimit: 1000, groupId: grp.id,
  }) as unknown as { id: string; code: string; balance: string; loyaltyPoints: string };
  check("customer created", /^CUS-\d{4}$/.test(c.code), c.code);
  check("balance starts 0", Number(c.balance) === 0);
  check("points start 0", Number(c.loyaltyPoints) === 0);

  // ---- DEBT raises balance
  const d1 = await recordCustomerTxn(user.id, { customerId: c.id, type: "DEBT", amount: 400 }) as { balanceAfter: string };
  check("DEBT balanceAfter=400", Number(d1.balanceAfter) === 400, d1.balanceAfter);

  // credit limit enforcement
  let limitHit = false;
  try { await recordCustomerTxn(user.id, { customerId: c.id, type: "DEBT", amount: 700 }); }
  catch (e) { limitHit = e instanceof AppError && e.code === "CREDIT_LIMIT_EXCEEDED"; }
  check("credit limit enforced", limitHit);

  // over-payment blocked
  let overPay = false;
  try { await recordCustomerTxn(user.id, { customerId: c.id, type: "PAYMENT", amount: 401 }); }
  catch { overPay = true; }
  check("over-payment blocked", overPay);

  // ---- PAYMENT lowers balance
  const p1 = await recordCustomerTxn(user.id, { customerId: c.id, type: "PAYMENT", amount: 150 }) as { balanceAfter: string };
  check("PAYMENT balanceAfter=250", Number(p1.balanceAfter) === 250, p1.balanceAfter);

  // ---- statement ordering oldest-first with correct running balances
  const stmt = await getStatement(c.id);
  check("statement has 2 txns", stmt.txns.length === 2, String(stmt.txns.length));
  check(
    "statement oldest-first + balance chain",
    stmt.txns[0].type === "DEBT" && Number(stmt.txns[0].balanceAfter) === 400 &&
      stmt.txns[1].type === "PAYMENT" && Number(stmt.txns[1].balanceAfter) === 250,
  );

  // ---- loyalty: grant then redeem
  await adjustLoyalty({ customerId: c.id, mode: "ADJUST", points: 120, userId: user.id });
  const afterAdj = await db.customer.findUniqueOrThrow({ where: { id: c.id } });
  check("ADJUST +120 pts", Number(afterAdj.loyaltyPoints) === 120, String(afterAdj.loyaltyPoints));

  // redeem more than owned blocked
  let overRedeem = false;
  try { await adjustLoyalty({ customerId: c.id, mode: "REDEEM", points: 121, userId: user.id }); }
  catch { overRedeem = true; }
  check("over-redeem blocked", overRedeem);

  // REDEEM converts to balance credit (pointValue from settings)
  const settings = await db.systemSettings.findUnique({ where: { id: "system" } });
  const pv = Number(settings?.loyaltyPointValue ?? 1);
  const r = await adjustLoyalty({ customerId: c.id, mode: "REDEEM", points: 50, userId: user.id }) as { pointsAfter: string };
  check("REDEEM pointsAfter=70", Number(r.pointsAfter) === 70, r.pointsAfter);
  const afterRedeem = await db.customer.findUniqueOrThrow({ where: { id: c.id } });
  const expectedBalance = 250 - 50 * pv;
  check(
    `REDEEM balance credited (${expectedBalance})`,
    Math.abs(Number(afterRedeem.balance) - expectedBalance) < 0.001,
    String(afterRedeem.balance),
  );
  const adjTxn = await db.customerTransaction.findFirst({
    where: { customerId: c.id, type: "ADJUSTMENT" },
    orderBy: { createdAt: "desc" },
  });
  check("redeem wrote ADJUSTMENT ledger row", Boolean(adjTxn), adjTxn?.note ?? "");

  // ---- soft delete blocked with outstanding balance; ok at zero
  let delBlocked = false;
  try { await softDeleteCustomer(c.id); } catch { delBlocked = true; }
  check("soft-delete blocked w/ balance", delBlocked);

  // zero out via payment
  await recordCustomerTxn(user.id, { customerId: c.id, type: "PAYMENT", amount: String(expectedBalance) });
  await softDeleteCustomer(c.id);
  const gone = await db.customer.findUnique({ where: { id: c.id } });
  check("soft-deleted at zero balance", Boolean(gone?.deletedAt));

  // ---- group delete blocked while (soft-deleted) member row still attached
  let groupInUse = false;
  try { await deleteGroup(grp.id); } catch { groupInUse = true; }
  check("group delete IN_USE while member exists", groupInUse);

  // cleanup: remove smoke artifacts; empty group now deletable
  await db.customerTransaction.deleteMany({ where: { customerId: c.id } });
  await db.loyaltyTransaction.deleteMany({ where: { customerId: c.id } });
  await db.auditLog.deleteMany({
    where: { OR: [
      { entityType: "CustomerTransaction" }, { entityType: "LoyaltyTransaction" },
    ] },
  });
  await db.customer.delete({ where: { id: c.id } });
  await deleteGroup(grp.id);
  check("group delete ok once empty", !(await db.customerGroup.findUnique({ where: { id: grp.id } })));

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
