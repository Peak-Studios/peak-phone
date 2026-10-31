"""Exercise shipped UI on the preview server; screenshots and results are review evidence.
Run with PREVIEW_URL and optionally CHROMIUM_PATH. Requires Python Playwright.
Read-only synthetic fixtures populate server-backed screens; no live transactions run.
"""
from pathlib import Path
import os, json
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[2]
OUT=Path(os.environ.get('APPEARANCE_OUT',str(ROOT/'artifacts/appearance')))
OUT.mkdir(parents=True,exist_ok=True)
URL=os.environ.get('PREVIEW_URL','http://127.0.0.1:8791')
results=[]
contrast=[]
runtime_errors=[]
# These specific content/control surfaces regressed despite the general audit's
# gradient exclusions. Require their actual fill and check interactive icon ink.
surface_cases={
    'calendar': ['.u27-agenda > .nx-button'],
    'documents': ['.nx-notes', '.nx-notes .notes-header', '.nx-notes .notes-folder-row', '.nx-notes .notes-search', '.nx-notes .notes-compose'],
    'racing': ['.glass-bg'], 'time-trials': ['.glass-bg'],
    'busdriver': ['.progress-section'], 'lumberjack': ['.progress-section'],
    'details': ['.gx-action-grid > .nx-button', '.gx-glass'],
    'contacts': ['.gx-segment > .nx-button[aria-pressed="true"]'],
    'facetime': ['.ft-search', '.ft-tabs', '.ft-person-video', '.ft-refresh', '.ft-new'],
    'binge': ['.gx-binge-actions > .nx-button'],
}
def check_surface_ink(page, app, theme):
    failures=page.locator('.duo-app-instance[data-app="'+app+'"]').evaluate('''(root,selectors)=>{
      const failures=[];
      const rgba=value=>value.match(/[\\d.]+/g)?.map(Number)||[0,0,0,0];
      const lum=rgb=>rgb.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
      for(const selector of selectors){
        const surfaces=[...root.querySelectorAll(selector)].filter(n=>!n.closest('[inert],[aria-hidden=true]')&&n.checkVisibility({checkVisibilityCSS:true}));
        if(!surfaces.length){failures.push({selector,reason:'Missing regression surface'});continue;}
        for(const surface of surfaces){
          const css=getComputedStyle(surface),fill=rgba(css.backgroundColor);
          if(css.backgroundImage!=='none'||(fill[3]??1)<.99){failures.push({selector,reason:'Content/control fill must be solid',fill:css.backgroundColor,image:css.backgroundImage});continue;}
          if(surface.closest('.u27-calendar')){
            const ink=rgba(css.color),levels=[lum(ink),lum(fill)].sort((a,b)=>a-b),ratio=(levels[1]+.05)/(levels[0]+.05);
            if(ratio<4.5)failures.push({selector,reason:'Calendar action text contrast below 4.5:1',ratio});
          }
          for(const symbol of surface.querySelectorAll('svg,i')){
            // Decorative artwork has no action; enabled control icons do.
            if(!symbol.closest('button,[role=button],.gh-add')||symbol.closest(':disabled,[aria-disabled=true]')||!symbol.checkVisibility({checkVisibilityCSS:true}))continue;
            let node=symbol,bg;
            while(node&&root.contains(node)){
              const style=getComputedStyle(node),color=rgba(style.backgroundColor);
              if(style.backgroundImage!=='none'){failures.push({selector,reason:'Icon background requires visual review'});break;}
              if((color[3]??1)>=.99){bg=color;break;}
              node=node.parentElement;
            }
            if(!bg)continue;
            const ink=rgba(getComputedStyle(symbol).color),alpha=ink[3]??1;
            const fg=ink.slice(0,3).map((v,i)=>v*alpha+bg[i]*(1-alpha));
            const levels=[lum(fg),lum(bg)].sort((a,b)=>a-b),ratio=(levels[1]+.05)/(levels[0]+.05);
            if(ratio<3)failures.push({selector,reason:'Enabled icon contrast below 3:1',ratio,foreground:getComputedStyle(symbol).color});
          }
        }
      }
      return failures;
    }''',surface_cases[app])
    assert not failures, (theme,app,failures)

def wait_for_notes_catalog(page):
    page.wait_for_function('''() => {
      const notes=document.querySelector('.duo-app-instance[data-app="documents"] .nx-notes');
      return notes?.querySelectorAll('.notes-folder-row[data-type]').length===6
        && !notes.querySelector('.notes-state-loading');
    }''',timeout=10000)

