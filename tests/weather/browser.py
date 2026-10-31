import os
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from browser_harness import mount_offline


APP = '.duo-app-instance[data-app="weather"] .nx-weather'
REFRESH = APP + ' .nx-weather-refresh'
SCENE = APP + ' .nx-weather-scene'


def wait_state(page, condition, sky=None):
    page.wait_for_function(
        "([condition,sky])=>{const app=document.querySelector('" + APP + "');"
        "const scene=app?.querySelector('.nx-weather-scene');"
        "return !!scene&&scene.dataset.condition===condition&&(!sky||scene.dataset.sky===sky)&&"
        "app.querySelector('.nx-weather-refresh')?.getAttribute('aria-busy')!=='true'}",
        arg=[condition, sky], timeout=5000)


def assert_weather_canvas(page, theme, sky):
    actual = page.locator(APP).evaluate("""(n)=>{
      const pane=n.closest('.duo-pane');
      const body=n.querySelector('.nx-weather-body');
      const status=pane?.querySelector('.duo-status');
      const nav=pane?.querySelector('.duo-pane-navigation');
      const home=pane?.querySelector('.duo-home-gesture span');
      const rect=x=>{const r=x.getBoundingClientRect();return [Math.round(r.width),Math.round(r.height)]};
      const overlaps=(a,b)=>{const x=a.getBoundingClientRect(),y=b.getBoundingClientRect();return x.left<y.right&&x.right>y.left&&x.top<y.bottom&&x.bottom>y.top};
      const synthetic=n.querySelector('.nx-weather-synthetic');
      const actionGroup=n.querySelector('.nx-weather-action-group');
      const windLabel=n.querySelector('.nx-weather-label');
      const time=n.querySelector('.nx-weather-time');
      const textSelectors='h1,h2,h3,h4,p,span,small,strong,b,label,li,a,time,dt,dd,button,input,textarea,select';
      const textColors=[...n.querySelectorAll(textSelectors)].filter(e=>e.textContent.trim()&&e.getClientRects().length)
        .map(e=>({className:e.className?.baseVal||e.className||e.tagName,text:e.textContent.trim().slice(0,48),color:getComputedStyle(e).color}));
      return {
        theme:document.querySelector('#duo').dataset.theme,
        sky:n.dataset.sky,
        background:getComputedStyle(n).backgroundImage,
        header:getComputedStyle(n.querySelector('.nx-header')).display,
        body:rect(body),root:rect(n),
        statusBackground:getComputedStyle(status).backgroundColor,
        statusColor:getComputedStyle(status).color,
        navBackground:getComputedStyle(nav).backgroundColor,
        homeColor:getComputedStyle(home).backgroundColor,
        blur:getComputedStyle(n.querySelector('.nx-weather-wind')).backdropFilter,
        syntheticOverAction:overlaps(synthetic,actionGroup),
        syntheticOverMetric:overlaps(synthetic,windLabel),
        timeOverMetric:overlaps(time,n.querySelector('.nx-weather-wind')),
        textColors
      }
    }""")
    assert actual['theme'] == theme and actual['sky'] == sky, actual
    assert 'linear-gradient' in actual['background'], actual
    assert actual['header'] == 'none', actual
    assert actual['body'] == actual['root'], actual
    assert actual['statusBackground'] == 'rgba(0, 0, 0, 0)', actual
    assert actual['statusColor'] == 'rgb(248, 251, 255)', actual
    assert actual['navBackground'] == 'rgba(0, 0, 0, 0)', actual
    assert actual['homeColor'] == 'rgb(248, 251, 255)', actual
    assert actual['blur'] == 'none', actual
    assert not actual['syntheticOverAction'], actual
    assert not actual['syntheticOverMetric'], actual
    assert not actual['timeOverMetric'], actual
    ink_colors = {'rgb(245, 249, 255)', 'rgb(222, 235, 248)'}
    assert actual['textColors'] and all(item['color'] in ink_colors for item in actual['textColors']), actual['textColors']


