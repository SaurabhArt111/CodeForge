import { config } from "../lib/site.js";

export default function Privacy() {
  const c = config();
  return (<>
    <section className="page-head"><div className="wrap prose">
      <h1>Privacy</h1>
      <p className="sub" style={{ margin: 0 }}>Short version: CodeForge has no account and no analytics, and your code stays with you.</p>
    </div></section>
    <section style={{ paddingTop: 0 }}><div className="wrap prose">
      <h2>What stays on your device</h2>
      <p>Projects, settings, chat history and crash reports are stored on your device (Android app) or in your browser (web editor). CodeForge does not upload them to a CodeForge server, and this website does not run analytics.</p>
      <h2>What leaves your device, and only when you ask</h2>
      <ul>
        <li><strong>AI features.</strong> When you send a message, the text and any files or selections you attach go to the AI provider you picked, using your own API key. Their privacy policy applies.</li>
        <li><strong>Git, extensions and downloads.</strong> Cloning, pushing, searching Open VSX or installing packages contacts those services directly. In the web editor, Git can go through a CORS proxy you configure.</li>
        <li><strong>Links you open</strong> in the browser or preview.</li>
        <li><strong>Transfer bundles.</strong> A <code>.cfbundle</code> is a file you save yourself; it holds your projects and settings but never your API keys.</li>
      </ul>
      <h2>API keys</h2>
      <p>The Android app keeps keys in the Android Keystore and adds them to requests natively. The web editor keeps them in your browser storage, which is less protected.</p>
      <h2>Crash reports</h2>
      <p>Reports contain error text, memory figures and recent in-app actions (such as file names). They are saved locally. You choose whether to copy or share one.</p>
      <h2>Permissions (Android)</h2>
      <p>Files access (optional) to open folders on your device, network access for the features above, and biometrics if you turn on the app lock.</p>
      <h2>Contact</h2>
      <p>Questions about this policy: {c.contactEmail ? <a href={"mailto:" + c.contactEmail}>{c.contactEmail}</a> : <span className="muted">add a contact address with the <code>CONTACT_EMAIL</code> setting.</span>}</p>
      <p className="note">This page describes how the software is designed. If you publish CodeForge or a modified version, review it against your own build and your jurisdiction's requirements.</p>
    </div></section>
  </>);
}
