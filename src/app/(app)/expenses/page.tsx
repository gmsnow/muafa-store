import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { getT } from "@/shared/i18n";
import { formatDateTime, formatMoney, formatNumber } from "@/shared/core/format";
import { firstParam, clampPage, Pagination } from "@/components/pagination";
import { listExpenses, listCategories } from "@/features/expenses/service";
import { NewExpenseDialog, ExpenseCategoryManager } from "@/features/expenses/ui/expense-forms";
import { DeleteRecentExpenseButton } from "./delete-expense-button";

export default async function ExpensesPage({ searchParams }: PageProps<"/expenses">) {
  const { t, locale } = await getT();
  const sp = await searchParams;
  const page = clampPage(firstParam(sp.page));
  const categoryId = firstParam(sp.categoryId) || undefined;
  const from = firstParam(sp.from) || undefined;
  const to = firstParam(sp.to) || undefined;

  const [{ rows, total, totalAmount }, categories] = await Promise.all([
    listExpenses({ categoryId, from, to, page }),
    listCategories(),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight">{t.expensesPage.title}</h1>
        <div className="flex items-center gap-2 print:hidden">
          <ExpenseCategoryManager t={t} categories={categories} />
          <NewExpenseDialog t={t} categories={categories} label={t.expensesPage.newExpense} />
        </div>
      </div>

      <Card>
        <CardContent className="px-0 pb-0">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="text-sm font-semibold">{formatNumber(total, locale)} · {t.expensesPage.amount}</h2>
            <Badge variant="secondary" dir="ltr">{formatMoney(totalAmount, locale)}</Badge>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.expensesPage.expenseNumber}</TableHead>
                <TableHead>{t.expensesPage.category}</TableHead>
                <TableHead>{t.expensesPage.description}</TableHead>
                <TableHead>{t.expensesPage.method}</TableHead>
                <TableHead className="text-end">{t.expensesPage.amount}</TableHead>
                <TableHead>{t.common.date}</TableHead>
                <TableHead>{t.common.user}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-mono text-xs" dir="ltr">{e.expenseNumber}</TableCell>
                  <TableCell className="font-medium">{e.category.nameAr ?? e.category.name}</TableCell>
                  <TableCell className="max-w-56 truncate text-muted-foreground">{e.description ?? "—"}</TableCell>
                  <TableCell><Badge variant="outline">{e.method}</Badge></TableCell>
                  <TableCell className="text-end font-medium tabular-nums" dir="ltr">{formatMoney(String(e.amount), locale)}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(e.expenseDate, locale)}</TableCell>
                  <TableCell className="max-w-32 truncate text-muted-foreground">
                    {e.user.fullNameAr ?? e.user.fullName}
                  </TableCell>
                  <TableCell className="print:hidden">
                    <DeleteRecentExpenseButton id={e.id} deletable={e.deletable} label={t.common.delete} confirmText={t.common.confirm} />
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={8} className="h-20 text-center text-muted-foreground">{t.common.noData}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          <Pagination
            page={page} pageSize={25} total={total}
            baseParams={{ categoryId, from, to }}
            labels={{ previous: t.common.previous, next: t.common.next, page: t.common.page, of: t.common.of }}
          />
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2 print:hidden">
        <Link href="/expenses"><Badge variant={categoryId ? "outline" : "default"}>{t.common.all}</Badge></Link>
        {categories.map((c) => (
          <Link key={c.id} href={`/expenses?categoryId=${c.id}`}>
            <Badge variant={categoryId === c.id ? "default" : "outline"}>
              {c.nameAr ?? c.name}
            </Badge>
          </Link>
        ))}
      </div>
    </div>
  );
}
