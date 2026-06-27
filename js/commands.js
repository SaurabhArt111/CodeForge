// =================== COMMANDS & MISC ===================
// js/commands.js  (stub — all commands defined in ui.js COMMANDS array)
// Additional command helpers and aliases live here.

function formatCurrentFile() {
  const path = state.activeTab;
  if (!path || !state.files[path]) return;
  const ta = getActiveTextarea();
  if (!ta) return;
  const file = state.files[path];
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  let formatted = ta.value;
  try {
    if (ext === 'json') {
      formatted = JSON.stringify(JSON.parse(ta.value), null, 2);
    } else if (ext === 'html' || ext === 'htm') {
      formatted = basicHTMLFormat(ta.value);
    } else if (ext === 'css') {
      formatted = basicCSSFormat(ta.value);
    } else {
      notify('Format: full formatter not available for ' + ext);
      return;
    }
    ta.value = formatted;
    file.content = formatted;
    onEditorInput(ta, path);
    notify('Formatted: ' + file.name);
  } catch(e) {
    notify('Format error: ' + e.message);
  }
}

function basicHTMLFormat(html) {
  // Very simple indenter
  let indent = 0;
  const voidTags = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
  return html
    .replace(/>\s*</g, '>\n<')
    .split('\n')
    .map(line => {
      line = line.trim();
      if (!line) return '';
      if (line.match(/^<\/[a-z]/i)) indent = Math.max(0, indent - 1);
      const result = '  '.repeat(indent) + line;
      const tagMatch = line.match(/^<([a-z][a-z0-9]*)/i);
      const isVoid = tagMatch && voidTags.has(tagMatch[1].toLowerCase());
      if (tagMatch && !isVoid && !line.startsWith('<!') && !line.startsWith('</') && !line.endsWith('/>')) {
        indent++;
      }
      return result;
    })
    .filter(l => l !== '')
    .join('\n');
}

function basicCSSFormat(css) {
  return css
    .replace(/\s*\{\s*/g, ' {\n  ')
    .replace(/;\s*/g, ';\n  ')
    .replace(/\s*\}\s*/g, '\n}\n')
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .trim();
}
