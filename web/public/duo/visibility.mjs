/** CEF-safe phone visibility. Detach the closed device from painting, not its app state.
 * Opening cancels a pending hide; repeated store renders never extend the close timer.
 * The stage keeps its existing CSS open/close transition and hinge animations.
 */
export function createPhoneVisibility(root, stage, {
  delay = 500,
  schedule = (fn, ms) => setTimeout(fn, ms),
  cancel = id => clearTimeout(id),
} = {}) {
  if (!root || !stage) throw new TypeError('Phone root and stage are required');
  let timer = null;
  let shown = false;
  let peeked = false;
  let disposed = false;
  let generation = 0;
  const stopTimer = () => {
    generation++;
    if (timer !== null) cancel(timer);
    timer = null;
  };
  const hide = () => { root.hidden = true; timer = null; };
  root.hidden = true;
  root.inert = true;
  root.dataset.visible = 'false';
  return Object.freeze({
    set(value, { immediate = false, reducedMotion = false, peek = false } = {}) {
      if (disposed) return;
      value = Boolean(value);
      peeked = Boolean(peek && !value);
      const changed = value !== shown;
      shown = value;
      root.inert = !value;
      root.dataset.visible = String(value);
      root.dataset.peek = String(peeked);
      if (value || peeked) {
        stopTimer();
        if (root.hidden) {
          root.hidden = false;
          // Establish the off-screen transform before opening or peeking.
          void stage.offsetWidth;
        }
      } else {
        if (immediate || reducedMotion || root.hidden) {
          stopTimer(); hide();
        } else if (changed || timer === null) {
          stopTimer();
          const token = generation;
          timer = schedule(() => {
            if (!disposed && !shown && token === generation) hide();
          }, delay);
        }
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true; shown = false; peeked = false; stopTimer();
      root.inert = true; root.dataset.visible = 'false'; hide();
      root.dataset.peek = 'false';
    },
  });
}
