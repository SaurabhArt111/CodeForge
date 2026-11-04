const { launch } = require("./lib"); const fs = require("fs"); const JSZip = require("/home/claude/build/CodeForge/tools/devhost/node_modules/jszip");
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
for (const f of ["state.json", "settings.json"]) fs.rmSync("/tmp/cf-dev/cf/" + f, { force: true });
fs.rmSync("/tmp/cf-dev/home/imported", { recursive: true, force: true }); fs.rmSync("/tmp/cf-dev/home/projects/tpl1", { recursive: true, force: true });
(async () => {
  const z = new JSZip(); z.file("myproj/index.html", "<h1>zip</h1>"); z.file("myproj/src/a.js", "1"); fs.mkdirSync("/tmp/cf-dev/shared", { recursive: true }); fs.writeFileSync("/tmp/cf-dev/shared/myproj.zip", await z.generateAsync({ type: "nodebuffer" }));
  const { browser, page, logs } = await launch();
  await page.waitForFunction(() => window.__cfReady, null, { timeout: 40000 });
  // open ZIP via folder dialog (zip click in folder mode)
  await page.evaluate(async () => { const m = await import("/js/ui/openfolder.js"); const mm = await import("/js/main.js"); window.__p = m.chooseProject({ openFolder: mm.openFolder }); });
  await page.waitForSelector(".ofd-list .row");
  await page.evaluate(async () => { const { N } = await import("/js/core/bridge.js"); });
  // navigate to /tmp/cf-dev/shared by clicking the root chip named "CodeForge (shared folder)" or via crumbs: use evaluate go
  const chips = await page.locator(".ofd-root").allTextContents(); console.log("roots:", chips.join(" | "));
  await page.click('.ofd-root:has-text("shared")'); await page.waitForSelector('.ofd-row:has-text("myproj.zip")');
  await page.click('.ofd-row:has-text("myproj.zip")');
  await page.waitForSelector('#view-explorer .row[data-path$="/index.html"]', { timeout: 15000 });
  ok(await page.evaluate(async () => (await import("/js/ui/workspace.js")).ws.root.endsWith("/imported/myproj")), "ZIP extracted and single root folder hoisted -> project opened");
  // explorer context menu: compress folder src
  await page.click('#view-explorer .row[data-path$="/src"]'); await page.click('#view-explorer .row[data-path$="/src"]', { button: "right" });
  await page.screenshot({path:"/tmp/cf-dev/f3a.png"});
  console.log("ctx items:", (await page.locator(".ctx-item").allTextContents()).join("|"));
  await page.click('.ctx-item:has-text("Compress to ZIP")'); await page.waitForTimeout(500); await page.screenshot({path:"/tmp/cf-dev/f3b.png"});
  await page.waitForSelector(".modal input"); await page.keyboard.press("Enter");
  await page.waitForSelector('#view-explorer .row[data-path$="/src.zip"]', { timeout: 10000 }); ok(true, "context menu: compress to ZIP");
  await page.click('#view-explorer .row[data-path$="/src.zip"]', { button: "right" }); await page.click('.ctx-item:has-text("Extract to Folder")');
  await page.waitForSelector('#view-explorer .row[data-path$="/src 2"], #view-explorer .row[data-path$="/src.zip"]'); await page.waitForTimeout(600);
  ok(fs.existsSync("/tmp/cf-dev/home/imported/myproj/src 2/src/a.js") || fs.existsSync("/tmp/cf-dev/home/imported/myproj/src/a.js"), "extract archive to folder");
  // new file inline in explorer
  await page.click('#view-explorer .view-head button[title="New File"]'); await page.waitForSelector("#view-explorer input.inline:focus"); await page.keyboard.type("hello.txt"); await page.keyboard.press("Enter");
  await page.waitForTimeout(1500); await page.screenshot({path:"/tmp/cf-dev/f3c.png"}); console.log("files:", fs.readdirSync("/tmp/cf-dev/home/imported/myproj").join(","), "| tabs:", (await page.locator(".tab").allTextContents()).join("|"));
  await page.waitForSelector(".tab:has-text('hello.txt')", { timeout: 8000 }); ok(fs.existsSync("/tmp/cf-dev/home/imported/myproj/hello.txt"), "inline new file creates + opens");
  // rename with F2
  await page.click('#view-explorer .row[data-path$="/hello.txt"]'); await page.keyboard.press("F2"); await page.waitForSelector("#view-explorer input.inline:focus"); await page.keyboard.press("Control+A"); await page.keyboard.type("renamed.txt"); await page.keyboard.press("Enter");
  await page.waitForSelector('#view-explorer .row[data-path$="/renamed.txt"]'); ok(await page.locator(".tab:has-text('renamed.txt')").count() === 1, "F2 rename updates tree and open tab");
  // delete
  await page.click('#view-explorer .row[data-path$="/renamed.txt"]'); await page.keyboard.press("Delete"); await page.click('.modal .btn.danger');
  await page.waitForFunction(() => !document.querySelector('#view-explorer .row[data-path$="/renamed.txt"]')); ok(true, "delete removes file and closes tab: " + (await page.locator(".tab:has-text('renamed.txt')").count() === 0));
  // OSC 7770 from terminal opens file
  await page.click("#btn-term"); await page.waitForSelector(".xterm-screen"); await page.waitForTimeout(1200);
  await page.click(".term-body.on .xterm-screen"); await page.waitForTimeout(200);
  await page.keyboard.type("printf '\\033]7770;open;/tmp/cf-dev/home/imported/myproj/index.html\\007'\r");
  await page.waitForTimeout(1500); await page.screenshot({path:"/tmp/cf-dev/f3d.png"}); console.log("term:", (await page.locator(".term-body.on .xterm-rows").innerText()).slice(-300));
  await page.waitForSelector(".tab:has-text('index.html')", { timeout: 8000 }); ok(true, "OSC 7770 (`code` command) opens file in editor");
  // env wizard
  await page.evaluate(async () => { const e = await import("/js/features/env.js"); window.__w = e.wizard(); });
  await page.waitForSelector(".modal:has-text('Set up Linux environment')"); ok((await page.locator(".modal input[type=checkbox]").count()) >= 8, "linux wizard lists package presets");
  await page.click(".modal .btn:has-text('Cancel')");
  // templates
  await page.evaluate(async () => { window.__np = (await import("/js/features/templates.js")); const mm = await import("/js/main.js"); await mm.api.feat("templates"); window.__t = mm.api.feat("templates").then((t) => t.newProject()); });
  await page.waitForSelector(".qp-input:focus"); await page.keyboard.type("HTML"); await page.waitForTimeout(200); await page.screenshot({path:"/tmp/cf-dev/f3e.png"}); await page.keyboard.press("Enter"); await page.waitForSelector(".modal input"); await page.fill(".modal input", "tpl1"); await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelector("#title-text")?.textContent.includes("tpl1"), null, { timeout: 8000 }); ok(fs.existsSync("/tmp/cf-dev/home/projects/tpl1/index.html"), "new project from template");
  // quick open + command palette
  await page.keyboard.press("Control+P"); await page.waitForSelector(".qp-input:focus"); await page.keyboard.type("style"); await page.waitForTimeout(500); await page.screenshot({path:"/tmp/cf-dev/f3f.png"}); await page.waitForSelector(".qp-item"); await page.keyboard.press("Enter"); await page.waitForSelector(".tab:has-text('style.css')"); ok(true, "quick open (Ctrl+P) opens fuzzy match");
  await page.evaluate(async () => { const { N } = await import("/js/core/bridge.js"); for (const t of await N.term.list()) await N.term.close(t.id); });
  console.log(logs.filter((l) => !/Failed to load resource|reqfail|iframe which has both/.test(l)).slice(0, 10).join("\n"));
  await browser.close(); console.log(fails ? `${fails} FAILED` : "ALL OK"); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
