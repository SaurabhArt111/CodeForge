// CodeForge bootstrap: wires the core modules, layout, activity bar, mobile navigation, commands, and optional feature modules.
import * as lazy from "./core/lazy.js";
import * as fontscale from "./core/fontscale.js";
import { N, mode as bridgeMode } from "./core/bridge.js";
import { settings } from "./core/settings.js";
import { bus } from "./core/events.js";
import { h, icon, P, clamp, isMobile, isTouch, copyText } from "./core/util.js";
import { toast, toastError, contextMenu, modal, prompt, confirm, busy, quickPick, longPress } from "./core/ui.js";
import { openUrl } from "./core/links.js";
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
import * as keyboard from "./ui/keyboard.js";
import * as sv from "./ui/settingsview.js";
import * as of from "./ui/openfolder.js";
import * as output from "./ui/output.js";
import { makeSash } from "./ui/sash.js";
import * as security from "./ui/security.js";
import * as crash from "./core/crash.js";
import * as crashes from "./ui/crashes.js";
import * as menubar from "./ui/menubar.js";
import { askZipOptions } from "./ui/zipdialog.js";
import * as projects from "./ui/projects.js";
import * as transfer from "./ui/transfer.js";

crash.install();   // JS errors + breadcrumbs go to the crash recorder from the very first line

const $ = (s) => document.querySelector(s);
const bootMsg = (m) => ($("#boot-msg").textContent = m);
let info;

// Optional feature modules load lazily; a missing/broken one never prevents the IDE from starting.
const features = {};
async function loadFeature(name) {
  if (features[name] !== undefined) return features[name];
  const t0 = performance.now();
  try { features[name] = await import(`./features/${name}.js`); if (features[name].init) await features[name].init(api); crash.crumb(`feature ${name} ${Math.round(performance.now() - t0)}ms`); }
  catch (e) { console.error("feature", name, e); features[name] = null; if (!/Failed to fetch|Cannot find|404/.test(String(e.message))) toast(`Feature “${name}” failed: ${e.message}`, { kind: "error" }); }
  return features[name];
}
const feat = async (name) => { const f = await loadFeature(name); if (!f) throw new Error(`Feature “${name}” is not available`); return f; };

// shared API handed to feature modules
export const api = { output, N, settings, bus, ws, ed, term, panel, explorer, cmd, status, themes, icons, of, toast, toastError, modal, prompt, confirm, busy, quickPick, contextMenu, feat, showView: (v, o) => showView(v, o), openFolder, info: () => info, refreshExplorer: () => explorer.refresh(), registerView: (name, fn) => views.set(name, fn) };
const views = new Map();

window.addEventListener("error", (e) => { console.error(e.error || e.message); });
window.addEventListener("unhandledrejection", (e) => { console.error(e.reason); if (e.reason && !/AbortError|cancel/i.test(String(e.reason.message))) toast(String(e.reason.message || e.reason).slice(0, 200), { kind: "error" }); });

