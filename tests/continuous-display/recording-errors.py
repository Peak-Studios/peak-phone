"""Real browser encoding with deliberately failing storage/permission fixtures; no game capture."""
from pathlib import Path
import sys, os, json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tests/ios-refresh'))
from offline import offline_html
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 page=b.new_page();page.route('**/*',lambda r:r.abort());errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content(offline_html(),wait_until='domcontentloaded');page.wait_for_function('document.documentElement.dataset.duoReady==="true"')
 result=page.evaluate('''async()=>{
 const {RecordingService}=await import('duo/recording-service.mjs');const tests=[],messages=[];
 const check=(name,value)=>{if(!value)throw Error(name);tests.push({name,passed:true})};
 const delay=ms=>new Promise(r=>setTimeout(r,ms));let clips=[];
 const store={db:async()=>({}),list:async()=>clips,save:async(owner,blob,meta)=>{const record={owner,blob,...meta};clips.push(record);return record}};
 const r=new RecordingService({store,preview:true,notify:m=>messages.push(m)});
 check('Missing owner fails before capture',!(await r.start())&&r.status==='idle'&&!r.capture);
 r.setOwner('test');const support=MediaRecorder.isTypeSupported;MediaRecorder.isTypeSupported=()=>false;
 try{check('Unsupported codec fails before capture',!(await r.start())&&r.status==='idle'&&!r.capture)}finally{MediaRecorder.isTypeSupported=support}
 const list=store.list;store.list=async()=>Array(20).fill({});check('Full local library rejects before capture',!(await r.start())&&!r.capture&&r.status==='idle');store.list=list;
 const db=store.db;store.db=async()=>{throw Error('Fixture storage unavailable')};check('Unavailable storage returns idle',!(await r.start())&&r.status==='idle');store.db=db;
 await r.start();check('Second start cannot spawn another recorder',!(await r.start())&&r.status==='recording');let tracks=r.stream.getTracks();r.cancel();check('Cancel stops all tracks and does not save',tracks.every(t=>t.readyState==='ended')&&!clips.length);
 const save=store.save;store.save=async()=>{throw Error('Fixture quota exceeded')};await r.start();tracks=r.stream.getTracks();await delay(250);await r.stop();check('Failed save releases tracks and returns idle',r.status==='idle'&&tracks.every(t=>t.readyState==='ended')&&!clips.length&&messages.includes('Fixture quota exceeded'));store.save=save;
 await r.start();r.started=performance.now()-60100;await delay(650);check('Sixty-second duration limit automatically saves and stops',r.status==='idle'&&clips.length===1&&clips[0].duration>=60);
 clips=[];let resolve;store.db=()=>new Promise(r=>resolve=r);const pending=r.start();r.cancel();resolve({});await pending;check('Late storage initialization cannot restart a cancelled recording',r.status==='idle'&&!r.capture&&!clips.length);store.db=db;
 // This fixture has no navigator.mediaDevices: requesting optional audio must fail clearly, never silently record it.
 if(!navigator.mediaDevices?.getUserMedia){check('Unavailable microphone fails with cleanup',!(await r.start({microphone:true}))&&r.status==='idle'&&!r.capture)}
 r.destroy();return {checks:tests,count:tests.length,nativeFiveM:false,diskPersistenceTested:false};}''')
 assert not errors,errors
 out=ROOT/'artifacts/continuous-display/recording-errors.json';out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2));b.close()
