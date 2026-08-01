// CodeForge — browser IDE. Single client-side app. No server, no accounts, no telemetry.
// Everything is stored on-device (IndexedDB) and nothing is ever uploaded anywhere.
(function () {
"use strict";

/* ============================== ICONS ============================== */
const ICON_PATHS = {
  "files": '<rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>',
  "search": '<circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>',
  "settings": '<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>',
  "split": '<rect x="3" y="3" width="8" height="18" rx="1"></rect><rect x="13" y="3" width="8" height="18" rx="1"></rect>',
  "command": '<polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line>',
  "menu": '<line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line>',
  "upload": '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line>',
  "folder-upload": '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path><polyline points="9.5 15.5 12 13 14.5 15.5"></polyline><line x1="12" y1="13" x2="12" y2="19"></line>',
  "archive": '<polyline points="21 8 21 21 3 21 3 8"></polyline><rect x="1" y="3" width="22" height="5"></rect><line x1="10" y1="12" x2="14" y2="12"></line>',
  "download": '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line>',
  "refresh": '<polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>',
  "chevron-right": '<polyline points="9 18 15 12 9 6"></polyline>',
  "chevron-down": '<polyline points="6 9 12 15 18 9"></polyline>',
  "folder": '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>',
  "folder-open": '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>',
  "file": '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline>',
  "file-plus": '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line>',
  "folder-plus": '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path><line x1="12" y1="11" x2="12" y2="17"></line><line x1="9" y1="14" x2="15" y2="14"></line>',
  "x": '<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>',
  "edit": '<path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>',
  "trash": '<polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line>',
  "copy": '<rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>',
  "lock": '<rect x="3" y="11" width="18" height="11" rx="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path>',
  "image": '<rect x="3" y="3" width="18" height="18" rx="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline>',
  "code": '<polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline>',
  "check": '<polyline points="20 6 9 17 4 12"></polyline>',
  "corner-side": '<polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line>',
  "globe": '<circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>',
  "external-link": '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line>',
  "clipboard": '<rect x="8" y="2" width="8" height="4" rx="1"></rect><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>',
  "projects": '<rect x="3" y="3" width="7" height="7" rx="1.5"></rect><rect x="14" y="3" width="7" height="7" rx="1.5"></rect><rect x="3" y="14" width="7" height="7" rx="1.5"></rect><rect x="14" y="14" width="7" height="7" rx="1.5"></rect>',
  "git-branch": '<line x1="6" y1="3" x2="6" y2="15"></line><circle cx="18" cy="6" r="3"></circle><circle cx="6" cy="18" r="3"></circle><path d="M18 9a9 9 0 0 1-9 9"></path>',
  "git-commit": '<circle cx="12" cy="12" r="4"></circle><line x1="1.05" y1="12" x2="8" y2="12"></line><line x1="16" y1="12" x2="22.95" y2="12"></line>',
  "cloud-upload": '<path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25"></path><polyline points="12 12 16 16 20 12"></polyline><line x1="16" y1="16" x2="16" y2="21"></line>',
  "key": '<circle cx="7" cy="15" r="4"></circle><line x1="10.5" y1="11.5" x2="21" y2="1"></line><line x1="17" y1="5" x2="20" y2="8"></line><line x1="14" y1="8" x2="17" y2="11"></line>',
};
function iconSvg(name, extraClass) {
  const d = ICON_PATHS[name] || ICON_PATHS["file"];
  return '<svg class="icon' + (extraClass ? " " + extraClass : "") + '" viewBox="0 0 24 24">' + d + "</svg>";
}
function iconSvgColored(name, color, extraClass) {
  const d = ICON_PATHS[name] || ICON_PATHS["file"];
  return '<svg class="icon' + (extraClass ? " " + extraClass : "") + '" style="color:' + color + '" viewBox="0 0 24 24">' + d + "</svg>";
}
/* Lightweight original color-coded file/folder icon scheme (inspired by the general idea behind
   themes like Material Icon Theme — quick color scanning by file type — but using our own outline
   icon set and colors, not that theme's artwork). */
const EXT_COLORS = {
  js: "#f0db4f", mjs: "#f0db4f", cjs: "#f0db4f", jsx: "#5ed4f4",
  ts: "#3178c6", tsx: "#3178c6",
  json: "#f0c419", jsonc: "#f0c419",
  html: "#e44d26", htm: "#e44d26",
  css: "#2965f1", scss: "#cc6699", sass: "#cc6699", less: "#1d5fa8",
  py: "#4b8bbe", java: "#e0964b", c: "#a4a4a4", h: "#a4a4a4",
  cpp: "#f34b7d", cc: "#f34b7d", cxx: "#f34b7d", hpp: "#f34b7d",
  cs: "#a074c4", go: "#00acd7", rs: "#dea584", rb: "#cc342d",
  php: "#8892bf", swift: "#f05138", kt: "#a97bff", dart: "#39cefd",
  md: "#6aa1c7", markdown: "#6aa1c7", yml: "#c7263e", yaml: "#c7263e",
  xml: "#e08845", sql: "#e0a030", sh: "#89e051", bash: "#89e051", zsh: "#89e051",
  txt: "#b0b0b0", vue: "#41b883", svelte: "#ff3e00",
  png: "#af7ee0", jpg: "#af7ee0", jpeg: "#af7ee0", gif: "#af7ee0",
  webp: "#af7ee0", bmp: "#af7ee0", ico: "#af7ee0", svg: "#ffb300",
  lock: "#8d8d8d", env: "#8fbc6b", toml: "#9c4221", ini: "#9c4221", cfg: "#9c4221",
};
const SPECIAL_FILE_COLORS = {
  "package.json": "#cb3837", "package-lock.json": "#cb3837", "yarn.lock": "#2c8ebb",
  "tsconfig.json": "#3178c6", ".gitignore": "#e0602b", ".gitattributes": "#e0602b",
  ".env": "#8fbc6b", "dockerfile": "#0db7ed", "readme.md": "#6aa1c7",
  "license": "#e0a030", "license.md": "#e0a030",
};
const SPECIAL_FOLDER_COLORS = {
  src: "#4fa8e0", source: "#4fa8e0", test: "#8bc34a", tests: "#8bc34a", "__tests__": "#8bc34a",
  spec: "#8bc34a", docs: "#e0964b", doc: "#e0964b", assets: "#af7ee0", public: "#4fc3a1",
  static: "#4fc3a1", dist: "#9e9e9e", build: "#9e9e9e", out: "#9e9e9e", node_modules: "#7a8a6a",
  ".git": "#e0602b", ".github": "#8a8a8a", config: "#9e9e9e", scripts: "#e0a030",
  styles: "#2965f1", style: "#2965f1", components: "#4fa8e0", pages: "#4fa8e0",
  api: "#f05138", vendor: "#9e9e9e", lib: "#9e9e9e", libs: "#9e9e9e", bin: "#9e9e9e",
};
function fileColorFor(path) {
  const bn = baseName(path).toLowerCase();
  if (SPECIAL_FILE_COLORS[bn]) return SPECIAL_FILE_COLORS[bn];
  const ext = extOf(path);
  return EXT_COLORS[ext] || "#c5c5c5";
}
function folderColorFor(path) {
  const bn = baseName(path).toLowerCase();
  return SPECIAL_FOLDER_COLORS[bn] || "#dcb67a";
}
function applyStaticIcons(root) {
  (root || document).querySelectorAll("[data-icon]").forEach(function (el) {
    const cls = el.className && el.className.indexOf("icon") !== -1 ? "" : "";
    el.innerHTML = iconSvg(el.getAttribute("data-icon"));
  });
}

/* ============================== UTILS ============================== */
function qs(sel, root) { return (root || document).querySelector(sel); }
function qsa(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }
function ce(tag, cls, html) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html !== undefined) el.innerHTML = html;
  return el;
}
function debounce(fn, ms) {
  let t = null;
  return function () {
    const args = arguments, ctx = this;
    clearTimeout(t);
    t = setTimeout(function () { fn.apply(ctx, args); }, ms);
  };
}
function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
function extOf(path) {
  const base = path.split("/").pop();
  const i = base.lastIndexOf(".");
  return i > 0 ? base.slice(i + 1).toLowerCase() : "";
}
function baseName(path) { return path.split("/").pop(); }
function dirName(path) { const i = path.lastIndexOf("/"); return i === -1 ? "" : path.slice(0, i); }
function joinPath(dir, name) { return dir ? dir + "/" + name : name; }
function formatBytes(n) {
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  return (n / (1024 * 1024)).toFixed(1) + " MB";
}
const BINARY_EXTS = ["png","jpg","jpeg","gif","webp","bmp","ico","woff","woff2","ttf","eot","otf",
  "mp3","wav","ogg","mp4","webm","mov","avi","pdf","zip","rar","7z","gz","tar","exe","dll","so",
  "bin","dat","class","jar","wasm","node","psd","ai","sketch","fig"];
const IMAGE_EXTS = ["png","jpg","jpeg","gif","webp","bmp","ico","svg"];
function isBinaryExt(ext) { return BINARY_EXTS.indexOf(ext) !== -1; }
function isImageExt(ext) { return IMAGE_EXTS.indexOf(ext) !== -1; }
function isHtmlExt(ext) { return ext === "html" || ext === "htm"; }
function copyToClipboard(text) {
  const ok = function () { toast("Copied to clipboard"); };
  const fallback = function () {
    try {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.focus(); ta.select();
      document.execCommand("copy");
      ta.remove();
      ok();
    } catch (e) { toast("Couldn't copy to clipboard", "error"); }
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(ok).catch(fallback);
  } else fallback();
}
function mimeFor(ext) {
  const m = { png:"image/png", jpg:"image/jpeg", jpeg:"image/jpeg", gif:"image/gif",
    webp:"image/webp", bmp:"image/bmp", ico:"image/x-icon", svg:"image/svg+xml" };
  return m[ext] || "application/octet-stream";
}

let toastSeq = 0;
function toast(msg, kind) {
  const c = qs("#toast-container");
  const el = ce("div", "toast" + (kind === "error" ? " error" : ""), msg);
  c.appendChild(el);
  requestAnimationFrame(function () { el.classList.add("show"); });
  const id = ++toastSeq;
  setTimeout(function () {
    el.classList.remove("show");
    setTimeout(function () { el.remove(); }, 200);
  }, kind === "error" ? 4200 : 2200);
}
// A toast that stays visible (with a small spinner) for the duration of an async operation,
// then morphs in place into a success/error toast — instead of a plain "X…" toast followed by
// a second, separate toast once the work finishes.
function toastProgress(msg) {
  const c = qs("#toast-container");
  const el = ce("div", "toast progress");
  const spinner = ce("span", "toast-spinner");
  const msgEl = ce("span", "toast-msg", escapeHtml(msg));
  el.appendChild(spinner); el.appendChild(msgEl);
  c.appendChild(el);
  requestAnimationFrame(function () { el.classList.add("show"); });
  let done = false;
  function finish(kind, text) {
    if (done) return;
    done = true;
    el.classList.remove("progress");
    if (spinner.parentNode) spinner.remove();
    if (kind === "error") el.classList.add("error");
    if (text !== undefined && text !== null) msgEl.textContent = text;
    setTimeout(function () {
      el.classList.remove("show");
      setTimeout(function () { el.remove(); }, 200);
    }, kind === "error" ? 4200 : 2200);
  }
  return {
    update: function (text) { msgEl.textContent = text; },
    success: function (text) { finish("success", text); },
    error: function (text) { finish("error", text); },
    // Dismiss quietly (used when a subsequent toast/UI change already communicates the outcome).
    close: function () { if (done) return; done = true; el.classList.remove("show"); setTimeout(function () { el.remove(); }, 200); },
  };
}

/* ============================== BUSY OVERLAY (full-workspace operations) ============================== */
// Shown for operations that swap out the whole workspace (opening a ZIP/folder/GitHub repo as a
// new project, switching between projects) so there's an unmistakable "please wait" signal and
// the user can't interact with a tree/tabs that are mid-replacement.
let busyDepth = 0;
function showBusy(label) {
  busyDepth++;
  const overlay = qs("#busy-overlay");
  const labelEl = qs("#busy-label");
  if (labelEl) labelEl.textContent = label || "Working\u2026";
  if (overlay) overlay.classList.add("show");
}
function hideBusy() {
  busyDepth = Math.max(0, busyDepth - 1);
  if (busyDepth > 0) return;
  const overlay = qs("#busy-overlay");
  if (overlay) overlay.classList.remove("show");
}

/* ============================== INLINE BUTTON LOADING STATE ============================== */
function setBtnLoading(btn, label) {
  if (!btn || btn.dataset.cfLoading === "1") return function () {};
  btn.dataset.cfLoading = "1";
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.classList.add("btn-loading");
  btn.innerHTML = '<span class="btn-spinner"></span><span>' + escapeHtml(label) + "</span>";
  let restored = false;
  return function restore() {
    if (restored) return;
    restored = true;
    btn.dataset.cfLoading = "0";
    btn.disabled = false;
    btn.classList.remove("btn-loading");
    // Only put the old contents back if nothing else has since replaced this button's markup
    // (renderGitPanel often rebuilds the whole panel on completion, which is fine either way).
    if (btn.isConnected) btn.innerHTML = original;
  };
}

/* ============================== GLOBAL ERROR SAFETY NET ============================== */
// Best-effort catch-all so a bug or an unexpected rejection somewhere never fails silently —
// every code path above this still handles its own errors with a specific, helpful message;
// this only catches what slips through (e.g. a storage write that was fired-and-forgotten).
let lastGlobalErrorToastAt = 0;
function notifyUnexpectedError(err) {
  const now = Date.now();
  if (now - lastGlobalErrorToastAt < 4000) return; // avoid toast storms from repeated/cascading errors
  lastGlobalErrorToastAt = now;
  const msg = (err && err.message) ? err.message : String(err || "Unknown error");
  try { toast("Something went wrong: " + msg, "error"); } catch (e) { /* toast container not ready yet */ }
}
window.addEventListener("error", function (e) {
  console.error("CodeForge: unhandled error", e.error || e.message);
  notifyUnexpectedError(e.error || e.message);
});
window.addEventListener("unhandledrejection", function (e) {
  console.error("CodeForge: unhandled promise rejection", e.reason);
  notifyUnexpectedError(e.reason);
  e.preventDefault();
});

/* ============================== INDEXEDDB LAYER ============================== */
const DB_NAME = "codeforge-db";
const DB_VERSION = 2;
let _db = null;
function idbOpen() {
  if (_db) return Promise.resolve(_db);
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("This browser doesn't support local storage (IndexedDB), which CodeForge needs to save your work. Try a different browser, or turn off private/incognito mode."));
  }
  return new Promise(function (resolve, reject) {
    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (err) {
      reject(new Error("Couldn't open local storage: " + (err && err.message ? err.message : "it may be disabled in this browser (private/incognito mode often blocks it).")));
      return;
    }
    req.onupgradeneeded = function (e) {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("nodes")) db.createObjectStore("nodes", { keyPath: "path" });
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
      if (!db.objectStoreNames.contains("projects")) db.createObjectStore("projects", { keyPath: "id" });
      if (!db.objectStoreNames.contains("project_snapshots")) db.createObjectStore("project_snapshots", { keyPath: "id" });
    };
    req.onsuccess = function (e) { _db = e.target.result; resolve(_db); };
    req.onerror = function (e) {
      const err = e.target.error;
      reject(new Error("Couldn't open local storage" + (err && err.message ? ": " + err.message : "") + "."));
    };
    req.onblocked = function () {
      reject(new Error("Local storage is blocked by another open CodeForge tab \u2014 close other CodeForge tabs and reload."));
    };
  });
}
function idbTx(storeName, mode) {
  return idbOpen().then(function (db) { return db.transaction(storeName, mode).objectStore(storeName); });
}
function idbGetAllNodes() {
  return idbTx("nodes", "readonly").then(function (store) {
    return new Promise(function (resolve, reject) {
      const req = store.getAll();
      req.onsuccess = function () { resolve(req.result || []); };
      req.onerror = function () { reject(req.error); };
    });
  });
}
function idbPutNode(node) {
  return idbTx("nodes", "readwrite").then(function (store) {
    return new Promise(function (resolve, reject) {
      const req = store.put(node);
      req.onsuccess = function () { resolve(); };
      req.onerror = function () { reject(req.error); };
    });
  });
}
function idbPutNodesBulk(nodes) {
  return idbOpen().then(function (db) {
    return new Promise(function (resolve, reject) {
      const tx = db.transaction("nodes", "readwrite");
      const store = tx.objectStore("nodes");
      nodes.forEach(function (n) { store.put(n); });
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error); };
    });
  });
}
function idbDeleteNode(path) {
  return idbTx("nodes", "readwrite").then(function (store) {
    return new Promise(function (resolve, reject) {
      const req = store.delete(path);
      req.onsuccess = function () { resolve(); };
      req.onerror = function () { reject(req.error); };
    });
  });
}
function idbClearNodes() {
  return idbTx("nodes", "readwrite").then(function (store) {
    return new Promise(function (resolve, reject) {
      const req = store.clear();
      req.onsuccess = function () { resolve(); };
      req.onerror = function () { reject(req.error); };
    });
  });
}
function idbGetMeta(key) {
  return idbTx("meta", "readonly").then(function (store) {
    return new Promise(function (resolve, reject) {
      const req = store.get(key);
      req.onsuccess = function () { resolve(req.result ? req.result.value : null); };
      req.onerror = function () { reject(req.error); };
    });
  });
}
function idbSetMeta(key, value) {
  return idbTx("meta", "readwrite").then(function (store) {
    return new Promise(function (resolve, reject) {
      const req = store.put({ key: key, value: value });
      req.onsuccess = function () { resolve(); };
      req.onerror = function () { reject(req.error); };
    });
  });
}
function idbClearMeta() {
  return idbTx("meta", "readwrite").then(function (store) {
    return new Promise(function (resolve, reject) {
      const req = store.clear();
      req.onsuccess = function () { resolve(); };
      req.onerror = function () { reject(req.error); };
    });
  });
}
function idbListProjects() {
  return idbTx("projects", "readonly").then(function (store) {
    return new Promise(function (resolve, reject) {
      const req = store.getAll();
      req.onsuccess = function () { resolve(req.result || []); };
      req.onerror = function () { reject(req.error); };
    });
  });
}
function idbPutProjectMeta(entry) {
  return idbTx("projects", "readwrite").then(function (store) {
    return new Promise(function (resolve, reject) {
      const req = store.put(entry);
      req.onsuccess = function () { resolve(); };
      req.onerror = function () { reject(req.error); };
    });
  });
}
function idbDeleteProjectMeta(id) {
  return idbTx("projects", "readwrite").then(function (store) {
    return new Promise(function (resolve, reject) {
      const req = store.delete(id);
      req.onsuccess = function () { resolve(); };
      req.onerror = function () { reject(req.error); };
    });
  });
}
function idbGetProjectSnapshot(id) {
  return idbTx("project_snapshots", "readonly").then(function (store) {
    return new Promise(function (resolve, reject) {
      const req = store.get(id);
      req.onsuccess = function () { resolve(req.result || null); };
      req.onerror = function () { reject(req.error); };
    });
  });
}
function idbPutProjectSnapshot(id, data) {
  return idbTx("project_snapshots", "readwrite").then(function (store) {
    return new Promise(function (resolve, reject) {
      const req = store.put(Object.assign({ id: id }, data));
      req.onsuccess = function () { resolve(); };
      req.onerror = function () { reject(req.error); };
    });
  });
}
function idbDeleteProjectSnapshot(id) {
  return idbTx("project_snapshots", "readwrite").then(function (store) {
    return new Promise(function (resolve, reject) {
      const req = store.delete(id);
      req.onsuccess = function () { resolve(); };
      req.onerror = function () { reject(req.error); };
    });
  });
}
function idbClearProjects() {
  return idbTx("projects", "readwrite").then(function (store) {
    return new Promise(function (resolve, reject) {
      const req = store.clear();
      req.onsuccess = function () { resolve(); };
      req.onerror = function () { reject(req.error); };
    });
  });
}
function idbClearProjectSnapshots() {
  return idbTx("project_snapshots", "readwrite").then(function (store) {
    return new Promise(function (resolve, reject) {
      const req = store.clear();
      req.onsuccess = function () { resolve(); };
      req.onerror = function () { reject(req.error); };
    });
  });
}

