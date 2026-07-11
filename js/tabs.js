// =================== TABS ===================
// js/tabs.js

function renderTabs() {
  const bar = document.getElementById('tabs-bar');
  if (!bar) return;
  bar.innerHTML = '';
  state.openTabs.forEach(path => {
    const file = state.files[path];
    const isSpecial = path === '__welcome__' || path === '__settings__' || path === '__diff__';
    const name = isSpecial
      ? (path === '__welcome__' ? 'Welcome' : path === '__settings__' ? 'Settings' : 'Diff Viewer')
      : (file ? file.name : path.split('/').pop());
    const icon = isSpecial
      ? (path === '__welcome__' ? '<i class="fas fa-home" style="font-size:11px"></i>' : path === '__settings__' ? '<i class="fas fa-cog" style="font-size:11px"></i>' : '<i class="fas fa-code-branch" style="font-size:11px"></i>')
      : getFileIcon(name);
    const modified = file?.modified ? '<span class="tab-modified">●</span>' : '';
    const active = state.activeTab === path ? 'active' : '';
    const preview = state.previewTab === path ? 'preview' : '';
    const tab = document.createElement('div');
    tab.className = `tab ${active} ${preview}`;
    tab.dataset.path = path;
    tab.title = path;
    tab.innerHTML = `<span class="tab-icon">${icon}</span><span class="tab-label">${escapeHtml(name)}</span>${modified}<span class="tab-close" title="Close"><i class="fas fa-times" style="font-size:11px"></i></span>`;
    tab.querySelector('.tab-label').onclick = () => switchTab(path);
    tab.querySelector('.tab-icon').onclick = () => switchTab(path);
    tab.querySelector('.tab-close').onclick = e => { e.stopPropagation(); closeTab(path); };
    tab.addEventListener('mousedown', e => { if (e.button === 1) { e.preventDefault(); closeTab(path); } });
    bar.appendChild(tab);
  });
}

function switchTab(path, pane) {
  if (!pane || pane === 'left') {
    state.activeTab = path;
    // Hide all left-pane editor wrappers
    document.querySelectorAll('#editors-container .editor-wrapper').forEach(w => w.classList.remove('active'));
    // Show the target
    const target = document.getElementById('editor-' + safeId(path));
    if (target) target.classList.add('active');
    else if (state.files[path]) {
      createEditorForFile(path, false);
      setTimeout(() => {
        document.getElementById('editor-' + safeId(path))?.classList.add('active');
      }, 0);
    }
    renderTabs();
    updateBreadcrumb(path);
    updateStatusBarForFile(path);
    renderTree();
    if (state.settings.minimap) setTimeout(renderMinimap, 0);
    // Update MD preview
    if (state.mdPreviewVisible && path?.endsWith('.md')) updateMdPreview(path);
  } else if (pane === 'right') {
    state.rightPaneActive = path;
    document.querySelectorAll('#pane-right-editors .editor-wrapper').forEach(w => w.classList.remove('active'));
    const target = document.getElementById('editor-R_' + safeId(path));
    if (target) target.classList.add('active');
    renderRightPaneTabs();
  }
}

function closeTab(path) {
  const idx = state.openTabs.indexOf(path);
  if (idx === -1) return;
  state.openTabs.splice(idx, 1);
  // Remove editor DOM
  document.getElementById('editor-' + safeId(path))?.remove();
  // Switch to adjacent tab
  if (state.activeTab === path) {
    const next = state.openTabs[Math.min(idx, state.openTabs.length - 1)];
    if (next) switchTab(next);
    else { state.activeTab = null; showWelcome(); }
  }
  renderTabs();
  saveToStorage();
}

