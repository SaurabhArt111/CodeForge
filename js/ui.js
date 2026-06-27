// =================== UI HELPERS ===================
// js/ui.js

function notify(msg, duration) {
  const el = document.getElementById('notification');
  const textEl = document.getElementById('notification-text');
  if (!el || !textEl) return;
  textEl.textContent = msg;
  el.classList.add('visible');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('visible'), duration || 2200);
}

// =================== SIDEBAR ===================
function toggleSidebar() {
  state.sidebarVisible = !state.sidebarVisible;
  const sb = document.getElementById('sidebar');
  const resize = document.getElementById('sidebar-resize');
  if (!sb) return;
  sb.classList.toggle('hidden', !state.sidebarVisible);
  document.body.classList.toggle('sidebar-open', state.sidebarVisible);
  if (resize) resize.style.display = state.sidebarVisible ? '' : 'none';

  // Ensure scrim element exists for mobile backdrop
  let scrim = document.getElementById('sidebar-scrim');
  if (!scrim) {
    scrim = document.createElement('div');
    scrim.id = 'sidebar-scrim';
    document.body.appendChild(scrim);
    scrim.addEventListener('click', () => {
      if (state.sidebarVisible) toggleSidebar();
    });
  }
}

function switchActivity(name) {
  // Clicking the already-active activity closes the sidebar
  if (state.currentActivity === name && state.sidebarVisible) {
    toggleSidebar(); return;
  }
  state.currentActivity = name;
  document.querySelectorAll('.activity-btn[id^="ab-"]').forEach(b => b.classList.remove('active'));
  document.getElementById('ab-' + name)?.classList.add('active');
  document.querySelectorAll('.sidebar-content').forEach(c => c.style.display = 'none');
  const target = document.getElementById('sb-' + name);
  if (target) target.style.display = 'flex';
  if (!state.sidebarVisible) {
    state.sidebarVisible = true;
    document.getElementById('sidebar')?.classList.remove('hidden');
    document.getElementById('sidebar-resize')?.style.setProperty('display', '');
  }
  if (name === 'snippets') renderSnippetsList();
}

// =================== SIDEBAR RESIZE (desktop + touch) ===================
document.addEventListener('DOMContentLoaded', () => {
  const resize = document.getElementById('sidebar-resize');
  const sidebar = document.getElementById('sidebar');
  if (!resize || !sidebar) return;

  let dragging = false, startX, startW;

  // Mouse
  resize.addEventListener('mousedown', e => {
    dragging = true; startX = e.clientX; startW = sidebar.clientWidth; e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const newW = Math.min(Math.max(140, startW + (e.clientX - startX)), 500);
    sidebar.style.width = newW + 'px';
    sidebar.style.minWidth = newW + 'px';
  });
  document.addEventListener('mouseup', () => { dragging = false; });

  // Touch resize
  resize.addEventListener('touchstart', e => {
    dragging = true; startX = e.touches[0].clientX; startW = sidebar.clientWidth;
  }, { passive: true });
  document.addEventListener('touchmove', e => {
    if (!dragging) return;
    const newW = Math.min(Math.max(140, startW + (e.touches[0].clientX - startX)), 500);
    sidebar.style.width = newW + 'px';
    sidebar.style.minWidth = newW + 'px';
  }, { passive: true });
  document.addEventListener('touchend', () => { dragging = false; });
});