/* ============================== IN-MEMORY VFS ============================== */
// fs: Map<path, {path, type:'file'|'dir', content, isBinary, dataUrl, size, mtime}>
const fs = new Map();
let projectName = "";

function fsHasChildren(dirPath) {
  const prefix = dirPath ? dirPath + "/" : "";
  for (const p of fs.keys()) {
    if (p !== dirPath && p.indexOf(prefix) === 0) return true;
  }
  return false;
}
function fsChildrenOf(dirPath) {
  const prefix = dirPath ? dirPath + "/" : "";
  const out = [];
  fs.forEach(function (node, p) {
    if (p === dirPath) return;
    if (p.indexOf(prefix) !== 0) return;
    const rest = p.slice(prefix.length);
    if (rest.indexOf("/") === -1) out.push(node);
  });
  out.sort(function (a, b) {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.path.toLowerCase().localeCompare(b.path.toLowerCase());
  });
  return out;
}
function fsEnsureDirs(path) {
  const parts = path.split("/");
  let cur = "";
  const created = [];
  for (let i = 0; i < parts.length - 1; i++) {
    cur = cur ? cur + "/" + parts[i] : parts[i];
    if (!fs.has(cur)) {
      const node = { path: cur, type: "dir", mtime: Date.now() };
      fs.set(cur, node);
      created.push(node);
    }
  }
  return created;
}
function fsSetFile(path, content, isBinary, dataUrl, size) {
  fsEnsureDirs(path);
  const node = { path: path, type: "file", content: isBinary ? "" : (content || ""), isBinary: !!isBinary, dataUrl: dataUrl || null, size: size || (content ? content.length : 0), mtime: Date.now() };
  fs.set(path, node);
  return node;
}
function fsSetDir(path) {
  fsEnsureDirs(path + "/x");
  if (!fs.has(path)) fs.set(path, { path: path, type: "dir", mtime: Date.now() });
}
function fsDeletePath(path) {
  const toDelete = [path];
  const prefix = path + "/";
  fs.forEach(function (_, p) { if (p.indexOf(prefix) === 0) toDelete.push(p); });
  toDelete.forEach(function (p) { fs.delete(p); idbDeleteNode(p); });
  return toDelete;
}
function fsRename(oldPath, newPath) {
  const node = fs.get(oldPath);
  if (!node) return [];
  const changed = [];
  if (node.type === "file") {
    fs.delete(oldPath); idbDeleteNode(oldPath);
    const n = Object.assign({}, node, { path: newPath, mtime: Date.now() });
    fsEnsureDirs(newPath);
    fs.set(newPath, n); idbPutNode(n);
    changed.push({ from: oldPath, to: newPath });
  } else {
    const prefix = oldPath + "/";
    const all = [oldPath];
    fs.forEach(function (_, p) { if (p.indexOf(prefix) === 0) all.push(p); });
    all.forEach(function (p) {
      const nn = p === oldPath ? newPath : newPath + p.slice(oldPath.length);
      const nd = Object.assign({}, fs.get(p), { path: nn, mtime: Date.now() });
      fs.delete(p); idbDeleteNode(p);
      fsEnsureDirs(nn);
      fs.set(nn, nd); idbPutNode(nd);
      changed.push({ from: p, to: nn });
    });
  }
  return changed;
}
function fsUniquePath(dir, wantedName) {
  let name = wantedName, i = 1;
  while (fs.has(joinPath(dir, name))) {
    const dot = wantedName.lastIndexOf(".");
    if (dot > 0) name = wantedName.slice(0, dot) + " (" + i + ")" + wantedName.slice(dot);
    else name = wantedName + " (" + i + ")";
    i++;
  }
  return joinPath(dir, name);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

/* ============================== APP STATE ============================== */
const state = {
  sidebarView: "explorer",
  sidebarCollapsed: false,
  mobileSidebarOpen: false,
  splitActive: false,
  mobileSplitOpen: false,
  isMobile: window.innerWidth <= 800,
  focusedPane: "primary",
  expandedDirs: new Set(),
  selectedPath: null,
  settings: { fontSize: 14, tabSize: 2, wordWrap: true, minimap: true, whitespace: false, theme: "vs-dark", autoSave: true },
  primary: { tabs: [], active: -1, previewIndex: -1 },
  secondary: { tabs: [], active: -1, previewIndex: -1 },
};
const editors = { primary: null, secondary: null, diff: null, diffPane: null };
const models = new Map(); // path -> { model, savedValue }
const dirtyPaths = new Set();
let monacoReady = false;

/* ============================== LANGUAGE DETECTION ============================== */
const LANG_ALIAS = {
  js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
  ts: "typescript", tsx: "typescript", py: "python", rb: "ruby", rs: "rust",
  go: "go", java: "java", c: "c", h: "c", cpp: "cpp", cc: "cpp", cxx: "cpp", hpp: "cpp",
  cs: "csharp", php: "php", html: "html", htm: "html", css: "css", scss: "scss",
  less: "less", json: "json", jsonc: "json", md: "markdown", markdown: "markdown",
  yml: "yaml", yaml: "yaml", xml: "xml", sql: "sql", sh: "shell", bash: "shell",
  zsh: "shell", ps1: "powershell", bat: "bat", cmd: "bat", kt: "kotlin", swift: "swift",
  lua: "lua", r: "r", dart: "dart", vue: "html", svelte: "html", txt: "plaintext",
  toml: "ini", ini: "ini", cfg: "ini", conf: "ini", dockerfile: "dockerfile",
  graphql: "graphql", gql: "graphql", proto: "proto", rst: "restructuredtext"
};
function detectLanguage(path) {
  const ext = extOf(path);
  const bn = baseName(path).toLowerCase();
  if (bn === "dockerfile") return "dockerfile";
  if (bn === "makefile") return "shell";
  if (!ext) return "plaintext";
  if (window.monaco) {
    const langs = monaco.languages.getLanguages();
    for (let i = 0; i < langs.length; i++) {
      const l = langs[i];
      if (l.extensions && l.extensions.indexOf("." + ext) !== -1) return l.id;
    }
  }
  return LANG_ALIAS[ext] || "plaintext";
}
function friendlyLangName(langId) {
  if (!window.monaco) return langId;
  const langs = monaco.languages.getLanguages();
  for (let i = 0; i < langs.length; i++) {
    if (langs[i].id === langId) return langs[i].aliases && langs[i].aliases[0] ? langs[i].aliases[0] : langId;
  }
  return langId;
}

/* ============================== TREE RENDERING ============================== */
function toggleDir(path) {
  if (state.expandedDirs.has(path)) state.expandedDirs.delete(path);
  else state.expandedDirs.add(path);
  renderTree();
}
function collapseAllExplorerFolders() {
  if (!state.expandedDirs.size) {
    toast("All folders are already collapsed");
    return;
  }
  state.expandedDirs.clear();
  renderTree();
  saveSessionDebounced();
  toast("Collapsed all folders");
}
function selectRow(path) {
  state.selectedPath = path;
  qsa(".tree-row.selected").forEach(function (r) { r.classList.remove("selected"); });
  const row = qs('.tree-row[data-path="' + cssEscape(path) + '"]');
  if (row) row.classList.add("selected");
}
function cssEscape(s) {
  return s.replace(/["\\]/g, "\\$&");
}
function renderTree() {
  const container = qs("#file-tree");
  container.innerHTML = "";
  const rootNameEl = qs("#project-root-name");
  if (fs.size === 0) {
    rootNameEl.textContent = "NO PROJECT OPEN";
    const hint = ce("div", "empty-hint");
    hint.innerHTML = "No project open yet.<br><br>Use the toolbar above to upload files or a folder, or open a ZIP project. You can also just start with a new file.";
    container.appendChild(hint);
    return;
  }
  rootNameEl.textContent = (projectName || "project").toUpperCase();
  const rootChildren = fsChildrenOf("");
  if (rootChildren.length === 0) {
    container.appendChild(ce("div", "empty-hint", "This project is empty."));
    return;
  }
  const frag = document.createDocumentFragment();
  rootChildren.forEach(function (node) { frag.appendChild(renderNode(node, 1)); });
  const inner = ce("div", "tree-inner");
  inner.appendChild(frag);
  container.appendChild(inner);
  if (state.selectedPath) selectRow(state.selectedPath);
}
function renderNode(node, depth) {
  const wrap = ce("div");
  wrap.dataset.wrapPath = node.path;
  const row = ce("div", "tree-row");
  row.dataset.path = node.path;
  row.style.paddingLeft = (depth * 14) + "px";
  const isDir = node.type === "dir";
  const expanded = state.expandedDirs.has(node.path);
  const chev = ce("span", "chev" + (isDir ? (expanded ? " open" : "") : " hidden-chev"), isDir ? iconSvg("chevron-right") : "");
  row.appendChild(chev);
  const iconName = isDir ? (expanded ? "folder-open" : "folder") : (isImageExt(extOf(node.path)) ? "image" : "file");
  const iconColor = isDir ? folderColorFor(node.path) : fileColorFor(node.path);
  const icon = ce("span", "row-icon" + (isDir ? " folder-icon" : ""), iconSvgColored(iconName, iconColor));
  row.appendChild(icon);
  const nameSpan = ce("span", "row-name", escapeHtml(baseName(node.path)));
  row.appendChild(nameSpan);
  wrap.appendChild(row);

  if (isDir) {
    const childrenWrap = ce("div", "tree-children" + (expanded ? " open" : ""));
    if (expanded) {
      fsChildrenOf(node.path).forEach(function (c) { childrenWrap.appendChild(renderNode(c, depth + 1)); });
    }
    wrap.appendChild(childrenWrap);
  }

  row.addEventListener("click", function () {
    selectRow(node.path);
    qs("#file-tree").focus();
    if (isDir) { toggleDir(node.path); }
    else {
      openFile(node.path, { preview: true });
      if (state.isMobile) closeMobileSidebar();
    }
  });
  row.addEventListener("dblclick", function () {
    if (!isDir) openFile(node.path, { preview: false });
  });
  row.addEventListener("contextmenu", function (e) {
    e.preventDefault();
    selectRow(node.path);
    openContextMenuForNode(node, e.clientX, e.clientY);
  });
  attachLongPress(row, function (x, y) {
    selectRow(node.path);
    openContextMenuForNode(node, x, y);
  });
  return wrap;
}

/* ============================== EXPLORER KEYBOARD NAVIGATION ============================== */
function visibleTreeRows() { return qsa(".tree-row", qs("#file-tree")); }
function initExplorerKeyNav() {
  const treeEl = qs("#file-tree");
  if (!treeEl || treeEl.__keyNavInit) return;
  treeEl.__keyNavInit = true;
  treeEl.setAttribute("tabindex", "0");
  treeEl.addEventListener("keydown", function (e) {
    const rows = visibleTreeRows();
    if (!rows.length) return;
    let idx = rows.findIndex(function (r) { return r.dataset.path === state.selectedPath; });
    if (e.key === "ArrowDown") {
      e.preventDefault();
      idx = idx === -1 ? 0 : Math.min(rows.length - 1, idx + 1);
      selectRow(rows[idx].dataset.path);
      rows[idx].scrollIntoView({ block: "nearest" });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      idx = idx === -1 ? 0 : Math.max(0, idx - 1);
      selectRow(rows[idx].dataset.path);
      rows[idx].scrollIntoView({ block: "nearest" });
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      if (idx === -1) return;
      const path = rows[idx].dataset.path, node = fs.get(path);
      if (node && node.type === "dir") {
        if (!state.expandedDirs.has(path)) { toggleDir(path); }
        else {
          const newRows = visibleTreeRows();
          const ni = newRows.findIndex(function (r) { return r.dataset.path === path; });
          if (newRows[ni + 1]) selectRow(newRows[ni + 1].dataset.path);
        }
      }
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      if (idx === -1) return;
      const path = rows[idx].dataset.path, node = fs.get(path);
      if (node && node.type === "dir" && state.expandedDirs.has(path)) toggleDir(path);
      else { const parent = dirName(path); if (parent) selectRow(parent); }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (idx === -1) return;
      const path = rows[idx].dataset.path, node = fs.get(path);
      if (node && node.type === "dir") toggleDir(path);
      else openFile(path, { preview: false });
    } else if (e.key === "F2") {
      if (idx !== -1) { e.preventDefault(); beginRename(rows[idx].dataset.path); }
    } else if (e.key === "Delete") {
      if (idx !== -1) { e.preventDefault(); deleteEntryWithConfirm(rows[idx].dataset.path); }
    }
  });
}

/* ============================== LONG PRESS (touch context menu) ============================== */
function attachLongPress(el, cb) {
  let timer = null, startX = 0, startY = 0, fired = false;
  el.addEventListener("touchstart", function (e) {
    if (e.touches.length !== 1) return;
    fired = false;
    startX = e.touches[0].clientX; startY = e.touches[0].clientY;
    timer = setTimeout(function () {
      fired = true;
      if (navigator.vibrate) navigator.vibrate(12);
      cb(startX, startY);
    }, 480);
  }, { passive: true });
  el.addEventListener("touchmove", function (e) {
    if (!timer) return;
    const dx = Math.abs(e.touches[0].clientX - startX), dy = Math.abs(e.touches[0].clientY - startY);
    if (dx > 10 || dy > 10) { clearTimeout(timer); timer = null; }
  }, { passive: true });
  el.addEventListener("touchend", function (e) {
    if (timer) { clearTimeout(timer); timer = null; }
    if (fired) { e.preventDefault(); }
  });
  el.addEventListener("touchcancel", function () { if (timer) { clearTimeout(timer); timer = null; } });
}

/* ============================== CONTEXT MENU ============================== */
function showContextMenu(items, x, y) {
  const menu = qs("#context-menu");
  menu.innerHTML = "";
  items.forEach(function (it) {
    if (it === "-") { menu.appendChild(ce("div", "ctx-sep")); return; }
    const row = ce("div", "ctx-item" + (it.danger ? " danger" : ""));
    row.innerHTML = iconSvg(it.icon || "file", "icon-sm") + "<span>" + escapeHtml(it.label) + "</span>";
    row.addEventListener("click", function () { hideContextMenu(); it.action(); });
    menu.appendChild(row);
  });
  menu.classList.add("show");
  const vw = window.innerWidth, vh = window.innerHeight;
  menu.style.left = Math.min(x, vw - 200) + "px";
  menu.style.top = Math.min(y, vh - (items.length * 34 + 20)) + "px";
}
function hideContextMenu() { qs("#context-menu").classList.remove("show"); }
document.addEventListener("click", function (e) {
  if (!qs("#context-menu").contains(e.target)) hideContextMenu();
});
document.addEventListener("scroll", hideContextMenu, true);

let fileClipboard = null; // {path, mode:'cut'|'copy'}
function isPathInsideOrEqual(candidateDir, ancestorPath) {
  return candidateDir === ancestorPath || candidateDir.indexOf(ancestorPath + "/") === 0;
}
function clipCopyPath(path) { fileClipboard = { path: path, mode: "copy" }; toast("Copied — right-click a folder to Paste"); }
function clipCutPath(path) { fileClipboard = { path: path, mode: "cut" }; toast("Cut — right-click a folder to Paste (move)"); }
function clipPaste(targetDir) {
  if (!fileClipboard) { toast("Nothing to paste", "error"); return; }
  const path = fileClipboard.path, mode = fileClipboard.mode;
  const node = fs.get(path);
  if (!node) { fileClipboard = null; toast("That item no longer exists", "error"); return; }
  if (node.type === "dir" && isPathInsideOrEqual(targetDir, path)) {
    toast("Can't paste a folder into itself or a subfolder of itself", "error");
    return;
  }
  if (mode === "cut") {
    const newPath = fsUniquePath(targetDir, baseName(path));
    if (newPath === path) { fileClipboard = null; return; }
    const changes = fsRename(path, newPath);
    remapOpenTabsAfterRename(changes);
    if (state.selectedPath === path) state.selectedPath = newPath;
    fileClipboard = null;
    state.expandedDirs.add(targetDir);
    renderTree();
    saveSessionDebounced();
    toast("Moved");
  } else {
    state.expandedDirs.add(targetDir);
    duplicateEntry(path, targetDir);
    toast("Pasted a copy");
  }
}
function openContextMenuForNode(node, x, y) {
  const isDir = node.type === "dir";
  const items = [];
  if (isDir) {
    items.push({ label: "New File", icon: "file-plus", action: function () { beginCreateEntry(node.path, "file"); } });
    items.push({ label: "New Folder", icon: "folder-plus", action: function () { beginCreateEntry(node.path, "dir"); } });
    items.push({ label: "Upload Files Here", icon: "upload", action: function () { window.__cfSetUploadTargetDir(node.path); qs("#file-input-files").click(); } });
    items.push({ label: "Upload Folder Here", icon: "folder-upload", action: function () { window.__cfSetUploadTargetDir(node.path); qs("#file-input-folder").click(); } });
    items.push("-");
  } else {
    items.push({ label: "Open to the Side", icon: "split", action: function () { openFile(node.path, { preview: false, pane: "secondary" }); } });
    if (isHtmlExt(extOf(node.path))) {
      items.push({ label: "Open with Live Server", icon: "globe", action: function () { openWithLiveServer(node.path); } });
      items.push({ label: "Open in Integrated Browser", icon: "external-link", action: function () { openIntegratedBrowser(node.path); } });
    }
    items.push({ label: "Download", icon: "download", action: function () { downloadSingleFile(node.path); } });
    items.push("-");
  }
  items.push({ label: "Rename", icon: "edit", action: function () { beginRename(node.path); } });
  items.push({ label: "Duplicate", icon: "copy", action: function () { duplicateEntry(node.path); } });
  items.push({ label: "Cut", icon: "corner-side", action: function () { clipCutPath(node.path); } });
  items.push({ label: "Copy", icon: "copy", action: function () { clipCopyPath(node.path); } });
  if (isDir && fileClipboard) items.push({ label: "Paste", icon: "clipboard", action: function () { clipPaste(node.path); } });
  items.push("-");
  items.push({ label: "Copy Path", icon: "clipboard", action: function () { copyToClipboard("/" + (projectName || "project") + "/" + node.path); } });
  items.push({ label: "Copy Relative Path", icon: "clipboard", action: function () { copyToClipboard(node.path); } });
  items.push("-");
  items.push({ label: "Delete", icon: "trash", danger: true, action: function () { deleteEntryWithConfirm(node.path); } });
  showContextMenu(items, x, y);
}
function openContextMenuForRoot(x, y) {
  const items = [
    { label: "New File", icon: "file-plus", action: function () { beginCreateEntry("", "file"); } },
    { label: "New Folder", icon: "folder-plus", action: function () { beginCreateEntry("", "dir"); } },
    { label: "Upload Files Here", icon: "upload", action: function () { window.__cfSetUploadTargetDir(""); qs("#file-input-files").click(); } },
    { label: "Upload Folder Here", icon: "folder-upload", action: function () { window.__cfSetUploadTargetDir(""); qs("#file-input-folder").click(); } },
    { label: "Collapse All Folders", icon: "chevron-down", action: function () { collapseAllExplorerFolders(); } },
  ];
  if (fileClipboard) { items.push("-"); items.push({ label: "Paste", icon: "clipboard", action: function () { clipPaste(""); } }); }
  showContextMenu(items, x, y);
}

/* ============================== CREATE / RENAME / DELETE / DUPLICATE ============================== */
function beginCreateEntry(parentDir, type) {
  ensureProjectContext().then(function () {
    beginCreateEntryInner(parentDir, type);
  });
}
function beginCreateEntryInner(parentDir, type) {
  state.expandedDirs.add(parentDir);
  renderTree();
  const wrap = parentDir ? qs('[data-wrap-path="' + cssEscape(parentDir) + '"]') : null;
  const childrenContainer = wrap ? wrap.querySelector(".tree-children") : qs("#file-tree");
  const depth = parentDir ? parentDir.split("/").length + 1 : 1;
  const row = ce("div", "tree-row");
  row.style.paddingLeft = (depth * 14) + "px";
  row.style.position = "relative";
  row.innerHTML = '<span class="chev' + (type === "dir" ? "" : " hidden-chev") + '">' + (type === "dir" ? iconSvg("chevron-right") : "") + '</span><span class="row-icon' + (type === "dir" ? " folder-icon" : "") + '">' + iconSvg(type === "dir" ? "folder" : "file") + '</span><span class="row-name editing-hidden">new</span>';
  const input = ce("input", "rename-input");
  input.value = type === "dir" ? "new-folder" : "new-file.txt";
  row.appendChild(input);
  if (childrenContainer) {
    childrenContainer.classList.add("open");
    childrenContainer.insertBefore(row, childrenContainer.firstChild);
  }
  input.focus();
  const dot = input.value.lastIndexOf(".");
  if (type === "file" && dot > 0) input.setSelectionRange(0, dot); else input.select();

  function commit() {
    const name = input.value.trim();
    row.remove();
    if (!name) return;
    const path = fsUniquePath(parentDir, name);
    if (type === "dir") { fsSetDir(path); idbPutNode(fs.get(path)); }
    else { fsSetFile(path, "", false, null, 0); idbPutNode(fs.get(path)); }
    renderTree();
    if (type === "file") openFile(path, { preview: false });
    saveSessionDebounced();
  }
  let done = false;
  input.addEventListener("keydown", function (e) {
    e.stopPropagation();
    if (e.key === "Enter") { done = true; commit(); }
    else if (e.key === "Escape") { done = true; row.remove(); }
  });
  input.addEventListener("blur", function () { if (!done) { done = true; commit(); } });
}

function beginRename(path) {
  const row = qs('.tree-row[data-path="' + cssEscape(path) + '"]');
  if (!row) return;
  const nameSpan = row.querySelector(".row-name");
  nameSpan.classList.add("editing-hidden");
  const input = ce("input", "rename-input");
  input.value = baseName(path);
  row.appendChild(input);
  input.focus();
  const dot = input.value.lastIndexOf(".");
  if (fs.get(path).type === "file" && dot > 0) input.setSelectionRange(0, dot); else input.select();
  let done = false;
  function commit() {
    const name = input.value.trim();
    input.remove(); nameSpan.classList.remove("editing-hidden");
    if (!name || name === baseName(path)) return;
    const newPath = joinPath(dirName(path), name);
    if (fs.has(newPath)) { toast("An item named \"" + name + "\" already exists here", "error"); return; }
    const changes = fsRename(path, newPath);
    remapOpenTabsAfterRename(changes);
    if (state.selectedPath === path) state.selectedPath = newPath;
    renderTree();
    saveSessionDebounced();
  }
  input.addEventListener("keydown", function (e) {
    e.stopPropagation();
    if (e.key === "Enter") { done = true; commit(); }
    else if (e.key === "Escape") { done = true; input.remove(); nameSpan.classList.remove("editing-hidden"); }
  });
  input.addEventListener("blur", function () { if (!done) { done = true; commit(); } });
}
function remapOpenTabsAfterRename(changes) {
  if (!changes || !changes.length) return;
  const map = {};
  changes.forEach(function (c) { map[c.from] = c.to; });
  ["primary", "secondary"].forEach(function (pane) {
    state[pane].tabs.forEach(function (t) {
      if (map[t.path]) {
        const oldModel = models.get(t.path);
        if (oldModel) { models.delete(t.path); models.set(map[t.path], oldModel); }
        t.path = map[t.path];
      }
    });
  });
  renderTabs("primary"); renderTabs("secondary");
}
function deleteEntryWithConfirm(path) {
  const node = fs.get(path);
  const label = node && node.type === "dir" ? "folder" : "file";
  if (!window.confirm('Delete "' + baseName(path) + '" ' + (label === "folder" ? "and everything inside it" : "") + "? This can't be undone.")) return;
  const deleted = fsDeletePath(path);
  deleted.forEach(function (p) {
    const m = models.get(p);
    if (m) { m.model.dispose(); models.delete(p); }
    dirtyPaths.delete(p);
    closePathEverywhere(p);
  });
  if (state.selectedPath && deleted.indexOf(state.selectedPath) !== -1) state.selectedPath = null;
  renderTree();
  saveSessionDebounced();
  toast("Deleted " + baseName(path));
}
function closePathEverywhere(path) {
  ["primary", "secondary"].forEach(function (pane) {
    const ps = state[pane];
    let idx;
    while ((idx = ps.tabs.findIndex(function (t) { return t.path === path; })) !== -1) {
      closeTab(pane, idx);
    }
  });
}
function duplicateEntry(path, targetDir) {
  const node = fs.get(path);
  if (!node) return;
  const destDir = targetDir !== undefined ? targetDir : dirName(path);
  if (node.type === "file") {
    const newPath = fsUniquePath(destDir, baseName(path));
    fsSetFile(newPath, node.content, node.isBinary, node.dataUrl, node.size);
    idbPutNode(fs.get(newPath));
  } else {
    const newRoot = fsUniquePath(destDir, baseName(path));
    const prefix = path + "/";
    fsSetDir(newRoot);
    idbPutNode(fs.get(newRoot));
    fs.forEach(function (n, p) {
      if (p.indexOf(prefix) === 0) {
        const np = newRoot + p.slice(path.length);
        if (n.type === "dir") { fsSetDir(np); } else { fsSetFile(np, n.content, n.isBinary, n.dataUrl, n.size); }
        idbPutNode(fs.get(np));
      }
    });
  }
  renderTree();
  saveSessionDebounced();
  toast("Duplicated");
}
function downloadSingleFile(path) {
  const node = fs.get(path);
  if (!node) return;
  let blob;
  if (node.isBinary && node.dataUrl) {
    const parts = node.dataUrl.split(",");
    const bin = atob(parts[1]);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    blob = new Blob([arr], { type: mimeFor(extOf(path)) });
  } else {
    blob = new Blob([node.content || ""], { type: "text/plain" });
  }
  const url = URL.createObjectURL(blob);
  const a = ce("a"); a.href = url; a.download = baseName(path);
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
}

/* ============================== TABS & EDITOR PANES ============================== */
function renderTabs(pane) {
  const container = qs(pane === "primary" ? "#tabs-primary" : "#tabs-secondary");
  if (!container) return;
  const fill = container.querySelector(".tab-fill");
  qsa(".tab", container).forEach(function (t) { t.remove(); });
  const ps = state[pane];
  ps.tabs.forEach(function (t, idx) {
    const tab = ce("div", "tab" + (idx === ps.active ? " active" : "") + (t.pinned ? "" : " preview") + (dirtyPaths.has(t.path) ? " dirty" : ""));
    tab.dataset.path = t.path;
    const iconName = isImageExt(extOf(t.path)) ? "image" : "file";
    tab.innerHTML = iconSvgColored(iconName, fileColorFor(t.path), "icon-sm") + '<span class="tab-name">' + escapeHtml(baseName(t.path)) + '</span><span class="tab-dot"></span><span class="tab-close">' + iconSvg("x", "icon-sm") + "</span>";
    tab.addEventListener("click", function (e) {
      if (e.target.closest(".tab-close")) { closeTab(pane, idx); return; }
      ps.active = idx; state.focusedPane = pane;
      activateEditorContent(pane, t.path);
      renderTabs(pane);
    });
    tab.addEventListener("dblclick", function (e) {
      if (e.target.closest(".tab-close")) return;
      if (!t.pinned) { t.pinned = true; if (ps.previewIndex === idx) ps.previewIndex = -1; renderTabs(pane); }
    });
    tab.addEventListener("contextmenu", function (e) {
      e.preventDefault();
      showContextMenu([
        { label: "Close", icon: "x", action: function () { closeTab(pane, idx); } },
        { label: "Close Others", icon: "x", action: function () { closeOthers(pane, idx); } },
        { label: "Close All", icon: "x", action: function () { closeAll(pane); } },
        "-",
        { label: "Reveal in Explorer", icon: "files", action: function () { revealInExplorer(t.path); } },
        { label: "Download", icon: "download", action: function () { downloadSingleFile(t.path); } },
      ], e.clientX, e.clientY);
    });
    container.insertBefore(tab, fill);
  });
}
// Promotes the (at most one) unpinned preview tab showing `path`, in any pane, to a permanent
// tab — same effect as double-clicking it. No-op if that path isn't the current preview tab.
function pinPreviewTabForPath(path) {
  let changed = false;
  ["primary", "secondary"].forEach(function (pane) {
    const ps = state[pane];
    if (ps.previewIndex !== -1 && ps.tabs[ps.previewIndex] && ps.tabs[ps.previewIndex].path === path) {
      ps.tabs[ps.previewIndex].pinned = true;
      ps.previewIndex = -1;
      renderTabs(pane);
      changed = true;
    }
  });
  if (changed) saveSessionDebounced();
}
function closeOthers(pane, keepIdx) {
  const ps = state[pane];
  const keepPath = ps.tabs[keepIdx].path;
  let guard = 0;
  while (ps.tabs.length > 1 && guard++ < 500) {
    const idx = ps.tabs.findIndex(function (t) { return t.path !== keepPath; });
    if (idx === -1) break;
    closeTab(pane, idx);
  }
}
function closeAll(pane) {
  let guard = 0;
  while (state[pane].tabs.length && guard++ < 500) closeTab(pane, 0);
}
function revealInExplorer(path) {
  let d = dirName(path);
  while (d) { state.expandedDirs.add(d); d = dirName(d); }
  switchSidebarView("explorer");
  if (state.isMobile) openMobileSidebar();
  renderTree();
  selectRow(path);
  const row = qs('.tree-row[data-path="' + cssEscape(path) + '"]');
  if (row) row.scrollIntoView({ block: "center" });
}

function setPaneOverlay(pane, mode) {
  const cid = pane === "primary" ? "editor-primary" : "editor-secondary";
  const container = document.getElementById(cid);
  if (!container) return;
  const monacoHost = document.getElementById("monaco-host-" + pane);
  const welcome = pane === "primary" ? document.getElementById("welcome-screen") : null;
  const bp = container.querySelector(".binary-preview:not(.split-empty-hint)");
  const browserEl = container.querySelector(".browser-preview");
  const diffEl = container.querySelector(".diff-preview");
  let ep = container.querySelector(".split-empty-hint");
  if (mode === "empty" && !ep) {
    ep = ce("div", "binary-preview split-empty-hint");
    ep.innerHTML = iconSvg("split", "icon-lg") + "<div>No file open in this pane</div><div style=\"font-size:11px;\">Pick a file from the explorer, or use “Open to the Side”.</div>";
    container.appendChild(ep);
  }
  if (welcome) welcome.classList.toggle("hidden", mode !== "welcome");
  if (monacoHost) monacoHost.classList.toggle("hidden", mode !== "editor");
  if (bp) bp.classList.toggle("hidden", mode !== "binary");
  if (ep) ep.classList.toggle("hidden", mode !== "empty");
  if (browserEl) browserEl.classList.toggle("hidden", mode !== "browser");
  if (diffEl) diffEl.classList.toggle("hidden", mode !== "diff");
}
function showBinaryPreview(pane, node) {
  const cid = pane === "primary" ? "editor-primary" : "editor-secondary";
  const container = document.getElementById(cid);
  let bp = container.querySelector(".binary-preview:not(.split-empty-hint)");
  if (!bp) { bp = ce("div", "binary-preview"); container.appendChild(bp); }
  const ext = extOf(node.path);
  if (isImageExt(ext) && node.dataUrl) {
    bp.innerHTML = '<img src="' + node.dataUrl + '" alt="" /><div>' + escapeHtml(baseName(node.path)) + " · " + formatBytes(node.size || 0) + "</div>";
  } else {
    bp.innerHTML = iconSvg("file", "icon-lg") + "<div>" + escapeHtml(baseName(node.path)) + '</div><div style="font-size:11px;">Binary file · ' + formatBytes(node.size || 0) + " · preview not available</div><button>Download file</button>";
    const btn = bp.querySelector("button");
    if (btn) btn.addEventListener("click", function () { downloadSingleFile(node.path); });
  }
  setPaneOverlay(pane, "binary");
  if (pane === state.focusedPane) { qs("#sb-lang").textContent = "Binary"; qs("#sb-position").textContent = ""; }
}
function ensureEditorCreated(pane) {
  if (pane === "secondary" && !editors.secondary) {
    editors.secondary = monaco.editor.create(document.getElementById("monaco-host-secondary"), Object.assign({ model: null }, editorOptions()));
    editors.secondary.onDidChangeCursorPosition(function (e) { if (state.focusedPane === "secondary") updatePositionStatus(e.position); });
    editors.secondary.onDidFocusEditorText(function () { state.focusedPane = "secondary"; });
    bindGlobalEditorCommands(editors.secondary);
  }
}
function activateEditorContent(pane, path) {
  const node = fs.get(path);
  if (!node) return;
  if (node.isBinary) {
    showBinaryPreview(pane, node);
  } else {
    ensureEditorCreated(pane);
    setPaneOverlay(pane, "editor");
    const entry = getOrCreateModel(path, node);
    editors[pane].setModel(entry.model);
    editors[pane].updateOptions(editorOptions());
    if (pane === state.focusedPane) updateStatusBarForModel(entry.model, path);
    setTimeout(function () { try { editors[pane].layout(); } catch (e) {} }, 30);
  }
}
function getOrCreateModel(path, node) {
  if (models.has(path)) return models.get(path);
  const lang = detectLanguage(path);
  let model;
  try { model = monaco.editor.createModel(node.content || "", lang, monaco.Uri.file("/" + path)); }
  catch (e) { model = monaco.editor.createModel(node.content || "", lang); }
  const entry = { model: model, savedValue: node.content || "" };
  models.set(path, entry);
  model.onDidChangeContent(function (e) {
    const isDirty = model.getValue() !== entry.savedValue;
    if (isDirty) dirtyPaths.add(path); else dirtyPaths.delete(path);
    // e.isFlush marks a full programmatic replace (model.setValue(), e.g. a git "discard change"
    // revert) rather than an actual edit — only real edits should promote a preview tab.
    if (!e.isFlush) pinPreviewTabForPath(path);
    renderTabs("primary"); renderTabs("secondary");
    if (state.settings.autoSave) schedulePersist(path);
  });
  return entry;
}
const persistTimers = new Map();
function schedulePersist(path) {
  if (persistTimers.has(path)) clearTimeout(persistTimers.get(path));
  persistTimers.set(path, setTimeout(function () { persistNow(path); persistTimers.delete(path); }, 600));
}
function persistNow(path) {
  const entry = models.get(path);
  const node = fs.get(path);
  if (!entry || !node) return;
  const val = entry.model.getValue();
  node.content = val; node.size = val.length; node.mtime = Date.now();
  idbPutNode(node);
  entry.savedValue = val;
  dirtyPaths.delete(path);
  renderTabs("primary"); renderTabs("secondary");
  notifyLiveReload();
}
function saveActive() {
  const ps = state[state.focusedPane];
  if (ps.active === -1 || !ps.tabs[ps.active]) return;
  const path = ps.tabs[ps.active].path;
  if (persistTimers.has(path)) { clearTimeout(persistTimers.get(path)); persistTimers.delete(path); }
  persistNow(path);
  toast("Saved " + baseName(path));
}
function openFile(path, opts) {
  opts = opts || {};
  const pane = opts.pane || state.focusedPane || "primary";
  if (pane === "secondary" && !state.splitActive) activateSplit(true);
  const node = fs.get(path);
  if (!node || node.type !== "file") return;
  const ps = state[pane];
  const existingIdx = ps.tabs.findIndex(function (t) { return t.path === path; });
  if (existingIdx !== -1) {
    ps.active = existingIdx;
    if (opts.preview === false && !ps.tabs[existingIdx].pinned) {
      ps.tabs[existingIdx].pinned = true;
      if (ps.previewIndex === existingIdx) ps.previewIndex = -1;
    }
  } else {
    const pin = opts.preview === false;
    if (!pin && ps.previewIndex !== -1 && ps.previewIndex < ps.tabs.length) {
      ps.tabs[ps.previewIndex] = { path: path, pinned: false };
      ps.active = ps.previewIndex;
    } else {
      ps.tabs.push({ path: path, pinned: pin });
      ps.active = ps.tabs.length - 1;
      if (!pin) ps.previewIndex = ps.active;
    }
  }
  state.focusedPane = pane;
  activateEditorContent(pane, path);
  renderTabs(pane);
  if (state.isMobile && pane === "secondary") openMobileSplit();
  saveSessionDebounced();
}
function closeTab(pane, index) {
  const ps = state[pane];
  if (index < 0 || index >= ps.tabs.length) return;
  const wasActive = ps.active === index;
  ps.tabs.splice(index, 1);
  if (ps.previewIndex === index) ps.previewIndex = -1;
  else if (ps.previewIndex > index) ps.previewIndex--;
  if (ps.tabs.length === 0) {
    ps.active = -1;
    setPaneOverlay(pane, pane === "primary" ? "welcome" : "empty");
    if (pane === state.focusedPane) updateStatusBarEmpty();
  } else if (wasActive) {
    ps.active = Math.min(index, ps.tabs.length - 1);
    activateEditorContent(pane, ps.tabs[ps.active].path);
  } else if (ps.active > index) {
    ps.active--;
  }
  renderTabs(pane);
  saveSessionDebounced();
}

/* ============================== MONACO SETUP ============================== */
function editorOptions() {
  return {
    theme: state.settings.theme,
    fontSize: state.settings.fontSize,
    tabSize: state.settings.tabSize,
    wordWrap: state.settings.wordWrap ? "on" : "off",
    minimap: { enabled: state.settings.minimap },
    renderWhitespace: state.settings.whitespace ? "all" : "none",
    automaticLayout: true,
    fixedOverflowWidgets: true,
    // Adds comfortable blank scroll space below the last line (roughly one screenful, like
    // VS Code's default) — purely extra scroll room, it never adds phantom lines to the gutter
    // or affects the file's actual line count.
    scrollBeyondLastLine: true,
    smoothScrolling: true,
    cursorBlinking: "smooth",
    padding: { top: 8, bottom: 8 },
  };
}
function createPrimaryEditor() {
  editors.primary = monaco.editor.create(document.getElementById("monaco-host-primary"), Object.assign({ model: null }, editorOptions()));
  editors.primary.onDidChangeCursorPosition(function (e) { if (state.focusedPane === "primary") updatePositionStatus(e.position); });
  editors.primary.onDidFocusEditorText(function () { state.focusedPane = "primary"; });
  bindGlobalEditorCommands(editors.primary);
}
function bindGlobalEditorCommands(ed) {
  ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, function () { saveActive(); });
  ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyN, function () { beginCreateEntry("", "file"); });
  ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyB, function () { if (state.isMobile) toggleMobileSidebar(); else toggleSidebarCollapse(); });
  ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Backslash, function () { activateSplit(!state.splitActive); });
  ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyP, function () { openQuickOpen(); });
  ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyP, function () { openCommandPalette(); });
}
function applyOptionsToAllEditors() {
  const o = editorOptions();
  if (editors.primary) editors.primary.updateOptions(o);
  if (editors.secondary) editors.secondary.updateOptions(o);
}
function updatePositionStatus(pos) {
  qs("#sb-position").textContent = "Ln " + pos.lineNumber + ", Col " + pos.column;
}
function updateStatusBarForModel(model) {
  qs("#sb-lang").textContent = friendlyLangName(model.getLanguageId());
  const ed = editors[state.focusedPane];
  const pos = ed ? ed.getPosition() : null;
  qs("#sb-position").textContent = pos ? "Ln " + pos.lineNumber + ", Col " + pos.column : "Ln 1, Col 1";
}
function updateStatusBarEmpty() {
  qs("#sb-lang").textContent = "Plain Text";
  qs("#sb-position").textContent = "";
}

