
'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// OVERRIDE: lintFile — now async via Worker
// ─────────────────────────────────────────────────────────────────────────────
window.lintFile = async function(path) {
  if (!state.settings.linting) return;
  const file = state.files[path];
  if (!file || file.isImage) return;

  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const content = file.content || '';

  // JSON: synchronous (tiny)
  if (ext === 'json') {
    const problems = [];
    try { JSON.parse(content); }
    catch(e) { problems.push({ type: 'error', msg: 'JSON syntax error: ' + e.message, line: 1 }); }
    if (!state.problems) state.problems = {};
    state.problems[path] = problems;
    updateProblemsPanel();
    _renderDiagnosticGutter(path, problems);
    return;
  }

  // All other languages: delegate to worker
  let diags = [];
  try {
    diags = await WorkerBridge.lint({ code: content, ext });
  } catch(e) {
    return; // Worker unavailable, skip linting
  }

  // Convert worker format to internal format
  const problems = diags.map(d => ({
    type: d.severity === 'error' ? 'error' : d.severity === 'warning' ? 'warn' : 'info',
    msg: `Line ${d.line}: ${d.message}`,
    line: d.line,
    col: d.col,
  }));

  if (!state.problems) state.problems = {};
  state.problems[path] = problems;
  updateProblemsPanel();
  _renderDiagnosticGutter(path, problems);
};

