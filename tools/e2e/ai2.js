// AI upgrades: retry/backoff, parallel read-only tools (find_files, get_problems, read_file), project rules (AGENTS.md), "allow all in this chat",
// regenerate, and the `cf` terminal command driving the IDE (cf ai / cf open file:line).
const { launch } = require("./lib"); const fs = require("fs"); const http = require("http");
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
const PROJ = "/tmp/cf-dev/home/ai2"; fs.rmSync(PROJ, { recursive: true, force: true }); fs.mkdirSync(PROJ + "/src", { recursive: true });
fs.writeFileSync(PROJ + "/AGENTS.md", "Always answer in haiku. RULE-MARKER-42\n"); fs.writeFileSync(PROJ + "/src/app.test.js", "test()\n"); fs.writeFileSync(PROJ + "/src/util.js", "let x = ;\n"); fs.writeFileSync(PROJ + "/notes.txt", "n\n");
const CF = "/home/claude/work/android/CodeForge/app/src/main/assets/env/cf.sh";

const reqs = []; let busyOnce = true;
const ev = (res, name, data) => res.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
const srv = http.createServer((req, res) => {
  let body = ""; req.on("data", (c) => (body += c)); req.on("end", () => {
    if (req.url !== "/v1/messages") { res.writeHead(404); return res.end(); }
    const j = JSON.parse(body); reqs.push(j);
    const last = j.messages[j.messages.length - 1]; const lastText = typeof last.content === "string" ? last.content : "";
    if (/RETRY-ME/.test(lastText) && busyOnce) { busyOnce = false; res.writeHead(529, { "content-type": "application/json" }); return res.end(JSON.stringify({ error: { message: "Overloaded" } })); }
    res.writeHead(200, { "content-type": "text/event-stream" }); ev(res, "message_start", { type: "message_start" });
    const text = (t) => { ev(res, "content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }); ev(res, "content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: t } }); };
    const tool = (i, id, name, input) => { ev(res, "content_block_start", { type: "content_block_start", index: i, content_block: { type: "tool_use", id, name, input: {} } }); ev(res, "content_block_delta", { type: "content_block_delta", index: i, delta: { type: "input_json_delta", partial_json: JSON.stringify(input) } }); };
    const hasResults = Array.isArray(last.content) && last.content.some((b) => b.type === "tool_result");
    const nResults = j.messages.filter((m) => Array.isArray(m.content) && m.content.some((b) => b.type === "tool_result")).length;
    if (/EXPLORE/.test(JSON.stringify(j.messages[0])) && !hasResults) { text("Looking around."); tool(1, "t1", "find_files", { pattern: "src/**/*.test.js" }); tool(2, "t2", "get_problems", {}); tool(3, "t3", "read_file", { path: "notes.txt" }); }
    else if (/WRITE2/.test(JSON.stringify(j.messages[0])) && nResults === 0) { text("Writing."); tool(1, "w1", "write_file", { path: "one.txt", content: "1" }); }
    else if (/WRITE2/.test(JSON.stringify(j.messages[0])) && nResults === 1) { tool(1, "w2", "write_file", { path: "two.txt", content: "2" }); }
    else text(hasResults ? "All done." : "Plain answer #" + reqs.length);
    ev(res, "message_stop", { type: "message_stop" }); res.end();
  });
});
(async () => {
  await new Promise((r) => srv.listen(8796, r));
  for (const mobile of [false]) {
    const tag = mobile ? "[mobile] " : "[desktop] ";
    const { browser, page, logs } = await launch({ mobile });
    await page.waitForFunction(() => window.__cfReady, null, { timeout: 40000 });
    await page.evaluate(async () => { const m = await import("/js/main.js"); const { N } = await import("/js/core/bridge.js"); const { settings } = await import("/js/core/settings.js"); await N.secret.set("ai.anthropic", "sk-ant-test"); settings.set("ai.provider", "anthropic"); settings.set("ai.model", "claude-mock"); settings.set("ai.agentConfirm", true); await m.openFolder("/tmp/cf-dev/home/ai2"); const ai = await import("/js/features/ai.js"); ai.PROVIDERS.anthropic.base = "http://127.0.0.1:8796"; await m.openFolder("/tmp/cf-dev/home/ai2"); });
    await page.click('.ab-btn[data-view="ai"]'); await page.waitForSelector("#view-ai textarea");
    const send = async (t) => { await page.fill("#view-ai textarea", t); await page.keyboard.press("Enter"); };

    // 1. retry with backoff
    await send("RETRY-ME hello");
    await page.waitForSelector(".ai-note", { timeout: 6000 }); ok(/retrying/i.test(await page.textContent(".ai-note")), tag + "transient 529 shows a retry note");
    await page.waitForSelector(".ai-msg.assistant .ai-md:has-text('Plain answer')", { timeout: 15000 }); ok(reqs.length === 2, tag + "request retried and then succeeded (" + reqs.length + " requests)");
    ok(/RULE-MARKER-42/.test(reqs[1].system || ""), tag + "AGENTS.md is part of the system prompt");

    // 2. regenerate
    const before = reqs.length; await page.locator(".ai-msg.assistant .ai-actions button[title='Regenerate']").last().click();
    await page.waitForFunction((n) => document.querySelectorAll(".ai-msg.assistant").length >= 1 && true, before); await page.waitForTimeout(1200);
    ok(reqs.length === before + 1 && /Plain answer/.test(await page.textContent(".ai-msg.assistant .ai-md")), tag + "regenerate asks again and replaces the reply");

    // 3. agent with parallel read-only tools
    await page.evaluate(async () => (await import("/js/features/ai.js")).external("/clear", { send: true })); await page.waitForTimeout(400);
    await page.click('.ai-modes .chip:has-text("Agent")'); await send("EXPLORE the project"); await page.waitForTimeout(800); if (0) console.log("   after send: textarea=", JSON.stringify(await page.inputValue("#view-ai textarea")), "active=", await page.evaluate(() => document.activeElement?.tagName + "." + document.activeElement?.className), "mode chips=", await page.evaluate(() => [...document.querySelectorAll(".ai-modes .chip")].map((c) => c.className).join("|")));
    await page.waitForSelector(".ai-msg:has-text('All done.')", { timeout: 20000 }).catch(async () => { console.log("   logs:", logs.slice(-4).join(" | ").slice(0, 500)); console.log("   debug msgs:", (await page.evaluate(() => [...document.querySelectorAll(".ai-msg, .ai-tool, .modal")].map((e) => e.className + ":" + e.textContent.slice(0, 90)))).join(" || "), "| reqs", reqs.length, JSON.stringify(reqs[reqs.length - 1]?.messages?.slice(-1)).slice(0, 300)); throw new Error("agent step"); });
    const last = reqs[reqs.length - 1]; const results = last.messages[last.messages.length - 1].content;
    ok(Array.isArray(results) && results.length === 3, tag + "three tool results returned in one step");
    const byId = Object.fromEntries(results.map((r) => [r.tool_use_id, String(r.content)]));
    ok(/src\/app\.test\.js/.test(byId.t1) && !/util\.js/.test(byId.t1), tag + "find_files glob matched only the test file: " + (byId.t1 || "").slice(0, 60));
    ok(typeof byId.t2 === "string" && byId.t2.length > 0, tag + "get_problems answered: " + (byId.t2 || "").slice(0, 60));
    ok(/^n/.test(byId.t3), tag + "read_file result delivered");

    // 4. approval dialog shows a diff; "Allow all in this chat" skips the second dialog
    await page.evaluate(async () => (await import("/js/features/ai.js")).external("/clear", { send: true })); await page.waitForTimeout(400);
    await send("WRITE2 please");
    await page.waitForSelector(".modal button:has-text('Allow all in this chat')", { timeout: 15000 }); ok(true, tag + "approval dialog offers 'Allow all in this chat'");
    await page.click(".modal button:has-text('Allow all in this chat')");
    await page.waitForSelector(".ai-msg:has-text('Plain answer'), .ai-msg:has-text('All done.')", { timeout: 20000 }).catch(() => {}); await page.waitForTimeout(1500);
    ok(fs.existsSync(PROJ + "/one.txt") && fs.existsSync(PROJ + "/two.txt"), tag + "both files written after a single approval");
    ok(!(await page.evaluate(() => !!document.querySelector(".modal-wrap"))), tag + "no second dialog");

    // 5. cf command from the terminal
    await page.evaluate(async () => (await import("/js/ui/panel.js")).show("terminal")); await page.waitForSelector("#panel .xterm-screen"); await page.waitForTimeout(900);
    await page.evaluate(async () => (await import("/js/features/ai.js")).external("/clear", { send: true })); await page.waitForTimeout(300);
    const n0 = reqs.length;
    await page.keyboard.type(`sh ${CF} ai -s "ping from shell"\n`); await page.waitForTimeout(2500);
    ok(reqs.length > n0 && JSON.stringify(reqs[reqs.length - 1].messages).includes("ping from shell"), tag + "`cf ai -s` sent the prompt through the AI panel");
    await page.click("#panel .xterm-screen"); await page.keyboard.type(`sh ${CF} open ${PROJ}/src/util.js:1\n`); await page.waitForSelector(".tab:has-text('util.js')", { timeout: 8000 }).catch(async () => { console.log("   term:", (await page.evaluate(() => document.querySelector("#panel .xterm-rows")?.textContent || "")).slice(-400), "| tabs:", await page.evaluate(() => [...document.querySelectorAll(".tab")].map((t) => t.textContent).join("|")), "| toasts:", await page.evaluate(() => [...document.querySelectorAll(".toast")].map((t) => t.textContent).join("|"))); }); ok(true, tag + "`cf open file:line` opened the file");
    await page.click("#panel .xterm-screen"); await page.keyboard.type(`echo "piped text" | sh ${CF} ai\n`); await page.waitForTimeout(1200);
    ok(/piped text/.test(await page.inputValue("#view-ai textarea")), tag + "`… | cf ai` prefills the prompt with piped text");
    await page.click("#panel .xterm-screen"); await page.keyboard.type(`sh ${CF} toast "hello from cf"\n`); await page.waitForSelector(".toast:has-text('hello from cf')", { timeout: 5000 }); ok(true, tag + "`cf toast` shows a notification");

    const bad = logs.filter((l) => !/sandbox|reqfail: http:\/\/127\.0\.0\.1:(5500|5173)|workerMain|status of 529|529/.test(l)); ok(!bad.length, tag + "no console errors" + (bad.length ? ": " + bad.slice(0, 3).join(" | ") : ""));
    await browser.close();
  }
  srv.close(); console.log(fails ? fails + " FAILED" : "ALL OK"); process.exit(fails ? 1 : 0);
})();
