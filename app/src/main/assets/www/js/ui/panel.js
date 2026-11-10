// Sheets: a TOP sheet and a BOTTOM sheet that can each hold any number of views (Terminal, Preview, Output, Problems and, if you
// want, AI Assistant / Search / Source Control / Run / Extensions). Views move between sheets from the tab menu or the "+" button;
// the layout is remembered. Old API (show / hide / toggle / pane / registerView / isOpen / active / setBadge) keeps working.
import { bus, Emitter } from "../core/events.js";
import { settings } from "../core/settings.js";
import { h, icon, isMobile } from "../core/util.js";
import { contextMenu, longPress } from "../core/ui.js";
import { makeSash } from "./sash.js";
import { crumb } from "../core/crash.js";

export const panelEvents = new Emitter();

const ITEMS = {
  terminal: { label: "Terminal", icon: "terminal" },
  preview: { label: "Preview", icon: "preview" },
  output: { label: "Output", icon: "output" },
  problems: { label: "Problems", icon: "error" },
  ai: { label: "AI Assistant", icon: "sparkle", view: true },
  search: { label: "Search", icon: "search", view: true },
  git: { label: "Source Control", icon: "source-control", view: true },
  run: { label: "Run & Preview", icon: "debug-alt", view: true },
  extensions: { label: "Extensions", icon: "extensions", view: true },
};
const BASE = ["terminal", "preview", "output", "problems"];
// top / bottom: resizable (drag the handle, the size is remembered). right: opposite the aside, fixed width. page: a full-screen page with a back button.
const IDS = ["top", "bottom", "right", "page"];
const SIZED = new Set(["top", "bottom"]);
const WHERE = { top: ["Top Sheet", "arrow-up"], bottom: ["Bottom Sheet", "arrow-down"], right: ["Right Sheet", "arrow-right"], page: ["Page", "screen-full"] };
const MIN_EDITOR = () => (isMobile() ? 90 : 120);

const sheets = {};          // id -> {id, el, tabs, actions, body, items:[], active, open, sash, cssVar, stateKey}
const views = new Map();    // name -> {onShow}
const badges = {};          // name -> badge element (re-used so counts survive a move)
let openOrder = [];         // most recently opened last (Android back button closes the latest)
let ensureBuilt = null, onDock = null, lastActive = "terminal";

export function setViewBuilder(fn) { ensureBuilt = fn; }
export function setDockHandler(fn) { onDock = fn; }

const elOf = (n) => document.getElementById((ITEMS[n].view ? "view-" : "pane-") + n);
export const sheetOf = (name) => IDS.find((id) => sheets[id]?.items.includes(name)) || null;
const wb = () => document.getElementById("workbench");

export function init() {
  for (const id of IDS) {
    const el = document.querySelector(`.sheet[data-sheet="${id}"]`);
    sheets[id] = { id, el, tabs: el.querySelector(".sheet-tabs"), actions: el.querySelector(".sheet-actions"), body: el.querySelector(".sheet-body"), items: [], active: null, open: false,
      sash: SIZED.has(id) ? document.getElementById(id === "top" ? "sash-top" : "sash-h") : null, cssVar: id === "top" ? "--top-h" : "--panel-h", stateKey: id === "top" ? "topHeight" : "panelHeight" };
    const sh = sheets[id];
    el.querySelector(".sheet-close").addEventListener("click", () => hide(id));
    el.querySelector(".sheet-max").addEventListener("click", () => { el.classList.toggle("max"); panelEvents.emit("resize"); });
    el.querySelector(".sheet-add").addEventListener("click", (e) => addMenu(id, e.clientX, e.clientY));
    el.querySelector(".sheet-more").addEventListener("click", (e) => moreMenu(id, e.clientX, e.clientY));
    new ResizeObserver(() => panelEvents.emit("resize")).observe(sh.body);
    if (id === "page") { const back = h("button.icon-btn.sheet-back", { title: "Back", onclick: () => hide("page") }, icon("arrow-left")); el.querySelector(".sheet-head").prepend(back); }
    if (id === "right") document.getElementById("right-backdrop")?.addEventListener("click", () => hide("right"));
    if (!SIZED.has(id)) continue;
    const px = settings.state[sh.stateKey]; if (px) el.style.setProperty(sh.cssVar, px + "px");
    makeSash(sh.sash, {
      axis: "y", invert: id === "bottom",
      size: () => el.getBoundingClientRect().height,
      min: () => 80, max: () => maxHeight(id),
      apply: (v) => { el.style.setProperty(sh.cssVar, v + "px"); panelEvents.emit("resize"); },
      commit: (v) => { settings.state[sh.stateKey] = Math.round(v); settings.saveState(); },
      reset: () => { el.style.removeProperty(sh.cssVar); settings.state[sh.stateKey] = 0; settings.saveState(); panelEvents.emit("resize"); },
    });
    panelEvents.on("resize", syncDual);
  }
  loadLayout();
  // The saved height (CSS var / settings) is never rewritten by a viewport change: when the soft keyboard shrinks the window the sheet is only
  // capped with max-height, and it springs back to the user's size when the keyboard closes.
  window.addEventListener("resize", clampSheets);
  if (window.visualViewport) window.visualViewport.addEventListener("resize", clampSheets);
  bus.on("panel", (n) => show(n)); bus.on("cmd:terminal", () => toggle("terminal"));
}

