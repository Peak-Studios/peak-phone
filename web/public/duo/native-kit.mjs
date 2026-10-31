/** Small dependency-free app toolkit. Native app views share the existing NUI transport.
 * Never interpret player text as HTML, never promote an acknowledgement to a game result.
 */
import {el, action, labelledAction, resultOK, hash} from './ui-kit.mjs?rev=owner-config-20261015';
import {icon} from './icons.mjs?rev=owner-config-20261015';
import {copyText} from './clipboard.mjs';
export {el, icon, resultOK};
export function value(store){let v;const off=store?.subscribe(x=>v=x);off?.();return v;}
export function isRows(data){return Array.isArray(data)||!!(data&&typeof data==='object'&&Object.keys(data).length===0);}
export function rows(data){return Array.isArray(data)?data:[];}
export function safeImage(raw){
 if(typeof raw!=='string'||!raw.trim()||raw.includes('default_profile.png'))return '';
 try {if(/^\.\/(?:images|duo)\/[\w./-]+$/.test(raw)&&!raw.includes('..'))return raw;
  if(!/^https:\/\//i.test(raw))return '';const url=new URL(raw);if(url.protocol==='https:'&&!url.username&&!url.password)return url.href;
 }catch{}return '';
}
export function avatar(name,url='',size=''){const a=el('span','nx-avatar '+size);a.dataset.palette=String(hash(name)%6);a.setAttribute('aria-hidden','true');a.append(el('span','',String(name||'?').replace(/^@/,'').split(/[ _]+/).map(n=>n[0]).slice(0,2).join('').toUpperCase()));const safe=safeImage(url);if(safe){const img=new Image();img.src=safe;img.alt='';img.loading='lazy';img.referrerPolicy='no-referrer';img.addEventListener('error',()=>img.remove(),{once:true});a.append(img);}return a;}
export function normalizePhone(input){return String(input??'').replace(/[^0-9+*#]/g,'').slice(0,24);}
export function relativeTime(stamp,now=Date.now()) {let t=Number(stamp);if(!Number.isFinite(t)||t<=0)return '';if(t<1e12)t*=1000;const seconds=Math.max(0,(now-t)/1000);if(seconds<60)return 'now';if(seconds<3600)return Math.floor(seconds/60)+'m';if(seconds<86400)return Math.floor(seconds/3600)+'h';if(seconds<604800)return Math.floor(seconds/86400)+'d';return new Date(t).toLocaleDateString(undefined,{month:'short',day:'numeric'});}
export function dateTime(stamp){let t=Number(stamp);if(!Number.isFinite(t)||t<=0)return 'Time unavailable';if(t<1e12)t*=1000;return new Date(t).toLocaleString();}
export function errorMessage(result,fallback='The server could not complete this action.'){return (result&&typeof result==='object'&&(result.Message||result.Msg||result.Error||result.error))||fallback;}
export function byteLength(text){return new TextEncoder().encode(String(text)).length;}
export function collectionKey(context,key){return 'peak-duo:upgrade:'+JSON.stringify([context?.server||'unknown',context?.identity||'unknown',key]);}
export function readLocal(context,key,fallback){try{return JSON.parse(localStorage.getItem(collectionKey(context,key)))??fallback;}catch{return fallback;}}
export function writeLocal(context,key,data){try{localStorage.setItem(collectionKey(context,key),JSON.stringify(data));return true;}catch{return false;}}
export function field(label,{tag='input',value='',placeholder='',type='text',maxLength}={}){const wrapper=el('label','nx-field');wrapper.append(el('span','',label));const input=el(tag);input.setAttribute('aria-label',label);if(tag==='input')input.type=type;input.value=value;input.placeholder=placeholder;if(maxLength)input.maxLength=maxLength;wrapper.append(input);return {wrapper,input};}
export class NativeView {
 constructor({target,props={}}){Object.assign(this,props);this.target=target;this.alive=true;this.abort=new AbortController();this.off=[];this.version=0;this.notify=props.notify||(()=>{});this.element=el('section','nx-app');target.append(this.element);this.element.setAttribute('aria-label',props.name||'Application');}
 button(label,glyph,fn,cls=''){return action(label,glyph,()=>{try{Promise.resolve(fn?.()).catch(e=>{if(this.alive)this.notify(e.message||'Action failed.');});}catch(e){if(this.alive)this.notify(e.message||'Action failed.');}},'nx-button '+cls);}
 textButton(label,glyph,fn,cls=''){const b=this.button(label,glyph,fn,cls);if(glyph)b.append(el('span','',label));return b;}
 listen(target,event,fn,opts={}){target.addEventListener(event,fn,{...opts,signal:this.abort.signal});}
 messages(fn){this.listen(window,'message',e=>{if(e.source&&e.source!==window&&e.source!==window.parent)return;const d=e.data;if(this.alive&&d&&typeof d==='object'&&!d.__duoReplay)fn(d);});}
 async checked(event,data={}){const result=await this.send(event,data);if(!resultOK(result))throw Error(errorMessage(result));return result;}
 header(title,subtitle='',actions=[]){const h=el('header','nx-header');const t=el('div','nx-heading');t.append(el('h1','',title));if(subtitle)t.append(el('p','',subtitle));h.append(t,...actions);return h;}
 search(placeholder,onInput,initial=''){const label=el('label','nx-search');label.innerHTML=icon('search');const input=el('input');input.type='search';input.value=initial;input.placeholder=placeholder;input.setAttribute('aria-label',placeholder);input.autocomplete='off';input.spellcheck=false;this.listen(input,'input',()=>onInput(input.value));label.append(input);return label;}
 empty(title,body,glyph='search',retry){const n=el('div','nx-empty');n.innerHTML=icon(glyph);n.append(el('h2','',title),el('p','',body));if(retry)n.append(this.textButton('Try again','refresh',retry,'nx-primary'));return n;}
 tabs(items,selected,onSelect,cls='nx-tabs'){const nav=el('nav',cls);nav.setAttribute('aria-label','App navigation');for(const [id,label,glyph] of items){const b=this.textButton(label,glyph,()=>onSelect(id));b.dataset.tab=id;b.setAttribute('aria-current',selected===id?'page':'false');b.setAttribute('aria-pressed',String(selected===id));nav.append(b);}return nav;}
 openSheet(title,{onClose,wide=false,header=true}={}){this.closeSheet();const focused=document.activeElement,layer=el('div','nx-modal'),panel=el('section','nx-sheet nx-native-sheet'+(wide?' nx-sheet-wide':''));panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label',title||'Application dialog');const close=()=>this.closeSheet();const grip=el('div','nx-sheet-grip');grip.setAttribute('aria-hidden','true');panel.append(grip);if(header){const heading=el('header','nx-sheet-heading');heading.append(this.button('Cancel',null,close,'nx-sheet-dismiss'),el('h2','',title||''));panel.append(heading);}layer.append(panel);this.element.append(layer);const siblings=[...this.element.children].filter(n=>n!==layer);for(const n of siblings)n.inert=true;this.sheet={layer,panel,focused,siblings,onClose};this.listen(layer,'pointerdown',e=>{if(e.target===layer)close();});this.listen(layer,'keydown',e=>{if(e.key!=='Tab')return;const nodes=[...panel.querySelectorAll('button,input,textarea,select,a[href],[tabindex="0"]')].filter(n=>!n.disabled&&n.getClientRects().length);if(!nodes.length)return;const at=nodes.indexOf(document.activeElement);if(e.shiftKey&&at<=0){e.preventDefault();nodes.at(-1).focus();}else if(!e.shiftKey&&at===nodes.length-1){e.preventDefault();nodes[0].focus();}});queueMicrotask(()=>{if(this.sheet?.panel===panel)panel.querySelector('input,textarea,button')?.focus();});return panel;}
 closeSheet({restoreFocus=true}={}){const s=this.sheet;if(!s)return;this.sheet=null;s.layer.remove();for(const n of s.siblings)n.inert=false;s.onClose?.();if(restoreFocus&&s.focused?.isConnected)s.focused.focus?.({preventScroll:true});}
 handleEscape(){if(this.sheet){this.closeSheet();return true;}return false;}
 async copy(text){const copied=await copyText(text);if(!this.alive)return copied;this.notify(copied?'Copied.':'Could not copy. Try again.');return copied;}
 $destroy(){this.alive=false;this.version++;this.abort.abort();for(const off of this.off)off();this.closeSheet();this.element.remove();}
}
