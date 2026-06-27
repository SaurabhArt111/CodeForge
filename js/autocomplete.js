/**
 * CodeForge Autocomplete Engine v4.0
 * Multi-source: Worker(snippets + keywords + scope vars) → 80ms debounce → DOM update
 */
'use strict';

let _acDebounceTimer = null;
let _acReqVersion = 0;
let _acLastWord = '';
let _acListEl = null;
const _suggestCache = new Map();
const _CACHE_MAX = 200;
window._SNIPPET_DB_CACHE = {};

const KIND_META = {
  snippet: { icon: '⚡', color: '#f0c674', label: 'snip' },
  fn: { icon: 'ƒ', color: '#61afef', label: 'func' },
  kw: { icon: '⬡', color: '#c678dd', label: 'kw' },
  prop: { icon: '●', color: '#56b6c2', label: 'prop' },
  attr: { icon: '◈', color: '#98c379', label: 'attr' },
  tag: { icon: '<>', color: '#e06c75', label: 'tag' },
  var: { icon: '◍', color: '#d19a66', label: 'var' },
  default: { icon: '·', color: '#abb2bf', label: '···' },
};

function triggerAutocomplete(ta, path) {
  if (!state.settings.autocomplete) return;
  clearTimeout(_acDebounceTimer);
  _acDebounceTimer = setTimeout(() => _requestSuggestions(ta, path), 80);
}

async function _requestSuggestions(ta, path) {
  if (!ta || !document.contains(ta)) return;
  const pos = ta.selectionStart;
  const before = ta.value.substring(0, pos);
  const wordMatch = before.match(/[\w.$@:-]+$/);
  if (!wordMatch || wordMatch[0].length < 1) { hideAutocomplete(); return; }
  const word = wordMatch[0];
  if (word === _acLastWord && state.acVisible) return;
  _acLastWord = word;
  const file = state.files[path];
  if (!file) { hideAutocomplete(); return; }
  const ext = file.name.split('.').pop().toLowerCase();
  const cacheKey = `${ext}:${word}`;
  const version = ++_acReqVersion;
  const cached = _suggestCache.get(cacheKey);
  if (cached && cached.length > 0) _renderSuggestions(ta, cached);

  let items;
  try {
    items = await WorkerBridge.suggest({ code: ta.value, word, ext, path, version: ta.value.length });
  } catch (e) { return; }

  if (version !== _acReqVersion) return;
  if (!items || !items.length) { hideAutocomplete(); return; }

  _suggestCache.set(cacheKey, items);
  if (_suggestCache.size > _CACHE_MAX) _suggestCache.delete(_suggestCache.keys().next().value);
  if (!window._SNIPPET_DB_CACHE[ext]) {
    window._SNIPPET_DB_CACHE[ext] = items.filter(i => i.kind === 'snippet' && i.snippet).map(i => i.snippet);
  }
  _renderSuggestions(ta, items);
}

function _renderSuggestions(ta, items) {
  if (!items.length) { hideAutocomplete(); return; }
  _acListEl = _acListEl || document.getElementById('autocomplete-list');
  if (!_acListEl) return;
  state.acItems = items; state.acIdx = 0;

  const rect = ta.getBoundingClientRect();
  const pos = ta.selectionStart;
  const before = ta.value.substring(0, pos);
  const lines = before.split('\n');
  const lineCount = lines.length;
  const currentLineText = lines[lineCount - 1];
  const fontSize = parseFloat(getComputedStyle(ta).fontSize) || 14;
  const charW = fontSize * 0.601;
  const lineH = Math.round(fontSize * 1.5);
  const approxX = rect.left + 46 + (currentLineText.length * charW);
  const approxY = rect.top + (lineCount * lineH) - ta.scrollTop + 2;
  const menuW = 340;
  const menuH = Math.min(items.length * 36 + 8, 400);
  const left = Math.min(approxX, window.innerWidth - menuW - 8);
  const top = approxY + menuH > window.innerHeight - 8 ? approxY - menuH - lineH : approxY;

  _acListEl.style.cssText = `left:${left}px;top:${top}px;display:block;`;

  const children = _acListEl.children;
  const needed = items.length;
  while (_acListEl.childElementCount < needed) {
    const div = document.createElement('div');
    div.className = 'ac-item';
    _acListEl.appendChild(div);
  }
  while (_acListEl.childElementCount > needed) _acListEl.removeChild(_acListEl.lastChild);

  const word = _acLastWord;
  for (let i = 0; i < needed; i++) {
    const item = items[i];
    const el = children[i];
    const meta = KIND_META[item.kind] || KIND_META.default;
    el.dataset.idx = i;
    el.classList.toggle('active', i === 0);
    el.innerHTML = `<span class="ac-icon" style="color:${meta.color}">${meta.icon}</span><span class="ac-label">${_hlMatch(item.label, word)}</span>${item.detail ? `<span class="ac-detail">${_esc(item.detail.substring(0, 50))}</span>` : ''}<span class="ac-kind-badge ac-kind-${item.kind}">${item.kind === 'snippet' ? '⚡' : meta.label}</span>`;
    el.onmousedown = (e) => { e.preventDefault(); applyAutoComplete(i); };
  }
  _acListEl.classList.add('visible');
  state.acVisible = true;
}

