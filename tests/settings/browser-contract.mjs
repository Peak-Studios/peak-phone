// Execute in the collaborative browser on the synthetic phone preview only.
export async function runSettingsContract(){
 if(!window.PeakDuo?.preview)throw Error('Synthetic preview required');
 const {ringtoneSettingsFixture}=window.PeakDuo.previewAdapter;ringtoneSettingsFixture.options.splice(0,ringtoneSettingsFixture.options.length,{id:'garage-bell',label:'Garage Bell'},{id:'custom',label:'Unsafe generic option'},{id:'not safe',label:'Unsafe ID'}, {id:'duplicate',label:'Duplicate label'});
 const checks=[];const check=(condition,label)=>{if(!condition)throw Error(label);checks.push(label);window.settingsContractProgress=label;};
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 const app=()=>document.querySelector('.ps-settings');
 const category=name=>[...app().querySelectorAll('.ps-category')].find(b=>b.textContent.includes(name)).click();
 const back=()=>app().querySelector('.ps-back').click();
 const root=document.getElementById('duo');
 await PeakDuo.open();if(PeakDuo.getState().workspace.expanded)PeakDuo.fold();await wait(850);await PeakDuo.openApp('settings');await wait(600);
 for(const expanded of [false,true]){
  if(PeakDuo.getState().workspace.expanded!==expanded){PeakDuo.fold();await wait(850);}
  for(const page of ['Display & appearance','Sounds & Focus','Notifications','Input & accessibility','Connectivity','Apps & storage','Device & SIM','About this phone']){
   category(page);await wait(50);check(app().scrollWidth<=app().clientWidth,page+' fits '+(expanded?'unfolded':'folded'));check(app().querySelector('.gx-body').clientHeight>100,page+' owns usable scroll area');back();
  }
 }
 category('Display & appearance');const icons=app().querySelector('[aria-label="Icon style"]');const previous=icons.value;icons.value='clear';icons.dispatchEvent(new Event('change'));await wait(100);check(root.dataset.icons==='clear'&&JSON.parse(localStorage.getItem('peak-duo:icons'))==='clear','transparent icon style applied and persisted');icons.value=previous;icons.dispatchEvent(new Event('change'));await wait(100);back();
 category('Sounds & Focus');const ringtone=app().querySelector('[aria-label="Ringtone"]'),ringtoneLabels=[...ringtone.options].map(option=>option.textContent);check(ringtone.value==='default','legacy ringtone aliases display as their shipped tone');for(const label of ['Peak Classic','Chime','Seaside','Orbit','Pulse','Garage Bell'])check(ringtoneLabels.includes(label),'ringtone catalog includes '+label);check(!ringtoneLabels.includes('Still D.R.E.')&&!ringtoneLabels.includes('Unsafe generic option')&&!ringtoneLabels.includes('Unsafe ID'),'misleading and invalid ringtone options are excluded');ringtone.value='garage-bell';ringtone.dispatchEvent(new Event('change'));await wait(100);check(PeakDuo.requests.some(r=>r.event==='Phone/SetPreference'&&r.data.Id==='Phone.Ringtone'&&r.data.Value==='garage-bell'),'configured ringtone ID reaches saved preferences');ringtone.value='default';ringtone.dispatchEvent(new Event('change'));await wait(100);back();
 category('Notifications');const email=app().querySelector('[aria-label="Email"]');const before=email.value;email.value='false';email.dispatchEvent(new Event('change'));await wait(100);check(PeakDuo.requests.some(r=>r.event==='Phone/SetPreference'&&r.data.Id==='Notifications.Email'&&r.data.Value===false),'email preference reaches backend callback');email.value=before;email.dispatchEvent(new Event('change'));await wait(100);back();
 PeakDuo.setLayout('split');await wait(100);check(app().scrollWidth<=app().clientWidth,'Settings fits independent Split View pane');PeakDuo.setLayout('full');await wait(100);
 const iframe=document.createElement('iframe');iframe.src='/duo/physical-screen.html?settings-contract';const loaded=new Promise(r=>iframe.onload=r);document.body.append(iframe);await loaded;await wait(300);
 const {displaySnapshot,encodeDisplay}=await import('/duo/screen-capture.mjs');
 for(const expanded of [true,false]){
  if(PeakDuo.getState().workspace.expanded!==expanded){PeakDuo.fold();await wait(850);}PeakDuo.home('left');await wait(100);
  const pane=root.querySelector('.duo-pane[data-active=true]'),dock=pane.querySelector('.duo-dock'),wall=dock.querySelector('.duo-dock-wallpaper');
  check(getComputedStyle(wall).filter.includes('blur('),'dock blurs current wallpaper '+expanded);const a=wall.getBoundingClientRect(),b=pane.getBoundingClientRect();check(Math.abs(a.left-b.left)<2&&Math.abs(a.top-b.top)<2,'dock wallpaper aligns with live screen '+expanded);
  iframe.contentWindow.postMessage({type:'frame',frame:await encodeDisplay(displaySnapshot(root.querySelector('.duo-screenbank'),root,expanded))},'*');await wait(600);
  const doc=iframe.contentDocument.querySelector(expanded?'#display':'#cover-display').contentDocument,mirror=doc.querySelector('.duo-dock-wallpaper');check(!!mirror&&doc.defaultView.getComputedStyle(mirror).filter.includes('blur('),'model mirror has dock blur '+expanded);
 }
 iframe.remove();await PeakDuo.openApp('settings');return checks;
}
