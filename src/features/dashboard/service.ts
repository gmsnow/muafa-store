import "server-only";
import { db } from "@/shared/db";
import { SaleStatus } from "@/generated/prisma/client";
import { D, money } from "@/shared/core/money";

export interface DashboardKpis {
  todaySales: number;
  yesterdaySales: number;
  todayPurchases: number;
  todayProfit: number;
  todayOrders: number;
  totalProducts: number;
  lowStock: number;
  outOfStock: number;
  totalCustomers: number;
}

function startOfDay(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export async function getDashboardKpis(): Promise<DashboardKpis> {
  const today = startOfDay();
  const yesterday = new Date(today.getTime() - 86400000);
  const activeSales: SaleStatus[] = [SaleStatus.COMPLETED, SaleStatus.PARTIALLY_REFUNDED];

  const [todayAgg, yesterdayAgg, purchasesAgg, ordersCount, productsCount, customersCount, invRows] =
    await Promise.all([
      db.sale.aggregate({
        _sum: { total: true, refundedAmount: true, costTotal: true },
        where: { saleDate: { gte: today }, status: { in: activeSales } },
      }),
      db.sale.aggregate({
        _sum: { total: true, refundedAmount: true },
        where: { saleDate: { gte: yesterday, lt: today }, status: { in: activeSales } },
      }),
      db.purchase.aggregate({ _sum: { total: true }, where: { date: { gte: today } } }),
      db.sale.count({ where: { saleDate: { gte: today } } }),
      db.product.count({ where: { deletedAt: null } }),
      db.customer.count({ where: { deletedAt: null } }),
      db.inventory.findMany({
        select: { quantity: true, product: { select: { minStock: true } } },
      }),
    ]);

  const netToday = D(todayAgg._sum?.total).minus(D(todayAgg._sum?.refundedAmount)).toNumber();
  const netYesterday = D(yesterdayAgg._sum?.total).minus(D(yesterdayAgg._sum?.refundedAmount)).toNumber();
  const cogsToday = D(todayAgg._sum?.costTotal).toNumber();

  let lowStock = 0;
  let outOfStock = 0;
  for (const row of invRows) {
    const q = D(row.quantity).toNumber();
    const min = D(row.product.minStock).toNumber();
    if (q <= 0) outOfStock++;
    else if (q <= min) lowStock++;
  }

  return {
    todaySales: money(netToday).toNumber(),
    yesterdaySales: money(netYesterday).toNumber(),
    todayPurchases: money(D(purchasesAgg._sum?.total)).toNumber(),
    todayProfit: money(netToday - cogsToday).toNumber(),
    todayOrders: ordersCount,
    totalProducts: productsCount,
    lowStock,
    outOfStock,
    totalCustomers: customersCount,
  };
}

export type ChartRange = "today" | "week" | "month" | "year";

export interface SalesChartPoint {
  label: string;
  revenue: number;
  cost: number;
  profit: number;
}

/** Aggregated revenue/cost/profit series. Uses SQL date_trunc for efficiency. */
export async function getSalesSeries(range: ChartRange): Promise<SalesChartPoint[]> {
  const now = new Date();
  let fromDate: Date;
  let trunc: "hour" | "day" | "month";
  switch (range) {
    case "today":
      fromDate = startOfDay();
      trunc = "hour";
      break;
    case "week":
      fromDate = new Date(now.getTime() - 6 * 86400000);
      trunc = "day";
      break;
    case "month":
      fromDate = new Date(now.getTime() - 29 * 86400000);
      trunc = "day";
      break;
    case "year":
      fromDate = new Date(now.getFullYear(), 0, 1);
      trunc = "month";
      break;
  }

  const rows = await db.$queryRaw<{ bucket: Date; revenue: string; cost: string }[]>`
    SELECT date_trunc(${trunc}, s."saleDate") AS bucket,
           COALESCE(SUM(s."total" - s."refundedAmount"), 0) AS revenue,
           COALESCE(SUM(s."costTotal"), 0) AS cost
    FROM sales s
    WHERE s."saleDate" >= ${fromDate} AND s.status IN ('COMPLETED', 'PARTIALLY_REFUNDED')
    GROUP BY bucket ORDER BY bucket ASC`;

  return rows.map((r) => {
    const revenue = parseFloat(String(r.revenue));
    const cost = parseFloat(String(r.cost));
    const d = new Date(r.bucket);
    const label =
      trunc === "hour"
        ? `${String(d.getHours()).padStart(2, "0")}:00`
        : trunc === "month"
          ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
          : `${d.getMonth() + 1}/${d.getDate()}`;
    return { label, revenue: money(revenue).toNumber(), cost: money(cost).toNumber(), profit: money(revenue - cost).toNumber() };
  });
}

export interface CategorySlice {
  name: string;
  nameAr: string | null;
  value: number;
}

export async function getSalesByCategory(days = 30): Promise<CategorySlice[]> {
  const fromDate = new Date(Date.now() - days * 86400000);
  const rows = await db.saleItem.groupBy({
    by: ["productId"],
    _sum: { lineTotal: true },
    where: { sale: { saleDate: { gte: fromDate }, status: { in: ["COMPLETED", "PARTIALLY_REFUNDED"] } } },
  });
  // Resolve category per product in one query
  const productIds = rows.map((r) => r.productId);
  if (!productIds.length) return [];
  const products = await db.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, category: { select: { name: true, nameAr: true } } },
  });
  const catMap = new Map<string, { name: string; nameAr: string | null; value: number }>();
  for (const r of rows) {
    const p = products.find((x) => x.id === r.productId);
    if (!p) continue;
    const key = p.category.name;
    const entry = catMap.get(key) ?? { name: p.category.name, nameAr: p.category.nameAr, value: 0 };
    entry.value += D(r._sum.lineTotal).toNumber();
    catMap.set(key, entry);
  }
  const sorted = [...catMap.values()].sort((a, b) => b.value - a.value);
  if (sorted.length > 6) {
    const other = sorted.slice(5).reduce((acc, s) => acc + s.value, 0);
    return [...sorted.slice(0, 5), { name: "Other", nameAr: "أخرى", value: money(other).toNumber() }];
  }
  return sorted.map((s) => ({ ...s, value: money(s.value).toNumber() }));
}

