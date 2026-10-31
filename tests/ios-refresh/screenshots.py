"""Capture the actual delivered interface with explicitly synthetic preview data."""
from pathlib import Path
import os
from playwright.sync_api import sync_playwright
from offline import offline_html
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'artifacts/ios-refresh'
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 pg=b.new_page(viewport={'width':1920,'height':1080},device_scale_factor=1);pg.set_default_timeout(6000);pg.route('**/*',lambda r:r.abort())
 pg.set_content(offline_html());pg.wait_for_function('document.documentElement.dataset.duoReady==="true"');pg.wait_for_timeout(700)
 pg.screenshot(path=str(OUT/'preview-home.png'))
 pg.locator('#duo').screenshot(path=str(OUT/'phone-home.png'))
 pg.evaluate("PeakDuo.fold();PeakDuo.openApp('peakify','left',{external:true});PeakDuo.openApp('mails','right',{external:true})");pg.wait_for_timeout(850)
 pg.screenshot(path=str(OUT/'preview-expanded.png'))
 pg.locator('#duo').screenshot(path=str(OUT/'phone-expanded.png'))
 pg.evaluate("PeakPhoneLegacy.stores.CurrentNetwork.set('peakify-boombox-preview')");pg.get_by_role('button',name='Library',exact=True).click();pg.wait_for_timeout(100);pg.get_by_role('button',name='Play Coastline',exact=True).click();pg.wait_for_timeout(150)
 pg.get_by_role('button',name='Open Now Playing',exact=True).click();pg.wait_for_timeout(6200)
 pg.screenshot(path=str(OUT/'preview-now-playing.png'))
 pg.locator('#duo').screenshot(path=str(OUT/'phone-now-playing.png'))
 pg.close();b.close()
print('Saved current UI screenshots; synthetic data, no streamed audio.')
