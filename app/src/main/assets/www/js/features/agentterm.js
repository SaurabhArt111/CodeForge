// Terminals for the AI agent: it can open several terminals (one per job: dev server, tests, installs …), run commands in them,
// read what they print, answer prompts, and set up the Linux tools it needs, the way Claude Code or Codex work in a shell.
// Everything it does is visible: its terminals are normal tabs in the terminal panel (marked with a sparkle) that you can watch or take over.
import { P } from "../core/util.js";

let A, hooks;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let seq = 0;

export async function init(api, h) { A = api; hooks = h; }   // h = { approve(title, detail, opts) -> Promise<boolean>, cancelled() -> boolean }

// ---------------------------------------------------------------- tool definitions (merged into the agent's tool list by ai.js)
const T = (name, description, props, req = []) => ({ name, description, props, req });
export const TOOLS = [
  T("terminal_open", "Open a NEW terminal tab of your own, for one job (for example 'dev-server', 'tests', 'install'). Use several terminals to work in parallel: a long-running server in one, commands in another. Returns the terminal name to use with the other terminal_* tools.",
    { name: { type: "string", description: "short name, e.g. dev-server" }, cwd: { type: "string", description: "folder relative to the project root (default: project root)" } }, ["name"]),
  T("terminal_run", "Run a shell command in one of YOUR terminals and wait for it to finish (up to timeout_seconds). The terminal keeps its state (cd, exports, venv) between calls. Returns the output and the exit code. For servers, watchers or anything that never ends use background=true: it returns after a few seconds with the first output and leaves the command running; check on it later with terminal_read. Opens a terminal named 'main' if you have none.",
    { terminal: { type: "string", description: "terminal name from terminal_open (default: main)" }, command: { type: "string" }, timeout_seconds: { type: "number", description: "default 120, max 900" }, background: { type: "boolean", description: "do not wait for the command to finish" } }, ["command"]),
  T("terminal_read", "Read recent output of a terminal (yours or the user's). By default only output printed since you last looked; use lines for the last N lines instead. wait_seconds lets you wait for new output.",
    { terminal: { type: "string" }, lines: { type: "number" }, wait_seconds: { type: "number", description: "wait up to this long for output to appear and settle (max 60)" } }, []),
  T("terminal_send", "Type into one of YOUR terminals: answer a prompt (text, e.g. 'y'), or press keys such as Ctrl+C to stop a running command. keys is a list of: C-c, C-d, C-z, Enter, Tab, Esc, Up, Down, Left, Right, Backspace, or a single character.",
    { terminal: { type: "string" }, text: { type: "string", description: "text to type (Enter is pressed after it unless enter=false)" }, enter: { type: "boolean" }, keys: { type: "array", items: { type: "string" } } }, ["terminal"]),
  T("terminal_list", "List all open terminals: name, whether alive, folder, whether a command is running, and the last line of output.", {}, []),
  T("terminal_close", "Close one of YOUR terminals when its job is finished (kills whatever is running in it).", { terminal: { type: "string" } }, ["terminal"]),
  T("environment_status", "Check which developer tools are available to terminals: whether the Linux environment (Alpine, Debian or Ubuntu with node, npm, git, python, gcc …) is installed, which system is active, and which commands exist. Call this before relying on a tool.", {}, []),
  T("install_packages", "Install developer tools or libraries. manager 'pkg' installs Linux tools (git, nodejs, npm, python3, py3-pip, build-base, ripgrep …) with the active system's package manager (apk on Alpine, apt on Debian/Ubuntu; Alpine names are translated) and needs the Linux environment ('apk' and 'apt' are accepted as aliases); 'npm' installs into the project (add global=true for -g); 'pip' installs Python packages. Runs in a visible terminal. The user is asked first.",
    { manager: { type: "string", enum: ["pkg", "apk", "apt", "npm", "pip"] }, packages: { type: "array", items: { type: "string" } }, global: { type: "boolean" } }, ["manager", "packages"]),
  T("setup_environment", "Install the Linux environment (the active system: Alpine by default, or Debian / Ubuntu if the user chose one) with node, npm, git, python … if it is missing, so terminals have real tools. Downloads about 4 MB (Alpine) or 30 MB (Debian / Ubuntu) plus the packages. The user is asked first. Use when environment_status says it is not installed.",
    { packages: { type: "array", items: { type: "string" }, description: "extra apk packages (default: nodejs npm git python3 py3-pip ripgrep)" } }, []),
];
export const READONLY = new Set(["terminal_read", "terminal_list", "environment_status"]);
export const has = (name) => TOOLS.some((t) => t.name === name);

