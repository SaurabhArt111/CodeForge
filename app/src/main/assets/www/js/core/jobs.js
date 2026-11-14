// Background tasks: downloads, compressing, exporting, cleaning … run without blocking the editor.
//   const r = await jobs.run({ title: "Installing Claude Code", kind: "download", icon: "cloud-download",
//                              next: { text: "Open it now?", label: "Open", run: () => … }, restart: { reason: "…" } },
//                            async (job) => { job.update("Downloading…", 0.2); await N.net.download({ …, job: job.id }); return result; });
//   if (r.ok) …   (run() never throws: failures and cancellations are reported to the user and returned in r)
// While a task runs: the status bar shows its progress (tap = task list), the native side keeps the app alive in the background and shows
// a progress notification, and when it ends the user gets a toast (app open) or a notification (app in the background).
// A finished task may offer a follow-up (`next`) and may ask to restart the app (`restart`) when something only applies after a restart.
import { N, mode as bridgeMode } from "./bridge.js";
import { bus } from "./events.js";
import { h, icon, uid, fmtBytes } from "./util.js";
import { toast, modal } from "./ui.js";

const jobs = new Map();            // id -> job (running first, then recent history)
const HISTORY = 12;
export const list = () => [...jobs.values()];
export const running = () => list().filter((j) => j.status === "running");

let statusItem = null;             // set by init()
const changed = () => { bus.emit("jobs:changed"); renderStatus(); };

/** Wires the status-bar item. Called once from main.js after the status bar exists. */
export function init(statusbar) {
  statusItem = statusbar;
  renderStatus();
}
function renderStatus() {
  if (!statusItem) return;
  const r = running();
  if (!r.length) { statusItem.remove("jobs"); bus.emit("busy", "jobs", null); return; }
  const fr = r.map((j) => j.progress).filter((p) => p >= 0);
  const pct = fr.length ? Math.round((fr.reduce((a, b) => a + b, 0) / fr.length) * 100) : null;
  const text = r.length === 1 ? `${r[0].title}${pct != null ? " " + pct + "%" : "…"}` : `${r.length} tasks${pct != null ? " " + pct + "%" : ""}`;
  statusItem.item("jobs", { side: "left", priority: 2, ic: "sync~spin", text, title: "Background tasks – tap to see them", onClick: () => openCenter() });
  bus.emit("busy", "jobs", r[0].title);
}

class Job {
  constructor(o) {
    Object.assign(this, { id: "j" + uid(), title: "Task", detail: "", kind: "task", icon: "sync", cancellable: true, status: "running", progress: -1, startedAt: Date.now(), endedAt: 0, error: null, result: undefined, next: null, restart: null, doneText: "", openDownloads: false }, o);
    this._offs = []; this._lastNative = 0; this._onCancel = [];
  }
  /** Shows what is happening now; fraction 0..1 (or -1 = unknown). Either argument may be null to leave it unchanged. */
  update(detail, fraction) {
    if (this.status !== "running") return;
    if (detail != null) this.detail = detail;
    if (fraction != null) this.progress = fraction < 0 ? -1 : Math.min(1, fraction);
    const now = Date.now();
    if (now - this._lastNative > 400) { this._lastNative = now; N.jobs.update(this.id, this.detail, this.progress >= 0 ? Math.round(this.progress * 1000) : -1, this.progress >= 0 ? 1000 : -1).catch(() => {}); }
    bus.emit("jobs:changed", this.id); renderStatus();
  }
  /** Listens to a native progress event for as long as the task runs. fn(data, job) – the event carries `job` / `id` = this.id. */
  on(event, fn) { this._offs.push(N.on(event, (d) => { if (d && (d.job === this.id || d.id === this.id)) fn(d, this); })); }
  /** Maps byte progress of a net.download / export to the bar. */
  watchBytes(label = "Downloading") {
    this.on("net.progress", (d) => { if (d.total > 0) this.update(`${label}… ${fmtBytes(d.done)} of ${fmtBytes(d.total)}`, d.done / d.total); else this.update(`${label}… ${fmtBytes(d.done)}`, -1); });
  }
  /** Maps archive.progress (files done / total) to the bar. */
  watchFiles(label = "Compressing") {
    this.on("archive.progress", (d) => { if (d.total > 0) this.update(`${label}… ${d.count} of ${d.total} files`, d.count / d.total); else this.update(`${label}… ${d.count} files`, -1); });
  }
  onCancel(fn) { this._onCancel.push(fn); }
  async cancel() {
    if (this.status !== "running" || !this.cancellable) return;
    this.cancelRequested = true; this.detail = "Cancelling…"; changed();
    try { await N.jobs.cancel(this.id); } catch { /* the native side may not know this task */ }
    for (const f of this._onCancel) try { f(); } catch { /* ignore */ }
  }
  get done() { return this.status !== "running"; }
}

