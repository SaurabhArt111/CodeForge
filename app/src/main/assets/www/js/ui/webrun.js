// Web version: when a folder that looks like a Node / Vite / React (or plain HTML) project is opened, offer to run it in the browser.
// The in-browser dev server (tools/web/live-sw.js) compiles JSX / TypeScript and loads npm packages from esm.sh, so many front-end projects run as they are.
// Server-side projects (Express, Next.js, …) cannot run in a browser: for those the offer explains what to use instead.
import { N } from "../core/bridge.js";
import { settings } from "../core/settings.js";
import { h, icon } from "../core/util.js";
import { modal, toast } from "../core/ui.js";
import { P } from "../core/util.js";
import { ws } from "./workspace.js";

let serve = null;
const asked = new Set();                      // roots already offered in this session
const KEY = (root) => "cf.webrun.never:" + root;

export function init({ serveDir }) {
  serve = serveDir;
  ws.on("root", (root) => { if (root) setTimeout(() => offer(root).catch(() => {}), 900); });
}

const read = async (p) => { try { return (await N.fs.readText(p)).text || ""; } catch { return null; } };
const exists = async (p) => { try { return !!(await N.fs.exists(p)); } catch { return false; } };

/** What kind of project is this? Returns null when it is not a project we can say anything useful about. */
export async function detect(root) {
  const pkgText = await read(P.join(root, "package.json"));
  const hasIndex = await exists(P.join(root, "index.html"));
  let pkg = null; try { pkg = pkgText ? JSON.parse(pkgText) : null; } catch { /* broken package.json */ }
  if (!pkg && !hasIndex) return null;
  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
  const has = (...n) => n.some((x) => x in deps);
  const scripts = JSON.stringify(pkg?.scripts || {});
  const tags = []; let level = "ok", why = "";
  const bad = (msg) => { level = "no"; why = why || msg; };
  const part = (msg) => { if (level === "ok") { level = "partial"; why = msg; } };
  if (has("vite") || /\bvite\b/.test(scripts)) tags.push("Vite");
  if (has("react", "react-dom")) tags.push("React");
  if (has("preact")) tags.push("Preact");
  if (has("solid-js")) tags.push("Solid");
  if (has("typescript") || (await exists(P.join(root, "tsconfig.json")))) tags.push("TypeScript");
  if (has("vue")) { tags.push("Vue"); part("Vue single-file components (.vue) cannot be compiled in the browser, so only plain-JavaScript Vue code will run."); }
  if (has("svelte")) { tags.push("Svelte"); part("Svelte components cannot be compiled in the browser."); }
  if (has("sass", "sass-embedded", "node-sass", "less", "stylus")) part("Sass / Less / Stylus styles are not compiled in the browser; use plain CSS to preview them.");
  if (has("next")) { tags.push("Next.js"); bad("Next.js needs a Node.js server."); }
  if (has("nuxt")) { tags.push("Nuxt"); bad("Nuxt needs a Node.js server."); }
  if (has("astro")) { tags.push("Astro"); bad("Astro needs its build tool, which does not run in the browser."); }
  if (has("@angular/core")) { tags.push("Angular"); bad("Angular needs its build tool, which does not run in the browser."); }
  if (has("react-scripts")) { tags.push("Create React App"); if (!hasIndex) bad("This Create React App keeps index.html in public/, which the browser preview does not use."); }
  const server = ["express", "fastify", "koa", "@nestjs/core", "hapi", "@hapi/hapi", "socket.io", "mongoose", "prisma", "@prisma/client", "pg", "mysql2", "sqlite3", "better-sqlite3"].filter((x) => x in deps);
  if (server.length && !tags.some((t) => ["Vite", "React", "Preact", "Solid"].includes(t))) { tags.push("Node server"); bad(`This looks like a back-end project (${server.slice(0, 2).join(", ")}). A browser cannot run a Node.js server.`); }
  if (!hasIndex && level !== "no") { if (pkg) bad("There is no index.html in the project folder, so there is nothing for the browser to open."); }
  const nodeish = !!pkg;
  if (!tags.length) tags.push(nodeish ? "Node.js" : "Static site");
  const label = tags.filter((t) => t !== "TypeScript" || tags.length === 1).slice(0, 3).join(" + ") + (tags.includes("TypeScript") && tags.length > 1 ? " (TypeScript)" : "");
  return { label, level, why, name: pkg?.name || P.base(root), hasIndex, nodeish };
}

export async function offer(root, { force = false } = {}) {
  if (N.mode() !== "web" || !root) return;
  if (!force) {
    if (settings.get("web.offerRun") === false || asked.has(root)) return;
    try { if (localStorage.getItem(KEY(root)) === "1") return; } catch { /* ignore */ }
  }
  asked.add(root);
  if (ws.root !== root) return;
  const d = await detect(root); if (!d || ws.root !== root) return;
  const body = h("div.webrun",
    h("div.webrun-head", h("span.webrun-ico", icon(d.level === "no" ? "warning" : "play-circle")), h("div", h("div.webrun-title", `${d.label} project detected`), h("div.muted", d.name))),
    d.level === "ok" ? h("p", "Run it in the browser now? CodeForge compiles JSX and TypeScript on the fly and loads your npm packages from the internet, then opens a live preview.")
      : d.level === "partial" ? h("p", "You can try to run it in the browser, but part of it may not work.") : h("p", "This project cannot run in the browser."),
    d.why ? h("p.webrun-why." + d.level, d.why) : null,
    d.level === "no" ? h("p.muted", "Use the CodeForge Android app (it has a real Linux terminal with Node.js and npm) to run this project.") : h("p.muted", "The preview runs this project's scripts on the same site as the editor. Only run projects you trust."));
  const buttons = d.level === "no"
    ? [{ label: "Don't tell me again", value: "never" }, { label: "OK", primary: true, value: false }]
    : [{ label: "Don't ask again", value: "never" }, { label: "Not now", value: false }, { label: d.level === "partial" ? "Try it" : "Run in browser", primary: true, value: true }];
  const r = await modal({ title: d.level === "no" ? "Cannot run in the browser" : "Run this project?", body, buttons, width: 480 });
  if (r === "never") { try { localStorage.setItem(KEY(root), "1"); } catch { /* ignore */ } toast("OK. Run it any time with Run → Open with Live Server.", { timeout: 4000 }); return; }
  if (r === true) await serve(root);
}
