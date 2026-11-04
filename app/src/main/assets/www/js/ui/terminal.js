// Terminal: xterm.js over native PTY sessions (host shell or proot Alpine), tabs, OSC-7770 "code" command, URL/port detection.
import { N } from "../core/bridge.js";
import { settings } from "../core/settings.js";
import { bus } from "../core/events.js";
import { h, icon, P, b64ToBytes, strToB64, shellQuote } from "../core/util.js";
import { contextMenu, toast, toastError, longPress } from "../core/ui.js";
import * as themes from "../features/themes.js";
import * as panel from "./panel.js";
import { ws } from "./workspace.js";
import { openUrl, openInBrowser, openInPreview, urlAt, isUrl, isLocal } from "../core/links.js";
import { showLinkChip, hideLinkChip } from "./linkchip.js";

const terms = new Map(); // id -> T
let activeId = null, bar, bodies, tabsEl;
const mods = { ctrl: false, alt: false, shift: false };
export const modifiers = mods;
let ptyResizeTimer, creating = 0;

export function init() {
  const pane = panel.pane("terminal");
  tabsEl = h("div.term-tabs");
  bar = h("div.term-bar", tabsEl,
    h("button.icon-btn", { title: "New Terminal", onclick: () => create() }, icon("add")),
    h("button.icon-btn", { title: "Terminal profiles", onclick: (e) => profileMenu(e.clientX, e.clientY) }, icon("chevron-down")),
    h("button.icon-btn", { title: "Clear", onclick: () => get()?.xt.clear() }, icon("clear-all")),
    h("button.icon-btn", { title: "Kill terminal", onclick: () => killActive() }, icon("trash")));
  bodies = h("div.term-bodies");
  pane.append(bar, bodies);
  panel.registerView("terminal", { onShow: () => { if (!terms.size && !creating) create(); else fitAll(); setTimeout(() => get()?.xt.focus(), 50); } });
  panel.panelEvents.on("resize", () => { clearTimeout(ptyResizeTimer); ptyResizeTimer = setTimeout(fitAll, 60); });
  N.on("term.data", (d) => { const t = terms.get(d.id); if (t) { const bytes = b64ToBytes(d.b64); t.xt.write(bytes); scanOutput(t, bytes); } });
  N.on("term.exit", (d) => { const t = terms.get(d.id); if (!t) return; t.alive = false; t.xt.write(`\r\n\x1b[2m[Process exited with code ${d.code}]  press any key to close\x1b[0m\r\n`); refreshTabs(); t.onExit?.(d.code); });
  // xterm measures glyph cells once: if the web font arrives later the rows overlap. Re-measure when fonts are ready.
  try { document.fonts.load(`14px "${settings.get("terminal.fontFamily")}"`).then(() => document.fonts.ready).then(() => applyTheme()); } catch { /* ignore */ }
  themes.themeEvents.on("change", applyTheme);
  settings.on("change", (k) => { if (k.startsWith("terminal.")) applyTheme(); });
  bus.on("terminal:at", (dir) => create({ cwd: dir }));
  restore();
}

async function restore() {
  try {
    const list = await N.term.list();
    for (const s of list) { if (!s.alive) { N.term.close(s.id); continue; } await adopt(s); }
  } catch { /* ignore */ }
}

function xtermOptions() {
  return { fontFamily: `"${settings.get("terminal.fontFamily")}", var(--mono), monospace`, fontSize: settings.get("terminal.fontSize"), lineHeight: settings.get("terminal.lineHeight"), letterSpacing: settings.get("terminal.letterSpacing"), fontWeight: "400", fontWeightBold: "700", minimumContrastRatio: 4.5, cursorBlink: settings.get("terminal.cursorBlink"), scrollback: settings.get("terminal.scrollback"), allowProposedApi: true, convertEol: false, macOptionIsMeta: true, rightClickSelectsWord: true, bellStyle: "none", smoothScrollDuration: 0, theme: currentTheme };
}
let currentTheme = {};
async function computeTheme() {
  const sch = settings.get("terminal.scheme");
  if (sch && sch !== "follow-theme") { const p = await themes.schemePalette(sch); if (p) return p; }
  return themes.terminalPalette();
}
async function applyTheme() {
  currentTheme = await computeTheme();
  for (const t of terms.values()) { t.xt.options.theme = currentTheme; t.xt.options.fontSize = settings.get("terminal.fontSize"); t.xt.options.fontFamily = `"${settings.get("terminal.fontFamily")}", var(--mono), monospace`; t.xt.options.lineHeight = settings.get("terminal.lineHeight"); t.xt.options.letterSpacing = settings.get("terminal.letterSpacing"); t.xt.options.cursorBlink = settings.get("terminal.cursorBlink"); t.xt.options.scrollback = settings.get("terminal.scrollback"); }
  bodies.style.background = currentTheme.background || ""; fitAll();
}

