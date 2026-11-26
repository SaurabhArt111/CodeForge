// v8.4: phone menu (quick access, search, project actions), close/delete project (PIN), native-feeling AI/CLI edits, extension compatibility report.
const { launch } = require("./lib"); const fs = require("fs");
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
const ROOT = "/tmp/cf-dev", HOME = ROOT + "/home";
for (const f of ["state.json", "settings.json", "lock.json"]) fs.rmSync(ROOT + "/cf/" + f, { force: true });
const mkp = (n) => { const d = HOME + "/" + n; fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(d + "/a.js", Array.from({ length: 40 }, (_, i) => `line ${i + 1}`).join("\n") + "\n"); return d; };
const P1 = mkp("v84a"), P2 = mkp("v84b"), P3 = mkp("v84c");
// extensions (unpacked, as the installer leaves them)
fs.rmSync(ROOT + "/cf/extensions", { recursive: true, force: true });
const mkext = (id, manifest, files = {}) => { const d = ROOT + "/cf/extensions/" + id; fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(d + "/package.json", JSON.stringify(manifest)); for (const [f, t] of Object.entries(files)) { fs.mkdirSync(require("path").dirname(d + "/" + f), { recursive: true }); fs.writeFileSync(d + "/" + f, t); } };
mkext("acme.theme-1.0.0", { name: "theme", publisher: "acme", version: "1.0.0", contributes: { themes: [{ label: "T", uiTheme: "vs-dark", path: "./t.json" }] } }, { "t.json": "{}" });
mkext("acme.lsp-1.0.0", { name: "lsp", publisher: "acme", version: "1.0.0", main: "./out.js", contributes: { commands: [{ command: "lsp.x", title: "X" }], debuggers: [{ type: "d" }], grammars: [{ language: "x", scopeName: "s", path: "./g.json" }] } }, { "out.js": 'const cp=require("child_process");const {LanguageClient}=require("vscode-languageclient/node");exports.activate=()=>{throw new Error("boom")};' });

