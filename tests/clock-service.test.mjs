import test from 'node:test';
import assert from 'node:assert/strict';
import { ClockService, localParts, nextAlarmOccurrence, resolveLocalAlarm } from '../web/public/duo/clock-service.mjs';
import { CLOCK_CITIES, DEFAULT_CLOCK_CITIES } from '../web/public/duo/clock-cities.mjs';

const scope = { server: 'test-server', cid: '42', deviceId: 'device-a', deviceGeneration: 3 };
const legacyContext = { server: scope.server, identity: 'character-42' };
const toEpoch = value => Date.parse(value);

class MemoryStorage {
  values = new Map();
  failWrite = false;
  writes = 0;
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { if (this.failWrite) throw new Error('storage disabled'); this.writes++; this.values.set(key, value); }
  removeItem(key) { this.values.delete(key); }
}
class FakeTime {
  wall = toEpoch('2026-05-11T07:00:00.000Z');
  mono = 1000;
  nextId = 0;
  timers = new Map();
  now = () => this.wall;
  monotonic = () => this.mono;
  setTimeout = (fn, delay) => { const handle = ++this.nextId; this.timers.set(handle, { fn, at: this.mono + delay }); return handle; };
  clearTimeout = handle => this.timers.delete(handle);
  advance({ wall = 0, monotonic = wall } = {}) {
    this.wall += wall; this.mono += monotonic;
    let next, guard = 0;
    while (++guard < 1000 && (next = [...this.timers].find(([, timer]) => timer.at <= this.mono))) {
      this.timers.delete(next[0]); next[1].fn();
    }
  }
}
class FakeOutput extends EventTarget { powered = true; }
class FakeRingtone {
  rings = [];
  ring(event) { this.rings.push({ ...event }); }
  stop() { this.rings.push({ stop: true }); }
}
function setup({ storage = new MemoryStorage(), time = new FakeTime(), output = new FakeOutput(), ringtone = new FakeRingtone(), zone = () => 'UTC', onError = () => {} } = {}) {
  const service = new ClockService({ storage, now: time.now, monotonic: time.monotonic, setTimeoutFn: time.setTimeout, clearTimeoutFn: time.clearTimeout, timeZone: zone, output, ringtone, document: null, window: null, onError });
  service.setScope(scope, legacyContext);
  return { service, storage, time, output, ringtone };
}

test('local alarm resolution advances across spring gaps and chooses the first fall-back occurrence', () => {
  const spring = resolveLocalAlarm({ year: 2026, month: 3, day: 8 }, 2, 30, 'America/New_York');
  assert.equal(new Date(spring.at).toISOString(), '2026-03-08T07:00:00.000Z');
  assert.equal(spring.adjusted, true);
  assert.deepEqual([localParts(spring.at, 'America/New_York').hour, localParts(spring.at, 'America/New_York').minute], [3, 0]);

  const fall = resolveLocalAlarm({ year: 2026, month: 11, day: 1 }, 1, 30, 'America/New_York');
  assert.equal(new Date(fall.at).toISOString(), '2026-11-01T05:30:00.000Z');
  assert.equal(fall.adjusted, false);
  assert.equal(nextAlarmOccurrence({ hour: 1, minute: 30, days: [], date: '2026-11-01' }, toEpoch('2026-11-01T06:00:00.000Z'), 'America/New_York'), null);
});

