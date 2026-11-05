// Responsive audit: several phone/tablet viewports × key screens. Fails on page-level horizontal overflow or elements poking out of the viewport.
const { chromium } = require("playwright");
const fs = require("fs"); fs.mkdirSync("/tmp/resp", { recursive: true });
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
const VIEWPORTS = { "360x740": [360, 740, true], "412x860": [412, 860, true], "820x1180": [820, 1180, true], "860x390-landscape": [860, 390, true], "1280x800": [1280, 800, false] };
(async () => {
  for (const [name, [w, h, touch]] of Object.entries(VIEWPORTS)) {
    const browser = await chromium.launch(); const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
    const page = await ctx.newPage(); await page.goto("http://127.0.0.1:8780/"); await page.waitForFunction(() => window.__cfReady, null, { timeout: 60000 });
    await page.evaluate(async () => { const m = await import("/js/main.js"); await m.openFolder("/tmp/cf-dev/home/proj"); const ed = await import("/js/ui/editor.js"); await ed.openFile("/tmp/cf-dev/home/proj/package.json"); });
    await page.waitForTimeout(700);
    const check = async (label) => {
      const r = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight; const bad = [];
        for (const e of document.querySelectorAll("body *")) {
          const cs = getComputedStyle(e); if (cs.display === "none" || cs.visibility === "hidden" || cs.position === "fixed" && e.closest("#boot")) continue;
          if (e.closest("#boot,.monaco-editor,.monaco-aria-container,.xterm,.hidden,[hidden]") || e.matches(".monaco-aria-container") || (e.closest("#sidebar") && !document.getElementById("sidebar").classList.contains("open") && innerWidth <= 760)) continue;
          const r = e.getBoundingClientRect(); if (!r.width || !r.height) continue;
          // clipped ancestors don't count; only things that stick out of the window and are not inside a scroller
          let a = e.parentElement, inScroller = false; while (a && a !== document.body) { const o = getComputedStyle(a); if (/(auto|scroll|hidden)/.test(o.overflowX)) { const ar = a.getBoundingClientRect(); if (ar.right <= vw + 1) { inScroller = true; break; } } a = a.parentElement; }
          if (!inScroller && (r.right > vw + 2 || r.left < -2) && !/^(HTML|BODY)$/.test(e.tagName)) bad.push(e.tagName + "." + String(e.className?.baseVal ?? e.className).slice(0, 40) + ` ${Math.round(r.left)}..${Math.round(r.right)}`);
        }
        return { over: document.documentElement.scrollWidth - vw, bad: bad.slice(0, 5), n: bad.length };
      });
      ok(r.over <= 1 && r.n === 0, `[${name}] ${label}: overflow=${r.over} offenders=${r.n} ${r.bad.join(" | ")}`);
      await page.screenshot({ path: `/tmp/resp/${name}-${label.replace(/\W+/g, "_")}.png` });
    };
    await check("editor");
    await page.evaluate(async () => (await import("/js/ui/panel.js")).show("terminal")); await page.waitForTimeout(800); await check("terminal sheet");
    await page.evaluate(async () => { const p = await import("/js/ui/panel.js"); p.move("ai", "top"); p.show("ai"); }); await page.waitForTimeout(600); await check("top+bottom sheets");
    await page.evaluate(async () => (await import("/js/ui/panel.js")).resetLayout()); await page.waitForTimeout(300);
    for (const v of ["explorer", "search", "git", "run", "extensions"]) { await page.evaluate(async (v) => (await import("/js/main.js")).showView(v), v); await page.waitForTimeout(500); await check("view " + v); }
    await page.evaluate(async () => { (await import("/js/ui/settingsview.js")).open(); }); await page.waitForTimeout(700); await check("settings");
    await page.evaluate(async () => { (await import("/js/ui/crashes.js")).openReports(); }); await page.waitForTimeout(500); await check("crash reports");
    await browser.close();
  }
  console.log(fails ? fails + " FAILED" : "ALL OK"); process.exit(fails ? 1 : 0);
})();
