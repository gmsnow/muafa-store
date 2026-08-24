import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { getT } from "@/shared/i18n";
import { formatMoney, formatNumber } from "@/shared/core/format";
import { parseReportRange } from "@/features/reports/schema";
import { expensesReport } from "@/features/reports/service";
import { ReportHeader, SummaryCards, ReportSection } from "@/features/reports/ui/report-shell";

export default async function ExpensesReportPage({ searchParams }: PageProps<"/reports/expenses">) {
  const { t, locale } = await getT();
  const sp = await searchParams;
  const range = parseReportRange({ from: sp.from, to: sp.to });
  const data = await expensesReport(range);

  return (
    <div className="space-y-4" id="pdf-paper">
      <ReportHeader
        title={t.reports.expensesReport} basePath="/reports/expenses" family="expenses"
        fromISO={range.fromISO} toISO={range.toISO}
      />
      <SummaryCards items={[
        { label: t.reports.operatingExpenses, value: formatMoney(data.grandTotal, locale), accent: true },
        { label: formatNumber(data.byMethod.reduce((a, m) => a + m.count, 0), locale), value: t.reports.docsCount },
      ]} />

      <div className="grid gap-4 lg:grid-cols-2">
        <ReportSection title={t.reports.byCategory}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.products.category}</TableHead>
                <TableHead className="text-end">{t.reports.docsCount}</TableHead>
                <TableHead className="text-end">{t.common.total}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.byCategory.map((c) => (
                <TableRow key={c.categoryId}>
                  <TableCell className="font-medium">{c.nameAr ?? c.name}</TableCell>
                  <TableCell className="text-end tabular-nums">{formatNumber(c.count, locale)}</TableCell>
                  <TableCell className="text-end tabular-nums">{formatMoney(c.total, locale)}</TableCell>
                </TableRow>
              ))}
              {data.byCategory.length === 0 && (
                <TableRow><TableCell colSpan={3} className="h-20 text-center text-muted-foreground">{t.common.noData}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </ReportSection>

        <div className="space-y-4">
          <ReportSection title={t.reports.byMethod}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.expensesPage.method}</TableHead>
                  <TableHead className="text-end">{t.reports.docsCount}</TableHead>
                  <TableHead className="text-end">{t.common.total}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.byMethod.map((m) => (
                  <TableRow key={m.method}>
                    <TableCell><Badge variant="outline">{m.method}</Badge></TableCell>
                    <TableCell className="text-end tabular-nums">{formatNumber(m.count, locale)}</TableCell>
                    <TableCell className="text-end tabular-nums">{formatMoney(m.total, locale)}</TableCell>
                  </TableRow>
                ))}
                {data.byMethod.length === 0 && (
                  <TableRow><TableCell colSpan={3} className="h-20 text-center text-muted-foreground">{t.common.noData}</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </ReportSection>

          <ReportSection title={t.reports.byDay}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.reports.dateRange}</TableHead>
                  <TableHead className="text-end">{t.common.total}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.buckets.map((b) => (
                  <TableRow key={b.day}>
                    <TableCell dir="ltr">{b.day}</TableCell>
                    <TableCell className="text-end tabular-nums">{formatMoney(b.total, locale)}</TableCell>
                  </TableRow>
                ))}
                {data.buckets.length === 0 && (
                  <TableRow><TableCell colSpan={2} className="h-20 text-center text-muted-foreground">{t.common.noData}</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </ReportSection>
        </div>
      </div>
    </div>
  );
}