function updateBreadcrumb(path) {
  const bc = document.getElementById('breadcrumb');
  if (!bc) return;
  if (!path || path.startsWith('__')) { bc.innerHTML = '<span style="color:var(--text-muted)">No file open</span>'; return; }
  const parts = path.split('/');
  bc.innerHTML = parts.map((p, i) => {
    const subPath = parts.slice(0, i + 1).join('/');
    const isLast = i === parts.length - 1;
    return `${i > 0 ? '<span class="breadcrumb-sep"> › </span>' : ''}<span class="breadcrumb-item" onclick="openFile('${subPath}')">${escapeHtml(p)}</span>`;
  }).join('');
}

function updateStatusBarForFile(path) {
  if (!path || path.startsWith('__')) {
    document.getElementById('sb-lang').textContent = 'Plain Text';
    return;
  }
  const file = state.files[path];
  if (!file) return;
  const lang = getLangFromFile(file.name);
  document.getElementById('sb-lang').textContent = lang;
  // Show/hide MD preview btn
  const mdBtn = document.getElementById('sb-md-btn');
  if (mdBtn) mdBtn.style.display = file.name.endsWith('.md') ? '' : 'none';
}

function getLangFromFile(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  const langs = { html:'HTML', htm:'HTML', css:'CSS', js:'JavaScript', ts:'TypeScript', json:'JSON', md:'Markdown', py:'Python', txt:'Plain Text', xml:'XML', php:'PHP', sh:'Shell', sql:'SQL' };
  return langs[ext] || 'Plain Text';
}

// =================== SPLIT EDITOR ===================
function toggleSplitEditor() {
  if (state.splitEditor) {
    closeSplitEditor();
  } else {
    openSplitEditor();
  }
}

function openSplitEditor() {
  state.splitEditor = true;
  const right = document.getElementById('pane-right');
  right.classList.add('visible');
  // Open current file in right pane if nothing there
  if (!state.rightPaneActive && state.activeTab && state.files[state.activeTab]) {
    openInRightPane(state.activeTab);
  }
  notify('Split editor opened');
}

function closeSplitEditor() {
  state.splitEditor = false;
  const right = document.getElementById('pane-right');
  right.classList.remove('visible');
  // Clean up right pane editors
  document.getElementById('pane-right-editors').innerHTML = '';
  document.getElementById('pane-right-tabs').innerHTML = '';
  state.rightPaneTabs = [];
  state.rightPaneActive = null;
  notify('Split editor closed');
}

function openInRightPane(path) {
  if (!state.files[path]) return;
  if (!state.rightPaneTabs.includes(path)) {
    state.rightPaneTabs.push(path);
    createEditorForFile(path, false, 'right');
  }
  switchTab(path, 'right');
  if (!state.splitEditor) openSplitEditor();
}

function renderRightPaneTabs() {
  const bar = document.getElementById('pane-right-tabs');
  if (!bar) return;
  bar.innerHTML = '';
  state.rightPaneTabs.forEach(path => {
    const file = state.files[path];
    if (!file) return;
    const active = state.rightPaneActive === path ? 'active' : '';
    const tab = document.createElement('div');
    tab.className = `pane-tab ${active}`;
    tab.innerHTML = `${getFileIcon(file.name)} <span>${escapeHtml(file.name)}</span> <span style="margin-left:6px;opacity:0.6;cursor:pointer;font-size:12px" onclick="closeRightPaneTab('${path.replace(/'/g,"\\'")}')">&times;</span>`;
    tab.onclick = e => { if (!e.target.closest('span[onclick]')) switchTab(path, 'right'); };
    bar.appendChild(tab);
  });
}

function closeRightPaneTab(path) {
  const idx = state.rightPaneTabs.indexOf(path);
  if (idx === -1) return;
  state.rightPaneTabs.splice(idx, 1);
  document.getElementById('editor-R_' + safeId(path))?.remove();
  if (state.rightPaneActive === path) {
    const next = state.rightPaneTabs[state.rightPaneTabs.length - 1];
    if (next) switchTab(next, 'right');
    else { state.rightPaneActive = null; }
  }
  if (state.rightPaneTabs.length === 0) closeSplitEditor();
  else renderRightPaneTabs();
}

