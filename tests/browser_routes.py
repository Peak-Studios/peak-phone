"""Smoke-open every registered route with shape-correct NUI fixtures and real permission gates."""
from pathlib import Path
import json,os,re
from playwright.sync_api import sync_playwright
from browser_harness import mount_offline
ROOT=Path(__file__).resolve().parents[1]
ids=re.findall(r"\['([\w-]+)','",(ROOT/'web/public/duo/catalog.mjs').read_text().split('].map')[0])
assert len(ids)==35 and len(set(ids))==35
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1600,'height':1000});page.set_default_timeout(4000)
 errors=[];warnings=[];results=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('console',lambda m:warnings.append(m.text) if m.type in ['error','warning'] else None)
 mount_offline(page,nui=True);page.keyboard.press('e');page.wait_for_timeout(800)
 page.evaluate("window.PeakDuo.openApp('calculator','left')")
 for id in ids:
  start=len(errors)
  if id=='time-trials':page.evaluate('window.PeakPhoneLegacy.stores.HasPDRacingUsb.set(true)')
  if id=='racing':page.evaluate('window.PeakPhoneLegacy.stores.HasPDRacingUsb.set(false);window.PeakPhoneLegacy.stores.HasRacingUsb.set(true)')
  if id=='cars':page.evaluate("window.PeakPhoneLegacy.stores.CurrentNetwork.set('pdm')")
  opened=page.evaluate("id=>window.PeakDuo.openApp(id,'right')",id);page.wait_for_timeout(450)
  state=page.evaluate('window.PeakDuo.getState()')
  if id=='camera':
   assert opened and state['camera'],'camera takeover not active'
   page.keyboard.press('Escape');page.wait_for_timeout(180)
  else:
   assert opened and id in state['apps'],'route did not mount: '+id
   assert page.locator(f'.duo-app-instance[data-app="{id}"]').count()==1,'duplicate route '+id
   assert page.locator(f'.duo-app-instance[data-app="{id}"]').is_visible(),'route not visible: '+id
  assert not errors[start:],(id,errors[start:])
  assert not state['errors'],(id,state['errors'])
  results.append({'app':id,'passed':True,'page_errors':errors[start:]})
 report={'passed_routes':len(results),'results':results,'console_warnings':list(dict.fromkeys(warnings)),'live_fivem':False,'scope':'Route mounting and initial fixture read responses, not end-to-end gameplay.'}
 (ROOT/'artifacts/browser-route-results.json').parent.mkdir(parents=True,exist_ok=True);(ROOT/'artifacts/browser-route-results.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2));b.close()
