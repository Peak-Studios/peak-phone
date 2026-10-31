const asArray = value => Array.isArray(value) ? value : [];

function decorateOverlay(overlay) {
  if (overlay.dataset.u27HousingKeys === 'ready') return;
  const panel = overlay.querySelector('.phone-housing-keys-container');
  if (!panel) return;

  overlay.classList.add('u27-housing-keys-overlay');
  panel.classList.add('u27-housing-keys-panel');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Property key access');
  panel.setAttribute('aria-modal', 'true');

  const addHeading = panel.querySelector(':scope > p');
  const fields = asArray([...panel.querySelectorAll(':scope > .textfield-component-container')]);
  const groups = asArray([...panel.querySelectorAll(':scope > .phone-housing-keys-buttons')]);
  const divider = panel.querySelector(':scope > hr');
  const addField = fields[0], removeField = fields[1];
  const addActions = groups[0], removeActions = groups[1];
  if (!addField || !removeField || !addActions || !removeActions) return;

  const nav = document.createElement('header');
  nav.className = 'u27-housing-keys-nav';
  const title = document.createElement('div');
  title.className = 'u27-housing-keys-title';
  title.textContent = 'Property keys';
  title.id = `u27-housing-keys-title-${Math.random().toString(36).slice(2, 8)}`;
  const summary = document.createElement('p');
  summary.className = 'u27-housing-keys-summary';
  summary.textContent = overlay.dataset.u27HousingKeysPreview === 'true'
    ? 'Synthetic preview · no game action is sent. Add a CID or remove a saved keyholder.'
    : 'Add a CID or remove a saved keyholder. Up to 8 keyholders.';
  const back = [...addActions.querySelectorAll('.ui-button')].find(node => /^back$/i.test(node.textContent.trim()));
  const close = document.createElement('button');
  close.className = 'u27-housing-keys-close';
  close.type = 'button';
  close.textContent = 'Close';
  close.setAttribute('aria-label', 'Close property key access');
  close.addEventListener('click', () => back?.click());
  panel.setAttribute('aria-labelledby', title.id);
  nav.append(title, close, summary);

  const modes = document.createElement('div');
  modes.className = 'u27-housing-keys-modes';
  const addMode = document.createElement('button');
  const removeMode = document.createElement('button');
  addMode.type = removeMode.type = 'button';
  addMode.textContent = 'Add keyholder';
  removeMode.textContent = 'Remove access';
  addMode.setAttribute('aria-label', 'Add a keyholder');
  removeMode.setAttribute('aria-label', 'Remove a keyholder');
  modes.append(addMode, removeMode);

  // Keep every compiled Svelte control in place. The mode switch only hides its
  // inactive group; visible edits and commits still use the original bindings.
  panel.insertBefore(nav, panel.firstChild);
  panel.insertBefore(modes, nav.nextSibling);

  const labelExistingAction = (group, action) => {
    group.classList.add('u27-housing-keys-actions');
    group.dataset.keyAction = action;
    const controls = asArray([...group.querySelectorAll('.ui-button')]);
    controls.forEach(control => {
      if (/^back$/i.test(control.textContent.trim())) {
        control.hidden = true;
        control.setAttribute('aria-hidden', 'true');
        return;
      }
      const label = action === 'add' ? 'Add keyholder' : 'Remove keyholder';
      control.dataset.u27Label = label;
      control.setAttribute('role', 'button');
      control.setAttribute('tabindex', '0');
      control.setAttribute('aria-label', label);
      control.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        control.click();
      });
    });
  };
  labelExistingAction(addActions, 'add');
  labelExistingAction(removeActions, 'remove');

  fields.forEach((field, index) => {
    field.classList.add('u27-housing-key-field');
    field.dataset.keyAction = index === 0 ? 'add' : 'remove';
    const input = field.querySelector('input,select');
    if (index === 0) {
      input?.setAttribute('aria-label', 'Character ID to add');
      if (input && !input.placeholder) input.placeholder = 'Enter character ID';
    } else {
      input?.setAttribute('aria-label', 'Select keyholder to remove');
      if (input) input.placeholder = 'Select a keyholder';
    }
  });
  if (addHeading) addHeading.classList.add('u27-housing-keys-add-heading');
  divider?.classList.add('u27-housing-keys-divider');

  const setMode = (mode, focus = false) => {
    const adding = mode === 'add';
    addField.hidden = !adding;
    addActions.hidden = !adding;
    if (addHeading) addHeading.hidden = !adding;
    if (divider) divider.hidden = adding;
    removeField.hidden = adding;
    removeActions.hidden = adding;
    addMode.classList.toggle('is-selected', adding);
    removeMode.classList.toggle('is-selected', !adding);
    addMode.setAttribute('aria-pressed', String(adding));
    removeMode.setAttribute('aria-pressed', String(!adding));
    if (focus && adding) fields[0]?.querySelector('input')?.focus({ preventScroll: true });
    else if (focus) fields[1]?.querySelector('input')?.focus({ preventScroll: true });
  };
  addMode.addEventListener('click', () => setMode('add', true));
  removeMode.addEventListener('click', () => setMode('remove', true));
  setMode('add');

  overlay.dataset.u27HousingKeys = 'ready';
}

