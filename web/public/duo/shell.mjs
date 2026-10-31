import { createAppearance } from './appearance.mjs';
import { ContactShareService } from './contact-share.mjs';
import { createTransport } from './transport.mjs?rev=ios-contained-feedback-20261011a';
import { initialWorkspace, reduceWorkspace, sides, visibleApps, activeApp, isEditing, shouldFold, isPaneVisible } from './workspace.mjs';
import { orientationFrames } from './orientation-motion.mjs';
import { normalizeOrientation, visibleOrientation, toggleOrientation, splitRatioFromPointer } from './foldable-orientation.mjs';
import { APPS, DOCK, byId, availableApps, applyOwnerCatalog, catalogPresentationSignature } from './catalog.mjs?rev=owner-config-20261015';
import { setOwnerConfig } from './owner-config.mjs?rev=owner-config-20261015';
import { icon } from './icons.mjs?rev=owner-config-20261015';
import { appIcon } from './ios-icons.mjs?rev=owner-config-20261015';
import { PhoneApp } from './phone-app.mjs?rev=owner-config-20261015';
import { VehicleApp } from './vehicle-app.mjs?rev=owner-config-20261015';
import { SocialApp } from './social-app.mjs?rev=owner-config-20261015';
import { ContactsApp, CardApp, WenmoApp, YellowPagesApp } from './daily-apps.mjs?rev=owner-config-20261015';
import { CalculatorApp } from './calculator-app.mjs?rev=phone-f05-calculator-safe-area-20261016a';
import { BingeApp } from './community-apps.mjs?rev=owner-config-20261015';
import { KilogramApp } from './kilogram-app.mjs?rev=owner-config-20261015';
import { MusicApp } from './music-app.mjs?rev=owner-config-20261015';
import { MusicOverlay } from './music-overlay.mjs?rev=owner-config-20261015';
import { ShareDrop } from './sharedrop.mjs';
import { ControlCenter } from './control-center.mjs?rev=owner-config-20261015';
import { StoreApp } from './store-app.mjs?rev=owner-config-20261015';
import { JobCenterApp, JobCreatorApp } from './jobs-app.mjs';
import { decorateApp } from './presentation.mjs?rev=owner-config-20261015';
import { VideoService } from './video-service.mjs';
import { VideoApp } from './video-app.mjs?rev=owner-config-20261015';
import { CallUI } from './call-ui.mjs?rev=owner-config-20261015';
import { FoldMotion } from './fold-motion.mjs?rev=phone-performance-clock-20261011c';
import { RecordingStore } from './recording-store.mjs';
import { RecordingService } from './recording-service.mjs?rev=ios-fold-motion-quality-20261011b';
import { CameraUI } from './camera-ui.mjs?rev=owner-config-20261015';
import { MediaGalleryApp } from './media-gallery.mjs?rev=owner-config-20261015';
import { initWorldMemoPlayback } from './memo-world-player.mjs';
import { createPhoneVisibility } from './visibility.mjs';
import { displaySnapshot, createScreenCapture, createCaptureLifecycle, captureIdentityKey } from './screen-capture.mjs?rev=phone-performance-20261011e';
import { MapsApp, CalendarApp, ClockApp, VoiceMemosApp, HomeEditorApp } from './utilities-apps.mjs?rev=owner-config-20261015';
import { NotesApp } from './notes-app.mjs?rev=owner-config-20261015';
import { ServicesApp } from './services-app.mjs?rev=owner-config-20261015';
import { CryptoApp } from './crypto-app.mjs?rev=owner-config-20261015';
import { SettingsApp } from './settings-app.mjs?rev=owner-config-20261015';
import { LockScreen } from './lock-screen.mjs';
import { MessagesApp } from './messages-app.mjs?rev=owner-config-20261015';
import { MailApp } from './mail-app.mjs?rev=owner-config-20261015';
import { NativeNotifications, exactNotificationTarget } from './notifications.mjs?rev=closed-peek-20261007';
import { phoneMedia } from './media-output.mjs';
import { RingtonePlayer } from './ringtones.mjs';
import { ClockService } from './clock-service.mjs';
import { ClockAlertSurface } from './clock-alert.mjs';
import { WeatherApp } from './weather-app.mjs?rev=owner-config-20261015';
import { wallpaperInkRegions } from './wallpaper-ink.mjs';
import { playAppTransition } from './app-transition.mjs';
import { AppSwitcherHistory, cycleQuickSwitch, sanitizeAppPreview } from './app-switcher.mjs?rev=ios-switcher-redaction-20261010';
import { LegacyAppSheets, legacyEditorFixtures, mountLegacyHousingKeysPreview } from './legacy-app-sheets.mjs?rev=owner-config-20261015';
import { normalizeHomeLayout as normalizeHomePages, getHomePages, materializeHomePages, moveHomeItemToPage, moveHomeItemToDock, reorderHomeLayout, createHomeEdgeDwell, resolveHomeDropPage, enterHomeEdgeDwellAtBoundary } from './home-pages.mjs?rev=home-pages-20261008b';

const nuiHost = location.hostname.toLowerCase();
const resource = typeof window.GetParentResourceName === 'function'
  ? window.GetParentResourceName()
  : nuiHost.startsWith('cfx-nui-') ? nuiHost.slice('cfx-nui-'.length) : null;
if(!resource&&(location.protocol==='nui:'||location.hostname.startsWith('cfx-nui-')))throw Error('FiveM NUI identity is unavailable; refusing to show preview data in game.');
const preview = !resource;
const readPreference = (key, fallback) => { try { return JSON.parse(localStorage.getItem('peak-duo:' + key)) ?? fallback; } catch { return fallback; } };
const writePreference = (key, value) => { try { localStorage.setItem('peak-duo:' + key, JSON.stringify(value)); } catch { /* Session remains functional without local storage. */ } };
const previewAdapter = preview ? await import('./preview.mjs?rev=owner-config-20261015') : null;
const errors = [];
let feedbackGeneration=0;
function invalidateFeedback(){feedbackGeneration++;}
window.PeakPhoneTransport = createTransport({resource, preview: previewAdapter?.mockSend, captureContext:()=>feedbackGeneration, onError: detail => {
  errors.push({event:detail.event,message:detail.error.message,time:Date.now()});if(errors.length>50)errors.shift();
  window.dispatchEvent(new CustomEvent('duo:request-error',{detail}));
}});
const disposeWorldMemoPlayback=initWorldMemoPlayback(window.PeakPhoneTransport);
phoneMedia.configure(window.PeakPhoneTransport);
phoneMedia.observe(document);
// The retained feature library has no root component and performs no network requests at load.
if(!window.PeakPhoneLegacy) await new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.src='./build/duo-legacy.js';script.onload=resolve;script.onerror=()=>reject(Error('The app library could not be loaded. Verify the complete resource installation.'));document.head.append(script);
});
const legacy = window.PeakPhoneLegacy;
if(!legacy?.App)throw Error('Phone application bridge did not initialize');
const S = legacy.stores;
S.Brand.set('iOS');S.HasRacingUsb.set(false);S.HasPDRacingUsb.set(false);
let state = initialWorkspace(readPreference('expanded',false),readPreference('display-layout','full'));
state=reduceWorkspace(state,{type:'RATIO',value:readPreference('split-ratio',0.5)});
let orientation=normalizeOrientation(readPreference('orientation','landscape'));
let layoutMenu=false;
let visible=false,camera=false,modal=false,loading=false,center=false,muted=false,nearNetwork=false,networkEnabled=true,deviceLocked=false,hasSim=true;
let clock=[12,0],weather='EXTRASUNNY',unread={},identity='',serverKey='',deviceGeneration=null,openGeneration=0,notificationTargetGeneration=0,revision=0;
let typing=false,focusedBeforeModal=null,modalInstance=null,dropdownInstance=null,lastInputSpec=null,lastInteractedApp='';
let facetiming=false,documentGeneration=0;
const session=globalThis.crypto?.randomUUID?.() || String(Date.now())+'-'+Math.random();
const phonePeekSession=`${Date.now()}-${session}`;
const PHONE_PEEK_NOTIFICATION_MS=8000;
const phonePeekNotificationIds=new Map();
let phonePeekActive=false,phonePeekIdentityBlocked=false,phonePeekUntil=0,phonePeekTimer=null,phonePeekRevision=0,suppressedPeekCallId='',phonePeekCallId='',phonePeekCallUntil=0;
const apps=new Map();
const appHistory=new AppSwitcherHistory(8);
const appFocusTargets=new Map();
const appScrollPositions=new Map();
const appTransitions=new Map();
const closingTransitions=new Map();
let switcherOpen=false,switcherClosing=false,selectedRecentId=null,switcherReturnFocus=null,switcherAnimation=null,switcherCloseGeneration=0,switcherSelectionFrame=0,quickSwitchSequence=null;
const snapshots={ installed:{},vpn:false,racing:false,pdRacing:false,network:'',capabilities:{} };
const videoService=new VideoService({send:window.PeakPhoneTransport,notify:message=>toast(message)});
const queries={left:'',right:''};
const homePages={left:0,right:0};
const storeUnsubscribers=[];
let notificationTargetOpening=false;
const motionMedia=matchMedia('(prefers-reduced-motion: reduce)');
let reducedMotion=readPreference('reduced-motion',motionMedia.matches);
let accent=readPreference('accent','aurora');
if(!['aurora','tide','ember'].includes(accent))accent='aurora';
let defaultAppOrder=APPS.map(app=>app.id),defaultDock=[...DOCK];
const applyServerOwnerConfig=value=>{const config=setOwnerConfig(value);applyOwnerCatalog(config);defaultAppOrder=config.apps.defaults.order.length?[...config.apps.defaults.order]:APPS.map(app=>app.id);defaultDock=config.apps.defaults.dock.length?[...config.apps.defaults.dock]:[...DOCK];};
const normalizeHomeLayout=value=>normalizeHomePages(value,{knownIds:APPS.map(app=>app.id),defaultOrder:defaultAppOrder,defaultDock,hiddenIds:APPS.filter(app=>!app.builtin).map(app=>app.id),legacyCapacity:16});
let homeLayout=normalizeHomeLayout(null),homeStorageKey='';
const scopedHomeKey=()=>`peak-duo:home-layout:${encodeURIComponent(serverKey)}:${encodeURIComponent(identity)}`;
const loadHomeLayout=()=>{homeStorageKey=scopedHomeKey();let value=null;try{value=JSON.parse(localStorage.getItem(homeStorageKey));if(!value){const legacy=localStorage.getItem('peak-duo:home-layout');if(legacy){value=JSON.parse(legacy);localStorage.setItem(homeStorageKey,legacy);localStorage.removeItem('peak-duo:home-layout');}}}catch{}homeLayout=normalizeHomeLayout(value);};
const saveHomeLayout=value=>{const next=normalizeHomeLayout(value);try{localStorage.setItem(homeStorageKey||scopedHomeKey(),JSON.stringify(next));}catch{throw Error('Home layout could not be saved. Free device storage and try again.');}homeLayout=next;updateLauncher();};

const APP_DRAG_MIME='application/x-peak-duo-app',APP_DRAG_SOURCE_MIME='application/x-peak-duo-app-source-side';
const $=(selector,root=document)=>root.querySelector(selector);
const make=(tag,className='',text='')=>{const node=document.createElement(tag);node.className=className;if(text)node.textContent=text;return node;};
const button=(label,name,handler,className='')=>{const el=make('button','duo-button '+className);el.type='button';el.title=label;el.setAttribute('aria-label',label);el.innerHTML=icon(name);el.addEventListener('click',handler);return el;};

const root=make('main','duo-root');root.id='duo';root.hidden=true;root.inert=true;root.dataset.visible='false';root.dataset.peekCall='false';root.dataset.expanded=String(state.expanded);root.dataset.orientation=visibleOrientation(orientation,state.expanded);root.dataset.accent=accent;root.dataset.icons=readPreference('icons','color')==='clear'?'clear':'color';root.dataset.transparency=readPreference('reduce-transparency',false)?'reduced':'regular';
root.innerHTML=`<div class="duo-stage"><div class="duo-chassis"><div class="duo-hinge" aria-hidden="true"></div><div class="duo-hardware" aria-hidden="true"></div><div class="duo-screenbank"></div><div class="duo-spine" aria-hidden="true"></div></div><div class="duo-toolbar"><span class="duo-wordmark">PEAK <b>DUO</b></span><div class="duo-device-actions"></div></div></div>`;
const phoneVisibility=createPhoneVisibility(root,root.querySelector('.duo-stage'));
document.body.append(root);
const appearance=createAppearance({root,read:readPreference,write:writePreference,changed:()=>requestAnimationFrame(()=>{syncAppChrome();updateDockBlur();window.dispatchEvent(new Event('duo:appearance'));})});
const musicOverlay=new MusicOverlay({send:window.PeakPhoneTransport,stores:S,preview,openMusic:()=>{
 if(!visible){if(preview)onOpen(previewAdapter.previewOpen()).then(()=>openApp('peakify'));else request('Music/OpenPhone');}
 else openApp('peakify');
}});
const bank=$('.duo-screenbank',root),chassis=$('.duo-chassis',root),toolbar=$('.duo-device-actions',root);
const appSwitcher=make('section','duo-app-switcher');appSwitcher.hidden=true;appSwitcher.inert=true;appSwitcher.setAttribute('role','dialog');appSwitcher.setAttribute('aria-modal','true');appSwitcher.setAttribute('aria-label','App Switcher');
appSwitcher.innerHTML='<div class="duo-switcher-backdrop" data-switcher-dismiss></div><header class="duo-switcher-heading"><span class="duo-switcher-island" aria-hidden="true"></span><button type="button" class="duo-switcher-done" data-switcher-dismiss aria-label="Return to app">Done</button></header><div class="duo-switcher-track" role="list" aria-label="Recent apps"></div><p class="duo-switcher-empty" hidden>No recent apps</p><footer class="duo-switcher-footer"><button type="button" class="duo-switcher-home" aria-label="Return to Home"><span></span></button></footer>';
const switcherTrack=$('.duo-switcher-track',appSwitcher);
appSwitcher.addEventListener('pointerdown',()=>{appSwitcher.dataset.keyboardFocus='false';},true);
bank.append(appSwitcher);
let orientationTurnAnimation,orientationContentAnimations=[],orientationSnapshot,queuedOrientationFold=false;
const captureLifecycle=createCaptureLifecycle();
function clearOrientationTurn(preserveCurrent=false){
 const matrix=new DOMMatrixReadOnly(getComputedStyle(chassis).transform==='none'?undefined:getComputedStyle(chassis).transform);
 const rect=chassis.getBoundingClientRect();
 const pose=preserveCurrent?{angle:Math.atan2(matrix.b,matrix.a)*180/Math.PI,scaleX:Math.hypot(matrix.a,matrix.b),scaleY:Math.hypot(matrix.c,matrix.d),width:chassis.offsetWidth,height:chassis.offsetHeight,center:{x:rect.left+rect.width/2,y:rect.top+rect.height/2}}:null;
 if(!preserveCurrent)queuedOrientationFold=false;
 const active=orientationTurnAnimation;orientationTurnAnimation=null;
 if(active){active.onfinish=null;try{active.cancel();}catch{}}
 for(const animation of orientationContentAnimations)animation.cancel();orientationContentAnimations=[];
 orientationSnapshot?.remove();orientationSnapshot=null;
 root.classList.remove('duo-orientation-turning');delete root.dataset.orientationTurn;
 chassis.style.removeProperty('transform');chassis.style.removeProperty('filter');
 return pose;
}
function animateOrientationTurn(next,pose,snapshot){
 if(reducedMotion){clearOrientationTurn();return;}
 const rect=chassis.getBoundingClientRect(),width=chassis.offsetWidth,height=chassis.offsetHeight;
 const delta=next==='portrait'?90:-90,angle=pose.angle+delta;
 const frames=orientationFrames({angle,scaleX:pose.height*pose.scaleY/width,scaleY:pose.width*pose.scaleX/height,from:pose.center,to:{x:rect.left+rect.width/2,y:rect.top+rect.height/2},width,height,viewport:{width:innerWidth,height:innerHeight}});
 const duration=Math.max(1,620*Math.min(1,Math.abs(angle)/90));
 root.dataset.orientationTurn=next;root.classList.add('duo-orientation-turning');
 if(snapshot){
  const layer=document.createElement('div');layer.className='duo-orientation-copy';layer.setAttribute('aria-hidden','true');layer.inert=true;
  const copy=snapshot.node;copy.classList.remove('duo-fold-copy');
  copy.style.position='relative';copy.style.left='0';copy.style.top='0';copy.style.width=snapshot.width+'px';copy.style.height=snapshot.height+'px';copy.style.opacity='1';
  layer.style.width=snapshot.width+'px';layer.style.height=snapshot.height+'px';
  layer.style.transform=`translate(-50%,-50%) rotate(${-delta}deg) scale(${bank.offsetHeight/snapshot.width},${bank.offsetWidth/snapshot.height})`;
  layer.append(copy);chassis.append(layer);foldMotion.restoreScroll(snapshot.pairs);orientationSnapshot=layer;
  const timing={duration,fill:'both'};
  orientationContentAnimations=[bank.animate([{opacity:0},{opacity:0,offset:.55},{opacity:1,offset:.9},{opacity:1}],timing),layer.animate([{opacity:1},{opacity:1,offset:.55},{opacity:0,offset:.9},{opacity:0}],timing)];
 }
 const animation=chassis.animate(frames,{duration,easing:'linear',fill:'both'});orientationTurnAnimation=animation;
 animation.onfinish=()=>{if(orientationTurnAnimation===animation){const pending=queuedOrientationFold;clearOrientationTurn();if(pending)fold();}};
}
const powerScreen=make('div','duo-powered-off');powerScreen.hidden=true;powerScreen.setAttribute('role','status');powerScreen.setAttribute('aria-label','Phone is powered off');powerScreen.innerHTML=icon('power');bank.append(powerScreen);
const volumeHUD=make('div','duo-volume-hud');volumeHUD.hidden=true;volumeHUD.setAttribute('role','status');volumeHUD.setAttribute('aria-live','polite');volumeHUD.innerHTML=icon('speaker')+'<progress max="1"></progress><span></span>';chassis.append(volumeHUD);
let volumeHUDTimer;
function showVolume() {
 volumeHUD.querySelector('progress').value=phoneMedia.volume;volumeHUD.querySelector('span').textContent=Math.round(phoneMedia.volume*100)+'%';volumeHUD.hidden=false;
 clearTimeout(volumeHUDTimer);volumeHUDTimer=setTimeout(()=>volumeHUD.hidden=true,1500);
}
function volumeButton(label,glyph,direction,className) {
 const el=button(label,glyph,()=>{phoneMedia.step(direction);showVolume();},'duo-side-button '+className);
 let delay,repeat,suppress=false;
 const stop=()=>{clearTimeout(delay);clearInterval(repeat);};
 el.addEventListener('pointerdown',event=>{if(event.button!==0)return;stop();el.setPointerCapture(event.pointerId);suppress=false;delay=setTimeout(()=>{suppress=true;phoneMedia.step(direction);showVolume();repeat=setInterval(()=>{phoneMedia.step(direction);showVolume();},100);},350);});
 for(const event of ['pointerup','pointercancel','lostpointercapture','blur'])el.addEventListener(event,stop);
 el.addEventListener('click',event=>{if(suppress){event.stopImmediatePropagation();suppress=false;}},true);
 return el;
}
const powerButton=button('Turn phone off','power',()=>togglePower(),'duo-side-button duo-side-power');
chassis.append(volumeButton('Volume up','plus',1,'duo-volume-up'),volumeButton('Volume down','minus',-1,'duo-volume-down'),powerButton);
phoneMedia.addEventListener('error',event=>toast(event.detail.message));
function applyPowerDisplay() {
 root.dataset.powered=String(phoneMedia.powered);powerScreen.hidden=phoneMedia.powered;bank.inert=!phoneMedia.powered;
 powerButton.setAttribute('aria-label',phoneMedia.powered?'Turn phone off':'Turn phone on');powerButton.title=powerButton.getAttribute('aria-label');powerButton.setAttribute('aria-pressed',String(phoneMedia.powered));
}
let powerBusy=false;
async function togglePower() {
 if(powerBusy)return;powerBusy=true;powerButton.disabled=true;
 invalidateFeedback();
 clearToast();
 try{
 const on=!phoneMedia.powered;if(!on)clearOrientationTurn();if(!on)clearPhonePeek({suppressCall:true});phoneMedia.setPowered(on);applyPowerDisplay();
 if(!on){
  clearAppSwitcherSession();cancelAllAppTransitions();
  deviceLocked=true;notifications.setLocked(true);setHomeEditing(false);
  if(currentOpenData)currentOpenData={...currentOpenData,PlayerData:{...currentOpenData.PlayerData,DeviceLocked:true}};
  ++openGeneration;dismissOverlays();controlCenter.reset();setTyping(false);recorder.cancel();window.PeakDuoVoiceNotes?.cancel();
  if(camera)cameraUI.exit();
  for(const id of [...apps.keys()])destroyApp(id);
  state=reduceWorkspace(state,{type:'RESET'});
  videoService.setMuted(true);videoService.stop(null,'Phone powered off');
  renderWorkspace();
  if(callUI.state?.CallId)await callUI.end();
  const locked=await request('Devices/lock',{Generation:deviceGeneration});
  if(locked?.Success!==true)toast(locked?.Error||'Device lock could not be saved.');
 }else{
  videoService.setMuted(muted||focusMode);
  if(currentOpenData)await onOpen(currentOpenData);
  else renderWorkspace();
 }
 }finally{powerBusy=false;powerButton.disabled=false;}
}
const physicalScreen=preview?null:createScreenCapture({bank,isVisible:()=>!root.hidden&&((visible&&!captureLifecycle.blocked())||phonePeekActive),
 isExpanded:()=>state.expanded,getGeneration:captureLifecycle.generation,getDeviceGeneration:()=>deviceGeneration,isTurning:()=>!!orientationTurnAnimation,send:frame=>request('Phone/PhysicalScreenFrame',frame)});
