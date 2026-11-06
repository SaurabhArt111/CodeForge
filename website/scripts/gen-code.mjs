// Writes the data behind the code browser: <out>/code-data/tree.json, <out>/code-data/src/<files> and <out>/downloads/CodeForge-source.zip
// usage: node scripts/gen-code.mjs <repo-root> <site-out-dir>
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";

const root = path.resolve(process.argv[2] || ".."), out = path.resolve(process.argv[3] || "dist");
const SKIP_DIRS = new Set(["node_modules", "vendor", "build", ".gradle", ".git", "web-dist", "dist", "dist-site", ".idea", "shots", "fonts", "__pycache__", ".cxx", "downloads", "code-data"]);
const BIN = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".ttf", ".woff", ".woff2", ".otf", ".so", ".zip", ".apk", ".jar", ".keystore", ".jks", ".gz", ".tar", ".pdf", ".mp4", ".wasm", ".class", ".lock", ".cfbundle"]);
const MAX = 320_000;
const LANG = { ".kt": "Kotlin", ".kts": "Kotlin", ".java": "Kotlin", ".js": "JavaScript", ".mjs": "JavaScript", ".jsx": "JavaScript", ".css": "CSS", ".html": "HTML", ".sh": "Shell", ".py": "Python", ".json": "JSON", ".md": "Markdown", ".xml": "XML", ".yml": "YAML", ".cpp": "C++", ".c": "C++", ".h": "C++" };

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(full); continue; }
    if (!e.isFile()) continue;
    const rel = path.relative(root, full).split(path.sep).join("/"), ext = path.extname(e.name).toLowerCase();
    if (BIN.has(ext) || e.name === "local.properties" || e.name === "gradlew.bat" || rel.startsWith("docs/VSCODE") || fs.statSync(full).size > MAX) continue;
    let text; try { text = new TextDecoder("utf-8", { fatal: true }).decode(fs.readFileSync(full)); } catch { continue; }
    files.push({ rel, full, text });
  }
})(root);

const counts = {}, meta = [];
for (const f of files) {
  const lines = (f.text.match(/\n/g) || []).length + (f.text.endsWith("\n") || !f.text ? 0 : 1);
  meta.push({ path: f.rel, size: Buffer.byteLength(f.text), lines });
  if (!f.rel.startsWith("tools/e2e") && !f.rel.startsWith("website/")) {
    const l = LANG[path.extname(f.rel).toLowerCase()];
    if (l && !["JSON", "Markdown", "XML", "YAML"].includes(l)) counts[l] = (counts[l] || 0) + lines;
  }
}
const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
const langs = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([name, v]) => ({ name, share: v / total }));

const have = new Set(meta.map((m) => m.path));
const W = "app/src/main/assets/www/js/", K = "app/src/main/java/dev/codeforge/ide/";
const MODULES = [
  ["Native bridge", "One JSON-RPC channel between the web UI and Kotlin: files, terminals, network, secrets, archives, crash reports.", [K + "bridge/Bridge.kt", W + "core/bridge.js", K + "MainActivity.kt"]],
  ["Crash recorder", "Native and JS error capture, breadcrumbs, Android exit history, and the reports screen.", [K + "core/CrashRecorder.kt", W + "core/crash.js", W + "ui/crashes.js"]],
  ["Preview and live server", "Previews open in a separate process and retry loopback addresses; the live server guards what pages can send.", [K + "PreviewActivity.kt", K + "core/LiveServer.kt", W + "features/live.js"]],
  ["Terminal", "Native PTY sessions with flow control, the xterm.js front end, a quiet Linux launcher and the cf command.", [K + "core/TermSession.kt", W + "ui/terminal.js", "app/src/main/assets/env/start-linux.sh", "app/src/main/assets/env/cf.sh"]],
  ["Sheets and layout", "Top, bottom, right and page sheets that hold any view, docking, persistence, edge swipes and the tablet menu bar.", [W + "ui/panel.js", W + "ui/menubar.js", W + "main.js"]],
  ["Editor", "Monaco setup, tabs, split view, diff, autosave, minimap and formatting.", [W + "ui/editor.js", W + "features/format.js"]],
  ["Projects, ZIP and transfer", "The project list, ZIP export with exclusions, and .cfbundle transfer between web and app.", [W + "ui/projects.js", W + "ui/zipdialog.js", W + "ui/transfer.js", K + "core/ZipTools.kt"]],
  ["AI assistants", "Streaming chat, one-tap Apply with diff review, agent tools with approvals, provider settings.", [W + "features/ai.js"]],
  ["Text size and speed", "One text-size factor for the whole UI, device-class defaults, and lazy loading of heavy libraries.", [W + "core/fontscale.js", W + "core/settings.js", W + "core/lazy.js"]],
  ["Web version", "The same UI on a browser backend: IndexedDB files, fetch networking, a mini shell and an in-browser live server.", [W + "core/webhost.js", "tools/web/live-sw.js", "tools/web/build.sh", "tools/web/sw.js"]],
  ["Dev host and tests", "A Node server that emulates the native bridge, plus end-to-end tests run in headless Chromium.", ["tools/devhost/server.js", "tools/e2e/sheets.js", "tools/e2e/layout2.js", "tools/e2e/aiapply.js"]],
  ["This website", "React (Vite) pages, a dependency-free Node server with the Git proxy, and the build scripts.", ["website/server/index.js", "website/src/App.jsx", "website/scripts/build-site.mjs"]],
];
const modules = MODULES.map(([title, text, fs_]) => ({ title, text, files: fs_.filter((f) => have.has(f)) })).filter((m) => m.files.length);

fs.mkdirSync(path.join(out, "code-data", "src"), { recursive: true }); fs.mkdirSync(path.join(out, "downloads"), { recursive: true });
for (const f of files) { const dst = path.join(out, "code-data", "src", f.rel); fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.writeFileSync(dst, f.text); }
fs.writeFileSync(path.join(out, "code-data", "tree.json"), JSON.stringify({ files: meta, langs, modules }));

const zip = new JSZip(), names = new Set();
for (const f of files) { zip.file("CodeForge/" + f.rel, fs.readFileSync(f.full)); names.add("CodeForge/" + f.rel); }
// vendored libraries and images are not listed in the code browser but are needed to build: include them in the ZIP
for (const extra of ["app/src/main/assets/www/vendor", "app/src/main/assets/www/assets", "tools/web/vendor"]) {
  const base = path.join(root, extra); if (!fs.existsSync(base)) continue;
  (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const full = path.join(d, e.name); if (e.isDirectory()) walk(full); else if (e.isFile()) { const arc = "CodeForge/" + path.relative(root, full).split(path.sep).join("/"); if (!names.has(arc)) { zip.file(arc, fs.readFileSync(full)); names.add(arc); } } } })(base);
}
fs.writeFileSync(path.join(out, "downloads", "CodeForge-source.zip"), await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } }));
console.log(`code browser: ${meta.length} files, ${meta.reduce((a, m) => a + m.lines, 0)} lines`);
