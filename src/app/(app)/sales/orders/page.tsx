import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination, clampPage } from "@/components/pagination";
import { getT } from "@/shared/i18n";
import { formatDateTime, formatMoney } from "@/shared/core/format";
import { D } from "@/shared/core/money";
import type { SaleStatus } from "@/generated/prisma/client";
import { listSales } from "@/features/sales/service";
import { CancelSaleButton } from "@/features/sales/ui/cancel-sale-button";

const STATUSES: (SaleStatus | "all")[] = ["all", "COMPLETED", "PARTIALLY_REFUNDED", "REFUNDED", "CANCELLED"];

export default async function OrdersPage({ searchParams }: PageProps<"/sales/orders">) {
  const { t, locale } = await getT();
  const sp0 = await searchParams;
  const sp: Record<string, string | undefined> = Object.fromEntries(
    Object.entries(sp0).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  );
  const page = clampPage(sp.page);

  const { rows, total } = await listSales({
    q: sp.q?.trim(),
    status: sp.status,
    page,
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">{t.sales.ordersTitle}</h1>

      <form className="flex flex-wrap items-center gap-2" action="/sales/orders">
        <Input name="q" defaultValue={sp.q ?? ""} placeholder="INV-000001" className="w-48" dir="ltr" />
        <Select name="status" defaultValue={sp.status ?? "all"}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{s === "all" ? t.common.all : s.replace("_", " ")}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="submit" variant="secondary" size="sm">{t.common.filter}</Button>
        <Link href="/sales/orders" className="text-xs text-muted-foreground hover:underline">{t.common.reset}</Link>
      </form>

      <Card>
        <CardContent className="px-0 pb-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.dashboard.invoice}</TableHead>
                <TableHead>{t.common.date}</TableHead>
                <TableHead>{t.customers.title}</TableHead>
                <TableHead>{t.dashboard.cashier}</TableHead>
                <TableHead className="text-end">{t.common.total}</TableHead>
                <TableHead>{t.common.status}</TableHead>
                <TableHead className="w-24 text-end">{t.common.actions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((sale) => (
                <TableRow key={sale.id}>
                  <TableCell className="font-mono text-xs" dir="ltr">{sale.invoiceNumber}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{formatDateTime(sale.saleDate, locale)}</TableCell>
                  <TableCell className="max-w-36 truncate text-sm">
                    {sale.customer
                      ? (sale.customer.nameAr ?? sale.customer.name)
                      : t.sales.walkInCustomer}
                  </TableCell>
                  <TableCell className="text-sm">{sale.cashier.fullName || sale.cashier.username}</TableCell>
                  <TableCell className="text-end tabular-nums">
                    {formatMoney(D(sale.total).toNumber(), locale)}
                    {D(sale.refundedAmount).gt(0) && (
                      <span className="block text-[10px] text-destructive" dir="ltr">
                        −{D(sale.refundedAmount).toNumber()}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={
                      sale.status === "COMPLETED" ? "outline"
                        : sale.status === "CANCELLED" ? "destructive"
                          : sale.status === "REFUNDED" ? "destructive" : "secondary"
                    }>
                      {sale.status.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Link href={`/sales/receipt/${sale.id}`} target="_blank">
                        <Button variant="ghost" size="sm">{t.sales.reprint}</Button>
                      </Link>
                      {sale.status === "COMPLETED" && (
                        <CancelSaleButton t={t.sales} tErrors={t.errors} saleId={sale.id} />
                      )}
                    </div>
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
              baseParams={{ q: sp.q, status: sp.status }}
              labels={{ previous: t.common.previous, next: t.common.next, page: t.common.page, of: t.common.of }}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

