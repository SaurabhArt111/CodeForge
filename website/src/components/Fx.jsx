import { lazy, Suspense, useEffect, useRef, useState } from "react";

// Background effects (Originkit components in src/fx). Each one is code-split and only mounted while it is
// on or near the screen, so the first page load stays small and off-screen WebGL / GSAP work stops.
const FluidField = lazy(() => import("../fx/FluidField.tsx"));
const GauzeBlaze = lazy(() => import("../fx/GauzeBlaze.tsx"));
const TextWall = lazy(() => import("../fx/TextWall.tsx"));

export const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function InView({ className, children, margin = "300px" }) {
  const ref = useRef(null); const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el || typeof IntersectionObserver === "undefined") { setOn(true); return; }
    const io = new IntersectionObserver(([e]) => setOn(e.isIntersecting), { rootMargin: margin });
    io.observe(el); return () => io.disconnect();
  }, [margin]);
  return <div ref={ref} className={"fx " + (className || "")} aria-hidden="true">{on ? <Suspense fallback={null}>{children}</Suspense> : null}</div>;
}

/** Soft noise-warped beam of light (hero backgrounds). Light theme: the same picture, inverted by CSS. */
export function Fluid({ className = "", ...props }) {
  return <InView className={"fx-fluid " + className}><FluidField background="#030305" baseColor="#1f6feb" accentColor="#7c3aed" speed={reducedMotion() ? 20 : 70} hover={150}
    flow={{ scale: 140, warp: 110, beam: 150, glow: 300 }} {...props} style={{ minWidth: 0, minHeight: 0 }} /></InView>;
}

/** Ribbon of glowing gauze (the dark Terminal band). */
export function Gauze({ className = "", ...props }) {
  return <InView className={"fx-gauze " + className}><GauzeBlaze background="#05060c" baseColor="#3b5bff" midColor="#d946ef" accentColor="#ff7a1a" particles={220} speed={18} {...props} /></InView>;
}

/** Wall of random characters that resolves into words (footer). Colours follow the site theme. */
export function Wall({ className = "", words, ...props }) {
  return <InView className={"fx-wall " + className} margin="100px"><TextWall words={words} emptyLines={10} gap={4} loop={!reducedMotion()} stagger={0.06}
    textColor="color-mix(in srgb, var(--muted) 45%, transparent)" wordsColor="var(--ink)"
    font={{ fontFamily: "'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace", fontSize: 15, fontWeight: 400, letterSpacing: "0" }}
    transition={{ duration: 1.1, ease: "easeInOut", delay: 2.2 }} {...props} /></InView>;
}
