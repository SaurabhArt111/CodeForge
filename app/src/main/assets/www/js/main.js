// CodeForge bootstrap: wires the core modules, layout, activity bar, mobile navigation, commands, and optional feature modules.
import { N, mode as bridgeMode } from "./core/bridge.js";
import { settings } from "./core/settings.js";
import { bus } from "./core/events.js";
import { h, icon, P, clamp, isMobile, isTouch, copyText } from "./core/util.js";
import { toast, toastError, contextMenu, modal, prompt, confirm, busy, quickPick } from "./core/ui.js";
import * as themes from "./features/themes.js";
import * as icons from "./features/icons.js";
import { ws } from "./ui/workspace.js";
import * as explorer from "./ui/explorer.js";
import * as ed from "./ui/editor.js";
import * as panel from "./ui/panel.js";
import * as term from "./ui/terminal.js";
import * as search from "./ui/search.js";
import * as cmd from "./ui/commands.js";
import * as status from "./ui/statusbar.js";
import * as keybar from "./ui/keybar.js";
import * as sv from "./ui/settingsview.js";
import * as of from "./ui/openfolder.js";
import * as output from "./ui/output.js";
import { makeSash } from "./ui/sash.js";
import * as security from "./ui/security.js";

const $ = (s) => document.querySelector(s);
const bootMsg = (m) => ($("#boot-msg").textContent = m);
let info;

// Optional feature modules load lazily; a missing/broken one never prevents the IDE from starting.
const features = {};
async function loadFeature(name) {
  if (features[name] !== undefined) return features[name];
  try { features[name] = await import(`./features/${name}.js`); if (features[name].init) await features[name].init(api); }
  catch (e) { console.error("feature", name, e); features[name] = null; if (!/Failed to fetch|Cannot find|404/.test(String(e.message))) toast(`Feature “${name}” failed: ${e.message}`, { kind: "error" }); }
  return features[name];
}
const feat = async (name) => { const f = await loadFeature(name); if (!f) throw new Error(`Feature “${name}” is not available`); return f; };

// shared API handed to feature modules
export const api = { output, N, settings, bus, ws, ed, term, panel, explorer, cmd, status, themes, icons, of, toast, toastError, modal, prompt, confirm, busy, quickPick, contextMenu, feat, showView: (v) => showView(v), openFolder, info: () => info, refreshExplorer: () => explorer.refresh(), registerView: (name, fn) => views.set(name, fn) };
const views = new Map();

window.addEventListener("error", (e) => { console.error(e.error || e.message); });
window.addEventListener("unhandledrejection", (e) => { console.error(e.reason); if (e.reason && !/AbortError|cancel/i.test(String(e.reason.message))) toast(String(e.reason.message || e.reason).slice(0, 200), { kind: "error" }); });

async function boot() {
  try {
    bootMsg("Connecting to native host…");
    info = await settings.init();
    security.init(); await security.gateStartup();   // optional app lock (PIN / biometrics) before anything is shown
    await ws.init(info); of.setInfo(info);
    bootMsg("Loading themes…");
    await Promise.all([themes.init(), icons.init()]);
    await themes.apply(settings.get("ui.theme")); icons.use(settings.get("ui.iconTheme"));
    $("#app").classList.remove("hidden");
    bootMsg("Loading editor…");
    await ed.loadMonaco(); themes.attachMonaco(ed.monaco); await themes.apply(settings.get("ui.theme"));
    ed.initEditor(); panel.init(); output.init(); term.init(); search.init(); explorer.init(handlers); status.init(); keybar.init(); cmd.initKeys();
    layout(); registerCommands(); wireEvents();
    // keep the splash on screen long enough for its animation to play, then fade it out
    setTimeout(() => $("#boot").classList.add("done"), Math.max(0, 1500 - performance.now()));
    // restore last project
    const last = settings.state.lastWorkspace;
    if (last && (await N.fs.exists(last))) { await openFolder(last, { restore: true }); }
    else if (bridgeMode !== "android" || !settings.state.recent.length) { /* explorer empty state shows the open options */ }
    showView(settings.state.view || "explorer", { silent: true });
    if (!last) showWelcome();
    await handleIntent(await N.sys.takeIntent().catch(() => null));
    // heavier optional features after first paint
    for (const f of ["env", "live", "git", "github", "run", "extensions", "plugins", "ai", "snippets", "format", "markdown"]) await loadFeature(f);
    window.__cfReady = true;
  } catch (e) {
    console.error(e);
    $("#boot-msg").textContent = "Failed to start"; $("#boot-err").textContent = (e.stack || e.message || String(e));
    window.__cfError = String(e.stack || e);
  }
}

