// Top / bottom sheets, crash recorder UI, preview modes, terminal resync.
const { launch } = require("./lib"); const fs = require("fs");
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
for (const f of ["state.json", "settings.json"]) fs.rmSync("/tmp/cf-dev/cf/" + f, { force: true });
(async () => {
  for (const mobile of [false, true]) {
    const tag = mobile ? "[mobile] " : "[desktop] ";
    const { browser, page, logs } = await launch({ mobile });
    await page.waitForFunction(() => window.__cfReady || window.__cfError, null, { timeout: 40000 });
    ok(await page.evaluate(() => !!window.__cfReady), tag + "boot");
    await page.evaluate(async () => { const m = await import("/js/main.js"); await m.openFolder("/tmp/cf-dev/home/proj"); });
    const P = (fn, ...a) => page.evaluate(async ([f, args]) => { const p = await import("/js/ui/panel.js"); return eval("(" + f + ")")(p, ...args); }, [fn.toString(), a]);

    // ---- default layout: everything in the bottom sheet
    ok(JSON.stringify(await P((p) => p.layout())) === JSON.stringify({ top: [], bottom: ["terminal", "preview", "output", "problems"], right: [], page: [] }), tag + "default layout");
    await P((p) => p.show("terminal")); await page.waitForSelector("#panel .xterm-screen");
    ok(await page.evaluate(() => !document.getElementById("panel").classList.contains("hidden")), tag + "bottom sheet opens with terminal");
    await page.waitForTimeout(600);
    await page.keyboard.type("echo SHEETS_OK\n"); await page.waitForTimeout(700);
    ok(/SHEETS_OK/.test(await page.evaluate(() => document.querySelector("#panel .xterm-rows").textContent)), tag + "terminal works in bottom sheet");

    // ---- move terminal to the top sheet
    await P((p) => { p.move("terminal", "top"); p.show("terminal"); });
    await page.waitForTimeout(500);
    ok(await page.evaluate(() => !!document.querySelector("#sheet-top .sheet-body #pane-terminal") && !document.getElementById("sheet-top").classList.contains("hidden")), tag + "terminal now lives in the top sheet");
    ok(await page.evaluate(() => document.getElementById("panel").classList.contains("hidden")), tag + "bottom sheet closed (its tab left)");
    ok(/SHEETS_OK/.test(await page.evaluate(() => document.querySelector("#sheet-top .xterm-rows").textContent)), tag + "terminal scrollback survived the move");
    const dims = await page.evaluate(() => { const r = document.querySelector("#sheet-top .xterm-screen").getBoundingClientRect(); return [r.width, r.height]; });
    ok(dims[0] > 150 && dims[1] > 40, tag + "terminal has size in top sheet: " + dims.map(Math.round));
    await page.keyboard.type("echo TOP_OK\n"); await page.waitForTimeout(600);
    ok(/TOP_OK/.test(await page.evaluate(() => document.querySelector("#sheet-top .xterm-rows").textContent)), tag + "typing still works in the top sheet");

    // ---- AI assistant docked to the bottom sheet, sidebar redirect
    await P((p) => { p.move("ai", "bottom"); });
    await page.evaluate(async () => { const m = await import("/js/main.js"); m.showView("ai", { toggle: false }); });
    await page.waitForTimeout(600);
    ok(await page.evaluate(() => !!document.querySelector("#panel #view-ai.pane.on") && !document.getElementById("panel").classList.contains("hidden")), tag + "AI view opens inside the bottom sheet");
    ok(await page.evaluate(() => document.querySelector("#view-ai").children.length > 0), tag + "docked AI view got built");
    // both sheets open: editor keeps room
    const ed = await page.evaluate(() => document.getElementById("editor-area").getBoundingClientRect().height);
    ok(ed >= 85, tag + "editor keeps height with two sheets open: " + Math.round(ed));
    // add-menu and tab menu
    await page.click("#panel .sheet-add"); await page.waitForSelector(".ctx");
    const addItems = await page.evaluate(() => [...document.querySelectorAll(".ctx .ctx-label")].map((e) => e.textContent));
    ok(addItems.some((t) => /Terminal/.test(t)) && addItems.some((t) => /Source Control/.test(t)), tag + "+ menu lists views: " + addItems.slice(0, 5).join("|"));
    await page.evaluate(async () => (await import("/js/core/ui.js")).closeMenu());
    await page.click('#panel .ptab[data-panel="ai"]', { button: "right" }).catch(() => {}); await page.waitForTimeout(250);
    const tabItems = await page.evaluate(() => [...document.querySelectorAll(".ctx .ctx-label")].map((e) => e.textContent));
    ok(tabItems.some((t) => /Top Sheet/.test(t)) && tabItems.some((t) => /Sidebar/.test(t)), tag + "tab menu: " + tabItems.join("|"));
    await page.evaluate(async () => (await import("/js/core/ui.js")).closeMenu());

    // ---- persistence across reload
    await page.waitForTimeout(500);
    await page.evaluate(async () => { const { settings } = await import("/js/core/settings.js"); await settings.flush(); });
    await page.reload(); await page.waitForFunction(() => window.__cfReady, null, { timeout: 40000 });
    const lay = await P((p) => p.layout());
    ok(lay.top.includes("terminal") && lay.bottom.includes("ai"), tag + "layout persisted: " + JSON.stringify(lay));
    ok(await page.evaluate(() => !!document.querySelector("#sheet-top #pane-terminal") && !!document.querySelector("#panel #view-ai")), tag + "DOM restored after reload");

    // ---- back button closes the sheet opened last, one at a time
    await P((p) => { p.show("terminal"); p.show("ai"); });
    ok(await page.evaluate(() => window.__cfBack()) === true && await page.evaluate(() => document.getElementById("panel").classList.contains("hidden")), tag + "back closes the last opened sheet first");
    ok(await page.evaluate(() => window.__cfBack()) === true && await page.evaluate(() => document.getElementById("sheet-top").classList.contains("hidden")), tag + "back closes the other sheet next");

    // ---- reset
    await P((p) => p.resetLayout());
    ok(JSON.stringify(await P((p) => p.layout())) === JSON.stringify({ top: [], bottom: ["terminal", "preview", "output", "problems"], right: [], page: [] }), tag + "reset layout");
    ok(await page.evaluate(() => !!document.querySelector("#sidebar #view-ai")), tag + "AI view back in sidebar");
    await page.screenshot({ path: `/tmp/cf-dev/sheets-${mobile ? "m" : "d"}.png` });

    // ---- crash recorder UI
    await page.evaluate(() => window.dispatchEvent(new ErrorEvent("error", { message: "boom-from-test", filename: "x.js", lineno: 3, error: new Error("boom-from-test") })));
    await page.waitForTimeout(400);
    const list = await page.evaluate(async () => (await import("/js/core/bridge.js")).N.crash.list());
    ok(list.some((r) => r.kind === "js-error" && /boom-from-test/.test(r.title)), tag + "JS error recorded as a report");
    await page.evaluate(async () => { const c = await import("/js/ui/crashes.js"); c.openReports(); });
    await page.waitForSelector(".crash-row");
    ok((await page.textContent(".crash-list")).includes("boom-from-test"), tag + "report listed in viewer");
    await page.click(".crash-row"); await page.waitForSelector(".crash-text");
    const txt = await page.textContent(".crash-text");
    ok(/CodeForge report/.test(txt) && /boom-from-test/.test(txt) && /breadcrumbs/.test(txt), tag + "report text has stack and breadcrumbs");
    await page.keyboard.press("Escape"); await page.keyboard.press("Escape");
    // startup notice from a simulated renderer recovery (let the boot-time check finish first, it would consume the report)
    await page.waitForTimeout(2200);
    await page.evaluate(async () => { const { N } = await import("/js/core/bridge.js"); await N.crash.report({ kind: "low-memory", title: "Process main ended: low-memory", detail: "test\npreview load http://127.0.0.1:5500/", fatal: true }); });
    const note = await page.evaluate(async () => { const c = await import("/js/ui/crashes.js"); const { settings } = await import("/js/core/settings.js"); settings.set("preview.mode", "inline"); c.startupCheck({ openIsolated: true }); await new Promise((r) => setTimeout(r, 2600)); return document.querySelector(".toast")?.textContent || ""; });
    ok(/stopped unexpectedly|restarted/.test(note), tag + "startup notice shown: " + note.slice(0, 70));
    ok(await page.evaluate(() => !!document.querySelector(".modal-wrap")), tag + "offers isolated preview after a likely preview crash");
    await page.evaluate(() => [...document.querySelectorAll(".modal-foot button")].find((b) => /separate window/i.test(b.textContent))?.click());
    await page.waitForTimeout(300);
    ok(await page.evaluate(async () => (await import("/js/core/settings.js")).settings.get("preview.mode")) === "window", tag + "preview mode switched to window");

    // ---- settings page shows Diagnostics + font section
    await page.evaluate(async () => { (await import("/js/ui/settingsview.js")).open(); });
    await page.waitForSelector(".set-diag .set-row");
    ok((await page.textContent(".set-diag")).includes("Crash reports"), tag + "Settings → Diagnostics");

    // ---- preview modes
    await page.evaluate(async () => { window.__pv = []; const { N } = await import("/js/core/bridge.js"); N.on("devhost.preview", (d) => window.__pv.push(d)); });
    await page.evaluate(async () => { const m = await import("/js/main.js"); const l = await m.api.feat("live"); await l.previewFile("/tmp/cf-dev/home/proj/index.html"); });
    await page.waitForTimeout(500);
    ok((await page.evaluate(() => window.__pv.length)) === 1, tag + "window mode: preview sent to isolated window");
    ok(await page.evaluate(() => !document.querySelector("#pane-preview iframe")?.getAttribute("src")), tag + "window mode: nothing loaded inline");
    await page.evaluate(async () => { const m = await import("/js/main.js"); const l = await m.api.feat("live"); await l.previewFile("/tmp/cf-dev/home/proj/index.html", { inline: true }); });
    await page.waitForFunction(() => document.querySelector("#pane-preview iframe")?.getAttribute("src"), null, { timeout: 8000 });
    ok(true, tag + "inline preview still available on demand");
    // console cap (page floods the console)
    await page.waitForFunction(() => document.querySelector("#pane-preview iframe")?.contentDocument === null || true); for (let i = 0; i < 40 && !page.frames().find((f) => /:5500/.test(f.url())); i++) await page.waitForTimeout(200);
    await page.frames().find((f) => /:5500/.test(f.url())).evaluate(() => { for (let i = 0; i < 1500; i++) parent.postMessage({ __cf: 1, type: "console", level: "log", args: ["n" + i] }, "*"); });
    await page.waitForTimeout(800);
    const lines = await page.evaluate(() => document.querySelectorAll("#pane-preview .pv-line").length);
    ok(lines > 0 && lines <= 400, tag + "preview console is capped: " + lines + " lines");
    // low-memory event unloads the inline page
    await page.evaluate(async () => { const { bridgeEvents } = await import("/js/core/bridge.js"); bridgeEvents.emit("app.memory", { level: 15 }); });
    await page.waitForTimeout(300);
    ok(await page.evaluate(() => document.querySelector("#pane-preview iframe").src === "about:blank"), tag + "low memory pauses the inline preview");

    // ---- terminal resync keeps the screen
    await page.evaluate(async () => { const { bridgeEvents } = await import("/js/core/bridge.js"); const t = await import("/js/ui/terminal.js"); window.__tid = t.get().id; });
    await P((p) => p.show("terminal")); await page.waitForTimeout(300);
    await page.evaluate(async () => { const { bridgeEvents } = await import("/js/core/bridge.js"); bridgeEvents.emit("term.resync", { id: window.__tid }); });
    await page.waitForTimeout(700);
    ok(await page.evaluate(() => /root@|\$|#/.test(document.querySelector(".xterm-rows")?.textContent || "")), tag + "terminal resync redraws from replay");

    const bad = logs.filter((l) => !/boom-from-test|sandbox|reqfail: http:\/\/127\.0\.0\.1:(5500|5173)/.test(l));
    ok(!bad.length, tag + "no unexpected console errors" + (bad.length ? ": " + bad.slice(0, 3).join(" | ") : ""));
    await browser.close();
  }
  console.log(fails ? fails + " FAILED" : "ALL OK"); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