// ---------------------------------------------------------------- permissions
// Even with "run without asking" these always ask: they can destroy the device's files or hand control to a downloaded script.
const DANGER = [
  /\brm\s+(-[a-zA-Z]*[rRfF][a-zA-Z]*\s+)+(\/|~|\$HOME|\*|\.\.?)(\s|$|\/\*)/, /\bmkfs(\.\w+)?\b/, /\bdd\b[^\n]*\bof=\/dev\//, />\s*\/dev\/(sd|mmcb|nvme|block)/, /:\(\)\s*\{\s*:\|:&\s*\}/,
  /\b(curl|wget)\b[^\n|]*\|\s*(sudo\s+)?(sh|bash|zsh)\b/, /\bchmod\s+(-R\s+)?[0-7]*777\s+\//, /\bgit\s+push\b[^\n]*(--force|-f\b)/, /\bgit\s+reset\s+--hard\b/, /\bgit\s+clean\s+-[a-z]*f/, /\bshutdown\b|\breboot\b/,
];
export const allowRun = (title, detail) => allow(title, detail);
export const isDangerous = (cmd) => DANGER.some((re) => re.test(cmd));
let queue = Promise.resolve();   // one prompt at a time, even when the agent starts several commands together
const serial = (fn) => (queue = queue.then(fn, fn));
async function allow(title, detail) {
  const mode = A.settings.get("ai.terminalAccess");
  if (mode === "off") throw new Error("Terminal access for the assistant is turned off (Settings → AI Assistant → Terminal access).");
  const danger = isDangerous(detail);
  if (mode === "auto" && !danger) return true;
  return serial(() => hooks.approve(danger ? title + " (risky)" : title, detail, { force: danger }));
}

// ---------------------------------------------------------------- helpers
const termMap = () => new Map(A.term.list().map((t) => [t.id, t]));
const nameOf = (t) => t.agentName || t.title || t.id;
const agentTerms = () => A.term.list().filter((t) => t.agentName);
function find(ref, { own = false } = {}) {
  const all = own ? agentTerms() : A.term.list().filter((t) => !t.embedded);
  if (!ref) return own ? all.filter((t) => t.alive).pop() || null : A.term.get() || null;
  const r = String(ref).toLowerCase();
  return all.find((t) => t.id === ref || nameOf(t).toLowerCase() === r || (t.agentName || "").toLowerCase() === r) || all.find((t) => nameOf(t).toLowerCase().includes(r)) || null;
}
const lastLines = (txt, n) => { const l = txt.replace(/\s+$/, "").split("\n"); return l.slice(-n).join("\n"); };
const clip = (s, max = 8000) => (s.length > max ? "…(earlier output trimmed)\n" + s.slice(-max) : s);
const projRel = (p) => (p && A.ws.root ? P.join(A.ws.root, p) : A.ws.root);
async function shellMode() { try { const s = await A.N.env.status(); return s.installed ? "linux" : "host"; } catch { return "host"; } }

async function open(name, cwd, { quiet = false } = {}) {
  const max = Math.max(1, +A.settings.get("ai.maxTerminals") || 6);
  const live = agentTerms().filter((t) => t.alive);
  if (live.length >= max) throw new Error(`Already ${live.length} terminals open (limit ${max}). Close one with terminal_close, or reuse one: ${live.map(nameOf).join(", ")}`);
  let nm = String(name || "task").trim().replace(/[^\w .-]+/g, "-").slice(0, 24) || "task"; const base = nm; let k = 2;
  while (find(nm, { own: true })?.alive) nm = `${base}-${k++}`;
  const prev = A.term.get()?.id;
  const t = await A.term.create({ cwd: projRel(cwd), mode: await shellMode(), title: "AI · " + nm, focus: false });
  if (!t) throw new Error("Could not open a terminal (the Linux environment may be missing; use setup_environment).");
  t.agentName = nm; t.title = "AI · " + nm; A.term.retitle();
  if (quiet && prev && prev !== t.id) A.term.select(prev);
  await sleep(700);     // let the shell print its prompt
  return t;
}

const KEYS = { "C-c": "\x03", "C-d": "\x04", "C-z": "\x1a", "C-l": "\x0c", Enter: "\r", Tab: "\t", Esc: "\x1b", Up: "\x1b[A", Down: "\x1b[B", Right: "\x1b[C", Left: "\x1b[D", Backspace: "\x7f", Space: " " };