// ─────────────────────────────────────────────────────────────────────────────
// DIAGNOSTIC GUTTER — line number area indicators (errors/warnings)
// ─────────────────────────────────────────────────────────────────────────────
function _renderDiagnosticGutter(path, problems) {
  const sid = safeId(path);
  const lnEl = document.getElementById('ln-' + sid);
  if (!lnEl) return;

  // Clear existing diagnostic markers
  lnEl.querySelectorAll('.diag-dot').forEach(d => d.remove());

  // Add dots to line number elements
  const children = lnEl.children;
  problems.forEach(p => {
    const lineIdx = (p.line || 1) - 1;
    if (lineIdx < 0 || lineIdx >= children.length) return;
    const dot = document.createElement('span');
    dot.className = 'diag-dot';
    dot.title = p.msg;
    dot.style.cssText = `
      position:absolute;left:0;width:3px;height:21px;
      background:${p.type==='error'?'var(--red)':p.type==='warn'?'var(--yellow)':'var(--accent)'};
      border-radius:0 2px 2px 0;pointer-events:auto;cursor:pointer;
    `;
    dot.onclick = () => notify(p.msg, p.type === 'error' ? 'error' : 'warn');
    const lnDiv = children[lineIdx];
    if (lnDiv) { lnDiv.style.position = 'relative'; lnDiv.appendChild(dot); }
  });

  // Update status bar problem count
  const errorCount = problems.filter(p => p.type === 'error').length;
  const warnCount = problems.filter(p => p.type === 'warn').length;
  const sbProbs = document.getElementById('sb-problems');
  if (sbProbs) {
    sbProbs.textContent = `⊗ ${errorCount}  ⚠ ${warnCount}`;
    sbProbs.style.color = errorCount > 0 ? 'var(--red)' : warnCount > 0 ? 'var(--yellow)' : 'var(--text-muted)';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// OVERRIDE: handleEditorKey — v4 with SnippetEngine integration
// ─────────────────────────────────────────────────────────────────────────────
window.handleEditorKey = function(e, path) {
  const ta = e.target;
  if (!ta) return;

  const taId = ta.id;

  // ── PRIORITY 0: Snippet Engine ──────────────────────────────────────────
  // Snippet engine gets first bite at Tab, Shift+Tab, Escape
  if (SnippetEngine.handleKey(e, taId)) return;

  // ── PRIORITY 1: Autocomplete navigation ─────────────────────────────────
  if (state.acVisible && acNavKey(e, ta, path)) return;

  // ── Undo / Redo ──────────────────────────────────────────────────────────
  if (e.ctrlKey && !e.shiftKey && e.key === 'z') { e.preventDefault(); _undo(ta, path); return; }
  if (e.ctrlKey && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); _redo(ta, path); return; }

  // ── Tab key ──────────────────────────────────────────────────────────────
  if (e.key === 'Tab' && !e.shiftKey) {
    const lang = state.files[path] ? getLangFromFile(state.files[path].name) : '';

    // 1. Emmet expand (HTML)
    if (state.settings.emmet && lang === 'html' && tryEmmetExpand(ta, path)) {
      e.preventDefault(); return;
    }

    // 2. Snippet expand (any language via prefix match)
    if (state.settings.emmet && SnippetEngine.expandPrefix(ta, path, ta.selectionStart)) {
      e.preventDefault();
      onEditorInput(ta, path);
      return;
    }

    // 3. Indent / dedent
    e.preventDefault();
    const start = ta.selectionStart, end = ta.selectionEnd;
    if (start !== end && ta.value.substring(start, end).includes('\n')) {
      // Multi-line indent
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
    onEditorInput(ta, path);
    return;
  }

  // Shift+Tab: dedent
  if (e.key === 'Tab' && e.shiftKey) {
    e.preventDefault();
    const start = ta.selectionStart;
    const lineStart = ta.value.lastIndexOf('\n', start - 1) + 1;
    const spaces = ' '.repeat(state.settings.tabSize);
    if (ta.value.substring(lineStart).startsWith(spaces)) {
      ta.value = ta.value.substring(0, lineStart) + ta.value.substring(lineStart + spaces.length);
      ta.selectionStart = ta.selectionEnd = Math.max(start - spaces.length, lineStart);
    }
    onEditorInput(ta, path);
    return;
  }

  // ── Command shortcuts ─────────────────────────────────────────────────────
  if (e.ctrlKey && e.key === 'g') { e.preventDefault(); goToLine(); return; }
  if (e.ctrlKey && e.shiftKey && e.key === 'M') { e.preventDefault(); toggleMarkdownPreview(); return; }
  if (e.ctrlKey && e.shiftKey && e.key === 'P') { e.preventDefault(); showCommandPalette(); return; }
  if (e.ctrlKey && e.key === 's') { e.preventDefault(); saveCurrentFile(); return; }
  if (e.ctrlKey && e.key === '/') { e.preventDefault(); commentToggle(); return; }
  if (e.ctrlKey && e.key === 'f') { e.preventDefault(); toggleFind(); return; }
  if (e.ctrlKey && e.key === 'h') { e.preventDefault(); toggleFind(true); return; }
  if (e.key === 'F5') { e.preventDefault(); runCode(); return; }
  if (e.ctrlKey && e.key === 'b') { e.preventDefault(); toggleSidebar(); return; }
  if (e.ctrlKey && e.key === '`') { e.preventDefault(); togglePanel(); return; }

  // ── Auto-pair brackets ────────────────────────────────────────────────────
  const pairs = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`' };
  if (pairs[e.key] && !e.ctrlKey) {
    const start = ta.selectionStart, end = ta.selectionEnd;
    e.preventDefault();
    const selected = ta.value.substring(start, end);
    ta.value = ta.value.substring(0, start) + e.key + selected + pairs[e.key] + ta.value.substring(end);
    ta.selectionStart = start + 1; ta.selectionEnd = end + 1;
    onEditorInput(ta, path);
    return;
  }

  // Skip closing bracket if next char already has it
  if (Object.values(pairs).includes(e.key) && !e.ctrlKey) {
    const pos = ta.selectionStart;
    if (ta.value[pos] === e.key && ta.selectionStart === ta.selectionEnd) {
      e.preventDefault();
      ta.selectionStart = ta.selectionEnd = pos + 1;
      return;
    }
  }

  // ── Smart Enter ───────────────────────────────────────────────────────────
  if (e.key === 'Enter') {
    e.preventDefault();
    const start = ta.selectionStart;
    const lineStart = ta.value.lastIndexOf('\n', start - 1) + 1;
    const line = ta.value.substring(lineStart, start);
    const indent = line.match(/^(\s*)/)[1];
    const charBefore = ta.value[start - 1];
    const charAfter = ta.value[start];
    const extra = ['{', '[', '('].includes(charBefore) ? ' '.repeat(state.settings.tabSize) : '';
    const closing = (charBefore === '{' && charAfter === '}') || (charBefore === '[' && charAfter === ']') || (charBefore === '(' && charAfter === ')')
      ? '\n' + indent : '';
    const insert = '\n' + indent + extra;
    ta.value = ta.value.substring(0, start) + insert + closing + ta.value.substring(ta.selectionEnd);
    ta.selectionStart = ta.selectionEnd = start + insert.length;
    onEditorInput(ta, path);
    return;
  }

  // ── Smart Backspace (delete pairs) ───────────────────────────────────────
  if (e.key === 'Backspace') {
    const pos = ta.selectionStart;
    if (ta.selectionStart === ta.selectionEnd) {
      const charBefore = ta.value[pos - 1];
      const charAfter = ta.value[pos];
      const pairs2 = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`' };
      if (pairs2[charBefore] && pairs2[charBefore] === charAfter) {
        e.preventDefault();
        ta.value = ta.value.substring(0, pos - 1) + ta.value.substring(pos + 1);
        ta.selectionStart = ta.selectionEnd = pos - 1;
        onEditorInput(ta, path);
        return;
      }
    }
  }

  // ── Arrow keys: bracket highlight, backdrop update ────────────────────────
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
    setTimeout(() => _highlightBrackets(ta), 0);
  }

  if (ta.id) setTimeout(() => updateHlBackdrop(ta.id, path), 0);
  if (ta) updateSelectionCount(ta);
};

