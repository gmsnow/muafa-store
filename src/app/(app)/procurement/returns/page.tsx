import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { firstParam, Pagination, clampPage } from "@/components/pagination";
import { getT } from "@/shared/i18n";
import { formatDateTime, formatMoney } from "@/shared/core/format";
import { D } from "@/shared/core/money";
import { listPurchaseReturns } from "@/features/procurement/service";

export default async function PurchaseReturnsPage({
  searchParams,
}: PageProps<"/procurement/returns">) {
  const { t, locale } = await getT();
  const sp = await searchParams;
  const page = clampPage(firstParam(sp.page));
  const q = firstParam(sp.q) ?? "";

  const { rows, total } = await listPurchaseReturns({ q: q || undefined, page });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight">{t.procurement.purchaseReturnTitle}</h1>
        <Button asChild size="sm">
          <Link href="/procurement/returns/new">{t.procurement.newPurchaseReturn}</Link>
        </Button>
      </div>

      <form className="flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder="PRE-â€¦" className="h-9 rounded-md border bg-background px-3 text-sm" />
        <Button type="submit" variant="outline" size="sm">{t.common.filter}</Button>
      </form>

      <Card>
        <CardContent className="px-0 pb-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>{t.procurement.suppliersTitle}</TableHead>
                <TableHead>{t.common.date}</TableHead>
                <TableHead>{t.sales.returnReason}</TableHead>
                <TableHead className="text-end">{t.common.total}</TableHead>
                <TableHead>{t.sales.refundMethod}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs" dir="ltr">{r.returnNumber}</TableCell>
                  <TableCell className="text-sm font-medium">
                    {r.supplier.nameAr || r.supplier.name}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(r.date, locale)}</TableCell>
                  <TableCell className="max-w-48 truncate text-sm" title={r.reason}>{r.reason}</TableCell>
                  <TableCell className="text-end tabular-nums" dir="ltr">{formatMoney(D(r.total).toNumber(), locale)}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {D(r.creditAmount).gt(0) ? t.procurement.creditNote : t.procurement.cashRefund}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={6} className="h-28 text-center text-muted-foreground">{t.common.noData}</TableCell></TableRow>
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
