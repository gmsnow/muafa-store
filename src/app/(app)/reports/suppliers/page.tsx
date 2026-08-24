import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getT } from "@/shared/i18n";
import { formatMoney, formatNumber } from "@/shared/core/format";
import { parseReportRange } from "@/features/reports/schema";
import { suppliersReport } from "@/features/reports/service";
import { ReportHeader, SummaryCards, ReportSection } from "@/features/reports/ui/report-shell";

export default async function SuppliersReportPage({ searchParams }: PageProps<"/reports/suppliers">) {
  const { t, locale } = await getT();
  const sp = await searchParams;
  const range = parseReportRange({ from: sp.from, to: sp.to });
  const { items, totals } = await suppliersReport(range);

  return (
    <div className="space-y-4" id="pdf-paper">
      <ReportHeader
        title={t.reports.suppliersReport} basePath="/reports/suppliers" family="suppliers"
        fromISO={range.fromISO} toISO={range.toISO}
      />
      <SummaryCards items={[
        { label: t.reports.purchaseVolume, value: formatMoney(totals.purchaseVolume, locale), accent: true },
        { label: t.reports.payables, value: formatMoney(totals.payables, locale) },
        { label: formatNumber(items.length, locale), value: t.procurement.suppliersTitle },
      ]} />

      <ReportSection title={t.reports.bySupplier}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t.customers.code}</TableHead>
              <TableHead>{t.reports.supplierCol}</TableHead>
              <TableHead className="text-end">{t.reports.docsCount}</TableHead>
              <TableHead className="text-end">{t.reports.purchaseVolume}</TableHead>
              <TableHead className="text-end">{t.reports.returns}</TableHead>
              <TableHead className="text-end">{t.reports.payables}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-mono text-xs" dir="ltr">{s.code}</TableCell>
                <TableCell className="max-w-48 truncate font-medium">
                  {s.nameAr ?? s.name}
                </TableCell>
                <TableCell className="text-end tabular-nums">{formatNumber(s.docs, locale)}</TableCell>
                <TableCell className="text-end tabular-nums">{formatMoney(s.purchases, locale)}</TableCell>
                <TableCell className="text-end tabular-nums text-muted-foreground">{formatMoney(s.returnsTotal, locale)}</TableCell>
                <TableCell className={`text-end tabular-nums ${s.balance > 0 ? "font-medium text-amber-600" : "text-muted-foreground"}`}>
                  {formatMoney(s.balance, locale)}
                </TableCell>
              </TableRow>
            ))}
            {items.length === 0 && (
              <TableRow><TableCell colSpan={6} className="h-20 text-center text-muted-foreground">{t.common.noData}</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </ReportSection>
    </div>
  );
}
