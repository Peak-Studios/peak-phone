/** Modern App Store. Retains the original install catalog, app IDs and authoritative callbacks. */
import { byId } from './catalog.mjs?rev=owner-config-20261015';
import { appIcon } from './ios-icons.mjs?rev=owner-config-20261015';
import { el, action, emptyState, resultOK } from './ui-kit.mjs?rev=owner-config-20261015';
import { getOwnerConfig } from './owner-config.mjs?rev=owner-config-20261015';
const ids=['kilogram','binge','y','wenmo','vehicles','services','crypto','jobcenter','busdriver','lumberjack','peakify','bin','calculator','yellowpages'];
const descriptions={kilogram:'Your city, in photos, reels and stories.',binge:'Meet characters. Find a connection.',y:'Stay in the conversation.',wenmo:'Send money. Keep track.',vehicles:'Your garage, at a glance.',services:'Call an on-duty worker directly.',crypto:'Manage your character’s in-game virtual currencies.',jobcenter:'Find your next opportunity.',busdriver:'Your route. Your progress.',lumberjack:'Keep your workday in view.',peakify:'Your songs. Your playlists. Your city.',bin:'A different perspective.',calculator:'Everyday numbers, beautifully simple.',yellowpages:'Discover your local community.'};
export const storeCatalog=Object.freeze(ids);
export class StoreApp{
 constructor({target,props:{send,stores,canInstall=()=>true}}){
  this.target=target;this.send=send;this.stores=stores;this.canInstall=canInstall;this.installed={};this.query='';this.filter='discover';this.pending=new Set();this.destroyed=false;
  this.node=el('section','ios-store');this.node.setAttribute('aria-label','App Store');target.append(this.node);
  const config=getOwnerConfig().store;
  this.header=el('header','ios-store-header');const kicker=el('span','ios-kicker',config.kicker);this.header.append(kicker,el('h1','',config.title));
  const search=el('label','ios-store-search');search.append(el('span','sr-only','Search available apps'));this.input=el('input');this.input.type='search';this.input.placeholder='Apps and experiences';this.input.setAttribute('aria-label','Search available apps');search.append(this.input);this.header.append(search);
  this.input.addEventListener('input',()=>{this.query=this.input.value;this.renderList();});
  this.segment=el('div','ios-segmented');for(const [id,label] of [['discover','Discover'],['installed','Installed']]){const b=action(label,null,()=>{this.filter=id;this.render();});b.dataset.filter=id;this.segment.append(b);}this.header.append(this.segment);
  this.content=el('div','ios-store-content');this.list=el('div','ios-store-list');this.live=el('div','ios-store-live');this.live.setAttribute('role','status');this.node.append(this.header,this.content,this.live);
  this.unsub=stores.InstalledApps.subscribe(value=>{this.installed=value||{};this.render();});
 }
 render(){if(this.destroyed)return;for(const b of this.segment.children){b.dataset.active=String(b.dataset.filter===this.filter);b.setAttribute('aria-pressed',String(b.dataset.filter===this.filter));}this.renderList();}
 renderList(){
  this.content.replaceChildren();const q=this.query.trim().toLowerCase();
  const config=getOwnerConfig().store;
  if(this.filter==='discover'&&!q){const app=byId[config.featuredApp]||byId.peakify;const featured=el('button','ios-store-featured');featured.type='button';featured.setAttribute('aria-label','Explore '+app.name);const copy=el('div');copy.append(el('span','ios-kicker','FEATURED'),el('strong','',config.featuredTitle||app.name),el('p','',config.featuredTagline));const art=el('div','ios-store-featured-icon');art.innerHTML=appIcon(app);featured.append(copy,art);featured.addEventListener('click',()=>{this.query=app.name;this.input.value=this.query;this.renderList();});this.content.append(featured);}
  const heading=el('div','ios-store-section');heading.append(el('h2','',q?'Search results':this.filter==='installed'?'On your phone':'Explore the collection'));this.content.append(heading);
  const filtered=ids.map(id=>byId[id]).filter(app=>this.canInstall(app.id)!==false&&(this.filter!=='installed'||this.installed[app.id])&&(!q||(app.name+' '+(config.apps[app.id]?.description||descriptions[app.id])).toLowerCase().includes(q)));
  this.list.replaceChildren();for(const app of filtered){const row=el('article','ios-store-row');row.dataset.appId=app.id;const art=el('div','ios-store-icon');art.innerHTML=appIcon(app);const text=el('div','ios-store-copy');const metadata=config.apps[app.id]||{};if(metadata.category)text.append(el('span','ios-kicker',metadata.category));text.append(el('h3','',app.name),el('p','',metadata.description||descriptions[app.id]));const button=action(this.pending.has(app.id)?'Working…':this.installed[app.id]?'Remove':'Get',null,()=>this.change(app),'ios-store-get');button.disabled=this.pending.has(app.id);button.dataset.installed=String(!!this.installed[app.id]);button.setAttribute('aria-label',(this.installed[app.id]?'Remove ':'Install ')+app.name);row.append(art,text,button);this.list.append(row);}
  if(!filtered.length)this.list.append(emptyState('app-store','No apps found',q?'Try another name.':'Installed apps from this collection will appear here.'));
  this.content.append(this.list,el('p','ios-store-footnote','Some apps need services installed by your server owner. Installing an app does not enable a missing service.'));
 }
 async change(app){
  if(this.pending.has(app.id)||this.destroyed)return;const removing=!!this.installed[app.id];this.pending.add(app.id);this.renderList();
  try{const result=await this.send(removing?'UninstallApp':'InstallApp',{AppId:app.id});if(this.destroyed)return;if(!resultOK(result))throw Error(result?.Message||'The server could not update this app.');
   if(!result?.InstalledApps)throw Error('The server did not confirm the app change.');
   this.stores.InstalledApps.update(value=>{const next={...value};if(result.InstalledApps[app.id])next[app.id]=true;else delete next[app.id];return next;});
   this.live.textContent=app.name+(removing?' removed.':' installed.');
  }catch(e){if(!this.destroyed)this.live.textContent=e.message||'The request failed.';}finally{this.pending.delete(app.id);if(!this.destroyed)this.renderList();}
 }
 $destroy(){this.destroyed=true;this.unsub?.();this.node.remove();}
}
