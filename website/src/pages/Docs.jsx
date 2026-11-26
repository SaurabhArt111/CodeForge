import { Link } from "react-router-dom";
import DocsBody from "../components/DocsBody.jsx";
import { Fluid } from "../components/Fx.jsx";

const TOC = [["start", "Get started"], ["files", "Files"], ["terminal", "Linux terminal"], ["cf", "cf command"], ["preview", "Run and preview"], ["github", "GitHub"], ["ai", "AI tools"], ["extensions", "Extensions"], ["keys", "Shortcuts"], ["security", "Privacy"], ["faq", "FAQ"], ["more", "Resources"]];

export default function Docs() {
  return (<>
    <section className="page-head has-fx"><Fluid /><div className="wrap prose">
      <p className="eyebrow">Docs</p>
      <h1>Docs and resources</h1>
      <p className="sub" style={{ margin: 0 }}>Short answers for the things people ask about most. For a walk-through with screenshots, read the <Link to="/guide">Guide</Link>.</p>
      <nav className="toc" aria-label="On this page">{TOC.map(([id, t]) => <a key={id} href={"#" + id}>{t}</a>)}</nav>
    </div></section>
    <section style={{ paddingTop: 0 }}><div className="wrap prose"><DocsBody /></div></section>
  </>);
}
