// In-browser "live server" for the web version of CodeForge (loaded by sw.js with importScripts).
//
//   <scope>__live/<port>/<path>   serves the project folder that webhost.js registered for <port> (kv key "live" in IndexedDB)
//
// It behaves like `live-server` / a small Vite dev server, inside the browser:
//   * static files with correct MIME types, directory listings, SPA fallback, range requests
//   * .jsx / .tsx / .ts / .mts are compiled on the fly (Sucrase); CSS / JSON / images can be imported from JS
//   * npm packages from package.json "dependencies" are mapped to https://esm.sh with an import map (needs internet)
//   * root-relative URLs ("/src/main.jsx", "/style.css") work: requests made BY a live page are resolved against its project
//   * console capture + live reload (BroadcastChannel) for the editor's Preview panel
// Limits: no Node.js (no server code, no node_modules, no Vue/Svelte single-file components), history-API routers see the
// URL prefix (use hash routing or a basename).
"use strict";
try { importScripts("vendor/sucrase/sucrase.min.js"); } catch (e) { /* JSX/TS compilation unavailable */ }

(function () {
  const SCOPE = new URL(self.registration.scope).pathname;     // "/app/"
  const LIVE = SCOPE + "__live/";
  const enc = new TextEncoder(), dec = new TextDecoder();

  // ---- IndexedDB (same database as core/webhost.js) ------------------------------------------------------------------
  let dbp;
  const db = () => (dbp ||= new Promise((res, rej) => {
    const rq = indexedDB.open("codeforge-web", 1);
    rq.onupgradeneeded = () => { for (const s of ["fs", "kv"]) if (!rq.result.objectStoreNames.contains(s)) rq.result.createObjectStore(s); };
    rq.onsuccess = () => { rq.result.onclose = () => { dbp = null; }; rq.result.onversionchange = () => { rq.result.close(); dbp = null; }; res(rq.result); };
    rq.onerror = () => { dbp = null; rej(rq.error); };
  }));
  const idbGet = async (store, key) => { const d = await db(); return new Promise((res, rej) => { const r = d.transaction(store).objectStore(store).get(key); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); };
  const idbKeys = async (store, prefix) => { const d = await db(); return new Promise((res, rej) => { const r = d.transaction(store).objectStore(store).getAllKeys(IDBKeyRange.bound(prefix, prefix + "￿")); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); };

  // ---- helpers -----------------------------------------------------------------------------------------------------------
  const MIME = { html: "text/html; charset=utf-8", htm: "text/html; charset=utf-8", xhtml: "application/xhtml+xml", css: "text/css; charset=utf-8", js: "text/javascript; charset=utf-8", mjs: "text/javascript; charset=utf-8", cjs: "text/javascript; charset=utf-8",
    jsx: "text/javascript; charset=utf-8", tsx: "text/javascript; charset=utf-8", ts: "text/javascript; charset=utf-8", mts: "text/javascript; charset=utf-8", json: "application/json; charset=utf-8", map: "application/json", webmanifest: "application/manifest+json",
    svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", avif: "image/avif", ico: "image/x-icon", bmp: "image/bmp", woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf",
    wasm: "application/wasm", mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", m4a: "audio/mp4", pdf: "application/pdf", xml: "application/xml; charset=utf-8",
    txt: "text/plain; charset=utf-8", md: "text/plain; charset=utf-8", csv: "text/csv; charset=utf-8", tsv: "text/tab-separated-values; charset=utf-8", vue: "text/plain; charset=utf-8", svelte: "text/plain; charset=utf-8" };
  const extOf = (p) => { const b = p.slice(p.lastIndexOf("/") + 1); const i = b.lastIndexOf("."); return i < 0 ? "" : b.slice(i + 1).toLowerCase(); };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const NOCACHE = { "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" };
  const page = (status, title, body) => new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><body style="font:15px system-ui,sans-serif;margin:0;padding:28px;background:#1e1e1e;color:#ddd"><h2 style="font-weight:500">${esc(title)}</h2>${body}`, { status, headers: { "Content-Type": "text/html; charset=utf-8", ...NOCACHE } });
  /** join `rel` onto `root`, refusing to leave it */
  function inside(root, rel) {
    const out = []; for (const s of rel.split("/")) { if (!s || s === ".") continue; if (s === "..") { if (!out.length) return null; out.pop(); } else out.push(s); }
    return root.replace(/\/$/, "") + (out.length ? "/" + out.join("/") : "");
  }
  const jsString = (s) => JSON.stringify(String(s)).split("\u2028").join("\\u2028").split("\u2029").join("\\u2029");
  const js = (code, status = 200) => new Response(code, { status, headers: { "Content-Type": MIME.js, ...NOCACHE } });

  // ---- client script injected in every HTML page (console capture, navigation, live reload) ------------------------------
  const CLIENT = `(function(){
if(window.__cfLive)return;window.__cfLive=true;
try{window.process=window.process||{env:{NODE_ENV:"development"}};if(!window.global)window.global=window;}catch(e){}
var m=/\\/__live\\/(\\d+)\\//.exec(location.pathname),PORT=m?m[1]:"";
function post(x){try{x.__cf=1;parent.postMessage(x,'*');}catch(e){}}
var budget=40,last=Date.now(),dropped=0;
function ok(){var n=Date.now();budget=Math.min(40,budget+(n-last)/1000*25);last=n;if(budget<1){dropped++;return false;}if(dropped){var d=dropped;dropped=0;post({type:'console',level:'warn',args:['… '+d+' console messages dropped (too many per second)']});}budget--;return true;}
function cut(s){s=String(s);return s.length>2000?s.slice(0,2000)+'… ('+s.length+' chars)':s;}
function fmt(x){try{if(typeof x==='string')return cut(x);if(x instanceof Error)return cut(x.stack||x.message);return cut(JSON.stringify(x));}catch(e){return cut(x);}}
['log','info','warn','error','debug'].forEach(function(k){var o=console[k];console[k]=function(){if(ok()){post({type:'console',level:k,args:Array.prototype.slice.call(arguments,0,8).map(fmt)});}return o.apply(console,arguments);};});
window.addEventListener('error',function(e){if(ok())post({type:'console',level:'error',args:[cut(e.message)+' ('+String(e.filename||'').split('/').pop()+':'+e.lineno+')']});});
window.addEventListener('unhandledrejection',function(e){if(!ok())return;var r=e.reason;post({type:'console',level:'error',args:['Unhandled promise rejection: '+cut(r&&(r.stack||r.message)||r)]});});
function nav(){post({type:'nav',url:location.href,title:document.title});}
window.addEventListener('load',nav);window.addEventListener('popstate',nav);window.addEventListener('hashchange',nav);
try{var bc=new BroadcastChannel('cf-live');bc.onmessage=function(e){var d=e.data||{};if(d.port!=null&&String(d.port)!==PORT)return;
if(/\\.css$/i.test(d.rel||'')){document.querySelectorAll('link[rel=stylesheet]').forEach(function(l){var u=new URL(l.href,location.href);if(u.origin!==location.origin)return;u.searchParams.set('_cf',Date.now());l.href=u.toString();});}else location.reload();};}catch(e){}
})();`;

  // ---- npm packages → esm.sh import map ----------------------------------------------------------------------------------
  const importMapCache = new Map();
  const cleanVer = (v) => (typeof v === "string" && /^[~^]?\d+(\.\d+){0,2}([-+.\w]*)$/.test(v.trim()) ? v.trim().replace(/^\^/, "^") : "");
  async function importMap(root, wantReact) {
    const rec = await idbGet("fs", root + "/package.json").catch(() => null);
    const key = root + ":" + wantReact + ":" + (rec ? rec.m : 0);
    if (importMapCache.has(key)) return importMapCache.get(key);
    let deps = {};
    try { if (rec && rec.d) deps = JSON.parse(dec.decode(rec.d)).dependencies || {}; } catch (e) { /* invalid package.json */ }
    if (wantReact && !deps.react) deps = { react: "18.3.1", "react-dom": "18.3.1", ...deps };
    const hasReact = !!deps.react, ext = hasReact ? "?external=react,react-dom" : "";
    const imports = {};
    for (const [name, range] of Object.entries(deps)) {
      if (!/^(@[a-z0-9._~-]+\/)?[a-z0-9._~-]+$/i.test(name)) continue;
      const v = cleanVer(range), at = v ? "@" + v : "", base = "https://esm.sh/" + name + at;
      if (name === "react") { imports.react = base; imports["react/"] = base + "/"; imports["react/jsx-runtime"] = base + "/jsx-runtime"; imports["react/jsx-dev-runtime"] = base + "/jsx-dev-runtime"; }
      else if (name === "react-dom") { imports["react-dom"] = base + "?external=react"; imports["react-dom/client"] = base + "/client?external=react"; imports["react-dom/server"] = base + "/server?external=react"; imports["react-dom/"] = base + "/"; }
      else { imports[name] = base + ext; imports[name + "/"] = base + "/"; }
    }
    const out = Object.keys(imports).length ? JSON.stringify({ imports }) : "";
    importMapCache.set(key, out); if (importMapCache.size > 40) importMapCache.delete(importMapCache.keys().next().value);
    return out;
  }

  async function htmlResponse(text, root, port) {
    const wantReact = /<script[^>]+src=["'][^"']+\.(?:jsx|tsx)(?:\?[^"']*)?["']/i.test(text) || /type=["']module["'][^>]*>[^<]*from\s+["']react["']/i.test(text);
    let tags = `<script src="${LIVE}__cf_live.js"></script>`;
    if (!/<script[^>]+type=["']importmap["']/i.test(text)) { const map = await importMap(root, wantReact); if (map) tags += `<script type="importmap">${map}</script>`; }
    const at = (/<head(\s[^>]*)?>/i.exec(text) || /<html(\s[^>]*)?>/i.exec(text) || /<!doctype[^>]*>/i.exec(text));
    const i = at ? at.index + at[0].length : 0;
    return new Response(text.slice(0, i) + tags + text.slice(i), { headers: { "Content-Type": MIME.html, ...NOCACHE } });
  }

  // ---- source transforms ----------------------------------------------------------------------------------------------------
  function compile(text, path) {
    const ext = extOf(path);
    if (!self.sucrase) return js(`throw new Error(${jsString("CodeForge: the JSX/TypeScript compiler could not be loaded (" + path + ")")});`, 500);
    try {
      const transforms = ext === "jsx" ? ["jsx"] : ext === "tsx" ? ["typescript", "jsx"] : ["typescript"];
      let code = self.sucrase.transform(text, { transforms, jsxRuntime: "automatic", production: true, filePath: path }).code;
      if (/import\.meta\.env/.test(code)) code = "import.meta.env=Object.assign({MODE:'development',DEV:true,PROD:false,SSR:false,BASE_URL:'/'},import.meta.env||{});\n" + code;
      return js(code);
    } catch (e) {
      const msg = `${path}: ${e && e.message || e}`;
      return js(`console.error(${jsString(msg)});throw new SyntaxError(${jsString(msg)});`, 500);
    }
  }
  /** `import "./a.css"`, `import data from "./a.json"`, `import url from "./a.png"` */
  function asModule(bytes, path, url) {
    const ext = extOf(path);
    if (ext === "css") return js(`const s=document.createElement("style");s.dataset.cfSrc=${jsString(path.slice(path.lastIndexOf("/") + 1))};s.textContent=${jsString(dec.decode(bytes))};document.head.append(s);export default ${jsString(dec.decode(bytes))};`);
    if (ext === "json") return js(`export default ${dec.decode(bytes).trim() || "null"};`);
    return js(`export default ${jsString(url)};`);
  }

  function ranged(req, bytes, headers) {
    const r = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") || "");
    if (!r || (!r[1] && !r[2])) return new Response(bytes, { headers: { ...headers, "Accept-Ranges": "bytes", "Content-Length": bytes.length } });
    const len = bytes.length; let a = r[1] ? +r[1] : Math.max(0, len - +r[2]), b = r[1] && r[2] ? Math.min(+r[2], len - 1) : len - 1;
    if (a > b || a >= len) return new Response("", { status: 416, headers: { "Content-Range": `bytes */${len}` } });
    return new Response(bytes.subarray(a, b + 1), { status: 206, headers: { ...headers, "Accept-Ranges": "bytes", "Content-Range": `bytes ${a}-${b}/${len}`, "Content-Length": b - a + 1 } });
  }

  // ---- request routing --------------------------------------------------------------------------------------------------------
  /** "/app/__live/5500/x/y" -> { port: "5500", rel: "/x/y" } */
  function parseLive(pathname) {
    if (!pathname.startsWith(LIVE)) return null;
    const m = /^(\d+)(\/.*)?$/.exec(pathname.slice(LIVE.length)); return m ? { port: m[1], rel: m[2] || null } : null;
  }

  /** @param fall  true: the request came from a live page for a root-relative URL , return null when the project has no such file */
  async function serve(req, port, rel, search, fall) {
    const cfg = (await idbGet("kv", "live").catch(() => null) || {})[port];
    if (!cfg) return fall ? null : page(404, `Live server :${port} is not running`, `<p>Start it again from CodeForge (Run → Go Live), then reload this page.</p>`);
    if (rel === null) return Response.redirect(LIVE + port + "/" + search, 301);
    let decoded; try { decoded = decodeURIComponent(rel); } catch (e) { return page(400, "Bad request", "<p>Malformed URL.</p>"); }
    let path = inside(cfg.root, decoded); if (!path) return page(403, "Forbidden", "");
    let rec = await idbGet("fs", path).catch(() => null);
    if (rec && rec.t === "d") {
      if (!decoded.endsWith("/")) return Response.redirect(LIVE + port + rel + "/" + search, 301);
      let hit = null; for (const n of ["index.html", "index.htm"]) { const r = await idbGet("fs", path + "/" + n).catch(() => null); if (r && r.t === "f") { hit = [path + "/" + n, r]; break; } }
      if (!hit) { if (fall) return null; return listing(cfg.root, path, decoded, port); }
      [path, rec] = hit;
    }
    if (!rec || rec.t !== "f") {
      const last = decoded.slice(decoded.lastIndexOf("/") + 1);
      const wantsDoc = req.mode === "navigate" || req.destination === "document" || req.destination === "iframe";
      if (cfg.spa !== false && wantsDoc && !last.includes(".") && !fall) { const r = await idbGet("fs", cfg.root + "/index.html").catch(() => null); if (r && r.t === "f") { path = cfg.root + "/index.html"; rec = r; } }
      if (!rec || rec.t !== "f") return fall ? null : page(404, "404 – Not found", `<p style="color:#999">${esc(decoded)}</p>`);
    }
    const ext = extOf(path), bytes = rec.d || new Uint8Array(), headers = { "Content-Type": MIME[ext] || "application/octet-stream", ...NOCACHE };
    if (ext === "html" || ext === "htm") return req.method === "HEAD" ? new Response("", { headers }) : htmlResponse(dec.decode(bytes), cfg.root, port);
    if (["jsx", "tsx", "ts", "mts"].includes(ext)) return compile(dec.decode(bytes), path);
    if (req.destination === "script" && ["css", "json", "png", "jpg", "jpeg", "gif", "webp", "avif", "svg", "ico", "woff", "woff2", "ttf", "otf", "mp3", "mp4", "webm", "wav", "ogg", "txt", "md", "csv"].includes(ext)) return asModule(bytes, path, new URL(req.url).pathname);
    return req.method === "HEAD" ? new Response("", { headers: { ...headers, "Content-Length": bytes.length } }) : ranged(req, bytes, headers);
  }

  async function listing(root, dir, decoded, port) {
    const prefix = dir.replace(/\/$/, "") + "/", names = new Map();
    for (const k of await idbKeys("fs", prefix)) { const rest = String(k).slice(prefix.length); if (!rest) continue; const n = rest.split("/")[0]; names.set(n, rest.includes("/") || (await idbGet("fs", prefix + n).catch(() => null))?.t === "d"); }
    const rows = [...names].sort((a, b) => (b[1] - a[1]) || a[0].toLowerCase().localeCompare(b[0].toLowerCase()));
    const li = rows.map(([n, d]) => `<li style="list-style:none;padding:.35em 0"><a style="color:#4fc1ff;text-decoration:none" href="${esc(encodeURIComponent(n))}${d ? "/" : ""}">${esc(n)}${d ? "/" : ""}</a></li>`).join("");
    const body = `<ul style="padding:0">${decoded !== "/" ? '<li style="list-style:none;padding:.35em 0"><a style="color:#4fc1ff;text-decoration:none" href="../">../</a></li>' : ""}${li}</ul>`;
    return new Response((await page(200, "Index of " + decoded, body).text()) + `<script src="${LIVE}__cf_live.js"></script>`, { headers: { "Content-Type": MIME.html, ...NOCACHE } });
  }

  self.cfLive = {
    LIVE,
    /** is this request addressed to a live server? */
    isLive(url) { return url.pathname.startsWith(LIVE); },
    async handle(e) {
      const req = e.request, url = new URL(req.url);
      if (req.method !== "GET" && req.method !== "HEAD") return new Response("Only GET is supported by the live server", { status: 405, headers: NOCACHE });
      if (url.pathname === LIVE + "__cf_live.js") return js(CLIENT);
      const p = parseLive(url.pathname); if (!p) return page(404, "404 – Not found", "");
      try { return await serve(req, p.port, p.rel, url.search, false); } catch (err) { return page(500, "Live server error", `<pre>${esc(err && err.stack || err)}</pre>`); }
    },
    /** a page served by a live server asks for "/src/main.jsx" or "/logo.svg": answer from its project, or return null */
    async fromClient(e) {
      if (!e.clientId || (e.request.method !== "GET" && e.request.method !== "HEAD")) return null;
      let c; try { c = await self.clients.get(e.clientId); } catch (x) { return null; }
      if (!c) return null; const lp = parseLive(new URL(c.url).pathname); if (!lp) return null;
      const url = new URL(e.request.url);
      try { return await serve(e.request, lp.port, url.pathname, url.search, true); } catch (x) { return null; }
    },
  };
})();
