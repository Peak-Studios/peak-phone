"""Exercise Notes in the synthetic browser preview; never connects to a live server."""
import os
import tempfile
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from playwright.sync_api import sync_playwright, expect


URL = os.environ.get('PREVIEW_URL', 'http://127.0.0.1:8791/?notes=preview')


def notes_fixture_url(base_url, mode):
    parts = urlsplit(base_url)
    query = [(key, value) for key, value in parse_qsl(parts.query, keep_blank_values=True) if key != 'notes']
    query.append(('notes', mode))
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query, doseq=True), parts.fragment))


def check_notes_fixture_url_builder():
    assert notes_fixture_url('http://127.0.0.1:8791', 'error') == 'http://127.0.0.1:8791?notes=error'
    assert notes_fixture_url('http://127.0.0.1:8791/?keep=one&notes=preview&empty=#screen', 'error') == 'http://127.0.0.1:8791/?keep=one&empty=&notes=error#screen'


def open_notes(page, expect_verified=True):
    page.evaluate("""async () => {
        const {NotesApp} = await import('./duo/notes-app.mjs?rev=owner-config-20261015');
        if (!window.__notesRenderProbeInstalled) {
            const render = NotesApp.prototype.render;
            NotesApp.prototype.render = function(...args) {
                window.__notesApp = this;
                return render.apply(this, args);
            };
            window.__notesRenderProbeInstalled = true;
        }
    }""")
    page.evaluate("""() => {
        if (window.__notesSaveResponses) return;
        const send = window.PeakPhoneTransport;
        window.__notesSaveResponses = [];
        const serverCid = window.name.startsWith('notes-server-cid:') ? window.name.slice('notes-server-cid:'.length) : 'PREVIEW';
        const reads = window.__notesGetDocuments = {
            started: 0, completed: 0, failNext: 0, identityNext: 0, holdNext: 0,
            holdType: null, pending: [], requests: [], extraRows: [], serverCid,
            behaviorByType: {}, behaviorLog: [], behaviorOutcomes: [], completionOrder: [], delayed: [],
            responseBytes: [], responseShapes: [], requestTimes: [], metadataBytes: 0, detailBytes: 0,
            detailActive: 0, maxDetailActive: 0,
        };
        const readEvents = new Set(['Documents/GetNotesSummary', 'Documents/GetNotesMetadataPage', 'Documents/GetNoteDetail']);
        reads.releasePending = async () => {
            const pending = reads.pending.shift();
            if (!pending) return false;
            pending.resolve(await send(pending.event, pending.data));
            return true;
        };
        window.__notesSaveControl = {failNext: 0};
        window.PeakPhoneTransport = async (event, data) => {
            if (event === 'Documents/SaveDocument' && window.__notesSaveControl.failNext > 0) {
                window.__notesSaveControl.failNext--;
                await new Promise(resolve => setTimeout(resolve, 400));
                const result = {Success: false, Status: 'unavailable', Message: 'Test-only save failure'};
                window.__notesSaveResponses.push({data: structuredClone(data), result: structuredClone(result)});
                return result;
            }
            if (readEvents.has(event)) {
                reads.started++;
                reads.requestTimes.push(performance.now());
                const type = data.Type == null ? null : Number(data.Type);
                if (event === 'Documents/GetNoteDetail') {
                    reads.detailActive++;
                    reads.maxDetailActive = Math.max(reads.maxDetailActive, reads.detailActive);
                }
                reads.requests.push({...structuredClone(data), Event:event});
                const queue = reads.behaviorByType[String(type)];
                const behavior = Array.isArray(queue) ? queue.shift() : null;
                reads.behaviorLog.push({type, event, behavior:behavior || null});
                const cidAtRequest = reads.serverCid;
                let status = 'success';
                try {
                    if (behavior?.delayMs > 0) {
                        reads.delayed.push({type, event, kind:'status'});
                        await new Promise(resolve => setTimeout(resolve, behavior.delayMs));
                    }
                    if (behavior?.status) {
                        status = behavior.status;
                        reads.behaviorOutcomes.push({type, status:behavior.status});
                        return {Success:false, Status:status, Message:status === 'identity'
                            ? 'Your character changed while Notes was loading. Reopen Notes to refresh it.'
                            : 'SQL details must not reach the Notes screen'};
                    }
                    if (reads.holdNext > 0 && type === reads.holdType) {
                        reads.holdNext--;
                        return await new Promise(resolve => reads.pending.push({event, data: structuredClone(data), resolve}));
                    }
                    // failNext targets the catalog/read flow under test. Row
                    // excerpt hydration is concurrent and must not steal a
                    // planned refresh failure.
                    if (reads.failNext > 0 && event !== 'Documents/GetNoteDetail') {
                        reads.failNext--;
                        status = 'unavailable';
                        return {Success: false, Status: 'unavailable', Message: 'SQL details must not reach the Notes screen'};
                    }
                    if (reads.identityNext > 0 || (data.ExpectedCid !== undefined && data.ExpectedCid !== cidAtRequest)) {
                        if (reads.identityNext > 0) reads.identityNext--;
                        status = 'identity';
                        return {Success: false, Status: 'identity', Message: 'Your character changed while Notes was loading. Reopen Notes to refresh it.'};
                    }
                    const result = await send(event, data);
                    if (behavior?.responseDelayMs > 0) {
                        reads.delayed.push({type, event, kind:'response'});
                        await new Promise(resolve => setTimeout(resolve, behavior.responseDelayMs));
                    }
                    let response = result;
                    if (reads.serverCid !== data.ExpectedCid && !behavior?.allowOldRows) {
                        response = {Success:false,Status:'identity',Message:'Your character changed while Notes was loading.'};
                    } else if (reads.serverCid !== 'PREVIEW' && data.ExpectedCid === reads.serverCid && !behavior?.allowOldRows) {
                        response = event === 'Documents/GetNotesSummary'
                            ? {Success:true,Types:Array.from({length:6},(_,kind)=>({Type:kind,Count:0,UpperId:0}))}
                            : event === 'Documents/GetNotesMetadataPage'
                                ? {Success:true,Type:type,Rows:[],Done:true,NextCursor:null}
                                : {Success:false,Status:'missing',Message:'This note is no longer available.'};
                    }
                    if (response?.Success === true && reads.extraRows.length) {
                        if (event === 'Documents/GetNotesSummary') {
                            response = structuredClone(response);
                            const type0 = response.Types.find(item => Number(item.Type) === 0);
                            const extras = reads.extraRows.filter(row => Number(row.type) === 0);
                            type0.Count += extras.length;
                            type0.UpperId = Math.max(type0.UpperId, ...extras.map(row => Number(row.id)), 0);
                        } else if (event === 'Documents/GetNotesMetadataPage' && type === 0) {
                            const upper = Number(data.UpperId), cursor = data.Cursor == null ? null : Number(data.Cursor);
                            const extras = reads.extraRows.filter(row => Number(row.type) === 0 && Number(row.id) <= upper && (cursor == null || Number(row.id) < cursor))
                                .map(row => ({id:Number(row.id),type:0,title:String(row.title || ''),citizenid:String(row.citizenid || ''),
                                    finalized:Number(row.finalized) === 1,signatureCount:Array.isArray(row.signatures) ? row.signatures.length : 0,
                                    signedCount:Array.isArray(row.signatures) ? row.signatures.filter(item => item?.Signed === true || item?.Signed === 1 || item?.Signed === '1' || item?.Signed === 'true').length : 0,
                                    shared:String(row.citizenid || '') !== 'PREVIEW' || (Array.isArray(row.sharees) && row.sharees.length > 0)}));
                            const combined = [...response.Rows, ...extras].sort((a,b)=>Number(b.id)-Number(a.id)).slice(0,50);
                            response = {...response,Rows:combined,Done:combined.length<50,NextCursor:combined.length===50?Number(combined.at(-1).id):null};
                        } else if (event === 'Documents/GetNoteDetail') {
                            const extra = reads.extraRows.find(row => String(row.id) === String(data.Id));
                            if (extra) response = {Success:true,Row:structuredClone(extra)};
                        }
                    }
                    if (response?.Success === false) status = response.Status || 'error';
                    const bytes = new TextEncoder().encode(JSON.stringify(response)).length;
                    reads.responseBytes.push({event,type,bytes});
                    reads.responseShapes.push({event,type,bytes,rows:Array.isArray(response?.Rows)?response.Rows.length:0,
                        hasDocumentBody:!!(response && (Object.prototype.hasOwnProperty.call(response,'content')
                            || Object.prototype.hasOwnProperty.call(response,'Content')
                            || (Array.isArray(response.Rows) && response.Rows.some(row => Object.prototype.hasOwnProperty.call(row,'content') || Object.prototype.hasOwnProperty.call(row,'Content')))))});
                    if (event === 'Documents/GetNotesSummary' || event === 'Documents/GetNotesMetadataPage') reads.metadataBytes += bytes;
                    if (event === 'Documents/GetNoteDetail') reads.detailBytes += bytes;
                    return response;
                } finally {
                    reads.completed++;
                    if (event === 'Documents/GetNoteDetail') reads.detailActive = Math.max(0, reads.detailActive - 1);
                    reads.completionOrder.push({type, status});
                }
            }
            const result = await send(event, data);
            if (event === 'Documents/SaveDocument') {
                window.__notesSaveResponses.push({data: structuredClone(data), result: structuredClone(result)});
            }
            return result;
        };
    }""")
    page.evaluate("PeakDuo.openApp('documents')")
    expect(page.locator('.nx-notes')).to_be_visible(timeout=5000)
    if expect_verified:
        expect(page.locator('.notes-folder-row[data-type="0"]')).to_be_visible(timeout=5000)


def wait_notes_idle(page, timeout=5000):
    """Wait for the active catalog navigation, including paced queued reads."""
    page.wait_for_function("""() => window.__notesApp?.loading === false
        && window.__notesGetDocuments.started === window.__notesGetDocuments.completed""", timeout=timeout)


def save_draft(page, title):
    page.get_by_label('Note title').fill(title)
    page.get_by_role('button', name='Save changes').click()
    page.wait_for_function(
        """title => PeakDuo.requests.some(request => request.event === 'Documents/SaveDocument'
           && request.data.Title === title)""",
        arg=title,
        timeout=5000,
    )
    expect(page.get_by_label('Note title')).to_have_value(title, timeout=5000)
    page.wait_for_function(
        """() => !document.querySelector('.notes-save-top[aria-busy="true"]')
           && document.querySelector('.notes-editor-meta > span')?.textContent === 'Saved to Notes'""",
        timeout=5000,
    )


def exercise_identity_invalidation(browser, url, errors):
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(url, wait_until='domcontentloaded')
    page.wait_for_function('window.PeakDuo?.preview === true')
    page.evaluate("""async () => {
        const {NotesApp} = await import('/duo/notes-app.mjs?rev=owner-config-20261015');
        const render = NotesApp.prototype.render;
        NotesApp.prototype.render = function(...args) {
            window.__notesIdentityTestApp = this;
            return render.apply(this, args);
        };
    }""")
    open_notes(page)
    wait_notes_idle(page)
    requests = page.evaluate('window.__notesGetDocuments.requests')
    assert requests and all(request.get('ExpectedCid') == 'PREVIEW' and request.get('Event') in {
        'Documents/GetNotesSummary', 'Documents/GetNotesMetadataPage', 'Documents/GetNoteDetail'} for request in requests), requests

    page.locator('.notes-folder-row[data-type="0"]').click()
    row = page.get_by_role('button', name='Open note: Studio ideas')
    expect(row).to_be_visible(timeout=5000)
    row.click()
    page.get_by_role('button', name='Edit note').click()
    page.get_by_label('Note title').fill('Identity recovery draft')
    page.get_by_label('Note content').fill('Keep this recovery text on this device.')
    page.locator('.notes-back-button').click()
    page.get_by_role('button', name='Keep a recovery draft').click()
    wait_notes_idle(page)
    assert page.evaluate("""() => Object.entries(localStorage).some(([key, value]) => {
        if (!key.includes('notes-draft')) return false;
        try { const draft = JSON.parse(value); return draft?.title === 'Identity recovery draft' && draft.content.includes('Keep this recovery text'); }
        catch { return false; }
    })"""), 'the dirty editor was persisted locally before identity invalidation'
    page.locator('.notes-folder-row[data-type="0"]').click()
    expect(page.get_by_role('button', name='Open note: Studio ideas')).to_be_visible(timeout=5000)
    wait_notes_idle(page)
    page.evaluate("""() => {
        const reads = window.__notesGetDocuments;
        window.__staleNoteRow = document.querySelector('.notes-note-row');
        reads.holdType = 0; reads.holdNext = 1;
    }""")
    page.get_by_role('button', name='Refresh Notes').click()
    page.wait_for_function('window.__notesGetDocuments.pending.length === 1', timeout=5000)
    assert page.evaluate("""() => {
        const app = window.__notesIdentityTestApp;
        const hadDetachedEditorRefs = app.editArea instanceof HTMLElement && !app.editArea.isConnected
            && app.titleInput instanceof HTMLElement && !app.titleInput.isConnected;
        app.editorUndoStack.push({before:{title:'Old identity title',content:'Private old identity body'},after:{title:'New old identity title',content:'Private old identity body'} });
        app.editorRedoStack.push({before:{title:'Old redo title',content:'Private redo body'},after:{title:'Old redo title',content:'Private redo body 2'} });
        app.pendingEditorHistory = {state:{title:'Pending old identity title',content:'Pending old identity body'}};
        app.pendingNativeHistory = {before:{title:'Native old identity title',content:'Native old identity body'}};
        app.pendingChecklistEnter = document.createElement('span');
        app.compositionHistoryStart = {title:'Composing old identity title',content:'Composing old identity body'};
        app.editorComposing = true;
        app.externalTarget = {note:{id:999,title:'External old identity title',content:'External old identity body'}};
        window.__notesIdentityDetachedRefsBefore = hadDetachedEditorRefs;
        return hadDetachedEditorRefs;
    }"""), 'the prior editor left detached element references to clear'
    page.evaluate('window.__notesGetDocuments.identityNext = 1')
    page.get_by_role('button', name='Refresh Notes').click()
    expect(page.locator('.notes-state-error')).to_be_visible(timeout=5000)
    expect(page.locator('.notes-state-error')).to_contain_text('character changed while Notes was loading')
    assert page.evaluate("""() => {
        const app = window.__notesIdentityTestApp;
        return app.editArea === null && app.titleInput === null && app.editorFooter === null
            && app.editorUndoStack.length === 0 && app.editorRedoStack.length === 0
            && app.pendingEditorHistory === null && app.pendingNativeHistory === null
            && app.pendingChecklistEnter === null && app.compositionHistoryStart === null
            && app.editorComposing === false && app.externalTarget === null;
    }"""), 'identity invalidation releases all detached editor and old-character state'
    expect(page.locator('.notes-folder-row[data-type]')).to_have_count(0)
    expect(page.locator('.notes-folder-count')).to_have_count(0)
    expect(page.locator('.notes-note-row')).to_have_count(0)
    expect(page.get_by_role('button', name='Try again')).to_have_count(0)
    expect(page.locator('[aria-label="Note title"]')).to_have_count(0)
    expect(page.get_by_role('button', name='Create a new note')).to_have_count(0)
    expect(page.get_by_role('button', name='Share note')).to_have_count(0)
    page.evaluate('window.__staleNoteRow.click()')
    expect(page.locator('.nx-notes')).to_have_attribute('data-notes-view', 'folders')
    expect(page.locator('[aria-label="Note content"]')).to_have_count(0)

    page.evaluate('window.__notesGetDocuments.releasePending()')
    wait_notes_idle(page)
    expect(page.locator('.notes-state-error')).to_be_visible()
    expect(page.locator('.notes-note-row')).to_have_count(0)
    expect(page.locator('.notes-folder-count')).to_have_count(0)
    assert page.evaluate("""() => Object.entries(localStorage).some(([key, value]) => {
        if (!key.includes('notes-draft')) return false;
        try { const draft = JSON.parse(value); return draft?.title === 'Identity recovery draft' && draft.content.includes('Keep this recovery text'); }
        catch { return false; }
    })"""), 'identity invalidation preserves the already persisted recovery draft locally'
    for theme in ('light', 'dark'):
        page.evaluate('(theme) => PeakDuo.setPhoneSetting("appearance", theme)', theme)
        page.wait_for_function('(theme) => document.querySelector("#duo").dataset.theme === theme', arg=theme, timeout=5000)
        colors = page.evaluate("""() => {
            const glyph = document.querySelector('.notes-state-identity .notes-state-glyph');
            const color = getComputedStyle(glyph).color.match(/[\\d.]+/g).slice(0,3).map(Number);
            const background = getComputedStyle(glyph).backgroundColor.match(/[\\d.]+/g).slice(0,3).map(Number);
            const luminance = channels => channels.map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, value, i) => sum + value * [.2126,.7152,.0722][i], 0);
            const a = luminance(color), b = luminance(background);
            return {color:getComputedStyle(glyph).color,background:getComputedStyle(glyph).backgroundColor,contrast:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),svg:glyph.querySelector('svg')?.innerHTML};
        }""")
        assert colors['contrast'] >= 4.5, (theme, colors)
        assert colors['svg'] and '<circle' in colors['svg'] and '<rect' in colors['svg'], (theme, colors)

    # A fresh app mount with the old PlayerData CID must be denied before the
    # fixture's new active identity can return any Notes rows.
    page.evaluate("window.name = 'notes-server-cid:NEXT';")
    page.reload(wait_until='domcontentloaded')
    page.wait_for_function('window.PeakDuo?.preview === true')
    open_notes(page, expect_verified=False)
    expect(page.locator('.notes-state-error')).to_be_visible(timeout=5000)
    expect(page.locator('.notes-state-error')).to_contain_text('character changed while Notes was loading')
    expect(page.locator('.notes-folder-row[data-type]')).to_have_count(0)
    expect(page.locator('.notes-folder-count')).to_have_count(0)
    expect(page.get_by_role('button', name='Try again')).to_have_count(0)
    assert page.evaluate("window.__notesGetDocuments.requests.every(request => request.ExpectedCid === 'PREVIEW')")
    wait_notes_idle(page)

    # Once the trusted PlayerData lifecycle supplies NEXT, a new app instance
    # can read its own verified empty list without importing the PREVIEW rows.
    page.evaluate("""async () => {
        const module = window.PeakDuo.previewAdapter;
        const data = module.previewOpen();
        data.PlayerData = {...data.PlayerData, Cid: 'NEXT'};
        await PeakDuo.sendPreview(data);
    }""")
    page.wait_for_timeout(50)
    page.evaluate("PeakDuo.openApp('documents')")
    page.wait_for_function("""() => document.querySelector('.nx-notes')
        && !document.querySelector('.notes-state-loading')
        && window.__notesGetDocuments.started === window.__notesGetDocuments.completed""", timeout=5000)
    expect(page.locator('.notes-folder-row[data-type]')).to_have_count(6)
    expect(page.locator('.notes-folder-count').first).to_have_text('0')
    assert page.evaluate("window.__notesGetDocuments.requests.at(-1).ExpectedCid === 'NEXT'")
    expect(page.get_by_role('button', name='Try again')).to_have_count(0)
    assert not errors, errors
    page.close()


