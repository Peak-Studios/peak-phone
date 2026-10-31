import { NativeView, el, value, rows, isRows, readLocal, writeLocal, collectionKey } from './native-kit.mjs?rev=owner-config-20261015';

export const NOTE_TYPES = Object.freeze([
  { id: 0, name: 'Notes', item: 'note', glyph: 'notebook', create: true },
  { id: 1, name: 'Licenses', item: 'license', glyph: 'id-card', create: false },
  { id: 2, name: 'Documents', item: 'document', glyph: 'doc', create: true },
  { id: 3, name: 'Vehicle Registrations', item: 'vehicle registration', glyph: 'car', create: false },
  { id: 4, name: 'Property Registrations', item: 'property registration', glyph: 'house', create: false },
  { id: 5, name: 'Contracts', item: 'contract', glyph: 'signature', create: true },
]);

const NOTES_READ_FAILURES = Object.freeze({
  unavailable: 'Notes storage is temporarily unavailable. Try again.',
  identity: 'Your character changed while Notes was loading. Reopen Notes to load the current character.',
  changed: 'Notes changed while loading. Refresh again to see the current list.',
  invalid: 'Notes could not load safely. Reopen Notes and try again. If this continues, contact a server administrator.',
  missing: 'This note was deleted or is no longer available.',
  denied: 'You no longer have permission to open this note.',
  oversize: 'This note is too large to load safely. Your saved note remains unchanged.',
});
const NOTES_READ_UNSUPPORTED = 'Notes could not load safely. Reopen Notes and try again. If this continues, contact a server administrator.';
const NOTES_READ_INVALID = 'Notes could not load safely. Reopen Notes and try again. If this continues, contact a server administrator.';

class NotesReadError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'NotesReadError';
    this.status = status;
  }
}

export function notesRowsFromReadResult(data) {
  if (data?.__phoneError || data == null) throw new NotesReadError('unavailable', NOTES_READ_FAILURES.unavailable);
  if (data?.Success === false) {
    const status = typeof data.Status === 'string' ? data.Status : 'invalid';
    const message = NOTES_READ_FAILURES[status];
    throw new NotesReadError(status, message || NOTES_READ_UNSUPPORTED);
  }
  if (typeof data !== 'object' || Array.isArray(data) || data.Success !== true) {
    throw new NotesReadError('invalid', NOTES_READ_UNSUPPORTED);
  }
  if (!Object.prototype.hasOwnProperty.call(data, 'Rows') || !isRows(data.Rows)) {
    throw new NotesReadError('invalid', NOTES_READ_INVALID);
  }
  return rows(data.Rows);
}

function notesEnvelope(data) {
  if (data?.__phoneError || data == null) throw new NotesReadError('unavailable', NOTES_READ_FAILURES.unavailable);
  if (typeof data !== 'object' || Array.isArray(data)) throw new NotesReadError('invalid', NOTES_READ_UNSUPPORTED);
  if (data.Success === false) {
    const status = typeof data.Status === 'string' ? data.Status : 'invalid';
    throw new NotesReadError(status, NOTES_READ_FAILURES[status] || NOTES_READ_UNSUPPORTED);
  }
  if (data.Success !== true) throw new NotesReadError('invalid', NOTES_READ_UNSUPPORTED);
  return data;
}

export function notesTypesFromSummary(data) {
  const envelope = notesEnvelope(data);
  if (!Object.prototype.hasOwnProperty.call(envelope, 'Types') || !isRows(envelope.Types)) {
    throw new NotesReadError('invalid', NOTES_READ_INVALID);
  }
  const result = new Map();
  for (const row of rows(envelope.Types)) {
    const type = Number(pick(row, 'type', 'Type', NaN));
    const count = Number(pick(row, 'count', 'Count', NaN));
    const upperId = Number(pick(row, 'upperId', 'UpperId', NaN));
    if (!Number.isInteger(type) || type < 0 || type > 5 || result.has(type)
      || !Number.isSafeInteger(count) || count < 0
      || !Number.isSafeInteger(upperId) || upperId < 0
      || (count === 0) !== (upperId === 0)) {
      throw new NotesReadError('invalid', NOTES_READ_INVALID);
    }
    result.set(type, {count, upperId});
  }
  if (result.size !== 6) throw new NotesReadError('invalid', NOTES_READ_INVALID);
  return result;
}

export function notesMetadataFromPage(data, expectedType, {upperId, cursor = null} = {}) {
  const envelope = notesEnvelope(data);
  if (Number(envelope.Type) !== Number(expectedType) || !Object.prototype.hasOwnProperty.call(envelope, 'Rows') || !isRows(envelope.Rows)) {
    throw new NotesReadError('invalid', NOTES_READ_INVALID);
  }
  const page = rows(envelope.Rows);
  if (page.length > 50) throw new NotesReadError('invalid', NOTES_READ_INVALID);
  const normalized = page.map(row => {
    if (!row || typeof row !== 'object' || Object.prototype.hasOwnProperty.call(row, 'content') || Object.prototype.hasOwnProperty.call(row, 'Content')) {
      throw new NotesReadError('invalid', NOTES_READ_INVALID);
    }
    const id = Number(pick(row, 'id', 'Id', NaN));
    const type = Number(pick(row, 'type', 'Type', NaN));
    const title = pick(row, 'title', 'Title', null);
    const owner = pick(row, 'citizenid', 'Cid', pick(row, 'owner', 'Owner', null));
    const signatureCount = Number(pick(row, 'signatureCount', 'SignatureCount', NaN));
    const signedCount = Number(pick(row, 'signedCount', 'SignedCount', NaN));
    if (!Number.isSafeInteger(id) || id < 1 || type !== Number(expectedType)
      || (Number.isSafeInteger(Number(upperId)) && id > Number(upperId))
      || (cursor !== null && id >= Number(cursor))
      || typeof title !== 'string' || NOTE_UTF8_ENCODER.encode(title).length > NOTE_TITLE_MAX_BYTES
      || typeof owner !== 'string' || !owner || owner.length > 128
      || !Number.isSafeInteger(signatureCount) || signatureCount < 0
      || !Number.isSafeInteger(signedCount) || signedCount < 0 || signedCount > signatureCount) {
      throw new NotesReadError('invalid', NOTES_READ_INVALID);
    }
    return {
      id, type, title, owner,
      finalized: truth(pick(row, 'finalized', 'Finalized', false)),
      shared: truth(pick(row, 'shared', 'Shared', false)),
      signatureCount, signedCount,
      summary: true, detailLoaded: false,
    };
  });
  for (let index = 1; index < normalized.length; index++) {
    if (Number(normalized[index - 1].id) <= Number(normalized[index].id)) throw new NotesReadError('invalid', NOTES_READ_INVALID);
  }
  if (typeof envelope.Done !== 'boolean' || (envelope.Done !== true && (normalized.length !== 50 || !Number.isSafeInteger(Number(envelope.NextCursor))))) {
    throw new NotesReadError('invalid', NOTES_READ_INVALID);
  }
  if (normalized.length && envelope.Done !== true && Number(envelope.NextCursor) !== Number(normalized.at(-1).id)) {
    throw new NotesReadError('invalid', NOTES_READ_INVALID);
  }
  return {rows: normalized, done: envelope.Done === true, nextCursor: envelope.NextCursor == null ? null : Number(envelope.NextCursor)};
}

export function noteFromDetailResult(data, expectedId) {
  const envelope = notesEnvelope(data);
  const row = envelope.Row;
  const id = Number(pick(row, 'id', 'Id', NaN));
  const type = Number(pick(row, 'type', 'Type', NaN));
  const title = pick(row, 'title', 'Title', null);
  const content = pick(row, 'content', 'Content', null);
  const owner = pick(row, 'citizenid', 'Cid', pick(row, 'owner', 'Owner', null));
  const signatures = pick(row, 'signatures', 'Signatures', null);
  const sharees = pick(row, 'sharees', 'Sharees', null);
  if (!row || typeof row !== 'object' || Array.isArray(row)
    || !Number.isSafeInteger(id) || id < 1 || (expectedId != null && String(id) !== String(expectedId))
    || !Number.isInteger(type) || type < 0 || type > 5
    || typeof title !== 'string' || NOTE_UTF8_ENCODER.encode(title).length > NOTE_TITLE_MAX_BYTES
    || typeof content !== 'string' || NOTE_UTF8_ENCODER.encode(content).length > NOTE_CONTENT_MAX_BYTES
    || typeof owner !== 'string' || !owner || owner.length > 128
    || !isRows(signatures) || !isRows(sharees)
    || rows(signatures).some(item => !item || typeof item !== 'object' || Array.isArray(item))
    || rows(sharees).some(item => typeof item !== 'string' || item.length > 128)) {
    throw new NotesReadError('invalid', NOTES_READ_INVALID);
  }
  return {...normalizeNote(row), detailLoaded: true};
}

class NotesReadCancelled extends Error {
  constructor() { super('This Notes read is no longer current.'); this.name = 'NotesReadCancelled'; }
}

const NOTES_READ_MAX_CONCURRENT = 2;
const NOTES_READ_MIN_INTERVAL_MS = 125; // Stay below the native 12 callbacks / second per event gate.
const NOTES_READ_DISPATCH_MARGIN_MS = 1; // Account for the synchronous call from the scheduler into send().
const notesReadJobs = [];
let notesReadSlots = 0;
let notesReadDispatchPending = false;
let notesReadNextStart = 0;
let notesReadTimer = null;

function pumpNotesReadJobs() {
  for (let index = notesReadJobs.length - 1; index >= 0; index--) {
    const job = notesReadJobs[index];
    if (job.isCurrent()) continue;
    notesReadJobs.splice(index, 1);
    job.reject(new NotesReadCancelled());
  }
  if (notesReadSlots >= NOTES_READ_MAX_CONCURRENT || notesReadDispatchPending || !notesReadJobs.length) return;
  const now = globalThis.performance?.now?.() ?? Date.now();
  const delay = notesReadNextStart - now;
  if (delay > 0) {
    if (!notesReadTimer) notesReadTimer = setTimeout(() => {
      notesReadTimer = null;
      pumpNotesReadJobs();
    }, delay);
    return;
  }
  const job = notesReadJobs.shift();
  if (!job) return;
  notesReadSlots++;
  notesReadDispatchPending = true;
  notesReadNextStart = now + NOTES_READ_MIN_INTERVAL_MS;
  Promise.resolve().then(() => {
    notesReadDispatchPending = false;
    if (!job.isCurrent()) throw new NotesReadCancelled();
    // The caller may keep this task busy after queueNotesRead returns, leaving
    // the provisional deadline in the past before this microtask starts. Pace
    // from the actual dispatch, and let only one pending microtask claim that
    // window so a staggered enqueue cannot dispatch beside this read.
    const dispatchedAt = globalThis.performance?.now?.() ?? Date.now();
    notesReadNextStart = dispatchedAt + NOTES_READ_MIN_INTERVAL_MS + NOTES_READ_DISPATCH_MARGIN_MS;
    const result = job.run();
    // Start the next spacing timer as soon as this transport call is dispatched,
    // so a long read can overlap with the next read without exceeding the cap.
    pumpNotesReadJobs();
    return result;
  }).then(job.resolve, job.reject).finally(() => {
    notesReadSlots = Math.max(0, notesReadSlots - 1);
    pumpNotesReadJobs();
  });
  pumpNotesReadJobs();
}

