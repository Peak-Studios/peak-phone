import {bindVerticalSlider} from './control-center.mjs?rev=owner-config-20261015';
import {ringtoneId,settingsRingtoneOptions} from './ringtones.mjs';

import {GlassView,el,field,selectField,rows} from './glass-kit.mjs?rev=owner-config-20261015';
function pinEditor(view,parent,label){
 const panel=el('div','ps-pin-panel');panel.setAttribute('aria-label',label+' keypad');
 const input=el('input','ps-pin-input');input.type='password';input.inputMode='numeric';input.autocomplete='off';input.maxLength=6;input.setAttribute('aria-label',label);input.pattern='[0-9]*';
 const dots=el('div','ps-pin-dots');dots.setAttribute('role','status');dots.setAttribute('aria-live','polite');dots.setAttribute('aria-label','PIN entry');
 const markers=Array.from({length:6},()=>el('span','ps-pin-dot'));dots.append(...markers);
 const update=()=>{for(const [index,dot] of markers.entries())dot.dataset.filled=String(index<input.value.length);dots.setAttribute('aria-label',`${input.value.length} of 6 PIN digits entered`);};
 input.addEventListener('input',()=>{input.value=input.value.replace(/\D/g,'').slice(0,6);update();});
 const keypad=el('div','ps-pin-keypad');
 for(const digit of ['1','2','3','4','5','6','7','8','9','', '0','delete']){
  if(!digit){const spacer=el('span','ps-pin-key-spacer');spacer.setAttribute('aria-hidden','true');keypad.append(spacer);continue;}
  const key=view.button(digit==='delete'?'Delete last digit':digit,digit==='delete'?'delete':'',()=>{
   input.value=digit==='delete'?input.value.slice(0,-1):(input.value+digit).slice(0,6);update();input.focus({preventScroll:true});
  },'ps-pin-key');
  if(digit!=='delete')key.textContent=digit;
  if(['2','3','4','5','6','7','8','9'].includes(digit))key.append(el('small','',({2:'ABC',3:'DEF',4:'GHI',5:'JKL',6:'MNO',7:'PQRS',8:'TUV',9:'WXYZ'})[digit]));
  if(digit==='0')key.dataset.zero='true';keypad.append(key);
 }
 panel.append(input,dots,keypad);parent.append(panel);return {input,panel};
}
function settingTextField(label,{value='',placeholder='',maxLength=2048}={}){const wrapper=el('label','ps-setting-field');wrapper.append(el('span','',label));const input=el('input');input.setAttribute('aria-label',label);input.type='text';input.value=value;input.placeholder=placeholder;input.maxLength=maxLength;wrapper.append(input);return {wrapper,input};}
function settingsNav(view,panel,title,actionLabel,onAction){const nav=el('header','cf-sheet-nav');nav.append(view.textButton('Cancel','',()=>view.closeSheet(),'cf-nav-leading'),el('h2','',title));const action=view.textButton(actionLabel,'',onAction,'cf-nav-trailing');nav.append(action);panel.append(nav);return action;}
function settingsContext(title,detail,glyph='lock'){const row=el('div','cf-context-row');row.append(el('span','cf-confirm-mark',glyph==='lock'?'●':'✓'),el('span','',`${title} · ${detail}`));return row;}
export class SettingsApp extends GlassView {

 constructor(options){super(options);this.page='home';this.sliderStops=[];this.element.classList.add('ps-settings');this.element.setAttribute('aria-label','Settings');this.snapshot=null;this.loading=true;this.error='';this.frame('Settings','Everyday preferences and device care.');this.messages(data=>{if(data.Action==='Devices/SimProgress'&&this.alive){this.simProgress=data.State;this.render();}});this.appearanceListener=()=>{const select=this.element.querySelector('select[aria-label=Appearance]');if(select)select.value=this.phoneSettings.get().appearance;};window.addEventListener('duo:appearance',this.appearanceListener);this.load();}

