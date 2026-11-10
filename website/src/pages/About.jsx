import { config } from "../lib/site.js";

const INSPIRED = [
  ["Visual Studio Code", "https://code.visualstudio.com", "The workbench layout, command palette, settings, extension model and shortcuts that CodeForge follows."],
  ["Termux", "https://termux.dev", "Showed that a real Linux userland on Android is practical."],
  ["Acode", "https://acode.app", "A code editor made for phones. CodeForge's Linux launcher is adapted from Acode's sandbox script (MIT)."],
];
const BUILT = [
  ["Monaco Editor", "https://microsoft.github.io/monaco-editor/", "The editor component of VS Code (MIT)."],
  ["xterm.js", "https://xtermjs.org", "Terminal emulator (MIT)."],
  ["PRoot and Alpine Linux", "https://proot-me.github.io", "The Linux environment that runs without root."],
  ["isomorphic-git", "https://isomorphic-git.org", "Git in JavaScript (MIT)."],
  ["Open VSX", "https://open-vsx.org", "The open registry that extensions are installed from."],
  ["Codicons and Seti icons", "https://github.com/microsoft/vscode-codicons", "Interface and file icons."],
  ["Emmet, Prettier, marked, JSZip", "https://prettier.io", "Abbreviations, formatting, Markdown and archives."],
  ["React, Vite and Node.js", "https://react.dev", "This website."],
];
const List = ({ rows }) => <ul>{rows.map(([n, u, d]) => <li key={n}><a href={u} rel="noreferrer">{n}</a>. {d}</li>)}</ul>;

export default function About() {
  const c = config();
  return (<>
    <section className="page-head"><div className="wrap prose">
      <h1>About CodeForge</h1>
      <p className="sub" style={{ margin: 0 }}>A code editor and development environment for phones, tablets and the browser.</p>
    </div></section>
    <section style={{ paddingTop: 0 }}><div className="wrap prose">
      <p>CodeForge puts an editor, a terminal with real Linux, Git and GitHub, live preview, extensions and an AI assistant into one app, so a project can be started, run and pushed from a phone.</p>
      <p>It is an independent, MIT-licensed project. It is not made by, affiliated with or endorsed by Microsoft, and it is not a copy of Visual Studio Code. The interface is written from scratch for touch screens on top of the open-source work listed here.</p>
      <h2>Inspired by</h2><List rows={INSPIRED} />
      <h2>Built with</h2><List rows={BUILT} />
      <h2>Where it runs</h2>
      <ul>
        <li><strong>Android 8.0 and newer</strong>: phones, tablets, foldables and Chromebooks, as an app with the Linux terminal.</li>
        <li><strong>Windows, macOS, Linux, iPadOS and ChromeOS</strong>: the web editor in any current browser, installable as a PWA.</li>
      </ul>
      <h2>Licenses</h2>
      <p>CodeForge is MIT licensed. Third-party notices are in <code>THIRD_PARTY_NOTICES.md</code> in the source{c.githubUrl ? <> on <a href={c.githubUrl}>GitHub</a></> : null}.</p>
      <p className="note">Visual Studio Code, Termux, Acode and the other names on this page belong to their owners and are mentioned only to give credit.</p>
    </div></section>
  </>);
}