export interface TopProductRow {
  id: string;
  name: string;
  nameAr: string | null;
  qty: number;
  revenue: number;
  profit: number;
}

export async function getTopProducts(days = 30, limit = 5): Promise<TopProductRow[]> {
  const fromDate = new Date(Date.now() - days * 86400000);
  // Raw SQL: profit needs per-row arithmetic groupBy cannot express.
  const result = await db.$queryRaw<{ id: string; name: string; name_ar: string | null; qty: string; revenue: string; profit: string }[]>`
    SELECT p.id, p.name, p."nameAr" AS name_ar,
           SUM(si.quantity) AS qty,
           SUM(si."lineTotal") AS revenue,
           SUM(si."lineTotal" - si.quantity * si."costPrice") AS profit
    FROM sale_items si
    JOIN sales s ON s.id = si."saleId"
    JOIN products p ON p.id = si."productId"
    WHERE s."saleDate" >= ${fromDate} AND s.status IN ('COMPLETED', 'PARTIALLY_REFUNDED')
    GROUP BY p.id, p.name, p."nameAr"
    ORDER BY revenue DESC
    LIMIT ${limit}`;
  return result.map((r) => ({
    id: r.id,
    name: r.name,
    nameAr: r.name_ar,
    qty: parseFloat(String(r.qty)),
    revenue: money(parseFloat(String(r.revenue))).toNumber(),
    profit: money(parseFloat(String(r.profit))).toNumber(),
  }));
}

export interface RecentSaleRow {
  id: string;
  invoiceNumber: string;
  customerName: string | null;
  cashierName: string;
  total: string;
  paymentMethod: string;
  saleDate: Date;
  status: string;
}

export async function getRecentSales(limit = 7): Promise<RecentSaleRow[]> {
  const sales = await db.sale.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      customer: { select: { name: true, nameAr: true } },
      cashier: { select: { fullName: true, fullNameAr: true } },
      payments: { select: { method: true, amount: true }, take: 3 },
    },
  });
  return sales.map((s) => ({
    id: s.id,
    invoiceNumber: s.invoiceNumber,
    customerName: s.customer?.name ?? null,
    cashierName: s.cashier.fullName,
    total: String(s.total),
    paymentMethod: s.payments.map((p) => p.method).join("+") || "—",
    saleDate: s.saleDate,
    status: s.status,
  }));
}

// Low-stock and expiring-batch queries live in the inventory service
// (single source of truth); dashboard re-exports them for its panels.
export { listLowStock, listExpiringBatches } from "@/features/inventory/service";



