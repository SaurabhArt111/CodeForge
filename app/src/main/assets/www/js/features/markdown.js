// Markdown preview (sandboxed iframe, live updates) and a simple hex viewer.
import * as lazy from "../core/lazy.js";
import { h, icon, P, b64ToBytes, debounce, esc } from "../core/util.js";
let A;
export async function init(api) {
  await lazy.marked();
  A = api;
  A.cmd.register({ id: "md.preview", title: "Markdown: Open Preview to the Side", run: () => { const p = A.ed.activeTab()?.path; if (p && /\.(md|markdown|mdx)$/i.test(p)) return preview(p); A.toast("Open a Markdown file first"); } });
  A.cmd.register({ id: "hex.view", title: "Open as Hex Viewer", run: () => { const p = A.ed.activeTab()?.path; if (p) return hex(p); } });
}

function css() {
  const c = getComputedStyle(document.documentElement); const v = (k) => c.getPropertyValue(k).trim();
  return `body{margin:0;padding:16px 22px 60px;background:${v("--bg")};color:${v("--fg")};font:15px/1.65 system-ui,sans-serif;max-width:860px;margin:0 auto;word-wrap:break-word}
a{color:${v("--link")}}img{max-width:100%}h1,h2{border-bottom:1px solid ${v("--border")};padding-bottom:.3em}
code{background:${v("--input-bg")};padding:.15em .4em;border-radius:4px;font:13px ui-monospace,Menlo,Consolas,monospace}pre{background:${v("--input-bg")};padding:12px 14px;border-radius:8px;overflow:auto}pre code{background:none;padding:0}
blockquote{margin:0;padding:0 1em;color:${v("--muted")};border-left:4px solid ${v("--border")}}table{border-collapse:collapse}th,td{border:1px solid ${v("--border")};padding:6px 12px}hr{border:0;border-top:1px solid ${v("--border")}}
input[type=checkbox]{margin-right:6px}`;
}
async function render(path) {
  const d = A.ed.getDoc(path); const text = d?.model ? d.model.getValue() : (await A.N.fs.readText(path)).text || "";
  const base = await A.N.fs.url(P.dir(path) + "/");
  const html = window.marked ? window.marked.parse(text, { gfm: true, breaks: false }) : `<pre>${esc(text)}</pre>`;
  return `<!doctype html><html><head><meta charset="utf-8"><base href="${base}"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src * data:; style-src 'unsafe-inline'; font-src *; media-src *"><style>${css()}</style></head><body>${html}</body></html>`;
}

export function preview(path) {
  const id = "mdpreview:" + path;
  A.ed.openCustom(id, "Preview " + P.base(path), { iconName: "open-preview", group: A.ed.groupCount() === 2 ? 1 : 0,
    render(el, tab) {
      el.classList.remove("scroll"); el.style.overflow = "hidden";
      const fr = h("iframe", { sandbox: "", style: { position: "absolute", inset: 0, width: "100%", height: "100%", border: 0, background: "transparent" } }); el.append(fr);
      const update = async () => { try { fr.srcdoc = await render(path); } catch (e) { fr.srcdoc = `<body style="color:#f66;font:14px sans-serif">${esc(e.message)}</body>`; } };
      const deb = debounce(update, 250); update();
      const off1 = A.ed.editorEvents.on("content", (d) => { if (d.path === path) deb(); });
      const off2 = A.ed.editorEvents.on("saved", (d) => { if (d.path === path) deb(); });
      const off3 = A.themes.themeEvents.on("change", update);
      tab.dispose = () => { off1?.(); off2?.(); off3?.(); };
    } });
}

export async function hex(path) {
  A.ed.openCustom("hex:" + path, "Hex " + P.base(path), { iconName: "file-binary",
    render(el) {
      el.classList.add("selectable"); const pre = h("pre", { style: { margin: 0, padding: "12px", font: "calc(12px * var(--fz))/1.5 var(--mono)" } }); el.append(pre);
      let off = 0; const CH = 4096;
      const more = h("button.btn", { style: { margin: "8px 12px" }, onclick: load }, "Load more");
      async function load() {
        const b = b64ToBytes(await A.N.fs.readB64(path, off, CH)); let out = "";
        for (let i = 0; i < b.length; i += 16) { const row = b.slice(i, i + 16); out += (off + i).toString(16).padStart(8, "0") + "  " + [...row].map((x) => x.toString(16).padStart(2, "0")).join(" ").padEnd(48) + " " + [...row].map((x) => (x >= 32 && x < 127 ? String.fromCharCode(x) : ".")).join("") + "\n"; }
        pre.append(document.createTextNode(out)); off += b.length; if (b.length < CH) more.remove();
      }
      el.append(more); load();
    } });
}
