import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { getT } from "@/shared/i18n";
import { formatDateTime } from "@/shared/core/format";
import { firstParam, clampPage, Pagination } from "@/components/pagination";
import { listAudit, listAuditFacets, listUsersForFilter } from "@/features/audit/service";

export default async function AuditLogPage({ searchParams }: PageProps<"/audit-log">) {
  const { t, locale } = await getT();
  const sp = await searchParams;
  const page = clampPage(firstParam(sp.page));
  const userId = firstParam(sp.userId) || undefined;
  const action = firstParam(sp.action) || undefined;
  const entityType = firstParam(sp.entityType) || undefined;
  const from = firstParam(sp.from) || undefined;
  const to = firstParam(sp.to) || undefined;

  const [{ rows, total }, facets, users] = await Promise.all([
    listAudit({ userId, action, entityType, from, to, page }),
    listAuditFacets(),
    listUsersForFilter(),
  ]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">{t.auditPage.title}</h1>

      <form className="flex flex-wrap items-end gap-2">
        <select name="userId" defaultValue={userId ?? ""} className="h-9 rounded-md border bg-background px-2 text-sm">
          <option value="">{t.common.user}: {t.common.all}</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.username} — {u.fullNameAr || u.fullName}</option>
          ))}
        </select>
        <select name="action" defaultValue={action ?? ""} className="h-9 max-w-52 rounded-md border bg-background px-2 text-sm">
          <option value="">{t.auditPage.action}: {t.common.all}</option>
          {facets.actions.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select name="entityType" defaultValue={entityType ?? ""} className="h-9 rounded-md border bg-background px-2 text-sm">
          <option value="">{t.auditPage.entity}: {t.common.all}</option>
          {facets.entityTypes.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
        <input type="date" name="from" defaultValue={from ?? ""} className="h-9 rounded-md border bg-background px-2 text-sm" />
        <input type="date" name="to" defaultValue={to ?? ""} className="h-9 rounded-md border bg-background px-2 text-sm" />
        <Button type="submit" variant="outline" size="sm">{t.common.filter}</Button>
      </form>

      <Card>
        <CardContent className="px-0 pb-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">{t.common.date}</TableHead>
                <TableHead>{t.common.user}</TableHead>
                <TableHead>{t.auditPage.action}</TableHead>
                <TableHead>{t.auditPage.entity}</TableHead>
                <TableHead className="hidden md:table-cell">{t.auditPage.details}</TableHead>
                <TableHead className="hidden lg:table-cell">{t.auditPage.ip}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatDateTime(r.createdAt, locale)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {r.user ? `${r.user.username}` : "—"}
                  </TableCell>
                  <TableCell><Badge variant="outline" className="font-mono text-[10px]" dir="ltr">{r.action}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground" dir="ltr">
                    {r.entityType ? `${r.entityType}${r.entityId ? ` · ${r.entityId.slice(0, 8)}…` : ""}` : "—"}
                  </TableCell>
                  <TableCell className="hidden max-w-72 truncate font-mono text-[10px] text-muted-foreground md:table-cell" dir="ltr"
                    title={JSON.stringify(r.newValues ?? r.oldValues ?? {})}>
                    {r.newValues || r.oldValues ? JSON.stringify(r.newValues ?? r.oldValues) : "—"}
                  </TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground lg:table-cell" dir="ltr">{r.ip ?? "—"}</TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={6} className="h-20 text-center text-muted-foreground">{t.common.noData}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          <Pagination
            page={page} pageSize={25} total={total}
            baseParams={{ userId, action, entityType, from, to }}
            labels={{ previous: t.common.previous, next: t.common.next, page: t.common.page, of: t.common.of }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
