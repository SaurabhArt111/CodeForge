// VS Code snippets (built-in + user + extensions), VS Code language-configuration files and Emmet, wired into Monaco.
import { N } from "../core/bridge.js";
import { P, parseJsonc } from "../core/util.js";
let A, mon;
const registered = new Map(); // language -> disposable
const store = new Map();      // language -> [{source, items:[{prefix,body,description,name}]}]
const VS_TO_MONACO = { shellscript: "shell", jade: "pug", coffeescript: "coffee", dotenv: "ini", dockercompose: "yaml", jsonc: "json", javascriptreact: "javascript", typescriptreact: "typescript", "markdown-math": "markdown", restructuredtext: "restructuredtext" };
const MONACO_LANGS_FOR = (id) => (id === "javascriptreact" ? ["javascript"] : id === "typescriptreact" ? ["typescript"] : [VS_TO_MONACO[id] || id]);

export async function init(api) {
  A = api; mon = A.ed.monaco; if (!mon) return;
  await Promise.all([loadBuiltinSnippets(), loadLangConfigs()]);
  await loadUserSnippets();
  setupEmmet();
  A.cmd.register({ id: "snippets.user", title: "Configure User Snippets…", category: "Preferences", run: userSnippetsFile });
}

// ---------------------------------------------------------------- snippets
export function addSnippets(language, source, json) {
  const items = [];
  const j = typeof json === "string" ? parseJsonc(json) : json;
  for (const [name, s] of Object.entries(j || {})) {
    if (!s || !s.body) continue; const prefixes = Array.isArray(s.prefix) ? s.prefix : [s.prefix ?? name];
    const body = Array.isArray(s.body) ? s.body.join("\n") : String(s.body);
    for (const p of prefixes) items.push({ name, prefix: p, body, description: s.description || name });
  }
  const list = store.get(language) || []; list.push({ source, items }); store.set(language, list);
  ensureProvider(language);
}
export function removeSnippets(source) { for (const [l, list] of store) store.set(l, list.filter((x) => x.source !== source)); }
function ensureProvider(language) {
  for (const lang of MONACO_LANGS_FOR(language)) {
    if (registered.has(language + ":" + lang)) continue;
    registered.set(language + ":" + lang, mon.languages.registerCompletionItemProvider(lang, {
      provideCompletionItems(model, pos) {
        const w = model.getWordUntilPosition(pos); const range = new mon.Range(pos.lineNumber, w.startColumn, pos.lineNumber, w.endColumn);
        const out = [];
        for (const grp of store.get(language) || []) for (const s of grp.items) out.push({ label: s.prefix, kind: mon.languages.CompletionItemKind.Snippet, detail: s.description, documentation: { value: "```\n" + s.body.replace(/\$\{\d+:([^}]*)\}/g, "$1").replace(/\$\d+/g, "") + "\n```" }, insertText: s.body, insertTextRules: mon.languages.CompletionItemInsertTextRule.InsertAsSnippet, range, sortText: "z" + s.prefix });
        return { suggestions: out };
      },
    }));
  }
}
async function loadBuiltinSnippets() {
  try {
    const idx = await (await fetch("assets/vscode/snippets/index.json")).json();
    const files = {};
    for (const [lang, fl] of Object.entries(idx)) for (const f of fl) { files[f] ||= await (await fetch("assets/vscode/snippets/" + f)).text(); addSnippets(lang, "builtin", files[f]); }
  } catch (e) { console.warn("snippets", e); }
}
async function loadUserSnippets() {
  const dir = P.join(A.settings.dataDir, "snippets");
  try { for (const it of await A.N.fs.list(dir)) if (/\.json$/.test(it.n)) { const lang = it.n.replace(/\.json$/, ""); const r = await A.N.fs.readText(P.join(dir, it.n)); if (r.text) addSnippets(lang, "user", r.text); } } catch { /* none yet */ }
  A.bus.on("saved", async (p) => { if (P.inside(dir, p)) { removeSnippets("user"); await loadUserSnippets(); } });
}
async function userSnippetsFile() {
  const langs = A.ed.languages(); const pick = await A.quickPick(langs.map((l) => ({ label: l.label, description: l.id, value: l.id })), { placeholder: "Select language for snippets" }); if (!pick) return;
  const dir = P.join(A.settings.dataDir, "snippets"); await A.N.fs.mkdir(dir); const f = P.join(dir, pick + ".json");
  if (!(await A.N.fs.exists(f))) await A.N.fs.writeText(f, `{\n  // "Log": { "prefix": "log", "body": ["console.log('$1');"], "description": "console.log" }\n}\n`);
  A.ed.openFile(f);
}

