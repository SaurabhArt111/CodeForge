// =================== EDITOR CORE ===================
// js/editor.js

function safeId(path) {
  return path.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function escapeHtml(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// =================== UNDO/REDO STACK ===================
const _undoStacks = {}; // path -> { stack: [], idx }

function _getUndoStack(path) {
  if (!_undoStacks[path]) _undoStacks[path] = { stack: [], idx: -1 };
  return _undoStacks[path];
}

function _pushUndo(path, value, selStart, selEnd) {
  const us = _getUndoStack(path);
  // Trim redo branch
  us.stack = us.stack.slice(0, us.idx + 1);
  // Avoid duplicate consecutive entries
  const last = us.stack[us.stack.length - 1];
  if (last && last.value === value) return;
  us.stack.push({ value, selStart, selEnd });
  if (us.stack.length > 200) us.stack.shift();
  us.idx = us.stack.length - 1;
}

function _undo(ta, path) {
  const us = _getUndoStack(path);
  if (us.idx <= 0) return;
  us.idx--;
  const entry = us.stack[us.idx];
  ta.value = entry.value;
  ta.setSelectionRange(entry.selStart, entry.selEnd);
  onEditorInput(ta, path, true);
}

function _redo(ta, path) {
  const us = _getUndoStack(path);
  if (us.idx >= us.stack.length - 1) return;
  us.idx++;
  const entry = us.stack[us.idx];
  ta.value = entry.value;
  ta.setSelectionRange(entry.selStart, entry.selEnd);
  onEditorInput(ta, path, true);
}

// =================== LINE NUMBERS (RAF batched) ===================
const _lnRafPending = {};

function syncScrollById(lnId, ta) {
  const ln = document.getElementById(lnId);
  if (ln) ln.scrollTop = ta.scrollTop;
}

function updateLineNumbers(path, pane) {
  const sid = safeId(path);
  const prefix = pane === 'right' ? 'R_' : '';
  const ta = document.getElementById('ta-' + prefix + sid);
  const ln = document.getElementById('ln-' + prefix + sid);
  if (!ta || !ln) return;
  _scheduleLineNumbers(ln.id, ta);
}

function _scheduleLineNumbers(lnId, ta) {
  if (_lnRafPending[lnId]) return;
  _lnRafPending[lnId] = true;
  requestAnimationFrame(() => {
    delete _lnRafPending[lnId];
    updateLineNumbersById(lnId, ta);
  });
}

function updateLineNumbersById(lnId, ta) {
  const ln = document.getElementById(lnId);
  if (!ln || !ta) return;
  const count = (ta.value.match(/\n/g) || []).length + 1;
  // Only rebuild if count changed
  const current = ln.childElementCount;
  if (current === count) return;
  if (count > current) {
    const frag = document.createDocumentFragment();
    for (let i = current + 1; i <= count; i++) {
      const d = document.createElement('div');
      d.style.lineHeight = '21px';
      d.textContent = i;
      frag.appendChild(d);
    }
    ln.appendChild(frag);
  } else {
    while (ln.childElementCount > count) ln.removeChild(ln.lastChild);
  }
}

// =================== SCROLL RAIL ===================
function updateScrollRail(railId, ta) {
  const thumb = document.getElementById(railId + '-thumb');
  if (!thumb) return;
  const scrollable = ta.scrollHeight - ta.clientHeight;
  if (scrollable <= 0) { thumb.style.display = 'none'; return; }
  thumb.style.display = '';
  const rail = document.getElementById(railId);
  if (!rail) return;
  const railH = rail.clientHeight;
  const thumbH = Math.max(24, (ta.clientHeight / ta.scrollHeight) * railH);
  const thumbTop = (ta.scrollTop / scrollable) * (railH - thumbH);
  thumb.style.height = thumbH + 'px';
  thumb.style.top = thumbTop + 'px';
}

function initScrollRail(railId, ta) {
  const rail = document.getElementById(railId);
  if (!rail) return;

  rail.addEventListener('click', e => {
    if (e.target.closest('.scroll-rail-thumb')) return;
    const rect = rail.getBoundingClientRect();
    const ratio = (e.clientY - rect.top) / rect.height;
    ta.scrollTop = ratio * (ta.scrollHeight - ta.clientHeight);
    updateScrollRail(railId, ta);
  });

  const thumb = document.getElementById(railId + '-thumb');
  if (!thumb) return;

  // Touch support for scroll rail
  thumb.addEventListener('touchstart', e => {
    e.preventDefault();
    const touch = e.touches[0];
    const startY = touch.clientY;
    const startScroll = ta.scrollTop;
    const railH = rail.clientHeight;
    const totalScroll = ta.scrollHeight - ta.clientHeight;
    thumb.classList.add('dragging');

    const onMove = ev => {
      const t = ev.touches[0];
      const delta = t.clientY - startY;
      ta.scrollTop = Math.max(0, Math.min(totalScroll, startScroll + (delta / railH) * totalScroll));
      updateScrollRail(railId, ta);
    };
    const onEnd = () => {
      thumb.classList.remove('dragging');
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
    };
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
  }, { passive: false });

  thumb.addEventListener('mousedown', e => {
    e.preventDefault(); e.stopPropagation();
    thumb.classList.add('dragging');
    const startY = e.clientY;
    const startScroll = ta.scrollTop;
    const railH = rail.clientHeight;
    const totalScroll = ta.scrollHeight - ta.clientHeight;

    const onMove = ev => {
      const delta = ev.clientY - startY;
      ta.scrollTop = Math.max(0, Math.min(totalScroll, startScroll + (delta / railH) * totalScroll));
      updateScrollRail(railId, ta);
    };
    const onUp = () => {
      thumb.classList.remove('dragging');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  updateScrollRail(railId, ta);
  const ro = new ResizeObserver(() => updateScrollRail(railId, ta));
  ro.observe(ta);
}

// =================== CURSOR TRACKING ===================
function updateCursor(ta) { updateCursorFromEl(ta); }
function updateCursorFromEl(ta) {
  if (!ta) return;
  const val = ta.value.substring(0, ta.selectionStart);
  const lines = val.split('\n');
  const sbCursor = document.getElementById('sb-cursor');
  if (sbCursor) sbCursor.textContent = `Ln ${lines.length}, Col ${lines[lines.length - 1].length + 1}`;
}

// =================== BRACKET MATCHING ===================
const _BRACKET_PAIRS = { '(': ')', '[': ']', '{': '}' };
const _BRACKET_CLOSE = { ')': '(', ']': '[', '}': '{' };

function _highlightBrackets(ta) {
  // Remove previous highlights
  ta.closest('.code-editor-container')?.querySelectorAll('.bracket-highlight').forEach(el => el.remove());

  const pos = ta.selectionStart;
  const val = ta.value;
  const ch = val[pos] || val[pos - 1];
  if (!ch) return;

  let open, close, dir, start;
  if (_BRACKET_PAIRS[ch]) { open = ch; close = _BRACKET_PAIRS[ch]; dir = 1; start = pos; }
  else if (_BRACKET_CLOSE[ch]) { close = ch; open = _BRACKET_CLOSE[ch]; dir = -1; start = pos - 1; }
  else return;

  let depth = 0;
  let matchPos = -1;
  for (let i = start; i >= 0 && i < val.length; i += dir) {
    if (val[i] === open) depth++;
    else if (val[i] === close) { depth--; if (depth === 0) { matchPos = i; break; } }
  }
  if (matchPos === -1) return;

  // Visual: flash status bar instead of DOM hack (avoids layout thrash)
  const sbCursor = document.getElementById('sb-cursor');
  if (sbCursor) {
    sbCursor.style.color = 'var(--accent)';
    clearTimeout(ta._bracketFlash);
    ta._bracketFlash = setTimeout(() => { sbCursor.style.color = ''; }, 500);
  }
}

// =================== EDITOR INPUT ===================
// Throttle map: prevent > 60fps DOM updates per editor
const _inputRaf = {};
let inputTimer = null;

function onEditorInput(ta, path, skipUndo = false) {
  if (inputTimer) cancelAnimationFrame(inputTimer);

  inputTimer = requestAnimationFrame(() => {
    _handleEditorInput(ta, path, skipUndo);
  });
}

function _handleEditorInput(ta, path, skipUndo = false) {
  const file = state.files[path];
  if (!file) return;
  file.content = ta.value;
  file.modified = !state.settings.autoSave;

  if (!skipUndo) {
    clearTimeout(ta._undoTimer);
    ta._undoTimer = setTimeout(() => _pushUndo(path, ta.value, ta.selectionStart, ta.selectionEnd), 300);
  }

  // Batch DOM updates via RAF
  if (!_inputRaf[path]) {
    _inputRaf[path] = requestAnimationFrame(() => {
      delete _inputRaf[path];
      const lnEl = ta.closest('.code-editor-container')?.querySelector('.line-numbers');
      if (lnEl) _scheduleLineNumbers(lnEl.id, ta);
      renderTabs();
      if (ta.id) {
        scheduleHighlight(ta.id, path);
        const railId = ta.id.replace(/^ta-/, 'rail-');
        updateScrollRail(railId, ta);
      }
    });
  }

  if (state.settings.autoSave) { file.modified = false; saveToStorage(); }
  if (state.previewVisible) schedulePreviewUpdate(path);

  clearTimeout(ta._lintTimer);
  ta._lintTimer = setTimeout(() => lintFile(path), 700);

  clearTimeout(ta._acTimer);
  ta._acTimer = setTimeout(() => triggerAutocomplete(ta, path), 250);

  if (state.mdPreviewVisible && path && path.endsWith('.md')) updateMdPreview(path);
  updateSelectionCount(ta);
}

// schedulePreviewUpdate is defined in preview.js

// =================== SNIPPET COMPLETION ===================
const SNIPPETS = {
  div: '<div></div>',
  span: '<span></span>',
  p: '<p></p>',
  a: '<a href=""></a>',
  button: '<button></button>',
  input: '<input>',
  form: '<form></form>',
  ul: '<ul><li></li></ul>',
  ol: '<ol><li></li></ol>',
  li: '<li></li>',
  h1: '<h1></h1>',
  h2: '<h2></h2>',
  h3: '<h3></h3>',
  table: '<table><tr><td></td></tr></table>',
};

function handleTabCompletion(ta) {
  const cursor = ta.selectionStart;
  const text = ta.value;

  const wordStart = text.lastIndexOf(' ', cursor - 1) + 1;
  const word = text.slice(wordStart, cursor);

  if (SNIPPETS[word]) {
    const snippet = SNIPPETS[word];

    ta.value =
      text.slice(0, wordStart) +
      snippet +
      text.slice(cursor);

    // place cursor inside tag
    const newCursor = wordStart + snippet.indexOf('>') + 1;
    ta.setSelectionRange(newCursor, newCursor);

    return true;
  }

  return false;
}

// =================== KEYBOARD HANDLER ===================
function handleEditorKey(e, path) {
  const ta = e.target;
  if (!ta) return;

  if (state.acVisible && acNavKey(e, ta, path)) return;

  // Undo/Redo override
  if (e.ctrlKey && !e.shiftKey && e.key === 'z') { e.preventDefault(); _undo(ta, path); return; }
  if (e.ctrlKey && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); _redo(ta, path); return; }

  if (e.key === 'Tab' && !e.shiftKey && state.settings.emmet && ta) {
    const lang = state.files[path] ? getLangFromFile(state.files[path].name) : '';
    if (lang === 'html' && tryEmmetExpand(ta, path)) return;
    // Try snippet completion
    if (handleTabCompletion(ta)) {
      e.preventDefault();
      onEditorInput(ta, path);
      return;
    }
  }

  if (e.ctrlKey && e.key === 'g') { e.preventDefault(); goToLine(); return; }
  if (e.ctrlKey && e.shiftKey && e.key === 'M') { e.preventDefault(); toggleMarkdownPreview(); return; }
  if (e.ctrlKey && e.shiftKey && e.key === 'P') { e.preventDefault(); showCommandPalette(); return; }

  if (e.key === 'Tab') {
    e.preventDefault();
    const start = ta.selectionStart, end = ta.selectionEnd;
    if (e.shiftKey) {
      // Multi-line de-indent
      const lineStart = ta.value.lastIndexOf('\n', start - 1) + 1;
      const spaces = ' '.repeat(state.settings.tabSize);
      if (ta.value.substring(lineStart).startsWith(spaces)) {
        ta.value = ta.value.substring(0, lineStart) + ta.value.substring(lineStart + spaces.length);
        ta.selectionStart = ta.selectionEnd = Math.max(start - spaces.length, lineStart);
      }
    } else {
      // Multi-line indent if selection spans multiple lines
      if (start !== end && ta.value.substring(start, end).includes('\n')) {
        const lineStart = ta.value.lastIndexOf('\n', start - 1) + 1;
        const lineEnd = ta.value.indexOf('\n', end - 1);
        const block = ta.value.substring(lineStart, lineEnd === -1 ? ta.value.length : lineEnd);
        const spaces = ' '.repeat(state.settings.tabSize);
        const indented = block.split('\n').map(l => spaces + l).join('\n');
        ta.value = ta.value.substring(0, lineStart) + indented + ta.value.substring(lineEnd === -1 ? ta.value.length : lineEnd);
        ta.selectionStart = lineStart;
        ta.selectionEnd = lineStart + indented.length;
      } else {
        const spaces = ' '.repeat(state.settings.tabSize);
        ta.value = ta.value.substring(0, start) + spaces + ta.value.substring(end);
        ta.selectionStart = ta.selectionEnd = start + spaces.length;
      }
    }
    onEditorInput(ta, path); return;
  }

  const pairs = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`' };
  if (pairs[e.key]) {
    const start = ta.selectionStart, end = ta.selectionEnd;
    // If char after cursor is the closing char, just move past it
    if (e.key === ta.value[start] && !pairs[e.key]) { e.preventDefault(); ta.selectionStart = ta.selectionEnd = start + 1; return; }
    e.preventDefault();
    const selected = ta.value.substring(start, end);
    ta.value = ta.value.substring(0, start) + e.key + selected + pairs[e.key] + ta.value.substring(end);
    ta.selectionStart = start + 1; ta.selectionEnd = end + 1;
    onEditorInput(ta, path); return;
  }

  // Skip closing bracket if it's already there
  if (Object.values(pairs).includes(e.key)) {
    const pos = ta.selectionStart;
    if (ta.value[pos] === e.key && ta.selectionStart === ta.selectionEnd) {
      e.preventDefault();
      ta.selectionStart = ta.selectionEnd = pos + 1;
      return;
    }
  }

  if (e.key === 'Enter') {
    e.preventDefault();
    const start = ta.selectionStart;
    const lineStart = ta.value.lastIndexOf('\n', start - 1) + 1;
    const line = ta.value.substring(lineStart, start);
    const indent = line.match(/^(\s*)/)[1];
    const charBefore = ta.value[start - 1];
    const charAfter = ta.value[start];
    const extra = ['{', '[', '('].includes(charBefore) ? ' '.repeat(state.settings.tabSize) : '';
    // Auto close block
    const closingInsert = (charBefore === '{' && charAfter === '}') ||
      (charBefore === '[' && charAfter === ']') ||
      (charBefore === '(' && charAfter === ')')
      ? '\n' + indent : '';
    const insert = '\n' + indent + extra;
    ta.value = ta.value.substring(0, start) + insert + closingInsert + ta.value.substring(ta.selectionEnd);
    ta.selectionStart = ta.selectionEnd = start + insert.length;
    onEditorInput(ta, path); return;
  }

  // Backspace: delete matching pair
  if (e.key === 'Backspace') {
    const pos = ta.selectionStart;
    if (ta.selectionStart === ta.selectionEnd) {
      const charBefore = ta.value[pos - 1];
      const charAfter = ta.value[pos];
      if (pairs[charBefore] && pairs[charBefore] === charAfter) {
        e.preventDefault();
        ta.value = ta.value.substring(0, pos - 1) + ta.value.substring(pos + 1);
        ta.selectionStart = ta.selectionEnd = pos - 1;
        onEditorInput(ta, path); return;
      }
    }
  }

  if (e.ctrlKey && e.key === 's') { e.preventDefault(); saveCurrentFile(); }
  if (e.ctrlKey && e.key === '/') { e.preventDefault(); commentToggle(); }
  if (e.ctrlKey && e.key === 'f') { e.preventDefault(); toggleFind(); }
  if (e.ctrlKey && e.key === 'h') { e.preventDefault(); toggleFind(true); }
  if (e.key === 'F5') { e.preventDefault(); runCode(); }

  // Bracket highlight on cursor movement
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
    setTimeout(() => _highlightBrackets(ta), 0);
  }

  if (ta.id) setTimeout(() => updateHlBackdrop(ta.id, path), 0);
  if (ta) updateSelectionCount(ta);
}

// =================== CREATE EDITOR ===================
function createEditorForFile(path, activate, pane) {
  const sid = safeId(path);
  const editorId = 'editor-' + (pane === 'right' ? 'R_' : '') + sid;
  const containerId = pane === 'right' ? 'pane-right-editors' : 'editors-container';
  if (document.getElementById(editorId)) return;

  const file = state.files[path];
  const container = document.getElementById(containerId);
  const wrapper = document.createElement('div');
  wrapper.className = 'editor-wrapper';
  wrapper.id = editorId;
  wrapper.dataset.path = path;

  if (file && file.isImage) {
    wrapper.innerHTML = `<div class="image-viewer">
      <div class="image-viewer-tools">
        <button class="img-tool-btn" onclick="this.closest('.image-viewer').querySelector('img').style.transform='scale(1)'">Reset</button>
        <button class="img-tool-btn" onclick="var img=this.closest('.image-viewer').querySelector('img');var s=parseFloat(img.style.transform.replace(/[^0-9.]/g,'')||1);img.style.transform='scale('+(s+0.25)+')'">Zoom In</button>
        <button class="img-tool-btn" onclick="var img=this.closest('.image-viewer').querySelector('img');var s=parseFloat(img.style.transform.replace(/[^0-9.]/g,'')||1);img.style.transform='scale('+(Math.max(0.25,s-0.25))+')'">Zoom Out</button>
      </div>
      <img src="${file.dataUrl}" alt="${escapeHtml(file.name)}" style="transition:transform 0.2s;touch-action:pinch-zoom">
      <div class="image-info">${escapeHtml(file.name)}</div>
    </div>`;
    _initImagePinchZoom(wrapper.querySelector('img'));
  } else if (path === '__welcome__') {
    wrapper.innerHTML = buildWelcomeHTML();
  } else if (path === '__settings__') {
    wrapper.innerHTML = buildSettingsHTML();
  } else if (path === '__diff__') {
    wrapper.innerHTML = buildDiffHTML();
  } else if (file) {
    const taId = 'ta-' + (pane === 'right' ? 'R_' : '') + sid;
    const lnId = 'ln-' + (pane === 'right' ? 'R_' : '') + sid;
    const railId = 'rail-' + (pane === 'right' ? 'R_' : '') + sid;
    wrapper.innerHTML = `<div class="code-editor-container">
      <div class="line-numbers" id="${lnId}"></div>
      <textarea class="code-area" id="${taId}" spellcheck="false"
        onscroll="syncScrollById('${lnId}',this);updateScrollRail('${railId}',this)"
        oninput="onEditorInput(this,'${path.replace(/'/g, "\\'")}')"
        onkeydown="handleEditorKey(event,'${path.replace(/'/g, "\\'")}')"
        onclick="updateCursor(this);_highlightBrackets(this)"
        onkeyup="updateCursor(this)"
        oncontextmenu="showEditorContextMenu(event,'${path.replace(/'/g, "\\'")}')"
      >${escapeHtml(file.content || '')}</textarea>
      <div class="scroll-rail" id="${railId}" title="Click to scroll">
        <div class="scroll-rail-track">
          <div class="scroll-rail-thumb" id="${railId}-thumb"></div>
        </div>
      </div>
    </div>`;
  }

  container.appendChild(wrapper);

  if (file && !file.isImage && path !== '__welcome__' && path !== '__settings__' && path !== '__diff__') {
    // Push initial undo state
    _pushUndo(path, file.content || '', 0, 0);

    requestAnimationFrame(() => {
      const taId = 'ta-' + (pane === 'right' ? 'R_' : '') + sid;
      const lnId = 'ln-' + (pane === 'right' ? 'R_' : '') + sid;
      const railId = 'rail-' + (pane === 'right' ? 'R_' : '') + sid;
      const taEl = document.getElementById(taId);
      if (!taEl) return;
      updateLineNumbersById(lnId, taEl);
      updateCursorFromEl(taEl);
      initScrollRail(railId, taEl);
      const ext = (path.split('.').pop() || '').toLowerCase();
      if (['js', 'ts', 'html', 'htm', 'css', 'json', 'py', 'md', 'php', 'sh', 'xml'].includes(ext)) {
        createHlEditor(taId, lnId, path);
      }
      // Mobile: larger tap targets
      if (_isTouchDevice()) {
        taEl.style.fontSize = Math.max(state.settings.fontSize, 16) + 'px';
      }
    });
  }

  if (activate) switchTab(path, pane);
}

// =================== PINCH ZOOM FOR IMAGES ===================
function _initImagePinchZoom(img) {
  if (!img) return;
  let lastDist = 0, scale = 1;
  img.addEventListener('touchstart', e => {
    if (e.touches.length === 2) {
      lastDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    }
  }, { passive: true });
  img.addEventListener('touchmove', e => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      scale = Math.min(5, Math.max(0.5, scale * (dist / lastDist)));
      img.style.transform = `scale(${scale})`;
      lastDist = dist;
    }
  }, { passive: false });
}

// =================== SETTINGS APPLY ===================
function applySettingsToEditor() {
  const fs = state.settings.fontSize + 'px';
  const ts = state.settings.tabSize;
  const ww = state.settings.wordWrap ? 'pre-wrap' : 'pre';
  const ln = state.settings.lineNumbers;

  // Batch writes with single style updates
  document.querySelectorAll('.code-area').forEach(ta => {
    ta.style.cssText += `;font-size:${fs};tab-size:${ts};white-space:${ww}`;
  });
  document.querySelectorAll('.hl-backdrop').forEach(bd => {
    bd.style.cssText += `;font-size:${fs};tab-size:${ts};white-space:${ww}`;
  });
  document.querySelectorAll('.line-numbers').forEach(el => {
    el.style.display = ln ? '' : 'none';
  });
  const sbSpaces = document.getElementById('sb-spaces');
  if (sbSpaces) sbSpaces.textContent = `Spaces: ${ts}`;
}

function applySetting(key, value) {
  state.settings[key] = isNaN(value) || value === '' ? value : Number(value);
  applySettingsToEditor(); saveToStorage();
}

function toggleSetting(key, elId) {
  state.settings[key] = !state.settings[key];
  document.getElementById(elId)?.classList.toggle('on', state.settings[key]);
  applySettingsToEditor(); saveToStorage();
}

function applyTheme(t) {
  state.settings.theme = t;
  const themes = {
    dark: { '--bg-primary': '#1e1e1e', '--bg-secondary': '#252526', '--bg-editor': '#1e1e1e', '--bg-activitybar': '#333333', '--bg-statusbar': '#007acc', '--text-primary': '#cccccc' },
    monokai: { '--bg-primary': '#272822', '--bg-secondary': '#1e1f1c', '--bg-editor': '#272822', '--bg-activitybar': '#1a1b16', '--bg-statusbar': '#66d9e8', '--text-primary': '#f8f8f2' },
    solarized: { '--bg-primary': '#002b36', '--bg-secondary': '#073642', '--bg-editor': '#002b36', '--bg-activitybar': '#001f27', '--bg-statusbar': '#268bd2', '--text-primary': '#839496' },
    light: { '--bg-primary': '#ffffff', '--bg-secondary': '#f3f3f3', '--bg-editor': '#ffffff', '--bg-activitybar': '#2c2c2c', '--bg-statusbar': '#007acc', '--text-primary': '#333333' },
    github: { '--bg-primary': '#f6f8fa', '--bg-secondary': '#ffffff', '--bg-editor': '#f6f8fa', '--bg-activitybar': '#24292e', '--bg-statusbar': '#0366d6', '--text-primary': '#24292e' },
    dracula: { '--bg-primary': '#282a36', '--bg-secondary': '#1e1f29', '--bg-editor': '#282a36', '--bg-activitybar': '#1e1f29', '--bg-statusbar': '#bd93f9', '--text-primary': '#f8f8f2' },
  };
  const vars = themes[t] || themes.dark;
  const root = document.documentElement;
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));
  saveToStorage(); notify('Theme: ' + t);
}

function toggleMinimap() {
  state.settings.minimap = !state.settings.minimap;
  document.querySelectorAll('[id^="minimap-wrapper-"]').forEach(el => {
    el.style.display = state.settings.minimap ? 'block' : 'none';
  });
  saveToStorage();
}

// =================== MISC EDITOR FEATURES ===================
function commentToggle() {
  const path = state.activeTab;
  const ta = getActiveTextarea();
  if (!ta) return;
  const start = ta.selectionStart;
  const lineStart = ta.value.lastIndexOf('\n', start - 1) + 1;
  const lineEnd = ta.value.indexOf('\n', start);
  const line = ta.value.substring(lineStart, lineEnd === -1 ? undefined : lineEnd);
  const ext = state.files[path]?.name.split('.').pop().toLowerCase();
  const prefix = (ext === 'html' || ext === 'xml') ? '<!-- ' : (ext === 'py' || ext === 'sh') ? '# ' : '// ';
  const suffix = (ext === 'html' || ext === 'xml') ? ' -->' : '';
  let newLine;
  if (line.trim().startsWith(prefix.trim())) {
    newLine = line.replace(prefix, '').replace(suffix, '');
  } else {
    newLine = prefix + line + suffix;
  }
  const selEnd = lineEnd === -1 ? ta.value.length : lineEnd;
  ta.value = ta.value.substring(0, lineStart) + newLine + ta.value.substring(selEnd);
  ta.selectionStart = ta.selectionEnd = start + (newLine.length - line.length);
  onEditorInput(ta, path);
}

function formatCurrentFile() {
  notify('Format: Editor formatting (install Prettier for full support)');
}

function goToLine() {
  const line = prompt('Go to line:');
  if (!line || isNaN(line)) return;
  const n = parseInt(line);
  const ta = getActiveTextarea();
  if (!ta) return;
  const lines = ta.value.split('\n');
  if (n < 1 || n > lines.length) return;
  const pos = lines.slice(0, n - 1).join('\n').length + (n > 1 ? 1 : 0);
  ta.focus();
  ta.setSelectionRange(pos, pos + lines[n - 1].length);
  ta.scrollTop = (n - 5) * 21;
  notify(`Line ${n}`);
}

function changeLang() { notify('Click language in status bar to cycle syntax mode'); }

function updateSelectionCount(ta) {
  const sel = ta.value.substring(ta.selectionStart, ta.selectionEnd);
  const sbSel = document.getElementById('sb-sel-count');
  if (!sbSel) return;
  if (sel.length > 0) { sbSel.textContent = `(${sel.length} selected)`; sbSel.style.display = ''; }
  else { sbSel.style.display = 'none'; }
}

function getActiveTextarea() {
  const path = state.activeTab;
  if (!path || !state.files[path]) return null;
  return document.getElementById('ta-' + safeId(path));
}

// =================== TOUCH DEVICE DETECTION ===================
function _isTouchDevice() {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

// =================== RUN CODE ===================
function runCode() {
  const path = state.activeTab;
  if (!path || !state.files[path]) { notify('No file to run'); return; }
  const file = state.files[path];
  const ext = file.name.split('.').pop().toLowerCase();
  switchPanel('console');
  if (!state.panelVisible) togglePanel();
  const out = document.getElementById('console-output');
  if (ext === 'html') {
    toggleLivePreview(true); notify('Opening preview for ' + file.name);
  } else if (ext === 'js') {
    out.innerHTML = '';
    const logs = [];
    const origLog = console.log, origErr = console.error, origWarn = console.warn;
    console.log = (...a) => { logs.push({ t: 'log', m: a.map(x => typeof x === 'object' ? JSON.stringify(x) : String(x)).join(' ') }); origLog(...a); };
    console.error = (...a) => { logs.push({ t: 'error', m: a.map(String).join(' ') }); origErr(...a); };
    console.warn = (...a) => { logs.push({ t: 'warn', m: a.map(String).join(' ') }); origWarn(...a); };
    try {
      new Function(file.content)();
      console.log = origLog; console.error = origErr; console.warn = origWarn;
      if (!logs.length) out.innerHTML = '<div style="color:var(--green)">✓ Script executed (no output)</div>';
      else {
        const frag = document.createDocumentFragment();
        logs.forEach(l => {
          const d = document.createElement('div');
          d.className = 'terminal-line';
          d.style.color = l.t === 'error' ? 'var(--red)' : l.t === 'warn' ? 'var(--yellow)' : 'var(--text-primary)';
          d.textContent = (l.t !== 'log' ? `[${l.t.toUpperCase()}] ` : '') + l.m;
          frag.appendChild(d);
        });
        out.appendChild(frag);
      }
    } catch (err) {
      console.log = origLog; console.error = origErr; console.warn = origWarn;
      out.innerHTML = `<div class="terminal-line error">❌ ${err.message}</div>`;
    }
  } else {
    out.innerHTML = `<div style="color:var(--text-muted)">Cannot run ${ext} files directly.</div>`;
  }
}

// =================== DIFF VIEWER ===================
function buildDiffHTML() {
  const fileOpts = Object.keys(state.files).filter(p => !state.files[p].isImage).map(p => `<option value="${p}">${p}</option>`).join('');
  return `<div class="diff-viewer">
    <div class="diff-header">
      <span><i class="fas fa-code-branch" style="margin-right:6px;color:var(--accent)"></i>Diff Viewer</span>
      <div class="diff-selects">
        <select class="diff-select" id="diff-left" onchange="renderDiff()"><option value="">— File A —</option>${fileOpts}</select>
        <span style="color:var(--text-muted)">vs</span>
        <select class="diff-select" id="diff-right" onchange="renderDiff()"><option value="">— File B —</option>${fileOpts}</select>
      </div>
    </div>
    <div class="diff-content" id="diff-content">
      <div style="padding:20px;color:var(--text-muted);font-size:12px">Select two files to compare</div>
    </div>
  </div>`;
}

function renderDiff() {
  const lPath = document.getElementById('diff-left')?.value;
  const rPath = document.getElementById('diff-right')?.value;
  const container = document.getElementById('diff-content');
  if (!container || !lPath || !rPath) return;
  const lLines = (state.files[lPath]?.content || '').split('\n');
  const rLines = (state.files[rPath]?.content || '').split('\n');
  const frag = document.createDocumentFragment();
  const maxLen = Math.max(lLines.length, rLines.length);
  for (let i = 0; i < maxLen; i++) {
    const l = lLines[i], r = rLines[i];
    const d = document.createElement('div');
    if (l === undefined) {
      d.className = 'diff-line diff-added';
      d.innerHTML = `<span class="diff-line-num">${i + 1}</span><span class="diff-line-text">+ ${escapeHtml(r)}</span>`;
    } else if (r === undefined) {
      d.className = 'diff-line diff-removed';
      d.innerHTML = `<span class="diff-line-num">${i + 1}</span><span class="diff-line-text">- ${escapeHtml(l)}</span>`;
    } else if (l !== r) {
      d.className = 'diff-line diff-removed';
      d.innerHTML = `<span class="diff-line-num">${i + 1}</span><span class="diff-line-text">- ${escapeHtml(l)}</span>`;
      frag.appendChild(d);
      const d2 = document.createElement('div');
      d2.className = 'diff-line diff-added';
      d2.innerHTML = `<span class="diff-line-num">${i + 1}</span><span class="diff-line-text">+ ${escapeHtml(r)}</span>`;
      frag.appendChild(d2);
      continue;
    } else {
      d.className = 'diff-line diff-unchanged';
      d.innerHTML = `<span class="diff-line-num">${i + 1}</span><span class="diff-line-text">&nbsp; ${escapeHtml(l)}</span>`;
    }
    frag.appendChild(d);
  }
  container.innerHTML = '';
  container.appendChild(frag);
}

// =================== EDITOR CONTEXT MENU ===================
function showEditorContextMenu(e, path) {
  e.preventDefault();
  e.stopPropagation();
  
  const menu = document.getElementById('editor-ctx-menu');
  const ta = e.target;
  
  // Position the menu
  menu.style.left = Math.min(e.clientX, window.innerWidth - 200) + 'px';
  menu.style.top = Math.min(e.clientY, window.innerHeight - 200) + 'px';
  menu.style.display = 'block';
  
  // Store the target textarea for actions
  menu.dataset.targetTextarea = ta.id;
  menu.dataset.targetPath = path;
  
  // Hide the file context menu if it's visible
  document.getElementById('ctx-menu').style.display = 'none';
}

function hideEditorCtxMenu() {
  document.getElementById('editor-ctx-menu').style.display = 'none';
  document.getElementById('ctx-menu').style.display = 'none';
}

function editorCtxAction(action) {
  const menu = document.getElementById('editor-ctx-menu');
  const taId = menu.dataset.targetTextarea;
  const path = menu.dataset.targetPath;
  const ta = document.getElementById(taId);
  
  if (!ta) return;
  
  hideEditorCtxMenu();
  
  switch (action) {
    case 'cut':
      document.execCommand('cut');
      break;
    case 'copy':
      document.execCommand('copy');
      break;
    case 'paste':
      // Try modern clipboard API first, fallback to execCommand
      if (navigator.clipboard && navigator.clipboard.readText) {
        navigator.clipboard.readText().then(text => {
          const start = ta.selectionStart;
          const end = ta.selectionEnd;
          ta.value = ta.value.substring(0, start) + text + ta.value.substring(end);
          ta.selectionStart = ta.selectionEnd = start + text.length;
          onEditorInput(ta, path);
        }).catch(() => {
          // Fallback to execCommand
          document.execCommand('paste');
        });
      } else {
        // Fallback for older browsers
        document.execCommand('paste');
      }
      break;
    case 'selectAll':
      ta.select();
      break;
    case 'undo':
      _undo(ta, path);
      break;
    case 'redo':
      _redo(ta, path);
      break;
  }
}

// Hide editor context menu when clicking elsewhere
document.addEventListener('click', hideEditorCtxMenu);