def prepare_parallel_identity_page(browser, url, errors):
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(url, wait_until='domcontentloaded')
    page.wait_for_function('window.PeakDuo?.preview === true')
    page.evaluate("""async () => {
        const {NotesApp} = await import('/duo/notes-app.mjs?rev=owner-config-20261015');
        window.__notesProbeSerial = 0;
        const render = NotesApp.prototype.render;
        NotesApp.prototype.render = function(...args) {
            if (!this.__notesProbeId) this.__notesProbeId = ++window.__notesProbeSerial;
            window.__notesParallelApp = this;
            return render.apply(this, args);
        };
        const invalidate = NotesApp.prototype.invalidateForIdentity;
        NotesApp.prototype.invalidateForIdentity = function(...args) {
            const changed = invalidate.apply(this, args);
            if (changed) this.__identityInvalidations = (this.__identityInvalidations || 0) + 1;
            return changed;
        };
    }""")
    open_notes(page)
    wait_notes_idle(page)
    expect(page.locator('.notes-folder-row[data-type="0"]')).to_be_visible(timeout=5000)
    page.evaluate('window.__staleFolderRow = document.querySelector(\'.notes-folder-row[data-type="0"]\')')
    page.locator('.notes-folder-row[data-type="0"]').click()
    expect(page.get_by_role('button', name='Open note: Studio ideas')).to_be_visible(timeout=5000)
    wait_notes_idle(page)
    return page


def expect_identity_invalidated(page):
    expect(page.locator('.notes-state-identity')).to_be_visible(timeout=5000)
    expect(page.locator('.notes-state-identity')).to_contain_text('character changed while Notes was loading')
    expect(page.locator('.notes-folder-row[data-type]')).to_have_count(0)
    expect(page.locator('.notes-folder-count')).to_have_count(0)
    expect(page.locator('.notes-note-row')).to_have_count(0)
    expect(page.get_by_role('button', name='Try again')).to_have_count(0)


def exercise_parallel_folder_identity(browser, url, errors):
    # Reproduce Astra's failure order, then reverse it. A late successful type
    # two response must not repopulate cached folders after Type one invalidates
    # the identity scope.
    for case, behaviors in (
        ('unavailable-first', {
            '0': [{'status':'unavailable'}],
            '1': [{'status':'identity', 'delayMs':120}],
        }),
        ('identity-first', {
            '0': [{'allowOldRows':True}],
            '1': [{'status':'identity'}],
        }),
    ):
        page = prepare_parallel_identity_page(browser, url, errors)
        page.evaluate("""behaviors => {
            window.__notesGetDocuments.behaviorByType = behaviors;
            window.__notesGetDocuments.completionOrder = [];
            if (behaviors['0']?.[0]?.status !== 'unavailable') {
                window.__notesGetDocuments.holdType = 0;
                window.__notesGetDocuments.holdNext = 1;
            }
        }""", behaviors)
        page.get_by_role('button', name='Back to folders').click()
        if case == 'unavailable-first':
            stale = page.locator('.notes-stale-banner')
            expect(stale).to_be_visible(timeout=5000)
            expect(stale).to_contain_text('Showing saved counts')
            expect(page.locator('.notes-folder-row[data-type="0"] .notes-folder-count')).to_have_text('1')
            expect(page.locator('.notes-folder-row[data-type="1"] .notes-folder-count')).to_have_text('1')
            page.wait_for_function('window.__notesGetDocuments.started === window.__notesGetDocuments.completed', timeout=5000)
        else:
            page.wait_for_function("""() => window.__notesGetDocuments.pending.length === 1
                && window.__notesGetDocuments.completionOrder.some(result => result.type === 1 && result.status === 'identity')""", timeout=5000)
            expect_identity_invalidated(page)
            held_order = page.evaluate('window.__notesGetDocuments.completionOrder.filter(result => result.type !== null)')
            assert held_order == [{'type':1,'status':'identity'}], held_order
            page.evaluate('window.__notesGetDocuments.releasePending()')
            page.wait_for_function('window.__notesGetDocuments.started === window.__notesGetDocuments.completed', timeout=5000)
        expect_identity_invalidated(page)
        order = page.evaluate('window.__notesGetDocuments.completionOrder.filter(result => result.type !== null)')
        print(f'{case} Notes folder response order: {order}; behaviors: {page.evaluate("window.__notesGetDocuments.behaviorLog.slice(-6)")}; outcomes: {page.evaluate("window.__notesGetDocuments.behaviorOutcomes")}')
        identity_position = next((index for index, result in enumerate(order) if result == {'type':1,'status':'identity'}), None)
        unavailable_position = next((index for index, result in enumerate(order) if result == {'type':0,'status':'unavailable'}), None)
        late_success_position = next((index for index, result in enumerate(order) if result == {'type':0,'status':'success'}), None)
        assert identity_position is not None and len(order) == 2, (case, order)
        if case == 'unavailable-first':
            assert unavailable_position < identity_position, (case, order)
        else:
            assert identity_position < late_success_position, (case, order)
        assert page.evaluate('window.__notesParallelApp.__identityInvalidations === 1'), case
        page.evaluate('window.__staleFolderRow.click()')
        expect_identity_invalidated(page)
        assert not errors, errors
        page.close()


def exercise_search_survives_list_rerender(browser, url, errors):
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(url, wait_until='domcontentloaded')
    page.wait_for_function('window.PeakDuo?.preview === true')
    page.evaluate("""async () => {
        const {NotesApp} = await import('/duo/notes-app.mjs?rev=owner-config-20261015');
        const render = NotesApp.prototype.render;
        NotesApp.prototype.render = function(...args) {
            window.__notesSearchTestApp = this;
            return render.apply(this, args);
        };
    }""")
    open_notes(page)
    wait_notes_idle(page)
    page.locator('.notes-folder-row[data-type="0"]').click()
    expect(page.get_by_role('button', name='Open note: Studio ideas')).to_be_visible(timeout=5000)
    wait_notes_idle(page)

    # Dispatch the search input and the layout toggle in one browser task so
    # the toggle rerenders the list before the 150 ms search debounce expires.
    page.evaluate("""() => {
        const input = document.querySelector('.notes-search input');
        input.value = 'reflector';
        input.dispatchEvent(new Event('input', {bubbles:true}));
        document.querySelector('button[aria-label="Show gallery view"]').click();
    }""")
    page.wait_for_function("""() => window.__notesSearchTestApp?.searchState?.query === 'reflector'
        && window.__notesSearchTestApp.searchState.done""", timeout=5000)
    expect(page.get_by_role('button', name='Show list view')).to_be_visible(timeout=5000)
    expect(page.locator('.notes-results-count')).to_have_text('1 match')
    expect(page.get_by_role('button', name='Open note: Studio ideas')).to_be_visible()
    page.wait_for_function("window.__notesSearchTestApp.searchSnippets.has('501')", timeout=5000)
    assert page.evaluate("window.__notesSearchTestApp.searchSnippets.get('501').toLowerCase().includes('reflector')"), 'the completed body match should have a populated visible excerpt'
    assert page.evaluate("window.__notesGetDocuments.requests.some(request => request.Event === 'Documents/GetNoteDetail')"), 'body search should inspect the saved note after the view toggle'
    assert not errors, errors
    page.close()


def exercise_obsolete_identity_scope(browser, url, errors):
    # A delayed old-character denial and a delayed old-character success may
    # settle after PlayerData changes, the old app is closed, and a new Notes
    # instance has loaded. Neither response may invalidate or repopulate it.
    page = prepare_parallel_identity_page(browser, url, errors)
    page.evaluate("""() => {
        window.__notesGetDocuments.behaviorByType = {
            '0': [{responseDelayMs:2500, allowOldRows:true}],
            '1': [{status:'identity', delayMs:2200}],
        };
        window.__staleFolderRow = document.querySelector('.notes-folder-row[data-type="0"]');
    }""")
    page.get_by_role('button', name='Back to folders').click()
    page.wait_for_function("""() => window.__notesGetDocuments.delayed.some(item => item.type === 1 && item.kind === 'status')
        && window.__notesGetDocuments.delayed.some(item => item.type === 0 && item.kind === 'response')""", timeout=5000)
    page.evaluate("""async () => {
        window.__oldScopeNotesApp = window.__notesParallelApp;
        const {previewOpen} = window.PeakDuo.previewAdapter;
        const data = previewOpen();
        data.PlayerData = {...data.PlayerData, Cid:'NEXT'};
        window.__notesGetDocuments.serverCid = 'NEXT';
        await PeakDuo.sendPreview(data);
    }""")
    page.wait_for_function("window.__oldScopeNotesApp.alive === false && window.__notesGetDocuments.serverCid === 'NEXT'", timeout=5000)
    assert page.evaluate('window.__oldScopeNotesApp.__identityInvalidations || 0') == 0, 'PlayerData change establishes a new scope without a stale read invalidation'
    page.evaluate("PeakDuo.openApp('documents')")
    page.wait_for_function("window.__notesParallelApp !== window.__oldScopeNotesApp && window.__notesParallelApp.cid === 'NEXT' && window.__notesParallelApp.hasVerifiedFolders()", timeout=5000)
    expect(page.locator('.duo-app-instance[data-app="documents"]')).to_have_count(1)
    next_app_id = page.evaluate('window.__notesParallelApp.__notesProbeId')
    expect(page.locator('.notes-folder-row[data-type]')).to_have_count(6)
    expect(page.locator('.notes-folder-count').first).to_have_text('0')
    page.wait_for_function('window.__notesGetDocuments.started === window.__notesGetDocuments.completed', timeout=5000)
    assert page.evaluate('window.__oldScopeNotesApp.__identityInvalidations || 0') == 0, 'late denial from destroyed app cannot invalidate a newer instance'
    assert page.evaluate('window.__notesParallelApp.__notesProbeId') == next_app_id
    assert page.evaluate('window.__notesParallelApp.identityInvalid === false')
    expect(page.locator('.notes-state-identity')).to_have_count(0)
    expect(page.locator('.notes-folder-row[data-type]')).to_have_count(6)
    expect(page.locator('.notes-folder-count').first).to_have_text('0')
    assert not errors, errors
    page.close()