// Pane divider drag resize
document.addEventListener('DOMContentLoaded', () => {
  const divider = document.getElementById('pane-divider');
  if (!divider) return;
  let _drag = false;
  divider.addEventListener('mousedown', e => {
    e.preventDefault(); _drag = true; divider.classList.add('dragging');
  });
  document.addEventListener('mousemove', e => {
    if (!_drag) return;
    const container = document.getElementById('split-pane-container');
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const left = Math.min(Math.max(e.clientX - rect.left, 160), rect.width - 160);
    const right = rect.width - left - 4;
    document.getElementById('pane-left').style.flex = 'none';
    document.getElementById('pane-left').style.width = left + 'px';
    document.getElementById('pane-right').style.flex = '1';
  });
  document.addEventListener('mouseup', () => { _drag = false; divider.classList.remove('dragging'); });
});

// =================== WELCOME ===================
function showWelcome() {
  if (!state.openTabs.includes('__welcome__')) {
    state.openTabs.push('__welcome__');
    createEditorForFile('__welcome__', false);
  }
  switchTab('__welcome__');
  renderTabs();
}

function buildWelcomeHTML() {
  const recentItems = state.recentProjects?.slice(0, 3).map(p =>
    `<div class="ws-action" onclick="notify('No project at: ${p}')">
      <i class="fas fa-history"></i>
      <div><div class="ws-action-title">${escapeHtml(p.split('/').pop() || p)}</div></div>
    </div>`
  ).join('') || '<div style="color:var(--text-muted);font-size:12px;padding:4px 0">No recent projects</div>';

  return `<div class="ws-root">
    <div class="ws-left">
      <div class="ws-brand">
        <i class="fas fa-code ws-brand-icon"></i>
        <div>
          <div class="ws-brand-name">CodeForge</div>
          <div class="ws-brand-ver">v3.0 · Browser IDE</div>
        </div>
      </div>
      <div class="ws-section-label">Start</div>
      <div class="ws-action-list">
        <div class="ws-action" onclick="createNewFile()">
          <i class="far fa-file"></i>
          <div><div class="ws-action-title">New File</div><div class="ws-action-key">Ctrl+N</div></div>
        </div>
        <div class="ws-action" onclick="document.getElementById('hidden-file-input').click()">
          <i class="fas fa-upload"></i>
          <div><div class="ws-action-title">Upload Files</div><div class="ws-action-key">Ctrl+U</div></div>
        </div>
        <div class="ws-action" onclick="document.getElementById('hidden-zip-input').click()">
          <i class="fas fa-file-archive"></i>
          <div><div class="ws-action-title">Open ZIP Project</div></div>
        </div>
      </div>
      <div class="ws-section-label" style="margin-top:24px">Recent</div>
      <div class="ws-action-list">${recentItems}</div>
    </div>
    <div class="ws-right">
      <div class="ws-hero">
        <div class="ws-hero-title">CodeForge</div>
        <div class="ws-hero-sub">A fast, browser-based code editor</div>
      </div>
      <div class="ws-keys-grid">
        <div class="ws-keys-col">
          <div class="ws-keys-heading">Editor</div>
          <div class="ws-key-row"><kbd>Ctrl+N</kbd><span>New file</span></div>
          <div class="ws-key-row"><kbd>Ctrl+S</kbd><span>Save</span></div>
          <div class="ws-key-row"><kbd>Ctrl+P</kbd><span>Quick open</span></div>
          <div class="ws-key-row"><kbd>Ctrl+Shift+P</kbd><span>Commands</span></div>
          <div class="ws-key-row"><kbd>Ctrl+F</kbd><span>Find</span></div>
          <div class="ws-key-row"><kbd>Ctrl+H</kbd><span>Find &amp; Replace</span></div>
          <div class="ws-key-row"><kbd>Ctrl+/</kbd><span>Toggle comment</span></div>
          <div class="ws-key-row"><kbd>Tab</kbd><span>Emmet / indent</span></div>
        </div>
        <div class="ws-keys-col">
          <div class="ws-keys-heading">View</div>
          <div class="ws-key-row"><kbd>Ctrl+B</kbd><span>Sidebar</span></div>
          <div class="ws-key-row"><kbd>Ctrl+\\</kbd><span>Split editor</span></div>
          <div class="ws-key-row"><kbd>Ctrl+\`</kbd><span>Terminal</span></div>
          <div class="ws-key-row"><kbd>Ctrl+Shift+L</kbd><span>Live preview</span></div>
          <div class="ws-key-row"><kbd>Ctrl+Shift+M</kbd><span>Markdown</span></div>
          <div class="ws-key-row"><kbd>F5</kbd><span>Run code</span></div>
          <div class="ws-key-row"><kbd>F11</kbd><span>Zen mode</span></div>
          <div class="ws-key-row"><kbd>Ctrl+Z / Y</kbd><span>Undo / Redo</span></div>
        </div>
      </div>
    </div>
  </div>`;
}

