import { POSTS } from "../content/posts.js";

export default function Blog() {
  return (<>
    <section className="page-head"><div className="wrap prose">
      <h1>Blog</h1>
      <p className="sub" style={{ margin: 0 }}>Notes on how CodeForge works and why.</p>
    </div></section>
    <section style={{ paddingTop: 0 }}><div className="wrap prose">
      {POSTS.map((p) => (<article key={p.id} id={p.id} className="post">
        <p className="post-date">{p.date}</p>
        <h2>{p.title}</h2>
        {p.body.map((t) => <p key={t}>{t}</p>)}
      </article>))}
    </div></section>
  </>);
}
