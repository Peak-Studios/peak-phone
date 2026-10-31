"""CEF hotfix regression checks in desktop Chromium, NOT a live FiveM/CEF certification.
The actual index metadata, critical styles, stylesheet links, and shipped scripts are replayed
in memory because this managed browser cannot navigate to a local HTTP server.
"""
from pathlib import Path
import io,json,os
from PIL import Image
from playwright.sync_api import sync_playwright
from browser_harness import mount_offline
ROOT=Path(__file__).resolve().parents[1]
OUT=Path(os.environ.get('DUO_TEST_OUTPUT',str(ROOT/'artifacts/cef-hotfix')))
OUT.mkdir(parents=True,exist_ok=True)
checks=[];errors=[]
def check(name,value):
 if not value: raise AssertionError(name)
 checks.append(name);print('PASS',name,flush=True)
def rgba(page): return Image.open(io.BytesIO(page.screenshot(omit_background=True))).convert('RGBA')
def scan(page):
 return page.evaluate('''()=>Array.from(document.querySelectorAll('*')).flatMap(el=>[null,'::before','::after'].flatMap(pseudo=>{
 const s=getComputedStyle(el,pseudo);const value=s.getPropertyValue('backdrop-filter')||s.getPropertyValue('-webkit-backdrop-filter');
 return value&&value!=='none'?[{tag:el.tagName,cls:el.className,pseudo,value}]:[];
 }))''')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1600,'height':1000});page.set_default_timeout(5000)
 page.on('pageerror',lambda e:errors.append(str(e)))
 mount_offline(page,nui=True,open_phone=False)
 check('Startup is truly hidden rather than just transparent/offscreen',page.locator('#duo').evaluate('(el)=>el.hidden&&el.inert&&getComputedStyle(el).display==="none"'))
 check('Startup paints zero opaque pixels',rgba(page).getchannel('A').getextrema()==(0,0))
 check('No game capture canvas is allocated at startup',page.locator('canvas').count()==0)
 check('NUI has no browser preview background',not page.locator('body').evaluate('el=>el.classList.contains("duo-preview")'))
 check('Document canvas color scheme is normal',page.evaluate('getComputedStyle(document.documentElement).colorScheme')=='normal')
 check('No element or pseudo-element enables backdrop filtering',not scan(page))
 def openphone():page.evaluate('window.postMessage(window.__previewFixtures.previewOpen())')
 def event(data):page.evaluate('data=>window.postMessage(data)',data)
 openphone();page.wait_for_timeout(700)
 check('Open shows existing hardware after a real hidden startup',page.locator('#duo').is_visible())
 check('Folded view leaves left background fully transparent',rgba(page).crop((0,0,500,1000)).getchannel('A').getextrema()==(0,0))
 page.screenshot(path=str(OUT/'folded.png'),omit_background=True)
 page.keyboard.press('e');page.wait_for_timeout(800)
 check('E still expands the device',page.evaluate('window.PeakDuo.getState().workspace.expanded'))
 page.evaluate("window.PeakDuo.openApp('mails','left');window.PeakDuo.openApp('calculator','right')")
 page.wait_for_timeout(400)
 page.locator('[data-app=mails] .compose-btn').click();page.wait_for_timeout(200)
 draft=page.locator('[data-app=mails] textarea');draft.fill('CEF hotfix keeps both workspaces.')
 page.keyboard.type('e')
 check('Typing E does not fold the phone',page.evaluate('window.PeakDuo.getState().workspace.expanded'))
 page.evaluate("window.__retainedDraft=document.querySelector('[data-app=mails] textarea')")
 event({'Action':'ClosePhone'});page.wait_for_timeout(80)
 check('Closing preserves exit animation briefly',page.locator('#duo').evaluate('el=>!el.hidden&&el.inert&&el.dataset.visible==="false"'))
 openphone();page.wait_for_timeout(600)
 check('Reopening during close survives stale hide timer',page.locator('#duo').is_visible())
 check('Reopening does not recreate or empty the app draft',page.evaluate("window.__retainedDraft===document.querySelector('[data-app=mails] textarea')&&window.__retainedDraft.value==='CEF hotfix keeps both workspaces.e'"))
 event({'Action':'ClosePhone'});page.wait_for_timeout(650)
 check('Completed close removes hardware from painting',page.locator('#duo').evaluate('el=>el.hidden&&getComputedStyle(el).display==="none"'))
 check('Closed phone paints zero opaque pixels',rgba(page).getchannel('A').getextrema()==(0,0))
 check('Completed close still retains app DOM',page.evaluate('window.__retainedDraft.isConnected'))
 event({'Action':'Notification','Id':'cef-closed-notification','Title':'Incoming message','Text':'Notifications stay inside the phone.','Icon':'fas fa-bell','IconColor':'white','BgColor':'#333','ShowTimer':False,'HasAccept':False,'HasReject':False})
 page.wait_for_timeout(700)
 check('Notification is mounted inside the phone display',page.locator('#duo .duo-screenbank > #duo-notifications').count()==1 and 'Incoming message' in page.locator('#duo-notifications').text_content())
 check('Notification does not paint a full-screen scrim',rgba(page).crop((0,0,500,1000)).getchannel('A').getextrema()==(0,0))
 page.evaluate('window.PeakPhoneLegacy.stores.Notifications.set([])')
 openphone();page.wait_for_timeout(700)
 event({'Action':'ShowCameraOverlay','Visible':True});page.wait_for_timeout(80)
 check('Camera immediately hides phone hardware',page.locator('#duo').evaluate('el=>el.hidden'))
 check('Camera interface remains separately available',page.locator('.duo-camera').is_visible())
 check('Camera preserves transparent game view at center',rgba(page).crop((600,200,1000,600)).getchannel('A').getextrema()==(0,0))
 event({'Action':'ShowCameraOverlay','Visible':False});page.wait_for_timeout(700)
 check('Leaving camera restores retained app view',page.locator('[data-app=mails] textarea').is_visible())
 page.evaluate("window.PeakDuo.openApp('contacts','left')");page.wait_for_timeout(250)
 page.locator('[data-app=contacts] .gh-add').click();page.wait_for_timeout(300)
 check('Modal remains bounded to phone without sampling game backdrop',not scan(page) and rgba(page).crop((0,0,500,1000)).getchannel('A').getextrema()==(0,0))
 page.keyboard.press('Escape');page.wait_for_timeout(200)
 page.locator('[data-side=left] .duo-status-controls').click();page.wait_for_timeout(100)
 check('Control center uses blur-free glass substitute',page.locator('.duo-control-center').is_visible() and not scan(page))
 page.locator('.duo-control-center button[aria-label="Reduced motion"]').click()
 page.locator('.duo-control-center button[aria-label="Close control center"]').click()
 event({'Action':'ClosePhone'})
 check('Reduced-motion close hides immediately',page.locator('#duo').evaluate('el=>el.hidden'))
 openphone();page.wait_for_timeout(500)
 page.evaluate("window.PeakDuo.openApp('peakify','left')");page.wait_for_timeout(400)
 check('Peakify legacy CSS is also backdrop-free',page.locator('.duo-app-instance[data-app=peakify]').is_visible() and not scan(page))
 page.evaluate("window.PeakDuo.openApp('mails','left')");page.wait_for_timeout(300)
 for width,height in [(1280,720),(1920,1080),(2560,1440)]:
  page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(450)
  rect=page.locator('.duo-chassis').bounding_box()
  check(f'Expanded device stays within {width}x{height}',rect is not None and rect['x']>=0 and rect['y']>=0 and rect['x']+rect['width']<=width and rect['y']+rect['height']<=height)
  image=rgba(page)
  check(f'Game area stays transparent at {width}x{height}',image.crop((0,0,width//4,height)).getchannel('A').getextrema()==(0,0))
 page.set_viewport_size({'width':1600,'height':1000});page.wait_for_timeout(300)
 page.screenshot(path=str(OUT/'expanded.png'),omit_background=True)
 event({'Action':'Duo/Reset'});page.wait_for_timeout(100)
 check('Character reset immediately hides shell and camera',page.locator('#duo').evaluate('el=>el.hidden') and not page.locator('.duo-camera').is_visible())
 check('No browser runtime errors',not errors)
 report={'passed':len(checks),'checks':checks,'errors':errors,'browser_version':b.version,'live_fivem':False,'network_or_credentials_tested':False,'scope':'Actual packaged head/CSS/scripts replayed in memory, with mocked FiveM callbacks; no CEF or GPU/native game compositor.'}
 (OUT/'transparency-results.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2));b.close()