/* ============================== SPLIT VIEW ============================== */
function activateSplit(on) {
  state.splitActive = on;
  const paneSecondary = qs("#pane-secondary");
  const splitterDesktop = qs("#splitter-desktop");
  const tbBtn = qs("#btn-split-toggle");
  if (on) {
    paneSecondary.classList.remove("hidden");
    if (!state.isMobile) splitterDesktop.classList.remove("hidden");
    ensureEditorCreated("secondary");
    if (state.secondary.tabs.length === 0) setPaneOverlay("secondary", "empty");
    if (tbBtn) tbBtn.classList.add("active-toggle");
  } else {
    if (state.isMobile) setMobileSplitOpen(false);
    const doHide = function () { paneSecondary.classList.add("hidden"); splitterDesktop.classList.add("hidden"); };
    if (state.isMobile) setTimeout(doHide, 230); else doHide();
    if (tbBtn) tbBtn.classList.remove("active-toggle");
  }
  qsa('.nav-btn[data-nav="split"]').forEach(function (b) { b.classList.toggle("active", !!(on && state.isMobile && state.mobileSplitOpen)); });
  saveSessionDebounced();
  setTimeout(function () { if (editors.primary) editors.primary.layout(); if (editors.secondary) editors.secondary.layout(); }, 260);
}
function setMobileSplitOpen(open) {
  state.mobileSplitOpen = open;
  qs("#pane-secondary").classList.toggle("mobile-open", open);
  qsa('.nav-btn[data-nav="split"]').forEach(function (b) { b.classList.toggle("active", open); });
  saveSessionDebounced();
}
function openMobileSplit() { if (!state.splitActive) activateSplit(true); setMobileSplitOpen(true); }
function onNavSplitTap() {
  if (!state.splitActive) activateSplit(true);
  setMobileSplitOpen(!state.mobileSplitOpen);
}
let splitDragState = null;
function initSplitHandleDrag() {
  const handle = qs("#split-handle");
  const pane = qs("#pane-secondary");
  function closedWidth() { return pane.getBoundingClientRect().width || 320; }
  function down(clientX) {
    if (!state.isMobile) return;
    if (!state.splitActive) activateSplit(true);
    pane.classList.add("no-anim");
    splitDragState = { startX: clientX, closedW: closedWidth(), startOffset: state.mobileSplitOpen ? 0 : closedWidth() };
  }
  function move(clientX) {
    if (!splitDragState) return;
    const dx = clientX - splitDragState.startX;
    let pos = splitDragState.startOffset + dx;
    pos = Math.max(0, Math.min(splitDragState.closedW, pos));
    pane.style.transform = "translateX(" + pos + "px)";
  }
  function up(clientX) {
    if (!splitDragState) return;
    const dx = clientX - splitDragState.startX;
    let pos = splitDragState.startOffset + dx;
    pos = Math.max(0, Math.min(splitDragState.closedW, pos));
    pane.classList.remove("no-anim");
    pane.style.transform = "";
    setMobileSplitOpen(pos < splitDragState.closedW * 0.5);
    splitDragState = null;
  }
  handle.addEventListener("touchstart", function (e) { down(e.touches[0].clientX); e.preventDefault(); }, { passive: false });
  handle.addEventListener("touchmove", function (e) { move(e.touches[0].clientX); e.preventDefault(); }, { passive: false });
  handle.addEventListener("touchend", function (e) { up((e.changedTouches[0] || {}).clientX || 0); });
  handle.addEventListener("mousedown", function (e) {
    down(e.clientX);
    function mm(ev) { move(ev.clientX); }
    function mu(ev) { up(ev.clientX); window.removeEventListener("mousemove", mm); window.removeEventListener("mouseup", mu); }
    window.addEventListener("mousemove", mm);
    window.addEventListener("mouseup", mu);
  });
}
function initDesktopSplitterDrag() {
  const splitter = qs("#splitter-desktop");
  splitter.addEventListener("mousedown", function (e) {
    e.preventDefault();
    splitter.classList.add("dragging");
    const primary = qs("#pane-primary");
    function mm(ev) {
      const rect = qs("#editor-region").getBoundingClientRect();
      let w = ev.clientX - rect.left;
      w = Math.max(200, Math.min(rect.width - 200, w));
      primary.style.flex = "0 0 " + w + "px";
    }
    function mu() {
      splitter.classList.remove("dragging");
      window.removeEventListener("mousemove", mm); window.removeEventListener("mouseup", mu);
      if (editors.primary) editors.primary.layout();
      if (editors.secondary) editors.secondary.layout();
    }
    window.addEventListener("mousemove", mm);
    window.addEventListener("mouseup", mu);
  });
}

