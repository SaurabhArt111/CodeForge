// Move your work between CodeForge on the web and CodeForge on Android: a ".cfbundle" (a ZIP) holding projects + settings.
//   export: choose projects (and what to leave out) → one file you save / download
//   import: pick a .cfbundle → projects land in the "imported" folder, settings are merged after you confirm
// API keys are NOT part of a bundle (they are encrypted per device) – add them once in AI settings on the other side.
import { N } from "../core/bridge.js";
import { settings, DEFAULTS } from "../core/settings.js";
import { h, icon, P } from "../core/util.js";
import { modal, toast, toastError, busy } from "../core/ui.js";
import { askZipOptions } from "./zipdialog.js";
import * as of from "./openfolder.js";
import { mode as bridgeMode } from "../core/bridge.js";

export const FORMAT = 1;
const SETTING_PREFIXES = ["editor.", "terminal.", "files.", "ui.", "git.user", "ai.provider", "ai.model", "ai.temperature", "ai.rules", "ai.autoApply", "ai.agentConfirm", "ai.systemPrompt", "preview."];
const portable = (k) => k in DEFAULTS && SETTING_PREFIXES.some((p) => k.startsWith(p)) && !/^ui\.(fontScale)$/.test(k);

async function listProjects(info) {
  const out = [];
  const add = async (dir) => { let items = []; try { items = await N.fs.list(dir); } catch { return; } for (const it of items) if ((it.t === "d" || (it.t === "l" && it.ld)) && !it.n.startsWith(".") && !["imported", "node_modules"].includes(it.n)) out.push({ name: it.n, path: P.join(dir, it.n) }); };
  await add(info.paths.home); await add(P.join(info.paths.home, "imported"));
  const seen = new Set(); return out.filter((p) => !seen.has(p.name) && seen.add(p.name));
}
const stamp = () => new Date().toISOString().slice(0, 10);

/** Build a bundle and hand it to the user (browser download / Android save dialog). */
export async function exportBundle() {
  const info = await N.sys.info(); const projects = await listProjects(info);
  const sel = new Set(projects.map((p) => p.name)); let withSettings = true;
  const el = h("div.xfer-top",
    h("p.modal-text", `Pack your work into one file to open in CodeForge on ${bridgeMode === "android" ? "the web" : "your Android phone or tablet"}.`),
    h("div.xfer-title", "Projects"),
    h("div.zip-list", ...(projects.length ? projects.map((p) => { const cb = h("input", { type: "checkbox", checked: true, onchange: () => (cb.checked ? sel.add(p.name) : sel.delete(p.name)) }); return h("label.zip-row", cb, h("span.zip-text", h("span.zip-name", p.name), h("span.muted.zip-note", P.rel(info.paths.home, p.path))));}) : [h("div.pj-empty", "No projects yet — create or import one first.")])),
    h("label.zip-row.xfer-set", h("input", { type: "checkbox", checked: true, onchange: (e) => (withSettings = e.target.checked) }), h("span.zip-text", h("span.zip-name", "Settings"), h("span.muted.zip-note", "Theme, fonts, editor and terminal options, Git name & email. API keys are never included."))));
  const o = await askZipOptions({ name: `CodeForge-${stamp()}.cfbundle`, paths: projects.filter((p) => sel.has(p.name)).map((p) => p.path), title: "Transfer to another CodeForge", okLabel: "Create bundle", before: { el, collect: () => ({ names: [...sel], withSettings }) } });
  if (!o) return;
  const names = o.extra.names; if (!names.length && !o.extra.withSettings) return toast("Nothing selected", { kind: "warn" });
  const b = busy("Packing…");
  const stage = P.join(info.paths.data, "transfer-stage"); const bundle = P.join(info.paths.data, o.name.replace(/\.zip$/i, ""));
  try {
    await N.fs.rm(stage).catch(() => {}); await N.fs.rm(bundle).catch(() => {}); await N.fs.mkdir(P.join(stage, "projects"));
    for (const n of names) { const p = projects.find((x) => x.name === n); b.update(`Packing ${n}…`); await N.fs.copy(p.path, P.join(stage, "projects", n)); }
    if (o.extra.withSettings) { const s = {}; for (const k of Object.keys(settings.values)) if (portable(k) && settings.values[k] !== DEFAULTS[k]) s[k] = settings.values[k]; await N.fs.writeText(P.join(stage, "settings.json"), JSON.stringify(s, null, 2)); }
    await N.fs.writeText(P.join(stage, "manifest.json"), JSON.stringify({ format: FORMAT, app: "codeforge", from: bridgeMode === "android" ? "android" : "web", version: info.version, createdAt: new Date().toISOString(), projects: names, settings: !!o.extra.withSettings }, null, 2));
    b.update("Compressing…");
    const r = await N.archive.zip({ src: [P.join(stage, "manifest.json"), ...(o.extra.withSettings ? [P.join(stage, "settings.json")] : []), P.join(stage, "projects")], dest: bundle, base: stage, exclude: o.exclude });
    toast(`Bundle ready (${r.count} files)`, { kind: "success" });
    if (bridgeMode === "android") await of.exportFileToDevice(bundle); else await N.sys.exportFile(bundle);
    return bundle;
  } catch (e) { toastError(e); } finally { await N.fs.rm(stage).catch(() => {}); b.close(); }
}