function newXterm(t) {
  const xt = new Terminal(xtermOptions());
  const fit = new FitAddon.FitAddon(); xt.loadAddon(fit);
  try { xt.loadAddon(new WebLinksAddon.WebLinksAddon((e, uri) => { e.preventDefault?.(); openLink(uri); })); } catch { /* optional */ }
  try { const u = new Unicode11Addon.Unicode11Addon(); xt.loadAddon(u); xt.unicode.activeVersion = "11"; } catch { /* optional */ }
  try { t.search = new SearchAddon.SearchAddon(); xt.loadAddon(t.search); } catch { /* optional */ }
  t.fit = fit;
  pinchZoom(xt);
  // a selected URL → floating "open in browser" chip
  xt.onSelectionChange(() => { const u = t.xt && selectedUrl(t); if (u) showLinkChip(u); else hideLinkChip(); });
  // OSC 7770: "open;<abs path>" emitted by the `code`/`codeforge` command inside the shell
  xt.parser.registerOscHandler(7770, (data) => { const i = data.indexOf(";"); const verb = data.slice(0, i), arg = data.slice(i + 1); bus.emit("term:cmd", verb, arg, t); return true; });
  xt.parser.registerOscHandler(7, (data) => { try { const u = new URL(data); t.cwd = decodeURIComponent(u.pathname); } catch { /* ignore */ } return false; });
  xt.onTitleChange((title) => { t.title = title.slice(0, 40); refreshTabs(); });
  xt.onData((d) => {
    if (!t.alive) { closeTerm(t.id); return; }
    let out = d;
    if (mods.ctrl && d.length === 1) { const c = d.toUpperCase().charCodeAt(0); if (c >= 64 && c <= 95) out = String.fromCharCode(c - 64); else if (d === " ") out = "\0"; setMod("ctrl", false); }
    if (mods.shift && d.length === 1) { out = out.toUpperCase(); setMod("shift", false); }
    if (mods.alt) { out = "\x1b" + out; setMod("alt", false); }
    N.term.writeStr(t.id, out).catch(() => {});
  });
  xt.onBell(() => { if (settings.get("terminal.bell")) N.sys.vibrate(30); });
  xt.onResize(({ rows, cols }) => N.term.resize(t.id, rows, cols).catch(() => {}));
  return xt;
}

function openLink(uri) { openUrl(uri); }
/** URL under a screen point (handles links wrapped over several terminal rows) */
function urlUnderPoint(t, x, y) {
  try {
    const xt = t.xt, scr = xt.element.querySelector(".xterm-screen"), r = scr.getBoundingClientRect();
    const col = Math.floor((x - r.left) / (r.width / xt.cols)), row = Math.floor((y - r.top) / (r.height / xt.rows));
    if (col < 0 || row < 0 || row >= xt.rows) return null;
    const buf = xt.buffer.active; let y0 = buf.viewportY + row; while (y0 > 0 && buf.getLine(y0)?.isWrapped) y0--;
    let text = "", y1 = y0; for (;;) { const ln = buf.getLine(y1); if (!ln) break; text += ln.translateToString(false); const nx = buf.getLine(y1 + 1); if (nx?.isWrapped) y1++; else break; }
    return urlAt(text.replace(/\s+$/, ""), (buf.viewportY + row - y0) * xt.cols + col);
  } catch { return null; }
}
const selectedUrl = (t) => { const s = t.xt.hasSelection() ? t.xt.getSelection().replace(/\r?\n$/, "").trim() : ""; return isUrl(s) ? s : null; };

