// Terminal: xterm.js over native PTY sessions (host shell or proot Alpine), tabs, OSC-7770 "code" command, URL/port detection.
import * as fontscale from "../core/fontscale.js";
import * as lazy from "../core/lazy.js";
import { N } from "../core/bridge.js";
import { settings } from "../core/settings.js";
import { bus } from "../core/events.js";
import { h, icon, P, b64ToBytes, strToB64, shellQuote } from "../core/util.js";
import { contextMenu, toast, toastError, longPress } from "../core/ui.js";
import * as themes from "../features/themes.js";
import * as panel from "./panel.js";
import { ws } from "./workspace.js";
import { openUrl, openInBrowser, openInPreview, urlAt, isUrl, isLocal, HOSTPORT_RE, normalize } from "../core/links.js";
import { showLinkChip, hideLinkChip } from "./linkchip.js";
import { crumb } from "../core/crash.js";

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
  // Rendering is acknowledged to the native side (flow control): a program that floods the terminal is slowed down instead of
  // queueing megabytes in the WebView, which is what used to freeze / crash the app with TUIs and noisy logs.
  N.on("term.data", (d) => { const t = terms.get(d.id); if (t) { const bytes = b64ToBytes(d.b64); t.xt.write(bytes, () => ack(t, bytes.length)); scanOutput(t, bytes); } });
  // output produced while the app was paused was kept natively: rebuild the screen from the replay buffer
  N.on("term.resync", async (d) => { const t = terms.get(d.id); if (!t) return; try { const a = await N.term.attach(d.id); t.xt.reset(); if (a?.b64) t.xt.write(b64ToBytes(a.b64)); fitOne(t); } catch { /* ignore */ } });
  N.on("term.exit", (d) => { const t = terms.get(d.id); if (!t) return; t.alive = false; t.xt.write(`\r\n\x1b[2m[Process exited with code ${d.code}]  press any key to close\x1b[0m\r\n`); refreshTabs(); t.onExit?.(d.code); });
  // xterm measures glyph cells once: if the web font arrives later the rows overlap. Re-measure when fonts are ready.
  try { document.fonts.load(`14px "${settings.get("terminal.fontFamily")}"`).then(() => document.fonts.ready).then(() => applyTheme()); } catch { /* ignore */ }
  themes.themeEvents.on("change", applyTheme);
  settings.on("change", (k) => { if (k.startsWith("terminal.") || k === "ui.fontScale") applyTheme(); });
  bus.on("terminal:at", (dir) => create({ cwd: dir }));
  restore();
}

async function restore() {
  try {
    const list = await N.term.list();
    for (const s of list) { if (!s.alive) { N.term.close(s.id); continue; } await adopt(s); }
  } catch { /* ignore */ }
}

function ack(t, n) {
  t.unacked = (t.unacked || 0) + n;
  const send = () => { clearTimeout(t.ackTimer); t.ackTimer = 0; const k = t.unacked; t.unacked = 0; if (k) N.term.ack(t.id, k).catch(() => {}); };
  if (t.unacked >= 32768) send(); else if (!t.ackTimer) t.ackTimer = setTimeout(send, 40);
}

