import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getT } from "@/shared/i18n";
import { listCategories } from "@/features/inventory/service";
import { deleteCategoryAction } from "@/features/inventory/actions";
import { CategoryFormDialog } from "@/features/inventory/ui/catalog-forms";
import { DeleteButton } from "@/features/inventory/ui/delete-button";

export default async function CategoriesPage() {
  const { t } = await getT();
  const categories = await listCategories();

  const nameOf = (o: { name: string; nameAr?: string | null }) =>
    o.nameAr ?? o.name;

  const parents = categories.filter((c) => !c.parentId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{t.catalog.categoriesTitle}</h1>
        <CategoryFormDialog t={t.catalog} tCommon={t.common} parents={parents} />
      </div>

      <Card>
        <CardContent className="px-0 pb-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.products.name}</TableHead>
                <TableHead>{t.catalog.parentCategory}</TableHead>
                <TableHead className="text-end">{t.dashboard.totalProducts}</TableHead>
                <TableHead className="w-32 text-end">{t.common.actions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((c) => (
                <TableRow key={c.id} className={c.parentId ? "" : "font-medium"}>
                  <TableCell>
                    {c.parentId && <span className="me-2 text-muted-foreground">└</span>}
                    {nameOf(c)}
                    {!c.isActive && (
                      <span className="ms-2 text-xs text-muted-foreground">({t.common.inactive})</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {c.parent ? nameOf(c.parent) : t.catalog.noneRoot}
                  </TableCell>
                  <TableCell className="text-end tabular-nums" dir="ltr">
                    {c._count.products.toLocaleString("en-US")}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <CategoryFormDialog
                        t={t.catalog} tCommon={t.common} parents={parents}
                        category={{ id: c.id, name: c.name, nameAr: c.nameAr, parentId: c.parentId }}
                      />
                      <DeleteButton
                        action={deleteCategoryAction}
                        id={c.id}
                        title={t.products.deletedOk}
                        description={t.errors.IN_USE}
                        confirmLabel={t.common.delete}
                        cancelLabel={t.common.cancel}
                        trigger={
                          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" disabled={c._count.products > 0 || c._count.children > 0}>
                            {t.common.delete}
                          </Button>
                        }
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {categories.length === 0 && (
                <TableRow><TableCell colSpan={4} className="h-28 text-center text-muted-foreground">{t.common.noData}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}


