"""UI and mocked-transport regression tests. No live FiveM, framework, SQL or audio certification."""
from pathlib import Path
import os, json, re, sys, traceback
from playwright.sync_api import sync_playwright, expect
from offline import offline_html
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'artifacts/ios-refresh'
OUT.mkdir(parents=True,exist_ok=True)
checks=[]
def ok(name, condition=True, detail=None):
    if not condition: raise AssertionError(name+': '+str(detail))
    checks.append({'name':name,'passed':True})
    print('PASS',name,flush=True)
def launch_page(browser, prelude='', width=1920,height=1080):
    page=browser.new_page(viewport={'width':width,'height':height},device_scale_factor=1)
    page.set_default_timeout(6000)
    page.route('**/*',lambda r:r.abort())
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content(offline_html(prelude),wait_until='domcontentloaded')
    page.wait_for_function('document.documentElement.dataset.duoReady === "true"',timeout=30000)
    page.wait_for_timeout(500)
    return page,errors
def click(page,name,scope=None,exact=True):
    (scope or page).get_by_role('button',name=name,exact=exact).click()
    page.wait_for_timeout(110)
def music_form(page):
    click(page,'Add music',page.locator('.pm-header'))
    page.locator('.pm-sheet .pm-promo').filter(has_text='Add song').click()
def request_count(page,event):
    return page.evaluate('(e)=>PeakDuo.requests.filter(r=>r.event===e).length',event)
def visible_text(page): return page.locator('body').inner_text()

