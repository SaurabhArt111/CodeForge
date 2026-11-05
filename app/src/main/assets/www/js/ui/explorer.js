// Explorer view: lazy file tree with inline create/rename, drag & drop, clipboard, context menu and git decorations.
import { N } from "../core/bridge.js";
import { ws } from "./workspace.js";
import { settings } from "../core/settings.js";
import { bus } from "../core/events.js";
import { h, icon, P, fmtBytes, copyText, isTouch } from "../core/util.js";
import { confirm, contextMenu, longPress, prompt, toast, toastError, busy } from "../core/ui.js";
import * as icons from "../features/icons.js";

const state = { expanded: new Set(), cache: new Map(), selected: new Set(), anchor: null, clip: null, decorations: new Map(), dirDecor: new Map() };
let treeEl, headEl, bodyEl, pending = null;
export const explorer = { state, refresh, reveal, selected: () => [...state.selected], setDecorations, collapseAll, newFile: () => createEntry(targetDir(), false), newFolder: () => createEntry(targetDir(), true) };
export let handlers = {}; // set by main: openFile, openFolderDialog, openTerminalAt, preview, ...

export function init(h_) {
  handlers = h_;
  const view = document.getElementById("view-explorer");
  headEl = h("div.view-head", h("span.title", "Explorer"),
    h("button.icon-btn", { title: "New File", onclick: () => createEntry(targetDir(), false) }, icon("new-file")),
    h("button.icon-btn", { title: "New Folder", onclick: () => createEntry(targetDir(), true) }, icon("new-folder")),
    h("button.icon-btn", { title: "Refresh", onclick: () => refresh() }, icon("refresh")),
    h("button.icon-btn", { title: "Collapse All", onclick: collapseAll }, icon("collapse-all")),
    h("button.icon-btn", { title: "Open Folder…", onclick: () => handlers.openProjectMenu() }, icon("folder-opened")));
  bodyEl = h("div.view-body", { tabIndex: 0, onkeydown: onKey, oncontextmenu: (e) => { if (e.target === bodyEl || e.target === treeEl) { e.preventDefault(); rootMenu(e.clientX, e.clientY); } } });
  view.append(headEl, bodyEl);
  ws.on("root", () => { state.expanded.clear(); state.cache.clear(); state.selected.clear(); render(); });
  ws.on("changed", (dirs) => { for (const d of dirs) state.cache.delete(d); render(); });
  ws.on("renamed", (from, to) => { remap(from, to); });
  icons.iconEvents.on("change", () => render());
  settings.on("change:files.showHidden", () => refresh());
  // poll expanded folders for external changes (terminal, git, other apps)
  setInterval(pollChanges, 2500);
  render();
}

function remap(from, to) {
  const next = new Set();
  for (const p of state.expanded) next.add(P.inside(from, p) ? to + p.slice(from.length) : p);
  state.expanded = next; state.cache.clear();
}

const mtimes = new Map();
let polling = false;
async function pollChanges() {
  if (!ws.isOpen || document.hidden || polling) return;
  polling = true; try { await pollOnce(); } finally { polling = false; }
}
async function pollOnce() {
  const dirs = [ws.root, ...state.expanded].slice(0, 40); let changed = false;
  for (const d of dirs) {
    try {
      const st = await N.fs.stat(d); if (!st) { state.expanded.delete(d); changed = true; continue; }
      const prev = mtimes.get(d); mtimes.set(d, st.m);
      if (prev !== undefined && prev !== st.m) { state.cache.delete(d); changed = true; ws.invalidate(); bus.emit("fs:external", d); }
    } catch { /* ignore */ }
  }
  if (changed) render();
}

function targetDir() {
  const sel = [...state.selected][0];
  if (!sel) return ws.root;
  const hit = findNode(sel);
  return hit?.isDir ? sel : P.dir(sel);
}
function findNode(path) { const c = state.cache.get(P.dir(path)); return c?.find((n) => n.path === path) || (path === ws.root ? { path, isDir: true, n: ws.name } : null); }

async function listDir(dir) {
  if (state.cache.has(dir)) return state.cache.get(dir);
  const items = await ws.list(dir);
  state.cache.set(dir, items);
  return items;
}

export async function refresh() { state.cache.clear(); ws.invalidate(); await render(); }
function collapseAll() { state.expanded.clear(); render(); }

