// Editor: Monaco (AMD) bootstrap, two editor groups with tabs, text models, save / auto-save, external-change detection,
// image / binary / markdown / diff / custom tabs.
import * as fontscale from "../core/fontscale.js";
import { N } from "../core/bridge.js";
import { settings } from "../core/settings.js";
import { bus, Emitter } from "../core/events.js";
import { h, icon, P, debounce, fmtBytes, uid, isMobile, isTouch } from "../core/util.js";
import { toast, toastError, confirm, contextMenu, longPress, modal } from "../core/ui.js";
import { openUrl, openInBrowser, urlAt, isUrl } from "../core/links.js";
import { showLinkChip, hideLinkChip } from "./linkchip.js";
import * as themes from "../features/themes.js";
import * as icons from "../features/icons.js";
import { ws } from "./workspace.js";
import { makeSash } from "./sash.js";

export const editorEvents = new Emitter();
export let monaco = null;

const MAX_TEXT = 12 * 1024 * 1024;
const docs = new Map();            // path -> Doc
const groups = [null, null];       // Group objects
let activeGroup = 0;
let tabCounter = 0;

const IMG_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "svg", "avif"]);
const AV_EXT = { mp3: "audio", wav: "audio", ogg: "audio", m4a: "audio", flac: "audio", mp4: "video", webm: "video", mov: "video", mkv: "video" };

// ------------------------------------------------------------------------------------ monaco bootstrap
export async function loadMonaco() {
  if (monaco) return monaco;
  const base = new URL("vendor/monaco/", document.baseURI).href;
  window.MonacoEnvironment = {
    getWorkerUrl() {
      const code = `self.MonacoEnvironment={baseUrl:${JSON.stringify(base)}};importScripts(${JSON.stringify(base + "vs/base/worker/workerMain.js")});`;
      return URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
    },
  };
  window.require.config({ paths: { vs: "vendor/monaco/vs" }, "vs/nls": { availableLanguages: {} } });
  monaco = await new Promise((res, rej) => window.require(["vs/editor/editor.main"], () => res(window.monaco), rej));
  themes.attachMonaco(monaco);
  // syntax-only TS/JS service (no type-checking noise without node_modules typings)
  const ts = monaco.languages.typescript;
  for (const d of [ts.javascriptDefaults, ts.typescriptDefaults]) {
    d.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: false, noSuggestionDiagnostics: true });
    d.setCompilerOptions({ allowJs: true, allowNonTsExtensions: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.NodeJs, jsx: ts.JsxEmit.Preserve, checkJs: false });
    d.setEagerModelSync(true);
  }
  monaco.languages.json.jsonDefaults.setDiagnosticsOptions({ allowComments: true, trailingCommas: "ignore", validate: true });
  icons.setLanguageResolver((name) => languageForPath("/" + name));
  monaco.editor.onDidChangeMarkers(() => bus.emit("markers"));
  // Ctrl/Cmd+click on a link in the editor → default browser (or in-app preview, per setting)
  try { monaco.editor.registerLinkOpener({ open: (uri) => { const u = uri.toString(true); if (!/^https?:/i.test(u)) return false; openUrl(u); return true; } }); } catch { /* older Monaco */ }
  import("../features/completions.js").then((m) => m.register(monaco)).catch((e) => console.warn("completions", e));
  return monaco;
}

let langByExt = null, langByName = null;
function buildLangMaps() {
  langByExt = new Map(); langByName = new Map();
  for (const l of monaco.languages.getLanguages()) {
    for (const e of l.extensions || []) if (!langByExt.has(e.toLowerCase())) langByExt.set(e.toLowerCase(), l.id);
    for (const f of l.filenames || []) langByName.set(f.toLowerCase(), l.id);
  }
  const extra = { ".mjs": "javascript", ".cjs": "javascript", ".jsx": "javascript", ".tsx": "typescript", ".mts": "typescript", ".cts": "typescript", ".vue": "html", ".svelte": "html", ".gradle": "groovy", ".kts": "kotlin", ".toml": "ini", ".env": "ini", ".conf": "ini", ".properties": "ini", ".lock": "json", ".jsonc": "json", ".code-workspace": "json", ".zsh": "shell", ".bash": "shell", ".mdx": "markdown" };
  for (const [k, v] of Object.entries(extra)) if (!langByExt.has(k)) langByExt.set(k, v);
  for (const [k, v] of Object.entries({ ".gitignore": "ignore", ".bashrc": "shell", ".zshrc": "shell", ".profile": "shell", ".env": "ini", "dockerfile": "dockerfile", "makefile": "makefile", ".gitconfig": "ini", ".npmrc": "ini", ".editorconfig": "ini" })) langByName.set(k, v);
}
export function languageForPath(path) {
  if (!monaco) return null;
  if (!langByExt) buildLangMaps();
  const base = P.base(path).toLowerCase();
  const over = settings.state.langOverrides?.[path];
  if (over) return over;
  if (langByName.has(base)) return langByName.get(base);
  const parts = base.split(".");
  for (let i = 1; i < parts.length; i++) { const l = langByExt.get("." + parts.slice(i).join(".")); if (l) return l; }
  if (base.startsWith(".env")) return "ini";
  return "plaintext";
}
export const languages = () => (monaco ? monaco.languages.getLanguages().map((l) => ({ id: l.id, label: l.aliases?.[0] || l.id })).sort((a, b) => a.label.localeCompare(b.label)) : []);

