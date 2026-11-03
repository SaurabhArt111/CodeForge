// AI assistant: multi-provider chat with streaming, workspace context (@files, selection), code-apply actions and an agent mode with
// tools (read/list/search/write/edit/run).  API keys live in the native keystore (AES-GCM) and are injected into requests natively.
import { h, icon, P, uid, debounce, esc, shellQuote, fmtBytes, textDec } from "../core/util.js";
let A, view, msgsEl, inputEl, sendBtn, ctxEl, headEl, session = null, streaming = null;
const chat = { id: uid(), title: "New chat", messages: [], created: Date.now() };
const ctx = { activeFile: true, selection: true, files: [] };
let mode = "chat";

// ---------------------------------------------------------------- providers
export const PROVIDERS = {
  anthropic: { label: "Anthropic (Claude)", kind: "anthropic", base: "https://api.anthropic.com", key: "ai.anthropic", models: ["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-5-5"], help: "https://console.anthropic.com/settings/keys" },
  openai: { label: "OpenAI (ChatGPT / Codex models)", kind: "openai", base: "https://api.openai.com/v1", key: "ai.openai", models: ["gpt-4.1", "gpt-4o", "o4-mini"], help: "https://platform.openai.com/api-keys" },
  github: { label: "GitHub Models (Copilot ecosystem)", kind: "openai", base: "https://models.github.ai/inference", key: "ai.github", fallbackKey: "github.token", models: ["openai/gpt-4.1", "openai/gpt-4o", "meta/llama-3.3-70b-instruct"], catalog: "https://models.github.ai/catalog/models", help: "https://github.com/settings/personal-access-tokens (needs Models permission)" },
  gemini: { label: "Google Gemini", kind: "openai", base: "https://generativelanguage.googleapis.com/v1beta/openai", key: "ai.gemini", models: ["gemini-2.5-pro", "gemini-2.5-flash"], help: "https://aistudio.google.com/apikey" },
  openrouter: { label: "OpenRouter (any model)", kind: "openai", base: "https://openrouter.ai/api/v1", key: "ai.openrouter", models: ["anthropic/claude-sonnet-4.5", "openai/gpt-4.1", "google/gemini-2.5-pro"], help: "https://openrouter.ai/keys" },
  groq: { label: "Groq", kind: "openai", base: "https://api.groq.com/openai/v1", key: "ai.groq", models: ["llama-3.3-70b-versatile"] },
  mistral: { label: "Mistral", kind: "openai", base: "https://api.mistral.ai/v1", key: "ai.mistral", models: ["codestral-latest", "mistral-large-latest"] },
  deepseek: { label: "DeepSeek", kind: "openai", base: "https://api.deepseek.com/v1", key: "ai.deepseek", models: ["deepseek-chat", "deepseek-reasoner"] },
  xai: { label: "xAI (Grok)", kind: "openai", base: "https://api.x.ai/v1", key: "ai.xai", models: ["grok-4"] },
  ollama: { label: "Ollama (local)", kind: "openai", baseSetting: "ai.endpoint.ollama", suffix: "/v1", key: null, models: ["qwen2.5-coder", "llama3.2"], help: "http://127.0.0.1:11434" },
  custom: { label: "Custom OpenAI-compatible", kind: "openai", baseSetting: "ai.endpoint.custom", key: "ai.custom", models: [] },
};
const baseOf = (p) => (p.baseSetting ? A.settings.get(p.baseSetting).replace(/\/$/, "") + (p.suffix || "") : p.base);
const curProvider = () => PROVIDERS[A.settings.get("ai.provider")] || PROVIDERS.anthropic;
const curModel = () => A.settings.get("ai.model") || (A.settings.state.aiModels || {})[A.settings.get("ai.provider")] || curProvider().models[0] || "";

const CLIS = [
  { id: "claude", name: "Claude Code", pkg: "@anthropic-ai/claude-code", bin: "claude", note: "Anthropic's agentic coding CLI (sign in with your Claude account or API key)" },
  { id: "codex", name: "OpenAI Codex CLI", pkg: "@openai/codex", bin: "codex", note: "OpenAI's coding agent (ChatGPT sign-in or API key)" },
  { id: "copilot", name: "GitHub Copilot CLI", pkg: "@github/copilot", bin: "copilot", note: "Requires a GitHub Copilot subscription" },
  { id: "gemini", name: "Gemini CLI", pkg: "@google/gemini-cli", bin: "gemini", note: "Google's Gemini in the terminal" },
  { id: "aider", name: "Aider", pip: "aider-chat", bin: "aider", note: "AI pair programming (pip)" },
];

