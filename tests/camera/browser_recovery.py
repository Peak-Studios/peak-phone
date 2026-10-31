from playwright.sync_api import sync_playwright
from pathlib import Path
import os
import time
out=Path(os.environ.get('CAMERA_EVIDENCE_DIR',Path(__file__).resolve().parents[2]/'artifacts/camera-layout-recovery'));out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 options={'headless':True}
 if os.environ.get('CHROMIUM_PATH'):options['executable_path']=os.environ['CHROMIUM_PATH']
 b=p.chromium.launch(**options);page=b.new_page(viewport={'width':1440,'height':1000});errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(os.environ.get('PREVIEW_URL','http://127.0.0.1:8791'));page.wait_for_selector('html[data-duo-ready=true]');page.wait_for_timeout(800)
 def layout(pose):
  result=page.evaluate('''()=>{const pane=document.querySelector('.duo-pane[data-visible=true]'),dock=pane.querySelector('.duo-dock'),d=dock.getBoundingClientRect();return [...dock.querySelectorAll('.duo-icon-tile')].map(n=>{const r=n.getBoundingClientRect();return {left:r.left-d.left,right:d.right-r.right,center:Math.abs((r.left+r.right-d.left-d.right)/2)}})}''')
  assert all(x['left']>=5 and x['right']>=5 and x['center']<1 for x in result),(pose,result)
  page.screenshot(path=str(out/(pose+'.png')));print(pose,result)
 layout('folded');page.locator('.duo-fold-button').click();page.wait_for_timeout(800);layout('landscape');page.locator('.duo-orientation-button').click();page.wait_for_timeout(800);layout('portrait')
 page.evaluate('''()=>{window.__launcherDragTrace=[];for(const type of ['pointerdown','pointermove','pointerup','pointercancel','click','dragstart','dragenter','dragover','dragleave','drop','dragend'])document.addEventListener(type,event=>{const button=event.target.closest?.('.duo-app-button'),transfer=event.dataTransfer,types=Array.from(transfer?.types||[]);if(!button&&!types.includes('application/x-peak-duo-app'))return;window.__launcherDragTrace.push({type,app:transfer?.getData('application/x-peak-duo-app')||button?.dataset.app||null,source:transfer?.getData('application/x-peak-duo-app-source-side')||null,targetApp:button?.dataset.app||null,targetSide:event.target.closest?.('.duo-pane')?.dataset.side||null,defaultPrevented:event.defaultPrevented,types});},true);}''')
 def clear_trace():page.evaluate('window.__launcherDragTrace=[]')
 def trace():return page.evaluate('window.__launcherDragTrace')
 def launcher(side,app):return page.locator(f'.duo-pane[data-side="{side}"] .duo-app-button[data-app="{app}"]').first
 def settle_drag_geometry():
  # These cases verify drop routing at a settled pose. Retained launcher nodes
  # can become visible before the preceding workspace transition finishes.
  page.wait_for_function("() => {const root=document.querySelector('#duo');return !root.classList.contains('duo-folding')&&!root.classList.contains('duo-orientation-turning')&&!root.getAnimations({subtree:true}).some(a=>a.playState==='running'&&a.effect?.getTiming().iterations!==Infinity);}",timeout=5000)
 def point_in_box(selector,x_ratio=.5,y_ratio=.5,x_offset=0,y_offset=0):
  def read():
   box=page.locator(selector).bounding_box()
   assert box,f'native drag target is not visible: {selector}'
   return {'x':box['x']+box['width']*x_ratio+x_offset,'y':box['y']+box['height']*y_ratio+y_offset}
  return read
 def app_label_point(side,app):
  return point_in_box(f'.duo-pane[data-side="{side}"] .duo-app-button[data-app="{app}"] .duo-app-name')
 def launcher_gap_point(side,app):
  def read():
   button=launcher(side,app);icon=button.locator('.duo-icon-tile').bounding_box();label=button.locator('.duo-app-name').bounding_box()
   assert icon and label,f'native drag gap is not visible for {side}/{app}: icon={icon}, label={label}'
   return {'x':icon['x']+icon['width']/2,'y':(icon['y']+icon['height']+label['y'])/2}
  return read
 def launcher_padding_point(side,app):
  def read():
   button=launcher(side,app).bounding_box();label=launcher(side,app).locator('.duo-app-name').bounding_box()
   assert button and label,f'native drag padding is not visible for {side}/{app}: button={button}, label={label}'
   return {'x':button['x']+button['width']-2,'y':label['y']+label['height']/2}
  return read
 def wait_for_drag_source(side,app,timeout_ms,suspend_raf=False):
  return page.evaluate('''async ({side,app,timeoutMs,suspendRaf})=>{
   const started=performance.now(),deadline=started+timeoutMs,trail=[];let previous=null,stableFrames=0,frame=0;
   const originalRequestAnimationFrame=suspendRaf?window.requestAnimationFrame:null;
   const restoreFrameScheduling=()=>{if(suspendRaf){window.requestAnimationFrame=originalRequestAnimationFrame;suspendRaf=false;}};
   if(suspendRaf)window.requestAnimationFrame=()=>-1;
   const box=element=>{if(!element)return null;const r=element.getBoundingClientRect();return [r.x,r.y,r.width,r.height];};
   const close=(a,b)=>!!a&&!!b&&a.length===b.length&&a.every((value,index)=>Math.abs(value-b[index])<.25);
   const sample=()=>{
    const root=document.querySelector('#duo'),bank=document.querySelector('#duo > .duo-stage > .duo-chassis > .duo-screenbank');
    const pane=[...document.querySelectorAll('.duo-pane')].find(element=>element.dataset.side===side);
    const launcher=pane?.querySelector('.duo-launcher');
    const button=[...(pane?.querySelectorAll('.duo-app-button')||[])].find(element=>element.dataset.app===app);
    const icon=button?.querySelector('.duo-icon-tile');
    const workspace=window.PeakDuo?.getState?.()?.workspace||null,p=workspace?.panes||{};
    const signature=JSON.stringify({expanded:workspace?.expanded??null,layout:workspace?.layout??null,ratio:workspace?.ratio??null,active:workspace?.active??null,left:p.left?[p.left.app,p.left.home]:null,right:p.right?[p.right.app,p.right.home]:null,orientation:root?.dataset.orientation??null});
    const transitioning=!root||root.classList.contains('duo-folding')||root.classList.contains('duo-orientation-turning')||root.getAnimations({subtree:true}).some(animation=>animation.playState==='running'&&animation.effect?.getTiming().iterations!==Infinity);
    const iconBounds=box(icon),visible=!!(pane&&launcher&&button&&icon&&!launcher.hidden&&!button.hidden&&getComputedStyle(launcher).display!=='none'&&getComputedStyle(icon).visibility!=='hidden'&&iconBounds&&iconBounds[2]>0&&iconBounds[3]>0);
    return {ready:visible&&!transitioning,transitioning,visible,signature,bounds:{icon:iconBounds,pane:box(pane),bank:box(bank)}};
   };
   const nextFrame=()=>new Promise(resolve=>{
    let settled=false,frameId=null;
    const timerId=setTimeout(()=>{if(settled)return;settled=true;if(frameId!==null)cancelAnimationFrame(frameId);restoreFrameScheduling();resolve(false);},Math.max(0,deadline-performance.now()));
    frameId=requestAnimationFrame(()=>{if(settled)return;settled=true;clearTimeout(timerId);resolve(true);});
   });
   while(performance.now()<deadline){
    const receivedFrame=await nextFrame();
    if(!receivedFrame||performance.now()>=deadline)return {ok:false,side,app,timeoutMs,stableFrames,trail,deadlineExpired:true};
    frame++;
    const current=sample(),same=previous&&current.ready&&previous.ready&&current.signature===previous.signature&&Object.keys(current.bounds).every(key=>close(current.bounds[key],previous.bounds[key]));
    stableFrames=same?stableFrames+1:0;
    trail.push({frame,ready:current.ready,transitioning:current.transitioning,visible:current.visible,signature:current.signature,bounds:current.bounds});if(trail.length>8)trail.shift();
    if(stableFrames>=3){const [x,y,width,height]=current.bounds.icon;return {ok:true,side,app,center:{x:x+width/2,y:y+height/2},sourceBounds:current.bounds,signature:current.signature,stableFrames,trail};}
    previous=current;
   }
   return {ok:false,side,app,timeoutMs,stableFrames,trail,deadlineExpired:true};
  }''',{'side':side,'app':app,'timeoutMs':timeout_ms,'suspendRaf':suspend_raf})
 def drag_source_hit(side,app,point,settled):
  return page.evaluate('''({side,app,x,y,settled})=>{
   const root=document.querySelector('#duo'),bank=document.querySelector('#duo > .duo-stage > .duo-chassis > .duo-screenbank');
   const pane=[...document.querySelectorAll('.duo-pane')].find(element=>element.dataset.side===side);
   const button=[...(pane?.querySelectorAll('.duo-app-button')||[])].find(element=>element.dataset.app===app),icon=button?.querySelector('.duo-icon-tile');
   const hit=document.elementFromPoint(x,y),hitButton=hit?.closest('.duo-app-button'),hitIcon=hit?.closest('.duo-icon-tile'),hitPane=hitButton?.closest('.duo-pane');
   const box=element=>{if(!element)return null;const r=element.getBoundingClientRect();return [r.x,r.y,r.width,r.height];};
   const close=(a,b)=>!!a&&!!b&&a.length===b.length&&a.every((value,index)=>Math.abs(value-b[index])<.25);
   const workspace=window.PeakDuo?.getState?.()?.workspace||null,p=workspace?.panes||null;
   const signature=JSON.stringify({expanded:workspace?.expanded??null,layout:workspace?.layout??null,ratio:workspace?.ratio??null,active:workspace?.active??null,left:p?.left?[p.left.app,p.left.home]:null,right:p?.right?[p.right.app,p.right.home]:null,orientation:root?.dataset.orientation??null});
   const transitioning=!root||root.classList.contains('duo-folding')||root.classList.contains('duo-orientation-turning')||root.getAnimations({subtree:true}).some(animation=>animation.playState==='running'&&animation.effect?.getTiming().iterations!==Infinity);
   const bounds={icon:box(icon),pane:box(pane),bank:box(bank)},sameBounds=Object.keys(bounds).every(key=>close(bounds[key],settled.sourceBounds[key]));
   const exactSource=hitButton===button&&hitIcon===icon&&hitPane===pane&&hitPane?.dataset.side===side&&hitButton?.dataset.app===app;
   return {ok:exactSource&&sameBounds&&!transitioning&&signature===settled.signature,exactSource,sameBounds,transitioning,signatureMatches:signature===settled.signature,point:{x,y},hit:{tag:hit?.tagName||null,className:typeof hit?.className==='string'?hit.className:null,app:hitButton?.dataset.app||null,side:hitPane?.dataset.side||null},bounds,settledBounds:settled.sourceBounds};
  }''',{'side':side,'app':app,'x':point['x'],'y':point['y'],'settled':settled})
 def drag_from_icon(side,app,destination):
  deadline=time.monotonic()+5;attempts=[]
  while time.monotonic()<deadline:
   remaining=max(1,int((deadline-time.monotonic())*1000));ready=wait_for_drag_source(side,app,remaining)
   if not ready['ok']:
    attempts.append({'readiness':ready});break
   target=destination()
   page.mouse.move(ready['center']['x'],ready['center']['y'])
   hit=drag_source_hit(side,app,ready['center'],ready)
   attempts.append({'hit':hit,'target':target,'stableFrames':ready['stableFrames']})
   if hit['ok']:
    page.mouse.down();page.mouse.move(target['x'],target['y'],steps=6);page.mouse.up();return
  raise AssertionError(f'native drag could not settle on the requested source icon {side}/{app} within 5s: {attempts[-6:]}')
 # A real Chromium pointer drag starts native HTML DND, cancels pointer capture,
 # and bubbles a drop from the launcher's own label. That drop must not launch.
 camera_button=page.locator('.duo-pane[data-visible=true] .duo-app-button[data-app=camera]')
 camera_name=camera_button.locator('.duo-app-name');camera_side=camera_button.evaluate("button=>button.closest('.duo-pane').dataset.side")
 raf_timeout=wait_for_drag_source(camera_side,'camera',75,suspend_raf=True)
 assert not raf_timeout['ok'] and raf_timeout['deadlineExpired'] and not raf_timeout['trail'],f'suspended animation frames must return a bounded source-settle diagnostic: {raf_timeout}'
 clear_trace();drag_from_icon(camera_side,'camera',app_label_point(camera_side,'camera'));label_drag=trace()
 assert any(e['type']=='dragstart' and e['app']=='camera' for e in label_drag),label_drag
 assert any(e['type']=='drop' and e['app']=='camera' and e['targetApp']=='camera' and e['targetSide']==camera_side for e in label_drag),label_drag
 assert not page.evaluate('PeakDuo.getState().camera'),'dropping Camera on its own label must not open it'
 camera_name.click();assert not page.evaluate('PeakDuo.getState().camera'),'camera label click must not launch through pointer capture'
 gap=page.evaluate('''()=>{const b=document.querySelector('.duo-pane[data-visible=true] .duo-app-button[data-app=camera]'),i=b.querySelector('.duo-icon-tile').getBoundingClientRect(),n=b.querySelector('.duo-app-name').getBoundingClientRect(),r=b.getBoundingClientRect();return {x:(i.left+i.right)/2,y:(i.bottom+n.top)/2,inside:r.left<=(i.left+i.right)/2&&(i.left+i.right)/2<=r.right&&i.bottom<n.top,paddingX:r.right-2,paddingY:(n.top+n.bottom)/2,paddingInside:r.left<=r.right-2&&r.right-2<=r.right&&r.top<=(n.top+n.bottom)/2&&(n.top+n.bottom)/2<=r.bottom,paddingOutsideIcon:r.right-2<i.left||r.right-2>i.right||(n.top+n.bottom)/2<i.top||(n.top+n.bottom)/2>i.bottom,paddingOutsideName:r.right-2<n.left||r.right-2>n.right}}''')
 assert gap['inside'],f'camera launcher should expose a pointer gap between icon and label: {gap}'
 clear_trace();drag_from_icon(camera_side,'camera',launcher_gap_point(camera_side,'camera'));gap_drag=trace()
 assert any(e['type']=='drop' and e['app']=='camera' and e['targetApp']=='camera' for e in gap_drag),gap_drag
 assert not page.evaluate('PeakDuo.getState().camera'),'dropping Camera in its own launcher gap must not open it'
 assert gap['paddingInside'] and gap['paddingOutsideIcon'] and gap['paddingOutsideName'],f'camera launcher padding point must stay inside the button but outside icon and label: {gap}'
 clear_trace();drag_from_icon(camera_side,'camera',launcher_padding_point(camera_side,'camera'));padding_drag=trace()
 assert any(e['type']=='drop' and e['app']=='camera' and e['targetApp']=='camera' for e in padding_drag),padding_drag
 assert not page.evaluate('PeakDuo.getState().camera'),'dropping Camera outside its icon and label but inside its own button must not open it'
 page.mouse.click(gap['x'],gap['y']);assert not page.evaluate('PeakDuo.getState().camera'),'camera button padding click must not launch through pointer capture'
 camera_button.focus();page.keyboard.press('Enter');assert page.evaluate('PeakDuo.getState().camera'),'focused launcher button must remain keyboard activatable'
 page.keyboard.press('Escape');page.wait_for_timeout(250);assert not page.evaluate('PeakDuo.getState().camera')
 camera_button.locator('.duo-icon-tile').click();assert page.evaluate('PeakDuo.getState().camera'),'real icon pointer click must launch after pointer capture'
 page.wait_for_timeout(400)
 assert page.locator('#duo > .duo-stage > .duo-chassis > .duo-screenbank > .duo-camera').is_visible();bounds=page.locator('#duo > .duo-stage > .duo-chassis > .duo-screenbank > .duo-camera').bounding_box();bank=page.locator('#duo > .duo-stage > .duo-chassis > .duo-screenbank').bounding_box();assert all(abs(bounds[x]-bank[x])<1 for x in ['x','y','width','height']),(bounds,bank)
 assert page.locator('.duo-pane[data-visible=true]').count()==0
 assert page.locator('#duo > .duo-stage > .duo-chassis > .duo-screenbank > .duo-pane .duo-launcher').first.is_hidden()
 shelf=page.locator('.duo-cam-bottom').bounding_box();assert shelf['x']>=bank['x'] and shelf['x']+shelf['width']<=bank['x']+bank['width']
 page.screenshot(path=str(out/'camera-portrait.png'));page.keyboard.press('Escape');page.wait_for_timeout(300);assert not page.locator('#duo > .duo-stage > .duo-chassis > .duo-screenbank > .duo-camera').is_visible();assert not page.evaluate('PeakDuo.getState().camera')
 page.locator('.duo-pane[data-visible=true] .duo-app-button[data-app=camera] .duo-icon-tile').click();page.wait_for_timeout(200);page.locator('[data-camera=exit]').click();page.wait_for_timeout(200);assert not page.evaluate('PeakDuo.getState().camera')
 # A stuck recording finalizer must not block sending the native camera exit.
 result=page.evaluate('''async()=>{const {CameraUI}=await import('/duo/camera-ui.mjs?rev=owner-config-20261015');let sent=false;const recorder={status:'recording',elapsed:0,stop:()=>new Promise(()=>{}),cancel:()=>{}};const ui=new CameraUI({recorder,preview:true,send:async e=>{if(e==='Phone/ExitCamera')sent=true;return {};},notify:()=>{},openGallery:()=>{},target:document.body});ui.show(true);await Promise.race([ui.exit(),new Promise((_,reject)=>setTimeout(()=>reject(Error('exit blocked')),1000))]);const result=sent&&!ui.visible;ui.destroy();return result;}''');assert result
 source=(Path(__file__).with_name('native-layout-browser.mjs')).read_text().replace('export async function','async function')
 try:
  layouts=page.evaluate('async()=>{'+source+';return await checkNativeCameraLayouts();}')
 except Exception:
  try:page.screenshot(path=str(out/'native-layout-failure.png'))
  except Exception as capture_error:print(f'Could not capture native camera failure screenshot: {capture_error}')
  raise
 assert len(layouts)==6,layouts
 # Native drag still opens an app on another launcher target, resolves a
 # full-screen drop to the pointer's side, and crosses panes in split.
 page.evaluate("PeakDuo.setLayout('full')");page.evaluate("PeakDuo.home('left')");page.wait_for_function("() => PeakDuo.getState().workspace.expanded && !document.querySelector('.duo-pane[data-side=left] .duo-launcher').hidden")
 settle_drag_geometry()
 clock_button=launcher('left','clock');clock_name=clock_button.locator('.duo-app-name').bounding_box();bank=page.locator('#duo > .duo-stage > .duo-chassis > .duo-screenbank').bounding_box();clock_name_x=clock_name['x']+clock_name['width']/2
 assert clock_name_x>bank['x']+bank['width']/2,f'Clock own-label regression target must sit in the physical right half: label={clock_name}, bank={bank}'
 clear_trace();drag_from_icon('left','clock',app_label_point('left','clock'));clock_label_drag=trace()
 assert any(e['type']=='drop' and e['app']=='clock' and e['source']=='left' and e['targetApp']=='clock' and e['targetSide']=='left' for e in clock_label_drag),clock_label_drag
 unchanged=page.evaluate('PeakDuo.getState().workspace')
 assert unchanged['layout']=='full' and unchanged['panes']['left']['app'] is None and unchanged['panes']['right']['app'] is None,f'dropping Clock on its own physical-right-half label must not launch it: {unchanged}'
 left_target='camera';target_box=launcher('left',left_target).bounding_box();bank=page.locator('#duo > .duo-stage > .duo-chassis > .duo-screenbank').bounding_box();target_x=target_box['x']+target_box['width']/2;midpoint=bank['x']+bank['width']/2
 assert target_x<midpoint,f'{left_target} must be a distinct launcher target in the physical left half: target={target_box}, midpoint={midpoint}'
 clear_trace();drag_from_icon('left','clock',point_in_box(f'.duo-pane[data-side="left"] .duo-app-button[data-app="{left_target}"]'))
 page.wait_for_function("() => PeakDuo.getState().workspace.layout==='split' && PeakDuo.getState().workspace.panes.left.app==='clock'")
 assert any(e['type']=='drop' and e['app']=='clock' and e['source']=='left' and e['targetApp']==left_target and e['targetSide']=='left' for e in trace()),trace()
 page.evaluate("PeakDuo.setLayout('full')");page.evaluate("PeakDuo.home('left')");page.wait_for_function("() => !document.querySelector('.duo-pane[data-side=left] .duo-launcher').hidden")
 settle_drag_geometry()
 bank=page.locator('#duo > .duo-stage > .duo-chassis > .duo-screenbank').bounding_box();clear_trace();drag_from_icon('left','clock',point_in_box('#duo > .duo-stage > .duo-chassis > .duo-screenbank',.75,.5))
 page.wait_for_function("() => PeakDuo.getState().workspace.layout==='split' && PeakDuo.getState().workspace.panes.right.app==='clock'")
 assert any(e['type']=='drop' and e['app']=='clock' and e['source']=='left' for e in trace()),trace()
 page.evaluate("PeakDuo.home('right')");page.wait_for_function("() => !document.querySelector('.duo-pane[data-side=right] .duo-launcher').hidden")
 settle_drag_geometry()
 left=page.locator('.duo-pane[data-side="left"]').bounding_box();clear_trace();drag_from_icon('right','maps',point_in_box('.duo-pane[data-side="left"]'))
 page.wait_for_function("() => PeakDuo.getState().workspace.layout==='split' && PeakDuo.getState().workspace.panes.left.app==='maps'")
 assert any(e['type']=='drop' and e['app']=='maps' and e['source']=='right' and e['targetSide']=='left' for e in trace()),trace()
 # Releasing a live native drag outside the phone cancels it; unavailable
 # app IDs and browsers without a DragEvent dataTransfer stay inert.
 page.evaluate("PeakDuo.home('left')");page.wait_for_function("() => !document.querySelector('.duo-pane[data-side=left] .duo-launcher').hidden")
 bank=page.locator('#duo > .duo-stage > .duo-chassis > .duo-screenbank').bounding_box();clear_trace();drag_from_icon('left','camera',point_in_box('#duo > .duo-stage > .duo-chassis > .duo-screenbank',0,.5,-10));cancelled_drag=trace()
 assert any(e['type']=='dragstart' and e['app']=='camera' for e in cancelled_drag),cancelled_drag
 assert not any(e['type']=='drop' for e in cancelled_drag),cancelled_drag
 assert not page.evaluate('PeakDuo.getState().camera'),'cancelling a camera drag outside the phone must not open it'
 guards=page.evaluate('''()=>{const pane=document.querySelector('.duo-pane[data-side="left"]'),rect=pane.getBoundingClientRect(),transfer=new DataTransfer();transfer.setData('application/x-peak-duo-app','jobcreator');transfer.setData('application/x-peak-duo-app-source-side','right');const before=JSON.stringify(PeakDuo.getState().workspace),drop=new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer,clientX:rect.left+rect.width/2,clientY:rect.top+rect.height/2});pane.dispatchEvent(drop);const button=pane.querySelector('.duo-app-button[data-app="camera"]'),start=new DragEvent('dragstart',{bubbles:true,cancelable:true});button.dispatchEvent(start);return {dropPrevented:drop.defaultPrevented,workspaceBefore:before,workspaceAfter:JSON.stringify(PeakDuo.getState().workspace),jobcreatorMounted:!!document.querySelector('.duo-app-instance[data-app="jobcreator"]'),missingTransferPrevented:start.defaultPrevented};}''')
 assert guards['dropPrevented'] and guards['workspaceBefore']==guards['workspaceAfter'] and not guards['jobcreatorMounted'],guards
 assert guards['missingTransferPrevented'],guards
 print('PASS native camera layout contracts in folded, landscape and portrait:',layouts)
 assert not errors,errors;print('PASS camera bounds, native exit dispatch with pending save, Escape, close, reopen; no JS errors');b.close()
