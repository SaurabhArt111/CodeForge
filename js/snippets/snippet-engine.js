/**
 * CodeForge Snippet Engine v4.0
 * ─────────────────────────────────────────────────────────────────────────────
 * VS Code-level snippet system with:
 *   • Tab stop navigation ($1, $2, ... $0 for final)
 *   • Placeholder defaults (${1:name})
 *   • Mirrored tab stops (same index = same value)
 *   • Cursor placement inside inserted content
 *   • TAB key advances, Shift+TAB goes back
 *   • Escape cancels snippet mode
 *
 * DATA FLOW:
 *   1. User types prefix → autocomplete shows snippet item
 *   2. User selects → snippetEngine.insert(ta, parsedSnippet)
 *   3. Engine inserts text, records tab stop positions
 *   4. Engine intercepts TAB / Shift+TAB to jump between stops
 *   5. On $0 reached or Escape → snippet mode deactivated
 *
 * Each TextArea gets its own SnippetSession instance.
 */

class SnippetSession {
  constructor(ta, { text, tabStops }, insertAt, replaceLen) {
    this.ta = ta;
    this.text = text;
    this.tabStops = tabStops;      // sorted: [stop1, stop2, ..., stop0]
    this.stopIdx = 0;               // current position in tabStops array
    this.insertAt = insertAt;       // character offset where snippet was inserted
    this.replaceLen = replaceLen;   // how many chars were replaced (the prefix)
    this.active = true;
    this._offsets = [];             // live character offsets, adjusted as user types in placeholders

    this._computeOffsets();
    this._jumpTo(0);
  }

  _computeOffsets() {
    // Build a map of tabStop adjusted positions based on insertAt
    this._offsets = this.tabStops.map(stop => ({
      ...stop,
      absStart: this.insertAt + stop.start,
      absEnd:   this.insertAt + stop.end,
    }));
  }

  _jumpTo(idx) {
    if (!this.active) return;
    if (idx >= this._offsets.length) {
      this.deactivate();
      return;
    }
    this.stopIdx = idx;
    const stop = this._offsets[idx];
    const ta = this.ta;

    // Select the placeholder text (or just place cursor if empty)
    ta.focus();
    ta.setSelectionRange(stop.absStart, stop.absEnd);

    // Scroll into view if needed
    const lh = 21; // approx line height
    const linesBefore = ta.value.substring(0, stop.absStart).split('\n').length - 1;
    const targetScroll = linesBefore * lh;
    if (targetScroll < ta.scrollTop || targetScroll > ta.scrollTop + ta.clientHeight - lh * 2) {
      ta.scrollTop = Math.max(0, targetScroll - ta.clientHeight / 2);
    }
  }

  next() {
    this._syncOffsets();
    this._jumpTo(this.stopIdx + 1);
  }

  prev() {
    this._syncOffsets();
    if (this.stopIdx > 0) this._jumpTo(this.stopIdx - 1);
  }

  // Recalculate offsets after user types in a placeholder
  // This is the key mechanism that makes mirroring work:
  // if the user types into $1, and $1 appears elsewhere, we update the twin.
  _syncOffsets() {
    const ta = this.ta;
    const currentStop = this._offsets[this.stopIdx];
    if (!currentStop) return;

    // Figure out how much the current stop's content changed
    const newEnd = ta.selectionStart > currentStop.absStart
      ? ta.selectionStart
      : currentStop.absEnd;
    const delta = (newEnd - currentStop.absStart) - (currentStop.absEnd - currentStop.absStart);

    // Apply delta to all stops that come after the current one
    for (let i = this.stopIdx; i < this._offsets.length; i++) {
      const s = this._offsets[i];
      if (i === this.stopIdx) {
        s.absEnd = newEnd;
      } else {
        s.absStart += delta;
        s.absEnd += delta;
      }
    }

    // Mirror: update all stops with the same index
    const currentIndex = this.tabStops[this.stopIdx].index;
    if (currentIndex !== 0) {
      const currentValue = ta.value.substring(currentStop.absStart, currentStop.absEnd);
      this._offsets.forEach((s, i) => {
        if (i !== this.stopIdx && this.tabStops[i].index === currentIndex) {
          const oldLen = s.absEnd - s.absStart;
          const newLen = currentValue.length;
          const mirrorDelta = newLen - oldLen;
          // Replace mirrored text
          ta.value = ta.value.substring(0, s.absStart) + currentValue + ta.value.substring(s.absEnd);
          s.absEnd = s.absStart + newLen;
          // Shift subsequent offsets
          for (let j = i + 1; j < this._offsets.length; j++) {
            this._offsets[j].absStart += mirrorDelta;
            this._offsets[j].absEnd += mirrorDelta;
          }
        }
      });
    }
  }

  deactivate() {
    this.active = false;
    // Place cursor at $0 position or end of snippet
    const finalStop = this._offsets.find(s => this.tabStops[this._offsets.indexOf(s)]?.index === 0);
    if (finalStop) {
      this.ta.setSelectionRange(finalStop.absStart, finalStop.absStart);
    }
  }

