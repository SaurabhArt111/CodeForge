#!/usr/bin/env node
// CodeForge dev host: serves the web IDE and implements the native bridge with plain Node,
// so the UI can be developed and tested on a desktop without Android.
//   node tools/devhost/server.js [--root /tmp/cf-dev] [--port 8780]
import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { spawn, execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const argv = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith("--") ? [...a, [v.slice(2), arr[i + 1]]] : a), []));
const ROOT = path.resolve(argv.root || "/tmp/cf-dev");
const PORT = parseInt(argv.port || "8780", 10);
const WWW = path.resolve(argv.www || path.join(__dir, "../../app/src/main/assets/www"));
const P = { home: `${ROOT}/home`, data: `${ROOT}/cf`, files: ROOT, env: `${ROOT}/env`, rootfs: `${ROOT}/rootfs`, native: "", shared: `${ROOT}/shared`, extensions: `${ROOT}/cf/extensions`, plugins: `${ROOT}/cf/plugins` };
for (const d of [P.home, P.data, P.env, P.shared, P.extensions, P.plugins]) fs.mkdirSync(d, { recursive: true });
const TOKEN = crypto.randomBytes(8).toString("hex");

// ------------------------------------------------------------------ events (SSE)
const sseClients = new Set();
function emit(ev, d) { const msg = `data: ${JSON.stringify({ ev, d })}\n\n`; for (const r of sseClients) r.write(msg); }

// ------------------------------------------------------------------ secrets (plain JSON: dev only)
const secretsFile = `${P.data}/secrets.json`;
const secrets = fs.existsSync(secretsFile) ? JSON.parse(fs.readFileSync(secretsFile, "utf8")) : {};
const saveSecrets = () => fs.writeFileSync(secretsFile, JSON.stringify(secrets));
function expand(s) {
  return String(s).replace(/\{\{secret:([\w.\-]+)\}\}/g, (_, n) => secrets[n] || "").replace(/\{\{basic:([^:}]+):([\w.\-]+)\}\}/g, (_, u, n) => Buffer.from(`${u}:${secrets[n] || ""}`).toString("base64"));
}

// ------------------------------------------------------------------ fs helpers
const kindOf = (st) => (st.isDirectory() ? "d" : st.isFile() ? "f" : st.isSymbolicLink() ? "l" : "o");
const statObj = (st) => ({ t: kindOf(st), s: st.size, m: Math.floor(st.mtimeMs), p: st.mode & 0o7777, u: st.uid });
const abs = (p) => { if (!path.isAbsolute(p)) throw new Error("Path must be absolute: " + p); return p; };

