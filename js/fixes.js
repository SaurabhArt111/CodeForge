// =================== CODEFORGE FIXES v4.1 ===================
// fixes.js — Loaded LAST. Overrides broken functions, adds missing ones.
// Fixes: iframe singleton, fullscreen state, terminal panel, sidebar resize,
//        drag-drop, renderSnippetsList, lintFile, createSampleProject,
//        updateProblemsPanel, doSearch, replaceAllInSearch, mobile UX.
//
// v4.1 — Root fix for duplicate console output:
//   • preview.js registered _previewMessageHandler on window 'message'
//   • fixes.js was ADDING a 2nd listener without removing the first
//     (the old window.removeEventListener IIFE was malformed — never called removeEventListener)
//   • Now: explicitly removes _previewMessageHandler, registers ONE _cfMessageHandler
//   • Result: exactly one message listener, no duplicate log output ever

// ─── 1. SINGLE IFRAME ARCHITECTURE ──────────────────────────────────────────
// We maintain ONE iframe element globally. It is physically moved between
// split-preview and fullscreen-preview containers — never recreated.

const CF = {
  // The singleton preview iframe
  iframe: null,
  previewPath: null,
  previewScrollY: 0,
  previewHistory: [],
  previewHistoryIdx: -1,

  getOrCreateIframe() {
    if (!this.iframe) {
      const fr = document.createElement('iframe');
      fr.id = 'cf-preview-frame';
      fr.name = 'cf-preview-frame';
      fr.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-modals');
      fr.setAttribute('allowfullscreen', '');
      fr.style.cssText = 'border:none;flex:1;width:100%;display:block;';
      this.iframe = fr;
    }
    return this.iframe;
  },

  // Move iframe to a container without reloading
  mountIframe(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const fr = this.getOrCreateIframe();
    // Detach from current parent, attach to new without resetting srcdoc
    if (fr.parentNode !== container) {
      container.appendChild(fr);
    }
  },

  writeContent(path) {
    if (!path || !state.files[path]) return;
    this.previewPath = path;
    const fr = this.getOrCreateIframe();

    // Save scroll before replacing
    try {
      this.previewScrollY = fr.contentWindow?.scrollY || 0;
    } catch(e) {}

    const file = state.files[path];
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    let html;
    if (['html','htm'].includes(ext)) {
      html = buildPreviewHTML(path);
    } else if (ext === 'md') {
      const rendered = typeof marked !== 'undefined'
        ? marked.parse(file.content || '')
        : '<pre>' + escapeHtml(file.content || '') + '</pre>';
      html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:800px;margin:32px auto;padding:0 20px;color:#ccc;line-height:1.7;background:#1e1e1e}h1,h2,h3{color:#e0e0e0}code{background:#2d2d2d;border-radius:3px;padding:2px 5px;color:#ce9178}pre{background:#2d2d2d;padding:16px;border-radius:6px}a{color:#4ec9b0}</style></head><body>${rendered}</body></html>`;
    } else {
      html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:monospace;font-size:13px;padding:20px;background:#1e1e1e;color:#ccc;white-space:pre-wrap}</style></head><body>${escapeHtml(file.content || '')}</body></html>`;
    }

    fr.srcdoc = html;

    // Track history
    if (this.previewHistoryIdx < this.previewHistory.length - 1) {
      this.previewHistory = this.previewHistory.slice(0, this.previewHistoryIdx + 1);
    }
    if (this.previewHistory[this.previewHistoryIdx] !== path) {
      this.previewHistory.push(path);
      this.previewHistoryIdx = this.previewHistory.length - 1;
    }

    // Update URL bar(s)
    document.querySelectorAll('.cf-url-bar').forEach(el => el.value = path);
  },

  navBack() {
    if (this.previewHistoryIdx > 0) {
      this.previewHistoryIdx--;
      const path = this.previewHistory[this.previewHistoryIdx];
      if (path && state.files[path]) this.writeContent(path);
    }
  },

  navForward() {
    if (this.previewHistoryIdx < this.previewHistory.length - 1) {
      this.previewHistoryIdx++;
      const path = this.previewHistory[this.previewHistoryIdx];
      if (path && state.files[path]) this.writeContent(path);
    }
  }
};

// ─── 2. REPLACE PREVIEW FUNCTIONS ────────────────────────────────────────────

