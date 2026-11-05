// Top sheet (pull-down quick actions) and the "add to bottom sheet" menu.
//  - Top sheet: tiles the user can add / edit / remove (IDE command, shell command, URL, file, text snippet), quick toggles,
//    status chips. Open it with the ⌄ button, by pulling the title bar down, or with the "Toggle Top Sheet" command.
//  - Bottom sheet (the panel): "+" adds panes — a button grid of your own commands, a notes scratchpad, or a pinned web page.
// Everything is stored in settings.state.sheets so it survives restarts.
import { N } from "../core/bridge.js";
import { settings } from "../core/settings.js";
import { bus } from "../core/events.js";
import { h, icon, P, isMobile, uid, debounce, copyText } from "../core/util.js";
import { toast, toastError, quickPick, prompt, contextMenu, confirm, longPress } from "../core/ui.js";
import { openUrl, isLocal, openInPreview } from "../core/links.js";
import * as panel from "./panel.js";

let A, top, backdrop, grid, chipsEl, togglesEl, editing = false, awake = false, offScale = null;

const DEFAULT_TILES = [
  { label: "Run", icon: "play", kind: "cmd", value: "run.file" },
  { label: "Live preview", icon: "preview", kind: "cmd", value: "run.livefile" },
  { label: "Live server", icon: "broadcast", kind: "cmd", value: "run.live" },
  { label: "Terminal", icon: "terminal", kind: "cmd", value: "view.terminal" },
  { label: "Save all", icon: "save-all", kind: "cmd", value: "file.saveAll" },
  { label: "Search", icon: "search", kind: "cmd", value: "view.search" },
  { label: "AI", icon: "sparkle", kind: "cmd", value: "view.ai" },
  { label: "Git", icon: "source-control", kind: "cmd", value: "view.git" },
  { label: "Commands", icon: "terminal-cmd", kind: "cmd", value: "__palette" },
  { label: "Settings", icon: "settings-gear", kind: "cmd", value: "view.settings" },
  { label: "Crash reports", icon: "bug", kind: "cmd", value: "sys.crashes" },
  { label: "Reload", icon: "refresh", kind: "cmd", value: "sys.reload" },
];
const ICONS = ["play", "terminal", "rocket", "globe", "bug", "beaker", "package", "git-commit", "cloud-upload", "tools", "zap", "star", "save", "refresh", "folder-opened", "link-external", "debug-alt", "server", "database", "symbol-event", "checklist", "pencil", "browser", "sparkle"];
const KINDS = [
  { id: "cmd", label: "IDE command", description: "Any command from the palette", icon: "terminal-cmd" },
  { id: "shell", label: "Shell command", description: "Runs in a new terminal, in the project folder", icon: "terminal" },
  { id: "url", label: "Web address / port", description: "Open a URL (or a local port) in the preview or browser", icon: "globe" },
  { id: "file", label: "File", description: "Open a file from the project", icon: "file" },
  { id: "text", label: "Text snippet", description: "Types text into the editor or terminal", icon: "symbol-snippet" },
];

const store = () => (settings.state.sheets ||= { tiles: null, panes: [] });
const save = () => settings.saveState();
const tiles = () => (store().tiles ||= DEFAULT_TILES.map((t) => ({ ...t, id: uid() })));