let currentOpenData=null;
const lockScreen=new LockScreen({bank,send:(event,data)=>request(event,data),icon,onUnlock:()=>{
 deviceLocked=false;for(const pane of Object.values(panes))pane.inert=false;
 if(currentOpenData)onOpen({...currentOpenData,PlayerData:{...currentOpenData.PlayerData,DeviceLocked:false}}).catch(error=>toast(error.message));
}});
const foldMotion=new FoldMotion(root,bank,{onTransition:({expanded,reduced})=>{
 if(!preview&&visible&&!root.hidden)request('Phone/PhysicalScreenFold',{Expanded:expanded,ReducedMotion:reduced});
}});
const panes={};
const homeSwipeCancels={};
for(const side of sides){
 const pane=make('section','duo-pane');pane.dataset.side=side;pane.setAttribute('aria-label',side==='left'?'Left workspace':'Right workspace');
 pane.innerHTML=`<div class="duo-wallpaper" aria-hidden="true"></div><header class="duo-status"><span class="duo-clock">12:00</span><span class="duo-island" aria-hidden="true"></span><button type="button" class="duo-status-controls" aria-label="Open control center" title="Control center">${icon('signal')}${icon('wifi')}${icon('battery')}</button></header><div class="duo-launcher"><div class="duo-home-heading"><div><span class="duo-eyebrow">YOUR SPACE</span><h1>Good evening.</h1></div><button type="button" class="duo-profile" aria-label="Open my card">AM</button></div><div class="duo-widgets"><div class="duo-weather-widget"><div class="duo-widget-top"><span>Los Santos</span>${icon('sun')}</div><strong class="duo-weather-label">Clear skies</strong><span class="duo-weather-caption">A little room to breathe.</span><div class="duo-weather-art" aria-hidden="true"></div></div></div><label class="duo-search">${icon('search')}<input type="search" placeholder="Search your apps" autocomplete="off" spellcheck="false" aria-label="Search ${side} apps"><span>Search</span></label><div class="duo-home-viewport"><div class="duo-home-track" role="group" aria-label="Applications"></div></div><div class="duo-call-status-shelf" hidden></div><nav class="duo-page-dots" aria-label="Home screen pages"></nav><div class="duo-dock" role="group" aria-label="Favorite applications"></div></div><div class="duo-app-mount"></div><nav class="duo-multitask-control" aria-label="Workspace controls"><button type="button" class="duo-layout-handle" aria-label="Multitasking menu" title="Full screen or Split View">${icon('more')}</button></nav><footer class="duo-pane-navigation"><button type="button" class="duo-home-gesture" aria-label="Home on ${side}" title="Home · swipe up for apps"><span></span></button></footer>`;
 bank.append(pane);panes[side]=pane;
 pane.addEventListener('pointerdown',()=>{if(state.active!==side&&!modal&&!center)dispatch({type:'FOCUS',side});},true);
 const launcher=$('.duo-launcher',pane),viewport=$('.duo-home-viewport',pane),track=$('.duo-home-track',pane);let swipe=null;
 const finishSwipe=(event,cancelled=false)=>{
  if(!swipe||event?.pointerId!==swipe.id)return;
  const active=swipe;swipe=null;window.removeEventListener('pointermove',moveSwipe);window.removeEventListener('pointerup',endSwipe);window.removeEventListener('pointercancel',cancelSwipe);window.removeEventListener('blur',cancelHomeSwipe);
  if(active.moved){const pageWidth=viewport.clientWidth||1,dx=(event?.clientX??active.lastX)-active.x,elapsed=Math.max(1,(event?.timeStamp??performance.now())-active.startTime),velocity=Math.abs(dx)/elapsed,threshold=Math.max(38,pageWidth*.18);let direction=0;if(!cancelled&&active.axis==='x'&&(Math.abs(dx)>threshold||(Math.abs(dx)>20&&velocity>.48)))direction=dx<0?1:-1;const count=track.children.length,target=Math.max(0,Math.min(count-1,active.page+direction));setHomePage(side,target,{animate:!cancelled});}
  track.removeAttribute('data-swiping');
 };
 const moveSwipe=event=>{
  if(!swipe||event.pointerId!==swipe.id)return;
  if(homeEditing){finishSwipe(event,true);return;}
  const dx=event.clientX-swipe.x,dy=event.clientY-swipe.y;swipe.lastX=event.clientX;swipe.lastTime=event.timeStamp;
  if(!swipe.axis&&Math.hypot(dx,dy)>7)swipe.axis=Math.abs(dx)>Math.abs(dy)*1.2?'x':'y';
  if(swipe.axis==='y'){finishSwipe(event,true);return;}
  if(swipe.axis==='x'){
   swipe.moved=true;track.dataset.swiping='true';const pageWidth=viewport.clientWidth||1,base=-swipe.page*pageWidth,minimum=-(track.children.length-1)*pageWidth;let offset=base+dx;if(offset>0)offset*=.24;else if(offset<minimum)offset=minimum+(offset-minimum)*.24;track.style.transition='none';track.style.transform=`translate3d(${offset}px,0,0)`;
  }
 };
 const endSwipe=event=>finishSwipe(event,false),cancelSwipe=event=>finishSwipe(event,true);
 const cancelHomeSwipe=()=>{if(swipe)finishSwipe({pointerId:swipe.id,clientX:swipe.lastX,timeStamp:performance.now()},true);};homeSwipeCancels[side]=cancelHomeSwipe;
 launcher.addEventListener('pointerdown',event=>{if(event.button!==0||homeEditing||event.target.closest('.duo-dock,input,.duo-page-dots'))return;swipe={id:event.pointerId,x:event.clientX,y:event.clientY,lastX:event.clientX,startTime:event.timeStamp,lastTime:event.timeStamp,page:homePages[side],axis:null,moved:false};window.addEventListener('pointermove',moveSwipe,{passive:true});window.addEventListener('pointerup',endSwipe);window.addEventListener('pointercancel',cancelSwipe);window.addEventListener('blur',cancelHomeSwipe);});
 launcher.addEventListener('pointercancel',cancelHomeSwipe);
 window.addEventListener('pagehide',cancelHomeSwipe,{once:true});
 const done=button('Done editing apps','check',()=>setHomeEditing(false),'duo-home-done');done.textContent='Done';done.hidden=true;$('.duo-launcher',pane).prepend(done);
 const gesture=$('.duo-home-gesture',pane);let gestureStart=null,suppressHomeClickUntil=0,pauseTimer=0;
 gesture.addEventListener('click',event=>{if(event.detail&&performance.now()<suppressHomeClickUntil){event.preventDefault();event.stopImmediatePropagation();return;}setHomeEditing(false);void goHome(side);});
 $('.duo-profile',pane).addEventListener('click',()=>openApp('details',side));
 $('.duo-layout-handle',pane).addEventListener('click',()=>{dispatch({type:'FOCUS',side});toggleLayoutMenu();});
 gesture.addEventListener('pointerdown',event=>{if(event.button!==0||!visible||!phoneMedia.powered)return;clearTimeout(pauseTimer);gestureStart={id:event.pointerId,x:event.clientX,y:event.clientY,time:performance.now(),paused:false};try{gesture.setPointerCapture(event.pointerId);}catch{/* Synthetic and older CEF pointers can still complete on the handle. */}});
 gesture.addEventListener('pointermove',event=>{const start=gestureStart;if(!start||start.id!==event.pointerId)return;const upward=start.y-event.clientY;if(upward>Math.max(72,bank.clientHeight*.16)&&!start.paused&&!pauseTimer)pauseTimer=setTimeout(()=>{if(gestureStart===start)start.paused=true;},140);else if(upward<30){clearTimeout(pauseTimer);pauseTimer=0;}});
 gesture.addEventListener('pointerup',event=>{const start=gestureStart;if(!start||start.id!==event.pointerId)return;gestureStart=null;clearTimeout(pauseTimer);pauseTimer=0;const dx=event.clientX-start.x,upward=start.y-event.clientY;
  if((start.paused||upward>Math.max(150,bank.clientHeight*.34))&&upward>55){suppressHomeClickUntil=performance.now()+450;void openAppSwitcher();return;}
  if(Math.abs(dx)>36&&Math.abs(dx)>Math.abs(upward)*1.2){suppressHomeClickUntil=performance.now()+450;void quickSwitchRecent(dx>0?1:-1);return;}
  if(upward>55&&performance.now()-start.time>240){suppressHomeClickUntil=performance.now()+450;void openAppSwitcher();return;}
 });
 gesture.addEventListener('pointercancel',event=>{if(gestureStart?.id===event.pointerId)gestureStart=null;clearTimeout(pauseTimer);pauseTimer=0;});
 pane.addEventListener('dragover',e=>{if(e.dataTransfer?.types?.includes(APP_DRAG_MIME)){e.preventDefault();e.dataTransfer.dropEffect='move';pane.classList.add('duo-drop-target');}});
 pane.addEventListener('dragleave',e=>{if(!pane.contains(e.relatedTarget))pane.classList.remove('duo-drop-target');});
 pane.addEventListener('drop',e=>{pane.classList.remove('duo-drop-target');const transfer=e.dataTransfer;if(!transfer?.types?.includes(APP_DRAG_MIME))return;const id=transfer.getData(APP_DRAG_MIME);if(!byId[id])return;e.preventDefault();if(!allowedApps().some(app=>app.id===id))return;const rect=bank.getBoundingClientRect(),target=state.layout==='split'?side:(e.clientX<rect.left+rect.width/2?'left':'right'),destination=state.expanded?target:side,source=transfer.getData(APP_DRAG_SOURCE_MIME),targetButton=e.target?.closest?.('.duo-app-button'),targetSide=targetButton?.closest?.('.duo-pane')?.dataset.side;if(sides.includes(source)&&targetSide===source&&targetButton?.dataset.app===id)return;placeApp(id,destination);});
 $('.duo-status-controls',pane).addEventListener('click',()=>{dispatch({type:'FOCUS',side});toggleCenter();});
 $('.duo-search input',pane).addEventListener('input',event=>{queries[side]=event.target.value;renderApps(side);});
}
const swapButton=button('Swap workspaces','swap',()=>{if(!modal)dispatch({type:'SWAP'});});
const foldButton=button('Unfold phone (E)','fold',fold,'duo-fold-button');
foldButton.insertAdjacentHTML('beforeend','<span class="duo-fold-label">Unfold</span><kbd>E</kbd>');
const orientationButton=button('Portrait orientation','swap',()=>{
 if(root.classList.contains('duo-folding'))return;
 const previous=visibleOrientation(orientation,state.expanded),pose=clearOrientationTurn(true);
 const snapshot=reducedMotion?null:foldMotion.snapshot();
 if(snapshot){snapshot.width=bank.offsetWidth;snapshot.height=bank.offsetHeight;}
 orientation=toggleOrientation(orientation,state.expanded);const next=visibleOrientation(orientation,state.expanded);
 if(previous!==next)captureLifecycle.poseChanged();
 // Disable layout interpolation before committing the target pose; the FLIP
 // matrix presents exactly the previous rectangle on the same browser frame.
 if(!reducedMotion&&previous!==next)root.classList.add('duo-orientation-turning');
 writePreference('orientation',orientation);renderWorkspace();
 if(previous!==next)animateOrientationTurn(next,pose,snapshot);
},'duo-orientation-button');
orientationButton.setAttribute('aria-pressed','false');orientationButton.insertAdjacentHTML('beforeend','<span class="duo-orientation-label">Portrait</span>');orientationButton.hidden=true;
const layoutButton=button('Full screen or Split View','layers',toggleLayoutMenu,'duo-layout-button');
layoutButton.insertAdjacentHTML('beforeend','<span>Display</span>');
toolbar.append(layoutButton,swapButton,foldButton,orientationButton,button('Put phone away (Escape)','close',()=>closePhone(true),'duo-power'));

const divider=make('div','duo-split-divider');divider.setAttribute('role','separator');divider.tabIndex=0;divider.setAttribute('aria-label','Resize split view');divider.setAttribute('aria-orientation','vertical');divider.setAttribute('aria-valuemin','40');divider.setAttribute('aria-valuemax','60');divider.innerHTML='<span></span>';bank.append(divider);
let resizing=false;
divider.addEventListener('pointerdown',e=>{if(!state.expanded||state.layout!=='split')return;e.preventDefault();resizing=true;divider.setPointerCapture(e.pointerId);root.classList.add('duo-resizing');});
divider.addEventListener('pointermove',e=>{if(!resizing)return;const b=bank.getBoundingClientRect(),displayOrientation=visibleOrientation(orientation,state.expanded);state=reduceWorkspace(state,{type:'RATIO',value:splitRatioFromPointer(e,b,displayOrientation)});root.style.setProperty('--duo-split',state.ratio*100+'%');divider.setAttribute('aria-valuenow',String(Math.round(state.ratio*100)));});
const endResize=()=>{if(!resizing)return;resizing=false;root.classList.remove('duo-resizing');renderWorkspace();};
divider.addEventListener('pointerup',endResize);divider.addEventListener('pointercancel',endResize);divider.addEventListener('lostpointercapture',endResize);
divider.addEventListener('dblclick',()=>dispatch({type:'RATIO',value:0.5}));
divider.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home'].includes(e.key)){e.preventDefault();dispatch({type:'RATIO',value:e.key==='Home'?0.5:state.ratio+(e.key==='ArrowLeft'?-.05:.05)});}});
const parking=make('div','duo-parking');parking.hidden=true;parking.inert=true;root.append(parking);
const overlays=make('div','duo-overlays');overlays.innerHTML='<div class="duo-input-host" hidden></div><div class="duo-busy" hidden><div class="duo-spinner"></div><span>Working…</span></div><div class="duo-control-center" hidden></div><div class="duo-success" hidden></div>';bank.append(overlays);
const inputHost=$('.duo-input-host',root),busy=$('.duo-busy',root),control=$('.duo-control-center',root),success=$('.duo-success',root);
let focusMode=false;
const shareDrop=new ShareDrop({target:bank,send:window.PeakPhoneTransport,notify:toast});
const controlCenter=new ControlCenter({target:control,bank,shareDrop,read:readPreference,write:writePreference,music:musicOverlay,audio:phoneMedia,
 setAppearance:value=>appearance.set(value),
 getState:()=>({theme:root.dataset.theme,appearance:appearance.get(),time:clock.map(n=>String(n).padStart(2,'0')).join(':'),network:snapshots.network,hasSim,vpn:snapshots.vpn,focus:focusMode,muted}),
 close:({restoreFocus=true}={})=>{if(center)toggleCenter({restoreFocus});},power:togglePower,
 restoreFocus:()=>$('.duo-status-controls',focusedPane())?.focus({preventScroll:true}),
 openApp,network:connectNetwork,layout:toggleLayoutMenu,send:window.PeakPhoneTransport,
 setAlerts:async next=>{
  const version=controlCenter.resetVersion;
  const result=await window.PeakPhoneTransport('Phone/ToggleSounds',{State:next.muted||next.focus});
  if(result==null||result===false||result==='Error'||result.Success===false)throw Error('Alert mode could not be changed.');
  if(version!==controlCenter.resetVersion){request('Phone/ToggleSounds',{State:false});return;}
  focusMode=next.focus;muted=next.muted;root.dataset.focus=String(focusMode);notificationHost.setAttribute('aria-hidden',String(focusMode));
 }});