export async function init(api) {
  A = api; A.registerView("ai", build);
  A.bus.on("ai:selection", (kind) => selectionAction(kind));
  A.cmd.register({ id: "ai.new", title: "AI: New Chat", run: () => { A.showView("ai"); newChat(); } }); A.cmd.register({ id: "ai.focus", title: "AI: Focus Chat Input", run: () => { A.showView("ai"); inputEl?.focus(); } });
  A.cmd.register({ id: "ai.key", title: "AI: Set API Key…", run: () => setKey() }); A.cmd.register({ id: "ai.provider", title: "AI: Select Provider / Model…", run: pickProvider });
  A.cmd.register({ id: "ai.cli", title: "AI: Open Coding CLI (Claude Code, Codex, Copilot…)", run: cliMenu });
  A.cmd.register({ id: "ai.agent", title: "AI: Toggle Agent Mode", run: () => setMode(mode === "agent" ? "chat" : "agent") });
}

// ---------------------------------------------------------------- UI
function build(el) {
  view = el;
  headEl = h("div.ai-head");
  msgsEl = h("div.ai-msgs.selectable");
  ctxEl = h("div.ai-ctx");
  inputEl = h("textarea", { rows: 2, placeholder: "Ask anything…  (@ to add files, / for commands)", spellcheck: true, onkeydown: onKey, oninput: onInput });
  sendBtn = h("button.btn.primary.ai-send", { title: "Send", onclick: () => (streaming ? stop() : send()) }, icon("send"));
  el.append(h("div.view-head", h("span.title", "AI Assistant"), h("button.icon-btn", { title: "New chat", onclick: newChat }, icon("add")), h("button.icon-btn", { title: "History", onclick: history }, icon("history")), h("button.icon-btn", { title: "Coding CLIs", onclick: cliMenu }, icon("terminal")), h("button.icon-btn", { title: "Provider & key", onclick: pickProvider }, icon("settings-gear"))),
    headEl, msgsEl, h("div.ai-compose", ctxEl, h("div.ai-inputrow", inputEl, sendBtn)));
  renderHead(); renderCtx(); renderMsgs();
  A.ed.editorEvents.on("active", renderCtx); A.ed.editorEvents.on("selection", debounce(renderCtx, 300));
}
function renderHead() {
  const p = curProvider();
  headEl.replaceChildren(
    h("button.chip.ai-pill", { onclick: pickProvider, title: "Change provider / model" }, icon("sparkle"), ` ${p.label.split(" (")[0]} · ${curModel() || "model?"}`),
    h("div.ai-modes", ...[["chat", "Chat"], ["agent", "Agent"]].map(([m, l]) => h("button.chip" + (mode === m ? ".on" : ""), { onclick: () => setMode(m), title: m === "agent" ? "The AI can read, edit files and run commands in your project (asks before changing things)" : "Ask questions with your code as context" }, l))));
}
function setMode(m) { mode = m; renderHead(); A.toast(m === "agent" ? "Agent mode: the AI can use tools in your project" : "Chat mode", { timeout: 1500 }); }
function renderCtx() {
  const t = A.ed.activeTab(); const sel = A.ed.selectionText();
  const chips = [];
  if (t?.path && t.kind === "file") chips.push(h("span.chip.cchip" + (ctx.activeFile ? ".on" : ""), { onclick: () => { ctx.activeFile = !ctx.activeFile; renderCtx(); } }, icon("file"), P.base(t.path)));
  if (sel) chips.push(h("span.chip.cchip" + (ctx.selection ? ".on" : ""), { onclick: () => { ctx.selection = !ctx.selection; renderCtx(); } }, icon("selection"), `selection (${sel.split("\n").length} lines)`));
  for (const f of ctx.files) chips.push(h("span.chip.cchip.on", { onclick: () => { ctx.files = ctx.files.filter((x) => x !== f); renderCtx(); } }, icon("file"), P.base(f), " ✕"));
  chips.push(h("span.chip.cchip", { onclick: addFile }, icon("add"), "file"));
  ctxEl.replaceChildren(...chips);
}
async function addFile() {
  if (!A.ws.isOpen) return; const files = await A.ws.fileIndex();
  const r = await A.quickPick(files.map((f) => ({ label: P.base(f), description: P.dir("/" + f).slice(1), value: f })), { placeholder: "Attach a file as context" });
  if (r) { ctx.files.push(P.join(A.ws.root, r)); renderCtx(); }
}
function onInput() { inputEl.style.height = "auto"; inputEl.style.height = Math.min(160, inputEl.scrollHeight) + "px"; if (/(^|\s)@$/.test(inputEl.value)) { inputEl.value = inputEl.value.slice(0, -1); addFile(); } }
function onKey(e) { if (e.key === "Enter" && !e.shiftKey && !("ontouchstart" in window)) { e.preventDefault(); send(); } }

