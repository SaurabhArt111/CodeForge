// Builds the complete CodeForge website into website/dist (or the folder you pass):
//   /              React site (Vite)       -> src/
//   /app/          the web editor          -> ../tools/web/build.sh
//   /code-data/    data for the code page  -> scripts/gen-code.mjs
//   /downloads/    CodeForge.apk (if one is available), apk.json, CodeForge-source.zip
// APK: pass APK=/path/to/app-release.apk, drop one in website/downloads/, or build with Gradle first (app/build/outputs/apk/...).
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url)), site = path.join(here, ".."), repo = path.join(site, "..");
const out = path.resolve(process.argv[2] || path.join(site, "dist"));
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: "inherit", cwd: site, ...opts });

// 1. React site (the Vite output folder is emptied first, so it must go before everything else)
run(process.execPath, [path.join(site, "node_modules/vite/bin/vite.js"), "build", "--outDir", out, "--emptyOutDir"]);
fs.copyFileSync(path.join(out, "index.html"), path.join(out, "404.html"));   // static hosts (GitHub Pages…): unknown paths load the app, which renders the router's not-found page

// 2. web editor under /app/
run("sh", [path.join(repo, "tools/web/build.sh"), path.join(out, "app")], { stdio: ["ignore", "ignore", "inherit"] });
const appHtml = path.join(out, "app", "index.html");
let html = fs.readFileSync(appHtml, "utf8");
// lets site-config.js (or the Node server's env-driven /site-config.js) hand the Git CORS proxy to the editor on first run
const tag = '<script src="../site-config.js"></script>\n<script>try{var c=window.CF_SITE&&CF_SITE.proxy;if(c&&!localStorage.getItem("cf.corsProxy"))localStorage.setItem("cf.corsProxy",new URL(c,location.href).href)}catch(e){}</script>\n';
if (!html.includes("<head>")) throw new Error("web editor index.html has no <head>");
fs.writeFileSync(appHtml, html.replace("<head>", "<head>\n" + tag));

// 3. code browser data + source zip
run(process.execPath, [path.join(here, "gen-code.mjs"), repo, out]);

// 4. APK
fs.mkdirSync(path.join(out, "downloads"), { recursive: true });
let apk = process.env.APK;
if (!apk) {
  const dirs = [path.join(site, "downloads"), path.join(repo, "app/build/outputs/apk/release"), path.join(repo, "app/build/outputs/apk/debug")];
  for (const d of dirs) { if (!fs.existsSync(d)) continue; const f = fs.readdirSync(d).find((n) => n.endsWith(".apk")); if (f) { apk = path.join(d, f); break; } }
}
if (apk && fs.existsSync(apk)) {
  const dest = path.join(out, "downloads", "CodeForge.apk"); fs.copyFileSync(apk, dest);
  const buf = fs.readFileSync(dest);
  fs.writeFileSync(path.join(out, "downloads", "apk.json"), JSON.stringify({ file: "CodeForge.apk", size: buf.length, sha256: crypto.createHash("sha256").update(buf).digest("hex") }));
  console.log(`APK included: ${(buf.length / 1048576).toFixed(1)} MB`);
} else {
  fs.writeFileSync(path.join(out, "downloads", "apk.json"), "{}");
  console.log("No APK found: the download page says it has not been uploaded yet (set APK=/path/to.apk, or put one in website/downloads/).");
}
console.log(`Site built in ${out}. Preview: npm start`);
