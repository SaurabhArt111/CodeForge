// Security: PIN + biometrics (native), unlock tokens, app lock overlay, API-key manager.
// Keys themselves never reach JS unless the user passes a PIN / biometric check (native refuses secret.reveal without a live token).
import { N } from "../core/bridge.js";
import { settings } from "../core/settings.js";
import { bus } from "../core/events.js";
import { h, icon, copyText } from "../core/util.js";
import { modal, toast, toastError, prompt, confirm } from "../core/ui.js";

let token = null, tokenAt = 0;
const TOKEN_MS = 85_000;   // native keeps tokens for 90 s
const fresh = () => token && Date.now() - tokenAt < TOKEN_MS;
export async function status() { try { return await N.auth.status(); } catch { return { pinSet: false, biometric: false }; } }

// ---------------------------------------------------------------- PIN entry dialog
function pinDialog({ title = "Enter PIN", message = "", confirmLabel = "Unlock", verify = true } = {}) {
  return new Promise((resolve) => {
    const err = h("div.field-error"); const input = h("input.input.pin-input", { type: "password", inputmode: "numeric", autocomplete: "off", autocapitalize: "off", placeholder: "PIN", maxlength: 32 });
    let timer = null, okValue;
    const submit = async () => {
      const v = input.value; if (v.length < 4) { err.textContent = "At least 4 characters"; return false; }
      if (!verify) { okValue = v; return true; }
      const r = await N.auth.verifyPin(v).catch((e) => ({ ok: false, error: e.message }));
      if (r.ok) { token = r.token; tokenAt = Date.now(); okValue = v; return true; }
      if (r.lockedMs > 0) { const end = Date.now() + r.lockedMs; const tick = () => { const left = Math.ceil((end - Date.now()) / 1000); err.textContent = left > 0 ? `Too many attempts. Try again in ${left}s` : ""; if (left <= 0) clearInterval(timer); }; clearInterval(timer); timer = setInterval(tick, 500); tick(); }
      else err.textContent = r.error || `Wrong PIN${r.remaining != null ? ` (${r.remaining} attempt${r.remaining === 1 ? "" : "s"} left before lockout)` : ""}`;
      input.value = ""; input.focus(); return false;
    };
    modal({
      title, width: 380, body: h("div", message ? h("p.modal-text", message) : null, input, err),
      buttons: [{ label: "Cancel", value: undefined }, { label: confirmLabel, primary: true, value: "ok", onClick: async () => ((await submit()) ? undefined : false) }],
      onOpen: ({ close }) => { input.addEventListener("keydown", async (e) => { if (e.key === "Enter") { e.preventDefault(); if (await submit()) close("ok"); } }); setTimeout(() => input.focus(), 60); },
    }).then((v) => { clearInterval(timer); resolve(v === "ok" ? okValue : undefined); });
  });
}

/** Asks the user to prove it's them (biometric, else PIN). Resolves to an unlock token, or null when cancelled. */
export async function identify(reason = "Confirm it's you") {
  if (fresh()) return token;
  const st = await status();
  const method = settings.get("security.method");
  if (!st.pinSet && !st.biometric) {
    const ok = await confirm("To view or change stored API keys you need a lock. Set a PIN now?", { title: "No lock configured", okLabel: "Set PIN" });
    if (!ok) return null;
    return (await setPinFlow()) ? token : null;
  }
  if (st.biometric && method !== "pin") {
    const r = await N.auth.biometric({ title: "CodeForge", subtitle: reason }).catch((e) => ({ ok: false, error: e.message }));
    if (r.ok) { token = r.token; tokenAt = Date.now(); return token; }
    if (!st.pinSet) { if (!r.cancelled) toast(r.error || "Biometric check failed", { kind: "error" }); return null; }
  }
  if (st.pinSet) { const ok = await pinDialog({ title: "Enter PIN", message: reason }); return ok !== undefined && fresh() ? token : null; }
  return null;
}

export async function setPinFlow() {
  const st = await status(); let old = null;
  if (st.pinSet) { const ok = await pinDialog({ title: "Current PIN", confirmLabel: "Next" }); if (ok === undefined) return false; old = ok; }
  const a = await prompt(st.pinSet ? "New PIN (4–32 characters)" : "Choose a PIN (4–32 characters)", { password: true, okLabel: "Next", validate: (v) => (v.length < 4 ? "At least 4 characters" : v.length > 32 ? "At most 32 characters" : null) }); if (!a) return false;
  const b = await prompt("Repeat the PIN", { password: true, okLabel: "Save PIN", validate: (v) => (v !== a ? "PINs don't match yet" : null) }); if (!b) return false;
  const r = await N.auth.setPin(a, old);
  if (!r.ok) { toast(r.error || (r.lockedMs ? "Locked – try again later" : "Could not set PIN"), { kind: "error" }); return false; }
  token = r.token; tokenAt = Date.now(); toast(st.pinSet ? "PIN changed" : "PIN set", { kind: "success" }); bus.emit("security:changed"); return true;
}
async function removePinFlow() {
  const ok = await pinDialog({ title: "Remove PIN", message: "Enter your current PIN to remove it.", confirmLabel: "Remove", verify: false }); if (ok === undefined) return;
  const r = await N.auth.clearPin(ok); if (!r.ok) return toast(r.error || "Wrong PIN", { kind: "error" });
  token = null; settings.set("security.appLock", false); toast("PIN removed"); bus.emit("security:changed");
}

