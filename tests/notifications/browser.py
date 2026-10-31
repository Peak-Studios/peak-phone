"""Exercise native notifications on the shipped synthetic preview in Chromium.

The cases use a local in-memory game fixture; they do not connect to FiveM or
perform live message, mail, contact, waypoint, or call actions.
"""
from pathlib import Path
import json
import os
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(os.environ.get('NOTIFICATIONS_EVIDENCE_DIR', str(ROOT / 'artifacts' / 'notifications'))).resolve()
OUT.mkdir(parents=True, exist_ok=True)
URL = os.environ.get('PREVIEW_URL', 'http://127.0.0.1:18941')
checks = []
page_errors = []
http_errors = []


def check(name, condition=True, details=None):
    assert condition, f'{name}: {details}' if details is not None else name
    checks.append(name)
    print('PASS', name, flush=True)


def send_notice(page, payload):
    page.evaluate('(payload)=>PeakDuo.sendPreview({Action:"Notification",...payload})', payload)


def remove_notice(page, ident):
    page.evaluate('(Id)=>PeakDuo.sendPreview({Action:"RemoveNotification",Id})', ident)
    page.wait_for_timeout(100)


def request_data(page, event):
    return page.evaluate('(name)=>PeakDuo.requests.filter(item=>item.event===name).map(item=>item.data)', event)


def active_theme(page, theme):
    page.evaluate('(value)=>PeakDuo.setPhoneSetting("appearance",value)', theme)
    page.wait_for_function('(value)=>document.querySelector("#duo").dataset.theme===value', arg=theme)
    wait_visual_stable(page)


def wait_visual_stable(page):
    page.wait_for_function('''()=>{
      const root=document.querySelector('#duo');
      return !!root&&!root.getAnimations({subtree:true}).some(animation=>animation.playState==='running'||animation.playState==='pending');
    }''', timeout=15000)


def banner_geometry(page):
    return page.locator('#duo-notifications .ios-notification').evaluate('''node=>{
      const r=node.getBoundingClientRect(),bank=node.closest('.duo-screenbank')?.getBoundingClientRect();
      return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,
        insidePhone:!!bank&&r.left>=bank.left-1&&r.right<=bank.right+1&&r.top>=bank.top-1&&r.bottom<=bank.bottom+1,
        horizontalOverflow:node.scrollWidth>node.clientWidth+1};
    }''')


def target_click(page, ident):
    card = page.locator(f'#duo-notifications .ios-notification')
    expect(card).to_have_count(1)
    card.get_by_role('button', name='Open', exact=False).click()
    return card


def new_preview_page(browser, viewport):
    page = browser.new_page(viewport=viewport)
    page.set_default_timeout(10000)
    page.on('pageerror', lambda error: page_errors.append({'message': str(error), 'stack': error.stack}))
    page.on('response', lambda response: http_errors.append({'status': response.status, 'url': response.url}) if response.url.startswith(URL) and response.status >= 400 else None)
    page.goto(URL, wait_until='domcontentloaded')
    page.wait_for_function('window.PeakDuo?.preview === true')
    page.wait_for_function('document.querySelector("#duo").dataset.visible === "true"')
    page.wait_for_function('document.querySelector("#duo")?.dataset.theme')
    page.evaluate("PeakDuo.setPhoneSetting('motion',true)")
    wait_visual_stable(page)
    return page


