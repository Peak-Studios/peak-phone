const ref = path => ({ __nativeEditorRef: path });

export const NATIVE_EDITOR_FIXTURES = Object.freeze([
  { appId: 'settings', label: 'Settings · Device PIN keypad', steps: [{ method: 'navigate', args: ['device'] }] },
  { appId: 'settings', label: 'Settings · Recovery entry', steps: [{ method: 'recover' }] },
  { appId: 'settings', label: 'Settings · Recovery code · PREVIEW ONLY', steps: [{ method: 'showRecovery', args: ['PREVIEW-ONLY-DO-NOT-USE'] }] },
  { appId: 'settings', label: 'Settings · Reset confirmation', steps: [{ method: 'navigate', args: ['device'] }, { clickText: 'Reset device' }] },
  { appId: 'settings', label: 'Settings · Wallpaper controls', steps: [{ method: 'navigate', args: ['display'] }] },
  { appId: 'settings', label: 'Settings · Account and device details', steps: [{ method: 'navigate', args: ['about'] }] },
  { appId: 'settings', label: 'Settings · Network chooser', steps: [{ method: 'navigate', args: ['network'] }, { clickText: 'Choose network' }] },
  { appId: 'peakify', label: 'Music · Create playlist', steps: [{ method: 'playlistForm' }] },
  { appId: 'peakify', label: 'Music · Add songs to playlist', steps: [{ method: 'addPlaylistTracks', args: [ref('playlists.0')] }] },
  { appId: 'peakify', label: 'Music · Collaborators', steps: [{ method: 'collaborators', args: [ref('playlists.0')] }] },
  { appId: 'kilogram', label: 'KiloGram · Profile editor', steps: [{ method: 'navigate', args: ['me'] }, { method: 'editProfile' }] },
  { appId: 'kilogram', label: 'KiloGram · Report profile', steps: [{ method: 'rpc', args: ['GetProfile', { Id: 2 }], store: 'profile' }, { method: 'report', args: [ref('$profile.profile')] }] },
  { appId: 'kilogram', label: 'KiloGram · Compose post', steps: [{ method: 'compose', args: ['image'] }] },
  { appId: 'y', label: 'Y · Profile editor', steps: [{ method: 'editProfile', args: [ref('myProfile')] }] },
  { appId: 'y', label: 'Y · Report a post', steps: [{ method: 'postMenu', args: [ref('posts.0')] }, { clickText: 'Report post' }] },
  { appId: 'y', label: 'Y · Compose post', steps: [{ method: 'composer' }] },
  { appId: 'gallery', target: 'photos', label: 'Photos · Import from URL', steps: [{ method: 'openImportSheet' }] },
  { appId: 'gallery', target: 'photos', label: 'Photos · Share destinations', steps: [{ method: 'openShareSheet', args: [ref('photos.0')] }] },
  { appId: 'gallery', target: 'photos', label: 'Photos · Message destination', steps: [{ method: 'openMessageSheet', args: [ref('[photos.0]')] }] },
  { appId: 'gallery', target: 'photos', label: 'Photos · Post to Y destination', steps: [{ method: 'openYSheet', args: [ref('photos.0')] }] },
  { appId: 'gallery', target: 'photos', label: 'Photos · Nearby destination', steps: [{ method: 'openNearbySheet', args: [ref('photos.0')] }] },
  { appId: 'wenmo', label: 'Wenmo · Transaction details · PREVIEW ONLY', steps: [{ method: 'transaction', args: [{ IsSender: true, Amount: 25, Name: 'PREVIEW ONLY — Jordan', Comment: 'Synthetic layout example; no money moved', Timestamp: Date.now() }] }] },
  { appId: 'messages', label: 'Messages · Search results · PREVIEW ONLY', note: 'Synthetic Messages/Search rows rendered · read only · no game action submitted.', steps: [{ method: 'openMessageSearch' }, { previewSearch: { query: 'studio', results: [
    { Id: 101, Own: false, From: '5550102002', To: '5550102001', Message: 'PREVIEW ONLY · The new workspace looks great.', Timestamp: Date.now() - 300000 },
    { Id: 102, Own: true, From: '5550102001', To: '5550102002', Message: 'PREVIEW ONLY · Meet at the studio at six?', Timestamp: Date.now() - 120000 },
  ] } }] },
  { appId: 'vehicles', label: 'Vehicles · Transfer form', steps: [{ method: 'transfer', args: [ref('vehicles.0')] }] },
  { appId: 'vehicles', label: 'Vehicles · Request review', steps: [{ method: 'confirmRequest', args: [ref('vehicles.0')] }] },
  { appId: 'mails', label: 'Mail · Choose mailbox', steps: [{ method: 'openMailboxes' }] },
  { appId: 'mails', label: 'Mail · Compose', steps: [{ method: 'startCompose' }] },
  { appId: 'calculator', label: 'Calculator · Local history', steps: [{ seedCalculation: ['2', '+', '2', '='] }, { method: 'showHistory' }] },
  { appId: 'homeedit', label: 'Home Screen · Reset confirmation', steps: [{ method: 'confirmResetLayout' }] },
  { appId: 'maps', label: 'Maps · Place details', steps: [{ method: 'allPlaces', store: 'places' }, { method: 'select', args: [ref('$places.0')] }] },
  { appId: 'maps', label: 'Maps · People and sharing', steps: [{ method: 'setProperty', args: ['filter', 'people'] }, { method: 'renderList' }, { method: 'refreshPeople' }] },
  { appId: 'jobcenter', label: 'Jobs · Job Center', steps: [{ method: 'load' }] },
  { appId: 'jobcreator', label: 'Jobs · Import draft editor', steps: [{ method: 'importView' }] },
]);

