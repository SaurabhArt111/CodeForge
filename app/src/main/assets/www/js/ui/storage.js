// Storage Manager: shows where CodeForge's storage goes (same categories as core/StorageOps.kt), cleans the safe ones,
// lets the user delete single items, and guards big operations against a full device / the user's own limit.
import { settings } from "../core/settings.js";
import { h, fmtBytes } from "../core/util.js";
import { N } from "../core/bridge.js";
import { bus } from "../core/events.js";
import * as ed from "./editor.js";
import * as ui from "../core/ui.js";
import * as jobs from "../core/jobs.js";

/** label · what it is · colour · note about deleting it. `how` tells the user what happens when they clear it. */
export const CATS = {
  projects:       { label: "Your projects",        color: "#4f9cf9", desc: "Folders you created or opened in the workspace.", how: "Delete single projects below. Never cleared in bulk." },
  imported:       { label: "Imported folders",     color: "#7c6cf0", desc: "Copies made by Open Folder / Open ZIP.", how: "Delete the copies you no longer need below." },
  inbox:          { label: "Inbox",                color: "#a78bfa", desc: "Files received from the share sheet.", how: "Delete single files below." },
  "node-modules": { label: "node_modules",         color: "#f59e0b", desc: "Dependencies inside your projects. They can be re-created with npm install.", how: "Safe to clear; run npm install again when you need them." },
  "linux-system": { label: "Linux system",         color: "#ef4444", desc: "The Alpine Linux root file system and the packages installed in it.", how: "Remove it with “Reset Linux”; you can install it again later." },
  "linux-user":   { label: "Linux user files",     color: "#f97316", desc: "Hidden folders in your Linux home (.config, .local, .npm-global, …).", how: "Delete single items below." },
  "cache-pkg":    { label: "Package caches",       color: "#14b8a6", desc: "Downloaded npm / pip / apk packages kept for re-use.", how: "Safe to clear; packages are downloaded again when needed." },
  "cache-home":   { label: "Tool caches",          color: "#2dd4bf", desc: "~/.cache and build caches of command-line tools.", how: "Safe to clear." },
  "cache-app":    { label: "App cache",            color: "#5eead4", desc: "CodeForge's cache folder.", how: "Safe to clear." },
  tmp:            { label: "Temporary files",      color: "#94a3b8", desc: "Scratch space of terminals and tools.", how: "Safe to clear when no terminal is open." },
  leftovers:      { label: "Leftovers",            color: "#e11d48", desc: "Half-finished downloads, staging copies and old bundles that nothing uses any more.", how: "Safe to clear." },
  exports:        { label: "ZIP / bundle files",   color: "#ec4899", desc: "ZIP and bundle files inside your workspace (not those already in Downloads).", how: "Safe once you have exported them." },
  extensions:     { label: "Extensions",           color: "#22c55e", desc: "Installed VS Code extensions.", how: "Remove extensions in the Extensions view or delete single ones below." },
  plugins:        { label: "Plugins",              color: "#84cc16", desc: "Installed CodeForge plugins.", how: "Delete single plugins below." },
  ai:             { label: "AI chats & indexes",   color: "#06b6d4", desc: "Saved assistant conversations and code indexes.", how: "Clearing removes your chat history." },
  crashes:        { label: "Crash reports",        color: "#fb7185", desc: "Reports collected for Settings → Diagnostics.", how: "Safe to clear." },
  webview:        { label: "Web view data",        color: "#cbd5e1", desc: "Cookies and caches of the built-in browser engine (held by Android).", how: "Clear with Android → App info → Storage → Clear cache." },
  "app-data":     { label: "App data",             color: "#64748b", desc: "Settings, keys, themes, recent files and other data CodeForge needs.", how: "Cannot be cleared here." },
};
const label = (id) => CATS[id]?.label || id;

let last = null;     // the last scan, shared with the Settings link row and the guard
export const lastScan = () => last;
export const usedBytes = () => last?.total ?? null;

