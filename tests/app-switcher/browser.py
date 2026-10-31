"""Check actual switcher capture geometry and passive previews in the served fixture."""
import os
from playwright.sync_api import sync_playwright


with sync_playwright() as playwright:
    launch = {'headless': True}
    if os.environ.get('CHROMIUM_PATH'):
        launch['executable_path'] = os.environ['CHROMIUM_PATH']
    browser = playwright.chromium.launch(**launch)
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(os.environ.get('PREVIEW_URL', 'http://127.0.0.1:8080/'), wait_until='domcontentloaded')
    page.wait_for_function('window.PeakDuo?.preview === true')
    page.evaluate("""async () => {
        const settle = async () => {
            await Promise.allSettled(document.getAnimations().filter(animation =>
                Number.isFinite(animation.effect?.getComputedTiming().endTime)).map(animation => animation.finished));
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        };
        PeakDuo.setLayout('full');
        await PeakDuo.openApp('messages'); await settle();
        PeakDuo.home('left'); await settle();
        await PeakDuo.openApp('documents'); await settle();
        const handle = document.querySelector('.duo-home-gesture'), rect = handle.getBoundingClientRect();
        for (const [type, y] of [['pointerdown', rect.y + 5], ['pointermove', rect.y - 400], ['pointerup', rect.y - 400]]) {
            handle.dispatchEvent(new PointerEvent(type, {bubbles: true, pointerId: 90, clientX: rect.x + rect.width / 2, clientY: y}));
        }
        await settle();
    }""")
    page.get_by_role('dialog', name='App Switcher', exact=True).wait_for(state='visible')
    geometry = """() => [...document.querySelectorAll('.duo-switcher-preview-canvas')].map(canvas => {
        const node = canvas.firstElementChild, host = canvas.parentElement;
        const width = Number(node.dataset.switcherWidth), height = Number(node.dataset.switcherHeight);
        const rect = node.getBoundingClientRect(), frame = host.getBoundingClientRect();
        const scaleX = rect.width / width, scaleY = rect.height / height;
        return {app: node.dataset.app, canvas:canvas.getBoundingClientRect().toJSON(), canvasStyle:canvas.getAttribute('style'), capturedSize:[width,height], offset:node.offsetTop, margin:getComputedStyle(node).margin, frameClient:[host.clientWidth,host.clientHeight], rect: rect.toJSON(), frame: frame.toJSON(), dimmed: [...node.querySelectorAll('[data-switcher-enabled=true]')].filter(control=>Number(getComputedStyle(control).opacity)!==1).map(control=>({tag:control.tagName, cls:control.className, opacity:getComputedStyle(control).opacity})), captured: width > 0 && height > 0,
            proportional: Math.abs(scaleX - scaleY) < .002,
            fits: rect.left >= frame.left - 1 && rect.top >= frame.top - 1 && rect.right <= frame.right + 1 && rect.bottom <= frame.bottom + 1,
            passive: !node.querySelector('script,iframe,object,embed,form,[contenteditable],[onclick],[id]'),
            focusSafe: [...node.querySelectorAll('button,input,textarea,select,[tabindex]')].every(control => control.tabIndex === -1),
            visibleControls: [...node.querySelectorAll('[data-switcher-enabled=true]')].every(control => Number(getComputedStyle(control).opacity) === 1)
        };
    })"""
    for label, viewport in [('initial', None), ('small', {'width': 1000, 'height': 700}), ('wide', {'width': 1440, 'height': 900})]:
        if viewport:
            page.set_viewport_size(viewport)
            page.wait_for_timeout(400)
        results = page.evaluate(geometry)
        assert len(results) == 2, (label, results)
        assert all(all(result[key] for key in ['captured', 'proportional', 'fits', 'passive', 'focusSafe', 'visibleControls']) for result in results), (label, results)
    page.get_by_role('button', name='Return to Notes', exact=True).click()
    page.wait_for_function('!PeakDuo.getState().switcherOpen')
    assert page.locator('.nx-notes:not([data-switcher-preview])').count() >= 1
    assert not errors, errors
    assert page.evaluate('PeakDuo.getState().errors.length') == 0
    print('Switcher checks passed: proportional captures, responsive bounds, passive previews, readable controls, and resume.')
    browser.close()
