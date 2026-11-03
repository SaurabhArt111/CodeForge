#!/usr/bin/env node
// Re-creates app/src/main/assets/www/vendor from npm packages, a VS Code checkout and Termux:Styling.
//   node tools/vendor.mjs --npm <dir with node_modules> --vscode <vscode checkout> --termux-styling <termux-styling-master>
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith("--") ? [...a, [v.slice(2), arr[i + 1]]] : a), []));
const NPM = path.resolve(args.npm || "./node_modules/..");
const VSC = path.resolve(args.vscode || "../vscode");
const TS = path.resolve(args["termux-styling"] || "../termux-styling");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WWW = path.join(ROOT, "app/src/main/assets/www");
const V = path.join(WWW, "vendor");
const NM = path.join(NPM, "node_modules");

const cp = (from, to) => { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.cpSync(from, to, { recursive: true }); };
const rm = (p) => fs.rmSync(p, { recursive: true, force: true });
const writeJson = (p, o) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(o)); };
const readJsonc = (p) => JSON.parse(fs.readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\/|(^|[^:"'\\])\/\/.*$/gm, "$1").replace(/,(\s*[}\]])/g, "$1"));

rm(V);
// ---- Monaco (VS Code's editor) ----
cp(path.join(NM, "monaco-editor/min/vs"), path.join(V, "monaco/vs"));
cp(path.join(NM, "monaco-editor/LICENSE"), path.join(V, "monaco/LICENSE"));
// ---- xterm ----
for (const [pkg, file] of [["@xterm/xterm", "lib/xterm.js"], ["@xterm/addon-fit", "lib/addon-fit.js"], ["@xterm/addon-web-links", "lib/addon-web-links.js"], ["@xterm/addon-search", "lib/addon-search.js"], ["@xterm/addon-unicode11", "lib/addon-unicode11.js"]])
  cp(path.join(NM, pkg, file), path.join(V, "xterm", path.basename(file)));
cp(path.join(NM, "@xterm/xterm/css/xterm.css"), path.join(V, "xterm/xterm.css"));
// ---- misc libs ----
cp(path.join(NM, "isomorphic-git/index.umd.min.js"), path.join(V, "isomorphic-git/isomorphic-git.min.js"));
cp(path.join(NM, "isomorphic-git/LICENSE.md"), path.join(V, "isomorphic-git/LICENSE.md"));
// Buffer polyfill (isomorphic-git expects a global Buffer in browsers): tiny CommonJS bundle of `buffer` + deps.
{
  const rd = (m) => fs.readFileSync(path.join(NM, m, "index.js"), "utf8");
  const bundle = `/* buffer (MIT, Feross Aboukhadijeh) + base64-js (MIT) + ieee754 (BSD-3) bundled for CodeForge */
(function(){var defs={"base64-js":function(module,exports,require){${rd("base64-js")}\n},"ieee754":function(module,exports,require){${rd("ieee754")}\n},"buffer":function(module,exports,require){${rd("buffer")}\n}};var cache={};function req(n){if(cache[n])return cache[n].exports;var m=cache[n]={exports:{}};defs[n](m,m.exports,req);return m.exports;}window.Buffer=req("buffer").Buffer;if(!window.global)window.global=window;if(!window.process)window.process={env:{},browser:true,nextTick:function(f){var a=[].slice.call(arguments,1);Promise.resolve().then(function(){f.apply(null,a);});},version:"",versions:{},cwd:function(){return"/";}};})();\n`;
  fs.mkdirSync(path.join(V, "buffer"), { recursive: true });
  fs.writeFileSync(path.join(V, "buffer/buffer.js"), bundle);
  fs.copyFileSync(path.join(NM, "buffer/LICENSE"), path.join(V, "buffer/LICENSE"));
}
cp(path.join(NM, "jszip/dist/jszip.min.js"), path.join(V, "jszip/jszip.min.js"));
cp(path.join(NM, "marked/lib/marked.umd.js"), path.join(V, "marked/marked.umd.js"));
cp(path.join(NM, "emmet/dist/emmet.es.js"), path.join(V, "emmet/emmet.es.js"));
cp(path.join(NM, "@vscode/codicons/dist/codicon.css"), path.join(V, "codicons/codicon.css"));
cp(path.join(NM, "@vscode/codicons/dist/codicon.ttf"), path.join(V, "codicons/codicon.ttf"));
cp(path.join(NM, "prettier/standalone.js"), path.join(V, "prettier/standalone.js"));
for (const p of ["babel", "estree", "html", "postcss", "markdown", "typescript", "yaml", "graphql"])
  cp(path.join(NM, "prettier/plugins", p + ".js"), path.join(V, "prettier/plugins", p + ".js"));
cp(path.join(NM, "prettier/LICENSE"), path.join(V, "prettier/LICENSE"));

// ---- VS Code: built-in color themes ----
const themeOut = path.join(WWW, "assets/vscode/themes");
const themeIndex = [];
for (const ext of fs.readdirSync(path.join(VSC, "extensions")).filter((d) => d.startsWith("theme-") && d !== "theme-seti" && d !== "theme-modern-icons")) {
  const pj = path.join(VSC, "extensions", ext, "package.json");
  if (!fs.existsSync(pj)) continue;
  const nlsPath = path.join(VSC, "extensions", ext, "package.nls.json");
  const nls = fs.existsSync(nlsPath) ? JSON.parse(fs.readFileSync(nlsPath, "utf8")) : {};
  const man = JSON.parse(fs.readFileSync(pj, "utf8"));
  for (const t of man.contributes?.themes || []) {
    const src = path.join(VSC, "extensions", ext, t.path);
    if (!fs.existsSync(src)) continue;
    const label = String(t.label).replace(/^%(.+)%$/, (_, k) => (typeof nls[k] === "object" ? nls[k].message : nls[k]) || k);
    const file = path.basename(src);
    cp(src, path.join(themeOut, file));
    themeIndex.push({ id: t.id || label, label, uiTheme: t.uiTheme, file });
  }
}
// default-extension themes also include other files they reference through "include"
for (const f of fs.readdirSync(path.join(VSC, "extensions/theme-defaults/themes"))) cp(path.join(VSC, "extensions/theme-defaults/themes", f), path.join(themeOut, f));
writeJson(path.join(themeOut, "index.json"), themeIndex);

// ---- VS Code: Seti file icon theme (font based) ----
const setiOut = path.join(WWW, "assets/vscode/seti");
cp(path.join(VSC, "extensions/theme-seti/icons/seti.woff"), path.join(setiOut, "seti.woff"));
cp(path.join(VSC, "extensions/theme-seti/icons/vs-seti-icon-theme.json"), path.join(setiOut, "vs-seti-icon-theme.json"));
cp(path.join(VSC, "extensions/theme-seti/ThirdPartyNotices.txt"), path.join(setiOut, "ThirdPartyNotices.txt"));

// ---- VS Code: snippets (grouped by language id) ----
const snipOut = path.join(WWW, "assets/vscode/snippets");
const snipIndex = {};
for (const ext of fs.readdirSync(path.join(VSC, "extensions"))) {
  const pj = path.join(VSC, "extensions", ext, "package.json");
  if (!fs.existsSync(pj)) continue;
  const man = JSON.parse(fs.readFileSync(pj, "utf8"));
  for (const s of man.contributes?.snippets || []) {
    const src = path.join(VSC, "extensions", ext, s.path);
    if (!fs.existsSync(src)) continue;
    const dest = `${ext}-${path.basename(src)}`;
    try { writeJson(path.join(snipOut, dest), readJsonc(src)); } catch { continue; }
    (snipIndex[s.language] ||= []).push(dest);
  }
}
writeJson(path.join(snipOut, "index.json"), snipIndex);

// ---- VS Code: language configuration files (brackets/comments/indent rules) ----
const langOut = path.join(WWW, "assets/vscode/languages");
const langIndex = {};
for (const ext of fs.readdirSync(path.join(VSC, "extensions"))) {
  const pj = path.join(VSC, "extensions", ext, "package.json");
  if (!fs.existsSync(pj)) continue;
  const man = JSON.parse(fs.readFileSync(pj, "utf8"));
  for (const l of man.contributes?.languages || []) {
    if (!l.configuration) continue;
    const src = path.join(VSC, "extensions", ext, l.configuration);
    if (!fs.existsSync(src)) continue;
    try { writeJson(path.join(langOut, `${l.id}.json`), readJsonc(src)); langIndex[l.id] = { extensions: l.extensions || [], filenames: l.filenames || [], aliases: l.aliases || [] }; } catch { /* skip */ }
  }
}
writeJson(path.join(langOut, "index.json"), langIndex);

// ---- Licences ----
cp(path.join(VSC, "LICENSE.txt"), path.join(WWW, "assets/vscode/LICENSE.txt"));
cp(path.join(VSC, "ThirdPartyNotices.txt"), path.join(ROOT, "docs/VSCODE_ThirdPartyNotices.txt"));
writeJson(path.join(WWW, "assets/vscode/source.json"), { repo: "https://github.com/microsoft/vscode", version: JSON.parse(fs.readFileSync(path.join(VSC, "package.json"), "utf8")).version });

// ---- Termux:Styling: terminal colour schemes + fonts ----
const colDir = path.join(TS, "app/src/main/assets/colors");
const schemes = {};
for (const f of fs.readdirSync(colDir).filter((n) => n.endsWith(".properties"))) {
  const o = {};
  for (const line of fs.readFileSync(path.join(colDir, f), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([a-z0-9]+)\s*=\s*(#[0-9a-fA-F]{6})/);
    if (m) o[m[1]] = m[2];
  }
  if (o.background && o.foreground) {
    const name = f.replace(/\.properties$/, "").replace(/#U([0-9A-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
    schemes[name] = o;
  }
}
writeJson(path.join(WWW, "assets/terminal/schemes.json"), schemes);
const fontSrc = path.join(TS, "app/src/main/assets/fonts");
for (const f of ["JetBrains-Mono.ttf", "CascadiaCode.ttf", "Fira-Code.ttf"]) cp(path.join(fontSrc, f), path.join(WWW, "assets/fonts", f));
for (const f of ["JetBrains-Mono.txt", "Fira-Code.txt"]) if (fs.existsSync(path.join(fontSrc, f))) cp(path.join(fontSrc, f), path.join(WWW, "assets/fonts", f));
console.log("vendored:", { themes: themeIndex.length, snippetLangs: Object.keys(snipIndex).length, langConfigs: Object.keys(langIndex).length, termSchemes: Object.keys(schemes).length });
