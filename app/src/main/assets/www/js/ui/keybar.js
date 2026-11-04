// Extra key row for soft keyboards (Esc/Tab/Ctrl/Alt/arrows/symbols/clipboard) – feeds the focused terminal or Monaco editor.
import { N } from "../core/bridge.js";
import { settings } from "../core/settings.js";
import { bus } from "../core/events.js";
import { h, icon, isTouch } from "../core/util.js";
import * as term from "./terminal.js";
import * as ed from "./editor.js";
import * as panel from "./panel.js";

let row, root, focusTarget = "editor", kbdOpen = false, baseH = 0;

const K = (label, o) => ({ label, ...o });
const KEYS = [
  K("Esc", { seq: "\x1b", mk: "escape" }), K("Tab", { seq: "\t", mk: "tab" }),
  K("Shift", { mod: "shift" }), K("Ctrl", { mod: "ctrl" }), K("Alt", { mod: "alt" }),
  K("←", { seq: "\x1b[D", mk: "cursorLeft" }), K("↓", { seq: "\x1b[B", mk: "cursorDown" }), K("↑", { seq: "\x1b[A", mk: "cursorUp" }), K("→", { seq: "\x1b[C", mk: "cursorRight" }),
  K("Home", { seq: "\x1b[H", mk: "cursorHome" }), K("End", { seq: "\x1b[F", mk: "cursorEnd" }), K("PgUp", { seq: "\x1b[5~", mk: "cursorPageUp" }), K("PgDn", { seq: "\x1b[6~", mk: "cursorPageDown" }),
  { sep: true },
  K("undo", { icon: "discard", act: "undo" }), K("redo", { icon: "redo", act: "redo" }), K("copy", { icon: "copy", act: "copy" }), K("cut", { icon: "scissors", act: "cut" }), K("paste", { icon: "clippy", act: "paste" }), K("all", { icon: "list-flat", act: "selectAll" }),
  { sep: true },
  ...["{", "}", "(", ")", "[", "]", "<", ">", "/", "\\", "|", "&", "$", "~", "`", "'", '"', "=", ";", ":", "_", "-", "+", "*", "#", "!", "?", "@", "%", "^"].map((c) => K(c, { ch: c })),
];

export function init() {
  root = document.getElementById("keybar"); row = document.getElementById("keybar-row");
  for (const k of KEYS) {
    if (k.sep) { row.append(h("button.kb.sep")); continue; }
    const b = h("button.kb", { dataset: { mod: k.mod || "" }, onpointerdown: (e) => e.preventDefault(), onclick: () => press(k, b) }, k.icon ? icon(k.icon) : k.label);
    if (k.mk || k.act) b.dataset.repeat = "1";
    attachRepeat(b, k, () => press(k, b));
    row.append(b);
  }
  bus.on("term:mods", (m) => row.querySelectorAll("[data-mod]").forEach((b) => b.classList.toggle("on", !!m[b.dataset.mod])));
  document.addEventListener("focusin", (e) => { focusTarget = e.target.closest?.(".xterm") ? "terminal" : e.target.closest?.(".monaco-editor") ? "editor" : focusTarget; refresh(); });
  baseH = window.innerHeight;
  window.addEventListener("resize", () => { if (window.innerHeight > baseH) baseH = window.innerHeight; kbdOpen = window.innerHeight < baseH - 140; document.body.classList.toggle("kbd-open", kbdOpen); refresh(); });
  settings.on("change:ui.mobileKeyBar", refresh);
  refresh();
}

function attachRepeat(b, k, fn) {
  if (!(k.mk || k.seq && /\[[ABCD]/.test(k.seq))) return;
  let t1, t2;
  const stop = () => { clearTimeout(t1); clearInterval(t2); };
  b.addEventListener("pointerdown", () => { t1 = setTimeout(() => { t2 = setInterval(fn, 60); }, 420); });
  ["pointerup", "pointerleave", "pointercancel"].forEach((e) => b.addEventListener(e, stop));
}

function refresh() {
  const show = isTouch() && settings.get("ui.mobileKeyBar") && (kbdOpen || (panel.isOpen() && panel.active() === "terminal" && document.activeElement?.closest?.(".xterm")));
  root.classList.toggle("hidden", !show);
}

async function press(k, btn) {
  const toTerm = focusTarget === "terminal" && panel.isOpen();
  if (k.mod) { term.setMod(k.mod, !term.modifiers[k.mod]); return; }
  const shift = term.modifiers.shift;
  if (toTerm) {
    if (k.seq) return term.sendKey(k.seq);   // Shift (Shift+Tab, Shift+arrows) is applied inside sendKey
    if (k.ch) return sendTermChar(k.ch);
    if (k.act === "paste") return term.pasteFromClipboard();
    if (k.act === "copy") { const t = term.get(); if (t?.xt.hasSelection()) N.sys.clipboardSet(t.xt.getSelection()); return; }
    if (k.act === "selectAll") return term.get()?.xt.selectAll();
    return;
  }
  const e = ed.activeEditor(); if (!e) return;
  e.focus();
  if (k.ch) { term.setMod("shift", false); return e.trigger("keyboard", "type", { text: k.ch }); }
  if (k.mk === "tab") { term.setMod("shift", false); return e.trigger("keyboard", shift ? "outdent" : "tab", null); }
  if (k.mk === "escape") return e.trigger("keyboard", "hideSuggestWidget", null) || e.trigger("keyboard", "removeSecondaryCursors", null);
  if (k.mk) {
    // sticky Shift in the editor = extend selection with arrows / Home / End / PgUp / PgDn
    const sel = { cursorLeft: "cursorLeftSelect", cursorRight: "cursorRightSelect", cursorUp: "cursorUpSelect", cursorDown: "cursorDownSelect", cursorHome: "cursorHomeSelect", cursorEnd: "cursorEndSelect", cursorPageUp: "cursorPageUpSelect", cursorPageDown: "cursorPageDownSelect" };
    return e.trigger("keyboard", shift && sel[k.mk] ? sel[k.mk] : k.mk, null);
  }
  if (k.act === "undo") return ed.undo();
  if (k.act === "redo") return ed.redo();
  if (k.act === "selectAll") return e.setSelection(e.getModel().getFullModelRange());
  if (k.act === "copy" || k.act === "cut") {
    const sel = e.getSelection(); const m = e.getModel();
    const text = sel.isEmpty() ? m.getLineContent(sel.startLineNumber) + "\n" : m.getValueInRange(sel);
    await N.sys.clipboardSet(text);
    if (k.act === "cut") { e.executeEdits("kb", [{ range: sel.isEmpty() ? new ed.monaco.Range(sel.startLineNumber, 1, sel.startLineNumber + 1, 1) : sel, text: "" }]); }
    return;
  }
  if (k.act === "paste") { const text = await N.sys.clipboardGet(); if (text) e.executeEdits("kb", [{ range: e.getSelection(), text, forceMoveMarkers: true }]); e.pushUndoStop(); }
}
function sendTermChar(c) { term.sendKey(c); }
