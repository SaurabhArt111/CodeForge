// Small shared helpers (no dependencies).
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Hyperscript: h('div.card#id', {onclick, style:{}, dataset:{}}, child, 'text', ...) */
export function h(tag, props, ...kids) {
  const m = /^([a-zA-Z0-9-]*)((?:[.#][\w-]+)*)$/.exec(tag) || [];
  const el = document.createElement(m[1] || "div");
  (m[2] || "").replace(/([.#])([\w-]+)/g, (_, k, v) => { if (k === "#") el.id = v; else el.classList.add(v); });
  if (props && typeof props === "object" && !(props instanceof Node) && !Array.isArray(props)) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else if (k === "dataset") Object.assign(el.dataset, v);
      else if (k === "class") el.className += " " + v;
      else if (k === "html") el.innerHTML = v;
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k in el && k !== "list" && k !== "type") { try { el[k] = v; } catch { el.setAttribute(k, v); } }
      else el.setAttribute(k, v === true ? "" : v);
    }
  } else if (props != null) kids.unshift(props);
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return el;
}

export const icon = (name, cls = "") => h(`i.codicon.codicon-${name}${cls ? "." + cls.split(" ").join(".") : ""}`);
export const iconHtml = (name) => `<i class="codicon codicon-${name}"></i>`;

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---- paths (POSIX, absolute)
export const P = {
  join: (...a) => P.norm(a.filter(Boolean).join("/")),
  norm(p) {
    const abs = p.startsWith("/");
    const out = [];
    for (const s of p.split("/")) { if (!s || s === ".") continue; if (s === "..") out.pop(); else out.push(s); }
    return (abs ? "/" : "") + out.join("/");
  },
  dir: (p) => { const i = p.lastIndexOf("/"); return i <= 0 ? "/" : p.slice(0, i); },
  base: (p) => p.slice(p.lastIndexOf("/") + 1),
  ext: (p) => { const b = P.base(p); const i = b.lastIndexOf("."); return i <= 0 ? "" : b.slice(i + 1).toLowerCase(); },
  rel: (from, to) => (to === from ? "" : to.startsWith(from.replace(/\/$/, "") + "/") ? to.slice(from.replace(/\/$/, "").length + 1) : to),
  inside: (root, p) => p === root || p.startsWith(root.replace(/\/$/, "") + "/"),
  stem: (p) => { const b = P.base(p); const i = b.lastIndexOf("."); return i <= 0 ? b : b.slice(0, i); },
};

export const debounce = (fn, ms = 200) => { let t; const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; d.flush = (...a) => { clearTimeout(t); fn(...a); }; d.cancel = () => clearTimeout(t); return d; };
export const throttle = (fn, ms = 100) => { let last = 0, t; return (...a) => { const now = Date.now(); clearTimeout(t); if (now - last >= ms) { last = now; fn(...a); } else t = setTimeout(() => { last = Date.now(); fn(...a); }, ms - (now - last)); }; };
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function fmtBytes(n) {
  if (n == null || n < 0) return "";
  if (n < 1024) return n + " B";
  const u = ["KB", "MB", "GB", "TB"]; let i = -1;
  do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
  return n.toFixed(n >= 100 ? 0 : n >= 10 ? 1 : 2) + " " + u[i];
}
export function fmtTime(ms) {
  if (!ms) return "";
  const d = new Date(ms), now = new Date();
  const same = d.toDateString() === now.toDateString();
  return same ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
}
export function relTime(ms) {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return "just now"; if (s < 3600) return Math.floor(s / 60) + " min ago";
  if (s < 86400) return Math.floor(s / 3600) + " h ago"; if (s < 2592000) return Math.floor(s / 86400) + " d ago";
  return new Date(ms).toLocaleDateString();
}

// ---- base64 <-> bytes (chunked: safe for large buffers)
export function bytesToB64(bytes) {
  let s = ""; const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(s);
}
export function b64ToBytes(b64) {
  const s = atob(b64); const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
export const textEnc = new TextEncoder(), textDec = new TextDecoder("utf-8");
export const strToB64 = (s) => bytesToB64(textEnc.encode(s));
export const b64ToStr = (b) => textDec.decode(b64ToBytes(b));

export function shellQuote(s) { return /^[\w@%+=:,./-]+$/.test(s) ? s : "'" + String(s).replace(/'/g, "'\\''") + "'"; }

export function copyText(text) { return import("./bridge.js").then(({ N }) => N.sys.clipboardSet(text)).catch(() => navigator.clipboard?.writeText(text)); }
export const isMobile = () => window.matchMedia("(max-width: 760px)").matches;
export const isTouch = () => "ontouchstart" in window || navigator.maxTouchPoints > 0;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function once(fn) { let done = false, v; return (...a) => (done ? v : ((done = true), (v = fn(...a)))); }
export function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("Failed to load " + src)); document.head.append(s); });
}
export function loadCss(href) { document.head.append(h("link", { rel: "stylesheet", href })); }

/** JSON with comments and trailing commas (VS Code settings / theme files). String-aware. */
export function parseJsonc(text) {
  let out = "", i = 0; const n = text.length;
  if (text.charCodeAt(0) === 0xfeff) i = 1;
  while (i < n) {
    const ch = text[i];
    if (ch === '"') {
      let j = i + 1;
      while (j < n && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      out += text.slice(i, j + 1); i = j + 1;
    } else if (ch === "/" && text[i + 1] === "/") { while (i < n && text[i] !== "\n") i++; }
    else if (ch === "/" && text[i + 1] === "*") { i += 2; while (i < n && !(text[i] === "*" && text[i + 1] === "/")) i++; i += 2; }
    else { out += ch; i++; }
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

export function fuzzy(query, text) {
  if (!query) return 1;
  const q = query.toLowerCase(), t = text.toLowerCase();
  const direct = t.indexOf(q);
  if (direct >= 0) return 1000 - direct + (direct === 0 ? 200 : 0) + (t.length === q.length ? 300 : 0);
  let qi = 0, score = 0, last = -2;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) { score += i === last + 1 ? 8 : 2; if (i === 0 || "/-_. ".includes(t[i - 1])) score += 6; last = i; qi++; }
  }
  return qi === q.length ? score : 0;
}
