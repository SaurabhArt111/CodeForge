// Views contributed by extensions (package.json → contributes.viewsContainers / views / viewsWelcome), like "Thunder Client" or "Containers"
// in VS Code: every container gets an icon in the activity bar (and the phone drawer strip) and opens in the side bar.
// A view can be a tree (window.registerTreeDataProvider / createTreeView), a webview (window.registerWebviewViewProvider, sandboxed iframe)
// or just its "welcome" content. Extensions whose code cannot run here (they need desktop Node.js) still show up, with an honest note.
import { h, icon, P, esc } from "../core/util.js";

let A, H;                                   // IDE api, host hooks { ensureRunning, rpc, statusOf, errorOf }
const containers = new Map();               // viewName -> { ext, hh, id, title, views: [...], btns: [], el }
const viewIndex = new Map();                // `${extId}|${viewId}` -> { cont, def, kind, body, frame, queue }
const panels = new Map();                   // key -> { el, frame, hh }
const key = (extId, viewId) => extId + "|" + viewId;
const vname = (extId, cid) => "x-" + (extId + "-" + cid).replace(/[^a-z0-9]+/gi, "-").toLowerCase();

export function init(api, hooks) {
  A = api; H = hooks;
  window.addEventListener("message", (e) => {
    const d = e.data; if (!d || d.__cfwv !== 1) return;
    for (const [k, v] of viewIndex) if (v.frame?.contentWindow === e.source) return void H.rpc(v.cont.hh, "webview.msg", [k.split("|")[1], d.msg]).catch(() => {});
    for (const [k, p] of panels) if (p.frame?.contentWindow === e.source) return void H.rpc(p.hh, "webview.msg", [k, d.msg]).catch(() => {});
  });
}

// ---------------------------------------------------------------------------------- containers
export function add(ext, hh) {
  remove(ext);
  const c = ext.manifest.contributes || {}; const vc = c.viewsContainers || {}; const views = c.views || {};
  const all = [...(vc.activitybar || []).map((x) => ({ ...x, where: "activitybar" })), ...(vc.panel || []).map((x) => ({ ...x, where: "panel" })), ...(vc.secondarySidebar || []).map((x) => ({ ...x, where: "secondary" }))];
  // AI coding extensions (Claude Code, Codex, Gemini, Copilot) cannot run their desktop code here, but their CLI can:
  // installing one adds its tab to the AI side bar, where the real tool runs in a Linux terminal.
  const cli = aiCliOf(ext);
  if (cli) { aiTabs.set(ext.id, cli); A.feat("ai").then((m) => m.extTab(cli, true, ext.name)).catch(() => {}); return; }
  // one container per extension and title (many extensions declare the same one for several places); it goes where the extension asked:
  // activitybar → side bar icon, panel → a tab in the bottom panel next to Terminal, secondarySidebar → a tab in the right (AI) side bar
  const merged = new Map();
  for (const def of all) {
    const list = (views[def.id] || []).filter((v) => v && v.id); if (!list.length) continue;
    const k = (def.title || ext.name).toLowerCase(); const m = merged.get(k);
    if (m) { for (const v of list) if (!m.list.some((x) => x.id === v.id || (x.name || "") === (v.name || "\0"))) m.list.push(v); } else merged.set(k, { def, list: [...list] });
  }
  for (const { def, list } of merged.values()) {
    const name = vname(ext.id, def.id);
    const cont = { ext, hh, id: def.id, name, title: def.title || ext.name, views: list, btns: [], welcome: (c.viewsWelcome || []) };
    containers.set(name, cont);
    const el = h("section.view.ext-view", { id: "view-" + name }); document.getElementById("sidebar").append(el); cont.el = el;
    A.registerView(name, (box) => build(cont, box));
    const mkIcon = () => {
      const cm = /^\$\(([\w-]+)\)$/.exec(def.icon || ""); if (cm) return icon(cm[1]);
      if (!def.icon) return icon("extensions");
      const img = h("img.ext-ab-ico", { alt: "", onerror: (e) => e.target.replaceWith(icon("extensions")) });
      A.N.fs.url(P.join(ext.base, def.icon)).then((u) => { img.src = u; }).catch(() => {});
      return img;
    };
    if (def.where !== "activitybar") {   // bottom panel or right side bar: a tab there, no side bar icon
      const cm = /^\$\(([\w-]+)\)$/.exec(def.icon || "");
      A.panel.addItem(name, { label: cont.title, icon: cm ? cm[1] : "extensions" }, def.where === "panel" ? "bottom" : "right"); cont.sheet = true; continue;
    }
    const ab = h("button.ab-btn.ext-ab", { dataset: { view: name }, title: `${cont.title} (${ext.name})`, onclick: () => A.showView(name, { toggle: true }) }, mkIcon());
    const anchor = document.querySelector('#activitybar .ab-btn[data-view="ai"]') || document.querySelector("#activitybar .ab-btn[data-view]:last-of-type");
    anchor?.after(ab); cont.btns.push(ab);
    const strip = document.getElementById("side-nav");
    if (strip) { const sb = h("button.sn-btn.ext-ab", { dataset: { view: name }, title: cont.title, "aria-label": cont.title, onclick: () => A.showView(name) }, mkIcon()); (strip.querySelector(".spacer") || strip.lastChild).before(sb); cont.btns.push(sb); }
  }
}
const aiTabs = new Map();   // ext id -> cli id
export const isAiCli = (ext) => !!aiCliOf(ext);
function aiCliOf(ext) {
  const id = ext.id.toLowerCase();
  if (/^anthropic\.claude-code$|claude-code/.test(id)) return "claude";
  if (/^openai\.(chatgpt|codex)/.test(id)) return "codex";
  if (/^google\.(gemini-cli|geminicodeassist)/.test(id)) return "gemini";
  if (/^github\.copilot/.test(id)) return "copilot";
  return null;
}
export function remove(ext) {
  if (aiTabs.has(ext.id)) { const cli = aiTabs.get(ext.id); aiTabs.delete(ext.id); if (![...aiTabs.values()].includes(cli)) A.feat("ai").then((m) => m.extTab(cli, false)).catch(() => {}); }
  for (const [name, cont] of [...containers]) if (cont.ext.id === ext.id) {
    cont.btns.forEach((b) => b.remove()); if (cont.sheet) A.panel.removeItem(name); cont.el?.remove(); containers.delete(name);
    for (const k of [...viewIndex.keys()]) if (k.startsWith(ext.id + "|")) viewIndex.delete(k);
  }
  for (const [k, p] of [...panels]) if (p.hh?.ext.id === ext.id) { p.el.remove(); panels.delete(k); }
}
export const list = () => [...containers.values()].map((c) => ({ name: c.name, title: c.title, ext: c.ext.id, views: c.views.map((v) => v.id) }));

