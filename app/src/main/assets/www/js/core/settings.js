// Persistent settings + app state, stored as JSON files in the app data dir (survive WebView data clears).
import { N } from "./bridge.js";
import { Emitter } from "./events.js";
import { P, debounce } from "./util.js";
// phone = the narrow (drawer) layout; a tablet in landscape is >760px wide
const phone = () => Math.min(window.screen?.width || 9999, window.innerWidth) <= 760;

export const DEFAULTS = {
  "ui.theme": "Dark Modern",
  "ui.iconTheme": "seti",
  "ui.mobileKeyBar": true,
  "ui.fontScale": 100,
  "ui.openUrlWith": "browser",
  "ui.language": "auto",
  "editor.fontSize": 14,
  "editor.fontFamily": "JetBrains Mono",
  "editor.ligatures": false,
  "editor.tabSize": 2,
  "editor.insertSpaces": true,
  "editor.wordWrap": "on",
  "editor.minimap": false,
  "editor.lineNumbers": "on",
  "editor.renderWhitespace": "selection",
  "editor.bracketPairColors": true,
  "editor.smoothScrolling": true,
  "editor.cursorBlinking": "smooth",
  "editor.stickyScroll": false,
  "editor.formatOnSave": false,
  "editor.formatOnPaste": false,
  "editor.emmet": true,
  "editor.lineHeight": 0,
  "editor.scrollBeyondLastLine": true,
  "editor.bottomPadding": 160,
  "editor.quickSuggestions": true,
  "editor.acceptSuggestionOnEnter": "smart",
  "editor.linkedEditing": true,
  "editor.autoClosing": true,
  "editor.formatOnType": false,
  "editor.parameterHints": true,
  "files.autoSave": "afterDelay",
  "files.autoSaveDelay": 1000,
  "files.showHidden": true,
  "files.confirmDelete": true,
  "terminal.mode": "auto",
  "terminal.fontSize": 14,
  "terminal.lineHeight": 1.35,
  "terminal.letterSpacing": 0,
  "terminal.fontFamily": "JetBrains Mono",
  "terminal.scheme": "follow-theme",
  "terminal.scrollback": 5000,
  "terminal.cursorBlink": true,
  "terminal.bell": false,
  "preview.mode": "auto",
  "preview.pauseOnLowMemory": true,
  "diagnostics.notify": true,
  "live.port": 5500,
  "live.spa": false,
  "live.lan": false,
  "git.userName": "",
  "git.userEmail": "",
  "git.autoFetch": false,
  "ai.provider": "anthropic",
  "ai.model": "",
  "ai.temperature": 0.2,
  "ai.agentConfirm": true,
  "ai.autoApply": false,
  "ai.rules": true,
  "ai.endpoint.custom": "http://127.0.0.1:11434/v1",
  "ai.endpoint.ollama": "http://127.0.0.1:11434",
  "ai.systemPrompt": "",
  "github.clientId": "",
  "security.appLock": false,
  "security.lockAfter": 30,
  "security.method": "auto",
  "security.secure": false,
  "extensions.registry": "https://open-vsx.org",
  "plugins.registry": "",
};

class Settings extends Emitter {
  constructor() { super(); this.values = { ...DEFAULTS }; this.state = { recent: [], lastWorkspace: null, sessions: {}, sidebarWidth: 280, panelHeight: 260 }; this.ready = false; }
  async init() {
    const info = await N.sys.info();
    this.dataDir = info.paths.data;
    this.settingsFile = P.join(this.dataDir, "settings.json");
    this.stateFile = P.join(this.dataDir, "state.json");
    try { const r = await N.fs.readText(this.settingsFile); if (r.text) Object.assign(this.values, JSON.parse(r.text)); } catch { /* first run */ }
    try { const r = await N.fs.readText(this.stateFile); if (r.text) Object.assign(this.state, JSON.parse(r.text)); } catch { /* first run */ }
    // device-class font defaults: 12 on a phone, 14 on a tablet / desktop - only where the user has not chosen a size themselves
    this.deviceDefaults = { "editor.fontSize": phone() ? 12 : 14, "terminal.fontSize": phone() ? 12 : 14 };
    if (!this.state.fontDefaultsSeeded) {
      // settings.json written by older builds contains every key (including the old default 14): treat 14 as "unset" once
      for (const k in this.deviceDefaults) if (this.values[k] === 14) this.values[k] = this.deviceDefaults[k];
      this.state.fontDefaultsSeeded = 1; this.saveState(); this._saveSettings();
    }
    this.ready = true;
    document.addEventListener("visibilitychange", () => { if (document.hidden) this.flush(); });
    window.addEventListener("pagehide", () => this.flush());
    N.on("app.pause", () => this.flush());
    return info;
  }
  get(k) { return this.values[k] ?? DEFAULTS[k]; }
  set(k, v) { if (this.values[k] === v) return; this.values[k] = v; this._saveSettings(); this.emit("change", k, v); this.emit("change:" + k, v); }
  // Writes are serialized (an older write can never land after a newer one) and flushed the moment the app
  // is hidden: Android pauses WebView timers on pause, so a plain debounce could be lost when the app is swiped away.
  _write(file, getText) {
    this._chain = (this._chain || Promise.resolve()).then(() => N.fs.writeText(file, getText())).catch((e) => console.warn("settings write failed", file, e));
    return this._chain;
  }
  _saveSettings = debounce(() => this._write(this.settingsFile, () => JSON.stringify(this.values, null, 2)), 120);
  saveState = debounce(() => this._write(this.stateFile, () => JSON.stringify(this.state)), 250);
  flush() { this._saveSettings.cancel(); this.saveState.cancel(); if (!this.ready) return Promise.resolve(); this._write(this.settingsFile, () => JSON.stringify(this.values, null, 2)); return this._write(this.stateFile, () => JSON.stringify(this.state)); }
  addRecent(path) {
    this.state.recent = [path, ...this.state.recent.filter((p) => p !== path)].slice(0, 20);
    (this.state.recentAt ||= {})[path] = Date.now();
    this.state.lastWorkspace = path; this.saveState();
  }
  removeRecent(path) { this.state.recent = this.state.recent.filter((p) => p !== path); if (this.state.lastWorkspace === path) this.state.lastWorkspace = null; this.saveState(); }
}
export const settings = new Settings();