// =================== SWIPE GESTURES ===================
(function initSwipeGestures() {
  document.addEventListener('DOMContentLoaded', () => {
    let touchStartX = 0, touchStartY = 0, touchStartTime = 0;

    document.addEventListener('touchstart', e => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      touchStartTime = Date.now();
    }, { passive: true });

    document.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - touchStartX;
      const dy = e.changedTouches[0].clientY - touchStartY;
      const dt = Date.now() - touchStartTime;

      // Only process fast, predominantly horizontal swipes
      if (dt > 400 || Math.abs(dy) > Math.abs(dx) || Math.abs(dx) < 50) return;

      const fromEdge = touchStartX < 30;
      const toEdge = e.changedTouches[0].clientX > window.innerWidth - 30;

      // Swipe right from left edge → open sidebar
      if (fromEdge && dx > 60 && !state.sidebarVisible) {
        toggleSidebar(); return;
      }
      // Swipe left → close sidebar on mobile
      if (dx < -60 && state.sidebarVisible && window.innerWidth < 768) {
        toggleSidebar(); return;
      }
      // Swipe up from bottom → open panel
      const dyAbs = Math.abs(e.changedTouches[0].clientY - touchStartY);
      if (dyAbs > 60 && e.changedTouches[0].clientY < touchStartY && touchStartY > window.innerHeight - 60) {
        if (!state.panelVisible) togglePanel();
      }
    }, { passive: true });
  });
})();

// =================== LONG PRESS CONTEXT MENU ===================
(function initLongPress() {
  document.addEventListener('DOMContentLoaded', () => {
    let longPressTimer = null;
    let longPressTarget = null;

    document.addEventListener('touchstart', e => {
      const el = e.target.closest('[data-path]') || e.target.closest('.tab-item');
      if (!el) return;
      longPressTarget = el;
      longPressTimer = setTimeout(() => {
        const path = el.dataset.path || el.dataset.tabPath;
        if (path) {
          e.preventDefault();
          _showTouchContextMenu(path, e.touches[0].clientX, e.touches[0].clientY);
        }
      }, 500);
    }, { passive: true });

    document.addEventListener('touchend', () => {
      clearTimeout(longPressTimer);
      longPressTarget = null;
    }, { passive: true });

    document.addEventListener('touchmove', () => {
      clearTimeout(longPressTimer);
    }, { passive: true });
  });
})();

function _showTouchContextMenu(path, x, y) {
  // Reuse existing context menu if available
  const existing = document.getElementById('touch-ctx-menu');
  if (existing) existing.remove();

  const menu = document.createElement('div');
  menu.id = 'touch-ctx-menu';
  menu.style.cssText = `
    position:fixed;z-index:9999;
    background:var(--bg-secondary);border:1px solid var(--border);
    border-radius:8px;padding:4px 0;min-width:160px;
    box-shadow:0 8px 24px rgba(0,0,0,0.4);
    left:${Math.min(x, window.innerWidth - 180)}px;
    top:${Math.min(y, window.innerHeight - 200)}px;
    font-size:14px;
  `;
  const items = [
    { label: '📂 Open', action: () => openFile(path) },
    { label: '✏️ Rename', action: () => renameFile(path) },
    { label: '📋 Copy Name', action: () => { navigator.clipboard?.writeText(path.split('/').pop()); notify('Copied'); } },
    { label: '🗑️ Delete', action: () => deleteFile(path) },
  ];
  items.forEach(item => {
    const d = document.createElement('div');
    d.style.cssText = 'padding:12px 16px;cursor:pointer;color:var(--text-primary);';
    d.textContent = item.label;
    d.addEventListener('touchstart', () => d.style.background = 'var(--bg-hover)', { passive: true });
    d.addEventListener('touchend', () => { d.style.background = ''; item.action(); menu.remove(); }, { passive: true });
    d.addEventListener('click', () => { item.action(); menu.remove(); });
    menu.appendChild(d);
  });

  document.body.appendChild(menu);
  setTimeout(() => document.addEventListener('click', () => menu.remove(), { once: true }), 100);
}

// =================== PINCH ZOOM FOR EDITOR ===================
(function initEditorPinchZoom() {
  document.addEventListener('DOMContentLoaded', () => {
    let lastDist = 0;
    document.addEventListener('touchstart', e => {
      if (e.touches.length === 2 && e.target.classList.contains('code-area')) {
        lastDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      }
    }, { passive: true });

    document.addEventListener('touchmove', e => {
      if (e.touches.length === 2 && e.target.classList.contains('code-area')) {
        e.preventDefault();
        const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        const delta = dist - lastDist;
        if (Math.abs(delta) > 3) {
          const newSize = Math.min(32, Math.max(10, state.settings.fontSize + (delta > 0 ? 1 : -1)));
          if (newSize !== state.settings.fontSize) {
            state.settings.fontSize = newSize;
            applySettingsToEditor();
          }
        }
        lastDist = dist;
      }
    }, { passive: false });
  });
})();

