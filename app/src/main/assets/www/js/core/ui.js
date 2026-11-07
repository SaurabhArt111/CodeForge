// UI primitives: toast, modal, prompt, confirm, quick pick, context menu, busy overlay.
import { h, icon, fuzzy, debounce } from "./util.js";

const overlay = () => document.getElementById("overlay");

// ---------------------------------------------------------------- toast
export function toast(msg, opts = {}) {
  const { kind = "info", timeout = kind === "error" ? 7000 : 3200, action } = typeof opts === "string" ? { kind: opts } : opts;
  const box = document.getElementById("toasts");
  const el = h(`div.toast.${kind}`, icon(kind === "error" ? "error" : kind === "success" ? "pass" : kind === "warn" ? "warning" : "info"),
    h("span.msg", String(msg)), action ? h("button.link", { onclick: () => { action.run(); el.remove(); } }, action.label) : null,
    h("button.x", { title: "Dismiss", onclick: () => el.remove() }, icon("close")));
  box.append(el);
  if (timeout) setTimeout(() => el.remove(), timeout);
  return el;
}
export const toastError = (e) => toast(e?.message || String(e), { kind: "error" });

// ---------------------------------------------------------------- modal
let modalStack = [];
export function modal({ title, body, buttons, width = 460, className = "", closable = true, onOpen }) {
  return new Promise((resolve) => {
    const content = typeof body === "string" ? h("div.modal-text", body) : body;
    const close = (v) => { dlg.remove(); modalStack = modalStack.filter((m) => m !== dlg); document.removeEventListener("keydown", onKey, true); resolve(v); };
    const btns = (buttons || [{ label: "OK", primary: true, value: true }]).map((b) =>
      h(`button.btn${b.primary ? ".primary" : ""}${b.danger ? ".danger" : ""}`, { onclick: async () => { if (b.onClick) { const r = await b.onClick(); if (r === false) return; } close(b.value); } }, b.label));
    const dlg = h("div.modal-wrap", { onmousedown: (e) => { if (e.target === dlg && closable) close(undefined); } },
      h(`div.modal${className ? "." + className.trim().split(/\s+/).join(".") : ""}`, { style: { maxWidth: width + "px" }, role: "dialog" },
        title ? h("div.modal-head", h("span", title), closable ? h("button.icon-btn", { onclick: () => close(undefined) }, icon("close")) : null) : null,
        h("div.modal-body", content), btns.length ? h("div.modal-foot", btns) : null));
    const onKey = (e) => { if (dlg !== modalStack[modalStack.length - 1]) return; if (e.key === "Escape" && closable) { e.stopPropagation(); close(undefined); } };
    document.addEventListener("keydown", onKey, true);
    modalStack.push(dlg); overlay().append(dlg);
    onOpen?.({ close, root: dlg });
    const first = dlg.querySelector("input,textarea,select"); if (first) setTimeout(() => first.focus(), 30);
  });
}

export function prompt(title, { value = "", placeholder = "", validate, okLabel = "OK", selectStem = false, message = "", password = false } = {}) {
  return new Promise((resolve) => {
    const err = h("div.field-error");
    const input = h("input.input", { type: password ? "password" : "text", value, placeholder, spellcheck: false, autocapitalize: "off", autocomplete: "off" });
    const check = () => { const m = validate ? validate(input.value) : null; err.textContent = m || ""; return !m; };
    input.addEventListener("input", check);
    modal({
      title, width: 440, body: h("div", message ? h("p.modal-text", message) : null, input, err),
      buttons: [{ label: "Cancel", value: undefined }, { label: okLabel, primary: true, value: "__ok", onClick: () => check() }],
      onOpen: ({ close }) => {
        input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); if (check()) close("__ok"); } });
        setTimeout(() => { input.focus(); if (selectStem) { const i = value.lastIndexOf("."); input.setSelectionRange(0, i > 0 ? i : value.length); } else input.select(); }, 40);
      },
    }).then((v) => resolve(v === "__ok" ? input.value : undefined));
  });
}

export async function confirm(message, { title = "Confirm", okLabel = "OK", danger = false, detail = "" } = {}) {
  const v = await modal({ title, width: 420, body: h("div", h("p.modal-text", message), detail ? h("p.modal-detail", detail) : null), buttons: [{ label: "Cancel", value: false }, { label: okLabel, primary: !danger, danger, value: true }] });
  return v === true;
}
export const alertBox = (message, title = "CodeForge") => modal({ title, width: 420, body: message });

