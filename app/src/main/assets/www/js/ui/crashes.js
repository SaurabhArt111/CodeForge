// Crash reports UI: list / view / copy / share, Settings → Diagnostics, and the "last time CodeForge stopped" notice at startup.
import { N } from "../core/bridge.js";
import { settings } from "../core/settings.js";
import { bus } from "../core/events.js";
import { h, icon, P, relTime, copyText } from "../core/util.js";
import { modal, toast, toastError, confirm } from "../core/ui.js";

const KIND_LABEL = {
  crash: "App crash", "native-crash": "Native crash", "low-memory": "Out of memory", killed: "Killed by Android", anr: "Not responding", "resource-limit": "Resource limit",
  renderer: "Editor view died", "preview-renderer": "Preview page crashed", "js-error": "Script error", test: "Test", other: "Other",
};
const label = (k) => KIND_LABEL[k] || k;
const serious = (m) => m.fatal || ["crash", "native-crash", "low-memory", "killed", "anr", "renderer", "preview-renderer", "resource-limit"].includes(m.kind);

// ---------------------------------------------------------------- list + viewer
export async function openReports() {
  let list = [];
  const body = h("div.crash-list");
  const draw = () => {
    body.replaceChildren();
    if (!list.length) { body.append(h("div.empty-state", icon("pass"), h("div", "No crash reports. Nothing has gone wrong."))); return; }
    for (const m of list) {
      body.append(h("div.crash-row" + (m.seen ? "" : ".new") + (serious(m) ? ".bad" : ""), { onclick: () => viewReport(m, async () => { await refresh(); }) },
        icon(serious(m) ? "error" : "warning"),
        h("div.crash-main", h("div.crash-title", m.title || label(m.kind)), h("div.muted.crash-sub", `${label(m.kind)} · ${m.process || "main"} · ${relTime(m.ts)}`)),
        m.seen ? null : h("span.chip", "new")));
    }
  };
  const refresh = async () => { try { list = await N.crash.list(); } catch (e) { list = []; toastError(e); } draw(); };
  await refresh();
  N.crash.seen(null).catch(() => {});
  modal({
    title: "Crash reports", width: 620, className: "wide", body: body,
    buttons: [
      { label: "Copy all", onClick: async () => { await copyText(await N.crash.bundle(null)); toast("Copied all reports"); return false; } },
      { label: "Share all", onClick: async () => { await shareText(await N.crash.bundle(null), "codeforge-crash-reports.txt"); return false; } },
      { label: "Clear", danger: true, onClick: async () => { if (await confirm("Delete all crash reports?", { okLabel: "Delete", danger: true })) { await N.crash.clear(); await refresh(); } return false; } },
      { label: "Close", primary: true, value: true },
    ],
  });
}

async function shareText(text, name) {
  try {
    const info = await N.sys.info();
    const f = P.join(info.paths.home, ".cf-share", name);
    await N.fs.mkdir(P.dir(f)); await N.fs.writeText(f, text);
    await N.sys.share({ path: f, mime: "text/plain", title: "CodeForge report" });
  } catch (e) { await copyText(text); toast("Sharing unavailable , copied to clipboard instead"); }
}

export async function viewReport(meta, onChange) {
  const full = await N.crash.read(meta.id).catch(() => null);
  if (!full) return toast("Report no longer exists", { kind: "warn" });
  N.crash.seen([meta.id]).catch(() => {});
  modal({
    title: meta.title || label(meta.kind), width: 720, className: "tall wide",
    body: h("pre.crash-text.selectable", full.text),
    buttons: [
      { label: "Copy", onClick: async () => { await copyText(full.text); toast("Copied"); return false; } },
      { label: "Share", onClick: async () => { await shareText(full.text, "codeforge-report.txt"); return false; } },
      { label: "Delete", danger: true, onClick: async () => { await N.crash.delete(meta.id); onChange?.(); return true; } },
      { label: "Close", primary: true, value: true },
    ],
  });
}

// ---------------------------------------------------------------- Settings → Diagnostics
export function renderDiagnostics(el) {
  const row = (title, sub, ...ctl) => h("div.set-row", h("div.set-info", h("div.set-label", title), h("div.muted.set-key", sub)), h("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap" } }, ...ctl));
  const count = h("span.chip", "…");
  N.crash.list().then((l) => { count.textContent = String(l.length); }).catch(() => { count.textContent = "0"; });
  const sw = (key) => { const s = h("div.switch" + (settings.get(key) ? ".on" : ""), { role: "switch", onclick: () => { const n = !settings.get(key); settings.set(key, n); s.classList.toggle("on", n); } }); return s; };
  el.replaceChildren(
    row("Crash reports", "Saved only on this device. Includes the stack, memory and what the app was doing.", count, h("button.btn", { onclick: openReports }, "View reports")),
    row("Tell me after a crash", "Show a notice at startup when CodeForge stopped unexpectedly", sw("diagnostics.notify")),
    row("Pause the in-app preview when memory is low", "Prevents Android from killing the app because of a heavy page", sw("preview.pauseOnLowMemory")),
    row("Copy diagnostics", "Device, memory and the last actions , paste it when reporting a problem", h("button.btn", { onclick: async () => { await copyText(await N.crash.diagnostics()); toast("Diagnostics copied"); } }, "Copy")),
    row("Create a test report", "Check that recording works", h("button.btn", { onclick: async () => { await N.crash.test(); toast("Test report created"); N.crash.list().then((l) => (count.textContent = String(l.length))); } }, "Create")),
  );
}

// ---------------------------------------------------------------- startup notice
export async function startupCheck({ openIsolated } = {}) {
  try {
    const rec = await N.crash.takeRecovery().catch(() => null);
    await new Promise((r) => setTimeout(r, 1800));            // the native side scans Android's exit history in the background
    const unseen = (await N.crash.unseen().catch(() => [])).filter(serious);
    if (!unseen.length && !rec) return;
    const newest = unseen[0];
    const text = newest ? (await N.crash.read(newest.id).catch(() => null))?.text || "" : "";
    const previewSuspect = /preview (load|window)|ui preview|open isolated preview|preview:inline/i.test(text) || !!rec;
    if (settings.get("diagnostics.notify")) {
      const msg = rec ? (rec.crashed ? "The editor view crashed and was restarted." : "The editor view was restarted to free memory.") : `CodeForge stopped unexpectedly: ${label(newest.kind).toLowerCase()}.`;
      toast(msg, { kind: "warn", timeout: 12000, action: { label: "View", run: () => (newest ? viewReport(newest) : openReports()) } });
    }
    if (previewSuspect && settings.get("preview.mode") === "inline" && openIsolated) {
      if (await confirm("The in-app preview was probably running when this happened. Open previews in a separate window from now on? A crash there then can't take the editor down.", { title: "Make previews crash-proof?", okLabel: "Use separate window" })) {
        settings.set("preview.mode", "window");
        toast("Previews now open in a separate window", { kind: "success" });
      }
    }
    N.crash.seen(unseen.map((m) => m.id)).catch(() => {});
    bus.emit("crash:notified");
  } catch { /* diagnostics must never break startup */ }
}
