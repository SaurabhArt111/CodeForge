// Native-feeling AI edits: a review tab (Monaco's own diff editor with per-change revert arrows, next/previous change, accept / reject),
// and the "something else is editing my files" watcher: while an AI agent or a terminal tool (Claude Code, Codex, Gemini …) is working,
// open files are checked every ~1.5 s and patched in place, so edits appear live with the changed lines flashing.
import * as ed from "../ui/editor.js";
import { h, icon, isMobile } from "../core/util.js";

let timer = 0; const busy = new Set(); let cliCheck = () => false;
function tick() {
  if (document.hidden) return;
  const active = busy.size > 0 || cliCheck();
  ed.setExternalSource(active ? "cli" : "disk");
  if (active && ed.openPaths().length) ed.checkExternal();
}
/** Start the watcher. `isCliActive()` tells whether a coding tool runs in a terminal. */
export function start(isCliActive) { cliCheck = isCliActive || cliCheck; if (!timer) timer = setInterval(tick, 1500); }
/** the in-app agent marks itself busy while it works */
export function setBusy(key, on) { on ? busy.add(key) : busy.delete(key); tick(); }

/** Opens `newText` against `oldText` in a review tab. Resolves with the final text (the right side can be edited, single changes reverted) or null when rejected. */
export async function review({ path, oldText, newText, exists = true, title, language }) {
  await ed.loadMonaco(); const monaco = ed.monaco;
  const id = "ai-review:" + path; let finish;
  const done = new Promise((r) => { finish = r; });
  let settled = false; const settle = (v) => { if (settled) return; settled = true; finish(v); };
  ed.openCustom(id, "Review: " + (title || path.split("/").pop()), {
    iconName: "diff", singleton: true,
    render(el, tab) {
      el.classList.remove("scroll"); el.style.overflow = "hidden";
      const o = monaco.editor.createModel(oldText, language || ed.languageForPath(path)), m = monaco.editor.createModel(newText, language || ed.languageForPath(path));
      const host = h("div.air-host"); const count = h("span.air-count");
      const diffEd = monaco.editor.createDiffEditor(host, { ...ed.editorOptions(), renderSideBySide: !isMobile(), automaticLayout: true, originalEditable: false, readOnly: false, renderMarginRevertIcon: true, ignoreTrimWhitespace: false, theme: "cf-current" });
      diffEd.setModel({ original: o, modified: m });
      const changes = () => diffEd.getLineChanges?.() || [];
      const upd = () => { const n = changes().length; count.textContent = n ? `${n} change${n === 1 ? "" : "s"}` : "no changes left"; };
      diffEd.onDidUpdateDiff?.(upd); setTimeout(upd, 400);
      const go = (dir) => { const ch = changes(); if (!ch.length) return; const me = diffEd.getModifiedEditor(), cur = me.getPosition()?.lineNumber || 0; const ln = (c) => c.modifiedStartLineNumber || c.originalStartLineNumber; const nxt = dir === "next" ? ch.find((c) => ln(c) > cur) || ch[0] : [...ch].reverse().find((c) => ln(c) < cur) || ch[ch.length - 1]; me.revealLineInCenter(ln(nxt)); me.setPosition({ lineNumber: ln(nxt), column: 1 }); };
      const accept = () => { const text = m.getValue(); settle({ text }); ed.closeCustom(id); };
      const reject = () => { settle(null); ed.closeCustom(id); };
      const bar = h("div.air-bar", h("span.air-title", `${exists ? "AI changes to" : "New file"} ${path.split("/").slice(-2).join("/")}`), count, h("span.air-sp"),
        h("button.icon-btn", { title: "Previous change", onclick: () => go("previous") }, icon("arrow-up")), h("button.icon-btn", { title: "Next change", onclick: () => go("next") }, icon("arrow-down")),
        h("button.btn.small", { onclick: reject }, icon("close"), " Reject"), h("button.btn.small.primary", { onclick: accept }, icon("check"), exists ? " Apply" : " Create"));
      el.append(bar, host);
      setTimeout(() => go("next"), 450);
      tab.dispose = () => { settle(null); diffEd.dispose(); o.dispose(); m.dispose(); };
    },
  });
  return done;
}
