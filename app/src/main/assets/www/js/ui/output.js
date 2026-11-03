// Output channels + Problems list (Monaco markers).
import { bus } from "../core/events.js";
import { h, icon, P, debounce } from "../core/util.js";
import * as panel from "./panel.js";
import * as ed from "./editor.js";
import { ws } from "./workspace.js";

const channels = new Map(); let current = "CodeForge"; let outEl, logEl, sel;
export function init() {
  const pane = panel.pane("output");
  sel = h("select", { style: { width: "auto" }, onchange: () => { current = sel.value; renderOut(); } });
  logEl = h("pre.out-log.selectable");
  pane.append(h("div.term-bar", sel, h("div", { style: { flex: 1 } }), h("button.icon-btn", { title: "Clear", onclick: () => { channels.set(current, []); renderOut(); } }, icon("clear-all"))), logEl);
  append("CodeForge", "CodeForge started\n");
  // problems
  const pp = panel.pane("problems"); const list = h("div.view-body"); pp.append(list);
  const render = debounce(() => {
    const ms = ed.markers().filter((m) => m.severity >= 4).sort((a, b) => b.severity - a.severity);
    const byFile = new Map(); for (const m of ms) { const p = m.resource.path; if (!byFile.has(p)) byFile.set(p, []); byFile.get(p).push(m); }
    list.replaceChildren(); if (!ms.length) list.append(h("div.empty-state", "No problems have been detected in the workspace."));
    for (const [p, arr] of byFile) {
      list.append(h("div.row", { style: { fontWeight: 600 } }, h("span.chev"), h("span.label", P.base(p)), h("span.meta", ws.root ? P.rel(ws.root, P.dir(p)) : ""), h("span.chip", String(arr.length))));
      for (const m of arr) list.append(h("div.row", { style: { paddingLeft: "28px" }, onclick: () => ed.openFile(p, { line: m.startLineNumber, col: m.startColumn }) },
        icon(m.severity === 8 ? "error" : "warning"), h("span.label", m.message.split("\n")[0]), h("span.meta", `[${m.startLineNumber}, ${m.startColumn}]`)));
    }
  }, 300);
  bus.on("markers", render); render();
}
export function append(channel, text) {
  if (!channels.has(channel)) { channels.set(channel, []); sel?.append(h("option", { value: channel }, channel)); }
  const arr = channels.get(channel); arr.push(text); if (arr.length > 2000) arr.splice(0, arr.length - 2000);
  if (channel === current && logEl) { logEl.append(document.createTextNode(text)); logEl.parentElement.scrollTop = logEl.parentElement.scrollHeight; }
}
export function show(channel) { current = channel; if (sel) sel.value = channel; renderOut(); panel.show("output"); }
function renderOut() { if (!logEl) return; logEl.textContent = (channels.get(current) || []).join(""); logEl.parentElement.scrollTop = logEl.parentElement.scrollHeight; }