// ---------------------------------------------------------------- app lock overlay
let lockEl = null, hiddenAt = 0, locking = null;
export function init() {
  applySecure();
  settings.on("change:security.secure", applySecure);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (!settings.get("security.appLock") || !hiddenAt) return;
    if ((Date.now() - hiddenAt) / 1000 >= settings.get("security.lockAfter")) showLock();
  });
}
function applySecure() { N.sys.setSecure(!!settings.get("security.secure")).catch(() => {}); }

/** Resolves once the app is unlocked (immediately when app lock is off or nothing is configured). */
export async function gateStartup() {
  if (!settings.get("security.appLock")) return;
  const st = await status();
  if (!st.pinSet && !st.biometric) return;   // nothing to unlock with → never lock the user out
  await showLock();
}
export function showLock() {
  if (locking) return locking;
  token = null; N.auth.lock().catch(() => {});
  locking = new Promise(async (resolve) => {
    const st = await status();
    const err = h("div.lock-err"); const pin = h("input.input.pin-input", { type: "password", inputmode: "numeric", placeholder: "PIN", autocomplete: "off", maxlength: 32 });
    let timer = null;
    const done = () => { lockEl.classList.add("out"); setTimeout(() => { lockEl?.remove(); lockEl = null; }, 300); clearInterval(timer); locking = null; resolve(); };
    const tryBio = async () => {
      const r = await N.auth.biometric({ title: "Unlock CodeForge", subtitle: "" }).catch(() => ({ ok: false }));
      if (r.ok) { token = r.token; tokenAt = Date.now(); done(); } else if (r.error && !r.cancelled) err.textContent = r.error;
    };
    const tryPin = async () => {
      const r = await N.auth.verifyPin(pin.value).catch((e) => ({ ok: false, error: e.message }));
      if (r.ok) { token = r.token; tokenAt = Date.now(); return done(); }
      pin.value = "";
      if (r.lockedMs > 0) { const end = Date.now() + r.lockedMs; clearInterval(timer); const tick = () => { const left = Math.ceil((end - Date.now()) / 1000); err.textContent = left > 0 ? `Too many attempts – wait ${left}s` : ""; if (left <= 0) clearInterval(timer); }; timer = setInterval(tick, 500); tick(); }
      else err.textContent = r.error || `Wrong PIN${r.remaining != null ? ` · ${r.remaining} left` : ""}`;
    };
    pin.addEventListener("keydown", (e) => { if (e.key === "Enter") tryPin(); });
    lockEl = h("div#lock", h("img.lock-logo", { src: "assets/logo.svg", alt: "" }), h("h2", "CodeForge is locked"),
      st.pinSet ? h("div.lock-pin", pin, h("button.btn.primary", { onclick: tryPin }, "Unlock")) : null,
      st.biometric ? h("button.btn.lock-bio", { onclick: tryBio }, icon("lock"), " Use fingerprint / face / screen lock") : null, err);
    document.body.append(lockEl);
    if (st.biometric && settings.get("security.method") !== "pin") setTimeout(tryBio, 250); else setTimeout(() => pin.focus(), 100);
  });
  return locking;
}

