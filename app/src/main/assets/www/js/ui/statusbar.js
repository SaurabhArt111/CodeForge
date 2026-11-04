// Status bar: branch, problems, live-server, cursor, selection, indent, encoding, EOL, language, AI/account.
import { bus } from "../core/events.js";
import { h, icon } from "../core/util.js";
import * as ed from "./editor.js";
import * as cmd from "./commands.js";
import { ws } from "./workspace.js";

const items = new Map();
let left, right;
export function item(id, { side = "left", priority = 0, mobile = true, icon: ic, text = "", title = "", onClick, cls = "" } = {}) {
  let el = items.get(id)?.el;
  if (!el) {
    el = h("div.sb-item", { dataset: { id } }); items.set(id, { el, side, priority });
    (side === "left" ? left : right).append(el);
  }
  el.className = "sb-item " + cls + (mobile ? "" : " hide-m");
  el.title = title; el.style.order = String(priority);
  el.replaceChildren(...[ic ? icon(ic.replace("~spin", ""), ic.includes("~spin") ? "codicon-modifier-spin" : "") : null, text ? h("span", text) : null].filter(Boolean));
  el.onclick = onClick || null; el.style.display = text || ic ? "" : "none";
  return el;
}
export function remove(id) { items.get(id)?.el.remove(); items.delete(id); }

export function init() {
  // global activity indicator: slim animated bar under the title bar + spinner item in the status bar
  const busy = new Map(); const top = document.getElementById("toploader");
  bus.on("busy", (id, label) => {
    if (label) busy.set(id, label); else busy.delete(id);
    top?.classList.toggle("on", busy.size > 0);
    if (busy.size) item("busy", { side: "left", priority: 1, ic: "sync~spin", text: [...busy.values()].pop(), title: "Working…" }); else remove("busy");
  });
  left = document.getElementById("sb-left"); right = document.getElementById("sb-right");
  const refresh = () => {
    const t = ed.activeTab(); const e = ed.activeEditor(); const d = t?.kind === "file" ? t.doc : null;
    if (d && e) {
      const pos = e.getPosition(); const sel = e.getSelection();
      const selTxt = sel && !sel.isEmpty() ? ` (${e.getModel().getValueInRange(sel).length} selected)` : "";
      item("pos", { side: "right", priority: 10, text: pos ? `Ln ${pos.lineNumber}, Col ${pos.column}${selTxt}` : "", title: "Go to Line", onClick: cmd.gotoLine });
      const o = d.model.getOptions();
      item("indent", { side: "right", priority: 20, mobile: false, text: (o.insertSpaces ? "Spaces: " : "Tab Size: ") + o.tabSize, onClick: cmd.pickIndent, title: "Select Indentation" });
      item("enc", { side: "right", priority: 30, mobile: false, text: d.bom ? "UTF-8 with BOM" : "UTF-8", title: "Encoding" });
      item("eol", { side: "right", priority: 40, mobile: false, text: d.model.getEOL() === "\r\n" ? "CRLF" : "LF", onClick: cmd.pickEol, title: "End of Line Sequence" });
      item("lang", { side: "right", priority: 50, text: ed.monaco.languages.getLanguages().find((l) => l.id === d.model.getLanguageId())?.aliases?.[0] || d.model.getLanguageId(), onClick: cmd.pickLanguage, title: "Select Language Mode" });
    } else for (const id of ["pos", "indent", "enc", "eol", "lang"]) remove(id);
  };
  ed.editorEvents.on("cursor", refresh); ed.editorEvents.on("selection", refresh); ed.editorEvents.on("active", refresh); ed.editorEvents.on("language", refresh);
  bus.on("markers", () => {
    const m = ed.markers(); const err = m.filter((x) => x.severity === 8).length, warn = m.filter((x) => x.severity === 4).length;
    item("problems", { side: "left", priority: 5, ic: "error", text: `${err}  ⚠ ${warn}`, title: "Problems", onClick: () => bus.emit("panel", "problems") });
    const b = document.getElementById("problems-count"); b.textContent = String(err + warn); b.classList.toggle("hidden", !(err + warn));
  });
  item("problems", { side: "left", priority: 5, ic: "error", text: "0  ⚠ 0", title: "Problems", onClick: () => bus.emit("panel", "problems") });
  item("folder", { side: "left", priority: 1, ic: "folder", text: ws.name || "No folder", onClick: () => bus.emit("cmd:openfolder"), title: "Open Folder" });
  ws.on("root", () => item("folder", { side: "left", priority: 1, ic: "folder", text: ws.name || "No folder", onClick: () => bus.emit("cmd:openfolder"), title: ws.root || "Open Folder" }));
  refresh();
}
