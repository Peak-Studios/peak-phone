import test from 'node:test';
import assert from 'node:assert/strict';
import { compassPoint, convertWindSpeed, normalizeWeatherState, skyForGameTime } from '../../web/public/duo/weather-core.mjs';

const fixture = () => ({
  Success: true,
  Location: '  Downtown Vinewood  ',
  GameTime: { Hour: 18, Minute: 24 },
  Condition: { Known: true, Code: 'CLEAR', Label: 'untrusted label' },
  Wind: { Available: true, MetersPerSecond: 4.2, Bearing: 42 },
  Transition: { from: 'CLEAR', to: 'RAIN', percent: 0.24 },
  Temperature: 80,
  Forecast: [{ Hour: 19, Condition: 'RAIN' }],
});

test('normalizes only verified current game readings and ignores provider-shaped extras', () => {
  const normalized = normalizeWeatherState(fixture());
  assert.equal(normalized.location, 'Downtown Vinewood');
  assert.deepEqual(normalized.time, { Hour: 18, Minute: 24 });
  assert.deepEqual(normalized.condition, { code: 'CLEAR', label: 'Clear' });
  assert.equal(normalized.wind, 4.2);
  assert.equal(normalized.bearing, 42);
  assert.deepEqual(normalized.transition, { from: 'Clear', to: 'Rain', percent: 0.24 });
  assert.equal(Object.hasOwn(normalized, 'Temperature'), false);
  assert.equal(Object.hasOwn(normalized, 'Forecast'), false);
  assert.equal(normalized.synthetic, false);
});

test('unknown and malformed native values stay unavailable without substituting clear skies', () => {
  const value = fixture();
  value.Condition = { Known: false, Code: 'UNKNOWN', Label: 'Clear' };
  value.GameTime = { Hour: 24, Minute: 61 };
  value.Wind = { Available: true, MetersPerSecond: Infinity, Bearing: NaN };
  value.Transition = { from: 'UNKNOWN', to: 'CLEAR', percent: 0.5 };
  const normalized = normalizeWeatherState(value);
  assert.equal(normalized.condition, null);
  assert.equal(normalized.time, null);
  assert.equal(normalized.wind, null);
  assert.equal(normalized.bearing, null);
  assert.equal(normalized.transition, null);
});

test('transition and compass output require known bounded values', () => {
  const value = fixture();
  value.Transition.percent = 1;
  value.Wind.Bearing = 360;
  const normalized = normalizeWeatherState(value);
  assert.equal(normalized.transition, null);
  assert.equal(normalized.bearing, 0);
  assert.equal(compassPoint(42), 'NE');
  assert.equal(compassPoint(360), 'N');
  assert.equal(compassPoint(NaN), null);
  assert.equal(compassPoint(361), null);
});

test('clockwise XY bearings label the four cardinal game wind vectors', () => {
  for (const [bearing, point] of [[0, 'N'], [90, 'E'], [180, 'S'], [270, 'W']]) {
    const value = fixture();
    value.Wind.Bearing = bearing;
    const normalized = normalizeWeatherState(value);
    assert.equal(normalized.bearing, bearing);
    assert.equal(compassPoint(normalized.bearing), point);
  }
});

test('sky presentation follows only a valid current game hour', () => {
  assert.equal(skyForGameTime({ Hour: 14, Minute: 30 }), 'day');
  assert.equal(skyForGameTime({ Hour: 19, Minute: 59 }), 'day');
  assert.equal(skyForGameTime({ Hour: 20, Minute: 0 }), 'night');
  assert.equal(skyForGameTime({ Hour: 5, Minute: 59 }), 'night');
  assert.equal(skyForGameTime(null), 'unknown');
  assert.equal(skyForGameTime({ Hour: 24, Minute: 0 }), 'unknown');
  assert.equal(skyForGameTime({ Hour: 10.5 }), 'unknown');
});

test('wind units convert only values within the supported range', () => {
  assert.ok(Math.abs(convertWindSpeed(4.2, 'mph') - 9.395) < 0.001);
  assert.ok(Math.abs(convertWindSpeed(4.2, 'km/h') - 15.12) < 0.001);
  assert.equal(convertWindSpeed(4.2, 'm/s'), 4.2);
  assert.equal(convertWindSpeed(4.2, 'knots'), null);
  assert.equal(convertWindSpeed(101, 'm/s'), null);
});

test('failed live reads surface a bounded message and synthetic preview stays explicitly marked', () => {
  assert.throws(() => normalizeWeatherState({ Success: false, Error: 'Native read unavailable' }), /Native read unavailable/);
  const preview = fixture();
  preview.PreviewOnly = true;
  preview.SampleKind = 'synthetic-preview';
  assert.equal(normalizeWeatherState(preview).synthetic, true);
});
