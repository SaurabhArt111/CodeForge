import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// SITE_BASE: "/" for a domain root, "/CodeForge/" for GitHub project pages.
export default defineConfig({
  base: process.env.SITE_BASE || "/",
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true, sourcemap: false, target: "es2020" },
  server: { port: 5180, proxy: { "/proxy": "http://localhost:8080", "/site-config.js": "http://localhost:8080" } },
});
