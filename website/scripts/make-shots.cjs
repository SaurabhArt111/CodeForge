// Takes the product screenshots used on the site from the real UI (dev host must be running on :8780).
//   NODE_PATH=$(npm root -g) node website/scripts/make-shots.cjs <outDir>
const { chromium } = require("playwright"); const fs = require("fs"); const http = require("http");
const OUT = process.argv[2] || "website/public/assets/shots"; fs.mkdirSync(OUT, { recursive: true });
const D = "/tmp/cf-dev/home/forge-demo"; fs.rmSync(D, { recursive: true, force: true }); fs.mkdirSync(D + "/src", { recursive: true });
fs.writeFileSync(D + "/package.json", JSON.stringify({ name: "forge-demo", version: "1.0.0", scripts: { dev: "vite --host", build: "vite build" } }, null, 2));
fs.writeFileSync(D + "/README.md", "# forge-demo\n\nA tiny project edited on a phone.\n");
fs.writeFileSync(D + "/index.html", `<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1" />\n  <title>Orbit</title>\n  <link rel="stylesheet" href="src/style.css" />\n</head>\n<body>\n  <main id="app"></main>\n  <script type="module" src="src/main.js"></script>\n</body>\n</html>\n`);
fs.writeFileSync(D + "/src/style.css", `:root { --ink: #0f1720; --accent: #3b5bff; }\nbody { margin: 0; font: 16px/1.5 system-ui; color: var(--ink); }\n.card { border-radius: 14px; padding: 16px; background: #fff; }\n`);
fs.writeFileSync(D + "/src/main.js", `import { createStore } from "./store.js";\n\nconst store = createStore({ tasks: [] });\n\nexport function addTask(title) {\n  const task = { id: crypto.randomUUID(), title, done: false };\n  store.update((s) => ({ ...s, tasks: [...s.tasks, task] }));\n  return task;\n}\n\nexport async function sync(url) {\n  const res = await fetch(url, { method: "POST", body: JSON.stringify(store.get()) });\n  if (!res.ok) throw new Error("sync failed: " + res.status);\n  return res.json();\n}\n\nstore.subscribe((s) => {\n  document.querySelector("#app").textContent = s.tasks.length + " tasks";\n});\n`);
fs.writeFileSync(D + "/src/store.js", "export const createStore = (init) => { let s = init; const subs = new Set(); return { get: () => s, update: (f) => { s = f(s); subs.forEach((fn) => fn(s)); }, subscribe: (fn) => subs.add(fn) }; };\n");

const ev = (res, name, data) => res.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
const reply = "`sync()` posts the whole store on every call, so two quick edits send the same payload twice. Debounce it:\n\n```js\nlet timer;\nexport function syncSoon(url) {\n  clearTimeout(timer);\n  timer = setTimeout(() => sync(url), 400);\n}\n```\n\nI can apply this to `src/main.js` if you like.";
const srv = http.createServer((req, res) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { res.writeHead(200, { "content-type": "text/event-stream" }); ev(res, "content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }); ev(res, "content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: reply } }); ev(res, "message_stop", { type: "message_stop" }); res.end(); }); });

