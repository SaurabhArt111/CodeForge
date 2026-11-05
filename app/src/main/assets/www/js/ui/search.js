// Workspace-wide search & replace (native streaming scan on the host, results grouped per file).
import { N } from "../core/bridge.js";
import { ws } from "./workspace.js";
import * as ed from "./editor.js";
import { h, icon, P, uid, debounce } from "../core/util.js";
import { toast, toastError, confirm } from "../core/ui.js";
import * as icons from "../features/icons.js";
import { bus } from "../core/events.js";

const opt = { regex: false, caseSensitive: false, wholeWord: false };
let qIn, rIn, incIn, excIn, resBox, summary, curId = null, last = null, replaceRow, detailsEl;

export function init() {
  const view = document.getElementById("view-search");
  qIn = h("input.input", { placeholder: "Search", spellcheck: false, autocapitalize: "off", onkeydown: (e) => { if (e.key === "Enter") run(); } });
  rIn = h("input.input", { placeholder: "Replace", spellcheck: false, autocapitalize: "off" });
  incIn = h("input.input", { placeholder: "files to include (e.g. src/**, *.js)", spellcheck: false, autocapitalize: "off" });
  excIn = h("input.input", { placeholder: "files to exclude", spellcheck: false, autocapitalize: "off", value: "node_modules, .git, dist, build, *.min.js, *.lock" });
  const tog = (k, ic, title) => { const b = h("button.icon-btn", { title, onclick: () => { opt[k] = !opt[k]; b.classList.toggle("on", opt[k]); run(); } }, icon(ic)); return b; };
  summary = h("div.muted", { style: { padding: "4px 14px", fontSize: "calc(12px * var(--fz))" } });
  resBox = h("div.view-body");
  detailsEl = h("div", { class: "hidden", style: { display: "none" } }, incIn, excIn);
  replaceRow = h("div.srow", rIn, h("button.icon-btn", { title: "Replace All", onclick: replaceAll }, icon("replace-all")));
  view.append(h("div.view-head", h("span.title", "Search"), h("button.icon-btn", { title: "Clear results", onclick: clear }, icon("clear-all")), h("button.icon-btn", { title: "Toggle details", onclick: () => (detailsEl.style.display = detailsEl.style.display === "none" ? "grid" : "none") }, icon("ellipsis"))),
    h("div.search-form", h("div.srow", qIn, tog("caseSensitive", "case-sensitive", "Match Case"), tog("wholeWord", "whole-word", "Match Whole Word"), tog("regex", "regex", "Use Regular Expression")), replaceRow, h("div.sdetails", { style: { display: "none" } }, incIn, excIn)),
    summary, resBox);
  detailsEl = view.querySelector(".sdetails");
  view.querySelector(".view-head .icon-btn:last-child").onclick = () => (detailsEl.style.display = detailsEl.style.display === "none" ? "grid" : "none");
  qIn.addEventListener("input", debounce(run, 350));
  bus.on("cmd:search", (seed) => { bus.emit("view", "search"); const sel = ed.selectionText(); if (seed || sel) qIn.value = (seed || sel).split("\n")[0]; qIn.focus(); qIn.select(); if (qIn.value) run(); });
  ws.on("root", clear);
}

const globs = (s) => s.split(",").map((x) => x.trim()).filter(Boolean);
export async function run() {
  if (!ws.isOpen || !qIn.value) { if (!qIn.value) clear(); return; }
  if (curId) N.search.cancel(curId);
  const id = (curId = uid());
  summary.textContent = "Searching…";
  try {
    const r = await N.search.text({ id, root: ws.root, query: qIn.value, regex: opt.regex, caseSensitive: opt.caseSensitive, wholeWord: opt.wholeWord, include: globs(incIn.value), exclude: globs(excIn.value), max: 3000 });
    if (id !== curId) return;
    last = r; show(r);
  } catch (e) { summary.textContent = e.message; }
}

