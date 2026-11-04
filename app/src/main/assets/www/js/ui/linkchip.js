// A small floating chip ("Open in browser · Preview · Copy") shown when a URL is selected in the editor or terminal.
import { h, icon } from "../core/util.js";
import { N } from "../core/bridge.js";
import { toast } from "../core/ui.js";
import { openInBrowser, openInPreview, isLocal, normalize } from "../core/links.js";

let el = null, timer = null, current = null;
export function showLinkChip(url) {
  url = normalize(url); if (current === url && el) { arm(); return; }
  hideLinkChip(); current = url;
  const shown = url.length > 48 ? url.slice(0, 30) + "…" + url.slice(-14) : url;
  el = h("div.link-chip", { role: "toolbar", onpointerdown: (e) => e.preventDefault() },   // keep focus/selection where it is
    icon("link"), h("span.lc-url", { title: url }, shown),
    h("button.lc-btn.primary", { onclick: () => { openInBrowser(url); hideLinkChip(); } }, icon("link-external"), " Open in browser"),
    isLocal(url) ? h("button.lc-btn", { onclick: () => { openInPreview(url); hideLinkChip(); } }, "Preview") : null,
    h("button.lc-btn", { title: "Copy link", onclick: () => { N.sys.clipboardSet(url); toast("Link copied", { timeout: 1400 }); } }, icon("copy")),
    h("button.lc-btn", { title: "Dismiss", onclick: hideLinkChip }, icon("close")));
  document.body.append(el); arm();
}
const arm = () => { clearTimeout(timer); timer = setTimeout(hideLinkChip, 12000); };
export function hideLinkChip() { clearTimeout(timer); el?.remove(); el = null; current = null; }
