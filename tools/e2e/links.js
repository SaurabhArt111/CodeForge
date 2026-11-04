// e2e: "o" (open in browser) chain + link chip for selected URLs in terminal and editor.
const { launch } = require("./lib"); const fs = require("fs");
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
for (const f of ["state.json", "settings.json"]) fs.rmSync("/tmp/cf-dev/cf/" + f, { force: true });
fs.rmSync("/tmp/cf-dev/home/lk", { recursive: true, force: true }); fs.mkdirSync("/tmp/cf-dev/home/lk", { recursive: true });
fs.writeFileSync("/tmp/cf-dev/home/lk/README.md", "# Demo\n\nOpen https://example.com/docs?a=1 now, or http://localhost:5173/ (dev server).\n");
(async () => {
  const { browser, page, logs } = await launch();
  await page.waitForFunction(() => window.__cfReady, null, { timeout: 40000 });
  await page.evaluate(async () => { const { N: N0 } = await import("/js/core/bridge.js"); for (const t of await N0.term.list()) await N0.term.close(t.id).catch(() => {}); });
  await page.evaluate(async () => { window.__opened = []; const { N } = await import("/js/core/bridge.js"); N.on("devhost.openUrl", (d) => window.__opened.push(d.url)); const mm = await import("/js/main.js"); await mm.openFolder("/tmp/cf-dev/home/lk"); });
  const opened = () => page.evaluate(() => window.__opened.slice());
  // 1) OSC url verb (what xdg-open / $BROWSER / vite "o" produce) → default browser, not the in-app preview
  await page.click("#btn-term"); await page.waitForSelector(".term-body.on .xterm-screen"); await page.waitForTimeout(900); await page.click(".term-body.on .xterm-screen");
  await page.keyboard.type("printf '\\033]7770;url;http://0.0.0.0:5173/\\007'\r"); await page.waitForFunction(() => window.__opened.includes("http://localhost:5173/"), null, { timeout: 8000 }).catch(() => {});
  ok((await opened()).includes("http://localhost:5173/"), "OSC url verb → system browser (0.0.0.0 rewritten): " + JSON.stringify(await opened()));
  ok((await page.locator(".tab:has-text('Preview')").count()) === 0, "no in-app preview tab opened by default");
  // 2) the real chain: node spawns xdg-open → node-patch intercepts → OSC → browser
  await page.keyboard.type("clear\r"); await page.waitForTimeout(300);
  await page.keyboard.type(`NODE_OPTIONS="--require /home/claude/build/CodeForge/app/src/main/assets/env/node-patch.js" node -e "require('child_process').spawn('xdg-open',['http://localhost:4000/x'],{stdio:'ignore',detached:true}).on('exit',c=>console.log('opener-exit',c))"\r`);
  await page.waitForFunction(() => window.__opened.includes("http://localhost:4000/x"), null, { timeout: 8000 }).then(() => ok(true, "node spawn('xdg-open') intercepted → system browser"), () => ok(false, "node spawn('xdg-open') intercepted: " + JSON.stringify([])));
  // 3) selecting a URL in the terminal shows the chip → click opens in browser
  await page.keyboard.type("clear; echo see https://example.org/path?q=1 ok\r"); await page.waitForTimeout(700);
  await page.evaluate(async () => { const t = (await import("/js/ui/terminal.js")).get(); const buf = t.xt.buffer.active; for (let y = 0; y < t.xt.rows; y++) { const l = buf.getLine(y)?.translateToString(true) || ""; const i = l.indexOf("https://example.org"); if (i >= 0 && !l.includes("echo")) { t.xt.select(i, y, "https://example.org/path?q=1".length); return; } } });
  await page.waitForSelector(".link-chip", { timeout: 4000 }); ok((await page.locator(".link-chip .lc-url").getAttribute("title")) === "https://example.org/path?q=1", "terminal selection of a URL shows the link chip");
  await page.screenshot({ path: "/tmp/cf-dev/l1.png" });
  await page.click(".link-chip .lc-btn.primary"); await page.waitForFunction(() => window.__opened.includes("https://example.org/path?q=1"), null, { timeout: 4000 }).then(() => ok(true, "chip → Open in browser"), () => ok(false, "chip → Open in browser"));
  // 4) context menu on a URL under the pointer (no selection)
  const pt = await page.evaluate(async () => { const t = (await import("/js/ui/terminal.js")).get(); t.xt.clearSelection(); const buf = t.xt.buffer.active; const scr = t.xt.element.querySelector(".xterm-screen").getBoundingClientRect(); for (let y = 0; y < t.xt.rows; y++) { const l = buf.getLine(y)?.translateToString(true) || ""; const i = l.indexOf("https://example.org"); if (i >= 0 && !l.includes("echo")) return { x: scr.left + (i + 8.5) * scr.width / t.xt.cols, y: scr.top + (y + 0.5) * scr.height / t.xt.rows }; } });
  await page.mouse.click(pt.x, pt.y, { button: "right" }); await page.waitForSelector(".ctx");
  const items = await page.locator(".ctx-item").allTextContents(); ok(items.some((x) => /Open Link in Browser/.test(x)) && items.some((x) => /Copy Link/.test(x)), "terminal context menu offers link actions: " + items.slice(0, 3).join("|"));
  await page.screenshot({ path: "/tmp/cf-dev/l2.png" }); await page.keyboard.press("Escape"); await page.evaluate(() => document.querySelector(".ctx-back")?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));
  // 5) editor: select URL → chip; cursor tap inside URL → chip; context-menu action exists
  await page.evaluate(async () => { const ed = await import("/js/ui/editor.js"); await ed.openFile("/tmp/cf-dev/home/lk/README.md"); });
  await page.waitForSelector(".monaco-editor .view-lines"); await page.waitForTimeout(500);
  await page.evaluate(async () => { const ed = (await import("/js/ui/editor.js")); const e = ed.activeEditor(); e.focus(); const m = e.getModel(); const l = m.getLineContent(3); const i = l.indexOf("https://"); e.setSelection({ startLineNumber: 3, startColumn: i + 1, endLineNumber: 3, endColumn: i + 1 + "https://example.com/docs?a=1".length }); });
  await page.waitForSelector(".link-chip", { timeout: 3000 }); ok((await page.locator(".link-chip .lc-url").getAttribute("title")) === "https://example.com/docs?a=1", "editor selection of a URL shows the chip");
  await page.click(".link-chip .lc-btn.primary"); await page.waitForFunction(() => window.__opened.includes("https://example.com/docs?a=1"), null, { timeout: 4000 }).then(() => ok(true, "editor chip → default browser"), () => ok(false, "editor chip → default browser"));
  await page.evaluate(async () => { const e = (await import("/js/ui/editor.js")).activeEditor(); e.setPosition({ lineNumber: 3, column: 1 }); });
  await page.waitForTimeout(200); ok((await page.locator(".link-chip").count()) === 0, "no chip when the cursor is not on a URL");
  const lp = await page.evaluate(async () => { const e = (await import("/js/ui/editor.js")).activeEditor(); const m = e.getModel(); const i = m.getLineContent(3).indexOf("localhost") + 3; const p = e.getScrolledVisiblePosition({ lineNumber: 3, column: i }); const r = e.getDomNode().getBoundingClientRect(); return { x: r.left + p.left, y: r.top + p.top + p.height / 2 }; });
  await page.mouse.click(lp.x, lp.y); await page.waitForSelector(".link-chip", { timeout: 3000 }); ok(/localhost:5173/.test(await page.locator(".link-chip .lc-url").innerText()) && (await page.locator(".link-chip .lc-btn:has-text('Preview')").count()) === 1, "clicking inside a URL shows chip (local → Preview option)");
  await page.screenshot({ path: "/tmp/cf-dev/l3.png" });
  // 6) setting: preview mode keeps local URLs in the IDE
  await page.evaluate(async () => { (await import("/js/core/settings.js")).settings.set("ui.openUrlWith", "preview"); const n = window.__opened.length; window.__n = n; const { bus } = await import("/js/core/events.js"); bus.emit("term:cmd", "url", "http://localhost:5173/"); });
  await page.waitForTimeout(800); ok((await opened()).length === await page.evaluate(() => window.__n), "preview mode: local URL not sent to the system browser");
  const real = logs.filter((l) => !/favicon|sandbox attribute|Failed to load resource/.test(l)); console.log("console:", real.slice(0, 6));
  await page.evaluate(async () => { const { N } = await import("/js/core/bridge.js"); for (const t of await N.term.list()) await N.term.close(t.id).catch(() => {}); });
  await browser.close(); console.log(fails ? `${fails} FAILED` : "ALL OK"); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
