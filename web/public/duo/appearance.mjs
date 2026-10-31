export const normalizeAppearance = value => ['light', 'dark', 'system'].includes(value) ? value : 'dark';
export const resolveAppearance = (value, systemDark) => normalizeAppearance(value) === 'system' ? (systemDark ? 'dark' : 'light') : normalizeAppearance(value);

// Scope native controls to the phone. The transparent NUI canvas stays untouched.
export function createAppearance({root, read, write, changed = () => {}, media = matchMedia('(prefers-color-scheme: dark)')}) {
  let preference = normalizeAppearance(read('appearance', 'dark'));
  const apply = () => {
    const theme = resolveAppearance(preference, media.matches);
    root.dataset.appearance = preference;
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    document.querySelectorAll('.duo-global-overlays').forEach(node => {
      node.dataset.theme = theme;
      node.style.colorScheme = theme;
    });
    changed(theme);
  };
  const listener = () => { if (preference === 'system') apply(); };
  media.addEventListener('change', listener);
  apply();
  return {
    get: () => preference,
    set(value) {
      if (!['light', 'dark', 'system'].includes(value)) throw Error('Unknown appearance.');
      preference = value; write('appearance', value); apply();
    },
    refresh: apply,
    destroy: () => media.removeEventListener('change', listener)
  };
}