document.addEventListener('focusin',event=>{
 if(center&&!control.contains(event.target))control.querySelector('.cc-close')?.focus({preventScroll:true});
},true);
window.addEventListener('duo:appearance',()=>{if(controlCenter.open)controlCenter.updateButtons();});
const layoutSheet=make('div','duo-layout-sheet');layoutSheet.hidden=true;layoutSheet.setAttribute('role','dialog');layoutSheet.setAttribute('aria-label','Multitasking');layoutSheet.setAttribute('aria-modal','true');overlays.append(layoutSheet);
const notificationHost=make('div','duo-notification-host');notificationHost.id='duo-notifications';notificationHost.setAttribute('aria-live','polite');bank.append(notificationHost);
const globalOverlay=make('div','duo-global-overlays');globalOverlay.innerHTML='<div id="duo-dropdown"></div><div class="duo-image-preview" hidden></div>';document.body.append(globalOverlay);
const toastNode=make('div','duo-toast');toastNode.setAttribute('role','status');toastNode.setAttribute('aria-live','polite');toastNode.setAttribute('aria-atomic','true');toastNode.hidden=true;bank.append(toastNode);appearance.refresh();
const notifications=new NativeNotifications({
 target:notificationHost,send:window.PeakPhoneTransport,openTarget:openNotificationTarget,
 canInteract:()=>visible&&phoneMedia.powered&&!deviceLocked&&hasSim,
 appFor:id=>byId[id]||null,appIcon,icon,
 onChange:records=>{for(const id of phonePeekNotificationIds.keys())if(!records.has(id))phonePeekNotificationIds.delete(id);syncPhonePeek();},
});
const callUI=new CallUI({target:bank,service:videoService,send:window.PeakPhoneTransport,notify:toast,openApp,canFocus:()=>visible});
function sendPhonePeek(active,leaseMs=0){
 if(preview)return;
 request('Phone/PeekProp',{Active:!!active,LeaseMs:leaseMs,Session:phonePeekSession,Revision:++phonePeekRevision});
}
function syncPhonePeek(){
 const now=Date.now();let until=0,latestNotification=null;
 for(const [id,peekUntil] of phonePeekNotificationIds){
  const record=notifications.records.get(id);
  if(!record||record.expiresAt<=now||peekUntil<=now){phonePeekNotificationIds.delete(id);continue;}
  if(!latestNotification||record.sequence>latestNotification.sequence)latestNotification=record;
  until=Math.max(until,peekUntil);
 }
 for(const record of notifications.records.values())if(record.node)record.node.dataset.peekCurrent=String(record===latestNotification);
 const call=callUI.state,incoming=call?.Status==='ringing'&&call?.Incoming===true&&!deviceLocked&&call?.CallId!==suppressedPeekCallId;
 if(incoming){if(phonePeekCallId!==call.CallId){phonePeekCallId=call.CallId;phonePeekCallUntil=now+30000;}until=Math.max(until,phonePeekCallUntil);}
 else{phonePeekCallId='';phonePeekCallUntil=0;}
 root.dataset.peekCall=String(incoming&&phonePeekCallUntil>now);
 const shouldPeek=!visible&&phoneMedia.powered&&!phonePeekIdentityBlocked&&!!identity&&until>now;
 clearTimeout(phonePeekTimer);phonePeekTimer=null;
 const extended=shouldPeek&&until>phonePeekUntil;
 phonePeekUntil=shouldPeek?until:0;
 if(shouldPeek!==phonePeekActive){phonePeekActive=shouldPeek;renderWorkspace();sendPhonePeek(shouldPeek,shouldPeek?Math.min(60000,Math.max(1000,Math.ceil(until-now))):0);}
 else if(extended)sendPhonePeek(true,Math.min(60000,Math.max(1000,Math.ceil(until-now))));
 if(shouldPeek)phonePeekTimer=setTimeout(()=>{phonePeekTimer=null;syncPhonePeek();},Math.max(0,until-now));
}
function clearPhonePeek({suppressCall=false}={}){
 if(suppressCall&&callUI.state?.Status==='ringing')suppressedPeekCallId=callUI.state.CallId||'';
 phonePeekNotificationIds.clear();phonePeekCallId='';phonePeekCallUntil=0;root.dataset.peekCall='false';clearTimeout(phonePeekTimer);phonePeekTimer=null;phonePeekUntil=0;
 const changed=phonePeekActive;phonePeekActive=false;sendPhonePeek(false);
 if(changed)renderWorkspace();
}
callUI.addEventListener('change',()=>{queueMicrotask(()=>renderWorkspace());queueMicrotask(syncPhonePeek);});
videoService.addEventListener('change',()=>{const active=!!videoService.session||!!videoService.state;if(facetiming!==active){facetiming=active;queueMicrotask(()=>renderWorkspace());}});
const contactShareService=new ContactShareService({target:bank,send:window.PeakPhoneTransport,notify:toast});
const recordingStore=new RecordingStore();
const recorder=new RecordingService({store:recordingStore,preview,notify:message=>toast(message)});
let galleryAfterCamera=false;
const cameraUI=new CameraUI({recorder,preview,target:bank,send:(event,data)=>window.PeakPhoneTransport(event,data),onExit:()=>{camera=false;renderWorkspace();},notify:message=>toast(message),openGallery:()=>openApp('gallery')});
let toastTimer,successTimer;
function syncToastPlacement(){
 const content=control.querySelector('.cc-content'),grid=control.querySelector('.cc-grid');
 for(const pane of Object.values(panes))$('.duo-call-status-shelf',pane).hidden=true;
 const minimizedHomeCall=callUI.state&&!callUI.expanded&&state.panes[state.active]?.home;
 if(minimizedHomeCall){const shelf=panes[state.active]?.querySelector('.duo-call-status-shelf');if(shelf)shelf.hidden=false;}
 if(center&&controlCenter.open&&content&&grid){if(toastNode.parentElement!==content||toastNode.nextElementSibling!==grid)content.insertBefore(toastNode,grid);}
 else if(callUI.expanded){const screen=callUI.root?.querySelector('.pc-screen'),bottom=screen?.querySelector('.pc-bottom'),controls=bottom?.querySelector('.pc-controls');if(bottom&&controls&&toastNode.parentElement!==bottom)bottom.insertBefore(toastNode,controls);}
 else if(minimizedHomeCall&&!camera&&!modal&&!loading&&!layoutMenu&&!switcherOpen&&!switcherClosing&&!phonePeekActive){const shelf=panes[state.active]?.querySelector('.duo-call-status-shelf');if(shelf&&!toastNode.hidden&&toastNode.parentElement!==shelf)shelf.append(toastNode);}
 else if(toastNode.parentElement!==bank)bank.append(toastNode);
}
function clearToast(){clearTimeout(toastTimer);toastTimer=null;for(const animation of toastNode.getAnimations?.()||[])animation.cancel();toastNode.hidden=true;toastNode.textContent='';syncToastPlacement();}
function toast(text){
 if(!visible||!phoneMedia.powered||deviceLocked||phonePeekIdentityBlocked)return;
 for(const animation of toastNode.getAnimations?.()||[])animation.cancel();
 clearTimeout(toastTimer);
 const message=String(text??''),copied=/\bcopied\b/i.test(message);
 toastNode.textContent=message;toastNode.hidden=false;syncToastPlacement();
 if(copied){
  const reduceMotion=root.classList.contains('duo-reduced-motion')||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if(!reduceMotion&&typeof toastNode.animate==='function'){
   const animation=toastNode.animate([{opacity:.62},{opacity:1}],{duration:190,easing:'cubic-bezier(.2,.75,.25,1)'});
   animation.onfinish=()=>animation.cancel();
  }
 }
 toastTimer=setTimeout(()=>{toastNode.hidden=true;toastNode.textContent='';syncToastPlacement();},copied?1800:5500);
}
const clockRingtone=new RingtonePlayer({output:phoneMedia,onError:message=>toast(message)});
const clockService=new ClockService({storage:localStorage,output:phoneMedia,ringtone:clockRingtone,onError:message=>toast(message)});
const clockAlertSurface=new ClockAlertSurface({target:chassis,service:clockService,backgrounds:[bank,toolbar]});
function request(event,data={}) {return window.PeakPhoneTransport(event,data).catch(()=>null);}
function focusedPane(){return panes[state.active];}
function saveMotion(){root.classList.toggle('duo-reduced-motion',reducedMotion);writePreference('reduced-motion',reducedMotion);}
saveMotion();

function allowedApps(){const all=availableApps(snapshots);if(deviceLocked)return all.filter(a=>a.id==='settings');if(!hasSim)return all.filter(a=>['settings','camera','gallery','clock','weather','calculator','homeedit'].includes(a.id));return all;}
let homeEditing=false;
const removingHomeApps=new Set();
function setHomeEditing(value){
 homeEditing=value;root.classList.toggle('duo-home-editing',value);
 for(const cancel of Object.values(homeSwipeCancels))cancel?.();
 if(!value)cancelActiveHomeDrag?.();
 for(const pane of Object.values(panes))$('.duo-home-done',pane).hidden=!value;
}
async function removeHomeApp(item){
 if(item.builtin||removingHomeApps.has(item.id))return;
 removingHomeApps.add(item.id);
 try{
  if(item.builtin){saveHomeLayout({...homeLayout,hidden:[...homeLayout.hidden,item.id]});toast(item.name+' removed from Home Screen. Reset Layout in Home Screen settings to restore.');}
  else{
   const result=await window.PeakPhoneTransport('UninstallApp',{AppId:item.id});
   if(!result?.Success||!result.InstalledApps||result.InstalledApps[item.id])throw Error(result?.Message||'The server could not remove this app.');
   S.InstalledApps.update(value=>{const next={...value};delete next[item.id];return next;});dispatch({type:'REMOVE',app:item.id});
  }
 }catch(error){toast(error.message);}finally{removingHomeApps.delete(item.id);}
}
let activeHomeDrag=null;
function cancelActiveHomeDrag(){activeHomeDrag?.cancel?.();}
window.addEventListener('pagehide',cancelActiveHomeDrag);
function measureHomePageCapacity(track){
 const viewport=track?.parentElement,launcher=track?.closest('.duo-launcher'),wasHidden=Boolean(launcher?.hidden);
 const oldVisibility=launcher?.style.getPropertyValue('visibility')||'',oldVisibilityPriority=launcher?.style.getPropertyPriority('visibility')||'';
 if(wasHidden){launcher.hidden=false;launcher.style.setProperty('visibility','hidden');}
 let page=track?.firstElementChild,temporary=false;
 try{
  if(!page&&track){page=make('div','duo-app-grid');page.style.cssText=`position:absolute;visibility:hidden;left:0;top:0;width:${viewport?.clientWidth||1}px;height:${viewport?.clientHeight||1}px;`;track.append(page);temporary=true;}
  if(!page)return 16;
  const style=getComputedStyle(page),height=page.clientHeight||viewport?.clientHeight||track.clientHeight||1;
  const columns=Math.max(1,style.gridTemplateColumns.split(/\s+/).filter(Boolean).length);
  const rowHeight=parseFloat(style.gridAutoRows)||parseFloat(style.gridTemplateRows.split(/\s+/)[0])||window.innerHeight*.072;
  const rowGap=parseFloat(style.rowGap)||0,paddingTop=parseFloat(style.paddingTop)||0,paddingBottom=parseFloat(style.paddingBottom)||0;
  const rows=Math.max(1,Math.floor((height-paddingTop-paddingBottom+rowGap+.5)/(rowHeight+rowGap)));
  return columns*rows;
 }finally{
  if(temporary)page.remove();
  if(wasHidden){launcher.hidden=true;if(oldVisibility)launcher.style.setProperty('visibility',oldVisibility,oldVisibilityPriority);else launcher.style.removeProperty('visibility');}
 }
}
function visibleHomePageCount(pages,visibleIds){
 const visible=new Set(visibleIds);let last=-1;
 pages.forEach((page,index)=>{if(!page.length||page.some(id=>visible.has(id)))last=index;});
 return Math.max(1,last+1);
}
function updateHomePageDots(side,count){
 const pane=panes[side],dots=$('.duo-page-dots',pane);
 dots.replaceChildren(...Array.from({length:count},(_,index)=>{const dot=make('button','duo-page-dot');dot.type='button';dot.setAttribute('aria-label',`Page ${index+1} of ${count}`);dot.dataset.page=String(index);dot.setAttribute('aria-current',String(index===homePages[side]));dot.onclick=()=>setHomePage(side,index,{animate:true});return dot;}));
}
function positionHomeTrack(side,index,{animate=false}={}){
 const pane=panes[side],viewport=$('.duo-home-viewport',pane),track=$('.duo-home-track',pane),count=track?.children.length||1,width=viewport?.clientWidth||1;
 if(!track)return;
 track.style.width=`${width*count}px`;track.style.height='100%';
 for(const page of track.children){page.style.flex=`0 0 ${width}px`;page.style.width=`${width}px`;page.style.height='100%';}
 track.style.transition=animate?'transform 240ms cubic-bezier(.2,.72,.18,1)':'none';track.style.transform=`translate3d(${-index*width}px,0,0)`;
}
function setHomePage(side,index,{animate=false}={}){
 const pane=panes[side],track=$('.duo-home-track',pane),count=track?.children.length||1;
 homePages[side]=Math.max(0,Math.min(count-1,Math.floor(Number(index)||0)));
 if(track){positionHomeTrack(side,homePages[side],{animate});for(const [pageIndex,page] of [...track.children].entries()){const active=pageIndex===homePages[side];page.setAttribute('aria-hidden',String(!active));for(const item of page.querySelectorAll('.duo-app-button')){item.tabIndex=active?0:-1;for(const control of item.querySelectorAll('.duo-app-remove'))control.tabIndex=active?0:-1;}}}
 for(const dot of $('.duo-page-dots',pane).children)dot.setAttribute('aria-current',String(Number(dot.dataset.page)===homePages[side]));
 if(animate&&track){const activePage=homePages[side],finish=()=>{if(homePages[side]===activePage)track.style.transition='none';track.removeEventListener('transitionend',finish);};track.addEventListener('transitionend',finish);setTimeout(finish,280);}
}
function homeVisibleOrder(layout,apps){
 const allowed=new Set(apps.map(app=>app.id));
 return layout.order.filter(id=>allowed.has(id)&&!layout.dock.includes(id)&&!layout.hidden.includes(id));
}
const homeRenderSignatures=new Map();
const homeClockSeconds=new Map();
function renderApps(side){
 const pane=panes[side],viewport=$('.duo-home-viewport',pane),track=$('.duo-home-track',pane),dock=$('.duo-dock',pane);
 const available=allowedApps().filter(a=>!homeLayout.hidden.includes(a.id));const query=queries[side].trim().toLowerCase();
 const rank=new Map(homeLayout.order.map((id,index)=>[id,index]));available.sort((a,b)=>(rank.get(a.id)??999)-(rank.get(b.id)??999));
 const visibleOrder=homeVisibleOrder(homeLayout,available),capacity=measureHomePageCapacity(track);
 const basePages=getHomePages(homeLayout,capacity,visibleOrder);
 let pages=basePages;
 if(query){const matches=visibleOrder.filter(id=>byId[id]?.name.toLowerCase().includes(query));pages=[];for(let i=0;i<matches.length;i+=capacity)pages.push(matches.slice(i,i+capacity));if(!pages.length)pages=[[]];}
 const pageCount=query?pages.length:visibleHomePageCount(pages,visibleOrder);pages=pages.slice(0,pageCount);
 homePages[side]=Math.max(0,Math.min(pageCount-1,homePages[side]));
 // Navigation does not change the launcher. Keep its nodes, focus and handlers
 // unless the rendered catalog, badges, pagination or geometry actually changes.
 const signature=JSON.stringify([pages,homeLayout.dock,query,homePages[side],capacity,catalogPresentationSignature(),available.map(item=>[item.id,!!unread[item.id],snapshots.capabilities[item.id]?.available===false])]);
 const clockSecond=Math.floor(Date.now()/1000);
 if(!activeHomeDrag&&homeRenderSignatures.get(side)===signature){
  // The Clock tile reflects wall time. Refresh just that SVG rather than
  // rebuilding every icon, and retain any unread/remove controls around it.
  if(homeClockSeconds.get(side)!==clockSecond){
   const clockIcon=pane.querySelector('.duo-app-button[data-app="clock"] .ios-app-icon');
   if(clockIcon)clockIcon.outerHTML=appIcon(byId.clock);
   homeClockSeconds.set(side,clockSecond);
  }
  return;
 }
 if(activeHomeDrag?.side===side)activeHomeDrag.cancel?.();
 function render(item,docked=false,pageIndex=-1){
  const el=make('button','duo-app-button');el.type='button';el.dataset.app=item.id;if(pageIndex>=0)el.dataset.page=String(pageIndex);el.setAttribute('aria-label',item.name);el.title=item.name;el.dataset.unavailable=String(snapshots.capabilities[item.id]?.available===false);el.tabIndex=pageIndex===homePages[side]||pageIndex<0?0:-1;el.draggable=true;
  el.addEventListener('dragstart',event=>{if(homeEditing||!event.dataTransfer||!allowedApps().some(app=>app.id===item.id)){event.preventDefault();return;}event.dataTransfer.setData(APP_DRAG_MIME,item.id);event.dataTransfer.setData(APP_DRAG_SOURCE_MIME,side);event.dataTransfer.effectAllowed='move';});
  el.addEventListener('dragend',()=>{for(const pane of Object.values(panes))pane.classList.remove('duo-drop-target');});
  const badge=make('span','duo-icon-tile');badge.style.setProperty('--tile',item.color);badge.innerHTML=appIcon(item);el.append(badge);
  if(unread[item.id]){const dot=make('span','duo-unread');dot.setAttribute('aria-label','Unread');badge.append(dot);}
  if(!docked)el.append(make('span','duo-app-name',item.name));
  const remove=make('span','duo-app-remove','×');remove.setAttribute('role','button');remove.tabIndex=pageIndex===homePages[side]||pageIndex<0?0:-1;remove.setAttribute('aria-label','Remove '+item.name);
  remove.addEventListener('pointerdown',event=>event.stopPropagation());
  const removeClick=event=>{event.preventDefault();event.stopPropagation();if(homeEditing)removeHomeApp(item);};
  remove.addEventListener('click',removeClick);remove.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' ')removeClick(event);});if(!item.builtin)badge.append(remove);
  let press=null,timer=null,suppressClick=false,pressStartedOnIcon=false,pointerUpSeen=false;
  const stopEdge=()=>{if(!press)return;clearTimeout(press.edgeTimer);press.edgeTimer=null;press.dwell?.leave();};
  const removeTemporaryPage=()=>{
   if(!press?.temporaryPage)return;
   const {node,index,side:edgeSide}=press.temporaryPage;node.remove();press.temporaryPage=null;
   if(edgeSide==='left'&&homePages[side]>index)homePages[side]--;
   updateHomePageDots(side,track.children.length||1);setHomePage(side,press.startPage);
  };
  const cancel=({restorePage=true,discardTemporary=true}={})=>{
   if(!press){return;}clearTimeout(timer);press.dwell?.cancel();
   if(discardTemporary)removeTemporaryPage();
   if(restorePage&&!press.temporaryPage)setHomePage(side,press.startPage);
   press.ghost?.remove();press.ghost=null;el.style.removeProperty('visibility');el.classList.remove('duo-home-drag');
   if(activeHomeDrag===press)activeHomeDrag=null;press=null;
  };
  const moveGhost=event=>{if(!press?.ghost)return;press.ghost.style.left=`${event.clientX-press.offsetX}px`;press.ghost.style.top=`${event.clientY-press.offsetY}px`;};
  const createTemporaryPage=edge=>{
   if(!press?.moved||press.temporaryPage)return;
   const node=make('div','duo-app-grid');node.dataset.page='';node.setAttribute('role','group');node.setAttribute('aria-label','New Home Screen page');node.setAttribute('aria-hidden','true');
   const index=edge==='left'?0:track.children.length;track.insertBefore(node,track.children[index]||null);
   if(edge==='left'&&homePages[side]>=index)homePages[side]++;
   const target=edge==='left'?0:track.children.length-1;press.temporaryPage={node,index:target,side:edge};press.edgePage=target;press.edgeSide=edge==='left'?-1:1;
   updateHomePageDots(side,track.children.length);setHomePage(side,target,{animate:true});
  };
  const armEdgeDwell=direction=>{
   if(!press||press.temporaryPage)return;
   const pageIndex=homePages[side];
   if(press.dwell.pending&&press.edgeSide===direction&&press.edgePage===pageIndex)return;
   if(enterHomeEdgeDwellAtBoundary(press.dwell,pageIndex,direction,track.children.length,Boolean(press.temporaryPage))){press.edgeSide=direction;press.edgePage=pageIndex;}
  };
  const updateEdge=(event)=>{
   if(!press?.moved)return;
   const rect=viewport.getBoundingClientRect(),zone=Math.min(62,rect.width*.14),direction=event.clientX<rect.left+zone?-1:event.clientX>rect.right-zone?1:0;
   press.lastX=event.clientX;press.lastY=event.clientY;
   if(!direction){stopEdge();press.edgeSide=0;press.edgePage=homePages[side];return;}
   const nextPage=homePages[side]+direction;
   if(nextPage>=0&&nextPage<track.children.length){stopEdge();if(press.edgeSide!==direction||press.edgePage!==homePages[side]){setHomePage(side,nextPage,{animate:true});press.edgeSide=direction;press.edgePage=nextPage;}armEdgeDwell(direction);return;}
   armEdgeDwell(direction);
  };
  el.addEventListener('pointerdown',event=>{
   if(event.button!==0)return;
   press={side,x:event.clientX,y:event.clientY,lastX:event.clientX,lastY:event.clientY,id:event.pointerId,moved:false,startPage:homePages[side],startDocked:docked,edgeSide:0,edgePage:homePages[side],temporaryPage:null};suppressClick=false;pointerUpSeen=false;pressStartedOnIcon=badge.contains(event.target);
   press.dwell=createHomeEdgeDwell(edge=>{if(press?.id!==event.pointerId||!press.moved)return;const rect=viewport.getBoundingClientRect(),zone=Math.min(62,rect.width*.14),atEdge=edge==='left'?press.lastX<=rect.left+zone:press.lastX>=rect.right-zone;if(atEdge&&press.edgeSide===(edge==='left'?-1:1)&&press.edgePage===homePages[side])createTemporaryPage(edge);});
   press.cancel=cancel;
   activeHomeDrag=press;el.setPointerCapture(event.pointerId);
   timer=setTimeout(()=>{setHomeEditing(true);suppressClick=true;},500);
  });
  el.addEventListener('pointermove',event=>{
   if(!press||event.pointerId!==press.id)return;const distance=Math.hypot(event.clientX-press.x,event.clientY-press.y);
   if(!homeEditing){if(distance>8){suppressClick=true;cancel();}return;}
   if(distance>6){clearTimeout(timer);press.moved=true;suppressClick=true;el.classList.add('duo-home-drag');
    if(!press.ghost){const rect=el.getBoundingClientRect(),ghost=el.cloneNode(true);ghost.classList.remove('duo-home-drag');ghost.classList.add('duo-home-drag-ghost');ghost.setAttribute('aria-hidden','true');ghost.inert=true;ghost.tabIndex=-1;ghost.style.width=`${rect.width}px`;ghost.style.height=`${rect.height}px`;press.offsetX=press.x-rect.left;press.offsetY=press.y-rect.top;press.ghost=ghost;document.body.append(ghost);el.style.visibility='hidden';}
    moveGhost(event);updateEdge(event);
   }
  });
  el.addEventListener('pointerup',event=>{
   pointerUpSeen=true;
   if(press?.moved&&homeEditing){
    const current=press,point=document.elementFromPoint(event.clientX,event.clientY),pageTarget=point?.closest('.duo-page-dot');
    const target=point?.closest('.duo-app-button'),dockTarget=point?.closest('.duo-dock');
    const grid=point?.closest('.duo-app-grid');
    const dropPage=resolveHomeDropPage(track,grid,pageTarget?Number(pageTarget.dataset.page):homePages[side],current.temporaryPage);
    const targetPage=dropPage.pageIndex;
    const capacityNow=measureHomePageCapacity(track),visible=homeVisibleOrder(homeLayout,available);let next=null;
    if(dockTarget){
     const before=target&&dockTarget.contains(target)?target.dataset.app:null;
     next=moveHomeItemToDock(homeLayout,item.id,before,capacityNow,visible);
     if(!next){toast('The Dock holds four apps.');cancel();return;}
    }else if(pageTarget||(target&&target.dataset.app!==item.id)||current.startDocked||targetPage!==current.startPage||current.temporaryPage){
     next=moveHomeItemToPage(homeLayout,item.id,dropPage.targetPage,capacityNow,{before:target?.dataset.app!==item.id?target?.dataset.app:null,insertPageSide:dropPage.insertPageSide,visibleOrder:visible});
    }
    if(next){
     homePages[side]=Math.max(0,dropPage.targetPage);
     cancel({restorePage:false,discardTemporary:false});
     try{saveHomeLayout(next);}catch(error){homePages[side]=current.startPage;renderApps(side);toast(error.message);}
     return;
    }
   }
   cancel();
  });
  el.addEventListener('pointercancel',()=>{pressStartedOnIcon=false;pointerUpSeen=false;cancel();});
  el.addEventListener('lostpointercapture',()=>{if(!pointerUpSeen){pressStartedOnIcon=false;cancel();}});
  el.addEventListener('contextmenu',event=>{event.preventDefault();setHomeEditing(true);});
  el.addEventListener('click',event=>{
   const pointerIconClick=event.detail>0&&pressStartedOnIcon&&pointerUpSeen&&badge.contains(document.elementFromPoint(event.clientX,event.clientY));
   pressStartedOnIcon=false;pointerUpSeen=false;
   if(homeEditing||suppressClick){event.preventDefault();suppressClick=false;return;}
   if(event.detail>0&&!pointerIconClick)return;
   openApp(item.id,side,{launchElement:el});
  });return el;
 }
 track.replaceChildren();
 for(const [pageIndex,ids] of pages.entries()){
  const page=make('div','duo-app-grid');page.dataset.page=String(pageIndex);page.setAttribute('role','group');page.setAttribute('aria-label',`Applications, page ${pageIndex+1} of ${pageCount}`);page.setAttribute('aria-hidden',String(pageIndex!==homePages[side]));
  const items=ids.map(id=>byId[id]).filter(item=>item&&available.some(candidate=>candidate.id===item.id)&&!homeLayout.dock.includes(item.id));
  page.replaceChildren(...items.map(item=>render(item,false,pageIndex)));if(query&&!page.childElementCount)page.append(make('p','duo-empty','No matching apps.'));track.append(page);
 }
 positionHomeTrack(side,homePages[side]);updateHomePageDots(side,pageCount);
 dock.replaceChildren(...homeLayout.dock.map(id=>byId[id]).filter(a=>a&&available.some(item=>item.id===a.id)).map(a=>render(a,true,-1)));
 homeRenderSignatures.set(side,signature);
 homeClockSeconds.set(side,clockSecond);
}
// Tracks cache pixel widths, so reflow only after viewport geometry settles.
const homeViewportObservedSizes=new Map(),homeViewportAppliedSizes=new Map();
let homeGeometryRefreshTimer=0,homeGeometryRefreshFrame=0,homeGeometryRefreshForced=false;
function cancelHomeGeometryInteraction(side){homeSwipeCancels[side]?.();if(activeHomeDrag?.side===side)cancelActiveHomeDrag();}
function scheduleHomeGeometryRefresh(force=false){
 homeGeometryRefreshForced=homeGeometryRefreshForced||force;
 clearTimeout(homeGeometryRefreshTimer);
 const settleMs=typeof ResizeObserver==='function'?140:(reducedMotion?40:700);
 homeGeometryRefreshTimer=setTimeout(()=>{homeGeometryRefreshTimer=0;if(homeGeometryRefreshFrame)cancelAnimationFrame(homeGeometryRefreshFrame);homeGeometryRefreshFrame=requestAnimationFrame(refreshHomeGeometry);},settleMs);
}
function refreshHomeGeometry(){
 homeGeometryRefreshFrame=0;const force=homeGeometryRefreshForced;homeGeometryRefreshForced=false;const changed=[];
 for(const side of sides){
  const viewport=$('.duo-home-viewport',panes[side]),size={width:viewport?.clientWidth||0,height:viewport?.clientHeight||0};
  if(!size.width||!size.height){homeViewportAppliedSizes.delete(side);continue;}
  const previous=homeViewportAppliedSizes.get(side);if(!force&&previous&&Math.abs(previous.width-size.width)<.5&&Math.abs(previous.height-size.height)<.5)continue;
  homeViewportAppliedSizes.set(side,size);changed.push(side);
 }
 if(!changed.length)return;
 const explicitPages=Array.isArray(homeLayout.pages);
 for(const side of changed){
  cancelHomeGeometryInteraction(side);
  const track=$('.duo-home-track',panes[side]);homePages[side]=Math.max(0,Math.min((track?.children.length||1)-1,homePages[side]||0));
  positionHomeTrack(side,homePages[side]);
  if(!explicitPages||queries[side].trim())renderApps(side);
 }
 queueMicrotask(updateDockBlur);
}
const homeViewportResizeObserver=typeof ResizeObserver==='function'?new ResizeObserver(entries=>{
 let changed=false;
 for(const entry of entries){
  const side=entry.target.closest('.duo-pane')?.dataset.side;if(!sides.includes(side))continue;
  const size={width:entry.contentRect.width,height:entry.contentRect.height};
  if(!size.width||!size.height){homeViewportObservedSizes.delete(side);homeViewportAppliedSizes.delete(side);continue;}
  const previous=homeViewportObservedSizes.get(side);if(previous&&Math.abs(previous.width-size.width)<.5&&Math.abs(previous.height-size.height)<.5)continue;
  homeViewportObservedSizes.set(side,size);changed=true;cancelHomeGeometryInteraction(side);
 }
 if(changed)scheduleHomeGeometryRefresh();
}):null;
for(const side of sides)homeViewportResizeObserver?.observe($('.duo-home-viewport',panes[side]));
const dockWallpapers=new WeakMap();
function updateDockBlur(){
 const updates=[];
 for(const pane of Object.values(panes)){
  // These surfaces are not painted while an app owns the pane. Keep their
  // last aligned copy; the normal Home render refreshes it before painting.
  if($('.duo-launcher',pane).hidden)continue;
  const source=$('.duo-wallpaper',pane);if(!source)continue;
  const markup=source.outerHTML,width=pane.clientWidth,height=pane.clientHeight,p=pane.getBoundingClientRect(),scale=(width?p.width/width:1)||1;
  for(const dock of [$('.duo-dock',pane),$('.duo-search',pane)].filter(Boolean)){
   const d=dock.getBoundingClientRect();
   updates.push({dock,source,markup,width,height,left:-(d.left+dock.clientLeft*scale-p.left)/scale,top:-(d.top+dock.clientTop*scale-p.top)/scale});
  }
 }
 // Read every pane/surface before changing the DOM. Replacing a wallpaper
 // between geometry reads invalidates the whole phone's relational styles.
 for(const {dock,source,markup,width,height,left,top} of updates){
  let clip=$('.duo-dock-blur',dock);if(!clip){clip=make('div','duo-dock-blur');clip.setAttribute('aria-hidden','true');dock.prepend(clip);}
  let cached=dockWallpapers.get(dock);
  if(!cached||cached.markup!==markup){const wallpaper=source.cloneNode(true);wallpaper.classList.add('duo-dock-wallpaper');cached={markup,wallpaper,geometry:''};dockWallpapers.set(dock,cached);}
  const geometry=JSON.stringify([width,height,left,top]),wallpaper=cached.wallpaper;
  if(cached.geometry!==geometry){wallpaper.style.width=width+'px';wallpaper.style.height=height+'px';wallpaper.style.left=left+'px';wallpaper.style.top=top+'px';wallpaper.style.right='auto';wallpaper.style.bottom='auto';cached.geometry=geometry;}
  if(wallpaper.parentElement!==clip)clip.replaceChildren(wallpaper);
  }
}
function getPhoneSettings(){return {appearance:appearance.get(),theme:root.dataset.theme,icons:root.dataset.icons,accent,transparency:root.dataset.transparency,motion:reducedMotion,brightness:controlCenter.brightness,volume:Math.round(phoneMedia.volume*100),layout:state.layout,split:state.ratio,focus:focusMode,muted,network:snapshots.network,vpn:snapshots.vpn,hasSim,wallpaper:readStore(S.PhoneBackground),lockWallpaper:readPreference('lock-wallpaper:'+identity,'')};}
function readStore(store){let result;const off=store.subscribe(value=>result=value);off();return result;}
async function setPhoneSetting(key,value){
 if(key==='appearance')appearance.set(value);
 else if(['icons','accent','transparency'].includes(key))await saveHomeConfiguration({layout:homeLayout,appearance:{...getPhoneSettings(),[key]:value},wallpaperSelected:key==='accent'});
 else if(key==='motion'){reducedMotion=!!value;if(reducedMotion){clearOrientationTurn();cancelAllAppTransitions();}saveMotion();renderWorkspace();}
 else if(key==='brightness'){controlCenter.brightness=Math.max(20,Math.min(100,Number(value)));controlCenter.applyBrightness();writePreference('brightness',controlCenter.brightness);}
 else if(key==='volume')phoneMedia.setVolume(Number(value)/100);
 else if(key==='layout')setLayout(value);
 else if(key==='split')dispatch({type:'RATIO',value:Number(value)});
 else if(key==='wallpaper')S.PhoneBackground.set(value);
 else if(key==='lockWallpaper'){writePreference('lock-wallpaper:'+identity,value);lockScreen.setWallpaper(value);}
 else if(['focus','muted'].includes(key))await controlCenter.setAlerts({...getPhoneSettings(),[key]:!!value});
 else throw Error('Unknown phone setting.');
 queueMicrotask(updateDockBlur);
}