// ─────────────────────────────────────────────────────────────────────────────
// OVERRIDE: onEditorInput — faster timers, RAF-batched
// ─────────────────────────────────────────────────────────────────────────────
const _v4InputRaf = {};
let v4InputTimer = null;

window.onEditorInput = function(ta, path, skipUndo = false) {
  if (v4InputTimer) cancelAnimationFrame(v4InputTimer);
  v4InputTimer = requestAnimationFrame(() => _handleEditorInputV4(ta, path, skipUndo));
};

function _handleEditorInputV4(ta, path, skipUndo = false) {
  const file = state.files[path];
  if (!file) return;
  file.content = ta.value;
  file.modified = !state.settings.autoSave;

  if (!skipUndo) {
    clearTimeout(ta._undoTimer);
    ta._undoTimer = setTimeout(() => _pushUndo(path, ta.value, ta.selectionStart, ta.selectionEnd), 300);
  }

  // Batch DOM updates via RAF (prevents layout thrash on every keystroke)
  if (!_v4InputRaf[path]) {
    _v4InputRaf[path] = requestAnimationFrame(() => {
      delete _v4InputRaf[path];
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

  // Lint: 500ms debounce (was 700ms)
  clearTimeout(ta._lintTimer);
  ta._lintTimer = setTimeout(() => lintFile(path), 500);

  // Autocomplete: 80ms debounce via new engine
  clearTimeout(ta._acTimer);
  ta._acTimer = setTimeout(() => triggerAutocomplete(ta, path), 80);

  if (state.mdPreviewVisible && path && path.endsWith('.md')) updateMdPreview(path);
  updateSelectionCount(ta);
}

// ─────────────────────────────────────────────────────────────────────────────
// STATUS BAR: Worker status indicator
// ─────────────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Show worker availability in status bar
  setTimeout(() => {
    const sbStorage = document.getElementById('sb-storage');
    if (sbStorage) {
      const workerStatus = WorkerBridge.isAvailable() ? 'Worker ✓' : 'Worker ✗';
      // Don't override IDB status - append instead
      sbStorage.title = `Storage: IndexedDB | ${workerStatus}`;
    }
  }, 500);
}, { once: true });
