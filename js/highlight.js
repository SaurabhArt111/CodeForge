// =================== SYNTAX HIGHLIGHTING (v5) ===================
// js/highlight.js — VS Code Dark+ token colors, embedded CSS/JS in HTML, PHP support

const _hlInstances = {};
let hlTimer = null;

function scheduleHighlight(taId, path) {
  if (hlTimer) cancelAnimationFrame(hlTimer);

  hlTimer = requestAnimationFrame(() => {
    updateHlBackdrop(taId, path);
  });
}

function createHlEditor(taId, lnId, path) {
  const ta = document.getElementById(taId);
  if (!ta) return;
  const container = ta.closest('.code-editor-container');
  if (!container) return;

  const bd = document.createElement('div');
  bd.className = 'hl-backdrop';
  bd.id = 'bd-' + taId;
  bd.setAttribute('aria-hidden', 'true');

  const hlWrapper = document.createElement('div');
  hlWrapper.style.cssText = 'position:relative;flex:1;overflow:hidden;display:flex;flex-direction:column;min-width:0;';

  ta.parentNode.insertBefore(hlWrapper, ta);
  hlWrapper.appendChild(bd);
  hlWrapper.appendChild(ta);

  // Mirror every layout property from the textarea
  const cs = window.getComputedStyle(ta);
  bd.style.cssText = `
    position:absolute;top:0;left:0;right:0;bottom:0;
    padding:${cs.padding};
    font-family:${cs.fontFamily};
    font-size:${cs.fontSize};
    font-weight:${cs.fontWeight};
    line-height:${cs.lineHeight};
    letter-spacing:${cs.letterSpacing};
    tab-size:${cs.tabSize || 2};
    white-space:pre;
    word-break:keep-all;
    overflow:hidden;
    pointer-events:none;
    z-index:1;
    box-sizing:border-box;
    border:${cs.border};
    background:transparent;
    color:var(--text-primary);
    margin:0;
  `;

  ta.style.position = 'relative';
  ta.style.zIndex = '2';
  ta.style.background = 'transparent';
  ta.style.color = 'transparent';
  ta.style.webkitTextFillColor = 'transparent';
  ta.style.caretColor = 'var(--cursor, #aeafad)';
  ta.classList.add('hl-ready');

  _hlInstances[taId] = { bd, path };
  updateHlBackdrop(taId, path);

  ta.addEventListener('scroll', () => {
    bd.scrollTop  = ta.scrollTop;
    bd.scrollLeft = ta.scrollLeft;
  }, { passive: true });
}

function updateHlBackdrop(taId, path) {
  const inst = _hlInstances[taId];
  if (!inst) return;
  const ta = document.getElementById(taId);
  if (!ta) return;
  if (!state?.settings?.syntaxHighlight) {
    inst.bd.textContent = ta.value;
    return;
  }
  const file = state.files[path];
  if (!file) return;
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  inst.bd.innerHTML = tokenize(ta.value, ext);
  inst.bd.scrollTop  = ta.scrollTop;
  inst.bd.scrollLeft = ta.scrollLeft;
}

// ─── TOKENIZER DISPATCHER ────────────────────────────────────────────────────

function tokenize(code, ext) {
  if (!code) return '';
  switch (ext) {
    case 'html': case 'htm': return tokenizeHTML(code);
    case 'css':  return tokenizeCSS(code);
    case 'js':   case 'ts':  case 'jsx': case 'tsx': return tokenizeJS(code);
    case 'json': return tokenizeJSON(code);
    case 'py':   return tokenizePY(code);
    case 'md':   return tokenizeMD(code);
    case 'sh':   case 'bash': return tokenizeSH(code);
    case 'xml':  case 'svg': return tokenizeXML(code);
    case 'php':  return tokenizePHP(code);
    default:     return esc(code);
  }
}

function esc(s) { return escapeHtml(s); }
function span(cls, txt) { return `<span class="${cls}">${txt}</span>`; }

// ─── JAVASCRIPT / TYPESCRIPT ─────────────────────────────────────────────────

