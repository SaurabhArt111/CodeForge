// Crash recorder client: breadcrumbs + JS error reporting. No UI imports, so it can be loaded first and never create import cycles.
import { N } from "./bridge.js";

const q = [];
let timer = 0, sent = 0;
const recent = new Map();

/** Leave a breadcrumb ("what was the app doing"). Batched; kept by the native side and attached to crash reports. */
export function crumb(msg) {
  q.push(String(msg).slice(0, 160)); if (q.length > 80) q.shift();
  if (!timer) timer = setTimeout(flush, 2000);
}
export function flush() {
  clearTimeout(timer); timer = 0;
  if (!q.length) return;
  N.crash.crumbs(q.splice(0)).catch(() => {});
}

/** Record a non-fatal problem (rate limited and de-duplicated so an error loop can't flood storage). */
export function report(kind, title, detail = "", { logcat = false } = {}) {
  const now = Date.now(), key = kind + title.slice(0, 120);
  if ((recent.get(key) || 0) > now - 60000 || sent >= 25) return Promise.resolve(null);
  recent.set(key, now); sent++;
  flush();
  return N.crash.report({ kind, title: title.slice(0, 200), detail, logcat }).catch(() => null);
}

let installed = false;
export function install() {
  if (installed) return; installed = true;
  window.addEventListener("error", (e) => {
    if (e.target && e.target !== window) return;                       // <img>/<script> load failures are not script errors
    report("js-error", e.message || "Script error", `${e.filename || ""}:${e.lineno || 0}:${e.colno || 0}\n${e.error?.stack || ""}`);
  });
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason; if (/AbortError|cancel/i.test(String(r?.message || r))) return;
    report("js-error", "Unhandled rejection: " + String(r?.message || r), r?.stack || "");
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden) flush(); });
  window.addEventListener("pagehide", flush);
  N.on("app.pause", flush);
  crumb("ui start");
}
