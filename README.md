# CodeForge — a native Android code editor / IDE

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
- **Run & Preview** – run files by extension, `package.json` scripts, `tasks.json`; a **live server** (hot reload via SSE, SPA mode, console
  forwarding, optional LAN access) and an **in-app preview** with device-size presets and a console.
- **Git** – isomorphic-git (clone, stage, commit, branches, log, diff, pull, push) with gutter decorations. `git@github.com:` URLs are mapped to HTTPS.
- **GitHub login** – OAuth Device Flow (needs your client id, see BUILD.md) or a Personal Access Token. Tokens live in the Android Keystore
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
- **Web version** – `tools/web/build.sh` builds a static PWA from the same UI (see BUILD.md): IndexedDB file system, ZIP import/export,
  Monaco, Git over CORS-enabled hosts, extensions, AI, a mini shell. No real Linux, npm, live server or GitHub device flow in a browser.
- **Plugins** – small JS plugins in sandboxed iframes with a permission model (editor, ui, commands, fs.read, fs.write, terminal, net:host).
- **AI** – chat and an agent mode (read/search/edit files, run commands with confirmation) with **Anthropic**, **OpenAI**, **GitHub Models**, Gemini,
  OpenRouter, Groq, Mistral, DeepSeek, xAI, Ollama or any OpenAI-compatible endpoint. One-tap helpers install and run the CLIs
  (Claude Code, Codex, Copilot CLI, Gemini CLI, aider) inside the Linux terminal.

## Build
See **BUILD.md**. Short version: `./gradlew assembleDebug`.

## Honest limitations
- This source drop has **not been compiled into an APK or run on a device by its author's tooling** (the build sandbox had no Android SDK / Maven access).
  The Kotlin was type-checked against the Android 34 API, and the whole web UI was tested end-to-end in headless Chromium against the dev host
  (`tools/devhost`), which emulates the native bridge. Expect to fix small compile/runtime issues on first build.
- The proot Linux environment, PTY, DocumentsProvider and GitHub device flow are untested on real hardware.
- GitHub Copilot's private chat API is not implemented; use **GitHub Models** (free tier with a PAT) or the **Copilot CLI** helper.
- The extension host is a **best-effort subset** of the VS Code API with no Node.js; many popular extensions (language servers, debuggers, anything
  using webviews or `child_process`) will load but not work. Check *Output → Extension: <name>* for what a given extension tried to use.
- Biometrics, the app lock, `FLAG_SECURE`, the splash/adaptive icon on real devices and the proot/PTY paths could only be type-checked / emulated here.
- The web version keeps files in the browser (clearing site data deletes them — export ZIPs). Its encryption of stored keys protects against
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
```
Licenses: MIT (see LICENSE); third-party in THIRD_PARTY_NOTICES.md.
