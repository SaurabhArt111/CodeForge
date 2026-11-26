// Linux environment (proot + Alpine, Debian or Ubuntu): status, system picker, setup wizard, package presets.
// Gives the terminal real npm / node / python / git / gcc. Packages are named the Alpine way; `pkg` translates them for apt.
import { h, icon, P, fmtBytes } from "../core/util.js";
import * as jobs from "../core/jobs.js";
let A;
export async function init(api) { A = api; }

export const PRESETS = [
  { id: "nodejs", label: "Node.js + npm", pkgs: "nodejs npm", on: true, note: "run, npm install, vite, express…" },
  { id: "git", label: "Git + OpenSSH", pkgs: "git openssh-client", on: true, note: "clone / commit / push from the terminal" },
  { id: "python", label: "Python 3 + pip", pkgs: "python3 py3-pip", on: true },
  { id: "build", label: "Build tools (gcc, g++, make, cmake)", pkgs: "build-base cmake", on: false, note: "~200 MB" },
  { id: "tools", label: "Handy tools (ripgrep, jq, zip, tmux, vim, htop)", pkgs: "ripgrep jq zip unzip tmux vim htop tree", on: true },
  { id: "php", label: "PHP", pkgs: "php83 php83-cli", on: false },
  { id: "go", label: "Go", pkgs: "go", on: false },
  { id: "java", label: "OpenJDK 17", pkgs: "openjdk17", on: false, note: "~300 MB" },
  { id: "ruby", label: "Ruby", pkgs: "ruby", on: false },
  { id: "rust", label: "Rust (cargo)", pkgs: "rust cargo", on: false, note: "~400 MB" },
];

export const status = () => A.N.env.status();

export async function ensureInstalled({ ask = true } = {}) {
  const s = await status();
  if (s.installed && s.setupDone) return true;
  if (!ask) return false;
  await wizard(); return false;
}

/** The wizard is the single entry point: installs the rootfs if needed, then installs the chosen packages inside a terminal. */
export async function wizard() {
  const s = await status();
  if (!s.supported) return A.modal({ title: "Linux environment", body: `This device architecture (${(await A.info()?.abi) || s.arch || "unknown"}) is not supported by the bundled proot. You can still use the Android shell (sh/toybox).`, buttons: [{ label: "OK", primary: true }] });
  const checks = PRESETS.map((p) => ({ ...p, el: h("input", { type: "checkbox", checked: p.on }) }));
  const body = h("div",
    h("p.modal-text", s.installed ? `${s.name || "Linux"} is installed. Choose packages to install or refresh.` : `Install a real Linux userland (${s.name || "Alpine Linux"}, ${s.distro && s.distro !== "alpine" ? "~30 MB" : "~4 MB"} + packages) so the terminal can run node, npm, python, git and more.`),
    h("p.modal-detail", "Linux system: ", h("b", s.name || "Alpine Linux"), " · ", h("a", { href: "#", onclick: (e) => { e.preventDefault(); document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); setTimeout(() => distroPicker(), 150); } }, "choose Alpine, Debian or Ubuntu")),
    h("div", { style: { display: "grid", gap: "8px", margin: "8px 0" } }, ...checks.map((c) => h("label", { style: { display: "flex", gap: "10px", alignItems: "center", cursor: "pointer" } }, c.el, h("span", c.label, c.note ? h("span.muted", { style: { marginLeft: "8px", fontSize: "calc(11px * var(--fz))" } }, c.note) : null)))),
    h("p.modal-detail", "Needs an internet connection. Files live in the app's private storage; your projects stay in the workspace and are visible in the terminal at ~/ (the workspace folder)."));
  const r = await A.modal({ title: s.installed ? "Update Linux packages" : "Set up Linux environment", body, width: 520, buttons: [{ label: "Cancel", value: undefined }, { label: s.installed ? "Install packages" : "Install", primary: true, value: "go" }] });
  if (r !== "go") return false;
  const pkgs = checks.filter((c) => c.el.checked).map((c) => c.pkgs).join(" ");
  if (!s.installed) { if (!(await install())) return false; }
  await runSetup(pkgs);
  return true;
}

export async function install(distro = "") {
  const st = await status().catch(() => ({})); const d = (st.distros || []).find((x) => x.id === (distro || st.distro)); const name = d?.name || st.name || "Alpine Linux";
  const r = await jobs.run({ title: "Installing " + name, kind: "linux", icon: "server-environment", blocking: true, cancellable: true, doneText: name + " installed" }, async (job) => {
    job.update(`Downloading ${name}…`, -1);
    job.on("env.progress", (d) => job.update(`${d.msg || d.stage}`, d.total ? d.done / d.total : -1));
    job.watchBytes("Downloading " + name);
    return A.N.env.install(job.id, distro);
  });
  if (!r.ok && !r.cancelled) A.toastError(new Error(r.error));
  return r.ok;
}

