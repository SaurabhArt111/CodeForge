// =================== FILE TREE & FILE MANAGEMENT ===================
// js/filetree.js

// File icon helper
function getFileIcon(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  const icons = {
    html:'<i class="fab fa-html5 file-color-html"></i>',
    htm:'<i class="fab fa-html5 file-color-html"></i>',
    css:'<i class="fab fa-css3-alt file-color-css"></i>',
    js:'<i class="fab fa-js-square file-color-js"></i>',
    ts:'<i class="fas fa-code file-color-ts"></i>',
    json:'<i class="fas fa-code file-color-json"></i>',
    md:'<i class="fab fa-markdown file-color-md"></i>',
    py:'<i class="fab fa-python file-color-py"></i>',
    png:'<i class="far fa-image file-color-img"></i>',
    jpg:'<i class="far fa-image file-color-img"></i>',
    jpeg:'<i class="far fa-image file-color-img"></i>',
    gif:'<i class="far fa-image file-color-img"></i>',
    svg:'<i class="far fa-image file-color-img"></i>',
    webp:'<i class="far fa-image file-color-img"></i>',
    zip:'<i class="fas fa-file-archive file-color-zip"></i>',
    gz:'<i class="fas fa-file-archive file-color-zip"></i>',
    txt:'<i class="far fa-file-alt file-color-default"></i>',
    xml:'<i class="fas fa-code file-color-html"></i>',
    php:'<i class="fab fa-php" style="color:#7b7fb5"></i>',
    java:'<i class="fab fa-java" style="color:#e76f00"></i>',
    sh:'<i class="fas fa-terminal file-color-default"></i>',
    sql:'<i class="fas fa-database" style="color:#e38d44"></i>',
  };
  return icons[ext] || '<i class="far fa-file file-color-default"></i>';
}

function getLang(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  const langs = { html:'HTML', htm:'HTML', css:'CSS', js:'JavaScript', ts:'TypeScript', json:'JSON', md:'Markdown', py:'Python', txt:'Plain Text', xml:'XML', php:'PHP', sh:'Shell', sql:'SQL' };
  return langs[ext] || 'Plain Text';
}

function isImageFile(name) { return /\.(png|jpg|jpeg|gif|webp|svg|bmp|ico)$/i.test(name); }
function isZipFile(name) { return /\.(zip|gz)$/i.test(name); }

// =================== FILE TREE ===================
function renderTree() {
  const tree = document.getElementById('file-tree');
  const treeData = buildTreeStructure();
  let html = '';
  treeData.files.sort().forEach(filePath => { html += renderFileItem(filePath, 0); });
  html += renderTreeNodes(treeData.children, 0);
  if (html === '') html = '<div class="empty-explorer">No files yet.<br>Create or upload files.<br><div style="margin: 12px 14px; border: 1px dashed #ccc; padding: 10px; border-radius: 4px;">Drag files here to upload</div></div>';
  tree.innerHTML = html;
  // Add click handler to clear selection when clicking empty space
  tree.onclick = (e) => {
    if (e.target === tree) {
      state.selectedItems.clear();
      state.lastSelectedItem = null;
      renderTree();
    }
  };
  // Add context menu handler for empty space
  tree.oncontextmenu = (e) => {
    if (e.target === tree) {
      if (state.selectedItems.size > 0) {
        // Show custom context menu for selected items when right-clicking empty space
        showContextMenuForSelection(e, null, false);
        return false;
      }
      // No items selected - allow browser context menu
      return true;
    }
    // Right-click on tree items - handled by individual item handlers
  };
}

function buildTreeStructure() {
  const root = { children: {}, files: [] };
  state.folders.forEach(folder => {
    const parts = folder.split('/');
    let node = root;
    parts.forEach((part, i) => {
      const path = parts.slice(0, i + 1).join('/');
      if (!node.children[part]) node.children[part] = { name: part, path, children: {}, files: [], isFolder: true };
      node = node.children[part];
    });
  });
  Object.keys(state.files).forEach(filePath => {
    const parts = filePath.split('/');
    if (parts.length === 1) {
      root.files.push(filePath);
    } else {
      let node = root;
      for (let i = 0; i < parts.length - 1; i++) {
        const folderPath = parts.slice(0, i + 1).join('/');
        const part = parts[i];
        if (!node.children[part]) {
          state.folders.add(folderPath);
          node.children[part] = { name: part, path: folderPath, children: {}, files: [], isFolder: true };
        }
        node = node.children[part];
      }
      node.files.push(filePath);
    }
  });
  return root;
}

