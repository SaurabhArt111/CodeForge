// Command registry, command palette, quick open (files / symbols / go to line) and global keyboard shortcuts.
import { bus } from "../core/events.js";
import { quickPick, toast } from "../core/ui.js";
import { h, icon, P, fuzzy } from "../core/util.js";
import { ws } from "./workspace.js";
import * as ed from "./editor.js";
import * as icons from "../features/icons.js";
import { settings } from "../core/settings.js";

const cmds = new Map();
export function register(c) { cmds.set(c.id, c); return () => cmds.delete(c.id); }
export function registerAll(list) { list.forEach(register); }
export const list = () => [...cmds.values()];
export async function run(id, ...a) { const c = cmds.get(id); if (!c) return toast("Unknown command: " + id, { kind: "error" }); try { return await c.run(...a); } catch (e) { toast(e.message || String(e), { kind: "error" }); } }

const recentCmds = () => settings.state.recentCmds || [];
export async function palette(initial = "") {
  const rec = recentCmds();
  const items = list().filter((c) => !c.when || c.when()).map((c) => ({ label: (c.category ? c.category + ": " : "") + c.title, keys: c.keys, icon: c.icon, value: c.id, _id: c.id }));
  items.sort((a, b) => (rec.indexOf(a._id) + 1 || 999) - (rec.indexOf(b._id) + 1 || 999) || a.label.localeCompare(b.label));
  const id = await quickPick(items, { placeholder: "Type a command…", prefix: ">", initial });
  if (!id) return;
  settings.state.recentCmds = [id, ...rec.filter((x) => x !== id)].slice(0, 12); settings.saveState();
  run(id);
}

export async function quickOpen(initial = "") {
  if (!ws.isOpen) return toast("Open a folder first");
  const files = await ws.fileIndex();
  const open = ed.openPaths().map((p) => P.rel(ws.root, p));
  const mk = (rel) => ({ label: P.base(rel), description: P.dir(rel) === "/" ? "" : P.dir(rel).replace(/^\//, ""), icon: icons.fileIcon(P.base(rel)), value: rel });
  const rank = (q) => (q.startsWith(":") ? [] : files);
  const pick = await quickPick([], {
    placeholder: "Go to file…  (:line  to jump to a line)", initial,
    onQuery: async (q) => {
      if (/^:\d+/.test(q)) return [{ label: `Go to line ${q.slice(1)}`, icon: "arrow-right", value: { line: +q.slice(1) } }];
      if (!q) return open.slice(0, 12).map(mk).concat(files.slice(0, 60).filter((f) => !open.includes(f)).map(mk));
      const m = q.match(/^(.*?):(\d+)$/); const query = m ? m[1] : q;
      return rank(q).map((f) => ({ f, s: fuzzy(query, P.base(f)) * 3 + fuzzy(query, f) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 80).map((x) => ({ ...mk(x.f), line: m ? +m[2] : 0 }));
    },
  });
  if (!pick) return;
  if (pick.line !== undefined && !pick.value?.line && typeof pick.value === "string") return ed.openFile(P.join(ws.root, pick.value), { line: pick.line || undefined });
  if (pick.value?.line) { const e = ed.activeEditor(); if (e) { e.revealLineInCenter(pick.value.line); e.setPosition({ lineNumber: pick.value.line, column: 1 }); e.focus(); } return; }
  ed.openFile(P.join(ws.root, pick.value ?? pick));
}

export async function gotoLine() {
  const e = ed.activeEditor(); if (!e) return;
  const max = e.getModel().getLineCount();
  const r = await quickPick([], { placeholder: `Line number (1–${max}), optional :column`, onQuery: async (q) => { const m = q.match(/^(\d+)(?::(\d+))?$/); return m ? [{ label: `Go to line ${m[1]}${m[2] ? ", column " + m[2] : ""}`, value: { l: +m[1], c: +(m[2] || 1) } }] : []; } });
  if (r?.l) { e.revealLineInCenter(r.l); e.setPosition({ lineNumber: Math.min(r.l, max), column: r.c || 1 }); e.focus(); }
}

export async function gotoSymbol() {
  const e = ed.activeEditor(); if (!e) return;
  await e.getAction("editor.action.quickOutline")?.run();
}

export async function pickLanguage() {
  const d = ed.activeDoc(); if (!d?.model) return;
  const langs = ed.languages();
  const r = await quickPick(langs.map((l) => ({ label: l.label, description: l.id, value: l.id })), { placeholder: "Select language mode" });
  if (r) ed.setLanguage(d.path, r);
}

export async function pickEol() {
  const d = ed.activeDoc(); if (!d?.model) return;
  const r = await quickPick([{ label: "LF", value: 0 }, { label: "CRLF", value: 1 }], { placeholder: "Select end of line sequence" });
  if (r !== undefined) { d.model.pushEOL(r === 1 ? ed.monaco.editor.EndOfLineSequence.CRLF : ed.monaco.editor.EndOfLineSequence.LF); ed.editorEvents.emit("language"); }
}

export async function pickIndent() {
  const d = ed.activeDoc(); if (!d?.model) return;
  const r = await quickPick([2, 4, 8].map((n) => ({ label: `Spaces: ${n}`, value: { s: true, n } })).concat([2, 4, 8].map((n) => ({ label: `Tab Size: ${n}`, value: { s: false, n } }))), { placeholder: "Select indentation" });
  if (r) { d.model.updateOptions({ insertSpaces: r.s, tabSize: r.n }); ed.editorEvents.emit("language"); }
}

// ---------------------------------------------------------------- global shortcuts (hardware keyboards / Chromebooks / DeX)
export function initKeys() {
  window.addEventListener("keydown", (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod && e.key !== "F1" && e.key !== "F5") return;
    const k = e.key.toLowerCase();
    const act = (fn) => { e.preventDefault(); e.stopPropagation(); fn(); };
    if (mod && e.shiftKey && k === "p" || e.key === "F1") act(() => palette());
    else if (mod && !e.shiftKey && k === "p") act(() => quickOpen());
    else if (mod && k === "s" && !e.shiftKey) act(() => ed.saveActive());
    else if (mod && e.shiftKey && k === "f") act(() => bus.emit("cmd:search"));
    else if (mod && e.shiftKey && k === "e") act(() => bus.emit("view", "explorer"));
    else if (mod && e.shiftKey && k === "g") act(() => bus.emit("view", "git"));
    else if (mod && e.shiftKey && k === "x") act(() => bus.emit("view", "extensions"));
    else if (mod && k === "b") act(() => bus.emit("cmd:sidebar"));
    else if (mod && (k === "`" || k === "j")) act(() => bus.emit("cmd:terminal"));
    else if (mod && k === "g" && !e.shiftKey) act(() => gotoLine());
    else if (mod && e.altKey && k === "n") act(() => bus.emit("cmd:newfile"));
    else if (mod && k === "w" && e.altKey) act(() => ed.closeTab(ed.activeTab()));
    else if (mod && e.key === "\\") act(() => ed.toggleSplit());
    else if (e.key === "F5") act(() => bus.emit("cmd:run"));
  }, true);
}
