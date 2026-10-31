import {icon} from './icons.mjs?rev=owner-config-20261015';
export class CameraControls {
 constructor({target,send,flip,notify=()=>{},aimTarget=target}){
  Object.assign(this,{send,flip,notify});this.zoom=1;this.front=false;this.pending=false;this.dead=false;
  this.node=document.createElement('div');this.node.className='duo-camera-lenses';
  this.node.innerHTML=`<button type="button" data-lens="out" aria-label="Zoom out">−</button><output aria-label="Camera zoom">1×</output><button type="button" data-lens="in" aria-label="Zoom in">+</button><button type="button" data-lens="flip" aria-label="Switch to selfie camera"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><path d="M8 13a4 4 0 0 1 7-2l1 1m0-3v3h-3M16 15a4 4 0 0 1-7 2l-1-1m0 3v-3h3"/></svg></button>`;
  target.append(this.node);
  this.node.addEventListener('click',async e=>{
   const action=e.target.closest('[data-lens]')?.dataset.lens;if(!action||this.pending)return;
   this.pending=true;this.render();
   try{const result=await(action==='flip'?this.flip():this.send({Zoom:Math.max(1,Math.min(4,this.zoom+(action==='in'?.5:-.5)))}));
    if(result?.Success===false)throw Error(result.Msg||result.Error||'The camera could not be changed.');
    if(!this.dead){this.zoom=result?.Zoom??this.zoom;this.front=result?.Front??this.front;}
   }catch(error){if(!this.dead)this.notify(error.message);}finally{this.pending=false;if(!this.dead)this.render();}
  });
  this.down=e=>{if(e.button!==0||e.target.closest('button,input,textarea,form'))return;this.drag={id:e.pointerId,x:e.clientX,y:e.clientY};aimTarget.setPointerCapture?.(e.pointerId);};
  this.move=e=>{if(!this.drag||this.drag.id!==e.pointerId)return;const dx=e.clientX-this.drag.x,dy=e.clientY-this.drag.y;this.drag.x=e.clientX;this.drag.y=e.clientY;this.yaw=(this.yaw||0)-dx*.12;this.pitch=(this.pitch||0)-dy*.12;if(!this.frame)this.frame=requestAnimationFrame(()=>{this.frame=0;const data={Yaw:this.yaw,Pitch:this.pitch};this.yaw=this.pitch=0;this.send(data).catch(()=>{});});};
  this.up=()=>{this.drag=null;};this.aimTarget=aimTarget;
  aimTarget.addEventListener('pointerdown',this.down);aimTarget.addEventListener('pointermove',this.move);aimTarget.addEventListener('pointerup',this.up);aimTarget.addEventListener('pointercancel',this.up);this.render();
 }
 render(){this.node.querySelector('output').textContent=`${this.zoom.toFixed(1).replace('.0','')}×`;for(const b of this.node.querySelectorAll('button'))b.disabled=this.pending;
  this.node.querySelector('[data-lens="out"]').disabled=this.pending||this.zoom<=1;this.node.querySelector('[data-lens="in"]').disabled=this.pending||this.zoom>=4;
  this.node.querySelector('[data-lens="flip"]').setAttribute('aria-label',this.front?'Switch to rear camera':'Switch to selfie camera');
 }
 destroy(){this.dead=true;cancelAnimationFrame(this.frame);for(const [type,fn] of [['pointerdown',this.down],['pointermove',this.move],['pointerup',this.up],['pointercancel',this.up]])this.aimTarget.removeEventListener(type,fn);this.node.remove();}
}
// Dock-style replica blur, sharing the viewfinder stream rather than capturing again.
export function cameraGlass(bar,source,stream){
 const clip=document.createElement('div');clip.className='duo-camera-blur';clip.setAttribute('aria-hidden','true');clip.inert=true;
 const video=document.createElement('video');video.autoplay=true;video.muted=true;video.playsInline=true;video.srcObject=stream;clip.append(video);bar.prepend(clip);
 const align=()=>{const a=source.getBoundingClientRect(),b=bar.getBoundingClientRect(),scale=a.width/source.clientWidth||1;Object.assign(video.style,{width:source.clientWidth+'px',height:source.clientHeight+'px',left:-(b.left-a.left)/scale+'px',top:-(b.top-a.top)/scale+'px'});};
 const resize=new ResizeObserver(align);resize.observe(source);resize.observe(bar);align();video.play().catch(()=>{});
 return {destroy(){resize.disconnect();video.pause();video.srcObject=null;clip.remove();}};
}