export function init(api) {
  A = api;
  const app = document.getElementById("app");
  backdrop = h("div#topsheet-backdrop", { onclick: close });
  chipsEl = h("div.ts-chips"); togglesEl = h("div.ts-toggles"); grid = h("div.ts-grid");
  const editBtn = h("button.icon-btn", { title: "Edit tiles", onclick: () => { editing = !editing; renderGrid(); editBtn.classList.toggle("on", editing); } }, icon("edit"));
  const grip = h("div.ts-grip", icon("chevron-up"));
  top = h("div#topsheet", { role: "dialog", "aria-label": "Quick actions" },
    h("div.ts-card",
      h("div.ts-head", h("h4", "Quick actions"), editBtn, h("button.icon-btn", { title: "Close", onclick: close }, icon("close"))),
      chipsEl, togglesEl, grid),
    grip);
  app.append(backdrop, top);
  // swipe up on the grip / card edge closes
  swipe(grip, { dir: "up", onDone: close });
  // pull the title bar down to open
  swipe(document.getElementById("titlebar"), { dir: "down", onDone: open, threshold: 34, swallowClick: true });
  document.getElementById("btn-sheet")?.addEventListener("click", toggle);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && isOpen()) { close(); e.stopPropagation(); } }, true);
  bus.on("cmd:topsheet", toggle);
  A.cmd.register({ id: "view.topsheet", title: "Toggle Top Sheet (quick actions)", category: "View", icon: "chevron-down", run: toggle });
  A.cmd.register({ id: "sheet.addTile", title: "Add Tile to Top Sheet…", category: "View", run: async () => { await addTile(tiles()); renderGrid(); } });
  A.cmd.register({ id: "sheet.addPane", title: "Add Pane to Bottom Sheet…", category: "View", run: () => addMenu(innerWidth / 2, innerHeight / 2) });
  A.cmd.register({ id: "sheet.reset", title: "Reset Top / Bottom Sheet Items", category: "View", run: resetAll });
  // bottom sheet "+" and saved panes
  document.getElementById("panel-add")?.addEventListener("click", (e) => { const r = e.currentTarget.getBoundingClientRect(); addMenu(r.left, r.bottom + 4); });
  for (const p of store().panes) mountPane(p);
  renderGrid();
}

export const isOpen = () => top?.classList.contains("open");
export function open() { editing = false; renderChips(); renderToggles(); renderGrid(); top.classList.add("open"); backdrop.classList.add("on"); document.getElementById("btn-sheet")?.classList.add("on"); }
export function close() { editing = false; top.classList.remove("open"); backdrop.classList.remove("on"); document.getElementById("btn-sheet")?.classList.remove("on"); }
export const toggle = () => (isOpen() ? close() : open());

/** pointer swipe helper; does not interfere with plain taps */
function swipe(el, { dir, onDone, threshold = 28, swallowClick = false }) {
  let id = null, x0 = 0, y0 = 0, hit = false, swallow = false;
  el.addEventListener("pointerdown", (e) => { if (e.button > 0 || (e.pointerType === "mouse")) return; id = e.pointerId; x0 = e.clientX; y0 = e.clientY; hit = false; });
  el.addEventListener("pointermove", (e) => {
    if (e.pointerId !== id || hit) return;
    const dy = e.clientY - y0, dx = e.clientX - x0;
    if ((dir === "down" ? dy : -dy) > threshold && Math.abs(dx) < Math.abs(dy) * 0.8) { hit = true; swallow = true; navigator.vibrate?.(8); onDone(); }
  });
  for (const ev of ["pointerup", "pointercancel"]) el.addEventListener(ev, () => { id = null; });
  if (swallowClick) el.addEventListener("click", (e) => { if (swallow) { e.stopPropagation(); e.preventDefault(); swallow = false; } }, true);
  el.addEventListener("touchmove", (e) => { if (hit) e.preventDefault(); }, { passive: false });
}