// =================== ZEN MODE ===================
function toggleZenMode() {
  state.zenMode = !state.zenMode;
  document.body.classList.toggle('zen-mode', state.zenMode);
  if (!state.zenMode) {
    if (state.panelVisible) document.getElementById('panel')?.classList.remove('hidden');
  }
}

// =================== QUICK OPEN ===================
function showQuickOpen() {
  const panel = document.getElementById('quick-open');
  const input = document.getElementById('quick-input');
  if (!panel || !input) return;
  panel.classList.add('visible');
  input.value = '';
  input.focus();
  quickSearch('');
  state.quickSelectedIdx = 0;
}

function hideQuickOpen() { document.getElementById('quick-open')?.classList.remove('visible'); }

function quickSearch(q) {
  const container = document.getElementById('quick-results');
  if (!container) return;
  const allPaths = Object.keys(state.files);
  const filtered = q
    ? allPaths.filter(p => _fuzzyMatch(p.toLowerCase(), q.toLowerCase())).slice(0, 20)
    : allPaths.slice(0, 20);
  state.quickSelectedIdx = 0;
  const frag = document.createDocumentFragment();
  filtered.forEach((p, i) => {
    const file = state.files[p];
    const d = document.createElement('div');
    d.className = 'quick-result' + (i === 0 ? ' selected' : '');
    d.dataset.idx = i;
    d.innerHTML = `<span>${getFileIcon(file.name)}</span><span class="quick-result-label">${escapeHtml(file.name)}</span><span class="quick-result-path">${escapeHtml(p)}</span>`;
    d.addEventListener('click', () => { openFile(p); hideQuickOpen(); });
    frag.appendChild(d);
  });
  container.innerHTML = '';
  if (!filtered.length) {
    container.innerHTML = '<div style="padding:8px 16px;color:var(--text-muted);font-size:12px">No files found</div>';
  } else {
    container.appendChild(frag);
  }
}

function quickKeyNav(e) {
  const items = document.querySelectorAll('#quick-results .quick-result');
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    state.quickSelectedIdx = Math.min(state.quickSelectedIdx + 1, items.length - 1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    state.quickSelectedIdx = Math.max(state.quickSelectedIdx - 1, 0);
  } else if (e.key === 'Enter') {
    const selected = document.querySelector('#quick-results .quick-result.selected');
    if (selected) selected.click();
    hideQuickOpen(); return;
  } else if (e.key === 'Escape') {
    hideQuickOpen(); return;
  }
  items.forEach((el, i) => el.classList.toggle('selected', i === state.quickSelectedIdx));
  items[state.quickSelectedIdx]?.scrollIntoView({ block: 'nearest' });
}

document.addEventListener('click', e => {
  if (!e.target.closest('#quick-open')) hideQuickOpen();
});

// =================== FUZZY SEARCH ===================
function _fuzzyMatch(str, pattern) {
  let si = 0, pi = 0;
  while (si < str.length && pi < pattern.length) {
    if (str[si] === pattern[pi]) pi++;
    si++;
  }
  return pi === pattern.length;
}

function _fuzzyScore(str, pattern) {
  let score = 0, lastMatch = -1;
  const lower = str.toLowerCase();
  for (let i = 0; i < pattern.length; i++) {
    const idx = lower.indexOf(pattern[i], lastMatch + 1);
    if (idx === -1) return -1;
    score += idx === lastMatch + 1 ? 2 : 1; // consecutive bonus
    lastMatch = idx;
  }
  return score;
}

