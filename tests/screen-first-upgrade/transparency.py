"""Desktop Chromium alpha checks with mocked NUI; not a live FiveM compositor test."""
from pathlib import Path
import sys, json, io, os
from PIL import Image
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tests'))
from browser_harness import mount_offline
OUT=ROOT/'artifacts/screen-first-upgrade';OUT.mkdir(parents=True,exist_ok=True)
checks=[]
def check(name,result):
 assert result,name
 checks.append({'name':name,'passed':True});print('PASS',name,flush=True)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 page=b.new_page(viewport={'width':1600,'height':1000});page.set_default_timeout(8000);page.route('**/*',lambda r:r.abort());errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 mount_offline(page,nui=True,open_phone=False)
 # about:blank has no durable storage origin. Avoid a legitimate global storage-warning
 # toast contaminating alpha crops; blocked/quota storage is tested separately.
 page.evaluate("""()=>{const data=new Map();Object.defineProperty(window,'localStorage',{value:{getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)}})}""")
 def alpha():return Image.open(io.BytesIO(page.screenshot(omit_background=True))).convert('RGBA').getchannel('A')
 def clear():return alpha().crop((0,0,600,1000)).getextrema()==(0,0)
 def scan():return page.evaluate("""()=>[...document.querySelectorAll('*')].flatMap(n=>[null,'::before','::after'].map(p=>getComputedStyle(n,p).backdropFilter)).filter(s=>s&&s!=='none')""")
 check('Startup is hidden and inert',page.locator('#duo').evaluate('(e)=>e.hidden&&e.inert'))
 check('Startup paints zero opaque pixels',alpha().getextrema()==(0,0))
 check('Game mode never uses preview background',page.locator('body.duo-preview').count()==0)
 page.evaluate('window.postMessage(__previewFixtures.previewOpen())');page.wait_for_timeout(650)
 check('Phone opens on explicit NUI message',page.locator('#duo').is_visible())
 for app in ['calls','vehicles','y']:
  page.evaluate('(a)=>PeakDuo.openApp(a)',app);page.wait_for_timeout(300)
  check(app+' keeps game background transparent',clear())
  check(app+' has no active backdrop filter, including pseudo-elements',not scan())
 page.get_by_role('button',name='Compose post',exact=True).click();page.wait_for_timeout(120)
 check('Native modal remains bounded to phone',clear())
 check('Native modal has no backdrop sampling',not scan())
 page.get_by_label('Post text',exact=True).fill('Retained NUI draft')
 page.evaluate('window.postMessage({Action:"ClosePhone"})');page.wait_for_timeout(650)
 check('Close removes opaque phone pixels',alpha().getextrema()==(0,0))
 page.evaluate('window.postMessage(__previewFixtures.previewOpen())');page.wait_for_timeout(600)
 check('Reopen retains active composer contents',page.get_by_label('Post text',exact=True).input_value()=='Retained NUI draft')
 page.keyboard.press('Escape');page.evaluate('PeakDuo.fold()');page.wait_for_timeout(750)
 check('Expanded phone has no sidebar',page.locator('.duo-app-rail').count()==0)
 check('Expanded phone does not obscure the game outside the chassis',alpha().crop((0,0,500,1000)).getextrema()==(0,0))
 page.evaluate('window.postMessage({Action:"ShowCameraOverlay",Visible:true})');page.wait_for_timeout(100)
 check('Camera hides the phone shell',page.locator('#duo').is_hidden())
 # The preserved camera intentionally draws rule-of-thirds guide lines. Sample the
 # interior of its central cell, not a guide line, to detect an opaque game backdrop.
 check('Camera framing interior remains fully transparent',alpha().crop((720,370,880,470)).getextrema()==(0,0))
 page.evaluate('window.postMessage({Action:"Duo/Reset"})');page.wait_for_timeout(100)
 check('Identity reset immediately hides UI',page.locator('#duo').is_hidden() and not page.locator('.duo-camera').is_visible())
 check('No unhandled browser errors',not errors)
 (OUT/'transparency-results.json').write_text(json.dumps({'count':len(checks),'checks':checks,'errors':errors,'browser':b.version,'liveFiveM':False,'transport':'mocked NUI; actual HTML, CSS and modules','localStorage':'in-memory adapter','scope':'Desktop alpha screenshots, not game GPU/CEF certification'},indent=2));b.close()
