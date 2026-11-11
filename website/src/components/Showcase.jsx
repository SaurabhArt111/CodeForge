import { useRef, useState } from "react";
import { url } from "../lib/site.js";

const TOPICS = [
  { img: "mobile-sheets.jpg", alt: "Terminal in a top sheet and an AI chat in a bottom sheet around the editor", title: "Sheets, a side sheet and pages", text: "Put the terminal on top, at the bottom or on the right, or open it as a full page. Drag the top and bottom sheets to any height; the right sheet keeps a fixed width. Swipe from the left edge for the menu." },
  { img: "mobile-terminal.jpg", alt: "A bash terminal under the editor on a phone", title: "A real terminal", text: "Run node, npm, git and python in an Alpine Linux shell. The size you choose stays put when the keyboard opens and closes." },
  { img: "mobile-ai.jpg", alt: "An AI reply with a code block under the editor", title: "AI that edits your project", text: "Chat with Claude, OpenAI, Gemini or a local model. Tap Apply on a suggested change to review the diff and write it to the file, or switch to agent mode to let it work through your project." },
  { img: "mobile-crashes.jpg", alt: "A list of crash reports", title: "A crash recorder", text: "If something stops, CodeForge saves what happened: the error, memory use and the last actions, ready to copy or share." },
  { img: "mobile-text-size.jpg", alt: "The editor with larger interface text", title: "Text size for everything", text: "One setting scales menus, tabs, panels, the editor and the terminal together. Phones start at size 12, tablets at 14." },
  { img: "desktop.jpeg", wide: true, alt: "CodeForge on a laptop with explorer, editor and terminal", title: "On a tablet or laptop too", text: "With room to spare you get a menu bar, activity bar, side bar, bottom panel and a right sheet, laid out like a desktop editor." },
];

export default function Showcase() {
  const [i, setI] = useState(0); const refs = useRef([]); const t = TOPICS[i];
  const key = (e, n) => { const d = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0; if (d) { e.preventDefault(); const k = (n + d + TOPICS.length) % TOPICS.length; setI(k); refs.current[k]?.focus(); } };
  return (
    <div className="show">
      <div className="tabs" role="tablist" aria-label="Features">
        {TOPICS.map((x, n) => (
          <button key={x.img} ref={(el) => (refs.current[n] = el)} role="tab" aria-selected={n === i} tabIndex={n === i ? 0 : -1} onClick={() => setI(n)} onKeyDown={(e) => key(e, n)}><b>{x.title}</b><span>{x.text}</span></button>
        ))}
      </div>
      <div className="viewer">
        {t.wide
          ? <img className="wide" src={url("assets/shots/" + t.img)} alt={t.alt} width="1280" height="800" />
          : <div className="phone"><img id="viewer-img" src={url("assets/shots/" + t.img)} width="412" height="860" alt={t.alt} loading="lazy" /></div>}
      </div>
    </div>
  );
}