// =================== COMMAND PALETTE ===================
const COMMANDS = [
  { label: 'New File', icon: 'far fa-file', key: 'Ctrl+N', action: () => createNewFile() },
  { label: 'New Folder', icon: 'far fa-folder', action: () => createNewFolder() },
  { label: 'Upload Files', icon: 'fas fa-upload', key: 'Ctrl+U', action: () => document.getElementById('hidden-file-input').click() },
  { label: 'Save File', icon: 'fas fa-save', key: 'Ctrl+S', action: () => saveCurrentFile() },
  { label: 'Save All', icon: 'fas fa-save', key: 'Ctrl+Shift+S', action: () => saveAllFiles() },
  { label: 'Download as ZIP', icon: 'fas fa-file-archive', action: () => downloadAllAsZip() },
  { label: 'Download Current File', icon: 'fas fa-download', action: () => downloadCurrentFile() },
  { label: 'Toggle Sidebar', icon: 'fas fa-columns', key: 'Ctrl+B', action: () => toggleSidebar() },
  { label: 'Toggle Terminal', icon: 'fas fa-terminal', key: 'Ctrl+`', action: () => togglePanel() },
  { label: 'Toggle Live Preview', icon: 'fas fa-eye', key: 'Ctrl+Shift+L', action: () => toggleLivePreview() },
  { label: 'Toggle Zen Mode', icon: 'fas fa-expand', key: 'F11', action: () => toggleZenMode() },
  { label: 'Split Editor', icon: 'fas fa-columns', key: 'Ctrl+\\', action: () => toggleSplitEditor() },
  { label: 'Close Split Editor', icon: 'fas fa-times', action: () => closeSplitEditor() },
  { label: 'Toggle Minimap', icon: 'fas fa-map', action: () => toggleMinimap() },
  { label: 'Toggle Markdown Preview', icon: 'fab fa-markdown', key: 'Ctrl+Shift+M', action: () => toggleMarkdownPreview() },
  { label: 'Open Diff Viewer', icon: 'fas fa-code-branch', action: () => openDiffViewer() },
  { label: 'Find in File', icon: 'fas fa-search', key: 'Ctrl+F', action: () => toggleFind() },
  { label: 'Find & Replace', icon: 'fas fa-exchange-alt', key: 'Ctrl+H', action: () => toggleFind(true) },
  { label: 'Go to Line', icon: 'fas fa-level-down-alt', key: 'Ctrl+G', action: () => goToLine() },
  { label: 'Toggle Comment', icon: 'fas fa-comment', key: 'Ctrl+/', action: () => commentToggle() },
  { label: 'Format Document', icon: 'fas fa-align-left', action: () => formatCurrentFile() },
  { label: 'Run Code', icon: 'fas fa-play', key: 'F5', action: () => runCode() },
  { label: 'Open Settings', icon: 'fas fa-cog', key: 'Ctrl+,', action: () => openSettings() },
  { label: 'Create Sample Project', icon: 'fas fa-rocket', action: () => createSampleProject() },
  { label: 'Clear All Files', icon: 'fas fa-trash', action: () => clearAll() },
  { label: 'Theme: Dark', icon: 'fas fa-palette', action: () => applyTheme('dark') },
  { label: 'Theme: Monokai', icon: 'fas fa-palette', action: () => applyTheme('monokai') },
  { label: 'Theme: Dracula', icon: 'fas fa-palette', action: () => applyTheme('dracula') },
  { label: 'Theme: Solarized', icon: 'fas fa-palette', action: () => applyTheme('solarized') },
  { label: 'Theme: Light', icon: 'fas fa-palette', action: () => applyTheme('light') },
  { label: 'Theme: GitHub', icon: 'fas fa-palette', action: () => applyTheme('github') },
  { label: 'Fullscreen Preview', icon: 'fas fa-desktop', action: () => openFullscreenPreview() },
  { label: 'Quick Open File', icon: 'fas fa-search', key: 'Ctrl+P', action: () => showQuickOpen() },
  { label: 'Show Welcome', icon: 'fas fa-home', action: () => showWelcome() },
  { label: 'Increase Font Size', icon: 'fas fa-plus', action: () => { applySetting('fontSize', state.settings.fontSize + 1); notify('Font: ' + (state.settings.fontSize) + 'px'); } },
  { label: 'Decrease Font Size', icon: 'fas fa-minus', action: () => { applySetting('fontSize', Math.max(10, state.settings.fontSize - 1)); notify('Font: ' + (state.settings.fontSize) + 'px'); } },
  { label: 'Toggle Word Wrap', icon: 'fas fa-align-justify', action: () => { toggleSetting('wordWrap', 'toggle-wordwrap'); notify('Word Wrap: ' + (state.settings.wordWrap ? 'on' : 'off')); } },
];

