import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getT } from "@/shared/i18n";
import { formatMoney, formatNumber } from "@/shared/core/format";
import { parseReportRange } from "@/features/reports/schema";
import { salesReport } from "@/features/reports/service";
import { ReportHeader, SummaryCards, ReportSection } from "@/features/reports/ui/report-shell";

export default async function SalesReportPage({ searchParams }: PageProps<"/reports/sales">) {
  const { t, locale } = await getT();
  const sp = await searchParams;
  const range = parseReportRange({ from: sp.from, to: sp.to });
  const { summary, buckets, byCashier, products } = await salesReport(range);

  return (
    <div className="space-y-4" id="pdf-paper">
      <ReportHeader
        title={t.reports.salesReport} basePath="/reports/sales" family="sales"
        fromISO={range.fromISO} toISO={range.toISO}
      />
      <SummaryCards items={[
        { label: t.reports.invoicesCol, value: formatNumber(summary.invoices, locale) },
        { label: t.reports.grossSales, value: formatMoney(summary.grossSales, locale) },
        { label: t.reports.returns, value: formatMoney(summary.returnsTotal, locale) },
        { label: t.reports.netSales, value: formatMoney(summary.netSales, locale), accent: true },
        { label: t.reports.cogs, value: formatMoney(summary.cogs, locale) },
        { label: t.common.discount, value: formatMoney(summary.discounts, locale) },
        { label: t.reports.avgTicket, value: formatMoney(summary.avgTicket, locale) },
      ]} />

      <ReportSection title={t.reports.byDay}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t.reports.dateRange}</TableHead>
              <TableHead className="text-end">{t.reports.revenueCol}</TableHead>
              <TableHead className="text-end">{t.reports.cogs}</TableHead>
              <TableHead className="text-end">{t.reports.grossProfit}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {buckets.map((b) => (
              <TableRow key={b.day}>
                <TableCell dir="ltr">{b.day}</TableCell>
                <TableCell className="text-end tabular-nums">{formatMoney(b.revenue, locale)}</TableCell>
                <TableCell className="text-end tabular-nums text-muted-foreground">{formatMoney(b.cost, locale)}</TableCell>
                <TableCell className="text-end tabular-nums font-medium">{formatMoney(b.profit, locale)}</TableCell>
              </TableRow>
            ))}
            {buckets.length === 0 && (
              <TableRow><TableCell colSpan={4} className="h-20 text-center text-muted-foreground">{t.common.noData}</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </ReportSection>

      <div className="grid gap-4 lg:grid-cols-2">
        <ReportSection title={t.reports.cashierReport}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.usersPage.fullName}</TableHead>
                <TableHead className="text-end">{t.reports.invoicesCol}</TableHead>
                <TableHead className="text-end">{t.reports.netSales}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byCashier.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.nameAr ?? c.name}</TableCell>
                  <TableCell className="text-end tabular-nums">{formatNumber(c.qty, locale)}</TableCell>
                  <TableCell className="text-end tabular-nums">{formatMoney(c.total, locale)}</TableCell>
                </TableRow>
              ))}
              {byCashier.length === 0 && (
                <TableRow><TableCell colSpan={3} className="h-20 text-center text-muted-foreground">{t.common.noData}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </ReportSection>

        <ReportSection title={t.reports.productPerformance}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.products.name}</TableHead>
                <TableHead className="text-end">{t.reports.unitsSold}</TableHead>
                <TableHead className="text-end">{t.reports.revenueCol}</TableHead>
                <TableHead className="text-end">{t.reports.grossProfit}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="max-w-48 truncate font-medium">{p.nameAr ?? p.name}</TableCell>
                  <TableCell className="text-end tabular-nums">{formatNumber(p.qty, locale)}</TableCell>
                  <TableCell className="text-end tabular-nums">{formatMoney(p.total, locale)}</TableCell>
                  <TableCell className="text-end tabular-nums font-medium">{formatMoney(p.profit, locale)}</TableCell>
                </TableRow>
              ))}
              {products.length === 0 && (
                <TableRow><TableCell colSpan={4} className="h-20 text-center text-muted-foreground">{t.common.noData}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </ReportSection>
      </div>
    </div>
  );
}
