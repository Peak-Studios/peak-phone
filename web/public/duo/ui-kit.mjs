/** Shared DOM primitives: player-supplied text never becomes HTML. */
import { icon } from './icons.mjs?rev=owner-config-20261015';
export function el(tag,cls='',text=''){const node=document.createElement(tag);node.className=cls;if(text!==''&&text!=null)node.textContent=String(text);return node;}
export function action(label,glyph,fn,cls=''){
 const node=el('button',cls);node.type='button';node.title=label;node.setAttribute('aria-label',label);
 if(glyph)node.innerHTML=icon(glyph);else node.textContent=label;
 if(fn)node.addEventListener('click',fn);return node;
}
export function labelledAction(label,glyph,fn,cls=''){const b=action(label,glyph,fn,cls);b.append(el('span','',label));return b;}
export function safeAudioURL(value){try{const u=new URL(String(value).trim());if(u.protocol!=='https:'||u.username||u.password)return null;return u.href;}catch{return null;}}
export function resultOK(value){return value===true||value==='Ok'||value==='ok'||(value&&typeof value==='object'&&value.Success===true);}
export function hash(value){let n=2166136261;for(const c of String(value))n=Math.imul(n^c.charCodeAt(0),16777619);return n>>>0;}
export function artwork(seed,label='',large=false){
 const node=el('div','pm-art'+(large?' pm-art-large':''));node.dataset.palette=String(hash(seed)%6);node.setAttribute('aria-hidden','true');
 node.innerHTML='<span class="pm-art-orbit"></span><span class="pm-art-orbit two"></span>'+icon('music');
 if(label)node.append(el('span','pm-art-label',label));return node;
}
export function emptyState(glyph,title,body){const n=el('div','ios-empty-state');n.innerHTML=icon(glyph);n.append(el('h3','',title),el('p','',body));return n;}