async function fsList(p) {
  const names = await fsp.readdir(abs(p));
  const out = [];
  for (const n of names) {
    const fp = path.join(p, n);
    try {
      const l = await fsp.lstat(fp);
      const o = { n, t: kindOf(l), s: l.size, m: Math.floor(l.mtimeMs), p: l.mode & 0o7777 };
      if (l.isSymbolicLink()) { try { const t = await fsp.stat(fp); o.ld = t.isDirectory(); o.s = t.size; } catch { o.broken = true; } }
      out.push(o);
    } catch { out.push({ n, t: "o", s: 0, m: 0, p: 0 }); }
  }
  return out;
}
async function walkTree(root, ignore, max) {
  const files = []; let truncated = false;
  async function walk(dir, prefix) {
    if (truncated) return;
    let ents; try { ents = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (truncated) return;
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) { if (!ignore.has(e.name)) await walk(path.join(dir, e.name), rel); }
      else if (!e.isSymbolicLink() || true) { files.push(rel); if (files.length >= max) { truncated = true; return; } }
    }
  }
  await walk(root, "");
  return { files, truncated };
}
async function searchText(o) {
  const ignoreDirs = new Set([".git", "node_modules", ".hg", ".svn", ".gradle", "__pycache__", ".idea", ".next", ".cache"]);
  let src = o.regex ? o.query : o.query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (o.wholeWord) src = `\\b(?:${src})\\b`;
  const re = new RegExp(src, "g" + (o.caseSensitive ? "" : "i"));
  const g2r = (g) => new RegExp("^" + g.trim().replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "\u0000").replace(/\*/g, "[^/]*").replace(/\u0000/g, ".*").replace(/\?/g, "[^/]") + "$");
  const inc = (o.include || []).filter((s) => s.trim()).map(g2r), exc = (o.exclude || []).filter((s) => s.trim()).map(g2r);
  const results = []; let files = 0, scanned = 0, truncated = false;
  async function walk(dir, prefix) {
    if (truncated) return;
    let ents; try { ents = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
    ents.sort((a, b) => a.name.localeCompare(b.name));
    for (const e of ents) {
      if (truncated) return;
      const rel = prefix ? `${prefix}/${e.name}` : e.name, full = path.join(dir, e.name);
      if (e.isDirectory()) { if (ignoreDirs.has(e.name) || (exc.length && exc.some((r) => r.test(rel) || r.test(e.name)))) continue; await walk(full, rel); continue; }
      if (!e.isFile()) continue;
      if (inc.length && !inc.some((r) => r.test(rel) || r.test(e.name))) continue;
      if (exc.length && exc.some((r) => r.test(rel) || r.test(e.name))) continue;
      let buf; try { const st = await fsp.stat(full); if (st.size > 2e6) continue; buf = await fsp.readFile(full); } catch { continue; }
      if (buf.subarray(0, 4000).includes(0)) continue;
      scanned++;
      const lines = buf.toString("utf8").split("\n"); let hit = false;
      for (let i = 0; i < lines.length && !truncated; i++) {
        const line = lines[i].replace(/\r$/, ""); re.lastIndex = 0; let m;
        while ((m = re.exec(line))) {
          if (m[0].length === 0) { re.lastIndex++; continue; }
          hit = true; results.push({ path: full, rel, line: i + 1, col: m.index + 1, len: m[0].length, text: line.slice(0, 300) });
          if (results.length >= (o.max || 3000)) { truncated = true; break; }
        }
      }
      if (hit) files++;
    }
  }
  await walk(o.root, "");
  return { results, files, scanned, truncated };
}

