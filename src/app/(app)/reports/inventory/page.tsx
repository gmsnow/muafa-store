import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { getT } from "@/shared/i18n";
import { formatMoney, formatNumber } from "@/shared/core/format";
import { parseReportRange } from "@/features/reports/schema";
import { inventoryValuation } from "@/features/reports/service";
import { ReportHeader, SummaryCards, ReportSection } from "@/features/reports/ui/report-shell";

export default async function InventoryReportPage({ searchParams }: PageProps<"/reports/inventory">) {
  const { t, locale } = await getT();
  const sp = await searchParams;
  parseReportRange({ from: sp.from, to: sp.to }); // normalize (valuation is point-in-time)
  const { items, totals } = await inventoryValuation();

  return (
    <div className="space-y-4" id="pdf-paper">
      <ReportHeader
        title={t.reports.inventoryReport} basePath="/reports/inventory" family="inventory"
        fromISO={parseReportRange({}).fromISO} toISO={parseReportRange({}).toISO}
      />
      <SummaryCards items={[
        { label: t.reports.stockValue, value: formatMoney(totals.stockValue, locale), accent: true },
        { label: t.reports.retailValue, value: formatMoney(totals.retailValue, locale) },
        { label: t.reports.potentialProfit, value: formatMoney(totals.potentialProfit, locale) },
        { label: `${t.stock.lowStockTitle}`, value: formatNumber(totals.lowCount, locale) },
        { label: `${t.stock.outOfStockTitle}`, value: formatNumber(totals.outCount, locale) },
      ]} />

      <p className="text-xs text-muted-foreground">
        {t.reports.inventoryValue}: Σ({t.products.currentStock} × {t.products.costPrice})
      </p>

      <ReportSection title={`${formatNumber(items.length, locale)} ${t.nav.products}`}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t.products.sku}</TableHead>
              <TableHead>{t.products.name}</TableHead>
              <TableHead>{t.products.category}</TableHead>
              <TableHead className="text-end">{t.products.currentStock}</TableHead>
              <TableHead className="text-end">{t.products.costPrice}</TableHead>
              <TableHead className="text-end">{t.reports.stockValue}</TableHead>
              <TableHead className="text-end">{t.reports.retailValue}</TableHead>
              <TableHead className="text-end">{t.reports.potentialProfit}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((i) => (
              <TableRow key={i.productId}>
                <TableCell className="font-mono text-xs" dir="ltr">{i.sku}</TableCell>
                <TableCell className="max-w-48 truncate font-medium">
                  {i.nameAr ?? i.name}
                </TableCell>
                <TableCell className="text-muted-foreground">{i.categoryName}</TableCell>
                <TableCell className="text-end tabular-nums">
                  {i.low ? (
                    <Badge variant={i.quantity <= 0 ? "destructive" : "secondary"}>{formatNumber(i.quantity, locale)}</Badge>
                  ) : (
                    formatNumber(i.quantity, locale)
                  )}
                </TableCell>
                <TableCell className="text-end tabular-nums text-muted-foreground">{formatMoney(i.costPrice, locale)}</TableCell>
                <TableCell className="text-end tabular-nums font-medium">{formatMoney(i.stockValue, locale)}</TableCell>
                <TableCell className="text-end tabular-nums">{formatMoney(i.retailValue, locale)}</TableCell>
                <TableCell className="text-end tabular-nums text-emerald-600">{formatMoney(i.potentialProfit, locale)}</TableCell>
              </TableRow>
            ))}
            {items.length === 0 && (
              <TableRow><TableCell colSpan={8} className="h-20 text-center text-muted-foreground">{t.common.noData}</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </ReportSection>
    </div>
  );
}