function renderTreeNodes(children, depth) {
  let html = '';
  const folderEntries = Object.values(children).sort((a,b) => a.name.localeCompare(b.name));
  folderEntries.forEach(node => {
    const collapsed = state.collapsedFolders.has(node.path);
    const chevronClass = collapsed ? 'collapsed' : '';
    const indent = depth * 16 + 8;
    const multiSelected = state.selectedItems.has(node.path) ? 'multi-selected' : '';
    html += `<div class="tree-item ${multiSelected}" style="padding-left:${indent}px" draggable="true"
      data-path="${node.path}" data-is-folder="true"
      onclick="selectFolderItem('${node.path.replace(/'/g,"\\'")}', event)"
      ondragstart="dragStart(event,'${node.path.replace(/'/g,"\\'")}',true)"
      ondragover="dragOver(event,'${node.path.replace(/'/g,"\\'")}',true)"
      ondragleave="dragLeave(event)"
      ondrop="dropOn(event,'${node.path.replace(/'/g,"\\'")}',true)"
      oncontextmenu="showCtxMenu(event,'${node.path.replace(/'/g,"\\'")}',true)">
      <span class="tree-chevron ${chevronClass}"><i class="fas fa-chevron-down" style="font-size:9px"></i></span>
      <span class="tree-icon"><i class="fas fa-folder${collapsed?'':'-open'} folder-color"></i></span>
      <span class="tree-label folder-color">${node.name}</span>
      
    </div>`;
    if (!collapsed) {
      html += renderTreeNodes(node.children, depth + 1);
      node.files.sort().forEach(filePath => { html += renderFileItem(filePath, depth + 1); });
    }
  });
  return html;
}

function renderFileItem(path, depth) {
  const indent = depth === 0 ? 8 : depth * 16 + 8 + 16;
  const file = state.files[path];
  if (!file) return '';
  const active = state.activeTab === path ? 'selected' : '';
  const multiSelected = state.selectedItems.has(path) ? 'multi-selected' : '';
  const isCut = state.cutPath === path ? 'cut-item' : '';
  return `<div class="tree-item ${active} ${multiSelected} ${isCut}" style="padding-left:${indent}px" draggable="true"
    data-path="${path}"
    onclick="fileClick('${path.replace(/'/g,"\\'")}',event)"
    onmousedown="fileMouseDown('${path.replace(/'/g,"\\'")}',event)"
    ondblclick="fileDoubleClick('${path.replace(/'/g,"\\'")}',event)"
    ondragstart="dragStart(event,'${path.replace(/'/g,"\\'")}',false)"
    ondragover="dragOver(event,'${path.replace(/'/g,"\\'")}',false)"
    ondragleave="dragLeave(event)"
    ondrop="dropOn(event,'${path.replace(/'/g,"\\'")}',false)"
    oncontextmenu="showCtxMenu(event,'${path.replace(/'/g,"\\'")}',false)">
    <span style="width:16px;flex-shrink:0"></span>
    <span class="tree-icon">${getFileIcon(file.name)}</span>
    <span class="tree-label">${file.name}</span>
    
  </div>`;
}

function toggleFolder(folder, e) {
  if (e) e.stopPropagation();
  if (state.collapsedFolders.has(folder)) state.collapsedFolders.delete(folder);
  else state.collapsedFolders.add(folder);
  renderTree();
}

function collapseAll() { state.folders.forEach(f => state.collapsedFolders.add(f)); renderTree(); }
function refreshTree() { renderTree(); }

// =================== DRAG & DROP ===================
let dragPath = null, dragIsFolder = false;

function dragStart(e, path, isFolder) {
  dragPath = path; dragIsFolder = isFolder;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', path);
}

function dragOver(e, path, isFolder) {
  e.preventDefault(); e.stopPropagation();
  e.dataTransfer.dropEffect = 'move';
  document.querySelectorAll('.tree-item.drag-over').forEach(el => el.classList.remove('drag-over'));
  if (isFolder) e.currentTarget.classList.add('drag-over');
}

function dragLeave(e) { e.currentTarget.classList.remove('drag-over'); }

function dropOn(e, targetPath, targetIsFolder) {
  e.preventDefault(); e.stopPropagation();
  document.querySelectorAll('.tree-item.drag-over').forEach(el => el.classList.remove('drag-over'));
  if (!dragPath || dragPath === targetPath) return;
  const destFolder = targetIsFolder ? targetPath : (targetPath.includes('/') ? targetPath.substring(0, targetPath.lastIndexOf('/')) : '');
  moveItem(dragPath, dragIsFolder, destFolder);
  dragPath = null;
}

