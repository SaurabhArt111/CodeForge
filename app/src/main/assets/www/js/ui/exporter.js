// "Compress & export": zips folders / files straight into the device's Downloads folder as a background task (progress, cancel,
// notification when done). No staging copy, and the temporary ZIP is removed again whatever happens.
import { N, mode as bridgeMode } from "../core/bridge.js";
import { settings } from "../core/settings.js";
import { P } from "../core/util.js";
import * as jobs from "../core/jobs.js";
import * as security from "./security.js";
import * as storage from "./storage.js";
import { askZipOptions } from "./zipdialog.js";

let dataDir = null;
async function tmpDir() { if (!dataDir) dataDir = (await N.sys.info().catch(() => ({}))).paths?.data || "/data"; return P.join(dataDir, "export-tmp"); }

const safeName = (n) => (n || "export").replace(/[\\/:*?"<>|]+/g, "_").replace(/^\.+/, "") || "export";

/** Zips `entries` ([{src, as}]) to a temp file and puts the result in Downloads. Returns { name, path, size } or null. */
export async function zipToDownloads(entries, name, { exclude = [], title, mime = "application/zip", cleanup = [] } = {}) {
  name = safeName(/\.(zip|cfbundle)$/i.test(name) ? name : name + ".zip");
  const tmp = P.join(await tmpDir(), Date.now().toString(36) + "-" + name);
  const r = await jobs.run({ title: title || `Compressing ${name}`, kind: "export", icon: "file-zip", openDownloads: true, doneText: `Saved ${name} to Downloads`,
    next: { label: "Open Downloads", run: () => N.sys.openDownloads().catch(() => {}) } }, async (job) => {
    job.watchFiles("Compressing");
    job.update("Preparing…", -1);
    try {
      await N.archive.zip({ entries, dest: tmp, exclude, job: job.id });
      if (job.cancelRequested) throw new Error("Cancelled");
      const via = settings.get("storage.exportTo");
      if (via === "ask") {                                           // the user wants the system “Save as” picker
        const c = await N.sys.createFile({ name }); if (!c) throw new Error("Cancelled");
        job.update("Saving…", -1); await N.sys.exportFile(tmp, c.uri); await removeQuiet(tmp);
        job.doneText = `Saved ${c.name || name}`; return { name: c.name || name, path: c.name || name };
      }
      job.watchBytes("Saving to Downloads");
      try {
        const res = await N.export.toDownloads({ src: tmp, name, mime, job: job.id, deleteSrc: true });
        job.doneText = bridgeMode === "android" ? `Saved to ${res.path}` : `Saved ${res.name}`; return res;
      } catch (e) {
        if (!/Security|permission|denied/i.test(e.message || "")) throw e;
        // old Android without write access to Downloads: fall back to the system picker instead of failing
        job.update("Choose where to save…", -1);
        const c = await N.sys.createFile({ name }); if (!c) throw new Error("Cancelled");
        await N.sys.exportFile(tmp, c.uri); job.doneText = `Saved ${c.name || name}`; return { name: c.name || name, path: c.name || name };
      }
    } finally { await removeQuiet(tmp); for (const c of cleanup) await removeQuiet(c); }
  });
  if (!r.ok) return null;
  return r.result;
}
async function removeQuiet(p) { try { await N.fs.rm(p, true); } catch { /* already gone, or the Storage manager clears leftovers later */ } }

/** The dialog + job behind every “Compress & export” button. `paths` = folders and / or files. */
export async function compressAndExport(paths, { name, title = "Compress & export" } = {}) {
  paths = [...new Set(paths)].filter(Boolean); if (!paths.length) return null;
  if (!(await security.guard("Confirm to export your project", "security.authExport"))) return null;
  const nm = name || (paths.length === 1 ? P.base(paths[0]) || "project" : "CodeForge-export");
  const o = await askZipOptions({ name: /\.zip$/i.test(nm) ? nm : nm + ".zip", paths, title, okLabel: "Compress & export" }); if (!o) return null;
  if (!(await storage.ensure(0, "this ZIP"))) return null;
  const entries = paths.map((p) => ({ src: p, as: P.base(p) }));
  return zipToDownloads(entries, o.name, { exclude: o.exclude });
}

/** For menus: [{label, icon, run}] */
export const exportLabel = () => (settings.get("storage.exportTo") === "ask" ? "Compress & export…" : "Compress & export to Downloads…");
