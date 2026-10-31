"""Exercise dismissal without interfering with controls on the synthetic preview."""
from pathlib import Path
import json
import os
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
URL = os.environ.get('PREVIEW_URL', 'http://127.0.0.1:8797')
OUT = Path(os.environ.get('CONTROL_CENTER_OUT', str(ROOT / 'artifacts/control-center-polish')))
OUT.mkdir(parents=True, exist_ok=True)
results, errors = [], []

def assert_panel_fits(center, theme, view):
    panel = center.bounding_box()
    assert panel, f'Control Center has no rendered bounds in {view} {theme} mode'
    for selector in ['.cc-status', '.cc-grid', '.cc-dismiss']:
        bounds = center.locator(selector).bounding_box()
        assert bounds, f'{selector} has no rendered bounds in {view} {theme} mode'
        assert bounds['y'] >= panel['y'] - 1, f'{selector} starts above the phone screen in {view} {theme} mode'
        assert bounds['y'] + bounds['height'] <= panel['y'] + panel['height'] + 1, f'{selector} clips below the phone screen in {view} {theme} mode'
    assert center.evaluate('el => el.scrollHeight <= el.clientHeight + 1'), f'Control Center overflows the phone screen in {view} {theme} mode'

with sync_playwright() as pw:
    options = {'headless': True}
    if os.environ.get('CHROMIUM_PATH'):
        options['executable_path'] = os.environ['CHROMIUM_PATH']
    browser = pw.chromium.launch(**options)
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(URL)
    page.wait_for_function('window.PeakDuo?.preview')
    page.evaluate('PeakDuo.setPhoneSetting("motion",true)')
    opener = page.locator('.duo-pane[data-side=left] button[aria-label="Open control center"]')
    center = page.get_by_role('dialog', name='Control Center', exact=True)
    page.evaluate("PeakDuo.openApp('messages','left')")
    page.get_by_role('button', name='Open Jordan Lee').click()
    message_compose = page.locator('.duo-app-instance[data-app="messages"] .gx-compose-bar textarea')
    expect(message_compose).to_be_visible()
    message_compose.focus()
    opener.dispatch_event('click')
    expect(center).to_be_visible()
    assert page.evaluate('''()=>{
      const pane=document.querySelector('.duo-pane[data-side="left"]'),dialog=document.querySelector('.duo-control-center');
      return pane.inert&&pane.getAttribute('aria-hidden')==='true'&&dialog.contains(document.activeElement);
    }'''), 'Control Center must inert and hide the underlying Messages pane from keyboard and assistive technology'
    message_compose.evaluate('(node)=>node.focus()')
    assert center.evaluate('el=>el.contains(document.activeElement)'), 'programmatic focus must stay inside Control Center'
    page.keyboard.press('Escape')
    expect(center).to_be_hidden()
    expect(message_compose).to_be_focused()
    results.append({'case': 'background-is-inert-and-dismissal-restores-messages-focus'})
    opener.click()
    expect(center).to_be_visible()
    center.get_by_role('button', name='Open Settings', exact=True).click()
    expect(center).to_be_hidden()
    expect(page.locator('.duo-app-instance[data-app="settings"]')).to_be_visible()
    results.append({'case': 'top-settings-action-opens-settings'})
    for theme in ['light', 'dark']:
        page.evaluate('''async theme=>{
          await PeakDuo.setPhoneSetting('transparency','regular');
          PeakDuo.setLayout('full');
          if(PeakDuo.getState().workspace.expanded)PeakDuo.fold();
          await PeakDuo.setPhoneSetting('appearance',theme);
        }''', theme)
        opener.click()
        expect(center).to_be_visible()
        assert_panel_fits(center, theme, 'folded')
        rail = center.get_by_role('navigation', name='Control groups')
        assert rail.locator('button').count() == 4, 'Control Center has four group navigation controls'
        rail.get_by_role('button', name='Go to Media').click()
        expect(center.locator('.cc-media-track')).to_be_focused()
        expect(rail.get_by_role('button', name='Go to Media')).to_have_attribute('aria-current', 'true')
        results.append({'theme': theme, 'case': 'right-rail-focuses-control-group'})
        assert center.evaluate('''el => [...el.querySelectorAll('.cc-heading,.cc-network-label,.cc-media-titles strong,.cc-focus strong,.cc-focus-caption,.cc-slider-caption,.cc-utility strong,.cc-feedback')]
          .every(label => parseFloat(getComputedStyle(label).fontSize) >= 11)'''), f'Control labels are too small in {theme} mode'
        assert center.evaluate('''el => {
          const strong=el.querySelector('.cc-media-titles strong'),secondary=el.querySelector('.cc-media-titles span');
          const disabled=[...el.querySelectorAll('.cc-media-actions button:disabled')];
          const rgb=node=>getComputedStyle(node).color.match(/[\\d.]+/g)?.slice(0,3).map(Number)??[];
          return rgb(strong).every((value,i)=>value>=[248,249,252][i]-1)
            && rgb(secondary).every(value=>value>=244)
            && disabled.length>=2&&disabled.every(button=>rgb(button.querySelector('.duo-icon')).every((value,i)=>value>=[197,206,222][i]-1));
        }'''), f'Media labels and disabled controls need light ink over the dark-glass card in {theme} mode'
        assert center.evaluate('''el => [...el.querySelectorAll('button .duo-icon')].every(icon => {
          const i=icon.getBoundingClientRect(), b=icon.parentElement.getBoundingClientRect();
          return i.width > 0 && i.height > 0 && i.left >= b.left - 1 && i.right <= b.right + 1 && i.top >= b.top - 1 && i.bottom <= b.bottom + 1;
        })'''), f'An icon is clipped by its control in {theme} mode'
        page.screenshot(path=str(OUT / (theme + '-control-center.png')))
        # A real button click must run its action, rather than dismiss the sheet.
        mode = center.get_by_role('button', name='Dark Mode', exact=True)
        before = page.locator('#duo').get_attribute('data-theme')
        mode.click()
        expect(center).to_be_visible()
        expect(page.locator('#duo')).to_have_attribute('data-theme', 'dark' if before == 'light' else 'light')
        mode.click()
        expect(center).to_be_visible()
        expect(page.locator('#duo')).to_have_attribute('data-theme', before)
        mode.focus()
        page.keyboard.press('Space')
        expect(center).to_be_visible()
        expect(page.locator('#duo')).to_have_attribute('data-theme', 'dark' if before == 'light' else 'light')
        expect(mode).to_be_focused()
        page.keyboard.press('Space')
        expect(center).to_be_visible()
        expect(page.locator('#duo')).to_have_attribute('data-theme', before)
        results.append({'theme': theme, 'case': 'keyboard-control-action-does-not-dismiss-or-lose-focus'})
        # Find actual module whitespace rather than relying on hard-coded pixels.
        blank = center.locator('.cc-grid').evaluate('''grid=>{
          const r=grid.getBoundingClientRect();
          for(let y=r.top+3;y<r.bottom-3;y+=4) for(let x=r.left+3;x<r.right-3;x+=4){
            const n=document.elementFromPoint(x,y);
            if(n&&grid.contains(n)&&!n.closest('button,input,select,textarea,a,label,[role=button]'))return {x,y};
          }
          throw Error('Control Center has no reachable empty space');
        }''')
        slider = center.get_by_role('slider', name='Display brightness', exact=True)
        box = slider.bounding_box()
        page.mouse.move(box['x'] + box['width']/2, box['y'] + box['height']/2)
        page.mouse.down()
        page.mouse.move(blank['x'], blank['y'], steps=8)
        page.mouse.up()
        expect(center).to_be_visible()
        results.append({'theme': theme, 'case': 'button-and-slider-release-do-not-dismiss', 'layout': 'fits-phone', 'icons': 'contained'})
        # A separate intentional click on that same empty space must dismiss.
        page.mouse.click(blank['x'], blank['y'])
        expect(center).to_be_hidden()
        expect(opener).to_be_focused()
        results.append({'theme': theme, 'case': 'empty-module-space-dismisses-and-restores-focus'})
        opener.click()
        expect(center).to_be_visible()
        mode_box = mode.bounding_box()
        page.mouse.move(mode_box['x'] + mode_box['width']/2, mode_box['y'] + mode_box['height']/2)
        page.mouse.down()
        page.mouse.move(10, 10, steps=8)
        page.mouse.up()
        expect(center).to_be_visible()
        page.mouse.click(blank['x'], blank['y'])
        expect(center).to_be_hidden()
        expect(opener).to_be_focused()
        results.append({'theme': theme, 'case': 'release-outside-control-does-not-block-next-empty-dismissal'})
        opener.click()
        expect(center).to_be_visible()
        page.evaluate("""()=>{
          window.__ccPointerId=null;
          window.addEventListener('pointerdown',event=>window.__ccPointerId=event.pointerId,{capture:true,once:true});
        }""")
        mode_box = mode.bounding_box()
        page.mouse.move(mode_box['x'] + mode_box['width']/2, mode_box['y'] + mode_box['height']/2)
        page.mouse.down()
        page.evaluate("id=>window.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerId:id}))", page.evaluate('window.__ccPointerId'))
        page.mouse.up()
        expect(center).to_be_visible()
        page.mouse.click(blank['x'], blank['y'])
        expect(center).to_be_hidden()
        expect(opener).to_be_focused()
        results.append({'theme': theme, 'case': 'pointer-cancel-does-not-block-next-empty-dismissal'})
        opener.click()
        expect(center).to_be_visible()
        page.keyboard.press('Escape')
        expect(center).to_be_hidden()
        expect(opener).to_be_focused()
        results.append({'theme': theme, 'case': 'escape-dismisses-and-restores-focus'})
        for view in ['folded', 'unfolded', 'split']:
            for transparency in ['regular', 'reduced']:
                page.evaluate('''async ({view,transparency})=>{
                  await PeakDuo.setPhoneSetting('transparency',transparency);
                  if(view==='split')PeakDuo.setLayout('split');
                  else {
                    PeakDuo.setLayout('full');
                    const expanded=PeakDuo.getState().workspace.expanded;
                    if((view==='unfolded')!==expanded)PeakDuo.fold();
                  }
                }''', {'view': view, 'transparency': transparency})
                opener.click()
                expect(center).to_be_visible()
                assert_panel_fits(center, theme, view)
                if transparency == 'reduced':
                    assert center.evaluate('''el => [...el.querySelectorAll('.cc-connectivity,.cc-media,.cc-focus,.cc-slider,.cc-utility,.cc-circle,.cc-close')]
                      .every(surface => {
                        const c=getComputedStyle(surface).backgroundColor.match(/[\\d.]+/g)||[];
                        return Number(c[3] ?? 1) >= .99 && getComputedStyle(surface).backgroundImage === 'none';
                      })'''), f'Reduced transparency leaves translucent Control Center surfaces in {view} {theme} mode'
                page.keyboard.press('Escape')
                expect(center).to_be_hidden()
                expect(opener).to_be_focused()
                results.append({'theme': theme, 'view': view, 'transparency': transparency, 'case': 'fits-and-restores-focus'})
    opener.click()
    expect(center).to_be_visible()
    center.get_by_role('button', name='Turn phone off', exact=True).click()
    expect(page.locator('#duo')).to_have_attribute('data-powered', 'false')
    page.get_by_role('button', name='Turn phone on', exact=True).click()
    expect(page.locator('#duo')).to_have_attribute('data-powered', 'true')
    expect(page.locator('.duo-lock-screen')).to_be_visible()
    results.append({'case': 'power-control-off-on-requires-device-unlock'})
    browser.close()
assert not errors, errors
(OUT / 'browser-results.json').write_text(json.dumps({'checks': results, 'pageErrors': errors}, indent=2), encoding='utf-8')
print('PASS:', len(results), 'Control Center dismissal checks')