export async function runSetup(pkgs) {
  const info = A.info();
  const script = P.join(info.paths.env, "setup-linux.sh");
  const t = await A.term.create({ mode: "linux", title: "linux setup", command: ["sh", script, ...pkgs.split(/\s+/).filter(Boolean)], cwd: A.ws.root || info.paths.home });
  if (t) { t.onExit = (code) => { if (code === 0) A.toast("Linux environment ready", { kind: "success" }); A.refreshExplorer(); }; }
  return t;
}

export async function reset(distro = "") {
  const st = await status().catch(() => ({})); const name = ((st.distros || []).find((x) => x.id === (distro || st.distro)) || {}).name || "the Linux environment";
  if (!(await A.confirm(`Remove ${name} and all packages installed in it? Your projects are not affected.`, { title: "Remove Linux system", okLabel: "Remove", danger: true }))) return false;
  await A.N.env.reset(distro); A.toast(name + " removed");
  if (!distro || distro === st.distro) await jobs.askRestart("The Linux system was removed. Restarting closes terminals that were still using it and frees what they held.", { mode: "app", title: "Restart CodeForge?" });
  return true;
}

const DISTRO_INFO = {
  alpine: "Smallest and fastest to install. Packages with apk (or pkg). Uses musl, so a few prebuilt binaries made for other systems do not run.",
  debian: "The classic server system. Packages with apt (or pkg). Most Linux guides and prebuilt tools work as written.",
  ubuntu: "Popular and well documented; matches most tutorials and VPS setups. Packages with apt (or pkg).",
};

/**
 * Pick, install, switch or remove Linux systems. Several can be installed side by side; new terminals use the active one.
 * Resolves true when a system is installed and active at the end.
 */
export async function distroPicker() {
  const s = await status().catch(() => ({}));
  const native = A.N.mode() === "android" || A.N.mode() === "devhost";
  if (!native || s.supported === false) {
    await A.modal({ title: "Linux system", body: native ? "This device's CPU is not supported by the bundled proot." : "Linux systems run in the CodeForge Android app. The web version has a small built-in shell.", buttons: [{ label: "OK", primary: true }] });
    return false;
  }
  const list = s.distros || [{ id: "alpine", name: "Alpine Linux", pm: "apk", size: "~4 MB", installed: s.installed, active: true }];
  let choice;
  const rows = list.map((d) => h("div.distro" + (d.active ? ".on" : ""),
    h("div.distro-top", h("b", d.name), d.active && d.installed ? h("span.distro-tag.on", "in use") : d.installed ? h("span.distro-tag", "installed") : h("span.distro-tag.off", d.size + " download")),
    h("div.muted.distro-info", DISTRO_INFO[d.id] || ""),
    h("div.distro-meta", d.installed ? `${d.version || ""} · packages: ${d.pm}${d.setupDone ? "" : " · setup not finished"}` : `packages: ${d.pm}`),
    h("div.distro-acts",
      d.installed && !d.active ? h("button.btn.small.primary", { onclick: () => done({ act: "use", id: d.id }) }, "Use this") : null,
      !d.installed ? h("button.btn.small.primary", { onclick: () => done({ act: "install", id: d.id }) }, "Install") : null,
      d.installed && !d.setupDone ? h("button.btn.small", { onclick: () => done({ act: "setup", id: d.id }) }, "Finish setup") : null,
      d.installed ? h("button.btn.small.danger", { onclick: () => done({ act: "remove", id: d.id }) }, "Remove") : null)));
  let done;
  const p = A.modal({ title: "Linux system", width: 560, className: "distro-modal",
    body: h("div", h("p.modal-text", "Choose the Linux your terminals run. You can install several and switch at any time; they all share your workspace at ~. Install anything with “pkg install <name>”."), h("div.distros", ...rows)),
    buttons: [{ label: "Close", value: undefined }],
    onOpen: ({ close }) => { done = (v) => { choice = v; close(v); }; } });
  const r = await p; choice = choice || r;
  if (!choice?.act) return !!s.installed;
  if (choice.act === "use") {
    const st = await A.N.env.select(choice.id);
    A.toast(`${st.name} is now used by new terminals`, { kind: "success" });
    if (!st.setupDone) await runSetup(defaultPkgs());
    return true;
  }
  if (choice.act === "remove") { await reset(choice.id); return false; }
  if (choice.act === "setup") { await A.N.env.select(choice.id).catch(() => {}); await runSetup(defaultPkgs()); return true; }
  if (choice.act === "install") {
    if (!(await install(choice.id))) return false;
    await runSetup(defaultPkgs());
    return true;
  }
  return false;
}
const defaultPkgs = () => PRESETS.filter((p) => p.on).map((p) => p.pkgs).join(" ");
