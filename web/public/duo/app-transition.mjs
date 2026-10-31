/** Animate an app instance between its full display and a launcher tile. */
export function transitionTransform(origin, viewport) {
  const values = ['left', 'top', 'width', 'height'];
  if (!origin || !viewport || !values.every(key => Number.isFinite(Number(origin[key])) && Number.isFinite(Number(viewport[key])))) return null;
  if (Number(origin.width) <= 0 || Number(origin.height) <= 0 || Number(viewport.width) <= 0 || Number(viewport.height) <= 0) return null;
  const x = Number(origin.left) - Number(viewport.left);
  const y = Number(origin.top) - Number(viewport.top);
  const sx = Number(origin.width) / Number(viewport.width);
  const sy = Number(origin.height) / Number(viewport.height);
  return `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`;
}

export function playAppTransition(node, origin, {
  direction = 'open',
  reducedMotion = false,
  duration,
  easing = 'cubic-bezier(.22,.78,.2,1)',
} = {}) {
  if (reducedMotion || !node || typeof node.animate !== 'function') return null;
  if (direction !== 'open' && direction !== 'close') return null;
  const viewport = node.getBoundingClientRect();
  const hasOrigin = !!transitionTransform(origin, viewport);
  const compactTransform = hasOrigin
    ? transitionTransform(origin, viewport)
    : 'translate3d(0, 0, 0) scale(.92, .92)';
  const transformOrigin = hasOrigin ? 'top left' : 'center center';

  const compact = {
    transform: compactTransform,
    transformOrigin,
    borderRadius: origin?.borderRadius || '1.6vh',
    opacity: .84,
  };
  const full = { transform: 'translate3d(0, 0, 0) scale(1, 1)', transformOrigin, borderRadius: '0', opacity: 1 };
  const animation = node.animate(direction === 'open' ? [compact, full] : [full, compact], {
    duration: Number.isFinite(duration) ? Math.max(1, duration) : direction === 'open' ? 420 : 320,
    easing,
    fill: 'both',
  });
  const finished = Promise.resolve(animation.finished).then(
    () => true,
    () => false,
  ).finally(() => {
    if (node.isConnected) node.style.removeProperty('transform-origin');
    try { animation.cancel(); } catch { /* CEF may already have discarded the effect. */ }
  });
  return { animation, finished };
}
