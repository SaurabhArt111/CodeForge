// Boot timing with a throttled CPU (≈ mid-range phone). Prints milestones; fails if the app isn't usable within budget.
const { chromium } = require("playwright");
(async () => {
  const runs = [];
  for (let i = 0; i < 3; i++) {
    const browser = await chromium.launch(); const ctx = await browser.newContext({ viewport: { width: 412, height: 860 }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage(); const cdp = await ctx.newCDPSession(page); await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    const bytes = { js: 0, css: 0, other: 0 }; page.on("response", async (r) => { try { const b = (await r.body()).length; const t = r.url(); if (/\.js(\?|$)/.test(t)) bytes.js += b; else if (/\.css/.test(t)) bytes.css += b; else bytes.other += b; } catch {} });
    const t0 = Date.now(); await page.goto("http://127.0.0.1:8780/");
    await page.waitForFunction(() => !document.getElementById("app").classList.contains("hidden"), null, { timeout: 60000 }); const tApp = Date.now() - t0;
    await page.waitForSelector(".monaco-editor, #editor-area .welcome, #editor-area", { timeout: 60000 });
    await page.waitForFunction(() => document.querySelector("#boot")?.classList.contains("done"), null, { timeout: 60000 }); const tSplash = Date.now() - t0;
    await page.waitForFunction(() => window.__cfReady, null, { timeout: 60000 }); const tReady = Date.now() - t0;
    runs.push({ app: tApp, splashGone: tSplash, ready: tReady, jsKB: Math.round(bytes.js / 1024) }); await browser.close();
  }
  const med = (k) => runs.map((r) => r[k]).sort((a, b) => a - b)[1];
  console.log(JSON.stringify({ runs, median: { app: med("app"), splashGone: med("splashGone"), ready: med("ready"), jsKB: med("jsKB") } }));
})();
