#!/usr/bin/env node
// CodeForge website server: zero dependencies (Node 18+).
//   * serves the built React site (website/dist): /, /download, /code, /privacy are client routes (index.html fallback), /app/ is the web editor
//   * /site-config.js is generated from environment variables, so you can change the Play Store link etc. without rebuilding
//   * /proxy/<host>/<path> is a small CORS proxy for Git over HTTPS (github.com, gitlab.com, bitbucket.org only) so that
//     the web editor can clone and push. It only forwards Git smart-HTTP requests and never stores anything.
//   * /healthz for load balancers.
// Static hosting works too (see DEPLOY.md); this server is only needed for the proxy and for env-driven configuration.
import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const env = process.env;
const PORT = +env.PORT || 8080;
const HOST = env.HOST || "0.0.0.0";
const ROOT = path.resolve(env.SITE_DIR || path.join(__dirname, "..", "dist"));
const PROXY_ON = env.PROXY_ENABLED !== "0";
const ALLOW = new Set(["github.com", "gitlab.com", "bitbucket.org", ...(env.PROXY_ALLOW || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)]);
const ALLOW_ORIGIN = env.PROXY_ORIGIN || "*"; // set to your site origin (https://example.com) to stop other sites using your proxy from a browser
const RATE = +env.PROXY_RATE || 240; // proxied requests per minute per IP
const GIT_PATH = /^\/(?:[^/]+\/)*(?:info\/refs|git-upload-pack|git-receive-pack|HEAD|objects\/[^?]*)$/;

const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".wasm": "application/wasm", ".zip": "application/zip", ".apk": "application/vnd.android.package-archive", ".txt": "text/plain; charset=utf-8", ".map": "application/json" };
const COMPRESS = /^(text\/|application\/(json|javascript|manifest\+json)|image\/svg)/;

const send = (res, code, body, headers = {}) => { res.writeHead(code, { "X-Content-Type-Options": "nosniff", ...headers }); res.end(body); };

// ---- /site-config.js: the file on disk plus environment overrides --------------------------------------------------
function siteConfig() {
  let base = "window.CF_SITE = window.CF_SITE || {};"; try { base = fs.readFileSync(path.join(ROOT, "site-config.js"), "utf8"); } catch {}
  const o = {};
  const map = { playStoreUrl: "PLAY_STORE_URL", apkUrl: "APK_URL", githubUrl: "GITHUB_URL", contactEmail: "CONTACT_EMAIL", version: "APP_VERSION" };
  for (const [k, e] of Object.entries(map)) if (env[e]) o[k] = env[e];
  if (PROXY_ON && env.PROXY_URL !== "") o.proxy = env.PROXY_URL || "/proxy";
  return base + "\nObject.assign(window.CF_SITE, " + JSON.stringify(o) + ");\n";
}

// ---- /api/info: what the download page needs, for scripts and monitoring
function info() {
  let apk = null; try { const j = JSON.parse(fs.readFileSync(path.join(ROOT, "downloads", "apk.json"), "utf8")); if (j.file) apk = { ...j, url: "/downloads/" + j.file }; } catch {}
  return { name: "CodeForge", version: env.APP_VERSION || "8.2.0", apk, playStoreUrl: env.PLAY_STORE_URL || null, proxy: PROXY_ON ? "/proxy" : null };
}

