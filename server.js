#!/usr/bin/env node
/**
 * CodeForge — local dev server. Deploy the `public/` folder as-is (or `npm run build`'s
 * `dist/`) to Netlify, Vercel, GitHub Pages, Cloudflare Pages, or any static host — CodeForge's
 * editor, file explorer, and project management are a pure static frontend that never needs
 * this file, and this file is never part of a static deploy.
 *
 * Running it locally (`node server.js` / `npm run serve:simple`) adds one optional extra: a
 * real, local-only Terminal + workspace backend (see server/terminal-backend.js) so the
 * in-app Terminal panel can run actual git/node/npm/python/etc. instead of the simulated
 * fallback shell it uses on a static deploy. It never listens beyond localhost by default,
 * never accepts requests from other browser origins, and nothing it does ever leaves this
 * machine. If the optional `ws` dependency isn't installed, this degrades automatically back
 * to being a plain static file server, exactly as before.
 *
 * Usage:
 *   node server.js [port]
 *   PORT=5500 HOST=127.0.0.1 node server.js
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { createTerminalBackend } = require("./server/terminal-backend.js");
const { createEnhancedAPI } = require("./server/enhanced-api.js");
const { addCORSHeaders, handlePreflightRequest } = require("./server/cors-config.js");
const { BrowserPreviewHandler } = require("./server/browser-preview-handler.js");

const PORT = parseInt(process.argv[2], 10) || parseInt(process.env.PORT, 10) || 5500;
// Bind to localhost only by default — this process can spawn a real shell, so it shouldn't be
// reachable from other devices on the network unless explicitly opted into.
const HOST = process.env.HOST || "127.0.0.1";
const ROOT = __dirname;
const WORKSPACE = path.join(ROOT, ".codeforge-workspace");

const terminalBackend = createTerminalBackend({
  workspaceRoot: WORKSPACE,
  port: PORT,
});

// Initialize enhanced API (Git, Preview, etc.)
const enhancedAPI = createEnhancedAPI(WORKSPACE);

// Initialize browser preview handler
const browserPreview = new BrowserPreviewHandler();

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
    // Log request
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`);
    });

    // Add CORS headers to all responses
    const origin = req.headers.origin || "*";
    addCORSHeaders(res, origin);

    // Handle preflight requests
    if (handlePreflightRequest(req, res)) return;

    // Try enhanced API (Git, Preview) first
    if (enhancedAPI.handleRequest(req, res)) return;
    
    // Try browser preview handler
    if (browserPreview.handleWebContainerAPI(req.url, res)) return;
    if (browserPreview.serveVendorWithCORS(req.url, res)) return;
    
    // Then try terminal backend
    if (terminalBackend.handleRequest(req, res)) return;
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
        if (err2 || !stat2.isFile()) { 
          console.error(`[ERROR] 404: ${urlPath}`);
          send(res, 404, { "Content-Type": "text/plain" }, "Not found: " + urlPath); 
          return; 
        }
        serveFile(res, publicPath, stat2);
      });
    });
  } catch (e) {
    console.error("[ERROR]", e);
    send(res, 500, { "Content-Type": "text/plain" }, "Server error: " + e.message);
  }
});
function serveFile(res, filePath, stat) {
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || "application/octet-stream";
  
  // Set CORS and security headers
  const headers = {
    "Content-Type": type,
    "Content-Length": stat.size,
    "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=3600",
    "Cross-Origin-Embedder-Policy": "require-corp",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "cross-origin",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
    "X-XSS-Protection": "1; mode=block"
  };
  
  res.writeHead(200, headers);
  fs.createReadStream(filePath).pipe(res);
}

server.on("upgrade", function (req, socket, head) {
  if (!terminalBackend.handleUpgrade(req, socket, head)) socket.destroy();
});

server.listen(PORT, HOST, function () {
  console.log("");
  console.log("  ╔══════════════════════════════════════════════════════╗");
  console.log("  ║  CodeForge Enhanced — Development IDE               ║");
  console.log("  ║  🚀 Nothing leaves this machine                     ║");
  console.log("  ╚══════════════════════════════════════════════════════╝");
  console.log("");
  console.log("  📂 Open: http://localhost:" + PORT);
  console.log("");
  console.log("  ✨ Features:");
  console.log("     • Code Editor with split view");
  console.log("     • File Explorer & Search");
  if (!terminalBackend.enabled) {
    console.log("     • Terminal: simulated (run npm install for real shell)");
  } else if (terminalBackend.hasPty) {
    console.log("     • Terminal: Full PTY shell (git, npm, node, python, etc)");
  } else {
    console.log("     • Terminal: Shell support without PTY (git, npm, node work fine)");
  }
  console.log("     • Git Integration (status, log, branches)");
  console.log("     • Preview Servers (Node.js/Express & Static)");
  console.log("     • npm/yarn package management");
  console.log("");
  console.log("  🛑 Stop: Ctrl+C");
  console.log("");
});

// Graceful shutdown handler
const gracefulShutdown = () => {
  console.log("\n[SHUTDOWN] Received shutdown signal, closing gracefully...");
  
  const shutdownTimeout = setTimeout(() => {
    console.error("[SHUTDOWN] Forced exit after timeout");
    process.exit(1);
  }, 10000); // 10 second timeout
  
  server.close(() => {
    clearTimeout(shutdownTimeout);
    try {
      terminalBackend.closeAll();
    } catch (e) {
      console.error("[SHUTDOWN] Error closing terminal backend:", e.message);
    }
    try {
      enhancedAPI.cleanup();
    } catch (e) {
      console.error("[SHUTDOWN] Error cleaning up enhanced API:", e.message);
    }
    try {
      browserPreview.clearPreviews();
    } catch (e) {
      console.error("[SHUTDOWN] Error cleaning up browser preview:", e.message);
    }
    console.log("[SHUTDOWN] Server closed successfully");
    process.exit(0);
  });
  
  // Force close after timeout
  setTimeout(() => {
    console.error("[SHUTDOWN] Force closing server");
    process.exit(1);
  }, 11000);
};

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("[UNCAUGHT EXCEPTION]", error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  console.error("[UNHANDLED REJECTION]", reason);
  // Don't exit - could be application-level error
});