 async load(){const version=++this.readEpoch;this.loading=true;this.error='';this.render();try{const data=await this.data('Devices/list');const active=rows(data.Devices).find(device=>device.active);const locked=active?.has_pin&&!active.unlocked;const preferences=locked?{}:await this.data('Phone/GetPreferences');if(this.alive&&version===this.readEpoch){this.snapshot=data;this.preferences=preferences||{};this.generation=data.Generation;}}catch(e){if(this.alive&&version===this.readEpoch)this.error=e.message;}finally{if(this.alive&&version===this.readEpoch){this.loading=false;this.render();}}}

 renderDevice(){this.frame('Device & SIM','Everyday preferences and device care.',[this.button('Refresh','refresh',()=>this.load(),'nx-header-action')]);if(this.loading){this.body.append(this.empty('Loading settings','Checking device identity and SIM state.','timer'));return;}if(this.error){this.body.append(this.empty('Settings unavailable',this.error,'wifi',()=>this.load()));return;}const s=this.snapshot||{},devices=rows(s.Devices),active=devices.find(d=>d.active);if(!active){this.body.append(this.empty('No active device','Select an available phone device to continue.','phone'));this.devicePicker(devices);return;}

  const identity=el('section','gx-section');identity.append(el('p','gx-eyebrow','ACTIVE DEVICE'),el('h2','gx-title',active.label||'Peak Duo'),el('p','gx-copy',active.device_id));const chips=el('div','gx-chip-row');chips.append(el('span','gx-chip',active.access_type==='owner'?'Owned by you':'Borrowed'),el('span','gx-chip',active.status),el('span','gx-chip',s.InventoryMode==='unique'?'Unique item mode':'Count-only compatibility'));identity.append(chips);this.body.append(identity);
  if(active.has_pin&&!active.unlocked){const lock=el('section','gx-section gx-attention');lock.append(el('h2','gx-title','Device locked'),el('p','gx-copy','Enter the device PIN. Failed attempts are rate limited by the server.'));const pin=pinEditor(this,lock,'Device PIN');const b=this.textButton('Unlock','lock',()=>this.submit(b,async()=>{if(!/^\d{4,6}$/.test(pin.input.value))throw Error('Enter 4–6 digits.');await this.data('Devices/unlock',{Generation:this.generation,PIN:pin.input.value});await this.load();},lock),'ps-pin-action');lock.append(b);const recover=this.textButton('Use recovery code','refresh',()=>this.recover(),'gx-link');lock.append(recover);this.body.append(lock);this.devicePicker(devices);return;}



  const deviceSection=el('section','gx-section');deviceSection.append(el('h2','gx-title','Device administration'),el('p','gx-copy','Switch phones, lend temporary access, or transfer ownership to a nearby player.'));const list=el('div','gx-list');for(const d of devices){const row=el('div','gx-row');const copy=el('div');copy.append(el('strong','',d.label||'Peak Duo'),el('span','',`${d.device_id} · ${d.access_type}${d.status!=='active'?' · '+d.status:''}`));row.append(copy);if(d.access_type==='owner'&&d.status==='lost')row.append(this.textButton('Restore','refresh',()=>this.mutate('Devices/status',{DeviceId:d.device_id,Status:'active'}),'gx-compact'));else if(!d.active){const choose=this.textButton('Use','check',()=>this.mutate('Devices/select',{DeviceId:d.device_id}),'gx-compact');choose.disabled=d.status!=='active';row.append(choose);}else row.append(el('span','gx-check','Active'));list.append(row);}deviceSection.append(list);const actions=el('div','gx-actions');actions.append(this.textButton('Lend','share',()=>this.nearby('lend'),'gx-secondary'),this.textButton('Transfer','swap',()=>this.nearby('transfer'),'gx-secondary'));if(active.access_type==='owner'&&active.status==='active')actions.append(this.textButton('Mark lost','lock',()=>this.confirm('Mark device lost','This immediately revokes active use until an owner restores it from another device or an administrator restores it.','Mark lost',()=>this.mutate('Devices/status',{DeviceId:active.device_id,Status:'lost'}),true),'gx-danger'));deviceSection.append(actions);const details=el('details','gx-device-details');details.append(el('summary','','Device administration'),deviceSection);this.body.append(details);
  const simSection=el('section','gx-section');simSection.append(el('h2','gx-title','SIM'),el('p','gx-copy','One physical SIM can be inserted in one device at a time.'));if(this.simProgress&&this.simProgress!=='complete')this.status(simSection,`SIM ${this.simProgress}…`,this.simProgress==='failed'?'error':'info');const activeSim=rows(s.Sims).find(x=>x.device_id===active.device_id);if(activeSim){const card=el('div','ps-sim-card'),mark=el('span','ps-sim-mark','▣'),copy=el('div','ps-sim-copy');copy.append(el('strong','',String(activeSim.phone_number||'SIM inserted')),el('small','',String(activeSim.sim_id||'')));card.append(mark,copy,el('span','gx-check','Active'));simSection.append(card);}else{const missing=el('div','gx-attention');missing.append(el('strong','','No SIM inserted'),el('p','gx-copy','Calls, Messages, Contacts and FaceTime are unavailable. Insert a carried SIM below to restore cellular apps.'));simSection.append(missing);}const available=rows(s.Sims).filter(x=>!x.device_id||x.device_id===active.device_id);if(available.length){const select=selectField('Available SIMs',available.map(x=>[x.sim_id,`${x.phone_number} · ${x.sim_id}`]),activeSim?.sim_id||available[0].sim_id);simSection.append(select.wrapper);const insert=this.textButton(activeSim?'Switch SIM':'Insert SIM','sim',()=>this.mutate('Devices/sim',{Action:'insert',SimId:select.input.value}),'nx-primary');insert.disabled=!!this.mutating;simSection.append(insert);}else if(!activeSim)simSection.append(el('p','gx-copy','Carry a SIM card to insert it. Blank SIMs can be inserted from your inventory.'));if(activeSim){const remove=this.textButton('Remove SIM','close',()=>this.confirm('Remove SIM','Calls, Messages, Contacts and FaceTime will be unavailable until another SIM is inserted.','Remove SIM',()=>this.mutate('Devices/sim',{Action:'remove'}),true),'gx-danger');remove.disabled=!!this.mutating;simSection.append(remove);}this.body.append(simSection);
  if(s.SimWarning)this.body.append(this.empty('SIM card pending',s.SimWarning,'sim'));
  const security=el('section','gx-section');security.append(el('h2','gx-title','Device lock'),el('p','gx-copy',active.has_pin?'Replace the PIN and generate a new one-time recovery code.':'Protect this device with a 4–6 digit PIN.'));const pin=pinEditor(this,security,active.has_pin?'New device PIN':'Device PIN');const set=this.textButton(active.has_pin?'Change PIN':'Set PIN','lock',()=>this.submit(set,async()=>{if(!/^\d{4,6}$/.test(pin.input.value))throw Error('Enter 4–6 digits.');const result=await this.data('Devices/setPin',{Generation:this.generation,PIN:pin.input.value});this.showRecovery(result.RecoveryCode);},security),'ps-pin-action');security.append(set);this.body.append(security);
  this.renderBackups(active);

 }

