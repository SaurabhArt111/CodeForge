import { defineConfig } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Wires CodeForge's optional local Terminal + workspace backend (server/terminal-backend.js)
// into Vite's own dev/preview HTTP server, so `npm run dev` — the primary documented local
// workflow — gets a real terminal too, not just `node server.js`. Both entry points share the
// exact same backend module; see server/terminal-backend.js for what it does and why it's safe
// to run locally. A plain `vite build` (static output, e.g. for Vercel) never touches this.
function codeforgeTerminalPlugin() {
  let backend = null;
  function ensureBackend(approxPort) {
    if (!backend) {
      const { createTerminalBackend } = require("./server/terminal-backend.js");
      backend = createTerminalBackend({
        workspaceRoot: path.join(__dirname, ".codeforge-workspace"),
        port: approxPort,
      });
    }
    return backend;
  }
  function attach(server, approxPort) {
    const be = ensureBackend(approxPort);
    server.middlewares.use(function (req, res, next) {
      if (be.handleRequest(req, res)) return;
      next();
    });
    if (server.httpServer) {
      server.httpServer.on("upgrade", function (req, socket, head) {
        // Only handles (and only ever returns true for) our own /api/terminal/... path — a
        // no-op for anything else, so Vite's own HMR WebSocket upgrade keeps working normally.
        be.handleUpgrade(req, socket, head);
      });
    }
  }
  return {
    name: "codeforge-terminal-backend",
    configureServer(server) { attach(server, (server.config.server && server.config.server.port) || 5173); },
    configurePreviewServer(server) { attach(server, (server.config.preview && server.config.preview.port) || 4173); },
  };
}

// CodeForge's own code (public/app.js, style.css, sw.js, vendor/) is deliberately plain,
// self-hosted, and loaded via classic <script>/<link> tags rather than ES module imports —
// Monaco's AMD loader and the service worker both depend on stable, unhashed, unbundled file
// paths. So Vite is used here purely as a dev server + static-copy build tool, not a bundler
// for app code: everything real lives in public/, which Vite serves as-is in dev and copies
// as-is into dist/ on build. index.html itself has no <script type="module"> or Vite asset
// imports, so Vite's HTML processing leaves its tags alone too.
export default defineConfig({
  // Relative base so the built output works when deployed under any subpath (GitHub Pages
  // project sites, a subfolder on any static host, etc.), matching public/ asset references.
  base: "./",
  publicDir: "public",
  plugins: [codeforgeTerminalPlugin()],
  build: {
    outDir: "dist",
    assetsDir: "assets",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
  },
  preview: {
    port: 4173,
  },
});
