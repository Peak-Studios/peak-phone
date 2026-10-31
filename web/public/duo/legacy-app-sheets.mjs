import { el } from './native-kit.mjs?rev=owner-config-20261015';
import { icon } from './icons.mjs?rev=owner-config-20261015';
import { installLegacyHousingKeysAdapter, mountLegacyHousingKeysPreview } from './legacy-housing-keys.mjs?rev=legacy-housing-keys-20261008b';
export { mountLegacyHousingKeysPreview };

if (typeof document !== 'undefined') installLegacyHousingKeysAdapter();

const rows = value => Array.isArray(value) ? value : [];
const inputKey = input => String(input?.Id ?? '');
const valueForOption = option => option?.ValueIsReal ? option.Value : (option?.Value || option?.Text);
const textOf = value => String(value ?? '');
const inputLabel = input => input?.Data?.Title || input?.Id?.replace(/([a-z])([A-Z])/g, '$1 $2') || 'Value';
const matchesValue = (left, right) => Object.is(left, right) || (left !== undefined && right !== undefined && String(left) === String(right));
const callbackSource = spec => [spec?.OnSubmit, spec?.OnCancel, ...rows(spec?.Buttons).map(item => item?.Cb)]
  .filter(callback => typeof callback === 'function').map(callback => String(callback)).join('\n');
const callbackAction = spec => {
  const source = callbackSource(spec);
  if (/PurchaseHouse|Housing\/PurchaseHouse/i.test(source)) return 'Purchase';
  if (/DeleteHouse|Housing\/DeleteHouse|DeleteDocument|Documents\/DeleteDocument/i.test(source)) return 'Delete';
  if (/ClaimHeist|BankBusters\/ClaimHeist/i.test(source)) return 'Claim';
  if (/CreateRace|Racing\/CreateRace/i.test(source)) return 'Create race';
  if (/JoinRace|Racing\/JoinRace/i.test(source)) return 'Join race';
  if (/SaveRaceTrack|Racing\/SaveRaceTrack/i.test(source)) return 'Save track';
  return '';
};

function actionButton(spec) {
  const buttons = rows(spec?.Buttons);
  if (!buttons.length) return null;
  const isCancel = item => /cancel|back|close/i.test(String(item?.Text || '')) || /warning|error/i.test(String(item?.Color || ''));
  return [...buttons].reverse().find(item => !isCancel(item)) || buttons.at(-1) || null;
}

function cancelButton(spec) {
  const buttons = rows(spec?.Buttons);
  return buttons.find(item => /cancel|back/i.test(String(item?.Text || '')) || /warning/i.test(String(item?.Color || ''))) || null;
}

function actionLabel(spec, fallback = 'Done') {
  return String(actionButton(spec)?.Text || callbackAction(spec) || fallback);
}
const button = (label, handler, className = '') => {
  const node = el('button', 'nx-button u27-legacy-button ' + className);
  node.type = 'button';
  node.textContent = label;
  node.setAttribute('aria-label', label);
  node.addEventListener('click', handler);
  return node;
};

