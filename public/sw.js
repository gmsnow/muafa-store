/**
 * Grocery PWA service worker.
 * - Cache-first: build assets, icons, fonts (immutable content).
 * - Network-first: page navigations (data must be fresh); falls back to the
 *   last cached copy of the same URL when offline.
 * - Never touches /api/ or non-GET requests.
 */
const VERSION = "v1";
const STATIC_CACHE = `static-${VERSION}`;
const PAGE_CACHE = `pages-${VERSION}`;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
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
  if (url.pathname.startsWith("/api/")) return;

  const isStatic =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    /\.(?:css|js|png|jpe?g|gif|svg|webp|avif|ico|woff2?)$/.test(url.pathname);

  if (isStatic) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        const hit = await cache.match(req);
        if (hit) return hit;
        try {
          const res = await fetch(req);
          if (res.ok) cache.put(req, res.clone());
          return res;
        } catch {
          return new Response("", { status: 504, statusText: "Offline" });
        }
      })(),
    );
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(PAGE_CACHE);
        try {
          const res = await fetch(req);
          if (res.ok && res.type === "basic") cache.put(req, res.clone());
          return res;
        } catch {
          const hit =
            (await cache.match(req, { ignoreSearch: true })) ??
            (await cache.match("/dashboard"));
          return (
            hit ??
            new Response(
              "<meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><body style=\"font-family:sans-serif;display:grid;place-items:center;height:100vh;margin:0\" dir=\"rtl\"><p>لا يوجد اتصال — أعد المحاولة عند توفر الإنترنت</p></body>",
              { headers: { "Content-Type": "text/html; charset=utf-8" }, status: 503 },
            )
          );
        }
      })(),
    );
  }
});