function clampSheets() {
  for (const id of ["top", "bottom"]) {
    const sh = sheets[id]; if (!sh) continue;
    if (!sh.open || sh.el.classList.contains("max")) { sh.el.style.removeProperty("max-height"); continue; }
    const max = maxHeight(id);
    if (max > 0) sh.el.style.maxHeight = Math.max(80, max) + "px"; else sh.el.style.removeProperty("max-height");
  }
}

/** How tall may this sheet get: leave room for the editor and for the other sheet if it is open. */
function maxHeight(id) {
  const other = sheets[id === "top" ? "bottom" : "top"];
  const otherH = other.open && !other.el.classList.contains("max") ? other.el.getBoundingClientRect().height : 0;
  return wb().getBoundingClientRect().height - MIN_EDITOR() - otherH;
}

// ---------------------------------------------------------------- layout persistence
// Default layout (like VS Code): terminal & friends in the bottom sheet, the AI Assistant in the right ("secondary side bar") sheet.
const DEFAULT_RIGHT = ["ai"];
function loadLayout() {
  let saved = settings.state.sheets || {};
  // layouts saved by older versions had nothing on the right: give the AI Assistant its place there once (it stays movable afterwards)
  // v3: every view goes back to its home once (Explorer / Search / Git / Run & Preview / Extensions in the side bar, Terminal / Preview / Output /
  // Problems in the bottom panel, AI Assistant in the right side bar). Views stay movable afterwards.
  if (saved.v !== 3) { saved = { v: 3, bottom: [...BASE], right: [...DEFAULT_RIGHT], top: [], page: [], active: {} }; settings.state.sheets = saved; }
  const seen = new Set();
  for (const id of IDS) {
    const base = id === "bottom" ? (saved.bottom || (saved.top ? [] : BASE)) : (saved[id] || []);
    sheets[id].items = base.filter((n) => ITEMS[n] && !seen.has(n) && (seen.add(n), true));
  }
  for (const n of BASE) if (!seen.has(n)) sheets.bottom.items.push(n);   // the four core panes must live somewhere
  for (const id of IDS) { sheets[id].active = saved.active?.[id] && sheets[id].items.includes(saved.active[id]) ? saved.active[id] : sheets[id].items[0] || null; }
  placeAll(); renderAllTabs();
}
const renderAllTabs = () => IDS.forEach(renderTabs);
function saveLayout() {
  const o = { v: 3, active: {} };
  for (const id of IDS) { o[id] = [...sheets[id].items]; o.active[id] = sheets[id].active; }
  settings.state.sheets = o; settings.saveState();
}

function place(name, sid) {
  const el = elOf(name); if (!el) return;
  if (sid) { el.classList.add("pane"); el.classList.remove("active"); if (ITEMS[name].view) el.classList.add("docked"); sheets[sid].body.append(el); }
  else { el.classList.remove("pane", "on", "docked"); document.getElementById("sidebar").append(el); }
}
function placeAll() {
  for (const n of Object.keys(ITEMS)) { const sid = sheetOf(n); if (sid) place(n, sid); else if (ITEMS[n].view) place(n, null); }
}

