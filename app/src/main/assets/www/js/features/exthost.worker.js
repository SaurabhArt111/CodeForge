/* CodeForge "lite" extension host — runs inside a dedicated Worker, one Worker per extension.
 *
 * Implements a pragmatic subset of the VS Code extension API (`require("vscode")`) on top of a small RPC to the IDE:
 * commands, window messages/input/quick-pick/status bar/output channels/decorations, workspace config + files,
 * text editor edits, languages (completion / hover / formatting / diagnostics) and a few Node shims (path, util, events, os).
 * Anything else resolves to a harmless no-op that is logged once, so extensions degrade instead of crashing.
 *
 * Best-effort sandbox: network and worker-spawning globals are removed before extension code runs; filesystem access only
 * exists through the RPC (limited by the IDE to the project folder and the extension's own folder).
 */
"use strict";
const _post = self.postMessage.bind(self);
// Remove network / worker-spawning globals. The properties live on WorkerGlobalScope.prototype, so shadow them on every
// object of the chain (a plain `delete` would just re-expose the inherited one).
for (const k of ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "importScripts", "Worker", "SharedWorker", "BroadcastChannel", "indexedDB", "caches", "WebTransport", "RTCPeerConnection"]) {
  for (let o = self; o; o = Object.getPrototypeOf(o)) { if (Object.prototype.hasOwnProperty.call(o, k)) { try { Object.defineProperty(o, k, { value: undefined, writable: false, configurable: false }); } catch (e) { /* ignore */ } } }
  try { if (!Object.prototype.hasOwnProperty.call(self, k)) Object.defineProperty(self, k, { value: undefined, writable: false, configurable: false }); } catch (e) { /* ignore */ }
}
try { Object.defineProperty(self.navigator, "sendBeacon", { value: undefined }); } catch (e) { /* ignore */ }

let seq = 1; const pending = new Map();
const call = (m, a) => new Promise((res, rej) => { const id = seq++; pending.set(id, { res, rej }); _post({ t: "req", id, m, a }); });
const log = (level, ...a) => _post({ t: "log", level, text: a.map((x) => (typeof x === "string" ? x : x instanceof Error ? x.stack || x.message : safeJson(x))).join(" ") });
const safeJson = (x) => { try { return JSON.stringify(x); } catch (e) { return String(x); } };
const warned = new Set();
const unimpl = (name) => { if (!warned.has(name)) { warned.add(name); log("warn", `vscode.${name} is not implemented in CodeForge's lite extension host (ignored)`); } };
const noopFn = (name) => function () { unimpl(name); return undefined; };
const noopProxy = (prefix, base) => new Proxy(base, { get(t, k) { if (k in t) return t[k]; if (typeof k === "symbol" || k === "then") return undefined; unimpl(prefix + "." + String(k)); return noopFn(prefix + "." + String(k)); } });

