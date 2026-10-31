import { GlassView, el, field, nonce, selectField } from './glass-kit.mjs?rev=owner-config-20261015';
import { displayDuration } from './calendar-core.mjs';
import { CLOCK_CITIES } from './clock-cities.mjs';

const weekdays = [['Sun', 'S'], ['Mon', 'M'], ['Tue', 'T'], ['Wed', 'W'], ['Thu', 'T'], ['Fri', 'F'], ['Sat', 'S']];
const dateText = date => new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'short', day: 'numeric' }).format(date);
const alarmTimeText = alarm => `${String(alarm.hour % 12 || 12).padStart(2, '0')}:${String(alarm.minute).padStart(2, '0')} ${alarm.hour < 12 ? 'AM' : 'PM'}`;
const worldFormatters = new Map();
function worldFormatter(zone, clock = false) {
  const key = `${zone}\u0000${clock ? 'clock' : 'parts'}`;
  if (worldFormatters.has(key)) return worldFormatters.get(key);
  const value = clock
    ? new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit', hour12: true })
    : new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  worldFormatters.set(key, value);
  while (worldFormatters.size > 32) worldFormatters.delete(worldFormatters.keys().next().value);
  return value;
}
const partsFor = (epoch, zone) => Object.fromEntries(worldFormatter(zone).formatToParts(new Date(epoch)).map(part => [part.type, part.value]));
function utcMillis(parts) { const date = new Date(0); date.setUTCFullYear(Number(parts.year), Number(parts.month) - 1, Number(parts.day)); date.setUTCHours(Number(parts.hour) || 0, Number(parts.minute) || 0, Number(parts.second) || 0, 0); return date.getTime(); }
function relativeDay(target, local) {
  const atStart = parts => utcMillis({ ...parts, hour: 0, minute: 0, second: 0 });
  const delta = Math.round((atStart(target) - atStart(local)) / 86400000);
  return delta === 0 ? 'Today' : delta === 1 ? 'Tomorrow' : delta === -1 ? 'Yesterday' : delta > 1 ? `In ${delta} days` : `${Math.abs(delta)} days ago`;
}
function zoneOffset(parts, epoch) { return Math.round((utcMillis(parts) - Math.floor(epoch / 1000) * 1000) / 60000); }
function worldClock(epoch, zone) {
  const parts = partsFor(epoch, zone), localZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', local = partsFor(epoch, localZone);
  const displayed = Object.fromEntries(worldFormatter(zone, true).formatToParts(new Date(epoch)).map(part => [part.type, part.value]));
  const offset = zoneOffset(parts, epoch) - zoneOffset(local, epoch), sign = offset < 0 ? '−' : '+', abs = Math.abs(offset), hours = Math.floor(abs / 60), minutes = abs % 60;
  const relative = `${relativeDay(parts, local)}, ${minutes ? `${sign}${hours}:${String(minutes).padStart(2, '0')}` : `${sign}${hours}HRS`}`;
  return { main: `${displayed.hour}:${displayed.minute}`, period: (displayed.dayPeriod || '').toUpperCase(), relative };
}

