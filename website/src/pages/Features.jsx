import { Link } from "react-router-dom";
import { FEATURES } from "../content/features.js";
import { url } from "../lib/site.js";

export default function Features() {
  return (<>
    <section className="page-head"><div className="wrap">
      <h1>Features</h1>
      <p className="sub" style={{ margin: 0 }}>Everything below ships in the Android app. The web editor has the same interface without the Linux terminal.</p>
      <nav className="toc" aria-label="On this page">{FEATURES.map((f) => <a key={f.id} href={"#" + f.id}>{f.title}</a>)}</nav>
    </div></section>
    <section style={{ paddingTop: 0 }}><div className="wrap feat-list">
      {FEATURES.map((f) => (<article key={f.id} id={f.id} className="feat">
        <div><h2>{f.title}</h2><p className="feat-lead">{f.lead}</p></div>
        <ul>{f.points.map((p) => <li key={p}>{p}</li>)}</ul>
      </article>))}
    </div></section>
    <section className="tint"><div className="wrap prose">
      <h2>Try it</h2>
      <p>The web editor opens in this browser with nothing to install. The Android app adds the Linux terminal, device storage and background sessions.</p>
      <div className="actions"><a className="btn primary" href={url("app/")}>Open web editor</a><Link className="btn" to="/download">Download for Android</Link><Link className="btn" to="/docs">Read the docs</Link></div>
    </div></section>
  </>);
}
