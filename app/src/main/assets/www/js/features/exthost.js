// "Lite" extension host (IDE side). Runs extension code (the `browser` or `main` entry of an installed VSIX) inside one
// sandboxed Worker per extension (exthost.worker.js) and bridges a subset of the VS Code API to CodeForge:
//   commands · messages / input / quick-pick · status bar · output channels · text edits · decorations · diagnostics
//   completion / hover / formatting / definition providers · workspace config + file access (scoped) · terminals
// It is best-effort: extensions that need Node.js (child_process, native modules), webviews, language servers or the
// debug API cannot run. The user is asked once per extension before any extension code is executed.
import { h, P } from "../core/util.js";

let A, workerSrc = null;
const hosts = new Map();               // extId -> Host
const decoStyles = new Map();          // key -> <style>
const diagStore = new Map();           // `${extId}|${coll}` -> Map(path -> markers[])
let allExts = () => [];
const TIMEOUT = { activate: 25000, provide: 5000, cmd: 120000 };
const KIND_NAMES = ["Text", "Method", "Function", "Constructor", "Field", "Variable", "Class", "Interface", "Module", "Property", "Unit", "Value", "Enum", "Keyword", "Snippet", "Color", "File", "Reference", "Folder", "EnumMember", "Constant", "Struct", "Event", "Operator", "TypeParameter"];
const SEV = [8, 4, 2, 1]; // vscode Error,Warning,Information,Hint -> monaco MarkerSeverity

export function init(api, listFn) { A = api; allExts = listFn; hookEvents(); registerCommands(); }
export const status = (id) => hosts.get(id)?.status || "off";
export const statusAll = () => [...hosts.values()].map((x) => ({ id: x.ext.id, name: x.ext.name, status: x.status, error: x.error }));
const trust = () => (A.settings.state.extTrust ||= {});
const outName = (ext) => `Extension: ${ext.name}`;
const logOut = (ext, text) => A.output.append(outName(ext), text.endsWith("\n") ? text : text + "\n");

// ------------------------------------------------------------------------------------------------ lifecycle
/** Called after (re)loading an extension. Decides whether to start now, lazily (activation events) or not at all. */
export async function register(ext) {
  unregister(ext);
  await applyStaticContributes(ext);
  const entry = entryOf(ext); if (!entry || !ext.enabled) return;
  const m = ext.manifest; const c = m.contributes || {};
  const ev = m.activationEvents || [];
  const langs = new Set([...ev.filter((e) => e.startsWith("onLanguage:")).map((e) => e.slice(11)), ...(c.languages || []).map((l) => l.id)].filter(Boolean));
  const eager = !ev.length ? !(c.commands?.length || c.languages?.length) : ev.some((e) => e === "*" || e === "onStartupFinished" || e.startsWith("workspaceContains:"));
  const lazy = { cmds: new Map(), langs, off: [] };
  const h0 = { ext, status: "idle", lazy, w: null, pending: new Map(), seq: 1, cmds: new Map(), providers: new Map(), statusItems: new Set(), decoKeys: new Set(), error: null, storage: P.join(A.settings.dataDir, "ext-data", ext.id) };
  hosts.set(ext.id, h0);
  // stub commands so contributed commands show up in the palette and wake the extension
  for (const cm of c.commands || []) {
    const run = async (...args) => { const hh = await ensureRunning(h0); if (hh && h0.cmds.has(cm.command)) return rpc(h0, "cmd.run", [cm.command, args], TIMEOUT.cmd); if (hh) A.toast(`Command “${cm.command}” was not registered by ${ext.name}`, { kind: "warn" }); };
    lazy.cmds.set(cm.command, A.cmd.register({ id: cm.command, title: cm.title, category: cm.category, run, source: "ext:" + ext.id }));
  }
  if (eager) ensureRunning(h0);
  else if (langs.size) { const check = () => { const d = A.ed.activeDoc?.(); if (d?.model && langs.has(d.model.getLanguageId())) ensureRunning(h0); }; lazy.off.push(A.ed.editorEvents.on("active", check)); check(); }
}
export function unregister(ext) {
  const hh = hosts.get(ext.id); if (!hh) { removeStaticContributes(ext); return; }
  stop(hh); hh.lazy.cmds.forEach((off) => off()); hh.lazy.off.forEach((off) => off()); hosts.delete(ext.id); removeStaticContributes(ext);
}
export async function restart(ext) { const hh = hosts.get(ext.id); if (hh) stop(hh); await register(ext); }
export async function restartAll() { for (const e of allExts()) if (e.enabled) await restart(e); }
export function stopAll() { for (const hh of hosts.values()) stop(hh); }

