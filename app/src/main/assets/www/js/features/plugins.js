// CodeForge plugins: JavaScript plugins that run in sandboxed iframes (opaque origin, no native bridge) and talk to the IDE through
// a permission-checked postMessage API.  Layout:  <data>/plugins/<id>/plugin.json + main file.
import { h, icon, P, uid, esc, parseJsonc } from "../core/util.js";
let A, root;
const plugins = new Map(); // id -> {id, dir, manifest, enabled, frame, caps:Set, disposers:[]}

const PERMS = { editor: "Read and edit the active editor", ui: "Show messages, prompts and status items", commands: "Add commands to the palette", "fs.read": "Read files in the open project", "fs.write": "Create and modify files in the open project", terminal: "Run commands in a terminal (asks every time)", net: "Make HTTP requests to the hosts listed (net:host)" };

export async function init(api) {
  A = api; root = P.join(A.settings.dataDir, "plugins"); await A.N.fs.mkdir(root);
  window.addEventListener("message", onMessage);
  A.cmd.register({ id: "plugins.new", title: "Plugins: Create New Plugin…", run: createTemplate });
  A.cmd.register({ id: "plugins.installZip", title: "Plugins: Install from ZIP…", run: installZip });
  A.cmd.register({ id: "plugins.reload", title: "Plugins: Reload All", run: loadAll });
  A.ed.editorEvents.on("saved", (d) => emitAll("save", { path: d.path }));
  A.bus.on("opened", (p) => emitAll("open", { path: p }));
  A.ed.editorEvents.on("active", (t) => emitAll("activeChanged", { path: t?.path || null }));
  await loadAll();
}
export const list = () => [...plugins.values()];

async function loadAll() {
  for (const p of [...plugins.values()]) unload(p);
  let items = []; try { items = await A.N.fs.list(root); } catch { /* none */ }
  for (const it of items) {
    if (it.t !== "d") continue; const dir = P.join(root, it.n); const mf = P.join(dir, "plugin.json");
    try {
      if (!(await A.N.fs.exists(mf))) continue; const manifest = JSON.parse((await A.N.fs.readText(mf)).text); if (!manifest.id) manifest.id = it.n;
      const disabled = A.settings.state.pluginsDisabled || [];
      const p = { id: manifest.id, dir, manifest, enabled: !disabled.includes(manifest.id), disposers: [], statusIds: new Set() }; plugins.set(p.id, p);
      if (p.enabled) await start(p);
    } catch (e) { console.warn("plugin", it.n, e); A.output.append("Plugins", `Failed to load ${it.n}: ${e.message}\n`); }
  }
  A.bus.emit("plugins:changed");
}

const perms = (p) => new Set((p.manifest.permissions || []).map(String));
const allowedHost = (p, url) => { try { const host = new URL(url).hostname; return [...perms(p)].filter((x) => x.startsWith("net:")).some((x) => { const pat = x.slice(4); return pat === "*" ? false : pat.startsWith("*.") ? host.endsWith(pat.slice(1)) : host === pat; }); } catch { return false; } };

async function start(p) {
  const main = P.join(p.dir, p.manifest.main || "index.js"); const code = (await A.N.fs.readText(main)).text || "";
  p.token = uid();
  const srcdoc = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; img-src data:; style-src 'unsafe-inline'"><body><script>${SHIM.replace("__ID__", () => JSON.stringify(p.id)).replace("__TOKEN__", () => JSON.stringify(p.token))}</script><script>try{\n${code.replace(/<\/script/gi, "<\\/script")}\n}catch(e){cf._fatal(e)}</script>`;
  p.frame = h("iframe", { sandbox: "allow-scripts", style: { display: "none" }, srcdoc }); document.body.append(p.frame);
  A.output.append("Plugins", `Started ${p.id}\n`);
}
function unload(p) {
  p.frame?.remove(); p.frame = null; for (const d of p.disposers) try { d(); } catch { /* ignore */ } p.disposers = []; for (const s of p.statusIds || []) A.status.remove(s); plugins.delete(p.id);
}
function emit(p, event, data) { try { p.frame?.contentWindow?.postMessage({ __cfe: event, data, token: p.token }, "*"); } catch { /* ignore */ } }
function emitAll(event, data) { for (const p of plugins.values()) if (p.enabled && p.frame) emit(p, event, data); }

async function onMessage(e) {
  const m = e.data; if (!m || !m.__cfp) return;
  const p = plugins.get(m.__cfp); if (!p || e.source !== p.frame?.contentWindow || m.token !== p.token) return;
  const reply = (ok, r) => e.source.postMessage({ __cfr: m.id, ok, r: ok ? r : String(r?.message || r), token: p.token }, "*");
  try { reply(true, await api(p, m.m, m.a || [])); } catch (err) { reply(false, err); }
}
function need(p, perm) { if (!perms(p).has(perm)) throw new Error(`Plugin “${p.id}” lacks permission “${perm}”`); }
function inRoot(path) { if (!A.ws.isOpen) throw new Error("No project open"); const full = path.startsWith("/") ? P.norm(path) : P.join(A.ws.root, path); if (!P.inside(A.ws.root, full)) throw new Error("Path is outside the project"); return full; }

