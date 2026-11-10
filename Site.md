# Site.md: the CodeForge website

One folder, `website/`, holds everything that is served on the web. It is a **React** front end (Vite) plus a small **Node** server with no runtime dependencies.

```
website/
  index.html            Vite entry; loads /site-config.js before the app
  src/
    main.jsx, App.jsx   router (BrowserRouter, base path from SITE_BASE)
    pages/              Home, Features, Docs, Updates (release notes), Blog, About, Download, Code, Privacy, NotFound
    content/            features.js, releases.js, posts.js: edit these to change the Features list, add a release or a blog post
    components/         Layout (header/footer), Showcase (feature tabs), CopyBlock
    lib/site.js         config(), url(), useApk()
    lib/highlight.js    the code browser's syntax highlighter
    styles/             site.css, code.css
  public/
    site-config.js      version, Play Store / APK / GitHub / contact / proxy settings
    assets/             logo, product screenshots, font
  server/index.js       Node server: static files + client-route fallback, /site-config.js from env, /api/info, /healthz, Git CORS proxy at /proxy
  scripts/
    build-site.mjs      the whole build (see below)
    gen-code.mjs        code browser data + CodeForge-source.zip
    make-shots.cjs      retakes the screenshots from the dev host
```

## What `npm run build` produces (`website/dist`)
| Path | From |
|---|---|
| `/`, `/features`, `/docs`, `/updates`, `/blog`, `/about`, `/download`, `/code`, `/privacy` | Vite build of `src/` (single-page app; `404.html` is a copy of `index.html` so static hosts still route) |
| `/app/` | the web editor: `sh ../tools/web/build.sh` (same UI as the Android app on a browser backend) |
| `/code-data/` | `tree.json` + the source files shown on `/code` |
| `/downloads/` | `CodeForge-source.zip`, `apk.json`, and `CodeForge.apk` when one was found (`APK=…`, `website/downloads/`, or Gradle's output folder) |

## Running and changing it
- `npm run dev` – Vite on :5180 for editing pages (proxying `/proxy` and `/site-config.js` to a `npm start` server on :8080 if you run one).
- `npm start` – serves `dist`. Environment variables: `PORT`, `HOST`, `SITE_DIR`, `APP_VERSION`, `APK_URL`, `PLAY_STORE_URL`, `GITHUB_URL`, `CONTACT_EMAIL`, `PROXY_ENABLED`, `PROXY_ALLOW`, `PROXY_ORIGIN`, `PROXY_RATE`, `PROXY_URL` (see DEPLOY.md).
- Settings changes (Play link, APK link, contact) need **no rebuild** with the Node server: it regenerates `/site-config.js` from the environment on every request.
- Project site on GitHub Pages (`https://user.github.io/CodeForge/`): build with `SITE_BASE=/CodeForge/ npm run build`; `.github/workflows/pages.yml` does this.

## Moving work between the web editor and the app
The web editor (`/app/`) and the Android app share one codebase. **File → Transfer to another CodeForge** packs chosen projects and settings into a `.cfbundle` (a ZIP with `manifest.json`, `settings.json`, `projects/<name>/…`); **File → Import bundle** unpacks it on the other side. API keys are never included (they are encrypted per device). Code: `app/src/main/assets/www/js/ui/transfer.js`.

## Testing
```sh
cd website && npm run build && (PORT=8791 npm start &)
SITE=http://127.0.0.1:8791 NODE_PATH=$(npm root -g) node ../tools/e2e/site.js
```
The test expects no APK and no Play URL, so the "Coming soon" and "APK not uploaded" states are checked; it also boots the web editor under `/app/` and checks the Git proxy refuses other hosts.