async function pickProvider() {
  const names = Object.entries(PROVIDERS).map(([id, p]) => ({ label: p.label, description: id === A.settings.get("ai.provider") ? "current" : "", value: id }));
  const id = await A.quickPick(names, { placeholder: "Select AI provider" }); if (!id) return;
  A.settings.set("ai.provider", id); A.settings.set("ai.model", ""); const p = PROVIDERS[id];
  if (p.key && !(await A.N.secret.has(p.key)) && !(p.fallbackKey && (await A.N.secret.has(p.fallbackKey)))) await setKey(id);
  await pickModel(); renderHead();
}
export async function setKey(id = A.settings.get("ai.provider")) {
  const p = PROVIDERS[id]; if (!p?.key) return A.toast("This provider needs no API key");
  const v = await A.prompt(`${p.label} API key${p.help ? "\nGet one: " + p.help : ""}`, { password: true, okLabel: "Save key", message: "Stored encrypted in the Android Keystore; never shown again." }); if (!v) return;
  await A.N.secret.set(p.key, v.trim()); A.toast("API key saved", { kind: "success" });
}
async function pickModel() {
  const p = curProvider(); let models = p.models;
  try { models = (await fetchModels(p)) || models; } catch { /* use defaults */ }
  const r = await A.quickPick([...models.map((m) => ({ label: m, value: m })), { label: "Enter a model id manually…", value: "__manual", icon: "edit" }], { placeholder: "Select model" }); if (!r) return;
  const m = r === "__manual" ? await A.prompt("Model id") : r; if (!m) return;
  A.settings.state.aiModels = { ...(A.settings.state.aiModels || {}), [A.settings.get("ai.provider")]: m }; A.settings.saveState(); A.settings.set("ai.model", ""); renderHead();
}
const authHeader = (p) => (p.key ? (p.kind === "anthropic" ? { "x-api-key": `{{secret:${p.key}}}`, "anthropic-version": "2023-06-01" } : { Authorization: `Bearer {{secret:${p.key}}}` }) : {});
async function keyFor(p) { if (!p.key) return true; if (await A.N.secret.has(p.key)) return p.key; if (p.fallbackKey && (await A.N.secret.has(p.fallbackKey))) return p.fallbackKey; return false; }
async function headersFor(p) { const k = await keyFor(p); const hd = authHeader(p); if (k && k !== true && k !== p.key) for (const key of Object.keys(hd)) hd[key] = hd[key].replace(p.key, k); return hd; }
async function fetchModels(p) {
  const hd = await headersFor(p);
  if (p.catalog) { const r = await A.N.net.request({ url: p.catalog, headers: { ...hd, Accept: "application/json" }, timeoutMs: 15000 }); const j = JSON.parse(r.text); return j.map((x) => x.id).filter(Boolean); }
  const r = await A.N.net.request({ url: baseOf(p) + "/models", headers: hd, timeoutMs: 15000 }); if (r.status >= 400) return null;
  const j = JSON.parse(r.text); const arr = j.data || j.models || []; return arr.map((x) => x.id || x.name).filter(Boolean).sort();
}

// ---------------------------------------------------------------- history
async function chatDir() { const d = P.join(A.settings.dataDir, "ai"); await A.N.fs.mkdir(d); return d; }
const saveChat = debounce(async () => { if (!chat.messages.length) return; try { await A.N.fs.writeText(P.join(await chatDir(), chat.id + ".json"), JSON.stringify(chat)); } catch { /* ignore */ } }, 800);
async function history() {
  const dir = await chatDir(); const items = [];
  for (const f of await A.N.fs.list(dir).catch(() => [])) { if (!f.n.endsWith(".json")) continue; try { const j = JSON.parse((await A.N.fs.readText(P.join(dir, f.n))).text); items.push({ label: j.title, description: new Date(j.created).toLocaleString(), value: j, m: j.created }); } catch { /* skip */ } }
  items.sort((a, b) => b.m - a.m); if (!items.length) return A.toast("No saved chats yet");
  const r = await A.quickPick(items, { placeholder: "Open previous chat" }); if (r) { Object.assign(chat, r); renderMsgs(); }
}
function newChat() { if (streaming) stop(); Object.assign(chat, { id: uid(), title: "New chat", messages: [], created: Date.now() }); renderMsgs(); inputEl?.focus(); }

