// Settings editor (a tab): searchable, schema driven; theme / icon-theme / font / terminal-scheme pickers; JSON escape hatch.
import { settings, DEFAULTS } from "../core/settings.js";
import { h, icon, P } from "../core/util.js";
import * as themes from "../features/themes.js";
import * as icons from "../features/icons.js";
import * as ed from "./editor.js";
import { N } from "../core/bridge.js";
import { bus } from "../core/events.js";
import * as security from "./security.js";

const FONTS = ["JetBrains Mono", "Cascadia Code", "Fira Code", "monospace"];
const S = (key, label, type, extra = {}) => ({ key, label, type, ...extra });
export const SCHEMA = [
  ["Appearance", [
    S("ui.theme", "Color Theme", "theme"), S("ui.iconTheme", "File Icon Theme", "icontheme"), S("ui.mobileKeyBar", "Extra key row on touch keyboards", "bool"),
  ]],
  ["Editor", [
    S("editor.fontSize", "Font Size", "number", { min: 8, max: 40 }), S("editor.fontFamily", "Font Family", "select", { options: FONTS }), S("editor.ligatures", "Font Ligatures", "bool"),
    S("editor.tabSize", "Tab Size", "number", { min: 1, max: 8 }), S("editor.insertSpaces", "Insert Spaces", "bool"), S("editor.wordWrap", "Word Wrap", "select", { options: ["off", "on", "wordWrapColumn", "bounded"] }),
    S("editor.minimap", "Minimap", "bool"), S("editor.lineNumbers", "Line Numbers", "select", { options: ["on", "off", "relative"] }), S("editor.renderWhitespace", "Render Whitespace", "select", { options: ["none", "boundary", "selection", "trailing", "all"] }),
    S("editor.bracketPairColors", "Bracket Pair Colorization", "bool"), S("editor.smoothScrolling", "Smooth Scrolling", "bool"), S("editor.cursorBlinking", "Cursor Blinking", "select", { options: ["blink", "smooth", "phase", "expand", "solid"] }),
    S("editor.stickyScroll", "Sticky Scroll", "bool"), S("editor.formatOnSave", "Format On Save (Prettier)", "bool"), S("editor.formatOnPaste", "Format On Paste", "bool"), S("editor.emmet", "Emmet abbreviations", "bool"),
    S("editor.lineHeight", "Line Height (0 = auto)", "number", { min: 0, max: 60 }), S("editor.scrollBeyondLastLine", "Scroll beyond last line", "bool"), S("editor.bottomPadding", "Blank space after last line (px)", "number", { min: 0, max: 600 }),
    S("editor.quickSuggestions", "Suggest while typing", "bool"), S("editor.acceptSuggestionOnEnter", "Accept suggestion on Enter", "select", { options: ["on", "smart", "off"] }), S("editor.parameterHints", "Parameter hints", "bool"),
    S("editor.linkedEditing", "Rename paired HTML tags together", "bool"), S("editor.autoClosing", "Auto-close brackets & quotes", "bool"), S("editor.formatOnType", "Format on type", "bool"),
  ]],
  ["Files", [
    S("files.autoSave", "Auto Save", "select", { options: ["off", "afterDelay", "onFocusChange"] }), S("files.autoSaveDelay", "Auto Save Delay (ms)", "number", { min: 200, max: 10000 }),
    S("files.showHidden", "Show hidden files (dotfiles)", "bool"), S("files.confirmDelete", "Confirm before deleting", "bool"),
  ]],
  ["Terminal", [
    S("terminal.mode", "Default shell", "select", { options: ["auto", "host", "linux"], hint: "auto = Alpine Linux if installed, else Android sh" }), S("terminal.fontSize", "Font Size (pinch the terminal to zoom)", "number", { min: 8, max: 32 }), S("terminal.lineHeight", "Line Height", "number", { min: 1, max: 2, step: 0.05 }), S("terminal.letterSpacing", "Letter Spacing (px)", "number", { min: 0, max: 4, step: 0.5 }), S("terminal.fontFamily", "Font Family", "select", { options: FONTS }),
    S("terminal.scheme", "Color Scheme (Termux:Styling)", "scheme"), S("terminal.scrollback", "Scrollback lines", "number", { min: 500, max: 50000 }), S("terminal.cursorBlink", "Cursor Blink", "bool"), S("terminal.bell", "Vibrate on bell", "bool"),
  ]],
  ["Live Server", [
    S("live.port", "Default Port", "number", { min: 1024, max: 65535 }), S("live.spa", "Single-page-app fallback (index.html)", "bool"), S("live.lan", "Allow access from other devices on the network", "bool"),
  ]],
  ["Git", [S("git.userName", "User name", "text"), S("git.userEmail", "User email", "text"), S("git.autoFetch", "Auto fetch", "bool")]],
  ["AI Assistant", [
    S("ai.provider", "Provider", "select", { options: ["anthropic", "openai", "github", "gemini", "openrouter", "ollama", "custom"] }), S("ai.model", "Model (blank = provider default)", "text"), S("ai.temperature", "Temperature", "number", { min: 0, max: 2, step: 0.1 }),
    S("ai.agentConfirm", "Ask before the agent runs commands / writes files", "bool"), S("ai.endpoint.custom", "Custom OpenAI-compatible endpoint", "text"), S("ai.endpoint.ollama", "Ollama endpoint", "text"), S("ai.systemPrompt", "Extra system prompt", "textarea"),
  ]],
  ["GitHub", [S("github.clientId", "OAuth App client ID (device flow)", "text", { hint: "Create an OAuth App on GitHub with Device Flow enabled. Leave blank to use the build-time value, or sign in with a token." })]],
  ["Extensions", [S("extensions.registry", "Extension registry (Open VSX compatible)", "text"), S("plugins.registry", "CodeForge plugin registry URL (JSON)", "text")]],
];

