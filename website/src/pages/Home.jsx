import { Link } from "react-router-dom";
import { url } from "../lib/site.js";
import Showcase from "../components/Showcase.jsx";
import { Arrow, DownloadIcon } from "../components/Layout.jsx";

const yes = (t) => <span className="yes">{t}</span>;

export default function Home() {
  return (<>
    <section className="hero"><div className="wrap">
      <div>
        <h1>Write code where you are<span className="caret" aria-hidden="true"></span></h1>
        <p className="lede">CodeForge is a code editor with a real terminal, Git, live preview and AI assistants. Use it as an Android app or straight from your browser: same editor, same shortcuts.</p>
        <div className="actions">
          <a className="btn primary" href={url("app/")}>Open the web editor <Arrow /></a>
          <Link className="btn" to="/download"><DownloadIcon /> Get the Android app</Link>
        </div>
        <p className="fine">No account needed. In the browser your files stay in the browser; in the app they stay on your device.</p>
      </div>
      <div className="stage"><div className="phone"><img src={url("assets/shots/mobile-sheets.jpg")} width="412" height="860" alt="CodeForge on a phone: a terminal in a top sheet, the editor in the middle and an AI chat in a bottom sheet" /></div></div>
    </div></section>

    <section id="ways"><div className="wrap">
      <h2>Three ways in</h2>
      <p className="sub">Pick the one that fits. They share the same interface, so what you learn in one works in the others.</p>
      <div className="doors">
        <div className="door"><h3>Use it in the browser</h3><p>Nothing to install. Create or import a project, edit, search, use Git, run HTML, React and TypeScript projects in a live preview, and chat with an AI model. Add it to your home screen to use it like an app.</p><a className="btn primary" href={url("app/")}>Open the web editor</a></div>
        <div className="door"><h3>Install the Android app</h3><p>Adds what a browser cannot: a full Linux terminal with Node, Python and Git, a live server, access to your device's files, and previews that cannot take the editor down with them.</p><Link className="btn" to="/download">Download</Link></div>
        <div className="door"><h3>Read and build the code</h3><p>CodeForge is open source (MIT). Browse the Kotlin and JavaScript here, download the source, or build the APK yourself with one command.</p><Link className="btn" to="/code">Browse the source</Link></div>
      </div>
    </div></section>

    <section id="features" className="tint"><div className="wrap">
      <h2>Built for a small screen first</h2>
      <p className="sub">Everything below runs in the app today. Pick a topic to see it.</p>
      <Showcase />
      <p style={{ marginTop: 28 }}><Link className="btn" to="/features">See all features</Link> <Link className="btn" to="/docs">Read the docs</Link></p>
    </div></section>

    <section id="move"><div className="wrap prose">
      <h2>Start on the web, continue on your phone</h2>
      <p>Pack your projects and settings into one <code>.cfbundle</code> file from <strong>File → Transfer to another CodeForge</strong>, then open it in the Android app (or the other way round) with <strong>Import bundle</strong>. Nothing goes through a server, and API keys are never included.</p>
    </div></section>

    <section id="compare" className="tint"><div className="wrap">
      <h2>Web or Android: what you get</h2>
      <p className="sub">A browser cannot run Linux programs or listen on ports, so the web editor leaves those out. Everything else is the same code.</p>
      <div className="tablewrap"><table>
        <thead><tr><th scope="col"></th><th scope="col">Web editor</th><th scope="col">Android app</th></tr></thead>
        <tbody>
          <tr><td>Editor, search, themes, snippets</td><td>{yes("Yes")}</td><td>{yes("Yes")}</td></tr>
          <tr><td>Where files live</td><td>In your browser (export a ZIP or bundle to keep them)</td><td>On your device, visible in the Files app</td></tr>
          <tr><td>Terminal</td><td>A small built-in shell</td><td>{yes("Full Linux")} with node, npm, python, git</td></tr>
          <tr><td>Live server and preview</td><td>{yes("Live server in the browser")}: HTML, CSS, JS, React (JSX) and TypeScript, with live reload. Packages load from esm.sh.</td><td>{yes("Live server")} on your device, plus <code>npm run dev</code> (Vite, Next…) with a preview that opens in its own window</td></tr>
          <tr><td>Git</td><td>Yes, clone through a CORS proxy</td><td>{yes("Yes")}, plus git in the terminal</td></tr>
          <tr><td>AI assistants</td><td>{yes("Yes")}, with your own API key</td><td>{yes("Yes")}, keys kept in the Android Keystore</td></tr>
          <tr><td>Extensions</td><td>Themes, icons, snippets, light code extensions</td><td>Same</td></tr>
          <tr><td>Works offline</td><td>After the first visit, when added to the home screen</td><td>{yes("Yes")}</td></tr>
        </tbody>
      </table></div>
    </div></section>

    <section id="faq"><div className="wrap">
      <h2>Questions</h2>
      <details><summary>Is it free?</summary><p>Yes. CodeForge is MIT licensed. The AI features need an API key from the provider you choose, and that provider's pricing applies.</p></details>
      <details><summary>Do I need an account?</summary><p>No. There is no CodeForge account. Your projects and settings stay in your browser or on your device.</p></details>
      <details><summary>Can I move my web projects to the app?</summary><p>Yes. Use File → Transfer to another CodeForge in the web editor, then Import bundle in the app. Projects and settings come along; API keys do not, so add them once in the app's AI settings.</p></details>
      <details><summary>Where do my API keys go?</summary><p>In the Android app they are stored in the Android Keystore and added to requests natively. In the web editor they are stored in your browser, so use the app for anything sensitive.</p></details>
      <details><summary>Why does the app ask for access to all files?</summary><p>So you can open any folder on your device as a project, like a desktop editor. You can also use the system file picker and skip that permission.</p></details>
      <details><summary>Will it be on Google Play?</summary><p>That is planned. Until then, download the APK from the download page and allow installs from your browser or file manager.</p></details>
    </div></section>
  </>);
}