let _cmdFiltered = [...COMMANDS];
let _cmdIdx = 0;

function showCommandPalette() {
  const panel = document.getElementById('cmd-palette');
  const input = document.getElementById('cmd-input');
  if (!panel || !input) return;
  panel.classList.add('visible');
  input.value = '';
  input.focus();
  cmdSearch('');
}

function hideCmdPalette() { document.getElementById('cmd-palette')?.classList.remove('visible'); }

function cmdSearch(q) {
  if (!q) {
    _cmdFiltered = [...COMMANDS];
  } else {
    const ql = q.toLowerCase();
    _cmdFiltered = COMMANDS
      .map(c => ({ c, score: _fuzzyScore(c.label.toLowerCase(), ql) }))
      .filter(({ score }) => score >= 0)
      .sort((a, b) => b.score - a.score)
      .map(({ c }) => c);
  }
  _cmdIdx = 0;
  renderCmdResults();
}

function renderCmdResults() {
  const container = document.getElementById('cmd-results');
  if (!container) return;
  const frag = document.createDocumentFragment();
  _cmdFiltered.slice(0, 30).forEach((c, i) => {
    const d = document.createElement('div');
    d.className = 'cmd-item' + (i === _cmdIdx ? ' selected' : '');
    d.innerHTML = `<span class="cmd-item-icon"><i class="${c.icon}"></i></span><span class="cmd-item-label">${escapeHtml(c.label)}</span>${c.key ? `<span class="cmd-item-key">${c.key}</span>` : ''}`;
    d.addEventListener('click', () => executeCmdItem(i));
    frag.appendChild(d);
  });
  container.innerHTML = '';
  if (!_cmdFiltered.length) {
    container.innerHTML = '<div style="padding:8px 16px;color:var(--text-muted);font-size:12px">No commands found</div>';
  } else {
    container.appendChild(frag);
  }
}

function executeCmdItem(idx) {
  const cmd = _cmdFiltered[idx];
  hideCmdPalette();
  if (cmd?.action) cmd.action();
}

function cmdKeyNav(e) {
  if (e.key === 'ArrowDown') { e.preventDefault(); _cmdIdx = Math.min(_cmdIdx + 1, _cmdFiltered.length - 1); renderCmdResults(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); _cmdIdx = Math.max(_cmdIdx - 1, 0); renderCmdResults(); }
  else if (e.key === 'Enter') { executeCmdItem(_cmdIdx); }
  else if (e.key === 'Escape') { hideCmdPalette(); }
  document.querySelectorAll('#cmd-results .cmd-item')[_cmdIdx]?.scrollIntoView({ block: 'nearest' });
}

document.addEventListener('click', e => {
  if (!e.target.closest('#cmd-palette')) hideCmdPalette();
});