// ---- static files ---------------------------------------------------------------------------------------------------
const gzCache = new Map();
function serveStatic(req, res, pathname) {
  let rel; try { rel = decodeURIComponent(pathname); } catch { return send(res, 400, "Bad request"); }
  if (rel.includes("\0")) return send(res, 400, "Bad request");
  let file = path.normalize(path.join(ROOT, rel));
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) return send(res, 403, "Forbidden");
  let st; try { st = fs.statSync(file); } catch { st = null; }
  if (st && st.isDirectory() && !fs.existsSync(path.join(file, "index.html"))) st = null;   // a folder without index.html is not a page (e.g. /assets)
  if (st && st.isDirectory()) {
    if (!pathname.endsWith("/")) return send(res, 301, "", { Location: pathname + "/" + (req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "") });
    file = path.join(file, "index.html"); try { st = fs.statSync(file); } catch { st = null; }
  }
  if (!st || !st.isFile()) {
    // client-side routes (/download, /code, /privacy …) load the React app; anything with a file extension, or under /app/, is a real 404
    const isRoute = !path.extname(pathname) && !pathname.startsWith("/app/") && !pathname.startsWith("/downloads/") && !pathname.startsWith("/code-data/");
    let page = null; try { page = fs.readFileSync(path.join(ROOT, "index.html")); } catch {}
    const known = ["/download", "/download/", "/code", "/code/", "/privacy", "/privacy/"].includes(pathname);
    if (isRoute && page) return send(res, known ? 200 : 404, req.method === "HEAD" ? "" : page, { "Content-Type": TYPES[".html"], "Cache-Control": "no-cache" });
    return send(res, 404, req.method === "HEAD" ? "" : "Not found", { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" });
  }
  const ext = path.extname(file).toLowerCase(), type = TYPES[ext] || "application/octet-stream";
  const noCache = ext === ".html" || path.basename(file) === "sw.js" || path.basename(file) === "apk.json";
  const etag = `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
  const h = { "Content-Type": type, ETag: etag, "Cache-Control": noCache ? "no-cache" : "public, max-age=3600", Vary: "Accept-Encoding", "Last-Modified": st.mtime.toUTCString() };
  if (ext === ".apk") h["Content-Disposition"] = 'attachment; filename="CodeForge.apk"';
  if (req.headers["if-none-match"] === etag) return send(res, 304, "", h);
  const wantGz = COMPRESS.test(type) && /\bgzip\b/.test(req.headers["accept-encoding"] || "") && st.size > 800 && st.size < 8e6;
  if (req.method === "HEAD") return send(res, 200, "", { ...h, "Content-Length": st.size });
  if (wantGz) {
    let hit = gzCache.get(file);
    if (!hit || hit.etag !== etag) { hit = { etag, buf: zlib.gzipSync(fs.readFileSync(file), { level: 6 }) }; gzCache.set(file, hit); }
    return send(res, 200, hit.buf, { ...h, "Content-Encoding": "gzip", "Content-Length": hit.buf.length });
  }
  res.writeHead(200, { "X-Content-Type-Options": "nosniff", ...h, "Content-Length": st.size });
  fs.createReadStream(file).on("error", () => res.destroy()).pipe(res);
}

// ---- Git CORS proxy ---------------------------------------------------------------------------------------------------
const hits = new Map();
setInterval(() => hits.clear(), 60000).unref();
const cors = (req) => ({
  "Access-Control-Allow-Origin": ALLOW_ORIGIN,
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": req.headers["access-control-request-headers"] || "authorization, content-type, accept, git-protocol",
  "Access-Control-Expose-Headers": "content-type, git-protocol, www-authenticate, location",
  "Access-Control-Max-Age": "86400",
  Vary: "Origin",
});
const HOP = new Set(["connection", "keep-alive", "transfer-encoding", "te", "trailer", "upgrade", "proxy-authenticate", "proxy-authorization", "set-cookie", "set-cookie2"]);

function proxy(req, res, pathname, search) {
  if (req.method === "OPTIONS") return send(res, 204, "", cors(req));
  if (req.method !== "GET" && req.method !== "POST") return send(res, 405, "Method not allowed", cors(req));
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress;
  const n = (hits.get(ip) || 0) + 1; hits.set(ip, n);
  if (n > RATE) return send(res, 429, "Too many requests. Try again in a minute.", { ...cors(req), "Retry-After": "60" });
  const m = /^\/proxy\/([^/]+)(\/.*)$/.exec(pathname);
  if (!m) return send(res, 400, "Use /proxy/<host>/<path>", cors(req));
  const host = m[1].toLowerCase(), p = m[2];
  if (!ALLOW.has(host)) return send(res, 403, `Host not allowed. This proxy only forwards to: ${[...ALLOW].join(", ")}`, cors(req));
  if (p.includes("..") || !GIT_PATH.test(p)) return send(res, 403, "Only Git smart-HTTP requests are forwarded.", cors(req));
  const headers = {};
  for (const k of ["authorization", "content-type", "accept", "git-protocol", "content-length", "content-encoding", "accept-encoding"]) if (req.headers[k]) headers[k] = req.headers[k];
  headers["user-agent"] = "git/2.43.0 (CodeForge web)";
  const up = https.request({ host, port: 443, method: req.method, path: p + search, headers, timeout: 60000 }, (r) => {
    const out = { ...cors(req) };
    for (const [k, v] of Object.entries(r.headers)) if (!HOP.has(k)) out[k] = v;
    if (out.location) out.location = String(out.location).replace(/^https:\/\//, "/proxy/");
    res.writeHead(r.statusCode || 502, out);
    r.pipe(res);
  });
  up.on("timeout", () => up.destroy(new Error("timeout")));
  up.on("error", (e) => { if (!res.headersSent) send(res, 502, "Upstream error: " + e.message, cors(req)); else res.destroy(); });
  req.on("aborted", () => up.destroy());
  req.pipe(up);
}

// ---- router -----------------------------------------------------------------------------------------------------------
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x"), pathname = u.pathname;
  try {
    if (pathname === "/healthz") return send(res, 200, "ok", { "Content-Type": "text/plain" });
    if (pathname.startsWith("/proxy/") || pathname === "/proxy") return PROXY_ON ? proxy(req, res, pathname, u.search) : send(res, 404, "Proxy disabled");
    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Method not allowed", { Allow: "GET, HEAD" });
    if (pathname === "/api/info") return send(res, 200, JSON.stringify(info()), { "Content-Type": TYPES[".json"], "Cache-Control": "no-cache" });
    if (pathname === "/site-config.js") return send(res, 200, siteConfig(), { "Content-Type": TYPES[".js"], "Cache-Control": "no-cache" });
    if (pathname === "/app/" || pathname === "/app") res.setHeader("Service-Worker-Allowed", "/app/");
    return serveStatic(req, res, pathname);
  } catch (e) { console.error(e); if (!res.headersSent) send(res, 500, "Server error"); else res.destroy(); }
});
server.requestTimeout = 0; // long Git pushes
server.listen(PORT, HOST, () => {
  console.log(`CodeForge site  http://localhost:${PORT}/   (serving ${ROOT})`);
  console.log(PROXY_ON ? `Git proxy       /proxy/<host>/…  allowed: ${[...ALLOW].join(", ")}` : "Git proxy       disabled");
  if (!fs.existsSync(path.join(ROOT, "index.html"))) console.warn("! No index.html in " + ROOT + ". Run: npm run build");
});
process.on("SIGTERM", () => server.close(() => process.exit(0)));
