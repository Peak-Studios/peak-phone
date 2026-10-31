import test from 'node:test';
import assert from 'node:assert/strict';
import {isNuiMessage,connectionStatus,tuneVideoSenders,addIce} from '../../web/public/duo/rtc-utils.mjs';
import {VideoService} from '../../web/public/duo/video-service.mjs';
import {KilogramLive} from '../../web/public/duo/kilogram-live.mjs';
import {callDuration} from '../../web/public/duo/call-ui.mjs';

class Track extends EventTarget {constructor(kind='video'){super();this.kind=kind;this.id=kind+Math.random();this.enabled=true;this.readyState='live';}stop(){this.readyState='ended';}}
class Stream{constructor(tracks=[]){this.tracks=tracks;}addTrack(t){this.tracks.push(t);}getTracks(){return this.tracks;}getVideoTracks(){return this.tracks.filter(t=>t.kind==='video');}getAudioTracks(){return this.tracks.filter(t=>t.kind==='audio');}}
globalThis.MediaStream=Stream;globalThis.window=new EventTarget();window.parent=window;
class Peer{
 constructor(config){this.config=config;this.senders=[];this.signalingState='stable';this.connectionState='new';this.iceConnectionState='new';this.ice=[];this.offers=0;}
 addTrack(track){const sender={track,getParameters:()=>({encodings:[]}),setParameters:async()=>{throw new DOMException('optional tuning unsupported','InvalidModificationError');}};this.senders.push(sender);return sender;}
 getSenders(){return this.senders;}
 async createOffer(options){this.offers++;this.restart=options?.iceRestart;return {type:'offer',sdp:'v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n'};}
 async createAnswer(){return {type:'answer',sdp:'v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n'};}
 async setLocalDescription(d){this.localDescription=d;this.signalingState=d.type==='offer'?'have-local-offer':'stable';}
 async setRemoteDescription(d){this.remoteDescription=d;this.signalingState=d.type==='offer'?'have-remote-offer':'stable';}
 async addIceCandidate(c){this.ice.push(c);}
 close(){this.connectionState=this.iceConnectionState='closed';}
}
const capture=()=>{const stream=new Stream([new Track()]);return {stream,setEnabled:v=>stream.getTracks().forEach(t=>t.enabled=v),stop:()=>stream.getTracks().forEach(t=>t.stop())};};
const tick=()=>new Promise(r=>setImmediate(r));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function video(t,extra={}){const requests=[];const service=new VideoService({send:async(route,data)=>{requests.push({route,data});return {Success:true};},captureFactory:capture,peerFactory:c=>new Peer(c),...extra});t.after(()=>service.destroy());return {service,requests};}
const start={CallId:'call-A',Initiator:true,IceServers:[],RelayOnly:false,AudioMode:'voice',ConnectionTimeout:30};
const liveInfo={id:'room-A',host:{name:'Host'},started_at:Date.now()};
function live(t,role='host',extra={}){
 const requests=[];const sender=async(route,data)=>{requests.push({route,data});if(['KiloLive/Start','KiloLive/Join'].includes(route))return {Success:true,session:liveInfo,role,source:role==='host'?1:2,token:role+'-token',hostSource:1,hostToken:'host-token',iceServers:[],settings:{maxViewers:8,connectionTimeout:25,commentHistory:30,relayOnly:false,bitrate:600000,fps:20}};return {Success:true,session:liveInfo};};
 const service=new KilogramLive({send:sender,captureFactory:capture,peerFactory:c=>new Peer(c),...extra});t.after(()=>service.destroy());return {service,requests};
}
const nui=(service,kind,data,source=null)=>service.onMessage({source,data:{Action:'KiloLive/Event',SessionId:'room-A',Token:service.session?.token,Kind:kind,Data:data}});