/* ============================== SIDEBAR ============================== */
let rootExpanded = true;
function switchSidebarView(view) {
  state.sidebarView = view;
  qsa(".ab-btn").forEach(function (b) { b.classList.toggle("active", b.dataset.view === view); });
  qsa(".view").forEach(function (v) { v.classList.toggle("active", v.id === "view-" + view); });
  qsa(".nav-btn").forEach(function (b) {
    if (["explorer", "search", "git", "projects", "settings"].indexOf(b.dataset.nav) !== -1) b.classList.toggle("active", b.dataset.nav === view);
  });
  if (view === "search") setTimeout(function () { const si = qs("#search-input"); if (si) si.focus(); }, state.isMobile ? 260 : 0);
  if (view === "projects") renderProjectsList();
  if (view === "git") renderGitPanel();
}
function toggleSidebarCollapse() {
  state.sidebarCollapsed = !state.sidebarCollapsed;
  qs("#sidebar").classList.toggle("collapsed", state.sidebarCollapsed);
  setTimeout(function () { if (editors.primary) editors.primary.layout(); if (editors.secondary) editors.secondary.layout(); }, 20);
}
function openMobileSidebar() {
  state.mobileSidebarOpen = true;
  qs("#sidebar").classList.remove("collapsed");
  qs("#sidebar").classList.add("mobile-open");
  qs("#sidebar-backdrop").classList.add("show");
}
function closeMobileSidebar() {
  state.mobileSidebarOpen = false;
  qs("#sidebar").classList.remove("mobile-open");
  qs("#sidebar-backdrop").classList.remove("show");
}
function toggleMobileSidebar() { if (state.mobileSidebarOpen) closeMobileSidebar(); else openMobileSidebar(); }
function onNavSidebarTap(view) {
  if (state.mobileSidebarOpen && state.sidebarView === view) { closeMobileSidebar(); }
  else { switchSidebarView(view); openMobileSidebar(); }
}
function initSidebarResizer() {
  const resizer = qs("#sidebar-resizer");
  const sidebar = qs("#sidebar");
  resizer.addEventListener("mousedown", function (e) {
    e.preventDefault();
    resizer.classList.add("dragging");
    function mm(ev) {
      const rect = qs("#body").getBoundingClientRect();
      let w = ev.clientX - rect.left - 48;
      w = Math.max(170, Math.min(520, w));
      sidebar.style.width = w + "px";
    }
    function mu() {
      resizer.classList.remove("dragging");
      window.removeEventListener("mousemove", mm); window.removeEventListener("mouseup", mu);
      if (editors.primary) editors.primary.layout();
    }
    window.addEventListener("mousemove", mm);
    window.addEventListener("mouseup", mu);
  });
}
function initEdgeSwipeSidebar() {
  let sx = null, sy = null, tracking = false;
  document.addEventListener("touchstart", function (e) {
    if (!state.isMobile || state.mobileSidebarOpen) return;
    if (e.touches.length !== 1) return;
    if (e.touches[0].clientX > 20) return;
    sx = e.touches[0].clientX; sy = e.touches[0].clientY; tracking = true;
  }, { passive: true });
  document.addEventListener("touchmove", function (e) {
    if (!tracking) return;
    const dx = e.touches[0].clientX - sx, dy = Math.abs(e.touches[0].clientY - sy);
    if (dx > 45 && dy < 40) { openMobileSidebar(); tracking = false; }
  }, { passive: true });
  document.addEventListener("touchend", function () { tracking = false; });
}

/* ============================== COMMAND PALETTE / QUICK OPEN ============================== */
let paletteMode = "commands";
let paletteSelIndex = -1;
let paletteItemsCache = [];
function triggerEditorAction(actionId) {
  const ed = editors[state.focusedPane] || editors.primary;
  if (ed) { ed.focus(); const a = ed.getAction(actionId); if (a) a.run(); }
}
function getCommands() {
  return [
    { label: "New File", hint: "Ctrl+N", action: function () { beginCreateEntry("", "file"); } },
    { label: "New Folder", hint: "", action: function () { beginCreateEntry("", "dir"); } },
    { label: "Upload Files…", hint: "", action: function () { qs("#file-input-files").click(); } },
    { label: "Upload Folder…", hint: "", action: function () { qs("#file-input-folder").click(); } },
    { label: "Open ZIP Project…", hint: "", action: function () { qs("#file-input-zip").click(); } },
    { label: "Collapse All Folders", hint: "", action: collapseAllExplorerFolders },
    { label: "Export Project as ZIP", hint: "", action: function () { exportProjectZip(); } },
    { label: "Save File", hint: "Ctrl+S", action: saveActive },
    { label: "Find in File", hint: "Ctrl+F", action: function () { triggerEditorAction("actions.find"); } },
    { label: "Replace in File", hint: "Ctrl+H", action: function () { triggerEditorAction("editor.action.startFindReplaceAction"); } },
    { label: "Go to Line…", hint: "Ctrl+G", action: function () { triggerEditorAction("editor.action.gotoLine"); } },
    { label: "Open with Live Server", hint: "", action: function () { withActiveHtmlFile(openWithLiveServer); } },
    { label: "Open in Integrated Browser", hint: "", action: function () { withActiveHtmlFile(openIntegratedBrowser); } },
    { label: "Quick Open File…", hint: "Ctrl+P", action: openQuickOpen },
    { label: "Toggle Sidebar", hint: "Ctrl+B", action: function () { if (state.isMobile) toggleMobileSidebar(); else toggleSidebarCollapse(); } },
    { label: "Toggle Split Editor", hint: "Ctrl+\\", action: function () { if (state.isMobile) onNavSplitTap(); else activateSplit(!state.splitActive); } },
    { label: "Show Explorer", hint: "", action: function () { showSidebarView("explorer"); } },
    { label: "Show Search", hint: "", action: function () { showSidebarView("search"); } },
    { label: "Show Settings", hint: "", action: function () { showSidebarView("settings"); } },
    { label: "Toggle Word Wrap", hint: "", action: function () { qs("#set-wordwrap").click(); } },
    { label: "Toggle Minimap", hint: "", action: function () { qs("#set-minimap").click(); } },
    { label: "Clear ALL Projects & Local Data…", hint: "", action: confirmClearAll },
  ];
}
function showSidebarView(view) {
  if (state.isMobile) { onNavSidebarTap(view); }
  else { state.sidebarCollapsed = false; qs("#sidebar").classList.remove("collapsed"); switchSidebarView(view); }
}
function openCommandPalette() {
  paletteMode = "commands";
  const input = qs("#palette-input");
  input.value = ""; input.placeholder = "Type a command…";
  qs("#palette-backdrop").classList.add("show");
  input.focus();
  renderPaletteList("");
}
function openQuickOpen() {
  paletteMode = "files";
  const input = qs("#palette-input");
  input.value = ""; input.placeholder = "Go to file…";
  qs("#palette-backdrop").classList.add("show");
  input.focus();
  renderPaletteList("");
}
function closePalette() { qs("#palette-backdrop").classList.remove("show"); }
function allFilePaths() {
  const out = [];
  fs.forEach(function (n) { if (n.type === "file") out.push(n.path); });
  return out.sort();
}
function fuzzyScore(query, text) {
  query = query.toLowerCase(); text = text.toLowerCase();
  if (!query) return 0;
  const idx = text.indexOf(query);
  if (idx !== -1) return 1000 - idx;
  let qi = 0;
  for (let i = 0; i < text.length && qi < query.length; i++) { if (text[i] === query[qi]) qi++; }
  return qi === query.length ? 1 : -1;
}
function renderPaletteList(query) {
  const list = qs("#palette-list");
  list.innerHTML = "";
  let items;
  if (paletteMode === "commands") {
    items = getCommands().map(function (c) { return { label: c.label, hint: c.hint, action: c.action, score: fuzzyScore(query, c.label) }; });
  } else {
    items = allFilePaths().map(function (p) { return { label: baseName(p), hint: p, action: (function (path) { return function () { openFile(path, { preview: false }); }; })(p), score: fuzzyScore(query, p) }; });
  }
  items = items.filter(function (i) { return query === "" || i.score > 0; });
  items.sort(function (a, b) { return b.score - a.score; });
  items = items.slice(0, 50);
  paletteItemsCache = items;
  paletteSelIndex = items.length ? 0 : -1;
  if (!items.length) { list.appendChild(ce("div", "palette-empty", paletteMode === "files" ? "No matching files" : "No matching commands")); return; }
  items.forEach(function (it, idx) {
    const row = ce("div", "palette-item" + (idx === paletteSelIndex ? " sel" : ""));
    const iconHtml = paletteMode === "files" ? iconSvgColored(isImageExt(extOf(it.hint)) ? "image" : "file", fileColorFor(it.hint), "icon-sm") : "";
    row.innerHTML = (iconHtml ? '<span style="display:flex;align-items:center;gap:8px;">' + iconHtml + escapeHtml(it.label) + "</span>" : "<span>" + escapeHtml(it.label) + "</span>") + "<span class=\"p-hint\">" + escapeHtml(it.hint || "") + "</span>";
    row.addEventListener("click", function () { closePalette(); it.action(); });
    row.addEventListener("mouseenter", function () { paletteSelIndex = idx; updatePaletteSelection(); });
    list.appendChild(row);
  });
}
function updatePaletteSelection() {
  qsa(".palette-item", qs("#palette-list")).forEach(function (el, idx) { el.classList.toggle("sel", idx === paletteSelIndex); });
  const sel = qs(".palette-item.sel");
  if (sel) sel.scrollIntoView({ block: "nearest" });
}
function runPaletteSelection() {
  if (paletteSelIndex < 0 || !paletteItemsCache[paletteSelIndex]) return;
  const it = paletteItemsCache[paletteSelIndex];
  closePalette();
  it.action();
}

