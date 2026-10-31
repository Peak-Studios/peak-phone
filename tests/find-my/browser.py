"""Native Chromium coverage for Find My People. Preview fixtures are read-only."""
from pathlib import Path
import json, os
from playwright.sync_api import Error as PlaywrightError, sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'artifacts/portable'
OUT.mkdir(parents=True, exist_ok=True)
URL = os.environ.get('PREVIEW_URL', 'http://127.0.0.1:18931')
checks = []
errors = []

def passed(name):
    checks.append({'name': name, 'passed': True})
    print('PASS', name, flush=True)

def hit_test_and_click(page, locator, name):
    """Prove the target owns its center pixel, then use a normal Playwright click."""
    for attempt in range(3):
        try:
            locator.scroll_into_view_if_needed()
            hit = locator.evaluate('''el=>{
                const rect=el.getBoundingClientRect();
                const x=rect.left+rect.width/2, y=rect.top+rect.height/2;
                const top=document.elementFromPoint(x,y);
                return {connected:el.isConnected,within:!!top&&(top===el||el.contains(top)),
                    target:el.getAttribute('aria-label')||el.innerText||el.tagName,
                    hit:top?.getAttribute('class')||top?.tagName||null,
                    x,y,rect:{left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom}};
            }''')
            if not hit['connected']:
                raise PlaywrightError('Element is not attached to the DOM')
            break
        except PlaywrightError as error:
            if 'not attached to the DOM' not in str(error) or attempt == 2:
                raise
            expect(locator).to_be_visible()
    if not hit['within']:
        raise AssertionError(f'{name} is covered at its center: {hit}')
    locator.click()

def set_display_state(page, mode, expanded, orientation, layout):
    root = page.locator('#duo')
    current = root.evaluate("node=>({expanded:node.dataset.expanded==='true',orientation:node.dataset.orientation,layout:node.dataset.layout})")
    if current['layout'] != layout:
        page.evaluate('(value)=>PeakDuo.setLayout(value)', layout)
        page.wait_for_function('(value)=>document.querySelector("#duo")?.dataset.layout===value', arg=layout)
    current = root.evaluate("node=>({expanded:node.dataset.expanded==='true',orientation:node.dataset.orientation,layout:node.dataset.layout})")
    if current['expanded'] != expanded:
        page.evaluate('PeakDuo.fold()')
        page.wait_for_function('(value)=>document.querySelector("#duo")?.dataset.expanded===String(value)', arg=expanded)
    if expanded:
        current_orientation = root.get_attribute('data-orientation')
        if current_orientation != orientation:
            hit_test_and_click(page, page.get_by_role('button', name=f'Use {orientation} orientation', exact=True), f'{mode} orientation control')
            page.wait_for_function('(value)=>document.querySelector("#duo")?.dataset.orientation===value', arg=orientation)
    page.wait_for_function('''()=>{
        const root=document.querySelector('#duo');
        if(!root||root.classList.contains('duo-orientation-turning')||root.classList.contains('duo-folding')||root.querySelector('.duo-fold-copy'))return false;
        return [...root.getAnimations({subtree:true})].filter(animation=>{
            const target=animation.effect?.target;
            return target instanceof Element&&target.matches('.duo-chassis,.duo-screenbank,.duo-pane');
        }).every(animation=>animation.playState==='finished');
    }''')
    observed = root.evaluate("node=>({expanded:node.dataset.expanded==='true',orientation:node.dataset.orientation,layout:node.dataset.layout})")
    expected = {'expanded': expanded, 'orientation': orientation, 'layout': layout}
    if observed != expected:
        raise AssertionError(f'{mode} shell state mismatch: expected {expected}, got {observed}')
    passed(f'{mode} uses the actual shell state {observed}')

def assert_people_geometry(page, mode, panel):
    panel.evaluate('''node=>{
        const body=node.closest('.gx-body'), app=node.closest('.duo-app-instance');
        const layout=node.closest('.u27-map-layout'), atlas=layout.querySelector('.u27-map-viewport');
        const bodyRect=body.getBoundingClientRect(),appRect=app.getBoundingClientRect();
        const style=getComputedStyle(node),bodyStyle=getComputedStyle(body);
        const gesture=document.querySelector('.duo-home-gesture');
        const gestureRect=gesture?.getBoundingClientRect();
        if(bodyStyle.overflowY!=='auto'||style.overflowY!=='visible')throw Error('People must use the app body as its only scroll region.');
        if(getComputedStyle(atlas).display==='none')throw Error('The live atlas must remain visible in People.');
        if(bodyRect.top<appRect.top-1||bodyRect.bottom>appRect.bottom+1)throw Error('People scroll region extends outside the usable app body.');
        if(gestureRect&&bodyRect.bottom>gestureRect.top+1)throw Error('People scroll region overlaps the home gesture area.');
    }''')
    passed(f'{mode} People keeps the live atlas and uses one bounded app-body scroll region')