// ---------------------------------------------------------------- language configuration (brackets, comments, indent, on-enter rules)
const re = (s) => (typeof s === "string" ? new RegExp(s) : s && s.pattern ? new RegExp(s.pattern, s.flags || "") : undefined);
function convertConfig(c) {
  const o = { comments: c.comments, brackets: c.brackets, autoClosingPairs: c.autoClosingPairs, surroundingPairs: c.surroundingPairs, colorizedBracketPairs: c.colorizedBracketPairs, autoCloseBefore: c.autoCloseBefore };
  if (c.wordPattern) o.wordPattern = re(c.wordPattern);
  if (c.indentationRules) o.indentationRules = { increaseIndentPattern: re(c.indentationRules.increaseIndentPattern), decreaseIndentPattern: re(c.indentationRules.decreaseIndentPattern), indentNextLinePattern: re(c.indentationRules.indentNextLinePattern), unIndentedLinePattern: re(c.indentationRules.unIndentedLinePattern) };
  if (c.folding?.markers) o.folding = { offSide: c.folding.offSide, markers: { start: re(c.folding.markers.start), end: re(c.folding.markers.end) } };
  if (c.onEnterRules) o.onEnterRules = c.onEnterRules.map((r) => ({ beforeText: re(r.beforeText), afterText: re(r.afterText), previousLineText: re(r.previousLineText), action: { indentAction: { none: 0, indent: 1, indentOutdent: 2, outdent: 3 }[r.action.indent] ?? 0, appendText: r.action.appendText, removeText: r.action.removeText } }));
  for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
  return o;
}
export function applyLanguageConfig(monacoLang, cfgJson) { try { mon.languages.setLanguageConfiguration(monacoLang, convertConfig(cfgJson)); } catch (e) { console.warn("langconfig", monacoLang, e); } }
async function loadLangConfigs() {
  try {
    const idx = await (await fetch("assets/vscode/languages/index.json")).json(); const known = new Set(mon.languages.getLanguages().map((l) => l.id));
    for (const [id, meta] of Object.entries(idx)) {
      const target = VS_TO_MONACO[id] || id;
      if (!known.has(target)) mon.languages.register({ id: target, extensions: meta.extensions, filenames: meta.filenames, aliases: meta.aliases });
      try { const cfg = parseJsonc(await (await fetch(`assets/vscode/languages/${id}.json`)).text()); applyLanguageConfig(target, cfg); } catch { /* optional */ }
    }
  } catch (e) { console.warn("language configs", e); }
}

// ---------------------------------------------------------------- Emmet (HTML / CSS / JSX)
let emmet = null;
async function setupEmmet() {
  const langs = { html: "markup", handlebars: "markup", php: "markup", razor: "markup", css: "stylesheet", scss: "stylesheet", less: "stylesheet", javascript: "markup-jsx", typescript: "markup-jsx" };
  for (const [lang, syntax] of Object.entries(langs)) {
    mon.languages.registerCompletionItemProvider(lang, {
      triggerCharacters: [">", "+", "*", ")", "]", "}", "."],
      async provideCompletionItems(model, pos) {
        if (!A.settings.get("editor.emmet")) return { suggestions: [] };
        const line = model.getLineContent(pos.lineNumber).slice(0, pos.column - 1);
        const m = syntax === "stylesheet" ? line.match(/([a-zA-Z][\w:!%#.-]*)$/) : line.match(/((?:[\w.#\[\]\(\)>+*^$@{}:=~"'-]|\s(?=[^<]*[>+]))+)$/);
        if (!m) return { suggestions: [] };
        let abbr = m[1].trimStart(); if (!abbr || /^\d+$/.test(abbr)) return { suggestions: [] };
        if (syntax === "markup-jsx" && !/^[.#a-zA-Z]/.test(abbr)) return { suggestions: [] };
        if (syntax === "markup-jsx") { if (!/[.#>*+]/.test(abbr) && !/^(div|span|p|ul|li|a|button|section|h[1-6]|header|footer|nav|main|form|input|img)$/.test(abbr)) return { suggestions: [] }; }
        try {
          emmet ||= await import("/vendor/emmet/emmet.es.js");
          const type = syntax === "stylesheet" ? "stylesheet" : "markup";
          const out = emmet.default ? emmet.default(abbr, { type, syntax: syntax === "markup-jsx" ? "jsx" : syntax === "stylesheet" ? "css" : "html", options: { "output.field": (i, ph) => `\${${i}${ph ? ":" + ph : ""}}`, "output.selfClosingStyle": syntax === "markup-jsx" ? "xhtml" : "html" } }) : emmet.expand(abbr, { type, syntax: syntax === "markup-jsx" ? "jsx" : syntax === "stylesheet" ? "css" : "html", options: { "output.field": (i, ph) => `\${${i}${ph ? ":" + ph : ""}}` } });
          if (!out || out === abbr) return { suggestions: [] };
          return { suggestions: [{ label: abbr, kind: mon.languages.CompletionItemKind.Snippet, detail: "Emmet abbreviation", insertText: out, insertTextRules: mon.languages.CompletionItemInsertTextRule.InsertAsSnippet, range: new mon.Range(pos.lineNumber, pos.column - abbr.length, pos.lineNumber, pos.column), sortText: "0" + abbr, preselect: true }] };
        } catch { return { suggestions: [] }; }
      },
    });
  }
}
