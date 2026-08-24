import "server-only";
import bcrypt from "bcryptjs";
import { db } from "@/shared/db";
import { AppError } from "@/shared/core/api-response";
import { userFormSchema } from "./schema";
import type { AuthUser } from "@/features/auth/session";

export async function listUsers(opts: { includeDeleted?: boolean; page?: number; pageSize?: number } = {}) {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = opts.pageSize ?? 50;
  const where = opts.includeDeleted ? {} : { deletedAt: null };
  const [rows, total] = await Promise.all([
    db.user.findMany({
      where,
      include: {
        role: { select: { id: true, name: true, nameAr: true } },
        _count: { select: { sessions: { where: { revokedAt: null, expiresAt: { gt: new Date() } } } } },
      },
      orderBy: { username: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.user.count({ where }),
  ]);
  return { rows, total, page, pageSize };
}

export async function getUserForEdit(id: string) {
  const u = await db.user.findUnique({
    where: { id },
    select: {
      id: true, username: true, fullName: true, fullNameAr: true, email: true,
      phone: true, roleId: true, status: true, mustChangePassword: true, deletedAt: true,
    },
  });
  if (!u) throw new AppError("NOT_FOUND", "User not found");
  return u;
}

async function assertNotLastSuperAdmin(userId: string | null, targetRoleId: string | null) {
  if (userId === null || targetRoleId === null) return;
  const superRole = await db.role.findFirst({ where: { name: "SUPER_ADMIN" } });
  if (!superRole) return;
  const target = await db.user.findUnique({ where: { id: userId }, include: { role: true } });
  if (!target) throw new AppError("NOT_FOUND", "User not found");
  const isSuperNow = target.roleId === superRole.id;
  const staysSuper = targetRoleId === superRole.id;
  if (!(isSuperNow && !staysSuper)) return;
  const activeSupers = await db.user.count({
    where: { roleId: superRole.id, deletedAt: null, status: "ACTIVE", id: { not: userId } },
  });
  if (activeSupers === 0) {
    throw new AppError("VALIDATION_ERROR", "At least one active SUPER_ADMIN must remain");
  }
}

export async function saveUser(actor: AuthUser, raw: unknown, editId?: string | null) {
  const data = userFormSchema.parse(raw);
  const settings = await db.systemSettings.upsert({ where: { id: "system" }, update: {}, create: { id: "system" } });
  const minLen = settings.passwordMinLength;

  const role = await db.role.findUnique({ where: { id: data.roleId } });
  if (!role) throw new AppError("VALIDATION_ERROR", "Unknown role");

  if (editId) {
    const existing = await db.user.findUnique({ where: { id: editId } });
    if (!existing || existing.deletedAt) throw new AppError("NOT_FOUND", "User not found");
    if (existing.id === actor.id && existing.roleId !== data.roleId) {
      throw new AppError("VALIDATION_ERROR", "You cannot change your own role");
    }
    if (existing.roleId !== data.roleId) await assertNotLastSuperAdmin(existing.id, data.roleId);
    if (data.password && data.password.length < minLen) {
      throw new AppError("VALIDATION_ERROR", `Password must be at least ${minLen} characters`, {
        password: [`min ${minLen}`],
      });
    }
    const dup = await db.user.findFirst({
      where: { OR: [{ username: data.username }, ...(data.email ? [{ email: data.email }] : [])], id: { not: editId } },
      select: { id: true },
    });
    if (dup) throw new AppError("DUPLICATE", "Username or email already exists");
    const updated = db.user.update({
      where: { id: editId },
      data: {
        username: data.username,
        fullName: data.fullName,
        fullNameAr: data.fullNameAr || null,
        email: data.email || null,
        phone: data.phone || null,
        roleId: data.roleId,
        ...(data.password
          ? {
              passwordHash: await bcrypt.hash(data.password, 10),
              mustChangePassword: false,
            }
          : {}),
      },
    });
    const { recordAudit } = await import("@/shared/core/audit");
    await recordAudit(db, {
      userId: actor.id, action: "USER_UPDATE", entityType: "User", entityId: editId,
    });
    return updated;
  }

  if (!data.password) {
    throw new AppError("VALIDATION_ERROR", "Password is required for new users", { password: ["required"] });
  }
  if (data.password.length < minLen) {
    throw new AppError("VALIDATION_ERROR", `Password must be at least ${minLen} characters`, {
      password: [`min ${minLen}`],
    });
  }
  const dup = await db.user.findFirst({
    where: { OR: [{ username: data.username }, ...(data.email ? [{ email: data.email }] : [])] },
    select: { id: true },
  });
  if (dup) throw new AppError("DUPLICATE", "Username or email already exists");

  const created = db.user.create({
    data: {
      username: data.username,
      passwordHash: await bcrypt.hash(data.password, 10),
      fullName: data.fullName,
      fullNameAr: data.fullNameAr || null,
      email: data.email || null,
      phone: data.phone || null,
      roleId: data.roleId,
      mustChangePassword: true,
    },
  });
  const { recordAudit } = await import("@/shared/core/audit");
  const row = await created;
  await recordAudit(db, {
    userId: actor.id, action: "USER_CREATE", entityType: "User", entityId: row.id,
  });
  return created;
}

export async function setUserStatus(actor: AuthUser, id: string, status: "ACTIVE" | "SUSPENDED") {
  if (id === actor.id) throw new AppError("VALIDATION_ERROR", "You cannot change your own status");
  const target = await db.user.findUnique({ where: { id }, include: { role: true } });
  if (!target || target.deletedAt) throw new AppError("NOT_FOUND", "User not found");
  if (status === "SUSPENDED" && target.role.name === "SUPER_ADMIN") {
    const activeSupers = await db.user.count({
      where: { role: { name: "SUPER_ADMIN" }, deletedAt: null, status: "ACTIVE", id: { not: id } },
    });
    if (activeSupers === 0) throw new AppError("VALIDATION_ERROR", "At least one active SUPER_ADMIN must remain");
  }
  const updated = db.user.update({ where: { id }, data: { status, failedLoginAttempts: 0, lockedUntil: null } });
  if (status === "SUSPENDED") {
    await db.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
  }
  const { recordAudit } = await import("@/shared/core/audit");
  await recordAudit(db, {
    userId: actor.id, action: status === "ACTIVE" ? "USER_ACTIVATE" : "USER_SUSPEND",
    entityType: "User", entityId: id,
  });
  return updated;
}

export async function softDeleteUser(actor: AuthUser, id: string) {
  if (id === actor.id) throw new AppError("VALIDATION_ERROR", "You cannot delete your own account");
  const target = await db.user.findUnique({ where: { id }, include: { role: true } });
  if (!target || target.deletedAt) throw new AppError("NOT_FOUND", "User not found");
  if (target.role.name === "SUPER_ADMIN") {
    const activeSupers = await db.user.count({
      where: { role: { name: "SUPER_ADMIN" }, deletedAt: null, status: "ACTIVE", id: { not: id } },
    });
    if (activeSupers === 0) throw new AppError("VALIDATION_ERROR", "At least one active SUPER_ADMIN must remain");
  }
  await db.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
  await db.user.update({ where: { id }, data: { deletedAt: new Date(), status: "SUSPENDED" } });
  const { recordAudit } = await import("@/shared/core/audit");
  await recordAudit(db, {
    userId: actor.id, action: "USER_DELETE", entityType: "User", entityId: id,
  });
}
