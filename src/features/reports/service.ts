import "server-only";
import { db } from "@/shared/db";
import { money } from "@/shared/core/money";
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
  discounts: number;
  cogs: number;
  avgTicket: number;
}

export async function salesSummary(range: ReportRange): Promise<SalesSummary> {
  const [agg, returnsAgg] = await Promise.all([
    db.sale.aggregate({
      _sum: {
        total: true, costTotal: true,
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
  return {
    invoices,
    grossSales: gross,
    returnsTotal,
    netSales,
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
  returnsTotal: number;
}

export async function purchasesReport(range: ReportRange) {
  const [agg, retAgg, buckets, bySupplier] = await Promise.all([
    db.purchase.aggregate({
      _sum: { total: true, discountTotal: true, paidAmount: true, dueAmount: true },
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
      _sum: { total: true, costTotal: true },
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
    db.$queryRaw<{ bucket: Date; sales: string; cogs: string; returns: string; ret_cogs: string; expenses: string }[]>`
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
        COALESCE((SELECT SUM(e."amount") FROM expenses e
          WHERE date_trunc('month', e."expenseDate") = m.bucket), 0)::text AS expenses
      FROM m ORDER BY m.bucket ASC`,
  ]);

  const returnsTotal = n2(retAgg._sum?.total);
  const netCogs = Math.max(0, n2(salesAgg._sum?.costTotal) - n2(retAgg._sum?.costTotal));
  const netSales = money(n2(salesAgg._sum?.total) - returnsTotal).toNumber();
  const grossProfit = money(netSales - netCogs).toNumber();
  const expenses = n2(expAgg._sum?.amount);

  return {
    netSales,
    cogs: netCogs,
    grossProfit,
    expenses,
    netProfit: money(grossProfit - expenses).toNumber(),
    marginPercent: netSales > 0 ? money((grossProfit / netSales) * 100).toNumber() : 0,
    monthly: monthly.map((m) => {
      const sales = n2(m.sales) - n2(m.returns);
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
    invoices: string; purchases: string; balance: string; credit_limit: string; points: string;
  }[]>`
    SELECT c.id, c.code, c.name, c."nameAr" AS name_ar,
           COALESCE(s.invoices, 0)::text AS invoices,
           COALESCE(s.purchases, 0)::text AS purchases,
           c.balance::text AS balance, c."creditLimit"::text AS credit_limit,
           c."loyaltyPoints"::text AS points
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
    loyaltyPoints: n2(r.points),
  }));

  return {
    items,
    totals: {
      activeCustomers: items.filter((i) => i.invoices > 0).length,
      receivables: money(items.filter((i) => i.balance > 0).reduce((a, i) => a + i.balance, 0)).toNumber(),
      overLimit: items.filter((i) => i.creditLimit > 0 && i.balance > i.creditLimit).length,
      loyaltyPointsOutstanding: money(items.reduce((a, i) => a + i.loyaltyPoints, 0)).toNumber(),
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
  const [profit, inventory, customers, suppliers] = await Promise.all([
    profitReport(range),
    inventoryValuation(),
    customersReport(range),
    suppliersReport(range),
  ]);
  return {
    profit,
    inventoryTotals: inventory.totals,
    receivables: customers.totals.receivables,
    payables: suppliers.totals.payables,
  };
}

// ---------------------------------------------------------------------------
// CSV EXPORTS
// ---------------------------------------------------------------------------

const esc = (s: unknown) => {
  const v = String(s ?? "");
  return /[",;\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};
const toCsv = (head: string[], rows: unknown[][]): string =>
  [head.join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");

export async function exportReportCsv(family: string, range: ReportRange): Promise<string> {
  switch (family) {
    case "sales": {
      const { summary, buckets, byCashier, products } = await salesReport(range);
      return [
        toCsv(["metric", "value"], [
          ["invoices", summary.invoices], ["grossSales", summary.grossSales],
          ["returns", summary.returnsTotal], ["netSales", summary.netSales],
          ["discounts", summary.discounts],
          ["cogs", summary.cogs], ["avgTicket", summary.avgTicket],
        ]),
        "",
        toCsv(["day", "revenue", "cost", "profit"], buckets.map((b) => [b.day, b.revenue, b.cost, b.profit])),
        "",
        toCsv(["cashier", "invoices", "netSales"], byCashier.map((c) => [c.name, c.qty, c.total])),
        "",
        toCsv(["skuProduct", "unitsSold", "revenue", "profit"], products.map((p) => [p.name, p.qty, p.total, p.profit])),
      ].join("\n");
    }
    case "purchases": {
      const { summary, buckets, bySupplier } = await purchasesReport(range);
      return [
        toCsv(["metric", "value"], [
          ["docs", summary.docs], ["gross", summary.gross], ["discounts", summary.discounts],
          ["paid", summary.paid], ["due", summary.due],
          ["returns", summary.returnsTotal],
        ]),
        "",
        toCsv(["day", "total"], buckets.map((b) => [b.day, b.total])),
        "",
        toCsv(["supplier", "docs", "total"], bySupplier.map((s) => [s.name, s.qty, s.total])),
      ].join("\n");
    }
    case "profit": {
      const p = await profitReport(range);
      return toCsv(["month", "netSales", "cogs", "grossProfit", "expenses", "netProfit"],
        p.monthly.map((m) => [m.month, m.sales, m.cogs, m.grossProfit, m.expenses, m.netProfit]));
    }
    case "inventory": {
      const { items, totals } = await inventoryValuation();
      return [
        toCsv(["sku", "product", "category", "qty", "costPrice", "stockValue", "retailValue", "potentialProfit"],
          items.map((i) => [i.sku, i.name, i.categoryName, i.quantity, i.costPrice, i.stockValue, i.retailValue, i.potentialProfit])),
        "",
        toCsv(["totals"], [[`stockValue=${totals.stockValue}`], [`retailValue=${totals.retailValue}`],
          [`potentialProfit=${totals.potentialProfit}`], [`lowCount=${totals.lowCount}`], [`outCount=${totals.outCount}`]]),
      ].join("\n");
    }
    case "customers": {
      const { items, totals } = await customersReport(range);
      return [
        toCsv(["code", "customer", "invoices", "purchases", "balance", "creditLimit", "loyaltyPoints"],
          items.map((i) => [i.code, i.name, i.invoices, i.purchases, i.balance, i.creditLimit, i.loyaltyPoints])),
        "",
        toCsv(["receivables", "activeCustomers", "overLimit", "loyaltyPointsOutstanding"], [[
          totals.receivables, totals.activeCustomers, totals.overLimit, totals.loyaltyPointsOutstanding]]),
      ].join("\n");
    }
    case "suppliers": {
      const { items, totals } = await suppliersReport(range);
      return [
        toCsv(["code", "supplier", "docs", "purchases", "returns", "netPurchases", "balancePayable"],
          items.map((i) => [i.code, i.name, i.docs, i.purchases, i.returnsTotal, i.netPurchases, i.balance])),
        "",
        toCsv(["payables", "purchaseVolume"], [[totals.payables, totals.purchaseVolume]]),
      ].join("\n");
    }
    case "tax": {
      const t = await taxReport(range);
      return [
        toCsv(["metric", "value"], [["outputTax", t.outputTax], ["inputTax", t.inputTax], ["netPayable", t.netPayable]]),
        "",
        toCsv(["month", "output", "input", "net"], t.monthly.map((m) => [m.month, m.output, m.input, m.net])),
      ].join("\n");
    }
    case "expenses": {
      const e = await expensesReport(range);
      return [
        toCsv(["category", "count", "total"], e.byCategory.map((c) => [c.name, c.count, c.total])),
        "",
        toCsv(["method", "count", "total"], e.byMethod.map((m) => [m.method, m.count, m.total])),
        "",
        toCsv(["grandTotal"], [[e.grandTotal]]),
      ].join("\n");
    }
    default:
      throw new Error(`Unknown report family: ${family}`);
  }
}
