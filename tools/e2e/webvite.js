// e2e: Vite-style projects in the web version's in-browser dev server (extension-less imports, "@/" alias, CSS modules, ?raw, .env, devDependencies, clear errors for .vue/.scss).
// usage: sh tools/web/build.sh /tmp/web-dist; serve it on :8790; NODE_PATH=$(npm root -g) node tools/e2e/webvite.js
const { chromium } = require("playwright");
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
const B = process.env.WEB || "http://127.0.0.1:8790"; const PFX = new URL(B).pathname.replace(/\/$/, "");
const FAKE = {
  "react@18.3.1": "export default {}; export const useState=(v)=>[v,()=>{}];",
  "react@18.3.1/jsx-runtime": "export const Fragment=Symbol('f'); export function jsx(t,p){ p=p||{}; if(typeof t==='function') return t(p); const el=document.createElement(t); for(const [k,v] of Object.entries(p)){ if(k==='children') continue; if(k==='className') el.className=v; else el.setAttribute(k,v);} const c=p.children; (Array.isArray(c)?c:[c]).forEach(x=>{ if(x==null) return; el.append(x.nodeType?x:String(x)); }); return el; } export const jsxs=jsx;",
  "react@18.3.1/jsx-dev-runtime": "export * from 'https://esm.sh/react@18.3.1/jsx-runtime';",
  "react-dom@18.3.1/client": "export function createRoot(el){ return { render(n){ el.replaceChildren(n); } }; }",
  "dayjs@1.11.0": "export default function dayjs(){ return { format:()=>'2020-01-01' }; }",
};
(async () => {
  const browser = await chromium.launch(); const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.route("https://esm.sh/**", (r) => { const k = decodeURIComponent(new URL(r.request().url()).pathname.slice(1)).replace(/@\^/g, "@"); const body = FAKE[k]; r.fulfill(body ? { contentType: "text/javascript", body, headers: { "access-control-allow-origin": "*" } } : { status: 404, body: "no " + k }); });
  const page = await ctx.newPage(); const logs = []; page.on("pageerror", (e) => logs.push("pageerror: " + e.message));
  await page.addInitScript((p) => { window.__PFX = p; try { localStorage.setItem("cf.webLiveOk", "1"); } catch {} }, PFX);
  await page.goto(B + "/"); await page.waitForFunction(() => window.__cfReady, null, { timeout: 40000 }); await page.evaluate(() => navigator.serviceWorker.ready); await page.waitForTimeout(500);
  await page.evaluate(async () => {
    const { N } = await import(window.__PFX + "/js/core/bridge.js"); const w = (p, t) => N.fs.writeText(p, t);
    for (const d of ["/home/v1/src/components/Card", "/home/v1/src/lib"]) await N.fs.mkdir(d);
    await w("/home/v1/package.json", JSON.stringify({ name: "v1", dependencies: { react: "^18.3.1", "react-dom": "^18.3.1" }, devDependencies: { vite: "^5.0.0", typescript: "^5.0.0", "@types/react": "^18", dayjs: "1.11.0" } }));
    await w("/home/v1/tsconfig.json", `{ // comment\n "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["./src/*"], "~lib/*": ["./src/lib/*"] }, }, /* block */ }`);
    await w("/home/v1/.env", "VITE_GREETING=\"hello env\"\nSECRET=nope\n");
    await w("/home/v1/index.html", `<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>`);
    await w("/home/v1/src/main.tsx", `import { createRoot } from "react-dom/client";\nimport App from "./App";\nimport "./index.css";\nimport dayjs from "dayjs";\nimport raw from "./note.txt?raw";\nimport { helper } from "~lib/helper";\ncreateRoot(document.getElementById("root")!).render(<App />);\ndocument.body.dataset.day = dayjs().format();\ndocument.body.dataset.raw = raw.trim();\ndocument.body.dataset.env = import.meta.env.VITE_GREETING + "|" + String(import.meta.env.SECRET) + "|" + import.meta.env.MODE;\ndocument.body.dataset.helper = helper();`);
    await w("/home/v1/src/App.tsx", `import Card from "@/components/Card";\nimport styles from "./app.module.css";\nexport default function App(){ return <main className={styles.box}><Card title="Hi" /></main>; }`);
    await w("/home/v1/src/components/Card/index.tsx", `export default function Card({ title }: { title: string }){ return <h1 id="card">{title}</h1>; }`);
    await w("/home/v1/src/app.module.css", `.box { color: rgb(9, 8, 7); }\n.box:hover { opacity: .5; }\n.bg { background: url(img.png); }`);
    await w("/home/v1/src/index.css", `body { margin: 0; }`);
    await w("/home/v1/src/note.txt", "raw text\n");
    await w("/home/v1/src/lib/helper.ts", `export const helper = () => "helped";`);
    await w("/home/v1/src/Thing.vue", `<template><div/></template>`); await w("/home/v1/src/s.scss", `$a: 1;`);
  });
  const s = await page.evaluate(async () => (await import(window.__PFX + "/js/core/bridge.js")).N.live.start({ root: "/home/v1", port: 5600, spa: true }));
  const v = await ctx.newPage(); const vl = []; v.on("pageerror", (e) => vl.push(e.message)); v.on("response", (r) => { if (r.status() >= 400) vl.push(r.status() + " " + r.url()); }); v.on("console", (m) => { if (m.type() === "error") vl.push(m.text()); });
  await v.goto(s.url); await v.waitForSelector("#card", { timeout: 10000 }).catch(() => {});
  console.log("LOGS", JSON.stringify(vl)); ok(await v.$("#card") !== null, "extension-less ./App, directory import @/components/Card (alias from tsconfig) render the app");
  ok((await v.evaluate(() => document.body.dataset.helper)) === "helped", "tsconfig path alias ~lib/* resolves (JSONC with comments + trailing commas)");
  ok((await v.evaluate(() => document.body.dataset.raw)) === "raw text", "?raw import returns the file text");
  ok((await v.evaluate(() => document.body.dataset.day)) === "2020-01-01", "runtime package listed in devDependencies is loaded (dayjs)");
  const env = await v.evaluate(() => document.body.dataset.env); ok(env === "hello env|undefined|development", "VITE_ variables from .env (and only those): " + env);
  const cls = await v.evaluate(() => document.querySelector("main")?.className || ""); ok(/^box_/.test(cls), "CSS module class is scoped: " + cls);
  ok((await v.evaluate(() => getComputedStyle(document.querySelector("main")).color)) === "rgb(9, 8, 7)", "CSS module styles apply");
  const css = await v.evaluate(() => [...document.querySelectorAll("style")].map((x) => x.textContent).join("\n")); ok(/url\(img\.png\)/.test(css) && !/png_/.test(css), "url(...) in CSS modules is left alone");
  const err = async (f) => page.evaluate(async (u) => { const x = await fetch(u, { cache: "no-store" }); return [x.status, await x.text()]; }, s.url + f);
  const vue = await v.evaluate(async (u) => { try { await import(u); return "loaded"; } catch (e) { return String(e.message); } }, s.url + "src/Thing.vue");
  ok(/cannot compile \.vue/.test(vue), "importing a .vue file explains why it cannot run: " + vue.slice(0, 80));
  const scss = await v.evaluate(async (u) => { try { await import(u); return "loaded"; } catch (e) { return String(e.message); } }, s.url + "src/s.scss");
  ok(/Sass is not available/.test(scss), "importing .scss explains why it cannot run");
  ok(!vl.filter((x) => !/Thing\.vue|s\.scss|cannot compile|Sass/.test(x)).length, "no unexpected page errors " + vl.slice(0, 3).join(" | "));
  await browser.close(); console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED"); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