(async () => {
  await new Promise((r) => srv.listen(8797, r));
  const browser = await chromium.launch();
  const boot = async (w, h, mobile) => {
    for (const f of ["state.json", "settings.json"]) fs.rmSync("/tmp/cf-dev/cf/" + f, { force: true });
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: mobile, isMobile: mobile });
    const page = await ctx.newPage(); await page.goto("http://127.0.0.1:8780/"); await page.waitForFunction(() => window.__cfReady, null, { timeout: 60000 });
    await page.evaluate(async (D) => { const m = await import("/js/main.js"); const { settings } = await import("/js/core/settings.js"); settings.set("editor.minimap", false); await m.openFolder(D); const ed = await import("/js/ui/editor.js"); await ed.openFile(D + "/src/main.js"); }, D);
    await page.waitForSelector(".monaco-editor .view-line"); await page.waitForTimeout(900);
    return { page, ctx };
  };
  const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.jpg`, type: "jpeg", quality: 84 });
  const typeInTerm = async (page, lines) => { await page.click("#panel .xterm-screen"); for (const l of lines) { await page.keyboard.type(l + "\n"); await page.waitForTimeout(700); } await page.waitForTimeout(400); };

  // desktop: explorer + editor + terminal sheet
  { const { page, ctx } = await boot(1280, 800, false);
    await page.evaluate(async () => (await import("/js/ui/panel.js")).show("terminal")); await page.waitForSelector("#panel .xterm-screen"); await page.waitForTimeout(900);
    await typeInTerm(page, ["clear", "ls src", "node -v", "echo \"ready on http://localhost:5173\""]);
    await page.evaluate(() => document.querySelector(".toast")?.remove()); await shot(page, "desktop"); await ctx.close(); }

  // mobile: editor + bottom sheet (terminal), then top+bottom sheets
  { const { page, ctx } = await boot(412, 860, true);
    await page.evaluate(async () => (await import("/js/ui/panel.js")).show("terminal")); await page.waitForSelector("#panel .xterm-screen"); await page.waitForTimeout(900);
    await typeInTerm(page, ["clear", "ls src", "node -v"]);
    await page.evaluate(() => document.querySelectorAll(".toast").forEach((t) => t.remove())); await shot(page, "mobile-terminal");
    // AI docked in the bottom sheet alone, then terminal on top + AI below
    await page.evaluate(async () => { const ai = await import("/js/features/ai.js"); ai.PROVIDERS.anthropic.base = "http://127.0.0.1:8797"; const { N } = await import("/js/core/bridge.js"); const { settings } = await import("/js/core/settings.js"); await N.secret.set("ai.anthropic", "sk-ant-demo"); settings.set("ai.provider", "anthropic"); settings.set("ai.model", "claude-sonnet-5-5"); const p = await import("/js/ui/panel.js"); p.move("ai", "bottom"); p.show("ai"); });
    await page.waitForTimeout(700);
    await page.evaluate(async () => (await import("/js/features/ai.js")).external("Why does sync() send the same payload twice?", { send: true })); await page.waitForSelector(".ai-msg.assistant .ai-code", { timeout: 15000 }); await page.waitForTimeout(600);
    await page.evaluate(() => document.querySelectorAll(".toast").forEach((t) => t.remove())); await shot(page, "mobile-ai");
    await page.evaluate(async () => { const p = await import("/js/ui/panel.js"); p.move("terminal", "top"); p.show("terminal"); p.show("ai"); }); await page.waitForTimeout(1000);
    await page.evaluate(() => document.querySelectorAll(".toast").forEach((t) => t.remove())); await shot(page, "mobile-sheets"); await ctx.close(); }

  // mobile: crash reports
  { const { page, ctx } = await boot(412, 860, true);
    await page.evaluate(async () => { const { N } = await import("/js/core/bridge.js"); await N.crash.clear();
      await N.crash.report({ kind: "preview-renderer", title: "Preview page crashed (WebGL context lost)", detail: "preview window http://127.0.0.1:5500/\nrenderer gone: crashed=false", fatal: true });
      await N.crash.report({ kind: "low-memory", title: "Killed by Android: low memory", detail: "pss=612000KB\nlast actions: preview, terminal", fatal: true });
      await N.crash.report({ kind: "js-error", title: "TypeError: Cannot read properties of undefined (reading 'map')", detail: "at render (main.js:42:18)" }); });
    await page.evaluate(async () => (await import("/js/ui/crashes.js")).openReports()); await page.waitForSelector(".crash-row"); await page.waitForTimeout(400); await shot(page, "mobile-crashes");
    await page.click(".crash-row"); await page.waitForSelector(".crash-text"); await page.waitForTimeout(300); await shot(page, "mobile-report"); await ctx.close(); }

  // mobile: bigger text (accessibility)
  { const { page, ctx } = await boot(412, 860, true);
    await page.evaluate(async () => (await import("/js/core/settings.js")).settings.set("ui.fontScale", 125)); await page.waitForTimeout(800); await shot(page, "mobile-text-size"); await ctx.close(); }
  await browser.close(); srv.close(); console.log(fs.readdirSync(OUT).join(" "));
})();
