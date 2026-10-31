const uniqueKnown = (items, known) => [...new Set((Array.isArray(items) ? items : []).filter(id => known.has(id)))];
const normalizedCapacity = value => Math.max(1, Math.floor(Number(value) || 1));
const chunk = (items, capacity) => {
  const pages = [];
  for (let index = 0; index < items.length; index += capacity) pages.push(items.slice(index, index + capacity));
  return pages.length ? pages : [[]];
};
const sameOrder = (left, right) => left.length === right.length && left.every((id, index) => id === right[index]);
const clonePages = pages => pages.map(page => [...page]);

function orderWithPageOrder(order, dock, pages) {
  const home = pages.flat();
  let cursor = 0;
  return order.map(id => dock.includes(id) ? id : home[cursor++] ?? id).concat(home.slice(cursor));
}

export function normalizeHomeLayout(value, { knownIds, defaultOrder, defaultDock, defaultHidden = [], hiddenIds = knownIds, legacyCapacity = 16 } = {}) {
  const known = new Set(knownIds || defaultOrder || []);
  const hiddenKnown = new Set(hiddenIds || []);
  const defaults = uniqueKnown(defaultOrder || [], known);
  const order = uniqueKnown(value?.order, known);
  for (const id of defaults) if (!order.includes(id)) order.push(id);
  const dock = uniqueKnown(Array.isArray(value?.dock) ? value.dock : defaultDock || [], known).slice(0, 4);
  const hidden = uniqueKnown(value?.hidden, hiddenKnown);
  let pages;

  if (Array.isArray(value?.pages)) {
    const seen = new Set(dock);
    // Prevent malformed persisted data from creating an unbounded number of DOM pages.
    const maxPages = Math.max(4, Math.min(64, known.size + 4));
    pages = value.pages.slice(0, maxPages).map(page => {
      const bucket = [];
      for (const id of Array.isArray(page) ? page : []) {
        if (known.has(id) && order.includes(id) && !seen.has(id)) {
          seen.add(id);
          bucket.push(id);
        }
      }
      return bucket;
    });
    if (!pages.length) pages = [[]];
    const missing = order.filter(id => !dock.includes(id) && !seen.has(id));
    if (missing.length) {
      if (pages.at(-1).length || pages.length >= maxPages) pages.at(-1).push(...missing);
      else pages.push(missing);
    }
    const normalizedOrder = orderWithPageOrder(order, dock, pages);
    return { order: normalizedOrder, dock, hidden, pages };
  }

  // Before explicit pages existed, custom ordering was displayed in 16-app chunks.
  // Migrate only altered orders; the built-in order stays pose-adaptive.
  const customized = !sameOrder(order, defaults) || !sameOrder(dock, uniqueKnown(defaultDock || [], known)) || !sameOrder(hidden, uniqueKnown(defaultHidden, hiddenKnown));
  if (Array.isArray(value?.order) && customized) {
    pages = chunk(order.filter(id => !dock.includes(id)), normalizedCapacity(legacyCapacity));
    return { order, dock, hidden, pages };
  }
  return { order, dock, hidden };
}

export function getHomePages(layout, capacity, visibleOrder = null) {
  if (Array.isArray(layout?.pages)) return clonePages(layout.pages);
  const order = Array.isArray(visibleOrder) ? visibleOrder : (layout?.order || []).filter(id => !(layout?.dock || []).includes(id));
  return chunk(order, normalizedCapacity(capacity));
}

export function materializeHomePages(layout, capacity, visibleOrder = null) {
  if (Array.isArray(layout?.pages)) return { ...layout, pages: clonePages(layout.pages) };
  if (!Array.isArray(visibleOrder)) return { ...layout, pages: getHomePages(layout, capacity) };
  const dock = layout?.dock || [], full = (layout?.order || []).filter(id => !dock.includes(id));
  const visible = [...new Set(visibleOrder.filter(id => full.includes(id)))], visibleSet = new Set(visible);
  const pages = chunk(visible, normalizedCapacity(capacity));
  const deferred = full.filter(id => !visibleSet.has(id));
  // Keep unavailable or hidden apps together after the live pages. If they later
  // become visible, the explicit bucket can scroll without changing page identity.
  if (deferred.length) pages.push(deferred);
  return { ...layout, pages };
}

function splitByLengths(items, lengths) {
  let cursor = 0;
  const pages = lengths.map(length => {
    const page = items.slice(cursor, cursor + length);
    cursor += length;
    return page;
  });
  if (!pages.length) pages.push([]);
  if (cursor < items.length) {
    const last = pages.length - 1;
    if (pages[last].length) pages.push(items.slice(cursor));
    else pages[last] = items.slice(cursor);
  }
  return pages;
}

export function reorderHomeLayout(layout, nextOrder, capacity, visibleOrder = null) {
  const current = materializeHomePages(layout, capacity, visibleOrder);
  const dock = current.dock || [];
  const order = [...new Set(nextOrder)];
  const homeOrder = order.filter(id => !dock.includes(id));
  const pages = splitByLengths(homeOrder, current.pages.map(page => page.length));
  return { ...current, order: orderWithPageOrder(order, dock, pages), pages };
}