// ---------------------------------------------------------------- rendering
function sanitize(html) {
  const t = document.createElement("template"); t.innerHTML = html;
  t.content.querySelectorAll("script,iframe,object,embed,style,link,meta,form,base").forEach((n) => n.remove());
  t.content.querySelectorAll("*").forEach((n) => { for (const a of [...n.attributes]) { if (/^on/i.test(a.name) || (/^(href|src|xlink:href)$/i.test(a.name) && /^\s*javascript:/i.test(a.value))) n.removeAttribute(a.name); } if (n.tagName === "A") { n.setAttribute("rel", "noopener"); } });
  return t.content;
}
function renderMarkdown(text, host) {
  const html = window.marked ? window.marked.parse(text, { gfm: true, breaks: true }) : `<pre>${esc(text)}</pre>`;
  const frag = sanitize(html); host.replaceChildren(frag);
  host.querySelectorAll("a").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); const u = a.getAttribute("href"); if (/^https?:/.test(u)) A.N.sys.openUrl(u); }));
  host.querySelectorAll("pre > code").forEach((code) => {
    const pre = code.parentElement; const lang = (code.className.match(/language-([\w+-]+)/) || [])[1] || ""; const src = code.textContent;
    pre.classList.add("ai-code");
    pre.prepend(h("div.ai-code-bar", h("span.muted", lang || "code"), h("span", { style: { flex: 1 } }),
      h("button.icon-btn", { title: "Copy", onclick: () => { A.N.sys.clipboardSet(src); A.toast("Copied", { timeout: 900 }); } }, icon("copy")),
      h("button.icon-btn", { title: "Insert at cursor", onclick: () => A.ed.insertText(src) }, icon("insert")),
      h("button.icon-btn", { title: "Apply…", onclick: (e) => applyMenu(src, lang, e.clientX, e.clientY) }, icon("diff"))));
  });
}
function applyMenu(src, lang, x, y) {
  const t = A.ed.activeTab(); const hasSel = !!A.ed.selectionText();
  A.contextMenu([
    { label: "Insert at cursor", icon: "insert", disabled: !t?.doc?.model, run: () => A.ed.insertText(src) },
    { label: "Replace selection", icon: "replace", disabled: !hasSel, run: () => A.ed.replaceSelection(src) },
    { label: "Replace whole file", icon: "file", disabled: !t?.doc?.model, run: async () => { const d = t.doc; if (await A.confirm(`Replace the entire contents of ${d.name}?`, { okLabel: "Replace" })) d.model.pushEditOperations([], [{ range: d.model.getFullModelRange(), text: src }], () => null); } },
    { label: "Show diff vs. file", icon: "diff", disabled: !t?.doc?.model, run: () => A.ed.openDiff("AI suggestion", t.doc.model.getValue(), src, t.doc.model.getLanguageId()) },
    { label: "Save as new file…", icon: "new-file", run: async () => { const n = await A.prompt("File name", { value: "snippet." + (lang || "txt") }); if (n && A.ws.isOpen) { const p = await A.ws.createFile(A.ws.root, n, src); A.ed.openFile(p); } } },
  ], x, y);
}
function renderMsgs() {
  msgsEl.replaceChildren();
  if (!chat.messages.length) { msgsEl.append(welcome()); return; }
  for (const m of chat.messages) addBubble(m);
  msgsEl.scrollTop = msgsEl.scrollHeight;
}
function welcome() {
  const p = curProvider();
  return h("div.ai-welcome", icon("sparkle", "big"), h("div", { style: { fontWeight: 600, fontSize: "14px" } }, "CodeForge AI"), h("div.muted", `Using ${p.label} · ${curModel() || "no model"}`),
    h("div.ai-suggest", ...["Explain this file", "Find bugs in the selection", "Write unit tests", "Add comments and docs", "Refactor for readability"].map((t) => h("button.chip", { onclick: () => { inputEl.value = t; send(); } }, t))),
    h("div.muted", { style: { fontSize: "12px" } }, "Agent mode lets the AI read, edit files and run commands. Add an API key via ⚙ — keys stay in the Android Keystore."));
}
function addBubble(m) {
  if (m.role === "tool") return null;
  const el = h("div.ai-msg." + m.role);
  if (m.role === "user") { el.append(h("div.ai-text", m.text)); if (m.ctx?.length) el.append(h("div.ai-ctxline", ...m.ctx.map((c) => h("span.chip", c)))); }
  else { const body = h("div.ai-md"); renderMarkdown(m.text || "", body); el.append(body); for (const tc of m.toolCalls || []) el.append(toolCard(tc)); }
  msgsEl.append(el); m.el = el; return el;
}
function toolCard(tc) {
  const el = h("div.ai-tool", { dataset: { id: tc.id } }, icon("tools"), h("span.ai-tool-name", tc.name), h("span.muted.ai-tool-args", summarizeArgs(tc.input)), h("span.ai-tool-status", tc.result ? (tc.result.isError ? "✗" : "✓") : "…"));
  el.addEventListener("click", () => { const d = el.querySelector(".ai-tool-detail"); if (d) return d.remove(); el.append(h("pre.ai-tool-detail", JSON.stringify(tc.input, null, 2).slice(0, 2000) + (tc.result ? "\n→ " + String(tc.result.output).slice(0, 2000) : ""))); });
  tc.el = el; return el;
}
const summarizeArgs = (i) => Object.values(i || {}).map((v) => String(v).replace(/\s+/g, " ").slice(0, 40)).join(", ").slice(0, 70);

