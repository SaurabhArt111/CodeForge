// Linux environment (proot + Alpine): status, setup wizard, package presets. Gives the terminal real npm / node / python / git / gcc.
import { h, icon, P, fmtBytes } from "../core/util.js";
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
    h("p.modal-text", s.installed ? "Alpine Linux is installed. Choose packages to install or refresh." : "Install a real Linux userland (Alpine, ~4 MB + packages) so the terminal can run node, npm, python, git and more."),
    h("div", { style: { display: "grid", gap: "8px", margin: "8px 0" } }, ...checks.map((c) => h("label", { style: { display: "flex", gap: "10px", alignItems: "center", cursor: "pointer" } }, c.el, h("span", c.label, c.note ? h("span.muted", { style: { marginLeft: "8px", fontSize: "11px" } }, c.note) : null)))),
    h("p.modal-detail", "Needs an internet connection. Files live in the app's private storage; your projects stay in the workspace and are visible in the terminal at ~/ (the workspace folder)."));
  const r = await A.modal({ title: s.installed ? "Update Linux packages" : "Set up Linux environment", body, width: 520, buttons: [{ label: "Cancel", value: undefined }, { label: s.installed ? "Install packages" : "Install", primary: true, value: "go" }] });
  if (r !== "go") return false;
  const pkgs = checks.filter((c) => c.el.checked).map((c) => c.pkgs).join(" ");
  if (!s.installed) { if (!(await install())) return false; }
  await runSetup(pkgs);
  return true;
}

async function install() {
  const b = A.busy("Downloading Alpine Linux…"); b.progress(-1);
  const off = A.N.on("env.progress", (d) => { b.update(`${d.msg || d.stage}`); if (d.total) b.progress(d.done / d.total); });
  try { await A.N.env.install(); return true; } catch (e) { A.toastError(e); return false; } finally { off(); b.close(); }
}

export async function runSetup(pkgs) {
  const info = A.info();
  const script = P.join(info.paths.env, "setup-linux.sh");
  const t = await A.term.create({ mode: "linux", title: "linux setup", command: ["sh", script, ...pkgs.split(/\s+/).filter(Boolean)], cwd: A.ws.root || info.paths.home });
  if (t) { t.onExit = (code) => { if (code === 0) A.toast("Linux environment ready", { kind: "success" }); A.refreshExplorer(); }; }
  return t;
}

export async function reset() {
  if (!(await A.confirm("Remove the Linux environment and all packages installed in it? Your projects are not affected.", { title: "Reset Linux", okLabel: "Remove", danger: true }))) return;
  await A.N.env.reset(); A.toast("Linux environment removed");
}
