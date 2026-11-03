// Persistent settings + app state, stored as JSON files in the app data dir (survive WebView data clears).
import { N } from "./bridge.js";
import { Emitter } from "./events.js";
import { P, debounce } from "./util.js";

export const DEFAULTS = {
  "ui.theme": "Dark Modern",
  "ui.iconTheme": "seti",
  "ui.mobileKeyBar": true,
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
  "files.autoSave": "afterDelay",
  "files.autoSaveDelay": 1000,
  "files.showHidden": true,
  "files.confirmDelete": true,
  "terminal.mode": "auto",
  "terminal.fontSize": 13,
  "terminal.fontFamily": "JetBrains Mono",
  "terminal.scheme": "follow-theme",
  "terminal.scrollback": 5000,
  "terminal.cursorBlink": true,
  "terminal.bell": false,
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
  "ai.endpoint.custom": "http://127.0.0.1:11434/v1",
  "ai.endpoint.ollama": "http://127.0.0.1:11434",
  "ai.systemPrompt": "",
  "github.clientId": "",
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
    this.ready = true;
    return info;
  }
  get(k) { return this.values[k] ?? DEFAULTS[k]; }
  set(k, v) { if (this.values[k] === v) return; this.values[k] = v; this._saveSettings(); this.emit("change", k, v); this.emit("change:" + k, v); }
  _saveSettings = debounce(() => N.fs.writeText(this.settingsFile, JSON.stringify(this.values, null, 2)).catch(() => {}), 400);
  saveState = debounce(() => N.fs.writeText(this.stateFile, JSON.stringify(this.state)).catch(() => {}), 600);
  addRecent(path) {
    this.state.recent = [path, ...this.state.recent.filter((p) => p !== path)].slice(0, 20);
    this.state.lastWorkspace = path; this.saveState();
  }
  removeRecent(path) { this.state.recent = this.state.recent.filter((p) => p !== path); if (this.state.lastWorkspace === path) this.state.lastWorkspace = null; this.saveState(); }
}
export const settings = new Settings();
