# Building CodeForge

## Requirements
- JDK 17
- Android SDK: platform 34, build-tools 34.0.0, NDK 26.1.x, CMake 3.22.1
- Internet access for Gradle to fetch AGP / Kotlin / `androidx.webkit:webkit:1.11.0`

## Build
```sh
echo "sdk.dir=/path/to/Android/Sdk" > local.properties
./gradlew assembleDebug          # -> app/build/outputs/apk/debug/app-debug.apk
```
Or open the folder in Android Studio (Koala or newer) and press Run.

### GitHub sign-in
Create an OAuth App on GitHub with **Device Flow enabled** and pass its client id (no secret needed):
```sh
./gradlew assembleDebug -PCODEFORGE_GITHUB_CLIENT_ID=Iv1.xxxxxxxx
```
(or set the `CODEFORGE_GITHUB_CLIENT_ID` environment variable). You can also paste the client id at runtime in
*Settings → GitHub*, and a Personal Access Token always works as a fallback.

### CI (GitHub Actions)
`.github/workflows/android.yml` uses the SDK that is preinstalled on `ubuntu-latest` and installs platform 34, build-tools 34.0.0, NDK 26.1.10909125 and
CMake 3.22.1 with its `sdkmanager` (no third-party setup action — `android-actions/setup-android` fails on current runners with
"Failed to find package 'tools'"). Download the APK from the run's artifacts.

### Release build
Add your own signing config to `app/build.gradle.kts` (none is shipped) and run `./gradlew assembleRelease`.

## Develop the UI without Android
The whole front end lives in `app/src/main/assets/www` (plain ES modules, no build step).
```sh
cd tools/devhost && npm install     # first time
node server.js                      # http://127.0.0.1:8780 — emulates the native bridge on your machine
```
`tools/e2e/*.js` are Playwright scripts that drive the UI against the dev host
(`NODE_PATH=$(npm root -g) node ../e2e/core.js`).

To refresh vendored web libraries (Monaco, xterm, isomorphic-git, Prettier, …): `cd tools && node vendor.mjs`.

## Web version (optional)
```sh
tools/web/build.sh                  # -> web-dist/ (copy of the UI + PWA manifest + service worker; the Android app is untouched)
cd web-dist && python3 -m http.server 8790
```
Deploy `web-dist/` to any static host over HTTPS (e.g. GitHub Pages) to get an installable, offline-capable app. It talks to `core/webhost.js`
instead of the native bridge (enabled by `window.__CF_WEB`). Git/AI/Open VSX requests are subject to browser CORS; for Git hosts that block CORS you can
set a proxy you trust: `localStorage.setItem("cf.corsProxy", "https://your-proxy.example")` (credentials pass through it — host your own).
Tests: `node tools/e2e/web.js` against the served `web-dist`.

## Tests
`tools/e2e/{smoke,core,features1,features2,features3,features4,mobile,exthost}.js` run against the dev host (`sh tools/devhost/restart.sh` first); `web.js` runs against the web build.

## Linux userland (optional, on device)
Terminal → *Set up Linux environment* downloads an Alpine rootfs and runs it with proot
(`libproot*.so` are shipped as native libs). This needs network access on first run.
