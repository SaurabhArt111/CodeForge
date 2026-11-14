// Extensions: Open VSX marketplace (search / install / update), local .vsix install, and contribution loading for the
// declarative parts of VS Code extensions: colour themes, file-icon themes, snippets, language configuration.
// Extension code (`browser`/`main`) runs in the sandboxed "lite" extension host (exthost.js) , a best-effort subset of the VS Code API;
// extensions that need Node.js, webviews, language servers or debuggers cannot run, and the UI says so.
import * as lazy from "../core/lazy.js";
import { h, icon, P, fmtBytes, parseJsonc, debounce, esc } from "../core/util.js";
import * as host from "./exthost.js";
import * as jobs from "../core/jobs.js";
let A, root, view, listEl, searchIn, filter = "installed", market = { q: "", items: [], total: 0, offset: 0, loading: false };
const installed = new Map(); // id -> ext

const SUPPORTED = ["themes", "iconThemes", "snippets", "languages", "commands", "configuration", "configurationDefaults", "jsonValidation", "viewsContainers", "views", "viewsWelcome"];
const SUPPORT_NOTES = { grammars: "TextMate grammars (syntax highlighting for new languages) are not supported; Monaco's built-in highlighting is used", debuggers: "debug adapters are not supported", languageServers: "language servers are not supported", views: "custom sidebar views are not supported", keybindings: "keybindings are not imported", productIconThemes: "product icon themes are not supported", taskDefinitions: "tasks are not supported", problemMatchers: "problem matchers are not supported", menus: "context/title menus are not shown (commands are available from the palette)", viewsContainers: "view containers are not supported", walkthroughs: "walkthroughs are not shown", colors: "custom theme colour ids are not registered", customEditors: "custom editors are not supported", notebooks: "notebooks are not supported", semanticTokenScopes: "semantic token scopes are not applied", typescriptServerPlugins: "TypeScript server plugins are not supported", submenus: "submenus are not supported", authentication: "authentication providers are not supported" };

export async function init(api) {
  A = api; root = P.join(A.settings.dataDir, "extensions");
  await A.N.fs.mkdir(root);
  A.registerView("extensions", build);
  A.cmd.register({ id: "ext.install", title: "Extensions: Install from VSIX…", run: installFromFile }); A.cmd.register({ id: "ext.search", title: "Extensions: Browse Marketplace", run: () => { A.showView("extensions"); setFilter("market"); } });
  A.cmd.register({ id: "ext.updates", title: "Extensions: Check for Updates", run: checkUpdates });
  host.init(A, list);
  await scan();
}
export const list = () => [...installed.values()];
const registry = () => (A.settings.get("extensions.registry") || "https://open-vsx.org").replace(/\/$/, "");

// ---------------------------------------------------------------- install / scan / activation
async function readManifest(dir) {
  for (const p of [P.join(dir, "extension/package.json"), P.join(dir, "package.json")]) if (await A.N.fs.exists(p)) {
    const r = await A.N.fs.readText(p); const base = P.dir(p); let manifest = JSON.parse(r.text);
    const nls = P.join(base, "package.nls.json");   // resolve "%key%" placeholders (display name, descriptions, command titles …)
    if (await A.N.fs.exists(nls)) { try { manifest = resolveNls(manifest, parseJsonc((await A.N.fs.readText(nls)).text || "{}")); } catch { /* keep raw */ } }
    return { manifest, base };
  }
  return null;
}
function resolveNls(v, nls) {
  if (typeof v === "string") { const m = /^%(.+)%$/.exec(v); if (!m) return v; const x = nls[m[1]]; return x == null ? v : typeof x === "object" ? x.message ?? v : x; }
  if (Array.isArray(v)) return v.map((x) => resolveNls(x, nls));
  if (v && typeof v === "object") { const o = {}; for (const k of Object.keys(v)) o[k] = resolveNls(v[k], nls); return o; }
  return v;
}
async function scan() {
  installed.clear();
  let items = []; try { items = await A.N.fs.list(root); } catch { /* empty */ }
  for (const it of items) {
    if (it.t !== "d" || it.n.startsWith(".")) continue;
    try { const m = await readManifest(P.join(root, it.n)); if (!m) continue; const ext = mk(P.join(root, it.n), m); installed.set(ext.id, ext); if (ext.enabled) await activate(ext); } catch (e) { console.warn("extension", it.n, e); }
  }
  A.bus.emit("extensions:changed");
}
function mk(dir, { manifest, base }) {
  const id = `${manifest.publisher || "local"}.${manifest.name}`.toLowerCase(); const c = manifest.contributes || {};
  const disabled = A.settings.state.extDisabled || [];
  return { id, dir, base, manifest, name: manifest.displayName && !/^%/.test(manifest.displayName) ? manifest.displayName : manifest.name, version: manifest.version, publisher: manifest.publisher || "local", description: /^%/.test(manifest.description || "") ? "" : manifest.description || "", enabled: !disabled.includes(id),
    contributes: Object.keys(c).filter((k) => !(Array.isArray(c[k]) && !c[k].length)), main: !!(manifest.main || manifest.browser) };
}
async function readJsonFile(p) { return parseJsonc((await A.N.fs.readText(p)).text || "{}"); }