function _hlMatch(label, query) {
  if (!query) return _esc(label);
  const q = query.toLowerCase(), l = label.toLowerCase();
  let result = '', qi = 0;
  for (let i = 0; i < label.length; i++) {
    if (qi < q.length && l[i] === q[qi]) { result += `<span class="ac-match">${_esc(label[i])}</span>`; qi++; }
    else result += _esc(label[i]);
  }
  return result;
}

function _esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function hideAutocomplete() {
  _acLastWord = ''; _acReqVersion++;
  if (_acListEl) _acListEl.classList.remove('visible');
  else document.getElementById('autocomplete-list')?.classList.remove('visible');
  state.acVisible = false; state.acItems = [];
}

function applyAutoComplete(idx) {
  const ta = getActiveTextarea();
  if (!ta) return;
  const item = state.acItems?.[idx];
  if (!item) return;
  const pos = ta.selectionStart;
  const before = ta.value.substring(0, pos);
  const wordMatch = before.match(/[\w.$@:-]+$/);
  if (!wordMatch) return;
  const word = wordMatch[0];
  hideAutocomplete();

  if (item.kind === 'snippet' && item.snippet) {
    const parsed = _parseSnippetSync(item.snippet.body);
    SnippetEngine.insert(ta, parsed, pos, word.length);
    if (state.activeTab) onEditorInput(ta, state.activeTab);
  } else {
    const start = pos - word.length;
    ta.value = ta.value.substring(0, start) + item.label + ta.value.substring(pos);
    ta.selectionStart = ta.selectionEnd = start + item.label.length;
    if (state.activeTab) onEditorInput(ta, state.activeTab);
  }
  ta.focus();
}

function acNavKey(e, ta, path) {
  if (!state.acVisible) return false;
  const list = _acListEl || document.getElementById('autocomplete-list');
  if (e.key === 'ArrowDown') { e.preventDefault(); state.acIdx = (state.acIdx + 1) % state.acItems.length; _updateActive(list); return true; }
  if (e.key === 'ArrowUp') { e.preventDefault(); state.acIdx = (state.acIdx - 1 + state.acItems.length) % state.acItems.length; _updateActive(list); return true; }
  if (e.key === 'Enter') { e.preventDefault(); applyAutoComplete(state.acIdx); return true; }
  if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); applyAutoComplete(state.acIdx); return true; }
  if (e.key === 'Escape') { hideAutocomplete(); return true; }
  return false;
}

function _updateActive(list) {
  if (!list) return;
  list.querySelectorAll('.ac-item').forEach((el, i) => { el.classList.toggle('active', i === state.acIdx); if (i === state.acIdx) el.scrollIntoView({ block: 'nearest' }); });
}