function syncAppChrome(){
 for(const pane of Object.values(panes)){
  const app=$('.duo-app-instance',pane);if(!app)continue;
  const surface=app.querySelector(':scope > .nx-app,:scope > .pm-app,:scope > .ios-store,:scope > .peak-jobs,:scope > .phone-app-wrapper')||app.firstElementChild||app;
  const style=getComputedStyle(surface),colors=[style.backgroundColor,style.backgroundImage,getComputedStyle(app).backgroundColor];
  let rgb=null;for(const color of colors){const match=[...color.matchAll(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/g)].find(m=>Number(m[4]??1)>.5);if(match&&Number(match[4]??1)>.5){rgb=match.slice(1,4).map(Number);break;}}
  pane.dataset.appInk=rgb&&rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722>145?'dark':'light';
 }
}

function updateLauncher(){for(const side of sides)renderApps(side);queueMicrotask(updateDockBlur);}
function updateClock(){
 const time=clock.map(n=>String(n??0).padStart(2,'0')).join(':');
 const centerTime=control.querySelector('.cc-time');if(centerTime)centerTime.textContent=time;
 const greeting=clock[0]<12?'Good morning.':clock[0]<18?'Good afternoon.':'Good evening.';
 for(const pane of Object.values(panes)){$('.duo-clock',pane).textContent=time;$('.duo-home-heading h1',pane).textContent=greeting;
  const rainy=['RAIN','THUNDER','CLEARING'].includes(weather);$('.duo-weather-label',pane).textContent=rainy?'Rainy skies':weather==='SNOW'||weather==='XMAS'?'Winter skies':weather==='FOGGY'?'A little mist':'Clear skies';
 }
}
function updateProfile(player){
 const name=String(player.CharName||player.Name||'').trim();const initials=name.split(/\s+/).filter(Boolean).slice(0,2).map(s=>s[0]).join('')||'P';
 for(const pane of Object.values(panes))$('.duo-profile',pane).textContent=initials;
}
async function saveHomeConfiguration({layout,appearance,wallpaperSelected=false}){
 const next=normalizeHomeLayout(layout);
 const nextAccent=['aurora','tide','ember'].includes(appearance?.accent)?appearance.accent:accent;
 const nextIcons=appearance?.icons==='clear'?'clear':'color';
 const nextTransparency=appearance?.transparency==='reduced'?'reduced':'regular';
 const replaceWallpaper=wallpaperSelected||nextAccent!==accent;
 const entries=[['home-layout',next],['accent',nextAccent],['icons',nextIcons],['reduce-transparency',nextTransparency==='reduced']];
 const previous=new Map();
 try{
  // Stage device writes before the server request. Roll back on quota / server failure.
  for(const [key] of entries){const storage=key==='home-layout'?(homeStorageKey||scopedHomeKey()):'peak-duo:'+key;previous.set(storage,localStorage.getItem(storage));}
  for(const [key,value] of entries)localStorage.setItem(key==='home-layout'?(homeStorageKey||scopedHomeKey()):'peak-duo:'+key,JSON.stringify(value));
  if(replaceWallpaper){
   const response=await window.PeakPhoneTransport('Phone/SetPreference',{Id:'Phone.Background',Value:'duo/wallpaper.svg'});
   if(response===false||response?.Success===false||response?.__phoneError)throw Error('The wallpaper preference could not be saved.');
  }
 }catch(error){
  for(const [key,value] of previous){try{if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);}catch{/* Storage itself may be unavailable. Keep the live layout unchanged. */}}
  throw Error('Home Screen changes were not applied. '+(error.message||'Check device storage and server connectivity.'));
 }
 homeLayout=next;accent=nextAccent;root.dataset.accent=accent;
 root.dataset.icons=nextIcons;root.dataset.transparency=nextTransparency;
 if(replaceWallpaper)S.PhoneBackground.set('duo/wallpaper.svg');
 updateLauncher();
}