async function activate(ext) {
  const c = ext.manifest.contributes || {}; const T = A.themes, I = A.icons; const rel = (p) => P.join(ext.base, p);
  for (const t of c.themes || []) {
    const label = t.label || t.id; if (!t.path) continue; const id = T.list().some((x) => x.id === label && x.source !== ext.id) ? `${label} (${ext.name})` : label;
    T.register({ id, label: id, uiTheme: t.uiTheme || "vs-dark", source: ext.id, load: async () => { const f = rel(t.path); return T.resolveInclude((await A.N.fs.readText(f)).text, async (r) => (await A.N.fs.readText(P.join(P.dir(f), r))).text); } });
  }
  for (const t of c.iconThemes || []) {
    try {
      const f = rel(t.path); const def = await readJsonFile(f); const base = P.dir(f); let font = null;
      if (def.fonts?.length) { const fd = def.fonts[0]; try { const url = await A.N.fs.url(P.join(base, fd.src[0].path)); const face = new FontFace(`ext-${ext.id}-${fd.id}`, `url(${url})`); await face.load(); document.fonts.add(face); font = face.family; } catch { /* ignore */ } }
      I.register({ id: `${ext.id}:${t.id}`, label: t.label || t.id, def, baseDir: base, font, source: ext.id });
    } catch (e) { console.warn("icon theme", t, e); }
  }
  const sn = await A.feat("snippets").catch(() => null);
  for (const s of c.snippets || []) { try { if (s.language && sn) sn.addSnippets(s.language, ext.id, (await A.N.fs.readText(rel(s.path))).text); } catch { /* ignore */ } }
  const mon = A.ed.monaco;
  for (const l of c.languages || []) {
    if (!mon || !l.id) continue;
    if (!mon.languages.getLanguages().some((x) => x.id === l.id)) mon.languages.register({ id: l.id, extensions: l.extensions, filenames: l.filenames, aliases: l.aliases });
    if (l.configuration && sn) { try { sn.applyLanguageConfig(l.id, await readJsonFile(rel(l.configuration))); } catch { /* ignore */ } }
  }
  host.register(ext).catch((e) => console.warn("extension host", ext.id, e));   // commands, configuration, jsonValidation, extension code
}
function deactivate(ext) {
  host.unregister(ext);
  A.themes.unregisterSource(ext.id); A.icons.unregisterSource(ext.id);
  A.feat("snippets").then((s) => s.removeSnippets(ext.id)).catch(() => {});
  if (A.settings.get("ui.iconTheme").startsWith(ext.id + ":")) A.settings.set("ui.iconTheme", "seti");
  if (![...A.themes.list()].some((t) => t.id === A.settings.get("ui.theme"))) A.settings.set("ui.theme", "Dark Modern");
}

