import { CLOCK_CITIES, DEFAULT_CLOCK_CITIES, isClockCityId, normalizeClockCities } from './clock-cities.mjs';

const VERSION = 1;
const MAX_TIMERS = 20;
const MAX_ALARMS = 32;
const MAX_LAPS = 100;
const MAX_ALERT_QUEUE = 16;
const MAX_ALERT_AGE_MS = 60000;
const DAY = 86400000;
const MAX_ZONE_FORMATTERS = 32;
const MAX_ZONE_CACHE = 256;
const zoneFormatterCache = new Map();
const zoneOffsetCache = new Map();
const alarmOccurrenceCache = new Map();
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const detailEvent = (type, detail) => { const event = new Event(type); Object.defineProperty(event, 'detail', { value: detail }); return event; };
const cleanLabel = (value, fallback = '') => String(value ?? fallback).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 40);
const id = () => globalThis.crypto?.randomUUID?.() || `clock-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

function formatter(zone) {
  const key = String(zone);
  let value = zoneFormatterCache.get(key);
  if (value) {
    zoneFormatterCache.delete(key); zoneFormatterCache.set(key, value);
    return value;
  }
  value = new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  zoneFormatterCache.set(key, value);
  if (zoneFormatterCache.size > MAX_ZONE_FORMATTERS) zoneFormatterCache.delete(zoneFormatterCache.keys().next().value);
  return value;
}
export function localParts(epoch, zone) {
  const values = Object.fromEntries(formatter(zone).formatToParts(new Date(epoch)).map(part => [part.type, part.value]));
  return { year: Number(values.year), month: Number(values.month), day: Number(values.day), weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(values.weekday), hour: Number(values.hour), minute: Number(values.minute), second: Number(values.second) };
}
const dateKey = ({ year, month, day }) => `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
const fromKey = key => { const [year, month, day] = String(key).split('-').map(Number); return { year, month, day }; };
const utcDate = (year, month, day, hour = 0, minute = 0, second = 0) => {
  const value = new Date(0); value.setUTCFullYear(year, month - 1, day); value.setUTCHours(hour, minute, second, 0); return value;
};
const shiftDate = (date, days) => { const d = utcDate(date.year, date.month, date.day + days); return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }; };
const naiveEpoch = date => utcDate(date.year, date.month, date.day, date.hour || 0, date.minute || 0, date.second || 0).getTime();
const validDateKey = key => {
  if (typeof key !== 'string' || !/^(\d{4})-(\d{2})-(\d{2})$/.test(key)) return false;
  const [, yearText, monthText, dayText] = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  const year = Number(yearText), month = Number(monthText), day = Number(dayText);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1];
};
const validDateParts = date => !!date && Number.isInteger(date.year) && Number.isInteger(date.month) && Number.isInteger(date.day) && validDateKey(dateKey(date));
function cacheValue(cache, key, create, limit = MAX_ZONE_CACHE) {
  if (cache.has(key)) {
    const value = cache.get(key); cache.delete(key); cache.set(key, value); return value;
  }
  const value = create(); cache.set(key, value);
  if (cache.size > limit) cache.delete(cache.keys().next().value);
  return value;
}
function offsetsFor(date, zone) {
  const key = `${zone}\u0000${dateKey(date)}`;
  return cacheValue(zoneOffsetCache, key, () => {
    const naive = naiveEpoch(date), offsets = new Set();
    for (const delta of [-36, -18, -6, 0, 6, 18, 36]) {
      const sample = naive + delta * 3600000, parts = localParts(sample, zone);
      offsets.add(naiveEpoch(parts) - sample);
    }
    return [...offsets];
  });
}
function exactCandidates(date, hour, minute, zone, offsets = offsetsFor(date, zone)) {
  const local = { ...date, hour, minute }, naive = naiveEpoch(local), candidates = new Set();
  for (const offset of offsets) {
    const epoch = naive - offset, parts = localParts(epoch, zone);
    if (parts.year === date.year && parts.month === date.month && parts.day === date.day && parts.hour === hour && parts.minute === minute) candidates.add(epoch);
  }
  return [...candidates].sort((a, b) => a - b);
}
function rememberOccurrence(key, value) {
  if (value) cacheValue(alarmOccurrenceCache, key, () => value);
  return value ? { ...value } : null;
}

