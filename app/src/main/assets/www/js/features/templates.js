// New Project templates.
import { h, P } from "../core/util.js";
let A;
export async function init(api) { A = api; }

const T = {
  blank: { label: "Empty folder", files: { "README.md": (n) => `# ${n}\n` } },
  web: { label: "HTML / CSS / JS (live preview)", files: {
    "index.html": (n) => `<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>${n}</title>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <main>\n    <h1>${n}</h1>\n    <button id="btn">Click me</button>\n    <p id="out"></p>\n  </main>\n  <script src="main.js"></script>\n</body>\n</html>\n`,
    "style.css": () => `:root { color-scheme: dark light; }\nbody { font-family: system-ui, sans-serif; margin: 0; display: grid; place-items: center; min-height: 100vh; }\nmain { text-align: center; }\nbutton { padding: .6em 1.2em; font-size: 1rem; border-radius: 8px; }\n`,
    "main.js": () => `let n = 0;\ndocument.getElementById("btn").addEventListener("click", () => {\n  n++;\n  document.getElementById("out").textContent = "Clicked " + n + " times";\n  console.log("clicked", n);\n});\n` } },
  node: { label: "Node.js app", files: {
    "package.json": (n) => JSON.stringify({ name: slug(n), version: "1.0.0", private: true, type: "module", scripts: { start: "node index.js", dev: "node --watch index.js" } }, null, 2) + "\n",
    "index.js": () => `import http from "node:http";\n\nconst port = process.env.PORT || 3000;\nhttp.createServer((req, res) => {\n  res.setHeader("content-type", "text/html");\n  res.end("<h1>Hello from Node.js</h1>");\n}).listen(port, () => console.log(\`Server running at http://localhost:\${port}\`));\n`,
    ".gitignore": () => "node_modules\n.env\n" } },
  express: { label: "Node.js + Express", files: {
    "package.json": (n) => JSON.stringify({ name: slug(n), version: "1.0.0", private: true, scripts: { start: "node server.js" }, dependencies: { express: "^4.19.2" } }, null, 2) + "\n",
    "server.js": () => `const express = require("express");\nconst app = express();\napp.use(express.static("public"));\napp.get("/api/hello", (req, res) => res.json({ hello: "world" }));\nconst port = process.env.PORT || 3000;\napp.listen(port, () => console.log(\`http://localhost:\${port}\`));\n`,
    "public/index.html": (n) => `<!doctype html><meta charset="utf-8"><title>${n}</title><h1>${n}</h1><pre id="o"></pre>\n<script>fetch("/api/hello").then(r=>r.json()).then(j=>o.textContent=JSON.stringify(j))</script>\n`,
    ".gitignore": () => "node_modules\n" } },
  vite: { label: "Vite (vanilla) — needs npm + network", files: {
    "package.json": (n) => JSON.stringify({ name: slug(n), private: true, version: "0.0.0", type: "module", scripts: { dev: "vite --host", build: "vite build", preview: "vite preview --host" }, devDependencies: { vite: "^5.4.0" } }, null, 2) + "\n",
    "index.html": (n) => `<!doctype html>\n<html lang="en">\n  <head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${n}</title></head>\n  <body>\n    <div id="app"></div>\n    <script type="module" src="/src/main.js"></script>\n  </body>\n</html>\n`,
    "src/main.js": () => `import "./style.css";\n\ndocument.querySelector("#app").innerHTML = \`<h1>Hello Vite!</h1><button id="c">count is 0</button>\`;\nlet n = 0;\ndocument.querySelector("#c").onclick = (e) => (e.target.textContent = \`count is \${++n}\`);\n`,
    "src/style.css": () => `body { font-family: system-ui; display: grid; place-items: center; min-height: 100vh; margin: 0; }\n`,
    ".gitignore": () => "node_modules\ndist\n" } },
  react: { label: "React + Vite — needs npm + network", files: {
    "package.json": (n) => JSON.stringify({ name: slug(n), private: true, version: "0.0.0", type: "module", scripts: { dev: "vite --host", build: "vite build" }, dependencies: { react: "^18.3.1", "react-dom": "^18.3.1" }, devDependencies: { "@vitejs/plugin-react": "^4.3.1", vite: "^5.4.0" } }, null, 2) + "\n",
    "vite.config.js": () => `import { defineConfig } from "vite";\nimport react from "@vitejs/plugin-react";\nexport default defineConfig({ plugins: [react()] });\n`,
    "index.html": (n) => `<!doctype html>\n<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${n}</title></head>\n<body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>\n`,
    "src/main.jsx": () => `import React from "react";\nimport { createRoot } from "react-dom/client";\nimport App from "./App.jsx";\n\ncreateRoot(document.getElementById("root")).render(<App />);\n`,
    "src/App.jsx": (n) => `import { useState } from "react";\n\nexport default function App() {\n  const [n, setN] = useState(0);\n  return (\n    <main style={{ fontFamily: "system-ui", textAlign: "center", marginTop: 60 }}>\n      <h1>${n}</h1>\n      <button onClick={() => setN(n + 1)}>count is {n}</button>\n    </main>\n  );\n}\n`,
    ".gitignore": () => "node_modules\ndist\n" } },
  python: { label: "Python script", files: { "main.py": () => `def main():\n    print("Hello from Python")\n\n\nif __name__ == "__main__":\n    main()\n`, "README.md": (n) => `# ${n}\n\nRun: \`python3 main.py\`\n` } },
  flask: { label: "Python + Flask", files: {
    "app.py": () => `from flask import Flask\n\napp = Flask(__name__)\n\n@app.get("/")\ndef index():\n    return "<h1>Hello from Flask</h1>"\n\nif __name__ == "__main__":\n    app.run(host="0.0.0.0", port=5000, debug=True)\n`,
    "requirements.txt": () => "flask\n", "README.md": (n) => `# ${n}\n\n\`\`\`sh\npip install --break-system-packages -r requirements.txt\npython3 app.py\n\`\`\`\n` } },
  cpp: { label: "C++ (g++)", files: { "main.cpp": () => `#include <iostream>\n\nint main() {\n    std::cout << "Hello from C++\\n";\n    return 0;\n}\n`, "Makefile": () => `main: main.cpp\n\tg++ -std=c++17 -O2 main.cpp -o main\n` } },
};
const slug = (n) => n.toLowerCase().replace(/[^a-z0-9-_]+/g, "-").replace(/^-+|-+$/g, "") || "app";

export async function newProject() {
  const items = Object.entries(T).map(([id, t]) => ({ label: t.label, value: id }));
  const id = await A.quickPick(items, { placeholder: "Choose a project template" }); if (!id) return;
  const name = await A.prompt("Project name", { value: "my-" + id, okLabel: "Create", validate: (v) => (A.ws.validName(v) || null) }); if (!name) return;
  const base = A.settings.state.projectsDir || P.join(A.info().paths.home, "projects");
  await A.N.fs.mkdir(base);
  const dir = P.join(base, name);
  if (await A.N.fs.exists(dir)) return A.toast(`“${name}” already exists`, { kind: "error" });
  try {
    await A.N.fs.mkdir(dir);
    for (const [f, mk] of Object.entries(T[id].files)) await A.N.fs.writeText(P.join(dir, f), mk(name));
    await A.openFolder(dir);
    const first = Object.keys(T[id].files).find((f) => /^(index\.html|main\.py|app\.py|index\.js|server\.js|main\.cpp|README\.md)$/.test(f)) || Object.keys(T[id].files)[0];
    A.ed.openFile(P.join(dir, first));
  } catch (e) { A.toastError(e); }
}
