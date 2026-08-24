import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getT } from "@/shared/i18n";
import { listRoles, listPermissionDefs } from "@/features/roles/service";
import { RoleDialog, DeleteRoleButton, type PermissionGroup } from "@/features/roles/ui/role-forms";

export default async function RolesPage() {
  const { t } = await getT();
  const [roles, defs] = await Promise.all([listRoles(), Promise.resolve(listPermissionDefs())]);
  const byGroup = new Map<string, PermissionGroup[1]>();
  for (const d of defs) {
    const list = byGroup.get(d.group) ?? [];
    list.push({ key: d.key, description: d.description });
    byGroup.set(d.group, list);
  }
  const permissionGroups: PermissionGroup[] = [...byGroup.entries()];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight">{t.rolesPage.title}</h1>
        <RoleDialog t={t} permissionGroups={permissionGroups} label={t.rolesPage.newRole} />
      </div>

      <Card>
        <CardContent className="px-0 pb-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.rolesPage.name}</TableHead>
                <TableHead>{t.rolesPage.permissions}</TableHead>
                <TableHead>{t.common.user}</TableHead>
                <TableHead>{t.common.notes}</TableHead>
                <TableHead className="text-end">{t.common.actions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="font-medium" dir="ltr">{r.name}</div>
                    {r.nameAr && <div className="text-xs text-muted-foreground" dir="rtl">{r.nameAr}</div>}
                    {r.isSystem && <Badge variant="secondary" className="mt-1">system</Badge>}
                  </TableCell>
                  <TableCell className="max-w-md">
                    {r.name === "SUPER_ADMIN" ? (
                      <Badge>âک… {t.rolesPage.allPermissions}</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">{r.rolePermissions.length}</span>
                    )}
                  </TableCell>
                  <TableCell>{r._count.users}</TableCell>
                  <TableCell className="max-w-48 truncate text-xs text-muted-foreground">{r.description ?? "â€”"}</TableCell>
                  <TableCell className="text-end">
                    <div className="flex items-center justify-end gap-1">
                      <RoleDialog
                        t={t}
                        permissionGroups={permissionGroups}
                        label={t.common.edit}
                        editRole={{
                          id: r.id, name: r.name, nameAr: r.nameAr, description: r.description,
                          isSystem: r.isSystem,
                          permissions: r.rolePermissions.map((rp) => rp.permissionKey),
                          userCount: r._count.users,
                        }}
                      />
                      {!r.isSystem && <DeleteRoleButton t={t} roleId={r.id} />}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
