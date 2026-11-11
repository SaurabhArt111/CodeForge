// e2e: an extension whose language-configuration.json uses VS Code's array form / broken entries must not crash the editor.
const { launch } = require("./lib"); const fs = require("fs"); const JSZip = require(require("path").join(__dirname, "..", "devhost", "node_modules", "jszip"));
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
for (const f of ["state.json", "settings.json"]) fs.rmSync("/tmp/cf-dev/cf/" + f, { force: true });
fs.rmSync("/tmp/cf-dev/cf/extensions", { recursive: true, force: true });
fs.mkdirSync("/tmp/cf-dev/home/lc", { recursive: true }); fs.writeFileSync("/tmp/cf-dev/home/lc/a.js", "const a = 1;\n"); fs.writeFileSync("/tmp/cf-dev/home/lc/b.foo", "x = 1\n");
fs.rmSync("/tmp/cf-dev/home/imported", { recursive: true, force: true });
(async () => {
  const z = new JSZip();
  z.file("extension/package.json", JSON.stringify({ name: "badcfg", publisher: "tester", version: "1.0.0", displayName: "Bad Config",
    contributes: { languages: [{ id: "javascript", configuration: "./js.json" }, { id: "foo", extensions: [".foo"], configuration: "./foo.json" }] } }));
  const cfg = { comments: { lineComment: "//", blockComment: ["/*", "*/"] }, brackets: [["{", "}"], ["(", null]], autoClosingPairs: [["{", "}"], ["\"", "\""], { open: "'", close: "'", notIn: "string" }, ["["], { open: 1 }], surroundingPairs: [["(", ")"], ["<"]], onEnterRules: [{}], wordPattern: "([" };
  z.file("extension/js.json", JSON.stringify(cfg)); z.file("extension/foo.json", JSON.stringify(cfg));
  fs.mkdirSync("/tmp/cf-dev/shared", { recursive: true }); fs.writeFileSync("/tmp/cf-dev/shared/badcfg.vsix", await z.generateAsync({ type: "nodebuffer" }));
  const { browser, page, logs } = await launch({ mobile: false });
  await page.waitForFunction(() => window.__cfReady, null, { timeout: 40000 });
  await page.evaluate(async () => { const mm = await import("/js/main.js"); await mm.openFolder("/tmp/cf-dev/home/lc"); const e = await import("/js/features/extensions.js"); await e.installVsix("/tmp/cf-dev/shared/badcfg.vsix", { silent: true }); });
  await page.waitForTimeout(800);
  for (const f of ["a.js", "b.foo"]) {
    await page.evaluate(async (f) => { await (await import("/js/ui/editor.js")).openFile("/tmp/cf-dev/home/lc/" + f); }, f); await page.waitForTimeout(500);
    ok(await page.evaluate(() => !!document.querySelector(".monaco-editor .view-lines")), f + " opens with the extension's language configuration");
  }
  await page.click(".monaco-editor .view-lines"); await page.keyboard.press("Control+End"); await page.keyboard.type("f(");
  ok(/f\(\)/.test(await page.evaluate(async () => (await import("/js/ui/editor.js")).activeEditor().getValue())), "the valid auto-closing pairs still work");
  ok(!logs.some((l) => /charAt|pageerror/.test(l)) && await page.locator(".toast:has-text('charAt')").count() === 0, "no 'charAt' crash " + logs.filter((l) => /pageerror/.test(l)).join(" | "));
  // Open Folder → Look inside → Imported before anything was imported
  await page.evaluate(() => { import("/js/ui/commands.js").then((m) => m.run("file.openFolder")); }); await page.waitForSelector(".projects .pj-card.place");
  await page.click('.projects .pj-card.place:has-text("Imported")'); await page.waitForSelector(".ofd-list", { timeout: 8000 }); await page.waitForTimeout(500);
  ok(await page.locator(".toast:has-text('No such directory')").count() === 0 && fs.existsSync("/tmp/cf-dev/home/imported"), "“Imported” opens even before the first import (folder is created)");
  await browser.close();
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED"); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
