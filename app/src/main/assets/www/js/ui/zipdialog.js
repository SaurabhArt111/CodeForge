// "Compress to ZIP" / "Export project" options: choose what to leave out (node_modules, .git, .github, virtualenvs, build output …).
import { N } from "../core/bridge.js";
import { settings } from "../core/settings.js";
import { h, icon, P } from "../core/util.js";
import { modal } from "../core/ui.js";

export const PRESETS = [
  { id: "node", label: "node_modules", note: "npm / yarn / pnpm packages", pats: ["node_modules"], on: true },
  { id: "git", label: ".git", note: "Git history (the zip is no longer a repository)", pats: [".git"], on: true },
  { id: "github", label: ".github", note: "Workflows, issue templates", pats: [".github"], on: false },
  { id: "venv", label: "Python environments & caches", note: ".venv, venv, env, __pycache__, *.pyc", pats: [".venv", "venv", "env", "__pycache__", "*.pyc", ".pytest_cache", ".mypy_cache"], on: true },
  { id: "build", label: "Build output", note: "dist, build, out, target, .next, .nuxt, .gradle, .turbo", pats: ["dist", "build", "out", "target", ".next", ".nuxt", ".gradle", ".turbo", ".parcel-cache"], on: false },
  { id: "cache", label: "Caches", note: ".cache, .npm, .yarn/cache, coverage", pats: [".cache", ".npm", "coverage", ".nyc_output"], on: false },
  { id: "ide", label: "Editor settings", note: ".idea, .vscode", pats: [".idea", ".vscode"], on: false },
  { id: "junk", label: "System files & logs", note: ".DS_Store, Thumbs.db, *.log", pats: [".DS_Store", "Thumbs.db", "*.log"], on: true },
];

/** Which preset folders exist near the top of the given folders (two levels deep, never inside the excluded folders themselves). */
async function detect(paths) {
  const found = new Set(); const all = new Map(PRESETS.flatMap((p) => p.pats.map((x) => [x, p.id])));
  const scan = async (dir, depth) => {
    let items = []; try { items = await N.fs.list(dir); } catch { return; }
    for (const it of items) {
      const id = all.get(it.n); const isDir = it.t === "d" || (it.t === "l" && it.ld);
      if (id) { found.add(id); continue; }
      if (!id && /\.(log|pyc)$/.test(it.n)) { found.add(it.n.endsWith(".log") ? "junk" : "venv"); continue; }
      if (isDir && depth < 2 && !it.n.startsWith(".")) await scan(P.join(dir, it.n), depth + 1);
    }
  };
  for (const p of paths) await scan(p, 0);
  return found;
}

/** Returns { name, exclude: string[], extra } or undefined when cancelled. `before` = { el, collect() } adds your own controls above the exclusions. */
export async function askZipOptions({ name, paths, title = "Compress to ZIP", okLabel = "Compress", askName = true, before = null }) {
  const saved = settings.state.zipExclude;        // { ids: [...], extra: "..." }
  const on = new Set(saved?.ids || PRESETS.filter((p) => p.on).map((p) => p.id));
  const input = askName ? h("input.input", { value: name, spellcheck: false, autocapitalize: "off" }) : null;
  const extra = h("input.input", { value: saved?.extra || "", placeholder: "More names to skip, comma separated (e.g. tmp, *.bak)", spellcheck: false, autocapitalize: "off" });
  const summary = h("div.muted.zip-summary");
  const rows = new Map();
  const upd = () => { summary.textContent = on.size ? `Leaves out ${on.size} kind${on.size === 1 ? "" : "s"} of folders/files${extra.value.trim() ? " + your list" : ""}.` : (extra.value.trim() ? "Leaves out only your list." : "Everything is included."); for (const [id, r] of rows) r.cb.checked = on.has(id); };
  const list = h("div.zip-list", ...PRESETS.map((p) => {
    const cb = h("input", { type: "checkbox", checked: on.has(p.id), onchange: () => { cb.checked ? on.add(p.id) : on.delete(p.id); upd(); } });
    const found = h("span.zip-found.hidden", "in this project");
    const row = h("label.zip-row", cb, h("span.zip-text", h("span.zip-name", p.label), h("span.muted.zip-note", p.note)), found);
    rows.set(p.id, { cb, found }); return row;
  }));
  const quick = h("div.zip-quick",
    h("button.btn.small", { type: "button", onclick: () => { on.clear(); extra.value = ""; upd(); } }, "Include everything"),
    h("button.btn.small", { type: "button", onclick: () => { on.clear(); PRESETS.filter((p) => p.on).forEach((p) => on.add(p.id)); upd(); } }, "Recommended"),
    h("button.btn.small", { type: "button", onclick: () => { PRESETS.forEach((p) => on.add(p.id)); upd(); } }, "Skip all of these"));
  extra.addEventListener("input", upd);
  upd();
  detect(paths).then((f) => { for (const id of f) rows.get(id)?.found.classList.remove("hidden"); }).catch(() => {});
  const r = await modal({
    title, width: 520, className: "zipdlg",
    body: h("div", before?.el || null, input ? h("div.zip-field", h("label.muted", "File name"), input) : null, h("p.modal-text", "Choose what to leave out of the ZIP:"), quick, list, h("div.zip-field", extra), summary),
    buttons: [{ label: "Cancel", value: undefined }, { label: okLabel, primary: true, value: "__ok", onClick: () => (!askName || !!input.value.trim()) }],
  });
  if (r !== "__ok") return undefined;
  const exclude = [...PRESETS.filter((p) => on.has(p.id)).flatMap((p) => p.pats), ...extra.value.split(",").map((s) => s.trim()).filter(Boolean)];
  settings.state.zipExclude = { ids: [...on], extra: extra.value.trim() }; settings.saveState();
  let nm = input?.value.trim() || name; if (askName && !/\.zip$/i.test(nm)) nm += ".zip";
  return { name: nm, exclude, extra: before?.collect?.() };
}