/* ============================== SEARCH ============================== */
function performSearch(query) {
  const results = qs("#search-results");
  results.innerHTML = "";
  if (!query) { results.innerHTML = '<div class="search-empty">Type to search file contents across your whole project.</div>'; return; }
  const q = query.toLowerCase();
  let totalHits = 0;
  const filePaths = allFilePaths().filter(function (p) { return !fs.get(p).isBinary; });
  filePaths.forEach(function (p) {
    const node = fs.get(p);
    const content = node.content || "";
    const lower = content.toLowerCase();
    if (lower.indexOf(q) === -1) return;
    const lines = content.split("\n");
    const hits = [];
    for (let i = 0; i < lines.length && hits.length < 8; i++) {
      if (lines[i].toLowerCase().indexOf(q) !== -1) hits.push({ line: i + 1, text: lines[i].trim().slice(0, 140) });
    }
    if (!hits.length) return;
    totalHits += hits.length;
    const group = ce("div", "search-file-group");
    group.appendChild(ce("div", "search-file-head", escapeHtml(p)));
    hits.forEach(function (h) {
      const row = ce("div", "search-hit");
      const idx = h.text.toLowerCase().indexOf(q);
      let html;
      if (idx !== -1) html = escapeHtml(h.text.slice(0, idx)) + "<b>" + escapeHtml(h.text.slice(idx, idx + q.length)) + "</b>" + escapeHtml(h.text.slice(idx + q.length));
      else html = escapeHtml(h.text);
      row.innerHTML = h.line + ": " + html;
      row.addEventListener("click", function () {
        openFile(p, { preview: true });
        setTimeout(function () {
          const ed = editors[state.focusedPane];
          if (ed) { ed.revealLineInCenter(h.line); ed.setPosition({ lineNumber: h.line, column: 1 }); ed.focus(); }
        }, 60);
        if (state.isMobile) closeMobileSidebar();
      });
      group.appendChild(row);
    });
    results.appendChild(group);
  });
  if (totalHits === 0) results.innerHTML = '<div class="search-empty">No results for \u201c' + escapeHtml(query) + '\u201d.</div>';
}

/* ============================== SETTINGS ============================== */
function clampInt(v, min, max, fallback) { const n = parseInt(v, 10); if (isNaN(n)) return fallback; return Math.max(min, Math.min(max, n)); }
function syncSwitch(sel, on) { qs(sel).classList.toggle("on", on); }
function saveSettings() { idbSetMeta("settings", state.settings); }
function updateStorageInfo() {
  if (navigator.storage && navigator.storage.estimate) {
    navigator.storage.estimate().then(function (est) {
      const used = est.usage || 0, quota = est.quota || 0;
      qs("#storage-info").textContent = formatBytes(used) + " used on this device" + (quota ? " of " + formatBytes(quota) + " available" : "") + ".";
    }).catch(function () { qs("#storage-info").textContent = "Stored locally in this browser."; });
  } else {
    qs("#storage-info").textContent = "Stored locally in this browser.";
  }
}
function confirmClearAll() {
  if (!window.confirm("This deletes EVERY project and all local data from this browser \u2014 not just the current one. This can't be undone. Continue?")) return;
  const progress = toastProgress("Clearing local data\u2026");
  clearAllData().then(function () {
    progress.success("Cleared. Starting fresh.");
    setTimeout(function () { location.reload(); }, 500);
  }).catch(function (err) {
    console.error(err);
    progress.error("Couldn't fully clear local data" + (err && err.message ? ": " + err.message : "") + " \u2014 reloading.");
    setTimeout(function () { location.reload(); }, 900);
  });
}
function clearAllData() {
  models.forEach(function (e) { e.model.dispose(); });
  models.clear(); dirtyPaths.clear(); fs.clear(); projectName = ""; currentProjectId = null;
  projectsIndex.clear();
  return Promise.all([idbClearNodes(), idbClearMeta(), idbClearProjects(), idbClearProjectSnapshots()]);
}
function flushAllPersists() {
  persistTimers.forEach(function (timer) { clearTimeout(timer); });
  const paths = Array.from(persistTimers.keys());
  persistTimers.clear();
  paths.forEach(function (p) { persistNow(p); });
}
function flushAllDirty() {
  Array.from(dirtyPaths).forEach(function (p) { persistNow(p); });
}

/* ============================== ZIP IMPORT / EXPORT ============================== */
function persistWholeFsToIdb() { return idbPutNodesBulk(Array.from(fs.values())); }
function autoOpenWelcomeFile() {
  const candidates = ["README.md", "readme.md", "Readme.md", "README.txt", "index.html", "package.json"];
  for (let i = 0; i < candidates.length; i++) {
    if (fs.has(candidates[i])) { openFile(candidates[i], { preview: true }); return; }
  }
}
function openZipFile(file) {
  if (!file) return Promise.resolve();
  if (typeof JSZip === "undefined") {
    toast("The ZIP engine failed to load — try reloading the page.", "error");
    return Promise.resolve();
  }
  showBusy("Opening " + file.name + "\u2026");
  const failedEntries = [];
  return file.arrayBuffer().then(function (buf) {
    return JSZip.loadAsync(buf);
  }).then(function (zip) {
    const entries = Object.keys(zip.files).map(function (k) { return zip.files[k]; });
    if (!entries.length) { toast("That ZIP looks empty", "error"); return; }
    const names = entries.map(function (e) { return e.name; });
    const firstSeg = function (n) { return n.split("/")[0]; };
    const allSame = names.length > 0 && names.every(function (n) { return firstSeg(n) === firstSeg(names[0]); });
    const commonRoot = (allSame && firstSeg(names[0])) ? firstSeg(names[0]) : null;
    const newName = uniqueProjectName(commonRoot || file.name.replace(/\.zip$/i, "") || "project");

    return startNewProject(newName).then(function () {
      const tasks = [];
      entries.forEach(function (entry) {
        if (entry.dir) return;
        let path = entry.name;
        if (commonRoot) path = path.slice(commonRoot.length + 1);
        path = path.replace(/^\/+/, "");
        if (!path) return;
        const ext = extOf(path);
        const bin = isBinaryExt(ext);
        const t = entry.async(bin ? "base64" : "string").then(function (data) {
          if (bin) {
            const dataUrl = "data:" + mimeFor(ext) + ";base64," + data;
            fsSetFile(path, "", true, dataUrl, Math.ceil(data.length * 0.75));
          } else {
            fsSetFile(path, data, false, null, data.length);
          }
        }).catch(function (err) { console.error("zip entry failed", path, err); failedEntries.push(path); });
        tasks.push(t);
      });
      return Promise.all(tasks).then(function () {
        return persistWholeFsToIdb();
      }).then(function () {
        state.expandedDirs.clear();
        fsChildrenOf("").forEach(function (n) { if (n.type === "dir") state.expandedDirs.add(n.path); });
        renderTree();
        closeAll("primary"); closeAll("secondary");
        if (failedEntries.length) {
          toast('Opened "' + projectName + '" — ' + failedEntries.length + " file(s) couldn't be read and were skipped", "error");
        } else {
          toast('Opened "' + projectName + '" as a new project');
        }
        autoOpenWelcomeFile();
        renderProjectsList();
        saveSessionDebounced();
      });
    });
  }).catch(function (err) {
    console.error(err);
    toast("Could not open that ZIP file" + (err && err.message ? ": " + err.message : "") + ".", "error");
  }).finally(hideBusy);
}
function exportProjectZip() {
  if (fs.size === 0) { toast("Nothing to export yet", "error"); return; }
  if (typeof JSZip === "undefined") {
    toast("The ZIP engine failed to load — try reloading the page.", "error");
    return;
  }
  flushAllPersists();
  const zip = new JSZip();
  const root = zip.folder(projectName || "project");
  fs.forEach(function (node) {
    if (node.type === "dir") { root.folder(node.path); return; }
    if (node.isBinary) {
      if (node.dataUrl) { root.file(node.path, node.dataUrl.split(",")[1], { base64: true }); }
      else { root.file(node.path, ""); }
    } else {
      root.file(node.path, node.content || "");
    }
  });
  const progress = toastProgress("Preparing ZIP\u2026");
  zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } }).then(function (blob) {
    const url = URL.createObjectURL(blob);
    const a = ce("a"); a.href = url; a.download = (projectName || "project") + ".zip";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
    progress.success("Exported " + (projectName || "project") + ".zip");
  }).catch(function (err) {
    console.error(err);
    progress.error("Export failed" + (err && err.message ? ": " + err.message : ""));
  });
}

/* ============================== PLAIN FILE / FOLDER UPLOAD ============================== */
function readAsText(file) { return new Promise(function (res, rej) { const r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = rej; r.readAsText(file); }); }
function readAsDataURL(file) { return new Promise(function (res, rej) { const r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = rej; r.readAsDataURL(file); }); }
function stripFirstSegment(relPath) { const parts = relPath.split("/"); return parts.length > 1 ? parts.slice(1).join("/") : relPath; }
function importFileList(fileList, opts) {
  opts = opts || {};
  const targetDir = opts.targetDir || "";
  const files = Array.from(fileList || []);
  if (!files.length) return Promise.resolve({ addedCount: 0, failed: [] });
  const freshProject = fs.size === 0 && !targetDir;
  if (freshProject && !projectName) {
    const rel = files[0].webkitRelativePath;
    projectName = rel ? rel.split("/")[0] : "project";
  } else if (!projectName) { projectName = "project"; }
  const failed = [];
  const tasks = files.map(function (file) {
    let relPath;
    if (file.webkitRelativePath) relPath = freshProject ? stripFirstSegment(file.webkitRelativePath) : file.webkitRelativePath;
    else relPath = file.name;
    if (targetDir) relPath = joinPath(targetDir, relPath);
    const ext = extOf(relPath);
    const bin = isBinaryExt(ext);
    const reader = bin ? readAsDataURL(file) : readAsText(file);
    return reader.then(function (data) {
      if (bin) fsSetFile(relPath, "", true, data, file.size);
      else fsSetFile(relPath, data, false, null, file.size);
      return idbPutNode(fs.get(relPath));
    }).catch(function (e) { console.error("read failed", relPath, e); failed.push(relPath); });
  });
  return Promise.all(tasks).then(function () {
    return idbSetMeta("project", { name: projectName, createdAt: Date.now() });
  }).catch(function (e) { console.error("couldn't save project metadata", e); }).then(function () {
    if (targetDir) state.expandedDirs.add(targetDir);
    renderTree();
    saveSessionDebounced();
    return { addedCount: files.length - failed.length, failed: failed };
  });
}

/* ============================== DRAG AND DROP ============================== */
function initGlobalDnD() {
  let dragCounter = 0;
  window.addEventListener("dragenter", function (e) { e.preventDefault(); dragCounter++; qs("#dnd-overlay").classList.add("show"); });
  window.addEventListener("dragover", function (e) { e.preventDefault(); });
  window.addEventListener("dragleave", function () { dragCounter--; if (dragCounter <= 0) { dragCounter = 0; qs("#dnd-overlay").classList.remove("show"); } });
  window.addEventListener("drop", function (e) {
    e.preventDefault();
    dragCounter = 0;
    qs("#dnd-overlay").classList.remove("show");
    handleDroppedItems(e.dataTransfer);
  });
}
function readEntriesRecursively(entries) {
  const out = [];
  function walk(entry, path) {
    return new Promise(function (resolve) {
      if (entry.isFile) {
        entry.file(function (file) { out.push({ file: file, path: path + entry.name }); resolve(); }, function () { resolve(); });
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        const readBatch = function () {
          reader.readEntries(function (subEntries) {
            if (!subEntries.length) { resolve(); return; }
            Promise.all(subEntries.map(function (se) { return walk(se, path + entry.name + "/"); })).then(readBatch);
          }, function () { resolve(); });
        };
        readBatch();
      } else resolve();
    });
  }
  return Promise.all(entries.map(function (e) { return walk(e, ""); })).then(function () { return out; });
}
function importFileListFromEntryFiles(entryFiles) {
  const p0 = entryFiles[0].path;
  const name = uniqueProjectName(p0.indexOf("/") !== -1 ? p0.split("/")[0] : "Dropped Files");
  showBusy("Opening dropped files\u2026");
  const failed = [];
  return startNewProject(name).then(function () {
    const tasks = entryFiles.map(function (ef) {
      const relPath = stripFirstSegment(ef.path);
      const ext = extOf(relPath);
      const bin = isBinaryExt(ext);
      const reader = bin ? readAsDataURL(ef.file) : readAsText(ef.file);
      return reader.then(function (data) {
        if (bin) fsSetFile(relPath, "", true, data, ef.file.size);
        else fsSetFile(relPath, data, false, null, ef.file.size);
        return idbPutNode(fs.get(relPath));
      }).catch(function (err) { console.error(err); failed.push(relPath); });
    });
    return Promise.all(tasks).then(function () {
      renderTree();
      if (failed.length) toast('Opened "' + projectName + '" \u2014 ' + failed.length + " file(s) couldn't be read and were skipped", "error");
      else toast('Opened "' + projectName + '" as a new project');
      renderProjectsList();
      saveSessionDebounced();
    });
  }).catch(function (err) {
    console.error(err);
    toast("Couldn't open those files as a project" + (err && err.message ? ": " + err.message : ""), "error");
  }).finally(hideBusy);
}
function handleDroppedItems(dt) {
  const items = dt.items;
  if (items && items.length && items[0].webkitGetAsEntry) {
    const entries = [];
    for (let i = 0; i < items.length; i++) { const en = items[i].webkitGetAsEntry(); if (en) entries.push(en); }
    if (entries.length === 1 && entries[0].isFile && /\.zip$/i.test(entries[0].name)) {
      entries[0].file(function (file) { openZipFile(file); });
      return;
    }
    readEntriesRecursively(entries).then(function (files) {
      if (files.length) importFileListFromEntryFiles(files);
      else toast("No readable files found in what was dropped", "error");
    }).catch(function (err) {
      console.error(err);
      toast("Couldn't read the dropped item(s)", "error");
    });
    return;
  }
  const files = Array.from(dt.files || []);
  if (files.length === 1 && /\.zip$/i.test(files[0].name)) { openZipFile(files[0]); return; }
  if (files.length) openFilesAsNewProject(files);
}

/* ============================== LIVE SERVER / INTEGRATED BROWSER ============================== */
const liveChannel = (typeof BroadcastChannel !== "undefined") ? new BroadcastChannel("codeforge-live") : null;
let swReady = false;
function initServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("sw.js").then(function () {
    return navigator.serviceWorker.ready;
  }).then(function () {
    swReady = true;
  }).catch(function (err) {
    console.error("CodeForge: service worker registration failed (Live Server/Integrated Browser will be unavailable):", err);
  });
}
function notifyLiveReload() {
  if (liveChannel) { try { liveChannel.postMessage({ t: Date.now() }); } catch (e) {} }
}
function ensureLiveServerReady() {
  if (!("serviceWorker" in navigator)) return Promise.resolve(false);
  if (swReady) return Promise.resolve(true);
  const progress = toastProgress("Preparing Live Server\u2026");
  return navigator.serviceWorker.ready.then(function () {
    swReady = true;
    progress.close();
    return true;
  }).catch(function (err) {
    console.error("CodeForge: service worker not ready", err);
    progress.error("Live Server isn't available in this browser session");
    return false;
  });
}
function appBaseHref() { return location.pathname.replace(/[^/]*$/, ""); }
function buildLiveUrl(path) {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return location.origin + appBaseHref() + "__live__/" + encoded;
}
function openWithLiveServer(path) {
  ensureLiveServerReady().then(function (ok) {
    if (!ok) { toast("Live Server needs service worker support, which isn't available here.", "error"); return; }
    flushAllPersists();
    window.open(buildLiveUrl(path), "_blank");
    toast("Opened " + baseName(path) + " with Live Server");
  });
}
function paneContainingPath(path) {
  if (state.primary.tabs.some(function (t) { return t.path === path; })) return "primary";
  if (state.secondary.tabs.some(function (t) { return t.path === path; })) return "secondary";
  return null;
}
function openIntegratedBrowser(path) {
  ensureLiveServerReady().then(function (ok) {
    if (!ok) { toast("Integrated Browser needs service worker support, which isn't available here.", "error"); return; }
    flushAllPersists();
    const sourcePane = paneContainingPath(path) || state.focusedPane || "primary";
    const targetPane = sourcePane === "primary" ? "secondary" : "primary";
    if (targetPane === "secondary" && !state.splitActive) activateSplit(true);
    if (state.isMobile && targetPane === "secondary") openMobileSplit();
    showBrowserPreview(targetPane, path);
  });
}
function showBrowserPreview(pane, path) {
  const cid = pane === "primary" ? "editor-primary" : "editor-secondary";
  const container = document.getElementById(cid);
  if (!container) return;
  let bp = container.querySelector(".browser-preview");
  if (!bp) {
    bp = ce("div", "browser-preview");
    bp.innerHTML =
      '<div class="bpv-toolbar">' +
      '<span class="bpv-icon">' + iconSvg("globe", "icon-sm") + "</span>" +
      '<span class="bpv-path"></span>' +
      '<span class="bpv-spacer"></span>' +
      '<button class="bpv-btn" data-act="refresh" title="Refresh">' + iconSvg("refresh", "icon-sm") + "</button>" +
      '<button class="bpv-btn" data-act="external" title="Open in new tab">' + iconSvg("external-link", "icon-sm") + "</button>" +
      '<button class="bpv-btn" data-act="close" title="Close preview">' + iconSvg("x", "icon-sm") + "</button>" +
      "</div>" +
      '<iframe class="bpv-frame" sandbox="allow-scripts allow-forms allow-same-origin allow-modals allow-popups"></iframe>';
    container.appendChild(bp);
    bp.querySelector('[data-act="refresh"]').addEventListener("click", function () {
      flushAllPersists();
      const f = bp.querySelector("iframe");
      if (bp.dataset.path) f.src = buildLiveUrl(bp.dataset.path);
    });
    bp.querySelector('[data-act="external"]').addEventListener("click", function () {
      if (bp.dataset.path) window.open(buildLiveUrl(bp.dataset.path), "_blank");
    });
    bp.querySelector('[data-act="close"]').addEventListener("click", function () { closeBrowserPreview(pane); });
  }
  bp.dataset.path = path;
  bp.querySelector(".bpv-path").textContent = path;
  bp.querySelector("iframe").src = buildLiveUrl(path);
  setPaneOverlay(pane, "browser");
}
function closeBrowserPreview(pane) {
  const cid = pane === "primary" ? "editor-primary" : "editor-secondary";
  const container = document.getElementById(cid);
  const bp = container ? container.querySelector(".browser-preview") : null;
  if (bp) { bp.querySelector("iframe").src = "about:blank"; bp.remove(); }
  const ps = state[pane];
  if (ps.active !== -1 && ps.tabs[ps.active]) activateEditorContent(pane, ps.tabs[ps.active].path);
  else setPaneOverlay(pane, pane === "primary" ? "welcome" : "empty");
}
function withActiveHtmlFile(fn) {
  const ps = state[state.focusedPane];
  const active = ps.active !== -1 ? ps.tabs[ps.active] : null;
  if (!active || !isHtmlExt(extOf(active.path))) { toast("Open an HTML file first", "error"); return; }
  fn(active.path);
}

