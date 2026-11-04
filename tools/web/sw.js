// Service worker for the CodeForge web version: caches the app shell + vendor files for offline use.
// Strategy: stale-while-revalidate for same-origin GET requests. Bump CACHE to force a refresh.
const CACHE = "codeforge-web-v1";
self.addEventListener("install", (e) => { self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil((async () => { for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k); await self.clients.claim(); })()); });
self.addEventListener("fetch", (e) => {
  const r = e.request; if (r.method !== "GET" || new URL(r.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const c = await caches.open(CACHE); const hit = await c.match(r);
    const net = fetch(r).then((res) => { if (res.ok && res.type === "basic") c.put(r, res.clone()).catch(() => {}); return res; }).catch(() => null);
    return hit || (await net) || new Response("Offline", { status: 503 });
  })());
});
