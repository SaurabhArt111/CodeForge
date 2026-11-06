// "Open Folder" file browser: storage roots, breadcrumbs, create folder, ZIP open, SAF import (Android file picker).
import { N } from "../core/bridge.js";
import { settings } from "../core/settings.js";
import { ws } from "./workspace.js";
import { h, icon, P, fmtBytes, relTime } from "../core/util.js";
import { modal, prompt, toast, toastError, busy, confirm } from "../core/ui.js";
import * as icons from "../features/icons.js";
import { askZipOptions } from "./zipdialog.js";

let info = null;
export const setInfo = (i) => (info = i);

/** Generic browser. mode: "folder" (choose dir) | "file" (choose file) | "save" (choose dir + name). Returns a path or undefined. */
export async function browse({ mode = "folder", title = "Open Folder", start, okLabel, filter, saveName = "" } = {}) {
  const roots = await N.sys.storageRoots();
  const hasAll = await N.sys.hasAllFiles().catch(() => true);
  let cwd = start || (ws.root ? P.dir(ws.root) : roots[0]?.path) || "/";
  let showHidden = settings.state.browseHidden ?? false;
  let sortBy = "name";
  let selectedFile = null;
  let result;

  const crumbs = h("div.ofd-crumbs"), list = h("div.ofd-list"), rootsEl = h("div.ofd-roots");
  const nameInput = mode === "save" ? h("input.input", { value: saveName, placeholder: "File name" }) : null;
  const status = h("div.muted", { style: { fontSize: "calc(12px * var(--fz))", padding: "2px 0" } });
  let closeFn;

  const banner = !hasAll ? h("div.ofd-banner", h("span", "Grant “All files access” to browse Downloads, Documents and SD card like a normal file manager."),
    h("button.btn.small.primary", { onclick: async () => { await N.sys.requestAllFiles(); toast("Enable the switch, then come back to CodeForge", { timeout: 4000 }); } }, "Grant")) : null;

  async function go(path) {
    try {
      const items = await N.fs.list(path);
      cwd = path; selectedFile = null;
      render(items);
    } catch (e) { toastError(e); }
  }
  function render(items) {
    // roots
    rootsEl.replaceChildren(...roots.map((r) => h("button.chip.ofd-root" + (P.inside(r.path, cwd) ? ".on" : ""), { onclick: () => go(r.path), title: `${fmtBytes(r.free)} free of ${fmtBytes(r.total)}` }, icon(r.id === "workspace" ? "home" : r.removable ? "device-camera" : "folder"), r.label)));
    // crumbs
    const root = roots.filter((r) => P.inside(r.path, cwd)).sort((a, b) => b.path.length - a.path.length)[0];
    const parts = []; let acc = root ? root.path : "/";
    parts.push([root ? root.label.split(" (")[0] : "/", acc]);
    for (const seg of P.rel(acc, cwd).split("/").filter(Boolean)) { acc = P.join(acc, seg); parts.push([seg, acc]); }
    crumbs.replaceChildren(...parts.flatMap(([n, p], i) => [i ? h("span.muted", "›") : null, h("button.ofd-crumb", { onclick: () => go(p) }, n)]).filter(Boolean));
    crumbs.scrollLeft = crumbs.scrollWidth;
    // list
    let rows = items.map((it) => ({ ...it, isDir: it.t === "d" || (it.t === "l" && it.ld) })).filter((it) => showHidden || !it.n.startsWith("."));
    rows.sort((a, b) => (a.isDir !== b.isDir ? (a.isDir ? -1 : 1) : sortBy === "date" ? b.m - a.m : sortBy === "size" ? b.s - a.s : a.n.localeCompare(b.n, undefined, { numeric: true, sensitivity: "base" })));
    const out = [];
    if (cwd !== "/") out.push(h("div.row.ofd-row", { onclick: () => go(P.dir(cwd)) }, h("span.chev"), icon("arrow-up", "fi"), h("span.label", ".. (up)")));
    for (const it of rows) {
      const p = P.join(cwd, it.n);
      const ok = it.isDir || mode === "file" && (!filter || filter(it)) || mode !== "file";
      const row = h("div.row.ofd-row" + (!it.isDir && !(mode === "file" && (!filter || filter(it))) ? ".dim" : ""),
        { onclick: () => { if (it.isDir) go(p); else if (mode === "file" && (!filter || filter(it))) { selectedFile = p; out.forEach((r) => r.classList?.remove("selected")); row.classList.add("selected"); updateOk(); } else if (/\.(zip)$/i.test(it.n) && mode === "folder") { result = { zip: p }; closeFn(); } },
          ondblclick: () => { if (!it.isDir && mode === "file" && (!filter || filter(it))) { result = p; closeFn(); } } },
        h("span.chev"), it.isDir ? icons.folderIcon(it.n, false) : icons.fileIcon(it.n), h("span.label", it.n), h("span.meta", it.isDir ? "" : fmtBytes(it.s)), h("span.meta", { style: { width: "70px", textAlign: "right" } }, relTime(it.m)));
      out.push(row);
      void ok;
    }
    if (!rows.length) out.push(h("div.empty-state", "Empty folder"));
    list.replaceChildren(...out);
    status.textContent = `${rows.filter((r) => r.isDir).length} folders, ${rows.filter((r) => !r.isDir).length} files`;
    updateOk();
  }
  const okBtn = h("button.btn.primary", { onclick: () => { result = mode === "file" ? selectedFile : mode === "save" ? P.join(cwd, nameInput.value.trim()) : cwd; if (mode === "file" && !result) return; if (mode === "save" && !nameInput.value.trim()) return; closeFn(); } }, okLabel || (mode === "file" ? "Select" : mode === "save" ? "Save here" : "Select this folder"));
  function updateOk() { okBtn.disabled = mode === "file" && !selectedFile; if (mode === "folder") okBtn.textContent = `Open “${P.base(cwd) || "/"}”`; }

  const toolbar = h("div.ofd-tools",
    h("button.icon-btn", { title: "New folder", onclick: async () => { const n = await prompt("New folder", { okLabel: "Create" }); if (!n) return; try { await N.fs.mkdir(P.join(cwd, n)); go(cwd); } catch (e) { toastError(e); } } }, icon("new-folder")),
    h("button.icon-btn", { title: "Show hidden files", onclick: (e) => { showHidden = !showHidden; settings.state.browseHidden = showHidden; settings.saveState(); e.currentTarget.classList.toggle("on", showHidden); go(cwd); } }, icon("eye")),
    h("button.icon-btn", { title: "Sort", onclick: () => { sortBy = sortBy === "name" ? "date" : sortBy === "date" ? "size" : "name"; toast("Sorted by " + sortBy, { timeout: 900 }); go(cwd); } }, icon("sort-precedence")),
    h("button.icon-btn", { title: "Refresh", onclick: () => go(cwd) }, icon("refresh")));

  const importBar = mode === "folder" || mode === "file" ? h("div.ofd-import",
    h("button.btn.small", { onclick: async () => { const r = await importFolderFromDevice(); if (r) { result = r; closeFn(); } } }, icon("cloud-download"), " Import folder from device…"),
    h("button.btn.small", { onclick: async () => { const r = await importFilesFromDevice(mode === "folder" ? ["application/zip", "application/x-zip-compressed"] : null); if (r) { if (mode === "folder") result = { zip: r[0] }; else result = r[0]; closeFn(); } } }, icon("file-zip"), mode === "folder" ? " Import ZIP…" : " Import file…")) : null;

  await modal({
    title, className: "wide tall ofd", width: 720,
    body: h("div.ofd-body", banner, rootsEl, h("div.ofd-nav", crumbs, toolbar), list, nameInput ? h("div", { style: { padding: "6px 0" } }, nameInput) : null, importBar, status),
    buttons: [{ label: "Cancel", value: undefined }, { custom: true }].slice(0, 1),
    onOpen: ({ close, root }) => { closeFn = () => close(true); root.querySelector(".modal-foot").append(okBtn); go(cwd); },
  });
  return result;
}

