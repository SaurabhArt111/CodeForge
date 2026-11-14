// "Open Folder" home: your projects at a glance (recent ones with type + last opened, folders in CodeForge storage) and every way to get a project in.
import { N } from "../core/bridge.js";
import { settings } from "../core/settings.js";
import { h, icon, P, relTime } from "../core/util.js";
import { modal, contextMenu, confirm, toast } from "../core/ui.js";
import * as icons from "../features/icons.js";
import * as of from "./openfolder.js";
import * as exporter from "./exporter.js";
import * as jobs from "../core/jobs.js";

const MARKERS = [
  ["package.json", "Node"], ["index.html", "Web"], ["pubspec.yaml", "Flutter"], ["pom.xml", "Java"], ["build.gradle", "Gradle"], ["build.gradle.kts", "Gradle"],
  ["requirements.txt", "Python"], ["pyproject.toml", "Python"], ["Cargo.toml", "Rust"], ["go.mod", "Go"], ["composer.json", "PHP"], ["Gemfile", "Ruby"], [".git", "Git"],
];
const short = (p, n = 46) => (p.length <= n ? p : "…" + p.slice(-(n - 1)));

async function describe(path) {
  const tags = new Set(); let items = [];
  try { items = await N.fs.list(path); } catch { return { tags: [], missing: true, count: 0 }; }
  const names = new Set(items.map((i) => i.n));
  for (const [f, t] of MARKERS) if (names.has(f)) tags.add(t);
  if (names.has("package.json")) {
    try {
      const r = await N.fs.readText(P.join(path, "package.json"), { max: 60000 });
      const d = JSON.parse(r.text || "{}"), deps = { ...d.dependencies, ...d.devDependencies };
      for (const [k, t] of [["next", "Next.js"], ["react", "React"], ["vue", "Vue"], ["svelte", "Svelte"], ["vite", "Vite"], ["express", "Express"], ["typescript", "TypeScript"]]) if (deps[k]) tags.add(t);
    } catch { /* unreadable package.json */ }
  }
  return { tags: [...tags].slice(0, 5), count: items.length, missing: false };
}

async function storageProjects(info) {
  const out = [];
  const add = async (dir) => {
    let items = []; try { items = await N.fs.list(dir); } catch { return; }
    for (const it of items) if ((it.t === "d" || (it.t === "l" && it.ld)) && !it.n.startsWith(".") && !["imported", "node_modules", "cf", "tmp"].includes(it.n)) out.push({ path: P.join(dir, it.n), at: it.m });
  };
  await add(info.paths.home); await add(P.join(info.paths.home, "imported")); await add(P.join(info.paths.home, "projects"));
  // the "CodeForge" folder in the device's shared storage (visible in the Files app): projects kept there are listed too
  try { const sh = (await N.sys.storageRoots()).find((r) => r.id === "shared"); if (sh) { const n0 = out.length; await add(sh.path); for (let i = n0; i < out.length; i++) out[i].shared = true; } } catch { /* no shared folder */ }
  return out.filter((x) => P.base(x.path) !== "projects" || P.dir(x.path) !== info.paths.home.replace(/\/+$/, ""));
}