// ---------------------------------------------------------------- context & sending
async function buildContext() {
  const parts = [], labels = []; let budget = 120_000;
  const add = (path, text, label) => { if (budget <= 0) return; const t = text.length > 40_000 ? text.slice(0, 40_000) + "\n… [truncated]" : text; budget -= t.length; parts.push(`<file path="${A.ws.isOpen && P.inside(A.ws.root, path) ? P.rel(A.ws.root, path) : path}">\n${t}\n</file>`); labels.push(label); };
  const t = A.ed.activeTab(); const sel = A.ed.selectionText();
  if (ctx.selection && sel && t?.path) { parts.push(`<selection path="${t.path ? (A.ws.isOpen ? P.rel(A.ws.root, t.path) : t.path) : ""}">\n${sel}\n</selection>`); labels.push("selection"); }
  if (ctx.activeFile && t?.doc?.model) add(t.path, t.doc.model.getValue(), P.base(t.path));
  for (const f of ctx.files) { if (f === t?.path) continue; try { const r = await A.N.fs.readText(f); if (r.text != null) add(f, r.text, P.base(f)); } catch { /* skip */ } }
  return { text: parts.join("\n"), labels };
}
const SLASH = { "/explain": "Explain the code clearly, step by step.", "/fix": "Find and fix the bug(s). Show the corrected code and explain the cause.", "/tests": "Write thorough unit tests for this code using the project's test framework (or a sensible default).", "/docs": "Add concise documentation comments to this code.", "/refactor": "Refactor this code for readability and maintainability without changing behaviour.", "/optimize": "Suggest and apply performance optimizations." };
function systemPrompt() {
  const base = `You are CodeForge AI, an expert programming assistant built into an Android code editor (Monaco editor, a terminal with Alpine Linux, live preview, git).\nBe concise and practical. When you output code, use fenced code blocks with a language tag. Prefer minimal diffs: only show changed parts unless asked for the full file.\n${A.ws.isOpen ? `The open project is "${A.ws.name}".` : "No project is open."}\nCurrent date: ${new Date().toDateString()}.`;
  const agent = mode === "agent" ? `\n\nYou are in AGENT mode with tools to read, search, create and edit files in the project and run shell commands. Work step by step: inspect before editing, make focused edits with edit_file (exact string replacement) or write_file, and verify by running commands when useful. Paths are relative to the project root. Stop and give a short summary when the task is done.` : "";
  return base + agent + (A.settings.get("ai.systemPrompt") ? "\n\n" + A.settings.get("ai.systemPrompt") : "");
}

async function send(textOverride) {
  if (streaming) return;
  let text = (textOverride ?? inputEl.value).trim(); if (!text) return;
  const p = curProvider(); const k = await keyFor(p);
  if (!k) { if (await A.confirm(`No API key for ${p.label}. Add one now?`, { okLabel: "Add key" })) { await setKey(A.settings.get("ai.provider")); } return; }
  if (!curModel()) { await pickModel(); if (!curModel()) return; }
  const first = text.split(/\s/)[0]; if (SLASH[first]) text = SLASH[first] + text.slice(first.length);
  if (first === "/clear") { inputEl.value = ""; return newChat(); }
  const c = await buildContext();
  const user = { role: "user", text, apiText: (c.text ? c.text + "\n\n" : "") + text, ctx: c.labels };
  chat.messages.push(user); if (chat.title === "New chat") chat.title = text.slice(0, 50);
  inputEl.value = ""; inputEl.style.height = "auto"; msgsEl.querySelector(".ai-welcome")?.remove(); addBubble(user);
  await runTurn();
}

