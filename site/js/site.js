// Small, dependency-free behaviour shared by all pages: config-driven links, APK status, tabs, copy buttons.
(function () {
  const C = window.CF_SITE || {};
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const base = document.currentScript ? new URL(".", document.currentScript.src).href.replace(/js\/$/, "") : "";
  const go = (p) => new URL(p, base).href;

  // ---- links controlled by site-config.js
  $$("[data-cf=version]").forEach((e) => (e.textContent = C.version || ""));
  $$("[data-cf=github]").forEach((e) => { if (C.githubUrl) { e.href = C.githubUrl; e.hidden = false; } else e.hidden = true; });
  $$("[data-cf=email]").forEach((e) => { if (C.contactEmail) { e.href = "mailto:" + C.contactEmail; e.textContent = C.contactEmail; e.hidden = false; } else e.hidden = true; });
  $$("[data-cf=play]").forEach((e) => {
    if (C.playStoreUrl) { e.href = C.playStoreUrl; e.removeAttribute("aria-disabled"); e.querySelector("[data-cf=play-state]")?.replaceChildren(); }
    else { e.removeAttribute("href"); e.setAttribute("aria-disabled", "true"); const s = e.querySelector("[data-cf=play-state]"); if (s) s.textContent = "Coming soon"; }
  });

  // ---- APK: downloads/apk.json is written by tools/site/build-site.sh when an APK is available
  const apk = (async () => {
    try { const r = await fetch(go("downloads/apk.json"), { cache: "no-store" }); if (r.ok) { const j = await r.json(); if (j && j.file) return j; } } catch {}
    if (C.apkUrl) return { url: C.apkUrl, external: true };
    return null;
  })();
  apk.then((a) => {
    $$("[data-cf=apk]").forEach((e) => {
      if (a) { e.href = a.external ? a.url : go("downloads/" + a.file); if (!a.external) e.setAttribute("download", a.file); e.removeAttribute("aria-disabled"); }
      else { e.removeAttribute("href"); e.setAttribute("aria-disabled", "true"); }
    });
    $$("[data-cf=apk-status]").forEach((e) => {
      if (a) { e.className = "status ok"; e.textContent = "Ready to download"; } else { e.className = "status wait"; e.textContent = "APK not uploaded yet"; }
    });
    const set = (k, v) => $$(`[data-cf=${k}]`).forEach((e) => { if (v) { e.textContent = v; e.closest("[data-cf-row]")?.removeAttribute("hidden"); } });
    if (a?.size) set("apk-size", (a.size / 1048576).toFixed(1) + " MB");
    if (a?.sha256) set("apk-sha", a.sha256);
    if (a?.file) set("apk-file", a.file);
    $$("[data-cf=apk-hint]").forEach((e) => (e.hidden = !!a));
  });

  // ---- showcase tabs (arrow keys move between tabs)
  $$("[data-tabs]").forEach((root) => {
    const tabs = $$("[role=tab]", root), img = $(root.dataset.tabs);
    function pick(t, focus) {
      tabs.forEach((x) => x.setAttribute("aria-selected", String(x === t)));
      img.src = go(t.dataset.img); img.alt = t.dataset.alt || ""; img.closest(".viewer").querySelector(".phone,.wide-frame")?.classList.toggle("is-wide", !!t.dataset.wide);
      const ph = img.closest(".phone"); if (ph) ph.style.display = t.dataset.wide ? "none" : ""; const w = document.getElementById("viewer-wide"); if (w) { w.style.display = t.dataset.wide ? "block" : "none"; if (t.dataset.wide) { w.src = go(t.dataset.img); w.alt = t.dataset.alt || ""; } }
      if (focus) t.focus();
    }
    tabs.forEach((t, i) => {
      t.addEventListener("click", () => pick(t));
      t.addEventListener("keydown", (e) => { const d = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0; if (d) { e.preventDefault(); pick(tabs[(i + d + tabs.length) % tabs.length], true); } });
    });
    function $(s) { return document.querySelector(s); }
  });

  // ---- copy buttons on terminal-style blocks
  $$(".term[data-copy]").forEach((b) => {
    const btn = document.createElement("button"); btn.type = "button"; btn.textContent = "Copy"; b.append(btn);
    btn.addEventListener("click", async () => { try { await navigator.clipboard.writeText(b.dataset.copy); btn.textContent = "Copied"; } catch { btn.textContent = "Select and copy"; } setTimeout(() => (btn.textContent = "Copy"), 1600); });
  });
})();