export function installLegacyHousingKeysAdapter(root = typeof document === 'undefined' ? null : document) {
  if (!root?.querySelectorAll || typeof MutationObserver === 'undefined') return () => {};

  const scan = () => {
    const overlays = asArray([...root.querySelectorAll('.phone-housing-keys')]);
    overlays.forEach(decorateOverlay);
    const dropdownHost = root.querySelector('#duo-dropdown');
    dropdownHost?.classList.toggle('u27-housing-key-dropdown', overlays.length > 0);
  };
  scan();
  const observer = new MutationObserver(scan);
  observer.observe(root.documentElement || root, { childList: true, subtree: true });
  return () => observer.disconnect();
}

export function mountLegacyHousingKeysPreview({ target, onAction = () => {} } = {}) {
  if (!target || typeof document === 'undefined') return () => {};
  const overlay = document.createElement('div');
  overlay.className = 'phone-housing-keys';
  overlay.dataset.u27HousingKeysPreview = 'true';
  const panel = document.createElement('div');
  panel.className = 'phone-housing-keys-container';
  const label = document.createElement('p');
  label.textContent = 'Add:';
  const addField = document.createElement('label');
  addField.className = 'textfield-component-container';
  const addTitle = document.createElement('p');
  addTitle.className = 'textfield-title';
  addTitle.textContent = 'CID';
  const addInput = document.createElement('input');
  addInput.placeholder = 'Enter synthetic character ID';
  addField.append(addTitle, addInput);
  const makeGroup = callback => {
    const group = document.createElement('div');
    group.className = 'phone-housing-keys-buttons';
    const back = document.createElement('div');
    back.className = 'ui-button warning';
    back.textContent = 'Back';
    back.addEventListener('click', () => onAction('Housing key preview close', {}));
    const primary = document.createElement('div');
    primary.className = 'ui-button success';
    primary.textContent = 'Confirm';
    primary.addEventListener('click', callback);
    group.append(back, primary);
    return group;
  };
  const addActions = makeGroup(() => onAction('Housing key preview add', { Cid: addInput.value }));
  const divider = document.createElement('hr');
  const removeField = document.createElement('label');
  removeField.className = 'textfield-component-container';
  const removeTitle = document.createElement('p');
  removeTitle.className = 'textfield-title';
  const removeInput = document.createElement('select');
  for (const [value, text] of [['synthetic-keyholder-1', 'Synthetic keyholder · Preview 01'], ['synthetic-keyholder-2', 'Synthetic keyholder · Preview 02']]) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = text;
    removeInput.append(option);
  }
  removeInput.setAttribute('aria-label', 'Synthetic preview keyholder selection');
  removeField.append(removeTitle, removeInput);
  const removeActions = makeGroup(() => onAction('Housing key preview remove', { Target: removeInput.value }));
  panel.append(label, addField, addActions, divider, removeField, removeActions);
  overlay.append(panel);
  target.append(overlay);
  decorateOverlay(overlay);
  overlay.querySelector('.u27-housing-keys-close')?.addEventListener('click', () => overlay.remove(), { once: true });
  return () => overlay.remove();
}
