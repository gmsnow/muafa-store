import "server-only";
import ExcelJS from "exceljs";
import { db } from "@/shared/db";
import { money } from "@/shared/core/money";
import { dict, type Dictionary } from "@/shared/i18n";
import type { ReportRange } from "./schema";

/**
 * Financial formulas (authoritative — PROJECT_MAP §Financial formulas, spec §24/§25):
 * - Gross Sales      = Σ sale.total (COMPLETED + PARTIALLY_REFUNDED)
 * - Returns          = Σ sale_returns.total (returnDate in range)
 * - Net Sales        = Gross Sales − Returns
 * - COGS (net)       = Σ sale.costTotal − Σ sale_returns.costTotal
 * - Gross Profit     = Net Sales − COGS
 * - Operating Exp    = Σ expenses.amount (expenseDate in range)
 * - Net Profit       = Gross Profit − Operating Expenses
 * - Inventory Value  = Σ(inventory.qty × product.costPrice)
 */

const ACTIVE_SALES = ["COMPLETED", "PARTIALLY_REFUNDED"] as const;
const n2 = (x: unknown): number => money(Number.isFinite(Number(x)) ? Number(x) : 0).toNumber();
const dayKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// ---------------------------------------------------------------------------
// SALES REPORT
// ---------------------------------------------------------------------------

export interface SalesSummary {
  invoices: number;
  grossSales: number;
  returnsTotal: number;
  netSales: number;
  netSalesExTax: number;
  outputTax: number;
  discounts: number;
  cogs: number;
  avgTicket: number;
}

export async function salesSummary(range: ReportRange): Promise<SalesSummary> {
  const [agg, returnsAgg] = await Promise.all([
    db.sale.aggregate({
      _sum: {
        total: true, costTotal: true, taxTotal: true,
        itemDiscountTotal: true, invoiceDiscount: true,
      },
      _count: true,
      where: { saleDate: { gte: range.from, lt: range.to }, status: { in: [...ACTIVE_SALES] } },
    }),
    db.saleReturn.aggregate({
      _sum: { total: true, costTotal: true },
      where: { returnDate: { gte: range.from, lt: range.to } },
    }),
  ]);
  const gross = n2(agg._sum?.total);
  const returnsTotal = n2(returnsAgg._sum?.total);
  const netCogs = Math.max(0, n2(agg._sum?.costTotal) - n2(returnsAgg._sum?.costTotal));
  const invoices = agg._count ?? 0;
  const netSales = money(gross - returnsTotal).toNumber();
  const outputTax = n2(agg._sum?.taxTotal);
  return {
    invoices,
    grossSales: gross,
    returnsTotal,
    netSales,
    netSalesExTax: money(netSales - outputTax).toNumber(),
    outputTax,
    discounts: money(n2(agg._sum?.itemDiscountTotal) + n2(agg._sum?.invoiceDiscount)).toNumber(),
    cogs: netCogs,
    avgTicket: invoices > 0 ? money(netSales / invoices).toNumber() : 0,
  };
}

export interface DayBucket {
  day: string;
  revenue: number;
  cost: number;
  profit: number;
}

export async function salesDailyBuckets(range: ReportRange): Promise<DayBucket[]> {
  const rows = await db.$queryRaw<{ bucket: Date; revenue: string; cost: string }[]>`
    SELECT date_trunc('day', s."saleDate") AS bucket,
           COALESCE(SUM(s."total" - s."refundedAmount"), 0) AS revenue,
           COALESCE(SUM(s."costTotal"), 0) AS cost
    FROM sales s
    WHERE s."saleDate" >= ${range.from} AND s."saleDate" < ${range.to}
      AND s.status IN ('COMPLETED', 'PARTIALLY_REFUNDED')
    GROUP BY bucket ORDER BY bucket ASC`;
  return rows.map((r) => {
    const revenue = n2(r.revenue);
    const cost = n2(r.cost);
    const d = new Date(r.bucket);
    return { day: dayKey(d), revenue, cost, profit: money(revenue - cost).toNumber() };
  });
}

export interface NamedAmountRow {
  id: string;
  name: string;
  nameAr: string | null;
  qty: number;
  total: number;
}

export async function salesByCashier(range: ReportRange): Promise<NamedAmountRow[]> {
  const rows = await db.$queryRaw<{ id: string; name: string; name_ar: string | null; cnt: string; total: string }[]>`
    SELECT u.id, u."fullName" AS name, u."fullNameAr" AS name_ar,
           COUNT(*)::text AS cnt, COALESCE(SUM(s."total" - s."refundedAmount"), 0)::text AS total
    FROM sales s JOIN users u ON u.id = s."cashierId"
    WHERE s."saleDate" >= ${range.from} AND s."saleDate" < ${range.to}
      AND s.status IN ('COMPLETED', 'PARTIALLY_REFUNDED')
    GROUP BY u.id, u."fullName", u."fullNameAr"
    ORDER BY total DESC`;
  return rows.map((r) => ({
    id: r.id, name: r.name, nameAr: r.name_ar,
    qty: parseInt(r.cnt, 10), total: n2(r.total),
  }));
}

export async function topProducts(range: ReportRange, limit = 20): Promise<(NamedAmountRow & { profit: number })[]> {
  const rows = await db.$queryRaw<{ id: string; name: string; name_ar: string | null; qty: string; total: string; profit: string }[]>`
    SELECT p.id, p.name, p."nameAr" AS name_ar,
           SUM(si.quantity)::text AS qty,
           SUM(si."lineTotal")::text AS total,
           SUM(si."lineTotal" - si.quantity * si."costPrice")::text AS profit
    FROM sale_items si
    JOIN sales s ON s.id = si."saleId"
    JOIN products p ON p.id = si."productId"
    WHERE s."saleDate" >= ${range.from} AND s."saleDate" < ${range.to}
      AND s.status IN ('COMPLETED', 'PARTIALLY_REFUNDED')
    GROUP BY p.id, p.name, p."nameAr"
    ORDER BY total DESC LIMIT ${limit}`;
  return rows.map((r) => ({
    id: r.id, name: r.name, nameAr: r.name_ar,
    qty: n2(r.qty), total: n2(r.total), profit: n2(r.profit),
  }));
}

