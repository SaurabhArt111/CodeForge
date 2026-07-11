// =================== LIGHTNINGFS / WORKSPACE SYNC ===================
// Lightweight bidirectional sync bridge for browser-only workspace state.

function ensureWorkspaceSyncState() {
  if (!state.workspaceSync) {
    state.workspaceSync = {
      enabled: true,
      provider: 'LightningFS',
      remoteFiles: {},
      lastSyncAt: null,
      status: 'idle',
      lastEvent: 'Ready',
    };
  }
  return state.workspaceSync;
}

function toggleWorkspaceSync() {
  const sync = ensureWorkspaceSyncState();
  sync.enabled = !sync.enabled;
  sync.status = sync.enabled ? 'active' : 'paused';
  sync.lastEvent = sync.enabled ? 'Workspace sync enabled' : 'Workspace sync paused';
  notify(sync.enabled ? 'LightningFS sync enabled' : 'LightningFS sync paused');
  renderGitPanel();
  renderExtensionsPanel();
}

function syncFileToWorkspace(path, content) {
  const sync = ensureWorkspaceSyncState();
  if (!sync.enabled) return;
  sync.remoteFiles[path] = content;
  sync.lastSyncAt = new Date().toLocaleTimeString();
  sync.status = 'active';
  sync.lastEvent = `Synced ${path}`;
  if (state.settings?.autoSave !== false) saveToStorage();
}

function syncWorkspaceToEditor(path, content) {
  const file = state.files[path];
  if (!file || file.content === content) return;
  file.content = content;
  file.modified = true;
  const editor = document.getElementById('ta-' + safeId(path));
  if (editor && editor.value !== content) {
    editor.value = content;
    onEditorInput(editor, path, true);
  }
  renderTabs();
  notify('Workspace update applied');
}

function reconcileWorkspaceSync() {
  const sync = ensureWorkspaceSyncState();
  if (!sync.enabled) return;
  Object.keys(sync.remoteFiles).forEach(path => {
    if (!state.files[path]) return;
    const remote = sync.remoteFiles[path];
    const local = state.files[path].content || '';
    if (remote !== local) {
      syncWorkspaceToEditor(path, remote);
    }
  });
}

function applyWorkspaceSnapshot(snapshot) {
  const sync = ensureWorkspaceSyncState();
  if (!snapshot || typeof snapshot !== 'object') return;
  sync.remoteFiles = { ...snapshot };
  sync.lastEvent = 'Snapshot restored';
  Object.entries(snapshot).forEach(([path, content]) => {
    if (state.files[path]) state.files[path].content = content;
  });
  renderTree();
  renderTabs();
}

function watchWorkspaceChange(path, content) {
  const sync = ensureWorkspaceSyncState();
  if (!sync.enabled) return;
  syncFileToWorkspace(path, content);
  if (state.settings?.autoSave !== false) saveToStorage();
}

function getWorkspaceSyncSummary() {
  const sync = ensureWorkspaceSyncState();
  return `${sync.provider} · ${sync.enabled ? 'on' : 'paused'} · ${Object.keys(sync.remoteFiles).length} files`;
}