// ------------------------------------------------------------------------------------------------ basic types
class Disposable { constructor(fn) { this._fn = fn; } dispose() { const f = this._fn; this._fn = null; if (f) f(); } static from(...ds) { return new Disposable(() => ds.forEach((d) => d && d.dispose && d.dispose())); } }
class EventEmitter {
  constructor() { this._l = new Set(); this.event = (fn, thisArg, disposables) => { const f = thisArg ? fn.bind(thisArg) : fn; this._l.add(f); const d = new Disposable(() => this._l.delete(f)); if (disposables) disposables.push(d); return d; }; }
  fire(e) { for (const f of [...this._l]) { try { f(e); } catch (err) { log("error", err); } } } dispose() { this._l.clear(); }
}
class Position {
  constructor(line, character) { this.line = line; this.character = character; }
  isBefore(o) { return this.line < o.line || (this.line === o.line && this.character < o.character); } isBeforeOrEqual(o) { return !o.isBefore(this); } isAfter(o) { return o.isBefore(this); } isAfterOrEqual(o) { return !this.isBefore(o); } isEqual(o) { return this.line === o.line && this.character === o.character; }
  compareTo(o) { return this.line - o.line || this.character - o.character; } translate(dl = 0, dc = 0) { if (typeof dl === "object") { dc = dl.characterDelta || 0; dl = dl.lineDelta || 0; } return new Position(this.line + dl, this.character + dc); } with(l = this.line, c = this.character) { if (typeof l === "object") { c = l.character ?? this.character; l = l.line ?? this.line; } return new Position(l, c); }
}
class Range {
  constructor(a, b, c, d) { if (typeof a === "number") { this.start = new Position(a, b); this.end = new Position(c, d); } else { this.start = a; this.end = b; } if (this.end.isBefore(this.start)) [this.start, this.end] = [this.end, this.start]; }
  get isEmpty() { return this.start.isEqual(this.end); } get isSingleLine() { return this.start.line === this.end.line; }
  contains(x) { if (x instanceof Range) return this.contains(x.start) && this.contains(x.end); return !x.isBefore(this.start) && !x.isAfter(this.end); } isEqual(o) { return this.start.isEqual(o.start) && this.end.isEqual(o.end); }
  intersection(o) { const s = this.start.isAfter(o.start) ? this.start : o.start, e = this.end.isBefore(o.end) ? this.end : o.end; return s.isAfter(e) ? undefined : new Range(s, e); } union(o) { return new Range(this.start.isBefore(o.start) ? this.start : o.start, this.end.isAfter(o.end) ? this.end : o.end); } with(s = this.start, e = this.end) { return new Range(s, e); }
}
class Selection extends Range { constructor(a, b, c, d) { const anchor = typeof a === "number" ? new Position(a, b) : a; const active = typeof a === "number" ? new Position(c, d) : b; super(anchor, active); this.anchor = anchor; this.active = active; } get isReversed() { return this.anchor.isAfter(this.active); } }
class Uri {
  constructor(scheme, authority, path, query, fragment) { this.scheme = scheme; this.authority = authority || ""; this.path = path || ""; this.query = query || ""; this.fragment = fragment || ""; }
  get fsPath() { return this.path; } static file(p) { return new Uri("file", "", p); } static parse(s) { const m = /^([a-z][\w+.-]*):(?:\/\/([^/?#]*))?([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/i.exec(String(s)); return m ? new Uri(m[1], m[2], decodeURIComponent(m[3] || ""), m[4], m[5]) : Uri.file(String(s)); }
  static joinPath(base, ...p) { return new Uri(base.scheme, base.authority, path.join(base.path, ...p)); } with(c) { return new Uri(c.scheme ?? this.scheme, c.authority ?? this.authority, c.path ?? this.path, c.query ?? this.query, c.fragment ?? this.fragment); }
  toString() { return this.scheme === "file" ? "file://" + this.path : `${this.scheme}://${this.authority}${this.path}${this.query ? "?" + this.query : ""}`; } toJSON() { return { scheme: this.scheme, authority: this.authority, path: this.path, fsPath: this.path }; }
}
class MarkdownString { constructor(v = "", themeIcons) { this.value = v; this.isTrusted = false; this.supportThemeIcons = !!themeIcons; } appendText(t) { this.value += t.replace(/[\\`*_{}[\]()#+\-.!]/g, "\\$&"); return this; } appendMarkdown(t) { this.value += t; return this; } appendCodeblock(c, l = "") { this.value += "\n```" + l + "\n" + c + "\n```\n"; return this; } }
class TextEdit { constructor(range, newText) { this.range = range; this.newText = newText; } static replace(r, t) { return new TextEdit(r, t); } static insert(p, t) { return new TextEdit(new Range(p, p), t); } static delete(r) { return new TextEdit(r, ""); } }
class WorkspaceEdit { constructor() { this._e = []; } replace(uri, r, t) { this._e.push({ uri, range: r, newText: t }); } insert(uri, p, t) { this.replace(uri, new Range(p, p), t); } delete(uri, r) { this.replace(uri, r, ""); } get size() { return this._e.length; } }
class ThemeColor { constructor(id) { this.id = id; } }
class ThemeIcon { constructor(id) { this.id = id; } }
class CompletionItem { constructor(label, kind) { this.label = label; this.kind = kind; } }
class CompletionList { constructor(items = [], incomplete = false) { this.items = items; this.isIncomplete = incomplete; } }
class Hover { constructor(contents, range) { this.contents = Array.isArray(contents) ? contents : [contents]; this.range = range; } }
class Diagnostic { constructor(range, message, severity = 0) { this.range = range; this.message = message; this.severity = severity; } }
class Location { constructor(uri, r) { this.uri = uri; this.range = r; } }
class CancellationTokenSource { constructor() { const e = new EventEmitter(); this.token = { isCancellationRequested: false, onCancellationRequested: e.event }; this._e = e; } cancel() { this.token.isCancellationRequested = true; this._e.fire(); } dispose() {} }
class SnippetString { constructor(v = "") { this.value = v; } appendText(t) { this.value += t.replace(/[$}\\]/g, "\\$&"); return this; } appendTabstop(n = 1) { this.value += "$" + n; return this; } appendPlaceholder(v, n = 1) { this.value += "${" + n + ":" + (typeof v === "string" ? v : "") + "}"; return this; } }
const E = (names) => Object.fromEntries(names.flatMap((n, i) => [[n, i], [i, n]]));
const CompletionItemKind = E(["Text", "Method", "Function", "Constructor", "Field", "Variable", "Class", "Interface", "Module", "Property", "Unit", "Value", "Enum", "Keyword", "Snippet", "Color", "File", "Reference", "Folder", "EnumMember", "Constant", "Struct", "Event", "Operator", "TypeParameter"]);
const DiagnosticSeverity = E(["Error", "Warning", "Information", "Hint"]);
const StatusBarAlignment = { Left: 1, Right: 2, 1: "Left", 2: "Right" }; const ConfigurationTarget = { Global: 1, Workspace: 2, WorkspaceFolder: 3 };
const ViewColumn = { Active: -1, Beside: -2, One: 1, Two: 2, Three: 3 }; const EndOfLine = { LF: 1, CRLF: 2 }; const TextEditorRevealType = { Default: 0, InCenter: 1, InCenterIfOutsideViewport: 2, AtTop: 3 };
const DecorationRangeBehavior = { OpenOpen: 0, ClosedClosed: 1, OpenClosed: 2, ClosedOpen: 3 }; const OverviewRulerLane = { Left: 1, Center: 2, Right: 4, Full: 7 }; const ProgressLocation = { SourceControl: 1, Window: 10, Notification: 15 };
const FileType = { Unknown: 0, File: 1, Directory: 2, SymbolicLink: 64 }; const ExtensionMode = { Production: 1, Development: 2, Test: 3 };

// ------------------------------------------------------------------------------------------------ node shims
const path = (() => {
  const norm = (p) => { const abs = p.startsWith("/"); const out = []; for (const s of p.split("/")) { if (!s || s === ".") continue; if (s === "..") { if (out.length && out[out.length - 1] !== "..") out.pop(); else if (!abs) out.push(".."); } else out.push(s); } return (abs ? "/" : "") + out.join("/") || (abs ? "/" : "."); };
  const P = { sep: "/", delimiter: ":", normalize: norm, join: (...a) => norm(a.filter(Boolean).join("/")), resolve: (...a) => { let r = ""; for (let i = a.length - 1; i >= 0 && !r.startsWith("/"); i--) r = a[i] + (r ? "/" + r : ""); return norm(r.startsWith("/") ? r : "/" + r); },
    dirname: (p) => { const i = p.replace(/\/+$/, "").lastIndexOf("/"); return i < 0 ? "." : i === 0 ? "/" : p.slice(0, i); }, basename: (p, ext) => { let b = p.replace(/\/+$/, "").split("/").pop(); if (ext && b.endsWith(ext)) b = b.slice(0, -ext.length); return b; },
    extname: (p) => { const b = P.basename(p); const i = b.lastIndexOf("."); return i <= 0 ? "" : b.slice(i); }, isAbsolute: (p) => p.startsWith("/"),
    relative: (f, t) => { const a = P.resolve(f).split("/").filter(Boolean), b = P.resolve(t).split("/").filter(Boolean); let i = 0; while (i < a.length && a[i] === b[i]) i++; return [...a.slice(i).map(() => ".."), ...b.slice(i)].join("/"); },
    parse: (p) => { const base = P.basename(p), ext = P.extname(p); return { root: p.startsWith("/") ? "/" : "", dir: P.dirname(p), base, ext, name: ext ? base.slice(0, -ext.length) : base }; }, format: (o) => (o.dir ? o.dir + "/" : "") + (o.base || (o.name || "") + (o.ext || "")) };
  P.posix = P; P.win32 = P; return P;
})();
const util = { promisify: (fn) => (...a) => new Promise((res, rej) => fn(...a, (e, v) => (e ? rej(e) : res(v)))), format: (f, ...a) => { let i = 0; const s = String(f).replace(/%[sdifjoO%]/g, (m) => (m === "%%" ? "%" : i < a.length ? (m === "%j" || m === "%o" || m === "%O" ? safeJson(a[i++]) : String(a[i++])) : m)); return [s, ...a.slice(i)].join(" "); }, inspect: (x) => (typeof x === "string" ? x : safeJson(x)), isDeepStrictEqual: (a, b) => safeJson(a) === safeJson(b), TextEncoder, TextDecoder, types: {}, inherits: (c, s) => { Object.setPrototypeOf(c.prototype, s.prototype); } };
class NodeEvents { constructor() { this._ev = {}; } on(e, f) { (this._ev[e] ||= []).push(f); return this; } addListener(e, f) { return this.on(e, f); } once(e, f) { const w = (...a) => { this.off(e, w); f(...a); }; return this.on(e, w); } off(e, f) { this._ev[e] = (this._ev[e] || []).filter((x) => x !== f); return this; } removeListener(e, f) { return this.off(e, f); } removeAllListeners(e) { if (e) delete this._ev[e]; else this._ev = {}; return this; } emit(e, ...a) { const l = this._ev[e] || []; l.slice().forEach((f) => f(...a)); return l.length > 0; } listenerCount(e) { return (this._ev[e] || []).length; } }
NodeEvents.EventEmitter = NodeEvents; NodeEvents.default = NodeEvents;
const nodeOs = { platform: () => "linux", arch: () => "arm64", EOL: "\n", homedir: () => "/root", tmpdir: () => "/tmp", type: () => "Linux", release: () => "", hostname: () => "codeforge", cpus: () => [], totalmem: () => 0, freemem: () => 0, userInfo: () => ({ username: "root" }) };
const NODE_MODULES = { path, util, events: NodeEvents, os: nodeOs, assert: Object.assign((c, m) => { if (!c) throw new Error(m || "Assertion failed"); }, { ok: (c, m) => { if (!c) throw new Error(m || "Assertion failed"); }, equal: (a, b) => { if (a != b) throw new Error("not equal"); }, strictEqual: (a, b) => { if (a !== b) throw new Error("not strictEqual"); } }), url: { URL, URLSearchParams, fileURLToPath: (u) => new URL(u).pathname, pathToFileURL: (p) => new URL("file://" + p) }, timers: { setTimeout, clearTimeout, setInterval, clearInterval } };

// ------------------------------------------------------------------------------------------------ documents
const state = { ext: null, active: null, docs: new Map(), cfg: {}, root: null };
function mkDoc(s) {
  const text = s.text ?? ""; let lines = null; const L = () => (lines ||= text.split(/\r\n|\r|\n/)); let starts = null;
  const S = () => { if (!starts) { starts = [0]; for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); if (c === 10) starts.push(i + 1); else if (c === 13 && text.charCodeAt(i + 1) !== 10) starts.push(i + 1); } } return starts; };
  const doc = {
    uri: Uri.file(s.path), fileName: s.path, languageId: s.languageId, version: s.version, isDirty: !!s.dirty, isUntitled: false, isClosed: false, eol: s.eol === "\r\n" ? 2 : 1, encoding: "utf8",
    get lineCount() { return L().length; }, getText(r) { if (!r) return text; return text.slice(doc.offsetAt(r.start), doc.offsetAt(r.end)); },
    lineAt(a) { const n = typeof a === "number" ? a : a.line; const t = L()[Math.max(0, Math.min(n, L().length - 1))] ?? ""; const m = /^\s*/.exec(t)[0].length; return { lineNumber: n, text: t, range: new Range(n, 0, n, t.length), rangeIncludingLineBreak: new Range(n, 0, n + 1, 0), firstNonWhitespaceCharacterIndex: m, isEmptyOrWhitespace: m === t.length }; },
    offsetAt(p) { const st = S(); const l = Math.max(0, Math.min(p.line, st.length - 1)); return Math.min(st[l] + p.character, l + 1 < st.length ? st[l + 1] : text.length); },
    positionAt(o) { const st = S(); o = Math.max(0, Math.min(o, text.length)); let lo = 0, hi = st.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (st[mid] <= o) lo = mid; else hi = mid - 1; } return new Position(lo, o - st[lo]); },
    getWordRangeAtPosition(p, re) { const t = L()[p.line] || ""; const rx = re ? new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g") : /[\w$]+/g; let m; while ((m = rx.exec(t))) { if (m.index <= p.character && p.character <= m.index + m[0].length) return new Range(p.line, m.index, p.line, m.index + m[0].length); if (m.index > p.character) break; } return undefined; },
    validateRange: (r) => r, validatePosition: (p) => p, save: () => call("doc.save", [s.path]).then(() => true),
  };
  return doc;
}
let editorProxy = null;
function mkEditor(s) {
  const doc = mkDoc(s);
  const sels = (s.selections || [{ anchor: { line: 0, character: 0 }, active: { line: 0, character: 0 } }]).map((x) => new Selection(x.anchor.line, x.anchor.character, x.active.line, x.active.character));
  const ed = {
    document: doc, selection: sels[0], selections: sels, visibleRanges: [new Range(0, 0, Math.min(doc.lineCount, 50), 0)], options: { tabSize: s.tabSize || 2, insertSpaces: s.insertSpaces !== false }, viewColumn: 1,
    async edit(cb) { const b = { _e: [], replace(r, t) { this._e.push({ range: r, newText: t }); }, insert(p, t) { this._e.push({ range: new Range(p, p), newText: t }); }, delete(r) { this._e.push({ range: r, newText: "" }); }, setEndOfLine() {} }; cb(b); return call("ed.edit", [s.path, b._e.map(rangeOut)]).then(() => true); },
    async insertSnippet(snip, loc) { return call("ed.snippet", [s.path, snip.value ?? String(snip), loc ? rangeOut({ range: loc.range ? loc.range : new Range(loc, loc) }).range : null]).then(() => true); },
    setDecorations(type, ranges) { call("dec.set", [type.key, s.path, (ranges || []).map((r) => ({ range: rangeJson(r.range || r), hover: r.hoverMessage ? mdText(r.hoverMessage) : undefined, opts: r.renderOptions }))]).catch(() => {}); },
    revealRange(r, t) { call("ed.reveal", [s.path, rangeJson(r), t]).catch(() => {}); }, show() {}, hide() {},
  };
  Object.defineProperty(ed, "selection", { get: () => ed.selections[0], set: (v) => { ed.selections = [v]; call("ed.select", [s.path, [{ anchor: pos(v.anchor || v.start), active: pos(v.active || v.end) }]]).catch(() => {}); } });
  return ed;
}
const pos = (p) => ({ line: p.line, character: p.character });
const rangeJson = (r) => ({ start: pos(r.start), end: pos(r.end) });
const rangeOut = (e) => ({ range: rangeJson(e.range), newText: e.newText });
const mdText = (m) => (Array.isArray(m) ? m : [m]).map((x) => (typeof x === "string" ? x : x && x.value) || "").join("\n\n");
const asRange = (r) => new Range(r.start.line, r.start.character, r.end.line, r.end.character);

// ------------------------------------------------------------------------------------------------ vscode API
const emitters = { activeEditor: new EventEmitter(), selection: new EventEmitter(), docChange: new EventEmitter(), docOpen: new EventEmitter(), docSave: new EventEmitter(), docClose: new EventEmitter(), config: new EventEmitter(), visible: new EventEmitter() };
const commandsMap = new Map(); const providers = new Map(); let provSeq = 1; const decoTypes = new Map(); let decoSeq = 1;
const cfgGet = (section) => {
  const vals = state.cfg || {};
  const get = (key, dflt) => { const k = section ? section + "." + key : key; if (k in vals) return vals[k]; const parts = k.split("."); for (let n = parts.length - 1; n > 0; n--) { const pre = parts.slice(0, n).join("."); if (pre in vals && vals[pre] && typeof vals[pre] === "object") { let cur = vals[pre]; for (const p of parts.slice(n)) cur = cur?.[p]; if (cur !== undefined) return cur; } } return dflt; };
  return { get, has: (k) => get(k, undefined) !== undefined, inspect: (k) => ({ key: k, globalValue: get(k, undefined), defaultValue: get(k, undefined) }), update: (k, v) => call("cfg.update", [section ? section + "." + k : k, v]).then(() => undefined) };
};
// ---- views: trees and webviews (rendered by the IDE in the side bar / a page)
const trees = new Map(), webProviders = new Map(), webviews = new Map();
class TreeItem { constructor(label, collapsibleState = 0) { if (label && typeof label === "object" && label.path !== undefined && !("label" in label)) this.resourceUri = label; else this.label = label; this.collapsibleState = collapsibleState; } }
const TreeItemCollapsibleState = { None: 0, Collapsed: 1, Expanded: 2 };
function regTree(viewId, prov) {
  if (!prov) return new Disposable(() => {});
  const t = { prov, els: new Map(), n: 1 }; trees.set(viewId, t);
  let sub; try { sub = prov.onDidChangeTreeData && prov.onDidChangeTreeData(() => call("view.treeRefresh", [viewId]).catch(() => {})); } catch (e) { /* ignore */ }
  call("view.register", [viewId, "tree"]).catch(() => {});
  return new Disposable(() => { trees.delete(viewId); sub && sub.dispose && sub.dispose(); });
}
function mkWebview(k) {
  const em = new EventEmitter(); let html = "";
  const wv = { options: {}, cspSource: "'self'", get html() { return html; }, set html(v) { html = String(v); call("view.html", [k, html]).catch(() => {}); },
    postMessage: (m) => call("view.post", [k, plain(m)]).then(() => true, () => false), onDidReceiveMessage: em.event, asWebviewUri: (u) => new Uri("cfres", "f", u.fsPath || u.path) };
  return { wv, em };
}
const vscode = {
  TreeItem, TreeItemCollapsibleState, Disposable, EventEmitter, Position, Range, Selection, Uri, MarkdownString, TextEdit, WorkspaceEdit, ThemeColor, ThemeIcon, CompletionItem, CompletionList, Hover, Diagnostic, Location, CancellationTokenSource, SnippetString,
  CompletionItemKind, DiagnosticSeverity, StatusBarAlignment, ConfigurationTarget, ViewColumn, EndOfLine, TextEditorRevealType, DecorationRangeBehavior, OverviewRulerLane, ProgressLocation, FileType, ExtensionMode,
  version: "1.95.0",
  env: noopProxy("env", { appName: "CodeForge", appRoot: "/", language: "en", machineId: "codeforge", sessionId: "s", uriScheme: "codeforge", shell: "/bin/bash", remoteName: undefined, uiKind: 2, isNewAppInstall: false, isTelemetryEnabled: false,
    clipboard: { readText: () => call("env.clipRead", []), writeText: (t) => call("env.clipWrite", [t]) }, openExternal: (u) => call("env.open", [String(u)]).then(() => true), asExternalUri: async (u) => u }),
  commands: {
    registerCommand(id, fn, thisArg) { commandsMap.set(id, thisArg ? fn.bind(thisArg) : fn); call("cmd.register", [id]).catch(() => {}); return new Disposable(() => { commandsMap.delete(id); call("cmd.unregister", [id]).catch(() => {}); }); },
    registerTextEditorCommand(id, fn, thisArg) { return vscode.commands.registerCommand(id, (...a) => { const e = vscode.window.activeTextEditor; if (e) return fn.call(thisArg, e, { replace: (r, t) => e.edit((b) => b.replace(r, t)) }, ...a); }); },
    executeCommand: (id, ...a) => (commandsMap.has(id) ? Promise.resolve(commandsMap.get(id)(...a)) : call("cmd.exec", [id, a.map(plain)])),
    getCommands: async () => [...commandsMap.keys()],
  },
  window: noopProxy("window", {
    get activeTextEditor() { return editorProxy; }, get visibleTextEditors() { return editorProxy ? [editorProxy] : []; }, get activeColorTheme() { return { kind: state.themeKind || 2 }; }, state: { focused: true },
    onDidChangeActiveTextEditor: emitters.activeEditor.event, onDidChangeTextEditorSelection: emitters.selection.event, onDidChangeVisibleTextEditors: emitters.visible.event, onDidChangeActiveColorTheme: new EventEmitter().event,
    showInformationMessage: (m, ...a) => msg("info", m, a), showWarningMessage: (m, ...a) => msg("warn", m, a), showErrorMessage: (m, ...a) => msg("error", m, a),
    showInputBox: (o = {}) => call("ui.input", [{ prompt: o.prompt, title: o.title, value: o.value, placeHolder: o.placeHolder, password: o.password }]),
    showQuickPick: async (items, o = {}) => { const arr = await Promise.resolve(items); const list = arr.map((x, i) => (typeof x === "string" ? { label: x, i } : { label: x.label, description: x.description, detail: x.detail, i })); const r = await call("ui.pick", [list, { placeHolder: o.placeHolder, title: o.title, canPickMany: !!o.canPickMany }]); if (r == null) return undefined; return o.canPickMany ? r.map((i) => arr[i]) : arr[r]; },
    setStatusBarMessage: (t, h) => { call("ui.statusMsg", [String(t), typeof h === "number" ? h : 0]).catch(() => {}); return new Disposable(() => call("ui.statusMsg", ["", 0]).catch(() => {})); },
    createStatusBarItem: (a, b, c) => { const id = "sb" + provSeq++; const it = { id: typeof a === "string" ? a : id, text: "", tooltip: "", command: undefined, color: undefined, alignment: typeof a === "number" ? a : b || 1, priority: typeof a === "number" ? b : c || 0, name: undefined, backgroundColor: undefined, accessibilityInformation: undefined,
      show() { push(); }, hide() { call("ui.statusHide", [id]).catch(() => {}); }, dispose() { call("ui.statusHide", [id]).catch(() => {}); } }; const push = () => call("ui.status", [id, { text: it.text, tooltip: typeof it.tooltip === "string" ? it.tooltip : mdText(it.tooltip || ""), command: typeof it.command === "string" ? it.command : it.command?.command, args: it.command?.arguments, alignment: it.alignment, priority: it.priority }]).catch(() => {}); return it; },
    createOutputChannel: (name) => { const ch = { name, append: (t) => _post({ t: "out", name, text: String(t) }), appendLine: (t) => _post({ t: "out", name, text: String(t) + "\n" }), replace: (t) => _post({ t: "out", name, text: String(t) + "\n" }), clear() { _post({ t: "out", name, clear: true }); }, show() { call("out.show", [name]).catch(() => {}); }, hide() {}, dispose() {}, debug: (t) => ch.appendLine(t), info: (t) => ch.appendLine(t), warn: (t) => ch.appendLine(t), error: (t) => ch.appendLine(t), trace: (t) => ch.appendLine(t), logLevel: 2, onDidChangeLogLevel: new EventEmitter().event }; return ch; },
    createTextEditorDecorationType: (opts) => { const key = "d" + decoSeq++; decoTypes.set(key, opts); call("dec.create", [key, opts]).catch(() => {}); return { key, dispose() { call("dec.dispose", [key]).catch(() => {}); } }; },
    withProgress: async (o, task) => { const t = typeof o === "object" ? o.title || "" : ""; call("ui.busy", [t, true]).catch(() => {}); try { return await task({ report: (v) => v && v.message && call("ui.busy", [t + " " + v.message, true]).catch(() => {}) }, new CancellationTokenSource().token); } finally { call("ui.busy", [t, false]).catch(() => {}); } },
    showTextDocument: async (d, o) => { const p = d.uri ? d.uri.fsPath : d.fileName || String(d); await call("ed.open", [p, o && o.selection ? rangeJson(o.selection) : null]); return editorProxy; },
    createTerminal: (o = {}) => { const name = typeof o === "string" ? o : o.name || "terminal"; return { name, sendText: (t, nl = true) => call("term.send", [name, t + (nl === false ? "" : "\n")]).catch(() => {}), show() { call("term.show", [name]).catch(() => {}); }, hide() {}, dispose() {}, processId: Promise.resolve(0), exitStatus: undefined }; },
    registerTreeDataProvider: (viewId, prov) => regTree(viewId, prov),
    createTreeView: (viewId, o = {}) => { const d = regTree(viewId, o.treeDataProvider); return { dispose: () => d.dispose(), reveal: async () => {}, onDidChangeSelection: new EventEmitter().event, onDidExpandElement: new EventEmitter().event, onDidCollapseElement: new EventEmitter().event, onDidChangeVisibility: new EventEmitter().event, onDidChangeCheckboxState: new EventEmitter().event, visible: true, selection: [], title: undefined, description: undefined, message: undefined, badge: undefined }; },
    registerWebviewViewProvider: (viewId, prov) => { webProviders.set(viewId, prov); call("view.register", [viewId, "webview"]).catch(() => {}); return new Disposable(() => webProviders.delete(viewId)); },
    createWebviewPanel: (viewType, title, _col, _opts) => {
      const k = "panel:" + viewType + ":" + provSeq++; const { wv, em } = mkWebview(k); const disp = new EventEmitter(); webviews.set(k, { em, disp });
      call("view.panel", [k, String(title || "")]).catch(() => {});
      return { webview: wv, viewType, title, options: {}, viewColumn: 1, active: true, visible: true, iconPath: undefined, reveal() { call("view.panelShow", [k]).catch(() => {}); }, dispose() { call("view.panelClose", [k]).catch(() => {}); webviews.delete(k); disp.fire(); }, onDidDispose: disp.event, onDidChangeViewState: new EventEmitter().event };
    },
    registerWebviewPanelSerializer: () => new Disposable(() => {}), registerCustomEditorProvider: () => { unimpl("window.registerCustomEditorProvider"); return new Disposable(() => {}); },
    registerUriHandler: () => new Disposable(() => {}), registerFileDecorationProvider: () => new Disposable(() => {}), registerTerminalLinkProvider: () => new Disposable(() => {}),
  }),
  workspace: noopProxy("workspace", {
    get workspaceFolders() { return state.root ? [{ uri: Uri.file(state.root), name: path.basename(state.root), index: 0 }] : undefined; }, get rootPath() { return state.root || undefined; }, get name() { return state.root ? path.basename(state.root) : undefined; },
    get textDocuments() { return [...state.docs.values()]; }, isTrusted: true,
    getConfiguration: (section) => cfgGet(section || ""), onDidChangeConfiguration: emitters.config.event, onDidChangeTextDocument: emitters.docChange.event, onDidOpenTextDocument: emitters.docOpen.event, onDidCloseTextDocument: emitters.docClose.event, onDidSaveTextDocument: emitters.docSave.event,
    onDidChangeWorkspaceFolders: new EventEmitter().event, onDidCreateFiles: new EventEmitter().event, onDidDeleteFiles: new EventEmitter().event, onDidRenameFiles: new EventEmitter().event,
    openTextDocument: async (a) => { const p = typeof a === "string" ? a : a.fsPath || a.path || (a.uri && a.uri.fsPath); const s = await call("doc.open", [p]); const d = mkDoc(s); state.docs.set(p, d); return d; },
    findFiles: async (inc, exc, max) => (await call("ws.find", [typeof inc === "string" ? inc : inc?.pattern || "**/*", typeof exc === "string" ? exc : exc?.pattern || null, max || 500])).map(Uri.file),
    applyEdit: async (we) => { const by = {}; for (const e of we._e) (by[e.uri.fsPath] ||= []).push(rangeOut(e)); for (const [p, edits] of Object.entries(by)) await call("ed.edit", [p, edits]); return true; },
    saveAll: () => call("doc.saveAll", []).then(() => true), asRelativePath: (p) => { const s = typeof p === "string" ? p : p.fsPath; return state.root && s.startsWith(state.root + "/") ? s.slice(state.root.length + 1) : s; },
    getWorkspaceFolder: (u) => (state.root && u.fsPath.startsWith(state.root) ? { uri: Uri.file(state.root), name: path.basename(state.root), index: 0 } : undefined),
    createFileSystemWatcher: () => ({ onDidChange: new EventEmitter().event, onDidCreate: new EventEmitter().event, onDidDelete: new EventEmitter().event, dispose() {} }),
    registerTextDocumentContentProvider: () => new Disposable(() => {}),
    fs: { readFile: async (u) => new TextEncoder().encode(await call("fs.read", [u.fsPath])), writeFile: async (u, b) => call("fs.write", [u.fsPath, new TextDecoder().decode(b)]).then(() => undefined), stat: async (u) => call("fs.stat", [u.fsPath]).then((s) => ({ type: s.t === "d" ? 2 : 1, size: s.s, mtime: s.m, ctime: s.m })), readDirectory: async (u) => (await call("fs.list", [u.fsPath])).map((e) => [e.n, e.t === "d" ? 2 : 1]), createDirectory: (u) => call("fs.mkdir", [u.fsPath]).then(() => undefined), delete: (u) => call("fs.rm", [u.fsPath]).then(() => undefined) },
  }),
  languages: noopProxy("languages", {
    registerCompletionItemProvider: (sel, prov, ...trig) => reg("completion", sel, prov, { triggers: trig }), registerHoverProvider: (sel, prov) => reg("hover", sel, prov), registerDocumentFormattingEditProvider: (sel, prov) => reg("format", sel, prov), registerDocumentRangeFormattingEditProvider: (sel, prov) => reg("formatRange", sel, prov),
    registerDefinitionProvider: (sel, prov) => reg("definition", sel, prov), registerCodeActionsProvider: () => { unimpl("languages.registerCodeActionsProvider"); return new Disposable(() => {}); },
    createDiagnosticCollection: (name = "ext") => { const m = new Map(); const col = { name, set(u, d) { if (Array.isArray(u)) { for (const [uu, dd] of u) col.set(uu, dd); return; } m.set(u.fsPath, d || []); call("diag.set", [name, u.fsPath, (d || []).map((x) => ({ range: rangeJson(x.range), message: x.message, severity: x.severity, source: x.source, code: typeof x.code === "object" ? x.code?.value : x.code }))]).catch(() => {}); }, delete(u) { m.delete(u.fsPath); call("diag.set", [name, u.fsPath, []]).catch(() => {}); }, clear() { for (const p of m.keys()) call("diag.set", [name, p, []]).catch(() => {}); m.clear(); }, get: (u) => m.get(u.fsPath), forEach(cb) { m.forEach((d, p) => cb(Uri.file(p), d, col)); }, has: (u) => m.has(u.fsPath), dispose() { col.clear(); } }; return col; },
    getDiagnostics: () => [], getLanguages: async () => [], match: (sel, doc) => (selMatch(sel, doc.languageId, doc.fileName) ? 10 : 0), setLanguageConfiguration: () => new Disposable(() => {}),
  }),
  extensions: { getExtension: () => undefined, all: [], onDidChange: new EventEmitter().event },
  l10n: { t: (m, ...a) => (typeof m === "string" ? m.replace(/\{(\d+)\}/g, (_, i) => a[i]) : m.message) },
  tasks: noopProxy("tasks", {}), debug: noopProxy("debug", {}), scm: noopProxy("scm", {}), authentication: noopProxy("authentication", {}), chat: noopProxy("chat", {}), lm: noopProxy("lm", {}), notebooks: noopProxy("notebooks", {}), comments: noopProxy("comments", {}), tests: noopProxy("tests", {}),
};
const plain = (x) => { try { return JSON.parse(JSON.stringify(x)); } catch (e) { return undefined; } };
async function msg(level, text, a) {
  const items = a.filter((x) => typeof x === "string" || (x && typeof x === "object" && "title" in x && !("modal" in x && Object.keys(x).length === 1)));
  const modal = a.find((x) => x && typeof x === "object" && x.modal);
  const titles = items.map((x) => (typeof x === "string" ? x : x.title)); const i = await call("ui.message", [level, String(text), titles, !!modal]); return i == null ? undefined : items[i];
}
const selMatch = (sel, lang, file) => { const l = Array.isArray(sel) ? sel : [sel]; return l.some((s) => s === "*" || (typeof s === "string" ? s === lang : !s || ((!s.language || s.language === lang) && (!s.pattern || globRe(typeof s.pattern === "string" ? s.pattern : s.pattern.pattern).test(file))))); };
const globRe = (g) => new RegExp("^" + g.replace(/[.+^${}()|\\]/g, "\\$&").replace(/\*\*\//g, "(?:.*/)?").replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*").replace(/\?/g, ".").replace(/\{([^}]+)\}/g, (_, a) => "(?:" + a.split(",").join("|") + ")") + "$");
function reg(kind, selector, prov, extra = {}) {
  const id = "p" + provSeq++; providers.set(id, { kind, prov });
  call("lang.register", [id, kind, plain(selector), extra.triggers || []]).catch(() => {});
  return new Disposable(() => { providers.delete(id); call("lang.unregister", [id]).catch(() => {}); });
}

// ------------------------------------------------------------------------------------------------ require / activation
const modCache = new Map(); let files = {};
function makeRequire(fromDir) {
  const req = (name) => {
    if (name === "vscode") return vscode;
    const bare = name.replace(/^node:/, "");
    if (NODE_MODULES[bare]) return NODE_MODULES[bare];
    if (name.startsWith(".") || name.startsWith("/")) return loadFile(resolveFile(fromDir, name));
    const nm = resolveNodeModule(fromDir, name); if (nm) return loadFile(nm);
    throw new Error(`Cannot find module '${name}'. This extension needs a Node.js module that CodeForge's lite extension host does not provide.`);
  };
  req.resolve = (n) => n; return req;
}
function resolveNodeModule(dir, name) {
  for (let d = dir; ; d = path.dirname(d)) {
    const base = path.join(d, "node_modules", name);
    const pj = base + "/package.json";
    if (pj in files) { try { const main = JSON.parse(files[pj]).main || "index.js"; return resolveFile(base, "./" + main); } catch (e) { /* fall through */ } }
    for (const c of [base + ".js", base + "/index.js", base]) if (c in files) return c;
    if (d === "/" || d === "." || !d) return null;
  }
}
function resolveFile(dir, name) {
  const base = path.join(dir, name);
  for (const c of [base, base + ".js", base + ".json", base + ".cjs", base + "/index.js"]) if (c in files) return c;
  throw new Error(`Cannot find module '${name}' (from ${dir})`);
}
function loadFile(p) {
  if (modCache.has(p)) return modCache.get(p).exports;
  const mod = { exports: {} }; modCache.set(p, mod);
  if (p.endsWith(".json")) { mod.exports = JSON.parse(files[p]); return mod.exports; }
  const fn = new Function("module", "exports", "require", "__filename", "__dirname", "process", "global", "Buffer", files[p] + "\n//# sourceURL=ext:" + p);
  fn(mod, mod.exports, makeRequire(path.dirname(p)), p, path.dirname(p), proc, self, undefined);
  return mod.exports;
}
const proc = { platform: "linux", arch: "arm64", env: { HOME: "/root", LANG: "en_US.UTF-8" }, versions: { node: "18.0.0" }, version: "v18.0.0", cwd: () => state.root || "/", argv: [], pid: 1, nextTick: (f, ...a) => Promise.resolve().then(() => f(...a)), on() { return proc; }, off() { return proc; }, emitWarning() {}, hrtime: Object.assign(() => [0, 0], { bigint: () => 0n }), memoryUsage: () => ({ heapUsed: 0 }), exit() {}, release: { name: "node" }, stdout: { write() {} }, stderr: { write() {} } };

function mkMemento(kind, init) {
  const data = { ...(init || {}) };
  return { keys: () => Object.keys(data), get: (k, d) => (k in data ? data[k] : d), update: (k, v) => { if (v === undefined) delete data[k]; else data[k] = v; return call("state.set", [kind, plain(data)]).then(() => undefined); }, setKeysForSync() {} };
}
async function activate(init) {
  state.ext = init; state.root = init.root; state.cfg = init.cfg || {}; state.themeKind = init.themeKind; files = init.files;
  const entry = init.main;
  const exp = loadFile(entry);
  const subs = [];
  const context = {
    subscriptions: subs, extensionPath: init.extPath, extensionUri: Uri.file(init.extPath), storagePath: init.storage, globalStoragePath: init.storage, logPath: init.storage, extensionMode: 1, environmentVariableCollection: noopProxy("env", {}),
    globalStorageUri: Uri.file(init.storage), storageUri: Uri.file(init.storage), logUri: Uri.file(init.storage), asAbsolutePath: (p) => path.join(init.extPath, p), extension: { id: init.id, extensionPath: init.extPath, packageJSON: init.manifest, isActive: true },
    globalState: mkMemento("global", init.globalState), workspaceState: mkMemento("workspace", init.workspaceState), secrets: { get: async () => undefined, store: async () => {}, delete: async () => {}, onDidChange: new EventEmitter().event },
  };
  if (exp && typeof exp.activate === "function") { const r = await exp.activate(context); state.exports = r; }
  state.deactivate = exp && exp.deactivate; state.subs = subs;
}
async function deactivate() { try { if (state.deactivate) await state.deactivate(); } catch (e) { log("error", e); } for (const d of state.subs || []) { try { d && d.dispose && d.dispose(); } catch (e) { /* ignore */ } } }

// ------------------------------------------------------------------------------------------------ incoming messages
self.onmessage = async (ev) => {
  const m = ev.data;
  if (m.t === "res") { const p = pending.get(m.id); if (!p) return; pending.delete(m.id); if (m.ok) p.res(m.r); else p.rej(new Error(m.e)); return; }
  if (m.t === "req") {   // IDE → extension
    let out;
    try { out = { t: "res", id: m.id, ok: true, r: await handle(m.m, m.a) }; } catch (e) { out = { t: "res", id: m.id, ok: false, e: String((e && e.stack) || e) }; }
    _post(out); return;
  }
  if (m.t === "evt") {
    const d = m.d;
    if (m.name === "editor") {
      const prev = editorProxy; if (d) { editorProxy = mkEditor(d); state.docs.set(d.path, editorProxy.document); } else editorProxy = null;
      if (!prev || !d || prev.document.fileName !== d.path) emitters.activeEditor.fire(editorProxy);
      else { emitters.docChange.fire({ document: editorProxy.document, contentChanges: [], reason: undefined }); }
      if (editorProxy) emitters.selection.fire({ textEditor: editorProxy, selections: editorProxy.selections, kind: 2 });
    } else if (m.name === "save") { const doc = state.docs.get(d.path); if (doc) emitters.docSave.fire(doc); } else if (m.name === "open") { const doc = mkDoc(d); state.docs.set(d.path, doc); emitters.docOpen.fire(doc); } else if (m.name === "close") { const doc = state.docs.get(d.path); state.docs.delete(d.path); if (doc) emitters.docClose.fire(doc); }
    else if (m.name === "config") { state.cfg = d; emitters.config.fire({ affectsConfiguration: () => true }); } else if (m.name === "theme") { state.themeKind = d; }
  }
};
async function handle(method, a) {
  switch (method) {
    case "activate": await activate(a[0]); return true;
    case "deactivate": await deactivate(); return true;
    case "cmd.run": { const f = commandsMap.get(a[0]); if (!f) throw new Error("Command not registered by this extension: " + a[0]); return plain(await f(...(a[1] || []))); }
    case "provide": {
      const [id, ctx] = a; const p = providers.get(id); if (!p) return null;
      const doc = mkDoc(ctx.doc); const position = new Position(ctx.pos.line, ctx.pos.character); const tok = new CancellationTokenSource().token;
      if (p.kind === "completion") {
        const r = await p.prov.provideCompletionItems(doc, position, tok, { triggerKind: ctx.trigger ? 1 : 0, triggerCharacter: ctx.trigger });
        const items = Array.isArray(r) ? r : r?.items || []; if (!items.length) return null;
        return items.slice(0, 500).map((c) => ({ label: typeof c.label === "string" ? c.label : c.label?.label, labelDetail: typeof c.label === "object" ? c.label.detail : undefined, kind: c.kind, detail: c.detail, doc: c.documentation ? mdText(c.documentation) : undefined, insert: c.insertText && c.insertText.value !== undefined ? c.insertText.value : c.insertText, snippet: !!(c.insertText && c.insertText.value !== undefined), filterText: c.filterText, sortText: c.sortText, range: c.range ? rangeJson(c.range.inserting || c.range) : undefined, commitChars: c.commitCharacters, preselect: c.preselect }));
      }
      if (p.kind === "hover") { const r = await p.prov.provideHover(doc, position, tok); if (!r) return null; return { contents: (r.contents || []).map(mdText), range: r.range ? rangeJson(r.range) : undefined }; }
      if (p.kind === "format") { const r = await p.prov.provideDocumentFormattingEdits(doc, { tabSize: ctx.tabSize || 2, insertSpaces: ctx.insertSpaces !== false }, tok); return (r || []).map(rangeOut); }
      if (p.kind === "formatRange") { const r = await p.prov.provideDocumentRangeFormattingEdits(doc, asRange(ctx.range), { tabSize: ctx.tabSize || 2, insertSpaces: true }, tok); return (r || []).map(rangeOut); }
      if (p.kind === "definition") { const r = await p.prov.provideDefinition(doc, position, tok); const l = Array.isArray(r) ? r : r ? [r] : []; return l.map((x) => ({ path: (x.uri || x.targetUri).fsPath, range: rangeJson(x.range || x.targetRange) })); }
      return null;
    }
    case "tree.children": {
      const [viewId, hd] = a; const t = trees.get(viewId); if (!t) return null;
      if (!hd) { t.els.clear(); t.n = 1; }
      const kids = (await t.prov.getChildren(hd ? t.els.get(hd) : undefined)) || []; const out = [];
      for (const k of kids.slice(0, 2000)) {
        const it = (await t.prov.getTreeItem(k)) || {}; const id = "n" + t.n++; t.els.set(id, k);
        const label = typeof it.label === "string" ? it.label : (it.label && it.label.label) || (it.resourceUri ? path.basename(it.resourceUri.path) : "");
        out.push({ h: id, label, description: typeof it.description === "string" ? it.description : "", tooltip: it.tooltip ? mdText(it.tooltip) : "", collapsible: it.collapsibleState || 0,
          icon: it.iconPath instanceof ThemeIcon ? it.iconPath.id : it.resourceUri ? (it.collapsibleState ? "folder" : "file") : null, command: it.command ? { command: it.command.command, args: plain(it.command.arguments || []) } : null, ctx: it.contextValue });
      }
      return out;
    }
    case "webview.resolve": {
      const [viewId] = a; const p = webProviders.get(viewId); if (!p) throw new Error("No webview provider registered for " + viewId);
      const { wv, em } = mkWebview(viewId); webviews.set(viewId, { em });
      const view = { webview: wv, viewType: viewId, title: undefined, description: undefined, badge: undefined, visible: true, show() {}, onDidDispose: new EventEmitter().event, onDidChangeVisibility: new EventEmitter().event };
      await p.resolveWebviewView(view, { state: undefined }, new CancellationTokenSource().token); return true;
    }
    case "webview.msg": { const w = webviews.get(a[0]); if (w) w.em.fire(a[1]); return true; }
    case "webview.closed": { const w = webviews.get(a[0]); if (w) { webviews.delete(a[0]); w.disp && w.disp.fire(); } return true; }
    default: throw new Error("unknown host call " + method);
  }
}
self.addEventListener("error", (e) => log("error", e.message || e));
self.addEventListener("unhandledrejection", (e) => log("error", e.reason));
_post({ t: "ready" });
