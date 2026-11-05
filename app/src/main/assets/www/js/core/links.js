// URL helpers shared by the terminal, the editor and the `open`/`xdg-open`/vite "press o" bridge.
// Default behaviour: open links in the Android default browser; "ui.openUrlWith" = "preview" keeps local URLs inside the IDE.
import { N } from "./bridge.js";
import { bus } from "./events.js";
import { settings } from "./settings.js";
import { toast } from "./ui.js";

export const URL_RE = /https?:\/\/[^\s<>"'`\\^{}|]+/gi;
// "localhost:5173", "0.0.0.0:8000/api", "192.168.1.20:3000", "[::1]:4000" — servers often print these without "http://"
const HOST_PORT = String.raw`(?:localhost|0\.0\.0\.0|\[::1?\]|(?:\d{1,3}\.){3}\d{1,3}):\d{2,5}(?![\w])(?:/[^\s<>"'` + "`" + String.raw`\\^{}|]*)?`;
export const HOSTPORT_RE = new RegExp(String.raw`(?<![\w./:@\[-])` + HOST_PORT, "gi");
const HOSTPORT_EXACT = new RegExp("^" + HOST_PORT + "$", "i");
const LOCAL_RE = /^https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1?\]|192\.168\.|10\.|172\.(?:1[6-9]|2\d|3[01])\.)/i;
export const isUrl = (s) => { s = String(s || "").trim(); return /^https?:\/\/[^\s]+$/i.test(s) || HOSTPORT_EXACT.test(s); };
export const isLocal = (u) => LOCAL_RE.test(/^https?:/i.test(u) ? u : "http://" + u);
/** strip trailing punctuation that is almost never part of the link, add a missing "http://", and make 0.0.0.0 / [::] reachable */
export const normalize = (u) => {
  let s = String(u).trim();
  while (/[.,;:!?'"\]}]$/.test(s) || (s.endsWith(")") && !s.includes("("))) s = s.slice(0, -1);
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s) && HOSTPORT_EXACT.test(s)) s = "http://" + s;
  return s.replace(/^(https?:\/\/)(?:0\.0\.0\.0|\[::1?\])(?=[:/]|$)/i, "$1localhost");
};
/** every link in `text`: scheme URLs and scheme-less host:port, in order, without overlaps */
export function linksIn(text) {
  const out = [];
  for (const re of [URL_RE, HOSTPORT_RE]) { re.lastIndex = 0; let m; while ((m = re.exec(text))) out.push({ index: m.index, length: m[0].length, text: m[0] }); }
  out.sort((a, b) => a.index - b.index);
  return out.filter((l, i) => !i || l.index >= out[i - 1].index + out[i - 1].length);
}
/** URL in `text` covering 0-based column `col` (or null) */
export function urlAt(text, col) {
  for (const l of linksIn(text)) { if (col >= l.index && col <= l.index + l.length) return normalize(l.text); if (l.index > col) break; }
  return null;
}
export function openInBrowser(u) { u = normalize(u); return N.sys.openUrl(u).catch((e) => toast(e.message || String(e), { kind: "error" })); }
export function openInPreview(u) { bus.emit("preview:url", normalize(u).replace("//localhost", "//127.0.0.1")); }
export async function openUrl(u, { quiet = false } = {}) {
  u = normalize(u);
  if (!/^https?:\/\//i.test(u)) return N.sys.openUrl(u);
  if (settings.get("ui.openUrlWith") === "preview" && isLocal(u)) return openInPreview(u);
  await openInBrowser(u);
  if (!quiet && isLocal(u)) toast("Opened in your browser", { timeout: 2600, action: { label: "In-app preview", run: () => openInPreview(u) } });
}