test('FiveM null source, parent and local replay accepted; unrelated frames rejected',()=>{
 const root={};root.parent={};assert.ok(isNuiMessage({source:null},root));assert.ok(isNuiMessage({source:root},root));assert.ok(isNuiMessage({source:root.parent},root));assert.equal(isNuiMessage({source:{}},root),false);
});
test('Empty sender encodings are deferred, not replaced with an illegal encoding count',async()=>{
 let called=0;const pc={getSenders:()=>[{track:{kind:'video'},getParameters:()=>({encodings:[]}),setParameters:async()=>called++}]};assert.deepEqual(await tuneVideoSenders(pc),['deferred']);assert.equal(called,0);
});
test('Unsupported sender hints cannot reject SDP negotiation',async()=>{
 const pc={getSenders:()=>[{track:{kind:'video'},getParameters:()=>({encodings:[{}]}),setParameters:async()=>{throw new DOMException('Rejected','InvalidModificationError');}}]};assert.deepEqual(await tuneVideoSenders(pc),['InvalidModificationError']);
});
test('Sender tuning preserves RID/encoding count and clamps only video hints',async()=>{
 let parameters;const sender={track:{kind:'video'},getParameters:()=>({transactionId:'same',encodings:[{rid:'hi',active:true}]}),setParameters:async p=>parameters=p};
 await tuneVideoSenders({getSenders:()=>[sender]},{bitrate:9e9,fps:200});assert.equal(parameters.encodings.length,1);assert.equal(parameters.encodings[0].rid,'hi');assert.equal(parameters.encodings[0].maxBitrate,3000000);assert.equal(parameters.encodings[0].maxFramerate,30);
});
test('ICE-only CEF fallback does not mask an aggregate DTLS failure',()=>{
 assert.equal(connectionStatus({iceConnectionState:'completed'}),'connected');assert.equal(connectionStatus({connectionState:'failed',iceConnectionState:'connected'}),'failed');assert.equal(connectionStatus({connectionState:'connecting',iceConnectionState:'connected'}),'connecting');
});
test('Optional end-of-candidates ignored, genuine candidate errors still reported',async()=>{
 let count=0;const pc={addIceCandidate:async()=>{count++;throw Error('Invalid candidate');}};await addIce(pc,null);await addIce(pc,false);await addIce(pc,{candidate:''});assert.equal(count,0);await assert.rejects(()=>addIce(pc,{candidate:'bad'}));assert.equal(count,1);
});
test('Default game voice never requests a browser microphone or webcam',async t=>{
 let mic=0;const {service}=video(t,{getMicrophone:()=>{mic++;throw Error('Unexpected mic');}});await service.start({...start,AudioMode:undefined});assert.equal(mic,0);assert.equal(service.session.local.getTracks().length,1);assert.equal(service.session.pc.config.iceTransportPolicy,'all');
});
test('Production relay policy remains fail-closed by default',async t=>{
 const {service}=video(t);await service.start({...start,RelayOnly:undefined});assert.equal(service.session.pc.config.iceTransportPolicy,'relay');
});
test('An early offer waits for game capture rather than disappearing',async t=>{
 const gate=deferred();const {service,requests}=video(t,{captureFactory:()=>gate.promise});const starting=service.start(start);
 await service.handle({Action:'Video/Offer',CallId:start.CallId});assert.equal(service.session.early.length,1);gate.resolve(capture());await starting;assert.equal(service.session.pc.offers,1);assert.ok(requests.some(r=>r.route==='Facetime/Signal'&&r.data.Signal.description?.type==='offer'));
});
test('Hangup closes tracks/peer immediately even when the HTTP reply never arrives',async t=>{
 const gate=deferred();const {service}=video(t,{send:async(route)=>route==='Facetime/EndCall'?gate.promise:{Success:true}});await service.start(start);const pc=service.session.pc,tracks=service.session.local.getTracks();const ending=service.hangup();assert.equal(service.session,null);assert.equal(pc.connectionState,'closed');assert.ok(tracks.every(t=>t.readyState==='ended'));gate.resolve({Success:true});await ending;
});
test('Delayed Video/Start after local cancellation cannot resurrect the call',async t=>{
 let captures=0;const {service}=video(t,{captureFactory:()=>{captures++;return capture();}});await service.handle({Action:'Video/State',Data:{CallId:'cancelled',Kind:'video',Status:'ringing'}});service.stop('cancelled','Call ended');await service.start({...start,CallId:'cancelled'});assert.equal(service.session,null);assert.equal(captures,0);
});
test('A stale stop/state cannot tear down a newer call',async t=>{
 const {service}=video(t);await service.start(start);service.stop('old-call');assert.equal(service.session.id,start.CallId);await service.handle({Action:'Video/State',Data:{Kind:'video',CallId:'old-call'}});assert.notEqual(service.state?.CallId,'old-call');
});
test('Cancel pending microphone permission resolves startup and stops any late stream',async t=>{
 const gate=deferred();const {service}=video(t,{getMicrophone:()=>gate.promise});const starting=service.start({...start,AudioMode:'webrtc'});await tick();service.stop(start.CallId);await starting;const stream=new Stream([new Track('audio')]);gate.resolve(stream);await tick();assert.equal(stream.getAudioTracks()[0].readyState,'ended');assert.equal(service.session,null);
});
test('ICE-only connection callback clears timeout and reports connected',async t=>{
 const {service,requests}=video(t);await service.start(start);service.session.pc.connectionState=undefined;service.session.pc.iceConnectionState='completed';service.session.pc.oniceconnectionstatechange();assert.equal(service.snapshot().connected,true);await tick();assert.ok(requests.some(r=>r.route==='Facetime/Status'&&r.data.Status==='connected'));
});
test('Camera toggle and flip keep the same negotiated peer and expose real state',async t=>{
 const {service}=video(t,{send:async(route,data)=>route==='Facetime/ToggleVideo'?{Success:true,Enabled:data.Enabled,Requested:data.Enabled}:route==='Facetime/FlipCamera'?{Success:true,Front:false}:{Success:true}});await service.start(start);const pc=service.session.pc;await service.toggleCamera();assert.equal(service.session.local.getVideoTracks()[0].enabled,false);await service.toggleCamera();assert.equal(service.session.pc,pc);await service.flipCamera();assert.equal(service.snapshot().front,false);
});
test('Incoming ICE is queued until remote SDP; duplicate SDP is harmless',async t=>{
 const {service}=video(t);await service.start({...start,Initiator:false});const s=service.session;await service.signal(s,{type:'ice',candidate:{candidate:'candidate:test'}});assert.equal(s.pc.ice.length,0);await service.signal(s,{type:'description',description:{type:'offer',sdp:'v=0'}});assert.equal(s.pc.ice.length,1);assert.equal(s.pc.signalingState,'stable');
});
test('Negotiation failure releases media and aborts the authoritative call',async t=>{
 const {service,requests}=video(t);await service.start({...start,Initiator:false});const track=service.session.local.getVideoTracks()[0];await service.handle({Action:'Video/Signal',CallId:start.CallId,Signal:{type:'description',description:{type:'answer',sdp:'v=0'}}});assert.equal(service.session,null);assert.equal(track.readyState,'ended');assert.ok(requests.some(r=>r.route==='Facetime/Abort'));
});
test('KiloGram peer-ready delivered with null source produces an offer',async t=>{
 const {service,requests}=live(t);await service.start('Test');nui(service,'peer-ready',{source:2,token:'viewer-token'});await service.session.peers.get(2).chain;assert.ok(requests.some(r=>r.route==='KiloLive/Signal'&&r.data.Signal.description?.type==='offer'));
});
test('KiloGram blocks unrelated frames and stale member tokens',async t=>{
 const {service}=live(t);await service.start('Test');nui(service,'peer-ready',{source:2,token:'viewer-token'},{});assert.equal(service.session.peers.size,0);
 service.onMessage({source:null,data:{Action:'KiloLive/Event',SessionId:'room-A',Token:'stale',Kind:'peer-ready',Data:{source:2,token:'viewer-token'}}});assert.equal(service.session.peers.size,0);
});
test('One failed viewer does not close the host capture or another viewer',async t=>{
 const {service,requests}=live(t);await service.start('Test');const s=service.session,p=service.createPeer(s,2,'viewer-token');service.createPeer(s,3,'viewer-token-3');service.peerFailed(s,p,Error('Live video could not connect'));assert.equal(service.session,s);assert.equal(s.peers.size,1);assert.equal(s.local.getVideoTracks()[0].readyState,'live');assert.ok(requests.some(r=>r.route==='KiloLive/DropPeer'&&r.data.Peer===2&&r.data.PeerToken==='viewer-token'));
});
test('Viewer candidates arriving before SDP are drained after host offer',async t=>{
 const {service,requests}=live(t,'viewer');await service.join('room-A');const s=service.session,p=s.peers.get(1);await service.receive(s,p,{type:'ice',candidate:{candidate:'candidate:test'}});assert.equal(p.pc.ice.length,0);await service.receive(s,p,{type:'description',description:{type:'offer',sdp:'v=0'}});assert.equal(p.pc.ice.length,1);assert.ok(requests.some(r=>r.data?.Signal?.description?.type==='answer'));
});
test('KiloGram ended message with null source closes every peer and track',async t=>{
 const {service}=live(t);await service.start('Test');const s=service.session,p=service.createPeer(s,2,'viewer-token'),tracks=s.local.getTracks();nui(service,'ended',{reason:'Host ended the live.'});assert.equal(service.session,null);assert.equal(p.pc.connectionState,'closed');assert.ok(tracks.every(t=>t.readyState==='ended'));
});
test('A cancelled join cleans up a late server reservation',async t=>{
 const gate=deferred(),requests=[];const {service}=live(t,'viewer',{send:async(route,data)=>{requests.push({route,data});return route==='KiloLive/Join'?gate.promise:{Success:true};}});const opening=service.join('room-A');await service.leave();gate.resolve({Success:true,session:liveInfo,token:'late-token'});await opening;assert.equal(service.session,null);assert.ok(requests.some(r=>r.route==='KiloLive/Leave'&&r.data.Token==='late-token'));
});
test('Call duration handles zero, hours and future server timestamps',()=>{assert.equal(callDuration(1000,125000),'2:04');assert.equal(callDuration(1000,3601000),'1:00:00');assert.equal(callDuration(9000,1000),'0:00');});

