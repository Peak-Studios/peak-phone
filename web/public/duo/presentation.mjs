import {createFrostedSurface} from './frosted-surface.mjs';
/** Presentation-only enhancement for the retained app library. Does not reparent bound nodes,
 * replace form fields, intercept actions or invent backend data. */
import { byId } from './catalog.mjs?rev=owner-config-20261015';
import { el } from './ui-kit.mjs?rev=owner-config-20261015';
import { getOwnerConfig } from './owner-config.mjs?rev=owner-config-20261015';
const headings={housing:['Housing','A place to call home.'],news:['Weazel News','Stories from your city.'],bin:['Binsbergen','The latest, in perspective.'],doj:['Justice','People and public services.'],racing:['Racing','Every second counts.'],'time-trials':['Time Trials','Find your next personal best.'],cars:['Showroom','Find your next drive.'],bankbusters:['BankBusters','Your crew. Your next chapter.'],tierup:['TierUp','Keep your crew connected.']};
export function decorateApp(node,id){
 node.classList.add('ios-app');node.style.setProperty('--app-accent',byId[id]?.color||'#6aa9ff');
 let frame=0,disposed=false,documentBlur=null;const labelled=new WeakSet();
 function enhance(){
  frame=0;if(disposed)return;
  if(id==='documents'){const bar=node.querySelector('.notes-filters'),source=bar?.closest('.glass-scroll');if(documentBlur?.bar!==bar){documentBlur?.effect.destroy();documentBlur=bar&&source?{bar,effect:createFrostedSurface({bar,source})}:null;}}
  // Missing legacy headings are additions in their own reserved area, not replacements.
  if(headings[id]&&!node.classList.contains('duo-app-unavailable')){
   const wrapper=node.querySelector('.phone-app-wrapper > .glass-container')||node.querySelector('.phone-app-wrapper');if(wrapper&&!wrapper.querySelector(':scope > .ios-added-heading')){
   wrapper.classList.add('ios-has-heading');const h=el('header','ios-added-heading');const ownerNews=getOwnerConfig().news;const title=id==='bin'?ownerNews.title:headings[id][0],subtitle=id==='bin'?ownerNews.tagline:headings[id][1];h.append(el('h1','',title),el('p','',subtitle));wrapper.prepend(h);
   }
  }
  // Meaningful names for existing icon-only controls, with zero event changes.
  for(const button of node.querySelectorAll('button:not([aria-label]),[role=button]:not([aria-label])')){
   if(labelled.has(button)||button.textContent.trim())continue;labelled.add(button);
   const title=button.getAttribute('title');const icon=button.querySelector('[class*=fa-]');
   const cls=icon?.className||'';
   const name=title||(/plus/.test(cls)?'Add':/search/.test(cls)?'Search':/chevron-left|arrow-left/.test(cls)?'Back':/trash/.test(cls)?'Delete':/sync|refresh|redo/.test(cls)?'Refresh':/ellipsis/.test(cls)?'More options':/times|xmark/.test(cls)?'Close':/paper-plane/.test(cls)?'Send':/camera/.test(cls)?'Camera':'');
   if(name)button.setAttribute('aria-label',name);
  }
 }
 const observer=new MutationObserver(records=>{if(records.every(r=>r.target.closest?.('.duo-surface-blur')))return;if(!frame&&!disposed)frame=requestAnimationFrame(enhance);});observer.observe(node,{childList:true,subtree:true});enhance();
 return ()=>{disposed=true;documentBlur?.effect.destroy();observer.disconnect();if(frame)cancelAnimationFrame(frame);};
}
