// VS Code colour themes -> Monaco themes + CSS variables for the whole IDE (+ terminal palette).
import { Emitter } from "../core/events.js";
import { settings } from "../core/settings.js";
import { parseJsonc } from "../core/util.js";
import { N } from "../core/bridge.js";

export const themeEvents = new Emitter();
const registry = new Map(); // id -> {id,label,uiTheme,load():Promise<json>, source}
let monaco = null;
export let current = null; // {id, type, colors}

const DARK = {
  bg: "#1f1f1f", fg: "#cccccc", sidebarBg: "#181818", sidebarFg: "#cccccc", activityBg: "#181818", activityFg: "#d7d7d7", activityInactive: "#868686",
  titleBg: "#181818", titleFg: "#cccccc", tabActiveBg: "#1f1f1f", tabInactiveBg: "#181818", tabActiveFg: "#ffffff", tabInactiveFg: "#9d9d9d", tabBorder: "#2b2b2b",
  statusBg: "#181818", statusFg: "#cccccc", panelBg: "#181818", border: "#2b2b2b", accent: "#0078d4", accentFg: "#ffffff", accentHover: "#026ec1", focus: "#0078d4",
  hover: "#2a2d2e", selected: "#04395e", selectedFg: "#ffffff", inactiveSelected: "#37373d", inputBg: "#313131", inputBorder: "#3c3c3c", inputFg: "#cccccc",
  muted: "#9d9d9d", link: "#3794ff", danger: "#f85149", warn: "#cca700", ok: "#3fb950", widgetBg: "#202020", widgetBorder: "#454545",
  gitAdded: "#81b88b", gitModified: "#e2c08d", gitDeleted: "#c74e39", gitUntracked: "#73c991", badge: "#0078d4", badgeFg: "#ffffff",
};
const LIGHT = {
  bg: "#ffffff", fg: "#3b3b3b", sidebarBg: "#f8f8f8", sidebarFg: "#3b3b3b", activityBg: "#f8f8f8", activityFg: "#1f1f1f", activityInactive: "#616161",
  titleBg: "#f8f8f8", titleFg: "#3b3b3b", tabActiveBg: "#ffffff", tabInactiveBg: "#f8f8f8", tabActiveFg: "#333333", tabInactiveFg: "#8e8e90", tabBorder: "#e5e5e5",
  statusBg: "#f8f8f8", statusFg: "#3b3b3b", panelBg: "#f8f8f8", border: "#e5e5e5", accent: "#005fb8", accentFg: "#ffffff", accentHover: "#0258a8", focus: "#005fb8",
  hover: "#f2f2f2", selected: "#e8e8e8", selectedFg: "#000000", inactiveSelected: "#e4e6f1", inputBg: "#ffffff", inputBorder: "#cecece", inputFg: "#3b3b3b",
  muted: "#717171", link: "#006ab1", danger: "#e51400", warn: "#bf8803", ok: "#2e7d32", widgetBg: "#f8f8f8", widgetBorder: "#c8c8c8",
  gitAdded: "#587c0c", gitModified: "#895503", gitDeleted: "#ad0707", gitUntracked: "#007100", badge: "#005fb8", badgeFg: "#ffffff",
};

const MAP = [
  ["bg", "editor.background"], ["fg", "editor.foreground", "foreground"], ["sidebarBg", "sideBar.background"], ["sidebarFg", "sideBar.foreground", "foreground"],
  ["activityBg", "activityBar.background"], ["activityFg", "activityBar.foreground"], ["activityInactive", "activityBar.inactiveForeground"],
  ["titleBg", "titleBar.activeBackground"], ["titleFg", "titleBar.activeForeground"],
  ["tabActiveBg", "tab.activeBackground", "editor.background"], ["tabInactiveBg", "tab.inactiveBackground"], ["tabActiveFg", "tab.activeForeground"], ["tabInactiveFg", "tab.inactiveForeground"], ["tabBorder", "tab.border"],
  ["statusBg", "statusBar.background"], ["statusFg", "statusBar.foreground"], ["panelBg", "panel.background", "editor.background"], ["border", "panel.border", "sideBar.border", "contrastBorder"],
  ["accent", "button.background", "focusBorder"], ["accentFg", "button.foreground"], ["accentHover", "button.hoverBackground"], ["focus", "focusBorder"],
  ["hover", "list.hoverBackground"], ["selected", "list.activeSelectionBackground"], ["selectedFg", "list.activeSelectionForeground"], ["inactiveSelected", "list.inactiveSelectionBackground"],
  ["inputBg", "input.background"], ["inputBorder", "input.border"], ["inputFg", "input.foreground"], ["muted", "descriptionForeground"], ["link", "textLink.foreground"],
  ["danger", "errorForeground"], ["warn", "editorWarning.foreground"], ["widgetBg", "editorWidget.background"], ["widgetBorder", "editorWidget.border", "widget.border"],
  ["gitAdded", "gitDecoration.addedResourceForeground"], ["gitModified", "gitDecoration.modifiedResourceForeground"], ["gitDeleted", "gitDecoration.deletedResourceForeground"], ["gitUntracked", "gitDecoration.untrackedResourceForeground"],
  ["badge", "activityBarBadge.background", "badge.background"], ["badgeFg", "activityBarBadge.foreground", "badge.foreground"],
];
const isColor = (c) => typeof c === "string" && /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(c);