def exercise_scale_catalog_and_search(browser, url, errors):
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(notes_fixture_url(url, 'scale'), wait_until='domcontentloaded')
    page.wait_for_function('window.PeakDuo?.preview === true')
    page.evaluate("""async () => {
        const {NotesApp} = await import('/duo/notes-app.mjs?rev=owner-config-20261015');
        const render = NotesApp.prototype.render;
        NotesApp.prototype.render = function(...args) {
            window.__notesScaleApp = this;
            return render.apply(this, args);
        };
    }""")
    open_notes(page)
    wait_notes_idle(page, timeout=10000)

    initial = page.evaluate("""() => ({reads:window.__notesGetDocuments.requests, shapes:window.__notesGetDocuments.responseShapes,
        metadataBytes:window.__notesGetDocuments.metadataBytes, detailReads:window.__notesGetDocuments.detailBytes})""")
    catalog_memory = page.evaluate("""() => {
        const notes = window.__notesScaleApp.allNotes();
        return {count:notes.length, metadataOnly:notes.every(note => note.detailLoaded === false
            && !Object.hasOwn(note,'content') && !Object.hasOwn(note,'signatures') && !Object.hasOwn(note,'sharees'))};
    }""")
    assert catalog_memory == {'count':500, 'metadataOnly':True}, catalog_memory
    assert len([request for request in initial['reads'] if request['Event'] == 'Documents/GetNotesMetadataPage']) == 10, initial
    assert initial['metadataBytes'] < 150_000, initial['metadataBytes']
    assert initial['detailReads'] == 0, initial
    assert all(not shape['hasDocumentBody'] for shape in initial['shapes']
        if shape['event'] in {'Documents/GetNotesSummary','Documents/GetNotesMetadataPage'}), initial['shapes']
    legacy_catalog_bytes = page.evaluate("""async () => {
        const responses = await Promise.all([0,5].map(Type =>
            window.PeakPhoneTransport('Documents/GetDocuments', {Type, StatusEnvelope:true})));
        return responses.reduce((total, response) => total + new TextEncoder().encode(JSON.stringify(response)).length, 0);
    }""")
    expect(page.locator('.notes-folder-row[data-type="0"] .notes-folder-count')).to_have_text('250')
    expect(page.locator('.notes-folder-row[data-type="5"] .notes-folder-count')).to_have_text('250')

    page.locator('.notes-folder-row[data-type="0"]').click()
    expect(page.get_by_role('button', name='Open note: Scale note 250')).to_be_visible(timeout=10000)
    expect(page.locator('.notes-results-count')).to_have_text('Showing 100 of 250 notes')
    expect(page.locator('.notes-note-row')).to_have_count(100)
    page.wait_for_function("""() => window.__notesGetDocuments.started === window.__notesGetDocuments.completed
        && window.__notesGetDocuments.detailBytes > 0""", timeout=10000)
    page.wait_for_function("window.__notesScaleApp.excerptPending.size === 0", timeout=10000)
    assert page.evaluate('window.__notesGetDocuments.maxDetailActive <= 2'), 'visible excerpt hydration exceeded two concurrent full-detail reads'

    # The sole Unicode phrase belongs to row 001, which is beyond the first
    # displayed page. Script text in its HTML body must not count as visible text.
    search = page.get_by_role('searchbox', name='Search Notes')
    page.evaluate("""() => { window.__notesGetDocuments.behaviorByType = {null:[{responseDelayMs:250}]}; }""")
    search.fill('hidden-body-token')
    page.wait_for_function("""() => window.__notesScaleApp.searchState?.query === 'hidden-body-token'
        && window.__notesGetDocuments.delayed.some(item => item.event === 'Documents/GetNoteDetail' && item.kind === 'response')""", timeout=5000)
    search.fill('café 世界')
    page.wait_for_function("""() => {
        const progress = document.querySelector('.notes-search-status')?.textContent.match(/Searching note contents: (\\d+) of/);
        return progress && Number(progress[1]) >= 8;
    }""", timeout=10000)

    # The phone keeps parked apps mounted. Pause full-body reads while Notes is
    # hidden, allow only already-dispatched reads to settle, then require an
    # explicit resume when the user returns.
    page.evaluate("PeakDuo.openApp('contacts')")
    expect(page.locator('.duo-app-instance[data-app="contacts"]')).to_be_visible(timeout=5000)
    page.wait_for_function("""() => window.__notesGetDocuments.started === window.__notesGetDocuments.completed
        && document.querySelector('.duo-app-instance[data-app="documents"]')?.hidden === true""", timeout=10000)
    parked_reads = page.evaluate("window.__notesGetDocuments.requests.length")
    page.wait_for_timeout(500)
    assert page.evaluate('window.__notesGetDocuments.requests.length') == parked_reads, 'Notes continued dispatching body reads while parked'
    page.evaluate("PeakDuo.openApp('documents')")
    expect(page.get_by_role('button', name='Resume search')).to_be_visible(timeout=5000)
    expect(page.locator('.notes-search-status')).to_contain_text('Search paused while Notes is in the background')
    page.get_by_role('button', name='Resume search').click()
    page.wait_for_function("""() => window.__notesGetDocuments.started === window.__notesGetDocuments.completed
        && window.__notesScaleApp.searchState?.query === 'café 世界' && window.__notesScaleApp.searchState.done""", timeout=90000)
    page.wait_for_function("""() => window.__notesGetDocuments.started === window.__notesGetDocuments.completed
        && window.__notesScaleApp.searchSnippets.has('1001')""", timeout=10000)
    expect(page.locator('.notes-results-count')).to_have_text('1 match', timeout=5000)
    expect(page.locator('.notes-note-row')).to_have_count(1)
    expect(page.get_by_role('button', name='Open note: Scale note 001')).to_be_visible()
    assert page.evaluate("""() => window.__notesGetDocuments.maxDetailActive <= 2
        && window.__notesScaleApp.searchSnippets.has('1001')
        && !window.__notesScaleApp.searchSnippets.get('1001').includes('hidden-body-token')
        && !document.querySelector('.nx-notes')?.textContent.includes('hidden-body-token')"""), 'sanitized cross-page body search or compact excerpt retention failed'
    scan = page.evaluate("""() => ({detailReads:window.__notesGetDocuments.detailBytes,
        requestCount:window.__notesGetDocuments.requests.filter(request=>request.Event==='Documents/GetNoteDetail').length,
        requestTimes:window.__notesGetDocuments.requestTimes, shapes:window.__notesGetDocuments.responseShapes,
        snippet:Array.from(window.__notesScaleApp.searchSnippets.get('1001') || '').length,
        searchSnippetCount:window.__notesScaleApp.searchSnippets.size, excerptCount:window.__notesScaleApp.excerpts.size,
        metadataOnly:window.__notesScaleApp.allNotes().every(note => note.detailLoaded === false
            && !Object.hasOwn(note,'content') && !Object.hasOwn(note,'signatures') && !Object.hasOwn(note,'sharees'))})""")
    assert scan['detailReads'] > 900_000, scan['detailReads']
    assert scan['requestCount'] >= 250, scan['requestCount']
    assert scan['snippet'] <= 240 and scan['searchSnippetCount'] <= 10 and scan['excerptCount'] <= 10, scan
    assert scan['metadataOnly'], scan
    intervals = [later - earlier for earlier, later in zip(scan['requestTimes'], scan['requestTimes'][1:])]
    assert min(intervals) >= 100, min(intervals)
    print(f"Notes scale payloads: legacy full catalog={legacy_catalog_bytes} bytes; summary plus metadata={initial['metadataBytes']} bytes; full-detail body search={scan['detailReads']} bytes across {scan['requestCount']} detail reads; min read-start interval={min(intervals):.1f} ms; max concurrent detail reads={page.evaluate('window.__notesGetDocuments.maxDetailActive')}.")

    page.evaluate("""() => { window.__notesGetDocuments.behaviorByType = {null:[{status:'denied'}]}; }""")
    page.get_by_role('button', name='Open note: Scale note 001').click()
    expect(page.locator('.notes-detail-state')).to_contain_text('permission', timeout=5000)
    expect(page.get_by_label('Note title')).to_have_count(0)
    expect(page.get_by_label('Note content')).to_have_count(0)
    expect(page.get_by_role('button', name='Edit note')).to_have_count(0)
    expect(page.get_by_role('button', name='Save changes')).to_have_count(0)
    expect(page.get_by_role('button', name='Share note')).to_have_count(0)
    page.evaluate("""() => { window.__notesGetDocuments.holdType = null; window.__notesGetDocuments.holdNext = 1; }""")
    page.get_by_role('button', name='Retry loading note').click()
    page.wait_for_function('window.__notesGetDocuments.pending.length === 1', timeout=5000)
    expect(page.locator('.notes-detail-state')).to_contain_text('Loading note…')
    expect(page.get_by_label('Note title')).to_have_count(0)
    expect(page.get_by_role('button', name='Edit note')).to_have_count(0)
    page.evaluate('window.__notesGetDocuments.releasePending()')
    expect(page.get_by_role('button', name='Edit note')).to_be_visible(timeout=5000)
    print(f"500-row Notes preview: initial catalog={initial['metadataBytes']} bytes, body scan={scan['detailReads']} bytes, detail concurrency<=2")
    assert not errors, errors
    page.close()
def settled_pane_hit(page, selector):
    return page.evaluate("""selector => new Promise((resolve, reject) => {
        let priorNode = null, priorRect = null, stableFrames = 0, lastSample = null;
        const timeout = setTimeout(() => reject(new Error(`pane target did not settle within 3 seconds: ${JSON.stringify(lastSample)}`)), 3000);
        const sample = () => {
            const root = document.querySelector('.nx-notes');
            const row = root?.querySelector(selector);
            if (!root || !row?.isConnected) {
                stableFrames = 0; priorNode = null; priorRect = null;
                requestAnimationFrame(sample); return;
            }
            const rect = row.getBoundingClientRect();
            const nextRect = {x: rect.x, y: rect.y, width: rect.width, height: rect.height};
            const unchanged = priorNode === row && priorRect
                && Object.keys(nextRect).every(key => Math.abs(nextRect[key] - priorRect[key]) < 0.25);
            const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
            const hit = document.elementFromPoint(x, y);
            const rowHit = hit === row || row.contains(hit);
            const hitRect = hit?.getBoundingClientRect();
            lastSample = {row: nextRect, center: {x, y}, rowHit,
                hit: hit && {tag: hit.tagName, id: hit.id, classes: [...hit.classList], aria: hit.getAttribute('aria-label'),
                    rect: hitRect && {x: hitRect.x, y: hitRect.y, width: hitRect.width, height: hitRect.height}},
                scroll: root.querySelector('.notes-scroll')?.scrollTop,
                scrollRect: (() => { const r=root.querySelector('.notes-scroll')?.getBoundingClientRect(); return r && {x:r.x,y:r.y,width:r.width,height:r.height}; })()};
            stableFrames = unchanged ? stableFrames + 1 : 0;
            priorNode = row; priorRect = nextRect;
            if (stableFrames >= 3) {
                clearTimeout(timeout);
                const host = root.parentElement.getBoundingClientRect();
                resolve({row: nextRect, center: {x, y}, host: {x: host.x, y: host.y, width: host.width, height: host.height}, rowHit});
                return;
            }
            requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
    })""", selector)