function build(cont, box) {
  box.replaceChildren(h("div.view-head", h("span.title", cont.title), h("button.icon-btn", { title: "Refresh", onclick: () => { cont.views.forEach((v) => refresh(cont, v.id)); } }, icon("refresh"))),
    h("div.ext-view-body", ...cont.views.map((def) => {
      const body = h("div.xv-body"); const sec = h("div.xv-sec" + (cont.views.length > 1 ? "" : ".single"), { dataset: { view: def.id } },
        cont.views.length > 1 ? h("button.xv-head", { type: "button", onclick: () => sec.classList.toggle("closed") }, icon("chevron-down"), h("span", def.name || def.id)) : null, body);
      viewIndex.set(key(cont.ext.id, def.id), { cont, def, kind: viewIndex.get(key(cont.ext.id, def.id))?.kind || null, body });
      return sec;
    })));
  start(cont);
}
async function start(cont) {
  for (const def of cont.views) placeholder(cont, def, "Starting " + cont.ext.name + "…");
  const hh = cont.hh ? await H.ensureRunning(cont.hh).catch(() => null) : null;
  for (const def of cont.views) {
    const v = viewIndex.get(key(cont.ext.id, def.id)); if (!v) continue;
    if (!cont.hh) { welcome(cont, def, true); continue; }
    if (!hh) { unsupported(cont, def); continue; }
    if (v.kind) render(cont, def.id); else setTimeout(() => { const cur = viewIndex.get(key(cont.ext.id, def.id)); if (cur && !cur.kind) welcome(cont, def, true); }, 1200);
  }
}
function placeholder(cont, def, text) { viewIndex.get(key(cont.ext.id, def.id))?.body.replaceChildren(h("div.xv-note", text)); }
function unsupported(cont, def) {
  const st = H.statusOf(cont.ext.id), err = H.errorOf(cont.ext.id);
  const why = st === "denied" ? "You have not allowed this extension to run code." : !cont.ext.manifest.main && !cont.ext.manifest.browser ? "This extension has no code to run." : "This extension could not start here. Most likely it needs VS Code's desktop extension host (Node.js: child processes, native modules, network sockets), which a phone app cannot provide.";
  viewIndex.get(key(cont.ext.id, def.id))?.body.replaceChildren(h("div.xv-note", h("b", def.name || def.id), h("p", why), err ? h("pre.xv-err", String(err).split("\n").slice(0, 4).join("\n")) : null,
    h("div.xv-actions", st === "denied" ? h("button.btn.primary", { onclick: async () => { await H.allow(cont.ext); A.showView(cont.name); } }, "Allow & start") : h("button.btn", { onclick: () => A.output.show("Extension: " + cont.ext.name) }, "Show log"))));
}