export function editorOptions() {
  const s = (k) => settings.get(k);
  const mobile = isMobile();
  const lite = mobile || isTouch();   // phones / tablets: skip the effects that cost frames while scrolling and typing
  const auto = s("editor.autoClosing") ? "languageDefined" : "never";
  return {
    fontSize: fontscale.scaled(s("editor.fontSize")), fontFamily: `"${s("editor.fontFamily")}", var(--mono), monospace`, fontLigatures: s("editor.ligatures"), lineHeight: s("editor.lineHeight") || 0,
    tabSize: s("editor.tabSize"), insertSpaces: s("editor.insertSpaces"), wordWrap: s("editor.wordWrap"), minimap: { enabled: !!s("editor.minimap"), side: "right", showSlider: mobile ? "always" : "mouseover", renderCharacters: !mobile, maxColumn: mobile ? 40 : 120, scale: 1 },
    lineNumbers: s("editor.lineNumbers"), renderWhitespace: s("editor.renderWhitespace"), bracketPairColorization: { enabled: s("editor.bracketPairColors") },
    smoothScrolling: lite ? false : s("editor.smoothScrolling"), cursorBlinking: lite && s("editor.cursorBlinking") === "smooth" ? "blink" : s("editor.cursorBlinking"), stickyScroll: { enabled: s("editor.stickyScroll") },
    formatOnPaste: s("editor.formatOnPaste"), formatOnType: s("editor.formatOnType"), automaticLayout: true, fixedOverflowWidgets: true, contextmenu: !mobile,
    // blank space after the last line so the end of a file can be scrolled up above the keyboard / bottom bars
    scrollBeyondLastLine: s("editor.scrollBeyondLastLine"), padding: { top: 6, bottom: s("editor.bottomPadding") },
    guides: { bracketPairs: !lite, indentation: true }, renderLineHighlight: lite ? "line" : "all", mouseWheelZoom: !lite, links: true, linkedEditing: s("editor.linkedEditing"),
    // ---- suggestions / IntelliSense
    quickSuggestions: s("editor.quickSuggestions") ? { other: "on", comments: "off", strings: "on" } : false, quickSuggestionsDelay: lite ? 120 : 40,
    suggestOnTriggerCharacters: true, acceptSuggestionOnEnter: s("editor.acceptSuggestionOnEnter"), acceptSuggestionOnCommitCharacter: true, tabCompletion: "on",
    wordBasedSuggestions: lite ? "matchingDocuments" : "allDocuments", snippetSuggestions: "inline", suggestSelection: "first", parameterHints: { enabled: s("editor.parameterHints"), cycle: true },
    suggest: { showWords: true, showSnippets: true, showIcons: true, showStatusBar: false, preview: true, previewMode: "subwordSmart", insertMode: "replace", filterGraceful: true, localityBonus: true, shareSuggestSelections: true, showInlineDetails: true, selectionMode: "whenQuickSuggestion" },
    suggestFontSize: mobile ? 14 : 0, suggestLineHeight: mobile ? 36 : 0, inlineSuggest: { enabled: true }, hover: { enabled: !lite, delay: 350, sticky: true },
    autoClosingBrackets: auto, autoClosingQuotes: auto, autoClosingOvertype: "auto", autoSurround: s("editor.autoClosing") ? "languageDefined" : "never", autoIndent: "full",
    occurrencesHighlight: lite ? "off" : "singleFile", colorDecorators: !lite, matchBrackets: lite ? "near" : "always", renderControlCharacters: false,
    folding: true, foldingHighlight: false, showFoldingControls: mobile ? "always" : "mouseover", glyphMargin: !mobile, lineDecorationsWidth: mobile ? 4 : 10,
    lineNumbersMinChars: mobile ? 3 : 4, dragAndDrop: true, multiCursorModifier: "alt", accessibilitySupport: "off", unicodeHighlight: { ambiguousCharacters: false },
    overviewRulerBorder: false, hideCursorInOverviewRuler: true, scrollbar: { verticalScrollbarSize: mobile ? 8 : 12, horizontalScrollbarSize: 10, useShadows: false },
  };
}

// ------------------------------------------------------------------------------------ Doc model
class Doc {
  constructor(path) { this.path = path; this.kind = "text"; this.model = null; this.mtime = 0; this.size = 0; this.savedVersion = 0; this.bom = false; this.dirty = false; this.viewState = new Map(); this.refs = 0; this.saving = false; }
  get name() { return P.base(this.path); }
}

