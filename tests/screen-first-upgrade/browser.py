"""Chromium workflow tests against exact runtime modules, synthetic NUI and memory storage.
No live FXServer, DB, browser navigation or persisted IndexedDB is used in this harness.
"""
from pathlib import Path
import sys,json,os,time
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tests/ios-refresh'))
from offline import offline_html
OUT=ROOT/'artifacts/screen-first-upgrade';OUT.mkdir(parents=True,exist_ok=True)
checks=[]
started=time.monotonic()
def ok(name,value=True):
 if not value:raise AssertionError(name)
 checks.append({'name':name,'passed':True});print('PASS',round(time.monotonic()-started,2),name,flush=True)
def run():
 storage="""const memory=new Map();Object.defineProperty(window,'localStorage',{value:{getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k),clear:()=>memory.clear()}});"""
 fixture=offline_html(storage)
 with sync_playwright() as pw:
  browser=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
  page=browser.new_page(viewport={'width':1920,'height':1080});page.set_default_timeout(4500);page.route('**/*',lambda r:r.abort());errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.set_content(fixture,wait_until='domcontentloaded',timeout=40000);page.wait_for_function('window.PeakDuo && document.documentElement.dataset.duoReady==="true"',timeout=25000);page.wait_for_timeout(600)
  def js(s):return page.evaluate(s)
  def click(selector):page.locator(selector).click();page.wait_for_timeout(130)
  def openapp(app):page.evaluate('(app)=>PeakDuo.openApp(app)',app);page.wait_for_timeout(400)
  def shot(name):page.locator('#duo').screenshot(path=str(OUT/(name+'.png')),timeout=6000)
  ok('No permanent sidebar or rear camera strip',page.locator('.duo-app-rail').count()==0 and page.locator('.duo-island:visible').count()==0)
  ok('Cover pane fills screen',js("Math.abs(document.querySelector('.duo-pane[data-active=true]').clientWidth-document.querySelector('.duo-screenbank').clientWidth)<=1"));shot('cover-home')
  openapp('calls');ok('Recent calls loaded',page.locator('.nx-call-row').count()==4)
  click('.nx-segment [data-tab=missed]');ok('Missed filter',page.locator('.nx-call-row').count()==1)
  click('.nx-phone .nx-tabs [data-tab=contacts]');page.locator('.nx-search input').fill('Maya');ok('Contact search',page.locator('.nx-call-row').count()==1)
  click('.nx-phone .nx-tabs [data-tab=keypad]');ok('Twelve keypad buttons',page.locator('.nx-dial-key').count()==12)
  for d in ['5','5','5','0','1','0','2','0','0','2']:click('.nx-dial-key[data-digit="'+d+'"]')
  ok('Keypad builds a number',page.locator('.nx-dial-number').input_value()=='5550102002')
  ok('Contact matching on dialer','Jordan Lee' in page.locator('.nx-dial-caption').inner_text())
  click('.nx-dial-secondary[aria-label="Delete last digit"]');ok('Delete last digit',page.locator('.nx-dial-number').input_value()=='555010200')
  page.locator('.nx-dial-number').fill('');page.locator('.nx-dial-number').blur();page.keyboard.press('7');ok('Keyboard dialing',page.locator('.nx-dial-number').input_value()=='7')
  page.locator('.nx-dial-number').fill('5550102098');click('.nx-dial-secondary[aria-label="Save number"]');page.get_by_label('Name',exact=True).fill('New Test Contact');page.get_by_role('button',name='Save contact',exact=True).click();page.wait_for_timeout(400)
  ok('Save contact uses existing callback and closes sheet',page.locator('.nx-sheet').count()==0 and js("window.PeakDuo.requests.some(r=>r.event==='Contacts/CreateContact'&&r.data.Name==='New Test Contact')"))
  click('.nx-phone .nx-tabs [data-tab=contacts]');page.locator('.nx-search input').fill('New Test');ok('Saved contact appears on refresh',page.locator('.nx-call-row').count()==1)
  click('.nx-phone .nx-tabs [data-tab=keypad]');page.locator('.nx-dial-number').fill('5550102002');click('.nx-dial-call');page.wait_for_timeout(100)
  ok('Call action requests existing call callback',js("window.PeakDuo.requests.some(r=>r.event==='Contacts/Call'&&r.data.Phone==='5550102002')"))
  ok('Preview does not invent connected calls','live FiveM' in page.locator('.duo-toast').inner_text())
  shot('phone-keypad')
  for w,h in [(1920,1080),(1280,720),(2560,1080)]:
   page.set_viewport_size({'width':w,'height':h});page.wait_for_timeout(80)
   fit=js("""()=>{const app=document.querySelector('.nx-phone').getBoundingClientRect();return [...document.querySelectorAll('.nx-dial-key,.nx-dial-call,.nx-phone .nx-tabs')].every(e=>{const r=e.getBoundingClientRect();return r.y>=app.y&&r.bottom<=app.bottom+1&&r.x>=app.x&&r.right<=app.right+1})}""")
   ok(f'All keypad/call/navigation controls fit at {w}x{h}',fit)
   ok(f'Circular dial keys at {w}x{h}',page.locator('.nx-dial-key').first.evaluate('(e)=>Math.abs(e.clientWidth-e.clientHeight)<2'))
  page.set_viewport_size({'width':1920,'height':1080})
  # Fold with an app alive, pause only the temporary Web Animations and then clean up.
  captured=js("""()=>{window.__phoneNode=document.querySelector('.nx-phone');const t=window.setTimeout;window.setTimeout=(fn,ms,...a)=>ms===700?(window.__foldCleanup=fn,0):t(fn,ms,...a);try{PeakDuo.fold()}finally{window.setTimeout=t}const scene=document.querySelector('.duo-fold-scene');for(const a of document.getAnimations()){a.pause();a.currentTime=150}return {screen:!!scene.querySelector('.duo-fold-cover .nx-phone'),back:scene.querySelectorAll('.duo-fold-back').length,ids:[...scene.querySelectorAll('[id]')].map(n=>n.id)};}""")
  ok('Folding outer face contains phone screen, not a camera back',captured['screen'] and captured['back']==0)
  ok('Fold snapshots have unique IDs',len(captured['ids'])==len(set(captured['ids'])))
  shot('fold-screen-frame');js('()=>{for(const a of document.getAnimations())try{a.finish()}catch{};__foldCleanup()}');page.wait_for_timeout(100)
  ok('Unfold preserves live app instance',js("document.querySelector('.nx-phone')===__phoneNode"))
  js("PeakDuo.setLayout('split');PeakDuo.openApp('vehicles','right')");page.wait_for_timeout(300);ok('Side-by-side Phone and My Car',page.locator('.nx-phone').is_visible() and page.locator('.nx-garage').is_visible())
  for ratio in [.4,.6]:
   page.evaluate('(r)=>PeakDuo.setSplitRatio(r)',ratio);page.wait_for_timeout(80)
   ok('Native views contained at split ratio '+str(ratio),js("[...document.querySelectorAll('.nx-app')].every(e=>e.scrollWidth<=e.clientWidth+1)"))
  js('PeakDuo.setSplitRatio(.5)');shot('split-phone-car')
  js('PeakDuo.fold()');page.wait_for_timeout(750);ok('Fold shows focused app continuously',page.locator('.nx-garage').is_visible() and not page.locator('.nx-phone').is_visible())
  ok('Three vehicles loaded',page.locator('.nx-vehicle-card').count()==3)
  click('.nx-garage [data-tab=impound]');ok('Impound filter',page.locator('.nx-vehicle-card').count()==1)
  click('.nx-garage [data-tab=all]');page.locator('.nx-garage .nx-search input').fill('DUO 01');ok('Search by plate',page.locator('.nx-vehicle-card').count()==1)
  click('.nx-vehicle-card');ok('Vehicle health and VIN rendered','96%' in page.locator('.nx-garage').inner_text() and 'PREVIEW-001' in page.locator('.nx-garage').inner_text());shot('my-car-detail')
  page.get_by_role('button',name='Request from garage',exact=True).click();ok('Vehicle request needs confirmation',page.get_by_role('dialog',name='Request vehicle',exact=True).is_visible());page.get_by_role('button',name='Request vehicle',exact=True).click();page.wait_for_timeout(200)
  ok('Unconfigured garage action is not presented as success','live FiveM' in page.locator('.duo-toast').inner_text());page.keyboard.press('Escape');ok('Escape dismisses app sheet before phone',page.locator('.nx-sheet').count()==0 and js('PeakDuo.getState().visible'))
  page.get_by_role('button',name='Transfer vehicle',exact=True).click();page.get_by_label('Recipient citizen ID').fill('TARGET');page.get_by_label('Price (in-game currency)').fill('10');page.get_by_role('button',name='Review transfer').click();ok('Transfer requires explicit review',page.get_by_role('dialog',name='Confirm transfer').is_visible());page.keyboard.press('Escape')
  openapp('y');ok('Y feed loaded',page.locator('.nx-post').count()==3);shot('y-feed')
  click('.nx-y [data-tab=following]');ok('Following feed filters',page.locator('.nx-post').count()==2);click('.nx-y [data-tab=for-you]')
  card=page.locator('.nx-post[data-post-id="3"]');card.get_by_role('button',name='Like',exact=True).click();page.wait_for_timeout(500);ok('Like updates server acknowledgement',page.locator('.nx-post[data-post-id="3"] [aria-label=Unlike]').count()==1)
  card=page.locator('.nx-post[data-post-id="3"]');card.get_by_role('button',name='Bookmark',exact=True).click();click('.nx-y-bottom [data-tab=bookmarks]');ok('Bookmarks view',page.locator('.nx-post').count()==1)
  openapp('calls');openapp('y');click('.nx-y-bottom [data-tab=bookmarks]');ok('Bookmark survives app close/reopen in scoped storage fixture',page.locator('.nx-post').count()==1);click('.nx-y-bottom [data-tab=home]')
  page.locator('.nx-post[data-post-id="3"]').get_by_role('button',name='Reply',exact=True).click();page.get_by_label('Post text',exact=True).fill('A real reply route #Duo');page.get_by_role('dialog').get_by_role('button',name='Reply',exact=True).click();page.wait_for_timeout(500)
  page.locator('.nx-post[data-post-id="3"]').press('Enter');ok('Thread displays reply','A real reply route' in page.locator('.nx-y-body').inner_text());shot('y-thread');page.get_by_role('button',name='Back',exact=True).click()
  page.locator('.nx-post[data-post-id="2"]').get_by_role('button',name='Repost or quote',exact=True).click();page.get_by_role('dialog').get_by_role('button',name='Repost',exact=True).click();page.wait_for_timeout(500);ok('Repost renders attribution',page.locator('.nx-repost-label').count()==1)
  page.locator('.nx-post[data-post-id="3"]').get_by_role('button',name='Repost or quote',exact=True).click();page.get_by_role('button',name='Quote post',exact=True).click();page.get_by_label('Post text',exact=True).fill('A quoted conversation');page.get_by_role('dialog').get_by_role('button',name='Post',exact=True).click();page.wait_for_timeout(500);ok('Quote cards rendered',page.locator('.nx-quote').count()>=1)
  # Draft retention and a deliberate backend failure.
  page.get_by_role('button',name='Compose post',exact=True).click();page.get_by_label('Post text',exact=True).fill('Keep this draft when server fails');page.keyboard.press('Escape');page.get_by_role('button',name='Compose post',exact=True).click();ok('Dismissed composer retains draft',page.get_by_label('Post text',exact=True).input_value()=='Keep this draft when server fails')
  js("window.PeakDuo.previewAdapter.upgradeFixture.failOnce('Y/CreatePost','Deliberate rejected post')");page.get_by_role('dialog').get_by_role('button',name='Post',exact=True).click();page.wait_for_timeout(200);ok('Failed post keeps text and re-enables retry',page.get_by_label('Post text',exact=True).input_value()=='Keep this draft when server fails' and page.get_by_role('dialog').get_by_role('button',name='Post',exact=True).is_enabled())
  page.get_by_label('Post text',exact=True).fill('Published after retry');page.get_by_role('dialog').get_by_role('button',name='Post',exact=True).click();page.wait_for_timeout(500);ok('Retry succeeds without losing composer','Published after retry' in page.locator('.nx-y-body').inner_text())
  # Owner-only delete is confirmed and removes the correct post.
  own=page.locator('.nx-post').filter(has_text='Published after retry');own.get_by_role('button',name='Post options',exact=True).click();page.get_by_role('button',name='Delete post',exact=True).click();page.get_by_role('button',name='Confirm',exact=True).click();page.wait_for_timeout(400);ok('Owner delete removes selected post','Published after retry' not in page.locator('.nx-y-body').inner_text())
  click('.nx-y-bottom [data-tab=explore]');page.get_by_label('Search posts, people or #topics').fill('#Duo');ok('Hashtag search',page.locator('.nx-post').count()>=2)
  click('.nx-y-tools [data-tab=people]');page.get_by_label('Search posts, people or #topics').fill('Maya');ok('People search',page.locator('.nx-person-row').count()==1);click('.nx-person-row');page.wait_for_timeout(150);ok('Profile loads','@Maya_Chen' in page.locator('.nx-profile').inner_text());page.locator('.nx-profile-follow').click();page.wait_for_timeout(400);ok('Follow updates profile',page.locator('.nx-profile-follow').inner_text()=='Following');shot('y-profile')
  page.keyboard.press('Escape');click('.nx-y-bottom [data-tab=home]');page.get_by_role('button',name='Account menu',exact=True).click();page.get_by_role('button',name='Your profile',exact=True).click();page.wait_for_timeout(200);page.get_by_role('button',name='Edit profile',exact=True).click();page.get_by_label('Name',exact=True).fill('Alex Updated');page.get_by_role('button',name='Save profile',exact=True).click();page.wait_for_timeout(300);ok('Profile editing saves through existing endpoint','Alex Updated' in page.locator('.nx-profile').inner_text());page.keyboard.press('Escape')
  click('.nx-y-bottom [data-tab=notifications]');ok('Notifications render',page.locator('.nx-notification').count()>=1);page.wait_for_timeout(150);ok('Opening notifications marks read',page.locator('.nx-y-bottom [data-tab=notifications] .nx-badge').count()==0)
  click('.nx-y-bottom [data-tab=messages]');ok('Messages navigation opens preserved SMS app',page.locator('.duo-app-instance[data-app=messages]').is_visible())
  # Client text always remains text, including content inserted via the server event shape.
  openapp('y');js("window.dispatchEvent(new MessageEvent('message',{data:{Action:'Y/SetPosts',Posts:[{Id:999,Cid:'ATTACKER',Sender:'<img onerror=alert(1)>',Msg:'<script>window.__bad=true</script>',Timestamp:Date.now()}]}}))");page.wait_for_timeout(100)
  ok('User text is not interpreted as HTML',js("!window.__bad&&!document.querySelector('.nx-post script')") and '<script>' in page.locator('.nx-post-text').inner_text())
  # Character switch resets the app bank and cannot reveal another SIM's local bookmark.
  js("{const d=window.PeakDuo.previewAdapter.previewOpen();d.PlayerData={...d.PlayerData,Cid:'OTHER-SIM',PhoneNumber:'5550999999'};window.dispatchEvent(new MessageEvent('message',{data:d}))}");page.wait_for_timeout(350)
  ok('Character change destroys old app nodes',page.locator('.nx-y').count()==0)
  ok('No unhandled browser errors',not errors)
  report={'count':len(checks),'checks':checks,'unhandledErrors':errors,'engine':browser.version,'liveFiveM':False,'liveDatabase':False,'diskPersistenceTested':False,'transport':'synthetic preview','storage':'in-memory localStorage test adapter'}
  (OUT/'browser-results.json').write_text(json.dumps(report,indent=2));browser.close()
if __name__=='__main__':run()