 renderBackups(active){if(active.access_type!=='owner')return;const section=el('section','gx-section');section.append(el('h2','gx-title','Backup and recovery'),el('p','gx-copy','Keep up to five backups of contacts and phone preferences. Restoring adds missing contacts without deleting your current contacts.'));

  const save=this.textButton('Back up now','check',()=>this.submit(save,async()=>{await this.data('Devices/backup',{Generation:this.generation,Preferences:this.preferences||{}});this.notify('Contacts and preferences backed up.');await this.load();},section),'nx-primary');section.append(save);

  for(const saved of rows(this.snapshot?.Backups)){const row=el('div','gx-row');row.append(el('span','',new Date(Number(saved.created_at)).toLocaleString()));row.append(this.textButton('Restore','refresh',()=>this.confirm('Restore backup','Add saved contacts and restore phone preferences. Your current contacts remain saved.','Restore',async()=>{await this.data('Devices/restore',{Generation:this.generation,BackupId:Number(saved.id)});this.notify('Backup restored.');await this.load();}),'gx-compact'));section.append(row);}
  const reset=this.textButton('Reset device','refresh',()=>{const title='Reset device',sheet=this.openSheet(title,{header:false});sheet.classList.add('cf-sheet','ps-reset-sheet');const done=settingsNav(this,sheet,title,'Reset',()=>this.submit(done,async()=>{if(confirm.input.value.trim()!=='RESET')throw Error('Type RESET exactly to continue.');await this.data('Devices/reset',{Generation:this.generation,Confirm:confirm.input.value.trim(),Preferences:this.preferences||{}});this.closeSheet();await this.load();},sheet));sheet.append(settingsContext(active.label||'Active device','contacts backup first · SIM and app accounts remain','lock'),el('p','cf-sheet-intro','The PIN and device preferences will reset after a contacts backup is saved.'));const confirm=settingTextField('Type RESET',{placeholder:'RESET',maxLength:5});sheet.append(confirm.wrapper);},'gx-danger');section.append(reset);this.body.append(section);
 }



