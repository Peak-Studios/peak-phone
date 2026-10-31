/** Consent is global to the phone, not tied to the Contacts component's mount lifecycle. */
export class ContactShareService{
 constructor({target,send,notify=()=>{}}){
  this.send=send;this.notify=notify;this.pending=new Map();this.busy=false;this.generation=0;this.visible=false;
  this.node=document.createElement('aside');this.node.className='peak-contact-share';this.node.hidden=true;this.node.setAttribute('role','dialog');this.node.setAttribute('aria-live','assertive');this.node.setAttribute('aria-label','Incoming contact share');target.append(this.node);
  this.listener=e=>{if(e.source&&e.source!==window&&e.source!==window.parent)return;const d=e.data;
   if(d?.Action==='Contacts/IncomingShare')this.add(d.Data);
   else if(d?.Action==='OpenPhone'){this.visible=true;this.load();this.render();}
   else if(d?.Action==='ClosePhone'){this.visible=false;this.render();}
   else if(['Contacts/ClearShares','ResetPhone','Duo/Reset'].includes(d?.Action)){this.generation++;this.pending.clear();this.visible=false;this.render();}
  };window.addEventListener('message',this.listener);
  this.timer=setInterval(()=>this.render(),1000);
 }
 add(r){if(!r||typeof r.RequestId!=='string'||!r.Contact)return;this.pending.set(r.RequestId,{...r,deadline:Date.now()+Math.min(60,Number(r.ExpiresIn)||0)*1000});this.render();}
 async load(){const n=this.generation;try{const result=await this.send('Contacts/PendingAirShares');if(n!==this.generation||result?.Success!==true)return;this.pending.clear();for(const r of result.requests||[])this.add(r);this.render();}catch{/* Normal transport reports failures. */}}
 render(){
  for(const [id,r] of this.pending)if(r.deadline<=Date.now())this.pending.delete(id);
  const request=this.pending.values().next().value;this.node.hidden=!request||!this.visible;if(!request)return;
  if(this.shown===request.RequestId&&this.node.childElementCount){for(const b of this.node.querySelectorAll('button'))b.disabled=this.busy;const remaining=this.node.querySelector('.peak-share-time');if(remaining)remaining.textContent=this.timeLeft(request);return;}
  this.shown=request.RequestId;this.node.replaceChildren();
  const head=document.createElement('div');head.className='peak-share-head';
  const mark=document.createElement('span');mark.className='peak-share-mark';mark.textContent='↗';mark.setAttribute('aria-hidden','true');
  const heading=document.createElement('div');const kicker=document.createElement('span');kicker.className='peak-share-kicker';kicker.textContent='CONTACT SHARE';
  const title=document.createElement('strong');title.textContent=`${request.SenderName||'A player'} wants to share`;
  const remaining=document.createElement('span');remaining.className='peak-share-time';remaining.textContent=this.timeLeft(request);heading.append(kicker,title);head.append(mark,heading,remaining);
  const card=document.createElement('div');card.className='peak-share-card';
  const avatar=document.createElement('span');avatar.className='peak-share-avatar';const contactName=String(request.Contact.name||request.Contact.Name||'Contact');avatar.textContent=contactName.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase()||'?';
  const info=document.createElement('div');const name=document.createElement('strong');name.textContent=contactName;const phone=document.createElement('span');phone.textContent=String(request.Contact.phone||request.Contact.Phone||'');info.append(name,phone);card.append(avatar,info);
  const actions=document.createElement('div');actions.className='peak-share-actions';for(const [text,accept] of [['Decline',false],['Add contact',true]]){const b=document.createElement('button');b.type='button';b.textContent=text;b.className=accept?'peak-share-accept':'peak-share-decline';b.addEventListener('click',()=>this.respond(request.RequestId,accept));actions.append(b);}this.node.append(head,card,actions);
 }
 timeLeft(request){return `${Math.max(0,Math.ceil((request.deadline-Date.now())/1000))}s`;}
 async respond(id,accept){if(this.busy)return;this.busy=true;this.render();const n=this.generation;try{
   const result=await this.send('Contacts/RespondAirShare',{RequestId:id,Accept:accept});if(n!==this.generation)return;
   if(!result?.Success)throw Error(result?.Msg||'The contact could not be saved.');this.pending.delete(id);this.shown=null;this.notify(accept?'Contact saved.':'Contact share declined.');
  }catch(e){if(n===this.generation)this.notify(e.message);}finally{this.busy=false;this.render();}}
 destroy(){this.generation++;clearInterval(this.timer);window.removeEventListener('message',this.listener);this.node.remove();}
}
