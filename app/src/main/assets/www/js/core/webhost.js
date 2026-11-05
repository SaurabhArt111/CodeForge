// Browser backend for the web version of CodeForge (enabled only when `window.__CF_WEB` is set — see tools/web/build.sh).
// It implements the same JSON-RPC surface as the Android host / dev host, using browser APIs:
//   files    → in-memory virtual filesystem persisted to IndexedDB (projects survive reloads; use ZIP export to back up)
//   network  → fetch() (subject to CORS), streaming via ReadableStream
//   terminal → a small built-in shell (ls, cd, cat, node, …) — no real processes in a browser
//   secrets  → AES-GCM with a non-extractable WebCrypto key (protects against casual inspection only), PIN via PBKDF2
// Not available: Linux/proot, npm/git CLI, GitHub device-flow (CORS) — paste a token instead. The live server is emulated by the service worker (tools/web/live-sw.js).
import * as lazy from "./lazy.js";
import { b64ToBytes, bytesToB64 } from "./util.js";

const HOME = "/home", DATA = "/data", SHARED = "/shared";
const MIME = { html: "text/html", htm: "text/html", css: "text/css", js: "text/javascript", mjs: "text/javascript", json: "application/json", svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", ico: "image/x-icon", woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", txt: "text/plain", md: "text/markdown", pdf: "application/pdf", mp3: "audio/mpeg", mp4: "video/mp4", wasm: "application/wasm" };
const mimeOf = (p) => MIME[p.split(".").pop().toLowerCase()] || "application/octet-stream";
const enc = new TextEncoder(), dec = new TextDecoder();
const dirOf = (p) => { const i = p.lastIndexOf("/"); return i <= 0 ? "/" : p.slice(0, i); };
const baseOf = (p) => p.slice(p.lastIndexOf("/") + 1);
const norm = (p) => { const out = []; for (const s of String(p).split("/")) { if (!s || s === ".") continue; if (s === "..") out.pop(); else out.push(s); } return "/" + out.join("/"); };
const abs = (p) => { if (typeof p !== "string" || !p.startsWith("/")) throw new Error("Path must be absolute: " + p); return norm(p); };