export async function installVsix(vsixPath, { silent = false } = {}) {
  const tmp = P.join(root, ".tmp-" + Date.now()); await A.N.fs.mkdir(tmp);
  try {
    await A.N.archive.unzip({ src: vsixPath, dest: tmp });
    const m = await readManifest(tmp); if (!m) throw new Error("Not a valid extension (no package.json)");
    const ext0 = mk(tmp, m); const final = P.join(root, `${ext0.id}-${ext0.version}`);
    for (const e of [...installed.values()]) if (e.id === ext0.id) { deactivate(e); await A.N.fs.rm(e.dir); installed.delete(e.id); }
    if (await A.N.fs.exists(final)) await A.N.fs.rm(final);
    await A.N.fs.rename(tmp, final);
    const mm = await readManifest(final); const ext = mk(final, mm); installed.set(ext.id, ext);
    // re-enable on update
    A.settings.state.extDisabled = (A.settings.state.extDisabled || []).filter((x) => x !== ext.id); ext.enabled = true;
    await activate(ext); A.bus.emit("extensions:changed");
    const contributed = ext.contributes.filter((k) => SUPPORTED.includes(k)); const unsupported = ext.contributes.filter((k) => !SUPPORTED.includes(k));
    if (!silent) A.toast(`Installed ${ext.name} ${ext.version}` + (contributed.length ? ` (${contributed.join(", ")})` : unsupported.length || ext.main ? " , no supported contributions" : ""), { kind: contributed.length ? "success" : "warn", timeout: 6000 });
    render(); return ext;
  } catch (e) { await A.N.fs.rm(tmp).catch(() => {}); throw e; }
}
export async function installFromFile() {
  const p = await A.of.browse({ mode: "file", title: "Install extension (.vsix)", filter: (it) => /\.vsix$/i.test(it.n), okLabel: "Install" }); if (!p) return;
  await jobs.run({ title: `Installing ${P.base(p)}`, kind: "extension", icon: "extensions", cancellable: false, silent: true }, async (job) => { job.update("Unpacking…", -1); return installVsix(p); });
}
/** Downloads and installs from the marketplace as a background task: keep working, you get a notification when it is done. */
export async function installRemote(item) {
  const url = item.files?.download; if (!url) return A.toast("No download available", { kind: "error" });
  const label = item.displayName || item.name;
  const dest = P.join(root, `.dl-${Date.now()}.vsix`);
  const r = await jobs.run({ title: `Installing ${label}`, kind: "extension", icon: "extensions", doneText: `${label} installed`, silent: true }, async (job) => {
    job.watchBytes("Downloading");
    job.update("Downloading…", -1);
    try { await A.N.net.download({ url, dest, job: job.id }); if (job.cancelRequested) throw new Error("Cancelled"); job.update("Installing…", -1); return await installVsix(dest, { silent: true }); }
    finally { await A.N.fs.rm(dest).catch(() => {}); }   // a cancelled or failed download never stays on disk
  });
  if (r.ok && r.result) { const ext = r.result; const c = ext.contributes?.filter((k) => SUPPORTED.includes(k)) || []; A.toast(`Installed ${ext.name} ${ext.version}` + (c.length ? ` (${c.join(", ")})` : " , no supported contributions"), { kind: c.length ? "success" : "warn", timeout: 6000 }); }
  return r.ok;
}
export async function uninstall(ext) {
  if (!(await A.confirm(`Uninstall “${ext.name}”?`, { okLabel: "Uninstall", danger: true }))) return;
  deactivate(ext); await A.N.fs.rm(ext.dir); installed.delete(ext.id); A.bus.emit("extensions:changed"); render();
}
export function setEnabled(ext, on) {
  ext.enabled = on; const d = new Set(A.settings.state.extDisabled || []); on ? d.delete(ext.id) : d.add(ext.id); A.settings.state.extDisabled = [...d]; A.settings.saveState();
  if (on) activate(ext); else deactivate(ext); render();
}

// ---------------------------------------------------------------- marketplace
async function api(path) {
  const r = await A.N.net.request({ url: registry() + path, headers: { Accept: "application/json" }, timeoutMs: 30000 });
  if (r.status >= 400) throw new Error(`Registry returned HTTP ${r.status}`);
  return JSON.parse(r.text);
}
async function searchMarket(reset = true) {
  if (market.loading) return; market.loading = true; if (reset) { market.offset = 0; market.items = []; }
  render();
  try {
    const cat = { themes: "Themes", languages: "Programming Languages", snippets: "Snippets", icons: "Themes" }[filter] || "";
    const qs = new URLSearchParams({ size: "30", offset: String(market.offset), sortBy: market.q ? "relevance" : "downloadCount", sortOrder: "desc" }); if (market.q) qs.set("query", market.q); if (cat) qs.set("category", cat);
    const r = await api("/api/-/search?" + qs); market.total = r.totalSize || 0; market.items.push(...(r.extensions || [])); market.offset += (r.extensions || []).length; market.error = null;
  } catch (e) { market.error = e.message; } finally { market.loading = false; render(); }
}
async function checkUpdates() {
  const r = await jobs.run({ title: "Checking extension updates", kind: "extension", icon: "sync", cancellable: false, silent: true }, async (job) => {
    const found = []; let i = 0; const all = [...installed.values()];
    for (const ext of all) {
      job.update(`${ext.name}…`, i++ / Math.max(1, all.length));
      try { const d = await api(`/api/${ext.publisher}/${ext.manifest.name}`); if (d.version && d.version !== ext.version && d.files?.download) found.push({ ext, d }); } catch { /* skip */ }
    }
    return found;
  });
  const found = r.result || [];
  if (!found.length) { if (r.ok) A.toast("All extensions are up to date"); return; }
  for (const { ext, d } of found) if (await A.confirm(`Update ${ext.name} ${ext.version} → ${d.version}?`, { okLabel: "Update" })) await installRemote(d);
}

