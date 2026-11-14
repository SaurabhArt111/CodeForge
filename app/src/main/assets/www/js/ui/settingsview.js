// Settings editor (a tab): searchable, schema driven; theme / icon-theme / font / terminal-scheme pickers; JSON escape hatch.
import { settings, DEFAULTS } from "../core/settings.js";
import { h, icon, P, fmtBytes } from "../core/util.js";
import * as themes from "../features/themes.js";
import * as icons from "../features/icons.js";
import * as ed from "./editor.js";
import { N } from "../core/bridge.js";
import { bus } from "../core/events.js";
import * as storage from "./storage.js";
import * as crashes from "./crashes.js";

const FONTS = ["JetBrains Mono", "Cascadia Code", "Fira Code", "monospace"];
const S = (key, label, type, extra = {}) => ({ key, label, type, ...extra });
export const SCHEMA = [
  ["Appearance", [
    S("ui.fontScale", "Text size , everything (%)", "number", { min: 70, max: 170, step: 5, hint: "Scales menus, tabs, sidebar, panels, the editor and the terminal together. Editor/terminal size below are multiplied by this." }), S("ui.theme", "Color Theme", "theme"), S("ui.iconTheme", "File Icon Theme", "icontheme"), 
    S("ui.openUrlWith", "Open links (vite “o”, xdg-open, terminal/editor links) with", "select", { options: ["browser", "preview"], hint: "browser = your default Android browser; preview = in-app preview for local URLs" }),
  ]],
  ["Keyboard & Touch", [
    S("ui.mobileKeyBar", "Extra key row on touch keyboards", "bool"),
    S("ui.keyboard", "On-screen keyboard when you tap the editor / terminal", "select", { options: ["ask", "auto"], hint: "ask = a small prompt (or the floating keyboard button) opens it; auto = opens right away" }),
    S("ui.kbdFab", "Floating keyboard button (drag it anywhere)", "bool"),
  ]],
  ["Editor", [
    S("editor.fontSize", "Editor font size", "number", { min: 8, max: 40 }), S("editor.fontFamily", "Editor font family", "select", { options: FONTS }), S("editor.ligatures", "Font Ligatures", "bool"),
    S("editor.tabSize", "Tab Size", "number", { min: 1, max: 8 }), S("editor.insertSpaces", "Insert Spaces", "bool"), S("editor.wordWrap", "Word Wrap", "select", { options: ["off", "on", "wordWrapColumn", "bounded"] }),
    S("editor.minimap", "Minimap", "bool"), S("editor.lineNumbers", "Line Numbers", "select", { options: ["on", "off", "relative"] }), S("editor.renderWhitespace", "Render Whitespace", "select", { options: ["none", "boundary", "selection", "trailing", "all"] }),
    S("editor.bracketPairColors", "Bracket Pair Colorization", "bool"), S("editor.smoothScrolling", "Smooth Scrolling", "bool"), S("editor.cursorBlinking", "Editor cursor blinking", "select", { options: ["blink", "smooth", "phase", "expand", "solid"] }),
    S("editor.stickyScroll", "Sticky Scroll", "bool"), S("editor.formatOnSave", "Format On Save (Prettier)", "bool"), S("editor.formatOnPaste", "Format On Paste", "bool"), S("editor.emmet", "Emmet abbreviations", "bool"),
    S("editor.lineHeight", "Editor line height (0 = auto)", "number", { min: 0, max: 60 }), S("editor.scrollBeyondLastLine", "Scroll beyond last line", "bool"), S("editor.bottomPadding", "Blank space after last line (px)", "number", { min: 0, max: 600 }),
    S("editor.quickSuggestions", "Suggest while typing", "bool"), S("editor.acceptSuggestionOnEnter", "Accept suggestion on Enter", "select", { options: ["on", "smart", "off"] }), S("editor.parameterHints", "Parameter hints", "bool"),
    S("editor.linkedEditing", "Rename paired HTML tags together", "bool"), S("editor.autoClosing", "Auto-close brackets & quotes", "bool"), S("editor.formatOnType", "Format on type", "bool"),
  ]],
  ["Files", [
    S("files.autoSave", "Auto Save", "select", { options: ["off", "afterDelay", "onFocusChange"] }), S("files.autoSaveDelay", "Auto Save Delay (ms)", "number", { min: 200, max: 10000 }),
    S("files.showHidden", "Show hidden files (dotfiles)", "bool"), S("files.confirmDelete", "Confirm before deleting", "bool"),
  ]],
  ["Terminal", [
    S("terminal.mode", "Default shell", "select", { options: ["auto", "host", "linux"], hint: "auto = Alpine Linux if installed, else Android sh" }), S("terminal.fontSize", "Terminal font size (pinch to zoom)", "number", { min: 8, max: 32 }), S("terminal.lineHeight", "Terminal line height", "number", { min: 1, max: 2, step: 0.05 }), S("terminal.letterSpacing", "Letter Spacing (px)", "number", { min: 0, max: 4, step: 0.5 }), S("terminal.fontFamily", "Terminal font family", "select", { options: FONTS }),
    S("terminal.scheme", "Color Scheme (Termux:Styling)", "scheme"), S("terminal.scrollback", "Scrollback lines", "number", { min: 500, max: 50000 }), S("terminal.cursorBlink", "Terminal cursor blink", "bool"), S("terminal.bell", "Vibrate on bell", "bool"),
  ]],
  ["Live Server", [
    S("preview.mode", "Run / Live Preview opens in", "select", { options: ["auto", "window", "inline"], hint: "window = separate crash-proof window (own process) · inline = Preview panel · auto = window on Android" }),
    S("live.port", "Default Port", "number", { min: 1024, max: 65535 }), S("live.spa", "Single-page-app fallback (index.html)", "bool"), S("live.lan", "Let other devices on the network open my servers", "bool", { also: ["run.exposeHost"], hint: "One switch for the Live Server and for npm dev servers (adds “-- --host” to vite, Astro, SvelteKit…). Anyone on the same Wi-Fi can then open your app, so keep it off on shared networks." }),
  ]],
  ["Git & GitHub", [S("git.userName", "User name", "text"), S("git.userEmail", "User email", "text"), S("git.autoFetch", "Auto fetch", "bool"), S("github.clientId", "OAuth App client ID (device flow)", "text", { hint: "Create an OAuth App on GitHub with Device Flow enabled. Leave blank to use the build-time value, or sign in with a token." })]],
  ["AI Assistant", [
    S("ai.temperature", "Temperature", "number", { min: 0, max: 2, step: 0.1 }),
    S("ai.agentConfirm", "Ask before the agent runs commands / writes files", "bool"), S("ai.autoApply", "Apply AI file changes from chat automatically (no review)", "bool", { hint: "Chat replies can contain “FILE: path” blocks; normally you review the diff and tap Apply" }), S("ai.rules", "Use AGENTS.md / CLAUDE.md from the project as instructions", "bool"), S("ai.endpoint.custom", "Custom OpenAI-compatible endpoint", "text"), S("ai.endpoint.ollama", "Ollama endpoint", "text"), S("ai.systemPrompt", "Extra system prompt", "textarea"),
  ]],
  ["Extensions & Plugins", [S("extensions.registry", "Extension registry (Open VSX compatible)", "text"), S("plugins.registry", "CodeForge plugin registry URL (JSON)", "text")]],
];

