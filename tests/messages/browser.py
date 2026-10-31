"""Exercise the Messages UI against in-memory fixtures and Chromium's fake mic.

Run the loopback preview first, then `npm run test:browser:messages`. Screenshots
and an assertion report are written to artifacts/messages. The recording
checks use Chromium's fake device with native MediaRecorder; they do not access
a physical microphone, FiveM server, database, or live bank transaction.
"""
from pathlib import Path
import json
import os
import re
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(os.environ.get('MESSAGES_EVIDENCE_DIR', str(ROOT / 'artifacts' / 'messages'))).resolve()
OUT.mkdir(parents=True, exist_ok=True)
URL = os.environ.get('PREVIEW_URL', 'http://127.0.0.1:8791')
checks = []
page_errors = []
http_errors = []


def check(name, condition=True, details=None):
    assert condition, f'{name}: {details}' if details is not None else name
    checks.append(name)
    print('PASS', name, flush=True)


def screenshot(page, name):
    page.screenshot(path=str(OUT / f'{name}.png'))


def horizontal_overflow(page):
    roots = page.locator('.duo-pane[data-side="right"] .duo-app-instance[data-app="messages"]')
    if not roots.count():
        roots = page.locator('.duo-pane[data-side="left"] .duo-app-instance[data-app="messages"]')
    return roots.first.evaluate('''root=>{
      const nodes=[root,...root.querySelectorAll('.gx-body,.gx-thread-row,.gx-message-row,.gx-message,.gx-audio-message,.gx-audio-controls,.gx-compose-bar,.gx-compose-actions,.gx-compose-actions>textarea')];
      return nodes.filter(n=>n.getClientRects().length&&n.scrollWidth>n.clientWidth+1).map(n=>({className:n.className,scroll:n.scrollWidth,client:n.clientWidth}));
    }''')


def message_contrast(page):
    return page.locator('.duo-app-instance[data-app="messages"]').evaluate('''root=>{
      const rgb=s=>(s.match(/[\\d.]+/g)||[]).slice(0,3).map(Number);
      const lum=c=>c.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
      const ratio=(a,b)=>{const q=[lum(rgb(a)),lum(rgb(b))].sort((x,y)=>x-y);return (q[1]+.05)/(q[0]+.05);};
      const incoming=root.querySelector('.gx-message:not(.gx-message-own) .gx-prewrap');
      const outgoing=root.querySelector('.gx-message-row-own .gx-prewrap');
      const add=root.querySelector('.gx-compose-add'),send=root.querySelector('.gx-send-button:not([hidden])');
      const pair=(inkNode,bgNode)=>inkNode&&bgNode?ratio(getComputedStyle(inkNode).color,getComputedStyle(bgNode).backgroundColor):null;
      return {incoming:pair(incoming,incoming?.closest('.gx-message')),outgoing:pair(outgoing,outgoing?.closest('.gx-message')),add:pair(add?.querySelector('svg'),add),send:pair(send?.querySelector('svg'),send)};
    }''')


def cash_review_layout(page):
    return page.locator('.gx-cash-result').evaluate('''review=>{
      const body=review.querySelector(':scope > .gx-cash-result-body'),actions=review.querySelector(':scope > .gx-cash-result-actions');
      const rect=node=>{const r=node.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height};};
      const sheet=review.closest('.nx-sheet'),amount=body?.querySelector('.gx-cash-result-amount');
      const bodyRect=body&&rect(body),actionsRect=actions&&rect(actions),sheetRect=sheet&&rect(sheet),amountRect=amount&&rect(amount);
      const amountVisible=!!amountRect&&amountRect.top>=bodyRect.top-1&&amountRect.bottom<=bodyRect.bottom+1;
      const footerSeparate=!!bodyRect&&!!actionsRect&&actionsRect.top>=bodyRect.top&&bodyRect.bottom<=actionsRect.top+1;
      const footerInsideSheet=!!sheetRect&&!!actionsRect&&actionsRect.bottom<=sheetRect.bottom+1;
      const noOverflow=[review,body,actions].filter(Boolean).every(node=>node.scrollWidth<=node.clientWidth+1);
      const app=review.closest('.duo-app-instance')?.querySelector('.gx-messages');
      return {amountVisible,footerSeparate,footerInsideSheet,noOverflow,bodyOverflowY:body?getComputedStyle(body).overflowY:'',sheetBackground:sheet?getComputedStyle(sheet).backgroundColor:'',appBackground:app?getComputedStyle(app).backgroundColor:'',bodyRect,actionsRect,sheetRect,amountRect};
    }''')


