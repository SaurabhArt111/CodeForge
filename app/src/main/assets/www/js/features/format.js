// Prettier (standalone, lazy loaded) as the formatter for JS/TS/JSON/CSS/SCSS/LESS/HTML/Markdown/YAML/GraphQL.
import { P, loadScript } from "../core/util.js";
let A, mon, loading = null, ready = false;
const PLUGINS = { babel: ["babel", "estree"], typescript: ["typescript", "estree"], json: ["babel", "estree"], json5: ["babel", "estree"], css: ["postcss"], scss: ["postcss"], less: ["postcss"], html: ["html", "postcss", "babel", "estree"], vue: ["html", "postcss", "babel", "estree"], markdown: ["markdown"], yaml: ["yaml"], graphql: ["graphql"] };
const LANG_PARSER = { javascript: "babel", typescript: "typescript", json: "json", jsonc: "json", css: "css", scss: "scss", less: "less", html: "html", markdown: "markdown", yaml: "yaml", graphql: "graphql" };

export async function init(api) {
  A = api; mon = A.ed.monaco; if (!mon) return;
  for (const lang of Object.keys(LANG_PARSER)) {
    mon.languages.registerDocumentFormattingEditProvider(lang, { displayName: "Prettier", async provideDocumentFormattingEdits(model, opts) { const text = await format(model.getValue(), lang, opts, model.uri.path); return text == null ? [] : [{ range: model.getFullModelRange(), text }]; } });
    mon.languages.registerDocumentRangeFormattingEditProvider(lang, { displayName: "Prettier", async provideDocumentRangeFormattingEdits(model, range, opts) { const text = await format(model.getValue(), lang, opts, model.uri.path, { rangeStart: model.getOffsetAt({ lineNumber: range.startLineNumber, column: range.startColumn }), rangeEnd: model.getOffsetAt({ lineNumber: range.endLineNumber, column: range.endColumn }) }); return text == null ? [] : [{ range: model.getFullModelRange(), text }]; } });
  }
  A.cmd.register({ id: "format.document", title: "Format Document (Prettier)", category: "Editor", run: () => A.ed.activeEditor()?.getAction("editor.action.formatDocument")?.run() });
}

async function boot() {
  if (ready) return; if (loading) return loading;
  loading = (async () => {
    const d = window.define; window.define = undefined; // prettier's UMD would otherwise register as an anonymous AMD module
    try {
      await loadScript("vendor/prettier/standalone.js");
      window.__prettierPlugins = {};
      for (const p of ["babel", "estree", "typescript", "postcss", "html", "markdown", "yaml", "graphql"]) await loadScript(`vendor/prettier/plugins/${p}.js`);
    } finally { window.define = d; }
    ready = true;
  })();
  return loading;
}
const plugin = (n) => (window.prettierPlugins || {})[n];

export async function format(text, lang, opts, path, extra = {}) {
  try {
    await boot(); const prettier = window.prettier; if (!prettier) throw new Error("Prettier failed to load");
    const parser = LANG_PARSER[lang]; const plugins = (PLUGINS[parser] || []).map(plugin).filter(Boolean);
    const o = { parser, plugins, tabWidth: opts?.tabSize ?? A.settings.get("editor.tabSize"), useTabs: opts ? !opts.insertSpaces : !A.settings.get("editor.insertSpaces"), printWidth: 100, singleQuote: false, ...extra };
    // honour a project .prettierrc (JSON) when present
    if (A.ws.isOpen) { for (const f of [".prettierrc", ".prettierrc.json"]) { const p = P.join(A.ws.root, f); if (await A.N.fs.exists(p)) { try { Object.assign(o, JSON.parse((await A.N.fs.readText(p)).text)); } catch { /* ignore */ } break; } } }
    return await prettier.format(text, o);
  } catch (e) { A.toast("Format failed: " + String(e.message).split("\n")[0], { kind: "error" }); return null; }
}