test('padded Gregorian years round-trip through local alarm resolution and reject year zero', () => {
  for (const year of [1, 99, 400, 9999]) {
    const date = { year, month: 1, day: 1 };
    const occurrence = resolveLocalAlarm(date, 7, 1, 'UTC');
    assert.ok(occurrence, `year ${String(year).padStart(4, '0')} resolves`);
    assert.equal(occurrence.occurrenceId.startsWith(`${String(year).padStart(4, '0')}-01-01T07:01@`), true);
    assert.deepEqual(localParts(occurrence.at, 'UTC'), { ...date, weekday: new Date(occurrence.at).getUTCDay(), hour: 7, minute: 1, second: 0 });
  }
  assert.equal(resolveLocalAlarm({ year: 0, month: 1, day: 1 }, 7, 1, 'UTC'), null);
  const before = new Date(0); before.setUTCFullYear(99, 0, 1); before.setUTCHours(6, 0, 0, 0);
  const next = nextAlarmOccurrence({ hour: 7, minute: 1, date: '0099-01-01', days: [] }, before.getTime(), 'UTC');
  assert.equal(new Date(next.at).toISOString(), '0099-01-01T07:01:00.000Z');
  assert.match(next.occurrenceId, /^0099-01-01T07:01@/);
  const { service } = setup();
  assert.throws(() => service.addAlarm({ label: 'No year zero', hour: 7, minute: 1, date: '0000-01-01', days: [] }), /valid alarm/);
  service.addAlarm({ label: 'Padded year', hour: 7, minute: 1, date: '0099-01-01', days: [] });
  assert.equal(service.snapshot().alarms[0].date, '0099-01-01');
  service.dispose();
});

test('repeating alarms select the next calendar weekday, not a fixed 24-hour interval', () => {
  const alarm = { hour: 9, minute: 0, days: [1], date: '' };
  const next = nextAlarmOccurrence(alarm, toEpoch('2026-05-10T12:00:00.000Z'), 'UTC');
  assert.equal(new Date(next.at).toISOString(), '2026-05-11T09:00:00.000Z');
});

test('scheduled one-shot alarms recalculate against the device time zone after it changes', () => {
  const time = new FakeTime(); time.wall = toEpoch('2026-05-11T12:00:00.000Z');
  let zone = 'UTC';
  const { service } = setup({ time, zone: () => zone });
  service.addAlarm({ label: 'Local morning', hour: 8, minute: 0, date: '2026-05-11', days: [], enabled: true });
  assert.equal(service.snapshot().activeAlert, null);
  zone = 'America/Los_Angeles';
  service.schedule();
  for (let minute = 0; minute < 180; minute++) time.advance({ wall: 60000 });
  assert.equal(service.snapshot().activeAlert?.title, 'Local morning');
  service.dismissAlert(); service.dispose();
});

test('timers and stopwatch use monotonic elapsed time across wall-clock adjustments', () => {
  const { service, time } = setup();
  const timerId = service.addTimer({ durationMs: 10000, label: 'Tea' });
  service.startStopwatch();
  time.advance({ wall: 300000, monotonic: 4000 });
  assert.equal(service.snapshot().timers.find(timer => timer.id === timerId).remainingMs, 6000);
  assert.equal(service.snapshot().stopwatch.elapsedMs, 4000);

  time.advance({ wall: -600000, monotonic: 6000 });
  service.tick();
  assert.equal(service.snapshot().timers[0].status, 'finished');
  assert.equal(service.snapshot().stopwatch.elapsedMs, 10000);
  assert.equal(service.snapshot().activeAlert.kind, 'timer');
  service.tick();
  assert.equal(service.ringtone.rings.filter(item => item.Enabled).length, 1);
  service.dismissAlert(); service.dispose();
});

test('idle scopes have no recurring wake and pending work resumes scheduling', () => {
  const { service, time, storage } = setup();
  assert.equal(time.timers.size, 0, 'an empty scoped phone should not wake or checkpoint every minute');
  assert.equal(service.timeout, null);
  const initialWrites = storage.writes;
  service.checkpoint();
  assert.equal(storage.writes, initialWrites, 'idle lifecycle checkpoints should not rewrite unchanged Clock data');

  const alarmId = service.addAlarm({ label: 'Morning', hour: 7, minute: 1, date: '2026-05-11', days: [], enabled: true });
  assert.equal(time.timers.size, 1, 'an enabled alarm needs a bounded deadline/zone check');
  service.toggleAlarm(alarmId, false);
  assert.equal(time.timers.size, 0, 'disabling the last alarm returns to idle');

  service.startStopwatch();
  assert.equal(time.timers.size, 1, 'a running stopwatch needs periodic persistence checkpoints');
  time.advance({ wall: 60000 });
  assert.equal(service.snapshot().stopwatch.elapsedMs, 60000);
  assert.equal(time.timers.size, 1, 'a running stopwatch keeps one bounded checkpoint wake');
  service.stopStopwatch();
  assert.equal(time.timers.size, 0, 'stopping the stopwatch cancels its recurring wake');

  const timerId = service.addTimer({ durationMs: 10000, label: 'Tea' });
  assert.equal(time.timers.size, 1, 'starting a timer resumes deadline scheduling');
  service.pauseTimer(timerId);
  assert.equal(time.timers.size, 0, 'pausing the last timer returns to idle');
  service.resumeTimer(timerId);
  assert.equal(time.timers.size, 1, 'resuming a timer schedules its deadline');
  service.deleteTimer(timerId);
  assert.equal(time.timers.size, 0);
  const settledWrites = storage.writes;
  service.dispose();
  assert.equal(storage.writes, settledWrites, 'disposing an idle scope does not rewrite Clock data');
});

