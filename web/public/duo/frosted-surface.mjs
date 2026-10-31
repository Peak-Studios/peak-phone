// Blur a script-free, aligned replica of the live content under a local surface.
// No global backdrop filtering: transparent FiveM NUI must not sample the game.
export function createFrostedSurface({bar,source}){
 const clip=document.createElement('div');clip.className='duo-surface-blur';clip.setAttribute('aria-hidden','true');clip.inert=true;bar.prepend(clip);
 let frame=0,dead=false,mountRetries=0;
 const update=()=>{
  frame=0;if(dead)return;
  if(!bar.isConnected||!source.isConnected){if(mountRetries++<120)mark();return;}
  const a=source.getBoundingClientRect(),b=bar.getBoundingClientRect(),scale=source.offsetWidth?a.width/source.offsetWidth:1;
  if(!a.width||!b.width)return;
  const replica=source.cloneNode(true),originals=[source,...source.querySelectorAll('*')],copies=[replica,...replica.querySelectorAll('*')];
  for(let i=0;i<copies.length;i++){
   const copy=copies[i],original=originals[i];copy.removeAttribute('id');copy.removeAttribute('name');copy.removeAttribute('autofocus');
   if(original===bar||copy.classList.contains('duo-surface-blur')){copy.style.visibility='hidden';copy.style.setProperty('height',original.offsetHeight+'px','important');copy.replaceChildren();}
  }
  replica.querySelectorAll('script,iframe,object,embed,.duo-surface-blur').forEach(n=>n.remove());
  replica.classList.add('duo-surface-replica');replica.setAttribute('aria-hidden','true');replica.inert=true;
  Object.assign(replica.style,{position:'absolute',left:((a.left-b.left)/(scale||1)-bar.clientLeft)+'px',top:((a.top-b.top)/(scale||1)-bar.clientTop)+'px',width:source.offsetWidth+'px',height:source.offsetHeight+'px',margin:'0',maxWidth:'none',pointerEvents:'none'});
  for(const key of ['position','left','top','width','height','margin','max-width'])replica.style.setProperty(key,replica.style.getPropertyValue(key),'important');
  clip.replaceChildren(replica);
  for(let i=0;i<copies.length;i++){if(!replica.contains(copies[i])&&copies[i]!==replica)continue;copies[i].scrollTop=originals[i].scrollTop;copies[i].scrollLeft=originals[i].scrollLeft;}
 };
 const mark=()=>{if(!dead&&!frame)frame=requestAnimationFrame(update);};
 const insideReplica=node=>(node.nodeType===1?node:node.parentElement)?.closest('.duo-surface-blur');
 const observer=new MutationObserver(records=>{if(records.some(r=>!insideReplica(r.target)))mark();});observer.observe(source,{subtree:true,childList:true,characterData:true,attributes:true});
 const resize=new ResizeObserver(mark);resize.observe(bar);resize.observe(source);
 const visibility=new IntersectionObserver(mark);visibility.observe(bar);
 const onScroll=event=>{if(!insideReplica(event.target))mark();};
 source.addEventListener('scroll',onScroll,true);window.addEventListener('resize',mark);window.addEventListener('duo:appearance',mark);mark();
 return {refresh:mark,destroy(){dead=true;if(frame)cancelAnimationFrame(frame);observer.disconnect();resize.disconnect();visibility.disconnect();source.removeEventListener('scroll',onScroll,true);window.removeEventListener('resize',mark);window.removeEventListener('duo:appearance',mark);clip.remove();}};
}
