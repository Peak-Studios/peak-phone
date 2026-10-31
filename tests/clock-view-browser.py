"""Verify a retained Clock view refreshes its World Clock when it returns from Home."""
import json
import io
import os
import re
from collections import Counter
from PIL import Image
from playwright.sync_api import sync_playwright
from browser_harness import mount_offline

checks = []
errors = []

def check(label, passed):
    if not passed:
        raise AssertionError(label)
    checks.append(label)


def css_rgb(hex_color):
    values = tuple(int(hex_color[index:index + 2], 16) for index in (1, 3, 5))
    return f'rgb({values[0]}, {values[1]}, {values[2]})'


def contrast_ratio(foreground, background):
    def luminance(color):
        channels = [int(value) / 255 for value in re.findall(r'\d+', color)[:3]]
        linear = [value / 12.92 if value <= .04045 else ((value + .055) / 1.055) ** 2.4 for value in channels]
        return .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2]
    first, second = luminance(foreground), luminance(background)
    light, dark = max(first, second), min(first, second)
    return (light + .05) / (dark + .05)


def check_computed_text_contrast(locator, label, state, surface=None):
    measured = locator.evaluate('''node=>{
      const parse=value=>{const parts=value.match(/[\\d.]+/g)?.map(Number)||[0,0,0,0];return [...parts.slice(0,3),parts[3]??1];};
      const over=(top,bottom)=>top.slice(0,3).map((value,index)=>value*top[3]+bottom[index]*(1-top[3]));
      const luminance=color=>color.map(value=>value/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4).reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0);
      const layers=[];let opacity=1;
      for(let parent=node;parent;parent=parent.parentElement){
        const style=getComputedStyle(parent);opacity*=Number(style.opacity);
        if(style.backgroundImage!=='none')return {ratio:0,opacity,backgroundImage:style.backgroundImage};
        const color=parse(style.backgroundColor);layers.push(color);if(color[3]>=.999)break;
      }
      let background=[255,255,255];for(const color of layers.reverse())background=over(color,background);
      const foreground=over(parse(getComputedStyle(node).color),background),values=[luminance(foreground),luminance(background)].sort((a,b)=>a-b);
      return {ratio:(values[1]+.05)/(values[0]+.05),opacity,foreground,background,backgroundImage:'none'};
    }''')
    check(f'{label} {state} computed text contrast remains at least 4.5:1', measured['ratio'] >= 4.5 and measured['opacity'] >= .99 and measured['backgroundImage'] == 'none')
    pixels = Image.open(io.BytesIO((surface or locator).screenshot())).convert('RGB')
    dominant = Counter(pixels.getdata()).most_common(1)[0][0]
    expected_background = tuple(round(channel) for channel in measured['background'])
    check(f'{label} {state} screenshot background {dominant} matches computed surface {expected_background}', max(abs(a - b) for a, b in zip(dominant, expected_background)) <= 6)
    expected_foreground = tuple(round(channel) for channel in measured['foreground'])
    visible_ink = sum(1 for pixel in pixels.getdata() if max(abs(a - b) for a, b in zip(pixel, expected_foreground)) <= 42)
    check(f'{label} {state} screenshot contains rendered high-contrast text pixels', visible_ink > 0)
    return measured


def pixel_rgb(locator):
    pixels = Image.open(io.BytesIO(locator.screenshot())).convert('RGB')
    return Counter(pixels.getdata()).most_common(1)[0][0]


def check_round_background(page, locator, selector, theme, label, state, hex_color, sample_pixel=False):
    expected = css_rgb(hex_color)
    page.wait_for_function('''([selector, expected])=>{
      const button=document.querySelector(selector);
      return !!button&&getComputedStyle(button).backgroundColor===expected;
    }''', arg=[selector, expected])
    actual = locator.evaluate('(node)=>getComputedStyle(node).backgroundColor')
    check(f'{theme} {label} {state} background is {hex_color}', actual == expected)
    foreground = locator.evaluate('(node)=>getComputedStyle(node.querySelector("span")||node).color')
    ratio = contrast_ratio(foreground, actual)
    check(f'{theme} {label} {state} label contrast is at least 4.5:1', ratio >= 4.5)
    if sample_pixel:
        expected_pixel = tuple(int(hex_color[index:index + 2], 16) for index in (1, 3, 5))
        check(f'{theme} {label} {state} screenshot pixels match {hex_color}', pixel_rgb(locator) == expected_pixel)