async function runTurn() {
  const p = curProvider(); const max = mode === "agent" ? 25 : 1;
  streaming = { abort: null, cancelled: false }; setBusy(true);
  try {
    for (let step = 0; step < max; step++) {
      const asst = { role: "assistant", text: "", toolCalls: [] }; chat.messages.push(asst); const el = addBubble(asst); el.classList.add("streaming"); const body = el.querySelector(".ai-md");
      const done = await streamOnce(p, asst, (t) => { asst.text = t; renderMarkdown(t + "▍", body); msgsEl.scrollTop = msgsEl.scrollHeight; });
      renderMarkdown(asst.text, body); el.classList.remove("streaming");
      for (const tc of asst.toolCalls) el.append(toolCard(tc));
      if (streaming.cancelled) break;
      if (!asst.toolCalls.length) break;
      for (const tc of asst.toolCalls) { tc.result = await runTool(tc); if (tc.el) { tc.el.querySelector(".ai-tool-status").textContent = tc.result.isError ? "✗" : "✓"; } if (streaming.cancelled) break; }
      if (streaming.cancelled) break;
      void done;
    }
  } catch (e) { if (!streaming?.cancelled) { const err = { role: "assistant", text: "⚠️ " + (e.message || e), error: true }; chat.messages.push(err); addBubble(err); } }
  finally { streaming = null; setBusy(false); saveChat(); msgsEl.scrollTop = msgsEl.scrollHeight; }
}
function setBusy(b) { sendBtn.replaceChildren(icon(b ? "debug-stop" : "send")); sendBtn.title = b ? "Stop" : "Send"; }
function stop() { if (!streaming) return; streaming.cancelled = true; streaming.abort?.(); }

// ---------------------------------------------------------------- provider calls (streaming)
const TOOLS = [
  { name: "list_dir", description: "List files and folders in a directory of the project (relative path, '.' for root).", props: { path: { type: "string" } }, req: ["path"] },
  { name: "read_file", description: "Read a text file from the project.", props: { path: { type: "string" } }, req: ["path"] },
  { name: "search", description: "Search the project for a text string or regex. Returns matching lines with file and line number.", props: { query: { type: "string" }, regex: { type: "boolean" } }, req: ["query"] },
  { name: "write_file", description: "Create or overwrite a file with the given full content.", props: { path: { type: "string" }, content: { type: "string" } }, req: ["path", "content"] },
  { name: "edit_file", description: "Replace one exact occurrence of old_string with new_string in a file. old_string must match exactly (including whitespace) and be unique.", props: { path: { type: "string" }, old_string: { type: "string" }, new_string: { type: "string" } }, req: ["path", "old_string", "new_string"] },
  { name: "run_command", description: "Run a shell command in the project root (Linux environment if installed, else Android sh). Returns exit code and output (truncated).", props: { command: { type: "string" } }, req: ["command"] },
];
const schema = (t) => ({ type: "object", properties: t.props, required: t.req });
const toolsFor = (p) => (mode !== "agent" ? undefined : p.kind === "anthropic" ? TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: schema(t) })) : TOOLS.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: schema(t) } })));

function toApi(p) {
  const out = []; const msgs = chat.messages.filter((m) => !m.error);
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    if (m.role === "user") { out.push({ role: "user", content: m.apiText ?? m.text }); continue; }
    if (!m.text && !m.toolCalls?.length) continue;
    if (p.kind === "anthropic") {
      const blocks = []; if (m.text) blocks.push({ type: "text", text: m.text }); for (const tc of m.toolCalls || []) blocks.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.input || {} });
      out.push({ role: "assistant", content: blocks });
      if (m.toolCalls?.length) out.push({ role: "user", content: m.toolCalls.map((tc) => ({ type: "tool_result", tool_use_id: tc.id, content: tc.result ? String(tc.result.output) : "(cancelled)", is_error: !!tc.result?.isError })) });
    } else {
      const o = { role: "assistant", content: m.text || null }; if (m.toolCalls?.length) o.tool_calls = m.toolCalls.map((tc) => ({ id: tc.id, type: "function", function: { name: tc.name, arguments: JSON.stringify(tc.input || {}) } }));
      out.push(o); for (const tc of m.toolCalls || []) out.push({ role: "tool", tool_call_id: tc.id, content: tc.result ? String(tc.result.output) : "(cancelled)" });
    }
  }
  return out;
}

