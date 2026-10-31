import {NativeView,el,avatar,normalizePhone,errorMessage} from './native-kit.mjs?rev=owner-config-20261015';
import {getOwnerConfig} from './owner-config.mjs?rev=owner-config-20261015';

const labels={
 police:'Police officer',ambulance:'Paramedic',bcso:'Deputy sheriff',sasp:'State trooper',
 ranger:'Park ranger',fire:'Firefighter',tow:'Tow operator',mechanic:'Mechanic',impound:'Tow operator',
};

function normalizeWorkers(value){
 if(!Array.isArray(value))throw Error('The directory returned an invalid list.');
 return value.map(worker=>{
  const phone=normalizePhone(worker?.Phone),source=Number(worker?.Source),name=String(worker?.Name||'').trim(),job=String(worker?.Job||'').trim();
  if(!worker||!Number.isSafeInteger(source)||source<1||!name||name.length>100||!job||job.length>40||!/^[0-9]{3,20}$/.test(phone))throw Error('The directory included an incomplete worker record. Refresh before calling.');
  return {Source:source,Name:name,Job:job,Phone:phone,Avatar:typeof worker.Avatar==='string'?worker.Avatar:''};
 });
}

const timeLabel=stamp=>stamp?new Date(stamp).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):'';

export class ServicesApp extends NativeView{
 constructor(options){
  super(options);this.element.classList.add('nx-restored-app','nx-services');
  this.getCallCapability=options.props?.getCallCapability;this.preview=options.props?.preview===true;
  this.sections={emergency:{state:'loading',workers:[],error:''},tow:{state:'loading',workers:[],error:''}};
  this.lastRefreshed=0;this.loadSequence=0;this.busyCalls=new Set();this.message='';this.render();this.load();
 }
 render(){
  if(!this.alive)return;
  const config=getOwnerConfig().services;
  const header=this.header(getOwnerConfig().apps.labels.services||config.title,config.subtitle,[this.button('Refresh services','refresh',()=>this.load(),'nx-header-action')]);
  this.element.replaceChildren(header);
  const body=el('div','nx-restored-body nx-services-body');
  const call=this.getCallCapability?.()||{available:false,reason:'Call capability is unavailable.'};
  const section=(key,title,description)=>{
   const state=this.sections[key],group=el('section','nx-services-section');group.dataset.state=state.state;
   const heading=el('div','nx-restored-section-heading');heading.append(el('div','nx-restored-section-title',title),el('span','nx-section-count',state.state==='ready'?String(state.workers.length):''));
   group.append(heading);
   if(state.state==='loading'){
    group.append(el('p','nx-restored-state','Checking on-duty workers…'));
   }else if(state.state==='error'){
    const problem=el('div','nx-restored-error');problem.append(el('p','',state.error),this.textButton('Try again','refresh',()=>this.load(),'nx-inline-action'));group.append(problem);
   }else if(!state.workers.length){
    group.append(el('p','nx-restored-state',`No ${description} are listed right now.`));
   }else{
    const list=el('div','nx-services-list');
    for(const worker of state.workers){
     const row=el('article','nx-services-row');row.dataset.worker=String(worker.Source);
     row.append(avatar(worker.Name,worker.Avatar,'nx-avatar-small'));
     const copy=el('div','nx-services-copy');copy.append(el('strong','',worker.Name),el('span','',config.jobLabels[worker.Job.toLowerCase()]||labels[worker.Job.toLowerCase()]||worker.Job));
     const busy=this.busyCalls.has(worker.Source),button=this.textButton(busy?'Calling…':call.available===true?'Call':'Unavailable','phone',()=>this.callWorker(worker),'nx-call-worker');
     button.disabled=busy||call.available!==true;button.setAttribute('aria-label',call.available===true?`Call ${worker.Name}`:`Call ${worker.Name} unavailable: ${call.reason||'Voice calling is not available.'}`);
     button.title=call.available===true?'Call this individual worker.':call.reason||'Voice calling is not available.';
     row.append(copy,button);list.append(row);
    }
    group.append(list);
   }
   return group;
  };
  if(this.preview)body.append(el('p','nx-preview-note','SYNTHETIC PREVIEW · calls are never placed from this browser.'));
  body.append(section('emergency',config.sections.emergency.title,config.sections.emergency.description),section('tow',config.sections.tow.title,config.sections.tow.description));
  const stamp=el('p','nx-restored-footnote',this.lastRefreshed?`Last refreshed ${timeLabel(this.lastRefreshed)}.`:'Directory not yet refreshed.');
  stamp.append(document.createTextNode(' Calls go to individual workers; this directory does not route emergency dispatch.'));
  body.append(stamp);
  if(this.message){const live=el('p','nx-restored-live',this.message);live.setAttribute('role','status');live.setAttribute('aria-live','polite');body.append(live);}
  this.element.append(body);
 }
 async load(){
  const sequence=++this.loadSequence;this.message='';
  for(const key of ['emergency','tow'])this.sections[key]={state:'loading',workers:this.sections[key].workers,error:''};
  this.render();
  const result=await Promise.allSettled([
   this.send('Services/GetEmergencyWorkers',{}),this.send('Services/GetTowWorkers',{}),
  ]);
  if(!this.alive||sequence!==this.loadSequence)return;
  const keys=['emergency','tow'];let refreshed=false;
  result.forEach((entry,index)=>{
   const key=keys[index];
   if(entry.status==='rejected')this.sections[key]={state:'error',workers:[],error:entry.reason?.message||'This directory could not be refreshed.'};
   else try{this.sections[key]={state:'ready',workers:normalizeWorkers(entry.value),error:''};refreshed=true;}
   catch(error){this.sections[key]={state:'error',workers:[],error:error.message||'This directory returned invalid data.'};}
  });
  if(refreshed)this.lastRefreshed=Date.now();
  this.render();
 }
 onActivate(){this.load();}
 async callWorker(worker){
  if(!this.alive||this.busyCalls.has(worker.Source))return;
  const capability=this.getCallCapability?.()||{available:false,reason:'Call capability is unavailable.'};
  if(capability.available!==true){this.message=capability.reason||'Voice calling is unavailable.';this.render();return;}
  this.busyCalls.add(worker.Source);this.render();
  try{
   const result=await this.send('Contacts/Call',{Phone:worker.Phone});
   if(!this.alive)return;
   if(result?.PreviewOnly===true){this.message=result.Msg||'Synthetic preview only. No call was placed.';return;}
   if(result?.Success!==true)throw Error(errorMessage(result,'The call request was not accepted.'));
   this.message='Call request started. Wait for the other worker to answer; a connection is not confirmed yet.';
   this.openApp?.('calls');
  }catch(error){if(this.alive)this.message=error.message||'The call request failed.';}
  finally{this.busyCalls.delete(worker.Source);if(this.alive)this.render();}
 }
 $destroy(){this.loadSequence++;super.$destroy();}
}

export {normalizeWorkers as normalizeServiceWorkers};