async function boot() {
  try {
    bootMsg("Connecting to native host…");
    info = await settings.init(); fontscale.init();
    const monacoReady = ed.loadMonaco();   // the biggest download: overlap it with themes, icons and the workspace
    monacoReady.catch(() => {});
    security.init(); await security.gateStartup();   // optional app lock (PIN / biometrics) before anything is shown
    await ws.init(info); of.setInfo(info);
    bootMsg("Loading themes…");
    await Promise.all([themes.init(), icons.init()]);
    await themes.apply(settings.get("ui.theme")); icons.use(settings.get("ui.iconTheme"));
    $("#app").classList.remove("hidden");
    bootMsg("Loading editor…");
    await monacoReady; themes.attachMonaco(ed.monaco); await themes.apply(settings.get("ui.theme"));
    ed.initEditor(); panel.init(); panel.setViewBuilder(ensureView);
    panel.setDockHandler((name, to) => {
      if (name === "*") { showView("explorer", { silent: true }); return; }
      if (to !== "sidebar" && name === currentView) showView("explorer", { silent: true });   // the view just left the sidebar
    });
    output.init(); term.init(); search.init(); explorer.init(handlers); status.init(); keybar.init(); keyboard.init(); cmd.initKeys();
    layout(); registerCommands(); wireEvents(); menubar.init(); mobileNav();
    // keep the splash on screen long enough for its animation to play, then fade it out
    setTimeout(() => $("#boot").classList.add("done"), Math.max(0, 900 - performance.now()));
    // restore last project
    const last = settings.state.lastWorkspace;
    if (last && (await N.fs.exists(last))) { await openFolder(last, { restore: true }); }
    else if (bridgeMode !== "android" || !settings.state.recent.length) { /* explorer empty state shows the open options */ }
    showView(settings.state.view || "explorer", { silent: true });
    if (!last) showWelcome();
    await handleIntent(await N.sys.takeIntent().catch(() => null));
    // heavier optional features after first paint
    await Promise.all(["env", "live", "git", "github", "run", "extensions", "plugins", "ai", "snippets", "format", "markdown"].map(loadFeature));
    window.__cfReady = true;
    lazy.idle(() => lazy.xterm().catch(() => {}), 4000);   // so the first terminal opens instantly
    crash.crumb("boot complete");
    crashes.startupCheck();   // "CodeForge stopped last time" notice (does not block anything)
  } catch (e) {
    crash.report("js-error", "Startup failed: " + (e.message || e), String(e.stack || e));
    console.error(e);
    $("#boot-msg").textContent = "Failed to start"; $("#boot-err").textContent = (e.stack || e.message || String(e));
    window.__cfError = String(e.stack || e);
  }
}

// ---------------------------------------------------------------------------------------------- layout
let currentView = null;
function ensureView(name) {
  const el = document.getElementById("view-" + name);
  if (el && views.has(name) && !el.dataset.ready) { el.dataset.ready = "1"; views.get(name)(el); }
}
export function showView(name, { silent = false, toggle = false } = {}) {
  if (panel.sheetOf(name)) {                       // this view lives in a top / bottom sheet
    if (silent) { if (name !== "explorer" && !panel.sheetOf("explorer")) return showView("explorer", { silent: true }); return; }
    if (toggle) panel.toggle(name); else panel.show(name);
    if (isMobile()) closeDrawer();
    return;
  }
  ensureView(name);
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
  document.querySelectorAll(".ab-btn[data-view]").forEach((b) => {
    b.addEventListener("click", () => showView(b.dataset.view, { toggle: true }));
    // right-click / long-press: move this view to the right sheet, bottom, top, a page … (or back)
    if (panel.canMove(b.dataset.view)) { b.addEventListener("contextmenu", (e) => { e.preventDefault(); panel.moveMenu(b.dataset.view, e.clientX, e.clientY); }); longPress(b, (x, y) => panel.moveMenu(b.dataset.view, x, y), 520); }
  });
  $("#side-backdrop").addEventListener("click", closeDrawer);
  bus.on("sidebar:close", closeDrawer);
  bus.on("view", (v) => showView(v));
  bus.on("cmd:sidebar", () => (isMobile() ? ($("#sidebar").classList.contains("open") ? closeDrawer() : showView(currentView || "explorer")) : $("#sidebar").classList.toggle("collapsed")));
  $("#btn-sidebar").addEventListener("click", (e) => {
    if (!menubar.hasMenuBar()) { const r = e.currentTarget.getBoundingClientRect(); menubar.openMainMenu(r.left, r.bottom + 4); return; }   // phones: File, Edit, Selection, View, Go, Run, Terminal, Help
    $("#sidebar").classList.toggle("collapsed");
  });
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
  // android back button: close whatever is open on top; with nothing left to close the app goes to the recents list - but never with unsaved work
  window.__cfBack = () => {
    if (document.querySelector(".modal-wrap,.qp-wrap,.ctx")) { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); document.querySelector(".ctx-back")?.click(); return true; }
    if ($("#sidebar").classList.contains("open")) { closeDrawer(); return true; }
    if (panel.isSheetOpen("page")) { panel.hide("page"); return true; }
    if (panel.closeLast()) return true;
    if (keyboard.isOpen()) { keyboard.closeKeyboard(); return true; }
    if (ed.dirtyDocs().length) { leaveApp(); return true; }
    return false;   // the native side moves the app to the background
  };
}