 render(){

  for(const stop of this.sliderStops||[])stop();this.sliderStops=[];

  const active=rows(this.snapshot?.Devices).find(d=>d.active);if(active?.has_pin&&!active.unlocked)this.page='device';

  if(this.page==='device'){this.renderDevice();this.addBack();return;}

  const titles={home:'Settings',display:'Display & appearance',sound:'Sounds & Focus',notifications:'Notifications',input:'Input & accessibility',network:'Connectivity',apps:'Apps & storage',about:'About this phone'};

  this.frame(titles[this.page]||'Settings',this.page==='home'?'Make your Duo feel like yours.':'',[this.button('Refresh settings','refresh',()=>this.load(),'nx-header-action')]);

  this.addBack();

  if(this.page==='home'){

   if(this.error)this.status(this.body,this.error,'error');

   const identity=el('section','ps-identity');identity.append(el('span','ps-device-icon','P'),el('div','',rows(this.snapshot?.Devices).find(d=>d.active)?.label||'Peak Duo'));identity.append(el('small','',this.phoneSettings?.get().hasSim?'SIM connected':'No SIM inserted'));this.body.append(identity);

   const sections=[['display','Display & appearance','Icons, wallpaper and brightness','sun'],['sound','Sounds & Focus','Ringtone, silent mode and Do Not Disturb','speaker'],['notifications','Notifications','Messages, email and Y alerts','bell'],['input','Input & accessibility','Gameplay input, motion and glass','layers'],['network','Connectivity','Wi-Fi, cellular and privacy','wifi'],['apps','Apps & storage','Home Screen, app library and device data','app-store'],['device','Device & SIM','SIM, PIN, ownership, backup and recovery','lock'],['about','About this phone','Device identity and controls','phone']];

   const results=el('div','ps-category-list');const draw=query=>{results.replaceChildren();for(const [id,title,caption,glyph] of sections){if(query&&!`${title} ${caption}`.toLowerCase().includes(query.toLowerCase()))continue;const b=this.textButton(title,glyph,()=>this.navigate(id),'ps-category');const copy=el('span','ps-category-copy');copy.append(el('strong','',title),el('small','',caption));b.replaceChild(copy,b.querySelector('span'));b.append(el('span','ps-chevron','›'));results.append(b);}if(!results.childElementCount)results.append(this.empty('No matching settings','Try display, SIM or notifications.'));};

   this.body.append(this.search('Search settings',draw),results);draw('');return;

  }

  const local=this.phoneSettings?.get()||{};

  if(this.page==='display'){

   this.localSelect('Appearance','appearance',[['light','Light'],['dark','Dark'],['system','Automatic (system)']],local.appearance);

   this.section('Liquid Glass','Light and dark appearance apply across all apps. Automatic follows your system. Choose Glass with blur or Solid surfaces in Input & accessibility.');

   this.localSelect('Icon style','icons',[['color','Colored'],['clear','Transparent']],local.icons);

   this.localSelect('Wallpaper collection','accent',[['aurora','Aurora'],['tide','Tide'],['ember','Ember']],local.accent);
   const p=this.section('Custom wallpaper','Use an HTTPS image, or return to the wallpaper collection above.');const f=settingTextField('Wallpaper URL',{value:local.wallpaper==='duo/wallpaper.svg'?'':local.wallpaper||'',placeholder:'https://…'});p.append(f.wrapper);const b=this.textButton('Apply wallpaper','image',()=>this.submit(b,async()=>{const value=f.input.value.trim()||'duo/wallpaper.svg';if(value!=='duo/wallpaper.svg'){const url=new URL(value);if(url.protocol!=='https:')throw Error('Use an HTTPS image URL.');}await this.savePreference('Phone.Background',value);await this.phoneSettings.set('wallpaper',value);this.notify('Wallpaper updated.');},p),'nx-primary');p.append(b);
   const lp=this.section('Lock Screen wallpaper','Choose a separate image for your Lock Screen.');const lf=settingTextField('Lock Screen wallpaper URL',{value:local.lockWallpaper||'',placeholder:'https://…'});lp.append(lf.wrapper);const lb=this.textButton('Apply Lock Screen wallpaper','image',()=>this.submit(lb,async()=>{const value=lf.input.value.trim();if(value&&new URL(value).protocol!=='https:')throw Error('Use an HTTPS image URL.');await this.phoneSettings.set('lockWallpaper',value);this.notify('Lock Screen wallpaper updated.');},lp),'nx-primary');lp.append(lb);



   const brightness=this.section('Brightness','Applies to the display and the physical phone screen.');const slider=field('Display brightness',{type:'range',value:local.brightness});slider.input.min=20;slider.input.max=100;slider.input.step=1;slider.input.setAttribute('aria-label','Display brightness');const value=el('output','ps-range-value',`${local.brightness}%`);slider.input.addEventListener('input',()=>{value.textContent=slider.input.value+'%';this.phoneSettings.set('brightness',Number(slider.input.value));});this.sliderStops.push(bindVerticalSlider(slider.input,{vertical:false}));brightness.append(slider.wrapper,value);

   this.localSelect('Unfolded display','layout',[['full','Full screen'],['split','Split View']],local.layout);

   const ratio=selectField('Split View balance',[['0.35','More room on right'],['0.5','Equal'],['0.65','More room on left']],String(local.split));ratio.input.addEventListener('change',()=>this.phoneSettings.set('split',Number(ratio.input.value)));this.section('Split View').append(ratio.wrapper);

  }else if(this.page==='sound'){

   const ringtoneOptions=settingsRingtoneOptions(this.preferences?.RingtoneOptions).map(tone=>[tone.id,tone.label]);this.preferenceSelect('Ringtone','Phone.Ringtone',ringtoneOptions,ringtoneId(this.preferences?.['Phone.Ringtone']||'default'));

   this.localSelect('Silent mode','muted',[['false','Off'],['true','On']],String(local.muted),true);

   this.localSelect('Do Not Disturb','focus',[['false','Off'],['true','On']],String(local.focus),true);

   const volume=this.section('Media volume','Use the side buttons or Control Center to adjust audio across phone apps.');

   const slider=field('Phone media volume',{type:'range',value:local.volume??70});slider.input.min=0;slider.input.max=100;slider.input.step=1;slider.input.setAttribute('aria-label','Phone media volume');

   const value=el('output','ps-range-value',`${local.volume??70}%`);slider.input.addEventListener('input',()=>{value.textContent=slider.input.value+'%';this.phoneSettings.set('volume',Number(slider.input.value));});this.sliderStops.push(bindVerticalSlider(slider.input,{vertical:false}));volume.append(slider.wrapper,value);

  }else if(this.page==='notifications'){

   for(const [id,label] of [['Notifications.SMS','Messages'],['Notifications.Email','Email'],['Notifications.Tweet','Y']])this.preferenceSelect(label,id,[['true','On'],['false','Off']],String(this.preferences?.[id]!==false),true);

   this.preferenceSelect('Embedded images','Images.Embedded',[['true','Show'],['false','Hide']],String(this.preferences?.['Images.Embedded']!==false),true);

  }else if(this.page==='input'){
   this.preferenceSelect('Input while phone is open','Phone.DisableMovement',[['true','Cursor only'],['false','Walk with cursor']],String(this.preferences?.['Phone.DisableMovement']!==false),true);
   this.localSelect('Reduce motion','motion',[['false','Off'],['true','On']],String(local.motion),true);

   this.localSelect('Background transparency','transparency',[['regular','Glass with blur'],['reduced','Solid surfaces']],local.transparency);

   this.section('Keyboard controls','M opens the phone. E folds or unfolds. F6 switches cursor/gameplay mode. Escape dismisses panels or puts the phone away. Sliders support arrows, Home, End and Page Up/Down.');

  }else if(this.page==='network'){

   this.section('Wi-Fi',local.network?`Connected to ${local.network}`:'No network connected.').append(this.textButton('Choose network','wifi',()=>this.phoneSettings.connect(),'ps-link'));

   this.section('Cellular',local.hasSim?'A SIM is inserted. Calls and messages are available.':'Insert a SIM to use calls and messages.').append(this.textButton('Manage SIM','sim',()=>this.navigate('device'),'ps-link'));

   this.section('Privacy',local.vpn?'VPN access is available from your inventory.':'VPN access requires the supported inventory item.');

  }else if(this.page==='apps'){

   this.section('Home Screen','Choose favorites, arrange apps and edit the dock.').append(this.textButton('Customize Home Screen','layers',()=>this.openApp('homeedit'),'ps-link'));

   this.section('App library','Install or remove supported apps. Server permissions and required items still apply.').append(this.textButton('Open App Store','app-store',()=>this.openApp('store'),'ps-link'));

   this.section('Photos & recordings','Review saved photos and recordings from their apps.').append(this.textButton('Open Photos','image',()=>this.openApp('gallery'),'ps-link'),this.textButton('Voice Memos','mic',()=>this.openApp('voicememos'),'ps-link'));

   this.section('Device data','Back up contacts and preferences, restore a backup, or reset the device.').append(this.textButton('Backup & recovery','refresh',()=>this.navigate('device'),'ps-link'));

  }else if(this.page==='about'){

   const active=rows(this.snapshot?.Devices).find(d=>d.active);this.section('Peak Duo',active?.label||'Peak Studios foldable phone');this.section('Device identity',active?.device_id||'Device identity is unavailable.');this.section('Phone settings','Appearance and layout are stored on this client. Notifications, ringtone and gameplay input use saved phone preferences. Device and SIM operations are verified by the server.');

  }

 }

