// Workspace model: the open root folder plus every file operation (with events the UI reacts to).
import { N } from "../core/bridge.js";
import { Emitter } from "../core/events.js";
import { settings } from "../core/settings.js";
import { P } from "../core/util.js";

const ALWAYS_HIDDEN = new Set([".git", ".DS_Store", ".cf-tmp", ".cf-share"]);

class Workspace extends Emitter {
  constructor() { super(); this.root = null; this.name = ""; this.info = null; this._index = null; }

  async init(info) { this.info = info; this.home = info.paths.home; }

  get isOpen() { return !!this.root; }

  async open(path) {
    const st = await N.fs.stat(path);
    if (!st || st.t !== "d") throw new Error("Not a folder: " + path);
    this.root = path.replace(/\/+$/, "") || "/";
    this.name = P.base(this.root) || "/";
    this._index = null;
    settings.addRecent(this.root);
    this.emit("root", this.root);
  }
  close() { this.root = null; this.name = ""; this._index = null; this.emit("root", null); }

  async list(dir) {
    const items = await N.fs.list(dir);
    const hidden = !settings.get("files.showHidden");
    const out = [];
    for (const it of items) {
      if (ALWAYS_HIDDEN.has(it.n)) continue;
      if (hidden && it.n.startsWith(".")) continue;
      const isDir = it.t === "d" || (it.t === "l" && it.ld);
      out.push({ ...it, path: P.join(dir, it.n), isDir, isLink: it.t === "l" });
    }
    out.sort((a, b) => (a.isDir === b.isDir ? a.n.localeCompare(b.n, undefined, { numeric: true, sensitivity: "base" }) : a.isDir ? -1 : 1));
    return out;
  }

  async fileIndex(force = false) {
    if (!this.root) return [];
    if (!this._index || force) {
      const r = await N.fs.tree(this.root, { ignore: [".git", "node_modules", ".gradle", "build", "dist", "__pycache__", ".next", ".cache", ".idea"], max: 40000 });
      this._index = r.files;
    }
    return this._index;
  }
  invalidate() { this._index = null; }

  async exists(p) { return N.fs.exists(p); }

  async uniqueName(dir, name) {
    if (!(await N.fs.exists(P.join(dir, name)))) return name;
    const dot = name.lastIndexOf("."); const stem = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot) : "";
    for (let i = 2; i < 500; i++) { const c = `${stem} ${i}${ext}`; if (!(await N.fs.exists(P.join(dir, c)))) return c; }
    return `${stem} ${Date.now()}${ext}`;
  }
  async uniqueCopyName(dir, name, st = "copy") {
    const dot = name.lastIndexOf("."); const stem = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot) : "";
    let c = `${stem} ${st}${ext}`;
    for (let i = 2; await N.fs.exists(P.join(dir, c)); i++) c = `${stem} ${st} ${i}${ext}`;
    return c;
  }

  _changed(...dirs) { this.invalidate(); this.emit("changed", new Set(dirs.filter(Boolean))); }

  validName(name) {
    if (!name || !name.trim()) return "A name is required";
    if (/[\/\0]/.test(name)) return "Names cannot contain '/'";
    if (name === "." || name === "..") return "Invalid name";
    return null;
  }

  async createFile(dir, name, content = "") {
    const p = P.join(dir, name);
    if (await N.fs.exists(p)) throw new Error(`"${name}" already exists`);
    await N.fs.writeText(p, content);
    this._changed(dir); this.emit("created", p, false); return p;
  }
  async createFolder(dir, name) {
    const p = P.join(dir, name);
    if (await N.fs.exists(p)) throw new Error(`"${name}" already exists`);
    await N.fs.mkdir(p); this._changed(dir); this.emit("created", p, true); return p;
  }
  async rename(path, newName) {
    const to = P.join(P.dir(path), newName);
    if (to === path) return path;
    await N.fs.rename(path, to);
    this._changed(P.dir(path)); this.emit("renamed", path, to); return to;
  }
  async move(paths, destDir) {
    const out = [];
    for (const p of paths) {
      if (P.dir(p) === destDir) continue;
      if (P.inside(p, destDir)) throw new Error("Cannot move a folder into itself");
      const name = await this.uniqueName(destDir, P.base(p)); const to = P.join(destDir, name);
      await N.fs.rename(p, to); this.emit("renamed", p, to); out.push(to);
    }
    this._changed(destDir, ...paths.map(P.dir)); return out;
  }
  async copy(paths, destDir) {
    const out = [];
    for (const p of paths) {
      const same = P.dir(p) === destDir;
      const name = same ? await this.uniqueCopyName(destDir, P.base(p)) : await this.uniqueName(destDir, P.base(p));
      const to = P.join(destDir, name); await N.fs.copy(p, to); out.push(to);
    }
    this._changed(destDir); return out;
  }
  async remove(paths) {
    for (const p of paths) { await N.fs.rm(p); this.emit("deleted", p); }
    this._changed(...paths.map(P.dir));
  }

  async zip(paths, destZip) {
    const base = P.dir(paths[0]);
    const r = await N.archive.zip({ src: paths, dest: destZip, base });
    this._changed(P.dir(destZip)); return r;
  }
  async extractZip(zipPath, destDir) {
    await N.fs.mkdir(destDir);
    const r = await N.archive.unzip({ src: zipPath, dest: destDir });
    this._changed(P.dir(destDir), destDir); return r;
  }
  async extractArchive(path, destDir) {
    if (/\.zip$|\.vsix$|\.jar$|\.apk$/i.test(path)) return this.extractZip(path, destDir);
    await N.fs.mkdir(destDir); await N.archive.untar({ src: path, dest: destDir }); this._changed(destDir); return { count: 0 };
  }
  /** If an archive extracted into a single top-level folder, hoist it so the project root is the folder itself. */
  async flattenSingleRoot(dir) {
    const items = (await N.fs.list(dir)).filter((i) => !ALWAYS_HIDDEN.has(i.n) && i.n !== "__MACOSX");
    if (items.length === 1 && (items[0].t === "d")) {
      const inner = P.join(dir, items[0].n);
      const tmp = dir + ".cf-flat";
      await N.fs.rename(inner, tmp); await N.fs.rm(dir); await N.fs.rename(tmp, dir);
    }
  }
}
export const ws = new Workspace();