async function render() {
  const token = (pending = {});
  if (!ws.isOpen) { bodyEl.replaceChildren(emptyState()); setTitle(); return; }
  setTitle();
  const frag = document.createDocumentFragment();
  const rootRow = h("div.row.root.open", { onclick: () => toggleRoot(), oncontextmenu: (e) => { e.preventDefault(); rootMenu(e.clientX, e.clientY); } },
    h("span.chev", icon("chevron-right")), h("span.label", { style: { fontWeight: 600, textTransform: "uppercase", fontSize: "calc(11px * var(--fz))", letterSpacing: ".4px" } }, ws.name),
    h("span.actions", h("button.icon-btn", { title: "New File", onclick: (e) => { e.stopPropagation(); createEntry(ws.root, false); } }, icon("new-file")), h("button.icon-btn", { title: "New Folder", onclick: (e) => { e.stopPropagation(); createEntry(ws.root, true); } }, icon("new-folder"))));
  frag.append(rootRow);
  treeEl = h("div.tree");
  frag.append(treeEl);
  try { await renderDir(ws.root, 0, treeEl, token); } catch (e) { treeEl.append(h("div.empty-state", "Cannot read folder: " + e.message)); }
  if (token !== pending) return;
  bodyEl.replaceChildren(frag);
  paintDecorations();
}
function toggleRoot() { const t = treeEl.classList.toggle("hidden"); }

function setTitle() {
  const t = headEl.querySelector(".title"); t.textContent = ws.isOpen ? "Explorer" : "Explorer";
}

async function renderDir(dir, depth, parent, token) {
  const items = await listDir(dir);
  if (token !== pending) return;
  const MAX = 1500;
  for (const it of items.slice(0, MAX)) {
    if (token !== pending) return;
    const row = makeRow(it, depth);
    parent.append(row);
    if (it.isDir && state.expanded.has(it.path)) {
      row.classList.add("open");
      const sub = h("div.children"); parent.append(sub);
      await renderDir(it.path, depth + 1, sub, token);
    }
  }
  if (items.length > MAX) parent.append(h("div.row", { style: { paddingLeft: 12 + depth * 14 + "px" } }, h("span.muted", `… ${items.length - MAX} more items (use Quick Open or search)`)));
  if (!items.length && depth === 0) parent.append(h("div.empty-state", h("span", "This folder is empty."), h("button.btn.primary", { onclick: () => createEntry(ws.root, false) }, "New File")));
}

function makeRow(it, depth) {
  const open = it.isDir && state.expanded.has(it.path);
  const row = h("div.row", { dataset: { path: it.path, dir: it.isDir ? "1" : "" }, style: { paddingLeft: 6 + depth * 14 + "px" }, draggable: !isTouch() });
  row.append(h("span.chev", it.isDir ? icon("chevron-right") : null));
  row.append(it.isDir ? icons.folderIcon(it.n, open) : icons.fileIcon(it.n));
  row.append(h("span.label", it.n));
  if (it.isLink) row.append(h("span.meta", icon("link")));
  row.append(h("span.gs"));
  if (state.selected.has(it.path)) row.classList.add("selected");
  row.addEventListener("click", (e) => onRowClick(e, it, row));
  row.addEventListener("contextmenu", (e) => { e.preventDefault(); if (!state.selected.has(it.path)) { state.selected = new Set([it.path]); markSelection(); } itemMenu(it, e.clientX, e.clientY); });
  longPress(row, (x, y) => { state.selected = new Set([it.path]); markSelection(); itemMenu(it, x, y); });
  if (!isTouch()) {
    row.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/cf-path", it.path); e.dataTransfer.effectAllowed = "move"; });
    if (it.isDir) {
      row.addEventListener("dragover", (e) => { if (e.dataTransfer.types.includes("text/cf-path")) { e.preventDefault(); row.classList.add("drop"); } });
      row.addEventListener("dragleave", () => row.classList.remove("drop"));
      row.addEventListener("drop", async (e) => { e.preventDefault(); row.classList.remove("drop"); const src = e.dataTransfer.getData("text/cf-path"); if (src) try { await ws.move([src], it.path); } catch (err) { toastError(err); } });
    }
  }
  return row;
}

function onRowClick(e, it, row) {
  if (e.ctrlKey || e.metaKey) { state.selected.has(it.path) ? state.selected.delete(it.path) : state.selected.add(it.path); markSelection(); return; }
  state.selected = new Set([it.path]); state.anchor = it.path; markSelection();
  if (it.isDir) { state.expanded.has(it.path) ? state.expanded.delete(it.path) : state.expanded.add(it.path); render(); }
  else { handlers.openFile(it.path, { preview: true, focus: false }); if (window.matchMedia("(max-width:760px)").matches) bus.emit("sidebar:close"); }
}
function markSelection() { bodyEl.querySelectorAll(".row[data-path]").forEach((r) => r.classList.toggle("selected", state.selected.has(r.dataset.path))); }

