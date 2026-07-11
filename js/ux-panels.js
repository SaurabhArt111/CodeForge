// =================== EXTENSIONS / GIT / GRAMMAR UI ===================

function getGrammarForFile(pathOrName) {
  if (!pathOrName) return null;
  const name = String(pathOrName);
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (state.grammarRegistry && state.grammarRegistry[ext]) return state.grammarRegistry[ext];
  return null;
}

function registerTextMateGrammar(ext, grammar) {
  const key = String(ext || '').toLowerCase();
  if (!key || !grammar) return null;
  if (!state.grammarRegistry) state.grammarRegistry = {};
  state.grammarRegistry[key] = grammar;
  if (grammar.fileTypes) grammar.fileTypes.forEach(ft => { state.grammarRegistry[String(ft).toLowerCase()] = grammar; });
  renderExtensionsPanel();
  notify(`Loaded grammar for ${key}`);
  return grammar;
}

function loadGrammarFromPrompt() {
  const raw = prompt('Paste a simple TextMate grammar JSON (scopeName + patterns array)');
  if (!raw) return;
  try {
    const grammar = JSON.parse(raw);
    if (!grammar.scopeName || !Array.isArray(grammar.patterns)) throw new Error('Grammar must contain scopeName and patterns');
    const fileTypes = Array.isArray(grammar.fileTypes) ? grammar.fileTypes : [];
    const key = fileTypes[0] || (grammar.scopeName.split('.').pop() || 'txt');
    registerTextMateGrammar(key, grammar);
  } catch (err) {
    notify('Grammar load failed: ' + err.message);
  }
}

function refreshGitStateFromFiles() {
  const changed = Object.keys(state.files)
    .filter(path => state.files[path]?.modified)
    .sort();
  state.gitState.changed = changed;
  state.gitState.staged = state.gitState.staged.filter(path => state.files[path]);
  return state.gitState;
}

function updateGitStateForFile(path) {
  const file = state.files[path];
  if (!file) return;
  if (file.modified && !state.gitState.changed.includes(path)) state.gitState.changed.push(path);
  if (!file.modified) state.gitState.changed = state.gitState.changed.filter(p => p !== path);
  renderGitPanel();
}

function toggleStageFile(path) {
  if (!path) return;
  const staged = state.gitState.staged.includes(path);
  state.gitState.staged = staged
    ? state.gitState.staged.filter(p => p !== path)
    : [...state.gitState.staged, path];
  refreshGitStateFromFiles();
  renderGitPanel();
  notify(staged ? 'Unstaged ' + path : 'Staged ' + path);
}

function stageAllFiles() {
  const files = Object.keys(state.files).filter(path => state.files[path]);
  state.gitState.staged = Array.from(new Set([...state.gitState.staged, ...files]));
  refreshGitStateFromFiles();
  renderGitPanel();
  notify('Staged all files');
}

function renderGitPanel() {
  const host = document.getElementById('git-panel');
  if (!host) return;
  const git = state.gitState || { branch: 'main', branches: ['main'], changed: [], staged: [] };
  const changedRows = (git.changed.length ? git.changed : Object.keys(state.files).slice(0, 6)).map(path => {
    const file = state.files[path];
    const staged = git.staged.includes(path);
    return `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">
      <div style="display:flex;flex-direction:column;min-width:0">
        <span style="font-size:12px;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(file?.name || path)}</span>
        <span style="font-size:11px;color:var(--text-muted)">${escapeHtml(path)}</span>
      </div>
      <button class="modal-btn" onclick="toggleStageFile('${path.replace(/'/g, "\\'")}')">${staged ? 'Unstage' : 'Stage'}</button>
    </div>`;
  }).join('');
  host.innerHTML = `
    <div style="background:var(--bg-secondary);border:1px solid var(--border);padding:8px;border-radius:6px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <strong style="font-size:12px">Branch</strong>
        <span style="font-size:12px;color:var(--accent)">${escapeHtml(git.branch)}</span>
      </div>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
        <select id="git-branch-select" style="flex:1;background:var(--bg-input);color:var(--text-primary);border:1px solid var(--border);padding:4px 6px;border-radius:4px" onchange="state.gitState.branch=this.value;document.getElementById('sb-branch').querySelector('span').textContent=this.value;renderGitPanel()">
          ${(git.branches || ['main']).map(branch => `<option value="${escapeHtml(branch)}" ${branch === git.branch ? 'selected' : ''}>${escapeHtml(branch)}</option>`).join('')}
        </select>
        <button class="modal-btn" onclick="state.gitState.branch = state.gitState.branch === 'main' ? 'feature/preview' : 'main'; document.getElementById('sb-branch').querySelector('span').textContent = state.gitState.branch; renderGitPanel(); notify('Branch switched')">Switch</button>
      </div>
      <div style="display:flex;justify-content:space-between;gap:6px">
        <button class="modal-btn" onclick="stageAllFiles()">Stage All</button>
        <button class="modal-btn" onclick="notify('Merge UI ready for branch ${escapeHtml(git.branch)}')">Merge</button>
      </div>
    </div>
    <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em">Changes</div>
    <div style="display:flex;flex-direction:column;gap:4px">${changedRows || '<div style="font-size:12px;color:var(--text-muted)">No file changes</div>'}</div>
    <div style="font-size:11px;color:var(--text-muted);margin-top:6px">LightningFS sync: ${escapeHtml(getWorkspaceSyncSummary())}</div>
  `;
  const branchEl = document.getElementById('sb-branch');
  if (branchEl) branchEl.querySelector('span').textContent = git.branch;
}

function renderExtensionsPanel() {
  const host = document.getElementById('extensions-list');
  const searchInput = document.getElementById('extensions-search');
  if (!host) return;
  const query = (searchInput?.value || '').toLowerCase();
  const visible = (state.extensions || []).filter(ext => !query || `${ext.name} ${ext.desc}`.toLowerCase().includes(query));
  host.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:8px">
      <div style="background:var(--bg-secondary);border:1px solid var(--border);padding:8px;border-radius:6px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <strong style="font-size:12px">Registry</strong>
          <button class="modal-btn" onclick="loadGrammarFromPrompt()">Load Grammar</button>
        </div>
        <div style="font-size:11px;color:var(--text-muted)">Installable add-ons for the browser workspace</div>
      </div>
      ${visible.map(ext => `
        <div class="tree-item" style="flex-direction:column;align-items:flex-start;padding:10px;border:1px solid var(--border);border-radius:6px;background:var(--bg-secondary)">
          <div style="display:flex;align-items:center;justify-content:space-between;width:100%">
            <div style="display:flex;gap:8px;align-items:center">
              <i class="${ext.installed ? 'fas fa-check-circle' : 'fas fa-puzzle-piece'}" style="color:${ext.installed ? 'var(--accent)' : 'var(--text-muted)'}"></i>
              <span>${escapeHtml(ext.name)}</span>
            </div>
            <button class="modal-btn" onclick="toggleExtension('${ext.id}')">${ext.installed ? 'Installed' : 'Install'}</button>
          </div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px;padding-left:22px">${escapeHtml(ext.desc)} · ${escapeHtml(ext.category || 'Extension')}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function toggleExtension(id) {
  const ext = (state.extensions || []).find(item => item.id === id);
  if (!ext) return;
  ext.installed = !ext.installed;
  renderExtensionsPanel();
  notify(ext.installed ? `Installed ${ext.name}` : `Removed ${ext.name}`);
}
