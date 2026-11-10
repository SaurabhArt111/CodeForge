// Run & Preview sidebar view, run-file, npm scripts, tasks (.vscode/tasks.json), project detection.
import { h, icon, P, shellQuote } from "../core/util.js";
let A;
export async function init(api) {
  A = api;
  A.registerView("run", build);
  A.ws.on("root", () => rebuildSoon());
  A.bus.on("live:changed", () => rebuildSoon());
  A.bus.on("ports:changed", () => rebuildSoon());
  A.bus.on("saved", (p) => { if (/package\.json$/.test(p)) rebuildSoon(); });
}

// ---------------------------------------------------------------- run commands per language
const RUNNERS = {
  js: (f) => `node ${f}`, mjs: (f) => `node ${f}`, cjs: (f) => `node ${f}`, ts: (f) => `npx --yes tsx ${f}`,
  py: (f) => `python3 ${f}`, sh: (f) => `sh ${f}`, bash: (f) => `bash ${f}`, rb: (f) => `ruby ${f}`, php: (f) => `php ${f}`, go: (f) => `go run ${f}`, pl: (f) => `perl ${f}`, lua: (f) => `lua ${f}`,
  java: (f) => `java ${f}`, c: (f) => `gcc ${f} -o /tmp/a.out && /tmp/a.out`, cpp: (f) => `g++ ${f} -o /tmp/a.out && /tmp/a.out`, rs: (f) => `rustc ${f} -o /tmp/a.out && /tmp/a.out`,
};
const NEEDS_LINUX = new Set(["js", "mjs", "cjs", "ts", "py", "rb", "php", "go", "java", "c", "cpp", "rs", "pl", "lua"]);

async function ensureLinuxFor(what) {
  const s = await A.N.env.status();
  if (s.installed) return "linux";
  const yes = await A.confirm(`Running ${what} needs the Linux environment (node, python, git…). Set it up now?`, { title: "Linux environment required", okLabel: "Set up" });
  if (yes) (await A.feat("env")).wizard();
  return null;
}

/** package.json "dev"/"start" script of a framework project (vite, next, react-scripts…), or null for plain HTML projects */
const FRAMEWORKS = /^(vite|react-scripts|next|nuxt|astro|@sveltejs\/kit|@angular\/cli|parcel|webpack-dev-server|@vue\/cli-service|snowpack|gatsby|@remix-run\/dev|solid-start|@rsbuild\/core|rspack)$/;
async function devScript() {
  const pkg = await readPkg(); if (!pkg) return null;
  if (!Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).some((d) => FRAMEWORKS.test(d))) return null;
  return ["dev", "start", "serve"].find((k) => pkg.scripts?.[k]) || null;
}
/** Start the project's dev server and open it as soon as it prints an address. In the web version the in-browser server does the same job. */
export async function runDevServer({ host } = {}) {
  const live = await A.feat("live");
  if (A.N.mode() === "web") return live.serve(A.ws.root);
  const sc = await devScript(); if (!sc) return live.serve(A.ws.root);
  live.autoOpenNext(); return runScript(sc, { host: host ?? !!A.settings.get("run.exposeHost") });
}

export async function runFile(file) {
  const ext = P.ext(file);
  if (/^(html?|svg)$/.test(ext)) {
    // an index.html at the root of a Vite / React / Next… project cannot work as a static file: run the project's dev server instead
    if (/^html?$/.test(ext) && A.N.mode() !== "web" && A.ws.isOpen && P.dir(file) === A.ws.root && (await devScript())) return runDevServer();
    return (await A.feat("live")).previewFile(file);
  }
  if (/^(md|markdown)$/.test(ext)) return (await A.feat("markdown")).preview(file);
  const mk = RUNNERS[ext];
  if (!mk) return A.toast(`Don't know how to run .${ext} files`, { kind: "warn" });
  if (A.ed.getDoc(file)?.dirty) await A.ed.save(file);
  let mode = "auto";
  if (NEEDS_LINUX.has(ext)) { mode = await ensureLinuxFor("." + ext + " files"); if (!mode) return; }
  const rel = A.ws.isOpen && P.inside(A.ws.root, file) ? P.rel(A.ws.root, file) : file;
  const cwd = A.ws.isOpen && P.inside(A.ws.root, file) ? A.ws.root : P.dir(file);
  await A.term.run(mk(shellQuote(rel)), { cwd, title: "run: " + P.base(file), mode, reuse: false });
}

async function readPkg() {
  if (!A.ws.isOpen) return null;
  const p = P.join(A.ws.root, "package.json");
  if (!(await A.N.fs.exists(p))) return null;
  try { const r = await A.N.fs.readText(p); return JSON.parse(r.text); } catch { return null; }
}
async function pkgManager() {
  for (const [f, pm] of [["pnpm-lock.yaml", "pnpm"], ["yarn.lock", "yarn"], ["bun.lockb", "bun"]]) if (await A.N.fs.exists(P.join(A.ws.root, f))) return pm;
  return "npm";
}
export async function runScript(name, { host = false } = {}) {
  if (A.N.mode() === "web") return (await A.feat("live")).serve(A.ws.root);   // no Node in a browser: the in-browser dev server previews the project
  const mode = await ensureLinuxFor("npm scripts"); if (!mode) return;
  const pm = await pkgManager(); const hasMods = await A.N.fs.exists(P.join(A.ws.root, "node_modules"));
  const line = (hasMods ? "" : `${pm} install && `) + (pm === "npm" ? `npm run ${name}` : `${pm} ${name}`) + (host ? (pm === "npm" ? " -- --host" : " --host") : "");   // --host: other devices on your Wi-Fi can open the Network address
  await A.term.run(line, { cwd: A.ws.root, title: `${pm}: ${name}`, mode, reuse: false });
}
export async function npmScripts() {
  const pkg = await readPkg(); if (!pkg?.scripts) return A.toast("No package.json scripts in this project");
  const r = await A.quickPick(Object.entries(pkg.scripts).map(([k, v]) => ({ label: k, description: v, value: k })), { placeholder: "Run npm script" });
  if (r) runScript(r);
}
export async function installDeps() { if (A.N.mode() === "web") return A.toast("Nothing to install in the browser: npm packages load from esm.sh when the page runs"); const mode = await ensureLinuxFor("npm install"); if (!mode) return; const pm = await pkgManager(); await A.term.run(`${pm} install`, { cwd: A.ws.root, title: `${pm} install`, mode, reuse: false }); }

