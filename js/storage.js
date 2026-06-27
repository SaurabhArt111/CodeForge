// =================== STORAGE ===================
// js/storage.js — IndexedDB + localStorage persistence

function initDB() {
  return new Promise((resolve) => {
    const req = indexedDB.open('CodeForgePro', 2);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'path' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
    };
    req.onsuccess = e => { state.db = e.target.result; resolve(); };
    req.onerror = () => resolve();
  });
}

async function dbPut(store, val) {
  if (!state.db) return;
  return new Promise(res => {
    const tx = state.db.transaction(store, 'readwrite');
    tx.objectStore(store).put(val);
    tx.oncomplete = res;
  });
}

async function dbGetAll(store) {
  if (!state.db) return [];
  return new Promise(res => {
    const tx = state.db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => res(req.result);
    req.onerror = () => res([]);
  });
}

async function dbDelete(store, key) {
  if (!state.db) return;
  return new Promise(res => {
    const tx = state.db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = res;
  });
}

async function dbClear(store) {
  if (!state.db) return;
  return new Promise(res => {
    const tx = state.db.transaction(store, 'readwrite');
    tx.objectStore(store).clear();
    tx.oncomplete = res;
  });
}

async function saveToStorage() {
  if (state.db) {
    for (const [path, file] of Object.entries(state.files)) {
      await dbPut('files', { path, ...file });
    }
    await dbPut('meta', { key: 'state', data: {
      folders: [...state.folders],
      openTabs: state.openTabs,
      activeTab: state.activeTab,
      settings: state.settings,
      collapsedFolders: [...state.collapsedFolders],
      recentProjects: state.recentProjects,
      snippets: state.snippets,
    }});
    document.getElementById('sb-storage').textContent = 'IDB ✓';
  } else {
    try {
      const data = { files: state.files, folders: [...state.folders], openTabs: state.openTabs, activeTab: state.activeTab };
      localStorage.setItem('codeforge_data', JSON.stringify(data));
    } catch(e) {}
  }
}

async function loadFromStorage() {
  await initDB();
  if (state.db) {
    const files = await dbGetAll('files');
    files.forEach(f => { const { path, ...file } = f; state.files[path] = file; });
    const metaRows = await dbGetAll('meta');
    const meta = metaRows.find(r => r.key === 'state');
    if (meta) {
      const d = meta.data;
      state.folders = new Set(d.folders || []);
      state.openTabs = (d.openTabs || []).filter(p => p === '__welcome__' || p === '__settings__' || p === '__diff__' || state.files[p]);
      state.activeTab = d.activeTab || null;
      if (state.activeTab && !state.openTabs.includes(state.activeTab)) state.activeTab = null;
      if (d.settings) Object.assign(state.settings, d.settings);
      if (d.collapsedFolders) state.collapsedFolders = new Set(d.collapsedFolders);
      if (d.recentProjects) state.recentProjects = d.recentProjects;
      if (d.snippets) state.snippets = d.snippets;
    }
  } else {
    try {
      const raw = localStorage.getItem('codeforge_data');
      if (!raw) return false;
      const data = JSON.parse(raw);
      state.files = data.files || {};
      state.folders = new Set(data.folders || []);
      state.openTabs = (data.openTabs || []).filter(p => p === '__welcome__' || state.files[p]);
      state.activeTab = data.activeTab || null;
    } catch(e) {}
  }

  renderTree();

  state.openTabs.forEach(p => {
    if (p === '__welcome__' || p === '__settings__' || p === '__diff__' || state.files[p]) {
      createEditorForFile(p, false);
    }
  });

  const tabToActivate = (state.activeTab && state.openTabs.includes(state.activeTab))
    ? state.activeTab
    : state.openTabs[state.openTabs.length - 1];

  if (tabToActivate) switchTab(tabToActivate);
  else showWelcome();

  renderTabs();
  return true;
}