def assert_people_entry_visibility(page, mode, app):
    page.wait_for_function('''()=>{
        const app=document.querySelector('#duo .duo-screenbank:not(.duo-fold-copy) .duo-pane[data-side="left"] .duo-app-instance[data-app="maps"]');
        const body=app?.querySelector('.gx-body'),panel=app?.querySelector('.u27-map-panel');
        const tabs=panel?.querySelector('.u27-segment'),toggle=app?.querySelector('.u27-blip-toggle');
        const heading=panel?.querySelector('.u27-people-heading'),row=app?.querySelector('.u27-incoming-row');
        const name=row?.querySelector('.u27-people-copy strong');
        if(!body||!panel||!tabs||!toggle||!heading||!name)return false;
        const bounds=body.getBoundingClientRect();
        return [tabs,toggle,heading,name].every(node=>{const rect=node.getBoundingClientRect();return rect.top>=bounds.top-1&&rect.bottom<=bounds.bottom+1;});
    }''')
    panel = app.locator('.u27-map-panel')
    panel.evaluate('''node=>{
        const canvas=node.closest('.u27-maps').querySelector('.u27-map-canvas');
        if(getComputedStyle(canvas).touchAction!=='pan-y')throw Error('People atlas must allow vertical touch scrolling.');
    }''')
    passed(f'{mode} People entry exposes tabs, blips, and the incoming identity without test scrolling')

def exercise_people_actions(page, app, mode):
    share = app.get_by_role('button', name='Share live location with a saved contact', exact=True)
    hit_test_and_click(page, share, f'{mode} Share')
    picker = page.locator('.nx-sheet[role="dialog"]').last
    expect(picker).to_be_visible()
    recipient = picker.get_by_role('button', name='Share with J. Lee · studio, 5550102002', exact=True)
    hit_test_and_click(page, recipient, f'{mode} saved contact')
    expect(page.locator('.nx-sheet[role="dialog"]').filter(has_text='Confirm the person')).to_be_visible()
    page.keyboard.press('Escape')

    stop = app.get_by_role('button', name='Stop', exact=True)
    hit_test_and_click(page, stop, f'{mode} Stop')
    expect(page.get_by_role('dialog', name='Location sharing').filter(has_text='Stop sharing your live location')).to_be_visible()
    page.keyboard.press('Escape')

    toggle = app.locator('.u27-blip-toggle')
    before = toggle.get_attribute('aria-pressed')
    hit_test_and_click(page, toggle, f'{mode} GTA map blips toggle')
    expect(toggle).to_have_attribute('aria-pressed', 'false' if before == 'true' else 'true')
    hit_test_and_click(page, toggle, f'{mode} GTA map blips toggle restore')
    expect(toggle).to_have_attribute('aria-pressed', before)
    passed(f'{mode} Share, Stop, and blip controls take ordinary clicks at their visible hit targets')

