// Terminal mode: CodeForge as a full-screen, Termux-style terminal. The editor, side bars and panels are hidden;
// the same terminal sessions are shown full screen with session tabs, a session drawer and the extra-keys row.
// Switch back to the full IDE (code + AI + terminal) at any time: the sessions keep running in both modes.
import { N } from "../core/bridge.js";
import { settings } from "../core/settings.js";
import { bus } from "../core/events.js";
import { h, icon } from "../core/util.js";
import { contextMenu, prompt, toast, quickPick } from "../core/ui.js";
import * as term from "./terminal.js";
import * as keybar from "./keybar.js";

let root, tabsEl, bodyEl, drawer, backdrop, emptyEl, sysLine, sessList, on = false, A = null;

export const isOn = () => on;
const native = () => N.mode() === "android" || N.mode() === "devhost";   // has a real Linux environment (devhost = test host)

/** api: { feat(name), runCommand(id), info() } from main.js */
export function init(api) {
  A = api;
  bus.on("term:tabs", () => { if (on) render(); });
  bus.on("term:empty", () => { if (on) showEmpty(); });
}

function build() {
  tabsEl = h("div.tm-tabs", { role: "tablist" });
  bodyEl = h("div.tm-body");
  emptyEl = h("div.tm-empty.hidden");
  sysLine = h("div.tm-sys");
  sessList = h("div.tm-sessions");
  const hdr = h("header.tm-head",
    h("button.tm-btn", { title: "Sessions and options", "aria-label": "Sessions", onclick: openDrawer }, icon("menu")),
    tabsEl,
    h("button.tm-btn", { title: "New session", "aria-label": "New session", onclick: () => newSession() }, icon("add")),
    h("button.tm-btn", { title: "More", "aria-label": "More", onclick: (e) => moreMenu(e.clientX, e.clientY) }, icon("kebab-vertical")),
    h("button.tm-ide", { title: "Switch to the full IDE (code, AI and terminal)", onclick: () => exit() }, icon("code"), h("span", "IDE")));
  backdrop = h("div.tm-backdrop", { onclick: closeDrawer });
  drawer = h("aside.tm-drawer", { "aria-label": "Terminal sessions" },
    h("div.tm-dr-title", h("img", { src: "assets/logo.svg", alt: "", width: 22, height: 22 }), h("b", "CodeForge Terminal")),
    sysLine,
    h("div.tm-dr-h", "Sessions"), sessList,
    h("div.tm-dr-acts",
      act("add", "New session", () => newSession()),
      act("terminal", "New Android shell session", () => newSession({ mode: "host" })),
      act("server-environment", "Linux system (Alpine, Debian, Ubuntu)…", async () => (await A.feat("env")).distroPicker()),
      act("package", "Install packages…", async () => (await A.feat("env")).wizard()),
      act("color-mode", "Appearance: light / dark / system…", () => A.runCommand("view.appearance")),
      act("settings-gear", "Settings (opens in the IDE)", () => { exit(); A.runCommand("view.settings"); }),
      act("code", "Switch to full IDE", () => exit())),
    h("p.tm-dr-note", N.mode() === "web"
      ? "Web version: this is a small built-in shell (files, git, npm run emulation). For a real Linux with apt / apk, use the Android app."
      : "Your files are in ~ (the CodeForge workspace). Install anything with: pkg install <name>"));
  root = h("div#termmode", hdr, h("div.tm-main", bodyEl, emptyEl), backdrop, drawer);
  document.body.append(root);
}
const act = (ic, label, fn) => h("button.tm-act", { onclick: () => { closeDrawer(); fn(); } }, icon(ic), h("span", label));

export async function enter({ save = true } = {}) {
  if (on) return;
  if (!root) build();
  on = true;
  document.body.classList.add("term-mode");
  root.classList.remove("hidden");
  term.setHost(bodyEl);
  const kb = document.getElementById("keybar"); if (kb) root.append(kb);
  keybar.refresh?.();
  if (save) settings.set("app.mode", "terminal");
  render();
  if (!term.list().some((t) => !t.embedded)) await showEmpty(true);
  else setTimeout(() => term.get()?.xt?.focus(), 80);
}

export function exit({ save = true } = {}) {
  if (!on) return;
  on = false; closeDrawer();
  document.body.classList.remove("term-mode");
  root.classList.add("hidden");
  const kb = document.getElementById("keybar"), nav = document.getElementById("bottomnav");
  if (kb && nav) nav.before(kb); else if (kb) document.body.append(kb);
  term.setHost(null);
  keybar.refresh?.();
  if (save) settings.set("app.mode", "ide");
  // the sessions stay in the terminal panel, shown again right away
  if (term.list().some((t) => !t.embedded)) A.showTerminal?.();
}

export const toggle = () => (on ? exit() : enter());

/** Android back: close the drawer first. */
export function handleBack() {
  if (on && drawer?.classList.contains("open")) { closeDrawer(); return true; }
  return false;
}

async function preferredMode() {
  if (!native()) return undefined;
  try { const s = await N.env.status(); return s.installed ? "linux" : "host"; } catch { return "host"; }
}

export async function newSession({ mode } = {}) {
  emptyEl.classList.add("hidden");
  const t = await term.create({ mode: mode || (await preferredMode()) });
  if (!t && !term.list().some((x) => !x.embedded)) showEmpty();
  return t;
}