function resolveValue(instance, value, state) {
  if (!value || typeof value !== 'object' || !Object.hasOwn(value, '__nativeEditorRef')) return value;
  const path = String(value.__nativeEditorRef);
  const arrayMatch = /^\[(.+)\]$/.exec(path);
  if (arrayMatch) return [resolveValue(instance, ref(arrayMatch[1]), state)];
  const root = path.startsWith('$') ? state : instance;
  const name = path.startsWith('$') ? path.slice(1) : path;
  return name.split('.').reduce((current, key) => {
    if (current == null) return undefined;
    return /^\d+$/.test(key) ? current[Number(key)] : current[key];
  }, root);
}

function viewRoot(instance) {
  return instance?.element || instance?.node || instance?.target || null;
}

function clickText(instance, text) {
  const root = viewRoot(instance);
  const wanted = String(text).replace(/\s+/g, ' ').trim();
  const button = [...(root?.querySelectorAll('button,[role="button"]') || [])]
    .find(candidate => candidate.getClientRects().length && candidate.textContent.replace(/\s+/g, ' ').trim() === wanted && !candidate.disabled);
  if (!button) throw Error(`The native preview control “${wanted}” is unavailable in this app state.`);
  button.click();
}

async function runPreviewSearch(instance, config) {
  if (typeof window === 'undefined' || new URLSearchParams(window.location.search).get('nativeEditors') !== '1') {
    throw Error('Synthetic Messages/Search rows are available only in the opt-in browser preview.');
  }
  const panel = instance.sheet?.panel;
  const input = panel?.querySelector('.gx-messages-editor-search input');
  const results = panel?.querySelector('.gx-search-results');
  if (!input || !results) throw Error('Open the native Search messages sheet before loading preview results.');
  const hadOwnData = Object.hasOwn(instance, 'data');
  const ownData = hadOwnData ? Object.getOwnPropertyDescriptor(instance, 'data') : null;
  const originalData = instance.data;
  instance.data = function (event, payload = {}) {
    if (event === 'Messages/Search') {
      const query = String(payload?.Query || '').trim().toLowerCase();
      const matched = query === String(config.query || '').trim().toLowerCase();
      return Promise.resolve({ Success: true, Messages: matched ? structuredClone(config.results || []) : [] });
    }
    return originalData.call(this, event, payload);
  };
  try {
    input.value = String(config.query || '');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    clickText(instance, 'Search');
    const deadline = Date.now() + 1800;
    while (Date.now() < deadline && !results.querySelector('.gx-messages-search-result')) {
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    if (!results.querySelector('.gx-messages-search-result')) throw Error('The synthetic search response did not render result rows.');
  } finally {
    if (ownData) Object.defineProperty(instance, 'data', ownData);
    else delete instance.data;
  }
}

export async function runNativeEditorFixture(fixture, instance) {
  if (!fixture || !instance) throw Error('The app did not finish mounting in the browser preview.');
  const target = fixture.target ? instance[fixture.target] : instance;
  if (!target) throw Error(`${fixture.label} is unavailable in this preview.`);
  const state = Object.create(null);
  let note = fixture.note || `${fixture.label} · local editor state opened. No server action submitted.`;
  for (const step of fixture.steps || []) {
    if (step.previewSearch) {
      await runPreviewSearch(target, step.previewSearch);
      continue;
    }
    if (step.method === 'setProperty') {
      target[step.args[0]] = resolveValue(target, step.args[1], state);
      continue;
    }
    if (step.method) {
      const method = target[step.method];
      if (typeof method !== 'function') throw Error(`This app does not expose ${step.method} in the current preview build.`);
      const args = (step.args || []).map(value => resolveValue(target, value, state));
      if (args.some(value => value === undefined || value === null)) {
        throw Error('This editor needs a matching synthetic preview row. Open its app with the preview fixtures enabled, then retry.');
      }
      const result = await method.apply(target, args);
      if (step.store) state[step.store] = result;
      continue;
    }
    if (step.clickText) {
      clickText(target, step.clickText);
      continue;
    }
    if (step.seedCalculation) {
      if (!Array.isArray(target.history) || target.history.length === 0) {
        for (const key of step.seedCalculation) target.key(key);
      }
    }
  }
  return { note };
}

export async function settleNativeEditorReads(instance, appId) {
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const deadline = Date.now() + 1800;
  const pendingRead = () => instance?.loading === true || instance?.reloading === true ||
    (appId === 'gallery' && /^(Loading|Updating) your library/.test(instance.count?.textContent || '')) ||
    (appId === 'kilogram' && instance.session === null && instance.me === null);

  const initial = instance?.loadPromise || instance?.initialLoad || instance?.reloadPromise;
  if (initial && typeof initial.then === 'function') await Promise.race([Promise.resolve(initial).catch(() => {}), delay(1600)]);
  while (Date.now() < deadline && pendingRead()) await delay(40);
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}