function moveItem(srcPath, isFolder, destFolder) {
  const newBase = destFolder ? destFolder + '/' : '';
  if (isFolder) {
    const folderName = srcPath.includes('/') ? srcPath.split('/').pop() : srcPath;
    const newFolderPath = newBase + folderName;
    if (newFolderPath === srcPath) return;
    Object.keys(state.files).filter(p => p.startsWith(srcPath + '/')).forEach(oldPath => {
      const suffix = oldPath.substring(srcPath.length);
      const newPath = newFolderPath + suffix;
      state.files[newPath] = { ...state.files[oldPath] };
      delete state.files[oldPath];
      updateTabPath(oldPath, newPath);
    });
    const oldFolders = [...state.folders].filter(f => f === srcPath || f.startsWith(srcPath + '/'));
    oldFolders.forEach(f => {
      state.folders.delete(f);
      state.folders.add(newFolderPath + f.substring(srcPath.length));
    });
  } else {
    const fileName = state.files[srcPath]?.name;
    if (!fileName) return;
    const newPath = newBase + fileName;
    if (newPath === srcPath) return;
    state.files[newPath] = { ...state.files[srcPath] };
    delete state.files[srcPath];
    if (destFolder) state.folders.add(destFolder);
    updateTabPath(srcPath, newPath);
  }
  renderTree(); renderTabs(); saveToStorage();
  notify('Moved successfully');
}

function updateTabPath(oldPath, newPath) {
  const idx = state.openTabs.indexOf(oldPath);
  if (idx > -1) {
    state.openTabs[idx] = newPath;
    document.getElementById('editor-' + safeId(oldPath))?.remove();
    if (state.files[newPath]) createEditorForFile(newPath, false);
  }
  if (state.activeTab === oldPath) { state.activeTab = newPath; switchTab(newPath); }
}

// =================== CUT/COPY/PASTE ===================
function cutItem(path) {
  state.clipboard = { action: 'cut', path }; state.cutPath = path;
  document.getElementById('paste-btn').style.display = '';
  renderTree(); notify('Cut: ' + (state.files[path]?.name || path));
}

function copyItem(path) {
  state.clipboard = { action: 'copy', path }; state.cutPath = null;
  document.getElementById('paste-btn').style.display = '';
  renderTree(); notify('Copied: ' + (state.files[path]?.name || path));
}

function pasteItem(destFolder) {
  if (!state.clipboard) return;
  const { action, path } = state.clipboard;
  const file = state.files[path];
  if (!file) return;
  const dest = destFolder || '';
  const newPath = dest ? dest + '/' + file.name : file.name;
  if (action === 'cut') {
    state.files[newPath] = { ...file };
    delete state.files[path];
    if (dest) state.folders.add(dest);
    updateTabPath(path, newPath);
    state.cutPath = null; state.clipboard = null;
    document.getElementById('paste-btn').style.display = 'none';
  } else {
    let copyPath = newPath; let i = 1;
    const nameParts = file.name.split('.');
    const ext = nameParts.length > 1 ? '.' + nameParts.pop() : '';
    const base = nameParts.join('.');
    while (state.files[copyPath]) {
      const newName = `${base}_copy${i > 1 ? i : ''}${ext}`;
      copyPath = dest ? dest + '/' + newName : newName; i++;
    }
    const newName = copyPath.split('/').pop();
    state.files[copyPath] = { ...file, name: newName };
    if (dest) state.folders.add(dest);
  }
  renderTree(); renderTabs(); saveToStorage(); notify('Pasted');
}

// =================== OPEN FILE ===================
function openFile(path, e, pinned = true) {
  if (e) e.stopPropagation();
  if (!state.files[path]) return;
  const alreadyOpen = state.openTabs.includes(path);

  if (!pinned) {
    if (state.previewTab && state.previewTab !== path) {
      closePreviewTab();
    }
    if (!alreadyOpen) {
      state.openTabs.push(path);
      createEditorForFile(path, false);
    }
    state.previewTab = alreadyOpen && state.previewTab === path ? path : (alreadyOpen ? null : path);
  } else {
    if (state.previewTab && state.previewTab !== path) {
      closePreviewTab();
    }
    if (state.previewTab === path) {
      state.previewTab = null;
    }
    if (!alreadyOpen) {
      state.openTabs.push(path);
      createEditorForFile(path, false);
    }
  }

  switchTab(path); renderTabs(); renderTree(); saveToStorage();
  state.selectedItems.clear();
  state.lastSelectedItem = null;
  renderTree();
}

