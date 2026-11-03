const { launch } = require("./lib"); const fs = require("fs");
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
for (const f of ["state.json", "settings.json"]) fs.rmSync("/tmp/cf-dev/cf/" + f, { force: true });
(async () => {
  const { browser, page, logs } = await launch({ mobile: true });
  await page.waitForFunction(() => window.__cfReady || window.__cfError, null, { timeout: 40000 });
  ok(await page.evaluate(() => !!window.__cfReady), "mobile boot");
  await page.screenshot({ path: "/tmp/cf-dev/m1.png" });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  ok(!overflow, "no horizontal overflow");
  await page.evaluate(async () => { const m = await import("/js/main.js"); await m.openFolder("/tmp/cf-dev/home/proj"); });
  await page.tap('#bottomnav [data-nav="explorer"]'); await page.waitForSelector("#sidebar.open");
  await page.screenshot({ path: "/tmp/cf-dev/m2.png" });
  await page.tap('#view-explorer .row[data-path$="/index.html"]');
  await page.waitForSelector(".monaco-editor .view-lines"); ok(!(await page.evaluate(() => document.querySelector("#sidebar").classList.contains("open"))), "drawer closes after opening file");
  await page.tap('#bottomnav [data-nav="terminal"]'); await page.waitForSelector(".xterm-screen");
  await page.waitForTimeout(800); await page.screenshot({ path: "/tmp/cf-dev/m3.png" });
  await page.tap('#bottomnav [data-nav="more"]'); await page.waitForSelector(".ctx"); await page.screenshot({ path: "/tmp/cf-dev/m4.png" });
  await page.keyboard.press("Escape"); await page.evaluate(() => document.querySelector(".ctx-back")?.click());
  // key bar visible when keyboard simulated
  await page.evaluate(() => { document.body.classList.add("kbd-open"); document.getElementById("keybar").classList.remove("hidden"); });
  await page.screenshot({ path: "/tmp/cf-dev/m5.png" });
  await page.evaluate(async () => { const { N } = await import("/js/core/bridge.js"); for (const t of await N.term.list()) await N.term.close(t.id); });
  console.log(logs.filter((l) => !/Failed to load resource|reqfail|iframe which has both/.test(l)).slice(0, 10).join("\n"));
  await browser.close(); console.log(fails ? `${fails} FAILED` : "ALL OK");
})().catch((e) => { console.error(e); process.exit(1); });
