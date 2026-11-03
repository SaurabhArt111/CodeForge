// Client side of the native bridge.
//   Android WebView : window.CFNative (WebMessageListener, origin restricted)
//   Dev host        : HTTP POST /__rpc + SSE /__events (tools/devhost)
//   Plain browser   : tiny in-memory demo backend so the page still opens
import { Emitter } from "./events.js";
import { b64ToBytes, bytesToB64, strToB64 } from "./util.js";

const ev = new Emitter();
export const bridgeEvents = ev;
let nextId = 1;
const waiting = new Map();
export let mode = "demo";

function handleIncoming(text) {
  let msg; try { msg = JSON.parse(text); } catch { return; }
  if (msg.ev) { ev.emit(msg.ev, msg.d); return; }
  const w = waiting.get(msg.id);
  if (!w) return;
  waiting.delete(msg.id);
  if (msg.ok) w.res(msg.r); else w.rej(new Error(msg.e || "Native call failed"));
}

let transport = null;
function detect() {
  if (window.CFNative && typeof window.CFNative.postMessage === "function") {
    mode = "android";
    window.CFNative.onmessage = (e) => handleIncoming(e.data);
    transport = (payload) => window.CFNative.postMessage(payload);
  } else if (location.protocol.startsWith("http") && !location.hostname.endsWith("androidplatform.net") && new URLSearchParams(location.search).get("demo") !== "1") {
    mode = "devhost";
    const es = new EventSource("/__events");
    es.onmessage = (e) => handleIncoming(e.data);
    transport = (payload) => {
      fetch("/__rpc", { method: "POST", body: payload }).then((r) => r.text()).then(handleIncoming).catch((err) => {
        const id = JSON.parse(payload).id; const w = waiting.get(id); if (w) { waiting.delete(id); w.rej(err); }
      });
    };
  } else {
    mode = "demo";
  }
}
detect();

export function call(method, ...args) {
  if (mode === "demo") return demoCall(method, args);
  return new Promise((res, rej) => {
    const id = nextId++;
    waiting.set(id, { res, rej });
    transport(JSON.stringify({ id, m: method, a: args }));
  });
}

