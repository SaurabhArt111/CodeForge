// Edit this file (or set the matching environment variables when you run backend/server.js) — no rebuild needed.
window.CF_SITE = {
  name: "CodeForge",
  version: "8.1.0",
  // Android APK: build-site.sh copies the APK into downloads/ and writes downloads/apk.json. You can also point this to any URL (GitHub Releases, CDN…).
  apkUrl: "",
  // Google Play listing. Leave empty until the app is published: the page then shows "Coming soon" instead of a link.
  playStoreUrl: "",
  // Source repository (shown in the footer and on the code page when set).
  githubUrl: "",
  // Contact / support address shown on the privacy page when set.
  contactEmail: "",
  // Optional CORS proxy used by the web editor for git clone/push to GitHub/GitLab/Bitbucket (backend/server.js serves one at /proxy).
  // Leave empty on static hosting: cloning then needs a proxy you add in the editor.
  proxy: "",
};
