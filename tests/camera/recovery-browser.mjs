export async function checkCameraRecovery() {
 const assert=(ok,message)=>{if(!ok)throw Error(message);};
 const settle=()=>new Promise(resolve=>setTimeout(resolve,500));
 const launch=()=>document.querySelector('.duo-pane[data-visible=true] .duo-app-button[data-app=camera] .duo-icon-tile').click();
 const transport=window.PeakPhoneTransport;
 const checks=[];
 try {
  if(PeakDuo.getState().camera){document.querySelector('[data-camera=exit]').click();await settle();}
  launch();await settle();
  document.querySelector('[data-camera=flip]').click();await settle();
  assert(document.querySelector('.duo-camera').dataset.facing==='front','Selfie confirmation');
  document.querySelector('[data-camera=flip]').click();await settle();
  assert(document.querySelector('.duo-camera').dataset.facing==='rear','Rear confirmation');
  checks.push('confirmed rear/selfie flips');
  for(const fail of [false,true]) {
   // A stale native callback may acknowledge without sending ShowCameraOverlay.
   window.PeakPhoneTransport=(event,data)=>event==='Phone/ExitCamera'
    ?(fail?Promise.reject(Error('mock exit failure')):Promise.resolve('Ok')):transport(event,data);
   document.querySelector('[data-camera=exit]').click();await settle();
   assert(!PeakDuo.getState().camera,'Shell cleared without native hidden message');
   assert(document.querySelector('.duo-camera').hidden,'Overlay hidden');
   assert(document.querySelector('.duo-pane[data-visible=true]'),'Launcher restored');
   launch();await settle();assert(PeakDuo.getState().camera,'Camera can reopen');
   checks.push(fail?'failed callback recovery and reopen':'stale callback recovery and reopen');
  }
  window.PeakPhoneTransport=transport;
  document.querySelector('[data-camera=exit]').click();await settle();
  assert(!PeakDuo.getState().camera,'Normal camera exit');
  const {CameraUI}=await import('/duo/camera-ui.mjs');
  let sent=false,exited=false;
  const recorder={status:'recording',elapsed:0,stop:()=>new Promise(()=>{}),cancel:()=>{}};
  const ui=new CameraUI({recorder,preview:true,send:async()=>{sent=true;return 'Ok';},onExit:()=>{exited=true;},notify:()=>{},openGallery:()=>{},target:document.body});
  try{ui.show(true);await ui.exit();assert(sent&&exited&&!ui.visible,'Recording finalizer cannot block native exit');}finally{ui.destroy();}
  checks.push('exit with pending video finalizer');
  return checks;
 } finally {window.PeakPhoneTransport=transport;}
}
