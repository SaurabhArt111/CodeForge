// e2e (dev host): a page that loads .jsx/.tsx sources from the static live server gets the "needs a dev server" hint instead of a silent blank page.
const { launch } = require("./lib"); const fs = require("fs");
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
fs.rmSync("/tmp/cf-dev/home/vt", { recursive: true, force: true }); fs.mkdirSync("/tmp/cf-dev/home/vt/src", { recursive: true });
fs.writeFileSync("/tmp/cf-dev/home/vt/index.html", `<!doctype html><html><head><title>V</title></head><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>`);
fs.writeFileSync("/tmp/cf-dev/home/vt/src/main.jsx", "console.log('x')");
fs.writeFileSync("/tmp/cf-dev/home/vt/plain.html", `<!doctype html><html><head></head><body><p id="p">plain</p></body></html>`);
(async () => {
  const { browser, page } = await launch(); await page.waitForFunction(() => window.__cfReady, null, { timeout: 40000 });
  const s = await page.evaluate(async () => (await import("/js/core/bridge.js")).N.live.start({ root: "/tmp/cf-dev/home/vt", port: 5611, spa: true })); 
  const v = await browser.newContext().then((c) => c.newPage()); await v.goto(s.url); await v.waitForTimeout(800);
  ok(await v.locator("text=needs a dev server").count() === 1 && (await v.textContent("code")).includes("/src/main.jsx"), "static live server shows the 'needs a dev server' hint for /src/main.jsx");
  await v.goto(s.url + "plain.html"); await v.waitForTimeout(500); ok(await v.locator("text=needs a dev server").count() === 0, "no hint on a plain page");
  await page.evaluate(async () => (await import("/js/core/bridge.js")).N.live.stop(5611));
  await browser.close(); console.log(fails ? fails + " FAILED" : "ALL PASSED"); process.exit(fails ? 1 : 0);
})();
