// e2e (dev host): ZIP options dialog (exclusions) + the Projects screen.
const { launch } = require("./lib"); const fs = require("fs");
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
for (const f of ["state.json", "settings.json"]) fs.rmSync("/tmp/cf-dev/cf/" + f, { force: true });
const H = "/tmp/cf-dev/home";
fs.rmSync(H + "/zt", { recursive: true, force: true }); fs.rmSync(H + "/zt.zip", { force: true });
for (const [f, c] of [["zt/src/a.js", "x"], ["zt/package.json", '{"dependencies":{"react":"1","vite":"1"}}'], ["zt/node_modules/m/i.js", "x"], ["zt/.git/HEAD", "ref"], ["zt/.github/w.yml", "x"], ["zt/venv/pyvenv.cfg", "x"], ["zt/debug.log", "x"], ["zt/dist/o.js", "x"]]) { fs.mkdirSync(require("path").dirname(H + "/" + f), { recursive: true }); fs.writeFileSync(H + "/" + f, c); }
(async () => {
  for (const mobile of [false, true]) {
    const tag = mobile ? "[phone] " : "[desktop] ";
    const { browser, page, logs } = await launch({ mobile });
    await page.waitForFunction(() => window.__cfReady || window.__cfError, null, { timeout: 40000 });
    await page.evaluate(async () => { const m = await import("/js/main.js"); await m.openFolder("/tmp/cf-dev/home/zt"); });
    fs.rmSync(H + "/zt.zip", { force: true });
    const list = () => page.evaluate(async () => (await (await import("/js/core/bridge.js")).N.archive.listZip("/tmp/cf-dev/home/zt.zip")).map((e) => e.name).sort());
    // --- recommended defaults: node_modules/.git/venv/log out; .github/dist stay
    await page.evaluate(() => { import("/js/ui/commands.js").then((m) => m.run("file.zipProject")); });
    await page.waitForSelector(".zipdlg .zip-row");
    ok(await page.locator(".zipdlg .zip-row").count() === 8, tag + "zip dialog lists 8 exclusion presets");
    await page.waitForTimeout(500);
    ok(await page.evaluate(() => [...document.querySelectorAll(".zipdlg .zip-row")].filter((r) => !r.querySelector(".zip-found").classList.contains("hidden")).map((r) => r.querySelector(".zip-name").textContent).join("|")) === "node_modules|.git|.github|Python environments & caches|Build output|System files & logs", tag + "dialog marks the folders that exist in this project");
    await page.click('.zipdlg button:has-text("Compress")'); await page.waitForTimeout(1500);
    let names = fs.existsSync(H + "/zt.zip") ? await list() : [];
    ok(names.includes("zt/src/a.js") && names.includes("zt/package.json") && names.includes("zt/.github/w.yml") && names.includes("zt/dist/o.js"), tag + "recommended zip keeps source, .github and dist: " + names.join(","));
    ok(!names.some((n) => /node_modules|\.git\/|^zt\/\.git$|venv|debug\.log/.test(n)), tag + "recommended zip leaves out node_modules, .git, venv, logs");
    await page.evaluate(() => document.querySelector(".modal-wrap")?.remove());
    // --- include everything
    fs.rmSync(H + "/zt.zip", { force: true });
    await page.evaluate(() => { import("/js/ui/commands.js").then((m) => m.run("file.zipProject")); });
    await page.waitForSelector(".zipdlg .zip-row");
    ok(await page.evaluate(() => [...document.querySelectorAll(".zipdlg .zip-row input")].filter((c) => c.checked).length === 4), tag + "last choice remembered (4 presets on)");
    await page.click('.zipdlg button:has-text("Include everything")');
    await page.click('.zipdlg button:has-text("Compress")'); await page.waitForTimeout(1500);
    names = fs.existsSync(H + "/zt.zip") ? await list() : [];
    ok(names.includes("zt/node_modules/m/i.js") && names.includes("zt/.git/HEAD") && names.includes("zt/debug.log"), tag + "'Include everything' keeps node_modules and .git");
    await page.evaluate(() => document.querySelector(".modal-wrap")?.remove());
    // --- custom pattern + .github
    fs.rmSync(H + "/zt.zip", { force: true });
    await page.evaluate(() => { import("/js/ui/commands.js").then((m) => m.run("file.zipProject")); });
    await page.waitForSelector(".zipdlg .zip-row");
    await page.click('.zipdlg button:has-text("Include everything")');
    await page.locator('.zipdlg .zip-row:has-text(".github") input').check();
    await page.fill('.zipdlg input[placeholder^="More names"]', "src");
    await page.click('.zipdlg button:has-text("Compress")'); await page.waitForTimeout(1500);
    names = fs.existsSync(H + "/zt.zip") ? await list() : [];
    ok(!names.some((n) => /\.github|zt\/src/.test(n)) && names.includes("zt/package.json"), tag + "custom pattern + .github skipped: " + names.join(","));
    await page.evaluate(() => document.querySelector(".modal-wrap")?.remove());

    // --- projects screen
    await page.evaluate(async () => { const { settings } = await import("/js/core/settings.js"); settings.addRecent("/tmp/cf-dev/home/zt"); settings.addRecent("/tmp/cf-dev/home/gone"); });
    await page.evaluate(() => { import("/js/ui/commands.js").then((m) => m.run("file.openFolder")); });
    await page.waitForSelector(".projects .pj-card"); await page.waitForTimeout(800);
    const cards = await page.evaluate(() => [...document.querySelectorAll(".projects .pj-card")].map((c) => c.querySelector(".pj-name").textContent + ":" + [...c.querySelectorAll(".pj-tag")].map((t) => t.textContent).join("+")));
    ok(cards.some((c) => /^zt:.*Node.*React.*Vite|^zt:.*Node.*Git/.test(c) || c.startsWith("zt:") && /Node/.test(c) && /React/.test(c)), tag + "project card shows detected type tags: " + cards.join(" | "));
    ok(cards.some((c) => c.startsWith("gone:") && /not found/.test(c)) || await page.locator(".pj-card.missing").count() === 1, tag + "missing folders are flagged");
    ok(await page.locator(".projects .pj-act").count() === 6, tag + "6 ways to bring a project in");
    await page.fill(".projects input[type=search]", "zt"); await page.waitForTimeout(200);
    ok(await page.locator(".projects .pj-card").count() >= 1 && !(await page.locator('.projects .pj-name:text-is("gone")').count()), tag + "search filters the list");
    const fit = await page.evaluate(() => { const m = document.querySelector(".modal.projects").getBoundingClientRect(); return m.right <= innerWidth + 1 && m.bottom <= innerHeight + 1; });
    ok(fit, tag + "projects screen fits the screen");
    await page.click('.projects .pj-card:has(.pj-name:text-is("zt"))'); await page.waitForTimeout(800);
    ok(await page.evaluate(async () => (await import("/js/ui/workspace.js")).ws.root === "/tmp/cf-dev/home/zt") && await page.locator(".projects").count() === 0, tag + "tapping a project opens it");
    const bad = logs.filter((l) => !/favicon|iframe|ERR_|net::|Failed to load resource|git refresh/i.test(l));
    ok(!bad.length, tag + "no console errors" + (bad.length ? " " + JSON.stringify(bad.slice(0, 3)) : ""));
    await browser.close();
    for (const f of ["state.json", "settings.json"]) fs.rmSync("/tmp/cf-dev/cf/" + f, { force: true });
  }
  console.log(fails ? fails + " FAILED" : "ALL PASSED"); process.exit(fails ? 1 : 0);
})();
