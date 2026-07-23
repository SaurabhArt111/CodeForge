// CodeForge service worker — powers "Open with Live Server" and "Open in Integrated Browser".
// It intercepts requests under /__live__/<path> and serves them straight from this browser's
// IndexedDB project store. Nothing here ever leaves the device — it's a purely local virtual
// server so relative <link>/<script>/<img> references in an HTML file resolve correctly.
const LIVE_PREFIX = "__live__/";
const DB_NAME = "codeforge-db";

const MIME = {
  html: "text/html; charset=utf-8", htm: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8", mjs: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8", json: "application/json; charset=utf-8",
  svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  gif: "image/gif", webp: "image/webp", ico: "image/x-icon",
  woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf",
  txt: "text/plain; charset=utf-8", xml: "application/xml; charset=utf-8",
  wasm: "application/wasm", mp4: "video/mp4", webm: "video/webm",
  mp3: "audio/mpeg", wav: "audio/wav", pdf: "application/pdf",
};
function extOf(path) {
  const base = path.split("/").pop();
  const i = base.lastIndexOf(".");
  return i > 0 ? base.slice(i + 1).toLowerCase() : "";
}
function mimeFor(path) { return MIME[extOf(path)] || "application/octet-stream"; }

function idbGetNode(path) {
  return new Promise(function (resolve, reject) {
    const req = indexedDB.open(DB_NAME);
    req.onerror = function () { reject(req.error); };
    req.onsuccess = function () {
      const db = req.result;
      if (!db.objectStoreNames.contains("nodes")) { resolve(null); return; }
      const tx = db.transaction("nodes", "readonly");
      const store = tx.objectStore("nodes");
      const getReq = store.get(path);
      getReq.onsuccess = function () { resolve(getReq.result || null); };
      getReq.onerror = function () { reject(getReq.error); };
    };
  });
}
function base64ToBytes(b64) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}
const LIVE_RELOAD_SNIPPET =
  '<script>(function(){try{var bc=new BroadcastChannel("codeforge-live");' +
  'bc.onmessage=function(){location.reload();};}catch(e){}})();<' + "/script>";

function injectLiveReload(html) {
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, LIVE_RELOAD_SNIPPET + "</body>");
  return html + LIVE_RELOAD_SNIPPET;
}

self.addEventListener("install", function (event) {
  self.skipWaiting();
});
self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", function (event) {
  const url = new URL(event.request.url);
  const idx = url.pathname.indexOf(LIVE_PREFIX);
  if (idx === -1) return; // not a live-preview request; let the browser handle it normally

  const encodedPath = url.pathname.slice(idx + LIVE_PREFIX.length);
  const path = decodeURIComponent(encodedPath).replace(/^\/+/, "");

  event.respondWith(
    idbGetNode(path).then(function (node) {
      if (!node || node.type !== "file") {
        return new Response(
          "CodeForge Live Server: \u201c" + path + "\u201d was not found in this project.",
          { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } }
        );
      }
      const type = mimeFor(path);
      let body;
      if (node.isBinary) {
        if (node.dataUrl) {
          const b64 = node.dataUrl.split(",")[1] || "";
          body = base64ToBytes(b64);
        } else {
          body = new Uint8Array(0);
        }
      } else if (/^text\/html/.test(type)) {
        body = injectLiveReload(node.content || "");
      } else {
        body = node.content || "";
      }
      return new Response(body, { status: 200, headers: { "Content-Type": type, "Cache-Control": "no-cache" } });
    }).catch(function (err) {
      return new Response("CodeForge Live Server error: " + err.message, { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    })
  );
});
