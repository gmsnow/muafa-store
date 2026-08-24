// Reports smoke test (M8): npx tsx scripts/smoke-reports.ts
// Validates report services against INDEPENDENT raw-SQL cross-checks.
import "dotenv/config";
import { db } from "../src/shared/db";
import { parseReportRange } from "../src/features/reports/schema";
import {
  salesSummary, profitReport, inventoryValuation, customersReport,
  suppliersReport, expensesReport, financialSummary, exportReportCsv,
} from "../src/features/reports/service";

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) console.log(`  PASS ${name}`);
  else { failures++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
}
const close = (a: number, b: number) => Math.abs(a - b) < 0.01;

async function main() {
  // Range covering all seed data (seed generated sales across recent dates).
  const range = parseReportRange({ from: "2026-01-01", to: "2026-12-31" });

  // ---- independent raw SQL ground truth
  const [salesTruth, returnsTruth, expTruth] = await db.$transaction([
    db.$queryRaw<{ gross: string; cogs: string }[]>`
      SELECT COALESCE(SUM("total"),0)::text AS gross,
             COALESCE(SUM("costTotal"),0)::text AS cogs
      FROM sales WHERE "saleDate" >= ${range.from} AND "saleDate" < ${range.to}
        AND status IN ('COMPLETED','PARTIALLY_REFUNDED')`,
    db.$queryRaw<{ total: string; cost: string }[]>`
      SELECT COALESCE(SUM("total"),0)::text AS total, COALESCE(SUM("costTotal"),0)::text AS cost
      FROM sale_returns WHERE "returnDate" >= ${range.from} AND "returnDate" < ${range.to}`,
    db.$queryRaw<{ total: string }[]>`
      SELECT COALESCE(SUM("amount"),0)::text AS total
      FROM expenses WHERE "expenseDate" >= ${range.from} AND "expenseDate" < ${range.to}`,
  ]);
  const tGross = parseFloat(salesTruth[0].gross);
  const tCogs = parseFloat(salesTruth[0].cogs);
  const tRetTotal = parseFloat(returnsTruth[0].total);
  const tRetCost = parseFloat(returnsTruth[0].cost);
  const tExp = parseFloat(expTruth[0].total);

  // ---- sales summary vs truth
  const s = await salesSummary(range);
  check("sales.grossSales", close(s.grossSales, tGross), `${s.grossSales} vs ${tGross}`);
  check("sales.returns", close(s.returnsTotal, tRetTotal));
  check("sales.netSales formula", close(s.netSales, tGross - tRetTotal));

  // ---- profit identity + truth
  const p = await profitReport(range);
  const expectedCogs = Math.max(0, tCogs - tRetCost);
  check("profit.cogs", close(p.cogs, expectedCogs), `${p.cogs} vs ${expectedCogs}`);
  check("profit.grossProfit identity", close(p.grossProfit, p.netSales - p.cogs));
  check("profit.expenses", close(p.expenses, tExp));
  check("profit.netProfit identity", close(p.netProfit, p.grossProfit - p.expenses));

  // ---- inventory valuation vs independent SQL (qty × product.costPrice)
  const invTruth = await db.$queryRaw<{ stock: string; retail: string }[]>`
    SELECT COALESCE(SUM(i.quantity * p."costPrice"),0)::text AS stock,
           COALESCE(SUM(i.quantity * p."sellingPrice"),0)::text AS retail
    FROM products p LEFT JOIN inventory i ON i."productId" = p.id
    WHERE p."deletedAt" IS NULL`;
  const inv = await inventoryValuation();
  check(
    "inventory.stockValue",
    close(inv.totals.stockValue, parseFloat(invTruth[0].stock)),
    `${inv.totals.stockValue} vs ${invTruth[0].stock}`,
  );
  check("inventory.retailValue", close(inv.totals.retailValue, parseFloat(invTruth[0].retail)));

  // ---- receivables / payables vs SQL
  const recTruth = await db.$queryRaw<{ v: string }[]>`SELECT COALESCE(SUM(balance),0)::text AS v FROM customers WHERE "deletedAt" IS NULL AND balance > 0`;
  const payTruth = await db.$queryRaw<{ v: string }[]>`SELECT COALESCE(SUM(balance),0)::text AS v FROM suppliers WHERE "deletedAt" IS NULL AND balance > 0`;
  const cust = await customersReport(range);
  const sup = await suppliersReport(range);
  check("customers.receivables", close(cust.totals.receivables, parseFloat(recTruth[0].v)));
  check("suppliers.payables", close(sup.totals.payables, parseFloat(payTruth[0].v)));

  // ---- expenses report grand total matches expense truth
  const ex = await expensesReport(range);
  check("expenses.grandTotal", close(ex.grandTotal, tExp));

  // ---- financial summary consistency with components
  const fin = await financialSummary(range);
  check("summary.netProfit", close(fin.profit.netProfit, p.netProfit));
  check("summary.receivables", close(fin.receivables, cust.totals.receivables));
  check("summary.payables", close(fin.payables, sup.totals.payables));

  // ---- empty future range → zeros, no NaN
  const emptyRange = parseReportRange({ from: "2099-01-01", to: "2099-01-02" });
  const es = await salesSummary(emptyRange);
  const ep = await profitReport(emptyRange);
  check(
    "empty range zeros",
    es.invoices === 0 && es.netSales === 0 && ep.netProfit === 0 &&
      Number.isFinite(ep.marginPercent) && ep.monthly.every((m) => Number.isFinite(m.netProfit)),
    JSON.stringify({ inv: es.invoices, ns: es.netSales, np: ep.netProfit }),
  );

  // ---- CSV exports produce headers for all families
  for (const family of ["sales", "purchases", "profit", "inventory", "customers", "suppliers", "expenses"]) {
    const csv = await exportReportCsv(family, range);
    check(`csv:${family}`, typeof csv === "string" && csv.length > 10 && csv.split("\n")[0].includes(","));
  }

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
