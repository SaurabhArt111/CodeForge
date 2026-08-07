# CodeForge v6.2

A fast, private, browser-based code editor. Upload a project (or a ZIP of one), edit it with
a real code-editing engine, and export it back out — all on your own device. No account, no
login, and nothing is ever uploaded anywhere.

The editor, file explorer, and project management are a **pure static frontend** — deploy the
`public/` folder (or `dist/` after `npm run build`) to Netlify, Vercel, GitHub Pages, or any
static host, and that's the whole app.

## Terminal

CodeForge also has an integrated Terminal panel (`` Ctrl+` ``, or the terminal icon in the
titlebar / bottom nav), built on [xterm.js](https://xtermjs.org/) — the same terminal engine
VS Code uses. It automatically picks the most capable option available, in this order:

### 1. Run it locally → a real terminal

```
npm install
npm run dev          # or: npm run serve:simple
```

Open the Terminal panel and you get an actual shell (bash/zsh/PowerShell — whatever's on your
machine) rooted in the currently-open project's files, with real `git`, `node`, `npm`, `npx`,
`pnpm`, `bun`, `python`, and anything else on your `PATH`. Run `npm install`, `git status`,
`vite dev`, `next dev`, `node server.js` — whatever the project needs. Multiple tabs, split
view, command history (it's a real shell, so that's just your shell's own history), and
sessions survive a page reload — the shell keeps running on your machine even if you refresh.

If CodeForge detects a dev server starting up (Vite, Next.js, Create React App, Express, …) it
offers to open it right there in the built-in preview pane.

If `node-pty` can't be built on your machine (no C++ build tools installed), CodeForge still
gives you a real shell running real commands — it just won't have a real TTY, so full-screen
apps like `vim` or `htop` won't render correctly. Everything else works fine either way.

**How this works, and what it can see.** Because a browser tab can't spawn OS processes on its
own, this is backed by one small, optional Node process — the same one that already serves the
app locally (`server.js`, or a plugin inside `vite.config.mjs` for `npm run dev`). It:

- **Only ever listens on localhost.** Not reachable from other devices on your network by default.
- **Rejects requests from any other origin.** A malicious page open in another browser tab can't
  reach it — every request is checked against this app's own origin before anything runs.
- **Only touches its own sandboxed workspace folder** (`.codeforge-workspace/`, gitignored).
  Before starting a shell, CodeForge writes the current project's files there (that's the
  "working directory" the shell starts in); path traversal outside that folder is rejected
  server-side, not just hidden in the UI.
- **Never deletes anything it didn't create.** Files real tools generate — `node_modules`,
  `.git`, build output — are left alone even when CodeForge re-syncs your edits to disk; only
  files CodeForge itself previously wrote there are ever cleaned up.
- Use **⤒ Sync to disk** / **⤓ Pull from disk** in the terminal toolbar to control when the
  browser's copy and the on-disk copy exchange changes (pushing also happens automatically
  before a new terminal starts, and periodically while a real session is running). Files with
  unsaved edits open in the editor are never silently overwritten by a pull.

None of this runs, or is even loaded, when no local backend is reachable — including on a
static deploy.

### 2. No local backend reachable (e.g. deployed to Vercel/Netlify) → still real execution, via WebContainers

This is the case that matters most on mobile/tablet, where there's no local machine to run a
backend on at all. If the page loaded [cross-origin isolated](https://webcontainers.io/guides/configuring-headers)
(already set up for Vercel in `vercel.json` and for Netlify/Cloudflare Pages in
`public/_headers`) and the browser supports it, the Terminal panel boots
[WebContainers](https://webcontainers.io/) — an actual Node.js runtime compiled to WebAssembly,
running entirely inside that browser tab. `npm install` really downloads and installs real
packages from the real npm registry; `npm run dev` really starts a real dev server, previewable
right in the app. No server involved anywhere, so it works the same on a phone as a desktop.

Real trade-offs worth knowing before relying on it:
- **No `git`, no Python** — only Node.js/npm execution (`pnpm` mostly works since it's
  Node-based; `bun` doesn't, it isn't Node at all).
- **Mobile Safari support is newer and more memory-constrained** than desktop Chromium/Firefox;
  large projects (a big `node_modules`, for instance) may hit memory limits sooner there.
- **Needs network access** the first time it boots per project (fetching the runtime itself),
  and obviously for anything `npm install` downloads.
- **Only one instance runs at a time** per browser tab — switching which project's terminal is
  "live" tears down and reboots it, with a confirmation first since that stops whatever was
  running.
- **GitHub Pages can't do this at all** — it has no way to set custom response headers, which
  cross-origin isolation requires. CodeForge falls back to the plain simulated shell there
  instead, same as any other unsupported browser/deploy.
- **Licensing**: the `@webcontainer/api` client library (vendored in `public/vendor/webcontainer/`)
  is MIT-licensed, but *using* the WebContainers boot service it talks to is free only for
  personal, open-source, and prototype use — production use in a commercial, for-profit setting
  needs a paid license from StackBlitz. See [webcontainers.io/enterprise](https://webcontainers.io/enterprise).
  This only matters if you deploy CodeForge itself commercially; using your own local copy for
  personal projects is unaffected.

### 3. Neither available → a simulated fallback, so the panel is never just broken

A lightweight in-browser simulated shell (`ls`, `cd`, `cat`, `git status`, etc. against the
project's virtual filesystem) that clearly explains, right there in the terminal, what a real
shell would need — the local backend, or a cross-origin-isolated deploy on a browser that
supports WebContainers.

## Third-party code

See `THIRD_PARTY_LICENSES.md` for what's bundled (Monaco, JSZip, xterm.js, the WebContainers
client SDK) and what the local Terminal backend optionally depends on (`ws`, `node-pty`).