// ---------------------------------------------------------------- typed wrappers
let fsToken = null;
const termQ = new Map();
const c = call;
export const N = {
  mode: () => mode,
  sys: {
    info: () => c("sys.info"), hasAllFiles: () => c("sys.hasAllFiles"), requestAllFiles: () => c("sys.requestAllFiles"),
    openUrl: (u) => c("sys.openUrl", u), share: (o) => c("sys.share", o), takeIntent: () => c("sys.takeIntent"),
    clipboardGet: () => c("sys.clipboardGet"), clipboardSet: (t) => c("sys.clipboardSet", t),
    notify: (o) => c("sys.notify", o), vibrate: (ms) => c("sys.vibrate", ms), toast: (t) => c("sys.toast", t),
    keepAwake: (on) => c("sys.keepAwake", on), setStatusBar: (hex, light) => c("sys.setStatusBar", hex, !!light),
    storageRoots: () => c("sys.storageRoots"),
    pickFile: (o = {}) => c("sys.pickFile", o), pickFolder: () => c("sys.pickFolder", {}), createFile: (o) => c("sys.createFile", o),
    importUri: (uri, dest) => c("sys.importUri", uri, dest), importTree: (uri, dest) => c("sys.importTree", uri, dest),
    exportFile: (src, uri) => c("sys.exportFile", src, uri), exportTree: (src, uri) => c("sys.exportTree", src, uri),
    exit: () => c("sys.exit"),
  },
  fs: {
    list: (p) => c("fs.list", p), stat: (p) => c("fs.stat", p), lstat: (p) => c("fs.lstat", p), exists: (p) => c("fs.exists", p),
    readText: (p, o = {}) => c("fs.readText", p, o), readB64: (p, off = 0, len = -1) => c("fs.readB64", p, off, len),
    async readBytes(p) { return b64ToBytes(await c("fs.readB64", p, 0, -1)); },
    writeText: (p, t, o = {}) => c("fs.writeText", p, t, o), writeB64: (p, b, append = false) => c("fs.writeB64", p, b, append),
    async writeBytes(p, bytes) {
      // chunked to keep single bridge messages reasonably small
      const CH = 3 * 1024 * 1024;
      if (bytes.length <= CH) return c("fs.writeB64", p, bytesToB64(bytes), false);
      await c("fs.writeB64", p, "", false);
      for (let i = 0; i < bytes.length; i += CH) await c("fs.writeB64", p, bytesToB64(bytes.subarray(i, i + CH)), true);
      return true;
    },
    mkdir: (p) => c("fs.mkdir", p), rm: (p) => c("fs.rm", p), rename: (a, b) => c("fs.rename", a, b), copy: (a, b) => c("fs.copy", a, b),
    symlink: (t, p) => c("fs.symlink", t, p), readlink: (p) => c("fs.readlink", p), chmod: (p, m) => c("fs.chmod", p, m), realpath: (p) => c("fs.realpath", p),
    tree: (p, o = {}) => c("fs.tree", p, o),
    async url(p) { fsToken ||= await c("fs.token"); return `${location.origin}/__fs__/${fsToken}${p.split("/").map(encodeURIComponent).join("/")}`; },
  },
  search: { text: (o) => c("search.text", o), cancel: (id) => c("search.cancel", id) },
  archive: { zip: (o) => c("archive.zip", o), unzip: (o) => c("archive.unzip", o), listZip: (p) => c("archive.listZip", p), untar: (o) => c("archive.untar", o) },
  net: {
    request: (o) => c("net.request", o), abort: (id) => c("net.abort", id), download: (o) => c("net.download", o),
    /** Streams a response. Returns {response: Promise<{status,headers}>, body: AsyncIterable<Uint8Array>, abort()} */
    stream(o) {
      const id = "s" + nextId++;
      const q = []; let wake = null, done = false, error = null;
      let headRes, headRej; const head = new Promise((r, j) => { headRes = r; headRej = j; });
      const push = () => { if (wake) { const w = wake; wake = null; w(); } };
      const offs = [
        ev.on("net.head", (d) => { if (d.id === id) headRes(d); }),
        ev.on("net.chunk", (d) => { if (d.id === id) { q.push(b64ToBytes(d.b64)); push(); } }),
        ev.on("net.end", (d) => { if (d.id === id) { done = true; push(); cleanup(); } }),
        ev.on("net.error", (d) => { if (d.id === id) { error = new Error(d.message); headRej(error); done = true; push(); cleanup(); } }),
      ];
      const cleanup = () => offs.forEach((f) => f());
      c("net.stream", { ...o, id }).catch((e) => { error = e; headRej(e); done = true; push(); cleanup(); });
      async function* body() {
        while (true) {
          if (q.length) { yield q.shift(); continue; }
          if (error) throw error;
          if (done) return;
          await new Promise((r) => (wake = r));
        }
      }
      return { id, head, body: body(), abort: () => { c("net.abort", id).catch(() => {}); done = true; push(); cleanup(); } };
    },
  },
  secret: { set: (n, v) => c("secret.set", n, v), has: (n) => c("secret.has", n), delete: (n) => c("secret.delete", n), names: () => c("secret.names") },
  github: {
    deviceStart: (clientId, scope) => c("github.deviceStart", clientId || "", scope), devicePoll: (clientId, code) => c("github.devicePoll", clientId || "", code),
    signedIn: () => c("github.signedIn"), user: () => c("github.user"), signOut: () => c("github.signOut"),
    configureGit: (name, email, login) => c("github.configureGit", name || "", email || "", login),
  },
  live: {
    start: (o) => c("live.start", o), stop: (port) => c("live.stop", port), list: () => c("live.list"), reload: (port, path) => c("live.reload", port ?? null, path || ""),
  },
  term: {
    create: (o) => c("term.create", o), write: (id, b64) => c("term.write", id, b64),
    // Input must reach the PTY in order, but bridge calls are dispatched concurrently (thread pool / parallel HTTP).
    // So keystrokes are queued per session, coalesced, and sent one RPC at a time.
    writeStr(id, s) {
      let q = termQ.get(id); if (!q) termQ.set(id, (q = { buf: "", busy: false, waiters: [] }));
      q.buf += s;
      return new Promise((res, rej) => {
        q.waiters.push({ res, rej });
        if (q.busy) return;
        q.busy = true;
        (async () => {
          while (q.buf) {
            const chunk = q.buf, ws = q.waiters; q.buf = ""; q.waiters = [];
            try { await c("term.write", id, strToB64(chunk)); ws.forEach((w) => w.res(true)); } catch (e) { ws.forEach((w) => w.rej(e)); }
          }
          q.busy = false; if (!q.buf) termQ.delete(id);
        })();
      });
    },
    resize: (id, r, cl) => c("term.resize", id, r, cl), kill: (id) => c("term.kill", id), close: (id) => c("term.close", id),
    list: () => c("term.list"), attach: (id) => c("term.attach", id), rename: (id, t) => c("term.rename", id, t),
  },
  env: { status: () => c("env.status"), install: () => c("env.install"), reset: () => c("env.reset") },
  proc: { exec: (o) => c("proc.exec", o) },
  on: (name, fn) => ev.on(name, fn),
};