/** Runs a scan as a (silent) background job. */
export async function scan({ silent = true } = {}) {
  const r = await jobs.run({ title: "Measuring storage", kind: "storage", icon: "database", silent, doneText: "Storage measured" }, async (job) => {
    job.on("storage.progress", (d) => { if (d.files) job.update(`${d.files.toLocaleString()} files · ${fmtBytes(d.bytes || 0)}`, -1); });
    job.update("Counting files…", -1);
    return N.storage.scan(job.id);
  });
  if (!r.ok) throw new Error(r.error || "Scan failed");
  last = r.result; bus.emit("storage:scanned", last); return last;
}

/** Free space check before a big operation: resolves true to go on. Estimates are in bytes; unknown estimates pass. */
export async function ensure(needed = 0, what = "this") {
  try {
    const s = last && Date.now() - last.at < 120000 ? last : await scan();
    const freeNow = s.device?.free || 0, minFree = (+settings.get("storage.minFreeMB") || 0) * 1048576, limit = (+settings.get("storage.limitMB") || 0) * 1048576;
    if (freeNow && freeNow - needed < Math.max(minFree, 50 * 1048576)) {
      return ui.confirm(`Only ${fmtBytes(freeNow)} is free on this device${needed ? `, and ${what} needs about ${fmtBytes(needed)}` : ""}. Free some space first?`, { title: "Low storage", okLabel: "Continue anyway", detail: "Open Settings → Storage to see what can be cleared." });
    }
    if (limit && s.total + needed > limit) {
      return ui.confirm(`CodeForge uses ${fmtBytes(s.total)} and would pass your limit of ${fmtBytes(limit)}${needed ? ` with ${what}` : ""}.`, { title: "Storage limit reached", okLabel: "Continue anyway" });
    }
  } catch { /* a failed scan never blocks work */ }
  return true;
}

/** Called at startup: clears temp files (and caches) when the user asked for it. Never touches projects. */
export async function autoClean() {
  const mode = settings.get("storage.autoClean");
  if (!mode || mode === "off") return;
  const ids = mode === "temp+caches" ? ["tmp", "leftovers", "cache-pkg", "cache-home", "cache-app"] : ["tmp", "leftovers"];
  const r = await cleanIds(ids, { silent: true, quiet: true });
  if (r?.freed > 20 * 1048576) ui.toast(`Cleaned ${fmtBytes(r.freed)} of temporary files`, { kind: "info", timeout: 3500 });
}

async function cleanIds(ids, { silent = false, quiet = false } = {}) {
  const r = await jobs.run({ title: "Freeing space", kind: "storage", icon: "trash", silent, cancellable: true, doneText: "Space freed" }, async (job) => {
    job.on("storage.progress", (d) => { if (d.cat) job.update(`Cleared ${label(d.cat)} · ${fmtBytes(d.freed || 0)}`, null); });
    job.update("Cleaning…", -1);
    const res = await N.storage.clean(ids, job.id);
    job.doneText = res.freed ? `Freed ${fmtBytes(res.freed)}` : "Nothing to clean";
    return res;
  });
  if (r.ok && !quiet && r.result.errors?.length) ui.toast(r.result.errors.join(" · "), { kind: "warn", timeout: 7000 });
  if (r.ok) { last = null; bus.emit("storage:changed"); }
  return r.ok ? r.result : null;
}

export async function open() {
  bus.emit("sidebar:close");
  return ed.openCustom("storage", "Storage", { iconName: "database", render });
}

