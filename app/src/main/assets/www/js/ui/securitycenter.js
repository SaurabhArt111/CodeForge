// Security Centre: one page (and a top-level "Security" menu) for everything that protects the user's keys, files and projects.
import { N } from "../core/bridge.js";
import { settings } from "../core/settings.js";
import { bus } from "../core/events.js";
import { h, icon } from "../core/util.js";
import { toast, toastError, confirm } from "../core/ui.js";
import * as ed from "./editor.js";
import * as security from "./security.js";
import * as jobs from "../core/jobs.js";

export async function open(section) {
  bus.emit("sidebar:close");
  const t = await ed.openCustom("security", "Security", { iconName: "shield", render });
  if (section) setTimeout(() => [...document.querySelectorAll(".security-page h3")].find((x) => x.textContent === section)?.scrollIntoView({ block: "start", behavior: "smooth" }), 150);
  return t;
}

/** Menu items for the "Security" menu (menu bar + phone menu + command palette use the same list). */
export const menuItems = (run) => [
  { label: "Security Centre", icon: "shield", run: run("sec.open") }, { separator: true },
  { label: "Lock Now", icon: "lock", run: run("sec.lock") }, { label: "Set / Change PIN…", icon: "key", run: run("sec.pin") },
  { label: "API Keys…", icon: "key", run: run("sec.keys") }, { separator: true },
  { label: "Clear Clipboard", icon: "clippy", run: run("sec.clipboard") }, { label: "Permissions & Access", icon: "checklist", run: run("sec.perms") },
  { label: "Privacy: Clear Data…", icon: "trash", run: run("sec.privacy") },
];

function render(el) {
  el.classList.add("settings-page", "security-page");
  const body = h("div.settings-body"); el.append(body);
  const draw = async () => { try { await build(body, draw); } catch (e) { body.replaceChildren(h("p.err", e.message)); } };
  draw();
  const off = [bus.on("settings:changed", () => {}), bus.on("storage:changed", () => {})];
  el._off = () => off.forEach((f) => f());
}

const sw = (key, onchange) => { const el = h("div.switch" + (settings.get(key) ? ".on" : ""), { role: "switch", onclick: async () => { const n = !settings.get(key); if (onchange && (await onchange(n)) === false) return; settings.set(key, n); el.classList.toggle("on", n); } }); return el; };
const sel = (key, opts, cast = (v) => v) => { const s = h("select", { onchange: () => settings.set(key, cast(s.value)) }, opts.map(([v, l]) => h("option", { value: String(v), selected: String(v) === String(settings.get(key)) }, l))); return s; };
const row = (t, d, c) => h("div.set-row", h("div.set-info", h("div.set-label", t), d ? h("div.muted", d) : null), c);

