// Source control (isomorphic-git over the native bridge): status, stage, commit, branches, history, diff, clone/pull/push, gutter marks.
import * as lazy from "../core/lazy.js";
import { fs, makeHttp } from "./gitfs.js";
import { h, icon, P, relTime, debounce, textDec, esc } from "../core/util.js";
let A, G, dir = null, state = { repo: false, branch: null, changes: [], staged: [], busy: false, log: null, remotes: [] }, view, body, msgEl, signedIn = false;
const http = makeHttp({ auth: (url) => (signedIn && /^https:\/\/(github\.com|api\.github\.com|gist\.github\.com)\//.test(url) ? "Basic {{basic:x-access-token:github.token}}" : null) });
const cache = {};
const IGNORE_DIRS = /(^|\/)(node_modules|\.gradle|build\/intermediates|\.cache|__pycache__|\.next|\.venv|venv)(\/|$)/;

export async function init(api) {
  A = api; await lazy.git(); G = window.git;
  if (!G) throw new Error("isomorphic-git not loaded");
  A.registerView("git", build);
  const refreshSoon = debounce(() => refresh(), 700);
  A.ws.on("root", () => { dir = A.ws.root; state = { ...state, repo: false, log: null }; refresh(); });
  A.bus.on("saved", refreshSoon); A.bus.on("fs:external", refreshSoon); A.ws.on("changed", refreshSoon);
  A.bus.on("fs:docreload", refreshSoon);
  // while a terminal is running (coding CLIs, npm, git…) files change behind the editor's back: keep the Git view current
  setInterval(() => { if (!document.hidden && A.ws.isOpen && state.repo && A.term.list().some((t) => t.alive)) refresh(); }, 10000);
  // coming back from another app must never stall the UI: refresh lazily, at most every 20 s, after the first paint
  const onReturn = () => { if (!document.hidden && Date.now() - lastDone > 20000) setTimeout(() => refresh(), 1800); };
  window.addEventListener("focus", onReturn); A.N.on("app.resume", onReturn);
  A.bus.on("workspace:opened", () => refresh());
  A.ed.editorEvents.on("active", () => gutterSoon()); A.ed.editorEvents.on("content", () => gutterSoon());
  A.bus.on("github:changed", async () => { signedIn = await A.N.github.signedIn().catch(() => false); });
  signedIn = await A.N.github.signedIn().catch(() => false);
  dir = A.ws.root; if (dir) refresh();
  for (const [id, title, run] of [["git.refresh", "Refresh", refresh], ["git.init", "Initialize Repository", initRepo], ["git.commit", "Commit", () => commit()], ["git.push", "Push", push], ["git.pull", "Pull", pull], ["git.fetch", "Fetch", fetch_],
    ["git.branch", "Switch Branch…", branchMenuQuick], ["git.newBranch", "Create Branch…", createBranch], ["git.stageAll", "Stage All Changes", stageAll], ["git.clone", "Clone Repository…", cloneDialog], ["git.log", "Show History", () => { A.showView("git"); loadLog(true); }]])
    A.cmd.register({ id, title, category: "Git", run });
}

const base = () => ({ fs, dir });
const author = async () => {
  let name = A.settings.get("git.userName"), email = A.settings.get("git.userEmail");
  if (!name || !email) {
    try { const u = signedIn ? await A.N.github.user() : null; if (u) { name ||= u.name || u.login; email ||= u.email || `${u.id}+${u.login}@users.noreply.github.com`; } } catch { /* ignore */ }
  }
  if (!name || !email) {
    const n = await A.prompt("Git user name (for commits)", { value: name || "" }); if (!n) return null;
    const e = await A.prompt("Git email", { value: email || "" }); if (!e) return null;
    A.settings.set("git.userName", n); A.settings.set("git.userEmail", e); name = n; email = e;
  }
  return { name, email };
};
const fixUrl = (u) => { u = u.trim(); const m = u.match(/^git@([^:]+):(.+)$/) || u.match(/^ssh:\/\/git@([^/]+)\/(.+)$/); return m ? `https://${m[1]}/${m[2]}` : u; };

async function onAuthFor(url) {
  if (signedIn && /github\.com/.test(url)) return { headers: {} };
  const host = new URL(url).host; const k = "gitcred:" + host;
  if (cache[k]) return cache[k];
  const username = await A.prompt(`Username for ${host}`, { okLabel: "Next" }); if (!username) return { cancel: true };
  const password = await A.prompt(`Password / token for ${username}@${host}`, { password: true, okLabel: "Sign in" }); if (!password) return { cancel: true };
  return (cache[k] = { username, password });
}

// ---------------------------------------------------------------- status
let running = null, rerun = false, lastDone = 0;
/** single-flight: overlapping triggers (save + poll + focus) collapse into one trailing run instead of N parallel full scans */
export function refresh() {
  if (running) { rerun = true; return running; }
  A.bus.emit("busy", "git", "Git: checking changes…");
  running = doRefresh().catch(() => {}).finally(() => { running = null; lastDone = Date.now(); A.bus.emit("busy", "git", null); if (rerun) { rerun = false; setTimeout(refresh, 400); } });
  return running;
}
async function doRefresh() {
  if (!dir) { state.repo = false; return render(); }
  try {
    if (!(await A.N.fs.exists(dir + "/.git"))) { state = { ...state, repo: false, changes: [], staged: [] }; A.explorer.explorer.setDecorations(new Map()); badge(0); return render(); }
    state.repo = true;
    state.branch = (await G.currentBranch({ ...base(), fullname: false })) || null;
    if (!state.branch) { try { state.branch = "(" + (await G.resolveRef({ ...base(), ref: "HEAD" })).slice(0, 7) + ")"; } catch { state.branch = "(no commits)"; } }
    state.remotes = await G.listRemotes(base()).catch(() => []);
    const matrix = await G.statusMatrix({ ...base(), filter: (f) => !IGNORE_DIRS.test(f) });
    const changes = [], staged = [], deco = new Map();
    for (const [f, H, W, S] of matrix) {
      if (H === 1 && W === 1 && S === 1) continue;
      let st = null, un = null;
      if (H === 0 && S >= 2) st = "A"; else if (H === 1 && S === 0) st = "D"; else if (H === 1 && (S === 2 || S === 3)) st = "M";
      if (H === 0 && S === 0 && W === 2) un = "U"; else if (S === 1 && W === 0) un = "D"; else if (S === 1 && W === 2) un = "M"; else if (S === 3) un = "M"; else if (H === 1 && S === 0 && W === 2) un = "U";
      if (st) staged.push({ f, s: st }); if (un) changes.push({ f, s: un });
      deco.set(P.join(dir, f), un === "U" ? "U" : un || st);
    }
    const order = (a, b) => a.f.localeCompare(b.f);
    state.changes = changes.sort(order); state.staged = staged.sort(order);
    A.explorer.explorer.setDecorations(deco);
    badge(changes.length + staged.length); gutterSoon(true);
  } catch (e) { console.warn("git refresh", e); }
  render(); A.bus.emit("git:changed", state);
  A.status.item("branch", { side: "left", priority: 0, ic: "git-branch", text: state.repo ? state.branch : "", title: "Switch branch", onClick: branchMenuQuick });
}
function badge(n) { const b = document.getElementById("git-badge"); b.textContent = n > 99 ? "99+" : String(n); b.classList.toggle("hidden", !n); }

// ---------------------------------------------------------------- view
function build(el) {
  view = el;
  body = h("div.view-body");
  el.append(h("div.view-head", h("span.title", "Source Control"),
    h("button.icon-btn", { title: "Pull", onclick: pull }, icon("repo-pull")), h("button.icon-btn", { title: "Push", onclick: push }, icon("repo-push")),
    h("button.icon-btn", { title: "Refresh", onclick: refresh }, icon("refresh")), h("button.icon-btn", { title: "More", onclick: (e) => moreMenu(e.clientX, e.clientY) }, icon("ellipsis"))), body);
  render();
}

function render() {
  if (!body) return;
  if (!A.ws.isOpen) return body.replaceChildren(h("div.empty-state", "Open a folder to use source control.", h("button.btn.primary", { onclick: () => A.cmd.run("file.openFolder") }, "Open Folder"), h("button.btn", { onclick: cloneDialog }, "Clone Repository")));
  if (!state.repo) return body.replaceChildren(h("div.empty-state", "The folder you opened is not a Git repository.",
    h("button.btn.primary", { onclick: initRepo }, icon("repo"), " Initialize Repository"), h("button.btn", { onclick: cloneDialog }, icon("repo-clone"), " Clone Repository…"), h("div.muted", { style: { fontSize: "calc(12px * var(--fz))" } }, "Tip: you can also use `git` in the terminal after setting up Linux.")));
  const m = (msgEl = h("textarea", { rows: 2, placeholder: `Message (commit on “${state.branch}”)`, value: msgEl?.value || "", spellcheck: true, onkeydown: (e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") commit(); } }));
  const row = (c, staged) => {
    const r = h("div.row.git-" + c.s, { title: c.f, onclick: () => openDiff(c, staged) },
      h("span.chev"), A.icons.fileIcon(P.base(c.f)), h("span.label", P.base(c.f)), h("span.meta", P.dir("/" + c.f).slice(1)),
      h("span.actions", { style: { display: "flex" } },
        h("button.icon-btn", { title: "Open file", onclick: (e) => { e.stopPropagation(); A.ed.openFile(P.join(dir, c.f)); } }, icon("go-to-file")),
        ...(staged ? [h("button.icon-btn", { title: "Unstage", onclick: (e) => { e.stopPropagation(); unstage([c.f]); } }, icon("remove"))]
          : [h("button.icon-btn", { title: "Discard changes", onclick: (e) => { e.stopPropagation(); discard(c); } }, icon("discard")), h("button.icon-btn", { title: "Stage", onclick: (e) => { e.stopPropagation(); stage([c.f]); } }, icon("add"))])),
      h("span.gs", c.s));
    return r;
  };
  const sec = (title, list, acts, staged) => list.length ? h("div", h("div.section-title.scm-sec", h("span", `${title} (${list.length})`), h("span.scm-acts", ...acts)), ...list.map((c) => row(c, staged))) : null;
  body.replaceChildren(
    h("div.scm-commit", m,
      h("div", { style: { display: "flex", gap: "6px" } }, h("button.btn.primary", { style: { flex: 1 }, disabled: state.busy, onclick: () => commit() }, icon("check"), ` Commit${state.staged.length ? ` (${state.staged.length})` : ""}`),
        h("button.btn", { title: "Commit & push", onclick: () => commit({ push: true }) }, icon("repo-push")))),
    sec("Staged Changes", state.staged, [h("button.icon-btn", { title: "Unstage all", onclick: () => unstage(state.staged.map((c) => c.f)) }, icon("remove"))], true),
    sec("Changes", state.changes, [h("button.icon-btn", { title: "Discard all", onclick: discardAll }, icon("discard")), h("button.icon-btn", { title: "Stage all", onclick: stageAll }, icon("add"))], false),
    !state.changes.length && !state.staged.length ? h("div.empty-state", icon("pass"), "No changes. Working tree clean.") : null,
    h("div.section-title.scm-sec", { onclick: () => loadLog(true), style: { cursor: "pointer" } }, h("span", `${state.log ? "▾" : "▸"} History`), h("span.scm-acts", state.branch)),
    ...(state.log ? state.log.map((c) => h("div.row", { style: { height: "auto", padding: "4px 14px", alignItems: "flex-start", flexDirection: "column", gap: 0 }, title: c.commit.message, onclick: () => showCommit(c) },
      h("span.label", { style: { whiteSpace: "normal" } }, c.commit.message.split("\n")[0]), h("span.meta", `${c.oid.slice(0, 7)} · ${c.commit.author.name} · ${relTime(c.commit.author.timestamp * 1000)}`))) : []));
}

// ---------------------------------------------------------------- operations
async function guard(label, fn) {
  if (state.busy) return; state.busy = true; render();
  const b = label ? A.busy(label) : null;
  try { return await fn(b); } catch (e) { A.toastError(e); } finally { state.busy = false; b?.close(); await refresh(); }
}
export async function initRepo() { if (!dir) return; await guard("Initializing…", async () => { await G.init({ ...base(), defaultBranch: "main" }); A.toast("Initialized empty Git repository", { kind: "success" }); }); }
async function stage(files) { await guard("", async () => { for (const f of files) { const exists = await A.N.fs.exists(P.join(dir, f)); if (exists) await G.add({ ...base(), filepath: f }); else await G.remove({ ...base(), filepath: f }); } }); }
async function stageAll() { await stage(state.changes.map((c) => c.f)); }
async function unstage(files) { await guard("", async () => { for (const f of files) await G.resetIndex({ ...base(), filepath: f }); }); }
async function discard(c) {
  if (!(await A.confirm(`Discard changes to “${c.f}”? This cannot be undone.`, { title: "Discard changes", okLabel: "Discard", danger: true }))) return;
  await guard("", async () => { if (c.s === "U") await A.N.fs.rm(P.join(dir, c.f)); else await G.checkout({ ...base(), filepaths: [c.f], force: true }); reloadOpen(c.f); });
}
async function discardAll() {
  if (!(await A.confirm(`Discard ALL ${state.changes.length} unstaged changes?`, { title: "Discard all", okLabel: "Discard all", danger: true }))) return;
  await guard("Discarding…", async () => { for (const c of state.changes) { if (c.s === "U") await A.N.fs.rm(P.join(dir, c.f)); else await G.checkout({ ...base(), filepaths: [c.f], force: true }); reloadOpen(c.f); } });
}
const reloadOpen = (f) => { const p = P.join(dir, f); if (A.ed.getDoc(p)) A.ed.reload(p, true); };

export async function commit({ push: andPush = false } = {}) {
  const message = msgEl?.value.trim(); if (!message) { A.toast("Enter a commit message", { kind: "warn" }); msgEl?.focus(); return; }
  if (!state.staged.length) {
    if (!state.changes.length) return A.toast("Nothing to commit");
    if (!(await A.confirm("No changes are staged. Stage all changes and commit?", { okLabel: "Stage all & commit" }))) return;
    await stageAll();
  }
  const au = await author(); if (!au) return;
  await A.ed.saveAll();
  await guard("Committing…", async () => { const oid = await G.commit({ ...base(), message, author: au }); msgEl.value = ""; state.log = state.log ? [] : null; A.toast(`Committed ${oid.slice(0, 7)}`, { kind: "success" }); });
  if (state.log) loadLog(true);
  if (andPush) await push();
}

async function remoteFor() {
  let rs = await G.listRemotes(base()); if (!rs.length) {
    const url = await A.prompt("Remote URL (e.g. https://github.com/you/repo.git)", { okLabel: "Add remote" }); if (!url) return null;
    await G.addRemote({ ...base(), remote: "origin", url: fixUrl(url) }); rs = await G.listRemotes(base());
  }
  return rs.find((r) => r.remote === "origin") || rs[0];
}
const progress = (b, label) => (e) => { b?.update(`${label} ${e.phase || ""}`); if (e.total) b?.progress(e.loaded / e.total); };

export async function fetch_() { const r = await remoteFor(); if (!r) return; await guard("Fetching…", async (b) => { await G.fetch({ ...base(), http, remote: r.remote, url: fixUrl(r.url), prune: true, tags: false, onAuth: onAuthFor, onProgress: progress(b, "Fetching"), corsProxy: undefined }); A.toast("Fetched " + r.remote, { kind: "success" }); }); }
export async function pull() {
  const r = await remoteFor(); if (!r) return; const au = await author(); if (!au) return; await A.ed.saveAll();
  await guard("Pulling…", async (b) => { await G.pull({ ...base(), http, remote: r.remote, url: fixUrl(r.url), author: au, fastForward: true, fastForwardOnly: false, singleBranch: true, onAuth: onAuthFor, onProgress: progress(b, "Pulling") }); A.toast("Pull complete", { kind: "success" }); for (const t of A.ed.allTabs()) if (t.path && A.ed.getDoc(t.path)?.model && !A.ed.getDoc(t.path).dirty) A.ed.reload(t.path, true); A.ws.invalidate(); A.refreshExplorer(); });
}
export async function push() {
  const r = await remoteFor(); if (!r) return;
  await guard("Pushing…", async (b) => {
    const ref = state.branch?.startsWith("(") ? "HEAD" : state.branch;
    const res = await G.push({ ...base(), http, remote: r.remote, url: fixUrl(r.url), ref, remoteRef: `refs/heads/${ref}`, onAuth: onAuthFor, onProgress: progress(b, "Pushing") });
    if (res?.ok === false || res?.error) throw new Error(res.error || "Push rejected");
    A.toast(`Pushed ${ref} to ${r.remote}`, { kind: "success" });
  });
}

// branches
async function branchMenuQuick() {
  if (!state.repo) return;
  const branches = await G.listBranches(base()); const remoteBr = []; for (const r of state.remotes) for (const b of await G.listBranches({ ...base(), remote: r.remote }).catch(() => [])) if (b !== "HEAD") remoteBr.push(`${r.remote}/${b}`);
  const items = [{ label: "Create new branch…", icon: "add", value: "__new" }, ...branches.map((b) => ({ label: b, description: b === state.branch ? "current" : "", icon: "git-branch", value: b })), ...remoteBr.map((b) => ({ label: b, description: "remote", icon: "cloud", value: "remote:" + b }))];
  const pick = await A.quickPick(items, { placeholder: "Switch branch" }); if (!pick) return;
  if (pick === "__new") return createBranch();
  if (pick.startsWith("remote:")) { const [rem, ...rest] = pick.slice(7).split("/"); const name = rest.join("/"); return guard("Checking out…", async () => { await G.branch({ ...base(), ref: name, object: await G.resolveRef({ ...base(), ref: `refs/remotes/${rem}/${name}` }), checkout: false }).catch(() => {}); await G.checkout({ ...base(), ref: name }); afterCheckout(); }); }
  await guard("Checking out…", async () => { await G.checkout({ ...base(), ref: pick }); afterCheckout(); });
}
function afterCheckout() { A.ws.invalidate(); A.refreshExplorer(); for (const t of A.ed.allTabs()) if (t.path && A.ed.getDoc(t.path)?.model && !A.ed.getDoc(t.path).dirty) A.ed.reload(t.path, true); state.log = null; }
export async function createBranch() {
  const name = await A.prompt("New branch name", { okLabel: "Create & checkout", validate: (v) => (/^[\w./-]+$/.test(v) ? null : "Invalid branch name") }); if (!name) return;
  await guard("", async () => { await G.branch({ ...base(), ref: name, checkout: true }); A.toast(`Switched to new branch ${name}`, { kind: "success" }); });
}
async function deleteBranch() {
  const bs = (await G.listBranches(base())).filter((b) => b !== state.branch); const pick = await A.quickPick(bs.map((b) => ({ label: b, value: b })), { placeholder: "Delete branch" }); if (!pick) return;
  await guard("", async () => { await G.deleteBranch({ ...base(), ref: pick }); });
}

function moreMenu(x, y) {
  A.contextMenu([
    { label: "Fetch", icon: "sync", run: fetch_ }, { label: "Pull", icon: "repo-pull", run: pull }, { label: "Push", icon: "repo-push", run: push }, { separator: true },
    { label: "Switch Branch…", icon: "git-branch", run: branchMenuQuick }, { label: "Create Branch…", icon: "add", run: createBranch }, { label: "Delete Branch…", icon: "trash", run: deleteBranch }, { separator: true },
    { label: "Stage All", icon: "add", run: stageAll }, { label: "Unstage All", icon: "remove", run: () => unstage(state.staged.map((c) => c.f)) }, { separator: true },
    { label: "Add / Change Remote…", icon: "cloud", run: async () => { const rs = await G.listRemotes(base()); const url = await A.prompt("Remote “origin” URL", { value: rs.find((r) => r.remote === "origin")?.url || "" }); if (url) { await G.addRemote({ ...base(), remote: "origin", url: fixUrl(url), force: true }); refresh(); } } },
    { label: "Clone Repository…", icon: "repo-clone", run: cloneDialog }, { label: "Show History", icon: "history", run: () => loadLog(true) },
  ], x, y);
}

// history
async function loadLog(force) {
  if (!state.repo) return; if (state.log && !force) return;
  if (state.log && force && view?.querySelector(".scm-sec")) { /* toggle collapse */ }
  try { state.log = await G.log({ ...base(), depth: 60 }); } catch { state.log = []; } render();
}
async function showCommit(c) {
  const parent = c.commit.parent[0]; const files = [];
  try { await G.walk({ ...base(), trees: [G.TREE({ ref: parent || c.oid }), G.TREE({ ref: c.oid })], map: async (f, [a, b]) => { if (f === ".") return; if (!a && !b) return; const ta = a && (await a.type()), tb = b && (await b.type()); if ((ta === "tree") || (tb === "tree")) return; const oa = a && (await a.oid()), ob = b && (await b.oid()); if (oa !== ob) files.push({ f, s: !a ? "A" : !b ? "D" : "M", a: oa, b: ob }); return null; } }); } catch (e) { A.toastError(e); }
  const list = h("div", ...files.slice(0, 300).map((x) => h("div.row", { style: { cursor: "pointer", paddingLeft: 0 }, onclick: async () => { const rd = async (oid) => (oid ? textDec.decode((await G.readBlob({ ...base(), oid })).blob) : ""); A.ed.openDiff(`${P.base(x.f)} (${c.oid.slice(0, 7)})`, await rd(x.a), await rd(x.b), A.ed.languageForPath("/" + x.f)); } }, A.icons.fileIcon(P.base(x.f)), h("span.label", x.f), h("span.gs", { style: { color: "var(--muted)" } }, x.s))));
  A.modal({ title: `${c.oid.slice(0, 7)} — ${c.commit.message.split("\n")[0]}`, className: "wide", width: 640, body: h("div", h("p.modal-detail", `${c.commit.author.name} <${c.commit.author.email}> · ${new Date(c.commit.author.timestamp * 1000).toLocaleString()}`), h("pre.selectable", { style: { whiteSpace: "pre-wrap", margin: "6px 0 12px" } }, c.commit.message), h("div.section-title", { style: { padding: "0 0 4px" } }, `${files.length} changed files`), list), buttons: [{ label: "Close", primary: true }] });
}

// diff
async function headText(f) { try { const oid = await G.resolveRef({ ...base(), ref: "HEAD" }); const { blob } = await G.readBlob({ ...base(), oid, filepath: f }); return textDec.decode(blob); } catch { return ""; } }
async function indexText(f) { try { const oid = await G.resolveRef({ ...base(), ref: "HEAD" }); void oid; const st = await G.walk({ ...base(), trees: [G.STAGE()], map: async (p, [e]) => (p === f && e ? await e.oid() : undefined) }); const o = st.find?.((x) => x) ; if (o) return textDec.decode((await G.readBlob({ ...base(), oid: o })).blob); } catch { /* ignore */ } return null; }
async function openDiff(c, staged) {
  const lang = A.ed.languageForPath("/" + c.f); const p = P.join(dir, c.f);
  const wd = (await A.N.fs.exists(p)) ? (await A.N.fs.readText(p)).text || "" : "";
  let orig = await headText(c.f), mod = wd, title = `${P.base(c.f)} (Working Tree)`;
  if (staged) { mod = (await indexText(c.f)) ?? wd; title = `${P.base(c.f)} (Index)`; }
  await A.ed.openDiff(title, orig, mod, lang, "gitdiff:" + (staged ? "s:" : "w:") + c.f);
}

// ---------------------------------------------------------------- clone
export async function cloneDialog() {
  const url = h("input", { placeholder: "https://github.com/owner/repo  (or git@github.com:owner/repo.git)", spellcheck: false, autocapitalize: "off", type: "text" });
  const name = h("input", { placeholder: "folder name (optional)", type: "text" });
  const depth = h("select", {}, h("option", { value: "0" }, "Full history"), h("option", { value: "1", selected: true }, "Shallow (latest only, fastest)"), h("option", { value: "50" }, "Last 50 commits"));
  const repos = h("div", { style: { marginTop: "10px", maxHeight: "34vh", overflow: "auto" } });
  signedIn = await A.N.github.signedIn().catch(() => false);
  const sec = h("div", signedIn ? h("div.section-title", { style: { padding: "6px 0" } }, "Your GitHub repositories") : h("div.muted", { style: { fontSize: "calc(12px * var(--fz))", marginTop: "8px" } }, "Sign in with GitHub (account button) to browse and clone private repositories."), repos);
  if (signedIn) loadRepos(repos, (r) => { url.value = r.clone_url; name.value = r.name; });
  const r = await A.modal({ title: "Clone repository", width: 560, body: h("div", url, h("div", { style: { display: "flex", gap: "8px", marginTop: "8px" } }, name, depth), sec), buttons: [{ label: "Cancel", value: undefined }, { label: "Clone", primary: true, value: "go", onClick: () => (url.value.trim() ? true : false) }] });
  if (r !== "go") return;
  const u = fixUrl(url.value); const nm = (name.value.trim() || P.base(u.replace(/\.git$/, "").replace(/\/$/, "")) || "repo");
  const base_ = A.settings.state.projectsDir || P.join(A.info().paths.home, "projects"); await A.N.fs.mkdir(base_);
  const target = P.join(base_, nm);
  if (await A.N.fs.exists(target)) return A.toast(`“${nm}” already exists in projects`, { kind: "error" });
  const b = A.busy(`Cloning ${nm}…`); b.progress(-1);
  try {
    await G.clone({ fs, http, dir: target, url: u, singleBranch: true, depth: +depth.value || undefined, onAuth: onAuthFor, onProgress: (e) => { b.update(`Cloning ${nm}… ${e.phase || ""}`); if (e.total) b.progress(e.loaded / e.total); }, onMessage: () => {} });
    b.close(); A.toast(`Cloned ${nm}`, { kind: "success" }); await A.openFolder(target);
  } catch (e) { b.close(); await A.N.fs.rm(target).catch(() => {}); A.toastError(e); }
}
async function loadRepos(box, pick) {
  box.replaceChildren(h("div.muted", "Loading…"));
  try {
    const rr = await A.N.net.request({ url: "https://api.github.com/user/repos?per_page=100&sort=pushed", headers: { Authorization: "Bearer {{secret:github.token}}", Accept: "application/vnd.github+json" } });
    const list = JSON.parse(rr.text); if (!Array.isArray(list)) throw new Error(list.message || "Failed");
    box.replaceChildren(...list.map((r) => h("div.row", { style: { paddingLeft: 0 }, onclick: () => pick(r) }, icon(r.private ? "lock" : "repo"), h("span.label", r.full_name), h("span.meta", r.language || ""))));
  } catch (e) { box.replaceChildren(h("div.muted", e.message)); }
}

// ---------------------------------------------------------------- gutter decorations (diff vs HEAD)
let diffEd = null, collections = new WeakMap(), headCache = new Map();
const gutterSoon = debounce((force) => gutter(force), 450);
// one run at a time: two overlapping runs shared `diffEd`, and the first one disposed the model the second was attaching ("Model is disposed!")
let gutterChain = Promise.resolve();
const gutter = (force) => (gutterChain = gutterChain.then(() => gutterRun(force)).catch(() => {}));
async function gutterRun(force) {
  const t = A.ed.activeTab(); const e = A.ed.activeEditor(); const mon = A.ed.monaco;
  if (!t?.path || t.kind !== "file" || !e || !mon || !state.repo || !dir || !A.ws.isOpen || !P.inside(dir, t.path)) return;
  const rel = P.rel(dir, t.path); let orig = headCache.get(rel);
  if (orig === undefined || force) { orig = await headText(rel).catch(() => null); headCache.set(rel, orig); if (headCache.size > 60) headCache.delete(headCache.keys().next().value); }
  let coll = collections.get(e); if (!coll) { coll = e.createDecorationsCollection([]); collections.set(e, coll); }
  if (orig === null || (orig === "" && !(await A.N.fs.exists(dir + "/.git/HEAD")))) { coll.set([]); return; }
  if (!diffEd) { const host = document.createElement("div"); host.style.cssText = "position:absolute;width:10px;height:10px;left:-99px;visibility:hidden"; document.body.append(host); diffEd = mon.editor.createDiffEditor(host, { renderSideBySide: false, automaticLayout: false, ignoreTrimWhitespace: false }); }
  if (!t.doc.model || t.doc.model.isDisposed()) return;
  const om = mon.editor.createModel(orig, t.doc.model.getLanguageId());
  try { diffEd.setModel({ original: om, modified: t.doc.model }); } catch { om.dispose(); return; }
  const done = new Promise((res) => { const d = diffEd.onDidUpdateDiff(() => { d.dispose(); res(); }); setTimeout(res, 2500); });
  await done;
  if (t.doc.model.isDisposed()) { try { diffEd.setModel(null); } catch { /* ignore */ } om.dispose(); return; }
  const changes = diffEd.getLineChanges() || []; const decos = [];
  for (const c of changes) {
    const [os, oe, ms, me] = [c.originalStartLineNumber, c.originalEndLineNumber, c.modifiedStartLineNumber, c.modifiedEndLineNumber];
    if (me === 0) decos.push({ range: new mon.Range(Math.max(1, ms), 1, Math.max(1, ms), 1), options: { isWholeLine: false, linesDecorationsClassName: "cf-gutter-del" } });
    else decos.push({ range: new mon.Range(ms, 1, me, 1), options: { linesDecorationsClassName: oe === 0 ? "cf-gutter-add" : "cf-gutter-mod" } });
    void os;
  }
  coll.set(decos); diffEd.setModel(null); om.dispose();
}
