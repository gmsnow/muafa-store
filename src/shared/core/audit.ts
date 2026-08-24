import type { PrismaClient, Prisma } from "@/generated/prisma/client";

export interface AuditEntry {
  userId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  oldValues?: Prisma.InputJsonValue;
  newValues?: Prisma.InputJsonValue;
  ip?: string | null;
  userAgent?: string | null;
}

/** Writes an audit record inside an optional transaction client. Fire-safe: never throws into business flow. */
export async function recordAudit(client: PrismaClient | Prisma.TransactionClient, entry: AuditEntry): Promise<void> {
  try {
    await client.auditLog.create({
      data: {
        userId: entry.userId ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        oldValues: entry.oldValues,
        newValues: entry.newValues,
        ip: entry.ip ?? null,
        userAgent: entry.userAgent ?? null,
      },
    });
  } catch (err) {
    // Imported lazily to avoid circular import at module load.
    const { logger } = await import("./logger");
    logger.error("audit_write_failed", err, { action: entry.action });
  }
}
