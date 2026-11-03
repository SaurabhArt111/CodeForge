const { launch } = require("./lib");
const fs = require("fs");
let fails = 0;
for (const f of ["cf/state.json","cf/settings.json"]) try { fs.rmSync("/tmp/cf-dev/"+f); } catch {}
for (const f of ["dirA","ex","a.zip","new.txt","renamed.txt"]) try { fs.rmSync("/tmp/cf-dev/home/proj/"+f,{recursive:true,force:true}); } catch {}
fs.writeFileSync("/tmp/cf-dev/home/proj/package.json", JSON.stringify({name:"demo",scripts:{start:"node src/app.js"}}));
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
(async () => {
  const { browser, page, logs } = await launch();
  await page.waitForFunction(() => window.__cfReady || window.__cfError, null, { timeout: 30000 });
  ok(await page.evaluate(() => !!window.__cfReady), "boot");
  // open folder dialog
  await page.click("text=Open Folder…");
  await page.waitForSelector(".ofd-list .row");
  ok((await page.locator(".ofd-root").count()) >= 1, "storage roots shown");
  await page.screenshot({ path: "/tmp/cf-dev/shot-ofd.png" });
  await page.click('.ofd-row:has-text("proj")');
  await page.waitForSelector('.crumb, .ofd-crumb:has-text("proj")');
  await page.click('.modal-foot .btn.primary');
  await page.waitForSelector('#view-explorer .row[data-path$="/index.html"]');
  ok(true, "folder opened, tree shows files");
  await page.click('#view-explorer .row[data-path$="/package.json"]');
  await page.waitForSelector(".monaco-editor .view-lines");
  ok((await page.textContent(".monaco-editor .view-lines")).includes("scripts"), "monaco shows file content");
  // edit + autosave
  await page.click(".monaco-editor .view-lines");
  await page.keyboard.press("Control+End");
  await page.keyboard.type("\n// edited");
  ok(await page.locator(".tab.dirty").count() === 1, "tab dirty after edit");
  await page.keyboard.press("Control+S");
  await page.waitForFunction(() => !document.querySelector(".tab.dirty"), null, { timeout: 5000 });
  const disk = fs.readFileSync("/tmp/cf-dev/home/proj/package.json", "utf8");
  ok(disk.includes("// edited"), "saved to disk");
  // create file via API, rename, delete
  const r = await page.evaluate(async () => {
    const { ws } = await import("/js/ui/workspace.js"); const ed = await import("/js/ui/editor.js");
    const root = ws.root; const out = {};
    const p = await ws.createFile(root, "new.txt", "hello"); out.created = await (await import("/js/core/bridge.js")).N.fs.exists(p);
    await ed.openFile(p); const np = await ws.rename(p, "renamed.txt"); out.renamedTab = ed.allTabs().some((t) => t.path === np);
    await ws.createFolder(root, "dirA"); await ws.copy([np], root + "/dirA"); out.copied = await (await import("/js/core/bridge.js")).N.fs.exists(root + "/dirA/renamed.txt");
    await ws.zip([root + "/dirA"], root + "/a.zip"); out.zip = await (await import("/js/core/bridge.js")).N.fs.exists(root + "/a.zip");
    await ws.extractZip(root + "/a.zip", root + "/ex"); out.unzip = await (await import("/js/core/bridge.js")).N.fs.exists(root + "/ex/dirA/renamed.txt");
    await ws.remove([root + "/ex", root + "/a.zip", np]); out.deleted = !(await (await import("/js/core/bridge.js")).N.fs.exists(np));
    return out;
  });
  console.log(JSON.stringify(r));
  Object.entries(r).forEach(([k, v]) => ok(v === true, "ws." + k));
  // search
  await page.click('.ab-btn[data-view="search"]');
  await page.fill("#view-search input[placeholder=Search]", "console");
  await page.waitForSelector(".mrow", { timeout: 8000 });
  ok((await page.locator(".mrow").count()) >= 1, "search finds results");
  // terminal
  await page.click("#btn-term");
  await page.waitForSelector(".xterm-screen", { timeout: 8000 });
  await page.waitForTimeout(800);
  await page.keyboard.type("echo cf$((20+22))\r");
  await page.waitForTimeout(1200);
  const termText = await page.evaluate(() => document.querySelector(".term-body.on .xterm-rows")?.innerText || "");
  ok(termText.includes("cf42"), "terminal echo works: " + JSON.stringify(termText.slice(-80)));
  // palette
  await page.keyboard.press("Control+Shift+P");
  await page.waitForSelector(".qp-input:focus"); await page.waitForTimeout(200);
  await page.keyboard.type("Settings");
  await page.waitForTimeout(400); console.log("items:", (await page.locator(".qp-item").allTextContents()).slice(0,5).join(" | ")); await page.keyboard.press("Enter");
  await page.waitForTimeout(1500); await page.screenshot({path:"/tmp/cf-dev/core-dbg.png"}); console.log("tabs:", (await page.locator(".tab").allTextContents()).join("|"), "| qp items:", (await page.locator(".qp-item").allTextContents()).slice(0,4).join("|")); await page.waitForSelector(".settings-page");
  ok(true, "settings page opens from palette");
  await page.screenshot({ path: "/tmp/cf-dev/shot2.png" });
  console.log(logs.filter((l) => !/features\/|Failed to load resource|reqfail/.test(l)).slice(0, 20).join("\n"));
  await page.evaluate(async () => { const { N } = await import("/js/core/bridge.js"); for (const t of await N.term.list()) await N.term.close(t.id); });
  await browser.close();
  console.log(fails ? `${fails} FAILED` : "ALL OK");
})().catch((e) => { console.error(e); process.exit(1); });
