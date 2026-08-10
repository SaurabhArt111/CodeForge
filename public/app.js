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
  "terminal": '<rect x="2" y="4" width="20" height="16" rx="2"></rect><polyline points="6 9 10 12 6 15"></polyline><line x1="12" y1="15" x2="18" y2="15"></line>',
  "square": '<rect x="4" y="4" width="16" height="16" rx="2"></rect>',
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
  "log-out": '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line>',
  "plus": '<line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>',
  "scissors": '<circle cx="6" cy="6" r="3"></circle><circle cx="6" cy="18" r="3"></circle><line x1="20" y1="4" x2="8.12" y2="15.88"></line><line x1="14.47" y1="14.48" x2="20" y2="20"></line><line x1="8.12" y1="8.12" x2="12" y2="12"></line>',
  "undo": '<polyline points="9 14 4 9 9 4"></polyline><path d="M20 20v-7a4 4 0 0 0-4-4H4"></path>',
  "redo": '<polyline points="15 14 20 9 15 4"></polyline><path d="M4 20v-7a4 4 0 0 1 4-4h12"></path>',
  "keyboard": '<rect x="2" y="4" width="20" height="16" rx="2"></rect><line x1="6" y1="8" x2="6.01" y2="8"></line><line x1="10" y1="8" x2="10.01" y2="8"></line><line x1="14" y1="8" x2="14.01" y2="8"></line><line x1="18" y1="8" x2="18.01" y2="8"></line><line x1="6" y1="12" x2="6.01" y2="12"></line><line x1="18" y1="12" x2="18.01" y2="12"></line><line x1="7" y1="16" x2="17" y2="16"></line>',
  "smartphone": '<rect x="5" y="2" width="14" height="20" rx="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line>',
  "arrow-left": '<line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline>',
  "arrow-right": '<line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline>',
  "arrow-up": '<line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline>',
  "arrow-down": '<line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline>',
  "sliders": '<line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line>',
  "check-square": '<polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>',
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

/* ============================== UNIFIED MODAL / DIALOG SYSTEM ==============================
   One consistent dialog component used everywhere CodeForge needs focused input or a decision
   from the person — confirmations, renaming, new-project naming, and the richer Git workflows
   (owner/repo/branch, import options) — instead of a mix of native window.confirm/prompt popups
   and one-off inline forms glued into panels. */
let activeModal = null;
function closeModal(result) {
  if (!activeModal) return;
  const m = activeModal;
  activeModal = null;
  m.backdrop.classList.remove("show");
  document.removeEventListener("keydown", m.onKeydown, true);
  setTimeout(function () { if (m.backdrop.parentNode) m.backdrop.remove(); }, 160);
  if (m.resolve) m.resolve(result === undefined ? null : result);
}
// opts: { title, bodyHtml, build(bodyEl), actions:[{label,variant,value,disabled}], initialFocus, wide }
// Returns a Promise that resolves with the value of whichever action button was clicked, or
// null if the dialog was dismissed (Escape / backdrop click / close button).
function openModal(opts) {
  return new Promise(function (resolve) {
    if (activeModal) closeModal(null);
    const backdrop = ce("div", "modal-backdrop");
    const box = ce("div", "modal-box" + (opts.wide ? " wide" : ""));
    const header = ce("div", "modal-header");
    header.innerHTML = "<span>" + escapeHtml(opts.title || "") + "</span>";
    const closeBtn = ce("button", "modal-close-btn", iconSvg("x", "icon-sm"));
    closeBtn.type = "button";
    header.appendChild(closeBtn);
    const body = ce("div", "modal-body");
    if (opts.bodyHtml !== undefined) body.innerHTML = opts.bodyHtml;
    box.appendChild(header);
    box.appendChild(body);
    let footer = null;
    if (opts.actions && opts.actions.length) {
      footer = ce("div", "modal-footer");
      opts.actions.forEach(function (act) {
        const btn = ce("button", "modal-btn" + (act.variant ? " " + act.variant : ""), escapeHtml(act.label));
        btn.type = "button";
        if (act.disabled) btn.disabled = true;
        btn.addEventListener("click", function () {
          if (act.onClick) {
            const maybe = act.onClick(body);
            if (maybe === false) return; // validation failed — stay open
          }
          closeModal(act.value !== undefined ? act.value : act.label);
        });
        footer.appendChild(btn);
      });
      box.appendChild(footer);
    }
    backdrop.appendChild(box);
    document.body.appendChild(backdrop);
    activeModal = { backdrop: backdrop, resolve: resolve };
    if (opts.build) opts.build(body, function (value) { closeModal(value); });
    requestAnimationFrame(function () { backdrop.classList.add("show"); });
    closeBtn.addEventListener("click", function () { closeModal(null); });
    backdrop.addEventListener("mousedown", function (e) { if (e.target === backdrop) closeModal(null); });
    const onKeydown = function (e) {
      if (e.key === "Escape") { e.stopPropagation(); closeModal(null); }
      else if (e.key === "Enter" && !opts.noEnterSubmit) {
        const tag = (e.target.tagName || "").toLowerCase();
        if (tag === "textarea") return;
        const primary = footer && footer.querySelector(".modal-btn.primary");
        if (primary && !primary.disabled) { e.preventDefault(); primary.click(); }
      }
    };
    activeModal.onKeydown = onKeydown;
    document.addEventListener("keydown", onKeydown, true);
    setTimeout(function () {
      const toFocus = opts.initialFocus ? body.querySelector(opts.initialFocus) : body.querySelector("input,textarea");
      if (toFocus) { toFocus.focus(); if (toFocus.select) toFocus.select(); }
      else if (footer) { const p = footer.querySelector(".modal-btn.primary") || footer.querySelector(".modal-btn"); if (p) p.focus(); }
    }, 60);
  });
}
// Promise<boolean> — a styled replacement for window.confirm().
function confirmModal(message, opts) {
  opts = opts || {};
  return openModal({
    title: opts.title || "Are you sure?",
    bodyHtml: '<p class="modal-message">' + escapeHtml(message) + "</p>",
    actions: [
      { label: opts.cancelLabel || "Cancel", value: false },
      { label: opts.confirmLabel || "OK", value: true, variant: opts.danger ? "danger primary" : "primary" },
    ],
  }).then(function (v) { return v === true; });
}
// Promise<string|null> — a styled replacement for window.prompt().
function promptModal(title, defaultValue, opts) {
  opts = opts || {};
  let capturedValue = null;
  return openModal({
    title: title,
    bodyHtml: '<div class="modal-field"><input type="text" id="modal-prompt-input" autocomplete="off" placeholder="' + escapeHtml(opts.placeholder || "") + '" /></div>' + (opts.hint ? '<p class="modal-hint">' + escapeHtml(opts.hint) + "</p>" : ""),
    build: function (body) { body.querySelector("#modal-prompt-input").value = defaultValue || ""; },
    actions: [
      { label: "Cancel", value: null },
      {
        label: opts.confirmLabel || "OK", value: "__submit__", variant: "primary",
        onClick: function (body) {
          const v = body.querySelector("#modal-prompt-input").value.trim();
          if (opts.required !== false && !v) { body.querySelector("#modal-prompt-input").classList.add("field-error"); return false; }
          capturedValue = v;
        },
      },
    ],
  }).then(function (v) { return v === "__submit__" ? capturedValue : null; });
}

/* ============================== TOUCH EDITING (mobile / tablet) ==============================
   Monaco's own touch support is minimal — no drag handles, no native-feeling selection gestures,
   and its context menu is fiddly to hit with a finger. This layers a small, self-contained touch
   UI on top: long-press to select a word, drag handles to adjust the selection, and a compact
   Cut/Copy/Paste/Select All/Undo/Redo menu — the same set VS Code's mobile web editor offers. */