// =================== SETTINGS ===================
function openSettings() {
  if (!state.openTabs.includes('__settings__')) {
    state.openTabs.push('__settings__');
    createEditorForFile('__settings__', false);
  }
  switchTab('__settings__'); renderTabs();
}

function openDiffViewer() {
  if (!state.openTabs.includes('__diff__')) {
    state.openTabs.push('__diff__');
    createEditorForFile('__diff__', false);
  }
  switchTab('__diff__'); renderTabs();
}

function openKeybindings() { openSettings(); }

function buildSettingsHTML() {
  const s = state.settings;
  const themes = ['dark','monokai','solarized','light','github','dracula'];
  const themeSwatches = themes.map(t => {
    const bgs = { dark:'#1e1e1e', monokai:'#272822', solarized:'#002b36', light:'#ffffff', github:'#f6f8fa', dracula:'#282a36' };
    const active = s.theme === t ? 'active' : '';
    return `<div class="theme-swatch ${active}" style="background:${bgs[t]}" onclick="applyTheme('${t}');document.querySelectorAll('.theme-swatch').forEach(x=>x.classList.remove('active'));this.classList.add('active')"><div class="theme-swatch-name">${t}</div></div>`;
  }).join('');

  return `<div class="settings-root">
    <div class="settings-nav">
      <div class="settings-nav-item active" onclick="document.querySelectorAll('.settings-nav-item').forEach(x=>x.classList.remove('active'));this.classList.add('active');document.querySelectorAll('.settings-section').forEach(x=>x.style.display='none');document.getElementById('ss-editor').style.display=''">Editor</div>
      <div class="settings-nav-item" onclick="document.querySelectorAll('.settings-nav-item').forEach(x=>x.classList.remove('active'));this.classList.add('active');document.querySelectorAll('.settings-section').forEach(x=>x.style.display='none');document.getElementById('ss-theme').style.display=''">Theme</div>
      <div class="settings-nav-item" onclick="document.querySelectorAll('.settings-nav-item').forEach(x=>x.classList.remove('active'));this.classList.add('active');document.querySelectorAll('.settings-section').forEach(x=>x.style.display='none');document.getElementById('ss-keys').style.display=''">Keybindings</div>
      <div class="settings-nav-item" onclick="document.querySelectorAll('.settings-nav-item').forEach(x=>x.classList.remove('active'));this.classList.add('active');document.querySelectorAll('.settings-section').forEach(x=>x.style.display='none');document.getElementById('ss-data').style.display=''">Data</div>
    </div>
    <div class="settings-content">
      <div class="settings-section" id="ss-editor">
        <div class="settings-section-title">Editor Settings</div>
        <div class="setting-row"><div><div class="setting-label">Font Size</div><div class="setting-desc">Editor font size in px</div></div><div class="setting-control"><input class="setting-input" type="number" value="${s.fontSize}" min="8" max="32" onchange="applySetting('fontSize',this.value);applySettingsToEditor()"></div></div>
        <div class="setting-row"><div><div class="setting-label">Tab Size</div></div><div class="setting-control"><input class="setting-input" type="number" value="${s.tabSize}" min="1" max="8" onchange="applySetting('tabSize',parseInt(this.value));applySettingsToEditor()"></div></div>
        <div class="setting-row"><div><div class="setting-label">Word Wrap</div></div><div class="setting-control"><div class="toggle-switch ${s.wordWrap?'on':''}" id="set-wordwrap" onclick="toggleSetting('wordWrap','set-wordwrap')"></div></div></div>
        <div class="setting-row"><div><div class="setting-label">Line Numbers</div></div><div class="setting-control"><div class="toggle-switch ${s.lineNumbers?'on':''}" id="set-ln" onclick="toggleSetting('lineNumbers','set-ln')"></div></div></div>
        <div class="setting-row"><div><div class="setting-label">Auto Save</div></div><div class="setting-control"><div class="toggle-switch ${s.autoSave?'on':''}" id="set-autosave" onclick="toggleSetting('autoSave','set-autosave')"></div></div></div>
        <div class="setting-row"><div><div class="setting-label">Syntax Highlighting</div></div><div class="setting-control"><div class="toggle-switch ${s.syntaxHighlight?'on':''}" id="set-hl" onclick="toggleSetting('syntaxHighlight','set-hl')"></div></div></div>
        <div class="setting-row"><div><div class="setting-label">Autocomplete</div></div><div class="setting-control"><div class="toggle-switch ${s.autocomplete?'on':''}" id="set-ac" onclick="toggleSetting('autocomplete','set-ac')"></div></div></div>
        <div class="setting-row"><div><div class="setting-label">Emmet Expansion</div></div><div class="setting-control"><div class="toggle-switch ${s.emmet?'on':''}" id="set-emmet" onclick="toggleSetting('emmet','set-emmet')"></div></div></div>
        <div class="setting-row"><div><div class="setting-label">Auto Refresh Delay (ms)</div></div><div class="setting-control"><input class="setting-input" type="number" value="${s.autoRefreshDelay}" min="100" max="5000" onchange="applySetting('autoRefreshDelay',parseInt(this.value))"></div></div>
      </div>
      <div class="settings-section" id="ss-theme" style="display:none">
        <div class="settings-section-title">Color Theme</div>
        <div class="setting-desc" style="margin-bottom:12px">Select your preferred color theme</div>
        <div class="theme-swatches">${themeSwatches}</div>
      </div>
      <div class="settings-section" id="ss-keys" style="display:none">
        <div class="settings-section-title">Keybindings</div>
        ${Object.entries(state.keybindings).map(([k,v]) => `<div class="kb-row"><div class="kb-action">${k}</div><kbd class="kb-key" contenteditable="true" spellcheck="false">${v}</kbd></div>`).join('')}
      </div>
      <div class="settings-section" id="ss-data" style="display:none">
        <div class="settings-section-title">Data Management</div>
        <div class="setting-row"><div><div class="setting-label">Export all files as ZIP</div></div><div class="setting-control"><button class="modal-btn primary" onclick="downloadAllAsZip()">Export ZIP</button></div></div>
        <div class="setting-row"><div><div class="setting-label">Clear all files</div><div class="setting-desc" style="color:var(--red)">Permanently deletes everything</div></div><div class="setting-control"><button class="modal-btn" style="border-color:var(--red);color:var(--red)" onclick="clearAll()">Clear All</button></div></div>
        <div class="setting-row"><div><div class="setting-label">Storage engine</div></div><div class="setting-control"><span style="color:var(--green);font-size:12px">${state.db ? 'IndexedDB (persistent)' : 'localStorage (limited)'}</span></div></div>
      </div>
    </div>
  </div>`;
}
