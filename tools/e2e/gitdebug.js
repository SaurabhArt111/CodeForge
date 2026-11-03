const { launch } = require("./lib"); const fs = require("fs");
fs.rmSync("/tmp/cf-dev/cf/state.json", { force: true });
fs.rmSync("/tmp/cf-dev/home/gt", { recursive: true, force: true }); fs.mkdirSync("/tmp/cf-dev/home/gt"); fs.writeFileSync("/tmp/cf-dev/home/gt/a.txt", "one\n");
(async () => {
  const { browser, page, logs } = await launch();
  await page.waitForFunction(() => window.__cfReady, null, { timeout: 40000 });
  const r = await page.evaluate(async () => {
    const m = await import("/js/main.js"); await m.openFolder("/tmp/cf-dev/home/gt");
    const g = window.git; const { fs } = await import("/js/features/gitfs.js"); const base = { fs, dir: "/tmp/cf-dev/home/gt" };
    await g.init({ ...base, defaultBranch: "main" });
    try { return JSON.stringify(await g.statusMatrix(base)); } catch (e) { return "ERR " + e.message + " " + (e.stack||"").slice(0,400); }
  });
  console.log(r); console.log(logs.slice(0,10).join("\n"));
  await browser.close();
})();