function closePreviewTab() {
  if (!state.previewTab) return;
  const preview = state.previewTab;
  const idx = state.openTabs.indexOf(preview);
  if (idx !== -1) {
    state.openTabs.splice(idx, 1);
    document.getElementById('editor-' + safeId(preview))?.remove();
  }
  if (state.activeTab === preview) {
    state.activeTab = null;
  }
  state.previewTab = null;
}

function fileClick(path, e) {
  if (e) e.stopPropagation();
  if (e.ctrlKey || e.shiftKey) {
    selectFileItem(path, e);
    return;
  }
  handleItemSelection(path, false, e);
  openFile(path, e, false);
}

function fileDoubleClick(path, e) {
  if (e) e.stopPropagation();
  handleItemSelection(path, false, e);
  openFile(path, e, true);
}

function fileMouseDown(path, e) {
  if (e.button === 1) {
    e.preventDefault();
    handleItemSelection(path, false, e);
    openFile(path, e, true);
  }
}

// =================== MULTI-SELECTION ===================
function selectFileItem(path, e) {
  if (e) e.stopPropagation();
  handleItemSelection(path, false, e);
}

function selectFolderItem(path, e) {
  if (e) e.stopPropagation();
  handleItemSelection(path, true, e);
  // Toggle folder expansion on single click without modifiers
  if (!e.ctrlKey && !e.shiftKey) {
    toggleFolder(path, e);
  }
}

function handleItemSelection(path, isFolder, e) {
  const ctrlKey = e.ctrlKey || e.metaKey; // metaKey for Mac
  const shiftKey = e.shiftKey;

  if (shiftKey && state.lastSelectedItem) {
    // Range selection
    const allItems = getAllTreeItems();
    const startIdx = allItems.indexOf(state.lastSelectedItem);
    const endIdx = allItems.indexOf(path);
    if (startIdx !== -1 && endIdx !== -1) {
      const minIdx = Math.min(startIdx, endIdx);
      const maxIdx = Math.max(startIdx, endIdx);
      state.selectedItems.clear();
      for (let i = minIdx; i <= maxIdx; i++) {
        state.selectedItems.add(allItems[i]);
      }
    }
  } else if (ctrlKey) {
    // Toggle selection
    if (state.selectedItems.has(path)) {
      state.selectedItems.delete(path);
    } else {
      state.selectedItems.add(path);
    }
  } else {
    // Single selection
    state.selectedItems.clear();
    state.selectedItems.add(path);
  }

  state.lastSelectedItem = path;
  renderTree();
}

function getAllTreeItems() {
  const items = [];
  const treeItems = document.querySelectorAll('#file-tree .tree-item');
  treeItems.forEach(item => {
    const path = item.getAttribute('data-path');
    if (path) items.push(path);
  });
  return items;
}

// =================== DELETE / RENAME ===================
function deleteItem(path, e) {
  if (e) e.stopPropagation();
  const file = state.files[path];
  if (!file) return;
  showDeleteConfirm(`Delete "${file.name}"?`, `This action cannot be undone.`, () => {
    if (state.db) dbDelete('files', path);
    delete state.files[path];
    const idx = state.openTabs.indexOf(path);
    if (idx > -1) {
      state.openTabs.splice(idx, 1);
      document.getElementById('editor-' + safeId(path))?.remove();
      if (state.activeTab === path) {
        const next = state.openTabs[state.openTabs.length - 1];
        if (next) switchTab(next); else { state.activeTab = null; showWelcome(); }
      }
    }
    renderTree(); renderTabs(); saveToStorage();
    notify('Deleted: ' + file.name);
  });
}

function renameItem(path, e) {
  if (e) e.stopPropagation();
  const file = state.files[path];
  if (!file) return;
  showModal('Rename', file.name, 'rename', path);
}

function deleteFolder(folder, e) {
  if (e) e.stopPropagation();
  const fileCount = Object.keys(state.files).filter(p => p.startsWith(folder + '/')).length;
  showDeleteConfirm(`Delete folder "${folder}"?`, `This will permanently delete ${fileCount} file${fileCount !== 1 ? 's' : ''} and all subfolders.`, () => {
    [...state.folders].filter(f => f === folder || f.startsWith(folder + '/')).forEach(f => state.folders.delete(f));
    Object.keys(state.files).filter(p => p.startsWith(folder + '/')).forEach(p => {
      const tab = state.openTabs.indexOf(p);
      if (tab > -1) { state.openTabs.splice(tab, 1); document.getElementById('editor-' + safeId(p))?.remove(); }
      if (state.db) dbDelete('files', p);
      delete state.files[p];
    });
    if (state.activeTab?.startsWith(folder + '/')) { state.activeTab = null; showWelcome(); }
    renderTree(); renderTabs(); saveToStorage();
    notify('Folder deleted: ' + folder);
  });
}