// ------------------------------------------------------------------------------------------ IndexedDB
let db = null; const files = new Map(); const kids = new Map();   // path -> {t,d,m}; dir -> Set(names)
const idb = (store, mode, fn) => new Promise((res, rej) => { const tx = db.transaction(store, mode); const r = fn(tx.objectStore(store)); tx.oncomplete = () => res(r?.result); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
async function openDb() {
  db = await new Promise((res, rej) => { const rq = indexedDB.open("codeforge-web", 1); rq.onupgradeneeded = () => { rq.result.createObjectStore("fs"); rq.result.createObjectStore("kv"); }; rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
  await new Promise((res, rej) => { const tx = db.transaction("fs", "readonly"); const rq = tx.objectStore("fs").openCursor(); rq.onsuccess = () => { const c = rq.result; if (c) { link(c.key, c.value); c.continue(); } else res(); }; rq.onerror = () => rej(rq.error); });
  if (!files.has("/")) mkdirp("/");
  for (const d of [HOME, DATA, SHARED, DATA + "/extensions", DATA + "/plugins"]) if (!files.has(d)) await mkdirp(d);
  if (!files.has(HOME + "/README.md")) { await put(HOME + "/README.md", enc.encode("# Welcome to CodeForge (web)\n\nFiles live in this browser (IndexedDB). Use **File → Compress Project to ZIP** to back up, and **Open Folder → Import ZIP** to restore.\n\nThe terminal here is a small built-in shell — type `help`. Install the Android app for a real Linux environment, npm and git.\n")); }
}
function link(p, rec) { files.set(p, rec); if (p !== "/") { const d = dirOf(p); if (!kids.has(d)) kids.set(d, new Set()); kids.get(d).add(baseOf(p)); } }
function unlink(p) { files.delete(p); if (p !== "/") kids.get(dirOf(p))?.delete(baseOf(p)); kids.delete(p); }
async function mkdirp(p) { const parts = p.split("/").filter(Boolean); let cur = ""; if (!files.has("/")) { const r = { t: "d", d: null, m: Date.now() }; link("/", r); await idb("fs", "readwrite", (s) => s.put(r, "/")); } for (const s of parts) { cur += "/" + s; const e = files.get(cur); if (e && e.t === "f") throw new Error("Not a directory: " + cur); if (!e) { const r = { t: "d", d: null, m: Date.now() }; link(cur, r); await idb("fs", "readwrite", (st) => st.put(r, cur)); } } }
async function put(p, bytes) { await mkdirp(dirOf(p)); const old = files.get(p); if (old?.t === "d") throw new Error("Is a directory: " + p); const r = { t: "f", d: bytes, m: Date.now() }; link(p, r); await idb("fs", "readwrite", (s) => s.put(r, p)); }
const kvGet = (k) => idb("kv", "readonly", (s) => s.get(k));
const kvSet = (k, v) => idb("kv", "readwrite", (s) => s.put(v, k));
const underPrefix = (p) => [...files.keys()].filter((k) => k === p || k.startsWith(p === "/" ? "/" : p + "/"));
const statObj = (r) => ({ t: r.t, s: r.d ? r.d.length : 0, m: r.m, p: r.t === "d" ? 493 : 420 });
const need = (p) => { const r = files.get(abs(p)); if (!r) throw new Error("No such file or directory: " + p); return r; };

// ------------------------------------------------------------------------------------------ file RPC
async function rm(p) { p = abs(p); if (p.length < 6) throw new Error("Refusing to delete " + p); const ks = underPrefix(p); for (const k of ks) unlink(k); await idb("fs", "readwrite", (s) => { for (const k of ks) s.delete(k); }); }
async function copy(a, b) { a = abs(a); b = abs(b); if ((b + "/").startsWith(a + "/")) throw new Error("Cannot copy a folder into itself"); for (const k of underPrefix(a).sort()) { const r = files.get(k); const t = b + k.slice(a.length); if (r.t === "d") await mkdirp(t); else await put(t, r.d.slice()); } }
async function rename(a, b) { a = abs(a); b = abs(b); if (files.has(b)) throw new Error("Already exists: " + baseOf(b)); await copy(a, b); await rm(a); }
function walk(root, ignore, max) { const out = []; let truncated = false; const rec = (d, prefix) => { for (const n of [...(kids.get(d) || [])].sort()) { if (out.length >= max) { truncated = true; return; } const p = (d === "/" ? "" : d) + "/" + n; const r = files.get(p); if (!r) continue; const rel = prefix ? prefix + "/" + n : n; if (r.t === "d") { if (!ignore.has(n)) rec(p, rel); } else out.push(rel); } }; rec(root, ""); return { files: out, truncated }; }
function searchText(o) {
  const ignore = new Set([".git", "node_modules"]); let src = o.regex ? o.query : o.query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); if (o.wholeWord) src = `\\b(?:${src})\\b`;
  const re = new RegExp(src, "g" + (o.caseSensitive ? "" : "i"));
  const g2r = (g) => new RegExp("^" + g.trim().replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "\u0000").replace(/\*/g, "[^/]*").replace(/\u0000/g, ".*").replace(/\?/g, "[^/]") + "$");
  const inc = (o.include || []).filter((s) => s.trim()).map(g2r), exc = (o.exclude || []).filter((s) => s.trim()).map(g2r);
  const results = []; let nfiles = 0, scanned = 0, truncated = false; const { files: list } = walk(abs(o.root), ignore, 40000);
  for (const rel of list) {
    if (truncated) break; const n = baseOf(rel);
    if (inc.length && !inc.some((r) => r.test(rel) || r.test(n))) continue; if (exc.length && exc.some((r) => r.test(rel) || r.test(n))) continue;
    const full = norm(o.root + "/" + rel); const r = files.get(full); if (!r || r.d.length > 2e6 || r.d.subarray(0, 4000).includes(0)) continue; scanned++;
    const lines = dec.decode(r.d).split("\n"); let hit = false;
    for (let i = 0; i < lines.length && !truncated; i++) { const line = lines[i].replace(/\r$/, ""); re.lastIndex = 0; let m; while ((m = re.exec(line))) { if (!m[0].length) { re.lastIndex++; continue; } hit = true; results.push({ path: full, rel, line: i + 1, col: m.index + 1, len: m[0].length, text: line.slice(0, 300) }); if (results.length >= (o.max || 3000)) { truncated = true; break; } } }
    if (hit) nfiles++;
  }
  return { results, files: nfiles, scanned, truncated };
}
async function zipOut(srcs, base) {
  await lazy.jszip();
  const zip = new window.JSZip(); let count = 0;
  for (const s of srcs) for (const k of underPrefix(abs(s)).sort()) { const rel = k.slice(abs(base || dirOf(s)).length).replace(/^\//, ""); if (!rel) continue; const r = files.get(k); if (r.t === "d") zip.folder(rel); else { zip.file(rel, r.d); count++; } }
  return { bytes: await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }), count };
}
export function blobUrl(p) { const r = need(p); return URL.createObjectURL(new Blob([r.d || new Uint8Array()], { type: mimeOf(p) })); }
function download(name, bytes, type = "application/octet-stream") { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([bytes], { type })); a.download = name; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000); }