/** open(section?) – optionally scroll to a section by its title (e.g. "AI Assistant"). */
export async function open(section) {
  bus.emit("sidebar:close");   // on phones the drawer would still cover the page that just opened
  const r = await ed.openCustom("settings", "Settings", { iconName: "settings-gear", render: render });
  if (section) setTimeout(() => { const t = [...document.querySelectorAll(".settings-page h3")].find((x) => x.textContent === section); t?.scrollIntoView({ block: "start", behavior: "smooth" }); }, 120);
  return r;
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
    if (title === "AI Assistant") {   // providers, keys, models and coding CLIs live in the AI module
      const box = h("div.set-ai"); box.dataset.search = "ai provider key api model cli claude codex"; sec.append(box);
      import("../features/ai.js").then((m) => m.renderSettings?.(box)).catch(() => {});
    }
  }
  const extra = h("section.set-sec", h("h3", "Advanced"),
    h("div.set-row", h("div.set-info", h("div.set-label", "settings.json"), h("div.muted", "Edit the raw settings file")), h("button.btn", { onclick: () => ed.openFile(settings.settingsFile) }, "Open settings.json")),
    h("div.set-row", h("div.set-info", h("div.set-label", "Reset all settings"), h("div.muted", "Restore defaults")), h("button.btn.danger", { onclick: () => { for (const k of Object.keys(DEFAULTS)) settings.set(k, DEFAULTS[k]); el.replaceChildren(); render(el); } }, "Reset")));
  // API keys + app lock live in the Security Centre, disk usage in the Storage manager: one place each, linked from here
  const link = (title, text, label, fn, extraText) => { const r = h("div.set-row", h("div.set-info", h("div.set-label", title), h("div.muted", text)), h("button.btn.primary", { onclick: fn }, label)); r.dataset.text = (title + " " + text + " " + (extraText || "")).toLowerCase(); return r; };
  const stText = h("div.muted", "Measure what CodeForge stores and clear what you do not need.");
  const stRow = link("Storage", "", "Open Storage", () => storage.open(), "storage disk space clean cache downloads zip limit"); stRow.querySelector(".set-info").replaceChildren(h("div.set-label", "Storage"), stText);
  const showUsed = () => { const u = storage.usedBytes(); if (u != null) stText.textContent = `CodeForge uses ${fmtBytes(u)}. Measure what takes the space, clear caches, set limits.`; };
  showUsed(); bus.on("storage:scanned", showUsed);
  const secRow = link("Security", "PIN and fingerprint lock, API keys, permissions, network exposure, privacy tools.", "Open Security Centre", () => import("./securitycenter.js").then((m) => m.open()), "security pin biometric fingerprint lock api keys secret token clipboard permissions");
  const diagSec = h("section.set-sec", h("h3", "Diagnostics"), h("div.set-diag"));
  diagSec.dataset.search = "diagnostics crash reports logs memory";
  const linkSec = h("section.set-sec", h("h3", "Security & Storage"), secRow, stRow); sections.push(linkSec);
  body.append(linkSec, diagSec); crashes.renderDiagnostics(diagSec.querySelector(".set-diag"));
  body.append(extra);
  el.append(h("div.set-wrap", h("div.set-head", h("h2", "Settings"), q), body));
  function filter(v) { v = v.toLowerCase(); sections.forEach((s) => { let any = false; s.querySelectorAll(".set-row, .set-ai").forEach((r) => { const m = !v || (r.dataset.text || r.dataset.search || "").includes(v); r.style.display = m ? "" : "none"; any ||= m; }); s.style.display = any ? "" : "none"; }); }
}

function control(it) {
  const v = settings.get(it.key);
  let input;
  switch (it.type) {
    case "bool": { const keys = [it.key, ...(it.also || [])], on = keys.some((k) => settings.get(k)); input = h("div.switch" + (on ? ".on" : ""), { role: "switch", onclick: () => { const n = !input.classList.contains("on"); for (const k of keys) settings.set(k, n); input.classList.toggle("on", n); } }); break; }
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