// `(?=\D)` – only a port that is followed by a non-digit: a chunk boundary in the middle of "5173" must not report port 51
const PORT_RE = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]):(\d{2,5})(?=\D)/g;
function scanOutput(t, bytes) {
  const s = new TextDecoder().decode(bytes); if (!s.includes("://") && !t.scanTail) return;
  const clean = ((t.scanTail || "") + s).replace(/\x1b\[[0-9;]*[A-Za-z]/g, ""); let m;
  t.scanTail = clean.slice(-70);                       // an URL may be split across two output chunks
  t.seenPorts ||= new Map(); const now = Date.now();
  PORT_RE.lastIndex = 0;
  while ((m = PORT_RE.exec(clean))) { const port = +m[1]; if (now - (t.seenPorts.get(port) || 0) < 15000) continue; t.seenPorts.set(port, now); bus.emit("port:detected", port, t); }
}

async function mount(t) {
  const el = h("div.term-body", { dataset: { id: t.id } }); t.el = el; bodies.append(el);
  t.xt = newXterm(t); t.xt.open(el);
  el.addEventListener("contextmenu", (e) => { e.preventDefault(); termMenu(t, e.clientX, e.clientY); });
  longPress(el, (x, y) => termMenu(t, x, y), 700);
  terms.set(t.id, t); select(t.id);
}

export async function create(opts = {}) {
  creating++;
  try { return await createInner(opts); } finally { creating--; }
}
async function createInner({ cwd, mode, command, title, env, focus = true } = {}) {
  if (!(panel.isOpen() && panel.active() === "terminal")) panel.show("terminal");
  const m = mode || settings.get("terminal.mode");
  await new Promise((r) => requestAnimationFrame(r));
  let info;
  try {
    info = await N.term.create({ cwd: cwd || ws.root || undefined, mode: m, command, title, env, rows: 24, cols: 80 });
  } catch (e) {
    if (/not installed/i.test(e.message)) { toast("Linux environment is not installed yet", { kind: "warn" }); bus.emit("env:needed"); return null; }
    toastError(e); return null;
  }
  const t = { id: info.id, title: info.title || "terminal", alive: true, mode: info.mode, cwd: info.cwd };
  await mount(t);
  currentTheme = currentTheme.foreground ? currentTheme : await computeTheme(); t.xt.options.theme = currentTheme; bodies.style.background = currentTheme.background;
  fitOne(t); if (focus) t.xt.focus();
  return t;
}

async function adopt(info) {
  if (terms.has(info.id)) return;
  const t = { id: info.id, title: info.title || "terminal", alive: info.alive, mode: info.mode, cwd: info.cwd };
  await mount(t);
  currentTheme = currentTheme.foreground ? currentTheme : await computeTheme(); t.xt.options.theme = currentTheme;
  const a = await N.term.attach(info.id); if (a?.b64) t.xt.write(b64ToBytes(a.b64));
  fitOne(t);
}

function fitOne(t) {
  if (!t.el.offsetParent) return;
  try { t.fit.fit(); N.term.resize(t.id, t.xt.rows, t.xt.cols).catch(() => {}); } catch { /* not visible */ }
}
function fitAll() { const t = get(); if (t) fitOne(t); }

export const get = (id = activeId) => terms.get(id) || null;
export const list = () => [...terms.values()];
export function select(id) {
  activeId = id;
  for (const t of terms.values()) t.el.classList.toggle("on", t.id === id);
  refreshTabs(); const t = get(); if (t) { setTimeout(() => { fitOne(t); }, 30); }
}
function refreshTabs() {
  tabsEl.replaceChildren(...[...terms.values()].map((t) => h("div.term-tab" + (t.id === activeId ? ".active" : "") + (t.alive ? "" : ".dead"), { onclick: () => { select(t.id); t.xt.focus(); }, oncontextmenu: (e) => { e.preventDefault(); termMenu(t, e.clientX, e.clientY); } },
    icon(t.mode === "linux" ? "server-environment" : "terminal"), h("span", t.title || "terminal"), h("span.x", { onclick: (e) => { e.stopPropagation(); closeTerm(t.id); } }, icon("close")))));
}
export function closeTerm(id) {
  const t = terms.get(id); if (!t) return;
  N.term.close(id).catch(() => {}); t.xt.dispose(); t.el.remove(); terms.delete(id);
  if (activeId === id) { const n = [...terms.keys()].pop(); activeId = n || null; if (n) select(n); else panel.hide(); }
  refreshTabs();
}
function killActive() { const t = get(); if (t) closeTerm(t.id); }

export function write(data, id = activeId) { return N.term.writeStr(id, data); }
/** Run a shell command line in a (new or existing) terminal. */
export async function run(line, { cwd, title, reuse = true, mode } = {}) {
  let t = reuse ? [...terms.values()].find((x) => x.alive && x.runner) : null;
  if (!t) { t = await create({ cwd, title: title || "run", mode }); if (!t) return null; t.runner = true; await new Promise((r) => setTimeout(r, 600)); }
  else { panel.show("terminal"); select(t.id); if (cwd && cwd !== t.cwd) { await write(`cd ${shellQuote(cwd)}\r`); t.cwd = cwd; } }
  await write(line + "\r"); t.xt.focus(); return t;
}
export function setMod(k, on) { mods[k] = on; bus.emit("term:mods", { ...mods }); }
export function sendKey(seq) {
  const t = get(); if (!t?.alive) return;
  let out = seq;
  if (mods.shift) {
    if (seq === "\t") out = "\x1b[Z";
    else if (/^\x1b\[[ABCDHF]$/.test(seq)) out = "\x1b[1;2" + seq[2];
    else if (seq.length === 1) out = seq.toUpperCase();
    setMod("shift", false);
  }
  if (mods.ctrl && out.length === 1 && seq.length === 1) { const c = seq.toUpperCase().charCodeAt(0); if (c >= 64 && c <= 95) out = String.fromCharCode(c - 64); setMod("ctrl", false); }
  if (mods.alt) { out = "\x1b" + out; setMod("alt", false); }
  N.term.writeStr(t.id, out); t.xt.focus();
}
export async function pasteFromClipboard() { const t = get(); if (!t?.alive) return; try { const text = await N.sys.clipboardGet(); if (text) t.xt.paste(text); } catch { /* ignore */ } }

function termMenu(t, x, y) {
  const url = selectedUrl(t) || urlUnderPoint(t, x, y);
  contextMenu([
    ...(url ? [
      { label: "Open Link in Browser", icon: "link-external", run: () => openInBrowser(url) },
      ...(isLocal(url) ? [{ label: "Open Link in Preview", icon: "preview", run: () => openInPreview(url) }] : []),
      { label: "Copy Link", icon: "copy", run: () => N.sys.clipboardSet(url) },
      { separator: true },
    ] : []),
    { label: "Copy", icon: "copy", disabled: !t.xt.hasSelection(), run: () => N.sys.clipboardSet(t.xt.getSelection()) },
    { label: "Paste", icon: "clippy", run: pasteFromClipboard },
    { label: "Select All", run: () => t.xt.selectAll() },
    { separator: true },
    { label: "Clear", icon: "clear-all", run: () => t.xt.clear() },
    { label: "Rename…", icon: "edit", run: async () => { const { prompt } = await import("../core/ui.js"); const n = await prompt("Rename terminal", { value: t.title }); if (n) { t.title = n; N.term.rename(t.id, n); refreshTabs(); } } },
    { label: "Find…", icon: "search", run: async () => { const { prompt } = await import("../core/ui.js"); const q = await prompt("Find in terminal"); if (q && t.search) t.search.findNext(q); } },
    { separator: true },
    { label: "Kill Terminal", icon: "trash", danger: true, run: () => closeTerm(t.id) },
  ], x, y);
}

function profileMenu(x, y) {
  contextMenu([
    { label: "New Terminal (default)", icon: "terminal", run: () => create() },
    { label: "New Android Shell (sh)", icon: "device-mobile", run: () => create({ mode: "host" }) },
    { label: "New Linux Shell (Alpine)", icon: "server-environment", run: () => create({ mode: "linux" }) },
    { separator: true },
    { label: "Set default: Auto", run: () => settings.set("terminal.mode", "auto") },
    { label: "Set default: Android shell", run: () => settings.set("terminal.mode", "host") },
    { label: "Set default: Linux", run: () => settings.set("terminal.mode", "linux") },
  ], x, y);
}

/** Two-finger pinch on the terminal changes the font size (persisted). */
function pinchZoom(xt) {
  let d0 = 0, f0 = 0, host = null;
  const dist = (e) => Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
  const attach = () => {
    host = xt.element?.parentElement; if (!host) return setTimeout(attach, 200);
    host.addEventListener("touchstart", (e) => { if (e.touches.length === 2) { d0 = dist(e); f0 = settings.get("terminal.fontSize"); } }, { passive: true });
    host.addEventListener("touchmove", (e) => {
      if (e.touches.length !== 2 || !d0) return; e.preventDefault();
      const size = Math.max(8, Math.min(32, Math.round(f0 * dist(e) / d0)));
      if (size !== settings.get("terminal.fontSize")) settings.set("terminal.fontSize", size);
    }, { passive: false });
    host.addEventListener("touchend", () => { d0 = 0; }, { passive: true });
  };
  attach();
}
