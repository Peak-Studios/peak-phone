"""Verify the shipped native Mail screen in the synthetic preview.
Run with PREVIEW_URL and optional CHROMIUM_PATH; never connects to a live game server.
"""
from pathlib import Path
import json
import os
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(os.environ.get('MAIL_OUT', str(ROOT / 'artifacts/ios-theme-redesign/mail')))
OUT.mkdir(parents=True, exist_ok=True)
URL = os.environ.get('PREVIEW_URL', 'http://127.0.0.1:8791')
errors = []
checks = []

def open_mail(page, mail_id, subject):
    page.evaluate('(id) => window.PeakDuo.sendPreview({Action:"Mails/OpenMail", Id:id})', mail_id)
    expect(page.locator('.mail-detail-subject')).to_have_text(subject, timeout=5000)

def request_payload(page, event):
    return page.evaluate('(name) => window.PeakDuo.requests.filter(item => item.event===name).map(item=>item.data)', event)

def wait_for_phone_ready(page, theme):
    expected_ink = 'dark' if theme == 'light' else 'light'
    expected_color = 'rgb(23, 23, 25)' if theme == 'light' else 'rgb(255, 255, 255)'
    page.wait_for_function(
        '''({theme,expectedInk,expectedColor})=>{
          const root=document.querySelector('#duo'),stage=root?.querySelector('.duo-stage');
          const chassis=root?.querySelector('.duo-chassis'),toolbar=root?.querySelector('.duo-toolbar');
          const pane=root?.querySelector('.duo-pane[data-active="true"]'),status=pane?.querySelector('.duo-status');
          const bank=root?.querySelector('.duo-screenbank');
          if(!root||root.hidden||root.dataset.visible!=="true"||root.dataset.theme!==theme||!stage||!chassis||!toolbar||!pane||!status||!bank)return false;
          const c=chassis.getBoundingClientRect(),t=toolbar.getBoundingClientRect(),h=pane.querySelector('.duo-home-gesture').getBoundingClientRect();
          const inside=(r,b)=>r.left>=b.left-1&&r.right<=b.right+1&&r.top>=b.top-1&&r.bottom<=b.bottom+1;
          if(c.top<0||c.bottom>innerHeight+1||c.left<0||c.right>innerWidth+1||t.top<0||t.bottom>innerHeight+1||!inside(h,c))return false;
          if(pane.dataset.appInk!==expectedInk||getComputedStyle(status).color!==expectedColor)return false;
          return !root.getAnimations({subtree:true}).some(animation=>animation.playState==="running"||animation.playState==="pending");
        }''',
        arg={'theme':theme,'expectedInk':expected_ink,'expectedColor':expected_color}, timeout=15000)
    return page.evaluate(
        '''theme=>{const root=document.querySelector('#duo'),pane=root.querySelector('.duo-pane[data-active="true"]');
          const c=root.querySelector('.duo-chassis').getBoundingClientRect(),t=root.querySelector('.duo-toolbar').getBoundingClientRect(),b=root.querySelector('.duo-screenbank').getBoundingClientRect();
          return {theme:root.dataset.theme,expanded:root.dataset.expanded,layout:root.dataset.layout,appInk:pane.dataset.appInk,statusColor:getComputedStyle(pane.querySelector('.duo-status')).color,
            chassis:{top:c.top,bottom:c.bottom,left:c.left,right:c.right},toolbar:{top:t.top,bottom:t.bottom},screen:{width:b.width,height:b.height,orientation:b.width>b.height?'landscape':'portrait'},
            runningAnimations:root.getAnimations({subtree:true}).filter(animation=>animation.playState==='running'||animation.playState==='pending').length};}''', theme)