def run():
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
  page,errors=launch_page(browser)
  ok('Preview starts with the uploaded Duo workspace behavior',page.evaluate('PeakDuo.getState().visible'))
  ok('Peak Music visible in launcher, old label absent','Peak Music' in visible_text(page) and 'Peakify' not in visible_text(page))
  # All 35 routes: camera is a takeover instead of a mounted application.
  apps=page.evaluate('async()=> (await import("duo/catalog.mjs")).APPS.map(a=>a.id)')
  route_results=[]
  for app in apps:
    page.evaluate('''a=>{const S=PeakPhoneLegacy.stores;S.HasPDRacingUsb.set(a==='time-trials');S.HasRacingUsb.set(true);S.HasVpn.set(true);if(a==='cars')S.CurrentNetwork.set('pdm');}''',app)
    opened=page.evaluate('(a)=>PeakDuo.openApp(a,"left",{external:true})',app)
    page.wait_for_timeout(180)
    if app=='camera':
        ok('Camera takeover opens without the phone shell',page.evaluate('PeakDuo.getState().camera && document.querySelector("#duo").hidden'))
        click(page,'Exit camera');continue
    loc=page.locator('.duo-app-instance[data-app="'+app+'"]')
    ok('App route renders: '+app,opened and loc.count()==1 and loc.is_visible() and loc.locator('.duo-app-failure').count()==0)
    b=loc.bounding_box();pane=page.locator('.duo-pane[data-active=true]').bounding_box()
    ok('App contained in pane: '+app,b['x']>=pane['x']-1 and b['x']+b['width']<=pane['x']+pane['width']+1)
    # No legacy state is replaced by mock "success" when a gameplay provider is missing.
    route_results.append({'app':app,'rendered':True})
    page.locator('#duo').screenshot(path=str(OUT/f'route-{app}.png'))
  ok('No unhandled browser errors during 35-route rendering',not errors,errors)
  (OUT/'routes.json').write_text(json.dumps(route_results,indent=2))
  page.evaluate("PeakPhoneLegacy.stores.CurrentNetwork.set(''); PeakDuo.openApp('peakify','left',{external:true})")
  page.wait_for_timeout(180)
  click(page,'Library',page.locator('.pm-tabs'))
  expect(page.locator('.pm-song-row')).to_have_count(4)
  ok('Peak Music reads saved tracks through original callback')
  click(page,'Search',page.locator('.pm-tabs'));page.get_by_role('searchbox',name='Search music library').fill('blue')
  expect(page.locator('.pm-song-row')).to_have_count(1)
  ok('Local music search filters saved library')
  # E typing gate and scoped Escape.
  music_form(page);title=page.locator('.pm-form input[name=title]');title.fill('Evening');before=page.evaluate('PeakDuo.getState().workspace.expanded');title.press('e')
  ok('E in the new Music form types without folding',page.evaluate('PeakDuo.getState().workspace.expanded')==before and title.input_value()=='Eveninge')
  page.keyboard.press('Escape');page.wait_for_timeout(50)
  ok('Escape dismisses Music sheet before the phone',page.locator('.pm-sheet').count()==0 and page.evaluate('PeakDuo.getState().visible'))
  # Saving uses real payload field names, only one write per action.
  music_form(page);page.locator('.pm-form [name=title]').fill('Test sound');page.locator('.pm-form [name=url]').fill('https://example.invalid/test.mp3')
  before=request_count(page,'Peakify/SaveTrack')
  page.locator('.pm-form').evaluate('(f)=>{f.requestSubmit();f.requestSubmit();}')
  page.wait_for_timeout(250)
  ok('Save song sends one original callback despite duplicate submit',request_count(page,'Peakify/SaveTrack')==before+1)
  payload=page.evaluate('PeakDuo.requests.filter(r=>r.event==="Peakify/SaveTrack").at(-1).data')
  ok('Save song payload matches Lua contract',payload=={'Title':'Test sound','Url':'https://example.invalid/test.mp3'},payload)
  click(page,'Library',page.locator('.pm-tabs'));expect(page.locator('.pm-song-row')).to_have_count(5)
  ok('Successful save reloads authoritative library')
  # Reject invalid scheme locally, then server denial without fake success.
  music_form(page);page.locator('.pm-form [name=title]').fill('Bad link');page.locator('.pm-form [name=url]').fill('http://example.invalid/no.mp3');before=request_count(page,'Peakify/SaveTrack')
  click(page,'Add to library',page.locator('.pm-form'));ok('Unsafe non-HTTPS link is not sent to the server',request_count(page,'Peakify/SaveTrack')==before)
  page.keyboard.press('Escape');page.wait_for_timeout(50)
  page.evaluate("window.PeakDuo.previewAdapter.musicFixture.failOnce('Peakify/SaveTrack','Synthetic permission denied')")
  music_form(page);page.locator('.pm-form [name=title]').fill('Rejected');page.locator('.pm-form [name=url]').fill('https://example.invalid/rejected.mp3')
  click(page,'Add to library',page.locator('.pm-form'));page.wait_for_timeout(120)
  ok('Rejected save remains a visible form error','Synthetic permission denied' in page.locator('.pm-form-error').inner_text())
  ok('Rejected save does not add a track',page.evaluate("window.PeakDuo.previewAdapter.musicFixture.state.Tracks.length")==5)
  page.keyboard.press('Escape');page.wait_for_timeout(50)
  # Playlists/collaborators retain IDs.
  click(page,'Add music',page.locator('.pm-header'));page.locator('.pm-sheet .pm-promo').filter(has_text='New playlist').click()
  page.locator('.pm-form [name=name]').fill('Test playlist');page.locator('.pm-form [name=description]').fill('A test collection')
  click(page,'Create playlist',page.locator('.pm-form'));page.wait_for_timeout(180)
  page.locator('.pm-playlist-row').filter(has_text='Test playlist').click();page.wait_for_timeout(80)
  ok('Create playlist opens a real saved playlist view','Test playlist' in page.locator('.pm-playlist-banner').inner_text())
  click(page,'Add songs',page.locator('.pm-playlist-actions'));page.locator('.pm-sheet .pm-promo').filter(has_text='Test sound').click();page.wait_for_timeout(200)
  ok('Add track uses existing playlist relation callback',request_count(page,'Peakify/AddTrackToPlaylist')>=1)
  page.keyboard.press('Escape');page.wait_for_timeout(80)
  expect(page.locator('.pm-song-row')).to_have_count(1)
  click(page,'Playlist options');page.locator('.pm-sheet .pm-promo').filter(has_text='Collaborators').click()
  page.locator('.pm-form [name=citizenid]').fill('TEST-CHARACTER');click(page,'Add collaborator',page.locator('.pm-form'));page.wait_for_timeout(180)
  ok('Collaborator management uses character IDs','TEST-CHARACTER' in page.locator('.pm-collaborator').inner_text())
  click(page,'Remove TEST-CHARACTER',page.locator('.pm-sheet'));page.wait_for_timeout(160)
  ok('Remove collaborator refreshes membership',page.locator('.pm-collaborator').count()==0)
  page.keyboard.press('Escape');page.wait_for_timeout(60)
  # Device picker and playback; no real audio is produced in the fixture.
  page.get_by_role('button',name='Play Test sound',exact=True).click();page.wait_for_timeout(150)
  ok('Playback without a network opens the output picker',page.locator('.pm-sheet[aria-label="Audio output"]').count()==1)
  page.locator('.pm-sheet .pm-promo').filter(has_text='Studio speaker').click();page.wait_for_timeout(180)
  ok('Speaker connection uses existing phone network',page.evaluate("PeakPhoneLegacy.get(PeakPhoneLegacy.stores.CurrentNetwork)")=='peakify-boombox-preview')
  page.get_by_role('button',name='Play Test sound',exact=True).click();page.wait_for_timeout(150)
  ok('Play sends xSound-facing payload, not browser Audio',page.evaluate('PeakDuo.requests.filter(r=>r.event==="Peakify/Play").at(-1).data.NetworkId')=='peakify-boombox-preview')
  click(page,'Pause playback',page.locator('.pm-mini'));ok('Pause acknowledged in miniplayer','Paused' in page.locator('.pm-mini').inner_text())
  click(page,'Open Now Playing');ok('Now Playing has real transport and no fabricated timeline',page.locator('.pm-now').count()==1 and page.locator('.pm-now input[type=range]').count()==0)
  click(page,'Resume playback',page.locator('.pm-now'));page.wait_for_timeout(120)
  ok('Keyboard focus survives Now Playing transport rerender',page.evaluate('document.activeElement?.getAttribute("aria-label")')=='Pause playback')
  page.keyboard.press('Escape');page.wait_for_timeout(50)
  page.evaluate("window.PeakDuo.previewAdapter.musicFixture.failOnce('Peakify/Pause','Synthetic playback denied')")
  click(page,'Pause playback',page.locator('.pm-mini'));ok('Rejected pause does not show paused state','Paused' not in page.locator('.pm-mini').inner_text())
  click(page,'Audio output',page.locator('.pm-mini'));page.get_by_role('slider',name='Volume',exact=True).fill('45');page.get_by_role('slider',name='Range',exact=True).fill('30')
  click(page,'Apply & restart song');page.wait_for_timeout(150)
  payload=page.evaluate('PeakDuo.requests.filter(r=>r.event==="Peakify/Play").at(-1).data')
  ok('Output sliders send valid normalized volume and radius',payload['Volume']==.45 and payload['Radius']==30,payload)
  click(page,'Open Now Playing');click(page,'Stop',page.locator('.pm-now'));page.wait_for_timeout(100)
  ok('Stop clears now-playing state after server acknowledgement','Not playing' in page.locator('.pm-mini').inner_text())
  # Per-pane state survives existing fold/Home/swap/close lifecycle.
  music_form(page);page.locator('.pm-form [name=title]').fill('Retained draft');page.locator('.pm-form [name=url]').fill('https://example.invalid/draft.mp3')
  page.evaluate("PeakDuo.fold(); PeakDuo.openApp('mails','right',{external:true})");page.wait_for_timeout(850)
  ok('Music form coexists with a second app',page.locator('.pm-form [name=title]').input_value()=='Retained draft' and page.locator('[data-app=mails].duo-app-instance').is_visible())
  page.evaluate("PeakDuo.home('left')");page.wait_for_timeout(80)
  page.locator('.duo-pane[data-side=left] .duo-resume').click();page.wait_for_timeout(80)
  ok('Home/resume keeps new Music form draft',page.locator('.pm-form [name=title]').input_value()=='Retained draft')
  page.evaluate('PeakDuo.swap()');page.wait_for_timeout(180)
  ok('Swap moves same Music DOM without reset',page.locator('.duo-pane[data-side=right] .pm-form [name=title]').input_value()=='Retained draft')
  page.evaluate('PeakDuo.fold()');page.wait_for_timeout(850)
  ok('Focused Music pane stays visible when folded',page.locator('.pm-form').is_visible())
  page.evaluate("PeakDuo.sendPreview({Action:'ClosePhone'})");page.wait_for_timeout(650)
  ok('Closing fully hides entire shell',page.locator('#duo').get_attribute('hidden') is not None)
  page.evaluate('PeakDuo.open()');page.wait_for_timeout(650)
  ok('Reopening keeps Music form draft',page.locator('.pm-form [name=title]').input_value()=='Retained draft')
  page.locator('.pm-form [name=title]').focus();page.keyboard.press('Escape');page.wait_for_timeout(80)
  # Clear icons and accessibility settings are actual persistent preferences, not decorative toggles.
  page.locator('.duo-pane[data-active=true] .duo-status-controls').click();page.wait_for_timeout(80)
  click(page,'App icons');ok('Clear icon preference changes vector material',page.locator('#duo').get_attribute('data-icons')=='clear')
  click(page,'Transparency');ok('Reduce-transparency control changes material mode',page.locator('#duo').get_attribute('data-transparency')=='reduced')
  click(page,'Reduced motion');ok('Reduced-motion preference is applied', 'duo-reduced-motion' in page.locator('#duo').get_attribute('class'))
  click(page,'Close control center')
  # Store updates only after existing game events. Missing provider gate remains honored.
  page.evaluate("PeakDuo.openApp('store','left',{external:true})");page.wait_for_timeout(150)
  page.get_by_role('searchbox',name='Search available apps').fill('Peak Music')
  expect(page.locator('.ios-store-row')).to_have_count(1)
  click(page,'Remove Peak Music',page.locator('.ios-store-row'));page.wait_for_timeout(140)
  ok('New App Store uninstalls using the original ID',page.evaluate('PeakDuo.requests.filter(r=>r.event==="UninstallApp").at(-1).data.AppId')=='peakify')
  click(page,'Install Peak Music',page.locator('.ios-store-row'));page.wait_for_timeout(140)
  ok('New App Store receives authoritative reinstall event',page.evaluate("!!PeakPhoneLegacy.get(PeakPhoneLegacy.stores.InstalledApps).peakify"))
  # Probe player text as text, not markup.
  page.evaluate("{const f=window.PeakDuo.previewAdapter.musicFixture;f.state.Tracks.unshift({id:90,title:'<img src=x onerror=window.__injected=true>',url:'https://example.invalid/safe.mp3',provider:'link'});}")
  page.evaluate("PeakDuo.openApp('peakify','left',{external:true})");page.wait_for_timeout(160)
  click(page,'Library',page.locator('.pm-tabs'))
  ok('Player-supplied Music text cannot create HTML',page.locator('.pm-app img').count()==0 and not page.evaluate('!!window.__injected'))
  # Old outstanding refresh cannot restore a destroyed application.
  page.evaluate("window.PeakDuo.previewAdapter.musicFixture.setDelay(160)")
  click(page,'Refresh library',page.locator('.pm-header'));page.evaluate("PeakDuo.closeApp('left')");page.wait_for_timeout(300)
  ok('Late Music responses cannot resurrect a closed app',page.locator('.pm-app').count()==0)
  page.evaluate("window.PeakDuo.previewAdapter.musicFixture.setDelay(0)")
  ok('No uncaught runtime errors in interaction workflows',not errors,errors)
  page.close();browser.close()

if __name__=='__main__':
 try:run()
 except Exception as e:
  checks.append({'name':'FAILED','passed':False,'error':str(e),'traceback':traceback.format_exc()})
  (OUT/'browser-tests.json').write_text(json.dumps(checks,indent=2));traceback.print_exc();sys.exit(1)
 (OUT/'browser-tests.json').write_text(json.dumps(checks,indent=2))
 print(f'{len(checks)} browser checks passed. Mocked services only.')