async function ensureDoc(path) {
  let d = docs.get(path);
  if (d) return d;
  d = new Doc(path);
  const ext = P.ext(path);
  if (IMG_EXT.has(ext)) { d.kind = "image"; docs.set(path, d); return d; }
  if (AV_EXT[ext]) { d.kind = AV_EXT[ext]; docs.set(path, d); return d; }
  const r = await N.fs.readText(path, { max: MAX_TEXT });
  d.mtime = r.mtime; d.size = r.size;
  if (r.binary || r.tooLarge) { d.kind = r.tooLarge ? "large" : "binary"; docs.set(path, d); return d; }
  await loadMonaco();
  d.bom = !!r.bom;
  d.model = monaco.editor.createModel(r.text, languageForPath(path), monaco.Uri.file(path));
  d.savedVersion = d.model.getAlternativeVersionId();
  d.model.onDidChangeContent(() => { updateDirty(d); scheduleAutoSave(d); editorEvents.emit("content", d); });
  d.model.onDidChangeLanguage?.(() => editorEvents.emit("language", d));
  docs.set(path, d);
  return d;
}
function updateDirty(d) {
  const dirty = d.model ? d.model.getAlternativeVersionId() !== d.savedVersion : false;
  if (dirty !== d.dirty) { d.dirty = dirty; refreshTabs(d.path); editorEvents.emit("dirty", d); bus.emit("dirty", d.path, dirty); }
}
/** URL that is selected, or that the (empty) cursor sits inside */
function urlAtSelection(ed) {
  const m = ed.getModel(), s = ed.getSelection(); if (!m || !s) return null;
  if (!s.isEmpty()) { if (s.startLineNumber !== s.endLineNumber) return null; const t = m.getValueInRange(s).trim(); return isUrl(t) ? t : null; }
  return urlAt(m.getLineContent(s.positionLineNumber), s.positionColumn - 1);
}
export const getDoc = (p) => docs.get(p);
export const dirtyDocs = () => [...docs.values()].filter((d) => d.dirty);
export const openPaths = () => [...docs.keys()];

// ------------------------------------------------------------------------------------ saving
const autoTimers = new Map();
function scheduleAutoSave(d) {
  const mode = settings.get("files.autoSave");
  if (mode !== "afterDelay") return;
  clearTimeout(autoTimers.get(d.path));
  autoTimers.set(d.path, setTimeout(() => { if (d.dirty) save(d.path, { auto: true }).catch(() => {}); }, settings.get("files.autoSaveDelay")));
}
export async function save(path, { auto = false, as = null } = {}) {
  const d = docs.get(path); if (!d?.model || d.saving) return false;
  d.saving = true;
  try {
    if (!auto && settings.get("editor.formatOnSave")) { try { await monaco.editor.getEditors().find((e) => e.getModel() === d.model)?.getAction("editor.action.formatDocument")?.run(); } catch { /* ignore */ } }
    const target = as || path;
    const v = d.model.getAlternativeVersionId();
    const text = d.model.getValue();
    await N.fs.writeText(target, text, { bom: d.bom });
    const st = await N.fs.stat(target);
    if (target === path) { d.savedVersion = v; d.mtime = st?.m ?? Date.now(); updateDirty(d); }
    editorEvents.emit("saved", d, target);
    bus.emit("saved", target);
    if (!auto) ws.invalidate();
    return true;
  } catch (e) { toastError(e); return false; } finally { d.saving = false; }
}
export async function saveActive() { const t = activeTab(); if (t?.doc?.model) return save(t.doc.path); return false; }
export async function saveAll() { for (const d of dirtyDocs()) await save(d.path); }
export async function saveAs(path) {
  const { prompt } = await import("../core/ui.js");
  const to = await prompt("Save As", { value: path, okLabel: "Save" }); if (!to) return;
  if (await N.fs.exists(to) && !(await confirm(`"${P.base(to)}" exists. Overwrite?`, { danger: true, okLabel: "Overwrite" }))) return;
  if (await save(path, { as: to })) { ws.invalidate(); ws.emit("changed", new Set([P.dir(to)])); openFile(to); }
}

// external modification detection
let checking = false, checkAgain = false;
export async function checkExternal() {
  if (checking) { checkAgain = true; return; }   // visibilitychange + focus + app.resume all fire on return: run once
  checking = true;
  try { await checkExternalNow(); } finally { checking = false; if (checkAgain) { checkAgain = false; setTimeout(checkExternal, 500); } }
}
async function checkExternalNow() {
  const list = [...docs.values()].filter((d) => d.model && !d.saving);
  const stats = await Promise.all(list.map((d) => N.fs.stat(d.path).then((x) => ({ ok: true, x }), () => ({ ok: false }))));   // all files at once instead of one bridge call after another
  for (let i = 0; i < list.length; i++) {
    const d = list[i]; if (d.saving || !stats[i].ok) continue;
    const st = stats[i].x;
    if (!st) { if (!d.missing) { d.missing = true; toast(`"${d.name}" was deleted on disk`, { kind: "warn" }); } continue; }
    d.missing = false;
    if (st.m === d.mtime) continue;
    if (!d.dirty) { await reload(d.path, true); bus.emit("fs:docreload", d.path); }
    else {
      d.mtime = st.m;
      if (await confirm(`"${d.name}" changed on disk and you have unsaved edits. Reload and discard your changes?`, { title: "File changed", okLabel: "Reload", danger: true })) await reload(d.path, true);
    }
  }
}
export async function reload(path, quiet = false) {
  const d = docs.get(path); if (!d?.model) return;
  const r = await N.fs.readText(path, { max: MAX_TEXT }); if (r.text == null) return;
  if (r.text !== d.model.getValue()) {
    const eds = monaco.editor.getEditors().filter((e) => e.getModel() === d.model); const vs = eds.map((e) => e.saveViewState());
    d.model.pushEditOperations([], [{ range: d.model.getFullModelRange(), text: r.text }], () => null);
    d.model.pushStackElement(); eds.forEach((e, i) => e.restoreViewState(vs[i]));
  }
  d.mtime = r.mtime; d.savedVersion = d.model.getAlternativeVersionId(); updateDirty(d);
  if (!quiet) toast(`Reloaded ${d.name}`);
}

