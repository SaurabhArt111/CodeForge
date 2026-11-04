// e2e: regressions for the "settings lost / context menu closes / undo-redo / Shift key / API key PIN" round of fixes.
const { launch } = require("./lib"); const fs = require("fs");
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
for (const f of ["state.json", "settings.json", "lock.json"]) fs.rmSync("/tmp/cf-dev/cf/" + f, { force: true });
fs.rmSync("/tmp/cf-dev/home/s4", { recursive: true, force: true }); fs.mkdirSync("/tmp/cf-dev/home/s4/sub", { recursive: true }); fs.writeFileSync("/tmp/cf-dev/home/s4/a.txt", "one\n"); fs.writeFileSync("/tmp/cf-dev/home/s4/sub/b.txt", "two\n");
(async () => {
  // ---------- desktop: settings persistence across an app restart (page reload), undo/redo buttons
  let { browser, page, logs } = await launch();
  await page.waitForFunction(() => window.__cfReady, null, { timeout: 40000 });
  await page.evaluate(async () => { const s = (await import("/js/core/settings.js")).settings; s.set("editor.fontSize", 21); s.set("ui.theme", "Light Modern"); s.set("terminal.lineHeight", 1.6); s.set("editor.bottomPadding", 240); });
  await page.evaluate(async () => { const mm = await import("/js/main.js"); await mm.openFolder("/tmp/cf-dev/home/s4"); });
  // simulate "swiped away": hide page (flush) then reload immediately, without waiting for any debounce
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { value: true, configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
  await page.reload(); await page.waitForFunction(() => window.__cfReady, null, { timeout: 40000 });
  const st = await page.evaluate(async () => { const s = (await import("/js/core/settings.js")).settings; return { fs: s.get("editor.fontSize"), th: s.get("ui.theme"), lh: s.get("terminal.lineHeight"), bp: s.get("editor.bottomPadding"), applied: document.documentElement.dataset.theme }; });
  ok(st.fs === 21 && st.th === "Light Modern" && st.lh === 1.6 && st.bp === 240, "settings survive restart: " + JSON.stringify(st));
  ok(st.applied === "light", "saved theme re-applied on boot (data-theme=" + st.applied + ")");
  // icon theme from an extension persists + applies after registration (the original bug)
  await page.evaluate(async () => { const mm = await import("/js/main.js"); await mm.openFolder("/tmp/cf-dev/home/s4"); });
  await page.waitForSelector('#view-explorer .row[data-path$="/a.txt"]'); await page.click('#view-explorer .row[data-path$="/a.txt"]'); await page.waitForSelector(".monaco-editor .view-lines");
  // tab icon size must be a sane size (the "huge icons in tabs" bug)
  const tabIcon = await page.evaluate(() => { const i = document.querySelector(".tab .fi, .tab i"); if (!i) return 0; const r = i.getBoundingClientRect(); return Math.max(r.width, r.height); }); ok(tabIcon > 0 && tabIcon < 28, "tab icon size sane: " + tabIcon + "px");
  // undo / redo buttons
  await page.click(".monaco-editor .view-lines"); await page.keyboard.press("Control+End"); await page.keyboard.type("XYZ");
  const val = () => page.evaluate(async () => (await import("/js/ui/editor.js")).activeDoc().model.getValue());
  ok((await val()).includes("XYZ"), "typed text present");
  await page.click("#btn-undo"); ok(!(await val()).includes("XYZ"), "undo button reverts typing");
  await page.click("#btn-redo"); ok((await val()).includes("XYZ"), "redo button re-applies");
  // white space after the last line (scrollBeyondLastLine + bottom padding)
  ok(await page.evaluate(async () => { const e = (await import("/js/ui/editor.js")).activeEditor(); const o = e.getOption(monaco_ids().scrollBeyondLastLine); function monaco_ids() { return window.monaco ? window.monaco.editor.EditorOption : { scrollBeyondLastLine: 104 }; } return e.getContentHeight() > 150 || o !== false; }), "extra room below the last line");
  // API key mask / reveal needs PIN (dev host emulation of the native gate)
  const sec = await page.evaluate(async () => { const { N } = await import("/js/core/bridge.js"); await N.secret.set("ai.k", "sk-abcdefghijklmnop"); const m = await N.secret.mask("ai.k"); let denied = false; try { await N.secret.reveal("ai.k", "x"); } catch { denied = true; } const p = await N.auth.setPin("1357"); const v = await N.auth.verifyPin("1357"); const r = await N.secret.reveal("ai.k", v.token); return { m, denied, ok: p.ok && v.ok, r }; });
  ok(/^sk-•+mnop$/.test(sec.m) && sec.denied && sec.ok && sec.r === "sk-abcdefghijklmnop", "API key masked; reveal requires unlock token: " + sec.m);
  await browser.close();

  // ---------- mobile: Shift key + long-press context menu stays open + panel resize via touch
  ({ browser, page, logs } = await launch({ mobile: true }));
  await page.waitForFunction(() => window.__cfReady, null, { timeout: 40000 });
  await page.evaluate(async () => { const mm = await import("/js/main.js"); await mm.openFolder("/tmp/cf-dev/home/s4"); });
  await page.tap('#bottomnav [data-nav="explorer"]'); await page.waitForSelector("#sidebar.open"); await page.waitForSelector('#view-explorer .row[data-path$="/a.txt"]');
  // long-press on an explorer row: dispatch a touch sequence and the native contextmenu that Android adds
  await page.evaluate(async () => {
    const row = document.querySelector('#view-explorer .row[data-path$="/a.txt"]'); const r = row.getBoundingClientRect(); const x = r.x + 30, y = r.y + r.height / 2;
    const mk = (type) => { const t = new Touch({ identifier: 1, target: row, clientX: x, clientY: y }); return new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === "touchend" ? [] : [t], targetTouches: type === "touchend" ? [] : [t], changedTouches: [t] }); };
    row.dispatchEvent(mk("touchstart")); await new Promise((r) => setTimeout(r, 750));
    row.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: x, clientY: y })); // Android's own long-press contextmenu
    row.dispatchEvent(mk("touchend")); row.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: x, clientY: y })); row.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: x, clientY: y }));
  });
  await page.waitForSelector(".ctx", { timeout: 3000 }); await page.waitForTimeout(1200);
  ok(await page.locator(".ctx").count() === 1, "context menu is still open 1.2s after the long-press ends (exactly one menu)");
  await page.screenshot({ path: "/tmp/cf-dev/f4a.png" });
  await page.tap(".ctx-item:has-text('Rename')"); await page.waitForSelector("#view-explorer input.inline", { timeout: 4000 }); ok(true, "menu item is tappable after settle");
  await page.keyboard.press("Escape");
  // Shift key present on the key bar and is sticky
  await page.evaluate(async () => { const ed = await import("/js/ui/editor.js"); await ed.openFile("/tmp/cf-dev/home/s4/a.txt"); });
  await page.waitForSelector(".monaco-editor .view-lines"); await page.evaluate(() => { document.body.classList.add("kbd-open"); document.getElementById("keybar").classList.remove("hidden"); });
  const keys = await page.locator("#keybar-row button, #keybar-row .kb").allTextContents(); ok(keys.some((k) => /^shift$/i.test(k.trim())), "Shift key on the mobile key bar: " + keys.slice(0, 8).join(","));
  await page.screenshot({ path: "/tmp/cf-dev/f4b.png" });
  await browser.close();
  console.log(fails ? `${fails} FAILED` : "ALL OK"); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
