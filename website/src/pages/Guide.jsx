import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Fluid } from "../components/Fx.jsx";
import DocsBody from "../components/DocsBody.jsx";
import { url } from "../lib/site.js";
import CopyBlock from "../components/CopyBlock.jsx";

const Code = ({ c }) => <CopyBlock text={c}>{c}</CopyBlock>;

// Step-by-step guide with real screenshots. Each picture exists in a dark and a light version and follows the site theme.
const Shot = ({ name, alt, wide = false }) => (
  <figure className={"g-shot" + (wide ? " wide" : "")}>
    {/* width/height reserve the space, so the page does not jump while pictures load */}
    <img className="only-dark" src={url(`assets/guide/${name}-dark.jpg`)} alt={alt} loading="lazy" decoding="async" width={wide ? 1280 : 800} height={wide ? 780 : 1640} />
    <img className="only-light" src={url(`assets/guide/${name}-light.jpg`)} alt={alt} loading="lazy" decoding="async" width={wide ? 1280 : 800} height={wide ? 780 : 1640} />
    <figcaption>{alt}</figcaption>
  </figure>
);

const Step = ({ id, n, title, children, shots }) => (
  <article id={id} className="g-step">
    <div className="g-text"><p className="g-n">Step {n}</p><h2>{title}</h2>{children}</div>
    {shots ? <div className="g-shots">{shots}</div> : null}
  </article>
);

const TOC = [["get", "Get CodeForge"], ["project", "First project"], ["menu", "The menu"], ["modes", "Two modes"], ["terminal", "Terminal mode"],
  ["linux", "Linux systems"], ["server", "Use it like a server"], ["desktop", "Big screens & web"], ["appearance", "Light & dark"], ["storage", "Storage"], ["ai", "AI assistant"], ["limits", "Limits & fixes"],
  ["docs", "Docs & resources"], ["d-files", "Where files live"], ["d-cf", "The cf command"], ["d-preview", "Run & preview"], ["d-github", "GitHub"], ["d-extensions", "Extensions"], ["d-keys", "Shortcuts"], ["d-security", "Privacy & security"], ["d-faq", "FAQ"], ["d-more", "Resources"]];

/** Which step is being read: the last one whose top has passed a line a third of the way down the screen. */
function useSpy(ids) {
  const [cur, setCur] = useState(ids[0]);
  useEffect(() => {
    let raf = 0;
    const measure = () => {
      raf = 0; const line = window.innerHeight * 0.33; let id = ids[0];
      for (const x of ids) { const el = document.getElementById(x); if (el && el.getBoundingClientRect().top <= line) id = x; }
      setCur(id);
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(measure); };
    measure(); window.addEventListener("scroll", on, { passive: true }); window.addEventListener("resize", on);
    return () => { window.removeEventListener("scroll", on); window.removeEventListener("resize", on); cancelAnimationFrame(raf); };
  }, [ids]);
  return cur;
}

function Toc({ cur }) {
  const bar = useRef(null);
  // keep the current chip visible in the phone chip bar: scroll only the bar sideways, never the page
  useEffect(() => { const el = bar.current, a = el?.querySelector("[aria-current=true]"); if (el && a && el.scrollWidth > el.clientWidth) el.scrollTo({ left: a.offsetLeft - el.clientWidth / 2 + a.offsetWidth / 2 }); }, [cur]);
  const at = TOC.findIndex(([id]) => id === cur);
  return (<nav className="g-toc" aria-label="On this page" ref={bar}>
    <p className="g-toc-h">On this page</p>
    <div className="g-toc-track"><i style={{ height: `${((at + 1) / TOC.length) * 100}%` }} /></div>
    {TOC.map(([id, t], n) => <a key={id} href={"#" + id} aria-current={id === cur} className={n === 12 ? "g-toc-part" : n > 12 ? "g-toc-sub" : ""}><span>{n < 12 ? n + 1 : n === 12 ? "" : "·"}</span>{t}</a>)}
  </nav>);
}
const IDS = TOC.map(([id]) => id);