// ------------------------------------------------------------------------------------ Groups & tabs
class Group {
  constructor(idx) {
    this.idx = idx; this.el = document.getElementById("group-" + idx);
    this.tabsEl = this.el.querySelector(".tabs"); this.body = this.el.querySelector(".group-body");
    this.tabs = []; this.active = null; this.editor = null; this.editorHost = null; this.mru = [];
    this.el.addEventListener("pointerdown", () => setActiveGroup(idx), true);
    this.tabsEl.addEventListener("wheel", (e) => { if (e.deltaY) { this.tabsEl.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
    this.tabsEl.addEventListener("contextmenu", (e) => { if (e.target === this.tabsEl) { e.preventDefault(); contextMenu([{ label: "Close All", run: () => closeAll(idx) }, { label: "Save All", run: saveAll }], e.clientX, e.clientY); } });
  }
  ensureEditor() {
    if (this.editor) return this.editor;
    this.editorHost = h("div.surface.monaco-host.on", { dataset: { kind: "text" } });
    this.body.append(this.editorHost);
    const ed = (this.editor = monaco.editor.create(this.editorHost, { ...editorOptions(), model: null, theme: "cf-current" }));
    ed.onDidChangeCursorPosition((e) => { if (activeGroup === this.idx) editorEvents.emit("cursor", e.position, ed); });
    ed.onDidFocusEditorText(() => setActiveGroup(this.idx));
    ed.onDidChangeModelLanguage?.(() => editorEvents.emit("language"));
    const urlKey = ed.createContextKey("cfUrlAtCursor", false);
    ed.onDidChangeCursorSelection((e) => {
      if (activeGroup === this.idx) editorEvents.emit("selection", ed);
      const u = urlAtSelection(ed); urlKey.set(!!u);
      // chip: a selected URL, or a tap/click that lands inside one (not while typing)
      if (u && (!ed.getSelection().isEmpty() || e.source === "mouse")) showLinkChip(u); else hideLinkChip();
    });
    ed.onDidBlurEditorText(() => setTimeout(() => { if (!document.activeElement?.closest?.(".link-chip")) hideLinkChip(); }, 250));
    ed.addAction({ id: "cf.openLink", label: "Open Link in Browser", precondition: "cfUrlAtCursor", contextMenuGroupId: "navigation", contextMenuOrder: 9, run: () => { const u = urlAtSelection(ed); if (u) openInBrowser(u); } });
    ed.onDidBlurEditorText(() => { if (settings.get("files.autoSave") === "onFocusChange") dirtyDocs().forEach((d) => save(d.path, { auto: true })); });
    ed.addAction({ id: "cf.save", label: "Save", keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS], run: () => saveActive() });
    ed.addAction({ id: "cf.palette", label: "Command Palette", keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyP], run: () => bus.emit("cmd:palette") });
    ed.addAction({ id: "cf.quickopen", label: "Quick Open", keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyP], run: () => bus.emit("cmd:quickopen") });
    ed.addAction({ id: "cf.terminal", label: "Toggle Terminal", keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Backquote], run: () => bus.emit("cmd:terminal") });
    ed.addAction({ id: "cf.closeTab", label: "Close Editor", keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.KeyW], run: () => closeTab(activeTab()) });
    ed.addAction({ id: "cf.ai.explain", label: "AI: Explain Selection", contextMenuGroupId: "9_cf", contextMenuOrder: 1, run: () => bus.emit("ai:selection", "explain") });
    ed.addAction({ id: "cf.ai.fix", label: "AI: Fix Selection", contextMenuGroupId: "9_cf", contextMenuOrder: 2, run: () => bus.emit("ai:selection", "fix") });
    ed.addAction({ id: "cf.ai.edit", label: "AI: Edit Selection…", contextMenuGroupId: "9_cf", contextMenuOrder: 3, run: () => bus.emit("ai:selection", "edit") });
    bus.emit("editor:created", ed, this);
    return ed;
  }
  surfaces() { return [...this.body.children]; }
  showSurface(el) { this.surfaces().forEach((s) => s.classList.toggle("on", s === el)); }
}

function setActiveGroup(i) {
  if (!groups[i]) return;
  if (activeGroup !== i) { activeGroup = i; editorEvents.emit("group", i); }
  groups.forEach((g, k) => g?.el.classList.toggle("active-group", k === i));
  editorEvents.emit("active", activeTab());
}
export const activeTab = () => groups[activeGroup]?.active || groups.find((g) => g?.active)?.active || null;
export const activeEditor = () => groups[activeGroup]?.editor || null;
export const activeDoc = () => activeTab()?.doc || null;
export const allTabs = () => groups.flatMap((g) => g?.tabs || []);
export const groupCount = () => (groups[1] && !groups[1].el.classList.contains("hidden") ? 2 : 1);