// =================== GLOBAL KEYBOARD SHORTCUTS ===================
document.addEventListener('keydown', e => {
  const inInput = e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT';

  if (e.ctrlKey && e.key === 'p' && !e.shiftKey) { e.preventDefault(); showQuickOpen(); return; }
  if (e.ctrlKey && e.shiftKey && e.key === 'P') { e.preventDefault(); showCommandPalette(); return; }
  if (e.ctrlKey && e.key === 'n' && !inInput) { e.preventDefault(); createNewFile(); return; }
  if (e.ctrlKey && e.key === 'b') { e.preventDefault(); toggleSidebar(); return; }
  if (e.ctrlKey && e.key === '`') { e.preventDefault(); togglePanel(); return; }
  if (e.ctrlKey && e.shiftKey && e.key === 'L') { e.preventDefault(); toggleLivePreview(); return; }
  if (e.ctrlKey && e.key === '\\') { e.preventDefault(); toggleSplitEditor(); return; }
  if (e.key === 'F11') { e.preventDefault(); toggleZenMode(); return; }
  if (e.ctrlKey && e.shiftKey && e.key === 'S') { e.preventDefault(); saveAllFiles(); return; }
  if (e.ctrlKey && e.key === 'u' && !inInput) { e.preventDefault(); document.getElementById('hidden-file-input').click(); return; }
  if (e.ctrlKey && e.key === ',') { e.preventDefault(); openSettings(); return; }
  if (e.key === 'Escape') {
    hideCmdPalette(); hideQuickOpen(); closeModal(); closeFindBar(); hideAutocomplete();
    const fp = document.getElementById('fullscreen-preview');
    if (fp && fp.classList.contains('visible')) closeFullscreenPreview();
    const tcm = document.getElementById('touch-ctx-menu');
    if (tcm) tcm.remove();
  }
});

// Close menu dropdowns on click elsewhere
document.addEventListener('click', e => {
  if (!e.target.closest('.menu-item')) {
    document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'));
  }
});

document.querySelectorAll('.menu-item').forEach(item => {
  item.addEventListener('click', e => {
    e.stopPropagation();
    const wasActive = item.classList.contains('active');
    document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'));
    if (!wasActive) item.classList.add('active');
  });
});
// ─── HAMBURGER MENU ───────────────────────────────────────────────────────────
function toggleHamburgerMenu() {
  const menu = document.getElementById('hamburger-menu');
  if (!menu) return;
  const isOpen = menu.style.display !== 'none';
  menu.style.display = isOpen ? 'none' : 'block';
  if (!isOpen) {
    // Close on outside click
    setTimeout(() => {
      document.addEventListener('click', function _close(e) {
        if (!e.target.closest('#hamburger-menu') && !e.target.closest('#hamburger-btn')) {
          menu.style.display = 'none';
          document.removeEventListener('click', _close);
        }
      });
    }, 0);
  }
}
function closeHamburgerMenu() {
  const menu = document.getElementById('hamburger-menu');
  if (menu) menu.style.display = 'none';
}

// ─── PREVIEW TAB: auto-close when source file closes ─────────────────────────
function _checkPreviewAutoClose(closedPath) {
  // If the preview was showing this file and no other HTML file is available, close preview
  if (state.previewVisible && _previewCurrentPath === closedPath) {
    const alt = Object.keys(state.files).find(p =>
      p !== closedPath && /\.(html|htm|md)$/i.test(p)
    );
    if (alt) schedulePreviewUpdate(alt);
    else { closeTab(PREVIEW_TAB_PATH); state.previewVisible = false; _updatePreviewStatusBtn(false); }
  }
}

// ─── TAB SWIPE GESTURES ────────────────────────────────────────────────────────
(function initTabSwipe() {
  document.addEventListener('DOMContentLoaded', () => {
    const bar = document.getElementById('tabs-bar');
    if (!bar) return;
    let startX = 0, startY = 0, startTime = 0;

    bar.addEventListener('touchstart', e => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      startTime = Date.now();
    }, { passive: true });

    bar.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;
      const dt = Date.now() - startTime;
      if (dt > 350 || Math.abs(dy) > Math.abs(dx) || Math.abs(dx) < 40) return;

      const tabs = state.openTabs;
      const curIdx = tabs.indexOf(state.activeTab);
      if (dx < 0 && curIdx < tabs.length - 1) switchTab(tabs[curIdx + 1]);
      else if (dx > 0 && curIdx > 0)           switchTab(tabs[curIdx - 1]);
    }, { passive: true });
  });
})();

// ─── SINGLE TAP = PREVIEW TAB / DOUBLE TAP = PERSIST (mobile) ────────────────
// Tab locking is handled by editor auto-focus — no extra logic needed
// The "temporary" pattern in VS Code desktop doesn't translate well to mobile
// so we treat every single tap as persistent (simpler, more reliable)