// ── EMMET ─────────────────────────────────────────────────────────────────────
const EMMET_MAP = {
  '!': ['<!DOCTYPE html>', '<html lang="${1:en}">', '<head>', '  <meta charset="UTF-8">', '  <meta name="viewport" content="width=device-width, initial-scale=1.0">', '  <title>${2:Document}</title>', '</head>', '<body>', '  $0', '</body>', '</html>'],
  'a': ['<a href="${1:#}">$0</a>'], 'article': ['<article>', '  $0', '</article>'],
  'aside': ['<aside>', '  $0', '</aside>'], 'audio': ['<audio controls>', '  <source src="${1}" type="audio/mpeg">', '</audio>'],
  'b': ['<b>$0</b>'], 'btn': ['<button type="${1:button}">$0</button>'],
  'button': ['<button type="${1:button}">$0</button>'], 'c': ['<!-- $0 -->'],
  'code': ['<code>$0</code>'], 'div': ['<div>$0</div>'],
  'div.container': ['<div class="container">', '  $0', '</div>'],
  'em': ['<em>$0</em>'], 'footer': ['<footer>', '  $0', '</footer>'],
  'form': ['<form action="${1}" method="${2:post}">', '  $0', '  <button type="submit">Submit</button>', '</form>'],
  'h1': ['<h1>$0</h1>'], 'h2': ['<h2>$0</h2>'], 'h3': ['<h3>$0</h3>'],
  'header': ['<header>', '  $0', '</header>'], 'hr': ['<hr>'],
  'i': ['<i>$0</i>'], 'img': ['<img src="${1}" alt="${2}">'],
  'inp': ['<input type="${1:text}" name="${2}" id="${3}" placeholder="${4}">'],
  'input': ['<input type="${1:text}" name="${2}" id="${3}" placeholder="${4}">'],
  'input:email': ['<input type="email" name="${1}" placeholder="${2:Email}">'],
  'input:password': ['<input type="password" name="${1}" placeholder="${2:Password}">'],
  'label': ['<label for="${1}">$0</label>'], 'li': ['<li>$0</li>'],
  'link': ['<link rel="stylesheet" href="${1:style.css}">'],
  'link:css': ['<link rel="stylesheet" href="${1:style.css}">'],
  'main': ['<main>', '  $0', '</main>'], 'meta': ['<meta name="${1}" content="${2}">'],
  'meta:charset': ['<meta charset="UTF-8">'],
  'meta:vp': ['<meta name="viewport" content="width=device-width, initial-scale=1.0">'],
  'nav': ['<nav>', '  <ul>', '    <li><a href="${1:#}">$0</a></li>', '  </ul>', '</nav>'],
  'ol': ['<ol>', '  <li>$0</li>', '</ol>'], 'p': ['<p>$0</p>'],
  'pre': ['<pre>$0</pre>'], 'script': ['<script src="${1}"></script>'],
  'section': ['<section>', '  <h2>${1:Heading}</h2>', '  $0', '</section>'],
  'select': ['<select name="${1}" id="${2}">', '  <option value="${3}">$0</option>', '</select>'],
  'span': ['<span>$0</span>'], 'strong': ['<strong>$0</strong>'],
  'style': ['<style>', '  $0', '</style>'],
  'table': ['<table>', '  <thead>', '    <tr><th>${1:Header}</th></tr>', '  </thead>', '  <tbody>', '    <tr><td>$0</td></tr>', '  </tbody>', '</table>'],
  'textarea': ['<textarea name="${1}" rows="${2:4}">$0</textarea>'],
  'tr': ['<tr>', '  <td>$0</td>', '</tr>'],
  'ul': ['<ul>', '  <li>$0</li>', '</ul>'],
  'video': ['<video width="${1:320}" height="${2:240}" controls>', '  <source src="${3}" type="video/mp4">', '</video>'],
};

function tryEmmetExpand(ta, path) {
  const pos = ta.selectionStart;
  const lineStart = ta.value.lastIndexOf('\n', pos - 1) + 1;
  const line = ta.value.substring(lineStart, pos);
  const abbr = line.trimStart();
  if (!abbr) return false;
  const indent = line.match(/^(\s*)/)[1];
  const bodyLines = EMMET_MAP[abbr] || _expandSimpleEmmet(abbr);
  if (!bodyLines) return false;
  const parsed = _parseSnippetSync(bodyLines);
  const indentedText = parsed.text.split('\n').map((l, i) => i === 0 ? l : indent + l).join('\n');
  const indentAdj = parsed.tabStops.map(stop => {
    const linesBefore = parsed.text.substring(0, stop.start).split('\n').length - 1;
    return { ...stop, start: stop.start + linesBefore * indent.length, end: stop.end + linesBefore * indent.length };
  });
  const insertAt = lineStart + indent.length;
  ta.value = ta.value.substring(0, lineStart) + indent + indentedText + ta.value.substring(pos);
  if (indentAdj.length > 0) {
    SnippetEngine._sessions.delete(ta.id);
    const session = new SnippetSession(ta, { text: indentedText, tabStops: indentAdj }, insertAt, abbr.length + indent.length);
    SnippetEngine._sessions.set(ta.id, session);
  } else {
    ta.setSelectionRange(insertAt + indentedText.length, insertAt + indentedText.length);
  }
  if (state.activeTab) onEditorInput(ta, state.activeTab);
  hideAutocomplete();
  const hint = document.getElementById('emmet-hint');
  if (hint) { hint.textContent = `Emmet: ${abbr}`; hint.style.display = 'block'; setTimeout(() => { hint.style.display = 'none'; }, 1500); }
  return true;
}

function _expandSimpleEmmet(abbr) {
  const m = abbr.match(/^([a-z][a-z0-9]*)(?:\.([a-zA-Z0-9_-]*))?(?:#([a-zA-Z0-9_-]*))?(?:\*(\d+))?$/);
  if (!m) return null;
  const tag = m[1], cls = m[2] ? ` class="${m[2]}"` : '', id = m[3] ? ` id="${m[3]}"` : '', count = parseInt(m[4] || '1');
  const voids = new Set(['br', 'hr', 'img', 'input', 'link', 'meta']);
  const line = voids.has(tag) ? `<${tag}${cls}${id}>` : `<${tag}${cls}${id}>$0</${tag}>`;
  if (count === 1) return [line];
  return Array.from({ length: count }, (_, i) => `<${tag}${cls}${id}>$${i + 1 === count ? 0 : i + 1}</${tag}>`);
}

document.addEventListener('click', e => { if (!e.target.closest('#autocomplete-list')) hideAutocomplete(); }, true);