with sync_playwright() as pw:
    options = {'headless': True}
    if os.environ.get('CHROMIUM_PATH'):
        options['executable_path'] = os.environ['CHROMIUM_PATH']
    browser = pw.chromium.launch(**options)
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(URL, wait_until='domcontentloaded')
    page.wait_for_function('window.PeakDuo?.preview === true')
    page.evaluate('window.PeakDuo.openApp("mails")')
    app = page.locator('#duo > .duo-stage > .duo-chassis > .duo-screenbank > .duo-pane[data-active="true"] .duo-app-instance[data-app="mails"] .mail-app')
    expect(app).to_be_visible()
    page.wait_for_function("document.querySelectorAll('.mail-row').length === 12")
    expect(page.locator('.mail-row')).to_have_count(12)
    page.wait_for_function("document.querySelector('#peak-duo-mail-styles')?.sheet")
    page.evaluate('(theme)=>window.PeakDuo.setPhoneSetting("appearance",theme)', 'light')
    light_ready = wait_for_phone_ready(page, 'light')
    light = app.evaluate('(node)=>({background:getComputedStyle(node).backgroundColor,width:node.clientWidth,height:node.clientHeight})')
    assert light['background'] == 'rgb(242, 242, 247)', light
    page.evaluate('document.activeElement?.blur?.()')
    page.screenshot(path=str(OUT / 'mail-light-inbox.png'))
    checks.append({'case':'stable-light-phone-and-statusbar','state':light_ready})
    layout = page.locator('.mail-row').evaluate_all('''rows=>rows.map(row=>{
      const box=row.getBoundingClientRect(), children=[...row.children];
      const avatar=row.querySelector(':scope > .mail-avatar').getBoundingClientRect();
      const copy=row.querySelector(':scope > .mail-row-copy').getBoundingClientRect();
      const time=row.querySelector(':scope > .mail-time').getBoundingClientRect();
      return {
        childCount:children.length,
        structure:children[0]?.classList.contains('mail-unread-dot')&&children[1]?.classList.contains('mail-avatar')&&children[2]?.classList.contains('mail-row-copy')&&children[3]?.classList.contains('mail-time'),
        outside:children.some(child=>{const r=child.getBoundingClientRect();return r.left<box.left-1||r.right>box.right+1||r.top<box.top-1||r.bottom>box.bottom+1}),
        columns:avatar.right<=copy.left+1&&copy.right<=time.left+1,
        horizontalOverflow:row.scrollWidth>row.clientWidth+1
      };
    })''')
    assert len(layout)==12 and all(row['childCount']==4 and row['structure'] and not row['outside'] and row['columns'] and not row['horizontalOverflow'] for row in layout), layout
    checks.append({'case':'populated-inbox-row-layout','rows':len(layout),'geometry':layout[:1]})
    checks.append({'case':'populated-light-inbox','rows':12,**light})

    page.get_by_label('Search mail').fill('studio')
    expect(page.locator('.mail-row')).to_have_count(1)
    page.get_by_label('Search mail').fill('')
    expect(page.locator('.mail-row')).to_have_count(12)
    checks.append({'case':'search-by-body-and-contact'})

    page.get_by_role('button', name='Compose mail').click()
    light_send = page.get_by_role('button', name='Send mail')
    expect(light_send).to_be_disabled()
    page.wait_for_function("getComputedStyle(document.querySelector('.mail-send-button')).backgroundColor==='rgb(229, 229, 234)'")
    light_guidance = page.locator('.mail-compose-status')
    expect(light_guidance).to_contain_text('Add a recipient, subject, and message to enable Send.')
    assert light_send.get_attribute('aria-describedby') == light_guidance.get_attribute('id')
    light_disabled_colors = light_send.evaluate('''node=>{const style=getComputedStyle(node),icon=getComputedStyle(node.querySelector('svg'));return {disabled:node.disabled,background:style.backgroundColor,button:style.color,icon:icon.color,opacity:style.opacity,radius:style.borderRadius,ring:icon.borderTopWidth}}''')
    assert light_disabled_colors == {'disabled':True,'background':'rgb(229, 229, 234)','button':'rgb(111, 111, 117)','icon':'rgb(111, 111, 117)','opacity':'1','radius':'50%','ring':'0px'}, light_disabled_colors
    checks.append({'case':'light-compose-empty-disabled-with-guidance','colors':light_disabled_colors})
    app.get_by_label('To', exact=True).fill('5550102002')
    app.get_by_label('Subject', exact=True).fill('Light send contrast')
    app.get_by_label('Message', exact=True).fill('A short preview message.')
    expect(light_send).to_be_enabled()
    page.wait_for_function("getComputedStyle(document.querySelector('.mail-send-button')).backgroundColor==='rgb(0, 104, 217)'")
    light_send_colors = light_send.evaluate('''node=>{const style=getComputedStyle(node),icon=getComputedStyle(node.querySelector('svg'));return {background:style.backgroundColor,button:style.color,icon:icon.color,opacity:style.opacity,radius:style.borderRadius,ring:icon.borderTopWidth}}''')
    assert light_send_colors == {'background':'rgb(0, 104, 217)','button':'rgb(255, 255, 255)','icon':'rgb(255, 255, 255)','opacity':'1','radius':'50%','ring':'0px'}, light_send_colors
    page.evaluate('document.activeElement?.blur?.()')
    page.screenshot(path=str(OUT / 'mail-light-compose-ready.png'))
    checks.append({'case':'light-compose-send-readiness-and-contrast','colors':light_send_colors})
    cancel = page.get_by_role('button', name='Cancel', exact=True)
    expect(cancel).to_be_visible()
    cancel.click()
    expect(app).to_have_attribute('data-view','inbox')
    page.evaluate('''()=>{for(const key of Object.keys(localStorage))if(key.includes('mail-draft:new'))localStorage.removeItem(key)}''')

    page.evaluate('(theme)=>window.PeakDuo.setPhoneSetting("appearance",theme)', 'dark')
    dark_ready = wait_for_phone_ready(page, 'dark')
    dark = app.evaluate('(node)=>getComputedStyle(node).backgroundColor')
    assert dark == 'rgb(0, 0, 0)', dark
    page.evaluate('document.activeElement?.blur?.()')
    page.screenshot(path=str(OUT / 'mail-dark-inbox.png'))
    checks.append({'case':'stable-dark-phone-and-statusbar','state':dark_ready})
    open_mail(page, 9, 'Re: Garage estimate')
    hostile = page.locator('.mail-body').evaluate('''body=>({
      scripts:body.querySelectorAll('script,iframe,object,embed').length,
      images:body.querySelectorAll('img').length,
      unsafeAttributes:[...body.querySelectorAll('*')].some(node=>[...node.attributes].some(attr=>attr.name.toLowerCase().startsWith('on'))),
      links:[...body.querySelectorAll('a[href]')].map(node=>node.getAttribute('href')),
      anchors:body.querySelectorAll('a').length,
      visibleText:body.innerText
    })''')
    assert hostile['scripts'] == 0 and hostile['images'] == 0 and not hostile['unsafeAttributes'], hostile
    assert hostile['links'] == [] and hostile['anchors'] == 0, hostile
    assert 'unsafe link' in hostile['visibleText'] and 'empty link' in hostile['visibleText'], hostile
    assert not page.evaluate('window.__mailInjected === true'), 'Untrusted email HTML executed'
    reply_paths = page.locator('.mail-detail-header-actions .mail-icon-button').evaluate_all('''nodes=>nodes.map(node=>node.querySelector('svg path')?.getAttribute('d'))''')
    footer_reply_path = page.locator('.mail-detail-footer .mail-reply-action svg path').get_attribute('d')
    expected_reply_path = 'M10 15 5 10l5-5M5 10h9a6 6 0 0 1 6 6v3'
    assert len(reply_paths) == 2 and reply_paths[0] == expected_reply_path and footer_reply_path == expected_reply_path, {'header':reply_paths,'footer':footer_reply_path}
    checks.append({'case':'curved-reply-actions','count':len(reply_paths)+1})
    page.screenshot(path=str(OUT / 'mail-dark-detail.png'))
    checks.append({'case':'hostile-html-sanitized','links':hostile['links']})

    open_mail(page, 7, 'Route 8 service update')
    expect(page.locator('.mail-action-unavailable')).to_contain_text('does not support')
    expect(page.locator('.mail-message-action')).to_have_count(0)
    assert not request_payload(page,'Phone/SetPreference'), 'Untrusted mail action reached transport'
    checks.append({'case':'untrusted-action-rejected'})

    open_mail(page, 10, 'Your appointment is confirmed')
    page.get_by_role('button', name='Open appointment location').click()
    page.wait_for_function("window.PeakDuo.requests.some(item=>item.event==='Mails/SetGPS')")
    gps = request_payload(page,'Mails/SetGPS')[-1]
    assert gps == {'x':214.4,'y':-810.6}, gps
    checks.append({'case':'trusted-gps-action','payload':gps})

    open_mail(page, 12, 'A little more room to work')
    page.wait_for_function("window.PeakDuo.requests.some(item=>item.event==='Mails/MarkAsRead' && String(item.data.id)==='12')")
    page.get_by_role('button', name='Back to inbox', exact=True).click()
    expect(app).to_have_attribute('data-view','inbox')
    expect(page.locator('.mail-row')).to_have_count(12)
    read_row = page.locator('.mail-row').filter(has_text='A little more room to work')
    expect(read_row).to_have_count(1)
    expect(read_row).to_have_attribute('data-unread','false')
    checks.append({'case':'open-marks-read'})

    open_mail(page, 8, 'The photos from Sunday')
    page.get_by_role('button', name='Delete message', exact=True).first.click()
    expect(page.get_by_role('dialog', name='Delete message?')).to_be_visible()
    page.get_by_role('button', name='Delete message', exact=True).last.click()
    expect(page.locator('.mail-row')).to_have_count(11)
    deleted = request_payload(page,'Mails/DeleteMail')[-1]
    assert deleted == {'id':8}, deleted
    checks.append({'case':'delete-exact-target','payload':deleted})
    page.evaluate('window.PeakDuo.sendPreview({Action:"Mails/OpenMail", Id:8})')
    expect(page.locator('.duo-toast')).to_contain_text('no longer available')
    expect(page.locator('.mail-detail-subject')).to_have_count(0)
    checks.append({'case':'missing-notification-target-feedback'})
    page.wait_for_function("document.querySelector('.duo-toast')?.hidden === true", timeout=7000)

    page.get_by_role('button', name='Compose mail').click()
    dark_send = page.get_by_role('button', name='Send mail')
    expect(dark_send).to_be_disabled()
    page.wait_for_function("getComputedStyle(document.querySelector('.mail-send-button')).backgroundColor==='rgb(58, 58, 60)'")
    dark_guidance = page.locator('.mail-compose-status')
    expect(dark_guidance).to_contain_text('enable Send')
    assert dark_send.get_attribute('aria-describedby') == dark_guidance.get_attribute('id')
    dark_disabled_colors = dark_send.evaluate('''node=>{const style=getComputedStyle(node),icon=getComputedStyle(node.querySelector('svg'));return {disabled:node.disabled,background:style.backgroundColor,button:style.color,icon:icon.color,opacity:style.opacity,radius:style.borderRadius,ring:icon.borderTopWidth}}''')
    assert dark_disabled_colors == {'disabled':True,'background':'rgb(58, 58, 60)','button':'rgb(152, 152, 158)','icon':'rgb(152, 152, 158)','opacity':'1','radius':'50%','ring':'0px'}, dark_disabled_colors
    page.evaluate('document.activeElement?.blur?.()')
    page.screenshot(path=str(OUT / 'mail-dark-compose-empty.png'))
    app.get_by_label('To', exact=True).fill('5550102999')
    app.get_by_label('Subject', exact=True).fill('Draft safety check')
    body_text = '<script>keep this as text</script>\n\nSecond paragraph'
    app.get_by_label('Message', exact=True).fill(body_text)
    expect(dark_send).to_be_enabled()
    page.wait_for_function("getComputedStyle(document.querySelector('.mail-send-button')).backgroundColor==='rgb(0, 104, 217)'")
    dark_send_colors = dark_send.evaluate('''node=>{const style=getComputedStyle(node),icon=getComputedStyle(node.querySelector('svg'));return {background:style.backgroundColor,button:style.color,icon:icon.color,opacity:style.opacity,radius:style.borderRadius,ring:icon.borderTopWidth}}''')
    assert dark_send_colors == {'background':'rgb(0, 104, 217)','button':'rgb(255, 255, 255)','icon':'rgb(255, 255, 255)','opacity':'1','radius':'50%','ring':'0px'}, dark_send_colors
    page.evaluate('document.activeElement?.blur?.()')
    page.screenshot(path=str(OUT / 'mail-dark-compose-ready.png'))
    checks.append({'case':'dark-compose-send-readiness-and-contrast','colors':dark_send_colors})
    page.evaluate('window.PeakDuo.setPreviewDelay("Mails/SendMail", 350)')
    failed_sends_before = len(request_payload(page,'Mails/SendMail'))
    page.get_by_role('button', name='Send mail').click()
    page.wait_for_function("(count)=>window.PeakDuo.requests.filter(item=>item.event==='Mails/SendMail').length===count+1", arg=failed_sends_before)
    expect(dark_send).to_be_disabled()
    expect(page.locator('.mail-compose-status')).to_have_attribute('data-state','sending')
    app.get_by_label('Subject', exact=True).fill('Edited during pending send')
    expect(dark_send).to_be_disabled()
    app.get_by_label('Subject', exact=True).fill('')
    expect(dark_send).to_be_disabled()
    expect(page.get_by_role('alert')).to_contain_text('could not complete')
    expect(dark_send).to_be_disabled()
    app.get_by_label('Subject', exact=True).fill('Draft safety check')
    expect(dark_send).to_be_enabled()
    page.evaluate('window.PeakDuo.setPreviewDelay("Mails/SendMail", 35)')
    assert app.get_by_label('To', exact=True).input_value() == '5550102999'
    assert app.get_by_label('Subject', exact=True).input_value() == 'Draft safety check'
    assert app.get_by_label('Message', exact=True).input_value() == body_text
    draft = page.evaluate('''()=>Object.entries(localStorage).filter(([key])=>key.includes('mail-draft:new')).map(([,value])=>JSON.parse(value)).at(-1)''')
    assert draft == {'recipient':'5550102999','subject':'Draft safety check','message':body_text}, draft
    checks.append({'case':'failed-send-retains-editable-draft'})

    app.get_by_label('To', exact=True).fill('5550102002')
    page.get_by_role('button', name='Send mail').click()
    expect(app).to_have_attribute('data-view','inbox')
    expect(page.locator('.mail-row')).to_have_count(11)
    sent = request_payload(page,'Mails/SendMail')[-1]
    assert sent['targetPhone'] == '5550102002' and sent['subject'] == 'Draft safety check', sent
    assert '&lt;script&gt;keep this as text&lt;/script&gt;' in sent['message'], sent
    assert '<p>Second paragraph</p>' in sent['message'], sent
    assert all('Draft safety check' not in row.inner_text() for row in page.locator('.mail-row').all()), 'Preview fabricated a Sent row'
    cleared = page.evaluate('''()=>Object.entries(localStorage).filter(([key])=>key.includes('mail-draft:new')).map(([,value])=>JSON.parse(value)).at(-1)''')
    assert cleared == {'recipient':'','subject':'','message':''}, cleared
    checks.append({'case':'send-escapes-body-and-does-not-fabricate-sent-row','payload':sent})

    page.evaluate('window.PeakDuo.setPreviewDelay("Mails/SendMail", 700)')
    race_draft = {'recipient':'5550102998','subject':'Keep the newer draft','message':'Same content survives cancellation.'}
    sends_before_race = len(request_payload(page,'Mails/SendMail'))
    page.get_by_role('button', name='Compose mail').click()
    app.get_by_label('To', exact=True).fill(race_draft['recipient'])
    app.get_by_label('Subject', exact=True).fill(race_draft['subject'])
    app.get_by_label('Message', exact=True).fill(race_draft['message'])
    page.get_by_role('button', name='Send mail').click()
    page.wait_for_function("(count)=>window.PeakDuo.requests.filter(item=>item.event==='Mails/SendMail').length===count+1", arg=sends_before_race)
    app.locator('.mail-compose-form').evaluate("form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))")
    expect(page.locator('.mail-compose-status')).to_contain_text('already being sent')
    assert len(request_payload(page,'Mails/SendMail')) == sends_before_race + 1
    sent_snapshot = request_payload(page,'Mails/SendMail')[-1]
    assert sent_snapshot == {'targetPhone':race_draft['recipient'],'subject':race_draft['subject'],'message':'<p>Same content survives cancellation.</p>'}, sent_snapshot
    page.get_by_role('button', name='Cancel', exact=True).click()
    expect(app).to_have_attribute('data-view','inbox')
    page.get_by_role('button', name='Compose mail').click()
    assert app.get_by_label('To', exact=True).input_value() == race_draft['recipient']
    assert app.get_by_label('Subject', exact=True).input_value() == race_draft['subject']
    assert app.get_by_label('Message', exact=True).input_value() == race_draft['message']
    page.wait_for_function("document.querySelector('.duo-toast')?.textContent.includes('Mail sent. Your newer draft was kept.')", timeout=5000)
    expect(app).to_have_attribute('data-view','compose')
    persisted_newer = page.evaluate("""()=>Object.entries(localStorage).filter(([key])=>key.includes('mail-draft:new')).map(([,value])=>JSON.parse(value)).at(-1)""")
    assert persisted_newer == race_draft, persisted_newer
    expect(page.get_by_role('button', name='Send mail')).to_be_enabled()
    checks.append({'case':'cancel-reopen-refreshes-current-same-draft-readiness','draft':persisted_newer})
    checks.append({'case':'delayed-send-cancel-new-draft-survives-and-duplicate-is-blocked','draft':persisted_newer})
    page.evaluate('window.PeakDuo.setPreviewDelay("Mails/SendMail", 650)')
    same_id_failure = {'recipient':'5550102999','subject':'Canceled send that fails','message':'Keep this reopened draft after failure.'}
    app.get_by_label('To', exact=True).fill(same_id_failure['recipient'])
    app.get_by_label('Subject', exact=True).fill(same_id_failure['subject'])
    app.get_by_label('Message', exact=True).fill(same_id_failure['message'])
    sends_before_same_id_failure = len(request_payload(page,'Mails/SendMail'))
    page.get_by_role('button', name='Send mail').click()
    page.wait_for_function("(count)=>window.PeakDuo.requests.filter(item=>item.event==='Mails/SendMail').length===count+1", arg=sends_before_same_id_failure)
    page.get_by_role('button', name='Cancel', exact=True).click()
    page.get_by_role('button', name='Compose mail').click()
    expect(page.get_by_role('button', name='Send mail')).to_be_disabled()
    page.wait_for_function("document.querySelector('.duo-toast')?.textContent.includes('earlier mail could not be sent')", timeout=5000)
    assert app.get_by_label('To', exact=True).input_value() == same_id_failure['recipient']
    assert app.get_by_label('Subject', exact=True).input_value() == same_id_failure['subject']
    assert app.get_by_label('Message', exact=True).input_value() == same_id_failure['message']
    expect(page.get_by_role('button', name='Send mail')).to_be_enabled()
    checks.append({'case':'same-id-reopened-send-failure-is-reported-and-preserves-current-draft','draft':same_id_failure})
    page.evaluate('window.PeakDuo.setPreviewDelay("Mails/SendMail", 35)')

    page.get_by_role('button', name='Cancel', exact=True).click()
    page.evaluate('''()=>Object.keys(localStorage).filter(key=>key.includes('mail-draft:new')).forEach(key=>localStorage.removeItem(key))''')
    page.evaluate('window.PeakDuo.setPreviewDelay("Mails/SendMail", 600)')
    sends_before_reply = len(request_payload(page,'Mails/SendMail'))
    page.get_by_role('button', name='Compose mail').click()
    app.get_by_label('To', exact=True).fill('5550102996')
    app.get_by_label('Subject', exact=True).fill('Pending while opening reply')
    app.get_by_label('Message', exact=True).fill('This sent message must not replace the reply.')
    page.get_by_role('button', name='Send mail').click()
    page.wait_for_function("(count)=>window.PeakDuo.requests.filter(item=>item.event==='Mails/SendMail').length===count+1", arg=sends_before_reply)
    page.get_by_role('button', name='Cancel', exact=True).click()
    open_mail(page, 12, 'A little more room to work')
    page.get_by_role('button', name='Reply to message').click()
    reply_message = 'Keep this newer reply while the earlier send completes.'
    app.get_by_label('Message', exact=True).fill(reply_message)
    expect(page.get_by_role('button', name='Send mail')).to_be_enabled()
    page.wait_for_function("document.querySelector('.duo-toast')?.textContent.includes('Mail sent.')", timeout=5000)
    expect(app).to_have_attribute('data-view','compose')
    assert app.get_by_label('To', exact=True).input_value() == '5550102002'
    assert app.get_by_label('Subject', exact=True).input_value() == 'Re: A little more room to work'
    assert app.get_by_label('Message', exact=True).input_value() == reply_message
    expect(page.get_by_role('button', name='Send mail')).to_be_enabled()
    reply_draft = page.evaluate("""()=>JSON.parse(localStorage[Object.keys(localStorage).find(key=>key.includes('mail-draft:12'))])""")
    assert reply_draft['message'] == reply_message, reply_draft
    checks.append({'case':'delayed-success-refreshes-independent-reply-without-replacing-its-draft','draft':reply_draft})
    page.evaluate('window.PeakDuo.setPreviewDelay("Mails/SendMail", 35)')

    page.get_by_role('button', name='Cancel', exact=True).click()
    page.get_by_role('button', name='Compose mail').click()
    app.get_by_label('To', exact=True).fill('5550102999')
    app.get_by_label('Subject', exact=True).fill('Earlier send that fails')
    app.get_by_label('Message', exact=True).fill('This failure belongs to the earlier draft.')
    page.evaluate('window.PeakDuo.setPreviewDelay("Mails/SendMail", 650)')
    sends_before_failure = len(request_payload(page,'Mails/SendMail'))
    page.get_by_role('button', name='Send mail').click()
    page.wait_for_function("(count)=>window.PeakDuo.requests.filter(item=>item.event==='Mails/SendMail').length===count+1", arg=sends_before_failure)
    page.get_by_role('button', name='Cancel', exact=True).click()
    open_mail(page, 12, 'A little more room to work')
    page.get_by_role('button', name='Reply to message').click()
    failed_reply = 'The newer reply must survive an older failure.'
    app.get_by_label('Message', exact=True).fill(failed_reply)
    expect(page.get_by_role('button', name='Send mail')).to_be_enabled()
    page.wait_for_function("document.querySelector('.duo-toast')?.textContent.includes('earlier mail could not be sent')", timeout=5000)
    expect(app).to_have_attribute('data-view','compose')
    assert app.get_by_label('To', exact=True).input_value() == '5550102002'
    assert app.get_by_label('Subject', exact=True).input_value() == 'Re: A little more room to work'
    assert app.get_by_label('Message', exact=True).input_value() == failed_reply
    expect(page.get_by_role('button', name='Send mail')).to_be_enabled()
    failed_reply_draft = page.evaluate("""()=>JSON.parse(localStorage[Object.keys(localStorage).find(key=>key.includes('mail-draft:12'))])""")
    assert failed_reply_draft['message'] == failed_reply, failed_reply_draft
    checks.append({'case':'delayed-failure-does-not-disable-or-overwrite-a-different-reply','draft':failed_reply_draft})

    page.get_by_role('button', name='Cancel', exact=True).click()
    page.evaluate('''()=>Object.keys(localStorage).filter(key=>key.includes('mail-draft:new')).forEach(key=>localStorage.removeItem(key))''')
    page.get_by_role('button', name='Compose mail').click()
    app.get_by_label('To', exact=True).fill('5550102002')
    app.get_by_label('Subject', exact=True).fill('Sent version')
    app.get_by_label('Message', exact=True).fill('The latest edit must remain a draft.')
    page.evaluate('window.PeakDuo.setPreviewDelay("Mails/SendMail", 650)')
    page.get_by_role('button', name='Send mail').click()
    expect(page.get_by_role('button', name='Send mail')).to_have_attribute('aria-busy','true')
    app.get_by_label('Subject', exact=True).fill('Edited while send was pending')
    page.wait_for_function("()=>{const b=document.querySelector('.mail-send-button'),s=document.querySelector('.mail-compose-status');return b&&!b.hasAttribute('aria-busy')&&!b.disabled&&s?.dataset.state==='ready'}", timeout=5000)
    assert app.get_by_label('Subject', exact=True).input_value() == 'Edited while send was pending'
    assert app.get_by_label('Message', exact=True).input_value() == 'The latest edit must remain a draft.'
    edited_draft = page.evaluate("""()=>JSON.parse(localStorage[Object.keys(localStorage).find(key=>key.includes('mail-draft:new'))])""")
    assert edited_draft['subject'] == 'Edited while send was pending', edited_draft
    checks.append({'case':'same-mounted-success-clears-busy-and-retains-newer-edit','draft':edited_draft})
    page.evaluate('window.PeakDuo.setPreviewDelay("Mails/SendMail", 35)')

    page.get_by_role('button', name='Cancel', exact=True).click()
    gets_before_stale_open = len(request_payload(page,'Mails/GetMails'))
    page.evaluate('window.PeakDuo.setPreviewDelay("Mails/GetMails", 600)')
    page.evaluate('window.PeakDuo.sendPreview({Action:"Mails/OpenMail", Id:999})')
    page.wait_for_function("(count)=>window.PeakDuo.requests.filter(item=>item.event==='Mails/GetMails').length>count", arg=gets_before_stale_open)
    stale_open_time = page.evaluate("(count)=>window.PeakDuo.requests.filter(item=>item.event==='Mails/GetMails').slice(count).at(-1).time", gets_before_stale_open)
    page.evaluate('window.PeakDuo.sendPreview({Action:"Mails/OpenMail", Id:11})')
    expect(page.locator('.mail-detail-subject')).to_have_text('Saturday coffee?')
    page.wait_for_function('(started)=>Date.now()-started>700', arg=stale_open_time, timeout=3000)
    expect(page.locator('.mail-detail-subject')).to_have_text('Saturday coffee?')
    checks.append({'case':'delayed-stale-open-target-cannot-replace-newer-target'})
    page.evaluate('window.PeakDuo.setPreviewDelay("Mails/GetMails", 35)')

    open_mail(page, 5, 'Your order is ready')
    page.evaluate('window.PeakDuo.setPreviewDelay("Mails/DeleteMail", 600)')
    deletes_before_race = len(request_payload(page,'Mails/DeleteMail'))
    page.get_by_role('button', name='Delete message', exact=True).first.click()
    page.get_by_role('button', name='Delete message', exact=True).last.click()
    page.wait_for_function("(count)=>window.PeakDuo.requests.filter(item=>item.event==='Mails/DeleteMail').length===count+1", arg=deletes_before_race)
    delete_started = page.evaluate("(count)=>window.PeakDuo.requests.filter(item=>item.event==='Mails/DeleteMail').slice(count).at(-1).time", deletes_before_race)
    delete_payload = request_payload(page,'Mails/DeleteMail')[-1]
    assert delete_payload == {'id':5}, delete_payload
    page.get_by_role('button', name='Keep message', exact=True).click()
    page.get_by_role('button', name='Back to inbox', exact=True).click()
    page.get_by_role('button', name='Compose mail').click()
    app.get_by_label('To', exact=True).fill('5550102997')
    app.get_by_label('Subject', exact=True).fill('New composer survives delayed delete')
    app.get_by_label('Message', exact=True).fill('Keep this view open.')
    page.wait_for_function('(started)=>Date.now()-started>700', arg=delete_started, timeout=3000)
    expect(app).to_have_attribute('data-view','compose')
    assert app.get_by_label('Subject', exact=True).input_value() == 'New composer survives delayed delete'
    page.evaluate('window.PeakDuo.setPreviewDelay("Mails/DeleteMail", 35)')
    page.get_by_role('button', name='Cancel', exact=True).click()
    expect(page.locator('.mail-row')).to_have_count(10)
    assert page.locator('.mail-row').filter(has_text='Your order is ready').count() == 0
    checks.append({'case':'delayed-delete-removes-row-without-replacing-newer-composer','payload':delete_payload})


    page.evaluate('window.PeakDuo.setLayout("split")')
    page.wait_for_function('window.PeakDuo.getState().workspace.expanded === true')
    split = app.evaluate('''node=>{
      const a=node.getBoundingClientRect(),children=[...node.children].map(child=>child.getBoundingClientRect());
      return {width:node.clientWidth,scrollWidth:node.scrollWidth,overflow:children.some(box=>box.left<a.left-1||box.right>a.right+1)}
    }''')
    unfolded_state = wait_for_phone_ready(page, 'dark')
    workspace = page.evaluate("({workspace:window.PeakDuo.getState().workspace,rootExpanded:document.querySelector('#duo').dataset.expanded,rootLayout:document.querySelector('#duo').dataset.layout})")
    assert workspace['workspace']['expanded'] is True and workspace['rootExpanded'] == 'true' and workspace['workspace']['layout'] == 'split' and workspace['rootLayout'] == 'split' and unfolded_state['screen']['orientation'] == 'landscape', {'workspace':workspace,'pose':unfolded_state}
    assert split['scrollWidth'] <= split['width'] + 1 and not split['overflow'], split
    page.screenshot(path=str(OUT / 'mail-unfolded-landscape-split.png'))
    page.evaluate('window.PeakDuo.fold()')
    page.wait_for_function('window.PeakDuo.getState().workspace.expanded === false')
    folded_state = wait_for_phone_ready(page, 'dark')
    folded = page.evaluate("({workspace:window.PeakDuo.getState().workspace,rootExpanded:document.querySelector('#duo').dataset.expanded,rootLayout:document.querySelector('#duo').dataset.layout})")
    assert folded['workspace']['expanded'] is False and folded['rootExpanded'] == 'false' and folded_state['screen']['orientation'] == 'portrait', {'workspace':folded,'pose':folded_state}
    page.set_viewport_size({'width': 1600, 'height': 900})
    closed_state = wait_for_phone_ready(page, 'dark')
    page.screenshot(path=str(OUT / 'mail-closed-portrait.png'))
    checks.append({'case':'unfolded-landscape-split-and-closed-portrait','split':split,'unfolded':unfolded_state,'folded':folded_state,'closed':closed_state})

    assert not errors, errors
    browser.close()

(OUT / 'browser-results.json').write_text(json.dumps({'passed':checks,'pageErrors':errors},indent=2))
print('PASS:',len(checks),'native Mail browser checks; no page errors')
