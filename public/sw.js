/**
 * Grocery PWA service worker.
 * - Cache-first for hashed /_next/static/ build assets (immutable).
 * - Offline-critical pages (POS, customer ledger) are cached network-first so
 *   the cashier can keep working without internet; queued mutations replay
 *   through the app's IndexedDB outbox when connectivity returns.
 * - Everything else passes through; offline navigation gets a friendly retry
 *   screen instead of a stale app shell.
 */
const VERSION = "v3";
const STATIC_CACHE = `static-${VERSION}`;
const PAGE_CACHE = `pages-${VERSION}`;

// Pages whose last-rendered HTML is safe to reuse offline.
const OFFLINE_PAGES = /^\/(sales\/pos|customers\/list|customers\/transactions)(\/|$|\?|#)/;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Purge every cache left by older SW versions.
      for (const key of await caches.keys()) {
        if (key !== STATIC_CACHE && key !== PAGE_CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      })(),
    );
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res.ok && OFFLINE_PAGES.test(url.pathname)) {
            const cache = await caches.open(PAGE_CACHE);
            cache.put(req, res.clone());
          }
          return res;
        } catch {
          const cache = await caches.open(PAGE_CACHE);
          const cached =
            (await cache.match(req, { ignoreSearch: true })) ||
            (await cache.match(new URL(OFFLINE_FALLBACK_URL(), self.location.origin)));
          if (cached) return cached;
          return new Response(
            "<meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><body style=\"font-family:sans-serif;display:grid;place-items:center;height:100vh;margin:0\" dir=\"rtl\"><p>لا يوجد اتصال — أعد المحاولة عند توفر الإنترنت</p></body>",
            { headers: { "Content-Type": "text/html; charset=utf-8" }, status: 503 },
          );
        }
      })(),
    );
  }
});

function OFFLINE_FALLBACK_URL() {
  return "/sales/pos";
}
