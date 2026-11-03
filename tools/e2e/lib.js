const { chromium } = require("playwright");
async function launch({ mobile = false, url = "http://127.0.0.1:8780/" } = {}) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext(mobile ? { viewport: { width: 412, height: 860 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true } : { viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const logs = [];
  page.on("console", (m) => { if (["error", "warning"].includes(m.type())) logs.push(m.type() + ": " + m.text()); });
  page.on("pageerror", (e) => logs.push("pageerror: " + e.message));
  page.on("requestfailed", (r) => logs.push("reqfail: " + r.url()));
  page.on("response", (r) => { if (r.status() >= 400) logs.push(`http ${r.status()}: ${r.url()}`); });
  await page.goto(url);
  return { browser, ctx, page, logs };
}
module.exports = { launch };
