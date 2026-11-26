import { useEffect, useState } from "react";

// Light / Dark / System for the website. The choice is kept in localStorage ("cf.site.theme");
// index.html applies it before the first paint, this keeps it in sync and follows the system when set to System.
const KEY = "cf.site.theme";
const MODES = ["system", "light", "dark"];
const LABEL = { system: "System", light: "Light", dark: "Dark" };

const read = () => { try { return MODES.includes(localStorage.getItem(KEY)) ? localStorage.getItem(KEY) : "system"; } catch { return "system"; } };
const mq = () => window.matchMedia?.("(prefers-color-scheme: dark)");

function apply(mode) {
  const dark = mode === "dark" || (mode === "system" && (mq()?.matches ?? true));
  const el = document.documentElement;
  el.dataset.theme = dark ? "dark" : "light"; el.dataset.themeMode = mode;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#1f1f1f" : "#ffffff");
}

export function useTheme() {
  const [mode, setMode] = useState(read);
  useEffect(() => {
    apply(mode);
    try { localStorage.setItem(KEY, mode); } catch { /* private mode */ }
    window.dispatchEvent(new CustomEvent("cf-theme", { detail: mode }));   // keep the header button and the footer picker in step
    const m = mq(); const on = () => mode === "system" && apply("system");
    m?.addEventListener?.("change", on);
    const sync = (e) => { if (e.key === KEY) setMode(read()); };   // another tab changed it
    const same = (e) => { if (e.detail !== mode) setMode(e.detail); };
    window.addEventListener("storage", sync); window.addEventListener("cf-theme", same);
    return () => { m?.removeEventListener?.("change", on); window.removeEventListener("storage", sync); window.removeEventListener("cf-theme", same); };
  }, [mode]);
  return [mode, setMode];
}

const Sun = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>);
const Moon = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>);
const Auto = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8m-4-4v4" /></svg>);

/** Header button: cycles System → Light → Dark. */
export function ThemeButton() {
  const [mode, setMode] = useTheme();
  const next = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
  return (<button type="button" className="theme-btn" onClick={() => setMode(next)}
    title={`Theme: ${LABEL[mode]} (switch to ${LABEL[next]})`} aria-label={`Theme: ${LABEL[mode]}. Switch to ${LABEL[next]}`}>
    {mode === "light" ? <Sun /> : mode === "dark" ? <Moon /> : <Auto />}
  </button>);
}

/** Footer: all three choices visible at once. */
export function ThemePicker() {
  const [mode, setMode] = useTheme();
  return (<div className="theme-pick" role="group" aria-label="Theme">
    {MODES.map((m) => <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>{LABEL[m]}</button>)}
  </div>);
}
