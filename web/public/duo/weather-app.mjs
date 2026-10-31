import { GlassView, el, readLocal, writeLocal } from './glass-kit.mjs?rev=owner-config-20261015';
import { compassPoint, convertWindSpeed, normalizeWeatherState, skyForGameTime, WEATHER_LABELS } from './weather-core.mjs?rev=ios-weather-native-20261011e';

const REFRESH_MS = 60_000;
const STALE_MS = 120_000;
const WIND_UNITS = ['m/s', 'km/h', 'mph'];
let lastWeatherReadEpoch = 0;
const nextWeatherReadEpoch = () => {
  lastWeatherReadEpoch = lastWeatherReadEpoch >= Number.MAX_SAFE_INTEGER ? 1 : lastWeatherReadEpoch + 1;
  return lastWeatherReadEpoch;
};
const safeError = error => String(error?.message || 'Current game weather could not be read.')
  .replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 180);
const ageText = milliseconds => {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
};

export class WeatherApp extends GlassView {
  constructor(opts) {
    super(opts);
    this.element.classList.add('u27-app', 'nx-weather');
    this.context = opts.props.context;
    this.openApp = opts.props.openApp;
    this.isActive = opts.props.isActive || (() => false);
    const savedUnit = readLocal(this.context, 'weather-wind-unit', 'm/s');
    this.unit = WIND_UNITS.includes(savedUnit) ? savedUnit : 'm/s';
    this.state = null;
    this.error = '';
    this.loading = false;
    this.inflight = null;
    this.inflightEpoch = null;
    this.refreshQueued = false;
    this.epoch = 0;
    this.timer = null;
    this.running = false;
    this.lastGoodAt = 0;
    this.render();
    this.listen(document, 'visibilitychange', () => this.syncLifecycle());
    this.syncLifecycle();
  }

  render() {
    const body = this.frame('Weather');
    this.element.setAttribute('role', 'region');
    this.element.setAttribute('aria-label', 'Current in-game weather');
    body.classList.add('nx-weather-body');
    this.refreshButton = this.textButton('Refresh', 'refresh', () => this.refresh(true), 'nx-weather-refresh');
    this.refreshButton.setAttribute('aria-label', 'Refresh current game conditions');

    this.scene = el('section', 'nx-weather-scene');
    this.scene.setAttribute('aria-label', 'Current in-game weather');
    this.scene.dataset.condition = 'unknown';
    this.scene.dataset.sky = 'unknown';
    this.sky = el('div', 'nx-weather-sky');
    this.sky.setAttribute('aria-hidden', 'true');
    this.sky.append(
      el('span', 'nx-weather-sun'),
      el('span', 'nx-weather-cloud nx-weather-cloud-a'),
      el('span', 'nx-weather-cloud nx-weather-cloud-b'),
      el('span', 'nx-weather-rain'),
      el('span', 'nx-weather-horizon')
    );
    this.scene.append(this.sky);

    this.copy = el('div', 'nx-weather-copy');
    this.location = el('p', 'nx-weather-location', 'Finding your in-game location…');
    this.time = el('p', 'nx-weather-time', 'Game clock unavailable');
    this.condition = el('h2', 'nx-weather-condition', 'Conditions unavailable');
    this.syntheticTag = el('span', 'nx-weather-synthetic', 'Synthetic preview');
    this.syntheticTag.hidden = true;
    this.copy.append(this.location, this.condition, this.time);
    this.scene.append(this.copy);
    body.append(this.scene);

    this.placeAction = this.textButton('Maps', 'navigation', () => this.openApp?.('maps'), 'nx-weather-map');
    this.placeAction.setAttribute('aria-label', 'Open current game location in Maps');
    this.tools = el('div', 'nx-weather-tools');
    this.actions = el('div', 'nx-weather-action-group');
    this.actions.append(this.placeAction, this.refreshButton);
    this.tools.append(this.syntheticTag, this.actions);
    body.append(this.tools);

    this.conditions = el('section', 'nx-weather-current');
    this.conditions.setAttribute('aria-label', 'Current game conditions');
    const wind = el('article', 'nx-weather-wind');
    const windCopy = el('div', 'nx-weather-metric-copy');
    this.windValue = el('strong', 'nx-weather-value', '—');
    this.windLabel = el('small', 'nx-weather-label', 'Wind speed');
    windCopy.append(this.windLabel, this.windValue);
    const windSymbol = el('span', 'nx-weather-symbol');
    windSymbol.setAttribute('aria-hidden', 'true');
    wind.append(windSymbol, windCopy);
    this.windButton = this.textButton('Change wind speed units', 'swap', () => this.toggleUnit(), 'nx-weather-unit');
    this.windButton.append(el('span', 'nx-weather-unit-value', this.unit));
    wind.append(this.windButton);

    this.direction = el('article', 'nx-weather-direction');
    this.compass = el('span', 'nx-weather-compass');
    this.compass.setAttribute('aria-hidden', 'true');
    this.compass.append(el('span', 'nx-weather-compass-north', 'N'), el('span', 'nx-weather-compass-arrow'));
    const directionCopy = el('div', 'nx-weather-metric-copy');
    this.directionLabel = el('small', 'nx-weather-label', 'Game wind vector');
    this.directionValue = el('strong', 'nx-weather-value', '—');
    directionCopy.append(this.directionLabel, this.directionValue);
    this.direction.append(this.compass, directionCopy);
    this.conditions.append(wind, this.direction);
    body.append(this.conditions);

    this.transition = el('section', 'nx-weather-transition');
    this.transition.hidden = true;
    this.transition.setAttribute('aria-label', 'Current weather transition');
    body.append(this.transition);

    this.freshness = el('p', 'nx-weather-freshness', 'Current conditions only · Forecast unavailable');
    this.freshness.setAttribute('role', 'status');
    this.notice = el('p', 'nx-weather-notice', '');
    this.notice.setAttribute('role', 'alert');
    body.append(this.freshness, this.notice);
  }

