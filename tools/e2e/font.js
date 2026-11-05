// Global text size: one setting scales UI chrome, editor and terminal.
const { launch } = require("./lib");
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
(async () => {
  for (const mobile of [false, true]) {
    const tag = mobile ? "[mobile] " : "[desktop] ";
    const { browser, page, logs } = await launch({ mobile });
    await page.waitForFunction(() => window.__cfReady || window.__cfError, null, { timeout: 40000 });
    await page.evaluate(async () => { const m = await import("/js/main.js"); await m.openFolder("/tmp/cf-dev/home/proj"); const ed = await import("/js/ui/editor.js"); await ed.openFile("/tmp/cf-dev/home/proj/package.json"); const p = await import("/js/ui/panel.js"); p.show("terminal"); });
    await page.waitForSelector(".monaco-editor .view-line"); await page.waitForSelector("#panel .xterm-screen"); await page.waitForTimeout(500);
    const meas = () => page.evaluate(() => {
      const fs = (sel) => { const e = document.querySelector(sel); return e ? parseFloat(getComputedStyle(e).fontSize) : 0; };
      const hgt = (sel) => document.querySelector(sel)?.getBoundingClientRect().height || 0;
      return { statusFont: fs("#statusbar"), tabFont: fs(".tab"), editorLine: document.querySelector(".monaco-editor .view-line span")?.getBoundingClientRect().height || 0, term: document.querySelector("#panel .xterm-rows > div")?.getBoundingClientRect().height || 0, title: hgt("#titlebar"), status: hgt("#statusbar"), sheet: hgt("#panel .sheet-head"), overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    const a = await meas();
    await page.evaluate(async () => (await import("/js/core/settings.js")).settings.set("ui.fontScale", 150)); await page.waitForTimeout(700);
    const b = await meas();
    ok(b.statusFont > a.statusFont * 1.4, tag + `status bar text scales ${a.statusFont}→${b.statusFont}`);
    ok(b.tabFont > a.tabFont * 1.4, tag + `tab text scales ${a.tabFont}→${b.tabFont}`);
    ok(b.editorLine > a.editorLine * 1.35, tag + `editor text scales ${Math.round(a.editorLine)}→${Math.round(b.editorLine)}`);
    ok(b.term > a.term * 1.35, tag + `terminal text scales ${Math.round(a.term)}→${Math.round(b.term)}`);
    ok(b.title > a.title * 1.3 && b.status > a.status * 1.3 && b.sheet > a.sheet * 1.3, tag + `bars grow with the text: title ${a.title}→${b.title}, status ${a.status}→${b.status}, sheet head ${a.sheet}→${b.sheet}`);
    ok(b.overflowX <= 1, tag + "no horizontal page overflow at 150%: " + b.overflowX);
    await page.screenshot({ path: `/tmp/font-${mobile ? "m" : "d"}-150.png` });
    await page.evaluate(async () => (await import("/js/core/settings.js")).settings.set("ui.fontScale", 80)); await page.waitForTimeout(600);
    const c = await meas(); ok(c.statusFont < a.statusFont && c.editorLine < a.editorLine, tag + "shrinks at 80%");
    await page.evaluate(async () => (await import("/js/core/settings.js")).settings.set("ui.fontScale", 100)); await page.waitForTimeout(600);
    const d = await meas(); ok(Math.abs(d.statusFont - a.statusFont) < 0.5 && Math.abs(d.editorLine - a.editorLine) < 1, tag + "back to 100%");
    const bad = logs.filter((l) => !/sandbox|reqfail: http:\/\/127\.0\.0\.1:(5500|5173)|workerMain/.test(l)); ok(!bad.length, tag + "no console errors" + (bad.length ? ": " + bad.slice(0, 2).join("|") : ""));
    await browser.close();
  }
  console.log(fails ? fails + " FAILED" : "ALL OK"); process.exit(fails ? 1 : 0);
})();