export async function salesReport(range: ReportRange) {
  const [summary, buckets, byCashier, products] = await Promise.all([
    salesSummary(range), salesDailyBuckets(range), salesByCashier(range), topProducts(range),
  ]);
  return { summary, buckets, byCashier, products };
}

// ---------------------------------------------------------------------------
// PURCHASES REPORT
// ---------------------------------------------------------------------------

export interface PurchasesSummary {
  docs: number;
  gross: number;
  discounts: number;
  paid: number;
  due: number;
  inputTax: number;
  returnsTotal: number;
}

export async function purchasesReport(range: ReportRange) {
  const [agg, retAgg, buckets, bySupplier] = await Promise.all([
    db.purchase.aggregate({
      _sum: { total: true, discountTotal: true, paidAmount: true, dueAmount: true, taxTotal: true },
      _count: true,
      where: { date: { gte: range.from, lt: range.to } },
    }),
    db.purchaseReturn.aggregate({
      _sum: { total: true },
      where: { date: { gte: range.from, lt: range.to } },
    }),
    db.$queryRaw<{ bucket: Date; total: string }[]>`
      SELECT date_trunc('day', p."date") AS bucket, COALESCE(SUM(p."total"), 0) AS total
      FROM purchases p
      WHERE p."date" >= ${range.from} AND p."date" < ${range.to}
      GROUP BY bucket ORDER BY bucket ASC`,
    db.$queryRaw<{ id: string; name: string; name_ar: string | null; cnt: string; total: string }[]>`
      SELECT sup.id, sup.name, sup."nameAr" AS name_ar,
             COUNT(*)::text AS cnt, COALESCE(SUM(p."total"), 0)::text AS total
      FROM purchases p JOIN suppliers sup ON sup.id = p."supplierId"
      WHERE p."date" >= ${range.from} AND p."date" < ${range.to}
      GROUP BY sup.id, sup.name, sup."nameAr"
      ORDER BY total DESC`,
  ]);
  const summary: PurchasesSummary = {
    docs: agg._count ?? 0,
    gross: n2(agg._sum?.total),
    discounts: n2(agg._sum?.discountTotal),
    paid: n2(agg._sum?.paidAmount),
    due: n2(agg._sum?.dueAmount),
    inputTax: n2(agg._sum?.taxTotal),
    returnsTotal: n2(retAgg._sum?.total),
  };
  return {
    summary,
    buckets: buckets.map((b) => ({ day: dayKey(new Date(b.bucket)), total: n2(b.total) })),
    bySupplier: bySupplier.map((r) => ({
      id: r.id, name: r.name, nameAr: r.name_ar, qty: parseInt(r.cnt, 10), total: n2(r.total),
    })),
  };
}

// ---------------------------------------------------------------------------
// PROFIT REPORT (§25 financial summary core)
// ---------------------------------------------------------------------------

export interface ProfitReport {
  netSales: number;
  netSalesExTax: number;
  cogs: number;
  grossProfit: number;
  expenses: number;
  netProfit: number;
  marginPercent: number;
  monthly: { month: string; sales: number; cogs: number; grossProfit: number; expenses: number; netProfit: number }[];
}

export async function profitReport(range: ReportRange): Promise<ProfitReport> {
  const [salesAgg, retAgg, expAgg, monthly] = await Promise.all([
    db.sale.aggregate({
      _sum: { total: true, costTotal: true, taxTotal: true },
      where: { saleDate: { gte: range.from, lt: range.to }, status: { in: [...ACTIVE_SALES] } },
    }),
    db.saleReturn.aggregate({
      _sum: { total: true, costTotal: true },
      where: { returnDate: { gte: range.from, lt: range.to } },
    }),
    db.expense.aggregate({
      _sum: { amount: true },
      where: { expenseDate: { gte: range.from, lt: range.to } },
    }),
    db.$queryRaw<{ bucket: Date; sales: string; cogs: string; returns: string; ret_cogs: string; tax: string; expenses: string }[]>`
      WITH m AS (SELECT date_trunc('month', d) AS bucket FROM generate_series(${range.from}::timestamp, ${range.to}::timestamp, '1 month') d)
      SELECT m.bucket,
        COALESCE((SELECT SUM(s."total") FROM sales s
          WHERE date_trunc('month', s."saleDate") = m.bucket AND s.status IN ('COMPLETED','PARTIALLY_REFUNDED')), 0)::text AS sales,
        COALESCE((SELECT SUM(s."costTotal") FROM sales s
          WHERE date_trunc('month', s."saleDate") = m.bucket AND s.status IN ('COMPLETED','PARTIALLY_REFUNDED')), 0)::text AS cogs,
        COALESCE((SELECT SUM(sr."total") FROM sale_returns sr
          WHERE date_trunc('month', sr."returnDate") = m.bucket), 0)::text AS returns,
        COALESCE((SELECT SUM(sr."costTotal") FROM sale_returns sr
          WHERE date_trunc('month', sr."returnDate") = m.bucket), 0)::text AS ret_cogs,
        COALESCE((SELECT SUM(s."taxTotal") FROM sales s
          WHERE date_trunc('month', s."saleDate") = m.bucket AND s.status IN ('COMPLETED','PARTIALLY_REFUNDED')), 0)::text AS tax,
        COALESCE((SELECT SUM(e."amount") FROM expenses e
          WHERE date_trunc('month', e."expenseDate") = m.bucket), 0)::text AS expenses
      FROM m ORDER BY m.bucket ASC`,
  ]);

  const returnsTotal = n2(retAgg._sum?.total);
  const netCogs = Math.max(0, n2(salesAgg._sum?.costTotal) - n2(retAgg._sum?.costTotal));
  const netSales = money(n2(salesAgg._sum?.total) - returnsTotal).toNumber();
  const salesTax = n2(salesAgg._sum?.taxTotal);
  const netSalesExTax = money(netSales - salesTax).toNumber();
  const grossProfit = money(netSalesExTax - netCogs).toNumber();
  const expenses = n2(expAgg._sum?.amount);

  return {
    netSales,
    netSalesExTax,
    cogs: netCogs,
    grossProfit,
    expenses,
    netProfit: money(grossProfit - expenses).toNumber(),
    marginPercent: netSales > 0 ? money((grossProfit / netSales) * 100).toNumber() : 0,
    monthly: monthly.map((m) => {
      const sales = n2(m.sales) - n2(m.returns) - n2(m.tax);
      const cogs = Math.max(0, n2(m.cogs) - n2(m.ret_cogs));
      const gp = money(sales - cogs).toNumber();
      const ex = n2(m.expenses);
      return {
        month: String(m.bucket).slice(0, 7),
        sales: money(sales).toNumber(), cogs,
        grossProfit: gp, expenses: ex,
        netProfit: money(gp - ex).toNumber(),
      };
    }),
  };
}