/** Runs `fn(job)` as a background task. Resolves { ok, result, error, cancelled, job } – never rejects. */
export async function run(opts, fn) {
  const job = new Job(opts);
  jobs.set(job.id, job);
  N.jobs.begin(job.id, job.title, job.detail).catch(() => {});
  changed();
  let overlay = null;
  if (opts.blocking) overlay = blockingCard(job);
  try {
    job.result = await fn(job);
    if (job.cancelRequested) job.status = "cancelled"; else job.status = "done";
  } catch (e) {
    const msg = e?.message || String(e);
    if (job.cancelRequested || /cancel/i.test(msg)) job.status = "cancelled";
    else { job.status = "error"; job.error = msg; }
  }
  job.endedAt = Date.now(); job.progress = job.status === "done" ? 1 : job.progress;
  job._offs.forEach((f) => f()); job._offs = [];
  overlay?.close();
  const ok = job.status === "done";
  const text = ok ? job.doneText || `${job.title} – done` : job.status === "cancelled" ? "Cancelled" : job.error || "Failed";
  N.jobs.end(job.id, ok, text, ok && job.openDownloads, !document.hidden || job.status === "cancelled").catch(() => {});
  trim(); changed(); bus.emit("jobs:finished", job);
  // tell the user
  if (ok) {
    const a = job.next ? { label: job.next.label || "Open", run: () => job.next.run(job.result) } : null;
    if (!opts.silent) toast(text, { kind: "success", timeout: a ? 12000 : 5000, action: a || (job.openDownloads ? { label: "Open Downloads", run: () => N.sys.openDownloads().catch(() => {}) } : null) });
    if (job.restart) {
      const need = typeof job.restart.when === "function" ? job.restart.when(job.result) : true;
      if (need) await askRestart(job.restart.reason, job.restart);
    }
  } else if (job.status === "cancelled") { if (!opts.silent) toast(`${job.title}: cancelled`, { kind: "info", timeout: 2500 }); }
  else toast(`${job.title} failed: ${job.error}`, { kind: "error", timeout: 9000, action: { label: "Details", run: () => openCenter() } });
  return { ok, result: job.result, error: job.error, cancelled: job.status === "cancelled", job };
}
function trim() {
  const fin = list().filter((j) => j.done);
  for (const j of fin.slice(0, Math.max(0, fin.length - HISTORY))) jobs.delete(j.id);
}
export function dismiss(id) { const j = jobs.get(id); if (j?.done) { jobs.delete(id); changed(); } }
export function clearFinished() { for (const j of list()) if (j.done) jobs.delete(j.id); changed(); }

// ---------------------------------------------------------------- blocking card (for steps the next action needs): can be sent to the background
function blockingCard(job) {
  const text = h("div.busy-text", job.detail || job.title), bar = h("div.busy-bar.on", h("i"));
  const sync = () => { text.textContent = job.detail || job.title; bar.firstChild.style.width = job.progress >= 0 ? Math.round(job.progress * 100) + "%" : "35%"; bar.classList.toggle("indet", job.progress < 0); };
  const el = h("div.busy.job-busy", h("div.busy-card", h("div.busy-title", job.title), h("div.spinner"), text, bar,
    h("div.busy-btns", h("button.btn.small", { onclick: () => { el.remove(); toast(`${job.title} continues in the background`, { timeout: 2500 }); } }, "Run in background"),
      job.cancellable ? h("button.btn.small", { onclick: () => job.cancel() }, "Cancel") : null)));
  document.getElementById("overlay").append(el);
  const off = bus.on("jobs:changed", sync); sync();
  return { close() { off?.(); el.remove(); } };
}