// ---------------------------------------------------------------- demo backend (plain browser, no native host)
const demo = { files: new Map([["/home/README.md", "# CodeForge demo\n\nYou are running in a plain browser without the native host.\nStart the app on Android, or run `node tools/devhost/server.js`.\n"], ["/home/hello.js", "console.log('hello');\n"]]) };
async function demoCall(method, a) {
  const D = demo.files;
  const dirs = () => { const s = new Set(["/", "/home"]); for (const f of D.keys()) { let d = f.slice(0, f.lastIndexOf("/")); while (d && !s.has(d)) { s.add(d); d = d.slice(0, d.lastIndexOf("/")); } } return s; };
  switch (method) {
    case "sys.info": return { version: "demo", pkg: "demo", sdk: 0, abi: "browser", device: "Browser", githubClientId: "", allFiles: true, paths: { home: "/home", files: "/", data: "/data", env: "/env", rootfs: "/rootfs", native: "", shared: "/shared", extensions: "/data/extensions", plugins: "/data/plugins" }, linux: { installed: false, supported: false }, demo: true };
    case "fs.list": { const p = a[0].replace(/\/$/, ""); const out = new Map(); for (const f of D.keys()) if (f.startsWith(p + "/")) { const rest = f.slice(p.length + 1); const n = rest.split("/")[0]; out.set(n, rest.includes("/") ? { n, t: "d", s: 0, m: 0, p: 493 } : { n, t: "f", s: D.get(f).length, m: Date.now(), p: 420 }); } return [...out.values()]; }
    case "fs.stat": case "fs.lstat": { const p = a[0]; if (D.has(p)) return { t: "f", s: D.get(p).length, m: Date.now(), p: 420 }; if (dirs().has(p)) return { t: "d", s: 0, m: 0, p: 493 }; return null; }
    case "fs.exists": return D.has(a[0]) || dirs().has(a[0]);
    case "fs.readText": if (!D.has(a[0])) throw new Error("No such file: " + a[0]); return { text: D.get(a[0]), size: D.get(a[0]).length, mtime: Date.now() };
    case "fs.writeText": D.set(a[0], a[1]); return true;
    case "fs.mkdir": return true;
    case "fs.rm": for (const k of [...D.keys()]) if (k === a[0] || k.startsWith(a[0] + "/")) D.delete(k); return true;
    case "fs.rename": for (const k of [...D.keys()]) if (k === a[0] || k.startsWith(a[0] + "/")) { D.set(a[1] + k.slice(a[0].length), D.get(k)); D.delete(k); } return true;
    case "fs.tree": return { files: [...D.keys()].filter((k) => k.startsWith(a[0] + "/")).map((k) => k.slice(a[0].length + 1)), truncated: false };
    case "sys.storageRoots": return [{ id: "workspace", label: "Workspace", path: "/home", free: 0, total: 0 }];
    case "term.list": case "live.list": case "secret.names": return [];
    case "sys.hasAllFiles": case "secret.has": case "github.signedIn": return false;
    case "env.status": return { installed: false, supported: false };
    case "sys.takeIntent": return null;
    default: if (method.startsWith("sys.")) return true; throw new Error("Not available in demo mode: " + method);
  }
}
