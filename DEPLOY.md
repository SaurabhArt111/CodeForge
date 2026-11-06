# Deploying the CodeForge website

The site has four parts, all produced by one command:

| URL | What | Source |
|---|---|---|
| `/` | Landing page (React) | `website/src/pages/Home.jsx` |
| `/app/` | The web editor (same UI as the Android app, browser backend) | `tools/web/build.sh` |
| `/code` | Source-code browser, plus `/downloads/CodeForge-source.zip` | `website/scripts/gen-code.mjs` |
| `/download` | Android APK card and Google Play badge | `website/src/pages/Download.jsx` |

```sh
cd website
npm install                            # once (React, Vite)
npm run build                          # writes website/dist   (React site + /app web editor + code data)
npm start                              # http://localhost:8080  (the Node server: no further dependencies)
npm run dev                            # Vite dev server for working on the pages (http://localhost:5180)
```

## Add the Play Store link later
Either edit `website/public/site-config.js` (`playStoreUrl`) and rebuild, or — with the Node backend or Docker — set the environment variable `PLAY_STORE_URL` and restart. Until it is set, the badge shows **Coming soon** and has no link.

## Add the Android APK
1. Build it: `./gradlew assembleRelease` (or `assembleDebug`) — see BUILD.md.
2. `APK=../app/build/outputs/apk/release/app-release.apk npm run build   # inside website/ (or drop the .apk into website/downloads/)` copies it to `downloads/CodeForge.apk` and writes `downloads/apk.json` (size and SHA-256 appear on the page).
   Without a file the page says "APK not uploaded yet". To host the APK elsewhere (GitHub Releases, a CDN) set `apkUrl` in `site-config.js` or `APK_URL`.

## Hosting options
* **Static host** (GitHub Pages, Netlify, Cloudflare Pages, any web server): upload `website/dist` (for a project site on a sub-path build with `SITE_BASE=/repo-name/ npm run build`). `.github/workflows/pages.yml` and `netlify.toml` are included. The web editor needs HTTPS (or localhost) for offline support and for its in-browser live server (a service worker).
* **Node server** (`website/server/index.js`): serves the same files, gzip, security headers, generates `/site-config.js` from environment variables, and adds the Git proxy below.
* **Docker**: `docker build -t codeforge-site . && docker run -p 8080:8080 codeforge-site`.

## Backend environment variables
| Variable | Default | Meaning |
|---|---|---|
| `PORT`, `HOST` | `8080`, `0.0.0.0` | Listen address |
| `SITE_DIR` | `website/dist` | Folder to serve |
| `PLAY_STORE_URL`, `APK_URL`, `GITHUB_URL`, `CONTACT_EMAIL`, `APP_VERSION` | – | Override `site-config.js` |
| `PROXY_ENABLED` | `1` | `0` turns the Git proxy off |
| `PROXY_ALLOW` | – | Extra hosts, comma separated (default: github.com, gitlab.com, bitbucket.org) |
| `PROXY_ORIGIN` | `*` | Set to your site's origin so only your pages can use the proxy from a browser |
| `PROXY_RATE` | `240` | Requests per minute per IP |
| `PROXY_URL` | `/proxy` | Proxy address given to the web editor; empty string disables |

### About the Git proxy
Browsers cannot talk to GitHub's Git endpoints directly (no CORS headers), so the web editor sends clone/fetch/push through `/proxy/<host>/<path>`. It forwards only Git smart-HTTP paths to the allow-listed hosts, over HTTPS, keeps no logs of bodies and stores nothing. **Access tokens pass through it**, so run your own and keep `PROXY_ORIGIN` set. Static hosting has no proxy: users can paste their own in the editor, or you can point `proxy` in `site-config.js` at a deployed backend.

## Tests
```sh
(cd website && npm run build && npm start) &
SITE=http://127.0.0.1:8080 NODE_PATH=$(npm root -g) node tools/e2e/site.js
```
(The test expects no APK and no Play URL, so the "Coming soon" and "not uploaded" states are checked.)
