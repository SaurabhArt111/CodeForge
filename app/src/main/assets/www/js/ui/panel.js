// Bottom panel (Terminal / Preview / Output / Problems): tab switching, resize sash, maximize, mobile behaviour.
import { bus, Emitter } from "../core/events.js";
import { settings } from "../core/settings.js";
import { h, icon, clamp, isMobile } from "../core/util.js";
import { makeSash } from "./sash.js";

export const panelEvents = new Emitter();
let panel, sash, current = null;
const views = new Map(); // name -> {onShow}

export function init() {
  panel = document.getElementById("panel"); sash = document.getElementById("sash-h");
  panel.querySelectorAll(".ptab").forEach((b) => b.addEventListener("click", () => show(b.dataset.panel)));
  document.getElementById("panel-close").addEventListener("click", hide);
  document.getElementById("panel-max").addEventListener("click", () => { panel.classList.toggle("max"); panelEvents.emit("resize"); });
  const wb = () => document.getElementById("workbench");
  const hpx = settings.state.panelHeight; if (hpx) panel.style.setProperty("--panel-h", hpx + "px");
  makeSash(sash, {
    axis: "y", invert: true,
    size: () => panel.getBoundingClientRect().height,
    min: () => 90, max: () => wb().getBoundingClientRect().height - (isMobile() ? 90 : 120),
    apply: (px) => { panel.style.setProperty("--panel-h", px + "px"); panelEvents.emit("resize"); },
    commit: (px) => { settings.state.panelHeight = Math.round(px); settings.saveState(); },
    reset: () => { panel.style.removeProperty("--panel-h"); settings.state.panelHeight = 0; settings.saveState(); panelEvents.emit("resize"); },
  });
  // keep the panel inside the workbench when the keyboard opens / the window shrinks
  window.addEventListener("resize", () => { const max = wb().getBoundingClientRect().height - 90; if (max > 0 && panel.getBoundingClientRect().height > max) panel.style.setProperty("--panel-h", Math.max(90, max) + "px"); });
  new ResizeObserver(() => panelEvents.emit("resize")).observe(document.getElementById("panel-body"));
  bus.on("panel", (n) => show(n)); bus.on("cmd:terminal", () => toggle("terminal"));
}
export function registerView(name, { onShow } = {}) { views.set(name, { onShow }); }
export const isOpen = () => !panel.classList.contains("hidden");
export const active = () => current;
export function show(name = current || "terminal") {
  current = name;
  panel.classList.remove("hidden"); sash.classList.remove("hidden");
  panel.querySelectorAll(".ptab").forEach((b) => b.classList.toggle("active", b.dataset.panel === name));
  panel.querySelectorAll(".pane").forEach((p) => p.classList.toggle("on", p.id === "pane-" + name));
  const actions = document.getElementById("panel-actions"); actions.replaceChildren();
  views.get(name)?.onShow?.(actions);
  panelEvents.emit("show", name); panelEvents.emit("resize");
  document.querySelector('#bottomnav [data-nav="terminal"]')?.classList.toggle("active", name === "terminal");
}
export function hide() { panel.classList.add("hidden"); panel.classList.remove("max"); sash.classList.add("hidden"); panelEvents.emit("hide"); panelEvents.emit("resize"); document.querySelector('#bottomnav [data-nav="terminal"]')?.classList.remove("active"); }
export function toggle(name) { if (isOpen() && current === name) hide(); else show(name); }
export function setBadge(name, n) { const b = panel.querySelector(`.ptab[data-panel="${name}"]`); if (!b) return; let c = b.querySelector(".count"); if (c) { c.textContent = n; c.classList.toggle("hidden", !n); } }
export function pane(name) { return document.getElementById("pane-" + name); }