let wallpaperSampleEpoch=0;
const wallpaperSamples=new WeakMap();
function paintWallpaperInk(pane,image,epoch){
 if(epoch!==wallpaperSampleEpoch||!pane.isConnected)return;
 const width=pane.clientWidth,height=pane.clientHeight;
 if(!width||!height)return;
 try{
  const canvas=document.createElement('canvas');canvas.width=32;canvas.height=Math.max(1,Math.round(32*height/width));
  const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)throw Error('Wallpaper sampling unavailable');
  context.fillStyle='#101117';context.fillRect(0,0,canvas.width,canvas.height);
  // Match the centered background-size:cover crop of the actual pane, which
  // changes between folded, full-width, and split layouts.
  const targetRatio=width/height,imageRatio=image.naturalWidth/image.naturalHeight;
  let sx=0,sy=0,sw=image.naturalWidth,sh=image.naturalHeight;
  if(imageRatio>targetRatio){sw=sh*targetRatio;sx=(image.naturalWidth-sw)/2;}
  else{sh=sw/targetRatio;sy=(image.naturalHeight-sh)/2;}
  context.drawImage(image,sx,sy,sw,sh,0,0,canvas.width,canvas.height);
  const regions=wallpaperInkRegions(context.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height);
  pane.dataset.wallpaperStatusInk=regions.status;pane.dataset.wallpaperHeadingInk=regions.heading;pane.dataset.wallpaperGridInk=regions.grid;
  pane.dataset.wallpaperFallback='false';
 }catch{pane.dataset.wallpaperFallback='true';}
}
const wallpaperResizeObserver=new ResizeObserver(entries=>{
 for(const {target:pane} of entries){const sample=wallpaperSamples.get(pane);if(sample)paintWallpaperInk(pane,sample.image,sample.epoch);}
});
for(const pane of Object.values(panes))wallpaperResizeObserver.observe(pane);
function sampleWallpaperInk(pane,src,epoch){
 // On a failed/cross-origin sample, use small opaque labels rather than guessing
 // whether a character's wallpaper is bright or dark.
 pane.dataset.wallpaperFallback='true';
 wallpaperSamples.delete(pane);
 pane.dataset.wallpaperStatusInk='dark';pane.dataset.wallpaperHeadingInk='dark';pane.dataset.wallpaperGridInk='dark';
 if(!src){pane.dataset.wallpaperFallback='false';pane.dataset.wallpaperGridInk='light';return;}
 const image=new Image();image.crossOrigin='anonymous';
 image.onload=()=>{
  if(epoch!==wallpaperSampleEpoch||!pane.isConnected)return;
  wallpaperSamples.set(pane,{image,epoch});paintWallpaperInk(pane,image,epoch);
 };
 image.onerror=()=>{if(epoch===wallpaperSampleEpoch&&pane.isConnected)pane.dataset.wallpaperFallback='true';};
 image.src=src;
}
function styleWallpaper(value){
 // Keep the new default. Respect custom URLs saved by the existing Settings app.
 const isDefault=!value||/defaultwallpaperphone\.png$/.test(value)||value==='duo/wallpaper.svg';
 let src=null;
 if(!isDefault && typeof value==='string' && !/[\u0000-\u001f]/.test(value)){
   try {const url=new URL(value,location.href);if(['https:','http:','nui:'].includes(url.protocol))src=url.href;}catch{}
 }
 const sampleEpoch=++wallpaperSampleEpoch;
 for(const pane of Object.values(panes)){
  const bg=$('.duo-wallpaper',pane);bg.style.backgroundImage=src?`linear-gradient(0deg,rgba(3,8,18,.35),rgba(3,8,18,.08)),url(${JSON.stringify(src)})`:'';
  bg.classList.toggle('duo-custom-wallpaper',!!src);
  sampleWallpaperInk(pane,src,sampleEpoch);
 }
}
function mountApp(id){
 if(apps.has(id))return apps.get(id);
 const node=make('div','duo-app-instance');node.dataset.app=id;node.setAttribute('aria-label',byId[id]?.name||id);parking.append(node);
 const entry={id,node,instance:null,failed:false,presented:false,hasBeenPresented:false};apps.set(id,entry);
 try {
  const capability=snapshots.capabilities[id];
  if(id==='jobcenter')entry.instance=new JobCenterApp({target:node,props:{send:window.PeakPhoneTransport,notify:toast}});
  else if(capability?.available===false){
    node.classList.add('duo-app-unavailable');node.append(make('h2','',byId[id]?.name||id),make('p','',capability.reason||'This integration is not configured on this server.'),make('code','','Administrator: phone_doctor'));
  }else if(id==='facetime')entry.instance=new VideoApp({target:node,props:{service:videoService,callUI,send:window.PeakPhoneTransport,preview,notify:toast}});
  else if(id==='weather'){node.classList.add('nx-native-host');entry.instance=new WeatherApp({target:node,props:{send:window.PeakPhoneTransport,notify:toast,openApp,preview,context:{server:serverKey,identity},isActive:()=>entry.presented&&!entry.node.hidden&&!entry.node.inert&&visible&&phoneMedia.powered&&!document.hidden&&appSwitcher.hidden&&!camera}});}
  else if(['maps','calendar','clock','voicememos','settings'].includes(id)){node.classList.add('nx-native-host');const App={maps:MapsApp,calendar:CalendarApp,clock:ClockApp,voicememos:VoiceMemosApp,settings:SettingsApp}[id];entry.instance=new App({target:node,props:{send:window.PeakPhoneTransport,stores:S,notify:toast,openApp,preview,context:{server:serverKey,identity},clockService,phoneSettings:{get:getPhoneSettings,set:setPhoneSetting,connect:connectNetwork}}});}
  else if(id==='homeedit'){node.classList.add('nx-native-host');entry.instance=new HomeEditorApp({target:node,props:{send:window.PeakPhoneTransport,notify:toast,catalog:byId,openApp,getAvailableApps:()=>allowedApps(),getPageCapacity:()=>measureHomePageCapacity($('.duo-home-track',panes[state.active])),getLayout:()=>structuredClone(homeLayout),getDefaultLayout:()=>({order:[...defaultAppOrder],dock:[...defaultDock]}),setLayout:saveHomeLayout,getAppearance:()=>({accent,icons:root.dataset.icons,transparency:root.dataset.transparency}),commitChanges:saveHomeConfiguration,context:{server:serverKey,identity}}});}
  else if(['calls','vehicles','y','contacts','details','wenmo','yellowpages','calculator','kilogram','binge'].includes(id)){node.classList.add('nx-native-host');const App={calls:PhoneApp,vehicles:VehicleApp,y:SocialApp,contacts:ContactsApp,details:CardApp,wenmo:WenmoApp,yellowpages:YellowPagesApp,calculator:CalculatorApp,kilogram:KilogramApp,binge:BingeApp}[id];entry.instance=new App({target:node,props:{send:window.PeakPhoneTransport,stores:S,notify:toast,openApp,context:{server:serverKey,identity}}});
   if(id==='kilogram'&&preview&&new URLSearchParams(location.search).has('kilogram')&&new URLSearchParams(location.search).has('gift'))entry.instance.live.session={id:91,token:'fixture',role:'viewer',info:{author:{name:'Jordan Lee'}}};
  }
  else if(id==='peakify')entry.instance=new MusicApp({target:node,props:{send:window.PeakPhoneTransport,stores:S,notify:toast}});
  else if(id==='gallery')entry.instance=new MediaGalleryApp({target:node,props:{legacy,store:recordingStore,owner:()=>recorder.owner,notify:toast,send:(event,data)=>window.PeakPhoneTransport(event,data)}});
  else if(id==='messages'){node.classList.add('nx-native-host');entry.instance=new MessagesApp({target:node,props:{send:window.PeakPhoneTransport,stores:S,notify:toast,openApp,context:{server:serverKey,identity}}});}
  else if(id==='mails'){node.classList.add('nx-native-host');entry.instance=new MailApp({target:node,props:{send:window.PeakPhoneTransport,notify:toast,context:{server:serverKey,identity}}});}
  else if(id==='store')entry.instance=new StoreApp({target:node,props:{send:window.PeakPhoneTransport,stores:S,canInstall:appId=>snapshots.capabilities?.[appId]?.ownerAccess!==false}});
  else if(id==='documents'){node.classList.add('nx-native-host');entry.instance=new NotesApp({target:node,props:{send:window.PeakPhoneTransport,stores:S,notify:toast,openApp,context:{server:serverKey,identity},isActive:()=>entry.presented&&!entry.node.hidden&&!entry.node.inert&&visible&&phoneMedia.powered&&!deviceLocked&&!document.hidden&&appSwitcher.hidden&&!camera&&!entry.node.closest('.duo-pane')?.inert}});}
  else if(id==='services'){node.classList.add('nx-native-host');entry.instance=new ServicesApp({target:node,props:{send:window.PeakPhoneTransport,notify:toast,openApp,preview,context:{server:serverKey,identity},getCallCapability:()=>preview?{available:true,reason:'Synthetic browser preview; live calls are unavailable.'}:snapshots.capabilities?.calls||{available:false,reason:'An active SIM and voice calling are required.'}}});}
  else if(id==='crypto'){node.classList.add('nx-native-host');entry.instance=new CryptoApp({target:node,props:{send:window.PeakPhoneTransport,stores:S,notify:toast,preview,context:{server:serverKey,identity}}});}
  else if(id==='jobcreator')entry.instance=new JobCreatorApp({target:node,props:{send:window.PeakPhoneTransport,notify:toast}});
  else entry.instance=new legacy.App({target:node,props:{App:id}});
  entry.disposePresentation=decorateApp(node,id);
 }
 catch(error){appFailure(entry,error);}
 return entry;
}
function appFailure(entry,error){
 entry.disposePresentation?.();entry.disposePresentation=null;
 errors.push({app:entry.id,message:error.message,time:Date.now()});
 try{entry.instance?.$destroy();}catch{}entry.instance=null;entry.failed=true;entry.node.replaceChildren();
 const msg=make('div','duo-app-failure');msg.append(make('h2','','This app needs attention.'),make('p','',`${byId[entry.id]?.name||entry.id} could not render. Your other workspace is still available.`));
 const reload=make('button','duo-retry','Reload this app');reload.addEventListener('click',()=>{destroyApp(entry.id);renderWorkspace();});msg.append(reload);entry.node.append(msg);
 console.error('[Peak Duo] App:',entry.id,error);
}
function destroyApp(id){
 appFocusTargets.delete(id);
 appScrollPositions.delete(id);
 if(id==='messages')window.PeakDuoVoiceNotes?.cancel();
 const entry=apps.get(id);if(!entry)return;
 entry.disposePresentation?.();
 try{entry.instance?.$destroy();}catch(error){console.warn('[Peak Duo] Cleanup:',id,error);}
 entry.node.remove();apps.delete(id);
}
function appLaunchOrigin(element){
 const tile=element?.matches('.duo-app-button')?$('.duo-icon-tile',element):element;
 if(!tile)return null;
 const rect=tile.getBoundingClientRect();
 if(rect.width<=0||rect.height<=0)return null;
 return {left:rect.left,top:rect.top,width:rect.width,height:rect.height,borderRadius:getComputedStyle(tile).borderRadius};
}
function launcherAppOrigin(side,id){
 const pane=panes[side],launcher=$('.duo-launcher',pane),wasHidden=launcher.hidden;
 launcher.hidden=false;
 const button=[...pane.querySelectorAll('.duo-app-button')].find(node=>node.dataset.app===id);
 const origin=button?appLaunchOrigin(button):null;
 launcher.hidden=wasHidden;
 return origin;
}
function captureRecentPreview(id){
 if(!visible||!phoneMedia.powered||camera||!apps.has(id))return '';
 try{
  const app=apps.get(id)?.node;if(!app?.isConnected||app.hidden)return '';
  const style=getComputedStyle(app);if(style.display==='none'||style.visibility==='hidden'||Number(style.opacity)===0)return '';
  const snapshot=displaySnapshot(app,root,state.expanded),template=document.createElement('template');template.innerHTML=snapshot.html;
  const node=template.content.firstElementChild;
  if(!node?.matches('.duo-app-instance'))return '';
  node.dataset.switcherWidth=String(app.clientWidth);node.dataset.switcherHeight=String(app.clientHeight);
  return sanitizeAppPreview(node,location.href);
 }catch(error){console.warn('[Peak Duo] App preview:',id,error.message);return '';}
}
function rememberRecentApp(id){
 if(!id||id==='home'||!byId[id])return [];
 const preview=captureRecentPreview(id)||appHistory.preview(id);
 return appHistory.remember(id,preview);
}
function captureAppScroll(id,node){
 if(!id||!node||appScrollPositions.has(id))return;
 const positions=[node,...node.querySelectorAll('*')].filter(element=>element.scrollTop||element.scrollLeft).map(element=>({element,left:element.scrollLeft,top:element.scrollTop}));
 if(positions.length)appScrollPositions.set(id,positions);
}
function restoreAppScroll(id,node){
 const positions=appScrollPositions.get(id);if(!positions)return;
 requestAnimationFrame(()=>{if(appScrollPositions.get(id)!==positions||!node.isConnected||node.hidden)return;for(const position of positions)if(position.element.isConnected&&node.contains(position.element)){position.element.scrollLeft=position.left;position.element.scrollTop=position.top;}appScrollPositions.delete(id);});
}
function cancelSwitcherAnimation(){if(!switcherAnimation)return;const active=switcherAnimation;switcherAnimation=null;try{active.cancel();}catch{}}
function syncSwitcherBackdrop(){
 const backdrop=$('.duo-switcher-backdrop',appSwitcher);backdrop.querySelector('.duo-switcher-wallpaper')?.remove();
 const source=$('.duo-wallpaper',panes[state.active])||$('.duo-wallpaper',panes.left);if(!source)return;
 const wallpaper=source.cloneNode(false);wallpaper.classList.add('duo-switcher-wallpaper');wallpaper.setAttribute('aria-hidden','true');backdrop.prepend(wallpaper);
}
function clearAppSwitcherSession(){
 appHistory.clear();appFocusTargets.clear();appScrollPositions.clear();quickSwitchSequence=null;
 switcherOpen=false;switcherClosing=false;++switcherCloseGeneration;selectedRecentId=null;switcherReturnFocus=null;cancelSwitcherAnimation();
 cancelSwitcherInteractions();
 switcherTrack.replaceChildren();appSwitcher.hidden=true;appSwitcher.inert=true;appSwitcher.setAttribute('aria-hidden','true');root.dataset.switcher='false';
}
function animateSwitcher(opening,onfinish=()=>{}){
 cancelSwitcherAnimation();if(reducedMotion||typeof appSwitcher.animate!=='function'){onfinish();return null;}
 const animation=appSwitcher.animate(opening?
  [{opacity:0,transform:'scale(.975) translateY(1.2vh)'},{opacity:1,transform:'scale(1) translateY(0)'}]:
  [{opacity:1,transform:'scale(1) translateY(0)'},{opacity:0,transform:'scale(.985) translateY(.8vh)'}],
  {duration:opening?260:180,easing:'cubic-bezier(.2,.72,.18,1)',fill:'both'});
 switcherAnimation=animation;void Promise.resolve(animation.finished).catch(()=>{}).finally(()=>{if(switcherAnimation===animation){switcherAnimation=null;try{animation.cancel();}catch{}}onfinish();});return animation;
}
function openAppSwitcher(){
 if(!visible||!phoneMedia.powered||deviceLocked||camera||modal||loading||center||layoutMenu||callUI.expanded)return false;
 if(switcherOpen)return true;
 ++switcherCloseGeneration;switcherClosing=false;cancelSwitcherAnimation();cancelSwitcherInteractions();
 const current=activeApp(state);
  for(const side of sides){const pane=state.panes[side],id=pane.app;if(id&&id!==current&&!pane.home)rememberRecentApp(id);}
  if(current!=='home')rememberRecentApp(current);
 const ids=appHistory.list().filter(id=>byId[id]&&apps.has(id));if(!ids.length)return false;
 syncSwitcherBackdrop();
 switcherReturnFocus=document.activeElement;selectedRecentId=current!=='home'&&ids.includes(current)?current:ids[0];
 switcherOpen=true;appSwitcher.dataset.keyboardFocus='false';appSwitcher.hidden=false;appSwitcher.inert=false;root.dataset.switcher='true';setTyping(false);renderAppSwitcher();renderWorkspace();animateSwitcher(true);
  requestAnimationFrame(()=>{const selected=switcherTrack.querySelector(`.duo-switcher-card[data-app="${selectedRecentId}"]`);centerSwitcherCard(selected);selected?.querySelector('.duo-switcher-select')?.focus({preventScroll:true});});
 return true;
}
function finishSwitcherClose(generation){
 if(generation!==switcherCloseGeneration||!switcherClosing)return;
 cancelSwitcherInteractions();switcherClosing=false;appSwitcher.hidden=true;appSwitcher.inert=true;appSwitcher.setAttribute('aria-hidden','true');root.dataset.switcher='false';switcherTrack.replaceChildren();renderWorkspace();
 const target=switcherReturnFocus;switcherReturnFocus=null;
 if(target?.isConnected&&!target.closest('[inert]'))requestAnimationFrame(()=>target.focus());
 else requestAnimationFrame(()=>$('.duo-home-gesture',focusedPane())?.focus());
}
function closeAppSwitcher({restoreFocus=true,animate=true}={}){
 if(!switcherOpen)return false;
 cancelSwitcherAnimation();cancelSwitcherInteractions();switcherOpen=false;const generation=++switcherCloseGeneration;
 if(restoreFocus){}else switcherReturnFocus=null;
 if(animate&&!reducedMotion){switcherClosing=true;appSwitcher.inert=true;root.dataset.switcher='closing';renderWorkspace();animateSwitcher(false,()=>finishSwitcherClose(generation));}
 else{switcherClosing=false;appSwitcher.inert=true;appSwitcher.hidden=true;appSwitcher.setAttribute('aria-hidden','true');root.dataset.switcher='false';switcherTrack.replaceChildren();renderWorkspace();if(restoreFocus){const target=switcherReturnFocus;switcherReturnFocus=null;requestAnimationFrame(()=>{if(target?.isConnected&&!target.closest('[inert]'))target.focus();else $('.duo-home-gesture',focusedPane())?.focus();});}}
 return true;
}
function switcherCardOrigin(card){
 const rect=card?.getBoundingClientRect();if(!rect||rect.width<=0||rect.height<=0)return null;
 return {left:rect.left,top:rect.top,width:rect.width,height:rect.height,borderRadius:getComputedStyle(card).borderRadius};
}
function resumeRecentApp(id,origin=null,{fromSwitcher=false}={}){
 if(!id||!byId[id]||!apps.has(id)||!appHistory.list().includes(id))return false;
 const current=activeApp(state);if(current!==id&&current!=='home')rememberRecentApp(current);
 const side=sides.find(key=>state.panes[key].app===id)||state.active;
 const alreadyAssigned=sides.includes(side)&&state.panes[side].app===id;
 if(fromSwitcher)closeAppSwitcher({restoreFocus:false,animate:false});
 else {appSwitcher.hidden=true;appSwitcher.inert=true;root.dataset.switcher='false';}
 appHistory.activate(id);
 if(alreadyAssigned){if(state.panes[side].home)dispatch({type:'RESUME',side});else dispatch({type:'FOCUS',side});}
 else dispatch({type:'OPEN',app:id,side});
 const entry=apps.get(id);if(entry){runAppTransition(entry.node,origin,'open');const focus=appFocusTargets.get(id);requestAnimationFrame(()=>{if(focus?.isConnected&&entry.node.contains(focus)&&!focus.disabled)focus.focus();});}
 return true;
}
function selectRecentApp(id,card){return resumeRecentApp(id,switcherCardOrigin(card),{fromSwitcher:true});}
function quickSwitchRecent(direction=1){
 if(switcherOpen||!visible||!phoneMedia.powered||deviceLocked||camera||modal||loading||center||layoutMenu)return false;
 const current=activeApp(state),ids=appHistory.list().filter(id=>id!==current&&apps.has(id));
 if(!ids.length)return false;
 const cycle=cycleQuickSwitch(current,ids,direction,quickSwitchSequence);quickSwitchSequence=cycle.target?cycle:{sequence:[current,...ids],index:0};
 const target=cycle.target;return target?resumeRecentApp(target):false;
}
function dismissRecentApp(id){
 if(!appHistory.list().includes(id))return false;
 const index=appHistory.list().indexOf(id);appHistory.dismiss(id);
 if(sides.some(side=>state.panes[side].app===id))dispatch({type:'REMOVE',app:id});else renderWorkspace();
 const remaining=appHistory.list();selectedRecentId=remaining[Math.min(index,remaining.length-1)]||null;
  if(switcherOpen){renderAppSwitcher();requestAnimationFrame(()=>centerSelectedSwitcherCard());}
 return true;
}
function sizeSwitcherPreviews(){
 for(const canvas of switcherTrack.querySelectorAll('.duo-switcher-preview-canvas')){
  const node=canvas.firstElementChild,host=canvas.parentElement;
  const width=Number(node?.dataset.switcherWidth),height=Number(node?.dataset.switcherHeight);
  if(!(width>0&&height>0&&width<=8192&&height<=8192&&host.clientWidth>0&&host.clientHeight>0))continue;
  const scale=Math.min(host.clientWidth/width,host.clientHeight/height);
  host.style.background=getComputedStyle(node).backgroundColor;
  canvas.style.width=width+'px';canvas.style.height=height+'px';canvas.style.transform=`scale(${scale})`;
  canvas.style.left=(host.clientWidth-width*scale)/2+'px';canvas.style.top=(host.clientHeight-height*scale)/2+'px';
 }
}
function renderAppSwitcher(){
 cancelSwitcherSelectionFrame();const ids=appHistory.list().filter(id=>byId[id]&&apps.has(id));switcherTrack.replaceChildren();
 $('.duo-switcher-empty',appSwitcher).hidden=ids.length>0;
 if(!ids.includes(selectedRecentId))selectedRecentId=ids[0]||null;
 for(const id of ids){
  const item=byId[id],card=make('article','duo-switcher-card');card.dataset.app=id;card.setAttribute('role','listitem');card.dataset.selected=String(id===selectedRecentId);
  const head=make('div','duo-switcher-card-heading'),select=make('button','duo-switcher-select');select.type='button';select.setAttribute('aria-label',`Return to ${item.name}`);select.innerHTML=appIcon(item);select.append(make('span','',item.name));
  select.addEventListener('click',()=>selectRecentApp(id,card));
  const close=make('button','duo-switcher-dismiss','×');close.type='button';close.setAttribute('aria-label',`Close ${item.name}`);close.title=`Close ${item.name}`;close.addEventListener('click',event=>{event.stopPropagation();dismissRecentApp(id);});head.append(select);card.append(head);
  const surface=make('div','duo-switcher-preview-hit');surface.setAttribute('aria-hidden','true');surface.addEventListener('click',()=>selectRecentApp(id,card));
  const preview=make('div','duo-switcher-preview');preview.setAttribute('aria-hidden','true');const markup=appHistory.preview(id);
  if(markup){const template=document.createElement('template');template.innerHTML=markup;const node=template.content.querySelector('.duo-app-instance[data-switcher-preview="true"]');if(node){const canvas=make('div','duo-switcher-preview-canvas');canvas.append(node);preview.append(canvas);}}
  if(!preview.firstElementChild){preview.classList.add('duo-switcher-preview-placeholder');preview.append(make('span','duo-switcher-placeholder-icon',item.name.slice(0,1).toUpperCase()),make('strong','',item.name),make('small','','Ready to pick up where you left off.'));}
  surface.append(preview);card.append(surface,close);switcherTrack.append(card);
 }
 sizeSwitcherPreviews();
}
let switcherProgrammaticScroll=false,switcherScrollGeneration=0,switcherScrollTimer=0;
function centerSwitcherCard(card,behavior='auto'){
 if(!card)return;
 const target=Math.max(0,Math.min(switcherTrack.scrollWidth-switcherTrack.clientWidth,card.offsetLeft+card.offsetWidth/2-switcherTrack.clientWidth/2));
 const generation=++switcherScrollGeneration;switcherProgrammaticScroll=true;clearTimeout(switcherScrollTimer);
 if(behavior==='auto'||reducedMotion)switcherTrack.scrollLeft=target;
 else switcherTrack.scrollTo({left:target,behavior});
 switcherScrollTimer=setTimeout(()=>{if(generation===switcherScrollGeneration)switcherProgrammaticScroll=false;},behavior==='smooth'&&!reducedMotion?420:90);
}
function centerSelectedSwitcherCard(behavior='auto'){
 if(!switcherOpen||!selectedRecentId)return;
 sizeSwitcherPreviews();
 centerSwitcherCard(switcherTrack.querySelector(`.duo-switcher-card[data-app="${selectedRecentId}"]`),behavior);
}
function updateSwitcherSelection(){
 if(switcherProgrammaticScroll)return;
 const cards=[...switcherTrack.querySelectorAll('.duo-switcher-card')];if(!cards.length)return;
 const center=switcherTrack.getBoundingClientRect().left+switcherTrack.clientWidth/2;
 const closest=cards.map(card=>{const rect=card.getBoundingClientRect();return {card,distance:Math.abs(rect.left+rect.width/2-center)};}).reduce((best,item)=>item.distance<best.distance?item:best).card;
 selectedRecentId=closest.dataset.app;for(const card of cards)card.dataset.selected=String(card===closest);
}
function cancelSwitcherSelectionFrame(){if(switcherSelectionFrame){cancelAnimationFrame(switcherSelectionFrame);switcherSelectionFrame=0;}}
function scheduleSwitcherSelectionUpdate(){
 if(!switcherOpen||switcherSelectionFrame)return;
 switcherSelectionFrame=requestAnimationFrame(()=>{switcherSelectionFrame=0;if(switcherOpen)updateSwitcherSelection();});
}
function moveSwitcherSelection(direction){
 const cards=[...switcherTrack.querySelectorAll('.duo-switcher-card')];if(!cards.length)return;
 let index=cards.findIndex(card=>card.dataset.app===selectedRecentId);index=(index+(direction<0?-1:1)+cards.length)%cards.length;
 selectedRecentId=cards[index].dataset.app;for(const card of cards)card.dataset.selected=String(card===cards[index]);
 centerSwitcherCard(cards[index],reducedMotion?'auto':'smooth');
  cards[index].querySelector('.duo-switcher-select')?.focus({preventScroll:true});
}
let switcherDrag=null,switcherClickSuppressed=false,switcherClickSuppressionTimer=0;
function cancelSwitcherInteractions(){
 switcherDrag=null;switcherClickSuppressed=false;clearTimeout(switcherClickSuppressionTimer);switcherClickSuppressionTimer=0;
 cancelSwitcherSelectionFrame();switcherProgrammaticScroll=false;++switcherScrollGeneration;clearTimeout(switcherScrollTimer);switcherScrollTimer=0;
}
switcherTrack.addEventListener('scroll',()=>{if(!switcherProgrammaticScroll)scheduleSwitcherSelectionUpdate();},{passive:true});
switcherTrack.addEventListener('pointerdown',event=>{if(event.button!==0||event.target.closest?.('button,a,input,textarea,select,[contenteditable="true"]'))return;switcherProgrammaticScroll=false;clearTimeout(switcherScrollTimer);switcherDrag={id:event.pointerId,x:event.clientX,y:event.clientY,scroll:switcherTrack.scrollLeft,app:event.target.closest('.duo-switcher-card')?.dataset.app||null,dragged:false};});
switcherTrack.addEventListener('wheel',()=>{switcherProgrammaticScroll=false;clearTimeout(switcherScrollTimer);},{passive:true});
window.addEventListener('pointermove',event=>{const drag=switcherDrag;if(!drag||drag.id!==event.pointerId)return;const dx=event.clientX-drag.x,dy=event.clientY-drag.y;if(Math.abs(dx)>7||Math.abs(dy)>7)drag.dragged=true;if(Math.abs(dx)>Math.abs(dy)){switcherTrack.scrollLeft=drag.scroll-dx;event.preventDefault();}});
window.addEventListener('pointerup',event=>{const drag=switcherDrag;if(!drag||drag.id!==event.pointerId)return;switcherDrag=null;if(drag.dragged){switcherClickSuppressed=true;clearTimeout(switcherClickSuppressionTimer);switcherClickSuppressionTimer=setTimeout(()=>{switcherClickSuppressed=false;},110);}const dx=event.clientX-drag.x,up=drag.y-event.clientY;if(drag.app&&up>72&&up>Math.abs(dx)*1.2){event.preventDefault();dismissRecentApp(drag.app);}});
window.addEventListener('pointercancel',event=>{if(switcherDrag?.id===event.pointerId)switcherDrag=null;});
$('.duo-switcher-done',appSwitcher).addEventListener('click',()=>closeAppSwitcher());
$('.duo-switcher-backdrop',appSwitcher).addEventListener('click',()=>closeAppSwitcher());
$('.duo-switcher-home',appSwitcher).addEventListener('click',()=>{closeAppSwitcher({restoreFocus:false});void goHome();});
switcherTrack.addEventListener('click',event=>{if(switcherClickSuppressed){event.preventDefault();event.stopPropagation();switcherClickSuppressed=false;clearTimeout(switcherClickSuppressionTimer);switcherClickSuppressionTimer=0;}} ,true);
function cancelAppTransition(node){
 const run=node&&appTransitions.get(node);if(!run)return;
 appTransitions.delete(node);
 try{run.animation.cancel();}catch{}
}
function cancelAllAppTransitions(){
 for(const [node,run] of appTransitions){try{run.animation.cancel();}catch{}node.style.removeProperty('transform-origin');}
 appTransitions.clear();
 for(const [side,record] of [...closingTransitions])finishClosingTransition(side,record);
}
function runAppTransition(node,origin,direction='open'){
 if(!node)return null;
 cancelAppTransition(node);
 const run=playAppTransition(node,origin,{direction,reducedMotion});
 if(!run)return null;
 appTransitions.set(node,run);
 void run.finished.finally(()=>{if(appTransitions.get(node)===run)appTransitions.delete(node);});
 return run;
}
function finishClosingTransition(side,record){
 if(closingTransitions.get(side)!==record)return;
 closingTransitions.delete(side);
 const model=state.panes[side];
 if(model.home&&model.app===record.app){
  $('.duo-app-mount',panes[side]).hidden=true;
  const entry=apps.get(record.app);if(entry){captureAppScroll(record.app,entry.node);entry.node.hidden=true;}
 }
}
async function goHome(side=state.active){
 if(!sides.includes(side))side=state.active;
 const model=state.panes[side];
 if(model.home||!model.app){dispatch({type:'HOME',side});return true;}
 const entry=apps.get(model.app),record={app:model.app};
 const origin=launcherAppOrigin(side,model.app);
 closingTransitions.set(side,record);
 cancelAppTransition(entry?.node);
 dispatch({type:'HOME',side});
 const run=runAppTransition(entry?.node,origin,'close');
 if(!run){finishClosingTransition(side,record);return true;}
 await run.finished;
 finishClosingTransition(side,record);
 return true;
}
async function closeAppWithTransition(side=state.active){
 if(!sides.includes(side))side=state.active;
 const app=state.panes[side].app;if(!app){dispatch({type:'CLOSE',side});return true;}
 const lifecycleGeneration=openGeneration;
 const reopenMenu=layoutMenu;
 if(reopenMenu){layoutMenu=false;layoutSheet.hidden=true;renderWorkspace();}
 await goHome(side);
 if(lifecycleGeneration!==openGeneration)return true;
 if(state.panes[side].app===app&&state.panes[side].home)dispatch({type:'CLOSE',side});
 if(reopenMenu&&visible&&phoneMedia.powered){layoutMenu=true;layoutSheet.hidden=false;renderLayoutMenu();renderWorkspace();}
 return true;
}
function renderWorkspace(){
 const oldExpanded=root.dataset.expanded==='true';applyPowerDisplay();
 const nextOrientation=visibleOrientation(orientation,state.expanded);
 const oldRatio=parseFloat(root.style.getPropertyValue('--duo-split'))/100;
 const geometryChanged=oldExpanded!==state.expanded||root.dataset.orientation!==nextOrientation||root.dataset.layout!==state.layout||Number.isFinite(oldRatio)&&Math.abs(oldRatio-state.ratio)>.001;
 if(geometryChanged){cancelActiveHomeDrag();for(const cancel of Object.values(homeSwipeCancels))cancel?.();cancelAllAppTransitions();cancelSwitcherAnimation();}
 if(oldExpanded!==state.expanded){captureLifecycle.poseChanged();clearOrientationTurn();}
 const before=oldExpanded!==state.expanded?foldMotion.snapshot():null;
 const displayOrientation=nextOrientation;
 phoneVisibility.set(visible,{immediate:!identity,reducedMotion,peek:phonePeekActive});root.dataset.expanded=String(state.expanded);root.dataset.orientation=displayOrientation;root.dataset.active=state.active;root.dataset.layout=state.layout;root.style.setProperty('--duo-split',(state.ratio??0.5)*100+'%');
 musicOverlay.setPhoneVisible(visible||camera);
 const split=state.ratio??0.5,paneShare=state.layout==='split'&&state.expanded?(state.active==='left'?split:1-split):1;
 const notificationCenter=state.layout==='split'&&state.expanded?(state.active==='left'?split/2:split+(1-split)/2):0.5;
 notificationHost.style.left=notificationCenter*100+'%';notificationHost.style.width=`min(36vh, calc(${paneShare*100}% - 2.4vh))`;
 root.setAttribute('aria-hidden',String(!visible));chassis.inert=!visible;
 const switcherVisible=switcherOpen||switcherClosing;root.dataset.switcher=switcherOpen?'true':switcherClosing?'closing':'false';appSwitcher.hidden=!switcherVisible;appSwitcher.inert=!switcherOpen;appSwitcher.setAttribute('aria-hidden',String(!switcherOpen));
 queueMicrotask(()=>{updateDockBlur();syncAppChrome();});
 root.dataset.camera=String(camera);root.dataset.center=String(center);root.dataset.callExpanded=String(callUI.expanded);globalOverlay.dataset.phoneVisible=String(visible&&!camera);
 if(!center)controlCenter.hide({restoreFocus:false});
 syncToastPlacement();
 root.classList.toggle('duo-is-modal',modal||loading||center||layoutMenu);
 for(const side of sides){
  const pane=panes[side],model=state.panes[side],shown=phoneMedia.powered&&visible&&!camera&&isPaneVisible(state,side);
  pane.dataset.active=String(state.active===side);pane.dataset.home=String(model.home);pane.dataset.visible=String(shown);
  pane.inert=!shown||modal||loading||center||layoutMenu||callUI.expanded||switcherVisible;pane.setAttribute('aria-hidden',String(!shown||modal||loading||center||layoutMenu||callUI.expanded||switcherVisible));
   $('.duo-launcher',pane).hidden=!model.home;$('.duo-launcher',pane).inert=!model.home;
   const mount=$('.duo-app-mount',pane),closing=closingTransitions.get(side),keepForClose=model.home&&closing?.app===model.app;mount.hidden=model.home&&!keepForClose;mount.inert=model.home;
   if(model.app&&phoneMedia.powered){
    const entry=mountApp(model.app);if(model.home&&!keepForClose&&!entry.node.hidden)captureAppScroll(model.app,entry.node);if(entry.node.parentElement!==mount)mount.append(entry.node);
    entry.node.hidden=model.home&&!keepForClose;entry.node.inert=model.home||!shown;
    if(!model.home&&shown){
     restoreAppScroll(model.app,entry.node);
     if(!entry.presented){entry.presented=true;if(entry.hasBeenPresented)entry.instance?.onActivate?.();else{entry.hasBeenPresented=true;if(entry.id==='weather')entry.instance?.onActivate?.();}}
    }else entry.presented=false;
   }
 }
 const retained=new Set(appHistory.list());
  for(const [id,entry] of apps){
   const assigned=sides.some(side=>state.panes[side].app===id);
   if(!assigned&&retained.has(id)){
    entry.presented=false;
    if(!entry.node.hidden)captureAppScroll(id,entry.node);
    if(entry.node.parentElement!==parking)parking.append(entry.node);
   entry.node.hidden=true;entry.node.inert=true;
  }else if(!assigned){
   // App pages do not own the singleton call/media lifecycle.
   destroyApp(id);
  }
 }
 for(const entry of apps.values())if(entry.id==='weather'||entry.id==='documents')entry.instance?.syncLifecycle?.();
 divider.hidden=!state.expanded||state.layout!=='split';divider.inert=modal||loading||center||layoutMenu;divider.setAttribute('aria-valuenow',String(Math.round(state.ratio*100)));divider.setAttribute('aria-orientation',state.expanded&&orientation==='portrait'?'horizontal':'vertical');
 layoutButton.setAttribute('aria-expanded',String(layoutMenu));layoutButton.disabled=!phoneMedia.powered||modal||loading||camera;
 swapButton.hidden=!state.expanded||state.layout!=='split';swapButton.disabled=!phoneMedia.powered||modal||loading;
 foldButton.title=state.expanded?'Fold phone (E)':'Unfold phone (E)';foldButton.setAttribute('aria-label',foldButton.title);foldButton.setAttribute('aria-pressed',String(state.expanded));
 $('.duo-fold-label',foldButton).textContent=state.expanded?'Fold':'Unfold';
 orientationButton.hidden=!state.expanded;orientationButton.setAttribute('aria-pressed',String(orientation==='portrait'));orientationButton.setAttribute('aria-label',orientation==='portrait'?'Use landscape orientation':'Use portrait orientation');orientationButton.title=orientationButton.getAttribute('aria-label');orientationButton.disabled=!phoneMedia.powered||modal||loading||camera;
 if(oldExpanded!==state.expanded)foldMotion.play(state.expanded,before,reducedMotion);
 if(geometryChanged)scheduleHomeGeometryRefresh(true);
 if(geometryChanged&&switcherOpen)requestAnimationFrame(()=>requestAnimationFrame(()=>centerSelectedSwitcherCard()));
 writePreference('display-layout',state.layout);writePreference('split-ratio',state.ratio);writePreference('expanded',state.expanded);syncAppState();
}
const switcherResizeObserver=typeof ResizeObserver==='function'?new ResizeObserver(()=>{if(switcherOpen)requestAnimationFrame(()=>centerSelectedSwitcherCard());}):null;
switcherResizeObserver?.observe(bank);
let lastSnapshot='';
function syncAppState(force=false){
 const payload={App:visible&&phoneMedia.powered?activeApp(state):'home',VisibleApps:visibleApps(state,visible&&!camera&&phoneMedia.powered),ActivePane:state.active,Expanded:state.expanded,Orientation:visibleOrientation(orientation,state.expanded),Layout:state.layout,SplitRatio:state.ratio,ReducedMotion:reducedMotion,MountedApps:[...apps.keys()]};
 const sig=JSON.stringify(payload);if(!force&&lastSnapshot===sig)return;lastSnapshot=sig;
 request('SetCurrentApp',{...payload,Session:session,Revision:++revision});
}
function dispatch(action){
 if(!notificationTargetOpening&&['OPEN','HOME','CLOSE','REMOVE','MOVE','SWAP','RESET'].includes(action.type)){
  notificationTargetGeneration++;notifications.invalidateTargets();
 }
 const before=state,next=reduceWorkspace(state,action),appBefore=activeApp(before),appAfter=activeApp(next),removed=new Set();
 if(action.type==='RESET'){
   clearAppSwitcherSession();
 }
 if(action.type==='CLOSE'&&before.panes[action.side||before.active]?.app)removed.add(before.panes[action.side||before.active].app);
 if(action.type==='REMOVE'&&action.app)removed.add(action.app);
 const leaving=new Set();
 if(appBefore!=='home'&&appBefore!==appAfter&&!removed.has(appBefore))leaving.add(appBefore);
 if(action.type==='HOME'){
  const side=sides.includes(action.side)?action.side:before.active,model=before.panes[side];if(model.app&&!model.home&&!removed.has(model.app))leaving.add(model.app);
 }
 if(action.type==='OPEN')for(const side of sides){const old=before.panes[side].app;if(old&&!next.panes[side].app&&!removed.has(old)&&!sides.some(key=>next.panes[key].app===old))leaving.add(old);}
 for(const id of leaving){rememberRecentApp(id);captureAppScroll(id,apps.get(id)?.node);}
 for(const id of removed)appHistory.dismiss(id);
 if(appAfter!=='home'&&appAfter!==appBefore)appHistory.activate(appAfter);
 state=next;
 for(const id of visibleApps(state,visible))unread[id]=false;
 renderWorkspace();if(action.type!=='FOCUS')updateLauncher();
}
async function openApp(id,side=state.active,{external=false,launchElement=null}={}){
 if(!phoneMedia.powered)return false;
 if(!byId[id]){toast('This application is not registered.');return false;}
 if(modal||loading)return false;
 if(switcherOpen)closeAppSwitcher({restoreFocus:false,animate:false});
 if((!external||['pinger','tierup','racing','time-trials','cars'].includes(id))&&!allowedApps().some(a=>a.id===id)){toast('This app is not available on the current SIM or network.');return false;}
 if(id==='camera'&&snapshots.capabilities.camera?.available!==false){if(preview){camera=true;cameraUI.setFacing(false);cameraUI.show(true);renderWorkspace();}else await request('Phone/Selfie');return true;}
 const existing=apps.get(id),wasAlreadyOpen=sides.some(key=>state.panes[key].app===id&&!state.panes[key].home);
 const origin=appLaunchOrigin(launchElement);closingTransitions.delete(side);
 cancelAppTransition(apps.get(state.panes[side].app)?.node);
 layoutMenu=false;layoutSheet.hidden=true;center=false;controlCenter.hide({restoreFocus:false});control.hidden=true;dispatch({type:'OPEN',app:id,side});
 if(!wasAlreadyOpen){const entry=existing||apps.get(id);runAppTransition(entry?.node,origin,'open');}
 return true;
}
async function openNotificationTarget(raw,{isCurrent=()=>true}={}){
 const target=exactNotificationTarget(raw),app=target?.App;
 if(!target||!['messages','mails','y'].includes(app))return false;
 if(!visible||!phoneMedia.powered||deviceLocked||!hasSim||!allowedApps().some(item=>item.id===app)||!isCurrent())return false;
 const requestGeneration=++notificationTargetGeneration;
 const workspaceGeneration=openGeneration,requestIdentity=identity;
 const current=()=>requestGeneration===notificationTargetGeneration&&workspaceGeneration===openGeneration&&requestIdentity===identity&&visible&&phoneMedia.powered&&!deviceLocked&&hasSim&&allowedApps().some(item=>item.id===app)&&isCurrent();
 notificationTargetOpening=true;
 let opened=false;
 try{opened=await openApp(app,state.active,{external:true});}finally{notificationTargetOpening=false;}
 if(!opened||!current())return false;
 let result=false;
 if(app==='messages')result=await apps.get('messages')?.instance?.openTarget(target,{isCurrent:current});
 else if(app==='mails')result=await apps.get('mails')?.instance?.openById(target.Id,{isCurrent:current});
 else if(app==='y')result=await apps.get('y')?.instance?.openTarget(target,{isCurrent:current});
 return current()&&result!==false;
}
function setLayout(value){
 if(modal||loading||camera)return;layoutMenu=false;layoutSheet.hidden=true;
 state=reduceWorkspace(state,{type:'LAYOUT',value});if(value==='split')state=reduceWorkspace(state,{type:'EXPAND',value:true});renderWorkspace();updateLauncher();
}
function placeApp(id,side){
 if(modal||loading||camera||!byId[id]||!allowedApps().some(a=>a.id===id))return;
 const existing=sides.find(key=>state.panes[key].app===id);
 if(existing&&existing!==side)state=reduceWorkspace(state,{type:'MOVE',from:existing,side});
 if(state.expanded)state=reduceWorkspace(state,{type:'LAYOUT',value:'split'});
 openApp(id,side);
}
function toggleLayoutMenu(){
 if(modal||loading||camera)return;
 center=false;controlCenter.hide({restoreFocus:false});control.hidden=true;layoutMenu=!layoutMenu;layoutSheet.hidden=!layoutMenu;
 if(layoutMenu)renderLayoutMenu();renderWorkspace();
 if(layoutMenu)queueMicrotask(()=>layoutSheet.querySelector('button')?.focus());
 else queueMicrotask(()=>$('.duo-layout-handle',focusedPane())?.focus());
}
function renderLayoutMenu(){
 layoutSheet.replaceChildren();const heading=make('header','duo-layout-heading');heading.append(make('div','','Display'),button('Close multitasking','close',toggleLayoutMenu));layoutSheet.append(heading);
 const description=make('p','duo-layout-description','One seamless display. Choose how you use it.');layoutSheet.append(description);
 const modes=make('div','duo-layout-modes');
 for(const [value,title,caption] of [['full','Full screen','One app. Every pixel.'],['split','Split View','Two apps. Side by side.']]){const b=make('button','duo-layout-option');b.type='button';b.dataset.layoutOption=value;b.setAttribute('aria-pressed',String(state.layout===value));b.innerHTML=`<span class="duo-layout-symbol duo-symbol-${value}"><i></i><i></i></span>`;b.append(make('strong','',title),make('small','',caption));b.addEventListener('click',()=>setLayout(value));modes.append(b);}layoutSheet.append(modes);
 const row=make('div','duo-layout-workspaces');
 for(const side of sides){
  const model=state.panes[side],card=make('div','duo-workspace-option'),b=make('button','duo-workspace-card'),item=byId[model.app];b.type='button';
  b.innerHTML=item?appIcon(item):icon('home');b.append(make('span','',`${side==='left'?'Left':'Right'} · ${item?.name||'Home'}`));b.setAttribute('aria-pressed',String(state.active===side));
  b.setAttribute('aria-label',model.app?`Resume ${side} app`:`Home on ${side}`);
  b.addEventListener('click',()=>{layoutMenu=false;layoutSheet.hidden=true;dispatch({type:model.app?'RESUME':'HOME',side});});card.append(b);
  if(model.app)card.append(button(`Close ${side} app`,'close',()=>{
   void closeAppWithTransition(side);
  },'duo-workspace-close'));
  row.append(card);
 }
 layoutSheet.append(row);
 const label=make('h3','','Open alongside');layoutSheet.append(label);const picker=make('div','duo-layout-picker');
 for(const item of allowedApps().filter(a=>a.id!=='camera')){const b=make('button','duo-layout-pick');b.type='button';b.innerHTML=appIcon(item);b.append(make('span','',item.name));b.addEventListener('click',()=>{const side=state.active==='left'?'right':'left';layoutMenu=false;layoutSheet.hidden=true;state=reduceWorkspace(state,{type:'EXPAND',value:true});placeApp(item.id,side);});picker.append(b);}layoutSheet.append(picker);
 const hint=make('p','duo-layout-hint','Drag an app to a side, or resize the divider. Double-click the divider to center it.');layoutSheet.append(hint);
}
function fold(){
 if(orientationTurnAnimation){queuedOrientationFold=!queuedOrientationFold;return;}
 if(!visible||camera||modal||loading||center||layoutMenu)return;
 const focused=document.activeElement;if(isEditing(focused))focused.blur();
 S.DropdownData.set({Show:false});S.ImageHoverData.set({Show:false});dispatch({type:'TOGGLE'});
}
function dismissOverlays(){closeNetworkSheet();layoutMenu=false;layoutSheet.hidden=true;center=false;controlCenter.hide({restoreFocus:false});control.hidden=true;S.InputModal.set({Visible:false});S.DropdownData.set({Show:false});S.ImageHoverData.set({Show:false});}
function closePhone(send=false){
 invalidateFeedback();
 clearToast();
 setHomeEditing(false);
 if(switcherOpen||switcherClosing){switcherOpen=false;switcherClosing=false;++switcherCloseGeneration;cancelSwitcherAnimation();switcherReturnFocus=null;switcherTrack.replaceChildren();}
 cancelAllAppTransitions();
 captureLifecycle.close();clearOrientationTurn();
 notificationTargetGeneration++;notifications.invalidateTargets();
 controlCenter.reset();
 window.PeakDuoVoiceNotes?.cancel();
 foldMotion.cancel();if(camera){camera=false;cameraUI.show(false);}
 visible=false;clearPhonePeek({suppressCall:true});++openGeneration;dismissOverlays();setTyping(false);renderWorkspace();
 if(send)request('ClosePhone');
}
function resetSession(){
 invalidateFeedback();
 clearToast();
 setHomeEditing(false);
 clockService.setScope(null);
 phonePeekIdentityBlocked=true;
 clearPhonePeek({suppressCall:true});
 cancelAllAppTransitions();
 clearAppSwitcherSession();
 captureLifecycle.invalidate();
 clearOrientationTurn();
 notificationTargetGeneration++;notifications.reset();
 controlCenter.reset();focusMode=false;muted=false;root.dataset.focus='false';notificationHost.setAttribute('aria-hidden','false');request('Phone/ToggleSounds',{State:false});
 lockScreen.hide();currentOpenData=null;
 visible=false;camera=false;recorder.cancel();recorder.setOwner('');cameraUI.show(false);
 ++openGeneration;++documentGeneration;callUI.reset();suppressedPeekCallId='';videoService.stop(null,'Character unloaded');facetiming=false;snapshots.capabilities={};dismissOverlays();state=reduceWorkspace(state,{type:'RESET'});
 musicOverlay.reset();
 for(const id of [...apps.keys()])destroyApp(id);
 S.CurrentChat.set(false);S.CurrentGroup.set(false);S.ShowGroupInfo.set(false);S.CurrentArticle.set({});S.CurrentDocument.set({});S.DocumentIsDrop.set(false);S.CurrentBusiness.set({});
 S.Notifications.set([]);S.InstalledApps.set({});S.CurrentNetwork.set('');S.JobManager.set({});S.ProfilePicture.set(null);S.PlayerData.set({});S.LoaderModal.set(false);S.SuccessModal.set(false);
 queries.left='';queries.right='';for(const p of Object.values(panes))$('.duo-search input',p).value='';unread={};identity='';
 renderWorkspace();
}
async function onOpen(data){
 applyServerOwnerConfig(data.OwnerConfig||{});
 invalidateFeedback();clearToast();
 clearPhonePeek({suppressCall:true});
 setHomeEditing(false);
 const nextIdentity=captureIdentityKey(data.ServerKey||(preview?'preview':'server-unspecified'),data.PlayerData);
 if(identity&&identity!==nextIdentity)resetSession();currentOpenData=data;identity=nextIdentity;serverKey=data.ServerKey||(preview?'preview':'server-unspecified');loadHomeLayout();const generation=++openGeneration;
 phonePeekIdentityBlocked=false;
 deviceGeneration=Number.isSafeInteger(Number(data.PlayerData?.DeviceGeneration))&&Number(data.PlayerData?.DeviceGeneration)>0?Number(data.PlayerData.DeviceGeneration):null;
 captureLifecycle.open();
 phoneMedia.selectDevice(JSON.stringify([serverKey,data.PlayerData?.Cid||'',data.PlayerData?.DeviceId||'']));
 clockService.setScope({server:serverKey,cid:String(data.PlayerData?.Cid||''),deviceId:String(data.PlayerData?.DeviceId||''),deviceGeneration}, {server:serverKey,identity});
 recorder.setOwner(JSON.stringify([data.ServerKey|| (preview?'preview':'server-unspecified'),nextIdentity]));
 visible=true;camera=false;deviceLocked=!!data.PlayerData?.DeviceLocked;if(deviceLocked){clearToast();clearOrientationTurn();foldMotion.cancel();}hasSim=data.PlayerData?.HasSim!==false;notifications.setLocked(deviceLocked);cameraUI.show(false);clock=Array.isArray(data.Time)?data.Time:clock;weather=data.Weather||weather;
 if(data.Capabilities)snapshots.capabilities=data.Capabilities;
 nearNetwork=!!data.IsNearNetwork;networkEnabled=data.IsNetworkEnabled!==false;
 S.HasVpn.set(!!data.HasVPN);S.HasRacingUsb.set(!!data.HasRacingUsb);S.HasPDRacingUsb.set(!!data.HasPDRacingUsb);S.RacingAlias.set(data.RacingAlias||'');S.PlayerData.set(data.PlayerData||{});
 updateClock();renderWorkspace();
 for(const pane of Object.values(panes))pane.inert=deviceLocked;
 if(!phoneMedia.powered){lockScreen.hide();return;}
 lockScreen.setWallpaper(readPreference('lock-wallpaper:'+identity,''));
 if(deviceLocked){lockScreen.show(data.PlayerData.DeviceGeneration);return;}
 lockScreen.hide();
 const [profile,installed]=await Promise.allSettled([hasSim?window.PeakPhoneTransport('GetProfilePicture',{Phone:data.PlayerData?.PhoneNumber}):Promise.resolve(null),window.PeakPhoneTransport('GetInstalledApps',{})]);
 if(generation!==openGeneration||identity!==nextIdentity)return;
 if(profile.status==='fulfilled')S.ProfilePicture.set(profile.value||null);
 if(installed.status==='fulfilled'&&installed.value&&typeof installed.value==='object')S.InstalledApps.set(installed.value);
 updateLauncher();if(data.PlayerData?.DeviceLocked||!data.PlayerData?.HasSim)await openApp('settings');else if(galleryAfterCamera){galleryAfterCamera=false;await openApp('gallery');}
}
function setTyping(value){
 value=!!value&&visible&&!camera;if(value===typing)return;typing=value;request('Phone/DuoTyping',{Typing:value});
}
function refreshTyping(){setTyping(isEditing(document.activeElement));}
document.addEventListener('focusin',event=>{const app=event.target.closest?.('.duo-app-instance');if(app?.dataset.app&&!app.dataset.switcherPreview)appFocusTargets.set(app.dataset.app,event.target);refreshTyping();});
document.addEventListener('click',event=>{const app=event.target.closest?.('.duo-app-instance');if(app?.dataset.app&&!app.dataset.switcherPreview)lastInteractedApp=app.dataset.app;},true);
document.addEventListener('focusout',()=>queueMicrotask(refreshTyping));
window.addEventListener('blur',()=>setTyping(false));
window.addEventListener('resize',()=>{clearOrientationTurn();cancelAllAppTransitions();cancelSwitcherAnimation();for(const side of sides)cancelHomeGeometryInteraction(side);scheduleHomeGeometryRefresh(true);queueMicrotask(updateDockBlur);if(switcherOpen)requestAnimationFrame(()=>centerSelectedSwitcherCard());});

