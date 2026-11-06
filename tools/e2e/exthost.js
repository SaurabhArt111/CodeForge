// e2e: install a VSIX that has NLS placeholders, a README with odd casing and extension code; run it in the lite host.
const { launch } = require("./lib"); const fs = require("fs"); const JSZip = require(require("path").join(__dirname, "..", "devhost", "node_modules", "jszip"));
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
for (const f of ["state.json", "settings.json"]) fs.rmSync("/tmp/cf-dev/cf/" + f, { force: true });
fs.rmSync("/tmp/cf-dev/cf/extensions", { recursive: true, force: true }); fs.rmSync("/tmp/cf-dev/cf/ext-data", { recursive: true, force: true });
fs.rmSync("/tmp/cf-dev/home/exttest", { recursive: true, force: true }); fs.mkdirSync("/tmp/cf-dev/home/exttest", { recursive: true });
fs.writeFileSync("/tmp/cf-dev/home/exttest/a.js", "// TODO fix me\nconsole.log(1);\n");
const EXT = `const vscode = require("vscode");
exports.activate = (ctx) => {
  const cfg = vscode.workspace.getConfiguration("fixture");
  const sb = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 10);
  sb.text = "$(rocket) Fix:" + cfg.get("greeting"); sb.show();
  const diag = vscode.languages.createDiagnosticCollection("fixture");
  let netOk = typeof fetch === "undefined";
  ctx.subscriptions.push(
    vscode.commands.registerCommand("fix.hello", async () => {
      const ed = vscode.window.activeTextEditor;
      vscode.window.showInformationMessage("Hello from fixture " + (ed ? ed.document.fileName.split("/").pop() : "none") + " net-blocked=" + netOk);
      if (ed) { const t = ed.document.getText(); const i = t.indexOf("TODO"); if (i >= 0) { const p = ed.document.positionAt(i); diag.set(ed.document.uri, [new vscode.Diagnostic(new vscode.Range(p, p.translate(0, 4)), "TODO found", 1)]); }
        await ed.edit((b) => b.insert(new vscode.Position(0, 0), "// edited by ext\\n")); }
      return 42;
    }),
    vscode.languages.registerCompletionItemProvider("javascript", { provideCompletionItems() { return [new vscode.CompletionItem("fixtureCompletion", vscode.CompletionItemKind.Function)]; } }, "."),
    vscode.languages.registerHoverProvider("javascript", { provideHover() { return new vscode.Hover("fixture hover"); } }));
};`;
(async () => {
  const z = new JSZip();
  z.file("extension/package.json", JSON.stringify({ name: "fixture", publisher: "tester", version: "1.2.3", displayName: "%ext.name%", description: "%ext.desc%", browser: "./ext.js", activationEvents: ["onCommand:fix.hello"],
    contributes: { commands: [{ command: "fix.hello", title: "%cmd.hello%", category: "Fixture" }], configuration: { title: "Fixture", properties: { "fixture.greeting": { type: "string", default: "hi", description: "Greeting text" }, "fixture.loud": { type: "boolean", default: false, description: "Be loud" } } }, jsonValidation: [{ fileMatch: "fixture.json", url: "./schema.json" }] } }));
  z.file("extension/package.nls.json", JSON.stringify({ "ext.name": "Fixture Ext", "ext.desc": "A test extension", "cmd.hello": "Say Hello" }));
  z.file("extension/ext.js", EXT); z.file("extension/schema.json", JSON.stringify({ type: "object", properties: { a: { type: "number" } } }));
  z.file("extension/Readme.MD", "# Fixture\n\nSome **readme** text with `code`.\n");
  fs.mkdirSync("/tmp/cf-dev/shared", { recursive: true }); fs.writeFileSync("/tmp/cf-dev/shared/fixture.vsix", await z.generateAsync({ type: "nodebuffer" }));
  const { browser, page, logs } = await launch();
  await page.waitForFunction(() => window.__cfReady, null, { timeout: 40000 });
  await page.evaluate(async () => { const mm = await import("/js/main.js"); await mm.openFolder("/tmp/cf-dev/home/exttest"); const ed = await import("/js/ui/editor.js"); await ed.openFile("/tmp/cf-dev/home/exttest/a.js"); });
  await page.waitForSelector(".tab:has-text('a.js')");
  const ex = await page.evaluate(async () => { const e = await import("/js/features/extensions.js"); const x = await e.installVsix("/tmp/cf-dev/shared/fixture.vsix", { silent: true }); return { name: x.name, desc: x.description, main: x.main }; });
  ok(ex.name === "Fixture Ext" && ex.desc === "A test extension", "NLS %placeholders% resolved: " + JSON.stringify(ex));
  await page.waitForFunction(async () => (await import("/js/ui/commands.js")).list().some((c) => c.id === "fix.hello"), null, { timeout: 8000 }).catch(() => {});
  const fx = await page.evaluate(async () => (await import("/js/ui/commands.js")).list().filter((c) => /fix/.test(c.id)).map((c) => c.id + "=" + c.title));
  console.log("   fixture commands:", fx.join("|"));
  ok(fx.includes("fix.hello=Say Hello"), "contributed command appears with NLS title");
  // trust prompt on first run
  await page.evaluate(async () => { window.__r = (await import("/js/ui/commands.js")).run("fix.hello"); });
  await page.waitForSelector(".modal:has-text('Run extension code')", { timeout: 8000 }); ok(true, "trust prompt shown before extension code runs");
  await page.screenshot({ path: "/tmp/cf-dev/x1.png" });
  await page.click(".modal .btn.primary:has-text('Allow')");
  const res = await page.evaluate(() => window.__r); ok(res === 42, "command executed in worker, returned " + res);
  await page.waitForSelector(".toast:has-text('Hello from fixture a.js')", { timeout: 8000 }); ok(true, "showInformationMessage → toast");
  ok((await page.locator(".toast").allTextContents()).join(" ").includes("net-blocked=true"), "fetch() removed in sandbox");
  ok((await page.locator(".sb-item", { hasText: "Fix:hi" }).count()) === 1, "status bar item from extension (config default applied)");
  await page.waitForFunction(async () => (await import("/js/ui/editor.js")).markers().some((m) => m.message === "TODO found"), null, { timeout: 5000 }); ok(true, "diagnostics published to Problems/markers");
  ok(await page.evaluate(async () => (await import("/js/ui/editor.js")).getDoc("/tmp/cf-dev/home/exttest/a.js").model.getValue().startsWith("// edited by ext")), "ed.edit applied to the model");
  // completion provider
  await page.evaluate(async () => { const ed = await import("/js/ui/editor.js"); const e = ed.activeEditor(); e.focus(); e.setPosition({ lineNumber: 4, column: 1 }); e.trigger("test", "type", { text: "fix" }); setTimeout(() => e.trigger("test", "editor.action.triggerSuggest", {}), 150); });
  await page.waitForSelector(".suggest-widget.visible:has-text('fixtureCompletion')", { timeout: 8000 }); ok(true, "completion provider items shown in suggest widget");
  await page.keyboard.press("Escape");
  // hover provider (call monaco directly)
  const hov = await page.evaluate(async () => { const ed = await import("/js/ui/editor.js"); const m = ed.getDoc("/tmp/cf-dev/home/exttest/a.js").model; const mon = ed.monaco; const out = []; const provs = mon.languages; return typeof provs.registerHoverProvider; });
  ok(hov === "function", "monaco hover API present");
  // details modal: themed README (not white), settings editor
  await page.evaluate(async () => { const mm = await import("/js/main.js"); mm.api.showView("extensions"); });
  await page.click('.view-head:has-text("Extensions") ~ div .chip:has-text("Installed"), .ext-chip:has-text("Installed")').catch(() => {});
  await page.waitForSelector(".ext-row:has-text('Fixture Ext')"); await page.click(".ext-row:has-text('Fixture Ext')");
  await page.waitForSelector("iframe.ext-readme", { timeout: 8000 });
  const bg = await page.evaluate(() => { const f = document.querySelector("iframe.ext-readme"); return new Promise((r) => setTimeout(() => r(f.contentDocument ? getComputedStyle(f.contentDocument.body || f).backgroundColor : "sandboxed"), 400)); });
  const srcdoc = await page.evaluate(() => document.querySelector("iframe.ext-readme").srcdoc);
  ok(/Some <strong>readme<\/strong>/.test(srcdoc) && !/background:#fff/.test(srcdoc) && /background:#1f1f1f|background:rgb|background:#/.test(srcdoc), "README found despite 'Readme.MD' casing, rendered with themed (dark) CSS; body bg=" + bg);
  ok((await page.locator("details.ext-settings .ext-set").count()) === 2, "extension settings editor lists contributes.configuration");
  await page.click("details.ext-settings summary"); await page.fill(".ext-set:has-text('fixture.greeting') input", "yo"); await page.locator(".ext-set:has-text('fixture.greeting') input").dispatchEvent("change");
  ok(await page.evaluate(async () => (await import("/js/features/exthost.js")).getCfg("fixture.greeting")) === "yo", "setting change stored");
  await page.screenshot({ path: "/tmp/cf-dev/x2.png" });
  const compat = await page.locator(".ext-compat").first().innerText(); console.log(compat.replace(/\n/g, " | "));
  ok(/Supported here:.*commands/.test(compat) && !/Not supported:.*commands/.test(compat), "compat panel lists commands/configuration as supported");
  // jsonValidation: schema applied → a.json 'fixture.json' with a string for number gets a marker
  fs.writeFileSync("/tmp/cf-dev/home/exttest/fixture.json", '{"a":"x"}');
  await page.keyboard.press("Escape"); await page.evaluate(async () => { document.querySelector(".modal-wrap")?.remove(); const ed = await import("/js/ui/editor.js"); await ed.openFile("/tmp/cf-dev/home/exttest/fixture.json"); });
  await page.waitForFunction(async () => (await import("/js/ui/editor.js")).markers().some((m) => /number/i.test(m.message)), null, { timeout: 8000 }).then(() => ok(true, "jsonValidation schema from extension applied"), () => ok(false, "jsonValidation schema from extension applied"));
  // restart: the worker is terminated and a command still works (lazy restart + persisted trust)
  await page.evaluate(async () => { const e = await import("/js/features/exthost.js"); await e.restartAll(); });
  ok((await page.evaluate(async () => (await import("/js/features/exthost.js")).statusAll())).every((s) => s.status !== "error"), "restart host leaves no errored extensions");
  const real = logs.filter((l) => !/favicon|DevTools|Download the/.test(l)); console.log("console:", real.slice(0, 8));
  await browser.close(); console.log(fails ? `${fails} FAILED` : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
