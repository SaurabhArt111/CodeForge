// e2e (dev host): export a .cfbundle (projects + settings, exclusions honoured) and import it again.
const { launch } = require("./lib"); const fs = require("fs"); const path = require("path");
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
for (const f of ["state.json", "settings.json"]) fs.rmSync("/tmp/cf-dev/cf/" + f, { force: true });
const H = "/tmp/cf-dev/home"; fs.rmSync(H + "/xf1", { recursive: true, force: true }); fs.rmSync(H + "/imported/xf1", { recursive: true, force: true }); fs.rmSync(H + "/imported/xf1 2", { recursive: true, force: true });
for (const f of fs.readdirSync("/tmp/cf-dev/cf")) if (f.endsWith(".cfbundle")) fs.rmSync("/tmp/cf-dev/cf/" + f);
for (const [f, c] of [["xf1/src/a.js", "console.log(1)"], ["xf1/node_modules/m/i.js", "x"], ["xf1/README.md", "# hi"]]) { fs.mkdirSync(path.dirname(H + "/" + f), { recursive: true }); fs.writeFileSync(H + "/" + f, c); }
(async () => {
  const { browser, page, logs } = await launch();
  await page.waitForFunction(() => window.__cfReady || window.__cfError, null, { timeout: 40000 });
  await page.evaluate(async () => { const { settings } = await import("/js/core/settings.js"); settings.set("editor.minimap", true); settings.set("editor.tabSize", 3); });
  await page.evaluate(() => { import("/js/ui/transfer.js").then((t) => { window.__ex = t.exportBundle(); }); });
  await page.waitForSelector(".zipdlg .xfer-top"); await page.waitForTimeout(300);
  const names = await page.evaluate(() => [...document.querySelectorAll(".xfer-top .zip-row")].map((r) => r.querySelector(".zip-name").textContent));
  ok(names.includes("xf1") && names.includes("Settings"), "export dialog lists projects + settings: " + names.slice(0, 6).join(","));
  await page.evaluate(() => { document.querySelectorAll(".xfer-top .zip-list .zip-row input").forEach((c) => { const n = c.closest(".zip-row").querySelector(".zip-name").textContent; if (n !== "xf1" && c.checked) c.click(); }); });
  await page.click('.zipdlg button:has-text("Create bundle")'); await page.waitForTimeout(2500);
  const bundle = fs.readdirSync("/tmp/cf-dev/cf").find((f) => f.endsWith(".cfbundle"));
  ok(!!bundle, "bundle file created: " + bundle);
  const JSZip = require("/home/claude/work/android/CodeForge/tools/devhost/node_modules/jszip");
  const z = await JSZip.loadAsync(fs.readFileSync("/tmp/cf-dev/cf/" + bundle)); const entries = Object.keys(z.files);
  const man = JSON.parse(await z.file("manifest.json").async("string")); const sets = JSON.parse(await z.file("settings.json").async("string"));
  ok(man.format === 1 && man.projects.join() === "xf1" && entries.includes("projects/xf1/src/a.js"), "manifest + project files inside: " + entries.filter((e) => !e.endsWith("/")).join(","));
  ok(!entries.some((e) => /node_modules/.test(e)), "node_modules left out by default");
  ok(sets["editor.minimap"] === true && sets["editor.tabSize"] === 3 && !JSON.stringify(sets).includes("key"), "settings exported (changed ones only, no keys)");
  // import it again
  fs.rmSync(H + "/xf1", { recursive: true, force: true });
  await page.evaluate(async () => { const { settings } = await import("/js/core/settings.js"); settings.set("editor.minimap", false); settings.set("editor.tabSize", 4); });
  const res = await page.evaluate(async (b) => { const t = await import("/js/ui/transfer.js"); return t.importBundle({ path: "/tmp/cf-dev/cf/" + b, confirmDialog: false }); }, bundle);
  ok(res?.projects?.join() === "xf1" && fs.readFileSync(H + "/imported/xf1/src/a.js", "utf8") === "console.log(1)", "project imported into the imported folder");
  ok(!fs.existsSync(H + "/imported/xf1/node_modules"), "excluded folders did not come along");
  ok(await page.evaluate(async () => { const { settings } = await import("/js/core/settings.js"); return settings.get("editor.minimap") === true && settings.get("editor.tabSize") === 3; }), "settings applied on import");
  // second import must not overwrite
  const res2 = await page.evaluate(async (b) => (await (await import("/js/ui/transfer.js")).importBundle({ path: "/tmp/cf-dev/cf/" + b, confirmDialog: false })), bundle);
  ok(fs.existsSync(H + "/imported/xf1 2/src/a.js"), "importing twice keeps both copies (xf1 2)");
  // not a bundle
  fs.writeFileSync("/tmp/cf-dev/cf/bad.zip", await new JSZip().file("x.txt", "x").generateAsync({ type: "nodebuffer" }));
  await page.evaluate(async () => (await import("/js/ui/transfer.js")).importBundle({ path: "/tmp/cf-dev/cf/bad.zip", confirmDialog: false }));
  ok(await page.evaluate(() => /not a CodeForge bundle/.test(document.getElementById("toasts").textContent)), "a plain zip is rejected with a clear message");
  const bad = logs.filter((l) => !/favicon|iframe|ERR_|net::|Failed to load resource|git refresh/i.test(l));
  ok(!bad.length, "no console errors" + (bad.length ? " " + JSON.stringify(bad.slice(0, 3)) : ""));
  await browser.close(); console.log(fails ? fails + " FAILED" : "ALL PASSED"); process.exit(fails ? 1 : 0);
})();
