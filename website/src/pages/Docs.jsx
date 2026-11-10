import { Link } from "react-router-dom";
import { config, url } from "../lib/site.js";

const EXT = [
  ["Colour themes, file icon themes", "Yes"], ["Snippets, language configuration, JSON schemas", "Yes"],
  ["Commands, settings, status bar items, messages, quick picks", "Yes"],
  ["Completions, hovers, formatting, diagnostics, go to definition", "Yes"],
  ["Side bar containers, tree views, webview views and panels", "Yes"],
  ["TextMate grammars for new languages", "No. Monaco's built-in highlighting is used"],
  ["Language servers, debuggers, tasks that start programs", "No. They need desktop Node.js"],
  ["Claude Code, Codex, Copilot Chat extensions", "No. Use the CLI tabs in the AI side bar"],
];

export default function Docs() {
  const c = config();
  return (<>
    <section className="page-head"><div className="wrap prose">
      <h1>Docs and resources</h1>
      <p className="sub" style={{ margin: 0 }}>Short guides for the things people ask about most.</p>
      <nav className="toc" aria-label="On this page"><a href="#start">Get started</a><a href="#terminal">Linux terminal</a><a href="#preview">Run and preview</a><a href="#github">GitHub</a><a href="#ai">AI tools</a><a href="#extensions">Extensions</a><a href="#keys">Shortcuts</a><a href="#more">More</a></nav>
    </div></section>
    <section style={{ paddingTop: 0 }}><div className="wrap prose">
      <h2 id="start">Get started</h2>
      <ol>
        <li>Open the <a href={url("app/")}>web editor</a>, or <Link to="/download">install the Android app</Link>.</li>
        <li>Choose <strong>Open Folder</strong>. Pick a folder on the device, import a ZIP, clone a repository or create a project from a template.</li>
        <li>Edit files. Tap the play button to run the active file or start the project's dev server.</li>
      </ol>
      <p>On Android, new projects are stored in the app's own storage by default because npm needs symbolic links there. With “All files access” you can also keep projects in the <code>CodeForge</code> folder of your device storage, which other apps can see.</p>

      <h2 id="terminal">Linux terminal</h2>
      <p>Open the terminal and choose <strong>Linux</strong>. The first start downloads Alpine Linux. After that:</p>
      <pre><code>{"apk add nodejs npm python3 git\nnpm create vite@latest my-app\ncd my-app && npm install && npm run dev"}</code></pre>
      <p>Drag with one finger to scroll, pinch to change the text size, long-press for copy and paste. The <code>cf</code> command controls the editor from the shell: <code>cf open file.js:12</code>, <code>cf preview index.html</code>, <code>cf install claude</code>.</p>

      <h2 id="preview">Run and preview</h2>
      <p>Plain HTML projects use the built-in live server. Projects with a <code>package.json</code> run their <code>dev</code>, <code>start</code> or <code>serve</code> script, and the preview opens when the server prints its address.</p>
      <p>To open the dev server from another device on the same Wi-Fi, turn on <strong>Settings → Live Server → reachable from other devices</strong>, or pass the flag yourself:</p>
      <pre><code>npm run dev -- --host</code></pre>
      <p>Addresses such as <code>localhost:5173</code> or <code>192.168.1.20:5173</code> in the terminal are links. Settings decide whether they open in the in-app preview or your browser.</p>

      <h2 id="github">GitHub</h2>
      <p>Tap the account button and sign in. With a personal access token, <strong>Create token on GitHub</strong> opens the token page with <code>repo</code>, <code>workflow</code>, <code>read:user</code> and <code>user:email</code> already selected. Generate the token, copy it, and paste it into CodeForge. It is stored encrypted on the device.</p>

      <h2 id="ai">AI tools</h2>
      <p>The Chat tab uses your own API key for Anthropic, OpenAI, Google, OpenRouter or a compatible endpoint. Agent mode can read and edit files and run commands, and shows a diff before applying changes.</p>
      <p>The Claude Code, Codex, Gemini and Copilot tabs start the official command-line tools in a Linux terminal inside the side bar. They sign in with their own accounts and edit your project directly.</p>

      <h2 id="extensions">Extensions</h2>
      <p>Search Open VSX in the Extensions view or install a <code>.vsix</code> file. CodeForge shows what each extension contributes and what is supported before you install it.</p>
      <div className="tablewrap"><table><thead><tr><th>Extension feature</th><th>Works in CodeForge</th></tr></thead>
        <tbody>{EXT.map(([a, b]) => <tr key={a}><td>{a}</td><td className={b === "Yes" ? "yes" : ""}>{b}</td></tr>)}</tbody></table></div>
      <p className="note">Extension code runs in a sandbox without network access and can only reach the open project and its own folder. CodeForge asks once before running an extension's code.</p>

      <h2 id="keys">Shortcuts</h2>
      <div className="tablewrap"><table><tbody>
        <tr><td>Command palette</td><td><code>Ctrl+Shift+P</code></td></tr><tr><td>Quick open file</td><td><code>Ctrl+P</code></td></tr>
        <tr><td>Toggle side bar</td><td><code>Ctrl+B</code></td></tr><tr><td>Toggle terminal</td><td><code>Ctrl+`</code></td></tr>
        <tr><td>Save / Save all</td><td><code>Ctrl+S</code> / <code>Ctrl+K S</code></td></tr><tr><td>Run active file</td><td><code>F5</code></td></tr>
      </tbody></table></div>

      <h2 id="more">More</h2>
      <ul>
        <li><Link to="/updates">Release notes</Link> and the <Link to="/blog">blog</Link></li>
        <li><Link to="/code">Browse the source code</Link>{c.githubUrl ? <> or open it on <a href={c.githubUrl}>GitHub</a></> : null}</li>
        <li><Link to="/about">About and credits</Link>, <Link to="/privacy">privacy</Link></li>
      </ul>
    </div></section>
  </>);
}