function isTouchDevice() { return ("ontouchstart" in window) || (navigator.maxTouchPoints || 0) > 0; }
function initTouchEditingForEditor(ed, pane) {
  if (!isTouchDevice() || !ed) return;
  const domNode = ed.getDomNode();
  if (!domNode || domNode.__touchEditingInit) return;
  domNode.__touchEditingInit = true;

  // Each editor gets its own pair of handles — with split view, primary and secondary are both
  // alive at once, and sharing one pair of DOM elements between them means a drag on one editor
  // would also move the other's selection (both instances listening on the same nodes).
  const startHandle = ce("div", "touch-handle");
  const endHandle = ce("div", "touch-handle");
  document.body.appendChild(startHandle);
  document.body.appendChild(endHandle);
  let dragging = null; // "start" | "end" | null
  let longPressTimer = null;
  let touchStartXY = null;

  function hideHandlesAndMenu() {
    startHandle.classList.remove("show");
    endHandle.classList.remove("show");
    hideContextMenu();
  }
  function positionHandle(el, pos, atLineStart) {
    const vis = ed.getScrolledVisiblePosition(pos);
    if (!vis) { el.classList.remove("show"); return; }
    const rect = domNode.getBoundingClientRect();
    el.style.left = (rect.left + vis.left) + "px";
    el.style.top = (rect.top + vis.top + vis.height) + "px";
    el.classList.add("show");
  }
  function updateHandles() {
    const sel = ed.getSelection();
    if (!sel || sel.isEmpty()) { hideHandlesAndMenu(); return; }
    positionHandle(startHandle, sel.getStartPosition());
    positionHandle(endHandle, sel.getEndPosition());
  }
  function showTouchMenuNear(clientX, clientY) {
    const sel = ed.getSelection();
    const hasSelection = sel && !sel.isEmpty();
    const items = [];
    if (hasSelection) {
      items.push({ label: "Cut", icon: "scissors", action: function () { touchClipboardCut(ed); } });
      items.push({ label: "Copy", icon: "copy", action: function () { touchClipboardCopy(ed); } });
    }
    items.push({ label: "Paste", icon: "clipboard", action: function () { touchClipboardPaste(ed); } });
    items.push({ label: "Select All", icon: "check-square", action: function () { ed.setSelection(ed.getModel().getFullModelRange()); updateHandles(); } });
    items.push("-");
    items.push({ label: "Undo", icon: "undo", action: function () { ed.trigger("touch", "undo", null); } });
    items.push({ label: "Redo", icon: "redo", action: function () { ed.trigger("touch", "redo", null); } });
    showContextMenu(items, clientX, clientY);
  }

  domNode.addEventListener("touchstart", function (e) {
    if (e.touches.length !== 1) { hideHandlesAndMenu(); return; }
    const t = e.touches[0];
    touchStartXY = { x: t.clientX, y: t.clientY };
    longPressTimer = setTimeout(function () {
      longPressTimer = null;
      const target = ed.getTargetAtClientPoint(t.clientX, t.clientY);
      if (!target || !target.position) return;
      const model = ed.getModel();
      if (!model) return;
      const word = model.getWordAtPosition(target.position);
      if (word) {
        ed.setSelection(new monaco.Range(target.position.lineNumber, word.startColumn, target.position.lineNumber, word.endColumn));
      } else {
        ed.setPosition(target.position);
      }
      ed.focus();
      if (navigator.vibrate) navigator.vibrate(12);
      updateHandles();
      showTouchMenuNear(t.clientX, t.clientY);
    }, 480);
  }, { passive: true });
  domNode.addEventListener("touchmove", function (e) {
    if (!longPressTimer || !touchStartXY) return;
    const t = e.touches[0];
    if (Math.abs(t.clientX - touchStartXY.x) > 10 || Math.abs(t.clientY - touchStartXY.y) > 10) { clearTimeout(longPressTimer); longPressTimer = null; }
  }, { passive: true });
  domNode.addEventListener("touchend", function () { if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; } }, { passive: true });

  ed.onDidScrollChange(function () { if (startHandle.classList.contains("show")) updateHandles(); });
  ed.onDidChangeCursorSelection(function (e) {
    if (dragging) return; // we're driving the selection ourselves — avoid feedback jitter
    if (e.selection.isEmpty()) hideHandlesAndMenu(); else updateHandles();
  });
  ed.onDidBlurEditorText(function () { if (!dragging) hideHandlesAndMenu(); });

  function wireHandleDrag(handleEl, whichEnd) {
    handleEl.addEventListener("touchstart", function (e) {
      e.preventDefault(); e.stopPropagation();
      dragging = whichEnd;
      hideContextMenu();
    }, { passive: false });
  }
  wireHandleDrag(startHandle, "start");
  wireHandleDrag(endHandle, "end");
  document.addEventListener("touchmove", function (e) {
    if (!dragging || e.touches.length !== 1) return;
    e.preventDefault();
    const t = e.touches[0];
    // Offset the sampled point above the fingertip so the character being selected isn't hidden
    // under the touch itself — the same trick iOS/Android native text selection uses.
    const target = ed.getTargetAtClientPoint(t.clientX, t.clientY - 28);
    if (!target || !target.position) return;
    const sel = ed.getSelection();
    if (!sel) return;
    const anchor = dragging === "start" ? sel.getEndPosition() : sel.getStartPosition();
    const moving = target.position;
    const newSel = dragging === "start"
      ? monaco.Selection.fromPositions(moving, anchor)
      : monaco.Selection.fromPositions(anchor, moving);
    ed.setSelection(newSel);
    updateHandles();
  }, { passive: false });
  document.addEventListener("touchend", function () {
    if (!dragging) return;
    const wasDragging = dragging;
    dragging = null;
    const sel = ed.getSelection();
    if (sel && !sel.isEmpty()) {
      const endPos = wasDragging === "start" ? sel.getStartPosition() : sel.getEndPosition();
      const vis = ed.getScrolledVisiblePosition(endPos);
      const rect = domNode.getBoundingClientRect();
      if (vis) showTouchMenuNear(rect.left + vis.left, rect.top + vis.top);
    }
  });
}
function touchClipboardCopy(ed) {
  const sel = ed.getSelection();
  const model = ed.getModel();
  if (!sel || sel.isEmpty() || !model) return;
  const text = model.getValueInRange(sel);
  writeClipboardText(text).then(function () { toast("Copied"); }).catch(function () { toast("Couldn't copy \u2014 your browser blocked clipboard access", "error"); });
}
function touchClipboardCut(ed) {
  const sel = ed.getSelection();
  const model = ed.getModel();
  if (!sel || sel.isEmpty() || !model) return;
  const text = model.getValueInRange(sel);
  writeClipboardText(text).then(function () {
    ed.executeEdits("touch-cut", [{ range: sel, text: "", forceMoveMarkers: true }]);
    toast("Cut");
  }).catch(function () { toast("Couldn't cut \u2014 your browser blocked clipboard access", "error"); });
}
function touchClipboardPaste(ed) {
  if (!navigator.clipboard || !navigator.clipboard.readText) { toast("Paste isn't available in this browser \u2014 use your device's own paste gesture", "error"); return; }
  navigator.clipboard.readText().then(function (text) {
    const sel = ed.getSelection();
    if (!sel) return;
    ed.executeEdits("touch-paste", [{ range: sel, text: text, forceMoveMarkers: true }]);
    ed.setPosition(ed.getModel().getPositionAt(ed.getModel().getOffsetAt(sel.getStartPosition()) + text.length));
    toast("Pasted");
  }).catch(function () { toast("Couldn't paste \u2014 grant clipboard permission and try again", "error"); });
}
function writeClipboardText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
  return new Promise(function (resolve, reject) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.focus(); ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      ok ? resolve() : reject(new Error("execCommand copy failed"));
    } catch (err) { reject(err); }
  });
}

/* ============================== MOBILE VIRTUAL KEY BAR ==============================
   A row of tap targets for keys that are awkward or impossible to reach on a touch on-screen
   keyboard — modifiers plus Tab/Esc/navigation — so shortcuts like Ctrl+S work with taps instead
   of needing a physical keyboard. Modifier taps are "sticky": tap Ctrl, tap S, and Ctrl+S fires
   as one combination, then modifiers release automatically. Custom shortcuts fire their whole
   combination in a single tap. */
