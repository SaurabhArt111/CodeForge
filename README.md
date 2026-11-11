# CodeForge , a native Android code editor / IDE

A real Android application (Kotlin, package `dev.codeforge.ide`, minSdk 26) with a VS Code-style workbench:
Monaco editor, project explorer, real shell terminals, Git, live server + in-app preview, extensions, plugins and AI assistants.

## What you get
- **System-level storage** – "All files access" for any folder on the device, a Storage Access Framework picker, and a
  `DocumentsProvider` so the **Files app and other apps can see CodeForge's workspace**. Open any folder, **ZIP archives** (open as project,
  extract, compress), import/export to the device, share files.
- **Explorer** – lazy tree, inline create/rename, drag & drop, cut/copy/paste, multi-select, context menu, Git decorations, recents.
- **Editor** – Monaco with split view, tabs, diff, find/replace, multi-file search, Emmet, VS Code snippets & language configs,
  Prettier formatting (JS/TS/CSS/HTML/JSON/MD/YAML), themes (VS Code defaults + Termux:Styling schemes), Seti file icons.
- **Terminal** – native PTY sessions (JNI). Android shell by default; optionally a full **Alpine Linux via proot** (apt-style `apk`,
  `git`, `node`, `npm`, `python`, `gcc`, …). Extra-keys bar for phones. The `code <path>` command opens files/folders in the editor.
- **Links** – `localhost:5173`, `0.0.0.0:8000`, `192.168.x.x:3000` (with or without `http://`) are clickable and tappable in the terminal and open in the browser (0.0.0.0 becomes localhost); ports printed by servers are detected.
  *Run* on the `index.html` of a Vite/React/Next project starts the project's dev server and opens it automatically.
- **Run & Preview** – run files by extension, `package.json` scripts, `tasks.json`; a **live server** (hot reload via SSE, SPA mode, console
  forwarding, optional LAN access) and an **in-app preview** with device-size presets and a console.
- **Git** – isomorphic-git (clone, stage, commit, branches, log, diff, pull, push) with gutter decorations. `git@github.com:` URLs are mapped to HTTPS.
- **GitHub login** – OAuth Device Flow (needs your client id, see BUILD.md) or a Personal Access Token (the sign-in dialog has a **Create token on GitHub** button that opens the token page with the right permissions ticked). Tokens live in the Android Keystore
  and are injected natively into requests, so scripts and extensions never see them.
- **Extensions** – search/install from **Open VSX** or a local `.vsix`. Declarative parts are applied: themes, icon themes, snippets, language
  configuration, `configuration` (editable per-extension settings), `configurationDefaults`, `jsonValidation`, `%nls%` strings, and commands in the palette.
  Extension **code** (`browser`/`main`) runs in a sandboxed **lite extension host**: one Worker per extension with a `vscode` API subset
  (commands, messages/input/quick-pick, status bar, output channels, text edits, decorations, diagnostics, completion/hover/format/definition providers,
  scoped workspace files). You are asked once per extension before its code runs. Webviews, tree views, debuggers, language servers and native Node modules are not supported.
- **Security** – API keys are stored in the Android Keystore; the key list shows masked previews, and **viewing a key requires your app PIN or
  device biometrics/credential** (PBKDF2 PIN with lockout, 90 s unlock). Optional app lock and "hide from screenshots / recents".
- **Touch-friendly workbench** – draggable sidebar/panel/split sashes with big touch targets, long-press context menus, pinch-to-zoom terminal, Undo/Redo
  buttons in the title bar, a Shift key on the key bar (sticky; extends selection in the editor), animated splash and loaders.
- **Links** – vite/webpack `o` + Enter, `xdg-open`, `$BROWSER` and `open` open your **default Android browser** (node's spawn of those helpers is intercepted, so no
  exec errors under proot). Selecting a URL in the terminal or editor (or long-pressing one in the terminal) offers *Open in browser / Preview / Copy*.
  *Settings → Appearance → Open links with* can keep local URLs in the in-app preview instead.
