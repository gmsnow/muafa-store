import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { firstParam, Pagination, clampPage } from "@/components/pagination";
import { getT } from "@/shared/i18n";
import { formatDate, formatMoney } from "@/shared/core/format";
import { D } from "@/shared/core/money";
import { listPurchases } from "@/features/procurement/service";
import { PayPurchaseDialog } from "@/features/procurement/ui/pay-dialog";

export default async function PurchasesPage({
  searchParams,
}: PageProps<"/procurement/purchases">) {
  const { t, locale } = await getT();
  const sp = await searchParams;
  const page = clampPage(firstParam(sp.page));
  const q = firstParam(sp.q) ?? "";

  const { rows, total } = await listPurchases({ q: q || undefined, page });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight">{t.procurement.purchasesTitle}</h1>
        <Button asChild size="sm">
          <Link href="/procurement/receiving">{t.procurement.directPurchase}</Link>
        </Button>
      </div>

      <form className="flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder="PUR-â€¦" className="h-9 rounded-md border bg-background px-3 text-sm" />
        <Button type="submit" variant="outline" size="sm">{t.common.filter}</Button>
      </form>

      <Card>
        <CardContent className="px-0 pb-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.procurement.grnNumber}</TableHead>
                <TableHead>{t.procurement.suppliersTitle}</TableHead>
                <TableHead>{t.common.date}</TableHead>
                <TableHead className="text-end">{t.common.total}</TableHead>
                <TableHead className="text-end">{t.procurement.paidAmount}</TableHead>
                <TableHead className="text-end">{t.procurement.dueAmount}</TableHead>
                <TableHead>{t.common.status}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => {
                const paidOff = D(p.dueAmount).lte(0);
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs" dir="ltr">
                      <Link href={`/procurement/returns/new?purchase=${p.id}`} className="hover:underline">
                        {p.purchaseNumber}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm font-medium">
                      {p.supplier.nameAr || p.supplier.name}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(p.date, locale)}</TableCell>
                    <TableCell className="text-end tabular-nums" dir="ltr">{formatMoney(D(p.total).toNumber(), locale)}</TableCell>
                    <TableCell className="text-end tabular-nums text-muted-foreground" dir="ltr">{formatMoney(D(p.paidAmount).toNumber(), locale)}</TableCell>
                    <TableCell className={`text-end tabular-nums ${paidOff ? "text-muted-foreground" : "text-destructive font-medium"}`} dir="ltr">
                      {formatMoney(D(p.dueAmount).toNumber(), locale)}
                    </TableCell>
                    <TableCell>
                      {paidOff ? (
                        <Badge variant="outline" title={t.procurement.payOk}>âœ“</Badge>
                      ) : (
                        <PayPurchaseDialog
                          t={t.procurement} tCommon={t.common} tErrors={t.errors}
                          purchaseId={p.id} dueAmount={D(p.dueAmount).toFixed(2)}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={7} className="h-28 text-center text-muted-foreground">{t.common.noData}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          <div className="px-4">
            <Pagination
              page={page} pageSize={25} total={total} baseParams={{ q }}
              labels={{ previous: t.common.previous, next: t.common.next, page: t.common.page, of: t.common.of }}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