test('pause and resume keep the remaining duration and produce one completion alert', () => {
  const { service, time, ringtone } = setup();
  const timerId = service.addTimer({ durationMs: 20000, label: 'Laundry' });
  time.advance({ wall: 5000 });
  service.pauseTimer(timerId);
  assert.equal(service.snapshot().timers[0].remainingMs, 15000);
  time.advance({ wall: 60000 });
  assert.equal(service.snapshot().timers[0].status, 'paused');
  service.resumeTimer(timerId);
  time.advance({ wall: 15000 });
  assert.equal(service.snapshot().timers[0].status, 'finished');
  assert.equal(ringtone.rings.filter(item => item.Enabled).length, 1);
  service.dispose();
});

test('a timer that ends while the phone is powered off becomes finished without ringing later', () => {
  const { service, time, output, ringtone } = setup();
  service.addTimer({ durationMs: 10000, label: 'Oven' });
  output.powered = false; output.dispatchEvent(new Event('change'));
  time.advance({ wall: 10000 });
  assert.equal(service.snapshot().timers[0].status, 'finished');
  assert.equal(service.snapshot().activeAlert, null);
  output.powered = true; output.dispatchEvent(new Event('change'));
  assert.equal(service.snapshot().activeAlert, null);
  assert.equal(ringtone.rings.filter(item => item.Enabled).length, 0);
  service.dispose();
});

test('alarms that pass while powered off are consumed and do not ring on power-on', () => {
  const { service, time, output, ringtone } = setup();
  service.addAlarm({ label: 'Quiet alarm', hour: 7, minute: 1, date: '2026-05-11', days: [], enabled: true });
  output.powered = false; output.dispatchEvent(new Event('change'));
  time.advance({ wall: 61000 });
  assert.equal(service.snapshot().activeAlert, null);
  output.powered = true; output.dispatchEvent(new Event('change'));
  assert.equal(service.snapshot().alarms[0].enabled, false);
  assert.equal(service.snapshot().activeAlert, null);
  assert.equal(ringtone.rings.filter(item => item.Enabled).length, 0);
  service.dispose();
});

test('one-shot alarm fires once, snoozes, and cannot ring twice for the same occurrence', () => {
  const { service, time, ringtone } = setup();
  service.addAlarm({ label: 'Wake up', hour: 7, minute: 1, date: '2026-05-11', days: [], enabled: true, snoozeMinutes: 5, snoozeEnabled: true });
  time.advance({ wall: 61000 });
  assert.equal(service.snapshot().activeAlert.title, 'Wake up');
  const occurrence = service.snapshot().activeAlert.occurrenceId;
  assert.equal(service.snoozeAlert(), true);
  assert.equal(service.snapshot().activeAlert, null);
  time.advance({ wall: 300000 });
  assert.equal(service.snapshot().activeAlert.occurrenceId, occurrence);
  service.tick();
  assert.equal(ringtone.rings.filter(item => item.Enabled).length, 2);
  service.dismissAlert(); service.dispose();
});