/** xterm measures glyphs on a <canvas>, whose font shorthand cannot contain var(): resolve --mono ourselves or it silently measures a 10px sans-serif (overlapping glyphs, wrong cell size). */
function termFamily() {
  const mono = (getComputedStyle(document.documentElement).getPropertyValue("--mono") || "").trim() || "ui-monospace, Menlo, Consolas, monospace";
  return `"${settings.get("terminal.fontFamily")}", ${mono}, monospace`;
}
function xtermOptions() {
  return { fontFamily: termFamily(), fontSize: fontscale.scaled(settings.get("terminal.fontSize")), lineHeight: settings.get("terminal.lineHeight"), letterSpacing: settings.get("terminal.letterSpacing"), fontWeight: "400", fontWeightBold: "700", minimumContrastRatio: 4.5, cursorBlink: settings.get("terminal.cursorBlink"), scrollback: settings.get("terminal.scrollback"), allowProposedApi: true, convertEol: false, macOptionIsMeta: true, rightClickSelectsWord: true, bellStyle: "none", smoothScrollDuration: 0, theme: currentTheme };
}
let currentTheme = {};
async function computeTheme() {
  const sch = settings.get("terminal.scheme");
  if (sch && sch !== "follow-theme") { const p = await themes.schemePalette(sch); if (p) return p; }
  return themes.terminalPalette();
}
async function applyTheme() {
  currentTheme = await computeTheme();
  for (const t of terms.values()) { t.xt.options.theme = currentTheme; t.xt.options.fontSize = fontscale.scaled(settings.get("terminal.fontSize")); t.xt.options.fontFamily = termFamily(); t.xt.options.lineHeight = settings.get("terminal.lineHeight"); t.xt.options.letterSpacing = settings.get("terminal.letterSpacing"); t.xt.options.cursorBlink = settings.get("terminal.cursorBlink"); t.xt.options.scrollback = settings.get("terminal.scrollback"); }
  bodies.style.background = currentTheme.background || ""; fitAll();
}