/* ============================== PROJECT WORKSPACE MANAGEMENT ============================== */
// Multiple projects can exist at once, like VS Code workspaces. Only one is "active" at a time —
// its files live in the 'nodes'/'meta' stores (same ones the rest of the app already uses).
// Switching projects snapshots the outgoing project into 'project_snapshots' first, so nothing
// is ever lost, then loads the target project's snapshot back into the active stores.
let currentProjectId = null;
const projectsIndex = new Map(); // id -> {id, name, createdAt, updatedAt, fileCount, sizeBytes}

function generateProjectId() { return "proj_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8); }
function computeProjectStats() {
  let fileCount = 0, sizeBytes = 0;
  fs.forEach(function (n) { if (n.type === "file") { fileCount++; sizeBytes += (n.size || 0); } });
  return { fileCount: fileCount, sizeBytes: sizeBytes };
}
function relativeTime(ts) {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h ago";
  const d = Math.floor(h / 24);
  if (d < 30) return d + "d ago";
  return new Date(ts).toLocaleDateString();
}
function currentSessionSnapshotObj() {
  return {
    sidebarView: state.sidebarView,
    splitActive: state.splitActive,
    primary: { tabs: state.primary.tabs, active: state.primary.active, previewIndex: state.primary.previewIndex },
    secondary: { tabs: state.secondary.tabs, active: state.secondary.active, previewIndex: state.secondary.previewIndex },
    expandedDirs: Array.from(state.expandedDirs),
  };
}
function saveActiveProjectSnapshotIfAny() {
  if (!currentProjectId) return Promise.resolve();
  flushAllPersists();
  const id = currentProjectId;
  const nodesArr = Array.from(fs.values());
  const stats = computeProjectStats();
  const existing = projectsIndex.get(id) || { id: id, name: projectName, createdAt: Date.now() };
  const metaEntry = { id: id, name: projectName || existing.name, createdAt: existing.createdAt, updatedAt: Date.now(), fileCount: stats.fileCount, sizeBytes: stats.sizeBytes };
  projectsIndex.set(id, metaEntry);
  return Promise.all([
    idbPutProjectSnapshot(id, { nodes: nodesArr, session: currentSessionSnapshotObj() }),
    idbPutProjectMeta(metaEntry),
  ]);
}
function resetActiveWorkspaceInMemory() {
  models.forEach(function (e) { e.model.dispose(); });
  models.clear(); dirtyPaths.clear(); fs.clear();
  state.primary = { tabs: [], active: -1, previewIndex: -1 };
  state.secondary = { tabs: [], active: -1, previewIndex: -1 };
  state.expandedDirs = new Set();
  state.selectedPath = null;
  closeBrowserPreview("primary");
  closeBrowserPreview("secondary");
  ["primary", "secondary"].forEach(function (pane) {
    const cid = pane === "primary" ? "editor-primary" : "editor-secondary";
    const container = document.getElementById(cid);
    const dv = container ? container.querySelector(".diff-preview") : null;
    if (dv) dv.remove();
  });
  if (editors.diff) {
    const dm = editors.diff.getModel();
    if (dm) { dm.original.dispose(); dm.modified.dispose(); }
    editors.diff.dispose(); editors.diff = null; editors.diffPane = null;
  }
  gitState.linked = null;
  gitState.selectedDiffPath = null;
}
function loadProjectIntoActiveWorkspace(id) {
  let snapRef = null;
  return idbGetProjectSnapshot(id).then(function (snap) {
    if (!snap) throw new Error("That project's data couldn't be found.");
    snapRef = snap;
    (snap.nodes || []).forEach(function (n) { fs.set(n.path, n); });
    return idbClearNodes().then(function () { return idbPutNodesBulk(snap.nodes || []); });
  }).then(function () {
    const meta = projectsIndex.get(id) || { name: "project", createdAt: Date.now() };
    projectName = meta.name;
    currentProjectId = id;
    return Promise.all([
      idbSetMeta("project", { name: projectName, createdAt: meta.createdAt }),
      idbSetMeta("currentProjectId", id),
      idbSetMeta("session", snapRef.session || null),
      idbGetMeta("git:" + id),
    ]);
  }).then(function (results) {
    state.expandedDirs = new Set((snapRef.session && snapRef.session.expandedDirs) || []);
    gitState.linked = results[3] || null;
    return snapRef;
  });
}
function switchToProject(id) {
  if (id === currentProjectId) { toast("Already viewing " + (projectsIndex.get(id) || {}).name); return Promise.resolve(); }
  showBusy("Switching project\u2026");
  return saveActiveProjectSnapshotIfAny().then(function () {
    resetActiveWorkspaceInMemory();
    return loadProjectIntoActiveWorkspace(id);
  }).then(function (snap) {
    renderTree();
    if (snap.session) restoreSession(snap.session); else setPaneOverlay("primary", "welcome");
    switchSidebarView("explorer");
    renderProjectsList();
    renderGitPanel();
    toast('Switched to "' + projectName + '"');
  }).catch(function (err) {
    console.error(err);
    toast("Couldn't switch projects: " + (err && err.message ? err.message : "unknown error"), "error");
  }).finally(hideBusy);
}
function startNewProject(name) {
  return saveActiveProjectSnapshotIfAny().then(function () {
    resetActiveWorkspaceInMemory();
    const id = generateProjectId();
    currentProjectId = id;
    projectName = name || "Untitled Project";
    const now = Date.now();
    const metaEntry = { id: id, name: projectName, createdAt: now, updatedAt: now, fileCount: 0, sizeBytes: 0 };
    projectsIndex.set(id, metaEntry);
    return Promise.all([
      idbClearNodes(),
      idbSetMeta("project", { name: projectName, createdAt: now }),
      idbSetMeta("currentProjectId", id),
      idbSetMeta("session", null),
      idbPutProjectMeta(metaEntry),
    ]);
  }).then(function () {
    state.expandedDirs = new Set();
    renderTree();
    setPaneOverlay("primary", "welcome");
    renderProjectsList();
  });
}
function uniqueProjectName(wanted) {
  const taken = new Set(Array.from(projectsIndex.values()).map(function (p) { return p.name; }));
  if (!taken.has(wanted)) return wanted;
  let i = 2;
  while (taken.has(wanted + " " + i)) i++;
  return wanted + " " + i;
}
function ensureProjectContext() {
  if (currentProjectId) return Promise.resolve();
  return startNewProject(uniqueProjectName("Untitled Project"));
}
function beginRenameProject(id) {
  const meta = projectsIndex.get(id);
  if (!meta) return;
  const name = window.prompt("Rename project", meta.name);
  if (!name || !name.trim() || name.trim() === meta.name) return;
  const previousName = meta.name;
  meta.name = name.trim();
  meta.updatedAt = Date.now();
  idbPutProjectMeta(meta).then(function () {
    if (id === currentProjectId) {
      projectName = meta.name;
      return idbSetMeta("project", { name: projectName, createdAt: meta.createdAt }).catch(function (err) { console.error(err); }).then(function () { renderTree(); });
    }
  }).then(function () {
    renderProjectsList();
    toast("Renamed to " + meta.name);
  }).catch(function (err) {
    console.error(err);
    meta.name = previousName; // roll back so the UI doesn't claim a rename that didn't persist
    renderProjectsList();
    toast("Couldn't rename project" + (err && err.message ? ": " + err.message : ""), "error");
  });
}
function deleteProjectWithConfirm(id) {
  const meta = projectsIndex.get(id);
  if (!meta) return;
  if (!window.confirm('Delete project "' + meta.name + '" and all its files? This can\'t be undone.')) return;
  const wasCurrent = id === currentProjectId;
  projectsIndex.delete(id);
  renderProjectsList();
  Promise.all([idbDeleteProjectMeta(id), idbDeleteProjectSnapshot(id), idbSetMeta("git:" + id, null)]).then(function () {
    if (wasCurrent) {
      currentProjectId = null;
      resetActiveWorkspaceInMemory();
      projectName = "";
      return Promise.all([idbClearNodes(), idbSetMeta("project", null), idbSetMeta("currentProjectId", null), idbSetMeta("session", null)]).then(function () {
        renderTree();
        setPaneOverlay("primary", "welcome");
      });
    }
  }).then(function () {
    renderProjectsList();
    toast("Project deleted");
  }).catch(function (err) {
    console.error(err);
    projectsIndex.set(id, meta); // roll back the optimistic removal so the list stays accurate
    renderProjectsList();
    toast("Couldn't delete project" + (err && err.message ? ": " + err.message : ""), "error");
  });
}
function openFilesAsNewProject(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return Promise.resolve();
  const rel = files[0].webkitRelativePath;
  const name = uniqueProjectName(rel ? rel.split("/")[0] : (files.length === 1 ? files[0].name.replace(/\.[^./]+$/, "") : "Uploaded Files"));
  showBusy("Opening " + files.length + " file" + (files.length === 1 ? "" : "s") + "\u2026");
  return startNewProject(name).then(function () {
    return importFileList(files);
  }).then(function (result) {
    switchSidebarView("explorer");
    renderProjectsList();
    if (result && result.failed && result.failed.length) {
      toast('Opened "' + projectName + '" \u2014 ' + result.failed.length + " file(s) couldn't be read and were skipped", "error");
    } else {
      toast('Opened "' + projectName + '" as a new project');
    }
  }).catch(function (err) {
    console.error(err);
    toast("Couldn't open that as a project" + (err && err.message ? ": " + err.message : ""), "error");
  }).finally(hideBusy);
}
function renderProjectsList() {
  const container = qs("#projects-list");
  if (!container) return;
  container.innerHTML = "";
  if (currentProjectId) {
    const stats = computeProjectStats();
    const existing = projectsIndex.get(currentProjectId);
    if (existing) { existing.fileCount = stats.fileCount; existing.sizeBytes = stats.sizeBytes; existing.name = projectName; }
  }
  const list = Array.from(projectsIndex.values()).sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
  if (!list.length) {
    container.appendChild(ce("div", "empty-hint", "No projects yet. Use Upload / Folder / ZIP above (or drag a folder onto the window) to open your first one."));
    return;
  }
  list.forEach(function (p) {
    const isCurrent = p.id === currentProjectId;
    const row = ce("div", "project-row" + (isCurrent ? " current" : ""));
    row.innerHTML =
      '<div class="proj-row-main">' +
      '<div class="proj-row-name">' + escapeHtml(p.name) + (isCurrent ? ' <span class="proj-badge">current</span>' : "") + "</div>" +
      '<div class="proj-row-meta">' + (p.fileCount || 0) + " files \u00b7 " + formatBytes(p.sizeBytes || 0) + " \u00b7 " + relativeTime(p.updatedAt || p.createdAt) + "</div>" +
      "</div>" +
      '<div class="proj-row-actions">' +
      (isCurrent ? "" : '<button class="proj-btn" data-act="open" title="Open">' + iconSvg("folder-open", "icon-sm") + "</button>") +
      '<button class="proj-btn" data-act="rename" title="Rename">' + iconSvg("edit", "icon-sm") + "</button>" +
      '<button class="proj-btn" data-act="delete" title="Delete">' + iconSvg("trash", "icon-sm") + "</button>" +
      "</div>";
    const openBtn = row.querySelector('[data-act="open"]');
    if (openBtn) openBtn.addEventListener("click", function () { switchToProject(p.id); });
    row.querySelector('[data-act="rename"]').addEventListener("click", function () { beginRenameProject(p.id); });
    row.querySelector('[data-act="delete"]').addEventListener("click", function () { deleteProjectWithConfirm(p.id); });
    row.addEventListener("dblclick", function () { if (!isCurrent) switchToProject(p.id); });
    container.appendChild(row);
  });
  renderWelcomeRecentProjects();
}

function renderWelcomeRecentProjects() {
  const list = qs("#welcome-recent-list");
  if (!list) return;
  list.innerHTML = "";
  const entries = Array.from(projectsIndex.values())
    .sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); })
    .slice(0, 5);
  if (!entries.length) {
    list.appendChild(ce("div", "empty-hint", "No recent projects yet."));
    return;
  }
  entries.forEach(function (p) {
    const row = ce("div", "welcome-recent-item");
    row.innerHTML =
      '<div class="recent-project">' +
        '<div class="recent-name">' + escapeHtml(p.name) + '</div>' +
        '<div class="recent-meta">' + (p.fileCount || 0) + ' files · ' + formatBytes(p.sizeBytes || 0) + '</div>'
       + '</div>';
    row.addEventListener("click", function () { switchToProject(p.id); });
    list.appendChild(row);
  });
}

/* ============================== GITHUB SOURCE CONTROL ============================== */
// Optional, opt-in, and entirely direct: if you paste a Personal Access Token, it's stored
// only in this browser's IndexedDB and is sent only straight to api.github.com when you
// explicitly use a Git action here — never anywhere else, never automatically.
const gitState = { linked: null, token: "", selectedDiffPath: null };
const GITHUB_API = "https://api.github.com";

function githubHeaders(extra) {
  const h = Object.assign({ "Accept": "application/vnd.github+json" }, extra || {});
  if (gitState.token) h["Authorization"] = "token " + gitState.token;
  return h;
}
function ghHelpUrl(owner, repo) { return "https://github.com/" + owner + "/" + repo; }
// Wraps fetch() with a timeout (fetch alone never times out) and turns raw network failures
// into a message a person can actually act on, instead of a bare "Failed to fetch" TypeError.
function fetchWithTimeout(url, opts, ms) {
  opts = opts || {};
  const hasController = typeof AbortController !== "undefined";
  const controller = hasController ? new AbortController() : null;
  if (controller) opts.signal = controller.signal;
  const timer = setTimeout(function () { if (controller) controller.abort(); }, ms || 20000);
  return fetch(url, opts).then(function (res) { clearTimeout(timer); return res; }).catch(function (err) {
    clearTimeout(timer);
    if (err && err.name === "AbortError") throw new Error("GitHub request timed out. Check your connection and try again.");
    throw new Error("Couldn't reach GitHub \u2014 check your internet connection.");
  });
}

