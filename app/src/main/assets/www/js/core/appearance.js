// Appearance: System (follow the phone / computer), Light, Dark, or one fixed colour theme.
// ui.appearance = "system" | "light" | "dark" | "theme"; ui.themeLight / ui.themeDark are the themes used for each side,
// ui.theme is the fixed theme used when appearance is "theme" (also what older builds saved).
// On Android the WebView reports the APP's theme in prefers-color-scheme, not the phone's, so the native side tells us.
import { N } from "./bridge.js";
import { settings } from "./settings.js";
import { Emitter } from "./events.js";

export const events = new Emitter();
let night = true;

export const isDark = () => night;

/** Id of the colour theme that should be shown right now. */
export function themeId() {
  const a = settings.get("ui.appearance");
  if (a === "theme") return settings.get("ui.theme");
  if (a === "light") return settings.get("ui.themeLight");
  if (a === "dark") return settings.get("ui.themeDark");
  return night ? settings.get("ui.themeDark") : settings.get("ui.themeLight");
}

export function init(info) {
  // builds before 8.6 only had ui.theme: anyone who picked a theme other than the default keeps it
  if (!settings.state.appearanceSeeded) {
    const t = settings.get("ui.theme");
    if (t && t !== "Dark Modern") settings.set("ui.appearance", "theme");
    settings.state.appearanceSeeded = 1; settings.saveState();
  }
  const changed = () => events.emit("change", themeId());
  if (typeof info?.night === "boolean") {
    night = info.night;
    N.on("sys.night", (d) => { if (!!d?.night !== night) { night = !!d.night; changed(); } });
    N.on("app.resume", async () => { try { const n = !!(await N.sys.night()); if (n !== night) { night = n; changed(); } } catch { /* older native side */ } });
  } else {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    night = mq ? mq.matches : true;
    mq?.addEventListener?.("change", (e) => { night = e.matches; changed(); });
  }
  for (const k of ["ui.appearance", "ui.theme", "ui.themeLight", "ui.themeDark"]) settings.on("change:" + k, changed);
}

/** Switch appearance; used by the command palette and the phone menu. */
export function set(mode) { settings.set("ui.appearance", mode); }

/** Cycle System → Light → Dark → System (the quick toggle). */
export function cycle() {
  const order = ["system", "light", "dark"];
  const cur = settings.get("ui.appearance");
  const next = order[(order.indexOf(cur) + 1) % order.length] || "system";
  set(next); return next;
}