function newXterm(t) {
  const xt = new Terminal(xtermOptions());
  const fit = new FitAddon.FitAddon(); xt.loadAddon(fit);
  try { xt.loadAddon(new WebLinksAddon.WebLinksAddon((e, uri) => { e.preventDefault?.(); openLink(uri); })); } catch { /* optional */ }
  // "localhost:5173", "0.0.0.0:8000", "192.168.1.20:3000" printed without "http://" are links too
  try {
    xt.registerLinkProvider({ provideLinks(y, cb) {
      const line = xt.buffer.active.getLine(y - 1); if (!line) return cb(undefined);
      const text = line.translateToString(true), out = []; HOSTPORT_RE.lastIndex = 0; let m;
      while ((m = HOSTPORT_RE.exec(text))) out.push({ text: m[0], range: { start: { x: m.index + 1, y }, end: { x: m.index + m[0].length, y } }, decorations: { underline: true, pointerCursor: true }, activate: (_e, txt) => openLink(txt) });
      cb(out.length ? out : undefined);
    } });
  } catch { /* optional */ }
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

// a tap fires both our tap handler and xterm's synthesized click: open a link once
let lastLink = { u: "", t: 0 };
function openLink(uri) { const u = normalize(uri), now = Date.now(); if (u === lastLink.u && now - lastLink.t < 900) return; lastLink = { u, t: now }; openUrl(uri); }
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
const PORT_RES = [
  /(?:https?:\/\/)?(?:localhost|0\.0\.0\.0|\[::1?\]|(?:127|10)(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}):(\d{2,5})(?=\D)/g,                  // http://localhost:5173, 0.0.0.0:3000, 192.168.1.5:8080
  /\b(?:listening|serving|running|started|server|available|live)\b[^\n]{0,40}?\bport\s+(\d{4,5})(?=\D)/gi,           // "Serving HTTP on 0.0.0.0 port 8000", "listening on port 3000"
];
function hasUrl(b) { for (let i = 0, n = b.length - 2; i < n; i++) if (b[i] === 58 && b[i + 1] === 47 && b[i + 2] === 47) return true; return false; }
function scanOutput(t, bytes) {
  if (!t.scanTail && !hasUrl(bytes)) return;            // decoding every chunk of a flooding program is wasted work
  const s = new TextDecoder().decode(bytes); if (!s.includes("://") && !t.scanTail) return;
  const clean = ((t.scanTail || "") + s).replace(/\x1b\[[0-9;]*[A-Za-z]/g, ""); let m;
  t.scanTail = clean.slice(-70);                       // an URL may be split across two output chunks
  t.seenPorts ||= new Map(); const now = Date.now();
  for (const re of PORT_RES) {
    re.lastIndex = 0;
    while ((m = re.exec(clean))) {
      const port = +m[1]; if (port < 80 || port > 65535 || /^\S*__live\//.test(clean.slice(m.index))) continue;   // our own in-browser server prints /__live/ URLs
      if (now - (t.seenPorts.get(port) || 0) < 15000) continue; t.seenPorts.set(port, now); bus.emit("port:detected", port, t);
    }
  }
}

async function mount(t) {
  await lazy.xterm();
  const el = h("div.term-body", { dataset: { id: t.id } }); t.el = el; bodies.append(el);
  t.xt = newXterm(t); t.xt.open(el);
  el.addEventListener("contextmenu", (e) => { e.preventDefault(); termMenu(t, e.clientX, e.clientY); });
  // a plain tap on a link (touch / pen) opens it; xterm's own hover-based links need a mouse
  let tap = null;
  el.addEventListener("pointerdown", (e) => { tap = e.pointerType === "mouse" ? null : { x: e.clientX, y: e.clientY, t: Date.now() }; });
  el.addEventListener("pointerup", (e) => {
    const d = tap; tap = null; if (!d || Date.now() - d.t > 450 || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10 || t.xt.hasSelection()) return;
    const u = urlUnderPoint(t, e.clientX, e.clientY); if (u) { e.preventDefault(); openLink(u); }
  });
  longPress(el, (x, y) => termMenu(t, x, y), 700);
  terms.set(t.id, t); select(t.id);
}

export async function create(opts = {}) {
  creating++;
  try { return await createInner(opts); } finally { creating--; }
}
async function createInner({ cwd, mode, command, title, env, focus = true } = {}) {
  if (!panel.isShown("terminal")) panel.show("terminal");
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
  crumb("terminal create " + info.mode);
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
  for (const t of terms.values()) if (!t.embedded) t.el.classList.toggle("on", t.id === id);
  refreshTabs(); const t = get(); if (t) { setTimeout(() => { fitOne(t); }, 30); }
}
function refreshTabs() {
  tabsEl.replaceChildren(...[...terms.values()].filter((t) => !t.embedded).map((t) => h("div.term-tab" + (t.id === activeId ? ".active" : "") + (t.alive ? "" : ".dead"), { onclick: () => { select(t.id); t.xt.focus(); }, oncontextmenu: (e) => { e.preventDefault(); termMenu(t, e.clientX, e.clientY); } },
    icon(t.mode === "linux" ? "server-environment" : "terminal"), h("span", t.title || "terminal"), h("span.x", { onclick: (e) => { e.stopPropagation(); closeTerm(t.id); } }, icon("close")))));
}
export function closeTerm(id) {
  const t = terms.get(id); if (!t) return;
  crumb("terminal close " + id);
  N.term.close(id).catch(() => {}); clearTimeout(t.ackTimer); t.xt.dispose(); t.el.remove(); terms.delete(id);
  if (t.embedded) { t.ro?.disconnect(); t.onClose?.(); return; }
  if (activeId === id) { const n = [...terms.values()].filter((x) => !x.embedded).map((x) => x.id).pop(); activeId = n || null; if (n) select(n); else panel.hide("terminal"); }
  refreshTabs();
}
function killActive() { const t = get(); if (t) closeTerm(t.id); }

/** A terminal that lives inside another view (the AI side bar's Claude Code / Codex tabs) instead of the terminal panel. */
export async function createEmbedded(container, { cwd, mode = "linux", title, line } = {}) {
  await lazy.xterm();
  let info;
  try { info = await N.term.create({ cwd: cwd || ws.root || undefined, mode, title, rows: 24, cols: 80 }); }
  catch (e) { if (/not installed/i.test(e.message)) { bus.emit("env:needed"); return null; } toastError(e); return null; }
  const t = { id: info.id, title: title || info.title || "terminal", alive: true, mode: info.mode, cwd: info.cwd, embedded: true };
  const el = h("div.term-embed"); container.append(el); t.el = el;
  t.xt = newXterm(t); t.xt.open(el); terms.set(t.id, t);
  currentTheme = currentTheme.foreground ? currentTheme : await computeTheme(); t.xt.options.theme = currentTheme; el.style.background = currentTheme.background || "";
  let ft = 0; t.ro = new ResizeObserver(() => { clearTimeout(ft); ft = setTimeout(() => fitOne(t), 60); }); t.ro.observe(el);
  fitOne(t);
  if (line) setTimeout(() => N.term.writeStr(t.id, line + "\r").catch(() => {}), 500);
  return t;
}

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
    touchScroll(xt, host);
  };
  attach();
}

/** One-finger drag scrolls the terminal (with a short glide), like any other list in the app.
 *  Normal screen: moves through the scrollback. Full-screen programs (vim, less, AI CLIs): sends wheel / arrow keys to the program. */
function touchScroll(xt, host) {
  let y0 = 0, x0 = 0, acc = 0, active = false, moved = false, vel = 0, lastT = 0, raf = 0;
  const lineH = () => { const r = xt.element?.querySelector(".xterm-rows > div")?.getBoundingClientRect().height; return r > 4 ? r : Math.max(12, (xt.options.fontSize || 13) * (xt.options.lineHeight || 1.2)); };
  const send = (d) => (typeof xt.input === "function" ? xt.input(d, true) : xt._core?.coreService?.triggerDataEvent(d, true));
  const step = (lines) => {
    if (!lines) return;
    const alt = xt.buffer.active.type === "alternate";
    if (!alt) { xt.scrollLines(lines); return; }
    const n = Math.min(Math.abs(lines), 12);
    if (xt.modes?.mouseTrackingMode && xt.modes.mouseTrackingMode !== "none") {   // the program asked for mouse events: send wheel (SGR)
      const b = lines < 0 ? 64 : 65; send(`\x1b[<${b};1;1M`.repeat(n));
    } else send((xt.modes?.applicationCursorKeysMode ? (lines < 0 ? "\x1bOA" : "\x1bOB") : (lines < 0 ? "\x1b[A" : "\x1b[B")).repeat(n));
  };
  const feed = (dy) => { acc += dy; const h = lineH(); const n = Math.trunc(acc / h); if (n) { acc -= n * h; step(-n); } };
  const glide = () => { vel *= 0.94; if (Math.abs(vel) < 0.02) return; feed(vel * 16); raf = requestAnimationFrame(glide); };
  host.addEventListener("touchstart", (e) => {
    cancelAnimationFrame(raf);
    if (e.touches.length !== 1) { active = false; return; }
    active = true; moved = false; acc = 0; vel = 0; y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; lastT = e.timeStamp;
  }, { passive: true, capture: true });
  host.addEventListener("touchmove", (e) => {
    if (!active || e.touches.length !== 1) return;
    const y = e.touches[0].clientY, dy = y - y0;
    if (!moved) { if (Math.abs(dy) < 8 || Math.abs(dy) < Math.abs(e.touches[0].clientX - x0)) return; moved = true; }
    if (xt.hasSelection()) return;                       // dragging a selection handle, not scrolling
    e.preventDefault(); e.stopPropagation();
    const dt = Math.max(1, e.timeStamp - lastT); vel = 0.7 * (dy / dt) + 0.3 * vel; lastT = e.timeStamp; y0 = y; feed(dy);
  }, { passive: false, capture: true });
  host.addEventListener("touchend", (e) => { if (active && moved && Math.abs(vel) > 0.25 && e.timeStamp - lastT < 80) raf = requestAnimationFrame(glide); active = false; }, { passive: true, capture: true });
  host.addEventListener("touchcancel", () => { active = false; }, { passive: true, capture: true });
}
