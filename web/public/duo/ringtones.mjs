import {phoneMedia} from './media-output.mjs';

export const defaultRingtones = [
  ['default','Peak Classic'], ['chime','Chime'], ['seaside','Seaside'],
  ['orbit','Orbit'], ['pulse','Pulse'],
].map(([id,label])=>({id,label,src:`ringtones/${id}.wav`}));
const aliases = {'phone.phoneRing':'default','ringtones.seaside':'seaside','ringtones.stilldre':'pulse'};
export const ringtoneId = id => aliases[id] || id || 'default';
export function settingsRingtoneOptions(configured=[]) {
  const options=defaultRingtones.map(({id,label})=>({id,label})),seen=new Set(options.map(item=>item.id));
  if(!Array.isArray(configured))return options;
  for(const tone of configured){
    const id=typeof tone?.id==='string'?tone.id:'',label=typeof tone?.label==='string'?tone.label.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,64):'';
    if(!/^[a-z0-9][a-z0-9_-]{0,39}$/.test(id)||id==='custom'||!label||seen.has(id))continue;
    options.push({id,label});seen.add(id);
  }
  return options;
}
export function ringtoneSource(value) {
  if(typeof value!=='string'||value.length>2048)return null;
  if(/^ringtones\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.(?:wav|ogg|mp3)$/i.test(value)&&!value.includes('..'))return value;
  try {const url=new URL(value);if(url.protocol==='https:'&&url.hostname&&!url.username&&!url.password)return url.href;}catch{}
  return null;
}
export function resolveRingtone(id,custom) {
  return defaultRingtones.find(t=>t.id===ringtoneId(id))?.src || ringtoneSource(custom) || defaultRingtones[0].src;
}

// Independent of app visibility: a closed phone still receives incoming calls.
export class RingtonePlayer {
  constructor({output=phoneMedia,createAudio=src=>new Audio(src),onError=()=>{},canPreview=()=>true}={}) {
    Object.assign(this,{output,createAudio,onError,canPreview});this.muted=false;this.active=null;this.audio=null;this.generation=0;
    this.outputChanged=()=>{if(!output.powered)this.stop();};output.addEventListener('change',this.outputChanged);
    this.unlock=()=>{if(this.blocked&&this.audio)this.play(this.audio,this.generation);};
    globalThis.addEventListener?.('pointerdown',this.unlock);globalThis.addEventListener?.('keydown',this.unlock);
  }
  ring(data) {
    if(!data.Enabled){if(!data.CallId||!this.active?.callId||data.CallId===this.active.callId)this.stop();return;}
    if(!this.output.powered)return;
    const src=data.Incoming?resolveRingtone(data.Sound,data.CustomSound):'ringtones/ringback.wav';
    if(this.active?.src===src&&this.active?.preview===false&&this.active?.callId===data.CallId)return;
    this.stop();this.active={src,preview:false,callId:data.CallId};if(!this.muted)this.start(src);
  }
  preview(id,custom) {
    if(!this.canPreview()||(this.active&&!this.active.preview))return false;
    this.stop();if(this.muted||!this.output.powered)return false;
    const src=resolveRingtone(id,custom);this.active={src,preview:true};this.start(src);
    this.timer=setTimeout(()=>this.stop(),8000);return true;
  }
  setMuted(value) {
    this.muted=!!value;
    if(this.muted){if(this.active?.preview)this.stop();else this.clearAudio();}
    else if(this.active&&!this.audio&&this.output.powered)this.start(this.active.src);
  }
  start(src) {
    try {
      const audio=this.audio=this.createAudio(src),generation=++this.generation;
      audio.loop=true;audio.preload='auto';audio.volume=.8;this.unregister=this.output.register(audio);
      audio.onerror=()=>this.failed(audio,generation);
      this.play(audio,generation);
    }catch{this.onError('Ringtone playback is unavailable.');}
  }
  async play(audio,generation) {
    try {await audio.play();if(this.audio===audio&&this.generation===generation)this.blocked=false;else audio.pause();}
    catch(error) {
      if(this.audio!==audio||this.generation!==generation)return;
      if(error.name==='NotAllowedError'){this.blocked=true;return;}
      this.failed(audio,generation);
    }
  }
  failed(audio,generation) {
    if(this.audio!==audio||this.generation!==generation)return;
    const fallback=defaultRingtones[0].src;
    if(this.active?.src!==fallback){this.clearAudio();this.active.src=fallback;this.start(fallback);this.onError('Selected ringtone could not play. Using Peak Classic.');}
    else {this.stop();this.onError('Ringtone could not play.');}
  }
  clearAudio() {
    ++this.generation;this.blocked=false;
    if(this.audio){this.audio.onerror=null;this.audio.pause();this.unregister?.();this.audio.removeAttribute('src');this.audio.load();this.audio=null;this.unregister=null;}
  }
  stopPreview(){if(this.active?.preview)this.stop();}
  stop(){clearTimeout(this.timer);this.timer=null;this.active=null;this.clearAudio();}
  destroy(){this.stop();this.output.removeEventListener('change',this.outputChanged);globalThis.removeEventListener?.('pointerdown',this.unlock);globalThis.removeEventListener?.('keydown',this.unlock);}
}
