/**
 * CodeForge — Terminal panel.
 *
 * This file is deliberately self-contained: it never reaches into app.js's internals, only
 * into the small, explicit `window.__cfBridge` object app.js exposes (see the "TERMINAL
 * BRIDGE" section near the end of app.js). That keeps the boundary between "the editor" and
 * "the terminal" easy to audit.
 *
 * Four backend modes, auto-detected on load by pinging /api/terminal/health:
 *   - "pty"          real shell, real PTY (node-pty)  — full fidelity, incl. vim/htop/etc.
 *   - "shell"        real shell, no PTY (plain pipes) — real commands, but no full-screen TUIs
 *   - "webcontainer" no local backend, but a real in-browser Node.js runtime (WebContainers) —
 *                    used when this page is cross-origin isolated and the browser supports it;
 *                    real npm/node execution with zero server, but no git/Python. See README.md.
 *   - "simulated"    neither of the above — an in-browser fake shell operating on CodeForge's
 *                    virtual filesystem, so the panel is never just broken.
 *
 * Whichever mode is active, the panel, tabs, keybindings, and UI are identical — only what
 * happens when you press Enter differs.
 */
"use strict";
(function () {

  // webcontainer-runtime.js must be loaded as a real ES module (it has import/export), but
  // adding it as a static <script type="module"> tag in index.html would make Vite's *build*
  // step (unlike its dev server) treat it as a bundle entry point and mis-resolve it, since
  // it's really just a plain publicDir static asset like the rest of vendor/. Injecting it
  // dynamically sidesteps that entirely — Vite's build-time HTML scanner only looks at
  // statically-declared tags. detectCapabilities() below doesn't assume any particular timing
  // for when this finishes loading; it listens for "cf:webcontainer-ready" either way.
  (function loadWebContainerRuntime() {
    const s = document.createElement("script");
    s.type = "module";
    s.src = "webcontainer-runtime.js";
    document.head.appendChild(s);
  })();

  /* ============================== tiny utils (this module is a separate scope from app.js) ============================== */
  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function ce(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e; }
  function genId() { return "t" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }
  function debounce(fn, ms) {
    let t = null;
    return function () {
      const args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, ms);
    };
  }
  function bridge() { return window.__cfBridge || null; }
  function escapeHtml(s) {
    const b = bridge();
    if (b) return b.escapeHtml(s);
    return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }
  const ANSI_STRIP_RE = /\x1b\[[0-9;?]*[a-zA-Z]|\x1b\][^\x07]*(\x07|\x1b\\)|\x1b[()][A-Za-z0-9]/g;
  function stripAnsi(s) { return String(s).replace(ANSI_STRIP_RE, ""); }
  const DEVSERVER_RE = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1?\])(?::\d{2,5})?[^\s"'<>)\]]*/i;

  /* ============================== module state ============================== */
  const state = {
    open: false,
    mode: "detecting",      // detecting | pty | shell | simulated
    capabilities: null,
    sessions: [],            // Session objects, all projects, oldest-first
    slots: [null, null],     // session ids currently shown in pane 0 / pane 1
    activeSlot: 0,
    split: false,
    maximized: false,
    currentProjectId: null,
    pushMeta: Object.create(null), // projectId -> { lastPushedAt, paths:[] }
    panelHeight: 300,
    dragging: false,
  };
  let els = {};
  let uiReady = false;

  /* ============================== init ============================== */
  document.addEventListener("DOMContentLoaded", function () {
    // Give app.js's own DOMContentLoaded handler (which kicks off Monaco loading) a tick to
    // run first — we don't depend on it, but this keeps script evaluation order predictable.
    init();
  });

  function init() {
    if (!qs("#terminal-panel")) return; // markup not present (older index.html) — no-op
    cacheEls();
    wireToolbar();
    wireResizer();
    wireMobileBack();
    wireSearchBar();
    window.addEventListener("resize", debounce(layoutVisiblePanes, 120));
    wirePaneFocusTracking();
    detectCapabilities();
    setInterval(pollProjectSwitch, 1200);
    setInterval(autoPushTick, 12000);
    uiReady = true;
    window.CFTerminal = api;
  }

  function cacheEls() {
    els.resizer = qs("#terminal-resizer");
    els.panel = qs("#terminal-panel");
    els.header = qs("#terminal-header");
    els.tabs = qs("#terminal-tabs");
    els.badge = qs("#terminal-mode-badge");
    els.body = qs("#terminal-body");
    els.btnNew = qs("#btn-terminal-new");
    els.btnSyncPush = qs("#btn-terminal-sync-push");
    els.btnSyncPull = qs("#btn-terminal-sync-pull");
    els.btnRestart = qs("#btn-terminal-restart");
    els.btnKill = qs("#btn-terminal-kill");
    els.btnMaximize = qs("#btn-terminal-maximize");
    els.btnClose = qs("#btn-terminal-close");
    els.btnMobileBack = qs("#btn-terminal-mobile-back");

    // Build the two-pane layout + hidden pool once.
    els.body.innerHTML =
      '<div class="term-panes"><div class="term-pane" data-slot="0"></div><div class="term-pane term-pane-b hidden" data-slot="1"></div></div>' +
      '<div class="term-pool"></div>' +
      '<div class="term-searchbar hidden"><input type="text" placeholder="Find in terminal…" spellcheck="false" />' +
      '<button data-act="prev" title="Previous match (Shift+Enter)">\u2191</button>' +
      '<button data-act="next" title="Next match (Enter)">\u2193</button>' +
      '<button data-act="close" title="Close (Esc)">\u2715</button></div>';
    els.paneA = qs('.term-pane[data-slot="0"]', els.body);
    els.paneB = qs('.term-pane[data-slot="1"]', els.body);
    els.pool = qs(".term-pool", els.body);
    els.searchbar = qs(".term-searchbar", els.body);
    els.searchInput = qs(".term-searchbar input", els.body);
  }

  /* ============================== capability detection ============================== */
  function detectCapabilities() {
    setMode("detecting");
    fetch("/api/terminal/health", { headers: { Accept: "application/json" }, cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error("unreachable"); return r.json(); })
      .then(function (data) {
        if (!data || data.ok !== true) throw new Error("bad response");
        state.capabilities = data;
        setMode(data.hasPty ? "pty" : "shell");
      })
      .catch(function () {
        state.capabilities = null;
        // No real backend reachable at all (typically a static deploy). Offer real npm/node
        // execution via an in-browser WebContainers runtime if this page loaded cross-origin
        // isolated and the browser supports it; otherwise fall back to the plain simulation.
        resolveFallbackMode();
      });
  }

  // window.__cfWebContainer is set by a dynamically-injected module script (see the top of this
  // file), so it may or may not have finished loading yet by the time we get here — wait for
  // its ready event rather than assuming either ordering, with a timeout in case it never loads.
  function resolveFallbackMode() {
    if (window.__cfWebContainer) { setMode(window.__cfWebContainer.isSupported() ? "webcontainer" : "simulated"); return; }
    let settled = false;
    function finish(mode) {
      if (settled) return;
      settled = true;
      window.removeEventListener("cf:webcontainer-ready", onReady);
      setMode(mode);
    }
    function onReady() { finish(window.__cfWebContainer && window.__cfWebContainer.isSupported() ? "webcontainer" : "simulated"); }
    window.addEventListener("cf:webcontainer-ready", onReady);
    setTimeout(function () { finish("simulated"); }, 4000);
  }

  function setMode(mode) {
    state.mode = mode;
    if (!els.badge) return;
    const labels = {
      detecting: ["\u25CB", "Checking for a local terminal backend\u2026"],
      pty: ["\u25CF Live", "Real shell (full PTY) — " + ((state.capabilities && state.capabilities.defaultShell) || "")],
      shell: ["\u25D1 Live (no TTY)", "Real shell, but without a PTY — full-screen apps like vim/htop won't render. Install a C++ build toolchain and reinstall node_modules to enable it."],
      webcontainer: ["\u25D1 In-browser Node", "No local backend found, but real npm/node execution is running entirely in this browser tab (WebContainers) — no server involved, works on mobile/tablet too. No git or Python; first boot needs network access and can take a few seconds."],
      simulated: ["\u25CB Simulated", "No local backend and no in-browser runtime available — using CodeForge's built-in simulated shell. Run `npm run dev` or `node server.js` locally for a real terminal with git/npm/python/etc."],
    };
    const l = labels[mode] || labels.simulated;
    els.badge.textContent = l[0];
    els.badge.title = l[1];
    els.badge.className = "term-mode-badge mode-" + mode;
  }

  /* ============================== panel open/close/resize ============================== */
  function openPanel() {
    state.open = true;
    els.panel.classList.remove("hidden");
    els.resizer.classList.remove("hidden");
    if (bridge() && bridge().isMobile()) els.panel.classList.add("mobile-open");
    else els.panel.style.height = state.panelHeight + "px";
    qs("#btn-terminal-toggle").classList.add("active-toggle");
    qsa('.nav-btn[data-nav="terminal"]').forEach(function (b) { b.classList.add("active"); });
    ensureSessionForActiveProject();
    setTimeout(layoutVisiblePanes, 30);
    setTimeout(function () { const s = activeSession(); if (s) s.term.focus(); }, 60);
  }
  function closePanel() {
    state.open = false;
    els.panel.classList.add("hidden");
    els.panel.classList.remove("mobile-open");
    els.resizer.classList.add("hidden");
    qs("#btn-terminal-toggle").classList.remove("active-toggle");
    qsa('.nav-btn[data-nav="terminal"]').forEach(function (b) { b.classList.remove("active"); });
  }

  function wireResizer() {
    let startY = 0, startH = 0;
    function down(e) {
      state.dragging = true;
      startY = (e.touches ? e.touches[0].clientY : e.clientY);
      startH = els.panel.getBoundingClientRect().height;
      document.body.style.cursor = "ns-resize";
      e.preventDefault();
    }
    function move(e) {
      if (!state.dragging) return;
      const y = (e.touches ? e.touches[0].clientY : e.clientY);
      const dh = startY - y;
      const h = Math.max(120, Math.min(window.innerHeight * 0.85, startH + dh));
      state.panelHeight = h;
      els.panel.style.height = h + "px";
      layoutVisiblePanes();
    }
    function up() { if (state.dragging) { state.dragging = false; document.body.style.cursor = ""; } }
    els.resizer.addEventListener("mousedown", down);
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
    els.resizer.addEventListener("touchstart", down, { passive: false });
    document.addEventListener("touchmove", move, { passive: false });
    document.addEventListener("touchend", up);
  }

  function wireMobileBack() {
    els.btnMobileBack.addEventListener("click", closePanel);
  }

  function wireToolbar() {
    els.btnNew.addEventListener("click", function () { createSessionForCurrentProject(true); });
    els.btnSyncPush.addEventListener("click", function () { const p = requireProject(); if (p) syncPush(p.id, true); });
    els.btnSyncPull.addEventListener("click", function () { const p = requireProject(); if (p) syncPull(p.id); });
    els.btnRestart.addEventListener("click", function () { const s = activeSession(); if (s) restartSession(s); });
    els.btnKill.addEventListener("click", function () { const s = activeSession(); if (s) closeSession(s); });
    els.btnMaximize.addEventListener("click", toggleMaximize);
    els.btnClose.addEventListener("click", closePanel);
  }

  function toggleMaximize() {
    state.maximized = !state.maximized;
    els.panel.classList.toggle("maximized", state.maximized);
    els.btnMaximize.classList.toggle("active-toggle", state.maximized);
    els.resizer.style.visibility = state.maximized ? "hidden" : "";
    setTimeout(layoutVisiblePanes, 220);
  }

  /* ============================== find-in-terminal (Ctrl+F while focused in a pane) ============================== */
  function wireSearchBar() {
    let addon = null;
    document.addEventListener("keydown", function (e) {
      if (!state.open) return;
      const insidePanel = els.panel.contains(document.activeElement);
      if (!insidePanel) return;
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        els.searchbar.classList.remove("hidden");
        els.searchInput.focus();
        els.searchInput.select();
      } else if (e.key === "Escape" && !els.searchbar.classList.contains("hidden")) {
        els.searchbar.classList.add("hidden");
        const s = activeSession(); if (s) s.term.focus();
      }
    });
    function currentAddon() {
      const s = activeSession();
      return s ? s.searchAddon : null;
    }
    els.searchInput.addEventListener("keydown", function (e) {
      const a = currentAddon(); if (!a) return;
      if (e.key === "Enter") { e.preventDefault(); if (e.shiftKey) a.findPrevious(els.searchInput.value); else a.findNext(els.searchInput.value); }
      else if (e.key === "Escape") { els.searchbar.classList.add("hidden"); const s = activeSession(); if (s) s.term.focus(); }
    });
    qs('[data-act="next"]', els.searchbar).addEventListener("click", function () { const a = currentAddon(); if (a) a.findNext(els.searchInput.value); });
    qs('[data-act="prev"]', els.searchbar).addEventListener("click", function () { const a = currentAddon(); if (a) a.findPrevious(els.searchInput.value); });
    qs('[data-act="close"]', els.searchbar).addEventListener("click", function () { els.searchbar.classList.add("hidden"); const s = activeSession(); if (s) s.term.focus(); });
  }

  /* ============================== project tracking ============================== */
  function requireProject() {
    const b = bridge();
    const p = b ? b.getCurrentProject() : null;
    if (!p) { if (bridge()) bridge().toast("Open or start a project first", "error"); return null; }
    return p;
  }
  function pollProjectSwitch() {
    const b = bridge();
    if (!b) return;
    const p = b.getCurrentProject();
    const id = p ? p.id : null;
    if (id === state.currentProjectId) return;
    state.currentProjectId = id;
    renderTabs();
    if (state.open) {
      if (id && sessionsForProject(id).length === 0) {
        showPaneEmptyState(els.paneA, "No terminal for this project yet.");
      }
      ensureSessionForActiveProject();
      layoutVisiblePanes();
    }
  }
  function sessionsForProject(pid) { return state.sessions.filter(function (s) { return s.projectId === pid; }); }

  function ensureSessionForActiveProject() {
    const p = bridge() ? bridge().getCurrentProject() : null;
    if (!p) return;
    const existing = sessionsForProject(p.id);
    if (existing.length > 0) {
      if (!state.slots[0] || sessionsForProject(p.id).indexOf(sessionById(state.slots[0])) === -1) {
        setSlot(0, existing[existing.length - 1].id);
      }
      return;
    }
    // "simulated" and "webcontainer" both mean no real backend is reachable, so there's
    // nothing on a server to reattach to — go straight to creating a local session instead of
    // firing a /api/terminal/sessions request that's guaranteed to 404.
    if (state.mode === "simulated" || state.mode === "webcontainer") { createSessionForCurrentProject(false); return; }
    // A page reload wipes our in-memory session list, but the server may still have this
    // project's shell(s) running — reattach to those instead of spawning duplicates.
    fetch("/api/terminal/sessions?projectId=" + encodeURIComponent(p.id))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        const stillCurrent = bridge() && (bridge().getCurrentProject() || {}).id === p.id;
        if (!stillCurrent || sessionsForProject(p.id).length > 0) return; // stale by the time this resolved
        const list = (data && data.sessions) || [];
        if (!list.length) { createSessionForCurrentProject(false); return; }
        list.forEach(function (ss, idx) {
          const session = reattachRealSession(p, ss);
          state.sessions.push(session);
          els.pool.appendChild(session.host);
          if (idx === 0) setSlot(0, session.id);
        });
        renderTabs();
        setTimeout(layoutVisiblePanes, 30);
      })
      .catch(function () { createSessionForCurrentProject(false); });
  }

  /* ============================== session bookkeeping ============================== */
  function sessionById(id) { return state.sessions.find(function (s) { return s.id === id; }) || null; }
  function activeSession() { return sessionById(state.slots[state.activeSlot]) || sessionById(state.slots[0]) || sessionById(state.slots[1]); }

  function setSlot(slot, sessionId) {
    state.slots[slot] = sessionId;
    renderPanes();
    renderTabs();
  }

  function createSessionForCurrentProject(focusIntoSlot) {
    const p = requireProject();
    if (!p) return null;
    const title = "Terminal " + (sessionsForProject(p.id).length + 1);
    const session = state.mode === "webcontainer" ? createWebContainerSession(p, title)
      : state.mode === "simulated" ? createSimSession(p, title)
      : createRealSession(p, title);
    state.sessions.push(session);
    els.pool.appendChild(session.host);
    const slot = focusIntoSlot === false ? 0 : (state.split ? state.activeSlot : 0);
    setSlot(slot, session.id);
    renderTabs();
    setTimeout(function () { layoutVisiblePanes(); session.term.focus(); }, 30);
    return session;
  }

  function closeSession(session) {
    if (!session) return;
    if (session.kind === "real" && session.backendId) {
      fetch("/api/terminal/sessions/" + encodeURIComponent(session.backendId), { method: "DELETE" }).catch(function () {});
      if (session.ws) try { session.ws.close(); } catch (e) {}
    } else if (session.kind === "webcontainer") {
      if (session.proc) try { session.proc.kill(); } catch (e) {}
      if (session.serverReadyOff) { try { session.serverReadyOff(); } catch (e) {} }
      // Only tear down the shared instance once nothing else for this project needs it —
      // other tabs on the same project may still have a live jsh process in it.
      const stillNeeded = sessionsForProject(session.projectId).some(function (s) { return s.kind === "webcontainer" && s !== session; });
      if (!stillNeeded && window.__cfWebContainer && window.__cfWebContainer.getBootedProjectId() === session.projectId) {
        window.__cfWebContainer.teardownCurrent();
      }
    }
    session.term.dispose();
    session.host.remove();
    state.sessions = state.sessions.filter(function (s) { return s !== session; });
    state.slots = state.slots.map(function (id) { return id === session.id ? null : id; });
    if (!state.slots[0] && !state.slots[1]) {
      const p = bridge() ? bridge().getCurrentProject() : null;
      const remaining = p ? sessionsForProject(p.id) : [];
      if (remaining.length) state.slots[0] = remaining[remaining.length - 1].id;
    }
    renderTabs();
    renderPanes();
  }

  function restartSession(session) {
    if (!session) return;
    if (session.kind === "sim") { session.reset(); return; }
    if (session.kind === "webcontainer") { restartWebContainerSession(session); return; }
    if (!session.backendId) return;
    fetch("/api/terminal/sessions/" + encodeURIComponent(session.backendId) + "/restart", { method: "POST" })
      .then(function (r) { return r.json(); })
      .catch(function () {});
    session.term.clear();
    session.term.writeln("\x1b[90m[restarting\u2026]\x1b[0m");
  }

  /* ============================== rendering: tabs ============================== */
  function renderTabs() {
    const b = bridge();
    const p = b ? b.getCurrentProject() : null;
    els.tabs.innerHTML = "";
    if (!p) return;
    sessionsForProject(p.id).forEach(function (s) {
      const tab = ce("div", "term-tab" + (isVisible(s.id) ? " active" : "") + (s.status === "exited" ? " exited" : ""));
      tab.dataset.id = s.id;
      const dot = ce("span", "term-tab-dot");
      const label = ce("span", "term-tab-label");
      label.textContent = s.title;
      const close = ce("span", "term-tab-close");
      close.innerHTML = "\u2715";
      close.title = "Close";
      tab.appendChild(dot); tab.appendChild(label); tab.appendChild(close);
      tab.addEventListener("click", function (e) { if (e.target === close) return; setSlot(state.activeSlot, s.id); state.currentProjectId = p.id; });
      tab.addEventListener("dblclick", function (e) {
        if (e.target === close) return;
        const nb = b ? b.openModal({ title: "Rename Terminal", bodyHtml: '<input id="term-rename-input" type="text" value="' + escapeHtml(s.title) + '" style="width:100%" />', initialFocus: "#term-rename-input", actions: [{ label: "Cancel" }, { label: "Rename", primary: true, action: function () { return qs("#term-rename-input").value.trim() || s.title; } }] }) : null;
        if (nb) nb.then(function (v) { if (v) { s.title = v; renderTabs(); } });
      });
      close.addEventListener("click", function () { closeSession(s); });
      els.tabs.appendChild(tab);
    });
  }

  function isVisible(id) { return state.slots[0] === id || state.slots[1] === id; }

  /* ============================== rendering: panes ============================== */
  function renderPanes() {
    // Move each session's host into whichever pane currently shows it, or back to the pool.
    state.sessions.forEach(function (s) {
      if (state.slots[0] === s.id) els.paneA.appendChild(s.host);
      else if (state.slots[1] === s.id) els.paneB.appendChild(s.host);
      else els.pool.appendChild(s.host);
    });
    clearEmptyState(els.paneA);
    clearEmptyState(els.paneB);
    if (!state.slots[0]) showPaneEmptyState(els.paneA, "No terminal here — click + to start one.");
    if (state.split && !state.slots[1]) showPaneEmptyState(els.paneB, "No terminal here yet.");
    els.paneB.classList.toggle("hidden", !state.split);
    els.body.querySelector(".term-panes").classList.toggle("split", state.split);
    layoutVisiblePanes();
  }
  function showPaneEmptyState(pane, msg) {
    clearEmptyState(pane);
    const e = ce("div", "term-pane-empty");
    e.textContent = msg;
    pane.appendChild(e);
  }
  function clearEmptyState(pane) {
    const e = pane.querySelector(".term-pane-empty");
    if (e) e.remove();
  }

  function toggleSplit() {
    if (!state.split) {
      state.split = true;
      if (!state.slots[1]) {
        const p = bridge() ? bridge().getCurrentProject() : null;
        const others = p ? sessionsForProject(p.id).filter(function (s) { return s.id !== state.slots[0]; }) : [];
        if (others.length) state.slots[1] = others[others.length - 1].id;
      }
      state.activeSlot = 1;
    } else {
      state.split = false;
      state.activeSlot = 0;
    }
    renderPanes();
    renderTabs();
  }

  function layoutVisiblePanes() {
    state.sessions.forEach(function (s) {
      if (!isVisible(s.id)) return;
      try {
        s.fitAddon.fit();
        sendResize(s);
      } catch (e) { /* host may be mid-transition; next layout pass will fix it */ }
    });
  }
  function sendResize(s) {
    const cols = s.term.cols, rows = s.term.rows;
    if (s.kind === "real" && s.ws && s.ws.readyState === 1) {
      s.ws.send("c" + JSON.stringify({ type: "resize", cols: cols, rows: rows }));
    }
  }

  function wirePaneFocusTracking() {
    document.addEventListener("mousedown", function (e) {
      if (!els.body) return;
      if (els.paneA && els.paneA.contains(e.target)) { state.activeSlot = 0; markActivePane(); }
      else if (els.paneB && els.paneB.contains(e.target)) { state.activeSlot = 1; markActivePane(); }
    });
  }
  function markActivePane() {
    if (els.paneA) els.paneA.classList.toggle("pane-focused", state.activeSlot === 0);
    if (els.paneB) els.paneB.classList.toggle("pane-focused", state.activeSlot === 1);
  }

  /* ============================== xterm.js construction (shared by real + simulated) ============================== */
  function buildTerm() {
    const term = new window.Terminal({
      fontFamily: "'SF Mono', Menlo, Consolas, 'Cascadia Code', monospace",
      fontSize: 13,
      cursorBlink: true,
      scrollback: 5000,
      allowProposedApi: true,
      theme: {
        background: "#1e1e1e", foreground: "#d4d4d4", cursor: "#d4d4d4",
        black: "#1e1e1e", red: "#f44747", green: "#6a9955", yellow: "#d7ba7d",
        blue: "#569cd6", magenta: "#c586c0", cyan: "#4ec9b0", white: "#d4d4d4",
        brightBlack: "#808080", brightRed: "#f44747", brightGreen: "#6a9955",
        brightYellow: "#d7ba7d", brightBlue: "#569cd6", brightMagenta: "#c586c0",
        brightCyan: "#4ec9b0", brightWhite: "#ffffff",
      },
    });
    const fitAddon = new window.FitAddon.FitAddon();
    term.loadAddon(fitAddon);
    try { term.loadAddon(new window.WebLinksAddon.WebLinksAddon()); } catch (e) {}
    let searchAddon = null;
    try { searchAddon = new window.SearchAddon.SearchAddon(); term.loadAddon(searchAddon); } catch (e) {}
    const host = ce("div", "term-host");
    term.open(host);
    return { term: term, fitAddon: fitAddon, searchAddon: searchAddon, host: host };
  }

  function showDevServerBanner(session, url) {
    if (session.devServerShown) return;
    session.devServerShown = true;
    const banner = ce("div", "term-devserver-banner");
    banner.innerHTML = '<span class="term-devserver-icon">\uD83C\uDF10</span><span class="term-devserver-text">Dev server detected — ' + escapeHtml(url) + "</span>" +
      '<button data-act="open">Open Preview</button><button data-act="dismiss">\u2715</button>';
    banner.querySelector('[data-act="open"]').addEventListener("click", function () {
      if (bridge()) bridge().showPreviewUrl(url, "Dev Server — " + url);
    });
    banner.querySelector('[data-act="dismiss"]').addEventListener("click", function () { banner.remove(); });
    session.host.insertBefore(banner, session.host.firstChild);
  }
  // Only used for "real" (PTY-backed) sessions, where a literal "localhost:PORT" printed by the
  // dev server genuinely IS reachable — it's the person's own machine. WebContainer sessions
  // use attachServerReadyListener() instead: their dev server runs inside a sandboxed in-browser
  // Node process, so "localhost:PORT" in ITS stdout means something only inside that sandbox and
  // can't be reached from the outer browser tab at all (that's the literal cause of "localhost
  // refused to connect" if it's opened) — only the WebContainer API's own `server-ready` event
  // hands back a URL that's actually reachable from here.
  function watchForDevServerUrl(session, chunk) {
    if (session.devServerShown) return;
    const clean = stripAnsi(chunk);
    const m = clean.match(DEVSERVER_RE);
    if (!m) return;
    const url = m[0].replace(/[.,;]+$/, "");
    showDevServerBanner(session, url);
  }

  /* ============================== real (PTY-backed) sessions ============================== */
  function buildRealSessionShell(project, title, backendId) {
    const built = buildTerm();
    const session = {
      id: genId(), kind: "real", projectId: project.id, title: title,
      status: "starting", term: built.term, fitAddon: built.fitAddon, searchAddon: built.searchAddon,
      host: built.host, ws: null, backendId: backendId || null, devServerShown: false,
    };
    built.term.onData(function (data) {
      if (session.status === "exited") { restartSession(session); return; }
      if (data === "\x03" && built.term.hasSelection()) { copySelection(built.term); return; }
      if (session.ws && session.ws.readyState === 1) session.ws.send("d" + data);
    });
    built.term.onResize(function () { sendResize(session); });
    return session;
  }

  function createRealSession(project, title) {
    const session = buildRealSessionShell(project, title, null);
    // Push the current project to disk first so the shell actually has files to work with,
    // then create the session (server-side) rooted at that folder, then attach the socket.
    syncPush(project.id, false).then(function () {
      return fetch("/api/terminal/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, cwd: "", cols: session.term.cols, rows: session.term.rows, title: title }),
      });
    }).then(function (r) { return r.json(); }).then(function (data) {
      if (!data || !data.session) throw new Error((data && data.error) || "failed to start session");
      session.backendId = data.session.id;
      attachSocket(session);
    }).catch(function (err) {
      session.status = "exited";
      session.term.writeln("\x1b[31mCouldn't start a terminal session: " + (err && err.message ? err.message : err) + "\x1b[0m");
      renderTabs();
    });
    return session;
  }

  // A page reload wipes this module's in-memory state, but the server-side shell keeps
  // running. Reattaching (instead of always spawning a fresh one) is what makes a running
  // `npm run dev` survive a browser refresh.
  function reattachRealSession(project, serverSession) {
    const session = buildRealSessionShell(project, serverSession.title || "Terminal", serverSession.id);
    attachSocket(session);
    return session;
  }

  function copySelection(term) {
    const text = term.getSelection();
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).catch(function () {});
  }

  function attachSocket(session) {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const url = proto + "//" + location.host + "/api/terminal/sessions/" + encodeURIComponent(session.backendId) + "/socket";
    const ws = new WebSocket(url);
    session.ws = ws;
    ws.addEventListener("open", function () { sendResize(session); });
    ws.addEventListener("message", function (ev) {
      const msg = String(ev.data);
      const tag = msg.charAt(0), rest = msg.slice(1);
      if (tag === "d") {
        session.term.write(rest);
        watchForDevServerUrl(session, rest);
      } else if (tag === "c") {
        let ctrl; try { ctrl = JSON.parse(rest); } catch (e) { return; }
        if (ctrl.type === "ready") {
          // Trust the server's status — on a fresh reload-reattach this may already be "exited".
          session.status = ctrl.status === "exited" ? "exited" : "running";
          if (session.status === "exited") {
            session.term.write("\r\n\x1b[1;30m[Process exited" + (ctrl.exitCode != null ? " with code " + ctrl.exitCode : "") + "]\x1b[0m\r\n\x1b[90mPress any key to restart.\x1b[0m");
          }
          renderTabs();
        } else if (ctrl.type === "exit") {
          session.status = "exited";
          session.term.write("\r\n\x1b[1;30m[Process exited" + (ctrl.code != null ? " with code " + ctrl.code : "") + (ctrl.signal ? " (" + ctrl.signal + ")" : "") + "]\x1b[0m\r\n\x1b[90mPress any key to restart.\x1b[0m");
          renderTabs();
        } else if (ctrl.type === "restarting") {
          session.status = "starting";
          renderTabs();
        }
      }
    });
    ws.addEventListener("close", function () {
      if (session.status !== "exited") {
        session.status = "exited";
        session.term.write("\r\n\x1b[1;30m[Connection to terminal backend closed]\x1b[0m\r\n");
        renderTabs();
      }
    });
    ws.addEventListener("error", function () {});
  }

  /* ============================== WebContainers (in-browser Node runtime) sessions ============================== */
  // Last-resort fallback, used only when no local backend is reachable at all AND this page is
  // cross-origin isolated (see vercel.json / public/_headers — never enabled for server.js or
  // `npm run dev`, since a real backend always wins when one's available). Gives real npm/node
  // execution with zero server, including on mobile/tablet. See README.md for what it can't do
  // (git, Python) and the licensing terms for using it beyond personal/OSS/prototype use.
  function bootWebContainerForProject(project) {
    const wc = window.__cfWebContainer;
    if (!wc) return Promise.reject(new Error("The in-browser runtime didn't load."));
    // Only the FIRST boot for a project does a full mount(); reusing an already-booted instance
    // (e.g. opening a 2nd tab) must NOT re-mount — that would risk clobbering things real
    // commands created in there since, like a freshly-installed node_modules.
    const alreadyBootedForThisProject = wc.getBootedProjectId() === project.id;
    return wc.bootForProject(project.id).catch(function (err) {
      if (err && err.code === "ALREADY_BOOTED_DIFFERENT_PROJECT") {
        return bridge().confirmModal(
          "Only one in-browser Node runtime can run at a time. Switching here will stop whatever's currently running for the other project.",
          { title: "Switch in-browser runtime?", confirmLabel: "Switch anyway" }
        ).then(function (ok) {
          if (!ok) { const cancelled = new Error("cancelled"); cancelled.code = "USER_CANCELLED"; throw cancelled; }
          return wc.teardownCurrent().then(function () { return wc.bootForProject(project.id); });
        });
      }
      throw err;
    }).then(function (instance) {
      if (alreadyBootedForThisProject) return instance;
      return mountProjectFiles(instance, project).then(function () { return instance; });
    });
  }

  function mountProjectFiles(instance, project) {
    const b = bridge();
    const tree = buildFileSystemTree(b ? b.listFiles() : []);
    return instance.mount(tree);
  }

  // Writes files individually via fs.writeFile rather than re-mounting the whole tree — used
  // for every sync AFTER the initial mount, specifically because it can only ever add/update
  // the exact paths given, never delete anything else (unlike mount(), whose semantics for
  // pre-existing, non-overlapping files aren't part of the documented contract).
  function writeChangedFilesToWc(instance, files) {
    const dirsEnsured = new Set();
    function ensureDir(dirPath) {
      if (!dirPath || dirsEnsured.has(dirPath)) return Promise.resolve();
      dirsEnsured.add(dirPath);
      return instance.fs.mkdir(dirPath, { recursive: true }).catch(function () {});
    }
    let chain = Promise.resolve();
    files.filter(function (f) { return f.type === "file"; }).forEach(function (f) {
      chain = chain.then(function () {
        const dir = f.path.indexOf("/") !== -1 ? f.path.slice(0, f.path.lastIndexOf("/")) : "";
        return ensureDir(dir).then(function () {
          if (f.isBinary && f.dataUrl) {
            const b64 = f.dataUrl.split(",")[1] || "";
            return instance.fs.writeFile(f.path, base64ToUint8Array(b64)).catch(function () {});
          }
          return instance.fs.writeFile(f.path, f.content || "").catch(function () {});
        });
      });
    });
    return chain;
  }

  // Converts CodeForge's flat {path, type, content, isBinary, dataUrl}[] into the nested
  // {name: {file:{contents}} | {directory:{...}}} shape WebContainers' mount() expects.
  function buildFileSystemTree(files) {
    const root = {};
    function ensureDir(pathParts) {
      let node = root;
      pathParts.forEach(function (part) {
        if (!node[part]) node[part] = { directory: {} };
        node = node[part].directory;
      });
      return node;
    }
    files.forEach(function (f) {
      if (f.type !== "file") return;
      const parts = f.path.split("/").filter(Boolean);
      const name = parts.pop();
      if (!name) return;
      const dir = ensureDir(parts);
      if (f.isBinary && f.dataUrl) {
        const b64 = f.dataUrl.split(",")[1] || "";
        try { dir[name] = { file: { contents: base64ToUint8Array(b64) } }; }
        catch (e) { dir[name] = { file: { contents: "" } }; }
      } else {
        dir[name] = { file: { contents: f.content || "" } };
      }
    });
    return root;
  }
  function base64ToUint8Array(b64) {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  }

  function describeWebContainerError(err) {
    if (err && err.code === "USER_CANCELLED") return "Cancelled.";
    if (err && /crossOriginIsolated|SharedArrayBuffer/i.test(err.message || "")) return "This browser/page isn't cross-origin isolated, so the in-browser runtime can't start here.";
    return (err && err.message) || String(err);
  }

  let wcNoticeShown = false;
  function announceWebContainerNoticeOnce() {
    if (wcNoticeShown) return;
    wcNoticeShown = true;
    const b = bridge();
    if (b) b.toast("Using WebContainers for a real in-browser terminal — free for personal/OSS/prototype use; see README.md for commercial-use licensing terms.");
  }

  function createWebContainerSession(project, title) {
    const built = buildTerm();
    const session = {
      id: genId(), kind: "webcontainer", projectId: project.id, title: title,
      status: "starting", term: built.term, fitAddon: built.fitAddon, searchAddon: built.searchAddon,
      host: built.host, proc: null, inputWriter: null, devServerShown: false,
    };
    built.term.write("\x1b[90mBooting an in-browser Node.js runtime (WebContainers)\u2026 first boot needs network access and can take a few seconds.\x1b[0m\r\n");
    announceWebContainerNoticeOnce();
    spawnWebContainerShell(session, project);

    built.term.onData(function (data) {
      if (session.status === "exited") { restartSession(session); return; }
      if (data === "\x03" && built.term.hasSelection()) { copySelection(built.term); return; }
      if (session.inputWriter) { try { session.inputWriter.write(data); } catch (e) {} }
    });
    built.term.onResize(function () {
      if (session.proc) { try { session.proc.resize({ cols: built.term.cols, rows: built.term.rows }); } catch (e) {} }
    });
    return session;
  }

  // See the comment on watchForDevServerUrl for why WebContainer sessions can't use stdout
  // scraping: only this event hands back a URL actually reachable from the outer browser tab.
  // Re-attached on every spawn (including restarts) since a fresh instance.spawn() call doesn't
  // imply a fresh WebContainer boot — the underlying instance (and its event emitter) is reused
  // across restarts within the same project, so the old listener is torn down first to avoid
  // stacking duplicate listeners and duplicate banners over repeated restarts.
  function attachServerReadyListener(session, instance) {
    if (session.serverReadyOff) { try { session.serverReadyOff(); } catch (e) {} }
    session.serverReadyOff = instance.on("server-ready", function (port, url) {
      showDevServerBanner(session, url);
    });
  }

  function spawnWebContainerShell(session, project) {
    bootWebContainerForProject(project).then(function (instance) {
      attachServerReadyListener(session, instance);
      return instance.spawn("jsh", { terminal: { cols: session.term.cols, rows: session.term.rows } });
    }).then(function (proc) {
      session.proc = proc;
      session.status = "running";
      session.inputWriter = proc.input.getWriter();
      renderTabs();
      const reader = proc.output.getReader();
      (function pump() {
        reader.read().then(function (res) {
          if (res.done || session.proc !== proc) return; // stale reader from a process a restart already replaced
          session.term.write(res.value);
          pump();
        }).catch(function () {});
      })();
      proc.exit.then(function (code) {
        // Guard against the same restart race as the server-side PTY code: killing this proc
        // in restartWebContainerSession() is followed synchronously by a fresh spawn that
        // reassigns session.proc, but this OLD process's exit promise still resolves afterward.
        if (session.proc !== proc) return;
        session.status = "exited";
        session.term.write("\r\n\x1b[1;30m[Process exited" + (code != null ? " with code " + code : "") + "]\x1b[0m\r\n\x1b[90mPress any key to restart.\x1b[0m");
        renderTabs();
      });
    }).catch(function (err) {
      session.status = "exited";
      session.term.writeln("\x1b[31m" + describeWebContainerError(err) + "\x1b[0m");
      renderTabs();
    });
  }

  function restartWebContainerSession(session) {
    if (session.proc) try { session.proc.kill(); } catch (e) {}
    if (session.serverReadyOff) { try { session.serverReadyOff(); } catch (e) {} session.serverReadyOff = null; }
    session.devServerShown = false;
    const staleBanner = session.host.querySelector(".term-devserver-banner");
    if (staleBanner) staleBanner.remove();
    session.status = "starting";
    session.inputWriter = null;
    session.term.clear();
    session.term.writeln("\x1b[90m[restarting\u2026]\x1b[0m");
    const p = bridge() ? bridge().getCurrentProject() : null;
    if (p) spawnWebContainerShell(session, p);
  }

  /* ============================== simulated (in-browser) sessions ============================== */
  function createSimSession(project, title) {
    const built = buildTerm();
    const session = {
      id: genId(), kind: "sim", projectId: project.id, title: title,
      status: "running", term: built.term, fitAddon: built.fitAddon, searchAddon: built.searchAddon,
      host: built.host, devServerShown: false,
      cwd: "", line: "", cursor: 0, history: [], histIdx: -1,
    };
    session.reset = function () {
      session.cwd = ""; session.line = ""; session.cursor = 0;
      built.term.reset();
      printBanner(session);
      printPrompt(session);
    };
    printBanner(session);
    printPrompt(session);

    built.term.onData(function (data) { handleSimInput(session, data); });
    return session;
  }

  function printBanner(session) {
    const t = session.term;
    t.writeln("\x1b[1mCodeForge \u2014 simulated terminal\x1b[0m");
    t.writeln("No local backend found, and no in-browser Node runtime is available here either, so");
    t.writeln("this is an in-browser simulation working on your project's virtual filesystem \u2014 not a");
    t.writeln("real shell. For a real shell with git/npm/node/python, run \x1b[36mnpm run dev\x1b[0m or");
    t.writeln("\x1b[36mnode server.js\x1b[0m from this project's folder, then reload. For real (but git/Python-");
    t.writeln("less) npm/node execution with zero server, this deploy would need to serve pages cross-");
    t.writeln("origin isolated (see public/_headers, vercel.json) on a browser that supports it.");
    t.writeln("Type \x1b[36mhelp\x1b[0m for what works here.");
    t.writeln("");
  }
  function promptText(session) {
    const b = bridge();
    const proj = b ? b.getCurrentProject() : null;
    const name = proj ? proj.name : "project";
    return "\x1b[32m" + name + "\x1b[0m:\x1b[34m/" + session.cwd + "\x1b[0m$ ";
  }
  function printPrompt(session) { session.term.write("\r\n" + promptText(session)); }
  function redrawLine(session) {
    session.term.write("\r\x1b[K" + promptText(session) + session.line);
    const back = session.line.length - session.cursor;
    if (back > 0) session.term.write("\x1b[" + back + "D");
  }

  function handleSimInput(session, data) {
    for (let i = 0; i < data.length; i++) {
      const ch = data[i];
      const code = data.charCodeAt(i);
      if (ch === "\r") { // Enter
        session.term.write("\r\n");
        const cmd = session.line;
        session.line = ""; session.cursor = 0;
        if (cmd.trim()) { session.history.push(cmd); session.histIdx = session.history.length; }
        runSimCommand(session, cmd).then(function () { printPrompt(session); });
        return; // remaining chars (if pasted) handled on next onData tick
      } else if (ch === "\x7f" || code === 8) { // Backspace
        if (session.cursor > 0) { session.line = session.line.slice(0, session.cursor - 1) + session.line.slice(session.cursor); session.cursor--; redrawLine(session); }
      } else if (ch === "\x03") { // Ctrl+C
        session.term.write("^C");
        session.line = ""; session.cursor = 0;
        printPrompt(session);
      } else if (ch === "\t") { // Tab: minimal path completion
        completeSim(session);
      } else if (ch === "\x1b") { // escape sequences (arrows, home/end, delete)
        const seq = data.slice(i, i + 3);
        if (seq === "\x1b[A") { histNav(session, -1); i += 2; }
        else if (seq === "\x1b[B") { histNav(session, 1); i += 2; }
        else if (seq === "\x1b[C") { if (session.cursor < session.line.length) { session.cursor++; session.term.write("\x1b[C"); } i += 2; }
        else if (seq === "\x1b[D") { if (session.cursor > 0) { session.cursor--; session.term.write("\x1b[D"); } i += 2; }
        else if (data.slice(i, i + 4) === "\x1b[3~") { if (session.cursor < session.line.length) { session.line = session.line.slice(0, session.cursor) + session.line.slice(session.cursor + 1); redrawLine(session); } i += 3; }
        else if (seq === "\x1b[H" || data.slice(i, i + 3) === "\x1bOH" || data.slice(i, i + 4) === "\x1b[1~") { session.cursor = 0; redrawLine(session); i += (data.slice(i, i + 4) === "\x1b[1~" ? 3 : 2); }
        else if (seq === "\x1b[F" || data.slice(i, i + 3) === "\x1bOF" || data.slice(i, i + 4) === "\x1b[4~") { session.cursor = session.line.length; redrawLine(session); i += (data.slice(i, i + 4) === "\x1b[4~" ? 3 : 2); }
      } else if (code >= 32) { // printable
        session.line = session.line.slice(0, session.cursor) + ch + session.line.slice(session.cursor);
        session.cursor++;
        redrawLine(session);
      }
    }
  }
  function histNav(session, dir) {
    if (!session.history.length) return;
    session.histIdx = Math.max(0, Math.min(session.history.length, session.histIdx + dir));
    session.line = session.histIdx < session.history.length ? session.history[session.histIdx] : "";
    session.cursor = session.line.length;
    redrawLine(session);
  }
  function completeSim(session) {
    const b = bridge(); if (!b) return;
    const parts = session.line.split(" ");
    const frag = parts[parts.length - 1];
    const dir = frag.indexOf("/") !== -1 ? frag.slice(0, frag.lastIndexOf("/") + 1) : "";
    const resolvedDir = resolveSimPath(session, dir || ".");
    const names = b.listFiles()
      .map(function (f) { return f.path; })
      .filter(function (p) { return dirName(p) === resolvedDir; })
      .map(function (p) { return baseNameOf(p); })
      .filter(function (n) { return n.indexOf(baseNameOf(frag)) === 0; });
    if (names.length === 1) {
      const completed = dir + names[0];
      session.line = parts.slice(0, -1).concat([completed]).join(" ");
      session.cursor = session.line.length;
      redrawLine(session);
    } else if (names.length > 1) {
      session.term.write("\r\n" + names.join("  "));
      printPrompt(session);
      session.term.write(session.line);
    }
  }
  function dirName(p) { const i = p.lastIndexOf("/"); return i === -1 ? "" : p.slice(0, i); }
  function baseNameOf(p) { return p.split("/").pop(); }
  function resolveSimPath(session, input) {
    if (!input) return session.cwd;
    let base = input.charAt(0) === "/" ? "" : session.cwd;
    const stack = base ? base.split("/") : [];
    input.split("/").forEach(function (part) {
      if (!part || part === ".") return;
      if (part === "..") stack.pop();
      else stack.push(part);
    });
    return stack.join("/");
  }

  const SIM_UNSUPPORTED = ["npm", "npx", "node", "pnpm", "bun", "python", "python3", "pip", "pip3", "yarn", "git", "vim", "nano", "curl", "wget", "make", "go", "cargo", "docker"];
  function runSimCommand(session, raw) {
    const b = bridge();
    const line = raw.trim();
    if (!line) return Promise.resolve();
    const parts = line.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
    const cmd = (parts[0] || "").replace(/"/g, "");
    const args = parts.slice(1).map(function (a) { return a.replace(/^"|"$/g, ""); });
    const w = session.term;
    if (!b) { w.writeln("(no project context available)"); return Promise.resolve(); }

    switch (cmd) {
      case "help":
        w.writeln("Simulated commands: ls, cd, pwd, cat, echo, touch, mkdir, rm, mv, cp, find,");
        w.writeln("grep, tree, git status, history, clear, whoami, date, help.");
        w.writeln("Real dev tools (npm/node/python/git clone/…) need the local backend — see the");
        w.writeln("banner above.");
        break;
      case "clear": w.clear(); break;
      case "pwd": w.writeln("/" + session.cwd); break;
      case "whoami": w.writeln("you"); break;
      case "date": w.writeln(new Date().toString()); break;
      case "history": session.history.forEach(function (h, i) { w.writeln("  " + (i + 1) + "  " + h); }); break;
      case "echo": {
        const gtIdx = args.indexOf(">"); const gtgtIdx = args.indexOf(">>");
        const text = args.filter(function (a, i) { return i < (gtIdx !== -1 ? gtIdx : gtgtIdx !== -1 ? gtgtIdx : args.length); }).join(" ");
        if (gtIdx !== -1 || gtgtIdx !== -1) {
          const target = args[(gtIdx !== -1 ? gtIdx : gtgtIdx) + 1];
          if (!target) { w.writeln("echo: missing redirect target"); break; }
          const path = resolveSimPath(session, target);
          const prev = gtgtIdx !== -1 ? (b.getFile(path) || {}).content || "" : "";
          b.writeFile(path, prev + text + "\n");
        } else w.writeln(text);
        break;
      }
      case "ls": {
        const target = resolveSimPath(session, args.filter(function (a) { return a.charAt(0) !== "-"; })[0] || ".");
        const all = b.listFiles();
        const names = all.filter(function (f) { return dirName(f.path) === target && f.path !== target; }).map(function (f) { return f; });
        if (!names.length && target && !b.exists(target)) { w.writeln("ls: " + (args[0] || ".") + ": No such file or directory"); break; }
        names.sort(function (a, c) { return a.path.localeCompare(c.path); });
        w.writeln(names.map(function (f) { return f.type === "dir" ? "\x1b[34m" + baseNameOf(f.path) + "/\x1b[0m" : baseNameOf(f.path); }).join("  ") || "(empty)");
        break;
      }
      case "cd": {
        const target = resolveSimPath(session, args[0] || "");
        if (target && !b.exists(target)) { w.writeln("cd: " + args[0] + ": No such file or directory"); break; }
        session.cwd = target;
        break;
      }
      case "cat": {
        if (!args.length) { w.writeln("usage: cat <file>"); break; }
        args.forEach(function (a) {
          const path = resolveSimPath(session, a);
          const f = b.getFile(path);
          if (!f || f.type !== "file") { w.writeln("cat: " + a + ": No such file"); return; }
          if (f.isBinary) { w.writeln("cat: " + a + ": binary file, not shown"); return; }
          f.content.split("\n").forEach(function (l) { w.writeln(l); });
        });
        break;
      }
      case "touch": {
        if (!args.length) { w.writeln("usage: touch <file>"); break; }
        args.forEach(function (a) { const path = resolveSimPath(session, a); if (!b.exists(path)) b.writeFile(path, ""); });
        break;
      }
      case "mkdir": {
        const real = args.filter(function (a) { return a !== "-p"; });
        if (!real.length) { w.writeln("usage: mkdir [-p] <dir>"); break; }
        real.forEach(function (a) { b.mkdir(resolveSimPath(session, a)); });
        break;
      }
      case "rm": {
        const real = args.filter(function (a) { return a !== "-r" && a !== "-rf" && a !== "-f"; });
        if (!real.length) { w.writeln("usage: rm [-r] <path>"); break; }
        real.forEach(function (a) { const path = resolveSimPath(session, a); if (b.exists(path)) b.deletePath(path); else w.writeln("rm: " + a + ": No such file or directory"); });
        break;
      }
      case "mv": {
        if (args.length < 2) { w.writeln("usage: mv <src> <dst>"); break; }
        const from = resolveSimPath(session, args[0]); const to = resolveSimPath(session, args[1]);
        if (!b.exists(from)) { w.writeln("mv: " + args[0] + ": No such file or directory"); break; }
        b.renamePath(from, to);
        break;
      }
      case "cp": {
        if (args.length < 2) { w.writeln("usage: cp <src> <dst>"); break; }
        const from = resolveSimPath(session, args[0]); const to = resolveSimPath(session, args[1]);
        const f = b.getFile(from);
        if (!f) { w.writeln("cp: " + args[0] + ": No such file (directory copy not supported in simulated mode)"); break; }
        if (f.isBinary) b.writeBinaryFile(to, f.dataUrl, f.content.length); else b.writeFile(to, f.content);
        break;
      }
      case "tree": {
        const all = b.listFiles().map(function (f) { return f.path; }).sort();
        all.forEach(function (p) { w.writeln("  " + p); });
        break;
      }
      case "find": {
        if (!args.length) { w.writeln("usage: find <name-substring>"); break; }
        b.listFiles().filter(function (f) { return f.path.indexOf(args[0]) !== -1; }).forEach(function (f) { w.writeln("/" + f.path); });
        break;
      }
      case "grep": {
        if (!args.length) { w.writeln("usage: grep <pattern> [file]"); break; }
        const pattern = args[0];
        const targets = args[1] ? [b.getFile(resolveSimPath(session, args[1]))].filter(Boolean) : b.listFiles().filter(function (f) { return f.type === "file" && !f.isBinary; });
        targets.forEach(function (f) {
          if (f.isBinary) return;
          (f.content || "").split("\n").forEach(function (l, idx) { if (l.indexOf(pattern) !== -1) w.writeln("\x1b[35m" + f.path + "\x1b[0m:" + (idx + 1) + ": " + l); });
        });
        break;
      }
      case "git": {
        if (args[0] === "status") {
          if (!b.isGitLinked()) { w.writeln("Not tracking a GitHub baseline for this project. (Source Control \u2192 Link to GitHub repo, or use the real backend for actual git.)"); break; }
          const changes = b.getGitChanges();
          if (!changes.length) { w.writeln("nothing to commit, working tree clean (simulated)"); break; }
          changes.forEach(function (c) {
            const letter = c.status === "added" ? "A" : c.status === "deleted" ? "D" : c.status === "renamed" ? "R" : "M";
            w.writeln("  " + letter + "  " + c.path + (c.oldPath ? " (from " + c.oldPath + ")" : ""));
          });
        } else {
          w.writeln("git: only 'git status' is simulated here. Real git needs the local backend \u2014 see the banner above.");
        }
        break;
      }
      default:
        if (SIM_UNSUPPORTED.indexOf(cmd) !== -1) {
          w.writeln("\x1b[33m" + cmd + ": this is CodeForge's simulated terminal \u2014 " + cmd + " needs a real shell.\x1b[0m");
          w.writeln("Run \x1b[36mnpm run dev\x1b[0m or \x1b[36mnode server.js\x1b[0m from this project locally, then reload.");
        } else {
          w.writeln(cmd + ": command not found (simulated shell — type 'help')");
        }
    }
    return Promise.resolve();
  }

  /* ============================== workspace sync: push (browser \u2192 disk or in-browser fs) ============================== */
  function syncPush(projectId, announce) {
    if (state.mode === "webcontainer") return wcSyncPush(projectId, announce);
    return restSyncPush(projectId, announce);
  }
  function restSyncPush(projectId, announce) {
    const b = bridge();
    if (!b || state.mode === "simulated") return Promise.resolve();
    const files = b.listFiles().filter(function (f) { return f.type === "file"; }).map(function (f) {
      return f.isBinary ? { path: f.path, isBinary: true, dataUrl: f.dataUrl } : { path: f.path, content: f.content };
    });
    const allPaths = files.map(function (f) { return f.path; });
    return fetch("/api/workspace/" + encodeURIComponent(projectId) + "/sync", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files: files, allPaths: allPaths }),
    }).then(function (r) { return r.json(); }).then(function (data) {
      if (data && data.ok) {
        state.pushMeta[projectId] = { lastPushedAt: Date.now(), paths: allPaths };
        if (announce) b.toast("Synced " + data.written + " file" + (data.written === 1 ? "" : "s") + " to disk" + (data.deleted ? " (" + data.deleted + " removed)" : ""));
      } else if (announce) {
        b.toast("Sync failed: " + ((data && data.error) || "unknown error"), "error");
      }
      return data;
    }).catch(function (err) {
      if (announce) b.toast("Sync failed: " + err.message, "error");
    });
  }
  function wcSyncPush(projectId, announce) {
    const b = bridge();
    const wc = window.__cfWebContainer;
    // Only push into an instance that's already running for this project — a background sync
    // tick should never be what triggers the (slow, network-dependent) first boot.
    if (!wc || wc.getBootedProjectId() !== projectId) return Promise.resolve();
    return wc.bootForProject(projectId).then(function (instance) {
      return writeChangedFilesToWc(instance, b.listFiles());
    }).then(function () {
      if (announce && b) b.toast("Synced current files into the in-browser runtime.");
    }).catch(function (err) {
      if (announce && b) b.toast("Sync failed: " + describeWebContainerError(err), "error");
    });
  }

  /* ============================== workspace sync: pull (disk or in-browser fs \u2192 browser) ============================== */
  function syncPull(projectId) {
    if (state.mode === "webcontainer") { wcSyncPull(projectId); return; }
    restSyncPull(projectId);
  }
  function restSyncPull(projectId) {
    const b = bridge();
    if (!b) return;
    if (state.mode === "simulated") { b.toast("No local backend to pull from — run the real terminal backend first.", "error"); return; }
    b.showBusy("Checking for changes on disk\u2026");
    fetch("/api/workspace/" + encodeURIComponent(projectId) + "/tree")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        b.hideBusy();
        if (!data || !data.files) throw new Error((data && data.error) || "couldn't read workspace");
        const meta = state.pushMeta[projectId] || { lastPushedAt: 0, paths: [] };
        const browserPaths = new Set(b.listFiles().filter(function (f) { return f.type === "file"; }).map(function (f) { return f.path; }));
        const changed = data.files.filter(function (f) {
          const isNew = !browserPaths.has(f.path);
          const touchedSincePush = f.mtime > meta.lastPushedAt + 500; // small slack for clock/write granularity
          return isNew || touchedSincePush;
        }).map(function (f) { return f.path; });
        if (!changed.length) { b.toast("Nothing new on disk — already in sync."); return; }
        showPullConfirm(projectId, changed);
      }).catch(function (err) {
        b.hideBusy();
        b.toast("Couldn't check disk: " + err.message, "error");
      });
  }

  const WC_EXPORT_EXCLUDES = ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/build/**", "**/.next/**", "**/__pycache__/**", "**/.cache/**"];
  function flattenFileSystemTree(tree, prefix, out) {
    Object.keys(tree).forEach(function (name) {
      const node = tree[name];
      const path = prefix ? prefix + "/" + name : name;
      if (node.directory) { flattenFileSystemTree(node.directory, path, out); return; }
      if (!node.file || node.file.symlink !== undefined) return; // skip symlinks
      const contents = node.file.contents;
      if (typeof contents === "string") out.push({ path: path, isBinary: false, content: contents });
      else if (contents) out.push({ path: path, isBinary: true, content: uint8ArrayToBase64(contents) });
    });
  }
  function uint8ArrayToBase64(u8) {
    let bin = "";
    for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
    return btoa(bin);
  }
  function wcSyncPull(projectId) {
    const b = bridge();
    const wc = window.__cfWebContainer;
    if (!wc || wc.getBootedProjectId() !== projectId) { b.toast("No in-browser runtime running for this project yet.", "error"); return; }
    b.showBusy("Checking the in-browser filesystem\u2026");
    wc.bootForProject(projectId).then(function (instance) {
      return instance.export(".", { format: "json", excludes: WC_EXPORT_EXCLUDES });
    }).then(function (tree) {
      b.hideBusy();
      const flat = [];
      flattenFileSystemTree(tree, "", flat);
      const browserPaths = new Set(b.listFiles().filter(function (f) { return f.type === "file"; }).map(function (f) { return f.path; }));
      // WebContainers' export doesn't give per-file timestamps, so: new paths always count as
      // changed, and existing text files count if their content actually differs. Binary files
      // are cheap to re-offer since there's no cheap way to diff them here.
      const changed = flat.filter(function (f) {
        if (!browserPaths.has(f.path)) return true;
        const existing = b.getFile(f.path);
        if (!existing || f.isBinary !== existing.isBinary) return true;
        return f.isBinary ? true : f.content !== existing.content;
      }).map(function (f) { return f.path; });
      if (!changed.length) { b.toast("Nothing new in the in-browser filesystem — already in sync."); return; }
      showWcPullConfirm(flat, changed);
    }).catch(function (err) {
      b.hideBusy();
      b.toast("Couldn't read the in-browser filesystem: " + describeWebContainerError(err), "error");
    });
  }
  function showWcPullConfirm(flatFiles, changedPaths) {
    const b = bridge();
    const shown = changedPaths.slice(0, 30).map(function (p) { return "<div>" + escapeHtml(p) + "</div>"; }).join("");
    const more = changedPaths.length > 30 ? "<div>\u2026and " + (changedPaths.length - 30) + " more</div>" : "";
    b.openModal({
      title: "Pull changes from the in-browser runtime?",
      bodyHtml: '<p>' + changedPaths.length + " file(s) look new or changed:</p>" +
        '<div style="max-height:220px;overflow:auto;font-family:monospace;font-size:12px;margin:8px 0;">' + shown + more + "</div>" +
        "<p>Files with unsaved edits in the editor will be skipped.</p>",
      actions: [{ label: "Cancel" }, { label: "Pull " + changedPaths.length + " file(s)", primary: true, action: function () { return true; } }],
    }).then(function (ok) { if (ok) doWcPull(flatFiles, changedPaths); });
  }
  function doWcPull(flatFiles, changedPaths) {
    const b = bridge();
    const changedSet = new Set(changedPaths);
    let written = 0, skipped = 0;
    flatFiles.forEach(function (f) {
      if (!changedSet.has(f.path)) return;
      if (b.isDirty(f.path)) { skipped++; return; }
      if (f.isBinary) b.writeBinaryFile(f.path, "data:application/octet-stream;base64," + f.content, f.content.length);
      else b.writeFile(f.path, f.content);
      written++;
    });
    b.refreshTree();
    b.toast("Pulled " + written + " file(s)" + (skipped ? ", skipped " + skipped + " with unsaved changes" : ""));
  }

  function showPullConfirm(projectId, paths) {
    const b = bridge();
    const shown = paths.slice(0, 30).map(function (p) { return "<div>" + escapeHtml(p) + "</div>"; }).join("");
    const more = paths.length > 30 ? "<div>\u2026and " + (paths.length - 30) + " more</div>" : "";
    b.openModal({
      title: "Pull changes from disk?",
      bodyHtml: '<p>' + paths.length + " file(s) on disk look new or changed since the last sync:</p>" +
        '<div style="max-height:220px;overflow:auto;font-family:monospace;font-size:12px;margin:8px 0;">' + shown + more + "</div>" +
        "<p>Files with unsaved edits in the editor will be skipped.</p>",
      actions: [{ label: "Cancel" }, { label: "Pull " + paths.length + " file(s)", primary: true, action: function () { return true; } }],
    }).then(function (ok) { if (ok) doPull(projectId, paths); });
  }

  function doPull(projectId, paths) {
    const b = bridge();
    b.showBusy("Pulling files from disk\u2026");
    fetch("/api/workspace/" + encodeURIComponent(projectId) + "/files", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paths: paths }),
    }).then(function (r) { return r.json(); }).then(function (data) {
      let written = 0, skipped = 0;
      (data.files || []).forEach(function (f) {
        if (b.isDirty(f.path)) { skipped++; return; }
        if (f.isBinary) b.writeBinaryFile(f.path, "data:application/octet-stream;base64," + f.content, f.content.length);
        else b.writeFile(f.path, f.content);
        written++;
      });
      b.refreshTree();
      b.hideBusy();
      b.toast("Pulled " + written + " file(s)" + (skipped ? ", skipped " + skipped + " with unsaved changes" : ""));
    }).catch(function (err) {
      b.hideBusy();
      b.toast("Pull failed: " + err.message, "error");
    });
  }

  function autoPushTick() {
    if (!state.open || state.mode === "simulated") return;
    const p = bridge() ? bridge().getCurrentProject() : null;
    if (!p) return;
    const hasRunning = sessionsForProject(p.id).some(function (s) { return (s.kind === "real" || s.kind === "webcontainer") && s.status === "running"; });
    if (hasRunning) syncPush(p.id, false);
  }

  /* ============================== public API ============================== */
  const api = {
    toggle: function () { if (state.open) closePanel(); else openPanel(); },
    open: openPanel,
    close: closePanel,
    newSession: function () { openPanel(); createSessionForCurrentProject(true); },
    split: function () { openPanel(); toggleSplit(); },
    killActive: function () { const s = activeSession(); if (s) closeSession(s); },
    restartActive: function () { const s = activeSession(); if (s) restartSession(s); },
    syncPush: function () { const p = requireProject(); if (p) syncPush(p.id, true); },
    syncPull: function () { const p = requireProject(); if (p) syncPull(p.id); },
    isOpen: function () { return state.open; },
  };

}());
