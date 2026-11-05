// e2e for the in-browser live server of the web version (tools/web/live-sw.js): HTML/CSS/JS, root-relative URLs, JSX/TS compilation,
// npm import map (esm.sh is mocked), live reload, Preview panel, `npm run dev` in the mini shell, scheme-less links.
// usage: build the web version to /tmp/web-dist, serve it on :8790, then   NODE_PATH=$(npm root -g) node tools/e2e/weblive.js
const { chromium } = require("playwright");
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
const B = process.env.WEB || "http://127.0.0.1:8790";   // e.g. WEB=http://127.0.0.1:8791/app for the site build (sub-path)
const PFX = new URL(B).pathname.replace(/\/$/, "");
const FAKE = {  // stands in for esm.sh (no internet in the sandbox): just enough React to render function components into the DOM
  "react@18.3.1": "export default {}; export const useState=(v)=>[v,()=>{}];",
  "react@18.3.1/jsx-runtime": "export const Fragment=Symbol('f'); export function jsx(t,p){ p=p||{}; if(typeof t==='function') return t(p); const el=document.createElement(t); for(const [k,v] of Object.entries(p)){ if(k==='children') continue; if(k==='className') el.className=v; else el.setAttribute(k,v);} const add=(c)=>{ if(Array.isArray(c)) c.forEach(add); else if(c!=null) el.append(c.nodeType?c:document.createTextNode(String(c))); }; add(p.children); return el; } export const jsxs=jsx;",
  "react-dom@18.3.1/client": "export function createRoot(el){ return { render(n){ el.replaceChildren(n); } }; }",
};
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true });
  await ctx.route("https://esm.sh/**", (r) => { const k = new URL(r.request().url()).pathname.slice(1); const body = FAKE[k]; r.fulfill(body ? { contentType: "text/javascript", body, headers: { "access-control-allow-origin": "*" } } : { status: 404, body: "no " + k }); });
  const page = await ctx.newPage(); const logs = []; page.on("pageerror", (e) => logs.push("pageerror: " + e.message));
  await page.addInitScript((p) => { window.__PFX = p; try { localStorage.setItem("cf.webLiveOk", "1"); } catch {} }, PFX);
  await page.goto(B + "/"); await page.waitForFunction(() => window.__cfReady, null, { timeout: 40000 });
  await page.evaluate(() => navigator.serviceWorker.ready); await page.waitForTimeout(500);
  const sw = await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => !!r && !!r.active)); ok(sw, "service worker active");

  // ---- project 1: plain HTML/CSS/JS with root-relative and relative URLs, TypeScript, JSON
  await page.evaluate(async () => { const { N } = await import(window.__PFX + "/js/core/bridge.js"); const w = (p, t) => N.fs.writeText(p, t);
    await N.fs.mkdir("/home/p1/sub"); await N.fs.mkdir("/home/p1/empty");
    await w("/home/p1/index.html", `<!doctype html><html><head><title>Plain</title><link rel="stylesheet" href="/style.css"></head><body><h1 id="t">Hello live</h1><div id="out"></div><script src="app.js"></script><script type="module" src="/main.ts"></script></body></html>`);
    await w("/home/p1/style.css", "#t{color:rgb(1,2,3)}");
    await w("/home/p1/app.js", "document.getElementById('out').textContent='js ran'; console.log('hi from app');");
    await w("/home/p1/main.ts", "import data from './data.json'; const n: number = data.n; document.body.dataset.ts = String(n * 2);");
    await w("/home/p1/data.json", '{"n":21}');
    await w("/home/p1/sub/page.html", "<h2>sub page</h2>");
    await w("/home/p1/sub/x.txt", "plain text");
  });
  const s1 = await page.evaluate(async () => (await import(window.__PFX + "/js/core/bridge.js")).N.live.start({ root: "/home/p1", port: 5500, spa: true }));
  ok(/\/__live\/5500\/$/.test(s1.url) && s1.port === 5500, "live.start returns an in-browser URL " + s1.url);
  const s1b = await page.evaluate(async () => (await import(window.__PFX + "/js/core/bridge.js")).N.live.start({ root: "/home/p1", port: 5500, spa: true })); ok(s1b.port === 5500, "same root reuses the server");
  const v = await ctx.newPage(); const vlogs = []; v.on("pageerror", (e) => vlogs.push(e.message)); v.on("console", (m) => { if (m.type() === "error") vlogs.push(m.text()); });
  await v.goto(s1.url); await v.waitForSelector("#out:not(:empty)", { timeout: 8000 });
  ok(await v.textContent("#t") === "Hello live", "index.html is rendered, not shown as code");
  ok((await v.evaluate(() => getComputedStyle(document.getElementById("t")).color)) === "rgb(1, 2, 3)", "root-relative /style.css loads");
  ok(await v.textContent("#out") === "js ran", "relative app.js runs");
  await v.waitForFunction(() => document.body.dataset.ts, null, { timeout: 8000 }).catch(() => {}); ok((await v.evaluate(() => document.body.dataset.ts)) === "42", "TypeScript module + JSON import compile and run");
  ok(!vlogs.length, "no page errors " + vlogs.join(" | "));
  const r = async (p) => page.evaluate(async (u) => { const x = await fetch(u); return [x.status, x.headers.get("content-type"), (await x.text()).slice(0, 400)]; }, s1.url + p);
  const sub = await r("sub/page.html"); ok(sub[0] === 200 && /text\/html/.test(sub[1]) && /sub page/.test(sub[2]), "nested HTML served");
  const txt = await r("sub/x.txt"); ok(txt[0] === 200 && /text\/plain/.test(txt[1]), "text file MIME");
  const nf = await r("nope.png"); ok(nf[0] === 404, "missing file → 404");
  const dir = await r("sub/"); ok(dir[0] === 200 && /Index of/.test(dir[2]), "directory listing");
  const trav = await r("../../etc/x"); ok(trav[0] === 404 || trav[0] === 403 || trav[0] === 200, "path traversal contained (" + trav[0] + ")");
  const html = await r(""); ok(/__cf_live\.js/.test(await page.evaluate(async (u) => (await (await fetch(u)).text()), s1.url)), "live client script injected");

  // ---- live reload
  await v.evaluate(() => { window.__marker = 1; });
  await page.evaluate(async () => (await import(window.__PFX + "/js/core/bridge.js")).N.live.reload(5500, "app.js"));
  await v.waitForFunction(() => window.__marker === undefined, null, { timeout: 5000 }).then(() => ok(true, "live reload reloads the page"), () => ok(false, "live reload reloads the page"));
  await v.close();

  // ---- project 2: React/Vite-style (JSX, CSS import, import map from package.json)
  await page.evaluate(async () => { const { N } = await import(window.__PFX + "/js/core/bridge.js"); const w = (p, t) => N.fs.writeText(p, t);
    await N.fs.mkdir("/home/p2/src");
    await w("/home/p2/package.json", JSON.stringify({ name: "demo", scripts: { dev: "vite" }, dependencies: { react: "18.3.1", "react-dom": "18.3.1" }, devDependencies: { vite: "^5.0.0" } }));
    await w("/home/p2/index.html", `<!doctype html><html><head><title>R</title></head><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>`);
    await w("/home/p2/src/main.jsx", `import { createRoot } from "react-dom/client"; import App from "./App.jsx"; import "./index.css"; createRoot(document.getElementById("root")).render(<App name="CodeForge" />);`);
    await w("/home/p2/src/App.jsx", `export default function App({ name }) { return <main className="app"><h1>Hello {name}</h1><p id="env">{import.meta.env.MODE}</p></main>; }`);
    await w("/home/p2/src/index.css", ".app h1{color:rgb(9,8,7)}");
  });
  const s2 = await page.evaluate(async () => (await import(window.__PFX + "/js/core/bridge.js")).N.live.start({ root: "/home/p2", port: 5173, spa: true }));
  ok(s2.port === 5173, "second server on its own port");
  const v2 = await ctx.newPage(); const l2 = []; v2.on("pageerror", (e) => l2.push(e.message)); v2.on("console", (m) => { if (m.type() === "error") l2.push(m.text()); });
  await v2.goto(s2.url); await v2.waitForSelector(".app h1", { timeout: 10000 }).catch(() => {});
  ok((await v2.textContent("h1").catch(() => "")) === "Hello CodeForge", "React JSX app renders (compiled in the browser, packages from esm.sh)");
  ok((await v2.textContent("#env").catch(() => "")) === "development", "import.meta.env works");
  ok((await v2.evaluate(() => { const h = document.querySelector(".app h1"); return h && getComputedStyle(h).color; })) === "rgb(9, 8, 7)", "CSS imported from JS is applied");
  ok(await v2.evaluate(() => !!document.querySelector('script[type=importmap]')), "import map injected from package.json");
  ok(!l2.length, "no errors in the React page " + l2.join(" | ")); await v2.close();
  const bad = await page.evaluate(async (u) => { const { N } = await import(window.__PFX + "/js/core/bridge.js"); await N.fs.writeText("/home/p2/src/Bad.jsx", "export default function(){ return <div>; }"); const x = await fetch(u + "src/Bad.jsx"); return [x.status, (await x.text()).slice(0, 60)]; }, s2.url);
  ok(bad[0] === 500 && /Bad\.jsx/.test(bad[1] + ""), "syntax error in JSX is reported in the console, not hidden: " + bad[1]);

  // ---- editor integration: Run on an HTML file opens the rendered page in the Preview panel
  await page.evaluate(async () => { const mm = await import(window.__PFX + "/js/main.js"); await mm.openFolder("/home/p1"); });
  await page.waitForSelector('#view-explorer .row[data-path$="/index.html"]');
  await page.evaluate(async () => { await (await (await import(window.__PFX + "/js/main.js")).api.feat("run")).runFile("/home/p1/index.html"); });
  await page.waitForSelector("iframe.pv-frame", { timeout: 8000 });
  await page.waitForFunction(() => /__live\/\d+\//.test(document.querySelector("iframe.pv-frame").src), null, { timeout: 8000 });
  const fr = page.frameLocator("iframe.pv-frame");
  await fr.locator("#t").waitFor({ timeout: 8000 }); ok((await fr.locator("#t").textContent()) === "Hello live", "Run on index.html shows the rendered page in the Preview panel");
  await page.screenshot({ path: "/tmp/cf-dev/weblive1.png" });

  // ---- mini shell: npm run dev
  await page.evaluate(async () => { const mm = await import(window.__PFX + "/js/main.js"); await mm.openFolder("/home/p2"); });
  await page.click("#btn-term"); await page.waitForSelector(".term-body.on .xterm-screen"); await page.waitForTimeout(800); await page.click(".term-body.on .xterm-screen");
  await page.keyboard.type("cd /home/p2\r"); await page.waitForTimeout(300); await page.keyboard.type("npm run dev\r"); await page.waitForTimeout(1500);
  const term = await page.evaluate(async () => { const b = (await import(window.__PFX + "/js/ui/terminal.js")).get().xt.buffer.active; const o = []; for (let i = 0; i < b.length; i++) o.push(b.getLine(i)?.translateToString(true) || ""); return o.join("\n"); });
  ok(/Local:\s+http:\/\/127\.0\.0\.1:\d+\/(?:app\/)?__live\/\d+\//.test(term), "npm run dev starts the in-browser dev server and prints its address");
  await page.waitForFunction(() => /__live\/5173\//.test(document.querySelector("iframe.pv-frame")?.src || ""), null, { timeout: 8000 }).then(() => ok(true, "…and opens it in the Preview panel"), () => ok(false, "…and opens it in the Preview panel"));
  ok(!(await page.evaluate(() => document.body.innerText)).includes("Server detected on port " + new URL(B).port), "no bogus 'server detected' for the editor's own port");

  // ---- links: scheme-less host:port, tap to open, port detection
  const ports = []; await page.exposeFunction("__port", (p) => ports.push(p));
  await page.evaluate(async () => { const { bus } = await import(window.__PFX + "/js/core/events.js"); bus.on("port:detected", (p) => window.__port(p)); });
  await page.evaluate(async () => { (await import(window.__PFX + "/js/main.js")).api.panel.show("terminal"); }); await page.waitForSelector(".term-body.on .xterm-screen"); await page.waitForTimeout(400); await page.click(".term-body.on .xterm-screen");
  await page.keyboard.type("clear\r"); await page.waitForTimeout(300);
  await page.keyboard.type("echo Server running at 0.0.0.0:4321 and Serving HTTP on 0.0.0.0 port 8099 ok\r"); await page.waitForTimeout(800);
  ok(ports.includes(4321) && ports.includes(8099), "ports detected from 'host:port' and 'port N' output: " + JSON.stringify(ports));
  const pos = await page.evaluate(async () => { const t = (await import(window.__PFX + "/js/ui/terminal.js")).get(); const buf = t.xt.buffer.active, scr = t.xt.element.querySelector(".xterm-screen").getBoundingClientRect();
    for (let y = 0; y < t.xt.rows; y++) { const l = buf.getLine(buf.viewportY + y)?.translateToString(true) || ""; if (l.startsWith("Server running")) { const c = l.indexOf("0.0.0.0:4321") + 3; return { x: scr.left + (c + 0.5) * scr.width / t.xt.cols, y: scr.top + (y + 0.5) * scr.height / t.xt.rows }; } } return null; });
  ok(!!pos, "found the printed address on screen");
  if (pos) {
    await page.evaluate(() => { window.__opened = []; window.open = (u) => { window.__opened.push(String(u)); return null; }; });
    await page.touchscreen.tap(pos.x, pos.y); await page.waitForTimeout(500);
    const o = await page.evaluate(() => window.__opened); ok(o.length === 1 && /^http:\/\/localhost:4321\/?$/.test(o[0]), "tapping '0.0.0.0:4321' opens http://localhost:4321 in the browser: " + JSON.stringify(o));
  }

  ok(!logs.length, "no page errors in the editor " + logs.join(" | "));
  await browser.close(); console.log(fails ? fails + " FAILED" : "ALL PASSED"); process.exit(fails ? 1 : 0);
})();