function b64DecodeUnicode(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder("utf-8").decode(bytes);
}
function fetchBlobsWithConcurrency(base, entries, baseline) {
  const CONCURRENCY = 6;
  let idx = 0;
  function worker() {
    if (idx >= entries.length) return Promise.resolve();
    const entry = entries[idx++];
    return fetchWithTimeout(base + "/git/blobs/" + entry.sha, { headers: githubHeaders() }, 20000).then(function (res) {
      if (!res.ok) throw new Error("Failed to fetch " + entry.path);
      return res.json();
    }).then(function (blobData) {
      const content64 = (blobData.content || "").replace(/\n/g, "");
      const ext = extOf(entry.path);
      if (isBinaryExt(ext)) baseline[entry.path] = { isBinary: true, dataUrl: "data:" + mimeFor(ext) + ";base64," + content64 };
      else baseline[entry.path] = { isBinary: false, content: b64DecodeUnicode(content64) };
      return worker();
    });
  }
  const workers = [];
  for (let i = 0; i < Math.min(CONCURRENCY, entries.length); i++) workers.push(worker());
  return Promise.all(workers);
}
function fetchRepoBaseline(owner, repo, branch) {
  // Note: GitHub's zipball endpoint redirects to codeload.github.com with a CORS header that
  // doesn't permit browser fetches from arbitrary origins, so we can't use it here. The plain
  // Git Data REST API (used below) is CORS-enabled, so we fetch the tree and each file's blob
  // directly — a bit more chatty for large repos, but it works reliably from the browser.
  const base = GITHUB_API + "/repos/" + owner + "/" + repo;
  let commitSha = null, treeSha = null;
  return fetchWithTimeout(base + "/git/refs/heads/" + encodeURIComponent(branch), { headers: githubHeaders() }, 20000)
    .then(function (res) {
      if (!res.ok) throw new Error(res.status === 404 ? "Branch or repository not found." : res.status === 401 ? "That token isn't valid." : "GitHub error (" + res.status + ")");
      return res.json();
    }).then(function (refData) {
      commitSha = refData.object.sha;
      return fetchWithTimeout(base + "/git/commits/" + commitSha, { headers: githubHeaders() }, 20000);
    }).then(function (res) {
      if (!res.ok) throw new Error("Couldn't read the base commit");
      return res.json();
    }).then(function (commitData) {
      treeSha = commitData.tree.sha;
      return fetchWithTimeout(base + "/git/trees/" + treeSha + "?recursive=1", { headers: githubHeaders() }, 20000);
    }).then(function (res) {
      if (!res.ok) throw new Error("Couldn't read the repository tree");
      return res.json();
    }).then(function (treeData) {
      const blobs = (treeData.tree || []).filter(function (e) { return e.type === "blob"; });
      if (treeData.truncated) toast("This repository is large \u2014 some files may be missing.", "error");
      const baseline = {};
      return fetchBlobsWithConcurrency(base, blobs, baseline).then(function () {
        return { baseCommitSha: commitSha, baseline: baseline };
      });
    });
}
function importFromGitHub(owner, repo, branch, btn) {
  const restoreBtn = btn ? setBtnLoading(btn, "Importing\u2026") : function () {};
  showBusy("Importing " + owner + "/" + repo + "\u2026");
  return fetchRepoBaseline(owner, repo, branch).then(function (result) {
    const name = uniqueProjectName(repo);
    return startNewProject(name).then(function () {
      Object.keys(result.baseline).forEach(function (path) {
        const b = result.baseline[path];
        if (b.isBinary) fsSetFile(path, "", true, b.dataUrl, Math.ceil(((b.dataUrl || "").length) * 0.75));
        else fsSetFile(path, b.content, false, null, b.content.length);
      });
      return persistWholeFsToIdb();
    }).then(function () {
      gitState.linked = { owner: owner, repo: repo, branch: branch, baseCommitSha: result.baseCommitSha, baseline: result.baseline };
      return idbSetMeta("git:" + currentProjectId, gitState.linked);
    }).then(function () {
      state.expandedDirs.clear();
      fsChildrenOf("").forEach(function (n) { if (n.type === "dir") state.expandedDirs.add(n.path); });
      renderTree();
      renderProjectsList();
      switchSidebarView("git");
      renderGitPanel();
      autoOpenWelcomeFile();
      toast('Imported "' + projectName + '" from GitHub');
    });
  }).catch(function (err) {
    console.error(err);
    toast("Import failed: " + (err && err.message ? err.message : "unknown error"), "error");
  }).finally(function () { restoreBtn(); hideBusy(); });
}
function linkCurrentProjectToGitHub(owner, repo, branch, btn) {
  if (!currentProjectId) { toast("Open or start a project first", "error"); return Promise.resolve(); }
  const restoreBtn = btn ? setBtnLoading(btn, "Linking\u2026") : function () {};
  const progress = toastProgress("Linking to " + owner + "/" + repo + "\u2026");
  return fetchRepoBaseline(owner, repo, branch).then(function (result) {
    gitState.linked = { owner: owner, repo: repo, branch: branch, baseCommitSha: result.baseCommitSha, baseline: result.baseline };
    return idbSetMeta("git:" + currentProjectId, gitState.linked);
  }).then(function () {
    renderGitPanel();
    progress.success("Linked to " + owner + "/" + repo);
  }).catch(function (err) {
    console.error(err);
    progress.error("Couldn't link: " + (err && err.message ? err.message : "unknown error"));
  }).finally(restoreBtn);
}
function unlinkCurrentProject() {
  if (!currentProjectId) return;
  gitState.linked = null;
  gitState.selectedDiffPath = null;
  idbSetMeta("git:" + currentProjectId, null);
  renderGitPanel();
  toast("Unlinked from GitHub");
}
function computeGitChanges() {
  const baseline = (gitState.linked && gitState.linked.baseline) || {};
  const changes = [];
  const seen = {};
  fs.forEach(function (node, path) {
    if (node.type !== "file") return;
    seen[path] = true;
    const base = baseline[path];
    if (!base) { changes.push({ path: path, status: "added" }); return; }
    if (node.isBinary || base.isBinary) {
      if ((node.dataUrl || "") !== (base.dataUrl || "")) changes.push({ path: path, status: "modified" });
      return;
    }
    if ((node.content || "") !== (base.content || "")) changes.push({ path: path, status: "modified" });
  });
  Object.keys(baseline).forEach(function (path) {
    if (!seen[path]) changes.push({ path: path, status: "deleted" });
  });
  changes.sort(function (a, b) { return a.path.localeCompare(b.path); });
  return changes;
}
function commitAndPush(message) {
  const link = gitState.linked;
  if (!link) return Promise.reject(new Error("Not linked to a repository"));
  if (!gitState.token) return Promise.reject(new Error("Add a GitHub token above first"));
  const changes = computeGitChanges();
  if (!changes.length) return Promise.reject(new Error("No changes to commit"));
  flushAllPersists();
  const base = GITHUB_API + "/repos/" + link.owner + "/" + link.repo;
  const headers = githubHeaders({ "Content-Type": "application/json" });
  let latestCommitSha, baseTreeSha, newCommitSha;

  return fetchWithTimeout(base + "/git/refs/heads/" + encodeURIComponent(link.branch), { headers: githubHeaders() }, 20000)
    .then(function (res) { if (!res.ok) throw new Error("Couldn't read branch (" + res.status + ")"); return res.json(); })
    .then(function (refData) {
      latestCommitSha = refData.object.sha;
      if (link.baseCommitSha && latestCommitSha !== link.baseCommitSha) {
        throw new Error("The remote branch has new commits since you last synced. Re-link or re-import to refresh, then reapply your changes.");
      }
      return fetchWithTimeout(base + "/git/commits/" + latestCommitSha, { headers: githubHeaders() }, 20000);
    }).then(function (res) { if (!res.ok) throw new Error("Couldn't read base commit"); return res.json(); })
    .then(function (commitData) {
      baseTreeSha = commitData.tree.sha;
      let chain = Promise.resolve([]);
      changes.forEach(function (c) {
        chain = chain.then(function (entries) {
          if (c.status === "deleted") { entries.push({ path: c.path, mode: "100644", type: "blob", sha: null }); return entries; }
          const node = fs.get(c.path);
          const body = node.isBinary
            ? JSON.stringify({ content: (node.dataUrl || "").split(",")[1] || "", encoding: "base64" })
            : JSON.stringify({ content: node.content || "", encoding: "utf-8" });
          return fetchWithTimeout(base + "/git/blobs", { method: "POST", headers: headers, body: body }, 30000).then(function (res) {
            if (!res.ok) throw new Error("Failed uploading " + c.path);
            return res.json();
          }).then(function (blobData) {
            entries.push({ path: c.path, mode: "100644", type: "blob", sha: blobData.sha });
            return entries;
          });
        });
      });
      return chain;
    }).then(function (treeEntries) {
      return fetchWithTimeout(base + "/git/trees", { method: "POST", headers: headers, body: JSON.stringify({ base_tree: baseTreeSha, tree: treeEntries }) }, 25000);
    }).then(function (res) { if (!res.ok) throw new Error("Failed creating tree"); return res.json(); })
    .then(function (treeData) {
      return fetchWithTimeout(base + "/git/commits", { method: "POST", headers: headers, body: JSON.stringify({ message: message, tree: treeData.sha, parents: [latestCommitSha] }) }, 20000);
    }).then(function (res) { if (!res.ok) throw new Error("Failed creating commit"); return res.json(); })
    .then(function (commitData) {
      newCommitSha = commitData.sha;
      return fetchWithTimeout(base + "/git/refs/heads/" + encodeURIComponent(link.branch), { method: "PATCH", headers: headers, body: JSON.stringify({ sha: newCommitSha }) }, 20000);
    }).then(function (res) {
      if (!res.ok) throw new Error("Failed pushing (updating branch ref)");
      changes.forEach(function (c) {
        if (c.status === "deleted") { delete link.baseline[c.path]; return; }
        const node = fs.get(c.path);
        link.baseline[c.path] = node.isBinary ? { isBinary: true, dataUrl: node.dataUrl } : { isBinary: false, content: node.content };
      });
      link.baseCommitSha = newCommitSha;
      return idbSetMeta("git:" + currentProjectId, link);
    }).then(function () { return { sha: newCommitSha, count: changes.length }; });
}
function showDiffView(pane, path) {
  ensureEditorCreated(pane);
  const cid = pane === "primary" ? "editor-primary" : "editor-secondary";
  const container = document.getElementById(cid);
  let dv = container.querySelector(".diff-preview");
  if (!dv) {
    dv = ce("div", "diff-preview");
    dv.innerHTML = '<div class="bpv-toolbar"><span class="bpv-icon">' + iconSvg("git-commit", "icon-sm") + '</span><span class="bpv-path"></span><span class="bpv-spacer"></span><button class="bpv-btn" data-act="close" title="Close diff">' + iconSvg("x", "icon-sm") + '</button></div><div class="diff-host"></div>';
    container.appendChild(dv);
    dv.querySelector('[data-act="close"]').addEventListener("click", function () { closeDiffView(pane); });
  }
  dv.dataset.path = path;
  dv.querySelector(".bpv-path").textContent = "Diff: " + path;
  setPaneOverlay(pane, "diff");

  const base = (gitState.linked && gitState.linked.baseline[path]) || { content: "", isBinary: false };
  const node = fs.get(path);
  const host = dv.querySelector(".diff-host");
  if (base.isBinary || (node && node.isBinary)) {
    host.innerHTML = "<div style=\"padding:20px;color:var(--text-dim);font-size:12.5px;\">Binary file \u2014 no text diff available.</div>";
    return;
  }
  if (!editors.diff || editors.diffPane !== pane) {
    if (editors.diff) editors.diff.dispose();
    editors.diff = monaco.editor.createDiffEditor(host, Object.assign({ readOnly: true, renderSideBySide: !state.isMobile }, editorOptions()));
    editors.diffPane = pane;
  }
  const originalModel = monaco.editor.createModel(base.content || "", detectLanguage(path));
  const modifiedModel = monaco.editor.createModel((node && node.content) || "", detectLanguage(path));
  const old = editors.diff.getModel();
  editors.diff.setModel({ original: originalModel, modified: modifiedModel });
  if (old) { old.original.dispose(); old.modified.dispose(); }
  setTimeout(function () { try { editors.diff.layout(); } catch (e) {} }, 30);
}
function closeDiffView(pane) {
  const cid = pane === "primary" ? "editor-primary" : "editor-secondary";
  const container = document.getElementById(cid);
  const dv = container ? container.querySelector(".diff-preview") : null;
  if (dv) dv.remove();
  const ps = state[pane];
  if (ps.active !== -1 && ps.tabs[ps.active]) activateEditorContent(pane, ps.tabs[ps.active].path);
  else setPaneOverlay(pane, pane === "primary" ? "welcome" : "empty");
}
function initSimpleListKeyNav(containerEl, rowSelector, selectedClass, onEnter) {
  if (!containerEl || containerEl.__keyNavInit) return;
  containerEl.__keyNavInit = true;
  containerEl.setAttribute("tabindex", "0");
  containerEl.addEventListener("keydown", function (e) {
    const rows = qsa(rowSelector, containerEl);
    if (!rows.length) return;
    let idx = rows.findIndex(function (r) { return r.classList.contains(selectedClass); });
    if (e.key === "ArrowDown") {
      e.preventDefault();
      rows.forEach(function (r) { r.classList.remove(selectedClass); });
      idx = idx === -1 ? 0 : Math.min(rows.length - 1, idx + 1);
      rows[idx].classList.add(selectedClass);
      rows[idx].scrollIntoView({ block: "nearest" });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      rows.forEach(function (r) { r.classList.remove(selectedClass); });
      idx = idx === -1 ? 0 : Math.max(0, idx - 1);
      rows[idx].classList.add(selectedClass);
      rows[idx].scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (idx !== -1) onEnter(rows[idx]);
    }
  });
}
function renderGitPanel() {
  const body = qs("#git-body");
  if (!body) return;
  const tokenRow =
    '<div class="git-section-label">GitHub Token</div>' +
    '<div class="git-field">' +
    '<input id="git-token-input" type="password" autocomplete="off" placeholder="ghp_\u2026 (needs \u2018repo\u2019 scope)" value="' + escapeHtml(gitState.token ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" : "") + '" />' +
    '</div>' +
    '<div class="setting-desc">Stored only on this device, sent only to api.github.com, only when you use a Git action here. <a href="https://github.com/settings/tokens/new?scopes=repo&description=CodeForge" target="_blank" rel="noopener" style="color:var(--focus);">Create one on GitHub</a>.</div>';

  if (!currentProjectId) {
    body.innerHTML = tokenRow +
      '<div class="settings-divider"></div>' +
      '<div class="git-section-label">Import a repository</div>' +
      gitImportFormHtml() +
      '<div class="empty-hint" style="padding-left:0;">Open or start a project to link it and push changes.</div>';
    wireGitTokenAndImport(body);
    return;
  }

  if (!gitState.linked) {
    body.innerHTML = tokenRow +
      '<div class="settings-divider"></div>' +
      '<div class="git-section-label">Import a repository</div>' +
      gitImportFormHtml() +
      '<div class="settings-divider"></div>' +
      '<div class="git-section-label">Link "' + escapeHtml(projectName) + '" to a repository</div>' +
      '<div class="setting-desc" style="margin-bottom:8px;">Connects this project to an existing GitHub repo so you can commit &amp; push. This compares against the repo\u2019s current content \u2014 pushing will make GitHub match what\u2019s here.</div>' +
      gitLinkFormHtml() +
      '<div id="git-diff-list"></div>';
    wireGitTokenAndImport(body);
    wireGitLinkForm(body);
    return;
  }

  const link = gitState.linked;
  const changes = computeGitChanges();
  let html = tokenRow + '<div class="settings-divider"></div>';
  html += '<div class="git-section-label">Linked repository</div>';
  html += '<div class="setting-desc" style="margin-bottom:8px;"><a href="' + ghHelpUrl(link.owner, link.repo) + '" target="_blank" rel="noopener" style="color:var(--focus);">' + escapeHtml(link.owner + "/" + link.repo) + "</a> \u00b7 branch <b>" + escapeHtml(link.branch) + "</b></div>";
  html += '<div class="git-btn-row" style="margin-bottom:10px;"><button class="git-btn secondary" id="btn-git-resync">Re-sync from GitHub</button><button class="git-btn secondary" id="btn-git-unlink">Unlink</button></div>';
  html += '<div class="settings-divider"></div>';
  html += '<div class="git-section-label">Changes (' + changes.length + ')</div>';
  if (!changes.length) {
    html += '<div class="empty-hint" style="padding-left:0;">Nothing to commit \u2014 you\u2019re in sync with GitHub.</div>';
  } else {
    html += '<div id="git-diff-list">';
    changes.forEach(function (c) {
      const badge = c.status === "added" ? "A" : c.status === "deleted" ? "D" : "M";
      html += '<div class="git-changed-file' + (gitState.selectedDiffPath === c.path ? " selected" : "") + '" data-path="' + escapeHtml(c.path) + '" data-status="' + c.status + '">' +
        '<span class="git-status-badge ' + badge + '">' + badge + "</span>" +
        '<span class="git-file-path">' + escapeHtml(c.path) + "</span>" +
        '<button class="proj-btn" data-act="discard" title="Discard change">' + iconSvg("x", "icon-sm") + "</button>" +
        "</div>";
    });
    html += "</div>";
    html += '<div class="git-commit-box" style="margin-top:10px;">' +
      '<textarea id="git-commit-msg" placeholder="Commit message\u2026"></textarea>' +
      '<div class="git-btn-row" style="margin-top:8px;"><button class="git-btn" id="btn-git-commit-push">' + iconSvg("cloud-upload", "icon-sm") + " Commit &amp; Push</button></div>" +
      "</div>";
  }
  body.innerHTML = html;
  wireGitTokenAndImport(body);

  const resyncBtn = qs("#btn-git-resync");
  if (resyncBtn) resyncBtn.addEventListener("click", function () { linkCurrentProjectToGitHub(link.owner, link.repo, link.branch, resyncBtn); });
  const unlinkBtn = qs("#btn-git-unlink");
  if (unlinkBtn) unlinkBtn.addEventListener("click", function () { if (window.confirm("Unlink this project from GitHub? Your files won't be touched.")) unlinkCurrentProject(); });

  qsa(".git-changed-file", body).forEach(function (row) {
    row.addEventListener("click", function (e) {
      if (e.target.closest('[data-act="discard"]')) {
        const path = row.dataset.path;
        const status = row.dataset.status;
        const base = link.baseline[path];
        if (status === "deleted") { toast("Restore isn't supported yet \u2014 re-add the file manually", "error"); return; }
        if (status === "added") { deleteEntryWithConfirm(path); return; }
        if (base) {
          if (base.isBinary) { toast("Can't discard a binary file change automatically \u2014 replace it manually", "error"); return; }
          try {
            const entry = getOrCreateModel(path, fs.get(path));
            entry.model.setValue(base.content || "");
            persistNow(path);
            toast("Reverted to last synced version");
          } catch (err) {
            console.error(err);
            toast("Couldn't discard that change", "error");
          }
        }
        return;
      }
      gitState.selectedDiffPath = row.dataset.path;
      qsa(".git-changed-file", body).forEach(function (r) { r.classList.remove("selected"); });
      row.classList.add("selected");
      showDiffView(state.focusedPane === "secondary" ? "secondary" : "primary", row.dataset.path);
      if (state.isMobile) closeMobileSidebar();
    });
  });
  const commitBtn = qs("#btn-git-commit-push");
  if (commitBtn) {
    commitBtn.addEventListener("click", function () {
      const msg = (qs("#git-commit-msg").value || "").trim();
      if (!msg) { toast("Write a commit message first", "error"); return; }
      const restoreBtn = setBtnLoading(commitBtn, "Pushing\u2026");
      commitAndPush(msg).then(function (result) {
        toast("Pushed " + result.count + " change" + (result.count === 1 ? "" : "s") + " to " + link.branch);
        gitState.selectedDiffPath = null;
        renderGitPanel();
      }).catch(function (err) {
        console.error(err);
        toast((err && err.message) ? err.message : "Push failed", "error");
        restoreBtn();
      });
    });
  }
  initSimpleListKeyNav(qs("#git-diff-list"), ".git-changed-file", "kbd-sel", function (row) { row.click(); });
}
function gitImportFormHtml() {
  return '<div class="git-field"><input id="git-import-owner" placeholder="owner" autocomplete="off" /></div>' +
    '<div class="git-field"><input id="git-import-repo" placeholder="repository" autocomplete="off" /></div>' +
    '<div class="git-field"><input id="git-import-branch" placeholder="branch (default: main)" autocomplete="off" /></div>' +
    '<div class="git-btn-row"><button class="git-btn" id="btn-git-import">' + iconSvg("cloud-upload", "icon-sm") + " Import as New Project</button></div>";
}
function gitLinkFormHtml() {
  return '<div class="git-field"><input id="git-link-owner" placeholder="owner" autocomplete="off" /></div>' +
    '<div class="git-field"><input id="git-link-repo" placeholder="repository" autocomplete="off" /></div>' +
    '<div class="git-field"><input id="git-link-branch" placeholder="branch (default: main)" autocomplete="off" /></div>' +
    '<div class="git-btn-row"><button class="git-btn" id="btn-git-link">' + iconSvg("git-branch", "icon-sm") + " Link Project</button></div>";
}
function wireGitTokenAndImport(scope) {
  const tokenInput = qs("#git-token-input", scope);
  if (tokenInput) {
    tokenInput.addEventListener("focus", function () { if (gitState.token) tokenInput.value = ""; });
    tokenInput.addEventListener("change", function () {
      const v = tokenInput.value.trim();
      if (v) { gitState.token = v; idbSetMeta("githubToken", v); toast("Token saved locally"); renderGitPanel(); }
    });
  }
  const importBtn = qs("#btn-git-import", scope);
  if (importBtn) {
    importBtn.addEventListener("click", function () {
      const owner = (qs("#git-import-owner", scope).value || "").trim();
      const repo = (qs("#git-import-repo", scope).value || "").trim();
      const branch = (qs("#git-import-branch", scope).value || "").trim() || "main";
      if (!owner || !repo) { toast("Enter an owner and repository", "error"); return; }
      importFromGitHub(owner, repo, branch, importBtn);
    });
  }
}
function wireGitLinkForm(scope) {
  const linkBtn = qs("#btn-git-link", scope);
  if (linkBtn) {
    linkBtn.addEventListener("click", function () {
      const owner = (qs("#git-link-owner", scope).value || "").trim();
      const repo = (qs("#git-link-repo", scope).value || "").trim();
      const branch = (qs("#git-link-branch", scope).value || "").trim() || "main";
      if (!owner || !repo) { toast("Enter an owner and repository", "error"); return; }
      linkCurrentProjectToGitHub(owner, repo, branch, linkBtn);
    });
  }
}

/* ============================== SESSION PERSISTENCE ============================== */
function saveSession() {
  const session = {
    sidebarView: state.sidebarView,
    splitActive: state.splitActive,
    primary: { tabs: state.primary.tabs, active: state.primary.active, previewIndex: state.primary.previewIndex },
    secondary: { tabs: state.secondary.tabs, active: state.secondary.active, previewIndex: state.secondary.previewIndex },
  };
  idbSetMeta("session", session);
}
const saveSessionDebounced = debounce(saveSession, 400);
function restoreSession(session) {
  try {
    if (session.primary && session.primary.tabs && session.primary.tabs.length) {
      state.primary.tabs = session.primary.tabs.filter(function (t) { return fs.has(t.path); });
      state.primary.previewIndex = typeof session.primary.previewIndex === "number" ? session.primary.previewIndex : -1;
      state.primary.active = Math.max(0, Math.min(session.primary.active, state.primary.tabs.length - 1));
      if (state.primary.tabs.length) {
        renderTabs("primary");
        activateEditorContent("primary", state.primary.tabs[state.primary.active].path);
      } else { setPaneOverlay("primary", "welcome"); }
    } else { setPaneOverlay("primary", "welcome"); }
    if (session.splitActive && session.secondary && session.secondary.tabs && session.secondary.tabs.length) {
      state.secondary.tabs = session.secondary.tabs.filter(function (t) { return fs.has(t.path); });
      state.secondary.previewIndex = typeof session.secondary.previewIndex === "number" ? session.secondary.previewIndex : -1;
      state.secondary.active = Math.max(0, Math.min(session.secondary.active, state.secondary.tabs.length - 1));
      if (state.secondary.tabs.length) {
        activateSplit(true);
        renderTabs("secondary");
        activateEditorContent("secondary", state.secondary.tabs[state.secondary.active].path);
      }
    }
    if (session.sidebarView) switchSidebarView(session.sidebarView);
  } catch (e) { console.error("restore session failed", e); setPaneOverlay("primary", "welcome"); }
}

/* ============================== RESPONSIVE ============================== */
function updateResponsiveMode() {
  const wasMobile = state.isMobile;
  state.isMobile = window.innerWidth <= 800;
  if (wasMobile !== state.isMobile) {
    closeMobileSidebar();
    const paneSecondary = qs("#pane-secondary");
    if (!state.isMobile) {
      paneSecondary.style.transform = "";
      paneSecondary.classList.remove("mobile-open", "no-anim");
      if (state.splitActive) { paneSecondary.classList.remove("hidden"); qs("#splitter-desktop").classList.remove("hidden"); }
    } else {
      qs("#pane-primary").style.flex = "";
      qs("#splitter-desktop").classList.add("hidden");
      if (state.splitActive && !state.mobileSplitOpen) paneSecondary.classList.add("hidden");
    }
  }
  setTimeout(function () { if (editors.primary) editors.primary.layout(); if (editors.secondary) editors.secondary.layout(); }, 30);
}

/* ============================== STATIC UI WIRING ============================== */
function wireStaticUI() {
  applyStaticIcons();

  qsa(".ab-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const view = btn.dataset.view;
      if (state.sidebarView === view && !state.sidebarCollapsed) toggleSidebarCollapse();
      else { state.sidebarCollapsed = false; qs("#sidebar").classList.remove("collapsed"); switchSidebarView(view); }
    });
  });
  qsa(".nav-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const nav = btn.dataset.nav;
      if (nav === "split") onNavSplitTap();
      else if (nav === "palette") openCommandPalette();
      else onNavSidebarTap(nav);
    });
  });
  qs("#btn-menu-mobile").addEventListener("click", toggleMobileSidebar);
  qs("#sidebar-backdrop").addEventListener("click", closeMobileSidebar);
  qs("#btn-split-toggle").addEventListener("click", function () { activateSplit(!state.splitActive); });
  qs("#btn-close-split").addEventListener("click", function () { if (state.isMobile) setMobileSplitOpen(false); else activateSplit(false); });
  qs("#btn-command-palette-tb").addEventListener("click", openCommandPalette);

  qs("#project-root-row").addEventListener("click", function () {
    rootExpanded = !rootExpanded;
    qs("#root-chev").classList.toggle("open", rootExpanded);
    qs("#file-tree").style.display = rootExpanded ? "" : "none";
  });
  qs("#project-root-row").addEventListener("contextmenu", function (e) { e.preventDefault(); if (fs.size) openContextMenuForRoot(e.clientX, e.clientY); });
  attachLongPress(qs("#project-root-row"), function (x, y) { if (fs.size) openContextMenuForRoot(x, y); });

  let pendingUploadTargetDir = null;
  qs("#btn-new-file").addEventListener("click", function () { beginCreateEntry("", "file"); });
  qs("#btn-new-folder").addEventListener("click", function () { beginCreateEntry("", "dir"); });
  // qs("#btn-open-zip").addEventListener("click", function () { qs("#file-input-zip").click(); });
  // qs("#btn-export-zip").addEventListener("click", exportProjectZip);
  qs("#btn-refresh-tree").addEventListener("click", function () { renderTree(); });
  qs("#btn-collapse-folders").addEventListener("click", collapseAllExplorerFolders);

  qs("#btn-proj-upload-files").addEventListener("click", function () { pendingUploadTargetDir = null; qs("#file-input-files").click(); });
  qs("#btn-proj-upload-folder").addEventListener("click", function () { pendingUploadTargetDir = null; qs("#file-input-folder").click(); });
  qs("#btn-proj-open-zip").addEventListener("click", function () { qs("#file-input-zip").click(); });
  qs("#btn-git-refresh").addEventListener("click", function () { renderGitPanel(); toast("Refreshed"); });

  qs("#file-input-files").addEventListener("change", function (e) {
    const files = e.target.files;
    const targetDir = pendingUploadTargetDir;
    pendingUploadTargetDir = null;
    if (files.length) {
      if (targetDir !== null) {
        const progress = toastProgress("Adding " + files.length + " file(s)\u2026");
        importFileList(files, { targetDir: targetDir }).then(function (result) {
          if (result.failed.length) progress.error("Added " + result.addedCount + " file(s) \u2014 " + result.failed.length + " couldn't be read");
          else progress.success("Added " + result.addedCount + " file(s)");
        }).catch(function (err) { console.error(err); progress.error("Couldn't add those files: " + (err && err.message ? err.message : "unknown error")); });
      }
      else openFilesAsNewProject(files);
    }
    e.target.value = "";
  });
  qs("#file-input-folder").addEventListener("change", function (e) {
    const files = e.target.files;
    const targetDir = pendingUploadTargetDir;
    pendingUploadTargetDir = null;
    if (files.length) {
      if (targetDir !== null) {
        const progress = toastProgress("Adding folder\u2026");
        importFileList(files, { targetDir: targetDir }).then(function (result) {
          if (result.failed.length) progress.error("Folder added \u2014 " + result.failed.length + " file(s) couldn't be read");
          else progress.success("Folder added");
        }).catch(function (err) { console.error(err); progress.error("Couldn't add that folder: " + (err && err.message ? err.message : "unknown error")); });
      }
      else openFilesAsNewProject(files);
    }
    e.target.value = "";
  });
  qs("#file-input-zip").addEventListener("change", function (e) {
    if (e.target.files[0]) openZipFile(e.target.files[0]);
    e.target.value = "";
  });

  window.__cfSetUploadTargetDir = function (dir) { pendingUploadTargetDir = dir; };

  qsa(".welcome-action").forEach(function (el) {
    el.addEventListener("click", function () {
      const cmd = el.dataset.cmd;
      if (cmd === "new-file") beginCreateEntry("", "file");
      else if (cmd === "new-folder") beginCreateEntry("", "dir");
      else if (cmd === "open-zip") qs("#file-input-zip").click();
    });
  });

  qs("#search-input").addEventListener("input", debounce(function (e) { performSearch(e.target.value); }, 220));

  qs("#palette-input").addEventListener("input", function (e) { renderPaletteList(e.target.value); });
  qs("#palette-input").addEventListener("keydown", function (e) {
    if (e.key === "ArrowDown") { e.preventDefault(); paletteSelIndex = Math.min(paletteItemsCache.length - 1, paletteSelIndex + 1); updatePaletteSelection(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); paletteSelIndex = Math.max(0, paletteSelIndex - 1); updatePaletteSelection(); }
    else if (e.key === "Enter") { e.preventDefault(); runPaletteSelection(); }
    else if (e.key === "Escape") { closePalette(); }
  });
  qs("#palette-backdrop").addEventListener("click", function (e) { if (e.target.id === "palette-backdrop") closePalette(); });

  initSettingsPanel();
  initExplorerKeyNav();
  initSidebarResizer();
  initDesktopSplitterDrag();
  initSplitHandleDrag();
  initEdgeSwipeSidebar();
  initGlobalDnD();

  document.addEventListener("keydown", function (e) {
    const mod = e.ctrlKey || e.metaKey;
    const tag = (e.target.tagName || "").toLowerCase();
    const inInput = tag === "input" || tag === "textarea";
    if (!mod) { if (e.key === "Escape") { closePalette(); hideContextMenu(); } return; }
    const k = e.key.toLowerCase();
    if (!e.shiftKey && k === "p" && !inInput) { e.preventDefault(); openQuickOpen(); }
    else if (e.shiftKey && k === "p") { e.preventDefault(); openCommandPalette(); }
    else if (!e.shiftKey && k === "n" && !inInput) { e.preventDefault(); beginCreateEntry("", "file"); }
    else if (!e.shiftKey && k === "b" && !inInput) { e.preventDefault(); if (state.isMobile) toggleMobileSidebar(); else toggleSidebarCollapse(); }
    else if (!e.shiftKey && e.key === "\\" && !inInput) { e.preventDefault(); activateSplit(!state.splitActive); }
    else if (!e.shiftKey && k === "s" && !inInput) { e.preventDefault(); saveActive(); }
  });
  window.addEventListener("resize", debounce(updateResponsiveMode, 150));
  window.addEventListener("beforeunload", function (e) {
    if (!state.settings.autoSave && dirtyPaths.size > 0) { e.preventDefault(); e.returnValue = ""; }
  });
}
function initSettingsPanel() {
  qs("#set-fontsize").value = state.settings.fontSize;
  qs("#set-tabsize").value = state.settings.tabSize;
  qs("#set-theme").value = state.settings.theme;
  syncSwitch("#set-autosave", state.settings.autoSave);
  syncSwitch("#set-wordwrap", state.settings.wordWrap);
  syncSwitch("#set-minimap", state.settings.minimap);
  syncSwitch("#set-whitespace", state.settings.whitespace);
  qs("#set-autosave").addEventListener("click", function () {
    state.settings.autoSave = !state.settings.autoSave;
    syncSwitch("#set-autosave", state.settings.autoSave);
    saveSettings();
    if (state.settings.autoSave) { flushAllDirty(); toast("Auto Save on — flushed unsaved changes"); }
    else toast("Auto Save off — use Ctrl+S to save");
  });
  qs("#set-fontsize").addEventListener("change", function (e) { state.settings.fontSize = clampInt(e.target.value, 10, 28, 14); e.target.value = state.settings.fontSize; applyOptionsToAllEditors(); saveSettings(); });
  qs("#set-tabsize").addEventListener("change", function (e) { state.settings.tabSize = clampInt(e.target.value, 1, 8, 2); e.target.value = state.settings.tabSize; applyOptionsToAllEditors(); saveSettings(); });
  qs("#set-theme").addEventListener("change", function (e) { state.settings.theme = e.target.value; if (window.monaco) monaco.editor.setTheme(e.target.value); saveSettings(); });
  qs("#set-wordwrap").addEventListener("click", function () { state.settings.wordWrap = !state.settings.wordWrap; syncSwitch("#set-wordwrap", state.settings.wordWrap); applyOptionsToAllEditors(); saveSettings(); });
  qs("#set-minimap").addEventListener("click", function () { state.settings.minimap = !state.settings.minimap; syncSwitch("#set-minimap", state.settings.minimap); applyOptionsToAllEditors(); saveSettings(); });
  qs("#set-whitespace").addEventListener("click", function () { state.settings.whitespace = !state.settings.whitespace; syncSwitch("#set-whitespace", state.settings.whitespace); applyOptionsToAllEditors(); saveSettings(); });
  qs("#btn-clear-project").addEventListener("click", confirmClearAll);
  updateStorageInfo();
}

