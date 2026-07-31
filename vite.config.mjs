import { defineConfig } from "vite";

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
