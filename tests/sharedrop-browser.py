"""Actual phone, Gallery dropdown, ShareDrop and physical snapshot in Chromium.
Backend/player state is a fixture; this does not simulate FiveM animation natives.
Run with the preview server listening on PREVIEW_URL (defaults to port 8791).
"""
from pathlib import Path
import json,os
from playwright.sync_api import sync_playwright
R=Path(__file__).resolve().parents[1];OUT=Path(os.environ.get('SHAREDROP_EVIDENCE_DIR',str(R/'artifacts/sharedrop')));OUT.mkdir(exist_ok=True,parents=True)
PREVIEW=os.environ.get('PREVIEW_URL','http://127.0.0.1:8791').rstrip('/')
checks=[];errors=[]
def check(label,value):
 assert value,label
 checks.append(label)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','C:/Program Files/Google/Chrome/Application/chrome.exe'),headless=True)
 page=browser.new_page(viewport={'width':1600,'height':1000});page.set_default_timeout(10000);page.on('pageerror',lambda e:errors.append(str(e)))
 page.add_init_script('''
 window.GetParentResourceName=()=> 'peak-phone';window.Peer=class{};window.__sdCalls=[];
 window.__sdFixtureAdapterReady=import('/duo/preview.mjs?rev=owner-config-20261015');
 window.__sdDeferredRoutes=new Set();window.__sdPendingResponses=[];
 window.__sdDeferNext=route=>window.__sdDeferredRoutes.add(route);
 window.__sdResolveNext=(route,result)=>{
  const index=window.__sdPendingResponses.findIndex(item=>item.route===route);
  if(index<0)throw Error('No deferred response for '+route);
  const [pending]=window.__sdPendingResponses.splice(index,1);
  pending.resolve({ok:true,status:200,text:async()=>JSON.stringify(result)});
 };
 const nativeFetch=window.fetch.bind(window);
 window.fetch=async(url,options)=>{
  if(!String(url).startsWith('https://peak-phone/'))return nativeFetch(url,options);
  const route=String(url).slice('https://peak-phone/'.length),data=JSON.parse(options?.body||'{}');window.__sdCalls.push({route,data});
  if(window.__sdDeferredRoutes.has(route)){
   window.__sdDeferredRoutes.delete(route);
   return await new Promise(resolve=>window.__sdPendingResponses.push({route,data,resolve}));
  }
  let result;
  if(route==='ShareDrop/Enabled')result={Success:true,Enabled:data.Enabled};
  else if(route==='ShareDrop/Nearby')result={Success:true,Players:[{source:2,name:'Jordan Parker',distance:3.4},{source:3,name:'Avery Chen',distance:2.3},{source:4,name:'Casey Lee',distance:4.5}]};
  else if(route==='ShareDrop/Request')result={Success:true,Id:data.TargetSource===3?'fixture-middle-transfer':data.TargetSource===4?'fixture-last-transfer':'fixture-transfer'};
  else if(route.startsWith('ShareDrop/'))result={Success:true};
  else if(route==='Gallery/GetPhotos')result=[{id:10,photo_url:'https://fixture.invalid/photo.png',timestamp:1780000000000}];
  else if(route==='Phone/PhysicalScreenFrame')result={Success:true};
  else result=await (await window.__sdFixtureAdapterReady).mockSend(route,data);
  return {ok:true,status:200,text:async()=>JSON.stringify(result)};
 };
 ''')
 def photo_fixture(route):route.fulfill(content_type='image/svg+xml',body='<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="#574880"/><circle cx="150" cy="120" r="55" fill="#c5b8fa"/><path d="M0 400L100 200L180 330L240 270L300 400" fill="#9b83cc"/></svg>')
 page.route('https://fixture.invalid/photo.png',photo_fixture)
 page.goto(PREVIEW);page.wait_for_function("typeof window.PeakDuo?.setPhoneSetting==='function'")
 page.evaluate("window.__sdFixtureAdapterReady.then(adapter=>window.postMessage(adapter.previewOpen()))")
 page.wait_for_timeout(500)
 check('This fixture keeps the FiveM game-mode transport active',page.evaluate('PeakDuo.preview===false'))
 page.evaluate("window.PeakPhoneTransport('Calls/GetCalls',{}).then(value=>window.__sdFixtureRead=value)")
 page.wait_for_function('Array.isArray(window.__sdFixtureRead)')
 check('Game-mode NUI calls use the versioned mocked backend',page.evaluate("window.__sdCalls.some(x=>x.route==='Calls/GetCalls')&&window.__sdFixtureRead.length===4"))
 page.evaluate("PeakDuo.setPhoneSetting('appearance','light')")
 page.get_by_role('button',name='Open control center').first.click()
 drop=page.get_by_role('button',name='ShareDrop',exact=True);drop.click()
 check('Control Center enables ShareDrop',drop.get_attribute('aria-pressed')=='true')
 page.locator('#duo > .duo-stage').screenshot(path=str(OUT/'control-center.png'))
 page.get_by_role('button',name='Close Control Center',exact=True).click()
 page.evaluate("window.PeakDuo.openApp('gallery','left')");page.wait_for_timeout(500)
 # Open the real Photos viewer and its native share sheet.
 photo=page.locator('.duo-photo-tile').first
 check('Captured photo appears in the Photos library',photo.count()>0)
 photo.click();page.get_by_role('button',name='Share photo').click()
 menu=page.locator('.duo-photo-share-sheet').get_by_role('button',name='ShareDrop',exact=True)
 check('Photos share sheet includes ShareDrop',menu.count()==1 and menu.is_visible())
 menu.click();page.wait_for_function("document.querySelector('.sd-contacts:not([hidden])')")
 check('Nearby list shows each opted-in player and distance',page.locator('.sd-contact').count()==3 and '3.4 m' in page.locator('.sd-contact').first.inner_text())
 check('Nearby contact picker fits inside the phone screen',page.locator('.sd-panel').evaluate("n=>{const r=n.getBoundingClientRect(),s=n.closest('.duo-screenbank').getBoundingClientRect();return r.top>=s.top&&r.bottom<=s.bottom&&r.left>=s.left&&r.right<=s.right}"))
 check('Long nearby lists scroll within their contact panel',page.locator('.sd-contacts').evaluate('n=>n.scrollHeight>n.clientHeight'))
 page.locator('.sd-contacts').evaluate('n=>n.scrollTop=n.scrollHeight')
 check('Last nearby row remains reachable by scrolling',page.locator('.sd-contact').last.evaluate("n=>{const r=n.getBoundingClientRect(),c=n.closest('.sd-contacts').getBoundingClientRect();return r.top>=c.top&&r.bottom<=c.bottom}"))
 page.locator('.sd-contacts').evaluate('n=>n.scrollTop=0')
 page.locator('#duo > .duo-stage').screenshot(path=str(OUT/'nearby-light.png'))
 light_surface=page.locator('.duo-sharedrop').evaluate('n=>getComputedStyle(n).backgroundImage')
 page.evaluate("PeakDuo.setPhoneSetting('appearance','dark')");page.wait_for_timeout(80)
 dark_surface=page.locator('.duo-sharedrop').evaluate('n=>getComputedStyle(n).backgroundImage')
 check('Nearby picker switches from light to dark surface',light_surface!=dark_surface)
 page.locator('#duo > .duo-stage').screenshot(path=str(OUT/'nearby-dark.png'))
 page.evaluate("PeakDuo.setPhoneSetting('appearance','light')");page.wait_for_timeout(80)
 page.get_by_role('button',name='Jordan Parker, 3.4 metres away').click()
 check('Gallery sends owned PhotoId and chosen server ID',page.evaluate("window.__sdCalls.some(x=>x.route==='ShareDrop/Request'&&x.data.PhotoId===10&&x.data.TargetSource===2)"))
 def request_token():
  return page.evaluate("()=>window.__sdCalls.filter(x=>x.route==='ShareDrop/Request').at(-1)?.data.RequestToken")
 def phase(name,receiver=False,transfer_id='fixture-transfer',token=None,peer=2,peer_name='Jordan Parker'):
  data={'Id':transfer_id,'Phase':name,'Receiver':receiver,'Peer':peer,'Name':peer_name,'PhotoUrl':'https://fixture.invalid/photo.png'}
  if not receiver:
   data['RequestToken']=token if token is not None else request_token()
  page.evaluate("d=>window.postMessage({Action:'ShareDrop/Phase',Data:d})",data)
  page.wait_for_timeout(70)
 current_token=request_token()
 phase('offer',token=current_token);check('Sender waits for receiver consent','Waiting for Jordan' in page.locator('.duo-sharedrop').inner_text())
 const_offer=page.locator('.duo-sharedrop').inner_text();phase('offer',token=current_token)
 check('Duplicate offer cannot reset sender consent state',page.locator('.duo-sharedrop').inner_text()==const_offer)
 phase('approach',token=current_token);phase('offer',token=current_token)
 check('Stale offer cannot rewind the approach phase',page.locator('.duo-sharedrop').get_attribute('data-phase')=='approach')
 page.keyboard.press('e');check('ShareDrop owns fold shortcut',page.locator('.duo-sharedrop').is_visible())
 phase('animation',token=current_token);phase('approach',token=current_token)
 check('Out-of-order phase cannot rewind the animation state',page.locator('.duo-sharedrop').get_attribute('data-phase')=='animation')
 page.evaluate("window.postMessage({Action:'ShareDrop/Transfer',Id:'fixture-transfer',Elapsed:1000,Duration:3200})")
 page.wait_for_timeout(150)
 check('Transfer samples advance',float(page.locator('.duo-sharedrop').evaluate("n=>n.style.getPropertyValue('--sd-progress')"))>.3)
 page.locator('#duo > .duo-stage').screenshot(path=str(OUT/'transfer-light.png'))
 check('Transfer progress is announced accessibly',page.locator('.sd-progress').get_attribute('aria-valuemax')=='100' and int(page.locator('.sd-progress').get_attribute('aria-valuenow'))>=0)
 snapshot=page.evaluate("async()=>{const m=await import('/duo/screen-capture.mjs');const overlay=document.querySelector('.duo-sharedrop');return m.displaySnapshot(overlay.closest('.duo-screenbank'),document.querySelector('#duo'),window.PeakDuo.getState().workspace.expanded)}")
 check('Physical display snapshot contains ShareDrop and sampled phase','duo-sharedrop' in snapshot['html'] and '--sd-progress' in snapshot['html'])
 check('Physical display excludes covered gallery/private app DOM','duo-app-mount' not in snapshot['html'])
 # Render the very same serialized screen through the physical display's script-free iframe.
 physical=browser.new_page(viewport={'width':2048,'height':1024});physical.route('https://fixture.invalid/photo.png',photo_fixture)
 physical.goto(PREVIEW+'/duo/physical-screen.html');physical.wait_for_timeout(250)
 frame=physical.frame_locator('#cover-display' if not snapshot['expanded'] else '#display')
 encoded=page.evaluate("async snapshot=>(await import('/duo/screen-capture.mjs')).encodeDisplay(snapshot)",snapshot)
 physical.evaluate("frame=>window.postMessage({type:'frame',frame})",encoded);physical.wait_for_timeout(300)
 check('Native glass mirror loads ShareDrop stylesheet',frame.locator('link[href*="sharedrop.css"]').count()==1)
 check('Native glass uses same sampled progress',page.locator('.sd-orbit').evaluate("n=>getComputedStyle(n).transform")!='none' and frame.locator('.sd-orbit').evaluate("n=>getComputedStyle(n).transform")!='none')
 check('Native glass shutter opens after a valid frame',physical.locator('#cover-face .face-shutter' if not snapshot['expanded'] else '#inner-face .face-shutter').evaluate('n=>getComputedStyle(n).opacity')=='0')
 check('Folded glass keeps ShareDrop panel within display bounds',frame.locator('.sd-panel').evaluate("n=>{const r=n.getBoundingClientRect(),s=n.closest('.duo-screenbank').getBoundingClientRect();return r.top>=s.top&&r.bottom<=s.bottom&&r.left>=s.left&&r.right<=s.right}"))
 physical.locator('#cover-face' if not snapshot['expanded'] else '#inner-face').screenshot(path=str(OUT/'physical-mirror-light.png'))
 page.evaluate("PeakDuo.setPhoneSetting('appearance','dark')");page.wait_for_timeout(100)
 page.locator('#duo > .duo-stage').screenshot(path=str(OUT/'transfer.png'))
 snapshot=page.evaluate("async()=>{const m=await import('/duo/screen-capture.mjs');const overlay=document.querySelector('.duo-sharedrop');return m.displaySnapshot(overlay.closest('.duo-screenbank'),document.querySelector('#duo'),window.PeakDuo.getState().workspace.expanded)}")
 encoded=page.evaluate("async snapshot=>(await import('/duo/screen-capture.mjs')).encodeDisplay(snapshot)",snapshot)
 physical.evaluate("frame=>window.postMessage({type:'frame',frame})",encoded);physical.wait_for_timeout(300)
 frame=physical.frame_locator('#cover-display' if not snapshot['expanded'] else '#display')
 physical.locator('#cover-face' if not snapshot['expanded'] else '#inner-face').screenshot(path=str(OUT/'physical-mirror.png'))
 page.evaluate('window.PeakDuo.fold()');page.wait_for_timeout(850)
 physical.evaluate("window.postMessage({type:'fold',expanded:true,reduced:true})")
 wide=page.evaluate("async()=>{const m=await import('/duo/screen-capture.mjs');const overlay=document.querySelector('.duo-sharedrop');return m.displaySnapshot(overlay.closest('.duo-screenbank'),document.querySelector('#duo'),true)}")
 encoded=page.evaluate("async snapshot=>(await import('/duo/screen-capture.mjs')).encodeDisplay(snapshot)",wide)
 physical.evaluate("frame=>window.postMessage({type:'frame',frame})",encoded);physical.wait_for_timeout(300)
 check('Unfolded native glass renders ShareDrop',physical.frame_locator('#display').locator('.duo-sharedrop').is_visible())
 check('Unfolded inner shutter opens after its fold event and valid frame',physical.locator('#inner-face .face-shutter').evaluate('n=>getComputedStyle(n).opacity')=='0')
 check('Unfolded glass keeps ShareDrop panel within display bounds',physical.frame_locator('#display').locator('.sd-panel').evaluate("n=>{const r=n.getBoundingClientRect(),s=n.closest('.duo-screenbank').getBoundingClientRect();return r.top>=s.top&&r.bottom<=s.bottom&&r.left>=s.left&&r.right<=s.right}"))
 physical.locator('#inner-face').screenshot(path=str(OUT/'physical-mirror-unfolded.png'))
 phase('complete');check('Sender completion reports sent','Photo saved' in page.locator('.duo-sharedrop').inner_text())
 phase('complete');check('Duplicate terminal phase cannot replace completion state','Photo saved' in page.locator('.duo-sharedrop').inner_text())
 page.get_by_role('button',name='Done',exact=True).click()
 def open_picker():
  page.evaluate("()=>window.dispatchEvent(new CustomEvent('duo:sharedrop',{detail:{PhotoId:10,PhotoUrl:'https://fixture.invalid/photo.png'}}))")
  page.wait_for_function("document.querySelector('.sd-contacts:not([hidden])')")
 def cancel_count(session_id):
  return page.evaluate("id=>window.__sdCalls.filter(x=>x.route==='ShareDrop/Cancel'&&x.data.Id===id).length",session_id)

 # Requests are created on click, not while rows render. All peers serialize
 # against one active outgoing request and each attempt gets its own token.
 open_picker();page.evaluate("()=>window.__sdDeferNext('ShareDrop/Request')")
 page.locator('.sd-contact').nth(1).click()
 page.wait_for_function("window.__sdPendingResponses.some(x=>x.route==='ShareDrop/Request')")
 middle_call=page.evaluate("()=>window.__sdCalls.filter(x=>x.route==='ShareDrop/Request').at(-1)")
 check('Selecting a middle nearby row targets that row',middle_call['data']['TargetSource']==3)
 check('Pending middle-peer request disables every nearby row',page.locator('.sd-contact').evaluate_all('xs=>xs.length===3&&xs.every(x=>x.disabled)'))
 middle_token=request_token();check('Each peer attempt gets a fresh request token',middle_token!=current_token)
 phase('offer',False,'fixture-middle-transfer',middle_token,3,'Avery Chen')
 check('Selected middle peer receives its own offer','Waiting for Avery' in page.locator('.duo-sharedrop').inner_text())
 page.evaluate("()=>window.__sdResolveNext('ShareDrop/Request',{Success:true,Id:'fixture-middle-transfer'})")
 page.wait_for_function("!window.__sdPendingResponses.some(x=>x.route==='ShareDrop/Request')")
 page.keyboard.press('Escape')

 # If cancel wins before the Request response, the returned ID must be
 # cancelled and its later offer must not reopen the overlay.
 requests_before_pending=page.evaluate("window.__sdCalls.filter(x=>x.route==='ShareDrop/Request').length")
 open_picker();page.evaluate("()=>window.__sdDeferNext('ShareDrop/Request')")
 page.locator('.sd-contact').first.click();page.wait_for_function("window.__sdPendingResponses.some(x=>x.route==='ShareDrop/Request')")
 check('Pending request disables every nearby row',page.locator('.sd-contact').evaluate_all('xs=>xs.length===3&&xs.every(x=>x.disabled)'))
 check('A pending request cannot overlap with another peer request',page.evaluate("window.__sdCalls.filter(x=>x.route==='ShareDrop/Request').length")==requests_before_pending+1)
 response_first_token=request_token();page.keyboard.press('Escape')
 check('Cancel closes a picker while ShareDrop/Request is pending',not page.locator('.duo-sharedrop').is_visible())
 page.evaluate("()=>window.__sdResolveNext('ShareDrop/Request',{Success:true,Id:'late-response-first'})")
 page.wait_for_function("window.__sdCalls.some(x=>x.route==='ShareDrop/Cancel'&&x.data.Id==='late-response-first')")
 check('A late successful Request response cancels its returned server ID',cancel_count('late-response-first')>0)
 phase('offer',False,'late-response-first',response_first_token)
 check('Offer after a cancelled Request response stays hidden',not page.locator('.duo-sharedrop').is_visible())

 # The opposite event order is also possible: the server offer can reach NUI
 # before the callback response. Cancelling then invalidates both continuations.
 open_picker();page.evaluate("()=>window.__sdDeferNext('ShareDrop/Request')")
 page.locator('.sd-contact').first.click();page.wait_for_function("window.__sdPendingResponses.some(x=>x.route==='ShareDrop/Request')")
 offer_first_token=request_token();phase('offer',False,'late-offer-first',offer_first_token)
 check('Offer arriving before Request response binds to the same session','Waiting for Jordan' in page.locator('.duo-sharedrop').inner_text())
 page.keyboard.press('Escape');check('Cancel after an early offer hides the transfer UI',not page.locator('.duo-sharedrop').is_visible())
 page.evaluate("()=>window.__sdResolveNext('ShareDrop/Request',{Success:true,Id:'late-offer-first'})")
 page.wait_for_function("window.__sdCalls.some(x=>x.route==='ShareDrop/Cancel'&&x.data.Id==='late-offer-first')")
 phase('approach',False,'late-offer-first',offer_first_token)
 check('Late phase after an offer-first cancellation cannot reopen the overlay',not page.locator('.duo-sharedrop').is_visible())

 # A new picker owns a later generation. Completion from the old request
 # cannot replace it, and its token keeps an old offer from binding to it.
 open_picker();page.evaluate("()=>window.__sdDeferNext('ShareDrop/Request')")
 page.locator('.sd-contact').first.click();page.wait_for_function("window.__sdPendingResponses.some(x=>x.route==='ShareDrop/Request')")
 old_generation_token=request_token();page.keyboard.press('Escape');open_picker()
 page.evaluate("()=>window.__sdResolveNext('ShareDrop/Request',{Success:true,Id:'old-generation'})")
 page.wait_for_function("window.__sdCalls.some(x=>x.route==='ShareDrop/Cancel'&&x.data.Id==='old-generation')")
 check('Old Request completion preserves the newer nearby picker','Choose someone nearby' in page.locator('.duo-sharedrop').inner_text())
 phase('offer',False,'old-generation',old_generation_token)
 check('Old offer token cannot replace a newer ShareDrop generation','Choose someone nearby' in page.locator('.duo-sharedrop').inner_text())
 page.keyboard.press('Escape')

 phase('offer',True,'fixture-incoming');check('Receiver gets explicit movement consent','Accept to begin the short approach' in page.locator('.duo-sharedrop').inner_text())
 phase('offer',True,'fixture-incoming');check('Duplicate incoming offer preserves one pair of consent buttons',page.locator('.duo-sharedrop .sd-action').count()==2)
 page.get_by_role('button',name='Accept',exact=True).click()
 check('Receiver acceptance is bound to transfer ID',page.evaluate("window.__sdCalls.some(x=>x.route==='ShareDrop/Respond'&&x.data.Id==='fixture-incoming'&&x.data.Accept===true)"))
 page.keyboard.press('Escape');check('Escape cancels and dismisses',not page.locator('.duo-sharedrop').is_visible())
 phase('offer',True,'late-accept');page.evaluate("()=>window.__sdDeferNext('ShareDrop/Respond')")
 page.get_by_role('button',name='Accept',exact=True).click();page.wait_for_function("window.__sdPendingResponses.some(x=>x.route==='ShareDrop/Respond')")
 page.keyboard.press('Escape');page.evaluate("()=>window.__sdResolveNext('ShareDrop/Respond',{Success:true})")
 page.wait_for_function("window.__sdCalls.some(x=>x.route==='ShareDrop/Cancel'&&x.data.Id==='late-accept')")
 phase('approach',True,'late-accept')
 check('Late accept response cancels its session without reopening a closed UI',not page.locator('.duo-sharedrop').is_visible())
 phase('offer',True,'fixture-failure');phase('failed',True,'fixture-failure');check('Save failure never claims success','could not be saved' in page.locator('.duo-sharedrop').inner_text())
 page.evaluate("window.postMessage({Action:'Duo/Reset'})");check('Character reset dismisses pending UI',not page.locator('.duo-sharedrop').is_visible())
 check('No browser JavaScript errors',not errors)
 browser.close()
(OUT/'browser-results.json').write_text(json.dumps({'checks':checks,'errors':errors,'liveFiveM':False},indent=2))
print(json.dumps({'passed':len(checks),'errors':errors}))