// Override openPreviewTab to use singleton iframe
window.openPreviewTab = function(entryPath) {
  const path = entryPath || _findBestPreviewFile();
  if (!path) { notify('No HTML file to preview'); return; }

  if (!state.openTabs.includes(PREVIEW_TAB_PATH)) {
    state.openTabs.push(PREVIEW_TAB_PATH);
  }

  let wrapper = document.getElementById('editor-' + safeId(PREVIEW_TAB_PATH));
  if (!wrapper) {
    wrapper = document.createElement('div');
    wrapper.className = 'editor-wrapper preview-tab-wrapper';
    wrapper.id = 'editor-' + safeId(PREVIEW_TAB_PATH);
    wrapper.dataset.path = PREVIEW_TAB_PATH;
    wrapper.innerHTML = _buildPreviewTabHTML(path);
    document.getElementById('editors-container').appendChild(wrapper);
  }

  // Mount the singleton iframe into the preview shell
  requestAnimationFrame(() => {
    const shell = document.getElementById('preview-iframe-shell');
    if (shell) {
      CF.mountIframe('preview-iframe-shell');
    }
    CF.writeContent(path);
  });

  switchTab(PREVIEW_TAB_PATH);
  state.previewVisible = true;
  _updatePreviewStatusBtn(true);
};

// Override fullscreen to MOVE iframe, not recreate it
window.openFullscreenPreview = function(url) {
  const overlay = document.getElementById('fullscreen-preview');
  if (!overlay) return;
  overlay.classList.add('visible');

  // Move iframe to fullscreen container
  const fpFrameSlot = document.getElementById('fp-frame-slot');
  if (fpFrameSlot) {
    CF.mountIframe('fp-frame-slot');
    // Don't re-write content — the iframe keeps its state!
    // Only write if no content yet or explicit URL
    if (url) {
      const path = url;
      if (state.files[path]) CF.writeContent(path);
    } else if (!CF.previewPath) {
      const path = state.activeTab && state.files[state.activeTab]
        ? state.activeTab : _findBestPreviewFile();
      if (path) CF.writeContent(path);
    }
    document.querySelectorAll('.cf-url-bar').forEach(el => {
      el.value = CF.previewPath || '';
    });
  }
};

window.closeFullscreenPreview = function() {
  const overlay = document.getElementById('fullscreen-preview');
  overlay?.classList.remove('visible');
  // Move iframe BACK to preview tab shell if preview is open
  if (state.previewVisible && state.openTabs.includes(PREVIEW_TAB_PATH)) {
    requestAnimationFrame(() => {
      const shell = document.getElementById('preview-iframe-shell');
      if (shell) CF.mountIframe('preview-iframe-shell');
    });
  }
};

window.refreshPreview = function() {
  if (CF.previewPath) CF.writeContent(CF.previewPath);
};

window.previewNavBack    = function() { CF.navBack(); };
window.previewNavForward = function() { CF.navForward(); };
window.fpNavBack         = function() { CF.navBack(); };
window.fpNavForward      = function() { CF.navForward(); };

window.schedulePreviewUpdate = function(path) {
  clearTimeout(window._previewDebounceTimer);
  window._previewDebounceTimer = setTimeout(() => {
    if (state.previewVisible) {
      CF.writeContent(path || CF.previewPath);
    }
  }, 400);
};

window.previewNavigate = function(e) {
  if (e && e.key !== 'Enter') return;
  const input = e ? e.target : document.querySelector('.cf-url-bar');
  const url = input?.value?.trim();
  if (!url) return;
  if (url.startsWith('http')) { window.open(url, '_blank'); return; }
  const base = CF.previewPath || '';
  const resolved = resolvePath(base, url);
  if (state.files[resolved]) { CF.writeContent(resolved); return; }
  const f = _findFile(resolved, base);
  if (f) {
    const k = Object.keys(state.files).find(p => state.files[p] === f);
    if (k) CF.writeContent(k);
  } else notify('File not found: ' + url);
};

// ─── SINGLE MESSAGE HANDLER ───────────────────────────────────────────────────
// Remove the handler registered by preview.js, then install ONE replacement
// that routes through CF. This guarantees exactly one listener at all times.
if (typeof _previewMessageHandler === 'function') {
  window.removeEventListener('message', _previewMessageHandler);
}

function _cfMessageHandler(e) {
  if (!e.data?.type) return;

  if (e.data.type === 'vfs-navigate') {
    const href = e.data.href;
    if (!href) return;
    const base = CF.previewPath || '';
    const resolved = resolvePath(base, href);
    const file = state.files[resolved] || _findFile(resolved, base);
    if (file) {
      const realPath = Object.keys(state.files).find(p => state.files[p] === file) || resolved;
      CF.writeContent(realPath);
    } else notify('VFS: file not found — ' + href);
    return;
  }

  if (e.data.type === 'vfs-console') {
    const { level, msg } = e.data;
    const out = document.getElementById('console-output');
    if (!out) return;
    const d = document.createElement('div');
    d.className = 'terminal-line';
    d.style.color = level === 'error' ? 'var(--red)' : level === 'warn' ? 'var(--yellow)' : level === 'info' ? 'var(--lightblue)' : 'var(--text-primary)';
    d.textContent = `[${level.toUpperCase()}] ${msg}`;
    out.appendChild(d);
    out.scrollTop = out.scrollHeight;
    if (level === 'error') {
      const badge = document.getElementById('console-badge');
      if (badge) { badge.style.display = ''; badge.textContent = parseInt(badge.textContent||0) + 1; }
    }
    return;
  }

  if (e.data.type === 'vfs-scroll') {
    CF.previewScrollY = e.data.y || 0;
  }
}
window.addEventListener('message', _cfMessageHandler);

