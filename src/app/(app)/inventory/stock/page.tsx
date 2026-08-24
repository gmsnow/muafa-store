import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { VoiceInput } from "@/components/voice-input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination, clampPage, DEFAULT_PAGE_SIZE } from "@/components/pagination";
import { getT } from "@/shared/i18n";
import { formatMoney, formatNumber } from "@/shared/core/format";
import { listCategories, listStock } from "@/features/inventory/service";

export default async function StockPage({ searchParams }: PageProps<"/inventory/stock">) {
  const { t, locale } = await getT();
  const sp0 = await searchParams;
  const sp: Record<string, string | undefined> = Object.fromEntries(
    Object.entries(sp0).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  );
  const page = clampPage(sp.page);
  const q = sp.q?.trim();
  const categoryId = sp.categoryId || undefined;

  const [{ rows, total, totalValue }, categories] = await Promise.all([
    listStock({ q, categoryId, page, pageSize: DEFAULT_PAGE_SIZE }),
    listCategories(),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{t.stock.stockTitle}</h1>
        <p className="rounded-md bg-muted px-3 py-1.5 text-sm">
          {t.stock.stockValue}:{" "}
          <span className="font-semibold tabular-nums">{formatMoney(totalValue, locale)}</span>
        </p>
      </div>

      <form className="flex flex-wrap items-center gap-2" action="/inventory/stock">
        <VoiceInput name="q" defaultValue={q ?? ""} placeholder={t.common.searchPlaceholder} className="w-full sm:w-64" />
        <select name="categoryId" defaultValue={categoryId ?? ""} className="h-9 w-full rounded-md border bg-background px-2 text-sm sm:w-48">
          <option value="">{t.common.all}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.nameAr ?? c.name}</option>
          ))}
        </select>
        <Button type="submit" variant="secondary" size="sm">{t.common.filter}</Button>
        <a href="/inventory/stock" className="text-xs text-muted-foreground hover:underline">{t.common.reset}</a>
      </form>

      <Card>
        <CardContent className="px-0 pb-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.products.name}</TableHead>
                <TableHead>{t.products.category}</TableHead>
                <TableHead className="text-end">{t.products.currentStock}</TableHead>
                <TableHead className="text-end">{t.products.costPrice}</TableHead>
                <TableHead className="text-end">{t.products.sellingPrice}</TableHead>
                <TableHead className="text-end">{t.stock.stockValue}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.productId}>
                  <TableCell className="max-w-52 truncate font-medium">
                    {r.nameAr ?? r.name}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {r.categoryName}
                  </TableCell>
                  <TableCell className="text-end tabular-nums">{formatNumber(r.quantity, locale)}</TableCell>
                  <TableCell className="text-end tabular-nums text-muted-foreground">{formatMoney(r.costPrice, locale)}</TableCell>
                  <TableCell className="text-end tabular-nums">{formatMoney(r.sellingPrice, locale)}</TableCell>
                  <TableCell className="text-end tabular-nums font-medium">{formatMoney(r.stockValue, locale)}</TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={6} className="h-28 text-center text-muted-foreground">{t.common.noData}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          <div className="px-4">
            <Pagination
              page={page} pageSize={DEFAULT_PAGE_SIZE} total={total}
              baseParams={{ q, categoryId }}
              labels={{ previous: t.common.previous, next: t.common.next, page: t.common.page, of: t.common.of }}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
