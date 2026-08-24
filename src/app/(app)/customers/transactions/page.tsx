import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { firstParam, Pagination, clampPage } from "@/components/pagination";
import { getT } from "@/shared/i18n";
import { formatDateTime, formatMoney } from "@/shared/core/format";
import { D } from "@/shared/core/money";
import {
  listCustomers,
  listCustomerTransactions,
  listLatestCustomerTransactions,
  getCustomerById,
} from "@/features/customers/service";
import { deleteCustomerTxnsMonthAction } from "@/features/customers/actions";
import { VoiceInput } from "@/components/voice-input";
import { Button } from "@/components/ui/button";
import { DeleteMonthButton } from "./delete-month-button";
import { CustomerLauncher } from "../list/customer-launcher";

export default async function CustomerTransactionsPage({
  searchParams,
}: PageProps<"/customers/transactions">) {
  const { t, locale } = await getT();
  const sp = await searchParams;
  const page = clampPage(firstParam(sp.page));
  const q = firstParam(sp.q)?.trim() || undefined;
  const customerId = firstParam(sp.customerId);
  const monthParam = firstParam(sp.month)?.trim() || "";
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(monthParam) ? monthParam : undefined;

  const [customer, data, customers] = await Promise.all([
    customerId ? getCustomerById(customerId) : null,
    customerId
      ? listCustomerTransactions({ customerId, q, month, page })
      : listLatestCustomerTransactions({ q, month, page }),
    listCustomers({ pageSize: 500 }),
  ]);
  const { rows, total } = data;

  const monthQs = month ? `&month=${month}` : "";
  const backHref = `/customers/transactions?1=1${q ? `&q=${encodeURIComponent(q)}` : ""}${monthQs}`;
  const drillHref = (id: string) =>
    `/customers/transactions?customerId=${id}${q ? `&q=${encodeURIComponent(q)}` : ""}${monthQs}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {customerId && (
            <Link
              href={backHref}
              aria-label={t.common.back}
              className="inline-flex size-9 items-center justify-center rounded-md border bg-background hover:bg-accent"
            >
              <ArrowRight className="size-4" />
            </Link>
          )}
          <h1 className="text-2xl font-bold tracking-tight">{t.customers.transactionsTitle}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form className="flex flex-wrap items-center gap-2" action="/customers/transactions">
            {customerId && <input type="hidden" name="customerId" value={customerId} />}
            <VoiceInput name="q" defaultValue={q ?? ""} placeholder={t.common.searchPlaceholder} className="w-full sm:w-56" />
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
          {!customerId && (
            <CustomerLauncher
              mode="payment"
              tCommon={t.common} tErrors={t.errors} tCustomers={t.customers}
              customers={customers.rows.map((c) => ({
                id: c.id, name: c.name, nameAr: c.nameAr, balance: String(c.balance),
              }))}
              label={t.customers.addPayment} editId={null}
            />
          )}
        </div>
      </div>

      {customer && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-medium">{customer.nameAr || customer.name}</span>
          <span className="font-mono text-xs text-muted-foreground" dir="ltr">{customer.code}</span>
          <Badge variant={D(customer.balance).gt(0) ? "destructive" : "outline"}>
            {t.customers.balance}: {formatMoney(D(customer.balance).toNumber(), locale)}
          </Badge>
        </div>
      )}

      <Card>
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
                  <TableCell className="max-w-40 truncate text-sm">{tx.note}</TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={6} className="h-28 text-center text-muted-foreground">{t.common.noData}</TableCell></TableRow>
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
    </div>
  );
}