/* ============================== BOOT ============================== */
function showBootError(err) {
  const msgEl = document.getElementById("boot-msg");
  const spinner = document.querySelector("#boot-splash .spinner");
  if (msgEl) msgEl.textContent = "Something went wrong starting CodeForge.";
  if (spinner) spinner.style.display = "none";
  const el = document.getElementById("boot-error");
  if (el) {
    el.textContent = (err && err.message) ? err.message : String(err);
    el.classList.add("show");
    if (!el.querySelector(".boot-reload-btn")) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "boot-reload-btn";
      btn.textContent = "Reload";
      btn.addEventListener("click", function () { location.reload(); });
      el.appendChild(document.createElement("br"));
      el.appendChild(btn);
    }
  }
}
function boot() {
  let session = null;
  idbOpen().then(function () {
    return Promise.all([idbGetAllNodes(), idbGetMeta("project"), idbGetMeta("session"), idbGetMeta("settings"), idbListProjects(), idbGetMeta("currentProjectId")]);
  }).then(function (results) {
    const nodes = results[0], meta = results[1], settings = results[3], projects = results[4], savedCurrentId = results[5];
    session = results[2];
    nodes.forEach(function (n) { fs.set(n.path, n); });
    if (meta && meta.name) projectName = meta.name;
    if (settings) state.settings = Object.assign(state.settings, settings);
    projects.forEach(function (p) { projectsIndex.set(p.id, p); });

    let migrationPromise = Promise.resolve();
    if (savedCurrentId && projectsIndex.has(savedCurrentId)) {
      currentProjectId = savedCurrentId;
    } else if (fs.size > 0) {
      // Upgrading from a single-project version, or an otherwise-orphaned active workspace:
      // register what's already loaded as a real project so it's safe to switch away from.
      const id = generateProjectId();
      const now = Date.now();
      const stats = computeProjectStats();
      const entry = { id: id, name: projectName || "My Project", createdAt: (meta && meta.createdAt) || now, updatedAt: now, fileCount: stats.fileCount, sizeBytes: stats.sizeBytes };
      projectsIndex.set(id, entry);
      currentProjectId = id;
      migrationPromise = Promise.all([idbPutProjectMeta(entry), idbSetMeta("currentProjectId", id)]);
    }

    return migrationPromise.then(function () {
      return currentProjectId ? idbGetMeta("git:" + currentProjectId) : null;
    }).then(function (gitLink) {
      gitState.linked = gitLink || null;
      return idbGetMeta("githubToken");
    }).then(function (token) {
      gitState.token = token || "";
    });
  }).then(function () {
    wireStaticUI();
    createPrimaryEditor();
    initServiceWorker();
    monaco.editor.setTheme(state.settings.theme);
    renderTree();
    renderProjectsList();
    renderGitPanel();
    if (session) restoreSession(session);
    else setPaneOverlay("primary", "welcome");
    updateResponsiveMode();
    const splash = document.getElementById("boot-splash");
    const app = document.getElementById("app");
    if (splash) splash.classList.add("hidden");
    if (app) app.style.visibility = "visible";
  }).catch(function (err) {
    console.error(err);
    showBootError(err);
  });
}

/* ============================== MONACO LOADER GLUE ============================== */
document.addEventListener("DOMContentLoaded", function () {
  try {
    window.MonacoEnvironment = {
      getWorkerUrl: function () {
        return "vendor/vs/base/worker/workerMain.js";
      },
    };
    require.config({ paths: { vs: "vendor/vs" } });
    require(["vs/editor/editor.main"], function () {
      // We ship without the ~4.4MB TypeScript language-service worker to keep the download small.
      // Disabling its "rich" mode up front (before any model exists) means Monaco never tries to
      // spin that worker up at all, so there's nothing to fail — syntax highlighting (Monarch
      // tokenizer) and Monaco's built-in word-based autocomplete keep working for every language,
      // including JS/TS. What's actually gone: semantic/type-aware autocomplete, inline type-error
      // squiggles, and hover type info for JS/TS specifically.
      try {
        const tsCfg = {
          completionItems: false, hovers: false, documentSymbols: false, definitions: false,
          references: false, documentHighlights: false, rename: false, diagnostics: false,
          documentRangeFormattingEdits: false, signatureHelp: false, onTypeFormattingEdits: false,
          codeActions: false, inlayHints: false,
        };
        monaco.languages.typescript.typescriptDefaults.setModeConfiguration(tsCfg);
        monaco.languages.typescript.javascriptDefaults.setModeConfiguration(tsCfg);
      } catch (e) { /* non-fatal: worst case is a couple of console warnings */ }
      boot();
    }, function () {
      showBootError(new Error("Couldn't load the editor engine from vendor/vs. Make sure that folder is next to index.html and that you're running CodeForge through a local web server, not by double-clicking the file."));
    });
  } catch (err) {
    console.error(err);
    showBootError(err);
  }
});

})();
