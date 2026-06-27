// =================== FIND & REPLACE ===================
// js/find.js

function toggleFind(withReplace) {
  const bar = document.getElementById('find-bar');
  const replRow = document.getElementById('replace-row');
  if (!bar) return;
  if (bar.classList.contains('visible') && !withReplace) {
    closeFindBar(); return;
  }
  bar.classList.add('visible');
  state.findReplaceOpen = !!withReplace;
  if (replRow) replRow.style.display = withReplace ? '' : 'none';
  const input = document.getElementById('find-input');
  if (input) {
    // Pre-fill with selection if any
    const ta = getActiveTextarea();
    if (ta) {
      const sel = ta.value.substring(ta.selectionStart, ta.selectionEnd);
      if (sel) input.value = sel;
    }
    input.focus(); input.select();
    if (input.value) doFind(input.value);
  }
}

function closeFindBar() {
  document.getElementById('find-bar')?.classList.remove('visible');
  clearFindHighlights();
  state.findMatches = []; state.findIdx = 0;
  document.getElementById('find-count').textContent = '0 of 0';
}

function toggleFindCase() {
  state.findCase = !state.findCase;
  document.getElementById('find-case-btn').classList.toggle('active', state.findCase);
  doFind(document.getElementById('find-input').value);
}

function toggleFindRegex() {
  state.findRegex = !state.findRegex;
  document.getElementById('find-regex-btn').classList.toggle('active', state.findRegex);
  doFind(document.getElementById('find-input').value);
}

function doFind(query) {
  clearFindHighlights();
  state.findMatches = []; state.findIdx = 0;
  if (!query) { document.getElementById('find-count').textContent = '0 of 0'; return; }
  const ta = getActiveTextarea();
  if (!ta) return;
  const text = ta.value;
  let pattern;
  try {
    pattern = new RegExp(state.findRegex ? query : escapeRegex(query), state.findCase ? 'g' : 'gi');
  } catch(e) { document.getElementById('find-count').textContent = 'Invalid regex'; return; }
  let m;
  while ((m = pattern.exec(text)) !== null) {
    state.findMatches.push({ start: m.index, end: m.index + m[0].length });
    if (state.findMatches.length > 5000) break; // safety
  }
  document.getElementById('find-count').textContent = `${state.findMatches.length ? 1 : 0} of ${state.findMatches.length}`;
  if (state.findMatches.length) jumpToMatch(0);
}

function findNext() {
  if (!state.findMatches.length) return;
  state.findIdx = (state.findIdx + 1) % state.findMatches.length;
  jumpToMatch(state.findIdx);
}

function findPrev() {
  if (!state.findMatches.length) return;
  state.findIdx = (state.findIdx - 1 + state.findMatches.length) % state.findMatches.length;
  jumpToMatch(state.findIdx);
}

function findKeyNav(e) {
  if (e.key === 'Enter') { e.shiftKey ? findPrev() : findNext(); }
  if (e.key === 'Escape') closeFindBar();
}

function replaceKeyNav(e) {
  if (e.key === 'Enter') replaceOne();
  if (e.key === 'Escape') closeFindBar();
}

function jumpToMatch(idx) {
  const ta = getActiveTextarea();
  if (!ta || !state.findMatches[idx]) return;
  const match = state.findMatches[idx];
  ta.focus();
  ta.setSelectionRange(match.start, match.end);
  // Scroll match into view
  const linesAbove = ta.value.substring(0, match.start).split('\n').length - 1;
  ta.scrollTop = Math.max(0, linesAbove * 21 - ta.clientHeight / 2);
  // Sync scroll rail
  const railId = ta.id.replace(/^ta-/, 'rail-');
  updateScrollRail(railId, ta);
  document.getElementById('find-count').textContent = `${idx + 1} of ${state.findMatches.length}`;
}

function clearFindHighlights() {
  // Nothing visual to clear since we don't paint a separate layer for find here
}

function replaceOne() {
  const ta = getActiveTextarea();
  const query = document.getElementById('find-input')?.value;
  const replStr = document.getElementById('replace-input')?.value || '';
  if (!ta || !query) return;
  const match = state.findMatches[state.findIdx];
  if (!match) return;
  ta.value = ta.value.substring(0, match.start) + replStr + ta.value.substring(match.end);
  if (state.activeTab) onEditorInput(ta, state.activeTab);
  doFind(query);
}

function replaceAll() {
  const ta = getActiveTextarea();
  const query = document.getElementById('find-input')?.value;
  const replStr = document.getElementById('replace-input')?.value || '';
  if (!ta || !query) return;
  let pattern;
  try { pattern = new RegExp(state.findRegex ? query : escapeRegex(query), state.findCase ? 'g' : 'gi'); }
  catch(e) { return; }
  const count = (ta.value.match(pattern) || []).length;
  ta.value = ta.value.replace(pattern, replStr);
  if (state.activeTab) onEditorInput(ta, state.activeTab);
  notify(`Replaced ${count} occurrence(s)`);
  closeFindBar();
}

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
