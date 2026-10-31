import { GameCapture } from './game-capture.mjs';
import { RECORDING_LIMITS } from './recording-store.mjs';
export function recordingMime(Recorder=globalThis.MediaRecorder,{audio=false}={}){
 if(!Recorder?.isTypeSupported)throw Error('Video recording is not supported by this FiveM browser.');
 const mimeTypes=audio?['video/webm;codecs=vp8,opus','video/webm;codecs=vp8','video/webm']:['video/webm;codecs=vp8','video/webm'];
 for(const mime of mimeTypes)if(Recorder.isTypeSupported(mime))return mime;
 throw Error('No supported WebM video encoder is available. Update your FiveM client.');
}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function syntheticCapture(onError=()=>{}){
 const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;canvas.setAttribute('aria-hidden','true');canvas.style.cssText='position:fixed;left:-10000px;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
 let context=null,stream=null,frame=0,stopped=false;
 const stop=()=>{if(stopped)return;stopped=true;if(frame)cancelAnimationFrame(frame);stream?.getTracks().forEach(track=>track.stop());canvas.remove();};
 try{
  document.body.append(canvas);context=canvas.getContext('2d');if(!context)throw Error('The synthetic canvas could not be initialized.');
  stream=canvas.captureStream(24);if(!stream.getVideoTracks().length)throw Error('The synthetic canvas did not produce a video track.');
  const draw=()=>{if(stopped)return;try{context.fillStyle='#12263a';context.fillRect(0,0,1280,720);const t=performance.now()/1300;context.fillStyle='#9ebbac';context.beginPath();context.arc(640+Math.sin(t)*240,300,125,0,Math.PI*2);context.fill();context.fillStyle='#fff';context.font='32px sans-serif';context.fillText('PEAK DUO · SYNTHETIC PREVIEW',70,590);context.font='22px sans-serif';context.fillText('Test clip — not a recording of GTA or your screen',70,630);frame=requestAnimationFrame(draw);}catch(error){stop();onError(error);}};
  draw();return {stream,canvas,validated:true,stop};
 }catch(error){stop();throw error;}
}
/** Sole owner of capture/recorder/microphone resources. Every exit path releases all tracks. */
export class RecordingService {
 constructor({store,preview=false,onChange=()=>{},onSaved=()=>{},notify=()=>{}}){Object.assign(this,{store,preview,onChange,onSaved,notify});this.status='idle';this.epoch=0;this.owner='';this.elapsed=0;}
 setOwner(owner){if(this.owner!==owner){this.cancel();this.owner=owner;}}
 emit(status=this.status){this.status=status;this.onChange({status,elapsed:this.elapsed,audio:!!this.mic,bytes:this.bytes||0});}
 async start({microphone=false,captureSource=null}={}){
  if(this.status!=='idle')return false;
  const owner=this.owner,token=++this.epoch;this.elapsed=0;this.bytes=0;this.chunks=[];this.failure=null;this.emit('starting');
  try{
   if(!owner)throw Error('Open your phone before recording.');await this.store.db();if(token!==this.epoch)return false;
   if((await this.store.list(owner)).length>=RECORDING_LIMITS.count)throw Error('Local video library is full. Delete a clip first.');if(token!==this.epoch)return false;
   // The FiveM render texture arrives upright for canvas recording. Avoid the
   // live-call compatibility flip, otherwise MediaRecorder stores it upside down.
   if(captureSource){
    const stream=new MediaStream(captureSource.stream.getVideoTracks().map(track=>track.clone()));
    this.capture={stream,get validated(){return captureSource.raw?.validated===true;},stop(){stream.getTracks().forEach(track=>track.stop());}};
    this.dimensions={width:captureSource.canvas.width,height:captureSource.canvas.height};
   }else{
    this.capture=this.preview?syntheticCapture(error=>this.fail(error)):new GameCapture({width:1280,height:720,fps:24,invertTextureY:false,onError:error=>this.fail(error)});
    this.dimensions={width:1280,height:720};
   }
   const deadline=performance.now()+4500;
   while(!this.capture?.validated){if(token!==this.epoch)return false;if(performance.now()>deadline)throw Error('Game camera capture could not be validated.');await wait(60);}
   if(microphone){
    if(!navigator.mediaDevices?.getUserMedia)throw Error('Microphone capture is unavailable. Switch the microphone off to record a silent clip.');
    // A late permission response must not keep the microphone alive after cancellation.
    const micPromise=navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false}).then(stream=>{if(token!==this.epoch){stream.getTracks().forEach(t=>t.stop());throw Error('Microphone request cancelled.');}return stream;});
    let timer;try{this.mic=await Promise.race([micPromise,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('Microphone permission timed out. Try recording with the microphone off.')),12000))]);}finally{clearTimeout(timer);}
   }
   if(token!==this.epoch)return false;
   const tracks=[...this.capture.stream.getVideoTracks(),...(this.mic?.getAudioTracks()||[])];this.stream=new MediaStream(tracks);
   const hasAudio=this.stream.getAudioTracks().some(track=>track.readyState==='live'&&track.enabled),mime=recordingMime(globalThis.MediaRecorder,{audio:hasAudio});
   const recorder=this.recorder=new MediaRecorder(this.stream,{mimeType:mime,videoBitsPerSecond:2400000,audioBitsPerSecond:96000});
   this.stopPromise=new Promise(resolve=>this.resolveStop=resolve);
   recorder.ondataavailable=e=>{if(token!==this.epoch||!e.data?.size)return;this.bytes+=e.data.size;if(this.bytes>RECORDING_LIMITS.clipBytes){this.fail(Error('Recording exceeded 24 MB and was not saved. Record a shorter clip.'));return;}this.chunks.push(e.data);};
   recorder.onerror=e=>this.fail(e.error||Error('Video encoding failed.'));
   recorder.onstop=()=>this.finalize(token,owner,recorder.mimeType);
   this.started=performance.now();this.audio=!!this.mic;recorder.start(500);this.emit('recording');
   this.timer=setInterval(()=>{this.elapsed=(performance.now()-this.started)/1000;this.emit();if(this.elapsed>=RECORDING_LIMITS.seconds)this.stop();},200);return true;
  }catch(error){if(token===this.epoch)this.fail(error);return false;}
 }
 async stop(){
  if(this.status==='starting'){this.cancel();return null;}
  if(this.status==='saving')return this.stopPromise;
  if(this.status!=='recording')return null;
  this.elapsed=(performance.now()-this.started)/1000;clearInterval(this.timer);this.emit('saving');
  try{this.recorder.stop();}catch(error){this.fail(error);return null;}
  // Do not tear down tracks until MediaRecorder has delivered its final dataavailable.
  this.stopWatchdog=setTimeout(()=>this.fail(Error('The video encoder did not finish. The clip could not be saved.')),8000);return this.stopPromise;
 }
 async finalize(token,owner,mime){
  if(token!==this.epoch)return;
  clearTimeout(this.stopWatchdog);clearInterval(this.timer);this.release();
  try{
   if(this.failure)throw this.failure;
   const blob=new Blob(this.chunks,{type:mime||'video/webm'});this.chunks=[];
   if(!blob.size)throw Error('The video encoder produced an empty clip. Please retry recording.');
   if(token!==this.epoch||owner!==this.owner)return;
   const meta=await this.store.save(owner,blob,{duration:this.elapsed,audio:this.audio,preview:this.preview,...this.dimensions});
   if(token===this.epoch){this.onSaved(meta);this.notify('Video saved in Photos → Videos · on this device only.');this.resolveStop?.(meta);}
  }catch(error){if(token===this.epoch)this.notify(error.message);this.resolveStop?.(null);}
  finally{if(token===this.epoch){this.chunks=[];this.recorder=null;this.emit('idle');}}
 }
 release(){this.capture?.stop();this.capture=null;this.mic?.getTracks().forEach(t=>t.stop());this.mic=null;this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;}
 cancel(){++this.epoch;clearInterval(this.timer);clearTimeout(this.stopWatchdog);if(this.recorder){this.recorder.onstop=null;this.recorder.ondataavailable=null;this.recorder.onerror=null;try{if(this.recorder.state!=='inactive')this.recorder.stop();}catch{}}this.release();this.recorder=null;this.chunks=[];this.resolveStop?.(null);this.resolveStop=null;this.elapsed=0;this.emit('idle');}
 fail(error){this.cancel();this.notify(error?.message||'Video recording failed.');}
 destroy(){this.cancel();}
}