  // Returns true if TAB/Shift+TAB was consumed
  handleKey(e) {
    if (!this.active) return false;
    if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) this.prev();
      else this.next();
      return true;
    }
    if (e.key === 'Escape') {
      this.deactivate();
      return true;
    }
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SnippetEngine — global manager, one session per textarea at a time
// ─────────────────────────────────────────────────────────────────────────────
const SnippetEngine = {
  _sessions: new Map(), // taId → SnippetSession

  /**
   * Insert a snippet into a textarea.
   * @param {HTMLTextAreaElement} ta   - the editor textarea
   * @param {object} parsed            - { text, tabStops } from worker
   * @param {number} cursorPos         - current cursor position (where prefix ends)
   * @param {number} prefixLen         - how many chars of prefix to replace
   */
  insert(ta, parsed, cursorPos, prefixLen) {
    if (!ta || !parsed) return;

    // Indent multi-line snippet to match current line's indentation
    const lineStart = ta.value.lastIndexOf('\n', cursorPos - 1) + 1;
    const currentLine = ta.value.substring(lineStart, cursorPos - prefixLen);
    const indent = currentLine.match(/^(\s*)/)[1];

    // Apply indentation to all lines after the first
    const indentedText = parsed.text.replace(/\n/g, '\n' + indent);

    // Calculate offset shift due to indentation
    const indentLen = indent.length;
    const adjustedTabStops = parsed.tabStops.map(stop => {
      // Count how many newlines appear before this stop in the indented text
      const textBefore = indentedText.substring(0, stop.start + /* adjust */ 0);
      const newlinesBefore = (textBefore.match(/\n/g) || []).length;
      const adj = newlinesBefore * indentLen;
      return {
        ...stop,
        start: stop.start + adj,
        end: stop.end + adj,
      };
    });

    const insertStart = cursorPos - prefixLen;
    const insertEnd = cursorPos;

    // Replace prefix + insert snippet text
    const before = ta.value.substring(0, insertStart);
    const after = ta.value.substring(insertEnd);
    ta.value = before + indentedText + after;

    // Kill any existing session for this ta
    const taId = ta.id;
    const existing = this._sessions.get(taId);
    if (existing) existing.deactivate();

    if (adjustedTabStops.length > 0) {
      const session = new SnippetSession(ta, { text: indentedText, tabStops: adjustedTabStops }, insertStart, prefixLen);
      this._sessions.set(taId, session);
    } else {
      // No tab stops: just place cursor at end
      ta.setSelectionRange(insertStart + indentedText.length, insertStart + indentedText.length);
    }
  },

  /**
   * Called from editor's keydown handler. Returns true if key was consumed.
   */
  handleKey(e, taId) {
    const session = this._sessions.get(taId);
    if (!session || !session.active) return false;
    const consumed = session.handleKey(e);
    if (!session.active) this._sessions.delete(taId);
    return consumed;
  },

  isActive(taId) {
    const s = this._sessions.get(taId);
    return s ? s.active : false;
  },

  deactivate(taId) {
    const s = this._sessions.get(taId);
    if (s) { s.deactivate(); this._sessions.delete(taId); }
  },

  /**
   * Quick-insert: expand prefix → snippet synchronously using pre-parsed DB.
   * Used by Emmet-style tab expansion. Async path goes through WorkerBridge.
   */
  expandPrefix(ta, path, cursorPos) {
    const before = ta.value.substring(0, cursorPos);
    const wordMatch = before.match(/[\w:!@.-]+$/);
    if (!wordMatch) return false;

    const prefix = wordMatch[0];
    const ext = (path.split('.').pop() || '').toLowerCase();
    const snipKey = ['js', 'ts', 'jsx', 'tsx'].includes(ext) ? 'js'
      : ['html', 'htm'].includes(ext) ? 'html'
      : ext === 'css' ? 'css'
      : ext === 'py' ? 'python' : null;

    if (!snipKey) return false;

    // We import SNIPPET_DB from window (set by autocomplete.js which loads worker result)
    const db = window._SNIPPET_DB_CACHE?.[snipKey] || [];
    const snip = db.find(s => s.prefix === prefix);
    if (!snip) return false;

    // Parse synchronously (simple version for instant TAB expansion)
    const parsed = _parseSnippetSync(snip.body);
    this.insert(ta, parsed, cursorPos, prefix.length);
    return true;
  }
};

// Synchronous snippet parser (simpler, for TAB-expansion path)
function _parseSnippetSync(bodyLines) {
  const raw = bodyLines.join('\n');
  const tabStops = [];
  let text = '';
  let i = 0;

  while (i < raw.length) {
    if (raw[i] === '$') {
      i++;
      if (raw[i] === '{') {
        i++;
        let numStr = '';
        while (i < raw.length && /\d/.test(raw[i])) numStr += raw[i++];
        const stopIndex = parseInt(numStr, 10);
        let placeholder = '';
        if (raw[i] === ':') {
          i++;
          let depth = 1;
          while (i < raw.length && depth > 0) {
            if (raw[i] === '{') depth++;
            else if (raw[i] === '}') { depth--; if (depth === 0) break; }
            placeholder += raw[i++];
          }
          i++;
        } else if (raw[i] === '}') i++;
        const start = text.length;
        text += placeholder;
        tabStops.push({ index: stopIndex, start, end: text.length, placeholder });
      } else {
        let numStr = '';
        while (i < raw.length && /\d/.test(raw[i])) numStr += raw[i++];
        if (numStr) {
          const stopIndex = parseInt(numStr, 10);
          tabStops.push({ index: stopIndex, start: text.length, end: text.length, placeholder: '' });
        }
      }
    } else {
      text += raw[i++];
    }
  }

  tabStops.sort((a, b) => {
    if (a.index === 0) return 1;
    if (b.index === 0) return -1;
    return a.index - b.index;
  });

  return { text, tabStops };
}

// Expose for Emmet / autocomplete
window._parseSnippetSync = _parseSnippetSync;