test('reopening the same device scope preserves a ringing alert and its dismiss action', () => {
  const { service, time, ringtone } = setup();
  service.addTimer({ durationMs: 1000, label: 'Keep ringing' });
  time.advance({ wall: 1000 });
  const before = service.snapshot().activeAlert;
  assert.equal(before?.title, 'Keep ringing');

  assert.equal(service.setScope({ ...scope }, { server: scope.server, identity: 'same-character-different-sim' }), true);
  assert.deepEqual(service.snapshot().activeAlert, before);
  assert.equal(ringtone.rings.filter(item => item.Enabled).length, 1, 'same-scope open cannot stop and restart the ringtone');
  assert.equal(service.dismissAlert(), true, 'the reopened shell can still stop the active alert');
  assert.equal(service.snapshot().activeAlert, null);
  service.dispose();
});

test('queued recurring alerts coalesce by source, and occurrences behind an active source are dropped', () => {
  const { service, time } = setup();
  service.pushAlert({ id: 'timer:holding', kind: 'timer', sourceId: 'holding', title: 'Holding alert', occurredAt: time.wall });
  for (let index = 0; index < 100; index++) {
    time.wall += 1000;
    service.pushAlert({ id: `alarm:daily:${index}`, kind: 'alarm', sourceId: 'daily', occurrenceId: `day-${index}`, title: 'Daily', occurredAt: time.wall });
  }
  assert.equal(service.snapshot().activeAlert.sourceId, 'holding');
  assert.equal(service.alertQueue.length, 1, '100 recurrences from one alarm occupy one queue slot');
  assert.equal(service.alertQueue[0].occurrenceId, 'day-99', 'the queued item is the newest occurrence');

  assert.equal(service.dismissAlert(), true);
  assert.equal(service.snapshot().activeAlert.occurrenceId, 'day-99');
  for (let index = 100; index < 200; index++) {
    time.wall += 1000;
    service.pushAlert({ id: `alarm:daily:${index}`, kind: 'alarm', sourceId: 'daily', occurrenceId: `day-${index}`, title: 'Daily', occurredAt: time.wall });
  }
  assert.equal(service.alertQueue.length, 0, 'a recurrence does not queue behind its own active alert');
  service.dismissAlert();
  assert.equal(service.snapshot().activeAlert, null, 'Stop cannot reveal old recurrences from the same alarm');
  service.dispose();
});

test('a daily alarm ticked 100 times behind its active alert leaves no replay backlog', () => {
  const { service, time, ringtone } = setup();
  service.addAlarm({ label: 'Every day', hour: 7, minute: 1, date: '', days: [0, 1, 2, 3, 4, 5, 6], enabled: true });
  time.advance({ wall: 60000 });
  const first = service.snapshot().activeAlert;
  assert.equal(first?.title, 'Every day');
  for (let day = 0; day < 100; day++) {
    time.wall += 86400000;
    time.mono += 86400000;
    service.tick();
    service.schedule();
  }
  assert.equal(service.alertQueue.length, 0, 'repeats from the active source are discarded as they arrive');
  assert.notEqual(service.snapshot().alarms[0].lastOccurrenceId, first.occurrenceId, 'the scheduler still consumes each due calendar occurrence');
  service.dismissAlert();
  assert.equal(service.snapshot().activeAlert, null, 'Stop does not reveal 100 old daily occurrences');
  assert.equal(ringtone.rings.filter(item => item.Enabled).length, 1, 'only the initial active occurrence started a ringtone');
  service.dispose();
});

