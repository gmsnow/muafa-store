import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getT } from "@/shared/i18n";
import { formatMoney, formatNumber } from "@/shared/core/format";
import { parseReportRange } from "@/features/reports/schema";
import { purchasesReport } from "@/features/reports/service";
import { ReportHeader, SummaryCards, ReportSection } from "@/features/reports/ui/report-shell";

export default async function PurchasesReportPage({ searchParams }: PageProps<"/reports/purchases">) {
  const { t, locale } = await getT();
  const sp = await searchParams;
  const range = parseReportRange({ from: sp.from, to: sp.to });
  const { summary, buckets, bySupplier } = await purchasesReport(range);

  return (
    <div className="space-y-4" id="pdf-paper">
      <ReportHeader
        title={t.reports.purchasesReport} basePath="/reports/purchases" family="purchases"
        fromISO={range.fromISO} toISO={range.toISO}
      />
      <SummaryCards items={[
        { label: t.reports.docsCount, value: formatNumber(summary.docs, locale) },
        { label: t.common.total, value: formatMoney(summary.gross, locale), accent: true },
        { label: t.common.discount, value: formatMoney(summary.discounts, locale) },
        { label: t.reports.totalPaid, value: formatMoney(summary.paid, locale) },
        { label: t.reports.outstanding, value: formatMoney(summary.due, locale) },
        { label: t.reports.returns, value: formatMoney(summary.returnsTotal, locale) },
      ]} />

      <div className="grid gap-4 lg:grid-cols-2">
        <ReportSection title={t.reports.byDay}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.reports.dateRange}</TableHead>
                <TableHead className="text-end">{t.common.total}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {buckets.map((b) => (
                <TableRow key={b.day}>
                  <TableCell dir="ltr">{b.day}</TableCell>
                  <TableCell className="text-end tabular-nums">{formatMoney(b.total, locale)}</TableCell>
                </TableRow>
              ))}
              {buckets.length === 0 && (
                <TableRow><TableCell colSpan={2} className="h-20 text-center text-muted-foreground">{t.common.noData}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </ReportSection>

        <ReportSection title={t.reports.bySupplier}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.reports.supplierCol}</TableHead>
                <TableHead className="text-end">{t.reports.docsCount}</TableHead>
                <TableHead className="text-end">{t.common.total}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bySupplier.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.nameAr ?? s.name}</TableCell>
                  <TableCell className="text-end tabular-nums">{formatNumber(s.qty, locale)}</TableCell>
                  <TableCell className="text-end tabular-nums">{formatMoney(s.total, locale)}</TableCell>
                </TableRow>
              ))}
              {bySupplier.length === 0 && (
                <TableRow><TableCell colSpan={3} className="h-20 text-center text-muted-foreground">{t.common.noData}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </ReportSection>
      </div>
    </div>
  );
}
