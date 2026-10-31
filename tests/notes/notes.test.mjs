import test from 'node:test';
import assert from 'node:assert/strict';
import { NOTE_TYPES, NotesApp, canCreateNote, canEditNote, createNoteTextCache, filterNoteResults, normalizeNote, noteDateGroup, noteFromDetailResult, notesMetadataFromPage, notesRowsFromReadResult, pageNoteResults, sortNoteRows, validateNoteSavePayload } from '../../web/public/duo/notes-app.mjs';

test('Notes categories keep the existing server create permissions', () => {
  assert.deepEqual(NOTE_TYPES.map(({id}) => id), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(NOTE_TYPES.filter(({create}) => create).map(({id}) => id), [0, 2, 5]);
  for (const type of [0, 1, 2, 3, 4, 5]) assert.equal(canCreateNote(type), [0, 2, 5].includes(type));
});

test('normalized server rows preserve owner, finalized, signature and share state', () => {
  const note = normalizeNote({
    Id: 42, Type: 5, Title: 'Agreement', Content: '<p>Terms</p>', Cid: 'owner-1',
    Finalized: 1, Signatures: [{Cid: 'owner-1', Signed: true}], Sharees: ['signer-2'],
  });
  assert.deepEqual(note, {
    id: 42, type: 5, title: 'Agreement', content: '<p>Terms</p>', owner: 'owner-1',
    finalized: true, signatures: [{Cid: 'owner-1', Signed: true}], sharees: ['signer-2'],
    editing: false, timestamp: null,
  });
  assert.equal(noteDateGroup(note), 'Notes', 'legacy rows without server timestamps must not receive a made-up date');
});

test('edit permission is restricted to the owner of an unfinished non-drop document', () => {
  const note = {id: 10, owner: 'owner-1', finalized: false};
  assert.equal(canEditNote(note, 'owner-1'), true);
  assert.equal(canEditNote({...note, finalized: true}, 'owner-1'), false);
  assert.equal(canEditNote(note, 'other-character'), false);
  assert.equal(canEditNote(note, 'owner-1', true), false);
  assert.equal(canEditNote({...note, id: null}, 'owner-1'), false);
});

test('Notes read spacing starts at actual dispatch after a delayed microtask', {timeout: 5000}, async () => {
  const app = Object.create(NotesApp.prototype);
  const starts = [];
  const releases = new Map();
  let active = 0, maxActive = 0, cleaningUp = false;
  let markSecondStarted, markThirdStarted;
  const secondStarted = new Promise(resolve => { markSecondStarted = resolve; });
  const thirdStarted = new Promise(resolve => { markThirdStarted = resolve; });
  const deferredRun = name => () => {
    starts.push({name, at: performance.now()});
    active++;
    maxActive = Math.max(maxActive, active);
    if (name === 'second') markSecondStarted();
    if (name === 'third') markThirdStarted();
    return new Promise(resolve => {
      let released = false;
      releases.set(name, () => {
        if (released) return;
        released = true;
        active--;
        resolve(name);
      });
      if (cleaningUp) queueMicrotask(releases.get(name));
    });
  };

  const first = app.queueNotesRead(deferredRun('first'), () => true);
  const second = app.queueNotesRead(deferredRun('second'), () => true);
  const third = app.queueNotesRead(deferredRun('third'), () => true);
  const cancelled = app.queueNotesRead(() => assert.fail('a stale queued Notes read must not dispatch'), () => false);
  const cancellationCheck = assert.rejects(cancelled, /no longer current/);

  try {
    // Keep the task busy past the provisional 125 ms reservation and its timer.
    // The first microtask then dispatches after the second timer is already due.
    const until = performance.now() + 170;
    while (performance.now() < until) {}

    await secondStarted;
    assert.equal(starts.length, 2, 'the third read remains queued while two reads are active');
    assert.ok(starts[1].at - starts[0].at >= 125, `actual read starts were ${starts[1].at - starts[0].at} ms apart`);
    assert.equal(maxActive, 2, 'at most two detail reads remain active');
    await cancellationCheck;

    releases.get('first')();
    await thirdStarted;
    assert.equal(maxActive, 2, 'queued work starts only after a slot is released');
    assert.deepEqual(starts.map(({name}) => name), ['first', 'second', 'third']);

    releases.get('second')();
    releases.get('third')();
    assert.deepEqual(await Promise.all([first, second, third]), ['first', 'second', 'third']);
  } finally {
    cleaningUp = true;
    for (const release of releases.values()) release();
    await Promise.allSettled([first, second, third, cancellationCheck]);
  }
});

test('Notes read spacing covers staggered enqueues in one blocked task without serializing active reads', {timeout: 5000}, async () => {
  await new Promise(resolve => setTimeout(resolve, 130));
  const app = Object.create(NotesApp.prototype);
  const starts = [];
  const releases = new Map();
  let active = 0, maxActive = 0, cleaningUp = false, markSecondStarted;
  const secondStarted = new Promise(resolve => { markSecondStarted = resolve; });
  const deferredRun = name => () => {
    starts.push({name, at: performance.now()});
    active++;
    maxActive = Math.max(maxActive, active);
    if (name === 'second') markSecondStarted();
    return new Promise(resolve => {
      let released = false;
      releases.set(name, () => {
        if (released) return;
        released = true;
        active--;
        resolve(name);
      });
      if (cleaningUp) queueMicrotask(releases.get(name));
    });
  };

  const first = app.queueNotesRead(deferredRun('first'), () => true);
  let second;
  try {
    const until = performance.now() + 170;
    while (performance.now() < until) {}
    second = app.queueNotesRead(deferredRun('second'), () => true);

    await secondStarted;
    assert.equal(starts.length, 2);
    assert.ok(starts[1].at - starts[0].at >= 125, `actual read starts were ${starts[1].at - starts[0].at} ms apart`);
    assert.equal(active, 2, 'the second read can overlap a still-active first read');
    assert.equal(maxActive, 2, 'the scheduler retains its two-read concurrency cap');

    releases.get('first')();
    releases.get('second')();
    assert.deepEqual(await Promise.all([first, second]), ['first', 'second']);
  } finally {
    cleaningUp = true;
    for (const release of releases.values()) release();
    await Promise.allSettled([first, second].filter(Boolean));
  }
});

test('Notes read dispatch rechecks identity after reserving a microtask', {timeout: 5000}, async () => {
  // Let the preceding read's spacing deadline elapse so this request reserves
  // a dispatch microtask instead of waiting in the paced queue.
  await new Promise(resolve => setTimeout(resolve, 130));
  const app = Object.create(NotesApp.prototype);
  let current = true, dispatches = 0;
  const pending = app.queueNotesRead(() => { dispatches++; }, () => current);
  current = false;
  await assert.rejects(pending, /no longer current/);
  assert.equal(dispatches, 0, 'a request invalidated before dispatch never reaches the transport');
});

test('portable save size mirrors the packed Cfx array and its Unicode escapes', () => {
  const encoder = new TextEncoder();
  const payload = content => ({Type: 0, Title: 'Unicode envelope', Content: content});
  const cfxBytes = note => encoder.encode(JSON.stringify([note]).replace(
    /[\u007f-\u009f\u00ad\u0600-\u0604\u070f\u17b4-\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
    character => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`,
  )).length;
  const escapedRangeEndpoints = [
    '\u007f', '\u009f', '\u00ad', '\u0600', '\u0604', '\u070f',
    '\u17b4', '\u17b5', '\u200c', '\u200f', '\u2028', '\u202f',
    '\u2060', '\u206f', '\ufeff', '\ufff0', '\uffff',
  ];
  for (const character of escapedRangeEndpoints) {
    const over = payload(character.repeat(22_000));
    assert.ok(encoder.encode(over.Content).length <= 100_000, `raw ${character.codePointAt(0).toString(16)} content is in range`);
    assert.ok(encoder.encode(JSON.stringify([over])).length <= 131_072, `ordinary JSON for ${character.codePointAt(0).toString(16)} is in range`);
    assert.equal(cfxBytes(over), 132_052, `expected packed Cfx bytes for ${character.codePointAt(0).toString(16)}`);
    assert.match(validateNoteSavePayload(over), /too large to save/, `Cfx Unicode escaping is applied to ${character.codePointAt(0).toString(16)}`);
  }

  const near = payload('\u2028'.repeat(21_000));
  const nearArrayBytes = encoder.encode(JSON.stringify([near])).length;
  assert.ok(nearArrayBytes <= 131_072, 'ordinary JSON.stringify leaves U+2028 literal');
  assert.equal(cfxBytes(near), 126_052, '21,000 Cfx-escaped U+2028 separators remain under the RPC cap');
  assert.equal(validateNoteSavePayload(near), null, 'the Cfx-escaped representation remains within the RPC cap');
});

test('search text is cached per note content and invalidated when content changes', () => {
  let parses = 0;
  const textFor = createNoteTextCache(markup => { parses++; return markup.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(); });
  const notes = Array.from({length: 350}, (_, index) => ({title: `Item ${index}`, content: '<p>Shared body</p>'}));
  assert.equal(filterNoteResults(notes, 'shared', textFor).length, 350);
  assert.equal(parses, 350, 'the first content search reads each note once');
  assert.equal(filterNoteResults(notes, 'item 3', textFor).length, 61);
  assert.equal(parses, 350, 'subsequent queries reuse the sanitized plain-text cache');
  notes[0].title = 'Renamed';
  assert.equal(filterNoteResults(notes, 'renamed', textFor).length, 1);
  assert.equal(parses, 350, 'title changes update search text without reparsing content');
  notes[0].content = '<p>Revised body</p>';
  assert.equal(filterNoteResults(notes, 'revised', textFor).length, 1);
  assert.equal(parses, 351, 'a content change invalidates only that note');
});

test('search counts every match while rendering a bounded page with more remaining', () => {
  const notes = Array.from({length: 350}, (_, index) => ({title: `Note ${index}`, content: '<p>needle</p>'}));
  const matches = filterNoteResults(notes, 'needle', createNoteTextCache(markup => markup.replace(/<[^>]*>/g, ' ')));
  const first = pageNoteResults(matches, 100), second = pageNoteResults(matches, 200);
  assert.equal(first.total, 350);
  assert.equal(first.items.length, 100);
  assert.equal(first.hasMore, true);
  assert.equal(second.items.length, 200);
  assert.equal(second.total, 350);
  assert.equal(pageNoteResults(matches, 500).hasMore, false);
});

test('sort transitions use dates in every folder without mutating stored order', () => {
  const stored = [
    {id: 1, title: 'Beta', timestamp: 2000},
    {id: 2, title: 'Alpha', timestamp: 4000},
    {id: 3, title: 'Gamma', timestamp: 4000},
    {id: 4, title: 'No date', timestamp: null},
  ];
  const byTitle = sortNoteRows(stored, 'title');
  const newestAfterTitle = sortNoteRows(byTitle, 'newest', note => note.timestamp);
  const oldest = sortNoteRows(stored, 'oldest', note => note.timestamp);
  assert.deepEqual(byTitle.map(note => note.id), [2, 1, 3, 4]);
  assert.deepEqual(newestAfterTitle.map(note => note.id), [3, 2, 1, 4]);
  assert.deepEqual(oldest.map(note => note.id), [1, 2, 3, 4]);
  assert.deepEqual(stored.map(note => note.id), [1, 2, 3, 4], 'a title sort must not mutate the cached server rows');
  const locallyEdited = sortNoteRows(stored, 'newest', note => note.id === 4 ? 6000 : note.timestamp);
  assert.deepEqual(locallyEdited.map(note => note.id), [4, 3, 2, 1], 'a saved local edit date participates when the server date is missing');
});

test('Notes read envelopes distinguish verified empty lists from unavailable and unsupported reads', () => {
  assert.deepEqual(notesRowsFromReadResult({Success: true, Rows: []}), [], 'a JSON empty array is a verified empty list');
  assert.deepEqual(notesRowsFromReadResult({Success: true, Rows: {}}), [], 'an empty Lua table is a verified empty list');
  assert.throws(() => notesRowsFromReadResult({Success: false, Status: 'unavailable', Message: 'SELECT secret'}), error => {
    assert.match(error.message, /temporarily unavailable/);
    assert.doesNotMatch(error.message, /SELECT|secret/);
    assert.equal(error.status, 'unavailable');
    return true;
  });
  assert.throws(() => notesRowsFromReadResult({Success: false, Status: 'identity'}), error => {
    assert.match(error.message, /character changed/);
    assert.equal(error.status, 'identity');
    return true;
  });
  assert.throws(() => notesRowsFromReadResult({Success: false, Status: 'invalid'}), /Reopen Notes and try again/);
  assert.throws(() => notesRowsFromReadResult({Success: false, Status: 'unexpected'}), /Reopen Notes and try again/);
  assert.throws(() => notesRowsFromReadResult([]), /Reopen Notes and try again/, 'legacy raw arrays are not accepted as proof of a successful read');
  assert.throws(() => notesRowsFromReadResult({Success: true}), /Reopen Notes and try again/);
  assert.throws(() => notesRowsFromReadResult({Success: true, Rows: {0: {Title: 'malformed'}}}), /Reopen Notes and try again/);
});

test('metadata pages retain only summary fields and validate signature counts', () => {
  const page = notesMetadataFromPage({Success:true,Type:0,Done:true,Rows:[{
    id:9,type:0,title:'Shared note',citizenid:'owner',finalized:0,shared:true,signatureCount:2,signedCount:1,
  }]}, 0, {upperId:10});
  assert.deepEqual(page.rows[0], {
    id:9,type:0,title:'Shared note',owner:'owner',finalized:false,shared:true,
    signatureCount:2,signedCount:1,summary:true,detailLoaded:false,
  });
  assert.equal(Object.hasOwn(page.rows[0], 'content'), false);
  assert.equal(Object.hasOwn(page.rows[0], 'signatures'), false);
  assert.throws(() => notesMetadataFromPage({Success:true,Type:0,Done:true,Rows:[{
    id:9,type:0,title:'Bad counts',citizenid:'owner',signatureCount:1,signedCount:2,
  }]}, 0, {upperId:10}), /safely/);
});

test('detail reads bind the requested row and require full detail arrays', () => {
  const result = {Success:true,Row:{id:9,type:0,title:'Full note',content:'<p>Body</p>',citizenid:'owner',finalized:0,signatures:[],sharees:[]}};
  assert.equal(noteFromDetailResult(result, 9).detailLoaded, true);
  assert.throws(() => noteFromDetailResult(result, 10), /safely/);
  assert.throws(() => noteFromDetailResult({...result,Row:{...result.Row,sharees:{unsafe:'value'}}}, 9), /safely/);
});
