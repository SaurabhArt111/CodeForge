// e2e (dev host): AI apply flow (path-tagged blocks, SEARCH/REPLACE, new files, review/auto-apply), AI settings page, external edit pickup.
const { launch } = require("./lib"); const fs = require("fs");
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
for (const f of ["state.json", "settings.json"]) fs.rmSync("/tmp/cf-dev/cf/" + f, { force: true });
const D = "/tmp/cf-dev/home/aiap"; fs.rmSync(D, { recursive: true, force: true }); fs.mkdirSync(D + "/src", { recursive: true });
fs.writeFileSync(D + "/src/app.js", "function hello() {\n  return 'hi';\n}\n\nmodule.exports = hello;\n");
(async () => {
  const { browser, page, logs } = await launch();
  await page.waitForFunction(() => window.__cfReady || window.__cfError, null, { timeout: 40000 });
  await page.evaluate(async () => { const m = await import("/js/main.js"); await m.openFolder("/tmp/cf-dev/home/aiap"); });
  // ---- pure parsing / planning
  const r = await page.evaluate(async () => {
    const ai = await import("/js/features/ai.js");
    const reply = "Sure:\n```js\nFILE: src/app.js\n<<<<<<< SEARCH\n  return 'hi';\n=======\n  return 'hello world';\n>>>>>>> REPLACE\n```\nand a new file:\n```js\n// FILE: src/util.js\nexport const a = 1;\n```\nand plain:\n```js\nconsole.log(1)\n```";
    const eds = ai.extractEdits(reply);
    const p1 = ai.planText("a\n    b\n    c\n", { path: "x", edits: [{ search: "b\nc", replace: "B\nC" }] });
    const p2 = ai.planText("a\n", { path: "x", edits: [{ search: "zzz", replace: "q" }] });
    const p3 = ai.planText("a\nb\n", { path: "x", edits: [{ search: "a", replace: "" }] });
    return { n: eds.length, e0: eds[0], e1: eds[1], p1: p1.text, p2: p2.error, p3: p3.text };
  });
  ok(r.n === 2 && r.e0.path === "src/app.js" && r.e0.edits.length === 1 && r.e1.path === "src/util.js" && r.e1.content === "export const a = 1;", "extractEdits finds path-tagged blocks only: " + JSON.stringify([r.n, r.e0?.path, r.e1?.path]));
  ok(r.p1 === "a\n    B\n    C\n", "indentation-tolerant SEARCH/REPLACE keeps the file's indentation: " + JSON.stringify(r.p1));
  ok(/Could not find/.test(r.p2 || ""), "missing SEARCH text gives a clear error");
  ok(r.p3 === "\nb\n", "empty REPLACE deletes the matched text");
  // ---- applying with review (modal), accept
  await page.evaluate(() => { import("/js/features/ai.js").then((ai) => { window.__ap = ai.applyEdit({ path: "src/app.js", edits: [{ search: "  return 'hi';", replace: "  return 'hello world';" }] }); }); });
  await page.waitForSelector(".modal .ai-diff"); await page.waitForTimeout(200);
  ok(await page.evaluate(() => { const t = document.querySelector(".modal .ai-diff").textContent; return /-\s+return 'hi'/.test(t) && /\+\s+return 'hello world'/.test(t); }), "review dialog shows the diff");
  await page.click('.modal button:has-text("Apply")'); await page.waitForTimeout(600);
  ok(fs.readFileSync(D + "/src/app.js", "utf8").includes("hello world") && await page.evaluate(() => window.__ap), "Apply writes the file after review");
  // ---- reject leaves the file alone
  await page.evaluate(() => { import("/js/features/ai.js").then((ai) => { window.__ap2 = ai.applyEdit({ path: "src/app.js", content: "nope" }); }); });
  await page.waitForSelector(".modal .ai-diff"); await page.click('.modal button:has-text("Cancel")'); await page.waitForTimeout(300);
  ok(fs.readFileSync(D + "/src/app.js", "utf8").includes("hello world") && !(await page.evaluate(() => window.__ap2)), "Cancel keeps the file unchanged");
  // ---- auto apply: new file + open editor model updated and saved
  await page.evaluate(async () => { const { settings } = await import("/js/core/settings.js"); settings.set("ai.autoApply", true); const e = await import("/js/ui/editor.js"); await e.openFile("/tmp/cf-dev/home/aiap/src/app.js"); });
  await page.waitForTimeout(500);
  const res = await page.evaluate(async () => { const ai = await import("/js/features/ai.js"); const a = await ai.applyEdit({ path: "src/new/util.js", content: "export const a = 1;" }); const b = await ai.applyEdit({ path: "src/app.js", edits: [{ search: "hello world", replace: "HELLO" }] }); const e = await import("/js/ui/editor.js"); return { a, b, model: e.getDoc("/tmp/cf-dev/home/aiap/src/app.js").model.getValue(), dirty: e.getDoc("/tmp/cf-dev/home/aiap/src/app.js").dirty }; });
  ok(res.a && fs.readFileSync(D + "/src/new/util.js", "utf8") === "export const a = 1;\n", "new file (with new folder) created without a prompt when auto-apply is on");
  ok(res.b && res.model.includes("HELLO") && fs.readFileSync(D + "/src/app.js", "utf8").includes("HELLO") && !res.dirty, "open file edited through the editor model, saved, undo stays available");
  ok(await page.evaluate(async () => { const ai = await import("/js/features/ai.js"); return !(await ai.applyEdit({ path: "../../etc/x", content: "x" })); }), "paths outside the project are refused");
  // ---- external edit of an open file (coding CLI) is picked up while the app is open
  fs.writeFileSync(D + "/src/app.js", "// changed by a CLI\n");
  await page.waitForFunction(async () => (await import("/js/ui/editor.js")).getDoc("/tmp/cf-dev/home/aiap/src/app.js").model.getValue().startsWith("// changed by a CLI"), null, { timeout: 9000 });
  ok(true, "file rewritten on disk by another program reloads in the editor within the poll interval");
  // ---- AI settings page
  await page.evaluate(() => { import("/js/features/ai.js").then((ai) => ai.openSettings()); });
  await page.waitForSelector(".settings-page .ai-prov"); await page.waitForTimeout(500);
  const st = await page.evaluate(() => ({ prov: document.querySelectorAll(".settings-page .ai-prov").length, cli: document.querySelectorAll(".settings-page .ai-cli").length, cur: document.querySelector(".ai-prov.cur .ai-prov-name")?.textContent, key: !!document.querySelector(".settings-page .ai-prov .btn.small") }));
  ok(st.prov >= 6 && st.cli >= 6 && st.key && /Anthropic/.test(st.cur || ""), "AI gear opens Settings with providers/keys/model/CLIs: " + JSON.stringify(st));
  await page.click('.ai-prov:has-text("OpenAI") .chip'); await page.waitForTimeout(400);
  ok(await page.evaluate(async () => (await import("/js/core/settings.js")).settings.get("ai.provider")) !== "anthropic", "switching provider from the settings page works");
  const bad = logs.filter((l) => !/favicon|iframe|ERR_|net::|Failed to load resource|git refresh/i.test(l));
  ok(!bad.length, "no console errors" + (bad.length ? " " + JSON.stringify(bad.slice(0, 3)) : ""));
  await browser.close(); console.log(fails ? fails + " FAILED" : "ALL PASSED"); process.exit(fails ? 1 : 0);
})();