test('alert queue has a fixed capacity, prunes stale events, and clears on scope and power changes', () => {
  const { service, time, ringtone } = setup();
  service.pushAlert({ id: 'active:one', kind: 'timer', sourceId: 'one', title: 'One', occurredAt: time.wall });
  for (let index = 0; index < 40; index++) {
    time.wall += 1000;
    service.pushAlert({ id: `pending:${index}`, kind: 'timer', sourceId: `pending-${index}`, title: 'Pending', occurredAt: time.wall });
  }
  assert.equal(service.alertQueue.length, 16, 'distinct sources cannot grow the queue beyond its configured finite capacity');
  assert.equal(service.dismissAlert(), true);
  assert.equal(service.snapshot().activeAlert.sourceId, 'pending-24');

  service.pushAlert({ id: 'pending:stale', kind: 'alarm', sourceId: 'stale', title: 'Stale', occurredAt: time.wall });
  time.wall += 60001;
  service.dismissAlert();
  assert.equal(service.snapshot().activeAlert, null, 'stale queued events are discarded when advancing the queue');

  service.pushAlert({ id: 'active:scope', kind: 'timer', sourceId: 'scope', title: 'Scope', occurredAt: time.wall });
  service.pushAlert({ id: 'pending:scope', kind: 'alarm', sourceId: 'scope-pending', title: 'Pending', occurredAt: time.wall });
  service.setScope({ ...scope, cid: '43' });
  assert.equal(service.snapshot().activeAlert, null);
  assert.equal(service.alertQueue.length, 0, 'changing character scope clears both active and queued alerts');

  service.pushAlert({ id: 'active:power', kind: 'timer', sourceId: 'power', title: 'Power', occurredAt: time.wall });
  service.pushAlert({ id: 'pending:power', kind: 'alarm', sourceId: 'power-pending', title: 'Pending', occurredAt: time.wall });
  service.setPowered(false);
  assert.equal(service.snapshot().activeAlert, null);
  assert.equal(service.alertQueue.length, 0, 'power-off clears active and queued alerts');
  assert.ok(ringtone.rings.some(item => item.stop), 'clearing an active alert stops the ringtone');
  service.setPowered(true);
  assert.equal(service.snapshot().activeAlert, null, 'power-on does not replay discarded alerts');
  service.dispose();
});

test('re-enabling an expired one-shot moves it to the next local calendar date', () => {
  const { service, time } = setup();
  const alarmId = service.addAlarm({ label: 'Tomorrow morning', hour: 7, minute: 1, date: '2026-05-11', days: [], enabled: true });
  time.advance({ wall: 61000 });
  const consumed = service.snapshot().alarms[0].lastOccurrenceId;
  assert.equal(service.snapshot().activeAlert?.occurrenceId, consumed);
  service.dismissAlert();

  service.toggleAlarm(alarmId, true);
  const rearmed = service.snapshot().alarms[0];
  assert.equal(rearmed.enabled, true);
  assert.equal(rearmed.date, '2026-05-12');
  assert.equal(rearmed.lastOccurrenceId, consumed);
  assert.equal(service.snapshot().activeAlert, null, 'the consumed occurrence is not replayed immediately');

  time.wall = toEpoch('2026-05-12T07:01:00.000Z');
  service.tick();
  assert.equal(service.snapshot().activeAlert?.occurrenceId?.startsWith('2026-05-12T07:01@'), true);
  service.dismissAlert(); service.dispose();
});

test('re-enabling a stale calendar one-shot uses today when its local wall time is still ahead', () => {
  const { service, time } = setup();
  const alarmId = service.addAlarm({ label: 'Later today', hour: 8, minute: 30, date: '2026-05-10', days: [], enabled: false });
  service.toggleAlarm(alarmId, true);
  const rearmed = service.snapshot().alarms[0];
  assert.equal(rearmed.date, '2026-05-11');
  assert.equal(rearmed.enabled, true);
  assert.equal(service.snapshot().activeAlert, null);

  time.wall = toEpoch('2026-05-11T08:30:00.000Z');
  service.tick();
  assert.equal(service.snapshot().activeAlert?.title, 'Later today');
  assert.equal(service.snapshot().alarms[0].enabled, false, 'the moved one-shot is consumed after its future occurrence');
  service.dismissAlert(); service.dispose();
});

test('re-enabling a repeating alarm preserves its weekday schedule instead of moving its date', () => {
  const { service } = setup();
  const alarmId = service.addAlarm({ label: 'Every Monday', hour: 8, minute: 0, date: '', days: [1], enabled: false });
  service.toggleAlarm(alarmId, true);
  const rearmed = service.snapshot().alarms[0];
  assert.deepEqual(rearmed.days, [1]);
  assert.equal(rearmed.date, '');
  assert.equal(rearmed.enabled, true);
  service.dispose();
});