async function api(p, method, a) {
  switch (method) {
    case "ready": return { id: p.id, root: A.ws.root, version: A.info().version };
    case "log": A.output.append("Plugins", `[${p.id}] ${a.join(" ")}\n`); return true;
    case "ui.toast": need(p, "ui"); A.toast(`${p.manifest.name || p.id}: ${a[0]}`, { kind: a[1] || "info" }); return true;
    case "ui.prompt": need(p, "ui"); return (await A.prompt(`${p.manifest.name || p.id}: ${a[0]}`, a[1] || {})) ?? null;
    case "ui.pick": need(p, "ui"); { const r = await A.quickPick((a[0] || []).map((x, i) => ({ label: x.label ?? String(x), description: x.description, value: i })), a[1] || {}); return r === undefined ? null : r; }
    case "ui.status": { need(p, "ui"); const id = `plugin:${p.id}:${a[0]}`; p.statusIds.add(id); A.status.item(id, { side: "right", priority: 90, text: a[1]?.text || "", title: a[1]?.tooltip || "", onClick: a[1]?.command ? () => emit(p, "command", { id: a[1].command }) : null }); return true; }
    case "ui.panel": { need(p, "ui"); const [id, title, html] = a; A.ed.openCustom(`pluginpanel:${p.id}:${id}`, title, { iconName: "extensions", render(el) { el.classList.remove("scroll"); el.style.overflow = "hidden"; const fr = h("iframe", { sandbox: "allow-scripts allow-forms", style: { position: "absolute", inset: 0, width: "100%", height: "100%", border: 0, background: "#fff" }, srcdoc: html }); el.append(fr); } }); return true; }
    case "commands.register": { need(p, "commands"); const [id, title] = a; const cid = `plugin.${p.id}.${id}`; p.disposers.push(A.cmd.register({ id: cid, title, category: p.manifest.name || p.id, run: () => emit(p, "command", { id }) })); return true; }
    case "editor.getText": need(p, "editor"); return A.ed.activeDoc()?.model?.getValue() ?? null;
    case "editor.getSelection": need(p, "editor"); return A.ed.selectionText();
    case "editor.replaceSelection": need(p, "editor"); A.ed.replaceSelection(String(a[0])); return true;
    case "editor.insert": need(p, "editor"); A.ed.insertText(String(a[0])); return true;
    case "editor.setText": need(p, "editor"); { const d = A.ed.activeDoc(); if (!d?.model) throw new Error("No active text editor"); d.model.pushEditOperations([], [{ range: d.model.getFullModelRange(), text: String(a[0]) }], () => null); return true; }
    case "editor.path": need(p, "editor"); return A.ed.activeTab()?.path ?? null;
    case "editor.language": need(p, "editor"); return A.ed.activeDoc()?.model?.getLanguageId() ?? null;
    case "editor.open": need(p, "editor"); await A.ed.openFile(inRoot(a[0]), { line: a[1] }); return true;
    case "fs.read": need(p, "fs.read"); return (await A.N.fs.readText(inRoot(a[0]))).text ?? null;
    case "fs.list": need(p, "fs.read"); return (await A.N.fs.list(inRoot(a[0] || "."))).map((x) => ({ name: x.n, dir: x.t === "d", size: x.s }));
    case "fs.exists": need(p, "fs.read"); return A.N.fs.exists(inRoot(a[0]));
    case "fs.write": need(p, "fs.write"); await A.N.fs.writeText(inRoot(a[0]), String(a[1])); A.ws.emit("changed", new Set([P.dir(inRoot(a[0]))])); return true;
    case "terminal.run": need(p, "terminal"); if (!(await A.confirm(`Plugin “${p.manifest.name || p.id}” wants to run:\n\n${a[0]}`, { title: "Run command?", okLabel: "Run" }))) throw new Error("Cancelled by user"); await A.term.run(String(a[0]), { cwd: A.ws.root, title: p.id, reuse: false }); return true;
    case "net.fetch": { if (!allowedHost(p, a[0])) throw new Error(`Plugin “${p.id}” may not contact ${a[0]} (declare “net:<host>” in plugin.json)`); const o = a[1] || {}; const r = await A.N.net.request({ url: a[0], method: o.method || "GET", headers: o.headers || {}, body: o.body, timeoutMs: 30000 }); return { status: r.status, headers: r.headers, text: r.text }; }
    case "storage.get": { const s = (A.settings.state.pluginStorage ||= {}); return s[p.id]?.[a[0]] ?? null; }
    case "storage.set": { const s = (A.settings.state.pluginStorage ||= {}); (s[p.id] ||= {})[a[0]] = a[1]; A.settings.saveState(); return true; }
    default: throw new Error("Unknown API: " + method);
  }
}

