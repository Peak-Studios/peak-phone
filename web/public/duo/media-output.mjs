const level = value => Math.max(0, Math.min(1, Number(value)));

// One local output level for every phone app. App mute/preview flags remain owned
// by each app; this controller only scales playback and never enables a microphone.
export class PhoneMediaOutput extends EventTarget {
  constructor({ storage = globalThis.localStorage, send = async () => ({ Success: true }) } = {}) {
    super(); this.storage = storage; this.send = send; this.volume = .7; this.powered = true;
    this.destroyed = false; this.key = ''; this.media = new Map(); this.sending = false; this.pending = false;
  }
  configure(send) { this.send = send; this.sync(); }
  selectDevice(key) {
    const next = `peak-duo:output:${key}`;
    if (next === this.key) return;
    this.key = next; this.volume = .7; this.powered = true;
    try { const saved = JSON.parse(this.storage?.getItem(next));
      if (typeof saved?.volume === 'number' && Number.isFinite(saved.volume)) this.volume = level(saved.volume);
      if (typeof saved?.powered === 'boolean') this.powered = saved.powered;
    } catch {}
    this.changed();
  }
  save() { if (this.key) try { this.storage?.setItem(this.key, JSON.stringify({ volume: this.volume, powered: this.powered })); } catch {} }
  setVolume(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return false;
    this.volume = level(value); this.save(); this.changed(); return true;
  }
  step(direction) { this.setVolume(Math.round((this.volume + direction * .05) * 100) / 100); }
  setPowered(value) {
    if (typeof value !== 'boolean' || value === this.powered) return false;
    this.powered = value; this.save(); this.changed(); return true;
  }
  changed() {
    for (const element of this.media.keys()) this.apply(element);
    this.dispatchEvent(new Event('change')); this.sync();
  }
  register(element, explicit = true) {
    const existing = this.media.get(element);
    if (existing) { existing.explicit ||= explicit; return () => this.unregister(element); }
    const record = { base: Number.isFinite(element.volume) ? element.volume : 1, applied: null, explicit };
    record.changed = () => {
      if (element.volume === record.applied) return;
      record.base = level(element.volume); this.apply(element);
    };
    this.media.set(element, record); element.addEventListener('volumechange', record.changed); this.apply(element);
    return () => this.unregister(element);
  }
  unregister(element) {
    const record = this.media.get(element); if (!record) return;
    element.removeEventListener('volumechange', record.changed); this.media.delete(element);
  }
  apply(element) {
    const record = this.media.get(element); if (!record) return;
    record.applied = record.base * (this.powered ? this.volume : 0);
    if (element.volume !== record.applied) element.volume = record.applied;
  }
  observe(document) {
    this.document = document;
    const scan = node => {
      if (node.matches?.('audio,video')) this.register(node, false);
      for (const media of node.querySelectorAll?.('audio,video') || []) this.register(media, false);
    };
    scan(document);
    this.observer = new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) scan(node);
      for (const [element, record] of this.media) if (!record.explicit && !element.isConnected) this.unregister(element);
    });
    this.observer.observe(document.body, { childList: true, subtree: true });
    this.onPlay = event => { if (event.target.matches?.('audio,video')) this.register(event.target, false); };
    document.addEventListener('play', this.onPlay, true);
  }
  async sync() {
    if (this.destroyed) return;
    this.pending = true; if (this.sending) return;
    this.sending = true;
    try {
      while (this.pending && !this.destroyed) {
        this.pending = false;
        try {
          const result = await this.send('Phone/MediaOutput', { Volume: this.volume, Powered: this.powered });
          if (result?.Success === false || result?.__phoneError) throw Error(result.Error || result.error || 'Phone output could not be changed.');
        } catch (error) {
          if (!this.destroyed) this.dispatchEvent(new CustomEvent('error', { detail: error }));
          // A newer setting may have arrived during the failed request. Drain
          // that setting, but never automatically retry the failed snapshot.
        }
      }
    }
    finally { this.sending = false; }
  }
  destroy() {
    this.destroyed = true; this.pending = false;
    this.observer?.disconnect(); this.document?.removeEventListener('play', this.onPlay, true);
    for (const element of this.media.keys()) this.unregister(element);
  }
}
export const phoneMedia = new PhoneMediaOutput();