test('the shared city catalog preserves GTA defaults and supports official non-US city persistence', () => {
  assert.deepEqual(DEFAULT_CLOCK_CITIES, ['los-santos', 'liberty-city', 'vice-city']);
  assert.deepEqual(CLOCK_CITIES.filter(city => city.kind === 'real').map(({ name, zone }) => [name, zone]), [
    ['New York', 'America/New_York'], ['London', 'Europe/London'], ['Paris', 'Europe/Paris'], ['Tokyo', 'Asia/Tokyo'],
    ['Sydney', 'Australia/Sydney'], ['Los Angeles', 'America/Los_Angeles'], ['New Delhi', 'Asia/Kolkata'],
    ['Hong Kong', 'Asia/Hong_Kong'], ['Rio de Janeiro', 'America/Sao_Paulo'], ['Mexico City', 'America/Mexico_City'],
    ['Cape Town', 'Africa/Johannesburg'], ['Stockholm', 'Europe/Stockholm'], ['Hawaii', 'Pacific/Honolulu'],
  ]);
  const { service } = setup();
  service.setCities([...service.snapshot().cities, 'real-london', 'real-new-delhi']);
  const scopeCopy = { ...scope };
  service.setScope(null);
  service.setScope(scopeCopy, legacyContext);
  assert.deepEqual(service.snapshot().cities, [...DEFAULT_CLOCK_CITIES, 'real-london', 'real-new-delhi']);
  service.dispose();
});

test('invalid Gregorian alarm dates are rejected before time-zone resolution', () => {
  const { service } = setup();
  const OriginalDateTimeFormat = Intl.DateTimeFormat;
  let formatters = 0;
  Intl.DateTimeFormat = new Proxy(OriginalDateTimeFormat, {
    construct(target, args, newTarget) { formatters++; return Reflect.construct(target, args, newTarget); },
  });
  try {
    assert.equal(resolveLocalAlarm({ year: 2026, month: 2, day: 31 }, 2, 30, 'America/New_York'), null);
    assert.throws(() => service.addAlarm({ label: 'Impossible date', hour: 2, minute: 30, date: '2026-02-31', days: [], enabled: true }), /valid alarm/);
    assert.equal(service.snapshot().alarms.length, 0);
    assert.equal(formatters, 0, 'invalid dates never construct Intl formatters or enter the resolver');
  } finally { Intl.DateTimeFormat = OriginalDateTimeFormat; }
  service.dispose();
});

test('32 New York spring-gap alarms share bounded Intl work during scope load and scheduling', t => {
  const storage = new MemoryStorage(), time = new FakeTime(), zone = 'America/Toronto';
  const key = `peak-duo:clock:v1:${encodeURIComponent(JSON.stringify([scope.server, scope.cid, scope.deviceId, scope.deviceGeneration]))}`;
  storage.setItem(key, JSON.stringify({ version: 1, timers: [], alarms: Array.from({ length: 32 }, (_, index) => ({
    id: `gap-${index}`, label: `Gap ${index}`, hour: 2, minute: 30, date: '2027-03-14', days: [], enabled: true,
  })), cities: ['los-santos'], stopwatch: { elapsedMs: 0, running: false, checkpointWall: time.wall, laps: [] } }));

  const OriginalDateTimeFormat = Intl.DateTimeFormat;
  const originalFormatToParts = OriginalDateTimeFormat.prototype.formatToParts;
  let formatterCount = 0, partsCount = 0;
  Intl.DateTimeFormat = new Proxy(OriginalDateTimeFormat, {
    construct(target, args, newTarget) { formatterCount++; return Reflect.construct(target, args, newTarget); },
  });
  Intl.DateTimeFormat.prototype.formatToParts = function (...args) { partsCount++; return originalFormatToParts.apply(this, args); };
  const service = new ClockService({ storage, now: time.now, monotonic: time.monotonic, setTimeoutFn: time.setTimeout, clearTimeoutFn: time.clearTimeout, timeZone: () => zone, document: null, window: null });
  let loadMs = 0, loadParts = 0, scheduleMs = 0, scheduleParts = 0, loadedFormatters = 0, scheduledFormatters = 0;
  try {
    const startLoad = performance.now(); service.setScope(scope); loadMs = performance.now() - startLoad;
    loadParts = partsCount; loadedFormatters = formatterCount;
    partsCount = 0; formatterCount = 0;
    const startSchedule = performance.now(); service.schedule(); scheduleMs = performance.now() - startSchedule;
    scheduleParts = partsCount; scheduledFormatters = formatterCount;
  } finally {
    service.dispose();
    Intl.DateTimeFormat.prototype.formatToParts = originalFormatToParts;
    Intl.DateTimeFormat = OriginalDateTimeFormat;
  }
  t.diagnostic(`32 spring-gap alarms: setScope ${loadMs.toFixed(1)}ms (${loadedFormatters} formatter, ${loadParts} parts); schedule ${scheduleMs.toFixed(1)}ms (${scheduledFormatters} formatter, ${scheduleParts} parts)`);
  assert.equal(service.snapshot().alarms.length, 32);
  assert.ok(loadedFormatters <= 1, 'scope load constructs one reusable formatter for this zone');
  assert.ok(loadParts <= 220, 'date offsets are computed once and the shared gap occurrence is resolved once');
  assert.ok(scheduledFormatters <= 1, 'subsequent scheduling reuses the zone formatter');
  assert.ok(scheduleParts <= 40, 'repeated scheduling uses one current-local-time lookup per alarm, not a new DST scan');
});