// ---------------------------------------------------------------------------------------------- layout
let currentView = null;
export function showView(name, { silent = false, toggle = false } = {}) {
  if (views.has(name) && !document.getElementById("view-" + name).dataset.ready) { document.getElementById("view-" + name).dataset.ready = "1"; views.get(name)(document.getElementById("view-" + name)); }
  const sb = $("#sidebar");
  if (toggle && currentView === name && !isMobile()) { sb.classList.toggle("collapsed"); }
  else { sb.classList.remove("collapsed"); }
  currentView = name; settings.state.view = name; settings.saveState();
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + name));
  document.querySelectorAll(".ab-btn[data-view]").forEach((b) => b.classList.toggle("active", b.dataset.view === name && !sb.classList.contains("collapsed")));
  if (isMobile() && !silent) { sb.classList.add("open"); $("#side-backdrop").classList.add("on"); }
  document.querySelectorAll("#bottomnav button").forEach((b) => b.classList.toggle("active", b.dataset.nav === name && sb.classList.contains("open")));
  bus.emit("view:shown", name);
}
const closeDrawer = () => { $("#sidebar").classList.remove("open"); $("#side-backdrop").classList.remove("on"); document.querySelectorAll("#bottomnav button").forEach((b) => b.classList.remove("active")); };

