// Code browser: reads tree.json (written by tools/site/gen-code.py) and shows files from src/ with a tiny syntax highlighter.
(function () {
  const $ = (s) => document.querySelector(s);
  const tree = $("#tree"), codeEl = $("#code"), empty = $("#empty");
  let data = null, current = null; const open = new Set(["app", "app/src", "app/src/main"]);
  const fmt = (n) => (n >= 1024 ? (n / 1024).toFixed(n >= 10240 ? 0 : 1) + " KB" : n + " B");

  fetch("tree.json").then((r) => r.json()).then((d) => { data = d; start(); }).catch(() => { tree.textContent = "The file list could not be loaded. Serve this folder over HTTP (opening the file directly will not work)."; });

  function start() {
    const f = data.files; const lines = f.reduce((a, x) => a + x.lines, 0);
    $("#stats").innerHTML = `<span><b>${f.length}</b>files</span><span><b>${lines.toLocaleString()}</b>lines</span>` + data.langs.slice(0, 4).map((l) => `<span><b>${Math.round(l.share * 100)}%</b>${l.name}</span>`).join("");
    $("#modules").innerHTML = data.modules.map((m) => `<div class="mod"><h3>${esc(m.title)}</h3><p>${esc(m.text)}</p>${m.files.map((p) => `<a href="#${encodeURIComponent(p)}">${esc(p.split("/").pop())}</a>`).join("")}</div>`).join("");
    $("#start").innerHTML = data.modules.slice(0, 4).flatMap((m) => m.files.slice(0, 1)).map((p) => `<li><a href="#${encodeURIComponent(p)}">${esc(p)}</a></li>`).join("");
    build(""); route();
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // ---- tree
  function nodeTree() {
    const root = { dirs: new Map(), files: [] };
    for (const f of data.files) { let n = root; const parts = f.path.split("/"); parts.slice(0, -1).forEach((p, i) => { const k = parts.slice(0, i + 1).join("/"); if (!n.dirs.has(p)) n.dirs.set(p, { path: k, dirs: new Map(), files: [] }); n = n.dirs.get(p); }); n.files.push(f); }
    return root;
  }
  function build(filter) {
    const root = nodeTree(), q = filter.trim().toLowerCase(); tree.replaceChildren();
    const match = (f) => !q || f.path.toLowerCase().includes(q);
    const hasMatch = (n) => n.files.some(match) || [...n.dirs.values()].some(hasMatch);
    (function render(n, host) {
      for (const [name, d] of [...n.dirs].sort((a, b) => a[0].localeCompare(b[0]))) {
        if (!hasMatch(d)) continue; const isOpen = q || open.has(d.path);
        const row = el("button", "row dir", `<span class="twisty">${isOpen ? "▾" : "▸"}</span>${esc(name)}`); row.setAttribute("role", "treeitem"); row.setAttribute("aria-expanded", String(!!isOpen));
        row.onclick = () => { open.has(d.path) ? open.delete(d.path) : open.add(d.path); build($("#filter").value); };
        host.append(row);
        if (isOpen) { const kids = el("div", "kids"); kids.setAttribute("role", "group"); render(d, kids); host.append(kids); }
      }
      for (const f of n.files.filter(match).sort((a, b) => a.path.localeCompare(b.path))) {
        const row = el("button", "row", `<span class="twisty"></span>${esc(f.path.split("/").pop())}<span class="size">${fmt(f.size)}</span>`); row.setAttribute("role", "treeitem"); row.dataset.path = f.path;
        row.setAttribute("aria-selected", String(f.path === current)); row.onclick = () => { location.hash = encodeURIComponent(f.path); }; host.append(row);
      }
    })(root, tree);
  }
  function el(tag, cls, html) { const e = document.createElement(tag); e.className = cls; if (html) e.innerHTML = html; if (tag === "button") e.type = "button"; return e; }
  $("#filter").addEventListener("input", (e) => build(e.target.value));

  // ---- file view
  addEventListener("hashchange", route);
  function route() {
    if (!data) return; const h = decodeURIComponent(location.hash.slice(1)); if (!h) return;
    const [path, line] = h.split(":"); const f = data.files.find((x) => x.path === path); if (!f) return;
    const parts = path.split("/"); parts.slice(0, -1).forEach((_, i) => open.add(parts.slice(0, i + 1).join("/")));
    current = path; build($("#filter").value); show(f, +line || 0);
  }
  async function show(f, line) {
    empty.hidden = true; codeEl.hidden = false; $("#crumb").textContent = f.path; const raw = $("#raw"); raw.hidden = false; raw.href = "src/" + f.path.split("/").map(encodeURIComponent).join("/");
    codeEl.textContent = "Loading…";
    let text; try { const r = await fetch(raw.href); text = await r.text(); } catch { codeEl.textContent = "Could not load this file."; return; }
    const lines = highlight(text, f.path).split("\n"); codeEl.innerHTML = lines.map((l, i) => `<span class="l" id="L${i + 1}"><span class="n">${i + 1}</span>${l}</span>`).join("");
    const b = $("#copy"); b.hidden = false; b.onclick = async () => { try { await navigator.clipboard.writeText(text); b.textContent = "Copied"; } catch { b.textContent = "Select and copy"; } setTimeout(() => (b.textContent = "Copy"), 1500); };
    codeEl.querySelectorAll(".n").forEach((n, i) => n.addEventListener("click", () => history.replaceState(null, "", "#" + encodeURIComponent(f.path) + ":" + (i + 1))));
    if (line) { const t = $("#L" + line); t?.classList.add("hl"); t?.scrollIntoView({ block: "center" }); } else codeEl.scrollTop = 0;
  }

  // ---- tiny highlighter (comments, strings, numbers, keywords, calls); good enough to read, not a parser
  const KW = {
    js: "import export from default const let var function return if else for while do switch case break continue new class extends async await try catch finally throw typeof instanceof in of null undefined true false this super static get set yield",
    kt: "package import class object interface fun val var if else when for while do return break continue is in as try catch finally throw null true false this super override private public internal protected open abstract data sealed companion init constructor suspend lateinit by lazy const typealias enum annotation inline",
    sh: "if then else elif fi for while do done case esac function in return export local set exit cd echo test",
    css: "", html: "", json: "true false null", md: "", gradle: "plugins android dependencies implementation plugins id val var if else true false",
  };
  function lang(path) { const e = path.split(".").pop().toLowerCase(); return { js: "js", mjs: "js", ts: "js", kt: "kt", kts: "gradle", java: "kt", sh: "sh", css: "css", html: "html", json: "json", md: "md", yml: "sh", gradle: "gradle", xml: "html", webmanifest: "json", properties: "sh" }[e] || "txt"; }
  function highlight(src, path) {
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
})();
