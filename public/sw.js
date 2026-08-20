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

function serveNode(path) {
  return idbGetNode(path).then(function (node) {
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
  });
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

  if (idx !== -1) {
    // Explicit /__live__/<path> request — the normal case for the page itself and any
    // relatively-referenced resource (style.css, ./assets/img.png, ../shared/app.js, etc).
    const encodedPath = url.pathname.slice(idx + LIVE_PREFIX.length);
    const path = decodeURIComponent(encodedPath).replace(/^\/+/, "");
    event.respondWith(serveNode(path));
    return;
  }

  // Root-absolute reference (e.g. <link href="/style.css">, <img src="/images/logo.png">)
  // from *within* a page we're already live-serving. There's no real per-project domain root
  // to resolve these against, so we detect them by checking whether the request was triggered
  // by a document we're already serving under /__live__/ (via the Referer), and if so, resolve
  // the absolute path against the project root instead of this app's own root.
  const referer = event.request.referrer || "";
  if (referer.indexOf(LIVE_PREFIX) !== -1) {
    const path = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    // Browsers probe for a favicon even when the project did not request one.
    // Keep that browser-generated request from appearing as a missing project asset.
    if (path === "favicon.ico") {
      event.respondWith(new Response(null, { status: 204 }));
      return;
    }
    event.respondWith(serveNode(path));
    return;
  }
  // Anything else (the CodeForge app's own files) — let the browser handle it normally.
});