function layout() {
  document.querySelectorAll(".ab-btn[data-view]").forEach((b) => b.addEventListener("click", () => showView(b.dataset.view, { toggle: true })));
  $("#side-backdrop").addEventListener("click", closeDrawer);
  bus.on("sidebar:close", closeDrawer);
  bus.on("view", (v) => showView(v));
  bus.on("cmd:sidebar", () => (isMobile() ? ($("#sidebar").classList.contains("open") ? closeDrawer() : showView(currentView || "explorer")) : $("#sidebar").classList.toggle("collapsed")));
  $("#btn-sidebar").addEventListener("click", () => (isMobile() ? ($("#sidebar").classList.contains("open") ? closeDrawer() : showView(currentView || "explorer")) : $("#sidebar").classList.toggle("collapsed")));
  $("#title").addEventListener("click", () => cmd.palette());
  $("#btn-term").addEventListener("click", () => panel.toggle("terminal"));
  $("#btn-ai").addEventListener("click", () => showView("ai", { toggle: true }));
  $("#btn-run").addEventListener("click", (e) => runMenu(e.clientX, e.clientY));
  const undoBtn = $("#btn-undo"), redoBtn = $("#btn-redo");
  const syncUR = () => { const s = ed.undoState(); undoBtn.classList.toggle("dim", !s.undo); redoBtn.classList.toggle("dim", !s.redo); };
  undoBtn.addEventListener("click", () => { ed.undo(); syncUR(); }); redoBtn.addEventListener("click", () => { ed.redo(); syncUR(); });
  for (const ev of ["content", "active", "saved"]) ed.editorEvents.on(ev, syncUR);
  syncUR();
  $("#btn-account").addEventListener("click", (e) => accountMenu(e.clientX, e.clientY));
  $("#ab-account").addEventListener("click", (e) => accountMenu(e.clientX, e.clientY));
  $("#ab-settings").addEventListener("click", (e) => settingsMenu(e.clientX, e.clientY));
  // sidebar sash
  const sash = $("#sash-v"), sb = $("#sidebar");
  const w0 = settings.state.sidebarWidth; if (w0) document.documentElement.style.setProperty("--sidebar-w", w0 + "px");
  makeSash(sash, {
    axis: "x", size: () => sb.getBoundingClientRect().width, min: () => 180, max: () => Math.min(640, innerWidth - 240),
    apply: (w) => document.documentElement.style.setProperty("--sidebar-w", w + "px"),
    commit: (w) => { settings.state.sidebarWidth = Math.round(w); settings.saveState(); },
    reset: () => { document.documentElement.style.removeProperty("--sidebar-w"); settings.state.sidebarWidth = 0; settings.saveState(); },
  });
  // bottom navigation (mobile)
  document.querySelectorAll("#bottomnav button").forEach((b) => b.addEventListener("click", (e) => {
    const n = b.dataset.nav;
    if (n === "explorer" || n === "search") { $("#sidebar").classList.contains("open") && currentView === n ? closeDrawer() : showView(n); }
    else if (n === "editor") { closeDrawer(); panel.hide(); ed.activeEditor()?.focus(); }
    else if (n === "terminal") { closeDrawer(); panel.toggle("terminal"); }
    else if (n === "more") moreMenu(e.clientX || innerWidth - 40, (e.clientY || innerHeight) - 8);
  }));
  const apply = () => document.body.classList.toggle("mobile", isMobile());
  apply(); window.addEventListener("resize", apply);
  // theme changes → relayout
  themes.themeEvents.on("change", () => document.body.dataset.themeType = themes.current.type);
  settings.on("change:ui.theme", (v) => themes.apply(v));
  // themes / icon themes contributed by extensions register AFTER first paint: re-apply the saved choice when they appear
  themes.themeEvents.on("registry", () => { const want = settings.get("ui.theme"); if (themes.current?.id !== want && themes.list().some((t) => t.id === want)) themes.apply(want); });
  icons.iconEvents.on("registry", () => { const want = settings.get("ui.iconTheme"); if (icons.activeId() !== want && icons.list().some((t) => t.id === want)) icons.use(want); });
  settings.on("change:ui.iconTheme", (v) => icons.use(v));
  // title
  const upd = () => { const t = ed.activeTab(); $("#title-text").textContent = [t?.title, ws.name].filter(Boolean).join(" — ") || "CodeForge"; document.title = $("#title-text").textContent + " — CodeForge"; };
  ed.editorEvents.on("active", upd); ws.on("root", upd); bus.on("dirty", upd);
  // android back button
  window.__cfBack = () => {
    if (document.querySelector(".modal-wrap,.qp-wrap,.ctx")) { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); document.querySelector(".ctx-back")?.click(); return true; }
    if ($("#sidebar").classList.contains("open")) { closeDrawer(); return true; }
    if (panel.isOpen()) { panel.hide(); return true; }
    const t = ed.activeTab(); if (t && ed.allTabs().length) { ed.closeTab(t); return true; }
    return false;
  };
}

// ---------------------------------------------------------------------------------------------- workspace actions
export async function openFolder(path, { restore = false } = {}) {
  if (!restore && ws.isOpen && ws.root !== path) { if (!(await ed.closeAll())) return; }
  try { await ws.open(path); } catch (e) { settings.removeRecent(path); toastError(e); return; }
  if (!restore) ed.closeAll(null, true);
  showView("explorer", { silent: true });
  await ed.restoreSession();
  bus.emit("workspace:opened", path);
}
async function closeFolder() { if (!(await ed.closeAll())) return; settings.state.lastWorkspace = null; settings.saveState(); ws.close(); showWelcome(); }

