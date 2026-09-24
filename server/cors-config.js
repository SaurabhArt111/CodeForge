/**
 * CodeForge Enhanced — CORS & Browser Preview Configuration
 * Fixes issues with integrated browser preview and web containers
 */

"use strict";

/**
 * Configure CORS headers for all responses
 */
function addCORSHeaders(res, origin) {
  // Set CORS headers to allow browser preview
  res.setHeader("Access-Control-Allow-Origin", origin || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, HEAD");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Max-Age", "86400");
  
  // Allow modern browser features
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
}

/**
 * Configure headers for web containers and iframes
 */
function addWebContainerHeaders(res) {
  // Support web containers and embedded editors
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  
  // Allow storage partitioning for service workers
  res.setHeader("Permissions-Policy", "cross-origin-isolated=()");
  
  // Security headers that don't break features
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "ALLOWALL");
  res.setHeader("X-XSS-Protection", "1; mode=block");
}

/**
 * Handle OPTIONS pre-flight requests
 */
function handlePreflightRequest(req, res) {
  const origin = req.headers.origin || "*";
  addCORSHeaders(res, origin);
  res.writeHead(204);
  res.end();
  return true;
}

/**
 * Add CORS headers to response wrapper
 */
function withCORS(originalSend) {
  return function (res, status, headers, body) {
    const allHeaders = Object.assign({}, headers || {});
    
    // Merge CORS headers
    allHeaders["Access-Control-Allow-Origin"] = "*";
    allHeaders["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS";
    allHeaders["Access-Control-Allow-Headers"] = "Content-Type";
    
    return originalSend(res, status, allHeaders, body);
  };
}

/**
 * Configure server for browser preview
 */
function configureBrowserPreview(server) {
  const originalOn = server.on.bind(server);
  
  server.on = function (event, callback) {
    if (event === "request") {
      originalOn(event, function (req, res) {
        // Add CORS headers to all responses
        const origin = req.headers.origin || "*";
        addCORSHeaders(res, origin);
        addWebContainerHeaders(res);
        
        // Handle OPTIONS pre-flight requests
        if (req.method === "OPTIONS") {
          res.writeHead(200);
          res.end();
          return;
        }
        
        callback(req, res);
      });
    } else {
      originalOn(event, callback);
    }
  };
  
  return server;
}

/**
 * Create proxy endpoints for browser preview
 */
function createBrowserPreviewProxies(req, res, pathname) {
  // Serve vendor files with proper CORS headers
  if (pathname.startsWith("/vendor/")) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    return false; // Let normal file serving handle it
  }
  
  // Proxy vite client connection
  if (pathname === "/@vite/client") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "application/javascript");
    res.writeHead(200);
    res.end(`// Vite client stub
if (typeof window !== 'undefined') {
  window.__vite_is_modern_browser = true;
  window.HMRClient = class {};
}`);
    return true;
  }
  
  // Proxy terminal health check
  if (pathname === "/api/terminal/health") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "application/json");
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true, status: "connected" }));
    return true;
  }
  
  // Proxy workspace endpoint
  if (pathname.includes("workspace.html") || pathname.includes("webcontainer")) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    return false;
  }
  
  return false; // Not handled by this proxy
}

/**
 * Fix iframe communication issues
 */
function fixIframeCommunication(html) {
  return html.replace(
    /<\/head>/,
    `<script>
// Fix iframe communication for browser preview
if (window.location.protocol === 'blob:' || window.location.origin.includes('blob')) {
  // Running in blob context (web container)
  window.__CODEFORGE_IN_PREVIEW__ = true;
}

// Setup message bridge for preview
window.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'TERMINAL_OUTPUT') {
    console.log('[TERMINAL]', event.data.message);
  }
});
</script>
    </head>`
  );
}

/**
 * Create safe iframe wrapper for previews
 */
function createPreviewWrapper(url, title = "Preview") {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - CodeForge</title>
  <style>
    * { margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    html, body, iframe { width: 100%; height: 100%; display: block; }
    iframe {
      border: none;
      background: white;
    }
    .preview-header {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: 40px;
      background: #f3f3f3;
      border-bottom: 1px solid #ddd;
      display: flex;
      align-items: center;
      padding: 0 10px;
      font-size: 13px;
      z-index: 1000;
      box-sizing: border-box;
    }
    .preview-header a {
      color: #0066cc;
      text-decoration: none;
      cursor: pointer;
    }
    .preview-header a:hover {
      text-decoration: underline;
    }
    iframe {
      margin-top: 40px;
      height: calc(100% - 40px);
    }
  </style>
</head>
<body>
  <div class="preview-header">
    <span>Preview: <a href="${url}" target="_blank">${url}</a></span>
  </div>
  <iframe src="${url}" title="Preview"></iframe>
</body>
</html>`;
}

module.exports = {
  addCORSHeaders,
  addWebContainerHeaders,
  handlePreflightRequest,
  withCORS,
  configureBrowserPreview,
  createBrowserPreviewProxies,
  fixIframeCommunication,
  createPreviewWrapper,
};