/** Leave to the recents list; with unsaved files ask first (save & leave / leave anyway / stay). */
export async function leaveApp({ quit = false } = {}) {
  const go = () => (quit ? N.sys.exit() : N.sys.moveToBack());
  const dirty = ed.dirtyDocs();
  if (!dirty.length) return go();
  const names = dirty.map((d) => d.name);
  const v = await modal({
    title: quit ? "Unsaved changes — quit?" : "Unsaved changes", width: 440,
    body: h("div", h("p.modal-text", `${names.length === 1 ? "1 file has" : names.length + " files have"} changes that are not saved:`),
      h("ul.exit-list", ...names.slice(0, 8).map((n) => h("li", n)), names.length > 8 ? h("li.muted", `…and ${names.length - 8} more`) : null)),
    buttons: [{ label: "Stay", value: "stay" }, { label: quit ? "Quit without saving" : "Leave without saving", danger: true, value: "leave" }, { label: quit ? "Save all & quit" : "Save all & leave", primary: true, value: "save" }],
  });
  if (v === "save") { await ed.saveAll(); if (ed.dirtyDocs().length) { toast("Some files could not be saved, staying here", { kind: "error" }); return; } go(); }
  else if (v === "leave") go();
}

// ---------------------------------------------------------------------------------------------- phone: drawer icon strip + edge swipes
function mobileNav() {
  const sb = $("#sidebar");
  const defs = [["explorer", "files", "Files"], ["search", "search", "Search"], ["git", "source-control", "Source Control"], ["run", "debug-alt", "Run & Preview"], ["extensions", "extensions", "Extensions"], ["ai", "sparkle", "AI Assistant"]];
  const strip = h("div#side-nav", {}, ...defs.map(([v, ic, tip]) => { const b = h("button.sn-btn", { dataset: { view: v }, title: tip + (panel.canMove(v) ? " (long-press to move)" : ""), "aria-label": tip, onclick: () => showView(v) }, icon(ic)); if (panel.canMove(v)) { b.addEventListener("contextmenu", (e) => { e.preventDefault(); panel.moveMenu(v, e.clientX, e.clientY); }); longPress(b, (x, y) => panel.moveMenu(v, x, y), 520); } return b; }),
    h("span.spacer"), h("button.sn-btn", { title: "Settings", "aria-label": "Settings", onclick: () => { closeDrawer(); sv.open(); } }, icon("settings-gear")),
    h("button.sn-btn", { title: "Close", "aria-label": "Close menu", onclick: closeDrawer }, icon("close")));
  sb.prepend(strip);
  const sync = () => strip.querySelectorAll(".sn-btn[data-view]").forEach((b) => b.classList.toggle("active", b.dataset.view === currentView));
  bus.on("view:shown", sync); sync();
  // swipe: left edge → right opens the drawer, right edge → left opens the right sheet, and the reverse swipes close them
  let t0 = null;
  const blocked = (el) => el.closest?.(".modal-wrap,.ctx,.qp-wrap,.tabs,.sheet-tabs,#keybar-row,input,textarea,.xterm-viewport.scrolling-x");
  document.addEventListener("touchstart", (e) => {
    if (!isMobile() || e.touches.length !== 1) { t0 = null; return; }
    const t = e.touches[0], W = window.innerWidth, drawer = sb.classList.contains("open"), right = !$("#sheet-right").classList.contains("hidden");
    let kind = null;
    if (drawer) kind = "close-left"; else if (right) kind = "close-right";
    else {
      const free = !blocked(e.target);   // scrollable strips / inputs only give up the outer 36px, never the outermost 14px
      if (t.clientX < 14 || (free && t.clientX < 36)) kind = "open-left";
      else if ((t.clientX > W - 14 || (free && t.clientX > W - 36)) && panel.layout().right.length) kind = "open-right";
    }
    t0 = kind ? { kind, x: t.clientX, y: t.clientY } : null;
  }, { passive: true });
  document.addEventListener("touchend", (e) => {
    if (!t0) return; const t = e.changedTouches[0], dx = t.clientX - t0.x, dy = t.clientY - t0.y, k = t0.kind; t0 = null;
    if (Math.abs(dx) < 70 || Math.abs(dy) > Math.abs(dx) * 0.6) return;
    if (k === "open-left" && dx > 0) showView(currentView || "explorer");
    else if (k === "open-right" && dx < 0) panel.show(panel.layout().right[0]);
    else if (k === "close-left" && dx < 0) closeDrawer();
    else if (k === "close-right" && dx > 0) panel.hide("right");
  }, { passive: true });
  document.addEventListener("touchcancel", () => { t0 = null; }, { passive: true });
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
  openProjectMenu: () => projects.chooseProject({ openFolder, handlers }),
  openZip: async () => { const r = await of.browse({ mode: "file", title: "Open ZIP project", filter: (it) => /\.(zip|tar|tgz|tar\.gz)$/i.test(it.n), okLabel: "Open as project" }); if (r) { const d = await of.openZipAsProject(r); if (d) openFolder(d); } },
  importBundle: () => transfer.importBundle({ openFolder }),
  cloneRepo: async () => (await feat("git")).cloneDialog(),
  newProject: async () => (await feat("templates")).newProject(),
  closeFolder,
  openTerminalAt: (dir) => term.create({ cwd: dir }),
  liveServe: async (dir) => (await feat("live")).serve(dir),
  livePreview: async (file) => (await feat("live")).previewFile(file),
  livePreviewInline: async (file) => (await feat("live")).previewFile(file, { inline: true }),
  livePreviewWindow: async (file) => { const l = await feat("live"); const r = await l.previewFile(file, { inline: false }); return r; },
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
  bus.on("term:cmd", async (verb, arg) => {          // OSC 7770 from the `cf` / `code` / `xdg-open` commands inside a terminal
    try {
      if (verb === "url") {   // xdg-open / $BROWSER / `open` / vite "press o"
        if (/^https?:\/\//i.test(arg)) openUrl(arg);   // default browser (or in-app preview, see Settings → Appearance → "Open links with")
        else if (arg.startsWith("/")) ed.openFile(arg);
        return;
      }
      if (verb === "open") {
        let path = arg, line, col; const m = /^(.*?):(\d+)(?::(\d+))?$/.exec(arg);
        let st = await N.fs.stat(path).catch(() => null);
        if (!st && m) { path = m[1]; line = +m[2]; col = m[3] ? +m[3] : undefined; st = await N.fs.stat(path).catch(() => null); }
        if (!st) return toast(`cf: no such file or folder: ${arg}`, { kind: "error" });
        if (st.t === "d") { if (await confirm(`Open folder “${P.base(path) || path}” as the project?`, { okLabel: "Open" })) openFolder(path); }
        else { ed.openFile(path, { line, col }); if (isMobile()) panel.hide(); }
        return;
      }
      if (verb === "preview") { const l = await feat("live"); if (/^https?:\/\//i.test(arg)) l.openPreview(arg); else l.previewFile(arg); return; }
      if (verb === "serve") { const l = await feat("live"); await l.serve(arg); return; }
      if (verb === "ai") {
        const [send, agent, b64] = [arg.slice(0, arg.indexOf(",")), arg.slice(arg.indexOf(",") + 1, arg.indexOf(",", arg.indexOf(",") + 1)), arg.slice(arg.indexOf(",", arg.indexOf(",") + 1) + 1)];
        const text = new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
        const a = await feat("ai"); a.external(text, { send: send === "1", agent: agent === "1" }); return;
      }
      if (verb === "settings") { sv.open(); return; }
      if (verb === "crashes") { crashes.openReports(); return; }
      if (verb === "toast") { toast(arg || "cf"); return; }
    } catch (e) { toastError(e); }
  });
  bus.on("env:needed", async () => { try { (await feat("env")).wizard(); } catch (e) { toastError(e); } });
  bus.on("preview:url", async (url) => { try { (await feat("live")).openPreview(url); } catch (e) { toastError(e); } });
  bus.on("panel:output", () => panel.show("output"));
  bus.on("hex", async (p) => { try { (await feat("markdown")).hex(p); } catch (e) { toastError(e); } });
  ws.on("created", () => {});
  bus.on("workspace:opened", (p) => crash.crumb("workspace " + P.base(p)));
  ed.editorEvents.on("active", () => { const t = ed.activeTab(); if (t?.path) crash.crumb("file " + P.base(t.path)); });
  bus.on("panel", (n) => crash.crumb("panel " + n));
}

// ---------------------------------------------------------------------------------------------- menus
function runMenu(x, y) {
  const t = ed.activeTab(); const p = t?.path; const items = [];
  if (p) items.push({ label: `Run ${P.base(p)}`, icon: "play", keys: "F5", run: () => handlers.runFile(p) });
  if (p && /\.(html?|svg)$/i.test(p)) items.push({ label: "Live Preview (" + (settings.get("preview.mode") === "inline" ? "panel" : "separate window") + ")", icon: "browser", run: () => handlers.livePreview(p) },
    { label: settings.get("preview.mode") === "inline" ? "Live Preview in separate window" : "Live Preview in panel", icon: "preview", run: async () => { const l = await feat("live"); const inline = settings.get("preview.mode") !== "inline"; l.previewFile(p, { inline }); } });
  if (p && /\.(md|markdown)$/i.test(p)) items.push({ label: "Preview Markdown", icon: "browser", run: () => handlers.markdownPreview(p) });
  items.push({ label: "Start Live Server (project)", icon: "broadcast", run: () => handlers.liveServe(ws.root) }, { label: "Stop Live Server", icon: "debug-stop", run: async () => (await feat("live")).stopAll() }, { separator: true },
    { label: "Run npm script…", icon: "package", run: async () => (await feat("run")).npmScripts() }, { label: "Run Task…", icon: "tasklist", run: async () => (await feat("run")).tasks() }, { label: "Open Preview panel", icon: "preview", run: () => panel.show("preview") });
  contextMenu(items, x, y);
}
function accountMenu(x, y) { feat("github").then((g) => g.accountMenu(x, y)).catch(() => contextMenu([{ label: "Sign in with GitHub…", icon: "github", run: () => toast("GitHub module unavailable", { kind: "error" }) }], x, y)); }
function settingsMenu(x, y) {
  contextMenu([
    { label: "Settings", icon: "settings-gear", run: sv.open }, { label: "Color Theme…", icon: "symbol-color", run: pickTheme }, { label: "File Icon Theme…", icon: "file", run: pickIconTheme },
    { label: "Command Palette…", icon: "terminal", keys: "Ctrl+Shift+P", run: () => cmd.palette() }, { separator: true },
    { label: "Crash Reports…", icon: "bug", run: () => crashes.openReports() },
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
// About: what CodeForge is, what it is built on and who inspired it. The same content is on the website (/about).
export const CREDITS = {
  inspired: [
    ["Visual Studio Code", "https://code.visualstudio.com", "the workbench layout, command palette, settings, extension model and keyboard shortcuts CodeForge follows"],
    ["Termux", "https://termux.dev", "proof that a real Linux userland on Android is practical"],
    ["Acode", "https://acode.app", "a code editor made for phones; CodeForge's Linux launcher is adapted from Acode's sandbox script (MIT)"],
  ],
  built: [
    ["Monaco Editor", "https://microsoft.github.io/monaco-editor/", "the editor that powers VS Code (MIT)"],
    ["xterm.js", "https://xtermjs.org", "terminal emulator (MIT)"],
    ["PRoot + Alpine Linux", "https://proot-me.github.io", "Linux environment without root: apk, Node.js, Python, Git, compilers"],
    ["isomorphic-git", "https://isomorphic-git.org", "Git in JavaScript: clone, commit, branch, push, pull (MIT)"],
    ["Open VSX", "https://open-vsx.org", "the open extension registry CodeForge installs from"],
    ["Codicons · Seti icons", "https://github.com/microsoft/vscode-codicons", "icons (CC BY 4.0 / MIT)"],
    ["Emmet · Prettier · marked · JSZip", "https://prettier.io", "abbreviations, formatting, Markdown, archives (MIT)"],
    ["Android WebView · Kotlin", "https://developer.android.com", "the native shell: storage, PTY, services, Keystore"],
  ],
};
async function about() {
  const row = ([n, u, d]) => h("li", h("button.link", { type: "button", onclick: () => N.sys.openUrl(u) }, n), " – ", d);
  const el = h("div.about-page.selectable",
    h("div.about-hero", h("img.about-logo", { src: "assets/logo.svg", alt: "", onerror: (e) => e.target.remove() }), h("div", h("h1", "CodeForge"), h("div.muted", `Version ${info.version} · ${N.mode() === "web" ? "Web" : "Android " + info.sdk} · ${info.abi}`))),
    h("p", "A complete code editor and development environment for phones, tablets and the browser: editor, terminal with real Linux, Git and GitHub, live preview, extensions and an AI assistant, in one app."),
    h("p", "CodeForge is an independent project. It is not made by, affiliated with or endorsed by Microsoft, and it is not a copy of Visual Studio Code: the interface is written from scratch for touch screens, on top of the open-source parts listed below."),
    h("h2", "Inspired by"), h("ul", ...CREDITS.inspired.map(row)),
    h("h2", "Built with"), h("ul", ...CREDITS.built.map(row)),
    h("h2", "Runs on"), h("p", "Android 8.0 and newer (phones, tablets, foldables, Chromebooks) as an app; Windows, macOS, Linux, iPadOS and ChromeOS through the web version in any modern browser."),
    h("h2", "This device"), h("p.about-mono", `${info.device}
Bridge: ${bridgeMode}
Workspace: ${info.paths.home}`),
    h("div.about-actions", h("button.btn", { onclick: () => cmd.run("sys.crashes") }, "Crash reports"), h("button.btn", { onclick: () => N.sys.openUrl("https://github.com/SaurabhArt111/CodeForge/blob/main/THIRD_PARTY_NOTICES.md") }, "Open-source licenses"), h("button.btn", { onclick: () => N.sys.openUrl("https://github.com/SaurabhArt111/CodeForge") }, "Source on GitHub")));
  ed.openCustom("about", "About", { iconName: "info", render: (box) => { box.classList.add("about-wrap"); box.replaceChildren(el); } });
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
  R("file.transferOut", bridgeMode === "android" ? "Transfer: Export bundle for CodeForge Web…" : "Transfer: Export bundle for the CodeForge app…", () => transfer.exportBundle(), { category: "File" });
  R("file.transferIn", "Transfer: Import bundle (.cfbundle)…", () => transfer.importBundle({ openFolder }), { category: "File" });
  R("file.export", "Export Project Folder to Device…", () => ws.root && of.exportFolderToDevice(ws.root), { category: "File" });
  R("file.zipProject", "Compress Project to ZIP…", async () => {
    if (!ws.root) return;
    const o = await askZipOptions({ name: P.base(ws.root) + ".zip", paths: [ws.root] }); if (!o) return;
    const dest = P.join(P.dir(ws.root), o.name); const b = busy("Compressing…");
    try { const r = await ws.zip([ws.root], dest, o.exclude); toast(`Created ${o.name} (${r.count} files)`, { kind: "success" }); if (bridgeMode !== "android") await N.sys.exportFile(dest); else of.exportFileToDevice(dest); } catch (e) { toastError(e); } finally { b.close(); }
  }, { category: "File" });
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
  R("sheet.terminalTop", "Move Terminal to Top Sheet", () => { panel.move("terminal", "top"); panel.show("terminal"); }, { category: "View" });
  R("sheet.terminalBottom", "Move Terminal to Bottom Sheet", () => { panel.move("terminal", "bottom"); panel.show("terminal"); }, { category: "View" });
  R("sheet.aiBottom", "Move AI Assistant to Bottom Sheet", () => { panel.move("ai", "bottom"); panel.show("ai"); }, { category: "View" });
  R("sheet.aiTop", "Move AI Assistant to Top Sheet", () => { panel.move("ai", "top"); panel.show("ai"); }, { category: "View" });
  R("sheet.aiSidebar", "Move AI Assistant back to Sidebar", () => { panel.move("ai", "sidebar"); showView("ai"); }, { category: "View" });
  const to = (name, where) => () => { panel.move(name, where); panel.show(name); };
  R("sheet.terminalRight", "Move Terminal to Right Sheet (opposite the sidebar)", to("terminal", "right"), { category: "View" });
  R("sheet.terminalPage", "Open Terminal as Page", to("terminal", "page"), { category: "View" });
  R("sheet.aiRight", "Move AI Assistant to Right Sheet", to("ai", "right"), { category: "View" });
  R("sheet.aiPage", "Open AI Assistant as Page", to("ai", "page"), { category: "View" });
  R("sheet.toggleBottom", "Toggle Bottom Panel", () => { const l = panel.layout().bottom; if (panel.isSheetOpen("bottom")) panel.hide("bottom"); else if (l[0]) panel.show(l[0]); else to("terminal", "bottom")(); }, { category: "View" });
  R("sheet.toggleRight", "Toggle Right Sheet", () => { const l = panel.layout().right; if (panel.isSheetOpen("right")) panel.hide("right"); else if (l[0]) panel.show(l[0]); else to("ai", "right")(); }, { category: "View" });
  R("sheet.top", "Toggle Top Sheet", () => { const l = panel.layout(); const n = l.top[0]; if (n) panel.toggle(n); else { panel.move("terminal", "top"); panel.show("terminal"); } }, { category: "View" });
  R("sheet.moveView", "Move a View to Another Sheet…", async () => {
    const names = [["ai", "AI Assistant"], ["terminal", "Terminal"], ["preview", "Preview"], ["output", "Output"], ["problems", "Problems"], ["search", "Search"], ["git", "Source Control"], ["run", "Run & Preview"], ["extensions", "Extensions"]];
    const v = await quickPick(names.map(([id, label]) => ({ label, value: id })), { placeholder: "Which view?" }); if (!v) return;
    panel.moveMenu(v, innerWidth / 2 - 100, innerHeight / 3);
  }, { category: "View" });
  R("sheet.reset", "Reset Top / Bottom Sheets Layout", () => panel.resetLayout(), { category: "View" });
  R("view.problems", "Show Problems", () => panel.show("problems"), { category: "View" });
  R("view.split", "Split Editor", () => ed.toggleSplit(), { category: "View", keys: "Ctrl+\\" });
  R("view.sidebar", "Toggle Sidebar", () => bus.emit("cmd:sidebar"), { category: "View", keys: "Ctrl+B" });
  R("view.theme", "Color Theme…", pickTheme, { category: "Preferences" });
  R("view.iconTheme", "File Icon Theme…", pickIconTheme, { category: "Preferences" });
  R("view.settings", "Open Settings", () => sv.open(), { category: "Preferences" });
  R("view.settingsJson", "Open Settings (JSON)", () => ed.openFile(settings.settingsFile), { category: "Preferences" });
  R("view.textBigger", "Increase Text Size (whole app)", () => fontscale.bump(10), { category: "View" });
  R("view.textSmaller", "Decrease Text Size (whole app)", () => fontscale.bump(-10), { category: "View" });
  R("view.textReset", "Reset Text Size", () => fontscale.reset(), { category: "View" });
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
  R("help.about", "About CodeForge", about, { category: "Help" });
  R("sys.crashes", "View Crash Reports", () => crashes.openReports(), { category: "Developer" });
  R("sys.diagnostics", "Copy Diagnostics", async () => { await copyText(await N.crash.diagnostics()); toast("Diagnostics copied"); }, { category: "Developer" });
  R("view.previewWindow", "Open Preview in Separate Window", async () => { const p = ed.activeTab()?.path; if (!p) return; const l = await feat("live"); const root = ws.isOpen && P.inside(ws.root, p) ? ws.root : P.dir(p); const s = await l.serve(root, { open: false }); if (s) l.openIsolated(s.url + P.rel(root, p).split("/").map(encodeURIComponent).join("/")); }, { category: "Live Server" });
  R("sys.reload", "Reload Window", () => location.reload(), { category: "Developer" });
  R("sys.exit", "Quit CodeForge (stop all sessions)", async () => { if (await confirm("Stop all terminals and servers and quit?", { okLabel: "Quit", danger: true })) leaveApp({ quit: true }); }, { category: "System" });
}

boot();