// welcome content: plain paragraphs, [Label](command:id) lines become buttons (same rule as VS Code)
function welcome(cont, def, noProvider) {
  const v = viewIndex.get(key(cont.ext.id, def.id)); if (!v) return;
  const items = cont.welcome.filter((w) => w.view === def.id);
  if (!items.length) { v.body.replaceChildren(h("div.xv-note", noProvider ? "This view has no content here: the extension did not register it (it may need desktop-only APIs)." : "Nothing to show.")); return; }
  const out = [];
  for (const w of items) for (const line of String(w.contents || "").split(/\n+/)) {
    const only = /^\s*\[([^\]]+)\]\(([^)\s]+)[^)]*\)\s*$/.exec(line);
    if (only) { out.push(h("button.btn.primary.xv-btn", { onclick: () => runLink(only[2]) }, only[1].replace(/\$\([\w-]+\)\s*/g, ""))); continue; }
    const p = h("p"); let last = 0; const re = /\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g; let m;
    while ((m = re.exec(line))) { p.append(line.slice(last, m.index), h("button.link", { type: "button", onclick: ((u) => () => runLink(u))(m[2]) }, m[1])); last = m.index + m[0].length; }
    p.append(line.slice(last)); if (p.textContent.trim()) out.push(p);
  }
  v.body.replaceChildren(h("div.xv-welcome", ...out));
}
function runLink(u) { if (u.startsWith("command:")) A.cmd.run(decodeURIComponent(u.slice(8).split("?")[0])); else if (/^https?:/.test(u)) A.N.sys.openUrl(u); }

// ---------------------------------------------------------------------------------- trees
async function renderTree(cont, def) {
  const v = viewIndex.get(key(cont.ext.id, def.id)); if (!v) return;
  let rows; try { rows = await H.rpc(cont.hh, "tree.children", [def.id, null], 8000); } catch (e) { v.body.replaceChildren(h("div.xv-note", "Could not load: " + String(e.message || e).split("\n")[0])); return; }
  if (!rows?.length) return welcome(cont, def, false);
  const ul = h("div.xv-tree"); v.body.replaceChildren(ul); fill(cont, def, ul, rows, 0);
}
function fill(cont, def, parent, rows, depth) {
  for (const r of rows) {
    const kids = h("div.xv-kids.hidden"); let loaded = false;
    const tw = h("span.xv-tw", r.collapsible ? icon("chevron-right") : null);
    const row = h("div.xv-row", { style: { paddingLeft: 8 + depth * 14 + "px" }, title: r.tooltip || r.label, onclick: async () => {
      if (r.collapsible) {
        const open = kids.classList.toggle("hidden") === false; tw.firstChild?.classList.toggle("codicon-chevron-right", !open); tw.firstChild?.classList.toggle("codicon-chevron-down", open);
        if (open && !loaded) { loaded = true; try { fill(cont, def, kids, (await H.rpc(cont.hh, "tree.children", [def.id, r.h], 8000)) || [], depth + 1); } catch { loaded = false; } }
      }
      if (r.command) A.cmd.run(r.command.command, ...(r.command.args || []));
    } }, tw, r.icon ? icon(r.icon) : null, h("span.xv-label", r.label || ""), r.description ? h("span.xv-desc", r.description) : null);
    parent.append(row, kids);
    if (r.collapsible === 2) row.click();
  }
}

