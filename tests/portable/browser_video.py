"""Actual Chromium RTCPeerConnection, with synthetic canvas/audio (NOT a live FiveM camera/TURN test)."""
import json, os
from pathlib import Path
from playwright.sync_api import sync_playwright
R=Path(__file__).resolve().parents[2]
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
 page=b.new_page();page.set_content('<html><body></body></html>');errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 modules={f.name:f.read_text() for f in (R/'web/public/duo').glob('*.mjs')}
 page.evaluate('''async modules=>{const u={};function build(n){if(u[n])return u[n];let s=modules[n].replace(/(['"])\\.\\/([^'"\\n]+\\.mjs)\\1/g,(_,q,d)=>q+build(d)+q);return u[n]=URL.createObjectURL(new Blob([s],{type:'text/javascript'}));}window.VideoService=(await import(build('video-service.mjs'))).VideoService;window.GameCapture=(await import(build('game-capture.mjs'))).GameCapture;}''',modules)
 result=page.evaluate('''async()=>{
 const results=[];const check=(name,pass)=>{results.push({name,passed:!!pass});if(!pass)throw Error(name);};
 const until=async(fn,ms=12000)=>{const end=Date.now()+ms;while(!fn()){if(Date.now()>end)throw Error('Timeout: '+JSON.stringify({notices,signals,states:peers?.map(v=>({error:v.snapshot().error,connection:v.session?.pc?.connectionState,ice:v.session?.pc?.iceConnectionState,gather:v.session?.pc?.iceGatheringState,signal:v.session?.pc?.signalingState}))}));await new Promise(r=>setTimeout(r,50));}};
 let canvases=[],contexts=[],stopped=0;const notices=[];
 function capture(){const c=document.createElement('canvas');c.width=160;c.height=90;document.body.append(c);const g=c.getContext('2d');let x=0;const render=()=>{g.fillStyle=x++%2?'#123456':'#654321';g.fillRect(0,0,160,90);g.fillStyle='white';g.fillText(String(x),5,20);};render();const timer=setInterval(render,45),stream=c.captureStream(15);canvases.push(c);return {stream,setEnabled(v){stream.getTracks().forEach(t=>t.enabled=v)},stop(){clearInterval(timer);stream.getTracks().forEach(t=>t.stop());c.remove();stopped++;}};}
 function mic(){const ctx=new AudioContext(),dest=ctx.createMediaStreamDestination(),osc=ctx.createOscillator();osc.frequency.value=220;const gain=ctx.createGain();gain.gain.value=0;osc.connect(gain).connect(dest);osc.start();contexts.push(ctx);return Promise.resolve(dest.stream);}
 const ready=new Set(),signals=[],statuses=[];let peers=[];
 const send=(index)=>async(name,data)=>{
   if(name==='Facetime/Ready'){ready.add(index);if(ready.size===2)setTimeout(()=>peers[0].handle({Action:'Video/Offer',CallId:'pair',Restart:false}),0);return true;}
   if(name==='Facetime/Signal'){signals.push({index,signal:data.Signal});setTimeout(()=>peers[1-index].handle({Action:'Video/Signal',CallId:data.CallId,Signal:data.Signal}),0);return true;}
   if(name==='Calls/ToggleMute')return {Success:true,Muted:data.Muted};
   if(name==='Facetime/Status'){statuses.push(data.Status);return true;}
   if(name==='Facetime/ToggleVideo')return {Success:true,Requested:data.Enabled,Enabled:data.Enabled};
   if(name==='Facetime/FlipCamera')return {Success:true,Front:false};
   return {Success:true};
 };
 peers=[0,1].map(i=>new VideoService({send:send(i),captureFactory:capture,getMicrophone:mic,notify:n=>notices.push(n)}));
 await Promise.all(peers.map((v,i)=>v.handle({Action:'Video/Start',CallId:'pair',AudioMode:'webrtc',Initiator:i===0,RelayOnly:false,IceServers:[],ConnectionTimeout:15,Width:160,Height:90})));
 await until(()=>peers.every(v=>v.session?.pc?.signalingState==='stable' && v.session.pc.remoteDescription && v.session.remote.getTracks().length===2));
 check('Two actual RTCPeerConnections exchange audio/video SDP and remote tracks',peers.every(v=>v.session.remote.getAudioTracks().length===1&&v.session.remote.getVideoTracks().length===1));
 await new Promise(r=>setTimeout(r,700));
 const stats=await Promise.all(peers.map(v=>v.session.pc.getStats()));
 const mediaPassed=stats.every(s=>[...s.values()].some(x=>x.type==='inbound-rtp'&&x.kind==='video'&&x.bytesReceived>0));
 check('Description signaling uses server ABI',signals.filter(x=>x.signal.type==='description').every(x=>['offer','answer'].includes(x.signal.description.type)));
 check('No webcam track supplied',peers.every(v=>v.session.local.getVideoTracks()[0]===v.session.capture.stream.getVideoTracks()[0]));
 await peers[0].muteMicrophone();check('Microphone mute only changes local audio track',!peers[0].session.local.getAudioTracks()[0].enabled&&peers[0].session.local.getVideoTracks()[0].enabled);
 await peers[0].muteMicrophone();await peers[0].toggleCamera();check('Camera pause disables game track',!peers[0].session.local.getVideoTracks()[0].enabled&&peers[0].session.local.getAudioTracks()[0].enabled);
 await peers[0].toggleCamera();check('Camera resume retains negotiated peer instance',peers[0].session.pc.signalingState==='stable'&&peers[0].session.local.getVideoTracks()[0].enabled);
 await peers[0].handle({Action:'Video/CaptureState',CallId:'pair',Enabled:false,Requested:true,Front:true});check('Phone hide pauses video without dropping audio',!peers[0].session.capture.stream.getVideoTracks()[0].enabled&&peers[0].session.local.getAudioTracks()[0].enabled);
 await peers[0].handle({Action:'Video/CaptureState',CallId:'pair',Enabled:true,Requested:true,Front:true});
 const tracks=peers.flatMap(v=>v.session.local.getTracks()),pcs=peers.map(v=>v.session.pc);
 peers.forEach(v=>v.destroy());check('Hangup closes both peer connections',pcs.every(pc=>pc.connectionState==='closed'));
 check('Hangup stops every local media track',tracks.every(t=>t.readyState==='ended'));check('Capture canvases and singleton audio elements are removed',document.querySelectorAll('canvas,audio').length===0);
 contexts.forEach(c=>c.close());
 // Delayed microphone permission granted after cancellation must not resurrect a call.
 let grant;const late=new VideoService({send:async()=>true,captureFactory:capture,getMicrophone:()=>new Promise(r=>grant=r)});
 const starting=late.start({CallId:'late',AudioMode:'webrtc',RelayOnly:false,IceServers:[]});await new Promise(r=>setTimeout(r,30));late.stop('late');
 const stream=await mic();grant(stream);await starting;await new Promise(r=>setTimeout(r,0));check('Late permission grant stops its tracks',stream.getTracks().every(t=>t.readyState==='ended')&&late.session===null);late.destroy();contexts.forEach(c=>c.close().catch(()=>{}));
 // Candidate ordering and negotiation role use a small PC stub to force pre-SDP arrival.
 const candidateCalls=[];const stub={remoteDescription:null,signalingState:'stable',async addIceCandidate(v){candidateCalls.push(v)},async setRemoteDescription(d){this.remoteDescription=d},async createAnswer(){return {type:'answer',sdp:'v=0'}},async setLocalDescription(d){this.localDescription=d;this.signalingState='stable'},close(){}};
 const ordering=new VideoService({send:async()=>true});const s=ordering.session={id:'order',generation:ordering.generation,pc:stub,initiator:false,candidates:[],stopped:false};
 await ordering.signal(s,{type:'ice',candidate:{candidate:'candidate:test'}});check('ICE is queued before remote SDP',candidateCalls.length===0&&s.candidates.length===1);
 await ordering.signal(s,{type:'description',description:{type:'offer',sdp:'v=0'}});check('Queued ICE is drained after SDP',candidateCalls.length===1&&s.candidates.length===0);
 let blocked=false;try{await ordering.signal(s,{type:'description',description:{type:'answer',sdp:'v=0'}})}catch{blocked=true;}check('Callee rejects an unexpected answer',blocked);ordering.destroy();
 let captureBlocked=false;try{new GameCapture()}catch{captureBlocked=true;}check('Game capture refuses ordinary browser environments',captureBlocked);
 check('No error notices during SDP/control test',notices.length===0);
 return {results,passed:results.length,actualWebRTC:true,actualMediaPassed:mediaPassed,mediaBlocker:mediaPassed?null:'Managed Chromium WebRtcIPHandling=disable_non_proxied_udp produced no usable candidates. Media packet delivery, TURN and live FiveM were NOT validated.',media:'synthetic canvas and silent audio',liveFiveM:false,TURN:false,bytes:stats.map(s=>[...s.values()].filter(x=>x.type==='inbound-rtp').map(x=>({kind:x.kind,bytesReceived:x.bytesReceived}))),notices};
 }''')
 result['pageErrors']=errors
 (R/'artifacts/portable/browser-video-results.json').parent.mkdir(parents=True,exist_ok=True);(R/'artifacts/portable/browser-video-results.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2));b.close()
