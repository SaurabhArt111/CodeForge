import { RELEASES } from "../content/releases.js";

export default function Updates() {
  return (<>
    <section className="page-head"><div className="wrap prose">
      <h1>Release notes</h1>
      <p className="sub" style={{ margin: 0 }}>What changed in each version, newest first.</p>
    </div></section>
    <section style={{ paddingTop: 0 }}><div className="wrap prose">
      {RELEASES.map((r) => (<article key={r.v} id={"v" + r.v} className="rel">
        <h2>{r.v} <span className="rel-date">{r.date}</span></h2>
        <p className="rel-title">{r.title}</p>
        <ul className="rel-list">{r.items.map(([kind, text]) => <li key={text}><span className={"tag " + kind}>{kind === "new" ? "New" : "Fixed"}</span>{text}</li>)}</ul>
      </article>))}
    </div></section>
  </>);
}
