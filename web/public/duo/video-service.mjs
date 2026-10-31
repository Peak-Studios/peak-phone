import { RingtonePlayer } from './ringtones.mjs';
import { GameCapture } from './game-capture.mjs';
import { phoneMedia } from './media-output.mjs';
import { connectionStatus, tuneVideoSenders, addIce, mediaError } from './rtc-utils.mjs';
/** A single accepted call owns media; app panes/folding never own its lifetime. */
export class VideoService extends EventTarget {
  constructor({send, notify=()=>{}, captureFactory=options=>new GameCapture(options),
    getMicrophone=()=>navigator.mediaDevices.getUserMedia({video:false,audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}}),
    peerFactory=config=>new RTCPeerConnection(config), clock=()=>Date.now()}={}) {
    super(); Object.assign(this,{send,notify,captureFactory,getMicrophone,peerFactory,clock});
    this.generation=0;this.state=null;this.session=null;this.error='';this.audioBlocked=false;
    this.ringer=new RingtonePlayer({onError:notify});this.muted=false;this.closedIds=new Set();this.lastEnded=null;
    this.unlock=()=>{
      if(this.audio?.srcObject)this.audio.play().then(()=>{this.audioBlocked=false;this.changed();}).catch(()=>{});
    };
    globalThis.addEventListener?.('pointerdown',this.unlock);globalThis.addEventListener?.('keydown',this.unlock);
  }
  snapshot(){const s=this.session;return {state:this.state,error:this.error,connected:!!s?.connected,
    local:s?.local||null,remote:s?.remote||null,micEnabled:s?.micEnabled!==false,videoEnabled:s?.videoEnabled!==false,
    front:s?.front===true,audioBlocked:this.audioBlocked,startedAt:s?.connectedAt||0,ending:this.lastEnded,
    audioMode:s?.audioMode||this.state?.AudioMode||'voice',speaker:!!this.speaker,status:s?.status||'connecting'};}
  changed(){this.dispatchEvent(new Event('change'));}
  async rpc(name,data){const result=await this.send(name,data);
    if(result==null||result===false||result?.Success===false||result?.__phoneError)
      throw Error(result?.Msg||result?.Error||result?.error||'The server rejected this call action.');
    return result;
  }
  async handle(data){
    if(!data||typeof data!=='object')return;
    if(!phoneMedia.powered && !['Video/Stop','Video/Ring'].includes(data.Action))return;
    const s=this.session;
    switch(data.Action){
      case 'Video/State': {
        const next=data.Data?.Kind==='video'?data.Data:null;
        if(next&&this.closedIds.has(next.CallId))return;
        if(next&&s&&next.CallId!==s.id)return;
        this.state=next;if(s&&s.audioMode==='voice'&&next)s.micEnabled=!next.Muted;this.changed();break;
      }
      case 'Video/Start': await this.start(data);break;
      case 'Video/Stop': this.stop(data.CallId,data.Reason);break;
      case 'Video/Offer': case 'Video/Signal':
        if(s?.id!==data.CallId)return;
        if(!s.pc){if(s.early.length<512)s.early.push(data);else this.fail(s,Error('Too many pending call messages.'));return;}
        await this.queue(s,()=>data.Action==='Video/Offer'?this.offer(s,!!data.Restart):this.signal(s,data.Signal));break;
      case 'Video/CaptureState':
        if(s?.id===data.CallId){s.videoEnabled=!!data.Enabled;s.requested=!!data.Requested;s.front=data.Front!==false;
          s.capture?.setEnabled(s.videoEnabled);this.changed();}break;
      case 'Video/MuteRingtone': this.setMuted(data.Muted);break;
      case 'Video/Ring': if(!data.Enabled||!this.closedIds.has(data.CallId))this.ring(data);break;
    }
  }
  valid(s){return this.session===s&&this.generation===s.generation&&!s.stopped;}
  async start(data){
    // A delayed server event must not re-enable capture after local power-off.
    if(!phoneMedia.powered)return;
    if(typeof data.CallId!=='string'||this.closedIds.has(data.CallId)||this.session?.id===data.CallId)return;
    const state=this.state?.CallId===data.CallId?this.state:null;
    if(this.session)this.stop(this.session.id,'Another call started');
    this.state=state;this.error='';this.lastEnded=null;this.ring({Enabled:false});
    const generation=++this.generation;
    const s=this.session={id:data.CallId,generation,initiator:!!data.Initiator,remote:new MediaStream(),local:new MediaStream(),
      candidates:[],early:[],chain:Promise.resolve(),audioMode:data.AudioMode==='webrtc'?'webrtc':'voice',
      micEnabled:true,videoEnabled:true,front:false,requested:true,name:data.ContactName,stopped:false,connected:false,
      options:{bitrate:data.Bitrate,fps:data.FPS},status:'connecting'};
    const limit=Math.min(60000,Math.max(10000,(Number(data.ConnectionTimeout)||30)*1000));
    s.timeout=setTimeout(()=>this.fail(s,Error('Video could not connect. Check the server TURN relay and try again.')),limit);
    s.heartbeat=setInterval(()=>{if(this.valid(s))this.rpc('Facetime/Heartbeat',{CallId:s.id}).catch(error=>this.fail(s,error));},5000);
    this.changed();
    try {
      s.capture=await this.captureFactory({width:data.Width,height:data.Height,fps:data.FPS,invertTextureY:false,onError:error=>this.fail(s,error)});
      if(!this.valid(s)){s.capture?.stop();return;}
      s.capture.setEnabled(s.videoEnabled);
      s.capture.stream.getVideoTracks().forEach(track=>s.local.addTrack(track));
      if(!s.local.getVideoTracks().length)throw Error('The game camera did not produce a video track.');
      // Default is the game's voice service. Never request a webcam; only the
      // explicit WebRTC audio mode requests a microphone, with a bounded wait.
      if(s.audioMode==='webrtc'){
        let expired=false;
        const pending=Promise.resolve().then(()=>this.getMicrophone());
        pending.then(stream=>{if(expired||!this.valid(s))stream.getTracks().forEach(t=>t.stop());},()=>{});
        try {
          s.microphone=await Promise.race([pending,new Promise((_,reject)=>{s.cancelStart=reject;}),new Promise((_,reject)=>{
            s.micTimer=setTimeout(()=>{expired=true;reject(Error('Microphone permission timed out. Use game-voice audio or allow the microphone.'));},8000);
          })]);
        } finally {clearTimeout(s.micTimer);s.cancelStart=null;}
        if(!this.valid(s)){s.microphone.getTracks().forEach(t=>t.stop());return;}
        if(!s.microphone.getAudioTracks().length)throw Error('No microphone audio track is available.');
        s.microphone.getAudioTracks().forEach(track=>s.local.addTrack(track));
      }
      const pc=s.pc=this.peerFactory({iceServers:Array.isArray(data.IceServers)?data.IceServers:[],
        iceTransportPolicy:data.RelayOnly===false?'all':'relay',bundlePolicy:'max-bundle'});
      pc.onicecandidate=event=>{if(this.valid(s))this.rpc('Facetime/Signal',{CallId:s.id,Signal:{type:'ice',
        candidate:event.candidate?.toJSON?.()||event.candidate||false}}).catch(error=>this.fail(s,error));};
      pc.onicecandidateerror=event=>{if(this.valid(s))s.iceError=Number(event.errorCode)||0;};
      pc.ontrack=event=>{
        if(!this.valid(s))return;
        if(!s.remote.getTracks().some(t=>t.id===event.track.id))s.remote.addTrack(event.track);
        if(event.track.kind==='audio')this.attachAudio(s);
        event.track.addEventListener('unmute',()=>{if(this.valid(s))this.changed();});
        this.changed();
      };
      pc.onconnectionstatechange=pc.oniceconnectionstatechange=()=>this.connectionChanged(s);
      for(const track of s.local.getTracks()){
        pc.addTrack(track,s.local);
        track.addEventListener('ended',()=>{if(this.valid(s))this.fail(s,Error(track.kind==='audio'?'Microphone disconnected.':'Game capture stopped.'));},{once:true});
      }
      for(const event of s.early.splice(0))await this.handle(event);
      if(!this.valid(s))return;
      await this.rpc('Facetime/Ready',{CallId:s.id});this.changed();
    } catch(error){this.fail(s,error);}
  }
  connectionChanged(s){
    if(!this.valid(s))return;
    const status=connectionStatus(s.pc);
    if(s.lastStatus===status)return;
    s.lastStatus=status;s.status=status;
    if(status==='connected'){
      s.connected=true;s.connectedAt=s.connectedAt||this.clock();
      clearTimeout(s.timeout);clearTimeout(s.disconnectTimer);s.disconnectTimer=null;
      void tuneVideoSenders(s.pc,s.options);
      this.rpc('Facetime/Status',{CallId:s.id,Status:'connected'}).catch(error=>this.fail(s,error));
    } else if(status==='disconnected'||status==='failed'){
      // Even "failed" can recover via a server-authorized ICE restart. Do not
      // hang up both players on the first temporary network interruption.
      s.connected=false;
      this.rpc('Facetime/Status',{CallId:s.id,Status:'disconnected'}).catch(()=>{});
      if(!s.disconnectTimer)s.disconnectTimer=setTimeout(()=>this.fail(s,Error('The video connection was lost. Please call again.')),18000);
    } else if(status==='closed'){this.fail(s,Error('The video connection closed.'));return;}
    this.changed();
  }
  queue(s,fn){s.chain=s.chain.then(()=>this.valid(s)?fn():undefined).catch(error=>this.fail(s,error));return s.chain;}
  async offer(s,restart){
    if(!this.valid(s)||!s.pc||!s.initiator||s.pc.signalingState!=='stable')return;
    await s.pc.setLocalDescription(await s.pc.createOffer({iceRestart:restart}));
    if(this.valid(s))await this.rpc('Facetime/Signal',{CallId:s.id,Signal:{type:'description',description:{type:'offer',sdp:s.pc.localDescription.sdp}}});
  }
  async signal(s,message){
    if(!message||!s.pc||!this.valid(s))return;
    if(message.type==='ice'){
      const candidate=message.candidate||null;
      if(!s.pc.remoteDescription){if(s.candidates.length>=512)throw Error('Too many queued ICE candidates.');s.candidates.push(candidate);return;}
      await addIce(s.pc,candidate);return;
    }
    if(message.type!=='description'||!message.description)throw Error('Invalid video signaling message.');
    const d=message.description;
    if(!['offer','answer'].includes(d.type)||typeof d.sdp!=='string'||d.sdp.length>50000)throw Error('Invalid video signaling message.');
    if((d.type==='offer'&&s.initiator)||(d.type==='answer'&&!s.initiator))throw Error('Invalid video negotiation role.');
    if(d.type==='answer'&&s.pc.signalingState==='stable')return;
    if(d.type==='offer'&&s.pc.signalingState!=='stable')return;
    await s.pc.setRemoteDescription({type:d.type,sdp:d.sdp});
    if(!this.valid(s))return;
    for(const candidate of s.candidates.splice(0))await addIce(s.pc,candidate);
    if(d.type==='offer'){
      await s.pc.setLocalDescription(await s.pc.createAnswer());
      if(this.valid(s))await this.rpc('Facetime/Signal',{CallId:s.id,Signal:{type:'description',description:{type:'answer',sdp:s.pc.localDescription.sdp}}});
    }
    if(this.valid(s))void tuneVideoSenders(s.pc,s.options);
  }
  attachAudio(s){
    if(!this.audio){this.audio=document.createElement('audio');this.audio.autoplay=true;this.audio.volume=this.speaker?1:0.6;this.audio.setAttribute('aria-hidden','true');document.body.append(this.audio);}
    if(this.audio.srcObject!==s.remote)this.audio.srcObject=s.remote;
    this.audio.play().then(()=>{if(this.valid(s)){this.audioBlocked=false;this.changed();}})
      .catch(()=>{if(this.valid(s)){this.audioBlocked=true;this.changed();}});
  }
  setSpeaker(enabled){this.speaker=!!enabled;if(this.audio)this.audio.volume=this.speaker?1:0.6;this.changed();}
  async muteMicrophone(){
    const s=this.session;if(!s)return;
    if(s.audioMode==='voice'){
      const result=await this.rpc('Calls/ToggleMute',{CallId:s.id,Muted:s.micEnabled});
      if(this.valid(s)){s.micEnabled=!result.Muted;this.changed();}return;
    }
    const muted=s.micEnabled;
    // Mute immediately for privacy. Unmute only after the server acknowledges it;
    // a rejected/late request must never accidentally reopen the microphone.
    if(muted){s.micEnabled=false;s.local.getAudioTracks().forEach(t=>t.enabled=false);this.changed();}
    const result=await this.rpc('Calls/ToggleMute',{CallId:s.id,Muted:muted});
    if(this.valid(s)&&result.Muted===muted){s.micEnabled=!muted;s.local.getAudioTracks().forEach(t=>t.enabled=!muted);this.changed();}
  }
  async toggleCamera(){const s=this.session;if(!s)return;
    const result=await this.rpc('Facetime/ToggleVideo',{CallId:s.id,Enabled:!s.requested});
    if(this.valid(s)){s.requested=!!result.Requested;s.videoEnabled=!!result.Enabled;s.capture?.setEnabled(s.videoEnabled);this.changed();}
  }
  async flipCamera(){const s=this.session;if(s){const result=await this.rpc('Facetime/FlipCamera',{CallId:s.id});if(this.valid(s)&&typeof result.Front==='boolean'){s.front=result.Front;this.changed();}}}
  async hangup(){
    const id=this.session?.id||this.state?.CallId;if(!id)return;
    // Release UI/media BEFORE any network wait. A dropped reply cannot trap the player.
    this.stop(id,'Call ended');
    try {await this.rpc('Facetime/EndCall',{CallId:id});}
    catch(error){this.send('Facetime/Abort',{CallId:id}).catch(()=>{});throw error;}
  }
  fail(s,error){
    if(!this.valid(s))return;
    const message=mediaError(error);this.error=message;
    console.warn('[Peak Duo video]',error?.name||'Error',message);
    this.stop(s.id,message);
    this.send('Facetime/Abort',{CallId:s.id,Reason:message}).catch(()=>{});this.notify(message);
  }
  stop(id,reason=''){
    if(id&&this.session&&this.session.id!==id)return;
    if(id&&!this.session&&this.state&&this.state.CallId!==id)return;
    const s=this.session,endedId=id||s?.id||this.state?.CallId;
    ++this.generation;this.session=null;
    if(endedId){this.closedIds.add(endedId);if(this.closedIds.size>32)this.closedIds.delete(this.closedIds.values().next().value);
      this.lastEnded={id:endedId,reason};}
    if(s){
      s.stopped=true;s.cancelStart?.(Error('Call cancelled'));s.cancelStart=null;clearTimeout(s.timeout);clearTimeout(s.disconnectTimer);clearTimeout(s.micTimer);clearInterval(s.heartbeat);
      if(s.pc){s.pc.ontrack=s.pc.onicecandidate=s.pc.onconnectionstatechange=s.pc.oniceconnectionstatechange=s.pc.onicecandidateerror=null;try{s.pc.close();}catch{}}
      try{s.capture?.stop();}catch{}
      for(const stream of [s.local,s.microphone,s.remote])for(const track of stream?.getTracks()||[])try{track.stop();}catch{}
    }
    if(this.audio){this.audio.pause();this.audio.srcObject=null;this.audio.remove();this.audio=null;}
    if(!id||!this.state||this.state.CallId===id)this.state=null;
    this.audioBlocked=false;this.speaker=false;this.ring({Enabled:false});
    if(reason&&!['Call ended','Character unloaded','Another call started'].includes(reason)&&!this.error)this.error=reason;
    this.changed();
  }
  setMuted(value){this.muted=!!value;this.ringer.setMuted(value);}
  ring(data){this.ringer.ring(data);}
  destroy(){this.stop();this.ringer.destroy();globalThis.removeEventListener?.('pointerdown',this.unlock);globalThis.removeEventListener?.('keydown',this.unlock);}
}
