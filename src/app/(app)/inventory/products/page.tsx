import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination, clampPage, DEFAULT_PAGE_SIZE } from "@/components/pagination";
import { getT } from "@/shared/i18n";
import { formatMoney, formatNumber } from "@/shared/core/format";
import { D } from "@/shared/core/money";
import { listProducts, listCategories } from "@/features/inventory/service";
import { deleteProductAction } from "@/features/inventory/actions";
import { ProductFormDialog } from "@/features/inventory/ui/product-form";
import { ProductEditDialog } from "@/features/inventory/ui/product-edit-dialog";
import { DeleteButton } from "@/features/inventory/ui/delete-button";
import { LiveSearch } from "@/features/inventory/ui/live-search";

export default async function ProductsPage({ searchParams }: PageProps<"/inventory/products">) {
  const { t, locale } = await getT();
  const sp0 = await searchParams;
  const sp: Record<string, string | undefined> = Object.fromEntries(
    Object.entries(sp0).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  );
  const page = clampPage(sp.page);

  // Server actions re-exported through the service module for RSC convenience.
  const [{ rows, total }, categories] = await Promise.all([
    listProducts({
      q: sp.q?.trim(),
      page,
      pageSize: DEFAULT_PAGE_SIZE,
    }),
    listCategories(),
  ]);

  const nameOf = (o: { name: string; nameAr?: string | null }) =>
    o.nameAr ?? o.name;

  const catOpts = categories.map((c) => ({ id: c.id, name: c.name, nameAr: c.nameAr }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{t.products.title}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <ProductFormDialog
            t={t.products} tCommon={t.common} tErrors={t.errors}
            categories={catOpts}
          />
        </div>
      </div>

      {/* Search */}
      <LiveSearch placeholder={t.products.scanBarcode} />

      <Card>
        <CardContent className="px-0 pb-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.products.nameAr}</TableHead>
                <TableHead>{t.products.category}</TableHead>
                <TableHead className="text-end">{t.products.costPrice}</TableHead>
                <TableHead className="text-end">{t.products.sellingPrice}</TableHead>
                <TableHead className="text-end">{t.products.wholesalePrice}</TableHead>
                <TableHead className="text-end">{t.products.currentStock}</TableHead>
                <TableHead>{t.common.status}</TableHead>
                <TableHead className="w-28">{t.common.actions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => {
                const stockQty = p.inventory?.quantity ? D(p.inventory.quantity).toNumber() : 0;
                const threshold = Math.max(D(p.minStock).toNumber(), D(p.reorderLevel).toNumber());
                return (
                  <TableRow key={p.id}>
                    <TableCell className="max-w-52">
                      <p className="truncate font-medium">{nameOf(p)}</p>
                    </TableCell>
                    <TableCell className="text-sm">{nameOf(p.category)}</TableCell>
                    <TableCell className="text-end tabular-nums">{formatMoney(D(p.costPrice).toNumber(), locale)}</TableCell>
                    <TableCell className="text-end tabular-nums">{formatMoney(D(p.sellingPrice).toNumber(), locale)}</TableCell>
                    <TableCell className="text-end tabular-nums">
                      {p.wholesalePrice ? formatMoney(D(p.wholesalePrice).toNumber(), locale) : "—"}
                    </TableCell>
                    <TableCell className="text-end tabular-nums">
                      <Badge variant={stockQty <= 0 ? "destructive" : stockQty <= threshold ? "secondary" : "outline"}>
                        {formatNumber(stockQty, locale)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={p.isActive ? "outline" : "secondary"}>
                        {p.isActive ? t.common.active : t.common.inactive}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <ProductEditDialog
                          t={t.products} tCommon={t.common} tErrors={t.errors}
                          categories={catOpts}
                          productId={p.id}
                        />
                        <DeleteButton
                          action={deleteProductAction}
                          id={p.id}
                          title={t.products.deletedOk}
                          description={t.products.deleteWarning}
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
                );
              })}
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={8} className="h-28 text-center text-muted-foreground">{t.common.noData}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          <div className="px-4">
            <Pagination
              page={page} pageSize={DEFAULT_PAGE_SIZE} total={total}
              baseParams={{ q: sp.q }}
              labels={{ previous: t.common.previous, next: t.common.next, page: t.common.page, of: t.common.of }}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}








