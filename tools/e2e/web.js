// e2e for the web version (tools/web/build.sh output served on :8790): boots without the dev host, persists files in IndexedDB.
const { launch } = require("./lib");
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
(async () => {
  const { browser, ctx, page, logs } = await launch({ url: "http://127.0.0.1:8790/" });
  await page.waitForFunction(() => window.__cfReady, null, { timeout: 40000 });
  ok(await page.evaluate(async () => (await import("/js/core/bridge.js")).mode) === "web", "bridge in web mode (no dev host / native)");
  const info = await page.evaluate(async () => (await import("/js/core/bridge.js")).N.sys.info()); ok(info.web === true && info.paths.home === "/home", "sys.info from web backend");
  // project: write files, open as workspace, edit and save
  await page.evaluate(async () => { const { N } = await import("/js/core/bridge.js"); await N.fs.mkdir("/home/proj/src"); await N.fs.writeText("/home/proj/index.html", "<h1>hi</h1>"); await N.fs.writeText("/home/proj/src/app.js", "console.log('web ok');\n"); const mm = await import("/js/main.js"); await mm.openFolder("/home/proj"); });
  await page.waitForSelector('#view-explorer .row[data-path$="/index.html"]'); ok(true, "explorer lists files from IndexedDB fs");
  await page.click('#view-explorer .row[data-path$="/src"]'); await page.click('#view-explorer .row[data-path$="/app.js"]'); await page.waitForSelector(".tab:has-text('app.js')");
  await page.waitForSelector(".monaco-editor .view-lines"); await page.click(".monaco-editor .view-lines"); await page.keyboard.press("Control+End"); await page.keyboard.type("// edited");
  await page.keyboard.press("Control+S"); await page.waitForTimeout(600);
  ok((await page.evaluate(async () => (await import("/js/core/bridge.js")).N.fs.readText("/home/proj/src/app.js"))).text.includes("// edited"), "save writes through to the web fs");
  // search
  const sr = await page.evaluate(async () => (await import("/js/core/bridge.js")).N.search.text({ root: "/home/proj", query: "web ok" })); ok(sr.results.length === 1 && sr.results[0].rel === "src/app.js", "search.text works");
  // zip + unzip round trip
  await page.evaluate(async () => { const { N } = await import("/js/core/bridge.js"); await N.archive.zip({ src: ["/home/proj"], dest: "/home/proj.zip" }); await N.archive.unzip({ src: "/home/proj.zip", dest: "/home/restored" }); });
  ok(await page.evaluate(async () => (await import("/js/core/bridge.js")).N.fs.exists("/home/restored/proj/src/app.js")), "zip / unzip round trip");
  // terminal mini shell
  await page.click("#btn-term"); await page.waitForSelector(".term-body.on .xterm-screen"); await page.waitForTimeout(800); await page.click(".term-body.on .xterm-screen");
  await page.keyboard.type("ls\r"); await page.waitForTimeout(500); await page.keyboard.type("node src/app.js\r"); await page.waitForTimeout(1200); await page.keyboard.type("echo hello && npm -v\r"); await page.waitForTimeout(500); await page.keyboard.type("git status\r"); await page.waitForTimeout(500);
  const t = await page.evaluate(async () => { const b = (await import("/js/ui/terminal.js")).get().xt.buffer.active; let o = []; for (let i = 0; i < b.length; i++) o.push(b.getLine(i)?.translateToString(true) || ""); return o.join("\n"); }); console.log(t.slice(-360).replace(/\n+/g, " | "));
  ok(/index\.html/.test(t) && /web ok/.test(t), "mini shell: ls + node run file"); ok(/not available in the web version/.test(t), "mini shell: npm explains it is unavailable");
  await page.screenshot({ path: "/tmp/cf-dev/w1.png" });
  // secrets + PIN gating
  const sec = await page.evaluate(async () => { const { N } = await import("/js/core/bridge.js"); await N.secret.set("ai.test", "sk-test-1234567890abcd"); const mask = await N.secret.mask("ai.test"); let denied = false; try { await N.secret.reveal("ai.test", "nope"); } catch { denied = true; }
    const s = await N.auth.setPin("2468"); const bad = await N.auth.verifyPin("0000"); const good = await N.auth.verifyPin("2468"); const val = await N.secret.reveal("ai.test", good.token); return { mask, denied, set: s.ok, bad: bad.ok, good: good.ok, val }; });
  ok(sec.mask.startsWith("sk-") && !sec.mask.includes("1234567890") && sec.denied && sec.set && !sec.bad && sec.good && sec.val === "sk-test-1234567890abcd", "API key masked; reveal needs PIN token; wrong PIN rejected: " + JSON.stringify(sec));
  const stored = await page.evaluate(() => new Promise((res) => { const r = indexedDB.open("codeforge-web"); r.onsuccess = () => { const q = r.result.transaction("kv").objectStore("kv").get("secrets"); q.onsuccess = () => res(JSON.stringify(q.result, (k, v) => (v instanceof ArrayBuffer || ArrayBuffer.isView(v) ? "<bytes>" : v))); }; }));
  ok(!stored.includes("sk-test"), "stored secrets are encrypted at rest in IndexedDB");
  // persistence across reload
  await page.evaluate(async () => (await import("/js/core/settings.js")).settings.set("ui.iconTheme", "seti")); await page.evaluate(async () => (await import("/js/core/settings.js")).settings.set("editor.fontSize", 19)); await page.waitForTimeout(600);
  await page.reload(); await page.waitForFunction(() => window.__cfReady, null, { timeout: 40000 });
  ok(await page.evaluate(async () => (await import("/js/core/bridge.js")).N.fs.exists("/home/proj/src/app.js")), "files persist after reload");
  ok(await page.evaluate(async () => (await import("/js/core/settings.js")).settings.get("editor.fontSize")) === 19, "settings persist after reload (web)");
  ok((await page.evaluate(async () => (await import("/js/core/bridge.js")).N.secret.names())).includes("ai.test"), "secrets persist after reload");
  // unsupported features fail gracefully
  const live = await page.evaluate(async () => { try { await (await import("/js/core/bridge.js")).N.live.start({ root: "/home/proj", port: 5500 }); return "started"; } catch (e) { return e.message; } }); ok(live === "started", "live server starts in the browser (service worker): " + live);
  const real = logs.filter((l) => !/favicon|DevTools|serviceWorker|sandbox attribute/.test(l)); console.log("console:", real.slice(0, 8));
  await browser.close(); console.log(fails ? `${fails} FAILED` : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
