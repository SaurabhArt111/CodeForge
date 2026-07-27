#!/usr/bin/env node
/**
 * CodeForge — tiny local static server.
 * No dependencies. Serves this folder on http://localhost:PORT
 * Needed because Monaco's editor workers require http(s), not file://.
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
    const filePath = path.normalize(path.join(ROOT, urlPath));
    if (!filePath.startsWith(ROOT)) { send(res, 403, { "Content-Type": "text/plain" }, "Forbidden"); return; }

    fs.stat(filePath, function (err, stat) {
      if (err || !stat.isFile()) { send(res, 404, { "Content-Type": "text/plain" }, "Not found: " + urlPath); return; }
      const ext = path.extname(filePath).toLowerCase();
      const type = MIME[ext] || "application/octet-stream";
      res.writeHead(200, {
        "Content-Type": type,
        "Content-Length": stat.size,
        "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=3600",
      });
      fs.createReadStream(filePath).pipe(res);
    });
  } catch (e) {
    send(res, 500, { "Content-Type": "text/plain" }, "Server error: " + e.message);
  }
});

server.listen(PORT, function () {
  console.log("");
  console.log("  CodeForge is running \u2014 nothing leaves this machine.");
  console.log("  Open: http://localhost:" + PORT);
  console.log("  Stop: Ctrl+C");
  console.log("");
});
