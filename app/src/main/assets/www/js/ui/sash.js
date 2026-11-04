// Touch + mouse friendly drag handle (pointer events, pointer capture, rAF-throttled, double-tap to reset).
import { clamp } from "../core/util.js";

/**
 * @param {HTMLElement} el   the handle
 * @param {object} o
 *   axis: "x" | "y"
 *   size(): current size in px of the thing being resized
 *   min(): number, max(): number
 *   apply(px): apply a new size
 *   invert: true when dragging towards the origin grows the target (e.g. bottom panel dragged up)
 *   commit(px): called once at the end (persist)
 *   reset(): called on double click / double tap
 */
export function makeSash(el, o) {
  el.style.touchAction = "none";
  let start = 0, startSize = 0, raf = 0, pending = null, active = false, lastTap = 0;
  const pos = (e) => (o.axis === "x" ? e.clientX : e.clientY);
  const flush = () => { raf = 0; if (pending != null) { o.apply(pending); pending = null; } };
  el.addEventListener("pointerdown", (e) => {
    if (e.button != null && e.button > 0) return;
    const now = Date.now(); if (now - lastTap < 320 && o.reset) { lastTap = 0; o.reset(); return; } lastTap = now;
    e.preventDefault(); active = true; start = pos(e); startSize = o.size();
    try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    el.classList.add("drag"); document.body.classList.add("resizing", "resizing-" + o.axis);
  });
  el.addEventListener("pointermove", (e) => {
    if (!active) return;
    const d = (pos(e) - start) * (o.invert ? -1 : 1);
    pending = clamp(startSize + d, o.min(), Math.max(o.min(), o.max()));
    if (!raf) raf = requestAnimationFrame(flush);
  });
  const end = (e) => {
    if (!active) return; active = false;
    try { el.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (raf) { cancelAnimationFrame(raf); flush(); }
    el.classList.remove("drag"); document.body.classList.remove("resizing", "resizing-x", "resizing-y");
    o.commit?.(o.size());
  };
  el.addEventListener("pointerup", end); el.addEventListener("pointercancel", end); el.addEventListener("lostpointercapture", end);
  el.addEventListener("dblclick", () => o.reset?.());
}