test('WebRTC speaker selection survives state snapshots and resets on hangup',async t=>{
 const {service}=video(t,{getMicrophone:async()=>new Stream([new Track('audio')])});
 await service.start({...start,AudioMode:'webrtc'});service.setSpeaker(true);
 await service.handle({Action:'Video/State',Data:{Kind:'video',CallId:start.CallId,LocalSpeaker:false}});
 assert.equal(service.snapshot().speaker,true);service.stop(start.CallId);assert.equal(service.snapshot().speaker,false);
});
test('Explicit microphone mute is immediate; unmute waits for authorization',async t=>{
 const gate=deferred();let useGate=false;
 const {service}=video(t,{getMicrophone:async()=>new Stream([new Track('audio')]),send:async(route,data)=>
  route==='Calls/ToggleMute'?(useGate?gate.promise:{Success:true,Muted:data.Muted}):{Success:true}});
 await service.start({...start,AudioMode:'webrtc'});const track=service.session.local.getAudioTracks()[0];
 const muting=service.muteMicrophone();assert.equal(track.enabled,false);await muting;
 useGate=true;const unmuting=service.muteMicrophone();assert.equal(track.enabled,false);
 gate.resolve({Success:true,Muted:false});await unmuting;assert.equal(track.enabled,true);
});
test('Rejected unmute leaves the real microphone track muted',async t=>{
 let reject=false;const {service}=video(t,{getMicrophone:async()=>new Stream([new Track('audio')]),send:async(route,data)=>
  route==='Calls/ToggleMute'?(reject?{Success:false,Msg:'Call ended'}:{Success:true,Muted:data.Muted}):{Success:true}});
 await service.start({...start,AudioMode:'webrtc'});await service.muteMicrophone();reject=true;
 await assert.rejects(()=>service.muteMicrophone());assert.equal(service.session.local.getAudioTracks()[0].enabled,false);
});
test('A late unmute response cannot enable a track from an ended call',async t=>{
 const gate=deferred();let useGate=false;const {service}=video(t,{getMicrophone:async()=>new Stream([new Track('audio')]),send:async(route,data)=>route==='Calls/ToggleMute'?(useGate?gate.promise:{Success:true,Muted:data.Muted}):{Success:true}});
 await service.start({...start,AudioMode:'webrtc'});await service.muteMicrophone();const track=service.session.local.getAudioTracks()[0];
 useGate=true;const unmuting=service.muteMicrophone();service.stop(start.CallId);gate.resolve({Success:true,Muted:false});await unmuting;
 assert.equal(track.readyState,'ended');assert.equal(track.enabled,false);
});
test('ICE restart keeps the peer and capture rather than creating a second session',async t=>{
 const {service}=video(t);await service.start(start);const s=service.session,pc=s.pc;
 await service.offer(s,false);await service.signal(s,{type:'description',description:{type:'answer',sdp:'v=0'}});
 await service.offer(s,true);assert.equal(service.session,s);assert.equal(s.pc,pc);assert.equal(pc.restart,true);assert.equal(pc.offers,2);
});
test('Livestream retry waits for previous membership release acknowledgement',async t=>{
 const gate=deferred(),requests=[];let leaves=0;
 const {service}=live(t,'viewer',{send:async(route,data)=>{requests.push(route);
  if(route==='KiloLive/Leave'&&++leaves===1)return gate.promise;
  if(route==='KiloLive/Join')return {Success:true,session:liveInfo,role:'viewer',source:2,token:'viewer-'+requests.length,hostSource:1,hostToken:'host',iceServers:[],settings:{connectionTimeout:25,relayOnly:false}};
  return {Success:true};}});
 await service.join('room-A');const leaving=service.leave('Retry');const joining=service.join('room-A');await tick();
 assert.equal(requests.filter(r=>r==='KiloLive/Join').length,1);assert.equal(service.session,null);
 gate.resolve({Success:true});await leaving;await joining;assert.equal(requests.filter(r=>r==='KiloLive/Join').length,2);assert.ok(service.session);
});
test('Viewer transport errors produce a retryable ending, not a finished-broadcast summary',async t=>{
 const {service}=live(t,'viewer');await service.join('room-A');nui(service,'ended',{reason:'Connection failed',retryable:true,session:liveInfo});
 assert.equal(service.session,null);assert.equal(service.ended.error,true);assert.equal(service.ended.retryId,'room-A');
});
test('Faulty capture cleanup cannot prevent peer and media-track cleanup',async t=>{
 const {service}=live(t,'host',{captureFactory:()=>{const value=capture();value.stop=()=>{throw Error('Cleanup failed');};return value;}});
 await service.start('Test');const s=service.session,p=service.createPeer(s,2,'viewer-token'),tracks=s.local.getTracks();
 service.stop('Done');assert.equal(service.session,null);assert.equal(p.pc.connectionState,'closed');assert.ok(tracks.every(track=>track.readyState==='ended'));
});
test('Permission denial releases FaceTime capture and requests authoritative abort',async t=>{
 const {service,requests}=video(t,{getMicrophone:async()=>{throw new DOMException('Denied','NotAllowedError');}});
 await service.start({...start,AudioMode:'webrtc'});assert.equal(service.session,null);assert.ok(requests.some(r=>r.route==='Facetime/Abort'));
});
