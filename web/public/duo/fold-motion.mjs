/** Presentation-only book hinge. Snapshot DOM has no listeners or active media.
 * Live apps are never cloned as application instances. They remain in the bank.
 * 160ms reach + 440ms hinge + 160ms release matches the authored hand YCD.
 */
const OMITTED_TAGS=new Set(['AUDIO','EMBED','IFRAME','OBJECT','SCRIPT','VIDEO']);
const GEOMETRY_SELECTOR='.duo-pane,.duo-launcher,.duo-home-heading,.duo-home-heading h1,.duo-widgets,.duo-weather-widget,.duo-workspace-widget,.duo-weather-label,.duo-widget-top,.duo-weather-caption,.duo-workspace-widget strong,.duo-workspace-widget>span,.duo-search,.duo-app-grid,.duo-dock,.duo-app-mount,.duo-app-instance';
const GEOMETRY_PROPERTIES=['position','width','height','min-width','min-height','max-width','max-height','top','right','bottom','left','display','grid-template-columns','grid-template-rows','grid-column','grid-row','grid-auto-rows','flex-direction','flex','gap','padding','margin','font-size','overflow','overflow-x','overflow-y','align-items','justify-content'];
const POSE_RULE=/#duo[^{}]*\[data-(?:expanded|orientation|layout|active|split)(?:[=\]\s])/i;
const IDREF_TOKENS=new Set(['aria-labelledby','aria-describedby','aria-controls','aria-owns','aria-details','aria-flowto','aria-errormessage','headers']);
const IDREF_SINGLE=new Set(['for','list','form']);
const MAX_SNAPSHOT_NODES=1800;
const MAX_SNAPSHOT_DEPTH=128;

class SnapshotBudgetExceeded extends Error{}

function isElement(node){return node?.nodeType===1;}
function isOmitted(node){return isElement(node)&&OMITTED_TAGS.has(node.tagName);}
function isVisibleSnapshotNode(node,{ignoreOpacity=false}={}){
 if(!isElement(node))return true;
 if(isOmitted(node)||node.hidden||node.getAttribute('data-visible')==='false')return false;
 const style=getComputedStyle(node);
 return style.display!=='none'&&style.visibility!=='hidden'&&(ignoreOpacity||Number(style.opacity)>0);
}
function copyControlState(source,target,{scroll=true}={}){
 if(!isElement(source)||!isElement(target))return;
 try{if('value'in source&&'value'in target)target.value=source.value;}catch{}
 try{if('checked'in source&&'checked'in target)target.checked=source.checked;}catch{}
 try{if('selected'in source&&'selected'in target)target.selected=source.selected;}catch{}
 if(scroll){target.scrollTop=source.scrollTop;target.scrollLeft=source.scrollLeft;}
 target.removeAttribute('autofocus');
}
function splitSelectorList(value){
 const result=[];let start=0,depth=0,quote='';
 for(let i=0;i<value.length;i++){
  const char=value[i];
  if(quote){if(char==='\\')i++;else if(char===quote)quote='';continue;}
  if(char==='"'||char==="'"){quote=char;continue;}
  if(char==='('||char==='[')depth++;
  else if(char===')'||char===']')depth--;
  else if(char===','&&depth===0){result.push(value.slice(start,i).trim());start=i+1;}
 }
 result.push(value.slice(start).trim());return result.filter(Boolean);
}

