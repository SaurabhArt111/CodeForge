// Site settings. Edit this file, or set the matching environment variables when you run `npm start` (server/index.js generates this file
// from them, so no rebuild is needed): APP_VERSION, APK_URL, PLAY_STORE_URL, GITHUB_URL, CONTACT_EMAIL, PROXY_URL.
window.CF_SITE = {
  name: "CodeForge",
  version: "8.1.0",
  // Android APK: `npm run build` copies the APK into downloads/ and writes downloads/apk.json. You can also point this to any URL (GitHub Releases, CDN…).
  apkUrl: "",
  // Google Play listing. Leave empty until the app is published: the page then shows "Coming soon" instead of a link.
  playStoreUrl: "",
  // Source repository (shown in the footer and on the code page when set).
  githubUrl: "https://github.com/SaurabhArt111/CodeForge",
  // Contact / support address shown on the privacy page when set.
  contactEmail: "",
  // Optional CORS proxy used by the web editor for git clone/push to GitHub/GitLab/Bitbucket (`npm start` serves one at /proxy).
  // Leave empty on static hosting: cloning then needs a proxy you add in the editor.
  proxy: "",
};