export function initEditor() {
  groups[0] = new Group(0); groups[1] = new Group(1);
  setActiveGroup(0);
  document.getElementById("btn-split").addEventListener("click", () => toggleSplit());
  // sash between groups
  const sash = document.getElementById("sash-split"), area = document.getElementById("editor-area");
  makeSash(sash, {
    axis: "x", size: () => groups[0].el.getBoundingClientRect().width, min: () => 120, max: () => area.getBoundingClientRect().width - 120,
    apply: (px) => { const w = area.getBoundingClientRect().width, f = px / w; groups[0].el.style.flex = `${f} 1 0`; groups[1].el.style.flex = `${1 - f} 1 0`; },
    reset: () => { groups[0].el.style.flex = ""; groups[1].el.style.flex = ""; },
  });
  settings.on("change", (k) => { if ((k.startsWith("editor.") || k === "ui.fontScale") && monaco) { const o = editorOptions(); groups.forEach((g) => g?.editor?.updateOptions(o)); monaco.editor.getModels().forEach((m) => m.updateOptions({ tabSize: o.tabSize, insertSpaces: o.insertSpaces })); } });
  settings.on("change:files.autoSave", () => { if (settings.get("files.autoSave") === "afterDelay") dirtyDocs().forEach(scheduleAutoSave); });
  document.addEventListener("visibilitychange", () => { if (document.hidden) { if (settings.get("files.autoSave") !== "off") dirtyDocs().forEach((d) => save(d.path, { auto: true })); } else checkExternal(); });
  window.addEventListener("focus", () => checkExternal());
  N.on("app.resume", () => checkExternal());
  window.addEventListener("beforeunload", (e) => {
    if (settings.get("files.autoSave") !== "off") dirtyDocs().forEach((d) => save(d.path, { auto: true }));
    if (dirtyDocs().length) { e.preventDefault(); e.returnValue = ""; return ""; }   // browser: "Leave site? Changes you made may not be saved"
  });
  ws.on("renamed", onRenamed);
  ws.on("deleted", onDeleted);
  ws.on("root", (r) => { if (!r) closeAll(null, true); });
  bus.on("fs:external", () => { checkExternal(); });
  bus.on("fs:poll", () => { if (docs.size) checkExternal(); });   // a coding CLI / script rewrote an open file in place (no folder mtime change): pick it up within a few seconds
  new ResizeObserver(() => groups.forEach((g) => g?.editor?.layout())).observe(document.getElementById("editor-area"));
}

export function toggleSplit(force, { open = true } = {}) {
  const on = force ?? groups[1].el.classList.contains("hidden");
  groups[1].el.classList.toggle("hidden", !on); document.getElementById("sash-split").classList.toggle("hidden", !on);
  groups[0].el.style.flex = ""; groups[1].el.style.flex = "";
  document.getElementById("btn-split").classList.toggle("on", on);
  if (open && on && !groups[1].tabs.length && groups[0].active) { const t = groups[0].active; if (t.kind === "file") openFile(t.doc.path, { group: 1 }); }
  if (!on) { for (const t of [...groups[1].tabs]) moveTab(t, 0); setActiveGroup(0); }
  groups.forEach((g) => g?.editor?.layout());
}

function makeTabEl(tab) {
  const name = h("span.name", tab.title);
  const x = h("span.x", { title: "Close", onclick: (e) => { e.stopPropagation(); closeTab(tab); } }, icon("close"));
  const el = h("div.tab", { dataset: { id: tab.id }, title: tab.path || tab.title, draggable: !("ontouchstart" in window) },
    tab.iconEl || (tab.path ? icons.fileIcon(P.base(tab.path)) : icon(tab.iconName || "file")), name, h("span.dir"), h("span.dot"), x);
  el.addEventListener("click", () => { activate(tab); });
  el.addEventListener("dblclick", () => { tab.preview = false; refreshTabs(); });
  el.addEventListener("auxclick", (e) => { if (e.button === 1) closeTab(tab); });
  el.addEventListener("contextmenu", (e) => { e.preventDefault(); tabMenu(tab, e.clientX, e.clientY); });
  longPress(el, (x_, y_) => tabMenu(tab, x_, y_));
  el.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/cf-tab", tab.id); });
  el.addEventListener("dragover", (e) => { if (e.dataTransfer.types.includes("text/cf-tab")) e.preventDefault(); });
  el.addEventListener("drop", (e) => { e.preventDefault(); const id = e.dataTransfer.getData("text/cf-tab"); const t = allTabs().find((q) => q.id === id); if (t) { moveTab(t, tab.group.idx, tab); } });
  return el;
}

function tabMenu(tab, x, y) {
  const g = tab.group; const other = 1 - g.idx;
  contextMenu([
    { label: "Close", icon: "close", run: () => closeTab(tab) },
    { label: "Close Others", run: () => g.tabs.filter((t) => t !== tab).forEach(closeTab) },
    { label: "Close to the Right", run: () => g.tabs.slice(g.tabs.indexOf(tab) + 1).forEach(closeTab) },
    { label: "Close Saved", run: () => g.tabs.filter((t) => !t.doc?.dirty).forEach(closeTab) },
    { label: "Close All", run: () => closeAll(g.idx) }, { separator: true },
    ...(tab.doc?.model ? [{ label: "Save", icon: "save", run: () => save(tab.doc.path) }, { label: "Save As…", run: () => saveAs(tab.doc.path) }] : []),
    { label: g.idx === 0 ? "Move to Right Group" : "Move to Left Group", icon: "split-horizontal", run: () => { if (other === 1) toggleSplit(true); moveTab(tab, other); } },
    ...(tab.path ? [{ separator: true }, { label: "Copy Path", run: () => import("../core/util.js").then((u) => u.copyText(tab.path)) }, { label: "Reveal in Explorer", run: () => bus.emit("reveal", tab.path) }, { label: "Open in Terminal Here", run: () => bus.emit("terminal:at", P.dir(tab.path)) }] : []),
  ], x, y);
}

