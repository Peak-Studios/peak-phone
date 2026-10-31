// Chromium renders the same display tree in NUI and DUI. No second app session
// or HTML screenshot approximation; only visible display content is replicated.
export function displaySnapshot(bank, root, expanded) {
 const clone=bank.cloneNode(true),originals=[bank,...bank.querySelectorAll('*')],copies=[clone,...clone.querySelectorAll('*')];
 const folding=root.classList.contains('duo-folding');
 if(folding)clone.style.removeProperty('opacity');
 const copyOf=new Map(originals.map((node,i)=>[node,copies[i]]));
 const intersects=(rect,clip)=>rect.width>0&&rect.height>0&&clip.right>clip.left&&clip.bottom>clip.top&&rect.right>clip.left&&rect.left<clip.right&&rect.bottom>clip.top&&rect.top<clip.bottom;
 const callScreen=[...bank.querySelectorAll('.pc-root .pc-screen')].find(node=>{const style=getComputedStyle(node),root=node.closest('.pc-root'),rootStyle=root&&getComputedStyle(root),rect=node.getBoundingClientRect();return !node.hidden&&!root?.hidden&&style.display!=='none'&&style.visibility==='visible'&&Number(style.opacity)>0&&rootStyle?.display!=='none'&&rootStyle?.visibility==='visible'&&Number(rootStyle?.opacity)>0&&intersects(rect,bank.getBoundingClientRect());});
 // The expanded call surface paints an opaque foreground over the app area.
 // Keep status, multitask, gesture, and call UI siblings, but never serialize
 // workspace content covered by that surface.
 const coveredByCall=node=>!!callScreen&&node.matches('.duo-app-mount,.duo-launcher');
 const visibleText=(node,clip)=>{
  if(!node.textContent.trim())return false;
  const range=node.ownerDocument.createRange();range.selectNodeContents(node);
  return [...range.getClientRects()].some(rect=>intersects(rect,clip));
 };
 const lock=bank.querySelector('.duo-lock-screen:not([hidden])');
 if(lock){const style=getComputedStyle(lock),rect=lock.getBoundingClientRect();if(style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity)!==0&&intersects(rect,bank.getBoundingClientRect()))clone.replaceChildren(copyOf.get(lock));}
 const drop=bank.querySelector('.duo-sharedrop:not([hidden])');
 if(drop){const style=getComputedStyle(drop),rect=drop.getBoundingClientRect();if(style.display!=='none'&&intersects(rect,bank.getBoundingClientRect()))clone.replaceChildren(copyOf.get(drop));}
 const clips=new Map(),visibleSubtree=new Map(),visibleBox=new Map(),styles=new Map(),displayedOptions=new WeakSet();
 const bankRect=bank.getBoundingClientRect(),scaleX=bank.clientWidth&&bankRect.width>0?bankRect.width/bank.clientWidth:1;
 const clipped=style=>({overflowX:/hidden|clip|auto|scroll/.test(style.overflowX),overflowY:/hidden|clip|auto|scroll/.test(style.overflowY)});
 const inspect=(node,inherited,opacity=1)=>{
  const style=getComputedStyle(node),rect=node.getBoundingClientRect(),ownOpacity=opacity*(folding&&node===bank?1:Number(style.opacity||1));
  const removed=style.display==='none'||ownOpacity===0||style.contentVisibility==='hidden'||(node instanceof HTMLInputElement&&node.type==='hidden')||coveredByCall(node);
  const visibility=style.visibility!=='hidden'&&style.visibility!=='collapse';
  let clip=inherited;
  const overflow=clipped(style);
  if(overflow.overflowX)clip={...clip,left:Math.max(clip.left,rect.left),right:Math.min(clip.right,rect.right)};
  if(overflow.overflowY)clip={...clip,top:Math.max(clip.top,rect.top),bottom:Math.min(clip.bottom,rect.bottom)};
  clips.set(node,clip);styles.set(node,style);
  const select=node instanceof HTMLOptionElement?node.closest('select'):null;
  const selectedLabel=!!select&&node.selected&&!select.multiple&&select.size<2&&visibleBox.get(select);
  if(selectedLabel)displayedOptions.add(node);
  visibleBox.set(node,!removed&&visibility&&(intersects(rect,inherited)||selectedLabel));
  // Descendant clips can only shrink. An empty inherited/own clip therefore
  // cannot paint any text or box; retain the same geometry placeholder below.
  if(removed||clip.right<=clip.left||clip.bottom<=clip.top){visibleSubtree.set(node,false);return false;}
  let found=visibleBox.get(node);
  for(const child of node.childNodes){
   if(child.nodeType===Node.TEXT_NODE){if(visibility&&visibleText(child,clip))found=true;}
   else if(child.nodeType===Node.ELEMENT_NODE&&inspect(child,clip,ownOpacity))found=true;
  }
  visibleSubtree.set(node,found);return found;
 };
 const viewport=bank.getBoundingClientRect();inspect(bank,{left:viewport.left,right:viewport.right,top:viewport.top,bottom:viewport.bottom});
 const geometry=['display','position','top','right','bottom','left','width','height','minWidth','minHeight','maxWidth','maxHeight','boxSizing','margin','marginTop','marginRight','marginBottom','marginLeft','padding','paddingTop','paddingRight','paddingBottom','paddingLeft','borderWidth','flex','flexBasis','flexGrow','flexShrink','alignSelf','gridArea','gridTemplateColumns','gridTemplateRows','gap','rowGap','columnGap','overflow','overflowX','overflowY','transform','transformOrigin','contain','float','clear'];
 const makePlaceholder=(node,copy,style)=>{
  copy.replaceChildren();
  for(const attr of [...copy.attributes])if(attr.name!=='class')copy.removeAttribute(attr.name);
  copy.style.cssText='';for(const key of geometry)if(style[key]&&style[key]!=='none')copy.style[key]=style[key];
  copy.style.setProperty('visibility','hidden','important');
 };
 const stripUnpaintedAttributes=(copy)=>{
  for(const attr of [...copy.attributes])if(attr.name!=='class'&&attr.name!=='style')copy.removeAttribute(attr.name);
  // An offscreen style may contain resource URLs, generated text, or private
  // custom properties. Keep only computed properties that affect its layout.
  const style=copy.style,safe={};for(const key of [...geometry,'visibility','opacity','filter','mixBlendMode'])safe[key]=style[key];
  copy.style.cssText='';for(const key of [...geometry,'visibility','opacity','filter','mixBlendMode'])if(safe[key]&&safe[key]!=='none')copy.style[key]=safe[key];
 };
 const classifyText=(source,clip)=>{
  const value=source.textContent,range=source.ownerDocument.createRange();range.selectNodeContents(source);
  const rects=[...range.getClientRects()];if(!rects.length)return null;
  const inside=rect=>intersects(rect,clip)&&rect.left>=clip.left&&rect.right<=clip.right&&rect.top>=clip.top&&rect.bottom<=clip.bottom;
  if(rects.every(inside))return {value,range,rects,segments:[{start:0,end:value.length,visible:true}]};
  const offsets=[0];for(let i=0;i<value.length;){i+=String.fromCodePoint(value.codePointAt(i)).length;offsets.push(i);}
  const segments=[];let segmentVisible=null;
  const add=(start,end,visible)=>{if(start===end)return;if(segmentVisible===visible&&segments.length&&segments.at(-1).end===start)segments.at(-1).end=end;else segments.push({start,end,visible});segmentVisible=visible;};
  const visit=(first,last)=>{
   const start=offsets[first],end=offsets[last];range.setStart(source,start);range.setEnd(source,end);const boxes=[...range.getClientRects()];
   if(!boxes.length){add(start,end,false);return;}
   if(boxes.every(inside)){add(start,end,true);return;}
   if(!boxes.some(rect=>intersects(rect,clip))){add(start,end,false);return;}
   if(last-first===1){add(start,end,true);return;}
   const middle=(first+last)>>1;visit(first,middle);visit(middle,last);
  };
  const last=offsets.length-1;for(let first=0;first<last;first+=32)visit(first,Math.min(first+32,last));return {value,range,rects,segments};
 };
 const textClip=(source,copy,clip)=>{
  if(!source.textContent.trim()||!copy)return;
  const classified=classifyText(source,clip);if(!classified){copy.remove();return;}
  const {value,range,rects,segments}=classified;
  if(segments.length===1&&segments[0].visible)return;
  const inside=rect=>intersects(rect,clip)&&rect.left>=clip.left&&rect.right<=clip.right&&rect.top>=clip.top&&rect.bottom<=clip.bottom;
  const placeholder=width=>{
   const node=source.ownerDocument.createElement('span');node.setAttribute('aria-hidden','true');
   node.style.cssText=`display:inline-block!important;width:${width}px!important;height:0!important;vertical-align:baseline!important;font-size:0!important;line-height:0!important;background:none!important;border:0!important;box-shadow:none!important;`;
   return node;
  };
  const preserveLineGeometry=()=>{
   const fragment=source.ownerDocument.createDocumentFragment();
   rects.forEach((rect,index)=>{fragment.append(placeholder(rect.width/scaleX));if(index<rects.length-1)fragment.append(source.ownerDocument.createElement('br'));});
   copy.replaceWith(fragment);
  };
  if(!rects.some(rect=>intersects(rect,clip))){preserveLineGeometry();return;}
  if(!segments.some(segment=>segment.visible)){preserveLineGeometry();return;}
  const fragment=source.ownerDocument.createDocumentFragment();let redacted=[];
  const flush=()=>{
   if(!redacted.length)return;
   range.setStart(source,redacted[0].start);range.setEnd(source,redacted.at(-1).end);
   const boxes=[...range.getClientRects()];boxes.forEach((rect,index)=>{fragment.append(placeholder(rect.width/scaleX));if(index<boxes.length-1)fragment.append(source.ownerDocument.createElement('br'));});redacted=[];
  };
  for(const segment of segments){
   if(segment.visible){flush();fragment.append(source.ownerDocument.createTextNode(value.slice(segment.start,segment.end)));}
   else redacted.push(segment);
  }
  flush();copy.replaceWith(fragment);
 };
 const controlTextOverlay=(control,copy,clip)=>{
  const value=control.value;if(!value)return;
  const style=getComputedStyle(control),rect=control.getBoundingClientRect(),controlScaleX=control.offsetWidth?rect.width/control.offsetWidth:scaleX,controlScaleY=control.offsetHeight?rect.height/control.offsetHeight:scaleY;
  const paddingX=parseFloat(style.paddingLeft)||0,paddingRight=parseFloat(style.paddingRight)||0,paddingY=parseFloat(style.paddingTop)||0,paddingBottom=parseFloat(style.paddingBottom)||0;
  const width=Math.max(1,control.clientWidth-paddingX-paddingRight),height=Math.max(1,control.clientHeight-paddingY-paddingBottom);
  const left=rect.left+(control.clientLeft+paddingX)*controlScaleX,top=rect.top+(control.clientTop+paddingY)*controlScaleY;
  const visibleClip={left:Math.max(clip.left,left),right:Math.min(clip.right,left+width*controlScaleX),top:Math.max(clip.top,top),bottom:Math.min(clip.bottom,top+height*controlScaleY)};
  const probe=document.createElement('div'),rendered=control instanceof HTMLInputElement&&control.type==='password'?'*'.repeat(value.length):value;
  probe.setAttribute('aria-hidden','true');probe.style.cssText=`position:fixed!important;left:${left}px!important;top:${top}px!important;width:${width}px!important;height:${height}px!important;overflow:hidden!important;visibility:hidden!important;pointer-events:none!important;contain:strict!important;transform:scale(${controlScaleX},${controlScaleY})!important;transform-origin:top left!important;margin:0!important;border:0!important;padding:0!important;box-sizing:content-box!important;font:${style.font}!important;letter-spacing:${style.letterSpacing}!important;word-spacing:${style.wordSpacing}!important;font-kerning:${style.fontKerning}!important;font-feature-settings:${style.fontFeatureSettings}!important;font-variation-settings:${style.fontVariationSettings}!important;font-variant:${style.fontVariant}!important;text-transform:${style.textTransform}!important;text-indent:${style.textIndent}!important;direction:${style.direction}!important;text-align:${style.textAlign}!important;tab-size:${style.tabSize}!important;line-height:${style.lineHeight}!important;`;
  if(control instanceof HTMLTextAreaElement){probe.style.whiteSpace=control.wrap==='off'?'pre':'pre-wrap';probe.style.overflowWrap=control.wrap==='off'?'normal':'break-word';probe.style.wordBreak=style.wordBreak;}
  else{probe.style.whiteSpace='pre';probe.style.display='flex';probe.style.alignItems='center';probe.style.overflowWrap='normal';}
  const text=document.createTextNode(rendered);probe.append(text);document.body.append(probe);probe.scrollLeft=control.scrollLeft;probe.scrollTop=control.scrollTop;
  const classified=classifyText(text,visibleClip),fragments=[];
  if(classified){
   const offsets=[];for(let i=0;i<rendered.length;){const end=i+String.fromCodePoint(rendered.codePointAt(i)).length;offsets.push([i,end]);i=end;}
   let group=null;
   const flush=()=>{if(group){fragments.push(group);group=null;}};
   for(const segment of classified.segments){
    if(!segment.visible){flush();continue;}
    for(const [start,end] of offsets){if(end<=segment.start||start>=segment.end)continue;const part=rendered.slice(start,end);if(part==='\n'||part==='\r'){flush();continue;}
     classified.range.setStart(text,start);classified.range.setEnd(text,end);const glyph=classified.range.getBoundingClientRect();
     if(!intersects(glyph,visibleClip)){flush();continue;}
     if(group&&Math.abs(group.top-glyph.top)<1){group.text+=part;group.end=end;}
     else{flush();group={text:part,left:glyph.left,top:glyph.top,start,end};}
    }
    flush();
   }
   flush();
  }
  probe.remove();
  copy.style.setProperty('color','transparent','important');copy.style.setProperty('-webkit-text-fill-color','transparent','important');copy.style.setProperty('caret-color','transparent','important');copy.style.setProperty('text-shadow','none','important');copy.removeAttribute('placeholder');
  if(!fragments.length)return;
  let containing=null;const fixed=getComputedStyle(control).position==='fixed';
  for(let ancestor=control.parentElement;ancestor&&ancestor!==bank.parentElement;ancestor=ancestor.parentElement){const s=getComputedStyle(ancestor);if(s.position!=='static'||s.transform!=='none'||s.perspective!=='none'||s.filter!=='none'||s.contain!=='none'){containing=ancestor;break;}}
  const containerRect=containing?.getBoundingClientRect(),containerScaleX=containing?.offsetWidth&&containerRect?.width?containerRect.width/containing.offsetWidth:scaleX,containerScaleY=containing?.offsetHeight&&containerRect?.height?containerRect.height/containing.offsetHeight:scaleX;
  const position=fixed?'fixed':'absolute',origin=containing?containerRect:null,scrollX=containing?containing.scrollLeft*containerScaleX:0,scrollY=containing?containing.scrollTop*containerScaleY:0,borderX=containing?containing.clientLeft*containerScaleX:0,borderY=containing?containing.clientTop*containerScaleY:0;
  const overlay=control.ownerDocument.createElement('span');overlay.className='duo-mirror-control-overlay';overlay.setAttribute('aria-hidden','true');
  const x=origin?(left-origin.left-borderX+scrollX)/containerScaleX:left,y=origin?(top-origin.top-borderY+scrollY)/containerScaleY:top;
  overlay.style.cssText=`position:${position}!important;left:${x}px!important;top:${y}px!important;display:block!important;width:${width}px!important;height:${height}px!important;box-sizing:content-box!important;margin:0!important;padding:0!important;border:0!important;overflow:hidden!important;pointer-events:none!important;user-select:none!important;background:transparent!important;`;
  for(const fragment of fragments){
   const text=control.ownerDocument.createElement('span');text.className='duo-mirror-control-text';text.textContent=fragment.text;
   const textLeft=(fragment.left-left)/controlScaleX,textTop=(fragment.top-top)/controlScaleY;
   text.style.cssText=`position:absolute!important;left:${textLeft}px!important;top:${textTop}px!important;display:block!important;margin:0!important;padding:0!important;border:0!important;white-space:pre!important;overflow:visible!important;pointer-events:none!important;user-select:none!important;color:${style.color}!important;-webkit-text-fill-color:${style.webkitTextFillColor||style.color}!important;text-shadow:${style.textShadow}!important;font:${style.font}!important;font-kerning:${style.fontKerning}!important;font-feature-settings:${style.fontFeatureSettings}!important;font-variation-settings:${style.fontVariationSettings}!important;font-variant:${style.fontVariant}!important;letter-spacing:${style.letterSpacing}!important;word-spacing:${style.wordSpacing}!important;line-height:${style.lineHeight}!important;text-transform:${style.textTransform}!important;direction:${style.direction}!important;`;
   overlay.append(text);
  }
  copy.parentNode.insertBefore(overlay,copy.nextSibling);
 };
 for(let i=0;i<originals.length;i++){
  const node=originals[i],copy=copies[i];
  if(copy!==clone&&!clone.contains(copy))continue;
  const style=styles.get(node),clip=clips.get(node);
  if(style.display==='none'){copy.remove();continue;}
  if(!visibleSubtree.get(node)){
   if(style.display==='contents'&&!visibleBox.get(node)){copy.remove();continue;}
   makePlaceholder(node,copy,style);continue;
  }
  if(!visibleBox.get(node))stripUnpaintedAttributes(copy);
  for(let n=node.childNodes.length-1;n>=0;n--)if(node.childNodes[n].nodeType===Node.TEXT_NODE){
   const child=node.childNodes[n],childCopy=copy.childNodes[n];
   if(style.visibility==='hidden'||style.visibility==='collapse'){childCopy?.remove();continue;}
   if(displayedOptions.has(node))continue;
   textClip(child,childCopy,clip);
  }
  if((node.scrollTop||node.scrollLeft)&&!(node instanceof HTMLInputElement)&&!(node instanceof HTMLTextAreaElement))copy.dataset.mirrorScroll=JSON.stringify([node.scrollLeft,node.scrollTop]);
  if(node instanceof HTMLInputElement){const live=visibleBox.get(node),textType=/^(text|search|email|url|tel|password|number|button|submit|reset)$/.test(node.type);copy.toggleAttribute('checked',live&&node.checked);if(textType){copy.removeAttribute('value');copy.value='';if(live)controlTextOverlay(node,copy,clip);}else{copy.removeAttribute('value');copy.value='';}}
  if(node instanceof HTMLTextAreaElement){copy.textContent='';copy.removeAttribute('value');if(visibleBox.get(node))controlTextOverlay(node,copy,clip);}
  if(node instanceof HTMLSelectElement){
   const live=visibleBox.get(node);
   for(let n=0;n<node.options.length;n++){
    const option=node.options[n],optionCopy=copyOf.get(option);if(!optionCopy)continue;
    if(!live||(!node.multiple&&node.size<2&&!option.selected)||(!visibleBox.get(option)&&!option.selected)){optionCopy.remove();continue;}
    if(!option.selected&&!visibleBox.get(option)){optionCopy.removeAttribute('value');optionCopy.textContent='';}
    optionCopy.toggleAttribute('selected',option.selected);
   }
  }
  if(!visibleBox.get(node))for(const attr of ['src','srcset','poster','href','xlink:href','value','checked','selected','title','alt','placeholder','aria-label','aria-description','formaction','action'])copy.removeAttribute(attr);
  if(node instanceof HTMLCanvasElement||node instanceof HTMLVideoElement){try{
   const canvas=document.createElement('canvas'),width=node.videoWidth||node.width,height=node.videoHeight||node.height;
   if(width&&height){canvas.width=Math.min(384,width);canvas.height=Math.max(1,Math.round(height*canvas.width/width));canvas.getContext('2d').drawImage(node,0,0,canvas.width,canvas.height);
    const image=document.createElement('img');for(const a of copy.attributes)image.setAttribute(a.name,a.value);image.src=canvas.toDataURL('image/jpeg',.55);copy.replaceWith(image);}
  }catch{/* A restricted media surface retains its poster. */}}
 }
 return {html:clone.outerHTML,attributes:Object.fromEntries([...root.attributes].filter(a=>a.name==='class'||a.name==='style'||a.name.startsWith('data-')).map(a=>[a.name,a.value])),width:bank.clientWidth,height:bank.clientHeight,viewport:[innerWidth,innerHeight],expanded};
}
export async function encodeDisplay(snapshot){
 const bytes=new TextEncoder().encode(JSON.stringify(snapshot));if(bytes.length>1000000)throw Error('Display exceeds mirror limit');
 const compressed=new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
 let binary='';for(let i=0;i<compressed.length;i+=8192)binary+=String.fromCharCode(...compressed.subarray(i,i+8192));return 'duo2:'+btoa(binary);
}
export function captureIdentityKey(serverKey,playerData={}){
 const p=playerData&&typeof playerData==='object'?playerData:{};
 return [serverKey||'',p.Cid||'',p.DeviceId||'',p.DeviceGeneration??'',p.SimId||'',p.PhoneNumber||''].map(value=>String(value)).join(':');
}
export function createCaptureLifecycle(){
 let generation=0,blocked=true;
 return {generation:()=>generation,blocked:()=>blocked,open(){generation++;blocked=false;},invalidate(){generation++;blocked=true;},poseChanged(){generation++;},close(){generation++;blocked=true;}};
}
export function createScreenCapture({bank,isVisible,isExpanded,send,encode=encodeDisplay,getGeneration=()=>0,getDeviceGeneration=()=>null,isTurning=()=>false,schedule=(fn,ms)=>setTimeout(fn,ms),cancel=id=>clearTimeout(id)}){
 const root=bank.closest('.duo-root');let stopped=false,timer,busy=false,last='',lastAt=0,dirty=true,cached=null;
 const observer=new MutationObserver(records=>{if(records.some(record=>record.type!=='attributes'||record.oldValue!==record.target.getAttribute(record.attributeName)))dirty=true;});observer.observe(root,{subtree:true,childList:true,characterData:true,attributes:true,attributeOldValue:true});
 const mark=()=>{dirty=true;};for(const event of ['scroll','input','change','load'])root.addEventListener(event,mark,true);
 window.addEventListener('resize',mark);
 document.fonts?.addEventListener('loadingdone',mark);
 const contextKey=()=>JSON.stringify([getGeneration(),getDeviceGeneration(),isExpanded(),isExpanded()&&root.dataset.orientation==='portrait'?'portrait':'landscape',innerWidth,innerHeight]);
 const hasVisibleMedia=()=>{
  const clip=bank.getBoundingClientRect();
  return [...bank.querySelectorAll('video,canvas')].some(node=>{const rect=node.getBoundingClientRect();if(!rect.width||!rect.height||rect.right<=clip.left||rect.left>=clip.right||rect.bottom<=clip.top||rect.top>=clip.bottom)return false;const style=getComputedStyle(node);return style.display!=='none'&&style.visibility!=='hidden'&&style.visibility!=='collapse';});
 };
 const tick=async()=>{
  if(stopped)return;
  const visible=isVisible(),ready=visible&&!isTurning()&&!root.classList.contains('duo-orientation-turning')&&!busy;
  const animated=ready&&bank.getAnimations?.({subtree:true}).some(animation=>animation.playState==='running');
  const media=ready&&hasVisibleMedia();
  if(ready&&(dirty||cached?.context!==contextKey()||media||animated||performance.now()-lastAt>1000)){
   const captureDirty=dirty;busy=true;dirty=false;
   try{const generation=getGeneration(),deviceGeneration=getDeviceGeneration(),expanded=isExpanded(),orientation=expanded&&root.dataset.orientation==='portrait'?'portrait':'landscape';
    const context=contextKey(),contextChanged=cached?.context!==context;
    // An unchanged display still needs its recovery heartbeat, but not another
    // synchronous DOM walk and gzip. Animated/media surfaces always stay live.
    const refresh=contextChanged||!cached?.reusable||captureDirty||media||animated;
    const frame=refresh?await encode(displaySnapshot(bank,root,expanded)):cached.frame;
    if(!stopped&&isVisible()&&!isTurning()&&!root.classList.contains('duo-orientation-turning')&&context===contextKey()&&generation===getGeneration()&&deviceGeneration===getDeviceGeneration()&&expanded===isExpanded()&&orientation===(expanded&&root.dataset.orientation==='portrait'?'portrait':'landscape')&&frame.length<=65536&&(contextChanged||frame!==last||performance.now()-lastAt>1000)){
     const result=await send({Frame:frame,LocalFrame:frame,Expanded:expanded,Orientation:orientation,DeviceGeneration:deviceGeneration});if(result?.Success){last=frame;lastAt=performance.now();cached={context,frame,reusable:!animated&&!media};}else dirty=true;
    }
   }catch(error){dirty=true;console.warn('[Peak Duo] Live display:',error.message);}finally{busy=false;}
  }else if(!visible){last='';cached=null;dirty=true;}
  if(!stopped)timer=schedule(tick,100);
 };
 timer=schedule(tick,100);
 return {destroy(){stopped=true;cached=null;cancel(timer);observer.disconnect();for(const event of ['scroll','input','change','load'])root.removeEventListener(event,mark,true);window.removeEventListener('resize',mark);document.fonts?.removeEventListener('loadingdone',mark);}};
}
