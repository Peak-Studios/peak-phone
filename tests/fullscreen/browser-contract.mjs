// Run through the collaborative browser against synthetic fixtures only.
export async function runFullscreenContract(){
 if(!PeakDuo.preview)throw Error('Synthetic preview required');
 const {APPS}=await import('/duo/catalog.mjs');const {previewOpen}=window.PeakDuo.previewAdapter;
 const results=[];const check=(ok,label)=>{if(!ok)throw Error(label);results.push(label);window.fullscreenChecks=results;window.fullscreenProgress=label;};
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 await PeakDuo.open();
 for(const app of APPS)PeakDuo.sendPreview({Action:'AppInstalled',AppId:app.id});
 PeakDuo.sendPreview({Action:'Duo/Capabilities',Capabilities:{jobcreator:{available:true}}});PeakDuo.sendPreview({Action:'SetCurrentNetwork',Network:'pdm'});
 const apps=APPS.filter(a=>!['camera','time-trials'].includes(a.id));
 for(const mode of ['folded','unfolded','split']){
  const expanded=mode!=='folded';if(PeakDuo.getState().workspace.expanded!==expanded){PeakDuo.fold();await wait(850);}PeakDuo.setLayout(mode==='split'?'split':'full');await wait(30);
  for(const {id} of apps){
   await PeakDuo.openApp(id);await wait(30);const pane=document.querySelector('.duo-pane[data-active=true]'),node=pane.querySelector('.duo-app-instance');check(node?.dataset.app===id,id+' opens '+mode);
   const p=pane.getBoundingClientRect(),a=node.getBoundingClientRect();check(Math.abs(a.top-p.top)<1&&Math.abs(a.bottom-p.bottom)<1&&Math.abs(a.width-p.width)<1,id+' fills pane '+mode);
   const surface=node.querySelector(':scope > .nx-app,:scope > .pm-app,:scope > .ios-store,:scope > .peak-jobs,:scope > .phone-app-wrapper');if(surface){const b=surface.getBoundingClientRect();check(Math.abs(b.top-p.top)<1&&Math.abs(b.bottom-p.bottom)<1,id+' surface fills pane '+mode);}
   check(node.scrollWidth<=node.clientWidth+1,id+' has no horizontal shell overflow '+mode);
  }
 }
 PeakDuo.sendPreview({...previewOpen(),HasPDRacingUsb:true,HasRacingUsb:false});await wait(500);await PeakDuo.openApp('time-trials');await wait(50);const pane=document.querySelector('.duo-pane[data-active=true]'),app=pane.querySelector('.duo-app-instance');check(app?.dataset.app==='time-trials','PD racing variant opens');check(Math.abs(app.getBoundingClientRect().height-pane.getBoundingClientRect().height)<1,'PD racing variant fills pane');
 await PeakDuo.openApp('settings');await wait(100);const root=document.getElementById('duo'),bank=root.querySelector('.duo-screenbank'),frame=document.createElement('iframe');frame.src='/duo/physical-screen.html?fullscreen-contract';const loaded=new Promise(r=>frame.onload=r);document.body.append(frame);await loaded;await wait(300);
 const {displaySnapshot,encodeDisplay}=await import('/duo/screen-capture.mjs');const expanded=PeakDuo.getState().workspace.expanded;frame.contentWindow.postMessage({type:'frame',frame:await encodeDisplay(displaySnapshot(bank,root,expanded))},'*');await wait(600);
 const doc=frame.contentDocument.querySelector(expanded?'#display':'#cover-display').contentDocument;const mirror=doc.querySelector('.duo-pane[data-active=true]'),surface=mirror.querySelector('.ps-settings');check(Math.abs(mirror.getBoundingClientRect().height-surface.getBoundingClientRect().height)<1,'physical model Settings paints full pane');check(doc.defaultView.getComputedStyle(surface).backgroundColor==='rgb(243, 245, 249)','physical model keeps Settings background');frame.remove();
 check(!PeakDuo.getState().errors.some(error=>error.app),'app sweep has no render failures');return {passed:results.length,results};
}
