"""Real Chromium RTC negotiation: one synthetic host, two viewers; mocked server signaling."""
import json,os
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'artifacts/call-live-update';OUT.mkdir(exist_ok=True,parents=True)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
 page=b.new_page();page.set_content('<html><body></body></html>');errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.evaluate(r'''async modules=>{const urls={};function build(n){if(urls[n])return urls[n];return urls[n]=URL.createObjectURL(new Blob([modules[n].replace(/(['"])\.\/([^'"\n]+\.mjs)\1/g,(_,q,d)=>q+build(d)+q)],{type:'text/javascript'}));}window.KilogramLive=(await import(build('kilogram-live.mjs'))).KilogramLive;}''',{f.name:f.read_text() for f in (ROOT/'web/public/duo').glob('*.mjs')})
 result=page.evaluate('''async()=>{
 const checks=[],services={},signals=[];let captures=0,stops=0;
 const check=(name,ok)=>{if(!ok)throw Error(name);checks.push(name)};
 const info={id:'kg-browser-test',title:'Synthetic live',author:{id:1,handle:'host',name:'Host'},status:'live'};
 const options={width:160,height:240,fps:10,maxViewers:8,connectionTimeout:25,commentHistory:30,relayOnly:false,allowMicrophone:false,bitrate:200000};
 const emit=(source,kind,data)=>services[source]?.onMessage({source:null,data:{Action:'KiloLive/Event',SessionId:info.id,Token:'token-'+source,Kind:kind,Data:data}});
 const send=source=>async(route,data)=>{
  if(['KiloLive/Start','KiloLive/Join'].includes(route))return {Success:true,session:info,role:source===1?'host':'viewer',source,token:'token-'+source,hostSource:1,hostToken:'token-1',settings:options,iceServers:[]};
  if(route==='KiloLive/Ready'&&source!==1)setTimeout(()=>emit(1,'peer-ready',{source,token:'token-'+source}),0);
  if(route==='KiloLive/Signal'){signals.push({source,signal:data.Signal});setTimeout(()=>emit(data.Peer,'signal',{source,token:'token-'+source,signal:data.Signal}),0);}
  if(route==='KiloLive/DropPeer')emit(data.Peer,'ended',{reason:'Connection failed',session:info,retryable:true});
  if(route==='KiloLive/Leave'&&source===1)for(const n of [2,3])emit(n,'ended',{reason:'Host ended the live',session:info});
  return {Success:true,session:info};
 };
 const capture=()=>{captures++;const c=document.createElement('canvas');c.width=160;c.height=240;document.body.append(c);const g=c.getContext('2d');let frame=0;const paint=()=>{g.fillStyle=frame++%2?'#234':'#345';g.fillRect(0,0,160,240)};paint();const timer=setInterval(paint,90),stream=c.captureStream(10);return {stream,stop(){stops++;clearInterval(timer);stream.getTracks().forEach(t=>t.stop());c.remove()}}};
 for(const n of [1,2,3])services[n]=new KilogramLive({send:send(n),captureFactory:capture,microphone:()=>{throw Error('Unexpected microphone')}});
 await services[1].start(info.title);await Promise.all([services[2].join(info.id),services[3].join(info.id)]);
 const deadline=Date.now()+10000;while(![2,3].every(n=>services[n].session?.remote.getVideoTracks().length===1&&services[n].session.peers.get(1).pc.signalingState==='stable')){if(Date.now()>deadline)throw Error('Live SDP exchange timed out');await new Promise(r=>setTimeout(r,30));}
 check('Actual RTC offer/answer negotiated to two viewers via null-source events',signals.filter(s=>s.signal.type==='description').length===4);
 check('Host owns one capture for multiple viewer peers',captures===1&&services[1].session.peers.size===2);
 check('Viewer never captures its own camera or microphone',[2,3].every(n=>services[n].session.local.getTracks().length===0));
 const host=services[1].session,track=host.local.getVideoTracks()[0];
 check('Both peers publish the same game-capture track',[...host.peers.values()].every(p=>p.pc.getSenders()[0].track===track));
 await new Promise(r=>setTimeout(r,600));const stats=await Promise.all([2,3].map(n=>services[n].session.peers.get(1).pc.getStats()));
 const mediaPassed=stats.every(s=>[...s.values()].some(x=>x.type==='inbound-rtp'&&x.kind==='video'&&x.bytesReceived>0));
 services[1].peerFailed(host,host.peers.get(2),new Error('Synthetic viewer failure'));await new Promise(r=>setTimeout(r,0));
 check('Failed viewer closes without ending host or second viewer',services[1].session===host&&host.peers.size===1&&services[2].session===null&&!!services[3].session&&track.readyState==='live');
 check('Failed viewer receives retryable ending',services[2].ended.retryId===info.id&&services[2].ended.error===true);
 const pc=services[3].session.peers.get(1).pc;await services[1].leave('Host finished');
 check('Host hangup closes remaining viewer',services[3].session===null&&pc.connectionState==='closed');
 check('Host capture and track released exactly once',stops===1&&track.readyState==='ended'&&!document.querySelector('canvas'));
 Object.values(services).forEach(s=>s.destroy());
 return {passed:checks.length,checks,actualWebRTC:true,actualMediaPassed:mediaPassed,media:'synthetic canvas',TURN:false,liveFiveM:false,mediaBlocker:mediaPassed?null:'Managed Chromium disables non-proxied UDP; no usable candidate pair. Real packet delivery and production TURN remain unverified.'};
 }''')
 result['pageErrors']=errors;assert not errors; (OUT/'browser-live-results.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2));b.close()