// ---------------------------------------------------------------- Android Storage Access Framework helpers
export function importDir() { return P.join(info.paths.home, "imported"); }

export async function importFolderFromDevice() {
  let picked;
  try { picked = await N.sys.pickFolder(); } catch (e) { toastError(e); return null; }
  if (!picked) return null;
  const dest = P.join(importDir(), await uniqueIn(importDir(), picked.name || "folder"));
  const b = busy(`Importing “${picked.name}”…`);
  const off = N.on("archive.progress", (d) => b.update(`Importing “${picked.name}”… ${d.count} files`));
  try { await N.fs.mkdir(dest); const r = await N.sys.importTree(picked.uri, dest); toast(`Imported ${r.count} files into the workspace`, { kind: "success" }); return dest; }
  catch (e) { toastError(e); return null; }
  finally { off(); b.close(); }
}

export async function importFilesFromDevice(mimes, dest = importDir()) {
  let r;
  try { r = await N.sys.pickFile({ multiple: false, mimes: mimes || undefined }); } catch (e) { toastError(e); return null; }
  if (!r?.files?.length) return null;
  await N.fs.mkdir(dest);
  const out = [];
  const b = busy("Importing…");
  try { for (const f of r.files) { b.update(`Importing ${f.name}…`); const res = await N.sys.importUri(f.uri, dest); out.push(res.path); } return out; }
  catch (e) { toastError(e); return null; } finally { b.close(); }
}

