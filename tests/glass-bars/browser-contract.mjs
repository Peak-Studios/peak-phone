// Run against the synthetic collaborative preview; no live player data required.
export async function runGlassBarsContract(){
 if(!PeakDuo.preview)throw Error('Synthetic preview required');
 const results=[],wait=ms=>new Promise(r=>setTimeout(r,ms));
 const ready=async selector=>{for(let i=0;i<40;i++){const node=document.querySelector('.duo-pane[data-active=true] '+selector);if(node?.getBoundingClientRect().width&&node.closest('.duo-app-instance')?.getBoundingClientRect().top<innerHeight)return;await wait(100);}throw Error('Surface did not settle: '+selector);};
 const check=(ok,label)=>{if(!ok)throw Error(label);results.push(label);window.glassProgress=label;};
 const fits=(child,parent)=>{const a=child.getBoundingClientRect(),b=parent.getBoundingClientRect();return a.width>0&&a.left>=b.left-1&&a.right<=b.right+1&&a.top>=b.top-1&&a.bottom<=b.bottom+1;};
 await PeakDuo.open();PeakDuo.sendPreview({Action:'AppInstalled',AppId:'y'});
 for(const mode of ['folded','unfolded','split']){
  if(PeakDuo.getState().workspace.expanded!==(mode!=='folded')){PeakDuo.fold();await wait(900);}PeakDuo.setLayout(mode==='split'?'split':'full');
  PeakDuo.home();await wait(750);
  const pane=document.querySelector('.duo-pane[data-active=true]'),search=pane.querySelector('.duo-search');
  check(!!search?.querySelector('.duo-dock-wallpaper'),'Home search wallpaper blur '+mode);
  check(fits(search,pane),'Home search fits '+mode);
  await PeakDuo.openApp('y');await wait(900);await ready('.nx-y-bottom .duo-surface-replica');
  const y=pane.querySelector('.nx-y'),nav=y.querySelector('.nx-y-bottom');
  check(!!nav?.querySelector('.duo-surface-replica'),'Y live blur '+mode);check(fits(nav,pane),'Y dock fits '+mode);
  check(getComputedStyle(nav.querySelector('.duo-surface-blur')).backgroundColor.startsWith('rgb('),'Y blur blocks sharp original '+mode);
  const buttons=[...nav.querySelectorAll(':scope > button')];check(buttons.length===5&&buttons.every(b=>fits(b,nav)),'All Y tabs fit '+mode);
  check(fits(y.querySelector('.nx-y-compose'),pane),'Y compose fits '+mode);
  buttons[1].click();await wait(400);check(!!y.querySelector('.nx-y-bottom > .duo-surface-blur'),'Y navigation retains blur '+mode);
  await PeakDuo.openApp('documents');await wait(900);await ready('.notes-filters .duo-surface-replica');
  const app=pane.querySelector('.duo-app-instance[data-app=documents]'),dock=app.querySelector('.notes-filters'),scroll=dock.closest('.glass-scroll');
  check(!!dock.querySelector(':scope > .duo-surface-blur > .duo-surface-replica'),'Documents live blur '+mode);
  check(getComputedStyle(dock.querySelector('.duo-surface-blur')).backgroundColor.startsWith('rgb('),'Documents blur blocks sharp original '+mode);
  check(fits(dock,pane),'Documents dock fits '+mode);
  const chips=[...dock.querySelectorAll(':scope > .notes-filter-chip')];check(chips.length===6&&chips.every(c=>fits(c,dock)),'All Documents filters fit '+mode);
  // Give the synthetic list enough content to exercise sticky positioning and replay.
  const spacer=document.createElement('div');spacer.style.height='1000px';scroll.append(spacer);scroll.scrollTop=120;await wait(450);
  const replica=dock.querySelector('.duo-surface-replica');check(replica.scrollTop===scroll.scrollTop,'Documents blur tracks scroll '+mode);
  check(fits(dock,pane),'Documents sticky dock fits '+mode);await wait(250);check(replica===dock.querySelector('.duo-surface-replica'),'Documents blur settles without scroll feedback '+mode);spacer.remove();
 }
 const root=document.getElementById('duo'),frame=document.createElement('iframe');frame.src='/duo/physical-screen.html?glass-contract';const loaded=new Promise(r=>frame.onload=r);document.body.append(frame);await loaded;await wait(400);
 const {displaySnapshot,encodeDisplay}=await import('/duo/screen-capture.mjs');
 frame.contentWindow.postMessage({type:'frame',frame:await encodeDisplay(displaySnapshot(root.querySelector('.duo-screenbank'),root,true))},'*');await wait(800);
 const doc=frame.contentDocument.querySelector('#display').contentDocument,replica=doc.querySelector('[data-app=documents] .duo-surface-replica');
 check(!!replica&&doc.defaultView.getComputedStyle(replica).filter.includes('blur'),'Physical model receives Documents blur');
 check(doc.defaultView.getComputedStyle(replica.parentElement).backgroundColor.startsWith('rgb('),'Physical Documents blur blocks sharp original');
 for(const app of ['y','home']){
  if(app==='home')PeakDuo.home();else await PeakDuo.openApp(app);await wait(700);if(app==='y')await ready('.nx-y-bottom .duo-surface-replica');
  frame.contentWindow.postMessage({type:'frame',frame:await encodeDisplay(displaySnapshot(root.querySelector('.duo-screenbank'),root,true))},'*');await wait(700);
  const mirror=frame.contentDocument.querySelector('#display').contentDocument,node=mirror.querySelector(app==='y'?'.nx-y-bottom .duo-surface-replica':'.duo-pane[data-active=true] .duo-search .duo-dock-wallpaper');
  check(!!node&&mirror.defaultView.getComputedStyle(node).filter.includes('blur'),'Physical model receives '+app+' blur');
  if(app==='y')check(mirror.defaultView.getComputedStyle(node.parentElement).backgroundColor.startsWith('rgb('),'Physical Y blur blocks sharp original');
 }
 frame.remove();
 check(!PeakDuo.getState().errors.some(e=>e.app),'No app render failures');return {passed:results.length,results};
}
