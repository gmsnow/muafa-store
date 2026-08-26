/**
 * Grocery PWA service worker.
 * - Cache-first for hashed /_next/static/ build assets (immutable).
 * - Every visited page + its RSC payloads are cached network-first, so the
 *   whole app stays browsable offline (last-seen snapshot of each page).
 * - Auth/login/api pages are never cached. Queued mutations (POS sales,
 *   customer payments/debts) replay through the app's IndexedDB outbox when
 *   connectivity returns.
 */
const VERSION = "v5";
const STATIC_CACHE = `static-${VERSION}`;
const PAGE_CACHE = `pages-${VERSION}`;
const DATA_CACHE = `data-${VERSION}`;

// Never cache error pages — only cache successful, non-redirected responses.
// Never cache these paths (auth screens, APIs, the SW itself).
const NO_CACHE_PATHS = /^\/(login|forgot|reset|register|api|sw\.js)(\/|$|\?)/;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Purge every cache left by older SW versions.
      const keep = new Set([STATIC_CACHE, PAGE_CACHE, DATA_CACHE]);
      for (const key of await caches.keys()) {
        if (!keep.has(key)) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

function isRscRequest(req) {
  if (req.headers.get("rsc") === "1") return true;
  if ((req.headers.get("accept") || "").includes("text/x-component")) return true;
  return false;
}

function offlineScreen() {
  return new Response(
    "<meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><body style=\"font-family:sans-serif;display:grid;place-items:center;height:100vh;margin:0\" dir=\"rtl\"><p>لا يوجد اتصال — افتح الصفحة مرة واحدة وأنت متصل لتُحفظ للعمل أوفلاين</p></body>",
    { headers: { "Content-Type": "text/html; charset=utf-8" }, status: 503 },
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (NO_CACHE_PATHS.test(url.pathname)) return;

  // Immutable build assets: cache-first forever (purged on version bump).
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

  // RSC payload fetches (client-side navigation/prefetch): network-first,
  // cached so router.push() keeps working offline.
  if (isRscRequest(req)) {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res.ok && !res.redirected) {
            const cache = await caches.open(DATA_CACHE);
            cache.put(req, res.clone());
          }
          return res;
        } catch {
          const cache = await caches.open(DATA_CACHE);
          const hit = await cache.match(req);
          if (hit) return hit;
          throw new Error("offline and not cached");
        }
      })().catch(() => offlineScreen()),
    );
    return;
  }

  // Page navigations: network-first, cached for offline browsing.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          // Never cache redirects (e.g. auth bounce to /login) or failures.
          if (res.ok && !res.redirected) {
            const cache = await caches.open(PAGE_CACHE);
            cache.put(req, res.clone());
          }
          return res;
        } catch {
          const cache = await caches.open(PAGE_CACHE);
          return (
            (await cache.match(req)) ||
            (await cache.match(req, { ignoreSearch: true })) ||
            offlineScreen()
          );
        }
      })(),
    );
  }
});
