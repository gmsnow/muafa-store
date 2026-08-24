import Link from "next/link";
import {
  AlertTriangle, Boxes, CalendarClock, PackageX, ShoppingCart,
  TrendingDown, TrendingUp, Truck, UsersRound,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getT } from "@/shared/i18n";
import { formatMoney, formatNumber, formatDateTime, formatDate } from "@/shared/core/format";
import {
  getDashboardKpis, getRecentSales, listExpiringBatches, listLowStock,
  getSalesByCategory, getSalesSeries, getTopProducts, type ChartRange,
} from "@/features/dashboard/service";
import { StatCard } from "@/features/dashboard/ui/stat-card";
import { SalesChartLazy } from "@/features/dashboard/ui/sales-chart-lazy";

const RANGES: ChartRange[] = ["today", "week", "month", "year"];

export default async function DashboardPage({
  searchParams,
}: PageProps<"/dashboard">) {
  const { t, locale } = await getT();
  const params = await searchParams;
  const range: ChartRange = RANGES.includes(params.range as ChartRange) ? (params.range as ChartRange) : "month";

  const [kpis, series, categories, topProducts, recentSales, lowStock, expiring] = await Promise.all([
    getDashboardKpis(),
    getSalesSeries(range),
    getSalesByCategory(30),
    getTopProducts(30),
    getRecentSales(),
    listLowStock(6),
    listExpiringBatches(undefined, 6),
  ]);

  const salesTrend =
    kpis.yesterdaySales > 0
      ? ((kpis.todaySales - kpis.yesterdaySales) / kpis.yesterdaySales) * 100
      : kpis.todaySales > 0
        ? 100
        : null;

  const catTotal = categories.reduce((a, c) => a + c.value, 0);
  const catColors = ["var(--color-chart-1)", "var(--color-chart-2)", "var(--color-chart-3)", "var(--color-chart-4)", "var(--color-chart-5)", "var(--muted-foreground)"];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t.dashboard.title}</h1>
          <p className="text-sm text-muted-foreground">{t.dashboard.welcome}</p>
        </div>
        <Tabs defaultValue={range}>
          <TabsList>
            {RANGES.map((r) => (
              <TabsTrigger key={r} value={r} asChild>
                <Link href={`/dashboard?range=${r}`}>{t.common[r]}</Link>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard title={t.dashboard.todaysSales} value={formatMoney(kpis.todaySales, locale)} icon={TrendingUp} trendPercent={salesTrend} trendLabel={t.dashboard.vsYesterday} tone="success" />
        <StatCard title={t.dashboard.todaysProfit} value={formatMoney(kpis.todayProfit, locale)} icon={(kpis.todayProfit >= 0 ? TrendingUp : TrendingDown)} tone="default" />
        <StatCard title={t.dashboard.todaysPurchases} value={formatMoney(kpis.todayPurchases, locale)} icon={Truck} />
        <StatCard title={t.dashboard.todaysOrders} value={formatNumber(kpis.todayOrders, locale)} icon={ShoppingCart} />
        <StatCard title={t.dashboard.totalProducts} value={formatNumber(kpis.totalProducts, locale)} icon={Boxes} />
        <StatCard title={t.dashboard.lowStockProducts} value={formatNumber(kpis.lowStock, locale)} icon={AlertTriangle} tone="warning" />
        <StatCard title={t.dashboard.outOfStock} value={formatNumber(kpis.outOfStock, locale)} icon={PackageX} tone="danger" />
        <StatCard title={t.dashboard.totalCustomers} value={formatNumber(kpis.totalCustomers, locale)} icon={UsersRound} />
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">{t.dashboard.salesChart}</CardTitle></CardHeader>
          <CardContent>
            <SalesChartLazy
              data={series}
              labels={{ revenue: t.dashboard.revenue, cost: t.dashboard.cost, profit: t.dashboard.profit }}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">{t.dashboard.salesByCategory}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {categories.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">{t.common.noData}</p>}
            {categories.map((c, i) => (
              <div key={c.name}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="truncate font-medium">{c.nameAr ?? c.name}</span>
                  <span className="text-muted-foreground">{catTotal > 0 ? Math.round((c.value / catTotal) * 100) : 0}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${catTotal > 0 ? (c.value / catTotal) * 100 : 0}%`, backgroundColor: catColors[i % catColors.length] }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Top products + recent sales */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">{t.dashboard.topProducts}</CardTitle></CardHeader>
          <CardContent className="px-0 pb-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.dashboard.productCol}</TableHead>
                  <TableHead className="text-end">{t.dashboard.qtySold}</TableHead>
                  <TableHead className="text-end">{t.dashboard.revenue}</TableHead>
                  <TableHead className="text-end">{t.dashboard.profit}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topProducts.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="max-w-40 truncate font-medium">{p.nameAr ?? p.name}</TableCell>
                    <TableCell className="text-end">{formatNumber(p.qty, locale)}</TableCell>
                    <TableCell className="text-end">{formatMoney(p.revenue, locale)}</TableCell>
                    <TableCell className="text-end text-emerald-600 dark:text-emerald-400">{formatMoney(p.profit, locale)}</TableCell>
                  </TableRow>
                ))}
                {topProducts.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground">{t.common.noData}</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">{t.dashboard.recentSales}</CardTitle></CardHeader>
          <CardContent className="px-0 pb-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.dashboard.invoice}</TableHead>
                  <TableHead>{t.dashboard.cashier}</TableHead>
                  <TableHead className="text-end">{t.common.total}</TableHead>
                  <TableHead>{t.common.date}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentSales.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-xs" dir="ltr">{s.invoiceNumber}</TableCell>
                    <TableCell className="max-w-28 truncate">{s.cashierName}</TableCell>
                    <TableCell className="text-end">{formatMoney(s.total, locale)}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(s.saleDate, locale)}</TableCell>
                  </TableRow>
                ))}
                {recentSales.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground">{t.common.noData}</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Low stock + expiring */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="size-4 text-amber-500" />{t.dashboard.lowStockPanel}</CardTitle>
            <Link href="/inventory/stock" className="text-xs text-primary hover:underline">{t.common.view} →</Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {lowStock.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">{t.common.noData}</p>}
            {lowStock.map((r) => (
              <div key={r.productId} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{r.nameAr ?? r.name}</p>
                  <p className="font-mono text-[11px] text-muted-foreground" dir="ltr">{r.sku}</p>
                </div>
                <Badge variant={r.quantity <= 0 ? "destructive" : "secondary"}>
                  {formatNumber(r.quantity, locale)} / {formatNumber(Math.max(r.minStock, r.reorderLevel), locale)}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-base"><CalendarClock className="size-4 text-orange-500" />{t.dashboard.expiringPanel}</CardTitle>
            <Link href="/inventory/expiring" className="text-xs text-primary hover:underline">{t.common.view} â†’</Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {expiring.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">{t.common.noData}</p>}
            {expiring.map((b) => {
              const daysLeft = b.daysLeft;
              return (
                <div key={b.batchId} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{b.nameAr ?? b.name}</p>
                    <p className="font-mono text-[11px] text-muted-foreground" dir="ltr">{b.batchNo}</p>
                  </div>
                  <Badge variant={daysLeft !== null && daysLeft <= 0 ? "destructive" : daysLeft !== null && daysLeft <= 7 ? "destructive" : "secondary"}>
                    {daysLeft !== null && daysLeft <= 0 ? t.stock.expired : formatDate(b.expiryDate!, locale)}
                  </Badge>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}




