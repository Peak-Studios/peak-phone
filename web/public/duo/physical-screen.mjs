// Remote display content is rendered in script-free mirrors with no app
// callbacks. Inner and cover snapshots occupy separate regions of the DUI
// atlas so their fold treatments can move in opposite directions.
const styles=['build/smui.css','global.css','build/bundle.css',...['legacy-icons','apps','duo','ios','music','jobs','continuous','recording','upgrade','social-refresh','utilities','kilogram','native-refresh','weather','video','call','music-glass','lock-screen','control-center','settings-dock','fullscreen-apps','glass-bars','sharedrop','appearance','maps-editors','photos','mail','messages-app','sheet-system','app-editor-families','a-native-editors','legacy-app-sheets','foldable-orientation','notifications','hardware-controls','notes','restored-apps','nui-safe'].map(s=>'duo/'+s+'.css'+(s==='legacy-icons'?'?rev=phone-performance-20261011b':s==='glass-bars'?'?rev=glass-bars-opaque-20261001':s==='jobs'?'?rev=jobs-editor-20261008d':s==='a-native-editors'?'?rev=a-native-editors-20261008m':s==='app-editor-families'?'?rev=app-editor-families-theme-20261015':s==='legacy-app-sheets'?'?rev=legacy-app-sheets-20261008f':s==='photos'?'?rev=photos-theme-20261015':s==='maps-editors'?'?rev=maps-editors-20261008':s==='duo'?'?rev=ios-contained-feedback-20261011b':s==='social-refresh'?'?rev=phone-f05-calculator-safe-area-20261016b':['ios','call'].includes(s)?'?rev=ios-contained-feedback-20261011a':['messages-app','video'].includes(s)?'?rev=ios-communication-quality-20261010':s==='control-center'?'?rev=ios-control-center-quality-20261010':s==='native-refresh'?'?rev=phone-f35-compact-20261015d':s==='continuous'?'?rev=ios-fold-motion-quality-20261011b':['foldable-orientation','hardware-controls'].includes(s)?'?rev=ios-quarter-turn-20261011a':s==='weather'?'?rev=ios-weather-native-20261011e':s==='appearance'?'?rev=ios-contained-feedback-20261011a':s==='upgrade'?'?rev=ios-switcher-quality-20261010':s==='restored-apps'?'?rev=ios-restored-quality-20261010c':s==='notes'?'?rev=ios-notes-scalable-read-20261011a':''))];
const base=new URL('../',location.href).href;
const slot=Number(new URLSearchParams(location.search).get('slot'));
const resource=location.hostname.startsWith('cfx-nui-')?location.hostname.slice(8):null;
const faces={
 inner:{expanded:true,width:1024,host:document.getElementById('inner-face'),iframe:document.getElementById('display'),snapshot:null,animations:[],dim:null,blurs:[]},
 cover:{expanded:false,width:512,host:document.getElementById('cover-face'),iframe:document.getElementById('cover-display'),snapshot:null,animations:[],dim:null,blurs:[]}
};
for(const face of Object.values(faces))face.shutter=face.host.querySelector('.face-shutter');
let revision=0,foldTransition=null,settledPose=null,reportedRendered=false,expectedOrientation='landscape';
async function report(State,Error){if(!resource||!Number.isInteger(slot)||slot<1||slot>16)return;try{await fetch(`https://${resource}/Phone/PhysicalScreenStatus`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({Slot:slot,State,Error})});}catch{}}
function mirrorSource(){return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'self' 'unsafe-inline'; img-src https: data: blob:; font-src 'self' data:; script-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'self'"><base href="${base}">${styles.map(s=>`<link rel="stylesheet" href="${s}">`).join('')}<style>html,body{margin:0;background:#050608!important;overflow:hidden;width:100%;height:100%}#duo{position:absolute!important;left:0!important;top:0!important;right:auto!important;bottom:auto!important;pointer-events:none!important}#duo .duo-stage{opacity:1!important;transform:none!important;transition:none!important}#duo .duo-chassis{position:relative!important;padding:0!important;border:0!important;box-shadow:none!important;background:none!important;border-radius:0!important}#duo .duo-chassis::before,#duo .duo-chassis::after{display:none!important}#duo .duo-screenbank{border-radius:0!important;transition:none!important}</style></head><body><main id="duo" aria-hidden="true" inert=""><div class="duo-stage"><div class="duo-chassis"></div></div></main></body></html>`;}
const ready=Promise.all(Object.values(faces).map(face=>new Promise(resolve=>{face.iframe.addEventListener('load',resolve,{once:true});face.iframe.srcdoc=mirrorSource();})));
ready.then(()=>report('ready'));

export async function decodeDisplay(frame){
 if(typeof frame!=='string'||frame.length>65536||!/^duo2:[A-Za-z0-9+/=]+$/.test(frame))throw Error('Invalid display');
 const bytes=Uint8Array.from(atob(frame.slice(5)),c=>c.charCodeAt(0));
 const reader=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();let size=0,chunks=[];
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1000000){await reader.cancel();throw Error('Display too large');}chunks.push(value);}
 const buffer=new Uint8Array(size);let offset=0;for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.length;}return JSON.parse(new TextDecoder().decode(buffer));
}
export function sanitizeDisplay(doc,html){
 const template=doc.createElement('template');template.innerHTML=html;
 template.content.querySelectorAll('script,style,link,iframe,object,embed,base,meta,foreignObject,animate,set').forEach(n=>n.remove());
 for(const node of template.content.querySelectorAll('*'))for(const attr of [...node.attributes]){
  const key=attr.name.toLowerCase(),value=attr.value.trim();
  if(key.startsWith('on')||['srcdoc','href','xlink:href','action','formaction','autofocus','srcset'].includes(key))node.removeAttribute(attr.name);
  if(['src','poster'].includes(key)&&!(/^(https:\/\/|data:image\/(png|jpeg|webp|gif);base64,)/i.test(value)||/^(\.\/)?(duo|images|build)\/[\w./%-]+$/.test(value)))node.removeAttribute(attr.name);
 }
 return template.content;
}
function validateSnapshot(face,snapshot,doc){
 if(!snapshot||typeof snapshot!=='object'||snapshot.expanded!==face.expanded||typeof snapshot.html!=='string')throw Error('Invalid display snapshot');
 if(!Array.isArray(snapshot.viewport)||snapshot.viewport.length!==2||![snapshot.width,snapshot.height,...snapshot.viewport].every(v=>Number.isFinite(v)&&v>0&&v<=8192))throw Error('Invalid display dimensions');
 if(!snapshot.attributes||typeof snapshot.attributes!=='object'||Array.isArray(snapshot.attributes))throw Error('Invalid display attributes');
 const orientation=snapshot.attributes['data-orientation'];
 if(!['landscape','portrait'].includes(orientation)||(!snapshot.expanded&&orientation!=='landscape'))throw Error('Invalid display orientation');
 const fragment=sanitizeDisplay(doc,snapshot.html),probe=doc.createElement('div');probe.append(fragment.cloneNode(true));
 const banks=probe.querySelectorAll('.duo-screenbank');if(banks.length!==1)throw Error('Missing or duplicate screen bank');
 return {fragment,bank:banks[0],orientation};
}
function cleanFaceEffects(face){
 const shutterOpacity=Number(getComputedStyle(face.shutter).opacity);
 for(const animation of face.animations){animation.onfinish=null;try{animation.cancel();}catch{}}
 face.animations=[];face.shutter.style.opacity=String(Number.isFinite(shutterOpacity)?shutterOpacity:1);
 face.dim?.remove();face.dim=null;for(const node of face.blurs)node.remove();face.blurs=[];
}
function replayMirrorState(container){
 for(const node of container.querySelectorAll('[data-mirror-selection]')){try{const [start,end,direction]=JSON.parse(node.dataset.mirrorSelection);node.setSelectionRange(start,end,direction);}catch{}}
 for(const node of container.querySelectorAll('[data-mirror-scroll]')){try{const [x,y]=JSON.parse(node.dataset.mirrorScroll);node.scrollLeft=x;node.scrollTop=y;}catch{}}
}
function transitionPhase(at=performance.now(),transition=foldTransition){
 if(!transition)return 1;
 const progress=Math.max(0,Math.min(1,(at-transition.startedAt)/transition.duration));
 return transition.from+(transition.to-transition.from)*progress;
}
function hingeOpenProgress(phase){
 const x=Math.max(0,Math.min(1,(phase*760-160)/440));
 return x*x*x*(x*(x*6-15)+10);
}
function effectAmount(face,phase,transition=foldTransition){
 const open=hingeOpenProgress(phase),raw=face.expanded?1-open:open,amount=Math.sqrt(Math.max(0,raw));
 return transition&&face.expanded===transition.expanded&&!transition.targetFrameReady?Math.max(amount,.82):amount;
}
function maskProperties(node,inner,width){
 const gradient=inner?'linear-gradient(to left, #000 0%, #000 54%, transparent 100%)':'linear-gradient(to right, #000 0%, #000 54%, transparent 100%)';
 for(const property of ['-webkit-mask-image','mask-image'])node.style.setProperty(property,gradient);
 for(const property of ['-webkit-mask-repeat','mask-repeat'])node.style.setProperty(property,'no-repeat');
 const position=`${inner?(width*.5).toFixed(2):'0.00'}px 0px`;
 for(const property of ['-webkit-mask-position','mask-position'])node.style.setProperty(property,position);
}
function makeFaceEffects(face){
 cleanFaceEffects(face);
 const frame=face.snapshot;if(!frame)return;
 const doc=face.iframe.contentDocument,root=doc.getElementById('duo'),chassis=root.querySelector('.duo-chassis'),bank=chassis.querySelector('.duo-screenbank');
 if(!bank)return;
 const inner=face.expanded,clip=inner?'inset(0 50% 0 0)':'inset(0)';
 const dim=doc.createElement('div');dim.className='duo-handoff-dim';dim.setAttribute('aria-hidden','true');dim.inert=true;
 const gradient=inner?'linear-gradient(90deg,rgba(1,3,8,.10) 0%,rgba(1,3,8,.22) 43%,rgba(1,3,8,.35) 50%,rgba(1,3,8,.22) 57%,rgba(1,3,8,.08) 100%)':'linear-gradient(270deg,rgba(1,3,8,.4),rgba(4,8,15,.14) 56%,transparent 100%)';
 dim.style.cssText=`position:absolute!important;left:0!important;top:0!important;width:${frame.width}px!important;height:${frame.height}px!important;z-index:910!important;pointer-events:none!important;clip-path:inset(0);border-radius:0;opacity:0;background:${gradient};`;
 chassis.append(dim);face.dim=dim;
 for(const [index,blur] of [3,8,16].entries()){
  const layer=bank.cloneNode(true);layer.classList.add('duo-handoff-blur');layer.dataset.blur=String(blur);layer.setAttribute('aria-hidden','true');layer.inert=true;
  layer.style.cssText=`position:absolute!important;left:0!important;top:0!important;width:${frame.width}px!important;height:${frame.height}px!important;z-index:${901+index}!important;pointer-events:none!important;clip-path:${clip};filter:blur(${blur}px);opacity:0;border-radius:0;transform:none!important;`;
  maskProperties(layer,inner,frame.width);chassis.append(layer);replayMirrorState(layer);face.blurs.push(layer);
 }
}
function animateFace(face,transition){
 if(!face.snapshot)return;
 const shutterStart=Number(getComputedStyle(face.shutter).opacity);
 makeFaceEffects(face);
 const start=Math.max(0,Math.min(1,(performance.now()-transition.startedAt)/transition.duration));
 const phase=transition.from+(transition.to-transition.from)*start,remaining=Math.max(1,transition.duration*(1-start));
 const width=face.snapshot.width,inner=face.expanded;
 const makeFrames=(blend=1)=>Array.from({length:73},(_,i)=>{
  const part=start+(1-start)*i/72,angle=transition.from+(transition.to-transition.from)*part,coverage=effectAmount(face,angle,transition),amount=coverage*blend;
  const size=`${(coverage*100).toFixed(2)}% 100%`,x=inner?width*(.5-coverage):0,position=`${x.toFixed(2)}px 0px`;
  return {opacity:amount,webkitMaskSize:size,maskSize:size,webkitMaskPosition:position,maskPosition:position,offset:i/72};
 });
 if(face.dim)face.animations.push(face.dim.animate(makeFrames(.94),{duration:remaining,easing:'linear',fill:'both'}));
 for(const [index,layer] of face.blurs.entries())face.animations.push(layer.animate(makeFrames([.27,.4,.55][index]),{duration:remaining,easing:'linear',fill:'both'}));
 const visibleAtEnd=face.expanded===transition.expanded&&transition.targetFrameReady;
 face.animations.push(face.shutter.animate([{opacity:shutterStart},{opacity:visibleAtEnd?0:1}],{duration:remaining,easing:'ease-out',fill:'both'}));
 transition.currentPhase=phase;
}
function applySettledPose(){
 if(!settledPose)return;
 for(const face of Object.values(faces)){
  const active=face.expanded===settledPose.expanded;
  cleanFaceEffects(face);
  const orientationReady=!face.expanded||!expectedOrientation||face.snapshot?.attributes?.['data-orientation']===expectedOrientation;
  face.shutter.style.opacity=active&&settledPose.frameReady&&orientationReady?String(0):String(1);
 }
}
function settlePose(expanded,frameReady){
 settledPose={expanded,frameReady};foldTransition=null;applySettledPose();
}
function clearFoldTransition(){
 const current=foldTransition;foldTransition=null;if(current?.timer)clearTimeout(current.timer);if(current?.fallbackTimer)clearTimeout(current.fallbackTimer);
 for(const face of Object.values(faces))cleanFaceEffects(face);
}
function completeFoldTransition(current){
 if(foldTransition!==current)return;
 current.finished=true;
 if(current.timer)clearTimeout(current.timer);
 settlePose(current.expanded,current.targetFrameReady);
}
function playFoldTransition(data){
 const now=performance.now(),oldPhase=foldTransition?transitionPhase(now):(settledPose?(settledPose.expanded?1:0):null);
 const duration=Number(data.duration),progress=Number(data.progress)||0;
 if(data.reduced){clearFoldTransition();settlePose(data.expanded,false);return;}
 if(!Number.isFinite(duration)||duration<2||duration>5000)return;
 const expanded=data.expanded,from=Number.isFinite(Number(data.fromPhase))?Math.max(0,Math.min(1,Number(data.fromPhase))):(oldPhase??(expanded?0:1));
 clearFoldTransition();settledPose=null;
 const to=expanded?1:0,elapsed=Math.max(0,Math.min(1,progress))*duration;
 const current={expanded,from,to,duration,startedAt:now-elapsed,revisionAtStart:revision,targetFrameReady:false,finished:false,timer:null};foldTransition=current;
 for(const face of Object.values(faces))animateFace(face,current);
 current.timer=setTimeout(()=>completeFoldTransition(current),Math.max(0,duration-elapsed)+24);
}
function clearPoseContent(face){cleanFaceEffects(face);face.snapshot=null;face.fallback=false;face.shutter.style.opacity='1';face.iframe.contentDocument?.querySelector('.duo-chassis')?.replaceChildren();}
function renderFace(face,snapshot,validated,{fallback=false,frameRevision=revision}={}){
 const doc=face.iframe.contentDocument,root=doc.getElementById('duo'),chassis=root.querySelector('.duo-chassis'),stage=root.querySelector('.duo-stage');
 if(face.expanded&&expectedOrientation&&validated.orientation!==expectedOrientation)return false;
 // The candidate tree has already been sanitized and checked for one bank.
 // Commit only after every value validates, preserving the last valid pixels
 // if a frame is malformed or missing its expected screen bank.
 const fragment=validated.fragment,orientation=validated.orientation,probe=doc.createElement('div');probe.append(fragment.cloneNode(true));const candidate=probe.querySelector('.duo-screenbank');
 if(!candidate)throw Error('Missing screen bank');
 for(const attr of [...root.attributes])if(attr.name!=='id')root.removeAttribute(attr.name);
 for(const [key,value] of Object.entries(snapshot.attributes))if(key==='class'||key==='style'||/^data-[a-z-]+$/.test(key))root.setAttribute(key,String(value));
 root.setAttribute('aria-hidden','true');root.inert=true;root.dataset.visible='true';chassis.replaceChildren(fragment);
 const bank=chassis.querySelector('.duo-screenbank');
 bank.style.width=snapshot.width+'px';bank.style.height=snapshot.height+'px';stage.style.width=snapshot.width+'px';chassis.style.width=snapshot.width+'px';chassis.style.height=snapshot.height+'px';
 face.iframe.style.width=snapshot.viewport[0]+'px';face.iframe.style.height=snapshot.viewport[1]+'px';
 const portrait=snapshot.expanded&&orientation==='portrait';
 if(portrait){
  const offset=(snapshot.height-snapshot.width)/2;
  bank.style.transformOrigin='center center';bank.style.transform=`translate(${offset}px,${-offset}px) rotate(-90deg)`;
  face.iframe.style.transform=`scale(${face.width/snapshot.height},${1024/snapshot.width})`;
 }else{
  bank.style.removeProperty('transform');bank.style.removeProperty('transform-origin');
  face.iframe.style.transform=`scale(${face.width/snapshot.width},${1024/snapshot.height})`;
 }
 replayMirrorState(chassis);
 face.snapshot=snapshot;face.fallback=fallback;
 const transition=foldTransition;
 if(transition){
  if(!fallback&&snapshot.expanded===transition.expanded&&frameRevision>transition.revisionAtStart)transition.targetFrameReady=true;
  for(const target of Object.values(faces))animateFace(target,transition);
 }else if(!fallback){
  if(!settledPose)settledPose={expanded:snapshot.expanded,frameReady:true};
  else if(settledPose.expanded===snapshot.expanded)settledPose.frameReady=true;
  applySettledPose();
 }
 else applySettledPose();
 if(!reportedRendered){reportedRendered=true;report('rendered');}
 return true;
}
window.addEventListener('message',async event=>{
 const data=event.data;if(!data||typeof data!=='object')return;
 if(data.type==='pose'){
  if(typeof data.expanded==='boolean'&&(data.orientation==='landscape'||data.orientation==='portrait')&&(data.expanded||data.orientation==='landscape')){
   expectedOrientation=data.expanded?data.orientation:'landscape';
   const inner=faces.inner;
   if(inner.snapshot?.attributes?.['data-orientation']!==expectedOrientation)inner.shutter.style.opacity='1';
   else if(settledPose?.expanded===true&&settledPose.frameReady)inner.shutter.style.opacity='0';
  }
  return;
 }
 if(data.type==='fold'){
  if(typeof data.expanded==='boolean'&&(data.reduced===true||Number.isFinite(Number(data.duration))))playFoldTransition(data);
  return;
 }
 if(data.type!=='frame')return;const current=++revision;
 if(data.clear){clearFoldTransition();settledPose=null;reportedRendered=false;for(const face of Object.values(faces))clearPoseContent(face);return;}
 try{
  await ready;if(current!==revision)return;
  const snapshot=await decodeDisplay(data.frame);if(current!==revision)return;
  const face=snapshot?.expanded===true?faces.inner:snapshot?.expanded===false?faces.cover:null;if(!face)throw Error('Invalid display pose');
  const doc=face.iframe.contentDocument,validated=validateSnapshot(face,snapshot,doc);
  if(current!==revision)return;
  const locked=!!validated.fragment.querySelector('.duo-lock-screen:not([hidden])');
  if(locked){for(const target of Object.values(faces))clearPoseContent(target);if(foldTransition)foldTransition.targetFrameReady=false;else settledPose=null;}
  if(!renderFace(face,snapshot,validated,{frameRevision:current}))return;
  if(locked){
   const other=face.expanded?faces.cover:faces.inner,lockFallback={...snapshot,expanded:other.expanded,attributes:{...snapshot.attributes,'data-expanded':String(other.expanded),'data-orientation':other.expanded?snapshot.attributes['data-orientation']:'landscape'}};
   renderFace(other,lockFallback,validateSnapshot(other,lockFallback,other.iframe.contentDocument),{fallback:true,frameRevision:current});
  }
 }catch(error){console.warn('[Peak Duo] Rejected display:',error.message);report('error',error.message);}
});