// ---------------------------------------------------------------- UI
function build(el) {
  view = el;
  searchIn = h("input.input", { placeholder: "Search Extensions in Marketplace", spellcheck: false, autocapitalize: "off", onkeydown: (e) => { if (e.key === "Enter") { market.q = searchIn.value.trim(); if (filter === "installed") filter = "market"; searchMarket(true); renderChips(); } } });
  chipsEl = h("div.ext-chips"); listEl = h("div.view-body");
  el.append(h("div.view-head", h("span.title", "Extensions"), h("button.icon-btn", { title: "Install from VSIX…", onclick: installFromFile }, icon("package")), h("button.icon-btn", { title: "Check for updates", onclick: checkUpdates }, icon("sync")), h("button.icon-btn", { title: "Refresh", onclick: () => { scan().then(render); } }, icon("refresh"))),
    h("div", { style: { padding: "0 10px 6px" } }, searchIn), chipsEl, listEl);
  renderChips(); render();
  A.bus.on("extensions:changed", () => render()); A.bus.on("plugins:changed", () => { if (filter === "plugins") render(); });
}
let chipsEl;
function setFilter(f) { filter = f; renderChips(); if (f !== "installed" && f !== "plugins") searchMarket(true); render(); }
function renderChips() {
  chipsEl.replaceChildren(...[["installed", "Installed"], ["plugins", "Plugins"], ["market", "Popular"], ["themes", "Themes"], ["icons", "Icon themes"], ["languages", "Languages"], ["snippets", "Snippets"]].map(([id, l]) => h("button.chip.ext-chip" + (filter === id ? ".on" : ""), { onclick: () => setFilter(id) }, l)));
}
function render() {
  if (!listEl) return;
  if (filter === "plugins") { A.feat("plugins").then((pl) => pl.renderInto(listEl)); return; }
  if (filter === "installed") {
    const q = searchIn?.value.toLowerCase(); const items = list().filter((e) => !q || (e.name + e.id).toLowerCase().includes(q));
    listEl.replaceChildren(...(items.length ? items.map(installedRow) : [h("div.empty-state", "No extensions installed.", h("div", { style: { fontSize: "calc(12px * var(--fz))" } }, "Themes, icon themes, snippets and language configurations from Open VSX are supported."), h("button.btn.primary", { onclick: () => setFilter("market") }, "Browse marketplace"), h("button.btn", { onclick: installFromFile }, "Install from VSIX…"))]));
    return;
  }
  const kids = market.items.filter(matchesFilter).map(marketRow);
  if (market.error) kids.unshift(h("div.empty-state", icon("warning"), market.error, h("div", { style: { fontSize: "calc(12px * var(--fz))" } }, `Registry: ${registry()}`), h("button.btn", { onclick: () => searchMarket(true) }, "Retry")));
  if (market.loading) kids.push(h("div.empty-state", h("div.spinner")));
  else if (market.items.length < market.total) kids.push(h("div.empty-state", h("button.btn", { onclick: () => searchMarket(false) }, "Load more")));
  listEl.replaceChildren(...kids);
}
const matchesFilter = (x) => filter !== "icons" || /icon/i.test(x.displayName + x.name + x.description);

