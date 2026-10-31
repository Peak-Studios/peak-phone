// IDs remain the peak-phone IDs: server app permissions and install state remain authoritative.
export const APPS = [
 ['calls','Phone','phone','#2cc16b',true],['messages','Messages','message-circle','#36c978',true],
 ['services','Services','shield','#e65b68'],['crypto','Crypto','wallet','#835bd1'],
 ['mails','Mail','mail','#368cf4',true],['contacts','Contacts','users','#8c8d97',true],
 ['gallery','Photos','flower','#ea727a',true],['camera','Camera','camera','#777e89',true],
 ['peakify','Peak Music','music','#ff476b'],
 ['documents','Notes','notebook','#e1ae43',true],['settings','Settings','settings','#818896',true],
 ['maps','Maps','navigation','#5aa96d',true],['calendar','Calendar','notebook','#ef5b5b',true],
 ['clock','Clock','timer','#2e3440',true],['weather','Weather','weather','#5e98d4',true],['voicememos','Voice Memos','music','#db5a52',true],
 ['homeedit','Home Screen','layers','#6d78d5',true],
 ['details','My card','id-card','#649ed5',true],['store','App Store','app-store','#328ced',true],
 ['housing','Housing','home','#698979'],
 ['y','Y','at-sign','#202633'],['kilogram','KiloGram','camera','#d34a8e'],['binge','Binge','heart','#aa658c'],['wenmo','Wenmo','wallet','#4497ef'],
 ['vehicles','Vehicles','car','#607de2'],
 ['jobcenter','Job Center','briefcase','#c79b6a',true],['jobcreator','Job Creator','briefcase','#7a78dc',true],['busdriver','Bus Driver','bus','#e6a646'],
 ['lumberjack','Lumberjack','tree','#508e71'],
 ['bin','Binsbergen','globe','#6ba7b1'],['calculator','Calculator','calculator','#eaa449'],
 ['yellowpages','Yellow Pages','megaphone','#d5af49'],
 ['racing','Racing','flag','#d87467'],['time-trials','Time Trials','timer','#619cc4'],
 ['cars','Showroom','car','#72a3a5'],['facetime','FaceTime','video','#54b975'],
 ['guber','Guber','navigation','#52656d'],['bankbusters','BankBusters','landmark','#879e8b'],
].map(([id,name,icon,color,builtin=false])=>({id,name,icon,color,builtin}));
export const byId = Object.fromEntries(APPS.map(app=>[app.id,app]));
export const DOCK = ['calls','messages','mails','contacts'];
export const NETWORKS = {pdm:'Premium Deluxe',bennys:'Bennys',flightschool:'Flight School',lostmc:'The Lost',losmuertos:'Muertos',deathsinners:'Death Sinners',darkwolves:'Dark Wolves'};
const originalApps=new Map(APPS.map(app=>[app.id,{name:app.name,icon:app.icon,color:app.color,builtin:app.builtin}]));
const originalNetworks={...NETWORKS};
export function applyOwnerCatalog(config={}){
 for(const app of APPS){
  const original=originalApps.get(app.id);app.name=original.name;app.icon=original.icon;app.color=original.color;app.ownerIconOverride=false;
  const name=config?.apps?.labels?.[app.id],icon=config?.apps?.icons?.[app.id];
  if(typeof name==='string')app.name=name;
  if(typeof icon==='string'){app.icon=icon;app.ownerIconOverride=true;}
 }
 for(const key of Object.keys(NETWORKS))delete NETWORKS[key];
 Object.assign(NETWORKS,originalNetworks);
 for(const [id,label] of Object.entries(config?.networks?.labels||{}))if(Object.hasOwn(NETWORKS,id)&&typeof label==='string')NETWORKS[id]=label;
}
export function catalogPresentationSignature(){
 return JSON.stringify(APPS.map(({id,name,icon,color,ownerIconOverride})=>[id,name,icon,color,ownerIconOverride===true]));
}
export function availableApps({installed={},vpn=false,racing=false,pdRacing=false,network='',capabilities={}}) {
 return APPS.filter(app=>{
  if(capabilities?.[app.id]?.ownerAccess===false)return false;
  if(app.id==='jobcreator')return capabilities.jobcreator?.available===true;
  if(app.builtin)return true;
  if(app.id==='racing')return !!racing && !pdRacing;
  if(app.id==='time-trials')return !!pdRacing;
  if(app.id==='cars')return Object.hasOwn(NETWORKS,network);
  return !!installed?.[app.id];
 });
}
