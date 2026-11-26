// v8.5: the AI agent's own terminals (open several, run in parallel, background jobs, prompts, permissions) + environment tools.
const { launch } = require("./lib"); const fs = require("fs");
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
const ROOT = "/tmp/cf-dev", D = ROOT + "/home/v85";
for (const f of ["state.json", "settings.json", "lock.json"]) fs.rmSync(ROOT + "/cf/" + f, { force: true });
fs.rmSync(D, { recursive: true, force: true }); fs.mkdirSync(D + "/src", { recursive: true }); fs.writeFileSync(D + "/src/a.txt", "hello\n");
const sse = (events) => events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
const toolUse = (index, id, name, input) => [{ type: "content_block_start", index, content_block: { type: "tool_use", id, name, input: {} } }, { type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: JSON.stringify(input) } }, { type: "content_block_stop", index }];

(async () => {
  const { browser, page, logs } = await launch({ mobile: false });
  await page.waitForFunction(() => window.__cfReady, null, { timeout: 40000 });
  await page.evaluate(async (d) => {
    const m = await import("/js/main.js"); const { settings } = await import("/js/core/settings.js"); const { N } = await import("/js/core/bridge.js");
    await N.secret.set("ai.anthropic", "sk-ant-test"); settings.set("ai.provider", "anthropic"); settings.set("ai.model", "claude-mock"); settings.set("ai.terminalAccess", "auto");
    await m.openFolder(d); const ai = await import("/js/features/ai.js"); ai.PROVIDERS.anthropic.base = "http://127.0.0.1:8796";
  }, D);
  await page.waitForTimeout(800);
  const T = (name, input) => page.evaluate(async ([n, i]) => { const a = await import("/js/features/agentterm.js"); const ai = await import("/js/features/ai.js"); return a.call(n, i, {}); }, [name, input]);
  const names = await page.evaluate(async () => (await import("/js/features/agentterm.js")).TOOLS.map((t) => t.name));
  ok(["terminal_open", "terminal_run", "terminal_read", "terminal_send", "terminal_list", "terminal_close", "environment_status", "install_packages", "setup_environment"].every((n) => names.includes(n)), "agent has the terminal + environment tools: " + names.join(","));

  // 1. open, run, state persists, exit codes
  let r = await T("terminal_open", { name: "build" }); ok(!r.isError && /Opened terminal "build"/.test(r.output), "terminal_open: " + r.output.slice(0, 80));
  ok((await page.locator(".term-tab.agent").count()) === 1, "the agent's terminal is a visible, marked tab");
  r = await T("terminal_run", { terminal: "build", command: "cd src && pwd" }); ok(!r.isError && /exit code 0/.test(r.output) && /v85\/src/.test(r.output), "run returns output + exit code 0: " + JSON.stringify(r.output.slice(0, 80)));
  r = await T("terminal_run", { terminal: "build", command: "pwd; export FOO=bar" }); ok(/v85\/src/.test(r.output), "state (cd) persists between calls");
  r = await T("terminal_run", { terminal: "build", command: "echo $FOO; ls" }); ok(/bar/.test(r.output) && /a\.txt/.test(r.output) && !/__CFDONE/.test(r.output), "exported variable persists, marker is not leaked");
  r = await T("terminal_run", { terminal: "build", command: "false" }); ok(r.isError && /exit code 1/.test(r.output), "failing command reports exit code 1 and isError");
  r = await T("terminal_run", { terminal: "build", command: "echo one; echo two >&2; printf 'x\\ry\\n'" }); ok(/one/.test(r.output) && /two/.test(r.output), "stdout and stderr are both captured");

  // 2. parallel terminals
  const t0 = Date.now();
  const [pa, pb] = await page.evaluate(async () => { const a = await import("/js/features/agentterm.js"); return Promise.all([a.call("terminal_run", { terminal: "alpha", command: "sleep 2; echo ALPHA" }, {}), a.call("terminal_run", { terminal: "beta", command: "sleep 2; echo BETA" }, {})]); });
  const el = Date.now() - t0; ok(/ALPHA/.test(pa.output) && /BETA/.test(pb.output) && el < 4600, `two terminals ran side by side (${el} ms)`);
  ok((await page.locator(".term-tab.agent").count()) === 3, "three agent tabs open");

  // 3. background job, read, stop
  r = await T("terminal_run", { terminal: "server", command: "echo SERVER-UP; while true; do echo tick; sleep 1; done", background: true, settle_seconds: 2 });
  ok(/running in the background/.test(r.output) && /SERVER-UP/.test(r.output), "background command returns early with first output");
  r = await T("terminal_read", { terminal: "server", wait_seconds: 3 }); ok(/tick/.test(r.output), "terminal_read follows a running job");
  r = await T("terminal_list", {}); ok(/server \(yours\) · running/.test(r.output), "terminal_list shows the running job");
  r = await T("terminal_run", { terminal: "server", command: "echo again" }); ok(r.isError && /still running/.test(r.output), "a busy terminal refuses a second command");
  r = await T("terminal_send", { terminal: "server", keys: ["C-c"] }); await page.waitForTimeout(800);
  r = await T("terminal_run", { terminal: "server", command: "echo free" }); ok(/free/.test(r.output) && !r.isError, "Ctrl+C via terminal_send frees the terminal");

  // 4. timeout and prompts
  r = await T("terminal_run", { terminal: "build", command: "sleep 12; echo late", timeout_seconds: 5 }); ok(/still running after/.test(r.output), "timeout leaves the command running: " + r.output.split("\n")[0]);
  r = await T("terminal_send", { terminal: "build", keys: ["C-c"] }); await page.waitForTimeout(900);
  r = await T("terminal_run", { terminal: "build", command: 'read -p "Continue? [y/N] " a; echo got=$a' }); ok(/waiting for input/.test(r.output), "a question is detected: " + r.output.split("\n")[0]);
  r = await T("terminal_send", { terminal: "build", text: "y" }); ok(/got=y/.test(r.output), "terminal_send answers the prompt");

  // 5. user's terminals are read-only for the agent; limits; close
  await page.evaluate(async () => { const t = await import("/js/ui/terminal.js"); await t.create({ title: "mine" }); });
  await page.waitForTimeout(800);
  r = await T("terminal_send", { terminal: "mine", text: "echo hi" }); ok(r.isError && /user's own terminals are read-only/.test(r.output), "cannot type into the user's terminal");
  r = await T("terminal_read", { terminal: "mine", lines: 5 }); ok(!r.isError, "can read the user's terminal");
  r = await T("terminal_close", { terminal: "mine" }); ok(r.isError, "cannot close the user's terminal");
  await page.evaluate(async () => { (await import("/js/core/settings.js")).settings.set("ai.maxTerminals", 5); });
  r = await T("terminal_open", { name: "five" }); ok(!r.isError, "5th terminal ok"); r = await T("terminal_open", { name: "six" }); ok(r.isError && /limit 5/.test(r.output), "terminal limit enforced: " + r.output.slice(0, 50));
  r = await T("terminal_close", { terminal: "five" }); ok(!r.isError, "terminal_close"); await page.evaluate(async () => { (await import("/js/core/settings.js")).settings.set("ai.maxTerminals", 6); });

  // 6. permissions
  const ask = async (cmd, button) => { const p = page.evaluate(async (c) => (await import("/js/features/agentterm.js")).call("terminal_run", { terminal: "build", command: c }, {}), cmd); await page.waitForSelector(".modal", { timeout: 6000 }); const title = await page.textContent(".modal .modal-title, .modal h2, .modal-head").catch(() => ""); await page.click(`.modal button:has-text("${button}")`); return { res: await p, title }; };
  await page.evaluate(async () => { (await import("/js/core/settings.js")).settings.set("ai.terminalAccess", "ask"); });
  let q = await ask("echo asked", "Reject"); ok(q.res.isError && /Rejected/.test(q.res.output), "ask mode: Reject blocks the command");
  q = await ask("echo asked2", "Allow"); ok(/asked2/.test(q.res.output), "ask mode: Allow runs it");
  await page.evaluate(async () => { (await import("/js/core/settings.js")).settings.set("ai.terminalAccess", "auto"); });
  q = await ask("rm -rf /", "Reject"); ok(q.res.isError && /risky/i.test(q.title), "auto mode still asks for risky commands (title: " + q.title + ")");
  ok(fs.existsSync(D + "/src/a.txt"), "files untouched");
  await page.evaluate(async () => { (await import("/js/core/settings.js")).settings.set("ai.terminalAccess", "off"); });
  r = await T("terminal_run", { terminal: "build", command: "echo no" }); ok(r.isError && /turned off/.test(r.output), "off mode blocks terminal use");
  await page.evaluate(async () => { (await import("/js/core/settings.js")).settings.set("ai.terminalAccess", "auto"); });

  // 7. environment tools
  r = await T("environment_status", {}); ok(/Linux environment/.test(r.output) && /Commands found/.test(r.output), "environment_status: " + r.output.split("\n")[0]);
  r = await T("install_packages", { manager: "npm", packages: ["left-pad; rm -rf /"] }); ok(r.isError && /Invalid package/.test(r.output), "package names are validated");
  r = await T("install_packages", { manager: "apk", packages: ["git"] }); ok(r.isError && /Linux environment|setup_environment/.test(r.output), "apk without Linux env points to setup_environment");

  // 8. full agent loop: the model starts two jobs in two terminals at once
  const calls = []; const http = require("http");
  const srv = http.createServer((req, res) => {
    let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => {
      if (req.url !== "/v1/messages") { res.writeHead(404); return res.end(); }
      const body = JSON.parse(b || "{}"); calls.push(body);
      const hasResult = body.messages.some((m) => Array.isArray(m.content) && m.content.some((x) => x.type === "tool_result"));
      const ev = hasResult ? [{ type: "message_start", message: { id: "m2" } }, { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }, { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Both jobs finished." } }, { type: "content_block_stop", index: 0 }, { type: "message_stop" }]
        : [{ type: "message_start", message: { id: "m1" } }, { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }, { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Starting two jobs. " } }, { type: "content_block_stop", index: 0 },
          ...toolUse(1, "tu1", "terminal_run", { terminal: "lint", command: "sleep 2; echo LINT-OK" }), ...toolUse(2, "tu2", "terminal_run", { terminal: "tests", command: "sleep 2; echo TESTS-OK" }), { type: "message_stop" }];
      res.writeHead(200, { "content-type": "text/event-stream" }); res.end(sse(ev));
    });
  }); await new Promise((r) => srv.listen(8796, r));
  await page.click('.ab-btn[data-view="ai"]'); await page.waitForSelector("#view-ai textarea"); await page.click('.ai-modes .chip:has-text("Agent")');
  const t1 = Date.now(); await page.fill("#view-ai textarea", "run lint and tests"); await page.keyboard.press("Enter");
  await page.waitForFunction(() => /Both jobs finished/.test(document.querySelector("#view-ai")?.textContent || ""), null, { timeout: 25000 }); const el2 = Date.now() - t1;
  const results = JSON.stringify(calls[1]?.messages?.at(-1)?.content || []);
  ok(calls[0].tools?.some((t) => t.name === "terminal_run") && /LINT-OK/.test(results) && /TESTS-OK/.test(results), "agent loop: both terminal_run results reach the model");
  ok(el2 < 6500, `agent loop ran the two terminals in parallel (${el2} ms)`);
  ok(/terminal_run/.test(await page.textContent("#view-ai")), "tool cards show in the chat");

  srv.close(); await browser.close();
  const bad = logs.filter((l) => /pageerror/.test(l)); ok(!bad.length, "no page errors" + (bad.length ? ": " + bad.slice(0, 3).join(" | ") : ""));
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED"); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