with sync_playwright() as pw:
    options = {'headless': True}
    if os.environ.get('CHROMIUM_PATH'):
        options['executable_path'] = os.environ['CHROMIUM_PATH']
    browser = pw.chromium.launch(**options)
    page = browser.new_page(viewport={'width': 430, 'height': 932}, device_scale_factor=2)
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.add_init_script('''(()=>{
        const arc=CanvasRenderingContext2D.prototype.arc,fill=CanvasRenderingContext2D.prototype.fill;
        CanvasRenderingContext2D.prototype.arc=function(x,y,r,...rest){
            if(this.canvas?.classList.contains('u27-map-canvas'))this.__findMyLastArc={x,y,r};
            return arc.call(this,x,y,r,...rest);
        };
        CanvasRenderingContext2D.prototype.fill=function(...args){
            if(this.canvas?.classList.contains('u27-map-canvas')&&String(this.fillStyle).toLowerCase()==='#7b55d9'){
                (window.__findMyMarkers??=[]).push({...this.__findMyLastArc});
            }
            return fill.apply(this,args);
        };
    })()''')
    page.goto(URL)
    page.wait_for_function('window.PeakDuo?.preview === true')
    assert page.evaluate("PeakDuo.openApp('maps','left',{external:true})")
    app = page.locator('#duo .duo-screenbank:not(.duo-fold-copy) .duo-pane[data-side="left"] .duo-app-instance[data-app="maps"]')
    expect(app).to_be_visible()
    page.get_by_role('button', name='People', exact=True).click()
    expect(app.get_by_text('Sharing with you', exact=True)).to_be_visible()
    expect(app.get_by_text('Maya Chen', exact=True).first).to_be_visible()
    expect(app.get_by_text('Different instance', exact=True)).to_be_visible()
    expect(app.get_by_text('Your outgoing shares', exact=True)).to_be_visible()
    expect(app.get_by_text('Saved contacts', exact=True)).to_have_count(0)
    expect(app.get_by_role('button', name='Share live location with a saved contact', exact=True)).to_be_visible()
    assert_people_entry_visibility(page, 'folded entry', app)
    assert not page.evaluate("PeakDuo.requests.some(r=>r.event==='Maps/GetShareContacts')"), 'People must not load saved contacts before explicit Share'
    passed('People opens with live/outgoing shares and no eager contact load')

    maya = app.locator('.u27-people-row').filter(has_text='Maya Chen')
    show_on_map = maya.get_by_role('button', name='Show on map', exact=True)
    body = app.locator('.gx-body')
    before_list_wheel = body.evaluate('(node)=>node.scrollTop')
    toggle_bounds = app.locator('.u27-blip-toggle').bounding_box()
    page.mouse.move(toggle_bounds['x'] + toggle_bounds['width'] / 2, toggle_bounds['y'] + toggle_bounds['height'] / 2)
    page.mouse.wheel(0, 80)
    page.wait_for_function('''(before)=>{
        const body=document.querySelector('.u27-maps .gx-body'),button=document.querySelector('.u27-incoming-row [aria-label="Show on map"]');
        if(!body||!button||body.scrollTop<=before)return false;
        const rect=button.getBoundingClientRect(),bounds=body.getBoundingClientRect();
        return rect.top>=bounds.top&&rect.bottom<=bounds.bottom;
    }''', arg=before_list_wheel)
    passed('A normal wheel in People reveals the live map action')
    page.wait_for_function('window.__findMyMarkers?.length > 0')
    page.evaluate('window.__findMyMarkers=[]')
    hit_test_and_click(page, show_on_map, 'Show on map')
    expect(app.locator('.u27-map-viewport')).to_be_visible()
    assert app.locator('.u27-maps').get_attribute('data-filter') == 'people'
    page.wait_for_function('''()=>{
        const canvas=document.querySelector('.u27-map-canvas');
        if(!canvas?.width||!canvas.height)return false;
        const bounds=canvas.getBoundingClientRect(),body=canvas.closest('.gx-body').getBoundingClientRect();
        const clientX=bounds.left+bounds.width/2,clientY=bounds.top+bounds.height/2;
        const centered=(window.__findMyMarkers||[]).some(marker=>marker.r===7&&
            Math.abs(marker.x-canvas.clientWidth/2)<1&&Math.abs(marker.y-canvas.clientHeight/2)<1);
        return centered&&clientY>=body.top&&clientY<=body.bottom&&
            document.elementFromPoint(clientX,clientY)===canvas;
    }''')
    passed('Show on map scrolls the atlas into view and centers the live person marker in People')
    before_wheel = body.evaluate('(node)=>node.scrollTop')
    canvas_bounds = app.locator('.u27-map-canvas').bounding_box()
    page.mouse.move(canvas_bounds['x'] + canvas_bounds['width'] / 2, canvas_bounds['y'] + canvas_bounds['height'] / 2)
    page.mouse.wheel(0, 180)
    page.wait_for_function('''(before)=>{
        const body=document.querySelector('.u27-map-canvas')?.closest('.gx-body');
        const tabs=document.querySelector('.u27-map-panel .u27-segment');
        return body&&tabs&&body.scrollTop>before&&tabs.getBoundingClientRect().top<body.getBoundingClientRect().bottom;
    }''', arg=before_wheel)
    assert_people_entry_visibility(page, 'atlas wheel return', app)
    passed('A normal wheel over the atlas returns from the map to the People list')

    hit_test_and_click(page, app.get_by_role('button', name='Share live location with a saved contact', exact=True), 'folded explicit Share')
    picker = page.locator('.nx-sheet[role="dialog"]').last
    expect(picker).to_be_visible()
    expect(picker.get_by_role('button', name='Share with J. Lee · studio, 5550102002', exact=True)).to_be_visible()
    assert page.evaluate("PeakDuo.requests.some(r=>r.event==='Maps/GetShareContacts')")
    passed('Saved contacts load only after explicit Share')
    hit_test_and_click(page, picker.get_by_role('button', name='Share with J. Lee · studio, 5550102002', exact=True), 'folded saved contact')
    sheet = page.locator('.nx-sheet[role="dialog"]').filter(has_text='Confirm the person')
    expect(sheet).to_be_visible()
    expect(sheet.get_by_text('Jordan Lee', exact=True)).to_be_visible()
    expect(sheet.get_by_text('5550102002', exact=True)).to_be_visible()
    expect(sheet.get_by_role('button', name='1 hour', exact=True)).to_have_attribute('aria-pressed', 'true')
    expect(sheet.get_by_role('button', name='1 day', exact=True)).to_be_visible()
    expect(sheet.get_by_role('button', name='Until stopped', exact=True)).to_be_visible()
    sheet.screenshot(path=str(OUT / 'find-my-recipient-confirmation.png'))
    sheet.get_by_role('button', name='1 day', exact=True).click()
    expect(sheet.get_by_role('button', name='1 day', exact=True)).to_have_attribute('aria-pressed', 'true')
    passed('Recipient confirmation names the resolved person and offers exact durations')

    sheet.get_by_role('button', name='Share live location', exact=True).click()
    expect(app.get_by_role('alert')).to_contain_text('Live location sharing requires the FiveM server.')
    assert page.evaluate("PeakDuo.requests.some(r=>r.event==='Maps/StartSharing')")
    passed('Preview StartSharing reaches the explicit read-only rejection path')
    page.keyboard.press('Escape')

    toggle = app.get_by_role('button', name='GTA map blips · On')
    hit_test_and_click(page, toggle, 'folded GTA map blips toggle')
    expect(app.get_by_role('button', name='GTA map blips · Off')).to_be_visible()
    assert page.evaluate("PeakDuo.requests.some(r=>r.event==='Maps/SetBlipPreference'&&r.data.Enabled===false)")
    hit_test_and_click(page, app.get_by_role('button', name='GTA map blips · Off'), 'folded GTA map blips toggle restore')
    expect(app.get_by_role('button', name='GTA map blips · On')).to_be_visible()
    passed('GTA blip preference can be turned off from People')

    app.get_by_role('button', name='Explore', exact=True).click()
    expect(app.get_by_role('searchbox', name='Search places or enter x, y')).to_be_visible()
    expect(app.get_by_role('button', name='Enter coordinates', exact=True)).to_be_visible()
    passed('Existing Explore search and coordinate-pin controls remain available')
    page.evaluate("document.querySelectorAll('.duo-toast').forEach(node=>node.remove())")

    display_states = [
        ('folded', 430, 932, False, 'landscape', 'full'),
        ('unfolded', 1600, 900, True, 'landscape', 'full'),
        ('portrait', 900, 1600, True, 'portrait', 'full'),
        ('split', 1920, 1200, True, 'landscape', 'split'),
    ]
    for mode, width, height, expanded, orientation, layout in display_states:
        page.set_viewport_size({'width': width, 'height': height})
        set_display_state(page, mode, expanded, orientation, layout)
        page.evaluate("PeakDuo.openApp('maps','left',{external:true})")
        if mode == 'split':
            page.evaluate("PeakDuo.openApp('settings','right',{external:true})")
            expect(page.locator('#duo .duo-screenbank:not(.duo-fold-copy) .duo-pane[data-side="left"]')).to_be_visible()
        page.get_by_role('button', name='People', exact=True).click()
        panel = page.locator('.u27-map-panel')
        expect(app.get_by_role('button', name='GTA map blips · On')).to_be_visible()
        assert_people_geometry(page, mode, panel)
        assert_people_entry_visibility(page, mode, app)
        for theme in ('light', 'dark'):
            page.evaluate('(theme)=>PeakDuo.setPhoneSetting("appearance",theme)', theme)
            page.wait_for_function('(theme)=>document.querySelector("#duo")?.dataset.theme===theme', arg=theme)
            assert page.locator('.u27-map-panel').is_visible()
            if mode == 'split' and theme == 'dark':
                continue
            pane = page.locator('#duo .duo-screenbank:not(.duo-fold-copy) .duo-pane[data-side="left"]')
            screenshot = 'find-my-split-light.png' if mode == 'split' else f'find-my-{mode}-{theme}.png'
            pane.screenshot(path=str(OUT / screenshot))
            checks.append({'name': f'{mode}/{theme} People layout screenshot', 'passed': True})
        exercise_people_actions(page, app, mode)
        page.evaluate("document.querySelectorAll('.duo-toast').forEach(node=>node.remove())")

    assert not errors, errors
    checks.append({'name': 'No unhandled browser errors', 'passed': True})
    (OUT / 'find-my-browser-results.json').write_text(json.dumps({'checks': checks, 'liveFiveM': False, 'liveMySQL': False}, indent=2))
    print(json.dumps({'checks': checks, 'liveFiveM': False, 'liveMySQL': False}, indent=2))
    browser.close()