// ---------------------------------------------------------------- tiles
export async function runTile(t) {
  try {
    switch (t.kind) {
      case "cmd": if (t.value === "__palette") A.cmd.palette(); else A.cmd.run(t.value); break;
      case "shell": await A.term.run(t.value, { cwd: A.ws.isOpen ? A.ws.root : undefined, title: t.label, reuse: false }); break;
      case "url": {
        let u = String(t.value).trim();
        if (/^\d{2,5}$/.test(u)) u = `http://127.0.0.1:${u}/`; else if (!/^[a-z]+:\/\//i.test(u)) u = (/^(localhost|127\.|\d+\.\d+\.\d+\.\d+)/.test(u) ? "http://" : "https://") + u;
        if (isLocal(u)) openInPreview(u); else openUrl(u);
        break;
      }
      case "file": { const f = t.value.startsWith("/") ? t.value : A.ws.isOpen ? P.join(A.ws.root, t.value) : t.value; if (!(await N.fs.exists(f))) return toast(`File not found: ${f}`, { kind: "error" }); A.ed.openFile(f); break; }
      case "text": {
        const termFocused = document.activeElement?.closest?.(".xterm") && panel.isOpen() && panel.active() === "terminal";
        if (termFocused) A.term.write(t.value); else { const e = A.ed.activeEditor(); if (!e) return toast("Open a file first"); e.focus(); e.trigger("keyboard", "type", { text: t.value }); }
        break;
      }
    }
  } catch (e) { toastError(e); }
}

function tileEl(t, list, { afterChange, closeSheet = false } = {}) {
  const el = h("button.ts-tile", { title: t.kind === "cmd" ? t.value : t.value, onclick: () => { if (editing) return editTile(t, afterChange); if (closeSheet) close(); runTile(t); } },
    h("span.rm", { title: "Remove", onclick: (e) => { e.stopPropagation(); remove(t, list, afterChange); } }, icon("close")), icon(t.icon || "play"), h("span.lbl", t.label));
  const menu = (x, y) => contextMenu([
    { label: "Edit…", icon: "edit", run: () => editTile(t, afterChange) },
    { label: "Move earlier", icon: "arrow-left", run: () => move(t, list, -1, afterChange) }, { label: "Move later", icon: "arrow-right", run: () => move(t, list, 1, afterChange) },
    { separator: true }, { label: "Remove", icon: "trash", danger: true, run: () => remove(t, list, afterChange) },
  ], x, y);
  longPress(el, menu); el.addEventListener("contextmenu", (e) => { e.preventDefault(); menu(e.clientX, e.clientY); });
  return el;
}
function remove(t, list, after) { const i = list.indexOf(t); if (i >= 0) list.splice(i, 1); save(); after?.(); }
function move(t, list, d, after) { const i = list.indexOf(t), j = i + d; if (i < 0 || j < 0 || j >= list.length) return; [list[i], list[j]] = [list[j], list[i]]; save(); after?.(); }

async function pickIcon(cur) {
  const r = await quickPick(ICONS.map((n) => ({ label: n, icon: n, value: n })), { placeholder: "Choose an icon", initial: "" });
  return r || cur || "play";
}
async function askValue(kind, cur = "") {
  switch (kind) {
    case "cmd": {
      const items = A.cmd.list().filter((c) => !c.when || c.when()).map((c) => ({ label: (c.category ? c.category + ": " : "") + c.title, value: c.id, icon: c.icon })).sort((a, b) => a.label.localeCompare(b.label));
      items.unshift({ label: "Command Palette", value: "__palette", icon: "terminal-cmd" });
      return quickPick(items, { placeholder: "Pick a command" });
    }
    case "shell": return prompt("Shell command", { value: cur, placeholder: "npm run dev", message: "Runs in a new terminal, in the project folder." });
    case "url": return prompt("Web address or port", { value: cur, placeholder: "3000  or  https://example.com", message: "Local addresses open in the in-app preview." });
    case "file": return prompt("File path", { value: cur, placeholder: "src/index.js  (relative to the project)" });
    case "text": return prompt("Text to type", { value: cur, placeholder: "console.log()" });
  }
}
async function addTile(list, after) {
  const kind = await quickPick(KINDS.map((k) => ({ label: k.label, description: k.description, icon: k.icon, value: k.id })), { placeholder: "What should the tile do?" });
  if (!kind) return;
  const value = await askValue(kind); if (!value) return;
  const def = kind === "cmd" ? (A.cmd.list().find((c) => c.id === value)?.title || "Commands") : kind === "file" ? P.base(value) : String(value).slice(0, 14);
  const label = await prompt("Tile name", { value: def }); if (!label) return;
  const ic = await pickIcon(KINDS.find((k) => k.id === kind).icon);
  list.push({ id: uid(), label: label.trim().slice(0, 24), icon: ic, kind, value }); save(); after?.();
}
async function editTile(t, after) {
  const label = await prompt("Tile name", { value: t.label }); if (label == null) return;
  const value = t.value === "__palette" ? t.value : await askValue(t.kind, t.value); if (value == null) return;
  const ic = await pickIcon(t.icon);
  Object.assign(t, { label: label.trim().slice(0, 24) || t.label, value: value || t.value, icon: ic }); save(); after?.() ?? renderGrid();
}

function renderGrid() {
  if (!grid) return;
  grid.classList.toggle("editing", editing);
  grid.replaceChildren(...tiles().map((t) => tileEl(t, tiles(), { afterChange: renderGrid, closeSheet: true })),
    h("button.ts-tile.add", { onclick: async () => { await addTile(tiles(), renderGrid); } }, icon("add"), h("span.lbl", "Add")));
}

// ---------------------------------------------------------------- toggles + chips
function renderChips() {
  const chip = (ic, text, fn) => h("button.chip.ts-chip", { onclick: fn }, icon(ic), " " + text);
  import("../features/live.js").then((live) => {
    const servers = live.list();
    chipsEl.replaceChildren(
      chip("folder", A.ws.isOpen ? A.ws.name : "No folder", () => { close(); A.of.chooseProject({ openFolder: A.openFolder }); }),
      chip("terminal", `${A.term.list().length} terminal${A.term.list().length === 1 ? "" : "s"}`, () => { close(); panel.show("terminal"); }),
      ...(servers.length ? [chip("broadcast", `Live :${servers[0].port}${servers.length > 1 ? ` +${servers.length - 1}` : ""}`, () => { close(); live.openPreview(servers[0].url); })] : []));
  }).catch(() => {});
}
function renderToggles() {
  const tg = (ic, label, get, set) => { const b = h("button.ts-tg" + (get() ? ".on" : ""), { onclick: () => { set(); b.classList.toggle("on", !!get()); } }, icon(ic), h("span", label)); return b; };
  const step = (d) => () => A.cmd.run(d > 0 ? "view.zoomIn" : "view.zoomOut");
  const size = h("span.ts-val", settings.get("ui.fontScale") + "%");
  offScale?.(); offScale = settings.on("change:ui.fontScale", (v) => { size.textContent = v + "%"; });
  togglesEl.replaceChildren(
    tg("word-wrap", "Word wrap", () => settings.get("editor.wordWrap") !== "off", () => settings.set("editor.wordWrap", settings.get("editor.wordWrap") === "off" ? "on" : "off")),
    tg("save", "Auto save", () => settings.get("files.autoSave") !== "off", () => settings.set("files.autoSave", settings.get("files.autoSave") === "off" ? "afterDelay" : "off")),
    tg("keyboard", "Key bar", () => settings.get("ui.mobileKeyBar"), () => settings.set("ui.mobileKeyBar", !settings.get("ui.mobileKeyBar"))),
    tg("eye", "Keep awake", () => awake, () => { awake = !awake; N.sys.keepAwake(awake).catch(() => {}); }),
    h("div.ts-tg.step", icon("text-size"), h("button.icon-btn", { onclick: step(-1) }, icon("remove")), size, h("button.icon-btn", { onclick: step(1) }, icon("add"))));
}

// ---------------------------------------------------------------- bottom sheet: add panes
function addMenu(x, y) {
  contextMenu([
    { label: "New terminal", icon: "terminal", run: () => { A.term.create(); } },
    { separator: true },
    { label: "Add command buttons pane", icon: "symbol-event", run: () => newPane("commands") },
    { label: "Add notes pane", icon: "note", run: () => newPane("notes") },
    { label: "Add web page pane…", icon: "globe", run: () => newPane("web") },
    { separator: true },
    { label: "Add tile to top sheet…", icon: "add", run: async () => { await addTile(tiles()); toast("Added to the top sheet", { kind: "success" }); } },
  ], x, y);
}
async function newPane(type) {
  const p = { id: "x" + uid(), type, title: type === "commands" ? "Actions" : type === "notes" ? "Notes" : "Web", data: {} };
  if (type === "web") { const u = await prompt("Page to pin", { placeholder: "https://developer.mozilla.org", message: "Some sites refuse to be shown inside other apps; use the browser button then." }); if (!u) return; p.data.url = /^https?:\/\//i.test(u) ? u : "https://" + u; try { p.title = new URL(p.data.url).hostname.replace(/^www\./, "").slice(0, 16); } catch { /* keep */ } }
  if (type === "commands") p.data.tiles = [];
  store().panes.push(p); save(); mountPane(p); panel.show("x-" + p.id);
}
function paneMenu(p) {
  return (e) => contextMenu([
    { label: "Rename…", icon: "edit", run: async () => { const t = await prompt("Pane name", { value: p.title }); if (t) { p.title = t.slice(0, 18); save(); panel.renameTab("x-" + p.id, p.title); } } },
    { label: "Remove pane", icon: "trash", danger: true, run: async () => { if (await confirm(`Remove “${p.title}”?`, { okLabel: "Remove", danger: true })) { panel.removeTab("x-" + p.id); const s = store(); s.panes = s.panes.filter((q) => q !== p); save(); } } },
  ], e.clientX ?? 40, e.clientY ?? innerHeight - 200);
}
function mountPane(p) {
  const name = "x-" + p.id;
  const ic = p.type === "commands" ? "symbol-event" : p.type === "notes" ? "note" : "globe";
  const body = panel.addTab(name, p.title, { iconName: ic, onContext: paneMenu(p), onShow: (actions) => PANES[p.type](p, body, actions) });
  body.dataset.type = p.type;
}
const PANES = {
  commands(p, body, actions) {
    let edit = false;
    const list = (p.data.tiles ||= []);
    const render = () => {
      body.replaceChildren(h("div.pn-cmds" + (edit ? ".editing" : ""),
        h("div.ts-grid" + (edit ? ".editing" : ""), ...list.map((t) => tileEl(Object.assign(t, { id: t.id || uid() }), list, { afterChange: render })),
          h("button.ts-tile.add", { onclick: async () => { await addTile(list, render); } }, icon("add"), h("span.lbl", "Add"))),
        list.length ? null : h("div.muted", { style: { padding: "10px 4px" } }, "Add buttons for the commands you use most — npm scripts, git, deploys, URLs.")));
    };
    // the tile click handler checks the module-level `editing` flag: share it with this pane's edit toggle
    const eb = h("button.icon-btn", { title: "Edit buttons", onclick: () => { edit = editing = !edit; eb.classList.toggle("on", edit); render(); } }, icon("edit"));
    actions.append(eb); editing = false; render();
  },
  notes(p, body, actions) {
    const ta = h("textarea.pn-notes", { placeholder: "Scratchpad — notes, TODOs, snippets. Saved automatically.", value: p.data.text || "", spellcheck: false, oninput: debounce(() => { p.data.text = ta.value; save(); }, 400) });
    body.replaceChildren(ta);
    actions.append(
      h("button.icon-btn", { title: "Copy all", onclick: () => { copyText(ta.value); toast("Copied"); } }, icon("copy")),
      h("button.icon-btn", { title: "Insert into editor", onclick: () => { const e = A.ed.activeEditor(); if (!e) return toast("Open a file first"); e.focus(); e.trigger("keyboard", "type", { text: ta.value }); } }, icon("insert")),
      h("button.icon-btn", { title: "Clear", onclick: async () => { if (ta.value && !(await confirm("Clear these notes?", { okLabel: "Clear", danger: true }))) return; ta.value = ""; p.data.text = ""; save(); } }, icon("clear-all")));
  },
  web(p, body, actions) {
    if (body.dataset.ready) { actions.append(h("button.icon-btn", { title: "Open in browser", onclick: () => openUrl(p.data.url) }, icon("link-external"))); return; }
    body.dataset.ready = "1";
    const frame = h("iframe.pn-web", { src: p.data.url, sandbox: "allow-scripts allow-same-origin allow-forms allow-popups allow-modals", referrerpolicy: "no-referrer" });
    const url = h("input.input", { value: p.data.url, spellcheck: false, autocapitalize: "off", onkeydown: (e) => { if (e.key === "Enter") { let u = url.value.trim(); if (!/^https?:\/\//i.test(u)) u = "https://" + u; try { if (new URL(u).origin === location.origin) return toast("Refusing to open the IDE inside itself", { kind: "error" }); } catch { return; } p.data.url = u; save(); frame.src = u; } } });
    body.replaceChildren(h("div.pn-webbar", h("button.icon-btn", { title: "Reload", onclick: () => { frame.src = p.data.url; } }, icon("refresh")), url), frame,
      h("div.pn-webhint.muted", "If the page stays blank the site does not allow embedding — use “Open in browser”."));
    actions.append(h("button.icon-btn", { title: "Open in browser", onclick: () => openUrl(p.data.url) }, icon("link-external")));
  },
};

async function resetAll() {
  if (!(await confirm("Restore the default top-sheet tiles and remove added bottom-sheet panes?", { okLabel: "Reset", danger: true }))) return;
  for (const p of store().panes) panel.removeTab("x-" + p.id);
  settings.state.sheets = { tiles: null, panes: [] }; save(); renderGrid(); toast("Sheets reset", { kind: "success" });
}