// ---------------------------------------------------------------------------
// TAX REPORT (VAT position) - output (sales) vs input (purchases)
// ---------------------------------------------------------------------------

export interface TaxMonthRow {
  month: string;
  output: number;
  input: number;
  net: number;
}

export async function taxReport(range: ReportRange) {
  const [outRows, inRows] = await Promise.all([
    db.$queryRaw<{ bucket: Date; total: string }[]>`
      SELECT date_trunc('month', s."saleDate") AS bucket, COALESCE(SUM(s."taxTotal"), 0) AS total
      FROM sales s
      WHERE s."saleDate" >= ${range.from} AND s."saleDate" < ${range.to}
        AND s.status IN ('COMPLETED','PARTIALLY_REFUNDED')
      GROUP BY bucket ORDER BY bucket ASC`,
    db.$queryRaw<{ bucket: Date; total: string }[]>`
      SELECT date_trunc('month', p."date") AS bucket, COALESCE(SUM(p."taxTotal"), 0) AS total
      FROM purchases p
      WHERE p."date" >= ${range.from} AND p."date" < ${range.to}
      GROUP BY bucket ORDER BY bucket ASC`,
  ]);
  const byMonth = new Map<string, { output: number; input: number }>();
  for (const r of outRows) {
    const k = dayKey(new Date(r.bucket)).slice(0, 7);
    const e = byMonth.get(k) ?? { output: 0, input: 0 };
    e.output = n2(r.total);
    byMonth.set(k, e);
  }
  for (const r of inRows) {
    const k = dayKey(new Date(r.bucket)).slice(0, 7);
    const e = byMonth.get(k) ?? { output: 0, input: 0 };
    e.input = n2(r.total);
    byMonth.set(k, e);
  }
  const monthly: TaxMonthRow[] = [...byMonth.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, v]) => ({ month, output: v.output, input: v.input, net: money(v.output - v.input).toNumber() }));
  const outputTax = money(monthly.reduce((a, m) => a + m.output, 0)).toNumber();
  const inputTax = money(monthly.reduce((a, m) => a + m.input, 0)).toNumber();
  return { outputTax, inputTax, netPayable: money(outputTax - inputTax).toNumber(), monthly };
}
// ---------------------------------------------------------------------------
// INVENTORY VALUATION REPORT
// ---------------------------------------------------------------------------

export interface InventoryValuationRow {
  productId: string;
  sku: string;
  name: string;
  nameAr: string | null;
  categoryName: string;
  quantity: number;
  costPrice: number;
  stockValue: number;
  retailValue: number;
  potentialProfit: number;
  low: boolean;
}

export async function inventoryValuation() {
  const rows = await db.$queryRaw<{
    id: string; sku: string; name: string; name_ar: string | null; category: string;
    qty: string; min_stock: string; cost: string; price: string;
  }[]>`
    SELECT p.id, p.sku, p.name, p."nameAr" AS name_ar, c.name AS category,
           COALESCE(i.quantity, 0)::text AS qty, p."minStock"::text AS min_stock,
           p."costPrice"::text AS cost, p."sellingPrice"::text AS price
    FROM products p
    JOIN categories c ON c.id = p."categoryId"
    LEFT JOIN inventory i ON i."productId" = p.id
    WHERE p."deletedAt" IS NULL
    ORDER BY p.name ASC`;

  const items: InventoryValuationRow[] = rows.map((r) => {
    const qty = n2(r.qty);
    const cost = n2(r.cost);
    const retail = n2(r.price);
    const stockValue = money(qty * cost).toNumber();
    const retailValue = money(qty * retail).toNumber();
    return {
      productId: r.id, sku: r.sku, name: r.name, nameAr: r.name_ar,
      categoryName: r.category, quantity: qty, costPrice: cost,
      stockValue, retailValue,
      potentialProfit: money(retailValue - stockValue).toNumber(),
      low: qty <= n2(r.min_stock),
    };
  });

  const totals = items.reduce(
    (acc, r) => ({
      stockValue: acc.stockValue + r.stockValue,
      retailValue: acc.retailValue + r.retailValue,
      potentialProfit: acc.potentialProfit + r.potentialProfit,
    }),
    { stockValue: 0, retailValue: 0, potentialProfit: 0 },
  );

  return {
    items,
    totals: {
      stockValue: money(totals.stockValue).toNumber(),
      retailValue: money(totals.retailValue).toNumber(),
      potentialProfit: money(totals.potentialProfit).toNumber(),
      lowCount: items.filter((i) => i.low).length,
      outCount: items.filter((i) => i.quantity <= 0).length,
    },
  };
}

// ---------------------------------------------------------------------------
// CUSTOMERS REPORT
// ---------------------------------------------------------------------------