def install_through_store(page, app, name):
    installed=page.evaluate('(id)=>PeakPhoneLegacy.get(PeakPhoneLegacy.stores.InstalledApps)[id]===true',app)
    if installed:return
    page.evaluate("async()=>await PeakDuo.openApp('store','left',{external:true})")
    search=page.get_by_role('searchbox',name='Search available apps')
    search.fill(name)
    row=page.locator('.ios-store-row[data-app-id=\"'+app+'\"]')
    assert row.count()==1, ('App Store catalog entry missing',app)
    row.get_by_role('button',name='Install '+name,exact=True).click()
    page.wait_for_function('(id)=>PeakPhoneLegacy.get(PeakPhoneLegacy.stores.InstalledApps)[id]===true',arg=app)
    assert page.evaluate("(id)=>PeakDuo.requests.some(r=>r.event==='InstallApp'&&r.data.AppId===id)",app), ('App Store install route was not used',app)
    page.evaluate("PeakDuo.home('left')")

def check_f35_compact_layout(page, theme):
    # The ordinary appearance loop uses the folded phone. Keep direct geometry
    # checks here so the calendar action and memo copy are measured, not inferred
    # from CSS selectors or screenshot pixels.
    page.evaluate("PeakDuo.setLayout('full');if(PeakDuo.getState().workspace.expanded)PeakDuo.fold();PeakDuo.home('left')")
    page.wait_for_function('!PeakDuo.getState().workspace.expanded')
    page.wait_for_timeout(700)
    page.evaluate("PeakDuo.openApp('calendar','left',{external:true})")
    page.wait_for_function("document.querySelector('.duo-app-instance[data-app=\"calendar\"] .u27-segment [aria-pressed=\"true\"]')?.textContent==='Schedule'")
    calendar=page.locator('.duo-app-instance[data-app="calendar"]')
    geometry=page.evaluate('''()=>{const app=document.querySelector('.duo-app-instance[data-app="calendar"]'),body=app?.querySelector('.gx-body'),agenda=app?.querySelector('.u27-agenda'),action=agenda?.querySelector('.nx-primary'),home=app?.closest('.duo-pane')?.querySelector('.duo-home-gesture span');return{mode:app?.querySelector('.u27-segment [aria-pressed="true"]')?.textContent,bodyBottom:body?.getBoundingClientRect().bottom,agendaBottom:agenda?.getBoundingClientRect().bottom,actionBottom:action?.getBoundingClientRect().bottom,homeTop:home?.getBoundingClientRect().top}}''')
    assert geometry['mode']=='Schedule' and geometry['agendaBottom']<=geometry['bodyBottom']+1 and geometry['actionBottom']<=geometry['homeTop']+1, (theme,'folded Calendar schedule bounds',geometry)
    page.locator('.duo-pane[data-active=true]').screenshot(path=str(OUT/f'{theme}-calendar-folded-schedule.png'))
    calendar.get_by_role('button',name='Add an event',exact=True).click()
    title=calendar.get_by_role('textbox',name='Title',exact=True)
    title.fill('Folded draft')
    page.evaluate('PeakDuo.fold()')
    page.wait_for_function('PeakDuo.getState().workspace.expanded')
    assert title.input_value()=='Folded draft', (theme,'Calendar draft lost while unfolding')
    calendar.get_by_role('button',name='Cancel',exact=True).click()
    page.wait_for_function("document.querySelector('.duo-app-instance[data-app=\"calendar\"] .u27-segment [aria-pressed=\"true\"]')?.textContent==='Month'")
    page.locator('.duo-pane[data-active=true]').screenshot(path=str(OUT/f'{theme}-calendar-unfolded-month.png'))
    calendar.get_by_role('button',name='New event',exact=True).click()
    event_title=calendar.get_by_role('textbox',name='Title',exact=True)
    event_title.fill('F35 deletion check')
    calendar.get_by_role('button',name='Done',exact=True).click()
    event_row=calendar.get_by_role('button',name='Edit F35 deletion check',exact=True)
    event_row.wait_for(state='visible')
    event_row.click()
    calendar.get_by_role('button',name='Delete Event',exact=True).click()
    page.get_by_role('dialog',name='Delete Event').wait_for(state='visible')
    page.evaluate('PeakDuo.fold()')
    page.wait_for_function('!PeakDuo.getState().workspace.expanded')
    calendar.get_by_role('button',name='Cancel',exact=True).click()
    page.wait_for_function("document.querySelector('.duo-app-instance[data-app=\"calendar\"] .u27-segment [aria-pressed=\"true\"]')?.textContent==='Schedule'")
    assert calendar.get_by_role('button',name='Edit F35 deletion check',exact=True).count()==1, (theme,'canceling a resize-interrupted delete should keep the event')
    page.evaluate('PeakDuo.fold()')
    page.wait_for_function('PeakDuo.getState().workspace.expanded')
    page.wait_for_function("document.querySelector('.duo-app-instance[data-app=\"calendar\"] .u27-segment [aria-pressed=\"true\"]')?.textContent==='Month'")
    calendar.get_by_role('button',name='Edit F35 deletion check',exact=True).click()
    calendar.get_by_role('button',name='Delete Event',exact=True).click()
    page.get_by_role('dialog',name='Delete Event').wait_for(state='visible')
    page.evaluate('PeakDuo.fold()')
    page.wait_for_function('!PeakDuo.getState().workspace.expanded')
    calendar.get_by_role('button',name='Delete Event',exact=True).click()
    page.wait_for_function("document.querySelector('.duo-app-instance[data-app=\"calendar\"] .u27-segment [aria-pressed=\"true\"]')?.textContent==='Schedule'")
    assert calendar.get_by_role('button',name='Edit F35 deletion check',exact=True).count()==0, (theme,'confirming a resize-interrupted delete should remove the event')
    page.evaluate('PeakDuo.fold()')
    page.wait_for_function('PeakDuo.getState().workspace.expanded')
    page.wait_for_function("document.querySelector('.duo-app-instance[data-app=\"calendar\"] .u27-segment [aria-pressed=\"true\"]')?.textContent==='Month'")
    page.locator('.duo-pane[data-active=true]').screenshot(path=str(OUT/f'{theme}-calendar-unfolded-month.png'))
    page.evaluate('PeakDuo.fold()')
    page.wait_for_function('!PeakDuo.getState().workspace.expanded')
    page.wait_for_function("document.querySelector('.duo-app-instance[data-app=\"calendar\"] .u27-segment [aria-pressed=\"true\"]')?.textContent==='Schedule'")
    page.locator('.duo-pane[data-active=true]').screenshot(path=str(OUT/f'{theme}-calendar-folded-schedule.png'))
    calendar.get_by_role('button',name='Month',exact=True).click()
    calendar.locator('.u27-date[data-outside="false"]').nth(3).click()
    selected=calendar.locator('.u27-date[aria-pressed="true"]')
    selected_day=selected.get_attribute('aria-label')
    calendar.get_by_role('button',name='Schedule',exact=True).click()
    calendar.get_by_role('button',name='Month',exact=True).click()
    assert calendar.locator('.u27-date[aria-pressed="true"]').get_attribute('aria-label')==selected_day, (theme,'selected date changed across Calendar modes',selected_day)
    page.evaluate("PeakDuo.openApp('voicememos','left',{external:true})")
    memos=page.locator('.duo-app-instance[data-app="voicememos"]')
    page.wait_for_function("document.querySelector('.duo-app-instance[data-app=\"voicememos\"] .nx-empty p')?.textContent==='Tap record to begin.'")
    page.wait_for_timeout(300)
    def memo_bounds():
        return page.evaluate('''()=>{const app=document.querySelector('.duo-app-instance[data-app="voicememos"]'),body=app?.querySelector('.gx-body'),copy=app?.querySelector('.nx-empty p'),tray=app?.querySelector('.u27-recorder'),record=app?.querySelector('.u27-record-button'),home=app?.closest('.duo-pane')?.querySelector('.duo-home-gesture span');return{copyBottom:copy?.getBoundingClientRect().bottom,bodyBottom:body?.getBoundingClientRect().bottom,trayBottom:tray?.getBoundingClientRect().bottom,recordBottom:record?.getBoundingClientRect().bottom,homeTop:home?.getBoundingClientRect().top}}''')
    bounds=memo_bounds()
    assert bounds['copyBottom']<=bounds['bodyBottom']+1 and bounds['trayBottom']<=bounds['homeTop']+1 and bounds['recordBottom']<=bounds['homeTop']+1, (theme,'folded Voice Memos bounds',bounds)
    page.locator('.duo-pane[data-active=true]').screenshot(path=str(OUT/f'{theme}-voicememos-folded.png'))
    page.evaluate('PeakDuo.fold()')
    page.wait_for_function('PeakDuo.getState().workspace.expanded')
    page.wait_for_timeout(500)
    bounds=memo_bounds()
    assert bounds['copyBottom']<=bounds['bodyBottom']+1 and bounds['trayBottom']<=bounds['homeTop']+1 and bounds['recordBottom']<=bounds['homeTop']+1, (theme,'unfolded Voice Memos bounds',bounds)
    page.locator('.duo-pane[data-active=true]').screenshot(path=str(OUT/f'{theme}-voicememos-unfolded.png'))

