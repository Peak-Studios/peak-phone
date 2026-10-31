import { NativeView, el, safeImage, rows, resultOK, errorMessage } from './native-kit.mjs?rev=owner-config-20261015';
import { icon } from './icons.mjs?rev=owner-config-20261015';

const stampOf = value => {
  if (typeof value === 'number' && Number.isFinite(value)) return value < 1e12 ? value * 1000 : value;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const photoTime = value => {
  const stamp = stampOf(value);
  return stamp ? new Date(stamp) : null;
};
const dayKey = date => date ? `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}` : 'unknown';
const dayLabel = date => {
  if (!date) return 'Date unavailable';
  const today = new Date(), yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (dayKey(date) === dayKey(today)) return 'Today';
  if (dayKey(date) === dayKey(yesterday)) return 'Yesterday';
  return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
};
const fullDate = date => date ? date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : 'Date unavailable';
const rowData = photo => ({
  ...photo,
  id: photo?.id == null ? null : String(photo.id),
  photo_url: safeImage(photo?.photo_url),
  timestamp: photo?.timestamp ?? photo?.created_at ?? null,
});
function photoEditor(view,title,actionLabel,action,{wide=false,danger=false}={}){
  const panel=view.openSheet(title,{wide,header:false});panel.classList.add('cf-sheet','duo-photo-form-sheet');
  const nav=el('header','cf-sheet-nav');nav.append(view.textButton('Cancel','',()=>view.closeSheet(),'cf-nav-leading'),el('h2','',title));
  const done=view.textButton(actionLabel,'',()=>action?.(done),'cf-nav-trailing'+(danger?' cf-danger-action':''));done.setAttribute('aria-label',actionLabel);nav.append(done);panel.append(nav);return {panel,done};
}
function photoContext(photo,title='Selected photo'){
  const row=el('div','cf-photo-preview');const image=new Image();image.src=safeImage(photo?.photo_url);image.alt='';image.referrerPolicy='no-referrer';row.append(image,el('span','',title));return row;
}

/** Native Photos surface backed by the existing Gallery NUI callbacks. */
export class PhotosLibrary extends NativeView {
  constructor({ target, props = {} }) {
    super({ target, props: { ...props, name: 'Photos' } });
    this.element.classList.add('duo-photos-library');
    this.send = props.send;
    this.notify = props.notify || (() => {});
    this.photos = [];
    this.selected = new Set();
    this.selectionMode = false;
    this.activePhoto = null;
    this.activeIndex = -1;
    this.lamarEnabled = false;
    this.generation = 0;
    this.element.innerHTML = `
      <header class="duo-photos-header">
        <div class="duo-photos-heading"><h1>Photos</h1><p data-photo-count>Loading your library…</p></div>
        <div class="duo-photos-header-actions">
          <button type="button" data-import aria-label="Import a photo from URL" title="Import a photo from URL">${icon('plus')}</button>
          <button type="button" data-select aria-label="Select photos">Select</button>
        </div>
      </header>
      <main class="duo-photos-scroll" data-photo-scroll tabindex="-1">
        <div class="duo-photos-content" data-photo-content></div>
      </main>
      <footer class="duo-photos-selection" data-selection-bar hidden></footer>
      <section class="duo-photo-viewer" data-photo-viewer hidden aria-label="Photo viewer"></section>`;
    this.content = this.element.querySelector('[data-photo-content]');
    this.scroll = this.element.querySelector('[data-photo-scroll]');
    this.viewer = this.element.querySelector('[data-photo-viewer]');
    this.count = this.element.querySelector('[data-photo-count]');
    this.selectionBar = this.element.querySelector('[data-selection-bar]');
    this.listen(this.element, 'click', event => this.onClick(event));
    // The shell replays the first Gallery/PhotoCaptured message after mounting a
    // previously unopened app. Accept that replay so capture still refreshes.
    this.listen(window, 'message', event => {
      if (event.source && event.source !== window && event.source !== window.parent) return;
      this.onMessage(event.data);
    });
    this.listen(window, 'keydown', event => this.onKeydown(event));
    this.refresh().catch(error => this.showError(error));
  }

  async refresh({ capturedUrl = '' } = {}) {
    if (typeof this.send !== 'function') return;
    const token = ++this.generation;
    const owner = this.owner?.();
    this.count.textContent = 'Updating your library…';
    try {
      const result = await this.send('Gallery/GetPhotos', {});
      if (!this.alive || token !== this.generation || owner !== this.owner?.()) return;
      if (!Array.isArray(result)) throw Error('Photos could not be loaded.');
      this.photos = result.map(rowData).filter(photo => photo.photo_url);
      this.selected = new Set([...this.selected].filter(id => this.photos.some(photo => photo.id === id)));
      this.renderGrid();
      this.element.dispatchEvent(new CustomEvent('duo:photos-changed', { bubbles: true, detail: { owner, photos: this.photos.slice() } }));
      if (capturedUrl) {
        const safe = safeImage(capturedUrl);
        const index = this.photos.findIndex(photo => photo.photo_url === safe);
        if (index >= 0) this.showPhoto(this.photos[index], index);
      }
    } catch (error) {
      if (this.alive && token === this.generation) this.showError(error);
      throw error;
    }
  }

  showError(error) {
    this.count.textContent = 'Your library could not be loaded';
    this.content.replaceChildren(this.empty('Photos are unavailable', error.message || 'Try again in a moment.', 'image', () => this.refresh().catch(e => this.showError(e))));
  }

  empty(title, body, glyph, retry) {
    const node = el('div', 'duo-photos-empty');
    node.innerHTML = icon(glyph);
    node.append(el('h2', '', title), el('p', '', body));
    if (retry) node.append(this.textButton('Try Again', 'refresh', retry, 'duo-photo-empty-retry'));
    return node;
  }

  renderGrid() {
    const count = this.photos.length;
    this.count.textContent = `${count} ${count === 1 ? 'photo' : 'photos'}`;
    this.element.querySelector('[data-select]').textContent = this.selectionMode ? 'Cancel' : 'Select';
    this.element.querySelector('[data-select]').setAttribute('aria-label', this.selectionMode ? 'Cancel photo selection' : 'Select photos');
    this.content.replaceChildren();
    if (!count) {
      this.content.append(this.empty('Your moments will live here', 'Take a photo in Camera or import a supported image URL.', 'image', null));
      this.renderSelectionBar();
      return;
    }
    const groups = new Map();
    this.photos.forEach((photo, index) => {
      const date = photoTime(photo.timestamp), key = dayKey(date);
      if (!groups.has(key)) groups.set(key, { label: dayLabel(date), rows: [] });
      groups.get(key).rows.push({ photo, index });
    });
    for (const group of groups.values()) {
      const section = el('section', 'duo-photo-day');
      section.append(el('h2', 'duo-photo-day-title', group.label));
      const grid = el('div', 'duo-photo-grid');
      for (const { photo, index } of group.rows) {
        const key = photo.id;
        const button = el('button', 'duo-photo-tile');
        button.type = 'button';
        button.dataset.photoIndex = String(index);
        button.setAttribute('aria-label', `Open photo ${index + 1} of ${count}`);
        const image = new Image();
        image.src = photo.photo_url;
        image.alt = '';
        image.loading = 'lazy';
        image.decoding = 'async';
        image.referrerPolicy = 'no-referrer';
        image.addEventListener('error', () => image.replaceWith(el('span', 'duo-photo-broken', 'Image unavailable')), { once: true });
        button.append(image);
        if (this.selectionMode) {
          const check = el('span', 'duo-photo-check');
          check.innerHTML = icon(this.selected.has(key) ? 'check' : '');
          check.setAttribute('aria-hidden', 'true');
          button.append(check);
          button.setAttribute('aria-pressed', String(this.selected.has(key)));
        }
        grid.append(button);
      }
      section.append(grid);
      this.content.append(section);
    }
    this.renderSelectionBar();
  }

  renderSelectionBar() {
    this.selectionBar.replaceChildren();
    this.selectionBar.hidden = !this.selectionMode;
    if (!this.selectionMode) return;
    const chosen = this.photos.filter(photo => this.selected.has(photo.id));
    const share = this.textButton('Share', 'share', () => {
      if (!chosen.length) return this.notify('Select a photo to share.');
      if (chosen.length > 5) return this.notify('Messages supports up to 5 photos at once. Deselect photos and try again.');
      return chosen.length === 1 ? this.openShareSheet(chosen[0]) : this.openMessageSheet(chosen);
    }, 'duo-photo-selection-action');
    share.disabled = chosen.length === 0;
    const label = el('span', 'duo-photo-selection-count', `${chosen.length} selected`);
    const all = this.textButton(chosen.length === this.photos.length ? 'Deselect All' : 'Select All', null, () => {
      this.selected = chosen.length === this.photos.length ? new Set() : new Set(this.photos.map(photo => photo.id));
      this.renderGrid();
    }, 'duo-photo-selection-all');
    const remove = this.textButton('Delete', 'trash', () => this.confirmDelete(chosen), 'duo-photo-selection-delete');
    remove.disabled = chosen.length === 0;
    this.selectionBar.append(all, label, share, remove);
  }

  onClick(event) {
    const tab = event.target.closest('[data-tab]')?.dataset.tab;
    if (tab) return;
    if (event.target.closest('[data-import]')) return this.openImportSheet();
    if (event.target.closest('[data-select]')) {
      this.selectionMode = !this.selectionMode;
      if (!this.selectionMode) this.selected.clear();
      this.renderGrid();
      return;
    }
    if (event.target.closest('[data-viewer-back]')) return this.closePhoto();
    if (event.target.closest('[data-viewer-share]')) return this.openShareSheet(this.activePhoto);
    if (event.target.closest('[data-viewer-more]')) return this.openShareSheet(this.activePhoto);
    if (event.target.closest('[data-viewer-delete]')) return this.confirmDelete([this.activePhoto]);
    const thumb = event.target.closest('[data-film-index]');
    if (thumb) return this.showPhoto(this.photos[Number(thumb.dataset.filmIndex)], Number(thumb.dataset.filmIndex));
    const tile = event.target.closest('[data-photo-index]');
    if (tile) {
      const index = Number(tile.dataset.photoIndex), photo = this.photos[index];
      if (!photo) return;
      if (this.selectionMode) {
        this.selected.has(photo.id) ? this.selected.delete(photo.id) : this.selected.add(photo.id);
        this.renderGrid();
      } else this.showPhoto(photo, index);
    }
  }

  showPhoto(photo, index) {
    if (!photo?.photo_url) return;
    this.activePhoto = photo;
    this.activeIndex = Number.isInteger(index) ? index : this.photos.indexOf(photo);
    this.renderViewer();
  }

  renderViewer() {
    const photo = this.activePhoto;
    if (!photo) return;
    this.viewer.hidden = false;
    this.viewer.replaceChildren();
    const date = photoTime(photo.timestamp);
    const header = el('header', 'duo-photo-viewer-header');
    const back = this.button('Back to Photos', 'back', () => this.closePhoto(), 'duo-photo-viewer-back');
    back.dataset.viewerBack = '';
    const heading = el('div', 'duo-photo-viewer-date');
    heading.append(el('strong', '', fullDate(date)), el('small', '', photo.FromName ? `Shared by ${photo.FromName}` : `${this.activeIndex + 1} of ${this.photos.length}`));
    const more = this.button('Photo actions', 'more', () => this.openShareSheet(photo), 'duo-photo-viewer-more');
    more.dataset.viewerMore = '';
    header.append(back, heading, more);
    const imageWrap = el('div', 'duo-photo-viewer-image-wrap');
    const image = new Image();
    image.src = photo.photo_url;
    image.alt = photo.FromName ? `Photo shared by ${photo.FromName}` : 'Selected photo';
    image.referrerPolicy = 'no-referrer';
    image.addEventListener('error', () => imageWrap.append(el('p', 'duo-photo-viewer-fallback', 'This image is no longer available.')), { once: true });
    imageWrap.append(image);
    const filmstrip = el('div', 'duo-photo-filmstrip');
    filmstrip.setAttribute('role', 'listbox');
    filmstrip.setAttribute('aria-label', 'Photos');
    this.photos.forEach((item, index) => {
      const thumb = el('button', 'duo-photo-film-thumb');
      thumb.type = 'button';
      thumb.dataset.filmIndex = String(index);
      thumb.setAttribute('role', 'option');
      thumb.setAttribute('aria-selected', String(index === this.activeIndex));
      thumb.setAttribute('aria-label', `Photo ${index + 1}`);
      const thumbImage = new Image(); thumbImage.src = item.photo_url; thumbImage.alt = ''; thumbImage.loading = 'lazy'; thumbImage.referrerPolicy = 'no-referrer';
      thumb.append(thumbImage); filmstrip.append(thumb);
    });
    if (this.activeIndex >= 0) requestAnimationFrame(() => filmstrip.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center' }));
    const dock = el('footer', 'duo-photo-viewer-dock');
    const share = this.button('Share photo', 'share', () => this.openShareSheet(photo), 'duo-photo-dock-action'); share.dataset.viewerShare = '';
    const count = el('span', 'duo-photo-viewer-count', this.activeIndex >= 0 ? `${this.activeIndex + 1} of ${this.photos.length}` : 'Shared photo');
    const remove = this.button('Delete photo', 'trash', () => this.confirmDelete([photo]), 'duo-photo-dock-action duo-photo-delete'); remove.dataset.viewerDelete = ''; remove.disabled = !photo.id;
    dock.append(share, count, remove);
    this.viewer.append(header, imageWrap, filmstrip, dock);
  }

  closePhoto() { this.activePhoto = null; this.activeIndex = -1; this.viewer.hidden = true; this.viewer.replaceChildren(); }

  onMessage(data) {
    if (!data || typeof data !== 'object') return;
    if (data.Action === 'Gallery/RefreshPhotos') this.refresh().catch(error => this.showError(error));
    if (data.Action === 'Gallery/SetLamarMode') this.lamarEnabled = data.Enabled === true;
    if (data.Action === 'Gallery/PhotoCaptured') this.refresh({ capturedUrl: data.PhotoUrl || '' }).catch(error => this.showError(error));
    if (data.Action === 'Gallery/SharedPhoto' && safeImage(data.PhotoUrl)) {
      this.closePhoto();
      this.showPhoto({ id: null, photo_url: safeImage(data.PhotoUrl), timestamp: Date.now(), FromName: String(data.FromName || '').slice(0, 100) }, -1);
    }
  }

  onKeydown(event) {
    if (this.element.inert || this.target.inert || this.target.hidden) return;
    if (this.viewer.hidden || this.sheet) return;
    if (event.key === 'Escape') { event.preventDefault(); this.closePhoto(); }
    if (event.key === 'ArrowLeft' && this.activeIndex > 0) { event.preventDefault(); this.showPhoto(this.photos[this.activeIndex - 1], this.activeIndex - 1); }
    if (event.key === 'ArrowRight' && this.activeIndex >= 0 && this.activeIndex < this.photos.length - 1) { event.preventDefault(); this.showPhoto(this.photos[this.activeIndex + 1], this.activeIndex + 1); }
  }

  openShareSheet(photo) {
    if (!photo?.photo_url) return;
    const panel = this.openSheet('Share Photo', { wide: true });
    panel.classList.add('duo-photo-share-sheet');
    const preview = el('div', 'duo-photo-share-preview');
    const image = new Image(); image.src = photo.photo_url; image.alt = ''; image.referrerPolicy = 'no-referrer';
    preview.append(image, el('div', '', photoTime(photo.timestamp) ? fullDate(photoTime(photo.timestamp)) : 'Photo'));
    const actions = el('div', 'duo-photo-share-actions');
    actions.append(
      this.textButton('Send in Message', 'message-circle', () => this.openMessageSheet(photo), 'duo-photo-action'),
      this.textButton('Nearby Players', 'users', () => this.openNearbySheet(photo), 'duo-photo-action'),
      this.textButton('Share to Player', 'id-card', () => this.openPlayerSheet(photo), 'duo-photo-action'),
      this.textButton('ShareDrop', 'wifi', () => this.shareDrop(photo), 'duo-photo-action'),
    );
    if (photo.id) actions.append(this.textButton('Post to Y', 'outgoing', () => this.openYSheet(photo), 'duo-photo-action'));
    actions.append(
      this.textButton('Set as Wallpaper', 'image', () => this.setWallpaper(photo), 'duo-photo-action'),
      this.textButton('Set as Profile Picture', 'id-card', () => this.setProfile(photo), 'duo-photo-action'),
    );
    if (this.lamarEnabled) actions.append(this.textButton('Send to Lamar', 'outgoing', () => this.sendToLamar(photo), 'duo-photo-action'));
    if (photo.id) actions.append(this.textButton('Delete Photo', 'trash', () => this.confirmDelete([photo]), 'duo-photo-action duo-photo-action-danger'));
    panel.append(preview, actions);
  }

  openImportSheet() {
    const sheet=photoEditor(this,'Import Photo','Import',button=>{const url=input.value.trim();if(!/^https:\/\//i.test(url)||! /\.(jpg|jpeg|png|gif|webp)(\?|&|#|\/|$)/i.test(url)){this.notify('Enter a valid HTTPS JPG, PNG, GIF or WebP image URL.');return;}return this.submitAction(button,async()=>{const result=await this.send('Gallery/ImportPhoto',{PhotoUrl:url});if(!resultOK(result))throw Error(errorMessage(result,'The server could not import this photo.'));this.closeSheet();await this.refresh();this.notify('Photo imported.');});});
    const {panel,done}=sheet;
    const label = el('label', 'duo-photo-field'); label.append(el('span', '', 'Image URL'));
    const input = el('input'); input.type = 'url'; input.autocomplete = 'url'; input.placeholder = 'https://example.com/photo.jpg'; input.maxLength = 2048; label.append(input);
    const preview=el('div','cf-photo-preview');const validUrl=()=>/^https:\/\//i.test(input.value.trim())&&/\.(jpg|jpeg|png|gif|webp)(\?|&|#|\/|$)/i.test(input.value.trim());const refresh=()=>{preview.replaceChildren();const safe=safeImage(input.value.trim());if(safe){const image=new Image();image.src=safe;image.alt='';image.referrerPolicy='no-referrer';preview.append(image,el('span','',new URL(safe).hostname));}else preview.append(el('span','','Image preview'));done.disabled=!validUrl();};input.addEventListener('input',refresh);
    panel.append(el('p','cf-sheet-intro','Import a hosted photo into this character’s Gallery.'),preview,label,el('p','duo-photo-sheet-note','Use an HTTPS image URL ending in JPG, PNG, GIF or WebP. The server verifies and stores imported photos.'));refresh();
  }

  openPlayerSheet(photo) {
    const sheet=photoEditor(this,'Share to Player','Send',button=>{if(!photo.id){this.notify('This shared photo cannot be sent through the Gallery route.');return;}if(!input.value.trim()){this.notify('Enter a citizen ID or phone number.');return;}return this.submitAction(button,async()=>{const result=await this.send('Gallery/ShareToSpecificPlayer',{PhotoId:photo.id,Target:input.value.trim()});if(!resultOK(result))throw Error(errorMessage(result,'The photo could not be shared.'));this.closeSheet();this.notify('Photo shared.');});});const {panel,done}=sheet;
    const label = el('label', 'duo-photo-field'); label.append(el('span', '', 'Citizen ID or phone number'));
    const input = el('input'); input.autocomplete = 'off'; input.placeholder = 'Citizen ID or phone number'; input.maxLength = 128; label.append(input);
    input.addEventListener('input',()=>done.disabled=!input.value.trim());done.disabled=!input.value.trim();panel.append(photoContext(photo),el('p','cf-sheet-intro','Send this image to a character by citizen ID or phone number.'),label);
  }

  openMessageSheet(photos) {
    const items = (Array.isArray(photos) ? photos : [photos]).filter(photo => safeImage(photo?.photo_url)).slice(0, 5);
    if (!items.length) { this.notify('Choose at least one available photo.'); return; }
    const title=items.length===1?'Send in Message':`Send ${items.length} Photos`;
    const sheet=photoEditor(this,title,items.length===1?'Send':'Send photos',button=>{if(!phone.value.trim()){this.notify('Enter a phone number.');return;}return this.submitAction(button,async()=>{const payload={Phone:phone.value.trim(),Message:message.value.trim(),Attachments:items.map(photo=>({type:'image',url:safeImage(photo.photo_url)}))};const signature=JSON.stringify(payload);this.messageAttempt||={signature,operationId:''};if(this.messageAttempt.signature!==signature)this.messageAttempt={signature,operationId:''};if(!this.messageAttempt.operationId)this.messageAttempt.operationId=globalThis.crypto?.randomUUID?.()||('gallery-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));const result=await this.send('Messages/SendMessage',{...payload,OperationId:this.messageAttempt.operationId});if(!resultOK(result))throw Error(errorMessage(result,'The message could not be sent. Retry to send the same photos.'));this.messageAttempt=null;this.selected.clear();this.selectionMode=false;this.renderGrid();this.closeSheet();this.notify(items.length===1?'Photo sent in Messages.':`${items.length} photos sent in Messages.`);});},{wide:true});
    const panel=sheet.panel;panel.classList.add('duo-photo-message-sheet');
    const preview = el('div', 'duo-photo-message-preview');
    for (const photo of items) { const image = new Image(); image.src = safeImage(photo.photo_url); image.alt = ''; image.referrerPolicy = 'no-referrer'; preview.append(image); }
    preview.append(el('span', '', items.length === 1 ? '1 photo selected' : `${items.length} photos selected`));
    const phoneLabel = el('label', 'duo-photo-field'); phoneLabel.append(el('span', '', 'To'));
    const phone = el('input'); phone.type = 'tel'; phone.autocomplete = 'tel'; phone.placeholder = 'Enter a phone number'; phone.maxLength = 24; phoneLabel.append(phone);
    const choose = this.textButton('Choose a Contact', 'contacts', async () => {
      choose.disabled = true; picker.replaceChildren(el('p', 'duo-photo-sheet-note', 'Loading contacts…')); picker.hidden = false;
      try {
        const contacts = rows(await this.send('Contacts/GetContacts', {}));
        if (!this.alive || this.sheet?.panel !== panel) return;
        picker.replaceChildren();
        if (!contacts.length) picker.append(el('p', 'duo-photo-sheet-note', 'No saved contacts are available.'));
        for (const contact of contacts) {
          const name = String(contact.name || contact.Name || 'Contact').slice(0, 100);
          const number = String(contact.phone || contact.Phone || '').slice(0, 24);
          if (!number) continue;
          picker.append(this.textButton(`${name} · ${number}`, 'contacts', () => { phone.value = number; picker.hidden = true; sheet.done.disabled=!phone.value.trim(); }, 'duo-photo-contact'));
        }
      } catch (error) { if (this.sheet?.panel === panel) picker.replaceChildren(el('p', 'duo-photo-sheet-note is-error', error.message || 'Contacts could not be loaded.')); }
      finally { if (this.alive && this.sheet?.panel === panel) choose.disabled = false; }
    }, 'duo-photo-choose-contact');
    const picker = el('div', 'duo-photo-contact-picker'); picker.hidden = true;
    const messageLabel = el('label', 'duo-photo-field'); messageLabel.append(el('span', '', 'Message (optional)'));
    const message = el('textarea'); message.rows = 3; message.maxLength = 1000; message.placeholder = 'Add a message…'; messageLabel.append(message);
    phone.addEventListener('input',()=>sheet.done.disabled=!phone.value.trim());sheet.done.disabled=true;
    panel.append(preview,phoneLabel,choose,picker,messageLabel);
  }

  openYSheet(photo) {
    const sheet=photoEditor(this,'Post to Y','Post',button=>this.submitAction(button,async()=>{const result=await this.send('Gallery/PostToTwatter',{PhotoId:photo.id,Caption:caption.value});if(!resultOK(result))throw Error(errorMessage(result,'Y could not publish this photo.'));this.closeSheet();this.notify('Photo posted to Y.');})),panel=sheet.panel;
    const label = el('label', 'duo-photo-field'); label.append(el('span', '', 'Caption (optional)'));
    const caption = el('textarea'); caption.rows = 3; caption.maxLength = 1000; caption.placeholder = 'Write a caption…'; label.append(caption); panel.append(photoContext(photo,'Photo for your Y post'),label);
  }

  async openNearbySheet(photo) {
    if (!photo.id) { this.notify('This shared photo cannot be sent through the Gallery route.'); return; }
    const panel=photoEditor(this,'Nearby Players','Done',()=>this.closeSheet()).panel;
    const loading = el('p', 'duo-photo-sheet-note', 'Checking nearby players…'); panel.append(loading);
    try {
      const people = rows(await this.send('Gallery/GetNearbyPlayers', {}));
      if (!this.alive || this.sheet?.panel !== panel) return;
      loading.remove();
      if (!people.length) { panel.append(el('p', 'duo-photo-sheet-note', 'No nearby players found. Get closer to share.')); return; }
      const list = el('div', 'duo-photo-nearby-list');
      for (const person of people) {
        const button = this.textButton(`${String(person.name || 'Nearby player')} · ${Math.max(0, Number(person.distance) || 0)} m`, 'user', async () => {
          await this.submitAction(button, async () => {
            const result = await this.send('Gallery/SharePhoto', { PhotoId: photo.id, TargetSource: person.source });
            if (!resultOK(result)) throw Error(errorMessage(result, 'The photo could not be shared.'));
            this.closeSheet(); this.notify('Photo shared.');
          });
        }, 'duo-photo-nearby-person');
        list.append(button);
      }
      panel.append(list, this.textButton('Share with Everyone Nearby', 'users', () => this.confirmShareNearby(photo), 'duo-photo-nearby-all'));
    } catch (error) {
      if (this.alive && this.sheet?.panel === panel) { loading.textContent = error.message || 'Nearby players could not be loaded.'; loading.classList.add('is-error'); }
    }
  }

  confirmShareNearby(photo) {
    const sheet=photoEditor(this,'Share Nearby','Share with nearby',button=>this.submitAction(button,async()=>{const result=await this.send('Gallery/ShareToAllNearby',{PhotoId:photo.id});if(!resultOK(result))throw Error(errorMessage(result,'No nearby player could receive this photo.'));this.closeSheet();this.notify('Photo shared with nearby players.');})),panel=sheet.panel;
    panel.append(photoContext(photo),el('p','cf-sheet-intro','Share this photo with every player within 5 meters?'));
  }

  async setWallpaper(photo) {
    if (!photo?.photo_url) return;
    try {
      const result = await this.send('Phone/SetPreference', { Id: 'Phone.Background', Value: photo.photo_url });
      if (!resultOK(result)) throw Error(errorMessage(result, 'Wallpaper could not be saved.'));
      this.closeSheet(); this.notify('Wallpaper preference saved.');
    } catch (error) { this.notify(error.message); }
  }

  async setProfile(photo) {
    if (!photo?.photo_url) return;
    try {
      const result = await this.send('UpdateProfilePicture', photo.photo_url);
      if (!resultOK(result)) throw Error(errorMessage(result, 'Profile picture update was not accepted.'));
      this.closeSheet(); this.notify('Profile picture update requested.');
    } catch (error) { this.notify(error.message); }
  }

  async sendToLamar(photo) {
    if (!photo?.photo_url) return;
    try {
      const result = await this.send('Gallery/SendToLamar', { PhotoUrl: photo.photo_url });
      if (!resultOK(result)) throw Error(errorMessage(result, 'The photo could not be sent to Lamar.'));
      this.closeSheet(); this.notify('Photo sent to Lamar.');
    } catch (error) { this.notify(error.message); }
  }

  shareDrop(photo) {
    if (!photo?.photo_url) return;
    this.closeSheet();
    window.dispatchEvent(new CustomEvent('duo:sharedrop', { detail: { PhotoId: photo.id, PhotoUrl: photo.photo_url } }));
  }

  confirmDelete(photos) {
    const items = rows(photos).filter(photo => photo?.id);
    if (!items.length) { this.notify('This photo cannot be deleted from the Gallery.'); return; }
    const title=items.length===1?'Delete Photo?':`Delete ${items.length} Photos?`,label=items.length===1?'Delete':'Delete photos',sheet=photoEditor(this,title,label,button=>this.submitAction(button,async()=>{
        const deleted = [];
        for (const photo of items) {
          const result = await this.send('Gallery/DeletePhoto', { PhotoId: photo.id });
          if (!resultOK(result)) break;
          deleted.push(photo.id);
        }
        if (!deleted.length) throw Error('The photo could not be deleted.');
        this.photos = this.photos.filter(photo => !deleted.includes(photo.id));
        this.selected = new Set([...this.selected].filter(id => !deleted.includes(id)));
        if (this.selectionMode && this.selected.size === 0) this.selectionMode = false;
        window.dispatchEvent(new CustomEvent('duo:photos-changed'));
        this.closeSheet(); this.closePhoto(); this.renderGrid();
        if (deleted.length < items.length) this.notify(`${deleted.length} photo${deleted.length === 1 ? '' : 's'} deleted. Some selected photos could not be deleted.`);
        else this.notify(deleted.length === 1 ? 'Photo deleted.' : `${deleted.length} photos deleted.`);
      }),{danger:true}),panel=sheet.panel;
    if(items.length===1)panel.append(photoContext(items[0],'Selected for deletion'));
    else {const summary=el('div','cf-photo-destination');summary.append(el('strong','',`${items.length} selected photos`));panel.append(summary);}
    panel.append(el('p','cf-sheet-intro',items.length===1?'This photo will be removed from your Gallery.':'Each selected photo will be removed from your Gallery.'));
  }

  async submitAction(button, action) {
    if (!button || button.disabled) return;
    button.disabled = true;
    button.setAttribute('aria-busy','true');
    try { await action(); }
    catch (error) { if (this.alive) {const panel=this.sheet?.panel;if(panel?.classList.contains('cf-sheet')){panel.querySelector('.cf-sheet-error')?.remove();const status=el('p','cf-sheet-error',error.message||'The action could not be completed.');status.setAttribute('role','alert');const nav=panel.querySelector('.cf-sheet-nav');panel.insertBefore(status,nav?.nextSibling||panel.firstChild);}else this.notify(error.message||'The action could not be completed.');} }
    finally { if (this.alive && button.isConnected) {button.disabled = false;button.removeAttribute('aria-busy');} }
  }

  handleEscape() {
    if (super.handleEscape()) return true;
    if (!this.viewer.hidden) { this.closePhoto(); return true; }
    return false;
  }

  $destroy() { ++this.generation; this.closePhoto(); super.$destroy(); }
}
