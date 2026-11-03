const { launch } = require("./lib"); const mock = require("./mock"); const fs = require("fs");
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
for (const f of ["state.json", "settings.json", "secrets.json"]) fs.rmSync("/tmp/cf-dev/cf/" + f, { force: true });
fs.rmSync("/tmp/cf-dev/cf/extensions", { recursive: true, force: true }); fs.rmSync("/tmp/cf-dev/cf/plugins", { recursive: true, force: true });
fs.rmSync("/tmp/cf-dev/home/ai", { recursive: true, force: true }); fs.mkdirSync("/tmp/cf-dev/home/ai"); fs.writeFileSync("/tmp/cf-dev/home/ai/main.py", "x = 1\n"); fs.writeFileSync("/tmp/cf-dev/home/ai/app.js", "const a=1\nfunction f( x ){return x+1}\n");
(async () => {
  const m = await mock.start(8790);
  const { browser, page, logs } = await launch();
  await page.waitForFunction(() => window.__cfReady || window.__cfError, null, { timeout: 40000 });
  ok(await page.evaluate(() => !!window.__cfReady), "boot");
  await page.evaluate(async () => { const mm = await import("/js/main.js"); const { settings } = await import("/js/core/settings.js"); settings.set("extensions.registry", "http://127.0.0.1:8790"); settings.set("ai.agentConfirm", false); settings.set("ai.endpoint.custom", "http://127.0.0.1:8790/v1"); await mm.openFolder("/tmp/cf-dev/home/ai"); });
  // --- extensions via marketplace UI
  await page.click('.ab-btn[data-view="extensions"]'); await page.click('.ext-chip:has-text("Popular")');
  await page.waitForSelector(".ext-row:has-text('Mock Theme Pack')", { timeout: 10000 }); ok(true, "marketplace search lists mock extension");
  await page.click(".ext-row:has-text('Mock Theme Pack') .btn.primary");
  await page.waitForFunction(() => document.querySelector("#toasts")?.textContent.includes("Installed Mock Theme Pack"), null, { timeout: 15000 }); ok(true, "extension installed");
  const r = await page.evaluate(async () => { const t = await import("/js/features/themes.js"); const ic = await import("/js/features/icons.js"); const ed = await import("/js/ui/editor.js");
    return { theme: t.list().some((x) => x.label === "Mock Midnight"), icon: ic.list().some((x) => x.id === "acme.mock-theme:mockicons"), lang: ed.monaco.languages.getLanguages().some((l) => l.id === "mocklang") }; });
  ok(r.theme && r.icon && r.lang, "theme + icon theme + language registered " + JSON.stringify(r));
  await page.evaluate(async () => { const { settings } = await import("/js/core/settings.js"); settings.set("ui.theme", "Mock Midnight"); });
  await page.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue("--bg").trim().toLowerCase() === "#101830", null, { timeout: 5000 }).then(() => ok(true, "installed theme applied to UI")).catch(async () => ok(false, "installed theme applied: " + (await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--bg")))));
  ok(fs.existsSync("/tmp/cf-dev/cf/extensions/acme.mock-theme-1.2.3/extension/package.json"), "extension files on disk");
  // snippet from extension
  await page.evaluate(async () => { const ed = await import("/js/ui/editor.js"); await ed.openFile("/tmp/cf-dev/home/ai/main.py"); });
  await page.waitForSelector(".monaco-editor");
  const sn = await page.evaluate(async () => { const ed = await import("/js/ui/editor.js"); const m = ed.monaco; const model = ed.activeDoc().model; const res = await new Promise((r) => { const e = ed.activeEditor(); e.setPosition({ lineNumber: 2, column: 1 }); e.focus(); setTimeout(async () => { try { const out = await m.languages.getLanguages(); r(out.length); } catch { r(0); } }, 10); }); return res; });
  ok(sn > 10, "monaco languages available");
  // --- plugins
  await page.evaluate(async () => { const pl = await import("/js/features/plugins.js"); const { N } = await import("/js/core/bridge.js"); const { settings } = await import("/js/core/settings.js");
    const dir = settings.dataDir + "/plugins/shout"; await N.fs.mkdir(dir);
    await N.fs.writeText(dir + "/plugin.json", JSON.stringify({ id: "shout", name: "Shout", version: "1", main: "index.js", permissions: ["editor", "commands", "ui"] }));
    await N.fs.writeText(dir + "/index.js", `cf.commands.register("up","Shout selection", async()=>{ const t=await cf.editor.getText(); await cf.editor.setText(t.toUpperCase()); cf.ui.toast("shouted"); }); cf.commands.register("bad","Bad", async()=>{ try{ await cf.fs.read("x"); }catch(e){ await cf.ui.toast("denied:"+e.message,"warn"); } });`);
    await pl.init((await import("/js/main.js")).api); });
  await page.waitForTimeout(800);
  await page.evaluate(async () => { const c = await import("/js/ui/commands.js"); await c.run("plugin.shout.up"); });
  await page.waitForFunction(() => document.querySelector(".monaco-editor .view-lines")?.textContent.includes("X = 1") || document.querySelector(".monaco-editor .view-lines")?.textContent.includes("X = 1"), null, { timeout: 8000 }).then(() => ok(true, "plugin command transformed editor text")).catch(() => ok(false, "plugin command transformed editor text"));
  await page.evaluate(async () => { const c = await import("/js/ui/commands.js"); await c.run("plugin.shout.bad"); });
  await page.waitForFunction(() => document.querySelector("#toasts")?.textContent.includes("lacks permission"), null, { timeout: 5000 }).then(() => ok(true, "plugin permission enforced")).catch(() => ok(false, "plugin permission enforced"));
  // sandbox isolation: plugin cannot reach parent
  const iso = await page.evaluate(() => { const f = [...document.querySelectorAll("iframe")].find((x) => x.sandbox.contains("allow-scripts") && !x.sandbox.contains("allow-same-origin") && x.style.display === "none"); try { return f.contentWindow.document ? "ACCESSIBLE" : "blocked"; } catch { return "blocked"; } });
  ok(iso === "blocked", "plugin iframe is origin-isolated from the IDE");
  // --- AI chat (anthropic mock)
  await page.evaluate(async () => { const { N } = await import("/js/core/bridge.js"); const { settings } = await import("/js/core/settings.js"); await N.secret.set("ai.anthropic", "sk-ant-test"); await N.secret.set("ai.custom", "sk-custom"); settings.set("ai.provider", "anthropic"); settings.set("ai.model", "claude-test"); });
  // point anthropic base at mock by patching provider table
  await page.evaluate(async () => { const ai = await import("/js/features/ai.js"); ai.PROVIDERS.anthropic.base = "http://127.0.0.1:8790"; });
  await page.click('.ab-btn[data-view="ai"]');
  await page.fill("#view-ai textarea", "say hi"); await page.keyboard.press("Enter");
  await page.waitForSelector(".ai-msg.assistant .ai-md:has-text('from Claude mock')", { timeout: 15000 }); ok(true, "streamed anthropic reply rendered");
  ok((await page.locator(".ai-code").count()) === 1, "code block rendered with actions");
  const seenA = m.seen.anthropic[0]; ok(seenA && seenA.headers["x-api-key"] === "sk-ant-test" && seenA.body.stream === true && seenA.body.messages[0].content.includes("say hi"), "request had expanded secret header + body");
  ok(seenA.body.messages[0].content.includes("main.py"), "active file attached as context");
  // agent mode with tool call
  await page.click('.ai-modes .chip:has-text("Agent")');
  await page.fill("#view-ai textarea", "make a file"); await page.keyboard.press("Enter");
  await page.waitForSelector(".ai-msg:has-text('Done: file written.')", { timeout: 20000 }); ok(true, "agent loop completed after tool result");
  ok(fs.existsSync("/tmp/cf-dev/home/ai/ai-made.txt") && fs.readFileSync("/tmp/cf-dev/home/ai/ai-made.txt", "utf8") === "from agent", "agent write_file tool created the file");
  // openai-compatible (custom)
  await page.evaluate(async () => { const { settings } = await import("/js/core/settings.js"); settings.set("ai.provider", "custom"); settings.set("ai.model", "mock-model-1"); });
  await page.click('.ai-modes .chip:has-text("Chat")'); await page.fill("#view-ai textarea", "hello openai"); await page.keyboard.press("Enter");
  await page.waitForSelector(".ai-msg:has-text('OpenAI mock reply')", { timeout: 15000 }); ok(true, "openai-compatible streaming works");
  ok(m.seen.openai[0]?.headers.authorization === "Bearer sk-custom", "bearer secret injected");
  await page.screenshot({ path: "/tmp/cf-dev/shot4.png" });
  // --- format + emmet
  const fmt = await page.evaluate(async () => { const ed = await import("/js/ui/editor.js"); await ed.openFile("/tmp/cf-dev/home/ai/app.js"); await new Promise((r) => setTimeout(r, 400)); await ed.activeEditor().getAction("editor.action.formatDocument").run(); await new Promise((r) => setTimeout(r, 1500)); return ed.activeDoc().model.getValue(); });
  ok(/function f\(x\) \{\n\s+return x \+ 1;/.test(fmt) && fmt.includes("const a = 1;"), "prettier formats JS: " + JSON.stringify(fmt));
  console.log(logs.filter((l) => !/Failed to load resource|reqfail|iframe which has both/.test(l)).slice(0, 15).join("\n"));
  await page.evaluate(async () => { const { N } = await import("/js/core/bridge.js"); for (const t of await N.term.list()) await N.term.close(t.id); });
  await browser.close(); m.close(); console.log(fails ? `${fails} FAILED` : "ALL OK"); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