// ---------------------------------------------------------------- tabs
function badge(n) { if (!badges[n]) { badges[n] = h("span.count.hidden"); if (n === "problems") badges[n].id = "problems-count"; } return badges[n]; }
function renderTabs(sid) {
  const sh = sheets[sid];
  sh.tabs.replaceChildren(...sh.items.map((n) => {
    const b = h("button.ptab" + (n === sh.active && sh.open ? ".active" : ""), { dataset: { panel: n }, title: ITEMS[n].label, onclick: () => show(n), oncontextmenu: (e) => { e.preventDefault(); tabMenu(n, e.clientX, e.clientY); } }, ITEMS[n].label, n === "problems" || badges[n] ? badge(n) : null);
    longPress(b, (x, y) => tabMenu(n, x, y), 520);
    return b;
  }));
  sh.el.classList.toggle("empty", !sh.items.length);
}

const moveItems = (name, sid) => IDS.filter((o) => o !== sid).map((o) => ({ label: `Move “${ITEMS[name].label}” to ${WHERE[o][0]}`, icon: WHERE[o][1], run: () => { move(name, o); show(name); } }));
function tabMenu(name, x, y) {
  const sid = sheetOf(name);
  contextMenu([
    ...moveItems(name, sid),
    ...(ITEMS[name].view ? [{ label: "Move back to Sidebar", icon: "layout-sidebar-left", run: () => move(name, "sidebar") }] : []),
    { separator: true },
    { label: "Close Sheet", icon: "close", run: () => hide(sid) },
    { label: "Reset Sheets Layout", icon: "discard", run: resetLayout },
  ], x, y);
}
function addMenu(sid, x, y) {
  const here = new Set(sheets[sid].items);
  const where = (n) => { const s = sheetOf(n); return s ? "in " + WHERE[s][0].toLowerCase() : "in sidebar"; };
  contextMenu([{ label: "Add view to this sheet", disabled: true }, { separator: true }, ...Object.entries(ITEMS).filter(([n]) => !here.has(n)).map(([n, it]) => ({ label: `${it.label}  ·  ${where(n)}`, icon: it.icon, run: () => { move(n, sid); show(n); } }))], x, y);
}
function moreMenu(sid, x, y) {
  const sh = sheets[sid];
  contextMenu([
    ...(sh.active ? moveItems(sh.active, sid) : []),
    ...(SIZED.has(sid) ? [
      { label: sh.el.classList.contains("max") ? "Restore Size" : "Maximize", icon: "screen-full", run: () => { sh.el.classList.toggle("max"); panelEvents.emit("resize"); } },
      { label: "Reset Height", icon: "discard", run: () => { sh.el.style.removeProperty(sh.cssVar); settings.state[sh.stateKey] = 0; settings.saveState(); panelEvents.emit("resize"); } },
    ] : []),
    { separator: true },
    { label: "Reset Sheets Layout", icon: "layout", run: resetLayout },
    { label: "Close Sheet", icon: "close", run: () => hide(sid) },
  ], x, y);
}

// ---------------------------------------------------------------- moving views between sheets / sidebar
export function move(name, to) {
  if (!ITEMS[name]) return;
  const from = sheetOf(name);
  if (from === to || (!from && to === "sidebar")) return;
  if (to === "sidebar" && !ITEMS[name].view) return;
  crumb(`move ${name} → ${to}`);
  if (from) {
    const sh = sheets[from]; sh.items = sh.items.filter((n) => n !== name);
    const wasShown = sh.open && sh.active === name;
    elOf(name)?.classList.remove("on");
    if (sh.active === name) sh.active = sh.items[0] || null;
    if (!sh.items.length || wasShown) hide(from);      // the tab you were looking at moved away: close that sheet, it opens at the other side
    else if (sh.open) paint(from);
  }
  if (to === "sidebar") { place(name, null); onDock?.(name, "sidebar"); }
  else { sheets[to].items.push(name); place(name, to); if (!sheets[to].active) sheets[to].active = name; onDock?.(name, to); }
  renderAllTabs(); saveLayout(); panelEvents.emit("resize");
}
/** "Move to …" menu for any view, wherever it lives (sidebar views have no tab, so this is how you get them out of the sidebar). */
export function moveMenu(name, x, y) {
  if (!ITEMS[name]) return;
  const sid = sheetOf(name);
  const items = IDS.filter((o) => o !== sid).map((o) => ({ label: `Move “${ITEMS[name].label}” to ${WHERE[o][0]}`, icon: WHERE[o][1], run: () => { move(name, o); show(name); } }));
  if (ITEMS[name].view && sid) items.push({ label: "Move back to Sidebar", icon: "layout-sidebar-left", run: () => { move(name, "sidebar"); bus.emit("view", name); } });
  items.push({ separator: true }, { label: "Reset Layout (AI right, terminal bottom)", icon: "discard", run: resetLayout });
  contextMenu(items, x, y);
}
export const canMove = (name) => !!ITEMS[name];
export function resetLayout() {
  for (const n of Object.keys(ITEMS)) if (ITEMS[n].view && sheetOf(n)) place(n, null);
  for (const id of IDS) { sheets[id].items = []; sheets[id].active = null; }
  sheets.bottom.items = [...BASE]; sheets.bottom.active = "terminal";
  sheets.right.items = [...DEFAULT_RIGHT]; sheets.right.active = "ai";
  hide(); placeAll(); renderAllTabs(); saveLayout();
  for (const id of ["top", "bottom"]) { sheets[id].el.style.removeProperty(sheets[id].cssVar); settings.state[sheets[id].stateKey] = 0; }
  settings.saveState(); onDock?.("*", "reset");
}

