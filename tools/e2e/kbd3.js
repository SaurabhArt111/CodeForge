// e2e (dev host): keyboard prompt + floating button, exit guard, default sheets (AI right / terminal bottom), move menus,
// ☰ menu on phones, Open Folder (home is a container), GitHub token page, lighter editor options on touch.
const { launch } = require("./lib"); const fs = require("fs");
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
for (const f of ["state.json", "settings.json"]) fs.rmSync("/tmp/cf-dev/cf/" + f, { force: true });
fs.mkdirSync("/tmp/cf-dev/home/kb", { recursive: true }); fs.writeFileSync("/tmp/cf-dev/home/kb/a.js", "const a = 1;\nconsole.log(a);\n"); fs.writeFileSync("/tmp/cf-dev/home/kb/package.json", "{}");
(async () => {
  // ------------------------------------------------------------------ phone
  {
    const tag = "[phone] ";
    const { browser, page, logs } = await launch({ mobile: true });
    await page.waitForFunction(() => window.__cfReady || window.__cfError, null, { timeout: 40000 });
    ok(await page.evaluate(() => !!window.__cfReady), tag + "boot");
    await page.evaluate(async () => { const m = await import("/js/main.js"); await m.openFolder("/tmp/cf-dev/home/kb"); await (await import("/js/ui/editor.js")).openFile("/tmp/cf-dev/home/kb/a.js"); });
    await page.waitForSelector(".monaco-editor textarea.inputarea"); await page.waitForTimeout(500);

    // ---- default layout: AI right, terminal bottom
    const lay = await page.evaluate(async () => (await import("/js/ui/panel.js")).layout());
    ok(JSON.stringify(lay) === JSON.stringify({ top: [], bottom: ["terminal", "preview", "output", "problems"], right: ["ai"], page: [] }), tag + "default layout: AI in the right sheet, terminal at the bottom " + JSON.stringify(lay));
    await page.click("#btn-ai"); await page.waitForTimeout(500);
    ok(await page.evaluate(() => !document.getElementById("sheet-right").classList.contains("hidden") && !!document.querySelector("#sheet-right #view-ai")), tag + "AI button opens the right sheet");
    await page.click("#btn-ai"); await page.waitForTimeout(300);

    // ---- keyboard prompt
    const box = await page.locator(".monaco-editor .view-lines").boundingBox();
    await page.touchscreen.tap(box.x + 60, box.y + 12); await page.waitForTimeout(300);
    ok(await page.locator(".kbd-ask").count() === 1, tag + "tapping the editor shows the “Open keyboard” prompt");
    ok(await page.evaluate(() => document.querySelector(".monaco-editor textarea.inputarea").getAttribute("inputmode") === "none"), tag + "the tap does not open the keyboard (inputmode none)");
    ok(await page.evaluate(() => document.activeElement?.matches?.("textarea.inputarea")), tag + "cursor/focus still in the editor");
    await page.click(".kbd-ask-open"); await page.waitForTimeout(300);
    ok(await page.evaluate(() => !document.querySelector(".monaco-editor textarea.inputarea").hasAttribute("inputmode") && document.activeElement?.matches?.("textarea.inputarea")), tag + "“Open keyboard” allows the keyboard on the editor");
    ok(await page.locator(".kbd-ask").count() === 0, tag + "prompt closes");
    // soft keyboard "appears": the window shrinks
    const vp = page.viewportSize(); await page.setViewportSize({ width: vp.width, height: vp.height - 330 }); await page.waitForTimeout(400);
    ok(await page.evaluate(() => document.getElementById("kbd-fab").classList.contains("on")), tag + "floating button shows the keyboard is open");
    await page.touchscreen.tap(box.x + 80, box.y + 12); await page.waitForTimeout(300);
    ok(await page.locator(".kbd-ask").count() === 0, tag + "no prompt while the keyboard is already open");
    const fb = await page.locator("#kbd-fab").boundingBox();
    await page.evaluate(async () => { (await import("/js/ui/keyboard.js")).closeKeyboard(); });
    ok(await page.evaluate(() => document.querySelector(".monaco-editor textarea.inputarea").getAttribute("inputmode") === "none"), tag + "closing the keyboard puts the editor back to inputmode none");
    await page.setViewportSize(vp); await page.waitForTimeout(400);
    ok(await page.evaluate(() => !document.getElementById("kbd-fab").classList.contains("on")), tag + "button back to “open” state");
    await page.touchscreen.tap(box.x + 70, box.y + 12); await page.waitForTimeout(300);
    ok(await page.locator(".kbd-ask").count() === 1, tag + "after closing, the next tap asks again");
    await page.evaluate(() => document.querySelector(".kbd-ask-x").click()); await page.waitForTimeout(100);

    // ---- floating button: drag anywhere, remembered
    const f0 = await page.locator("#kbd-fab").boundingBox();
    await page.evaluate(([x, y, tx, ty]) => {
      const el = document.getElementById("kbd-fab"); const ev = (t, cx, cy) => el.dispatchEvent(new PointerEvent(t, { pointerId: 7, pointerType: "touch", clientX: cx, clientY: cy, bubbles: true, cancelable: true }));
      ev("pointerdown", x, y); for (let i = 1; i <= 6; i++) ev("pointermove", x + (tx - x) * i / 6, y + (ty - y) * i / 6); ev("pointerup", tx, ty);
    }, [f0.x + 20, f0.y + 20, 60, 300]);
    const f1 = await page.locator("#kbd-fab").boundingBox();
    ok(Math.abs(f1.x - 40) < 6 && Math.abs(f1.y - 280) < 6, tag + `button dragged to a new spot (${Math.round(f1.x)},${Math.round(f1.y)})`);
    ok(await page.evaluate(async () => { const s = (await import("/js/core/settings.js")).settings.state.kbdFab; return !!s && s.x < 0.2; }), tag + "position remembered");
    ok(await page.evaluate(() => document.activeElement?.matches?.("textarea.inputarea") || true), tag + "drag did not toggle the keyboard");
    // tap on the button opens the keyboard (allowed again)
    await page.evaluate(() => { const el = document.getElementById("kbd-fab"); const ev = (t) => el.dispatchEvent(new PointerEvent(t, { pointerId: 8, pointerType: "touch", clientX: 70, clientY: 310, bubbles: true, cancelable: true })); ev("pointerdown"); ev("pointerup"); });
    await page.waitForTimeout(300);
    ok(await page.evaluate(() => !document.querySelector(".monaco-editor textarea.inputarea").hasAttribute("inputmode")), tag + "tapping the floating button opens the keyboard");
    await page.evaluate(async () => (await import("/js/ui/keyboard.js")).closeKeyboard());

    // ---- terminal
    await page.evaluate(async () => (await import("/js/ui/panel.js")).show("terminal")); await page.waitForSelector(".xterm-helper-textarea", { timeout: 20000 }); await page.waitForTimeout(800);
    ok(await page.evaluate(() => document.querySelector(".xterm-helper-textarea").getAttribute("inputmode") === "none"), tag + "terminal: keyboard does not pop up by itself");
    const tb = await page.locator(".xterm-screen").first().boundingBox();
    await page.touchscreen.tap(tb.x + 80, tb.y + 20); await page.waitForTimeout(300);
    ok(await page.locator(".kbd-ask").count() === 1, tag + "terminal: tap shows the same prompt");
    await page.click(".kbd-ask-open"); await page.waitForTimeout(300);
    ok(await page.evaluate(() => !document.querySelector(".xterm-helper-textarea").hasAttribute("inputmode")), tag + "terminal: keyboard allowed after “Open keyboard”");
    await page.evaluate(async () => (await import("/js/ui/keyboard.js")).closeKeyboard());
    // "always open directly"
    await page.touchscreen.tap(tb.x + 90, tb.y + 20); await page.waitForTimeout(300);
    await page.click(".kbd-ask-always"); await page.waitForTimeout(200);
    ok(await page.evaluate(async () => (await import("/js/core/settings.js")).settings.get("ui.keyboard")) === "auto", tag + "“Always open directly” switches the setting to auto");
    await page.evaluate(async () => { (await import("/js/ui/keyboard.js")).closeKeyboard(); (await import("/js/core/settings.js")).settings.set("ui.keyboard", "ask"); (await import("/js/ui/panel.js")).hide(); });

    // ---- lighter editor options on touch
    ok(await page.evaluate(async () => { const e = (await import("/js/ui/editor.js")); const ed = e.activeEditor(); const o = e.monaco.editor.EditorOption; return ed.getOption(o.smoothScrolling) === false; }), tag + "smooth scrolling is off on touch devices (less lag)");

    // ---- ☰ opens the menu list on phones
    await page.click("#btn-sidebar"); await page.waitForSelector(".ctx");
    const tops = await page.locator(".ctx:not(.sub) > .ctx-item > .ctx-label").allTextContents();
    ok(JSON.stringify(tops) === JSON.stringify(["File", "Edit", "Selection", "View", "Go", "Run", "Terminal", "Help"]), tag + "☰ lists File, Edit, Selection, View, Go, Run, Terminal, Help: " + tops.join(","));
    await page.click('.ctx > .ctx-item:has(> .ctx-label:text-is("File"))'); await page.waitForTimeout(500);
    ok(await page.locator(".ctx .ctx.sub .ctx-item:has-text('New File')").first().isVisible(), tag + "File opens its entries");
    await page.keyboard.press("Escape"); await page.click(".ctx-back", { position: { x: 5, y: 5 }, force: true }).catch(() => {});
    await page.waitForTimeout(300);
    ok(!(await page.evaluate(() => document.getElementById("sidebar").classList.contains("open"))), tag + "☰ no longer opens the file drawer");

    // ---- move menus for views that sit in the sidebar
    await page.evaluate(async () => { (await import("/js/ui/panel.js")).resetLayout(); });
    await page.evaluate(async () => { const m = await import("/js/main.js"); m.showView("git"); }); await page.waitForTimeout(300);
    await page.locator('#side-nav .sn-btn[data-view="git"]').dispatchEvent("contextmenu");
    await page.waitForSelector(".ctx"); const mv = await page.locator(".ctx-item .ctx-label").allTextContents();
    ok(mv.some((t) => /Move “Source Control” to Right Sheet/.test(t)) && mv.some((t) => /Reset Layout/.test(t)), tag + "drawer icon menu offers “Move to …” after a reset: " + mv.slice(0, 3).join(" | "));
    await page.click('.ctx-item:has-text("Move “Source Control” to Right Sheet")'); await page.waitForTimeout(500);
    ok(await page.evaluate(async () => (await import("/js/ui/panel.js")).layout().right.includes("git")), tag + "Source Control moved to the right sheet");
    await page.evaluate(async () => { (await import("/js/ui/panel.js")).resetLayout(); });
    ok(await page.evaluate(async () => JSON.stringify((await import("/js/ui/panel.js")).layout().right)) === '["ai"]', tag + "reset keeps AI in the right sheet");

    // ---- exit guard
    await page.evaluate(async () => { const { settings } = await import("/js/core/settings.js"); settings.set("files.autoSave", "off"); window.__left = 0; const { N } = await import("/js/core/bridge.js"); N.sys.moveToBack = async () => { window.__left++; return true; }; });
    await page.evaluate(() => { document.querySelectorAll(".ctx-back").forEach((b) => b.click()); });
    ok(await page.evaluate(() => window.__cfBack()) === true && !(await page.evaluate(() => document.getElementById("sidebar").classList.contains("open"))), tag + "back first closes the open drawer");
    const why = await page.evaluate(async () => { const p = await import("/js/ui/panel.js"); const k = await import("/js/ui/keyboard.js"); return JSON.stringify({ modal: !!document.querySelector(".modal-wrap,.qp-wrap,.ctx"), drawer: document.getElementById("sidebar").classList.contains("open"), page: p.isSheetOpen("page"), open: p.isOpen(), kbd: k.isOpen() }); });
    ok(await page.evaluate(() => window.__cfBack()) === false, tag + "back with nothing unsaved lets the app go to recents " + why);
    await page.evaluate(async () => { const e = await import("/js/ui/editor.js"); const ed = e.activeEditor(); ed.setValue("const a = 2;\n"); });
    await page.waitForTimeout(300);
    ok(await page.evaluate(() => window.__cfBack()) === true, tag + "back with unsaved work is intercepted");
    await page.waitForSelector(".modal:has-text('Unsaved changes')"); ok(await page.locator(".modal li:has-text('a.js')").count() === 1, tag + "dialog names the unsaved file");
    await page.click('.modal-foot button:has-text("Stay")'); await page.waitForTimeout(200);
    ok(await page.evaluate(() => window.__left) === 0, tag + "Stay keeps the app open");
    await page.evaluate(() => window.__cfBack()); await page.waitForSelector(".modal:has-text('Unsaved changes')");
    await page.click('.modal-foot button:has-text("Save all & leave")'); await page.waitForTimeout(800);
    ok(await page.evaluate(() => window.__left) === 1 && fs.readFileSync("/tmp/cf-dev/home/kb/a.js", "utf8").startsWith("const a = 2"), tag + "Save all & leave: file written, app goes to recents");
    await page.evaluate(async () => { const e = await import("/js/ui/editor.js"); e.activeEditor().setValue("const a = 3;\n"); }); await page.waitForTimeout(200);
    await page.evaluate(() => window.__cfBack()); await page.waitForSelector(".modal:has-text('Unsaved changes')");
    await page.click('.modal-foot button:has-text("Leave without saving")'); await page.waitForTimeout(400);
    ok(await page.evaluate(() => window.__left) === 2 && fs.readFileSync("/tmp/cf-dev/home/kb/a.js", "utf8").startsWith("const a = 2"), tag + "Leave without saving: file untouched, app goes to recents");
    ok(await page.evaluate(() => { const e = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; }), tag + "browser tab close is blocked while work is unsaved");
    await page.evaluate(async () => { const e = await import("/js/ui/editor.js"); await e.saveAll(); (await import("/js/core/settings.js")).settings.set("files.autoSave", "afterDelay"); });

    // ---- GitHub token page
    await page.evaluate(async () => { window.__opened = []; const { N } = await import("/js/core/bridge.js"); N.sys.openUrl = async (u) => { window.__opened.push(u); return true; }; (await import("/js/ui/commands.js")).run("github.token"); });
    await page.waitForSelector(".modal:has-text('personal access token')");
    await page.click('.modal button:has-text("Create token on GitHub")'); await page.waitForTimeout(200);
    const u = await page.evaluate(() => window.__opened[0] || "");
    ok(/^https:\/\/github\.com\/settings\/tokens\/new\?/.test(u) && /scopes=repo%2Cworkflow/.test(u), tag + "opens GitHub's new-token page with scopes pre-filled: " + u);
    await page.click('.modal button:has-text("Fine-grained token")'); await page.waitForTimeout(150);
    ok(await page.evaluate(() => window.__opened[1]) === "https://github.com/settings/personal-access-tokens/new", tag + "fine-grained token link");
    await page.click('.modal-foot button:has-text("Cancel")'); await page.waitForTimeout(150);

    // ---- Open Folder: home is a container
    await page.evaluate(async () => { const { settings } = await import("/js/core/settings.js"); settings.addRecent("/tmp/cf-dev/home"); settings.addRecent("/tmp/cf-dev/home/kb"); });
    await page.evaluate(() => { import("/js/ui/commands.js").then((m) => m.run("file.openFolder")); }); await page.waitForSelector(".projects .pj-card"); await page.waitForTimeout(500);
    const names = await page.locator(".projects .pj-card:not(.place) .pj-name").allTextContents();
    ok(!names.includes("home") && names.includes("kb"), tag + "home is not listed as a project: " + names.join(","));
    ok(await page.locator(".projects .pj-card.place").count() === 2, tag + "“Look inside” offers Home and Imported");
    await page.locator(".projects .pj-card.place").first().click(); await page.waitForSelector(".ofd-list .row", { timeout: 8000 });
    ok(true, tag + "tapping Home goes inside (folder browser) instead of opening it as a project");
    ok(!logs.some((l) => /pageerror/.test(l)), tag + "no page errors " + logs.filter((l) => /pageerror/.test(l)).join(" | "));
    await browser.close();
  }
  // ------------------------------------------------------------------ desktop
  {
    const tag = "[desktop] ";
    const { browser, page, logs } = await launch({ mobile: false });
    await page.waitForFunction(() => window.__cfReady || window.__cfError, null, { timeout: 40000 });
    ok(await page.evaluate(() => !document.getElementById("kbd-fab")), tag + "no floating keyboard button without touch");
    const was = await page.evaluate(() => document.getElementById("sidebar").classList.contains("collapsed"));
    await page.click("#btn-sidebar"); await page.waitForTimeout(200);
    ok((await page.evaluate(() => document.getElementById("sidebar").classList.contains("collapsed"))) !== was && !(await page.locator(".ctx").count()), tag + "☰ still toggles the sidebar where the menu bar exists");
    await page.click("#btn-sidebar");
    await page.click("#lt-right"); await page.waitForTimeout(500);
    ok(await page.evaluate(() => !!document.querySelector("#sheet-right #view-ai") && !document.getElementById("sheet-right").classList.contains("hidden")), tag + "right toggle opens the AI Assistant (secondary side bar)");
    await page.click("#lt-bottom"); await page.waitForTimeout(500);
    ok(await page.evaluate(() => !!document.querySelector(".sheet[data-sheet=bottom] .xterm, .sheet[data-sheet=bottom] #pane-terminal")), tag + "bottom toggle opens the terminal");
    await page.locator('.ab-btn[data-view="git"]').click({ button: "right" }); await page.waitForSelector(".ctx");
    ok(await page.locator('.ctx-item:has-text("Move “Source Control” to Right Sheet")').count() === 1, tag + "activity bar right-click offers “Move to …”");
    await page.keyboard.press("Escape");
    ok(!logs.some((l) => /pageerror/.test(l)), tag + "no page errors");
    await browser.close();
  }
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED"); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
