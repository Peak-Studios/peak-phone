"""Run the physical display and foldable-orientation contract in Chromium."""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
URL = os.environ.get('PREVIEW_URL', 'http://127.0.0.1:8791')
source = (Path(__file__).with_name('browser-contract.mjs')).read_text(encoding='utf-8')
source = source.replace(
    "import {displaySnapshot,encodeDisplay,createScreenCapture,captureIdentityKey,createCaptureLifecycle} from '../../web/public/duo/screen-capture.mjs';",
    '',
).replace('export async function runDisplayContract()', 'async function runDisplayContract()')

with sync_playwright() as playwright:
    options = {'headless': True}
    if os.environ.get('CHROMIUM_PATH'):
        options['executable_path'] = os.environ['CHROMIUM_PATH']
    browser = playwright.chromium.launch(**options)
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda message: print(message.text, flush=True) if message.text.startswith('Hardware diagnostic') else None)
    page.goto(URL, wait_until='domcontentloaded')
    page.wait_for_function('window.PeakDuo?.preview')
    try:
        result = page.evaluate('''async source => {
      const capture = await import('/duo/screen-capture.mjs');
      const run = new Function('displaySnapshot', 'encodeDisplay', 'createScreenCapture', 'captureIdentityKey', 'createCaptureLifecycle',
        source + '\\nreturn runDisplayContract();');
      return await run(capture.displaySnapshot, capture.encodeDisplay, capture.createScreenCapture, capture.captureIdentityKey, capture.createCaptureLifecycle);
        }''', source)
    except Exception:
        print('Physical contract last checkpoint:', page.evaluate('window.contractProgress'), flush=True)
        raise
    page.evaluate('''async()=>{
      PeakDuo.sendPreview({Action:'Duo/Reset'});await PeakDuo.open();
      const root=document.querySelector('#duo');
      const settle=async()=>{const end=performance.now()+4000;while(root.classList.contains('duo-folding')||root.classList.contains('duo-orientation-turning')){if(performance.now()>end)throw Error('Switcher setup pose did not settle');await new Promise(requestAnimationFrame);}};
      if(!PeakDuo.getState().workspace.expanded){PeakDuo.fold();await settle();}
      if(root.dataset.orientation!=='portrait'){root.querySelector('.duo-orientation-button').click();await settle();}
      PeakDuo.setLayout('full');await PeakDuo.openApp('messages','left');await PeakDuo.openApp('mails','left');await PeakDuo.openApp('calendar','left');
    }''')
    page.wait_for_function("PeakDuo.getState().workspace.panes.left.app==='calendar'")
    page.wait_for_timeout(650)
    def swipe_home_indicator():
        handle = page.locator('.duo-pane[data-active="true"] .duo-home-gesture')
        bounds = handle.bounding_box()
        x, y = bounds['x'] + bounds['width'] / 2, bounds['y'] + bounds['height'] / 2
        page.mouse.move(x, y)
        page.mouse.down()
        page.mouse.move(x, y - 180, steps=5)
        page.wait_for_timeout(175)
        page.mouse.up()
        page.wait_for_function('PeakDuo.getState().switcherOpen')

    swipe_home_indicator()
    page.locator('.duo-switcher-card[data-app="messages"] .duo-switcher-select').click(force=True)
    page.wait_for_function("!PeakDuo.getState().switcherOpen && PeakDuo.getState().workspace.panes.left.app==='messages'")
    result['results'].append('real pointer tap resumes the selected app card')
    result['passed'] += 1
    swipe_home_indicator()
    page.locator('.duo-switcher-card[data-app="calendar"] .duo-switcher-preview-hit').click(force=True)
    page.wait_for_function("!PeakDuo.getState().switcherOpen && PeakDuo.getState().workspace.panes.left.app==='calendar'")
    result['results'].append('real pointer tap on the preview body resumes its app')
    result['passed'] += 1
    swipe_home_indicator()
    page.locator('.duo-switcher-card[data-app="mails"] .duo-switcher-dismiss').click(force=True)
    page.wait_for_function("!PeakDuo.getState().apps.includes('mails') && !document.querySelector('.duo-switcher-card[data-app=\"mails\"]')")
    result['results'].append('real pointer tap dismisses the selected app card')
    result['passed'] += 1
    page.locator('.duo-switcher-done').click(force=True)
    page.wait_for_function('!PeakDuo.getState().switcherOpen')
    page.evaluate('''async()=>{
      PeakDuo.sendPreview({Action:'Duo/Reset'});await PeakDuo.open();
      const root=document.querySelector('#duo');
      if(!PeakDuo.getState().workspace.expanded){PeakDuo.fold();await new Promise(resolve=>setTimeout(resolve,850));}
      if(root.dataset.orientation!=='portrait'){root.querySelector('.duo-orientation-button').click();await new Promise(resolve=>setTimeout(resolve,850));}
      PeakDuo.setLayout('full');await PeakDuo.openApp('calls','left');
    }''')
    page.wait_for_function("PeakDuo.getState().workspace.panes.left.app==='calls' && document.querySelector('.duo-app-instance[data-app=\"calls\"] [data-tab=\"keypad\"]')")
    page.locator('.duo-app-instance[data-app="calls"] [data-tab="keypad"]').click(force=True)
    page.keyboard.press('1')
    page.wait_for_function("document.querySelector('.duo-app-instance[data-app=\"calls\"] .nx-dial-number').value==='1'")
    assert page.evaluate("PeakDuo.isAppInteractive('calls')")
    result['results'].append('active Calls keypad accepts its normal keyboard shortcuts')
    result['passed'] += 1
    swipe_home_indicator()
    assert not page.evaluate("PeakDuo.isAppInteractive('calls')")
    before_dial_requests = page.evaluate("PeakDuo.requests.filter(request=>request.event==='Contacts/Call').length")
    page.keyboard.press('2')
    page.keyboard.press('Enter')
    page.wait_for_timeout(80)
    assert page.locator('.duo-app-instance[data-app="calls"] .nx-dial-number').input_value() == '1'
    assert page.evaluate("PeakDuo.requests.filter(request=>request.event==='Contacts/Call').length") == before_dial_requests
    result['results'].append('open switcher blocks Calls keypad digits and dialing shortcuts')
    result['passed'] += 1
    page.evaluate("PeakDuo.openApp('calculator','left')")
    page.wait_for_function("PeakDuo.getState().workspace.panes.left.app==='calculator'")
    page.keyboard.press('3')
    calculator_expression = page.locator('.duo-pane .duo-app-instance[data-app="calculator"] .gx-calc-expression')
    before_calculator = calculator_expression.inner_text()
    assert before_calculator.strip() == '3'
    swipe_home_indicator()
    assert not page.evaluate("PeakDuo.isAppInteractive('calculator')")
    page.keyboard.press('4')
    assert calculator_expression.inner_text() == before_calculator
    result['results'].append('open switcher blocks calculator shortcuts in the background')
    result['passed'] += 1
    closing = page.evaluate('''()=>{
      window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
      const closing=document.querySelector('#duo').dataset.switcher==='closing';
      document.dispatchEvent(new KeyboardEvent('keydown',{key:'5',bubbles:true,cancelable:true}));
      return {closing,interactive:PeakDuo.isAppInteractive('calculator'),expression:document.querySelector('.duo-pane .duo-app-instance[data-app="calculator"] .gx-calc-expression').textContent};
    }''')
    assert closing['closing'] and not closing['interactive'] and closing['expression'] == before_calculator
    result['results'].append('switcher exit motion continues blocking background app shortcuts')
    result['passed'] += 1
    page.wait_for_function("document.querySelector('.duo-app-switcher').hidden")
    assert not errors, errors
    result['runtimeErrors'] = errors
    print(json.dumps(result, indent=2))
    browser.close()
