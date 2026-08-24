import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { firstParam, Pagination, clampPage } from "@/components/pagination";
import { getT } from "@/shared/i18n";
import { formatDateTime, formatMoney, formatNumber } from "@/shared/core/format";
import { D } from "@/shared/core/money";
import { listCustomers } from "@/features/customers/service";
import { deleteCustomerAction } from "@/features/customers/actions";
import { DeleteButton } from "@/features/inventory/ui/delete-button";
import { StatementPeriodLink } from "./statement-period-link";
import { CustomerLauncher } from "./customer-launcher";

export default async function CustomersPage({
  searchParams,
}: PageProps<"/customers/list">) {
  const { t, locale } = await getT();
  const sp = await searchParams;
  const page = clampPage(firstParam(sp.page));
  const q = firstParam(sp.q) ?? "";

  const { rows, total } = await listCustomers({ q: q || undefined, includeInactive: true, page });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight">{t.customers.title}</h1>
        <CustomerLauncher
          mode="form" tCommon={t.common} tErrors={t.errors} tCustomers={t.customers} tProcurement={t.procurement}
          label={t.common.create} editId={null}
        />
      </div>

      <form className="flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder="…" className="h-9 rounded-md border bg-background px-3 text-sm" />
        <Button type="submit" variant="outline" size="sm">{t.common.filter}</Button>
      </form>

      <Card>
        <CardContent className="px-0 pb-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.customers.code}</TableHead>
                <TableHead>{t.customers.title}</TableHead>
                <TableHead>{t.customers.phone}</TableHead>
                <TableHead className="text-end">{t.customers.creditLimit}</TableHead>
                <TableHead className="text-end">{t.customers.balance}</TableHead>
                <TableHead className="text-end">{t.customers.loyaltyPoints}</TableHead>
                <TableHead>{t.customers.lastPurchase}</TableHead>
                <TableHead className="text-end">{t.common.actions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-xs" dir="ltr">{c.code}</TableCell>
                  <TableCell className="text-sm font-medium">{c.nameAr || c.name}</TableCell>
                  <TableCell className="text-sm" dir="ltr">{c.phone ?? "—"}</TableCell>
                  <TableCell className="text-end tabular-nums" dir="ltr">{formatMoney(D(c.creditLimit).toNumber(), locale)}</TableCell>
                  <TableCell className={`text-end tabular-nums ${D(c.balance).gt(0) ? "text-destructive font-medium" : ""}`} dir="ltr">
                    {formatMoney(D(c.balance).toNumber(), locale)}
                  </TableCell>
                  <TableCell className="text-end tabular-nums" dir="ltr">{formatNumber(D(c.loyaltyPoints).toNumber(), locale)}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {c.lastPurchaseAt ? formatDateTime(c.lastPurchaseAt, locale) : "—"}
                  </TableCell>
                  <TableCell className="text-end">
                    <div className="flex items-center justify-end gap-1">
                      <StatementPeriodLink
                        customerId={c.id}
                        labels={{
                          trigger: t.customers.statement,
                          title: t.customers.choosePeriod,
                          day: t.customers.day,
                          week: t.customers.week,
                          month: t.customers.month,
                          view: t.customers.view,
                        }}
                      />
                      <CustomerLauncher
                        mode="form" tCommon={t.common} tErrors={t.errors} tCustomers={t.customers} tProcurement={t.procurement}
                        label={t.common.edit} editId={c.id}
                      />
                      <DeleteButton
                        action={deleteCustomerAction}
                        id={c.id}
                        title={t.customers.customerDeleted}
                        description={t.customers.deleteConfirm}
                        confirmLabel={t.common.delete}
                        cancelLabel={t.common.cancel}
                        trigger={
                          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                            {t.common.delete}
                          </Button>
                        }
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={8} className="h-28 text-center text-muted-foreground">{t.common.noData}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          <div className="px-4">
            <Pagination
              page={page} pageSize={25} total={total}
              baseParams={{ q }}
              labels={{ previous: t.common.previous, next: t.common.next, page: t.common.page, of: t.common.of }}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
