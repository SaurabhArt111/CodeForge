// e2e (dev host): terminal one-finger scrolling, AI side bar tabs, About page, layout homes, --host for dev servers.
const { launch } = require("./lib"); const fs = require("fs");
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
for (const f of ["state.json", "settings.json"]) fs.rmSync("/tmp/cf-dev/cf/" + f, { force: true });
fs.mkdirSync("/tmp/cf-dev/home/v82", { recursive: true }); fs.writeFileSync("/tmp/cf-dev/home/v82/a.js", "1\n");
// an old saved layout with Run & Preview parked in the bottom panel must be put back
fs.mkdirSync("/tmp/cf-dev/cf", { recursive: true }); fs.writeFileSync("/tmp/cf-dev/cf/state.json", JSON.stringify({ sheets: { v: 2, bottom: ["terminal", "run", "preview"], right: [], top: ["ai"], page: [] } }));
(async () => {
  const { browser, page, logs } = await launch({ mobile: true });
  await page.waitForFunction(() => window.__cfReady || window.__cfError, null, { timeout: 40000 });
  await page.evaluate(async () => { const m = await import("/js/main.js"); await m.openFolder("/tmp/cf-dev/home/v82"); });
  const lay = await page.evaluate(async () => (await import("/js/ui/panel.js")).layout());
  ok(JSON.stringify(lay) === JSON.stringify({ top: [], bottom: ["terminal", "preview", "output", "problems"], right: ["ai"], page: [] }) && await page.evaluate(() => !!document.querySelector("#sidebar #view-run")), "old layout migrated: Run & Preview back in the side bar, AI right, terminal bottom " + JSON.stringify(lay));

  // ---- terminal scroll by finger
  await page.evaluate(async () => (await import("/js/ui/panel.js")).show("terminal")); await page.waitForSelector(".term-body.on .xterm-screen", { timeout: 20000 }); await page.waitForTimeout(1200);
  await page.evaluate(async () => { const t = (await import("/js/ui/terminal.js")).get(); await new Promise((r) => t.xt.write(Array.from({ length: 200 }, (_, i) => "line " + i).join("\r\n") + "\r\n", r)); });
  const y0 = await page.evaluate(async () => (await import("/js/ui/terminal.js")).get().xt.buffer.active.viewportY);
  const swipe = (dy) => page.evaluate(([dy]) => {
    const host = document.querySelector(".term-body.on"); const r = host.getBoundingClientRect(); const x = r.left + r.width / 2; let y = r.top + r.height / 2;
    const mk = (type, yy) => { const t = new Touch({ identifier: 1, target: host.querySelector(".xterm-screen") || host, clientX: x, clientY: yy }); host.querySelector(".xterm-screen").dispatchEvent(new TouchEvent(type, { touches: type === "touchend" ? [] : [t], changedTouches: [t], bubbles: true, cancelable: true })); };
    mk("touchstart", y); for (let i = 1; i <= 8; i++) mk("touchmove", y + dy * i / 8); mk("touchend", y + dy);
  }, [dy]);
  await swipe(120); await page.waitForTimeout(400);
  const y1 = await page.evaluate(async () => (await import("/js/ui/terminal.js")).get().xt.buffer.active.viewportY);
  ok(y1 < y0 - 3, `dragging down scrolls the terminal back (${y0} → ${y1})`);
  await swipe(-80); await page.waitForTimeout(400);
  const y2 = await page.evaluate(async () => (await import("/js/ui/terminal.js")).get().xt.buffer.active.viewportY);
  ok(y2 > y1, `dragging up scrolls forward again (${y1} → ${y2})`);
  // full-screen program: scroll is sent to the program
  const sent = await page.evaluate(async () => { const T = await import("/js/ui/terminal.js"); const t = T.get(); const { N } = await import("/js/core/bridge.js"); window.__w = []; const orig = N.term.writeStr; N.term.writeStr = (id, d) => { window.__w.push(d); return orig(id, d); }; await new Promise((r) => t.xt.write("\x1b[?1049h", r)); return true; });
  await swipe(90); await page.waitForTimeout(300);
  ok(await page.evaluate(() => window.__w.join("").includes("\x1b[A") || window.__w.join("").includes("\x1bOA")), "in a full-screen program the drag is sent as arrow keys");
  await page.evaluate(async () => { const t = (await import("/js/ui/terminal.js")).get(); await new Promise((r) => t.xt.write("\x1b[?1049l", r)); (await import("/js/ui/panel.js")).hide(); });

  // ---- AI tabs
  await page.click("#btn-ai"); await page.waitForSelector("#view-ai .ai-tabs .ai-tab");
  const tabs = await page.locator("#view-ai .ai-tab").allTextContents();
  ok(JSON.stringify(tabs) === JSON.stringify(["Chat", "Claude Code", "Codex", "Gemini", "Copilot"]), "AI side bar tabs: " + tabs.join(" | "));
  await page.click('#view-ai .ai-tab[data-tab="claude"]');
  await page.waitForFunction(() => document.querySelector("#view-ai .ai-cli-term .xterm") || document.querySelector("#view-ai .ai-cli-note"), null, { timeout: 15000 });
  const mode = await page.evaluate(() => (document.querySelector("#view-ai .ai-cli-term .xterm") ? "terminal" : document.querySelector("#view-ai .ai-cli-note").textContent));
  ok(mode === "terminal" || /Linux/.test(mode), "Claude Code tab starts a terminal in the side bar (or offers Linux setup): " + mode.slice(0, 60));
  ok(await page.evaluate(() => document.querySelector("#view-ai .ai-chat").classList.contains("hidden")), "chat is hidden while a CLI tab is shown");
  if (mode === "terminal") ok(await page.evaluate(async () => { const T = await import("/js/ui/terminal.js"); return T.list().some((t) => t.embedded) && !document.querySelector(".term-tabs .term-tab:nth-child(2)"); }), "the CLI terminal is not mixed into the bottom panel's tabs");
  await page.click('#view-ai .ai-tab[data-tab="chat"]'); ok(await page.evaluate(() => !document.querySelector("#view-ai .ai-chat").classList.contains("hidden")), "back to Chat");
  await page.click("#btn-ai");

  // ---- About
  await page.evaluate(() => { import("/js/ui/commands.js").then((m) => m.run("help.about")); }); await page.waitForSelector(".about-page");
  const about = await page.locator(".about-page").textContent();
  ok(/Visual Studio Code/.test(about) && /Termux/.test(about) && /Acode/.test(about) && /not made by, affiliated with or endorsed by Microsoft/.test(about), "About page with credits and the independence note");

  // ---- --host
  fs.writeFileSync("/tmp/cf-dev/home/v82/package.json", JSON.stringify({ scripts: { dev: "vite" }, devDependencies: { vite: "^5" } })); fs.mkdirSync("/tmp/cf-dev/home/v82/node_modules", { recursive: true });
  const line = await page.evaluate(async () => {
    const m = await import("/js/main.js"); const T = await import("/js/ui/terminal.js"); const { settings } = await import("/js/core/settings.js"); const { N } = await import("/js/core/bridge.js");
    N.env.status = async () => ({ installed: true }); settings.set("run.exposeHost", true);
    let got = ""; const orig = N.term.writeStr; N.term.writeStr = (id, d) => { if (/npm run/.test(d)) got = d; return orig(id, d); };
    const run = await m.api.feat("run"); await run.runScript("dev", { host: true }).catch((e) => (got = "ERR " + e.message)); await new Promise((r) => setTimeout(r, 1500)); return got;
  });
  ok(/npm run dev -- --host/.test(line), "dev server started with “-- --host”: " + JSON.stringify(line));
  ok(!logs.some((l) => /pageerror/.test(l)), "no page errors " + logs.filter((l) => /pageerror/.test(l)).join(" | "));
  await browser.close();
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED"); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