// TextMate scope -> Monaco (Monarch) token names
const SCOPE_TO_TOKENS = [
  [/^comment/, ["comment", "comment.doc"]], [/^string\.regexp|regexp/, ["regexp"]], [/^string/, ["string", "string.escape.invalid"]],
  [/^constant\.numeric|^constant\.character\.numeric/, ["number", "number.hex", "number.float", "number.octal", "number.binary"]],
  [/^constant\.language|^constant\.character|^constant\.other|^constant$/, ["constant", "keyword.constant"]],
  [/^keyword\.operator/, ["operator", "delimiter.operator"]], [/^keyword|^storage|^keyword\.control/, ["keyword", "keyword.flow", "keyword.json"]],
  [/^entity\.name\.type|^entity\.name\.class|^support\.type|^support\.class|^entity\.other\.inherited-class/, ["type", "type.identifier"]],
  [/^entity\.name\.function|^support\.function|^meta\.function-call/, ["function", "predefined"]],
  [/^entity\.name\.tag|^meta\.tag|^punctuation\.definition\.tag/, ["tag", "metatag"]], [/^entity\.other\.attribute-name/, ["attribute.name"]],
  [/^string\.quoted.*attribute|attribute-value/, ["attribute.value"]],
  [/^variable\.parameter/, ["variable.parameter"]], [/^variable/, ["variable", "variable.predefined"]],
  [/^support\.type\.property-name|^meta\.object-literal\.key|^support\.type\.property/, ["key", "string.key.json", "attribute.name"]],
  [/^punctuation|^meta\.brace/, ["delimiter", "delimiter.bracket"]], [/^invalid/, ["invalid"]], [/^meta\.preprocessor|^entity\.name\.function\.preprocessor/, ["metatag", "annotation"]],
  [/^markup\.heading|^entity\.name\.section/, ["keyword"]], [/^storage\.type\.annotation|^meta\.annotation|^entity\.name\.decorator/, ["annotation"]],
];

function tokenRules(tokenColors) {
  const rules = []; let globalFg = null;
  for (const tc of tokenColors || []) {
    const s = tc.settings || {};
    const scopes = tc.scope == null ? [] : Array.isArray(tc.scope) ? tc.scope : String(tc.scope).split(",");
    if (!scopes.length) { if (s.foreground) globalFg = s.foreground; continue; }
    const seen = new Set();
    for (const sc of scopes.map((x) => x.trim())) for (const [re, toks] of SCOPE_TO_TOKENS) if (re.test(sc)) for (const t of toks) if (!seen.has(t)) {
      seen.add(t);
      const r = { token: t }; if (isColor(s.foreground)) r.foreground = s.foreground.replace("#", "").slice(0, 6); if (s.fontStyle) r.fontStyle = s.fontStyle;
      if (r.foreground || r.fontStyle) rules.push(r);
    }
  }
  return { rules, globalFg };
}

export function register(t) { registry.set(t.id, t); themeEvents.emit("registry"); }
export function unregisterSource(source) { for (const [k, v] of registry) if (v.source === source) registry.delete(k); themeEvents.emit("registry"); }
export const list = () => [...registry.values()];

