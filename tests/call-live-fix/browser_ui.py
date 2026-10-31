"""Shipped shell/app/call UI in Chromium; backend and connected-media state are fixtures."""
from pathlib import Path
import json,sys,os
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tests'))
from browser_harness import mount_offline
OUT=ROOT/'artifacts/call-live-update';(OUT/'screenshots').mkdir(parents=True,exist_ok=True)
checks=[];errors=[]
def check(name,ok):
    if not ok: raise AssertionError(name)
    checks.append(name)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
    page=b.new_page(viewport={'width':1600,'height':1000});page.set_default_timeout(6000)
    page.on('pageerror',lambda e:errors.append(str(e)));mount_offline(page,nui=False)
    # Only the preview backdrop; the actual NUI root/background remains unchanged.
    page.add_style_tag(content='body{background:radial-gradient(ellipse at 20% 0%,#233c41,#0c111a 70%)}')
    def event(data):page.evaluate('d=>window.postMessage(d)',data);page.wait_for_timeout(80)
    def app(name):page.evaluate('n=>window.PeakDuo.openApp(n,"left")',name);page.wait_for_timeout(250)
    def fold(wide):
        if page.evaluate('window.PeakDuo.getState().workspace.expanded')!=wide:page.evaluate('window.PeakDuo.fold()');page.wait_for_timeout(800)
    def shot(name):page.locator('.duo-stage').screenshot(path=str(OUT/'screenshots'/f'{name}.png'))
    app('facetime');check('FaceTime landing renders contacts and recents',page.locator('.ft-brand h1').inner_text()=='FaceTime' and page.locator('.ft-person').count()>0)
    check('FaceTime title is centered in the compact header',page.evaluate('''()=>{const a=document.querySelector('.duo-video-app').getBoundingClientRect(),h=document.querySelector('.ft-brand h1').getBoundingClientRect();return Math.abs((a.left+a.right-h.left-h.right)/2)<4;}'''))
    check('FaceTime history keeps two compact columns',page.evaluate('''()=>getComputedStyle(document.querySelector('.ft-list')).gridTemplateColumns.trim().split(/\\s+/).length===2'''))
    check('FaceTime cards place title, circular large avatar, status, and video action in order',page.evaluate('''()=>{const c=document.querySelector('.ft-person'),r=c.getBoundingClientRect(),t=c.querySelector('.ft-person-name').getBoundingClientRect(),p=c.querySelector('.nx-avatar').getBoundingClientRect(),s=c.querySelector('.ft-person-summary').getBoundingClientRect(),v=c.querySelector('.ft-person-video').getBoundingClientRect();return t.top<p.top&&Math.abs((p.left+p.right-r.left-r.right)/2)<4&&p.height>=64&&Math.abs(p.width-p.height)<2&&p.bottom<=s.top+2&&s.bottom<=r.bottom+1&&v.bottom<=r.bottom+1&&v.left>s.left;}'''))
    fixed_call=page.evaluate('''()=>{const b=document.querySelector('.ft-new'),f=document.querySelector('.ft-dial'),footer=document.querySelector('.ft-footer'),a=document.querySelector('.duo-video-app').getBoundingClientRect(),r=footer.getBoundingClientRect();return {text:b.textContent,icon:!!b.querySelector('.duo-icon'),owns:b.form===f,bottomInset:a.bottom-r.bottom};}''')
    check('Fixed New Call action remains bound to the dial form',fixed_call['text'].find('New Call')>=0 and fixed_call['icon'] and fixed_call['owns'] and fixed_call['bottomInset']>=0 and fixed_call['bottomInset']<36)
    cta=page.evaluate('''()=>{const b=document.querySelector('.ft-new'),r=b.getBoundingClientRect(),a=document.querySelector('.duo-video-app').getBoundingClientRect();return {w:r.width,h:r.height,font:parseFloat(getComputedStyle(b).fontSize),inside:r.left>=a.left&&r.right<=a.right};}''')
    check('Folded New Call stays readable, at least 44px high, and inside its pane',cta['w']>=140 and cta['h']>=43 and 16<=cta['font']<=18 and cta['inside'])
    page.locator('.ft-search input').fill('5550123');page.locator('.ft-new').click()
    composer=page.locator('.ft-dial-composer');compose_number=composer.get_by_role('textbox',name='Phone number or contact')
    check('New Call opens a confirmation composer prefilled from search',composer.is_visible() and compose_number.input_value()=='5550123' and composer.get_by_role('button',name='Call',exact=True).is_enabled())
    check('Camera source and privacy note is readable in the call composer',composer.locator('.ft-compose-privacy').is_visible() and 'in-game character camera' in composer.locator('.ft-compose-privacy').inner_text().lower() and page.evaluate("parseFloat(getComputedStyle(document.querySelector('.ft-compose-privacy')).fontSize)>=12"))
    shot('facetime-new-call-composer')
    composer.get_by_role('button',name='Call',exact=True).click()
    check('Call confirmation reports the preview guard without starting a real call','browser preview' in composer.locator('.ft-compose-status').inner_text().lower())
    composer.get_by_role('button',name='Cancel').click();page.locator('.ft-search input').fill('');page.locator('.ft-new').click();composer=page.locator('.ft-dial-composer')
    check('Blank New Call composer offers existing contacts',composer.locator('.ft-compose-contact').count()>0)
    composer.locator('.ft-compose-contact').first.click()
    check('Selecting a contact prepares its number for explicit Call confirmation',composer.get_by_role('textbox',name='Phone number or contact').input_value()!='' and 'selected' in composer.locator('.ft-compose-status').inner_text().lower() and composer.locator('.ft-compose-call').inner_text().startswith('Call '))
    composer.get_by_role('button',name='Cancel').click()
    original_theme=page.locator('#duo').get_attribute('data-theme')
    page.evaluate("document.querySelector('#duo').setAttribute('data-theme','light')")
    check('FaceTime history retains black canvas and light labels in light appearance',page.evaluate('''()=>getComputedStyle(document.querySelector('.duo-app-instance[data-app="facetime"]')).backgroundColor==='rgb(0, 0, 0)'&&getComputedStyle(document.querySelector('.duo-video-app')).backgroundColor==='rgb(0, 0, 0)'&&getComputedStyle(document.querySelector('.ft-brand h1')).color==='rgb(245, 245, 247)'&&getComputedStyle(document.querySelector('.ft-person-name strong')).color==='rgb(245, 245, 247)' '''))
    if original_theme is None:page.evaluate("document.querySelector('#duo').removeAttribute('data-theme')")
    else:page.evaluate('theme=>document.querySelector("#duo").setAttribute("data-theme",theme)',original_theme)
    page.get_by_role('button',name='Contacts',exact=True).click();page.locator('.ft-search input').fill('zzzz-unmatched')
    check('FaceTime contact search has useful empty state','No matching conversations' in page.locator('.ft-list').inner_text())
    page.locator('.ft-search input').fill('');page.get_by_role('button',name='Recents',exact=True).click();shot('facetime-folded')
    fold(True);shot('facetime-unfolded')
    first_row=page.evaluate('''()=>{const sc=document.querySelector('.ft-scroll').getBoundingClientRect(),footer=document.querySelector('.ft-footer').getBoundingClientRect(),cards=[...document.querySelectorAll('.ft-person')].slice(0,2);return cards.length===2&&cards.every(c=>{const r=c.getBoundingClientRect(),parts=['.ft-person-name','.nx-avatar','.ft-person-summary','.ft-person-video'].map(sel=>c.querySelector(sel)?.getBoundingClientRect());return r.top>=sc.top-1&&r.bottom<=sc.bottom+1&&r.bottom<=footer.top+1&&parts.every(p=>p&&p.top>=sc.top-1&&p.bottom<=sc.bottom+1&&p.bottom<=footer.top+1);});}''')
    check('Unfolded FaceTime first-row title, avatar, status, and video actions fit above the footer',first_row)
    fold(False)
    state={'CallId':'voice-first','Kind':'voice','Status':'active','ContactName':'Jordan Parker','Phone':'5550123','Peer':2,'AudioMode':'voice','StartedAt':1780000000000,'MuteSupported':True,'OutputSupported':True}
    state['StartedAt']=page.evaluate('Date.now()-95000');event({'Action':'Calls/State','Data':state})
    check('Voice call uses shared modern call screen',page.locator('.pc-screen').is_visible() and page.locator('.pc-large-name').inner_text()=='Jordan Parker')
    check('Call minimize and control surfaces keep backdrop filtering disabled',page.evaluate('''()=>['.pc-minimize','.pc-controls'].every(sel=>getComputedStyle(document.querySelector(sel)).backdropFilter==='none')'''))
    check('Expanded call makes app panes inert',page.evaluate('[...document.querySelectorAll(".duo-pane")].every(p=>p.inert)'))
    shot('voice-folded');page.locator('.pc-minimize').click();check('Minimize keeps return-to-call pill',page.locator('.pc-return').is_visible())
    check('Minimized call restores app interaction',page.evaluate('window.PeakDuo.isAppInteractive("facetime")'))
    app('contacts');page.locator('.pc-return').click();check('Call persists when app changes',page.locator('.pc-name').inner_text()=='Jordan Parker')
    fold(True);shot('voice-unfolded');fold(False)
    # Test keyboard focus is retained in the modal without a keyboard trap on Escape.
    page.locator('.pc-minimize').focus();page.keyboard.press('Shift+Tab');check('Call dialog traps reverse Tab on visible controls',page.evaluate('document.activeElement.dataset.callControl')=='end')
    page.keyboard.press('Escape');check('Escape minimizes the call rather than trapping navigation',page.locator('.pc-return').is_visible());page.locator('.pc-return').click()
    page.locator('[data-call-control=end]').click();check('Hangup restores navigation immediately',not page.locator('.pc-screen').is_visible())
    event({'Action':'Calls/State','Data':state});check('Late voice state cannot resurrect ended UI',not page.locator('.pc-screen').is_visible())
    for width,height in [(1280,720),(1600,1000),(1920,1080),(2560,1440)]:
        page.set_viewport_size({'width':width,'height':height})
        for wide in [False,True]:
            fold(wide);cid=f'incoming-{width}-{wide}'
            event({'Action':'Calls/State','Data':{'CallId':cid,'Kind':'video','Status':'ringing','Incoming':True,'ContactName':'Jordan Parker'}})
            check(f'Incoming video accept/decline visible at {width}x{height} wide={wide}',page.locator('.pc-answer').is_visible() and page.locator('.pc-decline').is_visible())
            check(f'Incoming controls fit screen at {width}x{height} wide={wide}',page.evaluate('''()=>{const r=document.querySelector('.pc-screen').getBoundingClientRect();return [...document.querySelectorAll('.pc-answer,.pc-decline,.pc-minimize')].every(n=>{const q=n.getBoundingClientRect();return q.width>=28&&q.height>=28&&q.x>=r.x-1&&q.y>=r.y-1&&q.right<=r.right+1&&q.bottom<=r.bottom+1;});}'''))
            if width==1600:shot('video-incoming-'+('unfolded' if wide else 'folded'))
            page.locator('.pc-decline').click()
    page.set_viewport_size({'width':1600,'height':1000});fold(False);app('facetime')
    pending={'CallId':'app-independent','Kind':'video','Status':'ringing','Incoming':True,'ContactName':'Jordan Parker'}
    event({'Action':'Video/State','Data':pending});event({'Action':'Calls/State','Data':pending})
    page.locator('.pc-minimize').click();page.evaluate('window.PeakDuo.closeApp("left")')
    check('Closing FaceTime page does not destroy shared call UI',page.locator('.pc-return').is_visible() and 'facetime' not in page.evaluate('window.PeakDuo.getState().apps'))
    page.locator('.pc-return').click();page.locator('.pc-decline').click()
    event({'Action':'Notification','Id':'contacts-dial-duplicate','Title':'Duplicate call','Icon':'fas fa-phone','Text':'Legacy call'})
    check('Legacy call notifications do not duplicate the new call surface',page.evaluate('!window.PeakPhoneLegacy.get(window.PeakPhoneLegacy.stores.Notifications).some(n=>n.Id==="contacts-dial-duplicate")'))
    # Mount the real CallUI with a fixture service to test connected-state rendering and controls.
    # This is not claimed to be real incoming WebRTC media or a FiveM camera.
    page.set_viewport_size({'width':1600,'height':1000});fold(False)
    modules={f.name:f.read_text(encoding='utf-8') for f in (ROOT/'web/public/duo').glob('*.mjs')}
    page.evaluate(r'''async modules=>{
      const urls={};function build(n){if(urls[n])return urls[n];return urls[n]=URL.createObjectURL(new Blob([modules[n].replace(/(['"])\.\/([^'"\n]+\.mjs)\1/g,(_,q,d)=>q+build(d)+q)],{type:'text/javascript'}));}
      const {CallUI}=await import(build('call-ui.mjs'));
      const canvas=document.createElement('canvas');canvas.width=640;canvas.height=960;
      const g=canvas.getContext('2d'),gr=g.createLinearGradient(0,0,640,960);gr.addColorStop(0,'#335f67');gr.addColorStop(1,'#182431');g.fillStyle=gr;g.fillRect(0,0,640,960);
      g.fillStyle='#ffffff1a';g.beginPath();g.arc(320,450,155,0,Math.PI*2);g.fill();g.fillStyle='#dfeced';g.font='500 90px sans-serif';g.textAlign='center';g.fillText('JP',320,484);g.font='18px sans-serif';g.fillText('SYNTHETIC CAMERA PREVIEW',320,675);
      const stream=canvas.captureStream(1);window.fixtureTrack=stream.getVideoTracks()[0];
      const service=new EventTarget();Object.assign(service,{closedIds:new Set(),session:{id:'render-video',name:'Jordan Parker',audioMode:'webrtc'},speaker:false,muted:false,video:true,ring(){},stop(id){this.session=null;this.ended={id};stream.getTracks().forEach(t=>t.stop());},snapshot(){return {local:stream,remote:stream,connected:true,micEnabled:!this.muted,videoEnabled:this.video,front:true,speaker:this.speaker,startedAt:Date.now()-110000,ending:this.ended}},setSpeaker(on){this.speaker=on;this.dispatchEvent(new Event('change'))},async muteMicrophone(){this.muted=!this.muted;this.dispatchEvent(new Event('change'))},async toggleCamera(){this.video=!this.video;this.dispatchEvent(new Event('change'))},async flipCamera(){},unlock(){}});
      window.fixtureService=service;window.fixtureCalls=[];
      window.fixtureUI=new CallUI({target:document.querySelector('.duo-screenbank'),service,send:async(route,data)=>{window.fixtureCalls.push({route,data});return {Success:true}},notify:()=>{},openApp:()=>{}});
      fixtureUI.handle({Action:'Calls/State',Data:{CallId:'render-video',Kind:'video',Status:'active',AudioMode:'webrtc',ContactName:'Jordan Parker',StartedAt:Date.now()-110000}});
    }''',modules)
    root=page.locator('.pc-root').last
    check('Connected video binds main feed and local preview',root.locator('.pc-remote').is_visible() and root.locator('.pc-self').is_visible())
    root.locator('[data-call-control=audio]').click()
    page.evaluate("fixtureUI.handle({Action:'Calls/State',Data:{...fixtureUI.state,LocalSpeaker:false}})")
    check('WebRTC Speaker stays selected after later state event',root.locator('[data-call-control=audio]').get_attribute('aria-pressed')=='true')
    root.locator('[data-call-control=mic]').click();check('Microphone control reflects real service state',root.locator('[data-call-control=mic]').get_attribute('aria-pressed')=='true')
    root.locator('[data-call-control=camera]').click();check('Camera paused state is labeled and preview hidden',not root.locator('.pc-pip').is_visible() and root.locator('[data-call-control=camera]').inner_text().strip()=='Camera off')
    root.locator('[data-call-control=camera]').click();shot('video-connected-folded');fold(True);shot('video-connected-unfolded')
    for width,height in [(1280,720),(1600,1000),(1920,1080),(2560,1440)]:
        page.set_viewport_size({'width':width,'height':height})
        for wide in [False,True]:
            fold(wide);page.wait_for_timeout(80)
            check(f'All video controls fit {width}x{height} wide={wide}',page.evaluate('''()=>{const root=fixtureUI.root,r=root.querySelector('.pc-screen').getBoundingClientRect();return [...root.querySelectorAll('[data-call-control]')].filter(n=>n.getClientRects().length).every(n=>{const q=n.getBoundingClientRect();return q.width>=28&&q.height>=28&&q.x>=r.x-1&&q.y>=r.y-1&&q.right<=r.right+1&&q.bottom<=r.bottom+1;});}'''))
            check(f'Video PiP stays inside the call screen and clear of controls {width}x{height} wide={wide}',page.evaluate('''()=>{const root=fixtureUI.root,screen=root.querySelector('.pc-screen').getBoundingClientRect(),pip=root.querySelector('.pc-pip').getBoundingClientRect(),controls=root.querySelector('.pc-controls').getBoundingClientRect(),visible=root.querySelector('.pc-pip').getClientRects().length>0,overlap=!(pip.right<=controls.left+1||pip.left>=controls.right-1||pip.bottom<=controls.top+1||pip.top>=controls.bottom-1);return visible&&pip.width>=28&&pip.height>=28&&pip.left>=screen.left-1&&pip.top>=screen.top-1&&pip.right<=screen.right+1&&pip.bottom<=screen.bottom+1&&!overlap;}'''))
    root.locator('[data-call-control=end]').click();check('Connected hangup releases track and call UI',page.evaluate('fixtureTrack.readyState==="ended" && fixtureUI.root.hidden'))
    page.evaluate('fixtureUI.destroy()');check('No runtime page errors',not errors)
    report={'passed':len(checks),'checks':checks,'pageErrors':errors,'method':'Actual shipped shell/CSS/components in Chromium; synthetic backend and connected-media fixtures. No FiveM or production TURN test.'}
    (OUT/'browser-ui-results.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2));b.close()