function moneyValue(raw) {
  let value = String(raw || '').replace(/[^\d,.-]/g, '');
  const comma = value.lastIndexOf(','), dot = value.lastIndexOf('.');
  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? ',' : '.';
    value = value.replace(new RegExp(decimal === ',' ? '\\.' : ',', 'g'), '').replace(decimal, '.');
  } else if (comma >= 0) {
    value = value.replace(',', '.');
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export class LegacyAppSheets {
  constructor({ target, store, notify = () => {} }) {
    this.target = target;
    this.store = store;
    this.notify = notify;
    this.destroyed = false;
  }

  update(spec, appId) {
    if (!spec?.Visible) {
      this.clear();
      return;
    }
    if (this.spec === spec && this.appId === appId) return;
    this.clear();
    this.spec = spec;
    this.appId = appId;
    this.values = {};
    for (const input of rows(spec.Inputs)) {
      if (!input?.Id) continue;
      if (input.Type === 'MultiSelect') this.values[input.Id] = [];
      else if (input.Data?.Value) this.values[input.Id] = input.Data.Value;
    }
    this.render();
  }

  clear() {
    this.layer?.remove();
    this.layer = null;
    this.panel = null;
    this.spec = null;
  }

  dismiss({ cancel = false } = {}) {
    if (cancel) return this.invokeCancel();
    this.closeIfCurrent();
  }

  render() {
    const layer = el('div', 'u27-legacy-layer');
    layer.dataset.appForm = this.appId || 'unknown';
    const panel = el('section', 'u27-legacy-panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    this.layer = layer;
    this.panel = panel;

    const inputs = rows(this.spec?.Inputs);
    if (this.spec?.PreviewOnly) {
      const note = el('p', 'u27-legacy-preview-note', 'Synthetic preview · this fixture does not send a game action.');
      panel.append(note);
    }

    if (this.appId === 'cars' && inputs.some(input => input?.Id === 'Spot' && input?.Type === 'TextField')) {
      this.renderShowroomPosition(panel, inputs.find(input => input.Id === 'Spot'));
    } else if (this.appId === 'cars' && inputs.some(input => input?.Id === 'Cid') && inputs.some(input => input?.Id === 'Amount')) {
      this.renderShowroomOffer(panel, inputs);
    } else if (this.appId === 'bankbusters' && inputs.some(input => input?.Type === 'Text')) {
      this.renderHeistClaim(panel, inputs);
    } else if (this.appId === 'housing') {
      this.renderHousing(panel, inputs);
    } else if (this.appId === 'documents') {
      this.renderDocuments(panel, inputs);
    } else if (this.appId === 'racing' || this.appId === 'time-trials') {
      this.renderRacing(panel, inputs);
    } else {
      this.renderUnavailable(panel);
    }

    layer.append(panel);
    this.target.replaceChildren(layer);
    layer.addEventListener('pointerdown', event => {
      if (event.target === layer) this.dismiss();
    });
    layer.addEventListener('keydown', event => {
      if (event.key !== 'Tab') return;
      const nodes = [...panel.querySelectorAll('button,input,textarea,select,[tabindex="0"]')]
        .filter(node => !node.disabled && node.getClientRects().length);
      if (!nodes.length) return;
      const index = nodes.indexOf(document.activeElement);
      if (event.shiftKey && index <= 0) { event.preventDefault(); nodes.at(-1).focus(); }
      else if (!event.shiftKey && index === nodes.length - 1) { event.preventDefault(); nodes[0].focus(); }
    });
    queueMicrotask(() => panel.querySelector('button,input')?.focus());
  }

  nav(panel, title, primaryLabel, onAction, { cancelLabel = 'Cancel', hideCancel = false, destructive = false, ariaLabel = primaryLabel } = {}) {
    const nav = el('header', 'u27-legacy-nav');
    if (hideCancel) nav.append(el('span', 'u27-legacy-nav-spacer'));
    else nav.append(button(cancelLabel, () => this.dismiss({ cancel: true }), 'u27-legacy-cancel'));
    nav.append(el('h2', '', title));
    const action = button(primaryLabel, onAction, 'u27-legacy-done' + (destructive ? ' is-destructive' : ''));
    action.setAttribute('aria-label', ariaLabel);
    nav.append(action);
    panel.append(nav);
    return action;
  }

  card(glyph, title, detail) {
    const summary = el('section', 'u27-legacy-summary');
    const mark = el('span', 'u27-legacy-mark');
    mark.innerHTML = icon(glyph);
    const copy = el('div', 'u27-legacy-copy');
    copy.append(el('strong', '', title), el('span', '', detail));
    summary.append(mark, copy);
    return summary;
  }

  renderShowroomPosition(panel, input) {
    panel.classList.add('u27-legacy-showroom');
    const action = this.nav(panel, 'Display position', 'Set display', () => this.submit());
    panel.append(this.card('car', 'Showroom display', 'Choose a numbered position for this vehicle.'));
    panel.append(el('p', 'u27-legacy-section-label', 'AVAILABLE POSITIONS'));
    const choices = el('div', 'u27-legacy-position-list');
    const options = rows(input?.Data?.Select);
    for (const option of options) {
      const label = String(option?.Text ?? option?.Value ?? '');
      const value = String(option?.Value ?? option?.Text ?? '');
      if (!label || !value) continue;
      const select = button('Display position ' + label, () => {
        this.values.Spot = value;
        for (const item of choices.querySelectorAll('button')) {
          const selected = item === select;
          item.setAttribute('aria-pressed', String(selected));
          item.classList.toggle('is-selected', selected);
        }
        action.disabled = !this.values.Spot;
      }, 'u27-legacy-position');
      select.replaceChildren();
      select.append(el('span', 'u27-legacy-position-number', label), el('span', 'u27-legacy-position-caption', 'Display spot'));
      select.setAttribute('aria-label', 'Display position ' + label);
      select.setAttribute('aria-pressed', String(value === this.values.Spot));
      if (value === this.values.Spot) select.classList.add('is-selected');
      choices.append(select);
    }
    panel.append(choices);
    if (!choices.childElementCount) this.showError('No showroom positions are available. Refresh the showroom and try again.');
    action.disabled = !this.values.Spot;
  }

  renderShowroomOffer(panel, inputs) {
    panel.classList.add('u27-legacy-showroom', 'u27-legacy-offer');
    const text = inputs.filter(input => input?.Type === 'Text').map(input => String(input.Text || ''));
    const minimum = text.find(value => /^\s*Min:/i.test(value)) || '';
    const sale = text.find(value => /^\s*Sale:/i.test(value)) || '';
    const action = this.nav(panel, 'Sell vehicle', 'Sell', () => this.submit());
    panel.append(this.card('car', 'Vehicle sale', 'Enter the buyer’s character ID and a price including tax.'));
    const guide = el('dl', 'u27-legacy-price-guide');
    for (const [label, value] of [['Minimum price', minimum.replace(/^\s*Min:\s*/i, '')], ['Sale price', sale.replace(/^\s*Sale:\s*/i, '')]]) {
      if (!value) continue;
      const row = el('div', 'u27-legacy-price-row');
      row.append(el('dt', '', label), el('dd', '', value));
      guide.append(row);
    }
    if (guide.childElementCount) panel.append(guide);
    panel.append(el('p', 'u27-legacy-section-label', 'BUYER AND PRICE'));

    const fields = el('div', 'u27-legacy-fields');
    const cid = this.textField('Cid', 'Character ID', 'text', 'Enter buyer CID');
    const amount = this.textField('Amount', 'Price including tax', 'text', 'Enter sale price');
    amount.input.inputMode = 'decimal';
    fields.append(cid.wrapper, amount.wrapper);
    panel.append(fields);
    const error = el('p', 'u27-legacy-error');
    error.hidden = true;
    error.setAttribute('role', 'alert');
    panel.append(error);
    const min = moneyValue(minimum);
    action.addEventListener('click', event => {
      event.stopImmediatePropagation();
      const cidValue = cid.input.value.trim();
      const amountValue = amount.input.value.trim();
      const numeric = moneyValue(amountValue);
      let message = '';
      if (!cidValue) message = 'Enter the buyer’s character ID.';
      else if (!amountValue || numeric === null) message = 'Enter a valid sale price.';
      else if (min !== null && numeric < min) message = 'The sale price must meet the minimum shown above.';
      if (message) {
        error.textContent = message;
        error.hidden = false;
        (cidValue ? amount.input : cid.input).focus();
        return;
      }
      this.values.Cid = cidValue;
      this.values.Amount = amountValue;
      this.submit();
    }, { capture: true });
  }

  textField(key, label, type, placeholder) {
    const wrapper = el('label', 'u27-legacy-field');
    wrapper.append(el('span', '', label));
    const input = el('input');
    input.type = type;
    input.value = String(this.values[key] ?? '');
    input.placeholder = placeholder;
    input.autocomplete = 'off';
    input.addEventListener('input', () => { this.values[key] = input.value; });
    wrapper.append(input);
    return { wrapper, input };
  }

  renderHeistClaim(panel, inputs) {
    panel.classList.add('u27-legacy-heist');
    const action = this.nav(panel, 'Claim heist', 'Claim', () => this.submit());
    const confirmation = inputs.find(input => input?.Type === 'Text');
    panel.append(this.card('landmark', 'Claim the selected heist?', String(confirmation?.Text || 'Confirm this claim.')));
    panel.append(el('p', 'u27-legacy-note', 'The server checks availability and records the claim.'));
    action.setAttribute('aria-label', 'Claim selected heist');
  }

  renderUnavailable(panel) {
    panel.classList.add('u27-legacy-unavailable');
    this.nav(panel, 'Action unavailable', 'Close', () => this.dismiss());
    panel.append(this.card('alert', 'This app action needs an updated editor.', 'Close this sheet and reopen the app. No game action was sent.'));
    panel.append(el('p', 'u27-legacy-note', `Peak Duo does not have an app-specific editor for ${this.appId || 'this application'} yet.`));
  }

  invokeCancel() {
    const spec = this.spec;
    try {
      const cancel = cancelButton(spec);
      if (cancel?.Cb) cancel.Cb({ ...this.values });
      else spec?.OnCancel?.({ ...this.values });
    } catch (error) {
      this.showError(error.message || 'The action could not be cancelled.');
      return;
    }
    this.closeIfCurrent(spec);
  }

  invokePrimary() {
    const spec = this.spec;
    try {
      const primary = actionButton(spec);
      if (rows(spec?.Buttons).length) primary?.Cb?.({ ...this.values });
      else spec?.OnSubmit?.({ ...this.values });
    } catch (error) {
      this.showError(error.message || 'The action could not be completed.');
      this.notify(error.message || 'The action could not be completed.');
      return;
    }
    this.closeIfCurrent(spec);
  }

  closeIfCurrent(spec = this.spec) {
    // A callback may synchronously open the next app-specific sheet. The old
    // sheet must not close that replacement while unwinding its own callback.
    if (!this.destroyed && this.spec === spec) this.store?.set({ Visible: false });
  }

  context(panel, glyph, title, detail) {
    panel.append(this.card(glyph, title, detail));
  }

  formSection(panel, title, inputs) {
    const section = el('section', 'u27-legacy-section');
    section.append(el('h3', 'u27-legacy-section-label', title));
    const list = el('div', 'u27-legacy-control-list');
    for (const input of inputs) {
      const control = this.inputControl(input);
      if (control) list.append(control);
    }
    if (list.childElementCount) section.append(list);
    panel.append(section);
    return section;
  }

  inputControl(input) {
    if (!input?.Id || !input?.Data) return null;
    const key = inputKey(input);
    const data = input.Data || {};
    const label = inputLabel(input);

    if (input.Type === 'TextField' && Array.isArray(data.Select) && data.Select.length) {
      const group = el('div', 'u27-legacy-picker');
      group.append(el('div', 'u27-legacy-picker-title', label));
      if (data.Sub) group.append(el('p', 'u27-legacy-field-note', data.Sub));
      const options = el('div', 'u27-legacy-picker-options');
      for (const option of data.Select) {
        const value = valueForOption(option);
        const text = textOf(option?.Text ?? option?.Value);
        if (!text) continue;
        const choice = button(text, () => {
          this.values[key] = value;
          for (const item of options.querySelectorAll('button')) {
            const selected = item === choice;
            item.classList.toggle('is-selected', selected);
            item.setAttribute('aria-pressed', String(selected));
          }
        }, 'u27-legacy-choice');
        const selected = matchesValue(this.values[key], value);
        choice.classList.toggle('is-selected', selected);
        choice.setAttribute('aria-pressed', String(selected));
        options.append(choice);
      }
      group.append(options);
      return group;
    }

    if (input.Type === 'Checkbox') {
      const row = el('button', 'u27-legacy-switch-row');
      row.type = 'button';
      const labelNode = el('span', 'u27-legacy-switch-label', data.Title || label);
      const checked = !!this.values[key];
      const track = el('span', 'u27-legacy-switch');
      track.setAttribute('aria-hidden', 'true');
      row.append(labelNode, track);
      row.setAttribute('role', 'switch');
      row.setAttribute('aria-checked', String(checked));
      row.addEventListener('click', () => {
        this.values[key] = !this.values[key];
        row.setAttribute('aria-checked', String(!!this.values[key]));
      });
      return row;
    }

    if (input.Type === 'MultiSelect') {
      const group = el('div', 'u27-legacy-picker');
      group.append(el('div', 'u27-legacy-picker-title', data.Title || label));
      const options = el('div', 'u27-legacy-picker-options');
      const selected = Array.isArray(this.values[key]) ? this.values[key] : [];
      for (const option of rows(data.Options)) {
        const value = option?.Value;
        const text = textOf(option?.Text ?? value);
        const choice = button(text, () => {
          const current = Array.isArray(this.values[key]) ? [...this.values[key]] : [];
          const index = current.findIndex(item => matchesValue(item, value));
          if (index >= 0) current.splice(index, 1);
          else if (!data.MaxSelections || current.length < data.MaxSelections) current.push(value);
          this.values[key] = current;
          choice.classList.toggle('is-selected', current.some(item => matchesValue(item, value)));
          choice.setAttribute('aria-pressed', String(current.some(item => matchesValue(item, value))));
          count.textContent = `${current.length}${data.MaxSelections ? ` / ${data.MaxSelections}` : ''}`;
        }, 'u27-legacy-choice');
        const active = selected.some(item => matchesValue(item, value));
        choice.classList.toggle('is-selected', active);
        choice.setAttribute('aria-pressed', String(active));
        options.append(choice);
      }
      const count = el('span', 'u27-legacy-selection-count', `${selected.length}${data.MaxSelections ? ` / ${data.MaxSelections}` : ''}`);
      group.append(count, options);
      return group;
    }

    if (input.Type === 'TextArea') {
      const wrapper = el('label', 'u27-legacy-input-row u27-legacy-textarea-row');
      wrapper.append(el('span', '', label));
      const area = el('textarea');
      area.value = textOf(this.values[key] ?? data.Value);
      area.placeholder = textOf(data.Placeholder);
      area.maxLength = Number(data.MaxLength) || 999;
      area.addEventListener('input', () => { this.values[key] = area.value; });
      wrapper.append(area);
      return wrapper;
    }

    if (input.Type !== 'TextField') return null;
    const wrapper = el('label', 'u27-legacy-input-row');
    const title = el('span', '', label);
    wrapper.append(title);
    const value = el('input');
    value.type = ['number', 'password', 'email', 'tel'].includes(data.Type) ? data.Type : 'text';
    value.value = textOf(this.values[key] ?? data.Value);
    value.placeholder = textOf(data.Placeholder);
    value.autocomplete = 'off';
    value.maxLength = Number(data.MaxLength) || 999;
    value.readOnly = !!data.ReadOnly;
    value.inputMode = input.IsCurrency || value.type === 'number' ? 'decimal' : 'text';
    if (data.Type === 'number') value.step = 'any';
    if (data.Sub) wrapper.append(el('small', 'u27-legacy-field-note', data.Sub));
    value.addEventListener('input', () => { this.values[key] = value.value; });
    wrapper.append(value);
    return wrapper;
  }

  displayMessage(panel, { title, glyph = 'home', detail = '', action = 'Okay', destructive = false }) {
    const submit = () => this.invokePrimary();
    this.nav(panel, title, actionLabel(this.spec, action), submit, { destructive });
    this.context(panel, glyph, title, detail);
  }

  renderHousing(panel, inputs) {
    const text = inputs.filter(input => input?.Type === 'Text').map(input => textOf(input.Text));
    const fields = inputs.filter(input => input?.Type === 'TextField');
    const keys = new Set(fields.map(inputKey));
    const summaryIndex = text.findIndex(value => /^\s*Address:\s*$/i.test(value));

    if (summaryIndex >= 0) {
      this.nav(panel, 'Property at this location', actionLabel(this.spec, 'Done'), () => this.invokePrimary());
    this.context(panel, 'home', 'Property details', 'Location and pricing returned by the property service.');
      const details = el('dl', 'u27-legacy-property-details');
      for (let index = 0; index < text.length; index++) {
        const label = text[index].replace(/:\s*$/, '').trim();
        const next = text[index + 1];
        if (/^(Address|Category|Price)$/i.test(label) && next !== undefined) {
          const row = el('div', 'u27-legacy-property-row');
          row.append(el('dt', '', label), el('dd', '', next));
          details.append(row);
          index++;
        }
      }
      if (details.childElementCount) panel.append(details);
      return;
    }

    if (keys.has('Cid') && keys.has('Commission')) {
      this.nav(panel, 'Sell a property', actionLabel(this.spec, 'Review sale'), () => this.invokePrimary());
      this.context(panel, 'home', 'Sale terms', 'Set the buyer and realtor commission for the property at your current location.');
      panel.append(el('p', 'u27-legacy-section-label', 'BUYER'));
      panel.append(this.inputControl(fields.find(input => input.Id === 'Cid')));
      panel.append(el('p', 'u27-legacy-section-label', 'COMMISSION'));
      panel.append(this.inputControl(fields.find(input => input.Id === 'Commission')));
      return;
    }

    if (keys.has('Class') || (keys.has('Tier') && keys.has('Price'))) {
      const editing = keys.has('Tier') && keys.has('Price');
      const housingAction = actionLabel(this.spec, editing ? 'Save changes' : 'Add location');
      this.nav(panel, editing ? 'Edit property' : 'Add property location', editing ? 'Save' : housingAction, () => this.invokePrimary(), { ariaLabel: housingAction });
      this.context(panel, 'building', editing ? 'Property details' : 'Property category', editing ? 'Choose a tier and set the asking price.' : 'Choose the class for this location.');
      if (editing) {
        this.formSection(panel, 'PROPERTY TIER', [fields.find(input => input.Id === 'Tier')]);
        this.formSection(panel, 'ASKING PRICE', [fields.find(input => input.Id === 'Price')]);
      } else {
        this.formSection(panel, 'PROPERTY CLASS', [fields.find(input => input.Id === 'Class')]);
      }
      return;
    }

    const message = text.join(' ').trim();
    const source = callbackSource(this.spec);
    const nearCheck = /You must be near the property/i.test(message);
    const purchaseCheck = /Are you sure/i.test(message) && /PurchaseHouse|Housing\/PurchaseHouse/i.test(source);
    const title = nearCheck ? 'Property access' : /No property found/i.test(message) ? 'No property found' : /Maximum number of keys/i.test(message) ? 'Key limit reached' : purchaseCheck ? 'Purchase property?' : /Are you sure/i.test(message) ? (callbackAction(this.spec) === 'Delete' ? 'Delete property' : 'Confirm property action') : 'Housing update';
    this.displayMessage(panel, {
      title,
      glyph: /near|property found/i.test(message) ? 'navigation' : 'home',
      detail: purchaseCheck ? 'Confirm the property details and price supplied by Housing to continue.' : message || 'Review this property action before continuing.',
      action: callbackAction(this.spec) || (nearCheck ? 'Okay' : 'Confirm'),
      destructive: callbackAction(this.spec) === 'Delete',
    });
    if (!source && !message) this.showError('This Housing action did not include a description.');
  }

  renderDocuments(panel, inputs) {
    const text = inputs.filter(input => input?.Type === 'Text').map(input => textOf(input.Text));
    const fields = inputs.filter(input => input?.Type === 'TextField');
    const source = callbackSource(this.spec);
    const intent = /RequestSignature/i.test(source) ? 'Request signature' : /AddSharee|PermanentShare/i.test(source) ? 'Share document' : /DeleteDocument/i.test(source) ? 'Delete document' : /FinalizeDocument/i.test(source) ? 'Finalize document' : 'Document access';

    if (fields.some(input => input.Id === 'Cid')) {
      const title = intent === 'Document access' ? 'Share document' : intent;
      const action = intent === 'Request signature' ? 'Request' : 'Share';
      this.nav(panel, title, action, () => this.invokePrimary());
      this.context(panel, 'notebook', intent === 'Request signature' ? 'Signature request' : 'Document access', 'Use the character ID for the person who should receive document access.');
      this.formSection(panel, 'RECIPIENT', fields);
      return;
    }

    const message = text.join(' ').trim() || 'The document service returned an update.';
    const destructive = intent === 'Delete document' || /cannot be undone/i.test(message);
    this.displayMessage(panel, {
      title: intent === 'Document access' ? 'Document status' : intent,
      glyph: destructive ? 'trash' : 'notebook',
      detail: message,
      action: callbackAction(this.spec) || (destructive ? 'Delete' : 'Okay'),
      destructive,
    });
  }

  renderRacing(panel, inputs) {
    const fields = inputs.filter(input => input?.Type === 'TextField' || input?.Type === 'Checkbox' || input?.Type === 'MultiSelect' || input?.Type === 'TextArea');
    const keys = new Set(fields.map(inputKey));
    const text = inputs.filter(input => input?.Type === 'Text').map(input => textOf(input.Text));

    if (keys.has('Password') && keys.size === 1) {
      this.nav(panel, 'Join private race', actionLabel(this.spec, 'Join race'), () => this.invokePrimary());
      this.context(panel, 'lock', 'Private race', 'Enter the password supplied by the race host.');
      this.formSection(panel, 'RACE PASSWORD', fields);
      return;
    }

    if (keys.has('Name') && (keys.has('Countdown') || keys.has('CheckpointPenalty') || keys.has('Class'))) {
      this.nav(panel, 'Create race', actionLabel(this.spec, 'Create race'), () => this.invokePrimary());
      this.context(panel, 'flag', 'Race setup', 'Set the event format, timing, and driving rules.');
      const groups = [
        ['EVENT DETAILS', ['Name', 'Alias', 'Class']],
        ['FORMAT & REWARD', ['Laps', 'Amount']],
        ['START & PENALTIES', ['Countdown', 'DNFPosition', 'DNFCountdown', 'CheckpointPenalty', 'Phasing', 'Password']],
        ['DRIVING RULES', ['Reverse', 'ShowPosition', 'SendNotification', 'ForceFPP', 'AllowNitrous', 'FreezeStart']],
      ];
      for (const [title, ids] of groups) this.formSection(panel, title, ids.map(id => fields.find(input => input.Id === id)).filter(Boolean));
      return;
    }

    if (keys.has('Name') && keys.has('Type')) {
      this.nav(panel, 'Save track', actionLabel(this.spec, 'Save track'), () => this.invokePrimary());
      this.context(panel, 'navigation', 'Track details', 'Name this route and choose sprint or lap format.');
      this.formSection(panel, 'ROUTE', fields.filter(input => ['Name', 'Type'].includes(input.Id)));
      this.formSection(panel, 'LAP SETTINGS', fields.filter(input => input.Id === 'MinLaps'));
      return;
    }

    const message = text.join(' ').trim() || 'The race service returned an update.';
    this.displayMessage(panel, { title: 'Race update', glyph: 'flag', detail: message, action: callbackAction(this.spec) || 'Okay' });
  }

  showError(message) {
    if (!this.panel) return;
    let error = this.panel.querySelector('.u27-legacy-error');
    if (!error) {
      error = el('p', 'u27-legacy-error');
      error.setAttribute('role', 'alert');
      this.panel.append(error);
    }
    error.textContent = message;
    error.hidden = false;
  }

  submit() {
    this.invokePrimary();
  }

  $destroy() {
    this.destroyed = true;
    this.clear();
    this.target?.replaceChildren();
  }
}

export function legacyEditorFixtures({ onAction = () => {} } = {}) {
  const preview = spec => ({ ...spec, Visible: true, PreviewOnly: true });
  function CarsSetDisplay(values) { onAction('Cars/SetDisplay', { Vehicle: 'synthetic-showroom-vehicle', ...values }); }
  function CarsSell(values) { onAction('Cars/Sell', { ...values }); }
  function BankBustersClaimHeist(values) { onAction('BankBusters/ClaimHeist', { HeistId: 1, ...values }); }
  function HousingPurchaseHouse(values) { onAction('Housing/PurchaseHouse', { HouseId: 'synthetic-property-id', ...values }); }
  function HousingSellLocation(values) { onAction('Housing/SellLocation', { ...values }); }
  function HousingCreateHouse(values) { onAction('Housing/CreateHouse', { ...values }); }
  function HousingEditHouse(values) { onAction('Housing/EditHouse', { ...values }); }
  function HousingNearProperty(values) { onAction('Housing/ProximityNotice', { ...values }); }
  function HousingNoProperty(values) { onAction('Housing/NoPropertyNotice', { ...values }); }
  function DocumentsAddSharee(values) { onAction('Documents/AddSharee', { Id: 'synthetic-document-id', ...values }); }
  function DocumentsRequestSignature(values) { onAction('Documents/RequestSignature', { Id: 'synthetic-document-id', ...values }); }
  function DocumentsDeleteDocument(values) { onAction('Documents/DeleteDocument', { Id: 'synthetic-document-id', ...values }); }
  function RacingCreateRace(values) { onAction('Racing/CreateRace', { ...values, Type: 'synthetic-track-type', TrackId: 'synthetic-track-id' }); }
  function RacingSaveRaceTrack(values) { onAction('Racing/SaveRaceTrack', { ...values }); }
  function RacingJoinRace(values) { onAction('Racing/JoinRace', { Id: 'synthetic-race-id', ...values }); }
  const cancel = label => values => onAction(label, { ...values });

  return [
    {
      appId: 'housing',
      label: 'Housing · Purchase property summary',
      spec: preview({
        Inputs: [
          { Type: 'Text', Text: 'Address:' }, { Type: 'Text', Text: 'Synthetic preview location · not a real address' },
          { Type: 'Text', Text: 'Category:' }, { Type: 'Text', Text: 'Synthetic property class' },
          { Type: 'Text', Text: 'Price:' }, { Type: 'Text', Text: '$245,000 · synthetic' },
        ],
        Buttons: [
          { Color: 'warning', Text: 'Cancel', Cb: cancel('Housing summary cancelled') },
          { Color: 'success', Text: 'Buy', Cb: HousingPurchaseHouse },
        ],
      }),
    },
    {
      appId: 'housing',
      label: 'Housing · Sale terms',
      spec: preview({
        Inputs: [
          { Id: 'Cid', Type: 'TextField', Data: { Title: 'CID', Icon: 'id-card', Value: '' } },
          { Id: 'Commission', Type: 'TextField', Data: { Title: 'Commission (Example: 20, not 0.3 etc)', Icon: 'highlighter', Type: 'number', Value: '' } },
        ],
        OnSubmit: HousingSellLocation,
      }),
    },
    {
      appId: 'housing',
      label: 'Housing · Add property location',
      spec: preview({
        Inputs: [{ Id: 'Class', Type: 'TextField', Data: { Title: 'Tier', ReadOnly: true, Select: ['Low Tier', 'Mid Tier', 'High Tier', 'Top Tier', 'Extreme Tier'].map((Text, Value) => ({ Text, Value, ValueIsReal: true })) } }],
        OnSubmit: HousingCreateHouse,
      }),
    },
    {
      appId: 'housing',
      label: 'Housing · Edit property tier and price',
      spec: preview({
        Inputs: [
          { Id: 'Tier', Type: 'TextField', Data: { Title: 'Tier', ReadOnly: true, Select: [{ Text: '(3) General House', Value: 3 }, { Text: '(6) Trevors Camper', Value: 6 }, { Text: '(9) Lesters House', Value: 9 }] } },
          { Id: 'Price', Type: 'TextField', IsCurrency: true, Data: { Title: 'Price', Icon: 'sign', Sub: '$0.00 · synthetic value preview', Type: 'number', Value: '' } },
        ],
        OnSubmit: HousingEditHouse,
      }),
    },
    {
      appId: 'housing',
      label: 'Housing · Property proximity required',
      spec: preview({ Inputs: [{ Type: 'Text', Text: 'You must be near the property to do this!' }], Buttons: [{ Color: 'success', Text: 'Okay', Cb: HousingNearProperty }] }),
    },
    {
      appId: 'housing',
      label: 'Housing · Confirm purchase',
      spec: preview({ Inputs: [{ Type: 'Text', Text: 'Are you sure?' }], OnSubmit: HousingPurchaseHouse }),
    },
    {
      appId: 'housing',
      label: 'Housing · No property at location',
      spec: preview({ Inputs: [{ Type: 'Text', Text: 'No property found at current location.' }], Buttons: [{ Color: 'success', Text: 'Okay', Cb: HousingNoProperty }] }),
    },
    {
      appId: 'documents',
      label: 'Documents · Share with recipient',
      spec: preview({
        Inputs: [{ Id: 'Cid', Type: 'TextField', Data: { Title: 'CID', Icon: 'id-card', Value: '' } }],
        OnSubmit: DocumentsAddSharee,
      }),
    },
    {
      appId: 'documents',
      label: 'Documents · Request signature',
      spec: preview({
        Inputs: [{ Id: 'Cid', Type: 'TextField', Data: { Title: 'CID', Icon: 'id-card', Value: '' } }],
        OnSubmit: DocumentsRequestSignature,
      }),
    },
    {
      appId: 'documents',
      label: 'Documents · Delete confirmation',
      spec: preview({
        Inputs: [{ Type: 'Text', Text: 'Are you sure? This cannot be undone.' }],
        OnSubmit: DocumentsDeleteDocument,
      }),
    },
    {
      appId: 'racing',
      label: 'Racing · Create race (long form)',
      spec: preview({
        Inputs: [
          { Id: 'Name', Type: 'TextField', Data: { Title: 'Event name', Value: 'Synthetic preview event' } },
          { Id: 'Alias', Type: 'TextField', Data: { Title: 'Alias', Value: 'Synthetic racer', ReadOnly: true } },
          { Id: 'Class', Type: 'TextField', Data: { Title: 'Vehicle class', Value: 'A', Select: ['Open', 'S', 'A', 'B', 'C', 'D', 'E', 'M'].map(Text => ({ Text })) } },
          { Id: 'Laps', Type: 'TextField', Data: { Title: 'Laps', Type: 'number', Value: '6' } },
          { Id: 'Amount', Type: 'TextField', Data: { Title: 'Reward amount', Type: 'number', Value: '2500' } },
          { Id: 'Countdown', Type: 'TextField', Data: { Title: 'Start countdown', Type: 'number', Value: '30' } },
          { Id: 'DNFPosition', Type: 'TextField', Data: { Title: 'DNF position', Type: 'number', Value: '5' } },
          { Id: 'DNFCountdown', Type: 'TextField', Data: { Title: 'DNF countdown', Type: 'number', Value: '90' } },
          { Id: 'CheckpointPenalty', Type: 'TextField', Data: { Title: 'Checkpoint penalty', Type: 'number', Value: '15' } },
          { Id: 'Phasing', Type: 'TextField', Data: { Title: 'Phasing', Value: '30', RealValue: '30 Seconds', Select: [{ Value: 'None', Text: 'None' }, { Value: '30', Text: '30 Seconds' }, { Value: '60', Text: '60 Seconds' }, { Value: '90', Text: '90 Seconds' }, { Value: 'Full', Text: 'Full' }] } },
          { Id: 'Password', Type: 'TextField', Data: { Title: 'Password', Type: 'password', Value: 'preview-only' } },
          { Id: 'Reverse', Type: 'Checkbox', Data: { Title: 'Reversed', Value: false } },
          { Id: 'ShowPosition', Type: 'Checkbox', Data: { Title: 'Show position', Value: true } },
          { Id: 'SendNotification', Type: 'Checkbox', Data: { Title: 'Send notification', Value: false } },
          { Id: 'ForceFPP', Type: 'Checkbox', Data: { Title: 'Force first-person view', Value: false } },
          { Id: 'AllowNitrous', Type: 'Checkbox', Data: { Title: 'Allow nitrous', Value: true } },
          { Id: 'FreezeStart', Type: 'Checkbox', Data: { Title: 'Freeze during countdown', Value: false } },
        ],
        OnSubmit: RacingCreateRace,
      }),
    },
    {
      appId: 'racing',
      label: 'Racing · Save track picker',
      spec: preview({
        Inputs: [
          { Id: 'Name', Type: 'TextField', Data: { Title: 'Track name', Value: 'Synthetic preview route' } },
          { Id: 'Type', Type: 'TextField', Data: { Title: 'Format', Value: 'Sprint', Select: [{ Text: 'Sprint' }, { Text: 'Laps' }] } },
          { Id: 'MinLaps', Type: 'TextField', Data: { Title: 'Minimum laps', Sub: 'Only required for a lap route.', Type: 'number', Value: '3' } },
        ],
        OnSubmit: RacingSaveRaceTrack,
      }),
    },
    {
      appId: 'racing',
      label: 'Racing · Join private race',
      spec: preview({
        Inputs: [{ Id: 'Password', Type: 'TextField', Data: { Title: 'Race password', Icon: 'user-lock', Type: 'password', Value: 'preview-only' } }],
        OnSubmit: RacingJoinRace,
      }),
    },
    {
      appId: 'cars',
      label: 'Showroom · display position picker',
      spec: preview({
        Inputs: [{ Id: 'Spot', Type: 'TextField', Data: { Title: 'Display position', ReadOnly: true, Value: '', Select: [{ Text: '1', Value: '1' }, { Text: '2', Value: '2' }, { Text: '3', Value: '3' }] } }],
        OnSubmit: CarsSetDisplay,
      }),
    },
    {
      appId: 'cars',
      label: 'Showroom · vehicle sale offer',
      spec: preview({
        Inputs: [
          { Type: 'Text', Text: 'Min: $50,000 · synthetic' },
          { Type: 'Text', Text: 'Sale: $75,000 · synthetic' },
          { Id: 'Cid', Type: 'TextField', Data: { Title: 'Buyer character ID', Value: '' } },
          { Id: 'Amount', Type: 'TextField', Data: { Title: 'Price including tax', Value: '' } },
        ],
        OnSubmit: CarsSell,
      }),
    },
    {
      appId: 'bankbusters',
      label: 'Bank Busters · claim heist',
      spec: preview({
        Inputs: [{ Type: 'Text', Text: 'Synthetic heist preview. Claiming will only write to the preview action log.' }],
        OnSubmit: BankBustersClaimHeist,
      }),
    },
  ];
}