const JS_KEYWORDS = new Set(['const','let','var','function','return','if','else','for','while',
  'do','switch','case','break','continue','new','delete','typeof','instanceof','in','of','class',
  'extends','super','this','import','export','default','from','async','await','try','catch',
  'finally','throw','void','static','get','set','yield','debugger','with','enum','implements',
  'interface','package','private','protected','public','namespace','type','abstract','declare',
  'readonly','as','is','satisfies','keyof','infer','never','any','unknown']);
const JS_BOOL = new Set(['null','undefined','true','false','NaN','Infinity','arguments']);
const JS_IMPORT = new Set(['import','export','from','default','as','async','await']);
const JS_CONTROL = new Set(['if','else','for','while','do','switch','case','break','continue',
  'try','catch','finally','return','throw','new','delete','typeof','instanceof','in','of','void','yield']);
const JS_BUILTINS = new Set(['console','window','document','Array','Object','String','Number',
  'Boolean','Math','JSON','Promise','Map','Set','Symbol','Error','Date','RegExp','fetch',
  'setTimeout','setInterval','clearTimeout','clearInterval','parseInt','parseFloat','isNaN',
  'isFinite','encodeURIComponent','decodeURIComponent','localStorage','sessionStorage',
  'navigator','location','history','performance','requestAnimationFrame','cancelAnimationFrame',
  'structuredClone','globalThis','process','require','module','exports']);

