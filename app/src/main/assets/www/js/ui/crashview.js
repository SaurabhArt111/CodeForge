// Crash report viewer (Settings ▸ Crash reports, command palette) and the "closed unexpectedly" prompt on start.
import { N } from "../core/bridge.js";
import { h, icon, copyText, relTime } from "../core/util.js";
import { modal, toast, toastError, confirm } from "../core/ui.js";

const KIND_ICON = { native: "error", webview: "browser", exit: "debug-disconnect", js: "bug", promise: "bug", stall: "watch", memory: "pulse", csp: "shield" };

export async function openCrashReports() {
  const list = h("div.crash-list");
  const detail = h("pre.crash-detail.selectable", "Select a report to read it.");
  let current = null;
  const refresh = async () => {
    let items = []; try { items = await N.crash.list(); } catch (e) { toastError(e); }
    list.replaceChildren(...(items.length ? items.map((r) => h("button.crash-item" + (r.unseen ? ".unseen" : "") + (current === r.id ? ".active" : ""), { onclick: () => show(r) },
      icon(KIND_ICON[r.kind] || "warning"), h("span.ci-main", h("span.ci-title", r.title || r.kind), h("span.ci-sub", `${r.kind} · ${r.time || ""}`))))
      : [h("div.muted", { style: { padding: "14px" } }, "No crash reports. 🎉")]));
  };
  const show = async (r) => { current = r.id; detail.textContent = await N.crash.read(r.id).catch((e) => String(e)); detail.scrollTop = 0; refresh(); };
  const mk = (ic, label, fn, cls = "") => h("button.btn" + cls, { onclick: fn }, icon(ic), " " + label);
  const bar = h("div.crash-bar",
    mk("copy", "Copy", async () => { if (!current) return toast("Select a report first"); await copyText(detail.textContent); toast("Report copied", { kind: "success" }); }),
    mk("share", "Share", async () => { if (!current) return toast("Select a report first"); try { await N.crash.share(current); } catch (e) { toastError(e); } }),
    mk("trash", "Delete", async () => { if (!current) return; await N.crash.delete(current); current = null; detail.textContent = "Select a report to read it."; refresh(); }),
    mk("clear-all", "Clear all", async () => { if (await confirm("Delete all crash reports?", { okLabel: "Delete", danger: true })) { await N.crash.clear(); current = null; detail.textContent = ""; refresh(); } }));
  const body = h("div.crash-view", bar, h("div.crash-cols", list, detail));
  await N.crash.seen().catch(() => {});
  await refresh();
  const first = list.querySelector(".crash-item"); if (first) first.click();
  return modal({ title: "Crash reports", body, width: 900, className: "crash-modal", buttons: [{ label: "Close", primary: true }] });
}

/** On start: tell the user if the previous run ended badly, and offer the report. */
export async function checkPrevious() {
  try {
    const n = await N.crash.unseen();
    if (!n) return;
    toast(`CodeForge ${n === 1 ? "recorded a problem" : `recorded ${n} problems`} last time`, { kind: "error", timeout: 12000, action: { label: "View", run: openCrashReports } });
  } catch { /* ignore */ }
}
