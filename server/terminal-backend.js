// CodeForge — local terminal + workspace backend.
//
// This is the ONE piece of CodeForge that is not a pure static frontend: it's a small,
// optional, local-only Node service that gives the in-browser Terminal panel a REAL shell
// (bash/zsh/PowerShell/cmd — whatever's installed) instead of a simulation, plus a real
// on-disk folder for the currently-open project so tools like git/npm/pip actually have
// files to work with.
//
// It is shared, unmodified, by three entry points:
//   - server.js               (`node server.js` / `npm run serve:simple`)
//   - vite.config.mjs `dev`   (`npm run dev`)
//   - vite.config.mjs preview (`npm run preview`)
//
// Design goals, in priority order:
//   1. Never touch anything outside its own workspace sandbox directory.
//   2. Never be reachable from any origin other than this app itself (mitigates the classic
//      "malicious webpage on another tab opens a WebSocket to your local dev server and runs
//      shell commands as you" DNS-rebinding / CSRF class of attack that hit tools like
//      webpack-dev-server in the past).
//   3. Degrade gracefully: if `node-pty` isn't installed/buildable, fall back to a plain
//      child_process shell (no real TTY, but git/npm/node/python still run). If `ws` isn't
//      installed, the whole backend politely disables itself and CodeForge's frontend falls
//      back to its fully-simulated in-browser terminal. Nothing ever hard-crashes the static
//      file server over this.
//
// Nothing here is ever contacted unless the person deploying CodeForge chooses to run one of
// the local Node entry points above. A plain static deploy (Netlify/Vercel/GitHub
// Pages/`vite build`) never includes or executes this file.

"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { spawn } = require("child_process");

let WebSocketServer = null;
try { WebSocketServer = require("ws").Server; } catch (e) { /* optional dep not installed */ }

let pty = null;
try { pty = require("node-pty"); } catch (e) { /* optional dep not installed / failed native build */ }

const IS_WIN = process.platform === "win32";

/* ============================== small utils ============================== */

function genId() {
  return crypto.randomBytes(9).toString("base64url");
}

function safeSlug(input, fallback) {
  const s = String(input || "").trim().replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 64);
  return s || fallback;
}

// Resolves `rel` inside `base`, guaranteeing the result can never escape `base` via `..`,
// absolute paths, drive letters, or NUL bytes. Throws on any attempt.
function safeJoin(base, rel) {
  rel = String(rel == null ? "" : rel);
  if (rel.indexOf("\0") !== -1) throw new Error("Invalid path");
  const normalizedBase = path.resolve(base);
  const resolved = path.resolve(normalizedBase, "." + path.sep + rel.replace(/^[/\\]+/, ""));
  if (resolved !== normalizedBase && resolved.indexOf(normalizedBase + path.sep) !== 0) {
    throw new Error("Path escapes workspace sandbox: " + rel);
  }
  return resolved;
}

