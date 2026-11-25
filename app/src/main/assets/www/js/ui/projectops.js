// Closing and deleting projects. Deleting is a destructive action, so when a PIN is set it is asked for every time.
import { N } from "../core/bridge.js";
import { settings } from "../core/settings.js";
import { confirm, toast } from "../core/ui.js";
import { P } from "../core/util.js";
import * as jobs from "../core/jobs.js";
import * as security from "./security.js";
import { ws } from "./workspace.js";

const norm = (p) => (p || "").replace(/\/+$/, "") || "/";
const inside = (child, parent) => norm(child) === norm(parent) || norm(child).startsWith(norm(parent) + "/");

/** True when CodeForge may delete this folder itself (it lives in CodeForge's private storage, not in shared device storage). */
export async function canDelete(path) {
  try { const info = await N.sys.info(); const roots = [info.paths.home, info.paths.data].filter(Boolean); return roots.some((r) => inside(path, r)) && norm(path) !== norm(info.paths.home); }
  catch { return false; }
}

/**
 * Deletes a project folder after confirmation (+ PIN when one is set). Folders outside CodeForge's storage cannot be deleted
 * from here; they are only removed from the recent list.
 * `closeCurrent()` closes the open folder first (the project being deleted may be the open one).
 * Resolves true when something was deleted or removed.
 */
export async function deleteProject(path, { closeCurrent } = {}) {
  const name = P.base(path) || path;
  if (!(await canDelete(path))) {
    if (!(await confirm(`“${name}” is stored outside CodeForge, so CodeForge will not delete its files. Remove it from the recent list instead?`, { title: "Remove from list", okLabel: "Remove" }))) return false;
    if (ws.root && inside(ws.root, path) && closeCurrent) await closeCurrent();
    settings.removeRecent(path); toast(`Removed ${name} from the list. Its files were not touched.`, { kind: "success" }); return true;
  }
  const open = ws.root && inside(ws.root, path);
  if (!(await confirm(`Delete “${name}” and everything inside it? This cannot be undone.${open ? " The folder is open now and will be closed first." : ""} Export it first if you may need it again.`, { title: "Delete project", okLabel: "Delete", danger: true }))) return false;
  if (!(await security.requirePin(`Enter your PIN to delete “${name}”`))) { toast("Deletion cancelled", { kind: "info" }); return false; }
  if (open && closeCurrent) { await closeCurrent(); if (ws.root && inside(ws.root, path)) return false; }   // unsaved changes + the user said no
  const r = await jobs.run({ title: `Deleting ${name}`, kind: "storage", icon: "trash", silent: true, cancellable: false }, () => N.storage.delete(path));
  if (!r.ok) { toast(`Could not delete ${name}: ${r.error || "unknown error"}`, { kind: "error" }); return false; }
  settings.removeRecent(path); toast(`Deleted ${name}`, { kind: "success" }); return true;
}