export function open() {
  return ed.openCustom("settings", "Settings", { iconName: "settings-gear", render: render });
}

function render(el) {
  el.classList.add("settings-page");
  const q = h("input.input", { placeholder: "Search settings", oninput: () => filter(q.value) });
  const body = h("div.settings-body");
  const sections = [];
  for (const [title, items] of SCHEMA) {
    const sec = h("section.set-sec", h("h3", title));
    for (const it of items) { const row = control(it); row.dataset.text = (it.label + " " + it.key + " " + title).toLowerCase(); sec.append(row); }
    sections.push(sec); body.append(sec);
  }
  const extra = h("section.set-sec", h("h3", "Advanced"),
    h("div.set-row", h("div.set-info", h("div.set-label", "settings.json"), h("div.muted", "Edit the raw settings file")), h("button.btn", { onclick: () => ed.openFile(settings.settingsFile) }, "Open settings.json")),
    h("div.set-row", h("div.set-info", h("div.set-label", "Reset all settings"), h("div.muted", "Restore defaults")), h("button.btn.danger", { onclick: () => { for (const k of Object.keys(DEFAULTS)) settings.set(k, DEFAULTS[k]); el.replaceChildren(); render(el); } }, "Reset")));
  const keysSec = h("section.set-sec", h("h3", "API Keys"), h("p.muted.set-note", "Keys are encrypted with the Android Keystore. Viewing or copying a key needs your PIN or fingerprint / face."), h("div.set-keys"));
  const secSec = h("section.set-sec", h("h3", "Security"), h("div.set-secbody"));
  keysSec.dataset.search = "api keys secret token"; secSec.dataset.search = "security pin biometric fingerprint lock";
  body.append(keysSec, secSec); security.renderKeyManager(keysSec.querySelector(".set-keys")); security.renderSecurity(secSec.querySelector(".set-secbody"));
  bus.on("security:changed", () => { if (secSec.isConnected) security.renderSecurity(secSec.querySelector(".set-secbody")); });
  body.append(extra);
  el.append(h("div.set-wrap", h("div.set-head", h("h2", "Settings"), q), body));
  function filter(v) { v = v.toLowerCase(); sections.forEach((s) => { let any = false; s.querySelectorAll(".set-row").forEach((r) => { const m = !v || r.dataset.text.includes(v); r.style.display = m ? "" : "none"; any ||= m; }); s.style.display = any ? "" : "none"; }); }
}

function control(it) {
  const v = settings.get(it.key);
  let input;
  switch (it.type) {
    case "bool": { input = h("div.switch" + (v ? ".on" : ""), { role: "switch", onclick: () => { const n = !settings.get(it.key); settings.set(it.key, n); input.classList.toggle("on", n); } }); break; }
    case "number": input = h("input", { type: "number", value: v, min: it.min, max: it.max, step: it.step || 1, style: { width: "100px" }, onchange: (e) => settings.set(it.key, +e.target.value) }); break;
    case "text": input = h("input", { type: "text", value: v, onchange: (e) => settings.set(it.key, e.target.value.trim()), style: { maxWidth: "320px" } }); break;
    case "textarea": input = h("textarea", { rows: 3, value: v, onchange: (e) => settings.set(it.key, e.target.value), style: { maxWidth: "420px" } }); break;
    case "select": input = select(it.options.map((o) => [o, o]), v, (x) => settings.set(it.key, x)); break;
    case "theme": input = select(themes.list().map((t) => [t.id, t.label || t.id]), v, (x) => settings.set(it.key, x)); break;
    case "icontheme": input = select(icons.list().map((t) => [t.id, t.label]), v, (x) => settings.set(it.key, x)); break;
    case "scheme": { input = select([["follow-theme", "Follow editor theme"]], v, (x) => settings.set(it.key, x)); themes.loadSchemes().then((s) => { Object.keys(s).sort().forEach((n) => input.append(h("option", { value: n, selected: n === v }, n))); input.value = v; }); break; }
    default: input = h("span", String(v));
  }
  return h("div.set-row", h("div.set-info", h("div.set-label", it.label), h("div.muted.set-key", it.hint || it.key)), input);
}
function select(opts, val, on) {
  const s = h("select", { onchange: (e) => on(e.target.value), style: { maxWidth: "260px" } }, ...opts.map(([v, l]) => h("option", { value: v, selected: v === val }, l)));
  s.value = val; return s;
}
