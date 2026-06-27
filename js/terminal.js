// =================== TERMINAL v3.0 — REALISTIC FEEL ===================
// Simulates a real bash-like terminal with prompt, color, history,
// file system commands that actually reflect editor state.

const _TERM_VERSION = 'CodeForge Terminal v3.0';
const _TERM_COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
};

let _termCwd = '';  // current working directory (relative to workspace root)

// ─── PRINT HELPERS ────────────────────────────────────────────────────────────
function termPrint(text, cls) {
  const term = document.getElementById('terminal');
  if (!term) return;
  const line = document.createElement('div');
  line.className = 'term-line ' + (cls || '');
  line.innerHTML = _ansiToHtml(text);
  term.appendChild(line);
  term.scrollTop = term.scrollHeight;
}

function termPrompt() {
  const dir = _termCwd ? _termCwd : '~';
  return `<span class="tp-user">guest@codeforge</span><span class="tp-sep">:</span><span class="tp-dir">/${dir}</span><span class="tp-sym">$</span> `;
}

function termPrintPromptLine(cmd) {
  const term = document.getElementById('terminal');
  if (!term) return;
  const line = document.createElement('div');
  line.className = 'term-line term-prompt-line';
  line.innerHTML = termPrompt() + escapeHtml(cmd);
  term.appendChild(line);
  term.scrollTop = term.scrollHeight;
}

