import { icon } from './icons.mjs?rev=owner-config-20261015';

const text=(node,value)=>{const next=String(value??'');if(node.textContent!==next)node.textContent=next;};
export function callDuration(startedAt,now=Date.now()){
  const seconds=Math.max(0,Math.floor((now-Number(startedAt||now))/1000));
  return seconds>=3600?`${Math.floor(seconds/3600)}:${String(Math.floor(seconds/60)%60).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`
    :`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
}
/** One call surface, outside app panes. Navigation and folding cannot own media. */
export class CallUI extends EventTarget {
  constructor({target,service,send,notify=()=>{},openApp=()=>{},canFocus=()=>true}){
    super();Object.assign(this,{target,service,send,notify,openApp,canFocus});
    this.state=null;this.expanded=false;this.closedIds=new Set();this.destroyed=false;this.pending=new Set();
    this.root=document.createElement('section');this.root.className='pc-root';this.root.hidden=true;
    this.root.innerHTML=`<button class="pc-return" type="button" aria-label="Return to call"><span class="pc-return-icon">${icon('phone')}</span><span class="pc-return-name"></span><span class="pc-return-time"></span>${icon('expand')}</button>
      <section class="pc-screen" role="dialog" aria-modal="true" aria-label="Phone call" hidden>
        <video class="pc-remote" autoplay playsinline muted></video><div class="pc-video-shade" aria-hidden="true"></div>
        <header class="pc-top"><button type="button" class="pc-glass pc-minimize" aria-label="Minimize call">${icon('arrow-down')}</button><div class="pc-heading"><span class="pc-kicker">FACETIME</span><h2 class="pc-name"></h2><p class="pc-status" role="status"></p></div><span class="pc-connection" title="Call connection">${icon('signal')}</span></header>
        <div class="pc-center"><div class="pc-avatar" aria-hidden="true"><span></span></div><h2 class="pc-large-name"></h2><p class="pc-main-status"></p><p class="pc-privacy"></p><span class="pc-wave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span></div>
        <div class="pc-pip" hidden><video class="pc-self" autoplay playsinline muted></video><span>You</span></div>
        <div class="pc-bottom"><div class="pc-feedback" role="alert" hidden></div><div class="pc-peer-note" role="status" hidden></div><button class="pc-unlock pc-glass" type="button" hidden>Tap to enable call audio</button>
          <div class="pc-incoming" hidden><div><button type="button" class="pc-answer pc-round" aria-label="Accept call">${icon('phone')}</button><span>Accept</span></div><div><button type="button" class="pc-decline pc-round" aria-label="Decline call">${icon('phone')}</button><span>Decline</span></div></div>
          <div class="pc-controls pc-glass" role="group" aria-label="Call controls">
            <button type="button" class="pc-control" data-call-control="mic" aria-pressed="false"><i>${icon('mic')}</i><span>Mute</span></button>
            <button type="button" class="pc-control" data-call-control="audio" aria-pressed="false"><i>${icon('speaker')}</i><span>Speaker</span></button>
            <button type="button" class="pc-control" data-call-control="camera" aria-pressed="false"><i>${icon('video')}</i><span>Camera</span></button>
            <button type="button" class="pc-control" data-call-control="flip"><i>${icon('refresh')}</i><span>Flip</span></button>
            <button type="button" class="pc-control" data-call-control="contacts"><i>${icon('users')}</i><span>Contacts</span></button>
            <button type="button" class="pc-control pc-end" data-call-control="end"><i>${icon('phone')}</i><span>End</span></button>
          </div>
        </div>
      </section>`;
    target.append(this.root);this.$=s=>this.root.querySelector(s);this.controls={};
    for(const node of this.root.querySelectorAll('[data-call-control]'))this.controls[node.dataset.callControl]=node;
    this.$('.pc-return').onclick=()=>this.setExpanded(true);
    this.$('.pc-minimize').onclick=()=>this.setExpanded(false);
    this.$('.pc-answer').onclick=()=>this.action('answer',()=>this.rpc('Calls/AnswerCall',{CallId:this.state?.CallId}));
    this.$('.pc-decline').onclick=()=>this.end();this.controls.end.onclick=()=>this.end();
    this.controls.mic.onclick=()=>this.action('mic',async()=>{
      if(this.state?.Kind==='video'&&this.service.session)await this.service.muteMicrophone();
      else {const id=this.state?.CallId;const result=await this.rpc('Calls/ToggleMute',{CallId:id,Muted:!this.state?.Muted});
        if(this.state?.CallId===id)this.state={...this.state,Muted:!!result.Muted};}
    });
    this.controls.audio.onclick=()=>this.action('audio',async()=>{
      const id=this.state?.CallId,on=!this.speaker;
      if(this.state?.AudioMode==='webrtc'&&this.service.session){this.service.setSpeaker(on);this.speaker=on;}
      else {const result=await this.rpc('Calls/AudioOutput',{CallId:id,Speaker:on});if(this.state?.CallId===id)this.speaker=!!result.Speaker;}
    });
    this.controls.camera.onclick=()=>this.action('camera',()=>this.service.toggleCamera());
    this.controls.flip.onclick=()=>this.action('flip',()=>this.service.flipCamera());
    this.controls.contacts.onclick=()=>{this.setExpanded(false);Promise.resolve(this.openApp('contacts')).catch(error=>this.notify(error.message));};
    this.$('.pc-unlock').onclick=()=>this.service.unlock();
    this.listener=()=>this.mediaChanged();service.addEventListener('change',this.listener);
    this.resize=new ResizeObserver(entries=>{const width=entries[0]?.contentRect.width||0;this.root.dataset.wide=String(width>=500);});this.resize.observe(target);
    this.timer=setInterval(()=>{if(this.state)this.render();},1000);
    this.heartbeat=setInterval(()=>{if(this.state?.CallId)this.send('Calls/Heartbeat',{CallId:this.state.CallId}).catch(()=>{});},6000);
  }
  async rpc(route,data){const result=await this.send(route,data);
    if(result==null||result===false||result?.Success===false||result?.__phoneError)throw Error(result?.Msg||result?.error||'This call action could not be completed.');
    return result;
  }
  handle(data){
    if(!data||this.destroyed)return;
    if(data.Action==='Calls/Reset'){this.reset();return;}
    if(data.Action==='Calls/ControlError'){this.feedback(data.Message);return;}
    if(data.Action!=='Calls/State')return;
    const next=data.Data&&typeof data.Data.CallId==='string'?data.Data:null;
    if(next){
      if(this.closedIds.has(next.CallId)||this.service.closedIds.has(next.CallId))return;
      const fresh=this.state?.CallId!==next.CallId;
      this.state={...next};this.speaker=next.AudioMode==='webrtc'?!!this.service.snapshot().speaker:!!next.LocalSpeaker;
      if(fresh){this.pending.clear();this.feedback('');this.setExpanded(true,{focus:this.canFocus()});}
    }else{
      if(data.CallId&&this.state&&data.CallId!==this.state.CallId)return;
      this.finish(data.CallId||this.state?.CallId,data.Reason);
    }
    this.render();
  }
  mediaChanged(){
    if(this.destroyed)return;
    const v=this.service.snapshot();
    if(v.ending?.id&&v.ending.id===this.state?.CallId){this.finish(v.ending.id,v.ending.reason);return;}
    const s=this.service.session;
    if(!this.state&&s&&!this.closedIds.has(s.id)){
      this.state={CallId:s.id,Kind:'video',Status:'negotiating',ContactName:s.name,AudioMode:s.audioMode};
      this.setExpanded(true,{focus:this.canFocus()});
    }
    this.render();
  }
  remember(id){if(!id)return;this.closedIds.add(id);if(this.closedIds.size>32)this.closedIds.delete(this.closedIds.values().next().value);}
  finish(id,reason){
    if(id&&this.state&&id!==this.state.CallId)return;
    const hadCall=!!this.state;this.remember(id);this.state=null;this.pending.clear();this.speaker=false;
    this.service.ring({Enabled:false});this.setExpanded(false);this.releaseVideos();this.render();
    if(hadCall&&reason&&!['Character unloaded','Another call started'].includes(reason))this.notify(reason);
  }
  async end(){
    const id=this.state?.CallId||this.service.session?.id;if(!id)return;
    // Never disable End or wait on a request before restoring navigation.
    this.finish(id);this.service.stop(id,'Call ended');
    try{await this.rpc('Calls/EndCall',{CallId:id});}
    catch(error){this.send('Facetime/Abort',{CallId:id}).catch(()=>{});this.notify(error.message);}
  }
  async action(key,fn){
    if(!this.state||this.pending.has(key))return;
    const id=this.state.CallId;this.pending.add(key);this.feedback('');this.render();
    try{await fn();}catch(error){if(this.state?.CallId===id)this.feedback(error.message);}
    finally{if(this.state?.CallId===id){this.pending.delete(key);this.render();}}
  }
  feedback(message){text(this.$('.pc-feedback'),message);this.$('.pc-feedback').hidden=!message;}
  setExpanded(value,{focus=true}={}){
    const next=!!value&&!!this.state,changed=next!==this.expanded;
    if(changed&&next&&focus)this.previousFocus=document.activeElement;
    this.expanded=next;this.render();
    if(changed){this.dispatchEvent(new Event('change'));
      queueMicrotask(()=>{if(focus&&this.expanded)this.$('.pc-minimize').focus({preventScroll:true});else if(!this.expanded&&this.canFocus()&&this.previousFocus?.isConnected&&!this.previousFocus.inert)this.previousFocus.focus?.({preventScroll:true});});}
  }
  handleKey(event){
    if(!this.expanded)return false;
    if(event.key==='Escape'){this.setExpanded(false);return true;}
    if(event.key==='Tab'){
      const buttons=[...this.$('.pc-screen').querySelectorAll('button:not([disabled])')].filter(n=>n.getClientRects().length);
      if(!buttons.length)return true;const at=buttons.indexOf(document.activeElement);
      if(at<0){buttons[0].focus();return true;}
      if(event.shiftKey&&at===0){buttons.at(-1).focus();return true;}
      if(!event.shiftKey&&at===buttons.length-1){buttons[0].focus();return true;}
    }
    return false;
  }
  render(){
    if(this.destroyed)return;
    const state=this.state,v=this.service.snapshot();this.root.hidden=!state;
    if(state?.AudioMode==='webrtc')this.speaker=!!v.speaker;
    this.$('.pc-screen').hidden=!state||!this.expanded;this.$('.pc-return').hidden=!state||this.expanded;
    this.root.dataset.expanded=String(this.expanded);
    if(!state){this.releaseVideos();return;}
    const video=state.Kind==='video',session=video&&this.service.session?.id===state.CallId?this.service.session:null;
    const ringing=state.Status==='ringing',incoming=ringing&&state.Incoming;
    const connected=video?!!session&&v.connected:state.Status==='active';
    const name=state.ContactName||state.Phone||session?.name||'Unknown caller';
    const status=ringing?(incoming?`Incoming ${video?'video':'phone'} call`:'Calling…')
      :connected?callDuration(state.StartedAt||v.startedAt)
      :state.Status==='reconnecting'||['disconnected','failed'].includes(v.status)?'Reconnecting…':'Connecting…';
    const cameraPaused=video&&state.PeerCameraEnabled===false;
    const hasVideo=video&&!ringing&&!!v.remote?.getVideoTracks().length&&connected&&!cameraPaused;
    this.root.dataset.kind=video?'video':'voice';this.root.dataset.connected=String(connected);this.root.dataset.hasVideo=String(hasVideo);
    text(this.$('.pc-name'),name);text(this.$('.pc-large-name'),name);text(this.$('.pc-kicker'),video?'FACETIME':'PHONE CALL');
    text(this.$('.pc-status'),status);text(this.$('.pc-main-status'),cameraPaused?'Their camera is paused':status);
    text(this.$('.pc-avatar span'),String(name).trim().split(/\s+/).map(n=>n[0]).slice(0,2).join('').toUpperCase());
    text(this.$('.pc-privacy'),ringing&&video?'Your camera starts only after the call is answered.':video&&!connected?'Connecting your in-game cameras.':video?'':'Game voice · Private call channel');
    this.$('.pc-center').hidden=hasVideo;
    this.$('.pc-remote').hidden=!hasVideo;
    this.$('.pc-incoming').hidden=!incoming;this.$('.pc-controls').hidden=!!incoming;
    const micOn=video&&session?v.micEnabled:!state.Muted;
    const muted=!micOn;
    for(const key of ['mic','audio','camera','flip'])this.controls[key].disabled=ringing||(!connected&&!session)||this.pending.has(key);
    this.controls.end.disabled=false;this.controls.contacts.disabled=false;
    this.controls.camera.hidden=!video;this.controls.flip.hidden=true;
    this.controls.contacts.hidden=video;
    this.controls.mic.disabled||=state.MuteSupported===false;
    this.controls.audio.disabled||=state.OutputSupported===false;
    this.controls.mic.setAttribute('aria-pressed',String(muted));text(this.controls.mic.querySelector('span'),muted?'Unmute':'Mute');
    this.controls.mic.title=state.AudioMode==='webrtc'?'Mute your call microphone':'Mute your voice to this person, including their nearby/radio audio from you. Other nearby players can still hear you.';
    this.controls.audio.setAttribute('aria-pressed',String(!!this.speaker));this.controls.audio.title='Switch between your normal call volume and louder private output. Does not broadcast to nearby players.';
    this.controls.camera.setAttribute('aria-pressed',String(!v.videoEnabled));text(this.controls.camera.querySelector('span'),v.videoEnabled?'Camera':'Camera off');
    this.controls.flip.disabled=true;
    this.$('.pc-answer').disabled=this.pending.has('answer');
    text(this.$('.pc-incoming>div>span'),this.pending.has('answer')?'Connecting…':'Accept');
    this.$('.pc-unlock').hidden=!video||!v.audioBlocked;
    const note=state.PeerMuted?'Their microphone is muted':(!micOn?(state.AudioMode==='webrtc'?'Your microphone is muted':'Muted to this person · nearby players may still hear you'):'');
    text(this.$('.pc-peer-note'),note);this.$('.pc-peer-note').hidden=!note;
    text(this.$('.pc-return-name'),name);text(this.$('.pc-return-time'),status);
    this.$('.pc-return').setAttribute('aria-label',`Return to ${video?'FaceTime':'call'} with ${name}, ${status}`);
    const local=video&&session?v.local:null,remote=video&&session?v.remote:null;
    this.bindVideo(this.$('.pc-self'),local);this.bindVideo(this.$('.pc-remote'),remote);
    this.$('.pc-pip').hidden=!local||!v.videoEnabled||!this.expanded;this.$('.pc-self').style.transform=v.front?'scaleX(-1)':'none';
  }
  bindVideo(node,stream){
    // The remote MediaStream starts empty. play() on that empty stream can reject
    // in CEF; a later ontrack must start the same element even though srcObject
    // has not changed.
    if(node.srcObject!==stream)node.srcObject=stream;
    if(stream?.getVideoTracks().length&&node.paused&&!node._phonePlayPending){
      node._phonePlayPending=true;
      Promise.resolve(node.play()).catch(()=>{}).finally(()=>{node._phonePlayPending=false;});
    }
  }
  releaseVideos(){for(const video of this.root.querySelectorAll('video')){if(video.srcObject){video.pause();video.srcObject=null;}}}
  reset(){const id=this.state?.CallId||this.service.session?.id;this.finish(id);if(id)this.service.stop(id);this.feedback('');}
  destroy(){this.reset();this.destroyed=true;clearInterval(this.timer);clearInterval(this.heartbeat);this.resize.disconnect();this.service.removeEventListener('change',this.listener);this.root.remove();}
}