export async function chooseProject({ openFolder, handlers }) {
  const info = await N.sys.info();
  let result = null, closeFn = () => {};
  const done = (v) => { result = v; closeFn(); };
  const search = h("input.input", { placeholder: "Search projects", type: "search", spellcheck: false, autocapitalize: "off" });
  const listEl = h("div.pj-list");
  // "home" and "imported" are the folders that HOLD your projects, not projects themselves: tapping them goes inside instead of opening the whole thing
  const norm = (p) => p.replace(/\/+$/, "") || "/";
  const homeDir = norm(info.paths.home), importedDir = P.join(homeDir, "imported");
  const containers = [{ path: homeDir, label: "Home", note: "Everything CodeForge keeps on this device" }, { path: importedDir, label: "Imported", note: "Folders and ZIPs you brought in" }];
  const isContainer = (p) => containers.some((c) => c.path === norm(p));
  const goInside = async (path) => { await N.fs.mkdir(path).catch(() => {}); /* "imported" only exists after the first import */ const r = await of.browse({ mode: "folder", title: "Choose a project folder", start: path }); if (r) done(typeof r === "object" ? { zip: r.zip } : { open: r }); };
  const recent = settings.state.recent.filter((p) => !isContainer(p)).map((p) => ({ path: p, at: settings.state.recentAt?.[p] || 0, recent: true }));
  const known = new Set(recent.map((r) => r.path));
  let stored = [];
  const meta = new Map();

  const card = (p) => {
    const m = meta.get(p.path);
    const badges = h("span.pj-tags", ...(m?.tags || []).map((t) => h("span.pj-tag", t)), m?.missing ? h("span.pj-tag.warn", "folder not found") : null);
    const sub = h("div.pj-sub", h("span.pj-path", short(p.path)), p.at ? h("span", " · " + (p.recent ? "opened " : "modified ") + relTime(p.at)) : null);
    const more = h("button.icon-btn", { title: "More", onclick: (e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); menu(p, r.left, r.bottom); } }, icon("ellipsis"));
    return h("div.pj-card" + (m?.missing ? ".missing" : ""), { onclick: () => !m?.missing && done({ open: p.path }), oncontextmenu: (e) => { e.preventDefault(); menu(p, e.clientX, e.clientY); } },
      h("span.pj-ico", icons.folderIcon(P.base(p.path), false)), h("div.pj-main", h("div.pj-name", P.base(p.path) || p.path), sub, badges), more);
  };
  function menu(p, x, y) {
    contextMenu([
      { label: "Open", icon: "folder-opened", run: () => done({ open: p.path }) },
      { label: "Browse inside…", icon: "list-tree", run: async () => { const r = await of.browse({ mode: "folder", title: "Open Folder", start: p.path }); if (r) done(typeof r === "object" ? { zip: r.zip } : { open: r }); } },
      { label: "Compress & export to Downloads…", icon: "file-zip", run: () => exporter.compressAndExport([p.path], { name: P.base(p.path) }) },
      ...(!p.recent ? [{ label: "Delete from CodeForge storage…", icon: "trash", danger: true, run: async () => {
        if (!(await confirm(`Delete “${P.base(p.path)}” from CodeForge's storage? This cannot be undone. Export it first if you may need it again.`, { title: "Delete project", okLabel: "Delete", danger: true }))) return;
        const r = await jobs.run({ title: `Deleting ${P.base(p.path)}`, kind: "storage", icon: "trash", silent: true, cancellable: false }, () => N.storage.delete(p.path));
        if (r.ok) { toast(`Deleted ${P.base(p.path)}`, { kind: "success" }); const i = stored.findIndex((x) => x.path === p.path); if (i >= 0) stored.splice(i, 1); settings.removeRecent(p.path); render(); } }
      }] : []),
      ...(p.recent ? [{ separator: true }, { label: "Remove from recent list", icon: "close", run: () => { settings.removeRecent(p.path); const i = recent.findIndex((r) => r.path === p.path); if (i >= 0) recent.splice(i, 1); render(); } }] : []),
    ], x, y);
  }
  function section(title, items, empty) {
    return h("div.pj-section", h("div.pj-title", title, h("span.muted", items.length ? " " + items.length : "")), ...(items.length ? items.map(card) : [h("div.pj-empty", empty)]));
  }
  function render() {
    const q = search.value.trim().toLowerCase(); const f = (a) => a.filter((p) => !q || p.path.toLowerCase().includes(q));
    const r = f(recent), s = f(stored.filter((x) => !known.has(x.path) && !isContainer(x.path)));
    const places = h("div.pj-section", h("div.pj-title", "Look inside"),
      ...containers.filter((c) => !q || c.label.toLowerCase().includes(q)).map((c) => h("div.pj-card.place", { onclick: () => goInside(c.path), title: c.path },
        h("span.pj-ico", icons.folderIcon(c.label.toLowerCase(), false)), h("div.pj-main", h("div.pj-name", c.label), h("div.pj-sub", c.note)), h("span.pj-go", icon("chevron-right")))));
    listEl.replaceChildren(section("Recent", r, q ? "No recent project matches." : "Nothing opened yet. Pick a folder below, clone a repo, or create a new project."),
      ...(s.length || !q ? [section("In CodeForge storage", s, "No projects yet. Use “New project”, “Clone repo” or import one above.")] : []), ...(places.children.length > 1 ? [places] : []));
  }
  search.addEventListener("input", render);
  const act = (ic, label, fn) => h("button.pj-act", { type: "button", onclick: fn }, icon(ic), h("span", label));
  const actions = h("div.pj-acts",
    act("device-mobile", "Browse device", async () => { const r = await of.browse({ mode: "folder", title: "Open Folder" }); if (!r) return; if (typeof r === "object" && r.zip) done({ zip: r.zip }); else done({ open: r }); }),
    act("cloud-download", "Import folder", async () => { const r = await of.importFolderFromDevice(); if (r) done({ open: r }); }),
    act("file-zip", "Open ZIP", async () => { closeFn(); handlers.openZip(); }),
    act("package", "Import bundle", async () => { closeFn(); handlers.importBundle(); }),
    act("repo-clone", "Clone repo", async () => { closeFn(); handlers.cloneRepo(); }),
    act("new-folder", "New project", async () => { closeFn(); handlers.newProject(); }));
  render();
  // fill in the details lazily
  const fill = async (list) => { for (const p of list) { if (!meta.has(p.path)) meta.set(p.path, await describe(p.path)); render(); } };
  fill(recent.slice(0, 12));
  storageProjects(info).then((s) => { stored = s.sort((a, b) => b.at - a.at).slice(0, 40); render(); fill(stored.filter((x) => !known.has(x.path)).slice(0, 10)); }).catch(() => {});

  await modal({
    title: "Open Folder", className: "wide tall projects", width: 680,
    body: h("div.pj-body", actions, search, listEl),
    buttons: [{ label: "Cancel", value: undefined }],
    onOpen: ({ close }) => { closeFn = () => close(true); },
  });
  if (!result) return;
  if (result.zip) { const d = await of.openZipAsProject(result.zip); if (d) openFolder(d); return; }
  if (result.open) { settings.state.lastBrowse = P.dir(result.open); settings.saveState(); openFolder(result.open); }
}
