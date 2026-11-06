import { useEffect, useState } from "react";

/** Settings from public/site-config.js (the Node server regenerates it from environment variables). */
export const config = () => window.CF_SITE || {};
/** A URL under the site's base path, for files that are not routes (web editor, downloads, assets). */
export const url = (p) => import.meta.env.BASE_URL + String(p).replace(/^\//, "");

/** downloads/apk.json is written by scripts/build-site.mjs when an APK was available at build time. */
export function useApk() {
  const [apk, setApk] = useState(undefined);   // undefined = checking, null = none
  useEffect(() => {
    let live = true;
    (async () => {
      try { const r = await fetch(url("downloads/apk.json"), { cache: "no-store" }); if (r.ok) { const j = await r.json(); if (j?.file) return live && setApk({ ...j, href: url("downloads/" + j.file) }); } } catch { /* offline / static host without the file */ }
      const c = config(); if (live) setApk(c.apkUrl ? { href: c.apkUrl, external: true } : null);
    })();
    return () => { live = false; };
  }, []);
  return apk;
}
