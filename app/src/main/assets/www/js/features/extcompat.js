// Extension compatibility report.
// Answers, for one installed extension: "will this work in CodeForge, and if not, why?"
//   1. static analysis of package.json (contribution points, engines, dependencies, target platform)
//   2. a light scan of the extension's entry bundle for Node built-ins / libraries the lite host does not provide
//   3. live issues collected while the extension runs (unimplemented API calls, activation errors, thrown errors)
// Levels: "works" (everything it declares is supported) · "partial" (some of it works) · "no" (nothing useful would run).
import { P } from "../core/util.js";

// contribution points CodeForge applies (kept in sync with extensions.js SUPPORTED)
export const SUPPORTED = ["themes", "iconThemes", "snippets", "languages", "commands", "configuration", "configurationDefaults", "jsonValidation", "viewsContainers", "views", "viewsWelcome"];
// Node built-ins the worker provides (see exthost.worker.js NODE_MODULES)
const NODE_OK = new Set(["path", "util", "events", "os", "assert", "url", "timers"]);
const NODE_BAD = {
  child_process: "starts external programs (child_process), which is not possible in CodeForge's sandbox",
  fs: "uses Node's `fs` module (only the vscode.workspace.fs API is available)",
  "fs/promises": "uses Node's `fs/promises` module (only the vscode.workspace.fs API is available)",
  net: "opens raw network sockets (`net`)", tls: "opens raw TLS sockets (`tls`)", http: "uses Node's `http` module", https: "uses Node's `https` module (use fetch instead)",
  crypto: "uses Node's `crypto` module", zlib: "uses `zlib`", stream: "uses Node streams", worker_threads: "uses worker_threads", cluster: "uses cluster", dgram: "uses UDP sockets", readline: "uses readline", vm: "uses the `vm` module",
};
const CONTRIB_WHY = {
  grammars: "TextMate grammars (new syntax highlighting) are not loaded; Monaco's built-in highlighting is used",
  debuggers: "debug adapters are not supported", breakpoints: "debugging is not supported", taskDefinitions: "tasks are not supported", problemMatchers: "problem matchers are not supported",
  customEditors: "custom editors are not supported", notebooks: "notebooks are not supported", walkthroughs: "walkthroughs are not shown", menus: "menu placement is ignored (commands are still in the palette)",
  keybindings: "keybindings are not applied", colors: "custom theme colors are ignored", productIconThemes: "product icon themes are not supported", submenus: "submenus are ignored", terminal: "terminal profiles are not supported",
  authentication: "sign-in providers are not supported", resourceLabelFormatters: "label formatters are ignored", semanticTokenScopes: "semantic tokens are not supported", semanticTokenTypes: "semantic tokens are not supported",
  localizations: "language packs are not supported", typescriptServerPlugins: "TypeScript server plugins are not supported", chatParticipants: "chat participants are not supported", languageModelTools: "language-model tools are not supported",
};
// pure data / no-op contribution points that do not influence "does it work"
const IGNORABLE = new Set(["menus", "keybindings", "walkthroughs", "submenus", "colors", "resourceLabelFormatters", "localizations", "problemMatchers", "taskDefinitions"]);

const issues = new Map(); // extId -> Map(key -> {level,text})
/** Record a runtime issue seen while the extension runs (shown in the report, de-duplicated). */
export function note(extId, level, text) {
  let m = issues.get(extId); if (!m) issues.set(extId, (m = new Map()));
  const key = text.replace(/\d+/g, "#").slice(0, 160); if (m.has(key)) { m.get(key).n++; return; }
  if (m.size < 40) m.set(key, { level, text, n: 1 });
}
export const runtime = (extId) => [...(issues.get(extId)?.values() || [])];
export const clearRuntime = (extId) => issues.delete(extId);

/** Rank: error > warn > info. */
const RANK = { error: 3, warn: 2, info: 1, ok: 0 };

/**
 * Static analysis. `read(path)` -> Promise<string> reads a file in the extension folder.
 * Returns { level, summary, items:[{kind:"ok"|"info"|"warn"|"error", text}], runnable }.
 */
