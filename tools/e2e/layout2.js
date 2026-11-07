// e2e (dev host): right sheet (fixed width) + page placement, drawer icon strip + edge swipe, menu bar on wide screens,
// terminal height survives viewport shrink/restore (soft keyboard), device font defaults, split without recursion.
const { launch } = require("./lib"); const fs = require("fs");
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
for (const f of ["state.json", "settings.json"]) fs.rmSync("/tmp/cf-dev/cf/" + f, { force: true });
(async () => {
  for (const mobile of [false, true]) {
    const tag = mobile ? "[phone] " : "[desktop] ";
    const { browser, page, logs } = await launch({ mobile });
    await page.waitForFunction(() => window.__cfReady || window.__cfError, null, { timeout: 40000 });
    ok(await page.evaluate(() => !!window.__cfReady), tag + "boot");
    await page.evaluate(async () => { const m = await import("/js/main.js"); await m.openFolder("/tmp/cf-dev/home/proj"); });
    const P = (fn, ...a) => page.evaluate(async ([f, args]) => { const p = await import("/js/ui/panel.js"); return eval("(" + f + ")")(p, ...args); }, [fn.toString(), a]);
    const fs0 = await page.evaluate(async () => { const { settings } = await import("/js/core/settings.js"); return [settings.get("editor.fontSize"), settings.get("terminal.fontSize")]; });
    ok(mobile ? fs0[0] === 12 && fs0[1] === 12 : fs0[0] === 14 && fs0[1] === 14, tag + "default font sizes " + fs0);

    // right sheet
    await P((p) => { p.move("terminal", "right"); p.show("terminal"); });
    await page.waitForSelector("#sheet-right .xterm-screen"); await page.waitForTimeout(400);
    const rw = await page.evaluate(() => { const r = document.getElementById("sheet-right").getBoundingClientRect(); const e = document.getElementById("group-0").getBoundingClientRect(); return { w: r.width, right: r.right, vw: innerWidth, h: r.height, editorRight: e.right }; });
    ok(rw.w > 250 && Math.abs(rw.right - rw.vw) < 2, tag + "right sheet docked to the right edge, width " + Math.round(rw.w));
    ok(await page.evaluate(() => !document.querySelector("#sheet-right .sash") && !document.getElementById("sash-right")), tag + "right sheet has no resize handle");
    if (!mobile) ok(rw.editorRight <= rw.vw - rw.w + 2, tag + "editor shrinks beside the right sheet");
    ok(await page.evaluate(() => { const r = document.querySelector("#sheet-right .xterm-screen").getBoundingClientRect(); return r.width > 150 && r.height > 60; }), tag + "terminal sized inside right sheet");
    await P((p) => p.hide("right")); ok(await page.evaluate(() => document.getElementById("sheet-right").classList.contains("hidden")), tag + "right sheet closes");

    // page
    await P((p) => { p.move("ai", "page"); p.show("ai"); }); await page.waitForTimeout(400);
    const pg = await page.evaluate(() => { const r = document.getElementById("sheet-page").getBoundingClientRect(), w = document.getElementById("workbench").getBoundingClientRect(); return { dw: Math.abs(r.width - w.width), dh: Math.abs(r.height - w.height), back: !!document.querySelector("#sheet-page .sheet-back"), vis: getComputedStyle(document.querySelector("#sheet-page .sheet-back")).display !== "none" }; });
    ok(pg.dw < 2 && pg.dh < 2 && pg.back && pg.vis, tag + "AI as a full page with a back button " + JSON.stringify(pg));
    await page.click("#sheet-page .sheet-back"); ok(await page.evaluate(() => document.getElementById("sheet-page").classList.contains("hidden")), tag + "back closes the page");
    ok(JSON.stringify(await P((p) => p.layout())).includes('"page":["ai"]'), tag + "layout remembers page placement");
    await P((p) => p.resetLayout());
    ok(JSON.stringify(await P((p) => p.layout())) === JSON.stringify({ top: [], bottom: ["terminal", "preview", "output", "problems"], right: ["ai"], page: [] }), tag + "reset layout");

    // terminal height survives viewport changes (keyboard)
    await P((p) => p.show("terminal")); await page.waitForTimeout(400);
    const vp = page.viewportSize(); const before = await page.evaluate(() => document.getElementById("panel").getBoundingClientRect().height);
    await page.evaluate(() => { document.querySelector("#sash-h"); });
    // user resizes the sheet via the stored state
    await page.evaluate(async () => { const { settings } = await import("/js/core/settings.js"); document.getElementById("panel").style.setProperty("--panel-h", "300px"); settings.state.panelHeight = 300; });
    await page.waitForTimeout(150);
    await page.setViewportSize({ width: vp.width, height: Math.round(vp.height * 0.5) }); await page.waitForTimeout(400);
    const small = await page.evaluate(() => document.getElementById("panel").getBoundingClientRect().height);
    await page.setViewportSize(vp); await page.waitForTimeout(500);
    const after = await page.evaluate(() => ({ h: document.getElementById("panel").getBoundingClientRect().height, v: document.getElementById("panel").style.getPropertyValue("--panel-h") }));
    ok(small < 300, tag + "sheet is capped while the viewport is small (" + Math.round(small) + ")");
    ok(Math.abs(after.h - 300) < 3 && after.v === "300px", tag + "sheet returns to the saved 300px after the keyboard closes (" + Math.round(after.h) + ", var=" + after.v + ")");

    // split: no recursion
    await page.evaluate(async () => { const e = await import("/js/ui/editor.js"); await e.openFile("/tmp/cf-dev/home/proj/README.md"); });
    await page.evaluate(async () => { const e = await import("/js/ui/editor.js"); e.toggleSplit(); });
    await page.waitForTimeout(500);
    ok(!logs.some((l) => /call stack/i.test(l)), tag + "split editor: no 'Maximum call stack size exceeded'");
    ok(await page.evaluate(() => !document.getElementById("group-1").classList.contains("hidden")), tag + "split group visible");

    if (mobile) {
      // drawer icon strip
      await page.click('#bottomnav [data-nav="explorer"]'); await page.waitForTimeout(300);
      ok(await page.evaluate(() => document.querySelectorAll("#side-nav .sn-btn[data-view]").length === 6 && getComputedStyle(document.getElementById("side-nav")).display !== "none"), tag + "drawer shows 6 small icon buttons");
      await page.click('#side-nav [data-view="search"]'); await page.waitForTimeout(250);
      ok(await page.evaluate(() => document.getElementById("view-search").classList.contains("active")), tag + "icon button switches the drawer view");
      await page.evaluate(() => window.__cfBack()); await page.waitForTimeout(300);
      ok(await page.evaluate(() => !document.getElementById("sidebar").classList.contains("open")), tag + "back button closes the drawer");
      // edge swipe opens drawer
      const swipe = (x0, x1, y = 500) => page.evaluate(([a, b, yy]) => {
        const mk = (t, x) => new Touch({ identifier: 1, target: document.body, clientX: x, clientY: yy });
        const tgt = document.elementFromPoint(a, yy) || document.body;
        const ev = (type, x) => tgt.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === "touchend" ? [] : [new Touch({ identifier: 1, target: tgt, clientX: x, clientY: yy })], changedTouches: [new Touch({ identifier: 1, target: tgt, clientX: x, clientY: yy })] }));
        ev("touchstart", a); ev("touchmove", (a + b) / 2); ev("touchend", b);
      }, [x0, x1, y]);
      await swipe(8, 200); await page.waitForTimeout(300);
      ok(await page.evaluate(() => document.getElementById("sidebar").classList.contains("open")), tag + "swipe from the left edge opens the drawer");
      await swipe(300, 60); await page.waitForTimeout(300);
      ok(await page.evaluate(() => !document.getElementById("sidebar").classList.contains("open")), tag + "swipe left closes the drawer");
      await P((p) => { p.move("terminal", "right"); p.hide(); });
      await swipe(404, 150); await page.waitForTimeout(300);
      ok(await page.evaluate(() => !document.getElementById("sheet-right").classList.contains("hidden")), tag + "swipe from the right edge opens the right sheet");
      await swipe(200, 380); await page.waitForTimeout(300);
      ok(await page.evaluate(() => document.getElementById("sheet-right").classList.contains("hidden")), tag + "swipe right closes the right sheet");
    } else {
      ok(await page.evaluate(() => getComputedStyle(document.getElementById("menubar")).display !== "none" && document.querySelectorAll("#menubar .mb-item").length === 8), tag + "VS Code-style menu bar visible (8 menus)");
      await page.click('#menubar .mb-item:has-text("File")'); await page.waitForTimeout(250);
      ok(await page.evaluate(() => /Open Folder/.test(document.querySelector(".ctx")?.textContent || "")), tag + "File menu opens with items");
      await page.waitForTimeout(300); await page.mouse.click(640, 600); await page.waitForTimeout(300);
      await page.click("#lt-right"); await page.waitForTimeout(500);
      ok(await page.evaluate(() => !document.getElementById("sheet-right").classList.contains("hidden")), tag + "layout toggle opens the right sheet");
    }
    // minimap visible when switched on (also on a phone)
    await page.evaluate(async () => { const { settings } = await import("/js/core/settings.js"); settings.set("editor.minimap", true); });
    await page.waitForTimeout(600);
    ok(await page.evaluate(() => { const m = document.querySelector(".monaco-editor .minimap"); if (!m) return false; const r = m.getBoundingClientRect(); return r.width > 20 && r.height > 40 && getComputedStyle(m).display !== "none"; }), tag + "minimap is visible with the setting on");
    // context menu: area aware + scrollable
    const cm = await page.evaluate(async () => {
      const { contextMenu } = await import("/js/core/ui.js");
      contextMenu(Array.from({ length: 40 }, (_, i) => ({ label: "Item " + i, run() {} })), innerWidth - 10, innerHeight - 30);
      await new Promise((r) => setTimeout(r, 100));
      const el = document.querySelector(".ctx"), r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, vh: innerHeight, vw: innerWidth, scroll: el.scrollHeight > el.clientHeight, ov: getComputedStyle(el).overflowY };
    });
    ok(cm.top >= 0 && cm.bottom <= cm.vh && cm.left >= 0 && cm.right <= cm.vw && cm.scroll && /auto|scroll/.test(cm.ov), tag + "context menu stays inside the screen and scrolls " + JSON.stringify(cm));
    await page.waitForTimeout(500); await page.mouse.click(5, 5); await page.waitForTimeout(300);
    const bad = logs.filter((l) => !/favicon|iframe|UNKNOWN touch|ERR_|net::|Failed to load resource/i.test(l));
    ok(!bad.length, tag + "no console errors" + (bad.length ? " " + JSON.stringify(bad.slice(0, 3)) : ""));
    await browser.close();
    for (const f of ["state.json", "settings.json"]) fs.rmSync("/tmp/cf-dev/cf/" + f, { force: true });
  }
  console.log(fails ? fails + " FAILED" : "ALL PASSED"); process.exit(fails ? 1 : 0);
})();
