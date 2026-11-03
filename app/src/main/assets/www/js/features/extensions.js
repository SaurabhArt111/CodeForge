// Extensions: Open VSX marketplace (search / install / update), local .vsix install, and contribution loading for the
// declarative parts of VS Code extensions: colour themes, file-icon themes, snippets, language configuration.
// (Extensions that need the VS Code extension-host / Node APIs cannot run; that is shown clearly in the UI.)
import { h, icon, P, fmtBytes, parseJsonc, debounce, esc } from "../core/util.js";
let A, root, view, listEl, searchIn, filter = "installed", market = { q: "", items: [], total: 0, offset: 0, loading: false };
const installed = new Map(); // id -> ext

const SUPPORTED = ["themes", "iconThemes", "snippets", "languages"];
const SUPPORT_NOTES = { grammars: "TextMate grammars (syntax highlighting for new languages) are not supported; Monaco's built-in highlighting is used", commands: "commands need the VS Code extension host", debuggers: "debug adapters are not supported", languageServers: "language servers are not supported", views: "custom views are not supported", keybindings: "keybindings are not imported", configuration: "extension settings are not applied", productIconThemes: "product icon themes are not supported", taskDefinitions: "tasks are not supported", problemMatchers: "problem matchers are not supported", menus: "menus are not supported", viewsContainers: "view containers are not supported" };

export async function init(api) {
  A = api; root = P.join(A.settings.dataDir, "extensions");
  await A.N.fs.mkdir(root);
  A.registerView("extensions", build);
  A.cmd.register({ id: "ext.install", title: "Extensions: Install from VSIX…", run: installFromFile }); A.cmd.register({ id: "ext.search", title: "Extensions: Browse Marketplace", run: () => { A.showView("extensions"); setFilter("market"); } });
  A.cmd.register({ id: "ext.updates", title: "Extensions: Check for Updates", run: checkUpdates });
  await scan();
}
export const list = () => [...installed.values()];
const registry = () => (A.settings.get("extensions.registry") || "https://open-vsx.org").replace(/\/$/, "");

// ---------------------------------------------------------------- install / scan / activation
async function readManifest(dir) {
  for (const p of [P.join(dir, "extension/package.json"), P.join(dir, "package.json")]) if (await A.N.fs.exists(p)) { const r = await A.N.fs.readText(p); return { manifest: JSON.parse(r.text), base: P.dirname ? P.dirname(p) : p.slice(0, p.lastIndexOf("/")) }; }
  return null;
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
    contributes: Object.keys(c), main: !!(manifest.main || manifest.browser) };
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
}
function deactivate(ext) {
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
    if (!silent) A.toast(`Installed ${ext.name} ${ext.version}` + (contributed.length ? ` (${contributed.join(", ")})` : unsupported.length || ext.main ? " — no supported contributions" : ""), { kind: contributed.length ? "success" : "warn", timeout: 6000 });
    render(); return ext;
  } catch (e) { await A.N.fs.rm(tmp).catch(() => {}); throw e; }
}
export async function installFromFile() {
  const p = await A.of.browse({ mode: "file", title: "Install extension (.vsix)", filter: (it) => /\.vsix$/i.test(it.n), okLabel: "Install" }); if (!p) return;
  const b = A.busy("Installing…"); try { await installVsix(p); } catch (e) { A.toastError(e); } finally { b.close(); }
}
export async function installRemote(item) {
  const url = item.files?.download; if (!url) return A.toast("No download available", { kind: "error" });
  const dest = P.join(root, `.dl-${Date.now()}.vsix`); const b = A.busy(`Downloading ${item.displayName || item.name}…`); b.progress(-1);
  const off = A.N.on("net.progress", (d) => { if (d.total) b.progress(d.done / d.total); });
  try { await A.N.net.download({ url, dest }); b.update("Installing…"); await installVsix(dest); } catch (e) { A.toastError(e); } finally { off(); b.close(); await A.N.fs.rm(dest).catch(() => {}); }
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
  let n = 0; const b = A.busy("Checking for updates…");
  try { for (const ext of [...installed.values()]) { try { const d = await api(`/api/${ext.publisher}/${ext.manifest.name}`); if (d.version && d.version !== ext.version && d.files?.download) { n++; if (await A.confirm(`Update ${ext.name} ${ext.version} → ${d.version}?`, { okLabel: "Update" })) { b.close(); await installRemote(d); } } } catch { /* skip */ } } } finally { b.close(); }
  if (!n) A.toast("All extensions are up to date");
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
    listEl.replaceChildren(...(items.length ? items.map(installedRow) : [h("div.empty-state", "No extensions installed.", h("div", { style: { fontSize: "12px" } }, "Themes, icon themes, snippets and language configurations from Open VSX are supported."), h("button.btn.primary", { onclick: () => setFilter("market") }, "Browse marketplace"), h("button.btn", { onclick: installFromFile }, "Install from VSIX…"))]));
    return;
  }
  const kids = market.items.filter(matchesFilter).map(marketRow);
  if (market.error) kids.unshift(h("div.empty-state", icon("warning"), market.error, h("div", { style: { fontSize: "12px" } }, `Registry: ${registry()}`), h("button.btn", { onclick: () => searchMarket(true) }, "Retry")));
  if (market.loading) kids.push(h("div.empty-state", h("div.spinner")));
  else if (market.items.length < market.total) kids.push(h("div.empty-state", h("button.btn", { onclick: () => searchMarket(false) }, "Load more")));
  listEl.replaceChildren(...kids);
}
const matchesFilter = (x) => filter !== "icons" || /icon/i.test(x.displayName + x.name + x.description);

