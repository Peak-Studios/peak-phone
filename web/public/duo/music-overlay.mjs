import { icon } from './icons.mjs?rev=owner-config-20261015';
import { artwork, safeAudioURL, resultOK } from './ui-kit.mjs?rev=owner-config-20261015';

const musicNetwork = id => /^peakify-(boombox|vehicle|carried)-/.test(String(id || ''));
const create = (tag, className, text) => {
  const node = document.createElement(tag);
  node.className = className;
  if (text != null) node.textContent = text;
  return node;
};
const control = (label, glyph, handler) => {
  const node = create('button', 'duo-music-control');
  node.type = 'button';
  node.title = label;
  node.setAttribute('aria-label', label);
  node.innerHTML = icon(glyph);
  node.addEventListener('click', handler);
  return node;
};
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const placementKey = 'peak-duo:music-placement';

export class MusicOverlay {
  constructor({ send, stores, preview, openMusic }) {
    this.send = send;
    this.stores = stores;
    this.preview = preview;
    this.openMusic = openMusic;
    this.phoneVisible = true;
    this.editing = false;
    this.network = '';
    this.session = null;
    this.tracks = [];
    this.busy = false;
    this.generation = 0;
    this.revealAt = 0;
    this.revealTimer = null;
    this.placement = this.readPlacement();
    this.root = create('aside', 'duo-music-overlay');
    this.root.setAttribute('aria-label', 'Peak Music player');
    this.root.hidden = true;
    this.root.inert = true;
    const glass = create('div', 'duo-music-backdrop');
    if (!preview) {
      const view = document.createElement('object');
      view.type = 'application/x-cfx-game-view';
      view.className = 'duo-music-gameview';
      view.setAttribute('aria-hidden', 'true');
      glass.append(view);
    }
    this.surface = create('div', 'duo-music-surface');
    this.root.append(glass, this.surface);
    document.body.append(this.root);
    this.applyPlacement();
    this.unsubscribe = stores.CurrentNetwork.subscribe(value => {
      const next = String(value || '');
      if (next === this.network) return;
      this.network = next;
      this.session = null;
      this.refreshVisibility();
      this.refresh();
    });
    this.poll = setInterval(() => {
      if (!this.phoneVisible && musicNetwork(this.network) && !this.busy && !this.editing) this.refresh();
    }, 4500);
    this.render();
  }
  readPlacement() {
    try {
      const value = JSON.parse(localStorage.getItem(placementKey));
      if (Number.isFinite(value?.x) && Number.isFinite(value?.y))
        return { x: clamp(value.x, 0, 1), y: clamp(value.y, 0, 1) };
    } catch {}
    return { x: 0.975, y: 0.96 };
  }
  applyPlacement() {
    const width = this.root.offsetWidth || 276;
    const height = this.root.offsetHeight || 220;
    this.root.style.left = `${clamp(this.placement.x * innerWidth - width, 8, Math.max(8, innerWidth - width - 8))}px`;
    this.root.style.top = `${clamp(this.placement.y * innerHeight - height, 8, Math.max(8, innerHeight - height - 8))}px`;
  }
  refreshVisibility() {
    const show = (!this.phoneVisible && Date.now() >= this.revealAt && !!this.session && musicNetwork(this.network)) || this.editing;
    this.root.hidden = !show;
    this.root.inert = !show;
    this.root.dataset.editing = String(this.editing);
    if (show) requestAnimationFrame(() => this.applyPlacement());
  }
  setPhoneVisible(value) {
    value = !!value;
    if (this.phoneVisible === value) return;
    this.phoneVisible = value;
    clearTimeout(this.revealTimer);
    this.revealAt = value ? 0 : Date.now() + 550;
    if (!value) this.revealTimer = setTimeout(() => this.refreshVisibility(), 560);
    if (value && this.editing) this.finishMove();
    this.refreshVisibility();
    if (!value) this.refresh();
  }
  reset() {
    this.generation++;
    this.session = null;
    this.tracks = [];
    if (this.editing) this.finishMove();
    this.refreshVisibility();
  }
  async refresh() {
    const network = this.network;
    const token = ++this.generation;
    if (!musicNetwork(network)) {
      this.session = null;
      this.render();
      return;
    }
    try {
      const [session, library] = await Promise.all([
        this.send('Peakify/GetDeviceState', { NetworkId: network }),
        this.send('Peakify/GetState', {})
      ]);
      if (token !== this.generation || network !== this.network) return;
      this.session = session?.NetworkId === network ? session : null;
      this.tracks = Array.isArray(library?.Tracks) ? library.Tracks : [];
      this.render();
    } catch {
      // A failed read leaves the last confirmed session on screen.
    }
  }
  async perform(event, data) {
    if (this.busy || !this.session) return false;
    this.busy = true;
    this.render();
    try {
      const result = await this.send(event, data);
      if (!resultOK(result)) throw Error(result?.Message || 'Playback could not be changed.');
      this.error = '';
      await this.refresh();
      return true;
    } catch (error) {
      this.error = error.message || 'Playback could not be changed.';
      return false;
    } finally {
      this.busy = false;
      this.render();
    }
  }
  async skip(direction) {
    const list = this.tracks.filter(track => safeAudioURL(track?.url));
    if (!list.length || !this.session) return;
    const current = list.findIndex(track => track.url === this.session.Url);
    const track = list[current < 0 ? 0 : (current + direction + list.length) % list.length];
    return await this.perform('Peakify/Play', {
      NetworkId: this.network, Url: safeAudioURL(track.url), Title: track.title || '',
      Radius: this.session.Radius || 25, Volume: this.session.Volume ?? 0.35
    });
  }
  render() {
    this.surface.replaceChildren();
    const session = this.session;
    const top = create('div', 'duo-music-top');
    const cover = artwork(session?.Url || 'peak-music');
    cover.classList.add('duo-music-cover');
    const output = control('Open Peak Music', 'speaker', () => this.openMusic());
    output.classList.add('duo-music-output');
    top.append(cover, output);
    const copy = create('div', 'duo-music-copy');
    copy.append(create('strong', '', session?.Title || 'Peak Music'),
      create('span', '', session ? (session.Paused ? 'Paused' : 'Playing') + ' · ' + (this.network.startsWith('peakify-vehicle-') ? 'Vehicle radio' : 'Speaker') : 'Nothing playing'));
    const actions = create('div', 'duo-music-actions');
    const previous = control('Previous saved song', 'previous', () => this.skip(-1));
    const pause = control(session?.Paused ? 'Resume playback' : 'Pause playback', session?.Paused ? 'play' : 'pause',
      () => this.perform('Peakify/Pause', { NetworkId: this.network, Paused: !session.Paused }));
    pause.classList.add('duo-music-primary');
    const next = control('Next saved song', 'next', () => this.skip(1));
    previous.disabled = next.disabled = this.busy || !session || !this.tracks.length;
    pause.disabled = this.busy || !session;
    actions.append(previous, pause, next);
    this.status = create('p', 'duo-music-status', this.editing ? 'Drag to move · Enter to save · Esc to cancel' : this.error || '');
    const drag = create('div', 'duo-music-drag');
    drag.setAttribute('aria-label', 'Move music player');
    drag.addEventListener('pointerdown', event => this.startDrag(event));
    this.surface.append(drag, top, copy, actions, this.status);
    this.refreshVisibility();
  }
  startMove() {
    if (this.phoneVisible) return;
    this.originalPlacement = { ...this.placement };
    this.editing = true;
    this.render();
  }
  finishMove(cancel = false) {
    if (!this.editing) return;
    if (cancel) this.placement = this.originalPlacement;
    else {
      try { localStorage.setItem(placementKey, JSON.stringify(this.placement)); } catch {}
    }
    this.editing = false;
    this.applyPlacement();
    this.render();
    if (!this.preview) this.send('Music/FinishMove', {}).catch(() => {});
  }
  startDrag(event) {
    if (!this.editing || event.button !== 0) return;
    event.preventDefault();
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const box = this.root.getBoundingClientRect();
    const dx = event.clientX - box.left;
    const dy = event.clientY - box.top;
    const move = e => {
      const x = clamp(e.clientX - dx, 8, innerWidth - box.width - 8);
      const y = clamp(e.clientY - dy, 8, innerHeight - box.height - 8);
      this.root.style.left = x + 'px';
      this.root.style.top = y + 'px';
      this.placement = { x: (x + box.width) / innerWidth, y: (y + box.height) / innerHeight };
    };
    const end = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', end);
      target.removeEventListener('pointercancel', end);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', end);
  }
}