// ─── 3. DOM INIT ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // fp-frame-slot and preview-iframe-shell are already divs in index.html.
  // The singleton iframe (CF.iframe) is mounted dynamically by openPreviewTab()
  // and openFullscreenPreview() — nothing to replace here.

  // Init viewport buttons
  document.querySelectorAll('.vp-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById('vp-full')?.classList.add('active');
});

// ─── 4. VIEWPORT / RESPONSIVE PREVIEW ────────────────────────────────────────
window.setViewport = function(mode) {
  const frame = CF.iframe;
  if (!frame) return;
  state.currentViewport = mode;
  document.querySelectorAll('.vp-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('vp-' + mode)?.classList.add('active');
  const sizes = { full: null, tablet: '768px', mobile: '375px' };
  const w = sizes[mode];
  const shell = document.getElementById('preview-iframe-shell');
  if (w) {
    frame.style.maxWidth = w;
    frame.style.width = w;
    frame.style.margin = '0 auto';
    if (shell) { shell.style.background = '#111'; shell.style.overflow = 'auto'; shell.style.alignItems = 'flex-start'; }
  } else {
    frame.style.maxWidth = '';
    frame.style.width = '100%';
    frame.style.margin = '';
    if (shell) { shell.style.background = ''; shell.style.overflow = ''; shell.style.alignItems = ''; }
  }
};

// ─── 5. MISSING FUNCTIONS ────────────────────────────────────────────────────

// renderSnippetsList — was missing, causing crash on init
window.renderSnippetsList = function() {
  const container = document.getElementById('snippets-list');
  if (!container) return;

  const snippets = state.snippets || {};
  const keys = Object.keys(snippets);

  // Built-in snippets
  const builtins = [
    { trigger: '!html', label: 'HTML5 Boilerplate', body: '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>Document</title>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  \n  <script src="script.js"></script>\n</body>\n</html>' },
    { trigger: 'cl', label: 'console.log()', body: "console.log('$1');" },
    { trigger: 'fn', label: 'function', body: 'function $1() {\n  $2\n}' },
    { trigger: 'arr', label: 'arrow function', body: 'const $1 = ($2) => {\n  $3\n};' },
    { trigger: 'qs', label: 'querySelector', body: "document.querySelector('$1')" },
    { trigger: 'qsa', label: 'querySelectorAll', body: "document.querySelectorAll('$1')" },
    { trigger: 'ae', label: 'addEventListener', body: "element.addEventListener('$1', function(e) {\n  $2\n});" },
    { trigger: 'flex', label: 'CSS Flexbox', body: 'display: flex;\nalign-items: center;\njustify-content: center;' },
    { trigger: 'grid', label: 'CSS Grid', body: 'display: grid;\ngrid-template-columns: repeat(3, 1fr);\ngap: 16px;' },
  ];

  let html = '<div style="padding:4px 8px 2px;font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.08em">Built-in</div>';
  builtins.forEach(s => {
    html += `<div class="snippet-item" onclick="insertSnippet(${JSON.stringify(s.body)})" title="${escapeHtml(s.body)}">
      <span class="snippet-trigger">${escapeHtml(s.trigger)}</span>
      <span class="snippet-label">${escapeHtml(s.label)}</span>
    </div>`;
  });

  if (keys.length > 0) {
    html += '<div style="padding:8px 8px 2px;font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.08em;margin-top:4px">Custom</div>';
    keys.forEach(k => {
      const s = snippets[k];
      html += `<div class="snippet-item" onclick="insertSnippet(${JSON.stringify(s.body)})">
        <span class="snippet-trigger">${escapeHtml(s.trigger || k)}</span>
        <span class="snippet-label">${escapeHtml(k)}</span>
        <span class="snippet-del" onclick="event.stopPropagation();deleteSnippet('${k.replace(/'/g,"\\'")}')" title="Delete">×</span>
      </div>`;
    });
  }

  container.innerHTML = html;
};

window.insertSnippet = function(body) {
  const ta = getActiveTextarea();
  if (!ta) { notify('Open a file first'); return; }
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const snippet = body.replace(/\$\d/g, '');
  ta.value = ta.value.substring(0, start) + snippet + ta.value.substring(end);
  ta.selectionStart = ta.selectionEnd = start + snippet.length;
  ta.focus();
  onEditorInput(ta, state.activeTab);
  notify('Snippet inserted');
};

window.addCustomSnippet = function() {
  const name = prompt('Snippet name:');
  if (!name) return;
  const trigger = prompt('Trigger word:', name.toLowerCase().replace(/\s+/g,'_')) || name;
  const body = prompt('Snippet body:');
  if (!body) return;
  if (!state.snippets) state.snippets = {};
  state.snippets[name] = { trigger, body, desc: name };
  renderSnippetsList();
  saveToStorage();
  notify('Snippet created: ' + name);
};

window.deleteSnippet = function(name) {
  if (!state.snippets) return;
  delete state.snippets[name];
  renderSnippetsList();
  saveToStorage();
  notify('Snippet deleted');
};

// lintFile — was called but never defined in accessible scope
window.lintFile = function(path) {
  if (!state.settings.linting) return;
  const file = state.files[path];
  if (!file || file.isImage) return;
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const content = file.content || '';
  const problems = [];

  if (ext === 'json') {
    try { JSON.parse(content); } catch(e) { problems.push({ type: 'error', msg: 'JSON syntax error: ' + e.message, line: 1 }); }
  } else if (ext === 'html' || ext === 'htm') {
    const lines = content.split('\n');
    lines.forEach((line, i) => {
      if (line.includes('<script src=') && !line.includes('</script>') && !line.trim().startsWith('//')) {
        // Check for unmatched tags heuristically
      }
      if (line.length > 300) {
        problems.push({ type: 'warn', msg: `Line ${i+1}: line is very long (${line.length} chars)`, line: i+1 });
      }
    });
  } else if (ext === 'js') {
    const lines = content.split('\n');
    lines.forEach((line, i) => {
      if (/\bvar\b/.test(line) && !line.trim().startsWith('//')) {
        problems.push({ type: 'info', msg: `Line ${i+1}: prefer 'const' or 'let' over 'var'`, line: i+1 });
      }
    });
  }

  if (!state.problems) state.problems = {};
  state.problems[path] = problems;
  updateProblemsPanel();
};

// updateProblemsPanel — was called but never defined
window.updateProblemsPanel = function() {
  const list = document.getElementById('problems-list');
  if (!list) return;
  const allProblems = state.problems || {};
  let errCount = 0, warnCount = 0;
  let html = '';

  Object.entries(allProblems).forEach(([path, problems]) => {
    if (!problems || !problems.length) return;
    const file = state.files[path];
    if (!file) return;
    html += `<div style="padding:4px 12px 2px;font-size:11px;color:var(--text-muted);font-weight:600">${escapeHtml(file.name)}</div>`;
    problems.forEach(p => {
      const icon = p.type === 'error' ? '✗' : p.type === 'warn' ? '⚠' : 'ℹ';
      const color = p.type === 'error' ? 'var(--red)' : p.type === 'warn' ? 'var(--yellow)' : 'var(--accent)';
      html += `<div style="padding:3px 12px 3px 24px;font-size:12px;cursor:pointer;display:flex;gap:8px;align-items:center" 
        onclick="openFile('${path}')">
        <span style="color:${color};flex-shrink:0">${icon}</span>
        <span style="color:var(--text-primary)">${escapeHtml(p.msg)}</span>
      </div>`;
      if (p.type === 'error') errCount++;
      else if (p.type === 'warn') warnCount++;
    });
  });

  if (!html) html = '<div style="padding:16px;color:var(--text-muted);font-size:12px;text-align:center">No problems detected</div>';
  list.innerHTML = html;

  document.getElementById('sb-err-count').textContent = errCount;
  document.getElementById('sb-warn-count').textContent = warnCount;
};

// doSearch — global file search
window.doSearch = function(query) {
  const container = document.getElementById('search-results');
  if (!container) return;
  if (!query || query.length < 2) { container.innerHTML = '<div style="padding:8px 12px;color:var(--text-muted);font-size:12px">Type to search across files...</div>'; return; }

  const q = query.toLowerCase();
  let html = '';
  let totalMatches = 0;

  Object.entries(state.files).forEach(([path, file]) => {
    if (file.isImage || !file.content) return;
    const lines = file.content.split('\n');
    const matches = [];
    lines.forEach((line, i) => {
      if (line.toLowerCase().includes(q)) {
        const start = line.toLowerCase().indexOf(q);
        const highlighted = escapeHtml(line.substring(0, start))
          + `<mark style="background:var(--accent);color:#000;border-radius:2px">${escapeHtml(line.substring(start, start + query.length))}</mark>`
          + escapeHtml(line.substring(start + query.length));
        matches.push({ line: i + 1, text: highlighted });
        totalMatches++;
      }
    });
    if (matches.length) {
      html += `<div style="padding:6px 8px 2px;font-size:11px;color:var(--accent);cursor:pointer;font-weight:600" onclick="openFile('${path}')">${escapeHtml(file.name)}</div>`;
      matches.slice(0, 5).forEach(m => {
        html += `<div style="padding:2px 8px 2px 20px;font-size:12px;cursor:pointer;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis" 
          onclick="openFile('${path}')" title="Line ${m.line}">
          <span style="color:var(--text-muted);margin-right:6px">${m.line}</span>${m.text}
        </div>`;
      });
      if (matches.length > 5) {
        html += `<div style="padding:2px 8px;font-size:11px;color:var(--text-muted)">...${matches.length - 5} more</div>`;
      }
    }
  });

  if (!html) html = `<div style="padding:8px 12px;color:var(--text-muted);font-size:12px">No results for "${escapeHtml(query)}"</div>`;
  else html = `<div style="padding:4px 8px 6px;font-size:11px;color:var(--text-muted)">${totalMatches} results</div>` + html;
  container.innerHTML = html;
};

// replaceAllInSearch
window.replaceAllInSearch = function() {
  const searchInput = document.getElementById('search-input-box');
  const replaceInput = document.getElementById('search-replace-box');
  if (!searchInput || !replaceInput) return;
  const q = searchInput.value;
  const r = replaceInput.value;
  if (!q) return;

  let count = 0;
  Object.keys(state.files).forEach(path => {
    const file = state.files[path];
    if (file.isImage || !file.content) return;
    const newContent = file.content.split(q).join(r);
    if (newContent !== file.content) {
      const diff = (file.content.split(q).length - 1);
      count += diff;
      file.content = newContent;
      const ta = document.getElementById('ta-' + safeId(path));
      if (ta) { ta.value = newContent; }
    }
  });

  saveToStorage();
  if (count) notify(`Replaced ${count} occurrence${count !== 1 ? 's' : ''}`);
  else notify('No matches found');
  doSearch(q);
};

// createSampleProject
window.createSampleProject = function() {
  const files = {
    'index.html': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sample Project</title>
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
  <header class="header">
    <h1>🚀 Sample Project</h1>
    <nav>
      <a href="index.html">Home</a>
      <a href="about.html">About</a>
    </nav>
  </header>
  <main class="main">
    <h2>Welcome!</h2>
    <p>Edit this project and see live preview.</p>
    <button id="btn" class="btn">Click Me</button>
    <div id="output"></div>
  </main>
  <footer class="footer"><p>Built with CodeForge Ultra</p></footer>
  <script src="js/app.js"></script>
</body>
</html>`,
    'css/style.css': `* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: system-ui, sans-serif; line-height: 1.6; color: #333; }
.header { background: #007acc; color: white; padding: 16px 24px; display: flex; justify-content: space-between; align-items: center; }
.header h1 { font-size: 1.4rem; }
.header nav a { color: white; text-decoration: none; margin-left: 16px; opacity: 0.85; }
.header nav a:hover { opacity: 1; }
.main { max-width: 800px; margin: 40px auto; padding: 0 24px; }
.main h2 { font-size: 1.8rem; margin-bottom: 12px; color: #007acc; }
.btn { background: #007acc; color: white; border: none; padding: 10px 24px; border-radius: 6px; cursor: pointer; font-size: 14px; margin-top: 16px; }
.btn:hover { background: #005fa3; }
#output { margin-top: 16px; color: #007acc; font-weight: 600; }
.footer { text-align: center; padding: 24px; color: #888; font-size: 13px; margin-top: 40px; border-top: 1px solid #eee; }`,
    'js/app.js': `document.getElementById('btn').addEventListener('click', function() {
  const output = document.getElementById('output');
  const msgs = ['Hello from CodeForge!', 'Edit me and see live changes.', 'Build something amazing!'];
  output.textContent = msgs[Math.floor(Math.random() * msgs.length)];
});`,
    'about.html': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>About</title>
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
  <header class="header">
    <h1>🚀 Sample Project</h1>
    <nav><a href="index.html">Home</a><a href="about.html">About</a></nav>
  </header>
  <main class="main">
    <h2>About</h2>
    <p>This is a sample multi-page project.</p>
  </main>
  <footer class="footer"><p>Built with CodeForge Ultra</p></footer>
</body>
</html>`
  };

  Object.entries(files).forEach(([path, content]) => {
    const name = path.split('/').pop();
    state.files[path] = { name, content, type: 'file' };
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) {
      state.folders.add(parts.slice(0, i).join('/'));
    }
  });

  renderTree();
  openFile('index.html');
  saveToStorage();
  notify('Sample project created!');
};

// ─── 6. PANEL FIXES (VS Code-like tabs: PROBLEMS | OUTPUT | TERMINAL) ────────

// Override switchPanel to handle all 3 tabs properly
window.switchPanel = function(name) {
  const map = { terminal: 'pv-terminal', console: 'pv-console', problems: 'pv-problems' };
  const tabs = ['terminal', 'console', 'problems'];

  Object.entries(map).forEach(([n, id]) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('active', n === name);
  });

  document.querySelectorAll('#panel-tabs .panel-tab').forEach((tab, i) => {
    tab.classList.toggle('active', tabs[i] === name);
  });
};

// Override togglePanel to ensure proper initialization
const _origTogglePanel = window.togglePanel;
window.togglePanel = function() {
  state.panelVisible = !state.panelVisible;
  const panel = document.getElementById('panel');
  if (!panel) return;
  panel.classList.toggle('hidden', !state.panelVisible);
  if (state.panelVisible) {
    initTerminalWelcome();
    const termInput = document.getElementById('terminal-input');
    if (termInput) termInput.focus();
  }
};

// ─── 7. SIDEBAR RESIZE — complete rewrite ────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Panel resize (fixed)
  const panelResize = document.getElementById('panel-resize');
  if (panelResize) {
    let dragging = false, startY = 0, startH = 0;
    const getPanel = () => document.getElementById('panel');

    panelResize.addEventListener('mousedown', e => {
      dragging = true;
      startY = e.clientY;
      startH = getPanel()?.clientHeight || 200;
      e.preventDefault();
      document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', e => {
      if (!dragging) return;
      const panel = getPanel();
      if (!panel) return;
      const newH = Math.min(Math.max(80, startH + (startY - e.clientY)), window.innerHeight - 200);
      panel.style.height = newH + 'px';
    });

    document.addEventListener('mouseup', () => {
      dragging = false;
      document.body.style.userSelect = '';
    });

    // Touch support
    panelResize.addEventListener('touchstart', e => {
      dragging = true;
      startY = e.touches[0].clientY;
      startH = getPanel()?.clientHeight || 200;
    }, { passive: true });

    document.addEventListener('touchmove', e => {
      if (!dragging) return;
      const panel = getPanel();
      if (!panel) return;
      const newH = Math.min(Math.max(80, startH + (startY - e.touches[0].clientY)), window.innerHeight - 200);
      panel.style.height = newH + 'px';
    }, { passive: true });

    document.addEventListener('touchend', () => { dragging = false; });
  }

  // Sidebar resize (fixed — may have been initialized before, reinit safely)
  const sidebarResize = document.getElementById('sidebar-resize');
  const sidebar = document.getElementById('sidebar');
  if (sidebarResize && sidebar) {
    // Remove all previous listeners by cloning
    const newResize = sidebarResize.cloneNode(true);
    sidebarResize.parentNode.replaceChild(newResize, sidebarResize);

    let dragging = false, startX = 0, startW = 0;

    newResize.addEventListener('mousedown', e => {
      dragging = true;
      startX = e.clientX;
      startW = sidebar.clientWidth;
      e.preventDefault();
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
    });

    document.addEventListener('mousemove', e => {
      if (!dragging) return;
      const newW = Math.min(Math.max(180, startW + (e.clientX - startX)), 550);
      sidebar.style.width = newW + 'px';
      sidebar.style.minWidth = newW + 'px';
    });

    document.addEventListener('mouseup', () => {
      dragging = false;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    });

    newResize.addEventListener('touchstart', e => {
      dragging = true;
      startX = e.touches[0].clientX;
      startW = sidebar.clientWidth;
    }, { passive: true });

    document.addEventListener('touchmove', e => {
      if (!dragging) return;
      const newW = Math.min(Math.max(150, startW + (e.touches[0].clientX - startX)), 550);
      sidebar.style.width = newW + 'px';
    }, { passive: true });

    document.addEventListener('touchend', () => { dragging = false; });
  }

  // Patch fullscreen URL bar
  document.querySelectorAll('#fp-bar input').forEach(el => {
    el.className = 'cf-url-bar';
    el.onkeydown = function(e) { if (e.key === 'Enter') previewNavigate(e); };
  });
  document.querySelectorAll('#split-preview-bar input').forEach(el => {
    el.className = 'cf-url-bar';
  });

  // Ensure panel tabs work
  const panelTabs = document.querySelectorAll('#panel-tabs .panel-tab');
  const panelNames = ['terminal', 'console', 'problems'];
  panelTabs.forEach((tab, i) => {
    tab.onclick = () => {
      switchPanel(panelNames[i]);
      if (!state.panelVisible) togglePanel();
    };
  });

  // Bottom nav on mobile
  initMobileBottomNav();
});

// ─── 8. DRAG & DROP FILE UPLOAD FIX ──────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Global drag over the entire app
  const main = document.getElementById('main');
  if (main) {
    main.addEventListener('dragover', e => {
      if (e.dataTransfer.types.includes('Files')) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }
    });

    main.addEventListener('drop', e => {
      if (!e.dataTransfer.files.length) return;
      const target = e.target;
      // Don't double-handle if it's in the upload zone or tree
      if (target.closest('#upload-zone') || target.closest('#file-tree .tree-item')) return;
      e.preventDefault();
      handleFileUpload(e.dataTransfer.files);
    });
  }
});

// ─── 9. MOBILE BOTTOM NAV ────────────────────────────────────────────────────

function initMobileBottomNav() {
  if (window.innerWidth > 768) return;

  // Create bottom nav if not exists
  if (document.getElementById('mobile-bottom-nav')) return;

  const nav = document.createElement('div');
  nav.id = 'mobile-bottom-nav';
  nav.innerHTML = `
    <button class="mbn-btn active" id="mbn-files" onclick="mbnSwitch('files')" title="Files">
      <i class="far fa-copy"></i><span>Files</span>
    </button>
    <button class="mbn-btn" id="mbn-editor" onclick="mbnSwitch('editor')" title="Editor">
      <i class="fas fa-code"></i><span>Editor</span>
    </button>
    <button class="mbn-btn" id="mbn-preview" onclick="mbnSwitch('preview')" title="Preview">
      <i class="fas fa-eye"></i><span>Preview</span>
    </button>
    <button class="mbn-btn" id="mbn-terminal" onclick="mbnSwitch('terminal')" title="Terminal">
      <i class="fas fa-terminal"></i><span>Terminal</span>
    </button>
  `;
  document.body.appendChild(nav);
}

window.mbnSwitch = function(mode) {
  document.querySelectorAll('.mbn-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('mbn-' + mode)?.classList.add('active');

  const sidebar = document.getElementById('sidebar');
  const editorArea = document.getElementById('editor-area');
  const panel = document.getElementById('panel');

  if (mode === 'files') {
    if (!state.sidebarVisible) toggleSidebar();
    if (panel) panel.classList.add('hidden');
  } else if (mode === 'editor') {
    if (state.sidebarVisible) toggleSidebar();
    if (panel) panel.classList.add('hidden');
  } else if (mode === 'preview') {
    if (state.sidebarVisible) toggleSidebar();
    if (panel) panel.classList.add('hidden');
    toggleLivePreview(true);
  } else if (mode === 'terminal') {
    if (state.sidebarVisible) toggleSidebar();
    if (!state.panelVisible) togglePanel();
    else { panel?.classList.remove('hidden'); state.panelVisible = true; }
    switchPanel('terminal');
    const inp = document.getElementById('terminal-input');
    if (inp) inp.focus();
  }
};

// ─── 10. SNIPPET STYLES ───────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const style = document.createElement('style');
  style.textContent = `
    /* Snippet list */
    .snippet-item {
      display: flex; align-items: center; gap: 8px;
      padding: 6px 12px; cursor: pointer; font-size: 12px;
      border-bottom: 1px solid var(--border);
      transition: background 0.1s;
    }
    .snippet-item:hover { background: var(--bg-hover); }
    .snippet-trigger {
      background: var(--bg-input); color: var(--accent);
      padding: 1px 6px; border-radius: 3px; font-size: 11px;
      font-family: var(--font-mono); flex-shrink: 0;
    }
    .snippet-label { flex: 1; color: var(--text-primary); }
    .snippet-del {
      color: var(--text-muted); cursor: pointer; padding: 2px 4px;
      font-size: 14px; opacity: 0.6;
    }
    .snippet-del:hover { opacity: 1; color: var(--red); }

    /* Mobile bottom nav */
    #mobile-bottom-nav {
      display: none;
    }
    @media (max-width: 768px) {
      #mobile-bottom-nav {
        display: flex;
        position: fixed; bottom: 0; left: 0; right: 0;
        height: 52px;
        background: var(--bg-secondary);
        border-top: 1px solid var(--border);
        z-index: 500;
      }
      body { padding-bottom: 52px; }
    }
    .mbn-btn {
      flex: 1; display: flex; flex-direction: column; align-items: center;
      justify-content: center; gap: 2px;
      background: none; border: none; cursor: pointer;
      color: var(--text-muted); font-size: 10px;
      transition: color 0.15s;
      padding: 0;
    }
    .mbn-btn i { font-size: 18px; }
    .mbn-btn.active { color: var(--accent); }
    .mbn-btn:active { opacity: 0.7; }

    /* fp-frame-slot */
    #fp-frame-slot {
      flex: 1; display: flex; flex-direction: column;
      overflow: hidden; min-height: 0;
    }
    #fp-frame-slot iframe {
      flex: 1; border: none; width: 100%;
    }

    /* Preview tab shell */
    #preview-iframe-shell {
      display: flex; flex-direction: column;
      flex: 1; overflow: hidden; min-height: 0;
    }
    #preview-iframe-shell iframe {
      flex: 1; border: none; width: 100%; height: 100%;
    }

    /* Prevent panel from being hidden when not desired */
    #panel:not(.hidden) { display: flex; }
  `;
  document.head.appendChild(style);

  // Ensure renderSnippetsList is called after everything loads
  setTimeout(() => {
    renderSnippetsList();
    updateProblemsPanel();
  }, 100);
});

// ─── 11. SAFE GUARDS ─────────────────────────────────────────────────────────

// Ensure functions that might be called before definition are stubbed
if (!window.createSampleProject) window.createSampleProject = function() { notify('createSampleProject not loaded yet'); };
if (!window.clearAll) window.clearAll = async function() { notify('clearAll not loaded'); };

// Catch unhandled errors
window.addEventListener('error', e => {
  console.warn('[CodeForge] Caught error:', e.message);
  // Don't alert, just log
});

window.addEventListener('unhandledrejection', e => {
  console.warn('[CodeForge] Unhandled promise:', e.reason);
});

console.log('%cCodeForge Fixes v4.0 loaded', 'color:#4ec9b0;font-size:12px');

// updateProblemsPanel v4 — rich diagnostic display
window.updateProblemsPanel = function() {
  const list = document.getElementById('problems-list');
  if (!list) return;
  const allProblems = state.problems || {};
  let errCount = 0, warnCount = 0;
  const frag = document.createDocumentFragment();

  Object.entries(allProblems).forEach(([filePath, problems]) => {
    if (!problems || !problems.length) return;
    const file = state.files[filePath];
    if (!file) return;
    const errors = problems.filter(p => p.type === 'error').length;
    const warns = problems.filter(p => p.type === 'warn').length;
    errCount += errors; warnCount += warns;
    const header = document.createElement('div');
    header.style.cssText = 'padding:6px 12px 4px;font-size:11px;color:var(--text-muted);font-weight:600;display:flex;align-items:center;gap:6px;border-top:1px solid var(--border,#3a3f4b);margin-top:2px';
    header.innerHTML = escapeHtml(file.name) + (errors ? ` <span style="color:var(--red);font-size:10px">${errors}✗</span>` : '') + (warns ? ` <span style="color:var(--yellow);font-size:10px">${warns}⚠</span>` : '');
    frag.appendChild(header);
    problems.forEach(p => {
      const div = document.createElement('div');
      div.className = 'problem-item ' + (p.type === 'error' ? 'error' : p.type === 'warn' ? 'warning' : 'info');
      const icon = p.type === 'error' ? '✗' : p.type === 'warn' ? '⚠' : 'ℹ';
      const color = p.type === 'error' ? 'var(--red)' : p.type === 'warn' ? 'var(--yellow)' : 'var(--accent)';
      const locText = p.line ? `${file.name}:${p.line}` : file.name;
      div.innerHTML = `<span class="problem-icon" style="color:${color}">${icon}</span><span class="problem-msg">${escapeHtml(p.msg)}</span><span class="problem-loc">${escapeHtml(locText)}</span>`;
      div.onclick = () => { openFile(filePath); if (p.line) setTimeout(() => { const ta = getActiveTextarea(); if (ta) { const lines = ta.value.split('\n'); const pos = lines.slice(0, p.line - 1).join('\n').length + (p.line > 1 ? 1 : 0); ta.setSelectionRange(pos, pos + lines[p.line-1].length); ta.scrollTop = (p.line - 5) * 21; } }, 100); };
      frag.appendChild(div);
    });
  });

  list.innerHTML = '';
  if (!frag.childElementCount) {
    const empty = document.createElement('div');
    empty.style.cssText = 'padding:20px;color:var(--text-muted);font-size:12px;text-align:center';
    empty.innerHTML = '✓ No problems detected';
    list.appendChild(empty);
  } else {
    list.appendChild(frag);
  }

  const errEl = document.getElementById('sb-err-count');
  const warnEl = document.getElementById('sb-warn-count');
  if (errEl) errEl.textContent = errCount;
  if (warnEl) warnEl.textContent = warnCount;
  const sbProbs = document.getElementById('sb-problems');
  if (sbProbs) {
    sbProbs.textContent = '⊗ ' + errCount + '  ⚠ ' + warnCount;
    sbProbs.style.color = errCount > 0 ? 'var(--red)' : warnCount > 0 ? 'var(--yellow)' : 'var(--text-muted)';
  }
};
