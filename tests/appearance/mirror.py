"""Verify actual physical display snapshots render both themes in sandboxed mirrors."""
from pathlib import Path
import os, json
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(os.environ.get('APPEARANCE_OUT', str(ROOT/'artifacts/ios-theme-redesign')))
OUT.mkdir(parents=True, exist_ok=True)
viewport = {'width': 1440, 'height': 1100}
if raw_viewport := os.environ.get('APPEARANCE_VIEWPORT'):
    width, height = (int(size) for size in raw_viewport.lower().split('x', 1))
    if width <= 0 or height <= 0: raise ValueError('APPEARANCE_VIEWPORT must use positive WIDTHxHEIGHT CSS pixels')
    viewport = {'width': width, 'height': height}
with sync_playwright() as pw:
    options = {'headless': True}
    if os.environ.get('CHROMIUM_PATH'): options['executable_path'] = os.environ['CHROMIUM_PATH']
    browser = pw.chromium.launch(**options)
    page = browser.new_page(viewport=viewport)
    page.goto(os.environ.get('PREVIEW_URL', 'http://127.0.0.1:8794'))
    page.wait_for_function('window.PeakDuo?.preview')
    results = page.evaluate('''async () => {
      await document.fonts.ready;
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const {displaySnapshot,encodeDisplay}=await import('/duo/screen-capture.mjs');
      const frame=document.createElement('iframe');frame.id='appearance-mirror';
      frame.style.cssText='position:fixed;left:0;top:0;width:2048px;height:1024px;z-index:100000;transform:scale(.5);transform-origin:0 0';
      const loaded=new Promise(resolve=>frame.onload=resolve);frame.src='/duo/physical-screen.html';document.body.append(frame);await loaded;
      await PeakDuo.openApp('settings');PeakDuo.setPhoneSetting('motion',true);
      const toastText='A game camera is not available in browser preview.';
      let latestErrorContext=null;
      window.addEventListener('duo:request-error',event=>{latestErrorContext=event.detail?.context??latestErrorContext;});
      const focusBefore=document.activeElement;
      await window.PeakPhoneTransport('Phone/CapturePhoto').catch(()=>{});
      if(document.activeElement!==focusBefore)throw Error('Phone feedback stole keyboard focus');
      const root=document.querySelector('#duo'),bank=root?.querySelector('.duo-screenbank'),toast=bank?.querySelector('.duo-toast');
      if(!toast||toast.hidden||toast.textContent!==toastText||document.querySelector('.duo-global-overlays .duo-toast'))throw Error('Transient phone status is not contained in the screen bank');
      const parkedClockLayer=root.querySelector('.duo-clock-alert-layer'),parkedClockModal=parkedClockLayer?.querySelector('.duo-clock-alert-panel[aria-modal="true"]');
      if(!parkedClockLayer?.hidden||!parkedClockModal||!parkedClockModal.closest('[hidden]'))throw Error('Hidden Clock alert parking fixture is missing');
      if(toast.getAttribute('role')!=='status'||toast.getAttribute('aria-live')!=='polite'||toast.getAttribute('aria-atomic')!=='true')throw Error('Phone status lost its polite, atomic live semantics');
      const toastBounds=toast.getBoundingClientRect(),bankBounds=bank.getBoundingClientRect();
      if(toastBounds.left<bankBounds.left-1||toastBounds.right>bankBounds.right+1||toastBounds.top<bankBounds.top-1||toastBounds.bottom>bankBounds.bottom+1)throw Error('Transient phone status escapes the screen bank');
      if(getComputedStyle(toast).pointerEvents!=='none')throw Error('Transient phone status intercepts app controls');
      const box=node=>{const r=node.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
      const dispatchFeedback=message=>{if(latestErrorContext==null)throw Error('No current transport context for copied-status replacement');window.dispatchEvent(new CustomEvent('duo:request-error',{detail:{context:latestErrorContext,error:new Error(message)}}));};
      const assertSameBox=(label,first,second)=>{if(['left','top','right','bottom','width','height'].some(key=>Math.abs(first[key]-second[key])>1)){const style=getComputedStyle(toast),parent=toast.parentElement,parentStyle=parent&&getComputedStyle(parent),rect=node=>node?.getBoundingClientRect().toJSON(),faces=[...document.fonts].map(face=>({family:face.family,status:face.status,weight:face.weight,style:face.style})),animations=[...document.getAnimations()].map(item=>({name:item.animationName||item.effect?.getKeyframes?.().map(frame=>Object.keys(frame).join('/')).join(','),target:item.effect?.target?{tag:item.effect.target.tagName,id:item.effect.target.id,classes:item.effect.target.className?.toString?.(),parent:item.effect.target.parentElement?.className}:null,playState:item.playState,currentTime:item.currentTime,startTime:item.startTime,playbackRate:item.playbackRate,timing:item.effect?.getComputedTiming?.()&&{duration:item.effect.getComputedTiming().duration,endTime:item.effect.getComputedTiming().endTime,progress:item.effect.getComputedTiming().progress}}));throw Error(label+' moved while copied feedback was animating or being replaced '+JSON.stringify({first,second,layout:{orientation:document.querySelector('#duo')?.dataset.orientation,expanded:document.querySelector('#duo')?.dataset.expanded,layout:document.querySelector('#duo')?.dataset.layout,active:document.querySelector('#duo')?.dataset.active,center:document.querySelector('#duo')?.dataset.center,theme:document.querySelector('#duo')?.dataset.theme,visible:document.querySelector('#duo')?.dataset.visible,parent:parent?.className,parentRect:rect(parent),parentDisplay:parentStyle?.display,parentFont:parentStyle?.font,parentHeight:parentStyle?.height,toastText:toast.textContent,textLength:toast.textContent?.length,toast:rect(toast),toastFont:{family:style.fontFamily,size:style.fontSize,weight:style.fontWeight,lineHeight:style.lineHeight,letterSpacing:style.letterSpacing,width:style.width,height:style.height,minHeight:style.minHeight,maxHeight:style.maxHeight,display:style.display,position:style.position,transition:style.transition,animation:style.animation,boxSizing:style.boxSizing},content:{offsetHeight:toast.offsetHeight,clientHeight:toast.clientHeight,scrollHeight:toast.scrollHeight,clientWidth:toast.clientWidth,scrollWidth:toast.scrollWidth},fonts:{status:document.fonts.status,check:document.fonts.check(style.font,toast.textContent),faces},animations}}));}};
      const assertContained=label=>{const r=box(toast),b=box(bank);if(r.left<b.left-1||r.right>b.right+1||r.top<b.top-1||r.bottom>b.bottom+1)throw Error(label+' escaped the screen bank '+JSON.stringify({toast:r,bank:b}));};
      const nextFrames=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const previewHeartbeat=await window.PeakPhoneTransport('Calls/Heartbeat',{CallId:'mirror-preview-heartbeat'});
      if(previewHeartbeat?.Success!==true)throw Error('Browser preview must acknowledge a synthetic call heartbeat using the live callback response shape');
      const checkCopiedReplacement=async(label,{expectedParent=toast.parentElement,reroute=null}={})=>{
        await document.fonts.load(getComputedStyle(toast).font,'Copied to clipboard Replacement status after clipboard feedback.');
        await document.fonts.ready;
        dispatchFeedback('Copied to clipboard');
        const started=box(toast),animation=toast.getAnimations().find(item=>item.playState==='running');
        if(!animation)throw Error(label+' did not run the copied-feedback animation');
        animation.currentTime=95;
        if(Math.abs(animation.currentTime-95)>1)throw Error(label+' could not sample the copied-feedback animation at 95 ms');
        const inFlight=box(toast);
        if(animation.playState!=='running')throw Error(label+' copied-feedback animation ended before the in-flight sample');
        assertSameBox(label+' copied in-flight',started,inFlight);
        if(reroute){await reroute();await nextFrames();if(!toast.getAnimations().some(item=>item.playState==='running'))throw Error(label+' reroute canceled the copied animation before replacement');}
        if(expectedParent&&toast.parentElement!==expectedParent)throw Error(label+' toast did not reach its replacement parent');
        const replacementText='Replacement status after clipboard feedback.';
        dispatchFeedback(replacementText);
        await nextFrames();
        if(animation.playState!=='idle'||toast.getAnimations().includes(animation))throw Error(label+' replacement retained the copied animation');
        if(toast.getAnimations().some(item=>item.playState==='running'))throw Error(label+' replacement left an animation running');
        if(expectedParent&&toast.parentElement!==expectedParent)throw Error(label+' replacement moved the toast out of its target flow');
        const replaced=box(toast);
        if(toast.textContent!==replacementText)throw Error(label+' replacement text changed before its first geometry sample '+JSON.stringify({expected:replacementText,actual:toast.textContent}));
        await new Promise(resolve=>setTimeout(resolve,110));
        const settled=box(toast);
        if(toast.textContent!==replacementText)throw Error(label+' replacement text changed before its settled geometry sample '+JSON.stringify({expected:replacementText,actual:toast.textContent}));
        assertSameBox(label+' after replacement',replaced,settled);
        assertContained(label+' replacement');
        return {label,theme:document.querySelector('#duo').dataset.theme,parent:toast.parentElement.className,inFlight,replaced,settled};
      };
      const results=[];
      for(const theme of ['light','dark']) {
        PeakDuo.setPhoneSetting('appearance',theme);
        await new Promise(r=>setTimeout(r,250));
        const root=document.querySelector('#duo'),snapshot=displaySnapshot(root.querySelector('.duo-screenbank'),root,PeakDuo.getState().workspace.expanded);
        frame.contentWindow.postMessage({type:'frame',frame:await encodeDisplay(snapshot)},'*');
        let doc;
        for(let i=0;i<150;i++) {
          await new Promise(r=>setTimeout(r,20));
          doc=frame.contentDocument.querySelector(snapshot.expanded?'#display':'#cover-display')?.contentDocument;
          if(doc?.querySelector('#duo')?.dataset.theme===theme && doc.querySelector('.ps-settings'))break;
        }
        const mirrorRoot=doc?.querySelector('#duo');
        if(mirrorRoot?.dataset.theme!==theme)throw Error('Mirror did not adopt '+theme);
        if(mirrorRoot.getAttribute('aria-hidden')!=='true'||!mirrorRoot.hasAttribute('inert'))throw Error('Physical mirror is exposed as a second accessible device');
        const mirroredToast=doc.querySelector('.duo-screenbank .duo-toast');
        if(!mirroredToast||mirroredToast.hidden||mirroredToast.textContent!==toastText)throw Error('Transient status is missing from the physical mirror');
        if(mirroredToast.getAttribute('role')!=='status'||mirroredToast.getAttribute('aria-live')!=='polite'||mirroredToast.getAttribute('aria-atomic')!=='true')throw Error('Mirror status lost its semantic attributes');
        const toastStyle=doc.defaultView.getComputedStyle(mirroredToast);
        const channel=value=>Number(value)/255,linear=value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4,luminance=color=>{const values=color.match(/[0-9.]+/g).slice(0,3).map(channel).map(linear);return values[0]*.2126+values[1]*.7152+values[2]*.0722;};
        const contrast=(()=>{const values=[luminance(toastStyle.color),luminance(toastStyle.backgroundColor)].sort((a,b)=>a-b);return (values[1]+.05)/(values[0]+.05);})();
        const toastRect=mirroredToast.getBoundingClientRect(),mirrorBank=doc.querySelector('.duo-screenbank').getBoundingClientRect();
        if(contrast<4.5||toastStyle.pointerEvents!=='none'||toastRect.left<mirrorBank.left-1||toastRect.right>mirrorBank.right+1)throw Error('Mirrored status is not legible, contained, or blocks controls');
        const owner=document.querySelector('.ps-settings'),mirrored=doc.querySelector('.ps-settings');
        if(!mirrored)throw Error('Mirror lacks Settings');
        const ownerStyle=getComputedStyle(owner),mirrorStyle=doc.defaultView.getComputedStyle(mirrored);
        if(ownerStyle.backgroundColor!==mirrorStyle.backgroundColor || ownerStyle.color!==mirrorStyle.color)throw Error('Owner/mirror palette mismatch');
        if(doc.querySelector('script'))throw Error('Mirror is not script-free');
        results.push({theme,background:mirrorStyle.backgroundColor,color:mirrorStyle.color,toast:toastStyle.backgroundColor,toastTextColor:toastStyle.color,toastContrast:contrast,toastText:mirroredToast.textContent});
        await PeakDuo.setPhoneSetting('motion',false);
        results.push(await checkCopiedReplacement('screen bank '+theme,{expectedParent:bank}));
        await PeakDuo.setPhoneSetting('motion',true);
        dispatchFeedback(toastText);
      }
      PeakDuo.sendPreview({Action:'Duo/Reset'});
      if(!toast.hidden||toast.textContent)throw Error('Character reset retained stale phone status');
      const {setPreviewDelay}=window.PeakDuo.previewAdapter;
      setPreviewDelay('Stale/OldRequest',900);
      const stale=window.PeakPhoneTransport('Stale/OldRequest').catch(()=>{});
      await new Promise(r=>setTimeout(r,15));
      PeakDuo.sendPreview({Action:'ClosePhone'});
      if(!toast.hidden||toast.textContent)throw Error('Phone close retained stale phone status');
      await PeakDuo.open();
      await window.PeakPhoneTransport('Phone/CapturePhoto').catch(()=>{});
      if(toast.hidden||toast.textContent!==toastText)throw Error('Current transport error did not show on the reopened phone');
      await stale;
      if(toast.hidden||toast.textContent!==toastText)throw Error('A late old-generation error replaced current phone status');
      window.postMessage({Action:'Duo/IdentityChanging'},'*');
      await new Promise(r=>setTimeout(r,20));
      if(!toast.hidden||toast.textContent)throw Error('Identity change retained stale phone status');
      const preview=window.PeakDuo.previewAdapter;
      preview.previewPlayer.DeviceLocked=true;
      await PeakDuo.open();
      if(!toast.hidden||toast.textContent)throw Error('Locked phone open retained stale status');
      await window.PeakPhoneTransport('Phone/CapturePhoto').catch(()=>{});
      if(!toast.hidden)throw Error('Locked phone displayed app feedback');
      preview.previewPlayer.DeviceLocked=false;
      await PeakDuo.open();
      const intersects=(first,second)=>first.left<second.right&&first.right>second.left&&first.top<second.bottom&&first.bottom>second.top;
      window.postMessage({Action:'ShowCameraOverlay',Visible:true},'*');
      await new Promise(r=>setTimeout(r,20));
      if(document.querySelector('#duo').dataset.camera!=='true')throw Error('Synthetic camera overlay did not open');
      await window.PeakPhoneTransport('Phone/CapturePhoto').catch(()=>{});
      const cameraControls=document.querySelector('.duo-cam-controls')?.getBoundingClientRect();
      const cameraButton=[...document.querySelectorAll('.duo-cam-controls button')].find(button=>button.getClientRects().length&&intersects(toast.getBoundingClientRect(),button.getBoundingClientRect()));
      if(!cameraControls||cameraButton)throw Error('Phone status covers a camera control '+JSON.stringify({toast:toast.getBoundingClientRect().toJSON(),controls:cameraButton?.getBoundingClientRect().toJSON(),camera:cameraControls?.toJSON(),bank:bank.getBoundingClientRect().toJSON()}));
      window.postMessage({Action:'ShowCameraOverlay',Visible:false},'*');
      await new Promise(r=>setTimeout(r,20));
      const assertVisibleStatus=()=>{if(toast.hidden||!toast.textContent||!toast.getClientRects().length)throw Error('Phone status expired before its geometry was checked '+JSON.stringify({hidden:toast.hidden,text:toast.textContent,parent:toast.parentElement?.className,rect:toast.getBoundingClientRect().toJSON(),center:document.querySelector('#duo')?.dataset.center,camera:document.querySelector('#duo')?.dataset.camera}));};
      const statusButton=document.querySelector('.duo-pane[data-active="true"] .duo-status-controls')||document.querySelector('.duo-status-controls');
      statusButton.click();
      await new Promise(r=>setTimeout(r,30));
      if(document.querySelector('#duo').dataset.center!=='true')throw Error('Control Center did not open for status geometry validation');
      if(latestErrorContext==null)throw Error('No live transport context was captured for Control Center status validation');
      window.dispatchEvent(new CustomEvent('duo:request-error',{detail:{context:latestErrorContext,error:new Error(toastText)}}));
      await new Promise(r=>setTimeout(r,0));
      assertVisibleStatus();
      const longStatus='This note is too large to send safely; remove some text and try again. It remains saved as a local draft on this phone, so you can shorten it and try once more. Save when ready.';
      if(longStatus.length!==177)throw new Error(`Expected 177-character status, got ${longStatus.length}`);
      const centerToastParent=document.querySelector('.duo-control-center .cc-content');
      const assertControlCenterLayout=async theme=>{
        dispatchFeedback(longStatus);
        await nextFrames();
        assertVisibleStatus();
        if(toast.parentElement!==centerToastParent||!toast.previousElementSibling?.classList.contains('cc-status')||!toast.nextElementSibling?.classList.contains('cc-grid'))throw Error('Phone status is not placed in Control Center content flow');
        if(!parkedClockLayer.hidden||!parkedClockModal.closest('[hidden]'))throw Error('Hidden Clock alert layer was unexpectedly presented during Control Center validation');
        const centerToastStyle=getComputedStyle(toast);
        if(centerToastStyle.position!=='relative'||Math.abs(parseFloat(centerToastStyle.top))>1||Math.abs(parseFloat(centerToastStyle.bottom))>1)throw Error('Control Center status inherited the bank modal offset from a parked Clock alert '+JSON.stringify({position:centerToastStyle.position,top:centerToastStyle.top,bottom:centerToastStyle.bottom}));
        const center=document.querySelector('.duo-control-center'),grid=center?.querySelector('.cc-grid');
        const centerToastBounds=toast.getBoundingClientRect(),centerBounds=bank.getBoundingClientRect();
        if(centerToastBounds.left<centerBounds.left-1||centerToastBounds.right>centerBounds.right+1||centerToastBounds.top<centerBounds.top-1||centerToastBounds.bottom>centerBounds.bottom+1)throw Error('Long Control Center status escapes the screen bank');
        const visibleControls=[...center.querySelectorAll('button,input')].filter(control=>control.getClientRects().length);
        if(!visibleControls.length||visibleControls.some(control=>intersects(centerToastBounds,control.getBoundingClientRect())))throw Error('Visible phone status covers a Control Center control');
        const utilities=[...grid.querySelectorAll(':scope > .cc-utility')];
        if(!utilities.length)throw Error('Control Center utility shortcuts are missing');
        const minimumTargetHeight=innerHeight*.05-1;
        const targetHeights=utilities.map(button=>button.getBoundingClientRect().height);
        if(targetHeights.some(height=>height<minimumTargetHeight))throw Error('Control Center utility shortcut target is too short '+JSON.stringify({minimumTargetHeight,targetHeights,tracks:getComputedStyle(grid).gridTemplateRows}));
        for(const button of utilities){const icon=button.querySelector('.duo-icon');if(!icon)throw Error('Control Center utility shortcut is missing its icon '+button.getAttribute('aria-label'));const outer=button.getBoundingClientRect(),inner=icon.getBoundingClientRect();if(inner.left<outer.left-1||inner.top<outer.top-1||inner.right>outer.right+1||inner.bottom>outer.bottom+1)throw Error('Control Center shortcut icon overflows its button '+button.getAttribute('aria-label'));}
        const sliders=[...center.querySelectorAll('.cc-slider input[type="range"]')];
        if(sliders.length!==2||sliders.some(input=>input.disabled||!input.getAttribute('aria-label')||!input.getClientRects().length||intersects(centerToastBounds,input.getBoundingClientRect())))throw Error('Long status blocks or hides a Control Center slider input '+JSON.stringify(sliders.map(input=>({label:input.getAttribute('aria-label'),disabled:input.disabled,rect:input.getBoundingClientRect().toJSON()}))));
        const railControls=[...center.querySelectorAll('.cc-group-rail .cc-rail-control')],dismiss=center.querySelector('.cc-dismiss');
        if(railControls.length!==4||railControls.some(button=>button.disabled||!button.getClientRects().length||intersects(centerToastBounds,button.getBoundingClientRect()))||!dismiss||dismiss.disabled||!dismiss.getClientRects().length||intersects(centerToastBounds,dismiss.getBoundingClientRect()))throw Error('Long status blocks or hides Control Center rail or dismiss controls');
        const gridStyle=getComputedStyle(grid);
        if(gridStyle.overflowY!=='auto'||gridStyle.overflowX!=='hidden')throw Error('Control Center shortcut overflow is not contained in a scrollable grid '+JSON.stringify({overflowX:gridStyle.overflowX,overflowY:gridStyle.overflowY,clientHeight:grid.clientHeight,scrollHeight:grid.scrollHeight}));
        const scrollbarDisplay=getComputedStyle(grid,'::-webkit-scrollbar').display;
        if(gridStyle.scrollbarWidth!=='none'||scrollbarDisplay!=='none')throw Error('Control Center grid exposes a native scrollbar instead of the unobtrusive hidden-scrollbar treatment '+JSON.stringify({scrollbarWidth:gridStyle.scrollbarWidth,scrollbarDisplay}));
        const startScroll=grid.scrollTop;
        let lastShortcutReachable=false;
        if(grid.scrollHeight>grid.clientHeight+1){grid.scrollTop=grid.scrollHeight;await nextFrames();const last=utilities.at(-1).getBoundingClientRect(),viewport=grid.getBoundingClientRect();lastShortcutReachable=last.top>=viewport.top-1&&last.bottom<=viewport.bottom+1;grid.scrollTop=startScroll;await nextFrames();}
        else{const last=utilities.at(-1).getBoundingClientRect(),viewport=grid.getBoundingClientRect();lastShortcutReachable=last.top>=viewport.top-1&&last.bottom<=viewport.bottom+1;}
        if(!lastShortcutReachable)throw Error('Last Control Center shortcut cannot be reached inside the bounded grid scroll area');
        const focusBefore=document.activeElement,lastButton=utilities.at(-1);
        lastButton.focus();
        await nextFrames();
        const focusedRect=lastButton.getBoundingClientRect(),focusViewport=grid.getBoundingClientRect();
        const focusedShortcutReachable=document.activeElement===lastButton&&focusedRect.top>=focusViewport.top-1&&focusedRect.bottom<=focusViewport.bottom+1;
        if(focusBefore?.isConnected)focusBefore.focus({preventScroll:true});
        grid.scrollTop=startScroll;
        await nextFrames();
        if(!focusedShortcutReachable)throw Error('Keyboard focus cannot scroll the final Control Center shortcut into view');
        return {label:'Control Center long status '+theme,theme,toast:box(toast),grid:{bounds:box(grid),clientHeight:grid.clientHeight,scrollHeight:grid.scrollHeight,overflowY:gridStyle.overflowY,scrollbarWidth:gridStyle.scrollbarWidth,scrollbarDisplay},utilityCount:utilities.length,minTargetHeight:Math.min(...targetHeights),minimumTargetHeight,iconsContained:true,lastShortcutReachable,focusedShortcutReachable,sliderLabels:sliders.map(input=>input.getAttribute('aria-label')),railControlCount:railControls.length,dismissVisible:true};
      };
      for(const theme of ['light','dark']) {
        await PeakDuo.setPhoneSetting('appearance',theme);
        await new Promise(resolve=>setTimeout(resolve,250));
        results.push(await assertControlCenterLayout(theme));
        await PeakDuo.setPhoneSetting('motion',false);
        results.push(await checkCopiedReplacement('Control Center '+theme,{expectedParent:centerToastParent}));
        await PeakDuo.setPhoneSetting('motion',true);
      }
      statusButton.click();
      document.querySelector('.duo-pane[data-active="true"] .duo-home-gesture')?.click();
      await new Promise(r=>setTimeout(r,30));
      window.postMessage({Action:'Calls/State',Data:{CallId:'feedback-test-call',Kind:'voice',Status:'active',ContactName:'Preview caller',StartedAt:Date.now()}},'*');
      await new Promise(r=>setTimeout(r,40));
      await window.PeakPhoneTransport('Phone/CapturePhoto').catch(()=>{});
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      assertVisibleStatus();
      const callScreen=document.querySelector('.pc-screen[role="dialog"]'),callControls=[...document.querySelectorAll('.pc-root button')].filter(button=>button.getClientRects().length);
      const callButton=callControls.find(button=>intersects(toast.getBoundingClientRect(),button.getBoundingClientRect()));
      const callBottom=callScreen?.querySelector('.pc-bottom');
      if(toast.parentElement!==callBottom||toast.nextElementSibling!==callBottom?.querySelector('.pc-controls'))throw Error('Phone status is not placed in active-call content flow');
      const callCenter=callScreen?.querySelector('.pc-center'),callCenterBounds=callCenter?.getBoundingClientRect(),callContent=[...callScreen.querySelectorAll('.pc-avatar,.pc-large-name,.pc-main-status,.pc-privacy')].filter(node=>node.getClientRects().length),coveredCallContent=callContent.find(node=>intersects(toast.getBoundingClientRect(),node.getBoundingClientRect()));
      if(intersects(toast.getBoundingClientRect(),callCenterBounds))throw Error('Phone status covers active-call caller content '+JSON.stringify({toast:toast.getBoundingClientRect().toJSON(),center:callCenterBounds?.toJSON()}));
      if(coveredCallContent)throw Error('Phone status covers active-call identity details '+JSON.stringify({toast:toast.getBoundingClientRect().toJSON(),detail:coveredCallContent.className,detailRect:coveredCallContent.getBoundingClientRect().toJSON()}));
      if(!callControls.length||callButton)throw Error('Phone status covers an active-call control '+JSON.stringify({toast:toast.getBoundingClientRect().toJSON(),button:callButton?.getAttribute('aria-label')||callButton?.textContent,buttonRect:callButton?.getBoundingClientRect().toJSON(),controls:document.querySelector('.pc-controls')?.getBoundingClientRect().toJSON(),bank:bank.getBoundingClientRect().toJSON()}));
      for(const node of callScreen.querySelectorAll('.pc-main-status,.pc-privacy'))if(parseFloat(getComputedStyle(node).fontSize)<10)throw Error('Compact caller detail text fell below the 10px minimum '+node.className);
      for(const theme of ['light','dark']) {
        await PeakDuo.setPhoneSetting('appearance',theme);
        await new Promise(resolve=>setTimeout(resolve,250));
        await PeakDuo.setPhoneSetting('motion',false);
        results.push(await checkCopiedReplacement('active call '+theme,{expectedParent:callBottom}));
        await PeakDuo.setPhoneSetting('motion',true);
      }
      const returnButton=document.querySelector('.pc-return');
      const homeShelfTarget=document.querySelector('.duo-pane[data-active="true"] .duo-call-status-shelf');
      await PeakDuo.setPhoneSetting('appearance','light');
      await new Promise(resolve=>setTimeout(resolve,250));
      await PeakDuo.setPhoneSetting('motion',false);
      results.push(await checkCopiedReplacement('active call to minimized Home reroute',{expectedParent:homeShelfTarget,reroute:async()=>callScreen.querySelector('.pc-minimize').click()}));
      await PeakDuo.setPhoneSetting('motion',true);
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      await window.PeakPhoneTransport('Phone/CapturePhoto').catch(()=>{});
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      assertVisibleStatus();
      const activePane=document.querySelector('.duo-pane[data-active="true"]'),homeViewport=activePane?.querySelector('.duo-home-viewport'),homeShelf=activePane?.querySelector('.duo-call-status-shelf'),shelfToast=toast.getBoundingClientRect(),homeBounds=homeViewport?.getBoundingClientRect();
      if(toast.parentElement!==homeShelf||homeShelf.hidden)throw Error('Minimized-call feedback is not in the active Home launcher shelf');
      if(!returnButton||returnButton.hidden||intersects(shelfToast,returnButton.getBoundingClientRect()))throw Error('Minimized-call status covers or hides the call-return affordance');
      const visibleRect=node=>{const rect=node.getBoundingClientRect(),clip=node.closest('.duo-app-grid')?.getBoundingClientRect();if(!clip)return rect;const left=Math.max(rect.left,clip.left),top=Math.max(rect.top,clip.top),right=Math.min(rect.right,clip.right),bottom=Math.min(rect.bottom,clip.bottom);return right>left&&bottom>top?{left,top,right,bottom}:null;};
      const visibleHomeButtons=[...activePane.querySelectorAll('.duo-app-grid:not([aria-hidden="true"]) .duo-app-button,.duo-dock .duo-app-button,.duo-status-controls,.duo-home-gesture')].map(node=>({node,rect:visibleRect(node)})).filter(item=>item.node.getClientRects().length&&item.rect&&(!item.node.closest('.duo-app-grid')||intersects(item.rect,homeBounds)));
      const coveredHomeButton=visibleHomeButtons.find(item=>intersects(shelfToast,item.rect));
      const pageDots=activePane.querySelector('.duo-page-dots'),dock=activePane.querySelector('.duo-dock'),homeGesture=activePane.querySelector('.duo-home-gesture');
      const callPageCount=pageDots.children.length,callPage=pageDots.querySelector('[aria-current="true"]')?.dataset.page,callAppIds=[...activePane.querySelectorAll('.duo-app-grid .duo-app-button,.duo-dock .duo-app-button')].map(node=>node.dataset.app);
      const statusStrip=activePane.querySelector('.duo-status'),returnBounds=returnButton.getBoundingClientRect(),island=activePane.querySelector('.duo-island'),returnCollision=[activePane.querySelector('.duo-clock'),activePane.querySelector('.duo-status-controls'),island].filter(node=>node&&getComputedStyle(node).visibility!=='hidden'&&getComputedStyle(node).opacity!=='0').find(node=>intersects(returnBounds,node.getBoundingClientRect()));
      const returnName=returnButton.querySelector('.pc-return-name'),returnTime=returnButton.querySelector('.pc-return-time'),returnNameSize=parseFloat(getComputedStyle(returnName).fontSize),returnTimeSize=parseFloat(getComputedStyle(returnTime).fontSize),homeStart=homeViewport.getBoundingClientRect().top;
      if(returnBounds.height<24||returnBounds.height>28||returnNameSize<10||returnTimeSize<10)throw Error('Minimized-call return text or tap target is undersized '+JSON.stringify({height:returnBounds.height,nameSize:returnNameSize,timeSize:returnTimeSize}));
      if(returnBounds.top<statusStrip.getBoundingClientRect().top-1||returnBounds.bottom>statusStrip.getBoundingClientRect().bottom+1||returnBounds.bottom>homeStart-1||returnCollision)throw Error('Minimized-call return affordance is not contained in the top status strip '+JSON.stringify({returnBounds:returnBounds.toJSON(),status:statusStrip.getBoundingClientRect().toJSON(),homeStart,collision:returnCollision?.className}));
      if(coveredHomeButton||intersects(shelfToast,pageDots.getBoundingClientRect())||intersects(shelfToast,dock.getBoundingClientRect())||intersects(shelfToast,homeGesture.getBoundingClientRect()))throw Error('Minimized-call status covers a visible Home, dock, or homebar control '+JSON.stringify({toast:shelfToast.toJSON(),button:coveredHomeButton?.node.getAttribute('aria-label')||coveredHomeButton?.node.textContent,grid:homeBounds?.toJSON(),dots:pageDots.getBoundingClientRect().toJSON(),dock:dock.getBoundingClientRect().toJSON(),home:homeGesture.getBoundingClientRect().toJSON()}));
      for(const theme of ['light','dark']) {
        await PeakDuo.setPhoneSetting('appearance',theme);
        await new Promise(resolve=>setTimeout(resolve,250));
        await PeakDuo.setPhoneSetting('motion',false);
        results.push(await checkCopiedReplacement('minimized Home shelf '+theme,{expectedParent:homeShelf}));
        await PeakDuo.setPhoneSetting('motion',true);
      }
      const callShelfLongStatus='This note is too large to send safely; remove some text and try again. It remains saved as a local draft on this phone, so you can shorten it and try once more. Save when ready.';
      if(callShelfLongStatus.length!==177)throw new Error(`Expected 177-character status, got ${callShelfLongStatus.length}`);
      window.dispatchEvent(new CustomEvent('duo:request-error',{detail:{context:latestErrorContext,error:new Error(callShelfLongStatus)}}));
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      assertVisibleStatus();
      if(toast.textContent!==callShelfLongStatus||toast.getBoundingClientRect().height>12*innerHeight/100+1)throw Error('Long minimized-call status is truncated or exceeds its bounded shelf '+JSON.stringify({expectedLength:callShelfLongStatus.length,actualLength:toast.textContent?.length,expectedText:callShelfLongStatus,actualText:toast.textContent,height:toast.getBoundingClientRect().height,maxHeight:12*innerHeight/100+1,scrollHeight:toast.scrollHeight,clientHeight:toast.clientHeight,viewport:{width:innerWidth,height:innerHeight}}));
      const longBounds=toast.getBoundingClientRect();
      const longCoveredHome=visibleHomeButtons.filter(item=>intersects(longBounds,item.rect)),longCoveredSystem=[returnButton,pageDots,dock,homeGesture].filter(node=>intersects(longBounds,node.getBoundingClientRect()));
      if(longCoveredHome.length||longCoveredSystem.length)throw Error('Long minimized-call status obscures a Home/call control '+JSON.stringify({toast:longBounds.toJSON(),buttons:longCoveredHome.map(item=>({label:item.node.getAttribute('aria-label')||item.node.textContent,rect:item.rect})),system:longCoveredSystem.map(node=>({className:node.className,rect:node.getBoundingClientRect().toJSON()}))}));
      await window.PeakPhoneTransport('Phone/CapturePhoto').catch(()=>{});
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      assertVisibleStatus();
      const shortStatusBounds=toast.getBoundingClientRect();
      if(toast.parentElement!==homeShelf||toast.textContent!==toastText||visibleHomeButtons.some(item=>intersects(shortStatusBounds,item.rect)))throw Error('Short minimized-call status did not remain in the safe Home shelf');
      const settledAppIds=[...activePane.querySelectorAll('.duo-app-grid .duo-app-button,.duo-dock .duo-app-button')].map(node=>node.dataset.app),settledPage=pageDots.querySelector('[aria-current="true"]')?.dataset.page;
      if(pageDots.children.length!==callPageCount||settledPage!==callPage||settledAppIds.join('|')!==callAppIds.join('|'))throw new Error('Showing or expiring Home call feedback changed the active page, page count, or visible app sequence '+JSON.stringify({before:{pages:callPageCount,page:callPage,apps:callAppIds},after:{pages:pageDots.children.length,page:settledPage,apps:settledAppIds}}));
      await PeakDuo.openApp('camera');
      await new Promise(r=>setTimeout(r,30));
      await window.PeakPhoneTransport('Phone/CapturePhoto').catch(()=>{});
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      assertVisibleStatus();
      const camera=document.querySelector('.duo-camera'),cameraActionButtons=[...camera.querySelectorAll('button')].filter(node=>node.getClientRects().length),cameraCovered=cameraActionButtons.find(node=>intersects(toast.getBoundingClientRect(),node.getBoundingClientRect())),reservedShelfHeight=homeShelf.getBoundingClientRect().height;
      if(toast.parentElement!==bank||camera.hidden||cameraCovered||homeShelf.hidden||reservedShelfHeight<10*innerHeight/100-1)throw new Error('Call feedback under the camera overlay must stay on screen without removing Home shelf reservation '+JSON.stringify({parent:toast.parentElement.className,cameraHidden:camera.hidden,covered:cameraCovered?.getAttribute('aria-label'),shelfHidden:homeShelf.hidden,shelfHeight:reservedShelfHeight}));
      camera.querySelector('[data-camera="exit"]').click();
      await new Promise(r=>setTimeout(r,180));
      if(homeShelf.hidden||homeShelf.getBoundingClientRect().height<reservedShelfHeight-1)throw Error('Closing camera removed the reserved minimized-call Home shelf');
      returnButton.click();
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      window.postMessage({Action:'Calls/State',Data:{CallId:'feedback-incoming-call',Kind:'voice',Status:'ringing',Incoming:true,ContactName:'Incoming preview caller'}},'*');
      await new Promise(r=>setTimeout(r,40));
      await window.PeakPhoneTransport('Phone/CapturePhoto').catch(()=>{});
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      assertVisibleStatus();
      const incomingAnswer=callScreen.querySelector('.pc-answer'),incomingDecline=callScreen.querySelector('.pc-decline'),incomingControls=[incomingAnswer,incomingDecline].filter(node=>node.getClientRects().length),incomingContent=[...callScreen.querySelectorAll('.pc-center,.pc-avatar,.pc-large-name,.pc-main-status,.pc-privacy')].filter(node=>node.getClientRects().length),incomingCovered=[...incomingControls,...incomingContent].find(node=>intersects(toast.getBoundingClientRect(),node.getBoundingClientRect()));
      if(!incomingAnswer.getClientRects().length||!incomingDecline.getClientRects().length||incomingCovered)throw Error('Incoming-call feedback obscures caller details or answer/decline controls '+JSON.stringify({toast:toast.getBoundingClientRect().toJSON(),node:incomingCovered?.className||incomingCovered?.getAttribute('aria-label')}));
      window.postMessage({Action:'Calls/Reset'},'*');
      await new Promise(r=>setTimeout(r,30));
      const settledFrames=async()=>{await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));await new Promise(resolve=>setTimeout(resolve,120));await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));};
      const assertFlowStatus=(label,target)=>{
        const style=getComputedStyle(toast),r=box(toast),t=box(target),b=box(bank);
        const hasOffset=value=>value!=='auto'&&(!Number.isFinite(parseFloat(value))||Math.abs(parseFloat(value))>1);
        if(toast.parentElement!==target||style.position!=='relative'||['left','right','top','bottom'].some(property=>hasOffset(style[property])))throw Error(label+' inherited a split-bank offset instead of following its content flow '+JSON.stringify({parent:toast.parentElement?.className,position:style.position,left:style.left,right:style.right,top:style.top,bottom:style.bottom}));
        if(r.left<t.left-1||r.right>t.right+1||r.top<t.top-1||r.bottom>t.bottom+1||r.left<b.left-1||r.right>b.right+1||r.top<b.top-1||r.bottom>b.bottom+1)throw Error(label+' escaped its content flow or screen bank '+JSON.stringify({toast:r,target:t,bank:b}));
        return {toast:r,target:t,bank:b,position:style.position,left:style.left,right:style.right,top:style.top,bottom:style.bottom};
      };
      const emitCurrentStatus=async()=>{
        await window.PeakPhoneTransport('Phone/CapturePhoto').catch(()=>{});
        if(latestErrorContext==null)throw Error('No current transport context for split-feedback geometry validation');
        dispatchFeedback(toastText);await settledFrames();assertVisibleStatus();
      };
      const geometryCases=[];
      PeakDuo.setPhoneSetting('motion',true);
      PeakDuo.setLayout('split');
      PeakDuo.openApp('settings','left');PeakDuo.openApp('kilogram','right');
      for(const theme of ['light','dark']){
        await PeakDuo.setPhoneSetting('appearance',theme);await settledFrames();
        for(const orientation of ['landscape','portrait']){
          if(root.dataset.orientation!==orientation){document.querySelector('.duo-orientation-button')?.click();await settledFrames();}
          if(root.dataset.orientation!==orientation)throw Error('Expanded workspace did not settle into '+orientation);
          for(const side of ['left','right']){
            const app=side==='left'?'settings':'kilogram';
            await PeakDuo.openApp(app,side);await settledFrames();
            const activePane=root.querySelector('.duo-pane[data-active="true"]'),pane=root.querySelector('.duo-pane[data-side="'+side+'"]');
            if(root.dataset.expanded!=='true'||root.dataset.layout!=='split'||root.dataset.active!==side||!activePane||activePane!==pane)throw Error('Split geometry was not settled on '+orientation+'/'+side+' '+JSON.stringify({expanded:root.dataset.expanded,layout:root.dataset.layout,active:root.dataset.active}));
            await emitCurrentStatus();
            const bankStyle=getComputedStyle(toast),bankBox=box(bank),paneBox=box(pane),bankToast=box(toast);
            if(toast.parentElement!==bank||bankStyle.position!=='absolute'||bankToast.left<paneBox.left-1||bankToast.right>paneBox.right+1||bankToast.top<paneBox.top-1||bankToast.bottom>paneBox.bottom+1||bankToast.left<bankBox.left-1||bankToast.right>bankBox.right+1||bankToast.top<bankBox.top-1||bankToast.bottom>bankBox.bottom+1)throw Error('Bank status is not contained by the active '+orientation+'/'+side+' pane '+JSON.stringify({toast:bankToast,pane:paneBox,bank:bankBox}));
            const statusControl=pane.querySelector('.duo-status-controls'),statusControlBox=statusControl?.getBoundingClientRect();
            if(!statusControlBox||!statusControl.getClientRects().length||intersects(bankToast,statusControlBox))throw Error('Bank status moved or obscured fixed Control Center access '+JSON.stringify({toast:bankToast,control:statusControlBox?.toJSON()}));
            geometryCases.push({kind:'bank',theme,orientation,activePane:side,toast:bankToast,bank:bankBox,pane:paneBox,controls:{status:box(statusControl)}});
            statusControl.click();await settledFrames();
            if(root.dataset.center!=='true')throw Error('Control Center did not open for '+orientation+'/'+side+' feedback geometry');
            await emitCurrentStatus();
            const center=root.querySelector('.duo-control-center'),centerContent=center?.querySelector('.cc-content');
            const centerGeometry=assertFlowStatus('Control Center '+theme+'/'+orientation+'/'+side,centerContent);
            const centerControls=[...center.querySelectorAll('button,input')].filter(node=>node.getClientRects().length),centerCovered=centerControls.find(node=>intersects(centerGeometry.toast,node.getBoundingClientRect()));
            if(centerCovered)throw Error('Control Center status obscured a fixed control '+centerCovered.getAttribute('aria-label'));
            geometryCases.push({kind:'control-center',theme,orientation,activePane:side,...centerGeometry,controls:centerControls.map(box)});
            root.querySelector('.duo-pane[data-active="true"] .duo-status-controls')?.click();await settledFrames();
            window.postMessage({Action:'Calls/Reset'},'*');await settledFrames();
            await PeakDuo.home(side);await settledFrames();
            window.postMessage({Action:'Calls/State',Data:{CallId:'feedback-matrix-'+theme+'-'+orientation+'-'+side,Kind:'voice',Status:'active',ContactName:'Geometry preview caller',StartedAt:Date.now()}},'*');
            await new Promise(resolve=>setTimeout(resolve,50));await emitCurrentStatus();
            const callScreen=root.querySelector('.pc-screen[role="dialog"]'),callBottom=callScreen?.querySelector('.pc-bottom');
            const callGeometry=assertFlowStatus('Active call '+theme+'/'+orientation+'/'+side,callBottom);
            const callControls=[...callScreen.querySelectorAll('.pc-controls button')].filter(node=>node.getClientRects().length),callCovered=callControls.find(node=>intersects(callGeometry.toast,node.getBoundingClientRect()));
            if(callCovered)throw Error('Active-call status obscured a fixed call control '+callCovered.getAttribute('aria-label'));
            geometryCases.push({kind:'active-call',theme,orientation,activePane:side,...callGeometry,controls:callControls.map(box)});
            callScreen.querySelector('.pc-minimize')?.click();await settledFrames();await emitCurrentStatus();
            const homePane=root.querySelector('.duo-pane[data-active="true"]'),homeShelf=homePane?.querySelector('.duo-call-status-shelf');
            if(homePane!==pane||!homeShelf||homeShelf.hidden)throw Error('Minimized-call feedback shelf is not parked in the active '+orientation+'/'+side+' pane '+JSON.stringify({active:root.dataset.active,requested:side,homePane:homePane?.dataset.side,homeShelfHidden:homeShelf?.hidden,parent:toast.parentElement?.className,callState:PeakDuo.getState().workspace}));
            const shelfGeometry=assertFlowStatus('Minimized-call shelf '+theme+'/'+orientation+'/'+side,homeShelf);
            const shelfControls=[...homePane.querySelectorAll('.duo-status-controls,.duo-home-gesture,.duo-page-dots,.duo-dock .duo-app-button')].filter(node=>node.getClientRects().length),shelfCovered=shelfControls.find(node=>intersects(shelfGeometry.toast,node.getBoundingClientRect()));
            if(shelfCovered)throw Error('Minimized-call status obscured a fixed Home control '+(shelfCovered.getAttribute('aria-label')||shelfCovered.className));
            geometryCases.push({kind:'minimized-call-shelf',theme,orientation,activePane:side,...shelfGeometry,controls:shelfControls.map(box)});
            window.postMessage({Action:'Calls/Reset'},'*');await settledFrames();
          }
        }
      }
      if(PeakDuo.getState().errors.some(item=>item.event==='Calls/Heartbeat'))throw Error('A synthetic browser call heartbeat reported a transport failure');
      results.push(...geometryCases);
      await PeakDuo.openApp('documents');
      document.querySelector('.notes-new-folder')?.click();
      const sheet=document.querySelector('.nx-sheet[aria-modal="true"]');
      if(!sheet)throw Error('Notes folder sheet did not open for modal feedback validation');
      await window.PeakPhoneTransport('Phone/CapturePhoto').catch(()=>{});
      assertVisibleStatus();
      const sheetControls=[...sheet.querySelectorAll('button,input,textarea,select,[tabindex]')].filter(control=>control.getClientRects().length);
      if(toast.parentElement!==bank)throw Error('Notes folder modal feedback is not bank-positioned');
      const modalToastStyle=getComputedStyle(toast);
      if(Math.abs(parseFloat(modalToastStyle.top)-innerHeight*.06)>1)throw Error('Presented Notes folder modal did not retain the bank toast offset '+JSON.stringify({top:modalToastStyle.top,bottom:modalToastStyle.bottom}));
      if(sheetControls.some(control=>intersects(toast.getBoundingClientRect(),control.getBoundingClientRect())))throw Error('Phone status covers a modal sheet control');
      sheet.querySelector('.nx-sheet-dismiss')?.click();await settledFrames();
      window.postMessage({Action:'Calls/Reset'},'*');await settledFrames();
      await PeakDuo.home(root.dataset.active);await settledFrames();
      if(root.querySelector('.pc-screen[role="dialog"]:not([hidden])')||document.querySelector('.nx-sheet[aria-modal="true"]')||toast.parentElement!==bank)throw Error('Final physical-mirror fixture did not restore the closed-call Home app and bank status target '+JSON.stringify({active:root.dataset.active,toastParent:toast.parentElement?.className,callVisible:!!root.querySelector('.pc-screen[role="dialog"]:not([hidden])'),sheetOpen:!!document.querySelector('.nx-sheet[aria-modal="true"]')}));
      return results;
    }''')
    page.evaluate('''async () => {
      await window.PeakPhoneTransport('Phone/CapturePhoto').catch(()=>{});
      const {displaySnapshot,encodeDisplay}=await import('/duo/screen-capture.mjs');
      const root=document.querySelector('#duo'),frame=document.querySelector('#appearance-mirror');
      const snapshot=displaySnapshot(root.querySelector('.duo-screenbank'),root,PeakDuo.getState().workspace.expanded);
      if(!snapshot.expanded||root.querySelector('.duo-pane[data-home="true"]')==null)throw Error('Final physical-mirror fixture is not on expanded Home '+JSON.stringify({expanded:snapshot.expanded,owner:{expanded:root.dataset.expanded,orientation:root.dataset.orientation,layout:root.dataset.layout,active:root.dataset.active,home:root.querySelector('.duo-pane[data-home="true"]')?.dataset.side}}));
      const orientation=snapshot.attributes['data-orientation'];
      frame.contentWindow.postMessage({type:'frame',clear:true},'*');
      frame.contentWindow.postMessage({type:'pose',expanded:true,orientation},'*');
      frame.contentWindow.postMessage({type:'fold',expanded:true,reduced:true},'*');
      frame.contentWindow.postMessage({type:'frame',frame:await encodeDisplay(snapshot)},'*');
      let doc,mirrorRoot,homePane,innerShutter,coverShutter,mirroredToast;
      for(let i=0;i<150;i++){
        await new Promise(r=>setTimeout(r,20));
        doc=frame.contentDocument.querySelector(snapshot.expanded?'#display':'#cover-display')?.contentDocument;
        mirrorRoot=doc?.querySelector('#duo');
        homePane=mirrorRoot?.querySelector('.duo-pane[data-active="true"][data-home="true"]');
        innerShutter=frame.contentDocument.querySelector('#inner-face .face-shutter');
        coverShutter=frame.contentDocument.querySelector('#cover-face .face-shutter');
        mirroredToast=doc?.querySelector('.duo-screenbank .duo-toast:not([hidden])');
        const mirrorFrameView=frame.contentDocument.defaultView;
        if(mirrorRoot?.dataset.expanded==='true'&&mirrorRoot.dataset.orientation===orientation&&homePane&&Number(mirrorFrameView.getComputedStyle(innerShutter).opacity)===0&&Number(mirrorFrameView.getComputedStyle(coverShutter).opacity)===1&&mirroredToast?.textContent===root.querySelector('.duo-toast')?.textContent)break;
      }
      const ownerToast=root.querySelector('.duo-toast'),ownerHome=root.querySelector('.duo-pane[data-active="true"][data-home="true"]'),mirroredHome=homePane;
      if(mirrorRoot?.dataset.expanded!=='true'||mirrorRoot.dataset.orientation!==orientation||!mirroredHome||Number(frame.contentDocument.defaultView.getComputedStyle(innerShutter).opacity)!==0||Number(frame.contentDocument.defaultView.getComputedStyle(coverShutter).opacity)!==1||!mirroredToast||mirroredToast.textContent!==ownerToast?.textContent)throw Error('Could not settle a fresh expanded Home frame in the physical mirror '+JSON.stringify({snapshot:{expanded:snapshot.expanded,orientation,theme:root.dataset.theme},owner:{visible:root.dataset.visible,expanded:root.dataset.expanded,layout:root.dataset.layout,orientation:root.dataset.orientation,active:root.dataset.active,center:root.dataset.center,home:ownerHome?.dataset.side,toastHidden:ownerToast?.hidden,toastParent:ownerToast?.parentElement?.className,toastText:ownerToast?.textContent},mirror:{url:frame.contentDocument.URL,innerShutter:innerShutter&&frame.contentDocument.defaultView.getComputedStyle(innerShutter).opacity,coverShutter:coverShutter&&frame.contentDocument.defaultView.getComputedStyle(coverShutter).opacity,expanded:mirrorRoot?.dataset.expanded,layout:mirrorRoot?.dataset.layout,orientation:mirrorRoot?.dataset.orientation,active:mirrorRoot?.dataset.active,home:mirroredHome?.dataset.side,hasToast:!!mirroredToast,toastText:mirroredToast?.textContent}}));
      if(doc.querySelector('script')||mirrorRoot.getAttribute('aria-hidden')!=='true'||!mirrorRoot.hasAttribute('inert'))throw Error('Settled physical mirror is not script-free and inaccessible as a secondary device');
      const ownerLauncher=ownerHome?.querySelector('.duo-launcher'),mirrorLauncher=mirroredHome?.querySelector('.duo-launcher'),ownerHeading=ownerHome?.querySelector('.duo-home-heading h1')?.textContent.trim(),mirrorHeading=mirroredHome?.querySelector('.duo-home-heading h1')?.textContent.trim();
      const visibleAppLabels=pane=>{const viewport=pane?.querySelector('.duo-home-viewport'),clip=viewport?.getBoundingClientRect();if(!clip)return[];return [...pane.querySelectorAll('.duo-home-viewport .duo-app-grid .duo-app-button')].filter(button=>{const r=button.getBoundingClientRect();return r.width>0&&r.height>0&&r.right>clip.left&&r.left<clip.right&&r.bottom>clip.top&&r.top<clip.bottom;}).map(button=>button.getAttribute('aria-label')||button.querySelector('.duo-app-name')?.textContent.trim()).filter(Boolean);};
      const ownerLabels=visibleAppLabels(ownerHome),mirrorLabels=visibleAppLabels(mirroredHome);
      const normalizeLabels=labels=>labels.map(label=>label.trim().replace(/\\s+/g,' '));
      const normalizedOwnerLabels=normalizeLabels(ownerLabels),normalizedMirrorLabels=normalizeLabels(mirrorLabels),labelMismatch=normalizedOwnerLabels.findIndex((label,index)=>label!==normalizedMirrorLabels[index]),labelsMatch=labelMismatch<0&&normalizedOwnerLabels.length===normalizedMirrorLabels.length;
      const homeChecks={ownerHome:!!ownerHome,matchingActiveSide:mirroredHome?.dataset.side===ownerHome?.dataset.side,ownerLauncher:!!ownerLauncher,mirrorLauncher:!!mirrorLauncher,mirrorWidth:mirrorLauncher?.getBoundingClientRect().width,mirrorHeight:mirrorLauncher?.getBoundingClientRect().height,ownerHeading,mirrorHeading,ownerLabelCount:ownerLabels.length,orderedLabelsMatch:labelsMatch};
      if(!homeChecks.ownerHome||!homeChecks.matchingActiveSide||!homeChecks.ownerLauncher||!homeChecks.mirrorLauncher||homeChecks.mirrorWidth<=0||homeChecks.mirrorHeight<=0||!homeChecks.ownerLabelCount||!homeChecks.orderedLabelsMatch)throw Error('Physical mirror does not show the owner’s active expanded Home content '+JSON.stringify({homeChecks,ownerLabels,mirrorLabels,normalizedOwnerLabels,normalizedMirrorLabels,labelMismatch,ownerCodes:ownerLabels.map(label=>[...label].map(char=>char.codePointAt(0))),mirrorCodes:mirrorLabels.map(label=>[...label].map(char=>char.codePointAt(0))),launcher:mirrorLauncher?.getBoundingClientRect().toJSON()}));
    }''')
    page.screenshot(path=str(OUT/'physical-mirror-dark.png'),full_page=True)
    (OUT/'mirror.json').write_text(json.dumps(results, indent=2))
    browser.close()
print('PASS: physical mirror shares light/dark Settings palette and stays script-free')
