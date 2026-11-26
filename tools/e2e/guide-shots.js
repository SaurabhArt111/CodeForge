// Captures the screenshots used by the website's Guide page, in dark and light, from the dev host.
// usage: sh tools/devhost/restart.sh; NODE_PATH=$(npm root -g) node tools/e2e/guide-shots.js [outDir]
const { chromium } = require("playwright"); const fs = require("fs"); const path = require("path");
const OUT = process.argv[2] || path.join(__dirname, "../../website/public/assets/guide");
const ROOT = "/tmp/cf-dev", D = ROOT + "/home/demo";
fs.mkdirSync(OUT, { recursive: true });
const files = {
  "package.json": JSON.stringify({ name: "demo", private: true, type: "module", scripts: { dev: "vite", build: "vite build" }, dependencies: { react: "^18.3.1", "react-dom": "^18.3.1" }, devDependencies: { vite: "^5.4.0" } }, null, 2) + "\n",
  "index.html": '<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n  <title>Demo</title>\n</head>\n<body>\n  <div id="root"></div>\n  <script type="module" src="/src/main.jsx"></script>\n</body>\n</html>\n',
  "src/main.jsx": 'import { useState } from "react";\nimport { createRoot } from "react-dom/client";\nimport "./style.css";\n\nfunction Counter() {\n  const [n, setN] = useState(0);\n  return (\n    <button onClick={() => setN(n + 1)}>\n      Clicked {n} times\n    </button>\n  );\n}\n\ncreateRoot(document.getElementById("root")).render(<Counter />);\n',
  "src/style.css": "button {\n  font: 600 18px system-ui;\n  padding: 12px 20px;\n  border-radius: 10px;\n}\n",
  "README.md": "# Demo\n\nA small React + Vite app.\n",
};
const ready = (p) => p.waitForFunction(() => window.__cfReady, null, { timeout: 40000 });
const run = (p, id) => p.evaluate(async (i) => (await import("/js/ui/commands.js")).run(i), id).catch(() => {});
const cleanUi = (p) => p.evaluate(() => { document.querySelectorAll(".modal-wrap,.qp-wrap,.ctx,.ctx-back,.toast,#toasts>*").forEach((e) => e.remove()); });

async function session(theme, { mobile }) {
  require("child_process").execSync("sh " + path.join(__dirname, "../devhost/restart.sh"));   // fresh dev host: no terminals left from the last run
  await new Promise((r) => setTimeout(r, 1500));
  for (const f of ["state.json", "settings.json", "lock.json"]) fs.rmSync(ROOT + "/cf/" + f, { force: true });
  fs.writeFileSync(ROOT + "/cf/settings.json", JSON.stringify({ "ui.appearance": theme, "ai.provider": "anthropic" }));
  const browser = await chromium.launch();
  const ctx = await browser.newContext(mobile ? { viewport: { width: 400, height: 820 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, colorScheme: theme } : { viewport: { width: 1280, height: 780 }, deviceScaleFactor: 1, colorScheme: theme });
  const page = await ctx.newPage();
  await page.goto("http://127.0.0.1:8780/"); await ready(page);
  await page.waitForTimeout(600);
  return { browser, page };
}
const snap = async (page, name, theme) => { await page.waitForTimeout(500); await page.screenshot({ path: path.join(OUT, `${name}-${theme}.jpg`), type: "jpeg", quality: 74 }); console.log("shot", name, theme); };

(async () => {
  fs.rmSync(D, { recursive: true, force: true });
  for (const [f, t] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(D, f)), { recursive: true }); fs.writeFileSync(path.join(D, f), t); }
  for (const theme of ["dark", "light"]) {
    // ---- phone
    let { browser, page } = await session(theme, { mobile: true });
    await page.evaluate(async (d) => { const m = await import("/js/main.js"); await m.openFolder(d); await (await import("/js/ui/editor.js")).openFile(d + "/src/main.jsx"); }, D);
    await page.waitForTimeout(1500); await cleanUi(page);
    await snap(page, "phone-editor", theme);
    await page.click("#btn-sidebar"); await page.waitForTimeout(600);
    await snap(page, "phone-menu", theme); await cleanUi(page);
    await run(page, "storage.open"); await page.waitForTimeout(1500);
    await snap(page, "phone-storage", theme); await cleanUi(page);
    // Terminal mode
    await run(page, "app.terminalMode"); await page.waitForTimeout(800);
    await snap(page, "phone-term-welcome", theme);
    await page.click('#termmode .tm-card button:has-text("Android shell")').catch(() => {});
    await page.waitForSelector("#termmode .term-body.on .xterm", { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(800);
    await page.evaluate(async (d) => { const t = await import("/js/ui/terminal.js"); await t.write(`cd ${d}; export PS1='\\[\\e[1;32m\\]~/demo\\[\\e[0m\\] $ '; clear\r`); }, D);
    await page.waitForTimeout(700);
    for (const c of ["ls -la", "git --version", "python3 --version", "uname -m"]) {
      await page.evaluate(async (l) => { const t = await import("/js/ui/terminal.js"); await t.write(l + "\r"); }, c); await page.waitForTimeout(500);
    }
    await page.evaluate(async () => { const t = await import("/js/ui/terminal.js"); t.get()?.xt.blur(); document.activeElement?.blur?.(); });
    await snap(page, "phone-term", theme);
    await page.click('#termmode .tm-head button[aria-label="Sessions"]'); await page.waitForTimeout(800);
    await snap(page, "phone-term-drawer", theme);
    await page.click(".tm-backdrop").catch(() => {}); await page.waitForTimeout(300);
    // Linux system picker with Ubuntu installed (simulated by the dev host)
    await page.evaluate(async () => { const { N } = await import("/js/core/bridge.js"); await N.env.install("", "ubuntu"); });
    page.evaluate(async () => (await import("/js/features/env.js")).distroPicker()).catch(() => {});
    await page.waitForSelector(".distro-modal .distro"); await page.waitForTimeout(300);
    await snap(page, "phone-distros", theme); await cleanUi(page);
    await page.evaluate(async () => { const { N } = await import("/js/core/bridge.js"); await N.env.reset("ubuntu"); });
    await page.click("#termmode .tm-ide").catch(() => {});
    await browser.close();

    // ---- desktop
    ({ browser, page } = await session(theme, { mobile: false }));
    await page.evaluate(async (d) => { const m = await import("/js/main.js"); await m.openFolder(d); await (await import("/js/ui/editor.js")).openFile(d + "/src/main.jsx"); }, D);
    await page.waitForTimeout(1200);
    await run(page, "term.new"); await page.waitForTimeout(1200);
    await page.evaluate(async (d) => { const t = await import("/js/ui/terminal.js"); await t.write(`cd ${d}; export PS1='~/demo $ '; clear; ls\r`); }, D);
    await page.waitForTimeout(900); await cleanUi(page);
    await snap(page, "desktop-ide", theme);
    page.evaluate(async () => (await import("/js/ui/commands.js")).run("view.appearance")).catch(() => {});
    await page.waitForSelector(".qp-wrap"); await page.waitForTimeout(300);
    await snap(page, "desktop-appearance", theme); await cleanUi(page);
    await browser.close();
  }
  console.log("done →", OUT);
})().catch((e) => { console.error(e); process.exit(2); });
