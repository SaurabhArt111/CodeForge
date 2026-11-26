import { useEffect } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { config, url } from "../lib/site.js";
import { ThemeButton, ThemePicker } from "./Theme.jsx";
import { Wall } from "./Fx.jsx";

const WALL_WORDS = ["Editor", "Terminal", "Git", "Preview", "AI agent", "Debian", "Ubuntu", "Alpine", "Node.js", "Python", "Extensions", "Themes", "Snippets", "Storage", "Offline", "Android", "Browser"];

const Arrow = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>);
export const DownloadIcon = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12m0 0 5-5m-5 5-5-5M4 20h16" /></svg>);
export { Arrow };

export default function Layout() {
  const c = config(); const { pathname, hash } = useLocation();
  useEffect(() => {   // scroll to #sections and reset on page change
    if (hash && !hash.includes(":")) { const t = document.getElementById(hash.slice(1)); if (t) { t.scrollIntoView(); return; } }
    if (!pathname.startsWith("/code")) window.scrollTo(0, 0);
  }, [pathname, hash]);
  return (<>
    <a className="skip" href="#main">Skip to content</a>
    <header className="top"><div className="wrap">
      <Link className="brand" to="/"><img src={url("assets/logo.svg")} alt="" width="26" height="26" />CodeForge</Link>
      <nav aria-label="Main">
        <NavLink className="mid" to="/features">Features</NavLink>
        <NavLink className="mid" to="/guide">Guide</NavLink>
        <NavLink to="/docs">Docs</NavLink>
        <NavLink to="/updates">Release notes</NavLink>
        <NavLink to="/blog">Blog</NavLink>
        <NavLink className="keep" to="/download">Download</NavLink>
        <ThemeButton />
        <a className="cta" href={url("app/")}>Open web editor</a>
      </nav></div></header>
    <main id="main"><Outlet /></main>
    <footer className="foot">
      <div className="wrap foot-top">
        <div className="foot-brand">
          <Link className="brand" to="/"><img src={url("assets/logo.svg")} alt="" width="26" height="26" />CodeForge</Link>
          <p>A code editor with a real terminal, Git, live preview and AI, for your phone and your browser.</p>
          <div className="actions"><a className="btn primary small" href={url("app/")}>Open web editor</a><Link className="btn small" to="/download"><DownloadIcon /> Android app</Link></div>
        </div>
        <nav className="foot-cols" aria-label="Footer">
          <div><h3>Product</h3><a href={url("app/")}>Web editor</a><Link to="/download">Android app</Link><Link to="/features">Features</Link><Link to="/updates">Release notes</Link></div>
          <div><h3>Learn</h3><Link to="/guide">Guide</Link><Link to="/guide#terminal">Terminal mode</Link><Link to="/docs">Docs</Link><Link to="/blog">Blog</Link></div>
          <div><h3>Project</h3><Link to="/code">Source code</Link>{c.githubUrl ? <a href={c.githubUrl}>GitHub</a> : null}<Link to="/about">About</Link><Link to="/privacy">Privacy</Link></div>
        </nav>
      </div>
      <div className="foot-wall">
        <Wall words={WALL_WORDS} />
        <p className="foot-word" aria-hidden="true">CodeForge</p>
      </div>
      <div className="wrap foot-bottom">
        <span>CodeForge {c.version} · MIT licensed · Runs on Android and in your browser</span>
        <ThemePicker />
      </div>
    </footer>
  </>);
}
