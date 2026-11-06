// Tiny syntax highlighter for the code browser (comments, strings, numbers, keywords, calls). Readable output, not a parser.
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ---- tiny highlighter (comments, strings, numbers, keywords, calls); good enough to read, not a parser
const KW = {
  js: "import export from default const let var function return if else for while do switch case break continue new class extends async await try catch finally throw typeof instanceof in of null undefined true false this super static get set yield",
  kt: "package import class object interface fun val var if else when for while do return break continue is in as try catch finally throw null true false this super override private public internal protected open abstract data sealed companion init constructor suspend lateinit by lazy const typealias enum annotation inline",
  sh: "if then else elif fi for while do done case esac function in return export local set exit cd echo test",
  css: "", html: "", json: "true false null", md: "", gradle: "plugins android dependencies implementation plugins id val var if else true false",
};
function lang(path) { const e = path.split(".").pop().toLowerCase(); return { js: "js", mjs: "js", ts: "js", kt: "kt", kts: "gradle", java: "kt", sh: "sh", css: "css", html: "html", json: "json", md: "md", yml: "sh", gradle: "gradle", xml: "html", webmanifest: "json", properties: "sh" }[e] || "txt"; }
export function highlight(src, path) {
  const L = lang(path); const kw = new Set((KW[L] || "").split(" ")); let out = ""; let i = 0; const n = src.length;
  const span = (c, s) => `<span class="${c}">${esc(s)}</span>`;
  const lineC = L === "sh" || L === "txt" ? "#" : L === "css" || L === "json" || L === "md" || L === "html" ? "" : "//";
  while (i < n) {
    const c = src[i], two = src.substr(i, 2);
    if (lineC && src.startsWith(lineC, i) && !(lineC === "#" && i > 0 && /\S/.test(src[i - 1]) && src[i - 1] !== "\n" && src[i - 1] !== " ")) { let j = src.indexOf("\n", i); if (j < 0) j = n; out += span("t-c", src.slice(i, j)); i = j; continue; }
    if (two === "/*" && (L === "js" || L === "kt" || L === "css" || L === "gradle")) { let j = src.indexOf("*/", i + 2); j = j < 0 ? n : j + 2; out += span("t-c", src.slice(i, j)); i = j; continue; }
    if (L === "html" && src.startsWith("<!--", i)) { let j = src.indexOf("-->", i); j = j < 0 ? n : j + 3; out += span("t-c", src.slice(i, j)); i = j; continue; }
    if (c === '"' || c === "'" || (c === "`" && (L === "js"))) {
      if (L === "kt" && src.startsWith('"""', i)) { let j = src.indexOf('"""', i + 3); j = j < 0 ? n : j + 3; out += span("t-s", src.slice(i, j)); i = j; continue; }
      let j = i + 1; while (j < n && src[j] !== c && (c === "`" || src[j] !== "\n")) { if (src[j] === "\\") j++; j++; } j = Math.min(n, j + 1); out += span("t-s", src.slice(i, j)); i = j; continue;
    }
    if (/[0-9]/.test(c) && !/[\w$]/.test(src[i - 1] || " ")) { let j = i; while (j < n && /[0-9a-fA-FxX._]/.test(src[j])) j++; out += span("t-n", src.slice(i, j)); i = j; continue; }
    if (/[A-Za-z_$]/.test(c)) { let j = i; while (j < n && /[\w$]/.test(src[j])) j++; const w = src.slice(i, j); out += kw.has(w) ? span("t-k", w) : src[j] === "(" ? span("t-f", w) : esc(w); i = j; continue; }
    out += esc(c); i++;
  }
  return out;
}