const handlers = {
  openFile: (p, o) => ed.openFile(p, o),
  openFolder,
  openProjectMenu: () => of.chooseProject({ openFolder }),
  openZip: async () => { const r = await of.browse({ mode: "file", title: "Open ZIP project", filter: (it) => /\.(zip|tar|tgz|tar\.gz)$/i.test(it.n), okLabel: "Open as project" }); if (r) { const d = await of.openZipAsProject(r); if (d) openFolder(d); } },
  cloneRepo: async () => (await feat("git")).cloneDialog(),
  newProject: async () => (await feat("templates")).newProject(),
  closeFolder,
  openTerminalAt: (dir) => term.create({ cwd: dir }),
  liveServe: async (dir) => (await feat("live")).serve(dir),
  livePreview: async (file) => (await feat("live")).previewFile(file),
  markdownPreview: async (file) => (await feat("markdown")).preview(file),
  runFile: async (file) => (await feat("run")).runFile(file),
  openArchiveAsProject: async (z) => { const d = await of.openZipAsProject(z); if (d) openFolder(d); },
  exportFile: (p) => of.exportFileToDevice(p),
};

async function handleIntent(i) {
  if (!i) return;
  try {
    let path = i.path;
    if (!path) { const dest = P.join(info.paths.home, "inbox"); await N.fs.mkdir(dest); path = (await N.sys.importUri(i.uri, dest)).path; }
    if (/\.(zip)$/i.test(path)) { if (await confirm(`Open “${P.base(path)}” as a project?`, { okLabel: "Open project" })) { const d = await of.openZipAsProject(path); if (d) openFolder(d); return; } }
    if (!ws.isOpen) await openFolder(P.dir(path));
    ed.openFile(path);
  } catch (e) { toastError(e); }
}