export async function customersReport(range: ReportRange) {
  const rows = await db.$queryRaw<{
    id: string; code: string; name: string; name_ar: string | null;
    invoices: string; purchases: string; balance: string; credit_limit: string;
  }[]>`
    SELECT c.id, c.code, c.name, c."nameAr" AS name_ar,
           COALESCE(s.invoices, 0)::text AS invoices,
           COALESCE(s.purchases, 0)::text AS purchases,
           c.balance::text AS balance, c."creditLimit"::text AS credit_limit
    FROM customers c
    LEFT JOIN (
      SELECT "customerId", COUNT(*) AS invoices, SUM("total" - "refundedAmount") AS purchases
      FROM sales
      WHERE "saleDate" >= ${range.from} AND "saleDate" < ${range.to}
        AND status IN ('COMPLETED', 'PARTIALLY_REFUNDED') AND "customerId" IS NOT NULL
      GROUP BY "customerId"
    ) s ON s."customerId" = c.id
    WHERE c."deletedAt" IS NULL
    ORDER BY purchases DESC, c.name ASC`;

  const items = rows.map((r) => ({
    id: r.id, code: r.code, name: r.name, nameAr: r.name_ar,
    invoices: parseInt(r.invoices, 10),
    purchases: n2(r.purchases),
    balance: n2(r.balance),
    creditLimit: n2(r.credit_limit),
  }));

  return {
    items,
    totals: {
      activeCustomers: items.filter((i) => i.invoices > 0).length,
      receivables: money(items.filter((i) => i.balance > 0).reduce((a, i) => a + i.balance, 0)).toNumber(),
      overLimit: items.filter((i) => i.creditLimit > 0 && i.balance > i.creditLimit).length,
    },
  };
}

// ---------------------------------------------------------------------------
// SUPPLIERS REPORT
// ---------------------------------------------------------------------------

export async function suppliersReport(range: ReportRange) {
  const rows = await db.$queryRaw<{
    id: string; code: string; name: string; name_ar: string | null;
    docs: string; purchases: string; returns_total: string; balance: string;
  }[]>`
    SELECT sup.id, sup.code, sup.name, sup."nameAr" AS name_ar,
           COALESCE(p.docs, 0)::text AS docs,
           COALESCE(p.total, 0)::text AS purchases,
           COALESCE(pr.total, 0)::text AS returns_total,
           sup.balance::text AS balance
    FROM suppliers sup
    LEFT JOIN (
      SELECT "supplierId", COUNT(*) AS docs, SUM("total") AS total
      FROM purchases WHERE "date" >= ${range.from} AND "date" < ${range.to}
      GROUP BY "supplierId"
    ) p ON p."supplierId" = sup.id
    LEFT JOIN (
      SELECT "supplierId", SUM("total") AS total
      FROM purchase_returns WHERE "date" >= ${range.from} AND "date" < ${range.to}
      GROUP BY "supplierId"
    ) pr ON pr."supplierId" = sup.id
    WHERE sup."deletedAt" IS NULL
    ORDER BY purchases DESC, sup.name ASC`;

  const items = rows.map((r) => ({
    id: r.id, code: r.code, name: r.name, nameAr: r.name_ar,
    docs: parseInt(r.docs, 10),
    purchases: n2(r.purchases),
    returnsTotal: n2(r.returns_total),
    netPurchases: money(n2(r.purchases) - n2(r.returns_total)).toNumber(),
    balance: n2(r.balance),
  }));

  return {
    items,
    totals: {
      payables: money(items.filter((i) => i.balance > 0).reduce((a, i) => a + i.balance, 0)).toNumber(),
      purchaseVolume: money(items.reduce((a, i) => a + i.purchases, 0)).toNumber(),
    },
  };
}

// ---------------------------------------------------------------------------
// EXPENSES REPORT
// ---------------------------------------------------------------------------

export async function expensesReport(range: ReportRange) {
  const [byCategory, byMethod, buckets] = await Promise.all([
    db.expense.groupBy({
      by: ["categoryId"],
      _sum: { amount: true },
      _count: true,
      where: { expenseDate: { gte: range.from, lt: range.to } },
    }),
    db.$queryRaw<{ method: string; total: string; cnt: string }[]>`
      SELECT e.method::text AS method, SUM(e."amount")::text AS total, COUNT(*)::text AS cnt
      FROM expenses e
      WHERE e."expenseDate" >= ${range.from} AND e."expenseDate" < ${range.to}
      GROUP BY e.method ORDER BY total DESC`,
    db.$queryRaw<{ bucket: Date; total: string }[]>`
      SELECT date_trunc('day', e."expenseDate") AS bucket, COALESCE(SUM(e."amount"), 0) AS total
      FROM expenses e
      WHERE e."expenseDate" >= ${range.from} AND e."expenseDate" < ${range.to}
      GROUP BY bucket ORDER BY bucket ASC`,
  ]);

  const categoryIds = byCategory.map((c) => c.categoryId);
  const categories = categoryIds.length
    ? await db.expenseCategory.findMany({ where: { id: { in: categoryIds } }, select: { id: true, name: true, nameAr: true } })
    : [];
  const catMap = new Map(categories.map((c) => [c.id, c]));

  const items = byCategory
    .map((c) => ({
      categoryId: c.categoryId,
      name: catMap.get(c.categoryId)?.name ?? "—",
      nameAr: catMap.get(c.categoryId)?.nameAr ?? null,
      count: c._count ?? 0,
      total: n2(c._sum?.amount),
    }))
    .sort((a, b) => b.total - a.total);

  const grand = money(items.reduce((a, i) => a + i.total, 0)).toNumber();
  return {
    byCategory: items,
    byMethod: byMethod.map((m) => ({ method: m.method, count: parseInt(m.cnt, 10), total: n2(m.total) })),
    buckets: buckets.map((b) => ({ day: dayKey(new Date(b.bucket)), total: n2(b.total) })),
    grandTotal: grand,
  };
}

// ---------------------------------------------------------------------------
// FINANCIAL SUMMARY (§25) — combines everything with documented formula
// ---------------------------------------------------------------------------

export async function financialSummary(range: ReportRange) {
  const [profit, inventory, customers, suppliers, tax] = await Promise.all([
    profitReport(range),
    inventoryValuation(),
    customersReport(range),
    suppliersReport(range),
    taxReport(range),
  ]);
  return {
    profit,
    inventoryTotals: inventory.totals,
    receivables: customers.totals.receivables,
    payables: suppliers.totals.payables,
    tax,
  };
}