// ---------------------------------------------------------------- task list (opened from the status bar)
let centerRefresh = null;
export function openCenter() {
  if (centerRefresh) return;
  const body = h("div.job-list");
  const render = () => {
    const all = list().sort((a, b) => (a.done - b.done) || b.startedAt - a.startedAt);
    if (!all.length) { body.replaceChildren(h("div.pj-empty", "No background tasks. Downloads, installs, ZIP exports and cleanups show up here while they run.")); return; }
    body.replaceChildren(...all.map(row));
  };
  const row = (j) => {
    const pct = j.progress >= 0 ? Math.round(j.progress * 100) : null;
    const state = j.status === "running" ? (pct != null ? pct + "%" : "working…") : j.status === "done" ? "done" : j.status === "cancelled" ? "cancelled" : "failed";
    return h("div.job-row." + j.status,
      h("span.job-ico", icon(j.status === "done" ? "pass" : j.status === "error" ? "error" : j.status === "cancelled" ? "circle-slash" : j.icon || "sync", j.status === "running" && j.icon === "sync" ? "codicon-modifier-spin" : "")),
      h("div.job-main", h("div.job-title", j.title, h("span.job-state", state)),
        h("div.job-detail.muted", j.status === "error" ? j.error : j.detail || ""),
        j.status === "running" ? h("div.job-bar" + (pct == null ? ".indet" : ""), h("i", { style: { width: (pct ?? 35) + "%" } })) : null),
      h("div.job-acts",
        j.status === "running" && j.cancellable ? h("button.btn.small", { onclick: () => j.cancel() }, "Cancel") : null,
        j.status === "done" && j.next ? h("button.btn.small.primary", { onclick: () => j.next.run(j.result) }, j.next.label || "Open") : null,
        j.done ? h("button.icon-btn", { title: "Dismiss", onclick: () => dismiss(j.id) }, icon("close")) : null));
  };
  const off = bus.on("jobs:changed", render);
  centerRefresh = render; render();
  modal({ title: "Background tasks", width: 560, className: "tasks", body, buttons: [{ label: "Clear finished", onClick: () => { clearFinished(); render(); return false; } }, { label: "Close", primary: true, value: true }] }).then(() => { off?.(); centerRefresh = null; });
}

// ---------------------------------------------------------------- restart
/** Asks whether to restart now. mode: "app" (new process on Android) | "window" (reload the UI only). Returns true when a restart was started. */
export async function askRestart(reason = "", { mode = "app", title = "Restart CodeForge?" } = {}) {
  let terms = 0; try { terms = (await N.term.list()).filter((t) => t.alive).length; } catch { /* no terminals */ }
  const busyN = running().length;
  const notes = [reason, mode === "app" && terms ? `${terms} running terminal${terms === 1 ? "" : "s"} will be closed.` : "", busyN ? `${busyN} background task${busyN === 1 ? " is" : "s are"} still running and will stop.` : "", "Unsaved files are saved or you are asked first."].filter(Boolean);
  const v = await modal({ title, width: 440, body: h("div", ...notes.map((t) => h("p.modal-text", t))), buttons: [{ label: "Later", value: "later" }, { label: "Restart now", primary: true, value: "now" }] });
  if (v !== "now") { toast("Restart later: the change applies the next time you open CodeForge", { timeout: 3500 }); return false; }
  const ed = await import("../ui/editor.js");
  if (!(await ed.closeAll())) return false;          // unsaved work: the usual save / leave / stay prompt
  const { settings } = await import("./settings.js"); await settings.flush();
  if (mode === "app" && bridgeMode === "android") { await N.sys.restart().catch(() => location.reload()); return true; }
  location.reload(); return true;
}