// ---------------------------------------------------------------- tools
export async function call(name, i, ctx = {}) {
  const ok = (output) => ({ output, isError: false }), bad = (e) => ({ output: String(e?.message || e), isError: true });
  try {
    switch (name) {
      case "terminal_open": {
        if (!A.ws.isOpen) return bad("Open a project folder first");
        if (A.settings.get("ai.terminalAccess") === "off") return bad("Terminal access for the assistant is turned off (Settings → AI Assistant → Terminal access).");
        const t = await open(i.name, i.cwd);
        return ok(`Opened terminal "${t.agentName}" (${t.mode === "linux" ? "Linux" : "Android sh"}) in ${t.cwd || A.ws.root}. Use terminal_run with terminal="${t.agentName}".`);
      }
      case "terminal_run": return await run(i, ctx);
      case "terminal_read": {
        const t = find(i.terminal); if (!t) return bad(`No terminal "${i.terminal || ""}". Use terminal_list.`);
        const wait = Math.min(60, Math.max(0, +i.wait_seconds || 0)); const from = i.lines ? 0 : (t.readPos ?? A.term.logEnd(t));
        if (wait) { const until = Date.now() + wait * 1000; let seen = A.term.logEnd(t); while (Date.now() < until && !ctx.cancelled?.()) { await sleep(250); const now = A.term.logEnd(t); if (now !== seen) { seen = now; await sleep(600); if (A.term.logEnd(t) === now) break; } else if (seen > from && Date.now() - (t.lastOut || 0) > 800) break; } }
        const end = A.term.logEnd(t); t.readPos = end;
        const txt = A.term.logText(t, i.lines ? Math.max(0, end - 60_000) : from);
        const out = i.lines ? lastLines(txt, Math.min(400, +i.lines || 60)) : txt.replace(/\s+$/, "");
        return ok(`[${nameOf(t)}${t.alive ? "" : " – exited " + (t.exitCode ?? "")}]\n` + (out ? clip(out) : "(no new output)"));
      }
      case "terminal_send": {
        const t = find(i.terminal, { own: true }); if (!t) return bad(`No terminal of yours named "${i.terminal}". Open one with terminal_open (the user's own terminals are read-only for you).`);
        if (!t.alive) return bad("That terminal has exited. Open a new one.");
        const typed = [i.text != null ? String(i.text) + (i.enter === false ? "" : "\r") : "", ...(i.keys || []).map((k) => KEYS[k] ?? (String(k).length === 1 ? k : ""))].join("");
        if (!typed) return bad("Nothing to send (give text or keys)");
        const sensitive = i.text != null && isDangerous(String(i.text));
        if (sensitive && !(await allow("Type into terminal?", String(i.text)))) return bad("Rejected by user");
        const from = A.term.logEnd(t); await A.N.term.writeStr(t.id, typed);
        if ((i.keys || []).some((k) => k === "C-c" || k === "C-d" || k === "C-z")) t.interrupted = Date.now();   // an interrupted shell line never prints its completion marker
        await sleep(900); refreshBusy(t);
        return ok(`[${nameOf(t)}]\n` + (clip(A.term.logText(t, from).replace(/\s+$/, ""), 3000) || "(sent, no output yet)"));
      }
      case "terminal_list": {
        const rows = A.term.list().filter((t) => !t.embedded).map((t) => (refreshBusy(t), t)).map((t) => `${nameOf(t)}${t.agentName ? " (yours)" : " (user's)"} · ${t.alive ? (t.busyCmd ? "running: " + t.busyCmd.slice(0, 50) : "idle") : "exited " + (t.exitCode ?? "")} · ${t.mode} · ${t.cwd || ""}\n    ${lastLines(A.term.logText(t, Math.max(0, A.term.logEnd(t) - 600)), 1).slice(0, 120)}`);
        return ok(rows.length ? rows.join("\n") : "No terminals open.");
      }
      case "terminal_close": {
        const t = find(i.terminal, { own: true }); if (!t) return bad(`No terminal of yours named "${i.terminal}".`);
        A.term.closeTerm(t.id); return ok(`Closed ${nameOf(t)}`);
      }
      case "environment_status": return ok(await envStatus());
      case "setup_environment": return await setup(i, ctx);
      case "install_packages": return await install(i, ctx);
      default: return bad("unknown tool " + name);
    }
  } catch (e) { return bad(e); }
}