function extIcon(src) { return h("img.ext-icon", { src: src || "", alt: "", onerror: (e) => { e.target.replaceWith(h("div.ext-icon.ph", icon("extensions"))); } }); }
function installedRow(e) {
  let iconEl = h("div.ext-icon.ph", icon("extensions")); if (e.manifest.icon) { iconEl = extIcon(""); A.N.fs.url(P.join(e.base, e.manifest.icon)).then((u) => (iconEl.src = u)); }
  const st = host.status(e.id); const warn = st === "error" || st === "denied" || e.contributes.some((k) => !SUPPORTED.includes(k)); const good = e.contributes.filter((k) => SUPPORTED.includes(k));
  return h("div.ext-row" + (e.enabled ? "" : ".off"), { onclick: () => details(e) }, iconEl,
    h("div.ext-info", h("div.ext-name", e.name, h("span.muted", { style: { fontWeight: 400, marginLeft: "6px", fontSize: "calc(11px * var(--fz))" } }, e.version)), h("div.ext-desc", e.description), h("div.ext-pub", e.publisher, " · ", good.length ? good.join(", ") : "no supported contributions", warn ? h("span", { title: st === "error" ? "Extension code failed to start" : st === "denied" ? "Extension code is not allowed to run" : "Parts of this extension can't run here" }, " ⚠") : null, e.main && st === "running" ? h("span", { title: "Extension code is running" }, " ●") : null)),
    h("div.ext-actions", h("button.btn.small", { onclick: (ev) => { ev.stopPropagation(); setEnabled(e, !e.enabled); } }, e.enabled ? "Disable" : "Enable"), h("button.icon-btn", { title: "Uninstall", onclick: (ev) => { ev.stopPropagation(); uninstall(e); } }, icon("trash"))));
}
function marketRow(x) {
  const id = `${x.namespace}.${x.name}`.toLowerCase(); const have = installed.get(id);
  return h("div.ext-row", { onclick: () => marketDetails(x) }, extIcon(x.files?.icon),
    h("div.ext-info", h("div.ext-name", x.displayName || x.name, h("span.muted", { style: { fontWeight: 400, marginLeft: "6px", fontSize: "calc(11px * var(--fz))" } }, x.version)), h("div.ext-desc", x.description || ""), h("div.ext-pub", x.namespace, x.downloadCount != null ? ` · ↓${fmtK(x.downloadCount)}` : "", x.averageRating ? ` · ★${x.averageRating.toFixed(1)}` : "")),
    h("div.ext-actions", have ? h("span.chip", "Installed") : h("button.btn.small.primary", { onclick: (ev) => { ev.stopPropagation(); installRemote(x); } }, "Install")));
}
const fmtK = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "k" : String(n));