const SHIM = `
(function(){
var ID=__ID__, TOKEN=__TOKEN__, n=0, pending={}, handlers={}, events={};
function call(m){var a=[].slice.call(arguments,1);return new Promise(function(res,rej){var id=++n;pending[id]={res:res,rej:rej};parent.postMessage({__cfp:ID,token:TOKEN,id:id,m:m,a:a},"*");});}
addEventListener("message",function(e){var d=e.data;if(!d||d.token!==TOKEN)return;
 if(d.__cfr){var p=pending[d.__cfr];if(p){delete pending[d.__cfr];d.ok?p.res(d.r):p.rej(new Error(d.r));}return;}
 if(d.__cfe==="command"){var h=handlers[d.data.id];if(h)Promise.resolve().then(function(){return h();}).catch(function(err){call("log","command error:",String(err&&err.stack||err));});return;}
 if(d.__cfe){(events[d.__cfe]||[]).forEach(function(f){try{f(d.data);}catch(err){call("log","event error:",String(err));}});}
});
window.cf={
 id:ID,
 log:function(){return call.apply(null,["log"].concat([].slice.call(arguments).map(String)));},
 ready:function(){return call("ready");},
 on:function(ev,f){(events[ev]=events[ev]||[]).push(f);},
 commands:{register:function(id,title,fn){handlers[id]=fn;return call("commands.register",id,title);}},
 ui:{toast:function(m,k){return call("ui.toast",String(m),k);},prompt:function(t,o){return call("ui.prompt",t,o);},pick:function(items,o){return call("ui.pick",items,o);},status:function(id,o){return call("ui.status",id,o);},panel:function(id,title,html){return call("ui.panel",id,title,html);}},
 editor:{getText:function(){return call("editor.getText");},getSelection:function(){return call("editor.getSelection");},replaceSelection:function(t){return call("editor.replaceSelection",t);},insert:function(t){return call("editor.insert",t);},setText:function(t){return call("editor.setText",t);},path:function(){return call("editor.path");},language:function(){return call("editor.language");},open:function(p,l){return call("editor.open",p,l);}},
 fs:{read:function(p){return call("fs.read",p);},write:function(p,t){return call("fs.write",p,t);},list:function(p){return call("fs.list",p);},exists:function(p){return call("fs.exists",p);}},
 terminal:{run:function(c){return call("terminal.run",c);}},
 net:{fetch:function(u,o){return call("net.fetch",u,o);}},
 storage:{get:function(k){return call("storage.get",k);},set:function(k,v){return call("storage.set",k,v);}},
 _fatal:function(e){call("log","fatal:",String(e&&e.stack||e));}
};
addEventListener("error",function(e){call("log","error:",e.message);});
addEventListener("unhandledrejection",function(e){call("log","unhandled rejection:",String(e.reason&&e.reason.message||e.reason));});
})();`;

