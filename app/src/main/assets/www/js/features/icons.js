// File / folder icon themes: VS Code's Seti (font based) by default, plus SVG icon themes from extensions.
import { h, icon, P } from "../core/util.js";
import { Emitter } from "../core/events.js";
import { N } from "../core/bridge.js";

export const iconEvents = new Emitter();
const themes = new Map();   // id -> {id,label,def,resolveUrl?,source}
let active = null;
let langOf = () => null;    // (filename) -> languageId, set by editor

export function setLanguageResolver(fn) { langOf = fn; }

// codicon fallback colours (used when icon theme is "none" or a name is unknown)
const EXT_COLORS = { js: "#f1e05a", mjs: "#f1e05a", ts: "#3178c6", tsx: "#3178c6", jsx: "#61dafb", json: "#cbcb41", html: "#e44d26", css: "#563d7c", scss: "#c6538c", md: "#519aba", py: "#3572a5", java: "#b07219", kt: "#a97bff", c: "#555", cpp: "#f34b7d", go: "#00add8", rs: "#dea584", rb: "#cc342d", php: "#8892bf", sh: "#89e051", yml: "#cb171e", yaml: "#cb171e" };

export async function init() {
  const base = "assets/vscode/seti/";
  const def = await (await fetch(base + "vs-seti-icon-theme.json")).json();
  const style = document.createElement("style");
  style.textContent = `@font-face{font-family:"seti";src:url("${base}seti.woff") format("woff");font-weight:normal;font-style:normal}`;
  document.head.append(style);
  register({ id: "seti", label: "Seti (Visual Studio Code)", def, font: "seti", source: "builtin" });
  register({ id: "none", label: "Minimal (Codicons)", def: null, source: "builtin" });
}

export function register(t) { themes.set(t.id, t); iconEvents.emit("registry"); }
export function unregisterSource(source) { for (const [k, v] of themes) if (v.source === source) themes.delete(k); iconEvents.emit("registry"); }
export const list = () => [...themes.values()];
export const activeId = () => active?.id;
export function use(id) { active = themes.get(id) || themes.get("seti"); iconEvents.emit("change", active?.id); }

const cp = (s) => { try { return String.fromCodePoint(parseInt(String(s).replace(/^\\/, ""), 16)); } catch { return ""; } };

function lookupFile(def, name, lang, light) {
  const d = (light && def.light) || def;
  const lower = name.toLowerCase();
  let id = d.fileNames?.[lower] ?? def.fileNames?.[lower];
  if (!id) {
    const parts = lower.split(".");
    for (let i = 1; i < parts.length && !id; i++) { const e = parts.slice(i).join("."); id = d.fileExtensions?.[e] ?? def.fileExtensions?.[e]; }
  }
  if (!id && lang) id = d.languageIds?.[lang] ?? def.languageIds?.[lang];
  return id ?? d.file ?? def.file;
}

function render(t, defId, light, fallbackCls) {
  const def = t.def; const ic = def.iconDefinitions?.[defId];
  if (!ic) return null;
  if (ic.fontCharacter) {
    const el = h("span.fi.glyph", { style: { fontFamily: t.font || "inherit", color: (light && ic.fontColor) || ic.fontColor || "inherit" } }, cp(ic.fontCharacter));
    // size comes from CSS (.fi.glyph) – a percentage here compounds with the parent's font size and blew up in tabs
    return el;
  }
  if (ic.iconPath) {
    const img = h("img.fi.img", { alt: "", draggable: false });
    const p = P.join(t.baseDir, ic.iconPath);
    N.fs.url(p).then((u) => (img.src = u));
    return img;
  }
  return null;
}

export function fileIcon(name, { light = document.documentElement.dataset.theme === "light" } = {}) {
  const t = active;
  if (t?.def) {
    const id = lookupFile(t.def, name, langOf(name), light);
    const el = id && render(t, id, light);
    if (el) return el;
  }
  const ext = P.ext(name);
  const el = icon("file"); el.classList.add("fi"); if (EXT_COLORS[ext]) el.style.color = EXT_COLORS[ext];
  return el;
}

export function folderIcon(name, open, isRoot = false) {
  const t = active;
  if (t?.def && (t.def.folder || t.def.folderNames)) {
    const d = t.def, lower = name.toLowerCase();
    const id = open ? (d.folderNamesExpanded?.[lower] ?? d.folderExpanded ?? d.folder) : (d.folderNames?.[lower] ?? d.folder);
    const el = id && render(t, id, false);
    if (el) return el;
  }
  return icon(open ? "folder-opened" : "folder", "fi folder");
}
