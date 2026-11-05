// Heavy vendor scripts load on first use instead of blocking start-up (xterm ≈ 0.7 MB with addons, isomorphic-git ≈ 0.35 MB, zip / markdown).
const cache = new Map();
/** Vendor UMD bundles must register globals, but Monaco's AMD loader defines `define`, which would swallow them as anonymous AMD modules
 *  ("Can only have one anonymous define call"). Evaluate them with define/module/exports shadowed so they take their global-assignment branch. */
export function script(src) {
  if (cache.has(src)) return cache.get(src);
  const p = fetch(src).then((r) => { if (!r.ok) throw new Error(`Could not load ${src} (${r.status})`); return r.text(); })
    .then((code) => { new Function("define", "module", "exports", code + "\n//# sourceURL=" + src).call(window, undefined, undefined, undefined); });
  p.catch(() => cache.delete(src));
  cache.set(src, p); return p;
}
const all = (list) => Promise.all(list.map(script));
export const xterm = () => script("vendor/xterm/xterm.js").then(() => all(["vendor/xterm/addon-fit.js", "vendor/xterm/addon-web-links.js", "vendor/xterm/addon-search.js", "vendor/xterm/addon-unicode11.js"]));
export const git = () => script("vendor/buffer/buffer.js").then(() => script("vendor/isomorphic-git/isomorphic-git.min.js"));
export const marked = () => script("vendor/marked/marked.umd.js").catch(() => {});
export const jszip = () => script("vendor/jszip/jszip.min.js");
/** run when the browser is idle (after first paint) */
export const idle = (fn, timeout = 1500) => ((window.requestIdleCallback || ((f) => setTimeout(f, 60)))(fn, { timeout }));
