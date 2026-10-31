import { NativeView, el, icon, rows, avatar, relativeTime } from './native-kit.mjs?rev=owner-config-20261015';

let dialFormSequence=0;

/** FaceTime is an app view, not the owner of the live call or its camera. */
export class VideoApp extends NativeView {
  constructor(options){
    super(options);this.element.className='nx-app duo-video-app';this.element.setAttribute('aria-label','FaceTime');
    this.contacts=[];this.calls=[];this.tab='recents';this.query='';this.busy=false;this.loading=true;
    this.render();this.load();
    this.resize=new ResizeObserver(entries=>{const rect=entries[0]?.contentRect;this.element.dataset.compact=String((rect?.height||0)<620);});this.resize.observe(this.element);
    this.change=()=>this.renderCallLink();this.service.addEventListener('change',this.change);this.callUI?.addEventListener('change',this.change);
    this.messages(data=>{if(data.Action==='Contacts/SetContacts'){this.contacts=rows(data.Contacts);this.renderList();this.composerRenderChoices?.();}});
  }
  async load(){
    this.loading=true;this.renderList();
    const results=await Promise.allSettled([this.send('Facetime/GetContacts',{}),this.send('Calls/GetCalls',{})]);
    if(!this.alive)return;this.loading=false;
    const [contacts,calls]=results;
    if(contacts.status==='fulfilled'&&Array.isArray(contacts.value))this.contacts=contacts.value;
    if(calls.status==='fulfilled'&&Array.isArray(calls.value))this.calls=calls.value;
    if(contacts.status==='rejected'||calls.status==='rejected')this.error('Some conversations could not load. Use Refresh to try again.');
    this.renderList();this.composerRenderChoices?.();
  }
  render(){
    this.element.replaceChildren();
    const header=el('header','ft-header'),brand=el('div','ft-brand');
    const heading=el('div');heading.append(el('h1','','FaceTime'));brand.append(heading);
    header.append(brand,this.button('Refresh conversations','refresh',()=>{this.error('');this.load();},'ft-refresh'));
    this.element.append(header);
    this.errorBox=el('div','ft-error');this.errorBox.setAttribute('role','alert');this.errorBox.hidden=true;this.element.append(this.errorBox);
    this.returnButton=this.textButton('Return to your call','video',()=>this.callUI?.setExpanded(true),'ft-call-link');this.returnButton.hidden=true;this.element.append(this.returnButton);
    const scroll=el('div','ft-scroll');
    const form=el('form','ft-dial');form.id=`ft-dial-${++dialFormSequence}`;
    const label=el('label','ft-search');label.innerHTML=icon('search');
    this.input=el('input');this.input.type='search';this.input.autocomplete='off';this.input.maxLength=80;this.input.placeholder='Name or phone number';this.input.setAttribute('aria-label','Search contacts or enter a phone number');
    this.listen(this.input,'input',()=>{this.query=this.input.value;this.renderList();});label.append(this.input);
    this.dialButton=this.textButton('New Call','video',()=>{},'ft-new');this.dialButton.type='submit';this.dialButton.setAttribute('form',form.id);
    this.listen(form,'submit',event=>{event.preventDefault();
      if(event.submitter===this.dialButton||/^\d{3,20}$/.test(this.query.replace(/[\s()+-]/g,''))){this.openDialComposer(this.query);return;}
      this.tab='contacts';this.renderTabs();this.renderList();this.input.focus();if(this.query&&!this.filtered().length)this.error('Choose a contact or enter a valid phone number.');
    });form.append(label);scroll.append(form);
    this.tabsHost=el('div','ft-tabs-host');scroll.append(this.tabsHost);this.renderTabs();
    this.list=el('div','ft-list');scroll.append(this.list);this.element.append(scroll);
    const footer=el('footer','ft-footer');footer.append(this.dialButton);this.element.append(footer);
    this.renderList();this.renderCallLink();
  }
  error(message){this.errorBox.textContent=message||'';this.errorBox.hidden=!message;}
  openDialComposer(initial=''){
    this.error('');
    let selected=null;
    const panel=this.openSheet('New Call',{onClose:()=>{if(this.composerRenderChoices===renderChoices)this.composerRenderChoices=null;}});
    panel.classList.add('ft-dial-composer');
    const form=el('form','ft-compose-form');
    const field=el('label','nx-field ft-compose-field');field.append(el('span','','Phone number or contact'));
    const number=el('input');number.type='tel';number.inputMode='tel';number.autocomplete='tel';number.maxLength=40;number.placeholder='Enter a number or search contacts';number.setAttribute('aria-label','Phone number or contact');number.value=String(initial||'').trim();field.append(number);
    const status=el('p','ft-compose-status','Enter a number or choose a contact below.');status.setAttribute('role','status');
    const privacy=el('p','ft-compose-privacy','FaceTime video uses your in-game character camera. Your webcam is never used.');
    const choices=el('div','ft-compose-contacts');choices.setAttribute('aria-label','Matching contacts');
    const submit=this.textButton('Call','video',()=>{},'nx-primary ft-compose-call');submit.type='submit';submit.disabled=true;
    const normalized=()=>number.value.replace(/[\s()+-]/g,'');
    const renderChoices=()=>{
      const q=number.value.trim().toLowerCase();choices.replaceChildren();
      const matches=this.contacts.filter(c=>String(c.Phone||c.phone||'').trim()&&[c.Contact,c.ContactName,c.Name,c.name,c.Phone,c.phone].some(x=>String(x||'').toLowerCase().includes(q))).slice(0,8);
      if(!matches.length){choices.append(el('p','ft-compose-empty',this.loading?'Loading saved contacts…':q?'No matching contacts. You can still enter a number.':'No saved contacts yet. Enter a number to call.'));return;}
      for(const contact of matches){
        const phone=String(contact.Phone||contact.phone||'').trim(),name=String(contact.Contact||contact.ContactName||contact.Name||contact.name||phone);
        const row=this.button(`${name}, ${phone}`,null,()=>{selected={name,phone};number.value=phone;status.textContent=`${name} selected. Confirm to start the call.`;syncButton();number.focus();},'ft-compose-contact');
        const portrait=avatar(name,contact.Avatar||contact.avatar),copy=el('span','ft-compose-contact-copy');copy.append(el('strong','',name),el('small','',phone));row.replaceChildren(portrait,copy);choices.append(row);
      }
    };
    const syncButton=()=>{const valid=/^\d{3,20}$/.test(normalized());submit.disabled=!valid;if(valid)submit.textContent=selected&&selected.phone===normalized()?`Call ${selected.name}`:'Call';else submit.textContent='Call';};
    this.listen(number,'input',()=>{if(!selected||selected.phone!==normalized()){selected=null;status.textContent='Enter a number or choose a contact below.';}renderChoices();syncButton();});
    this.listen(form,'submit',async event=>{
      event.preventDefault();const phone=normalized();if(!/^\d{3,20}$/.test(phone)){status.textContent='Enter a phone number with 3–20 digits.';number.focus();return;}
      submit.disabled=true;status.textContent=this.preview?'Calls are unavailable in the browser preview.':`Calling ${selected&&selected.phone===phone?selected.name:phone}…`;
      const started=await this.dial(phone);
      if(started){if(this.sheet?.panel===panel)this.closeSheet();return;}
      status.textContent=this.errorBox.textContent||'The call could not be started. Try again.';syncButton();
    });
    form.append(field,choices,status,privacy,submit);panel.append(form);
    this.composerRenderChoices=renderChoices;renderChoices();syncButton();number.focus({preventScroll:true});
  }
  renderTabs(){this.tabsHost.replaceChildren(this.tabs([['recents','Recents','timer'],['contacts','Contacts','users']],this.tab,id=>{this.tab=id;this.renderTabs();this.renderList();},'ft-tabs'));}
  filtered(){const query=this.query.trim().toLowerCase();return (this.tab==='contacts'?this.contacts:[...this.calls].sort((a,b)=>Number(b.Timestamp)-Number(a.Timestamp)))
    .filter(c=>!query||[c.Contact,c.Name,c.name,c.Phone,c.phone].some(x=>String(x||'').toLowerCase().includes(query))).slice(0,60);}
  renderList(){
    if(!this.list)return;this.list.replaceChildren();
    if(this.loading){this.list.append(el('p','ft-empty','Loading your conversations…'));return;}
    const list=this.filtered();
    const head=el('div','ft-list-heading');head.append(el('h2','',this.tab==='contacts'?'YOUR PEOPLE':'RECENT CONVERSATIONS'),el('span','',String(list.length)));this.list.append(head);
    if(!list.length){const empty=el('div','ft-empty');empty.innerHTML=icon(this.query?'search':this.tab==='contacts'?'users':'video');empty.append(el('h3','',this.query?'No matching conversations':this.tab==='contacts'?'No contacts found':'No recent FaceTime calls'),el('p','',this.query?'Try a different name or phone number.':this.tab==='contacts'?'Your contacts will appear here.':'Recent FaceTime calls will appear here.'));this.list.append(empty);return;}
    for(const contact of list){
      const phone=String(contact.Phone||contact.phone||''),name=String(contact.Contact||contact.ContactName||contact.Name||contact.name||phone),row=el('div','ft-person');
      const portrait=avatar(name,contact.Avatar||contact.avatar);row.dataset.palette=portrait.dataset.palette||'0';
      const call=this.button(`Video call ${name}`,null,()=>this.dial(phone),'ft-person-name');call.replaceChildren(el('strong','',name));
      const summary=el('span','ft-person-summary');summary.append(el('span','ft-person-status',this.tab==='contacts'?phone:(contact.Status==='missed'?'Missed call':contact.Incoming?'Incoming call':'Outgoing call')));
      if(this.tab==='recents')summary.append(el('time','ft-time',relativeTime(contact.Timestamp)));
      const video=this.button(`Start FaceTime with ${name}`,'video',()=>this.dial(phone),'ft-person-video');
      row.append(call,portrait,summary,video);this.list.append(row);
    }
  }
  async dial(number){
    if(this.busy)return false;
    if(this.preview){this.error('This is a browser preview. Real FaceTime calls connect players inside FiveM.');return false;}
    const phone=String(number||'').replace(/[\s()+-]/g,'');
    if(!/^\d{3,20}$/.test(phone)){this.error('Enter a phone number with 3–20 digits.');return false;}
    this.busy=true;this.dialButton.disabled=true;this.error('');
    try {await this.service.rpc('Facetime/StartCall',{Phone:phone});return true;}
    catch(error){if(this.alive)this.error(error.message);return false;}
    finally{this.busy=false;if(this.alive)this.dialButton.disabled=false;}
  }
  renderCallLink(){
    if(!this.alive)return;const v=this.service.snapshot();this.returnButton.hidden=!(this.callUI?.state||v.state||this.service.session);
    if(v.error)this.error(v.error);
  }
  $destroy(){this.resize.disconnect();this.service.removeEventListener('change',this.change);this.callUI?.removeEventListener('change',this.change);super.$destroy();}
}
