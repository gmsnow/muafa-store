import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { getT } from "@/shared/i18n";
import { formatMoney } from "@/shared/core/format";
import { parseReportRange } from "@/features/reports/schema";
import { financialSummary } from "@/features/reports/service";
import { ReportHeader, SummaryCards, ReportSection } from "@/features/reports/ui/report-shell";

/** §25 — Financial summary: P&L block + balance snapshot, one documented view. */
export default async function FinancialSummaryPage({ searchParams }: PageProps<"/reports/summary">) {
  const { t, locale } = await getT();
  const sp = await searchParams;
  const range = parseReportRange({ from: sp.from, to: sp.to });
  const s = await financialSummary(range);
  const p = s.profit;

  const lines = [
    { label: t.reports.netSales, value: p.netSales, bold: false },
    { label: `− ${t.reports.cogs}`, value: -p.cogs, bold: false },
    { label: `= ${t.reports.grossProfit}`, value: p.grossProfit, bold: true },
    { label: `− ${t.reports.operatingExpenses}`, value: -p.expenses, bold: false },
    { label: `= ${t.reports.netProfit}`, value: p.netProfit, bold: true },
  ];

  return (
    <div className="space-y-4" id="pdf-paper">
      <ReportHeader
        title={t.reports.financialSummary} basePath="/reports/summary" family="profit"
        fromISO={range.fromISO} toISO={range.toISO}
      />
      <SummaryCards items={[
        { label: t.reports.netProfit, value: formatMoney(p.netProfit, locale), accent: true },
        { label: t.reports.margin, value: `${p.marginPercent}%` },
        { label: t.reports.inventoryValue ?? t.stock.stockValue, value: formatMoney(s.inventoryTotals.stockValue, locale) },
      ]} />

      <div className="grid gap-4 lg:grid-cols-3">
        <ReportSection title={`${t.reports.financialSummary} — الأداء`}>
          <Table>
            <TableBody>
              {lines.map((l) => (
                <TableRow key={l.label}>
                  <TableCell className={l.bold ? "font-bold" : "text-muted-foreground"}>{l.label}</TableCell>
                  <TableCell dir="ltr"
                    className={`text-end tabular-nums ${l.bold ? "font-bold" : ""} ${l.value < 0 ? "text-destructive" : ""}`}>
                    {formatMoney(l.value, locale)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ReportSection>

        <Card className="lg:col-span-2">
          <CardContent className="px-0 pb-0">
            <div className="border-b px-4 py-3">
              <h2 className="text-sm font-semibold">المركز المالي اللحظي</h2>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>—</TableHead>
                  <TableHead className="text-end">{t.common.total}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>{t.reports.receivables}</TableCell>
                  <TableCell dir="ltr" className="text-end font-medium tabular-nums text-amber-600">{formatMoney(s.receivables, locale)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>{t.reports.payables}</TableCell>
                  <TableCell dir="ltr" className="text-end font-medium tabular-nums">{formatMoney(s.payables, locale)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>{t.reports.stockValue}</TableCell>
                  <TableCell dir="ltr" className="text-end font-medium tabular-nums">{formatMoney(s.inventoryTotals.stockValue, locale)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground">
        {t.reports.formulaNetSales} · {t.reports.formulaProfit}
      </p>

      <ReportSection title={t.reports.byMonth}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>—</TableHead>
              <TableHead className="text-end">{t.reports.netSales}</TableHead>
              <TableHead className="text-end">{t.reports.grossProfit}</TableHead>
              <TableHead className="text-end">{t.reports.operatingExpenses}</TableHead>
              <TableHead className="text-end">{t.reports.netProfit}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {p.monthly.map((m) => (
              <TableRow key={m.month}>
                <TableCell dir="ltr" className="font-medium">{m.month}</TableCell>
                <TableCell className="text-end tabular-nums">{formatMoney(m.sales, locale)}</TableCell>
                <TableCell className="text-end tabular-nums">{formatMoney(m.grossProfit, locale)}</TableCell>
                <TableCell className="text-end tabular-nums text-muted-foreground">{formatMoney(m.expenses, locale)}</TableCell>
                <TableCell className={`text-end tabular-nums font-bold ${m.netProfit < 0 ? "text-destructive" : ""}`}>
                  {formatMoney(m.netProfit, locale)}
                </TableCell>
              </TableRow>
            ))}
            {p.monthly.length === 0 && (
              <TableRow><TableCell colSpan={5} className="h-20 text-center text-muted-foreground">{t.common.noData}</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </ReportSection>
    </div>
  );
}
