// Live Server + in-app Preview panel (iframe with URL bar, device presets, console capture, hot reload).
import { h, icon, P, copyText, isMobile } from "../core/util.js";
let A, frame, urlIn, consoleEl, deviceSel, stage, scaleBox, state = { history: [], idx: -1, url: "", device: "responsive", landscape: false, consoleOpen: false };
const servers = new Map(); // port -> {port,root,url,lanUrl}
const detected = new Set();

const DEVICES = [["responsive", "Responsive", 0, 0], ["iphone-se", "iPhone SE", 375, 667], ["iphone-15", "iPhone 15", 393, 852], ["pixel", "Pixel 8", 412, 915], ["galaxy-fold", "Galaxy Fold (folded)", 280, 653], ["ipad", "iPad Mini", 768, 1024], ["tablet", "Tablet 10″", 800, 1280], ["laptop", "Laptop", 1280, 800]];

export async function init(api) {
  A = api;
  buildPane();
  A.panel.registerView("preview", { onShow: (actions) => { actions.append(h("button.icon-btn", { title: "Open in browser", onclick: () => state.url && A.N.sys.openUrl(state.url) }, icon("link-external"))); } });
  A.N.on("live.log", (d) => A.output.append("Live Server", `[${d.port}] ${d.line}\n`));
  window.addEventListener("message", onMessage);
  A.bus.on("saved", (p) => { for (const s of servers.values()) if (A.ws.isOpen && P.inside(s.root, p)) A.N.live.reload(s.port, P.rel(s.root, p)).catch(() => {}); });
  A.bus.on("port:detected", onPort);
  await refresh();
  setInterval(refresh, 4000);
}

export async function refresh() {
  try {
    const list = await A.N.live.list(); servers.clear(); for (const s of list) servers.set(s.port, s);
    statusItem(); A.bus.emit("live:changed", [...servers.values()]);
  } catch { /* ignore */ }
}
export const list = () => [...servers.values()];
function statusItem() {
  const n = servers.size;
  if (!n) return A.status.remove("live");
  const s = [...servers.values()][0];
  A.status.item("live", { side: "left", priority: 3, ic: "broadcast", text: n === 1 ? `Live :${s.port}` : `Live ×${n}`, cls: "live", title: "Live Server – click for options", onClick: (e) => liveMenu(e.clientX, e.clientY) });
}
function liveMenu(x, y) {
  A.contextMenu([...servers.values()].flatMap((s) => [
    { label: `Open :${s.port} in Preview`, icon: "preview", run: () => openPreview(s.url) },
    { label: `Open :${s.port} in browser`, icon: "link-external", run: () => A.N.sys.openUrl(s.url) },
    ...(s.lanUrl ? [{ label: `Copy network URL (${s.lanUrl})`, icon: "copy", run: () => copyText(s.lanUrl) }] : []),
    { label: `Stop :${s.port}`, icon: "debug-stop", danger: true, run: async () => { await A.N.live.stop(s.port); refresh(); } },
  ]).concat([{ separator: true }, { label: "Stop all", icon: "debug-stop", danger: true, run: stopAll }]), x, y);
}