async function* sse(stream) {
  let buf = "";
  for await (const chunk of stream.body) {
    buf += textDec.decode(chunk, { stream: true }).replace(/\r\n/g, "\n");
    let i; while ((i = buf.indexOf("\n\n")) >= 0) { const block = buf.slice(0, i); buf = buf.slice(i + 2); const data = block.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trimStart()).join("\n"); if (data) yield data; }
  }
  if (buf.trim().startsWith("data:")) yield buf.trim().slice(5).trimStart();
}

async function streamOnce(p, asst, onText) {
  const hd = { ...(await headersFor(p)), "Content-Type": "application/json", Accept: "text/event-stream" };
  const temp = A.settings.get("ai.temperature"); const messages = toApi(p); const tools = toolsFor(p);
  let url, body;
  if (p.kind === "anthropic") { url = baseOf(p) + "/v1/messages"; body = { model: curModel(), max_tokens: 8192, stream: true, system: systemPrompt(), messages, temperature: temp, ...(tools ? { tools } : {}) }; }
  else { url = baseOf(p) + "/chat/completions"; body = { model: curModel(), stream: true, messages: [{ role: "system", content: systemPrompt() }, ...messages], temperature: temp, ...(tools ? { tools } : {}) }; if (A.settings.get("ai.provider") === "openai" && /^(o\d|gpt-5)/.test(curModel())) delete body.temperature; }
  const s = A.N.net.stream({ url, method: "POST", headers: hd, body: JSON.stringify(body), timeoutMs: 15 * 60_000 }); streaming.abort = () => s.abort();
  const head = await s.head;
  if (head.status >= 400) { let t = ""; for await (const c of s.body) t += textDec.decode(c); let msg = t; try { const j = JSON.parse(t); msg = j.error?.message || j.message || t; } catch { /* raw */ } throw new Error(`${head.status}: ${String(msg).slice(0, 400)}`); }
  let text = ""; const tcs = new Map();
  for await (const data of sse(s)) {
    if (streaming.cancelled) break; if (data === "[DONE]") break; let j; try { j = JSON.parse(data); } catch { continue; }
    if (p.kind === "anthropic") {
      if (j.type === "content_block_start" && j.content_block?.type === "tool_use") tcs.set(j.index, { id: j.content_block.id, name: j.content_block.name, json: "" });
      else if (j.type === "content_block_delta") { if (j.delta?.type === "text_delta") { text += j.delta.text; onText(text); } else if (j.delta?.type === "input_json_delta") { const t = tcs.get(j.index); if (t) t.json += j.delta.partial_json; } }
      else if (j.type === "error") throw new Error(j.error?.message || "stream error");
    } else {
      if (j.error) throw new Error(j.error.message || JSON.stringify(j.error));
      const d = j.choices?.[0]?.delta; if (!d) continue;
      if (d.content) { text += d.content; onText(text); }
      for (const t of d.tool_calls || []) { const e = tcs.get(t.index) || { id: "", name: "", json: "" }; if (t.id) e.id = t.id; if (t.function?.name) e.name += t.function.name; if (t.function?.arguments) e.json += t.function.arguments; tcs.set(t.index, e); }
    }
  }
  asst.text = text;
  asst.toolCalls = [...tcs.values()].filter((t) => t.name).map((t) => { let input = {}; try { input = t.json ? JSON.parse(t.json) : {}; } catch { input = { _raw: t.json }; } return { id: t.id || uid(), name: t.name, input }; });
  return true;
}