def enter_cash_amount(cash, amount):
    keypad_toggle = cash.get_by_role('button', name='Show Keypad')
    if keypad_toggle.is_visible():
        keypad_toggle.click()
    delete = cash.get_by_role('button', name='Delete last digit')
    for _ in range(8):
        delete.click()
    for digit in str(amount):
        cash.get_by_role('button', name=digit, exact=True).click()
    cash.locator('.gx-cash-amount-large').wait_for(state='visible')
    assert cash.locator('.gx-cash-amount-large').inner_text().replace(',', '') == f'${amount}'


def message_readability(page):
    return page.locator('.duo-app-instance[data-app="messages"]').evaluate('''root=>{
      const size=node=>node?parseFloat(getComputedStyle(node).fontSize):0;
      return {
        body:size(root.querySelector('.gx-message .gx-prewrap')),
        metadata:size(root.querySelector('.gx-message-meta')),
        phoneLabel:size(root.querySelector('.gx-thread-header .nx-heading p')),
        composer:size(root.querySelector('.gx-compose-actions textarea'))
      };
    }''')


with sync_playwright() as pw:
    options = {'headless': True, 'args': ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']}
    if os.environ.get('CHROMIUM_PATH'):
        options['executable_path'] = os.environ['CHROMIUM_PATH']
    browser = pw.chromium.launch(**options)
    context = browser.new_context(viewport={'width': 1920, 'height': 1080}, permissions=['microphone'])
    page = context.new_page()
    page.set_default_timeout(10000)
    page.on('pageerror', lambda error: page_errors.append({'message':str(error),'stack':error.stack}))
    page.on('response', lambda response: http_errors.append({'status': response.status, 'url': response.url}) if response.url.startswith(URL) and response.status >= 400 else None)
    page.goto(URL, wait_until='domcontentloaded')
    page.wait_for_function('window.PeakDuo?.preview === true')
    page.evaluate("PeakDuo.setLayout('full');PeakDuo.openApp('messages','left')")
    inbox = page.locator('.duo-app-instance[data-app="messages"] .gx-message-inbox')
    inbox.wait_for(state='visible')
    rows = page.locator('.duo-app-instance[data-app="messages"] .gx-thread-row')
    page.get_by_role('button', name='Open Jordan Lee').wait_for(state='visible')
    page.get_by_role('button', name='Open Studio Crew').wait_for(state='visible')
    page.get_by_role('button', name='Open Maya Chen').wait_for(state='visible')
    page.get_by_role('button', name='Open Sam Rivera').wait_for(state='visible')
    check('First open shows populated inbox without an initial sheet or Promise text', rows.count() == 4 and page.get_by_role('dialog').count() == 0 and '[object Promise]' not in page.locator('body').inner_text())
    check('Inbox search truthfully limits its scope to names and previews', page.get_by_role('searchbox', name='Search names and previews').count() == 1)
    screenshot(page, 'inbox-dark')

    for theme in ('dark', 'light'):
        page.evaluate('(theme)=>PeakDuo.setPhoneSetting("appearance",theme)', theme)
        page.wait_for_function('(theme)=>document.querySelector("#duo").dataset.theme===theme', arg=theme)
        check(f'{theme} theme is applied to Messages', page.locator('#duo').get_attribute('data-theme') == theme)

        search = page.get_by_role('searchbox', name='Search names and previews')
        search.fill('jOrDaN')
        check(f'{theme} inbox search finds a direct contact by case-insensitive name', rows.count() == 1 and page.get_by_role('button', name='Open Jordan Lee').is_visible())
        search.fill('5550102002')
        check(f'{theme} inbox search finds a direct conversation by phone number', rows.count() == 1 and page.get_by_role('button', name='Open Jordan Lee').is_visible())
        search.fill('pErFeCt. tExT mE')
        check(f'{theme} inbox search finds a direct conversation by preview text', rows.count() == 1 and page.get_by_role('button', name='Open Sam Rivera').is_visible())
        search.fill('vOiCe mEsSaGe')
        check(f'{theme} inbox search finds the visible voice-message preview label', rows.count() == 1 and page.get_by_role('button', name='Open Jordan Lee').is_visible())
        search.fill('pAyMeNt ReQuEsT')
        check(f'{theme} inbox search finds the visible cash-request preview label', rows.count() == 1 and page.get_by_role('button', name='Open Maya Chen').is_visible())
        search.fill('sTuDiO cReW')
        check(f'{theme} inbox search finds a group by name', rows.count() == 1 and page.get_by_role('button', name='Open Studio Crew').is_visible())
        search.fill('no matching demo conversation')
        page.get_by_text('No matching conversations', exact=True).wait_for(state='visible')
        check(f'{theme} no-match search has an honest empty state', page.locator('.gx-message-inbox .nx-empty').is_visible())
        search.fill('')

        page.evaluate("PeakDuo.previewAdapter.messagesFixture.failOnce('Messages/GetHistoryAround','Synthetic preview read failure.')")
        page.get_by_role('button', name='Open Sam Rivera').click()
        page.get_by_text('Conversation unavailable', exact=True).wait_for(state='visible')
        check(f'{theme} thread read error exposes retry', page.get_by_role('button', name='Try again').is_visible())
        screenshot(page, f'messages-error-{theme}')
        page.get_by_role('button', name='Try again').click()
        page.get_by_text('Saturday plan: the west garage is open after noon.', exact=False).wait_for(state='visible')
        page.wait_for_function("()=>document.querySelector('.duo-toast')?.hidden===true")
        check(f'{theme} transient error toast clears before clean evidence', page.locator('.duo-toast').is_hidden())
        check(f'{theme} retry recovers and renders the long-message thread', page.locator('.gx-message-row .gx-prewrap').count() == 3)
        check(f'{theme} long text wraps without horizontal overflow', not horizontal_overflow(page))
        screenshot(page, f'long-thread-{theme}')
        page.get_by_role('button', name='Back to conversations').click()
        inbox.wait_for(state='visible')

        page.get_by_role('button', name='Start a group').click()
        dialog = page.get_by_role('dialog', name='New group')
        dialog.wait_for(state='visible')
        dialog.get_by_label('Group name').fill('Photo weekend')
        dialog.get_by_label('Choose people').fill('Jordan')
        jordan = dialog.locator('button.gx-messages-editor-row').filter(has_text='Jordan Lee')
        jordan.click()
        check(f'{theme} group contact picker selects a contact', jordan.get_attribute('aria-pressed') == 'true')
        dialog.get_by_label('Choose people').fill('Taylor')
        taylor = dialog.locator('button.gx-messages-editor-row').filter(has_text='Taylor Brooks')
        taylor.click()
        check(f'{theme} group picker supports multiple contacts without exceeding cap', taylor.get_attribute('aria-pressed') == 'true' and 'up to 14 people' in dialog.inner_text())
        screenshot(page, f'group-contact-picker-{theme}')
        dialog.locator('.nx-sheet-dismiss').click()

        page.get_by_role('button', name='Open Jordan Lee').click()
        page.locator('.gx-audio-player').first.wait_for(state='attached')
        page.wait_for_function('''()=>{const a=document.querySelector('.gx-audio-player');return a&&Number.isFinite(a.duration)&&a.duration>0&&a.readyState>=1}''')
        check(f'{theme} direct thread has native compact contact header', page.locator('.gx-thread-header .gx-thread-header-avatar').count() == 1 and 14 <= float(page.locator('.gx-thread-header h1').evaluate('(n)=>parseFloat(getComputedStyle(n).fontSize)')) <= 20)
        readability = message_readability(page)
        check(f'{theme} message text, metadata, phone label and composer remain readable', readability['body'] >= 14 and readability['metadata'] >= 10 and readability['phoneLabel'] >= 10 and readability['composer'] >= 14, readability)
        check(f'{theme} enlarged conversation type fits without horizontal overflow', not horizontal_overflow(page))
        check(f'{theme} direct thread includes existing reaction chip below its message', page.locator('.gx-reaction-row .gx-reaction-chip').count() >= 1)
        screenshot(page, f'direct-thread-{theme}')

        play = page.get_by_role('button', name='Play voice message').first
        audio = page.locator('.gx-audio-player').first
        play.click()
        page.wait_for_function("()=>{const a=document.querySelector('.gx-audio-player');return a&&!a.paused&&a.currentTime>.2}")
        check(f'{theme} voice message genuinely starts playback with SVG controls', page.get_by_role('button', name='Pause voice message').count() == 1 and page.locator('.gx-audio-toggle svg').count() == 1)
        page.get_by_role('button', name='Pause voice message').click()
        page.wait_for_function("document.querySelector('.gx-audio-player').paused")
        page.locator('.gx-audio-seek').first.evaluate("n=>{n.value='700';n.dispatchEvent(new Event('input',{bubbles:true}))}")
        moved = audio.evaluate('(a)=>({current:a.currentTime,duration:a.duration})')
        check(f'{theme} paused voice message seeks to the selected media position', abs(moved['current'] / moved['duration'] - .7) < .08)
        page.evaluate("window.__messagesAudioEnded=false;document.querySelector('.gx-audio-player').addEventListener('ended',()=>window.__messagesAudioEnded=true,{once:true})")
        page.get_by_role('button', name='Play voice message').click()
        page.wait_for_function('window.__messagesAudioEnded===true', timeout=6000)
        page.wait_for_function("()=>document.querySelector('.gx-audio-player').paused&&document.querySelector('.gx-audio-player').currentTime===0")
        check(f'{theme} voice playback reaches ended, resets time and restores Play SVG', page.get_by_role('button', name='Play voice message').count() == 1 and page.locator('.gx-audio-toggle svg').count() == 1)
        screenshot(page, f'audio-ended-{theme}')
        page.locator('.gx-audio-player').first.evaluate('(a)=>window.__messagesAudioForHide=a')
        page.get_by_role('button', name='Play voice message').click()
        page.wait_for_function("()=>{const a=window.__messagesAudioForHide;return a&&!a.paused&&a.currentTime>.1}")
        page.evaluate("PeakDuo.home('left')")
        page.wait_for_function("()=>window.__messagesAudioForHide.paused&&window.__messagesAudioForHide.currentTime===0")
        check(f'{theme} hiding Messages pauses and rewinds active media', page.evaluate('window.__messagesAudioForHide.paused&&window.__messagesAudioForHide.currentTime===0'))

        page.evaluate("PeakDuo.openApp('messages','left')")
        page.locator('.duo-app-instance[data-app="messages"] .gx-thread-header').wait_for(state='visible')
        page.get_by_role('button', name='Back to conversations').click()
        inbox.wait_for(state='visible')
        page.get_by_role('button', name='Open Studio Crew').click()
        page.get_by_text('I’ll bring the camera and lights.', exact=True).wait_for(state='visible')
        check(f'{theme} group thread renders sender identity, bubbles and reactions', page.locator('.gx-message-sender').count() >= 1 and page.locator('.gx-reaction-row .gx-reaction-chip').count() >= 1)
        screenshot(page, f'group-thread-{theme}')
        contrast = message_contrast(page)
        check(f'{theme} enabled composer icon and message ink meet contrast thresholds', contrast['incoming'] >= 4.5 and contrast['outgoing'] >= 4.5 and contrast['add'] >= 3)
        page.get_by_role('button', name='Back to conversations').click()
        inbox.wait_for(state='visible')

    page.get_by_role('button', name='Open Jordan Lee').click()
    page.locator('.duo-app-instance[data-app="messages"] .gx-thread-header').wait_for(state='visible')
    page.wait_for_function("()=>document.querySelector('.duo-toast')?.hidden===true")

    page.evaluate('''()=>{
      const media=navigator.mediaDevices,original=media.getUserMedia.bind(media);
      Object.defineProperty(media,'getUserMedia',{configurable:true,value:()=>Promise.reject(new DOMException('Permission denied','NotAllowedError'))});
      window.__restoreMessagesMedia=()=>Object.defineProperty(media,'getUserMedia',{configurable:true,value:original});
    }''')
    page.get_by_role('button', name='Record voice message').click()
    denied_text='Allow microphone access to record a voice message.'
    page.get_by_text(denied_text, exact=True).wait_for(state='visible')
    check('Denied microphone permission explains how to enable voice recording', page.locator('.duo-toast').inner_text() == denied_text and page.locator('.gx-recording-label').count() == 0)
    page.evaluate('window.__restoreMessagesMedia()')
    page.wait_for_function("()=>document.querySelector('.duo-toast')?.hidden===true")

    page.evaluate('''()=>{
      const media=navigator.mediaDevices,original=media.getUserMedia.bind(media),Native=window.MediaRecorder;
      Object.defineProperty(media,'getUserMedia',{configurable:true,value:async(...args)=>{const stream=await original(...args);window.__messagesFailedStream=stream;return stream;}});
      window.__messagesNativeRecorder=Native;
      window.MediaRecorder=class{static isTypeSupported(){return true}constructor(){throw new Error('synthetic constructor failure')}};
      window.__restoreMessagesConstructor=()=>{window.MediaRecorder=Native;Object.defineProperty(media,'getUserMedia',{configurable:true,value:original});};
    }''')
    page.get_by_role('button', name='Record voice message').click()
    constructor_text='The microphone could not start. Check its connection and try again.'
    page.get_by_text(constructor_text, exact=True).wait_for(state='visible')
    tracks_stopped=page.evaluate('window.__messagesFailedStream.getTracks().every(track=>track.readyState==="ended")')
    check('MediaRecorder construction failure reports the problem and stops acquired tracks', tracks_stopped and page.locator('.gx-recording-label').count() == 0)
    page.evaluate('window.__restoreMessagesConstructor()')
    page.wait_for_function("()=>document.querySelector('.duo-toast')?.hidden===true")

    page.evaluate('''()=>{
      const media=navigator.mediaDevices,original=media.getUserMedia.bind(media),Native=window.MediaRecorder;
      Object.defineProperty(media,'getUserMedia',{configurable:true,value:async(...args)=>{const stream=await original(...args);window.__messagesFailedStream=stream;return stream;}});
      window.MediaRecorder=class extends Native{start(){throw new Error('synthetic start failure')}};
      window.__restoreMessagesStart=()=>{window.MediaRecorder=Native;Object.defineProperty(media,'getUserMedia',{configurable:true,value:original});};
    }''')
    page.get_by_role('button', name='Record voice message').click()
    page.get_by_text(constructor_text, exact=True).wait_for(state='visible')
    tracks_stopped=page.evaluate('window.__messagesFailedStream.getTracks().every(track=>track.readyState==="ended")')
    check('MediaRecorder start failure reports the problem and stops acquired tracks', tracks_stopped and page.locator('.gx-recording-label').count() == 0)
    page.evaluate('window.__restoreMessagesStart()')
    page.wait_for_function("()=>document.querySelector('.duo-toast')?.hidden===true")

    page.evaluate('''()=>{
      const media=navigator.mediaDevices,original=media.getUserMedia.bind(media);
      Object.defineProperty(media,'getUserMedia',{configurable:true,value:async(...args)=>{const stream=await original(...args);window.__messagesManualStream=stream;return stream;}});
    }''')
    page.get_by_role('button', name='Record voice message').click()
    page.wait_for_function("document.querySelector('.gx-recording-label')?.textContent.startsWith('Recording')")
    page.wait_for_timeout(400)
    page.get_by_role('button', name='Cancel recording').click()
    page.wait_for_function("!document.querySelector('.gx-recording-label')")
    check('Manual recording cancellation stops the fake track without an error notice', page.evaluate('window.__messagesManualStream.getTracks().every(track=>track.readyState==="ended")') and page.locator('.duo-toast').is_hidden())

    page.evaluate('''()=>{
      const media=navigator.mediaDevices,original=media.getUserMedia.bind(media);
      Object.defineProperty(media,'getUserMedia',{configurable:true,value:async(...args)=>{const stream=await original(...args);window.__messagesRecordedStream=stream;return stream;}});
    }''')
    page.get_by_role('button', name='Record voice message').click()
    page.wait_for_function("document.querySelector('.gx-recording-label')?.textContent.startsWith('Recording')")
    page.wait_for_timeout(1700)
    page.get_by_role('button', name='Finish recording').click()
    page.wait_for_function("()=>document.querySelector('.gx-voice-review')||(()=>{const t=document.querySelector('.duo-toast');return !!t&&!t.hidden})()")
    if page.locator('.gx-voice-review').count() == 0:
        debug=page.evaluate('''()=>({toast:document.querySelector('.duo-toast')?.textContent,recording:document.querySelector('.gx-recording-label')?.textContent,tracks:window.__messagesRecordedStream?.getTracks().map(track=>track.readyState),errors:PeakDuo.getState().errors})''')
        debug['pageErrors']=page_errors
        check('Native Chromium capture reaches the review step', False, debug)
    page.get_by_text('Voice message ready', exact=True).wait_for(state='visible')
    page.wait_for_function('''()=>{const a=document.querySelector('.gx-voice-review .gx-audio-player');return a&&a.readyState>=1&&(Number.isFinite(a.duration)||a.duration===Infinity)}''')
    review_audio=page.locator('.gx-voice-review .gx-audio-player')
    review_details=review_audio.evaluate('''a=>{const uri=a.currentSrc,controls=a.closest('.gx-audio-message'),times=[...controls.querySelectorAll('.gx-audio-time')];return {uri,readyState:a.readyState,duration:a.duration,durationText:times[1]?.textContent||'',seekDisabled:controls.querySelector('.gx-audio-seek')?.disabled,header:uri.startsWith('data:audio/webm;base64,GkXfo')};}''')
    before_send=page.evaluate("PeakDuo.requests.filter(r=>r.event==='Messages/SendMessage'&&r.data.Message?.startsWith('data:audio/webm;base64,' )).length")
    review_duration_known=isinstance(review_details['duration'],(int,float)) and review_details['duration']>0 and review_details['duration']!=float('inf')
    expected_review_duration=f"{int(review_details['duration']//60)}:{int(review_details['duration']%60):02d}" if review_duration_known else '--:--'
    check('Native Chromium recording produces playable reviewed WebM without sending it early', review_details['header'] and review_details['durationText']==expected_review_duration and review_details['seekDisabled']==(not review_duration_known) and before_send == 0 and page.evaluate('window.__messagesRecordedStream.getTracks().every(track=>track.readyState==="ended")'), review_details)
    screenshot(page, 'native-voice-review')
    page.get_by_role('button', name='Send voice message').click()
    page.wait_for_function("!document.querySelector('.gx-voice-review')")
    sent_audio=page.evaluate('''()=>{const r=PeakDuo.requests.filter(x=>x.event==='Messages/SendMessage'&&x.data.Message?.startsWith('data:audio/webm;base64,')).at(-1);if(!r)return null;const raw=atob(r.data.Message.split(',')[1]);return {uri:r.data.Message,header:raw.charCodeAt(0)===0x1a&&raw.charCodeAt(1)===0x45&&raw.charCodeAt(2)===0xdf&&raw.charCodeAt(3)===0xa3,operationId:!!r.data.OperationId};}''')
    check('Explicit send posts the validated WebM with its operation reference', bool(sent_audio and sent_audio['header'] and sent_audio['operationId']))
    receiver_id=page.evaluate('''uri=>PeakDuo.previewAdapter.messagesFixture.deliverIncomingAudio(uri)''', sent_audio['uri'])
    page.evaluate("window.dispatchEvent(new MessageEvent('message',{data:{Action:'Messages/Refresh'}}))")
    receiver=page.locator(f'.gx-message[data-message-id="{receiver_id}"] .gx-audio-player')
    receiver.wait_for(state='attached')
    page.wait_for_function('''id=>{const a=document.querySelector(`.gx-message[data-message-id="${id}"] .gx-audio-player`);return a&&a.readyState>=1&&(Number.isFinite(a.duration)||a.duration===Infinity)}''', arg=receiver_id)
    receiver_wrap=page.locator(f'.gx-message[data-message-id="{receiver_id}"] .gx-audio-message')
    receiver_state=receiver_wrap.evaluate('''n=>{const a=n.querySelector('audio'),times=[...n.querySelectorAll('.gx-audio-time')],seek=n.querySelector('.gx-audio-seek'),d=a.duration,known=Number.isFinite(d)&&d>0,format=s=>{const whole=Math.floor(s);return Math.floor(whole/60)+':'+String(whole%60).padStart(2,'0')};return {duration:d,durationText:times[1]?.textContent,seekDisabled:seek.disabled,expected:known?format(d):'--:--'};}''')
    check('Native WebM receiver controls show duration or a clear unknown state without Infinity or NaN', receiver_state['durationText']==receiver_state['expected'] and receiver_state['seekDisabled']==(receiver_state['expected']=='--:--') and not re.search(r'Infinity|NaN',receiver_state['durationText']), receiver_state)
    screenshot(page, 'native-voice-received')
    receiver_play=page.locator(f'.gx-message[data-message-id="{receiver_id}"] .gx-audio-player')
    receiver_play.evaluate('(a)=>{window.__messagesReceiverEnded=false;a.addEventListener("ended",()=>window.__messagesReceiverEnded=true,{once:true})}')
    page.locator(f'.gx-message[data-message-id="{receiver_id}"]').get_by_role('button', name='Play voice message').click()
    page.wait_for_function('''id=>{const a=document.querySelector(`.gx-message[data-message-id="${id}"] .gx-audio-player`);return a&&!a.paused&&a.currentTime>.15}''', arg=receiver_id)
    page.wait_for_function('''id=>{const n=document.querySelector(`.gx-message[data-message-id="${id}"] .gx-audio-message`),a=n?.querySelector('audio'),times=[...n.querySelectorAll('.gx-audio-time')];return a&&times[0]?.textContent!=='0:00'&&times[0]?.textContent!=='NaN:NaN'&&times[1]?.textContent!=='Infinity'}''', arg=receiver_id)
    active_controls=receiver_wrap.evaluate('''n=>{const a=n.querySelector('audio'),times=[...n.querySelectorAll('.gx-audio-time')],d=a.duration,known=Number.isFinite(d)&&d>0,format=s=>{const whole=Math.floor(s);return Math.floor(whole/60)+':'+String(whole%60).padStart(2,'0')};return {time:a.currentTime,elapsed:times[0]?.textContent,duration:d,durationText:times[1]?.textContent,seekDisabled:n.querySelector('.gx-audio-seek').disabled,durationMatches:known?times[1]?.textContent===format(d):times[1]?.textContent==='--:--'};}''')
    check('Actual receiver playback advances its clock and keeps duration/seek controls valid', active_controls['time']>.15 and active_controls['elapsed'] not in ('NaN:NaN','Infinity:NaN') and active_controls['durationMatches'] and active_controls['seekDisabled']==(active_controls['durationText']=='--:--'), active_controls)
    page.wait_for_function('window.__messagesReceiverEnded===true', timeout=10000)
    ended_controls=receiver_wrap.evaluate('''n=>{const a=n.querySelector('audio'),times=[...n.querySelectorAll('.gx-audio-time')],d=a.duration;return {paused:a.paused,time:a.currentTime,elapsed:times[0]?.textContent,durationText:times[1]?.textContent,mediaDuration:Number.isFinite(d)&&d>0?d:String(d),seekDisabled:n.querySelector('.gx-audio-seek').disabled,playLabel:n.querySelector('.gx-audio-toggle')?.getAttribute('aria-label')};}''')
    ended_duration_known=isinstance(ended_controls['mediaDuration'],(int,float)) and ended_controls['mediaDuration']>0
    ended_expected=f"{int(ended_controls['mediaDuration']//60)}:{int(ended_controls['mediaDuration']%60):02d}" if ended_duration_known else '--:--'
    check('Native receiver WebM reaches ended and leaves stable replay controls', ended_controls['paused'] and ended_controls['time']==0 and ended_controls['elapsed']=='0:00' and ended_controls['durationText']==ended_expected and ended_controls['seekDisabled']==(not ended_duration_known) and ended_controls['playLabel']=='Play voice message', ended_controls)
    microphone_report={'nativeMediaRecorder':True,'fakeDevice':True,'captureGranted':True,'receiverPlayback':True,'sentDataUriLength':len(sent_audio['uri']),'receiverDuration':receiver_state['durationText'],'durationUnknownFallback':receiver_state['durationText']=='--:--','durationAfterFullPlayback':ended_controls['durationText'],'seekAvailableAfterFullPlayback':not ended_controls['seekDisabled']}
    page.get_by_role('button', name='Back to conversations').click()
    inbox.wait_for(state='visible')

    page.get_by_role('button', name='Open Maya Chen').click()
    page.get_by_role('button', name='Add to message').click()
    page.get_by_role('button', name='iFruit Cash', exact=True).click()
    cash = page.get_by_role('dialog', name='iFruit Cash')
    enter_cash_amount(cash, 42)
    cash.get_by_role('button', name='Send', exact=True).click()
    cash.get_by_role('button', name='Add a note', exact=True).click()
    cash.get_by_label('Optional payment note').fill('Studio supplies')
    check('Cash transfer review names the recipient, amount and note without submitting', 'Maya Chen' in cash.inner_text() and '$42' in cash.inner_text() and cash.get_by_label('Optional payment note').input_value() == 'Studio supplies' and 'This sends an in-game bank transfer' in cash.inner_text())
    for theme in ('light', 'dark'):
        page.evaluate('(theme)=>PeakDuo.setPhoneSetting("appearance",theme)', theme)
        page.wait_for_function('(theme)=>document.querySelector("#duo").dataset.theme===theme', arg=theme)
        layout = cash_review_layout(page)
        check(f'{theme} cash transfer keeps its amount visible and its separate footer within the sheet', layout['amountVisible'] and layout['footerSeparate'] and layout['footerInsideSheet'] and layout['noOverflow'] and layout['bodyOverflowY'] in ('auto', 'scroll'), layout)
        if theme == 'dark':
            check('Dark iFruit Cash sheet lifts off the black conversation surface', layout['sheetBackground'] != layout['appBackground'], layout)
        screenshot(page, f'cash-transfer-review-{theme}')
    page.evaluate('(theme)=>PeakDuo.setPhoneSetting("appearance",theme)', 'light')
    page.wait_for_function('document.querySelector("#duo").dataset.theme==="light"')
    cash.get_by_role('button', name='Confirm', exact=True).click()
    page.get_by_text('Money sent', exact=True).wait_for(state='visible')
    check('Confirmed synthetic transfer posts a matching cash-transfer receipt', page.locator('.gx-cash-card').filter(has_text='Money sent').inner_text().find('$42') >= 0)
    receipt_ink = page.locator('.gx-cash-card').filter(has_text='Money sent').locator('.gx-cash-amount').evaluate('(n)=>getComputedStyle(n).color')
    check('Light cash receipt uses dark readable ink on its pale card', receipt_ink == 'rgb(23, 59, 37)', receipt_ink)
    page.wait_for_function("()=>document.querySelector('.duo-toast')?.hidden===true")
    check('Transfer confirmation toast clears before receipt evidence', page.locator('.duo-toast').is_hidden())
    screenshot(page, 'cash-transfer-receipt')

    page.get_by_role('button', name='Add to message').click()
    page.get_by_role('button', name='iFruit Cash', exact=True).click()
    cash = page.get_by_role('dialog', name='iFruit Cash')
    enter_cash_amount(cash, 19)
    cash.get_by_role('button', name='Request', exact=True).click()
    cash.get_by_role('button', name='Confirm Request', exact=True).wait_for(state='visible')
    check('Cash request review names the requester and amount without submitting', 'Maya Chen' in cash.inner_text() and '$19' in cash.inner_text() and 'creates a payment request' in cash.inner_text())
    cash.get_by_role('button', name='Confirm Request', exact=True).click()
    page.get_by_text('Request sent', exact=True).wait_for(state='visible')
    check('Synthetic request posts its receipt into the original conversation', page.locator('.gx-cash-card').count() >= 2 and page.locator('.gx-cash-card').last.inner_text().find('$19') >= 0)
    page.locator('.gx-cash-incoming').filter(has_text='$42').get_by_role('button', name='Pay').click()
    page.get_by_text('Money sent', exact=True).nth(1).wait_for(state='visible')
    check('Paying a synthetic request updates its status and adds a transfer receipt', 'paid' in page.locator('.gx-cash-incoming').filter(has_text='$42').inner_text().lower() and page.locator('.gx-cash-card').filter(has_text='Money sent').count() == 2)
    page.locator('.gx-cash-incoming').filter(has_text='$8').get_by_role('button', name='Decline').click()
    page.wait_for_function("()=>[...document.querySelectorAll('.gx-cash-incoming')].some(n=>n.innerText.includes('$8')&&n.innerText.toLowerCase().includes('declined'))")
    check('Declining another synthetic request marks it declined and removes actions', page.locator('.gx-cash-incoming').filter(has_text='$8').get_by_role('button', name='Pay').count() == 0)
    request_report = page.evaluate('''()=>{const p=PeakDuo.previewAdapter;return {created:p.requests.filter(x=>x.event==='Wenmo/CreateRequest'),paid:p.requests.filter(x=>x.event==='Wenmo/PayRequest'),declined:p.requests.filter(x=>x.event==='Wenmo/DeclineRequest'),sent:p.requests.filter(x=>x.event==='Wenmo/SendMoney'),requestReceipts:p.requests.filter(x=>x.event==='Messages/SendMessage'&&x.data.Attachments?.some(a=>a.type==='cash-request')),transferReceipts:p.requests.filter(x=>x.event==='Messages/SendMessage'&&x.data.Attachments?.some(a=>a.type==='cash-transfer')),balance:p.previewPlayer.Bank};}''')
    check('Cash request, payment and decline remain synthetic and leave demo bank unchanged', len(request_report['created']) == 1 and len(request_report['paid']) == 1 and len(request_report['declined']) == 1 and len(request_report['sent']) == 1 and len(request_report['requestReceipts']) == 1 and len(request_report['transferReceipts']) == 2 and request_report['balance'] == 8450)
    page.wait_for_function("()=>document.querySelector('.duo-toast')?.hidden===true")
    check('Payment toast clears before cash request evidence', page.locator('.duo-toast').is_hidden())
    screenshot(page, 'cash-request-receipt')

    page.evaluate("PeakDuo.setLayout('split');PeakDuo.setSplitRatio(.4);PeakDuo.openApp('settings','left');PeakDuo.openApp('messages','right')")
    right_messages = page.locator('.duo-pane[data-side="right"] .duo-app-instance[data-app="messages"]')
    right_messages.wait_for(state='visible')
    right_messages.locator('.gx-thread-header').wait_for(state='visible')
    page.wait_for_function("!document.querySelector('#duo').classList.contains('duo-folding')&&!document.querySelector('#duo').classList.contains('duo-orientation-turning')")
    check('Full split view keeps Settings and the live Messages thread in independent panes', page.locator('.duo-pane[data-side="left"] .duo-app-instance[data-app="settings"]').count() == 1 and page.locator('.duo-pane[data-side="right"] .duo-app-instance[data-app="messages"]').count() == 1 and right_messages.locator('.gx-thread-header').is_visible())
    for ratio in (.4, .6):
        page.evaluate('(ratio)=>PeakDuo.setSplitRatio(ratio)', ratio)
        overflow = horizontal_overflow(page)
        check(f'Messages has no horizontal content overflow at split ratio {ratio}', not overflow)
    screenshot(page, 'split-messages-settings')

    check('No local preview asset returned HTTP 404 or another error', not http_errors)
    check('No unhandled page errors', not page_errors)
    browser_version = browser.version
    report = {
        'checks': checks,
        'count': len(checks),
        'pageErrors': page_errors,
        'httpErrors': http_errors,
        'browser': browser_version,
        'transport': 'loopback synthetic browser preview',
        'liveFiveM': False,
        'liveMySQL': False,
        'microphoneCapture': True,
        'physicalMicrophoneCapture': False,
        'syntheticMicrophoneCapture': True,
        'realBankTransactions': False,
        'sampleAudio': 'FFmpeg-generated Opus/WebM playback fixture and native Chromium MediaRecorder output from its fake audio device',
        'microphoneRecording': microphone_report,
        'syntheticRequest': request_report,
    }
    (OUT / 'browser-results.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    browser.close()
print(f'PASS: {len(checks)} browser assertions; evidence in {OUT}')
