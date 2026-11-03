// Mock Open VSX registry + mock Anthropic/OpenAI streaming endpoints (for e2e tests only).
const http = require("http");
const JSZip = require("/home/claude/build/CodeForge/tools/devhost/node_modules/jszip");
async function makeVsix() {
  const z = new JSZip();
  z.file("extension/package.json", JSON.stringify({ name: "mock-theme", publisher: "acme", version: "1.2.3", displayName: "Mock Theme Pack", description: "A theme, icon theme and snippets",
    contributes: { themes: [{ label: "Mock Midnight", uiTheme: "vs-dark", path: "./themes/mid.json" }], iconThemes: [{ id: "mockicons", label: "Mock Icons", path: "./icons/theme.json" }], snippets: [{ language: "python", path: "./snippets/py.json" }], languages: [{ id: "mocklang", extensions: [".mck"], aliases: ["Mock"], configuration: "./lang.json" }], commands: [{ command: "x", title: "X" }] }, main: "./extension.js" }));
  z.file("extension/README.md", "# Mock Theme\nHello **world**");
  z.file("extension/themes/mid.json", JSON.stringify({ name: "Mock Midnight", type: "dark", colors: { "editor.background": "#101830", "sideBar.background": "#0b1226", "activityBar.background": "#08101f", "statusBar.background": "#6a1b9a" }, tokenColors: [{ scope: "comment", settings: { foreground: "#55aa77" } }] }));
  z.file("extension/icons/theme.json", JSON.stringify({ iconDefinitions: { f: { iconPath: "./f.svg" } }, file: "f", fileExtensions: { js: "f" } }));
  z.file("extension/icons/f.svg", '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="red"/></svg>');
  z.file("extension/snippets/py.json", JSON.stringify({ "Mock print": { prefix: "mockp", body: ["print('mock $1')"], description: "mock" } }));
  z.file("extension/lang.json", JSON.stringify({ comments: { lineComment: "##" }, brackets: [["(", ")"]] }));
  return z.generateAsync({ type: "nodebuffer" });
}
function sse(res, events) { res.writeHead(200, { "content-type": "text/event-stream" }); let i = 0; const t = setInterval(() => { if (i >= events.length) { clearInterval(t); return res.end(); } const e = events[i++]; res.write((e.event ? `event: ${e.event}\n` : "") + `data: ${typeof e.data === "string" ? e.data : JSON.stringify(e.data)}\n\n`); }, 5); }
async function start(port = 8790) {
  const vsix = await makeVsix(); const seen = { anthropic: [], openai: [] };
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x"); let body = ""; req.on("data", (c) => (body += c));
    req.on("end", () => {
      if (u.pathname === "/api/-/search") { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ offset: 0, totalSize: 1, extensions: [{ namespace: "acme", name: "mock-theme", version: "1.2.3", displayName: "Mock Theme Pack", description: "A theme, icon theme and snippets", downloadCount: 1234, averageRating: 4.5, files: { download: `http://127.0.0.1:${port}/files/mock.vsix`, readme: `http://127.0.0.1:${port}/files/readme.md` } }] })); }
      if (u.pathname === "/api/acme/mock-theme") { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ namespace: "acme", name: "mock-theme", version: "1.2.3", displayName: "Mock Theme Pack", description: "d", categories: ["Themes"], files: { download: `http://127.0.0.1:${port}/files/mock.vsix`, readme: `http://127.0.0.1:${port}/files/readme.md` } })); }
      if (u.pathname === "/files/mock.vsix") { res.writeHead(200, { "content-type": "application/octet-stream" }); return res.end(vsix); }
      if (u.pathname === "/files/readme.md") { res.writeHead(200); return res.end("# Readme\nmock"); }
      if (u.pathname === "/v1/messages") {
        const j = JSON.parse(body); seen.anthropic.push({ headers: req.headers, body: j });
        const hasToolResult = j.messages.some((m) => Array.isArray(m.content) && m.content.some((b) => b.type === "tool_result"));
        if (j.tools && !hasToolResult) return sse(res, [{ event: "message_start", data: { type: "message_start" } }, { event: "content_block_start", data: { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } } }, { event: "content_block_delta", data: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Creating file. " } } }, { event: "content_block_start", data: { type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "tu_1", name: "write_file", input: {} } } }, { event: "content_block_delta", data: { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '{"path":"ai-made.txt",' } } }, { event: "content_block_delta", data: { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '"content":"from agent"}' } } }, { event: "message_stop", data: { type: "message_stop" } }]);
        return sse(res, [{ event: "content_block_delta", data: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: hasToolResult ? "Done: file written." : "Hello " } } }, { event: "content_block_delta", data: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: hasToolResult ? "" : "from **Claude** mock\n\n```js\nconsole.log(1)\n```" } } }, { event: "message_stop", data: { type: "message_stop" } }]);
      }
      if (u.pathname === "/v1/chat/completions") { const j = JSON.parse(body); seen.openai.push({ headers: req.headers, body: j }); return sse(res, [{ data: { choices: [{ delta: { content: "OpenAI " } }] } }, { data: { choices: [{ delta: { content: "mock reply" } }] } }, { data: "[DONE]" }]); }
      if (u.pathname === "/v1/models") { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ data: [{ id: "mock-model-1" }, { id: "mock-model-2" }] })); }
      res.writeHead(404); res.end("nf");
    });
  });
  await new Promise((r) => srv.listen(port, "127.0.0.1", r));
  return { srv, seen, close: () => srv.close() };
}
module.exports = { start };
