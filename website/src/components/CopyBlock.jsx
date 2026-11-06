import { useState } from "react";
export default function CopyBlock({ text, children }) {
  const [label, setLabel] = useState("Copy");
  const copy = async () => { try { await navigator.clipboard.writeText(text); setLabel("Copied"); } catch { setLabel("Select and copy"); } setTimeout(() => setLabel("Copy"), 1600); };
  return <pre className="term">{children}<button type="button" onClick={copy}>{label}</button></pre>;
}
