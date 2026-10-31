import { audiusID, normalizeTrack } from './music-search.mjs';
import { phoneMedia } from './media-output.mjs';

/** Native audio only. Metadata is revalidated by the server before each start. */
export class CatalogAudioPlayer {
 constructor({send, changed=()=>{}, ended=()=>{}, audio=document.createElement('audio'), media=phoneMedia}) {
  this.send=send;this.changed=changed;this.ended=ended;this.audio=audio;this.media=media;
  this.generation=0;this.track=null;this.error='';this.loading=false;this.destroyed=false;
  audio.preload='metadata';this.unregister=media.register(audio);
  this.events=['play','pause','timeupdate','durationchange','loadedmetadata','ended','error'];
  this.listener=e=>{if(this.destroyed)return;if(e.type==='error'){this.loading=false;this.error='Audio unavailable. Try another verified track.';}this.changed();if(e.type==='ended')this.ended();};
  for(const name of this.events)audio.addEventListener(name,this.listener);
  this.close=()=>this.stop();this.power=()=>{if(!media.powered)this.stop();};
  this.hidden=()=>{if(document.hidden)this.stop();};
  globalThis.addEventListener?.('duo:music-stop',this.close);media.addEventListener('change',this.power);
  globalThis.document?.addEventListener('visibilitychange',this.hidden);
 }
 async play(value){
  const id=audiusID(value.providerId||value.url);if(!id)return false;
  this.stop();const gen=++this.generation;this.loading=true;this.error='';this.changed();
  try{
   const result=await this.send('Peakify/ResolveCatalog',{Id:id});
   if(this.destroyed||gen!==this.generation||!this.media.powered)return false;
   const track=result?.Success===true?normalizeTrack(result.Track):null;
   if(!track||track.providerId!==id)throw Error(result?.Message||'This track is no longer freely available from a verified artist.');
   this.track=track;this.audio.src=track.url;await this.audio.play();
   if(this.destroyed||gen!==this.generation)return false;
   this.loading=false;this.changed();return true;
  }catch(e){if(!this.destroyed&&gen===this.generation){this.loading=false;this.error=e.message||'Tap Play to start audio.';this.changed();}return false;}
 }
 async toggle(){if(!this.track)return;if(!this.audio.paused){this.audio.pause();return;}const gen=this.generation;try{await this.audio.play();if(gen===this.generation){this.error='';this.changed();}}catch{if(gen===this.generation){this.error='Playback was blocked. Tap Play again.';this.changed();}}}
 seek(seconds){if(Number.isFinite(seconds)&&Number.isFinite(this.audio.duration))this.audio.currentTime=Math.max(0,Math.min(this.audio.duration,seconds));}
 stop(){++this.generation;this.audio.pause();this.audio.removeAttribute('src');this.audio.load();this.track=null;this.loading=false;if(!this.destroyed)this.changed();}
 destroy(){this.destroyed=true;this.stop();this.unregister();for(const name of this.events)this.audio.removeEventListener(name,this.listener);globalThis.removeEventListener?.('duo:music-stop',this.close);this.media.removeEventListener('change',this.power);globalThis.document?.removeEventListener('visibilitychange',this.hidden);}
}