(async () => {
  // ------------------------------------------------------------ desktop: editing, review, conflict, project ops, extensions
  let { browser, page, logs } = await launch({ mobile: false });
  await page.waitForFunction(() => window.__cfReady, null, { timeout: 40000 });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  await ev(async (p) => { const m = await import("/js/main.js"); await m.api.openFolder(p); }, P1);
  await page.waitForTimeout(600);

  // 1. patchDoc: in-place edit keeps the cursor, one undo step, flashes the changed lines
  await ev(async (p) => { const ed = await import("/js/ui/editor.js"); await ed.openFile(p + "/a.js"); }, P1);
  await page.waitForSelector(".monaco-editor");
  const r1 = await ev(async (p) => {
    const ed = await import("/js/ui/editor.js"); const d = ed.activeDoc(); const e = ed.activeEditor(); e.setPosition({ lineNumber: 30, column: 3 });
    const text = d.model.getValue().replace("line 5\n", "line FIVE\nextra\n").replace("line 20\n", "");
    const before = d.model.getValue(); ed.patchDoc(p + "/a.js", text, { source: "ai" });
    const after = d.model.getValue(); const pos = e.getPosition();
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 150)));
    const flash = document.querySelectorAll(".cf-flash-ai").length;
    await e.getAction("undo")?.run?.(); e.trigger("t", "undo", null); const undone = d.model.getValue();
    return { ok: after === text, line: pos.lineNumber, flash, undoOne: undone === before };
  }, P1);
  ok(r1.ok, "patchDoc applies the new text"); ok(r1.line === 30, "cursor stays on its line (was 30, now " + r1.line + ", lines shifted by the edit)".replace("30, now", "30; now")) ;
  ok(r1.flash > 0, "changed lines flash"); ok(r1.undoOne, "one undo restores the whole AI change");

  // 2. external disk change on a clean file: patched in place, not replaced
  const r2 = await ev(async (p) => {
    const ed = await import("/js/ui/editor.js"); const d = ed.activeDoc(); const e = ed.activeEditor(); e.setPosition({ lineNumber: 35, column: 1 });
    const { N } = await import("/js/core/bridge.js"); const cur = (await N.fs.readText(p + "/a.js")).text;
    await N.fs.writeText?.(p + "/a.js", cur.replace("line 2\n", "line TWO\n")) ?? await N.fs.write(p + "/a.js", cur.replace("line 2\n", "line TWO\n"));
    await ed.syncFromDisk(p + "/a.js", { source: "cli" });
    return { has: d.model.getValue().includes("line TWO"), line: e.getPosition().lineNumber, dirty: !!d.dirty };
  }, P1);
  ok(r2.has && r2.line === 35 && !r2.dirty, "disk/CLI change merged in place (cursor kept, not dirty): " + JSON.stringify(r2));

  // 3. AI review opens as an editor tab with a diff and applies on demand
  const r3 = await ev(async (p) => {
    const aiedit = await import("/js/features/aiedit.js"); const ed = await import("/js/ui/editor.js"); const old = ed.activeDoc().model.getValue();
    const pr = aiedit.review({ path: p + "/a.js", oldText: old, newText: old.replace("line 7\n", "line SEVEN\n"), exists: true, title: "Review" });
    await new Promise((r) => setTimeout(r, 900));
    const bar = !!document.querySelector(".air-bar"); const diff = !!document.querySelector(".air-host .monaco-diff-editor");
    const btn = [...document.querySelectorAll(".air-bar button")].find((b) => /^(apply|accept)/i.test(b.textContent.trim())); btn?.click();
    const res = await Promise.race([pr, new Promise((r) => setTimeout(() => r("timeout"), 4000))]);
    return { bar, diff, applied: res && res !== "timeout" && /SEVEN/.test(res.text || "") };
  }, P1);
  ok(r3.bar && r3.diff, "AI review tab shows a diff editor with Apply/Reject"); ok(r3.applied, "Apply resolves with the new text");

  // 4. conflict: dirty editor + disk change -> non-destructive dialog with Compare
  const r4 = await ev(async (p) => {
    const ed = await import("/js/ui/editor.js"); const d = ed.activeDoc(); const { N } = await import("/js/core/bridge.js");
    d.model.pushEditOperations([], [{ range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }, text: "mine " }], () => null);
    const cur = (await N.fs.readText(p + "/a.js")).text; await (N.fs.writeText ? N.fs.writeText(p + "/a.js", cur + "disk\n") : N.fs.write(p + "/a.js", cur + "disk\n"));
    ed.checkExternal?.(); await new Promise((r) => setTimeout(r, 1500));
    const modal = document.querySelector(".modal"); return { txt: modal?.textContent || "", btns: [...(modal?.querySelectorAll("button") || [])].map((b) => b.textContent.trim()) };
  }, P1);
  ok(r4.btns.some((b) => /Compare/i.test(b)) && r4.btns.some((b) => /Keep mine/i.test(b)), "conflict dialog offers Keep mine / Compare / Use disk: " + r4.btns.join(","));
  await page.keyboard.press("Escape"); await ev(() => document.querySelectorAll(".modal-overlay .btn, .modal button").forEach((b) => /Keep mine/i.test(b.textContent) && b.click())); await page.waitForTimeout(300);

  // 5. extension compatibility report
  const rep = await ev(async () => {
    const e = await import("/js/features/extensions.js"); const xc = await import("/js/features/extcompat.js"); await e.init?.call; const out = {};
    const all = (await import("/js/features/exthost.js")); return { has: typeof e.reportFor, levels: Object.keys(xc.LEVEL) };
  });
  ok(rep.has === "function" && rep.levels.length === 3, "compat module exposes reportFor / levels");
  await ev(async () => { const mm = await import("/js/main.js"); mm.api.showView("extensions"); });
  await page.waitForSelector(".ext-row", { timeout: 15000 }); await page.waitForTimeout(1500);
  const rows = await ev(() => [...document.querySelectorAll(".ext-row")].map((r) => ({ n: r.querySelector(".ext-name")?.firstChild?.textContent, b: r.querySelector(".compat-badge")?.textContent?.trim() })));
  const th = rows.find((r) => r.n === "theme"), ls = rows.find((r) => r.n === "lsp");
  ok(th && /Works/.test(th.b || ""), "theme extension badge: Works (" + th?.b + ")"); ok(ls && /Partly|Won/.test(ls.b || ""), "language-server extension badge: " + ls?.b);
  await page.click(".ext-row:has-text('lsp')"); await page.waitForSelector(".compat-report", { timeout: 8000 });
  const txt = await ev(() => document.querySelector(".compat-report").textContent);
  ok(/child_process/.test(txt) && /language server/i.test(txt) && /debug/i.test(txt) && /grammars/i.test(txt), "detail lists the reasons (child_process, language server, debug, grammars)");
  await page.keyboard.press("Escape");

  // 6. close folder + delete project (PIN)
  await ev(async () => { const { N } = await import("/js/core/bridge.js"); await N.auth.setPin("2468", ""); });
  const menuHas = await ev(async () => { const c = await import("/js/ui/commands.js"); return ["file.closeFolder", "file.deleteProject"].map((id) => !!(c.all?.() || c.list?.() || []).find?.((x) => x.id === id)); }).catch(() => [true, true]);
  await ev(async (p) => { const m = await import("/js/main.js"); await m.api.openFolder(p); }, P2); await page.waitForTimeout(500);
  await ev(async () => { const c = await import("/js/ui/commands.js"); c.run("file.deleteProject"); });
  await page.waitForSelector(".modal", { timeout: 5000 });
  ok(/Delete/i.test(await ev(() => document.querySelector(".modal").textContent)), "delete asks for confirmation first");
  await page.click(".modal button.danger, .modal .btn.primary"); // confirm
  await page.waitForSelector(".pin-input", { timeout: 5000 }); ok(true, "PIN is requested before deleting");
  await page.fill(".pin-input", "0000"); await page.keyboard.press("Enter"); await page.waitForTimeout(600);
  ok(fs.existsSync(P2), "wrong PIN: project is NOT deleted");
  await page.fill(".pin-input", "2468"); await page.keyboard.press("Enter"); await page.waitForTimeout(2000);
  ok(!fs.existsSync(P2), "correct PIN: project deleted from storage");
  ok(await ev(async () => { const { ws } = await import("/js/ui/workspace.js"); return !ws.root; }), "deleting the open project closes the folder");
  // no PIN -> only confirmation
  await ev(async () => { const { N } = await import("/js/core/bridge.js"); try { await N.auth.clearPin("2468"); } catch {} });
  await ev(async (p) => { const m = await import("/js/main.js"); await m.api.openFolder(p); }, P3); await page.waitForTimeout(500);
  await ev(async () => { const c = await import("/js/ui/commands.js"); c.run("file.closeFolder"); }); await page.waitForTimeout(600);
  ok(await ev(async () => { const { ws } = await import("/js/ui/workspace.js"); return !ws.root; }), "Close Folder closes the open project");
  ok(fs.existsSync(P3), "closing keeps the files");
  await browser.close();

  // ------------------------------------------------------------ phone menu
  ({ browser, page, logs } = await launch({ mobile: true }));
  await page.waitForFunction(() => window.__cfReady, null, { timeout: 40000 });
  await page.evaluate(async (p) => { const m = await import("/js/main.js"); await m.api.openFolder(p); }, P1); await page.waitForTimeout(500);
  await page.click("#btn-sidebar"); await page.waitForSelector(".navmenu .nm-tile");
  const tiles = await page.$$eval(".navmenu .nm-tile .nm-tile-label", (e) => e.map((x) => x.textContent));
  ok(tiles.length === 8 && ["Storage", "Tasks", "Security", "Extensions"].every((t) => tiles.includes(t)), "phone menu has the quick-access tiles: " + tiles.join(", "));
  ok(/v84a/.test(await page.textContent(".navmenu .nm-project")) && (await page.$$(".navmenu .nm-pj-act")).length === 2, "phone menu shows the open project with Close folder / Switch (no Delete here)");
  const box = await page.$eval(".navmenu", (e) => { const r = e.getBoundingClientRect(); return r.right <= innerWidth && r.bottom <= innerHeight + 1; }); ok(box, "menu fits the phone screen");
  await page.fill(".nm-search", "export"); await page.waitForTimeout(200);
  const hits = await page.$$eval(".navmenu .nm-results .ctx-item", (e) => e.map((x) => x.textContent)); ok(hits.some((t) => /Export/i.test(t)), "search finds menu commands (" + hits.length + " hits)");
  await page.fill(".nm-search", ""); await page.click(".nm-tile:has-text('Storage')"); await page.waitForSelector(".storage-page", { timeout: 8000 }); ok(true, "Storage tile opens the Storage Manager");
  await page.click("#btn-sidebar"); await page.waitForSelector(".navmenu"); await page.click(".navmenu .nm-pj-act:has-text('Close')"); await page.waitForTimeout(600);
  ok(await page.evaluate(async () => { const { ws } = await import("/js/ui/workspace.js"); return !ws.root; }), "phone menu Close closes the project");
  await browser.close();

  const bad = logs.filter((l) => /pageerror/.test(l)); ok(!bad.length, "no page errors" + (bad.length ? ": " + bad.slice(0, 3).join(" | ") : ""));
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED"); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
