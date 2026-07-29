# CodeForge v6.0

A fast, private, browser-based code editor. Upload a project (or a ZIP of one), edit it with
a real code-editing engine, and export it back out — all on your own device. No account, no
login, no server, and nothing is ever uploaded anywhere.

Built on **Monaco** — the actual editor component that powers VS Code — so you get real syntax
highlighting, bracket matching, IntelliSense-style suggestions, minimap, and multi-language
support out of the box.

## Running it

Monaco's editor workers require a real `http://` origin — browsers block them under `file://`.
So don't double-click `index.html`; instead run a tiny local server (both options are 100%
local, nothing leaves your machine):

**Option A — Node (included, zero dependencies):**
```
node server.js
```
Then open **http://localhost:5500**

**Option B — Python:**
```
python3 -m http.server 8080
```
Then open **http://localhost:8080**

**Option C — host it anywhere static:** Netlify, Vercel, GitHub Pages, an S3 bucket, your own
box — it's just static files. Wherever you put it, it keeps working exactly the same way,
because all storage happens in *your browser*, not on whatever server happens to be hosting
the files.

Live Server / Integrated Browser use a service worker, which needs `localhost` or a real HTTPS
origin — both options above satisfy that automatically.

## What it does

- **Multiple projects, switchable like VS Code workspaces** — upload a file, folder, or ZIP
  (or drag one onto the window) and it opens as a **new** project; nothing you already had
  open is erased. A **Projects** panel lists everything you've opened, with one-click switching,
  renaming, and deleting.
- **Everything lives on your device** — files are kept in the browser's IndexedDB. Close the
  tab, come back tomorrow, every project and its open tabs are still there. Nothing is synced
  anywhere; there's no account to log into.