// =================== CONTEXT MENU ===================
function showCtxMenu(e, path, isFolder) {
  e.preventDefault();
  e.stopPropagation();
  // Suppress browser context menu
  if (e.type === 'contextmenu') {
    document.addEventListener('contextmenu', function _sup(ev) {
      ev.preventDefault(); document.removeEventListener('contextmenu', _sup);
    }, { capture: true, once: true });
  }

  if (!state.selectedItems.has(path)) {
    state.selectedItems.clear();
    state.selectedItems.add(path);
    state.lastSelectedItem = path;
    renderTree();
  }
  showContextMenuForSelection(e, path, isFolder);
}

function showContextMenuForSelection(e, primaryPath, primaryIsFolder) {
  state.ctxTarget = { 
    path: primaryPath, 
    isFolder: primaryIsFolder, 
    selectedItems: Array.from(state.selectedItems) 
  };
  const menu = document.getElementById('ctx-menu');
  const openOpt = document.getElementById('ctx-open');
  const unzipOpt = document.getElementById('ctx-unzip');
  
  // Hide open option if multiple items selected or if it's a folder
  if (state.selectedItems.size > 1 || (primaryIsFolder && primaryPath)) openOpt.style.display = 'none';
  else openOpt.style.display = '';
  
  // Show unzip only if single zip file selected
  const selectedPaths = Array.from(state.selectedItems);
  if (selectedPaths.length === 1) {
    const file = state.files[selectedPaths[0]];
    if (file && (file.isZip || isZipFile(file.name))) unzipOpt.style.display = '';
    else unzipOpt.style.display = 'none';
  } else {
    unzipOpt.style.display = 'none';
  }
  
  menu.style.left = Math.min(e.clientX, window.innerWidth - 220) + 'px';
  menu.style.top = Math.min(e.clientY, window.innerHeight - 320) + 'px';
  menu.style.display = 'block';
}

function hideCtxMenu() { 
  document.getElementById('ctx-menu').style.display = 'none';
  document.getElementById('editor-ctx-menu').style.display = 'none';
}

function ctxAction(action) {
  hideCtxMenu();
  const { selectedItems } = state.ctxTarget || {};
  if (!selectedItems || selectedItems.length === 0) return;
  
  // For single-item actions, use the first item
  const primaryPath = selectedItems[0];
  const primaryIsFolder = !state.files[primaryPath];
  
  if (action === 'open' && selectedItems.length === 1 && !primaryIsFolder) {
    openFile(primaryPath);
  } else if (action === 'rename' && selectedItems.length === 1) {
    renameItem(primaryPath);
  } else if (action === 'delete') {
    // Delete all selected items
    selectedItems.forEach(path => {
      if (state.files[path]) deleteItem(path);
      else deleteFolder(path);
    });
  } else if (action === 'download') {
    // For multiple items, download as zip
    if (selectedItems.length > 1) {
      downloadSelectedAsZip();
    } else {
      state.activeTab = primaryPath;
      downloadCurrentFile();
    }
  } else if (action === 'duplicate' && selectedItems.length === 1) {
    const file = state.files[primaryPath];
    if (!file) return;
    const nameParts = file.name.split('.');
    const ext = nameParts.length > 1 ? '.' + nameParts.pop() : '';
    const newName = nameParts.join('.') + '_copy' + ext;
    const dir = primaryPath.includes('/') ? primaryPath.substring(0, primaryPath.lastIndexOf('/') + 1) : '';
    const newPath = dir + newName;
    state.files[newPath] = { ...file, name: newName };
    renderTree(); saveToStorage(); notify('Duplicated: ' + newName);
  } else if (action === 'cut') {
    // Cut all selected items
    selectedItems.forEach(path => cutItem(path));
  } else if (action === 'copy') {
    // For multiple items, we might need to handle differently, but for now copy the first
    if (selectedItems.length === 1) copyItem(primaryPath);
  } else if (action === 'paste') {
    const destFolder = primaryPath ? (primaryIsFolder ? primaryPath : (primaryPath.includes('/') ? primaryPath.substring(0, primaryPath.lastIndexOf('/')) : '')) : '';
    pasteItem(destFolder);
  } else if (action === 'moveto' && selectedItems.length === 1) {
    state.modalAction = { action: 'moveto', data: primaryPath };
    document.getElementById('modal-title').textContent = 'Move to Folder';
    document.getElementById('modal-body').innerHTML = buildMoveToHTML();
    document.getElementById('modal-overlay').classList.add('visible');
  } else if (action === 'unzip' && selectedItems.length === 1) {
    extractZipFile(primaryPath);
  }
}