// ---------------------------------------------------------------- API key manager + security settings (rendered inside the Settings tab)
const NAMED = { "github.token": "GitHub token" };
async function providerList() {
  try { const { PROVIDERS } = await import("../features/ai.js"); return Object.entries(PROVIDERS).filter(([, p]) => p.key).map(([id, p]) => ({ name: p.key, label: p.label, help: p.help })); } catch { return []; }
}
export async function renderKeyManager(host) {
  host.replaceChildren(h("div.loader-block", h("div.spinner"), h("span", "Loading keys…")));
  const [provs, stored] = await Promise.all([providerList(), N.secret.names().catch(() => [])]);
  const rows = [...provs]; for (const n of ["github.token"]) if (!rows.some((r) => r.name === n)) rows.push({ name: n, label: NAMED[n] });
  for (const n of stored) if (!rows.some((r) => r.name === n) && !n.startsWith("gitcred:")) rows.push({ name: n, label: n });
  const list = h("div.keys");
  for (const r of rows) {
    const has = stored.includes(r.name);
    const masked = has ? await N.secret.mask(r.name).catch(() => "••••") : null;
    const val = h("code.key-val", masked || "not set");
    let hideT = null;
    const act = [];
    const setBtn = h("button.btn.small", { onclick: async () => { if (has && (await status()).pinSet && !(await identify("Confirm to replace the key"))) return; const v = await prompt(`${r.label} key`, { password: true, okLabel: "Save", message: r.help ? "Get one: " + r.help : "Stored encrypted in the Android Keystore." }); if (!v) return; await N.secret.set(r.name, v.trim()); toast("Key saved", { kind: "success" }); renderKeyManager(host); } }, has ? "Replace" : "Set key");
    act.push(setBtn);
    if (has) {
      act.push(h("button.btn.small", { title: "Reveal (needs PIN / biometrics)", onclick: async () => {
        const t = await identify(`Reveal ${r.label}`); if (!t) return;
        try { const v = await N.secret.reveal(r.name, t); val.textContent = v; val.classList.add("shown"); clearTimeout(hideT); hideT = setTimeout(() => { val.textContent = masked; val.classList.remove("shown"); }, 15000); } catch (e) { toastError(e); }
      } }, icon("eye"), " Show"));
      act.push(h("button.btn.small", { title: "Copy (needs PIN / biometrics)", onclick: async () => { const t = await identify(`Copy ${r.label}`); if (!t) return; try { await copyText(await N.secret.reveal(r.name, t)); toast("Copied – clipboard may be readable by other apps", { kind: "warn" }); } catch (e) { toastError(e); } } }, icon("copy")));
      act.push(h("button.btn.small.danger", { title: "Delete", onclick: async () => { if ((await status()).pinSet && !(await identify("Confirm to delete the key"))) return; if (await confirm(`Delete the ${r.label} key?`, { danger: true, okLabel: "Delete" })) { await N.secret.delete(r.name); renderKeyManager(host); } } }, icon("trash")));
    }
    list.append(h("div.key-row", h("div.key-info", h("div.set-label", r.label), val, h("div.muted.set-key", r.name)), h("div.key-actions", act)));
  }
  host.replaceChildren(list);
}

export async function renderSecurity(host) {
  const st = await status();
  const sw = (key, on) => { const el = h("div.switch" + (settings.get(key) ? ".on" : ""), { role: "switch", onclick: async () => { const n = !settings.get(key); if (key === "security.appLock" && n && !st.pinSet && !st.biometric) { toast("Set a PIN first", { kind: "warn" }); return; } if (key === "security.appLock" && n && !(await identify("Confirm to enable app lock"))) return; settings.set(key, n); el.classList.toggle("on", n); } }); return el; };
  const row = (label, hint, ctl) => h("div.set-row", h("div.set-info", h("div.set-label", label), h("div.muted.set-key", hint)), ctl);
  const method = h("select", { onchange: (e) => settings.set("security.method", e.target.value) }, ...[["auto", "Biometrics, then PIN"], ["pin", "PIN only"]].map(([v, l]) => h("option", { value: v, selected: settings.get("security.method") === v }, l)));
  const after = h("select", { onchange: (e) => settings.set("security.lockAfter", +e.target.value) }, ...[[0, "Immediately"], [30, "After 30 seconds"], [60, "After 1 minute"], [300, "After 5 minutes"], [1800, "After 30 minutes"]].map(([v, l]) => h("option", { value: v, selected: settings.get("security.lockAfter") === v }, l)));
  host.replaceChildren(
    row("PIN", st.pinSet ? "A PIN is set (stored as a salted hash, never in plain text)" : "No PIN set", h("div", { style: { display: "flex", gap: "6px" } }, h("button.btn", { onclick: async () => { if (await setPinFlow()) renderSecurity(host); } }, st.pinSet ? "Change" : "Set PIN"), st.pinSet ? h("button.btn.danger", { onclick: async () => { await removePinFlow(); renderSecurity(host); } }, "Remove") : null)),
    row("Fingerprint / face / screen lock", st.biometric ? "Available on this device" : "Not available (enroll one in Android settings)", h("span.muted", st.biometric ? "✓" : "–")),
    row("Unlock method", "Order used to unlock the app and reveal keys", method),
    row("Lock the app", "Ask to unlock when the app opens or is reopened", sw("security.appLock")),
    row("Lock after leaving", "How long the app can stay in the background before it locks", after),
    row("Hide content in app switcher", "Blocks screenshots and blanks the recent-apps preview", sw("security.secure")),
  );
}
