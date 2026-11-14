// v8.3: background jobs, storage manager, Security Centre + menu, drill-in phone menu, Settings de-duplication, compress & export to Downloads.
const { launch } = require("./lib"); const fs = require("fs"); const path = require("path");
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
const ROOT = "/tmp/cf-dev", HOME = ROOT + "/home";
fs.rmSync(ROOT + "/Download", { recursive: true, force: true });
const PROJ = HOME + "/v83proj"; fs.rmSync(PROJ, { recursive: true, force: true });
fs.mkdirSync(PROJ + "/src", { recursive: true }); fs.mkdirSync(PROJ + "/node_modules/left-pad", { recursive: true });
fs.writeFileSync(PROJ + "/src/index.js", "console.log(1)\n"); fs.writeFileSync(PROJ + "/package.json", "{}"); fs.writeFileSync(PROJ + "/node_modules/left-pad/index.js", "x".repeat(200000));
fs.mkdirSync(ROOT + "/cf/export-tmp", { recursive: true }); fs.writeFileSync(ROOT + "/cf/export-tmp/old.zip", "z".repeat(50000));

(async () => {
  // ------------------------------------------------------------ desktop
  let { browser, page, logs } = await launch({ mobile: false });
  await page.waitForFunction(() => window.__cfReady, null, { timeout: 40000 });
  const ev = (fn, arg) => page.evaluate(fn, arg);

  // 1. Settings: duplicates are gone
  await ev(async () => { const m = await import("/js/ui/settingsview.js"); await m.open(); });
  await page.waitForSelector(".settings-page .set-row");
  await page.waitForTimeout(500);
  const info = await ev(() => {
    const labels = [...document.querySelectorAll(".settings-page .set-label")].map((e) => e.firstChild?.textContent?.trim() || e.textContent.trim());
    const heads = [...document.querySelectorAll(".settings-page h3")].map((e) => e.textContent.trim());
    return { labels, heads };
  });
  const dupL = info.labels.filter((l, i) => info.labels.indexOf(l) !== i && !/^(Provider|Model)$/.test(l));
  ok(dupL.length === 0, "Settings: no repeated labels" + (dupL.length ? " -> " + [...new Set(dupL)].join(", ") : ""));
  const dupH = info.heads.filter((l, i) => info.heads.indexOf(l) !== i);
  ok(dupH.length === 0, "Settings: no repeated section titles" + (dupH.length ? " -> " + dupH.join(", ") : ""));
  ok(!info.heads.includes("API Keys") && !info.heads.includes("Security"), "Settings: API Keys / Security sections moved out (" + info.heads.join(" | ") + ")");
  ok(info.heads.includes("Security & Storage") && info.heads.includes("Keyboard & Touch") && !info.heads.includes("GitHub"), "Settings: link section + merged sections present");
  ok(await ev(() => !!document.querySelector(".settings-page .set-row .btn.primary") && /Security/.test(document.querySelector(".settings-page").textContent)), "Settings: links to Security Centre and Storage");
  const lan = await ev(async () => { const { settings } = await import("/js/core/settings.js"); const rows = [...document.querySelectorAll(".settings-page .set-row")].filter((r) => /other devices/i.test(r.textContent)); return rows.length; });
  ok(lan === 1, "Settings: one network-exposure switch (" + lan + ")");
  await ev(async () => { const { settings } = await import("/js/core/settings.js"); settings.set("live.lan", false); settings.set("run.exposeHost", false); });
  await page.evaluate(() => [...document.querySelectorAll(".settings-page .set-row")].find((r) => /other devices/i.test(r.textContent)).querySelector(".switch").click());
  ok(await ev(async () => { const { settings } = await import("/js/core/settings.js"); return settings.get("live.lan") === true && settings.get("run.exposeHost") === true; }), "Settings: merged switch sets live.lan and run.exposeHost together");
  await ev(async () => { const { settings } = await import("/js/core/settings.js"); settings.set("live.lan", false); settings.set("run.exposeHost", false); });

  // 2. Storage manager
  await ev(async () => { const m = await import("/js/ui/storage.js"); await m.open(); });
  await page.waitForSelector(".storage-page .stor-row", { timeout: 15000 });
  const cats = await ev(() => [...document.querySelectorAll(".storage-page .stor-row .set-label")].map((e) => e.firstChild.textContent));
  ok(cats.includes("node_modules") && cats.includes("Your projects"), "Storage: categories listed (" + cats.join(", ") + ")");
  ok(cats.includes("Leftovers"), "Storage: leftover export-tmp file is found");
  const nmBytes = await ev(() => { const r = [...document.querySelectorAll(".storage-page .stor-row")].find((x) => /node_modules/.test(x.querySelector(".set-label").textContent)); return r.querySelector(".stor-size").textContent; });
  ok(/KB|MB/.test(nmBytes), "Storage: node_modules size shown (" + nmBytes + ")");
  // details
  await page.evaluate(() => { const r = [...document.querySelectorAll(".storage-page .stor-row")].find((x) => /node_modules/.test(x.querySelector(".set-label").textContent)); r.querySelector(".stor-btns .btn").click(); });
  await page.waitForSelector(".storage-page .stor-item", { timeout: 8000 });
  ok(await ev(() => /v83proj/.test(document.querySelector(".storage-page .stor-items:not([hidden])").textContent) || /node_modules/.test(document.querySelector(".storage-page .stor-items:not([hidden])").textContent)), "Storage: details list the biggest items");
  // clean node_modules (confirm dialog)
  await page.evaluate(() => { const r = [...document.querySelectorAll(".storage-page .stor-row")].find((x) => /node_modules/.test(x.querySelector(".set-label").textContent)); [...r.querySelectorAll(".stor-btns .btn")].find((b) => b.textContent === "Clear").click(); });
  await page.waitForSelector(".modal .btn.primary, .modal .btn.danger", { timeout: 5000 });
  await page.evaluate(() => [...document.querySelectorAll(".modal .btn")].find((b) => /^Clear/.test(b.textContent)).click());
  await page.waitForFunction((p) => true, null).catch(() => {}); await page.waitForTimeout(1500);
  ok(!fs.existsSync(PROJ + "/node_modules"), "Storage: Clear node_modules removed the folder");
  ok(fs.existsSync(PROJ + "/src/index.js"), "Storage: project source untouched");
  // leftovers
  const cleaned = await ev(async () => { const { N } = await import("/js/core/bridge.js"); return N.storage.clean(["leftovers"]); });
  ok(!fs.existsSync(ROOT + "/cf/export-tmp/old.zip") && cleaned.freed > 0, "Storage: leftovers cleared, freed " + cleaned.freed);
  const refused = await ev(async () => { const { N } = await import("/js/core/bridge.js"); return N.storage.clean(["projects"]); });
  ok(refused.errors.length === 1 && fs.existsSync(PROJ), "Storage: projects can not be cleared in bulk");
  const deny = await ev(async () => { const { N } = await import("/js/core/bridge.js"); try { await N.storage.delete("/etc"); return "no error"; } catch (e) { return e.message; } });
  ok(/Not inside/.test(deny), "Storage: delete outside CodeForge storage refused (" + deny + ")");

  // 3. compress & export to Downloads
  await ev(async (PROJ_P) => { const x = await import("/js/ui/exporter.js"); window.__exp = x.compressAndExport([PROJ_P], { name: "v83proj" }); }, PROJ);
  await page.waitForSelector(".modal", { timeout: 8000 });
  await page.evaluate(() => [...document.querySelectorAll(".modal .btn")].find((b) => /Compress & export/.test(b.textContent)).click());
  await page.waitForFunction(() => !!document.querySelector(".toast"), null, { timeout: 15000 });
  await page.waitForTimeout(800);
  const dl = fs.existsSync(ROOT + "/Download") ? fs.readdirSync(ROOT + "/Download") : [];
  if (!dl.length) console.log("jobs:", JSON.stringify(await ev(async () => (await import("/js/core/jobs.js")).list().map((x) => [x.title, x.status, x.error]))), logs.slice(-5));
  ok(dl.some((f) => /^v83proj.*\.zip$/.test(f)), "Export: ZIP landed in the Downloads folder (" + dl.join(", ") + ")");
  ok(!fs.existsSync(ROOT + "/cf/export-tmp") || fs.readdirSync(ROOT + "/cf/export-tmp").length === 0, "Export: no temporary ZIP left behind");
  if (dl.length) { const JSZip = require(path.resolve(__dirname, "../devhost/node_modules/jszip")); const z = await JSZip.loadAsync(fs.readFileSync(ROOT + "/Download/" + dl[0])); const names = Object.keys(z.files); ok(names.includes("v83proj/src/index.js"), "Export: ZIP contains the project folder (" + names.slice(0, 4).join(", ") + ")"); }
  // same name again: unique
  await ev(async (PROJ_P) => { const x = await import("/js/ui/exporter.js"); window.__exp2 = x.compressAndExport([PROJ_P], { name: "v83proj" }); }, PROJ);
  await page.waitForSelector(".modal"); await page.evaluate(() => [...document.querySelectorAll(".modal .btn")].find((b) => /Compress & export/.test(b.textContent)).click());
  await page.waitForTimeout(1800);
  ok((fs.existsSync(ROOT + "/Download") ? fs.readdirSync(ROOT + "/Download") : []).length === 2, "Export: second export gets its own file name");
  const jobsState = await ev(async () => { const j = await import("/js/core/jobs.js"); return j.list().map((x) => x.status + ":" + x.title); });
  ok(jobsState.some((s) => /^done:.*v83proj/.test(s)), "Jobs: finished export is in the task list (" + jobsState.join(" | ") + ")");

  // 4. jobs: progress, cancel, error
  const jr = await ev(async () => {
    const j = await import("/js/core/jobs.js"); const seen = [];
    const r = await j.run({ title: "Test job", silent: true }, async (job) => { for (let i = 0; i <= 4; i++) { job.update("step " + i, i / 4); seen.push(job.progress); await new Promise((r) => setTimeout(r, 20)); } return 42; });
    const bad = await j.run({ title: "Bad job", silent: true }, async () => { throw new Error("boom"); });
    let cancelled = null; const p = j.run({ title: "Slow job", silent: true }, async (job) => { await new Promise((r) => { job.onCancel(r); setTimeout(r, 3000); }); if (job.cancelRequested) throw new Error("Cancelled"); });
    await new Promise((r) => setTimeout(r, 100)); const live = j.running().length; j.running()[0].cancel(); cancelled = await p;
    return { r: r.ok && r.result === 42, seen, bad: !bad.ok && bad.error === "boom", live, cancelled: cancelled.cancelled };
  });
  ok(jr.r && jr.seen.join() === "0,0.25,0.5,0.75,1", "Jobs: progress reported (" + jr.seen.join(",") + ")");
  ok(jr.bad, "Jobs: errors are returned, not thrown"); ok(jr.live === 1 && jr.cancelled, "Jobs: running task can be cancelled");
  // status bar item + task list
  await ev(async () => { const j = await import("/js/core/jobs.js"); window.__long = j.run({ title: "Long job", silent: true }, async (job) => { job.update("working", 0.3); await new Promise((r) => setTimeout(r, 2500)); }); });
  await page.waitForTimeout(300);
  ok(await ev(() => /Long job|1 task|working/i.test(document.querySelector("#statusbar")?.textContent || "") ), "Jobs: status bar shows the running task");
  await ev(async () => { (await import("/js/core/jobs.js")).openCenter(); });
  await page.waitForSelector(".job-row.running"); ok(true, "Jobs: task list shows the running job with progress bar");
  ok(!!(await page.$(".job-row.running .job-bar")), "Jobs: progress bar rendered");
  await page.evaluate(() => [...document.querySelectorAll(".modal .btn")].find((b) => b.textContent === "Close").click());
  await page.waitForTimeout(2300);

  // 5. Security Centre + menu
  await ev(async () => { const m = await import("/js/ui/securitycenter.js"); await m.open(); });
  await page.waitForSelector(".security-page .sec-card", { timeout: 8000 });
  await page.waitForSelector(".security-page .set-sec", { timeout: 8000 });
  const sh = await ev(() => [...document.querySelectorAll(".security-page h3")].map((e) => e.textContent));
  ok(["App lock", "API keys", "Network exposure", "Permissions & access", "Privacy"].every((s) => sh.includes(s)), "Security Centre: all sections (" + sh.join(", ") + ")");
  ok(await ev(() => document.querySelectorAll(".security-page .sec-check").length >= 5), "Security Centre: check-up list");
  ok(await ev(() => !![...document.querySelectorAll("#menubar .mb-item")].find((b) => b.textContent === "Security")), "Menu bar has a Security menu");
  await page.evaluate(() => [...document.querySelectorAll("#menubar .mb-item")].find((b) => b.textContent === "Security").click());
  await page.waitForSelector(".ctx .ctx-item");
  const secItems = await ev(() => [...document.querySelectorAll(".ctx .ctx-label")].map((e) => e.textContent));
  ok(["Security Centre", "Lock Now", "API Keys…", "Clear Clipboard"].every((s) => secItems.includes(s)), "Security menu items (" + secItems.join(", ") + ")");
  await page.keyboard.press("Escape"); await page.mouse.click(5, 5);
  // file menu has compress & export
  await page.evaluate(() => [...document.querySelectorAll("#menubar .mb-item")].find((b) => b.textContent === "File").click());
  await page.waitForSelector(".ctx .ctx-item");
  ok(await ev(() => [...document.querySelectorAll(".ctx .ctx-label")].some((e) => /Compress & Export to Downloads/.test(e.textContent))), "File menu: Compress & Export to Downloads");
  await page.mouse.click(5, 5);

  // 6. Open Folder browser: compress & export buttons
  await ev(async (HOME_P) => { const of = await import("/js/ui/openfolder.js"); window.__b = of.browse({ mode: "folder", title: "Open Folder", start: HOME_P }); }, HOME);
  await page.waitForSelector(".ofd-row");
  ok(await ev(() => !!document.querySelector(".ofd-tools .icon-btn[title^='Compress']") && document.querySelectorAll(".ofd-row .ofd-zip").length > 0), "Open Folder: toolbar + per-row Compress & export");
  await page.evaluate(() => { const row = [...document.querySelectorAll(".ofd-row")].find((r) => /v83proj/.test(r.textContent)); row.querySelector(".ofd-zip").click(); });
  await page.waitForFunction(() => document.querySelectorAll(".modal").length >= 2, null, { timeout: 5000 });
  ok(true, "Open Folder: row button opens the compress dialog on top of the browser");
  await page.evaluate(() => { const ms = [...document.querySelectorAll(".modal")]; [...ms[ms.length - 1].querySelectorAll(".btn")].find((b) => /Cancel/.test(b.textContent))?.click(); });
  await page.waitForTimeout(300);
  console.log("desktop console problems:", logs.filter((l) => !/favicon|Failed to load resource/.test(l)).slice(0, 8));
  const dErr = logs.filter((l) => /pageerror/.test(l)); ok(dErr.length === 0, "No page errors on desktop " + dErr.join(" / "));
  await browser.close();

  // ------------------------------------------------------------ phone
  ({ browser, page, logs } = await launch({ mobile: true }));
  await page.waitForFunction(() => window.__cfReady, null, { timeout: 40000 });
  await page.waitForSelector("#btn-sidebar", { state: "visible" });
  await page.click("#btn-sidebar");
  await page.waitForSelector(".navmenu .ctx-item");
  const root = await ev(() => [...document.querySelectorAll(".navmenu .ctx-label")].map((e) => e.textContent));
  ok(["File", "Edit", "View", "Terminal", "Security", "Help"].every((s) => root.includes(s)), "Phone menu: top level lists the menus (" + root.join(", ") + ")");
  await page.waitForTimeout(500);
  await page.evaluate(() => [...document.querySelectorAll(".navmenu .ctx-item")].find((r) => r.textContent.trim() === "File").click());
  await page.waitForSelector(".navmenu .nm-head");
  const sub = await ev(() => ({ labels: [...document.querySelectorAll(".navmenu .ctx-label")].map((e) => e.textContent), back: document.querySelector(".nm-back")?.textContent, pages: document.querySelectorAll(".navmenu .nm-page").length, title: document.querySelector(".nm-title")?.textContent }));
  ok(sub.pages === 1 && sub.title === "File" && sub.labels.includes("New File") && !sub.labels.includes("Security"), "Phone menu: File opens as its own page, not inside the list (" + sub.labels.slice(0, 3).join(", ") + ")");
  ok(/Menu/.test(sub.back || ""), "Phone menu: back button says where it goes (" + sub.back + ")");
  const box = await ev(() => { const m = document.querySelector(".navmenu").getBoundingClientRect(); return { l: m.left, r: m.right, w: innerWidth, b: m.bottom, h: innerHeight }; });
  ok(box.l >= 0 && box.r <= box.w + 1 && box.b <= box.h + 1, "Phone menu: fits the screen " + JSON.stringify(box));
  await page.click(".nm-back"); await page.waitForTimeout(250);
  ok(await ev(() => [...document.querySelectorAll(".navmenu .ctx-label")].map((e) => e.textContent).includes("Security")), "Phone menu: back returns to the top list");
  await page.evaluate(() => [...document.querySelectorAll(".navmenu .ctx-item")].find((r) => r.textContent.trim() === "Security").click());
  await page.waitForSelector(".nm-head");
  await page.evaluate(() => [...document.querySelectorAll(".navmenu .ctx-item")].find((r) => /Security Centre/.test(r.textContent)).click());
  await page.waitForSelector(".security-page .sec-card", { timeout: 8000 });
  ok(!(await page.$(".navmenu")), "Phone menu: picking an entry closes the menu and opens the page");
  const mErr = logs.filter((l) => /pageerror/.test(l)); ok(mErr.length === 0, "No page errors on phone " + mErr.join(" / "));
  await page.screenshot({ path: "/tmp/v83-phone-security.png" });
  await browser.close();
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED"); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
