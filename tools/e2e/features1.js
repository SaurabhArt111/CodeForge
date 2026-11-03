const { launch } = require("./lib");
const fs = require("fs"), cp = require("child_process");
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
fs.rmSync("/tmp/cf-dev/cf/state.json", { force: true }); fs.rmSync("/tmp/cf-dev/cf/settings.json", { force: true });
fs.rmSync("/tmp/cf-dev/home/gt", { recursive: true, force: true }); fs.mkdirSync("/tmp/cf-dev/home/gt"); fs.writeFileSync("/tmp/cf-dev/home/gt/a.txt", "one\n"); fs.writeFileSync("/tmp/cf-dev/home/gt/index.html", "<h1>live</h1><script>console.log('hi from page')</script>");
(async () => {
  const { browser, page, logs } = await launch();
  await page.waitForFunction(() => window.__cfReady || window.__cfError, null, { timeout: 40000 });
  ok(await page.evaluate(() => !!window.__cfReady), "boot with all features: " + (await page.evaluate(() => window.__cfError || "")));
  // open folder through ws
  await page.evaluate(async () => { const m = await import("/js/main.js"); await m.openFolder("/tmp/cf-dev/home/gt"); });
  await page.click('.ab-btn[data-view="git"]');
  await page.waitForSelector("#view-git .empty-state button:has-text('Initialize Repository')");
  ok(true, "git view offers init");
  await page.click("#view-git button:has-text('Initialize Repository')");
  await page.waitForSelector("#view-git .scm-commit", { timeout: 15000 });
  ok(await page.locator("#view-git .row.git-U").count() === 2, "two untracked files listed");
  await page.click('#view-git .section-title:has-text("Changes") button[title="Stage all"]');
  await page.waitForSelector('#view-git .section-title:has-text("Staged Changes")', { timeout: 15000 });
  ok(true, "staged all");
  await page.evaluate(() => { localStorage.clear(); });
  // set user to skip prompts, commit
  await page.evaluate(async () => { const { settings } = await import("/js/core/settings.js"); settings.set("git.userName", "Test"); settings.set("git.userEmail", "t@example.com"); });
  await page.fill("#view-git textarea", "first commit");
  await page.click('#view-git .btn.primary:has-text("Commit")');
  await page.waitForFunction(() => !document.querySelector("#view-git .section-title.scm-sec span")?.textContent.includes("Staged"), null, { timeout: 15000 });
  await page.waitForTimeout(800);
  const log = cp.execSync("git -C /tmp/cf-dev/home/gt log --oneline", { encoding: "utf8" });
  ok(/first commit/.test(log), "real git sees isomorphic-git commit: " + log.trim());
  const fsck = cp.spawnSync("git", ["-C", "/tmp/cf-dev/home/gt", "fsck"], { encoding: "utf8" });
  ok(fsck.status === 0, "git fsck clean " + (fsck.stderr || "").slice(0, 100));
  // modify file -> status M and gutter
  fs.appendFileSync("/tmp/cf-dev/home/gt/a.txt", "two\n");
  await page.evaluate(async () => { const ed = await import("/js/ui/editor.js"); await ed.openFile("/tmp/cf-dev/home/gt/a.txt"); (await import("/js/features/git.js")).refresh(); });
  await page.waitForSelector("#view-git .row.git-M", { timeout: 10000 });
  ok(true, "modified file shows M");
  await page.waitForSelector(".cf-gutter-add, .cf-gutter-mod", { timeout: 8000, state: "attached" }).then(() => ok(true, "gutter decoration visible")).catch(() => ok(false, "gutter decoration visible"));
  // explorer decoration
  await page.click('.ab-btn[data-view="explorer"]'); await page.waitForTimeout(400);
  ok((await page.locator('#view-explorer .row.git-M').count()) >= 1, "explorer shows git status decoration");
  // live server + preview
  const live = await page.evaluate(async () => { const l = await import("/js/features/live.js"); const s = await l.serve("/tmp/cf-dev/home/gt", { open: true }); return s; });
  ok(live && live.port, "live server started on " + (live && live.port));
  await page.waitForSelector(".pv-frame[src]");
  await page.waitForTimeout(1500);
  const frame = page.frames().find((f) => f.url().includes(":" + live.port));
  ok(!!frame && (await frame.content()).includes("live"), "preview iframe loads served page");
  await page.click('.pv-bar button[title="Console"]');
  await page.waitForFunction(() => document.querySelector(".pv-lines")?.textContent.includes("hi from page"), null, { timeout: 8000 }).then(() => ok(true, "console forwarded from preview")).catch(() => ok(false, "console forwarded from preview"));
  await page.screenshot({ path: "/tmp/cf-dev/shot3.png" });
  await page.evaluate(async () => { const l = await import("/js/features/live.js"); await l.stopAll(); const { N } = await import("/js/core/bridge.js"); for (const t of await N.term.list()) await N.term.close(t.id); });
  console.log(logs.filter((l) => !/Failed to load resource|reqfail|features\/(extensions|plugins|ai|snippets|format)/.test(l)).slice(0, 15).join("\n"));
  await browser.close(); console.log(fails ? `${fails} FAILED` : "ALL OK");
})().catch((e) => { console.error(e); process.exit(1); });
