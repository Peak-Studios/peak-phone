const SVG_NS = 'http://www.w3.org/2000/svg';
const el = (tag, cls = '', text = '') => {
  const node = document.createElement(tag);
  node.className = cls;
  if (text) node.textContent = text;
  return node;
};
const svg = (tag, attrs = {}) => {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
};
const initials = name => String(name || 'Nearby player')
  .trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || '•';
const isTerminal = phase => ['complete', 'cancelled', 'failed'].includes(phase);
const phaseOrder = { offer: 0, approach: 1, animation: 2, transfer: 2, complete: 3, cancelled: 3, failed: 3 };
const validLocation = value => value?.type === 'location' && Number.isFinite(Number(value.x)) && Number.isFinite(Number(value.y)) &&
  Number(value.x) >= -10000 && Number(value.x) <= 10000 && Number(value.y) >= -10000 && Number(value.y) <= 15000;

function airDropMark() {
  const mark = svg('svg', { class: 'sd-airdrop-mark', viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true' });
  for (const d of [
    'M2.9 16A10 10 0 1 1 21.1 16',
    'M6.73 16A6.5 6.5 0 1 1 17.27 16',
    'M10.63 15A3.3 3.3 0 1 1 13.37 15'
  ]) mark.append(svg('path', { d }));
  mark.append(svg('circle', { cx: '12', cy: '12', r: '.8', fill: 'currentColor', stroke: 'none' }));
  mark.append(svg('path', { d: 'm9.9 20.5 2.1-3.6 2.1 3.6Z', fill: 'currentColor', stroke: 'none' }));
  return mark;
}

export class ShareDrop {
  constructor({ target, send, notify }) {
    Object.assign(this, { send, notify });
    this.enabled = false;
    this.generation = 0;
    this.requestSerial = 0;
    this.outgoingRequest = null;
    this.contactButtons = [];
    this.node = el('aside', 'duo-sharedrop');
    this.node.hidden = true;
    this.node.role = 'dialog';
    this.node.tabIndex = -1;
    this.node.setAttribute('aria-modal', 'true');
    this.node.setAttribute('aria-label', 'ShareDrop');

    this.panel = el('div', 'sd-panel');
    this.header = el('header', 'sd-header');
    this.brand = el('span', 'sd-brand', 'SHAREDROP');
    this.closeButton = el('button', 'sd-close', '×');
    this.closeButton.type = 'button';
    this.closeButton.setAttribute('aria-label', 'Cancel ShareDrop');
    this.closeButton.addEventListener('click', () => this.cancel());
    this.header.append(this.brand, this.closeButton);

    this.hero = el('div', 'sd-hero');
    this.orbit = el('div', 'sd-orbit');
    this.orbit.setAttribute('aria-hidden', 'true');
    const track = svg('circle', { class: 'sd-progress-track', cx: '50', cy: '50', r: '45' });
    const value = svg('circle', { class: 'sd-progress-value', cx: '50', cy: '50', r: '45' });
    const ring = svg('svg', { class: 'sd-progress-ring', viewBox: '0 0 100 100', fill: 'none', 'aria-hidden': 'true' });
    ring.append(track, value);
    this.orbit.append(ring, airDropMark());
    this.photo = el('img', 'sd-photo');
    this.photo.alt = 'Photo being shared';
    this.photo.referrerPolicy = 'no-referrer';
    this.photo.hidden = true;
    this.hero.append(this.orbit, this.photo);

    this.eyebrow = el('p', 'sd-eyebrow');
    this.title = el('h2', 'sd-title');
    this.title.id = 'sharedrop-title';
    this.node.setAttribute('aria-labelledby', this.title.id);
    this.caption = el('p', 'sd-caption');
    this.caption.setAttribute('aria-live', 'polite');
    this.peer = el('div', 'sd-peer');
    this.peerAvatar = el('span', 'sd-avatar');
    this.peerAvatar.setAttribute('aria-hidden', 'true');
    this.peerCopy = el('span', 'sd-peer-copy');
    this.peerName = el('strong', '', 'Nearby player');
    this.peerDetail = el('span', '', 'Ready to connect');
    this.peerCopy.append(this.peerName, this.peerDetail);
    this.peer.append(this.peerAvatar, this.peerCopy);
    this.peer.hidden = true;

    this.contacts = el('div', 'sd-contacts');
    this.contacts.hidden = true;
    this.contactHeading = el('p', 'sd-contact-heading', 'NEARBY PHONES');
    this.contactList = el('div', 'sd-contact-list');
    this.contacts.append(this.contactHeading, this.contactList);

    this.progress = el('div', 'sd-progress');
    this.progress.setAttribute('role', 'progressbar');
    this.progress.setAttribute('aria-label', 'Share progress');
    this.progress.setAttribute('aria-valuemin', '0');
    this.progress.setAttribute('aria-valuemax', '100');
    this.progress.setAttribute('aria-valuenow', '0');
    this.progress.hidden = true;
    this.progressTrack = el('span', 'sd-progress-bar-track');
    this.progressFill = el('span', 'sd-progress-bar-fill');
    this.progressTrack.append(this.progressFill);
    this.progress.append(this.progressTrack);

    this.actions = el('div', 'sd-actions');
    this.panel.append(this.header, this.hero, this.eyebrow, this.title, this.caption,
      this.peer, this.contacts, this.progress, this.actions);
    this.node.append(this.panel);
    target.append(this.node);

    this.listener = event => {
      if (event.source && event.source !== window && event.source !== window.parent) return;
      const data = event.data;
      if (data?.Action === 'ShareDrop/Phase') this.phase(data.Data);
      if (data?.Action === 'ShareDrop/Transfer') this.animate(data);
      if (data?.Action === 'ClosePhone') this.cancel();
      if (data?.Action === 'Duo/Reset' || data?.Action === 'Duo/FactoryReset') {
        this.enabled = false;
        this.cancel();
      }
    };
    window.addEventListener('message', this.listener);
    this.request = event => this.choose(event.detail);
    window.addEventListener('duo:sharedrop', this.request);
    this.locationRequest = event => this.chooseLocation(event.detail);
    window.addEventListener('duo:sharedrop-location', this.locationRequest);
  }

  async toggle() {
    const result = await this.send('ShareDrop/Enabled', { Enabled: !this.enabled });
    if (!result?.Success) throw Error(result?.Error || 'ShareDrop could not be changed.');
    this.enabled = result.Enabled;
    return this.enabled;
  }

  button(label, run, className = '', isCurrent = () => true) {
    const button = el('button', `sd-action ${className}`, label);
    button.type = 'button';
    button.addEventListener('click', async () => {
      button.disabled = true;
      try { await run(); }
      catch (error) { if (isCurrent()) this.notify(error.message); }
      finally { button.disabled = false; }
    });
    this.actions.append(button);
    return button;
  }

  setPeer(name, detail = 'Nearby phone') {
    if (!name) {
      this.peer.hidden = true;
      return;
    }
    this.peer.hidden = false;
    this.peerAvatar.textContent = initials(name);
    this.peerName.textContent = name;
    this.peerDetail.textContent = detail;
  }

  setPhoto(url) {
    if (typeof url === 'string' && /^https:\/\//i.test(url)) {
      this.photo.src = url;
      this.photo.hidden = false;
      this.hero.classList.add('has-photo');
    } else {
      this.photo.removeAttribute('src');
      this.photo.hidden = true;
      this.hero.classList.remove('has-photo');
    }
  }

  show(title, caption, { eyebrow = 'SHAREDROP', peerName = '', peerDetail, photoUrl = this.photoUrl } = {}) {
    if (this.node.hidden) this.previousFocus = document.activeElement;
    this.title.textContent = title;
    this.caption.textContent = caption;
    this.eyebrow.textContent = eyebrow;
    this.actions.replaceChildren();
    this.contacts.hidden = true;
    this.contactList.replaceChildren();
    this.contactButtons = [];
    this.progress.hidden = true;
    this.progress.setAttribute('aria-valuenow', '0');
    this.node.style.setProperty('--sd-progress', '0');
    this.setPhoto(photoUrl);
    this.setPeer(peerName, peerDetail);
    this.node.hidden = false;
    this.node.focus();
  }

  newRequestToken() {
    const random = globalThis.crypto?.randomUUID?.();
    return random || `${Date.now().toString(36)}-${(++this.requestSerial).toString(36)}-${Math.random().toString(36).slice(2)}`;
  }

  requestCurrent(request) {
    return this.outgoingRequest === request && !request.invalidated
      && request.generation === this.generation && !this.node.hidden;
  }

  sessionCurrent(id, generation) {
    return generation === this.generation && !this.node.hidden && this.id === id;
  }

  cancelServerSession(id) {
    if (typeof id === 'string' && id) this.send('ShareDrop/Cancel', { Id: id }).catch(() => {});
  }

  setContactButtonsDisabled(disabled) {
    for (const button of this.contactButtons) button.disabled = disabled;
  }

  addContact(player, payload, generation) {
    const distance = Number(player.distance);
    const label = `${player.name}, ${distance.toFixed(1)} metres away`;
    let request = null;
    const button = this.button('', async () => {
      if (generation !== this.generation || this.node.hidden || this.outgoingRequest) return;
      request = {
        token: this.newRequestToken(), generation, targetSource: Number(player.source),
        sessionId: null, sawOffer: false, invalidated: false
      };
      this.outgoingRequest = request;
      this.setContactButtonsDisabled(true);
      try {
        const requestData = { TargetSource: player.source, RequestToken: request.token };
        if (payload.Kind === 'location') Object.assign(requestData, { Kind: 'location', Location: payload.Location });
        else Object.assign(requestData, { Kind: 'photo', PhotoId: payload.PhotoId });
        const result = await this.send('ShareDrop/Request', requestData);
        if (!result?.Success) {
          if (this.requestCurrent(request)) throw Error(result?.Error || 'ShareDrop could not start.');
          return;
        }
        if (typeof result.Id !== 'string' || !result.Id) {
          if (this.requestCurrent(request)) throw Error('ShareDrop could not start.');
          return;
        }
        if (!this.requestCurrent(request)) {
          this.cancelServerSession(result.Id);
          return;
        }
        if (request.sessionId && request.sessionId !== result.Id) {
          this.cancelServerSession(result.Id);
          return;
        }
        request.sessionId = result.Id;
        if (this.id && this.id !== result.Id) {
          this.cancelServerSession(result.Id);
          return;
        }
        if (!request.sawOffer) this.show('Request sent', `Waiting for ${player.name} to accept on their phone.`, {
          eyebrow: 'REQUEST SENT', peerName: player.name, peerDetail: `${distance.toFixed(1)} m away`, photoUrl: payload.Kind === 'photo' ? this.photoUrl : null
        });
      } catch (error) {
        if (this.outgoingRequest === request && !request.invalidated) {
          request.invalidated = true;
          this.cancelServerSession(request.sessionId);
          this.outgoingRequest = null;
          this.setContactButtonsDisabled(false);
        }
        throw error;
      }
    }, 'sd-contact', () => generation === this.generation && !this.node.hidden);
    button.setAttribute('aria-label', label);
    const avatar = el('span', 'sd-avatar', initials(player.name));
    avatar.setAttribute('aria-hidden', 'true');
    const copy = el('span', 'sd-contact-copy');
    copy.append(el('strong', '', player.name), el('span', '', 'Nearby phone'));
    const distanceLabel = el('span', 'sd-distance', `${distance.toFixed(1)} m`);
    const chevron = el('span', 'sd-chevron', '›');
    button.append(avatar, copy, distanceLabel, chevron);
    this.contactList.append(button);
    this.contactButtons.push(button);
  }

  async choose(photo) {
    if (!Number.isInteger(Number(photo?.PhotoId)) || Number(photo.PhotoId) <= 0) return this.notify('Choose a photo from your Gallery.');
    return this.choosePayload({ Kind: 'photo', PhotoId: Number(photo.PhotoId), PhotoUrl: photo.PhotoUrl });
  }

  async chooseLocation(location) {
    if (!validLocation(location)) return this.notify('Choose a valid GTA world location.');
    return this.choosePayload({ Kind: 'location', Location: { type: 'location', x: Number(location.x), y: Number(location.y), label: typeof location.label === 'string' ? location.label.slice(0, 80) : 'Shared location' } });
  }

  async choosePayload(payload) {
    if (!this.enabled) return this.notify('Enable ShareDrop in Control Center first.');
    if (this.id) return this.notify('Finish the current ShareDrop first.');
    if (this.outgoingRequest) {
      this.outgoingRequest.invalidated = true;
      this.cancelServerSession(this.outgoingRequest.sessionId);
      this.outgoingRequest = null;
    }
    const generation = ++this.generation;
    this.kind = payload.Kind;
    this.location = payload.Kind === 'location' ? payload.Location : null;
    this.photoUrl = payload.Kind === 'photo' && typeof payload.PhotoUrl === 'string' && /^https:\/\//i.test(payload.PhotoUrl) ? payload.PhotoUrl : null;
    this.show('Finding nearby phones', 'Looking for people close by…', { eyebrow: 'NEARBY SHARING', photoUrl: this.photoUrl });
    try {
      const result = await this.send('ShareDrop/Nearby', {});
      if (generation !== this.generation) return;
      if (!result?.Success) throw Error(result?.Error || 'Nearby phones are unavailable.');
      const players = Array.isArray(result.Players) ? result.Players : [];
      const noun = payload.Kind === 'location' ? 'location' : 'photo';
      this.show(players.length ? 'Choose someone nearby' : 'No nearby phones',
        players.length ? `Select a person to share this ${noun} with.` : 'Both players need ShareDrop on and must be within 5 metres.',
        { eyebrow: 'NEARBY SHARING', photoUrl: this.photoUrl });
      if (players.length) {
        this.contacts.hidden = false;
        for (const player of players) {
          if (typeof player?.name !== 'string' || !Number.isFinite(Number(player.distance)) || !Number.isInteger(Number(player.source))) continue;
          this.addContact(player, payload, generation);
        }
      }
      this.button('Cancel', () => this.cancel(), 'sd-secondary');
    } catch (error) {
      if (generation === this.generation) {
        this.cancel();
        this.notify(error.message);
      }
    }
  }

  phase(data) {
    if (!data || typeof data.Id !== 'string' || !data.Id || !Object.prototype.hasOwnProperty.call(phaseOrder, data.Phase)) return;
    const order = phaseOrder[data.Phase];
    if (data.Phase === 'offer') {
      if (data.Receiver !== true) {
        const request = this.outgoingRequest;
        if (!request || !this.requestCurrent(request) || request.token !== data.RequestToken
          || request.targetSource !== Number(data.Peer)
          || (request.sessionId && request.sessionId !== data.Id)) {
          this.cancelServerSession(data.Id);
          return;
        }
        request.sessionId = data.Id;
        request.sawOffer = true;
      }
      if (this.lastTerminalId === data.Id || (this.id && this.id !== data.Id)) return;
      if (this.id === data.Id) return;
    } else {
      if (data.Id !== this.id || isTerminal(this.phaseState)) return;
      const currentOrder = phaseOrder[this.phaseState];
      if (currentOrder === undefined || order <= currentOrder) return;
    }

    this.id = data.Id;
    this.phaseState = data.Phase;
    this.receiver = data.Receiver === true;
    this.kind = data.Kind === 'location' ? 'location' : 'photo';
    if (data.Phase === 'offer' && this.receiver) this.location = null;
    if (validLocation(data.Location)) this.location = { type: 'location', x: Number(data.Location.x), y: Number(data.Location.y), label: String(data.Location.label || 'Shared location').slice(0,80) };
    this.photoUrl = this.kind === 'photo' && typeof data.PhotoUrl === 'string' ? data.PhotoUrl : null;
    this.node.dataset.phase = data.Phase;
    this.node.style.setProperty('--sd-progress', '0');
    cancelAnimationFrame(this.frame);

    const name = typeof data.Name === 'string' && data.Name.trim() ? data.Name : 'Nearby player';
    const locationName = this.location?.label || 'shared location';
    const details = this.kind === 'location' ? {
      offer: this.receiver
        ? ['Share a map location', `${name} wants to share a GTA map location. Accept to begin the short approach and bring your phones close.`, 'INCOMING SHARE', 'Incoming location']
        : ['Request sent', `Waiting for ${name} to accept on their phone.`, 'REQUEST SENT', 'Nearby phone'],
      approach: ['Move phones closer', `Both phones are getting into position for ${locationName}. Keep your screens ready.`, 'GETTING READY', 'Approaching'],
      animation: ['Sharing location', 'Keep your phones together while the location card is saved to Messages.', 'TRANSFERRING', 'Connected'],
      complete: ['Location shared', this.receiver ? 'The location card was saved to Messages.' : 'The location card was delivered to Messages.', 'COMPLETE', 'Saved to Messages'],
      cancelled: ['ShareDrop cancelled', 'The location was not shared.', 'CANCELLED', 'Transfer ended'],
      failed: ['Location not shared', 'The location card could not be saved. Try again.', 'NOT SHARED', 'Transfer ended']
    }[data.Phase] : {
      offer: this.receiver
        ? ['Bring phones together', `${name} wants to share a photo. Accept to begin the short approach and bring your phones close.`, 'INCOMING SHARE', 'Incoming photo']
        : ['Request sent', `Waiting for ${name} to accept on their phone.`, 'REQUEST SENT', 'Nearby phone'],
      approach: ['Move phones closer', 'Both phones are getting into position. Keep your screens ready.', 'GETTING READY', 'Approaching'],
      animation: ['Share in progress', 'Keep your phones together while the entire photo transfer completes.', 'TRANSFERRING', 'Connected'],
      complete: ['Photo saved', this.receiver ? 'The photo is now in your Gallery.' : 'Your photo was saved to the other phone’s Gallery.', 'COMPLETE', 'Saved to Gallery'],
      cancelled: ['ShareDrop cancelled', 'The transfer ended before the photo was saved.', 'CANCELLED', 'Transfer ended'],
      failed: ['Photo not saved', 'The photo could not be saved. Check Gallery space and try again.', 'NOT SAVED', 'Transfer ended']
    }[data.Phase];
    this.show(details[0], details[1], {
      eyebrow: details[2], peerName: name, peerDetail: details[3], photoUrl: this.photoUrl
    });

    if (data.Phase === 'offer' && this.receiver) {
      const generation = this.generation;
      this.button('Accept', async () => {
        const result = await this.send('ShareDrop/Respond', { Id: data.Id, Accept: true });
        if (!this.sessionCurrent(data.Id, generation)) {
          if (result?.Success) this.cancelServerSession(data.Id);
          return;
        }
        if (!result?.Success) throw Error(result?.Error || 'ShareDrop is no longer available.');
      }, 'sd-primary', () => this.sessionCurrent(data.Id, generation));
      this.button('Decline', async () => {
        const result = await this.send('ShareDrop/Respond', { Id: data.Id, Accept: false });
        if (!this.sessionCurrent(data.Id, generation)) return;
        if (!result?.Success) throw Error(result?.Error || 'ShareDrop is no longer available.');
      }, 'sd-secondary', () => this.sessionCurrent(data.Id, generation));
    } else if (['offer', 'approach', 'animation'].includes(data.Phase)) {
      this.button('Cancel', () => this.cancel(), 'sd-secondary');
    }

    if (isTerminal(data.Phase)) {
      this.lastTerminalId = data.Id;
      if (this.outgoingRequest?.sessionId === data.Id) this.outgoingRequest = null;
      this.id = null;
      this.progress.hidden = true;
      this.button('Done', () => this.cancel(), 'sd-primary');
    }
  }

  animate(data) {
    if (data.Id !== this.id || this.phaseState !== 'animation' || !Number.isFinite(data.Duration) || data.Duration <= 0) return;
    cancelAnimationFrame(this.frame);
    const started = performance.now() - Math.max(0, Number(data.Elapsed) || 0);
    const duration = data.Duration;
    this.phaseState = 'transfer';
    this.node.dataset.phase = 'transfer';
    this.progress.hidden = false;
    this.caption.textContent = this.kind === 'location'
      ? (this.receiver ? 'Saving the location card to Messages…' : 'Sending the location card to Messages…')
      : (this.receiver ? 'Receiving your photo…' : 'Sending your photo…');
    const tick = now => {
      const progress = Math.min(1, Math.max(0, (now - started) / duration));
      this.node.style.setProperty('--sd-progress', progress.toFixed(4));
      this.progress.setAttribute('aria-valuenow', String(Math.round(progress * 100)));
      if (progress >= 1) this.caption.textContent = this.kind === 'location' ? 'Finishing the Messages save…' : 'Finishing the secure save…';
      this.frame = progress < 1 ? requestAnimationFrame(tick) : null;
    };
    this.frame = requestAnimationFrame(tick);
  }

  handleKey(event) {
    if (this.node.hidden) return false;
    if (event.key === 'Escape') { this.cancel(); return true; }
    if (event.key === 'Tab') {
      const items = [...this.node.querySelectorAll('button:not([disabled])')];
      const index = items.indexOf(document.activeElement);
      if (items.length) items[(index + (event.shiftKey ? -1 : 1) + items.length) % items.length].focus();
      return true;
    }
    return !['Enter', ' '].includes(event.key);
  }

  cancel() {
    ++this.generation;
    cancelAnimationFrame(this.frame);
    const ids = new Set([this.id, this.outgoingRequest?.sessionId]);
    if (this.outgoingRequest) this.outgoingRequest.invalidated = true;
    this.outgoingRequest = null;
    for (const id of ids) this.cancelServerSession(id);
    this.id = null;
    this.phaseState = null;
    this.node.hidden = true;
    this.node.removeAttribute('data-phase');
    this.node.style.removeProperty('--sd-progress');
    this.photoUrl = null;
    this.location = null;
    this.kind = null;
    if (this.previousFocus?.isConnected) this.previousFocus.focus();
  }

  destroy() {
    this.cancel();
    window.removeEventListener('message', this.listener);
    window.removeEventListener('duo:sharedrop', this.request);
    window.removeEventListener('duo:sharedrop-location', this.locationRequest);
    this.node.remove();
  }
}
