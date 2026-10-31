const make = (tag, className, text = '') => { const node = document.createElement(tag); node.className = className; if (text) node.textContent = text; return node; };
const control = (label, className, action) => { const button = make('button', className, label); button.type = 'button'; button.setAttribute('aria-label', label); button.addEventListener('click', action); return button; };
const focus = target => { try { target?.focus?.({ preventScroll: true }); } catch { target?.focus?.(); } };

export class ClockAlertSurface {
  constructor({ target, service, backgrounds = [] }) {
    this.target = target; this.service = service; this.backgrounds = backgrounds; this.backgroundStates = null; this.returnFocus = null; this.open = false;
    this.layer = make('div', 'duo-clock-alert-layer'); this.layer.hidden = true; this.layer.setAttribute('aria-hidden', 'true');
    this.panel = make('section', 'duo-clock-alert-panel'); this.panel.setAttribute('role', 'alertdialog'); this.panel.setAttribute('aria-modal', 'true'); this.panel.setAttribute('aria-labelledby', 'duo-clock-alert-title'); this.panel.setAttribute('aria-describedby', 'duo-clock-alert-message');
    this.panel.tabIndex = -1;
    this.title = make('h2', '', 'Alarm'); this.title.id = 'duo-clock-alert-title';
    this.message = make('p', '', 'Time to wake up.'); this.message.id = 'duo-clock-alert-message';
    this.snooze = control('Snooze', 'duo-clock-alert-snooze', () => this.service.snoozeAlert());
    this.stop = control('Stop', 'duo-clock-alert-stop', () => this.service.dismissAlert());
    this.panel.append(this.title, this.message, this.snooze, this.stop); this.layer.append(this.panel); target.append(this.layer);
    this.onAlert = event => this.show(event.detail);
    this.onAlertChange = event => { if (!event.detail) this.hide(); };
    this.onKey = event => {
      if (!this.open) return;
      if (event.key === 'Escape') { event.preventDefault(); this.service.dismissAlert(); return; }
      if (event.key !== 'Tab') return;
      const controls = [...this.panel.querySelectorAll('button:not([disabled])')].filter(button => !button.hidden && button.getClientRects().length > 0);
      const index = controls.indexOf(document.activeElement);
      if (event.shiftKey && (index <= 0 || document.activeElement === this.panel)) { event.preventDefault(); focus(controls.at(-1)); }
      else if (!event.shiftKey && (index < 0 || index === controls.length - 1)) { event.preventDefault(); focus(controls[0]); }
    };
    this.onFocus = event => { if (this.open && !this.panel.contains(event.target)) focus(this.stop); };
    this.layer.addEventListener('click', event => { if (event.target === this.layer) this.service.dismissAlert(); });
    service.addEventListener('alert', this.onAlert); service.addEventListener('alertchange', this.onAlertChange);
    document.addEventListener('keydown', this.onKey, true); document.addEventListener('focusin', this.onFocus, true);
  }
  show(alert) {
    if (!alert) return;
    if (!this.open) this.returnFocus = document.activeElement;
    this.lockBackground();
    this.open = true; this.layer.hidden = false; this.layer.removeAttribute('aria-hidden');
    this.title.textContent = alert.title || (alert.kind === 'timer' ? 'Timer' : 'Alarm');
    this.message.textContent = alert.kind === 'timer' ? 'Timer finished.' : 'Alarm is sounding.';
    this.snooze.hidden = alert.kind !== 'alarm' || alert.snoozeEnabled !== true;
    requestAnimationFrame(() => { if (this.open) focus(this.snooze.hidden ? this.stop : this.snooze); });
  }
  lockBackground() {
    if (this.backgroundStates) return;
    this.backgroundStates = this.backgrounds.filter(node => node?.isConnected).map(node => ({ node, inert: node.inert, ariaHidden: node.getAttribute('aria-hidden') }));
    for (const { node } of this.backgroundStates) { node.inert = true; node.setAttribute('aria-hidden', 'true'); }
  }
  unlockBackground() {
    for (const { node, inert, ariaHidden } of this.backgroundStates || []) {
      node.inert = inert;
      if (ariaHidden == null) node.removeAttribute('aria-hidden'); else node.setAttribute('aria-hidden', ariaHidden);
    }
    this.backgroundStates = null;
  }
  hide() {
    if (!this.open) return;
    this.unlockBackground();
    const target = this.returnFocus;
    const canReturn = target?.isConnected && !target.closest('[inert], [hidden]') && !this.layer.contains(target);
    if (this.layer.contains(document.activeElement)) {
      if (canReturn) focus(target);
      if (this.layer.contains(document.activeElement)) document.activeElement.blur?.();
    }
    this.open = false; this.layer.hidden = true; this.layer.setAttribute('aria-hidden', 'true'); this.returnFocus = null;
    requestAnimationFrame(() => { if (!this.open && canReturn && target.isConnected && !target.closest('[inert], [hidden]')) focus(target); });
  }
  destroy() {
    this.service.removeEventListener('alert', this.onAlert); this.service.removeEventListener('alertchange', this.onAlertChange);
    this.unlockBackground(); document.removeEventListener('keydown', this.onKey, true); document.removeEventListener('focusin', this.onFocus, true); this.layer.remove();
  }
}
