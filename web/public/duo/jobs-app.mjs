/** Job Center / Job Creator. Native ESM views; unrelated legacy applications stay untouched. */
import {copyText} from './clipboard.mjs';
const make=(tag,cls='',text='')=>{const n=document.createElement(tag);n.className=cls;n.textContent=text;return n;};
const btn=(text,fn,cls='')=>{const b=make('button','pj-button '+cls,text);b.type='button';b.addEventListener('click',fn);return b;};
const clone=value=>JSON.parse(JSON.stringify(value));
const cash=value=>'$'+Number(value||0).toLocaleString();
const check=result=>{if(!result||result.Success!==true||result.__phoneError)throw Error(result?.Msg||result?.Error||result?.error||'The server did not accept that request.');return result;};
const field=(label,value,change,{type='text',maxLength,options}={})=>{
 const wrap=make('label','pj-field'),title=make('span','',label),input=make(options?'select':'input');input.setAttribute('aria-label',label);
 if(options)for(const [id,text] of options.map(o=>Array.isArray(o)?o:[o,o])){const opt=make('option','',text);opt.value=id;input.append(opt);}
 else {input.type=type;if(maxLength)input.maxLength=maxLength;}
 if(type==='checkbox')input.checked=!!value;else input.value=String(value??'');
 input.addEventListener(options||type==='checkbox'?'change':'input',()=>change(type==='checkbox'?input.checked:type==='number'?Number(input.value):input.value));wrap.append(title,input);return wrap;
};
const paragraph=text=>make('p','pj-muted',text);
const coords=()=>({x:0,y:0,z:0,w:0});
export const newJob=()=>({schema:1,id:'new_contract',name:'New contract',description:'',hub:coords(),ped:'s_m_m_postal_01',enabled:false,reward:250,account:'bank',minMembers:1,maxMembers:4,timeoutMinutes:30,requiredJob:'',requirements:[],steps:[{label:'Complete the first task',type:'work',coords:coords(),duration:10,radius:3,scenario:'clipboard'}]});
export function importJob(value){
 const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
 const point=v=>object(v)&&['x','y','z'].every(k=>Number.isFinite(v[k]));
 if(!object(value)||!point(value.hub)||!Array.isArray(value.steps)||value.steps.length<1||value.steps.length>40)throw Error('A job needs a meeting point and 1–40 objectives with numeric coordinates.');
 if(value.requirements!=null&&(!Array.isArray(value.requirements)||value.requirements.length>8||value.requirements.some(r=>!object(r))))throw Error('Item requirements must be a list of at most eight objects.');
 if(value.steps.some(t=>!object(t)||!point(t.coords)))throw Error('Every objective needs numeric x, y and z coordinates.');
 if(value.vehicle&&(!object(value.vehicle)||!point(value.vehicle.spawn)))throw Error('The assigned vehicle needs a valid spawn point.');
 const d={...newJob(),...clone(value),enabled:false};delete d.revision;d.requirements??=[];
 d.steps=d.steps.map(t=>({duration:10,radius:3,scenario:'none',type:'work',label:'New task',...t}));
 return d;
}
export class JobCenterApp{
 constructor({target,props:{send,notify=()=>{}}}){
  this.send=send;this.notify=notify;this.state={jobs:[],groups:[],offers:[],group:false};this.query='';this.pending=false;this.dead=false;this.loading=false;this.selected=null;
  this.node=make('section','peak-jobs');this.node.setAttribute('aria-label','Job Center');target.append(this.node);
  this.header=make('header','pj-header');this.header.append(make('span','pj-eyebrow','WORK, TOGETHER'),make('h1','','Job Center'));
  this.search=field('Find a contract','',v=>{this.query=v;this.render();},{maxLength:70});this.header.append(this.search);
  this.body=make('div','pj-body');this.live=make('p','pj-live');this.live.setAttribute('role','status');this.node.append(this.header,this.body,this.live);
  this.listener=e=>{if(e.source&&e.source!==window&&e.source!==window.parent)return;if(e.data?.Action==='Jobs/State'){this.state=e.data.Data;this.render();}else if(['Jobs/Ended','Jobs/Refresh'].includes(e.data?.Action))this.load();};
  window.addEventListener('message',this.listener);this.load();this.timer=setInterval(()=>this.load(),12000);
 }
 async load(){if(this.dead||this.loading)return;this.loading=true;try{const r=check(await this.send('Jobs/State'));if(!this.dead){this.state=r;this.render();}}catch(e){this.message(e.message);}finally{this.loading=false;}}
 message(s){if(this.dead)return;this.live.textContent=s;}
 async act(action,data={}){
  if(this.pending||this.dead)return;this.pending=true;this.node.classList.add('pj-pending');
  try{check(await this.send('Jobs/Action',{action,...data}));if(!this.dead){this.message('Saved.');await this.load();}}
  catch(e){this.message(e.message);this.notify(e.message);}finally{this.pending=false;if(!this.dead)this.node.classList.remove('pj-pending');}
 }
 async waypoint(jobId,active=false){try{check(await this.send('Jobs/Waypoint',{jobId,active}));this.message('GPS waypoint set.');}catch(e){this.message(e.message);}}
 render(){
  if(this.dead)return;
  // Polling must not destroy text currently being typed in a lobby field.
  if(this.body.contains(document.activeElement)&&/INPUT|TEXTAREA/.test(document.activeElement.tagName))return;
  const scroll=this.body.scrollTop;this.body.replaceChildren();const s=this.state;
  if(!s.ready){this.body.append(paragraph('The job service is initializing. An administrator can check phone_doctor.'));return;}
  for(const offer of s.offers||[]){const card=make('article','pj-card pj-invitation');card.append(make('h2','',offer.kind==='invite'?'Group invitation':'Join request'),paragraph(`${offer.from} · ${offer.group} · ${offer.job}`),btn('Accept',()=>this.act('respond',{offerId:offer.id,accept:true}),'primary'),btn('Decline',()=>this.act('respond',{offerId:offer.id,accept:false})));this.body.append(card);}
  if(s.group)this.renderGroup(s.group);
  const q=this.query.trim().toLowerCase();const jobs=(s.jobs||[]).filter(j=>(j.name+' '+j.description).toLowerCase().includes(q));
  this.body.append(make('h2','pj-section','Available contracts'));
  if(!jobs.length)this.body.append(paragraph('No contracts match your search.'));
  for(const job of jobs){
   const card=make('article','pj-card');card.dataset.jobId=job.id;
   const title=make('div','pj-card-top');title.append(make('h2','',job.name),make('span','pj-pill',cash(job.reward)));card.append(title,paragraph(job.description));
   const groups=(s.groups||[]).filter(g=>g.jobId===job.id);
   card.append(make('p','pj-meta',`${job.minMembers}–${job.maxMembers} members · ${job.stepCount} steps · ${job.timeoutMinutes} min · ${job.account}`));
   if(job.requiredJob)card.append(paragraph('Requires framework role: '+job.requiredJob));
   if(job.requirements?.length)card.append(paragraph('Bring: '+job.requirements.map(r=>`${r.item} × ${r.count}`).join(', ')));
   const actions=make('div','pj-actions');actions.append(btn('GPS',()=>this.waypoint(job.id)),btn(this.selected===job.id?'Hide groups':'Groups · '+groups.length,()=>{this.selected=this.selected===job.id?null:job.id;this.render();}));card.append(actions);
   if(this.selected===job.id){
    if(!s.group){let name='My crew';card.append(field('Crew name',name,v=>name=v,{maxLength:45}),btn('Create group at meeting point',()=>this.act('create',{jobId:job.id,name}),'primary'));}
    for(const group of groups){const row=make('div','pj-group-row');row.append(make('strong','',group.name),paragraph(`${group.members.length}/${group.maxMembers} · ${group.status}`));if(!s.group&&group.status==='lobby')row.append(btn('Request to join',()=>this.act('request',{groupId:group.id})));card.append(row);}
    if(!groups.length)card.append(paragraph('No groups yet. Create one at the meeting point.'));
   }
   this.body.append(card);
  }
  this.body.append(paragraph('These are session contracts, not permanent framework jobs. Rewards are fixed per eligible member. Complete objectives in the world using E.'));
  this.body.scrollTop=scroll;
 }
 renderGroup(g){
  const card=make('article','pj-card pj-current');card.append(make('span','pj-eyebrow','YOUR CREW'),make('h2','',g.name),paragraph(g.jobName+' · '+g.status));
  const me=g.members.find(m=>m.source===this.state.source);const leader=g.leader===this.state.source;
  for(const member of g.members){const row=make('div','pj-member');row.append(make('span','',member.name+(member.leader?' · Leader':'')),make('span','pj-pill',member.ready?'Ready':'Not ready'));
   if(leader&&g.status==='lobby'&&member.source!==this.state.source)row.append(btn('Lead',()=>this.act('promote',{target:member.source})),btn('Remove',()=>this.act('kick',{target:member.source})));card.append(row);}
  if(g.status==='lobby'){
   card.append(btn(me?.ready?'Not ready':'Ready',()=>this.act('ready',{ready:!me?.ready}),'primary'));
   if(leader){let target='';card.append(field('Nearby player server ID','',v=>target=v,{type:'number'}),btn('Invite player',()=>this.act('invite',{target:Number(target)})),btn('Start contract',()=>this.act('start'),'primary'));}
  }else if(g.status==='active'){
   card.append(make('h3','',`Step ${g.step} of ${g.stepCount}`),paragraph(g.task?.label||''));
   const progress=make('progress');progress.max=g.stepCount;progress.value=g.step-1;progress.setAttribute('aria-label','Contract progress');card.append(progress,paragraph(`${Math.ceil((g.remaining||0)/60)} minutes remaining · ${cash(g.reward)} per eligible member`),btn('GPS to task',()=>this.waypoint(null,true),'primary'));
  }
  card.append(btn('Leave group',()=>{this.message('Leaving an active contract cancels it for everyone.');const confirm=btn('Confirm leave',()=>this.act('leave'),'danger');card.append(confirm);}));this.body.append(card);
 }
 $destroy(){this.dead=true;clearInterval(this.timer);window.removeEventListener('message',this.listener);this.node.remove();}
}
export class JobCreatorApp{
 constructor({target,props:{send,notify=()=>{}}}){
  this.send=send;this.notify=notify;this.dead=false;this.pending=false;this.definitions=[];this.draft=null;this.revision=0;this.dirty=false;
  this.node=make('section','peak-jobs pj-creator');this.node.setAttribute('aria-label','Job Creator');target.append(this.node);
  const header=make('header','pj-header');header.append(make('span','pj-eyebrow','ADMINISTRATION'),make('h1','','Job Creator'));
  this.toolbar=make('div','pj-actions');header.append(this.toolbar);this.body=make('div','pj-body');this.live=make('p','pj-live');this.live.setAttribute('role','status');this.node.append(header,this.body,this.live);this.load();
 }
 msg(s){if(!this.dead)this.live.textContent=s;}
 async load(){try{const data=check(await this.send('Jobs/Admin'));if(this.dead)return;this.definitions=data.definitions||[];this.audit=data.audit||[];this.rewards=data.rewards||[];this.limits=data.limits;this.renderIndex();}catch(e){this.msg(e.message);}}
 async discardThen(fn){if(!this.dirty){fn();return;}this.msg('You have unsaved changes.');this.toolbar.append(btn('Discard changes',()=>{this.dirty=false;fn();},'danger'));}
 renderIndex(){
  if(this.dead)return;this.draft=null;this.dirty=false;this.toolbar.replaceChildren(btn('New job',()=>this.edit(newJob(),0)),btn('Import JSON',()=>this.importView()),btn('Refresh',()=>this.load()));this.body.replaceChildren();
  this.body.append(paragraph('Create route contracts using validated steps. Save as a draft first, then enable after testing. No Lua, SQL or custom event execution is accepted.'));
  for(const d of this.definitions){const card=make('article','pj-card');card.append(make('h2','',d.name),paragraph(`${d.id} · revision ${d.revision} · ${d.enabled?'Enabled':'Draft / disabled'} · ${cash(d.reward)} per member`),btn('Edit',()=>this.edit(clone(d),d.revision)),btn('Duplicate',()=>{const copy=clone(d);copy.id=d.id.slice(0,39)+'_copy';copy.name=d.name+' copy';copy.enabled=false;delete copy.revision;this.edit(copy,0);}));this.body.append(card);}
  if(this.rewards?.length){const box=make('article','pj-card');box.append(make('h2','','Payment review required'),paragraph('Do not repay automatically. Reconcile each reference against your framework wallet logs first.'));
   for(const r of this.rewards)box.append(make('code','pj-code',`${r.operation_id} | ${r.citizenid} | ${cash(r.amount)} | ${r.status}`));this.body.append(box);}
  if(this.audit?.length){const details=make('details','pj-card');details.append(make('summary','','Recent changes'));for(const a of this.audit)details.append(paragraph(`${a.job_id} · ${a.action} · r${a.revision} · ${a.actor}`));this.body.append(details);}
 }
 edit(d,revision){this.draft=d;this.revision=revision;this.dirty=false;this.editorSection='overview';this.renderEditor();}
 async position(target){try{const ref=this.draft;const p=await this.send('Jobs/Position');check(p);if(this.dead||this.draft!==ref)return;Object.assign(target,{x:p.x,y:p.y,z:p.z,w:p.w});this.dirty=true;this.renderEditor();}catch(e){this.msg(e.message);}}
 coordsForm(label,p){const box=make('fieldset','pj-coordinates');box.append(make('legend','',label));for(const key of ['x','y','z','w'])box.append(field(label+' '+(key==='w'?'heading':key),p[key]||0,v=>{p[key]=v;this.dirty=true;},{type:'number'}));box.append(btn('Use my position',()=>this.position(p)));return box;}
 renderEditor(){
  if(this.dead||!this.draft)return;const d=this.draft;const scroll=this.body.scrollTop;
  this.toolbar.replaceChildren(btn('All jobs',()=>this.discardThen(()=>this.renderIndex())),btn('Export JSON',()=>this.exportDraft()),btn(this.pending?'Saving…':'Save job',()=>this.save(),'primary'));this.body.replaceChildren();
  const section=this.editorSection||'overview',navigation=make('nav','pj-editor-sections');navigation.setAttribute('aria-label','Contract editor sections');
  for(const [id,label] of [['overview','Contract'],['crew','Crew & pay'],['location','Meeting point'],['equipment','Equipment'],['route','Route']]){const control=btn(label,()=>{this.editorSection=id;this.body.scrollTop=0;this.renderEditor();});control.setAttribute('aria-pressed',String(section===id));navigation.append(control);}this.body.append(navigation);
  const hero=make('div','pj-editor-hero');hero.append(make('span','pj-eyebrow',this.revision?'REVISION '+this.revision:'NEW DRAFT'),make('h2','',d.name||'Untitled contract'),paragraph(section==='route'?d.steps.length+' ordered objectives':section==='crew'?cash(d.reward)+' per eligible member':section==='equipment'?'Vehicle and inventory requirements':section==='location'?'Choose where your crew meets':'Define a contract before enabling it for players'));this.body.append(hero);
  const basic=make('div','pj-card');const bind=(key,label,opts={})=>basic.append(field(label,d[key],v=>{d[key]=v;this.dirty=true;},opts));
  bind('id','Unique job ID',{maxLength:48});if(this.revision>0)basic.querySelector('input').disabled=true;
  bind('name','Job name',{maxLength:70});bind('description','Description',{maxLength:700});bind('enabled','Enabled for players',{type:'checkbox'});
  bind('reward','Reward per eligible member',{type:'number'});bind('account','Pay into',{options:['bank','cash']});bind('minMembers','Minimum members',{type:'number'});bind('maxMembers','Maximum members',{type:'number'});bind('timeoutMinutes','Time limit (minutes)',{type:'number'});
  bind('ped','Meeting-point NPC model',{maxLength:60});bind('requiredJob','Required framework job (blank = everyone)',{maxLength:48});basic.append(this.coordsForm('Meeting point',d.hub));
  const fieldSections=['overview','overview','overview','overview','crew','crew','crew','crew','crew','location','crew','location'];[...basic.children].forEach((node,index)=>node.hidden=fieldSections[index]!==section);if(['overview','crew','location'].includes(section))this.body.append(basic);
  const vehicle=make('div','pj-card');vehicle.append(make('h2','','Assigned vehicle'),paragraph('Optional. The server spawns one vehicle per crew and cleans it up when the contract ends. Use a valid GTA vehicle model.'));
  vehicle.append(field('Supply a vehicle',!!d.vehicle,v=>{d.vehicle=v?{model:'speedo',type:'automobile',spawn:clone(d.hub)}:null;this.dirty=true;this.renderEditor();},{type:'checkbox'}));
  if(d.vehicle){vehicle.append(field('Vehicle model',d.vehicle.model,v=>{d.vehicle.model=v;this.dirty=true;},{maxLength:60}),field('Vehicle type',d.vehicle.type,v=>{d.vehicle.type=v;this.dirty=true;},{options:['automobile','bike','boat','heli','plane']}),this.coordsForm('Vehicle spawn',d.vehicle.spawn));}
  if(section==='equipment')this.body.append(vehicle);
  const req=make('div','pj-card');req.append(make('h2','','Required inventory items'),paragraph('Checked through peak-bridge. These items are required, not consumed or awarded.'));
  for(const [i,r] of (d.requirements||[]).entries())req.append(field('Item '+(i+1),r.item,v=>{r.item=v;this.dirty=true;},{maxLength:60}),field('Quantity '+(i+1),r.count,v=>{r.count=v;this.dirty=true;},{type:'number'}),btn('Remove item '+(i+1),()=>{d.requirements.splice(i,1);this.dirty=true;this.renderEditor();}));
  req.append(btn('Add required item',()=>{d.requirements??=[];if(d.requirements.length>=8)return this.msg('At most eight item requirements.');d.requirements.push({item:'',count:1});this.dirty=true;this.renderEditor();}));if(section==='equipment')this.body.append(req);
  if(section==='route'){
  this.body.append(make('h2','pj-section','Ordered objectives'));
  for(const [i,t] of d.steps.entries()){
   const box=make('div','pj-card');box.append(make('h3','',`Step ${i+1}`));
   for(const [key,label,opts] of [['label','Task label',{maxLength:120}],['type','Task type',{options:['visit','work','collect','deliver','drive']}],['duration','Minimum work time (seconds)',{type:'number'}],['radius','Acceptance radius (metres)',{type:'number'}],['scenario','Animation',{options:['none','clipboard','hammer','clean','garden','fish','weld']}]] )box.append(field(`Step ${i+1}: ${label}`,t[key],v=>{t[key]=v;this.dirty=true;},opts));
   box.append(this.coordsForm('Step '+(i+1)+' location',t.coords));
   const actions=make('div','pj-actions');for(const [label,delta] of [['Move up',-1],['Move down',1]]){const b=btn(label,()=>{const n=i+delta;[d.steps[i],d.steps[n]]=[d.steps[n],d.steps[i]];this.dirty=true;this.renderEditor();});b.disabled=i+delta<0||i+delta>=d.steps.length;actions.append(b);}
   actions.append(btn('Duplicate step',()=>{if(d.steps.length>=40)return this.msg('At most 40 steps.');d.steps.splice(i+1,0,clone(t));this.dirty=true;this.renderEditor();}),btn('Remove step',()=>{d.steps.splice(i,1);this.dirty=true;this.renderEditor();},'danger'));box.append(actions);this.body.append(box);
  }
  this.body.append(btn('Add step',()=>{if(d.steps.length>=40)return this.msg('At most 40 steps.');d.steps.push({label:'New task',type:'work',coords:clone(d.hub),duration:10,radius:3,scenario:'clipboard'});this.dirty=true;this.renderEditor();},'primary'),paragraph('Visit: arrive and confirm. Work/collect/deliver: complete a timed interaction. Drive: arrive in the server-assigned vehicle. Inventory crafting, society accounts, bosses, garages and bespoke minigames are not generated by this contract editor.'));
  }
  this.body.scrollTop=scroll;
  queueMicrotask(()=>{if(!navigation.isConnected)return;const active=navigation.querySelector('[aria-pressed="true"]');if(active)navigation.scrollLeft=Math.max(0,active.offsetLeft-(navigation.clientWidth-active.offsetWidth)/2);});
 }
 async save(){if(this.pending||!this.draft||this.dead)return;this.pending=true;const ref=this.draft;this.node.classList.add('pj-pending');try{
   const r=check(await this.send('Jobs/Action',{action:'save',revision:this.revision,definition:clone(ref)}));if(this.dead)return;
   if(!r.definition||!Number.isInteger(r.definition.revision))throw Error('Invalid save acknowledgement; your draft was kept.');
   this.draft=r.definition;this.revision=r.definition.revision;this.dirty=false;const i=this.definitions.findIndex(d=>d.id===r.definition.id);if(i<0)this.definitions.push(r.definition);else this.definitions[i]=r.definition;
   this.msg(`Saved revision ${this.revision}. ${this.draft.enabled?'Available to players.':'Kept as a draft.'}`);this.renderEditor();
  }catch(e){this.msg(e.message);}finally{this.pending=false;if(!this.dead){this.node.classList.remove('pj-pending');this.renderEditor();}}}
 exportDraft(){const text=JSON.stringify({schema:1,...this.draft},null,2);this.jsonView('Export job definition',text,false);}
 importView(){this.jsonView('Import job definition','',true);}
 jsonView(title,value,importing){
  this.toolbar.replaceChildren(btn('Back',()=>this.draft?this.renderEditor():this.renderIndex()));this.body.replaceChildren(make('h2','',title),paragraph(importing?'Paste a JSON job definition. Imported jobs start disabled and require a new ID. Server validation runs on Save.':'Copy this JSON and keep it with your server backups.'));
  const text=make('textarea','pj-json');text.setAttribute('aria-label',title);text.value=value;this.body.append(text);
  if(importing)this.body.append(btn('Load as new draft',()=>{try{if(text.value.length>100000)throw Error('JSON exceeds 100 kB.');this.edit(importJob(JSON.parse(text.value)),0);}catch(e){this.msg(e.message);}},'primary'));
  else this.body.append(btn('Copy JSON',async()=>{const copied=await copyText(text.value);if(!this.dead)this.notify(copied?'Copied.':'Could not copy. Try again.');}));
 }
 $destroy(){this.dead=true;this.node.remove();}
}
