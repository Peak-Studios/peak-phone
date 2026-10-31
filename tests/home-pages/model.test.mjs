import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createHomeEdgeDwell,
  enterHomeEdgeDwellAtBoundary,
  getHomePages,
  materializeHomePages,
  moveHomeItemToDock,
  moveHomeItemToPage,
  normalizeHomeLayout,
  resolveHomeDropPage,
  reorderHomeLayout
} from '../../web/public/duo/home-pages.mjs';

const ids = Array.from({ length: 22 }, (_, index) => `app${index + 1}`);
const defaults = ids.slice(0, 6);
const dock = ['app1', 'app2'];
const options = { knownIds: ids, defaultOrder: defaults, defaultDock: dock, defaultHidden: [], hiddenIds: ids, legacyCapacity: 16 };

test('default and exact-default legacy layouts stay implicit and pack to measured capacity', () => {
  const current = normalizeHomeLayout(null, options);
  const legacyAppearanceSave = normalizeHomeLayout({ order: [...defaults], dock: [...dock], hidden: [] }, options);
  assert.equal(Object.hasOwn(current, 'pages'), false);
  assert.equal(Object.hasOwn(legacyAppearanceSave, 'pages'), false);
  assert.deepEqual(getHomePages(current, 3, ['app3', 'app4', 'app5', 'app6']), [['app3', 'app4', 'app5'], ['app6']]);
});

test('legacy custom order, dock, and hidden changes migrate with historical 16-item boundaries', () => {
  const customOrder = normalizeHomeLayout({ order: ids, dock, hidden: [] }, options);
  const customDock = normalizeHomeLayout({ order: defaults, dock: ['app1'], hidden: [] }, options);
  const customHidden = normalizeHomeLayout({ order: defaults, dock, hidden: ['app22'] }, options);
  assert.deepEqual(customOrder.pages.map(page => page.length), [16, 4]);
  assert.deepEqual(customDock.pages.map(page => page.length), [5]);
  assert.deepEqual(customHidden.pages.map(page => page.length), [4]);
});

test('first custom edit packs visible apps first and keeps unavailable IDs after them', () => {
  const layout = normalizeHomeLayout({ order: ids, dock, hidden: [] }, { ...options, defaultOrder: ids });
  const materialized = materializeHomePages(layout, 2, ['app3', 'app4', 'app5']);
  assert.deepEqual(materialized.pages, [['app3', 'app4'], ['app5'], ids.slice(5).filter(id => !dock.includes(id))]);
});

test('explicit blank pages and new left or right pages keep their boundaries', () => {
  const layout = { order: ['app1', 'app2', 'app3'], dock: [], hidden: [], pages: [['app1', 'app2'], [], ['app3']] };
  const movedAcrossBlank = moveHomeItemToPage(layout, 'app1', 2, 16);
  assert.deepEqual(movedAcrossBlank.pages, [['app2'], [], ['app3', 'app1']]);
  assert.deepEqual(normalizeHomeLayout(movedAcrossBlank, { knownIds: ['app1', 'app2', 'app3'], defaultOrder: ['app1', 'app2', 'app3'], defaultDock: [], hiddenIds: [] }).pages, movedAcrossBlank.pages);
  assert.deepEqual(moveHomeItemToPage({ ...layout, pages: [['app1', 'app2'], ['app3']] }, 'app1', 0, 16, { insertPageSide: 'left' }).pages, [['app1'], ['app2'], ['app3']]);
  assert.deepEqual(moveHomeItemToPage({ ...layout, pages: [['app1', 'app2'], ['app3']] }, 'app1', 2, 16, { insertPageSide: 'right' }).pages, [['app2'], ['app3'], ['app1']]);
});

test('drop over an original grid uses its current DOM index after temporary left insertion', () => {
  const temporaryPage = { dataset: { page: '' } };
  const originalPage = { dataset: { page: '0' } };
  const followingPage = { dataset: { page: '1' } };
  const track = { children: [temporaryPage, originalPage, followingPage] };
  const staleIcon = { dataset: { page: '0' } };
  const temporary = { index: 0, side: 'left' };
  const resolved = resolveHomeDropPage(track, originalPage, Number(staleIcon.dataset.page), temporary);
  assert.deepEqual(resolved, { pageIndex: 1, targetPage: 0, insertPageSide: null });

  const layout = { order: ['app1', 'app2', 'app3'], dock: [], hidden: [], pages: [['app1', 'app2'], ['app3']] };
  const moved = moveHomeItemToPage(layout, 'app1', resolved.targetPage, 16, { before: 'app2', insertPageSide: resolved.insertPageSide });
  assert.deepEqual(moved.pages, [['app1', 'app2'], ['app3']]);

  track.children = [originalPage, followingPage];
  assert.deepEqual(resolveHomeDropPage(track, originalPage, Number(staleIcon.dataset.page)), { pageIndex: 0, targetPage: 0, insertPageSide: null });
  assert.strictEqual(track.children[0], originalPage);
});

