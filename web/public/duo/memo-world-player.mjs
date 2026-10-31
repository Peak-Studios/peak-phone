import {downloadMemo} from './memo-transfer.mjs';
// Independent of phone screen/app visibility: explicitly selected speaker/radio audio.
export function initWorldMemoPlayback(send,{target=globalThis.window,audioFactory=()=>new Audio(),urlAPI=URL,now=()=>Date.now()}={}){
 const sessions=new Map(),failed=new Set();let disposed=false;
 const checked=async(route,data)=>{const result=await send(route,data);if(!result?.Success)throw Error(result?.Msg||result?.error||'Recording playback unavailable.');return result;};
 function remove(id){const item=sessions.get(id);if(!item)return;item.cancelled=true;clearTimeout(item.startTimer);item.audio?.pause();if(item.audio){item.audio.removeAttribute('src');item.audio.load();}if(item.url)urlAPI.revokeObjectURL(item.url);sessions.delete(id);}
 function clear(){for(const id of sessions.keys())remove(id);failed.clear();}
 function fail(id){remove(id);failed.add(id);}
 function sync(item){const audio=item.audio;if(!audio||!item.ready)return;clearTimeout(item.startTimer);audio.volume=Math.max(0,Math.min(1,item.state.Gain));if(item.state.Preparing===true){audio.pause();return;}const elapsed=(item.state.ElapsedMs+now()-item.received)/1000;if(elapsed<0){audio.pause();item.startTimer=setTimeout(()=>{if(!disposed&&!item.cancelled)sync(item);},Math.ceil(-elapsed*1000));return;}if(elapsed>=item.state.DurationMs/1000){remove(item.state.SessionId);return;}if(audio.readyState===0)return;const duration=Number.isFinite(audio.duration)&&audio.duration>0?audio.duration:item.state.DurationMs/1000;if(Math.abs(audio.currentTime-elapsed)>1.5)try{audio.currentTime=Math.max(0,Math.min(elapsed,duration-.01));}catch{/* Retry seeking on the next authorized heartbeat. */}if(audio.paused!==false)audio.play().catch(()=>{if(!disposed&&!item.cancelled)fail(item.state.SessionId);});}
 function onMessage(event){const d=event.data;if(d?.Action==='Phone/IdentityChanged'||d?.Action==='Phone/SetIdentity'){clear();return;}if(d?.Action!=='VoiceMemos/PlaybackState')return;
  const active=new Set();for(const state of (Array.isArray(d.Sessions)?d.Sessions:[]).slice(0,4)){
   if(typeof state.SessionId!=='string'||!/^MEMO-[a-f0-9]{32}$/.test(state.MemoId)||!Number.isFinite(state.Gain)||!Number.isFinite(state.ElapsedMs)||!Number.isFinite(state.DurationMs))continue;
   active.add(state.SessionId);if(failed.has(state.SessionId))continue;let item=sessions.get(state.SessionId);if(item){item.state=state;item.received=now();sync(item);continue;}
   item={state,received:now(),cancelled:false};sessions.set(state.SessionId,item);
   let ticket;downloadMemo(state,checked,{alive:()=>!disposed&&!item.cancelled,onDescribe:meta=>{ticket=meta.Ticket;}}).then(blob=>{if(disposed||item.cancelled)return;item.url=urlAPI.createObjectURL(blob);item.audio=audioFactory();item.audio.preload='auto';item.audio.volume=Math.max(0,Math.min(1,item.state.Gain));item.audio.addEventListener('loadedmetadata',()=>{if(disposed||item.cancelled)return;checked('VoiceMemos/PlaybackReady',{SessionId:state.SessionId,Ticket:ticket}).then(()=>{if(disposed||item.cancelled)return;item.ready=true;sync(item);}).catch(()=>{if(!disposed&&!item.cancelled)fail(state.SessionId);});},{once:true});item.audio.addEventListener('error',()=>{if(!disposed&&!item.cancelled)fail(state.SessionId);},{once:true});item.audio.addEventListener('ended',()=>remove(state.SessionId),{once:true});item.audio.src=item.url;item.audio.load();}).catch(()=>{if(!disposed&&!item.cancelled)fail(state.SessionId);});
  }for(const id of sessions.keys())if(!active.has(id))remove(id);for(const id of failed)if(!active.has(id))failed.delete(id);
 }
 // Lost heartbeat must not leave audio playing after disconnect or resource restart.
 const watchdog=setInterval(()=>{for(const [id,item] of sessions)if(now()-item.received>3500)remove(id);},1000);
 target.addEventListener('message',onMessage);target.addEventListener('pagehide',clear);
 return ()=>{disposed=true;clear();clearInterval(watchdog);target.removeEventListener('message',onMessage);target.removeEventListener('pagehide',clear);};
}
