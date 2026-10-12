"use client";

/**
 * Offline mutation queue (IndexedDB).
 *
 * Critical operations (POS sales, customer payments/debts) are stored locally
 * when the app is offline and replayed through their normal server actions
 * once connectivity returns. Invoice numbers, balances and stock stay fully
 * server-authoritative because replay goes through the exact same actions.
 */

export type OutboxKind = "SALE" | "CUSTOMER_TXN";

export interface OutboxItem {
  id: string;
  kind: OutboxKind;
  payload: unknown;
  createdAt: string;
  attempts: number;
}

const DB_NAME = "grocery-offline";
const DB_VERSION = 1;
const OUTBOX = "outbox";
const KV = "kv";

type Listener = (count: number) => void;
const listeners = new Set<Listener>();

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(OUTBOX)) db.createObjectStore(OUTBOX, { keyPath: "id" });
      if (!db.objectStoreNames.contains(KV)) db.createObjectStore(KV, { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function requestAsPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function notifyListeners(count: number) {
  for (const l of listeners) l(count);
}

export function subscribeOutbox(listener: Listener): () => void {
  listeners.add(listener);
  void countOutbox().then(listener);
  return () => listeners.delete(listener);
}

export async function countOutbox(): Promise<number> {
  try {
    const db = await openDb();
    const n = await requestAsPromise(db.transaction(OUTBOX).objectStore(OUTBOX).count());
    db.close();
    return n;
  } catch {
    return 0;
  }
}

export async function listOutbox(): Promise<OutboxItem[]> {
  try {
    const db = await openDb();
    const all = await requestAsPromise(
      db.transaction(OUTBOX).objectStore(OUTBOX).getAll() as IDBRequest<OutboxItem[]>
    );
    db.close();
    return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  } catch {
    return [];
  }
}

/** Queues a mutation for later replay and notifies listeners. */
export async function enqueue(kind: OutboxKind, payload: unknown): Promise<void> {
  const item: OutboxItem = {
    id: crypto.randomUUID(),
    kind,
    payload,
    createdAt: new Date().toISOString(),
    attempts: 0,
  };
  const db = await openDb();
  await requestAsPromise(db.transaction(OUTBOX, "readwrite").objectStore(OUTBOX).add(item));
  db.close();
  notifyListeners(await countOutbox());
}

async function removeOutbox(id: string): Promise<void> {
  const db = await openDb();
  await requestAsPromise(db.transaction(OUTBOX, "readwrite").objectStore(OUTBOX).delete(id));
  db.close();
}

async function bumpAttempts(id: string): Promise<void> {
  const db = await openDb();
  const store = db.transaction(OUTBOX, "readwrite").objectStore(OUTBOX);
  const item = (await requestAsPromise(store.get(id))) as OutboxItem | undefined;
  if (item) {
    item.attempts += 1;
    await requestAsPromise(store.put(item));
  }
  db.close();
}

/** Generic key/value snapshot store (e.g. last known product/customer lists). */
export async function putCache(key: string, value: unknown): Promise<void> {
  try {
    const db = await openDb();
    await requestAsPromise(db.transaction(KV, "readwrite").objectStore(KV).put({ key, value }));
    db.close();
  } catch {
    /* non-fatal */
  }
}

export async function getCache<T>(key: string): Promise<T | null> {
  try {
    const db = await openDb();
    const row = (await requestAsPromise(
      db.transaction(KV).objectStore(KV).get(key) as IDBRequest<{ key: string; value: T } | undefined>
    )) as { key: string; value: T } | undefined;
    db.close();
    return row?.value ?? null;
  } catch {
    return null;
  }
}

export interface FlushResult {
  synced: number;
  failed: number;
  dropped: number;
}

/**
 * Server-side business rejections a retry can never fix: bad/absent payload,
 * missing row, insufficient stock, or a frozen / over-limit / zero balance
 * customer. Retrying them forever keeps the failed-sync toast firing and pins
 * the outbox, so the item is dropped instead — the operator re-enters it if it
 * still matters. Response-loss / server faults (INTERNAL_ERROR, network) are
 * NOT listed here and keep retrying.
 */
const PERMANENT_ERROR_CODES = new Set([
  "VALIDATION_ERROR", "INSUFFICIENT_STOCK", "CREDIT_LIMIT_EXCEEDED",
  "BALANCE_FROZEN", "NOT_FOUND", "FORBIDDEN", "UNAUTHORIZED", "IN_USE", "DUPLICATE",
]);

/** Replays queued mutations oldest-first through their real server actions. */
export async function flushOutbox(): Promise<FlushResult> {
  const items = await listOutbox();
  let synced = 0;
  let failed = 0;
  let dropped = 0;

  for (const item of items) {
    try {
      let ok = false;
      let permanent = false;
      const rawPayload = (item.payload ?? {}) as Record<string, unknown>;
      // Legacy queued items predate clientId — stamp a stable key so replays
      // are idempotent even for an item whose response was lost after commit.
      const clientId = String(rawPayload.clientId ?? "") || item.id;
      if (item.kind === "SALE") {
        const { checkoutAction } = await import("@/features/sales/actions");
        const res = await checkoutAction({ ...rawPayload, clientId } as Parameters<typeof checkoutAction>[0]);
        ok = res.ok;
        if (!res.ok && PERMANENT_ERROR_CODES.has(res.error.code)) permanent = true;
      } else {
        const { recordCustomerTxnAction, attachCustomerTxnImageAction, matchCustomerTxnAction } =
          await import("@/features/customers/actions");
        const { imageData, imageMime, ...txnPayload } = rawPayload;
        // Legacy queued items predate idempotency keys. Replaying them with a
        // fresh key would mint a brand-new row even though the original was
        // already committed — that's how old "auto-added" duplicates resurfaced.
        // If an identical ledger entry already exists, this is a duplicate:
        // drop it without calling the server again.
        if (!rawPayload.clientId) {
          const match = (await matchCustomerTxnAction(txnPayload)) as
            | { ok: true; data: { id: string } | null }
            | { ok: false };
          if (match.ok && match.data?.id) {
            await removeOutbox(item.id);
            synced += 1;
            continue;
          }
        }
        const res = (await recordCustomerTxnAction({ ...txnPayload, clientId })) as
          | { ok: true; data: { id: string } }
          | { ok: false; error?: { code?: string } };
        if (!res.ok && res.error?.code === "DELETED_KEY") {
          // The row this item created was deliberately deleted (duplicate
          // purge / manual delete / clear account). Its key is tombstoned, so
          // replaying it forever would only resurrect a row the user removed —
          // drop the item instead of retrying it.
          await removeOutbox(item.id);
          synced += 1;
          continue;
        }
        if (!res.ok) {
          ok = false; // payment failed — stays queued for retry unless permanent
          if (res.error?.code && PERMANENT_ERROR_CODES.has(res.error.code)) permanent = true;
        } else if (imageData) {
          const attach = (await attachCustomerTxnImageAction(res.data.id, {
            dataUrl: String(imageData),
            mime: imageMime ? String(imageMime) : "",
          })) as { ok: boolean };
          if (!attach.ok) {
            // Payment already recorded — do NOT re-queue (would double-charge).
            // Drop the item and surface a sync failure so the operator notices.
            await removeOutbox(item.id);
            ok = false;
          }
        }
      }
      if (ok) {
        await removeOutbox(item.id);
        synced += 1;
      } else if (permanent) {
        // Unrecoverable business rejection — drop it so it stops pinning the
        // queue and re-firing the failure toast on every automatic retry.
        await removeOutbox(item.id);
        dropped += 1;
      } else {
        failed += 1;
        await bumpAttempts(item.id);
      }
    } catch {
      // Network died mid-replay — stop here; remaining items stay queued.
      failed += 1;
      await bumpAttempts(item.id);
      break;
    }
  }

  if (items.length > 0) notifyListeners(await countOutbox());
  return { synced, failed, dropped };
}
