// e2e for the website (website/dist served by website/server/index.js on :8791, env PLAY_STORE_URL unset, no APK).
// usage: SITE=http://127.0.0.1:8791 NODE_PATH=$(npm root -g) node tools/e2e/site.js
const { chromium } = require("playwright");
const B = process.env.SITE || "http://127.0.0.1:8791";
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
(async () => {
  const browser = await chromium.launch();
  const mk = async (opts = {}) => { const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...opts }); const page = await ctx.newPage(); const logs = [];
    page.on("console", (m) => { if (["error", "warning"].includes(m.type())) logs.push(m.type() + ": " + m.text()); }); page.on("pageerror", (e) => logs.push("pageerror: " + e.message)); page.on("requestfailed", (r) => logs.push("reqfail: " + r.url()));
    page.on("response", (r) => { if (r.status() >= 400) logs.push(`http ${r.status()}: ${r.url()}`); }); return { ctx, page, logs }; };

  // ---- landing
  { const { page, logs } = await mk(); await page.goto(B + "/"); await page.waitForLoadState("networkidle");
    ok(/Write code where you are/i.test(await page.textContent("h1")), "landing: headline");
    ok((await page.getAttribute('a.btn.primary[href="/app/"]', "href")) === "/app/", "landing: primary CTA opens the web editor");
    ok(await page.evaluate(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0 || i.loading === "lazy")), "landing: images load");
    const tabs = await page.$$('[role=tab]'); ok(tabs.length >= 5, "landing: feature tabs " + tabs.length);
    await tabs[2].click(); ok((await tabs[2].getAttribute("aria-selected")) === "true", "landing: tab selection");
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "landing: no horizontal scroll (desktop)");
    await page.screenshot({ path: "/tmp/site-landing.png", fullPage: true });
    ok(!logs.length, "landing: console clean " + logs.join(" | ")); }
  // ---- landing on a phone
  { const { page, ctx } = await mk({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); await page.goto(B + "/"); await page.waitForLoadState("networkidle");
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "landing: no horizontal scroll (phone)"); await page.screenshot({ path: "/tmp/site-landing-m.png", fullPage: true }); await ctx.close(); }
  // ---- download: no APK yet, Play badge "Coming soon"
  { const { page, logs } = await mk(); await page.goto(B + "/download"); await page.waitForLoadState("networkidle");
    await page.waitForSelector(".status.wait:has-text(\"not uploaded\")"); const st = await page.textContent(".status"); ok(/not uploaded/i.test(st), "download: status says APK not uploaded (" + st.trim() + ")");
    ok(await page.getAttribute("a.btn.primary:has-text(\"Download APK\")", "aria-disabled") === "true", "download: APK button disabled without a file");
    ok(/coming soon/i.test(await page.textContent("a.badge")) && !(await page.getAttribute("a.badge", "href")), "download: Google Play badge says Coming soon with no link");
    ok(await page.isVisible(".note:has-text(\"not been uploaded\")"), "download: hint on how to add the APK is shown");
    await page.screenshot({ path: "/tmp/site-download.png", fullPage: true });
    ok(!logs.length, "download: console clean " + logs.join(" | ")); }
  // ---- download: with APK + Play link (stubbed responses)
  { const { page } = await mk(); await page.addInitScript(() => { window.__p = 1; });
    await page.route("**/downloads/apk.json", (r) => r.fulfill({ json: { file: "CodeForge.apk", size: 31457280, sha256: "a".repeat(64) } }));
    await page.route("**/site-config.js", (r) => r.fulfill({ contentType: "text/javascript", body: 'window.CF_SITE={version:"9.9.9",playStoreUrl:"https://play.google.com/store/apps/details?id=dev.codeforge.ide",githubUrl:"https://github.com/x/y",contactEmail:"me@example.com"}' }));
    await page.goto(B + "/download"); await page.waitForLoadState("networkidle");
    await page.waitForSelector(".status.ok"); ok(/ready/i.test(await page.textContent(".status")), "download(apk): status Ready");
    ok((await page.getAttribute("a.btn.primary:has-text(\"Download APK\")", "href")).endsWith("/downloads/CodeForge.apk"), "download(apk): link points to downloads/CodeForge.apk");
    ok(/30\.0 MB/.test(await page.textContent(".meta")) && /aaaa/.test(await page.textContent(".meta")), "download(apk): size and SHA-256 shown");
    ok((await page.getAttribute("a.badge", "href")).includes("play.google.com"), "download(play): badge links to configured Play URL");
    ok(!(await page.isVisible(".note:has-text(\"not been uploaded\")")), "download(apk): hint hidden"); await page.screenshot({ path: "/tmp/site-download-ready.png", fullPage: true }); }
  // ---- privacy
  { const { page, logs } = await mk(); await page.goto(B + "/privacy"); await page.waitForLoadState("networkidle"); ok(/privacy/i.test(await page.textContent("h1")), "privacy: heading"); ok(!logs.length, "privacy: console clean " + logs.join(" | ")); }
  // ---- 404
  { const { page } = await mk(); const r = await page.goto(B + "/nope/x"); await page.waitForSelector("h1"); ok(r.status() === 404 && /not found/i.test(await page.textContent("h1")), "404 page"); }
  // ---- code browser
  { const { page, logs } = await mk(); await page.goto(B + "/code"); await page.waitForLoadState("networkidle");
    await page.waitForSelector(".stats span"); const stats = (await page.textContent(".stats")).replace(/\s+/g, " "); ok(/files/.test(stats) && /lines/.test(stats), "code: stats " + stats);
    ok((await page.$$("#tree .row")).length > 5, "code: file tree populated");
    await page.click('#tree .row.dir:has-text("app")'); await page.waitForTimeout(200);
    await page.goto(B + "/code#app%2Fsrc%2Fmain%2Fassets%2Fwww%2Fjs%2Fcore%2Ffontscale.js:5"); await page.waitForSelector(".cb-code .l", { timeout: 10000 });
    const txt = await page.textContent("main"); ok(/fontscale|text size|--fz/i.test(txt), "code: hash route opens a file");
    await page.screenshot({ path: "/tmp/site-code.png" });
    const src = await page.evaluate(async () => (await fetch("/code-data/src/README.md")).status); ok(src === 200, "code: raw source served");
    ok(await page.evaluate(() => !!document.querySelector(".cb-code .hl")), "code: line from the URL is highlighted");
    ok(!logs.length, "code: console clean " + logs.join(" | ")); }
  // ---- source zip
  { const r = await (await browser.newContext()).request.get(B + "/downloads/CodeForge-source.zip"); ok(r.status() === 200 && (await r.body()).length > 1e6, "source zip downloads"); }
  // ---- web editor under /app/
  { const { page, logs } = await mk(); await page.goto(B + "/app/"); await page.waitForFunction(() => window.__cfReady, null, { timeout: 40000 });
    ok(await page.evaluate(async () => (await import(new URL("js/core/bridge.js", document.baseURI).href)).mode) === "web", "app: boots in web mode under /app/");
    await page.evaluate(async () => { const { N } = await import(new URL("js/core/bridge.js", document.baseURI).href); await N.fs.mkdir("/home/p"); await N.fs.writeText("/home/p/a.js", "let x = 1;\n"); const mm = await import(new URL("js/main.js", document.baseURI).href); await mm.openFolder("/home/p"); });
    await page.click('#view-explorer .row[data-path$="/a.js"]'); await page.waitForSelector(".monaco-editor .view-lines", { timeout: 20000 }); ok(true, "app: Monaco loads from sub-path");
    ok(/let\sx/.test(await page.textContent(".monaco-editor .view-lines")), "app: file opens in the editor");
    const proxy = await page.evaluate(() => localStorage.getItem("cf.corsProxy")); ok(proxy === B + "/proxy", "app: Git proxy preset from the site config (" + proxy + ")");
    const sw = await page.evaluate(() => navigator.serviceWorker ? navigator.serviceWorker.getRegistration("./").then((r) => !!r) : false); console.log("INFO service worker registered: " + sw);
    const man = await page.evaluate(async () => { const l = document.querySelector('link[rel=manifest]'); const j = await (await fetch(l.href)).json(); return { start: j.start_url, scope: j.scope, href: l.href }; }); console.log("INFO manifest " + JSON.stringify(man));
    await page.screenshot({ path: "/tmp/site-app.png" });
    ok(!logs.filter((l) => !/favicon|allow-scripts and allow-same-origin/.test(l)).length, "app: console clean " + logs.slice(0, 5).join(" | ")); }
  // ---- git proxy end to end
  { const { page } = await mk(); await page.goto(B + "/privacy");
    const r = await page.evaluate(async () => { const a = await fetch("/proxy/github.com/octocat/Hello-World.git/info/refs?service=git-upload-pack"); const b = await fetch("/proxy/example.com/x/info/refs"); const c = await fetch("/proxy/github.com/octocat/Hello-World/issues"); return [a.status, a.headers.get("content-type"), b.status, c.status]; });
    console.log("INFO proxy " + JSON.stringify(r)); ok(r[2] === 403 && r[3] === 403, "proxy: refuses other hosts and non-Git paths"); }
  await browser.close(); console.log(fails ? fails + " FAILED" : "ALL PASSED"); process.exit(fails ? 1 : 0);
})();
