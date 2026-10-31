import { icon } from './icons.mjs?rev=owner-config-20261015';
export class CameraUI {
 constructor({recorder,send,preview=false,notify,openGallery,onExit,target}){
  Object.assign(this,{recorder,send,preview,notify,openGallery,onExit});this.mode='photo';this.front=false;this.visible=false;this.lastShutter=0;this.photoBusy=false;this.dead=false;this.photoTimer=null;this.flipBusy=false;this.lookPointer=null;this.lookDelta={Dx:0,Dy:0};this.lookFrame=0;
  this.node=document.createElement('section');this.node.className='duo-camera';this.node.hidden=true;this.node.setAttribute('aria-label','Game camera');
  this.node.innerHTML=`<object class="duo-cam-gameview" type="application/x-cfx-game-view" aria-label="Gameplay camera preview"></object><div class="duo-cam-top"><button type="button" data-camera="exit" aria-label="Exit camera">${icon('close')}</button><span class="duo-cam-format">BACK CAMERA · PHOTO</span><button type="button" data-camera="flip" aria-label="Switch to selfie camera" title="Switch to selfie camera">${icon('repeat')}<span data-lens-label>Rear</span></button><button type="button" data-camera="mic" aria-label="Enable microphone recording" aria-pressed="false">${icon('mic')}<span>Mic off</span></button></div><div class="duo-cam-framing" aria-label="Drag to aim camera"><i></i><i></i><i></i><i></i></div><div class="duo-cam-bottom"><output class="duo-cam-timer" aria-live="off">00:00</output><p class="duo-cam-feedback" role="status">Gameplay view</p><div class="duo-cam-modes" role="group" aria-label="Camera mode"><button type="button" data-mode="video" aria-pressed="false">VIDEO</button><button type="button" data-mode="photo" aria-pressed="true">PHOTO</button></div><div class="duo-cam-controls"><button type="button" data-camera="library" aria-label="Open Photos">${icon('gallery')}</button><button type="button" data-camera="shutter" class="duo-cam-shutter" aria-label="Take photo"><span></span></button></div><p class="duo-cam-note">Photos are saved by the server.</p></div>`;
  if(preview)this.node.querySelector('.duo-cam-gameview').remove();
  (target||document.body).append(this.node);this.q=s=>this.node.querySelector(s);
  this.node.addEventListener('click',e=>{const mode=e.target.closest('button[data-mode]');if(mode&&this.recorder.status==='idle'&&!this.photoBusy){this.mode=mode.dataset.mode;this.render();return;}const action=e.target.closest('[data-camera]')?.dataset.camera;if(action==='shutter')this.shutter();if(action==='exit')this.exit();if(action==='flip')this.flip();if(action==='library')this.exit(true);if(action==='mic'&&this.recorder.status==='idle'){this.microphone=!this.microphone;this.render();}});
  const framing=this.q('.duo-cam-framing');
  framing.addEventListener('pointerdown',event=>{if(!this.visible||event.button!==0)return;event.preventDefault();this.lookPointer={id:event.pointerId,x:event.clientX,y:event.clientY};framing.setPointerCapture(event.pointerId);});
  framing.addEventListener('pointermove',event=>{const drag=this.lookPointer;if(!drag||drag.id!==event.pointerId)return;const rect=framing.getBoundingClientRect();this.lookDelta.Dx+=(event.clientX-drag.x)*90/Math.max(1,rect.width);this.lookDelta.Dy+=(event.clientY-drag.y)*40/Math.max(1,rect.height);drag.x=event.clientX;drag.y=event.clientY;if(!this.lookFrame)this.lookFrame=requestAnimationFrame(()=>{this.lookFrame=0;const delta=this.lookDelta;this.lookDelta={Dx:0,Dy:0};if(this.visible&&(delta.Dx||delta.Dy)){try{Promise.resolve(this.send('Phone/CameraOrbit',delta)).catch(()=>{});}catch{}}});});
  const endLook=event=>{if(this.lookPointer?.id===event.pointerId)this.lookPointer=null;};framing.addEventListener('pointerup',endLook);framing.addEventListener('pointercancel',endLook);framing.addEventListener('lostpointercapture',endLook);
  recorder.onChange=()=>this.render();this.render();
 }
 show(value){this.visible=!!value;this.node.hidden=!this.visible;if(!value){this.lookPointer=null;if(this.recorder.status==='starting')this.recorder.cancel();else if(this.recorder.status==='recording')this.recorder.stop();}this.render();}
 setFacing(front){if(typeof front==='boolean'){this.front=front;this.lookPointer=null;this.render();}}
 render(){
  const status=this.recorder.status,busy=status!=='idle';this.node.dataset.mode=this.mode;this.node.dataset.facing=this.front?'front':'rear';this.node.dataset.recording=String(status==='recording');this.node.dataset.preview=String(this.preview);
  const seconds=Math.floor(this.recorder.elapsed||0);this.q('.duo-cam-timer').textContent=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
  this.q('[data-camera="shutter"]').disabled=status==='starting'||status==='saving'||this.photoBusy;
  this.q('[data-camera="shutter"]').setAttribute('aria-label',status==='recording'?'Stop recording':this.mode==='video'?'Record video':'Take photo');
  for(const b of this.node.querySelectorAll('[data-mode]')){b.disabled=busy||this.photoBusy;b.setAttribute('aria-pressed',String(b.dataset.mode===this.mode));}
  const mic=this.q('[data-camera="mic"]');mic.hidden=this.mode!=='video';mic.disabled=busy;mic.setAttribute('aria-pressed',String(!!this.microphone));mic.querySelector('span').textContent=this.microphone?'Mic on':'Mic off';mic.setAttribute('aria-label',this.microphone?'Disable microphone recording':'Enable microphone recording');
  const flip=this.q('[data-camera="flip"]');flip.disabled=this.flipBusy||status==='starting'||status==='saving';flip.setAttribute('aria-label',this.front?'Switch to rear camera':'Switch to selfie camera');flip.title=flip.getAttribute('aria-label');this.q('[data-lens-label]').textContent=this.front?'Front':'Rear';
  this.q('.duo-cam-format').textContent=`${this.front?'FRONT':'BACK'} CAMERA · ${this.mode==='video'?'HD · 24 FPS · 60s MAX':'PHOTO'}`;
  this.q('.duo-cam-feedback').textContent=status==='starting'?'Preparing gameplay capture…':status==='saving'?'Saving your video…':status==='recording'?'Recording':this.photoBusy?'Taking photo…':this.front?'Selfie view · drag to look around':this.preview?'Synthetic browser preview · not GTA footage':'Capturing your gameplay view';
  this.q('.duo-cam-note').textContent=this.mode==='video'?`Local device only · ${this.microphone?'Microphone audio':'Silent video'} · no game audio`:'Photos are saved by the server.';
 }
 async shutter(){
  if(!this.visible||performance.now()-this.lastShutter<280)return;this.lastShutter=performance.now();
  if(this.mode==='video'){if(this.recorder.status==='recording')await this.recorder.stop();else if(this.recorder.status==='idle')await this.recorder.start({microphone:!!this.microphone});}
  else if(!this.photoBusy){this.photoBusy=true;this.render();clearTimeout(this.photoTimer);this.photoTimer=setTimeout(()=>this.photoResult(false,'Photo capture timed out. Please try again.'),47000);try{const result=await this.send('Phone/CapturePhoto');if(result?.Success===false)this.photoResult(false,'Camera is unavailable or already capturing.');else if(this.preview)this.photoResult(true);}catch(e){this.photoResult(false,e.message);}}
 }
 async flip(){
  if(!this.visible||this.flipBusy)return;this.flipBusy=true;this.render();
  try{const result=await this.send('Phone/FlipCamera');const facing=result?.IsSelfie??result?.Front;if(result?.Success===true&&typeof facing==='boolean')this.setFacing(facing);else this.notify(result?.Msg||'The camera lens could not be switched.');}
  catch(error){if(!this.dead)this.notify(error.message);}finally{this.flipBusy=false;if(!this.dead)this.render();}
 }
 photoResult(ok,message){clearTimeout(this.photoTimer);this.photoTimer=null;if(this.dead)return;this.photoBusy=false;this.render();this.q('.duo-cam-feedback').textContent=ok?'Photo saved to Gallery.':message||'Photo capture failed.';}

 async exit(gallery=false){if(this.exiting)return;this.exiting=true;try{if(this.recorder.status==='starting')this.recorder.cancel();else this.recorder.stop().catch(error=>{if(!this.dead)this.notify(error.message);});await this.send('Phone/ExitCamera');if(gallery)this.openGallery();}catch(e){if(!this.dead)this.notify(e.message);}finally{if(!this.dead){this.show(false);this.onExit?.();}this.exiting=false;}}
 destroy(){this.dead=true;clearTimeout(this.photoTimer);this.recorder.cancel();this.node.remove();}
}
