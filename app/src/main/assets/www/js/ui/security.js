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
export async function removePin() {
  const ok = await pinDialog({ title: "Remove PIN", message: "Enter your current PIN to remove it.", confirmLabel: "Remove", verify: false }); if (ok === undefined) return false;
  const r = await N.auth.clearPin(ok); if (!r.ok) { toast(r.error || "Wrong PIN", { kind: "error" }); return false; }
  token = null; settings.set("security.appLock", false); toast("PIN removed"); bus.emit("security:changed"); return true;
}

/** Copies a secret and wipes the clipboard again after the time chosen in the Security Centre. */
let clipT = null;
export async function copySecret(text) {
  await copyText(text);
  const sec = +settings.get("security.clipboardClear") || 0;
  clearTimeout(clipT); if (sec > 0) clipT = setTimeout(() => clearClipboard(true), sec * 1000);
  return sec;
}
export async function clearClipboard(quiet = false) { clearTimeout(clipT); try { await N.sys.clipboardSet(""); } catch { try { await navigator.clipboard?.writeText(""); } catch { /* not allowed */ } } if (!quiet) toast("Clipboard cleared"); }

/** Asks for PIN / fingerprint when the user turned `settingKey` on. Resolves true to go on. */
export async function guard(reason, settingKey) {
  if (!settings.get(settingKey)) return true;
  const st = await status(); if (!st.pinSet && !st.biometric) return true;   // nothing to ask with: never lock the user out
  return !!(await identify(reason));
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
      act.push(h("button.btn.small", { title: "Copy (needs PIN / biometrics)", onclick: async () => { const t = await identify(`Copy ${r.label}`); if (!t) return; try { const sec = await copySecret(await N.secret.reveal(r.name, t)); toast(sec ? `Copied – the clipboard is wiped in ${sec} s` : "Copied – the clipboard stays readable by other apps until you copy something else", { kind: sec ? "success" : "warn" }); } catch (e) { toastError(e); } } }, icon("copy")));
      act.push(h("button.btn.small.danger", { title: "Delete", onclick: async () => { if ((await status()).pinSet && !(await identify("Confirm to delete the key"))) return; if (await confirm(`Delete the ${r.label} key?`, { danger: true, okLabel: "Delete" })) { await N.secret.delete(r.name); renderKeyManager(host); } } }, icon("trash")));
    }
    list.append(h("div.key-row", h("div.key-info", h("div.set-label", r.label), val, h("div.muted.set-key", r.name)), h("div.key-actions", act)));
  }
  host.replaceChildren(list);
}