export async function reveal(path) {
  if (!ws.isOpen || !P.inside(ws.root, path)) return;
  let d = P.dir(path); const chain = [];
  while (d.length >= ws.root.length && d !== ws.root) { chain.push(d); d = P.dir(d); }
  chain.forEach((c) => state.expanded.add(c));
  state.selected = new Set([path]);
  await render();
  bodyEl.querySelector(`.row[data-path="${CSS.escape(path)}"]`)?.scrollIntoView({ block: "center" });
}

function onKey(e) {
  const sel = [...state.selected][0];
  if (!sel) return;
  if (e.key === "F2") { e.preventDefault(); beginRename(sel); }
  else if (e.key === "Delete") { e.preventDefault(); deleteSelected(); }
  else if ((e.ctrlKey || e.metaKey) && e.key === "c") { state.clip = { mode: "copy", paths: [...state.selected] }; }
  else if ((e.ctrlKey || e.metaKey) && e.key === "x") { state.clip = { mode: "cut", paths: [...state.selected] }; }
  else if ((e.ctrlKey || e.metaKey) && e.key === "v") { paste(targetDir()); }
  else if (e.key === "Enter") { const n = findNode(sel); if (n && !n.isDir) handlers.openFile(sel); }
}

// ---------------------------------------------------------------- git decorations
function setDecorations(map) {
  state.decorations = map;
  state.dirDecor = new Map();
  for (const [p, s] of map) { let d = P.dir(p); while (d.length > (ws.root || "").length && d !== "/") { if (!state.dirDecor.has(d) || s === "M") state.dirDecor.set(d, "M"); d = P.dir(d); } }
  paintDecorations();
}
function paintDecorations() {
  if (!bodyEl) return;
  bodyEl.querySelectorAll(".row[data-path]").forEach((r) => {
    const p = r.dataset.path, s = state.decorations.get(p) || (r.dataset.dir ? state.dirDecor.get(p) : null);
    r.className = r.className.replace(/\bgit-\w\b/g, "").trim();
    const gs = r.querySelector(".gs");
    if (s) { r.classList.add("git-" + s); if (gs) gs.textContent = r.dataset.dir ? "●" : s; } else if (gs) gs.textContent = "";
  });
}

// ---------------------------------------------------------------- inline create / rename
function inlineInput(parentEl, depth, initial, iconEl, onDone) {
  const input = h("input.inline", { type: "text", value: initial, spellcheck: false, autocapitalize: "off" });
  const row = h("div.row", { style: { paddingLeft: 6 + depth * 14 + "px" } }, h("span.chev"), iconEl, input);
  let finished = false;
  const finish = (commit) => { if (finished) return; finished = true; const v = input.value.trim(); row.remove(); onDone(commit ? v : null); };
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); finish(true); } else if (e.key === "Escape") { e.preventDefault(); finish(false); } e.stopPropagation(); });
  input.addEventListener("blur", () => finish(!!input.value.trim() && !isTouch() ? false : !!input.value.trim()));
  return { row, input };
}

async function createEntry(dir, isFolder) {
  if (!ws.isOpen) return handlers.openProjectMenu();
  if (dir !== ws.root) { state.expanded.add(dir); await render(); }
  const depth = dir === ws.root ? 0 : P.rel(ws.root, dir).split("/").length;
  let host = treeEl;
  if (dir !== ws.root) { const r = bodyEl.querySelector(`.row[data-path="${CSS.escape(dir)}"]`); host = r?.nextElementSibling?.classList.contains("children") ? r.nextElementSibling : treeEl; }
  const { row, input } = inlineInput(host, depth, "", isFolder ? icons.folderIcon("", false) : icons.fileIcon("x.txt"), async (name) => {
    if (!name) return;
    const err = ws.validName(name); if (err) return toast(err, "error");
    try {
      if (isFolder) { await ws.createFolder(dir, name); }
      else { const p = await ws.createFile(dir, name.replace(/^\//, "")); handlers.openFile(p); }
    } catch (e) { toastError(e); }
  });
  host.prepend(row); row.scrollIntoView({ block: "nearest" }); setTimeout(() => input.focus(), 30);
}

function beginRename(path) {
  const r = bodyEl.querySelector(`.row[data-path="${CSS.escape(path)}"]`); if (!r) return;
  const name = P.base(path); const label = r.querySelector(".label");
  const input = h("input.inline", { type: "text", value: name, spellcheck: false, autocapitalize: "off" });
  label.replaceWith(input); input.focus();
  const dot = name.lastIndexOf("."); input.setSelectionRange(0, dot > 0 && r.dataset.dir !== "1" ? dot : name.length);
  let done = false;
  const finish = async (commit) => {
    if (done) return; done = true; const v = input.value.trim();
    if (commit && v && v !== name) { const err = ws.validName(v); if (err) toast(err, "error"); else try { await ws.rename(path, v); } catch (e) { toastError(e); } }
    render();
  };
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); finish(true); } else if (e.key === "Escape") finish(false); e.stopPropagation(); });
  input.addEventListener("blur", () => finish(true));
  input.addEventListener("click", (e) => e.stopPropagation());
}