document.addEventListener('click', hideCtxMenu);

// =================== FILE UPLOAD ===================
function getDefaultContent(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const templates = {
    html: `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>Document</title>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <h1>Hello, World!</h1>\n  <script src="script.js"><\/script>\n</body>\n</html>`,
    css: `/* Styles */\n* {\n  margin: 0;\n  padding: 0;\n  box-sizing: border-box;\n}\n\nbody {\n  font-family: sans-serif;\n  background: #fff;\n  color: #333;\n}\n`,
    js: `// JavaScript\nconsole.log('Hello, World!');\n`,
    ts: `// TypeScript\nconst greeting: string = 'Hello, World!';\nconsole.log(greeting);\n`,
    json: `{\n  "name": "my-project",\n  "version": "1.0.0"\n}\n`,
    md: `# Title\n\nWrite your markdown here.\n`,
    py: `# Python Script\nprint("Hello, World!")\n`,
    sh: `#!/bin/bash\necho "Hello, World!"\n`,
    php: `<?php\n  echo "Hello, World!";\n?>\n`,
    sql: `-- SQL Query\nSELECT * FROM table;\n`,
  };
  return templates[ext] || '';
}

function handleFileUpload(files) {
  let count = 0;
  Array.from(files).forEach(file => {
    const reader = new FileReader();
    const name = file.name;
    if (isImageFile(name)) {
      reader.onload = e => {
        state.files[name] = { name, content: '', type: 'image', isImage: true, dataUrl: e.target.result };
        renderTree();
        if (!state.openTabs.includes(name)) { state.openTabs.push(name); createEditorForFile(name, false); renderTabs(); }
        switchTab(name); saveToStorage();
      };
      reader.readAsDataURL(file);
    } else if (isZipFile(name)) {
      reader.onload = e => {
        state.files[name] = { name, content: '', type: 'zip', isZip: true, dataUrl: e.target.result };
        renderTree(); saveToStorage(); notify(`ZIP uploaded: ${name} (right-click to extract)`);
      };
      reader.readAsDataURL(file);
    } else {
      reader.onload = e => {
        state.files[name] = { name, content: e.target.result, type: 'file' };
        renderTree();
        if (!state.openTabs.includes(name)) { state.openTabs.push(name); createEditorForFile(name, false); renderTabs(); }
        switchTab(name); saveToStorage();
      };
      reader.readAsText(file);
    }
    count++;
  });
  notify(`Uploaded ${count} file(s)`);
}

function handleFolderUpload(files) {
  Array.from(files).forEach(file => {
    const path = file.webkitRelativePath || file.name;
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) state.folders.add(parts.slice(0, i).join('/'));
    const reader = new FileReader();
    if (isImageFile(file.name)) {
      reader.onload = e => { state.files[path] = { name: file.name, content: '', type: 'image', isImage: true, dataUrl: e.target.result }; renderTree(); saveToStorage(); };
      reader.readAsDataURL(file);
    } else {
      reader.onload = e => { state.files[path] = { name: file.name, content: e.target.result, type: 'file' }; renderTree(); saveToStorage(); };
      reader.readAsText(file);
    }
  });
  renderTree(); notify(`Uploaded folder with ${files.length} files`);
}

async function handleZipUpload(file) {
  if (!file || !JSZip) { notify('JSZip not loaded'); return; }
  try {
    notify('Extracting ZIP...');
    const zip = await JSZip.loadAsync(file);
    let count = 0;
    const promises = [];
    zip.forEach((relativePath, zipEntry) => {
      if (zipEntry.dir) { state.folders.add(relativePath.replace(/\/$/, '')); return; }
      const name = relativePath.split('/').pop();
      if (isImageFile(name)) {
        promises.push(zipEntry.async('base64').then(data => {
          const ext = name.split('.').pop().toLowerCase();
          const mimeMap = { png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', gif:'image/gif', webp:'image/webp', svg:'image/svg+xml' };
          state.files[relativePath] = { name, content: '', type: 'image', isImage: true, dataUrl: `data:${mimeMap[ext]||'image/png'};base64,${data}` };
          count++;
        }));
      } else {
        promises.push(zipEntry.async('text').then(text => {
          const parts = relativePath.split('/');
          for (let i = 1; i < parts.length; i++) state.folders.add(parts.slice(0, i).join('/'));
          state.files[relativePath] = { name, content: text, type: 'file' }; count++;
        }).catch(() => { count++; }));
      }
    });
    await Promise.all(promises);
    renderTree(); saveToStorage(); notify(`Extracted ${count} files from ZIP`);
  } catch(e) { notify('Failed to read ZIP: ' + e.message); }
}

async function extractZipFile(path) {
  const file = state.files[path];
  if (!file || !file.dataUrl) return;
  try {
    const base64 = file.dataUrl.split(',')[1];
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes]);
    await handleZipUpload(new File([blob], file.name));
  } catch(e) { notify('Extraction failed: ' + e.message); }
}