// ---------------------------------------------------------------- README rendering (themed, sandboxed)
function themedDoc(body) {
  const cs = getComputedStyle(document.documentElement); const v = (n, d) => cs.getPropertyValue(n).trim() || d;
  const bg = v("--bg", "#1f1f1f"), fg = v("--fg", "#ccc"), link = v("--link", "#3794ff"), bd = v("--widget-border", "#454545"), wb = v("--widget-bg", "#202020");
  return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src * data: blob:; style-src 'unsafe-inline'; font-src data:"><meta name="color-scheme" content="${document.documentElement.dataset.theme === "light" ? "light" : "dark"}">
<style>html{background:${bg}}body{font:14px/1.65 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:4px 14px 24px;margin:0;color:${fg};background:${bg};word-wrap:break-word;overflow-wrap:anywhere}
a{color:${link}}img{max-width:100%;height:auto}h1,h2,h3{border-bottom:1px solid ${bd};padding-bottom:.25em;line-height:1.25}h4,h5,h6{line-height:1.3}
code{background:${wb};padding:.1em .35em;border-radius:4px;font:12.5px ui-monospace,Menlo,Consolas,monospace}pre{background:${wb};padding:10px 12px;border-radius:6px;overflow:auto}pre code{background:none;padding:0}
table{border-collapse:collapse;display:block;overflow:auto}td,th{border:1px solid ${bd};padding:4px 10px}blockquote{margin:8px 0;padding:2px 12px;border-left:3px solid ${bd};opacity:.9}hr{border:0;border-top:1px solid ${bd}}.muted{opacity:.65}</style><body>${body}</body>`;
}
async function resolveImages(html, resolve) {
  const srcs = [...new Set([...html.matchAll(/<img\b[^>]*?\ssrc=["']([^"']+)["']/gi)].map((m) => m[1]))].filter((u) => !/^(https?:|data:|blob:)/i.test(u));
  const map = new Map();
  await Promise.all(srcs.map(async (u) => { try { const r = await resolve(u); if (r) map.set(u, r); } catch { /* leave as is */ } }));
  return html.replace(/(<img\b[^>]*?\ssrc=)(["'])([^"']+)\2/gi, (m, a, q, u) => (map.has(u) ? `${a}${q}${map.get(u)}${q}` : m));
}
function frame(html, tall = "52vh") {
  const fr = h("iframe.ext-readme", { sandbox: "", style: { width: "100%", height: tall, border: "1px solid var(--border)", borderRadius: "6px", background: "var(--bg)" } });
  fr.srcdoc = themedDoc(html); return fr;
}
async function renderMd(text, resolve) {
  await lazy.marked();
  let html = window.marked ? window.marked.parse(text) : `<pre>${esc(text)}</pre>`;
  html = html.replace(/<script[\s\S]*?<\/script>/gi, ""); // iframe is sandboxed + CSP'd anyway; belt and braces
  return resolve ? resolveImages(html, resolve) : html;
}
async function readmeFrame(url, md = true) {
  try {
    const r = await A.N.net.request({ url, timeoutMs: 20000 });
    const html = md ? await renderMd(r.text, async (u) => new URL(u, url).href) : `<pre>${esc(r.text)}</pre>`;
    return frame(html);
  } catch (e) { return frame(`<p class="muted">Could not load the README (${esc(e.message)}).</p>`); }
}
/** README lookup is case-insensitive and also checks the folder above `extension/` (VSIX layout). */
async function findLocalReadme(e) {
  for (const dir of [e.base, P.dir(e.base)]) {
    let items = []; try { items = await A.N.fs.list(dir); } catch { continue; }
    const f = items.find((it) => it.t === "f" && /^readme(\.(md|markdown|txt))?$/i.test(it.n)); if (f) return P.join(dir, f.n);
  }
  return null;
}

function compat(contributes, main, ext) {
  const sup = contributes.filter((k) => SUPPORTED.includes(k)), un = contributes.filter((k) => !SUPPORTED.includes(k));
  const st = ext ? host.status(ext.id) : "off";
  const stText = { running: "Extension code is running", idle: "Extension code starts when needed (command / language)", starting: "Starting…", denied: "Extension code was not allowed to run", error: "Extension code failed to start", off: "" }[st];
  return h("div.ext-compat", h("div", icon("pass"), " Supported here: ", sup.length ? sup.join(", ") : "—"),
    main ? h("div", icon(st === "error" ? "error" : "info"), " ", stText || "Has extension code: runs in CodeForge's lite extension host (a subset of the VS Code API; no Node.js)") : null,
    un.length ? h("div", icon("warning"), " Not supported: ", un.join(", "), h("div.muted", { style: { fontSize: "calc(11px * var(--fz))" } }, un.map((k) => SUPPORT_NOTES[k]).filter(Boolean).join(" · "))) : null);
}

// ---------------------------------------------------------------- extension settings (contributes.configuration)
function settingsEditor(e) {
  const props = host.configSchema(e); if (!props.length) return null;
  const rows = props.map((p) => {
    const cur = host.getCfg(p.key); const desc = p.markdownDescription || p.description || "";
    let ctl;
    if (p.type === "boolean") ctl = h("input", { type: "checkbox", checked: !!cur, onchange: (ev) => host.setCfg(p.key, ev.target.checked) });
    else if (Array.isArray(p.enum)) ctl = h("select", { onchange: (ev) => host.setCfg(p.key, p.enum[ev.target.selectedIndex]) }, ...p.enum.map((v, i) => h("option", { selected: v === cur, title: p.enumDescriptions?.[i] || "" }, String(v))));
    else if (p.type === "number" || p.type === "integer") ctl = h("input.input", { type: "number", value: cur ?? "", onchange: (ev) => host.setCfg(p.key, ev.target.value === "" ? p.default : Number(ev.target.value)) });
    else if (p.type === "string" || (p.type == null && typeof cur === "string")) ctl = h("input.input", { value: cur ?? "", spellcheck: false, autocapitalize: "off", onchange: (ev) => host.setCfg(p.key, ev.target.value) });
    else ctl = h("textarea.input", { rows: 3, spellcheck: false, value: JSON.stringify(cur ?? p.default ?? null, null, 2), onchange: (ev) => { try { host.setCfg(p.key, JSON.parse(ev.target.value)); ev.target.style.outline = ""; } catch { ev.target.style.outline = "1px solid var(--danger)"; } } });
    return h("div.ext-set", h("div.ext-set-key", p.key), desc ? h("div.muted.ext-set-desc", desc.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[`*_]/g, "")) : null, h("div.ext-set-ctl", ctl));
  });
  return h("details.ext-settings", h("summary", `Settings (${props.length})`), ...rows);
}

