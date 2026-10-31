const DEFAULT_LIFETIME = 5000;
const COUNTDOWN_LIFETIME = 30000;
const MAX_LIFETIME = 60 * 60 * 1000;
const MAX_RECORDS = 8;
const MAX_TITLE = 100;
const MAX_TEXT = 360;

const safeText = (value, limit) => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, limit);
const stableId = value => {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  const id = String(value).trim();
  return id.length > 0 && id.length <= 96 && !/[\u0000-\u001f\u007f]/.test(id) ? id : '';
};
const exactKey = value => {
  const id = stableId(value);
  return id && /^[a-z\d_-]{1,96}$/i.test(id) ? id : '';
};
const positiveId = value => {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

/** Return only the supported, exact notification destinations. */
export function exactNotificationTarget(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  if (data.App === 'messages') {
    const messageId = positiveId(data.MessageId);
    const groupId = exactKey(data.GroupId);
    if (data.GroupId != null && groupId) {
      return { App: 'messages', GroupId: groupId, GroupName: safeText(data.GroupName, 80), MessageId: messageId };
    }
    const phone = stableId(data.Phone);
    if (phone && /^[0-9]{3,24}$/.test(phone)) {
      return { App: 'messages', Phone: phone, Name: safeText(data.Name, 80), MessageId: messageId };
    }
  }
  if (data.App === 'mails') {
    const id = exactKey(data.Id ?? data.MailId ?? data.id);
    if (id) return { App: 'mails', Id: id };
  }
  if (data.App === 'y') {
    const postId = positiveId(data.PostId);
    if (postId != null) return { App: 'y', PostId: postId };
  }
  return null;
}

/** Pointer gesture classification is shared with the browser interaction tests. */
export function notificationGesture(dx, dy, cancelled = false) {
  if (cancelled) return 'suppress';
  const x = Number(dx) || 0, y = Number(dy) || 0;
  if (Math.abs(x) < 30 && y <= -42) return 'dismiss';
  if (Math.abs(x) < 12 && Math.abs(y) < 12) return 'tap';
  return 'suppress';
}

export function notificationLifetime(payload = {}) {
  if (payload.ShowCountdown) return COUNTDOWN_LIFETIME;
  const data = payload.Data && typeof payload.Data === 'object' ? payload.Data : {};
  if (payload.HasAccept || payload.HasReject || payload.HasSpeaker || data.Sticky === true) return MAX_LIFETIME;
  return DEFAULT_LIFETIME;
}

function cssColor(value, fallback) {
  return typeof value === 'string' && /^#(?:[\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i.test(value) ? value : fallback;
}

function make(document, tag, className = '', text = '') {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** Native notification banners with token-bound actions and safe ignore gestures. */
export class NativeNotifications {
  constructor({ target, send, openTarget, canInteract = () => true, appFor = () => null, appIcon = () => '', icon = () => '', onChange = () => {}, now = Date.now, schedule = setTimeout, cancel = clearTimeout, maxRecords = MAX_RECORDS, lifetime = notificationLifetime }) {
    if (!target) throw new TypeError('A notification host is required.');
    this.target = target;
    this.document = target.ownerDocument || document;
    this.send = send || (() => Promise.resolve(null));
    this.openTarget = openTarget || (() => Promise.resolve(false));
    this.canInteract = canInteract;
    this.appFor = appFor;
    this.appIcon = appIcon;
    this.icon = icon;
    this.onChange = typeof onChange === 'function' ? onChange : () => {};
    this.now = now;
    this.schedule = (callback, delay) => schedule(callback, delay);
    this.cancel = timer => cancel(timer);
    this.maxRecords = Math.max(1, Math.min(12, Number(maxRecords) || MAX_RECORDS));
    this.lifetime = lifetime;
    this.records = new Map();
    this.sequence = 0;
    this.localToken = 0;
    this.targetGeneration = 0;
    this.locked = false;
    this.gesture = null;
    this.onPointerMove = event => this.pointerMove(event);
    this.onPointerUp = event => this.pointerEnd(event, false);
    this.onPointerCancel = event => this.pointerEnd(event, true);
    this.document.addEventListener('pointermove', this.onPointerMove, true);
    this.document.addEventListener('pointerup', this.onPointerUp, true);
    this.document.addEventListener('pointercancel', this.onPointerCancel, true);
  }

  add(payload = {}) {
    const id = stableId(payload.Id);
    if (!id) return false;
    const previous = this.records.get(id);
    if (previous) this.drop(previous, false, true);
    const lifetime = Math.max(1000, Math.min(MAX_LIFETIME, Number(this.lifetime(payload)) || DEFAULT_LIFETIME));
    const token = payload.Token == null ? `local-${++this.localToken}` : String(payload.Token);
    const data = payload.Data && typeof payload.Data === 'object' && !Array.isArray(payload.Data) ? { ...payload.Data } : {};
    const createdAt = this.now();
    const record = {
      id, token, sequence: ++this.sequence, createdAt, expiresAt: createdAt + lifetime,
      payload: { ...payload }, data, target: exactNotificationTarget(data), node: null, timer: null, clock: null,
      suppressClickUntil: 0, busy: false,
    };
    this.records.set(id, record);
    this.render(record);
    this.onChange(this.records);
    while (this.records.size > this.maxRecords) {
      const oldest = [...this.records.values()].sort((a, b) => a.sequence - b.sequence)[0];
      if (!oldest) break;
      this.dismiss(oldest.id, oldest.token);
    }
    record.timer = this.schedule(() => {
      if (this.records.get(record.id) === record) this.dismiss(record.id, record.token);
    }, lifetime);
    if (record.payload.ShowTimer || record.payload.ShowCountdown) {
      record.clock = this.schedule(() => this.tick(record), 1000);
    }
    return true;
  }

  update(payload = {}) {
    const id = stableId(payload.Id), record = this.records.get(id);
    if (!record || (payload.Token != null && String(payload.Token) !== record.token)) return false;
    if (payload.RemoveTimer) record.payload.ShowTimer = false;
    if (payload.RemoveCountdown) record.payload.ShowCountdown = false;
    if (typeof payload.Title === 'string') record.payload.Title = payload.Title;
    if (typeof payload.Text === 'string') record.payload.Text = payload.Text;
    if (payload.RemoveActions) { record.payload.HasAccept = false; record.payload.HasReject = false; }
    if (payload.HasSpeaker !== undefined) record.payload.HasSpeaker = !!payload.HasSpeaker;
    if (payload.SpeakerEnabled !== undefined) record.payload.SpeakerEnabled = !!payload.SpeakerEnabled;
    if (payload.HideImmediately) { this.drop(record, false); return true; }
    if (record.timer != null) this.cancel(record.timer);
    if (record.clock != null) this.cancel(record.clock);
    const lifetime = Math.max(1000, Math.min(MAX_LIFETIME, Number(this.lifetime(record.payload)) || DEFAULT_LIFETIME));
    record.createdAt = this.now();
    record.expiresAt = record.createdAt + lifetime;
    record.timer = this.schedule(() => {
      if (this.records.get(record.id) === record) this.dismiss(record.id, record.token);
    }, lifetime);
    if (record.payload.ShowTimer || record.payload.ShowCountdown) record.clock = this.schedule(() => this.tick(record), 1000);
    this.render(record);
    this.onChange(this.records);
    return true;
  }

  remove(payload = {}) {
    const id = stableId(payload.Id), record = this.records.get(id);
    if (!record || (payload.Token != null && String(payload.Token) !== record.token)) return false;
    return this.drop(record, false);
  }

  setLocked(value) {
    const locked = !!value;
    if (this.locked === locked) return;
    this.locked = locked;
    if (locked) this.invalidateTargets();
    for (const record of this.records.values()) this.render(record);
  }

  invalidateTargets() { this.targetGeneration++; }

  reset() {
    this.invalidateTargets();
    this.gesture = null;
    for (const record of [...this.records.values()]) this.drop(record, false);
    this.target.replaceChildren();
  }

  destroy() {
    this.reset();
    this.document.removeEventListener('pointermove', this.onPointerMove, true);
    this.document.removeEventListener('pointerup', this.onPointerUp, true);
    this.document.removeEventListener('pointercancel', this.onPointerCancel, true);
  }

  current(record) { return this.records.get(record.id) === record; }

  drop(record, notify, silent = false) {
    if (!record || !this.current(record)) return false;
    this.records.delete(record.id);
    if (record.timer != null) this.cancel(record.timer);
    if (record.clock != null) this.cancel(record.clock);
    record.timer = record.clock = null;
    record.node?.remove();
    if (this.gesture?.record === record) this.gesture = null;
    if (!silent) this.onChange(this.records);
    if (notify) Promise.resolve(this.send('Notifications/Dismiss', { Id: record.id, Token: record.token })).catch(() => {});
    return true;
  }

  dismiss(id, token) {
    const record = this.records.get(stableId(id));
    if (!record || (token != null && String(token) !== record.token)) return false;
    return this.drop(record, true);
  }

  pointerDown(event, record) {
    if (!this.current(record) || !this.canInteract() || event.isPrimary === false || (event.button != null && event.button !== 0)) return;
    this.gesture = { record, pointerId: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, dy: 0 };
  }

  pointerMove(event) {
    const gesture = this.gesture;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    gesture.dx = event.clientX - gesture.x;
    gesture.dy = event.clientY - gesture.y;
  }

  pointerEnd(event, cancelled) {
    const gesture = this.gesture;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    this.gesture = null;
    const intent = notificationGesture(event.clientX - gesture.x, event.clientY - gesture.y, cancelled);
    if (intent === 'dismiss') this.dismiss(gesture.record.id, gesture.record.token);
    else if (intent === 'suppress') gesture.record.suppressClickUntil = this.now() + 700;
  }

  async activate(record) {
    if (!this.current(record) || this.locked || !this.canInteract() || !record.target) return false;
    const generation = this.targetGeneration;
    const isCurrent = () => this.current(record) && generation === this.targetGeneration && !this.locked && this.canInteract();
    try { return await this.openTarget(record.target, { isCurrent }); }
    catch { return false; }
  }

  async action(record, accepted) {
    if (!this.current(record) || this.locked || record.busy || !this.canInteract()) return false;
    record.busy = true;
    for (const button of record.node.querySelectorAll('.ios-notification-action')) button.disabled = true;
    try {
      const result = await this.send('Notifications/Click', { Id: record.id, Token: record.token, Accepted: !!accepted });
      if (!this.current(record)) return false;
      if (result?.Consumed === true) this.drop(record, false);
      else { record.busy = false; this.render(record); }
      return true;
    } catch {
      if (this.current(record)) { record.busy = false; this.render(record); }
      return false;
    }
  }

  async speaker(record) {
    if (!this.current(record) || this.locked || !this.canInteract()) return false;
    try { await this.send('Contacts/ToggleSpeaker', { CallId: record.data.CallId }); return true; }
    catch { return false; }
  }

  tick(record) {
    if (!this.current(record)) return;
    const value = record.payload.ShowCountdown
      ? Math.max(0, Math.ceil((record.expiresAt - this.now()) / 1000))
      : Math.max(0, Math.floor((this.now() - record.createdAt) / 1000));
    if (record.clockNode) record.clockNode.textContent = `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
    if (record.progress) record.progress.style.transform = `scaleX(${record.payload.ShowCountdown ? Math.max(0, (record.expiresAt - this.now()) / (record.expiresAt - record.createdAt)) : 1})`;
    if (record.payload.ShowCountdown && value <= 0) { this.dismiss(record.id, record.token); return; }
    record.clock = this.schedule(() => this.tick(record), 1000);
  }

  render(record) {
    if (!this.current(record)) return;
    const doc = this.document;
    const locked = this.locked;
    const payload = record.payload;
    const priorNode = record.node;
    const card = make(doc, 'article', 'ios-notification');
    card.dataset.notificationId = record.id;
    card.dataset.locked = String(locked);
    card.setAttribute('role', 'group');
    card.setAttribute('aria-label', locked ? 'Notification' : `${safeText(payload.Title, MAX_TITLE) || 'Notification'} notification`);
    card.addEventListener('pointerdown', event => this.pointerDown(event, record));
    card.addEventListener('click', event => {
      if (this.now() < record.suppressClickUntil) {
        event.preventDefault(); event.stopImmediatePropagation(); return;
      }
    }, true);
    const content = make(doc, record.target && !locked ? 'button' : 'div', 'ios-notification-content');
    if (content.tagName === 'BUTTON') {
      content.type = 'button';
      content.setAttribute('aria-label', `Open ${this.appFor(record.target.App)?.name || 'notification'}`);
      content.addEventListener('click', () => this.activate(record));
    }
    const iconWrap = make(doc, 'span', 'ios-notification-icon');
    const app = this.appFor(record.target?.App || record.data.App);
    const trustedIcon = app ? this.appIcon(app) : this.icon('bell');
    iconWrap.innerHTML = trustedIcon || this.icon('bell');
    iconWrap.style.setProperty('--notification-accent', cssColor(payload.BgColor, app?.color || '#5b85bd'));
    const copy = make(doc, 'span', 'ios-notification-copy');
    const heading = make(doc, 'span', 'ios-notification-heading');
    heading.append(make(doc, 'strong', 'ios-notification-title', locked ? 'Notification' : (safeText(payload.Title, MAX_TITLE) || 'Notification')));
    const appName = locked ? 'PEAK DUO' : (app?.name || 'PEAK DUO');
    heading.append(make(doc, 'small', 'ios-notification-app', appName));
    copy.append(heading, make(doc, 'span', 'ios-notification-message', locked ? 'Unlock your phone to view it.' : safeText(payload.Text, MAX_TEXT)));
    const meta = make(doc, 'span', 'ios-notification-meta');
    const clock = make(doc, 'span', 'ios-notification-time', payload.ShowCountdown ? '00:30' : 'now');
    meta.append(clock);
    content.append(iconWrap, copy, meta);
    card.append(content);
    record.clockNode = payload.ShowTimer || payload.ShowCountdown ? clock : null;
    record.progress = null;
    if (!locked && (payload.HasAccept || payload.HasReject || payload.HasSpeaker)) {
      const actions = make(doc, 'div', 'ios-notification-actions');
      if (payload.HasAccept) actions.append(this.actionButton('Accept', 'check', 'accept', () => this.action(record, true), record.busy));
      if (payload.HasReject) actions.append(this.actionButton('Decline', 'close', 'reject', () => this.action(record, false), record.busy));
      if (payload.HasSpeaker) actions.append(this.actionButton(payload.SpeakerEnabled ? 'Mute speaker' : 'Use speaker', 'speaker', 'speaker', () => this.speaker(record), record.busy));
      card.append(actions);
    }
    if (payload.ShowCountdown) {
      const progress = make(doc, 'span', 'ios-notification-progress');
      record.progress = progress;
      card.append(progress);
    }
    record.node = card;
    if (priorNode?.parentNode === this.target) priorNode.replaceWith(card);
    else this.target.insertBefore(card, this.target.firstChild);
  }

  actionButton(label, glyph, kind, run, disabled) {
    const button = make(this.document, 'button', `ios-notification-action ios-notification-${kind}`);
    button.type = 'button';
    button.setAttribute('aria-label', label);
    button.append(this.svg(this.icon(glyph)), make(this.document, 'span', '', label));
    button.disabled = !!disabled || this.locked;
    button.addEventListener('click', event => { event.stopPropagation(); run(); });
    return button;
  }

  svg(markup) {
    const template = this.document.createElement('template');
    template.innerHTML = markup || '';
    return template.content;
  }
}
