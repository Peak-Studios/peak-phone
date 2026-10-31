"""Capture glass and wallpaper labels over bright/dark synthetic backgrounds."""
from pathlib import Path
import os
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(os.environ.get('APPEARANCE_OUT', str(ROOT/'artifacts/ios-theme-redesign')))
OUT.mkdir(parents=True, exist_ok=True)
URL = os.environ.get('PREVIEW_URL', 'http://127.0.0.1:8794')
with sync_playwright() as pw:
    options = {'headless': True}
    if os.environ.get('CHROMIUM_PATH'): options['executable_path'] = os.environ['CHROMIUM_PATH']
    browser = pw.chromium.launch(**options)
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    page.route('**/appearance-wallpaper.svg?*', lambda route: route.fulfill(
        content_type='image/svg+xml', body='<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="600" height="900" fill="'+ ('#ffffff' if 'bright' in route.request.url else '#999999' if 'medium' in route.request.url else '#080808') +'"/></svg>'))
    page.route('**/appearance-crop.svg', lambda route: route.fulfill(content_type='image/svg+xml',body='<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="560"><rect width="1200" height="560" fill="#fff"/><rect x="380" width="440" height="560" fill="#080808"/></svg>'))
    page.route('**/appearance-unavailable.svg', lambda route: route.fulfill(status=404,body='Unavailable'))
    page.goto(URL)
    page.wait_for_function('window.PeakDuo?.preview')
    page.evaluate('PeakDuo.setPhoneSetting("motion",true)')
    for theme in ['light', 'dark']:
        for wallpaper in ['bright', 'medium', 'dark']:
            page.evaluate('(theme)=>PeakDuo.setPhoneSetting("appearance",theme)', theme)
            page.evaluate('(url)=>PeakDuo.setPhoneSetting("wallpaper",url)', URL+'/appearance-wallpaper.svg?'+wallpaper)
            page.wait_for_timeout(500)
            page.wait_for_function('document.querySelector(".duo-pane").dataset.wallpaperFallback==="false"')
            expected = 'light' if wallpaper == 'dark' else 'dark'
            assert page.locator('.duo-pane').first.get_attribute('data-wallpaper-status-ink') == expected
            page.wait_for_function('(dark)=>{const rgb=getComputedStyle(document.querySelector(".duo-clock")).color.match(/[\\d.]+/g).slice(0,3).map(Number);return (rgb.reduce((a,b)=>a+b,0)<300)===dark}',arg=expected=='dark')
            label = page.locator('.duo-clock').first.evaluate('(node)=>getComputedStyle(node).color')
            import re
            channels = list(map(float, re.findall(r'[\d.]+', label)[:3]))
            assert (sum(channels) < 300) == (expected == 'dark'), (theme, wallpaper, label)
            page.screenshot(path=str(OUT/(theme+'-home-'+wallpaper+'-wallpaper.png')))
            page.locator('.duo-pane[data-side=left] button[aria-label="Open control center"]').click()
            page.wait_for_timeout(150)
            page.screenshot(path=str(OUT/(theme+'-glass-'+wallpaper+'-wallpaper.png')))
            page.get_by_role('button',name='Close Control Center',exact=True).click()
    for theme in ['light', 'dark']:
        page.evaluate('(theme)=>PeakDuo.setPhoneSetting("appearance",theme)', theme)
        page.evaluate('PeakDuo.setPhoneSetting("brightness",100)')
        page.locator('.duo-pane[data-side=left] button[aria-label="Open control center"]').click()
        for level in [0, 10, 50, 100]:
            page.get_by_label('Phone media volume', exact=True).evaluate('(input,level)=>{input.value=String(level);input.dispatchEvent(new Event("input",{bubbles:true}));input.dispatchEvent(new Event("change",{bubbles:true}))}', level)
            page.wait_for_timeout(80)
            assert page.locator('.cc-slider-caption').filter(has_text=str(level)+'%').count() >= 1
            page.screenshot(path=str(OUT/(theme+'-volume-'+str(level)+'.png')))
        page.get_by_role('button',name='Close Control Center',exact=True).click()
    # Centered cover cropping exposes different pixels as the pane changes
    # geometry. Resizing must update ink without changing the wallpaper URL.
    page.evaluate('PeakDuo.setLayout("full");if(PeakDuo.getState().workspace.expanded)PeakDuo.fold();PeakDuo.home("left");PeakDuo.home("right")')
    page.evaluate('(url)=>PeakDuo.setPhoneSetting("wallpaper",url)',URL+'/appearance-crop.svg')
    page.wait_for_function('document.querySelector(".duo-pane[data-side=left]").dataset.wallpaperStatusInk==="light" && document.querySelector(".duo-pane[data-side=left]").dataset.wallpaperFallback==="false"')
    page.evaluate('PeakDuo.fold()')
    page.wait_for_function('document.querySelector(".duo-pane[data-side=left]").dataset.wallpaperStatusInk==="dark"')
    page.screenshot(path=str(OUT/'wallpaper-crop-expanded.png'))
    page.evaluate('PeakDuo.setLayout("split")')
    page.wait_for_function('document.querySelector(".duo-pane[data-side=left]").dataset.wallpaperStatusInk==="light"')
    page.screenshot(path=str(OUT/'wallpaper-crop-split.png'))
    page.evaluate('(url)=>PeakDuo.setPhoneSetting("wallpaper",url)',URL+'/appearance-unavailable.svg')
    page.wait_for_function('document.querySelector(".duo-pane[data-side=left]").dataset.wallpaperFallback==="true"')
    page.wait_for_timeout(150)
    page.screenshot(path=str(OUT/'wallpaper-sampling-fallback.png'))
    browser.close()
print('PASS: captured both appearances over bright/dark wallpaper for visual review')