- **GitHub, right from the browser** — a **Source Control** panel lets you import a repo as a
  new project, or link an existing CodeForge project to push to one. See a changed-files list,
  open a full side-by-side diff (Monaco's own diff viewer), discard a single file's changes, and
  **Commit & Push** with your own Personal Access Token — stored only on this device, sent only
  to `api.github.com`, only when you use it.
- **Open with Live Server** / **Open in Integrated Browser** — right-click any `.html` file (or
  use the command palette). "Live Server" opens it in a new browser tab; "Integrated Browser"
  opens it in a preview pane right inside CodeForge, split next to your editor. Both resolve
  everything the page references — relative paths *and* root-absolute ones like `/style.css` or
  `/images/logo.png` — straight out of your project's local storage via a small service worker,
  and both **live-reload** automatically whenever you save.
- **Mobile-first split view** — on a phone, the second editor pane is a hidden drawer: tap
  "Split" in the bottom nav, or just drag the grip handle in from the right edge, the way
  vscode.dev's mobile view works. Drag it back to dismiss it.
- **Mobile bottom nav** — Files / Search / Git / Projects / Split / Commands / Settings,
  replacing the desktop activity bar when the screen is narrow. Full touch support throughout
  (drag handles, long-press for context menus, edge-swipe to open the file drawer).
- **Real editing, not a toy** — tabs with preview mode, split editing, find/replace, multi-file
  search, command palette (`Ctrl+Shift+P`), quick open (`Ctrl+P`), full keyboard navigation in
  the explorer (arrow keys, Enter, F2, Delete), cut/copy/paste and per-folder uploads,
  rename/delete/duplicate, image preview for binary files, adjustable font size/tab
  size/word wrap/minimap/theme.
- **Auto Save** — on by default (debounced ~600ms after you stop typing). Turn it off in
  Settings if you'd rather save explicitly with `Ctrl/Cmd + S`; CodeForge will warn you before
  closing the tab if you have unsaved changes.
- **Colored file & folder icons** — a lightweight color-coded scheme (own icons/colors, not
  a copy of any specific icon theme's artwork) so you can scan a tree by file type at a glance.
- **Copy Path / Copy Relative Path**, horizontally-scrolling file tree for long nested paths,
  and export any project back to a ZIP any time.

## What it deliberately doesn't do

This is a real, working editor — not a rebuild of VS Code itself. To keep it something that
actually runs (rather than a multi-hour native build with no working output), it leaves out
the pieces that come from VS Code's *extension host*: no extension marketplace, no debugger,
no integrated terminal shell. GitHub commit/push/diff works (via GitHub's own REST API), but
there's no full local git (no branching/merging/history graph/staging index) — CodeForge always
compares your files against whatever was last synced from GitHub. Everything else — the editor,
the explorer, the tabs, the multi-language support, the mobile layout — is fully working.

## Keyboard shortcuts

| Action | Shortcut |
|---|---|
| New file | `Ctrl/Cmd + N` |
| Quick open | `Ctrl/Cmd + P` |
| Command palette | `Ctrl/Cmd + Shift + P` |
| Save | `Ctrl/Cmd + S` |
| Find / Replace | `Ctrl/Cmd + F` / `Ctrl/Cmd + H` |
| Toggle sidebar | `Ctrl/Cmd + B` |
| Toggle split editor | `Ctrl/Cmd + \` |

With a file selected in the Explorer: `↑`/`↓` move, `→`/`←` expand/collapse, `Enter` opens,
`F2` renames, `Delete` deletes. The same `↑`/`↓`/`Enter` work in the Source Control changed-files list.

## Using the GitHub integration

1. Open the **Source Control** panel (the branch icon in the activity bar / bottom nav).
2. Paste a [Personal Access Token](https://github.com/settings/tokens/new?scopes=repo) with
   `repo` scope — needed for both reading and writing to repositories.
3. Either **import** a repository (`owner`, `repo`, `branch`) to pull it in as a new project, or
   **link** your current project to an existing repo to start pushing to it.
4. Edit files as usual. The panel shows what's changed; click a file for a full diff.
5. Write a commit message, hit **Commit & Push**. If the remote has moved since you last synced,
   CodeForge tells you rather than overwriting anything — re-link or re-import to catch up.

This talks directly to `api.github.com` using GitHub's REST/Git Data API — there's no server
in between, and your token never goes anywhere except GitHub itself.

## Project structure

```
index.html        the app shell
style.css          all styling (VS Code Dark+ theme)
app.js             all application logic
sw.js               service worker powering Live Server / Integrated Browser preview
server.js          zero-dependency local server (optional convenience)
vendor/vs/         Monaco editor, bundled locally (MIT licensed, by Microsoft)
vendor/jszip.min.js  ZIP read/write, bundled locally (MIT licensed)
```

No build step. Edit `app.js`/`style.css` directly and refresh.

## Privacy

Everything runs client-side. Project files are stored only in this browser's IndexedDB.
This app does not phone home and does not talk to Microsoft or Anthropic. The one exception,
entirely opt-in, is GitHub: if you choose to use the Source Control panel, your browser talks
directly to `api.github.com` using a token you provide — that's between you and GitHub, the
same as using `git` on your own machine would be. Nothing else in CodeForge makes any outside
network call. If you host this app somewhere, whoever hosts it can see that people downloaded
these static files, same as any website — but the files people upload for editing never leave
their browser (except the specific files you choose to push to GitHub).

## About the download size

This build is trimmed to ~1.7MB zipped (down from ~3MB) with one real tradeoff and one
free one:

- **Free:** stripped Monaco's non-English locale strings (we only ever run in English, so
  these were dead weight). Zero effect on anything.
- **One real change:** removed Monaco's TypeScript/JavaScript *language service* worker
  (a ~4.4MB bundle of the TypeScript compiler — by far the single biggest thing in the
  download). Syntax highlighting, editing, and Monaco's own built-in word-based autocomplete
  still work exactly the same for every language, including JS/TS. What's gone is the
  *semantic* layer specifically for JS/TS: type-aware autocomplete, inline red-squiggle type
  errors, and hover tooltips with type info. It's disabled cleanly through Monaco's own
  config API (not just deleted and left to error), so there's nothing broken or noisy about
  it — verified with the same automated test pass used for everything else in this app.

If you'd rather have that back and don't mind the extra ~1MB, it's a two-line revert: remove
the `setModeConfiguration` block near the bottom of `app.js`, then copy `tsWorker.js` from
[the monaco-editor npm package](https://www.npmjs.com/package/monaco-editor) (`min/vs/language/typescript/tsWorker.js`, version 0.45.0) into `vendor/vs/language/typescript/`.

## Renaming your project

Look for "CodeForge" in `index.html` (`<title>`, welcome screen) if you'd like to rebrand it.
