import "server-only";
import { db } from "@/shared/db";
import { AppError } from "@/shared/core/api-response";
import { PERMISSIONS, ROLE_NAMES_AR, type PermissionDef } from "@/shared/auth/rbac";
import type { AuthUser } from "@/features/auth/session";

export async function listRoles() {
  return db.role.findMany({
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    include: {
      rolePermissions: { select: { permissionKey: true } },
      _count: { select: { users: { where: { deletedAt: null } } } },
    },
  });
}

export function listPermissionDefs(): PermissionDef[] {
  return PERMISSIONS;
}

export interface RoleFormRaw {
  id?: string | null;
  name?: string;
  nameAr?: string;
  description?: string;
  permissions?: string[];
}

export async function saveRole(actor: AuthUser, raw: RoleFormRaw) {
  const name = (raw.name ?? "").trim().toUpperCase().replace(/\s+/g, "_");
  const nameAr = (raw.nameAr ?? "").trim() || null;
  const description = (raw.description ?? "").trim() || null;
  const perms = Array.isArray(raw.permissions)
    ? raw.permissions.filter((p) => PERMISSIONS.some((def) => def.key === p))
    : [];

  if (!/^[A-Z][A-Z0-9_]{1,49}$/.test(name)) {
    throw new AppError("VALIDATION_ERROR", "Role name must be 2-50 chars A-Z_0-9");
  }

  if (raw.id) {
    const existing = await db.role.findUnique({ where: { id: raw.id }, include: { _count: { select: { users: true } } } });
    if (!existing) throw new AppError("NOT_FOUND", "Role not found");
    if (existing.isSystem && existing.name === "SUPER_ADMIN") {
      throw new AppError("VALIDATION_ERROR", "The SUPER_ADMIN role cannot be modified — it always has full access");
    }
    const updated = db.role.update({
      where: { id: raw.id },
      data: {
        ...(existing.isSystem ? {} : { name }),
        nameAr,
        description,
        rolePermissions: {
          deleteMany: {},
          create: perms.map((permissionKey) => ({ permissionKey })),
        },
      },
      include: { rolePermissions: true },
    });
    const { recordAudit } = await import("@/shared/core/audit");
    await recordAudit(db, {
      userId: actor.id, action: "ROLE_UPDATE", entityType: "Role", entityId: raw.id,
      newValues: { permissions: perms },
    });
    return updated;
  }

  const dup = await db.role.findUnique({ where: { name }, select: { id: true } });
  if (dup) throw new AppError("DUPLICATE", "Role name already exists");

  const created = db.role.create({
    data: {
      name,
      nameAr,
      description,
      rolePermissions: { create: perms.map((permissionKey) => ({ permissionKey })) },
    },
    include: { rolePermissions: true },
  });
  const row = await created;
  const { recordAudit } = await import("@/shared/core/audit");
  await recordAudit(db, {
    userId: actor.id, action: "ROLE_CREATE", entityType: "Role", entityId: row.id,
    newValues: { permissions: perms },
  });
  return created;
}

export async function deleteRole(id: string) {
  const role = await db.role.findUnique({
    where: { id },
    include: { _count: { select: { users: { where: { deletedAt: null } } } } },
  });
  if (!role) throw new AppError("NOT_FOUND", "Role not found");
  if (role.isSystem) throw new AppError("VALIDATION_ERROR", "Built-in roles cannot be deleted");
  if (role._count.users > 0) throw new AppError("IN_USE", "Role has assigned users");
  await db.role.delete({ where: { id } });
}

export function defaultNameAr(name: string): string | null {
  return ROLE_NAMES_AR[name] ?? null;
}
