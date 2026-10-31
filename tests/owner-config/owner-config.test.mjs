import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { getOwnerConfig, ownerIconNames, setOwnerConfig } from '../../web/public/duo/owner-config.mjs';
import { APPS, byId, NETWORKS, applyOwnerCatalog, availableApps, catalogPresentationSignature } from '../../web/public/duo/catalog.mjs';
import { appIcon } from '../../web/public/duo/ios-icons.mjs';
import { icon } from '../../web/public/duo/icons.mjs';
import { storeCatalog } from '../../web/public/duo/store-app.mjs';

test('server owner metadata is bounded to stable IDs, bundled icons, and plain text', () => {
  const config = setOwnerConfig({
    apps: {
      labels: { maps: 'City Map', services: '<img src=x onerror=alert(1)>', newapp: 'Injected app' },
      icons: { maps: 'map', services: 'https://example.invalid/icon.svg' },
      defaults: { order: ['maps', 'maps', 'newapp'], dock: ['maps', 'calls'] },
    },
    maps: { places: [
      { id: 'city_hospital', name: 'City Hospital', area: 'Pillbox', category: 'Services', x: 307.2, y: -595.3 },
      { id: 'unsafe', name: '<svg onload=alert(1)>', x: 0, y: 0 },
      { id: 'outside', name: 'Outside', x: 13000, y: 0 },
    ] },
    networks: { labels: { pdm: 'City Motors', unknown: 'Unbacked network' } },
    services: { jobLabels: { police: 'City Police', outsider: '<script>x</script>' } },
    news: { title: 'City News', networkLabels: { weazelnews: 'City News', outsider: 'Ignore me' } },
    store: { featuredApp: 'maps', apps: {
      peakify: { description: 'Local music catalog', category: 'Music' },
      newapp: { description: 'Not a shipped app' },
    } },
  });
  applyOwnerCatalog(config);

  assert.equal(byId.maps.name, 'City Map');
  assert.equal(byId.services.name, 'Services');
  assert.equal(byId.maps.ownerIconOverride, true);
  assert.equal(byId.services.ownerIconOverride, false);
  assert.deepEqual(config.apps.defaults.order, ['maps', ...APPS.map(app => app.id).filter(id => id !== 'maps')]);
  assert.ok(availableApps({ installed: { calculator: true } }).some(app => app.id === 'calculator'), 'an omitted Store app stays reachable after installation');
  assert.deepEqual(config.apps.defaults.dock, ['maps', 'calls']);
  assert.deepEqual(config.maps.places.map(({ id }) => id), ['city_hospital']);
  assert.deepEqual(config.networks.labels, { pdm: 'City Motors' });
  assert.equal(config.services.jobLabels.police, 'City Police');
  assert.equal(config.services.jobLabels.outsider, undefined);
  assert.equal(config.news.title, 'City News');
  assert.equal(config.news.networkLabels.outsider, undefined);
  assert.equal(config.store.apps.peakify.description, 'Local music catalog');
  assert.equal(config.store.apps.newapp, undefined);
  assert.equal(config.store.featuredApp, 'peakify');
  assert.equal(appIcon(byId.maps).includes('https://'), false);
  for (const name of ownerIconNames) assert.notEqual(icon(name), icon('layers'), `owner icon ${name} must be a bundled glyph`);
  assert.equal(storeCatalog.includes('newapp'), false);
  assert.equal(APPS.some(app => app.id === 'newapp'), false);
  assert.equal(NETWORKS.pdm, 'City Motors');
});

test('owner job access hides apps in the launcher without changing stable catalog IDs', () => {
  const capabilities = { services: { ownerAccess: false }, maps: { ownerAccess: true } };
  const allowed = availableApps({ installed: { vehicles: true }, network: 'pdm', capabilities });
  assert.equal(allowed.some(app => app.id === 'services'), false);
  assert.equal(allowed.some(app => app.id === 'maps'), true);
  assert.equal(allowed.some(app => app.id === 'cars'), true);
  assert.ok(APPS.every(app => byId[app.id] === app));
});

test('missing or invalid owner configuration resets to the bundled presentation defaults', () => {
  const config = setOwnerConfig({ apps: { labels: { maps: '<b>broken</b>' }, icons: { maps: 'data:image/svg+xml,x' } } });
  applyOwnerCatalog(config);
  assert.equal(byId.maps.name, 'Maps');
  assert.equal(byId.maps.icon, 'navigation');
  assert.equal(byId.maps.ownerIconOverride, false);
  assert.equal(getOwnerConfig().news.title, 'Binsbergen');
  assert.ok(getOwnerConfig().maps.places.length === 0);
});

test('launcher presentation signatures change when owner labels or icons change', () => {
  const before = catalogPresentationSignature();
  const config = setOwnerConfig({ apps: { labels: { maps: 'City Map' }, icons: { maps: 'map' } } });
  applyOwnerCatalog(config);
  assert.notEqual(catalogPresentationSignature(), before);
  assert.equal(byId.maps.name, 'City Map');
  assert.equal(byId.maps.icon, 'map');
});

test('owner configuration cache revisions cover every import edge in the changed UI graph', () => {
  const revision = 'owner-config-20261015';
  const affected = new Set([
    'call-ui.mjs','camera-controls.mjs','camera-ui.mjs','catalog.mjs','control-center.mjs','home-editor-app.mjs',
    'icons.mjs','ios-icons.mjs','kilogram-app.mjs','legacy-app-sheets.mjs','maps-app.mjs','media-gallery.mjs',
    'music-app.mjs','music-overlay.mjs','native-kit.mjs','notes-app.mjs','owner-config.mjs','photos-library.mjs',
    'presentation.mjs','preview.mjs','services-app.mjs','shell.mjs','store-app.mjs','ui-kit.mjs','utilities-apps.mjs',
    'settings-app.mjs','crypto-app.mjs','glass-kit.mjs','phone-app.mjs','social-app.mjs','vehicle-app.mjs','video-app.mjs',
    'calculator-app.mjs','calendar-app.mjs','clock-app.mjs','community-apps.mjs','daily-apps.mjs','mail-app.mjs',
    'messages-app.mjs','voice-memos-app.mjs','weather-app.mjs',
  ]);
  const directory = new URL('../../web/public/duo/', import.meta.url);
  for (const entry of readdirSync(directory)) {
    if (!entry.endsWith('.mjs')) continue;
    const source = readFileSync(new URL(entry, directory), 'utf8');
    for (const match of source.matchAll(/(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"]\.\/([^'"?]+\.mjs)(\?rev=[^'"]*)?['"]|import\(['"]\.\/([^'"?]+\.mjs)(\?rev=[^'"]*)?['"]\)/g)) {
      const target = match[1] || match[3];
      const query = match[2] || match[4] || '';
      if (affected.has(target)) assert.equal(query, `?rev=${target === 'calculator-app.mjs' ? 'phone-f05-calculator-safe-area-20261016a' : revision}`, `${entry} must load the refreshed ${target}`);
    }
  }
  const index = readFileSync(new URL('../../web/public/index.html', import.meta.url), 'utf8');
  assert.ok(index.includes('./duo/shell.mjs?rev=calculator-owner-config-20261016a'));
});