// =================== DOWNLOAD ===================
function downloadCurrentFile() {
  const path = state.activeTab;
  if (!path || !state.files[path]) return;
  const file = state.files[path];
  if (file.isImage || file.isZip) {
    const a = document.createElement('a'); a.href = file.dataUrl; a.download = file.name; a.click();
  } else {
    const blob = new Blob([file.content], { type: 'text/plain' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
  }
}

async function downloadAllAsZip() {
  if (!JSZip) { notify('JSZip not available'); return; }
  const paths = Object.keys(state.files);
  if (!paths.length) { notify('No files to download'); return; }
  notify('Creating ZIP...');
  const zip = new JSZip();
  for (const path of paths) {
    const file = state.files[path];
    if (file.isImage && file.dataUrl) { zip.file(path, file.dataUrl.split(',')[1], { base64: true }); }
    else if (file.content !== undefined) { zip.file(path, file.content); }
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'project.zip'; a.click();
  notify('ZIP downloaded');
}

async function downloadSelectedAsZip() {
  if (!JSZip) { notify('JSZip not available'); return; }
  const selectedPaths = Array.from(state.selectedItems);
  if (!selectedPaths.length) { notify('No items selected'); return; }
  notify('Creating ZIP...');
  const zip = new JSZip();
  
  for (const path of selectedPaths) {
    if (state.files[path]) {
      // It's a file
      const file = state.files[path];
      if (file.isImage && file.dataUrl) { zip.file(path, file.dataUrl.split(',')[1], { base64: true }); }
      else if (file.content !== undefined) { zip.file(path, file.content); }
    } else {
      // It's a folder - add all files in the folder
      const folderPrefix = path + '/';
      Object.keys(state.files).filter(filePath => filePath.startsWith(folderPrefix)).forEach(filePath => {
        const file = state.files[filePath];
        const relativePath = filePath.substring(folderPrefix.length);
        if (file.isImage && file.dataUrl) { zip.file(relativePath, file.dataUrl.split(',')[1], { base64: true }); }
        else if (file.content !== undefined) { zip.file(relativePath, file.content); }
      });
    }
  }
  
  const blob = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'selected.zip'; a.click();
  notify('Selected items downloaded as ZIP');
}

// =================== MODAL ===================
function showModal(title, placeholder, action, data) {
  state.modalAction = { action, data };
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = action === 'moveto'
    ? buildMoveToHTML()
    : `<input class="modal-input" id="modal-input" placeholder="${placeholder}" onkeydown="if(event.key==='Enter')modalConfirm()">`;
  document.getElementById('modal-overlay').classList.add('visible');
  setTimeout(() => document.getElementById('modal-input')?.focus(), 50);
}

function buildMoveToHTML() {
  const folders = ['(root)', ...state.folders].map(f => `<option value="${f === '(root)' ? '' : f}">${f}</option>`).join('');
  return `<div class="modal-label">Destination folder</div><select class="modal-select" id="modal-input">${folders}</select>`;
}

function closeModal() { document.getElementById('modal-overlay').classList.remove('visible'); state.modalAction = null; }

function showDeleteConfirm(title, message, onConfirm) {
  const overlay = document.getElementById('delete-confirm-overlay');
  document.getElementById('delete-confirm-title').textContent = title;
  document.getElementById('delete-confirm-msg').textContent = message;
  overlay.classList.add('visible');
  overlay._onConfirm = onConfirm;
}
function closeDeleteConfirm() { document.getElementById('delete-confirm-overlay').classList.remove('visible'); }
function confirmDelete() {
  const overlay = document.getElementById('delete-confirm-overlay');
  const cb = overlay._onConfirm;
  closeDeleteConfirm();
  if (cb) cb();
}

function modalConfirm() {
  const val = document.getElementById('modal-input')?.value?.trim();
  const act = state.modalAction;
  closeModal();
  if (!act) return;

  if (act.action === 'create-file') {
    if (!val) return;
    const path = act.data ? act.data + '/' + val : val;
    if (state.files[path]) { notify('File already exists!'); return; }
    state.files[path] = { name: val, content: getDefaultContent(val), type: 'file' };
    if (act.data) { const parts = act.data.split('/'); for (let i = 1; i <= parts.length; i++) state.folders.add(parts.slice(0, i).join('/')); }
    renderTree(); openFile(path); saveToStorage(); notify('Created: ' + val);
  } else if (act.action === 'create-folder') {
    if (!val) return;
    const folderPath = act.data ? act.data + '/' + val : val;
    state.folders.add(folderPath);
    const parts = folderPath.split('/');
    for (let i = 1; i < parts.length; i++) state.folders.add(parts.slice(0, i).join('/'));
    state.collapsedFolders.delete(folderPath);
    if (act.data) state.collapsedFolders.delete(act.data);
    renderTree(); saveToStorage(); notify('Created folder: ' + folderPath);
  } else if (act.action === 'rename') {
    if (!val) return;
    const oldPath = act.data;
    const dir = oldPath.includes('/') ? oldPath.substring(0, oldPath.lastIndexOf('/') + 1) : '';
    const newPath = dir + val;
    state.files[newPath] = { ...state.files[oldPath], name: val };
    if (state.db) dbDelete('files', oldPath);
    delete state.files[oldPath];
    updateTabPath(oldPath, newPath);
    renderTree(); renderTabs(); saveToStorage(); notify('Renamed to: ' + val);
  } else if (act.action === 'create-snippet') {
    if (!val) return;
    const trigger = prompt('Enter trigger:') || val.toLowerCase().replace(/\s+/g,'');
    const body = prompt('Enter snippet body:') || '';
    state.snippets[val] = {trigger, body, desc: val};
    renderSnippetsList(); saveToStorage(); notify('Snippet created: ' + val);
  }
}

// =================== CLEAR ALL ===================
async function clearAll() {
  if (!confirm('Delete all files? This cannot be undone.')) return;
  state.files = {}; state.folders = new Set(); state.openTabs = []; state.activeTab = null;
  state.collapsedFolders = new Set();
  document.getElementById('editors-container').innerHTML = '';
  document.getElementById('pane-right-editors').innerHTML = '';
  document.getElementById('tabs-bar').innerHTML = '';
  if (state.db) { await dbClear('files'); await dbClear('meta'); }
  try { localStorage.removeItem('codeforge_data'); } catch(e) {}
  renderTree(); showWelcome(); notify('All files cleared');
}

// Upload zone
document.addEventListener('DOMContentLoaded', () => {
  const uploadZone = document.getElementById('upload-zone');
  if (uploadZone) {
    uploadZone.addEventListener('click', () => document.getElementById('hidden-file-input').click());
    uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('dragover'); });
    uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
    uploadZone.addEventListener('drop', e => { e.preventDefault(); uploadZone.classList.remove('dragover'); if (e.dataTransfer.files.length) handleFileUpload(e.dataTransfer.files); });
  }
  document.addEventListener('dragover', e => e.preventDefault());
  document.addEventListener('drop', e => {
    e.preventDefault();
    if (e.dataTransfer.files.length && !e.target.closest('#upload-zone') && !e.target.closest('.tree-item')) handleFileUpload(e.dataTransfer.files);
  });
});

// New file/folder dialogs
function createNewFile(folder) { showModal('New File', 'filename.html', 'create-file', folder || null); }
function createNewFolder() { showModal('New Folder', 'folder-name', 'create-folder', null); }
function createFileInFolder(folder, e) { if (e) e.stopPropagation(); showModal('New File in ' + folder, 'filename.html', 'create-file', folder); }
function createFolderInFolder(parentFolder, e) { if (e) e.stopPropagation(); showModal('New Subfolder in ' + parentFolder, 'subfolder-name', 'create-folder', parentFolder); }

// Save
function saveCurrentFile() {
  const path = state.activeTab;
  if (!path || !state.files[path]) return;
  state.files[path].modified = false;
  renderTabs(); saveToStorage(); notify('Saved: ' + state.files[path].name);
}
function saveAllFiles() {
  Object.keys(state.files).forEach(p => { if (state.files[p]) state.files[p].modified = false; });
  renderTabs(); saveToStorage(); notify('All files saved');
}