test('malformed explicit layouts cannot force unbounded empty page rendering', () => {
  const layout = normalizeHomeLayout({ order: ids, dock, hidden: [], pages: Array.from({ length: 5000 }, () => []) }, options);
  assert.equal(layout.pages.length, 26);
  assert.deepEqual(layout.pages.at(-1), ids.filter(id => !dock.includes(id)));
});

test('same-page reorder updates flat order and keeps an emptied page', () => {
  const layout = { order: ['app1', 'app2', 'app3'], dock: [], hidden: [], pages: [['app1', 'app2'], ['app3'], []] };
  const reordered = moveHomeItemToPage(layout, 'app2', 0, 16, { before: 'app1' });
  assert.deepEqual(reordered.pages, [['app2', 'app1'], ['app3'], []]);
  const moved = moveHomeItemToPage(layout, 'app1', 1, 16);
  assert.deepEqual(moved.pages, [['app2'], ['app3', 'app1'], []]);
  assert.deepEqual(moved.order.filter(id => !moved.dock.includes(id)), moved.pages.flat());
});

test('Home editor reorder retains explicit page lengths and dock capacity failure is atomic', () => {
  const layout = { order: ['app1', 'app2', 'app3', 'app4'], dock: [], hidden: [], pages: [['app1', 'app2'], ['app3', 'app4'], []] };
  const reordered = reorderHomeLayout(layout, ['app2', 'app1', 'app3', 'app4'], 16);
  assert.deepEqual(reordered.pages.map(page => page.length), [2, 2, 0]);
  assert.deepEqual(reordered.pages.flat(), ['app2', 'app1', 'app3', 'app4']);
  const fullDock = { order: [...ids], dock: ids.slice(0, 4), hidden: [], pages: [ids.slice(4)] };
  const before = structuredClone(fullDock);
  assert.equal(moveHomeItemToDock(fullDock, 'app5', null, 16), null);
  assert.deepEqual(fullDock, before);
});

test('edge dwell waits two seconds and leaving or canceling clears the pending timer', () => {
  let now = 0, nextId = 0;
  const tasks = new Map(), triggered = [];
  const schedule = (fn, delay) => { const id = ++nextId; tasks.set(id, { fn, due: now + delay, canceled: false }); return id; };
  const cancel = id => { const task = tasks.get(id); if (task) task.canceled = true; };
  const advance = ms => {
    now += ms;
    for (const task of tasks.values()) if (!task.canceled && task.due <= now) { task.canceled = true; task.fn(); }
  };
  const dwell = createHomeEdgeDwell(edge => triggered.push(edge), { schedule, cancel });
  dwell.enter('right');
  advance(1999);
  assert.deepEqual(triggered, []);
  advance(1);
  assert.deepEqual(triggered, ['right']);
  dwell.enter('left');
  dwell.leave();
  advance(2000);
  assert.deepEqual(triggered, ['right']);
  dwell.enter('right');
  dwell.cancel();
  advance(2000);
  assert.deepEqual(triggered, ['right']);
});

test('crossing onto the last existing page arms edge dwell before another pointer move', () => {
  let now = 0, nextId = 0;
  const tasks = new Map(), triggered = [];
  const schedule = (fn, delay) => { const id = ++nextId; tasks.set(id, { fn, due: now + delay, canceled: false }); return id; };
  const cancel = id => { const task = tasks.get(id); if (task) task.canceled = true; };
  const advance = ms => {
    now += ms;
    for (const task of tasks.values()) if (!task.canceled && task.due <= now) { task.canceled = true; task.fn(); }
  };
  const dwell = createHomeEdgeDwell(edge => triggered.push(edge), { schedule, cancel });
  const pageCount = 2;
  let page = 0;

  page += 1;
  assert.equal(enterHomeEdgeDwellAtBoundary(dwell, page, 1, pageCount), true);
  advance(1999);
  assert.deepEqual(triggered, []);
  advance(1);
  assert.deepEqual(triggered, ['right']);

  assert.equal(enterHomeEdgeDwellAtBoundary(dwell, 1, 1, 3), false);
  assert.equal(enterHomeEdgeDwellAtBoundary(dwell, 1, 1, 2, true), false);
});
