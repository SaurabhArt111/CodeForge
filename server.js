#!/usr/bin/env node
/**
 * CodeForge — tiny LOCAL-DEVELOPMENT-ONLY static server. This is NOT a backend for the app.
 * CodeForge is a pure static frontend (HTML/CSS/JS) — deploy the folder as-is to Netlify,
 * Vercel, GitHub Pages, Cloudflare Pages, or any static host, and this file is never used.
 *
 * It exists purely so you can preview local changes before deploying: Monaco's editor workers
 * and the service worker both require a real http(s) origin, which file:// can't provide.
 * No dependencies. Serves this folder on http://localhost:PORT
 *
 * Usage:
 *   node server.js [port]
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = parseInt(process.argv[2], 10) || 5500;
const ROOT = __dirname;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

function send(res, status, headers, body) {
  res.writeHead(status, headers);
  res.end(body);
}

const server = http.createServer(function (req, res) {
  try {
    let urlPath = decodeURIComponent(req.url.split("?")[0]);
    if (urlPath === "/") urlPath = "/index.html";
    // Try the project root first (e.g. index.html), then fall back to public/ (where the
    // Vite-style layout keeps app.js, style.css, sw.js, vendor/, etc.) — this way `node
    // server.js` keeps working with zero installs regardless of which layout is present.
    const rootPath = path.normalize(path.join(ROOT, urlPath));
    const publicPath = path.normalize(path.join(ROOT, "public", urlPath));
    if (!rootPath.startsWith(ROOT) || !publicPath.startsWith(path.join(ROOT, "public"))) {
      send(res, 403, { "Content-Type": "text/plain" }, "Forbidden"); return;
    }

    fs.stat(rootPath, function (err, stat) {
      if (!err && stat.isFile()) { serveFile(res, rootPath, stat); return; }
      fs.stat(publicPath, function (err2, stat2) {
        if (err2 || !stat2.isFile()) { send(res, 404, { "Content-Type": "text/plain" }, "Not found: " + urlPath); return; }
        serveFile(res, publicPath, stat2);
      });
    });
  } catch (e) {
    send(res, 500, { "Content-Type": "text/plain" }, "Server error: " + e.message);
  }
});
function serveFile(res, filePath, stat) {
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || "application/octet-stream";
  res.writeHead(200, {
    "Content-Type": type,
    "Content-Length": stat.size,
    "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=3600",
  });
  fs.createReadStream(filePath).pipe(res);
}

server.listen(PORT, function () {
  console.log("");
  console.log("  CodeForge is running \u2014 nothing leaves this machine.");
  console.log("  Open: http://localhost:" + PORT);
  console.log("  Stop: Ctrl+C");
  console.log("");
});