with sync_playwright() as pw:
    options={'headless':True}
    if os.environ.get('CHROMIUM_PATH'): options['executable_path']=os.environ['CHROMIUM_PATH']
    browser=pw.chromium.launch(**options)
    page=browser.new_page(viewport={'width':1440,'height':1000})
    page.add_init_script(path=str(ROOT/'tests/appearance/fixtures.js'))
    page.add_init_script(path=str(ROOT/'tests/appearance/contrast-audit.js'))
    page.on('pageerror',lambda error: runtime_errors.append(str(error)))
    # Force the second synthetic Gallery image through a real failed image load.
    page.route('**/images/asdASDasd.png',lambda route:route.fulfill(status=404,body='Photo fixture intentionally unavailable'))
    page.goto(URL)
    page.wait_for_function('window.PeakDuo?.preview === true')
    page.wait_for_timeout(800)
    page.evaluate("PeakDuo.setPhoneSetting('motion',true)")
    # Exercise the actual Settings control, then verify persistence after reload.
    page.evaluate("PeakDuo.openApp('settings')")
    page.get_by_text('Display & appearance',exact=True).click()
    page.get_by_label('Appearance',exact=True).select_option('light')
    page.wait_for_function("document.querySelector('#duo').dataset.theme==='light'")
    page.reload();page.wait_for_function('window.PeakDuo?.preview === true')
    assert page.evaluate('PeakDuo.getPhoneSettings().appearance')=='light'
    page.emulate_media(color_scheme='dark')
    page.evaluate("PeakDuo.setPhoneSetting('appearance','system')")
    page.wait_for_function("document.querySelector('#duo').dataset.theme==='dark'")
    page.emulate_media(color_scheme='light')
    page.wait_for_function("document.querySelector('#duo').dataset.theme==='light'")
    # Restored optional apps are absent from the initial synthetic install list.
    # Exercise the shipped App Store path before auditing both rendered screens.
    install_through_store(page,'services','Services')
    install_through_store(page,'crypto','Crypto')
    for theme in ['light','dark']:
        page.evaluate("PeakDuo.setLayout('full');if(PeakDuo.getState().workspace.expanded)PeakDuo.fold()")
        page.wait_for_timeout(200)
        page.evaluate('(theme)=>PeakDuo.setPhoneSetting("appearance",theme)',theme)
        assert page.evaluate("getComputedStyle(document.documentElement).colorScheme==='normal'")
        ids=page.evaluate("import('/duo/catalog.mjs').then(m=>m.APPS.map(a=>a.id))")
        for app in ids:
            # Honor network / USB / creator gates with explicit preview input.
            if app=='jobcreator':page.evaluate("PeakDuo.sendPreview({Action:'Duo/Capabilities',Capabilities:{jobcreator:{available:true}}})")
            if app=='cars':page.evaluate("PeakDuo.sendPreview({Action:'SetCurrentNetwork',Network:'pdm'})")
            if app=='time-trials':
                page.evaluate("PeakDuo.sendPreview({...PeakDuo.previewAdapter.previewOpen(),HasPDRacingUsb:true})")
                page.wait_for_timeout(200)
            opened=page.evaluate('(id)=>PeakDuo.openApp(id,"left")',app)
            assert opened, (theme,app)
            page.wait_for_timeout(200)
            if app=='documents':wait_for_notes_catalog(page)
            assert page.evaluate('(id)=>{const side=PeakDuo.getState().workspace.active;return PeakDuo.getState().workspace.panes[side].app===id}',app) or app=='camera'
            print('CHECK',theme,app,flush=True)
            page.mouse.move(10,10)
            if app=='camera':
                page.screenshot(path=str(OUT/f'{theme}-{app}.png'))
                page.evaluate("PeakPhoneTransport('Phone/ExitCamera',{})")
                page.wait_for_timeout(200)
            else:
                page.locator('.duo-pane[data-active=true]').screenshot(path=str(OUT/f'{theme}-{app}.png'))
                audit=page.evaluate('''(id)=>{const node=document.querySelector('.duo-app-instance[data-app="'+id+'"]');
                  const style=getComputedStyle(node.firstElementChild);
                  return {background:style.backgroundColor,color:style.color,theme:document.querySelector('#duo').dataset.theme};}''',app)
                assert audit['theme']==theme
                if app in surface_cases: check_surface_ink(page,app,theme)
                results.append({'theme':theme,'app':app,**audit})
                contrast.append({'theme':theme,'app':app,**page.evaluate("auditPhoneContrast(document.querySelector('.duo-pane[data-active=true]'))")})
                (OUT/'contrast.json').write_text(json.dumps(contrast,indent=2))
                if app=='mails':
                    assert page.locator('.duo-app-instance[data-app="mails"] .mail-header,.duo-app-instance[data-app="mails"] .mail-search,.duo-app-instance[data-app="mails"] .mail-row').evaluate_all("nodes=>nodes.length>0&&nodes.every(n=>getComputedStyle(n).backgroundImage==='none')"), 'Native Mail surfaces must not retain metallic gradients'
                if app=='calendar':
                    assert page.locator('.u27-date[data-selected=true]').count()==1
                if app=='facetime':
                    assert page.locator('.duo-app-instance[data-app="facetime"] .ft-person-video').count()>=1, 'Synthetic FaceTime history should exercise its call action'
                if app=='guber':
                    assert page.locator('.duo-pane[data-active=true]').get_attribute('data-app-ink') == ('dark' if theme=='light' else 'light')
                if app=='bankbusters':
                    for label in ['Fleeca opportunity','Paleto opportunity','Expired opportunity']:
                        assert page.get_by_text(label,exact=True).is_visible()
                if app=='binge':
                    assert page.locator('.gx-binge-card').count()==1
                    page.locator('.duo-app-instance[data-app="binge"] .gx-body').evaluate('(body)=>body.scrollTop=body.scrollHeight')
                    page.wait_for_timeout(100)
                    page.locator('.duo-pane[data-active=true]').screenshot(path=str(OUT/f'{theme}-binge-scrolled.png'))
                    contrast.append({'theme':theme,'app':'binge-scrolled',**page.evaluate("auditPhoneContrast(document.querySelector('.duo-pane[data-active=true]'))")})
                if app=='details':
                    page.locator('.duo-app-instance[data-app="details"] .gx-body').evaluate('(body)=>body.scrollTop=body.scrollHeight')
                    page.wait_for_timeout(100)
                    page.locator('.duo-pane[data-active=true]').screenshot(path=str(OUT/f'{theme}-details-scrolled.png'))
                    contrast.append({'theme':theme,'app':'details-scrolled',**page.evaluate("auditPhoneContrast(document.querySelector('.duo-pane[data-active=true]'))")})
                if app=='yellowpages':
                    assert page.get_by_role('button',name='View Studio delivery',exact=True).is_visible()
                    page.locator('.duo-app-instance[data-app="yellowpages"] .gx-body').evaluate('(body)=>body.scrollTop=body.scrollHeight')
                    page.wait_for_timeout(100)
                    page.locator('.duo-pane[data-active=true]').screenshot(path=str(OUT/f'{theme}-yellowpages-scrolled.png'))
                    contrast.append({'theme':theme,'app':'yellowpages-scrolled',**page.evaluate("auditPhoneContrast(document.querySelector('.duo-pane[data-active=true]'))")})
                if app=='gallery':
                    gallery=page.locator('.duo-app-instance[data-app="gallery"]')
                    photos=gallery.locator('.duo-photos-library')
                    photos.locator('.duo-photo-tile').first.wait_for(state='visible',timeout=5000)
                    assert photos.locator('.duo-photo-tile').count()>=1, 'Photos should render the synthetic Gallery/GetPhotos fixture in the native grid'
                    failed_tile=photos.locator('.duo-photo-tile').nth(1)
                    failed_fallback=failed_tile.locator('.duo-photo-broken')
                    failed_fallback.wait_for(state='visible',timeout=8000)
                    fallback_metrics=failed_fallback.evaluate("""n=>{const tile=n.closest('.duo-photo-tile'),ink=getComputedStyle(n),surface=getComputedStyle(tile),r=n.getBoundingClientRect(),t=tile.getBoundingClientRect(),rgb=value=>value.match(/[\\d.]+/g).slice(0,3).map(Number),lum=values=>values.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0),fg=lum(rgb(ink.color)),bg=lum(rgb(surface.backgroundColor));return{text:n.textContent.trim(),ink:ink.color,surface:surface.backgroundColor,width:r.width,height:r.height,tileWidth:t.width,tileHeight:t.height,contrast:(Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05)}}""")
                    assert failed_tile.locator('img').count()==0, 'Missing-photo fixture must exercise the actual failed-image fallback'
                    assert fallback_metrics['text']=='Image unavailable' and fallback_metrics['ink']=='rgb(146, 146, 152)' and fallback_metrics['surface']=='rgb(32, 32, 36)' and fallback_metrics['contrast']>=4.5 and fallback_metrics['width']>=fallback_metrics['tileWidth']*.9 and fallback_metrics['height']>=fallback_metrics['tileHeight']*.9, f'Failed-photo fallback needs readable ink and tile-sized geometry in {theme}: {fallback_metrics}'
                    failed_tile.screenshot(path=str(OUT/f'{theme}-photo-image-unavailable.png'))
                    expected_canvas='rgb(242, 242, 247)' if theme=='light' else 'rgb(16, 17, 20)'
                    expected_label='rgb(28, 28, 30)' if theme=='light' else 'rgb(245, 245, 247)'
                    expected_secondary='rgb(94, 94, 100)' if theme=='light' else 'rgb(146, 146, 152)'
                    photo_ink=photos.evaluate("""n=>({canvas:getComputedStyle(n).backgroundColor,title:getComputedStyle(n.querySelector('.duo-photos-heading h1')).color,metadata:getComputedStyle(n.querySelector('.duo-photos-heading p')).color,day:getComputedStyle(n.querySelector('.duo-photo-day-title')).color})""")
                    assert photo_ink=={'canvas':expected_canvas,'title':expected_label,'metadata':expected_secondary,'day':expected_label}, f'Photos list needs readable {theme} surfaces and labels: {photo_ink}'
                    gallery.locator('.duo-media-tabs [data-tab="albums"]').click()
                    albums=gallery.locator('.duo-media-albums')
                    albums.locator('.duo-album-filters [data-album-filter]').first.wait_for(state='visible',timeout=5000)
                    album_ink=albums.evaluate("""n=>{const filters=n.querySelector('.duo-album-filters'),active=filters.querySelector('[aria-pressed=true]'),day=n.querySelector('.duo-album-day h2');return {canvas:getComputedStyle(n).backgroundColor,title:getComputedStyle(n.querySelector('.duo-albums-heading h1')).color,metadata:getComputedStyle(n.querySelector('.duo-albums-heading p')).color,day:day?getComputedStyle(day).color:null,filterSurface:getComputedStyle(filters).backgroundColor,activeSurface:getComputedStyle(active).backgroundColor,activeInk:getComputedStyle(active).color}}""")
                    expected_filter='rgb(242, 242, 247)' if theme=='light' else 'rgb(36, 36, 39)'
                    expected_active='rgba(0, 104, 217, 0.1)' if theme=='light' else 'rgba(10, 132, 255, 0.22)'
                    expected_active_ink='rgb(0, 87, 184)' if theme=='light' else 'rgb(117, 182, 255)'
                    assert album_ink=={'canvas':expected_canvas,'title':expected_label,'metadata':expected_secondary,'day':expected_label,'filterSurface':expected_filter,'activeSurface':expected_active,'activeInk':expected_active_ink}, f'Albums headings, filters and selected control need coherent {theme} contrast: {album_ink}'
                    gallery.locator('.duo-media-tabs [data-tab="videos"]').click()
                    videos=gallery.locator('.duo-local-videos')
                    videos.wait_for(state='visible',timeout=3000)
                    assert gallery.locator('.duo-media-tabs [data-tab="videos"]').get_attribute('aria-pressed')=='true', 'Videos tab must remain selectable after the Photos theme change'
                    expected_video_canvas='rgb(242, 242, 247)' if theme=='light' else 'rgb(0, 0, 0)'
                    expected_video_secondary='rgb(94, 94, 100)' if theme=='light' else 'rgb(181, 181, 186)'
                    video_ink=videos.evaluate("""n=>({canvas:getComputedStyle(n).backgroundColor,title:getComputedStyle(n.querySelector('h2')).color,metadata:getComputedStyle(n.querySelector('.duo-local-note')).color})""")
                    assert video_ink=={'canvas':expected_video_canvas,'title':expected_label,'metadata':expected_video_secondary}, f'Videos collection needs the readable {theme} surface and labels used by the app theme: {video_ink}'
                    gallery.locator('.duo-media-tabs [data-tab="photos"]').click()
                    photos.locator('button[aria-label="Select photos"]').click()
                    photos.locator('.duo-photo-tile').first.click()
                    selection=photos.locator('.duo-photos-selection')
                    selection.wait_for(state='visible',timeout=3000)
                    selection_ink=selection.evaluate("""n=>({surface:getComputedStyle(n).backgroundColor,count:getComputedStyle(n.querySelector('.duo-photo-selection-count')).color,action:getComputedStyle(n.querySelector('.duo-photo-selection-action')).color,delete:getComputedStyle(n.querySelector('.duo-photo-selection-delete')).color})""")
                    assert selection_ink=={'surface':'rgb(255, 255, 255)' if theme=='light' else 'rgb(28, 28, 30)','count':expected_label,'action':'rgb(0, 87, 184)' if theme=='light' else 'rgb(10, 132, 255)','delete':'rgb(215, 0, 21)' if theme=='light' else 'rgb(255, 69, 58)'}, f'Photos selection controls need readable {theme} contrast: {selection_ink}'
                    selection.locator('.duo-photo-selection-action').click()
                    share_sheet=photos.locator('.duo-photo-share-sheet')
                    assert share_sheet.is_visible(), 'Sharing a selected photo should open its native action sheet'
                    share_ink=share_sheet.evaluate("""n=>({preview:getComputedStyle(n.querySelector('.duo-photo-share-preview')).backgroundColor,action:getComputedStyle(n.querySelector('.duo-photo-action')).color})""")
                    assert share_ink=={'preview':'rgb(255, 255, 255)' if theme=='light' else 'rgb(28, 28, 30)','action':expected_label}, f'Photo share sheet should inherit the {theme} appearance: {share_ink}'
                    page.keyboard.press('Escape')
                    photos.locator('button[aria-label="Cancel photo selection"]').click()
                    photos.locator('.duo-photo-tile').first.click()
                    viewer=photos.locator('.duo-photo-viewer')
                    assert viewer.is_visible() and viewer.locator('img').count()>=1, 'A photo tile should open the native photo viewer'
                    viewer_ink=viewer.evaluate("""n=>({surface:getComputedStyle(n).backgroundColor,label:getComputedStyle(n.querySelector('.duo-photo-viewer-date strong')).color,secondary:getComputedStyle(n.querySelector('.duo-photo-viewer-date small')).color,control:getComputedStyle(n.querySelector('.duo-photo-viewer-back')).color})""")
                    assert viewer_ink=={'surface':'rgb(16, 17, 20)','label':'rgb(245, 245, 247)','secondary':'rgb(146, 146, 152)','control':'rgb(10, 132, 255)'}, f'Photo viewer media surface and controls should retain their dark treatment: {viewer_ink}'
                    page.keyboard.press('e')
                    page.wait_for_function('PeakDuo.getState().workspace.expanded')
                    viewer.get_by_role('button',name='Photo actions',exact=True).click()
                    sheet=photos.locator('.duo-photo-share-sheet')
                    assert sheet.is_visible(), 'Photo actions should open the native share sheet'
                    page.keyboard.press('e')
                    assert page.evaluate('PeakDuo.getState().workspace.expanded'), 'E from a native Photos sheet button must not fold the phone'
                    page.keyboard.press('Escape')
                    assert sheet.count()==0 and viewer.is_visible() and page.evaluate('PeakDuo.getState().visible && PeakDuo.getState().workspace.expanded'), 'Escape should dismiss the Photos sheet first and keep the viewer and expanded phone open'
                    page.keyboard.press('Escape')
                    assert not viewer.is_visible() and page.evaluate('PeakDuo.getState().visible && PeakDuo.getState().workspace.expanded'), 'A second Escape should close the photo viewer without closing the phone'
                if app=='kilogram':
                    assert page.locator('.kg-post').count()>=1
                    assert page.evaluate("getComputedStyle(document.querySelector('.kg-nav .duo-surface-replica')).filter.includes('blur')")
                if app=='messages':
                    page.locator('.duo-app-instance[data-app="messages"] .gx-message-inbox').wait_for(state='visible')
                    page.get_by_role('button',name='Open Jordan Lee').wait_for(state='visible')
                    page.get_by_role('button',name='Open Jordan Lee').click()
                    page.locator('.gx-audio-player').first.wait_for(state='attached')
                    assert page.locator('.gx-message').count()>=5
                    page.locator('.duo-pane[data-active=true]').screenshot(path=str(OUT/f'{theme}-message-thread.png'))
                    contrast.append({'theme':theme,'app':'message-thread',**page.evaluate("auditPhoneContrast(document.querySelector('.duo-pane[data-active=true]'))")})
                if app=='contacts':
                    page.get_by_role('button',name='Add contact',exact=True).click()
                    page.wait_for_timeout(100)
                    page.locator('.duo-pane[data-active=true]').screenshot(path=str(OUT/f'{theme}-contact-sheet.png'))
                    page.keyboard.press('Escape')
        page.evaluate("PeakDuo.setLayout('split')")
        page.evaluate("PeakDuo.openApp('settings','left')")
        page.evaluate("PeakDuo.openApp('kilogram','right')")
        page.wait_for_timeout(300)
        page.screenshot(path=str(OUT/f'{theme}-split.png'))
        # Local glass replicas remain blurred, and reduced transparency removes them.
        page.evaluate("PeakDuo.home('left');PeakDuo.home('right')")
        page.wait_for_timeout(300)
        assert page.evaluate("getComputedStyle(document.querySelector('.duo-dock-wallpaper')).filter.includes('blur')")
        page.screenshot(path=str(OUT/f'{theme}-home.png'))
        page.evaluate("PeakDuo.setPhoneSetting('transparency','reduced')")
        page.wait_for_timeout(200)
        assert page.evaluate("getComputedStyle(document.querySelector('.duo-dock-blur')).display==='none'")
        page.screenshot(path=str(OUT/f'{theme}-reduced-transparency.png'))
        page.evaluate("PeakDuo.setPhoneSetting('transparency','regular')")
        page.locator('.duo-pane[data-side=left] button[aria-label="Open control center"]').click()
        page.wait_for_timeout(200)
        assert page.evaluate("[...document.querySelectorAll('#duo *')].every(n=>getComputedStyle(n).backdropFilter==='none')"), 'Phone must keep the transparent NUI canvas safe'
        page.screenshot(path=str(OUT/f'{theme}-control-center.png'))
        contrast.append({'theme':theme,'app':'control-center',**page.evaluate("auditPhoneContrast(document.querySelector('.duo-control-center'))")})
        page.get_by_role('button',name='Dark Mode',exact=True).click()
        assert page.evaluate('PeakDuo.getPhoneSettings().theme')!=theme
        page.get_by_role('button',name='Close Control Center',exact=True).click()
        # Restore the named theme after exercising the actual toggle. Overlay
        # captures must represent the filename's theme, not the opposite mode.
        page.evaluate('(theme)=>PeakDuo.setPhoneSetting("appearance",theme)',theme)
        page.wait_for_function('(theme)=>document.querySelector("#duo").dataset.theme===theme',arg=theme)
        page.evaluate("PeakDuo.sendPreview({Action:'Notification',Id:'appearance-review',Title:'New message',Text:'Meet you at the studio.',Icon:'fas fa-comment',Data:{Sticky:true}})")
        page.wait_for_timeout(550)
        page.screenshot(path=str(OUT/f'{theme}-notification.png'))
        contrast.append({'theme':theme,'app':'notification',**page.evaluate('auditPhoneContrast(document.querySelector("#duo-notifications"))')})
        page.evaluate("PeakDuo.sendPreview({Action:'RemoveNotification',Id:'appearance-review'})")
        page.evaluate("{const d=PeakDuo.previewAdapter.previewOpen();d.PlayerData={...d.PlayerData,DeviceLocked:true};PeakDuo.sendPreview(d)}")
        page.wait_for_timeout(300)
        assert page.locator('.duo-lock-screen').is_visible()
        assert page.evaluate('document.querySelector("#duo").dataset.theme') == theme
        page.screenshot(path=str(OUT/f'{theme}-lock.png'))
        contrast.append({'theme':theme,'app':'lock',**page.evaluate('auditPhoneContrast(document.querySelector(".duo-lock-screen"))')})
        page.evaluate("PeakDuo.sendPreview(PeakDuo.previewAdapter.previewOpen())")
        page.wait_for_timeout(200)
        check_f35_compact_layout(page,theme)
    assert not page.evaluate('PeakDuo.getState().errors'), page.evaluate('PeakDuo.getState().errors')
    assert not runtime_errors,runtime_errors
    (OUT/'contrast.json').write_text(json.dumps(contrast,indent=2))
    (OUT/'results.json').write_text(json.dumps({'apps':results,'errors':page.evaluate('PeakDuo.getState().errors')},indent=2))
    browser.close()
print(f'PASS: {len(results)} app/theme cases, settings persistence, automatic appearance, split view, glass and Control Center')