function refreshTabs(path) {
  for (const g of groups) {
    if (!g) continue;
    // duplicate-name disambiguation
    const counts = new Map(); g.tabs.forEach((t) => counts.set(t.title, (counts.get(t.title) || 0) + 1));
    for (const t of g.tabs) {
      if (!t.el) continue;
      t.el.classList.toggle("active", g.active === t);
      t.el.classList.toggle("preview", !!t.preview);
      t.el.classList.toggle("dirty", !!t.doc?.dirty);
      const dir = t.el.querySelector(".dir");
      dir.textContent = t.path && counts.get(t.title) > 1 ? P.base(P.dir(t.path)) : "";
    }
  }
}

function addTab(g, tab, after = null) {
  tab.group = g; tab.id = tab.id || "t" + ++tabCounter;
  tab.el = makeTabEl(tab);
  const i = after ? g.tabs.indexOf(after) + 1 : g.tabs.length;
  g.tabs.splice(i, 0, tab);
  g.tabsEl.insertBefore(tab.el, g.tabsEl.children[i] || null);
  if (doc_ref(tab)) doc_ref(tab).refs++;
}
const doc_ref = (t) => t.doc;

function activate(tab) {
  const g = tab.group; if (!g) return;
  setActiveGroup(g.idx);
  if (g.active && g.active !== tab) { saveViewState(g.active); g.mru = [g.active, ...g.mru.filter((t) => t !== g.active && t !== tab)].slice(0, 30); }
  g.active = tab;
  showTab(g, tab);
  refreshTabs();
  tab.el.scrollIntoView({ block: "nearest", inline: "nearest" });
  editorEvents.emit("active", tab);
  editorEvents.emit("cursor", g.editor?.getPosition?.(), g.editor);
  if (tab.path) { settings.state.sessions[ws.root || ""] = sessionSnapshot(); settings.saveState(); }
}

function saveViewState(tab) {
  if (tab.kind === "file" && tab.group.editor && tab.group.editor.getModel() === tab.doc.model) tab.doc.viewState.set(tab.group.idx, tab.group.editor.saveViewState());
}

function showTab(g, tab) {
  if (tab.kind === "file") {
    const ed = g.ensureEditor();
    g.showSurface(g.editorHost);
    if (ed.getModel() !== tab.doc.model) ed.setModel(tab.doc.model);
    const vs = tab.doc.viewState.get(g.idx); if (vs) ed.restoreViewState(vs);
    ed.layout();
    if (tab.focusOnShow !== false && (!isMobile() || tab.focusOnShow)) ed.focus();
    return;
  }
  if (!tab.surface) {
    tab.surface = h("div.surface.scroll", { dataset: { kind: tab.kind } });
    g.body.append(tab.surface);
    try { tab.render(tab.surface, tab); } catch (e) { tab.surface.textContent = "Failed to render: " + e.message; }
  }
  g.showSurface(tab.surface);
}

function emptyGroupHint(g) {
  if (g.tabs.length) { g.body.querySelector(".group-empty")?.remove(); return; }
  if (!g.body.querySelector(".group-empty") && g.idx === 0) {
    const hint = h("div.surface.group-empty.on", { style: { display: "grid", placeItems: "center", color: "var(--muted)" } }, h("div", { style: { textAlign: "center", lineHeight: "2" } },
      h("i.codicon.codicon-code", { style: { fontSize: "calc(64px * var(--fz))", opacity: ".25", display: "block" } }),
      h("div", "Open a file from the Explorer"), h("div.muted", "or press the search bar for the command palette")));
    g.body.append(hint);
  }
  g.showSurface(g.body.querySelector(".group-empty"));
}

export async function openFile(path, opts = {}) {
  let { group = activeGroup, preview = false, line, col, focus = true, reveal = true } = opts;
  // open: false , this function is what fills the new group, toggleSplit must not call back into it (that was an endless loop: "Maximum call stack size exceeded")
  if (group === 1 && groups[1].el.classList.contains("hidden")) toggleSplit(true, { open: false });
  const g = groups[group];
  let tab = g.tabs.find((t) => t.path === path) || allTabs().find((t) => t.path === path && !opts.group && opts.group !== 0 && false);
  if (!tab) {
    let d; try { d = await ensureDoc(path); } catch (e) { toastError(e); return null; }
    const kind = d.kind === "text" ? "file" : d.kind;
    tab = { kind, path, title: P.base(path), doc: d, preview };
    if (kind !== "file") { tab.render = (el) => renderSpecial(el, d); }
    if (preview) { const old = g.tabs.find((t) => t.preview && !t.doc?.dirty); if (old) closeTab(old, true); }
    addTab(g, tab, g.active);
  } else if (!preview) tab.preview = false;
  g.body.querySelector(".group-empty")?.remove();
  tab.focusOnShow = focus;
  activate(tab);
  if (line && tab.kind === "file") {
    const ed = g.editor; const pos = { lineNumber: line, column: col || 1 };
    ed.setPosition(pos); if (reveal) ed.revealPositionInCenter(pos); if (focus) ed.focus();
  }
  bus.emit("opened", path);
  return tab;
}

