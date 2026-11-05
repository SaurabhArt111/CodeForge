// One text-size control for the whole app. `ui.fontScale` (percent) drives --fz, which every font-size / row height in the stylesheet is multiplied by;
// the editor and terminal use their own base size times the same factor, so "Text size" in Settings changes everything at once.
import { settings } from "./settings.js";

export const MIN = 70, MAX = 170;
export const percent = () => Math.max(MIN, Math.min(MAX, Number(settings.get("ui.fontScale")) || 100));
export const factor = () => percent() / 100;
/** a base size in px → the size to actually use (one decimal) */
export const scaled = (n) => Math.round(n * factor() * 10) / 10;

export function apply() {
  const f = factor();
  document.documentElement.style.setProperty("--fz", String(f));
  document.documentElement.classList.toggle("fz-big", f >= 1.3);
}
export function init() {
  apply();
  settings.on("change:ui.fontScale", apply);
}
export function bump(delta) { settings.set("ui.fontScale", Math.max(MIN, Math.min(MAX, Math.round((percent() + delta) / 5) * 5))); }
export const reset = () => settings.set("ui.fontScale", 100);