function toggleCenter({restoreFocus=true}={}){
 if(!phoneMedia.powered)return;
 if(modal||loading||camera)return;layoutMenu=false;layoutSheet.hidden=true;
 const opening=!center;center=opening;control.hidden=!opening;
 if(opening)renderCenter();else controlCenter.hide({restoreFocus});
 renderWorkspace();
}
function gameGlass(className){
 const layer=make('div',className);
 if(!preview){const view=document.createElement('object');view.type='application/x-cfx-game-view';view.className='duo-glass-gameview';view.setAttribute('aria-hidden','true');layer.append(view);}
 return layer;
}
function renderCenter(){
 controlCenter.show();
 syncToastPlacement();
}
const networkSheet=make('div','duo-network-sheet');networkSheet.hidden=true;
networkSheet.setAttribute('role','dialog');networkSheet.setAttribute('aria-modal','true');networkSheet.setAttribute('aria-label','Connect to network');
overlays.append(networkSheet);
let networkSheetOpen=false;
function closeNetworkSheet(){
 if(!networkSheetOpen)return;
 networkSheetOpen=false;networkSheet.hidden=true;networkSheet.replaceChildren();modal=false;setTyping(false);renderWorkspace();
}
async function connectNetwork(){
 const networks=await request('Network/GetNetworks');
 if(!Array.isArray(networks)||!networks.length){toast('No nearby networks are available.');return;}
 center=false;controlCenter.hide({restoreFocus:false});control.hidden=true;networkSheetOpen=true;networkSheet.hidden=false;modal=true;
 networkSheet.replaceChildren(gameGlass('duo-network-glass'));
 const panel=make('form','duo-network-panel');panel.noValidate=true;
 const handle=make('div','duo-network-handle');handle.setAttribute('aria-hidden','true');
 const eyebrow=make('span','duo-network-eyebrow','CONNECTIVITY');
 const heading=make('div','duo-network-heading');heading.append(make('h2','','Join a network'),button('Close network sheet','close',closeNetworkSheet));
 const intro=make('p','duo-network-intro','Choose a network nearby. Enter a password only when the network requires one.');
 const currentId=String(snapshots.network||'');let selectedId=networks.some(network=>String(network?.Id||'')===currentId)?currentId:String(networks[0]?.Id||'');
 const list=make('div','duo-network-list');list.setAttribute('role','group');list.setAttribute('aria-label','Nearby networks');let selectedButton=null;
 const selectedLabel=make('p','duo-network-selected-label');
 const password=make('label','duo-network-field');password.append(make('span','','Password · only if required'));
 const input=make('input','duo-network-password');input.type='password';input.name='Password';input.autocomplete='new-password';input.placeholder='Password';input.setAttribute('aria-label','Network password');password.append(input);
 const submit=make('button','duo-network-submit','Join network');submit.type='submit';submit.disabled=!selectedId;
 const selectNetwork=(network,row,{focusPassword=false}={})=>{selectedButton=row;selectedId=String(network?.Id||'');for(const item of list.querySelectorAll('.duo-network-option')){const chosen=item===row;item.setAttribute('aria-pressed',String(chosen));item.classList.toggle('is-selected',chosen);}selectedLabel.textContent=network?.Name||selectedId||'Choose a network';password.hidden=!selectedId;input.value='';submit.disabled=!selectedId;if(focusPassword)input.focus({preventScroll:true});};
 for(const network of networks){const id=String(network?.Id||'');if(!id)continue;const row=make('button','duo-network-option');row.type='button';row.dataset.networkId=id;row.setAttribute('aria-pressed','false');row.setAttribute('aria-label','Choose network '+String(network.Name||id));const mark=make('span','duo-network-mark');mark.innerHTML=icon('wifi');const copy=make('span','duo-network-copy');copy.append(make('strong','',network.Name||id),make('small','',id===currentId?'Connected':'Nearby'));row.append(mark,copy,make('span','duo-network-check',id===currentId?'Connected':'Choose'));row.addEventListener('click',()=>selectNetwork(network,row,{focusPassword:true}));list.append(row);if(id===selectedId)selectNetwork(network,row);}
 const status=make('p','duo-network-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const actions=make('div','duo-network-actions');
 const cancel=make('button','duo-network-cancel','Cancel');cancel.type='button';cancel.addEventListener('click',closeNetworkSheet);
 actions.append(cancel,submit);
 panel.append(handle,eyebrow,heading,intro,list,selectedLabel,password,status,actions);networkSheet.append(panel);
 panel.addEventListener('submit',async event=>{
  event.preventDefault();if(!selectedId)return;
  submit.disabled=true;list.setAttribute('aria-busy','true');status.textContent='Connecting…';status.dataset.error='false';
  try{
   const result=await window.PeakPhoneTransport('Network/Connect',{Network:selectedId,Password:input.value});
   if(result?.Success===false||!result)throw Error(result?.Msg||result?.Message||'Network connection failed.');
   toast('Connected to network.');closeNetworkSheet();
  }catch(error){if(networkSheetOpen){status.textContent=error.message||'Network connection failed.';status.dataset.error='true';status.setAttribute('role','alert');}}
  finally{if(networkSheetOpen){submit.disabled=false;list.removeAttribute('aria-busy');}}
 });
 renderWorkspace();(selectedButton||list.querySelector('.duo-network-option'))?.focus();
}

function watch(store,fn){storeUnsubscribers.push(store.subscribe(fn));}
function gatesChanged(){
 // Game permissions are still authoritative. Only remove UI views when their corresponding gate was revoked.
 const allowed=new Set(allowedApps().map(a=>a.id));
 for(const side of sides){const id=state.panes[side].app;if(id&&(snapshots.capabilities[id]?.ownerAccess===false||(['pinger','tierup','racing','time-trials','cars'].includes(id)&&!allowed.has(id))))state=reduceWorkspace(state,{type:'REMOVE',app:id});}
 updateLauncher();if(visible)renderWorkspace();if(center)controlCenter.updateButtons();
}
for(const [store,key] of [['InstalledApps','installed'],['HasVpn','vpn'],['HasRacingUsb','racing'],['HasPDRacingUsb','pdRacing'],['CurrentNetwork','network']])watch(S[store],value=>{snapshots[key]=value||(['vpn','racing','pdRacing'].includes(key)?false:key==='network'?'':{});gatesChanged();});
watch(S.PlayerData,updateProfile);watch(S.PhoneBackground,value=>{styleWallpaper(value);queueMicrotask(updateDockBlur);});
watch(S.ProfilePicture,value=>{for(const pane of Object.values(panes)){const b=$('.duo-profile',pane);let url=null;try{const u=new URL(value,location.href);if(value&&['http:','https:','nui:'].includes(u.protocol))url=u.href;}catch{}b.style.backgroundImage=url?`url(${JSON.stringify(url)})`:'';b.classList.toggle('duo-profile-image',!!url);}});
watch(S.InputModal,spec=>{
 const next=!!spec?.Visible;
 if(next&&spec===lastInputSpec)return;
 lastInputSpec=spec;
 if(next&&!modal)focusedBeforeModal=document.activeElement;
 if(next){layoutMenu=false;layoutSheet.hidden=true;center=false;controlCenter.hide({restoreFocus:false});control.hidden=true;}
 modal=next;inputHost.hidden=!next;
 if(next){
  modalInstance?.$destroy();
  modalInstance=new LegacyAppSheets({target:inputHost,store:S.InputModal,notify:toast});
  const sourceApp=focusedBeforeModal?.closest?.('.duo-app-instance')?.dataset.app||lastInteractedApp||activeApp(state);
  modalInstance.update(spec,sourceApp);
 }else {
  modalInstance?.$destroy();modalInstance=null;setTyping(false);const focus=focusedBeforeModal;focusedBeforeModal=null;if(focus?.isConnected&&!focus.closest('[inert]'))queueMicrotask(()=>focus.focus?.());
 }
 renderWorkspace();
});
watch(S.LoaderModal,value=>{loading=!!value;busy.hidden=!loading;if(loading){layoutMenu=false;layoutSheet.hidden=true;}renderWorkspace();});
watch(S.SuccessModal,value=>{
 clearTimeout(successTimer);success.hidden=!value;
 if(value){success.innerHTML=icon('check');success.append(make('span','',typeof value==='string'?value:'Done'));successTimer=setTimeout(()=>S.SuccessModal.set(false),1600);}
});
watch(S.DropdownData,value=>{
 dropdownInstance?.$destroy();dropdownInstance=null;
 if(value?.Show)dropdownInstance=new legacy.Dropdown({target:$('#duo-dropdown'),props:{Options:value.Options||[],Positioning:value.Positioning||{}}});
});
watch(S.ImageHoverData,value=>{
 const host=$('.duo-image-preview');host.hidden=!value?.Show;host.replaceChildren();if(!value?.Show)return;
 const image=new Image();image.src=value.Source;host.append(image);host.style.left=Math.min(Math.max(0,value.Left||0),innerWidth*.65)+'px';host.style.top=Math.min(Math.max(0,value.Top||0),innerHeight*.6)+'px';
});

function onMessage(event){
 // FiveM currently forwards SendNUIMessage from the root UI into this resource iframe,
 // so its source is window.parent. Some artifacts use a null source, while previews
 // and internal replays use this window. Reject every other frame/source.
 if(event.source&&event.source!==window&&event.source!==window.parent)return;
 const data=event.data;if(!data||typeof data!=='object'||typeof data.Action!=='string'||data.__duoReplay)return;
 if(data.Action.startsWith('Calls/')){if(!phoneMedia.powered){if(data.Data?.CallId)request('Calls/EndCall',{CallId:data.Data.CallId});return;}callUI.handle(data);if(suppressedPeekCallId&&callUI.state?.CallId!==suppressedPeekCallId)suppressedPeekCallId='';syncPhonePeek();return;}
 if(data.Action.startsWith('Video/')){videoService.handle(data).catch(error=>toast(error.message));return;}
 if(data.Action.startsWith('Facetime/'))return; // Retired PeerJS transport is never invoked.

 switch(data.Action){
  case 'OpenPhone':onOpen(data).catch(error=>toast(error.message));break;
  case 'ClosePhone':closePhone(false);break;
  case 'Music/Move':musicOverlay.startMove();break;
  case 'Duo/Capabilities':{
   applyServerOwnerConfig(data.OwnerConfig||{});
   const before=snapshots.capabilities;snapshots.capabilities=data.Capabilities||{};
   for(const [id] of apps)if(before[id]?.available!==snapshots.capabilities[id]?.available)destroyApp(id);
   gatesChanged();break;
  }
  case 'Duo/Reset':closePhone(false);resetSession();break;
  case 'Duo/IdentityChanging':clearOrientationTurn();foldMotion.cancel();invalidateFeedback();clearToast();setHomeEditing(false);clockService.setScope(null);captureLifecycle.invalidate();phonePeekIdentityBlocked=true;clearPhonePeek({suppressCall:true});notificationTargetGeneration++;notifications.reset();break;
  case 'Duo/DeviceUnlocked':invalidateFeedback();clearToast();notificationTargetGeneration++;notifications.setLocked(false);deviceLocked=false;lockScreen.hide();for(const pane of Object.values(panes))pane.inert=false;updateLauncher();renderWorkspace();break;
  case 'Duo/FactoryReset':
   invalidateFeedback();
   clearToast();
   setHomeEditing(false);
   clockService.clearScope();
   clearPhonePeek({suppressCall:true});
   cancelAllAppTransitions();
   captureLifecycle.invalidate();
   clearOrientationTurn();
   phoneMedia.setVolume(.7);phoneMedia.setPowered(true);applyPowerDisplay();
   for(const key of ['expanded','display-layout','split-ratio','accent','icons','reduce-transparency','reduced-motion','brightness']){try{localStorage.removeItem('peak-duo:'+key);}catch{}}
   try{if(homeStorageKey)localStorage.removeItem(homeStorageKey);}catch{}
   controlCenter.brightness=100;controlCenter.applyBrightness();reducedMotion=motionMedia.matches;root.classList.toggle('duo-reduced-motion',reducedMotion);
   accent='aurora';root.dataset.accent=accent;root.dataset.icons='color';root.dataset.transparency='regular';state=initialWorkspace(false,'full');homeLayout=normalizeHomeLayout(null);renderWorkspace();break;
  case 'SetPhoneBrand':S.Brand.set('iOS');break;
  case 'SetPhoneBackground':S.PhoneBackground.set(data.Background);break;
  case 'SetEmbedsEnabled':S.EmbedsEnabled.set(data.Enabled);break;
  case 'UpdatePlayerData':{
   const playerData=data.PlayerData||{},nextIdentity=captureIdentityKey(serverKey,playerData),nextGeneration=Number.isSafeInteger(Number(playerData.DeviceGeneration))&&Number(playerData.DeviceGeneration)>0?Number(playerData.DeviceGeneration):null;
   if(identity&&(nextIdentity!==identity||nextGeneration!==deviceGeneration)){captureLifecycle.invalidate();closePhone(false);resetSession();break;}
   if(nextGeneration!==deviceGeneration){invalidateFeedback();clearToast();captureLifecycle.invalidate();deviceGeneration=nextGeneration;break;}
   S.PlayerData.set(playerData);break;
  }
  case 'SetTax':S.Tax.set(data.Tax);break;
  case 'SetJobManager':S.JobManager.set(data.JobManager||{});break;
  case 'SetCurrentNetwork':S.CurrentNetwork.set(data.Network||'');break;
  case 'Duo/NetworkState':networkEnabled=!!data.Enabled;if(center)renderCenter();break;
  case 'Notification':if(!/^(contacts-dial-|facetime-)/.test(String(data.Id||''))&&notifications.add(data)){const id=String(data.Id??'').trim();if(id&&!visible&&phoneMedia.powered)phonePeekNotificationIds.set(id,Date.now()+PHONE_PEEK_NOTIFICATION_MS);syncPhonePeek();}break;
  case 'UpdateNotification':notifications.update(data);break;
  case 'RemoveNotification':notifications.remove(data);break;
  case 'SetAppUnread':unread[data.App]=!visibleApps(state,visible).includes(data.App);updateLauncher();break;
  case 'AppInstalled':S.InstalledApps.update(value=>({...value,[data.AppId]:true}));break;
  case 'AppUninstalled':S.InstalledApps.update(value=>{const copy={...value};delete copy[data.AppId];return copy;});dispatch({type:'REMOVE',app:data.AppId});break;
  case 'Documents/SetDocument':{
   const token=++documentGeneration;openApp('documents',state.active,{external:true}).then(opened=>{if(!opened||token!==documentGeneration)return;setTimeout(()=>window.dispatchEvent(new MessageEvent('message',{data:{Action:'Duo/OpenDocument',Document:data.Document||{},IsDrop:!!data.IsDrop}})),0);});break;
  }
  case 'Gallery/PhotoCaptured':case 'Gallery/SharedPhoto':{
   const existed=apps.has('gallery');openApp('gallery',state.active,{external:true}).then(opened=>{if(opened&&!existed)setTimeout(()=>window.dispatchEvent(new MessageEvent('message',{data:{...data,__duoReplay:true}})),0);});break;
  }
  case 'Mails/OpenMail':{
   const id=data.Id??data.id??data.MailId??data.mailId;
   if(id!=null)openApp('mails',state.active,{external:true}).then(opened=>{if(opened)apps.get('mails')?.instance?.openById(id);});
   break;
  }
  case 'SwitchToApp':case 'SetCurrentApp':if(data.App==='home')void goHome();else if(data.App)openApp(data.App,state.active,{external:true});break;
  case 'Camera/Shutter':cameraUI.shutter();break;
  case 'Camera/PhotoResult':cameraUI.photoResult(data.Success,data.Message);break;
  case 'Camera/ExitRequested':cameraUI.exit();break;
  case 'ShowCameraOverlay':camera=!!data.Visible;if(camera&&typeof data.IsSelfie==='boolean')cameraUI.setFacing(data.IsSelfie);cameraUI.show(camera);if(camera){dismissOverlays();setTyping(false);}renderWorkspace();break;
  case 'Facetime/CallActive':facetiming=!!data.Active;if(!facetiming)renderWorkspace();break;
 }

}
window.addEventListener('message',onMessage);
// Capture shell shortcuts before individual app listeners. An editor owns its letter keys.
window.addEventListener('keydown',event=>{
 if(clockAlertSurface.open){
  if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();clockService.dismissAlert();return;}
  if(!clockAlertSurface.layer.contains(event.target)){event.preventDefault();event.stopImmediatePropagation();}
  return;
 }
 if(event.key==='Alt'&&visible&&!camera&&!typing&&!event.repeat&&!isEditing(event.target)){event.preventDefault();event.stopImmediatePropagation();request('Phone/ToggleInput',{});return;}
 if(switcherOpen){
   if(['Tab','ArrowLeft','ArrowRight','Enter'].includes(event.key))appSwitcher.dataset.keyboardFocus='true';
   if(event.key==='Escape'&&!event.repeat){event.preventDefault();event.stopImmediatePropagation();closeAppSwitcher();return;}
  if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();event.stopImmediatePropagation();moveSwitcherSelection(event.key==='ArrowLeft'?-1:1);return;}
  if(event.key==='Tab'){
   const focusable=[...appSwitcher.querySelectorAll('button:not([disabled]),[role="button"][tabindex="0"]')].filter(node=>node.getClientRects().length&&!node.closest('[inert]'));
   const index=focusable.indexOf(document.activeElement);
   if(focusable.length&&(index<0||event.shiftKey&&index===0||!event.shiftKey&&index===focusable.length-1)){event.preventDefault();focusable[event.shiftKey?focusable.length-1:0].focus();}
   event.stopImmediatePropagation();return;
  }
  if(event.key==='Enter'&&!event.repeat&&!event.target?.closest?.('button,a,input,textarea,select,[contenteditable="true"]')){
   event.preventDefault();event.stopImmediatePropagation();if(selectedRecentId)selectRecentApp(selectedRecentId,switcherTrack.querySelector(`.duo-switcher-card[data-app="${selectedRecentId}"]`));return;
  }
 }
 if(shareDrop.handleKey(event)){event.preventDefault();event.stopImmediatePropagation();return;}
 if(musicOverlay.editing){
  if(event.key==='Escape'||event.key==='Enter'){
   event.preventDefault();event.stopImmediatePropagation();musicOverlay.finishMove(event.key==='Escape');return;
  }
 }
 if(visible&&callUI.handleKey(event)){event.preventDefault();event.stopImmediatePropagation();return;}
 const appSheetOpen=[...root.querySelectorAll('.nx-modal[aria-modal="true"],.nx-sheet[aria-modal="true"]')].some(sheet=>sheet.getClientRects().length>0);
 if(shouldFold(event,visible,modal||loading||camera||center||layoutMenu||appSheetOpen)){event.preventDefault();event.stopImmediatePropagation();fold();return;}
 if(event.key==='Tab'&&center){controlCenter.containTab(event);return;}
 if(event.key==='Tab'&&layoutMenu){const buttons=[...layoutSheet.querySelectorAll('button:not([disabled])')];const index=buttons.indexOf(document.activeElement);if(event.shiftKey&&index<=0){event.preventDefault();buttons.at(-1)?.focus();}else if(!event.shiftKey&&index===buttons.length-1){event.preventDefault();buttons[0]?.focus();}}
 if(camera&&event.key==='Enter'&&!event.repeat&&document.activeElement?.tagName!=='BUTTON'){event.preventDefault();event.stopImmediatePropagation();cameraUI.shutter();return;}
 if(event.key==='Tab'&&modal){
  const focusable=[...inputHost.querySelectorAll('input,textarea,button,[tabindex="0"]')].filter(n=>!n.disabled&&n.getClientRects().length);
  if(focusable.length){const index=focusable.indexOf(document.activeElement);if(event.shiftKey&&index<=0){event.preventDefault();focusable.at(-1).focus();}else if(!event.shiftKey&&index===focusable.length-1){event.preventDefault();focusable[0].focus();}}
 }
 if(event.key!=='Escape'||event.repeat)return;
 if(camera){event.preventDefault();event.stopImmediatePropagation();cameraUI.exit();return;}
 if(!visible)return;
 if(homeEditing){event.preventDefault();event.stopImmediatePropagation();setHomeEditing(false);return;}
 if(layoutMenu){event.preventDefault();event.stopImmediatePropagation();toggleLayoutMenu();return;}
 if(legacy.get(S.DropdownData)?.Show){event.preventDefault();event.stopImmediatePropagation();S.DropdownData.set({Show:false});return;}
 if(center){event.preventDefault();event.stopImmediatePropagation();toggleCenter();return;}
 if(modal){event.preventDefault();event.stopImmediatePropagation();if(networkSheetOpen)closeNetworkSheet();else S.InputModal.set({Visible:false});return;}
 if(apps.get(activeApp(state))?.instance?.handleEscape?.()){event.preventDefault();event.stopImmediatePropagation();setTyping(false);return;}
 // Let the gallery close its own lightbox first; it owns Escape in that view.
 const gallery=apps.get('gallery');if(activeApp(state)==='gallery'&&gallery?.node.querySelector('.gallery-viewer,.photo-viewer,.image-viewer,.viewer-overlay,.fullscreen-viewer,.duo-photo-viewer:not([hidden])'))return;
 event.preventDefault();event.stopImmediatePropagation();closePhone(true);
},true);
window.addEventListener('duo:request-error',event=>{if(event.detail?.context===feedbackGeneration&&visible&&!deviceLocked&&!phonePeekIdentityBlocked)toast(event.detail.error.message);});
window.addEventListener('duo:app-error',event=>{
 if(!visible||!phoneMedia.powered||deviceLocked||phonePeekIdentityBlocked)return;
 const id=visibleApps(state,visible).find(id=>event.detail.event?.toLowerCase().startsWith(id==='mails'?'mails':id));
 toast(`${id?byId[id]?.name+': ':''}The app could not process the game response.`);
 errors.push({event:event.detail.event,message:event.detail.error?.message,time:Date.now()});
 console.error('[Peak Duo] Application response error',event.detail);
});
window.addEventListener('unhandledrejection',event=>{
 errors.push({message:event.reason?.message||String(event.reason),time:Date.now()});
 if(visible&&!deviceLocked&&!phonePeekIdentityBlocked)toast('An application reported an error. Other apps remain available; check the NUI console.');
 // Deliberately no reload: never discard both workspaces or interrupt a live call.
});
window.addEventListener('beforeunload',()=>{invalidateFeedback();clearToast();disposeWorldMemoPlayback();cancelAllAppTransitions();switcherResizeObserver?.disconnect();homeViewportResizeObserver?.disconnect();clearTimeout(homeGeometryRefreshTimer);if(homeGeometryRefreshFrame)cancelAnimationFrame(homeGeometryRefreshFrame);clearTimeout(switcherScrollTimer);clockAlertSurface.destroy();clockService.dispose();clockRingtone.destroy();appearance.destroy();phoneMedia.destroy();physicalScreen?.destroy();phoneVisibility.dispose();contactShareService.destroy();shareDrop.destroy();foldMotion.destroy();cameraUI.destroy();recorder.destroy();callUI.destroy();videoService.destroy();});

