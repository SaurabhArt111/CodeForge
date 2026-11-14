// VS Code-style layout chrome for tablets / desktop (>= 900px wide): a menu bar (File, Edit, Selection, View, Go, Run, Terminal, Help)
// plus layout toggles (sidebar / bottom panel / right sheet) in the title bar. Phones keep the compact toolbar and drawer.
import { h, icon } from "../core/util.js";
import { contextMenu, navMenu } from "../core/ui.js";
import * as panel from "./panel.js";
import * as cmd from "./commands.js";
import * as ed from "./editor.js";
import { bus } from "../core/events.js";
import * as seccenter from "./securitycenter.js";

const run = (id) => () => cmd.run(id);
const act = (id) => () => { const e = ed.activeEditor(); if (!e) return; e.focus(); e.trigger("menu", id, null); };
const MENUS = {
  File: () => [
    { label: "New File", icon: "new-file", keys: "Ctrl+N", run: run("file.new") }, { label: "New Folder", icon: "new-folder", run: run("file.newFolder") }, { label: "New Project…", icon: "add", run: run("file.newProject") },
    { separator: true }, { label: "Open Folder…", icon: "folder-opened", run: run("file.openFolder") }, { label: "Clone Repository…", icon: "repo-clone", run: run("file.clone") }, { label: "Open Zip…", icon: "file-zip", run: run("file.openZip") },
    { separator: true }, { label: "Save", icon: "save", keys: "Ctrl+S", run: run("file.save") }, { label: "Save All", icon: "save-all", run: run("file.saveAll") }, { label: "Save As…", icon: "save-as", run: run("file.saveAs") },
    { separator: true }, { label: "Compress & Export to Downloads…", icon: "cloud-download", run: run("file.exportDownloads") }, { label: "Export Folder to Device…", icon: "export", run: run("file.export") }, { label: "Transfer to another CodeForge…", icon: "export", run: run("file.transferOut") }, { label: "Import bundle (.cfbundle)…", icon: "package", run: run("file.transferIn") }, { label: "Close Editor", icon: "close", run: run("file.close") }, { label: "Close Folder", icon: "close-all", run: run("file.closeFolder") },
  ],
  Edit: () => [
    { label: "Undo", icon: "discard", keys: "Ctrl+Z", run: act("undo") }, { label: "Redo", icon: "redo", keys: "Ctrl+Shift+Z", run: act("redo") }, { separator: true },
    { label: "Find", icon: "search", keys: "Ctrl+F", run: act("actions.find") }, { label: "Replace", icon: "replace", keys: "Ctrl+H", run: act("editor.action.startFindReplace") },
    { separator: true }, { label: "Toggle Line Comment", icon: "comment", keys: "Ctrl+/", run: act("editor.action.commentLine") }, { label: "Format Document", icon: "list-flat", run: act("editor.action.formatDocument") },
  ],
  Selection: () => [
    { label: "Select All", keys: "Ctrl+A", run: act("editor.action.selectAll") }, { label: "Expand Selection", run: act("editor.action.smartSelect.expand") }, { label: "Shrink Selection", run: act("editor.action.smartSelect.shrink") },
    { separator: true }, { label: "Copy Line Down", run: act("editor.action.copyLinesDownAction") }, { label: "Move Line Up", run: act("editor.action.moveLinesUpAction") }, { label: "Move Line Down", run: act("editor.action.moveLinesDownAction") },
    { separator: true }, { label: "Add Cursor Below", run: act("editor.action.insertCursorBelow") }, { label: "Select All Occurrences", run: act("editor.action.selectHighlights") },
  ],
  View: () => [
    { label: "Command Palette…", icon: "terminal", keys: "Ctrl+Shift+P", run: () => cmd.palette() }, { separator: true },
    { label: "Explorer", icon: "files", run: run("view.explorer") }, { label: "Search", icon: "search", run: run("view.search") }, { label: "Source Control", icon: "source-control", run: run("view.git") },
    { label: "Extensions", icon: "extensions", run: run("view.extensions") }, { label: "AI Assistant", icon: "sparkle", run: run("view.ai") }, { separator: true },
    { label: "Toggle Sidebar", icon: "layout-sidebar-left", keys: "Ctrl+B", run: run("view.sidebar") }, { label: "Toggle Bottom Panel", icon: "layout-panel", run: run("sheet.toggleBottom") },
    { label: "Toggle Secondary Side Bar (AI Assistant)", icon: "layout-sidebar-right", run: run("sheet.toggleRight") }, { label: "Split Editor", icon: "split-horizontal", run: run("view.split") },
    { separator: true }, { label: "Word Wrap", icon: "word-wrap", run: run("view.wordWrap") }, { label: "Minimap", icon: "map", run: run("view.minimap") }, { label: "Settings", icon: "settings-gear", run: run("view.settings") },
    { label: "Storage Manager", icon: "database", run: run("storage.open") }, { label: "Background Tasks", icon: "sync", run: run("jobs.open") },
  ],
  Go: () => [
    { label: "Go to File…", icon: "go-to-file", keys: "Ctrl+P", run: run("nav.quickOpen") }, { label: "Go to Symbol…", icon: "symbol-class", run: run("nav.symbol") }, { label: "Go to Line…", icon: "arrow-right", keys: "Ctrl+G", run: run("nav.line") },
  ],
  Run: () => [
    { label: "Run File / Live Preview", icon: "play", run: run("run.file") }, { label: "Start Live Server", icon: "broadcast", run: run("run.live") }, { label: "Run npm Script…", icon: "package", run: run("run.npm") },
    { label: "Stop", icon: "debug-stop", run: run("run.stop") },
  ],
  Terminal: () => [
    { label: "New Terminal", icon: "terminal", run: run("term.new") }, { label: "New Linux Terminal", icon: "server-environment", run: run("term.linux") },
    { separator: true }, { label: "Move Terminal to Bottom", icon: "arrow-down", run: run("sheet.terminalBottom") }, { label: "Move Terminal to Right Sheet", icon: "arrow-right", run: run("sheet.terminalRight") },
    { label: "Open Terminal as Page", icon: "screen-full", run: run("sheet.terminalPage") }, { label: "Move Terminal to Top", icon: "arrow-up", run: run("sheet.terminalTop") },
  ],
  Security: () => seccenter.menuItems(run),
  Help: () => [{ label: "Crash Reports", icon: "bug", run: run("sys.crashes") }, { label: "Diagnostics", icon: "pulse", run: run("sys.diagnostics") }, { label: "Linux Environment Setup", icon: "server-environment", run: run("env.setup") }, { separator: true }, { label: "About CodeForge", icon: "info", run: run("help.about") }],
};