- **Web version** – `tools/web/build.sh` builds a static PWA from the same UI (see BUILD.md): IndexedDB file system, ZIP import/export,
  Monaco, Git over CORS-enabled hosts, extensions, AI, a mini shell, and an **in-browser live server** (service worker, `tools/web/live-sw.js`): HTML/CSS/JS, JSX/TSX/TS compiled on the fly (Sucrase),
  npm packages from `package.json` mapped to esm.sh, live reload, console capture; `npm run dev` / `vite` in the mini shell start it. No real Linux, Node, server code or GitHub device flow in a browser.
- **Crash recorder** – uncaught Kotlin/JS errors, renderer deaths, out-of-memory and Android's own "why was I killed" history (`ApplicationExitInfo`) are saved on the
  device with the stack, memory state, logcat tail and the last actions (breadcrumbs). *Settings → Diagnostics → View reports* (or the notice shown after a crash) lets you
  copy / share them. `cf crashes` opens the list.
- **Crash-proof previews** – *Run ▸ Live Preview / Preview HTML* open the page in a **separate process** (`:preview`), so a heavy WebGL page, an infinite loop or a
  renderer crash can only close that window, not the editor. The live server throttles console forwarding, the terminal uses flow control (a program that floods
  the screen is slowed down instead of freezing the app) and the in-app preview is paused when Android reports low memory. *Settings → Live Server → Run / Live Preview
  opens in* picks window / in-app panel.
- **Top and bottom sheets** – two dockable sheets, each holding any views: Terminal, Preview, Output, Problems, AI, Search, Git, Run, Extensions. Use the **+** in a
  sheet's header (or long-press a tab) to add, move or close views; the layout is remembered. Palette: *Move Terminal to Top Sheet*, *Reset Sheets Layout* …
- **Extension views** – extensions that contribute a container (`viewsContainers` / `views` / `viewsWelcome`) get their icon in the activity bar and the phone drawer. Tree views (`registerTreeDataProvider`, `createTreeView`), webview views (`registerWebviewViewProvider`) and webview panels run in a sandboxed frame with `acquireVsCodeApi`, theme variables and no network. Extensions that need desktop Node.js still appear, with a note saying why they cannot start.
- **AI side bar tabs** – *Chat · Claude Code · Codex · Gemini · Copilot*. The CLI tabs run the official tools in their own Linux terminal inside the side bar (installed on first use via `cf run`).
- **Terminal touch scrolling** – one-finger drag with a short glide; inside full-screen programs the drag is sent as wheel / arrow keys.
- **`-- --host`** – *Settings → Live Server → reachable from other devices* starts npm dev servers with `-- --host`.
- **About** – *Help → About CodeForge*: credits (VS Code, Termux, Acode, Monaco, xterm.js, PRoot/Alpine, isomorphic-git, Open VSX) and the independence note. Same page on the website.
- **Keyboard on your terms** – on touch devices tapping the editor or terminal places the cursor and offers an **Open keyboard** prompt instead of popping the keyboard up (Settings → Appearance → *On-screen keyboard*: `ask` / `auto`). A **floating keyboard button** you can drag anywhere opens and closes it (long-press for options); Android's back button closes an open keyboard first.
- **Unsaved work is protected** – back (or *Quit*) with unsaved files asks *Save all & leave / Leave without saving / Stay*; with nothing unsaved the app simply goes to recents. In the browser the tab-close prompt does the same.
- **VS Code-style layout** – side bar on the left, the **AI Assistant in the right ("secondary") side bar**, Terminal & friends in the bottom panel; the three toggles are in the title bar on wide screens. Right-click / long-press any view's icon (activity bar or phone drawer) for *Move to Right Sheet / Bottom / Top / Page / Sidebar*; *Reset Layout* restores the defaults. On phones ☰ opens File, Edit, Selection, View, Go, Run, Terminal, Help.
- **Text size everywhere** – *Settings → Appearance → Text size* (70–170 %) scales the whole UI, the editor and the terminal together; editor and terminal sizes stay
  adjustable on top. `View: Increase Text Size (whole app)` in the palette.