// ---------------------------------------------------------------- quick pick (palette, file open, generic lists)
export function quickPick(items, { placeholder = "", title = "", initial = "", onQuery, emptyText = "No results", multi = false, keepOpen = false, prefix = "" } = {}) {
  return new Promise((resolve) => {
    let all = typeof items === "function" ? [] : items;
    let shown = [], sel = 0; const picked = new Set();
    const input = h("input.input.qp-input", { placeholder, value: initial, spellcheck: false, autocapitalize: "off", autocomplete: "off" });
    const list = h("div.qp-list");
    const wrap = h("div.qp-wrap", { onmousedown: (e) => { if (e.target === wrap) done(undefined); } },
      h("div.qp", title ? h("div.qp-title", title) : null, h("div.qp-inputrow", prefix ? h("span.qp-prefix", prefix) : null, input), list,
        multi ? h("div.qp-foot", h("button.btn.primary", { onclick: () => done([...picked].map((i) => shown[i]?.value ?? shown[i])) }, "OK")) : null));
    const done = (v) => { wrap.remove(); resolve(v); };
    const render = () => {
      list.replaceChildren();
      if (!shown.length) list.append(h("div.qp-empty", emptyText));
      shown.slice(0, 300).forEach((it, i) => {
        if (it.separator) { list.append(h("div.qp-sep", it.label || "")); return; }
        const row = h(`div.qp-item${i === sel ? ".sel" : ""}`, { onclick: () => choose(i), onmousemove: () => { if (sel !== i) { sel = i; mark(); } } },
          multi ? h("input", { type: "checkbox", checked: picked.has(i), onclick: (e) => { e.stopPropagation(); picked.has(i) ? picked.delete(i) : picked.add(i); } }) : null,
          it.icon ? (it.icon instanceof Node ? it.icon : icon(it.icon)) : null,
          h("span.qp-label", it.label), it.description ? h("span.qp-desc", it.description) : null, it.keys ? h("span.qp-keys", it.keys) : null,
          it.detail ? h("div.qp-detail", it.detail) : null);
        row.dataset.i = i; list.append(row);
      });
      mark();
    };
    const mark = () => { list.querySelectorAll(".qp-item").forEach((r) => r.classList.toggle("sel", +r.dataset.i === sel)); list.querySelector(".qp-item.sel")?.scrollIntoView({ block: "nearest" }); };
    const choose = (i) => {
      const it = shown[i]; if (!it || it.separator) return;
      if (multi) { picked.has(i) ? picked.delete(i) : picked.add(i); render(); return; }
      if (keepOpen) { it.onPick?.(); return; }
      done(it.value !== undefined ? it.value : it);
    };
    const refilter = async () => {
      const q = input.value;
      if (onQuery) { const r = await onQuery(q); all = r; shown = r; }
      else shown = q ? all.map((it) => ({ it, s: it.separator ? 0 : fuzzy(q, it.label + " " + (it.description || "")) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).map((x) => x.it) : all;
      while (shown.length && shown[0].separator && q) shown = shown.slice(1);
      sel = shown.findIndex((x) => !x.separator); if (sel < 0) sel = 0; render();
    };
    input.addEventListener("input", debounce(refilter, onQuery ? 120 : 0));
    input.addEventListener("keydown", (e) => {
      const step = (d) => { let i = sel; do { i = (i + d + shown.length) % shown.length; } while (shown[i]?.separator && shown.length > 1); sel = i; mark(); };
      if (e.key === "ArrowDown") { e.preventDefault(); step(1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); step(-1); }
      else if (e.key === "Enter") { e.preventDefault(); if (multi) done([...picked].map((i) => shown[i]?.value ?? shown[i])); else choose(sel); }
      else if (e.key === "Escape") { e.preventDefault(); done(undefined); }
      else if (e.key === "Tab") { e.preventDefault(); step(e.shiftKey ? -1 : 1); }
    });
    overlay().append(wrap);
    (async () => { if (typeof items === "function") all = await items(); shown = all; if (onQuery || initial) await refilter(); else { sel = Math.max(0, shown.findIndex((x) => !x.separator)); render(); } })();
    setTimeout(() => input.focus(), 20);
  });
}

// ---------------------------------------------------------------- context menu
let openMenu = null, menuOpenedAt = 0, menuPos = null;
export function closeMenu() { openMenu?.remove(); openMenu = null; }
/** The finger that long-pressed is still down / just lifted when the menu appears: ignore that gesture's tail
 *  (compat mouse events, the native `contextmenu` event firing a second time, the release `click`). */
const SETTLE_MS = 450;
// A mouse right-click has no "tail" to ignore, so only touch / pen gestures get the settle window.
let lastPointer = "mouse";
document.addEventListener("pointerdown", (e) => { lastPointer = e.pointerType || "mouse"; }, true);
const settled = () => lastPointer === "mouse" || Date.now() - menuOpenedAt > SETTLE_MS;
export function contextMenu(items, x, y) {
  // duplicate request for (almost) the same spot right after opening = same gesture → keep the existing menu
  if (openMenu && !settled() && menuPos && Math.hypot(menuPos.x - x, menuPos.y - y) < 40) return;
  closeMenu(); menuOpenedAt = Date.now(); menuPos = { x, y };
  const menu = h("div.ctx");
  const build = (list, parent) => {
    for (const it of list) {
      if (!it) continue;
      if (it.separator) { parent.append(h("div.ctx-sep")); continue; }
      const row = h(`div.ctx-item${it.disabled ? ".disabled" : ""}${it.danger ? ".danger" : ""}`, {
        onclick: (e) => { e.stopPropagation(); if (!settled() || it.disabled || it.submenu) return; closeMenu(); it.run?.(); },
      }, h("span.ctx-ico", it.icon ? icon(it.icon) : null), h("span.ctx-label", it.label), it.keys ? h("span.ctx-keys", it.keys) : null, it.submenu ? icon("chevron-right") : null);
      if (it.submenu) {
        const sub = h("div.ctx.sub"); build(it.submenu, sub); row.append(sub);
        row.addEventListener("click", (e) => { e.stopPropagation(); if (!settled()) return; const was = row.classList.contains("open"); parent.querySelectorAll(":scope > .ctx-item.open").forEach((r) => r.classList.remove("open")); if (!was) { row.classList.add("open"); row.scrollIntoView({ block: "nearest" }); } });   // one section open at a time
      }
      parent.append(row);
    }
  };
  build(items, menu);
  // dismiss only on a *new* press outside, never on the tail of the long-press that opened us
  const back = h("div.ctx-back", { onpointerdown: (e) => { if (settled()) { e.preventDefault(); closeMenu(); } }, oncontextmenu: (e) => { e.preventDefault(); if (settled()) closeMenu(); } });
  overlay().append(back, menu);
  // area-aware placement: use the visible viewport (soft keyboard excluded), open upwards when there is more room above,
  // and when neither side fits the menu gets the largest free area and scrolls
  const place = () => {
    const vv = window.visualViewport, VW = vv?.width || window.innerWidth, VH = vv?.height || window.innerHeight, M = 6;
    menu.style.maxHeight = "none"; menu.style.top = "0px"; menu.style.left = "0px";   // measure the natural size
    const r = { width: menu.offsetWidth, height: menu.offsetHeight };   // layout size: unaffected by the pop-in animation
    const below = VH - y - M, above = y - M;
    let top, maxH;
    if (r.height <= below) { top = y; maxH = below; }
    else if (r.height <= above) { top = y - r.height; maxH = above; }
    else if (Math.max(below, above) < 160) { top = M; maxH = VH - 2 * M; }
    else if (below >= above) { top = y; maxH = below; }
    else { top = M; maxH = above; }
    menu.style.maxHeight = Math.floor(maxH) + "px";
    const hh = menu.offsetHeight;
    menu.style.top = Math.max(M, Math.min(top, VH - hh - M)) + "px";
    menu.style.left = Math.max(M, Math.min(x, VW - r.width - M)) + "px";
  };
  place();
  menu.addEventListener("click", () => requestAnimationFrame(place));   // a submenu opened / closed: re-fit
  openMenu = { remove() { back.remove(); menu.remove(); } };
}

/** Touch long-press → callback(x, y). Returns disposer. */
export function longPress(el, cb, ms = 480) {
  let t = null, sx = 0, sy = 0, fired = false;
  const cancel = () => { clearTimeout(t); t = null; };
  el.addEventListener("touchstart", (e) => { if (e.touches.length !== 1) return cancel(); const p = e.touches[0]; sx = p.clientX; sy = p.clientY; fired = false; t = setTimeout(() => { fired = true; navigator.vibrate?.(15); cb(sx, sy, e); }, ms); }, { passive: true });
  el.addEventListener("touchmove", (e) => { const p = e.touches[0]; if (Math.hypot(p.clientX - sx, p.clientY - sy) > 10) cancel(); }, { passive: true });
  el.addEventListener("touchend", (e) => { cancel(); if (fired) { e.preventDefault(); e.stopPropagation(); } }, { passive: false });
  el.addEventListener("touchcancel", cancel);
  // Android WebView also dispatches a native `contextmenu` after a long press → would open (and then close) a second menu
  el.addEventListener("contextmenu", (e) => { if (fired || (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents)) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  // swallow the click that follows a long-press (it would activate the item under the finger)
  el.addEventListener("click", (e) => { if (fired) { fired = false; e.preventDefault(); e.stopPropagation(); } }, true);
}

// ---------------------------------------------------------------- busy overlay
export function busy(label) {
  const text = h("div.busy-text", label);
  const bar = h("div.busy-bar", h("i"));
  const el = h("div.busy", h("div.busy-card", h("div.spinner"), text, bar));
  overlay().append(el);
  return { update(t) { text.textContent = t; }, progress(f) { bar.firstChild.style.width = Math.round(f * 100) + "%"; bar.classList.toggle("on", f >= 0); }, close() { el.remove(); } };
}

// ---------------------------------------------------------------- global activity indicator (top progress bar + status bar spinner)
/** bus.emit("busy", id, label|null) from anywhere; or wrap work with busyTask(). */
export async function busyTask(id, label, fn) {
  const { bus } = await import("./events.js");
  bus.emit("busy", id, label);
  try { return await fn(); } finally { bus.emit("busy", id, null); }
}
/** Skeleton / spinner block for views that load asynchronously. */
export function loaderBlock(text = "Loading…") { return h("div.loader-block", h("div.spinner"), h("span", text)); }
export function skeleton(rows = 4) { return h("div.skeleton", Array.from({ length: rows }, (_, i) => h("div.sk-row", { style: { width: 55 + ((i * 37) % 40) + "%" } }))); }