// ---------------------------------------------------------------- install / create / UI
export async function installDir(srcDir) {
  const mf = P.join(srcDir, "plugin.json"); const m = JSON.parse((await A.N.fs.readText(mf)).text); if (!m.id || !/^[\w.-]+$/.test(m.id)) throw new Error("plugin.json needs a valid \"id\"");
  const perm = (m.permissions || []).map((x) => `• ${x}${PERMS[x.split(":")[0]] ? " , " + PERMS[x.split(":")[0]] : ""}`).join("\n") || "• none";
  if (!(await A.confirm(`Install plugin “${m.name || m.id}” ${m.version || ""}?\n\nIt will be able to:\n${perm}`, { title: "Install plugin", okLabel: "Install" }))) return false;
  const dest = P.join(root, m.id); if (await A.N.fs.exists(dest)) await A.N.fs.rm(dest);
  await A.N.fs.copy(srcDir, dest); await loadAll(); A.toast(`Installed plugin ${m.name || m.id}`, { kind: "success" }); return true;
}
export async function installZip(zipPath) {
  zipPath ||= await A.of.browse({ mode: "file", title: "Install plugin (.zip)", filter: (it) => /\.zip$/i.test(it.n) }); if (!zipPath) return;
  const tmp = P.join(root, ".tmp-" + Date.now()); await A.N.fs.mkdir(tmp);
  try { await A.N.archive.unzip({ src: zipPath, dest: tmp }); let dir = tmp; if (!(await A.N.fs.exists(P.join(dir, "plugin.json")))) { const sub = (await A.N.fs.list(tmp)).find((x) => x.t === "d"); if (sub) dir = P.join(tmp, sub.n); } await installDir(dir); } catch (e) { A.toastError(e); } finally { await A.N.fs.rm(tmp).catch(() => {}); }
}
export async function installFromRegistry(item) {
  const url = item.download; const dest = P.join(root, `.dl-${Date.now()}.zip`); const b = A.busy(`Downloading ${item.name}…`);
  try { await A.N.net.download({ url, dest }); b.close(); await installZip(dest); } catch (e) { A.toastError(e); } finally { b.close(); await A.N.fs.rm(dest).catch(() => {}); }
}
export async function createTemplate() {
  const id = await A.prompt("Plugin id (letters, digits, dashes)", { value: "my-plugin", okLabel: "Create", validate: (v) => (/^[\w.-]+$/.test(v) ? null : "Invalid id") }); if (!id) return;
  const dir = P.join(root, id); if (await A.N.fs.exists(dir)) return A.toast("A plugin with that id exists", { kind: "error" });
  await A.N.fs.mkdir(dir);
  await A.N.fs.writeText(P.join(dir, "plugin.json"), JSON.stringify({ id, name: id, version: "0.1.0", description: "My CodeForge plugin", main: "index.js", permissions: ["editor", "ui", "commands"] }, null, 2) + "\n");
  await A.N.fs.writeText(P.join(dir, "index.js"), `// CodeForge plugin: runs in a sandboxed iframe. API: cf.commands, cf.editor, cf.ui, cf.fs, cf.terminal, cf.net, cf.storage\ncf.commands.register("shout", "Make selection UPPERCASE", async () => {\n  const sel = await cf.editor.getSelection();\n  if (!sel) return cf.ui.toast("Select some text first", "warn");\n  await cf.editor.replaceSelection(sel.toUpperCase());\n});\n\ncf.ui.status("hello", { text: "${id}", tooltip: "Hello plugin loaded" });\ncf.log("ready");\n`);
  await loadAll(); A.ed.openFile(P.join(dir, "index.js")); A.toast("Plugin created , open the palette and run “Make selection UPPERCASE”", { timeout: 6000 });
}

export function renderInto(el) {
  const rows = list().map((p) => h("div.ext-row" + (p.enabled ? "" : ".off"), {},
    h("div.ext-icon.ph", icon("plug")), h("div.ext-info", h("div.ext-name", p.manifest.name || p.id, h("span.muted", { style: { fontWeight: 400, marginLeft: "6px", fontSize: "calc(11px * var(--fz))" } }, p.manifest.version || "")), h("div.ext-desc", p.manifest.description || ""), h("div.ext-pub", (p.manifest.permissions || []).join(", ") || "no permissions")),
    h("div.ext-actions", h("button.btn.small", { onclick: async () => { const d = new Set(A.settings.state.pluginsDisabled || []); p.enabled ? d.add(p.id) : d.delete(p.id); A.settings.state.pluginsDisabled = [...d]; A.settings.saveState(); await loadAll(); } }, p.enabled ? "Disable" : "Enable"),
      h("button.icon-btn", { title: "Edit", onclick: () => A.ed.openFile(P.join(p.dir, p.manifest.main || "index.js")) }, icon("edit")),
      h("button.icon-btn", { title: "Remove", onclick: async () => { if (await A.confirm(`Remove plugin “${p.id}”?`, { danger: true, okLabel: "Remove" })) { unload(p); await A.N.fs.rm(p.dir); await loadAll(); } } }, icon("trash")))));
  const reg = h("div", { style: { padding: "0 12px 10px", display: "flex", gap: "6px", flexWrap: "wrap" } },
    h("button.btn.small.primary", { onclick: createTemplate }, icon("add"), " New plugin"), h("button.btn.small", { onclick: () => installZip() }, icon("package"), " Install ZIP…"), h("button.btn.small", { onclick: () => browseRegistry(el) }, icon("cloud-download"), " Registry"));
  el.replaceChildren(reg, ...(rows.length ? rows : [h("div.empty-state", "No plugins installed.", h("div", { style: { fontSize: "calc(12px * var(--fz))" } }, "Plugins are small sandboxed JavaScript add-ons (commands, editor transforms, panels). Create one from a template to get started.")) ]));
}
async function browseRegistry(el) {
  const url = A.settings.get("plugins.registry"); if (!url) return A.toast("Set “Plugin registry URL” in Settings first (a JSON list of plugins)", { kind: "warn" });
  try { const r = await A.N.net.request({ url, timeoutMs: 20000 }); const items = JSON.parse(r.text); const pick = await A.quickPick(items.map((x) => ({ label: x.name || x.id, description: x.description, detail: `${x.version || ""} ${x.download || ""}`, value: x })), { placeholder: "Install plugin from registry" }); if (pick) installFromRegistry(pick); } catch (e) { A.toastError(e); }
}
