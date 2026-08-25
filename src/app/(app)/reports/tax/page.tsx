import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getT } from "@/shared/i18n";
import { formatMoney } from "@/shared/core/format";
import { parseReportRange } from "@/features/reports/schema";
import { taxReport } from "@/features/reports/service";
import { ReportHeader, SummaryCards, ReportSection } from "@/features/reports/ui/report-shell";

export default async function TaxReportPage({ searchParams }: PageProps<"/reports/tax">) {
  const { t, locale } = await getT();
  const sp = await searchParams;
  const range = parseReportRange({ from: sp.from, to: sp.to });
  const tax = await taxReport(range);

  return (
    <div className="space-y-4" id="pdf-paper">
      <ReportHeader
        title={t.reports.taxReport} basePath="/reports/tax" family="tax"
        fromISO={range.fromISO} toISO={range.toISO}
      />
      <SummaryCards items={[
        { label: t.reports.outputTax, value: formatMoney(tax.outputTax, locale) },
        { label: t.reports.inputTax, value: formatMoney(tax.inputTax, locale) },
        { label: t.reports.netTaxPayable, value: formatMoney(tax.netPayable, locale), accent: true },
      ]} />

      <p className="text-xs text-muted-foreground">
        {t.reports.netTaxPayable} = {t.reports.outputTax} − {t.reports.inputTax}
      </p>

      <ReportSection title={t.reports.byMonth}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>—</TableHead>
              <TableHead className="text-end">{t.reports.outputTax}</TableHead>
              <TableHead className="text-end">{t.reports.inputTax}</TableHead>
              <TableHead className="text-end">{t.reports.netTaxPayable}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tax.monthly.map((m) => (
              <TableRow key={m.month}>
                <TableCell dir="ltr" className="font-medium">{m.month}</TableCell>
                <TableCell className="text-end tabular-nums">{formatMoney(m.output, locale)}</TableCell>
                <TableCell className="text-end tabular-nums text-muted-foreground">{formatMoney(m.input, locale)}</TableCell>
                <TableCell className={`text-end tabular-nums font-bold ${m.net < 0 ? "text-destructive" : ""}`}>
                  {formatMoney(m.net, locale)}
                </TableCell>
              </TableRow>
            ))}
            {tax.monthly.length === 0 && (
              <TableRow><TableCell colSpan={4} className="h-20 text-center text-muted-foreground">{t.common.noData}</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </ReportSection>
    </div>
  );
}
