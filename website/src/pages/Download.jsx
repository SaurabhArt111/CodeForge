import { Link } from "react-router-dom";
import { config, url, useApk } from "../lib/site.js";
import CopyBlock from "../components/CopyBlock.jsx";
import { DownloadIcon } from "../components/Layout.jsx";

export default function Download() {
  const c = config(); const apk = useApk(); const ready = !!apk;
  const mb = apk?.size ? (apk.size / 1048576).toFixed(1) + " MB" : null;
  return (<>
    <section className="page-head"><div className="wrap">
      <h1>Download CodeForge</h1>
      <p className="sub" style={{ margin: 0 }}>Version {c.version} for Android 8.0 and newer. Prefer not to install anything? <a href={url("app/")}>Use the web editor</a>.</p>
    </div></section>
    <section style={{ paddingTop: 0 }}><div className="wrap">
      <div className="dl">
        <div>
          <h2 style={{ fontSize: 28 }}>Android APK</h2>
          <p><span className={"status " + (apk === undefined ? "wait" : ready ? "ok" : "wait")}>{apk === undefined ? "Checking…" : ready ? "Ready to download" : "APK not uploaded yet"}</span></p>
          <dl className="meta">
            <dt>Version</dt><dd>{c.version}</dd>
            {apk?.file ? <div style={{ display: "contents" }}><dt>File</dt><dd>{apk.file}</dd></div> : null}
            {mb ? <div style={{ display: "contents" }}><dt>Size</dt><dd>{mb}</dd></div> : null}
            {apk?.sha256 ? <div style={{ display: "contents" }}><dt>SHA-256</dt><dd style={{ font: "13px var(--mono)" }}>{apk.sha256}</dd></div> : null}
            <dt>Needs</dt><dd>Android 8.0+ (arm64, armv7 or x86_64)</dd>
          </dl>
          <a className="btn primary" aria-disabled={!ready} href={ready ? apk.href : undefined} download={ready && !apk.external ? apk.file : undefined}><DownloadIcon /> Download APK</a>
          {apk === null ? <div className="note">The APK has not been uploaded to this site yet. Build it from source (below), or put the file in <code>website/downloads/</code> (or pass <code>APK=/path/to.apk</code>) and run <code>npm run build</code>.</div> : null}
          <h3 style={{ marginTop: 28 }}>Install it</h3>
          <ol className="steps">
            <li>Download the APK on your phone.</li>
            <li>Open it. If Android asks, allow installs from your browser or file manager for this one install.</li>
            <li>Open CodeForge and pick a folder, or create a project. Allow "All files access" only if you want to open folders anywhere on the device.</li>
            <li>Optional: set up the Linux environment from the Terminal menu to get node, npm, python and git.</li>
            <li>Coming from the web editor? Choose <em>File → Import bundle</em> to bring your projects and settings along.</li>
          </ol>
        </div>
        <div>
          <h2 style={{ fontSize: 28 }}>Google Play</h2>
          <p>Install and update through the Play Store once the listing is live.</p>
          <p><a className="badge" aria-disabled={!c.playStoreUrl} href={c.playStoreUrl || undefined}><svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path fill="currentColor" d="M4 2.8v18.4c0 .5.5.8 1 .5l16-9.2c.4-.2.4-.8 0-1L5 2.3c-.5-.3-1 0-1 .5Z" /></svg><span><small>{c.playStoreUrl ? "Get it on" : "Coming soon"}</small><strong>Google Play</strong></span></a></p>
          <h2 style={{ fontSize: 28, marginTop: 40 }}>Web editor</h2>
          <p>Works in Chrome, Edge, Firefox and Safari. Add it to your home screen to use it like an app.</p>
          <p><a className="btn" href={url("app/")}>Open the web editor</a></p>
        </div>
      </div>
    </div></section>
    <section className="tint"><div className="wrap prose">
      <h2>Build it yourself</h2>
      <p>You need JDK 17 and the Android SDK (platform 34, NDK 26). The repository's CI does exactly this on every push.</p>
      <CopyBlock text="./gradlew assembleDebug"><span className="c"># app/build/outputs/apk/debug/</span>{"\n"}<span className="p">$</span> ./gradlew assembleDebug</CopyBlock>
      <p style={{ marginTop: 20 }}>Or download the <a href={url("downloads/CodeForge-source.zip")}>source ZIP</a> and read it in the <Link to="/code">code browser</Link>.</p>
      <h2>What's new in {c.version}</h2>
      <ul>
        <li>Sheets on every side: top, bottom, a fixed-width right sheet and full-screen pages; swipe from the edge for the menu</li>
        <li>A terminal that keeps its size when the keyboard opens, quieter startup, and default text size 12 on phones / 14 on tablets</li>
        <li>AI: a settings page for providers and keys, one-tap Apply with diff review, and edits from coding CLIs show up in the editor and Git</li>
        <li>Open Folder shows your projects; ZIP export lets you leave out node_modules, .git and other folders</li>
        <li>Move projects and settings between the web editor and the app with a <code>.cfbundle</code></li>
        <li>Preview opens the right port again, and the split editor no longer crashes</li>
      </ul>
      <p className="note">Debug builds are signed with a debug key. A release build signed with your own key is what you should publish to Google Play.</p>
    </div></section>
  </>);
}
