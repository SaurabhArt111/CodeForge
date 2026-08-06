# CodeForge v6.1

A fast, private, browser-based code editor. Upload a project (or a ZIP of one), edit it with
a real code-editing engine, and export it back out — all on your own device. No account, no
login, and nothing is ever uploaded anywhere.

The editor, file explorer, and project management are a **pure static frontend** — deploy the
`public/` folder (or `dist/` after `npm run build`) to Netlify, Vercel, GitHub Pages, or any
static host, and that's the whole app.

## Terminal

CodeForge also has an integrated Terminal panel (`` Ctrl+` ``, or the terminal icon in the
titlebar / bottom nav), built on [xterm.js](https://xtermjs.org/) — the same terminal engine
VS Code uses.

**Run it locally and it's a real terminal:**

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

**Deploy it statically (no Node available) and it falls back automatically:** a lightweight
in-browser simulated shell (`ls`, `cd`, `cat`, `git status`, etc. against the project's virtual
filesystem) so the panel is never just broken — it clearly explains that real `git`/`npm`/etc.
need the local backend, with instructions right there in the terminal.

A third, in-between case: if `node-pty` can't be built on your machine (no C++ build tools
installed), CodeForge still gives you a real shell running real commands — it just won't have a
real TTY, so full-screen apps like `vim` or `htop` won't render correctly. Everything else
(git, npm, node scripts, build tools) works fine either way.

### How this works, and what it can see

Because a browser tab can't spawn OS processes on its own, the local terminal is backed by one
small, optional Node process — the same one that already serves the app locally
(`server.js`, or a plugin inside `vite.config.mjs` when using `npm run dev`). It:

- **Only ever listens on localhost.** It's not reachable from other devices on your network by
  default.
- **Rejects requests from any other origin.** A malicious page open in another browser tab
  can't reach it — every request is checked against this app's own origin before anything runs.
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

None of this runs, or is even loaded, in a static deploy.

## Third-party code

See `THIRD_PARTY_LICENSES.md` for what's bundled (Monaco, JSZip, xterm.js) and what the local
Terminal backend optionally depends on (`ws`, `node-pty`) — all MIT-licensed.
