/**
 * CodeForge Enhanced — Live Server Integration
 * Enables integrated browser preview by proxying to live server
 */

"use strict";

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const url = require("url");

class LiveServerIntegration {
  constructor(workspacePath) {
    this.workspacePath = workspacePath;
    this.liveServerPort = 3000;
    this.liveServerHost = "127.0.0.1";
    this.routeCache = new Map();
  }

  /**
   * Route integrated browser requests to live server
   */
  handleIntegratedBrowserRequest(req, res, pathname) {
    // Check if this is a live server request
    if (pathname.startsWith("/__live__/") || pathname.includes("_live_")) {
      return this.proxyCachedRequest(req, res, pathname);
    }

    // Check if this is a workspace file request
    if (pathname.startsWith("/_workspace/")) {
      return this.serveWorkspaceFile(req, res, pathname);
    }

    // Route HTML files to live server
    if (pathname.endsWith(".html") || pathname === "/" || pathname === "") {
      return this.proxyToLiveServer(req, res, pathname);
    }

    // Route other files
    if (
      pathname.endsWith(".css") ||
      pathname.endsWith(".js") ||
      pathname.endsWith(".json") ||
      /\.(png|jpg|jpeg|gif|svg|webp|ico)$/.test(pathname)
    ) {
      return this.proxyToLiveServer(req, res, pathname);
    }

    return false; // Not handled
  }

  /**
   * Proxy request to live server
   */
  proxyToLiveServer(req, res, pathname) {
    const targetUrl = `http://${this.liveServerHost}:${this.liveServerPort}${pathname}`;
    const parsedUrl = new URL(targetUrl);

    return new Promise((resolve) => {
      const proxyReq = http.request(
        {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port,
          path: parsedUrl.pathname + parsedUrl.search,
          method: req.method,
          headers: {
            ...req.headers,
            host: parsedUrl.host,
          },
        },
        (proxyRes) => {
          // Add CORS headers
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader(
            "Access-Control-Allow-Methods",
            "GET, POST, PUT, DELETE, OPTIONS"
          );

          // Copy response headers
          Object.keys(proxyRes.headers).forEach((key) => {
            res.setHeader(key, proxyRes.headers[key]);
          });

          res.writeHead(proxyRes.statusCode);
          proxyRes.pipe(res);
          resolve(true);
        }
      );

      proxyReq.on("error", (err) => {
        console.error("Live server proxy error:", err.message);
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Live server not accessible" }));
        resolve(true);
      });

      if (req.method !== "GET" && req.method !== "HEAD") {
        req.pipe(proxyReq);
      } else {
        proxyReq.end();
      }
    });
  }

  /**
   * Proxy and cache requests
   */
  proxyCachedRequest(req, res, pathname) {
    // Check cache first
    if (this.routeCache.has(pathname)) {
      const cached = this.routeCache.get(pathname);
      res.writeHead(cached.status, cached.headers);
      res.end(cached.body);
      return true;
    }

    return this.proxyToLiveServer(req, res, pathname);
  }

  /**
   * Serve workspace files
   */
  serveWorkspaceFile(req, res, pathname) {
    // Extract file path from pathname
    const filePath = pathname.replace("/_workspace/", "");
    const fullPath = path.join(this.workspacePath, filePath);

    // Security: prevent path traversal
    if (!fullPath.startsWith(this.workspacePath)) {
      res.writeHead(403);
      res.end("Forbidden");
      return true;
    }

    // Serve file
    fs.stat(fullPath, (err, stat) => {
      if (err || !stat.isFile()) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const ext = path.extname(fullPath);
      const mimeType = this.getMimeType(ext);

      fs.readFile(fullPath, (err, data) => {
        if (err) {
          res.writeHead(500);
          res.end("Server error");
          return;
        }

        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Content-Type", mimeType);
        res.writeHead(200);
        res.end(data);
      });
    });

    return true;
  }

  /**
   * Get MIME type for file extension
   */
  getMimeType(ext) {
    const mimeTypes = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".svg": "image/svg+xml",
      ".webp": "image/webp",
      ".ico": "image/x-icon",
      ".txt": "text/plain; charset=utf-8",
    };
    return mimeTypes[ext] || "application/octet-stream";
  }

  /**
   * Set live server port (called when detected)
   */
  setLiveServerPort(port) {
    this.liveServerPort = port;
    console.log(`[LIVE SERVER] Detected on port ${port}`);
  }

  /**
   * Create HTML wrapper for iframe preview
   */
  createPreviewWrapper(fileUrl, fileName) {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${fileName} - CodeForge Preview</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      flex-direction: column;
    }
    .preview-header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 12px 20px;
      font-size: 13px;
      font-weight: 500;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      z-index: 1000;
    }
    .preview-url {
      font-family: 'Monaco', 'Courier New', monospace;
      font-size: 12px;
      opacity: 0.9;
    }
    .preview-status {
      background: rgba(255,255,255,0.2);
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 600;
    }
    iframe {
      flex: 1;
      border: none;
      width: 100%;
      background: white;
    }
  </style>
</head>
<body>
  <div class="preview-header">
    <span>🌐 Live Preview: <span class="preview-url">${fileUrl}</span></span>
    <div class="preview-status">● Connected</div>
  </div>
  <iframe src="${fileUrl}" title="Preview"></iframe>
</body>
</html>`;
  }

  /**
   * Create redirect endpoint for file
   */
  createFileRedirect(filePath, fileUrl) {
    return {
      path: `/preview-file/${encodeURIComponent(path.basename(filePath))}`,
      file: filePath,
      url: fileUrl,
      timestamp: Date.now(),
    };
  }

  /**
   * Detect live server port
   */
  async detectLiveServerPort(startPort = 3000) {
    for (let port = startPort; port < startPort + 100; port++) {
      try {
        const isOpen = await this.checkPortOpen(port);
        if (isOpen) {
          this.liveServerPort = port;
          console.log(`[LIVE SERVER] Found on port ${port}`);
          return port;
        }
      } catch (e) {
        // Port not open
      }
    }
    return null;
  }

  /**
   * Check if port is open
   */
  checkPortOpen(port) {
    return new Promise((resolve) => {
      const socket = http.createConnection(
        {
          host: this.liveServerHost,
          port: port,
          timeout: 1000,
        },
        () => {
          socket.destroy();
          resolve(true);
        }
      );

      socket.on("timeout", () => {
        socket.destroy();
        resolve(false);
      });

      socket.on("error", () => {
        socket.destroy();
        resolve(false);
      });
    });
  }
}

module.exports = { LiveServerIntegration };