def run():
    check_notes_fixture_url_builder()
    errors = []
    with sync_playwright() as playwright:
        launch = {'headless': True}
        if os.environ.get('CHROMIUM_PATH'):
            launch['executable_path'] = os.environ['CHROMIUM_PATH']
        browser = playwright.chromium.launch(**launch)
        exercise_identity_invalidation(browser, URL, errors)
        exercise_parallel_folder_identity(browser, URL, errors)
        exercise_obsolete_identity_scope(browser, URL, errors)
        exercise_search_survives_list_rerender(browser, URL, errors)
        exercise_scale_catalog_and_search(browser, URL, errors)
        page = browser.new_page(viewport={'width': 1440, 'height': 1000})
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(URL, wait_until='domcontentloaded')
        page.wait_for_function('window.PeakDuo?.preview === true')

        open_notes(page)
        wait_notes_idle(page)
        assert page.evaluate("window.__notesGetDocuments.requests.every(request => request.ExpectedCid === 'PREVIEW' && request.Event.startsWith('Documents/GetNotes'))"), 'all catalog reads must bind to the active character and use the Notes read endpoints'
        screenshot_out = Path(os.environ.get('NOTES_READ_FAILURE_OUT', Path(tempfile.gettempdir()) / 'notes-read-failure-20261010'))
        screenshot_out.mkdir(parents=True, exist_ok=True)

        # A tall host can still contain a very short folded phone pane. Verify
        # the folder footer stays in flow and cannot cover the first folder row.
        page.set_viewport_size({'width': 390, 'height': 844})
        page.evaluate('PeakDuo.setPhoneSetting("layout", "full")')
        page.wait_for_function('PeakDuo.getState().workspace.layout === "full"')
        # A layout reactivation can start a folder read; wait for current reads
        # because the resulting render replaces folder rows.
        wait_notes_idle(page)
        for theme in ('light', 'dark'):
            page.evaluate('(theme) => PeakDuo.setPhoneSetting("appearance", theme)', theme)
            page.wait_for_function('(theme) => document.querySelector("#duo").dataset.theme === theme', arg=theme)
            wait_notes_idle(page)
            # Scroll the first folder row just clear of the normal-flow dock.
            # Avoid Playwright's multi-ancestor auto-scroll while rows rerender.
            page.evaluate("""() => {
                const scroll=document.querySelector('.nx-notes .notes-scroll');
                const row=document.querySelector('.nx-notes .notes-folder-row[data-type="0"]');
                const clip=scroll.getBoundingClientRect(), bounds=row.getBoundingClientRect();
                scroll.scrollTop += Math.max(0,bounds.bottom-clip.bottom+2);
            }""")
            row_target = settled_pane_hit(page, '.notes-folder-row[data-type="0"]')
            pane_geometry = page.evaluate("""() => {
                const root=document.querySelector('.nx-notes'), host=root.parentElement;
                const rect=el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom}};
                const row=root.querySelector('.notes-folder-row[data-type=\"0\"]');
                const dock=root.querySelector('.notes-dock'), scroll=root.querySelector('.notes-scroll');
                const hostBounds=rect(host), rowBounds=rect(row);
                const hit=document.elementFromPoint(rowBounds.x+rowBounds.width/2,rowBounds.y+rowBounds.height/2);
                return {theme:document.querySelector('#duo').dataset.theme,host:hostBounds,viewport:{width:innerWidth,height:innerHeight},
                    hostPaddingTop:parseFloat(getComputedStyle(root).paddingTop),
                    hostPaddingBottom:parseFloat(getComputedStyle(root).paddingBottom),containerType:getComputedStyle(host).containerType,
                    view:root.dataset.notesView,dockPosition:getComputedStyle(dock).position,
                    rowHeight:rect(row).height,searchHeight:parseFloat(getComputedStyle(root.querySelector('.notes-search')).height),
                    composeHeight:parseFloat(getComputedStyle(root.querySelector('.notes-compose')).height),
                    createFolderHeight:parseFloat(getComputedStyle(root.querySelector('.notes-new-folder')).height),
                    dock:rect(dock),scroll:rect(scroll),rowHit:hit===row||row.contains(hit)};
            }""")
            assert pane_geometry['host']['height'] < 300 and pane_geometry['viewport']['height'] == 844, pane_geometry
            assert pane_geometry['containerType'] == 'size', pane_geometry
            assert 24 <= pane_geometry['hostPaddingTop'] < 32 and 8 <= pane_geometry['hostPaddingBottom'] < 18, pane_geometry
            assert pane_geometry['dockPosition'] == 'relative' and pane_geometry['rowHeight'] >= 44, pane_geometry
            assert min(pane_geometry['searchHeight'], pane_geometry['composeHeight'], pane_geometry['createFolderHeight']) >= 44, pane_geometry
            # Wait for three stable animation frames and assert the live center hit.
            assert row_target['rowHit'], (theme, pane_geometry, row_target)
            assert row_target['host']['height'] < 300, (theme, row_target)
            list_load_cursor = page.evaluate('window.__notesGetDocuments.requests.length')
            page.mouse.click(row_target['center']['x'], row_target['center']['y'])
            expect(page.locator('.nx-notes')).to_have_attribute('data-notes-view', 'list', timeout=5000)
            page.wait_for_function("""cursor => {
                const reads = window.__notesGetDocuments;
                const requests = reads.requests.slice(cursor);
                return window.__notesApp?.view === 'list'
                    && window.__notesApp?.loading === false
                    && reads.started === reads.completed
                    && requests.some(request => request.Event === 'Documents/GetNotesSummary')
                    && requests.some(request => request.Event === 'Documents/GetNotesMetadataPage' && Number(request.Type) === 0);
            }""", arg=list_load_cursor, timeout=5000)
            if theme == 'light':
                # The narrow stale state must preserve cached data and enough
                # scroll range for the last row to clear the normal-flow dock.
                expect(page.get_by_role('button', name='Open note: Studio ideas')).to_be_visible(timeout=5000)
                page.evaluate('window.__notesGetDocuments.failNext = 1')
                page.get_by_role('button', name='Refresh Notes').click()
                stale = page.locator('.notes-stale-banner')
                expect(stale).to_be_visible(timeout=5000)
                expect(stale).to_contain_text('Storage unavailable. Saved notes may be out of date.')
                page.locator('.nx-notes').screenshot(path=str(screenshot_out / 'notes-narrow-stale-top.png'))
                # Scroll the 44px retry control into the short pane and click its
                # settled center, then fail once more to check cached-row access.
                stale_retry = stale.get_by_role('button', name='Try again')
                stale_retry.scroll_into_view_if_needed()
                retry_target = settled_pane_hit(page, '.notes-stale-retry')
                retry_bounds = stale_retry.bounding_box()
                assert retry_target['rowHit'], retry_target
                assert retry_bounds and retry_bounds['width'] >= 44 and retry_bounds['height'] >= 44, retry_bounds
                page.mouse.click(retry_target['center']['x'], retry_target['center']['y'])
                wait_notes_idle(page)
                expect(stale).to_have_count(0, timeout=5000)
                expect(page.get_by_role('button', name='Open note: Studio ideas')).to_be_visible(timeout=5000)
                page.evaluate('window.__notesGetDocuments.failNext = 1')
                page.get_by_role('button', name='Refresh Notes').click()
                stale = page.locator('.notes-stale-banner')
                expect(stale).to_be_visible(timeout=5000)
                scroll = page.locator('.notes-scroll')
                scroll_bounds = scroll.bounding_box()
                assert scroll_bounds, 'the compact Notes list has no scroll viewport'
                page.mouse.move(scroll_bounds['x'] + scroll_bounds['width'] / 2,
                                scroll_bounds['y'] + scroll_bounds['height'] / 2)
                page.mouse.wheel(0, 10000)
                page.wait_for_function("""() => {
                    const scroll = document.querySelector('.notes-scroll');
                    return scroll && scroll.scrollTop >= scroll.scrollHeight - scroll.clientHeight - 1;
                }""", timeout=5000)
                row_target = settled_pane_hit(page, '.notes-note-row[aria-label="Open note: Studio ideas"]')
                row_geometry = page.evaluate("""() => {
                    const root=document.querySelector('.nx-notes'), host=root.parentElement.getBoundingClientRect();
                    const scroll=root.querySelector('.notes-scroll'), clip=scroll.getBoundingClientRect();
                    const dock=root.querySelector('.notes-dock').getBoundingClientRect();
                    const row=root.querySelector('.notes-note-row[aria-label="Open note: Studio ideas"]');
                    const title=row?.querySelector('.notes-note-top strong');
                    const r=row.getBoundingClientRect(), x=r.x+r.width/2, y=r.y+r.height/2;
                    const hit=document.elementFromPoint(x,y);
                    const t=title.getBoundingClientRect();
                    return {scrollTop:scroll.scrollTop,maxScroll:scroll.scrollHeight-scroll.clientHeight,
                        row:{x:r.x,y:r.y,width:r.width,height:r.height},
                        title:{x:t.x,y:t.y,width:t.width,height:t.height,bottom:t.bottom,right:t.right},
                        titleFullyVisible:t.top>=Math.max(clip.top,host.top)-0.5
                            && t.bottom<=Math.min(clip.bottom,dock.top,host.bottom)+0.5
                            && t.left>=Math.max(clip.left,host.left)-0.5
                            && t.right<=Math.min(clip.right,host.right)+0.5,
                        visibleWidth:Math.max(0,Math.min(r.right,clip.right,host.right)-Math.max(r.left,clip.left,host.left)),
                        visibleHeight:Math.max(0,Math.min(r.bottom,clip.bottom,dock.top,host.bottom)-Math.max(r.top,clip.top,host.top)),
                        rowHit:hit===row||row.contains(hit),view:root.dataset.notesView};
                }""")
                assert row_geometry['scrollTop'] >= row_geometry['maxScroll'] - 1, row_geometry
                assert row_target['rowHit'] and row_geometry['rowHit'], (row_target, row_geometry)
                assert row_geometry['visibleWidth'] >= 44 and row_geometry['visibleHeight'] >= 44, row_geometry
                assert row_geometry['row']['height'] >= 44, row_geometry
                assert row_geometry['titleFullyVisible'], row_geometry
                expect(stale).to_have_count(1)
                page.mouse.click(row_target['center']['x'], row_target['center']['y'])
                expect(page.locator('.nx-notes')).to_have_attribute('data-notes-view', 'editor', timeout=5000)
                expect(page.locator('.notes-stale-banner')).to_have_count(0)
            page.locator('.notes-back-button').click()
            expect(page.locator('.nx-notes')).to_have_attribute('data-notes-view', 'folders', timeout=5000)

        # Exercise the short-pane edit controls at neighboring/fractional host
        # widths. All four header actions stay 44px targets in one scrollable row.
        def narrow_header_target(selector, scroll_end=False):
            page.evaluate("""({selector, scrollEnd}) => {
                const root=document.querySelector('.nx-notes'), target=root.querySelector(selector);
                const line=target.closest('.notes-header-line');
                line.scrollLeft=scrollEnd ? line.scrollWidth : 0;
            }""", {'selector': selector, 'scrollEnd': scroll_end})
            target = settled_pane_hit(page, selector)
            geometry = page.evaluate("""selector => {
                const root=document.querySelector('.nx-notes'), host=root.parentElement.getBoundingClientRect();
                const target=root.querySelector(selector), line=target.closest('.notes-header-line');
                const r=target.getBoundingClientRect(), x=r.x+r.width/2, y=r.y+r.height/2;
                const hit=document.elementFromPoint(x,y);
                return {target:{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom},
                    host:{x:host.x,y:host.y,right:host.right,bottom:host.bottom},
                    fullyInside:r.left>=host.left-0.5&&r.right<=host.right+0.5&&r.top>=host.top-0.5&&r.bottom<=host.bottom+0.5,
                    centerInside:x>=host.left&&x<=host.right&&y>=host.top&&y<=host.bottom,
                    hit:hit===target||target.contains(hit),scroll:{left:line.scrollLeft,max:line.scrollWidth-line.clientWidth}};
            }""", selector)
            assert target['rowHit'] and geometry['hit'], (selector, target, geometry)
            assert geometry['target']['width'] >= 44 and geometry['target']['height'] >= 44, geometry
            assert geometry['fullyInside'] and geometry['centerInside'], geometry
            return target

        # Use the actual preview, not only browser geometry, for Back, Share and
        # More, including the existing action sheets with no side-effect action.
        for theme in ('light', 'dark'):
            page.evaluate('(theme) => PeakDuo.setPhoneSetting("appearance", theme)', theme)
            page.wait_for_function('(theme) => document.querySelector("#duo").dataset.theme === theme', arg=theme)
            for width in (389, 390, 391):
                page.set_viewport_size({'width': width, 'height': 844})
                page.locator('.notes-folder-row[data-type="0"]').click()
                page.get_by_role('button', name='Open note: Studio ideas').click()
                expect(page.get_by_role('button', name='Edit note')).to_be_visible(timeout=5000)
                page.get_by_role('button', name='Edit note').click()
                expect(page.get_by_label('Note content')).to_be_editable(timeout=5000)
                page.wait_for_function("document.querySelector('.notes-save-top')?.hidden === true", timeout=5000)
                writing_viewport = page.evaluate("""() => {
                    const root=document.querySelector('.nx-notes'), host=root.parentElement.getBoundingClientRect();
                    const paper=root.querySelector('.notes-paper').getBoundingClientRect();
                    const editor=root.querySelector('.notes-rich-editor').getBoundingClientRect();
                    const dock=root.querySelector('.notes-editor-dock').getBoundingClientRect();
                    return Math.max(0,Math.min(editor.bottom,dock.top,paper.bottom,host.bottom)-Math.max(editor.top,paper.top,host.top));
                }""")
                assert writing_viewport >= 44, (theme, width, writing_viewport)
                header_metrics = page.evaluate("""() => {
                    const root=document.querySelector('.nx-notes'),host=root.parentElement.getBoundingClientRect();
                    const line=root.querySelector('.notes-header-line');
                    return {pane:{x:host.x,width:host.width,right:host.right},
                        header:{width:line.clientWidth,scrollWidth:line.scrollWidth,maxScroll:line.scrollWidth-line.clientWidth,
                            height:line.getBoundingClientRect().height},width:innerWidth};
                }""")
                assert header_metrics['header']['height'] == 44, (theme, header_metrics)
                if width == 390:
                    page.wait_for_function("!document.body.innerText.includes('Test-only save failure')", timeout=5000)
                    page.screenshot(path=str(screenshot_out / f'notes-editor-{theme}-saved.png'))

                # Share and More open their existing sheets; use only Cancel so
                # this browser regression never sends a share or mutates a note.
                share_target = narrow_header_target('.notes-share-top')
                page.mouse.click(share_target['center']['x'], share_target['center']['y'])
                share_sheet = page.locator('.notes-actions-sheet')
                expect(share_sheet).to_be_visible(timeout=5000)
                page.get_by_role('button', name='Cancel').click()
                expect(share_sheet).to_have_count(0)

                more_target = narrow_header_target('.notes-more-top', scroll_end=True)
                assert page.evaluate("""() => {
                    const root=document.querySelector('.nx-notes'), line=root.querySelector('.notes-header-line');
                    return line.scrollLeft >= line.scrollWidth-line.clientWidth-0.5;
                }"""), 'More must be reachable at the horizontal end of the header'
                page.mouse.click(more_target['center']['x'], more_target['center']['y'])
                more_sheet = page.locator('.notes-actions-sheet')
                expect(more_sheet).to_be_visible(timeout=5000)
                page.get_by_role('button', name='Cancel').click()
                expect(more_sheet).to_have_count(0)

                # The short formatting rail keeps 44px targets and supports a
                # real pointer click after horizontal scrolling.
                page.locator('.notes-format-tools').evaluate('(el) => { el.scrollLeft = el.scrollWidth; }')
                format_target = settled_pane_hit(page, '.notes-format-more')
                format_bounds = page.locator('.notes-format-more').bounding_box()
                assert format_target['rowHit'] and format_bounds and format_bounds['width'] >= 44 and format_bounds['height'] >= 44, format_bounds
                format_hit = page.evaluate("""() => {
                    const root=document.querySelector('.nx-notes'), host=root.parentElement.getBoundingClientRect();
                    const target=root.querySelector('.notes-format-more'), r=target.getBoundingClientRect();
                    const x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y);
                    return {inside:x>=host.left&&x<=host.right&&y>=host.top&&y<=host.bottom,hit:hit===target||target.contains(hit),x,y};
                }""")
                assert format_hit['inside'] and format_hit['hit'], format_hit
                page.mouse.click(format_target['center']['x'], format_target['center']['y'])
                formatting_sheet = page.locator('.notes-actions-sheet')
                expect(formatting_sheet).to_be_visible(timeout=5000)
                expect(formatting_sheet).to_contain_text('Bold')
                page.get_by_role('button', name='Cancel').click()
                expect(formatting_sheet).to_have_count(0)

                # Keyboard Tab reaches every horizontally clipped rail action;
                # Enter opens the same Text formatting sheet.
                page.locator('.notes-rich-editor [role="checkbox"]').last.focus()
                focused = []
                for _ in range(5):
                    page.keyboard.press('Tab')
                    focused.append(page.evaluate('document.activeElement?.getAttribute("aria-label")'))
                assert focused == ['Undo', 'Checklist', 'Insert table', 'Text formatting', 'Redo'], focused
                page.keyboard.press('Shift+Tab')
                assert page.evaluate('document.activeElement?.getAttribute("aria-label")') == 'Text formatting'
                page.keyboard.press('Enter')
                formatting_sheet = page.locator('.notes-actions-sheet')
                expect(formatting_sheet).to_be_visible(timeout=5000)
                page.get_by_role('button', name='Cancel').click()

                # Back is a real 44px click target and exits the editor.
                back_target = narrow_header_target('.notes-back-button')
                page.mouse.click(back_target['center']['x'], back_target['center']['y'])
                expect(page.locator('.nx-notes')).to_have_attribute('data-notes-view', 'folders', timeout=5000)
                page.locator('.notes-folder-row[data-type="0"]').click()
                page.get_by_role('button', name='Open note: Studio ideas').click()
                page.get_by_role('button', name='Edit note').click()
                expect(page.get_by_label('Note content')).to_be_editable(timeout=5000)

                # The dirty Save remains named for assistive tech, becomes busy
                # and disabled while pending, survives failure, then succeeds.
                save_title = f'Draft {width}'
                title_input = page.get_by_label('Note title')
                title_input.fill(save_title)
                expect(page.locator('.notes-editor-meta > span')).to_have_text('Unsaved changes')
                save_button = page.get_by_role('button', name='Save changes')
                expect(save_button).to_be_enabled()
                assert save_button.get_attribute('aria-label') == 'Save changes', save_button.get_attribute('aria-label')
                dirty_header = page.evaluate("""() => {
                    const line=document.querySelector('.nx-notes .notes-header-line');
                    return {client:line.clientWidth,scrollWidth:line.scrollWidth,maxScroll:line.scrollWidth-line.clientWidth};
                }""")
                assert dirty_header['maxScroll'] > 0, (theme, width, dirty_header)
                page.locator('.notes-header-line').evaluate('(el) => { el.scrollLeft = 0; }')
                save_target = narrow_header_target('.notes-save-top')
                if width == 390:
                    page.wait_for_function("!document.body.innerText.includes('Test-only save failure')", timeout=5000)
                    page.screenshot(path=str(screenshot_out / f'notes-editor-{theme}-dirty.png'))
                failed_count = page.evaluate('window.__notesSaveResponses.length')
                page.evaluate('window.__notesSaveControl.failNext = 1')
                page.mouse.click(save_target['center']['x'], save_target['center']['y'])
                expect(save_button).to_be_disabled(timeout=1000)
                expect(save_button).to_have_attribute('aria-busy', 'true', timeout=1000)
                page.wait_for_function('count => window.__notesSaveResponses.length > count', arg=failed_count, timeout=5000)
                expect(save_button).to_be_enabled(timeout=5000)
                assert save_button.get_attribute('aria-busy') is None
                expect(title_input).to_have_value(save_title)
                expect(page.locator('.notes-editor-meta > span')).to_have_text('Unsaved changes')

                save_target = narrow_header_target('.notes-save-top')
                page.mouse.click(save_target['center']['x'], save_target['center']['y'])
                page.wait_for_function("!document.querySelector('.notes-save-top[aria-busy=\"true\"]')"
                    " && document.querySelector('.notes-editor-meta > span')?.textContent === 'Saved to Notes'", timeout=5000)
                page.get_by_role('button', name='Edit note').click()
                title_input = page.get_by_label('Note title')
                title_input.fill('Studio ideas')
                save_target = narrow_header_target('.notes-save-top')
                page.mouse.click(save_target['center']['x'], save_target['center']['y'])
                page.wait_for_function("!document.querySelector('.notes-save-top[aria-busy=\"true\"]')"
                    " && document.querySelector('.notes-editor-meta > span')?.textContent === 'Saved to Notes'", timeout=5000)
                expect(title_input).to_have_value('Studio ideas')
                # Re-select 390px after neighboring-width checks and verify the
                # original note and editor are left in their settled state.
                if width != 390:
                    page.set_viewport_size({'width': 390, 'height': 844})
                page.locator('.notes-back-button').click()
                expect(page.locator('.nx-notes')).to_have_attribute('data-notes-view', 'folders', timeout=5000)
        page.set_viewport_size({'width': 1440, 'height': 1000})
        page.evaluate('PeakDuo.setPhoneSetting("layout", "full")')

        # A failed same-character read keeps last verified Notes and category
        # counts visible in both iOS palettes, with a working explicit retry.
        def capture_read_failure(theme):
            page.evaluate('(theme) => PeakDuo.setPhoneSetting("appearance", theme)', theme)
            page.wait_for_function('(theme) => document.querySelector("#duo").dataset.theme === theme', arg=theme, timeout=5000)
            wait_notes_idle(page)
            notes_count = page.locator('.notes-folder-row[data-type="0"] .notes-folder-count')
            expect(notes_count).to_have_text('1')

            page.locator('.notes-folder-row[data-type="0"]').click()
            expect(page.get_by_role('button', name='Open note: Studio ideas')).to_be_visible(timeout=5000)
            wait_notes_idle(page)
            page.evaluate('window.__notesGetDocuments.failNext = 1')
            page.get_by_role('button', name='Refresh Notes').click()
            stale = page.locator('.notes-stale-banner')
            expect(stale).to_be_visible(timeout=5000)
            expect(stale).to_contain_text('Showing saved notes')
            expect(stale).to_contain_text('may be out of date')
            expect(page.get_by_role('button', name='Open note: Studio ideas')).to_be_visible()
            expect(page.locator('.notes-state-empty')).to_have_count(0)
            expect(page.locator('.nx-notes')).not_to_contain_text('SQL details')
            page.locator('.nx-notes').screenshot(path=str(screenshot_out / f'notes-list-{theme}-stale.png'))

            stale.get_by_role('button', name='Try again').click()
            wait_notes_idle(page)
            expect(page.locator('.notes-stale-banner')).to_have_count(0, timeout=5000)
            expect(page.get_by_role('button', name='Open note: Studio ideas')).to_be_visible()
            wait_notes_idle(page)
            page.locator('.nx-notes').screenshot(path=str(screenshot_out / f'notes-list-{theme}-recovered.png'))

            page.evaluate('window.__notesGetDocuments.failNext = 1')
            page.locator('.notes-back-button').click()
            stale = page.locator('.notes-stale-banner')
            expect(stale).to_be_visible(timeout=5000)
            expect(stale).to_contain_text('Showing saved counts')
            expect(stale).to_contain_text('may be out of date')
            expect(page.locator('.notes-folder-row[data-type="0"] .notes-folder-count')).to_have_text('1')
            expect(page.locator('.notes-folder-row[data-type="1"] .notes-folder-count')).to_have_text('1')
            expect(page.locator('.nx-notes')).not_to_contain_text('SQL details')
            wait_notes_idle(page)
            page.locator('.nx-notes').screenshot(path=str(screenshot_out / f'notes-folders-{theme}-stale.png'))

            folder_search = page.get_by_role('searchbox', name='Search folders')
            folder_search.fill('Notes')
            notes_folder = page.locator('.notes-folder-row[data-type="0"]')
            licenses_folder = page.locator('.notes-folder-row[data-type="1"]')
            expect(notes_folder).to_be_visible()
            expect(licenses_folder).to_be_hidden()
            wait_notes_idle(page)
            page.evaluate('window.__notesGetDocuments.failNext = 1')
            stale.get_by_role('button', name='Try again').click()
            wait_notes_idle(page)
            expect(page.locator('.notes-stale-banner')).to_be_visible(timeout=5000)
            expect(page.get_by_role('searchbox', name='Search folders')).to_have_value('Notes')
            expect(page.locator('.notes-folder-row[data-type="0"]')).to_be_visible()
            expect(page.locator('.notes-folder-row[data-type="1"]')).to_be_hidden()

            page.locator('.notes-stale-banner').get_by_role('button', name='Try again').click()
            wait_notes_idle(page)
            expect(page.locator('.notes-stale-banner')).to_have_count(0, timeout=5000)
            expect(page.locator('.notes-folder-row[data-type="0"] .notes-folder-count')).to_have_text('1')
            wait_notes_idle(page)
            page.locator('.nx-notes').screenshot(path=str(screenshot_out / f'notes-folders-{theme}-recovered.png'))

        capture_read_failure('light')
        capture_read_failure('dark')
        page.evaluate("PeakDuo.setPhoneSetting('appearance','light')")
        page.wait_for_function("document.querySelector('#duo').dataset.theme==='light'")
        wait_notes_idle(page)

        # Pagination and local filtering operate on verified cached rows while
        # an unavailable refresh stays visible with its retry action.
        page.locator('.notes-folder-row[data-type="0"]').click()
        expect(page.get_by_role('button', name='Open note: Studio ideas')).to_be_visible(timeout=5000)
        wait_notes_idle(page)
        page.evaluate("""() => {
            window.__notesGetDocuments.extraRows = Array.from({length: 125}, (_, index) => ({
                id: 600 + index, citizenid: 'PREVIEW', type: 0,
                title: index === 124 ? 'needle-only-proof' : `Paged note ${index + 1}`,
                content: '<p>Test-only cached Notes entry.</p>', signatures: [], sharees: [], finalized: 0,
            }));
        }""")
        page.get_by_role('button', name='Refresh Notes').click()
        expect(page.get_by_role('button', name='Load 26 more')).to_be_visible(timeout=5000)
        expect(page.locator('.notes-note-row')).to_have_count(100)
        wait_notes_idle(page)
        page.evaluate('window.__notesGetDocuments.failNext = 1')
        page.get_by_role('button', name='Refresh Notes').click()
        stale = page.locator('.notes-stale-banner')
        expect(stale).to_be_visible(timeout=5000)
        expect(page.get_by_role('button', name='Load 26 more')).to_be_visible()
        stale_retry = stale.get_by_role('button', name='Try again')
        expect(stale_retry).to_be_visible()
        stale_retry_bounds = stale_retry.bounding_box()
        assert stale_retry_bounds and stale_retry_bounds['width'] >= 44 and stale_retry_bounds['height'] >= 44, f'stale retry target is below 44x44 CSS px: {stale_retry_bounds}'
        page.get_by_role('button', name='Load 26 more').click()
        expect(stale).to_be_visible()
        expect(stale.get_by_role('button', name='Try again')).to_be_visible()
        expect(page.locator('.notes-note-row')).to_have_count(126)
        expect(page.get_by_role('button', name='Open note: needle-only-proof')).to_be_visible()
        page.locator('.nx-notes').screenshot(path=str(screenshot_out / 'notes-list-light-stale-paginated.png'))

        page.get_by_role('searchbox', name='Search Notes').fill('needle-only-proof')
        expect(page.locator('.notes-results-count')).to_have_text('1 match', timeout=5000)
        expect(page.locator('.notes-note-row')).to_have_count(1)
        expect(page.get_by_role('button', name='Open note: needle-only-proof')).to_be_visible()
        expect(stale).to_be_visible()
        expect(stale.get_by_role('button', name='Try again')).to_be_visible()
        page.locator('.nx-notes').screenshot(path=str(screenshot_out / 'notes-list-light-stale-search.png'))

        page.evaluate('window.__notesGetDocuments.extraRows = []')
        stale.get_by_role('button', name='Try again').click()
        expect(page.locator('.notes-stale-banner')).to_have_count(0, timeout=5000)
        expect(page.get_by_role('button', name='Open note: Studio ideas')).to_be_visible()
        page.locator('.notes-back-button').click()
        expect(page.locator('.notes-folder-row[data-type="0"] .notes-folder-count')).to_have_text('1', timeout=5000)

        # A first-read failure has no previously verified counts to display.
        initial_error = browser.new_page(viewport={'width': 1440, 'height': 1000})
        initial_error.on('pageerror', lambda error: errors.append(str(error)))
        error_url = notes_fixture_url(URL, 'error')
        initial_error.goto(error_url, wait_until='domcontentloaded')
        initial_error.wait_for_function('window.PeakDuo?.preview === true')
        initial_error.evaluate("PeakDuo.openApp('documents')")
        expect(initial_error.locator('.nx-notes')).to_be_visible(timeout=5000)
        expect(initial_error.locator('.notes-state-error')).to_be_visible(timeout=5000)
        initial_retry = initial_error.locator('.notes-state-error .notes-retry')
        expect(initial_retry).to_be_visible()
        initial_retry_bounds = initial_retry.bounding_box()
        assert initial_retry_bounds and initial_retry_bounds['width'] >= 44 and initial_retry_bounds['height'] >= 44, f'initial retry target is below 44x44 CSS px: {initial_retry_bounds}'
        expect(initial_error.locator('.notes-folder-row[data-type]')).to_have_count(0)
        assert initial_error.locator('.nx-notes').get_by_text('0', exact=True).count() == 0, 'an unverified first read must not present zero counts'
        initial_error.close()

        page.locator('.notes-folder-row[data-type="0"]').click()
        expect(page.get_by_role('button', name='Create a new note', exact=True)).to_be_visible()
        expect(page.get_by_role('button', name='Create a new notes', exact=True)).to_have_count(0)
        page.locator('.notes-back-button').click()
        page.get_by_role('button', name='Create folder on this device').click()
        expect(page.locator('.notes-input-sheet')).to_be_visible(timeout=5000)
        page.get_by_label('Folder name').fill('Local Archive')
        page.get_by_role('button', name='Create folder', exact=True).click()
        local_folder = page.locator('.notes-folder-row[data-local-folder]:not([data-local-folder="pinned"])').filter(has_text='Local Archive')
        expect(local_folder).to_be_visible()
        local_folder.click()
        page.get_by_role('button', name='Create a new note').click()
        expect(page.get_by_label('Note content')).to_be_editable()
        save_draft(page, 'Local folder draft')
        local_save = page.evaluate("""() => PeakDuo.requests.filter(request => request.event === 'Documents/SaveDocument'
            && request.data.Title === 'Local folder draft').at(-1).data""")
        assert local_save['Type'] == 0, local_save
        get_documents_before = page.evaluate('window.__notesGetDocuments.started')
        page.evaluate("PeakDuo.setPreviewDelay('Documents/GetNotesMetadataPage', 1500)")
        page.locator('.notes-back-button').click()
        page.wait_for_function("""before => window.__notesGetDocuments.started > before
            && window.__notesGetDocuments.started > window.__notesGetDocuments.completed""",
            arg=get_documents_before,
            timeout=5000,
        )
        page.get_by_role('button', name='Create folder on this device').click()
        expect(page.locator('.notes-input-sheet')).to_be_visible(timeout=5000)
        pending_get_documents = page.evaluate('window.__notesGetDocuments.started')
        page.get_by_label('Folder name').fill('Pending refresh draft')
        page.evaluate("""() => {
            window.__pendingFolderSheet = {
                panel: document.querySelector('.notes-input-sheet'),
                input: document.querySelector('input[aria-label="Folder name"]'),
            };
        }""")
        page.wait_for_function("""target => {
            const refs = window.__pendingFolderSheet;
            return window.__notesGetDocuments.completed >= target
                && refs?.panel?.isConnected
                && document.querySelector('.notes-input-sheet') === refs.panel
                && refs.input?.isConnected
                && document.activeElement === refs.input
                && refs.input.value === 'Pending refresh draft';
        }""", arg=pending_get_documents, timeout=5000)
        page.evaluate("PeakDuo.setPreviewDelay('Documents/GetNotesMetadataPage', 0)")
        page.get_by_role('button', name='Cancel').click()
        expect(page.locator('.notes-input-sheet')).to_have_count(0)
        expect(page.locator('.notes-folder-row[data-local-folder]').filter(has_text='Pending refresh draft')).to_have_count(0)
        page.wait_for_function("""() => document.activeElement?.getAttribute('aria-label') === 'Create folder on this device'
            && document.activeElement.isConnected""", timeout=5000)
        page.get_by_role('button', name='Create folder on this device').click()
        expect(page.locator('.notes-input-sheet')).to_be_visible(timeout=5000)
        page.get_by_label('Folder name').fill('After refresh')
        page.get_by_role('button', name='Create folder', exact=True).click()
        expect(page.locator('.notes-folder-row[data-local-folder]').filter(has_text='After refresh')).to_be_visible()
        page.locator('.notes-folder-row[data-local-folder]:not([data-local-folder="pinned"])').filter(has_text='Local Archive').click()
        expect(page.get_by_role('button', name='Open note: Local folder draft')).to_be_visible()

        page.locator('.notes-back-button').click()
        page.locator('.notes-folder-row[data-local-folder="pinned"]').click()
        page.get_by_role('button', name='Create a new note').click()
        expect(page.get_by_label('Note content')).to_be_editable()
        save_draft(page, 'Pinned draft')
        pinned_save = page.evaluate("""() => PeakDuo.requests.filter(request => request.event === 'Documents/SaveDocument'
            && request.data.Title === 'Pinned draft').at(-1).data""")
        assert pinned_save['Type'] == 0, pinned_save
        page.locator('.notes-back-button').click()
        pinned_count = page.locator('.notes-folder-row[data-local-folder="pinned"] .notes-folder-count')
        expect(pinned_count).to_have_text('1')

        wait_notes_idle(page)
        get_documents_before = page.evaluate('window.__notesGetDocuments.started')
        page.evaluate("PeakDuo.setPreviewDelay('Documents/GetNotesMetadataPage', 1500)")
        page.locator('.notes-folder-row[data-local-folder="pinned"]').click()
        page.wait_for_function("""before => window.__notesGetDocuments.started > before
            && window.__notesGetDocuments.started > window.__notesGetDocuments.completed""",
            arg=get_documents_before,
            timeout=5000,
        )
        page.get_by_role('button', name='Sort Notes').click()
        sort_sheet = page.locator('.notes-actions-sheet')
        expect(sort_sheet).to_be_visible(timeout=5000)
        page.evaluate("""() => {
            window.__pendingSortSheet = {
                panel: document.querySelector('.notes-actions-sheet'),
                focus: document.activeElement,
                selected: document.querySelector('.notes-actions-sheet button[aria-pressed="true"]'),
            };
        }""")
        pending_get_documents = page.evaluate('window.__notesGetDocuments.started')
        page.wait_for_function("""target => {
            const refs = window.__pendingSortSheet;
            return window.__notesGetDocuments.completed >= target
                && refs?.panel?.isConnected
                && document.querySelector('.notes-actions-sheet') === refs.panel
                && refs.focus?.isConnected
                && document.activeElement === refs.focus
                && refs.selected?.isConnected
                && refs.selected.getAttribute('aria-pressed') === 'true';
        }""", arg=pending_get_documents, timeout=5000)
        page.evaluate("PeakDuo.setPreviewDelay('Documents/GetNotesMetadataPage', 0)")
        page.get_by_role('button', name='Cancel').click()
        expect(sort_sheet).to_have_count(0)
        page.wait_for_function("""() => document.activeElement?.getAttribute('aria-label') === 'Sort Notes'
            && document.activeElement.isConnected""", timeout=5000)
        page.locator('.notes-back-button').click()

        # Preview documents reset on reload, while device-local pin metadata remains.
        # An inaccessible old pin must not inflate the displayed count.
        page.reload(wait_until='domcontentloaded')
        page.wait_for_function('window.PeakDuo?.preview === true')
        open_notes(page)
        expect(page.locator('.notes-folder-row[data-local-folder="pinned"] .notes-folder-count')).to_have_text('0')

        page.locator('.notes-folder-row[data-type="0"]').click()
        page.get_by_role('button', name='Open note: Studio ideas').click()
        page.get_by_role('button', name='Edit note').click()
        page.get_by_label('Note title').fill('Studio ideas saved before sharing')
        page.evaluate("PeakDuo.setPreviewDelay('Documents/SaveDocument', 600)")
        page.get_by_role('button', name='Save changes').click()
        expect(page.locator('.notes-save-top')).to_have_attribute('aria-busy', 'true')
        page.get_by_role('button', name='Share note').click()
        page.get_by_role('button', name='Share nearby').click()
        page.wait_for_function("""() => {
            const events = PeakDuo.requests.map(request => request.event);
            const save = events.lastIndexOf('Documents/SaveDocument');
            const share = events.lastIndexOf('Documents/ShareLocal');
            return save >= 0 && share > save && !document.querySelector('.notes-save-top[aria-busy="true"]');
        }""", timeout=5000)
        expect(page.locator('.notes-editor-meta > span')).to_have_text('Saved to Notes')
        expect(page.get_by_label('Note title')).to_have_value('Studio ideas saved before sharing')

        # A newer edit made while a save is pending must remain dirty. A follow-up
        # action may wait for that save, but it must not send ShareLocal or drop
        # the newer edit when the older save acknowledgment arrives.
        page.get_by_role('button', name='Edit note').click()
        share_count = page.evaluate("PeakDuo.requests.filter(request => request.event === 'Documents/ShareLocal').length")
        page.evaluate("PeakDuo.setPreviewDelay('Documents/SaveDocument', 1800)")
        page.get_by_label('Note title').fill('Title captured by first save')
        page.get_by_role('button', name='Save changes').click()
        expect(page.locator('.notes-save-top')).to_have_attribute('aria-busy', 'true')
        page.get_by_label('Note title').fill('Latest title must remain unsaved')
        page.get_by_role('button', name='Share note').click()
        page.get_by_role('button', name='Share nearby').click()
        page.wait_for_function("""() => !document.querySelector('.notes-save-top[aria-busy="true"]')
            && document.querySelector('.notes-editor-meta > span')?.textContent === 'Unsaved changes'""", timeout=5000)
        expect(page.get_by_label('Note title')).to_have_value('Latest title must remain unsaved')
        assert page.evaluate("PeakDuo.requests.filter(request => request.event === 'Documents/ShareLocal').length") == share_count
        save_draft(page, 'Latest title must remain unsaved')

        # A first save assigns an ID. Edits typed during that request must survive
        # the acknowledgment, and the next save must update that assigned record.
        page.locator('.notes-back-button').click()
        page.locator('.notes-folder-row[data-type="0"]').click()
        page.get_by_role('button', name='Create a new note').click()
        first_title, latest_title = 'First save snapshot', 'New note latest title'
        first_body, latest_body = 'First save body snapshot', 'New note latest body'
        page.get_by_label('Note title').fill(first_title)
        page.get_by_label('Note content').fill(first_body)
        response_count = page.evaluate('window.__notesSaveResponses.length')
        page.evaluate("PeakDuo.setPreviewDelay('Documents/SaveDocument', 1400)")
        page.get_by_role('button', name='Save changes').click()
        expect(page.locator('.notes-save-top')).to_have_attribute('aria-busy', 'true')
        page.get_by_label('Note title').fill(latest_title)
        page.get_by_label('Note content').fill(latest_body)
        page.wait_for_function("""() => window.__notesSaveResponses.length > 0
            && window.__notesSaveResponses.at(-1).data.Title === 'First save snapshot'
            && !document.querySelector('.notes-save-top[aria-busy="true"]')
            && document.querySelector('.notes-editor-meta > span')?.textContent === 'Unsaved changes'""", timeout=5000)
        expect(page.get_by_label('Note title')).to_have_value(latest_title)
        expect(page.get_by_label('Note content')).to_contain_text(latest_body)
        save_button = page.get_by_role('button', name='Save changes')
        expect(save_button).to_be_enabled()
        assert save_button.get_attribute('aria-busy') is None
        first_save = page.evaluate('window.__notesSaveResponses.at(-1)')
        assert len(page.evaluate('window.__notesSaveResponses')) == response_count + 1, first_save
        assert first_save['data'].get('Id') is None, first_save
        assigned_id = first_save['result'].get('Id')
        assert assigned_id not in (None, ''), first_save

        page.evaluate("PeakDuo.setPreviewDelay('Documents/SaveDocument', 35)")
        save_button.click()
        page.wait_for_function("""() => window.__notesSaveResponses.length >= 2
            && window.__notesSaveResponses.at(-1).data.Title === 'New note latest title'""", timeout=5000)
        second_save = page.evaluate('window.__notesSaveResponses.at(-1)')
        assert second_save['data'].get('Id') == assigned_id, (assigned_id, second_save)
        assert second_save['data']['Title'] == latest_title, second_save
        assert latest_body in second_save['data']['Content'], second_save
        page.wait_for_function("""() => !document.querySelector('.notes-save-top[aria-busy="true"]')
            && document.querySelector('.notes-editor-meta > span')?.textContent === 'Saved to Notes'""", timeout=5000)
        page.locator('.notes-back-button').click()
        page.locator('.notes-folder-row[data-type="0"]').click()
        latest_row = page.get_by_role('button', name='Open note: New note latest title', exact=True)
        expect(latest_row).to_have_count(1)
        expect(page.get_by_role('button', name='Open note: First save snapshot', exact=True)).to_have_count(0)
        latest_row.click()
        expect(page.get_by_label('Note content')).to_contain_text(latest_body)

        # A stale save must retire the app-wide busy state without changing the
        # newer editor's contents after Back → Keep draft → Create note.
        page.locator('.notes-back-button').click()
        page.locator('.notes-folder-row[data-type="0"]').click()
        page.get_by_role('button', name='Open note: Latest title must remain unsaved').click()
        page.get_by_role('button', name='Edit note').click()
        stale_title, stale_body = 'First delayed save snapshot', 'First delayed save body'
        second_title, second_body = 'Second draft', 'Second draft body must be saved'
        page.get_by_label('Note title').fill(stale_title)
        page.get_by_label('Note content').fill(stale_body)
        response_count = page.evaluate('window.__notesSaveResponses.length')
        page.evaluate("PeakDuo.setPreviewDelay('Documents/SaveDocument', 3500)")
        page.get_by_role('button', name='Save changes').click()
        expect(page.locator('.notes-save-top')).to_have_attribute('aria-busy', 'true')
        page.locator('.notes-back-button').click()
        page.get_by_role('button', name='Keep a recovery draft').click()
        page.get_by_role('button', name='Create a new note', exact=True).click()
        page.get_by_label('Note title').fill(second_title)
        page.get_by_label('Note content').fill(second_body)
        blocked_save = page.get_by_role('button', name='Save changes')
        expect(blocked_save).to_be_disabled()
        expect(blocked_save).to_have_attribute('aria-busy', 'true')
        page.wait_for_function("""({title, count}) => window.__notesSaveResponses.length > count
            && window.__notesSaveResponses.some(item => item.data.Title === title)""",
            arg={'title': stale_title, 'count': response_count},
            timeout=7000,
        )
        page.wait_for_function("""() => {
            const button = document.querySelector('.notes-save-top');
            return button && !button.disabled && !button.hasAttribute('aria-busy');
        }""", timeout=2500)
        expect(page.get_by_label('Note title')).to_have_value(second_title)
        expect(page.get_by_label('Note content')).to_contain_text(second_body)
        first_delayed_save = page.evaluate("""title => window.__notesSaveResponses.find(item => item.data.Title === title)""", stale_title)
        assert first_delayed_save['data']['Content'].find(stale_body) >= 0, first_delayed_save
        assert first_delayed_save['data'].get('Id') == first_delayed_save['result'].get('Id'), first_delayed_save

        page.evaluate("PeakDuo.setPreviewDelay('Documents/SaveDocument', 35)")
        page.get_by_role('button', name='Save changes').click()
        page.wait_for_function("""title => window.__notesSaveResponses.some(item => item.data.Title === title)""",
            arg=second_title,
            timeout=5000,
        )
        second_save = page.evaluate("""title => window.__notesSaveResponses.find(item => item.data.Title === title)""", second_title)
        assert second_save['data'].get('Id') is None, second_save
        assert second_save['data']['Type'] == 0, second_save
        assert second_body in second_save['data']['Content'], second_save
        second_id = second_save['result'].get('Id')
        assert second_id not in (None, '') and second_id != first_delayed_save['result'].get('Id'), second_save
        page.wait_for_function("""() => !document.querySelector('.notes-save-top[aria-busy="true"]')
            && document.querySelector('.notes-editor-meta > span')?.textContent === 'Saved to Notes'""", timeout=5000)
        page.locator('.notes-back-button').click()
        page.locator('.notes-folder-row[data-type="0"]').click()
        second_row = page.get_by_role('button', name='Open note: Second draft', exact=True)
        expect(second_row).to_have_count(1)
        second_row.click()
        expect(page.get_by_label('Note content')).to_contain_text(second_body)

        # A new note has no server actions yet. The format controls keep the
        # editing caret after the checklist marker, and the generated list uses
        # persisted checkbox glyphs with transient accessible circle controls.
        page.locator('.notes-back-button').click()
        page.locator('.notes-folder-row[data-type="0"]').click()
        page.get_by_role('button', name='Create a new note', exact=True).click()
        expect(page.get_by_role('button', name='Share note')).to_have_count(0)
        expect(page.get_by_role('button', name='More actions')).to_have_count(0)
        editor = page.get_by_label('Note content')

        # Title typing coalesces only when the caret remains contiguous. Moving
        # to the start creates a separate action with chronological redo.
        title = page.get_by_label('Note title')
        title.focus()
        page.keyboard.type('ABC', delay=8)
        title.evaluate('(el)=>el.setSelectionRange(0,0)')
        page.keyboard.insert_text('Z')
        page.keyboard.press('Control+z')
        expect(title).to_have_value('ABC')
        page.keyboard.press('Control+z')
        expect(title).to_have_value('')
        page.keyboard.press('Control+y')
        expect(title).to_have_value('ABC')
        page.keyboard.press('Control+y')
        expect(title).to_have_value('ZABC')
        page.keyboard.press('Control+z')
        page.keyboard.press('Control+z')
        expect(title).to_have_value('')

        title.focus()
        page.keyboard.type('AB', delay=8)
        title.evaluate('(el)=>el.setSelectionRange(0,2)')
        page.keyboard.insert_text('Q')
        page.keyboard.press('Control+z')
        expect(title).to_have_value('AB')
        page.keyboard.press('Control+z')
        expect(title).to_have_value('')
        page.keyboard.press('Control+y')
        expect(title).to_have_value('AB')
        page.keyboard.press('Control+y')
        expect(title).to_have_value('Q')
        page.keyboard.press('Backspace')
        expect(title).to_have_value('')
        page.keyboard.press('Control+z')
        expect(title).to_have_value('Q')
        page.keyboard.press('Control+z')
        expect(title).to_have_value('AB')
        page.keyboard.press('Control+z')
        expect(title).to_have_value('')

        # Inserting a checklist at the top must keep typing in that actual new
        # item, even when an older checklist occupies the final document row.
        editor.evaluate("""el => {
            el.focus();
            el.dispatchEvent(new InputEvent('beforeinput', {inputType:'insertText', bubbles:true, cancelable:true}));
            el.innerHTML = '<p>Top paragraph</p><ul><li><span>☐</span>Existing last</li></ul>';
            el.dispatchEvent(new InputEvent('input', {inputType:'insertText', bubbles:true}));
            const text = el.querySelector('p').firstChild, range = document.createRange();
            range.setStart(text, 0); range.collapse(true);
            const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
        }""")
        page.get_by_role('button', name='Checklist').click()
        page.keyboard.insert_text('go')
        inserted_lists = page.evaluate("""() => {
            const editor = document.querySelector('.notes-rich-editor'), items = [...editor.querySelectorAll('li')];
            return {items:items.map(item=>item.textContent), target:items[0]?.hasAttribute('data-notes-checklist-item')};
        }""")
        assert inserted_lists['items'] == ['☐go', '☐Existing last'], inserted_lists
        assert inserted_lists['target'], inserted_lists
        serialized = page.evaluate("document.querySelector('.notes-rich-editor').innerHTML")
        assert 'data-notes-checklist-insert-target' not in serialized, serialized
        page.keyboard.press('Control+z')
        expect(page.locator('.notes-rich-editor li').first).to_have_text('☐')
        expect(page.locator('.notes-rich-editor li').nth(1)).to_contain_text('Existing last')
        page.keyboard.press('Control+z')
        remaining_items = page.locator('.notes-rich-editor li')
        expect(remaining_items).to_have_count(1)
        expect(remaining_items.first).to_contain_text('Existing last')
        page.keyboard.press('Control+y')
        expect(page.locator('.notes-rich-editor li').first).to_have_text('☐')
        expect(page.locator('.notes-rich-editor li').nth(1)).to_contain_text('Existing last')
        page.keyboard.press('Control+y')
        expect(page.locator('.notes-rich-editor li').first).to_contain_text('go')
        expect(page.locator('.notes-rich-editor li').nth(1)).to_contain_text('Existing last')

        # Reset to an empty editor for the marker/caret and serialization checks.
        editor.evaluate("""el => {
            el.dispatchEvent(new InputEvent('beforeinput', {inputType:'deleteContent', bubbles:true, cancelable:true}));
            el.innerHTML = '';
            el.dispatchEvent(new InputEvent('input', {inputType:'deleteContent', bubbles:true}));
        }""")
        editor.click()
        page.get_by_role('button', name='Checklist').click()
        expect(page.locator('.notes-rich-editor li')).to_have_count(1)
        first_marker = page.get_by_role('checkbox', name='Checklist item')
        expect(first_marker).to_have_attribute('aria-checked', 'false')
        expect(first_marker).to_have_attribute('contenteditable', 'false')
        caret = page.evaluate("""() => {
            const selection = getSelection(), anchor = selection?.anchorNode;
            const marker = document.querySelector('.notes-rich-editor [data-notes-checklist-marker]');
            return {text:anchor?.data || '',offset:selection?.anchorOffset || 0,
                insideMarker:!!marker?.contains(anchor), siblingText:anchor?.parentElement === marker?.parentElement};
        }""")
        assert not caret['insideMarker'] and caret['siblingText'], caret
        page.keyboard.insert_text('Pack camera')
        first_line = page.evaluate("""() => {
            const item = document.querySelector('.notes-rich-editor li'), marker = item.querySelector('[data-notes-checklist-marker]');
            return {glyph:marker.textContent, body:item.textContent.slice(marker.textContent.length), html:item.innerHTML};
        }""")
        assert first_line['glyph'] == '☐' and first_line['body'] == 'Pack camera', first_line
        page.evaluate("""() => {
            const editor = document.querySelector('.notes-rich-editor'), item = editor.querySelector('li'), marker = item.querySelector('[data-notes-checklist-marker]');
            const body = [...item.childNodes].filter(node => node.nodeType === Node.TEXT_NODE && node.data.length).at(0);
            editor.focus(); const range = document.createRange(); range.setStart(body, 0); range.collapse(true);
            const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
        }""")
        page.keyboard.insert_text('Bring ')
        page.evaluate("""() => {
            const editor = document.querySelector('.notes-rich-editor'), item = editor.querySelector('li');
            const body = [...item.childNodes].filter(node => node.nodeType === Node.TEXT_NODE && node.data.length).at(-1);
            editor.focus(); const range = document.createRange(); range.setStart(body, body.length); range.collapse(true);
            const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
        }""")
        page.keyboard.insert_text(' now')
        first_line = page.evaluate("""() => {
            const item = document.querySelector('.notes-rich-editor li'), marker = item.querySelector('[data-notes-checklist-marker]');
            return {glyph:marker.textContent, body:item.textContent.slice(marker.textContent.length)};
        }""")
        assert first_line == {'glyph':'☐','body':'Bring Pack camera now'}, first_line
        page.keyboard.press('Enter')
        expect(page.locator('.notes-rich-editor li')).to_have_count(2)
        markers = page.locator('.notes-rich-editor [data-notes-checklist-marker]')
        expect(markers).to_have_count(2)
        empty_item = page.evaluate("""() => {
            const item = document.querySelectorAll('.notes-rich-editor li')[1], marker = item.querySelector('[data-notes-checklist-marker]');
            return {text:item.textContent, glyph:marker?.textContent, editable:marker?.getAttribute('contenteditable'), placeholder:!!item.querySelector('br'), hidden:item.textContent.includes('\\u200b')};
        }""")
        assert empty_item == {'text':'☐','glyph':'☐','editable':'false','placeholder':False,'hidden':False}, empty_item
        page.keyboard.insert_text('Charge battery')
        expect(page.locator('.notes-rich-editor li').nth(1)).to_contain_text('Charge battery')

        # Mixed text/toggle history unwinds and replays in action order.
        first_marker = markers.first
        first_marker.click()
        expect(first_marker).to_have_attribute('aria-checked', 'true')
        page.evaluate("""() => {
            const editor = document.querySelector('.notes-rich-editor'), item = editor.querySelector('li');
            const body = [...item.childNodes].filter(node => node.nodeType === Node.TEXT_NODE && node.data.length).at(-1);
            editor.focus(); const range = document.createRange(); range.setStart(body, body.length); range.collapse(true);
            const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
        }""")
        page.keyboard.insert_text('!')
        page.keyboard.press('Control+z')
        expect(first_marker).to_have_attribute('aria-checked', 'true')
        expect(page.locator('.notes-rich-editor li').first).to_contain_text('Bring Pack camera now')
        page.keyboard.press('Control+z')
        expect(first_marker).to_have_attribute('aria-checked', 'false')
        page.keyboard.press('Control+z')
        expect(page.locator('.notes-rich-editor li').nth(1)).to_have_text('☐')
        page.keyboard.press('Control+y')
        expect(page.locator('.notes-rich-editor li').nth(1)).to_contain_text('Charge battery')
        page.keyboard.press('Control+y')
        expect(first_marker).to_have_attribute('aria-checked', 'true')
        page.keyboard.press('Control+y')
        expect(page.locator('.notes-rich-editor li').first).to_contain_text('now!')

        # A composing Space from an IME leaves the checkbox alone; focused
        # keyboard toggling remains reversible through the same history.
        expect(first_marker).to_have_attribute('aria-checked', 'true')
        second_marker = markers.nth(1)
        second_marker.evaluate("element => element.dispatchEvent(new KeyboardEvent('keydown', {key:' ',bubbles:true,cancelable:true,isComposing:true}))")
        expect(second_marker).to_have_attribute('aria-checked', 'false')
        second_marker.focus()
        page.keyboard.press('Space')
        expect(second_marker).to_have_attribute('aria-checked', 'true')
        page.keyboard.press('Control+z')
        expect(second_marker).to_have_attribute('aria-checked', 'false')
        page.keyboard.press('Control+y')
        expect(second_marker).to_have_attribute('aria-checked', 'true')

        # Native context-menu/OS history input joins the same ordered stack.
        page.evaluate("""() => {
            const item = document.querySelector('.notes-rich-editor li'), text = [...item.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.data.length);
            const range = document.createRange(); range.setStart(text, text.length); range.collapse(true);
            const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
        }""")
        page.keyboard.insert_text(' native-history-probe')
        expect(editor).to_contain_text('native-history-probe')
        undo_prevented = page.evaluate("""() => {
            const editor = document.querySelector('.notes-rich-editor');
            const event = new InputEvent('beforeinput', {inputType:'historyUndo', bubbles:true, cancelable:true});
            editor.dispatchEvent(event); return event.defaultPrevented;
        }""")
        assert undo_prevented, 'cancelable native historyUndo must be routed through the Notes history stack'
        expect(editor).not_to_contain_text('native-history-probe')
        redo_prevented = page.evaluate("""() => {
            const editor = document.querySelector('.notes-rich-editor');
            const event = new InputEvent('beforeinput', {inputType:'historyRedo', bubbles:true, cancelable:true});
            editor.dispatchEvent(event); return event.defaultPrevented;
        }""")
        assert redo_prevented, 'cancelable native historyRedo must be routed through the Notes history stack'
        expect(editor).to_contain_text('native-history-probe')
        ime_history_prevented = page.evaluate("""() => {
            const editor = document.querySelector('.notes-rich-editor');
            const event = new InputEvent('beforeinput', {inputType:'historyUndo', bubbles:true, cancelable:true, isComposing:true});
            editor.dispatchEvent(event); return event.defaultPrevented;
        }""")
        assert not ime_history_prevented, 'IME composition undo must remain with the active composition'
        expect(editor).to_contain_text('native-history-probe')

        # Aa preserves the user's selection while its sheet takes focus.
        page.evaluate("""() => {
            const editor = document.querySelector('.notes-rich-editor');
            const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
            let node; while ((node = walker.nextNode()) && !node.data.includes('Pack camera')) {}
            const offset = node.data.indexOf('Pack');
            const range = document.createRange(); range.setStart(node, offset); range.setEnd(node, offset + 4);
            const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
        }""")
        page.get_by_role('button', name='Text formatting').click()
        page.get_by_role('button', name='Bold', exact=True).click()
        expect(editor.locator('b, strong')).to_contain_text('Pack')

        # Paste accepts plain text only, even when the clipboard also contains
        # rich HTML. The text is then saved, reopened and sanitized as authored.
        page.evaluate("""() => {
            const editor = document.querySelector('.notes-rich-editor');
            const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
            let node, last; while ((node = walker.nextNode())) last = node;
            if (!last) throw new Error('Expected editable checklist text before paste');
            const range = document.createRange(); range.setStart(last, last.length); range.collapse(true);
            const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
            const event = new Event('paste', {bubbles:true,cancelable:true});
            Object.defineProperty(event, 'clipboardData', {value:{getData:type => type === 'text/plain' ? ' pasted <literal>' : '<b>rich payload</b>'}});
            editor.dispatchEvent(event);
        }""")
        expect(editor).to_contain_text('pasted <literal>')
        expect(editor.locator('b, strong')).to_contain_text('Pack')
        expect(editor.locator('b, strong')).not_to_contain_text('rich payload')

        page.get_by_label('Note title').fill('Checklist keyboard regression')
        save_draft(page, 'Checklist keyboard regression')
        stored_content = page.evaluate("""() => PeakDuo.requests.filter(request => request.event === 'Documents/SaveDocument'
            && request.data.Title === 'Checklist keyboard regression').at(-1).data.Content""")
        assert '<span>☑</span>' in stored_content, stored_content
        assert all(value not in stored_content for value in ('data-notes-checklist-marker', 'data-notes-checklist-item', 'data-notes-checklist-insert-target', 'aria-checked', 'contenteditable', '\u200b', '&#8203;')), stored_content
        page.locator('.notes-back-button').click()
        page.locator('.notes-folder-row[data-type="0"]').click()
        page.get_by_role('button', name='Open note: Checklist keyboard regression').click()
        expect(page.get_by_role('checkbox', name='Bring Pack camera now!')).to_have_attribute('aria-checked', 'true')
        expect(page.get_by_role('checkbox', name='Charge battery')).to_have_attribute('aria-checked', 'true')
        expect(page.get_by_label('Note content')).to_contain_text('pasted <literal>')

        # The editor stays within its pane across appearance, layout, fold,
        # orientation, and reduced-motion transitions.
        page.get_by_role('button', name='Edit note').click()
        for theme in ('light', 'dark'):
            page.evaluate('(theme)=>PeakDuo.setPhoneSetting("appearance",theme)', theme)
            page.wait_for_function('(theme)=>document.querySelector("#duo").dataset.theme===theme', arg=theme)
            page.evaluate("""async () => {
                await document.fonts.ready;
                await new Promise(resolve => setTimeout(resolve, 250));
            }""")
            geometry = page.evaluate("""() => {
                const root = document.querySelector('.nx-notes');
                const footer = root.querySelector('.notes-editor-dock');
                const toolbar = footer.querySelector('.notes-format-tools').getBoundingClientRect();
                const compose = footer.querySelector('.notes-compose').getBoundingClientRect();
                const bounds = root.getBoundingClientRect();
                const luminance = color => {
                    const rgb = color.match(/[\\d.]+/g)?.slice(0,3).map(Number) || [0,0,0];
                    const linear = value => { value /= 255; return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4); };
                    return 0.2126*linear(rgb[0]) + 0.7152*linear(rgb[1]) + 0.0722*linear(rgb[2]);
                };
                const controlContrast = ['.notes-back-button','.notes-compose'].map(selector => {
                    const button = root.querySelector(selector), path = button.querySelector('path');
                    const background = getComputedStyle(button).backgroundColor;
                    const icon = getComputedStyle(path).stroke || getComputedStyle(button).color;
                    const values = [luminance(background),luminance(icon)].sort((a,b)=>b-a);
                    return {selector,background,icon,ratio:(values[0]+0.05)/(values[1]+0.05)};
                });
                return {view:root.dataset.notesView,overflow:root.scrollWidth>root.clientWidth+1,
                    toolbarInside:toolbar.left>=bounds.left-1&&toolbar.right<=bounds.right+1,
                    composeInside:compose.left>=bounds.left-1&&compose.right<=bounds.right+1,
                    controlsOverlap:toolbar.right>compose.left,
                    dockBackground:getComputedStyle(footer).backgroundImage,controlContrast};
            }""")
            assert geometry['view']=='editor' and not geometry['overflow'] and geometry['toolbarInside'] and geometry['composeInside'] and not geometry['controlsOverlap'], (theme, geometry)
            expected_dock_surface = 'rgb(255, 255, 255)' if theme == 'light' else 'rgb(34, 34, 37)'
            assert expected_dock_surface in geometry['dockBackground'], (theme, geometry['dockBackground'])
            assert all(item['ratio'] >= 3 for item in geometry['controlContrast']), (theme, geometry['controlContrast'])
        page.evaluate('PeakDuo.setPhoneSetting("layout","full")')
        page.wait_for_function('PeakDuo.getState().workspace.layout === "full"')
        page.evaluate('PeakDuo.setPhoneSetting("layout","split")')
        page.wait_for_function('PeakDuo.getState().workspace.layout === "split"')
        page.evaluate('PeakDuo.fold()')
        page.wait_for_function('PeakDuo.getState().workspace.expanded === false')
        page.evaluate('PeakDuo.fold()')
        page.wait_for_function('PeakDuo.getState().workspace.expanded === true')
        current_orientation = page.locator('#duo').get_attribute('data-orientation')
        next_orientation = 'portrait' if current_orientation == 'landscape' else 'landscape'
        page.get_by_role('button', name=f'Use {next_orientation} orientation').click()
        page.wait_for_function('(value)=>document.querySelector("#duo").dataset.orientation === value', arg=next_orientation)
        page.get_by_role('button', name=f'Use {current_orientation} orientation').click()
        page.wait_for_function('(value)=>document.querySelector("#duo").dataset.orientation === value', arg=current_orientation)
        page.evaluate('PeakDuo.setPhoneSetting("motion",true)')
        expect(page.locator('#duo')).to_have_class(__import__('re').compile(r'duo-reduced-motion'))
        page.evaluate('PeakDuo.setPhoneSetting("motion",false)')
        page.evaluate('PeakDuo.setPhoneSetting("layout","full")')

        # Finalized owner sharing remains available. A recipient can read and
        # sign as before but cannot see owner-only share, finalize, or delete.
        page.locator('.notes-back-button').click()
        page.locator('.notes-folder-row[data-type="5"]').click()
        page.get_by_role('button', name='Open note: Studio rental agreement').click()
        expect(page.get_by_label('Note title')).to_have_attribute('readonly', '')
        page.get_by_role('button', name='Share note').click()
        share_sheet = page.locator('.notes-actions-sheet')
        expect(share_sheet.get_by_role('button', name='Share nearby')).to_be_visible()
        expect(share_sheet.get_by_role('button', name='Share with a character')).to_be_visible()
        expect(share_sheet.get_by_role('button', name='Place QR code nearby')).to_have_count(0)
        page.get_by_role('button', name='Cancel').click()
        page.get_by_role('button', name='More actions').click()
        more_sheet = page.locator('.notes-actions-sheet')
        expect(more_sheet.get_by_role('button', name='View signatures')).to_be_visible()
        expect(more_sheet.get_by_role('button', name='Share nearby')).to_have_count(0)
        expect(more_sheet.get_by_role('button', name='Share with a character')).to_have_count(0)
        page.get_by_role('button', name='Cancel').click()
        page.locator('.notes-back-button').click()
        page.locator('.notes-folder-row[data-type="5"]').click()
        page.get_by_role('button', name='Open note: Jordan’s location release').click()
        expect(page.get_by_label('Note content')).to_have_attribute('contenteditable', 'false')
        readonly_history_prevented = page.evaluate("""() => {
            const editor = document.querySelector('.notes-rich-editor');
            const event = new InputEvent('beforeinput', {inputType:'historyUndo', bubbles:true, cancelable:true});
            editor.dispatchEvent(event); return event.defaultPrevented;
        }""")
        assert readonly_history_prevented, 'read-only notes must block native history mutations'
        expect(page.get_by_label('Note content')).to_contain_text('Shared for your signature')
        expect(page.get_by_role('button', name='Share note')).to_have_count(0)
        page.get_by_role('button', name='More actions').click()
        recipient_actions = page.locator('.notes-actions-sheet')
        expect(recipient_actions.get_by_role('button', name='Pin on this device')).to_be_visible()
        expect(recipient_actions.get_by_role('button', name='Delete note')).to_have_count(0)
        expect(recipient_actions.get_by_role('button', name='Share nearby')).to_have_count(0)
        page.get_by_role('button', name='Cancel').click()

        # Undo history is bounded by both action count and retained content.
        # Fifty discrete checkbox toggles leave only the latest forty undoable.
        page.locator('.notes-back-button').click()
        page.locator('.notes-folder-row[data-type="0"]').click()
        page.get_by_role('button', name='Create a new note', exact=True).click()
        editor = page.get_by_label('Note content')
        editor.click()
        page.get_by_role('button', name='Checklist').click()
        marker = page.locator('.notes-rich-editor [data-notes-checklist-marker]').first
        for _ in range(50):
            marker.click()
        expect(marker).to_have_attribute('aria-checked', 'false')
        for _ in range(40):
            page.keyboard.press('Control+z')
        expect(marker).to_have_attribute('aria-checked', 'false')
        page.keyboard.press('Control+z')
        expect(marker).to_have_attribute('aria-checked', 'false')
        page.keyboard.press('Control+y')
        expect(marker).to_have_attribute('aria-checked', 'true')

        # A near-200 KB note exercises the per-input sanitize and history path. The
        # live input event should sanitize once; browser timing is reported as
        # evidence, not treated as an FPS guarantee.
        large_input = page.evaluate("""() => {
            const app = document.querySelector('.nx-notes'), editor = app.querySelector('.notes-rich-editor');
            const parse = DOMParser.prototype.parseFromString;
            let sanitizeCalls = 0, sanitizeMs = 0;
            DOMParser.prototype.parseFromString = function(...args) {
                const start = performance.now();
                try { return Reflect.apply(parse, this, args); }
                finally { sanitizeCalls++; sanitizeMs += performance.now() - start; }
            };
            try {
                editor.focus();
                editor.dispatchEvent(new InputEvent('beforeinput', {inputType:'insertText', bubbles:true, cancelable:true}));
                editor.innerHTML = `<p>${'x'.repeat(199700)}</p>`;
                const initialStart = performance.now();
                editor.dispatchEvent(new InputEvent('input', {inputType:'insertText', bubbles:true}));
                const initialMs = performance.now() - initialStart;
                const text = [...editor.querySelectorAll('p')].at(-1).firstChild;
                const range = document.createRange(); range.setStart(text, text.length); range.collapse(true);
                const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
                sanitizeCalls = 0; sanitizeMs = 0;
                editor.dispatchEvent(new InputEvent('beforeinput', {inputType:'insertText', data:'y', bubbles:true, cancelable:true}));
                text.data += 'y';
                const typingStart = performance.now();
                editor.dispatchEvent(new InputEvent('input', {inputType:'insertText', data:'y', bubbles:true}));
                const typingMs = performance.now() - typingStart;
                return {initialMs, typingMs, sanitizeMs, sanitizeCalls, contentLength:app.querySelector('.notes-rich-editor').textContent.length};
            } finally { DOMParser.prototype.parseFromString = parse; }
        }""")
        assert large_input['contentLength'] >= 199701, large_input
        assert large_input['sanitizeCalls'] == 1, large_input
        assert large_input['typingMs'] < 1000, large_input
        print(f"Large Notes input: {large_input['contentLength']} chars, {large_input['typingMs']:.1f} ms input handler, {large_input['sanitizeMs']:.1f} ms sanitizing, {large_input['sanitizeCalls']} sanitize call")

        # Add three more large snapshots. The 1 MB retained-string budget
        # should leave only the latest toggle undoable, without an invalid
        # jump through the evicted history.
        page.evaluate("""() => {
            const editor = document.querySelector('.notes-rich-editor'), text = editor.querySelector('p').firstChild;
            const range = document.createRange(); range.setStart(text, text.length); range.collapse(true);
            const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
        }""")
        page.get_by_role('button', name='Checklist').click()
        marker = page.locator('.notes-rich-editor [data-notes-checklist-marker]').last
        for _ in range(3):
            marker.click()
        expect(marker).to_have_attribute('aria-checked', 'true')
        page.keyboard.press('Control+z')
        expect(marker).to_have_attribute('aria-checked', 'false')
        page.keyboard.press('Control+z')
        expect(marker).to_have_attribute('aria-checked', 'false')

        # Compare a normal bulleted row and a checklist row in both themes.
        # The former keeps its native disc; the latter uses only the drawn circle.
        editor = page.get_by_label('Note content')
        editor.evaluate("""el => {
            el.focus();
            el.dispatchEvent(new InputEvent('beforeinput', {inputType:'insertText', bubbles:true, cancelable:true}));
            el.innerHTML = '<p>List rendering</p><ul><li>Ordinary bullet</li><li><span>☐</span>Checklist labels wrap naturally across multiple lines, and the circle should stay aligned with the first visible line of this checklist item.</li></ul>';
            el.dispatchEvent(new InputEvent('input', {inputType:'insertText', bubbles:true}));
        }""")
        screenshot_dir = Path(os.environ.get('NOTES_BROWSER_OUT', Path(os.environ.get('TEMP', '.')) / 'notes-browser-render-checks'))
        screenshot_dir.mkdir(parents=True, exist_ok=True)
        for theme in ('light', 'dark'):
            page.evaluate('(theme)=>PeakDuo.setPhoneSetting("appearance",theme)', theme)
            page.wait_for_function('(theme)=>document.querySelector("#duo").dataset.theme===theme', arg=theme)
            for layout in ('full', 'split', 'fold'):
                if layout == 'fold':
                    page.evaluate('PeakDuo.setPhoneSetting("layout","split")')
                    page.wait_for_function('PeakDuo.getState().workspace.layout === "split"')
                    page.evaluate('if (PeakDuo.getState().workspace.expanded) PeakDuo.fold()')
                    page.wait_for_function('PeakDuo.getState().workspace.expanded === false')
                else:
                    page.evaluate('if (!PeakDuo.getState().workspace.expanded) PeakDuo.fold()')
                    page.wait_for_function('PeakDuo.getState().workspace.expanded === true')
                    page.evaluate('(layout)=>PeakDuo.setPhoneSetting("layout",layout)', layout)
                    page.wait_for_function('(layout)=>PeakDuo.getState().workspace.layout===layout', arg=layout)
                page.evaluate("""async () => {
                    await document.fonts.ready;
                    await new Promise(resolve => setTimeout(resolve, 250));
                }""")
                page.mouse.move(20, 20)
                rendering = page.evaluate("""() => {
                    const items = [...document.querySelectorAll('.notes-rich-editor li')];
                    const marker = items[1]?.querySelector('[data-notes-checklist-marker]');
                    const text = items[1] && [...items[1].childNodes].find(node=>node.nodeType===Node.TEXT_NODE&&node.data.trim());
                    if (!marker || !text) return {missing:true};
                    const range = document.createRange(), lineTops = new Set();
                    for (let i=0; i<text.data.length; i++) {
                        range.setStart(text,i); range.setEnd(text,i+1);
                        const rect=range.getBoundingClientRect(); if(rect.width&&rect.height) lineTops.add(Math.round(rect.top*100)/100);
                    }
                    range.setStart(text,0); range.setEnd(text,1);
                    const firstChar=range.getBoundingClientRect(), circle=marker.getBoundingClientRect();
                    const markerStyle=getComputedStyle(marker);
                    const buttons=['.notes-back-button','.notes-compose'].map(selector=>{
                        const button=document.querySelector('.nx-notes '+selector),path=button.querySelector('path');
                        return {selector,background:getComputedStyle(button).backgroundColor,
                            stroke:getComputedStyle(path).stroke,color:getComputedStyle(button).color};
                    });
                    return {ordinaryListStyle:items[0]&&getComputedStyle(items[0]).listStyleType,
                        checklistListStyle:getComputedStyle(items[1]).listStyleType,
                        marker:{role:marker.getAttribute('role'),width:markerStyle.width,height:markerStyle.height,borderRadius:markerStyle.borderRadius},
                        markerCenter:circle.top+circle.height/2,firstLineCenter:firstChar.top+firstChar.height/2,
                        lineCount:lineTops.size,buttons};
                }""")
                assert not rendering.get('missing'), (theme, layout, rendering)
                assert rendering['ordinaryListStyle'] == 'disc', (theme, layout, rendering)
                assert rendering['checklistListStyle'] == 'none', (theme, layout, rendering)
                assert rendering['marker'] == {'role':'checkbox','width':'19px','height':'19px','borderRadius':'50%'}, (theme, layout, rendering)
                assert rendering['lineCount'] >= 2, (theme, layout, rendering)
                alignment_delta = abs(rendering['markerCenter'] - rendering['firstLineCenter'])
                assert alignment_delta <= 3, (theme, layout, alignment_delta, rendering)
                if layout == 'full':
                    page.screenshot(path=str(screenshot_dir / f'{theme}-checklist-render.png'), full_page=True)
                    page.locator('.nx-notes').screenshot(path=str(screenshot_dir / f'{theme}-checklist-crop.png'))
                print(f"{theme}/{layout} checklist first-line alignment: {alignment_delta:.2f}px; lines={rendering['lineCount']}")

        # Validation runs before NUI transport. Multibyte title/body content
        # uses UTF-8 byte counts, while the RPC check mirrors Cfx's packed
        # array envelope and its additional Unicode escapes.
        active_notes = page.locator('.nx-notes:visible').first
        active_notes.locator('.notes-back-button').click()
        if active_notes.locator('.notes-confirm-sheet:visible').count():
            page.get_by_role('button', name='Keep a recovery draft').click()
        active_notes.locator('.notes-folder-row[data-type="0"]').click()
        active_notes.get_by_role('button', name='Create a new note', exact=True).click()
        validation_out = Path(os.environ.get('NOTES_VALIDATION_OUT', Path(os.environ.get('TEMP', '.')) / 'notes-validation-errors'))
        validation_out.mkdir(parents=True, exist_ok=True)

        def prepare_validation_pose(theme, layout):
            page.evaluate('(theme)=>PeakDuo.setPhoneSetting("appearance",theme)', theme)
            page.wait_for_function('(theme)=>document.querySelector("#duo").dataset.theme===theme', arg=theme)
            if layout == 'fold':
                page.evaluate('PeakDuo.setPhoneSetting("layout","split")')
                page.wait_for_function('PeakDuo.getState().workspace.layout === "split"')
                page.evaluate('if (PeakDuo.getState().workspace.expanded) PeakDuo.fold()')
                page.wait_for_function('PeakDuo.getState().workspace.expanded === false')
            else:
                page.evaluate('if (!PeakDuo.getState().workspace.expanded) PeakDuo.fold()')
                page.wait_for_function('PeakDuo.getState().workspace.expanded === true')
                page.evaluate('(layout)=>PeakDuo.setPhoneSetting("layout",layout)', layout)
                page.wait_for_function('(layout)=>PeakDuo.getState().workspace.layout===layout', arg=layout)

        def assert_unsent_validation(title, expected_message, screenshot_name, expected_body_fragment):
            count = page.evaluate('window.__notesSaveResponses.length')
            request_count = page.evaluate("PeakDuo.requests.filter(request => request.event === 'Documents/SaveDocument').length")
            active_notes.get_by_role('button', name='Save changes').click()
            toast = page.locator('.duo-toast')
            expect(toast).to_be_visible(timeout=3000)
            expect(toast).to_contain_text(expected_message, timeout=3000)
            page.wait_for_function('(count)=>window.__notesSaveResponses.length===count', arg=count, timeout=1000)
            assert page.evaluate("PeakDuo.requests.filter(request => request.event === 'Documents/SaveDocument').length") == request_count, 'rejected payload must not call the SaveDocument transport'
            expect(active_notes.get_by_label('Note title')).to_have_value(title)
            expect(active_notes.get_by_label('Note content')).to_contain_text(expected_body_fragment)
            expect(active_notes.locator('.notes-editor-meta > span')).to_have_text('New note')
            expect(active_notes.locator('.notes-save-top')).to_be_enabled()
            assert active_notes.locator('.notes-save-top').evaluate('button => document.activeElement === button'), 'validation feedback keeps keyboard focus on the save action'
            assert page.evaluate("""({title,fragment}) => {
                const values=Array.from({length:localStorage.length},(_,i)=>localStorage.getItem(localStorage.key(i)));
                return values.some(value=>{try{const draft=JSON.parse(value);return draft?.isNew===true&&draft.title===title&&draft.content.includes(fragment)}catch{return false}});
            }""", {'title': title, 'fragment': expected_body_fragment}), 'validation failure must retain the full local recovery draft'
            page.screenshot(path=str(validation_out / screenshot_name), full_page=True)

        def measure_rpc_envelope():
            return active_notes.evaluate(r"""root => {
                const payload={Type:0,Title:root.querySelector('.notes-title-input').value.trim(),Content:root.querySelector('.notes-rich-editor').innerHTML};
                const packed=JSON.stringify([payload]);
                const cfx=packed.replace(/[\u007f-\u009f\u00ad\u0600-\u0604\u070f\u17b4-\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
                    character=>'\\u'+character.charCodeAt(0).toString(16).padStart(4,'0'));
                return {contentBytes:new TextEncoder().encode(payload.Content).length,
                    ordinaryArrayBytes:new TextEncoder().encode(packed).length,
                    cfxBytes:new TextEncoder().encode(cfx).length};
            }""")

        prepare_validation_pose('light', 'full')
        title = '界' * 51  # 51 code points, 153 UTF-8 bytes, below input maxlength.
        body = 'Title draft remains editable.'
        active_notes.get_by_label('Note title').fill(title)
        active_notes.get_by_label('Note content').fill(body)
        assert_unsent_validation(title, 'too long to save', 'title-utf8-light-full.png', body)

        prepare_validation_pose('dark', 'split')
        active_notes.get_by_label('Note title').fill('UTF-8 body check')
        body = '界' * 34_000
        active_notes.get_by_label('Note content').fill(body)
        body_bytes = active_notes.locator('.notes-rich-editor').evaluate("el => new TextEncoder().encode(el.innerHTML).length")
        assert body_bytes > 100_000, body_bytes
        assert_unsent_validation('UTF-8 body check', 'Shorten its text', 'body-utf8-dark-split.png', body[:80])

        prepare_validation_pose('dark', 'fold')
        title = 'Escaped envelope check'
        body = '"' * 66_000
        active_notes.get_by_label('Note title').fill(title)
        active_notes.get_by_label('Note content').fill(body)
        envelope = measure_rpc_envelope()
        assert envelope['contentBytes'] <= 100_000 and envelope['cfxBytes'] > 131_072, envelope
        assert_unsent_validation(title, 'simplify its formatting', 'escaped-envelope-dark-fold.png', body[:80])

        # U+2028 stays literal in JSON.stringify but Cfx escapes it as six
        # ASCII bytes. Raw content is legal while its packed RPC form is not.
        title = 'Cfx Unicode escape check'
        body = '\u2028' * 22_000
        active_notes.get_by_label('Note title').fill(title)
        active_notes.get_by_label('Note content').fill(body)
        unicode_envelope = measure_rpc_envelope()
        assert unicode_envelope['contentBytes'] <= 100_000, unicode_envelope
        assert unicode_envelope['ordinaryArrayBytes'] <= 131_072 < unicode_envelope['cfxBytes'], unicode_envelope
        assert unicode_envelope['cfxBytes'] - unicode_envelope['ordinaryArrayBytes'] == 3 * 22_000, unicode_envelope
        print(f"Cfx U+2028 oversize: raw={unicode_envelope['contentBytes']}, JSON array={unicode_envelope['ordinaryArrayBytes']}, Cfx={unicode_envelope['cfxBytes']} bytes")
        assert_unsent_validation(title, 'simplify its formatting', 'unicode-envelope-dark-fold.png', body[:80])

        # Preserve the existing near-limit quote case: quotes expand under
        # ordinary JSON escaping, while this is only a synthetic preview save.
        body = '"' * 65_400
        active_notes.get_by_label('Note content').fill(body)
        near_envelope = measure_rpc_envelope()
        assert near_envelope['contentBytes'] <= 100_000 and 120_000 < near_envelope['cfxBytes'] <= 131_072, near_envelope
        request_count = page.evaluate("PeakDuo.requests.filter(request => request.event === 'Documents/SaveDocument').length")
        active_notes.get_by_role('button', name='Save changes').click()
        page.wait_for_function('(count)=>PeakDuo.requests.filter(request => request.event === "Documents/SaveDocument").length > count', arg=request_count, timeout=5000)
        page.wait_for_function("title => window.__notesSaveResponses.some(item => item.data.Title === title && item.result.Success === true)", arg=title, timeout=5000)
        expect(active_notes.locator('.notes-editor-meta > span')).to_have_text('Saved to Notes', timeout=5000)

        # A Unicode payload close to the Cfx RPC cap also remains valid and
        # reaches the preview transport; create a separate new note because
        # the successful first save closes the original editor for changes.
        active_notes.locator('.notes-back-button').click()
        active_notes.locator('.notes-folder-row[data-type="0"]').click()
        active_notes.get_by_role('button', name='Create a new note', exact=True).click()
        title = 'Cfx Unicode near-limit'
        body = '\u2028' * 21_000
        active_notes.get_by_label('Note title').fill(title)
        active_notes.get_by_label('Note content').fill(body)
        unicode_near_envelope = measure_rpc_envelope()
        assert unicode_near_envelope['contentBytes'] <= 100_000, unicode_near_envelope
        assert 120_000 < unicode_near_envelope['cfxBytes'] <= 131_072, unicode_near_envelope
        assert unicode_near_envelope['cfxBytes'] - unicode_near_envelope['ordinaryArrayBytes'] == 3 * 21_000, unicode_near_envelope
        print(f"Cfx U+2028 near-limit: raw={unicode_near_envelope['contentBytes']}, JSON array={unicode_near_envelope['ordinaryArrayBytes']}, Cfx={unicode_near_envelope['cfxBytes']} bytes")
        request_count = page.evaluate("PeakDuo.requests.filter(request => request.event === 'Documents/SaveDocument').length")
        active_notes.get_by_role('button', name='Save changes').click()
        page.wait_for_function('(count)=>PeakDuo.requests.filter(request => request.event === "Documents/SaveDocument").length > count', arg=request_count, timeout=5000)
        page.wait_for_function("title => window.__notesSaveResponses.some(item => item.data.Title === title && item.result.Success === true)", arg=title, timeout=5000)
        expect(active_notes.locator('.notes-editor-meta > span')).to_have_text('Saved to Notes', timeout=5000)

        assert page.evaluate("PeakDuo.getState().errors.length") == 0
        assert not errors, errors
        print('Notes browser checks passed: saves, local folders, checklist editing and roundtrip, appearance/layout, sharing gates, read-only access, bounded editor history, and UTF-8/RPC-size validation with retained drafts.')
        browser.close()


if __name__ == '__main__':
    run()