function wireEvents() {
  N.on("app.intent", (i) => { N.sys.takeIntent().catch(() => {}); handleIntent(i); });
  bus.on("reveal", (p) => { showView("explorer"); explorer.reveal(p); });
  bus.on("cmd:palette", () => cmd.palette()); bus.on("cmd:quickopen", () => cmd.quickOpen());
  bus.on("cmd:openfolder", () => handlers.openProjectMenu());
  bus.on("cmd:newfile", () => explorer.explorer.newFile());
  bus.on("cmd:run", () => runMenu(innerWidth - 60, 48));
  bus.on("term:cmd", async (verb, arg) => {
    if (verb === "url") {   // xdg-open / $BROWSER / `open` / vite "press o"
      if (/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(arg)) bus.emit("preview:url", arg.replace("//0.0.0.0", "//127.0.0.1"));
      else if (/^https?:\/\//i.test(arg)) N.sys.openUrl(arg);
      else if (arg.startsWith("/")) ed.openFile(arg);
      return;
    }
    if (verb !== "open") return;
    const st = await N.fs.stat(arg).catch(() => null);
    if (!st) return toast(`code: no such file or folder: ${arg}`, { kind: "error" });
    if (st.t === "d") { if (await confirm(`Open folder “${P.base(arg) || arg}” as the project?`, { okLabel: "Open" })) openFolder(arg); }
    else { ed.openFile(arg); if (isMobile()) panel.hide(); }
  });
  bus.on("env:needed", async () => { try { (await feat("env")).wizard(); } catch (e) { toastError(e); } });
  bus.on("preview:url", async (url) => { try { (await feat("live")).openPreview(url); } catch (e) { toastError(e); } });
  bus.on("panel:output", () => panel.show("output"));
  bus.on("hex", async (p) => { try { (await feat("markdown")).hex(p); } catch (e) { toastError(e); } });
  ws.on("created", () => {});
}

// ---------------------------------------------------------------------------------------------- menus
function runMenu(x, y) {
  const t = ed.activeTab(); const p = t?.path; const items = [];
  if (p) items.push({ label: `Run ${P.base(p)}`, icon: "play", keys: "F5", run: () => handlers.runFile(p) });
  if (p && /\.(html?|svg|md|markdown)$/i.test(p)) items.push({ label: "Preview in App (Live)", icon: "browser", run: () => (/\.(md|markdown)$/i.test(p) ? handlers.markdownPreview(p) : handlers.livePreview(p)) });
  items.push({ label: "Start Live Server (project)", icon: "broadcast", run: () => handlers.liveServe(ws.root) }, { label: "Stop Live Server", icon: "debug-stop", run: async () => (await feat("live")).stopAll() }, { separator: true },
    { label: "Run npm script…", icon: "package", run: async () => (await feat("run")).npmScripts() }, { label: "Run Task…", icon: "tasklist", run: async () => (await feat("run")).tasks() }, { label: "Open Preview panel", icon: "preview", run: () => panel.show("preview") });
  contextMenu(items, x, y);
}
function accountMenu(x, y) { feat("github").then((g) => g.accountMenu(x, y)).catch(() => contextMenu([{ label: "Sign in with GitHub…", icon: "github", run: () => toast("GitHub module unavailable", { kind: "error" }) }], x, y)); }
function settingsMenu(x, y) {
  contextMenu([
    { label: "Settings", icon: "settings-gear", run: sv.open }, { label: "Color Theme…", icon: "symbol-color", run: pickTheme }, { label: "File Icon Theme…", icon: "file", run: pickIconTheme },
    { label: "Command Palette…", icon: "terminal", keys: "Ctrl+Shift+P", run: () => cmd.palette() }, { separator: true },
    { label: "Linux Environment…", icon: "server-environment", run: async () => (await feat("env")).wizard() }, { label: "Check All-Files Access", icon: "shield", run: checkAllFiles }, { separator: true },
    { label: "About CodeForge", icon: "info", run: about },
  ], x, y);
}
function moreMenu(x, y) {
  contextMenu([
    { label: "Source Control", icon: "source-control", run: () => showView("git") }, { label: "Run & Preview", icon: "debug-alt", run: () => showView("run") }, { label: "Extensions", icon: "extensions", run: () => showView("extensions") }, { label: "AI Assistant", icon: "sparkle", run: () => showView("ai") }, { separator: true },
    { label: "Command Palette", icon: "terminal", run: () => cmd.palette() }, { label: "Go to File…", icon: "go-to-file", run: () => cmd.quickOpen() }, { label: "Open Folder…", icon: "folder-opened", run: handlers.openProjectMenu },
    { label: "Account / GitHub", icon: "account", run: () => accountMenu(x, y - 100) }, { label: "Settings", icon: "settings-gear", run: sv.open },
  ], x, y);
}
async function pickTheme() {
  const cur = settings.get("ui.theme"); const items = themes.list().map((t) => ({ label: t.label || t.id, description: t.uiTheme === "vs" ? "light" : t.uiTheme?.startsWith("hc") ? "high contrast" : "dark", value: t.id }));
  const orig = cur; const r = await quickPick(items, { placeholder: "Select Color Theme" }); if (r) settings.set("ui.theme", r); else themes.apply(orig);
}
async function pickIconTheme() { const r = await quickPick(icons.list().map((t) => ({ label: t.label, value: t.id })), { placeholder: "Select File Icon Theme" }); if (r) settings.set("ui.iconTheme", r); }
async function checkAllFiles() {
  const ok = await N.sys.hasAllFiles();
  if (ok) return toast("All-files access is granted", { kind: "success" });
  if (await confirm("CodeForge can browse your whole storage (Downloads, Documents, SD card) when “All files access” is granted.", { title: "Storage access", okLabel: "Open settings" })) N.sys.requestAllFiles();
}
function about() {
  modal({ title: "About CodeForge", body: h("div", h("p.modal-text", `CodeForge ${info.version}\nNative Android IDE · Monaco ${ed.monaco?.editor ? "" : ""}editor, terminal (PTY / Alpine Linux), live server, Git, extensions and AI.`), h("p.modal-detail", `Android SDK ${info.sdk} · ${info.abi} · ${info.device}\nBridge: ${bridgeMode}\nWorkspace: ${info.paths.home}`)), buttons: [{ label: "Close", primary: true }] });
}

// ---------------------------------------------------------------------------------------------- welcome tab
function showWelcome() {
  ed.openCustom("welcome", "Welcome", {
    iconName: "home",
    render(el) {
      const recents = settings.state.recent.slice(0, 8);
      const card = (ic, t, d, fn) => h("button.wcard", { onclick: fn }, icon(ic), h("div", h("div.wt", t), h("div.muted", d)));
      el.append(h("div.welcome", h("h1", "CodeForge"), h("p.muted", "A real code editor, terminal and live server — native on Android."),
        h("div.wgrid",
          card("folder-opened", "Open Folder", "Browse storage, import from device", handlers.openProjectMenu), card("file-zip", "Open ZIP Project", "Extract and edit an archive", handlers.openZip),
          card("repo-clone", "Clone Repository", "From GitHub or any Git URL", handlers.cloneRepo), card("new-folder", "New Project", "HTML, Node, Python, Vite…", handlers.newProject),
          card("terminal", "Terminal", "Android shell or Alpine Linux", () => term.create()), card("sparkle", "AI Assistant", "Claude, OpenAI, Gemini, Copilot models…", () => showView("ai"))),
        recents.length ? h("div", h("h3", "Recent"), ...recents.map((p) => h("div.row", { onclick: () => openFolder(p), style: { paddingLeft: 0 } }, icon("folder"), h("span.label", P.base(p)), h("span.meta", P.dir(p))))) : null));
    },
  });
}

function registerCommands() {
  const R = (id, title, run, o = {}) => cmd.register({ id, title, run, ...o });
  R("file.openFolder", "Open Folder…", handlers.openProjectMenu, { category: "File", icon: "folder-opened" });
  R("file.openZip", "Open ZIP Project…", handlers.openZip, { category: "File" });
  R("file.clone", "Clone Repository…", handlers.cloneRepo, { category: "Git" });
  R("file.newProject", "New Project…", handlers.newProject, { category: "File" });
  R("file.closeFolder", "Close Folder", closeFolder, { category: "File" });
  R("file.new", "New File", () => explorer.explorer.newFile(), { category: "File", keys: "Ctrl+Alt+N" });
  R("file.newFolder", "New Folder", () => explorer.explorer.newFolder(), { category: "File" });
  R("file.save", "Save", () => ed.saveActive(), { category: "File", keys: "Ctrl+S" });
  R("file.saveAll", "Save All", () => ed.saveAll(), { category: "File" });
  R("file.saveAs", "Save As…", () => { const d = ed.activeDoc(); if (d) ed.saveAs(d.path); }, { category: "File" });
  R("file.close", "Close Editor", () => ed.closeTab(ed.activeTab()), { category: "View" });
  R("file.closeAll", "Close All Editors", () => ed.closeAll(), { category: "View" });
  R("file.reload", "Reload File from Disk", () => { const d = ed.activeDoc(); if (d) ed.reload(d.path); }, { category: "File" });
  R("file.export", "Export Project Folder to Device…", () => ws.root && of.exportFolderToDevice(ws.root), { category: "File" });
  R("file.zipProject", "Compress Project to ZIP", async () => { if (!ws.root) return; const dest = P.join(P.dir(ws.root), P.base(ws.root) + ".zip"); const b = busy("Compressing…"); try { await ws.zip([ws.root], dest); toast("Created " + P.base(dest), { kind: "success" }); } catch (e) { toastError(e); } finally { b.close(); } }, { category: "File" });
  R("nav.quickOpen", "Go to File…", () => cmd.quickOpen(), { category: "Go", keys: "Ctrl+P" });
  R("nav.line", "Go to Line…", () => cmd.gotoLine(), { category: "Go", keys: "Ctrl+G" });
  R("nav.symbol", "Go to Symbol in Editor…", () => cmd.gotoSymbol(), { category: "Go" });
  R("view.explorer", "Show Explorer", () => showView("explorer"), { category: "View" });
  R("view.search", "Search in Files", () => bus.emit("cmd:search"), { category: "View", keys: "Ctrl+Shift+F" });
  R("view.git", "Show Source Control", () => showView("git"), { category: "View" });
  R("view.extensions", "Show Extensions", () => showView("extensions"), { category: "View" });
  R("view.ai", "Show AI Assistant", () => showView("ai"), { category: "View" });
  R("view.terminal", "Toggle Terminal", () => panel.toggle("terminal"), { category: "View", keys: "Ctrl+`" });
  R("view.preview", "Show Preview", () => panel.show("preview"), { category: "View" });
  R("view.problems", "Show Problems", () => panel.show("problems"), { category: "View" });
  R("view.split", "Split Editor", () => ed.toggleSplit(), { category: "View", keys: "Ctrl+\\" });
  R("view.sidebar", "Toggle Sidebar", () => bus.emit("cmd:sidebar"), { category: "View", keys: "Ctrl+B" });
  R("view.theme", "Color Theme…", pickTheme, { category: "Preferences" });
  R("view.iconTheme", "File Icon Theme…", pickIconTheme, { category: "Preferences" });
  R("view.settings", "Open Settings", () => sv.open(), { category: "Preferences" });
  R("view.settingsJson", "Open Settings (JSON)", () => ed.openFile(settings.settingsFile), { category: "Preferences" });
  R("view.zoomIn", "Increase Font Size", () => settings.set("editor.fontSize", Math.min(40, settings.get("editor.fontSize") + 1)), { category: "View" });
  R("view.zoomOut", "Decrease Font Size", () => settings.set("editor.fontSize", Math.max(8, settings.get("editor.fontSize") - 1)), { category: "View" });
  R("view.wordWrap", "Toggle Word Wrap", () => settings.set("editor.wordWrap", settings.get("editor.wordWrap") === "off" ? "on" : "off"), { category: "View" });
  R("view.minimap", "Toggle Minimap", () => settings.set("editor.minimap", !settings.get("editor.minimap")), { category: "View" });
  R("view.autosave", "Toggle Auto Save", () => { const v = settings.get("files.autoSave") === "off" ? "afterDelay" : "off"; settings.set("files.autoSave", v); toast("Auto save: " + v); }, { category: "File" });
  R("view.hidden", "Toggle Hidden Files", () => settings.set("files.showHidden", !settings.get("files.showHidden")), { category: "View" });
  R("lang.change", "Change Language Mode", () => cmd.pickLanguage(), { category: "Editor" });
  R("lang.eol", "Change End of Line Sequence", () => cmd.pickEol(), { category: "Editor" });
  R("lang.indent", "Change Indentation", () => cmd.pickIndent(), { category: "Editor" });
  R("term.new", "New Terminal", () => term.create(), { category: "Terminal", icon: "terminal" });
  R("term.linux", "New Linux (Alpine) Terminal", () => term.create({ mode: "linux" }), { category: "Terminal" });
  R("term.host", "New Android Shell", () => term.create({ mode: "host" }), { category: "Terminal" });
  R("env.setup", "Set up Linux Environment…", async () => (await feat("env")).wizard(), { category: "Terminal" });
  R("run.file", "Run Active File", () => { const p = ed.activeTab()?.path; if (p) handlers.runFile(p); }, { category: "Run", keys: "F5" });
  R("run.live", "Start Live Server", () => handlers.liveServe(ws.root), { category: "Live Server" });
  R("run.livefile", "Open Active File in Live Preview", () => { const p = ed.activeTab()?.path; if (p) handlers.livePreview(p); }, { category: "Live Server" });
  R("run.stop", "Stop Live Server", async () => (await feat("live")).stopAll(), { category: "Live Server" });
  R("run.npm", "Run npm Script…", async () => (await feat("run")).npmScripts(), { category: "Run" });
  R("sys.files", "Grant All-Files Access", checkAllFiles, { category: "System" });
  R("sys.reload", "Reload Window", () => location.reload(), { category: "Developer" });
  R("sys.exit", "Quit CodeForge (stop all sessions)", async () => { if (await confirm("Stop all terminals and servers and quit?", { okLabel: "Quit", danger: true })) N.sys.exit(); }, { category: "System" });
}

boot();