export async function serve(dir, { open = true, file = "" } = {}) {
  if (!dir) return A.toast("Open a folder first");
  try {
    const s = await A.N.live.start({ root: dir, port: A.settings.get("live.port"), spa: A.settings.get("live.spa"), lan: A.settings.get("live.lan") });
    await refresh();
    if (open) openPreview(s.url + file.replace(/^\//, ""));
    A.toast(`Live Server on :${s.port}` + (s.lanUrl ? ` · ${s.lanUrl}` : ""), { kind: "success" });
    return s;
  } catch (e) { A.toastError(e); }
}
export async function previewFile(file) {
  const root = A.ws.isOpen && P.inside(A.ws.root, file) ? A.ws.root : P.dir(file);
  if (A.ed.getDoc(file)?.dirty) await A.ed.save(file);
  return serve(root, { file: P.rel(root, file).split("/").map(encodeURIComponent).join("/") });
}
export async function stopAll() { for (const s of [...servers.values()]) await A.N.live.stop(s.port).catch(() => {}); await refresh(); A.toast("Live Server stopped"); }
export async function stop(port) { await A.N.live.stop(port); await refresh(); }

function onPort(port) {
  if (detected.has(port) || servers.has(port)) return; detected.add(port); A.bus.emit("ports:changed", [...detected]);
  A.toast(`Server detected on port ${port}`, { action: { label: "Preview", run: () => openPreview(`http://127.0.0.1:${port}/`) }, timeout: 9000 });
}
export const ports = () => [...detected];

// ---------------------------------------------------------------- preview pane
function buildPane() {
  const pane = A.panel.pane("preview");
  urlIn = h("input.input", { placeholder: "http://127.0.0.1:5500/", spellcheck: false, autocapitalize: "off", style: { flex: 1 }, onkeydown: (e) => { if (e.key === "Enter") navigate(normalize(urlIn.value)); } });
  deviceSel = h("select", { style: { width: "auto", maxWidth: "130px" }, onchange: () => { state.device = deviceSel.value; layoutFrame(); } }, ...DEVICES.map(([id, label, w, hgt]) => h("option", { value: id }, w ? `${label} ${w}×${hgt}` : label)));
  const bar = h("div.pv-bar",
    h("button.icon-btn", { title: "Back", onclick: () => go(-1) }, icon("arrow-left")), h("button.icon-btn", { title: "Forward", onclick: () => go(1) }, icon("arrow-right")), h("button.icon-btn", { title: "Reload", onclick: reload }, icon("refresh")),
    urlIn, deviceSel,
    h("button.icon-btn", { title: "Rotate", onclick: () => { state.landscape = !state.landscape; layoutFrame(); } }, icon("device-mobile")),
    h("button.icon-btn", { title: "Console", onclick: () => { state.consoleOpen = !state.consoleOpen; consoleBox.style.display = state.consoleOpen ? "flex" : "none"; } }, icon("debug-console")),
    h("button.icon-btn", { title: "Open in browser", onclick: () => state.url && A.N.sys.openUrl(state.url) }, icon("link-external")));
  frame = h("iframe.pv-frame", { sandbox: "allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads allow-pointer-lock", allow: "clipboard-read; clipboard-write; fullscreen; camera; microphone; geolocation", referrerpolicy: "no-referrer" });
  scaleBox = h("div.pv-scale", frame); stage = h("div.pv-stage", scaleBox);
  consoleEl = h("div.pv-lines.selectable");
  const consoleBox = h("div.pv-console", { style: { display: "none" } }, h("div.term-bar", h("span.muted", { style: { flex: 1, paddingLeft: "6px" } }, "Console"), h("button.icon-btn", { onclick: () => consoleEl.replaceChildren() }, icon("clear-all"))), consoleEl);
  const empty = h("div.pv-empty", icon("preview"), h("div", "Nothing to preview yet"), h("button.btn.primary", { onclick: () => serve(A.ws.root) }, "Start Live Server"));
  state.empty = empty; stage.append(empty);
  pane.append(bar, stage, consoleBox);
  new ResizeObserver(layoutFrame).observe(stage);
}
function normalize(u) { u = u.trim(); if (!u) return ""; if (/^\d{2,5}$/.test(u)) return `http://127.0.0.1:${u}/`; if (/^(localhost|127\.|0\.0\.0\.0|\[::1\]|\d+\.\d+\.\d+\.\d+)/.test(u)) return "http://" + u.replace(/^0\.0\.0\.0/, "127.0.0.1"); if (!/^[a-z]+:\/\//i.test(u)) return "https://" + u; return u; }

export function openPreview(url) {
  A.panel.show("preview"); navigate(url);
}
function navigate(url, push = true) {
  if (!url) return;
  try { if (new URL(url, location.href).origin === location.origin) return A.toast("Refusing to preview the IDE's own origin", { kind: "error" }); } catch { return A.toast("Invalid URL", { kind: "error" }); }
  if (push) { state.history = state.history.slice(0, state.idx + 1); state.history.push(url); state.idx = state.history.length - 1; }
  state.url = url; urlIn.value = url; state.empty?.remove(); state.empty = null; frame.src = url;
  consoleEl.replaceChildren();
}
function go(d) { const i = state.idx + d; if (i < 0 || i >= state.history.length) return; state.idx = i; navigate(state.history[i], false); }
function reload() { if (state.url) { try { frame.contentWindow.location.reload(); } catch { frame.src = state.url; } consoleEl.replaceChildren(); } }
function layoutFrame() {
  const d = DEVICES.find((x) => x[0] === state.device); const sw = stage.clientWidth, sh = stage.clientHeight;
  if (!d || !d[2]) { scaleBox.style.cssText = "width:100%;height:100%;transform:none"; return; }
  let [w, hh] = [d[2], d[3]]; if (state.landscape) [w, hh] = [hh, w];
  const k = Math.min(1, (sw - 16) / w, (sh - 16) / hh);
  scaleBox.style.cssText = `width:${w}px;height:${hh}px;transform:scale(${k});transform-origin:top center;margin:8px auto;box-shadow:0 0 0 1px var(--border),0 8px 30px #0006;background:#fff`;
}
function onMessage(e) {
  const m = e.data; if (!m || !m.__cf || e.source !== frame?.contentWindow) return;
  if (m.type === "nav") { if (m.url !== state.url) { state.url = m.url; urlIn.value = m.url; if (state.history[state.idx] !== m.url) { state.history = state.history.slice(0, state.idx + 1); state.history.push(m.url); state.idx++; } } }
  else if (m.type === "console") {
    const line = h("div.pv-line." + m.level, h("span.pv-time", new Date().toLocaleTimeString()), h("span", m.args.join(" ")));
    consoleEl.append(line); consoleEl.parentElement.scrollTop = consoleEl.parentElement.scrollHeight;
    if (m.level === "error" && !state.consoleOpen) { const b = document.querySelector('.ptab[data-panel="preview"]'); b?.classList.add("alert"); setTimeout(() => b?.classList.remove("alert"), 3000); }
  }
}
