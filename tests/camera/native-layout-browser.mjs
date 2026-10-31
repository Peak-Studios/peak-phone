export async function checkNativeCameraLayouts() {
 const root=document.querySelector('#duo'),stage=root?.querySelector('.duo-stage'),chassis=root?.querySelector('.duo-chassis'),bank=root?.querySelector('.duo-screenbank');
 const round=value=>Math.round(value*100)/100;
 const rect=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
 const animations=()=>[...new Set([stage,chassis,bank,root?.querySelector('.duo-camera')].filter(Boolean).flatMap(node=>node.getAnimations?.({subtree:true})||[]))];
 const pendingFiniteAnimations=()=>animations().filter(animation=>{
  if(!['running','pending'].includes(animation.playState))return false;
  const endTime=animation.effect?.getComputedTiming?.().endTime;
  return Number.isFinite(endTime);
 });
 const diagnostic=()=>{
  const camera=root?.querySelector('.duo-camera'),targets=[stage,chassis,bank,camera].filter(Boolean);
  const buttons=[...(camera?.querySelectorAll('button')||[])].filter(node=>node.getClientRects().length).map(node=>({label:node.getAttribute('aria-label')||node.textContent.trim(),rect:rect(node),font:getComputedStyle(node).font,transform:getComputedStyle(node).transform}));
  return {state:state(),rootPose:root&&{expanded:root.dataset.expanded,orientation:root.dataset.orientation,orientationTurn:root.dataset.orientationTurn,classes:root.className},camera:camera&&{hidden:camera.hidden,mode:camera.dataset.mode,facing:camera.dataset.facing,rect:rect(camera)},rects:Object.fromEntries(targets.map(node=>[node.className||node.tagName,rect(node)])),buttons,fonts:document.fonts?.status,animations:animations().map(animation=>({target:animation.effect?.target?.className||animation.effect?.target?.tagName||null,playState:animation.playState,currentTime:animation.currentTime,endTime:animation.effect?.getComputedTiming?.().endTime,transform:animation.effect?.getKeyframes?.().at(-1)?.transform||null}))};
 };
 const assert=(ok,message)=>{if(!ok)throw Error(message+'\n'+JSON.stringify(diagnostic(),null,2));};
 const geometrySignature=()=>{
  const camera=root?.querySelector('.duo-camera'),nodes=[stage,chassis,bank,camera,...(camera?[...camera.querySelectorAll('button')].filter(node=>node.getClientRects().length):[])].filter(Boolean);
  return JSON.stringify({expanded:root?.dataset.expanded,orientation:root?.dataset.orientation,orientationTurn:root?.dataset.orientationTurn,cameraMode:camera?.dataset.mode,boxes:nodes.map(node=>{const r=node.getBoundingClientRect();return [round(r.x),round(r.y),round(r.width),round(r.height)];})});
 };
 const settle=async(label='camera layout')=>{
  const deadline=performance.now()+5000;let previous='',stableFrames=0;
  while(performance.now()<deadline){
   await new Promise(requestAnimationFrame);
   if(document.fonts&&document.fonts.status!=='loaded'){previous='';stableFrames=0;continue;}
   if(root?.classList.contains('duo-folding')||root?.classList.contains('duo-measuring')||root?.classList.contains('duo-orientation-turning')||root?.dataset.orientationTurn){previous='';stableFrames=0;continue;}
   if(pendingFiniteAnimations().length){previous='';stableFrames=0;continue;}
   const current=geometrySignature();
   if(current===previous)stableFrames++;else stableFrames=0;
   if(stableFrames>=3)return;
   previous=current;
  }
  throw Error(label+' did not reach a stable pose with loaded fonts and completed finite animations within 5 seconds.\n'+JSON.stringify(diagnostic(),null,2));
 };
 const until=async(fn,message)=>{const end=Date.now()+12000;while(!fn()){assert(Date.now()<end,message);await new Promise(resolve=>setTimeout(resolve,100));}};
 const click=selector=>{const n=document.querySelector(selector);assert(n,'Missing '+selector);n.click();};
 const state=()=>PeakDuo.getState();
 const report=[];
 if(state().camera){click('[data-camera=exit]');await until(()=>!state().camera,'Exit completed');await settle('camera exit');}
 if(state().workspace.expanded){click('.duo-fold-button');await settle('folded pose');}
 for(const pose of ['folded','landscape','portrait']) {
  if(pose==='landscape'){click('.duo-fold-button');await settle('landscape unfold');if(root.dataset.orientation==='portrait'){click('.duo-orientation-button');await settle('landscape orientation');}}
  if(pose==='portrait'){click('.duo-orientation-button');await settle('portrait orientation');}
  await settle(pose+' launcher pose');
  assert(root.dataset.expanded===(pose==='folded'?'false':'true')&&root.dataset.orientation===(pose==='portrait'?'portrait':'landscape'),pose+' reached its requested shell pose');
  click('.duo-pane[data-visible=true] .duo-app-button[data-app=camera] .duo-icon-tile');await settle(pose+' camera open');
  for(const mode of ['photo','video']) {
   click(`button[data-mode=${mode}]`);await settle(pose+' '+mode+' controls');
   const cam=document.querySelector('.duo-camera'),bank=cam?.closest('.duo-screenbank');
   const bounds=rect(cam),screen=rect(bank);
   assert(Object.keys(bounds).every(k=>Math.abs(bounds[k]-screen[k])<1),pose+' camera fills display');
   const buttons=[...cam.querySelectorAll('button')].filter(n=>n.getClientRects().length).map(n=>({label:n.getAttribute('aria-label')||n.textContent,rect:rect(n)}));
   for(const {label,rect:r} of buttons)assert(r.x>=screen.x&&r.y>=screen.y&&r.x+r.width<=screen.x+screen.width&&r.y+r.height<=screen.y+screen.height,pose+' '+mode+' '+label+' is inside display');
   for(let i=0;i<buttons.length;i++)for(let j=i+1;j<buttons.length;j++){
    const a=buttons[i].rect,b=buttons[j].rect;
    assert(Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)<1||Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y)<1,pose+' controls overlap: '+buttons[i].label+'/'+buttons[j].label);
   }
   const shutter=rect(cam.querySelector('[data-camera=shutter]'));
   assert(Math.abs(shutter.x+shutter.width/2-screen.x-screen.width/2)<1,pose+' shutter is centered');
   const title=rect(cam.querySelector('.duo-cam-format'));
   assert(title.width>45,pose+' format remains readable');
   assert(document.querySelectorAll('.duo-pane[data-visible=true]').length===0,pose+' launcher is hidden');
   for(let i=0;i<2;i++){const expected=i===0?'front':'rear';click('[data-camera=flip]');await until(()=>cam.dataset.facing===expected&&!cam.querySelector('[data-camera=flip]').disabled,pose+' confirmed lens switch to '+expected);}
   report.push({pose,mode,bounds,buttons:buttons.map(x=>x.label)});
  }
  click('[data-camera=exit]');await until(()=>!state().camera,'Exit completed');await settle(pose+' camera exit');assert(!state().camera,pose+' exit restores shell');
  click('.duo-pane[data-visible=true] .duo-app-button[data-app=camera] .duo-icon-tile');await settle(pose+' camera reopen');
  assert(state().camera,pose+' camera reopens');click('[data-camera=exit]');await until(()=>!state().camera,'Exit completed');await settle(pose+' final exit');
 }
 return report;
}