export default function Guide() {
  const cur = useSpy(IDS);
  return (<>
    <section className="page-head has-fx guide-head"><Fluid /><div className="wrap prose">
      <p className="eyebrow">Guide</p>
      <h1>Learn CodeForge in twelve steps</h1>
      <p className="sub" style={{ margin: 0 }}>From installing CodeForge to running a full Linux terminal on your phone. Every picture is a real screen from the app, and follows the light or dark theme you picked.</p>
      <div className="actions" style={{ marginTop: 24 }}><a className="btn primary" href="#get">Start reading</a><a className="btn" href="#terminal">Jump to Terminal mode</a></div>
    </div></section>

    <section style={{ paddingTop: 0 }}><div className="wrap g-layout"><Toc cur={cur} /><div className="g-list">
      <Step id="get" n={1} title="Get CodeForge">
        <p>There are two ways to use CodeForge, and they look the same:</p>
        <ul>
          <li><strong>Android app</strong>: everything, including a real Linux terminal, device storage and sessions that keep running in the background. <Link to="/download">Download the APK</Link>.</li>
          <li><strong>Web editor</strong>: opens in any modern browser with nothing to install. It has the editor, Git, AI and an in-browser preview, but only a small built-in shell instead of Linux. <a href={url("app/")}>Open the web editor</a>.</li>
        </ul>
        <p>No account is needed for either.</p>
      </Step>

      <Step id="project" n={2} title="Open or create a project"
        shots={<Shot name="phone-editor" alt="A React file open in the editor on a phone" />}>
        <p>On the start screen choose <strong>Open Folder</strong>, <strong>New Project</strong> (HTML, Node, Python, Vite…), <strong>Open ZIP Project</strong> or <strong>Clone Repository</strong>.</p>
        <p>Files open in tabs. The editor is the same one VS Code uses, with completions, multi-cursor, search and replace, and formatting. The bottom bar switches between Files, Search, Editor, Terminal and More.</p>
        <p>Tap <strong>▶</strong> in the top bar to run the current file or start the project's dev server; the preview opens when the server prints its address.</p>
      </Step>

      <Step id="menu" n={3} title="The menu"
        shots={<Shot name="phone-menu" alt="The main menu with the project header and quick-access tiles" />}>
        <p>Tap <strong>☰</strong> (top left) for the main menu. At the top is the current project with <strong>Close folder</strong> and <strong>Switch</strong>. Below that are quick tiles: Storage, Tasks, Security, Extensions, AI, Terminal, Search and Settings. Every desktop menu (File, Edit, View, Run, Terminal…) is underneath.</p>
        <p>Type in the search box to find any menu item or command. On a keyboard, <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> opens the command palette.</p>
      </Step>

      <Step id="modes" n={4} title="Two modes: CodeForge All and Terminal">
        <p>CodeForge can be used in two ways, and you can switch at any time:</p>
        <div className="tablewrap"><table>
          <thead><tr><th>Mode</th><th>What you see</th><th>Switch to it</th></tr></thead>
          <tbody>
            <tr><td>CodeForge All</td><td>The full IDE: files, editor, AI assistant, Git, preview and terminal panels.</td><td>Tap <strong>IDE</strong> in Terminal mode</td></tr>
            <tr><td>Terminal mode</td><td>Only the terminal, full screen, like Termux: session tabs, a session drawer and an extra-keys row.</td><td>Menu → <strong>Terminal</strong> tile, View → Terminal Mode, or <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>T</kbd></td></tr>
          </tbody>
        </table></div>
        <p>Both modes use the same sessions: a server you start in Terminal mode is still running when you go back to the IDE, and the other way round. CodeForge opens in the mode you used last.</p>
      </Step>

      <Step id="terminal" n={5} title="Terminal mode"
        shots={<><Shot name="phone-term" alt="Terminal mode running commands" /><Shot name="phone-term-drawer" alt="The session drawer" /></>}>
        <p>The first time, Terminal mode offers to <strong>install Linux</strong> or to use the plain Android shell. After that it opens straight into a session.</p>
        <ul>
          <li><strong>+</strong> opens another session; tap a numbered tab to switch.</li>
          <li><strong>☰</strong> opens the drawer: all sessions (rename or close them), new sessions, the Linux system, package setup and appearance.</li>
          <li><strong>⋮</strong> has paste, select all, clear, find, kill session and text size.</li>
          <li>The extra-keys row gives you <kbd>Esc</kbd> <kbd>Tab</kbd> <kbd>Ctrl</kbd> <kbd>Alt</kbd>, arrows, Home/End, PgUp/PgDn and symbols. Tap <kbd>Ctrl</kbd> and then a letter for <kbd>Ctrl</kbd>+letter (for example <kbd>Ctrl</kbd> then <kbd>C</kbd>).</li>
          <li>Pinch to change the text size, drag to scroll, long-press to copy and paste. Links and addresses like <code>localhost:5173</code> can be tapped.</li>
        </ul>
      </Step>

      <Step id="linux" n={6} title="Choose your Linux: Alpine, Debian or Ubuntu"
        shots={<><Shot name="phone-term-welcome" alt="Terminal mode's start screen" /><Shot name="phone-distros" alt="The Linux system picker" /></>}>
        <p>Open the drawer → <strong>Linux system</strong> (or Terminal → Linux System in the IDE). You can install several and switch between them; new sessions use the one marked <em>in use</em>, and all of them share your workspace at <code>~</code>.</p>
        <div className="tablewrap"><table>
          <thead><tr><th>System</th><th>Download</th><th>Packages</th><th>Good for</th></tr></thead>
          <tbody>
            <tr><td>Alpine Linux</td><td>~4 MB</td><td>apk</td><td>Small and fast. Uses musl, so a few prebuilt binaries made for other systems do not run.</td></tr>
            <tr><td>Debian 12</td><td>~30 MB</td><td>apt</td><td>The classic server system; most Linux guides work as written.</td></tr>
            <tr><td>Ubuntu 24.04 LTS</td><td>~30 MB</td><td>apt</td><td>Matches most tutorials and VPS setups.</td></tr>
          </tbody>
        </table></div>
        <p>The same <code>pkg</code> command works on all three. On Debian and Ubuntu it uses apt and translates common Alpine package names for you:</p>
        <Code c={"pkg install nodejs npm python3 git   # install\npkg search postgres                   # find packages\npkg upgrade                           # update everything\npkg list                              # what is installed\npkg remove vim                        # uninstall"} />
        <p><code>apk</code> and <code>apt</code> work directly as well.</p>
      </Step>

      <Step id="server" n={7} title="Use it like a server or VPS">
        <p>Inside the Linux system you are root (through proot), so you can install and run what you would on a small server:</p>
        <Code c={"# a Node app\npkg install nodejs npm\nnpm create vite@latest web && cd web && npm install\nnpm run dev -- --host          # open it from other devices on your Wi-Fi\n\n# Python\npkg install python3 py3-pip\npython3 -m http.server 8000\n\n# connect to your real VPS\npkg install openssh-client\nssh user@your-server.com\n\n# keep long jobs organised\npkg install tmux\ntmux new -s work"} />
        <p>Sessions keep running when you switch apps; a notification shows that CodeForge is working. The <code>cf</code> command talks to the editor from any session: <code>cf open file.js:12</code>, <code>cf preview index.html</code>, <code>code .</code> to open the current folder in the IDE.</p>
      </Step>

      <Step id="desktop" n={8} title="Big screens and the web editor"
        shots={<Shot wide name="desktop-ide" alt="CodeForge on a wide screen: explorer, editor and terminal" />}>
        <p>On tablets, Chromebooks and in the web editor CodeForge shows the desktop layout: a menu bar, the explorer, split editors and panels you can move to the bottom, the right or full screen.</p>
        <p>In the web editor, opening a Node, Vite or React project asks whether to run it in the browser. Projects that need a real server (Next.js, Express…) get an explanation instead, because a browser cannot run them.</p>
      </Step>

      <Step id="appearance" n={9} title="Light, dark or follow the system"
        shots={<Shot wide name="desktop-appearance" alt="The Appearance picker: System, Light, Dark or a fixed theme" />}>
        <p>CodeForge follows your phone's light or dark setting by default and switches with it. To choose yourself: View → <strong>Appearance</strong>, the drawer in Terminal mode, or Settings → Appearance.</p>
        <ul>
          <li><strong>System</strong>: light by day, dark at night (whatever your phone does).</li>
          <li><strong>Light</strong> / <strong>Dark</strong>: always that, using the themes picked in Settings (Light Modern and Dark Modern by default).</li>
          <li><strong>Fixed theme</strong>: one colour theme all the time, such as Monokai or Solarized, including themes from extensions.</li>
        </ul>
        <p>This website has the same switch: the button in the top bar, or the choice at the bottom of every page.</p>
      </Step>

      <Step id="storage" n={10} title="See and free storage"
        shots={<Shot name="phone-storage" alt="The Storage Manager" />}>
        <p>Menu → <strong>Storage</strong> shows what uses space: projects, node_modules, Linux systems, package caches, extensions and more, each with what is safe to clear. <strong>Clean</strong> removes caches and temporary files. Each Linux system you installed is listed and can be removed.</p>
      </Step>

      <Step id="ai" n={11} title="AI assistant">
        <p>Open the AI side bar (✦ in the top bar, or the AI tile in the menu) and add an API key for Claude, OpenAI, Gemini or another provider in its settings. Ask questions about the open file, or switch to <strong>Agent</strong> mode: the assistant then edits files and can open terminals of its own to install tools, run builds and tests, always showing what it does.</p>
        <p>Command-line agents such as Claude Code, Codex and Gemini CLI run in the Linux terminal: <code>cf install claude</code>.</p>
      </Step>

      <Step id="limits" n={12} title="Limits and fixes">
        <p>CodeForge runs Linux with proot, without rooting your phone. That covers almost everything a developer needs, but not the parts that need a real kernel or real root:</p>
        <ul>
          <li>No <code>systemd</code> or service managers: start servers yourself (or in <code>tmux</code>).</li>
          <li>No Docker, kernel modules, VPNs or firewall rules.</li>
          <li>Ports below 1024 may be refused; use 3000, 5173, 8000 and so on.</li>
          <li>Programs run a little slower than natively because every system call goes through proot.</li>
        </ul>
        <p><strong>Something broke?</strong> Remove and reinstall the system from the Linux system picker; your projects in <code>~</code> are not touched. Help → Crash Reports and Diagnostics collect details you can attach to a bug report.</p>
        <p>More detail is in the <Link to="/docs">Docs</Link>.</p>
      </Step>

      <article id="docs" className="g-part">
        <p className="g-n">Part 2</p>
        <h2>Docs and resources</h2>
        <p className="sub">Reference for when you know the basics: where files live, every <code>cf</code> command, previews, GitHub, extensions, shortcuts and links. The same text is on the <Link to="/docs">Docs</Link> page.</p>
        <div className="prose g-docs"><DocsBody idp="d-" heading="h3" /></div>
      </article>
    </div></div></section>
  </>);
}
