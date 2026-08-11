// Bridges the vendored @webcontainer/api ES module SDK (public/vendor/webcontainer/) into
// window.__cfWebContainer so public/terminal.js — a classic, non-module script, matching the
// rest of this codebase — can use it without needing a bundler. This file is the ONLY module
// script in the app; everything else stays plain <script> tags on purpose (see vite.config.mjs
// for why: Monaco's AMD loader and the service worker both need stable, unbundled paths).
//
// WebContainers only ever run as a LAST-RESORT fallback in the Terminal panel — used only when
// no real local backend is reachable at all (i.e. a static deploy with no Node process behind
// it). Whenever a real backend IS reachable, that's always preferred; this file's code never
// even gets exercised in that case. See README.md for the full story and its real trade-offs
// (browser support, memory limits on mobile, and StackBlitz's commercial-use licensing terms).
import { WebContainer } from "./vendor/webcontainer/index.js";

let bootedInstance = null;
let bootedProjectId = null;
let bootPromise = null;

function isSupported() {
  try {
    return window.crossOriginIsolated === true &&
      typeof SharedArrayBuffer !== "undefined" &&
      typeof WebAssembly !== "undefined";
  } catch (e) { return false; }
}

// Resolves to the live WebContainer instance for `projectId`, booting one if needed and
// reusing it for every subsequent call with the SAME projectId (e.g. opening a second terminal
// tab for the same project). Only one instance can be booted at a time on the whole page — if
// a DIFFERENT project already has one booted, this throws so terminal.js can ask the person to
// confirm before tearing it down (which kills whatever's running in it).
async function bootForProject(projectId) {
  if (bootedInstance && bootedProjectId === projectId) return bootedInstance;
  if (bootedInstance && bootedProjectId !== projectId) {
    const err = new Error("A WebContainer is already running for a different project.");
    err.code = "ALREADY_BOOTED_DIFFERENT_PROJECT";
    throw err;
  }
  if (bootPromise) return bootPromise;
  bootPromise = WebContainer.boot({ coep: "require-corp", workdirName: "project" })
    .then(function (instance) {
      bootedInstance = instance;
      bootedProjectId = projectId;
      bootPromise = null;
      instance.on("error", function () { /* surfaced to the person via terminal.js's own listener */ });
      return instance;
    })
    .catch(function (err) { bootPromise = null; throw err; });
  return bootPromise;
}

async function teardownCurrent() {
  // If a boot is still in flight, let it settle first. Tearing down before the container has
  // finished coming up races its own startup — the underlying process hasn't fully initialized
  // yet, so asking it to shut down mid-boot is a likely source of "Process aborted" (as opposed
  // to a clean teardown of an instance that's actually up and running).
  if (bootPromise) {
    try { await bootPromise; } catch (e) { /* boot failed on its own; nothing to tear down */ }
  }
  if (bootedInstance) {
    try { bootedInstance.teardown(); } catch (e) { /* already gone */ }
    // WebContainer#teardown() is fire-and-forget internally: it kicks off an async teardown
    // chain and stashes the promise on the static WebContainer._teardownPromise field without
    // returning or catching it. If the underlying process/iframe was already killed (e.g.
    // torn down a second time), that promise rejects with "Process aborted" and — since
    // nothing else attaches to it in the same tick — surfaces as an unhandled rejection and a
    // scary "Something went wrong" toast. There's nothing actionable for the person to do
    // about a teardown failure, so swallow it here.
    if (WebContainer._teardownPromise) WebContainer._teardownPromise.catch(function () { });
  }
  bootedInstance = null;
  bootedProjectId = null;
  bootPromise = null;
}

window.__cfWebContainer = {
  isSupported: isSupported,
  bootForProject: bootForProject,
  teardownCurrent: teardownCurrent,
  getBootedProjectId: function () { return bootedProjectId; },
};
// This file is loaded via a dynamically-created <script type="module"> (see terminal.js), not a
// static tag in index.html — a static one would make Vite's *build* step (unlike its dev
// server) treat it as a bundle entry point and mis-resolve it, since it's really just a plain
// publicDir static asset like the rest of vendor/. That means terminal.js can't rely on normal
// module-loading-order guarantees to know when this is ready, hence this event.
window.dispatchEvent(new Event("cf:webcontainer-ready"));
