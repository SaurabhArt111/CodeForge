// Soft keyboard manager for touch devices.
//  - "ask" mode (default): tapping the editor or the terminal places the cursor but does NOT pop the keyboard up; a small prompt offers to open it.
//    This is done with inputmode="none" on Monaco's / xterm's hidden textarea, so focus, cursor and hardware keyboards keep working.
//  - a floating keyboard button you can drag anywhere opens / closes the keyboard (editor and terminal alike).
//  - "auto" mode: the old behaviour, the keyboard opens on every tap.
import { settings } from "../core/settings.js";
import { bus } from "../core/events.js";
import { h, isTouch } from "../core/util.js";

const SEL = "textarea.inputarea, textarea.xterm-helper-textarea";
const KBD_SVG = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6" width="19" height="12" rx="2.2"/><path d="M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01M18 10h.01M7 14h10"/></svg>';
const HIDE_SVG = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="4" width="19" height="11" rx="2.2"/><path d="M6 8h.01M9.5 8h.01M13 8h.01M16.5 8h.01M18 8h.01M7 12h10M8.5 19l3.5 2.5 3.5-2.5"/></svg>';

let fab = null, ask = null, askTimer = 0, baseH = 0;
let allowed = false;          // the user opened the keyboard: textareas keep a normal inputmode until it is closed again
let lastField = null;         // the editor / terminal textarea that was tapped last
let open = false;             // keyboard currently visible

export const isOpen = () => open;
const mode = () => (isTouch() ? settings.get("ui.keyboard") || "ask" : "auto");
const fieldOf = (t) => t?.closest?.(".monaco-editor, .xterm") ? t.closest(".monaco-editor, .xterm").querySelector(SEL) : null;

function setInputMode(el, on) {
  if (!el) return;
  if (on) el.removeAttribute("inputmode"); else el.setAttribute("inputmode", "none");
}

/** Show the keyboard for the given (or the last used) editor / terminal field. */
export function openKeyboard(el = lastField) {
  el = el && el.isConnected ? el : document.querySelector(".monaco-editor.focused " + SEL) || document.querySelector(SEL);
  if (!el) return false;
  allowed = true; lastField = el; hideAsk();
  setInputMode(el, true);
  try { el.blur(); } catch { /* ignore */ }
  requestAnimationFrame(() => { try { el.focus({ preventScroll: true }); } catch { /* ignore */ } sync(); });
  return true;
}
/** Hide the keyboard but keep the cursor where it is (the field keeps focus, inputmode none). */
export function closeKeyboard() {
  allowed = false; hideAsk();
  const el = document.activeElement?.matches?.(SEL) ? document.activeElement : lastField;
  if (el) { setInputMode(el, false); try { el.blur(); } catch { /* ignore */ } requestAnimationFrame(() => { try { el.focus({ preventScroll: true }); } catch { /* ignore */ } sync(); }); }
  else if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  sync();
}
export const toggleKeyboard = () => (open ? closeKeyboard() : openKeyboard());

// ---------------------------------------------------------------- the prompt shown after a tap
function hideAsk() { clearTimeout(askTimer); ask?.remove(); ask = null; }
function showAsk(x, y) {
  hideAsk();
  const W = window.innerWidth, H = window.innerHeight;
  const box = h("div.kbd-ask", { role: "dialog", "aria-label": "Open keyboard?" },
    h("button.kbd-ask-open", { type: "button", onpointerdown: (e) => e.preventDefault(), onclick: () => openKeyboard() }, h("span.kbd-ico", { html: KBD_SVG }), "Open keyboard"),
    h("button.kbd-ask-x", { type: "button", title: "Not now", "aria-label": "Not now", onpointerdown: (e) => e.preventDefault(), onclick: hideAsk }, "✕"),
    h("button.kbd-ask-always", { type: "button", onpointerdown: (e) => e.preventDefault(), onclick: () => { settings.set("ui.keyboard", "auto"); openKeyboard(); } }, "Always open directly"));
  document.body.append(box);
  const r = box.getBoundingClientRect();
  const left = Math.max(8, Math.min(x - r.width / 2, W - r.width - 8));
  const top = y - r.height - 28 > 8 ? y - r.height - 28 : Math.min(y + 28, H - r.height - 8);
  box.style.left = left + "px"; box.style.top = top + "px";
  ask = box; askTimer = setTimeout(hideAsk, 6000);
}