export async function analyze(ext, read) {
  const m = ext.manifest || {}; const c = m.contributes || {}; const items = []; let blockers = 0, partial = 0;
  const add = (kind, text) => items.push({ kind, text });

  // 1. contributions
  const keys = Object.keys(c).filter((k) => !(Array.isArray(c[k]) && !c[k].length));
  const ok = keys.filter((k) => SUPPORTED.includes(k)); const bad = keys.filter((k) => !SUPPORTED.includes(k));
  if (ok.length) add("ok", `Works: ${ok.join(", ")}`);
  for (const k of bad) {
    const why = CONTRIB_WHY[k] || "not supported by CodeForge";
    add(IGNORABLE.has(k) ? "info" : "warn", `${k}: ${why}`); if (!IGNORABLE.has(k)) partial++;
  }

  // 2. entry code
  const entry = m.browser || m.main; const isWeb = !!m.browser;
  if (entry) {
    let p = P.join(ext.base, entry); if (!/\.(c|m)?js$/.test(p)) p += ".js";
    let src = ""; try { src = (await read(p)) || ""; } catch { /* entry missing */ }
    if (!src) { add("error", `The entry file "${entry}" could not be read; the extension code cannot run`); blockers++; }
    else {
      if (isWeb) add("ok", "Built as a web extension (browser entry), the best-supported kind");
      else add("info", "Has Node.js extension code: it runs in CodeForge's lite sandbox (a subset of the VS Code API, no Node.js)");
      const bads = new Map(); let nativeAddon = false;
      for (const mm of src.matchAll(/(?:require\(\s*|from\s+|import\(\s*)["'](?:node:)?([a-z_@][\w@\/\-.]*)["']/g)) {
        const n = mm[1].replace(/^node:/, ""); if (NODE_BAD[n]) bads.set(n, (bads.get(n) || 0) + 1);
      }
      if (/\.node["')]/.test(src) && /require\(/.test(src)) nativeAddon = true;
      for (const [n] of bads) { add(isWeb ? "info" : "warn", `${n}: ${NODE_BAD[n]}`); if (!isWeb) partial++; }
      if (nativeAddon) { add("error", "Loads a native Node addon (.node); native code cannot run in CodeForge"); blockers++; }
      if (/vscode-languageclient/.test(src) || /LanguageClient\b/.test(src) && /ServerOptions|TransportKind/.test(src)) { add("warn", "Starts a language server (vscode-languageclient): language servers are not supported, so IntelliSense from this extension will not appear"); partial++; }
      if (/\bvscode\.debug\.|registerDebugAdapter|DebugAdapter/.test(src)) { add("warn", "Uses the debug API, which is not supported"); partial++; }
      if (/createWebviewPanel|registerWebviewViewProvider/.test(src)) add("info", "Uses webviews: basic HTML panels are supported, complex ones may not render correctly");
      if (/registerNotebookSerializer|notebooks\.create/.test(src)) { add("warn", "Uses notebooks, which are not supported"); partial++; }
      if (/\bvscode\.tasks\.|registerTaskProvider/.test(src)) { add("warn", "Uses the tasks API, which is not supported"); partial++; }
      if (/\bvscode\.scm\.|createSourceControl/.test(src)) { add("warn", "Uses the source-control API, which is not supported"); partial++; }
      if (/\bvscode\.authentication\.|getSession\(/.test(src) && /authentication/.test(src)) { add("warn", "Signs in through VS Code's authentication API, which is not supported"); partial++; }
      if (/\bvscode\.(chat|lm)\./.test(src)) { add("warn", "Uses the chat / language-model API, which is not supported"); partial++; }
      if (src.length > 6e6) add("info", `Large bundle (${(src.length / 1e6).toFixed(1)} MB): may start slowly on a phone`);
    }
  }

  // 3. manifest-level
  const deps = m.extensionDependencies || [];
  if (deps.length) add("warn", `Needs other extensions installed first: ${deps.join(", ")}. CodeForge cannot guarantee they are present`);
  if (m.extensionPack?.length) add("info", `Extension pack: bundles ${m.extensionPack.length} other extensions (install them separately)`);
  const kinds = m.extensionKind; if (Array.isArray(kinds) && kinds.length === 1 && kinds[0] === "ui" && entry) add("info", "Declared as a UI extension");
  if (m.__metadata?.targetPlatform && !["undefined", "universal", "web"].includes(m.__metadata.targetPlatform)) { add("error", `Built for ${m.__metadata.targetPlatform} only (contains platform-specific binaries)`); blockers++; }
  if (m.engines?.vscode) add("info", `Targets VS Code ${m.engines.vscode}; CodeForge implements a subset of that API`);

  // 4. verdict
  const nothingSupported = !ok.length && !entry;
  let level = "works", summary = "Everything this extension declares is supported.";
  if (nothingSupported || (blockers && !ok.length)) { level = "no"; summary = "Nothing useful from this extension can run in CodeForge."; }
  else if (blockers || partial) { level = "partial"; summary = entry && !isWeb && partial ? "Part of this extension works. Some features need things CodeForge does not provide." : "Part of this extension works."; }
  else if (entry && !isWeb) { level = "works"; summary = "Should work. Its code runs in CodeForge's lite extension host; if something misbehaves the live issues below will say what."; }
  if (!items.length) add("info", "This extension has no contributions or code that CodeForge can apply.");
  return { level, summary, items, runnable: !!entry && !blockers };
}

/** Combine the static report with what has been observed at runtime. */
export function withRuntime(rep, ext, status, error) {
  const live = runtime(ext.id).map((x) => ({ kind: x.level === "error" ? "error" : "warn", text: x.text + (x.n > 1 ? ` (×${x.n})` : ""), live: true }));
  const items = [...rep.items];
  if (status === "denied") items.push({ kind: "warn", text: "You did not allow this extension's code to run. Open it and choose Allow to start it", live: true });
  if (status === "error" && !live.some((x) => /^Activation failed/.test(x.text))) items.push({ kind: "error", text: "Failed to start: " + (error || "unknown error"), live: true });
  items.push(...live);
  let level = rep.level;
  if (status === "error") level = rep.items.some((i) => i.kind === "ok") ? "partial" : "no";
  else if (level === "works" && live.some((x) => x.kind === "error")) level = "partial";
  return { ...rep, level, items, worst: items.reduce((a, i) => Math.max(a, RANK[i.kind] || 0), 0) };
}

export const LEVEL = {
  works: { label: "Works", icon: "pass", tone: "ok" },
  partial: { label: "Partly works", icon: "warning", tone: "warn" },
  no: { label: "Won't work", icon: "error", tone: "bad" },
};
