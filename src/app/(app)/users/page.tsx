import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getT } from "@/shared/i18n";
import { formatDateTime } from "@/shared/core/format";
import { listUsers } from "@/features/users/service";
import { listRoles } from "@/features/roles/service";
import { UserDialog, UserRowActions } from "@/features/users/ui/user-forms";

export default async function UsersPage() {
  const { t, locale } = await getT();
  const [{ rows }, roles] = await Promise.all([
    listUsers({ includeDeleted: false }),
    listRoles(),
  ]);
  const roleOpts = roles.map((r) => ({ id: r.id, name: r.name, nameAr: r.nameAr }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight">{t.usersPage.title}</h1>
        <UserDialog t={t} roles={roleOpts} label={t.usersPage.newUser} />
      </div>

      <Card>
        <CardContent className="px-0 pb-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.usersPage.username}</TableHead>
                <TableHead>{t.usersPage.fullName}</TableHead>
                <TableHead>{t.usersPage.role}</TableHead>
                <TableHead>{t.usersPage.accountStatus}</TableHead>
                <TableHead className="hidden md:table-cell">{t.usersPage.lastLogin}</TableHead>
                <TableHead className="text-end">{t.common.actions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((u) => (
                <TableRow key={u.id} className={u.deletedAt ? "opacity-50" : ""}>
                  <TableCell className="text-sm font-medium" dir="ltr">{u.username}</TableCell>
                  <TableCell className="text-sm">{u.fullNameAr || u.fullName}</TableCell>
                  <TableCell><Badge variant="outline">{u.role.nameAr || u.role.name}</Badge></TableCell>
                  <TableCell>
                    <Badge variant={u.status === "ACTIVE" && !u.deletedAt ? "default" : "secondary"}>
                      {u.deletedAt ? t.common.inactive : u.status === "ACTIVE" ? t.common.active : t.usersPage.suspend}
                    </Badge>
                    {u.mustChangePassword && (
                      <span className="ms-2 text-xs text-amber-600">⚠</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap text-xs text-muted-foreground md:table-cell">
                    {u.lastLoginAt ? formatDateTime(u.lastLoginAt, locale) : "—"}
                  </TableCell>
                  <TableCell className="text-end">
                    {!u.deletedAt && (
                      <UserRowActions
                        t={t}
                        roles={roleOpts}
                        user={{
                          id: u.id, username: u.username, fullName: u.fullName,
                          fullNameAr: u.fullNameAr, phone: u.phone,
                          roleId: u.roleId, status: u.status, roleName: u.role.name,
                        }}
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={6} className="h-20 text-center text-muted-foreground">{t.common.noData}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