test('expired one-shot alarms and missed powered-off or reload-time alarms are not replayed', () => {
  const { service, time, storage, ringtone } = setup();
  service.addAlarm({ label: 'Old alarm', hour: 6, minute: 0, date: '2026-05-10', days: [], enabled: true });
  service.tick();
  assert.equal(service.snapshot().alarms[0].enabled, false);
  assert.equal(service.snapshot().activeAlert, null);
  service.addAlarm({ label: 'Just missed before reload', hour: 6, minute: 59, date: '2026-05-11', days: [], enabled: true });
  assert.equal(service.snapshot().activeAlert, null);
  service.tick();
  assert.equal(service.snapshot().activeAlert, null);
  const key = service.scopeKey;
  service.dispose();
  const reloaded = setup({ storage, time });
  assert.equal(reloaded.service.snapshot().activeAlert, null);
  assert.equal(reloaded.ringtone.rings.filter(item => item.Enabled).length, 0);
  reloaded.service.clearScope(); reloaded.service.dispose();
  assert.equal(storage.getItem(key), null);
});

test('a due alarm already past when a device scope loads is marked missed without sounding', () => {
  const time = new FakeTime(), storage = new MemoryStorage();
  const key = `peak-duo:clock:v1:${encodeURIComponent(JSON.stringify([scope.server, scope.cid, scope.deviceId, scope.deviceGeneration]))}`;
  storage.setItem(key, JSON.stringify({ version: 1, timers: [], alarms: [{ id: 'missed-login', label: 'Missed', hour: 6, minute: 59, date: '2026-05-11', days: [], enabled: true }], stopwatch: { elapsedMs: 0, running: false, checkpointWall: time.wall, laps: [] } }));
  const { service, ringtone } = setup({ storage, time });
  assert.equal(service.snapshot().alarms[0].enabled, false);
  assert.equal(service.snapshot().activeAlert, null);
  assert.equal(ringtone.rings.filter(item => item.Enabled).length, 0);
  service.dispose();
});

test('legacy timers and stopwatch migrate once into a server-character-device-generation scope', () => {
  const storage = new MemoryStorage(), time = new FakeTime();
  const key = name => 'peak-duo:upgrade:' + JSON.stringify([legacyContext.server, legacyContext.identity, name]);
  storage.setItem(key('timers'), JSON.stringify([
    { id: 'paused', label: 'Paused', total: 60000, remaining: 30000 },
    { id: 'running', label: 'Running', total: 60000, end: time.wall + 45000 },
    { id: 'done', label: 'Done', total: 30000, end: time.wall - 5000, fired: true },
  ]));
  storage.setItem(key('stopwatch'), JSON.stringify({ elapsed: 10000, started: time.wall - 5000, laps: [8000, 4000] }));
  storage.setItem(key('clock-zones'), JSON.stringify(['America/Los_Angeles', 'vice-city', 'bad-city', 'vice-city']));
  const { service } = setup({ storage, time });
  const migrated = service.snapshot();
  assert.deepEqual(migrated.timers.map(timer => [timer.id, timer.status, Math.round(timer.remainingMs)]), [['paused', 'paused', 30000], ['running', 'running', 45000], ['done', 'finished', 0]]);
  assert.equal(migrated.stopwatch.running, true);
  assert.equal(migrated.stopwatch.elapsedMs, 15000);
  assert.deepEqual(migrated.stopwatch.laps, [8000, 4000]);
  assert.deepEqual(migrated.cities, ['los-santos', 'vice-city']);
  service.dispose();
  storage.setItem(key('timers'), '[]');
  const again = setup({ storage, time });
  assert.equal(again.service.snapshot().timers.length, 3);
  again.service.dispose();
});