// ------------------------------------------------------------------------------------------ picking files from the device
const picked = new Map(); let pickSeq = 1;
function pickFiles({ directory = false, multiple = false, mimes } = {}) {
  return new Promise((res) => {
    const inp = document.createElement("input"); inp.type = "file"; inp.style.display = "none"; if (directory) inp.webkitdirectory = true; if (multiple) inp.multiple = true; if (mimes?.length) inp.accept = mimes.join(",");
    inp.onchange = () => { const list = [...inp.files]; inp.remove(); res(list); }; inp.oncancel = () => { inp.remove(); res([]); };
    document.body.append(inp); inp.click();
  });
}

// ------------------------------------------------------------------------------------------ secrets + PIN
let aesKey = null; const tokens = new Map();
async function key() { if (aesKey) return aesKey; aesKey = await kvGet("aes"); if (!aesKey) { aesKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]); await kvSet("aes", aesKey); } return aesKey; }
async function secrets() { const raw = await kvGet("secrets"); if (!raw) return {}; try { const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.iv }, await key(), raw.ct); return JSON.parse(dec.decode(pt)); } catch { return {}; } }
async function saveSecrets(o) { const iv = crypto.getRandomValues(new Uint8Array(12)); const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(), enc.encode(JSON.stringify(o))); await kvSet("secrets", { iv, ct }); }
const hashPin = async (pin, salt) => bytesToB64(new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 150000, hash: "SHA-256" }, await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveBits"]), 256)));
const issue = () => { const t = bytesToB64(crypto.getRandomValues(new Uint8Array(18))); tokens.set(t, Date.now() + 90000); return t; };
const valid = (t) => !!t && tokens.has(t) && tokens.get(t) > Date.now();
async function verify(pin) {
  const o = (await kvGet("pin")) || {}; if (!o.hash) return { ok: false, error: "No PIN is set" };
  const wait = Math.max(0, (o.until || 0) - Date.now()); if (wait > 0) return { ok: false, lockedMs: wait };
  if ((await hashPin(pin, b64ToBytes(o.salt))) === o.hash) { o.fails = 0; o.until = 0; await kvSet("pin", o); return { ok: true, token: issue() }; }
  o.fails = (o.fails || 0) + 1; let lockMs = 0; if (o.fails >= 5) { lockMs = 30000 * 2 ** Math.min(o.fails - 5, 6); o.until = Date.now() + lockMs; } await kvSet("pin", o);
  return { ok: false, lockedMs: lockMs, remaining: Math.max(0, 5 - o.fails) };
}
const mask = (v) => (v.length <= 8 ? "•".repeat(v.length) : v.slice(0, 3) + "•".repeat(Math.min(24, v.length - 7)) + v.slice(-4));

// ------------------------------------------------------------------------------------------ networking
const streams = new Map();
const corsProxy = () => { try { return localStorage.getItem("cf.corsProxy") || ""; } catch { return ""; } };
const viaProxy = (url) => { const p = corsProxy(); return p && /^https?:\/\/(github\.com|gitlab\.com|bitbucket\.org)\//.test(url) ? p.replace(/\/$/, "") + "/" + url.replace(/^https?:\/\//, "") : url; };
const reqInit = (o, extra = {}) => ({ method: o.method || "GET", headers: o.headers || {}, body: o.bodyB64 ? b64ToBytes(o.bodyB64) : o.body ?? undefined, ...extra });

// ------------------------------------------------------------------------------------------ live server (service worker)
// The real server is tools/web/live-sw.js: it answers <scope>__live/<port>/… from the IndexedDB filesystem, compiles JSX/TS and maps npm
// packages to esm.sh. Here we only register which folder is served on which "port".
let liveServers = null, liveBc = null;
async function liveMap() { if (!liveServers) { liveServers = new Map(); try { const o = (await kvGet("live")) || {}; for (const [p, v] of Object.entries(o)) liveServers.set(+p, { port: +p, root: v.root, spa: v.spa !== false }); } catch { /* none */ } } return liveServers; }
const liveSave = async () => kvSet("live", Object.fromEntries([...(await liveMap()).values()].map((v) => [v.port, { root: v.root, spa: v.spa }])));
let swScope = "";
const liveInfo = (v) => ({ port: v.port, root: v.root, spa: v.spa, lan: false, clients: 0, url: new URL(`__live/${v.port}/`, swScope || document.baseURI).href });
async function liveStart(o) {
  if (!("serviceWorker" in navigator) || !window.isSecureContext) throw new Error("The in-browser live server needs a secure page (https:// or localhost). Open this site over HTTPS.");
  let reg = await navigator.serviceWorker.getRegistration();
  if (!reg) throw new Error("The service worker is not registered yet. Reload the page once and try again.");
  const ready = await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 8000))]);
  if (!ready) throw new Error("The service worker is still starting. Wait a moment and try again.");
  swScope = ready.scope;
  const root = abs(o.root); if (files.get(root)?.t !== "d") throw new Error("Not a folder: " + root);
  const map = await liveMap(); const spa = o.spa !== false;
  const same = [...map.values()].find((v) => v.root === root); if (same) { if (same.spa !== spa) { same.spa = spa; await liveSave(); } return liveInfo(same); }
  let port = +o.port || 5500; while (map.has(port)) port++;
  map.set(port, { port, root, spa }); await liveSave();
  return liveInfo(map.get(port));
}