function extIcon(src) { return h("img.ext-icon", { src: src || "", alt: "", onerror: (e) => { e.target.replaceWith(h("div.ext-icon.ph", icon("extensions"))); } }); }
function installedRow(e) {
  let iconEl = h("div.ext-icon.ph", icon("extensions")); if (e.manifest.icon) { iconEl = extIcon(""); A.N.fs.url(P.join(e.base, e.manifest.icon)).then((u) => (iconEl.src = u)); }
  const warn = e.main || e.contributes.some((k) => !SUPPORTED.includes(k)); const good = e.contributes.filter((k) => SUPPORTED.includes(k));
  return h("div.ext-row" + (e.enabled ? "" : ".off"), { onclick: () => details(e) }, iconEl,
    h("div.ext-info", h("div.ext-name", e.name, h("span.muted", { style: { fontWeight: 400, marginLeft: "6px", fontSize: "11px" } }, e.version)), h("div.ext-desc", e.description), h("div.ext-pub", e.publisher, " · ", good.length ? good.join(", ") : "no supported contributions", warn ? h("span", { title: "Parts of this extension can't run here" }, " ⚠") : null)),
    h("div.ext-actions", h("button.btn.small", { onclick: (ev) => { ev.stopPropagation(); setEnabled(e, !e.enabled); } }, e.enabled ? "Disable" : "Enable"), h("button.icon-btn", { title: "Uninstall", onclick: (ev) => { ev.stopPropagation(); uninstall(e); } }, icon("trash"))));
}
function marketRow(x) {
  const id = `${x.namespace}.${x.name}`.toLowerCase(); const have = installed.get(id);
  return h("div.ext-row", { onclick: () => marketDetails(x) }, extIcon(x.files?.icon),
    h("div.ext-info", h("div.ext-name", x.displayName || x.name, h("span.muted", { style: { fontWeight: 400, marginLeft: "6px", fontSize: "11px" } }, x.version)), h("div.ext-desc", x.description || ""), h("div.ext-pub", x.namespace, x.downloadCount != null ? ` · ↓${fmtK(x.downloadCount)}` : "", x.averageRating ? ` · ★${x.averageRating.toFixed(1)}` : "")),
    h("div.ext-actions", have ? h("span.chip", "Installed") : h("button.btn.small.primary", { onclick: (ev) => { ev.stopPropagation(); installRemote(x); } }, "Install")));
}
const fmtK = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "k" : String(n));