function show(r) {
  const byFile = new Map();
  for (const m of r.results) { if (!byFile.has(m.path)) byFile.set(m.path, []); byFile.get(m.path).push(m); }
  summary.textContent = r.results.length ? `${r.results.length}${r.truncated ? "+" : ""} results in ${byFile.size} files` : "No results found.";
  resBox.replaceChildren();
  for (const [path, ms] of byFile) {
    const kids = h("div.sres");
    const head = h("div.row", { onclick: () => { head.classList.toggle("open"); kids.style.display = head.classList.contains("open") ? "" : "none"; } },
      h("span.chev", icon("chevron-right")), icons.fileIcon(P.base(path)), h("span.label", P.base(path)), h("span.meta", P.rel(ws.root, P.dir(path)) || ""), h("span.chip", String(ms.length)),
      h("span.actions", h("button.icon-btn", { title: "Replace in file", onclick: (e) => { e.stopPropagation(); replaceIn([path]); } }, icon("replace-all")), h("button.icon-btn", { title: "Dismiss", onclick: (e) => { e.stopPropagation(); head.remove(); kids.remove(); } }, icon("close"))));
    head.classList.add("open");
    for (const m of ms) {
      const t = m.text; const s = Math.max(0, m.col - 1 - 20); const pre = t.slice(s, m.col - 1), hit = t.slice(m.col - 1, m.col - 1 + m.len), post = t.slice(m.col - 1 + m.len, m.col - 1 + m.len + 120);
      kids.append(h("div.row.mrow", { style: { paddingLeft: "34px" }, title: `${m.rel}:${m.line}`, onclick: () => { ed.openFile(m.path, { line: m.line, col: m.col, preview: true }); if (window.matchMedia("(max-width:760px)").matches) bus.emit("sidebar:close"); } },
        h("span.label.mono", { style: { fontSize: "calc(12px * var(--fz))" } }, (s > 0 ? "…" : "") + pre.trimStart(), h("mark", hit), post), h("span.meta", String(m.line))));
    }
    resBox.append(head, kids);
  }
}

function clear() { curId = null; last = null; summary.textContent = ""; resBox?.replaceChildren(); }

function mkRegex() {
  let src = opt.regex ? qIn.value : qIn.value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (opt.wholeWord) src = `\\b(?:${src})\\b`;
  return new RegExp(src, "g" + (opt.caseSensitive ? "" : "i") + "m");
}

async function replaceIn(paths) {
  const re = mkRegex(); const rep = rIn.value; let n = 0;
  for (const p of paths) {
    const doc = ed.getDoc(p);
    if (doc?.model) { const full = doc.model.getValue(); const next = full.replace(re, (...a) => { n++; return expand(rep, a); }); if (next !== full) { doc.model.pushEditOperations([], [{ range: doc.model.getFullModelRange(), text: next }], () => null); await ed.save(p); } continue; }
    const r = await N.fs.readText(p); if (r.text == null) continue;
    const next = r.text.replace(re, (...a) => { n++; return expand(rep, a); });
    if (next !== r.text) await N.fs.writeText(p, next, { bom: r.bom });
  }
  return n;
}
function expand(rep, a) {
  if (!opt.regex) return rep;
  const groups = a.slice(0, a.findIndex((x) => typeof x === "number"));
  return rep.replace(/\$(\d+|&|\$)/g, (_, k) => (k === "$" ? "$" : k === "&" ? groups[0] : groups[+k] ?? ""));
}
async function replaceAll() {
  if (!last?.results?.length) return;
  const files = [...new Set(last.results.map((m) => m.path))];
  if (!(await confirm(`Replace ${last.results.length} occurrences across ${files.length} files with “${rIn.value}”?`, { title: "Replace All", okLabel: "Replace" }))) return;
  try { const n = await replaceIn(files); toast(`Replaced ${n} occurrences`, { kind: "success" }); run(); } catch (e) { toastError(e); }
}