async function deleteSelected() {
  const paths = [...state.selected]; if (!paths.length) return;
  const label = paths.length === 1 ? `"${P.base(paths[0])}"` : `${paths.length} items`;
  if (settings.get("files.confirmDelete") && !(await confirm(`Delete ${label}? This cannot be undone.`, { title: "Delete", okLabel: "Delete", danger: true }))) return;
  try { await ws.remove(paths); state.selected.clear(); } catch (e) { toastError(e); }
}

async function paste(dir) {
  const c = state.clip; if (!c) return;
  try {
    if (c.mode === "cut") { await ws.move(c.paths, dir); state.clip = null; } else await ws.copy(c.paths, dir);
    state.expanded.add(dir); render();
  } catch (e) { toastError(e); }
}

// ---------------------------------------------------------------- menus
function emptyState() {
  return h("div.empty-state",
    h("div", { style: { color: "var(--fg)", fontWeight: 600, fontSize: "calc(14px * var(--fz))" } }, "No folder opened"),
    h("div", "Open a project folder to start coding — like VS Code, with a real file system."),
    h("button.btn.primary.block", { onclick: () => handlers.openProjectMenu() }, icon("folder-opened"), "Open Folder…"),
    h("button.btn.block", { onclick: () => handlers.openZip() }, icon("file-zip"), "Open ZIP Project…"),
    h("button.btn.block", { onclick: () => handlers.cloneRepo() }, icon("repo-clone"), "Clone Repository…"),
    h("button.btn.block", { onclick: () => handlers.newProject() }, icon("new-folder"), "New Project…"),
    settings.state.recent.length ? h("div", { style: { marginTop: "8px" } }, h("div.section-title", { style: { padding: "6px 0" } }, "Recent"), ...settings.state.recent.slice(0, 6).map((p) => h("div.row", { style: { paddingLeft: "0" }, onclick: () => handlers.openFolder(p) }, icons.folderIcon(P.base(p), false), h("span.label", P.base(p)), h("span.meta", P.dir(p).replace(/^.*\/files\//, "~/"))))) : null);
}

function rootMenu(x, y) {
  if (!ws.isOpen) return;
  contextMenu([
    { label: "New File", icon: "new-file", run: () => createEntry(ws.root, false) }, { label: "New Folder", icon: "new-folder", run: () => createEntry(ws.root, true) },
    { label: "Paste", icon: "clippy", disabled: !state.clip, run: () => paste(ws.root) }, { separator: true },
    { label: "Open in Terminal", icon: "terminal", run: () => handlers.openTerminalAt(ws.root) },
    { label: "Live Server here", icon: "broadcast", run: () => handlers.liveServe(ws.root) },
    { label: "Compress to ZIP", icon: "file-zip", run: () => zipPaths([ws.root]) }, { separator: true },
    { label: "Copy Path", icon: "copy", run: () => copyText(ws.root) }, { label: "Refresh", icon: "refresh", run: refresh }, { label: "Close Folder", icon: "close", run: () => handlers.closeFolder() },
  ], x, y);
}

async function zipPaths(paths) {
  const base = paths.length === 1 ? P.base(paths[0]) : "archive";
  const name = await prompt("Compress to ZIP", { value: base + ".zip", okLabel: "Compress" }); if (!name) return;
  const dest = P.join(P.dir(paths[0]), name);
  const b = busy("Compressing…");
  try { const r = await ws.zip(paths, dest); toast(`Created ${name} (${r.count} files)`, "success"); } catch (e) { toastError(e); } finally { b.close(); }
}

function itemMenu(it, x, y) {
  const paths = [...state.selected]; const multi = paths.length > 1;
  const isZip = /\.(zip|vsix)$/i.test(it.n), isTar = /\.(tar|tar\.gz|tgz)$/i.test(it.n);
  const dir = it.isDir ? it.path : P.dir(it.path);
  const items = [];
  if (!it.isDir && !multi) items.push({ label: "Open", icon: "go-to-file", run: () => handlers.openFile(it.path) }, { label: "Open to the Side", icon: "split-horizontal", run: () => handlers.openFile(it.path, { group: 1 }) });
  if (!it.isDir && !multi && /\.(html?|svg)$/i.test(it.n)) items.push({ label: "Preview in App (Live)", icon: "browser", run: () => handlers.livePreview(it.path) });
  if (!it.isDir && !multi && /\.(md|markdown)$/i.test(it.n)) items.push({ label: "Markdown Preview", icon: "open-preview", run: () => handlers.markdownPreview(it.path) });
  if (!it.isDir && !multi && /\.(js|mjs|cjs|py|sh|ts|rb|php|go|java|kt)$/i.test(it.n)) items.push({ label: "Run File", icon: "play", run: () => handlers.runFile(it.path) });
  if (items.length) items.push({ separator: true });
  items.push({ label: "New File", icon: "new-file", run: () => createEntry(dir, false) }, { label: "New Folder", icon: "new-folder", run: () => createEntry(dir, true) }, { separator: true });
  if (it.isDir && !multi) items.push({ label: "Open in Terminal", icon: "terminal", run: () => handlers.openTerminalAt(it.path) }, { label: "Live Server here", icon: "broadcast", run: () => handlers.liveServe(it.path) }, { label: "Open as Project", icon: "folder-opened", run: () => handlers.openFolder(it.path) }, { separator: true });
  items.push(
    { label: "Cut", icon: "scissors", keys: "Ctrl+X", run: () => { state.clip = { mode: "cut", paths }; toast("Cut — paste into a folder", { timeout: 1500 }); } },
    { label: "Copy", icon: "copy", keys: "Ctrl+C", run: () => { state.clip = { mode: "copy", paths }; toast("Copied — paste into a folder", { timeout: 1500 }); } },
    { label: "Paste", icon: "clippy", keys: "Ctrl+V", disabled: !state.clip, run: () => paste(dir) }, { separator: true },
    { label: "Compress to ZIP", icon: "file-zip", run: () => zipPaths(paths) });
  if ((isZip || isTar) && !multi) items.push({ label: "Extract Here", icon: "package", run: () => extractHere(it.path, false) }, { label: "Extract to Folder", icon: "package", run: () => extractHere(it.path, true) }, { label: "Open Extracted as Project", icon: "folder-opened", run: () => handlers.openArchiveAsProject(it.path) });
  items.push({ separator: true });
  if (!it.isDir && !multi) items.push({ label: "Share…", icon: "export", run: () => N.sys.share({ path: it.path }) }, { label: "Export to Device…", icon: "cloud-download", run: () => handlers.exportFile(it.path) });
  items.push({ label: "Copy Path", icon: "copy", run: () => copyText(it.path) }, { label: "Copy Relative Path", icon: "copy", run: () => copyText(P.rel(ws.root, it.path)) });
  if (!multi) items.push({ label: "Rename…", icon: "edit", keys: "F2", run: () => beginRename(it.path) }, { label: "Duplicate", icon: "files", run: async () => { try { await ws.copy([it.path], P.dir(it.path)); } catch (e) { toastError(e); } } });
  items.push({ label: "Delete", icon: "trash", danger: true, keys: "Del", run: deleteSelected });
  if (!multi) items.push({ separator: true }, { label: "Properties", icon: "info", run: () => showProps(it) });
  contextMenu(items, x, y);
}

async function extractHere(zipPath, toFolder) {
  const dest = toFolder ? P.join(P.dir(zipPath), await ws.uniqueName(P.dir(zipPath), P.stem(zipPath).replace(/\.tar$/, ""))) : P.dir(zipPath);
  const b = busy("Extracting…");
  try { const r = await ws.extractArchive(zipPath, dest); toast(`Extracted${r.count ? " " + r.count + " files" : ""}`, "success"); } catch (e) { toastError(e); } finally { b.close(); }
}

async function showProps(it) {
  const st = await N.fs.lstat(it.path);
  const { modal } = await import("../core/ui.js");
  const rows = [["Name", it.n], ["Path", it.path], ["Type", it.isDir ? "Folder" : it.isLink ? "Symbolic link" : "File"], ["Size", st ? fmtBytes(st.s) : ""], ["Modified", st ? new Date(st.m).toLocaleString() : ""], ["Permissions", st ? (st.p & 0o777).toString(8).padStart(3, "0") : ""]];
  modal({ title: "Properties", body: h("div.selectable", { style: { display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 14px", wordBreak: "break-all" } }, rows.flatMap(([k, v]) => [h("span.muted", k), h("span", v)])), buttons: [{ label: "Close", primary: true }] });
}