async function uniqueIn(dir, name) { let n = name, i = 2; while (await N.fs.exists(P.join(dir, n))) n = `${name} ${i++}`; return n; }

/** Extract a ZIP into <imported>/<zipname> and return the project folder. */
export async function openZipAsProject(zipPath) {
  const name = await uniqueIn(importDir(), P.stem(zipPath).replace(/\.tar$/, ""));
  const dest = P.join(importDir(), name);
  const b = busy(`Extracting ${P.base(zipPath)}…`);
  const off = N.on("archive.progress", (d) => b.update(`Extracting ${P.base(zipPath)}… ${d.count ?? ""}`));
  try { await ws.extractArchive(zipPath, dest); await ws.flattenSingleRoot(dest); return dest; }
  catch (e) { toastError(e); return null; } finally { off(); b.close(); }
}

/** Export a workspace folder to a user-picked location via the system picker. */
export async function exportFolderToDevice(folder) {
  const o = await askZipOptions({ name: P.base(folder), paths: [folder], title: "Export project to device", okLabel: "Choose destination…", askName: false }); if (!o) return;
  let picked; try { picked = await N.sys.pickFolder(); } catch (e) { return toastError(e); }
  if (!picked) return;
  const b = busy("Exporting…");
  try { const r = await N.sys.exportTree(folder, picked.uri, o.exclude); toast(`Exported ${r.count} files`, { kind: "success" }); } catch (e) { toastError(e); } finally { b.close(); }
}
export async function exportFileToDevice(file) {
  let c; try { c = await N.sys.createFile({ name: P.base(file) }); } catch (e) { return toastError(e); }
  if (!c) return;
  try { await N.sys.exportFile(file, c.uri); toast(`Saved ${c.name || P.base(file)}`, { kind: "success" }); } catch (e) { toastError(e); }
}

/** Entry menu used by the "Open Folder…" button. Returns nothing; opens the chosen project via callback. */
export async function chooseProject({ openFolder }) {
  const r = await browse({ mode: "folder", title: "Open Folder", start: settings.state.lastBrowse || (ws.root ? P.dir(ws.root) : undefined) });
  if (!r) return;
  if (typeof r === "object" && r.zip) { const d = await openZipAsProject(r.zip); if (d) openFolder(d); return; }
  settings.state.lastBrowse = P.dir(r); settings.saveState();
  openFolder(r);
}
