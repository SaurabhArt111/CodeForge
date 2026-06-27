// =================== LIVE PREVIEW (v5) ===================
// js/preview.js
// Architecture:
//  - Preview is a TAB, not a floating panel
//  - VFS resolves all assets (CSS, JS, img) inline before srcdoc write
//  - Debounced refresh (400ms) — no full reload on every keystroke
//  - Console errors captured and forwarded to the Output panel
//  - VFS navigation (links between pages) stays inside the iframe
//  - External links open in _blank

let _previewCurrentPath = null;
let _previewScrollPos   = 0;
let _previewDebounceTimer = null;

// ─── ASSET RESOLUTION ────────────────────────────────────────────────────────

function resolvePath(fromPath, relativePath) {
  if (!relativePath) return '';
  // Absolute-style paths that start with / are resolved from root
  if (relativePath.startsWith('/')) {
    const parts = relativePath.slice(1).split('/');
    const resolved = [];
    for (const p of parts) {
      if (p === '..') resolved.pop();
      else if (p && p !== '.') resolved.push(p);
    }
    return resolved.join('/');
  }
  const dir = fromPath.includes('/')
    ? fromPath.substring(0, fromPath.lastIndexOf('/') + 1)
    : '';
  const parts = (dir + relativePath).split('/');
  const resolved = [];
  for (const p of parts) {
    if (p === '..') resolved.pop();
    else if (p && p !== '.') resolved.push(p);
  }
  return resolved.join('/');
}

function _findFile(resolved, fromPath) {
  // 1. Exact path
  if (state.files[resolved]) return state.files[resolved];
  // 2. Try filename match across all files
  const name = resolved.split('/').pop();
  const match = Object.keys(state.files).find(p => p === name || p.endsWith('/' + name));
  return match ? state.files[match] : null;
}