const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const pick = (row, lower, upper, fallback = '') => row?.[lower] ?? row?.[upper] ?? fallback;
const truth = value => value === true || value === 1 || value === '1' || value === 'true';
const EDITOR_HISTORY_MAX_ACTIONS = 40;
const EDITOR_HISTORY_MAX_CONTENT_BYTES = 1_000_000;
const NOTE_TITLE_MAX_BYTES = 150;
const NOTE_CONTENT_MAX_BYTES = 100_000;
const PORTABLE_ARGUMENTS_MAX_BYTES = 131_072;
const NOTE_UTF8_ENCODER = new TextEncoder();
const PORTABLE_JSON_EXTRA_ESCAPE = /[\u007f-\u009f\u00ad\u0600-\u0604\u070f\u17b4-\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g;

function encodePortableArguments(payload) {
  // Cfx json.encode recognizes table.pack's `n` field as an array length, so
  // one packed payload serializes as [payload]. It also escapes these BMP
  // ranges as lowercase Unicode escape sequences; JSON.stringify leaves them literal.
  return JSON.stringify([payload]).replace(PORTABLE_JSON_EXTRA_ESCAPE, character =>
    `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

export function validateNoteSavePayload(payload) {
  const title = String(payload?.Title ?? ''), content = String(payload?.Content ?? '');
  if (title.includes('\0') || !title.trim()) return 'Enter a valid note title. Your draft is still here.';
  if (NOTE_UTF8_ENCODER.encode(title).length > NOTE_TITLE_MAX_BYTES) return 'This title is too long to save. Shorten it; your draft is still here.';
  if (content.includes('\0')) return 'The note contains unsupported text. Your draft is still here.';
  if (NOTE_UTF8_ENCODER.encode(content).length > NOTE_CONTENT_MAX_BYTES) return 'This note is too large to save. Shorten its text; your draft is still here.';
  try {
    // Match the Cfx json.encode representation of table.pack(Data), including
    // its array form and extra Unicode escaping, before enforcing the bridge cap.
    if (NOTE_UTF8_ENCODER.encode(encodePortableArguments(payload)).length > PORTABLE_ARGUMENTS_MAX_BYTES) {
      return 'This note is too large to save as entered. Shorten the text or simplify its formatting; your draft is still here.';
    }
  } catch {
    return 'This note cannot be encoded for the phone server. Your draft is still here.';
  }
  return null;
}

export function normalizeNote(row = {}) {
  const note = {
    id: pick(row, 'id', 'Id', null),
    type: Number(pick(row, 'type', 'Type', 0)),
    title: String(pick(row, 'title', 'Title', '')),
    content: String(pick(row, 'content', 'Content', '')),
    owner: String(pick(row, 'citizenid', 'Cid', pick(row, 'owner', 'Owner', ''))),
    finalized: truth(pick(row, 'finalized', 'Finalized', false)),
    signatures: rows(pick(row, 'signatures', 'Signatures', [])).map(item => ({...item})),
    sharees: rows(pick(row, 'sharees', 'Sharees', [])).map(String),
    editing: truth(pick(row, 'editing', 'Editing', false)),
    timestamp: pick(row, 'timestamp', 'Timestamp', pick(row, 'updated_at', 'UpdatedAt', pick(row, 'created_at', 'CreatedAt', null))),
  };
  const signatureCount = row?.signatureCount ?? row?.SignatureCount;
  const signedCount = row?.signedCount ?? row?.SignedCount;
  if (signatureCount !== undefined) note.signatureCount = Math.max(0, Number(signatureCount) || 0);
  if (signedCount !== undefined) note.signedCount = Math.max(0, Number(signedCount) || 0);
  return note;
}

export function canEditNote(note, cid, isDrop = false) {
  return note?.detailLoaded !== false && !!note?.id && !!cid && String(note.owner) === String(cid) && !note.finalized && !isDrop;
}

export function canCreateNote(type) {
  return NOTE_TYPES.find(item => item.id === Number(type))?.create === true;
}

function sanitizedHTML(value) {
  const sanitize = globalThis.window?.PeakDuoSanitize;
  if (typeof sanitize === 'function') return sanitize(String(value ?? ''));
  return `<p>${escapeHTML(String(value ?? '').replace(/<[^>]*>/g, ' '))}</p>`;
}

function documentText(markup) {
  const safe = sanitizedHTML(markup);
  const template = document.createElement('template');
  template.innerHTML = safe;
  return template.content.textContent.replace(/\s+/g, ' ').trim();
}

export function createNoteTextCache(parseMarkup = documentText) {
  const cache = new WeakMap();
  return note => {
    if (!note || typeof note !== 'object') return {plain: '', search: ''};
    const content = String(note.content ?? ''), title = String(note.title ?? '');
    let entry = cache.get(note);
    if (!entry || entry.content !== content) entry = {content, plain: parseMarkup(content), title: null, search: ''};
    if (entry.title !== title) { entry.title = title; entry.search = `${title} ${entry.plain}`.toLocaleLowerCase(); }
    cache.set(note, entry);
    return entry;
  };
}

const noteText = createNoteTextCache();
function compactExcerpt(value, limit = 240) {
  const plain = String(value ?? '').replace(/\s+/g, ' ').trim();
  return [...plain].slice(0, limit).join('') || 'No additional text';
}

export function filterNoteResults(notes, query, getText = noteText) {
  const term = String(query ?? '').trim().toLocaleLowerCase();
  return !term ? [...notes] : notes.filter(note => getText(note).search.includes(term));
}

export function pageNoteResults(results, limit = 100) {
  const total = results.length, shown = Math.max(0, Math.min(total, Math.floor(Number(limit) || 0)));
  return {items: results.slice(0, shown), total, shown, hasMore: shown < total};
}

function idOrder(a, b) {
  const left = Number(a?.id), right = Number(b?.id);
  return Number.isFinite(left) && Number.isFinite(right)
    ? left - right
    : String(a?.id ?? '').localeCompare(String(b?.id ?? ''), undefined, {numeric: true, sensitivity: 'base'});
}

function dateValue(value) {
  const stamp = Number(value);
  if (!Number.isFinite(stamp) || stamp <= 0) return null;
  return stamp < 1e12 ? stamp * 1000 : stamp;
}

export function sortNoteRows(notes, mode = 'newest', getTimestamp = note => note.timestamp) {
  const sorted = [...notes];
  if (mode === 'title') return sorted.sort((a, b) => String(a.title ?? '').localeCompare(String(b.title ?? ''), undefined, {sensitivity: 'base'}) || idOrder(a, b));
  const direction = mode === 'oldest' ? 1 : -1;
  return sorted.sort((a, b) => {
    const left = dateValue(getTimestamp(a)), right = dateValue(getTimestamp(b));
    if (left !== null && right !== null && left !== right) return (left - right) * direction;
    if (left !== null && right === null) return -1;
    if (right !== null && left === null) return 1;
    return idOrder(a, b) * direction;
  });
}

export function noteDateGroup(note, now = Date.now()) {
  const stamp = Number(note?.timestamp);
  if (!Number.isFinite(stamp) || stamp <= 0) return 'Notes';
  const date = new Date(stamp < 1e12 ? stamp * 1000 : stamp);
  if (!Number.isFinite(date.getTime())) return 'Notes';
  const today = new Date(now);
  if (date.toDateString() === today.toDateString()) return 'Today';
  today.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Yesterday';
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function noteTime(note) {
  const stamp = Number(note?.timestamp);
  if (!Number.isFinite(stamp) || stamp <= 0) return '';
  const date = new Date(stamp < 1e12 ? stamp * 1000 : stamp);
  if (!Number.isFinite(date.getTime())) return '';
  const today = new Date();
  return date.toDateString() === today.toDateString()
    ? date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const cloneNote = note => note ? {...note, signatures: rows(note.signatures).map(item => ({...item})), sharees: [...rows(note.sharees)]} : null;
const noteKey = note => String(note?.id ?? '');
const countLabel = (count, noun = 'item') => `${count} ${noun}${Number(count) === 1 ? '' : 's'}`;
function normalizeLocalState(value) {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    folders: rows(raw.folders).filter(item => item && typeof item.id === 'string' && typeof item.name === 'string').slice(0, 40).map(item => ({id: item.id.slice(0, 60), name: item.name.trim().slice(0, 40)})).filter(item => item.name),
    folderByNote: raw.folderByNote && typeof raw.folderByNote === 'object' && !Array.isArray(raw.folderByNote) ? {...raw.folderByNote} : {},
    editedAtByNote: raw.editedAtByNote && typeof raw.editedAtByNote === 'object' && !Array.isArray(raw.editedAtByNote) ? Object.fromEntries(Object.entries(raw.editedAtByNote).filter(([,stamp]) => Number.isFinite(Number(stamp)) && Number(stamp) > 0).slice(0, 500)) : {},
    pinned: [...new Set(rows(raw.pinned).map(String).filter(Boolean))].slice(0, 500),
    layout: raw.layout === 'gallery' ? 'gallery' : 'list',
    sort: raw.sort === 'title' ? 'title' : raw.sort === 'oldest' ? 'oldest' : 'newest',
  };
}

export class NotesApp extends NativeView {
  constructor(options) {
    super({...options, name: 'Notes'});
    this.isActive = typeof options.props?.isActive === 'function' ? options.props.isActive : () => true;
    this.lifecycleActive = false;
    this.element.classList.add('nx-notes');
    this.element.setAttribute('aria-label', 'Notes');
    this.player = value(this.stores?.PlayerData) || {};
    this.cid = String(this.player.Cid || '');
    this.type = 0;
    this.view = 'folders';
    this.notes = new Map();
    this.counts = new Map();
    this.verifiedTypes = new Set();
    this.excerpts = new Map();
    this.searchMatchIds = null;
    this.searchSnippets = new Map();
    this.visibleExcerptIds = new Set();
    this.searchState = null;
    this.searchEpoch = 0;
    this.excerptEpoch = 0;
    this.excerptPending = new Map();
    this.detailSelectionEpoch = 0;
    this.detailState = '';
    this.local = normalizeLocalState(readLocal(this.context, 'notes-local', null));
    this.identityInvalid = false;
    this.identityScopeEpoch = 0;
    this.currentFolderId = null;
    this.viewMode = this.local.layout;
    this.sort = this.local.sort;
    this.searchQuery = '';
    this.listLimit = 100;
    this.searchTimer = null;
    this.loading = false;
    this.loadError = '';
    this.listEpoch = 0;
    this.pendingRefreshRender = null;
    this.pendingRefreshRenderQueued = false;
    this.navigationEpoch = 0;
    this.operationEpoch = 0;
    this.saveEpoch = 0;
    this.savePromise = null;
    this.externalTarget = null;
    this.current = null;
    this.baseline = null;
    this.isDrop = false;
    this.isNew = false;
    this.editingMode = false;
    this.dirty = false;
    this.readonly = false;
    this.showSignatures = false;
    this.draft = readLocal(this.context, 'notes-draft', null);
    if (!this.draft || typeof this.draft !== 'object' || !Number.isInteger(Number(this.draft.type))) this.draft = null;
    this.domAbort = new AbortController();
    this.editRevision = 0;
    this.pendingChecklistEnter = null;
    this.editorUndoStack = [];
    this.editorRedoStack = [];
    this.pendingEditorHistory = null;
    this.pendingNativeHistory = null;
    this.editorComposing = false;
    this.compositionHistoryStart = null;
    this.render();
    this.messages(data => {
      if (data.Action === 'Duo/OpenDocument' || data.Action === 'Documents/SetDocument') {
        this.openExternal(data.Document || {}, !!data.IsDrop);
      }
    });
    if (this.stores?.PlayerData?.subscribe) {
      this.off.push(this.stores.PlayerData.subscribe(player => {
        const nextCid = String(player?.Cid || '');
        if (this.cid && nextCid !== this.cid) this.resetForIdentity(player || {});
        else { this.player = player || {}; this.cid = nextCid; }
      }));
    }
    this.listen(document, 'visibilitychange', () => this.syncLifecycle());
    this.loadFolders();
  }

  active() {
    try { return this.alive && !document.hidden && this.isActive() === true; }
    catch { return false; }
  }

  syncLifecycle() {
    const active = this.active();
    if (active === this.lifecycleActive) return;
    this.lifecycleActive = active;
    if (!active) {
      clearTimeout(this.searchTimer); this.searchTimer = null;
      if (this.searchState && !this.searchState.done && !this.searchState.paused) {
        ++this.searchEpoch;
        this.searchState.epoch = this.searchEpoch;
        this.searchState.paused = true;
      }
      ++this.excerptEpoch;
      this.visibleExcerptIds.clear();
      if (this.view === 'editor' && this.current?.detailLoaded === false) {
        ++this.detailSelectionEpoch;
        this.detailState = 'Loading paused while Notes is in the background. Return to resume this note.';
        if (this.alive) this.render();
      } else if (this.view === 'list') this.refreshSearchPresentation();
      pumpNotesReadJobs();
      return;
    }
    if (this.view === 'editor' && this.current?.detailLoaded === false) {
      this.detailState = 'loading';
      this.loadSelectedDetail(this.current.id, this.navigationEpoch, this.detailSelectionEpoch);
    } else if (this.view === 'list') {
      this.refreshSearchPresentation();
      const schedule = globalThis.requestAnimationFrame || (callback => setTimeout(callback, 0));
      schedule(() => this.scheduleVisibleExcerptHydration());
    }
  }

  onActivate() { this.syncLifecycle(); }
  onDeactivate() { this.syncLifecycle(); }

  button(label, glyph, fn, cls = '') {
    const button = super.button(label, glyph, fn, cls);
    if (glyph && button.querySelector('svg')) {
      const template = document.createElement('template'); template.innerHTML = noteGlyph(glyph);
      button.querySelector('svg').replaceWith(template.content.firstElementChild);
    }
    return button;
  }

  aliveAt(epoch) { return this.alive && epoch === this.navigationEpoch; }
  listenView(target, event, fn, opts = {}) { target.addEventListener(event, fn, {...opts, signal: this.domAbort.signal}); }
  nameFor(type) { return NOTE_TYPES.find(item => item.id === Number(type))?.name || 'Notes'; }
  currentEditable() { return !this.identityInvalid && (this.isNew || (this.current?.detailLoaded === true && canEditNote(this.current, this.cid, this.isDrop))); }
  canShareNote(note = this.current) { return !this.identityInvalid && note?.detailLoaded === true && note?.id != null && !this.isNew && !this.isDrop && !!this.cid && String(note.owner) === this.cid; }
  localNoteKey(note) { return noteKey(note); }
  localTimestamp(note) { return note?.timestamp || this.local.editedAtByNote[noteKey(note)] || null; }
  dateGroup(note) { return noteDateGroup({...note, timestamp: this.localTimestamp(note)}); }
  dateLabel(note) { return noteTime({...note, timestamp: this.localTimestamp(note)}); }
  allNotes() { return NOTE_TYPES.flatMap(type => rows(this.notes.get(type.id))); }
  persistLocal() { this.local.layout = this.viewMode; this.local.sort = this.sort; return writeLocal(this.context, 'notes-local', this.local); }
  noteList() {
    let list = [...(this.type === -1 ? this.allNotes() : rows(this.notes.get(this.type)))];
    if (this.currentFolderId === 'pinned') list = list.filter(note => this.local.pinned.includes(noteKey(note)));
    else if (this.currentFolderId) list = list.filter(note => this.local.folderByNote[noteKey(note)] === this.currentFolderId);
    return sortNoteRows(list, this.sort, note => this.localTimestamp(note));
  }

  hasVerifiedFolders() { return NOTE_TYPES.every(({id}) => this.verifiedTypes.has(id)); }
  hasVerifiedList(type) { return Number(type) === -1 ? this.hasVerifiedFolders() : this.verifiedTypes.has(Number(type)); }

  rememberNotes(type, notes) {
    ++this.excerptEpoch; this.visibleExcerptIds.clear();
    this.excerpts.clear(); this.searchSnippets.clear();
    if (Number(type) === -1) {
      this.notes = notes;
      for (const {id} of NOTE_TYPES) { this.verifiedTypes.add(id); this.counts.set(id, rows(notes.get(id)).length); }
    } else {
      this.notes.set(Number(type), notes);
      this.verifiedTypes.add(Number(type));
      this.counts.set(Number(type), rows(notes).length);
    }
  }

  clearIdentityBoundEditorState() {
    this.editArea = null; this.titleInput = null; this.editorFooter = null;
    this.editorUndoStack.length = 0; this.editorRedoStack.length = 0;
    this.pendingEditorHistory = null; this.pendingNativeHistory = null;
    this.pendingChecklistEnter = null; this.compositionHistoryStart = null; this.editorComposing = false;
    this.performingEditorCommand = false; this.restoringEditorHistory = false;
    this.externalTarget = null;
    ++this.editRevision;
  }

  resetForIdentity(player) {
    if (this.current && this.dirty) this.captureDraft();
    ++this.identityScopeEpoch;
    ++this.navigationEpoch; ++this.listEpoch; ++this.operationEpoch; ++this.saveEpoch; ++this.excerptEpoch;
    this.savePromise = null; this.saving = false;
    clearTimeout(this.draftTimer);
    this.clearIdentityBoundEditorState();
    this.player = player; this.cid = String(player.Cid || '');
    this.notes.clear(); this.counts.clear(); this.verifiedTypes.clear(); this.excerpts.clear(); this.searchSnippets.clear(); this.visibleExcerptIds.clear(); this.excerptPending.clear();
    this.searchMatchIds = null; this.searchState = null; ++this.searchEpoch; ++this.detailSelectionEpoch; this.detailState = '';
    this.current = null; this.baseline = null; this.isDrop = false;
    this.isNew = false; this.editingMode = false; this.dirty = false; this.showSignatures = false; this.view = 'folders'; this.saving = false;
    this.searchQuery = ''; this.draft = null; this.identityInvalid = true;
    this.render(); this.loadFolders();
  }

  readIsCurrent(expectedCid, identityScope, predicate = () => true) {
    return this.alive && !this.identityInvalid && this.cid === expectedCid
      && this.identityScopeEpoch === identityScope && predicate();
  }

  queueNotesRead(run, isCurrent, priority = false) {
    return new Promise((resolve, reject) => {
      const job = {run, isCurrent, resolve, reject};
      if (priority) notesReadJobs.unshift(job); else notesReadJobs.push(job);
      pumpNotesReadJobs();
    });
  }

  async sendNotesRead(event, payload, isCurrent, priority = false) {
    if (this.identityInvalid || !this.cid) throw new NotesReadError('identity', NOTES_READ_FAILURES.identity);
    const expectedCid = this.cid, identityScope = this.identityScopeEpoch;
    let data;
    try {
      data = await this.queueNotesRead(() => this.send(event, {...payload, ExpectedCid: expectedCid}), isCurrent, priority);
    } catch (error) {
      if (error instanceof NotesReadCancelled) throw error;
      throw new NotesReadError('unavailable', NOTES_READ_FAILURES.unavailable);
    }
    try {
      notesEnvelope(data);
      return data;
    } catch (error) {
      if (error?.status === 'identity') {
        error.expectedCid = expectedCid;
        error.identityScope = identityScope;
        this.invalidateForIdentity(error);
      }
      throw error;
    }
  }

  async fetchSummary(isCurrent) {
    return notesTypesFromSummary(await this.sendNotesRead('Documents/GetNotesSummary', {}, isCurrent));
  }

  async fetchType(type, summary, isCurrent) {
    if (this.identityInvalid) throw new NotesReadError('identity', NOTES_READ_FAILURES.identity);
    summary ||= await this.fetchSummary(isCurrent);
    const meta = summary.get(Number(type));
    if (!meta) throw new NotesReadError('invalid', NOTES_READ_INVALID);
    if (meta.count === 0) return [];
    const result = [];
    let cursor = null, done = false;
    while (!done && result.length < meta.count) {
      if (!isCurrent()) throw new NotesReadCancelled();
      const payload = {Type: Number(type), UpperId: meta.upperId};
      if (cursor !== null) payload.Cursor = cursor;
      const page = notesMetadataFromPage(await this.sendNotesRead('Documents/GetNotesMetadataPage', payload, isCurrent), type, {upperId: meta.upperId, cursor});
      if (result.length + page.rows.length > meta.count) throw new NotesReadError('changed', NOTES_READ_FAILURES.changed);
      result.push(...page.rows);
      if (page.done) done = true;
      else {
        if (page.nextCursor === null || (cursor !== null && page.nextCursor >= cursor)) throw new NotesReadError('invalid', NOTES_READ_INVALID);
        cursor = page.nextCursor;
      }
      if (result.length > meta.count) throw new NotesReadError('invalid', NOTES_READ_INVALID);
    }
    if (result.length !== meta.count) throw new NotesReadError('changed', NOTES_READ_FAILURES.changed);
    return result;
  }

  invalidateForIdentity(error) {
    if (!this.alive || this.identityInvalid
      || (error?.expectedCid !== undefined && error.expectedCid !== this.cid)
      || (error?.identityScope !== undefined && error.identityScope !== this.identityScopeEpoch)) return false;
    if (this.current && this.dirty) this.captureDraft();
    ++this.identityScopeEpoch;
    ++this.navigationEpoch; ++this.listEpoch; ++this.operationEpoch; ++this.saveEpoch;
    clearTimeout(this.draftTimer); clearTimeout(this.searchTimer);
    this.clearIdentityBoundEditorState();
    this.pendingRefreshRender = null; this.pendingRefreshRenderQueued = false;
    this.savePromise = null; this.saving = false; this.loading = false;
    this.notes.clear(); this.verifiedTypes.clear();
    this.current = null; this.baseline = null; this.isDrop = false; this.isNew = false;
    this.editingMode = false; this.dirty = false; this.showSignatures = false;
    this.view = 'folders'; this.type = 0; this.currentFolderId = null; this.searchQuery = '';
    // Preserve any recovery draft in localStorage, but keep it out of this
    // invalid identity session until Notes is reopened under a trusted CID.
    this.draft = null;
    this.identityInvalid = true;
    this.loadError = error?.message || NOTES_READ_FAILURES.identity;
    this.render();
    return true;
  }

  async fetchAllTypes(isCurrent) {
    const summary = await this.fetchSummary(isCurrent);
    const result = new Map(); let next = 0, failed = false;
    const workers = Array.from({length: Math.min(2, NOTE_TYPES.length)}, async () => {
      while (!failed && isCurrent()) {
        const type = NOTE_TYPES[next++];
        if (!type) return;
        try { result.set(type.id, await this.fetchType(type.id, summary, isCurrent)); }
        catch (error) { failed = true; throw error; }
      }
    });
    await Promise.all(workers);
    if (!isCurrent()) throw new NotesReadCancelled();
    return result;
  }

  async fetchNoteDetail(id, isCurrent, priority = false) {
    const result = await this.sendNotesRead('Documents/GetNoteDetail', {Id: id}, isCurrent, priority);
    const note = noteFromDetailResult(result, id);
    if (String(note.id) !== String(id)) throw new NotesReadError('invalid', NOTES_READ_INVALID);
    return {...note, detailLoaded: true};
  }

  rememberExcerpt(id, excerpt) {
    const key = String(id);
    this.excerpts.delete(key); this.excerpts.set(key, compactExcerpt(excerpt));
    while (this.excerpts.size > 10) this.excerpts.delete(this.excerpts.keys().next().value);
  }

  updateExcerptRow(id, excerpt) {
    if (!this.list?.isConnected) return;
    for (const row of this.list.querySelectorAll('.notes-note-row[data-note-id]')) {
      if (row.dataset.noteId === String(id)) {
        const target = row.querySelector('.notes-note-excerpt');
        if (target) target.textContent = compactExcerpt(excerpt);
      }
    }
  }

  scheduleExcerptHydration(notes) {
    const epoch = this.excerptEpoch;
    const expectedCid = this.cid, identityScope = this.identityScopeEpoch, listEpoch = this.listEpoch, navigationEpoch = this.navigationEpoch;
    const searchEpoch = this.searchEpoch, searchMode = !!this.searchQuery.trim();
    const isCurrent = note => () => this.readIsCurrent(expectedCid, identityScope,
      () => epoch === this.excerptEpoch && listEpoch === this.listEpoch && navigationEpoch === this.navigationEpoch
        && this.view === 'list' && this.visibleExcerptIds.has(noteKey(note))
        && this.active()
        && (searchMode ? searchEpoch === this.searchEpoch && this.searchState?.done === true : !this.searchQuery.trim()));
    const visible = rows(notes).slice(0, 10);
    const target = searchMode ? this.searchSnippets : this.excerpts;
    const pending = visible.filter(note => !target.has(noteKey(note)) && !this.excerptPending.has(noteKey(note)));
    for (const note of pending) {
      const key = noteKey(note), token = Symbol(); this.excerptPending.set(key, token);
      for (const row of this.list?.querySelectorAll('.notes-note-row[data-note-id]') || []) {
        if (row.dataset.noteId === key) { const target = row.querySelector('.notes-note-excerpt'); if (target) target.textContent = 'Loading preview…'; }
      }
      const current = isCurrent(note);
      this.fetchNoteDetail(note.id, current).then(detail => {
        if (!current()) return;
        const excerpt = compactExcerpt(documentText(detail.content));
        target.delete(key); target.set(key, excerpt);
        while (target.size > 10) target.delete(target.keys().next().value);
        this.updateExcerptRow(key, excerpt);
      }).catch(error => {
        if (error instanceof NotesReadCancelled || !current() || error?.status === 'identity') return;
        this.updateExcerptRow(key, 'Preview could not load');
      }).finally(() => {
        if (this.excerptPending.get(key) === token) this.excerptPending.delete(key);
        if (!current() && this.alive && this.active() && this.view === 'list') {
          const schedule = globalThis.requestAnimationFrame || (callback => setTimeout(callback, 0));
          schedule(() => this.scheduleVisibleExcerptHydration());
        }
      });
    }
  }

  scheduleVisibleExcerptHydration() {
    // A refresh can briefly render the last verified catalog while its exact
    // summary and keyset pages are in flight. Wait for that catalog to settle
    // before hydrating row details so the same visible IDs are not fetched
    // again against the replacement list.
    if (!this.alive || !this.active() || this.loading || this.view !== 'list' || !this.list?.isConnected) return;
    const searchMode = !!this.searchQuery.trim();
    if (searchMode && this.searchState?.done !== true) return;
    const bounds = this.list.getBoundingClientRect();
    if (!(bounds.height > 0)) return;
    const ids = [];
    for (const row of this.list.querySelectorAll('.notes-note-row[data-note-id]')) {
      const rect = row.getBoundingClientRect();
      if (rect.bottom > bounds.top && rect.top < bounds.bottom) ids.push(row.dataset.noteId);
      if (ids.length >= 10) break;
    }
    this.visibleExcerptIds = new Set(ids);
    const notesById = new Map(this.noteList().map(note => [noteKey(note), note]));
    this.scheduleExcerptHydration(ids.map(id => notesById.get(id)).filter(Boolean));
  }

  async scanNoteBodies(term, searchEpoch) {
    const notes = this.noteList();
    const expectedCid = this.cid, identityScope = this.identityScopeEpoch, listEpoch = this.listEpoch, navigationEpoch = this.navigationEpoch;
    const isCurrent = () => this.readIsCurrent(expectedCid, identityScope,
      () => searchEpoch === this.searchEpoch && listEpoch === this.listEpoch && navigationEpoch === this.navigationEpoch
        && this.view === 'list' && this.active());
    const state = this.searchState;
    if (!state || state.epoch !== searchEpoch || !isCurrent()) return;
    const matches = this.searchMatchIds || new Set();
    const candidates = notes.filter(note => !String(note.title || '').toLocaleLowerCase().includes(term));
    state.checked = notes.length - candidates.length;
    this.refreshSearchPresentation();
    let next = 0;
    const worker = async () => {
      while (isCurrent()) {
        const note = candidates[next++];
        if (!note) return;
        try {
          const detail = await this.fetchNoteDetail(note.id, isCurrent);
          if (!isCurrent()) return;
          if (detail.type !== note.type) throw new NotesReadError('invalid', NOTES_READ_INVALID);
          const plain = documentText(detail.content);
          if (`${note.title} ${plain}`.toLocaleLowerCase().includes(term)) {
            matches.add(noteKey(note));
          }
        } catch (error) {
          if (error instanceof NotesReadCancelled || !isCurrent()) return;
          if (error?.status === 'identity') return;
          state.failed++;
        }
        state.checked++;
        if (state.checked === state.total || state.checked % 8 === 0) this.refreshSearchPresentation();
      }
    };
    await Promise.all([worker(), worker()]);
    if (!isCurrent()) return;
    state.done = true;
    this.searchMatchIds = matches;
    this.renderListResults(this.listResults, this.noteList());
  }

  refreshSearchPresentation() {
    if (!this.alive || this.view !== 'list' || !this.searchState || this.searchState.epoch !== this.searchEpoch || !this.listResults?.isConnected) return;
    const line = this.listResults.querySelector('.notes-search-status');
    if (!line) return;
    const state = this.searchState;
    line.firstChild.textContent = state.paused
      ? `Search paused while Notes is in the background. ${state.checked} of ${state.total} notes checked; results may be incomplete.`
      : state.done
      ? state.failed ? `Search incomplete. ${state.failed} note${state.failed === 1 ? '' : 's'} could not be checked.` : `${state.checked} notes checked.`
      : `Searching note contents: ${state.checked} of ${state.total} checked. Results may be incomplete until the search finishes.`;
    const resume = line.querySelector('.notes-search-resume');
    if (state.paused && !resume) line.append(this.textButton('Resume search', 'refresh', () => this.scheduleListSearch(this.searchQuery), 'notes-search-resume'));
    else if (!state.paused && resume) resume.remove();
  }

  renderRefreshedView(epoch) {
    if (!this.alive || epoch !== this.listEpoch || this.identityInvalid) return;
    if (this.sheet) {
      this.pendingRefreshRender = {
        epoch,
        navigationEpoch: this.navigationEpoch,
        view: this.view,
        type: this.type,
        folderId: this.currentFolderId,
        cid: this.cid,
      };
      return;
    }
    this.pendingRefreshRender = null;
    const focused = this.element.contains(document.activeElement) ? document.activeElement : null;
    const focusKey = focused ? this.focusRestoreKey(focused) : null;
    this.render();
    if (focusKey && !this.sheet && this.alive) this.equivalentFocusTarget(focusKey)?.focus({preventScroll: true});
  }

  focusRestoreKey(node) {
    if (!node || !this.element.contains(node) || !node.matches('button, input, textarea, select, [tabindex]')) return null;
    const identity = ['data-local-folder', 'data-type'].find(name => node.hasAttribute(name))
      || ['aria-label', 'title'].find(name => node.hasAttribute(name));
    if (!identity) return null;
    return {
      tag: node.tagName.toLowerCase(),
      classes: [...node.classList].filter(name => name.startsWith('notes-')),
      attribute: identity,
      value: node.getAttribute(identity),
    };
  }

  equivalentFocusTarget(key) {
    if (!key) return null;
    return [...this.element.querySelectorAll(key.tag)].find(node =>
      key.classes.every(name => node.classList.contains(name))
      && node.getAttribute(key.attribute) === key.value
      && !node.disabled && !node.hidden,
    ) || null;
  }

  flushPendingRefreshRender(restoredFocus = null) {
    if (!this.pendingRefreshRender || this.pendingRefreshRenderQueued) return;
    const focusKey = restoredFocus && document.activeElement === restoredFocus ? this.focusRestoreKey(restoredFocus) : null;
    this.pendingRefreshRenderQueued = true;
    queueMicrotask(() => {
      this.pendingRefreshRenderQueued = false;
      const pending = this.pendingRefreshRender;
      if (!pending || !this.alive || this.sheet) return;
      const stillCurrent = pending.epoch === this.listEpoch
        && pending.navigationEpoch === this.navigationEpoch
        && pending.view === this.view
        && pending.type === this.type
        && pending.folderId === this.currentFolderId
        && pending.cid === this.cid
        && !this.identityInvalid;
      this.pendingRefreshRender = null;
      if (stillCurrent) {
        const mayRestoreFocus = !!focusKey && restoredFocus?.isConnected && document.activeElement === restoredFocus;
        this.render();
        if (mayRestoreFocus && !this.sheet && this.alive) this.equivalentFocusTarget(focusKey)?.focus({preventScroll: true});
      }
    });
  }

  closeSheet() {
    const hadSheet = !!this.sheet;
    const focused = hadSheet ? this.sheet.focused : null;
    super.closeSheet();
    if (hadSheet) this.flushPendingRefreshRender(focused && document.activeElement === focused ? focused : null);
  }

  async loadFolders() {
    const epoch = ++this.listEpoch;
    pumpNotesReadJobs();
    const expectedCid = this.cid, identityScope = this.identityScopeEpoch, navigationEpoch = this.navigationEpoch;
    const isCurrent = () => this.readIsCurrent(expectedCid, identityScope, () => epoch === this.listEpoch && navigationEpoch === this.navigationEpoch && this.view === 'folders');
    this.loading = true; this.loadError = '';
    if (this.identityInvalid) { this.loading = false; this.loadError = NOTES_READ_FAILURES.identity; this.render(); return; }
    if (this.view === 'folders') this.renderRefreshedView(epoch);
    try {
      const notes = await this.fetchAllTypes(isCurrent);
      if (!this.alive || epoch !== this.listEpoch) return;
      this.rememberNotes(-1, notes);
    } catch (error) {
      if (this.alive && epoch === this.listEpoch) {
        if (error?.status === 'identity' && error.expectedCid === this.cid) this.invalidateForIdentity(error);
        else this.loadError = error?.message || 'The Notes folders could not be loaded.';
      }
    } finally {
      if (this.alive && epoch === this.listEpoch) { this.loading = false; if (this.view === 'folders') this.renderRefreshedView(epoch); }
    }
  }

  async loadType(type = this.type) {
    type = Number(type);
    if (!NOTE_TYPES.some(item => item.id === type) && type !== -1) return;
    if (this.identityInvalid) { this.loadError = NOTES_READ_FAILURES.identity; this.view = 'folders'; this.render(); return; }
    this.type = type; if (type !== -1) this.currentFolderId = null; this.view = 'list'; this.searchQuery = ''; this.listLimit = 100; this.loadError = '';
    const epoch = ++this.listEpoch; const navigationEpoch = ++this.navigationEpoch;
    pumpNotesReadJobs();
    ++this.searchEpoch; ++this.excerptEpoch; this.visibleExcerptIds.clear(); this.searchMatchIds = null; this.searchSnippets.clear(); this.searchState = null;
    const expectedCid = this.cid, identityScope = this.identityScopeEpoch;
    const isCurrent = () => this.readIsCurrent(expectedCid, identityScope, () => epoch === this.listEpoch && navigationEpoch === this.navigationEpoch && this.view === 'list' && this.type === type);
    this.loading = true; this.render();
    try {
      const notes = type === -1 ? await this.fetchAllTypes(isCurrent) : await this.fetchType(type, null, isCurrent);
      if (!this.alive || epoch !== this.listEpoch || this.view !== 'list' || this.type !== type) return;
      this.rememberNotes(type, notes);
      this.searchMatchIds = null;
    } catch (error) {
      if (this.alive && epoch === this.listEpoch) {
        if (error?.status === 'identity' && error.expectedCid === this.cid) this.invalidateForIdentity(error);
        else this.loadError = error?.message || 'The Notes list could not be loaded.';
      }
    } finally {
      if (this.alive && epoch === this.listEpoch && this.view === 'list') { this.loading = false; this.renderRefreshedView(epoch); }
    }
  }

  async refreshCurrentType() {
    if (this.identityInvalid) return false;
    const type = this.type, epoch = ++this.listEpoch;
    pumpNotesReadJobs();
    const expectedCid = this.cid, identityScope = this.identityScopeEpoch;
    const isCurrent = () => this.readIsCurrent(expectedCid, identityScope, () => epoch === this.listEpoch);
    this.loading = true; this.loadError = '';
    if (this.view === 'list') this.refreshList();
    try {
      const notes = type === -1 ? await this.fetchAllTypes(isCurrent) : await this.fetchType(type, null, isCurrent);
      if (!this.alive || epoch !== this.listEpoch || this.type !== type) return false;
      this.rememberNotes(type, notes);
      this.searchMatchIds = null;
      return true;
    } catch (error) {
      if (this.alive && epoch === this.listEpoch) {
        if (error?.status === 'identity' && error.expectedCid === this.cid) this.invalidateForIdentity(error);
        else this.loadError = error?.message || 'The Notes list could not be refreshed.';
      }
      return false;
    } finally {
      if (this.alive && epoch === this.listEpoch) { this.loading = false; if (this.view === 'list') this.refreshList(); }
    }
  }

  render() {
    pumpNotesReadJobs();
    if (this.identityInvalid) this.view = 'folders';
    this.pendingRefreshRender = null;
    const preserveListSearch = this.view === 'list' && this.element.dataset.notesView === 'list';
    if (!preserveListSearch) { clearTimeout(this.searchTimer); this.searchTimer = null; }
    this.domAbort?.abort(); this.domAbort = new AbortController();
    this.closeSheet(); this.element.replaceChildren(); this.element.dataset.notesView = this.view;
    if (this.view === 'folders') this.renderFolders();
    else if (this.view === 'list') this.renderList();
    else if (this.view === 'editor') this.renderEditor();
    else if (this.view === 'signatures') this.renderSignatures();
  }

  makeHeader({title, overline = '', leading, trailing = []}) {
    const header = el('header', 'notes-header');
    const line = el('div', 'notes-header-line');
    if (leading) line.append(leading);
    if (overline) line.append(el('span', 'notes-overline', overline));
    line.append(...trailing);
    header.append(line, el('h1', 'notes-large-title', title));
    return header;
  }

  renderFolders() {
    const createFolder = this.button('Create folder on this device', 'folder-plus', () => this.createFolderSheet(), 'notes-icon-action notes-new-folder');
    createFolder.hidden = this.identityInvalid;
    createFolder.disabled = this.identityInvalid;
    const head = this.makeHeader({title: 'Folders', trailing: [createFolder]});
    head.querySelector('.notes-header-line').prepend(el('span', 'notes-toolbar-spacer'));
    const content = el('main', 'notes-scroll'); content.setAttribute('aria-label', 'Notes folders');
    if (this.identityInvalid) {
      content.append(this.stateMessage('Character changed', this.loadError || NOTES_READ_FAILURES.identity, 'error', null, 'identity'));
      this.element.append(head, content);
      return;
    }
    const verified = this.hasVerifiedFolders();
    if (this.loading && !verified) content.append(this.stateMessage('Loading your folders', 'Your saved Notes and documents will appear here.', 'loading'));
    else if (this.loadError && !verified) content.append(this.stateMessage('Unable to load folders', this.loadError, 'error', () => this.loadFolders()));
    else {
      if (this.loadError) {
        const staleReason = this.loadError === NOTES_READ_FAILURES.unavailable
          ? 'Storage unavailable. Saved counts may be out of date.'
          : this.loadError;
        content.append(this.staleBanner('Showing saved counts', staleReason, () => this.loadFolders()));
      }
      const section = el('section', 'notes-folder-section'); section.append(el('h2', 'notes-section-title', 'My Folders'));
      const card = el('div', 'notes-folder-group');
      for (const type of NOTE_TYPES) {
        const count = this.counts.get(type.id) ?? rows(this.notes.get(type.id)).length;
        const row = this.button(`${type.name}, ${countLabel(count, type.item)}`, null, () => this.loadType(type.id), 'notes-folder-row');
        row.dataset.type = String(type.id);
        const glyph = el('span', 'notes-folder-glyph'); glyph.innerHTML = folderGlyph(type.glyph);
        const copy = el('span', 'notes-folder-copy'); copy.append(el('strong', '', type.name));
        row.replaceChildren(glyph, copy, el('span', 'notes-folder-count', String(count)), el('span', 'notes-folder-chevron', '›'));
        card.append(row);
      }
      section.append(card);
      const pinned = this.allNotes().filter(note => this.local.pinned.includes(noteKey(note))).length;
      const pinnedSection = el('section', 'notes-folder-section notes-local-section'); pinnedSection.append(el('h2', 'notes-section-title', 'On This Device'));
      const localGroup = el('div', 'notes-folder-group');
      const pinnedRow = this.button(`Pinned, ${countLabel(pinned)}, stored on this device`, null, () => { this.currentFolderId = 'pinned'; this.loadType(-1); }, 'notes-folder-row');
      pinnedRow.dataset.localFolder = 'pinned';
      pinnedRow.replaceChildren(this.folderIcon('notebook'), this.folderCopy('Pinned', 'On this device'), el('span', 'notes-folder-count', String(pinned)), el('span', 'notes-folder-chevron', '›'));
      localGroup.append(pinnedRow);
      for (const folder of this.local.folders) {
        const count = this.allNotes().filter(note => this.local.folderByNote[noteKey(note)] === folder.id).length;
        const item = el('div', 'notes-local-folder-item');
        const row = this.button(`${folder.name}, ${countLabel(count)}, stored on this device`, null, () => { this.currentFolderId = folder.id; this.loadType(-1); }, 'notes-folder-row');
        row.dataset.localFolder = folder.id;
        row.replaceChildren(this.folderIcon('house'), this.folderCopy(folder.name, 'On this device'), el('span', 'notes-folder-count', String(count)), el('span', 'notes-folder-chevron', '›'));
        item.append(row, this.button(`Manage ${folder.name}`, 'more', () => this.manageFolderSheet(folder), 'notes-folder-manage'));
        localGroup.append(item);
      }
      pinnedSection.append(localGroup, el('p', 'notes-local-note', 'Local folders and pins are saved only on this device.'));
      content.append(section, pinnedSection);
      const recovery = this.renderDraftRecovery();
      if (recovery) section.append(recovery);
    }
    this.element.append(head, content, this.renderDock({placeholder: 'Search folders', onSearch: query => { this.searchQuery = query; this.refreshFolderFilter(content); }}));
    if (verified) this.refreshFolderFilter(content);
  }

  refreshFolderFilter(content) {
    const query = this.searchQuery.trim().toLocaleLowerCase();
    for (const row of content.querySelectorAll('.notes-folder-row')) row.hidden = query && !row.textContent.toLocaleLowerCase().includes(query);
  }

  folderIcon(name) { const glyph = el('span', 'notes-folder-glyph'); glyph.innerHTML = folderGlyph(name); return glyph; }
  folderCopy(name, detail) { const copy = el('span', 'notes-folder-copy'); copy.append(el('strong', '', name), el('small', '', detail)); return copy; }

  createFolderSheet(afterCreate = null) {
    if (this.local.folders.length >= 40) { this.notify('This character already has 40 local folders.'); return; }
    const panel = this.openSheet('New folder'); panel.classList.add('notes-input-sheet');
    const label = el('label', 'notes-field'); label.append(el('span', '', 'Folder name'));
    const input = el('input'); input.type = 'text'; input.maxLength = 40; input.placeholder = 'New Folder'; input.setAttribute('aria-label', 'Folder name'); label.append(input);
    const create = this.textButton('Create folder', 'plus', () => {
      const name = input.value.trim().slice(0, 40);
      if (!name) { this.notify('Enter a folder name.'); input.focus(); return; }
      if (this.local.folders.some(folder => folder.name.toLocaleLowerCase() === name.toLocaleLowerCase())) { this.notify('A folder with that name already exists.'); input.focus(); return; }
      const id = 'local-' + (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);
      this.local.folders.push({id, name});
      if (!this.persistLocal()) { this.local.folders.pop(); this.notify('This folder could not be saved on this device.'); return; }
      this.closeSheet();
      if (afterCreate) afterCreate(id); else this.render();
    }, 'notes-primary-action');
    panel.append(el('p', 'notes-sheet-help', 'Local folders are saved on this device for this character. Moving a note here leaves its server category unchanged.'), label, create);
  }

  manageFolderSheet(folder) {
    const panel = this.openSheet(folder.name); panel.classList.add('notes-actions-sheet');
    panel.append(this.textButton('Rename folder', 'edit', () => this.renameFolderSheet(folder), 'notes-action-row'));
    panel.append(this.textButton('Delete folder', 'trash', () => this.deleteFolderSheet(folder), 'notes-action-row notes-action-danger'));
    panel.append(el('p', 'notes-sheet-help', 'Folder names and membership are stored on this device. Deleting a folder keeps notes in their server categories.'));
  }

  renameFolderSheet(folder) {
    const panel = this.openSheet('Rename folder'); panel.classList.add('notes-input-sheet');
    const label = el('label', 'notes-field'); label.append(el('span', '', 'Folder name'));
    const input = el('input'); input.type = 'text'; input.maxLength = 40; input.value = folder.name; input.setAttribute('aria-label', 'Folder name'); label.append(input);
    panel.append(label, this.textButton('Save name', 'check', () => {
      const name = input.value.trim().slice(0, 40);
      if (!name) { this.notify('Enter a folder name.'); input.focus(); return; }
      if (this.local.folders.some(item => item.id !== folder.id && item.name.toLocaleLowerCase() === name.toLocaleLowerCase())) { this.notify('A folder with that name already exists.'); input.focus(); return; }
      const previous = folder.name; folder.name = name;
      if (!this.persistLocal()) { folder.name = previous; this.notify('This folder name could not be saved on this device.'); return; }
      this.closeSheet(); this.render();
    }, 'notes-primary-action'));
  }

  deleteFolderSheet(folder) {
    const panel = this.openSheet('Delete folder'); panel.classList.add('notes-confirm-sheet');
    panel.append(el('p', 'notes-sheet-help', `Delete “${folder.name}”? Notes will stay in their server categories.`));
    panel.append(this.textButton('Delete folder', 'trash', () => {
      const before = this.local; const folderByNote = {...before.folderByNote};
      for (const [key, id] of Object.entries(folderByNote)) if (id === folder.id) delete folderByNote[key];
      this.local = {...before, folders: before.folders.filter(item => item.id !== folder.id), folderByNote};
      if (!this.persistLocal()) { this.local = before; this.notify('This folder could not be deleted on this device.'); return; }
      if (this.currentFolderId === folder.id) { this.currentFolderId = null; this.type = 0; this.view = 'folders'; }
      this.closeSheet(); this.render();
    }, 'notes-primary-action notes-danger-action'));
  }

  renderList() {
    const notes = this.noteList();
    const folderName = this.currentFolderId === 'pinned' ? 'Pinned' : this.currentFolderId ? this.local.folders.find(folder => folder.id === this.currentFolderId)?.name || 'Folder' : this.nameFor(this.type);
    const canCreate = canCreateNote(this.type === -1 ? 0 : this.type);
    const leading = this.button('Back to folders', 'back', () => this.toFolders(), 'notes-back-button');
    const layoutLabel = this.viewMode === 'list' ? 'Show gallery view' : 'Show list view';
    const actions = [
      this.button('Sort Notes', 'sliders', () => this.openSortSheet(), 'notes-icon-action'),
      this.button(layoutLabel, this.viewMode === 'list' ? 'gallery' : 'list', () => this.toggleViewMode(), 'notes-icon-action'),
      this.button('Refresh Notes', 'refresh', () => this.loadType(this.type), 'notes-icon-action'),
    ];
    const head = this.makeHeader({title: folderName, leading, trailing: actions});
    const content = el('main', `notes-scroll${this.viewMode === 'gallery' ? ' is-gallery' : ''}`); content.setAttribute('aria-label', `${folderName} notes`); this.list = content;
    this.listenView(content, 'scroll', () => this.scheduleVisibleExcerptHydration(), {passive: true});
    const recovery = this.renderDraftRecovery(); if (recovery) content.append(recovery);
    const verified = this.hasVerifiedList(this.type);
    if (this.loadError && verified) {
      const staleReason = this.loadError === NOTES_READ_FAILURES.unavailable
        ? 'Storage unavailable. Saved notes may be out of date.'
        : this.loadError;
      content.append(this.staleBanner('Showing saved notes', staleReason, () => this.loadType(this.type)));
    }
    this.listResults = el('div', 'notes-list-results'); content.append(this.listResults);
    if (this.loading && !verified) this.listResults.append(this.stateMessage('Loading notes', 'Your notes will appear here.', 'loading'));
    else if (this.loadError && !verified) this.listResults.append(this.stateMessage('Unable to load notes', this.loadError, 'error', () => this.loadType(this.type)));
    else this.renderListResults(this.listResults, notes);
    this.element.append(head, content, this.renderDock({placeholder: 'Search Notes', onSearch: query => this.scheduleListSearch(query), canCreate}));
  }

  scheduleListSearch(query) {
    this.searchQuery = String(query ?? ''); this.listLimit = 100;
    const searchEpoch = ++this.searchEpoch;
    pumpNotesReadJobs();
    const term = this.searchQuery.trim().toLocaleLowerCase();
    ++this.excerptEpoch;
    this.visibleExcerptIds.clear();
    this.searchSnippets.clear();
    if (term) this.excerpts.clear();
    this.searchMatchIds = term ? new Set(this.noteList().filter(note => String(note.title || '').toLocaleLowerCase().includes(term)).map(noteKey)) : null;
    this.searchState = term ? {epoch: searchEpoch, query: term, checked: 0, total: this.noteList().length, failed: 0, done: false} : null;
    if (this.searchState && !this.active()) {
      this.searchState.epoch = ++this.searchEpoch;
      this.searchState.paused = true;
    }
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.searchTimer = null;
      if (!this.alive || !this.active() || this.view !== 'list' || (this.loadError && !this.hasVerifiedList(this.type)) || !this.listResults?.isConnected) return;
      this.renderListResults(this.listResults, this.noteList());
      if (term) this.scanNoteBodies(term, searchEpoch);
    }, 150);
  }

  renderListResults(target, notes, filtered = null) {
    target.replaceChildren();
    const term = this.searchQuery.trim().toLocaleLowerCase();
    const matches = filtered || (term
      ? notes.filter(note => this.searchMatchIds?.has(noteKey(note)) || String(note.title || '').toLocaleLowerCase().includes(term))
      : [...notes]);
    const page = pageNoteResults(matches, this.listLimit);
    const searchState = term ? this.searchState : null;
    if (searchState) {
      const status = searchState.paused
        ? `Search paused while Notes is in the background. ${searchState.checked} of ${searchState.total} notes checked; results may be incomplete.`
        : searchState.done
        ? searchState.failed ? `Search incomplete. ${searchState.failed} note${searchState.failed === 1 ? '' : 's'} could not be checked.` : `${searchState.checked} notes checked.`
        : `Searching note contents: ${searchState.checked} of ${searchState.total} checked. Results may be incomplete until the search finishes.`;
      const line = el('p', 'notes-search-status', status);
      if (searchState.paused) line.append(this.textButton('Resume search', 'refresh', () => this.scheduleListSearch(this.searchQuery), 'notes-search-resume'));
      else if (searchState.done && searchState.failed) line.append(this.textButton('Try again', 'refresh', () => this.scheduleListSearch(this.searchQuery), 'notes-search-retry'));
      target.append(line);
    }
    if (!matches.length) {
      if (term && searchState?.paused) target.append(this.stateMessage('Search paused', 'Resume the search when you return to Notes to check the remaining saved text.', 'empty'));
      else if (term && searchState && !searchState.done) target.append(this.stateMessage('Searching note contents', 'Notes may still match while their saved text is checked.', 'loading'));
      else if (term && searchState?.failed) target.append(this.stateMessage('Search is incomplete', 'Some note contents could not be checked. Try again before treating this as no matches.', 'error', () => this.scheduleListSearch(this.searchQuery)));
      else target.append(this.stateMessage(term ? 'No matches' : 'No Notes yet', term ? 'Try a different search.' : `Notes in ${this.nameFor(this.type)} will appear here.`, 'empty'));
      return;
    }
    if (term || page.hasMore) {
      const noun = term ? (page.total === 1 ? 'match' : 'matches') : 'notes';
      target.append(el('p', 'notes-results-count', page.hasMore ? `Showing ${page.shown} of ${page.total} ${noun}` : `${page.total} ${noun}`));
    }
    const groups = new Map();
    for (const note of page.items) { const group = this.dateGroup(note); if (!groups.has(group)) groups.set(group, []); groups.get(group).push(note); }
    for (const [group, groupNotes] of groups) {
      const section = el('section', 'notes-list-section'); section.append(el('h2', 'notes-section-title', group));
      const rowsNode = el('div', 'notes-list-group');
      for (const note of groupNotes) rowsNode.append(this.noteRow(note));
      section.append(rowsNode); target.append(section);
    }
    if (page.hasMore) {
      const amount = Math.min(100, page.total - page.shown);
      target.append(this.button(`Load ${amount} more`, 'more', () => {
        this.listLimit = Math.min(page.total, this.listLimit + 100);
        this.renderListResults(target, notes, matches);
      }, 'notes-load-more'));
    }
    if (!term && this.list) {
      const schedule = globalThis.requestAnimationFrame || (callback => setTimeout(callback, 0));
      schedule(() => this.scheduleVisibleExcerptHydration());
    } else if (term && searchState?.done && this.list) {
      const schedule = globalThis.requestAnimationFrame || (callback => setTimeout(callback, 0));
      schedule(() => this.scheduleVisibleExcerptHydration());
    }
  }

  toggleViewMode() {
    const previous = this.viewMode; this.viewMode = previous === 'list' ? 'gallery' : 'list';
    if (!this.persistLocal()) { this.viewMode = previous; this.notify('This view preference could not be saved on this device.'); return; }
    this.render();
  }

  openSortSheet() {
    const panel = this.openSheet('Sort Notes'); panel.classList.add('notes-actions-sheet');
    const list = el('div', 'notes-action-list');
    for (const [id, label] of [['newest', 'Newest date first'], ['oldest', 'Oldest date first'], ['title', 'Title']]) {
      const row = this.textButton(label, this.sort === id ? 'check' : '', () => {
        const previous = this.sort; this.sort = id;
        if (!this.persistLocal()) { this.sort = previous; this.notify('This sort preference could not be saved on this device.'); return; }
        this.closeSheet(); this.render();
      }, 'notes-action-row'); row.setAttribute('aria-pressed', String(this.sort === id)); list.append(row);
    }
    panel.append(list, el('p', 'notes-sheet-help', 'Date order uses server dates when available, then this device’s saved edit date. Notes with neither use their record ID.'));
  }

  refreshList() {
    if (this.view !== 'list') return;
    const scroll = this.list?.scrollTop || 0;
    this.render();
    if (this.list) this.list.scrollTop = scroll;
  }

  noteRow(note) {
    const button = this.button(`Open note: ${note.title || 'Untitled'}`, null, () => this.openNote(note), `notes-note-row${this.viewMode === 'gallery' ? ' notes-note-card' : ''}`);
    button.dataset.noteId = noteKey(note);
    const copy = el('span', 'notes-note-copy');
    const top = el('span', 'notes-note-top'); top.append(el('strong', '', note.title || 'Untitled'));
    const time = this.dateLabel(note); if (time) top.append(el('time', '', time));
    const excerpt = this.searchSnippets.get(noteKey(note)) || this.excerpts.get(noteKey(note)) || (this.excerptPending?.has(noteKey(note)) ? 'Loading preview…' : 'Preview loads when visible');
    copy.append(top, el('span', 'notes-note-excerpt', excerpt));
    const bottom = el('span', 'notes-note-bottom');
    if (note.finalized) bottom.append(el('span', 'notes-note-badge', 'Finalized'));
    const signatureCount = Number(note.signatureCount ?? rows(note.signatures).length) || 0;
    const signedCount = Number(note.signedCount ?? rows(note.signatures).filter(s => truth(s.Signed)).length) || 0;
    if (signatureCount) bottom.append(el('span', 'notes-note-badge', `${signedCount}/${signatureCount} signed`));
    if (note.shared) bottom.append(el('span', 'notes-note-badge', 'Shared'));
    if (bottom.childNodes.length) copy.append(bottom);
    button.replaceChildren(copy, el('span', 'notes-note-chevron', '›'));
    if (note.finalized) button.dataset.finalized = 'true';
    return button;
  }

  renderDock({placeholder, onSearch, canCreate = true}) {
    const dock = el('footer', 'notes-dock');
    const search = el('label', 'notes-search'); search.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.6"></circle><path d="m16 16 5 5"></path></svg>';
    const input = el('input'); input.type = 'search'; input.placeholder = placeholder; input.setAttribute('aria-label', placeholder); input.autocomplete = 'off'; input.value = this.searchQuery;
    this.listenView(input, 'input', () => onSearch(input.value)); search.append(input);
    dock.append(search);
    const typeLabel = {0: 'note', 2: 'document', 5: 'contract'}[this.type] || this.nameFor(this.type).toLowerCase();
    const action = this.button(this.view === 'folders' || this.type === -1 ? 'Create a new note' : `Create a new ${typeLabel}`, 'compose', () => this.createNote(this.view === 'folders' || this.type === -1 ? 0 : this.type), 'notes-compose');
    action.hidden = !canCreate;
    dock.append(action); return dock;
  }

  renderDraftRecovery() {
    if (!this.draft || this.draft.identity !== this.cid) return null;
    const banner = el('aside', 'notes-draft-recovery');
    const copy = el('span', ''); copy.append(el('strong', '', 'Recovered draft'), el('small', '', this.draft.title || 'Untitled note'));
    banner.append(copy, this.textButton('Restore draft', 'back', () => this.restoreDraft(), 'notes-recovery-action'));
    return banner;
  }

  restoreDraft() {
    if (this.identityInvalid) return;
    const draft = this.draft;
    if (!draft || draft.identity !== this.cid || !NOTE_TYPES.some(type => type.id === Number(draft.type))) return;
    if (draft.documentId && !draft.isNew && !draft.isDrop && draft.owner && String(draft.owner) !== this.cid) {
      this.notify('That draft belongs to a different character.'); return;
    }
    this.type = Number(draft.type); this.current = {id: draft.isNew ? null : draft.documentId, type: this.type, title: String(draft.title || ''), content: String(draft.content || ''), owner: this.cid, finalized: false, signatures: [], sharees: [], detailLoaded: true};
    this.baseline = null; this.isNew = !!draft.isNew; this.isDrop = false; this.dirty = true; this.readonly = false; this.editingMode = true; this.view = 'editor'; ++this.navigationEpoch; this.render();
  }

  createNote(type) {
    if (this.identityInvalid) return;
    if (!canCreateNote(type)) return;
    this.createFolderId = this.type === -1 && this.currentFolderId && this.currentFolderId !== 'pinned' ? this.currentFolderId : null;
    this.createPinned = this.type === -1 && this.currentFolderId === 'pinned';
    this.type = Number(type); this.current = {id: null, type: this.type, title: '', content: '', owner: this.cid, finalized: false, signatures: [], sharees: [], detailLoaded: true};
    this.baseline = {title: '', content: ''}; this.isNew = true; this.isDrop = false; this.dirty = false; this.readonly = false; this.editingMode = true; this.view = 'editor'; ++this.navigationEpoch; this.render();
  }

  openNote(raw) {
    if (this.identityInvalid) return;
    if (this.view === 'editor' && this.dirty) { this.askLeaveEditor('Open note', () => this.openNote(raw)); return; }
    const id = Number(pick(raw, 'id', 'Id', NaN)), type = Number(pick(raw, 'type', 'Type', NaN));
    if (!Number.isSafeInteger(id) || id < 1 || !Number.isInteger(type) || type < 0 || type > 5) {
      this.notify('This note could not be opened safely. Refresh Notes and try again.'); return;
    }
    ++this.navigationEpoch; ++this.detailSelectionEpoch; ++this.operationEpoch;
    this.type = type; this.current = {id, type, title: '', owner: '', finalized: false, detailLoaded: false};
    this.baseline = null; this.isNew = false; this.isDrop = false; this.dirty = false; this.readonly = true; this.editingMode = false; this.showSignatures = false;
    this.detailState = 'loading'; this.view = 'editor'; this.render();
    this.loadSelectedDetail(id, this.navigationEpoch, this.detailSelectionEpoch);
  }

  async loadSelectedDetail(id, navigationEpoch, selectionEpoch) {
    const expectedCid = this.cid, identityScope = this.identityScopeEpoch;
    const isCurrent = () => this.readIsCurrent(expectedCid, identityScope,
      () => this.navigationEpoch === navigationEpoch && this.detailSelectionEpoch === selectionEpoch
        && this.view === 'editor' && String(this.current?.id) === String(id)
        && this.current?.detailLoaded === false && this.active());
    if (!isCurrent()) return;
    this.detailState = 'loading'; this.render();
    try {
      const detail = await this.fetchNoteDetail(id, isCurrent, true);
      if (!isCurrent()) return;
      this.current = detail;
      this.baseline = {title: detail.title, content: sanitizedHTML(detail.content)};
      this.readonly = !canEditNote(detail, this.cid); this.dirty = false; this.detailState = '';
      this.render();
    } catch (error) {
      if (error instanceof NotesReadCancelled || !isCurrent() || error?.status === 'identity') return;
      this.detailState = error?.message || NOTES_READ_UNSUPPORTED;
      this.render();
    }
  }

  openExternal(raw, isDrop) {
    if (this.identityInvalid) return;
    const target = {note: {...normalizeNote(raw), detailLoaded: true}, isDrop: !!isDrop};
    if (!target.note.id) { this.notify('This shared note could not be opened.'); return; }
    if (this.view === 'editor' && this.dirty) { this.askLeaveEditor('Open shared note', () => this.acceptExternal(target)); return; }
    this.acceptExternal(target);
  }

  acceptExternal({note, isDrop}) {
    if (this.identityInvalid) return;
    ++this.navigationEpoch; ++this.operationEpoch;
    note.detailLoaded = true;
    this.current = note; this.type = note.type; this.isDrop = isDrop; this.isNew = false;
    this.baseline = {title: note.title, content: sanitizedHTML(note.content)}; this.dirty = false;
    this.readonly = !canEditNote(note, this.cid, isDrop); this.editingMode = false; this.showSignatures = false; this.view = 'editor'; this.render();
  }

  toFolders() {
    if (this.view !== 'editor' && this.view !== 'signatures') { this.view = 'folders'; this.searchQuery = ''; ++this.navigationEpoch; this.render(); this.loadFolders(); return; }
    this.askLeaveEditor('Back to folders', () => { this.current = null; this.baseline = null; this.isDrop = false; this.isNew = false; this.editingMode = false; this.dirty = false; this.showSignatures = false; this.view = 'folders'; ++this.navigationEpoch; this.render(); this.loadFolders(); });
  }

  askLeaveEditor(title, proceed) {
    if (!this.dirty) { proceed(); return; }
    const panel = this.openSheet('Unsaved changes', {header: false}); panel.classList.add('notes-confirm-sheet');
    const nav = el('header', 'notes-confirm-nav'); nav.append(this.textButton('Stay', '', () => this.closeSheet(), 'notes-text-action'), el('h2', '', 'Unsaved changes'));
    const icon = el('span', 'notes-confirm-symbol'); icon.innerHTML = noteGlyph('doc');
    const body = el('div', 'notes-confirm-copy'); body.append(icon, el('h3', '', 'Keep your changes?'), el('p', '', 'Your edits have not been saved yet. Keep a local recovery copy or save them to this character’s Notes.'));
    const save = this.textButton('Save changes', 'check', async () => {
      save.disabled = true;
      const navEpoch = this.navigationEpoch;
      const saved = await this.saveCurrent({render: false});
      if (saved && !this.dirty && this.alive && navEpoch === this.navigationEpoch && this.sheet?.panel === panel) { this.closeSheet(); proceed(); }
      else save.disabled = false;
    }, 'notes-confirm-primary');
    const keep = this.textButton('Keep a recovery draft', 'edit', () => {
      if (!this.captureDraft()) { this.notify('This draft could not be stored on this device. Keep Notes open or save it to the server.'); return; }
      this.closeSheet(); proceed();
    }, 'notes-confirm-secondary');
    panel.append(nav, body, save, keep);
  }

  renderEditor() {
    this.editorUndoStack = []; this.editorRedoStack = []; this.pendingEditorHistory = null;
    this.pendingNativeHistory = null; this.editorComposing = false; this.compositionHistoryStart = null;
    const current = this.current || {title: '', content: ''};
    const canEdit = this.currentEditable() && !this.readonly && this.editingMode;
    const back = this.button('Back to ' + this.nameFor(this.type), 'back', () => this.view === 'editor' ? this.toFolders() : this.backToEditor(), 'notes-back-button');
    if (current.id != null && current.detailLoaded === false) {
      const header = this.makeHeader({title: this.nameFor(this.type), leading: back}); header.classList.add('notes-editor-header');
      const status = el('main', 'notes-paper notes-detail-state');
      status.setAttribute('role', this.detailState === 'loading' ? 'status' : 'alert');
      if (this.detailState === 'loading') {
        status.append(el('p', 'notes-readonly-hint', 'Loading note…'));
      } else {
        status.append(el('p', 'notes-readonly-hint', this.detailState || NOTES_READ_UNSUPPORTED));
        status.append(this.textButton('Retry loading note', 'refresh', () => this.loadSelectedDetail(current.id, this.navigationEpoch, this.detailSelectionEpoch), 'notes-detail-retry'));
      }
      this.titleInput = null; this.editArea = null; this.editorFooter = null;
      this.element.append(header, status);
      return;
    }
    const actions = [];
    if (canEdit) {
      const save = this.textButton('Save changes', 'check', () => this.saveCurrent(), 'notes-save-top');
      save.hidden = !this.dirty; save.disabled = !this.dirty || this.saving;
      if (this.saving) save.setAttribute('aria-busy', 'true');
      actions.push(save);
    }
    else if (this.currentEditable() && !this.readonly && !this.editingMode) actions.push(this.textButton('Edit note', 'edit', () => this.beginEdit(), 'notes-edit-top'));
    const actionCapsule = el('div', 'notes-editor-actions-capsule');
    actionCapsule.setAttribute('role', 'group'); actionCapsule.setAttribute('aria-label', 'Note sharing and actions');
    if (this.canShareNote(current)) actionCapsule.append(this.button('Share note', 'share', () => this.showShareActions(), 'notes-icon-action notes-share-top'));
    if (current.id != null && !this.isNew && !this.isDrop) actionCapsule.append(this.button('More actions', 'more', () => this.showActions(), 'notes-icon-action notes-more-top'));
    if (actionCapsule.childNodes.length) actions.push(actionCapsule);
    const header = this.makeHeader({title: this.nameFor(this.type), leading: back, trailing: actions}); header.classList.add('notes-editor-header');
    const paper = el('main', 'notes-paper');
    const metadata = el('div', 'notes-editor-meta');
    const metaText = this.isDrop ? 'Shared nearby · Read only' : this.readonly ? (current.finalized ? 'Finalized document' : 'Shared with you · Read only') : this.isNew ? 'New note' : (this.dirty ? 'Unsaved changes' : 'Saved to Notes');
    metadata.append(el('span', '', metaText));
    if (current.finalized) metadata.append(el('span', 'notes-finalized-mark', 'FINALIZED'));
    const title = el('input', 'notes-title-input'); title.type = 'text'; title.maxLength = 150; title.placeholder = 'Title'; title.value = current.title; title.readOnly = !canEdit; title.setAttribute('aria-label', 'Note title');
    this.listenView(title, 'beforeinput', event => {
      if (this.handleEditorHistoryBeforeInput(event)) return;
      if (!this.editorComposing && !event.isComposing) this.pendingEditorHistory = {state: this.captureEditorState(), inputType: event.inputType || 'insertText'};
    });
    this.listenView(title, 'input', event => {
      const historyInput = this.handleEditorHistoryInput(event);
      if (historyInput === true) return;
      const pending = this.pendingEditorHistory; this.pendingEditorHistory = null;
      if (!canEdit) return;
      this.current.title = title.value; this.editRevision++; this.onEditorInput();
      if (!this.editorComposing && !event.isComposing && historyInput !== null) this.recordEditorHistory(pending?.state || this.captureEditorState(), this.captureEditorState(), pending?.inputType || event.inputType || 'insertText');
    });
    this.listenView(title, 'compositionstart', () => this.beginEditorComposition());
    this.listenView(title, 'compositionend', () => this.finishEditorComposition());
    this.listenView(title, 'keydown', event => this.handleEditorHistoryShortcut(event));
    // Keep the model canonical so history snapshots and dirty checks can reuse
    // it instead of re-sanitizing the whole document around every keystroke.
    current.content = sanitizedHTML(current.content);
    const editor = el('div', 'notes-rich-editor'); editor.contentEditable = String(canEdit); editor.setAttribute('role', 'textbox'); editor.setAttribute('aria-label', 'Note content'); editor.setAttribute('aria-multiline', 'true'); editor.dataset.placeholder = 'Start writing'; editor.spellcheck = true; editor.innerHTML = current.content;
    this.decorateChecklistMarkers(editor, {wrapLegacy: true});
    this.listenView(editor, 'beforeinput', event => {
      if (this.handleEditorHistoryBeforeInput(event)) return;
      if (!this.performingEditorCommand && !this.restoringEditorHistory && !this.editorComposing && !event.isComposing) this.pendingEditorHistory = {state: this.captureEditorState(), inputType: event.inputType || 'insertText'};
    });
    this.listenView(editor, 'input', event => {
      if (this.performingEditorCommand || this.restoringEditorHistory) return;
      const historyInput = this.handleEditorHistoryInput(event);
      if (historyInput === true) return;
      const pending = this.pendingEditorHistory; this.pendingEditorHistory = null;
      if (!canEdit) return;
      this.handleEditorInput(editor);
      if (!this.editorComposing && !event.isComposing && historyInput !== null) this.recordEditorHistory(pending?.state || this.captureEditorState(), this.captureEditorState(), pending?.inputType || event.inputType || 'insertText');
    });
    this.listenView(editor, 'compositionstart', () => this.beginEditorComposition());
    this.listenView(editor, 'compositionend', () => this.finishEditorComposition());
    this.listenView(editor, 'paste', event => {
      event.preventDefault(); const text = event.clipboardData?.getData('text/plain') || '';
      this.performEditorCommand('insertFromPaste', () => document.execCommand('insertText', false, text));
    });
    this.listenView(editor, 'keydown', event => {
      if (this.handleEditorHistoryShortcut(event)) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); this.saveCurrent(); }
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); this.saveCurrent(); }
      if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.isComposing && canEdit) {
        const selection = window.getSelection(), anchor = selection?.anchorNode;
        const item = (anchor?.nodeType === Node.ELEMENT_NODE ? anchor : anchor?.parentElement)?.closest?.('li');
        this.pendingChecklistEnter = item && this.checklistMarker(item) ? item : null;
      }
      if (event.key === ' ' && !event.ctrlKey && !event.metaKey && !event.isComposing && canEdit) {
        const selection = window.getSelection(), anchor = selection?.anchorNode;
        const focusedMarker = event.target.closest?.('[data-notes-checklist-marker]');
        const item = focusedMarker?.closest('li') || (anchor?.nodeType === Node.ELEMENT_NODE ? anchor : anchor?.parentElement)?.closest?.('li');
        const marker = item && this.checklistMarker(item);
        const first = marker && document.createTreeWalker(marker, NodeFilter.SHOW_TEXT).nextNode();
        const caretOnMarker = focusedMarker === marker || (first && selection?.anchorNode === first && selection.anchorOffset <= 1);
        if (marker && first && /^[☐☑]$/.test(first.data) && caretOnMarker) {
          event.preventDefault(); this.toggleChecklistItem(item, editor);
        }
      }
    });
    this.listenView(editor, 'click', event => {
      const item = event.target.closest?.('li');
      if (!item || !canEdit) return;
      const marker = this.checklistMarker(item);
      const box = marker?.getBoundingClientRect();
      if (!marker || !box || event.clientX < box.left - 7 || event.clientX > box.right + 7 || event.clientY < box.top - 5 || event.clientY > box.bottom + 5) return;
      this.toggleChecklistItem(item, editor);
    });
    paper.append(metadata, title, editor);
    const footer = this.renderFormatToolbar(canEdit);
    this.titleInput = title; this.editArea = editor; this.editorFooter = footer;
    this.element.append(header, paper, footer);
    if (this.showSignatures) this.renderSignatures();
  }

  firstChecklistText(item) {
    const walker = document.createTreeWalker(item, NodeFilter.SHOW_TEXT, {
      acceptNode: node => node.parentElement?.closest('li') === item ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
    });
    return walker.nextNode();
  }

  checklistMarker(item) {
    return [...(item?.querySelectorAll('span') || [])].find(span => span.closest('li') === item && span.hasAttribute('data-notes-checklist-marker')) || null;
  }

  decorateChecklistMarkers(editor, {wrapLegacy = false} = {}) {
    if (!editor) return;
    for (const item of editor.querySelectorAll('li')) {
      let marker = [...item.querySelectorAll('span')].find(span => span.closest('li') === item && /^[☐☑]$/.test(span.textContent));
      if (!marker && wrapLegacy) {
        const text = this.firstChecklistText(item), match = text?.data.match(/^(\s*)([☐☑])(?=\s|$)/u);
        if (text && match) {
          marker = el('span', ''); marker.textContent = match[2];
          const parent = text.parentNode, before = match[1], after = text.data.slice(before.length + 1);
          if (before) parent.insertBefore(document.createTextNode(before), text);
          parent.insertBefore(marker, text);
          if (after) parent.insertBefore(document.createTextNode(after), text);
          parent.removeChild(text);
        }
      }
      const value = marker?.textContent;
      if (marker && (value === '☐' || value === '☑')) {
        const checked = value === '☑';
        item.setAttribute('data-notes-checklist-item', 'true');
        marker.setAttribute('data-notes-checklist-marker', 'true');
        marker.setAttribute('data-notes-checklist-checked', String(checked));
        marker.contentEditable = 'false';
        marker.setAttribute('role', 'checkbox'); marker.setAttribute('aria-checked', String(checked)); marker.tabIndex = 0;
        marker.setAttribute('aria-label', item.textContent.replace(/^[\s☐☑]+/u, '').trim() || 'Checklist item');
      } else {
        item.removeAttribute('data-notes-checklist-item');
        if (marker) {
          marker.removeAttribute('data-notes-checklist-marker'); marker.removeAttribute('data-notes-checklist-checked');
          marker.removeAttribute('contenteditable');
          marker.removeAttribute('role'); marker.removeAttribute('aria-checked'); marker.removeAttribute('aria-label'); marker.removeAttribute('tabindex');
        }
      }
    }
  }

  editorSelectionPoint(editor, node, offset) {
    if (!editor || !node || (node !== editor && !editor.contains(node))) return null;
    const path = [];
    while (node !== editor) {
      const parent = node.parentNode;
      if (!parent) return null;
      path.unshift([...parent.childNodes].indexOf(node)); node = parent;
    }
    return {path, offset};
  }

  captureEditorState() {
    const editor = this.editArea, title = this.titleInput;
    const selection = window.getSelection();
    const insideEditor = editor && selection?.rangeCount && editor.contains(selection.anchorNode) && editor.contains(selection.focusNode);
    const titleFocused = !!title && document.activeElement === title;
    return {
      content: String(this.current?.content ?? ''),
      title: title?.value ?? String(this.current?.title || ''),
      focus: insideEditor ? 'editor' : titleFocused ? 'title' : 'other',
      anchor: insideEditor ? this.editorSelectionPoint(editor, selection.anchorNode, selection.anchorOffset) : null,
      focusPoint: insideEditor ? this.editorSelectionPoint(editor, selection.focusNode, selection.focusOffset) : null,
      titleSelection: titleFocused ? {start: title.selectionStart, end: title.selectionEnd, direction: title.selectionDirection} : null,
    };
  }

  editorHistoryBytes(action) {
    // Account retained content as UTF-16, the representation used by JS
    // strings. Count both snapshots conservatively even when text is shared.
    return 2 * (action.before.content.length + action.before.title.length + action.after.content.length + action.after.title.length);
  }

  trimEditorHistory() {
    const usage = () => {
      const actions = [...this.editorUndoStack, ...this.editorRedoStack];
      return {count: actions.length, bytes: actions.reduce((total, action) => total + this.editorHistoryBytes(action), 0)};
    };
    let current = usage();
    while (current.count > EDITOR_HISTORY_MAX_ACTIONS || current.bytes > EDITOR_HISTORY_MAX_CONTENT_BYTES) {
      if (this.editorUndoStack.length) this.editorUndoStack.shift();
      else {
        // The redo stack is stored in reverse chronological order. Removing
        // its earliest prerequisite would make later snapshots jump over a
        // missing edit, so retire that whole disconnected redo chain.
        this.editorRedoStack = [];
        break;
      }
      current = usage();
    }
  }

  recordEditorHistory(before, after, inputType = 'insertText') {
    if (!before || !after || (before.content === after.content && before.title === after.title)) return;
    const now = Date.now(), previous = this.editorUndoStack.at(-1);
    const collapsedCaret = state => {
      if (state.focus === 'title') {
        const range = state.titleSelection;
        return range && range.start === range.end ? {kind: 'title', start: range.start, end: range.end, direction: range.direction} : null;
      }
      if (state.focus === 'editor' && state.anchor && state.focusPoint
          && JSON.stringify(state.anchor) === JSON.stringify(state.focusPoint)) return {kind: 'editor', point: state.anchor};
      return null;
    };
    const priorCaret = previous && collapsedCaret(previous.after), beforeCaret = collapsedCaret(before);
    const canCoalesce = inputType === 'insertText' && previous?.inputType === 'insertText'
      && priorCaret && beforeCaret && JSON.stringify(priorCaret) === JSON.stringify(beforeCaret)
      && now - previous.time < 900;
    if (canCoalesce) { previous.after = after; previous.time = now; }
    else this.editorUndoStack.push({before, after, inputType, time: now});
    this.editorRedoStack = [];
    this.trimEditorHistory();
  }

  performEditorCommand(inputType, command) {
    const before = this.captureEditorState(), revision = this.editRevision;
    this.pendingEditorHistory = null; this.performingEditorCommand = true;
    try { command(); }
    finally { this.performingEditorCommand = false; this.pendingEditorHistory = null; }
    if (this.editArea?.isConnected) this.decorateChecklistMarkers(this.editArea);
    if (revision === this.editRevision && this.editArea?.isConnected) this.handleEditorInput(this.editArea);
    this.recordEditorHistory(before, this.captureEditorState(), inputType);
  }

  restoreEditorState(state) {
    const editor = this.editArea, title = this.titleInput;
    if (!editor?.isConnected || !this.current) return false;
    this.restoringEditorHistory = true;
    try {
      const content = sanitizedHTML(state.content);
      editor.innerHTML = content;
      if (title) title.value = state.title;
      this.current.content = content; this.current.title = state.title;
      this.decorateChecklistMarkers(editor);
      if (state.focus === 'editor') {
        editor.focus({preventScroll: true});
        const resolve = point => {
          if (!point) return null;
          let node = editor;
          for (const index of point.path) node = node?.childNodes?.[index];
          if (!node) return null;
          const max = node.nodeType === Node.TEXT_NODE ? node.data.length : node.childNodes.length;
          return {node, offset: Math.max(0, Math.min(max, point.offset))};
        };
        const anchor = resolve(state.anchor), focus = resolve(state.focusPoint), selection = window.getSelection();
        if (anchor && focus && selection) {
          selection.removeAllRanges();
          if (selection.setBaseAndExtent) selection.setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset);
          else { const range = document.createRange(); range.setStart(anchor.node, anchor.offset); range.setEnd(focus.node, focus.offset); selection.addRange(range); }
        }
      } else if (state.focus === 'title' && title) {
        title.focus({preventScroll: true});
        if (state.titleSelection) title.setSelectionRange(state.titleSelection.start, state.titleSelection.end, state.titleSelection.direction);
      }
      this.editRevision++; this.onEditorInput();
    } finally { this.restoringEditorHistory = false; }
    return true;
  }

  applyEditorHistory(direction) {
    const undo = direction === 'undo', from = undo ? this.editorUndoStack : this.editorRedoStack;
    const to = undo ? this.editorRedoStack : this.editorUndoStack, action = from.pop();
    if (!action) return false;
    const state = undo ? action.before : action.after;
    if (!this.restoreEditorState(state)) { from.push(action); return false; }
    to.push(action); return true;
  }

  handleEditorHistoryBeforeInput(event) {
    const direction = event.inputType === 'historyUndo' ? 'undo' : event.inputType === 'historyRedo' ? 'redo' : null;
    if (!direction || event.isComposing || this.editorComposing) return false;
    if (!this.currentEditable() || this.readonly || this.isDrop || !this.editingMode) {
      if (event.cancelable) event.preventDefault();
      return true;
    }
    if (event.cancelable) {
      event.preventDefault(); this.pendingNativeHistory = null; this.pendingEditorHistory = null;
      this.applyEditorHistory(direction);
      return true;
    }
    const pending = {direction, state: this.captureEditorState()};
    this.pendingNativeHistory = pending;
    queueMicrotask(() => { if (this.pendingNativeHistory === pending) this.pendingNativeHistory = null; });
    return true;
  }

  handleEditorHistoryInput(event) {
    const eventDirection = event.inputType === 'historyUndo' ? 'undo' : event.inputType === 'historyRedo' ? 'redo' : null;
    const pending = this.pendingNativeHistory;
    const direction = eventDirection || pending?.direction;
    if (!direction) return false;
    this.pendingNativeHistory = null;
    if (event.isComposing || this.editorComposing) return null;
    const before = pending?.state || this.captureEditorState();
    if (!this.currentEditable() || this.readonly || this.isDrop || !this.editingMode) {
      this.restoreEditorState(before); return true;
    }
    this.pendingEditorHistory = null;
    if (!this.applyEditorHistory(direction)) this.restoreEditorState(before);
    return true;
  }

  beginEditorComposition() {
    if (!this.editorComposing) this.compositionHistoryStart = this.captureEditorState();
    this.editorComposing = true;
  }

  finishEditorComposition() {
    this.editorComposing = false;
    const before = this.compositionHistoryStart; this.compositionHistoryStart = null;
    if (!before) return;
    queueMicrotask(() => {
      if (this.alive && this.view === 'editor' && this.editArea?.isConnected) this.recordEditorHistory(before, this.captureEditorState(), 'composition');
    });
  }

  handleEditorHistoryShortcut(event) {
    if (event.isComposing || !(event.ctrlKey || event.metaKey)) return false;
    const key = event.key.toLowerCase();
    if (key === 'z') { event.preventDefault(); this.applyEditorHistory(event.shiftKey ? 'redo' : 'undo'); return true; }
    if (key === 'y') { event.preventDefault(); this.applyEditorHistory('redo'); return true; }
    return false;
  }

  handleEditorInput(editor = this.editArea) {
    if (!this.current || !editor) return;
    const previousChecklistItem = this.pendingChecklistEnter;
    this.pendingChecklistEnter = null;
    if (previousChecklistItem?.isConnected) {
      const anchor = window.getSelection()?.anchorNode;
      const focused = anchor?.nodeType === Node.ELEMENT_NODE ? anchor : anchor?.parentElement;
      const nextItem = focused?.closest?.('li');
      if (nextItem && nextItem !== previousChecklistItem && nextItem.parentElement === previousChecklistItem.parentElement && !this.checklistMarker(nextItem)) {
        const marker = el('span', ''); marker.textContent = '☐';
        nextItem.insertBefore(marker, nextItem.firstChild);
        if (!nextItem.textContent.replace(/[\s\u200b☐☑]/gu, '')) {
          nextItem.querySelector(':scope > br')?.remove();
          const caretText = document.createTextNode(''); nextItem.append(caretText);
          const range = document.createRange(); range.setStart(caretText, 0); range.collapse(true);
          const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range);
        }
      }
    }
    this.decorateChecklistMarkers(editor);
    this.current.content = sanitizedHTML(editor.innerHTML); this.editRevision++; this.onEditorInput();
  }

  toggleChecklistItem(item, editor) {
    if (!item || !editor || editor.contentEditable !== 'true' || !this.currentEditable() || this.readonly || this.isDrop) return false;
    const marker = this.checklistMarker(item), first = marker && document.createTreeWalker(marker, NodeFilter.SHOW_TEXT).nextNode();
    if (!first || !/^[☐☑]$/.test(first.data)) return false;
    const before = this.captureEditorState(), next = first.data === '☐' ? '☑' : '☐';
    first.data = next;
    this.decorateChecklistMarkers(editor);
    this.handleEditorInput(editor);
    this.recordEditorHistory(before, this.captureEditorState(), 'checklistToggle');
    return true;
  }

  renderFormatToolbar(canEdit) {
    const bar = el('footer', 'notes-editor-dock');
    if (canEdit) {
      const tools = el('div', 'notes-format-tools'); tools.setAttribute('role', 'toolbar'); tools.setAttribute('aria-label', 'Note formatting');
      for (const [label, glyph, command] of [['Undo', 'undo', 'undo'], ['Checklist', 'checklist', 'checklist'], ['Insert table', 'table', 'insertTable'], ['Redo', 'redo', 'redo']]) {
        const button = this.button(label, glyph, () => this.format(command), 'notes-format-button');
        button.dataset.command = command; tools.append(button);
      }
      const more = this.button('Text formatting', '', () => this.openFormattingSheet(), 'notes-format-button notes-format-more');
      more.textContent = 'Aa'; tools.insertBefore(more, tools.children[3]);
      bar.append(tools, this.button('Create a new note', 'compose', () => this.startAnotherNote(), 'notes-compose'));
    } else {
      if (this.isDrop || this.readonly || !this.currentEditable()) bar.append(el('span', 'notes-readonly-hint', this.isDrop ? 'This dropped note is read only.' : 'This note is read only.'));
      else bar.append(el('span', 'notes-readonly-hint', 'Choose Edit to change this note.'));
      bar.append(this.button('Create a new note', 'compose', () => this.startAnotherNote(), 'notes-compose'));
    }
    return bar;
  }

  openFormattingSheet() {
    const selection = window.getSelection();
    const savedRange = selection?.rangeCount && this.editArea?.contains(selection.anchorNode) && this.editArea.contains(selection.focusNode)
      ? selection.getRangeAt(0).cloneRange() : null;
    const panel = this.openSheet('Text formatting'); panel.classList.add('notes-actions-sheet');
    const list = el('div', 'notes-action-list');
    for (const [label, glyph, command] of [
      ['Bold', 'bold', 'bold'], ['Italic', 'italic', 'italic'], ['Underline', 'underline', 'underline'],
      ['Heading', 'doc', 'formatBlock:h2'], ['Bulleted list', 'list', 'insertUnorderedList'],
      ['Numbered list', 'numbered', 'insertOrderedList'], ['Quote', 'quote', 'formatBlock:blockquote'],
    ]) list.append(this.textButton(label, glyph, () => { this.closeSheet(); this.format(command, savedRange); }, 'notes-action-row'));
    panel.append(list, el('p', 'notes-sheet-help', 'Select text first to apply character styles.'));
  }

  format(command, savedRange = null) {
    if (!this.editArea?.isConnected || this.editArea.contentEditable !== 'true') return;
    if (command === 'undo' || command === 'redo') { this.applyEditorHistory(command); return; }
    const selection = window.getSelection();
    const activeRange = selection?.rangeCount && this.editArea.contains(selection.anchorNode) && this.editArea.contains(selection.focusNode)
      ? selection.getRangeAt(0).cloneRange() : null;
    const restoreRange = savedRange || activeRange;
    this.editArea.focus({preventScroll: true});
    if (restoreRange && this.editArea.contains(restoreRange.commonAncestorContainer)) {
      selection?.removeAllRanges(); selection?.addRange(restoreRange);
    }
    this.performEditorCommand(command, () => {
      if (command === 'insertTable') {
        document.execCommand('insertHTML', false, '<table><tbody><tr><td><br></td><td><br></td></tr><tr><td><br></td><td><br></td></tr></tbody></table><p><br></p>');
      } else if (command === 'checklist') {
        document.execCommand('insertHTML', false, '<ul><li><span data-notes-checklist-insert-target="true">☐</span></li></ul>');
        const insertedMarker = this.editArea.querySelector('[data-notes-checklist-insert-target="true"]');
        const item = insertedMarker?.closest('li');
        insertedMarker?.removeAttribute('data-notes-checklist-insert-target');
        this.decorateChecklistMarkers(this.editArea, {wrapLegacy: true});
        const marker = this.checklistMarker(item);
        if (marker) {
          const caretText = document.createTextNode(''); marker.parentNode.insertBefore(caretText, marker.nextSibling);
          const range = document.createRange(); range.setStart(caretText, 0); range.collapse(true);
          selection?.removeAllRanges(); selection?.addRange(range);
        }
      } else if (command.startsWith('formatBlock:')) {
        document.execCommand('formatBlock', false, command.split(':')[1]);
      } else document.execCommand(command, false, null);
    });
  }

  onEditorInput() {
    if (!this.current) return;
    // current.content is sanitized on editor mount and every editor input.
    this.dirty = !this.baseline || this.current.title !== this.baseline.title || this.current.content !== this.baseline.content;
    this.updateEditorStatus(); this.scheduleDraftSave();
  }

  beginEdit() {
    if (this.identityInvalid || !this.currentEditable() || this.readonly || this.current?.finalized || this.isDrop) return;
    this.editingMode = true; this.render(); this.editArea?.focus();
  }

  startAnotherNote() {
    const type = canCreateNote(this.type) ? this.type : 0;
    this.askLeaveEditor('Create a new note', () => this.createNote(type));
  }

  updateEditorStatus() {
    const status = this.element.querySelector('.notes-editor-meta > span');
    if (status && !this.isDrop && !this.readonly) status.textContent = this.isNew ? 'New note' : (this.dirty ? 'Unsaved changes' : 'Saved to Notes');
    const button = this.element.querySelector('.notes-save-top');
    if (button) {
      button.hidden = !this.dirty; button.disabled = !this.dirty || this.saving;
      if (this.saving) button.setAttribute('aria-busy', 'true'); else button.removeAttribute('aria-busy');
    }
  }

  scheduleDraftSave() {
    clearTimeout(this.draftTimer); this.draftTimer = setTimeout(() => this.captureDraft(), 140);
  }

  captureDraft() {
    if (!this.current || !this.dirty || !this.cid || !this.alive) return false;
    const note = this.current;
    const draft = {identity: this.cid, type: Number(note.type), title: String(note.title || '').slice(0, 150), content: String(note.content || ''), documentId: note.id ?? null, owner: note.owner || this.cid, isNew: !!this.isNew, isDrop: false, savedAt: Date.now()};
    if (!writeLocal(this.context, 'notes-draft', draft)) return false;
    this.draft = draft; return true;
  }

  clearDraft() {
    clearTimeout(this.draftTimer); this.draft = null;
    const key = collectionKey(this.context, 'notes-draft');
    try { localStorage.removeItem(key); if (localStorage.getItem(key) !== null) writeLocal(this.context, 'notes-draft', null); }
    catch { writeLocal(this.context, 'notes-draft', null); /* The server save remains authoritative. */ }
  }

  saveCurrent(options = {}) {
    if (this.identityInvalid) return Promise.resolve(false);
    if (this.savePromise) return this.savePromise;
    if (!this.current || !this.currentEditable() || this.readonly || this.isDrop || !this.editingMode) return Promise.resolve(false);
    const pending = this.saveCurrentOperation(options);
    this.savePromise = pending;
    const clear = () => { if (this.savePromise === pending) this.savePromise = null; };
    pending.then(clear, clear);
    return pending;
  }

  async saveCurrentOperation({render = true} = {}) {
    if (!this.current || !this.currentEditable() || this.readonly || this.isDrop || !this.editingMode) return false;
    if (this.saving) return false;
    const note = cloneNote(this.current), navEpoch = this.navigationEpoch, token = ++this.saveEpoch;
    let effectiveId = note.id;
    const editRevision = this.editRevision;
    const title = String(note.title || '').trim() || 'Untitled Note', content = String(note.content || '');
    const payload = { ...(note.id != null ? {Id: note.id} : {}), Type: Number(note.type), Title: title, Content: content };
    const validationError = validateNoteSavePayload(payload);
    if (validationError) { this.captureDraft(); this.notify(validationError); return false; }
    this.saving = true;
    const saveButton = this.element.querySelector('.notes-save-top'); if (saveButton) { saveButton.disabled = true; saveButton.setAttribute('aria-busy', 'true'); }
    try {
      const result = await this.send('Documents/SaveDocument', payload);
      if (!this.alive || token !== this.saveEpoch || navEpoch !== this.navigationEpoch || this.current?.id !== note.id || this.current?.type !== note.type) return false;
      if (result?.__phoneError || result?.Success !== true) throw Error(result?.Message || result?.Msg || 'The server did not save this note. Your changes are still here.');
      if (note.id == null && (result.Id == null || result.Id === '')) throw Error('The save result is uncertain because the server did not return a note ID. Your draft is still here. Check Notes before trying again.');
      const latest = cloneNote(this.current);
      if (editRevision === this.editRevision) { latest.title = title; latest.content = content; }
      this.current = {...latest, id: result.Id ?? this.current.id, owner: this.cid};
      effectiveId = this.current.id;
      const savedKey = noteKey(this.current), previousEditedAt = this.local.editedAtByNote[savedKey];
      this.local.editedAtByNote[savedKey] = Date.now();
      if (note.id == null && (this.createFolderId || this.createPinned)) {
        const key = savedKey, previousFolder = this.local.folderByNote[key], previousPinned = this.local.pinned;
        if (this.createFolderId) this.local.folderByNote[key] = this.createFolderId;
        if (this.createPinned && !this.local.pinned.includes(key)) this.local.pinned = [...this.local.pinned, key].slice(-500);
        if (!this.persistLocal()) { if (previousFolder === undefined) delete this.local.folderByNote[key]; else this.local.folderByNote[key] = previousFolder; this.local.pinned = previousPinned; if (previousEditedAt === undefined) delete this.local.editedAtByNote[savedKey]; else this.local.editedAtByNote[savedKey] = previousEditedAt; this.notify('The note was saved, but its local organization could not be stored.'); }
        this.createFolderId = null;
        this.createPinned = false;
      } else if (!this.persistLocal()) {
        if (previousEditedAt === undefined) delete this.local.editedAtByNote[savedKey]; else this.local.editedAtByNote[savedKey] = previousEditedAt;
      }
      this.isNew = false; this.baseline = {title, content};
      this.dirty = editRevision !== this.editRevision || this.current.title !== this.baseline.title || this.current.content !== this.baseline.content;
      this.editingMode = this.dirty; if (this.dirty) this.scheduleDraftSave(); else this.clearDraft();
      await this.refreshCurrentType();
      if (!this.alive || token !== this.saveEpoch || navEpoch !== this.navigationEpoch) return true;
      if (this.dirty) { this.editingMode = true; this.captureDraft(); }
      if (render) this.render(); else this.updateEditorStatus();
      return true;
    } catch (error) {
      if (this.alive && token === this.saveEpoch && navEpoch === this.navigationEpoch) this.notify(error?.message || 'The note could not be saved. Your changes are still here.');
      return false;
    } finally {
      if (token === this.saveEpoch) {
        this.saving = false;
        // The save result is navigation-scoped; its busy flag belongs to the current editor.
        if (this.alive) {
          const button = this.element.querySelector('.notes-save-top');
          if (button) {
            if (this.current?.id === effectiveId && this.current?.type === note.type) button.hidden = !this.dirty;
            button.disabled = !this.dirty; button.removeAttribute('aria-busy');
          }
        }
      }
    }
  }

  backToEditor() { this.showSignatures = false; this.view = 'editor'; ++this.navigationEpoch; this.render(); }

  showActions() {
    if (this.identityInvalid || this.current?.id == null || this.isNew || this.isDrop) return;
    const note = this.current, panel = this.openSheet('Note actions'); panel.classList.add('notes-actions-sheet');
    const list = el('div', 'notes-action-list');
    const add = (label, glyph, fn, cls = '') => { const button = this.textButton(label, glyph, fn, 'notes-action-row ' + cls); list.append(button); };
    const isOwner = String(note.owner) === this.cid;
    const key = noteKey(note), pinned = this.local.pinned.includes(key);
    add(pinned ? 'Unpin on this device' : 'Pin on this device', 'check', () => this.togglePin(note));
    add('Organize in a local folder', 'house', () => this.moveToLocalFolderSheet(note));
    if (isOwner) {
      if (!note.finalized && !this.dirty && note.type === 5) add('Finalize contract', 'check', () => this.confirmFinalize(note));
      add('Delete note', 'trash', () => this.confirmDelete(note), 'notes-action-danger');
    }
    if (note.type === 5 && note.finalized) add('View signatures', 'signature', () => { this.closeSheet(); this.showSignatures = true; this.view = 'signatures'; ++this.navigationEpoch; this.render(); });
    panel.append(list);
  }

  showShareActions() {
    if (this.identityInvalid || !this.canShareNote(this.current)) return;
    const note = this.current, panel = this.openSheet('Share note'); panel.classList.add('notes-actions-sheet');
    const list = el('div', 'notes-action-list');
    const stillOwner = () => this.current?.id === note.id && this.canShareNote(note);
    if (note.type === 0) list.append(this.textButton('Place QR code nearby', 'qr', () => {
      if (stillOwner()) this.performAction('Documents/DropQRCode', {Id: note.id}, 'QR code placed nearby.');
    }, 'notes-action-row'));
    list.append(this.textButton('Share nearby', 'share', () => {
      if (stillOwner()) this.shareLocal(note);
    }, 'notes-action-row'));
    list.append(this.textButton('Share with a character', 'users', () => {
      if (stillOwner()) this.promptCid('Share with a character', cid => {
        if (stillOwner()) this.performAction('Documents/AddSharee', {Id: note.id, Cid: cid}, 'Share invitation sent. The recipient must accept it.');
      });
    }, 'notes-action-row'));
    panel.append(list);
  }

  togglePin(note) {
    const key = noteKey(note), before = this.local.pinned;
    this.local.pinned = before.includes(key) ? before.filter(item => item !== key) : [...before, key].slice(-500);
    if (!this.persistLocal()) { this.local.pinned = before; this.notify('Pin status could not be saved on this device.'); return; }
    this.closeSheet(); this.render(); this.notify(this.local.pinned.includes(key) ? 'Pinned on this device.' : 'Unpinned on this device.');
  }

  moveToLocalFolderSheet(note) {
    const panel = this.openSheet('Organize on this device'); panel.classList.add('notes-actions-sheet');
    const list = el('div', 'notes-action-list'), current = this.local.folderByNote[noteKey(note)];
    if (current) list.append(this.textButton('Remove from local folder', 'trash', () => this.assignLocalFolder(note, null), 'notes-action-row'));
    for (const folder of this.local.folders) list.append(this.textButton(folder.name, current === folder.id ? 'check' : 'house', () => this.assignLocalFolder(note, folder.id), 'notes-action-row'));
    list.append(this.textButton('Create local folder', 'plus', () => this.createFolderSheet(id => this.assignLocalFolder(note, id)), 'notes-action-row'));
    panel.append(list, el('p', 'notes-sheet-help', 'This only changes on-device organization. The server category and sharing access stay the same.'));
  }

  assignLocalFolder(note, folderId) {
    const key = noteKey(note), before = this.local.folderByNote[key];
    if (folderId) this.local.folderByNote[key] = folderId; else delete this.local.folderByNote[key];
    if (!this.persistLocal()) { if (before === undefined) delete this.local.folderByNote[key]; else this.local.folderByNote[key] = before; this.notify('The folder assignment could not be saved on this device.'); return; }
    this.closeSheet(); this.render(); this.notify(folderId ? 'Added to local folder.' : 'Removed from local folder.');
  }

  async performAction(event, payload, successMessage, apply = null) {
    if (this.identityInvalid) return false;
    const noteId = this.current?.id, epoch = this.navigationEpoch; let token = 0;
    try {
      if (this.savePromise) {
        const saved = await this.savePromise;
        if (!this.alive || epoch !== this.navigationEpoch || this.current?.id !== noteId) return false;
        if (!saved) return false;
      }
      if (this.dirty) { this.notify('Save the latest note changes before using this action.'); return false; }
      token = ++this.operationEpoch;
      const result = await this.send(event, payload);
      if (!this.alive || token !== this.operationEpoch || epoch !== this.navigationEpoch || this.current?.id !== noteId) return false;
      if (result?.__phoneError || result?.Success !== true) throw Error(result?.Message || result?.Msg || 'The server could not complete this action.');
      this.closeSheet(); await apply?.(result); this.notify(typeof successMessage === 'function' ? successMessage(result) : successMessage); return true;
    } catch (error) { if (this.alive && token === this.operationEpoch) this.notify(error?.message || 'The server could not complete this action.'); return false; }
  }

  shareLocal(note) {
    if (!this.canShareNote(note) || this.current?.id !== note.id) return false;
    this.performAction('Documents/ShareLocal', {Id: note.id}, result => Number(result.Count) === 0 ? 'No nearby phones are available to share this note.' : 'Nearby share request sent.');
    return true;
  }

  promptCid(title, submit) {
    const panel = this.openSheet(title); panel.classList.add('notes-input-sheet');
    const {wrapper, input} = this.makeCidField();
    const submitButton = this.textButton('Continue', 'chevron', () => { const cid = input.value.trim(); if (!cid) { this.notify('Enter a character ID.'); input.focus(); return; } submit(cid); }, 'notes-primary-action');
    panel.append(el('p', 'notes-sheet-help', 'Enter the recipient’s character ID (CID).'), wrapper, submitButton);
  }

  makeCidField() {
    const wrapper = el('label', 'notes-field'); wrapper.append(el('span', '', 'Character ID'));
    const input = el('input'); input.type = 'text'; input.autocomplete = 'off'; input.maxLength = 128; input.placeholder = 'Enter CID'; input.setAttribute('aria-label', 'Character ID'); wrapper.append(input); return {wrapper, input};
  }

  confirmFinalize(note) {
    if (this.dirty) { this.notify('Save this contract before finalizing it.'); return; }
    const panel = this.openSheet('Finalize contract'); panel.classList.add('notes-confirm-sheet');
    panel.append(el('p', 'notes-sheet-help', 'Finalizing makes this contract read only. You can then request signatures from invited characters.'));
    panel.append(this.textButton('Finalize contract', 'check', () => this.performAction('Documents/Finalize', {Id: note.id}, 'Contract finalized.', () => { if (this.current?.id === note.id) { this.current.finalized = true; this.readonly = true; this.editingMode = false; this.dirty = false; this.render(); } }), 'notes-primary-action'));
  }

  confirmDelete(note) {
    const panel = this.openSheet('Delete note'); panel.classList.add('notes-confirm-sheet');
    panel.append(el('p', 'notes-sheet-help', `Delete “${note.title || 'Untitled'}”? This cannot be undone.`));
    panel.append(this.textButton('Delete note', 'trash', () => this.performAction('Documents/DeleteDocument', {Id: note.id}, 'Note deleted.', async () => {
      const key = noteKey(note);
      this.local.pinned = this.local.pinned.filter(item => item !== key);
      delete this.local.folderByNote[key]; delete this.local.editedAtByNote[key];
      if (!this.persistLocal()) this.notify('The note was deleted, but its on-device organization could not be cleared.');
      this.current = null; this.baseline = null; this.isNew = false; this.dirty = false; this.view = 'list'; this.clearDraft();
      await this.refreshCurrentType(); this.render();
    }), 'notes-primary-action notes-danger-action'));
  }

  renderSignatures() {
    const note = this.current; if (!note) return;
    const back = this.button('Back to note', 'back', () => this.backToEditor(), 'notes-back-button');
    const head = this.makeHeader({title: 'Signatures', leading: back}); head.classList.add('notes-signatures-header');
    const content = el('main', 'notes-scroll notes-signatures');
    const hasPendingSignature = note.signatures.some(signature => String(signature.Cid) === this.cid && !truth(signature.Signed));
    if (hasPendingSignature) content.append(this.textButton('Sign this contract', 'signature', () => this.signContract(note), 'notes-primary-action'));
    if (String(note.owner) === this.cid) content.append(this.textButton('Request signature', 'plus', () => this.promptCid('Request a signature', cid => this.performAction('Documents/RequestSignature', {Id: note.id, Cid: cid}, 'Signature request sent.', result => { if (this.current?.id === note.id) { this.current.signatures = rows(result.Signatures); this.render(); } })), 'notes-secondary-action'));
    if (!note.signatures.length) content.append(this.stateMessage('No signatures requested', 'The contract is finalized, but no character has been asked to sign yet.', 'empty'));
    else {
      const group = el('div', 'notes-signature-group');
      note.signatures.forEach((signature, index) => {
        const row = el('div', 'notes-signature-row'); const icon = el('span', 'notes-signature-icon'); icon.innerHTML = noteGlyph('signature');
        const copy = el('span', 'notes-signature-copy'); copy.append(el('strong', '', String(signature.Name || signature.Cid || 'Character')), el('small', '', `Signature ${index + 1} · ${signature.Signed ? 'Signed' : 'Awaiting signature'}`));
        row.append(icon, copy, el('span', 'notes-signature-state', signature.Signed ? '✓' : '·')); group.append(row);
      }); content.append(group);
    }
    this.element.replaceChildren(head, content);
  }

  async signContract(note) {
    await this.performAction('Documents/SignDocument', {Id: note.id}, 'Contract signed.', result => {
      if (this.current?.id === note.id) this.current.signatures = rows(result.Signatures);
      this.showSignatures = true; this.view = 'signatures'; ++this.navigationEpoch; this.render();
    });
  }

  stateMessage(title, body, kind, retry, identityCue = '') {
    const state = el('div', `notes-state notes-state-${kind}${identityCue ? ' notes-state-identity' : ''}`);
    const glyph = el('span', 'notes-state-glyph'); glyph.innerHTML = noteGlyph(identityCue === 'identity' ? 'id-card' : kind === 'error' ? 'wifi' : kind === 'loading' ? 'clock' : 'notebook');
    state.append(glyph, el('h2', '', title), el('p', '', body));
    if (retry) state.append(this.textButton('Try again', 'refresh', retry, 'notes-retry'));
    state.setAttribute('role', kind === 'error' ? 'alert' : 'status'); return state;
  }

  staleBanner(title, body, retry) {
    const banner = el('section', 'notes-stale-banner');
    banner.setAttribute('role', 'alert');
    const copy = el('div', 'notes-stale-copy');
    copy.append(el('strong', '', title), el('span', '', body));
    banner.append(copy, this.textButton('Try again', 'refresh', retry, 'notes-retry notes-stale-retry'));
    return banner;
  }

  handleEscape() {
    if (this.sheet) { this.closeSheet(); return true; }
    if (this.view === 'editor' || this.view === 'signatures') { this.toFolders(); return true; }
    if (this.view === 'list') { this.toFolders(); return true; }
    return false;
  }

  $destroy() {
    if (this.current && this.dirty) this.captureDraft();
    clearTimeout(this.draftTimer); clearTimeout(this.searchTimer); ++this.navigationEpoch; ++this.listEpoch; ++this.operationEpoch; ++this.saveEpoch;
    this.savePromise = null; this.saving = false;
    this.domAbort.abort();
    this.editArea = null; this.titleInput = null;
    super.$destroy();
  }
}

function noteGlyph(name) {
  const paths = {
    doc:'<path d="M7 3.5h7l4 4v13H7z"></path><path d="M14 3.5v4h4M9.5 12h6M9.5 15.5h6"></path>',
    compose:'<path d="M5 4.5h9.5a1.5 1.5 0 0 1 1.5 1.5v5"></path><path d="M5 4.5A1.5 1.5 0 0 0 3.5 6v13A1.5 1.5 0 0 0 5 20.5h13a1.5 1.5 0 0 0 1.5-1.5v-5"></path><path d="m13.5 17.5 1-3 5.8-5.8a1.4 1.4 0 0 1 2 2l-5.8 5.8z"></path>',
    signature:'<path d="M4 18c3-1 4-8 6-8s-1 7 1 7 3-5 4-5 0 4 2 4 2-2 3-2"></path><path d="M4 21h16"></path>',
    notebook:'<path d="M6 3.5h13v17H6z"></path><path d="M6 7h13M9 10.5h7M9 13.5h7M9 16.5h5"></path>',
    'id-card':'<rect x="3.5" y="5" width="17" height="14" rx="2"></rect><circle cx="8.5" cy="11" r="2"></circle><path d="M5.5 16c.7-2.3 5.3-2.3 6 0m2-6h4m-4 3h4"></path>',
    car:'<path d="m4 15 1.4-5h13.2l1.4 5v4h-16zM7 10l1.5-4h7l1.5 4M4 15h16"></path><circle cx="7.5" cy="16.5" r="1"></circle><circle cx="16.5" cy="16.5" r="1"></circle>',
    house:'<path d="m3.5 11 8.5-7 8.5 7v9h-17zM9 20v-6h6v6"></path>',
    'folder-plus':'<path d="M3 7h7l1.5 2H21v10.5H3z"></path><path d="M14 11v6m-3-3h6"></path>',
    qr:'<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM15 14h2v2h-2zm3 3h2v3h-3m-3 0h2"></path>',
    share:'<path d="M12 15V3m-4 4 4-4 4 4M5 11H3v10h18V11h-2"></path>',
    users:'<circle cx="9" cy="8" r="3"></circle><path d="M3 20v-2a6 6 0 0 1 12 0v2m2-8a3 3 0 1 0 0-6m1 8a5 5 0 0 1 3 4"></path>',
    check:'<path d="m5 12 4 4L19 6"></path>',
    wifi:'<path d="M2.5 8.5a15 15 0 0 1 19 0M5.5 12a10 10 0 0 1 13 0M8.5 15.5a5 5 0 0 1 6.5 0M12 20h.01"></path>',
    clock:'<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3.5 2"></path>',
    edit:'<path d="m14 5 5 5M4 20l4.5-1L20 7.5 16.5 4 5 15.5z"></path>',
    trash:'<path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m3 4v6m6-6v6"></path>',
    more:'<circle cx="5" cy="12" r=".8"></circle><circle cx="12" cy="12" r=".8"></circle><circle cx="19" cy="12" r=".8"></circle>',
    back:'<path d="m15 5-7 7 7 7"></path>',
    plus:'<path d="M12 4v16M4 12h16"></path>',
    bold:'<path d="M7 4h6a4 4 0 0 1 0 8H7zm0 8h7a4 4 0 0 1 0 8H7z"></path>',
    italic:'<path d="M14 4h-4m4 16h-4m2-16-4 16"></path>',
    underline:'<path d="M6 4v6a6 6 0 0 0 12 0V4M4 21h16"></path>',
    list:'<path d="M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01"></path>',
    gallery:'<rect x="3.5" y="4" width="7" height="7" rx="1"></rect><rect x="13.5" y="4" width="7" height="7" rx="1"></rect><rect x="3.5" y="14" width="7" height="7" rx="1"></rect><rect x="13.5" y="14" width="7" height="7" rx="1"></rect>',
    sliders:'<path d="M4 7h7m4 0h5M4 17h3m4 0h9"></path><circle cx="13" cy="7" r="2"></circle><circle cx="9" cy="17" r="2"></circle>',
    checklist:'<path d="m4 7 1.5 1.5L8 6M11 7h9M4 14l1.5 1.5L8 13M11 14h9M4 20h5"></path>',
    numbered:'<path d="M10 6h11M10 12h11M10 18h11M3 5h2v3M3 12c0-1 2-1 2-2s-2-1-2-1m0 8c0-1 2-1 2 0s-2 1-2 0"></path>',
    quote:'<path d="M4 18h6l2-6V6H5l-1 6h4zm9 0h6l2-6V6h-7l-1 6h4z"></path>',
    table:'<rect x="3" y="4" width="18" height="16" rx="1"></rect><path d="M3 10h18M9 4v16M15 4v16"></path>',
    undo:'<path d="M9 14 4 9l5-5M4 9h9a7 7 0 0 1 7 7v3"></path>',
    redo:'<path d="m15 14 5-5-5-5m5 5h-9a7 7 0 0 0-7 7v3"></path>',
    refresh:'<path d="M20 8a8.5 8.5 0 1 0 1 6M20 3v6h-6"></path>',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.doc}</svg>`;
}

function folderGlyph(name) {
  const glyph = name === 'notebook' ? noteGlyph('notebook') : noteGlyph(name);
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 7h6l1.5 2h9.5v10.5h-17z"></path>${glyph.match(/<svg[^>]*>(.*)<\/svg>/)?.[1] || ''}</svg>`;
}