- **`cf` command** – in any terminal: `cf open file:line`, `cf preview index.html`, `cf serve`, `cf ai "explain this"` / `git diff | cf ai -s review`, `cf install claude|codex|gemini|opencode|copilot|qwen|aider`,
  `cf run <cli>`, `cf settings`, `cf toast`. Works in the Linux environment and the Android shell (`cf help`).
- **Plugins** – small JS plugins in sandboxed iframes with a permission model (editor, ui, commands, fs.read, fs.write, terminal, net:host).
- **AI** – chat and an agent mode (find/read/search/edit/delete files, diagnostics, run commands; edits are shown as a diff and can be allowed for the whole chat;
  read-only tools run in parallel, transient errors are retried, long runs trim old tool output, `AGENTS.md` / `CLAUDE.md` of the project are used as instructions, replies can be regenerated, shell blocks run in the terminal) with **Anthropic**, **OpenAI**, **GitHub Models**, Gemini,
  OpenRouter, Groq, Mistral, DeepSeek, xAI, Ollama or any OpenAI-compatible endpoint. One-tap helpers install and run the CLIs
  (Claude Code, Codex, Copilot CLI, Gemini CLI, opencode, Qwen Code, aider) inside the Linux terminal.

## Build
See **BUILD.md**. Short version: `./gradlew assembleDebug`.

## Website (React + Node: landing page, web editor, code browser, download page)
```sh
cd website && npm install
npm run build        # -> website/dist   (React site, /app web editor, code data, source ZIP, APK if available)
npm start            # http://localhost:8080  (Node 18+ server: static files, Git CORS proxy, env-driven config)
```
Pages: `/` landing, `/features`, `/docs`, `/updates` (release notes), `/blog`, `/about`, `/app/` web editor, `/code` source browser, `/download` APK + Google Play (set `playStoreUrl` in `website/public/site-config.js` or `PLAY_STORE_URL` when you have the link), `/privacy`.
See **DEPLOY.md** for static hosting, Docker, environment variables and the Git proxy, and **Site.md** for how the site is organised. Tests: `tools/e2e/site.js`.

## Honest limitations
- This source drop has **not been compiled into an APK or run on a device by its author's tooling** (the build sandbox had no Android SDK / Maven access).
  The Kotlin of earlier versions was type-checked against the Android 34 API; the **crash recorder, `:preview` process, PTY flow control and live-server changes of this
  version were only parse-checked and reviewed** (no Android jar was available) , expect to fix small compile errors on first build. The whole web UI was tested end-to-end in headless Chromium against the dev host
  (`tools/devhost`), which emulates the native bridge. Expect to fix small compile/runtime issues on first build.
- The proot Linux environment, PTY, DocumentsProvider and GitHub device flow are untested on real hardware.
- GitHub Copilot's private chat API is not implemented; use **GitHub Models** (free tier with a PAT) or the **Copilot CLI** helper.
- The extension host is a **best-effort subset** of the VS Code API with no Node.js; many popular extensions (language servers, debuggers, anything
  using webviews or `child_process`) will load but not work. Check *Output → Extension: <name>* for what a given extension tried to use.
- Biometrics, the app lock, `FLAG_SECURE`, the splash/adaptive icon on real devices and the proot/PTY paths could only be type-checked / emulated here.
- The web version keeps files in the browser (clearing site data deletes them , export ZIPs). Its encryption of stored keys protects against
  casual inspection only; use the Android app for real key storage.
- Open VSX could not be reached from the build sandbox; the install path was tested against a mock registry.
- Google Play restricts "All files access"; this build targets sideloading.

## Layout
```
app/src/main/java/dev/codeforge/ide/   Kotlin: bridge, PTY sessions, FS/search/zip, secrets, GitHub auth, live server, DocumentsProvider
app/src/main/cpp/                      JNI pty
app/src/main/assets/www/               the IDE UI (ES modules, vendored libs in vendor/)
app/src/main/assets/env/               Linux setup scripts
tools/devhost, tools/e2e               Node dev host + Playwright tests
tools/web                              build script, PWA manifest and service worker for the web version
website/                               React (Vite) site, Node server (static files + Git CORS proxy), build scripts
```
Licenses: MIT (see LICENSE); third-party in THIRD_PARTY_NOTICES.md.
