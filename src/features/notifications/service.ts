import "server-only";
import { db } from "@/shared/db";
import { logger } from "@/shared/core/logger";
import { NotificationType } from "@/generated/prisma/client";

/**
 * Derived notification center: conditions are re-scanned and upserted as
 * unread Notification rows, deduped on (type, entityId). Read rows are never
 * re-created for the same entity until the condition recurs after being read.
 */

export interface NotificationCandidate {
  type: NotificationType;
  title: string;
  body: string;
  entityType: string;
  entityId: string;
  href: string;
}

export async function scanCandidates(): Promise<NotificationCandidate[]> {
  const settings = await db.systemSettings.findUnique({ where: { id: "system" } });
  const warnDays = settings?.expirationWarningDays ?? 30;
  const now = new Date();
  const soon = new Date(now.getTime() + warnDays * 86400000);
  const out: NotificationCandidate[] = [];

  // Low / out of stock (cap 50 each)
  const invRows = await db.inventory.findMany({
    where: { product: { deletedAt: null } },
    select: {
      quantity: true, productId: true,
      product: { select: { name: true, nameAr: true, sku: true, minStock: true } },
    },
    take: 500,
  });
  for (const r of invRows) {
    const qty = Number(r.quantity);
    const min = Number(r.product.minStock);
    if (qty <= 0) {
      out.push({
        type: "OUT_OF_STOCK", title: "OUT_OF_STOCK", entityType: "Product", entityId: r.productId,
        body: `${r.product.name} · ${r.product.sku}`, href: `/inventory/products?q=${encodeURIComponent(r.product.sku)}`,
      });
    } else if (qty <= min) {
      out.push({
        type: "LOW_STOCK", title: "LOW_STOCK", entityType: "Product", entityId: r.productId,
        body: `${r.product.name} · ${qty} / ${min}`, href: `/inventory/stock`,
      });
    }
  }

  // Expiring / expired batches with stock
  const [expiring, expired] = await Promise.all([
    db.productBatch.findMany({
      where: { expiryDate: { gt: now, lte: soon }, quantity: { gt: 0 }, product: { deletedAt: null } },
      select: { id: true, batchNo: true, expiryDate: true, product: { select: { name: true } } },
      take: 50,
      orderBy: { expiryDate: "asc" },
    }),
    db.productBatch.findMany({
      where: { expiryDate: { lt: now }, quantity: { gt: 0 }, product: { deletedAt: null } },
      select: { id: true, batchNo: true, expiryDate: true, product: { select: { name: true } } },
      take: 50,
      orderBy: { expiryDate: "asc" },
    }),
  ]);
  for (const b of expiring) {
    out.push({
      type: "EXPIRING", title: "EXPIRING", entityType: "ProductBatch", entityId: b.id,
      body: `${b.product.name} · ${b.batchNo ?? "—"} · ${b.expiryDate!.toISOString().slice(0, 10)}`,
      href: "/inventory/expiring",
    });
  }
  for (const b of expired) {
    out.push({
      type: "EXPIRED", title: "EXPIRED", entityType: "ProductBatch", entityId: b.id,
      body: `${b.product.name} · ${b.batchNo ?? "—"} · ${b.expiryDate!.toISOString().slice(0, 10)}`,
      href: "/inventory/expiring",
    });
  }

  // Open purchase orders awaiting completion
  const pos = await db.purchaseOrder.findMany({
    where: { status: { in: ["PENDING", "APPROVED", "ORDERED", "PARTIALLY_RECEIVED"] } },
    select: { id: true, poNumber: true, status: true, supplier: { select: { name: true } } },
    take: 50,
    orderBy: { createdAt: "desc" },
  });
  for (const po of pos) {
    out.push({
      type: "PENDING_PO", title: "PENDING_PO", entityType: "PurchaseOrder", entityId: po.id,
      body: `${po.poNumber} · ${po.supplier.name} · ${po.status}`,
      href: "/procurement/purchase-orders",
    });
  }

  // Credit breaches
  const overLimit = await db.customer.findMany({
    where: { deletedAt: null, creditLimit: { gt: 0 } },
    select: { id: true, name: true, balance: true, creditLimit: true },
    take: 200,
  });
  for (const c of overLimit) {
    if (Number(c.balance) > Number(c.creditLimit)) {
      out.push({
        type: "CREDIT_LIMIT", title: "CREDIT_LIMIT", entityType: "Customer", entityId: c.id,
        body: `${c.name} · ${Number(c.balance)} / ${Number(c.creditLimit)}`,
        href: "/customers/list",
      });
    }
  }

  return out;
}

/**
 * The (app) layout calls this on every navigation; the condition scan is ~7
 * queries. A short in-process TTL collapses rapid sidebar navigation into a
 * single scan. markAllRead() invalidates so the bell updates immediately.
 */
const SYNC_TTL_MS = 20_000;
type SyncedNotifications = Awaited<ReturnType<typeof listNotifications>>;
let syncCache: { at: number; promise: Promise<SyncedNotifications> } | null = null;

export function syncNotifications(limit = 25): Promise<SyncedNotifications> {
  const cached = syncCache;
  if (cached && Date.now() - cached.at < SYNC_TTL_MS) return cached.promise;
  const promise: Promise<SyncedNotifications> = doSyncNotifications(limit).catch((err) => {
    if (syncCache?.promise === promise) syncCache = null;
    throw err;
  });
  syncCache = { at: Date.now(), promise };
  return promise;
}

/** Upsert unread notifications for current conditions; returns fresh list. */
async function doSyncNotifications(limit = 25) {
  const candidates = await scanCandidates();
  if (candidates.length > 0) {
    const existing = await db.notification.findMany({
      where: { isRead: false },
      select: { type: true, entityId: true },
    });
    const seen = new Set(existing.map((n) => `${n.type}:${n.entityId}`));
    const fresh = candidates.filter((c) => !seen.has(`${c.type}:${c.entityId}`));
    if (fresh.length > 0) {
      await db.notification.createMany({
        data: fresh.map((c) => ({
          type: c.type, title: c.title, body: c.body,
          entityType: c.entityType, entityId: c.entityId,
        })),
      });
    }
  }
  return listNotifications(limit);
}

export async function listNotifications(limit = 25) {
  const rows = await db.notification.findMany({
    orderBy: [{ isRead: "asc" }, { createdAt: "desc" }],
    take: limit,
  });
  return rows;
}

export async function markAllRead() {
  syncCache = null; // next sync must reflect the fresh read state
  await db.notification.updateMany({ where: { isRead: false }, data: { isRead: true } });
}

export async function unreadCount() {
  return db.notification.count({ where: { isRead: false } });
}

// ---------------------------------------------------------------------------
// Operation events — fired after a business mutation commits. Never throws:
// a notification failure must not fail the operation that produced it.
// ---------------------------------------------------------------------------

export interface NotifyInput {
  type: NotificationType;
  title: string;
  body?: string;
  href?: string;
  entityType?: string;
  entityId?: string;
}

export async function notify(input: NotifyInput) {
  syncCache = null; // bell list must include the new event on next read
  try {
    await db.notification.create({
      data: {
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        href: input.href ?? null,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
      },
    });
  } catch (err) {
    logger.error("notify_failed", err);
  }
}

export async function deleteNotification(id: string) {
  syncCache = null;
  await db.notification.delete({ where: { id } });
}
