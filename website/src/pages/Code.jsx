import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { config, url } from "../lib/site.js";
import { highlight } from "../lib/highlight.js";

const fmt = (n) => (n >= 1024 ? (n / 1024).toFixed(n >= 10240 ? 0 : 1) + " KB" : n + " B");
const enc = (p) => p.split("/").map(encodeURIComponent).join("/");

function buildTree(files) {
  const root = { dirs: new Map(), files: [] };
  for (const f of files) {
    let n = root; const parts = f.path.split("/");
    parts.slice(0, -1).forEach((p, i) => { if (!n.dirs.has(p)) n.dirs.set(p, { path: parts.slice(0, i + 1).join("/"), dirs: new Map(), files: [] }); n = n.dirs.get(p); });
    n.files.push(f);
  }
  return root;
}

function Tree({ node, q, open, toggle, current, go }) {
  const match = (f) => !q || f.path.toLowerCase().includes(q);
  const has = (n) => n.files.some(match) || [...n.dirs.values()].some(has);
  return (<>
    {[...node.dirs].sort((a, b) => a[0].localeCompare(b[0])).filter(([, d]) => has(d)).map(([name, d]) => {
      const isOpen = !!q || open.has(d.path);
      return (<div key={d.path}>
        <button type="button" className="row dir" role="treeitem" aria-expanded={isOpen} onClick={() => toggle(d.path)}><span className="twisty">{isOpen ? "▾" : "▸"}</span>{name}</button>
        {isOpen ? <div className="kids" role="group"><Tree node={d} q={q} open={open} toggle={toggle} current={current} go={go} /></div> : null}
      </div>);
    })}
    {node.files.filter(match).sort((a, b) => a.path.localeCompare(b.path)).map((f) => (
      <button type="button" key={f.path} className="row" role="treeitem" aria-selected={f.path === current} onClick={() => go(f.path)}><span className="twisty"></span>{f.path.split("/").pop()}<span className="size">{fmt(f.size)}</span></button>
    ))}
  </>);
}

