// Minimal event bus.
export class Emitter {
  constructor() { this._l = new Map(); }
  on(ev, fn) { (this._l.get(ev) || this._l.set(ev, new Set()).get(ev)).add(fn); return () => this.off(ev, fn); }
  off(ev, fn) { this._l.get(ev)?.delete(fn); }
  once(ev, fn) { const off = this.on(ev, (...a) => { off(); fn(...a); }); return off; }
  emit(ev, ...a) { for (const fn of [...(this._l.get(ev) || [])]) { try { fn(...a); } catch (e) { console.error("[bus]", ev, e); } } }
}
export const bus = new Emitter();