window.PeakDuo=Object.freeze({
 isAppInteractive:id=>phoneMedia.powered&&visible&&!switcherOpen&&!switcherClosing&&!callUI.expanded&&!camera&&!modal&&!loading&&!center&&!layoutMenu&&activeApp(state)===id,
 getState:()=>structuredClone({workspace:state,visible,camera,typing,modal,layoutMenu,powered:phoneMedia.powered,volume:phoneMedia.volume,recording:recorder.status,apps:[...apps.keys()],recentApps:appHistory.list(),switcherOpen,selectedRecentApp:selectedRecentId,errors}),
 getPhoneSettings,setPhoneSetting,setLayout,placeApp,setSplitRatio:value=>dispatch({type:'RATIO',value}),
 openApp, home:side=>goHome(side), fold, swap:()=>dispatch({type:'SWAP'}),
 closeApp:side=>closeAppWithTransition(side),
 ...(preview?{preview:true,previewAdapter,requests:previewAdapter.requests,cryptoPreview:previewAdapter.cryptoPreviewFixture,weatherPreview:previewAdapter.weatherPreviewFixture,setPreviewDelay:previewAdapter.setPreviewDelay,sendPreview:data=>window.dispatchEvent(new MessageEvent('message',{data,source:window})),open:()=>onOpen(previewAdapter.previewOpen())}:{preview:false})
});
updateClock();updateLauncher();renderWorkspace();
if(preview){
 document.body.classList.add('duo-preview');
  const notice=make('aside','duo-preview-notice');notice.innerHTML='<span class="duo-preview-kicker">PEAK STUDIOS / INTERFACE PREVIEW</span><h2>Open up<br>what’s possible.</h2><p>A seamless display. A space that adapts.<br>Press E to unfold. Choose Display to multitask.</p><small>Browser preview · Synthetic data · Demo audio only · No game transactions</small>';
 const reopen=make('button','duo-preview-open','Open phone');reopen.addEventListener('click',()=>onOpen(previewAdapter.previewOpen()));notice.append(reopen);
 if(new URLSearchParams(location.search).get('legacyEditors')==='1'){
  let housingKeysCleanup=null;
  const fixtures=legacyEditorFixtures({onAction:(label,values)=>{const row=make('li','',`${label} · local preview callback (${Object.keys(values||{}).length} fixture fields).`);log.prepend(row);while(log.children.length>4)log.lastElementChild.remove();}});
  const tools=make('section','duo-preview-editor-tools');tools.append(make('strong','','Legacy editor previews · no game actions'));
  const controls=make('div','duo-preview-editor-controls'),select=make('select');select.setAttribute('aria-label','Choose a legacy editor preview');
  for(const [index,fixture] of fixtures.entries()){const option=document.createElement('option');option.value=String(index);option.textContent=fixture.label;select.append(option);}
  const housingOption=document.createElement('option');housingOption.value='housingKeys';housingOption.textContent='Housing · keys';select.append(housingOption);
  const log=make('ol','duo-preview-editor-log');log.setAttribute('aria-label','Local preview callback log');log.append(make('li','','Actions stay in this browser preview.'));
  const logAction=(label,values)=>{const row=make('li','',`${label} · local preview callback (${Object.keys(values||{}).length} fixture fields).`);log.prepend(row);while(log.children.length>4)log.lastElementChild.remove();if(/close/i.test(label)){housingKeysCleanup?.();housingKeysCleanup=null;}};
  const open=make('button','','Preview editor');open.type='button';open.addEventListener('click',()=>{housingKeysCleanup?.();housingKeysCleanup=null;S.InputModal.set({Visible:false});const fixture=fixtures[Number(select.value)];if(select.value==='housingKeys'){if(!bank){logAction('Housing keys preview unavailable',{});return;}housingKeysCleanup=mountLegacyHousingKeysPreview({target:bank,onAction:logAction});return;}if(!fixture)return;lastInteractedApp=fixture.appId;S.InputModal.set(fixture.spec);});controls.append(select,open);
  window.addEventListener('beforeunload',()=>housingKeysCleanup?.(),{once:true});
  tools.append(controls,log);notice.append(tools);
 }
 if(preview&&new URLSearchParams(location.search).get('nativeEditors')==='1'){
  const {NATIVE_EDITOR_FIXTURES,runNativeEditorFixture,settleNativeEditorReads}=await import('./native-editor-fixtures.mjs?rev=native-editors-20261008d');
  const tools=make('section','duo-preview-editor-tools');tools.append(make('strong','','Native editor previews · synthetic browser only'));
  const controls=make('div','duo-preview-editor-controls'),select=make('select');select.setAttribute('aria-label','Choose a native editor preview');
  for(const [index,fixture] of NATIVE_EDITOR_FIXTURES.entries()){const option=document.createElement('option');option.value=String(index);option.textContent=fixture.label;select.append(option);}
  const log=make('ol','duo-preview-editor-log');log.setAttribute('aria-label','Native editor preview status');log.append(make('li','','Choose a native editor state to open it on the phone.'));
  const logAction=(message,error=false)=>{const row=make('li','',message);if(error)row.dataset.state='error';log.prepend(row);while(log.children.length>5)log.lastElementChild.remove();};
  const open=make('button','','Preview native editor');open.type='button';open.addEventListener('click',async()=>{
   if(!preview||new URLSearchParams(location.search).get('nativeEditors')!=='1'){logAction('Native editors are available only in the opt-in browser preview.',true);return;}
   const fixture=NATIVE_EDITOR_FIXTURES[Number(select.value)];if(!fixture)return;
   open.disabled=true;open.setAttribute('aria-busy','true');
   try{
    S.InputModal.set({Visible:false});
    if(!visible)await onOpen(previewAdapter.previewOpen());
    const opened=await openApp(fixture.appId,state.active,{external:true});
    if(!opened)throw Error(`${byId[fixture.appId]?.name||fixture.appId} could not be opened in this preview.`);
    const instance=apps.get(fixture.appId)?.instance;
    if(!instance)throw Error(`${byId[fixture.appId]?.name||fixture.appId} is unavailable in this preview.`);
    await settleNativeEditorReads(instance,fixture.appId);
    const result=await runNativeEditorFixture(fixture,instance);
    logAction(result?.note||`${fixture.label} · local editor state opened. No server action submitted.`);
   }catch(error){logAction(`${fixture.label} · ${error?.message||'Preview state unavailable.'}`,true);}
   finally{open.disabled=false;open.removeAttribute('aria-busy');}
  });
  controls.append(select,open);tools.append(controls,log);notice.append(tools);
  tools.style.pointerEvents='auto';controls.style.pointerEvents='auto';select.style.pointerEvents='auto';open.style.pointerEvents='auto';log.style.pointerEvents='auto';
 }
 document.body.prepend(notice);
 await onOpen(previewAdapter.previewOpen());
}else{
 // Ask Lua to replay initialization after this root is ready; there is no polling or duplicate InitPhone call.
 request('Phone/DuoReady',{Session:session}).then(()=>syncAppState(true));
}
document.documentElement.dataset.duoReady='true';
document.documentElement.dataset.duoCefFix='rc1-cef1';
document.documentElement.dataset.duoUI='continuous-display-1';
