import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getT } from "@/shared/i18n";
import { formatDate, formatNumber } from "@/shared/core/format";
import { firstParam } from "@/components/pagination";
import { listExpiringBatches } from "@/features/inventory/service";
import { DaysSelect } from "./days-select";

const DAY_OPTIONS = [7, 30, 60, 90] as const;

export default async function ExpiringPage({
  searchParams,
}: PageProps<"/inventory/expiring">) {
  const { t, locale } = await getT();
  const sp = await searchParams;
  const parsed = Number.parseInt(firstParam(sp.days) ?? "30", 10);
  const days = (DAY_OPTIONS as readonly number[]).includes(parsed) ? parsed : 30;

  const items = await listExpiringBatches(days);
  const expired = items.filter((b) => b.daysLeft !== null && b.daysLeft <= 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{t.stock.expiringTitle}</h1>
        <DaysSelect days={days} labelTemplate={t.stock.expiringInDays} />
      </div>

      <Card>
        <CardContent className="px-0 pb-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.products.sku}</TableHead>
                <TableHead>{t.products.name}</TableHead>
                <TableHead>{t.stock.batchNo}</TableHead>
                <TableHead className="text-end">{t.common.quantity}</TableHead>
                <TableHead>{t.stock.expiryDate}</TableHead>
                <TableHead className="text-end">{t.common.status}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((b) => {
                const isExpired = b.daysLeft !== null && b.daysLeft <= 0;
                return (
                  <TableRow key={b.batchId} className={isExpired ? "bg-destructive/5" : undefined}>
                    <TableCell className="font-mono text-xs" dir="ltr">{b.sku}</TableCell>
                    <TableCell className="max-w-56 truncate font-medium">
                      {b.nameAr ?? b.name}
                    </TableCell>
                    <TableCell className="font-mono text-xs" dir="ltr">{b.batchNo}</TableCell>
                    <TableCell className="text-end tabular-nums">{formatNumber(b.quantity, locale)}</TableCell>
                    <TableCell>{b.expiryDate ? formatDate(b.expiryDate, locale) : "—"}</TableCell>
                    <TableCell className="text-end">
                      {isExpired ? (
                        <Badge variant="destructive">{t.stock.expired}</Badge>
                      ) : (
                        <Badge variant={(b.daysLeft ?? 999) <= 7 ? "destructive" : "secondary"}>
                          {t.stock.daysLeft.replace("{days}", String(b.daysLeft))}
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {items.length === 0 && (
                <TableRow><TableCell colSpan={6} className="h-28 text-center text-muted-foreground">{t.common.noData}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          {expired.length > 0 && (
            <p className="px-4 py-3 text-xs text-destructive">
              {expired.length} دفعة منتهية الصلاحية — تخلص منها عبر تسوية المخزون (السبب: EXPIRED).
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}