const MENU_ICONS = { File: "file", Edit: "edit", Selection: "selection", View: "eye", Go: "go-to-file", Run: "play", Terminal: "terminal", Security: "shield", Help: "question" };
/** Phones and narrow tablets have no menu bar: the ☰ button opens this list instead (each entry opens its menu in place). */
export function openMainMenu(x, y) {
  navMenu(Object.keys(MENUS).map((name) => ({ label: name, icon: MENU_ICONS[name], submenu: MENUS[name]() })), x, y, { title: "Menu" });
}
export const hasMenuBar = () => window.innerWidth >= 900;

export function init() {
  const bar = h("nav#menubar.desk-wide", { role: "menubar" });
  for (const name of Object.keys(MENUS)) {
    const b = h("button.mb-item", { type: "button", onclick: (e) => open(b) }, name);
    b.dataset.name = name; bar.append(b);
  }
  function open(b) {
    bar.dataset.open = b.dataset.name;
    const r = b.getBoundingClientRect();
    contextMenu(MENUS[b.dataset.name](), r.left, r.bottom + 2);
    const clear = () => { delete bar.dataset.open; document.removeEventListener("pointerdown", clear, true); };
    setTimeout(() => document.addEventListener("pointerdown", clear, true), 0);
  }
  const title = document.getElementById("titlebar");
  title.insertBefore(bar, document.getElementById("title"));
  // layout toggles (right end of the title bar)
  const mk = (id, ic, tip, fn) => { const b = h("button.tb-btn.desk.layout-t#" + id, { title: tip, onclick: fn }, icon(ic)); return b; };
  const sb = document.getElementById("sidebar");
  const bSide = mk("lt-side", "layout-sidebar-left", "Toggle Sidebar (Ctrl+B)", () => bus.emit("cmd:sidebar"));
  const bBot = mk("lt-bottom", "layout-panel", "Toggle Bottom Panel", () => cmd.run("sheet.toggleBottom"));
  const bRight = mk("lt-right", "layout-sidebar-right", "Toggle Right Sheet", () => cmd.run("sheet.toggleRight"));
  const anchor = document.getElementById("btn-account");
  title.insertBefore(bSide, anchor); title.insertBefore(bBot, anchor); title.insertBefore(bRight, anchor);
  const sync = () => {
    bSide.classList.toggle("on", !sb.classList.contains("collapsed"));
    const l = panel.layout();
    bBot.classList.toggle("on", panel.isSheetOpen("bottom")); bRight.classList.toggle("on", panel.isSheetOpen("right"));
  };
  panel.panelEvents.on("resize", sync); panel.panelEvents.on("show", sync); panel.panelEvents.on("hide", sync);
  new MutationObserver(sync).observe(sb, { attributes: true, attributeFilter: ["class"] });
  sync();
}
