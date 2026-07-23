# CodeForge v5.0

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

- **Upload a ZIP and it opens as a project** — drag one onto the window, or use the ZIP button
  in the Explorer toolbar. Folders and plain file uploads work too.
- **Everything lives on your device** — files are kept in the browser's IndexedDB. Close the
  tab, come back tomorrow, your project and open tabs are still there. Nothing is synced
  anywhere; there's no account to log into.
- **Mobile-first split view** — on a phone, the second editor pane is a hidden drawer: tap
  "Split" in the bottom nav, or just drag the grip handle in from the right edge, the way
  vscode.dev's mobile view works. Drag it back to dismiss it.
- **Mobile bottom nav** — Files / Search / Split / Commands / Settings, replacing the desktop
  activity bar when the screen is narrow. Full touch support throughout (drag handles,
  long-press for context menus, edge-swipe to open the file drawer).
- **Real editing, not a toy** — tabs with preview mode, split editing, find/replace, multi-file
  search, command palette (`Ctrl+Shift+P`), quick open (`Ctrl+P`), rename/delete/duplicate,
  image preview for binary files, adjustable font size/tab size/word wrap/minimap/theme.
- **Export back to a ZIP** any time, from the Explorer toolbar or the command palette.
- **Colored file & folder icons** — a lightweight color-coded scheme (own icons/colors, not
  a copy of any specific icon theme's artwork) so you can scan a tree by file type at a glance.
  Common folders like `src`, `test`, `dist`, `assets`, `node_modules` get their own colors too.
- **Copy Path / Copy Relative Path** — right-click any file or folder.
- **Auto Save** — on by default (debounced ~600ms after you stop typing). Turn it off in
  Settings if you'd rather save explicitly with `Ctrl/Cmd + S`; CodeForge will warn you before
  closing the tab if you have unsaved changes.
- **Open with Live Server** / **Open in Integrated Browser** — right-click any `.html` file (or
  use the command palette). "Live Server" opens it in a new browser tab; "Integrated Browser"
  opens it in a preview pane right inside CodeForge, split next to your editor. Both serve the
  file — and any relative `<link>`/`<script>`/`<img>` it references — straight out of your
  project's local storage via a small service worker, and both **live-reload** automatically
  whenever you save. (Relative paths like `style.css` or `./assets/img.png` work great; a
  root-absolute path like `/style.css` won't, since there's no real per-project domain root.)
- **Horizontally-scrolling file tree** — long nested paths scroll instead of getting clipped.

## What it deliberately doesn't do

This is a real, working editor — not a rebuild of VS Code itself. To keep it something that
actually runs (rather than a multi-hour native build with no working output), it leaves out
the pieces that come from VS Code's *extension host*: no extension marketplace, no real git
integration, no debugger, no integrated terminal shell. Everything else — the editor, the
explorer, the tabs, the multi-language support, the mobile layout — is fully working.

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
The only network requests this app makes on its own are to load its own local files — it
does not phone home, does not talk to Microsoft, and does not talk to Anthropic. If you
host it somewhere, whoever hosts it can see that people downloaded these static files,
same as any website — but the files people upload for editing never leave their browser.

## Renaming your project

Look for "CodeForge" in `index.html` (`<title>`, welcome screen) if you'd like to rebrand it.
