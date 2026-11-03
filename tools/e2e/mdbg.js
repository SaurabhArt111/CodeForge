const { launch } = require("./lib");
(async () => {
  const { browser, page, logs } = await launch({ mobile: true });
  await page.waitForFunction(() => window.__cfReady, null, { timeout: 40000 });
  await page.tap('#bottomnav [data-nav="more"]'); await page.waitForTimeout(800);
  console.log("ctx count", await page.locator(".ctx").count());
  await page.screenshot({ path: "/tmp/cf-dev/m4.png" });
  console.log(logs.filter((l) => !/Failed to load resource|reqfail|iframe which has both/.test(l)).join("\n"));
  await browser.close();
})();