export function moveHomeItemToPage(layout, id, targetPage, capacity, { before = null, insertPageSide = null, visibleOrder = null } = {}) {
  const visible = Array.isArray(visibleOrder) && !visibleOrder.includes(id) && (layout?.dock || []).includes(id) ? [...visibleOrder, id] : visibleOrder;
  const current = materializeHomePages(layout, capacity, visible);
  const pages = clonePages(current.pages);
  const dock = (current.dock || []).filter(item => item !== id);
  for (const page of pages) {
    let index;
    while ((index = page.indexOf(id)) !== -1) page.splice(index, 1);
  }
  let pageIndex = Math.max(0, Math.floor(Number(targetPage) || 0));
  if (insertPageSide === 'left') {
    pages.splice(pageIndex, 0, []);
  } else if (insertPageSide === 'right') {
    pages.splice(pageIndex, 0, []);
  }
  while (pageIndex >= pages.length) pages.push([]);
  const page = pages[pageIndex];
  const at = before ? page.indexOf(before) : -1;
  page.splice(at < 0 ? page.length : at, 0, id);
  const order = orderWithPageOrder(current.order || [], dock, pages);
  return { ...current, order, dock, pages };
}

export function moveHomeItemToDock(layout, id, before, capacity, visibleOrder = null) {
  const current = materializeHomePages(layout, capacity, visibleOrder);
  if (!(current.dock || []).includes(id) && (current.dock || []).length >= 4) return null;
  const pages = clonePages(current.pages);
  for (const page of pages) {
    let index;
    while ((index = page.indexOf(id)) !== -1) page.splice(index, 1);
  }
  const dock = (current.dock || []).filter(item => item !== id);
  const at = before ? dock.indexOf(before) : -1;
  dock.splice(at < 0 ? dock.length : at, 0, id);
  return { ...current, order: current.order || [], dock, pages };
}

export function toggleHomeDock(layout, id, capacity, visibleOrder = null) {
  if ((layout.dock || []).includes(id)) {
    const current = materializeHomePages(layout, capacity, [...new Set([...(visibleOrder || []), id])]);
    const dock = current.dock.filter(item => item !== id);
    const pages = clonePages(current.pages);
    if (pages.at(-1).length && pages.at(-1).length < normalizedCapacity(capacity)) pages.at(-1).push(id);
    else pages.push([id]);
    return { ...current, order: orderWithPageOrder(current.order || [], dock, pages), dock, pages };
  }
  if ((layout.dock || []).length >= 4) return null;
  const current = materializeHomePages(layout, capacity, visibleOrder);
  const pages = clonePages(current.pages);
  for (const page of pages) {
    let index;
    while ((index = page.indexOf(id)) !== -1) page.splice(index, 1);
  }
  const dock = [...(current.dock || []), id];
  return { ...current, order: orderWithPageOrder(current.order || [], dock, pages), dock, pages };
}

export function createHomeEdgeDwell(onDwell, { schedule = setTimeout, cancel = clearTimeout, duration = 2000 } = {}) {
  let timer = null, edge = null, generation = 0;
  const clear = () => {
    generation++;
    if (timer !== null) cancel(timer);
    timer = null;
    edge = null;
  };
  return {
    enter(nextEdge) {
      if (nextEdge === edge && timer !== null) return;
      clear();
      edge = nextEdge;
      const current = ++generation;
      timer = schedule(() => {
        if (current !== generation) return;
        const readyEdge = edge;
        timer = null;
        edge = null;
        if (readyEdge !== null) onDwell(readyEdge);
      }, duration);
    },
    leave: clear,
    cancel: clear,
    get pending() { return timer !== null; }
  };
}

export function resolveHomeDropPage(track, grid, fallbackPage, temporaryPage = null) {
  const children = track?.children;
  const actualIndex = grid && children ? Array.prototype.indexOf.call(children, grid) : -1;
  const pageIndex = actualIndex >= 0 ? actualIndex : fallbackPage;
  let targetPage = pageIndex, insertPageSide = null;
  if (temporaryPage) {
    if (pageIndex === temporaryPage.index) insertPageSide = temporaryPage.side;
    else if (temporaryPage.side === 'left' && pageIndex > temporaryPage.index) targetPage--;
  }
  return { pageIndex, targetPage, insertPageSide };
}

export function enterHomeEdgeDwellAtBoundary(dwell, pageIndex, direction, pageCount, hasTemporaryPage = false) {
  if (hasTemporaryPage || ![-1, 1].includes(direction) || pageCount < 1) return false;
  const atBoundary = direction < 0 ? pageIndex === 0 : pageIndex === pageCount - 1;
  if (!atBoundary) return false;
  dwell.enter(direction < 0 ? 'left' : 'right');
  return true;
}
