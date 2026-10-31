export function normalizeOrientation(value) {
  return value === 'portrait' ? 'portrait' : 'landscape';
}

export function visibleOrientation(value, expanded) {
  return expanded ? normalizeOrientation(value) : 'landscape';
}

export function toggleOrientation(value, expanded) {
  if (!expanded) return 'landscape';
  return normalizeOrientation(value) === 'portrait' ? 'landscape' : 'portrait';
}

export function splitRatioFromPointer(event, rect, orientation) {
  if (!event || !rect) return NaN;
  const portrait = orientation === 'portrait';
  const extent = portrait ? rect.height : rect.width;
  if (!Number.isFinite(extent) || extent <= 0) return NaN;
  const offset = portrait ? event.clientY - rect.top : event.clientX - rect.left;
  return offset / extent;
}