// ─── ANSI → HTML ─────────────────────────────────────────────────────────────
function _ansiToHtml(text) {
  return escapeHtml(text)
    .replace(/\x1b\[0m/g, '</span>')
    .replace(/\x1b\[1m/g, '<span style="font-weight:700">')
    .replace(/\x1b\[31m/g, '<span style="color:#f14c4c">')
    .replace(/\x1b\[32m/g, '<span style="color:#4ec9b0">')
    .replace(/\x1b\[33m/g, '<span style="color:#dcdcaa">')
    .replace(/\x1b\[34m/g, '<span style="color:#569cd6">')
    .replace(/\x1b\[36m/g, '<span style="color:#9cdcfe">')
    .replace(/\x1b\[37m/g, '<span style="color:#d4d4d4">')
    .replace(/\x1b\[90m/g, '<span style="color:#6a6a6a">');
}

// ─── AUTOCOMPLETE (Tab key in terminal) ──────────────────────────────────────
function termTab(e) {
  if (e.key !== 'Tab') return;
  e.preventDefault();
  const inp = document.getElementById('terminal-input');
  if (!inp) return;
  const val = inp.value;
  const parts = val.trim().split(/\s+/);
  if (parts.length < 2) return;
  const prefix = parts[parts.length - 1];
  const allPaths = [
    ...[...state.folders].filter(f => (_termCwd ? f.startsWith(_termCwd + '/') || f === _termCwd : true)),
    ...Object.keys(state.files).filter(f => (_termCwd ? f.startsWith(_termCwd + '/') : !f.includes('/')))
  ].map(p => _termCwd ? p.slice(_termCwd.length + 1) : p).filter(p => p.startsWith(prefix));
  if (allPaths.length === 1) { parts[parts.length - 1] = allPaths[0]; inp.value = parts.join(' ') + ' '; }
  else if (allPaths.length > 1) { termPrint(allPaths.join('  '), 'term-info'); }
}

// ─── KEYBOARD HANDLER ────────────────────────────────────────────────────────
function terminalKey(e) {
  if (e.key === 'Tab') { termTab(e); return; }
  if (e.key === 'Enter') {
    const inp = document.getElementById('terminal-input');
    if (!inp) return;
    const cmd = inp.value;
    inp.value = '';
    if (cmd.trim()) { state.termHistory.unshift(cmd); state.termHistoryIdx = -1; }
    termPrintPromptLine(cmd);
    processTerminalCmd(cmd.trim());
    return;
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    state.termHistoryIdx = Math.min(state.termHistoryIdx + 1, state.termHistory.length - 1);
    const inp = document.getElementById('terminal-input');
    if (inp) inp.value = state.termHistory[state.termHistoryIdx] || '';
    return;
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    state.termHistoryIdx = Math.max(state.termHistoryIdx - 1, -1);
    const inp = document.getElementById('terminal-input');
    if (inp) inp.value = state.termHistoryIdx === -1 ? '' : state.termHistory[state.termHistoryIdx];
    return;
  }
  if (e.ctrlKey && e.key === 'c') {
    e.preventDefault();
    termPrint('^C', 'term-error');
    document.getElementById('terminal-input').value = '';
    return;
  }
  if (e.ctrlKey && e.key === 'l') {
    e.preventDefault();
    document.getElementById('terminal').innerHTML = '';
    return;
  }
}

// ─── RESOLVE PATH ────────────────────────────────────────────────────────────
function _resolvePath(arg) {
  if (!arg || arg === '~') return '';
  if (arg.startsWith('/')) return arg.slice(1); // absolute
  if (arg === '..') {
    if (!_termCwd) return '';
    const parts = _termCwd.split('/'); parts.pop();
    return parts.join('/');
  }
  if (arg === '.') return _termCwd;
  return _termCwd ? _termCwd + '/' + arg : arg;
}

function _filesInDir(dir) {
  return Object.keys(state.files).filter(fp => {
    if (!dir) return !fp.includes('/');
    return fp.startsWith(dir + '/') && !fp.slice(dir.length + 1).includes('/');
  });
}

function _foldersInDir(dir) {
  return [...state.folders].filter(f => {
    if (!dir) return !f.includes('/');
    return f.startsWith(dir + '/') && !f.slice(dir.length + 1).includes('/');
  });
}

// ─── COMMAND PROCESSOR ───────────────────────────────────────────────────────
function processTerminalCmd(cmd) {
  if (!cmd) return;
  const tokens = _parseCmd(cmd);
  const base = tokens[0];
  const args = tokens.slice(1);

  const CMDS = {
    // ── Navigation ──
    'pwd': () => termPrint(_termCwd ? '/' + _termCwd : '/'),
    'cd': () => {
      if (!args[0] || args[0] === '~') { _termCwd = ''; return; }
      const target = _resolvePath(args[0]);
      if (!target) { _termCwd = ''; return; }
      if (state.folders.has(target)) { _termCwd = target; }
      else termPrint(`cd: no such directory: ${args[0]}`, 'term-error');
    },

    // ── Listing ──
    'ls': () => {
      const dir = args[0] ? _resolvePath(args[0]) : _termCwd;
      const folders = _foldersInDir(dir);
      const files = _filesInDir(dir);
      if (!folders.length && !files.length) { termPrint('(empty)'); return; }
      const parts = [];
      folders.forEach(f => parts.push(`\x1b[34m\x1b[1m${f.split('/').pop()}/\x1b[0m`));
      files.forEach(fp => {
        const name = fp.split('/').pop();
        const ext = name.split('.').pop().toLowerCase();
        const isExec = ['sh', 'bash', 'py'].includes(ext);
        parts.push(isExec ? `\x1b[32m${name}\x1b[0m` : name);
      });
      // Grid layout: up to 4 per row
      for (let i = 0; i < parts.length; i += 4) termPrint(parts.slice(i, i + 4).map(p => p.padEnd(30)).join(''), 'term-ls');
    },
    'll': () => {
      const dir = args[0] ? _resolvePath(args[0]) : _termCwd;
      const folders = _foldersInDir(dir);
      const files = _filesInDir(dir);
      termPrint(`total ${folders.length + files.length}`);
      folders.forEach(f => termPrint(`drwxr-xr-x  2 guest guest  ${new Date().toLocaleDateString()} \x1b[34m\x1b[1m${f.split('/').pop()}/\x1b[0m`));
      files.forEach(fp => {
        const file = state.files[fp];
        const size = file?.content ? file.content.length : 0;
        const name = fp.split('/').pop();
        termPrint(`-rw-r--r--  1 guest guest  ${String(size).padStart(6)} ${new Date().toLocaleDateString()} ${name}`);
      });
    },
    'dir': () => CMDS['ll'](),

    // ── File ops ──
    'cat': () => {
      if (!args[0]) { termPrint('cat: missing operand', 'term-error'); return; }
      const path = _resolvePath(args[0]);
      const file = state.files[path];
      if (!file) { termPrint(`cat: ${args[0]}: No such file`, 'term-error'); return; }
      if (file.isImage) { termPrint(`cat: ${args[0]}: Binary file (image)`, 'term-warn'); return; }
      const lines = (file.content || '').split('\n').slice(0, 100);
      lines.forEach(l => termPrint(l));
      if ((file.content || '').split('\n').length > 100) termPrint(`... (${(file.content || '').split('\n').length - 100} more lines)`);
    },
    'head': () => {
      const n = args.includes('-n') ? parseInt(args[args.indexOf('-n') + 1]) : 10;
      const filePath = args.find(a => !a.startsWith('-') && isNaN(parseInt(a)));
      if (!filePath) { termPrint('head: missing operand', 'term-error'); return; }
      const file = state.files[_resolvePath(filePath)];
      if (!file) { termPrint(`head: ${filePath}: No such file`, 'term-error'); return; }
      (file.content || '').split('\n').slice(0, n).forEach(l => termPrint(l));
    },
    'wc': () => {
      if (!args[0]) { termPrint('wc: missing operand', 'term-error'); return; }
      const file = state.files[_resolvePath(args[0])];
      if (!file) { termPrint(`wc: ${args[0]}: No such file`, 'term-error'); return; }
      const content = file.content || '';
      const lines = content.split('\n').length;
      const words = content.split(/\s+/).filter(Boolean).length;
      const chars = content.length;
      termPrint(`  ${lines}  ${words}  ${chars} ${args[0]}`);
    },
    'touch': () => {
      if (!args[0]) { termPrint('touch: missing operand', 'term-error'); return; }
      const path = _resolvePath(args[0]);
      if (!state.files[path]) {
        const name = args[0].split('/').pop();
        state.files[path] = { name, content: getDefaultContent(name), type: 'file' };
        renderTree(); saveToStorage();
        termPrint(`Created: ${path}`, 'term-success');
      }
    },
    'mkdir': () => {
      if (!args[0]) { termPrint('mkdir: missing operand', 'term-error'); return; }
      const path = _resolvePath(args[0]);
      state.folders.add(path);
      renderTree(); saveToStorage();
      termPrint(`mkdir: created directory '${args[0]}'`, 'term-success');
    },
    'rm': () => {
      if (!args[0]) { termPrint('rm: missing operand', 'term-error'); return; }
      const isR = args.includes('-r') || args.includes('-rf') || args.includes('-R');
      const target = args.find(a => !a.startsWith('-'));
      if (!target) return;
      const path = _resolvePath(target);
      if (isR && state.folders.has(path)) {
        const prefix = path + '/';
        Object.keys(state.files).forEach(fp => { if (fp.startsWith(prefix)) { closeTab(fp); delete state.files[fp]; } });
        state.folders.forEach(f => { if (f === path || f.startsWith(prefix)) state.folders.delete(f); });
        renderTree(); renderTabs(); saveToStorage();
        termPrint(`removed directory: '${target}'`, 'term-success');
      } else if (state.files[path]) {
        closeTab(path); delete state.files[path];
        renderTree(); renderTabs(); saveToStorage();
        termPrint(`removed '${target}'`, 'term-success');
      } else termPrint(`rm: cannot remove '${target}': No such file or directory`, 'term-error');
    },
    'cp': () => {
      if (args.length < 2) { termPrint('cp: missing operand', 'term-error'); return; }
      const src = _resolvePath(args[0]), dst = _resolvePath(args[1]);
      const file = state.files[src];
      if (!file) { termPrint(`cp: '${args[0]}': No such file`, 'term-error'); return; }
      const dstName = args[1].includes('/') ? args[1].split('/').pop() : args[1];
      state.files[dst] = { ...file, name: dstName };
      renderTree(); saveToStorage(); termPrint(`'${args[0]}' -> '${args[1]}'`, 'term-success');
    },
    'mv': () => {
      if (args.length < 2) { termPrint('mv: missing operand', 'term-error'); return; }
      const src = _resolvePath(args[0]), dst = _resolvePath(args[1]);
      const file = state.files[src];
      if (!file) { termPrint(`mv: '${args[0]}': No such file`, 'term-error'); return; }
      const dstName = args[1].split('/').pop();
      state.files[dst] = { ...file, name: dstName }; delete state.files[src];
      if (state.openTabs.includes(src)) updateTabPath(src, dst);
      renderTree(); renderTabs(); saveToStorage(); termPrint(`'${args[0]}' -> '${args[1]}'`, 'term-success');
    },
    'grep': () => {
      if (args.length < 2) { termPrint('Usage: grep <pattern> <file>', 'term-error'); return; }
      const pattern = args[0], filePath = _resolvePath(args[1]);
      const file = state.files[filePath];
      if (!file) { termPrint(`grep: ${args[1]}: No such file`, 'term-error'); return; }
      const regex = new RegExp(pattern, 'gi');
      let found = 0;
      (file.content || '').split('\n').forEach((line, i) => {
        if (regex.test(line)) { termPrint(`${i + 1}: ${line.replace(regex, m => `\x1b[33m${m}\x1b[0m`)}`); found++; }
      });
      if (!found) termPrint(`(no matches for "${pattern}")`);
    },
    'find': () => {
      const nameFlag = args.indexOf('-name');
      const pattern = nameFlag !== -1 ? args[nameFlag + 1] : (args[0] || '');
      const re = pattern ? new RegExp(pattern.replace(/\*/g, '.*').replace(/\?/g, '.'), 'i') : /.*/;
      const matches = Object.keys(state.files).filter(p => re.test(p.split('/').pop()));
      matches.forEach(p => termPrint('./' + p));
      if (!matches.length) termPrint('(no matches)');
    },

    // ── System ──
    'echo': () => termPrint(args.join(' ').replace(/^['"]|['"]$/g, '')),
    'clear': () => { document.getElementById('terminal').innerHTML = ''; },
    'cls': () => { document.getElementById('terminal').innerHTML = ''; },
    'history': () => state.termHistory.forEach((c, i) => termPrint(`  ${String(i + 1).padStart(3)}  ${c}`)),
    'date': () => termPrint(new Date().toString()),
    'whoami': () => termPrint('guest'),
    'uname': () => termPrint('CodeForge Browser Terminal ' + (args.includes('-a') ? 'x86_64 GNU/Linux' : '')),
    'env': () => { termPrint('PATH=/usr/local/bin:/usr/bin:/bin'); termPrint('HOME=/'); termPrint(`PWD=${_termCwd ? '/' + _termCwd : '/'}`); termPrint('TERM=xterm-256color'); termPrint('EDITOR=codeforge'); },
    'which': () => { const known = ['ls', 'cd', 'cat', 'echo', 'pwd', 'mkdir', 'rm', 'touch', 'cp', 'mv', 'grep', 'find', 'node', 'npm']; termPrint(known.includes(args[0]) ? `/usr/bin/${args[0]}` : `which: ${args[0] || '??'}: not found`); },
    'man': () => termPrint(`man: use 'help' for built-in command reference`, 'term-warn'),

    // ── Node / npm simulation ──
    'node': () => {
      if (!args[0]) { termPrint('Node.js REPL (simulated). Use the Console panel for real evaluation.', 'term-warn'); return; }
      const path = _resolvePath(args[0]);
      const file = state.files[path];
      if (!file) { termPrint(`node: ${args[0]}: No such file`, 'term-error'); return; }
      termPrint(`Running ${args[0]}...`, 'term-info');
      switchPanel('console'); if (!state.panelVisible) togglePanel();
      const out = document.getElementById('console-output'); if (!out) return;
      const logs = [], origLog = console.log, origErr = console.error, origWarn = console.warn;
      console.log = (...a) => { logs.push({ t: 'log', m: a.map(x => typeof x === 'object' ? JSON.stringify(x, null, 2) : String(x)).join(' ') }); origLog(...a); };
      console.error = (...a) => { logs.push({ t: 'error', m: a.map(String).join(' ') }); origErr(...a); };
      console.warn = (...a) => { logs.push({ t: 'warn', m: a.map(String).join(' ') }); origWarn(...a); };
      try {
        new Function(file.content)();
        console.log = origLog; console.error = origErr; console.warn = origWarn;
        logs.forEach(l => { const d = document.createElement('div'); d.className = 'terminal-line'; d.style.color = l.t === 'error' ? 'var(--red)' : l.t === 'warn' ? 'var(--yellow)' : 'var(--text-primary)'; d.textContent = (l.t !== 'log' ? `[${l.t.toUpperCase()}] ` : '') + l.m; out.appendChild(d); });
        out.scrollTop = out.scrollHeight;
        termPrint(`✓ Executed (see Console panel for output)`, 'term-success');
      } catch (err) {
        console.log = origLog; console.error = origErr; console.warn = origWarn;
        termPrint(`Error: ${err.message}`, 'term-error');
      }
    },
    'npm': () => {
      const sub = args[0] || '';
      if (sub === 'init') { termPrint('Wrote to package.json'); state.files['package.json'] = { name: 'package.json', content: '{\n  "name": "my-project",\n  "version": "1.0.0",\n  "description": "",\n  "main": "index.js",\n  "scripts": {}\n}', type: 'file' }; renderTree(); saveToStorage(); }
      else if (sub === 'install' || sub === 'i') { termPrint('npm WARN: This is a browser environment.', 'term-warn'); termPrint('npm WARN: Package installation is not supported.', 'term-warn'); }
      else if (sub === 'run') { termPrint(`npm run ${args[1] || '<script>'}: script execution is simulated.`, 'term-warn'); }
      else if (sub === 'list' || sub === 'ls') { const pkg = state.files['package.json']; if (pkg) { try { const p = JSON.parse(pkg.content); const deps = Object.keys(p.dependencies || {}); termPrint(deps.length ? deps.join('\n') : '(no dependencies)'); } catch { termPrint('(could not parse package.json)', 'term-warn'); } } else termPrint('npm ERR! No package.json found', 'term-error'); }
      else { termPrint(`npm: unknown command '${sub}'. Available: init, install, run, list`, 'term-warn'); }
    },
    'python': () => { termPrint('Python (simulated browser environment)', 'term-warn'); if (args[0]) { const path = _resolvePath(args[0]); const file = state.files[path]; if (!file) { termPrint(`python: can't open file '${args[0]}': No such file`, 'term-error'); return; } termPrint(`Running ${args[0]}...`, 'term-info'); termPrint('Note: Python execution is not supported in the browser.', 'term-warn'); } else { termPrint('Python 3.x.x (CodeForge Browser, Dec 2024)', 'term-info'); termPrint('Type "exit" to close', 'term-info'); } },
    'python3': () => CMDS['python'](),

    // ── Help ─────────────────────────────────────────────────────────────────
    'help': () => {
      termPrint(`\x1b[1m${_TERM_VERSION}\x1b[0m — Available commands:`, 'term-info');
      const cols = [
        ['Navigation', ['cd <dir>', 'pwd', 'ls [dir]', 'll [dir]']],
        ['Files', ['cat <file>', 'head <file>', 'touch <name>', 'mkdir <name>']],
        ['Operations', ['cp <src> <dst>', 'mv <src> <dst>', 'rm [-r] <path>', 'wc <file>']],
        ['Search', ['grep <pat> <file>', 'find -name <pat>']],
        ['System', ['echo', 'clear', 'date', 'whoami', 'history', 'env']],
        ['Runtime', ['node <file>', 'npm init|install|run', 'python3 <file>']],
      ];
      cols.forEach(([section, cmds]) => {
        termPrint(`\x1b[33m${section}:\x1b[0m`);
        termPrint('  ' + cmds.join('   '));
      });
      termPrint(`\x1b[90mTip: Ctrl+C cancel · Ctrl+L clear · Tab autocomplete\x1b[0m`);
    },
  };

  // Alias
  CMDS['dir'] = CMDS['ll'];

  if (CMDS[base]) { CMDS[base](); }
  else if (base === 'exit' || base === 'quit') { termPrint('Cannot exit a browser terminal.', 'term-warn'); }
  else { termPrint(`\x1b[31m${escapeHtml(base)}: command not found\x1b[0m  (type 'help' for commands)`); }

  // Update prompt display
  _updateTerminalPromptDisplay();
}

function _parseCmd(cmd) {
  const tokens = [];
  let cur = '', inQ = false, q = '';
  for (const ch of cmd) {
    if (inQ) { if (ch === q) inQ = false; else cur += ch; }
    else if (ch === '"' || ch === "'") { inQ = true; q = ch; }
    else if (ch === ' ' && cur) { tokens.push(cur); cur = ''; }
    else if (ch !== ' ') cur += ch;
  }
  if (cur) tokens.push(cur);
  return tokens;
}

function _updateTerminalPromptDisplay() {
  const promptEl = document.getElementById('terminal-prompt');
  if (promptEl) {
    const dir = _termCwd ? '~/' + _termCwd : '~';
    promptEl.innerHTML = `<span class="tp-user">guest</span><span class="tp-at">@</span><span class="tp-host">codeforge</span><span class="tp-sep">:</span><span class="tp-dir">${dir}</span><span class="tp-sym">$</span>`;
  }
}

// ─── REPL (Console panel) ────────────────────────────────────────────────────
function replEval(e) {
  if (e.key !== 'Enter') return;
  const input = document.getElementById('console-repl-input');
  const output = document.getElementById('console-output');
  if (!input || !output) return;
  const code = input.value.trim();
  input.value = '';
  if (!code) return;
  const promptDiv = document.createElement('div');
  promptDiv.className = 'terminal-line';
  promptDiv.style.color = 'var(--yellow)';
  promptDiv.textContent = '> ' + code;
  output.appendChild(promptDiv);
  try {
    const result = eval(code);
    const d = document.createElement('div');
    d.className = 'terminal-line console-result';
    d.textContent = result !== undefined ? (typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result)) : 'undefined';
    output.appendChild(d);
  } catch (err) {
    const d = document.createElement('div');
    d.className = 'terminal-line console-error';
    d.textContent = '✗ ' + err.message;
    output.appendChild(d);
  }
  output.scrollTop = output.scrollHeight;
}

// ─── PANEL ───────────────────────────────────────────────────────────────────
function togglePanel() {
  state.panelVisible = !state.panelVisible;
  const panel = document.getElementById('panel');
  if (!panel) return;
  panel.classList.toggle('hidden', !state.panelVisible);
  if (state.panelVisible) initTerminalWelcome();
}

function switchPanel(name) {
  const panels = { terminal: 'pv-terminal', console: 'pv-console', problems: 'pv-problems' };
  Object.entries(panels).forEach(([n, id]) => document.getElementById(id)?.classList.toggle('active', n === name));
  document.querySelectorAll('#panel-tabs .panel-tab').forEach((tab, i) => {
    tab.classList.toggle('active', ['terminal', 'console', 'problems'][i] === name);
  });
}

function initTerminalWelcome() {
  const term = document.getElementById('terminal');
  if (!term || term.children.length > 0) return;
  termPrint(`\x1b[1m\x1b[36m${_TERM_VERSION}\x1b[0m`, 'term-info');
  termPrint(`\x1b[90mType 'help' for commands · Tab autocomplete · ↑↓ history\x1b[0m`, 'term-info');
  termPrint('');
  _updateTerminalPromptDisplay();
}

function terminalPrint(text, type) { termPrint(text, type); }

// ─── PANEL RESIZE ────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const resize = document.getElementById('panel-resize');
  if (!resize) return;
  let dragging = false, startY, startH;
  resize.addEventListener('mousedown', e => { dragging = true; startY = e.clientY; const panel = document.getElementById('panel'); startH = panel ? panel.clientHeight : 200; e.preventDefault(); });
  document.addEventListener('mousemove', e => { if (!dragging) return; const panel = document.getElementById('panel'); if (!panel) return; panel.style.height = Math.min(Math.max(80, startH + (startY - e.clientY)), window.innerHeight - 200) + 'px'; });
  document.addEventListener('mouseup', () => { dragging = false; });
  _updateTerminalPromptDisplay();
});

// ─── MISSING FUNCTIONS ───────────────────────────────────────────────────
function getDefaultContent(name) {
  const ext = name.split('.').pop().toLowerCase();
  const templates = {
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${name}</title>
</head>
<body>
  <h1>Hello World</h1>
</body>
</html>`,
    css: `/* ${name} */
body {
  margin: 0;
  font-family: Arial, sans-serif;
}`,
    js: `// ${name}
console.log('Hello World');`,
    py: `# ${name}
print('Hello World')`,
    json: `{
  "name": "project",
  "version": "1.0.0"
}`,
    md: `# ${name}

Welcome to your new Markdown file.`,
    sh: `#!/bin/bash
# ${name}
echo "Hello World"`,
  };
  return templates[ext] || '';
}

function updateTabPath(oldPath, newPath) {
  const idx = state.openTabs.indexOf(oldPath);
  if (idx !== -1) {
    state.openTabs[idx] = newPath;
    // Update DOM id
    const editor = document.getElementById('editor-' + safeId(oldPath));
    if (editor) {
      editor.id = 'editor-' + safeId(newPath);
      editor.dataset.path = newPath;
    }
  }
  if (state.activeTab === oldPath) state.activeTab = newPath;
  if (state.previewTab === oldPath) state.previewTab = newPath;
}
