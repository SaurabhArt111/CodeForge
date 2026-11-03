const { launch } = require("./lib");
(async () => {
  const { browser, page, logs } = await launch();
  await page.waitForFunction(() => window.__cfReady, null, { timeout: 30000 });
  await page.click("#btn-term"); await page.waitForTimeout(3000);
  console.log("term bodies:", await page.locator(".term-body").count());
  console.log(await page.evaluate(async () => JSON.stringify(await (await import("/js/core/bridge.js")).N.term.list())).then(s=>s.slice(0,300)));
  console.log(logs.filter(l=>!/features\/|Failed to load|reqfail/.test(l)).join("\n"));
  await browser.close();
})();