test('scope changes isolate records by character, device and generation; reset clears only this scope', () => {
  const { service, storage, time } = setup();
  service.addTimer({ durationMs: 30000, label: 'Private to device A' });
  const firstKey = service.scopeKey;
  service.setScope({ ...scope, cid: '43' });
  assert.equal(service.snapshot().timers.length, 0);
  service.setScope({ ...scope, deviceId: 'device-b' });
  assert.equal(service.snapshot().timers.length, 0);
  service.setScope({ ...scope, deviceGeneration: 4 });
  assert.equal(service.snapshot().timers.length, 0);
  service.setScope(scope, legacyContext);
  assert.equal(service.snapshot().timers[0].label, 'Private to device A');
  const legacyTimersKey = 'peak-duo:upgrade:' + JSON.stringify([legacyContext.server, legacyContext.identity, 'timers']);
  const legacyCitiesKey = 'peak-duo:upgrade:' + JSON.stringify([legacyContext.server, legacyContext.identity, 'clock-zones']);
  storage.setItem(legacyTimersKey, '[]');
  storage.setItem(legacyCitiesKey, JSON.stringify(['los-santos']));
  service.clearScope();
  assert.equal(service.snapshot().timers.length, 0);
  assert.equal(storage.getItem(firstKey), null);
  assert.equal(storage.getItem(legacyTimersKey), null);
  assert.equal(storage.getItem(legacyCitiesKey), null);
  service.dispose();
});

test('a cleared scope stays cleared on dispose and accepts newly created records afterward', () => {
  const { service, storage } = setup();
  const key = service.scopeKey;
  service.addTimer({ durationMs: 30000, label: 'Before reset' });
  service.clearScope();
  service.dispose();
  assert.equal(storage.getItem(key), null);

  const again = setup({ storage });
  assert.equal(again.service.snapshot().timers.length, 0);
  const nextKey = again.service.scopeKey;
  again.service.setCities(['san-fierro']);
  assert.deepEqual(JSON.parse(storage.getItem(nextKey)).cities, ['san-fierro']);
  again.service.addTimer({ durationMs: 20000, label: 'After reset' });
  assert.equal(JSON.parse(storage.getItem(nextKey)).timers[0].label, 'After reset');
  again.service.dispose();
});

test('stale persisted records finish silently, and storage errors stay visible without losing live state', () => {
  const storage = new MemoryStorage(), time = new FakeTime(), messages = [];
  const scopedKey = `peak-duo:clock:v1:${encodeURIComponent(JSON.stringify([scope.server, scope.cid, scope.deviceId, scope.deviceGeneration]))}`;
  storage.setItem(scopedKey, JSON.stringify({ version: 1, timers: [{ id: 'stale', label: 'Missed', durationMs: 5000, remainingMs: 1000, status: 'running', checkpointWall: time.wall - 10000 }], alarms: [], stopwatch: { elapsedMs: 0, running: false, checkpointWall: time.wall, laps: [] } }));
  const { service, ringtone } = setup({ storage, time, onError: message => messages.push(message) });
  assert.equal(service.snapshot().timers[0].status, 'finished');
  assert.equal(service.snapshot().activeAlert, null);
  storage.failWrite = true;
  service.addTimer({ durationMs: 20000, label: 'Still running in memory' });
  assert.equal(service.snapshot().timers.length, 2);
  assert.match(messages[0], /could not be saved/);
  assert.equal(ringtone.rings.filter(item => item.Enabled).length, 0);
  service.dispose();
});