const entryOf = (ext) => { const m = ext.manifest; const f = m.browser || m.main; if (!f) return null; let p = P.join(ext.base, f); if (!/\.(c|m)?js$/.test(p)) p += ".js"; return p; };

async function ensureRunning(hh) {
  if (hh.status === "running") return hh;
  if (hh.status === "starting") return hh.starting;
  if (hh.status === "denied") return null;
  hh.status = "starting";
  hh.starting = (async () => {
    const ext = hh.ext; const t = trust();
    if (t[ext.id] === undefined) {
      const ok = await A.modal({ title: "Run extension code?", width: 460, body: h("div", h("p.modal-text", `“${ext.name}” (${ext.id}) wants to run its own code inside CodeForge.`), h("p.modal-detail", "It runs in a restricted sandbox without network access; it can read and edit files in the open project and use the editor, status bar and commands. Only allow extensions you trust.")), buttons: [{ label: "Don't run", value: false }, { label: "Allow", primary: true, value: true }] });
      t[ext.id] = ok === true; A.settings.saveState();
    }
    if (!t[ext.id]) { hh.status = "denied"; return null; }
    try {
      await startWorker(hh);
      return hh;
    } catch (e) { hh.status = "error"; hh.error = e.message || String(e); logOut(ext, "Activation failed: " + hh.error); A.toast(`${ext.name}: activation failed — see Output › ${outName(ext)}`, { kind: "error" }); stop(hh, "error"); return null; }
  })();
  return hh.starting;
}