// ------------------------------------------------------------------ live server
const liveServers = new Map();
const MIME = { html: "text/html; charset=utf-8", htm: "text/html; charset=utf-8", css: "text/css", js: "text/javascript", mjs: "text/javascript", json: "application/json", svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", ico: "image/x-icon", woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", wasm: "application/wasm", txt: "text/plain", md: "text/plain", map: "application/json" };
const mimeOf = (n) => MIME[path.extname(n).slice(1).toLowerCase()] || "application/octet-stream";
let CLIENT_JS = "";
{ // reuse the exact client script from the Kotlin sources so both stay in sync
  const kt = fs.readFileSync(path.join(__dir, "../../app/src/main/java/dev/codeforge/ide/core/LiveServer.kt"), "utf8");
  CLIENT_JS = kt.match(/const val CLIENT_JS = """([\s\S]*?)"""/)[1];
}
async function startLive(o) {
  const root = path.resolve(o.root);
  for (const s of liveServers.values()) if (s.root === root && s.spa === !!o.spa && s.lan === !!o.lan) return { port: s.port, url: `http://127.0.0.1:${s.port}/` };
  const clients = new Set();
  const srv = http.createServer(async (req, res) => {
    const u = new URL(req.url, "http://x"); let p = decodeURIComponent(u.pathname);
    const log = (c) => emit("live.log", { port: srv.address().port, line: `${req.method} ${p} ${c}` });
    if (p === "/__cf_live.js") { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(CLIENT_JS); }
    if (p === "/__cf_live") { res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", "access-control-allow-origin": "*" }); res.write("retry: 1500\n: connected\n\n"); clients.add(res); req.on("close", () => clients.delete(res)); return; }
    let f = path.resolve(root, "." + p);
    if (f !== root && !f.startsWith(root + path.sep)) { res.writeHead(403); log(403); return res.end("Forbidden"); }
    try {
      let st = await fsp.stat(f).catch(() => null);
      if (st?.isDirectory()) {
        if (!p.endsWith("/")) { res.writeHead(301, { location: p + "/" }); return res.end(); }
        const idx = ["index.html", "index.htm"].map((n) => path.join(f, n)).find((x) => fs.existsSync(x));
        if (idx) { f = idx; st = await fsp.stat(f); }
        else { const names = await fsp.readdir(f); res.writeHead(200, { "content-type": "text/html" }); log(200); return res.end(`<!doctype html><title>Index</title><ul>${names.map((n) => `<li><a href="${encodeURIComponent(n)}">${n}</a></li>`).join("")}</ul><script src="/__cf_live.js"></script>`); }
      }
      if (!st?.isFile() && o.spa && !path.basename(p).includes(".") && fs.existsSync(path.join(root, "index.html"))) { f = path.join(root, "index.html"); st = await fsp.stat(f); }
      if (!st?.isFile()) { res.writeHead(404, { "content-type": "text/html" }); log(404); return res.end(`<h2>404</h2><script src="/__cf_live.js"></script>`); }
      const mime = mimeOf(f);
      if (mime.startsWith("text/html")) {
        let html = await fsp.readFile(f, "utf8"); const nb = html.match(/<script[^>]*\ssrc=["']([^"']+\.(?:jsx|tsx|ts|mts|vue|svelte))(?:\?[^"']*)?["']/i); const tag = '<script src="/__cf_live.js"' + (nb ? ` data-needs-build="${nb[1]}"` : "") + "></script>"; const m = html.match(/<head(\s[^>]*)?>/i) || html.match(/<html(\s[^>]*)?>/i) || html.match(/<!doctype[^>]*>/i); const at = m ? m.index + m[0].length : 0;
        html = html.slice(0, at) + tag + html.slice(at); res.writeHead(200, { "content-type": mime, "cache-control": "no-store" }); log(200); return res.end(html);
      }
      res.writeHead(200, { "content-type": mime, "cache-control": "no-store", "access-control-allow-origin": "*" }); log(200); fs.createReadStream(f).pipe(res);
    } catch (e) { res.writeHead(500); res.end(String(e)); }
  });
  await new Promise((r) => srv.listen(o.port || 0, "127.0.0.1", r));
  const port = srv.address().port;
  const entry = { port, root, spa: !!o.spa, lan: !!o.lan, srv, clients };
  liveServers.set(port, entry);
  const snap = async () => { const m = new Map(); async function w(d, depth) { if (depth > 8 || m.size > 4000) return; let es; try { es = await fsp.readdir(d, { withFileTypes: true }); } catch { return; } for (const e of es) { if (e.isDirectory()) { if (!["node_modules", ".git"].includes(e.name)) await w(path.join(d, e.name), depth + 1); } else { try { const st = await fsp.stat(path.join(d, e.name)); m.set(path.join(d, e.name), `${st.mtimeMs}:${st.size}`); } catch {} } } } await w(root, 0); return m; };
  let prev = await snap();
  entry.timer = setInterval(async () => { if (!clients.size) { prev = await snap(); return; } const cur = await snap(); const ch = []; for (const [k, v] of cur) if (prev.get(k) !== v) ch.push(k); for (const k of prev.keys()) if (!cur.has(k)) ch.push(k); prev = cur; if (ch.length) for (const c of clients) c.write(`event: ${ch.every((x) => x.endsWith(".css")) ? "css" : "reload"}\ndata: ${ch[0]}\n\n`); }, 600);
  return { port, url: `http://127.0.0.1:${port}/` };
}
function stopLive(port) { const s = liveServers.get(port); if (!s) return; clearInterval(s.timer); for (const c of s.clients) c.end(); s.srv.close(); liveServers.delete(port); }

// ------------------------------------------------------------------ terminals
const terms = new Map(); let termSeq = 1;
function termInfo(t) { return { id: t.id, pid: t.proc.pid, title: t.title, alive: t.alive, exit: t.alive ? null : t.exit, mode: "host", cwd: t.cwd }; }
function termCreate(o) {
  const id = "t" + termSeq++;
  const cwd = o.cwd && fs.existsSync(o.cwd) ? o.cwd : P.home;
  const cmd = o.command?.length ? o.command : ["bash", "--noprofile", "--norc", "-i"];
  const env = { ...process.env, TERM: "xterm-256color", COLORTERM: "truecolor", PS1: "\\u@codeforge:\\w\\$ ", HOME: P.home, ...(o.env || {}) };
  const proc = spawn("python3", [path.join(__dir, "pty-helper.py"), cwd, ...cmd], { stdio: ["pipe", "pipe", "pipe", "pipe"], env });
  const t = { id, proc, title: o.title || "bash", alive: true, exit: 0, cwd, buf: Buffer.alloc(0) };
  terms.set(id, t);
  proc.stdout.on("data", (d) => { t.buf = Buffer.concat([t.buf, d]).subarray(-512 * 1024); emit("term.data", { id, b64: d.toString("base64") }); });
  proc.on("exit", (code) => { t.alive = false; t.exit = code ?? 0; setTimeout(() => emit("term.exit", { id, code: t.exit }), 50); });
  if (o.rows) proc.stdio[3].write(`R ${o.rows} ${o.cols}\n`);
  return termInfo(t);
}

// ------------------------------------------------------------------ RPC
let ghPolls = 0;
const ghUser = { login: "devuser", name: "Dev User", email: "dev@example.com", avatar_url: "", html_url: "https://github.com/devuser", scopes: "repo, read:user" };
const methods = {
  "sys.info": async () => ({ version: "8.0.0-devhost", pkg: "dev.codeforge.ide", sdk: 34, abi: "x86_64", device: "DevHost", githubClientId: process.env.CF_GITHUB_CLIENT_ID || "dev-client-id", allFiles: true, paths: P, linux: { installed: false, version: null, arch: "x86_64", setupDone: false, supported: true }, devhost: true }),
  "sys.hasAllFiles": async () => true, "sys.requestAllFiles": async () => true,
  "sys.openUrl": async (u) => { emit("devhost.openUrl", { url: u }); return true; },
  // ---- crash recorder emulation (in memory; the Android app keeps these as files)
  ...(() => {
    const reports = []; const crumbs = [];
    const meta = ({ text, ...m }) => ({ ...m, size: text.length });
    const rec = (o, fatal = false) => { const ts = Date.now(), id = `${String(ts).padStart(13, "0")}-${(o.kind || "js-error")}-${crypto.randomBytes(2).toString("hex")}`; reports.push({ id, ts, kind: o.kind || "js-error", title: o.title || "Error", fatal: !!(o.fatal ?? fatal), process: "main", seen: false, text: `CodeForge report\nKind: ${o.kind}\n\n== ${o.title} ==\n${o.detail || ""}\n\n-- breadcrumbs --\n${crumbs.join("\n")}\n` }); return id; };
    globalThis.__cfCrash = { reports, rec };
    return {
      "crash.list": async () => [...reports].reverse().map(meta), "crash.unseen": async () => reports.filter((r) => !r.seen).reverse().map(meta),
      "crash.read": async (id) => reports.find((r) => r.id === id) || null,
      "crash.delete": async (id) => { const i = reports.findIndex((r) => r.id === id); if (i >= 0) reports.splice(i, 1); return true; }, "crash.clear": async () => { reports.length = 0; return true; },
      "crash.seen": async (ids) => { for (const r of reports) if (!ids || ids.includes(r.id)) r.seen = true; return true; },
      "crash.report": async (o) => rec(o), "crash.crumbs": async (a) => { for (const l of a || []) crumbs.push("ui " + l); while (crumbs.length > 150) crumbs.shift(); return true; },
      "crash.bundle": async (ids) => reports.filter((r) => !ids || ids.includes(r.id)).map((r) => "=".repeat(60) + "\n" + r.text).join("\n\n") || "No reports.",
      "crash.diagnostics": async () => "DevHost diagnostics\n" + crumbs.slice(-60).join("\n"), "crash.takeRecovery": async () => globalThis.__cfRecovery ? (() => { const r = globalThis.__cfRecovery; globalThis.__cfRecovery = null; return r; })() : null,
      "crash.testNative": async () => rec({ kind: "test", title: "Test report", detail: "Created from Settings → Diagnostics." }),
      "preview.open": async (o) => { emit("devhost.preview", o); return true; }, "term.ack": async () => true,
    };
  })(),
  "sys.share": async () => true, "sys.takeIntent": async () => null,
  "sys.clipboardGet": async () => clip, "sys.clipboardSet": async (t) => { clip = t; return true; },
  "sys.notify": async () => true, "sys.vibrate": async () => true, "sys.toast": async () => true, "sys.keepAwake": async () => true, "sys.setStatusBar": async () => true,
  "sys.storageRoots": async () => [{ id: "workspace", label: "Workspace (app storage)", path: P.home, free: 1e10, total: 2e10, removable: false }, { id: "shared", label: "CodeForge (shared folder)", path: P.shared, free: 1e10, total: 2e10, removable: false }, { id: "tmp", label: "Temp", path: os.tmpdir(), free: 1e10, total: 2e10, removable: false }],
  "sys.pickFile": async () => (nextPick.file ? nextPick.file : null), "sys.pickFolder": async () => nextPick.folder || null, "sys.createFile": async () => nextPick.create || null,
  "sys.importUri": async (uri, dest) => { const src = uri.replace(/^file:\/\//, ""); let d = dest; if (fs.existsSync(dest) && fs.statSync(dest).isDirectory()) d = path.join(dest, path.basename(src)); await fsp.copyFile(src, d); return { path: d, size: fs.statSync(d).size }; },
  "sys.importTree": async (uri, dest) => { await fsp.cp(uri.replace(/^file:\/\//, ""), dest, { recursive: true }); return { count: 1, path: dest }; },
  "sys.exportFile": async (src, uri) => { await fsp.copyFile(src, uri.replace(/^file:\/\//, "")); return true; },
  "sys.exportTree": async (src, uri) => { await fsp.cp(src, path.join(uri.replace(/^file:\/\//, ""), path.basename(src)), { recursive: true }); return { count: 1 }; },
  "sys.exit": async () => true,
  "fs.token": async () => TOKEN,
  "fs.list": async (p) => fsList(p),
  "fs.stat": async (p) => { try { return statObj(await fsp.stat(abs(p))); } catch { return null; } },
  "fs.lstat": async (p) => { try { return statObj(await fsp.lstat(abs(p))); } catch { return null; } },
  "fs.exists": async (p) => { try { await fsp.lstat(abs(p)); return true; } catch { return false; } },
  "fs.readText": async (p, o = {}) => {
    const st = await fsp.stat(abs(p)); if (st.isDirectory()) throw new Error("Is a directory: " + p);
    const res = { size: st.size, mtime: Math.floor(st.mtimeMs) }; if (st.size > (o.max ?? 12 * 1024 * 1024)) return { ...res, tooLarge: true };
    const buf = await fsp.readFile(p); if (buf.subarray(0, 8000).includes(0)) return { ...res, binary: true };
    const bom = buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf; return { ...res, text: buf.subarray(bom ? 3 : 0).toString("utf8"), bom };
  },
  "fs.readB64": async (p, off = 0, len = -1) => { const b = await fsp.readFile(abs(p)); return b.subarray(off, len < 0 ? undefined : off + len).toString("base64"); },
  "fs.writeText": async (p, text, o = {}) => { abs(p); await fsp.mkdir(path.dirname(p), { recursive: true }); const tmp = p + ".cf-tmp"; await fsp.writeFile(tmp, Buffer.concat([o.bom ? Buffer.from([0xef, 0xbb, 0xbf]) : Buffer.alloc(0), Buffer.from(text, "utf8")])); try { const m = (await fsp.stat(p)).mode; await fsp.chmod(tmp, m); } catch {} await fsp.rename(tmp, p); return true; },
  "fs.writeB64": async (p, b64, append) => { abs(p); await fsp.mkdir(path.dirname(p), { recursive: true }); const b = Buffer.from(b64, "base64"); if (append) await fsp.appendFile(p, b); else await fsp.writeFile(p, b); return true; },
  "fs.mkdir": async (p) => { await fsp.mkdir(abs(p), { recursive: true }); return true; },
  "fs.rm": async (p) => { abs(p); if (p.length < 8) throw new Error("Refusing to delete " + p); await fsp.rm(p, { recursive: true, force: true }); return true; },
  "fs.rename": async (a, b) => { abs(a); abs(b); if (fs.existsSync(b)) throw new Error("Already exists: " + path.basename(b)); await fsp.mkdir(path.dirname(b), { recursive: true }); await fsp.rename(a, b); return true; },
  "fs.copy": async (a, b) => { if ((abs(b) + "/").startsWith(abs(a) + "/")) throw new Error("Cannot copy a folder into itself"); await fsp.cp(a, b, { recursive: true, verbatimSymlinks: true }); return true; },
  "fs.symlink": async (t, p) => { await fsp.mkdir(path.dirname(p), { recursive: true }); await fsp.symlink(t, abs(p)); return true; },
  "fs.readlink": async (p) => fsp.readlink(abs(p)), "fs.chmod": async (p, m) => { await fsp.chmod(abs(p), m); return true; }, "fs.realpath": async (p) => fsp.realpath(abs(p)),
  "fs.tree": async (p, o = {}) => walkTree(abs(p), new Set(o.ignore?.length ? o.ignore : [".git", "node_modules"]), o.max || 30000),
  "search.text": async (o) => searchText(o), "search.cancel": async () => true,
  "archive.zip": async (o) => {
    const zip = new JSZip(); let count = 0;
    const ex = o.exclude || [], skip = (n) => ex.some((p) => (p.startsWith("*") ? n.endsWith(p.slice(1)) : p.endsWith("*") ? n.startsWith(p.slice(0, -1)) : n === p));
    async function add(f, base) { if (!o.src.includes(f) && skip(path.basename(f))) return; const rel = path.relative(base, f).split(path.sep).join("/"); const st = await fsp.lstat(f); if (st.isSymbolicLink()) return; if (st.isDirectory()) { if (rel) zip.folder(rel); for (const n of (await fsp.readdir(f)).sort()) await add(path.join(f, n), base); } else { zip.file(rel, await fsp.readFile(f)); count++; } }
    for (const s of o.src) await add(s, o.base || path.dirname(s));
    await fsp.mkdir(path.dirname(o.dest), { recursive: true }); await fsp.writeFile(o.dest, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" })); return { count };
  },
  "archive.unzip": async (o) => {
    const zip = await JSZip.loadAsync(await fsp.readFile(o.src)); let count = 0; const root = path.resolve(o.dest);
    for (const [name, e] of Object.entries(zip.files)) { const out = path.resolve(root, name); if (out !== root && !out.startsWith(root + path.sep)) throw new Error("Blocked unsafe path in archive: " + name); if (e.dir) await fsp.mkdir(out, { recursive: true }); else { await fsp.mkdir(path.dirname(out), { recursive: true }); await fsp.writeFile(out, await e.async("nodebuffer")); count++; } }
    return { count };
  },
  "archive.listZip": async (p) => { const zip = await JSZip.loadAsync(await fsp.readFile(p)); return Object.values(zip.files).map((e) => ({ name: e.name, size: 0, dir: e.dir })); },
  "archive.untar": async (o) => new Promise((res, rej) => { fs.mkdirSync(o.dest, { recursive: true }); execFile("tar", ["-xf", o.src, "-C", o.dest], (e) => (e ? rej(e) : res(true))); }),
  "net.request": async (o) => {
    const headers = Object.fromEntries(Object.entries(o.headers || {}).map(([k, v]) => [k, expand(v)]));
    const body = o.bodyB64 ? Buffer.from(o.bodyB64, "base64") : o.body ?? undefined;
    const r = await fetch(o.url, { method: o.method || "GET", headers, body });
    const buf = Buffer.from(await r.arrayBuffer()); const hs = {}; r.headers.forEach((v, k) => (hs[k] = v));
    return { status: r.status, statusText: r.statusText, url: r.url, headers: hs, ...(o.as === "b64" ? { b64: buf.toString("base64") } : { text: buf.toString("utf8") }) };
  },
  "net.stream": async (o) => {
    const ctl = new AbortController(); streams.set(o.id, ctl);
    (async () => {
      try {
        const headers = Object.fromEntries(Object.entries(o.headers || {}).map(([k, v]) => [k, expand(v)]));
        const r = await fetch(o.url, { method: o.method || "GET", headers, body: o.bodyB64 ? Buffer.from(o.bodyB64, "base64") : o.body ?? undefined, signal: ctl.signal });
        const hs = {}; r.headers.forEach((v, k) => (hs[k] = v));
        emit("net.head", { id: o.id, status: r.status, statusText: r.statusText, url: r.url, headers: hs });
        for await (const chunk of r.body) emit("net.chunk", { id: o.id, b64: Buffer.from(chunk).toString("base64") });
        emit("net.end", { id: o.id });
      } catch (e) { emit("net.error", { id: o.id, message: String(e.message || e) }); } finally { streams.delete(o.id); }
    })();
    return true;
  },
  "net.abort": async (id) => { streams.get(id)?.abort(); return true; },
  "net.download": async (o) => { const r = await fetch(o.url, { headers: o.headers || {} }); if (!r.ok) throw new Error("HTTP " + r.status); const b = Buffer.from(await r.arrayBuffer()); await fsp.mkdir(path.dirname(o.dest), { recursive: true }); await fsp.writeFile(o.dest, b); emit("net.progress", { id: o.id, done: b.length, total: b.length }); return { path: o.dest, size: b.length }; },
  // ---- auth emulation (mirrors core/Auth.kt: salted PBKDF2 PIN, escalating lockout, 90 s unlock tokens, no biometrics)
  ...(() => {
    const lockFile = `${P.data}/lock.json`; const tokens = new Map();
    const load = () => { try { return JSON.parse(fs.readFileSync(lockFile, "utf8")); } catch { return {}; } };
    const save = (o) => fs.writeFileSync(lockFile, JSON.stringify(o));
    const hashPin = (pin, salt) => crypto.pbkdf2Sync(pin, Buffer.from(salt, "base64"), 1000, 32, "sha256").toString("base64");
    const issue = () => { const t = crypto.randomBytes(18).toString("base64url"); tokens.set(t, Date.now() + 90000); return t; };
    const valid = (t) => !!t && tokens.has(t) && tokens.get(t) > Date.now();
    const verify = (pin) => {
      const o = load(); if (!o.hash) return { ok: false, error: "No PIN is set" };
      const wait = Math.max(0, (o.until || 0) - Date.now()); if (wait > 0) return { ok: false, lockedMs: wait };
      if (crypto.timingSafeEqual(Buffer.from(hashPin(pin, o.salt)), Buffer.from(o.hash))) { o.fails = 0; o.until = 0; save(o); return { ok: true, token: issue() }; }
      o.fails = (o.fails || 0) + 1; let lockMs = 0; if (o.fails >= 5) { lockMs = 30000 * 2 ** Math.min(o.fails - 5, 6); o.until = Date.now() + lockMs; } save(o);
      return { ok: false, lockedMs: lockMs, remaining: Math.max(0, 5 - o.fails) };
    };
    return {
      "auth.status": async () => { const o = load(); return { pinSet: !!o.hash, lockedMs: Math.max(0, (o.until || 0) - Date.now()), failures: o.fails || 0, biometric: false, deviceSecure: false, sdk: 0 }; },
      "auth.biometric": async () => ({ ok: false, unsupported: true }),
      "auth.verifyPin": async (p) => verify(String(p)),
      "auth.setPin": async (n, old) => {
        n = String(n); if (n.length < 4 || n.length > 32) return { ok: false, error: "PIN must be 4–32 characters" };
        if (load().hash) { const v = verify(String(old || "")); if (!v.ok) return v; }
        const salt = crypto.randomBytes(16).toString("base64"); save({ salt, hash: hashPin(n, salt), fails: 0, until: 0 }); return { ok: true, token: issue() };
      },
      "auth.clearPin": async (p) => { const v = verify(String(p)); if (!v.ok) return v; fs.rmSync(lockFile, { force: true }); return { ok: true }; },
      "auth.valid": async (t) => valid(t), "auth.lock": async () => { tokens.clear(); return true; },
      "secret.reveal": async (n, t) => { if (!valid(t)) throw new Error("Authentication required"); if (!(n in secrets)) throw new Error("No such key"); return secrets[n]; },
      "secret.mask": async (n) => { const v = secrets[n]; if (v == null) return null; return v.length <= 8 ? "•".repeat(v.length) : v.slice(0, 3) + "•".repeat(Math.min(24, v.length - 7)) + v.slice(-4); },
      "sys.setSecure": async () => true,
    };
  })(),
  "secret.set": async (n, v) => { secrets[n] = v; saveSecrets(); return true; }, "secret.has": async (n) => n in secrets, "secret.delete": async (n) => { delete secrets[n]; saveSecrets(); return true; }, "secret.names": async () => Object.keys(secrets),
  "github.deviceStart": async () => { ghPolls = 0; return { device_code: "dev-device-code", user_code: "ABCD-1234", verification_uri: "https://github.com/login/device", expires_in: 900, interval: 1 }; },
  "github.devicePoll": async () => { if (++ghPolls < 2) return { status: "pending" }; secrets["github.token"] = "gho_devtoken"; saveSecrets(); return { status: "ok", scope: "repo" }; },
  "github.signedIn": async () => "github.token" in secrets, "github.user": async () => { if (!secrets["github.token"]) throw new Error("Not signed in"); return ghUser; },
  "github.signOut": async () => { delete secrets["github.token"]; saveSecrets(); return true; }, "github.configureGit": async () => true,
  "live.start": async (o) => startLive(o), "live.stop": async (p) => { stopLive(p); return true; },
  "live.list": async () => [...liveServers.values()].map((s) => ({ port: s.port, root: s.root, spa: s.spa, lan: s.lan, clients: s.clients.size, url: `http://127.0.0.1:${s.port}/` })),
  "live.reload": async (port) => { for (const s of liveServers.values()) if (port == null || s.port === port) for (const c of s.clients) c.write("event: reload\ndata: \n\n"); return true; },
  "term.create": async (o) => termCreate(o),
  "term.write": async (id, b64) => { terms.get(id)?.proc.stdin.write(Buffer.from(b64, "base64")); return true; },
  "term.resize": async (id, r, c) => { terms.get(id)?.proc.stdio[3].write(`R ${r} ${c}\n`); return true; },
  "term.kill": async (id) => { terms.get(id)?.proc.kill("SIGHUP"); return true; },
  "term.close": async (id) => { const t = terms.get(id); if (t?.alive) t.proc.kill("SIGKILL"); terms.delete(id); return true; },
  "term.list": async () => [...terms.values()].map(termInfo),
  "term.attach": async (id) => { const t = terms.get(id); return t ? { ...termInfo(t), b64: t.buf.toString("base64") } : null; },
  "term.rename": async (id, title) => { const t = terms.get(id); if (t) t.title = title; return true; },
  "env.status": async () => ({ installed: false, version: null, arch: "x86_64", setupDone: false, supported: true }),
  "env.install": async () => { for (const [i, st] of ["download", "extract", "configure"].entries()) { emit("env.progress", { stage: st, done: i + 1, total: 3, msg: st }); await new Promise((r) => setTimeout(r, 100)); } return { installed: false, supported: true }; },
  "env.reset": async () => ({ installed: false }),
  "proc.exec": async (o) => new Promise((res) => { const args = o.command || ["/bin/sh", "-c", o.line]; execFile(args[0], args.slice(1), { cwd: o.cwd || P.home, timeout: o.timeoutMs || 120000, maxBuffer: 4e6 }, (e, so, se) => res({ code: e ? (typeof e.code === "number" ? e.code : 1) : 0, out: so + se, timedOut: !!e?.killed })); }),
  "devhost.setPick": async (o) => { Object.assign(nextPick, o); return true; },
};
let clip = ""; const nextPick = {}; const streams = new Map();

// ------------------------------------------------------------------ HTTP
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  try {
    if (u.pathname === "/__events") { res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" }); res.write(": ok\n\n"); sseClients.add(res); req.on("close", () => sseClients.delete(res)); return; }
    if (u.pathname === "/__rpc" && req.method === "POST") {
      let body = ""; for await (const c of req) body += c; const { id, m, a } = JSON.parse(body); let out;
      try { const fn = methods[m]; if (!fn) throw new Error("Unknown bridge method: " + m); out = { id, ok: true, r: (await fn(...(a || []))) ?? null }; } catch (e) { out = { id, ok: false, e: String(e.message || e) }; }
      res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify(out));
    }
    if (u.pathname.startsWith("/__fs__/")) {
      const rest = u.pathname.slice(8); const i = rest.indexOf("/"); if (rest.slice(0, i) !== TOKEN) { res.writeHead(404); return res.end(); }
      const f = "/" + decodeURIComponent(rest.slice(i + 1)).replace(/^\/+/, "");
      if (!fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { "content-type": mimeOf(f), "cache-control": "no-store" }); return fs.createReadStream(f).pipe(res);
    }
    let rel = decodeURIComponent(u.pathname); if (rel.endsWith("/")) rel += "index.html";
    const f = path.resolve(WWW, "." + rel);
    if (!f.startsWith(WWW) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, { "content-type": mimeOf(f), "cache-control": "no-store" }); fs.createReadStream(f).pipe(res);
  } catch (e) { res.writeHead(500); res.end(String(e)); }
});
server.listen(PORT, "127.0.0.1", () => console.log(`CodeForge dev host: http://127.0.0.1:${PORT}/  (sandbox: ${ROOT})`));
process.on("SIGTERM", () => process.exit(0));