// Resolves local wall time without assuming every day is 24 hours. Ambiguous
// fall-back times choose the first epoch; nonexistent spring-forward times
// advance to the first valid local minute after the gap.
export function resolveLocalAlarm(date, hour, minute, zone) {
  if (!validDateParts(date) || !Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  const key = `${zone}\u0000${dateKey(date)}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  if (alarmOccurrenceCache.has(key)) {
    const cached = alarmOccurrenceCache.get(key); alarmOccurrenceCache.delete(key); alarmOccurrenceCache.set(key, cached);
    return { ...cached };
  }
  try {
    const offsets = offsetsFor(date, zone);
    const startMinute = hour * 60 + minute;
    for (let n = startMinute; n < 1440; n++) {
      const candidates = exactCandidates(date, Math.floor(n / 60), n % 60, zone, offsets);
      if (candidates.length) return rememberOccurrence(key, { at: candidates[0], occurrenceId: `${dateKey(date)}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}@${candidates[0]}`, adjusted: n !== startMinute });
    }
  } catch { return null; }
  return null;
}

export function nextAlarmOccurrence(alarm, now, zone = Intl.DateTimeFormat().resolvedOptions().timeZone, maxDays = 370) {
  if (!alarm || !Number.isInteger(alarm.hour) || !Number.isInteger(alarm.minute)) return null;
  try {
    const today = localParts(now, zone), repeat = Array.isArray(alarm.days) && alarm.days.length > 0;
    if (!repeat) {
      if (!validDateKey(alarm.date)) return null;
      const occurrence = resolveLocalAlarm(fromKey(alarm.date), alarm.hour, alarm.minute, zone);
      return occurrence && occurrence.at > now && occurrence.occurrenceId !== alarm.lastOccurrenceId ? occurrence : null;
    }
    for (let offset = 0; offset <= Math.min(maxDays, repeat ? 370 : 370); offset++) {
      const date = shiftDate(today, offset), key = dateKey(date);
      if (repeat && !alarm.days.includes(utcDate(date.year, date.month, date.day).getUTCDay())) continue;
      if (!repeat && key !== alarm.date) continue;
      const next = resolveLocalAlarm(date, alarm.hour, alarm.minute, zone);
      if (!next || next.at <= now || next.occurrenceId === alarm.lastOccurrenceId) continue;
      return next;
    }
  } catch { return null; }
  return null;
}
export function latestAlarmOccurrence(alarm, now, zone = Intl.DateTimeFormat().resolvedOptions().timeZone, maxDays = 7) {
  if (!alarm || !Number.isInteger(alarm.hour) || !Number.isInteger(alarm.minute)) return null;
  try {
    const today = localParts(now, zone), repeat = Array.isArray(alarm.days) && alarm.days.length > 0;
    if (!repeat && validDateKey(alarm.date)) {
      const occurrence = resolveLocalAlarm(fromKey(alarm.date), alarm.hour, alarm.minute, zone);
      return occurrence?.at <= now ? occurrence : null;
    }
    for (let offset = 0; offset <= Math.min(maxDays, 370); offset++) {
      const date = shiftDate(today, -offset), key = dateKey(date);
      if (repeat && !alarm.days.includes(utcDate(date.year, date.month, date.day).getUTCDay())) continue;
      if (!repeat && key !== alarm.date) continue;
      const occurrence = resolveLocalAlarm(date, alarm.hour, alarm.minute, zone);
      if (occurrence && occurrence.at <= now) return occurrence;
    }
  } catch { return null; }
  return null;
}

const DEFAULT_CITIES = DEFAULT_CLOCK_CITIES;
const validCities = normalizeClockCities;
const freshData = () => ({ version: VERSION, timers: [], alarms: [], cities: [...DEFAULT_CITIES], stopwatch: { elapsedMs: 0, running: false, checkpointWall: 0, laps: [] } });
function validTimer(item, now) {
  if (!item || typeof item.id !== 'string' || item.id.length > 100 || !Number.isFinite(item.durationMs) || item.durationMs < 1000 || item.durationMs > 86399000 || !['running', 'paused', 'finished'].includes(item.status)) return null;
  const remainingMs = Number.isFinite(item.remainingMs) ? clamp(item.remainingMs, 0, item.durationMs) : item.status === 'running' && Number.isFinite(item.deadlineWallMs) ? clamp(item.deadlineWallMs - now, 0, item.durationMs) : item.durationMs;
  const status = item.status === 'running' && remainingMs <= 0 ? 'finished' : item.status;
  return { id: item.id, label: cleanLabel(item.label, 'Timer') || 'Timer', durationMs: item.durationMs, remainingMs: status === 'finished' ? 0 : remainingMs, status, checkpointWall: Number.isFinite(item.checkpointWall) && item.checkpointWall > 0 ? item.checkpointWall : now };
}
function validAlarm(item) {
  if (!item || typeof item.id !== 'string' || item.id.length > 100 || !Number.isInteger(item.hour) || item.hour < 0 || item.hour > 23 || !Number.isInteger(item.minute) || item.minute < 0 || item.minute > 59) return null;
  const days = [...new Set(Array.isArray(item.days) ? item.days.filter(n => Number.isInteger(n) && n >= 0 && n <= 6) : [])].sort();
  const date = validDateKey(item.date) ? item.date : '';
  if (!days.length && !date) return null;
  const snoozeMinutes = Number.isInteger(item.snoozeMinutes) ? clamp(item.snoozeMinutes, 1, 30) : 9;
  return { id: item.id, label: cleanLabel(item.label, 'Alarm') || 'Alarm', hour: item.hour, minute: item.minute, days, date: days.length ? '' : date, enabled: item.enabled !== false, snoozeMinutes, snoozeEnabled: item.snoozeEnabled !== false, lastOccurrenceId: typeof item.lastOccurrenceId === 'string' ? item.lastOccurrenceId.slice(0, 100) : '', snoozeUntil: Number.isFinite(item.snoozeUntil) && item.snoozeUntil > 0 ? item.snoozeUntil : 0, snoozeOccurrenceId: typeof item.snoozeOccurrenceId === 'string' ? item.snoozeOccurrenceId.slice(0, 100) : '' };
}
function validateData(value, now) {
  if (!value || value.version !== VERSION || !Array.isArray(value.timers) || !Array.isArray(value.alarms) || !value.stopwatch || !Array.isArray(value.stopwatch.laps)) return freshData();
  const watch = value.stopwatch, elapsedMs = Number.isFinite(watch.elapsedMs) && watch.elapsedMs >= 0 ? Math.min(watch.elapsedMs, 366 * DAY) : 0;
  const checkpointWall = Number.isFinite(watch.checkpointWall) && watch.checkpointWall > 0 ? watch.checkpointWall : now;
  const recovered = watch.running ? clamp(Math.max(0, now - checkpointWall), 0, 366 * DAY) : 0;
  return {
    version: VERSION,
    timers: value.timers.slice(0, MAX_TIMERS).map(item => validTimer(item, now)).filter(Boolean),
    alarms: value.alarms.slice(0, MAX_ALARMS).map(validAlarm).filter(Boolean),
    cities: validCities(value.cities),
    stopwatch: { elapsedMs: elapsedMs + recovered, running: watch.running === true, checkpointWall: now, laps: watch.laps.filter(n => Number.isFinite(n) && n >= 0).slice(0, MAX_LAPS).map(n => Math.min(n, 366 * DAY)) },
  };
}

export class ClockService extends EventTarget {
  constructor({ storage = globalThis.localStorage, now = () => Date.now(), monotonic = () => globalThis.performance?.now?.() ?? Date.now(), setTimeoutFn = (...args) => globalThis.setTimeout(...args), clearTimeoutFn = (...args) => globalThis.clearTimeout(...args), timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone, ringtone = null, output = null, document = globalThis.document, window = globalThis.window, onError = () => {} } = {}) {
    super(); Object.assign(this, { storage, now, monotonic, setTimeoutFn, clearTimeoutFn, timeZone, ringtone, output, document, window, onError });
    this.scopeKey = ''; this.scope = null; this.legacyContext = null; this.scopeReadyAt = 0; this.data = freshData(); this.timerDeadlines = new Map(); this.timeout = null; this.activeAlert = null; this.alertQueue = []; this.powered = output?.powered !== false; this.disposed = false; this.cleared = false;
    this.onOutput = () => this.setPowered(this.output.powered);
    this.onVisibility = () => { this.checkpoint(); this.tick(); this.schedule(); };
    this.onFocus = () => { this.tick(); this.checkpoint(); this.schedule(); };
    output?.addEventListener?.('change', this.onOutput);
    document?.addEventListener?.('visibilitychange', this.onVisibility);
    window?.addEventListener?.('focus', this.onFocus);
    window?.addEventListener?.('pageshow', this.onFocus);
  }
  setScope(scope, legacyContext = null) {
    const nextScope = scope && scope.server && scope.cid && scope.deviceId && Number.isFinite(scope.deviceGeneration) && scope.deviceGeneration > 0
      ? { server: String(scope.server), cid: String(scope.cid), deviceId: String(scope.deviceId), deviceGeneration: Number(scope.deviceGeneration) }
      : null;
    const nextKey = nextScope ? `peak-duo:clock:v1:${encodeURIComponent(JSON.stringify([nextScope.server, nextScope.cid, nextScope.deviceId, nextScope.deviceGeneration]))}` : '';
    if (nextKey && nextKey === this.scopeKey) {
      this.tick(); this.schedule(); return true;
    }
    this.checkpoint(); this.stopRuntime(); this.clearAlerts(); this.scope = null; this.scopeKey = '';
    if (!nextScope) { this.scope = null; this.scopeKey = ''; this.legacyContext = null; this.scopeReadyAt = 0; this.data = freshData(); this.cleared = false; this.emitChange(); return false; }
    this.scope = nextScope;
    this.scopeKey = nextKey;
    this.legacyContext = legacyContext ? { server: String(legacyContext.server || ''), identity: String(legacyContext.identity || '') } : null;
    this.scopeReadyAt = this.now();
    this.cleared = false;
    let raw = null;
    try { raw = JSON.parse(this.storage?.getItem(this.scopeKey) ?? 'null'); } catch {}
    if (raw) this.data = validateData(raw, this.now());
    else this.data = this.migrate(legacyContext);
    this.restoreDeadlines(); this.save(); this.tick(); this.schedule(); this.emitChange(); return true;
  }
  migrate(context) {
    const data = freshData(); if (!context?.server || !context?.identity) return data;
    const read = key => { try { return JSON.parse(this.storage?.getItem('peak-duo:upgrade:' + JSON.stringify([context.server, context.identity, key])) ?? 'null'); } catch { return null; } };
    const now = this.now(), oldTimers = read('timers'), oldWatch = read('stopwatch'), oldCities = read('clock-zones');
    if (Array.isArray(oldTimers)) data.timers = oldTimers.slice(0, MAX_TIMERS).map(item => {
      if (!item || typeof item.id !== 'string' || !Number.isFinite(item.end) && !Number.isFinite(item.remaining)) return null;
      const durationMs = Number.isFinite(item.total) && item.total >= 1000 ? Math.min(item.total, 86399000) : Math.max(1000, Math.min(86399000, Number(item.remaining ?? item.end - now)));
      let status = item.remaining != null ? 'paused' : item.fired ? 'finished' : 'running';
      let remainingMs = item.remaining != null ? clamp(item.remaining, 0, durationMs) : clamp(item.end - now, 0, durationMs);
      if (item.fired || remainingMs <= 0) { status = 'finished'; remainingMs = 0; }
      return { id: item.id.slice(0, 100), label: cleanLabel(item.label, 'Timer') || 'Timer', durationMs, remainingMs, status, checkpointWall: now };
    }).filter(Boolean);
    if (oldWatch && Number.isFinite(oldWatch.elapsed) && Array.isArray(oldWatch.laps)) {
      let elapsedMs = clamp(oldWatch.elapsed, 0, 366 * DAY);
      if (Number.isFinite(oldWatch.started)) elapsedMs = clamp(elapsedMs + Math.max(0, now - oldWatch.started), 0, 366 * DAY);
      data.stopwatch = { elapsedMs, running: Number.isFinite(oldWatch.started), checkpointWall: now, laps: oldWatch.laps.filter(n => Number.isFinite(n) && n >= 0).slice(0, MAX_LAPS).map(n => Math.min(n, elapsedMs)) };
    }
    if (Array.isArray(oldCities)) data.cities = validCities(oldCities);
    return data;
  }
  restoreDeadlines() {
    this.timerDeadlines.clear();
    for (const timer of this.data.timers) if (timer.status === 'running') {
      const elapsed = Math.max(0, this.now() - timer.checkpointWall), remaining = Math.max(0, timer.remainingMs - elapsed);
      if (remaining <= 0) { timer.status = 'finished'; timer.remainingMs = 0; }
      else this.timerDeadlines.set(timer.id, this.monotonic() + remaining);
    }
    if (this.data.stopwatch.running) { this.watchAnchor = this.monotonic(); this.data.stopwatch.checkpointWall = this.now(); }
  }
  snapshot() {
    const now = this.now(), mono = this.monotonic();
    return { timers: this.data.timers.map(timer => ({ ...timer, remainingMs: timer.status === 'running' ? Math.max(0, (this.timerDeadlines.get(timer.id) ?? mono) - mono) : timer.remainingMs })), alarms: this.data.alarms.map(alarm => ({ ...alarm })), cities: [...this.data.cities], stopwatch: { ...this.data.stopwatch, elapsedMs: this.stopwatchElapsed(now, mono), laps: [...this.data.stopwatch.laps] }, activeAlert: this.activeAlert ? { ...this.activeAlert } : null };
  }
  stopwatchElapsed(now = this.now(), mono = this.monotonic()) { return this.data.stopwatch.elapsedMs + (this.data.stopwatch.running && Number.isFinite(this.watchAnchor) ? Math.max(0, mono - this.watchAnchor) : 0); }
  emitChange() { this.dispatchEvent(detailEvent('change', this.snapshot())); }
  fail(message) { this.onError(message); this.dispatchEvent(detailEvent('error', { message })); }
  save() {
    if (!this.scopeKey) return false;
    if (this.cleared && this.isFreshData()) return true;
    this.cleared = false;
    const now = this.now(), mono = this.monotonic();
    const stored = structuredClone(this.data);
    stored.timers = stored.timers.map(timer => ({ ...timer, remainingMs: timer.status === 'running' ? Math.max(0, (this.timerDeadlines.get(timer.id) ?? mono) - mono) : timer.remainingMs, checkpointWall: now }));
    stored.stopwatch.elapsedMs = this.stopwatchElapsed(now, mono); stored.stopwatch.checkpointWall = now;
    try { this.storage?.setItem(this.scopeKey, JSON.stringify(stored)); return true; } catch { this.fail('Clock changes could not be saved to device storage.'); return false; }
  }
  checkpoint() {
    if (!this.scopeKey) return;
    if (!this.data.stopwatch.running && !this.data.timers.some(timer => timer.status === 'running')) return;
    const mono = this.monotonic();
    for (const timer of this.data.timers) if (timer.status === 'running') timer.remainingMs = Math.max(0, (this.timerDeadlines.get(timer.id) ?? mono) - mono);
    if (this.data.stopwatch.running) { this.data.stopwatch.elapsedMs = this.stopwatchElapsed(); this.watchAnchor = mono; }
    this.save();
  }
  schedule() {
    this.clearTimeoutFn(this.timeout); this.timeout = null; if (!this.scopeKey || this.disposed) return;
    const mono = this.monotonic(), now = this.now(); let nearest = Infinity;
    for (const timer of this.data.timers) if (timer.status === 'running') nearest = Math.min(nearest, Math.max(0, (this.timerDeadlines.get(timer.id) ?? mono) - mono));
    for (const alarm of this.data.alarms) {
      if (alarm.snoozeUntil > 0) nearest = Math.min(nearest, Math.max(0, alarm.snoozeUntil - now));
      else if (alarm.enabled) { const next = nextAlarmOccurrence(alarm, now, this.timeZone()); nearest = Math.min(nearest, next ? Math.max(0, next.at - now) : 60000); }
    }
    if (this.data.stopwatch.running) nearest = Math.min(nearest, 60000);
    if (!Number.isFinite(nearest)) return;
    this.timeout = this.setTimeoutFn(() => { this.timeout = null; this.tick(); this.checkpoint(); this.schedule(); }, clamp(nearest, 50, 60000));
  }
  tick() {
    if (!this.scopeKey || this.disposed) return;
    const now = this.now(), mono = this.monotonic(); let changed = false;
    for (const timer of this.data.timers) if (timer.status === 'running' && (this.timerDeadlines.get(timer.id) ?? Infinity) <= mono) {
      timer.status = 'finished'; timer.remainingMs = 0; timer.checkpointWall = now; this.timerDeadlines.delete(timer.id); changed = true;
      if (this.powered) this.pushAlert({ id: `timer:${timer.id}`, kind: 'timer', title: timer.label, message: 'Timer finished', sourceId: timer.id, occurredAt: now, snoozeEnabled: false });
    }
    for (const alarm of this.data.alarms) {
      if (alarm.snoozeUntil > 0 && alarm.snoozeUntil <= now) {
        const snoozeAt = alarm.snoozeUntil, late = now - snoozeAt; alarm.snoozeUntil = 0; changed = true;
        if (this.powered && snoozeAt >= this.scopeReadyAt && late <= MAX_ALERT_AGE_MS) this.pushAlert({ id: `snooze:${alarm.id}:${alarm.snoozeOccurrenceId}`, kind: 'alarm', title: alarm.label, message: 'Alarm', sourceId: alarm.id, occurrenceId: alarm.snoozeOccurrenceId, occurredAt: snoozeAt, snoozeEnabled: alarm.snoozeEnabled });
        continue;
      }
      if (!alarm.enabled) continue;
      const previous = latestAlarmOccurrence(alarm, now, this.timeZone());
      if (previous && previous.occurrenceId !== alarm.lastOccurrenceId) {
        alarm.lastOccurrenceId = previous.occurrenceId;
        if (!alarm.days.length) alarm.enabled = false;
        changed = true;
        if (this.powered && previous.at >= this.scopeReadyAt && now - previous.at <= MAX_ALERT_AGE_MS) this.pushAlert({ id: `alarm:${alarm.id}:${previous.occurrenceId}`, kind: 'alarm', title: alarm.label, message: 'Alarm', sourceId: alarm.id, occurrenceId: previous.occurrenceId, occurredAt: previous.at, snoozeEnabled: alarm.snoozeEnabled });
      }
    }
    if (changed) { this.save(); this.emitChange(); }
  }
  pushAlert(alert) {
    if (!this.powered) return false;
    const now = this.now();
    this.pruneAlertQueue(now);
    const source = `${alert.kind || 'alert'}\u0000${alert.sourceId ?? alert.id}`;
    const activeSource = this.activeAlert && `${this.activeAlert.kind || 'alert'}\u0000${this.activeAlert.sourceId ?? this.activeAlert.id}`;
    if (this.activeAlert?.id === alert.id || activeSource === source) return false;
    const occurredAt = Number.isFinite(alert.occurredAt) ? alert.occurredAt : now;
    const next = { ...alert, occurredAt };
    const queuedIndex = this.alertQueue.findIndex(item => `${item.kind || 'alert'}\u0000${item.sourceId ?? item.id}` === source);
    if (queuedIndex >= 0) {
      if (occurredAt <= this.alertQueue[queuedIndex].occurredAt) return false;
      this.alertQueue[queuedIndex] = next;
      return true;
    }
    if (this.alertQueue.some(item => item.id === alert.id)) return false;
    if (this.alertQueue.length >= MAX_ALERT_QUEUE) this.alertQueue.shift();
    this.alertQueue.push(next); this.showNextAlert(); return true;
  }
  pruneAlertQueue(now = this.now()) {
    const earliest = now - MAX_ALERT_AGE_MS;
    this.alertQueue = this.alertQueue.filter(item => Number.isFinite(item.occurredAt) && item.occurredAt >= earliest);
  }
  showNextAlert() {
    if (this.activeAlert || !this.powered) return;
    this.pruneAlertQueue();
    this.activeAlert = this.alertQueue.shift() || null;
    if (this.activeAlert) {
      this.ringtone?.ring?.({ Enabled: true, CallId: this.activeAlert.id, Incoming: true, Sound: 'default' });
      this.dispatchEvent(detailEvent('alert', { ...this.activeAlert })); this.emitChange();
    }
  }
  closeAlert() {
    if (!this.activeAlert) return false;
    const old = this.activeAlert; this.ringtone?.ring?.({ Enabled: false, CallId: old.id, Incoming: false }); this.activeAlert = null;
    this.dispatchEvent(detailEvent('alertchange', null)); this.showNextAlert(); return true;
  }
  dismissAlert() { return this.closeAlert(); }
  snoozeAlert() {
    const alert = this.activeAlert; if (!alert || alert.kind !== 'alarm' || !alert.snoozeEnabled) return false;
    const alarm = this.data.alarms.find(item => item.id === alert.sourceId); if (!alarm) return this.closeAlert();
    alarm.snoozeUntil = this.now() + alarm.snoozeMinutes * 60000; alarm.snoozeOccurrenceId = alert.occurrenceId || alert.id; this.save(); this.emitChange(); this.closeAlert(); this.schedule(); return true;
  }
  clearAlerts() { this.ringtone?.stop?.(); this.activeAlert = null; this.alertQueue = []; this.dispatchEvent(detailEvent('alertchange', null)); }
  setPowered(powered) {
    powered = !!powered; if (this.powered === powered) return;
    if (!powered) { this.powered = false; this.tick(); this.clearAlerts(); }
    else { this.tick(); this.powered = true; this.showNextAlert(); }
    this.schedule();
  }
  addTimer({ durationMs, label = 'Timer' }) {
    durationMs = Number(durationMs); if (!Number.isInteger(durationMs) || durationMs < 1000 || durationMs > 86399000) throw Error('Choose a duration from 1 second to 23:59:59.');
    if (this.data.timers.length >= MAX_TIMERS) throw Error('Remove a timer before adding another (20 maximum).');
    const timer = { id: id(), label: cleanLabel(label, 'Timer') || 'Timer', durationMs, remainingMs: durationMs, status: 'running', checkpointWall: this.now() };
    this.data.timers.unshift(timer); this.timerDeadlines.set(timer.id, this.monotonic() + durationMs); this.save(); this.schedule(); this.emitChange(); return timer.id;
  }
  pauseTimer(timerId) { const timer = this.data.timers.find(item => item.id === timerId && item.status === 'running'); if (!timer) return false; timer.remainingMs = Math.max(0, (this.timerDeadlines.get(timer.id) ?? this.monotonic()) - this.monotonic()); timer.status = timer.remainingMs ? 'paused' : 'finished'; this.timerDeadlines.delete(timer.id); this.save(); this.schedule(); this.emitChange(); return true; }
  resumeTimer(timerId) { const timer = this.data.timers.find(item => item.id === timerId && item.status === 'paused'); if (!timer) return false; timer.status = 'running'; timer.checkpointWall = this.now(); this.timerDeadlines.set(timer.id, this.monotonic() + timer.remainingMs); this.save(); this.schedule(); this.emitChange(); return true; }
  deleteTimer(timerId) { const before = this.data.timers.length; this.data.timers = this.data.timers.filter(item => item.id !== timerId); this.timerDeadlines.delete(timerId); this.save(); this.schedule(); this.emitChange(); return before !== this.data.timers.length; }
  addAlarm(values) { if (this.data.alarms.length >= MAX_ALARMS) throw Error('Remove an alarm before adding another (32 maximum).'); const alarm = validAlarm({ ...values, id: id() }); if (!alarm) throw Error('Choose a valid alarm time and repeat days or date.'); this.data.alarms.unshift(alarm); this.save(); this.schedule(); this.emitChange(); return alarm.id; }
  updateAlarm(alarmId, values) { const index = this.data.alarms.findIndex(item => item.id === alarmId); if (index < 0) return false; const alarm = validAlarm({ ...this.data.alarms[index], ...values, id: alarmId }); if (!alarm) throw Error('Choose a valid alarm time and repeat days or date.'); this.data.alarms[index] = alarm; this.save(); this.schedule(); this.emitChange(); return true; }
  toggleAlarm(alarmId, enabled) {
    const alarm = this.data.alarms.find(item => item.id === alarmId);
    if (!alarm) return false;
    const next = { enabled: !!enabled, snoozeUntil: 0 };
    if (enabled && !alarm.enabled && !alarm.days.length && !nextAlarmOccurrence(alarm, this.now(), this.timeZone())) {
      const today = localParts(this.now(), this.timeZone());
      const todayAlarm = { ...alarm, date: dateKey(today) };
      const nextToday = nextAlarmOccurrence(todayAlarm, this.now(), this.timeZone());
      next.date = dateKey(nextToday ? today : shiftDate(today, 1));
    }
    return this.updateAlarm(alarmId, next);
  }
  deleteAlarm(alarmId) { this.data.alarms = this.data.alarms.filter(item => item.id !== alarmId); this.save(); this.schedule(); this.emitChange(); }
  startStopwatch() { if (this.data.stopwatch.running) return; this.data.stopwatch.running = true; this.watchAnchor = this.monotonic(); this.data.stopwatch.checkpointWall = this.now(); this.save(); this.schedule(); this.emitChange(); }
  stopStopwatch() { if (!this.data.stopwatch.running) return; this.data.stopwatch.elapsedMs = this.stopwatchElapsed(); this.data.stopwatch.running = false; this.watchAnchor = null; this.save(); this.schedule(); this.emitChange(); }
  lapStopwatch() { if (!this.data.stopwatch.running || this.data.stopwatch.laps.length >= MAX_LAPS) return false; this.data.stopwatch.laps.unshift(this.stopwatchElapsed()); this.save(); this.emitChange(); return true; }
  resetStopwatch() { this.data.stopwatch = { elapsedMs: 0, running: false, checkpointWall: this.now(), laps: [] }; this.watchAnchor = null; this.save(); this.schedule(); this.emitChange(); }
  isFreshData() { return this.data.timers.length === 0 && this.data.alarms.length === 0 && this.data.stopwatch.elapsedMs === 0 && !this.data.stopwatch.running && this.data.stopwatch.laps.length === 0 && JSON.stringify(this.data.cities) === JSON.stringify(DEFAULT_CITIES); }
  setCities(cities) {
    if (!Array.isArray(cities) || cities.length > CLOCK_CITIES.length || cities.some(city => typeof city !== 'string' || !isClockCityId(city))) throw Error('Choose a valid city clock.');
    this.data.cities = [...new Set(cities)]; this.save(); this.emitChange(); return [...this.data.cities];
  }
  clearScope() {
    this.clearAlerts();
    try {
      if (this.scopeKey) this.storage?.removeItem(this.scopeKey);
      if (this.legacyContext?.server && this.legacyContext?.identity) for (const name of ['timers', 'stopwatch', 'clock-zones']) this.storage?.removeItem('peak-duo:upgrade:' + JSON.stringify([this.legacyContext.server, this.legacyContext.identity, name]));
    } catch { this.fail('Clock data could not be cleared from device storage.'); }
    this.data = freshData(); this.cleared = true; this.timerDeadlines.clear(); this.schedule(); this.emitChange();
  }
  stopRuntime() { this.clearTimeoutFn(this.timeout); this.timeout = null; this.timerDeadlines.clear(); this.watchAnchor = null; }
  dispose() { if (this.disposed) return; this.checkpoint(); this.disposed = true; this.stopRuntime(); this.clearAlerts(); this.output?.removeEventListener?.('change', this.onOutput); this.document?.removeEventListener?.('visibilitychange', this.onVisibility); this.window?.removeEventListener?.('focus', this.onFocus); this.window?.removeEventListener?.('pageshow', this.onFocus); }
}