export default function Code() {
  const c = config(); const nav = useNavigate(); const { hash } = useLocation();
  const [data, setData] = useState(null); const [err, setErr] = useState(false);
  const [filter, setFilter] = useState(""); const [open, setOpen] = useState(() => new Set(["app", "app/src", "app/src/main"]));
  const [file, setFile] = useState(null);   // { path, text, line }
  const [copyLabel, setCopyLabel] = useState("Copy");
  const codeRef = useRef(null);

  useEffect(() => { fetch(url("code-data/tree.json")).then((r) => { if (!r.ok) throw 0; return r.json(); }).then(setData).catch(() => setErr(true)); }, []);
  const tree = useMemo(() => (data ? buildTree(data.files) : null), [data]);

  const [path, line] = useMemo(() => { const h = decodeURIComponent(hash.slice(1)); if (!h) return [null, 0]; const i = h.lastIndexOf(":"); return i > 0 && /^\d+$/.test(h.slice(i + 1)) ? [h.slice(0, i), +h.slice(i + 1)] : [h, 0]; }, [hash]);
  useEffect(() => {
    if (!data || !path || !data.files.some((f) => f.path === path)) { setFile(null); return; }
    const parts = path.split("/"); setOpen((o) => { const n = new Set(o); parts.slice(0, -1).forEach((_, i) => n.add(parts.slice(0, i + 1).join("/"))); return n; });
    let live = true; setFile({ path, text: null, line });
    fetch(url("code-data/src/" + enc(path))).then((r) => r.text()).then((text) => live && setFile({ path, text, line })).catch(() => live && setFile({ path, text: "Could not load this file.", line }));
    return () => { live = false; };
  }, [data, path]);   // eslint-disable-line react-hooks/exhaustive-deps

  const html = useMemo(() => (file?.text == null ? "" : highlight(file.text, file.path).split("\n").map((l, i) => `<span class="l" id="L${i + 1}"><span class="n" data-n="${i + 1}">${i + 1}</span>${l}</span>`).join("")), [file]);
  useEffect(() => {
    const el = codeRef.current; if (!el || !file?.text) return;
    if (file.line) { const t = el.querySelector("#L" + file.line); t?.classList.add("hl"); t?.scrollIntoView({ block: "center" }); } else el.scrollTop = 0;
  }, [html]);   // eslint-disable-line react-hooks/exhaustive-deps

  const go = (p) => nav({ hash: "#" + encodeURIComponent(p) }, { replace: false });
  const toggle = (p) => setOpen((o) => { const n = new Set(o); n.has(p) ? n.delete(p) : n.add(p); return n; });
  const copy = async () => { try { await navigator.clipboard.writeText(file.text); setCopyLabel("Copied"); } catch { setCopyLabel("Select and copy"); } setTimeout(() => setCopyLabel("Copy"), 1600); };
  const onCodeClick = (e) => { const n = e.target.closest?.(".n"); if (n && file) history.replaceState(null, "", location.pathname + "#" + encodeURIComponent(file.path) + ":" + n.dataset.n); };
  const lines = data ? data.files.reduce((a, x) => a + x.lines, 0) : 0;
  const q = filter.trim().toLowerCase();

  return (<>
    <section className="page-head" style={{ paddingBottom: 18 }}><div className="wrap">
      <h1>Source code</h1>
      <p className="sub" style={{ margin: "0 0 18px" }}>The full project: a Kotlin Android app, the JavaScript editor UI it hosts, a Node dev host that emulates the native side for tests, this React + Node website, and end-to-end tests. MIT licensed.</p>
      <div className="actions"><a className="btn primary" href={url("downloads/CodeForge-source.zip")} download>Download source (ZIP)</a>{c.githubUrl ? <a className="btn" href={c.githubUrl}>View on GitHub</a> : null}</div>
    </div></section>
    <section style={{ padding: "0 0 28px" }}><div className="wrap">
      <div className="stats" aria-live="polite">{data ? (<><span><b>{data.files.length}</b>files</span><span><b>{lines.toLocaleString()}</b>lines</span>{data.langs.slice(0, 4).map((l) => <span key={l.name}><b>{Math.round(l.share * 100)}%</b>{l.name}</span>)}</>) : null}</div>
      <div className="modules">{data?.modules.map((m) => (<div className="mod" key={m.title}><h3>{m.title}</h3><p>{m.text}</p>{m.files.map((p) => <Link key={p} to={{ hash: "#" + encodeURIComponent(p) }}>{p.split("/").pop()}</Link>)}</div>))}</div>
    </div></section>
    <section style={{ padding: "0 0 60px" }}><div className="wrap">
      <div className="cb">
        <aside className="cb-tree" aria-label="Files">
          <label className="sr" htmlFor="filter">Filter files</label>
          <input id="filter" type="search" placeholder="Filter files…" autoComplete="off" spellCheck="false" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <div id="tree" role="tree" aria-label="Project files">
            {err ? "The file list could not be loaded. Run npm run build in website/ to generate it." : tree ? <Tree node={tree} q={q} open={open} toggle={toggle} current={path} go={go} /> : "Loading…"}
          </div>
        </aside>
        <div className="cb-view" id="viewer" tabIndex={-1}>
          <div className="cb-bar"><span>{file?.path || "Select a file"}</span><span className="grow"></span>{file ? <a href={url("code-data/src/" + enc(file.path))}>Raw</a> : null}{file?.text ? <button type="button" onClick={copy}>{copyLabel}</button> : null}</div>
          {!file ? (<div className="cb-empty"><p>Pick a file on the left. Good places to start:</p><ul>{data?.modules.slice(0, 4).flatMap((m) => m.files.slice(0, 1)).map((p) => <li key={p}><Link to={{ hash: "#" + encodeURIComponent(p) }}>{p}</Link></li>)}</ul></div>)
            : file.text == null ? <pre className="cb-code">Loading…</pre>
            : <pre className="cb-code" ref={codeRef} onClick={onCodeClick} dangerouslySetInnerHTML={{ __html: html }} />}
        </div>
      </div>
    </div></section>
  </>);
}