// ---------------------------------------------------------------------------
// CSV EXPORTS — localized, sectioned, spreadsheet-friendly
// ---------------------------------------------------------------------------

const esc = (s: unknown): string => {
  const v = String(s ?? "");
  return /[",;\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};
const csvRow = (...cells: Array<string | number>): string => cells.map(esc).join(",");
/** Plain dot-decimal number so spreadsheets can sum it (no currency symbol). */
const num = (n: number): string => String(Number(n.toFixed(2)));
const int = (n: number): string => String(Math.round(n));

interface CsvSection {
  title: string;
  header: Array<string | number>;
  rows: Array<Array<string | number>>;
  footer?: Array<Array<string | number>>;
}

function reportCsv(t: Dictionary, title: string, range: ReportRange, sections: CsvSection[]): string {
  const c = t.reports.csv;
  const lines: string[] = [esc(title)];
  lines.push(csvRow(c.period, t.common.from, range.fromISO, t.common.to, range.toISO));
  lines.push("");
  for (const s of sections) {
    lines.push(esc(s.title));
    lines.push(csvRow(...s.header));
    for (const r of s.rows) lines.push(csvRow(...r));
    if (s.footer) for (const f of s.footer) lines.push(csvRow(...f));
    lines.push("");
  }
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n");
}

/** Key/value block (summary, totals …) shaped like a small two-column table. */
function kvSection(
  t: Dictionary,
  title: string,
  entries: Array<[string, number]>,
): CsvSection {
  const c = t.reports.csv;
  return {
    title,
    header: [c.statement, c.value],
    rows: entries.map(([k, v]) => [k, num(v)]),
  };
}

function methodLabel(method: string, t: Dictionary): string {
  const map: Record<string, string> = {
    CASH: t.sales.payCash, CARD: t.sales.payCard,
    BANK_TRANSFER: t.sales.payTransfer, WALLET: t.sales.payWallet,
  };
  return map[method] ?? method;
}

export async function exportReportCsv(family: string, range: ReportRange): Promise<string> {
  const t = dict();
  const R = t.reports;
  const c = R.csv;

  switch (family) {
    case "sales": {
      const { summary, buckets, byCashier, products } = await salesReport(range);
      return reportCsv(t, R.salesReport, range, [
        kvSection(t, c.summary, [
          [R.invoicesCol, summary.invoices],
          [R.grossSales, summary.grossSales],
          [R.returns, summary.returnsTotal],
          [R.netSales, summary.netSales],
          [t.common.discount, summary.discounts],
          [R.cogs, summary.cogs],
          [R.avgTicket, summary.avgTicket],
        ]),
        {
          title: R.byDay,
          header: [c.date, R.revenueCol, R.cogs, R.grossProfit],
          rows: buckets.map((b) => [b.day, num(b.revenue), num(b.cost), num(b.profit)]),
        },
        {
          title: R.cashierReport,
          header: [t.usersPage.fullName, R.invoicesCol, R.netSales],
          rows: byCashier.map((x) => [x.nameAr ?? x.name, int(x.qty), num(x.total)]),
        },
        {
          title: R.productPerformance,
          header: [c.product, R.unitsSold, R.revenueCol, R.grossProfit],
          rows: products.map((p) => [p.nameAr ?? p.name, num(p.qty), num(p.total), num(p.profit)]),
        },
      ]);
    }
    case "purchases": {
      const { summary, buckets, bySupplier } = await purchasesReport(range);
      return reportCsv(t, R.purchasesReport, range, [
        kvSection(t, c.summary, [
          [R.docsCount, summary.docs],
          [c.grossPurchases, summary.gross],
          [t.common.discount, summary.discounts],
          [R.totalPaid, summary.paid],
          [c.due, summary.due],
          [R.inputTax, summary.inputTax],
          [R.returns, summary.returnsTotal],
        ]),
        {
          title: R.byDay,
          header: [c.date, t.common.total],
          rows: buckets.map((b) => [b.day, num(b.total)]),
        },
        {
          title: R.bySupplier,
          header: [c.name, R.docsCount, t.common.total],
          rows: bySupplier.map((s) => [s.nameAr ?? s.name, int(s.qty), num(s.total)]),
        },
      ]);
    }
    case "profit": {
      const p = await profitReport(range);
      return reportCsv(t, R.profitReport, range, [
        kvSection(t, c.summary, [
          [R.netSales, p.netSales],
          [R.cogs, p.cogs],
          [R.grossProfit, p.grossProfit],
          [R.operatingExpenses, p.expenses],
          [R.netProfit, p.netProfit],
          [R.margin, p.marginPercent],
        ]),
        {
          title: R.byMonth,
          header: [c.month, R.netSales, R.cogs, R.grossProfit, R.operatingExpenses, R.netProfit],
          rows: p.monthly.map((m) => [
            m.month, num(m.sales), num(m.cogs), num(m.grossProfit), num(m.expenses), num(m.netProfit),
          ]),
        },
      ]);
    }
    case "inventory": {
      const { items, totals } = await inventoryValuation();
      return reportCsv(t, R.inventoryReport, range, [
        {
          title: c.totals,
          header: [c.statement, c.value],
          rows: [
            [R.stockValue, num(totals.stockValue)],
            [R.retailValue, num(totals.retailValue)],
            [R.potentialProfit, num(totals.potentialProfit)],
            [t.dashboard.lowStockProducts, int(totals.lowCount)],
            [t.dashboard.outOfStock, int(totals.outCount)],
          ],
        },
        {
          title: t.products.title,
          header: [t.products.sku, t.products.name, c.category, t.common.quantity, t.products.costPrice, R.stockValue, R.retailValue, R.potentialProfit],
          rows: items.map((i) => [
            i.sku, i.nameAr ?? i.name, i.categoryName, num(i.quantity), num(i.costPrice),
            num(i.stockValue), num(i.retailValue), num(i.potentialProfit),
          ]),
        },
      ]);
    }
    case "customers": {
      const { items, totals } = await customersReport(range);
      return reportCsv(t, R.customersReport, range, [
        kvSection(t, c.totals, [
          [R.receivables, totals.receivables],
          [R.activeCustomers, totals.activeCustomers],
          [R.overLimit, totals.overLimit],
        ]),
        {
          title: t.nav.customersList,
          header: [c.code, R.customerCol, R.invoicesCol, c.purchases, c.balance, c.creditLimit],
          rows: items.map((i) => [
            i.code, i.nameAr ?? i.name, int(i.invoices),
            num(i.purchases), num(i.balance), num(i.creditLimit),
          ]),
        },
      ]);
    }
    case "suppliers": {
      const { items, totals } = await suppliersReport(range);
      return reportCsv(t, R.suppliersReport, range, [
        kvSection(t, c.totals, [
          [R.payables, totals.payables],
          [R.purchaseVolume, totals.purchaseVolume],
        ]),
        {
          title: t.nav.suppliers,
          header: [c.code, R.supplierCol, R.docsCount, c.purchases, R.returns, c.netPurchases, R.payables],
          rows: items.map((i) => [
            i.code, i.nameAr ?? i.name, int(i.docs),
            num(i.purchases), num(i.returnsTotal), num(i.netPurchases), num(i.balance),
          ]),
        },
      ]);
    }
    case "tax": {
      const tax = await taxReport(range);
      return reportCsv(t, R.taxReport, range, [
        kvSection(t, c.summary, [
          [R.outputTax, tax.outputTax],
          [R.inputTax, tax.inputTax],
          [R.netTaxPayable, tax.netPayable],
        ]),
        {
          title: R.byMonth,
          header: [c.month, R.outputTax, R.inputTax, c.netTax],
          rows: tax.monthly.map((m) => [m.month, num(m.output), num(m.input), num(m.net)]),
        },
      ]);
    }
    case "expenses": {
      const e = await expensesReport(range);
      return reportCsv(t, R.expensesReport, range, [
        {
          title: R.byCategory,
          header: [c.category, c.count, t.common.total],
          rows: e.byCategory.map((x) => [x.nameAr ?? x.name, int(x.count), num(x.total)]),
        },
        {
          title: R.byMethod,
          header: [c.method, c.count, t.common.total],
          rows: e.byMethod.map((m) => [methodLabel(m.method, t), int(m.count), num(m.total)]),
        },
        kvSection(t, c.totals, [[c.grandTotal, e.grandTotal]]),
      ]);
    }
    default:
      throw new Error(`Unknown report family: ${family}`);
  }
}

// ---------------------------------------------------------------------------
// EXCEL EXPORT — styled, sectioned, right-to-left sheets
// ---------------------------------------------------------------------------

const MONEY_FMT = "#,##0.00";
const COUNT_FMT = "0";

/** Single workbook with a title band, period band and styled table sections. */
export async function exportReportWorkbook(family: string, range: ReportRange): Promise<Buffer> {
  const t = dict();
  const R = t.reports;
  const c = R.csv;
  const subtitle = `${c.period}: ${t.common.from} ${range.fromISO} ${t.common.to} ${range.toISO}`;

  let title = "";
  let sections: XlSection[] = [];

  switch (family) {
    case "sales": {
      const { summary, buckets, byCashier, products } = await salesReport(range);
      title = R.salesReport;
      const dayTotals = buckets.reduce(
        (acc, b) => ({ revenue: acc.revenue + b.revenue, cost: acc.cost + b.cost, profit: acc.profit + b.profit }),
        { revenue: 0, cost: 0, profit: 0 },
      );
      const cashierTotal = byCashier.reduce((a, x) => a + x.total, 0);
      const cashierCnt = byCashier.reduce((a, x) => a + x.qty, 0);
      const productTotals = products.reduce(
        (acc, p) => ({ qty: acc.qty + p.qty, total: acc.total + p.total, profit: acc.profit + p.profit }),
        { qty: 0, total: 0, profit: 0 },
      );
      sections = [
        xlKvSection(t, c.summary, [
          [R.invoicesCol, int(summary.invoices)],
          [R.grossSales, summary.grossSales],
          [R.returns, summary.returnsTotal],
          [R.netSales, summary.netSales],
          [t.common.discount, summary.discounts],
          [R.cogs, summary.cogs],
          [R.avgTicket, summary.avgTicket],
        ]),
        {
          title: R.byDay,
          columns: dateCols(t, c.date),
          rows: buckets.map((b) => [b.day, money(b.revenue).toNumber(), money(b.cost).toNumber(), money(b.profit).toNumber()]),
          totals: [[t.common.total, dayTotals.revenue, dayTotals.cost, dayTotals.profit]],
        },
        {
          title: R.cashierReport,
          columns: [
            { header: t.usersPage.fullName, width: 30 },
            { header: R.invoicesCol, width: 14, numFmt: COUNT_FMT },
            { header: R.netSales, width: 18 },
          ],
          rows: byCashier.map((x) => [x.nameAr ?? x.name, x.qty, money(x.total).toNumber()]),
          totals: [[t.common.total, cashierCnt, money(cashierTotal).toNumber()]],
        },
        {
          title: R.productPerformance,
          columns: [
            { header: c.product, width: 34 },
            { header: R.unitsSold, width: 16 },
            { header: R.revenueCol, width: 16 },
            { header: R.grossProfit, width: 16 },
          ],
          rows: products.map((p) => [p.nameAr ?? p.name, p.qty, money(p.total).toNumber(), money(p.profit).toNumber()]),
          totals: [[t.common.total, productTotals.qty, money(productTotals.total).toNumber(), money(productTotals.profit).toNumber()]],
        },
      ];
      break;
    }
    case "purchases": {
      const { summary, buckets, bySupplier } = await purchasesReport(range);
      title = R.purchasesReport;
      sections = [
        xlKvSection(t, c.summary, [
          [R.docsCount, int(summary.docs)],
          [c.grossPurchases, summary.gross],
          [t.common.discount, summary.discounts],
          [R.totalPaid, summary.paid],
          [c.due, summary.due],
          [R.inputTax, summary.inputTax],
          [R.returns, summary.returnsTotal],
        ]),
        {
          title: R.byDay,
          columns: dateCols(t, c.date),
          rows: buckets.map((b) => [b.day, money(b.total).toNumber()]),
          totals: [[t.common.total, buckets.reduce((a, b) => a + b.total, 0)]],
        },
        {
          title: R.bySupplier,
          columns: [
            { header: c.name, width: 30 },
            { header: R.docsCount, width: 14, numFmt: COUNT_FMT },
            { header: t.common.total, width: 18 },
          ],
          rows: bySupplier.map((s) => [s.nameAr ?? s.name, s.qty, money(s.total).toNumber()]),
          totals: [[t.common.total, bySupplier.reduce((a, s) => a + s.qty, 0),
            money(bySupplier.reduce((a, s) => a + s.total, 0)).toNumber()]],
        },
      ];
      break;
    }
    case "profit": {
      const p = await profitReport(range);
      title = R.profitReport;
      sections = [
        xlKvSection(t, c.summary, [
          [R.netSales, p.netSales],
          [R.cogs, p.cogs],
          [R.grossProfit, p.grossProfit],
          [R.operatingExpenses, p.expenses],
          [R.netProfit, p.netProfit],
          [R.margin, `${num(p.marginPercent)}%`],
        ]),
        {
          title: R.byMonth,
          columns: [
            { header: c.month, width: 14 },
            { header: R.netSales, width: 16 },
            { header: R.cogs, width: 16 },
            { header: R.grossProfit, width: 16 },
            { header: R.operatingExpenses, width: 18 },
            { header: R.netProfit, width: 16 },
          ],
          rows: p.monthly.map((m) => [
            m.month, money(m.sales).toNumber(), money(m.cogs).toNumber(),
            money(m.grossProfit).toNumber(), money(m.expenses).toNumber(), money(m.netProfit).toNumber(),
          ]),
        },
      ];
      break;
    }
    case "inventory": {
      const { items, totals } = await inventoryValuation();
      title = R.inventoryReport;
      sections = [
        xlKvSection(t, c.totals, [
          [R.stockValue, totals.stockValue],
          [R.retailValue, totals.retailValue],
          [R.potentialProfit, totals.potentialProfit],
          [t.dashboard.lowStockProducts, int(totals.lowCount)],
          [t.dashboard.outOfStock, int(totals.outCount)],
        ]),
        {
          title: t.products.title,
          columns: [
            { header: t.products.sku, width: 14 },
            { header: t.products.name, width: 32 },
            { header: c.category, width: 20 },
            { header: t.common.quantity, width: 12, numFmt: COUNT_FMT },
            { header: t.products.costPrice, width: 14 },
            { header: R.stockValue, width: 16 },
            { header: R.retailValue, width: 16 },
            { header: R.potentialProfit, width: 16 },
          ],
          rows: items.map((i) => [i.sku, i.nameAr ?? i.name, i.categoryName, i.quantity,
            money(i.costPrice).toNumber(), money(i.stockValue).toNumber(),
            money(i.retailValue).toNumber(), money(i.potentialProfit).toNumber()]),
        },
      ];
      break;
    }
    case "customers": {
      const { items, totals } = await customersReport(range);
      title = R.customersReport;
      sections = [
        xlKvSection(t, c.totals, [
          [R.receivables, totals.receivables],
          [R.activeCustomers, int(totals.activeCustomers)],
          [R.overLimit, int(totals.overLimit)],
        ]),
        {
          title: t.nav.customersList,
          columns: [
            { header: c.code, width: 14 },
            { header: R.customerCol, width: 30 },
            { header: R.invoicesCol, width: 12, numFmt: COUNT_FMT },
            { header: c.purchases, width: 16 },
            { header: c.balance, width: 16 },
            { header: c.creditLimit, width: 16 },
          ],
          rows: items.map((i) => [i.code, i.nameAr ?? i.name, i.invoices,
            money(i.purchases).toNumber(), money(i.balance).toNumber(), money(i.creditLimit).toNumber()]),
        },
      ];
      break;
    }
    case "suppliers": {
      const { items, totals } = await suppliersReport(range);
      title = R.suppliersReport;
      sections = [
        xlKvSection(t, c.totals, [
          [R.payables, totals.payables],
          [R.purchaseVolume, totals.purchaseVolume],
        ]),
        {
          title: t.nav.suppliers,
          columns: [
            { header: c.code, width: 14 },
            { header: R.supplierCol, width: 30 },
            { header: R.docsCount, width: 12, numFmt: COUNT_FMT },
            { header: c.purchases, width: 16 },
            { header: R.returns, width: 14 },
            { header: c.netPurchases, width: 16 },
            { header: R.payables, width: 16 },
          ],
          rows: items.map((i) => [i.code, i.nameAr ?? i.name, i.docs,
            money(i.purchases).toNumber(), money(i.returnsTotal).toNumber(),
            money(i.netPurchases).toNumber(), money(i.balance).toNumber()]),
          totals: [[t.common.total, "", "", money(items.reduce((a, i) => a + i.purchases, 0)).toNumber(),
            "", money(items.reduce((a, i) => a + i.netPurchases, 0)).toNumber(), money(totals.payables).toNumber()]],
        },
      ];
      break;
    }
    case "tax": {
      const tax = await taxReport(range);
      title = R.taxReport;
      sections = [
        xlKvSection(t, c.summary, [
          [R.outputTax, tax.outputTax],
          [R.inputTax, tax.inputTax],
          [R.netTaxPayable, tax.netPayable],
        ]),
        {
          title: R.byMonth,
          columns: [
            { header: c.month, width: 14 },
            { header: R.outputTax, width: 16 },
            { header: R.inputTax, width: 16 },
            { header: c.netTax, width: 16 },
          ],
          rows: tax.monthly.map((m) => [m.month, money(m.output).toNumber(), money(m.input).toNumber(), money(m.net).toNumber()]),
        },
      ];
      break;
    }
    case "expenses": {
      const e = await expensesReport(range);
      title = R.expensesReport;
      sections = [
        {
          title: R.byCategory,
          columns: [
            { header: c.category, width: 32 },
            { header: c.count, width: 12, numFmt: COUNT_FMT },
            { header: t.common.total, width: 18 },
          ],
          rows: e.byCategory.map((x) => [x.nameAr ?? x.name, x.count, money(x.total).toNumber()]),
        },
        {
          title: R.byMethod,
          columns: [
            { header: c.method, width: 24 },
            { header: c.count, width: 12, numFmt: COUNT_FMT },
            { header: t.common.total, width: 18 },
          ],
          rows: e.byMethod.map((m) => [methodLabel(m.method, t), m.count, money(m.total).toNumber()]),
        },
        xlKvSection(t, c.totals, [[c.grandTotal, e.grandTotal]]),
      ];
      break;
    }
    default:
      throw new Error(`Unknown report family: ${family}`);
  }

  return buildReportWorkbook({ title, subtitle, noData: t.common.noData, sections });
}

interface XlColumn {
  header: string;
  width: number;
  numFmt?: string;
}

interface XlSection {
  title: string;
  columns: XlColumn[];
  rows: Array<Array<string | number>>;
  totals?: Array<Array<string | number>>;
}

interface XlWorkbookSpec {
  title: string;
  subtitle: string;
  noData: string;
  sections: XlSection[];
}

function dateCols(t: Dictionary, dateHeader: string): XlColumn[] {
  return [
    { header: dateHeader, width: 14 },
    { header: t.reports.revenueCol, width: 16 },
    { header: t.reports.cogs, width: 16 },
    { header: t.reports.grossProfit, width: 16 },
  ];
}

function xlKvSection(t: Dictionary, title: string, entries: Array<[string, string | number]>): XlSection {
  const c = t.reports.csv;
  return {
    title,
    columns: [
      { header: c.statement, width: 38 },
      { header: c.value, width: 20 },
    ],
    rows: entries.map(([k, v]) => [k, v]),
  };
}

const THIN_GRAY: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFCBD5E1" } },
  left: { style: "thin", color: { argb: "FFCBD5E1" } },
  bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
  right: { style: "thin", color: { argb: "FFCBD5E1" } },
};

async function buildReportWorkbook(spec: XlWorkbookSpec): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Grocery POS";
  wb.created = new Date();
  const ws = wb.addWorksheet(spec.title.slice(0, 28), {
    views: [{ rightToLeft: true, showGridLines: false }],
  });

  const colCount = Math.max(...spec.sections.map((s) => s.columns.length), 1);
  const widths = new Array<number>(colCount + 1).fill(11);
  let r = 0;

  // Title band
  r++;
  ws.getRow(r).height = 26;
  ws.mergeCells(r, 1, r, colCount);
  for (let css = 1; css <= colCount; css++) {
    ws.getCell(r, css).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
  }
  const titleCell = ws.getCell(r, 1);
  titleCell.value = spec.title;
  titleCell.font = { bold: true, size: 15, color: { argb: "FFFFFFFF" } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };

  // Period band
  r++;
  ws.getRow(r).height = 18;
  ws.mergeCells(r, 1, r, colCount);
  for (let css = 1; css <= colCount; css++) {
    ws.getCell(r, css).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
  }
  const subCell = ws.getCell(r, 1);
  subCell.value = spec.subtitle;
  subCell.font = { size: 11, color: { argb: "FF4B5563" } };
  subCell.alignment = { horizontal: "center", vertical: "middle" };

  for (const section of spec.sections) {
    // Section heading
    r++;
    ws.getRow(r).height = 20;
    ws.mergeCells(r, 1, r, colCount);
    for (let css = 1; css <= colCount; css++) {
      ws.getCell(r, css).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };
      ws.getCell(r, css).border = THIN_GRAY;
    }
    const heading = ws.getCell(r, 1);
    heading.value = section.title;
    heading.font = { bold: true, size: 11, color: { argb: "FF1E3A8A" } };
    heading.alignment = { horizontal: "center", vertical: "middle" };

    // Column headers
    r++;
    ws.getRow(r).height = 18;
    section.columns.forEach((col, i) => {
      const cell = ws.getCell(r, i + 1);
      cell.value = col.header;
      cell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF334155" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = THIN_GRAY;
      widths[i + 1] = Math.max(widths[i + 1], Math.max(col.width, col.header.length + 6));
    });

    // Data rows
    if (section.rows.length === 0) {
      r++;
      ws.mergeCells(r, 1, r, colCount);
      const empty = ws.getCell(r, 1);
      empty.value = spec.noData;
      empty.font = { italic: true, size: 10, color: { argb: "FF9CA3AF" } };
      empty.alignment = { horizontal: "center" };
      ws.getRow(r).height = 18;
    } else {
      section.rows.forEach((row, idx) => {
        r++;
        ws.getRow(r).height = 16;
        row.forEach((v, i) => {
          const col = section.columns[i];
          const cell = ws.getCell(r, i + 1);
          cell.value = v;
          cell.border = THIN_GRAY;
          if (idx % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
          if (typeof v === "number") {
            cell.numFmt = col.numFmt ?? MONEY_FMT;
            cell.alignment = { horizontal: "right", vertical: "middle" };
          } else if (typeof v === "string" && v !== "") {
            cell.alignment = { horizontal: "left", vertical: "middle" };
          }
        });
      });
    }

    // Totals row(s)
    if (section.totals?.length) {
      section.totals.forEach((row) => {
        r++;
        ws.getRow(r).height = 18;
        row.forEach((v, i) => {
          const col = section.columns[i];
          const cell = ws.getCell(r, i + 1);
          cell.value = v;
          cell.border = THIN_GRAY;
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
          cell.font = { bold: true, size: 10, color: { argb: "FF111827" } };
          if (typeof v === "number") {
            cell.numFmt = col.numFmt ?? MONEY_FMT;
            cell.alignment = { horizontal: "right", vertical: "middle" };
          } else if (typeof v === "string" && v !== "") {
            cell.alignment = { horizontal: "left", vertical: "middle" };
          }
        });
      });
    }
  }

  widths.forEach((w, i) => {
    if (i > 0) ws.getColumn(i).width = w;
  });

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}