function tokenizeJS(code) {
  let result = '';
  let i = 0, len = code.length;
  while (i < len) {
    // Single-line comment
    if (code[i] === '/' && code[i+1] === '/') {
      const end = code.indexOf('\n', i);
      const chunk = end === -1 ? code.slice(i) : code.slice(i, end);
      result += span('t-cmt', esc(chunk)); i += chunk.length; continue;
    }
    // Multi-line comment
    if (code[i] === '/' && code[i+1] === '*') {
      const end = code.indexOf('*/', i + 2);
      const chunk = end === -1 ? code.slice(i) : code.slice(i, end + 2);
      result += span('t-cmt', esc(chunk)); i += chunk.length; continue;
    }
    // Template literal
    if (code[i] === '`') {
      let j = i + 1, s = '`';
      while (j < len) {
        if (code[j] === '\\') { s += code[j] + (code[j+1]||''); j += 2; continue; }
        if (code[j] === '`') { s += '`'; j++; break; }
        s += code[j++];
      }
      result += span('t-str', esc(s)); i = j; continue;
    }
    // Strings
    if (code[i] === '"' || code[i] === "'") {
      const q = code[i]; let j = i + 1, s = q;
      while (j < len) {
        if (code[j] === '\\') { s += code[j] + (code[j+1]||''); j += 2; continue; }
        if (code[j] === q || code[j] === '\n') { s += code[j] === q ? q : ''; j++; break; }
        s += code[j++];
      }
      result += span('t-str', esc(s)); i = j; continue;
    }
    // Regex
    if (code[i] === '/' && i > 0 && /[\s=([,!&|?:;{}]/.test(code[i-1])) {
      let j = i + 1, s = '/', inCls = false;
      while (j < len && code[j] !== '\n') {
        if (code[j] === '\\') { s += code[j] + (code[j+1]||''); j += 2; continue; }
        if (code[j] === '[') inCls = true;
        if (code[j] === ']') inCls = false;
        if (code[j] === '/' && !inCls) { s += '/'; j++; while (/[gimsuy]/.test(code[j])) s += code[j++]; break; }
        s += code[j++];
      }
      if (s.length > 2) { result += span('t-rx', esc(s)); i = j; continue; }
    }
    // Numbers
    if (/[0-9]/.test(code[i]) || (code[i] === '.' && /[0-9]/.test(code[i+1]))) {
      let j = i;
      if (code[j] === '0' && /[xXbBoO]/.test(code[j+1])) { j += 2; while (j < len && /[0-9a-fA-F_]/.test(code[j])) j++; }
      else { while (j < len && /[0-9._eE+\-]/.test(code[j])) j++; if (code[j] === 'n') j++; }
      result += span('t-num', esc(code.slice(i, j))); i = j; continue;
    }
    // Identifiers
    if (/[a-zA-Z_$]/.test(code[i])) {
      let j = i; while (j < len && /[a-zA-Z0-9_$]/.test(code[j])) j++;
      const word = code.slice(i, j);
      const isCall = /\s*\(/.test(code.slice(j, j+3));
      if (JS_BOOL.has(word))       result += span('t-bool', esc(word));
      else if (JS_IMPORT.has(word))result += span('t-kw2', esc(word));
      else if (JS_CONTROL.has(word))result += span('t-kw', esc(word));
      else if (JS_KEYWORDS.has(word))result += span('t-kw', esc(word));
      else if (JS_BUILTINS.has(word))result += span('t-fn', esc(word));
      else if (isCall)             result += span('t-fn', esc(word));
      else if (/^[A-Z]/.test(word))result += span('t-cls', esc(word));
      else                         result += span('t-id', esc(word));
      i = j; continue;
    }
    // Operators / punctuation
    if (/[+\-*/%=!<>&|^~?:;.,[\]{}()@]/.test(code[i])) { result += span('t-op', esc(code[i])); i++; continue; }
    result += esc(code[i++]);
  }
  return result;
}

// ─── CSS ─────────────────────────────────────────────────────────────────────

const CSS_PROPS = new Set(['color','background','background-color','background-image','background-size',
  'background-position','background-repeat','border','border-radius','border-color','border-width',
  'border-style','margin','margin-top','margin-right','margin-bottom','margin-left','padding',
  'padding-top','padding-right','padding-bottom','padding-left','font','font-family','font-size',
  'font-weight','font-style','line-height','letter-spacing','text-align','text-decoration',
  'text-transform','white-space','word-break','overflow','overflow-x','overflow-y','display',
  'flex','flex-direction','flex-wrap','flex-grow','flex-shrink','flex-basis','justify-content',
  'align-items','align-self','align-content','grid','grid-template','grid-template-columns',
  'grid-template-rows','grid-column','grid-row','gap','column-gap','row-gap','width','height',
  'min-width','max-width','min-height','max-height','position','top','right','bottom','left',
  'z-index','opacity','visibility','transform','transition','animation','box-shadow',
  'text-shadow','content','cursor','pointer-events','user-select','outline','resize',
  'object-fit','object-position','filter','backdrop-filter','clip-path','aspect-ratio',
  'list-style','list-style-type','vertical-align','float','clear','box-sizing','direction',
  'scroll-behavior','will-change','contain']);

function tokenizeCSS(code) {
  let result = '', i = 0, len = code.length;
  while (i < len) {
    // Block comment
    if (code[i] === '/' && code[i+1] === '*') {
      const end = code.indexOf('*/', i+2);
      const chunk = end === -1 ? code.slice(i) : code.slice(i, end+2);
      result += span('t-cmt', esc(chunk)); i += chunk.length; continue;
    }
    // Line comment
    if (code[i] === '/' && code[i+1] === '/') {
      const end = code.indexOf('\n', i);
      const chunk = end === -1 ? code.slice(i) : code.slice(i, end);
      result += span('t-cmt', esc(chunk)); i += chunk.length; continue;
    }
    // Strings
    if (code[i] === '"' || code[i] === "'") {
      const q = code[i]; let j = i+1, s = q;
      while (j < len) { if (code[j] === '\\') { s += code[j]+(code[j+1]||''); j+=2; continue; } if (code[j] === q) { s+=q; j++; break; } s += code[j++]; }
      result += span('t-str', esc(s)); i = j; continue;
    }
    // @rules
    if (code[i] === '@') {
      let j = i+1; while (j < len && /[a-zA-Z-]/.test(code[j])) j++;
      result += span('t-atrule', esc(code.slice(i, j))); i = j; continue;
    }
    // url()
    if (code.slice(i,i+4).toLowerCase() === 'url(') {
      const end = code.indexOf(')', i+4);
      const chunk = end === -1 ? code.slice(i) : code.slice(i, end+1);
      result += span('t-str', esc(chunk)); i += chunk.length; continue;
    }
    // Numbers + units
    if (/[0-9]/.test(code[i]) || (code[i] === '-' && /[0-9]/.test(code[i+1]))) {
      let j = i; if (code[j] === '-') j++;
      while (j < len && /[0-9.]/.test(code[j])) j++;
      while (j < len && /[a-zA-Z%]/.test(code[j])) j++;
      result += span('t-num', esc(code.slice(i,j))); i = j; continue;
    }
    // Hash colors
    if (code[i] === '#') {
      let j = i+1; while (j < len && /[0-9a-fA-F]/.test(code[j])) j++;
      if (j - i > 1) { result += span('t-num', esc(code.slice(i,j))); i = j; continue; }
    }
    // Selectors / props / values
    if (/[a-zA-Z_-]/.test(code[i]) && code[i] !== '-') {
      let j = i; while (j < len && /[a-zA-Z0-9_-]/.test(code[j])) j++;
      const word = code.slice(i,j);
      // Look behind for context
      const before = code.slice(Math.max(0,i-30), i).trimEnd();
      const inPropPos = before.endsWith('{') || before.endsWith(';') || /\{\s*$/.test(before) || /;\s*$/.test(before);
      const inValuePos = before.endsWith(':');
      if (CSS_PROPS.has(word) || inPropPos) result += span('t-prop', esc(word));
      else if (inValuePos) result += span('t-bool', esc(word));
      else if (word.startsWith('--')) result += span('t-param', esc(word));
      else result += span('t-sel', esc(word));
      i = j; continue;
    }
    // CSS variables
    if (code[i] === '-' && code[i+1] === '-') {
      let j = i; while (j < len && /[a-zA-Z0-9_-]/.test(code[j])) j++;
      result += span('t-param', esc(code.slice(i,j))); i = j; continue;
    }
    result += esc(code[i++]);
  }
  return result;
}

// ─── HTML (with embedded CSS + JS) ───────────────────────────────────────────

function tokenizeHTML(code) {
  let result = '', i = 0, len = code.length;
  while (i < len) {
    // HTML comment
    if (code.startsWith('<!--', i)) {
      const end = code.indexOf('-->', i+4);
      const chunk = end === -1 ? code.slice(i) : code.slice(i, end+3);
      result += span('t-cmt', esc(chunk)); i += chunk.length; continue;
    }
    // DOCTYPE
    if (code.startsWith('<!', i) && !code.startsWith('<!--', i)) {
      const end = code.indexOf('>', i);
      const chunk = end === -1 ? code.slice(i) : code.slice(i, end+1);
      result += span('t-cmt', esc(chunk)); i += chunk.length; continue;
    }
    // Embedded <style> block
    if (code.toLowerCase().startsWith('<style', i)) {
      const gtIdx = code.indexOf('>', i);
      if (gtIdx !== -1) {
        const openTag = code.slice(i, gtIdx+1);
        result += _tokenizeHTMLOpenTag(openTag);
        const closeIdx = code.toLowerCase().indexOf('</style', gtIdx+1);
        const cssContent = closeIdx === -1 ? code.slice(gtIdx+1) : code.slice(gtIdx+1, closeIdx);
        result += tokenizeCSS(cssContent);
        i = gtIdx + 1 + cssContent.length;
        if (closeIdx !== -1) {
          const closeTag = code.slice(closeIdx, code.indexOf('>', closeIdx)+1);
          result += _tokenizeHTMLOpenTag(closeTag);
          i = closeIdx + closeTag.length;
        }
        continue;
      }
    }
    // Embedded <script> block
    if (code.toLowerCase().startsWith('<script', i)) {
      const gtIdx = code.indexOf('>', i);
      if (gtIdx !== -1) {
        const openTag = code.slice(i, gtIdx+1);
        // Don't embed-highlight external scripts
        if (!openTag.toLowerCase().includes('src=')) {
          result += _tokenizeHTMLOpenTag(openTag);
          const closeIdx = code.toLowerCase().indexOf('</script', gtIdx+1);
          const jsContent = closeIdx === -1 ? code.slice(gtIdx+1) : code.slice(gtIdx+1, closeIdx);
          result += tokenizeJS(jsContent);
          i = gtIdx + 1 + jsContent.length;
          if (closeIdx !== -1) {
            const closeTag = code.slice(closeIdx, code.indexOf('>', closeIdx)+1);
            result += _tokenizeHTMLOpenTag(closeTag);
            i = closeIdx + closeTag.length;
          }
          continue;
        }
      }
    }
    // Regular tag
    if (code[i] === '<') {
      const end = code.indexOf('>', i);
      const raw = end === -1 ? code.slice(i) : code.slice(i, end+1);
      result += _tokenizeHTMLOpenTag(raw); i += raw.length; continue;
    }
    // Entities
    if (code[i] === '&') {
      const semi = code.indexOf(';', i);
      if (semi > i && semi - i < 12) { result += span('t-bool', esc(code.slice(i, semi+1))); i = semi+1; continue; }
    }
    result += esc(code[i++]);
  }
  return result;
}

function _tokenizeHTMLOpenTag(raw) {
  let inner = raw.slice(1, raw.endsWith('/>') ? -2 : (raw.endsWith('>') ? -1 : undefined));
  const close = raw.startsWith('</');
  if (close) inner = inner.slice(1);
  const tagMatch = inner.match(/^([a-zA-Z0-9:_-]+)(.*)/s);
  if (!tagMatch) return esc(raw);
  const tagName = tagMatch[1];
  let attrs = tagMatch[2] || '';
  let out = span('t-punc', close ? '&lt;/' : '&lt;');
  out += span('t-tag', esc(tagName));
  out += _tokenizeHTMLAttrs(attrs);
  out += span('t-punc', raw.endsWith('/>') ? '/&gt;' : '&gt;');
  return out;
}

function _tokenizeHTMLAttrs(attrs) {
  let result = '', last = 0;
  const re = /\s+([a-zA-Z:@._\-]+)(?:\s*=\s*(?:"([^"]*?)"|'([^']*?)'|(\S+)))?/g;
  let m;
  while ((m = re.exec(attrs)) !== null) {
    result += esc(attrs.slice(last, m.index));
    result += ' ' + span('t-attr', esc(m[1]));
    const val = m[2] ?? m[3] ?? m[4];
    if (val !== undefined) {
      const q = m[0].includes('"') ? '"' : m[0].includes("'") ? "'" : '';
      result += span('t-op', '=');
      result += span('t-str', esc(q + val + q));
    }
    last = m.index + m[0].length;
  }
  result += esc(attrs.slice(last));
  return result;
}

// ─── JSON ────────────────────────────────────────────────────────────────────

function tokenizeJSON(code) {
  let result = '', i = 0, len = code.length;
  while (i < len) {
    // String
    if (code[i] === '"') {
      let j = i+1, s = '"';
      while (j < len) { if (code[j] === '\\') { s += code[j]+(code[j+1]||''); j+=2; continue; } if (code[j] === '"') { s+='"'; j++; break; } s+=code[j++]; }
      const str = code.slice(i, j);
      // Key detection: followed by optional space then colon
      const after = code.slice(j).trimStart();
      if (after.startsWith(':')) result += span('t-prop', esc(str));
      else result += span('t-str', esc(str));
      i = j; continue;
    }
    // Numbers
    if (/[0-9\-]/.test(code[i])) {
      let j = i; while (j < len && /[0-9.eE+\-]/.test(code[j])) j++;
      result += span('t-num', esc(code.slice(i,j))); i = j; continue;
    }
    // Keywords
    if (/[a-z]/.test(code[i])) {
      let j = i; while (j < len && /[a-z]/.test(code[j])) j++;
      const w = code.slice(i,j);
      result += w === 'null' ? span('t-null', esc(w)) : span('t-bool', esc(w));
      i = j; continue;
    }
    result += esc(code[i++]);
  }
  return result;
}

// ─── PYTHON ─────────────────────────────────────────────────────────────────

const PY_KW = new Set(['def','class','return','import','from','as','if','elif','else','for','while',
  'in','not','and','or','is','True','False','None','pass','break','continue','try','except',
  'finally','raise','with','yield','lambda','global','nonlocal','del','assert','async','await',
  'print','len','range','type','isinstance','hasattr','getattr','setattr','super','property',
  'staticmethod','classmethod']);

function tokenizePY(code) {
  let result = '', i = 0, len = code.length;
  while (i < len) {
    // Comments
    if (code[i] === '#') {
      const end = code.indexOf('\n', i);
      const chunk = end === -1 ? code.slice(i) : code.slice(i, end);
      result += span('t-cmt', esc(chunk)); i += chunk.length; continue;
    }
    // Triple-quoted strings
    if ((code[i] === '"' || code[i] === "'") && code[i+1] === code[i] && code[i+2] === code[i]) {
      const q = code.slice(i, i+3);
      const end = code.indexOf(q, i+3);
      const chunk = end === -1 ? code.slice(i) : code.slice(i, end+3);
      result += span('t-str', esc(chunk)); i += chunk.length; continue;
    }
    // Strings
    if (code[i] === '"' || code[i] === "'") {
      const q = code[i]; let j = i+1, s = q;
      while (j < len) { if (code[j] === '\\') { s+=code[j]+(code[j+1]||''); j+=2; continue; } if (code[j] === q || code[j] === '\n') { if(code[j]===q){s+=q;j++;} break; } s+=code[j++]; }
      result += span('t-str', esc(s)); i = j; continue;
    }
    // Numbers
    if (/[0-9]/.test(code[i])) {
      let j = i; while (j < len && /[0-9._eE+\-xXbBoO]/.test(code[j])) j++;
      result += span('t-num', esc(code.slice(i,j))); i = j; continue;
    }
    // Decorators
    if (code[i] === '@') {
      let j = i+1; while (j < len && /[a-zA-Z0-9_.]/.test(code[j])) j++;
      result += span('t-atrule', esc(code.slice(i,j))); i = j; continue;
    }
    // Identifiers
    if (/[a-zA-Z_]/.test(code[i])) {
      let j = i; while (j < len && /[a-zA-Z0-9_]/.test(code[j])) j++;
      const word = code.slice(i,j);
      const isCall = /\s*\(/.test(code.slice(j,j+3));
      if (PY_KW.has(word))   result += word === 'True'||word === 'False'||word === 'None' ? span('t-bool', esc(word)) : span('t-kw', esc(word));
      else if (isCall)       result += span('t-fn', esc(word));
      else if (/^[A-Z]/.test(word)) result += span('t-cls', esc(word));
      else                   result += span('t-id', esc(word));
      i = j; continue;
    }
    result += esc(code[i++]);
  }
  return result;
}

// ─── PHP ─────────────────────────────────────────────────────────────────────

const PHP_KW = new Set(['echo','print','if','else','elseif','foreach','for','while','do','switch',
  'case','break','continue','return','function','class','new','extends','implements','interface',
  'trait','abstract','static','public','protected','private','const','define','namespace','use',
  'require','require_once','include','include_once','try','catch','finally','throw','yield',
  'match','fn','array','list','isset','empty','unset','var_dump','die','exit','null','true','false',
  'NULL','TRUE','FALSE','__construct','__destruct']);

function tokenizePHP(code) {
  let result = '', i = 0, len = code.length;
  while (i < len) {
    // PHP open/close tags
    if (code.startsWith('<?php', i) || code.startsWith('<?=', i)) {
      const chunk = code.startsWith('<?php', i) ? '<?php' : '<?=';
      result += span('t-kw', esc(chunk)); i += chunk.length; continue;
    }
    if (code.startsWith('?>', i)) { result += span('t-kw', esc('?>')); i += 2; continue; }
    // Comments
    if (code[i] === '/' && code[i+1] === '/') { const e = code.indexOf('\n',i); const c = e===-1?code.slice(i):code.slice(i,e); result+=span('t-cmt',esc(c)); i+=c.length; continue; }
    if (code[i] === '#') { const e = code.indexOf('\n',i); const c = e===-1?code.slice(i):code.slice(i,e); result+=span('t-cmt',esc(c)); i+=c.length; continue; }
    if (code[i]==='/'&&code[i+1]==='*') { const e=code.indexOf('*/',i+2); const c=e===-1?code.slice(i):code.slice(i,e+2); result+=span('t-cmt',esc(c)); i+=c.length; continue; }
    // Strings
    if (code[i] === '"' || code[i] === "'") {
      const q = code[i]; let j = i+1, s = q;
      while (j < len) { if (code[j]==='\\'){s+=code[j]+(code[j+1]||'');j+=2;continue;} if (code[j]===q){s+=q;j++;break;} s+=code[j++]; }
      result += span('t-str', esc(s)); i = j; continue;
    }
    // Variables
    if (code[i] === '$') {
      let j = i+1; while (j < len && /[a-zA-Z0-9_]/.test(code[j])) j++;
      result += span('t-param', esc(code.slice(i,j))); i = j; continue;
    }
    // Numbers
    if (/[0-9]/.test(code[i])) {
      let j = i; while (j < len && /[0-9._eE+\-]/.test(code[j])) j++;
      result += span('t-num', esc(code.slice(i,j))); i = j; continue;
    }
    // Identifiers
    if (/[a-zA-Z_]/.test(code[i])) {
      let j = i; while (j < len && /[a-zA-Z0-9_]/.test(code[j])) j++;
      const word = code.slice(i,j);
      const isCall = /\s*\(/.test(code.slice(j,j+3));
      if (PHP_KW.has(word))  result += /^(null|true|false|NULL|TRUE|FALSE)$/.test(word) ? span('t-bool',esc(word)) : span('t-kw',esc(word));
      else if (isCall)       result += span('t-fn',esc(word));
      else if (/^[A-Z]/.test(word)) result += span('t-cls',esc(word));
      else                   result += span('t-id',esc(word));
      i = j; continue;
    }
    result += esc(code[i++]);
  }
  return result;
}

// ─── SHELL ───────────────────────────────────────────────────────────────────

const SH_KW = new Set(['if','then','else','elif','fi','for','in','do','done','while','until',
  'case','esac','function','return','exit','echo','printf','read','local','export','source',
  'cd','ls','pwd','mkdir','rm','mv','cp','chmod','chown','grep','sed','awk','cat','curl','wget']);

function tokenizeSH(code) {
  let result = '', i = 0, len = code.length;
  while (i < len) {
    if (code[i] === '#') { const e = code.indexOf('\n',i); const c = e===-1?code.slice(i):code.slice(i,e); result+=span('t-cmt',esc(c)); i+=c.length; continue; }
    if (code[i]==='$'&&code[i+1]==='{') { const e=code.indexOf('}',i); const c=e===-1?code.slice(i):code.slice(i,e+1); result+=span('t-param',esc(c)); i+=c.length; continue; }
    if (code[i]==='$') { let j=i+1; while(j<len&&/[a-zA-Z0-9_]/.test(code[j]))j++; result+=span('t-param',esc(code.slice(i,j))); i=j; continue; }
    if (code[i]==='"'||code[i]==="'") { const q=code[i]; let j=i+1,s=q; while(j<len){if(code[j]==='\\'){s+=code[j]+(code[j+1]||'');j+=2;continue;}if(code[j]===q){s+=q;j++;break;}s+=code[j++];} result+=span('t-str',esc(s)); i=j; continue; }
    if (/[a-zA-Z_]/.test(code[i])) {
      let j = i; while (j < len && /[a-zA-Z0-9_\-]/.test(code[j])) j++;
      const word = code.slice(i,j);
      if (SH_KW.has(word)) result += span('t-kw',esc(word));
      else result += span('t-id',esc(word));
      i = j; continue;
    }
    result += esc(code[i++]);
  }
  return result;
}

// ─── XML ─────────────────────────────────────────────────────────────────────

function tokenizeXML(code) { return tokenizeHTML(code); }

// ─── MARKDOWN ────────────────────────────────────────────────────────────────

function tokenizeMD(code) {
  return code.split('\n').map(line => {
    if (/^#{1,6}\s/.test(line)) return span('t-hdr', esc(line));
    if (/^\s*([-*+]|\d+\.)\s/.test(line)) return span('t-id', esc(line));
    if (/^>\s/.test(line)) return span('t-cmt', esc(line));
    if (/^```/.test(line)) return span('t-str', esc(line));
    if (/^---+$/.test(line.trim())) return span('t-op', esc(line));
    // Inline
    let l = esc(line);
    l = l.replace(/`([^`]+)`/g, (_,c) => span('t-str', '`'+c+'`'));
    l = l.replace(/\*\*([^*]+)\*\*/g, (_,c) => span('t-bold', '**'+c+'**'));
    l = l.replace(/\*([^*]+)\*/g, (_,c) => span('t-ital', '*'+c+'*'));
    l = l.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_,t,u) => span('t-link','['+t+']('+u+')'));
    return l;
  }).join('\n');
}