with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, executable_path=os.environ.get('CHROMIUM_PATH') or None)
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    mount_offline(page)
    page.wait_for_function('window.PeakDuo?.preview === true')
    page.evaluate("PeakDuo.openApp('weather','left')")
    page.wait_for_selector(APP)
    wait_state(page, 'clear', 'day')
    assert page.locator(APP).evaluate('(n)=>n.dataset.weatherActive') == 'true'
    assert page.locator('.duo-app-instance[data-app="weather"] > .nx-weather').count() == 1
    assert page.locator('.duo-app-instance[data-app="weather"] .nx-header .nx-weather-refresh').count() == 0, 'Weather actions leave the generic app header'

    refresh = page.locator(REFRESH)
    for theme in ('light', 'dark'):
        page.evaluate('(theme)=>PeakDuo.setPhoneSetting("appearance",theme)', theme)
        page.wait_for_function('(theme)=>document.querySelector("#duo").dataset.theme===theme', arg=theme)
        for sky in ('day', 'night', 'unknown'):
            page.evaluate('(sky)=>PeakDuo.weatherPreview.setMode(sky)', sky)
            refresh.click()
            wait_state(page, 'unknown' if sky == 'unknown' else 'clear', sky)
            assert_weather_canvas(page, theme, sky)

        page.evaluate("PeakDuo.weatherPreview.setMode('night')")
        before = page.evaluate("PeakDuo.requests.filter(r=>r.event==='Weather/GetState').length")
        refresh.click()
        wait_state(page, 'clear', 'night')
        assert page.evaluate("PeakDuo.requests.filter(r=>r.event==='Weather/GetState').length") == before + 1, 'Refresh button should reach the current game route'
        scene = page.locator(SCENE)
        assert page.locator(APP + ' .nx-weather-condition').inner_text() == 'Clear'
        assert page.locator(APP + ' .nx-weather-symbol').get_attribute('aria-hidden') == 'true'

        page.evaluate("PeakDuo.weatherPreview.setMode('unknown')")
        refresh.click()
        wait_state(page, 'unknown', 'unknown')
        assert page.locator(APP + ' .nx-weather-location').inner_text() == 'Location unavailable'
        assert page.locator(APP + ' .nx-weather-time').evaluate('(n)=>n.textContent') == 'Game clock unavailable'
        assert page.locator(APP + ' .nx-weather-condition').inner_text() == 'Conditions unavailable'
        assert page.locator(APP + ' .nx-weather-sun').evaluate('(n)=>getComputedStyle(n).display') == 'none'
        assert page.locator(APP + ' .nx-weather-cloud-a').evaluate('(n)=>getComputedStyle(n).display') == 'none'

        page.evaluate("PeakDuo.weatherPreview.setMode('error')")
        refresh.click()
        page.get_by_role('alert').filter(has_text='Synthetic current game weather read failed.').wait_for()
        assert not refresh.is_disabled()

    # Synthetic XY vectors cover the payload-to-label-to-compass-arrow bearing contract.
    page.evaluate("PeakDuo.weatherPreview.setMode('day')")
    for x, y, point, bearing in ((0, 1, 'N', 0), (1, 0, 'E', 90), (0, -1, 'S', 180), (-1, 0, 'W', 270)):
        page.evaluate('(vector)=>PeakDuo.weatherPreview.setWindVector(vector.x,vector.y)', {'x': x, 'y': y})
        refresh.click()
        wait_state(page, 'clear', 'day')
        direction = page.locator(APP + ' .nx-weather-direction').evaluate("""n=>{
          const matrix=new DOMMatrixReadOnly(getComputedStyle(n.querySelector('.nx-weather-compass-arrow')).transform);
          return {
            label:n.querySelector('.nx-weather-label').textContent,
            value:n.querySelector('.nx-weather-value').textContent,
            accessible:n.getAttribute('aria-label'),
            rotation:(Math.atan2(matrix.b,matrix.a)*180/Math.PI+360)%360
          };
        }""")
        assert direction['label'] == 'Game wind vector', direction
        assert direction['value'] == f'{point} · {bearing}°', direction
        assert direction['accessible'] == f'Game wind vector pointing {point}, {bearing} degrees clockwise from north', direction
        angular_error = abs((direction['rotation'] - bearing + 180) % 360 - 180)
        assert angular_error < 0.1, direction

    # A destroyed instance and its replacement must not coalesce the same pending transport read.
    page.evaluate("PeakDuo.weatherPreview.setMode('day')")
    refresh.click()
    wait_state(page, 'clear', 'day')
    page.evaluate("PeakDuo.setPreviewDelay('Weather/GetState',2500);PeakDuo.weatherPreview.setMode('night')")
    request_count = page.evaluate("PeakDuo.requests.filter(r=>r.event==='Weather/GetState').length")
    refresh.click()
    page.wait_for_function('(count)=>PeakDuo.requests.filter(r=>r.event===\'Weather/GetState\').length===count+1', arg=request_count)
    page.wait_for_function("document.querySelector('" + REFRESH + "')?.getAttribute('aria-busy')==='true'")
    old_epoch = page.evaluate("PeakDuo.requests.filter(r=>r.event==='Weather/GetState').at(-1).data.ViewEpoch")
    page.locator(APP).evaluate("n=>window.__weatherBeforeDestroy=n.closest('.duo-app-instance')")
    page.evaluate("PeakDuo.sendPreview({Action:'Duo/Capabilities',Capabilities:{weather:{available:false,reason:'Synthetic capability cycle'}}})")
    page.wait_for_function("window.__weatherBeforeDestroy?.isConnected===false")
    page.wait_for_function("!document.querySelector('" + APP + "')")
    page.evaluate("PeakDuo.setPreviewDelay('Weather/GetState',900);PeakDuo.weatherPreview.setMode('day')")
    request_count = page.evaluate("PeakDuo.requests.filter(r=>r.event==='Weather/GetState').length")
    page.evaluate("PeakDuo.sendPreview({Action:'Duo/Capabilities',Capabilities:{weather:{available:true}}})")
    page.wait_for_function("document.querySelector('" + APP + "')?.dataset.weatherActive==='true'")
    page.wait_for_function('(count)=>PeakDuo.requests.filter(r=>r.event===\'Weather/GetState\').length===count+1', arg=request_count, timeout=1000)
    new_epoch = page.evaluate("PeakDuo.requests.filter(r=>r.event==='Weather/GetState').at(-1).data.ViewEpoch")
    assert isinstance(new_epoch, int) and 0 < new_epoch <= 9007199254740991 and new_epoch != old_epoch, (old_epoch, new_epoch)
    assert page.locator(APP).evaluate("n=>n.closest('.duo-app-instance')!==window.__weatherBeforeDestroy")
    page.wait_for_timeout(1100)
    assert page.locator(SCENE).get_attribute('data-sky') == 'day', 'stale deactivated response must not overwrite the last confirmed snapshot'
    assert page.locator(REFRESH).get_attribute('aria-busy') == 'false', 'fresh activation read should finish before the stale request'
    page.wait_for_timeout(1500)
    assert page.locator(SCENE).get_attribute('data-sky') == 'day', 'late deactivated response must stay discarded'
    wait_state(page, 'clear', 'day')
    assert page.locator(APP + ' .nx-weather-sun').evaluate('(n)=>getComputedStyle(n).animationName') == 'wx-sun-breathe'

    # A folded, short phone pane must keep the atmospheric headline clear of the metric cards.
    page.set_viewport_size({'width': 430, 'height': 932})
    page.wait_for_timeout(100)
    compact = page.locator(APP).evaluate("""n=>{
      const bounds=s=>{const r=n.querySelector(s).getBoundingClientRect();return {top:r.top,bottom:r.bottom}};
      const body=n.querySelector('.nx-weather-body');
      return {copy:bounds('.nx-weather-copy'),wind:bounds('.nx-weather-wind'),height:n.getBoundingClientRect().height,scrollHeight:body.scrollHeight,clientHeight:body.clientHeight};
    }""")
    assert compact['height'] <= 320, compact
    assert compact['copy']['bottom'] <= compact['wind']['top'], compact
    assert compact['scrollHeight'] > compact['clientHeight'], compact

    # Document-hidden state uses the same lifecycle gate as parking.
    page.evaluate("""()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));}""")
    page.wait_for_function("document.querySelector('" + APP + "')?.dataset.weatherActive==='false'")
    assert page.locator(APP + ' .nx-weather-cloud-a').evaluate('(n)=>getComputedStyle(n).animationName') == 'none'
    page.evaluate("""()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));}""")
    page.wait_for_function("document.querySelector('" + APP + "')?.dataset.weatherActive==='true'")

    assert not errors, errors
    print('PASS: Weather controls, six theme/sky states, cardinal XY bearings, lifecycle, stale-read isolation, and parked-motion gating', flush=True)
    browser.close()
