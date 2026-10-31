"""Review interaction surfaces using read-only preview data, without submitting forms."""
from pathlib import Path
import json, os
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(os.environ.get('APPEARANCE_OUT', str(ROOT/'artifacts/ios-theme-redesign')))
OUT.mkdir(parents=True, exist_ok=True)
URL = os.environ.get('PREVIEW_URL', 'http://127.0.0.1:8794')
cases = [
    ('settings', 'Display & appearance'), ('settings', 'Sounds & Focus'),
    ('settings', 'Notifications'), ('settings', 'Input & accessibility'),
    ('settings', 'Connectivity'), ('settings', 'Apps & storage'),
    ('settings', 'Device & SIM'), ('settings', 'About this phone'),
    ('documents', 'Create a new note'),
    ('clock', 'World Clock'), ('clock', 'Stopwatch'), ('clock', 'New timer'), ('clock', 'Add alarm'),
    ('calendar', 'New event'), ('calendar', 'Schedule'),
    ('wenmo', 'Send money'), ('yellowpages', 'Create listing'),
    ('yellowpages', 'View Studio delivery'),
    ('contacts', 'Open Jordan Lee'), ('vehicles', 'View Obey Tailgater S'),
    ('peakify', 'Add music'), ('peakify', 'Choose audio output'),
    ('facetime', 'New Call'),
    ('gallery', 'Videos On device'),
]
results = []
with sync_playwright() as pw:
    options = {'headless': True}
    if os.environ.get('CHROMIUM_PATH'): options['executable_path'] = os.environ['CHROMIUM_PATH']
    browser = pw.chromium.launch(**options)
    for theme in ['light', 'dark']:
        for app, action in cases:
            page = browser.new_page(viewport={'width': 1440, 'height': 1000})
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.add_init_script(path=str(ROOT/'tests/appearance/fixtures.js'))
            page.add_init_script(path=str(ROOT/'tests/appearance/contrast-audit.js'))
            page.goto(URL)
            page.wait_for_function('window.PeakDuo?.preview === true')
            page.wait_for_function("document.documentElement.dataset.duoReady === 'true'")
            page.evaluate('(theme)=>{PeakDuo.setPhoneSetting("motion",true);PeakDuo.setPhoneSetting("appearance",theme)}', theme)
            assert page.evaluate('(app)=>PeakDuo.openApp(app)', app), (theme, app, 'App was unavailable before the phone initialized')
            app_view=page.locator('.duo-app-instance[data-app="'+app+'"]')
            if app == 'clock' and action == 'New timer':
                app_view.get_by_role('button', name='Timers', exact=True).click()
            elif app == 'clock' and action == 'Add alarm':
                app_view.get_by_role('button', name='Alarms', exact=True).click()
            action_button=app_view.get_by_role('button', name=action, exact=True)
            action_button.wait_for(state='visible')
            action_button.click()
            page.wait_for_timeout(250)
            if app == 'documents':
                page.get_by_label('Note title').fill('Theme review draft')
                content_editor = page.get_by_label('Note content')
                assert content_editor.evaluate('node => node.isContentEditable')
                content_editor.fill('Notes editor appearance draft')
            if app == 'settings':
                header = page.locator('.ps-settings > .nx-header')
                geometry = header.evaluate('''header => {
                    const back = header.querySelector('.ps-back');
                    const title = header.querySelector('.nx-heading');
                    const action = header.querySelector('.nx-header-action');
                    const a = back.getBoundingClientRect(), b = title.getBoundingClientRect(), c = action.getBoundingClientRect();
                    return {backFits: back.scrollWidth <= back.clientWidth + 1,
                        titleFits: title.scrollWidth <= title.clientWidth + 1,
                        separated: a.right <= b.left + 1 && b.right <= c.left + 1};
                }''')
                assert all(geometry.values()), (theme, action, 'Settings header controls overlap', geometry)
            name = theme+'-'+app+'-'+action.lower().replace(' ', '-').replace('&', 'and')
            page.locator('.duo-pane[data-active=true]').screenshot(path=str(OUT/(name+'.png')))
            audit = page.evaluate('auditPhoneContrast(document.querySelector(".duo-pane[data-active=true]"))')
            # A live switch must update mounted controls, and switching back
            # must preserve the interaction state and input values.
            inputs = page.locator('.duo-app-instance[data-app="'+app+'"] input[type=text]:visible,.duo-app-instance[data-app="'+app+'"] textarea:visible')
            if inputs.count(): inputs.first.fill('Theme review draft')
            content = page.get_by_label('Note content') if app == 'documents' else None
            content_text = content.inner_text() if content else None
            field_values = page.locator('.duo-app-instance[data-app="'+app+'"] input,.duo-app-instance[data-app="'+app+'"] textarea,.duo-app-instance[data-app="'+app+'"] select').evaluate_all('(els)=>els.filter(e=>!e.closest("[inert]")).map(e=>e.value)')
            page.evaluate('(theme)=>PeakDuo.setPhoneSetting("appearance",theme)', 'dark' if theme == 'light' else 'light')
            page.wait_for_timeout(100)
            page.evaluate('(theme)=>PeakDuo.setPhoneSetting("appearance",theme)', theme)
            assert page.evaluate('document.querySelector("#duo").dataset.theme') == theme
            assert page.locator('.duo-app-instance[data-app="'+app+'"] input,.duo-app-instance[data-app="'+app+'"] textarea,.duo-app-instance[data-app="'+app+'"] select').evaluate_all('(els)=>els.filter(e=>!e.closest("[inert]")).map(e=>e.value)') == field_values, (theme, app, action, 'Theme switch lost form state')
            if content: assert content.inner_text() == content_text, (theme, app, action, 'Theme switch lost editor text')
            assert not errors, (name, errors)
            results.append({'theme': theme, 'app': app, 'action': action, **audit})
            (OUT/'states.json').write_text(json.dumps(results, indent=2))
            print('CHECK', name, flush=True)
            page.close()
    browser.close()
print('PASS:', len(results), 'interaction states and mounted theme transitions')
