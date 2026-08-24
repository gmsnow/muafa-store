import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { firstParam, Pagination, clampPage } from "@/components/pagination";
import { getT } from "@/shared/i18n";
import { formatDate, formatMoney } from "@/shared/core/format";
import { D } from "@/shared/core/money";
import { listPurchaseOrders } from "@/features/procurement/service";
import type { PurchaseOrderStatus } from "@/generated/prisma/client";
import { PoActions } from "./po-actions";

const STATUSES: PurchaseOrderStatus[] = [
  "DRAFT", "PENDING", "APPROVED", "ORDERED", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED",
];

export default async function PurchaseOrdersPage({
  searchParams,
}: PageProps<"/procurement/purchase-orders">) {
  const { t, locale } = await getT();
  const sp = await searchParams;
  const page = clampPage(firstParam(sp.page));
  const q = firstParam(sp.q) ?? "";
  const status = firstParam(sp.status) as PurchaseOrderStatus | undefined;

  const { rows, total } = await listPurchaseOrders({ q: q || undefined, status, page });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight">{t.procurement.poTitle}</h1>
        <Button asChild size="sm">
          <Link href="/procurement/purchase-orders/new">{t.procurement.newPo}</Link>
        </Button>
      </div>

      <form className="flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder="PO-â€¦" className="h-9 rounded-md border bg-background px-3 text-sm" />
        <select name="status" defaultValue={status ?? ""} className="h-9 rounded-md border bg-background px-2 text-sm">
          <option value="">{t.common.all}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{statusLabel(t.procurement, s)}</option>
          ))}
        </select>
        <Button type="submit" variant="outline" size="sm">{t.common.filter}</Button>
      </form>

      <Card>
        <CardContent className="px-0 pb-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.procurement.poNumber}</TableHead>
                <TableHead>{t.procurement.suppliersTitle}</TableHead>
                <TableHead>{t.procurement.orderDate}</TableHead>
                <TableHead>{t.procurement.expectedDate}</TableHead>
                <TableHead className="text-end">{tCommon_total(t)}</TableHead>
                <TableHead>{t.common.status}</TableHead>
                <TableHead className="text-end">{t.common.actions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((po) => (
                <TableRow key={po.id}>
                  <TableCell className="font-mono text-xs" dir="ltr">{po.poNumber}</TableCell>
                  <TableCell className="text-sm font-medium">
                    {po.supplier.nameAr || po.supplier.name}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(po.orderDate, locale)}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {po.expectedDate ? formatDate(po.expectedDate, locale) : "â€”"}
                  </TableCell>
                  <TableCell className="text-end tabular-nums" dir="ltr">{formatMoney(D(po.total).toNumber(), locale)}</TableCell>
                  <TableCell><Badge variant="outline">{statusLabel(t.procurement, po.status)}</Badge></TableCell>
                  <TableCell className="text-end">
                    <PoActions
                      tProcurement={t.procurement} tErrors={t.errors}
                      poId={po.id} status={po.status} canReceive={
                        po.status === "APPROVED" || po.status === "ORDERED" || po.status === "PARTIALLY_RECEIVED"
                      }
                    />
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={7} className="h-28 text-center text-muted-foreground">{t.common.noData}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          <div className="px-4">
            <Pagination
              page={page} pageSize={25} total={total}
              baseParams={{ q, ...(status ? { status } : {}) }}
              labels={{ previous: t.common.previous, next: t.common.next, page: t.common.page, of: t.common.of }}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function statusLabel(p: import("@/shared/i18n/ar").Dictionary["procurement"], s: PurchaseOrderStatus): string {
  const map: Record<PurchaseOrderStatus, string> = {
    DRAFT: p.statusDRAFT,
    PENDING: p.statusPENDING,
    APPROVED: p.statusAPPROVED,
    ORDERED: p.statusORDERED,
    PARTIALLY_RECEIVED: p.statusPARTIALLY_RECEIVED,
    RECEIVED: p.statusRECEIVED,
    CANCELLED: p.statusCANCELLED,
  };
  return map[s];
}

function tCommon_total(t: Awaited<ReturnType<typeof getT>>["t"]) {
  return t.common.total;
}
