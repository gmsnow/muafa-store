import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { getT } from "@/shared/i18n";
import { formatMoney, formatNumber } from "@/shared/core/format";
import { parseReportRange } from "@/features/reports/schema";
import { customersReport } from "@/features/reports/service";
import { ReportHeader, SummaryCards, ReportSection } from "@/features/reports/ui/report-shell";

export default async function CustomersReportPage({ searchParams }: PageProps<"/reports/customers">) {
  const { t, locale } = await getT();
  const sp = await searchParams;
  const range = parseReportRange({ from: sp.from, to: sp.to });
  const { items, totals } = await customersReport(range);

  return (
    <div className="space-y-4" id="pdf-paper">
      <ReportHeader
        title={t.reports.customersReport} basePath="/reports/customers" family="customers"
        fromISO={range.fromISO} toISO={range.toISO}
      />
      <SummaryCards items={[
        { label: t.reports.activeCustomers, value: formatNumber(totals.activeCustomers, locale) },
        { label: t.reports.receivables, value: formatMoney(totals.receivables, locale), accent: true },
        { label: t.reports.overLimit, value: formatNumber(totals.overLimit, locale) },
        { label: t.reports.loyaltyPts, value: formatNumber(totals.loyaltyPointsOutstanding, locale) },
      ]} />

      <ReportSection title={`${formatNumber(items.length, locale)} ${t.nav.customers}`}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t.customers.code}</TableHead>
              <TableHead>{t.reports.customerCol}</TableHead>
              <TableHead className="text-end">{t.reports.invoicesCol}</TableHead>
              <TableHead className="text-end">{t.reports.revenueCol}</TableHead>
              <TableHead className="text-end">{t.reports.outstanding}</TableHead>
              <TableHead className="text-end">{t.customers.creditLimit}</TableHead>
              <TableHead className="text-end">{t.reports.loyaltyPts}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-mono text-xs" dir="ltr">{c.code}</TableCell>
                <TableCell className="max-w-48 truncate font-medium">
                  {c.nameAr ?? c.name}
                  {c.creditLimit > 0 && c.balance > c.creditLimit && (
                    <Badge variant="destructive" className="ms-2">{t.reports.overLimit}</Badge>
                  )}
                </TableCell>
                <TableCell className="text-end tabular-nums">{formatNumber(c.invoices, locale)}</TableCell>
                <TableCell className="text-end tabular-nums">{formatMoney(c.purchases, locale)}</TableCell>
                <TableCell className={`text-end tabular-nums ${c.balance > 0 ? "font-medium text-amber-600" : "text-muted-foreground"}`}>
                  {formatMoney(c.balance, locale)}
                </TableCell>
                <TableCell className="text-end tabular-nums text-muted-foreground">{formatMoney(c.creditLimit, locale)}</TableCell>
                <TableCell className="text-end tabular-nums text-muted-foreground">{formatNumber(c.loyaltyPoints, locale)}</TableCell>
              </TableRow>
            ))}
            {items.length === 0 && (
              <TableRow><TableCell colSpan={7} className="h-20 text-center text-muted-foreground">{t.common.noData}</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </ReportSection>
    </div>
  );
}