export class FoldMotion {
 constructor(root,bank,{onTransition=()=>{}}={}){
   this.root=root;this.bank=bank;this.onTransition=onTransition;this.animations=[];this.generation=0;
   this.phase=root.dataset.expanded==='true'?1:0;this.probe=null;this.hardwareOverlay=null;this.hardwareAxisFrame=0;
 }
 cloneVisibleTree(source,pairs){
  // A rapid reversal snapshots the live bank while the previous transition has faded its root to 0.
  // Ignore only that root opacity; hidden descendants are still pruned by their own computed styles.
  if(!isVisibleSnapshotNode(source,{ignoreOpacity:true}))return null;
  const clone=source.cloneNode(false);pairs.set(source,clone);
  let nodes=1;const stack=[{source,clone,depth:0,index:0}];
  while(stack.length){
   const frame=stack[stack.length-1],children=frame.source.childNodes;
   if(frame.index>=children.length){
    if(isElement(frame.source)){
     copyControlState(frame.source,frame.clone);
     if(frame.source.children.length&&!frame.clone.children.length&&!frame.clone.textContent.trim()&&frame.source.matches('.duo-overlays,.duo-notification-host')){frame.clone.remove();pairs.delete(frame.source);}
    }
    stack.pop();continue;
   }
   const child=children[frame.index++];if(!isVisibleSnapshotNode(child))continue;
   const depth=frame.depth+1;if(depth>MAX_SNAPSHOT_DEPTH||++nodes>MAX_SNAPSHOT_NODES)throw new SnapshotBudgetExceeded('Fold snapshot exceeded its visible DOM budget.');
   const childClone=child.cloneNode(false);frame.clone.append(childClone);pairs.set(child,childClone);stack.push({source:child,clone:childClone,depth,index:0});
  }
  return pairs.has(source)?clone:null;
 }
 cloneSnapshotTree(source){
  if(!source)return {node:null,pairs:new Map()};
  const pairs=new Map(),clone=source.cloneNode(true);
  let nodes=0;const stack=[[source,clone,0]];
  while(stack.length){
   const [original,copy,depth]=stack.pop();
   if(depth>MAX_SNAPSHOT_DEPTH||++nodes>MAX_SNAPSHOT_NODES)throw new SnapshotBudgetExceeded('Fold snapshot clone exceeded its DOM budget.');
   pairs.set(original,copy);copyControlState(original,copy);
   const originals=original.childNodes,copies=copy.childNodes;
   for(let i=originals.length-1;i>=0;i--)stack.push([originals[i],copies[i],depth+1]);
  }
  return {node:clone,pairs};
 }
 restoreScroll(pairs){
  for(const [source,target] of pairs){if(!isElement(source)||!isElement(target))continue;target.scrollTop=source.scrollTop;target.scrollLeft=source.scrollLeft;}
 }
 copyTreeScroll(source,target){
  if(isElement(source)&&isElement(target)){target.scrollTop=source.scrollTop;target.scrollLeft=source.scrollLeft;}
  const originals=source?.childNodes||[],copies=target?.childNodes||[];
  for(let i=0;i<Math.min(originals.length,copies.length);i++)this.copyTreeScroll(originals[i],copies[i]);
 }
 scopeIds(node){
  const prefix=`duo-motion-${++this.generation}-`,mapping=new Map();
  const nodes=[...(node?.matches?.('[id]')?[node]:[]),...node?.querySelectorAll?.('[id]')||[]];
  for(const item of nodes){const old=item.id;mapping.set(old,prefix+old);item.id=prefix+old;}
  for(const item of [node,...node.querySelectorAll('*')])for(const attr of [...item.attributes]){
   if(attr.name==='id')continue;
   let value=attr.value;
   value=value.replace(/url\(#([^)]*)\)/g,(match,id)=>mapping.has(id)?`url(#${mapping.get(id)})`:match);
   if(IDREF_TOKENS.has(attr.name))value=value.split(/\s+/).filter(Boolean).map(id=>mapping.get(id)||id).join(' ');
   else if(IDREF_SINGLE.has(attr.name)){if(mapping.has(value))value=mapping.get(value);}
   else if(attr.name==='href'||attr.name==='xlink:href'){
    if(value.startsWith('#')&&mapping.has(value.slice(1)))value=`#${mapping.get(value.slice(1))}`;
   }
   if(value!==attr.value)item.setAttribute(attr.name,value);
  }
 }
 poseStyleProperties(pairs){
  const properties=new Map(),rulesSeen=new Set();
  const addRule=(rule)=>{
   if(rule.type!==CSSRule.STYLE_RULE||!POSE_RULE.test(rule.selectorText||'')||!rule.style?.length)return;
   for(const selector of splitSelectorList(rule.selectorText)){
    if(selector.includes('::'))continue;
    let matches;try{matches=this.root.querySelectorAll(selector);}catch{continue;}
    for(const original of matches){const copy=pairs.get(original);if(!copy)continue;
     let names=properties.get(copy);if(!names)properties.set(copy,names=new Set());
     for(let i=0;i<rule.style.length;i++)names.add(rule.style.item(i));
    }
   }
  };
  const walk=(rules)=>{
   for(const rule of rules){
    if(rule.type===CSSRule.MEDIA_RULE&&rule.conditionText&&!matchMedia(rule.conditionText).matches)continue;
    if(rule.type===CSSRule.SUPPORTS_RULE&&rule.conditionText&&CSS.supports&&!CSS.supports(rule.conditionText))continue;
    if(rule.type===CSSRule.STYLE_RULE){if(!rulesSeen.has(rule)){rulesSeen.add(rule);addRule(rule);}continue;}
    if(rule.cssRules)walk(rule.cssRules);
   }
  };
  for(const sheet of document.styleSheets){try{walk(sheet.cssRules);}catch{}}
  return properties;
 }
 freezeSnapshotStyles(pairs,{measured=false}={}){
  const rules=this.poseStyleProperties(pairs),values=new Map();
  const remember=(node,style,properties,priority='')=>{
   let declarations=values.get(node);if(!declarations)values.set(node,declarations=new Map());
   for(const property of properties){const value=style.getPropertyValue(property);if(value)declarations.set(property,{value,priority});}
  };
  for(const [original,copy] of pairs){
   if(!isElement(original)||!isElement(copy))continue;
   const style=getComputedStyle(measured?copy:original);
   if(original.matches(GEOMETRY_SELECTOR))remember(copy,style,GEOMETRY_PROPERTIES);
   if(rules.has(copy))remember(copy,style,rules.get(copy),'important');
  }
  const rootStyle=getComputedStyle(this.root),bankStyle=getComputedStyle(this.bank);
  const clone=[...pairs.values()].find(node=>node.classList?.contains('duo-screenbank'));
  if(clone)for(const style of [rootStyle,bankStyle])for(let i=0;i<style.length;i++){
   const property=style.item(i);if(!property.startsWith('--'))continue;
   const value=style.getPropertyValue(property);if(value)clone.style.setProperty(property,value);
  }
  for(const [node,declarations] of values)for(const [property,{value,priority}] of declarations)node.style.setProperty(property,value,priority);
 }
 createProbe(){
  const sourceStage=this.root.querySelector('.duo-stage'),sourceChassis=this.root.querySelector('.duo-chassis');
  const stage=document.createElement('div'),chassis=sourceChassis.cloneNode(false),bank=this.bank.cloneNode(false);
  stage.className=`${sourceStage.className} duo-fold-measure`;stage.setAttribute('aria-hidden','true');stage.inert=true;
  stage.append(chassis);chassis.append(bank);this.root.append(stage);this.probe=stage;
  return {stage,chassis,bank};
 }
 snapshot({measureTarget=false}={}){
  const started=performance.now(),pairs=new Map();let clone;
  try{clone=this.cloneVisibleTree(this.bank,pairs);}catch(error){if(error instanceof SnapshotBudgetExceeded)return null;throw error;}
  if(!clone)return null;
  clone.classList.add('duo-fold-copy');clone.setAttribute('aria-hidden','true');clone.inert=true;
  clone.dataset.snapshotLayout=this.root.dataset.expanded==='true'?this.root.dataset.layout:'full';
  clone.dataset.snapshotActive=this.root.dataset.active;clone.dataset.snapshotExpanded=this.root.dataset.expanded;
  clone.dataset.snapshotOrientation=this.root.dataset.orientation;clone.style.removeProperty('opacity');
  this.scopeIds(clone);
  let width,height,stageWidth,chassisHeight;
  if(measureTarget){
   const {stage,chassis,bank}=this.createProbe(),box=bank.getBoundingClientRect(),stageBox=stage.getBoundingClientRect(),chassisBox=chassis.getBoundingClientRect();width=box.width;height=box.height;stageWidth=stageBox.width;chassisHeight=chassisBox.height;
   clone.style.cssText=`position:absolute;left:0;top:0;width:${width}px;height:${height}px;`;
   bank.append(clone);void bank.offsetWidth;this.freezeSnapshotStyles(pairs,{measured:true});this.restoreScroll(pairs);void clone.offsetWidth;
   clone.remove();this.probe.remove();this.probe=null;
  }else{
   const box=this.bank.getBoundingClientRect(),stageBox=this.root.querySelector('.duo-stage').getBoundingClientRect(),chassisBox=this.root.querySelector('.duo-chassis').getBoundingClientRect();width=box.width;height=box.height;stageWidth=stageBox.width;chassisHeight=chassisBox.height;
   clone.style.cssText=`position:absolute;left:0;top:0;width:${width}px;height:${height}px;`;
   this.freezeSnapshotStyles(pairs);
  }
  const bankRect=this.bank.getBoundingClientRect(),chassis=this.root.querySelector('.duo-stage>.duo-chassis');
  const hardware=[...(chassis?.querySelectorAll(':scope>.duo-side-button')||[])].map(button=>{
   const rect=button.getBoundingClientRect();
   return {kind:button.classList.contains('duo-side-power')?'power':button.classList.contains('duo-volume-down')?'volume-down':'volume-up',left:rect.left-bankRect.left,top:rect.top-bankRect.top,width:rect.width,height:rect.height};
  });
  return {node:clone,pairs,width,height,stageWidth,chassisHeight,layout:clone.dataset.snapshotLayout,expanded:clone.dataset.snapshotExpanded,active:clone.dataset.snapshotActive,orientation:clone.dataset.snapshotOrientation,hardware,nodeCount:pairs.size,snapshotMs:performance.now()-started};
 }
 cancel(){
  if(this.transition){const transition=this.transition;
   // Snapshot preparation consumes wall time while WAAPI is still pending.
   // Reverse the pose that was actually painted, not time spent building it.
   const elapsed=transition.animation?Number(transition.animation.currentTime)||0:performance.now()-transition.start;
   this.phase=transition.from+(transition.to-transition.from)*Math.max(0,Math.min(1,elapsed/transition.duration));this.transition=null;
  }
   ++this.generation;clearTimeout(this.timer);if(this.hardwareAxisFrame)cancelAnimationFrame(this.hardwareAxisFrame);this.hardwareAxisFrame=0;this.animations.forEach(animation=>animation.cancel());this.animations=[];
  this.sceneClip?.remove();this.sceneClip=null;this.scene=null;this.hardwareOverlay?.remove();this.hardwareOverlay=null;this.coverPanel?.remove();this.coverPanel=null;this.probe?.remove();this.probe=null;
  this.bank.style.removeProperty('opacity');this.root.classList.remove('duo-folding','duo-measuring');
 }
 play(expanded,beforeSnapshot,reduced=false){
  this.cancel();this.onTransition({expanded:!!expanded,reduced:!!reduced});
  if(reduced||!this.root.isConnected||this.root.hidden){this.phase=expanded?1:0;return;}
  const from=this.phase,to=expanded?1:0,duration=Math.max(1,760*Math.abs(to-from));
  this.transition={from,to,duration,start:performance.now()};
  this.root.classList.add('duo-folding');
  const afterSnapshot=this.snapshot({measureTarget:true});
  const snap=expanded?afterSnapshot:beforeSnapshot,cover=expanded?beforeSnapshot:afterSnapshot;
  if(!beforeSnapshot?.width||!beforeSnapshot?.height||!afterSnapshot?.width||!afterSnapshot?.height||!snap?.width||!snap?.height){this.phase=to;this.transition=null;this.bank.style.removeProperty('opacity');this.root.classList.remove('duo-folding','duo-measuring');return;}
  const sceneClip=document.createElement('div');this.sceneClip=sceneClip;sceneClip.className='duo-fold-scene-clip';sceneClip.setAttribute('aria-hidden','true');sceneClip.inert=true;
  const scene=document.createElement('div');this.scene=scene;scene.className='duo-fold-scene';scene.setAttribute('aria-hidden','true');scene.inert=true;
  scene.style.width=`${snap.width}px`;scene.style.height=`${snap.height}px`;scene.style.transformOrigin='bottom right';
  const sceneHost=this.root.querySelector('.duo-chassis');sceneHost.append(sceneClip);sceneClip.append(scene);
  const portrait=snap.orientation==='portrait',sides=portrait?['top','bottom']:['left','right'],half=(portrait?snap.height:snap.width)/2;
  for(const [index,side] of sides.entries()){
   const leafWidth=portrait?snap.width:half,leafHeight=portrait?half:snap.height;
   const leaf=document.createElement('div');leaf.className=`duo-fold-leaf duo-fold-${side}`;leaf.style.width=`${leafWidth}px`;leaf.style.height=`${leafHeight}px`;leaf.style.left=`${portrait?0:index*half}px`;leaf.style.top=`${portrait?index*half:0}px`;
   leaf.innerHTML='<div class="duo-fold-front"></div><div class="duo-fold-cover"></div><div class="duo-fold-edge"></div><div class="duo-fold-light"></div>';
   const copied=index===0?null:this.cloneSnapshotTree(snap.node),view=index===0?snap.node:copied.node;
   const viewPairs=index===0?snap.pairs:new Map([...snap.pairs].map(([source,snapshotNode])=>[source,copied.pairs.get(snapshotNode)]).filter(([,target])=>target));
   if(index!==0)this.scopeIds(view);
   view.dataset.snapshotLayout=snap.layout;view.dataset.snapshotActive=snap.active;view.dataset.snapshotExpanded=snap.expanded;view.dataset.snapshotOrientation=snap.orientation;
   view.style.cssText=`width:${snap.width}px;height:${snap.height}px;left:${portrait?0:-index*half}px;top:${portrait?-index*half:0}px;`;
   const front=leaf.querySelector('.duo-fold-front'),hinge=portrait?(index===0?'bottom':'top'):(index===0?'right':'left');
   const blurLayers=this.makeBlurLayers(view,hinge,'inner',portrait);scene.append(leaf);front.append(view,...blurLayers,this.makeDisplayShade());this.restoreScroll(viewPairs);for(const layer of blurLayers)this.copyTreeScroll(view,layer);
   this.animateDisplay(view,duration,from,to,'inner');
   blurLayers.forEach((layer,i)=>this.animateBlurLayer(layer,duration,from,to,'inner',i,hinge,portrait));
   this.animateDisplay(front.querySelector('.duo-fold-shade'),duration,from,to,'inner',true);
   const rotation=portrait?'rotateX':'rotateY',counterScale=portrait?'scaleX':'scaleY',direction=index===0?1:-1;
   const frames=Array.from({length:109},(_,i)=>{
    const phase=from+(to-from)*i/108,eased=this.openProgress(phase),angle=180*(1-eased)-12*eased*(1-eased),radians=angle*Math.PI/180;
    // Perspective projects the near edge beyond the chassis at the hinge.
    // A small orthogonal counter-scale preserves the complete outer leaf box.
    const fit=1-.015*Math.sin(radians)**2;
    return {transform:`${rotation}(${direction*angle}deg) ${counterScale}(${fit})`,offset:i/108};
   });
   const hingeAnimation=leaf.animate(frames,{duration,easing:'linear',fill:'both'});this.animations.push(hingeAnimation);
   if(index===0)this.transition.animation=hingeAnimation;
   this.animations.push(leaf.querySelector('.duo-fold-light').animate([{opacity:expanded?.5:.02},{opacity:.35,offset:.45},{opacity:expanded?.02:.42}],{duration,fill:'both'}));
  }
  if(cover?.width&&cover?.height){
   const coverPanel=document.createElement('div');this.coverPanel=coverPanel;coverPanel.className='duo-fold-cover-panel';coverPanel.style.width=`${cover.width}px`;coverPanel.style.height=`${cover.height}px`;coverPanel.setAttribute('aria-hidden','true');coverPanel.inert=true;
   const viewport=document.createElement('div');viewport.className='duo-fold-cover-viewport';const copiedCover=this.cloneSnapshotTree(cover.node),outer=copiedCover.node;this.scopeIds(outer);
   outer.dataset.snapshotLayout='full';outer.dataset.snapshotActive=cover.active;outer.dataset.snapshotExpanded='false';outer.dataset.snapshotOrientation=cover.orientation;outer.classList.add('duo-fold-cover-copy');outer.style.cssText=`position:absolute;left:0;top:0;width:${cover.width}px;height:${cover.height}px;transform:none!important;`;
   viewport.append(outer);coverPanel.append(viewport);this.root.querySelector('.duo-stage>.duo-chassis').append(coverPanel);
   const coverPairs=new Map([...cover.pairs].map(([source,snapshotNode])=>[source,copiedCover.pairs.get(snapshotNode)]).filter(([,target])=>target));this.restoreScroll(coverPairs);
   // Keep the cover UI on screen only while the projected outer case is aligned
   // with its closed pose. The inner leaves need most of the hinge arc to fold;
   // showing a fixed cover clone earlier makes it float ahead of that geometry.
   const coverOpacity=Array.from({length:109},(_,i)=>{const phase=from+(to-from)*i/108,progress=this.openProgress(phase),opacity=progress<=.002?1:progress<.006?(.006-progress)/.004:0;return {opacity,offset:i/108};});this.animations.push(coverPanel.animate(coverOpacity,{duration,easing:'linear',fill:'both'}));
  }
  const hardwareOverlay=this.makeHardwareLayer(snap,null,portrait,half);
  if(hardwareOverlay){hardwareOverlay.classList.add('duo-fold-hardware-overlay');hardwareOverlay.style.width=`${snap.width}px`;hardwareOverlay.style.height=`${snap.height}px`;sceneHost.append(hardwareOverlay);this.hardwareOverlay=hardwareOverlay;}
  this.bank.style.opacity='0';
  const scaleX=cover?.width?cover.width/snap.width:1,scaleY=cover?.height?cover.height/snap.height:1;
  const startProgress=this.openProgress(from),endProgress=this.openProgress(to),progressRange=endProgress-startProgress||1;
  const geometryFrames=(source,target,property)=>Array.from({length:109},(_,i)=>{const phase=from+(to-from)*i/108,progress=Math.max(0,Math.min(1,(this.openProgress(phase)-startProgress)/progressRange));return {[property]:`${source+(target-source)*progress}px`,offset:i/108};});
  const sourcePose=beforeSnapshot||afterSnapshot,targetPose=afterSnapshot;
  const stage=this.root.querySelector('.duo-stage'),chassis=this.root.querySelector('.duo-chassis');
  this.animations.push(stage.animate(geometryFrames(sourcePose.stageWidth,targetPose.stageWidth,'width'),{duration,easing:'linear',fill:'both'}));
  this.animations.push(chassis.animate(geometryFrames(sourcePose.chassisHeight,targetPose.chassisHeight,'height'),{duration,easing:'linear',fill:'both'}));
  this.animations.push(this.bank.animate(geometryFrames(sourcePose.width,targetPose.width,'width'),{duration,easing:'linear',fill:'both'}));
  this.animations.push(this.bank.animate(geometryFrames(sourcePose.height,targetPose.height,'height'),{duration,easing:'linear',fill:'both'}));
  const startX=scaleX+(1-scaleX)*startProgress,startY=scaleY+(1-scaleY)*startProgress;
  const endX=scaleX+(1-scaleX)*endProgress,endY=scaleY+(1-scaleY)*endProgress;
  const scaleFrames=Array.from({length:109},(_,i)=>{
   const phase=from+(to-from)*i/108,progress=Math.max(0,Math.min(1,(this.openProgress(phase)-startProgress)/progressRange));
   return {transform:`scale(${startX+(endX-startX)*progress},${startY+(endY-startY)*progress})`,offset:i/108};
  });
  this.animations.push(scene.animate(scaleFrames,{duration,easing:'linear',fill:'both'}));
  if(hardwareOverlay){
   this.animations.push(hardwareOverlay.animate(scaleFrames,{duration,easing:'linear',fill:'both'}));
   this.animations.push(hardwareOverlay.animate([{opacity:1},{opacity:1}],{duration,easing:'linear',fill:'both'}));
   const normalized=(pose,item)=>{const x=pose.width/snap.width,y=pose.height/snap.height;return {left:item.left/x,top:item.top/y,width:item.width/x,height:item.height/y};};
   const sourceHardware=new Map(beforeSnapshot.hardware.map(item=>[item.kind,normalized(beforeSnapshot,item)])),targetHardware=new Map(afterSnapshot.hardware.map(item=>[item.kind,normalized(afterSnapshot,item)]));
   const axisChanges=[];
   for(const control of hardwareOverlay.querySelectorAll('.duo-fold-hardware-control')){
    const kind=[...control.classList].find(name=>name.startsWith('duo-fold-hardware-')&&name!=='duo-fold-hardware-control')?.slice('duo-fold-hardware-'.length),source=sourceHardware.get(kind),target=targetHardware.get(kind);if(!source||!target)continue;
    const horizontalStart=source.width>=source.height,horizontalEnd=target.width>=target.height,sourceAxis=horizontalStart?'horizontal':'vertical',targetAxis=horizontalEnd?'horizontal':'vertical';
    control.dataset.axis=sourceAxis;
    const controlFrames=Array.from({length:109},(_,i)=>{
     const phase=from+(to-from)*i/108,progress=Math.max(0,Math.min(1,(this.openProgress(phase)-startProgress)/progressRange)),lerp=(a,b,t)=>a+(b-a)*t;
     let point,opacity=progress<=.002||progress>=.998?1:progress<.006?(.006-progress)/.004:progress>.994?(progress-.994)/.004:0;
     // Keep orientation-changing controls on their actual source/target endpoint.
     if(horizontalStart!==horizontalEnd){point=progress>=.5?target:source;}
     else point={left:lerp(source.left,target.left,progress),top:lerp(source.top,target.top,progress),width:lerp(source.width,target.width,progress),height:lerp(source.height,target.height,progress)};
     return {left:`${point.left}px`,top:`${point.top}px`,width:`${point.width}px`,height:`${point.height}px`,opacity,offset:i/108};
    });
    const controlAnimation=control.animate(controlFrames,{duration,easing:'linear',fill:'both'});this.animations.push(controlAnimation);
    if(sourceAxis!==targetAxis)axisChanges.push({control,sourceAxis,targetAxis,animation:controlAnimation});
   }
   if(axisChanges.length){
    const syncHardwareAxis=()=>{
     this.hardwareAxisFrame=0;if(!this.hardwareOverlay?.isConnected)return;
     const progress=Math.max(0,Math.min(1,(Number(axisChanges[0].animation.currentTime)||0)/duration));
     for(const change of axisChanges)change.control.dataset.axis=progress>=.5?change.targetAxis:change.sourceAxis;
     if(progress<1)this.hardwareAxisFrame=requestAnimationFrame(syncHardwareAxis);
    };
    this.hardwareAxisFrame=requestAnimationFrame(syncHardwareAxis);
   }
  }
  const contentOpacity=Array.from({length:109},(_,i)=>{const phase=from+(to-from)*i/108,progress=this.openProgress(phase),opacity=progress<=.52?0:progress<.56?(progress-.52)/.04:1;return {opacity,offset:i/108};});
  for(const view of scene.querySelectorAll('.duo-fold-copy:not(.duo-fold-blur-layer)'))this.animations.push(view.animate(contentOpacity,{duration,easing:'linear',fill:'both'}));
  this.animations.push(this.bank.animate([{opacity:0},{opacity:0,offset:.80},{opacity:1}],{duration,fill:'both'}));
  const transition=this.transition;
  const finish=()=>{
   if(this.transition!==transition)return;
   const elapsed=Number(transition.animation?.currentTime)||0;
   if(elapsed>=duration||transition.animation?.playState==='finished'){this.cancel();return;}
   // A delayed first paint must not shorten the authored hinge animation.
   this.timer=setTimeout(finish,Math.max(16,duration-elapsed+20));
  };
  this.timer=setTimeout(finish,duration+20);
 }
 makeHardwareLayer(snapshot,ownerIndex,portrait,half){
  if(!snapshot?.hardware?.length)return null;
  const layer=document.createElement('div');layer.className='duo-fold-hardware-layer';layer.dataset.orientation=portrait?'portrait':'landscape';layer.setAttribute('aria-hidden','true');layer.inert=true;
  for(const item of snapshot.hardware){
   const center=portrait?item.top+item.height/2:item.left+item.width/2,owner=center<(portrait?snapshot.height:snapshot.width)/2?0:1;
   if(ownerIndex!==null&&ownerIndex!==owner)continue;
   const control=document.createElement('span');control.className=`duo-fold-hardware-control duo-fold-hardware-${item.kind}`;control.dataset.axis=item.width>=item.height?'horizontal':'vertical';
   const left=item.left-(portrait?0:owner*half),top=item.top-(portrait?owner*half:0);control.style.cssText=`left:${left.toFixed(2)}px;top:${top.toFixed(2)}px;width:${item.width.toFixed(2)}px;height:${item.height.toFixed(2)}px;`;layer.append(control);
  }
  return layer.childElementCount?layer:null;
 }
 openProgress(phase){const x=Math.max(0,Math.min(1,(phase*760-160)/440));return x*x*x*(x*(x*6-15)+10);}
 makeDisplayShade(){const shade=document.createElement('div');shade.className='duo-fold-shade';shade.setAttribute('aria-hidden','true');return shade;}
 makeBlurLayers(node,hinge,face,portrait=false){
  const gradient=portrait?(hinge==='bottom'?'linear-gradient(to top,#000 0%,#000 54%,transparent 100%)':'linear-gradient(to bottom,#000 0%,#000 54%,transparent 100%)'):(hinge==='right'?'linear-gradient(to left,#000 0%,#000 54%,transparent 100%)':'linear-gradient(to right,#000 0%,#000 54%,transparent 100%)');
  return [3,8,16].map((blur,index)=>{
   const layer=this.cloneSnapshotTree(node).node;this.scopeIds(layer);layer.classList.add('duo-fold-blur-layer');layer.dataset.blur=String(blur);layer.setAttribute('aria-hidden','true');layer.inert=true;
   layer.style.setProperty('pointer-events','none','important');layer.style.setProperty('z-index',String(index+1),'important');layer.style.setProperty('filter',`blur(${blur}px)`,'important');
   for(const property of ['-webkit-mask-image','mask-image'])layer.style.setProperty(property,gradient);
   for(const property of ['-webkit-mask-repeat','mask-repeat'])layer.style.setProperty(property,'no-repeat');
   const position=face==='inner'?(portrait?`0px ${(parseFloat(node.style.height)/2).toFixed(2)}px`:`${(parseFloat(node.style.width)/2).toFixed(2)}px 0px`):'0px 0px';
   for(const property of ['-webkit-mask-position','mask-position'])layer.style.setProperty(property,position);
   for(const property of ['-webkit-mask-size','mask-size'])layer.style.setProperty(property,portrait?'100% 0%':'0% 100%');
   return layer;
  });
 }
 animateDisplay(node,duration,from,to,face,shade=false){
  const frames=Array.from({length:109},(_,i)=>{const phase=from+(to-from)*i/108,open=this.openProgress(phase),amount=face==='inner'?1-open:open;if(shade)return {opacity:.65*amount,offset:i/108};return {filter:`brightness(${(1-.28*amount).toFixed(3)})`,opacity:1-.30*amount,offset:i/108};});
  this.animations.push(node.animate(frames,{duration,easing:'linear',fill:'both'}));
 }
 animateBlurLayer(node,duration,from,to,face,index,hinge,portrait=false){
  const opacity=[.38,.48,.62][index],frames=Array.from({length:109},(_,i)=>{const phase=from+(to-from)*i/108,open=this.openProgress(phase),raw=face==='inner'?1-open:open,amount=Math.sqrt(Math.max(0,raw)),width=parseFloat(node.style.width),height=parseFloat(node.style.height),size=portrait?`100% ${(100*amount).toFixed(2)}%`:`${(100*amount).toFixed(2)}% 100%`,x=face==='inner'&&!portrait?(hinge==='right'?width*(.5-amount):width*.5):0,y=face==='inner'&&portrait?(hinge==='bottom'?height*(.5-amount):height*.5):0,position=`${x.toFixed(2)}px ${y.toFixed(2)}px`;return {opacity:opacity*amount,maskSize:size,webkitMaskSize:size,maskPosition:position,webkitMaskPosition:position,offset:i/108};});
  this.animations.push(node.animate(frames,{duration,easing:'linear',fill:'both'}));
 }
 destroy(){this.cancel();}
}
