// e2e: extensions that contribute activity-bar containers with tree views, webview views and welcome content.
const { launch } = require("./lib"); const fs = require("fs"); const JSZip = require(require("path").join(__dirname, "..", "devhost", "node_modules", "jszip"));
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
for (const f of ["state.json", "settings.json"]) fs.rmSync("/tmp/cf-dev/cf/" + f, { force: true });
fs.rmSync("/tmp/cf-dev/cf/extensions", { recursive: true, force: true }); fs.rmSync("/tmp/cf-dev/cf/ext-data", { recursive: true, force: true });
fs.mkdirSync("/tmp/cf-dev/home/xv", { recursive: true }); fs.writeFileSync("/tmp/cf-dev/home/xv/a.js", "1\n");
const EXT = `const vscode = require("vscode");
exports.activate = (ctx) => {
  const em = new vscode.EventEmitter(); let extra = false;
  const prov = { onDidChangeTreeData: em.event,
    getTreeItem: (e) => { const t = new vscode.TreeItem(e.label, e.kids ? vscode.TreeItemCollapsibleState.Collapsed : 0); t.description = e.d; t.iconPath = new vscode.ThemeIcon(e.kids ? "folder" : "zap"); if (!e.kids) t.command = { command: "box.pick", title: "pick", arguments: [e.label] }; return t; },
    getChildren: (e) => e ? e.kids : [{ label: "Requests", kids: [{ label: "GET users", d: "200" }, { label: "POST login" }] }, { label: "Single", d: "leaf" }].concat(extra ? [{ label: "Added" }] : []) };
  ctx.subscriptions.push(vscode.window.registerTreeDataProvider("box.tree", prov),
    vscode.commands.registerCommand("box.pick", (l) => { vscode.window.setStatusBarMessage("picked:" + l); }),
    vscode.commands.registerCommand("box.add", () => { extra = true; em.fire(); }),
    vscode.commands.registerCommand("box.panel", () => { const p = vscode.window.createWebviewPanel("box.p", "Box Panel", 1, {}); p.webview.html = "<h1 id=t>panel body</h1>"; }),
    vscode.window.registerWebviewViewProvider("box.web", { resolveWebviewView(view) {
      view.webview.onDidReceiveMessage((m) => { if (m.type === "ping") view.webview.postMessage({ type: "pong", n: m.n + 1 }); });
      view.webview.html = '<html><head><meta http-equiv="Content-Security-Policy" content="default-src \\'none\\'"></head><body><button id="b">ping</button><div id="o">idle</div><script>const api = acquireVsCodeApi(); window.addEventListener("message", (e) => { document.getElementById("o").textContent = e.data.type + ":" + e.data.n; }); document.getElementById("b").onclick = () => api.postMessage({ type: "ping", n: 41 });</script></body></html>';
    } }));
};`;
(async () => {
  const z = new JSZip();
  z.file("extension/package.json", JSON.stringify({ name: "box", publisher: "tester", version: "1.0.0", displayName: "Box Client", browser: "./ext.js", activationEvents: ["onView:box.tree"],
    contributes: { commands: [{ command: "box.add", title: "Box: Add" }, { command: "box.panel", title: "Box: Panel" }], viewsContainers: { activitybar: [{ id: "box", title: "Box Client", icon: "$(zap)" }], panel: [{ id: "boxPanel", title: "Box Client", icon: "$(zap)" }], secondarySidebar: [{ id: "boxSecond", title: "Box Client", icon: "$(zap)" }] },
      views: { box: [{ id: "box.tree", name: "Collections" }, { id: "box.web", name: "Console", type: "webview" }], boxPanel: [{ id: "box.web2", name: "Console", type: "webview" }], boxSecond: [{ id: "box.web3", name: "Console", type: "webview" }] } } }));
  z.file("extension/ext.js", EXT);
  const z2 = new JSZip();
  z2.file("extension/package.json", JSON.stringify({ name: "docky", publisher: "tester", version: "1.0.0", displayName: "Docky",
    contributes: { viewsContainers: { activitybar: [{ id: "docky", title: "Containers", icon: "$(package)" }] }, views: { docky: [{ id: "docky.list", name: "Containers" }] }, viewsWelcome: [{ view: "docky.list", contents: "No containers found.\n[Open Settings](command:settings.open)\nRead the [docs](https://example.com)." }] } }));
  fs.mkdirSync("/tmp/cf-dev/shared", { recursive: true }); fs.writeFileSync("/tmp/cf-dev/shared/box.vsix", await z.generateAsync({ type: "nodebuffer" })); fs.writeFileSync("/tmp/cf-dev/shared/docky.vsix", await z2.generateAsync({ type: "nodebuffer" }));
  for (const mobile of [false, true]) {
    const tag = mobile ? "[phone] " : "[desktop] ";
    const { browser, page, logs } = await launch({ mobile });
    await page.waitForFunction(() => window.__cfReady, null, { timeout: 40000 });
    await page.evaluate(async () => { const mm = await import("/js/main.js"); await mm.openFolder("/tmp/cf-dev/home/xv"); });
    if (!mobile) await page.evaluate(async () => { const e = await import("/js/features/extensions.js"); await e.installVsix("/tmp/cf-dev/shared/box.vsix", { silent: true }); await e.installVsix("/tmp/cf-dev/shared/docky.vsix", { silent: true }); });
    await page.waitForSelector(".ab-btn.ext-ab", { state: "attached", timeout: 10000 });
    const sel = mobile ? "#side-nav .sn-btn.ext-ab" : "#activitybar .ab-btn.ext-ab";
    ok(await page.locator(sel).count() === 2, tag + "one icon per extension (same container declared for activity bar, panel and secondary side bar is merged): " + (await page.locator(sel).evaluateAll((b) => b.map((x) => x.title).join(" | "))));
    if (mobile) { await page.click('#bottomnav [data-nav="explorer"]'); await page.waitForTimeout(300); }
    await page.click(sel + '[title^="Box Client"]');
    if (!mobile) { await page.waitForSelector(".modal:has-text('Run extension code')", { timeout: 8000 }); await page.click(".modal .btn.primary:has-text('Allow')"); }
    await page.waitForSelector(".ext-view.active .xv-row", { timeout: 15000 });
    const rows = await page.locator(".ext-view.active .xv-tree > .xv-row .xv-label").allTextContents();
    ok(rows.join(",") === "Requests,Single", tag + "tree view shows the extension's items: " + rows.join(","));
    await page.click(".ext-view.active .xv-row:has-text('Requests')"); await page.waitForSelector(".ext-view.active .xv-row:has-text('GET users')");
    ok(await page.locator(".ext-view.active .xv-row:has-text('GET users') .xv-desc").textContent() === "200", tag + "expanding loads children with descriptions");
    await page.click(".ext-view.active .xv-row:has-text('GET users')"); await page.waitForTimeout(500);
    ok(await page.locator("#statusbar").textContent().then((t) => /picked:GET users/.test(t)), tag + "clicking an item runs its command");
    await page.evaluate(async () => { (await import("/js/ui/commands.js")).run("box.add"); }); await page.waitForSelector(".ext-view.active .xv-row:has-text('Added')", { timeout: 6000 });
    ok(true, tag + "onDidChangeTreeData refreshes the tree");
    // webview view
    await page.waitForSelector(".ext-view.active iframe.xv-frame", { timeout: 10000 });
    let fr = null; for (let i = 0; i < 40 && !fr; i++) { for (const f of page.frames()) { if (f !== page.mainFrame() && await f.locator("#b").count().catch(() => 0)) fr = f; } if (!fr) await page.waitForTimeout(150); }
    ok(!!fr, tag + "webview view rendered in a sandboxed frame");
    if (fr) {
      await fr.locator("#b").scrollIntoViewIfNeeded().catch(() => {}); await fr.evaluate(() => document.getElementById("b").click());
      await fr.waitForFunction(() => document.getElementById("o").textContent === "pong:42", null, { timeout: 6000 }).catch(() => {});
      ok(await fr.evaluate(() => document.getElementById("o").textContent) === "pong:42", tag + "webview ⇄ extension messages work (acquireVsCodeApi / postMessage)");
      ok(await fr.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--vscode-foreground").trim().length > 0 && document.body.classList.contains("vscode-dark")), tag + "webview gets VS Code theme variables");
      ok(await fr.evaluate(async () => { try { await fetch("https://example.com/x"); return false; } catch { return true; } }), tag + "webview cannot call the network");
    }
    // webview panel
    await page.evaluate(async () => { (await import("/js/ui/commands.js")).run("box.panel"); }); await page.waitForSelector(".xv-panel .title:has-text('Box Panel')", { timeout: 6000 });
    ok(true, tag + "createWebviewPanel opens a page"); await page.click(".xv-panel .icon-btn[title=Close]"); ok(await page.locator(".xv-panel").count() === 0, tag + "panel closes");
    // welcome-only extension (no code)
    if (mobile) { await page.click('#bottomnav [data-nav="explorer"]').catch(() => {}); await page.waitForTimeout(300); }
    await page.click(sel + '[title^="Containers"]'); await page.waitForSelector(".ext-view.active .xv-welcome");
    ok(/No containers found/.test(await page.locator(".ext-view.active .xv-welcome").textContent()) && await page.locator(".ext-view.active .xv-btn:has-text('Open Settings')").count() === 1, tag + "viewsWelcome text and command button");
    ok(!logs.some((l) => /pageerror/.test(l)), tag + "no page errors " + logs.filter((l) => /pageerror/.test(l)).join(" | "));
    await browser.close();
  }
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED"); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
