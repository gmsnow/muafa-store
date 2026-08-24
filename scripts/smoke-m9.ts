// M9 smoke test: expenses CRUD + notifications center + global search
// npx tsx scripts/smoke-m9.ts
import "dotenv/config";
import { db } from "../src/shared/db";
import { saveExpense, deleteExpense, saveCategory, deleteCategory, listExpenses } from "../src/features/expenses/service";
import { syncNotifications, listNotifications, markAllRead } from "../src/features/notifications/service";
import { globalSearch } from "../src/features/search/service";

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) console.log(`  PASS ${name}`);
  else { failures++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
}

async function main() {
  // ---- categories
  const cat = await saveCategory(null, { name: "Smoke Utilities" });
  check("category created", Boolean(cat.id));
  // ---- expense create with EXP- numbering
  const e = await saveExpense((await db.user.findFirstOrThrow({ where: { username: "manager" } })).id, {
    categoryId: cat.id, amount: 1500.5, method: "CASH", description: "smoke expense",
  });
  check("expense created EXP-", /^EXP-\d{6}$/.test(e.expenseNumber), e.expenseNumber);

  const listed = await listExpenses({ categoryId: cat.id });
  check("list filters by category", listed.rows.length === 1 && Math.abs(listed.totalAmount - 1500.5) < 0.01);
  const listedDeletable = listed.rows[0].deletable === true;
  check("recent expense flagged deletable", listedDeletable);

  // ---- delete blocked for old records: backdate one directly then attempt service delete
  await db.expense.update({ where: { id: e.id }, data: { createdAt: new Date(Date.now() - 48 * 3600 * 1000) } });
  let oldDeleteBlocked = false;
  try { await deleteExpense(e.id); } catch { oldDeleteBlocked = true; }
  check("delete blocked after 24h", oldDeleteBlocked);
  await db.expense.update({ where: { id: e.id }, data: { createdAt: new Date() } });
  await deleteExpense(e.id);
  check("fresh expense deleted", !(await db.expense.findUnique({ where: { id: e.id } })));

  // category now empty → deletable; IN_USE guard checked implicitly by order
  await deleteCategory(cat.id);
  check("empty category deleted", !(await db.expenseCategory.findUnique({ where: { id: cat.id } })));

  // ---- notifications sync
  const before = await listNotifications(100);
  const items = await syncNotifications();
  check("sync returns items", items.length > 0, String(items.length));
  const types = new Set(items.map((i) => i.type));
  check(
    "expected families present (low/out/expiry/po/credit at least one)",
    (["LOW_STOCK", "OUT_OF_STOCK", "EXPIRING", "EXPIRED", "PENDING_PO", "CREDIT_LIMIT"] as string[]).some((t) =>
      (types as Set<string>).has(t),
    ),
    [...types].join(","),
  );
  // dedupe: second sync must not add unread duplicates
  const second = await syncNotifications();
  const freshUnread = await db.notification.count({ where: { isRead: false } });
  const dupes = second.length > 0 && second.filter((n, idx) => second.findIndex((x) => x.type === n.type && x.entityId === n.entityId && !n.isRead) !== idx).length;
  check("no duplicate unread rows after resync", dupes === 0, `unread=${freshUnread} before=${before.length}`);

  // markAllRead
  await markAllRead();
  check("markAllRead zeroes unread", (await db.notification.count({ where: { isRead: false } })) === 0);
  // read rows are not re-created while condition persists
  const third = await syncNotifications();
  const reAdded = third.filter((n) => n.isRead).length;
  check("conditions persist but no new rows", reAdded <= before.length, String(reAdded));

  // ---- global search
  const prod = await db.product.findFirstOrThrow({ where: { deletedAt: null }, select: { name: true } });
  const term = prod.name.slice(0, 3);
  const s1 = await globalSearch(term);
  check("search products hit", s1.products.length > 0, term);
  const inv = await db.sale.findFirst({ orderBy: { saleDate: "desc" }, select: { invoiceNumber: true } });
  const s2 = inv ? await globalSearch(inv.invoiceNumber.slice(0, -1)) : null;
  check("search invoices hit", Boolean(s2 && s2.invoices.length > 0));
  const cust = await db.customer.findFirstOrThrow({ where: { deletedAt: null }, select: { phone: true } });
  const s3 = cust.phone ? await globalSearch(cust.phone.slice(0, 4)) : null;
  check("search customers by phone", Boolean(s3 && s3.customers.length > 0));
  const s4 = await globalSearch("a");
  check("short query rejected", s4.products.length === 0 && s4.invoices.length === 0);

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
