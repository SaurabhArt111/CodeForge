// isomorphic-git adapters: a Node-like `fs.promises` over the native bridge and an `http` client over native Net (no CORS, secrets injected natively).
import { N } from "../core/bridge.js";
import { b64ToBytes, bytesToB64, textEnc, textDec } from "../core/util.js";

const err = (code, p) => Object.assign(new Error(`${code}: ${p}`), { code, errno: code === "ENOENT" ? -2 : code === "EEXIST" ? -17 : -1 });
const norm = (p) => p.replace(/\/+$/, "") || "/";

function mkStat(s) {
  const dir = s.t === "d", link = s.t === "l", mode = (s.p & 0o7777) | (dir ? 0o040000 : link ? 0o120000 : 0o100000);
  return { type: dir ? "dir" : link ? "symlink" : "file", mode, size: s.s || 0, ino: 0, mtimeMs: s.m, ctimeMs: s.m, uid: 1, gid: 1, dev: 1,
    isFile: () => !dir && !link, isDirectory: () => dir, isSymbolicLink: () => link };
}

const promises = {
  async readFile(p, opts) {
    const enc = typeof opts === "string" ? opts : opts?.encoding;
    const st = await N.fs.lstat(p).catch(() => null); if (!st) throw err("ENOENT", p); if (st.t === "d") throw err("EISDIR", p);
    if (enc === "utf8") { const r = await N.fs.readText(p, { max: 512 * 1024 * 1024 }); if (r.text != null) return r.text; return textDec.decode(await N.fs.readBytes(p)); }
    return await N.fs.readBytes(p);
  },
  async writeFile(p, data) { if (typeof data === "string") await N.fs.writeText(p, data); else await N.fs.writeBytes(p, data instanceof Uint8Array ? data : new Uint8Array(data)); },
  async unlink(p) { const st = await N.fs.lstat(p).catch(() => null); if (!st) throw err("ENOENT", p); await N.fs.rm(p); },
  async readdir(p) { const st = await N.fs.stat(p).catch(() => null); if (!st) throw err("ENOENT", p); if (st.t !== "d") throw err("ENOTDIR", p); return (await N.fs.list(p)).map((x) => x.n); },
  async mkdir(p) { const st = await N.fs.lstat(p).catch(() => null); if (st) throw err("EEXIST", p); const par = p.slice(0, p.lastIndexOf("/")) || "/"; if (!(await N.fs.exists(par))) throw err("ENOENT", p); await N.fs.mkdir(p); },
  async rmdir(p) { const st = await N.fs.lstat(p).catch(() => null); if (!st) throw err("ENOENT", p); await N.fs.rm(p); },
  async stat(p) { const st = await N.fs.stat(p).catch(() => null); if (!st) throw err("ENOENT", p); return mkStat(st); },
  async lstat(p) { const st = await N.fs.lstat(p).catch(() => null); if (!st) throw err("ENOENT", p); return mkStat(st); },
  async readlink(p) { try { return await N.fs.readlink(p); } catch { throw err("ENOENT", p); } },
  async symlink(target, p) { await N.fs.symlink(target, p); },
  async chmod(p, mode) { await N.fs.chmod(p, mode & 0o7777).catch(() => {}); },
};
export const fs = { promises };

/** Streaming HTTP client for isomorphic-git. Adds the GitHub token (never visible to JS) for github.com URLs. */
export function makeHttp({ auth }) {
  return {
    async request({ url, method = "GET", headers = {}, body }) {
      let bodyB64;
      if (body) { const parts = []; let n = 0; for await (const c of body) { parts.push(c); n += c.length; } const all = new Uint8Array(n); let o = 0; for (const c of parts) { all.set(c, o); o += c.length; } bodyB64 = bytesToB64(all); }
      const h = { ...headers };
      const a = auth?.(url); if (a) h.Authorization = a;
      const s = N.net.stream({ url, method, headers: h, bodyB64, timeoutMs: 30 * 60_000 });
      const head = await s.head;
      return { url: head.url || url, method, statusCode: head.status, statusMessage: head.statusText || "", headers: head.headers || {}, body: s.body };
    },
  };
}
export { textEnc };
