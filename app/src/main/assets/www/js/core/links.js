// URL helpers shared by the terminal, the editor and the `open`/`xdg-open`/vite "press o" bridge.
// Default behaviour: open links in the Android default browser; "ui.openUrlWith" = "preview" keeps local URLs inside the IDE.
import { N } from "./bridge.js";
import { bus } from "./events.js";
import { settings } from "./settings.js";
import { toast } from "./ui.js";

export const URL_RE = /https?:\/\/[^\s<>"'`\\^{}|]+/gi;
const LOCAL_RE = /^https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|192\.168\.|10\.|172\.(?:1[6-9]|2\d|3[01])\.)/i;
export const isUrl = (s) => /^https?:\/\/[^\s]+$/i.test(String(s || "").trim());
export const isLocal = (u) => LOCAL_RE.test(u);
/** strip trailing punctuation that is almost never part of the link, and make 0.0.0.0 reachable */
export const normalize = (u) => {
  let s = String(u).trim();
  while (/[.,;:!?'"\]}]$/.test(s) || (s.endsWith(")") && !s.includes("("))) s = s.slice(0, -1);
  return s.replace("//0.0.0.0", "//localhost");
};
/** URL in `text` covering 0-based column `col` (or null) */
export function urlAt(text, col) {
  URL_RE.lastIndex = 0; let m;
  while ((m = URL_RE.exec(text))) { if (col >= m.index && col <= m.index + m[0].length) return normalize(m[0]); if (m.index > col) break; }
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
