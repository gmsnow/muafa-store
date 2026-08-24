import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { firstParam, Pagination, clampPage } from "@/components/pagination";
import { getT } from "@/shared/i18n";
import { formatMoney } from "@/shared/core/format";
import { D } from "@/shared/core/money";
import { listSuppliers } from "@/features/procurement/service";
import { SupplierLauncher } from "@/features/procurement/ui/supplier-launcher";

export default async function SuppliersPage({
  searchParams,
}: PageProps<"/procurement/suppliers">) {
  const { t, locale } = await getT();
  const sp = await searchParams;
  const page = clampPage(firstParam(sp.page));
  const q = firstParam(sp.q) ?? "";
  const all = firstParam(sp.all) === "1";

  const { rows, total } = await listSuppliers({ q: q || undefined, includeInactive: all, page });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight">{t.procurement.suppliersTitle}</h1>
        <SupplierLauncher t={t.procurement} tCommon={t.common} tErrors={t.errors} editId={null} label={t.procurement.newSupplier} />
      </div>

      <form className="flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder="â€¦" className="h-9 rounded-md border bg-background px-3 text-sm" />
        <label className="flex items-center gap-1 text-sm text-muted-foreground">
          <input type="checkbox" name="all" value="1" defaultChecked={all} /> {t.common.inactive}/{t.common.active}
        </label>
        <Button type="submit" variant="outline" size="sm">{t.common.filter}</Button>
      </form>

      <Card>
        <CardContent className="px-0 pb-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>{t.procurement.suppliersTitle}</TableHead>
                <TableHead>{t.procurement.phone}</TableHead>
                <TableHead>{t.procurement.company}</TableHead>
                <TableHead className="text-end">{t.procurement.creditLimit}</TableHead>
                <TableHead className="text-end">{t.procurement.balance}</TableHead>
                <TableHead>{t.common.status}</TableHead>
                <TableHead className="text-end">{t.common.actions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs" dir="ltr">{s.code}</TableCell>
                  <TableCell className="text-sm font-medium">
                    {s.nameAr || s.name}
                  </TableCell>
                  <TableCell className="text-sm" dir="ltr">{s.phone ?? "â€”"}</TableCell>
                  <TableCell className="text-sm">{s.company ?? "â€”"}</TableCell>
                  <TableCell className="text-end tabular-nums" dir="ltr">{formatMoney(D(s.creditLimit).toNumber(), locale)}</TableCell>
                  <TableCell className={`text-end tabular-nums ${D(s.balance).gt(0) ? "text-destructive" : ""}`} dir="ltr">
                    {formatMoney(D(s.balance).toNumber(), locale)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={s.isActive ? "outline" : "secondary"}>
                      {s.isActive ? t.common.active : t.common.inactive}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-end">
                    <SupplierLauncher t={t.procurement} tCommon={t.common} tErrors={t.errors} editId={s.id} label={t.common.edit} />
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
              baseParams={{ q, ...(all ? { all: "1" } : {}) }}
              labels={{ previous: t.common.previous, next: t.common.next, page: t.common.page, of: t.common.of }}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
