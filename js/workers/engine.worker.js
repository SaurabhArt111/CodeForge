/**
 * CodeForge Engine Worker v4.0
 * ─────────────────────────────────────────────────────────────────────────────
 * ALL heavy computation runs here — NEVER on the UI thread.
 * Architecture:
 *   UI Thread  →  postMessage({ type, id, payload })  →  Worker
 *   Worker     →  postMessage({ type, id, result })   →  UI Thread
 *
 * Message types handled:
 *   SUGGEST       — multi-source autocomplete (keyword + snippet + scope)
 *   LINT          — static analysis / diagnostics
 *   PARSE_SCOPE   — extract symbols / identifiers from document
 *   SNIPPET_PARSE — parse VSCode-format snippet string into tab-stop AST
 *   FUZZY_RANK    — rank a suggestion list by fuzzy score
 *   FORMAT        — basic code formatting (indentation normaliser)
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// FUZZY MATCH ENGINE
// Uses a Smith-Waterman-inspired scoring that rewards:
//   • consecutive character runs  (strong signal)
//   • start-of-word matches       (medium signal)
//   • exact prefix                (strongest signal)
// Returns 0..1 float. 0 = no match, 1 = perfect.
// ─────────────────────────────────────────────────────────────────────────────
function fuzzyScore(query, target) {
  if (!query) return 0.5;
  const q = query.toLowerCase();
  const t = target.toLowerCase();

  if (t === q) return 1.0;
  if (t.startsWith(q)) return 0.95;
  if (t.includes(q)) return 0.85;

  // Character-by-character fuzzy
  let qi = 0, score = 0, lastMatchIdx = -1, consecutive = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      consecutive = lastMatchIdx === ti - 1 ? consecutive + 1 : 1;
      score += consecutive * 2; // bonus for runs
      if (ti === 0 || t[ti - 1] === '.' || t[ti - 1] === '_' || t[ti - 1] === '-') score += 3; // word boundary
      lastMatchIdx = ti;
      qi++;
    }
  }
  if (qi < q.length) return 0; // not all chars matched
  return Math.min(0.8, score / (q.length * 4));
}

// ─────────────────────────────────────────────────────────────────────────────
// SCOPE ANALYSER  — lightweight regex-based symbol extractor
// Runs on changed document; produces identifiers usable in suggest.
// Incremental: only re-scans lines that changed (caller sends dirty range).
// ─────────────────────────────────────────────────────────────────────────────
const _scopeCache = new Map(); // path → { symbols: Set<string>, version: number }

function parseScope(code, path, version) {
  const cached = _scopeCache.get(path);
  if (cached && cached.version === version) return cached.symbols;

  const symbols = new Set();
  // Variables / functions declared in JS
  const declRe = /(?:const|let|var|function|class)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g;
  let m;
  while ((m = declRe.exec(code)) !== null) symbols.add(m[1]);
  // Object property access  (foo.bar → bar)
  const propRe = /\.([A-Za-z_$][A-Za-z0-9_$]+)\s*(?:\(|[=;,\n])/g;
  while ((m = propRe.exec(code)) !== null) symbols.add(m[1]);
  // CSS class names from HTML class="..."
  const classRe = /class=["']([^"']+)["']/g;
  while ((m = classRe.exec(code)) !== null) m[1].split(/\s+/).forEach(c => symbols.add('.' + c));

  _scopeCache.set(path, { symbols, version });
  return symbols;
}

// ─────────────────────────────────────────────────────────────────────────────
// STATIC KEYWORD DATABASES  (same as before, kept in worker)
// ─────────────────────────────────────────────────────────────────────────────
const KEYWORDS = {
  js: [
    { label: 'console.log', kind: 'fn', detail: 'log(message)' },
    { label: 'console.error', kind: 'fn', detail: 'error(message)' },
    { label: 'console.warn', kind: 'fn', detail: 'warn(message)' },
    { label: 'console.table', kind: 'fn', detail: 'table(data)' },
    { label: 'document.getElementById', kind: 'fn', detail: 'getElementById(id): HTMLElement' },
    { label: 'document.querySelector', kind: 'fn', detail: 'querySelector(selector): Element' },
    { label: 'document.querySelectorAll', kind: 'fn', detail: 'querySelectorAll(selector): NodeList' },
    { label: 'document.createElement', kind: 'fn', detail: 'createElement(tag): HTMLElement' },
    { label: 'addEventListener', kind: 'fn', detail: 'addEventListener(event, handler)' },
    { label: 'removeEventListener', kind: 'fn', detail: 'removeEventListener(event, handler)' },
    { label: 'setTimeout', kind: 'fn', detail: 'setTimeout(fn, ms): number' },
    { label: 'setInterval', kind: 'fn', detail: 'setInterval(fn, ms): number' },
    { label: 'clearTimeout', kind: 'fn', detail: 'clearTimeout(id)' },
    { label: 'clearInterval', kind: 'fn', detail: 'clearInterval(id)' },
    { label: 'requestAnimationFrame', kind: 'fn', detail: 'requestAnimationFrame(fn): number' },
    { label: 'cancelAnimationFrame', kind: 'fn', detail: 'cancelAnimationFrame(id)' },
    { label: 'fetch', kind: 'fn', detail: 'fetch(url, init?): Promise<Response>' },
    { label: 'Promise.all', kind: 'fn', detail: 'Promise.all(promises): Promise' },
    { label: 'Promise.resolve', kind: 'fn', detail: 'Promise.resolve(value): Promise' },
    { label: 'Promise.reject', kind: 'fn', detail: 'Promise.reject(reason): Promise' },
    { label: 'JSON.stringify', kind: 'fn', detail: 'JSON.stringify(value, replacer?, space?): string' },
    { label: 'JSON.parse', kind: 'fn', detail: 'JSON.parse(text): any' },
    { label: 'Object.keys', kind: 'fn', detail: 'Object.keys(obj): string[]' },
    { label: 'Object.values', kind: 'fn', detail: 'Object.values(obj): any[]' },
    { label: 'Object.entries', kind: 'fn', detail: 'Object.entries(obj): [string, any][]' },
    { label: 'Object.assign', kind: 'fn', detail: 'Object.assign(target, ...sources)' },
    { label: 'Array.from', kind: 'fn', detail: 'Array.from(iterable): any[]' },
    { label: 'Array.isArray', kind: 'fn', detail: 'Array.isArray(value): boolean' },
    { label: 'Math.floor', kind: 'fn', detail: 'Math.floor(x): number' },
    { label: 'Math.ceil', kind: 'fn', detail: 'Math.ceil(x): number' },
    { label: 'Math.round', kind: 'fn', detail: 'Math.round(x): number' },
    { label: 'Math.random', kind: 'fn', detail: 'Math.random(): number [0, 1)' },
    { label: 'Math.max', kind: 'fn', detail: 'Math.max(...values): number' },
    { label: 'Math.min', kind: 'fn', detail: 'Math.min(...values): number' },
    { label: 'Math.abs', kind: 'fn', detail: 'Math.abs(x): number' },
    { label: 'Math.sqrt', kind: 'fn', detail: 'Math.sqrt(x): number' },
    { label: 'parseInt', kind: 'fn', detail: 'parseInt(string, radix?): number' },
    { label: 'parseFloat', kind: 'fn', detail: 'parseFloat(string): number' },
    { label: 'isNaN', kind: 'fn', detail: 'isNaN(value): boolean' },
    { label: 'const', kind: 'kw' }, { label: 'let', kind: 'kw' }, { label: 'var', kind: 'kw' },
    { label: 'function', kind: 'kw' }, { label: 'return', kind: 'kw' }, { label: 'if', kind: 'kw' },
    { label: 'else', kind: 'kw' }, { label: 'for', kind: 'kw' }, { label: 'while', kind: 'kw' },
    { label: 'do', kind: 'kw' }, { label: 'switch', kind: 'kw' }, { label: 'case', kind: 'kw' },
    { label: 'break', kind: 'kw' }, { label: 'continue', kind: 'kw' }, { label: 'class', kind: 'kw' },
    { label: 'extends', kind: 'kw' }, { label: 'super', kind: 'kw' }, { label: 'this', kind: 'kw' },
    { label: 'import', kind: 'kw' }, { label: 'export', kind: 'kw' }, { label: 'default', kind: 'kw' },
    { label: 'async', kind: 'kw' }, { label: 'await', kind: 'kw' }, { label: 'try', kind: 'kw' },
    { label: 'catch', kind: 'kw' }, { label: 'finally', kind: 'kw' }, { label: 'throw', kind: 'kw' },
    { label: 'new', kind: 'kw' }, { label: 'delete', kind: 'kw' }, { label: 'typeof', kind: 'kw' },
    { label: 'instanceof', kind: 'kw' }, { label: 'void', kind: 'kw' }, { label: 'in', kind: 'kw' },
    { label: 'of', kind: 'kw' }, { label: 'true', kind: 'kw' }, { label: 'false', kind: 'kw' },
    { label: 'null', kind: 'kw' }, { label: 'undefined', kind: 'kw' }, { label: 'NaN', kind: 'kw' },
    { label: 'Infinity', kind: 'kw' },
    { label: 'innerHTML', kind: 'prop' }, { label: 'textContent', kind: 'prop' },
    { label: 'className', kind: 'prop' }, { label: 'classList', kind: 'prop' },
    { label: 'style', kind: 'prop' }, { label: 'value', kind: 'prop' }, { label: 'length', kind: 'prop' },
    { label: 'parentNode', kind: 'prop' }, { label: 'parentElement', kind: 'prop' },
    { label: 'children', kind: 'prop' }, { label: 'dataset', kind: 'prop' },
    { label: 'getAttribute', kind: 'fn', detail: 'getAttribute(name): string' },
    { label: 'setAttribute', kind: 'fn', detail: 'setAttribute(name, value)' },
    { label: 'removeAttribute', kind: 'fn', detail: 'removeAttribute(name)' },
    { label: 'appendChild', kind: 'fn', detail: 'appendChild(node): Node' },
    { label: 'removeChild', kind: 'fn', detail: 'removeChild(node): Node' },
    { label: 'insertBefore', kind: 'fn', detail: 'insertBefore(newNode, refNode): Node' },
    { label: 'cloneNode', kind: 'fn', detail: 'cloneNode(deep?): Node' },
    { label: 'closest', kind: 'fn', detail: 'closest(selector): Element' },
    { label: 'matches', kind: 'fn', detail: 'matches(selector): boolean' },
    { label: 'forEach', kind: 'fn', detail: 'forEach(callback)' },
    { label: 'map', kind: 'fn', detail: 'map(fn): any[]' },
    { label: 'filter', kind: 'fn', detail: 'filter(fn): any[]' },
    { label: 'reduce', kind: 'fn', detail: 'reduce(fn, init): any' },
    { label: 'find', kind: 'fn', detail: 'find(fn): any' },
    { label: 'findIndex', kind: 'fn', detail: 'findIndex(fn): number' },
    { label: 'some', kind: 'fn', detail: 'some(fn): boolean' },
    { label: 'every', kind: 'fn', detail: 'every(fn): boolean' },
    { label: 'includes', kind: 'fn', detail: 'includes(value): boolean' },
    { label: 'indexOf', kind: 'fn', detail: 'indexOf(value): number' },
    { label: 'slice', kind: 'fn', detail: 'slice(start, end?): any[]' },
    { label: 'splice', kind: 'fn', detail: 'splice(start, deleteCount, ...items)' },
    { label: 'push', kind: 'fn', detail: 'push(...items): number' },
    { label: 'pop', kind: 'fn', detail: 'pop(): any' },
    { label: 'shift', kind: 'fn', detail: 'shift(): any' },
    { label: 'unshift', kind: 'fn', detail: 'unshift(...items): number' },
    { label: 'join', kind: 'fn', detail: 'join(separator?): string' },
    { label: 'split', kind: 'fn', detail: 'split(separator): string[]' },
    { label: 'replace', kind: 'fn', detail: 'replace(search, replacement): string' },
    { label: 'replaceAll', kind: 'fn', detail: 'replaceAll(search, replacement): string' },
    { label: 'trim', kind: 'fn', detail: 'trim(): string' },
    { label: 'trimStart', kind: 'fn', detail: 'trimStart(): string' },
    { label: 'trimEnd', kind: 'fn', detail: 'trimEnd(): string' },
    { label: 'toLowerCase', kind: 'fn', detail: 'toLowerCase(): string' },
    { label: 'toUpperCase', kind: 'fn', detail: 'toUpperCase(): string' },
    { label: 'startsWith', kind: 'fn', detail: 'startsWith(prefix): boolean' },
    { label: 'endsWith', kind: 'fn', detail: 'endsWith(suffix): boolean' },
    { label: 'padStart', kind: 'fn', detail: 'padStart(length, fill?): string' },
    { label: 'padEnd', kind: 'fn', detail: 'padEnd(length, fill?): string' },
    { label: 'repeat', kind: 'fn', detail: 'repeat(count): string' },
    { label: 'charAt', kind: 'fn', detail: 'charAt(index): string' },
    { label: 'charCodeAt', kind: 'fn', detail: 'charCodeAt(index): number' },
    { label: 'window', kind: 'prop' }, { label: 'document', kind: 'prop' },
    { label: 'navigator', kind: 'prop' }, { label: 'location', kind: 'prop' },
    { label: 'history', kind: 'prop' }, { label: 'localStorage', kind: 'prop' },
    { label: 'sessionStorage', kind: 'prop' }, { label: 'performance', kind: 'prop' },
  ],
  html: [
    { label: 'html', kind: 'tag' }, { label: 'head', kind: 'tag' }, { label: 'body', kind: 'tag' },
    { label: 'div', kind: 'tag' }, { label: 'span', kind: 'tag' }, { label: 'p', kind: 'tag' },
    { label: 'a', kind: 'tag' }, { label: 'button', kind: 'tag' }, { label: 'input', kind: 'tag' },
    { label: 'form', kind: 'tag' }, { label: 'ul', kind: 'tag' }, { label: 'ol', kind: 'tag' },
    { label: 'li', kind: 'tag' }, { label: 'h1', kind: 'tag' }, { label: 'h2', kind: 'tag' },
    { label: 'h3', kind: 'tag' }, { label: 'h4', kind: 'tag' }, { label: 'h5', kind: 'tag' },
    { label: 'header', kind: 'tag' }, { label: 'footer', kind: 'tag' }, { label: 'nav', kind: 'tag' },
    { label: 'section', kind: 'tag' }, { label: 'article', kind: 'tag' }, { label: 'main', kind: 'tag' },
    { label: 'aside', kind: 'tag' }, { label: 'table', kind: 'tag' }, { label: 'tr', kind: 'tag' },
    { label: 'td', kind: 'tag' }, { label: 'th', kind: 'tag' }, { label: 'thead', kind: 'tag' },
    { label: 'tbody', kind: 'tag' }, { label: 'select', kind: 'tag' }, { label: 'option', kind: 'tag' },
    { label: 'textarea', kind: 'tag' }, { label: 'label', kind: 'tag' }, { label: 'img', kind: 'tag' },
    { label: 'video', kind: 'tag' }, { label: 'audio', kind: 'tag' }, { label: 'canvas', kind: 'tag' },
    { label: 'script', kind: 'tag' }, { label: 'link', kind: 'tag' }, { label: 'meta', kind: 'tag' },
    { label: 'style', kind: 'tag' }, { label: 'iframe', kind: 'tag' }, { label: 'figure', kind: 'tag' },
    { label: 'figcaption', kind: 'tag' }, { label: 'blockquote', kind: 'tag' },
    { label: 'details', kind: 'tag' }, { label: 'summary', kind: 'tag' },
    { label: 'dialog', kind: 'tag' }, { label: 'template', kind: 'tag' },
    { label: 'slot', kind: 'tag' }, { label: 'code', kind: 'tag' }, { label: 'pre', kind: 'tag' },
    { label: 'strong', kind: 'tag' }, { label: 'em', kind: 'tag' }, { label: 'small', kind: 'tag' },
    { label: 'mark', kind: 'tag' }, { label: 'del', kind: 'tag' }, { label: 'ins', kind: 'tag' },
    { label: 'class', kind: 'attr' }, { label: 'id', kind: 'attr' }, { label: 'href', kind: 'attr' },
    { label: 'src', kind: 'attr' }, { label: 'alt', kind: 'attr' }, { label: 'type', kind: 'attr' },
    { label: 'placeholder', kind: 'attr' }, { label: 'name', kind: 'attr' }, { label: 'value', kind: 'attr' },
    { label: 'disabled', kind: 'attr' }, { label: 'checked', kind: 'attr' }, { label: 'selected', kind: 'attr' },
    { label: 'readonly', kind: 'attr' }, { label: 'required', kind: 'attr' }, { label: 'multiple', kind: 'attr' },
    { label: 'action', kind: 'attr' }, { label: 'method', kind: 'attr' }, { label: 'target', kind: 'attr' },
    { label: 'rel', kind: 'attr' }, { label: 'charset', kind: 'attr' }, { label: 'content', kind: 'attr' },
    { label: 'style', kind: 'attr' }, { label: 'data-', kind: 'attr' }, { label: 'aria-label', kind: 'attr' },
    { label: 'aria-hidden', kind: 'attr' }, { label: 'role', kind: 'attr' },
    { label: 'tabindex', kind: 'attr' }, { label: 'title', kind: 'attr' }, { label: 'lang', kind: 'attr' },
  ],
  css: [
    { label: 'display', kind: 'prop', detail: 'block | inline | flex | grid | none' },
    { label: 'position', kind: 'prop', detail: 'static | relative | absolute | fixed | sticky' },
    { label: 'flex', kind: 'prop' }, { label: 'flex-direction', kind: 'prop', detail: 'row | column | row-reverse | column-reverse' },
    { label: 'flex-wrap', kind: 'prop', detail: 'nowrap | wrap | wrap-reverse' },
    { label: 'align-items', kind: 'prop', detail: 'center | flex-start | flex-end | stretch | baseline' },
    { label: 'justify-content', kind: 'prop', detail: 'center | flex-start | flex-end | space-between | space-around' },
    { label: 'gap', kind: 'prop' }, { label: 'grid', kind: 'prop' },
    { label: 'grid-template-columns', kind: 'prop' }, { label: 'grid-template-rows', kind: 'prop' },
    { label: 'grid-column', kind: 'prop' }, { label: 'grid-row', kind: 'prop' },
    { label: 'place-items', kind: 'prop' }, { label: 'place-content', kind: 'prop' },
    { label: 'margin', kind: 'prop' }, { label: 'margin-top', kind: 'prop' }, { label: 'margin-right', kind: 'prop' },
    { label: 'margin-bottom', kind: 'prop' }, { label: 'margin-left', kind: 'prop' },
    { label: 'padding', kind: 'prop' }, { label: 'padding-top', kind: 'prop' }, { label: 'padding-right', kind: 'prop' },
    { label: 'padding-bottom', kind: 'prop' }, { label: 'padding-left', kind: 'prop' },
    { label: 'width', kind: 'prop' }, { label: 'height', kind: 'prop' },
    { label: 'max-width', kind: 'prop' }, { label: 'min-width', kind: 'prop' },
    { label: 'max-height', kind: 'prop' }, { label: 'min-height', kind: 'prop' },
    { label: 'color', kind: 'prop' }, { label: 'background', kind: 'prop' },
    { label: 'background-color', kind: 'prop' }, { label: 'background-image', kind: 'prop' },
    { label: 'background-size', kind: 'prop', detail: 'cover | contain | auto | px/%' },
    { label: 'background-position', kind: 'prop' }, { label: 'background-repeat', kind: 'prop' },
    { label: 'font-size', kind: 'prop' }, { label: 'font-family', kind: 'prop' },
    { label: 'font-weight', kind: 'prop', detail: '100-900 | normal | bold' },
    { label: 'font-style', kind: 'prop', detail: 'normal | italic | oblique' },
    { label: 'line-height', kind: 'prop' }, { label: 'letter-spacing', kind: 'prop' },
    { label: 'text-align', kind: 'prop', detail: 'left | center | right | justify' },
    { label: 'text-decoration', kind: 'prop' }, { label: 'text-transform', kind: 'prop' },
    { label: 'text-overflow', kind: 'prop', detail: 'clip | ellipsis' },
    { label: 'white-space', kind: 'prop', detail: 'normal | nowrap | pre | pre-wrap' },
    { label: 'word-break', kind: 'prop' }, { label: 'overflow-wrap', kind: 'prop' },
    { label: 'border', kind: 'prop' }, { label: 'border-radius', kind: 'prop' },
    { label: 'border-width', kind: 'prop' }, { label: 'border-color', kind: 'prop' },
    { label: 'border-style', kind: 'prop', detail: 'solid | dashed | dotted | none' },
    { label: 'outline', kind: 'prop' }, { label: 'box-shadow', kind: 'prop' },
    { label: 'text-shadow', kind: 'prop' }, { label: 'opacity', kind: 'prop' },
    { label: 'overflow', kind: 'prop', detail: 'visible | hidden | scroll | auto' },
    { label: 'overflow-x', kind: 'prop' }, { label: 'overflow-y', kind: 'prop' },
    { label: 'z-index', kind: 'prop' }, { label: 'top', kind: 'prop' }, { label: 'right', kind: 'prop' },
    { label: 'bottom', kind: 'prop' }, { label: 'left', kind: 'prop' }, { label: 'inset', kind: 'prop' },
    { label: 'cursor', kind: 'prop', detail: 'pointer | default | text | crosshair | not-allowed' },
    { label: 'pointer-events', kind: 'prop' }, { label: 'user-select', kind: 'prop' },
    { label: 'transition', kind: 'prop' }, { label: 'animation', kind: 'prop' },
    { label: 'transform', kind: 'prop' }, { label: 'transform-origin', kind: 'prop' },
    { label: 'will-change', kind: 'prop' }, { label: 'clip-path', kind: 'prop' },
    { label: 'filter', kind: 'prop' }, { label: 'backdrop-filter', kind: 'prop' },
    { label: 'object-fit', kind: 'prop', detail: 'cover | contain | fill | none | scale-down' },
    { label: 'object-position', kind: 'prop' }, { label: 'resize', kind: 'prop' },
    { label: 'appearance', kind: 'prop' }, { label: 'visibility', kind: 'prop' },
    { label: 'content', kind: 'prop' }, { label: 'counter-reset', kind: 'prop' },
    { label: 'counter-increment', kind: 'prop' }, { label: 'list-style', kind: 'prop' },
    { label: 'vertical-align', kind: 'prop' }, { label: 'columns', kind: 'prop' },
    { label: 'column-gap', kind: 'prop' }, { label: 'row-gap', kind: 'prop' },
    { label: '@media', kind: 'at-rule' }, { label: '@keyframes', kind: 'at-rule' },
    { label: '@import', kind: 'at-rule' }, { label: '@font-face', kind: 'at-rule' },
    { label: '@layer', kind: 'at-rule' }, { label: '@container', kind: 'at-rule' },
    { label: ':hover', kind: 'pseudo' }, { label: ':focus', kind: 'pseudo' },
    { label: ':active', kind: 'pseudo' }, { label: ':nth-child()', kind: 'pseudo' },
    { label: ':first-child', kind: 'pseudo' }, { label: ':last-child', kind: 'pseudo' },
    { label: ':not()', kind: 'pseudo' }, { label: ':is()', kind: 'pseudo' },
    { label: ':where()', kind: 'pseudo' }, { label: ':has()', kind: 'pseudo' },
    { label: '::before', kind: 'pseudo' }, { label: '::after', kind: 'pseudo' },
    { label: '::placeholder', kind: 'pseudo' }, { label: '::selection', kind: 'pseudo' },
    { label: ':root', kind: 'pseudo' }, { label: ':checked', kind: 'pseudo' },
    { label: ':disabled', kind: 'pseudo' }, { label: ':empty', kind: 'pseudo' },
  ],
  python: [
    { label: 'print', kind: 'fn', detail: 'print(*args, sep=" ", end="\\n")' },
    { label: 'len', kind: 'fn', detail: 'len(obj): int' },
    { label: 'range', kind: 'fn', detail: 'range(stop) | range(start, stop, step)' },
    { label: 'enumerate', kind: 'fn', detail: 'enumerate(iterable, start=0)' },
    { label: 'zip', kind: 'fn', detail: 'zip(*iterables)' },
    { label: 'map', kind: 'fn', detail: 'map(func, iterable)' },
    { label: 'filter', kind: 'fn', detail: 'filter(func, iterable)' },
    { label: 'sorted', kind: 'fn', detail: 'sorted(iterable, key=None, reverse=False)' },
    { label: 'list', kind: 'fn' }, { label: 'dict', kind: 'fn' }, { label: 'set', kind: 'fn' },
    { label: 'tuple', kind: 'fn' }, { label: 'str', kind: 'fn' }, { label: 'int', kind: 'fn' },
    { label: 'float', kind: 'fn' }, { label: 'bool', kind: 'fn' }, { label: 'type', kind: 'fn' },
    { label: 'isinstance', kind: 'fn', detail: 'isinstance(obj, class_or_tuple)' },
    { label: 'hasattr', kind: 'fn', detail: 'hasattr(obj, name)' },
    { label: 'getattr', kind: 'fn', detail: 'getattr(obj, name, default?)' },
    { label: 'setattr', kind: 'fn', detail: 'setattr(obj, name, value)' },
    { label: 'open', kind: 'fn', detail: 'open(file, mode="r")' },
    { label: 'input', kind: 'fn', detail: 'input(prompt="")' },
    { label: 'abs', kind: 'fn' }, { label: 'round', kind: 'fn' }, { label: 'max', kind: 'fn' },
    { label: 'min', kind: 'fn' }, { label: 'sum', kind: 'fn' }, { label: 'any', kind: 'fn' },
    { label: 'all', kind: 'fn' }, { label: 'id', kind: 'fn' }, { label: 'hash', kind: 'fn' },
    { label: 'repr', kind: 'fn' }, { label: 'format', kind: 'fn' }, { label: 'vars', kind: 'fn' },
    { label: 'dir', kind: 'fn' }, { label: 'help', kind: 'fn' },
    { label: 'def', kind: 'kw' }, { label: 'class', kind: 'kw' }, { label: 'return', kind: 'kw' },
    { label: 'if', kind: 'kw' }, { label: 'elif', kind: 'kw' }, { label: 'else', kind: 'kw' },
    { label: 'for', kind: 'kw' }, { label: 'while', kind: 'kw' }, { label: 'break', kind: 'kw' },
    { label: 'continue', kind: 'kw' }, { label: 'pass', kind: 'kw' }, { label: 'import', kind: 'kw' },
    { label: 'from', kind: 'kw' }, { label: 'as', kind: 'kw' }, { label: 'with', kind: 'kw' },
    { label: 'try', kind: 'kw' }, { label: 'except', kind: 'kw' }, { label: 'finally', kind: 'kw' },
    { label: 'raise', kind: 'kw' }, { label: 'yield', kind: 'kw' }, { label: 'lambda', kind: 'kw' },
    { label: 'async', kind: 'kw' }, { label: 'await', kind: 'kw' }, { label: 'global', kind: 'kw' },
    { label: 'nonlocal', kind: 'kw' }, { label: 'del', kind: 'kw' }, { label: 'assert', kind: 'kw' },
    { label: 'True', kind: 'kw' }, { label: 'False', kind: 'kw' }, { label: 'None', kind: 'kw' },
    { label: 'and', kind: 'kw' }, { label: 'or', kind: 'kw' }, { label: 'not', kind: 'kw' },
    { label: 'in', kind: 'kw' }, { label: 'is', kind: 'kw' }, { label: '__init__', kind: 'fn' },
    { label: '__str__', kind: 'fn' }, { label: '__repr__', kind: 'fn' }, { label: '__len__', kind: 'fn' },
    { label: 'self', kind: 'kw' }, { label: 'super', kind: 'kw' },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// SNIPPET DATABASE — VS Code-format snippets per language
// Format: { prefix, body (array of lines), description, scope }
// $1,$2... = tab stops. $0 = final. ${1:placeholder} = with default text.
// ─────────────────────────────────────────────────────────────────────────────
const SNIPPET_DB = {
  js: [
    { prefix: 'cl', body: ['console.log($1);', '$0'], description: 'console.log' },
    { prefix: 'clr', body: ['console.log("$1", $1);', '$0'], description: 'console.log with label' },
    { prefix: 'fn', body: ['function ${1:name}(${2:params}) {', '  $0', '}'], description: 'function declaration' },
    { prefix: 'afn', body: ['async function ${1:name}(${2:params}) {', '  $0', '}'], description: 'async function' },
    { prefix: 'arr', body: ['const ${1:name} = (${2:params}) => {', '  $0', '};'], description: 'arrow function' },
    { prefix: 'iife', body: ['(function() {', '  $0', '})();'], description: 'immediately invoked' },
    { prefix: 'for', body: ['for (let ${1:i} = 0; ${1:i} < ${2:len}; ${1:i}++) {', '  $0', '}'], description: 'for loop' },
    { prefix: 'fore', body: ['${1:array}.forEach((${2:item}) => {', '  $0', '});'], description: 'forEach' },
    { prefix: 'fori', body: ['for (const ${1:item} of ${2:items}) {', '  $0', '}'], description: 'for...of' },
    { prefix: 'imp', body: ["import ${1:name} from '${2:module}';", '$0'], description: 'import statement' },
    { prefix: 'impa', body: ["import { $1 } from '${2:module}';", '$0'], description: 'named import' },
    { prefix: 'exp', body: ['export default ${1:name};'], description: 'default export' },
    { prefix: 'expa', body: ['export { $1 };'], description: 'named export' },
    { prefix: 'cls', body: ['class ${1:Name} extends ${2:Base} {', '  constructor(${3:params}) {', '    super($3);', '    $0', '  }', '}'], description: 'class definition' },
    { prefix: 'pr', body: ['new Promise((resolve, reject) => {', '  $0', '});'], description: 'Promise' },
    { prefix: 'try', body: ['try {', '  $0', '} catch (${1:err}) {', '  console.error($1);', '}'], description: 'try/catch' },
    { prefix: 'sw', body: ['switch (${1:expr}) {', '  case ${2:val}:', '    $0', '    break;', '  default:', '    break;', '}'], description: 'switch statement' },
    { prefix: 'fe', body: ['fetch(${1:url})', '  .then(res => res.json())', '  .then(data => {', '    $0', '  })', '  .catch(err => console.error(err));'], description: 'fetch request' },
    { prefix: 'ase', body: ['async function ${1:name}() {', '  try {', '    const res = await fetch($2);', '    const data = await res.json();', '    $0', '  } catch (err) {', '    console.error(err);', '  }', '}'], description: 'async fetch' },
    { prefix: 'qse', body: ['document.querySelector(\'${1:selector}\')'], description: 'querySelector' },
    { prefix: 'qsa', body: ['document.querySelectorAll(\'${1:selector}\')'], description: 'querySelectorAll' },
    { prefix: 'ael', body: ["${1:element}.addEventListener('${2:click}', (${3:e}) => {", '  $0', '});'], description: 'addEventListener' },
    { prefix: 'dce', body: ["const ${1:el} = document.createElement('${2:div}');", '$0'], description: 'createElement' },
    { prefix: 'loc', body: ['const ${1:name} = JSON.parse(localStorage.getItem(\'${2:key}\')) ?? $3;'], description: 'localStorage get' },
    { prefix: 'los', body: ["localStorage.setItem('${1:key}', JSON.stringify(${2:value}));"], description: 'localStorage set' },
    { prefix: 'sto', body: ['${1:timer} = setTimeout(() => {', '  $0', '}, ${2:300});'], description: 'setTimeout' },
    { prefix: 'raf', body: ['requestAnimationFrame(() => {', '  $0', '});'], description: 'requestAnimationFrame' },
    { prefix: 'dstr', body: ['const { ${1:prop} } = ${2:obj};'], description: 'destructuring object' },
    { prefix: 'dstra', body: ['const [${1:first}, ${2:rest}] = ${3:arr};'], description: 'destructuring array' },
    { prefix: 'spr', body: ['const ${1:copy} = { ...${2:obj} };'], description: 'spread object' },
    { prefix: 'gen', body: ['function* ${1:name}() {', '  yield $0;', '}'], description: 'generator function' },
    { prefix: 'obs', body: ['const ${1:obs} = new IntersectionObserver((entries) => {', '  entries.forEach(entry => {', '    if (entry.isIntersecting) {', '      $0', '    }', '  });', '}, { threshold: ${2:0.1} });'], description: 'IntersectionObserver' },
  ],
  html: [
    { prefix: '!', body: ['<!DOCTYPE html>', '<html lang="${1:en}">', '<head>', '  <meta charset="UTF-8">', '  <meta name="viewport" content="width=device-width, initial-scale=1.0">', '  <title>${2:Document}</title>', '  <link rel="stylesheet" href="${3:style.css}">', '</head>', '<body>', '  $0', '  <script src="${4:script.js}"></script>', '</body>', '</html>'], description: 'HTML5 boilerplate' },
    { prefix: 'html5', body: ['<!DOCTYPE html>', '<html lang="${1:en}">', '<head>', '  <meta charset="UTF-8">', '  <meta name="viewport" content="width=device-width, initial-scale=1.0">', '  <title>${2:Document}</title>', '</head>', '<body>', '  $0', '</body>', '</html>'], description: 'HTML5 minimal boilerplate' },
    { prefix: 'inp', body: ['<input type="${1:text}" name="${2}" id="${3}" placeholder="${4}" class="${5}">'], description: 'input element' },
    { prefix: 'btn', body: ['<button type="${1:button}" class="${2}" onclick="${3}">$0</button>'], description: 'button' },
    { prefix: 'lnk', body: ['<link rel="stylesheet" href="${1:style.css}">'], description: 'link stylesheet' },
    { prefix: 'scr', body: ['<script src="${1}"></script>'], description: 'script src' },
    { prefix: 'img', body: ['<img src="${1}" alt="${2}" width="${3}" height="${4}">'], description: 'image' },
    { prefix: 'a', body: ['<a href="${1:#}" target="${2:_blank}" rel="noopener">$0</a>'], description: 'anchor' },
    { prefix: 'meta', body: ['<meta name="${1}" content="${2}">'], description: 'meta tag' },
    { prefix: 'og', body: ['<meta property="og:title" content="${1}">', '<meta property="og:description" content="${2}">', '<meta property="og:image" content="${3}">'], description: 'Open Graph meta' },
    { prefix: 'form', body: ['<form action="${1}" method="${2:post}" id="${3}">', '  $0', '  <button type="submit">Submit</button>', '</form>'], description: 'form' },
    { prefix: 'table', body: ['<table>', '  <thead>', '    <tr>', '      <th>$1</th>', '    </tr>', '  </thead>', '  <tbody>', '    <tr>', '      <td>$0</td>', '    </tr>', '  </tbody>', '</table>'], description: 'table' },
    { prefix: 'nav', body: ['<nav class="${1:navbar}">', '  <ul>', '    <li><a href="${2:#}">$0</a></li>', '  </ul>', '</nav>'], description: 'navigation' },
    { prefix: 'sec', body: ['<section class="${1}">', '  <h2>${2:Heading}</h2>', '  <p>$0</p>', '</section>'], description: 'section' },
    { prefix: 'card', body: ['<div class="${1:card}">', '  <div class="${1:card}__header">', '    <h3>$2</h3>', '  </div>', '  <div class="${1:card}__body">', '    $0', '  </div>', '</div>'], description: 'card component' },
    { prefix: 'flex', body: ['<div style="display:flex;align-items:${1:center};justify-content:${2:space-between};gap:${3:1rem};">', '  $0', '</div>'], description: 'flex container' },
    { prefix: 'grid', body: ['<div style="display:grid;grid-template-columns:${1:repeat(3,1fr)};gap:${2:1rem};">', '  $0', '</div>'], description: 'grid container' },
  ],
  css: [
    { prefix: 'flex', body: ['display: flex;', 'align-items: ${1:center};', 'justify-content: ${2:flex-start};', 'gap: ${3:0};', '$0'], description: 'flexbox setup' },
    { prefix: 'grid', body: ['display: grid;', 'grid-template-columns: ${1:repeat(3, 1fr)};', 'gap: ${2:1rem};', '$0'], description: 'grid setup' },
    { prefix: 'abs', body: ['position: absolute;', 'top: ${1:0};', 'left: ${2:0};', '$0'], description: 'absolute position' },
    { prefix: 'fix', body: ['position: fixed;', 'top: ${1:0};', 'left: ${2:0};', 'width: ${3:100%};', '$0'], description: 'fixed position' },
    { prefix: 'center', body: ['display: flex;', 'align-items: center;', 'justify-content: center;', '$0'], description: 'center with flex' },
    { prefix: 'trc', body: ['transition: ${1:all} ${2:0.3s} ${3:ease};', '$0'], description: 'transition' },
    { prefix: 'anim', body: ['@keyframes ${1:name} {', '  from { $2 }', '  to { $0 }', '}'], description: 'keyframes' },
    { prefix: 'mq', body: ['@media (max-width: ${1:768px}) {', '  $0', '}'], description: 'media query' },
    { prefix: 'mqmin', body: ['@media (min-width: ${1:768px}) {', '  $0', '}'], description: 'min-width media query' },
    { prefix: 'var', body: ['var(--${1:name})'], description: 'CSS variable' },
    { prefix: 'root', body: [':root {', '  --${1:color}: ${2:#000};', '  $0', '}'], description: 'CSS root variables' },
    { prefix: 'shad', body: ['box-shadow: ${1:0} ${2:2px} ${3:8px} ${4:rgba(0,0,0,0.15)};', '$0'], description: 'box-shadow' },
    { prefix: 'grad', body: ['background: linear-gradient(${1:135deg}, ${2:#667eea}, ${3:#764ba2});', '$0'], description: 'linear gradient' },
    { prefix: 'clamp', body: ['font-size: clamp(${1:1rem}, ${2:2.5vw}, ${3:2rem});', '$0'], description: 'clamp()' },
    { prefix: 'scroll', body: ['scroll-behavior: smooth;', 'overflow-y: auto;', 'scrollbar-width: thin;', 'scrollbar-color: ${1:#888} ${2:transparent};', '$0'], description: 'scroll setup' },
  ],
  python: [
    { prefix: 'def', body: ['def ${1:name}(${2:params}):', '    """${3:Docstring}"""', '    $0'], description: 'function definition' },
    { prefix: 'cls', body: ['class ${1:Name}:', '    """${2:Docstring}"""', '    ', '    def __init__(self${3:, params}):', '        $0'], description: 'class definition' },
    { prefix: 'ifi', body: ['if ${1:condition}:', '    $0'], description: 'if statement' },
    { prefix: 'ife', body: ['if ${1:condition}:', '    ${2:pass}', 'else:', '    $0'], description: 'if/else' },
    { prefix: 'for', body: ['for ${1:item} in ${2:iterable}:', '    $0'], description: 'for loop' },
    { prefix: 'fore', body: ['for ${1:i}, ${2:item} in enumerate(${3:items}):', '    $0'], description: 'for enumerate' },
    { prefix: 'wh', body: ['while ${1:condition}:', '    $0'], description: 'while loop' },
    { prefix: 'try', body: ['try:', '    $0', 'except ${1:Exception} as ${2:e}:', '    print(f"Error: {$2}")'], description: 'try/except' },
    { prefix: 'trif', body: ['try:', '    $0', 'except ${1:Exception} as ${2:e}:', '    print(f"Error: {$2}")', 'finally:', '    pass'], description: 'try/except/finally' },
    { prefix: 'wi', body: ['with open(${1:"file.txt"}, "${2:r}") as ${3:f}:', '    $0'], description: 'with open' },
    { prefix: 'lc', body: ['[${1:x} for ${1:x} in ${2:items} if ${3:condition}]'], description: 'list comprehension' },
    { prefix: 'dc', body: ['{${1:k}: ${2:v} for ${1:k}, ${2:v} in ${3:items}.items()}'], description: 'dict comprehension' },
    { prefix: 'lm', body: ['lambda ${1:x}: ${2:x}'], description: 'lambda' },
    { prefix: 'pf', body: ['print(f"${1:label}: {${2:var}}")'], description: 'f-string print' },
    { prefix: 'imp', body: ['import ${1:module}'], description: 'import' },
    { prefix: 'imf', body: ['from ${1:module} import ${2:name}'], description: 'from import' },
    { prefix: 'main', body: ['if __name__ == "__main__":', '    $0'], description: 'main guard' },
    { prefix: 'dc2', body: ['@dataclass', 'class ${1:Name}:', '    ${2:field}: ${3:type} = ${4:None}', '    $0'], description: 'dataclass' },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// SNIPPET PARSER  — VS Code format → tab-stop AST
// Input:  "function ${1:name}(${2:params}) {\n  $0\n}"
// Output: { text: string, tabStops: [{index, start, end, placeholder}] }
// ─────────────────────────────────────────────────────────────────────────────
function parseSnippetBody(bodyLines) {
  const raw = bodyLines.join('\n');
  const tabStops = [];
  let text = '';
  let i = 0;

  while (i < raw.length) {
    if (raw[i] === '$') {
      i++;
      if (raw[i] === '{') {
        // ${N:placeholder} or ${N}
        i++;
        let numStr = '';
        while (i < raw.length && /\d/.test(raw[i])) numStr += raw[i++];
        const stopIndex = parseInt(numStr, 10);
        let placeholder = '';
        if (raw[i] === ':') {
          i++; // skip ':'
          let depth = 1;
          while (i < raw.length && depth > 0) {
            if (raw[i] === '{') depth++;
            else if (raw[i] === '}') { depth--; if (depth === 0) break; }
            placeholder += raw[i++];
          }
          i++; // skip closing '}'
        } else if (raw[i] === '}') {
          i++;
        }
        const start = text.length;
        text += placeholder || '';
        tabStops.push({ index: stopIndex, start, end: text.length, placeholder });
      } else {
        // $N bare
        let numStr = '';
        while (i < raw.length && /\d/.test(raw[i])) numStr += raw[i++];
        if (numStr) {
          const stopIndex = parseInt(numStr, 10);
          tabStops.push({ index: stopIndex, start: text.length, end: text.length, placeholder: '' });
        }
      }
    } else {
      text += raw[i++];
    }
  }

  // Sort by index (0 goes last)
  tabStops.sort((a, b) => {
    if (a.index === 0) return 1;
    if (b.index === 0) return -1;
    return a.index - b.index;
  });

  return { text, tabStops };
}

// ─────────────────────────────────────────────────────────────────────────────
// LINTER  — static diagnostic rules (no network, runs in worker)
// Returns array of: { line, col, message, severity: 'error'|'warning'|'info' }
// ─────────────────────────────────────────────────────────────────────────────
function lintJS(code) {
  const diags = [];
  const lines = code.split('\n');

  lines.forEach((line, i) => {
    const ln = i + 1;
    const t = line.trimStart();

    // var is discouraged
    if (/\bvar\s+/.test(t)) diags.push({ line: ln, col: line.indexOf('var') + 1, message: 'Prefer const/let over var', severity: 'warning' });
    // == instead of ===
    if (/[^=!<>]==[^=]/.test(line)) diags.push({ line: ln, col: line.search(/[^=!<>]==[^=]/) + 1, message: 'Use === for strict equality', severity: 'warning' });
    // debugger statement
    if (/\bdebugger\b/.test(t)) diags.push({ line: ln, col: line.indexOf('debugger') + 1, message: 'Remove debugger statement', severity: 'error' });
    // console in production (warning only)
    if (/\bconsole\.(log|warn|error|debug)\b/.test(t)) diags.push({ line: ln, col: line.search(/console\./) + 1, message: 'Consider removing console statement', severity: 'info' });
    // TODO/FIXME
    if (/\b(TODO|FIXME|HACK|XXX)\b/.test(t)) diags.push({ line: ln, col: line.search(/\b(TODO|FIXME|HACK|XXX)\b/) + 1, message: line.trim(), severity: 'info' });
    // Trailing whitespace (subtle warning)
    if (/\s+$/.test(line)) diags.push({ line: ln, col: line.trimEnd().length + 1, message: 'Trailing whitespace', severity: 'info' });
    // eval()
    if (/\beval\s*\(/.test(t)) diags.push({ line: ln, col: line.indexOf('eval') + 1, message: 'Avoid eval() - security risk', severity: 'error' });
    // Unreachable: return followed by code
    if (i > 0 && /^\s*return\b/.test(lines[i - 1]) && t && !t.startsWith('//') && !t.startsWith('}')) {
      diags.push({ line: ln, col: 1, message: 'Unreachable code after return', severity: 'warning' });
    }
  });

  return diags.slice(0, 50); // cap at 50 diags
}

function lintHTML(code) {
  const diags = [];
  const lines = code.split('\n');
  // Check for missing alt on img
  lines.forEach((line, i) => {
    if (/<img\b(?![^>]*\balt=)/i.test(line)) {
      diags.push({ line: i + 1, col: 1, message: '<img> missing alt attribute (accessibility)', severity: 'warning' });
    }
    if (/<script\b[^>]*>.*<\/script>/i.test(line) && line.length > 200) {
      diags.push({ line: i + 1, col: 1, message: 'Inline script - consider external file', severity: 'info' });
    }
  });
  return diags;
}

function lintCSS(code) {
  const diags = [];
  const lines = code.split('\n');
  lines.forEach((line, i) => {
    // Missing semicolon (heuristic: property: value without ;)
    if (/^\s*[\w-]+\s*:.+[^;{}\s]$/.test(line.trimEnd()) && !line.includes('{')) {
      diags.push({ line: i + 1, col: line.length, message: 'Possible missing semicolon', severity: 'warning' });
    }
  });
  return diags;
}

function lintPython(code) {
  const diags = [];
  const lines = code.split('\n');
  lines.forEach((line, i) => {
    if (/\bprint\s+[^(]/.test(line)) diags.push({ line: i + 1, col: 1, message: 'Python 3: print is a function, use print()', severity: 'error' });
    if (/\bexcept\s*:/.test(line)) diags.push({ line: i + 1, col: line.indexOf('except') + 1, message: 'Bare except: catches all exceptions. Specify exception type.', severity: 'warning' });
    if (/\t/.test(line)) diags.push({ line: i + 1, col: 1, message: 'Mixed indentation: tab detected (use spaces)', severity: 'warning' });
  });
  return diags;
}

// ─────────────────────────────────────────────────────────────────────────────
// MESSAGE DISPATCHER
// ─────────────────────────────────────────────────────────────────────────────
self.onmessage = function(e) {
  const { type, id, payload } = e.data;

  switch (type) {
    case 'SUGGEST': {
      const { code, word, ext, path, version } = payload;

      // 1. Get scope symbols (incremental, cached)
      const scopeSymbols = parseScope(code, path, version);

      // 2. Select keyword source
      let kwSource = [];
      if (['js', 'ts', 'jsx', 'tsx', 'mjs'].includes(ext)) kwSource = KEYWORDS.js;
      else if (['html', 'htm'].includes(ext)) kwSource = KEYWORDS.html;
      else if (ext === 'css' || ext === 'scss' || ext === 'sass') kwSource = KEYWORDS.css;
      else if (ext === 'py') kwSource = KEYWORDS.python;

      // 3. Get snippet source
      let snipSource = [];
      const snipKey = ['js', 'ts', 'jsx', 'tsx'].includes(ext) ? 'js'
        : ['html', 'htm'].includes(ext) ? 'html'
        : ext === 'css' ? 'css'
        : ext === 'py' ? 'python' : null;
      if (snipKey) snipSource = SNIPPET_DB[snipKey] || [];

      const results = [];
      const q = word.toLowerCase();

      // Priority 1: snippets (highest value — expand full blocks)
      snipSource.forEach(snip => {
        const score = fuzzyScore(q, snip.prefix);
        if (score > 0 && snip.prefix !== word) {
          results.push({ label: snip.prefix, kind: 'snippet', detail: snip.description, score: score + 2, snippet: snip });
        }
      });

      // Priority 2: keywords + functions
      kwSource.forEach(kw => {
        const score = fuzzyScore(q, kw.label);
        if (score > 0 && kw.label !== word) {
          results.push({ label: kw.label, kind: kw.kind, detail: kw.detail || '', score });
        }
      });

      // Priority 3: scope symbols (identifiers in current file)
      scopeSymbols.forEach(sym => {
        const score = fuzzyScore(q, sym);
        if (score > 0 && sym !== word && sym.length > 1) {
          results.push({ label: sym, kind: 'var', detail: '(local)', score: score + 0.1 });
        }
      });

      // Sort by score descending, deduplicate
      const seen = new Set();
      const deduped = results
        .filter(r => { if (seen.has(r.label)) return false; seen.add(r.label); return true; })
        .sort((a, b) => b.score - a.score)
        .slice(0, 15);

      self.postMessage({ type: 'SUGGEST_RESULT', id, result: deduped });
      break;
    }

    case 'LINT': {
      const { code, ext } = payload;
      let diags = [];
      if (['js', 'ts', 'jsx', 'tsx'].includes(ext)) diags = lintJS(code);
      else if (['html', 'htm'].includes(ext)) diags = lintHTML(code);
      else if (['css', 'scss'].includes(ext)) diags = lintCSS(code);
      else if (ext === 'py') diags = lintPython(code);
      self.postMessage({ type: 'LINT_RESULT', id, result: diags });
      break;
    }

    case 'SNIPPET_PARSE': {
      const { body } = payload;
      const parsed = parseSnippetBody(body);
      self.postMessage({ type: 'SNIPPET_PARSE_RESULT', id, result: parsed });
      break;
    }

    case 'PARSE_SCOPE': {
      const { code, path, version } = payload;
      const symbols = parseScope(code, path, version);
      self.postMessage({ type: 'PARSE_SCOPE_RESULT', id, result: [...symbols] });
      break;
    }

    case 'FUZZY_RANK': {
      const { query, items } = payload;
      const ranked = items
        .map(item => ({ ...item, score: fuzzyScore(query, item.label) }))
        .filter(i => i.score > 0)
        .sort((a, b) => b.score - a.score);
      self.postMessage({ type: 'FUZZY_RANK_RESULT', id, result: ranked });
      break;
    }
  }
};
