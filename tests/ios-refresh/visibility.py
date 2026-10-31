"""Transparent NUI startup/lifecycle and three viewport checks; Chromium, not a FiveM client."""
from pathlib import Path
import os,json,sys,traceback,io
from PIL import Image
from playwright.sync_api import sync_playwright
from offline import offline_html
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'artifacts/ios-refresh';OUT.mkdir(parents=True,exist_ok=True)
checks=[]
def ok(name,value=True,detail=None):
 if not value:raise AssertionError(name+': '+str(detail))
 checks.append({'name':name,'passed':True});print('PASS',name,flush=True)
PRELUDE=r'''
window.GetParentResourceName=()=> 'peak-phone'; window.__nuiRequests=[];
window.fetch=async function(url,opts){const event=new URL(url).pathname.slice(1);const payload=JSON.parse(opts?.body||'{}');window.__nuiRequests.push({event,data:payload});
const result=event==='GetInstalledApps'?{peakify:true,calculator:true}:event==='GetProfilePicture'?'':event==='Phone/GetPreferences'?{}:event==='Peakify/GetState'?{Tracks:[],Playlists:[]}:event==='Peakify/GetDeviceState'?null:'Ok';
return new Response(JSON.stringify(result),{status:200,headers:{'Content-Type':'application/json'}});};
window.__sendNative=(data)=>window.dispatchEvent(new MessageEvent('message',{source:window,data}));
window.__openNative=()=>window.__sendNative({Action:'OpenPhone',Weather:'EXTRASUNNY',Time:[9,41],HasVPN:false,HasRacingUsb:false,HasPDRacingUsb:false,IsNearNetwork:false,IsNetworkEnabled:true,PlayerData:{citizenid:'TEST-CITIZEN',charinfo:{firstname:'Test',lastname:'Character',phone:'5550000'},metadata:{},job:{name:'unemployed',label:'Citizen',grade:{name:'Citizen'}}}});
'''
def pixel_image(page):return Image.open(io.BytesIO(page.screenshot(omit_background=True))).convert('RGBA')
def has_alpha(image):return image.getchannel('A').getbbox() is not None

def run():
 with sync_playwright() as p:
  b=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
  for w,h in [(1920,1080),(1280,720),(2560,1080)]:
   tag=f'{w}x{h}';pg=b.new_page(viewport={'width':w,'height':h},device_scale_factor=1);pg.route('**/*',lambda r:r.abort());errors=[];pg.on('pageerror',lambda e:errors.append(str(e)))
   pg.set_content(offline_html(PRELUDE),wait_until='domcontentloaded');pg.wait_for_function('document.documentElement.dataset.duoReady==="true"');pg.wait_for_timeout(100)
   ok(tag+' Native mode does not import or render synthetic preview',pg.evaluate('PeakDuo.preview===false && !document.querySelector(".duo-preview-notice")'))
   ok(tag+' Startup has zero painted pixels',not has_alpha(pixel_image(pg)))
   ok(tag+' Closed startup shell is hidden and inert',pg.evaluate('document.querySelector("#duo").hidden && document.querySelector("#duo").inert'))
   ok(tag+' Native readiness uses original callback',pg.evaluate('__nuiRequests.some(r=>r.event==="Phone/DuoReady")'))
   pg.evaluate('__openNative()');pg.wait_for_timeout(700)
   ok(tag+' Native open signal opens the phone',pg.locator('#duo').is_visible())
   bg=pixel_image(pg);alpha=bg.getchannel('A');bounds=alpha.getbbox();ok(tag+' Phone paints only a bounded device area',bounds and (bounds[2]-bounds[0])<w*.8 and (bounds[3]-bounds[1])<h*.99,bounds)
   for side in ('left','right'):
    if side=='right':pg.evaluate('PeakDuo.fold()');pg.wait_for_timeout(780)
    pg.evaluate('(s)=>PeakDuo.openApp("peakify",s,{external:true})',side);pg.wait_for_timeout(160)
    box=pg.locator('.pm-app').bounding_box();ok(tag+' '+side+' Music panel lies in viewport',box['x']>=0 and box['y']>=0 and box['x']+box['width']<=w and box['y']+box['height']<=h,box)
    tabs=pg.locator('.pm-tabs').bounding_box();ok(tag+' '+side+' Bottom Music tabs remain visible',tabs['y']+tabs['height']<=box['y']+box['height']+1,tabs)
   # All computed styles, including pseudo-elements, reject backdrop blurs.
   bad=pg.evaluate('''()=>{let out=[];for(const n of document.querySelectorAll('body *'))for(const pseudo of [null,'::before','::after']){const s=getComputedStyle(n,pseudo);if((s.backdropFilter&&s.backdropFilter!=='none')||(s.webkitBackdropFilter&&s.webkitBackdropFilter!=='none'))out.push(n.className);}return out;}''')
   ok(tag+' No active backdrop filter on elements or pseudo-elements',not bad,bad)
   pg.evaluate('__sendNative({Action:"ClosePhone"})');pg.wait_for_timeout(580)
   ok(tag+' Closing removes every painted pixel',not has_alpha(pixel_image(pg)))
   pg.evaluate('__openNative();__sendNative({Action:"ClosePhone"})');pg.wait_for_timeout(80);pg.evaluate('__openNative()');pg.wait_for_timeout(750)
   ok(tag+' Rapid reopen cannot be hidden by stale close timer',pg.locator('#duo').is_visible())
   pg.evaluate('__sendNative({Action:"ShowCameraOverlay",Visible:true})');pg.wait_for_timeout(100)
   ok(tag+' Camera takeover fully hides shell',pg.evaluate('document.querySelector("#duo").hidden'))
   pg.evaluate('__sendNative({Action:"ShowCameraOverlay",Visible:false});__openNative()');pg.wait_for_timeout(750)
   ok(tag+' Camera exit restores workspace',pg.locator('#duo').is_visible())
   ok(tag+' No uncaught errors in native-mode lifecycle',not errors,errors)
   if w==1920:pg.screenshot(path=str(OUT/'native-empty-library.png'),omit_background=True)
   pg.close()
  b.close()

if __name__=='__main__':
 try:run()
 except Exception as e:
  checks.append({'name':'FAILED','passed':False,'error':str(e),'traceback':traceback.format_exc()});(OUT/'visibility-tests.json').write_text(json.dumps(checks,indent=2));traceback.print_exc();sys.exit(1)
 (OUT/'visibility-tests.json').write_text(json.dumps(checks,indent=2));print(f'{len(checks)} transparency/native-mode DOM checks passed. No in-game certification.')