async function build(body, redraw) {
  const [st, info, stored] = await Promise.all([security.status(), N.sys.info().catch(() => ({})), N.secret.names().catch(() => [])]);
  const [allFiles, notif] = await Promise.all([N.sys.hasAllFiles().catch(() => null), N.sys.notifyStatus().catch(() => null)]);
  const trust = settings.state.extTrust || {}, trusted = Object.keys(trust).filter((k) => trust[k]);
  const keys = stored.filter((n) => !n.startsWith("gitcred:"));
  const lockOn = !!settings.get("security.appLock"), exposed = !!(settings.get("live.lan") || settings.get("run.exposeHost"));

  // ---- check-up
  const checks = [
    st.pinSet || st.biometric ? ["good", "A lock is set up", st.pinSet ? "PIN" + (st.biometric ? " and fingerprint / face" : "") : "Fingerprint / face / screen lock"] : ["bad", "No PIN or device lock", "Anyone with your phone can reveal your API keys. Set a PIN below."],
    lockOn ? ["good", "App lock is on", "CodeForge asks to unlock when it opens."] : ["warn", "App lock is off", "Anyone who opens CodeForge can see your projects. Turn it on below."],
    keys.length ? ["good", `${keys.length} key${keys.length === 1 ? "" : "s"} stored encrypted`, "Android Keystore. Revealing one needs your PIN or fingerprint."] : ["good", "No API keys stored", ""],
    exposed ? ["warn", "Dev servers are reachable from other devices", "Anyone on the same Wi-Fi can open your running app. Turn this off on shared networks."] : ["good", "Dev servers are only reachable from this device", ""],
    +settings.get("security.clipboardClear") > 0 ? ["good", `Copied keys are wiped from the clipboard after ${settings.get("security.clipboardClear")} s`, ""] : ["warn", "Copied keys stay on the clipboard", "Other apps can read the clipboard. Choose an auto-clear time below."],
    trusted.length ? ["warn", `${trusted.length} extension${trusted.length === 1 ? "" : "s"} may run code`, "Review them under Permissions."] : ["good", "No extension runs its own code", ""],
  ];
  const worst = checks.some((c) => c[0] === "bad") ? "bad" : checks.some((c) => c[0] === "warn") ? "warn" : "good";
  const head = h("section.sec-card", h("div.sec-score",
    h("div.sec-badge." + worst, icon(worst === "good" ? "shield" : worst === "warn" ? "warning" : "error")),
    h("div.set-info", h("div.set-label", worst === "good" ? "Your setup looks good" : worst === "warn" ? "A few things could be tighter" : "Action needed"), h("div.muted", `${checks.filter((c) => c[0] === "good").length} of ${checks.length} checks passed`))),
    h("div", checks.map(([lvl, t, d]) => h("div.sec-check." + lvl, icon(lvl === "good" ? "pass" : lvl === "warn" ? "warning" : "error"), h("div.set-info", h("div", t), d ? h("div.muted", d) : null)))));

  // ---- app lock
  const lockSec = h("section.set-sec", h("h3", "App lock"),
    row("PIN", st.pinSet ? "A PIN is set (stored as a salted hash, never in plain text)." : "No PIN set.", h("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap" } },
      h("button.btn", { onclick: async () => { if (await security.setPinFlow()) redraw(); } }, st.pinSet ? "Change PIN" : "Set PIN"),
      st.pinSet ? h("button.btn.danger", { onclick: async () => { if (await security.removePin()) redraw(); } }, "Remove") : null)),
    row("Fingerprint / face / screen lock", st.biometric ? "Available on this device." : "Not available: enroll one in Android settings.", h("span.muted", st.biometric ? "✓" : "–")),
    row("Lock the app", "Ask to unlock when CodeForge opens or is reopened.", sw("security.appLock", async (n) => { if (n && !st.pinSet && !st.biometric) { toast("Set a PIN first", { kind: "warn" }); return false; } })),
    row("Unlock method", "Order used to unlock the app and to reveal keys.", sel("security.method", [["auto", "Fingerprint / face, then PIN"], ["pin", "PIN only"]])),
    row("Lock after leaving", "How long CodeForge may stay in the background before it locks.", sel("security.lockAfter", [[0, "Immediately"], [30, "30 seconds"], [60, "1 minute"], [300, "5 minutes"], [1800, "30 minutes"]], Number)),
    row("Hide content in the app switcher", "Blocks screenshots and blanks the recent-apps preview.", sw("security.secure")),
    row("Ask before exporting projects", "Needs PIN / fingerprint before a ZIP, bundle or transfer leaves the app.", sw("security.authExport")),
    row("Ask before opening a Linux terminal", "A Linux terminal can reach every file CodeForge owns.", sw("security.authTerminal")),
    row("Lock now", "Locks immediately and forgets the unlock.", h("button.btn", { disabled: !st.pinSet && !st.biometric, onclick: () => security.showLock() }, icon("lock"), " Lock")));

  // ---- keys
  const keyBox = h("div.keys");
  const keySec = h("section.set-sec", h("h3", "API keys"),
    h("p.muted.set-note", "Keys are encrypted with the Android Keystore. Viewing or copying one needs your PIN or fingerprint / face."), keyBox,
    row("Clear copied keys from the clipboard after", "Applies to “Copy” in the key list.", sel("security.clipboardClear", [[0, "Never"], [15, "15 seconds"], [30, "30 seconds"], [60, "1 minute"]], Number)),
    row("Erase all keys", `${keys.length} stored. This cannot be undone.`, h("button.btn.danger", { disabled: !keys.length, onclick: async () => {
      if (!(await confirm(`Delete all ${keys.length} stored keys, including your GitHub token?`, { title: "Erase all keys", okLabel: "Erase", danger: true }))) return;
      if (st.pinSet || st.biometric) if (!(await security.identify("Confirm to erase all keys"))) return;
      for (const n of stored) await N.secret.delete(n).catch(() => {});
      await N.github.signOut().catch(() => {}); toast("All keys erased"); redraw();
    } }, "Erase")));
  security.renderKeyManager(keyBox);

  // ---- network
  const netSec = h("section.set-sec", h("h3", "Network exposure"),
    row("Other devices can open my servers", exposed ? "ON: anyone on your Wi-Fi can open your Live Server and npm dev server previews." : "Off: previews are only reachable from this device.", sw("live.lan", async (n) => { settings.set("run.exposeHost", n); setTimeout(redraw, 0); })));

  // ---- permissions
  const plugins = await import("../features/plugins.js").then((m) => m.list()).catch(() => []);
  const permSec = h("section.set-sec", h("h3", "Permissions & access"),
    row("All files access", allFiles ? "Granted: CodeForge can browse Downloads, Documents and the SD card." : "Not granted: only CodeForge's own folders and the file pickers.", allFiles ? h("button.btn", { onclick: () => N.sys.openAppSettings().catch(() => {}) }, "Manage") : h("button.btn.primary", { onclick: async () => { await N.sys.requestAllFiles(); toast("Enable the switch, then come back to CodeForge", { timeout: 4000 }); } }, "Grant")),
    row("Notifications", notif ? "Granted: you are told when downloads, installs and exports finish." : "Not granted: background tasks finish silently.", notif ? h("span.muted", "✓") : h("button.btn.primary", { onclick: async () => { await N.sys.requestNotify(); setTimeout(redraw, 800); } }, "Allow")),
    h("h4.set-sub", "Extensions allowed to run code"),
    trusted.length ? trusted.map((id) => h("div.sec-perm", h("div.set-info", h("div.set-label", id), h("div.muted", "Runs in a sandbox without network access.")), h("button.btn.small", { onclick: async () => { delete settings.state.extTrust[id]; settings.saveState(); toast("You will be asked again the next time it needs to run"); redraw(); } }, "Revoke"))) : h("div.muted", "No extension has been allowed to run code."),
    h("h4.set-sub", "Plugins and what they declared"),
    plugins.length ? plugins.map((p) => h("div.sec-perm", h("div.set-info", h("div.set-label", p.manifest.name || p.id), h("div.muted", (p.manifest.permissions || []).join(", ") || "No special permissions")), h("button.btn.small", { onclick: async () => { const d = new Set(settings.state.pluginsDisabled || []); p.enabled ? d.add(p.id) : d.delete(p.id); settings.state.pluginsDisabled = [...d]; settings.saveState(); toast(p.enabled ? "Plugin disabled" : "Plugin enabled"); redraw(); } }, p.enabled ? "Disable" : "Enable"))) : h("div.muted", "No plugins installed."));

  // ---- privacy
  const clean = async (ids, what) => {
    if (!(await confirm(`Delete ${what}? This cannot be undone.`, { title: "Clear data", okLabel: "Delete", danger: true }))) return;
    const r = await jobs.run({ title: `Clearing ${what}`, kind: "storage", icon: "trash", silent: true, cancellable: false }, () => N.storage.clean(ids));
    if (r.ok) { toast(`Cleared ${what}`, { kind: "success" }); bus.emit("storage:changed"); } else toastError(new Error(r.error));
  };
  const privSec = h("section.set-sec", h("h3", "Privacy"),
    row("Clipboard", "Replaces whatever is on the clipboard with nothing.", h("button.btn", { onclick: () => security.clearClipboard() }, "Clear now")),
    row("AI chats", "Deletes saved assistant conversations and indexes.", h("button.btn.danger", { onclick: () => clean(["ai"], "AI chats") }, "Delete")),
    row("Crash reports", "Deletes the reports listed in Settings → Diagnostics.", h("button.btn.danger", { onclick: () => clean(["crashes"], "crash reports") }, "Delete")),
    row("GitHub sign-in", "Signs out and forgets the stored token.", h("button.btn.danger", { onclick: async () => { await N.github.signOut().catch(() => {}); toast("Signed out of GitHub"); redraw(); } }, "Sign out")));

  body.replaceChildren(h("h2.page-title", "Security Centre"), h("p.muted.set-note", `CodeForge ${info.version || ""}: everything that protects your keys, files and projects, in one place.`), head, lockSec, keySec, netSec, permSec, privSec);
}