// ---------------------------------------------------------------- agent tools
const rel = (p) => { if (!A.ws.isOpen) throw new Error("No project open"); const full = P.norm(String(p).startsWith("/") ? p : P.join(A.ws.root, p || ".")); if (!P.inside(A.ws.root, full)) throw new Error("Path outside the project: " + p); return full; };
async function approve(title, detail) {
  if (!A.settings.get("ai.agentConfirm")) return true;
  const r = await A.modal({ title, width: 560, body: h("pre.selectable", { style: { whiteSpace: "pre-wrap", maxHeight: "50vh", overflow: "auto", font: "12px var(--mono)", margin: 0 } }, detail), buttons: [{ label: "Reject", value: false, danger: true }, { label: "Allow", value: true, primary: true }] });
  return r === true;
}
async function runTool(tc) {
  const i = tc.input || {}; const ok = (output) => ({ output, isError: false }), bad = (e) => ({ output: String(e.message || e), isError: true });
  try {
    switch (tc.name) {
      case "list_dir": { const items = await A.N.fs.list(rel(i.path)); return ok(items.filter((x) => x.n !== ".git" && x.n !== "node_modules").sort((a, b) => a.n.localeCompare(b.n)).map((x) => (x.t === "d" ? x.n + "/" : x.n)).join("\n") || "(empty)"); }
      case "read_file": { const r = await A.N.fs.readText(rel(i.path), { max: 400_000 }); if (r.binary) return bad("binary file"); if (r.tooLarge) return bad("file too large"); return ok(r.text.length > 60_000 ? r.text.slice(0, 60_000) + "\n…[truncated]" : r.text); }
      case "search": { const r = await A.N.search.text({ id: uid(), root: A.ws.root, query: String(i.query), regex: !!i.regex, caseSensitive: false, wholeWord: false, include: [], exclude: ["node_modules", ".git", "dist", "build"], max: 60 }); return ok(r.results.map((m) => `${m.rel}:${m.line}: ${m.text.trim().slice(0, 160)}`).join("\n") || "no matches"); }
      case "write_file": { const full = rel(i.path); const exists = await A.N.fs.exists(full); if (!(await approve(`${exists ? "Overwrite" : "Create"} ${P.rel(A.ws.root, full)}?`, String(i.content).slice(0, 4000)))) return bad("Rejected by user"); await A.N.fs.writeText(full, String(i.content)); A.ws.emit("changed", new Set([P.dir(full)])); if (A.ed.getDoc(full)) A.ed.reload(full, true); return ok(`Wrote ${P.rel(A.ws.root, full)} (${String(i.content).length} chars)`); }
      case "edit_file": { const full = rel(i.path); const r = await A.N.fs.readText(full); if (r.text == null) return bad("cannot read file"); const n = r.text.split(i.old_string).length - 1; if (n === 0) return bad("old_string not found (must match exactly)"); if (n > 1) return bad(`old_string occurs ${n} times; make it unique`);
        if (!(await approve(`Edit ${P.rel(A.ws.root, full)}?`, `--- old\n${i.old_string}\n+++ new\n${i.new_string}`))) return bad("Rejected by user");
        const doc = A.ed.getDoc(full); if (doc?.model && doc.dirty) await A.ed.save(full);
        await A.N.fs.writeText(full, r.text.replace(i.old_string, () => i.new_string), { bom: r.bom }); if (doc) A.ed.reload(full, true); return ok("Edited " + P.rel(A.ws.root, full)); }
      case "run_command": { if (!(await approve("Run command?", String(i.command)))) return bad("Rejected by user"); const r = await A.N.proc.exec({ line: String(i.command), cwd: A.ws.root, timeoutMs: 120_000 }); const out = r.out.length > 8000 ? "…" + r.out.slice(-8000) : r.out; A.ws.invalidate(); return { output: `exit code ${r.code}${r.timedOut ? " (timed out)" : ""}\n${out}`, isError: r.code !== 0 }; }
      default: return bad("unknown tool " + tc.name);
    }
  } catch (e) { return bad(e); }
}

// ---------------------------------------------------------------- editor selection actions
async function selectionAction(kind) {
  A.showView("ai"); const sel = A.ed.selectionText(); if (!sel) return A.toast("Select some code first", { kind: "warn" }); ctx.selection = true; ctx.activeFile = false; renderCtx();
  if (kind === "explain") return send("Explain this selected code.");
  if (kind === "fix") return send("Find and fix any bugs in the selected code. Reply with the corrected code in one code block, then a short explanation.");
  const ins = await A.prompt("What should the AI change?", { okLabel: "Go", placeholder: "e.g. convert to async/await" }); if (ins) send(`Edit the selected code: ${ins}\nReply with only the full replacement code in a single code block.`);
}

// ---------------------------------------------------------------- coding CLIs (real Claude Code / Codex / Copilot CLI inside the Linux terminal)
async function cliMenu(e) {
  const r = await A.quickPick(CLIS.map((c) => ({ label: c.name, description: c.note, value: c, icon: "terminal" })), { placeholder: "Open a coding CLI in the terminal (installs it on first use)" }); if (!r) return;
  const st = await A.N.env.status(); if (!st.installed) { if (await A.confirm(`${r.name} runs in the Linux environment (needs node/npm). Set it up now?`, { okLabel: "Set up" })) (await A.feat("env")).wizard(); return; }
  const install = r.pkg ? `npm i -g ${r.pkg}` : `pip install --break-system-packages ${r.pip}`;
  const line = `command -v ${r.bin} >/dev/null 2>&1 || { echo "Installing ${r.name}…"; ${install}; }; ${r.bin}`;
  await A.term.run(line, { cwd: A.ws.root || undefined, title: r.bin, mode: "linux", reuse: false });
}