// ------------------------------------------------------------------------------------------ mini shell (terminal)
const shells = new Map(); let termSeq = 1;
const CRLF = (s) => s.replace(/\r?\n/g, "\r\n");
function runNode(code, cwd) {
  return new Promise((res) => {
    const src = `const out=[];const f=(...a)=>out.push(a.map(x=>typeof x==="string"?x:(()=>{try{return JSON.stringify(x)}catch{return String(x)}})()).join(" "));
const console={log:f,info:f,warn:f,error:f,debug:f};self.fetch=undefined;let err=null;try{(0,eval)(${JSON.stringify(code)}.replace(/^#!.*/,""))}catch(e){err=String(e&&e.stack||e)}
Promise.resolve().then(()=>new Promise(r=>setTimeout(r,50))).then(()=>postMessage({out:out.join("\\n"),err}));`;
    const url = URL.createObjectURL(new Blob([src], { type: "text/javascript" })); const w = new Worker(url); const t = setTimeout(() => { w.terminate(); res({ out: "", err: "Timed out after 10s" }); }, 10000);
    w.onmessage = (e) => { clearTimeout(t); w.terminate(); res(e.data); }; w.onerror = (e) => { clearTimeout(t); w.terminate(); res({ out: "", err: e.message }); };
  });
}
function createShell(emit, id, cwd, startLive) {
  const sh = { id, cwd, line: "", hist: [], hi: -1, busy: false, title: "web shell" };
  const w = (s) => emit("term.data", { id, b64: bytesToB64(enc.encode(s)) });
  const prompt = () => w(`\x1b[1;32mweb\x1b[0m:\x1b[1;34m${sh.cwd === HOME ? "~" : sh.cwd}\x1b[0m$ `);
  const P = (p) => (p.startsWith("/") ? norm(p) : norm(sh.cwd + "/" + p)); const e = (s) => w(CRLF(s) + "\r\n");
  const argv = (l) => { const out = []; const re = /"([^"]*)"|'([^']*)'|(\S+)/g; let m; while ((m = re.exec(l))) out.push(m[1] ?? m[2] ?? m[3]); return out; };
  const cmds = {
    help: () => e("Built-in commands: ls [-a] cd pwd cat echo mkdir touch rm [-r] mv cp clear node <file>|-e <code> open <file> history\nThis is a tiny shell running in your browser. The Android app has a real Linux terminal (bash, npm, git)."),
    pwd: () => e(sh.cwd), echo: (a) => e(a.join(" ")), clear: () => w("\x1b[2J\x1b[H"), history: () => e(sh.hist.map((h, i) => `${i + 1}  ${h}`).join("\n")),
    cd: (a) => { const t = a[0] ? P(a[0] === "~" ? HOME : a[0]) : HOME; if (files.get(t)?.t !== "d") return e(`cd: ${a[0]}: No such directory`); sh.cwd = t; },
    ls: (a) => { const all = a.includes("-a"); const t = P(a.find((x) => !x.startsWith("-")) || "."); const r = files.get(t); if (!r) return e(`ls: ${t}: No such file or directory`); if (r.t === "f") return e(baseOf(t)); const names = [...(kids.get(t) || [])].filter((n) => all || !n.startsWith(".")).sort(); w(names.map((n) => (files.get(norm(t + "/" + n))?.t === "d" ? `\x1b[1;34m${n}/\x1b[0m` : n)).join("  ") + "\r\n"); },
    cat: (a) => { for (const f of a) { const r = files.get(P(f)); e(r?.t === "f" ? dec.decode(r.d).replace(/\n$/, "") : `cat: ${f}: No such file`); } },
    mkdir: async (a) => { for (const f of a.filter((x) => !x.startsWith("-"))) await mkdirp(P(f)); }, touch: async (a) => { for (const f of a) if (!files.has(P(f))) await put(P(f), new Uint8Array()); },
    rm: async (a) => { const rec = a.some((x) => /^-\w*r/.test(x)); for (const f of a.filter((x) => !x.startsWith("-"))) { const p = P(f); const r = files.get(p); if (!r) e(`rm: ${f}: No such file`); else if (r.t === "d" && !rec) e(`rm: ${f}: is a directory (use -r)`); else await rm(p); } },
    mv: async (a) => { const [s, d] = a; if (!s || !d) return e("usage: mv SRC DEST"); let t = P(d); if (files.get(t)?.t === "d") t = norm(t + "/" + baseOf(s)); await rename(P(s), t).catch((x) => e("mv: " + x.message)); },
    cp: async (a) => { const [s, d] = a.filter((x) => !x.startsWith("-")); if (!s || !d) return e("usage: cp [-r] SRC DEST"); let t = P(d); if (files.get(t)?.t === "d") t = norm(t + "/" + baseOf(s)); await copy(P(s), t).catch((x) => e("cp: " + x.message)); },
    open: (a) => { for (const f of a) w(`\x1b]7770;open;${P(f)}\x07`); }, code: (a) => cmds.open(a),
    node: async (a) => { let code; if (a[0] === "-e") code = a.slice(1).join(" "); else { const r = files.get(P(a[0] || "")); if (!r) return e(a[0] ? `node: cannot find ${a[0]}` : "usage: node <file.js> | node -e <code>"); code = dec.decode(r.d); } const r = await runNode(code, sh.cwd); if (r.out) e(r.out); if (r.err) e("\x1b[31m" + r.err + "\x1b[0m"); },
  };
  async function exec(line) {
    const a = argv(line.trim()); if (!a.length) return; const c = a.shift();
    if (cmds[c]) { try { await cmds[c](a); } catch (x) { e(`${c}: ${x.message}`); } }
    else if (["npm", "npx", "yarn", "pnpm", "bun", "vite"].includes(c) && (c === "vite" || /(^|\s)(dev|start|serve|preview|vite)(\s|$)/.test(a.join(" ")))) {
      try {
        const s = await startLive({ root: sh.cwd, port: 5173, spa: true });
        e(`\x1b[1m  CodeForge in-browser dev server\x1b[0m\n\n  \x1b[32m➜\x1b[0m  Local:   ${s.url}\n\nServes HTML/CSS/JS, compiles JSX and TypeScript, loads npm packages from esm.sh. No Node.js here: server code and build steps need the Android app.`);
        w(`\x1b]7770;preview;${s.url}\x07`);
      } catch (x) { e(`\x1b[31m${x.message}\x1b[0m`); }
    }
    else if (["npm", "npx", "git", "python", "python3", "pip", "bash", "sh", "yarn", "pnpm", "bun", "vite", "tsc"].includes(c)) e(`\x1b[33m${c}: not available in the web version.\x1b[0m Install the CodeForge Android app for a real Linux environment.`);
    else e(`${c}: command not found (type \`help\`)`);
  }
  sh.input = async (s) => {
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (sh.busy) { if (ch === "\x03") { /* cannot interrupt */ } continue; }
      if (ch === "\x1b") { const m = /^\x1b\[([ABCD])/.exec(s.slice(i)); if (m) { i += 2; if (m[1] === "A" || m[1] === "B") { sh.hi = Math.max(-1, Math.min(sh.hist.length - 1, sh.hi + (m[1] === "A" ? 1 : -1))); const nl = sh.hi < 0 ? "" : sh.hist[sh.hist.length - 1 - sh.hi]; w("\r\x1b[K"); prompt(); w(nl); sh.line = nl; } } continue; }
      if (ch === "\r" || ch === "\n") { w("\r\n"); const l = sh.line; sh.line = ""; sh.hi = -1; if (l.trim()) sh.hist.push(l); sh.busy = true; try { await exec(l); } finally { sh.busy = false; } prompt(); }
      else if (ch === "\x7f" || ch === "\b") { if (sh.line) { sh.line = sh.line.slice(0, -1); w("\b \b"); } }
      else if (ch === "\x03") { sh.line = ""; w("^C\r\n"); prompt(); }
      else if (ch === "\x0c") { w("\x1b[2J\x1b[H"); prompt(); w(sh.line); }
      else if (ch >= " ") { sh.line += ch; w(ch); }
    }
  };
  setTimeout(() => { w("\x1b[2mCodeForge web shell — type `help`\x1b[0m\r\n"); prompt(); }, 30);
  return sh;
}

