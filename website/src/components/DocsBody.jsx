import { Link } from "react-router-dom";
import { config, url } from "../lib/site.js";

// "Docs and resources": shown on its own on /docs and as the second part of /guide.
// idp prefixes every heading id so the two pages can use the same text without clashing anchors.

const EXT = [
  ["Colour themes, file icon themes", "Yes"], ["Snippets, language configuration, JSON schemas", "Yes"],
  ["Commands, settings, status bar items, messages, quick picks", "Yes"],
  ["Completions, hovers, formatting, diagnostics, go to definition", "Yes"],
  ["Side bar containers, tree views, webview views and panels", "Yes"],
  ["TextMate grammars for new languages", "No. Monaco's built-in highlighting is used"],
  ["Language servers, debuggers, tasks that start programs", "No. They need desktop Node.js"],
  ["Claude Code, Codex, Copilot Chat extensions", "No. Use the CLI tabs in the AI side bar"],
];

const CF = [
  ["cf open <file>[:line]", "Open files in the editor, at a line if you give one (also: code)"],
  ["cf project [dir]", "Open a folder as the project"],
  ["cf preview <file | url>", "Live preview of an HTML file or a dev server such as http://localhost:5173"],
  ["cf serve [dir]", "Start the live server for a folder"],
  ["cf url <https://…>", "Open a link in the browser or the in-app preview"],
  ["cf ai <prompt>", "Put a prompt in the AI panel; -s sends it, -a runs the agent. Pipe text in as context: git diff | cf ai -s review this"],
  ["cf install <cli> / cf run <cli>", "Install a coding CLI (claude, codex, gemini, opencode, copilot, qwen, aider), or install and start it"],
  ["cf clis", "List the coding CLIs and which are installed"],
  ["cf storage / cf clean", "Open the Storage Manager / clear npm, pip, apk and apt caches"],
  ["cf settings [search]", "Open Settings, optionally searching"],
  ["cf crashes", "Show crash reports"],
  ["cf toast <message>", "Show a notification in the IDE (handy at the end of a long build)"],
];

const KEYS = [
  ["Command palette", "Ctrl+Shift+P"], ["Quick open file", "Ctrl+P"], ["Go to line", "Ctrl+G"],
  ["Search in files", "Ctrl+Shift+F"], ["Toggle line comment", "Ctrl+/"], ["Toggle side bar", "Ctrl+B"],
  ["Split editor", "Ctrl+\\"], ["New file", "Ctrl+Alt+N"], ["Save", "Ctrl+S"],
  ["Toggle terminal", "Ctrl+`"], ["Terminal mode ⇄ full IDE", "Ctrl+Alt+T"], ["Run active file", "F5"],
];

