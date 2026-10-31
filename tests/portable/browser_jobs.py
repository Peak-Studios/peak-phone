"""Actual Chromium DOM exercises of new modules; network, FiveM and database are mocked."""
from pathlib import Path
import json,os
from playwright.sync_api import sync_playwright
R=Path(__file__).resolve().parents[2]
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
 page=b.new_page(viewport={'width':430,'height':900});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content('<html><head></head><body style="margin:0;background:#dfe6ed"><div id="host" style="width:390px;height:810px;margin:20px;position:relative"></div></body></html>')
 page.add_style_tag(content=(R/'web/public/duo/jobs.css').read_text())
 modules={n:(R/'web/public/duo'/n).read_text()for n in ['jobs-app.mjs','contact-share.mjs','catalog.mjs']}
 page.evaluate('''async mods=>{for(const [n,src]of Object.entries(mods))Object.assign(window,await import(URL.createObjectURL(new Blob([src],{type:'text/javascript'}))));}''',modules)
 result=page.evaluate('''async()=>{
 const results=[],calls=[],notices=[];const check=(name,ok)=>{results.push({name,passed:!!ok});if(!ok)throw Error(name);};const tick=()=>new Promise(r=>setTimeout(r,15));const host=document.querySelector('#host');
 const ja={...newJob(),id:'alpha',name:'Alpha route',description:'Bring supplies',stepCount:1},jb={...newJob(),id:'beta',name:'Beta route',description:'Community work',stepCount:1};
 const state={Success:true,ready:true,source:1,jobs:[ja,jb],groups:[],offers:[],group:false};
 const send=async(name,data)=>{calls.push({name,data});if(name==='Jobs/State')return structuredClone(state);return{Success:true};};
 let app=new JobCenterApp({target:host,props:{send}});await tick();check('Both server-provided jobs render',host.querySelectorAll('[data-job-id]').length===2);
 const input=host.querySelector('input');input.value='Beta';input.dispatchEvent(new Event('input'));check('Filtering keeps the matching stable ID',host.querySelectorAll('[data-job-id]').length===1&&host.querySelector('[data-job-id]').dataset.jobId==='beta');
 [...host.querySelectorAll('button')].find(b=>b.textContent==='GPS').click();await tick();check('Filtered GPS sends beta, not its display index',calls.at(-1).data.jobId==='beta');app.$destroy();
 check('Creator hidden from non-admin launcher',!availableApps({installed:{jobcreator:true}}).some(a=>a.id==='jobcreator'));
 app=new JobCreatorApp({target:host,props:{send:async()=>({Success:false,Msg:'Administrator access required.'})}});await tick();check('Denied admin view exposes no editing form',host.textContent.includes('Administrator access required.')&&!host.querySelector('input'));app.$destroy();
 app=new JobCreatorApp({target:host,props:{send:async()=>({})}});await tick();check('Malformed read response fails closed',!host.querySelector('button'));app.$destroy();
 let saveFailure=true;const adminSend=async(name,data)=>{calls.push({name,data});if(name==='Jobs/Admin')return{Success:true,definitions:[],audit:[],rewards:[]};if(name==='Jobs/Position')return{Success:true,x:10,y:20,z:30,w:40};if(name==='Jobs/Action')return saveFailure?{Success:false,Msg:'Revision conflict. Reload before editing.'}:{Success:true,definition:{...structuredClone(data.definition),revision:data.revision+1}};throw Error(name);};
 app=new JobCreatorApp({target:host,props:{send:adminSend}});await tick();[...host.querySelectorAll('button')].find(b=>b.textContent==='New job').click();
 check('Admin receives disabled draft and full objective form',app.draft.enabled===false&&!!host.querySelector('[aria-label="Step 1: Task label"]'));
 [...host.querySelectorAll('button')].find(b=>b.textContent==='Use my position').click();await tick();check('Use-position populates all coordinates',app.draft.hub.x===10&&app.draft.hub.w===40);
 [...host.querySelectorAll('button')].find(b=>b.textContent==='Duplicate step').click();check('Step duplication creates independent data',app.draft.steps.length===2&&app.draft.steps[0]!==app.draft.steps[1]);
 const original=app.draft;await app.save();check('Failed save retains the unsaved draft',app.draft===original&&app.revision===0&&host.textContent.includes('Revision conflict'));
 saveFailure=false;await app.save();check('Successful save uses returned authoritative revision',app.revision===1&&app.draft.revision===1&&!app.dirty);
 app.importView();host.querySelector('textarea').value=JSON.stringify({...newJob(),requirements:'malformed'});[...host.querySelectorAll('button')].find(b=>b.textContent==='Load as new draft').click();check('Malformed JSON shape is reported without crashing',host.textContent.includes('Item requirements must be a list'));
 app.edit({...newJob(),name:'Neighborhood delivery'},0);check('Phone-width editor has no horizontal overflow',host.querySelector('.pj-body').scrollWidth<=host.querySelector('.pj-body').clientWidth+1);
 window.__editor=app;
 const overlay=document.createElement('div');host.append(overlay);let queue=[{RequestId:'share-one',SenderName:'<img src=x onerror=alert(1)>',Contact:{name:'Shared card',phone:'5551234567'},ExpiresIn:60}],fail=true,acceptCalls=0;
 const service=new ContactShareService({target:overlay,notify:n=>notices.push(n),send:async(name,data)=>{if(name==='Contacts/PendingAirShares')return{Success:true,requests:queue};acceptCalls++;await tick();if(fail)return{Success:false,Msg:'Insert failed'};queue=[];return{Success:true};}});
 window.dispatchEvent(new MessageEvent('message',{data:{Action:'OpenPhone'}}));await tick();check('Sharing works without the Contacts app mounted',!service.node.hidden&&service.node.textContent.includes('Shared card'));
 check('Shared identity is rendered as text, never HTML',!service.node.querySelector('img')&&service.node.textContent.includes('<img'));
 await service.respond('share-one',true);check('Rejected share does not announce success',service.pending.has('share-one')&&notices.at(-1)==='Insert failed');
 fail=false;await Promise.all([service.respond('share-one',true),service.respond('share-one',true)]);check('Double acceptance produces one save request',acceptCalls===2&&!service.pending.size&&notices.at(-1)==='Contact saved.');
 service.add({RequestId:'new',SenderName:'A',Contact:{name:'B',phone:'5551234567'},ExpiresIn:60});window.dispatchEvent(new MessageEvent('message',{data:{Action:'Contacts/ClearShares'}}));check('Character reset clears pending private cards',service.pending.size===0&&service.node.hidden);service.destroy();
 return{results,passed:results.length,liveFiveM:false,actualMySQL:false,network:'mocked',renderer:'Chromium'};
 }''')
 page.evaluate("window.__editor.msg('')")
 page.screenshot(path=str(R/'artifacts/peak-upgrade/job-creator-preview.png'))
 result['pageErrors']=errors;assert not errors,errors
 (R/'artifacts/peak-upgrade/browser-jobs-results.json').parent.mkdir(parents=True,exist_ok=True);(R/'artifacts/peak-upgrade/browser-jobs-results.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2));b.close()
