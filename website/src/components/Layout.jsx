import { useEffect } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { config, url } from "../lib/site.js";

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
        <Link to="/#features">Features</Link>
        <NavLink to="/code">Source code</NavLink>
        <NavLink className="keep" to="/download">Download</NavLink>
        <a className="cta" href={url("app/")}>Open web editor</a>
      </nav></div></header>
    <main id="main"><Outlet /></main>
    <footer><div className="wrap">
      <div>CodeForge {c.version} · MIT licensed · Runs on Android and in your browser</div>
      <nav aria-label="Footer"><a href={url("app/")}>Web editor</a><Link to="/download">Download</Link><Link to="/code">Source code</Link><Link to="/privacy">Privacy</Link>{c.githubUrl ? <a href={c.githubUrl}>GitHub</a> : null}</nav>
    </div></footer>
  </>);
}