def check_hover_and_leave(page, button, selector, theme, label, rest, hover):
    page.mouse.move(5, 5)
    check_round_background(page, button, selector, theme, label, 'resting', rest, sample_pixel=True)
    button.hover()
    check_round_background(page, button, selector, theme, label, 'hover', hover, sample_pixel=True)
    page.mouse.move(5, 5)
    check_round_background(page, button, selector, theme, label, 'after pointer leaves', rest, sample_pixel=True)


def verify_alarm_primary_contrast(page, duo, alarm_sheet):
    original_theme = duo.get_attribute('data-theme')
    add = alarm_sheet.get_by_role('button', name='Add', exact=True)
    label = add.locator('span').first
    cancel = alarm_sheet.get_by_role('button', name='Cancel', exact=True)
    for theme in ['light', 'dark']:
        duo.evaluate('(node, theme) => { node.dataset.theme = theme; }', theme)
        page.mouse.move(5, 5)
        page.wait_for_function('''()=>{
          const sheet=document.querySelector('.u27-clock-alarm-editor');
          const button=sheet?.querySelector('.cf-nav-trailing');
          return !!sheet&&Number(getComputedStyle(sheet).opacity)>=.99
            &&Number(getComputedStyle(button).opacity)>=.99
            &&getComputedStyle(button).backgroundColor==='rgba(0, 0, 0, 0)';
        }''')
        check(f'{theme} Alarm Add remains enabled', add.is_enabled())
        check_computed_text_contrast(label, f'{theme} Alarm Add', 'resting', surface=add)

        add.hover()
        page.wait_for_function("()=>getComputedStyle(document.querySelector('.u27-clock-alarm-editor .cf-nav-trailing')).backgroundColor==='rgb(56, 56, 58)'")
        check_computed_text_contrast(label, f'{theme} Alarm Add', 'hover', surface=add)
        page.mouse.move(5, 5)

        box = add.bounding_box()
        page.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
        page.mouse.down()
        page.wait_for_function("()=>{const node=document.querySelector('.u27-clock-alarm-editor .cf-nav-trailing');return !!node&&node.matches(':active')&&getComputedStyle(node).backgroundColor==='rgb(68, 68, 71)'}")
        check_computed_text_contrast(label, f'{theme} Alarm Add', 'pressed', surface=add)
        page.mouse.move(5, 5)
        page.mouse.up()

        cancel.focus()
        page.keyboard.press('Tab')
        page.wait_for_function("()=>{const node=document.querySelector('.u27-clock-alarm-editor .cf-nav-trailing');return !!node&&document.activeElement===node&&node.matches(':focus-visible')&&getComputedStyle(node).backgroundColor==='rgba(0, 0, 0, 0)'}")
        focus_ring = add.evaluate('(node)=>getComputedStyle(node).outlineColor')
        check(f'{theme} Alarm Add keeps its orange keyboard focus ring', focus_ring == 'rgb(255, 157, 61)')
        check_computed_text_contrast(label, f'{theme} Alarm Add', 'keyboard focus', surface=add)

    duo.evaluate('''(node, theme)=>{if(theme===null)delete node.dataset.theme;else node.dataset.theme=theme;}''', original_theme)


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(
        executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'),
        headless=True,
        args=['--no-sandbox'],
    )
    context = browser.new_context(viewport={'width': 1600, 'height': 1000}, timezone_id='America/Los_Angeles')
    page = context.new_page()
    page.set_default_timeout(5000)
    page.on('pageerror', lambda error: errors.append(str(error)))
    mount_offline(page, nui=True)
    page.wait_for_function('window.PeakDuo?.getState')
    page.evaluate("window.PeakDuo.openApp('clock', 'left')")
    clock = page.locator('.duo-app-instance[data-app=clock]:not([data-switcher-preview])')
    page.wait_for_function("()=>{const node=document.querySelector('.duo-app-instance[data-app=clock]');return !!node&&!node.hidden&&!!node.querySelector('.u27-world-time')}")
    page.evaluate('''()=>{
      window.__clockStorageWrites=0;
      window.__clockNativeSetItem=localStorage.setItem;
      localStorage.setItem=function(name,value){if(String(name).startsWith('peak-duo:clock:v1:'))window.__clockStorageWrites++;return window.__clockNativeSetItem.call(this,name,value);};
    }''')
    old_time = clock.locator('.u27-world-time').first.inner_text()
    page.evaluate("window.__clockRetainedNode=document.querySelector('.duo-app-instance[data-app=clock]')")
    check('Clock opens with a World Clock value', bool(old_time))
    check('the original GTA clock identities remain in the default set', all(clock.locator(f'.u27-world-row[data-city="{city}"]').count() == 1 for city in ['los-santos', 'liberty-city', 'vice-city']))

    def add_city(name, city_id):
        page.get_by_role('button', name='Add city', exact=True).click()
        city_sheet = clock.locator('.u27-clock-city-editor')
        city_sheet.get_by_role('searchbox', name='Search cities').fill(name)
        city_sheet.get_by_label('City', exact=True).select_option(city_id)
        city_sheet.get_by_role('button', name='Add', exact=True).click()
        page.wait_for_function('(id)=>!!document.querySelector(`.u27-world-row[data-city="${id}"]`)', arg=city_id)

    def prepare_digit_watch():
        page.evaluate('''()=>{
          window.__clockDigitsObserver?.disconnect();window.__clockDigitMutations=0;
          const digits=document.querySelector('.duo-app-instance[data-app="clock"] .u27-stopwatch-digits');
          if(!digits)throw Error('Stopwatch digits are not mounted');
          window.__clockDigitsObserver=new MutationObserver(records=>window.__clockDigitMutations+=records.length);
          window.__clockDigitsObserver.observe(digits,{childList:true,characterData:true,subtree:true});
        }''')

    def verify_overlay_reactivation(label, open_overlay, close_overlay):
        page.get_by_role('button', name='Stopwatch', exact=True).click()
        start = clock.get_by_role('button', name='Start', exact=True)
        if start.count(): start.click()
        page.wait_for_timeout(250)
        prepare_digit_watch()
        open_overlay()
        page.wait_for_function("()=>!!document.querySelector('.duo-app-instance[data-app=clock]:not([data-switcher-preview])')?.closest('.duo-pane[inert]')")
        page.wait_for_timeout(120)
        hidden_text = clock.locator('.u27-stopwatch-digits').inner_text()
        hidden_mutations = page.evaluate('window.__clockDigitMutations')
        hidden_writes = page.evaluate('window.__clockStorageWrites')
        page.wait_for_timeout(650)
        check(f'{label} stops stopwatch view refreshes and storage writes while covered',
              clock.locator('.u27-stopwatch-digits').inner_text() == hidden_text
              and page.evaluate('window.__clockDigitMutations') == hidden_mutations
              and page.evaluate('window.__clockStorageWrites') == hidden_writes)
        close_overlay()
        page.wait_for_function('''([text])=>{
          const digits=document.querySelector('.duo-app-instance[data-app="clock"] .u27-stopwatch-digits');
          return !!digits&&digits.textContent!==text;
        }''', arg=[hidden_text], timeout=1500)
        check(f'{label} immediately resumes the retained Stopwatch view',
              clock.locator('.u27-stopwatch-digits').inner_text() != hidden_text)
        check(f'{label} reactivation does not add storage writes', page.evaluate('window.__clockStorageWrites') == hidden_writes)
        page.get_by_role('button', name='Stop', exact=True).click()

    add_city('London', 'real-london')
    add_city('New Delhi', 'real-new-delhi')
    check('searchable city picker adds selected official London and New Delhi locations', clock.locator('.u27-world-row[data-city="real-london"]').count() == 1 and clock.locator('.u27-world-row[data-city="real-new-delhi"]').count() == 1)
    page.evaluate('''()=>{
      const RealDate=Date;
      window.__clockRealDate=RealDate;
      window.__clockMockEpoch=RealDate.UTC(2026,2,15,12,0,0);
      window.Date=class MockDate extends RealDate{
        constructor(...args){super(...(args.length?args:[window.__clockMockEpoch]));}
        static now(){return window.__clockMockEpoch;}
      };
    }''')
    page.get_by_role('button', name='Alarms', exact=True).click()
    page.get_by_role('button', name='World Clock', exact=True).click()
    london_march = clock.locator('.u27-world-row[data-city="real-london"] .u27-world-date').inner_text()
    delhi_offset = clock.locator('.u27-world-row[data-city="real-new-delhi"] .u27-world-date').inner_text()
    check('London shows the DST gap versus Los Angeles in mid-March', '+7HRS' in london_march)
    check('New Delhi renders its half-hour offset against the device zone', '+12:30' in delhi_offset)
    page.evaluate('window.__clockMockEpoch=window.__clockRealDate.UTC(2026,2,31,12,0,0)')
    page.get_by_role('button', name='Alarms', exact=True).click()
    page.get_by_role('button', name='World Clock', exact=True).click()
    london_april = clock.locator('.u27-world-row[data-city="real-london"] .u27-world-date').inner_text()
    check('London offset advances after UK daylight saving begins', '+8HRS' in london_april)
    page.evaluate('window.Date=window.__clockRealDate;delete window.__clockRealDate;delete window.__clockMockEpoch')
    page.get_by_role('button', name='Alarms', exact=True).click()
    page.get_by_role('button', name='World Clock', exact=True).click()

    page.evaluate("window.PeakDuo.home('left')")
    page.wait_for_function("document.querySelector('.duo-app-instance[data-app=clock]').hidden")
    check('Home hides the existing Clock instance', page.evaluate("window.__clockRetainedNode.isConnected&&window.__clockRetainedNode.hidden"))

    page.evaluate('''()=>{
      const RealDate=Date;let offset=5*60*1000;
      window.__clockRealDate=RealDate;
      window.Date=class ShiftedDate extends RealDate{
        constructor(...args){super(...(args.length?args:[RealDate.now()+offset]));}
        static now(){return RealDate.now()+offset;}
      };
    }''')
    page.evaluate("window.PeakDuo.openApp('clock', 'left')")
    page.wait_for_function("([old])=>{const node=document.querySelector('.duo-app-instance[data-app=clock]');return !!node&&!node.hidden&&node.querySelector('.u27-world-time')?.textContent!==old}", arg=[old_time])
    refreshed_time = clock.locator('.u27-world-time').first.inner_text()
    retained = page.evaluate("window.__clockRetainedNode===document.querySelector('.duo-app-instance[data-app=clock]')")
    check('the same World Clock instance refreshes immediately after Home', retained and refreshed_time != old_time)
    check('selected non-US cities survive Home and app reopen', clock.locator('.u27-world-row[data-city="real-london"]').count() == 1 and clock.locator('.u27-world-row[data-city="real-new-delhi"]').count() == 1)
    page.evaluate('window.Date=window.__clockRealDate;delete window.__clockRealDate;delete window.__clockRetainedNode')

    page.emulate_media(reduced_motion='reduce')
    motion = clock.locator('.u27-world-row').first.evaluate('''node=>{
      const style=getComputedStyle(node);return {transition:style.transitionDuration,animation:style.animationDuration,backdrop:style.backdropFilter};
    }''')
    check('reduced-motion disables Clock transitions, animations, and backdrop filters', motion['transition'] == '0s' and motion['animation'] == '0s' and motion['backdrop'] == 'none')
    page.emulate_media(reduced_motion='no-preference')

    world_font = page.locator('.u27-world-clock').first.evaluate('(node)=>parseFloat(getComputedStyle(node).fontSize)')
    city_font = page.locator('.u27-world-city h2').first.evaluate('(node)=>parseFloat(getComputedStyle(node).fontSize)')
    check('World Clock follows the large lightweight reference hierarchy', world_font >= 42 and city_font >= 18)
    first_city = clock.locator('.u27-world-row').first.get_attribute('data-city')
    check('city removal controls stay hidden outside Edit mode', clock.locator('.u27-world-row [aria-label^="Remove "]').count() == 0)
    page.get_by_role('button', name='Edit', exact=True).click()
    remove_city = clock.get_by_role('button', name='Remove ' + clock.locator('.u27-world-row h2').first.inner_text(), exact=True)
    check('Edit mode exposes an accessible delete action', remove_city.count() == 1)
    remove_city.click()
    page.wait_for_function('(id)=>!document.querySelector(`.u27-world-row[data-city="${id}"]`)', arg=first_city)
    check('Edit mode deletion removes the selected saved city', True)
    page.get_by_role('button', name='Done', exact=True).click()
    check('Edit mode exits with city delete controls hidden', clock.locator('.u27-world-row [aria-label^="Remove "]').count() == 0)

    page.get_by_role('button', name='Stopwatch', exact=True).click()
    page.get_by_role('button', name='Start', exact=True).click()
    page.get_by_role('button', name='Lap', exact=True).click()
    stopwatch_font = clock.locator('.u27-stopwatch-digits').evaluate('(node)=>parseFloat(getComputedStyle(node).fontSize)')
    lap_font = clock.locator('.u27-lap').evaluate('(node)=>parseFloat(getComputedStyle(node).fontSize)') if clock.locator('.u27-lap').count() else 0
    action_size = clock.locator('.u27-stopwatch-actions button').first.evaluate('(node)=>node.getBoundingClientRect().width')
    check('Stopwatch digits, controls, and lap typography scale for the phone', stopwatch_font >= 50 and action_size >= 56 and lap_font >= 12)
    stop_button = clock.locator('.u27-round-stop')
    start_selector = '.duo-app-instance[data-app="clock"] .u27-clock .u27-round-start'
    stop_selector = '.duo-app-instance[data-app="clock"] .u27-clock .u27-round-stop'
    secondary_selector = '.duo-app-instance[data-app="clock"] .u27-clock .u27-round-secondary'
    duo = page.locator('#duo')
    original_theme = duo.get_attribute('data-theme')
    for theme in ['light', 'dark']:
        duo.evaluate('(node, theme) => { node.dataset.theme = theme; }', theme)
        stop_colors = stop_button.evaluate('''node=>({
          button:getComputedStyle(node).color,
          label:getComputedStyle(node.querySelector('span')).color,
          mark:getComputedStyle(node.querySelector('svg path')).stroke,
        })''')
        check(f'{theme} theme keeps the Stopwatch Stop label and SVG stroke red', all(color == 'rgb(255, 69, 58)' for color in stop_colors.values()))
        lap_button = clock.locator('.u27-round-secondary')
        check('Stop and Lap remain enabled while the watch is running', stop_button.is_enabled() and lap_button.is_enabled())
        check_hover_and_leave(page, stop_button, stop_selector, theme, 'Stop', '#330d0e', '#3a1213')
        check_hover_and_leave(page, lap_button, secondary_selector, theme, 'Lap', '#171719', '#29292c')
        lap_button.hover()
        page.mouse.down()
        page.wait_for_function('''([selector, expected])=>{
          const button=document.querySelector(selector);
          return !!button&&button.matches(':active')&&getComputedStyle(button).backgroundColor===expected;
        }''', arg=[secondary_selector, css_rgb('#38383a')])
        check_round_background(page, lap_button, secondary_selector, theme, 'Lap', 'pressed', '#38383a', sample_pixel=True)
        page.mouse.up()
        lap_button.focus()
        page.keyboard.press('Tab')
        page.wait_for_function('''(selector)=>{
          const button=document.querySelector(selector);
          return !!button&&document.activeElement===button&&button.matches(':focus-visible');
        }''', arg=stop_selector)
        stop_focus = stop_button.evaluate('''node=>({
          outlineColor:getComputedStyle(node).outlineColor,
          outlineStyle:getComputedStyle(node).outlineStyle,
          focused:document.activeElement===node&&node.matches(':focus-visible')
        })''')
        check(f'{theme} keyboard focus reaches enabled Stop from Lap', stop_focus['focused'] and stop_button.is_enabled())
        check(f'{theme} Stop focus keeps a visible orange ring', stop_focus['outlineColor'] == 'rgb(255, 157, 61)' and stop_focus['outlineStyle'] == 'solid')
        check_round_background(page, stop_button, stop_selector, theme, 'Stop', 'keyboard focus', '#330d0e', sample_pixel=True)

        stop_button.hover()
        page.mouse.down()
        page.wait_for_function('''([selector, expected])=>{
          const button=document.querySelector(selector);
          return !!button&&button.matches(':active')&&getComputedStyle(button).backgroundColor===expected;
        }''', arg=[stop_selector, css_rgb('#401719')])
        check_round_background(page, stop_button, stop_selector, theme, 'Stop', 'pressed', '#401719', sample_pixel=True)
        page.mouse.up()
        page.wait_for_function("()=>!!document.querySelector('.u27-round-start')")

        reset_button = clock.locator('.u27-round-secondary')
        start_button = clock.locator('.u27-round-start')
        check('Reset and Start remain enabled while the watch is stopped', reset_button.is_enabled() and start_button.is_enabled())
        check_hover_and_leave(page, reset_button, secondary_selector, theme, 'Reset', '#171719', '#29292c')
        reset_button.hover()
        page.mouse.down()
        page.wait_for_function('''([selector, expected])=>{
          const button=document.querySelector(selector);
          return !!button&&button.matches(':active')&&getComputedStyle(button).backgroundColor===expected;
        }''', arg=[secondary_selector, css_rgb('#38383a')])
        check_round_background(page, reset_button, secondary_selector, theme, 'Reset', 'pressed', '#38383a', sample_pixel=True)
        page.mouse.up()
        page.wait_for_function("()=>!!document.querySelector('.u27-round-start')")
        reset_button = clock.locator('.u27-round-secondary')
        start_button = clock.locator('.u27-round-start')
        check_hover_and_leave(page, start_button, start_selector, theme, 'Start', '#18764b', '#1d8152')
        reset_button.focus()
        page.keyboard.press('Tab')
        page.wait_for_function('''(selector)=>{
          const button=document.querySelector(selector);
          return !!button&&document.activeElement===button&&button.matches(':focus-visible');
        }''', arg=start_selector)
        start_focus = start_button.evaluate('''node=>({
          outlineColor:getComputedStyle(node).outlineColor,
          outlineStyle:getComputedStyle(node).outlineStyle,
          focused:document.activeElement===node&&node.matches(':focus-visible')
        })''')
        check(f'{theme} keyboard focus reaches enabled Start from Reset', start_focus['focused'] and start_button.is_enabled())
        check(f'{theme} Start focus keeps a visible orange ring', start_focus['outlineColor'] == 'rgb(255, 157, 61)' and start_focus['outlineStyle'] == 'solid')
        check_round_background(page, start_button, start_selector, theme, 'Start', 'keyboard focus', '#18764b', sample_pixel=True)

        start_button.hover()
        page.mouse.down()
        page.wait_for_function('''([selector, expected])=>{
          const button=document.querySelector(selector);
          return !!button&&button.matches(':active')&&getComputedStyle(button).backgroundColor===expected;
        }''', arg=[start_selector, css_rgb('#218558')])
        check_round_background(page, start_button, start_selector, theme, 'Start', 'pressed', '#218558', sample_pixel=True)
        page.mouse.up()
        page.wait_for_function("()=>!!document.querySelector('.u27-round-stop')")
    duo.evaluate('''(node, theme)=>{if(theme===null)delete node.dataset.theme;else node.dataset.theme=theme;}''', original_theme)
    page.get_by_role('button', name='Stop', exact=True).click()

    verify_overlay_reactivation(
        'Control Center',
        lambda: page.locator('.duo-status-controls:visible').first.click(),
        lambda: page.get_by_role('button', name='Close Control Center', exact=True).click(),
    )

    def open_app_switcher():
        gesture = page.locator('.duo-home-gesture:visible').first
        box = gesture.bounding_box()
        x, y = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2
        page.mouse.move(x, y)
        page.mouse.down()
        page.mouse.move(x, y - 220, steps=10)
        page.wait_for_timeout(160)
        page.mouse.up()

    verify_overlay_reactivation(
        'App Switcher',
        open_app_switcher,
        lambda: page.locator('.duo-app-switcher .duo-switcher-select').first.click(),
    )

    page.get_by_role('button', name='Timers', exact=True).click()
    page.get_by_role('button', name='New timer', exact=True).click()
    timer_sheet = clock.locator('.u27-clock-timer-editor')
    page.wait_for_function("()=>{const node=document.querySelector('.u27-clock-timer-editor');return !!node&&Number(getComputedStyle(node).opacity)>=.99}")
    editor_height = timer_sheet.evaluate('(node)=>node.getBoundingClientRect().height')
    timer_view_height = clock.evaluate('(node)=>node.getBoundingClientRect().height')
    timer_bg_alpha = timer_sheet.evaluate(r'(node)=>{const c=getComputedStyle(node).backgroundColor;return Number(c.match(/,\s*([\d.]+)\s*\)$/)?.[1]??1)}')
    start_box = timer_sheet.get_by_role('button', name='Start', exact=True).bounding_box()
    check('Timer editor is tall and opaque with Start visible', editor_height >= timer_view_height * .78 and timer_bg_alpha >= .99 and start_box is not None and start_box['y'] >= clock.bounding_box()['y'])
    timer_theme = duo.get_attribute('data-theme')
    for theme in ['light', 'dark']:
        duo.evaluate('(node, theme) => { node.dataset.theme = theme; }', theme)
        page.wait_for_timeout(30)
        check_computed_text_contrast(timer_sheet.locator('.u27-storage-note'), f'{theme} Timer editor note', 'visible')
    duo.evaluate('''(node, theme)=>{if(theme===null)delete node.dataset.theme;else node.dataset.theme=theme;}''', timer_theme)
    duration_fields = timer_sheet.locator('.u27-duration-unit input')
    duration_fields.nth(0).fill('0')
    duration_fields.nth(1).fill('0')
    duration_fields.nth(2).fill('3')
    timer_sheet.get_by_role('button', name='Start', exact=True).click()
    page.get_by_role('button', name='Alarms', exact=True).click()
    page.get_by_role('button', name='Add alarm', exact=True).click()
    alarm_sheet = clock.locator('.u27-clock-alarm-editor')
    verify_alarm_primary_contrast(page, duo, alarm_sheet)
    label_input = alarm_sheet.locator('input[maxlength="40"]')
    local_context = alarm_sheet.locator('.u27-local-clock-context').inner_text()
    label_input.fill('Unsaved alarm draft')
    check('Alarm editor identifies current device-local time and zone', 'Device local time:' in local_context and '/' in local_context)
    check('Alarm label owns focus before an unrelated timer completes', label_input.evaluate('(node)=>document.activeElement===node'))
    page.wait_for_function("()=>{const layer=document.querySelector('.duo-clock-alert-layer');return !!layer&&!layer.hidden}", timeout=7000)
    check('timer completion leaves the unsaved alarm editor mounted', alarm_sheet.is_visible())
    check('timer completion preserves the unsaved alarm label', label_input.input_value() == 'Unsaved alarm draft')
    page.get_by_role('button', name='Stop', exact=True).click()
    page.wait_for_function('()=>document.activeElement?.maxLength===40&&!!document.activeElement?.closest(".u27-clock-alarm-editor")')
    check('dismissing the timer alert restores focus to the alarm draft', label_input.input_value() == 'Unsaved alarm draft')

    page.get_by_role('button', name='Cancel', exact=True).click()
    page.wait_for_function('()=>document.activeElement?.dataset.clockFocusKey==="primary:alarms"')
    check('Cancel after a completed timer restores focus to the semantic Add alarm action', page.evaluate('document.activeElement?.getAttribute("aria-label")==="Add alarm"'))
    page.get_by_role('button', name='Alarms', exact=True).click()
    page.get_by_role('button', name='Add alarm', exact=True).click()
    calendar_alarm = clock.locator('.u27-clock-alarm-editor')
    calendar_alarm.locator('input[type=time]').fill('01:30')
    calendar_alarm.locator('input[type=date]').fill('2026-05-10')
    calendar_alarm.locator('input[maxlength="40"]').fill('Calendar one-shot')
    window_date = page.evaluate('''()=>{
      const RealDate=Date;window.__calendarRealDate=RealDate;window.__calendarEpoch=RealDate.UTC(2026,4,11,7,0,0);
      window.Date=class MockDate extends RealDate{constructor(...args){super(...(args.length?args:[window.__calendarEpoch]));}static now(){return window.__calendarEpoch;}};
    }''')
    calendar_alarm.get_by_role('button', name='Add', exact=True).click()
    calendar_row = clock.locator('.u27-alarm-row').filter(has_text='Calendar one-shot')
    calendar_row.get_by_role('button', name='Turn off Calendar one-shot').click()
    calendar_row.get_by_role('button', name='Turn on Calendar one-shot').click()
    page.wait_for_function("()=>document.querySelector('.u27-alarm-row')?.innerText.includes('Once · Monday, May 11')")
    check('re-arming a past-dated one-shot shows its newly chosen next local date', 'Once · Monday, May 11' in calendar_row.inner_text())
    calendar_row.get_by_role('button', name='Delete Calendar one-shot').click()
    page.evaluate('window.Date=window.__calendarRealDate;delete window.__calendarRealDate;delete window.__calendarEpoch')
    page.get_by_role('button', name='Timers', exact=True).click()
    page.get_by_role('button', name='New timer', exact=True).click()
    timer_sheet = clock.locator('.u27-clock-timer-editor')
    timer_sheet.locator('.u27-duration-unit input').nth(1).fill('0')
    timer_sheet.locator('.u27-duration-unit input').nth(2).fill('3')
    timer_sheet.get_by_role('button', name='Start', exact=True).click()
    page.get_by_role('button', name='Stopwatch', exact=True).click()
    start_watch = clock.get_by_role('button', name='Start', exact=True)
    if start_watch.count(): start_watch.click()
    page.wait_for_timeout(250)
    prepare_digit_watch()
    page.wait_for_function("()=>{const layer=document.querySelector('.duo-clock-alert-layer');return !!layer&&!layer.hidden}", timeout=5000)
    check('timer alert takes keyboard focus before Escape', page.evaluate("document.activeElement?.getAttribute('aria-label')==='Stop'"))
    page.wait_for_timeout(120)
    alert_text = clock.locator('.u27-stopwatch-digits').inner_text()
    alert_mutations = page.evaluate('window.__clockDigitMutations')
    alert_writes = page.evaluate('window.__clockStorageWrites')
    page.wait_for_timeout(650)
    check('Clock Alert leaves the covered Stopwatch view and storage idle',
          clock.locator('.u27-stopwatch-digits').inner_text() == alert_text
          and page.evaluate('window.__clockDigitMutations') == alert_mutations
          and page.evaluate('window.__clockStorageWrites') == alert_writes)
    page.keyboard.press('Escape')
    page.wait_for_function("()=>document.querySelector('.duo-clock-alert-layer')?.hidden")
    check('Escape stops the alert before shell phone dismissal', page.evaluate('window.PeakDuo.getState().visible'))
    page.wait_for_function('''([text])=>{
      const digits=document.querySelector('.duo-app-instance[data-app="clock"] .u27-stopwatch-digits');
      return !!digits&&digits.textContent!==text;
    }''', arg=[alert_text], timeout=1500)
    check('Clock Alert closure immediately resumes the retained Stopwatch view',
          clock.locator('.u27-stopwatch-digits').inner_text() != alert_text)
    check('Clock Alert reactivation does not add storage writes', page.evaluate('window.__clockStorageWrites') == alert_writes)
    page.get_by_role('button', name='Stop', exact=True).click()
    page.evaluate('''()=>{
      window.__clockDigitsObserver?.disconnect();
      if(window.__clockNativeSetItem)localStorage.setItem=window.__clockNativeSetItem;
      delete window.__clockDigitsObserver;delete window.__clockStorageWrites;delete window.__clockNativeSetItem;
    }''')
    check('reopen produces no runtime page errors', not errors)

    print(json.dumps({'checks': checks, 'passed': len(checks), 'page_errors': errors, 'transport': 'synthetic preview'}, indent=2))
    context.close()
    browser.close()
