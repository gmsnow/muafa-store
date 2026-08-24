import "server-only";
import { db } from "@/shared/db";
import { Prisma } from "@/generated/prisma/client";

export interface AuditFilters {
  userId?: string;
  action?: string;
  entityType?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export async function listAudit(filters: AuditFilters) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = filters.pageSize ?? 25;
  const where: Prisma.AuditLogWhereInput = {
    ...(filters.userId ? { userId: filters.userId } : {}),
    ...(filters.action ? { action: { contains: filters.action, mode: "insensitive" as const } } : {}),
    ...(filters.entityType
      ? { entityType: { equals: filters.entityType, mode: "insensitive" as const } }
      : {}),
    ...(filters.from || filters.to
      ? {
          createdAt: {
            ...(filters.from ? { gte: new Date(`${filters.from}T00:00:00`) } : {}),
            ...(filters.to ? { lte: new Date(`${filters.to}T23:59:59`) } : {}),
          },
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      include: { user: { select: { username: true, fullName: true, fullNameAr: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.auditLog.count({ where }),
  ]);
  return { rows, total, page, pageSize };
}

/** Distinct action/entityType values for filter dropdowns (cheap distinct scan). */
export async function listAuditFacets() {
  const [actions, entities] = await Promise.all([
    db.auditLog.findMany({ distinct: ["action"], select: { action: true }, orderBy: { action: "asc" } }),
    db.auditLog.findMany({
      distinct: ["entityType"],
      select: { entityType: true },
      orderBy: { entityType: "asc" },
      where: { entityType: { not: null } },
    }),
  ]);
  return {
    actions: actions.map((a) => a.action),
    entityTypes: entities.map((e) => e.entityType).filter((v): v is string => Boolean(v)),
  };
}

export async function listUsersForFilter() {
  return db.user.findMany({
    where: { deletedAt: null },
    select: { id: true, username: true, fullName: true, fullNameAr: true },
    orderBy: { username: "asc" },
  });
}
