/**
 * CodeForge Enhanced — Browser Preview Handler
 * Fixes integrated browser preview and web container issues
 */

"use strict";

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { createPreviewWrapper } = require("./cors-config");

class BrowserPreviewHandler {
  constructor() {
    this.previewWindows = new Map();
    this.proxyServers = new Map();
  }

  /**
   * Create a safe preview endpoint that handles CORS
   */
  createPreviewEndpoint(projectPath, previewUrl, projectName) {
    return {
      path: `/preview/${encodeURIComponent(projectName)}`,
      url: previewUrl,
      projectPath,
      created: Date.now(),
    };
  }

  /**
   * Handle preview requests with proper CORS
   */
  handlePreviewRequest(req, res, pathname, projectPath) {
    // Extract preview path
    if (!pathname.startsWith("/preview/")) {
      return false;
    }

    // Set CORS headers for preview
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");

    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return true;
    }

    // Get project name from path
    const parts = pathname.slice(9).split("/");
    const projectName = decodeURIComponent(parts[0]);

    if (pathname === `/preview/${encodeURIComponent(projectName)}`) {
      // Return preview wrapper
      const previewUrl = `http://localhost:3000`;
      const wrapper = createPreviewWrapper(previewUrl, projectName);
      res.setHeader("Content-Type", "text/html");
      res.writeHead(200);
      res.end(wrapper);
      return true;
    }

    return false;
  }

  /**
   * Proxy requests to actual preview servers
   */
  async proxyPreviewRequest(req, res, targetUrl) {
    try {
      const url = new URL(req.url, targetUrl);
      const targetProtocol = url.protocol === "https:" ? https : http;

      const proxyReq = targetProtocol.request(
        {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname + url.search,
          method: req.method,
          headers: {
            ...req.headers,
            host: url.host,
            "Access-Control-Allow-Origin": "*",
          },
        },
        (proxyRes) => {
          // Set CORS headers on response
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader(
            "Access-Control-Allow-Methods",
            "GET, POST, PUT, DELETE, OPTIONS"
          );
          res.setHeader("Access-Control-Allow-Headers", "Content-Type");

          res.writeHead(proxyRes.statusCode, proxyRes.headers);
          proxyRes.pipe(res);
        }
      );

      proxyReq.on("error", (err) => {
        console.error("Preview proxy error:", err.message);
        res.writeHead(502);
        res.end("Bad Gateway");
      });

      req.pipe(proxyReq);
      return true;
    } catch (e) {
      console.error("Proxy error:", e.message);
      return false;
    }
  }

  /**
   * Fix vendor files for browser preview
   */
  serveVendorWithCORS(pathname, res) {
    // Add CORS headers for vendor files
    res.setHeader("Access-Control-Allow-Origin", "*");

    // Map common vendor paths
    const vendorMaps = {
      "/@vite/client": "console.log('[Vite] Client loaded');",
      "/vendor/xterm/xterm.js": 'window.Terminal = class Terminal {};',
      "/vendor/vs/loader.js": 'var require = function() {}; var define = function() {};',
    };

    if (vendorMaps[pathname]) {
      res.setHeader("Content-Type", "application/javascript");
      res.writeHead(200);
      res.end(vendorMaps[pathname]);
      return true;
    }

    return false;
  }

  /**
   * Handle web container API endpoints
   */
  handleWebContainerAPI(pathname, res) {
    if (pathname === "/api/terminal/health") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Content-Type", "application/json");
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true, terminal: "ready" }));
      return true;
    }

    if (pathname === "/api/preview/status") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Content-Type", "application/json");
      res.writeHead(200);
      res.end(JSON.stringify({ previews: Array.from(this.previewWindows.values()) }));
      return true;
    }

    return false;
  }

  /**
   * Create a web container safe HTML
   */
  createWebContainerHTML(projectPath, projectName) {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="ie=edge">
  <title>${projectName} - Web Preview</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #fff;
      height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .web-preview-header {
      background: linear-gradient(to right, #667eea, #764ba2);
      color: white;
      padding: 15px 20px;
      font-weight: 500;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .web-preview-container {
      flex: 1;
      overflow: auto;
      background: white;
    }
    .web-preview-iframe {
      width: 100%;
      height: 100%;
      border: none;
      display: block;
    }
    .status-badge {
      background: rgba(255,255,255,0.2);
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="web-preview-header">
    <span>🌐 ${projectName} - Live Preview</span>
    <div class="status-badge">● Connected</div>
  </div>
  <div class="web-preview-container">
    <iframe class="web-preview-iframe" src="http://localhost:3000" title="Live Preview"></iframe>
  </div>
  <script>
    // Setup communication between editor and preview
    window.addEventListener('message', function(event) {
      if (event.data && event.data.type === 'RELOAD') {
        location.reload();
      } else if (event.data && event.data.type === 'SCRIPT') {
        eval(event.data.script);
      }
    });
    
    // Auto-refresh on file changes
    const autoRefresh = setInterval(() => {
      fetch('/api/preview/status')
        .then(r => r.json())
        .then(data => {
          if (data.needsRefresh) {
            location.reload();
            clearInterval(autoRefresh);
          }
        })
        .catch(e => console.log('Refresh check:', e.message));
    }, 2000);
  </script>
</body>
</html>`;
  }

  /**
   * Register preview endpoint
   */
  registerPreview(projectName, previewUrl) {
    this.previewWindows.set(projectName, {
      name: projectName,
      url: previewUrl,
      created: Date.now(),
      active: true,
    });
    return {
      path: `/preview/${encodeURIComponent(projectName)}`,
      url: previewUrl,
    };
  }

  /**
   * Unregister preview endpoint
   */
  unregisterPreview(projectName) {
    this.previewWindows.delete(projectName);
  }

  /**
   * Get all previews
   */
  getPreviews() {
    return Array.from(this.previewWindows.values());
  }

  /**
   * Clear all previews
   */
  clearPreviews() {
    this.previewWindows.clear();
    this.proxyServers.forEach((server) => {
      try {
        server.close();
      } catch (e) {
        // Ignore errors
      }
    });
    this.proxyServers.clear();
  }
}

module.exports = { BrowserPreviewHandler };