function buildPreviewHTML(entryPath) {
  const file = state.files[entryPath];
  if (!file) return _previewErrorPage(`File not found: <strong>${escapeHtml(entryPath)}</strong>`);

  let html = file.content || '';

  // ── Inline CSS <link> tags ──────────────────────────────────────────
  html = html.replace(/<link([^>]*?)href=[\"']([^\"'#][^\"']*)[\"']([^>]*)>/gi,
    (match, pre, href, post) => {
      if (href.startsWith('http') || href.startsWith('//') || href.startsWith('data:')) return match;
      const resolved = resolvePath(entryPath, href);
      const cssFile = _findFile(resolved, entryPath);
      if (cssFile && typeof cssFile.content === 'string') {
        return `<style data-vfs="${escapeHtml(resolved)}">${cssFile.content}</style>`;
      }
      return `<!-- VFS: CSS not found: ${escapeHtml(href)} -->`;
    });

  // ── Inline <script src> ─────────────────────────────────────────────
  html = html.replace(/<script([^>]*?)src=[\"']([^\"'#][^\"']*)[\"']([^>]*)><\/script>/gi,
    (match, pre, src, post) => {
      if (src.startsWith('http') || src.startsWith('//')) return match;
      const resolved = resolvePath(entryPath, src);
      const jsFile = _findFile(resolved, entryPath);
      if (jsFile && typeof jsFile.content === 'string') {
        return `<script data-vfs="${escapeHtml(resolved)}">${jsFile.content}<\/script>`;
      }
      return `<!-- VFS: JS not found: ${escapeHtml(src)} -->`;
    });

  // ── Inline images ────────────────────────────────────────────────────
  html = html.replace(/<img([^>]*?)src=[\"']([^\"'#?][^\"']*)[\"']([^>]*?)>/gi,
    (match, pre, src, post) => {
      if (src.startsWith('http') || src.startsWith('//') || src.startsWith('data:')) return match;
      const resolved = resolvePath(entryPath, src);
      const imgFile = _findFile(resolved, entryPath);
      if (imgFile && imgFile.dataUrl) {
        return `<img${pre}src="${imgFile.dataUrl}"${post} data-vfs="${escapeHtml(resolved)}">`;
      }
      // Broken image fallback: replace with placeholder
      return `<img${pre}src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='80'%3E%3Crect width='120' height='80' fill='%23333'/%3E%3Ctext x='50%25' y='50%25' fill='%23888' font-size='11' dominant-baseline='middle' text-anchor='middle'%3E⚠ ${encodeURIComponent(src.split('/').pop())}%3C/text%3E%3C/svg%3E"${post} data-vfs-broken="1" title="Image not found: ${escapeHtml(src)}">`;
    });

  // ── CSS url() in inline <style> blocks ─────────────────────────────
  html = html.replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/gi, (m, open, css, close) => {
    const resolved_css = css.replace(/url\(['"']?([^'")\s]+)['"']?\)/gi, (um, u) => {
      if (u.startsWith('http') || u.startsWith('//') || u.startsWith('data:')) return um;
      const rp = resolvePath(entryPath, u);
      const imgFile = _findFile(rp, entryPath);
      if (imgFile && imgFile.dataUrl) return `url('${imgFile.dataUrl}')`;
      return um;
    });
    return open + resolved_css + close;
  });

  // ── Error capture + console forwarding ─────────────────────────────
  const errorCapture = `<script>
(function(){
  var _send = function(type, args) {
    window.parent.postMessage({ type: 'vfs-console', level: type,
      msg: Array.from(args).map(function(a){
        try { return typeof a === 'object' ? JSON.stringify(a,null,2) : String(a); } catch(e) { return String(a); }
      }).join(' ') }, '*');
  };
  var _oc = console.log, _oe = console.error, _ow = console.warn, _oi = console.info;
  console.log   = function(){ _send('log',   arguments); _oc.apply(console,arguments); };
  console.error = function(){ _send('error', arguments); _oe.apply(console,arguments); };
  console.warn  = function(){ _send('warn',  arguments); _ow.apply(console,arguments); };
  console.info  = function(){ _send('info',  arguments); _oi.apply(console,arguments); };
  window.onerror = function(msg, src, line, col, err) {
    _send('error', ['\u274C ' + msg + ' (' + (src||'') + ':' + line + ')']);
    return false;
  };
  window.addEventListener('unhandledrejection', function(e) {
    _send('error', ['\u274C Unhandled promise rejection: ' + (e.reason || e)]);
  });
})();
<\/script>`;

  // ── VFS navigation interceptor ──────────────────────────────────────
  const vfsNav = `<script>
(function(){
  document.addEventListener('click', function(e) {
    var a = e.target.closest('a[href]');
    if (!a) return;
    var href = a.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript:') ||
        href.startsWith('mailto:') || href.startsWith('tel:')) return;
    if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//')) {
      a.target = '_blank'; a.rel = 'noopener noreferrer'; return;
    }
    e.preventDefault();
    window.parent.postMessage({ type: 'vfs-navigate', href: href }, '*');
  });
  document.addEventListener('submit', function(e) {
    var action = (e.target.action||'').replace(location.origin,'');
    if (action && !action.startsWith('http') && !action.startsWith('#')) {
      e.preventDefault();
      window.parent.postMessage({ type: 'vfs-navigate', href: action }, '*');
    }
  });
  // Scroll position save/restore
  window.addEventListener('scroll', function() {
    window.parent.postMessage({ type: 'vfs-scroll', y: window.scrollY }, '*');
  }, { passive: true });
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'vfs-restore-scroll') window.scrollTo(0, e.data.y || 0);
  });
})();
<\/script>`;

  // Inject before </head> for error capture, before </body> for nav
  if (html.includes('</head>')) {
    html = html.replace('</head>', errorCapture + '</head>');
  } else {
    html = errorCapture + html;
  }
  if (html.includes('</body>')) {
    html = html.replace(/(<\/body>)/i, vfsNav + '$1');
  } else {
    html += vfsNav;
  }

  return html;
}

function _previewErrorPage(msg) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>body{font-family:system-ui,sans-serif;background:#1a1a2e;color:#e0e0e0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
  .box{text-align:center;padding:40px}.icon{font-size:48px;margin-bottom:16px}.title{font-size:20px;color:#e06c75;margin-bottom:8px}.msg{color:#888;font-size:14px}</style>
  </head><body><div class="box"><div class="icon">⚠️</div><div class="title">Preview Error</div><div class="msg">${msg}</div></div></body></html>`;
}

// ─── PREVIEW TAB SYSTEM ───────────────────────────────────────────────────────

const PREVIEW_TAB_PATH = '__preview__';

function openPreviewTab(entryPath) {
  const path = entryPath || _findBestPreviewFile();
  if (!path) { notify('No HTML file to preview'); return; }

  _previewCurrentPath = path;

  // Register a virtual tab entry for the preview
  if (!state.openTabs.includes(PREVIEW_TAB_PATH)) {
    state.openTabs.push(PREVIEW_TAB_PATH);
  }

  // Create or reuse the preview editor wrapper
  let wrapper = document.getElementById('editor-' + safeId(PREVIEW_TAB_PATH));
  if (!wrapper) {
    wrapper = document.createElement('div');
    wrapper.className = 'editor-wrapper preview-tab-wrapper';
    wrapper.id = 'editor-' + safeId(PREVIEW_TAB_PATH);
    wrapper.dataset.path = PREVIEW_TAB_PATH;
    wrapper.innerHTML = _buildPreviewTabHTML(path);
    document.getElementById('editors-container').appendChild(wrapper);
    _bindPreviewTabEvents(wrapper);
  }

  switchTab(PREVIEW_TAB_PATH);
  _writePreviewContent(path);
  state.previewVisible = true;
  _updatePreviewStatusBtn(true);
}

function _buildPreviewTabHTML(path) {
  return `<div class="preview-tab-root">
    <div class="preview-tab-bar">
      <span class="preview-tab-label"><i class="fas fa-eye"></i> Preview</span>
      <div class="preview-nav-group">
        <button class="preview-nav-btn" id="pvt-back" title="Back" onclick="previewNavBack()"><i class="fas fa-arrow-left"></i></button>
        <button class="preview-nav-btn" id="pvt-fwd"  title="Forward" onclick="previewNavForward()"><i class="fas fa-arrow-right"></i></button>
      </div>
      <input class="preview-url-input" id="preview-url-bar" value="${escapeHtml(path)}" onkeydown="previewNavigate(event)" placeholder="File path or URL...">
      <div class="preview-viewport-btns">
        <button class="vp-btn active" id="vp-full"   onclick="setViewport('full')"   title="Full width">⬜</button>
        <button class="vp-btn"        id="vp-tablet" onclick="setViewport('tablet')" title="Tablet (768px)">⬛</button>
        <button class="vp-btn"        id="vp-mobile" onclick="setViewport('mobile')" title="Mobile (375px)">▪</button>
      </div>
      <button class="preview-nav-btn" onclick="refreshPreview()" title="Refresh"><i class="fas fa-redo"></i></button>
      <button class="preview-nav-btn" onclick="openFullscreenPreview()" title="Fullscreen"><i class="fas fa-expand"></i></button>
    </div>
    <div class="preview-iframe-shell" id="preview-iframe-shell">
      <!-- Singleton iframe is mounted here by CF.mountIframe() in fixes.js -->
    </div>
  </div>`;
}

function _bindPreviewTabEvents(wrapper) {
  // nothing extra needed — bar buttons already have onclick
}

function _writePreviewContent(path) {
  const frame = document.getElementById('split-preview-frame');
  if (!frame) return;
  const file = state.files[path];
  if (!file) { frame.srcdoc = _previewErrorPage(`File not found: ${escapeHtml(path)}`); return; }

  const ext = file.name.split('.').pop().toLowerCase();
  let html;

  if (ext === 'html' || ext === 'htm') {
    html = buildPreviewHTML(path);
  } else if (ext === 'md') {
    const rendered = typeof marked !== 'undefined'
      ? marked.parse(file.content || '')
      : '<pre>' + escapeHtml(file.content || '') + '</pre>';
    html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:800px;margin:32px auto;padding:0 20px;color:#ccc;line-height:1.7;background:#1e1e1e}h1,h2,h3{color:#e0e0e0;border-bottom:1px solid #333;padding-bottom:6px}code{background:#2d2d2d;border-radius:3px;padding:2px 5px;font-size:13px;color:#ce9178}pre{background:#2d2d2d;padding:16px;border-radius:6px;overflow-x:auto}a{color:#4ec9b0}blockquote{border-left:3px solid #4ec9b0;margin:0;padding:8px 16px;background:#1a2e2e;color:#aaa}img{max-width:100%}</style></head><body>${rendered}</body></html>`;
  } else if (ext === 'css') {
    html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:monospace;padding:20px;background:#1e1e1e;color:#ccc}pre{white-space:pre-wrap;word-break:break-all;font-size:13px}</style></head><body><pre>${escapeHtml(file.content)}</pre></body></html>`;
  } else {
    html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:monospace;font-size:13px;padding:20px;background:#1e1e1e;color:#ccc;white-space:pre-wrap}</style></head><body>${escapeHtml(file.content)}</body></html>`;
  }

  const urlBar = document.getElementById('preview-url-bar');
  if (urlBar) urlBar.value = path;
  _previewCurrentPath = path;
  frame.srcdoc = html;
}

function updatePreview(path) {
  if (!path) return;
  // Only update if preview tab is open
  if (!state.openTabs.includes(PREVIEW_TAB_PATH) || !state.previewVisible) return;
  _previewCurrentPath = path;
  _writePreviewContent(path);
}

// Debounced preview — called on every keystroke from onEditorInput
function schedulePreviewUpdate(path) {
  clearTimeout(_previewDebounceTimer);
  _previewDebounceTimer = setTimeout(() => {
    if (state.previewVisible && state.openTabs.includes(PREVIEW_TAB_PATH)) {
      _writePreviewContent(path || _previewCurrentPath);
    }
  }, 400);
}

function toggleLivePreview(forceOpen) {
  if (state.previewVisible && !forceOpen) {
    // Close preview tab
    closeTab(PREVIEW_TAB_PATH);
    state.previewVisible = false;
    _updatePreviewStatusBtn(false);
    return;
  }
  const path = state.activeTab && state.files[state.activeTab]
    ? state.activeTab : _findBestPreviewFile();
  openPreviewTab(path);
}

function _findBestPreviewFile() {
  // Active tab first
  if (state.activeTab && state.files[state.activeTab]) {
    const ext = state.files[state.activeTab].name.split('.').pop().toLowerCase();
    if (['html','htm','md'].includes(ext)) return state.activeTab;
  }
  // First HTML file
  return Object.keys(state.files).find(p => /\.(html|htm)$/i.test(p)) || null;
}

function _updatePreviewStatusBtn(on) {
  const btn = document.getElementById('live-preview-btn');
  if (!btn) return;
  btn.classList.toggle('active', on);
  btn.innerHTML = on ? '⚡ Preview ON' : '⚡ Live Preview';
}

function refreshPreview() {
  if (_previewCurrentPath) _writePreviewContent(_previewCurrentPath);
}

function previewNavigate(e) {
  if (e.key !== 'Enter') return;
  const url = document.getElementById('preview-url-bar')?.value?.trim();
  if (!url) return;
  if (url.startsWith('http')) { window.open(url, '_blank'); return; }
  const resolved = _previewCurrentPath ? resolvePath(_previewCurrentPath, url) : url;
  if (state.files[resolved]) { _writePreviewContent(resolved); return; }
  const found = _findFile(resolved, _previewCurrentPath);
  if (found) { const k = Object.keys(state.files).find(p => state.files[p] === found); if (k) _writePreviewContent(k); }
  else notify('File not found: ' + url);
}

function previewNavBack()    { document.getElementById('split-preview-frame')?.contentWindow?.history?.back(); }
function previewNavForward() { document.getElementById('split-preview-frame')?.contentWindow?.history?.forward(); }

function setViewport(mode) {
  const shell = document.getElementById('preview-iframe-shell');
  const frame = document.getElementById('split-preview-frame');
  if (!shell || !frame) return;
  state.currentViewport = mode;
  document.querySelectorAll('.vp-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('vp-' + mode)?.classList.add('active');
  const sizes = { full: null, tablet: '768px', mobile: '375px' };
  const w = sizes[mode];
  if (w) {
    frame.style.width = w;
    frame.style.margin = '0 auto';
    shell.style.background = '#111';
    shell.style.overflow = 'auto';
  } else {
    frame.style.width = '100%';
    frame.style.margin = '';
    shell.style.background = '';
    shell.style.overflow = '';
  }
}

// ─── FULLSCREEN PREVIEW ───────────────────────────────────────────────────────
function openFullscreenPreview(url) {
  const overlay = document.getElementById('fullscreen-preview');
  if (!overlay) return;
  overlay.classList.add('visible');
  const frame = document.getElementById('fp-frame');
  if (!frame) return;
  const path = url || _previewCurrentPath || state.activeTab;
  if (path && state.files[path]) {
    const ext = state.files[path].name.split('.').pop().toLowerCase();
    frame.srcdoc = (['html','htm'].includes(ext))
      ? buildPreviewHTML(path)
      : `<pre style="font-family:monospace;padding:20px;background:#1e1e1e;color:#ccc;white-space:pre-wrap">${escapeHtml(state.files[path].content)}</pre>`;
    const fpUrl = document.getElementById('fp-url-bar');
    if (fpUrl) fpUrl.value = path;
  }
}
function closeFullscreenPreview() { document.getElementById('fullscreen-preview')?.classList.remove('visible'); }
function fpNavBack()    { document.getElementById('fp-frame')?.contentWindow?.history?.back(); }
function fpNavForward() { document.getElementById('fp-frame')?.contentWindow?.history?.forward(); }

// ─── MESSAGE HANDLER (from iframe) ────────────────────────────────────────────
// Exported as a named function so fixes.js can remove it before registering its own.
function _previewMessageHandler(e) {
  if (!e.data?.type) return;

  if (e.data.type === 'vfs-navigate') {
    const href = e.data.href;
    if (!href) return;
    const base = _previewCurrentPath || '';
    const resolved = resolvePath(base, href);
    const file = state.files[resolved] || _findFile(resolved, base);
    if (file) {
      const realPath = Object.keys(state.files).find(p => state.files[p] === file) || resolved;
      _writePreviewContent(realPath);
    } else {
      notify('VFS: file not found — ' + href);
    }
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
    // Badge on Output tab
    const badge = document.getElementById('console-badge');
    if (badge && level === 'error') { badge.style.display = ''; badge.textContent = parseInt(badge.textContent||0) + 1; }
    return;
  }

  if (e.data.type === 'vfs-scroll') {
    _previewScrollPos = e.data.y || 0;
  }
}
// Register the handler. fixes.js will remove this and register its own upgraded version.
window.addEventListener('message', _previewMessageHandler);

// ─── MARKDOWN PREVIEW ─────────────────────────────────────────────────────────
function toggleMarkdownPreview() {
  const path = state.activeTab;
  if (!path || !state.files[path]) return;
  if (!path.endsWith('.md')) { notify('Not a Markdown file'); return; }
  state.mdPreviewVisible = !state.mdPreviewVisible;
  if (state.mdPreviewVisible) buildMdPreviewPanel(path);
  else closeMdPreview();
}

function buildMdPreviewPanel(path) {
  const wrapper = document.getElementById('editor-' + safeId(path));
  if (!wrapper || wrapper.querySelector('.md-split')) { updateMdPreview(path); return; }
  const existingContent = wrapper.innerHTML;
  wrapper.innerHTML = `<div class="md-split">
    <div class="md-editor-pane"><div class="md-pane-header">Markdown Source</div>${existingContent}</div>
    <div class="md-preview-pane"><div class="md-pane-header">Preview</div><div class="md-preview" id="md-preview-${safeId(path)}"></div></div>
  </div>`;
  updateMdPreview(path);
}

function closeMdPreview() {
  const path = state.activeTab;
  if (!path || !state.files[path]) return;
  const wrapper = document.getElementById('editor-' + safeId(path));
  if (!wrapper) return;
  wrapper.remove();
  createEditorForFile(path, true);
}

function updateMdPreview(path) {
  const file = state.files[path];
  if (!file) return;
  const previewEl = document.getElementById('md-preview-' + safeId(path));
  if (!previewEl) return;
  previewEl.innerHTML = typeof marked !== 'undefined'
    ? marked.parse(file.content || '')
    : escapeHtml(file.content || '').replace(/\n/g, '<br>');
}
