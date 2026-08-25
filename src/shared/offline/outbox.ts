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
}

/** Replays queued mutations oldest-first through their real server actions. */
export async function flushOutbox(): Promise<FlushResult> {
  const items = await listOutbox();
  let synced = 0;
  let failed = 0;

  for (const item of items) {
    try {
      let ok = false;
      if (item.kind === "SALE") {
        const { checkoutAction } = await import("@/features/sales/actions");
        const res = await checkoutAction(item.payload as Parameters<typeof checkoutAction>[0]);
        ok = res.ok;
      } else {
        const { recordCustomerTxnAction } = await import("@/features/customers/actions");
        const res = await recordCustomerTxnAction(item.payload);
        ok = res.ok;
      }
      if (ok) {
        await removeOutbox(item.id);
        synced += 1;
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
  return { synced, failed };
}