export default function DocsBody({ idp = "", heading = "h2" }) {
  const c = config();
  const H = heading;
  const id = (x) => idp + x;
  return (<>
    <H id={id("start")}>Get started</H>
    <ol>
      <li>Open the <a href={url("app/")}>web editor</a>, or <Link to="/download">install the Android app</Link>.</li>
      <li>Choose <strong>Open Folder</strong>. Pick a folder on the device, import a ZIP, clone a repository or create a project from a template.</li>
      <li>Edit files. Tap the play button to run the active file or start the project's dev server.</li>
    </ol>

    <H id={id("files")}>Where your files live</H>
    <div className="tablewrap"><table><thead><tr><th>Place</th><th>What is there</th></tr></thead><tbody>
      <tr><td>App storage (default)</td><td>New projects. npm needs symbolic links, which only work here. Other apps cannot see it; the Storage Manager and <strong>Export</strong> can copy projects out.</td></tr>
      <tr><td><code>CodeForge</code> folder on the device</td><td>Projects other apps can see, with “All files access”. Good for files you share; slower for <code>node_modules</code>.</td></tr>
      <tr><td><code>~</code> in the Linux terminal</td><td>The same workspace as the editor, shared by Alpine, Debian and Ubuntu. Removing a Linux system never touches it.</td></tr>
      <tr><td>Web editor</td><td>Your browser's storage (IndexedDB) on that device. Download a ZIP or push to Git to keep a copy elsewhere.</td></tr>
    </tbody></table></div>

    <H id={id("terminal")}>Linux terminal</H>
    <p>Open the terminal and choose <strong>Linux</strong>. The first start downloads Alpine Linux; pick Debian or Ubuntu under Terminal → Linux System. For a full-screen terminal only, use <strong>Terminal mode</strong>. Install software with <code>pkg</code> on any of them:</p>
    <pre><code>{"pkg install nodejs npm python3 git   # apk / apt also work\nnpm create vite@latest my-app\ncd my-app && npm install && npm run dev"}</code></pre>
    <p>Drag with one finger to scroll, pinch to change the text size, long-press for copy and paste.</p>

    <H id={id("cf")}>The cf command</H>
    <p>From any terminal session, <code>cf</code> talks to the editor:</p>
    <div className="tablewrap"><table><thead><tr><th>Command</th><th>What it does</th></tr></thead>
      <tbody>{CF.map(([a, b]) => <tr key={a}><td><code>{a}</code></td><td>{b}</td></tr>)}</tbody></table></div>

    <H id={id("preview")}>Run and preview</H>
    <p>Plain HTML projects use the built-in live server. Projects with a <code>package.json</code> run their <code>dev</code>, <code>start</code> or <code>serve</code> script, and the preview opens when the server prints its address.</p>
    <p>To open the dev server from another device on the same Wi-Fi, turn on <strong>Settings → Live Server → reachable from other devices</strong>, or pass the flag yourself:</p>
    <pre><code>npm run dev -- --host</code></pre>
    <p>Addresses such as <code>localhost:5173</code> in the terminal are links; Settings decide whether they open in the in-app preview or your browser. In the web editor, opening a Vite or React project offers to run it in the browser.</p>

    <H id={id("github")}>GitHub</H>
    <p>Tap the account button and sign in. With a personal access token, <strong>Create token on GitHub</strong> opens the token page with <code>repo</code>, <code>workflow</code>, <code>read:user</code> and <code>user:email</code> already selected. Generate the token, copy it and paste it into CodeForge; it is stored encrypted on the device. Clone, commit, push, pull and branch from the Source Control view, or use <code>git</code> in the Linux terminal.</p>

    <H id={id("ai")}>AI tools</H>
    <p>The Chat tab uses your own API key for Anthropic, OpenAI, Google, OpenRouter or a compatible endpoint. Agent mode can read and edit files and open its own terminals to run commands, and shows a diff before applying changes.</p>
    <p>The Claude Code, Codex, Gemini and Copilot tabs start the official command-line tools in a Linux terminal inside the side bar. They sign in with their own accounts and edit your project directly.</p>

    <H id={id("extensions")}>Extensions</H>
    <p>Search Open VSX in the Extensions view or install a <code>.vsix</code> file. CodeForge shows what each extension contributes and what is supported before you install it.</p>
    <div className="tablewrap"><table><thead><tr><th>Extension feature</th><th>Works in CodeForge</th></tr></thead>
      <tbody>{EXT.map(([a, b]) => <tr key={a}><td>{a}</td><td className={b === "Yes" ? "yes" : ""}>{b}</td></tr>)}</tbody></table></div>
    <p className="note">Extension code runs in a sandbox without network access and can only reach the open project and its own folder. CodeForge asks once before running an extension's code.</p>

    <H id={id("keys")}>Keyboard shortcuts</H>
    <p>With a hardware keyboard (or on a laptop) these work as in VS Code. Every command is also in the command palette.</p>
    <div className="tablewrap"><table><tbody>
      {KEYS.map(([a, b]) => <tr key={a}><td>{a}</td><td><kbd>{b}</kbd></td></tr>)}
    </tbody></table></div>

    <H id={id("security")}>Privacy and security</H>
    <ul>
      <li>No account and no analytics. Your code stays on your device unless you push it or send it to an AI provider you chose.</li>
      <li>API keys and GitHub tokens are stored encrypted. Set a PIN under Security to lock the app and to confirm deleting a project.</li>
      <li>Read the full <Link to="/privacy">privacy statement</Link>.</li>
    </ul>

    <H id={id("faq")}>Questions people ask</H>
    <dl className="faq">
      <dt>Is CodeForge free?</dt><dd>Yes. It is open source under the MIT license, with no account, ads or paid tier.</dd>
      <dt>Do I need to root my phone for Linux?</dt><dd>No. Linux runs through proot as a normal app. The trade-off: no systemd, Docker, kernel modules or ports below 1024.</dd>
      <dt>Which Linux should I pick?</dt><dd>Alpine if you want the smallest download. Debian or Ubuntu if you follow guides written for apt, or need prebuilt binaries that expect glibc.</dd>
      <dt>npm install fails with “symlink” or “EPERM” errors.</dt><dd>The project is in shared device storage, which does not allow symbolic links. Keep Node projects in CodeForge's own storage (the default for new projects).</dd>
      <dt>How do I get a project onto my computer?</dt><dd>Push it to GitHub, or use Export / Compress &amp; export in the Storage Manager to save a ZIP to Downloads.</dd>
      <dt>Can other devices open my dev server?</dt><dd>Yes, on the same Wi-Fi: start it with <code>--host</code> (or turn on the Live Server setting) and open the address it prints, such as <code>192.168.1.20:5173</code>.</dd>
    </dl>

    <H id={id("more")}>Resources</H>
    <div className="res-cards">
      <Link className="new-card" to="/updates"><b>Release notes</b><span className="new-t">What changed in every version.</span></Link>
      <Link className="new-card" to="/blog"><b>Blog</b><span className="new-t">Longer posts about how CodeForge works.</span></Link>
      <Link className="new-card" to="/code"><b>Source code</b><span className="new-t">Browse every file of the project here.</span></Link>
      {c.githubUrl ? <a className="new-card" href={c.githubUrl}><b>GitHub</b><span className="new-t">Issues, discussions and releases.</span></a> : null}
      <Link className="new-card" to="/download"><b>Download</b><span className="new-t">The Android app, checksums and older versions.</span></Link>
      <Link className="new-card" to="/about"><b>About and credits</b><span className="new-t">The open-source projects CodeForge builds on.</span></Link>
    </div>
  </>);
}
