"""Actual phone UI + mocked YouTube player and catalog. No live playback certification.
Requires Python Playwright and Chromium (CHROMIUM_PATH may override the executable).
"""
from pathlib import Path
import json
import os
import sys
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tests/ios-refresh'))
from offline import offline_html
MOCK = r"""
window.__players=[];
window.YT={Player:class {
 constructor(frame,options){this.frame=frame;this.events=options.events;this.state=-1;this.volume=100;this.dead=false;__players.push(this);setTimeout(()=>{if(!this.dead)this.events.onReady({target:this})},0);}
 playVideo(){this.state=1;this.events.onStateChange({data:1,target:this});}
 pauseVideo(){this.state=2;this.events.onStateChange({data:2,target:this});}
 getPlayerState(){return this.state;}
 setVolume(v){this.volume=v;}
 destroy(){this.dead=true;this.state=0;this.frame.remove();}
}};
"""

def run():
    checks = []
    def check(name, value=True):
        assert value, name
        checks.append(name); print('PASS', name, flush=True)
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'), headless=True, args=['--no-sandbox'])
        page = browser.new_page(viewport={'width':1920,'height':1080})
        page.set_default_timeout(8000)
        page.route('**/*', lambda r: r.abort())
        errors=[];page.on('pageerror',lambda e: errors.append(str(e)))
        storage="const memory=new Map();Object.defineProperty(window,'localStorage',{value:{getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k)}});"
        page.set_content(offline_html(storage + MOCK), wait_until='domcontentloaded', timeout=40000)
        page.wait_for_function('window.PeakDuo && document.documentElement.dataset.duoReady === "true"')
        page.evaluate("PeakDuo.openApp('peakify')")
        page.get_by_role('button',name='Search',exact=True).click()
        check('Catalog requires privacy consent before search',page.get_by_role('searchbox',name='Search songs or artists').count()==0)
        page.get_by_role('button',name='Enable YouTube search',exact=True).click()
        check('Terms and privacy links are available',page.get_by_role('link',name='YouTube Terms of Service').count()==1 and page.get_by_role('link',name='Google Privacy Policy').count()==1)
        page.get_by_role('button',name='Agree and enable',exact=True).click()
        field=page.get_by_role('searchbox',name='Search songs or artists')
        field.fill('Fein');page.wait_for_selector('.pm-catalog-row')
        check('Fein shows Travis Scott FE!N first', 'Travis Scott - FE!N' in page.locator('.pm-catalog-row').first.inner_text())
        check('Search response preserves input focus',field.evaluate('(e)=>e===document.activeElement'))
        page.locator('.pm-catalog-row').first.get_by_role('button',name='Save Travis Scott',exact=False).click()
        page.wait_for_selector('.pm-catalog-row button[aria-label="Saved to library"]')
        check('Saving needs no typed URL or title',page.evaluate("(()=>{const f=window.PeakDuo.previewAdapter.musicFixture;return f.state.Tracks.some(t=>t.title.includes('FE!N')&&t.url==='https://www.youtube.com/watch?v=demoTrack01')})()"))
        page.locator('.pm-catalog-row').first.get_by_role('button',name='Options for',exact=False).click()
        page.locator('.pm-sheet').get_by_role('button',name='Add to playlist',exact=False).click()
        page.locator('.pm-sheet').get_by_role('button',name='After hours',exact=False).click()
        page.wait_for_function("document.querySelector('.pm-sheet-shade').hidden")
        check('Catalog songs reuse owned playlist contracts',page.evaluate("(()=>{const f=window.PeakDuo.previewAdapter.musicFixture;return f.state.Playlists[0].tracks.some(t=>t.url.includes('demoTrack01'))})()"))
        field.fill('morphiniya 17');page.wait_for_timeout(800)
        check('Morphiniya17 resolves close spelling first',"Lmorphiniya 17" in page.locator('.pm-catalog-row').first.inner_text())
        page.locator('.pm-catalog-row').first.locator('.pm-song-main').click()
        page.wait_for_selector('.pm-youtube-frame');page.wait_for_timeout(350)
        check('Official iframe URL, JS API and explicit referrer attribute',page.locator('.pm-youtube-frame').evaluate("e=>e.src.startsWith('https://www.youtube.com/embed/demoTrack02?')&&e.src.includes('enablejsapi=1')&&e.getAttribute('referrerpolicy')==='strict-origin-when-cross-origin'"))
        box=page.locator('.pm-youtube-frame').bounding_box();check('Player viewport meets 200x200 minimum',box['width']>=200 and box['height']>=200)
        page.evaluate('__players.at(-1).playVideo()');page.wait_for_timeout(300)
        check('Visible playback remains active',page.evaluate('__players.at(-1).state===1'))
        page.locator('.duo-volume-down').click();page.wait_for_timeout(100)
        check('PR6 side volume controls the iframe',page.evaluate('__players.at(-1).volume===65'))
        page.evaluate('PeakDuo.home()');page.wait_for_timeout(250)
        check('Going home pauses rather than background-playing',page.evaluate('__players.at(-1).state===2'))
        page.evaluate("PeakDuo.openApp('peakify')");page.wait_for_timeout(350)
        check('Returning does not auto-resume',page.evaluate('__players.at(-1).state===2'))
        page.evaluate('__players.at(-1).events.onError({data:153})')
        check('CEF identity errors are actionable', '153' in page.locator('.pm-youtube-status').inner_text())
        page.locator('.pm-sheet-header button').click();check('Closing destroys the iframe',page.locator('.pm-youtube-frame').count()==0 and page.evaluate('__players.at(-1).dead'))
        page.locator('.pm-catalog-row').first.locator('.pm-song-main').click();page.wait_for_selector('.pm-youtube-frame');page.wait_for_timeout(300)
        page.locator('.duo-side-power').click();page.wait_for_timeout(150)
        check('Power-off destroys player and app',page.locator('.pm-youtube-frame').count()==0 and page.evaluate('__players.at(-1).dead'))
        page.locator('.duo-side-power').click();page.wait_for_timeout(300)
        page.evaluate("PeakDuo.openApp('peakify')");page.wait_for_timeout(250)
        page.get_by_role('button',name='Search',exact=True).click()
        page.evaluate("window.PeakDuo.previewAdapter.musicFixture.failOnce('Peakify/Search','Catalog key not configured')")
        page.get_by_role('searchbox',name='Search songs or artists').fill('test failure')
        page.wait_for_timeout(850)
        check('Catalog failure is shown, not replaced by fictional success','Catalog key not configured' in page.locator('.pm-search-results').inner_text())
        check('YouTube never goes through xSound/world RPC',page.evaluate("!window.PeakDuo.requests.some(r=>r.event==='Peakify/Play'&&r.data.Url.includes('youtube'))"))
        check('No uncaught browser exceptions',not errors)
        browser.close()
    print(json.dumps({'passed':len(checks),'liveFiveM':False,'liveYouTube':False}))

if __name__ == '__main__': run()
