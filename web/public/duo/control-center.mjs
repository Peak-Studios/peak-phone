import { icon } from './icons.mjs?rev=owner-config-20261015';

const node = (tag, className = '', text = '') => {
  const el = document.createElement(tag); el.className = className; el.textContent = text; return el;
};
const action = (label, glyph, run, className = '') => {
  const el = node('button', `cc-button ${className}`); el.type = 'button';
  el.setAttribute('aria-label', label); el.title = label; el.innerHTML = icon(glyph);
  el.addEventListener('click', run); return el;
};
const ok = value => value != null && value !== false && value !== 'Error' && value.Success !== false;

// Own vertical input handling: older FiveM CEF versions treat vertical ranges as horizontal.
export function bindVerticalSlider(input, { request = requestAnimationFrame, cancel = cancelAnimationFrame, vertical = true } = {}) {
  let pointer = null, key = null, frame = null, last = null, amount = 0;
  const set = value => {
    const next = Math.round(Math.max(Number(input.min), Math.min(Number(input.max), value)));
    if (next !== Number(input.value)) { input.value = next; input.dispatchEvent(new Event('input', { bubbles: true })); }
  };
  const commit = () => input.dispatchEvent(new Event('change', { bubbles: true }));
  const stop = () => {
    const active = key !== null || pointer !== null;
    if (frame !== null) cancel(frame); frame = null; key = null; last = null;
    const captured = pointer; pointer = null;
    if (captured !== null && input.hasPointerCapture?.(captured)) input.releasePointerCapture(captured);
    if (active) commit();
  };
  const tick = time => {
    if (key === null || input.disabled || !input.isConnected) { stop(); return; }
    if (last !== null) { amount += (key === 'ArrowUp' ? 1 : -1) * Math.min(50, time - last) * .035; set(amount); }
    last = time; frame = request(tick);
  };
  const point = event => {
    const rect = input.getBoundingClientRect();
    if (vertical && rect.height) set((rect.bottom - event.clientY) / rect.height * 100);
    else if (!vertical && rect.width) set(Number(input.min) + (event.clientX - rect.left) / rect.width * (Number(input.max) - Number(input.min)));
  };
  input.addEventListener('pointerdown', event => {
    if (input.disabled || event.button !== 0) return;
    event.preventDefault(); stop(); input.focus(); pointer = event.pointerId; input.setPointerCapture(pointer); point(event);
  });
  input.addEventListener('pointermove', event => { if (pointer === event.pointerId) { event.preventDefault(); point(event); } });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) input.addEventListener(name, event => { if (pointer === event.pointerId) stop(); });
  input.addEventListener('keydown', event => {
    if (input.disabled || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) return;
    event.preventDefault();
    const direction = ['ArrowUp', 'ArrowRight'].includes(event.key) ? 'ArrowUp' : 'ArrowDown';
    if (event.repeat) return;
    stop();
    if (['Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) {
      set(event.key === 'Home' ? Number(input.min) : event.key === 'End' ? Number(input.max) : Number(input.value) + (event.key === 'PageUp' ? 10 : -10)); commit(); return;
    }
    key = direction; amount = Number(input.value) + (key === 'ArrowUp' ? 1 : -1); set(amount); frame = request(tick);
  });
  input.addEventListener('keyup', event => { if (/^Arrow/.test(event.key)) { event.preventDefault(); stop(); } });
  input.addEventListener('blur', stop);
  return stop;
}