/** Open a bundle: `path` (already on this device) or ask for one. `openFolder` is called with the first imported project. */
export async function importBundle({ path, openFolder, confirmDialog = true } = {}) {
  const info = await N.sys.info();
  if (!path) { const r = await of.importFilesFromDevice(null, P.join(info.paths.data, "incoming")); path = r?.[0]; }
  if (!path) return;
  const tmp = P.join(info.paths.data, "transfer-in");
  const b = busy("Reading bundle…");
  try {
    await N.fs.rm(tmp).catch(() => {}); await N.archive.unzip({ src: path, dest: tmp });
    let man; try { man = JSON.parse((await N.fs.readText(P.join(tmp, "manifest.json"))).text); } catch { throw new Error("This is not a CodeForge bundle (manifest.json is missing)."); }
    if (man.app !== "codeforge" || man.format > FORMAT) throw new Error("This bundle was made by a newer CodeForge. Update the app and try again.");
    let sets = {}; try { sets = JSON.parse((await N.fs.readText(P.join(tmp, "settings.json"))).text || "{}"); } catch { /* no settings in bundle */ }
    const keys = Object.keys(sets).filter(portable);
    b.close();
    if (confirmDialog) {
      const ok = await modal({ title: "Import CodeForge bundle", width: 480, body: h("div", h("p.modal-text", `From ${man.from || "another CodeForge"} · ${new Date(man.createdAt).toLocaleString()}`),
        h("div.xfer-title", `${man.projects.length} project${man.projects.length === 1 ? "" : "s"}`), h("ul.ai-apply-list", ...man.projects.map((n) => h("li", n))),
        keys.length ? h("p.modal-text", `${keys.length} setting${keys.length === 1 ? "" : "s"} will be applied (theme, fonts, editor…).`) : null,
        h("p.muted", "Projects are copied next to your other imported folders; nothing is overwritten.")), buttons: [{ label: "Cancel", value: false }, { label: "Import", primary: true, value: true }] });
      if (ok !== true) return;
    }
    const b2 = busy("Importing…"); const dest0 = of.importDir(); let first = null;
    try {
      await N.fs.mkdir(dest0);
      for (const n of man.projects) {
        let name = n, i = 2; while (await N.fs.exists(P.join(dest0, name))) name = `${n} ${i++}`;
        b2.update(`Importing ${n}…`); await N.fs.copy(P.join(tmp, "projects", n), P.join(dest0, name)); first ||= P.join(dest0, name);
      }
      for (const k of keys) settings.set(k, sets[k]);
    } finally { b2.close(); }
    toast(`Imported ${man.projects.length} project${man.projects.length === 1 ? "" : "s"}${keys.length ? " and settings" : ""}`, { kind: "success" });
    if (first && openFolder) openFolder(first);
    return { projects: man.projects, settings: keys.length };
  } catch (e) { toastError(e); } finally { b.close(); await N.fs.rm(tmp).catch(() => {}); }
}