 navigate(page){this.page=page;this.render();this.body.scrollTop=0;queueMicrotask(()=>this.element.querySelector('.ps-back')?.focus());}

 addBack(){if(this.page==='home')return;const header=this.element.querySelector('.nx-header');header.prepend(this.textButton('Settings','back',()=>this.navigate('home'),'ps-back'));}

 section(title,copy=''){const section=el('section','gx-section ps-section');section.append(el('h2','gx-title',title));if(copy)section.append(el('p','gx-copy',copy));this.body.append(section);return section;}

 localSelect(label,key,options,selected,boolean=false){const section=this.section(label),control=selectField(label,options,selected);control.input.setAttribute('aria-label',label);control.wrapper.firstElementChild.remove();section.append(control.wrapper);control.input.addEventListener('change',async()=>{control.input.disabled=true;try{await this.phoneSettings.set(key,boolean?control.input.value==='true':control.input.value);}catch(e){control.input.value=String(this.phoneSettings.get()[key]);this.status(section,e.message,'error');}finally{control.input.disabled=false;}});}

 preferenceSelect(label,id,options,selected,boolean=false){const section=this.section(label),control=selectField(label,options,selected);control.input.setAttribute('aria-label',label);control.wrapper.firstElementChild.remove();section.append(control.wrapper);control.input.disabled=this.loading||!!this.error;control.input.addEventListener('change',async()=>{control.input.disabled=true;try{await this.savePreference(id,boolean?control.input.value==='true':control.input.value);this.notify(label+' updated.');}catch(e){const previous=this.preferences?.[id]??selected;control.input.value=String(id==='Phone.Ringtone'?ringtoneId(previous):previous);this.status(section,e.message,'error');}finally{control.input.disabled=false;}});if(this.loading)this.status(section,'Loading saved preferences…');else if(this.error)this.status(section,this.error,'error');}