export class ControlCenter {
  constructor({ target, getState, close, power, openApp, network, layout, setAlerts, send, music, read, write, bank, shareDrop, audio, setAppearance, restoreFocus }) {
    Object.assign(this, { target, getState, close, power, openApp, network, layout, setAlerts, send, music, write, bank, shareDrop, audio, setAppearance, restoreFocus });
    audio.addEventListener('change',()=>this.updateVolume());
    this.brightness = Math.min(100, Math.max(20, Number(read('brightness', 100)) || 100));
    this.torch = false; this.busy = false; this.open = false; this.generation = 0; this.resetVersion = 0; this.sliderStops = []; this.returnFocusTarget = null;
    this.controlPointerId = null;
    target.setAttribute('role', 'dialog'); target.setAttribute('aria-modal', 'true'); target.setAttribute('aria-label', 'Control Center');
    const interactive = 'button,input,select,textarea,a,label,[role="button"]';
    target.addEventListener('pointerdown', event => {
      this.controlPointerId = event.target?.closest?.(interactive) ? event.pointerId : null;
    }, true);
    window.addEventListener('pointerup', event => {
      if (this.controlPointerId === event.pointerId) setTimeout(() => {
        if (this.controlPointerId === event.pointerId) this.controlPointerId = null;
      }, 0);
    }, true);
    window.addEventListener('pointercancel', event => {
      if (this.controlPointerId === event.pointerId) this.controlPointerId = null;
    }, true);
    window.addEventListener('blur', () => { this.controlPointerId = null; });
    target.addEventListener('click', event => {
      const startedOnControl = this.controlPointerId !== null;
      this.controlPointerId = null;
      if (!this.open || event.defaultPrevented || startedOnControl || event.target?.closest?.(interactive)) return;
      this.close();
    });
    this.applyBrightness();
  }
  applyBrightness() { this.bank.style.setProperty('--duo-screen-dim', String((100 - this.brightness) / 100 * .85)); }
  show() {
    if (this.open) return;
    this.returnFocusTarget = document.activeElement;
    this.open = true; this.render(); this.updateMusic(true);
    clearInterval(this.poll); this.poll = setInterval(() => this.updateMusic(true), 3500);
    queueMicrotask(() => { if (this.open) this.target.querySelector('.cc-close')?.focus({ preventScroll: true }); });
  }
  hide({ restoreFocus = true } = {}) {
    for (const stop of this.sliderStops) stop();
    const wasOpen = this.open; this.open = false; this.generation++; clearInterval(this.poll);
    if (!wasOpen) return;
    const target = this.returnFocusTarget; this.returnFocusTarget = null;
    if (restoreFocus) requestAnimationFrame(() => {
      if (this.open) return;
      const canRestore = target?.isConnected && !target.closest?.('[inert],[hidden],[aria-hidden="true"]') && target.getClientRects?.().length;
      if (canRestore) target.focus({ preventScroll: true }); else this.restoreFocus?.();
    });
  }
  containTab(event) {
    const items = [...this.target.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')]
      .filter(item => item.tabIndex >= 0 && item.getClientRects().length && !item.closest('[inert],[hidden],[aria-hidden="true"]'));
    const index = items.indexOf(document.activeElement);
    if (!items.length) {
      event.preventDefault(); this.target.focus({ preventScroll: true });
    } else if (index < 0) {
      event.preventDefault(); items[event.shiftKey ? items.length - 1 : 0].focus({ preventScroll: true });
    } else if (event.shiftKey && index === 0) {
      event.preventDefault(); items.at(-1).focus({ preventScroll: true });
    } else if (!event.shiftKey && index === items.length - 1) {
      event.preventDefault(); items[0].focus({ preventScroll: true });
    }
    event.stopImmediatePropagation();
  }
  reset() {
    this.hide({ restoreFocus: false }); this.resetVersion++;
    if (this.torch) this.send('Phone/Flashlight', { Enabled: false }).catch(() => {});
    this.torch = false;
  }
  status(text) { const status = this.target.querySelector('.cc-feedback'); if (status) status.textContent = text; }
  async change(run) {
    if (this.busy) return;
    const generation = this.generation; this.busy = true; this.target.setAttribute('aria-busy', 'true');
    try { this.status(''); await run(); }
    catch (error) { this.status(error.message || 'Could not change this control.'); }
    finally { this.busy = false; this.target.removeAttribute('aria-busy'); if (this.open && generation === this.generation) this.updateButtons(); }
  }
  shortcut(label, glyph, id, className = '') {
    return action(label, glyph, () => { this.close({ restoreFocus: false }); this.openApp(id); }, `cc-utility ${className}`);
  }
  render() {
    for (const stop of this.sliderStops) stop(); this.sliderStops = [];
    const s = this.getState(); this.target.replaceChildren();
    const content = node('div', 'cc-content');
    const status = node('header', 'cc-status');
    const time = node('time', 'cc-time', s.time);
    const heading = node('span', 'cc-heading', 'Control Center');
    const addControl = this.shortcut('Open Settings', 'settings', 'settings', 'cc-add');
    const power = action('Turn phone off', 'power', () => this.power?.(), 'cc-power');
    status.append(addControl, time, heading, power, action('Close Control Center', 'close', this.close, 'cc-close'));
    const grid = node('div', 'cc-grid');
    const connectivity = node('section', 'cc-connectivity cc-glass'); connectivity.setAttribute('aria-label', 'Connectivity');
    const wifi = action('Choose Wi-Fi network', 'wifi', this.network, 'cc-circle cc-wifi');
    wifi.dataset.on = String(Boolean(s.network)); wifi.title = s.network || 'Choose a nearby network';
    const cellular = action(s.hasSim ? 'SIM and cellular settings' : 'Insert a SIM in Settings', 'signal', () => { this.close({ restoreFocus: false }); this.openApp('settings'); }, 'cc-circle cc-cellular');
    cellular.dataset.on = String(s.hasSim);
    const vpn = action(s.vpn ? 'VPN available Â· open Settings' : 'Privacy settings', 'shield', () => { this.close({ restoreFocus: false }); this.openApp('settings'); }, 'cc-circle cc-vpn');
    vpn.dataset.on = String(s.vpn);
    const display = action('Display and Split View', 'layers', () => { this.close({ restoreFocus: false }); this.layout(); }, 'cc-circle cc-display');
    connectivity.append(wifi, cellular, display, vpn);
    connectivity.append(node('span', 'cc-network-label', s.network ? 'Connected' : 'Connectivity'));
    this.musicCard = node('section', 'cc-media cc-glass'); this.musicCard.setAttribute('aria-label', 'Now playing');
    const focus = action('Do Not Disturb', 'moon', () => this.change(async () => {
      const current = this.getState(); await this.setAlerts({ focus: !current.focus, muted: current.muted });
    }), 'cc-focus cc-glass');
    const focusCopy = node('span', 'cc-focus-copy');
    focusCopy.append(node('strong', '', 'Focus'), node('span', 'cc-focus-caption', s.focus ? 'Do Not Disturb' : 'Off'));
    focus.append(focusCopy);
    const brightness = this.slider('Display brightness', 'sun', this.brightness, 20, false, value => {
      this.brightness = value; this.applyBrightness();
    }, value => this.write('brightness', value), 'cc-brightness');
    this.volume = this.slider('Phone media volume', 'speaker', Math.round(this.audio.volume * 100), 0, false,
      value => this.audio.setVolume(value / 100), undefined, 'cc-volume');
    grid.append(connectivity, this.musicCard, focus, brightness, this.volume);
    const silent = action('Silent mode', 'bell-off', () => this.change(async () => {
      const current = this.getState(); await this.setAlerts({ focus: current.focus, muted: !current.muted });
    }), 'cc-utility cc-silent cc-glass');
    const torch = action('Flashlight', 'flashlight', () => this.change(async () => {
      const enabled = !this.torch; const version = this.resetVersion;
      if (!ok(await this.send('Phone/Flashlight', { Enabled: enabled }))) throw Error('Flashlight is unavailable.');
      if (version !== this.resetVersion) { await this.send('Phone/Flashlight', { Enabled: false }); return; }
      this.torch = enabled;
    }), 'cc-utility cc-torch cc-glass');
    const drop = action('ShareDrop', 'airdrop', () => this.change(async () => {
      const on = await this.shareDrop.toggle(); this.status(on ? 'ShareDrop on - nearby players can ask to share.' : 'ShareDrop off');
    }), 'cc-utility cc-sharedrop cc-glass');
    grid.append(drop);
    const appearance = action('Dark Mode', 'moon', () => { this.setAppearance(this.getState().theme === 'dark' ? 'light' : 'dark'); this.updateButtons(); }, 'cc-utility cc-appearance cc-glass');
    appearance.setAttribute('aria-pressed', String(s.theme === 'dark'));
    grid.append(appearance);
    grid.append(silent, this.shortcut('Phone security', 'lock', 'settings', 'cc-glass'),
      action('Full screen or Split View', 'expand', () => { this.close(); this.layout(); }, 'cc-utility cc-glass'),
      this.shortcut('Settings', 'settings', 'settings', 'cc-glass'), torch,
      this.shortcut('Clock and timers', 'timer', 'clock', 'cc-glass cc-timer'),
      this.shortcut('Calculator', 'calculator', 'calculator', 'cc-glass'),
      this.shortcut('Camera', 'camera', 'camera', 'cc-glass'));
    const rail = node('nav', 'cc-group-rail'); rail.setAttribute('aria-label', 'Control groups');
    const groups = [
      ['Connectivity', 'wifi', '.cc-wifi'], ['Media', 'music', '.cc-media-track'],
      ['Focus', 'moon', '.cc-focus'], ['Quick controls', 'more', '.cc-sharedrop']
    ];
    for (const [label, glyph, selector] of groups) {
      const control = action(`Go to ${label}`, glyph, event => {
        const destination = this.target.querySelector(selector);
        rail.querySelectorAll('button').forEach(button => button.setAttribute('aria-current', String(button === event.currentTarget)));
        destination?.focus({ preventScroll: true });
      }, 'cc-rail-control');
      control.setAttribute('aria-current', 'false'); rail.append(control);
    }
    const feedback = node('p', 'cc-feedback'); feedback.setAttribute('role', 'status'); feedback.setAttribute('aria-live', 'polite');
    const dismiss = node('button', 'cc-button cc-dismiss');
    dismiss.type = 'button'; dismiss.setAttribute('aria-label', 'Dismiss Control Center'); dismiss.title = 'Dismiss Control Center';
    dismiss.addEventListener('click', this.close);
    dismiss.append(node('span', 'cc-dismiss-handle'));
    content.append(status, grid, feedback, rail, dismiss); this.target.append(content);
    this.updateButtons(); this.updateMusic();
  }
  updateButtons() {
    const appearance = this.target.querySelector('.cc-appearance');
    if (appearance) { const dark=this.getState().theme==='dark'; appearance.dataset.on=String(dark); appearance.setAttribute('aria-pressed',String(dark)); }
    const s = this.getState();
    for (const [selector, value] of [['.cc-wifi', Boolean(s.network)], ['.cc-cellular', s.hasSim], ['.cc-vpn', s.vpn]]) {
      const button = this.target.querySelector(selector); if (button) button.dataset.on = String(value);
    }
    const networkLabel = this.target.querySelector('.cc-network-label'); if (networkLabel) networkLabel.textContent = s.network ? 'Connected' : 'Connectivity';
    for (const [selector, enabled] of [['.cc-focus', s.focus], ['.cc-silent', s.muted], ['.cc-torch', this.torch], ['.cc-sharedrop', this.shareDrop?.enabled]]) {
      const el = this.target.querySelector(selector); if (!el) continue;
      el.dataset.on = String(enabled); el.setAttribute('aria-pressed', String(enabled));
      if (selector === '.cc-focus') el.querySelector('.cc-focus-caption').textContent = enabled ? 'Do Not Disturb' : 'Off';
    }
  }
  slider(label, glyph, value, min, disabled, onInput, onChange, className = '') {
    const wrap = node('label', `cc-slider ${className}`); wrap.style.setProperty('--cc-level', `${value}%`);
    const fill = node('span', 'cc-slider-fill');
    const input = node('input'); input.type = 'range'; input.min = min; input.max = 100; input.step = 1; input.value = value; input.disabled = disabled;
    input.setAttribute('aria-label', label); input.setAttribute('aria-valuetext', `${value} percent`);
    const glyphWrap = node('span', 'cc-slider-icon'); glyphWrap.innerHTML = icon(glyph);
    const caption = node('span', 'cc-slider-caption', disabled ? 'No output' : `${value}%`);
    input.addEventListener('input', () => {
      const amount = Number(input.value); wrap.style.setProperty('--cc-level', `${amount}%`);
      caption.textContent = `${amount}%`; input.setAttribute('aria-valuetext', `${amount} percent`); onInput?.(amount);
    });
    input.addEventListener('change', () => onChange?.(Number(input.value)));
    this.sliderStops.push(bindVerticalSlider(input));
    wrap.append(fill, glyphWrap, caption, input); return wrap;
  }
  async updateMusic(refresh = false) {
    const generation = this.generation;
    if (refresh && !this.music.busy) await this.music.refresh();
    if (!this.open || generation !== this.generation || !this.musicCard?.isConnected) return;
    const session = this.music.session;
    this.musicCard.replaceChildren();
    const copy = action('Open Peak Music', 'music', () => { this.close(); this.openApp('peakify'); }, 'cc-media-track');
    const titles = node('span', 'cc-media-titles');
    titles.append(node('strong', '', session?.Title || 'Not Playing'), node('span', '', session ? session.Paused ? 'Paused' : 'Peak Music' : 'Peak Music'));
    copy.append(titles);
    const transport = node('div', 'cc-media-actions');
    const previous = action('Previous song', 'previous', () => this.playback(() => this.music.skip(-1)));
    const play = action(session ? session.Paused ? 'Resume playback' : 'Pause playback' : 'Open music library', session && !session.Paused ? 'pause' : 'play',
      () => session ? this.playback(() => this.music.perform('Peakify/Pause', { NetworkId: this.music.network, Paused: !session.Paused })) : (this.close(), this.openApp('peakify')));
    const next = action('Next song', 'next', () => this.playback(() => this.music.skip(1)));
    previous.disabled = next.disabled = !session || !this.music.tracks.length || this.music.busy;
    play.disabled = this.music.busy; transport.append(previous, play, next);
    this.musicCard.append(copy, transport);
    this.updateVolume();
  }
  updateVolume() {
    const input = this.volume?.querySelector('input');
    if (input) {
      input.disabled = false; input.value = Math.round(this.audio.volume * 100);
      input.setAttribute('aria-valuetext', `${input.value} percent`);
      this.volume.style.setProperty('--cc-level', `${input.value}%`);
      this.volume.querySelector('.cc-slider-caption').textContent = `${input.value}%`;
    }
  }
  async playback(run) {
    await this.change(async () => { const result = await run(); if (result === false) throw Error(this.music.error || 'Playback could not be changed.'); });
    this.updateMusic();
  }
}