async function readmeFrame(url, md = true) {
  const fr = h("iframe", { sandbox: "", style: { width: "100%", height: "52vh", border: "1px solid var(--border)", borderRadius: "6px", background: "#fff" } });
  try { const r = await A.N.net.request({ url, timeoutMs: 20000 }); const html = md && window.marked ? window.marked.parse(r.text) : `<pre>${esc(r.text)}</pre>`; fr.srcdoc = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src * data:; style-src 'unsafe-inline'"><body style="font:14px/1.6 system-ui;padding:0 12px;color:#222">${html}</body>`; } catch (e) { fr.srcdoc = `<body>${esc(e.message)}</body>`; }
  return fr;
}
function compat(contributes, main) {
  const sup = contributes.filter((k) => SUPPORTED.includes(k)), un = contributes.filter((k) => !SUPPORTED.includes(k));
  return h("div.ext-compat", h("div", icon("pass"), " Supported here: ", sup.length ? sup.join(", ") : "—"), un.length || main ? h("div", icon("warning"), " Not supported: ", [...un, ...(main ? ["extension code (main)"] : [])].join(", "), h("div.muted", { style: { fontSize: "11px" } }, un.map((k) => SUPPORT_NOTES[k]).filter(Boolean).join(" · "))) : null);
}
async function details(e) {
  const rd = P.join(e.base, "README.md"); const text = (await A.N.fs.exists(rd)) ? (await A.N.fs.readText(rd)).text : "";
  const fr = h("iframe", { sandbox: "", style: { width: "100%", height: "46vh", border: "1px solid var(--border)", borderRadius: "6px", background: "#fff" } });
  fr.srcdoc = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src * data:; style-src 'unsafe-inline'"><body style="font:14px/1.6 system-ui;padding:0 12px;color:#222">${window.marked ? window.marked.parse(text || "_No README_") : esc(text)}</body>`;
  const themeButtons = (e.manifest.contributes?.themes || []).map((t) => h("button.btn.small", { onclick: () => { A.settings.set("ui.theme", t.label || t.id); } }, `Use “${t.label || t.id}”`));
  const iconButtons = (e.manifest.contributes?.iconThemes || []).map((t) => h("button.btn.small", { onclick: () => A.settings.set("ui.iconTheme", `${e.id}:${t.id}`) }, `Use icons “${t.label || t.id}”`));
  A.modal({ title: `${e.name} ${e.version}`, width: 720, className: "wide", body: h("div", h("p.modal-detail", `${e.id} · ${e.publisher}`), h("p.modal-text", e.description), compat(e.contributes, e.main), h("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap", margin: "8px 0" } }, ...themeButtons, ...iconButtons), fr), buttons: [{ label: "Close", primary: true }] });
}
async function marketDetails(x) {
  let d = x; try { d = await api(`/api/${x.namespace}/${x.name}`); } catch { /* use list item */ }
  const id = `${x.namespace}.${x.name}`.toLowerCase(); const have = installed.get(id);
  const fr = d.files?.readme ? await readmeFrame(d.files.readme) : h("div.muted", "No README");
  const cats = (d.categories || []).join(", ");
  const r = await A.modal({ title: `${d.displayName || d.name} ${d.version || ""}`, width: 720, className: "wide", body: h("div", h("p.modal-detail", `${d.namespace}.${d.name}${cats ? " · " + cats : ""}${d.license ? " · " + d.license : ""}`), h("p.modal-text", d.description || ""), (d.repository ? h("p", h("a.link", { onclick: () => A.N.sys.openUrl(d.repository) }, d.repository)) : null), h("div.ext-compat", h("div", icon("info"), " Only themes, icon themes, snippets and language configuration are applied. Extensions that need VS Code's extension host won't run.")), fr),
    buttons: [{ label: "Close", value: undefined }, ...(have ? [] : [{ label: "Install", primary: true, value: "install" }])] });
  if (r === "install") installRemote(d);
}