export async function init() {
  const base = "assets/vscode/themes/";
  const idx = await (await fetch(base + "index.json")).json();
  for (const t of idx) register({ id: t.id, label: t.label, uiTheme: t.uiTheme, source: "builtin", load: async () => resolveInclude(await (await fetch(base + t.file)).text(), async (rel) => (await fetch(base + rel.replace(/^\.\//, ""))).text()) });
}

async function resolveInclude(text, readRel) {
  const j = parseJsonc(text);
  if (j.include) {
    const parent = await resolveInclude(await readRel(j.include), readRel);
    return { ...parent, ...j, colors: { ...(parent.colors || {}), ...(j.colors || {}) }, tokenColors: [...(parent.tokenColors || []), ...(j.tokenColors || [])], semanticTokenColors: { ...(parent.semanticTokenColors || {}), ...(j.semanticTokenColors || {}) } };
  }
  return j;
}
export { resolveInclude };

export function attachMonaco(m) { monaco = m; if (current) defineMonaco(current); }

function defineMonaco(t) {
  if (!monaco) return;
  const { rules, globalFg } = tokenRules(t.json.tokenColors);
  const colors = {};
  for (const [k, v] of Object.entries(t.json.colors || {})) if (isColor(v)) colors[k] = v;
  if (globalFg && isColor(globalFg) && !colors["editor.foreground"]) colors["editor.foreground"] = globalFg;
  const base = t.type === "hc" ? "hc-black" : t.type === "light" ? "vs" : "vs-dark";
  monaco.editor.defineTheme("cf-current", { base, inherit: true, rules, colors });
  monaco.editor.setTheme("cf-current");
}

export async function apply(id) {
  let t = registry.get(id) || registry.get("Dark Modern") || [...registry.values()][0];
  if (!t) return;
  const json = await t.load();
  const uiTheme = t.uiTheme || (json.type === "light" ? "vs" : "vs-dark");
  const type = uiTheme === "vs" ? "light" : uiTheme.startsWith("hc") ? (uiTheme === "hc-light" ? "light" : "hc") : "dark";
  const pal = { ...(type === "light" ? LIGHT : DARK) };
  const col = json.colors || {};
  for (const [key, ...srcs] of MAP) for (const s of srcs.length ? srcs : []) { const v = col[s]; if (isColor(v)) { pal[key] = v; break; } }
  if (!isColor(col["activityBar.background"])) pal.activityBg = pal.sidebarBg;
  if (!isColor(col["titleBar.activeBackground"])) pal.titleBg = pal.activityBg;
  if (!isColor(col["statusBar.background"])) pal.statusBg = type === "light" ? pal.sidebarBg : pal.accent;
  if (!isColor(col["statusBar.foreground"])) pal.statusFg = type === "light" ? pal.fg : "#ffffff";
  if (!isColor(col["tab.inactiveBackground"])) pal.tabInactiveBg = pal.sidebarBg;
  if (!isColor(col["panel.border"]) && !isColor(col["sideBar.border"]) && !isColor(col["contrastBorder"])) pal.border = type === "light" ? "#e0e0e0" : "#ffffff1a";
  if (!isColor(col["activityBar.inactiveForeground"])) pal.activityInactive = pal.muted;
  const root = document.documentElement;
  for (const [k, v] of Object.entries(pal)) root.style.setProperty("--" + k.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase()), v);
  root.dataset.theme = type;
  current = { id: t.id, type, colors: col, json, pal };
  defineMonaco(current);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", pal.titleBg);
  try { N.sys.setStatusBar(pal.titleBg.slice(0, 7), type === "light"); } catch { /* ignore */ }
  themeEvents.emit("change", current);
}

/** ANSI palette for xterm derived from the active VS Code theme. */
export function terminalPalette() {
  const c = current?.colors || {}, p = current?.pal || DARK;
  const pick = (k, d) => (isColor(c[k]) ? c[k] : d);
  const dark = current?.type !== "light";
  return {
    background: pick("terminal.background", p.panelBg), foreground: pick("terminal.foreground", p.fg), cursor: pick("terminalCursor.foreground", p.fg),
    selectionBackground: pick("terminal.selectionBackground", dark ? "#264f78" : "#add6ff"),
    black: pick("terminal.ansiBlack", dark ? "#000000" : "#000000"), red: pick("terminal.ansiRed", dark ? "#cd3131" : "#cd3131"), green: pick("terminal.ansiGreen", dark ? "#0dbc79" : "#00bc00"),
    yellow: pick("terminal.ansiYellow", dark ? "#e5e510" : "#949800"), blue: pick("terminal.ansiBlue", dark ? "#2472c8" : "#0451a5"), magenta: pick("terminal.ansiMagenta", dark ? "#bc3fbc" : "#bc05bc"),
    cyan: pick("terminal.ansiCyan", dark ? "#11a8cd" : "#0598bc"), white: pick("terminal.ansiWhite", dark ? "#e5e5e5" : "#555555"),
    brightBlack: pick("terminal.ansiBrightBlack", "#666666"), brightRed: pick("terminal.ansiBrightRed", "#f14c4c"), brightGreen: pick("terminal.ansiBrightGreen", "#23d18b"),
    brightYellow: pick("terminal.ansiBrightYellow", "#f5f543"), brightBlue: pick("terminal.ansiBrightBlue", "#3b8eea"), brightMagenta: pick("terminal.ansiBrightMagenta", "#d670d6"),
    brightCyan: pick("terminal.ansiBrightCyan", "#29b8db"), brightWhite: pick("terminal.ansiBrightWhite", "#e5e5e5"),
  };
}

/** Termux:Styling colour schemes (color0-15 + fg/bg/cursor) -> xterm theme. */
let schemes = null;
export async function loadSchemes() { if (!schemes) schemes = await (await fetch("assets/terminal/schemes.json")).json(); return schemes; }
export async function schemePalette(name) {
  const s = (await loadSchemes())[name]; if (!s) return null;
  const k = ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white"]; const o = { background: s.background, foreground: s.foreground, cursor: s.cursor || s.foreground };
  k.forEach((n, i) => { o[n] = s["color" + i] || o.foreground; o["bright" + n[0].toUpperCase() + n.slice(1)] = s["color" + (i + 8)] || s["color" + i] || o.foreground; });
  return o;
}
