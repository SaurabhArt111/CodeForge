// GitHub account: OAuth device flow (no secret needed) + personal-access-token fallback, profile, terminal git credentials, repo browser.
import { h, icon, copyText } from "../core/util.js";
let A, user = null;
export async function init(api) {
  A = api;
  A.cmd.register({ id: "github.signin", title: "GitHub: Sign In", run: signIn }); A.cmd.register({ id: "github.signout", title: "GitHub: Sign Out", run: signOut });
  A.cmd.register({ id: "github.token", title: "GitHub: Sign In with Personal Access Token", run: signInToken }); A.cmd.register({ id: "github.newToken", title: "GitHub: Create a Personal Access Token (opens GitHub)", run: () => openTokenPage(false) }); A.cmd.register({ id: "github.repos", title: "GitHub: Browse My Repositories", run: repos });
  A.cmd.register({ id: "github.gitcreds", title: "GitHub: Use Token for Terminal Git (store credentials)", run: gitCreds });
  await refresh();
}
async function refresh() {
  try { user = (await A.N.github.signedIn()) ? await A.N.github.user() : null; } catch { user = null; if (await A.N.github.signedIn().catch(() => false)) { /* offline: keep token */ } }
  A.bus.emit("github:changed", user);
  const online = await A.N.github.signedIn().catch(() => false);
  A.status.item("account", { side: "right", priority: 60, mobile: false, ic: "github", text: user ? user.login : online ? "GitHub" : "", title: user ? `Signed in as ${user.login}` : "GitHub", onClick: (e) => accountMenu(e.clientX, e.clientY) });
}
export const getUser = () => user;
const clientId = () => A.settings.get("github.clientId") || A.info().githubClientId || "";

export function accountMenu(x, y) {
  if (user) return A.contextMenu([
    { label: `${user.name || user.login} (@${user.login})`, icon: "account", disabled: true },
    { label: "Open GitHub profile", icon: "link-external", run: () => A.N.sys.openUrl(user.html_url) }, { label: "Browse my repositories…", icon: "repo", run: repos }, { label: "Clone repository…", icon: "repo-clone", run: () => A.feat("git").then((g) => g.cloneDialog()) },
    { separator: true }, { label: "Use token for terminal git…", icon: "key", run: gitCreds }, { label: "Sign out", icon: "sign-out", danger: true, run: signOut },
  ], x, y);
  A.contextMenu([{ label: "Sign in with GitHub (device code)…", icon: "github", run: signIn }, { label: "Sign in with a personal access token…", icon: "key", run: signInToken }, { label: "Create a personal access token on GitHub", icon: "link-external", run: () => openTokenPage(false) }, { separator: true }, { label: "Settings", icon: "settings-gear", run: () => A.cmd.run("view.settings") }], x, y);
}