with sync_playwright() as pw:
    options = {'headless': True}
    if os.environ.get('CHROMIUM_PATH'):
        options['executable_path'] = os.environ['CHROMIUM_PATH']
    browser = pw.chromium.launch(**options)

    page = new_preview_page(browser, {'width': 1440, 'height': 1000})
    active_theme(page, 'light')
    send_notice(page, {
        'Id': 'notify-safe-text', 'Title': '<img src=x onerror=window.__notificationInjected=true>',
        'Text': 'Message preview <script>window.__notificationInjected=true</script>',
    })
    banner = page.locator('#duo-notifications .ios-notification')
    expect(banner.locator('.ios-notification-title')).to_contain_text('<img')
    expect(banner.locator('.ios-notification-message')).to_contain_text('<script>')
    check('player notification content stays text and never executes HTML', banner.locator('img,script').count() == 0 and page.evaluate('window.__notificationInjected !== true'))
    remove_notice(page, 'notify-safe-text')

    # Reusing an ID must make every old DOM action and update stale.
    send_notice(page, {'Id': 'reused-notification', 'Token': 'notice-token-1', 'Title': 'Old offer', 'Text': 'This offer has expired.', 'HasAccept': True})
    stale_accept = page.locator('#duo-notifications .ios-notification-action').first.element_handle()
    send_notice(page, {'Id': 'reused-notification', 'Token': 'notice-token-2', 'Title': 'New offer', 'Text': 'Only this offer is current.', 'HasReject': True})
    current_card = page.locator('#duo-notifications .ios-notification')
    expect(current_card.locator('.ios-notification-title')).to_have_text('New offer')
    click_count = len(request_data(page, 'Notifications/Click'))
    stale_accept.evaluate('button=>button.click()')
    page.evaluate("PeakDuo.sendPreview({Action:'UpdateNotification',Id:'reused-notification',Token:'notice-token-1',Title:'Stale update',Text:'Must be ignored.'})")
    expect(current_card.locator('.ios-notification-title')).to_have_text('New offer')
    check('reused notification IDs reject stale DOM actions and updates', len(request_data(page, 'Notifications/Click')) == click_count and current_card.locator('.ios-notification-action').get_attribute('aria-label') == 'Decline', {'clicksBefore': click_count, 'clicksAfter': len(request_data(page, 'Notifications/Click')), 'title': current_card.locator('.ios-notification-title').text_content(), 'action': current_card.locator('.ios-notification-action').get_attribute('aria-label')})
    remove_notice(page, 'reused-notification')

    # Exact routes go through the existing application entry points.
    direct = {'Id': 'route-direct', 'Title': 'New message', 'Text': 'Jordan sent a message.', 'Data': {'App': 'messages', 'Phone': '5550102002', 'Name': 'Jordan Lee', 'MessageId': 103}}
    send_notice(page, direct)
    target_click(page, direct['Id'])
    page.wait_for_function("PeakDuo.requests.some(r=>r.event==='Messages/GetHistoryAround'&&r.data.Phone==='5550102002'&&Number(r.data.MessageId)===103)")
    expect(page.locator('.duo-app-instance[data-app="messages"] .gx-thread-header')).to_contain_text('Jordan Lee')
    check('direct message banner opens exact phone and message id', request_data(page, 'Messages/GetHistoryAround')[-1] == {'Phone': '5550102002', 'MessageId': 103})
    remove_notice(page, direct['Id'])

    group = {'Id': 'route-group', 'Title': 'Added to Studio Crew', 'Text': 'Studio Crew added you.', 'Data': {'App': 'messages', 'GroupId': 'GRP20261005001', 'GroupName': 'Studio Crew'}}
    send_notice(page, group)
    target_click(page, group['Id'])
    page.wait_for_function("PeakDuo.requests.some(r=>r.event==='Groups/GetMessagesAround'&&r.data.GroupId==='GRP20261005001')")
    expect(page.locator('.duo-app-instance[data-app="messages"] .gx-thread-header')).to_contain_text('Studio Crew')
    check('group membership banner opens exact group without a message id', request_data(page, 'Groups/GetMessagesAround')[-1]['GroupId'] == 'GRP20261005001')
    remove_notice(page, group['Id'])

    mail = {'Id': 'route-mail', 'Title': 'New mail', 'Text': 'A little more room to work.', 'Data': {'App': 'mails', 'Id': 12}}
    send_notice(page, mail)
    target_click(page, mail['Id'])
    expect(page.locator('.duo-app-instance[data-app="mails"] .mail-detail-subject')).to_have_text('A little more room to work', timeout=10000)
    check('Mail banner opens its exact existing mail id', True)
    remove_notice(page, mail['Id'])

    post = {'Id': 'route-y', 'Title': 'New activity on Y', 'Text': 'Open the exact post.', 'Data': {'App': 'y', 'PostId': 1}}
    send_notice(page, post)
    target_click(page, post['Id'])
    page.wait_for_function("PeakDuo.requests.some(r=>r.event==='Y/GetThread'&&Number(r.data.Id)===1)")
    y_state = page.evaluate('PeakDuo.getState().workspace')
    check('Y banner loads exact post through GetThread', request_data(page, 'Y/GetThread')[-1] == {'Id': 1} and y_state['panes'][y_state['active']]['app'] == 'y')
    remove_notice(page, post['Id'])

    # The bridge sees all three explicit controls; swipes beginning on each
    # button must only dismiss and never synthesize an action click.
    actions = {'Id': 'route-actions', 'Title': 'Incoming call from Jordan Lee', 'Text': 'Voice call · 00:14',
               'HasAccept': True, 'HasReject': True, 'HasSpeaker': True, 'Data': {'CallId': 'PREVIEW-CALL', 'HideOnAction': False}}
    send_notice(page, actions)
    card = page.locator('#duo-notifications .ios-notification')
    expect(card.get_by_role('button', name='Accept')).to_be_visible()
    card.get_by_role('button', name='Accept').click()
    page.wait_for_function("PeakDuo.requests.some(r=>r.event==='Notifications/Click'&&r.data.Id==='route-actions'&&r.data.Accepted===true)")
    card.get_by_role('button', name='Decline').click()
    page.wait_for_function("PeakDuo.requests.some(r=>r.event==='Notifications/Click'&&r.data.Id==='route-actions'&&r.data.Accepted===false)")
    card.get_by_role('button', name='Use speaker').click()
    page.wait_for_function("PeakDuo.requests.some(r=>r.event==='Contacts/ToggleSpeaker'&&r.data.CallId==='PREVIEW-CALL')")
    check('real Chromium clicks reach Accept, Decline and speaker routes', True)

    action_clicks = len(request_data(page, 'Notifications/Click'))
    for ident, label, extra in [
        ('swipe-accept', 'Accept', {'HasAccept': True}),
        ('swipe-decline', 'Decline', {'HasReject': True}),
        ('swipe-speaker', 'Use speaker', {'HasSpeaker': True}),
    ]:
        remove_notice(page, 'route-actions')
        send_notice(page, {'Id': ident, 'Title': 'Incoming call', 'Text': 'Swipe to ignore safely.',
                           'Data': {'CallId': 'PREVIEW-CALL', 'HideOnAction': False}, **extra})
        card = page.locator('#duo-notifications .ios-notification')
        button = card.get_by_role('button', name=label)
        expect(button).to_be_visible()
        box = button.bounding_box()
        assert box, ident
        page.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
        page.mouse.down()
        page.mouse.move(box['x'] + box['width'] / 2, box['y'] - 74, steps=5)
        page.mouse.up()
        expect(page.locator('#duo-notifications .ios-notification')).to_have_count(0)
        page.wait_for_timeout(120)
        check(f'upward ignore starting on {label} only dismisses', len(request_data(page, 'Notifications/Click')) == action_clicks and any(item['Id'] == ident for item in request_data(page, 'Notifications/Dismiss')))

    mail_route = {'Id': 'swipe-mail', 'Title': 'Appointment update', 'Text': 'A safe upward ignore cannot open or mark this mail read.', 'Data': {'App': 'mails', 'Id': 10}}
    mail_route_counts = {event: len(request_data(page, event)) for event in ('Mails/GetMails', 'Mails/MarkAsRead', 'Maps/SetWaypoint')}
    send_notice(page, mail_route)
    card = page.locator('#duo-notifications .ios-notification')
    button = card.get_by_role('button', name='Open', exact=False)
    box = button.bounding_box()
    assert box, 'mail route button'
    page.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
    page.mouse.down()
    page.mouse.move(box['x'] + box['width'] / 2, box['y'] - 74, steps=5)
    page.mouse.up()
    expect(page.locator('#duo-notifications .ios-notification')).to_have_count(0)
    page.wait_for_timeout(150)
    check('upward ignore on a mail destination only dismisses without opening, marking read, or setting a waypoint', {event: len(request_data(page, event)) - count for event, count in mail_route_counts.items()} == {event: 0 for event in mail_route_counts})

    baseline = len(request_data(page, 'Mails/MarkAsRead'))
    horizontal = {'Id': 'gesture-horizontal', 'Title': 'Mail preview', 'Text': 'Horizontal drag must stay harmless.', 'Data': {'App': 'mails', 'Id': 12}}
    send_notice(page, horizontal)
    card = page.locator('#duo-notifications .ios-notification')
    box = card.bounding_box()
    page.mouse.move(box['x'] + 20, box['y'] + 20)
    page.mouse.down()
    page.mouse.move(box['x'] + 70, box['y'] + 20, steps=3)
    page.mouse.up()
    expect(card).to_be_visible()
    page.wait_for_timeout(100)
    check('horizontal swipes neither open nor dismiss a destination', len(request_data(page, 'Mails/MarkAsRead')) == baseline)
    remove_notice(page, horizontal['Id'])

    # Verify compact readability and three-action fit at the smallest portrait
    # render and the narrow split pane, in both themes.
    page.set_viewport_size({'width': 390, 'height': 844})
    for theme in ('light', 'dark'):
        active_theme(page, theme)
        page.evaluate("if(document.querySelector('#duo').dataset.expanded==='true')PeakDuo.fold();PeakDuo.setLayout('full')")
        page.wait_for_function("document.querySelector('#duo').dataset.expanded==='false'")
        wait_visual_stable(page)
        send_notice(page, {'Id': 'visual-portrait', 'Title': 'A long notification title remains readable at phone size',
                           'Text': 'A longer message preview stays readable and truncates cleanly without pushing the call controls past the card edge.'})
        banner = page.locator('#duo-notifications .ios-notification')
        expect(banner).to_be_visible()
        wait_visual_stable(page)
        typography = banner.evaluate('''node=>({title:parseFloat(getComputedStyle(node.querySelector('.ios-notification-title')).fontSize),body:parseFloat(getComputedStyle(node.querySelector('.ios-notification-message')).fontSize),meta:parseFloat(getComputedStyle(node.querySelector('.ios-notification-meta')).fontSize),overflow:node.scrollWidth>node.clientWidth})''')
        portrait_geometry = banner_geometry(page)
        assert typography['title'] >= 14 and typography['body'] >= 13 and not typography['overflow'] and portrait_geometry['insidePhone'], {'typography':typography,'geometry':portrait_geometry}
        page.evaluate('document.activeElement?.blur?.()')
        page.screenshot(path=str(OUT / f'notification-folded-portrait-{theme}.png'))
        check(f'{theme} folded portrait banner has readable title/body and no overflow', typography)
        remove_notice(page, 'visual-portrait')

    # New action-bearing records stay visible at the top of the phone even
    # when older long-lived call notices fill the scrollable banner stack.
        stacked_ids = []
        for index in range(6):
            ident = f'visual-stack-{theme}-{index}'
            stacked_ids.append(ident)
            send_notice(page, {'Id': ident, 'Title': f'Call notice {index + 1}', 'Text': 'Keep important controls visible.', 'HasAccept': True})
        stack_host = page.locator('#duo-notifications')
        stack_first = stack_host.locator('.ios-notification').first
        expect(stack_host.locator('.ios-notification')).to_have_count(6)
        wait_visual_stable(page)
        stack_geometry = stack_first.evaluate('''node=>{const c=node.getBoundingClientRect(),h=node.parentElement.getBoundingClientRect(),b=node.closest('.duo-screenbank')?.getBoundingClientRect();return {title:node.querySelector('.ios-notification-title').textContent,top:c.top,hostTop:h.top,insidePhone:!!b&&c.left>=b.left-1&&c.right<=b.right+1&&c.top>=b.top-1&&c.bottom<=b.bottom+1}}''')
        assert stack_geometry['title'] == 'Call notice 6' and stack_geometry['top'] >= stack_geometry['hostTop'] - 1 and stack_geometry['insidePhone'], stack_geometry
        check(f'{theme} newest sticky notification remains visible atop a retained stack', stack_geometry)
        for ident in stacked_ids:
            remove_notice(page, ident)

        page.evaluate('PeakDuo.fold()')
        page.wait_for_function("document.querySelector('#duo').dataset.expanded==='true'")
        wait_visual_stable(page)
        send_notice(page, {'Id': 'visual-inner', 'Title': 'Unfolded iPhone notification', 'Text': 'Compact copy and native controls remain inside the centered banner.'})
        wait_visual_stable(page)
        inner_geometry = banner_geometry(page)
        assert inner_geometry['insidePhone'], inner_geometry
        page.screenshot(path=str(OUT / f'notification-unfolded-{theme}.png'))
        check(f'{theme} unfolded screen renders native banner inside the phone', inner_geometry)
        remove_notice(page, 'visual-inner')

        page.evaluate("PeakDuo.setLayout('split');PeakDuo.openApp('messages','left');PeakDuo.openApp('mails','right')")
        page.wait_for_function("document.querySelector('#duo').dataset.layout==='split'")
        wait_visual_stable(page)
        send_notice(page, {'Id': 'visual-split', 'Title': 'Three action buttons fit in split view',
                           'Text': 'The notification copy wraps comfortably while every call control stays within the card.',
                           'HasAccept': True, 'HasReject': True, 'HasSpeaker': True,
                           'Data': {'CallId': 'PREVIEW-CALL', 'HideOnAction': False}})
        split = page.locator('#duo-notifications .ios-notification')
        expect(split.locator('.ios-notification-actions button')).to_have_count(3)
        wait_visual_stable(page)
        geometry = split.evaluate('''card=>{const c=card.getBoundingClientRect(),b=card.closest('.duo-screenbank')?.getBoundingClientRect(),buttons=[...card.querySelectorAll('.ios-notification-action')].map(n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,scroll:n.scrollWidth,client:n.clientWidth}});return {card:{left:c.left,right:c.right,top:c.top,bottom:c.bottom,width:c.width},buttons,insidePhone:!!b&&c.left>=b.left-1&&c.right<=b.right+1&&c.top>=b.top-1&&c.bottom<=b.bottom+1,overflow:buttons.some(button=>button.left<c.left-1||button.right>c.right+1)||card.scrollWidth>card.clientWidth+1}}''')
        assert not geometry['overflow'] and geometry['insidePhone'], geometry
        page.evaluate('document.activeElement?.blur?.()')
        page.screenshot(path=str(OUT / f'notification-split-{theme}.png'))
        check(f'{theme} split view fits long copy and all three call actions', geometry)
        remove_notice(page, 'visual-split')
    # Close/reopen while Y's initial feed is in flight. The delayed initial feed
    # must not launch a thread into the new phone session.
    lifecycle = new_preview_page(browser, {'width': 1280, 'height': 900})
    lifecycle.evaluate("PeakDuo.setPreviewDelay('Y/GetFeed',900)")
    close_notice = {'Id': 'race-close-y', 'Title': 'Y mention', 'Text': 'Private thread during delayed feed.', 'Data': {'App': 'y', 'PostId': 1}}
    send_notice(lifecycle, close_notice)
    target_click(lifecycle, close_notice['Id'])
    lifecycle.wait_for_function("PeakDuo.requests.some(r=>r.event==='Y/GetFeed')")
    lifecycle.evaluate("PeakDuo.sendPreview({Action:'ClosePhone'})")
    lifecycle.wait_for_function("document.querySelector('#duo').dataset.visible==='false'")
    lifecycle.evaluate('PeakDuo.open()')
    lifecycle.wait_for_function("document.querySelector('#duo').dataset.visible==='true'")
    lifecycle.wait_for_timeout(1200)
    check('close/reopen invalidates a pending Y destination before GetThread', len(request_data(lifecycle, 'Y/GetThread')) == 0 and lifecycle.locator('.duo-app-instance[data-app="y"] .nx-post-detail').count() == 0)

    # Lock while the same initial feed is pending. The notification redacts its
    # private text and its old route remains invalid even after feed completion.
    lockpage = new_preview_page(browser, {'width': 1280, 'height': 900})
    lockpage.evaluate("PeakDuo.setPreviewDelay('Y/GetFeed',900)")
    secret = {'Id': 'race-lock-y', 'Title': 'Private sender name', 'Text': 'A secret post preview.', 'Data': {'App': 'y', 'PostId': 1}}
    send_notice(lockpage, secret)
    target_click(lockpage, secret['Id'])
    lockpage.wait_for_function("PeakDuo.requests.some(r=>r.event==='Y/GetFeed')")
    lockpage.evaluate("PeakDuo.sendPreview({Action:'OpenPhone',PlayerData:{Cid:'PREVIEW',DeviceId:'DUO-PREVIEW0001',PhoneNumber:'5550102001',DeviceLocked:true,DeviceGeneration:1,HasSim:true}})")
    lockpage.wait_for_function("document.querySelector('#duo').dataset.visible==='true'")
    expect(lockpage.locator('#duo-notifications .ios-notification-title')).to_have_text('Notification')
    expect(lockpage.locator('#duo-notifications .ios-notification-message')).to_have_text('Unlock your phone to view it.')
    lockpage.wait_for_timeout(1200)
    check('locked notification hides private text and cancels pending Y thread', len(request_data(lockpage, 'Y/GetThread')) == 0 and 'Private sender name' not in lockpage.locator('#duo').inner_text())

    # A manual app change during a yielding GetThread must keep the user's newer
    # destination in front after the stale thread response comes back.
    manual = new_preview_page(browser, {'width': 1280, 'height': 900})
    manual.evaluate("PeakDuo.setPreviewDelay('Y/GetThread',850)")
    manual_notice = {'Id': 'race-manual-y', 'Title': 'Old Y post', 'Text': 'This route must not take focus back.', 'Data': {'App': 'y', 'PostId': 2}}
    send_notice(manual, manual_notice)
    target_click(manual, manual_notice['Id'])
    manual.wait_for_function("PeakDuo.requests.some(r=>r.event==='Y/GetThread'&&r.data.Id===2)")
    manual.evaluate("PeakDuo.openApp('messages','left')")
    manual.wait_for_function("(()=>{const s=PeakDuo.getState().workspace;return s.panes[s.active].app==='messages'})()")
    manual.wait_for_timeout(1100)
    state = manual.evaluate('PeakDuo.getState()')
    check('manual navigation during GetThread keeps the newer Messages view', state['workspace']['panes'][state['workspace']['active']]['app'] == 'messages' and manual.locator('.duo-app-instance[data-app="y"] .nx-post-detail').count() == 0)

    y_lock_thread = new_preview_page(browser, {'width': 1280, 'height': 900})
    y_lock_thread.evaluate("PeakDuo.setPreviewDelay('Y/GetThread',850)")
    y_lock_notice = {'Id': 'race-lock-y-thread', 'Title': 'Private Y post', 'Text': 'A locked request cannot leave this thread selected.', 'Data': {'App': 'y', 'PostId': 2}}
    send_notice(y_lock_thread, y_lock_notice)
    target_click(y_lock_thread, y_lock_notice['Id'])
    y_lock_thread.wait_for_function("PeakDuo.requests.some(r=>r.event==='Y/GetThread'&&r.data.Id===2)")
    y_lock_thread.evaluate("PeakDuo.sendPreview({Action:'OpenPhone',PlayerData:{Cid:'PREVIEW',DeviceId:'DUO-PREVIEW0001',PhoneNumber:'5550102001',DeviceLocked:true,DeviceGeneration:1,HasSim:true}})")
    y_lock_thread.locator('.duo-lock-screen:not([hidden])').wait_for(state='attached')
    y_lock_thread.wait_for_timeout(1100)
    y_lock_thread.evaluate("PeakDuo.sendPreview({Action:'Duo/DeviceUnlocked'})")
    y_lock_thread.wait_for_function("!document.querySelector('.duo-lock-screen:not([hidden])')")
    y_lock_thread.wait_for_timeout(150)
    check('locking during GetThread returns Y to its prior feed after unlock', y_lock_thread.locator('.duo-app-instance[data-app="y"] .nx-post-detail').count() == 0)

    # Approved Mail and Messages apps must receive this route's currentness
    # predicate so their own async work cannot commit a stale exact target.
    mail_race = new_preview_page(browser, {'width': 1280, 'height': 900})
    mail_race.evaluate("PeakDuo.setPreviewDelay('Mails/GetMails',850)")
    mail_notice = {'Id': 'race-manual-mail', 'Title': 'Old mail', 'Text': 'A later navigation takes priority.', 'Data': {'App': 'mails', 'Id': 12}}
    send_notice(mail_race, mail_notice)
    target_click(mail_race, mail_notice['Id'])
    mail_race.wait_for_function("PeakDuo.requests.some(r=>r.event==='Mails/GetMails')")
    mail_race.evaluate("PeakDuo.openApp('contacts','left')")
    mail_race.wait_for_function("(()=>{const s=PeakDuo.getState().workspace;return s.panes[s.active].app==='contacts'})()")
    mail_race.wait_for_timeout(1100)
    mail_race.evaluate("PeakDuo.openApp('mails','left')")
    mail_race.wait_for_function("(()=>{const s=PeakDuo.getState().workspace;return s.panes[s.active].app==='mails'})()")
    mail_state = mail_race.evaluate('PeakDuo.getState()')
    check('manual navigation during Mails/GetMails keeps Mail on inbox', mail_race.locator('.duo-app-instance[data-app="mails"] .mail-detail-subject').count() == 0 and mail_state['workspace']['panes'][mail_state['workspace']['active']]['app'] == 'mails')

    message_race = new_preview_page(browser, {'width': 1280, 'height': 900})
    message_race.evaluate("PeakDuo.setPreviewDelay('Messages/GetHistoryAround',850)")
    message_notice = {'Id': 'race-manual-message', 'Title': 'Old message', 'Text': 'A later navigation takes priority.', 'Data': {'App': 'messages', 'Phone': '5550102002', 'Name': 'Jordan Lee', 'MessageId': 103}}
    send_notice(message_race, message_notice)
    target_click(message_race, message_notice['Id'])
    message_race.wait_for_function("PeakDuo.requests.some(r=>r.event==='Messages/GetHistoryAround'&&r.data.MessageId===103)")
    message_race.evaluate("PeakDuo.openApp('contacts','left')")
    message_race.wait_for_function("(()=>{const s=PeakDuo.getState().workspace;return s.panes[s.active].app==='contacts'})()")
    message_race.wait_for_timeout(1100)
    message_race.evaluate("PeakDuo.openApp('messages','left')")
    message_race.wait_for_function("(()=>{const s=PeakDuo.getState().workspace;return s.panes[s.active].app==='messages'})()")
    message_state = message_race.evaluate('PeakDuo.getState()')
    check('manual navigation during GetHistoryAround leaves Messages on inbox', message_race.locator('.duo-app-instance[data-app="messages"] .gx-thread-header').count() == 0 and message_state['workspace']['panes'][message_state['workspace']['active']]['app'] == 'messages')

    # Locking does not destroy mounted app instances, so the app itself must
    # discard the stale notification destination before committing its data.
    mail_lock = new_preview_page(browser, {'width': 1280, 'height': 900})
    mail_lock.evaluate("PeakDuo.setPreviewDelay('Mails/GetMails',850)")
    locked_mail_notice = {'Id': 'race-lock-mail', 'Title': 'Private mail', 'Text': 'This target must expire on lock.', 'Data': {'App': 'mails', 'Id': 12}}
    send_notice(mail_lock, locked_mail_notice)
    target_click(mail_lock, locked_mail_notice['Id'])
    mail_lock.wait_for_function("PeakDuo.requests.some(r=>r.event==='Mails/GetMails')")
    mail_lock.evaluate("PeakDuo.sendPreview({Action:'OpenPhone',PlayerData:{Cid:'PREVIEW',DeviceId:'DUO-PREVIEW0001',PhoneNumber:'5550102001',DeviceLocked:true,DeviceGeneration:1,HasSim:true}})")
    mail_lock.locator('.duo-lock-screen:not([hidden])').wait_for(state='attached')
    mail_lock.wait_for_timeout(1100)
    mail_lock.evaluate("PeakDuo.sendPreview({Action:'Duo/DeviceUnlocked'})")
    mail_lock.wait_for_function("!document.querySelector('.duo-lock-screen:not([hidden])')")
    mail_lock.wait_for_timeout(150)
    check('locking during Mails/GetMails discards the exact private mail destination', mail_lock.locator('.duo-app-instance[data-app="mails"] .mail-detail-subject').count() == 0 and len(request_data(mail_lock, 'Mails/MarkAsRead')) == 0)

    message_lock = new_preview_page(browser, {'width': 1280, 'height': 900})
    message_lock.evaluate("PeakDuo.setPreviewDelay('Messages/GetHistoryAround',850)")
    locked_message_notice = {'Id': 'race-lock-message', 'Title': 'Private message', 'Text': 'This target must expire on lock.', 'Data': {'App': 'messages', 'Phone': '5550102002', 'Name': 'Jordan Lee', 'MessageId': 103}}
    send_notice(message_lock, locked_message_notice)
    target_click(message_lock, locked_message_notice['Id'])
    message_lock.wait_for_function("PeakDuo.requests.some(r=>r.event==='Messages/GetHistoryAround'&&r.data.MessageId===103)")
    message_lock.evaluate("PeakDuo.sendPreview({Action:'OpenPhone',PlayerData:{Cid:'PREVIEW',DeviceId:'DUO-PREVIEW0001',PhoneNumber:'5550102001',DeviceLocked:true,DeviceGeneration:1,HasSim:true}})")
    message_lock.locator('.duo-lock-screen:not([hidden])').wait_for(state='attached')
    message_lock.wait_for_timeout(1100)
    message_lock.evaluate("PeakDuo.sendPreview({Action:'Duo/DeviceUnlocked'})")
    message_lock.wait_for_function("!document.querySelector('.duo-lock-screen:not([hidden])')")
    message_lock.wait_for_timeout(150)
    check('locking during GetHistoryAround discards the exact private message destination', message_lock.locator('.duo-app-instance[data-app="messages"] .gx-thread-header').count() == 0 and len(request_data(message_lock, 'Messages/SetChatRead')) == 0)

    # Server identity invalidation arrives before the full identity reset. It
    # must clear the old banner and invalidate each in-flight exact route now.
    identity_races = [
        ('Mail', 'Mails/GetMails', {'Id': 'race-identity-mail', 'Title': 'Old private mail', 'Text': 'Do not open after identity invalidation.', 'Data': {'App': 'mails', 'Id': 12}}, 'Mails/MarkAsRead', '.duo-app-instance[data-app="mails"] .mail-detail-subject'),
        ('Messages', 'Messages/GetHistoryAround', {'Id': 'race-identity-message', 'Title': 'Old private message', 'Text': 'Do not open after identity invalidation.', 'Data': {'App': 'messages', 'Phone': '5550102002', 'Name': 'Jordan Lee', 'MessageId': 103}}, 'Messages/SetChatRead', '.duo-app-instance[data-app="messages"] .gx-thread-header'),
        ('Y', 'Y/GetFeed', {'Id': 'race-identity-y-pending', 'Title': 'Old private post', 'Text': 'Do not open after identity invalidation.', 'Data': {'App': 'y', 'PostId': 1}}, 'Y/GetThread', '.duo-app-instance[data-app="y"] .nx-post-detail'),
    ]
    for label, pending_event, notice, forbidden_event, target_selector in identity_races:
        identity_race = new_preview_page(browser, {'width': 1280, 'height': 900})
        identity_race.evaluate('(event)=>PeakDuo.setPreviewDelay(event,900)', pending_event)
        send_notice(identity_race, notice)
        target_click(identity_race, notice['Id'])
        identity_race.wait_for_function('(event)=>PeakDuo.requests.some(item=>item.event===event)', arg=pending_event)
        identity_race.evaluate("PeakDuo.sendPreview({Action:'Duo/IdentityChanging',Reason:'Device identity changed.'})")
        expect(identity_race.locator('#duo-notifications .ios-notification')).to_have_count(0)
        identity_race.wait_for_timeout(1200)
        check(f'identity invalidation clears and cancels pending {label} destination', len(request_data(identity_race, forbidden_event)) == 0 and identity_race.locator(target_selector).count() == 0)

    # A device identity change resets native notification state and cancels the
    # same pending feed lookup before it can route into the replacement device.
    identity = new_preview_page(browser, {'width': 1280, 'height': 900})
    identity.evaluate("PeakDuo.setPreviewDelay('Y/GetFeed',900)")
    identity_notice = {'Id': 'race-identity-y', 'Title': 'Account-specific post', 'Text': 'Old device content.', 'Data': {'App': 'y', 'PostId': 1}}
    send_notice(identity, identity_notice)
    target_click(identity, identity_notice['Id'])
    identity.wait_for_function("PeakDuo.requests.some(r=>r.event==='Y/GetFeed')")
    identity.evaluate("PeakDuo.sendPreview({Action:'OpenPhone',PlayerData:{Cid:'OTHER',DeviceId:'DUO-OTHER0002',PhoneNumber:'5550102999',DeviceLocked:false,DeviceGeneration:2,HasSim:true}})")
    identity.wait_for_timeout(1200)
    check('SIM/device identity change clears and cancels the old exact destination', len(request_data(identity, 'Y/GetThread')) == 0 and identity.locator('#duo-notifications .ios-notification').count() == 0)

    # The mirror uses the physical-screen stylesheet and carries both the live
    # native banner and the privacy-redacted locked state.
    lifecycle.evaluate("PeakDuo.sendPreview({Action:'RemoveNotification',Id:'race-close-y'});if(document.querySelector('#duo').dataset.expanded==='false')PeakDuo.fold()")
    lifecycle.wait_for_function("document.querySelector('#duo').dataset.expanded==='true'")
    wait_visual_stable(lifecycle)
    send_notice(lifecycle, {'Id': 'physical-unlocked', 'Title': 'New message from Jordan', 'Text': 'The studio is ready. See you at six.'})
    wait_visual_stable(lifecycle)
    lifecycle.evaluate('''async()=>{
      const {displaySnapshot,encodeDisplay}=await import('/duo/screen-capture.mjs');
      const root=document.querySelector('#duo'),bank=root.querySelector('.duo-screenbank');
      window.__notificationFrame=await encodeDisplay(displaySnapshot(bank,root,true));
    }''')
    lockpage.set_viewport_size({'width': 1280, 'height': 900})
    if lockpage.locator('#duo').get_attribute('data-expanded') == 'false':
        lockpage.evaluate('PeakDuo.fold()')
    lockpage.wait_for_function("document.querySelector('#duo').dataset.expanded==='true'")
    wait_visual_stable(lockpage)
    lockpage.evaluate('''async()=>{
      const {displaySnapshot,encodeDisplay}=await import('/duo/screen-capture.mjs');
      const root=document.querySelector('#duo'),bank=root.querySelector('.duo-screenbank');
      window.__notificationFrame=await encodeDisplay(displaySnapshot(bank,root,true));
    }''')
    mirror = browser.new_page(viewport={'width': 2048, 'height': 1024})
    mirror.on('pageerror', lambda error: page_errors.append({'message': str(error), 'stack': error.stack}))
    mirror.set_content(f'<iframe id="physical" title="Physical display preview" src="{URL}/duo/physical-screen.html" style="width:2048px;height:1024px;border:0"></iframe>')
    mirror.frame_locator('#physical').locator('#display').wait_for(state='attached')
    mirror.frame_locator('#physical').frame_locator('#display').locator('#duo .duo-chassis').wait_for(state='attached')
    mirror.wait_for_timeout(250)
    mirror.evaluate("frame=>document.querySelector('#physical').contentWindow.postMessage({type:'frame',frame},'*')", lifecycle.evaluate('window.__notificationFrame'))
    mirror.frame_locator('#physical').frame_locator('#display').locator('.ios-notification-title').wait_for(state='attached')
    unlocked_mirror_text = mirror.frame_locator('#physical').frame_locator('#display').locator('.duo-screenbank').inner_text()
    check('unlocked physical mirror shows native notification styles and text', 'New message from Jordan' in unlocked_mirror_text)
    mirror.screenshot(path=str(OUT / 'notification-unlocked-physical-mirror.png'))

    mirror.evaluate("frame=>document.querySelector('#physical').contentWindow.postMessage({type:'frame',frame},'*')", lockpage.evaluate('window.__notificationFrame'))
    mirror.frame_locator('#physical').frame_locator('#display').locator('.duo-lock-screen:not([hidden])').wait_for(state='attached')
    mirror_text = mirror.frame_locator('#physical').frame_locator('#display').locator('.duo-screenbank').inner_text()
    check('locked physical mirror contains no private notification text', 'Private sender name' not in mirror_text and 'A secret post preview.' not in mirror_text)
    mirror.screenshot(path=str(OUT / 'notification-locked-physical-mirror.png'))

    check('Chromium produced no page errors', not page_errors, page_errors[:5])
    check('preview assets produced no HTTP errors', not http_errors, http_errors[:5])
    report = {'suite': 'native-notifications-chromium', 'checks': len(checks), 'cases': checks,
              'pageErrors': page_errors, 'httpErrors': http_errors,
              'fixtureOnly': True, 'liveFiveM': False, 'inGameAcceptance': 'pending'}
    (OUT / 'notifications-browser-results.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    browser.close()

print(f"{len(checks)} notification browser checks passed; evidence: {OUT}", flush=True)