async function showEmpty(autostart = false) {
  const s = native() ? await N.env.status().catch(() => ({})) : {};
  if (autostart && (!native() || s.installed)) { await newSession(); return; }
  emptyEl.replaceChildren(h("div.tm-card",
    h("div.tm-card-ico", icon("terminal")),
    h("h2", "CodeForge Terminal"),
    native() && !s.installed
      ? h("p", "A full Linux terminal on your phone. Pick a Linux system to install, then use it like any server: apt / apk, Node.js, Python, Git, compilers, SSH and more.")
      : h("p", "No sessions are open."),
    h("div.tm-card-acts",
      native() && !s.installed && s.supported !== false
        ? h("button.btn.primary", { onclick: async () => { const ok = await (await A.feat("env")).distroPicker(); if (ok) newSession({ mode: "linux" }); } }, "Install Linux…") : null,
      h("button.btn" + (native() && !s.installed ? "" : ".primary"), { onclick: () => newSession(native() && !s.installed ? { mode: "host" } : {}) },
        native() && !s.installed ? "Use the Android shell" : "New session"),
      h("button.btn", { onclick: () => exit() }, "Open the full IDE"))));
  emptyEl.classList.remove("hidden");
}

function render() {
  const list = term.list().filter((t) => !t.embedded), cur = term.get();
  tabsEl.replaceChildren(...list.map((t, i) => h("button.tm-tab" + (t === cur ? ".on" : "") + (t.alive ? "" : ".dead"), {
    role: "tab", "aria-selected": String(t === cur), title: t.title,
    onclick: () => { term.select(t.id); t.xt?.focus(); },
  }, h("span.tm-n", String(i + 1)), h("span.tm-t", t.title || "session"))));
  tabsEl.querySelector(".on")?.scrollIntoView?.({ inline: "nearest", block: "nearest" });
  if (list.length) emptyEl.classList.add("hidden");
  if (drawer?.classList.contains("open")) renderDrawer();
}

async function renderDrawer() {
  const list = term.list().filter((t) => !t.embedded), cur = term.get();
  sessList.replaceChildren(...(list.length ? list.map((t, i) => h("div.tm-sess" + (t === cur ? ".on" : ""),
    h("button.tm-sess-main", { onclick: () => { term.select(t.id); closeDrawer(); t.xt?.focus(); } },
      icon(t.agentName ? "sparkle" : t.mode === "linux" ? "server-environment" : "terminal"),
      h("span.tm-sess-t", `[${i + 1}] ${t.title || "session"}`), h("span.tm-sess-s", t.alive ? (t.mode === "linux" ? "Linux" : t.mode === "host" ? "Android shell" : "") : "exited")),
    h("button.tm-btn", { title: "Rename", onclick: () => rename(t) }, icon("edit")),
    h("button.tm-btn", { title: "Close session", onclick: () => term.closeTerm(t.id) }, icon("close")))) : [h("p.muted", "No sessions")]));
  if (native()) {
    const s = await N.env.status().catch(() => ({}));
    sysLine.replaceChildren(icon("server-environment"), h("span", s.installed ? `${s.name || "Linux"}${s.version ? " · " + s.version : ""}` : "Linux not installed"),
      h("button.linklike", { onclick: async () => { closeDrawer(); (await A.feat("env")).distroPicker(); } }, s.installed ? "Change" : "Install"));
  } else sysLine.replaceChildren();
}

async function rename(t) {
  const v = await prompt("Rename session", { value: t.title || "" }); if (!v) return;
  t.title = v.slice(0, 40); N.term.rename(t.id, t.title).catch(() => {}); term.retitle();
}

function openDrawer() { renderDrawer(); drawer.classList.add("open"); backdrop.classList.add("open"); }
function closeDrawer() { drawer?.classList.remove("open"); backdrop?.classList.remove("open"); }

function zoom(d) {
  const v = Math.max(8, Math.min(32, (settings.get("terminal.fontSize") || 13) + d));
  settings.set("terminal.fontSize", v); toast(`Text size ${v}`, { timeout: 900 });
}

function moreMenu(x, y) {
  const t = term.get();
  contextMenu([
    { label: "New session", icon: "add", run: () => newSession() },
    ...(t ? [
      { label: "Rename session…", icon: "edit", run: () => rename(t) },
      { label: "Paste", icon: "clippy", run: () => term.pasteFromClipboard() },
      { label: "Select all", icon: "list-flat", run: () => t.xt.selectAll() },
      { label: "Copy selection", icon: "copy", run: () => { if (t.xt.hasSelection()) N.sys.clipboardSet(t.xt.getSelection()); } },
      { label: "Clear screen", icon: "clear-all", run: () => t.xt.clear() },
      { label: "Find…", icon: "search", run: async () => { const q = await prompt("Find in terminal"); if (q) t.search?.findNext(q); } },
      { label: "Kill session", icon: "trash", run: () => term.closeTerm(t.id) },
    ] : []),
    { separator: true },
    { label: "Text size +", icon: "zoom-in", run: () => zoom(1) },
    { label: "Text size −", icon: "zoom-out", run: () => zoom(-1) },
    { label: "Linux system…", icon: "server-environment", run: async () => (await A.feat("env")).distroPicker() },
    { label: "Appearance…", icon: "color-mode", run: () => A.runCommand("view.appearance") },
    { separator: true },
    { label: "Switch to full IDE", icon: "code", run: () => exit() },
  ], x, y);
}

/** Session picker for the command palette. */
export async function pickSession() {
  const list = term.list().filter((t) => !t.embedded);
  const r = await quickPick(list.map((t, i) => ({ label: `[${i + 1}] ${t.title}`, value: t.id })), { placeholder: "Switch session" });
  if (r) term.select(r);
}
