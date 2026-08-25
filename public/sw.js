/**
 * Grocery PWA service worker.
 * - Cache-first ONLY for hashed /_next/static/ build assets (immutable).
 * - Pages are NEVER cached (live ERP data); offline navigation gets a
 *   friendly retry screen instead of a stale app shell.
 * - RSC payloads, API routes and POST/server-action requests pass through.
 */
const VERSION = "v2";
const STATIC_CACHE = `static-${VERSION}`;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Purge every cache left by older SW versions.
      for (const key of await caches.keys()) {
        if (key !== STATIC_CACHE) await caches.delete(key);
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
          return await fetch(req);
        } catch {
          return new Response(
            "<meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><body style=\"font-family:sans-serif;display:grid;place-items:center;height:100vh;margin:0\" dir=\"rtl\"><p>لا يوجد اتصال — أعد المحاولة عند توفر الإنترنت</p></body>",
            { headers: { "Content-Type": "text/html; charset=utf-8" }, status: 503 },
          );
        }
      })(),
    );
  }
});