async function readTasks() {
  if (!A.ws.isOpen) return [];
  const p = P.join(A.ws.root, ".vscode/tasks.json"); if (!(await A.N.fs.exists(p))) return [];
  try { const { parseJsonc } = await import("../core/util.js"); const j = parseJsonc((await A.N.fs.readText(p)).text); return j.tasks || []; } catch { return []; }
}
export async function tasks() {
  const t = await readTasks(); if (!t.length) return A.toast("No .vscode/tasks.json tasks found");
  const r = await A.quickPick(t.map((x) => ({ label: x.label, description: [x.command, ...(x.args || [])].join(" "), value: x })), { placeholder: "Run task" });
  if (r) { const mode = await ensureLinuxFor("tasks"); if (mode) await A.term.run([r.command, ...(r.args || [])].join(" "), { cwd: A.ws.root, title: r.label, mode, reuse: false }); }
}

// ---------------------------------------------------------------- sidebar view
let view, bodyEl, timer;
const rebuildSoon = () => { clearTimeout(timer); timer = setTimeout(() => view && fill(), 150); };
function build(el) {
  view = el;
  el.append(h("div.view-head", h("span.title", "Run & Preview"), h("button.icon-btn", { title: "Refresh", onclick: () => fill() }, icon("refresh"))));
  bodyEl = h("div.view-body"); el.append(bodyEl); fill();
}
async function fill() {
  const [pkg, live, linux] = [await readPkg(), (await import("./live.js")).list(), await A.N.env.status().catch(() => ({}))];
  const ports = (await import("./live.js")).ports();
  const S = (title, ...kids) => h("div", h("div.section-title", title), ...kids);
  const kids = [];
  // live server
  const portIn = h("input", { type: "number", value: A.settings.get("live.port"), style: { width: "90px" }, onchange: (e) => A.settings.set("live.port", +e.target.value) });
  const sw = (key, label) => { const s = h("div.switch" + (A.settings.get(key) ? ".on" : ""), { onclick: () => { A.settings.set(key, !A.settings.get(key)); s.classList.toggle("on"); } }); return h("div.set-row.tight", h("span", label), s); };
  kids.push(S("Live Server",
    h("div.run-box", h("div", { style: { display: "flex", gap: "8px", alignItems: "center" } }, h("span.muted", "Port"), portIn, h("div", { style: { flex: 1 } }),
      h("button.btn.primary.small", { onclick: async () => { const l = await A.feat("live"); await l.serve(A.ws.root); fill(); } }, icon("broadcast"), " Go Live")),
      sw("live.spa", "SPA fallback (serve index.html)"), sw("live.lan", "Share on local network"),
      ...live.map((s) => h("div.row", { style: { paddingLeft: 0 } }, icon("broadcast"), h("span.label", `:${s.port}  ${P.base(s.root)}`), h("span.meta", `${s.clients || 0} client(s)`),
        h("button.icon-btn", { title: "Preview", onclick: async () => (await A.feat("live")).openPreview(s.url) }, icon("preview")), h("button.icon-btn", { title: "Open in browser", onclick: () => A.N.sys.openUrl(s.url) }, icon("link-external")),
        h("button.icon-btn", { title: "Stop", onclick: async () => { await A.N.live.stop(s.port); (await import("./live.js")).refresh(); } }, icon("debug-stop")))))));
  if (ports.length) kids.push(S("Detected servers (from terminal)", ...ports.map((p) => h("div.row", { style: { paddingLeft: "14px" }, onclick: async () => (await A.feat("live")).openPreview(`http://127.0.0.1:${p}/`) }, icon("globe"), h("span.label", `localhost:${p}`), h("span.meta", "open")))));
  // active file
  const t = A.ed.activeTab();
  if (t?.path) kids.push(S("Active file", h("div.run-box", h("button.btn.block", { onclick: () => runFile(t.path) }, icon("play"), ` Run ${P.base(t.path)}`))));
  // npm
  if (pkg) {
    kids.push(S(`npm · ${pkg.name || "package.json"}`,
      h("div.run-box", h("div", { style: { display: "flex", gap: "8px" } }, h("button.btn.small", { onclick: installDeps }, icon("package"), " Install"), h("button.btn.small", { onclick: () => A.term.create({ cwd: A.ws.root }) }, icon("terminal"), " Terminal"))),
      ...Object.entries(pkg.scripts || {}).map(([k, v]) => h("div.row", { style: { paddingLeft: "14px" }, title: v, onclick: () => runScript(k) }, icon("play"), h("span.label", k), h("span.meta", v.slice(0, 28))))));
  }
  if (!linux.installed) kids.push(S("Linux", h("div.run-box", h("div.muted", "Install the Linux environment to run node, npm, python, git and compilers."), h("button.btn.primary.block", { onclick: async () => (await A.feat("env")).wizard() }, icon("server-environment"), " Set up Linux…"))));
  bodyEl.replaceChildren(...kids);
}