export class ClockApp extends GlassView {
  constructor(opts) {
    super(opts);
    this.element.classList.add('u27-app', 'u27-clock');
    this.tab = 'world';
    this.worldEditing = false; this.pendingRender = false;
    this.clockService = this.clockService || null;
    if (!this.clockService) throw new Error('Clock service is unavailable.');
    if (!this.clockService.scopeKey) throw new Error('Clock needs an active character and registered phone.');
    this.state = this.clockService.snapshot();
    this.zones = [...this.state.cities];
    this.timerNodes = new Map(); this.zoneNodes = []; this.zoneSecond = null;
    this.listen(this.clockService, 'change', event => {
      if (!this.alive) return;
      this.state = event.detail;
      if (this.sheet?.panel?.isConnected) this.pendingRender = true;
      else { this.zones = [...this.state.cities]; this.render(); }
      this.scheduleViewUpdate();
    });
    this.listen(document, 'visibilitychange', () => this.scheduleViewUpdate(true));
    this.listen(window, 'resize', () => this.scheduleViewUpdate(true));
    if (globalThis.ResizeObserver) { this.viewResize = new ResizeObserver(() => this.scheduleViewUpdate(true)); this.viewResize.observe(this.target); }
    const visibilityRoot = this.element.closest('#duo') || this.element.parentElement;
    if (visibilityRoot && globalThis.MutationObserver) {
      this.viewVisibility = new MutationObserver(records => {
        if (records.some(({ target }) => target === this.element || target.contains?.(this.element))) this.scheduleViewUpdate(true);
      });
      this.viewVisibility.observe(visibilityRoot, { attributes: true, attributeFilter: ['hidden', 'inert'], subtree: true });
    }
    this.render(); this.scheduleViewUpdate();
  }
  render() {
    const title = { world: 'World Clock', alarms: 'Alarms', stopwatch: 'Stopwatch', timers: 'Timers' }[this.tab];
    const actions = this.tab === 'world' ? [this.textButton(this.worldEditing ? 'Done' : 'Edit', '', () => { this.worldEditing = !this.worldEditing; this.render(); requestAnimationFrame(() => this.element.querySelector('.u27-world-edit')?.focus()); }, 'u27-world-edit'), this.button('Add city', 'plus', () => this.addCity(), 'u27-add')]
      : this.tab === 'alarms' ? [this.button('Add alarm', 'plus', () => this.editAlarm(), 'u27-add')]
        : this.tab === 'timers' ? [this.button('New timer', 'plus', () => this.createTimer(), 'u27-add')] : [];
    if (actions.length) actions.at(-1).dataset.clockFocusKey = `primary:${this.tab}`;
    if (this.tab === 'world' && actions[0]) actions[0].dataset.clockFocusKey = 'world:edit';
    const body = this.frame(title, '', actions); body.classList.add('u27-clock-body');
    this.timerNodes = new Map(); this.zoneNodes = []; this.zoneMinute = null; this.watchDigits = null;
    if (this.tab === 'world') this.renderWorld(body);
    else if (this.tab === 'alarms') this.renderAlarms(body);
    else if (this.tab === 'stopwatch') this.renderStopwatch(body);
    else this.renderTimers(body);
    this.element.append(this.tabs([
      ['world', 'World Clock', 'globe'], ['alarms', 'Alarms', 'bell'],
      ['stopwatch', 'Stopwatch', 'timer'], ['timers', 'Timers', 'hourglass'],
    ], this.tab, id => { this.tab = id; this.render(); this.scheduleViewUpdate(); }, 'u27-bottom-tabs'));
    this.updateVisibleValues();
  }
  renderWorld(body) {
    for (const id of this.zones) {
      const city = CLOCK_CITIES.find(item => item.id === id); if (!city) continue;
      const row = el('article', 'u27-world-row'); row.dataset.city = id; row.dataset.editing = String(this.worldEditing);
      const copy = el('div', 'u27-world-city'); const date = el('small', 'u27-world-date'); copy.append(date, el('h2', '', city.name));
      const time = el('time', 'u27-world-time'); const main = el('span', 'u27-world-clock'); const period = el('span', 'u27-world-meridiem'); time.append(main, period);
      row.append(copy, time);
      if (this.worldEditing) row.append(this.button('Remove ' + city.name, 'close', () => {
        try { this.clockService.setCities(this.zones.filter(zone => zone !== id)); }
        catch (error) { this.notify(error.message || 'City clocks could not be saved to device storage.'); }
        requestAnimationFrame(() => this.element.querySelector('.u27-muted-button[aria-label^="Remove "]')?.focus() || this.element.querySelector('.u27-world-edit')?.focus());
      }, 'u27-muted-button'));
      body.append(row); this.zoneNodes.push({ zone: city.zone, time, date, main, period });
    }
    if (!this.zones.length) body.append(this.empty('No cities yet', 'Add a city to see its local time.', 'globe'));
  }
  renderAlarms(body) {
    const alarms = this.state.alarms;
    if (!alarms.length) body.append(this.empty('No alarms', 'Create an alarm for a date or the days you choose.', 'bell'));
    const list = el('div', 'u27-alarm-list');
    for (const alarm of alarms) {
      const row = el('article', 'u27-alarm-row'); row.dataset.enabled = String(alarm.enabled);
      const time = el('strong', 'u27-alarm-time', alarmTimeText(alarm));
      const copy = el('div', 'u27-alarm-copy'); copy.append(el('span', 'u27-alarm-label', alarm.label));
      const repeat = alarm.days.length ? alarm.days.map(day => weekdays[day][0]).join(' · ') : `Once · ${dateText(new Date(alarm.date + 'T12:00:00'))}`;
      copy.append(el('small', 'u27-alarm-repeat', repeat));
      const actions = el('div', 'u27-alarm-actions');
      const toggle = this.button(alarm.enabled ? 'Turn off ' + alarm.label : 'Turn on ' + alarm.label, alarm.enabled ? 'check' : 'close', () => this.clockService.toggleAlarm(alarm.id, !alarm.enabled), 'u27-alarm-toggle');
      toggle.setAttribute('aria-pressed', String(alarm.enabled));
      const edit = this.button('Edit ' + alarm.label, 'edit', () => this.editAlarm(alarm), 'u27-muted-button');
      edit.dataset.clockFocusKey = `alarm-edit:${alarm.id}`;
      const remove = this.button('Delete ' + alarm.label, 'trash', () => this.clockService.deleteAlarm(alarm.id), 'u27-muted-button');
      actions.append(toggle, edit, remove); row.append(time, copy, actions); list.append(row);
    }
    if (alarms.length) body.append(list);
    body.append(el('p', 'u27-storage-note', 'Alarms use your device’s local time and adjust for daylight saving.'));
  }
  renderStopwatch(body) {
    const watch = this.state.stopwatch, running = watch.running;
    this.watchDigits = el('div', 'u27-stopwatch-digits', displayDuration(watch.elapsedMs, true));
    this.watchDigits.setAttribute('aria-label', 'Elapsed time'); body.append(this.watchDigits);
    const actions = el('div', 'u27-stopwatch-actions');
    actions.append(this.textButton(running ? 'Lap' : 'Reset', running ? 'flag' : 'refresh', () => {
      if (running) {
        if (!this.clockService.lapStopwatch()) this.notify('100 laps saved. Stop and reset to begin a new session.');
      } else this.clockService.resetStopwatch();
    }, 'u27-round-secondary'), this.textButton(running ? 'Stop' : 'Start', running ? 'stop' : 'play', () => {
      if (running) this.clockService.stopStopwatch(); else this.clockService.startStopwatch();
    }, running ? 'u27-round-stop' : 'u27-round-start'));
    body.append(actions);
    const laps = el('div', 'u27-laps');
    if (!watch.laps.length) laps.append(el('p', 'u27-storage-note', running ? 'Tap Lap to mark a split.' : 'Start the stopwatch to begin.'));
    const durations = watch.laps.map((total, index) => Math.max(0, total - (watch.laps[index + 1] || 0)));
    const fastest = durations.length ? Math.min(...durations) : -1, slowest = durations.length > 1 ? Math.max(...durations) : -1;
    watch.laps.forEach((total, index) => {
      const lapDuration = durations[index], row = el('div', 'u27-lap');
      row.dataset.best = String(lapDuration === fastest); row.dataset.slowest = String(lapDuration === slowest && slowest !== fastest);
      row.append(el('span', '', 'Lap ' + (watch.laps.length - index)), el('strong', '', displayDuration(lapDuration, true)), el('small', 'u27-lap-total', displayDuration(total, true)));
      laps.append(row);
    });
    body.append(laps);
  }
  renderTimers(body) {
    const timers = this.state.timers;
    if (!timers.length) {
      body.append(this.empty('No timers running', 'Start a timer or choose a quick duration.', 'hourglass'));
      const presets = el('div', 'u27-timer-presets');
      for (const minutes of [1, 5, 10, 30]) presets.append(this.textButton(minutes + ' min', '', () => this.startTimer(minutes * 60000, 'Timer'), 'u27-pill'));
      body.append(presets, this.textButton('New Timer', 'plus', () => this.createTimer(), 'nx-primary u27-full-button'));
      return;
    }
    const list = el('div', 'u27-timer-list');
    for (const timer of timers) {
      const row = el('article', 'u27-timer-row'); row.dataset.finished = String(timer.status === 'finished');
      const copy = el('div', 'u27-timer-copy'); const digits = el('strong', 'u27-countdown');
      copy.append(digits, el('span', '', timer.label));
      const actions = el('div', 'u27-inline-actions');
      const pause = this.button(timer.status === 'paused' ? 'Resume timer' : 'Pause timer', timer.status === 'paused' ? 'play' : 'pause', () => {
        if (timer.status === 'paused') this.clockService.resumeTimer(timer.id); else if (timer.status === 'running') this.clockService.pauseTimer(timer.id);
      }, 'u27-timer-toggle'); pause.disabled = timer.status === 'finished';
      const remove = this.button('Delete ' + timer.label, 'trash', () => this.clockService.deleteTimer(timer.id), 'u27-muted-button');
      actions.append(pause, remove);
      const meter = el('div', 'u27-timer-meter'); const fill = el('span'); meter.append(fill);
      row.append(copy, actions, meter); list.append(row); this.timerNodes.set(timer.id, { row, digits, pause, fill });
    }
    body.append(list, this.textButton('Add Timer', 'plus', () => this.createTimer(), 'u27-secondary u27-full-button'));
  }
  updateVisibleValues() {
    if (!this.alive) return;
    const now = Date.now(), snapshot = this.clockService.snapshot();
    for (const timer of snapshot.timers) {
      const nodes = this.timerNodes.get(timer.id); if (!nodes) continue;
      const remaining = timer.status === 'finished' ? 0 : Math.max(0, timer.remainingMs);
      nodes.digits.textContent = timer.status === 'finished' ? 'Done' : displayDuration(Math.ceil(remaining / 1000) * 1000);
      nodes.row.dataset.finished = String(timer.status === 'finished');
      nodes.fill.style.width = Math.max(0, Math.min(100, remaining / timer.durationMs * 100)) + '%';
    }
    if (this.watchDigits?.isConnected) this.watchDigits.textContent = displayDuration(snapshot.stopwatch.elapsedMs, true);
    const minute = Math.floor(now / 60000);
    if (this.zoneMinute !== minute) {
      this.zoneMinute = minute;
      for (const { zone, time, date, main, period } of this.zoneNodes) {
        try {
          const clock = worldClock(now, zone);
          main.textContent = clock.main; period.textContent = clock.period; date.textContent = clock.relative;
          time.setAttribute('aria-label', `${clock.main} ${clock.period}`); time.dateTime = new Date(now).toISOString();
        } catch { main.textContent = 'Unavailable'; period.textContent = ''; date.textContent = ''; time.setAttribute('aria-label', 'Local time unavailable'); }
      }
    }
  }
  visibleInPhone() {
    if (!this.alive || document.visibilityState === 'hidden' || !this.element.getClientRects().length) return false;
    if (this.element.closest('[hidden], [inert]')) return false;
    const rect = this.element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
  }
  scheduleViewUpdate(refresh = false) {
    clearTimeout(this.viewTimer); this.viewTimer = null;
    if (!this.visibleInPhone()) { this.viewVisible = false; return; }
    if (refresh || !this.viewVisible) { this.zoneMinute = null; this.updateVisibleValues(); }
    this.viewVisible = true;
    const running = this.state.stopwatch.running;
    const activeTimers = this.state.timers.some(timer => timer.status === 'running');
    let delay = 60000;
    if (this.tab === 'world') delay = 60000 - (Date.now() % 60000);
    else if (this.tab === 'stopwatch' && running) delay = 50;
    else if (this.tab === 'timers' && activeTimers) delay = 1000;
    this.viewTimer = setTimeout(() => { this.viewTimer = null; if (!this.visibleInPhone()) return; this.updateVisibleValues(); this.scheduleViewUpdate(); }, delay);
  }
  startTimer(durationMs, label) { this.tab = 'timers'; this.clockService.addTimer({ durationMs, label }); this.closeSheet(); }
  createTimer() {
    const panel = this.openSheet('New Timer', { header: false }); panel.classList.add('cf-sheet', 'u27-clock-timer-editor');
    const intro = el('div', 'u27-timer-editor-intro'); intro.append(el('span', 'u27-kicker', 'TIMER'), el('strong', '', 'Set a duration'));
    const label = field('Label', { value: 'Timer', maxLength: 40 }); label.wrapper.classList.add('u27-clock-editor-label');
    const fields = [field('Hours', { type: 'number', value: '0' }), field('Minutes', { type: 'number', value: '5' }), field('Seconds', { type: 'number', value: '0' })];
    const group = el('div', 'u27-duration-fields');
    fields.forEach((item, index) => { item.input.min = '0'; item.input.max = index === 0 ? '23' : '59'; item.input.step = '1'; item.input.inputMode = 'numeric'; item.wrapper.classList.add('u27-duration-unit'); group.append(item.wrapper); });
    const presets = el('div', 'u27-timer-presets');
    for (const [caption, seconds] of [['1 min', 60], ['5 min', 300], ['10 min', 600], ['30 min', 1800]]) presets.append(this.textButton(caption, '', () => { fields[0].input.value = '0'; fields[1].input.value = String(seconds / 60); fields[2].input.value = '0'; fields[1].input.focus(); }, 'u27-pill'));
    const start = this.textButton('Start', 'play', () => {
      const values = fields.map(item => Number(item.input.value));
      if (values.some((value, index) => !Number.isInteger(value) || value < 0 || value > (index === 0 ? 23 : 59))) { this.status(panel, 'Choose a valid duration from 1 second to 23:59:59.', 'error'); return; }
      const durationMs = (values[0] * 3600 + values[1] * 60 + values[2]) * 1000;
      if (!durationMs) { this.status(panel, 'Choose a duration longer than zero.', 'error'); return; }
      this.startTimer(durationMs, label.input.value.trim());
    }, 'cf-nav-trailing');
    start.classList.add('u27-timer-start');
    const nav = el('header', 'cf-sheet-nav u27-clock-editor-nav'); nav.append(this.textButton('Cancel', '', () => this.closeSheet(), 'cf-nav-leading'), el('h2', '', 'New Timer'), start);
    panel.append(nav, intro, group, presets, label.wrapper, el('p', 'u27-storage-note', 'Timers use real elapsed time while the phone is open.'));
  }
  editAlarm(alarm = null) {
    const title = alarm ? 'Edit Alarm' : 'New Alarm', panel = this.openSheet(title, { header: false }); panel.classList.add('cf-sheet', 'u27-clock-alarm-editor');
    const start = new Date(Date.now() + 9 * 60000); start.setSeconds(0, 0);
    const pad = number => String(number).padStart(2, '0');
    const timeField = field('Time', { type: 'time', value: alarm ? `${pad(alarm.hour)}:${pad(alarm.minute)}` : `${pad(start.getHours())}:${pad(start.getMinutes())}` });
    timeField.wrapper.classList.add('u27-alarm-time-field');
    const label = field('Label', { value: alarm?.label || 'Alarm', maxLength: 40 });
    const dateField = field('Date', { type: 'date', value: alarm?.date || `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}` });
    const selectedDays = new Set(alarm?.days || []), dayGroup = el('fieldset', 'u27-weekday-picker');
    dayGroup.append(el('legend', '', 'Repeat'));
    weekdays.forEach(([name, letter], day) => {
      const button = this.textButton(name, '', () => { if (selectedDays.has(day)) selectedDays.delete(day); else selectedDays.add(day); button.setAttribute('aria-pressed', String(selectedDays.has(day))); }, 'u27-weekday');
      button.setAttribute('aria-pressed', String(selectedDays.has(day))); button.dataset.day = String(day); button.textContent = letter; button.title = name; dayGroup.append(button);
    });
    const snooze = field('Snooze', { type: 'checkbox', value: '' }); snooze.input.checked = alarm?.snoozeEnabled !== false; snooze.wrapper.classList.add('u27-snooze-toggle');
    const snoozeLength = selectField('Snooze duration', [['5', '5 minutes'], ['9', '9 minutes'], ['10', '10 minutes'], ['15', '15 minutes']], String(alarm?.snoozeMinutes || 9));
    const submit = this.textButton(alarm ? 'Done' : 'Add', 'check', () => {
      const match = /^(\d{2}):(\d{2})$/.exec(timeField.input.value);
      if (!match) { this.status(panel, 'Choose a valid alarm time.', 'error'); return; }
      const days = [...selectedDays].sort((a, b) => a - b), values = {
        hour: Number(match[1]), minute: Number(match[2]), days, date: days.length ? '' : dateField.input.value,
        label: label.input.value.trim() || 'Alarm', enabled: alarm ? alarm.enabled : true,
        snoozeEnabled: snooze.input.checked, snoozeMinutes: Number(snoozeLength.input.value),
      };
      try { this.tab = 'alarms'; if (alarm) this.clockService.updateAlarm(alarm.id, { ...values, snoozeUntil: 0 }); else this.clockService.addAlarm(values); this.closeSheet(); }
      catch (error) { this.status(panel, error.message, 'error'); }
    }, 'cf-nav-trailing');
    const nav = el('header', 'cf-sheet-nav u27-clock-editor-nav'); nav.append(this.textButton('Cancel', '', () => this.closeSheet(), 'cf-nav-leading'), el('h2', '', title), submit);
    const intro = el('div', 'u27-alarm-editor-intro');
    intro.append(el('span', 'u27-kicker', 'CLOCK'), el('strong', '', 'Choose when it rings.'));
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const currentLocal = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date());
    intro.append(el('small', 'u27-local-clock-context', `Device local time: ${currentLocal} · ${zone}`));
    dateField.wrapper.classList.add('u27-alarm-date-field');
    panel.append(nav, intro, timeField.wrapper, dayGroup, dateField.wrapper, label.wrapper, snooze.wrapper, snoozeLength.wrapper);
  }
  addCity() {
    const title = 'Add City', panel = this.openSheet(title, { header: false }); panel.classList.add('cf-sheet', 'u27-clock-city-editor');
    const available = CLOCK_CITIES.filter(city => !this.zones.includes(city.id)).sort((a, b) => a.name.localeCompare(b.name));
    const nav = el('header', 'cf-sheet-nav u27-clock-editor-nav'); nav.append(this.textButton('Cancel', '', () => this.closeSheet(), 'cf-nav-leading'), el('h2', '', title));
    if (!available.length) { nav.append(el('span', 'cf-nav-trailing')); panel.append(nav, el('p', 'u27-storage-note', 'All available cities are already added.')); return; }
    const city = selectField('City', available.map(item => [item.id, item.name]), available[0].id); city.wrapper.classList.add('u27-city-picker');
    const search = field('Search cities', { type: 'search', placeholder: 'City name or time zone' }); search.wrapper.classList.add('u27-city-search');
    const preview = el('article', 'u27-city-time-preview'), name = el('strong', ''), time = el('span', 'u27-world-time'), date = el('small', ''); preview.append(name, time, date);
    let matches = available;
    const update = () => {
      const item = CLOCK_CITIES.find(value => value.id === city.input.value); if (!item) return; name.textContent = item.name;
      try { const now = new Date(); time.textContent = new Intl.DateTimeFormat(undefined, { timeZone: item.zone, hour: '2-digit', minute: '2-digit', hour12: false }).format(now); date.textContent = new Intl.DateTimeFormat(undefined, { timeZone: item.zone, weekday: 'long', month: 'short', day: 'numeric' }).format(now); }
      catch { time.textContent = 'Unavailable'; date.textContent = ''; }
    };
    const filter = () => {
      const query = search.input.value.trim().toLocaleLowerCase();
      matches = available.filter(item => `${item.name} ${item.zone} ${item.kind}`.toLocaleLowerCase().includes(query));
      const selected = matches.find(item => item.id === city.input.value) || matches[0];
      city.input.replaceChildren(...(matches.length ? matches.map(item => { const option = el('option', '', item.name); option.value = item.id; return option; }) : [(() => { const option = el('option', '', 'No matching city'); option.disabled = true; option.value = ''; return option; })()]));
      city.input.value = selected?.id || '';
      add.disabled = !selected;
      if (selected) update(); else { name.textContent = 'No matching city'; time.textContent = ''; date.textContent = ''; }
    };
    this.listen(city.input, 'change', update); this.listen(search.input, 'input', filter); update();
    const add = this.textButton('Add', 'plus', () => this.submit(add, async () => {
      if (!matches.some(item => item.id === city.input.value)) return;
      this.clockService.setCities([...this.zones, city.input.value]);
      this.closeSheet();
    }, panel), 'cf-nav-trailing'); nav.append(add);
    panel.append(nav, search.wrapper, city.wrapper, preview, el('p', 'u27-storage-note', 'GTA and real-world clocks follow their listed time zones.'));
  }
  closeSheet() {
    const sheet = this.sheet;
    const shouldRefresh = !!sheet && this.pendingRender && this.alive;
    const focusKey = sheet?.focused?.dataset?.clockFocusKey;
    const closingTab = this.tab;
    super.closeSheet({ restoreFocus: !shouldRefresh });
    if (shouldRefresh && this.alive && !this.sheet) {
      this.pendingRender = false; this.zones = [...this.state.cities]; this.render(); this.scheduleViewUpdate(true);
      const key = focusKey || `primary:${closingTab}`;
      requestAnimationFrame(() => {
        const active = document.activeElement;
        if (!this.alive || this.sheet || this.tab !== closingTab || (active !== document.body && active !== document.documentElement)) return;
        const replacement = [...this.element.querySelectorAll('[data-clock-focus-key]')].find(node => node.dataset.clockFocusKey === key);
        replacement?.focus({ preventScroll: true });
      });
    } else if (shouldRefresh && this.sheet) {
      this.pendingRender = true;
    }
  }
  $destroy() { clearTimeout(this.viewTimer); this.viewResize?.disconnect(); this.viewVisibility?.disconnect(); super.$destroy(); }
}
