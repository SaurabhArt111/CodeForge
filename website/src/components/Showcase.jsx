import { useEffect, useRef, useState } from "react";
import { url } from "../lib/site.js";
import { reducedMotion } from "./Fx.jsx";

const TOPICS = [
  { img: "mobile-sheets.jpg", alt: "Terminal in a top sheet and an AI chat in a bottom sheet around the editor", title: "Sheets, a side sheet and pages", text: "Put the terminal on top, at the bottom or on the right, or open it as a full page. Drag the top and bottom sheets to any height; the right sheet keeps a fixed width. Swipe from the left edge for the menu." },
  { img: "mobile-terminal.jpg", alt: "A bash terminal under the editor on a phone", title: "A real terminal", text: "Run node, npm, git and python in Alpine, Debian or Ubuntu, or switch to full-screen Terminal mode. The size you choose stays put when the keyboard opens and closes." },
  { img: "mobile-ai.jpg", alt: "An AI reply with a code block under the editor", title: "AI that edits your project", text: "Chat with Claude, OpenAI, Gemini or a local model. Tap Apply on a suggested change to review the diff and write it to the file, or switch to agent mode to let it work through your project." },
  { img: "mobile-crashes.jpg", alt: "A list of crash reports", title: "A crash recorder", text: "If something stops, CodeForge saves what happened: the error, memory use and the last actions, ready to copy or share." },
  { img: "mobile-text-size.jpg", alt: "The editor with larger interface text", title: "Text size for everything", text: "One setting scales menus, tabs, panels, the editor and the terminal together. Phones start at size 12, tablets at 14." },
  { img: "desktop.jpg", wide: true, alt: "CodeForge on a laptop with explorer, editor and terminal", title: "On a tablet or laptop too", text: "With room to spare you get a menu bar, activity bar, side bar, bottom panel and a right sheet, laid out like a desktop editor." },
];
const N = TOPICS.length;

/**
 * "Built for a small screen first": the section stays pinned while you scroll through it, and each stretch of
 * scrolling moves to the next topic, one by one. Clicking a topic (or the dots on a phone) scrolls to it.
 */
export default function Showcase({ title, intro, after }) {
  const outer = useRef(null);
  const [i, setI] = useState(0);
  const [p, setP] = useState(0);   // progress through the current topic, 0..1

  useEffect(() => {
    let raf = 0;
    const measure = () => {
      raf = 0;
      const el = outer.current; if (!el) return;
      const r = el.getBoundingClientRect();
      const run = el.offsetHeight - window.innerHeight;
      const f = run > 0 ? Math.min(Math.max(-r.top / run, 0), 0.9999) : 0;
      const x = f * N, k = Math.floor(x);
      setI(k); setP(x - k);
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(measure); };
    measure();
    window.addEventListener("scroll", on, { passive: true }); window.addEventListener("resize", on);
    return () => { window.removeEventListener("scroll", on); window.removeEventListener("resize", on); cancelAnimationFrame(raf); };
  }, []);

  const go = (n) => {
    const el = outer.current; if (!el) return;
    const run = el.offsetHeight - window.innerHeight;
    const top = el.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: top + run * ((n + 0.08) / N), behavior: reducedMotion() ? "auto" : "smooth" });
  };
  const key = (e, n) => {
    const d = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
    if (d) { e.preventDefault(); const k = Math.min(N - 1, Math.max(0, n + d)); go(k); document.getElementById("sc-tab-" + k)?.focus(); }
  };
  const t = TOPICS[i];

  return (
    <><div className="scrolly" ref={outer} style={{ "--steps": N }}>
      <div className="scrolly-pin"><div className="wrap">
        <div className="scrolly-head">{title}{intro}</div>
        <div className="show">
          <div className="tabs" role="tablist" aria-label="Features" aria-orientation="vertical">
            {TOPICS.map((x, n) => (
              <button key={x.img} id={"sc-tab-" + n} role="tab" aria-selected={n === i} aria-controls="sc-viewer" tabIndex={n === i ? 0 : -1}
                onClick={() => go(n)} onKeyDown={(e) => key(e, n)}>
                <b>{x.title}</b><span>{x.text}</span>
                <i className="tab-bar" style={{ transform: `scaleX(${n < i ? 1 : n === i ? p : 0})` }} />
              </button>
            ))}
          </div>
          <div className="viewer" id="sc-viewer" role="tabpanel" aria-label={t.title}>
            <div className={"phone" + (t.wide ? " off" : "")}>
              {TOPICS.filter((x) => !x.wide).map((x) => <img key={x.img} className={x === t ? "on" : ""} src={url("assets/shots/" + x.img)} width="412" height="860" alt={x === t ? x.alt : ""} loading="lazy" decoding="async" />)}
            </div>
            <div className={"laptop-frame" + (t.wide ? " on" : "")}>
              {/* real desktop screenshots, one per site theme */}
              <img className="only-dark" src={url("assets/guide/desktop-ide-dark.jpg")} width="1280" height="780" alt={t.wide ? t.alt : ""} loading="lazy" decoding="async" />
              <img className="only-light" src={url("assets/guide/desktop-ide-light.jpg")} width="1280" height="780" alt={t.wide ? t.alt : ""} loading="lazy" decoding="async" />
            </div>
          </div>
          <div className="sc-mobile" aria-live="polite">
            <p className="sc-count">{i + 1} / {N}</p>
            <h3>{t.title}</h3><p>{t.text}</p>
            <div className="sc-dots">{TOPICS.map((x, n) => <button key={x.img} aria-label={"Show " + x.title} aria-current={n === i} onClick={() => go(n)} />)}</div>
          </div>
        </div>
      </div></div>
    </div>
    {after ? <div className="wrap scrolly-after-wrap">{after}</div> : null}</>
  );
}