export function openCustom(id, title, { iconName = "file", render, group = activeGroup, singleton = true } = {}) {
  const g = groups[group];
  const existing = singleton && allTabs().find((t) => t.customId === id);
  if (existing) { activate(existing); return existing; }
  const tab = { kind: "custom", customId: id, title, iconName, render };
  addTab(g, tab, g.active); g.body.querySelector(".group-empty")?.remove(); activate(tab); return tab;
}
export function updateCustomTitle(id, title) { const t = allTabs().find((q) => q.customId === id); if (t) { t.title = title; t.el.querySelector(".name").textContent = title; } }
export function closeCustom(id) { const t = allTabs().find((q) => q.customId === id); if (t) closeTab(t, true); }

export async function openDiff(title, original, modified, language = "plaintext", id = "diff:" + title) {
  await loadMonaco();
  return openCustom(id, title, {
    iconName: "diff", singleton: true,
    render(el, tab) {
      el.classList.remove("scroll"); el.style.overflow = "hidden";
      const host = h("div", { style: { position: "absolute", inset: 0 } }); el.append(host);
      const ed = monaco.editor.createDiffEditor(host, { ...editorOptions(), readOnly: true, renderSideBySide: !isMobile(), automaticLayout: true, originalEditable: false, theme: "cf-current" });
      const o = monaco.editor.createModel(original, language), m = monaco.editor.createModel(modified, language);
      ed.setModel({ original: o, modified: m }); tab.dispose = () => { ed.dispose(); o.dispose(); m.dispose(); };
    },
  });
}

