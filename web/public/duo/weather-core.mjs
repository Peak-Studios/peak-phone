export const WEATHER_LABELS = Object.freeze({
  EXTRASUNNY: 'Extra sunny', CLEAR: 'Clear', CLOUDS: 'Clouds', SMOG: 'Hazy',
  FOGGY: 'Fog', OVERCAST: 'Overcast', RAIN: 'Rain', THUNDER: 'Thunderstorms',
  CLEARING: 'Clearing', NEUTRAL: 'Neutral', SNOW: 'Snow', BLIZZARD: 'Blizzard',
  SNOWLIGHT: 'Light snow', XMAS: 'Winter weather', HALLOWEEN: 'Seasonal weather'
});

const finite = value => typeof value === 'number' && Number.isFinite(value);
const safeText = (value, max = 64) => typeof value === 'string' && value.trim() && value.length <= max
  ? value.trim().replace(/[\u0000-\u001f\u007f]/g, '')
  : '';

// This is a presentation cue from the live game clock, not a sunrise or forecast claim.
export function skyForGameTime(time) {
  const hour = time?.Hour;
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return 'unknown';
  return hour < 6 || hour >= 20 ? 'night' : 'day';
}

export function normalizeWeatherState(value) {
  if (!value || value.Success !== true) {
    const reason = safeText(value?.Error || value?.Msg, 180);
    throw new Error(reason || 'Current game weather is unavailable.');
  }

  const state = {
    location: safeText(value.Location),
    time: null,
    condition: null,
    wind: null,
    bearing: null,
    transition: null,
    sampledAt: finite(value.SampledAt) && value.SampledAt >= 0 ? value.SampledAt : null,
    synthetic: value.PreviewOnly === true && value.SampleKind === 'synthetic-preview'
  };

  if (Number.isInteger(value.GameTime?.Hour) && value.GameTime.Hour >= 0 && value.GameTime.Hour <= 23 &&
      Number.isInteger(value.GameTime?.Minute) && value.GameTime.Minute >= 0 && value.GameTime.Minute <= 59) {
    state.time = { Hour: value.GameTime.Hour, Minute: value.GameTime.Minute };
  }

  if (value.Condition?.Known === true && Object.hasOwn(WEATHER_LABELS, value.Condition.Code)) {
    state.condition = { code: value.Condition.Code, label: WEATHER_LABELS[value.Condition.Code] };
  }

  if (value.Wind?.Available === true && finite(value.Wind.MetersPerSecond) && value.Wind.MetersPerSecond >= 0 && value.Wind.MetersPerSecond <= 100) {
    state.wind = value.Wind.MetersPerSecond;
  }

  // Wind.Bearing is derived from the native XY vector, clockwise from +Y (north).
  const bearing = value.Wind?.Bearing;
  if (value.Wind?.Available === true && finite(bearing) && bearing >= 0 && bearing <= 360) {
    state.bearing = bearing === 360 ? 0 : bearing;
  }

  const transition = value.Transition;
  if (state.condition && transition && Object.hasOwn(WEATHER_LABELS, transition.from) &&
      Object.hasOwn(WEATHER_LABELS, transition.to) && transition.from === state.condition.code &&
      transition.to !== transition.from && finite(transition.percent) &&
      transition.percent > 0 && transition.percent < 1) {
    state.transition = {
      from: WEATHER_LABELS[transition.from],
      to: WEATHER_LABELS[transition.to],
      percent: transition.percent
    };
  }

  return state;
}

export function convertWindSpeed(metersPerSecond, unit) {
  if (!finite(metersPerSecond) || metersPerSecond < 0 || metersPerSecond > 100) return null;
  if (unit === 'mph') return metersPerSecond * 2.236936292;
  if (unit === 'km/h') return metersPerSecond * 3.6;
  if (unit === 'm/s') return metersPerSecond;
  return null;
}

// Bearings are clockwise from north, matching the wind-vector bearing in the native payload.
export function compassPoint(bearing) {
  if (!finite(bearing) || bearing < 0 || bearing > 360) return null;
  return ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][Math.round((bearing % 360) / 22.5) % 16];
}