// ------------------------------------------------------------------------------------------ dispatcher
export function create(emit) {
  const ready = openDb();
  const crumbs = [];
  const H = {
    "sys.info": async () => ({ version: "web", pkg: "dev.codeforge.web", sdk: 0, abi: "web", device: "Browser", githubClientId: "", allFiles: true, paths: { home: HOME, files: "/", data: DATA, env: "/env", rootfs: "/rootfs", native: "", shared: SHARED, extensions: DATA + "/extensions", plugins: DATA + "/plugins" }, linux: { installed: false, supported: false }, web: true }),
    "sys.storageRoots": async () => [{ id: "workspace", label: "Workspace (this browser)", path: HOME, free: 0, total: 0 }, { id: "shared", label: "Shared", path: SHARED, free: 0, total: 0 }],
    "sys.hasAllFiles": async () => true, "sys.requestAllFiles": async () => true, "sys.takeIntent": async () => null,
    "sys.openUrl": async (u) => { if (!/^https?:\/\//i.test(u)) throw new Error("Only http(s) links can be opened"); window.open(u, "_blank", "noopener,noreferrer"); return true; },
    "sys.share": async (o) => { if (navigator.share) { await navigator.share({ title: o?.title, text: o?.text }).catch(() => {}); } return true; },
    "sys.clipboardGet": async () => navigator.clipboard.readText().catch(() => ""), "sys.clipboardSet": async (t) => { await navigator.clipboard.writeText(t).catch(() => {}); return true; },
    "sys.pickFile": async (o) => { const l = await pickFiles({ mimes: o?.mimes, multiple: !!o?.multiple }); return { files: l.map((f) => { const uri = "web-file:" + pickSeq++; picked.set(uri, f); return { name: f.name, uri, size: f.size }; }) }; },
    "sys.pickFolder": async () => { const l = await pickFiles({ directory: true }); if (!l.length) return null; const uri = "web-tree:" + pickSeq++; picked.set(uri, l); return { uri, name: (l[0].webkitRelativePath || "").split("/")[0] || "folder" }; },
    "sys.createFile": async () => null,
    "sys.importUri": async (uri, dest) => { const f = picked.get(uri); if (!f) throw new Error("File is no longer available"); picked.delete(uri); let d = abs(dest); if (files.get(d)?.t === "d") d = norm(d + "/" + f.name); await put(d, new Uint8Array(await f.arrayBuffer())); return { path: d, size: f.size }; },
    "sys.importTree": async (uri, dest) => { const l = picked.get(uri); if (!l) throw new Error("Folder is no longer available"); picked.delete(uri); let n = 0; const root = abs(dest); for (const f of l) { const rel = (f.webkitRelativePath || f.name).split("/").slice(1).join("/") || f.name; if (/(^|\/)(node_modules|\.git)\//.test(rel)) continue; await put(norm(root + "/" + rel), new Uint8Array(await f.arrayBuffer())); n++; } return { path: root, count: n }; },
    "sys.exportFile": async (src) => { const r = need(src); download(baseOf(src), r.d, mimeOf(src)); return true; },
    "sys.exportTree": async (src) => { const z = await zipOut([src]); download(baseOf(src) + ".zip", z.bytes, "application/zip"); return true; },
    "sys.exit": async () => true, "sys.setSecure": async () => true,

    "fs.list": async (p) => { p = abs(p); const r = files.get(p); if (!r) throw new Error("No such directory: " + p); if (r.t !== "d") throw new Error("Not a directory: " + p); return [...(kids.get(p) || [])].map((n) => ({ n, ...statObj(files.get(norm(p + "/" + n))) })); },
    "fs.stat": async (p) => { const r = files.get(abs(p)); return r ? statObj(r) : null; }, "fs.lstat": async (p) => H["fs.stat"](p), "fs.exists": async (p) => files.has(abs(p)),
    "fs.readText": async (p, o = {}) => { const r = need(p); if (r.t === "d") throw new Error("Is a directory: " + p); const res = { size: r.d.length, mtime: r.m }; if (r.d.length > (o.max ?? 12 * 1024 * 1024)) return { ...res, tooLarge: true }; if (r.d.subarray(0, 8000).includes(0)) return { ...res, binary: true }; const bom = r.d[0] === 0xef && r.d[1] === 0xbb && r.d[2] === 0xbf; return { ...res, text: dec.decode(bom ? r.d.subarray(3) : r.d), bom }; },
    "fs.readB64": async (p, off = 0, len = -1) => { const r = need(p); return bytesToB64(r.d.subarray(off, len < 0 ? undefined : off + len)); },
    "fs.writeText": async (p, text, o = {}) => { abs(p); const b = enc.encode(text); await put(abs(p), o.bom ? Uint8Array.from([0xef, 0xbb, 0xbf, ...b]) : b); return true; },
    "fs.writeB64": async (p, b64, append) => { p = abs(p); const b = b64ToBytes(b64); if (append && files.get(p)?.d) { const o = files.get(p).d; const n = new Uint8Array(o.length + b.length); n.set(o); n.set(b, o.length); await put(p, n); } else await put(p, b); return true; },
    "fs.mkdir": async (p) => { await mkdirp(abs(p)); return true; }, "fs.rm": async (p) => { await rm(p); return true; }, "fs.rename": async (a, b) => { await rename(a, b); return true; }, "fs.copy": async (a, b) => { await copy(a, b); return true; },
    "fs.tree": async (p, o = {}) => walk(abs(p), new Set(o.ignore?.length ? o.ignore : [".git", "node_modules"]), o.max || 30000),
    "fs.realpath": async (p) => abs(p), "fs.chmod": async () => true, "fs.token": async () => "web",
    "fs.symlink": async () => { throw new Error("Symlinks are not supported in the web version"); }, "fs.readlink": async () => { throw new Error("Not a symlink"); },
    "search.text": async (o) => searchText(o), "search.cancel": async () => true,
    "archive.zip": async (o) => { const z = await zipOut(o.src, o.base); await put(abs(o.dest), z.bytes); return { count: z.count }; },
    "archive.unzip": async (o) => { await lazy.jszip(); const zip = await window.JSZip.loadAsync(need(o.src).d); let count = 0; const root = abs(o.dest); for (const [name, e] of Object.entries(zip.files)) { const out = norm(root + "/" + name); if (out !== root && !out.startsWith(root + "/")) throw new Error("Blocked unsafe path in archive: " + name); if (e.dir) await mkdirp(out); else { await put(out, await e.async("uint8array")); count++; } } return { count }; },
    "archive.listZip": async (p) => { await lazy.jszip(); const zip = await window.JSZip.loadAsync(need(p).d); return Object.values(zip.files).map((e) => ({ name: e.name, size: 0, dir: e.dir })); },
    "archive.untar": async () => { throw new Error("tar archives are not supported in the web version"); },

    "net.request": async (o) => { const url = viaProxy(o.url); const r = await fetch(url, reqInit(o, { signal: o.timeoutMs ? AbortSignal.timeout(o.timeoutMs) : undefined })); const hs = {}; r.headers.forEach((v, k) => (hs[k] = v)); const buf = new Uint8Array(await r.arrayBuffer()); return { status: r.status, statusText: r.statusText, url: r.url, headers: hs, ...(o.as === "b64" ? { b64: bytesToB64(buf) } : { text: dec.decode(buf) }) }; },
    "net.stream": async (o) => { const ctl = new AbortController(); streams.set(o.id, ctl); (async () => { try { const r = await fetch(viaProxy(o.url), reqInit(o, { signal: ctl.signal })); const hs = {}; r.headers.forEach((v, k) => (hs[k] = v)); emit("net.head", { id: o.id, status: r.status, statusText: r.statusText, url: r.url, headers: hs }); const rd = r.body.getReader(); for (;;) { const { done, value } = await rd.read(); if (done) break; emit("net.chunk", { id: o.id, b64: bytesToB64(value) }); } emit("net.end", { id: o.id }); } catch (e) { emit("net.error", { id: o.id, message: String(e.message || e) + (/Failed to fetch|NetworkError/.test(String(e.message)) ? " (blocked by CORS? the web version can only reach servers that allow cross-origin requests)" : "") }); } finally { streams.delete(o.id); } })(); return true; },
    "net.abort": async (id) => { streams.get(id)?.abort(); return true; },
    "net.download": async (o) => { const r = await fetch(viaProxy(o.url), { headers: o.headers || {} }); if (!r.ok) throw new Error("HTTP " + r.status); const b = new Uint8Array(await r.arrayBuffer()); await put(abs(o.dest), b); emit("net.progress", { id: o.id, done: b.length, total: b.length }); return { path: o.dest, size: b.length }; },

    "secret.set": async (n, v) => { const o = await secrets(); o[n] = v; await saveSecrets(o); return true; }, "secret.has": async (n) => n in (await secrets()), "secret.delete": async (n) => { const o = await secrets(); delete o[n]; await saveSecrets(o); return true; }, "secret.names": async () => Object.keys(await secrets()),
    "secret.mask": async (n) => { const v = (await secrets())[n]; return v == null ? null : mask(v); },
    "secret.reveal": async (n, t) => { if (!valid(t)) throw new Error("Authentication required"); const v = (await secrets())[n]; if (v == null) throw new Error("No such key"); return v; },
    "auth.status": async () => { const o = (await kvGet("pin")) || {}; return { pinSet: !!o.hash, lockedMs: Math.max(0, (o.until || 0) - Date.now()), failures: o.fails || 0, biometric: false, deviceSecure: false, sdk: 0 }; },
    "auth.biometric": async () => ({ ok: false, unsupported: true }), "auth.verifyPin": async (p) => verify(String(p)),
    "auth.setPin": async (n, old) => { n = String(n); if (n.length < 4 || n.length > 32) return { ok: false, error: "PIN must be 4–32 characters" }; if (((await kvGet("pin")) || {}).hash) { const v = await verify(String(old || "")); if (!v.ok) return v; } const salt = crypto.getRandomValues(new Uint8Array(16)); await kvSet("pin", { salt: bytesToB64(salt), hash: await hashPin(n, salt), fails: 0, until: 0 }); return { ok: true, token: issue() }; },
    "auth.clearPin": async (p) => { const v = await verify(String(p)); if (!v.ok) return v; await kvSet("pin", {}); return { ok: true }; },
    "auth.valid": async (t) => valid(t), "auth.lock": async () => { tokens.clear(); return true; },

    "github.signedIn": async () => !!(await secrets())["github.token"], "github.signOut": async () => { const o = await secrets(); delete o["github.token"]; await saveSecrets(o); return true; },
    "github.user": async () => { const t = (await secrets())["github.token"]; const r = await fetch("https://api.github.com/user", { headers: { Authorization: "Bearer " + t, Accept: "application/vnd.github+json" } }); if (!r.ok) throw new Error("GitHub token rejected (HTTP " + r.status + ")"); return r.json(); },
    "github.deviceStart": async () => { throw new Error("GitHub device sign-in isn't available in the web version (GitHub blocks it from browsers). Paste a personal access token instead."); },
    "github.configureGit": async () => true,
    // ---- crash recorder (web): JS errors only, kept in this browser's IndexedDB key-value store
    "crash.list": async () => ((await kvGet("crashes")) || []).map(({ text, ...m }) => ({ ...m, size: text.length })).reverse(),
    "crash.unseen": async () => ((await kvGet("crashes")) || []).filter((c) => !c.seen).map(({ text, ...m }) => ({ ...m, size: text.length })).reverse(),
    "crash.read": async (id) => ((await kvGet("crashes")) || []).find((c) => c.id === id) || null,
    "crash.delete": async (id) => { await kvSet("crashes", ((await kvGet("crashes")) || []).filter((c) => c.id !== id)); return true; },
    "crash.clear": async () => { await kvSet("crashes", []); return true; },
    "crash.seen": async (ids) => { await kvSet("crashes", ((await kvGet("crashes")) || []).map((c) => (!ids || ids.includes(c.id) ? { ...c, seen: true } : c))); return true; },
    "crash.report": async (o) => { const ts = Date.now(), id = ts + "-" + (o.kind || "js-error") + "-" + Math.floor(Math.random() * 65535).toString(16); const text = `CodeForge web report\nTime: ${new Date(ts).toISOString()}\nKind: ${o.kind}\nBrowser: ${navigator.userAgent}\n\n== ${o.title} ==\n${o.detail || ""}\n\n-- breadcrumbs --\n${crumbs.join("\n")}\n`; const all = ((await kvGet("crashes")) || []).concat([{ id, ts, kind: o.kind || "js-error", title: o.title, fatal: !!o.fatal, process: "web", seen: false, text }]).slice(-40); await kvSet("crashes", all); return id; },
    "crash.crumbs": async (a) => { for (const l of a || []) { crumbs.push(new Date().toISOString().slice(11, 23) + " ui " + l); if (crumbs.length > 120) crumbs.shift(); } return true; },
    "crash.bundle": async (ids) => ((await kvGet("crashes")) || []).filter((c) => !ids || ids.includes(c.id)).map((c) => "=".repeat(60) + "\n" + c.text).join("\n\n") || "No reports.",
    "crash.diagnostics": async () => `CodeForge web\n${navigator.userAgent}\n\n-- breadcrumbs --\n${crumbs.slice(-60).join("\n")}`,
    "crash.takeRecovery": async () => null, "crash.testNative": async () => H["crash.report"]({ kind: "test", title: "Test report", detail: "Created from Settings → Diagnostics." }),
    "preview.open": async (o) => { window.open(o.url, "_blank", "noopener,noreferrer"); return true; },
    "term.ack": async () => true,
    "live.list": async () => [...(await liveMap()).values()].map(liveInfo), "live.stop": async (port) => { (await liveMap()).delete(+port); await liveSave(); return true; },
    "live.reload": async (port, rel) => { try { (liveBc ||= new BroadcastChannel("cf-live")).postMessage({ port: port == null ? null : +port, rel: rel || "" }); } catch { /* no BroadcastChannel */ } return true; },
    "live.start": async (o) => liveStart(o),
    "env.status": async () => ({ installed: false, supported: false }), "env.install": async () => { throw new Error("The Linux environment is only available in the Android app"); }, "env.reset": async () => true,
    "proc.exec": async () => { throw new Error("Running programs isn't possible in the web version"); },
    "term.create": async (o) => { const id = "w" + termSeq++; const sh = createShell(emit, id, o?.cwd && files.get(o.cwd)?.t === "d" ? o.cwd : HOME, liveStart); shells.set(id, sh); return { id, title: "web shell", mode: "host", cwd: sh.cwd }; },
    "term.write": async (id, b64) => { shells.get(id)?.input(dec.decode(b64ToBytes(b64))); return true; }, "term.resize": async () => true, "term.kill": async (id) => { shells.delete(id); emit("term.exit", { id, code: 0 }); return true; }, "term.close": async (id) => { shells.delete(id); return true; },
    "term.list": async () => [...shells.values()].map((s) => ({ id: s.id, title: s.title, mode: "host", cwd: s.cwd, alive: true })), "term.attach": async () => ({ replay: "" }), "term.rename": async (id, t) => { const s = shells.get(id); if (s) s.title = t; return true; },
  };
  return { async call(method, args) {
    await ready; const f = H[method];
    if (f) return f(...args);
    if (method.startsWith("sys.")) return true;
    throw new Error("Not available in the web version: " + method);
  } };
}
