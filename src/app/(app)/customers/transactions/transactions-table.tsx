import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination } from "@/components/pagination";
import { getT } from "@/shared/i18n";
import { formatDateTime, formatMoney } from "@/shared/core/format";
import { D } from "@/shared/core/money";
import {
  listCustomerTransactions,
  listLatestCustomerTransactions,
} from "@/features/customers/service";
import { deleteCustomerTxnsMonthAction } from "@/features/customers/actions";
import { LiveQueryInput } from "@/components/live-query-input";
import { Button } from "@/components/ui/button";
import { DeleteMonthButton } from "./delete-month-button";
import { ClearAccountButton } from "./clear-account-button";
import { TxnRowActions } from "./txn-row-actions";
import { TxnImage } from "@/features/customers/ui/image-view";

export async function TransactionsTable({
  customerId, q, month, monthParam, page,
}: {
  customerId?: string;
  q?: string;
  month?: string;
  monthParam: string;
  page: number;
}) {
  const { t, locale } = await getT();
  const data = customerId
    ? await listCustomerTransactions({ customerId, q, month, page })
    : await listLatestCustomerTransactions({ q, month, page });
  const { rows, total } = data;

  const monthQs = month ? `&month=${month}` : "";
  const drillHref = (id: string) =>
    `/customers/transactions?customerId=${id}${q ? `&q=${encodeURIComponent(q)}` : ""}${monthQs}`;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <form className="flex flex-wrap items-center gap-2" action="/customers/transactions">
          {customerId && <input type="hidden" name="customerId" value={customerId} />}
          <LiveQueryInput placeholder={t.common.searchPlaceholder} className="w-full sm:w-56" />
          <input
            type="month" name="month" defaultValue={monthParam}
            className="h-9 rounded-md border bg-background px-2 text-sm"
            aria-label={t.customers.month}
          />
          <Button type="submit" variant="secondary" size="sm">{t.common.filter}</Button>
        </form>
        {month && (
          <DeleteMonthButton
            action={deleteCustomerTxnsMonthAction} month={month} customerId={customerId}
            labels={{
              title: t.customers.deleteMonth, confirm: t.customers.deleteMonthConfirm,
              success: t.customers.monthDeleted, cancel: t.common.cancel,
            }}
          />
        )}
        {customerId && (
          <ClearAccountButton
            customerId={customerId}
            labels={{
              title: t.customers.clearAccount, confirm: t.customers.clearAccountConfirm,
              success: t.customers.accountCleared, cancel: t.common.cancel,
            }}
          />
        )}
      </div>

      <Card className="animate-enter">
        <CardContent className="px-0 pb-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.common.date}</TableHead>
                <TableHead>{t.customers.title}</TableHead>
                <TableHead>{t.common.status}</TableHead>
                <TableHead className="text-end">{t.customers.paymentAmount}</TableHead>
                <TableHead className="text-end">{t.customers.balanceAfter}</TableHead>
                <TableHead>{t.common.notes}</TableHead>
                <TableHead className="w-20 text-end">{t.common.actions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((tx) => (
                <TableRow key={tx.id} className={!customerId ? "relative cursor-pointer hover:bg-muted/50" : undefined}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatDateTime(tx.createdAt, locale)}
                  </TableCell>
                  <TableCell className="text-sm font-medium">
                    {!customerId && (
                      <Link href={drillHref(tx.customerId)} className="absolute inset-0 z-10">
                        <span className="sr-only">{tx.customer.nameAr || tx.customer.name}</span>
                      </Link>
                    )}
                    {tx.customer.nameAr || tx.customer.name}
                    <span className="ms-2 font-mono text-[11px] text-muted-foreground" dir="ltr">{tx.customer.code}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={tx.type === "PAYMENT" ? "outline" : tx.type === "REFUND" ? "secondary" : "destructive"}>
                      {tx.type === "PAYMENT" ? t.customers.payment : tx.type === "DEBT" ? t.customers.debt : tx.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-end tabular-nums" dir="ltr">{formatMoney(D(tx.amount).toNumber(), locale)}</TableCell>
                  <TableCell className={`text-end tabular-nums ${D(tx.balanceAfter).gt(0) ? "text-destructive" : ""}`} dir="ltr">
                    {formatMoney(D(tx.balanceAfter).toNumber(), locale)}
                  </TableCell>
                  <TableCell className="max-w-40 text-sm">
                    <div className="flex min-w-0 items-center gap-1">
                      {tx.note && <span className="min-w-0 truncate">{tx.note}</span>}
                      {tx.imagePath && <TxnImage txnId={tx.id} label={t.customers.viewImage} />}
                    </div>
                  </TableCell>
                  <TableCell className="text-end">
                    <TxnRowActions
                      txn={{ id: tx.id, type: tx.type, amount: String(tx.amount), note: tx.note, imagePath: tx.imagePath }}
                      tCommon={t.common} tCustomers={t.customers} tErrors={t.errors}
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
              baseParams={{ q, month: monthParam, ...(customerId ? { customerId } : {}) }}
              labels={{ previous: t.common.previous, next: t.common.next, page: t.common.page, of: t.common.of }}
            />
          </div>
        </CardContent>
      </Card>
    </>
  );
}