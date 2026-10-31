// Server-authored presentation metadata. This module accepts only bounded text,
// stable IDs, bundled icon keys, and GTA world coordinates; it never hosts HTML.
const APP_IDS=new Set([
 'calls','messages','services','crypto','mails','contacts','gallery','camera','peakify','documents','settings','maps',
 'calendar','clock','weather','voicememos','homeedit','details','store','housing','y','kilogram','binge','wenmo',
 'vehicles','jobcenter','jobcreator','busdriver','lumberjack','bin','calculator','yellowpages','racing','time-trials',
 'cars','facetime','guber','bankbusters',
]);
const STORE_IDS=new Set(['kilogram','binge','y','wenmo','vehicles','services','crypto','jobcenter','busdriver','lumberjack','peakify','bin','calculator','yellowpages']);
const NETWORK_IDS=new Set(['bennys','pdm','lostmc','losmuertos','darkwolves','flightschool','deathsinners']);
const ICON_NAMES=new Set([
 'phone','message-circle','shield','wallet','mail','users','flower','camera','music','notebook','settings','navigation',
 'timer','weather','id-card','app-store','home','at-sign','heart','car','briefcase','bus','tree','globe','calculator',
 'megaphone','flag','video','landmark','building','newspaper','map','radio','headphones','scale','chart','receipt',
]);
const DEFAULT_SECTIONS={
 emergency:{title:'Emergency',description:'emergency workers'},
 tow:{title:'Tow',description:'tow operators'},
};
const DEFAULT_JOB_LABELS={
 police:'Police officer',ambulance:'Paramedic',bcso:'Deputy sheriff',sasp:'State trooper',ranger:'Park ranger',
 fire:'Firefighter',tow:'Tow operator',mechanic:'Mechanic',impound:'Tow operator',
};
const cleanText=(value,max,fallback='')=>typeof value==='string'&&value.trim().length>0&&value.trim().length<=max&&!/[\u0000-\u001f\u007f<>]/.test(value)?value.trim():fallback;
const safeId=value=>typeof value==='string'&&value.length<=48&&/^[a-z][a-z0-9_-]*$/.test(value)?value:null;
const object=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
function textMap(value,allowed,max){
 const out={};for(const [key,item] of Object.entries(object(value))){if((!allowed||allowed.has(key))&&safeId(key)){
  const text=cleanText(item,max);if(text)out[key]=text;
 }}return out;
}
function idList(value,allowed,max){
 const out=[];const seen=new Set();for(const id of Array.isArray(value)?value:[]){if(allowed.has(id)&&!seen.has(id)){out.push(id);seen.add(id);if(out.length>=max)break;}}return out;
}
function placeList(value){
 const out=[],seen=new Set();for(const item of Array.isArray(value)?value.slice(0,100):[]){
  if(!item||typeof item!=='object')continue;
  const id=safeId(item.id),name=cleanText(item.name,80),x=Number(item.x),y=Number(item.y),z=Number(item.z);
  if(!id||seen.has(id)||!name||!Number.isFinite(x)||!Number.isFinite(y)||x< -12000||x>12000||y< -12000||y>12000)continue;
  const place={id,name,x,y},area=cleanText(item.area,60),category=cleanText(item.category,40);
  if(area)place.area=area;if(category)place.category=category;
  if(Number.isFinite(z)&&z>=-2000&&z<=4000)place.z=z;
  out.push(place);seen.add(id);
 }return out;
}
function normalize(value){
 const input=object(value),apps=object(input.apps),defaults=object(apps.defaults),services=object(input.services),news=object(input.news),store=object(input.store);
 const labels=textMap(apps.labels,APP_IDS,48),icons={};
 for(const [id,key] of Object.entries(textMap(apps.icons,APP_IDS,48)))if(ICON_NAMES.has(key))icons[id]=key;
 const order=idList(defaults.order,APP_IDS,APP_IDS.size),dock=idList(defaults.dock,APP_IDS,4);
 for(const id of APP_IDS)if(!order.includes(id))order.push(id);
 const sections={};for(const [id,base] of Object.entries(DEFAULT_SECTIONS)){
  const section=object(object(services.sections)[id]);
  sections[id]={title:cleanText(section.title,60,base.title),description:cleanText(section.description,80,base.description)};
 }
 const jobLabels={...DEFAULT_JOB_LABELS,...textMap(services.jobLabels,null,60)};
 const storeApps={};for(const [id,entry] of Object.entries(object(store.apps))){
  if(!STORE_IDS.has(id))continue;const item=object(entry),description=cleanText(item.description,280),category=cleanText(item.category,40);
  const accepted={};if(description)accepted.description=description;if(category)accepted.category=category;if(Object.keys(accepted).length)storeApps[id]=accepted;
 }
 const featured=STORE_IDS.has(store.featuredApp)?store.featuredApp:'peakify';
 const networkLabels=textMap(input.networks?.labels,NETWORK_IDS,80);
 const newsNetworkLabels={weazelnews:'Weazel News',bin:'International News',...textMap(news.networkLabels,new Set(['weazelnews','bin']),80)};
 return {
  apps:{labels,icons,defaults:{order,dock}},
  maps:{places:placeList(input.maps?.places)},
  networks:{labels:networkLabels},
  services:{
   title:cleanText(services.title,60,'Services'),subtitle:cleanText(services.subtitle,80,'On-duty directory'),sections,jobLabels,
  },
  news:{title:cleanText(news.title,80,'Binsbergen'),tagline:cleanText(news.tagline,120,'The latest, in perspective.'),networkLabels:newsNetworkLabels},
  store:{
   title:cleanText(store.title,60,'App Store'),kicker:cleanText(store.kicker,60,'MADE FOR YOUR CITY'),
   featuredApp:featured,featuredTitle:cleanText(store.featuredTitle,60,'Peak Music'),
   featuredTagline:cleanText(store.featuredTagline,140,'All your favorites. One beautiful library.'),apps:storeApps,
  },
 };
}
let current=normalize({});
export function setOwnerConfig(value){current=normalize(value);return current;}
export function getOwnerConfig(){return current;}
export {APP_IDS as ownerAppIds,ICON_NAMES as ownerIconNames};
