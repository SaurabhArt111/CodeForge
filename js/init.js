// =================== INITIALIZATION ===================
// js/init.js — Bootstraps the entire application

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Load persisted data
  const hasData = await loadFromStorage();

  // 2. Apply stored settings
  applySettingsToEditor();
  if (state.settings.theme && state.settings.theme !== 'dark') {
    applyTheme(state.settings.theme);
  }

  // 3. Init terminal welcome message
  initTerminalWelcome();

  // 4. Render snippets list (for snippets sidebar)
  renderSnippetsList();

  // 5. Show welcome if no tabs open
  if (!state.openTabs.length) {
    showWelcome();
  }

  // 6. Wire up menu item hover dropdowns on mobile / click
  document.querySelectorAll('.menu-item').forEach(item => {
    item.addEventListener('click', e => {
      e.stopPropagation();
      const wasActive = item.classList.contains('active');
      document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'));
      if (!wasActive) item.classList.add('active');
    });
  });

  // 7. Re-render problems panel
  updateProblemsPanel();

  // 8. Auto-save timer (belt-and-suspenders)
  setInterval(() => {
    if (state.settings.autoSave && Object.keys(state.files).length > 0) {
      saveToStorage();
    }
  }, 30000);

  console.log('%cCodeForge v3.0 loaded', 'color:#007acc;font-size:14px;font-weight:bold');
});