async function loadWorkerSource() {
  if (workerSrc) return workerSrc;
  const r = await fetch(new URL("./exthost.worker.js", import.meta.url)); if (!r.ok) throw new Error("exthost.worker.js unavailable");
  workerSrc = await r.text(); return workerSrc;
}
async function readExtensionFiles(ext) {
  const files = {}; let total = 0;
  const tree = await A.N.fs.tree(ext.base, { ignore: [".git", ".github", "test", "tests", "__tests__", "docs", "images", "media", "l10n"], max: 8000 });
  const wanted = tree.files.filter((f) => /\.(c?js|json)$/.test(f) && !/\.d\.ts$|\.map$|(^|\/)(package-lock|tsconfig|\.eslintrc)[^/]*\.json$/.test(f));
  let i = 0;
  const worker = async () => {
    while (i < wanted.length) {
      const f = wanted[i++]; const full = P.join(ext.base, f);
      try { const r = await A.N.fs.readText(full); const t = r.text || ""; if (t.length > 8e6 || total + t.length > 40e6) continue; total += t.length; files[full] = t; } catch { /* skip */ }
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return files;
}
async function startWorker(hh) {
  const ext = hh.ext; const src = await loadWorkerSource();
  const entry = entryOf(ext); const files = await readExtensionFiles(ext);
  if (!(entry in files)) throw new Error("Entry file not found: " + P.rel(ext.base, entry));
  await A.N.fs.mkdir(hh.storage).catch(() => {});
  const blob = new Blob([src], { type: "text/javascript" }); const url = URL.createObjectURL(blob);
  const w = new Worker(url, { name: "ext:" + ext.id }); hh.w = w; hh.url = url;
  const ready = new Promise((res, rej) => { hh._ready = res; hh._fail = rej; setTimeout(() => rej(new Error("Extension worker failed to start")), 8000); });
  w.onmessage = (ev) => onMessage(hh, ev.data);
  w.onerror = (e) => { logOut(ext, "Worker error: " + (e.message || e)); if (hh.status === "starting") hh._fail?.(new Error(e.message || "worker error")); };
  await ready;
  const gs = ((A.settings.state.extState ||= {})[ext.id] ||= {});
  const init = { id: ext.id, manifest: ext.manifest, extPath: ext.base, storage: hh.storage, main: entry, files, root: A.ws.root, cfg: buildCfg(), themeKind: themeKind(), globalState: gs.global, workspaceState: gs[A.ws.root || ""] };
  await rpc(hh, "activate", [init], TIMEOUT.activate);
  hh.status = "running"; logOut(ext, "Activated."); A.bus.emit("extensions:changed");
  pushEditor(hh); // initial state
}
function stop(hh, to = "idle") {
  if (hh.w) {
    try { hh.w.postMessage({ t: "req", id: -1, m: "deactivate", a: [] }); } catch { /* ignore */ }
    const w = hh.w, url = hh.url; setTimeout(() => { try { w.terminate(); } catch { /* ignore */ } URL.revokeObjectURL(url); }, 400);
  }
  hh.w = null; hh.status = to === "error" ? "error" : "idle"; hh.starting = null;
  for (const [, p] of hh.pending) p.rej(new Error("Extension stopped")); hh.pending.clear();
  hh.cmds.forEach((off) => off()); hh.cmds.clear();
  hh.providers.forEach((d) => d.forEach((x) => x.dispose?.())); hh.providers.clear();
  hh.statusItems.forEach((id) => A.status.remove(id)); hh.statusItems.clear();
  hh.decoKeys.forEach((k) => disposeDeco(hh, k)); hh.decoKeys.clear();
  for (const k of [...diagStore.keys()]) if (k.startsWith(hh.ext.id + "|")) clearDiag(k);
  A.bus.emit("extensions:changed");
}

// ------------------------------------------------------------------------------------------------ rpc
function rpc(hh, m, a, timeout = 10000) {
  return new Promise((res, rej) => {
    if (!hh.w) return rej(new Error("Extension is not running"));
    const id = hh.seq++; const t = setTimeout(() => { hh.pending.delete(id); rej(new Error(`${m} timed out`)); }, timeout);
    hh.pending.set(id, { res: (v) => { clearTimeout(t); res(v); }, rej: (e) => { clearTimeout(t); rej(e); } });
    hh.w.postMessage({ t: "req", id, m, a });
  });
}
const send = (hh, name, d) => { try { hh.w?.postMessage({ t: "evt", name, d }); } catch { /* ignore */ } };
const running = () => [...hosts.values()].filter((x) => x.status === "running" && x.w);
async function onMessage(hh, m) {
  if (m.t === "ready") return hh._ready?.();
  if (m.t === "res") { const p = hh.pending.get(m.id); if (!p) return; hh.pending.delete(m.id); m.ok ? p.res(m.r) : p.rej(new Error(String(m.e).split("\n")[0])); return; }
  if (m.t === "log") return logOut(hh.ext, (m.level === "error" ? "[error] " : m.level === "warn" ? "[warn] " : "") + m.text);
  if (m.t === "out") { if (m.clear) return; return A.output.append(`${hh.ext.name}: ${m.name}`, m.text); }
  if (m.t === "req") {
    let out; try { out = { t: "res", id: m.id, ok: true, r: await handle(hh, m.m, m.a) }; } catch (e) { out = { t: "res", id: m.id, ok: false, e: e.message || String(e) }; }
    try { hh.w?.postMessage(out); } catch { /* ignore */ }
  }
}

// ------------------------------------------------------------------------------------------------ editor sync
const MAXTEXT = 1.5e6;
function docSnap(d, withText = true) {
  const m = d.model; const o = m.getOptions();
  return { path: d.path, text: withText && m.getValueLength() < MAXTEXT ? m.getValue() : "", languageId: m.getLanguageId(), version: m.getVersionId(), dirty: !!d.dirty, eol: m.getEOL(), tabSize: o.tabSize, insertSpaces: o.insertSpaces };
}
function editorSnap() {
  const d = A.ed.activeDoc?.(); const e = A.ed.activeEditor?.(); if (!d?.model || !e) return null;
  const sels = (e.getSelections?.() || []).map((s) => ({ anchor: { line: s.selectionStartLineNumber - 1, character: s.selectionStartColumn - 1 }, active: { line: s.positionLineNumber - 1, character: s.positionColumn - 1 } }));
  return { ...docSnap(d), selections: sels.length ? sels : undefined };
}
function pushEditor(hh) { send(hh, "editor", editorSnap()); }
const broadcast = (name, d) => running().forEach((hh) => send(hh, name, d));
function hookEvents() {
  const E = A.ed.editorEvents; let t1, t2;
  const push = () => { clearTimeout(t1); t1 = setTimeout(() => running().forEach(pushEditor), 220); };
  E.on("active", () => { running().forEach(pushEditor); const d = A.ed.activeDoc?.(); if (d?.model) { broadcast("open", docSnap(d)); applyDiagnostics(d.path); } });
  E.on("content", push); E.on("selection", () => { clearTimeout(t2); t2 = setTimeout(() => running().forEach(pushEditor), 120); });
  E.on("saved", (d) => { if (d?.model) broadcast("save", docSnap(d, false)); });
  A.bus.on("closed", (p) => broadcast("close", { path: p }));
  A.settings.on("change", () => { clearTimeout(hookEvents._c); hookEvents._c = setTimeout(() => broadcast("config", buildCfg()), 300); });
  A.settings.on("change:ui.theme", () => setTimeout(() => broadcast("theme", themeKind()), 200));
}
const themeKind = () => { const l = (document.documentElement.dataset.theme || ""); return l === "light" ? 1 : l === "hc" ? 3 : 2; };

// ------------------------------------------------------------------------------------------------ configuration
function schemaProps(ext) { const c = ext.manifest.contributes?.configuration; const arr = Array.isArray(c) ? c : c ? [c] : []; const out = {}; for (const sec of arr) Object.assign(out, sec.properties || {}); return out; }
/** Flat map: extension defaults < configurationDefaults < CodeForge settings < user overrides for extension keys */
export function buildCfg() {
  const v = {};
  for (const e of allExts()) {
    if (!e.enabled) continue;
    for (const [k, p] of Object.entries(schemaProps(e))) if (p && "default" in p) v[k] = p.default;
    const cd = e.manifest.contributes?.configurationDefaults; if (cd) for (const [k, val] of Object.entries(cd)) if (!k.startsWith("[")) v[k] = val;
  }
  Object.assign(v, A.settings.values, A.settings.state.extConfig || {});
  return v;
}
export function configSchema(ext) { return Object.entries(schemaProps(ext)).map(([key, p]) => ({ key, ...p })); }
export function getCfg(key) { const c = buildCfg(); return c[key]; }
export function setCfg(key, value) {
  if (key in A.settings.values && !(A.settings.state.extConfig && key in A.settings.state.extConfig) && /^(editor|files|terminal|ui)\./.test(key)) A.settings.set(key, value);
  else { (A.settings.state.extConfig ||= {})[key] = value; A.settings.saveState(); }
  broadcast("config", buildCfg());
}

// ------------------------------------------------------------------------------------------------ static contributions
const jsonSchemas = new Map();   // extId -> [{fileMatch, uri, schema}]
async function applyStaticContributes(ext) {
  const c = ext.manifest.contributes || {}; const mon = A.ed.monaco;
  const jv = c.jsonValidation || [];
  if (jv.length) {
    const list = [];
    for (const j of jv) {
      try {
        let schema; const matches = Array.isArray(j.fileMatch) ? j.fileMatch : [j.fileMatch];
        if (/^\./.test(j.url)) schema = JSON.parse((await A.N.fs.readText(P.join(ext.base, j.url))).text); else continue; // remote schemas are not fetched
        list.push({ fileMatch: matches.map((m) => (m.startsWith("/") || m.startsWith("*") || m.includes("/") ? m : "*/" + m)), uri: "ext://" + ext.id + "/" + j.url, schema });
      } catch { /* ignore broken schema */ }
    }
    jsonSchemas.set(ext.id, list); pushJsonSchemas();
  }
}
function removeStaticContributes(ext) { if (jsonSchemas.delete(ext.id)) pushJsonSchemas(); }
function pushJsonSchemas() {
  const mon = A.ed.monaco; if (!mon?.languages?.json) return;
  mon.languages.json.jsonDefaults.setDiagnosticsOptions({ allowComments: true, trailingCommas: "ignore", validate: true, schemas: [...jsonSchemas.values()].flat(), enableSchemaRequest: false });
}

// ------------------------------------------------------------------------------------------------ allowed file access
const within = (p, base) => base && (p === base || p.startsWith(base.replace(/\/$/, "") + "/"));
function guard(hh, p, write) {
  p = P.norm(String(p));   // collapses ".." segments, so the prefix checks below cannot be bypassed
  const root = A.ws.root;
  if (within(p, root) || within(p, hh.storage)) return p;
  if (!write && within(p, hh.ext.base)) return p;
  throw new Error(`Access denied: ${p} is outside the project folder`);
}
const globRe2 = (g) => new RegExp("^" + g.replace(/[.+^$()|\\]/g, "\\$&").replace(/\*\*\//g, "(?:.*/)?").replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*").replace(/\?/g, ".").replace(/\{([^}]+)\}/g, (_, a) => "(?:" + a.split(",").join("|") + ")") + "$");

// ------------------------------------------------------------------------------------------------ monaco helpers
const mr = (r) => new (A.ed.monaco.Range)(r.start.line + 1, r.start.character + 1, r.end.line + 1, r.end.character + 1);
const toSel = (s) => { const f = (x) => (typeof x === "string" ? x : x && typeof x === "object" ? { language: x.language, scheme: undefined, pattern: x.pattern?.pattern || x.pattern, exclusive: x.exclusive } : "*"); return Array.isArray(s) ? s.map(f) : f(s); };
async function modelFor(path) {
  let d = A.ed.getDoc(path); if (!d?.model) { await A.ed.openFile(path, { focus: false }); d = A.ed.getDoc(path); }
  if (!d?.model) throw new Error("Cannot open " + path); return d;
}
function applyEdits(model, edits) {
  const ops = edits.map((e) => ({ range: mr(e.range), text: e.newText, forceMoveMarkers: true }));
  model.pushStackElement(); model.pushEditOperations([], ops, () => null); model.pushStackElement();
}
function disposeDeco(hh, key) { const st = decoStyles.get(hh.ext.id + key); st?.remove(); decoStyles.delete(hh.ext.id + key); for (const [k, ids] of decoIds) if (k.startsWith(hh.ext.id + "|" + key + "|")) { const path = k.split("|")[2]; const m = A.ed.getDoc(path)?.model; m?.deltaDecorations(ids, []); decoIds.delete(k); } }
const decoIds = new Map(); const decoOpts = new Map();
const css = (o = {}) => Object.entries({ "background-color": o.backgroundColor, color: o.color, border: o.border, "border-radius": o.borderRadius, outline: o.outline, "font-style": o.fontStyle, "font-weight": o.fontWeight, "text-decoration": o.textDecoration, opacity: o.opacity, "letter-spacing": o.letterSpacing }).filter(([, v]) => v && typeof v === "string" || typeof v === "number").map(([k, v]) => `${k}:${String(v).replace(/[;{}]/g, "")}`).join(";");
function clearDiag(key) { const m = diagStore.get(key); if (!m) return; for (const p of m.keys()) { const model = A.ed.getDoc(p)?.model; if (model) A.ed.monaco.editor.setModelMarkers(model, key, []); } diagStore.delete(key); }
function applyDiagnostics(path) { for (const [key, map] of diagStore) { const arr = map.get(path); const model = A.ed.getDoc(path)?.model; if (arr && model) A.ed.monaco.editor.setModelMarkers(model, key, arr); } }

// ------------------------------------------------------------------------------------------------ worker → IDE calls
async function handle(hh, m, a) {
  const ext = hh.ext; const mon = A.ed.monaco;
  switch (m) {
    case "cmd.register": { const id = a[0]; hh.cmds.get(id)?.(); const decl = (ext.manifest.contributes?.commands || []).find((c) => c.command === id); hh.lazy.cmds.get(id)?.();
      hh.cmds.set(id, A.cmd.register({ id, title: decl?.title || id, category: decl?.category, run: (...args) => rpc(hh, "cmd.run", [id, args], TIMEOUT.cmd), source: "ext:" + ext.id })); return true; }
    case "cmd.unregister": hh.cmds.get(a[0])?.(); hh.cmds.delete(a[0]); return true;
    case "cmd.exec": { const r = await A.cmd.run(a[0], ...(a[1] || [])); return r === undefined ? null : JSON.parse(JSON.stringify(r ?? null)); }
    case "ui.message": { const [level, text, items, modal] = a;
      if (!items.length && !modal) { A.toast(`${ext.name}: ${text}`, { kind: level === "error" ? "error" : level === "warn" ? "warn" : "info", timeout: 6000 }); return null; }
      const v = await A.modal({ title: ext.name, body: h("p.modal-text", text), buttons: [...items.map((t, i) => ({ label: t, primary: i === 0, value: i })), { label: items.length ? "Dismiss" : "OK", value: null }] }); return v === undefined ? null : v; }
    case "ui.input": { const o = a[0] || {}; const v = await A.prompt(o.title || ext.name, { value: o.value || "", placeholder: o.placeHolder || "", message: o.prompt || "", password: !!o.password }); return v == null ? null : v; }
    case "ui.pick": { const [items, o] = a; const v = await A.quickPick(items.map((i) => ({ label: i.label, description: i.description, detail: i.detail, value: i.i })), { placeholder: o.placeHolder || "", title: o.title || "", multi: !!o.canPickMany }); return v === undefined ? null : v; }
    case "ui.statusMsg": { const [t, ms] = a; A.status.item(`ext:${ext.id}:msg`, { side: "left", priority: 50, text: t, title: ext.name }); if (!t) A.status.remove(`ext:${ext.id}:msg`); else if (ms) setTimeout(() => A.status.remove(`ext:${ext.id}:msg`), ms); return true; }
    case "ui.status": { const [id, o] = a; const key = `ext:${ext.id}:${id}`; const sp = /^\s*\$\(([\w-]+)(~spin)?\)\s*/.exec(o.text || ""); const text = (o.text || "").replace(/^\s*\$\([\w~-]+\)\s*/, "").replace(/\$\([\w~-]+\)/g, "").trim();
      A.status.item(key, { side: o.alignment === 1 ? "left" : "right", priority: 20 + (o.priority ? -o.priority / 100 : 0), ic: sp ? sp[1] + (sp[2] || "") : undefined, text, title: o.tooltip || ext.name, onClick: o.command ? () => A.cmd.run(o.command, ...(o.args || [])) : null }); hh.statusItems.add(key); return true; }
    case "ui.statusHide": { const key = `ext:${ext.id}:${a[0]}`; A.status.remove(key); hh.statusItems.delete(key); return true; }
    case "ui.busy": { A.bus.emit("busy", `ext:${ext.id}:${a[0]}`, a[1] ? `${ext.name}: ${a[0] || "working"}` : null); return true; }
    case "out.show": A.output.show(`${ext.name}: ${a[0]}`); return true;
    case "env.clipRead": return A.N.sys.clipboardGet();
    case "env.clipWrite": await A.N.sys.clipboardSet(a[0]); return true;
    case "env.open": { const u = String(a[0]); if (!/^https?:\/\//i.test(u)) throw new Error("Only http(s) URLs can be opened"); if (!(await A.confirm(`${ext.name} wants to open:\n${u}`, { okLabel: "Open" }))) return false; await A.N.sys.openUrl(u); return true; }
    case "term.send": { if (!(await A.confirm(`${ext.name} wants to run in the terminal:\n${a[1].trim().slice(0, 300)}`, { okLabel: "Run" }))) return false; await A.term.run(a[1].replace(/\n$/, ""), { title: a[0] }); return true; }
    case "term.show": A.panel.show?.("terminal"); return true;
    case "state.set": { const gs = ((A.settings.state.extState ||= {})[ext.id] ||= {}); if (a[0] === "global") gs.global = a[1]; else gs[A.ws.root || ""] = a[1]; A.settings.saveState(); return true; }
    case "cfg.update": setCfg(a[0], a[1]); return true;

    case "doc.open": { const p = guard(hh, a[0]); const d = A.ed.getDoc(p); if (d?.model) return docSnap(d); const r = await A.N.fs.readText(p); return { path: p, text: r.text || "", languageId: A.ed.languageForPath(p), version: 1, eol: "\n" }; }
    case "doc.save": { await A.ed.save(guard(hh, a[0], true)); return true; }
    case "doc.saveAll": await A.ed.saveAll(); return true;
    case "ed.open": { const p = guard(hh, a[0]); const r = a[1]; await A.ed.openFile(p, r ? { line: r.start.line + 1, col: r.start.character + 1 } : {}); return true; }
    case "ed.edit": { const p = guard(hh, a[0], true); const d = await modelFor(p); applyEdits(d.model, a[1]); return true; }
    case "ed.snippet": { const e = A.ed.activeEditor(); if (!e) return false; const ctrl = e.getContribution?.("snippetController2"); const r = a[2]; if (r) e.setSelection(mr(r)); ctrl?.insert(a[1]); return true; }
    case "ed.select": { const e = A.ed.activeEditor(); if (!e) return false; e.setSelections(a[1].map((s) => new mon.Selection(s.anchor.line + 1, s.anchor.character + 1, s.active.line + 1, s.active.character + 1))); return true; }
    case "ed.reveal": { const e = A.ed.activeEditor(); e?.revealRangeInCenterIfOutsideViewport(mr(a[1])); return true; }
    case "ws.find": { const [inc, exc, max] = a; const idx = await A.ws.fileIndex(); const re = globRe2(inc), ex = exc ? globRe2(exc) : null; const out = []; for (const f of idx) { if (re.test(f) && !(ex && ex.test(f))) { out.push(P.join(A.ws.root, f)); if (out.length >= max) break; } } return out; }
    case "fs.read": return (await A.N.fs.readText(guard(hh, a[0]))).text || "";
    case "fs.write": { await A.N.fs.writeText(guard(hh, a[0], true), a[1]); A.ws.invalidate?.(); return true; }
    case "fs.stat": { const s = await A.N.fs.stat(guard(hh, a[0])); if (!s) throw new Error("ENOENT: " + a[0]); return { t: s.t, s: s.s, m: s.m }; }
    case "fs.list": return (await A.N.fs.list(guard(hh, a[0]))).map((e) => ({ n: e.n, t: e.t }));
    case "fs.mkdir": await A.N.fs.mkdir(guard(hh, a[0], true)); return true;
    case "fs.rm": { const p = guard(hh, a[0], true); if (!(await A.confirm(`${ext.name} wants to delete:\n${p}`, { okLabel: "Delete", danger: true }))) throw new Error("Cancelled"); await A.N.fs.rm(p); A.ws.invalidate?.(); return true; }

    case "dec.create": { const [key, o] = a; hh.decoKeys.add(key); decoOpts.set(hh.ext.id + key, o);
      const st = document.createElement("style"); const cls = `.cfdeco-${hh.ext.id.replace(/[^\w]/g, "_")}-${key}`;
      st.textContent = `${cls}{${css(o)}}` + (o.after ? `${cls}-after::after{content:${JSON.stringify(String(o.after.contentText || ""))};${css(o.after)}}` : "") + (o.before ? `${cls}-before::before{content:${JSON.stringify(String(o.before.contentText || ""))};${css(o.before)}}` : "");
      document.head.append(st); decoStyles.set(hh.ext.id + key, st); return true; }
    case "dec.dispose": disposeDeco(hh, a[0]); hh.decoKeys.delete(a[0]); return true;
    case "dec.set": { const [key, path, items] = a; const model = A.ed.getDoc(path)?.model; if (!model) return false; const o = decoOpts.get(hh.ext.id + key) || {}; const base = `cfdeco-${hh.ext.id.replace(/[^\w]/g, "_")}-${key}`;
      const dk = `${hh.ext.id}|${key}|${path}`; const decos = items.map((it) => ({ range: mr(it.range), options: { className: base, isWholeLine: !!o.isWholeLine, hoverMessage: it.hover ? { value: it.hover } : undefined, afterContentClassName: o.after ? base + "-after" : undefined, beforeContentClassName: o.before ? base + "-before" : undefined } }));
      decoIds.set(dk, model.deltaDecorations(decoIds.get(dk) || [], decos)); return true; }

    case "diag.set": { const [coll, path, list] = a; const key = `${ext.id}|${coll}`; if (!diagStore.has(key)) diagStore.set(key, new Map());
      const markers = list.map((d) => ({ startLineNumber: d.range.start.line + 1, startColumn: d.range.start.character + 1, endLineNumber: d.range.end.line + 1, endColumn: d.range.end.character + 1, message: d.message, severity: SEV[d.severity ?? 0] || 8, source: d.source, code: d.code != null ? String(d.code) : undefined }));
      const map = diagStore.get(key); if (list.length) map.set(path, markers); else map.delete(path);
      const model = A.ed.getDoc(path)?.model; if (model) mon.editor.setModelMarkers(model, key, markers); return true; }

    case "lang.register": { const [id, kind, selector, triggers] = a; const sel = toSel(selector); const dis = []; hh.providers.set(id, dis);
      const ctx = (model, pos) => ({ doc: { path: model.uri.path, text: model.getValue(), languageId: model.getLanguageId(), version: model.getVersionId(), eol: model.getEOL() }, pos: { line: pos.lineNumber - 1, character: pos.column - 1 } });
      const ask = async (c, tab) => { if (hh.status !== "running") return null; try { return await rpc(hh, "provide", [id, { ...c, ...tab }], TIMEOUT.provide); } catch (e) { return null; } };
      if (kind === "completion") dis.push(mon.languages.registerCompletionItemProvider(sel, { triggerCharacters: (triggers || []).flat().filter((t) => typeof t === "string"),
        provideCompletionItems: async (model, pos, cctx) => { const r = await ask(ctx(model, pos), { trigger: cctx.triggerCharacter }); if (!r) return { suggestions: [] }; const w = model.getWordUntilPosition(pos); const dflt = new mon.Range(pos.lineNumber, w.startColumn, pos.lineNumber, w.endColumn);
          return { suggestions: r.map((c) => ({ label: c.labelDetail ? { label: c.label, detail: c.labelDetail } : c.label, kind: mon.languages.CompletionItemKind[KIND_NAMES[c.kind] ?? "Text"] ?? 18, detail: c.detail, documentation: c.doc ? { value: c.doc } : undefined, insertText: c.insert ?? c.label, insertTextRules: c.snippet ? 4 : undefined, filterText: c.filterText, sortText: c.sortText, range: c.range ? mr(c.range) : dflt, commitCharacters: c.commitChars, preselect: c.preselect })) }; } }));
      else if (kind === "hover") dis.push(mon.languages.registerHoverProvider(sel, { provideHover: async (model, pos) => { const r = await ask(ctx(model, pos)); if (!r) return null; return { range: r.range ? mr(r.range) : undefined, contents: r.contents.filter(Boolean).map((v) => ({ value: v })) }; } }));
      else if (kind === "format") dis.push(mon.languages.registerDocumentFormattingEditProvider(sel, { provideDocumentFormattingEdits: async (model, o) => { const r = await ask(ctx(model, new mon.Position(1, 1)), { tabSize: o.tabSize, insertSpaces: o.insertSpaces }); return (r || []).map((e) => ({ range: mr(e.range), text: e.newText })); } }));
      else if (kind === "formatRange") dis.push(mon.languages.registerDocumentRangeFormattingEditProvider(sel, { provideDocumentRangeFormattingEdits: async (model, range, o) => { const r = await ask(ctx(model, new mon.Position(1, 1)), { range: { start: { line: range.startLineNumber - 1, character: range.startColumn - 1 }, end: { line: range.endLineNumber - 1, character: range.endColumn - 1 } }, tabSize: o.tabSize, insertSpaces: o.insertSpaces }); return (r || []).map((e) => ({ range: mr(e.range), text: e.newText })); } }));
      else if (kind === "definition") dis.push(mon.languages.registerDefinitionProvider(sel, { provideDefinition: async (model, pos) => { const r = await ask(ctx(model, pos)); return (r || []).map((l) => ({ uri: mon.Uri.file(l.path), range: mr(l.range) })); } }));
      return true; }
    case "lang.unregister": hh.providers.get(a[0])?.forEach((d) => d.dispose?.()); hh.providers.delete(a[0]); return true;
    default: throw new Error("Unsupported host call: " + m);
  }
}

// ------------------------------------------------------------------------------------------------ commands
function registerCommands() {
  A.cmd.register({ id: "ext.host.running", title: "Extensions: Show Running Extensions", run: async () => {
    const rows = statusAll(); if (!rows.length) return A.toast("No extensions with code are loaded");
    const v = await A.quickPick(rows.map((r) => ({ label: r.name, description: r.status + (r.error ? " — " + r.error : ""), value: r.id })), { placeholder: "Select an extension to show its output" });
    if (v) A.output.show(outName(allExts().find((e) => e.id === v) || { name: v }));
  } });
  A.cmd.register({ id: "ext.host.restart", title: "Extensions: Restart Extension Host", run: async () => { await restartAll(); A.toast("Extension host restarted", { kind: "success" }); } });
  A.cmd.register({ id: "ext.host.forget", title: "Extensions: Reset Trust Decisions", run: () => { A.settings.state.extTrust = {}; A.settings.saveState(); A.toast("Extensions will ask again before running code"); } });
  A.ws.on("root", () => { running().forEach((hh) => hh.w && send(hh, "config", buildCfg())); });
}