function readJsonBody(req, maxBytes) {
  return new Promise(function (resolve, reject) {
    let total = 0;
    const chunks = [];
    req.on("data", function (c) {
      total += c.length;
      if (total > maxBytes) { reject(Object.assign(new Error("Request body too large"), { statusCode: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", function () {
      if (!chunks.length) { resolve({}); return; }
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); }
      catch (e) { reject(Object.assign(new Error("Invalid JSON body"), { statusCode: 400 })); }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function defaultShell() {
  if (IS_WIN) return process.env.COMSPEC || "cmd.exe";
  return process.env.SHELL || "/bin/bash";
}

// Directories/files never included in tree listings, never deleted, never overwritten by a
// push-to-disk sync. This is what lets real tools (npm install, git init/clone, pip -m venv,
// build output, …) coexist safely with files the browser's virtual filesystem manages.
const IGNORE_NAMES = new Set([
  "node_modules", ".git", "dist", "build", "out", ".next", ".nuxt", ".output", ".svelte-kit",
  "__pycache__", ".venv", "venv", "env", ".mypy_cache", ".pytest_cache", ".cache",
  ".parcel-cache", "coverage", ".turbo", ".vercel", ".DS_Store", "target", ".codeforge",
]);

/* ============================== the backend ============================== */

// options: { workspaceRoot, port, extraAllowedOrigins:[] }
function createTerminalBackend(options) {
  const workspaceRoot = options.workspaceRoot;
  const port = options.port;
  const extraAllowedOrigins = options.extraAllowedOrigins || [];
  fs.mkdirSync(workspaceRoot, { recursive: true });
  try { fs.writeFileSync(path.join(workspaceRoot, ".gitignore"), "*\n"); } catch (e) { /* non-fatal */ }

  const enabled = !!WebSocketServer;
  const hasPty = !!pty;

  /** @type {Map<string, Session>} */
  const sessions = new Map();
  let wss = null;
  if (enabled) {
    wss = new WebSocketServer({ noServer: true });
  }

  function allowedOrigins() {
    const set = new Set(extraAllowedOrigins);
    set.add("http://localhost:" + port);
    set.add("http://127.0.0.1:" + port);
    set.add("http://[::1]:" + port);
    return set;
  }

  // Mitigates cross-site requests (a malicious page in another tab) from ever reaching this
  // command-execution surface. Real browser fetch()/XHR/WebSocket calls always send an Origin
  // header; when present it must be this app's own loopback origin. Checked by hostname rather
  // than exact port so it stays correct even if Vite auto-increments its dev port when the
  // configured one is busy. Non-browser tools (curl, etc.) that omit Origin entirely are
  // allowed through, matching how a bare local dev server behaves.
  function originOk(req) {
    const origin = req.headers.origin;
    if (!origin) return true;
    if (allowedOrigins().has(origin)) return true;
    try {
      const u = new URL(origin);
      return u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "::1");
    } catch (e) { return false; }
  }

  function projectDir(projectId) {
    const slug = safeSlug(projectId, "project");
    return safeJoin(workspaceRoot, slug);
  }

  function ensureProjectDir(projectId) {
    const dir = projectDir(projectId);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  function manifestPath(projectId) {
    return path.join(ensureProjectDir(projectId), ".codeforge", "manifest.json");
  }
  function readManifest(projectId) {
    try { return JSON.parse(fs.readFileSync(manifestPath(projectId), "utf8")); }
    catch (e) { return { paths: [] }; }
  }
  function writeManifest(projectId, paths) {
    const mp = manifestPath(projectId);
    fs.mkdirSync(path.dirname(mp), { recursive: true });
    fs.writeFileSync(mp, JSON.stringify({ paths: paths, syncedAt: Date.now() }));
  }

  /* -------- sessions -------- */

  function publicSession(s) {
    return {
      id: s.id, title: s.title, projectId: s.projectId, cwd: s.relCwd, shell: s.shellLabel,
      usesPty: s.usesPty, status: s.status, cols: s.cols, rows: s.rows,
      createdAt: s.createdAt, exitCode: s.exitCode, exitSignal: s.exitSignal,
    };
  }

  function broadcastControl(s, obj) {
    const frame = "c" + JSON.stringify(obj);
    s.sockets.forEach(function (ws) { try { ws.send(frame); } catch (e) {} });
  }
  function broadcastData(s, text) {
    s.scrollback.push(text);
    s.scrollbackBytes += text.length;
    while (s.scrollbackBytes > 400000 && s.scrollback.length > 1) {
      s.scrollbackBytes -= s.scrollback[0].length;
      s.scrollback.shift();
    }
    const frame = "d" + text;
    s.sockets.forEach(function (ws) { try { ws.send(frame); } catch (e) {} });
  }

  function spawnProcess(s) {
    const env = Object.assign({}, process.env, {
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
      CODEFORGE: "1",
    });
    if (hasPty) {
      const shellPath = s.shellOverride || defaultShell();
      const args = IS_WIN ? [] : [];
      const proc = pty.spawn(shellPath, args, {
        name: "xterm-256color",
        cols: s.cols || 80,
        rows: s.rows || 24,
        cwd: s.absCwd,
        env: env,
      });
      s.usesPty = true;
      s.shellLabel = shellPath;
      s.proc = proc;
      s.status = "running";
      proc.onData(function (data) { if (s.proc === proc) broadcastData(s, data); });
      proc.onExit(function (e) {
        // Guard against a race on restart: killSession() here is followed synchronously by a
        // fresh spawnProcess() reassigning s.proc, but this OLD process's exit event still
        // fires asynchronously afterward. Without this check it would incorrectly mark the
        // brand-new process as exited.
        if (s.proc !== proc) return;
        s.status = "exited";
        s.exitCode = e.exitCode;
        s.exitSignal = e.signal || null;
        broadcastControl(s, { type: "exit", code: e.exitCode, signal: e.signal || null });
      });
    } else {
      // No node-pty available (e.g. no C++ build toolchain on this machine). Best-effort
      // fallback: a plain piped child process. Non-interactive commands (git, npm, node
      // scripts, python) work fine; full-screen TUIs (vim, htop, less) won't render correctly
      // since there's no real TTY — CodeForge tells the person this up front in the panel.
      const shellPath = s.shellOverride || defaultShell();
      const args = IS_WIN ? ["/Q"] : ["-i"];
      const proc = spawn(shellPath, args, { cwd: s.absCwd, env: env, stdio: ["pipe", "pipe", "pipe"] });
      s.usesPty = false;
      s.shellLabel = shellPath + " (no PTY)";
      s.proc = proc;
      s.status = "running";
      proc.stdout.on("data", function (d) { if (s.proc === proc) broadcastData(s, d.toString("utf8")); });
      proc.stderr.on("data", function (d) { if (s.proc === proc) broadcastData(s, d.toString("utf8")); });
      proc.on("exit", function (code, signal) {
        if (s.proc !== proc) return; // stale event from a process a restart has already replaced
        s.status = "exited";
        s.exitCode = code;
        s.exitSignal = signal || null;
        broadcastControl(s, { type: "exit", code: code, signal: signal || null });
      });
      proc.on("error", function (err) {
        if (s.proc !== proc) return;
        broadcastData(s, "\r\n\x1b[31mFailed to start shell: " + err.message + "\x1b[0m\r\n");
      });
    }
  }

  function createSession(opts) {
    const id = genId();
    const relCwd = (opts.cwd || "").replace(/^\/+/, "");
    const absCwd = safeJoin(ensureProjectDir(opts.projectId), relCwd);
    fs.mkdirSync(absCwd, { recursive: true });
    const s = {
      id: id,
      projectId: opts.projectId,
      relCwd: relCwd,
      absCwd: absCwd,
      title: opts.title || "Terminal",
      shellOverride: opts.shell || null,
      cols: opts.cols || 80,
      rows: opts.rows || 24,
      status: "starting",
      usesPty: false,
      shellLabel: "",
      exitCode: null,
      exitSignal: null,
      createdAt: Date.now(),
      proc: null,
      sockets: new Set(),
      scrollback: [],
      scrollbackBytes: 0,
    };
    sessions.set(id, s);
    spawnProcess(s);
    return s;
  }

  function killSession(s, hard) {
    if (!s.proc) return;
    try {
      if (s.usesPty) s.proc.kill(hard ? "SIGKILL" : "SIGTERM");
      else { s.proc.kill(hard ? "SIGKILL" : "SIGTERM"); }
    } catch (e) { /* already dead */ }
  }

  function restartSession(s) {
    killSession(s, true);
    s.status = "starting";
    s.exitCode = null;
    s.exitSignal = null;
    s.scrollback = [];
    s.scrollbackBytes = 0;
    broadcastControl(s, { type: "restarting" });
    spawnProcess(s);
  }

  /* -------- tree / file listing for workspace pull -------- */

  function walkTree(rootAbs) {
    const files = [];
    const dirs = [];
    (function walk(dirAbs, relDir) {
      let entries;
      try { entries = fs.readdirSync(dirAbs, { withFileTypes: true }); } catch (e) { return; }
      entries.forEach(function (ent) {
        if (IGNORE_NAMES.has(ent.name)) return;
        const relPath = relDir ? relDir + "/" + ent.name : ent.name;
        const abs = path.join(dirAbs, ent.name);
        if (ent.isDirectory()) {
          dirs.push(relPath);
          walk(abs, relPath);
        } else if (ent.isFile()) {
          let st;
          try { st = fs.statSync(abs); } catch (e) { return; }
          files.push({ path: relPath, size: st.size, mtime: st.mtimeMs });
        }
      });
    })(rootAbs, "");
    return { files: files, dirs: dirs };
  }

  function looksBinary(buf) {
    const len = Math.min(buf.length, 8000);
    for (let i = 0; i < len; i++) { if (buf[i] === 0) return true; }
    return false;
  }

  function readFileForClient(rootAbs, relPath, maxBytes) {
    const abs = safeJoin(rootAbs, relPath);
    const st = fs.statSync(abs);
    if (st.size > maxBytes) {
      const err = new Error("File too large to pull (" + st.size + " bytes)");
      err.statusCode = 413;
      throw err;
    }
    const buf = fs.readFileSync(abs);
    if (looksBinary(buf)) return { path: relPath, isBinary: true, content: buf.toString("base64") };
    return { path: relPath, isBinary: false, content: buf.toString("utf8") };
  }

  /* -------- HTTP router: returns true if it handled the request -------- */

  function handleRequest(req, res) {
    let url;
    try { url = new URL(req.url, "http://" + (req.headers.host || "localhost")); }
    catch (e) { return false; }
    const p = url.pathname;
    if (p.indexOf("/api/terminal/") !== 0 && p.indexOf("/api/workspace/") !== 0) return false;

    if (!enabled) {
      sendJson(res, 503, { ok: false, error: "The 'ws' package isn't installed — run npm install." });
      return true;
    }
    if ((req.method === "POST" || req.method === "DELETE" || req.method === "PUT") && !originOk(req)) {
      sendJson(res, 403, { ok: false, error: "Origin not allowed" });
      return true;
    }

    try {
      // ---- capabilities ----
      if (p === "/api/terminal/health" && req.method === "GET") {
        sendJson(res, 200, {
          ok: true, hasPty: hasPty, platform: process.platform,
          defaultShell: defaultShell(), workspaceRoot: workspaceRoot, nodeVersion: process.version,
        });
        return true;
      }

      // ---- sessions ----
      if (p === "/api/terminal/sessions" && req.method === "GET") {
        const projectId = url.searchParams.get("projectId");
        const list = [];
        sessions.forEach(function (s) { if (!projectId || s.projectId === projectId) list.push(publicSession(s)); });
        sendJson(res, 200, { sessions: list });
        return true;
      }
      if (p === "/api/terminal/sessions" && req.method === "POST") {
        readJsonBody(req, 1024 * 1024).then(function (body) {
          if (!body.projectId || !safeSlug(body.projectId, "")) { sendJson(res, 400, { ok: false, error: "projectId required" }); return; }
          const s = createSession(body);
          sendJson(res, 200, { session: publicSession(s) });
        }).catch(function (err) { sendJson(res, err.statusCode || 400, { ok: false, error: err.message }); });
        return true;
      }
      let m = p.match(/^\/api\/terminal\/sessions\/([^/]+)$/);
      if (m && req.method === "DELETE") {
        const s = sessions.get(m[1]);
        if (!s) { sendJson(res, 404, { ok: false, error: "No such session" }); return true; }
        killSession(s, true);
        sessions.delete(m[1]);
        sendJson(res, 200, { ok: true });
        return true;
      }
      m = p.match(/^\/api\/terminal\/sessions\/([^/]+)\/restart$/);
      if (m && req.method === "POST") {
        const s = sessions.get(m[1]);
        if (!s) { sendJson(res, 404, { ok: false, error: "No such session" }); return true; }
        restartSession(s);
        sendJson(res, 200, { session: publicSession(s) });
        return true;
      }

      // ---- workspace sync ----
      m = p.match(/^\/api\/workspace\/([^/]+)\/sync$/);
      if (m && req.method === "POST") {
        const projectId = m[1];
        readJsonBody(req, 60 * 1024 * 1024).then(function (body) {
          const root = ensureProjectDir(projectId);
          const files = Array.isArray(body.files) ? body.files : [];
          const allPaths = Array.isArray(body.allPaths) ? body.allPaths : files.map(function (f) { return f.path; });
          let written = 0;
          files.forEach(function (f) {
            if (!f || !f.path) return;
            const abs = safeJoin(root, f.path);
            fs.mkdirSync(path.dirname(abs), { recursive: true });
            if (f.isBinary && f.dataUrl) {
              const b64 = String(f.dataUrl).split(",")[1] || "";
              fs.writeFileSync(abs, Buffer.from(b64, "base64"));
            } else {
              fs.writeFileSync(abs, f.content || "", "utf8");
            }
            written++;
          });
          const prevManifest = readManifest(projectId).paths || [];
          const nextSet = new Set(allPaths);
          let deleted = 0;
          prevManifest.forEach(function (relPath) {
            if (nextSet.has(relPath)) return;
            try {
              const abs = safeJoin(root, relPath);
              if (fs.existsSync(abs) && fs.statSync(abs).isFile()) { fs.unlinkSync(abs); deleted++; }
            } catch (e) { /* best-effort */ }
          });
          writeManifest(projectId, allPaths);
          sendJson(res, 200, { ok: true, root: root, written: written, deleted: deleted });
        }).catch(function (err) { sendJson(res, err.statusCode || 400, { ok: false, error: err.message }); });
        return true;
      }
      m = p.match(/^\/api\/workspace\/([^/]+)\/tree$/);
      if (m && req.method === "GET") {
        const root = ensureProjectDir(m[1]);
        const t = walkTree(root);
        sendJson(res, 200, { root: root, files: t.files, dirs: t.dirs });
        return true;
      }
      m = p.match(/^\/api\/workspace\/([^/]+)\/file$/);
      if (m && req.method === "GET") {
        const root = ensureProjectDir(m[1]);
        const rel = url.searchParams.get("path") || "";
        try { sendJson(res, 200, readFileForClient(root, rel, 8 * 1024 * 1024)); }
        catch (err) { sendJson(res, err.statusCode || 404, { ok: false, error: err.message }); }
        return true;
      }
      m = p.match(/^\/api\/workspace\/([^/]+)\/files$/);
      if (m && req.method === "POST") {
        const root = ensureProjectDir(m[1]);
        readJsonBody(req, 1024 * 1024).then(function (body) {
          const paths = Array.isArray(body.paths) ? body.paths : [];
          const out = []; const missing = [];
          paths.forEach(function (rel) {
            try { out.push(readFileForClient(root, rel, 8 * 1024 * 1024)); }
            catch (e) { missing.push(rel); }
          });
          sendJson(res, 200, { files: out, missing: missing });
        }).catch(function (err) { sendJson(res, err.statusCode || 400, { ok: false, error: err.message }); });
        return true;
      }
    } catch (err) {
      sendJson(res, 500, { ok: false, error: err.message });
      return true;
    }

    sendJson(res, 404, { ok: false, error: "Unknown terminal/workspace API route" });
    return true;
  }

  /* -------- WebSocket upgrade: returns true if it handled (or rejected) the upgrade -------- */

  function handleUpgrade(req, socket, head) {
    let url;
    try { url = new URL(req.url, "http://" + (req.headers.host || "localhost")); }
    catch (e) { return false; }
    const m = url.pathname.match(/^\/api\/terminal\/sessions\/([^/]+)\/socket$/);
    if (!m) return false;
    if (!enabled) { socket.destroy(); return true; }
    if (!originOk(req)) { socket.write("HTTP/1.1 403 Forbidden\r\n\r\n"); socket.destroy(); return true; }
    const s = sessions.get(m[1]);
    if (!s) { socket.write("HTTP/1.1 404 Not Found\r\n\r\n"); socket.destroy(); return true; }

    wss.handleUpgrade(req, socket, head, function (ws) {
      s.sockets.add(ws);
      // Replay buffered scrollback so a reconnecting/reloaded client sees history immediately,
      // and so sessions survive a page reload instead of looking dead.
      if (s.scrollback.length) { try { ws.send("d" + s.scrollback.join("")); } catch (e) {} }
      ws.send("c" + JSON.stringify({ type: "ready", usesPty: s.usesPty, shell: s.shellLabel, status: s.status, exitCode: s.exitCode }));
      ws.on("message", function (raw) {
        const msg = raw.toString();
        const tag = msg.charAt(0);
        const rest = msg.slice(1);
        if (tag === "d") {
          if (s.proc && s.status === "running") {
            if (s.usesPty) s.proc.write(rest);
            else { try { s.proc.stdin.write(rest); } catch (e) {} }
          }
        } else if (tag === "c") {
          let ctrl; try { ctrl = JSON.parse(rest); } catch (e) { return; }
          if (ctrl.type === "resize" && ctrl.cols && ctrl.rows) {
            s.cols = ctrl.cols; s.rows = ctrl.rows;
            if (s.usesPty && s.proc) { try { s.proc.resize(ctrl.cols, ctrl.rows); } catch (e) {} }
          }
        }
      });
      ws.on("close", function () { s.sockets.delete(ws); });
      ws.on("error", function () { s.sockets.delete(ws); });
    });
    return true;
  }

  function closeAll() {
    sessions.forEach(function (s) { killSession(s, true); });
    sessions.clear();
  }

  return {
    enabled: enabled,
    hasPty: hasPty,
    handleRequest: handleRequest,
    handleUpgrade: handleUpgrade,
    closeAll: closeAll,
  };
}

module.exports = { createTerminalBackend: createTerminalBackend };