// ---------------------------------------------------------------- floating button (draggable)
function buildFab() {
  fab = h("button#kbd-fab.kbd-fab", { type: "button", title: "Keyboard (drag to move, long-press for options)", "aria-label": "Keyboard" });
  fab.innerHTML = KBD_SVG;
  document.body.append(fab);
  place(settings.state.kbdFab);
  let sx = 0, sy = 0, ox = 0, oy = 0, moved = false, down = false, lp = 0;
  fab.addEventListener("pointerdown", (e) => {
    down = true; moved = false; sx = e.clientX; sy = e.clientY; const r = fab.getBoundingClientRect(); ox = r.left; oy = r.top;
    try { fab.setPointerCapture(e.pointerId); } catch { /* synthetic / already released pointer */ } fab.classList.add("drag");
    e.preventDefault();   // never steal focus from the editor / terminal
    lp = setTimeout(() => { if (!moved && down) { down = false; fab.classList.remove("drag"); fabMenu(e.clientX, e.clientY); } }, 600);
  });
  fab.addEventListener("pointermove", (e) => {
    if (!down) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (!moved && Math.hypot(dx, dy) > 6) { moved = true; clearTimeout(lp); }
    if (moved) { fab.style.left = Math.max(0, Math.min(window.innerWidth - fab.offsetWidth, ox + dx)) + "px"; fab.style.top = Math.max(0, Math.min(window.innerHeight - fab.offsetHeight, oy + dy)) + "px"; fab.style.right = "auto"; fab.style.bottom = "auto"; }
  });
  const end = (e) => {
    clearTimeout(lp); if (!down) return; down = false; fab.classList.remove("drag");
    try { fab.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (moved) { const r = fab.getBoundingClientRect(); settings.state.kbdFab = { x: r.left / window.innerWidth, y: r.top / window.innerHeight }; settings.saveState(); }
    else toggleKeyboard();
  };
  fab.addEventListener("pointerup", end); fab.addEventListener("pointercancel", (e) => { clearTimeout(lp); down = false; fab.classList.remove("drag"); });
  fab.addEventListener("contextmenu", (e) => e.preventDefault());
  window.addEventListener("resize", () => place(settings.state.kbdFab));
}
function place(pos) {
  if (!fab) return;
  const W = window.innerWidth, H = window.innerHeight, s = fab.offsetWidth || 46;
  const x = pos ? pos.x * W : W - s - 12, y = pos ? pos.y * H : H - s - 150;
  fab.style.left = Math.max(0, Math.min(W - s, x)) + "px"; fab.style.top = Math.max(0, Math.min(H - s, y)) + "px"; fab.style.right = "auto"; fab.style.bottom = "auto";
}
async function fabMenu(x, y) {
  const { contextMenu } = await import("../core/ui.js");
  contextMenu([
    { label: open ? "Close keyboard" : "Open keyboard", icon: "keyboard", run: toggleKeyboard },
    { label: mode() === "ask" ? "Open keyboard directly on tap" : "Ask before opening the keyboard", icon: "question", run: () => settings.set("ui.keyboard", mode() === "ask" ? "auto" : "ask") },
    { label: "Reset button position", icon: "discard", run: () => { settings.state.kbdFab = null; settings.saveState(); place(null); } },
    { label: "Hide this button", icon: "eye-closed", run: () => settings.set("ui.kbdFab", false) },
  ], x, y);
}

// ---------------------------------------------------------------- state
function sync() {
  const vv = window.visualViewport;
  const shrunk = Math.max(window.innerHeight, baseH) - Math.min(window.innerHeight, vv?.height || window.innerHeight) > 140 || window.innerHeight < baseH - 140;
  const was = open; open = shrunk;
  if (was && !open) { allowed = false; const f = document.activeElement?.matches?.(SEL) ? document.activeElement : null; if (f && mode() === "ask") setInputMode(f, false); }
  if (fab) { fab.classList.toggle("on", open); fab.innerHTML = open ? HIDE_SVG : KBD_SVG; fab.title = open ? "Close keyboard" : "Open keyboard"; fab.classList.toggle("hidden", !settings.get("ui.kbdFab")); }
  if (was !== open) bus.emit("kbd:state", open);
}

export function init() {
  if (!isTouch()) return;
  baseH = window.innerHeight;
  buildFab();
  window.addEventListener("resize", () => { if (window.innerHeight > baseH) baseH = window.innerHeight; sync(); });
  window.visualViewport?.addEventListener("resize", sync);
  settings.on("change:ui.kbdFab", sync);
  settings.on("change:ui.keyboard", () => { if (mode() === "auto") { allowed = true; document.querySelectorAll(SEL).forEach((t) => setInputMode(t, true)); } else if (!open) document.querySelectorAll(SEL).forEach((t) => setInputMode(t, false)); });
  // keep the keyboard from opening on focus: set inputmode before the focus lands (pointerdown) and again when focus arrives (focusin)
  const guard = (t) => { if (mode() === "auto" || allowed) return; const f = t?.matches?.(SEL) ? t : fieldOf(t); if (f) { setInputMode(f, false); } };
  document.addEventListener("pointerdown", (e) => { if (e.pointerType !== "mouse") guard(e.target); }, true);
  document.addEventListener("focusin", (e) => { if (e.target.matches?.(SEL)) { lastField = e.target; guard(e.target); } }, true);
  // a short tap (not a scroll / drag / long-press) inside the editor or terminal → offer the keyboard
  let tap = null;
  document.addEventListener("pointerdown", (e) => { tap = e.pointerType !== "mouse" && fieldOf(e.target) ? { x: e.clientX, y: e.clientY, t: Date.now(), el: e.target } : null; if (!e.target.closest?.(".kbd-ask")) hideAsk(); }, true);
  document.addEventListener("pointerup", (e) => {
    const t0 = tap; tap = null;
    if (!t0 || mode() !== "ask" || open || allowed) return;
    if (Math.hypot(e.clientX - t0.x, e.clientY - t0.y) > 10 || Date.now() - t0.t > 450) return;
    if (e.target.closest?.(".kbd-fab,.kbd-ask,.link-chip,.suggest-widget,.monaco-hover")) return;
    const f = fieldOf(t0.el); if (f) lastField = f;
    setTimeout(() => { if (!open && !allowed) showAsk(e.clientX, e.clientY); }, 60);
  }, true);
  document.addEventListener("scroll", hideAsk, true);
  sync();
}
