const { launch } = require("./lib");
(async () => {
  const { browser, page, logs } = await launch();
  try { await page.waitForFunction(() => window.__cfReady || window.__cfError, null, { timeout: 30000 }); } catch (e) { console.log("TIMEOUT waiting for ready"); }
  console.log("ready:", await page.evaluate(() => !!window.__cfReady), "err:", await page.evaluate(() => window.__cfError || "-"));
  console.log("boot-msg:", await page.textContent("#boot-msg"), "|", (await page.textContent("#boot-err")).slice(0, 600));
  await page.screenshot({ path: "/tmp/cf-dev/shot1.png" });
  console.log(logs.slice(0, 30).join("\n"));
  await browser.close();
})();