  active() {
    try { return this.alive && !document.hidden && this.isActive() === true; }
    catch { return false; }
  }

  syncLifecycle() {
    const active = this.active();
    if (active === this.running) return;
    this.running = active;
    this.element.dataset.weatherActive = String(active);
    if (active) {
      this.schedule();
      void this.refresh(false);
      return;
    }
    clearTimeout(this.timer);
    this.timer = null;
    this.advanceEpoch();
    // A request from the previous presentation must never hold the next one open.
    this.inflight = null;
    this.inflightEpoch = null;
    this.refreshQueued = false;
    this.loading = false;
    if (this.alive) this.renderState();
  }

  onActivate() { this.syncLifecycle(); }
  onDeactivate() { this.syncLifecycle(); }

  advanceEpoch() {
    this.epoch = Number.isSafeInteger(this.epoch) && this.epoch < Number.MAX_SAFE_INTEGER
      ? this.epoch + 1
      : 1;
    return this.epoch;
  }

  schedule() {
    clearTimeout(this.timer);
    if (!this.active()) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (!this.active()) return;
      void this.refresh(false).finally(() => {
        if (this.active()) this.schedule();
      });
    }, REFRESH_MS);
  }

  refresh(manual = false) {
    if (!this.active()) return Promise.resolve();
    if (this.inflight) {
      if (this.inflightEpoch !== this.epoch) this.refreshQueued = true;
      return this.inflight;
    }

    const requestEpoch = this.advanceEpoch();
    const readEpoch = nextWeatherReadEpoch();
    this.loading = true;
    if (manual) this.notice.textContent = 'Updating current game conditions…';
    this.renderState();

    let work;
    work = (async () => {
      try {
        // This read-only key distinguishes destroyed/recreated views in the shared
        // transport; the local epoch below still rejects stale completion in this view.
        const raw = await this.data('Weather/GetState', { ViewEpoch: readEpoch });
        if (!this.active() || requestEpoch !== this.epoch) return;
        this.state = normalizeWeatherState(raw);
        this.error = '';
        this.lastGoodAt = Date.now();
        this.notice.textContent = '';
      } catch (error) {
        if (!this.active() || requestEpoch !== this.epoch) return;
        this.error = safeError(error);
        this.notice.textContent = this.error;
      } finally {
        if (this.inflight === work) {
          this.inflight = null;
          this.inflightEpoch = null;
          this.loading = false;
          if (this.active()) this.renderState();
          if (this.refreshQueued && this.active()) {
            this.refreshQueued = false;
            queueMicrotask(() => { if (this.active()) void this.refresh(false); });
          }
        }
      }
    })();
    this.inflight = work;
    this.inflightEpoch = requestEpoch;
    return work;
  }

  toggleUnit() {
    const next = WIND_UNITS[(WIND_UNITS.indexOf(this.unit) + 1) % WIND_UNITS.length];
    if (!writeLocal(this.context, 'weather-wind-unit', next)) {
      this.notify('Device storage is full. Wind units were not changed.');
      return;
    }
    this.unit = next;
    this.renderState();
  }

  renderState() {
    const state = this.state;
    const condition = state?.condition;
    const sky = skyForGameTime(state?.time);
    this.element.dataset.sky = sky;
    this.scene.dataset.condition = condition?.code.toLowerCase() || 'unknown';
    this.scene.dataset.sky = sky;
    this.location.textContent = state?.location || 'Location unavailable';
    this.time.textContent = state?.time
      ? `${String(state.time.Hour).padStart(2, '0')}:${String(state.time.Minute).padStart(2, '0')} · GAME TIME`
      : 'Game clock unavailable';
    this.condition.textContent = condition?.label || 'Conditions unavailable';
    this.syntheticTag.hidden = state?.synthetic !== true;

    const converted = state?.wind === null || state?.wind === undefined ? null : convertWindSpeed(state.wind, this.unit);
    this.windValue.textContent = converted === null ? '—' : converted.toFixed(1);
    this.windLabel.textContent = 'Wind speed';
    this.windButton.querySelector('.nx-weather-unit-value').textContent = this.unit;
    this.windButton.setAttribute('aria-label', `Change wind speed units. Currently ${this.unit}.`);

    const bearing = state?.bearing;
    const compass = compassPoint(bearing);
    this.directionValue.textContent = bearing === null || !compass ? '—' : `${compass} · ${bearing.toFixed(0)}°`;
    this.compass.hidden = bearing === null || !compass;
    this.compass.style.setProperty('--nx-weather-bearing', `${bearing ?? 0}deg`);
    this.direction.setAttribute('aria-label', bearing === null || !compass
      ? 'Game wind vector unavailable'
      : `Game wind vector pointing ${compass}, ${bearing.toFixed(0)} degrees clockwise from north`);

    this.transition.hidden = !state?.transition;
    this.transition.replaceChildren();
    if (state?.transition) {
      const title = el('strong', 'nx-weather-transition-title', `${state.transition.from} → ${state.transition.to}`);
      const bar = el('span', 'nx-weather-transition-bar');
      bar.setAttribute('role', 'meter');
      bar.setAttribute('aria-label', 'Game weather transition progress');
      bar.setAttribute('aria-valuemin', '0');
      bar.setAttribute('aria-valuemax', '100');
      bar.setAttribute('aria-valuenow', String(Math.round(state.transition.percent * 100)));
      const fill = el('span', 'nx-weather-transition-fill');
      fill.style.width = `${state.transition.percent * 100}%`;
      bar.append(fill);
      this.transition.append(title, bar, el('small', '', 'In-game weather changing'));
    }

    const age = this.lastGoodAt ? Math.max(0, Date.now() - this.lastGoodAt) : null;
    const stale = age !== null && age >= STALE_MS;
    this.freshness.textContent = this.loading
      ? (age === null ? 'Reading current game conditions…' : `${stale ? 'Stale' : 'Last read'} ${ageText(age)}`)
      : age === null
        ? 'Current conditions only · Forecast unavailable'
        : `${stale ? 'Stale' : 'Updated'} ${ageText(age)} · Current conditions only`;
    this.refreshButton.disabled = this.loading;
    this.refreshButton.setAttribute('aria-busy', String(this.loading));
    this.scene.setAttribute('aria-busy', String(this.loading));
  }

  $destroy() {
    this.running = false;
    this.advanceEpoch();
    clearTimeout(this.timer);
    this.timer = null;
    this.inflight = null;
    this.inflightEpoch = null;
    this.refreshQueued = false;
    this.loading = false;
    this.element.dataset.weatherActive = 'false';
    super.$destroy();
  }
}