function renderSpecial(el, d) {
  const wrap = h("div", { style: { padding: "16px", display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", minHeight: "100%", justifyContent: "center" } });
  el.append(wrap);
  const info = h("div.muted", `${d.name}`);
  if (d.kind === "image") {
    const img = h("img", { style: { maxWidth: "100%", maxHeight: "78vh", background: "repeating-conic-gradient(#8883 0% 25%, transparent 0% 50%) 50% / 16px 16px", objectFit: "contain" } });
    N.fs.url(d.path).then((u) => (img.src = u + "?t=" + Date.now()));
    img.onload = () => { info.textContent = `${d.name} , ${img.naturalWidth}×${img.naturalHeight}`; };
    wrap.append(img, info);
  } else if (d.kind === "audio" || d.kind === "video") {
    const m = h(d.kind, { controls: true, style: { maxWidth: "100%" } }); N.fs.url(d.path).then((u) => (m.src = u)); wrap.append(m, info);
  } else {
    wrap.append(icon("file-binary", "big"), h("div", d.kind === "large" ? "This file is too large to edit here." : "This file is binary and cannot be shown in the text editor."), h("div.muted", fmtBytes(d.size)),
      h("div", { style: { display: "flex", gap: "8px" } },
        d.kind === "large" ? h("button.btn", { onclick: async () => { d.kind = "text"; const r = await N.fs.readText(d.path, { max: 200 * 1024 * 1024 }); if (r.text == null) return toast("Cannot open as text", { kind: "error" }); docs.delete(d.path); const ok = await forceText(d, r); if (ok) { closeTabsFor(d.path); openFile(d.path); } } }, "Open anyway") : null,
        h("button.btn", { onclick: () => N.sys.share({ path: d.path }) }, "Share…"), h("button.btn", { onclick: () => bus.emit("hex", d.path) }, "Hex view")));
  }
}
async function forceText(d, r) {
  await loadMonaco(); const nd = new Doc(d.path); nd.mtime = r.mtime; nd.size = r.size;
  nd.model = monaco.editor.createModel(r.text, languageForPath(d.path), monaco.Uri.file(d.path)); nd.savedVersion = nd.model.getAlternativeVersionId();
  nd.model.onDidChangeContent(() => { updateDirty(nd); scheduleAutoSave(nd); editorEvents.emit("content", nd); }); docs.set(d.path, nd); return true;
}
function closeTabsFor(path) { allTabs().filter((t) => t.path === path).forEach((t) => closeTab(t, true)); }

export async function closeTab(tab, force = false) {
  if (!tab?.group) return false;
  const g = tab.group; const d = tab.doc;
  if (!force && d?.dirty && d.refs <= 1) {
    const r = await modal({ title: "Unsaved changes", body: `Save changes to "${d.name}" before closing?`, buttons: [{ label: "Don't Save", value: "no", danger: true }, { label: "Cancel", value: "cancel" }, { label: "Save", value: "yes", primary: true }] });
    if (r === "cancel" || r === undefined) return false;
    if (r === "yes" && !(await save(d.path))) return false;
  }
  saveViewState(tab);
  const i = g.tabs.indexOf(tab); g.tabs.splice(i, 1); tab.el.remove();
  g.mru = g.mru.filter((t) => t !== tab);
  tab.dispose?.(); tab.surface?.remove();
  if (d) { d.refs--; if (d.refs <= 0) { d.model?.dispose(); docs.delete(d.path); d.viewState.clear(); } }
  if (g.active === tab) {
    g.active = null;
    const next = g.mru.find((t) => g.tabs.includes(t)) || g.tabs[Math.min(i, g.tabs.length - 1)];
    if (next) activate(next);
    else { if (g.editor) { g.editor.setModel(null); } g.showSurface(null); emptyGroupHint(g); if (g.idx === 1 && !isMobile()) toggleSplit(false); editorEvents.emit("active", activeTab()); }
  }
  refreshTabs(); bus.emit("closed", tab.path);
  return true;
}
export async function closeAll(idx = null, force = false) {
  for (const g of groups) { if (!g || (idx !== null && g.idx !== idx)) continue; for (const t of [...g.tabs]) if (!(await closeTab(t, force))) return false; }
  return true;
}

function moveTab(tab, toIdx, before = null) {
  const from = tab.group; const to = groups[toIdx]; if (!to) return;
  if (from === to && !before) return;
  saveViewState(tab);
  from.tabs.splice(from.tabs.indexOf(tab), 1); tab.el.remove(); from.mru = from.mru.filter((t) => t !== tab);
  if (from.active === tab) { from.active = null; const n = from.tabs[0]; if (n) activate(n); else { from.editor?.setModel(null); emptyGroupHint(from); } }
  if (tab.surface) tab.surface.remove(), (tab.surface = null);
  tab.group = to; const i = before ? to.tabs.indexOf(before) : to.tabs.length; to.tabs.splice(i, 0, tab);
  to.tabsEl.insertBefore(tab.el, to.tabsEl.children[i] || null);
  to.body.querySelector(".group-empty")?.remove(); activate(tab);
}

// follow file renames / deletes done in the explorer
async function onRenamed(from, to) {
  for (const d of [...docs.values()]) {
    if (!P.inside(from, d.path)) continue;
    const np = to + d.path.slice(from.length); docs.delete(d.path);
    const was = d.path; d.path = np;
    if (d.model) {
      const text = d.model.getValue(), dirty = d.dirty;
      const nm = monaco.editor.createModel(text, languageForPath(np), monaco.Uri.file(np));
      for (const g of groups) if (g?.editor?.getModel() === d.model) g.editor.setModel(nm);
      d.model.dispose(); d.model = nm; d.savedVersion = dirty ? -1 : nm.getAlternativeVersionId();
      nm.onDidChangeContent(() => { updateDirty(d); scheduleAutoSave(d); editorEvents.emit("content", d); });
      updateDirty(d);
    }
    docs.set(np, d);
    for (const t of allTabs()) if (t.path === was) { t.path = np; t.title = P.base(np); t.el.querySelector(".name").textContent = t.title; const fi = t.el.querySelector(".fi"); fi?.replaceWith(icons.fileIcon(t.title)); t.el.title = np; }
  }
  refreshTabs();
}
function onDeleted(path) { for (const t of allTabs()) if (t.path && P.inside(path, t.path)) closeTab(t, true); }

// ------------------------------------------------------------------------------------ session restore
function sessionSnapshot() {
  return { files: groups[0].tabs.filter((t) => t.kind === "file").map((t) => t.path), active: groups[0].active?.path || null };
}
export async function restoreSession() {
  const s = settings.state.sessions[ws.root || ""]; if (!s) return;
  for (const f of s.files || []) { if (await N.fs.exists(f)) await openFile(f, { focus: false }).catch(() => {}); }
  if (s.active) { const t = groups[0].tabs.find((q) => q.path === s.active); if (t) activate(t); }
}

// ------------------------------------------------------------------------------------ helpers for other modules
export function setLanguage(path, lang) {
  const d = docs.get(path); if (!d?.model) return;
  settings.state.langOverrides = { ...(settings.state.langOverrides || {}), [path]: lang }; settings.saveState();
  monaco.editor.setModelLanguage(d.model, lang);
}
export function insertText(text) { const ed = activeEditor(); if (!ed) return; ed.focus(); ed.trigger("keyboard", "type", { text }); }
export function replaceSelection(text) { const ed = activeEditor(); if (!ed) return; const sel = ed.getSelection(); ed.executeEdits("cf", [{ range: sel, text, forceMoveMarkers: true }]); ed.pushUndoStop(); }
export function selectionText() { const ed = activeEditor(); if (!ed) return ""; const m = ed.getModel(); const s = ed.getSelection(); return s && !s.isEmpty() ? m.getValueInRange(s) : ""; }
export function revealRange(path, r) { return openFile(path, { line: r.startLineNumber, col: r.startColumn }); }
export function eol(path) { return docs.get(path)?.model?.getEOL() === "\r\n" ? "CRLF" : "LF"; }
export function markers() { return monaco ? monaco.editor.getModelMarkers({}) : []; }
export function getEditorGroups() { return groups; }

// ---- toolbar undo / redo (operate on the model so the soft keyboard is not summoned)
const curModel = () => { const e = activeEditor(); return e && e.getModel && e.getModel(); };
export function undoState() { const m = curModel(); try { return { undo: !!m?.canUndo?.(), redo: !!m?.canRedo?.() }; } catch { return { undo: false, redo: false }; } }
export function undo() { const m = curModel(); if (m?.canUndo?.()) { m.undo(); } else toast("Nothing to undo", { timeout: 900 }); }
export function redo() { const m = curModel(); if (m?.canRedo?.()) { m.redo(); } else toast("Nothing to redo", { timeout: 900 }); }