export async function signIn() {
  const cid = clientId();
  if (!cid) {
    const ok = await A.confirm("Device-flow sign-in needs a GitHub OAuth App client ID (set it in Settings → GitHub; the app build can also embed one). Sign in with a personal access token instead?", { title: "GitHub sign-in", okLabel: "Use token" });
    if (ok) signInToken(); return;
  }
  let dc; try { dc = await A.N.github.deviceStart(cid); } catch (e) { return A.toastError(e); }
  let cancelled = false;
  const codeEl = h("div", { style: { font: "700 30px var(--mono)", letterSpacing: "4px", textAlign: "center", padding: "14px 0", userSelect: "all" } }, dc.user_code);
  const status = h("div.muted", { style: { textAlign: "center" } }, "Waiting for authorization…");
  const p = A.modal({ title: "Sign in with GitHub", width: 440, closable: true,
    body: h("div", h("p.modal-text", "1. Copy the code below.\n2. Open GitHub and enter it to authorize CodeForge."), codeEl,
      h("div", { style: { display: "flex", gap: "8px", justifyContent: "center" } }, h("button.btn", { onclick: () => { copyText(dc.user_code); A.toast("Code copied", { timeout: 1200 }); } }, icon("copy"), " Copy code"),
        h("button.btn.primary", { onclick: () => { copyText(dc.user_code); A.N.sys.openUrl(dc.verification_uri); } }, icon("link-external"), " Copy & open GitHub")), h("div", { style: { height: "10px" } }), status),
    buttons: [{ label: "Cancel", value: "cancel" }] });
  p.then(() => (cancelled = true));
  let interval = (dc.interval || 5) * 1000; const until = Date.now() + (dc.expires_in || 900) * 1000;
  while (!cancelled && Date.now() < until) {
    await new Promise((r) => setTimeout(r, interval)); if (cancelled) break;
    let r; try { r = await A.N.github.devicePoll(cid, dc.device_code); } catch (e) { status.textContent = e.message; continue; }
    if (r.status === "ok") { document.querySelector(".modal-wrap .modal-foot .btn")?.click(); await afterSignIn(); return; }
    if (r.status === "slow_down") interval = (r.interval || 10) * 1000;
    if (["expired", "denied", "error"].includes(r.status)) { status.textContent = r.status === "error" ? r.message : "Authorization " + r.status; break; }
  }
}
// GitHub's "new token" pages, pre-filled so one tap gives the right permissions: classic = repo + workflow (push, pull, Actions files) + read:user + user:email
export const TOKEN_URL = "https://github.com/settings/tokens/new?" + new URLSearchParams({ description: "CodeForge (" + (navigator.userAgent.includes("Android") ? "Android" : "web") + ")", scopes: "repo,workflow,read:user,user:email" }).toString();
export const FINE_GRAINED_URL = "https://github.com/settings/personal-access-tokens/new";
export const openTokenPage = (fine = false) => A.N.sys.openUrl(fine ? FINE_GRAINED_URL : TOKEN_URL);

export async function signInToken() {
  const input = h("input.input", { type: "password", placeholder: "ghp_… or github_pat_…", spellcheck: false, autocapitalize: "off", autocomplete: "off" });
  const err = h("div.field-error");
  const body = h("div.token-dlg",
    h("div.token-step", h("b", "1. Create a token"), h("p.muted", "Opens GitHub with the permissions CodeForge needs already ticked (repo, workflow, read:user, user:email). Sign in to GitHub if asked, scroll down and press “Generate token”, then copy it."),
      h("div.token-btns", h("button.btn.primary", { type: "button", onclick: () => openTokenPage(false) }, icon("link-external"), " Create token on GitHub"), h("button.btn", { type: "button", onclick: () => openTokenPage(true) }, "Fine-grained token…"))),
    h("div.token-step", h("b", "2. Paste it here"), h("p.muted", "It is stored encrypted on this device and never leaves it except to talk to GitHub."), input, err));
  const v = await A.modal({ title: "Sign in with a personal access token", width: 460, body,
    buttons: [{ label: "Cancel", value: undefined }, { label: "Sign in", primary: true, value: "__ok", onClick: () => { if (!input.value.trim()) { err.textContent = "Paste your token first"; return false; } } }] });
  if (v !== "__ok") return;
  await A.N.secret.set("github.token", input.value.trim());
  try { await A.N.github.user(); await afterSignIn(); } catch (e) { await A.N.github.signOut().catch(() => {}); A.toastError(e); }
}
async function afterSignIn() {
  await refresh(); if (!user) return;
  if (!A.settings.get("git.userName")) A.settings.set("git.userName", user.name || user.login);
  if (!A.settings.get("git.userEmail")) A.settings.set("git.userEmail", user.email || `${user.id}+${user.login}@users.noreply.github.com`);
  A.toast(`Signed in as ${user.login}`, { kind: "success" });
}
export async function signOut() { await A.N.github.signOut(); user = null; await refresh(); A.toast("Signed out of GitHub"); }

async function gitCreds() {
  if (!user) return A.toast("Sign in first", { kind: "warn" });
  const ok = await A.confirm("This writes your GitHub token to ~/.git-credentials inside the Linux environment so `git push/pull` in the terminal works. The file is private to this app. Continue?", { title: "Terminal git credentials", okLabel: "Write credentials" });
  if (!ok) return;
  try { await A.N.github.configureGit(A.settings.get("git.userName"), A.settings.get("git.userEmail"), user.login); A.toast("Terminal git configured", { kind: "success" }); } catch (e) { A.toastError(e); }
}
async function repos() {
  if (!user) return signIn();
  (await A.feat("git")).cloneDialog();
}
