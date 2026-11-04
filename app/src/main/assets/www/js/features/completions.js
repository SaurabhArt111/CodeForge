// Extra completion providers: project file paths in strings (src/href/import/require/url()/@import), and
// project-wide identifiers harvested from open models + the file index for plain words in non-code languages.
import { ws } from "../ui/workspace.js";
import { P } from "../core/util.js";

const LANGS = ["html", "css", "scss", "less", "javascript", "typescript", "javascriptreact", "typescriptreact", "json", "jsonc", "markdown", "vue", "svelte", "php", "python", "shell", "yaml"];
// token ending at the cursor that looks like a relative/absolute path inside quotes or url()
const PATH_RE = /(?:["'(]|=)((?:\.{1,2}\/|\/)?(?:[\w@.\-~ ]+\/)*[\w@.\-~ ]*)$/;

export function register(monaco) {
  const K = monaco.languages.CompletionItemKind;
  monaco.languages.registerCompletionItemProvider(LANGS, {
    triggerCharacters: ["/", "'", '"', "."],
    async provideCompletionItems(model, pos) {
      if (!ws.isOpen) return { suggestions: [] };
      const line = model.getValueInRange({ startLineNumber: pos.lineNumber, startColumn: 1, endLineNumber: pos.lineNumber, endColumn: pos.column });
      const m = PATH_RE.exec(line); if (!m) return { suggestions: [] };
      const typed = m[1];
      // only treat as a path when it looks like one (starts with ./ ../ / or we are in an attribute/import context)
      const ctx = /(?:src|href|from|import|require\(|url\(|@import|action|poster|data-src|include)\s*[=(]?\s*["']?[^"']*$/i.test(line) || /^(\.{1,2}\/|\/)/.test(typed);
      if (!ctx) return { suggestions: [] };
      const here = model.uri.fsPath || model.uri.path; const baseDir = typed.startsWith("/") && !typed.startsWith(ws.root) ? ws.root : P.dir(here);
      const dirPart = typed.includes("/") ? typed.slice(0, typed.lastIndexOf("/") + 1) : "";
      const target = P.norm(typed.startsWith("/") && !typed.startsWith(ws.root) ? P.join(ws.root, dirPart) : P.join(baseDir, dirPart || "."));
      if (!P.inside(ws.root, target) && target !== ws.root) return { suggestions: [] };
      const rel = P.rel(ws.root, target);
      const files = await ws.fileIndex();
      const seen = new Map();
      for (const f of files) {
        if (rel && !f.startsWith(rel + "/")) continue;
        const rest = rel ? f.slice(rel.length + 1) : f; const seg = rest.split("/")[0]; const isDir = rest.includes("/");
        if (!seen.has(seg)) seen.set(seg, isDir);
      }
      const range = { startLineNumber: pos.lineNumber, endLineNumber: pos.lineNumber, startColumn: pos.column - (typed.length - dirPart.length), endColumn: pos.column };
      return { suggestions: [...seen].map(([name, isDir]) => ({ label: isDir ? name + "/" : name, kind: isDir ? K.Folder : K.File, insertText: isDir ? name + "/" : name, range, sortText: (isDir ? "0" : "1") + name, command: isDir ? { id: "editor.action.triggerSuggest", title: "" } : undefined })) };
    },
  });
}