function render(el) {
  el.classList.add("settings-page", "storage-page");
  const body = h("div.settings-body");
  el.append(body);
  const draw = (s) => {
    body.replaceChildren();
    body.append(h("h2.page-title", "Storage"), h("p.muted.set-note", "Where CodeForge's space goes, and what you can safely clear. Files you exported to the Downloads folder are not counted: they belong to you."));
    if (!s) { body.append(ui.loaderBlock("Measuring… this can take a moment on a big workspace")); return; }
    drawSummary(body, s);
    drawCats(body, s, draw);
    drawSettings(body);
  };
  const refresh = async () => { draw(null); try { draw(await scan({ silent: true })); } catch (e) { body.replaceChildren(h("p.err", e.message)); } };
  const off = bus.on("storage:changed", () => { if (el.isConnected) refresh(); });
  el._off = off;
  if (last && Date.now() - last.at < 60000) draw(last); else refresh();
  body.addEventListener("storage:rescan", refresh);
}

function drawSummary(body, s) {
  const dev = s.device || {}, used = s.total;
  const cats = [...s.cats].sort((a, b) => b.bytes - a.bytes);
  const bar = h("div.stor-bar", cats.filter((c) => c.bytes > 0).map((c) => h("span.stor-seg", { title: `${label(c.id)} · ${fmtBytes(c.bytes)}`, style: { width: Math.max(0.5, (c.bytes / Math.max(1, used)) * 100) + "%", background: CATS[c.id]?.color || "#888" } })));
  const clean = s.cats.filter((c) => c.cleanable).reduce((n, c) => n + c.bytes, 0);
  const safeIds = s.cats.filter((c) => c.cleanable && c.id !== "node-modules" && c.id !== "ai" && c.bytes > 0).map((c) => c.id);
  const safeBytes = s.cats.filter((c) => safeIds.includes(c.id)).reduce((n, c) => n + c.bytes, 0);
  body.append(h("section.set-sec.stor-sum",
    h("div.stor-total", h("span.stor-big", fmtBytes(used)), h("span.muted", ` used by CodeForge · ${s.files.toLocaleString()} files`)),
    bar,
    dev.total ? h("div.muted.stor-dev", `Device: ${fmtBytes(dev.free)} free of ${fmtBytes(dev.total)}`) : null,
    h("div.stor-actions",
      h("button.btn.primary", { disabled: !safeBytes, onclick: async () => {
        if (!(await ui.confirm(`Clear temporary files, caches, leftovers and old ZIP / bundle files (about ${fmtBytes(safeBytes)})? Your projects, settings and keys are not touched.`, { title: "Free up space", okLabel: "Clear" }))) return;
        await cleanIds(safeIds);
      } }, safeBytes ? `Free up ${fmtBytes(safeBytes)}` : "Nothing to clean"),
      h("button.btn", { onclick: () => body.dispatchEvent(new Event("storage:rescan")) }, "Rescan"),
      h("button.btn", { onclick: () => jobs.openCenter() }, "Background tasks"))));
  void clean;
}

function drawCats(body, s, redraw) {
  const sec = h("section.set-sec", h("h3", "What takes the space"));
  const nm = s.nodeModules?.length || 0;
  for (const c of [...s.cats].sort((a, b) => b.bytes - a.bytes)) {
    if (c.bytes <= 0 && !c.files) continue;
    const meta = CATS[c.id] || { label: c.id, desc: "", color: "#888", how: "" };
    const det = h("div.stor-items", { hidden: true });
    const row = h("div.stor-row",
      h("div.stor-head",
        h("span.stor-dot", { style: { background: meta.color } }),
        h("div.set-info", h("div.set-label", meta.label, h("span.muted.stor-n", ` · ${c.files.toLocaleString()} files`)), h("div.muted", meta.desc), h("div.muted.stor-how", meta.how)),
        h("div.stor-size", fmtBytes(c.bytes)),
        h("div.stor-btns",
          h("button.btn.small", { onclick: async () => { det.hidden = !det.hidden; if (!det.hidden && !det.dataset.loaded) { det.dataset.loaded = "1"; await loadItems(det, c.id, redraw); } } }, "Details"),
          c.cleanable ? h("button.btn.small" + (c.id === "ai" ? ".danger" : ""), { onclick: async () => {
            const extra = c.id === "node-modules" ? ` in ${nm} project folder${nm === 1 ? "" : "s"}` : "";
            if (!(await ui.confirm(`Clear “${meta.label}”${extra}? That frees about ${fmtBytes(c.bytes)}.\n${meta.how}`, { title: "Clear " + meta.label, okLabel: "Clear", danger: c.id === "ai" }))) return;
            await cleanIds([c.id]);
          } }, "Clear") : null,
          c.id === "linux-system" ? h("button.btn.small.danger", { onclick: async () => { const env = await import("../features/env.js"); await env.reset(); bus.emit("storage:changed"); } }, "Reset Linux") : null)),
      det);
    sec.append(row);
  }
  body.append(sec);
}