const VKEY_MODIFIERS = ["ctrl", "shift", "alt", "meta"];
const VKEY_MOD_LABELS = { ctrl: "Ctrl", shift: "Shift", alt: "Alt", meta: "Cmd" };
const VKEY_DEFS = {
  tab: { label: "Tab", key: "Tab", code: "Tab", keyCode: 9 },
  esc: { label: "Esc", key: "Escape", code: "Escape", keyCode: 27 },
  enter: { label: "\u21b5", key: "Enter", code: "Enter", keyCode: 13 },
  backspace: { label: "\u232b", key: "Backspace", code: "Backspace", keyCode: 8 },
  delete: { label: "Del", key: "Delete", code: "Delete", keyCode: 46 },
  arrowleft: { label: "\u2190", key: "ArrowLeft", code: "ArrowLeft", keyCode: 37 },
  arrowup: { label: "\u2191", key: "ArrowUp", code: "ArrowUp", keyCode: 38 },
  arrowright: { label: "\u2192", key: "ArrowRight", code: "ArrowRight", keyCode: 39 },
  arrowdown: { label: "\u2193", key: "ArrowDown", code: "ArrowDown", keyCode: 40 },
  home: { label: "Home", key: "Home", code: "Home", keyCode: 36 },
  end: { label: "End", key: "End", code: "End", keyCode: 35 },
  pageup: { label: "PgUp", key: "PageUp", code: "PageUp", keyCode: 33 },
  pagedown: { label: "PgDn", key: "PageDown", code: "PageDown", keyCode: 34 },
};
function keyDefFromLabel(raw) {
  const c = (raw || "").trim();
  if (!c) return null;
  const lower = c.toLowerCase();
  if (VKEY_DEFS[lower]) return VKEY_DEFS[lower];
  if (/^[a-zA-Z]$/.test(c)) return { key: c.toLowerCase(), code: "Key" + c.toUpperCase(), keyCode: c.toUpperCase().charCodeAt(0), label: c.toUpperCase() };
  if (/^[0-9]$/.test(c)) return { key: c, code: "Digit" + c, keyCode: c.charCodeAt(0), label: c };
  const fMatch = /^f([1-9]|1[0-9]|2[0-4])$/i.exec(c);
  if (fMatch) { const n = parseInt(fMatch[1], 10); return { key: "F" + n, code: "F" + n, keyCode: 111 + n, label: "F" + n }; }
  const PUNCT = {
    "/": { key: "/", code: "Slash", keyCode: 191 }, "\\": { key: "\\", code: "Backslash", keyCode: 220 },
    ";": { key: ";", code: "Semicolon", keyCode: 186 }, "'": { key: "'", code: "Quote", keyCode: 222 },
    "[": { key: "[", code: "BracketLeft", keyCode: 219 }, "]": { key: "]", code: "BracketRight", keyCode: 221 },
    ",": { key: ",", code: "Comma", keyCode: 188 }, ".": { key: ".", code: "Period", keyCode: 190 },
    "-": { key: "-", code: "Minus", keyCode: 189 }, "=": { key: "=", code: "Equal", keyCode: 187 },
    "`": { key: "`", code: "Backquote", keyCode: 192 },
  };
  if (PUNCT[c]) return Object.assign({ label: c }, PUNCT[c]);
  return { key: c, code: "", keyCode: 0, label: c.slice(0, 3) };
}
function currentFocusedEditorInputEl() {
  const ed = editors[state.focusedPane];
  if (!ed) return null;
  const node = ed.getDomNode();
  return node ? node.querySelector("textarea") : null;
}
// Dispatches a REAL KeyboardEvent (never a plain Event/CustomEvent) at the focused editor's own
// input element. This matters: Monaco keeps a page-wide "ModifierKeyEmitter" singleton that
// wraps every keydown/keyup that reaches document.body in its own StandardKeyboardEvent, which
// calls event.getModifierState(...) on it — a method plain Event objects don't have. Feeding it
// anything other than a genuine KeyboardEvent throws exactly the
// "t.getModifierState is not a function" crash CodeForge hit before this feature existed.
// As an additional safety net, install a capture-phase listener that ensures every
// keyboard event reaching the document has a callable `getModifierState` method.
(function () {
  function shimGetModifierState(ev) {
    try {
      if (typeof ev.getModifierState !== "function") {
        ev.getModifierState = function (key) {
          if (!key) return false;
          if (key === "AltGraph") return false;
          if (key === "Alt") return !!this.altKey;
          if (key === "Control" || key === "Ctrl") return !!this.ctrlKey;
          if (key === "Shift") return !!this.shiftKey;
          if (key === "Meta") return !!this.metaKey;
          return false;
        };
      }
    } catch (e) {
      // Best-effort only — if the event is non-extensible, skip.
    }
  }
  document.addEventListener("keydown", shimGetModifierState, true);
  document.addEventListener("keyup", shimGetModifierState, true);
})();
function dispatchVirtualKey(def, mods) {
  if (!def) return;
  const target = currentFocusedEditorInputEl() || document.activeElement || document.body;
  const init = {
    key: def.key, code: def.code || "", keyCode: def.keyCode || 0, which: def.keyCode || 0,
    ctrlKey: !!mods.ctrl, shiftKey: !!mods.shift, altKey: !!mods.alt, metaKey: !!mods.meta,
    bubbles: true, cancelable: true, composed: true,
  };
  // Some browsers / synthetic events may not implement `getModifierState` — Monaco
  // calls this method and will throw if it's missing. Ensure the created event
  // has a safe shim for `getModifierState` so Monaco can query modifier state
  // (e.g. "AltGraph") without crashing.
  function makeKeyboardEvent(type) {
    const ev = new KeyboardEvent(type, init);
    if (typeof ev.getModifierState !== "function") {
      ev.getModifierState = function (key) {
        if (!key) return false;
        // Normalize common names Monaco may query.
        if (key === "AltGraph") return false;
        if (key === "Alt") return !!this.altKey;
        if (key === "Control" || key === "Ctrl") return !!this.ctrlKey;
        if (key === "Shift") return !!this.shiftKey;
        if (key === "Meta") return !!this.metaKey;
        return false;
      };
    }
    return ev;
  }

  target.dispatchEvent(makeKeyboardEvent("keydown"));
  target.dispatchEvent(makeKeyboardEvent("keyup"));
}
function updateVkeyBarVisibility() {
  const bar = qs("#vkey-bar");
  if (!bar) return;
  const show = state.isMobile && state.settings.vkeysEnabled && !!currentProjectId;
  bar.classList.toggle("show", show);
}
function renderVkeyBar() {
  const row = qs("#vkey-row");
  if (!row) return;
  row.innerHTML = "";
  const shown = state.settings.vkeysShown || [];
  VKEY_MODIFIERS.forEach(function (m) {
    if (shown.indexOf(m) === -1) return;
    const btn = ce("button", "vkey-btn mod" + (vkeyModState[m] ? " active" : ""), VKEY_MOD_LABELS[m]);
    btn.type = "button";
    btn.addEventListener("click", function () {
      vkeyModState[m] = !vkeyModState[m];
      btn.classList.toggle("active", vkeyModState[m]);
    });
    row.appendChild(btn);
  });
  Object.keys(VKEY_DEFS).forEach(function (id) {
    if (shown.indexOf(id) === -1) return;
    const def = VKEY_DEFS[id];
    const btn = ce("button", "vkey-btn", def.label);
    btn.type = "button";
    btn.addEventListener("click", function () {
      dispatchVirtualKey(def, vkeyModState);
      VKEY_MODIFIERS.forEach(function (m) { vkeyModState[m] = false; });
      renderVkeyBar();
    });
    row.appendChild(btn);
  });
  if (customShortcuts.length) {
    const sep = ce("div", "vkey-sep");
    row.appendChild(sep);
    customShortcuts.forEach(function (sc) {
      const btn = ce("button", "vkey-btn custom", escapeHtml(sc.label));
      btn.type = "button";
      btn.title = shortcutComboText(sc);
      btn.addEventListener("click", function () { dispatchVirtualKey(keyDefFromLabel(sc.keyLabel), sc); });
      row.appendChild(btn);
    });
  }
}
function shortcutComboText(sc) {
  const parts = [];
  if (sc.ctrl) parts.push("Ctrl"); if (sc.shift) parts.push("Shift"); if (sc.alt) parts.push("Alt"); if (sc.meta) parts.push("Cmd");
  parts.push((sc.keyLabel || "").toUpperCase());
  return parts.join("+");
}
function saveCustomShortcuts() { return idbSetMeta("customShortcuts", customShortcuts); }
function openAddShortcutModal(existing) {
  const editing = !!existing;
  openModal({
    title: editing ? "Edit Shortcut" : "Add Custom Shortcut",
    bodyHtml:
      '<div class="modal-field"><label>Name</label><input id="sc-label" placeholder="e.g. Format Document" autocomplete="off" /></div>' +
      '<div class="modal-field"><label>Key</label><input id="sc-key" placeholder="e.g. S, F, /, F12" autocomplete="off" maxlength="6" /></div>' +
      '<div class="modal-field"><label>Modifiers</label><div class="sc-mod-toggles">' +
      '<label class="sc-mod-chip"><input type="checkbox" id="sc-mod-ctrl" /> Ctrl</label>' +
      '<label class="sc-mod-chip"><input type="checkbox" id="sc-mod-shift" /> Shift</label>' +
      '<label class="sc-mod-chip"><input type="checkbox" id="sc-mod-alt" /> Alt</label>' +
      '<label class="sc-mod-chip"><input type="checkbox" id="sc-mod-meta" /> Cmd</label>' +
      "</div></div>" +
      '<p class="modal-hint">Fires as one tap in the mobile key bar \u2014 e.g. Ctrl checked + key "S" gives Ctrl+S.</p>',
    initialFocus: "#sc-label",
    build: function (body) {
      if (editing) {
        body.querySelector("#sc-label").value = existing.label;
        body.querySelector("#sc-key").value = existing.keyLabel;
        body.querySelector("#sc-mod-ctrl").checked = !!existing.ctrl;
        body.querySelector("#sc-mod-shift").checked = !!existing.shift;
        body.querySelector("#sc-mod-alt").checked = !!existing.alt;
        body.querySelector("#sc-mod-meta").checked = !!existing.meta;
      }
    },
    actions: [
      { label: "Cancel", value: null },
      {
        label: editing ? "Save" : "Add", value: "save", variant: "primary",
        onClick: function (body) {
          const label = body.querySelector("#sc-label").value.trim();
          const keyLabel = body.querySelector("#sc-key").value.trim();
          if (!label || !keyLabel) { toast("Give it a name and a key", "error"); return false; }
          const sc = {
            id: editing ? existing.id : ("sc" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)),
            label: label, keyLabel: keyLabel,
            ctrl: body.querySelector("#sc-mod-ctrl").checked, shift: body.querySelector("#sc-mod-shift").checked,
            alt: body.querySelector("#sc-mod-alt").checked, meta: body.querySelector("#sc-mod-meta").checked,
          };
          if (editing) { const idx = customShortcuts.findIndex(function (s) { return s.id === existing.id; }); if (idx !== -1) customShortcuts[idx] = sc; }
          else customShortcuts.push(sc);
          saveCustomShortcuts();
          renderCustomShortcutsList();
          renderVkeyBar();
        },
      },
    ],
  });
}
function renderCustomShortcutsList() {
  const list = qs("#custom-shortcuts-list");
  if (!list) return;
  list.innerHTML = "";
  if (!customShortcuts.length) { list.appendChild(ce("div", "empty-hint", "No custom shortcuts yet.")); return; }
  customShortcuts.forEach(function (sc) {
    const row = ce("div", "custom-shortcut-row");
    row.innerHTML = '<div class="csr-main"><div class="csr-label">' + escapeHtml(sc.label) + '</div><div class="csr-combo">' + escapeHtml(shortcutComboText(sc)) + "</div></div>" +
      '<div class="csr-actions"><button class="proj-btn" data-act="edit">' + iconSvg("edit", "icon-sm") + '</button><button class="proj-btn" data-act="delete">' + iconSvg("trash", "icon-sm") + "</button></div>";
    row.querySelector('[data-act="edit"]').addEventListener("click", function () { openAddShortcutModal(sc); });
    row.querySelector('[data-act="delete"]').addEventListener("click", function () {
      confirmModal('Remove the "' + sc.label + '" shortcut?', { title: "Remove Shortcut", confirmLabel: "Remove", danger: true }).then(function (ok) {
        if (!ok) return;
        customShortcuts = customShortcuts.filter(function (s) { return s.id !== sc.id; });
        saveCustomShortcuts();
        renderCustomShortcutsList();
        renderVkeyBar();
      });
    });
    list.appendChild(row);
  });
}
function renderVkeyToggleGrid() {
  const grid = qs("#vkey-toggle-grid");
  if (!grid) return;
  grid.innerHTML = "";
  const all = VKEY_MODIFIERS.map(function (m) { return { id: m, label: VKEY_MOD_LABELS[m] }; })
    .concat(Object.keys(VKEY_DEFS).map(function (id) { return { id: id, label: VKEY_DEFS[id].label }; }));
  all.forEach(function (item) {
    const shown = state.settings.vkeysShown || [];
    const chip = ce("label", "vkey-toggle-chip" + (shown.indexOf(item.id) !== -1 ? " on" : ""));
    chip.innerHTML = '<input type="checkbox" ' + (shown.indexOf(item.id) !== -1 ? "checked" : "") + ' /> <span>' + escapeHtml(item.label) + "</span>";
    chip.querySelector("input").addEventListener("change", function (e) {
      const set = new Set(state.settings.vkeysShown || []);
      if (e.target.checked) set.add(item.id); else set.delete(item.id);
      state.settings.vkeysShown = Array.from(set);
      chip.classList.toggle("on", e.target.checked);
      saveSettings();
      renderVkeyBar();
    });
    grid.appendChild(chip);
  });
}
function initVirtualKeysSettings() {
  syncSwitch("#set-vkeys-enabled", state.settings.vkeysEnabled);
  qs("#set-vkeys-enabled").addEventListener("click", function () {
    state.settings.vkeysEnabled = !state.settings.vkeysEnabled;
    syncSwitch("#set-vkeys-enabled", state.settings.vkeysEnabled);
    saveSettings();
    updateVkeyBarVisibility();
  });
  renderVkeyToggleGrid();
  renderCustomShortcutsList();
  const addBtn = qs("#btn-add-shortcut");
  if (addBtn) addBtn.addEventListener("click", function () { openAddShortcutModal(null); });
  const collapseBtn = qs("#btn-vkey-collapse");
  if (collapseBtn) collapseBtn.addEventListener("click", function () { qs("#vkey-bar").classList.toggle("collapsed"); });
  renderVkeyBar();
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
  // Monaco frequently rejects work with a benign "Canceled" error (cancellation
  // tokens). Treat those as non-fatal and avoid showing the global error toast.
  const r = e.reason;
  const msg = r && (r.message || String(r));
  if (msg === "Canceled" || (typeof r === "string" && r === "Canceled")) {
    console.debug("CodeForge: ignored canceled promise rejection", r);
    e.preventDefault();
    return;
  }
  console.error("CodeForge: unhandled promise rejection", r);
  notifyUnexpectedError(r);
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
  settings: { fontSize: 14, tabSize: 2, wordWrap: true, minimap: true, whitespace: false, theme: "vs-dark", autoSave: true, vkeysEnabled: true, vkeysShown: ["ctrl", "shift", "alt", "tab", "esc", "arrowleft", "arrowup", "arrowdown", "arrowright", "home", "end"] },
  primary: { tabs: [], active: -1, previewIndex: -1 },
  secondary: { tabs: [], active: -1, previewIndex: -1 },
};
let customShortcuts = []; // [{id, label, ctrl, shift, alt, meta, keyLabel}]
let vkeyModState = { ctrl: false, shift: false, alt: false, meta: false };
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
function updateWorkspaceTitleUI() {
  const nameEl = qs("#project-name");
  const closeBtn = qs("#btn-close-project");
  if (currentProjectId && projectName) {
    if (nameEl) nameEl.textContent = projectName;
    if (closeBtn) closeBtn.classList.remove("hidden");
    document.title = projectName + " \u2014 CodeForge";
  } else {
    if (nameEl) nameEl.textContent = "CodeForge";
    if (closeBtn) closeBtn.classList.add("hidden");
    document.title = "CodeForge";
  }
}
function renderTree() {
  updateWorkspaceTitleUI();
  updateVkeyBarVisibility();
  refreshGitChangesCache();
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
  applyGitBadgeToRow(row, node);
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

// Cut keeps a live reference (only ever pasted within the same open project/session).
// Copy snapshots the actual content up front, so it survives switching to — or pasting
// directly into — a completely different project.
let fileClipboard = null;
function isPathInsideOrEqual(candidateDir, ancestorPath) {
  return candidateDir === ancestorPath || candidateDir.indexOf(ancestorPath + "/") === 0;
}
function clipCopyPath(path) {
  const node = fs.get(path);
  if (!node) return;
  const entries = [];
  if (node.type === "file") {
    entries.push({ relPath: "", type: "file", content: node.content, isBinary: node.isBinary, dataUrl: node.dataUrl, size: node.size });
  } else {
    entries.push({ relPath: "", type: "dir" });
    const prefix = path + "/";
    fs.forEach(function (n, p) {
      if (p.indexOf(prefix) === 0) entries.push({ relPath: p.slice(prefix.length), type: n.type, content: n.content, isBinary: n.isBinary, dataUrl: n.dataUrl, size: n.size });
    });
  }
  fileClipboard = { mode: "copy", name: baseName(path), type: node.type, sourcePath: path, sourceProjectId: currentProjectId, sourceProjectName: projectName, entries: entries };
  toast("Copied \u2014 right-click a folder to paste here, or paste into another project from the Projects panel");
}
function clipCutPath(path) { fileClipboard = { mode: "cut", path: path, sourceProjectId: currentProjectId }; toast("Cut — right-click a folder to Paste (move)"); }
function clipPaste(targetDir) {
  if (!fileClipboard) { toast("Nothing to paste", "error"); return; }
  if (fileClipboard.mode === "cut") {
    if (fileClipboard.sourceProjectId !== currentProjectId) { fileClipboard = null; toast("That cut item isn't in this project anymore", "error"); return; }
    const path = fileClipboard.path;
    const node = fs.get(path);
    if (!node) { fileClipboard = null; toast("That item no longer exists", "error"); return; }
    if (node.type === "dir" && isPathInsideOrEqual(targetDir, path)) {
      toast("Can't paste a folder into itself or a subfolder of itself", "error");
      return;
    }
    const newPath = fsUniquePath(targetDir, baseName(path));
    if (newPath === path) { fileClipboard = null; return; }
    const changes = fsRename(path, newPath);
    remapOpenTabsAfterRename(changes);
    if (state.selectedPath === path) state.selectedPath = newPath;
    fileClipboard = null;
    state.expandedDirs.add(targetDir);
    renderTree();
    updateAllGitDecorationsDebounced();
    saveSessionDebounced();
    toast("Moved");
    return;
  }
  // Copy: entirely self-contained, so this works the same whether it was copied a second ago
  // in this same project or copied from a project we've since switched away from.
  if (fileClipboard.type === "dir" && fileClipboard.sourceProjectId === currentProjectId && fileClipboard.sourcePath && isPathInsideOrEqual(targetDir, fileClipboard.sourcePath)) {
    toast("Can't paste a folder into itself or a subfolder of itself", "error");
    return;
  }
  const destRoot = fsUniquePath(targetDir, fileClipboard.name);
  fileClipboard.entries.forEach(function (e) {
    const destPath = e.relPath ? joinPath(destRoot, e.relPath) : destRoot;
    if (e.type === "dir") fsSetDir(destPath);
    else fsSetFile(destPath, e.content || "", !!e.isBinary, e.dataUrl || null, e.size || 0);
  });
  const fromOtherProject = fileClipboard.sourceProjectId !== currentProjectId;
  const pastedName = fileClipboard.name, pastedFrom = fileClipboard.sourceProjectName;
  persistWholeFsToIdb().then(function () {
    state.expandedDirs.add(targetDir);
    renderTree();
    updateAllGitDecorationsDebounced();
    saveSessionDebounced();
    toast('Pasted "' + pastedName + '"' + (fromOtherProject ? ' from "' + pastedFrom + '"' : ""));
  }).catch(function (err) {
    console.error(err);
    toast("Pasted, but saving it failed" + (err && err.message ? ": " + err.message : ""), "error");
  });
}
// -- Paste into a project other than the one currently open, without switching workspaces --
function mapEnsureDirs(nodeMap, path) {
  const parts = path.split("/");
  let cur = "";
  for (let i = 0; i < parts.length - 1; i++) {
    cur = cur ? cur + "/" + parts[i] : parts[i];
    if (!nodeMap.has(cur)) nodeMap.set(cur, { path: cur, type: "dir", mtime: Date.now() });
  }
}
function mapUniquePath(nodeMap, dir, wantedName) {
  const prefix = dir ? dir + "/" : "";
  const names = new Set();
  nodeMap.forEach(function (node, p) {
    if (p === dir || p.indexOf(prefix) !== 0) return;
    const rest = p.slice(prefix.length);
    if (rest.indexOf("/") === -1) names.add(rest);
  });
  if (!names.has(wantedName)) return joinPath(dir, wantedName);
  const dotIdx = wantedName.lastIndexOf(".");
  const stem = dotIdx > 0 ? wantedName.slice(0, dotIdx) : wantedName;
  const ext = dotIdx > 0 ? wantedName.slice(dotIdx) : "";
  let n = 2;
  while (names.has(stem + " (" + n + ")" + ext)) n++;
  return joinPath(dir, stem + " (" + n + ")" + ext);
}
function pasteIntoOtherProject(targetProjectId) {
  if (!fileClipboard || fileClipboard.mode !== "copy") { toast("Copy a file or folder first, then paste it into another project", "error"); return; }
  const meta = projectsIndex.get(targetProjectId);
  if (!meta) return;
  const progress = toastProgress('Pasting into "' + meta.name + '"\u2026');
  const clip = fileClipboard;
  idbGetProjectSnapshot(targetProjectId).then(function (snap) {
    const nodeMap = new Map(((snap && snap.nodes) || []).map(function (n) { return [n.path, n]; }));
    const destRoot = mapUniquePath(nodeMap, "", clip.name);
    mapEnsureDirs(nodeMap, destRoot + "/x");
    clip.entries.forEach(function (e) {
      const destPath = e.relPath ? joinPath(destRoot, e.relPath) : destRoot;
      mapEnsureDirs(nodeMap, destPath);
      if (e.type === "dir") nodeMap.set(destPath, { path: destPath, type: "dir", mtime: Date.now() });
      else nodeMap.set(destPath, { path: destPath, type: "file", content: e.content || "", isBinary: !!e.isBinary, dataUrl: e.dataUrl || null, size: e.size || 0, mtime: Date.now() });
    });
    const merged = Array.from(nodeMap.values());
    let fileCount = 0, sizeBytes = 0;
    merged.forEach(function (n) { if (n.type === "file") { fileCount++; sizeBytes += (n.size || 0); } });
    return idbPutProjectSnapshot(targetProjectId, { nodes: merged, session: (snap && snap.session) || null }).then(function () {
      meta.fileCount = fileCount; meta.sizeBytes = sizeBytes; meta.updatedAt = Date.now();
      return idbPutProjectMeta(meta);
    });
  }).then(function () {
    renderProjectsList();
    progress.success('Pasted "' + clip.name + '" into "' + meta.name + '"');
  }).catch(function (err) {
    console.error(err);
    progress.error("Couldn't paste into that project" + (err && err.message ? ": " + err.message : ""));
  });
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
  confirmModal('Delete "' + baseName(path) + '" ' + (label === "folder" ? "and everything inside it" : "") + "? This can't be undone.", { title: "Delete " + (label === "folder" ? "Folder" : "File"), danger: true, confirmLabel: "Delete" }).then(function (ok) {
    if (!ok) return;
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
  });
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
    const gitChange = gitState.linked ? gitChangesMap[t.path] : null;
    const tab = ce("div", "tab" + (idx === ps.active ? " active" : "") + (t.pinned ? "" : " preview") + (dirtyPaths.has(t.path) ? " dirty" : "") + (gitChange ? " git-" + gitChange.status : ""));
    tab.dataset.path = t.path;
    const iconName = isImageExt(extOf(t.path)) ? "image" : "file";
    tab.title = gitChange ? gitStatusLabel(gitChange.status) : "";
    tab.innerHTML = iconSvgColored(iconName, fileColorFor(t.path), "icon-sm") + '<span class="tab-name">' + escapeHtml(baseName(t.path)) + '</span>' + (gitChange ? '<span class="tab-git-badge ' + gitChange.status + '">' + gitStatusBadgeLetter(gitChange.status) + "</span>" : "") + '<span class="tab-dot"></span><span class="tab-close">' + iconSvg("x", "icon-sm") + "</span>";
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
    initTouchEditingForEditor(editors.secondary, "secondary");
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
    setTimeout(function () { try { editors[pane].layout(); } catch (e) {} updateGutterDecorationsForPath(path); }, 30);
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
    scheduleGitDecorationUpdate(path);
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
    // Our own long-press selection + touch context menu (see initTouchEditingForEditor) replaces
    // Monaco's built-in desktop-style menu, which is fiddly to trigger accurately with a finger.
    contextmenu: !isTouchDevice(),
  };
}
function createPrimaryEditor() {
  editors.primary = monaco.editor.create(document.getElementById("monaco-host-primary"), Object.assign({ model: null }, editorOptions()));
  editors.primary.onDidChangeCursorPosition(function (e) { if (state.focusedPane === "primary") updatePositionStatus(e.position); });
  editors.primary.onDidFocusEditorText(function () { state.focusedPane = "primary"; });
  bindGlobalEditorCommands(editors.primary);
  initTouchEditingForEditor(editors.primary, "primary");
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
    { label: "Terminal: Toggle Panel", hint: "Ctrl+`", action: function () { if (window.CFTerminal) window.CFTerminal.toggle(); } },
    { label: "Terminal: New Terminal", hint: "", action: function () { if (window.CFTerminal) window.CFTerminal.newSession(); } },
    { label: "Terminal: Split Terminal", hint: "", action: function () { if (window.CFTerminal) window.CFTerminal.split(); } },
    { label: "Terminal: Restart Active Terminal", hint: "", action: function () { if (window.CFTerminal) window.CFTerminal.restartActive(); } },
    { label: "Terminal: Kill Active Terminal", hint: "", action: function () { if (window.CFTerminal) window.CFTerminal.killActive(); } },
    { label: "Terminal: Sync Project to Disk", hint: "", action: function () { if (window.CFTerminal) window.CFTerminal.syncPush(); } },
    { label: "Terminal: Pull Changes from Disk", hint: "", action: function () { if (window.CFTerminal) window.CFTerminal.syncPull(); } },
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
  confirmModal("This deletes EVERY project and all local data from this browser \u2014 not just the current one. This can't be undone. Continue?", { title: "Clear All Data", danger: true, confirmLabel: "Clear Everything" }).then(function (ok) {
    if (!ok) return;
    const progress = toastProgress("Clearing local data\u2026");
    clearAllData().then(function () {
      progress.success("Cleared. Starting fresh.");
      setTimeout(function () { location.reload(); }, 500);
    }).catch(function (err) {
      console.error(err);
      progress.error("Couldn't fully clear local data" + (err && err.message ? ": " + err.message : "") + " \u2014 reloading.");
      setTimeout(function () { location.reload(); }, 900);
    });
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
      // fsSetFile() implicitly creates any missing ancestor directory nodes in the in-memory
      // fs Map (fsEnsureDirs). Those ancestor dir nodes must be persisted too — not just the
      // leaf file — otherwise they never make it into IndexedDB and, on the next reload (or
      // an unrelated project switch), the folder has no record to hang its children off of,
      // so the whole subfolder silently disappears from the Explorer even though its files
      // are technically still stored. Bulk imports (ZIP/GitHub) never showed this because
      // they persist the *entire* fs in one shot at the end; do the same here.
      if (bin) fsSetFile(relPath, "", true, data, file.size);
      else fsSetFile(relPath, data, false, null, file.size);
    }).catch(function (e) { console.error("read failed", relPath, e); failed.push(relPath); });
  });
  return Promise.all(tasks).then(function () {
    return persistWholeFsToIdb();
  }).then(function () {
    return idbSetMeta("project", { name: projectName, createdAt: Date.now() });
  }).catch(function (e) { console.error("couldn't save project metadata", e); }).then(function () {
    if (targetDir) state.expandedDirs.add(targetDir);
    renderTree();
    updateAllGitDecorationsDebounced();
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
        // See the matching comment in importFileList(): ancestor dir nodes created here need
        // to be persisted alongside the files, so we bulk-persist the whole fs below rather
        // than idbPutNode-ing just the leaf file.
        if (bin) fsSetFile(relPath, "", true, data, ef.file.size);
        else fsSetFile(relPath, data, false, null, ef.file.size);
      }).catch(function (err) { console.error(err); failed.push(relPath); });
    });
    return Promise.all(tasks).then(function () {
      return persistWholeFsToIdb();
    }).then(function () {
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
// Adds dropped files/folders straight into the currently open project (at its root), keeping
// each dropped item's own name — the same "drop a folder in, it becomes a subfolder" behavior
// as VS Code — rather than replacing the whole workspace with a new project.
function importDroppedIntoActiveWorkspace(entryFiles) {
  showBusy("Adding to \u201c" + projectName + "\u201d\u2026");
  const failed = [];
  const tasks = entryFiles.map(function (ef) {
    const relPath = ef.path;
    const ext = extOf(relPath);
    const bin = isBinaryExt(ext);
    const reader = bin ? readAsDataURL(ef.file) : readAsText(ef.file);
    return reader.then(function (data) {
      if (bin) fsSetFile(relPath, "", true, data, ef.file.size);
      else fsSetFile(relPath, data, false, null, ef.file.size);
    }).catch(function (err) { console.error(err); failed.push(relPath); });
  });
  return Promise.all(tasks).then(function () {
    return persistWholeFsToIdb();
  }).then(function () {
    renderTree();
    updateAllGitDecorationsDebounced();
    saveSessionDebounced();
    if (failed.length) toast("Added to \u201c" + projectName + "\u201d \u2014 " + failed.length + " file(s) couldn't be read and were skipped", "error");
    else toast("Added " + entryFiles.length + " file" + (entryFiles.length === 1 ? "" : "s") + " to \u201c" + projectName + "\u201d");
  }).catch(function (err) {
    console.error(err);
    toast("Couldn't add those items" + (err && err.message ? ": " + err.message : ""), "error");
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
      if (!files.length) { toast("No readable files found in what was dropped", "error"); return; }
      // A project is already open: import into it instead of silently swapping it out for a
      // brand new one. Close Project first if you actually want to start fresh.
      if (currentProjectId) importDroppedIntoActiveWorkspace(files);
      else importFileListFromEntryFiles(files);
    }).catch(function (err) {
      console.error(err);
      toast("Couldn't read the dropped item(s)", "error");
    });
    return;
  }
  const files = Array.from(dt.files || []);
  if (files.length === 1 && /\.zip$/i.test(files[0].name)) { openZipFile(files[0]); return; }
  if (!files.length) return;
  if (currentProjectId) {
    const progress = toastProgress("Adding " + files.length + " file(s)\u2026");
    importFileList(files, { targetDir: "" }).then(function (result) {
      if (result.failed.length) progress.error("Added " + result.addedCount + " file(s) \u2014 " + result.failed.length + " couldn't be read");
      else progress.success("Added " + result.addedCount + " file(s) to \u201c" + projectName + "\u201d");
    }).catch(function (err) { console.error(err); progress.error("Couldn't add those files: " + (err && err.message ? err.message : "unknown error")); });
  } else {
    openFilesAsNewProject(files);
  }
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
function ensureBrowserPreviewEl(pane) {
  const cid = pane === "primary" ? "editor-primary" : "editor-secondary";
  const container = document.getElementById(cid);
  if (!container) return null;
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
      if (bp.dataset.rawUrl) f.src = bp.dataset.rawUrl;
      else if (bp.dataset.path) f.src = buildLiveUrl(bp.dataset.path);
    });
    bp.querySelector('[data-act="external"]').addEventListener("click", function () {
      if (bp.dataset.rawUrl) window.open(bp.dataset.rawUrl, "_blank");
      else if (bp.dataset.path) window.open(buildLiveUrl(bp.dataset.path), "_blank");
    });
    bp.querySelector('[data-act="close"]').addEventListener("click", function () { closeBrowserPreview(pane); });
  }
  return bp;
}
function showBrowserPreview(pane, path) {
  const bp = ensureBrowserPreviewEl(pane);
  if (!bp) return;
  bp.dataset.path = path;
  bp.dataset.rawUrl = "";
  bp.querySelector(".bpv-path").textContent = path;
  bp.querySelector("iframe").src = buildLiveUrl(path);
  setPaneOverlay(pane, "browser");
}
// Same preview surface as showBrowserPreview(), but pointed at an arbitrary absolute URL
// instead of a virtual project file — used by the Terminal panel to preview a real local dev
// server (Vite/Next/Express/etc.) it detected in a running command's output.
function showBrowserPreviewUrl(pane, url, label) {
  const bp = ensureBrowserPreviewEl(pane);
  if (!bp) return;
  bp.dataset.path = "";
  bp.dataset.rawUrl = url;
  bp.querySelector(".bpv-path").textContent = label || url;
  bp.querySelector("iframe").src = url;
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
    updateAllGitDecorationsDebounced();
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
  promptModal("Rename Project", meta.name, { placeholder: "Project name" }).then(function (name) {
    if (!name || name === meta.name) return;
    const previousName = meta.name;
    meta.name = name;
    meta.updatedAt = Date.now();
    idbPutProjectMeta(meta).then(function () {
      if (id === currentProjectId) {
        projectName = meta.name;
        return idbSetMeta("project", { name: projectName, createdAt: meta.createdAt }).catch(function (err) { console.error(err); }).then(function () { renderTree(); updateWorkspaceTitleUI(); });
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
  });
}
function deleteProjectWithConfirm(id) {
  const meta = projectsIndex.get(id);
  if (!meta) return;
  confirmModal('Delete project "' + meta.name + '" and all its files? This can\u2019t be undone.', { title: "Delete Project", danger: true, confirmLabel: "Delete" }).then(function (ok) {
    if (!ok) return;
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
          updateWorkspaceTitleUI();
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
  });
}
// Cleanly closes the active workspace and returns to the Welcome screen without touching the
// project's saved data — it stays in the Projects list ready to be reopened. This is the
// supported way to get a genuinely blank slate (e.g. before uploading a folder that should
// become its own new project) without restarting the app.
function closeActiveProject() {
  showBusy("Closing project\u2026");
  return saveActiveProjectSnapshotIfAny().then(function () {
    resetActiveWorkspaceInMemory();
    currentProjectId = null;
    projectName = "";
    return Promise.all([idbClearNodes(), idbSetMeta("project", null), idbSetMeta("currentProjectId", null), idbSetMeta("session", null)]);
  }).then(function () {
    renderTree();
    setPaneOverlay("primary", "welcome");
    switchSidebarView("explorer");
    renderProjectsList();
    renderGitPanel();
    updateWorkspaceTitleUI();
    toast("Project closed");
  }).catch(function (err) {
    console.error(err);
    toast("Couldn't close the project cleanly" + (err && err.message ? ": " + err.message : ""), "error");
  }).finally(hideBusy);
}
function closeActiveProjectWithConfirm() {
  if (!currentProjectId) { toast("No project is currently open"); return Promise.resolve(); }
  if (dirtyPaths.size > 0) {
    return confirmModal(
      "You have " + dirtyPaths.size + " unsaved change" + (dirtyPaths.size === 1 ? "" : "s") + " in \u201c" + projectName + "\u201d. They'll be auto-saved to this project before closing, and will be here when you reopen it. Close now?",
      { title: "Close Project", confirmLabel: "Close Project" }
    ).then(function (ok) { if (ok) return closeActiveProject(); });
  }
  return closeActiveProject();
}
function openNewProjectModal() {
  return promptModal("New Project", "", { placeholder: "Project name", hint: "Starts an empty project you can add files to." }).then(function (name) {
    if (name === null) return;
    const finalName = uniqueProjectName(name || "Untitled Project");
    return startNewProject(finalName).then(function () {
      switchSidebarView("explorer");
      renderProjectsList();
      toast('Created "' + finalName + '"');
    });
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
    const canPasteHere = !isCurrent && fileClipboard && fileClipboard.mode === "copy";
    const row = ce("div", "project-row" + (isCurrent ? " current" : ""));
    row.innerHTML =
      '<div class="proj-row-main">' +
      '<div class="proj-row-name">' + escapeHtml(p.name) + (isCurrent ? ' <span class="proj-badge">current</span>' : "") + "</div>" +
      '<div class="proj-row-meta">' + (p.fileCount || 0) + " files \u00b7 " + formatBytes(p.sizeBytes || 0) + " \u00b7 " + relativeTime(p.updatedAt || p.createdAt) + "</div>" +
      "</div>" +
      '<div class="proj-row-actions">' +
      (canPasteHere ? '<button class="proj-btn" data-act="paste" title="Paste \u201c' + escapeHtml(fileClipboard.name) + '\u201d here">' + iconSvg("clipboard", "icon-sm") + "</button>" : "") +
      (isCurrent ? "" : '<button class="proj-btn" data-act="open" title="Open">' + iconSvg("folder-open", "icon-sm") + "</button>") +
      '<button class="proj-btn" data-act="rename" title="Rename">' + iconSvg("edit", "icon-sm") + "</button>" +
      '<button class="proj-btn" data-act="delete" title="Delete">' + iconSvg("trash", "icon-sm") + "</button>" +
      "</div>";
    const openBtn = row.querySelector('[data-act="open"]');
    if (openBtn) openBtn.addEventListener("click", function () { switchToProject(p.id); });
    const pasteBtn = row.querySelector('[data-act="paste"]');
    if (pasteBtn) pasteBtn.addEventListener("click", function (e) { e.stopPropagation(); pasteIntoOtherProject(p.id); });
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
      updateAllGitDecorations();
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
    updateAllGitDecorations();
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
  updateAllGitDecorations();
  toast("Unlinked from GitHub");
}
function computeGitChanges() {
  const baseline = (gitState.linked && gitState.linked.baseline) || {};
  const added = [], deleted = [], modified = [];
  const seen = {};
  fs.forEach(function (node, path) {
    if (node.type !== "file") return;
    seen[path] = true;
    const base = baseline[path];
    if (!base) { added.push(path); return; }
    if (node.isBinary || base.isBinary) {
      if ((node.dataUrl || "") !== (base.dataUrl || "")) modified.push(path);
      return;
    }
    if ((node.content || "") !== (base.content || "")) modified.push(path);
  });
  Object.keys(baseline).forEach(function (path) { if (!seen[path]) deleted.push(path); });

  // Rename heuristic: an added file and a deleted file with byte-for-byte identical content are
  // almost certainly the same file that moved/got renamed rather than two unrelated changes.
  const changes = [];
  const contentKey = function (path, fromAdded) {
    const node = fromAdded ? fs.get(path) : null;
    const base = fromAdded ? null : baseline[path];
    if (fromAdded) return node.isBinary ? "b:" + (node.dataUrl || "") : "t:" + (node.content || "");
    return base.isBinary ? "b:" + (base.dataUrl || "") : "t:" + (base.content || "");
  };
  const deletedByContent = {};
  deleted.forEach(function (p) { deletedByContent[contentKey(p, false)] = deletedByContent[contentKey(p, false)] || []; deletedByContent[contentKey(p, false)].push(p); });
  const consumedDeleted = {};
  added.forEach(function (p) {
    const key = contentKey(p, true);
    const candidates = deletedByContent[key];
    const match = candidates && candidates.find(function (d) { return !consumedDeleted[d]; });
    if (match) { consumedDeleted[match] = true; changes.push({ path: p, oldPath: match, status: "renamed" }); }
    else changes.push({ path: p, status: "added" });
  });
  deleted.forEach(function (p) { if (!consumedDeleted[p]) changes.push({ path: p, status: "deleted" }); });
  modified.forEach(function (p) { changes.push({ path: p, status: "modified" }); });

  changes.sort(function (a, b) { return a.path.localeCompare(b.path); });
  return changes;
}
function gitStatusBadgeLetter(status) {
  return status === "added" ? "A" : status === "deleted" ? "D" : status === "renamed" ? "R" : "M";
}
function gitStatusLabel(status) {
  return status === "added" ? "Added (untracked)" : status === "deleted" ? "Deleted" : status === "renamed" ? "Renamed" : "Modified";
}
// path -> {status, oldPath?} for O(1) lookup while rendering the tree/tabs/gutters.
// Live cache so the Explorer, tabs, and editor gutters can all look changes up in O(1) instead
// of recomputing the whole diff on every row/keystroke. Kept in sync by refreshGitChangesCache(),
// called after every edit (debounced) and after any link/unlink/resync/commit/discard.
let gitChangesMap = {};   // path -> {path, status, oldPath?}
let gitDirAggregate = {}; // dir path -> dominant status of something changed inside it
const GIT_STATUS_PRIORITY = { modified: 3, added: 2, deleted: 2, renamed: 1 };
function refreshGitChangesCache() {
  gitChangesMap = {};
  gitDirAggregate = {};
  if (!gitState.linked) return;
  computeGitChanges().forEach(function (c) {
    gitChangesMap[c.path] = c;
    let dir = dirName(c.path);
    while (dir) {
      const cur = gitDirAggregate[dir];
      if (!cur || GIT_STATUS_PRIORITY[c.status] > GIT_STATUS_PRIORITY[cur]) gitDirAggregate[dir] = c.status;
      dir = dirName(dir);
    }
  });
}
// Updates existing Explorer DOM rows in place (badges only) — cheap, no re-render/flicker.
function updateExplorerGitBadges() {
  qsa(".tree-row", qs("#file-tree")).forEach(function (row) {
    const node = fs.get(row.dataset.path);
    if (node) applyGitBadgeToRow(row, node);
  });
}
function applyGitBadgeToRow(row, node) {
  let badgeEl = row.querySelector(".row-git-badge");
  if (!badgeEl) { badgeEl = ce("span", "row-git-badge"); row.appendChild(badgeEl); }
  const isDir = node.type === "dir";
  const status = isDir ? gitDirAggregate[node.path] : (gitChangesMap[node.path] && gitChangesMap[node.path].status);
  if (!status) { badgeEl.className = "row-git-badge"; badgeEl.textContent = ""; badgeEl.title = ""; return; }
  badgeEl.className = "row-git-badge " + status + (isDir ? " dot" : "");
  badgeEl.textContent = isDir ? "" : gitStatusBadgeLetter(status);
  badgeEl.title = gitStatusLabel(status) + (gitChangesMap[node.path] && gitChangesMap[node.path].oldPath ? " (was " + gitChangesMap[node.path].oldPath + ")" : "");
}
// Called (debounced) on every keystroke in a linked project, and immediately after link/unlink/
// resync/commit/discard, to keep Source Control, the Explorer badges, and the editor gutters all
// showing the same picture in real time — the same way VS Code's built-in Git integration does.
function refreshGitChangesCacheAndUI() {
  refreshGitChangesCache();
  updateExplorerGitBadges();
  if (state.sidebarView === "git" && currentProjectId) {
    const msgBox = qs("#git-commit-msg");
    const savedMsg = msgBox ? msgBox.value : null;
    const hadFocus = msgBox === document.activeElement;
    renderGitPanel();
    if (savedMsg) {
      const nb = qs("#git-commit-msg");
      if (nb) { nb.value = savedMsg; if (hadFocus) nb.focus(); }
    }
  }
  renderTabs("primary"); renderTabs("secondary");
}
const gitDecoDebounce = new Map();
function scheduleGitDecorationUpdate(path) {
  if (!gitState.linked) return;
  if (gitDecoDebounce.has(path)) clearTimeout(gitDecoDebounce.get(path));
  gitDecoDebounce.set(path, setTimeout(function () {
    gitDecoDebounce.delete(path);
    refreshGitChangesCacheAndUI();
    updateGutterDecorationsForPath(path);
  }, 300));
}
// Recomputes everything at once — used after link/unlink/resync/commit, where every file's
// status can change simultaneously.
function updateAllGitDecorations() {
  refreshGitChangesCacheAndUI();
  ["primary", "secondary"].forEach(function (pane) {
    const ps = state[pane];
    if (ps.active !== -1 && ps.tabs[ps.active]) updateGutterDecorationsForPath(ps.tabs[ps.active].path);
  });
}
let updateAllGitDecorationsTimer = null;
function updateAllGitDecorationsDebounced() {
  if (updateAllGitDecorationsTimer) clearTimeout(updateAllGitDecorationsTimer);
  updateAllGitDecorationsTimer = setTimeout(updateAllGitDecorations, 250);
}

/* ---- Editor gutter "modified line" indicators (VS Code-style git decorations) ----
   A small, self-contained Myers (1986) O(ND) line diff. We trim any common prefix/suffix first
   (nearly all real edits shrink to a tiny window this way — normal typing never even reaches
   the O(ND) step below), then run Myers only on what's left, capped so a single huge paste never
   costs more than a few milliseconds; beyond the cap we just show the whole changed region as
   one "modified" block rather than compute a precise hunk breakdown. */
function myersLineDiff(a, b) {
  const N = a.length, M = b.length;
  const MAX = N + M || 1;
  const V = new Array(2 * MAX + 1).fill(0);
  const trace = [];
  let dFound = MAX;
  search:
  for (let d = 0; d <= MAX; d++) {
    trace.push(V.slice());
    for (let k = -d; k <= d; k += 2) {
      let x;
      if (k === -d || (k !== d && V[MAX + k - 1] < V[MAX + k + 1])) x = V[MAX + k + 1];
      else x = V[MAX + k - 1] + 1;
      let y = x - k;
      while (x < N && y < M && a[x] === b[y]) { x++; y++; }
      V[MAX + k] = x;
      if (x >= N && y >= M) { dFound = d; break search; }
    }
  }
  const ops = [];
  let x = N, y = M;
  for (let d = dFound; d >= 1; d--) {
    const Vd = trace[d];
    const k = x - y;
    const prevK = (k === -d || (k !== d && Vd[MAX + k - 1] < Vd[MAX + k + 1])) ? k + 1 : k - 1;
    const prevX = Vd[MAX + prevK];
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) { ops.push({ type: "equal" }); x--; y--; }
    if (x === prevX) { ops.push({ type: "insert" }); y--; } else { ops.push({ type: "delete" }); x--; }
    x = prevX; y = prevY;
  }
  while (x > 0 && y > 0) { ops.push({ type: "equal" }); x--; y--; }
  while (x > 0) { ops.push({ type: "delete" }); x--; }
  while (y > 0) { ops.push({ type: "insert" }); y--; }
  ops.reverse();
  return ops;
}
// Returns hunks relative to the NEW file: {type:'add'|'del'|'mod', newStart(0-based), newCount}.
function diffLines(oldLines, newLines) {
  let start = 0;
  const maxStart = Math.min(oldLines.length, newLines.length);
  while (start < maxStart && oldLines[start] === newLines[start]) start++;
  let oldEnd = oldLines.length, newEnd = newLines.length;
  while (oldEnd > start && newEnd > start && oldLines[oldEnd - 1] === newLines[newEnd - 1]) { oldEnd--; newEnd--; }
  const oldMid = oldLines.slice(start, oldEnd);
  const newMid = newLines.slice(start, newEnd);
  const hunks = [];
  if (!oldMid.length && !newMid.length) return hunks;
  if (!oldMid.length) { hunks.push({ type: "add", newStart: start, newCount: newMid.length }); return hunks; }
  if (!newMid.length) { hunks.push({ type: "del", newStart: start, newCount: 0 }); return hunks; }
  if (oldMid.length + newMid.length > 1500) { hunks.push({ type: "mod", newStart: start, newCount: newMid.length }); return hunks; }
  const ops = myersLineDiff(oldMid, newMid);
  let ni = 0, i = 0;
  while (i < ops.length) {
    if (ops[i].type === "equal") { ni++; i++; continue; }
    let hasIns = false, hasDel = false, insCount = 0;
    let j = i;
    while (j < ops.length && ops[j].type !== "equal") {
      if (ops[j].type === "insert") { hasIns = true; insCount++; } else hasDel = true;
      j++;
    }
    if (hasIns && hasDel) hunks.push({ type: "mod", newStart: start + ni, newCount: insCount });
    else if (hasIns) hunks.push({ type: "add", newStart: start + ni, newCount: insCount });
    else hunks.push({ type: "del", newStart: start + ni, newCount: 0 });
    ni += insCount;
    i = j;
  }
  return hunks;
}
function computeGitLineDecorations(path, model) {
  if (!gitState.linked) return [];
  const base = gitState.linked.baseline[path];
  const node = fs.get(path);
  if (!node || node.isBinary) return [];
  if (!base) {
    const lineCount = model.getLineCount();
    return [{ range: new monaco.Range(1, 1, lineCount, 1), options: { isWholeLine: true, linesDecorationsClassName: "git-gutter-added", overviewRuler: { color: "#2ea44344", position: monaco.editor.OverviewRulerLane.Left } } }];
  }
  if (base.isBinary) return [];
  const oldLines = (base.content || "").split("\n");
  const newLines = model.getValue().split("\n");
  if (oldLines.length + newLines.length > 40000) return []; // absurdly large file — skip, not worth it
  const hunks = diffLines(oldLines, newLines);
  const decos = [];
  hunks.forEach(function (h) {
    if (h.type === "add" || h.type === "mod") {
      const cls = h.type === "add" ? "git-gutter-added" : "git-gutter-modified";
      const color = h.type === "add" ? "#2ea44344" : "#e2c08d44";
      decos.push({ range: new monaco.Range(h.newStart + 1, 1, h.newStart + Math.max(1, h.newCount), 1), options: { isWholeLine: true, linesDecorationsClassName: cls, overviewRuler: { color: color, position: monaco.editor.OverviewRulerLane.Left } } });
    } else {
      // pure deletion — nothing survives on the new side to span, so mark a thin indicator on
      // the line it now sits above (or line 1 if the deletion was right at the top of the file).
      const line = Math.max(1, h.newStart);
      const cls = h.newStart === 0 ? "git-gutter-deleted-top" : "git-gutter-deleted";
      decos.push({ range: new monaco.Range(line, 1, line, 1), options: { isWholeLine: true, linesDecorationsClassName: cls, overviewRuler: { color: "#f8514944", position: monaco.editor.OverviewRulerLane.Left } } });
    }
  });
  return decos;
}
function updateGutterDecorationsForPath(path) {
  const entry = models.get(path);
  if (!entry) return;
  entry.decoIds = entry.decoIds || {};
  const decos = computeGitLineDecorations(path, entry.model);
  ["primary", "secondary"].forEach(function (pane) {
    const ed = editors[pane];
    if (!ed || ed.getModel() !== entry.model) { entry.decoIds[pane] = entry.decoIds[pane] || []; return; }
    entry.decoIds[pane] = ed.deltaDecorations(entry.decoIds[pane] || [], decos);
  });
}
function clearGutterDecorationsForPath(path) {
  const entry = models.get(path);
  if (!entry || !entry.decoIds) return;
  ["primary", "secondary"].forEach(function (pane) {
    const ed = editors[pane];
    if (ed && entry.decoIds[pane] && entry.decoIds[pane].length) ed.deltaDecorations(entry.decoIds[pane], []);
  });
  entry.decoIds = {};
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
      '<button class="git-btn wide" id="btn-open-git-import">' + iconSvg("cloud-upload", "icon-sm") + " Import a Repository\u2026</button>" +
      '<div class="empty-hint" style="padding-left:0;">Open or start a project to link it and push changes.</div>';
    wireGitTokenAndImport(body);
    const openImp = qs("#btn-open-git-import"); if (openImp) openImp.addEventListener("click", openGitImportModal);
    return;
  }

  if (!gitState.linked) {
    body.innerHTML = tokenRow +
      '<div class="settings-divider"></div>' +
      '<button class="git-btn wide" id="btn-open-git-import">' + iconSvg("cloud-upload", "icon-sm") + " Import a Repository\u2026</button>" +
      '<div class="settings-divider"></div>' +
      '<div class="git-section-label">Link "' + escapeHtml(projectName) + '" to GitHub</div>' +
      '<div class="setting-desc" style="margin-bottom:8px;">Connects this project to an existing GitHub repo so you can commit &amp; push. This compares against the repo\u2019s current content \u2014 pushing will make GitHub match what\u2019s here.</div>' +
      '<button class="git-btn secondary wide" id="btn-open-git-link">' + iconSvg("git-branch", "icon-sm") + " Link to a Repository\u2026</button>";
    wireGitTokenAndImport(body);
    const openImp = qs("#btn-open-git-import"); if (openImp) openImp.addEventListener("click", openGitImportModal);
    const openLink = qs("#btn-open-git-link"); if (openLink) openLink.addEventListener("click", openGitLinkModal);
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
      const badge = gitStatusBadgeLetter(c.status);
      html += '<div class="git-changed-file' + (gitState.selectedDiffPath === c.path ? " selected" : "") + '" data-path="' + escapeHtml(c.path) + '" data-status="' + c.status + '">' +
        '<span class="git-status-badge ' + badge + '" title="' + gitStatusLabel(c.status) + '">' + badge + "</span>" +
        '<span class="git-file-path">' + escapeHtml(c.status === "renamed" ? c.oldPath + " \u2192 " + c.path : c.path) + "</span>" +
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
  if (unlinkBtn) unlinkBtn.addEventListener("click", function () {
    confirmModal("Unlink this project from GitHub? Your files won't be touched \u2014 only the connection (and its change tracking) goes away.", { title: "Unlink Repository", confirmLabel: "Unlink" }).then(function (ok) { if (ok) unlinkCurrentProject(); });
  });

  qsa(".git-changed-file", body).forEach(function (row) {
    row.addEventListener("click", function (e) {
      if (e.target.closest('[data-act="discard"]')) {
        const path = row.dataset.path;
        const status = row.dataset.status;
        const base = link.baseline[path];
        if (status === "deleted") { toast("Restore isn't supported yet \u2014 re-add the file manually", "error"); return; }
        if (status === "added" || status === "renamed") { deleteEntryWithConfirm(path); return; }
        if (base) {
          if (base.isBinary) { toast("Can't discard a binary file change automatically \u2014 replace it manually", "error"); return; }
          try {
            const entry = getOrCreateModel(path, fs.get(path));
            entry.model.setValue(base.content || "");
            persistNow(path);
            updateAllGitDecorations();
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
        updateAllGitDecorations();
      }).catch(function (err) {
        console.error(err);
        toast((err && err.message) ? err.message : "Push failed", "error");
        restoreBtn();
      });
    });
  }
  initSimpleListKeyNav(qs("#git-diff-list"), ".git-changed-file", "kbd-sel", function (row) { row.click(); });
}
// Accepts a GitHub web URL (https://github.com/owner/repo, .../tree/branch, a bare
// "github.com/owner/repo", or the git@github.com:owner/repo.git SSH form) and pulls out
// owner/repo/branch — so cloning by URL is just "paste it and go" instead of splitting it into
// three fields by hand.
function parseGitHubUrl(raw) {
  const s = (raw || "").trim();
  if (!s) return null;
  const ssh = /^git@github\.com:([^/]+)\/([^/]+?)(\.git)?\/?$/i.exec(s);
  if (ssh) return { owner: ssh[1], repo: ssh[2], branch: null };
  let urlStr = s;
  if (!/^[a-z]+:\/\//i.test(urlStr)) urlStr = "https://" + urlStr.replace(/^\/+/, "");
  let u;
  try { u = new URL(urlStr); } catch (e) { return null; }
  if (!/(^|\.)github\.com$/i.test(u.hostname)) return null;
  const parts = u.pathname.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/i, "");
  let branch = null;
  if ((parts[2] === "tree" || parts[2] === "blob") && parts[3]) branch = decodeURIComponent(parts[3].split("?")[0]);
  return { owner: owner, repo: repo, branch: branch };
}
function wireRepoUrlField(scope) {
  const urlInput = qs("#repo-url-input", scope);
  if (!urlInput) return;
  urlInput.addEventListener("input", function () {
    const parsed = parseGitHubUrl(urlInput.value);
    urlInput.classList.toggle("field-error", !!urlInput.value.trim() && !parsed);
    if (!parsed) return;
    const ownerEl = qs('[data-role="owner"]', scope), repoEl = qs('[data-role="repo"]', scope), branchEl = qs('[data-role="branch"]', scope);
    if (ownerEl) ownerEl.value = parsed.owner;
    if (repoEl) repoEl.value = parsed.repo;
    if (branchEl && parsed.branch) branchEl.value = parsed.branch;
  });
}
function gitImportFormHtml() {
  return '<div class="modal-field"><label>Repository URL</label><input id="repo-url-input" placeholder="https://github.com/owner/repo" autocomplete="off" /></div>' +
    '<div class="modal-or-divider"><span>or enter separately</span></div>' +
    '<div class="modal-field"><label>Owner / organization</label><input id="git-import-owner" data-role="owner" placeholder="e.g. microsoft" autocomplete="off" /></div>' +
    '<div class="modal-field"><label>Repository</label><input id="git-import-repo" data-role="repo" placeholder="e.g. vscode" autocomplete="off" /></div>' +
    '<div class="modal-field"><label>Branch</label><input id="git-import-branch" data-role="branch" placeholder="main" autocomplete="off" /></div>' +
    '<p class="modal-hint">Pulls that branch\u2019s current files into a brand new project via the GitHub API \u2014 there\u2019s no git history, just the file snapshot.</p>';
}
function gitLinkFormHtml() {
  return '<div class="modal-field"><label>Repository URL</label><input id="repo-url-input" placeholder="https://github.com/owner/repo" autocomplete="off" /></div>' +
    '<div class="modal-or-divider"><span>or enter separately</span></div>' +
    '<div class="modal-field"><label>Owner / organization</label><input id="git-link-owner" data-role="owner" placeholder="e.g. octocat" autocomplete="off" /></div>' +
    '<div class="modal-field"><label>Repository</label><input id="git-link-repo" data-role="repo" placeholder="repository name" autocomplete="off" /></div>' +
    '<div class="modal-field"><label>Branch</label><input id="git-link-branch" data-role="branch" placeholder="main" autocomplete="off" /></div>' +
    '<p class="modal-hint">Sets "' + escapeHtml(projectName || "this project") + '" as tracking that branch, so Source Control can show what\u2019s changed and push commits to it.</p>';
}
function openGitImportModal() {
  openModal({
    title: "Import a Repository",
    bodyHtml: gitImportFormHtml(),
    initialFocus: "#repo-url-input",
    build: function (body) { wireRepoUrlField(body); },
    actions: [
      { label: "Cancel", value: null },
      {
        label: "Import as New Project", value: "import", variant: "primary",
        onClick: function (b) {
          const owner = (b.querySelector("#git-import-owner").value || "").trim();
          const repo = (b.querySelector("#git-import-repo").value || "").trim();
          if (!owner || !repo) { toast("Enter a repository URL, or an owner and repository", "error"); return false; }
          const branch = (b.querySelector("#git-import-branch").value || "").trim() || "main";
          importFromGitHub(owner, repo, branch);
        },
      },
    ],
  });
}
function openGitLinkModal() {
  if (!currentProjectId) { toast("Open or start a project first", "error"); return; }
  openModal({
    title: "Link to a Repository",
    bodyHtml: gitLinkFormHtml(),
    initialFocus: "#repo-url-input",
    build: function (body) { wireRepoUrlField(body); },
    actions: [
      { label: "Cancel", value: null },
      {
        label: "Link Project", value: "link", variant: "primary",
        onClick: function (b) {
          const owner = (b.querySelector("#git-link-owner").value || "").trim();
          const repo = (b.querySelector("#git-link-repo").value || "").trim();
          if (!owner || !repo) { toast("Enter a repository URL, or an owner and repository", "error"); return false; }
          const branch = (b.querySelector("#git-link-branch").value || "").trim() || "main";
          linkCurrentProjectToGitHub(owner, repo, branch);
        },
      },
    ],
  });
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
  updateVkeyBarVisibility();
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
      else if (nav === "terminal") { if (window.CFTerminal) window.CFTerminal.toggle(); }
      else onNavSidebarTap(nav);
    });
  });
  qs("#btn-menu-mobile").addEventListener("click", toggleMobileSidebar);
  qs("#sidebar-backdrop").addEventListener("click", closeMobileSidebar);
  qs("#btn-split-toggle").addEventListener("click", function () { activateSplit(!state.splitActive); });
  qs("#btn-close-split").addEventListener("click", function () { if (state.isMobile) setMobileSplitOpen(false); else activateSplit(false); });
  qs("#btn-command-palette-tb").addEventListener("click", openCommandPalette);
  qs("#btn-terminal-toggle").addEventListener("click", function () { if (window.CFTerminal) window.CFTerminal.toggle(); });

  qs("#project-root-row").addEventListener("click", function () {
    rootExpanded = !rootExpanded;
    qs("#root-chev").classList.toggle("open", rootExpanded);
    qs("#file-tree").style.display = rootExpanded ? "" : "none";
  });
  qs("#project-root-row").addEventListener("contextmenu", function (e) { e.preventDefault(); if (fs.size) openContextMenuForRoot(e.clientX, e.clientY); });
  attachLongPress(qs("#project-root-row"), function (x, y) { if (fs.size) openContextMenuForRoot(x, y); });

  // undefined = no explicit target chosen -> use contextual behavior (see below); a string
  // (possibly "") means an explicit "Upload Here" from a folder/root context menu.
  let pendingUploadTargetDir;
  qs("#btn-new-file").addEventListener("click", function () { beginCreateEntry("", "file"); });
  qs("#btn-new-folder").addEventListener("click", function () { beginCreateEntry("", "dir"); });
  // qs("#btn-open-zip").addEventListener("click", function () { qs("#file-input-zip").click(); });
  // qs("#btn-export-zip").addEventListener("click", exportProjectZip);
  qs("#btn-refresh-tree").addEventListener("click", function () { renderTree(); });
  qs("#btn-collapse-folders").addEventListener("click", collapseAllExplorerFolders);

  qs("#btn-proj-upload-files").addEventListener("click", function () { pendingUploadTargetDir = undefined; qs("#file-input-files").click(); });
  qs("#btn-proj-upload-folder").addEventListener("click", function () { pendingUploadTargetDir = undefined; qs("#file-input-folder").click(); });
  qs("#btn-proj-open-zip").addEventListener("click", function () { qs("#file-input-zip").click(); });
  qs("#btn-git-refresh").addEventListener("click", function () { renderGitPanel(); toast("Refreshed"); });
  const btnNewProject = qs("#btn-proj-new");
  if (btnNewProject) btnNewProject.addEventListener("click", openNewProjectModal);
  const btnCloseProject = qs("#btn-close-project");
  if (btnCloseProject) btnCloseProject.addEventListener("click", closeActiveProjectWithConfirm);

  // Uploading a file or folder while a project is already open adds it straight into that
  // active workspace; there's no active project (or an explicit "Upload Here" target was
  // chosen from a context menu), it behaves as before and opens as a new project. Use
  // "Close Project" first if you want a totally clean slate for the next upload.
  qs("#file-input-files").addEventListener("change", function (e) {
    const files = e.target.files;
    const targetDir = pendingUploadTargetDir;
    pendingUploadTargetDir = undefined;
    if (files.length) {
      if (targetDir !== undefined || currentProjectId) {
        const dir = targetDir !== undefined ? targetDir : "";
        const progress = toastProgress("Adding " + files.length + " file(s)\u2026");
        importFileList(files, { targetDir: dir }).then(function (result) {
          if (result.failed.length) progress.error("Added " + result.addedCount + " file(s) \u2014 " + result.failed.length + " couldn't be read");
          else progress.success("Added " + result.addedCount + " file(s)" + (dir ? "" : " to \u201c" + projectName + "\u201d"));
        }).catch(function (err) { console.error(err); progress.error("Couldn't add those files: " + (err && err.message ? err.message : "unknown error")); });
      }
      else openFilesAsNewProject(files);
    }
    e.target.value = "";
  });
  qs("#file-input-folder").addEventListener("change", function (e) {
    const files = e.target.files;
    const targetDir = pendingUploadTargetDir;
    pendingUploadTargetDir = undefined;
    if (files.length) {
      if (targetDir !== undefined || currentProjectId) {
        const dir = targetDir !== undefined ? targetDir : "";
        const progress = toastProgress("Adding folder\u2026");
        importFileList(files, { targetDir: dir }).then(function (result) {
          if (result.failed.length) progress.error("Folder added \u2014 " + result.failed.length + " file(s) couldn't be read");
          else progress.success("Folder added" + (dir ? "" : " to \u201c" + projectName + "\u201d"));
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

  qsa(".welcome-action, .welcome-card, .wps-viewall").forEach(function (el) {
    el.addEventListener("click", function () {
      const cmd = el.dataset.cmd;
      if (cmd === "new-file") beginCreateEntry("", "file");
      else if (cmd === "new-folder") beginCreateEntry("", "dir");
      else if (cmd === "new-project") openNewProjectModal();
      else if (cmd === "upload-files") { pendingUploadTargetDir = undefined; qs("#file-input-files").click(); }
      else if (cmd === "upload-folder") { pendingUploadTargetDir = undefined; qs("#file-input-folder").click(); }
      else if (cmd === "open-zip") qs("#file-input-zip").click();
      else if (cmd === "import-github") openGitImportModal();
      else if (cmd === "view-projects") { switchSidebarView("projects"); if (state.isMobile) openMobileSidebar(); }
    });
    if (el.classList.contains("welcome-card")) {
      el.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); el.click(); } });
    }
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
    else if (e.key === "`") { e.preventDefault(); if (window.CFTerminal) { if (e.shiftKey) window.CFTerminal.newSession(); else window.CFTerminal.toggle(); } }
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
  initVirtualKeysSettings();
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
    return Promise.all([idbGetAllNodes(), idbGetMeta("project"), idbGetMeta("session"), idbGetMeta("settings"), idbListProjects(), idbGetMeta("currentProjectId"), idbGetMeta("customShortcuts")]);
  }).then(function (results) {
    const nodes = results[0], meta = results[1], settings = results[3], projects = results[4], savedCurrentId = results[5];
    session = results[2];
    customShortcuts = Array.isArray(results[6]) ? results[6] : [];
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

/* ============================== TERMINAL BRIDGE ==============================
   public/terminal.js is a separate, optional module (the Terminal panel + xterm.js wiring).
   It never reaches into this file's internals directly — this small, explicit object is the
   entire surface it's allowed to use: reading/writing the current project's virtual
   filesystem, reusing existing UI primitives (toasts, modals, the browser-preview pane), and
   knowing which project is currently open. Keeping it here (rather than scattering `window.`
   assignments throughout the file) means this bridge is easy to audit and easy to keep in sync
   as the app evolves. */
window.__cfBridge = {
  getCurrentProject: function () { return currentProjectId ? { id: currentProjectId, name: projectName } : null; },
  isMobile: function () { return state.isMobile; },
  getFocusedPane: function () { return state.focusedPane || "primary"; },

  listFiles: function () {
    const out = [];
    fs.forEach(function (node) {
      out.push({ path: node.path, type: node.type, content: node.content || "", isBinary: !!node.isBinary, dataUrl: node.dataUrl || "" });
    });
    return out;
  },
  getFile: function (path) {
    const n = fs.get(path);
    if (!n) return null;
    return { path: n.path, type: n.type, content: n.content || "", isBinary: !!n.isBinary, dataUrl: n.dataUrl || "" };
  },
  exists: function (path) { return fs.has(path); },
  isDirty: function (path) { return dirtyPaths.has(path); },
  writeFile: function (path, content) {
    fsEnsureDirs(dirName(path));
    fsSetFile(path, content, false, "", content.length);
    idbPutNode(fs.get(path));
    if (models.has(path) && !dirtyPaths.has(path)) {
      const m = models.get(path);
      m.model.setValue(content);
      m.savedValue = content;
    }
    renderTree();
  },
  mkdir: function (path) { fsEnsureDirs(path); fsSetDir(path); idbPutNode(fs.get(path)); renderTree(); },
  deletePath: function (path) { fsDeletePath(path); renderTree(); },
  renamePath: function (oldPath, newPath) { const changed = fsRename(oldPath, newPath); renderTree(); return changed; },
  writeBinaryFile: function (path, dataUrl, approxSize) {
    fsEnsureDirs(dirName(path));
    fsSetFile(path, "", true, dataUrl, approxSize || 0);
    idbPutNode(fs.get(path));
    renderTree();
  },
  refreshTree: function () { renderTree(); },

  getGitChanges: function () { return currentProjectId ? computeGitChanges() : []; },
  isGitLinked: function () { return !!(gitState && gitState.linked); },

  toast: function (msg, kind) { toast(msg, kind); },
  openModal: function (opts) { return openModal(opts); },
  confirmModal: function (message, opts) { return confirmModal(message, opts); },
  showBusy: function (label) { showBusy(label); },
  hideBusy: function () { hideBusy(); },
  escapeHtml: function (s) { return escapeHtml(s); },
  formatBytes: function (n) { return formatBytes(n); },
  iconSvg: function (name, extraClass) { return iconSvg(name, extraClass); },

  showPreviewUrl: function (url, label) {
    // Target "primary" unless a split view is genuinely visible right now — otherwise a stale
    // state.focusedPane (from whatever was last focused before the Terminal panel took focus)
    // could silently open the preview in a pane the person can't currently see.
    const splitVisible = state.splitActive || (state.isMobile && state.mobileSplitOpen);
    const pane = splitVisible ? (state.focusedPane || "primary") : "primary";
    showBrowserPreviewUrl(pane, url, label);
  },
};

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