/** a command that was left running (background / timeout) has finished once its marker appeared in the terminal */
function refreshBusy(t) {
  if (!t.busyId) return;
  // after Ctrl+C the shell drops the rest of the line (so no marker): a prompt at the end of the output means it is free again
  if (t.interrupted && Date.now() - (t.lastOut || 0) > 400 && /[#$%>] ?$/.test(A.term.logText(t, Math.max(0, A.term.logEnd(t) - 300)).replace(/\s+$/, "") + " ")) { t.busyCmd = null; t.busyId = 0; t.interrupted = 0; return; }
  if (!t.alive || new RegExp(`__CFDONE_${t.busyId}_\\d+__`).test(A.term.logText(t, t.busyStart || 0))) { t.busyCmd = null; t.busyId = 0; }
}
async function run(i, ctx) {
  const ok = (output, isError = false) => ({ output, isError });
  if (!A.ws.isOpen) return ok("Open a project folder first", true);
  const command = String(i.command || "").replace(/\s+$/, ""); if (!command) return ok("empty command", true);
  if (!i.__preapproved && !(await allow("Run in terminal?", command))) return ok("Rejected by user", true);
  let t = find(i.terminal, { own: true });
  if (!t) { if (i.terminal && i.terminal !== "main") { const other = find(i.terminal); if (other) return ok(`"${nameOf(other)}" is the user's terminal. Open your own with terminal_open.`, true); } t = await open(i.terminal || "main"); }
  if (!t.alive) return ok(`Terminal "${nameOf(t)}" has exited. Open a new one with terminal_open.`, true);
  refreshBusy(t);
  if (t.busyCmd) return ok(`"${nameOf(t)}" is still running: ${t.busyCmd.slice(0, 80)}. Wait with terminal_read, stop it with terminal_send keys ["C-c"], or use another terminal.`, true);
  const bg = !!i.background, id = ++seq, start = A.term.logEnd(t), maxMs = Math.min(900, Math.max(5, +i.timeout_seconds || 120)) * 1000;
  const mark = new RegExp(`__CFDONE_${id}_(\\d+)__`);
  // The marker is part of the SAME shell line as the command, so the shell prints it when the command ends and nothing is ever typed into
  // a running program (a dev server would take stray keystrokes as shortcuts). A literal %s in the echoed line cannot match the real marker.
  let line = command.replace(/[;\s]+$/, ""), endsBg = /(^|[^&])&$/.test(line), marked = !endsBg;
  const simple = !/[\n#]/.test(line) && !/[|\\]$/.test(line);
  const payload = endsBg ? line : (simple ? line : `{ ${line}\n}`) + ` ; printf '\\n__CFDONE_${id}_%s__\\n' $?`;
  t.busyCmd = endsBg ? null : command.replace(/\s+/g, " "); t.busyId = endsBg ? 0 : id; t.busyStart = start;
  await A.N.term.writeStr(t.id, payload + "\r");
  const t0 = Date.now(); let code = null, state = "";
  while (true) {
    await sleep(bg ? 300 : 200);
    const txt = A.term.logText(t, start); const m = marked ? mark.exec(txt) : null;
    if (m) { code = +m[1]; break; }
    if (!t.alive) { state = `terminal exited (code ${t.exitCode ?? "?"})`; break; }
    if (ctx.cancelled?.()) { state = "stopped by you; the command may still be running in the terminal"; break; }
    const el = Date.now() - t0;
    if ((bg || endsBg) && el >= Math.min(maxMs, (endsBg ? 1.5 : +i.settle_seconds || 5) * 1000)) { state = endsBg ? "started in the shell's background" : "running in the background"; break; }
    if (!bg && el >= maxMs) { state = `still running after ${Math.round(el / 1000)} s (not finished)`; break; }
    if (!bg && el > 8000 && Date.now() - (t.lastOut || 0) > 6000 && /(\?|:|\[[yYnN]\/[yYnN]\]|\([yYnN]\/[yYnN]\)|password|passphrase|press (enter|any key))\s*$/i.test(txt.replace(/\s+$/, ""))) { state = "waiting for input (answer with terminal_send)"; break; }
  }
  if (code !== null || !t.alive) { t.busyCmd = null; t.busyId = 0; }
  let out = A.term.logText(t, start).replace(new RegExp(`\\n?.*__CFDONE_${id}_(?:\\d+|%s)__.*\\n?`, "g"), "\n");
  out = out.split("\n").filter((l, k) => !(k === 0 && l.includes(command.split("\n")[0].slice(0, 30)))).join("\n").replace(/^\s*\n/, "").replace(/\s+$/, "");
  t.readPos = A.term.logEnd(t); A.ws.invalidate?.();
  const head = code !== null ? `exit code ${code}` : state;
  return ok(`[${nameOf(t)}] ${head}\n${out ? clip(out) : "(no output)"}${code === null && !bg && t.alive ? `\nThe command is still running. Use terminal_read to follow it${state.startsWith("waiting") ? ", or terminal_send to answer" : ""}, or terminal_send keys ["C-c"] to stop it.` : ""}`, code !== null && code !== 0);
}

async function envStatus() {
  const s = await A.N.env.status().catch(() => ({}));
  const lines = [`Linux environment (${s.name || "Alpine Linux"}, proot; packages with 'pkg install' → ${s.pm || "apk"}): ${s.installed ? (s.setupDone ? "installed and set up" : "installed, setup not finished") : s.supported === false ? "not supported on this device" : "NOT installed"}.`];
  const r = await A.N.proc.exec({ line: 'for c in node npm npx git python3 pip3 gcc make rg curl unzip; do command -v $c >/dev/null 2>&1 && printf "%s " $c; done; echo; uname -m', cwd: A.ws.root || undefined, timeoutMs: 20000 }).catch(() => null);
  if (r) { const [have, arch] = r.out.trim().split("\n"); lines.push(`Commands found in the shell the terminals use (${s.installed ? "Linux" : "Android sh"}): ${have?.trim() || "none"}`, `Architecture: ${arch || "?"}`); }
  if (!s.installed) lines.push("Without the Linux environment there is no node, npm, git or python. Call setup_environment to install it.");
  return lines.join("\n");
}

async function setup(i, ctx) {
  const ok = (output, isError = false) => ({ output, isError });
  const s = await A.N.env.status();
  if (s.supported === false) return ok("This device's CPU architecture is not supported by the bundled Linux environment.", true);
  const pkgs = (Array.isArray(i.packages) && i.packages.length ? i.packages : ["nodejs", "npm", "git", "python3", "py3-pip", "ripgrep"]).map(String);
  if (pkgs.some((p) => !/^[a-z0-9][a-z0-9._+-]*$/.test(p))) return ok("Invalid package name", true);
  if (s.installed && s.setupDone) return ok("The Linux environment is already installed. Use install_packages with manager 'pkg' for more tools.");
  if (!(await allow("Install the Linux environment?", `Download ${s.name || "Alpine Linux"} (${s.distro && s.distro !== "alpine" ? "about 30 MB" : "about 4 MB"}) and install: ${pkgs.join(" ")}\nNeeds internet; stored in the app's private storage.`))) return ok("Rejected by user", true);
  const env = await A.feat("env");
  if (!s.installed) { if (!(await env.install())) return ok("The Linux environment could not be installed (see the notification for the reason).", true); }
  const t = await env.runSetup(pkgs.join(" "));
  if (!t) return ok("Linux was installed but the package setup could not start.", true);
  t.agentName = "setup"; t.title = "AI · setup"; A.term.retitle();
  const t0 = Date.now(); while (t.alive && Date.now() - t0 < 20 * 60_000 && !ctx.cancelled?.()) await sleep(1000);
  return ok(t.alive ? "Setup is still running in the 'setup' terminal. Check it with terminal_read." : (t.exitCode === 0 ? `Linux environment ready with: ${pkgs.join(" ")}` : `Setup finished with exit code ${t.exitCode}. Output:\n${clip(lastLines(A.term.logText(t, 0), 30), 2500)}`), !t.alive && t.exitCode !== 0);
}

async function install(i, ctx) {
  const ok = (output, isError = false) => ({ output, isError });
  const pk = (Array.isArray(i.packages) ? i.packages : [String(i.packages || "")]).map(String).filter(Boolean);
  if (!pk.length) return ok("No packages given", true);
  if (pk.some((p) => !/^[@a-zA-Z0-9][\w@.\/~^=<>+:-]*$/.test(p))) return ok("Invalid package name", true);
  const mgr = i.manager; let cmd;
  if (mgr === "pkg" || mgr === "apk" || mgr === "apt") { const s = await A.N.env.status(); if (!s.installed) return ok("Linux packages need the Linux environment. Call setup_environment first.", true); cmd = `pkg install ${pk.join(" ")}`; }
  else if (mgr === "npm") cmd = `npm install ${i.global ? "-g " : ""}${pk.join(" ")}`;
  else if (mgr === "pip") cmd = `pip3 install ${pk.join(" ")}`;
  else return ok("manager must be pkg, npm or pip", true);
  if (!(await allow(`Install with ${mgr}?`, cmd))) return ok("Rejected by user", true);
  const t = find("install", { own: true }) || await open("install");
  return call_run(t, cmd, ctx);
}
const call_run = (t, command, ctx) => run({ terminal: t.agentName, command, timeout_seconds: 600, __preapproved: true }, ctx);