async function loadItems(box, id, redraw) {
  box.replaceChildren(ui.loaderBlock("Measuring…"));
  try {
    const items = await N.storage.items(id, 60);
    box.replaceChildren();
    if (!items.length) { box.append(h("div.muted.stor-empty", "Nothing here.")); return; }
    for (const it of items) {
      const row = h("div.stor-item", h("div.stor-iname", { title: it.path }, it.name || it.path), h("div.muted.stor-isize", fmtBytes(it.bytes)),
        h("button.btn.small.danger", { onclick: async () => {
          if (!(await ui.confirm(`Delete “${it.name}” (${fmtBytes(it.bytes)})? This cannot be undone.`, { title: "Delete", okLabel: "Delete", danger: true }))) return;
          const r = await jobs.run({ title: `Deleting ${it.name}`, kind: "storage", icon: "trash", silent: true, cancellable: false }, async () => N.storage.delete(it.path));
          if (r.ok) { ui.toast(`Deleted ${it.name}, freed ${fmtBytes(r.result?.freed || it.bytes)}`, { kind: "success" }); row.remove(); last = null; bus.emit("storage:changed"); }
        } }, "Delete"));
      box.append(row);
    }
    if (items.length >= 60) box.append(h("div.muted.stor-empty", "Showing the 60 biggest items."));
  } catch (e) { box.replaceChildren(h("div.err", e.message)); }
  void redraw;
}

function drawSettings(body) {
  const sw = (key) => { const el = h("div.switch" + (settings.get(key) ? ".on" : ""), { role: "switch", onclick: () => { const n = !settings.get(key); settings.set(key, n); el.classList.toggle("on", n); } }); return el; };
  const num = (key, min, max, step = 50) => h("input", { type: "number", value: settings.get(key), min, max, step, style: { width: "100px" }, onchange: (e) => settings.set(key, Math.max(min, +e.target.value || 0)) });
  const sel = (key, opts) => { const s = h("select", { onchange: () => settings.set(key, s.value) }, opts.map(([v, l]) => h("option", { value: v, selected: v === settings.get(key) }, l))); return s; };
  const row = (t, d, c) => h("div.set-row", h("div.set-info", h("div.set-label", t), h("div.muted", d)), c);
  body.append(h("section.set-sec", h("h3", "Control"),
    row("Export ZIP files to", "Where “Compress & export” puts the file. The Downloads folder needs no permission on Android 10 and later.", sel("storage.exportTo", [["downloads", "Downloads folder"], ["ask", "Ask every time"]])),
    row("Delete my copy of an opened ZIP", "After a ZIP is extracted as a project, remove CodeForge's own copy of the archive so it is not stored twice.", sw("storage.deleteImportedZip")),
    row("Clean automatically", "Runs when CodeForge starts. Never touches projects, settings or keys.", sel("storage.autoClean", [["off", "Never"], ["temp", "Temporary files + leftovers"], ["temp+caches", "Also package caches"]])),
    row("Warn when free space is below (MB)", "Before big downloads, imports and extractions.", num("storage.minFreeMB", 0, 100000, 100)),
    row("My storage limit (MB, 0 = none)", "You get a warning before an operation would pass this size.", num("storage.limitMB", 0, 1000000, 100))));
}