async function details(e) {
  const body = h("div", { style: { minHeight: "120px" } }, h("div.loader-block", h("div.spinner"), h("span", "Loading…")));
  const readmeHold = h("div"); const actions = h("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap", margin: "8px 0" } });
  const themeButtons = (e.manifest.contributes?.themes || []).map((t) => h("button.btn.small", { onclick: () => { A.settings.set("ui.theme", t.label || t.id); } }, `Use “${t.label || t.id}”`));
  const iconButtons = (e.manifest.contributes?.iconThemes || []).map((t) => h("button.btn.small", { onclick: () => A.settings.set("ui.iconTheme", `${e.id}:${t.id}`) }, `Use icons “${t.label || t.id}”`));
  const codeButtons = e.main ? [h("button.btn.small", { onclick: () => A.output.show(`Extension: ${e.name}`) }, "Show output"), h("button.btn.small", { onclick: async () => { await host.restart(e); A.toast(`${e.name} restarted`); } }, "Restart")] : [];
  actions.append(...themeButtons, ...iconButtons, ...codeButtons);
  body.replaceChildren(h("p.modal-detail", `${e.id} · ${e.publisher}`), h("p.modal-text", e.description), compat(e.contributes, e.main, e), actions, settingsEditor(e), readmeHold);
  A.modal({ title: `${e.name} ${e.version}`, width: 720, className: "wide", body, buttons: [{ label: "Close", primary: true }] });
  readmeHold.append(h("div.loader-block", h("div.spinner"), h("span", "Loading README…")));
  try {
    const rf = await findLocalReadme(e); let html;
    if (rf) { const dir = P.dir(rf); const t = (await A.N.fs.readText(rf)).text || ""; html = /\.txt$/i.test(rf) ? `<pre>${esc(t)}</pre>` : await renderMd(t, async (u) => (u.startsWith("#") || u.startsWith("//") ? null : A.N.fs.url(P.join(dir, decodeURIComponent(u.split(/[?#]/)[0]))))); }
    else html = `<h2>${esc(e.name)}</h2><p>${esc(e.description || "")}</p><p class="muted">This extension did not ship a README.</p>`;
    readmeHold.replaceChildren(frame(html, "46vh"));
  } catch (err) { readmeHold.replaceChildren(frame(`<p class="muted">Could not render README: ${esc(err.message)}</p>`, "20vh")); }
}
async function marketDetails(x) {
  const id = `${x.namespace}.${x.name}`.toLowerCase(); const have = installed.get(id);
  const hold = h("div", h("div.loader-block", h("div.spinner"), h("span", "Loading…")));
  const buttons = [{ label: "Close", value: undefined }, ...(have ? [] : [{ label: "Install", primary: true, value: "install" }])];
  let d = x; const p = A.modal({ title: `${x.displayName || x.name} ${x.version || ""}`, width: 720, className: "wide", body: hold, buttons });
  try { d = await api(`/api/${x.namespace}/${x.name}`); } catch { /* use list item */ }
  const cats = (d.categories || []).join(", ");
  const rd = d.files?.readme ? await readmeFrame(d.files.readme) : frame(`<h2>${esc(d.displayName || d.name)}</h2><p>${esc(d.description || "")}</p><p class="muted">No README published for this extension.</p>`, "30vh");
  hold.replaceChildren(h("p.modal-detail", `${d.namespace}.${d.name}${cats ? " · " + cats : ""}${d.license ? " · " + d.license : ""}`), h("p.modal-text", d.description || ""), (d.repository ? h("p", h("a.link", { onclick: () => A.N.sys.openUrl(d.repository) }, d.repository)) : null),
    h("div.ext-compat", h("div", icon("info"), " Themes, icon themes, snippets, language configuration, settings and commands are applied. Extension code runs in CodeForge's lite, sandboxed extension host (a subset of the VS Code API, no Node.js) , extensions that depend on Node, webviews or language servers won't work fully.")), rd);
  const r = await p;
  if (r === "install") installRemote(d);
}