// ---------------------------------------------------------------------------------- webviews
const cssVar = (n, d) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || d;
function themeCss() {
  const fg = cssVar("--fg", "#ccc"), bg = cssVar("--sidebar-bg", "#1e1e1e"), bd = cssVar("--border", "#333"), ac = cssVar("--accent", "#007acc"), ebg = cssVar("--bg", "#1e1e1e");
  const v = { foreground: fg, "editor-background": ebg, "editor-foreground": fg, "sideBar-background": bg, "panel-border": bd, "focusBorder": ac, "button-background": ac, "button-foreground": "#fff", "button-hoverBackground": ac, "input-background": ebg, "input-foreground": fg, "input-border": bd, "textLink-foreground": ac, "descriptionForeground": fg, "list-hoverBackground": "#8882", "badge-background": ac, "badge-foreground": "#fff", "font-family": "system-ui, sans-serif", "font-size": "13px", "font-weight": "normal", "editor-font-family": "monospace", "editor-font-size": "13px" };
  return ":root{" + Object.entries(v).map(([k, x]) => `--vscode-${k}:${x}`).join(";") + "}html,body{margin:0;padding:0;background:" + bg + ";color:" + fg + ";font:13px system-ui,sans-serif}body{padding:0 12px}a{color:" + ac + "}";
}
async function frameDoc(html, state) {
  // resources: asWebviewUri() gives cfres://f/<absolute path>; point them at the real files
  const found = [...new Set(html.match(/cfres:\/\/f\/[^"'\s)<>]+/g) || [])];
  const urls = await Promise.all(found.map((u) => A.N.fs.url(decodeURI(u.slice("cfres://f".length))).catch(() => "")));
  found.forEach((u, i) => { html = html.split(u).join(urls[i]); });
  html = html.replace(/<meta[^>]+http-equiv=["']?Content-Security-Policy["']?[^>]*>/gi, "");
  const dark = (document.documentElement.dataset.themeKind || "dark") !== "light";
  const head = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src * data: blob:; media-src * data: blob:; style-src * 'unsafe-inline'; font-src * data:; script-src * 'unsafe-inline' 'unsafe-eval'"><style>${themeCss()}</style><script>(function(){var st=${JSON.stringify(state ?? null)};var api={postMessage:function(m){parent.postMessage({__cfwv:1,msg:m},"*")},getState:function(){return st},setState:function(s){st=s;return s}};var got=false;window.acquireVsCodeApi=function(){if(got)throw new Error("acquireVsCodeApi can only be called once");got=true;return api};document.addEventListener("DOMContentLoaded",function(){document.body.classList.add("${dark ? "vscode-dark" : "vscode-light"}")})})();<\/script>`;
  return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + head) : head + html;
}
function mkFrame() { return h("iframe.xv-frame", { sandbox: "allow-scripts allow-forms allow-modals", referrerpolicy: "no-referrer", title: "Extension view" }); }
async function renderWebview(cont, def) {
  const v = viewIndex.get(key(cont.ext.id, def.id)); if (!v) return;
  if (!v.resolved) { v.resolved = true; H.rpc(cont.hh, "webview.resolve", [def.id], 15000).catch((e) => { v.resolved = false; v.body.replaceChildren(h("div.xv-note", "Could not open this view: " + String(e.message || e).split("\n")[0])); }); }
  if (v.html != null) { if (!v.frame || !v.frame.isConnected) { v.frame = mkFrame(); v.body.replaceChildren(v.frame); } v.frame.srcdoc = await frameDoc(v.html); }
}

function render(cont, viewId) {
  const v = viewIndex.get(key(cont.ext.id, viewId)); if (!v?.body) return;
  if (v.kind === "tree") renderTree(cont, v.def); else if (v.kind === "webview") renderWebview(cont, v.def);
}
function refresh(cont, viewId) { const v = viewIndex.get(key(cont.ext.id, viewId)); if (v?.kind === "tree") renderTree(cont, v.def); else if (v) render(cont, viewId); }

// ---------------------------------------------------------------------------------- calls from the extension (worker → IDE)
export async function handle(hh, m, a) {
  const ext = hh.ext;
  const find = (viewId) => { const k = key(ext.id, viewId); if (!viewIndex.has(k)) { const cont = [...containers.values()].find((c) => c.ext.id === ext.id && c.views.some((x) => x.id === viewId)); if (!cont) return null; viewIndex.set(k, { cont, def: cont.views.find((x) => x.id === viewId), kind: null, body: null }); } return viewIndex.get(k); };
  switch (m) {
    case "view.register": { const v = find(a[0]); if (!v) return false; v.kind = a[1]; if (v.body) render(v.cont, a[0]); return true; }
    case "view.treeRefresh": { const v = find(a[0]); if (v?.body) renderTree(v.cont, v.def); return true; }
    case "view.html": {
      if (panels.has(a[0])) { const p = panels.get(a[0]); p.frame.srcdoc = await frameDoc(a[1]); return true; }
      const v = find(a[0]); if (!v) return false; v.html = a[1]; if (v.body) renderWebview(v.cont, v.def); return true;
    }
    case "view.post": { const f = panels.get(a[0])?.frame || find(a[0])?.frame; f?.contentWindow?.postMessage(a[1], "*"); return !!f; }
    case "view.panel": {
      const [k, title] = a; const frame = mkFrame();
      const close = () => { el.remove(); panels.delete(k); H.rpc(hh, "webview.closed", [k]).catch(() => {}); };
      const el = h("div.xv-panel", h("div.xv-panel-head", h("button.icon-btn", { title: "Back", onclick: close }, icon("arrow-left")), h("span.title", title || ext.name), h("span.muted", ext.name), h("button.icon-btn", { title: "Close", onclick: close }, icon("close"))), frame);
      document.getElementById("workbench").append(el); panels.set(k, { el, frame, hh }); return true;
    }
    case "view.panelClose": { const p = panels.get(a[0]); if (p) { p.el.remove(); panels.delete(a[0]); } return true; }
    case "view.panelShow": return panels.has(a[0]);
    default: throw new Error("unknown view call " + m);
  }
}
export const _esc = esc;
