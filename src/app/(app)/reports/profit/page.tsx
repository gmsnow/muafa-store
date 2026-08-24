import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getT } from "@/shared/i18n";
import { formatMoney } from "@/shared/core/format";
import { parseReportRange } from "@/features/reports/schema";
import { profitReport } from "@/features/reports/service";
import { ReportHeader, SummaryCards, ReportSection } from "@/features/reports/ui/report-shell";

export default async function ProfitReportPage({ searchParams }: PageProps<"/reports/profit">) {
  const { t, locale } = await getT();
  const sp = await searchParams;
  const range = parseReportRange({ from: sp.from, to: sp.to });
  const p = await profitReport(range);

  return (
    <div className="space-y-4" id="pdf-paper">
      <ReportHeader
        title={t.reports.profitReport} basePath="/reports/profit" family="profit"
        fromISO={range.fromISO} toISO={range.toISO}
      />
      <SummaryCards items={[
        { label: t.reports.netSales, value: formatMoney(p.netSales, locale) },
        { label: t.reports.cogs, value: formatMoney(p.cogs, locale) },
        { label: t.reports.grossProfit, value: formatMoney(p.grossProfit, locale), accent: true },
        { label: `${t.reports.margin}`, value: `${p.marginPercent}%` },
        { label: t.reports.operatingExpenses, value: formatMoney(p.expenses, locale) },
        { label: t.reports.netProfit, value: formatMoney(p.netProfit, locale), accent: true },
      ]} />

      <p className="text-xs text-muted-foreground">{t.reports.formulaProfit}</p>

      <ReportSection title={t.reports.byMonth}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>—</TableHead>
              <TableHead className="text-end">{t.reports.netSales}</TableHead>
              <TableHead className="text-end">{t.reports.cogs}</TableHead>
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
                <TableCell className="text-end tabular-nums text-muted-foreground">{formatMoney(m.cogs, locale)}</TableCell>
                <TableCell className="text-end tabular-nums font-medium">{formatMoney(m.grossProfit, locale)}</TableCell>
                <TableCell className="text-end tabular-nums text-muted-foreground">{formatMoney(m.expenses, locale)}</TableCell>
                <TableCell className={`text-end tabular-nums font-bold ${m.netProfit < 0 ? "text-destructive" : ""}`}>
                  {formatMoney(m.netProfit, locale)}
                </TableCell>
              </TableRow>
            ))}
            {p.monthly.length === 0 && (
              <TableRow><TableCell colSpan={6} className="h-20 text-center text-muted-foreground">{t.common.noData}</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </ReportSection>
    </div>
  );
}
