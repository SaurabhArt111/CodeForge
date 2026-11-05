// Service worker for the CodeForge web version:
//   * caches the app shell + vendor files for offline use (stale-while-revalidate for same-origin GET requests)
//   * runs the in-browser live server (live-sw.js): <scope>__live/<port>/… serves the open project, compiles JSX/TS
// Bump CACHE to force a refresh.
const CACHE = "codeforge-web-v3";
let live = null; try { importScripts("live-sw.js"); live = self.cfLive; } catch (e) { /* live server unavailable, the rest still works */ }
self.addEventListener("install", () => { self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil((async () => { for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k); await self.clients.claim(); })()); });
self.addEventListener("fetch", (e) => {
  const r = e.request, u = new URL(r.url); if (u.origin !== location.origin) return;
  if (live && live.isLive(u)) { e.respondWith(live.handle(e)); return; }
  if (r.method !== "GET") return;
  e.respondWith((async () => {
    if (live && e.clientId) { const lv = await live.fromClient(e); if (lv) return lv; }
    const c = await caches.open(CACHE); const hit = await c.match(r);
    const net = fetch(r).then((res) => { if (res.ok && res.type === "basic") c.put(r, res.clone()).catch(() => {}); return res; }).catch(() => null);
    return hit || (await net) || new Response("Offline", { status: 503 });
  })());
});