// ---------------------------------------------------------------- show / hide
export function registerView(name, { onShow } = {}) { views.set(name, { onShow }); }

/** both sheets open → phones give each less room so the editor stays usable */
function syncDual() { document.getElementById("workbench")?.classList.toggle("dual", !!(sheets.top.open && sheets.bottom.open)); }
function paint(sid) {
  const sh = sheets[sid];
  sh.items.forEach((n) => elOf(n)?.classList.toggle("on", n === sh.active));
  sh.el.dataset.active = sh.active || "";
  sh.actions.replaceChildren();
  if (sh.active) views.get(sh.active)?.onShow?.(sh.actions);
  renderTabs(sid);
}

export function show(name = lastActive) {
  const sid = sheetOf(name); if (!sid) return false;
  const sh = sheets[sid];
  if (ITEMS[name].view && ensureBuilt) ensureBuilt(name);
  sh.active = name; lastActive = name; sh.open = true;
  sh.el.classList.remove("hidden"); sh.sash?.classList.remove("hidden");
  openOrder = openOrder.filter((s) => s !== sid); openOrder.push(sid);
  // two sheets + editor must still leave room to type
  clampSheets();
  paint(sid); saveLayout();
  crumb("sheet show " + name + " (" + sid + ")");
  panelEvents.emit("show", name); panelEvents.emit("resize");
  syncNav();
  return true;
}
/** hide("top" | "bottom" | <view name>) – no argument hides every sheet. */
export function hide(which) {
  const ids = !which ? IDS : sheets[which] ? [which] : [sheetOf(which)].filter(Boolean);
  for (const id of ids) {
    const sh = sheets[id]; if (!sh.open && sh.el.classList.contains("hidden")) continue;
    sh.open = false; sh.el.classList.add("hidden"); sh.el.classList.remove("max"); sh.sash?.classList.add("hidden");
    sh.items.forEach((n) => elOf(n)?.classList.remove("on"));
    openOrder = openOrder.filter((s) => s !== id); renderTabs(id);
  }
  panelEvents.emit("hide"); panelEvents.emit("resize"); syncNav();
}
/** Android back button: close the sheet that was opened last. */
export function closeLast() { const id = openOrder[openOrder.length - 1]; if (!id) return false; hide(id); return true; }
export function toggle(name) { if (isShown(name)) hide(name); else show(name); }
const syncNav = () => document.querySelector('#bottomnav [data-nav="terminal"]')?.classList.toggle("active", isShown("terminal"));

export const isSheetOpen = (id) => !!sheets[id]?.open;
export const isOpen = () => IDS.some((id) => sheets[id].open);
export const isShown = (name) => { const id = sheetOf(name); return !!id && sheets[id].open && sheets[id].active === name; };
export const active = () => sheets.bottom.active;
export function setBadge(name, n) { const c = badge(name); c.textContent = n; c.classList.toggle("hidden", !n); }
export function pane(name) { return elOf(name); }
export const layout = () => Object.fromEntries(IDS.map((id) => [id, [...sheets[id].items]]));