 async savePreference(Id,Value){await this.checked('Phone/SetPreference',{Id,Value});this.preferences={...this.preferences,[Id]:Value};}

 $destroy(){window.removeEventListener('duo:appearance',this.appearanceListener);for(const stop of this.sliderStops||[])stop();super.$destroy();}



 devicePicker(devices){const section=el('section','gx-section');section.append(el('h2','gx-title','Choose a device'));for(const d of devices){if(d.active)continue;const b=this.textButton(`Use ${d.label||'Peak Duo'}`,'phone',()=>this.mutate('Devices/select',{DeviceId:d.device_id}),'gx-list-button');b.disabled=d.status!=='active';section.append(b);}this.body.append(section);}

 async mutate(event,data){if(this.mutating)return;this.mutating=true;if(event==='Devices/sim'){this.simProgress='preparing';this.render();}try{await this.data(event,{...data,Generation:this.generation});this.notify('Device identity updated.');await this.load();}catch(e){if(event==='Devices/sim'){this.simProgress='failed';this.render();}throw e;}finally{this.mutating=false;}}
 confirm(title,body,label,fn,danger=false){const panel=this.openSheet(title,{header:false});panel.classList.add('cf-sheet','cf-settings-confirm');const nav=el('header','cf-sheet-nav');nav.append(this.textButton('Cancel','',()=>this.closeSheet(),'cf-nav-leading'),el('h2','',title));const done=this.textButton(label,'',async()=>{await this.submit(done,async()=>{await fn();if(this.sheet?.panel===panel)this.closeSheet();},panel);},'cf-nav-trailing');nav.append(done);panel.append(nav);const summary=el('div','cf-context-row');summary.append(el('span','cf-confirm-mark',danger?'!':'✓'),el('span','cf-confirm-copy',body));panel.append(summary);return panel;}
 nearby(action){const lending=action==='lend',title=lending?'Lend device':'Transfer device',hours=Math.max(1,Number(this.snapshot?.LendingHours)||24),p=this.openSheet(title,{header:false});p.classList.add('cf-sheet','ps-device-action-sheet');const done=settingsNav(this,p,title,lending?'Lend':'Transfer',()=>this.submit(done,async()=>{const targetId=Number(target.input.value);if(!Number.isSafeInteger(targetId)||targetId<=0)throw Error('Enter a valid nearby player server ID.');await this.mutate('Devices/'+action,{Target:targetId});this.closeSheet();},p));p.append(settingsContext(this.snapshot?.Devices?.find?.(device=>device.active)?.label||'Active device',lending?`temporary access · ${hours} hours`:'ownership transfer','lock'));p.append(el('p','cf-sheet-intro',lending?`Grant temporary access to a nearby player for ${hours} hour${hours===1?'':'s'}. Your accounts and SIM identity do not transfer.`:'Transfer device ownership to a nearby player. The SIM is removed and private app accounts remain separately owned.'));const target=settingTextField('Nearby player server ID',{placeholder:'Server ID'});target.input.type='number';target.input.min='1';target.input.step='1';p.append(target.wrapper);}
 recover(){const title='Recover device',p=this.openSheet(title,{header:false});p.classList.add('cf-sheet','ps-recovery-sheet');const done=settingsNav(this,p,title,'Recover',()=>this.submit(done,async()=>{const value=code.input.value.trim();if(!value)throw Error('Enter the recovery code.');await this.mutate('Devices/recover',{Code:value});this.closeSheet();},p));p.append(settingsContext(this.snapshot?.Devices?.find?.(device=>device.active)?.label||'Active device','recovery clears its PIN and invalidates the current session','lock'));p.append(el('p','cf-sheet-intro','Enter the recovery code shown when the PIN was created.'));const code=settingTextField('Recovery code',{placeholder:'Recovery code'});p.append(code.wrapper);}
 showRecovery(code){const title='Save recovery code',p=this.openSheet(title,{header:false});p.classList.add('cf-sheet','ps-recovery-sheet');settingsNav(this,p,title,'Done',()=>{this.closeSheet();this.load();});p.append(settingsContext(this.snapshot?.Devices?.find?.(device=>device.active)?.label||'Active device','shown once · store it somewhere safe','lock'));p.append(el('p','cf-sheet-intro','This code is shown once and is never stored in plaintext.'));const value=el('code','gx-recovery',code||'');value.setAttribute('aria-label','One-time device recovery code');p.append(value);}
}
