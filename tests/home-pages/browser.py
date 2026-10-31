from playwright.sync_api import sync_playwright
from pathlib import Path
import os
ROOT=Path(__file__).resolve().parents[2]
out=ROOT/'artifacts/home-pages';out.mkdir(parents=True,exist_ok=True)
def wait_for_active_grid_alignment(page):
 page.wait_for_function("""() => {
  const pane=document.querySelector('.duo-pane[data-side="left"]');
  const viewport=pane?.querySelector('.duo-home-viewport');
  const grid=pane?.querySelector('.duo-app-grid[aria-hidden="false"]');
  if(!viewport||!grid)return false;
  const visible=grid.getBoundingClientRect(),frame=viewport.getBoundingClientRect();
  return Math.abs(visible.left-frame.left)<1&&Math.abs(visible.right-frame.right)<1;
 }""")
with sync_playwright() as p:
 options={'headless':True}
 if os.environ.get('CHROMIUM_PATH'):options['executable_path']=os.environ['CHROMIUM_PATH']
 b=p.chromium.launch(**options)
 page=b.new_page(viewport={'width':1440,'height':1000});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(os.environ.get('PREVIEW_URL','http://127.0.0.1:8791'));page.wait_for_selector('html[data-duo-ready=true]');page.wait_for_timeout(900)
 pane=page.locator('.duo-pane[data-side=left]')
 assert pane.locator('.duo-home-heading').is_hidden()
 assert pane.locator('.duo-widgets').is_hidden()
 dock=pane.locator('.duo-dock').bounding_box();assert dock['height']>dock['width']*3
 for app in ['settings','calls','messages']:
  assert pane.locator(f'.duo-app-button[data-app={app}] .duo-app-remove').count()==0
 active_grid='.duo-app-grid[aria-hidden="false"]'
 first=pane.locator(f'{active_grid} .duo-app-button').first.get_attribute('data-app')
 pane.locator('.duo-page-dot').nth(1).click();assert pane.locator(f'{active_grid} .duo-app-button').first.get_attribute('data-app')!=first
 wait_for_active_grid_alignment(page)
 grid=pane.locator(active_grid).bounding_box();page.mouse.move(grid['x']+20,grid['y']+grid['height']-5);page.mouse.down();page.mouse.move(grid['x']+120,grid['y']+grid['height']-5,steps=10);page.mouse.up()
 assert pane.locator('.duo-page-dot').first.get_attribute('aria-current')=='true'
 wait_for_active_grid_alignment(page)
 photo=pane.locator('.duo-app-button[data-app=gallery]');box=photo.bounding_box();page.mouse.move(box['x']+20,box['y']+20);page.mouse.down();page.wait_for_timeout(600);page.mouse.up()
 assert page.locator('#duo').evaluate("n=>n.classList.contains('duo-home-editing')")
 assert photo.locator('.duo-app-remove').count()==0
 dot=pane.locator('.duo-page-dot').nth(1).bounding_box();page.mouse.move(box['x']+20,box['y']+20);page.mouse.down();page.mouse.move(dot['x']+3,dot['y']+3,steps=15);page.mouse.up()
 assert pane.locator('.duo-page-dot').nth(1).get_attribute('aria-current')=='true'
 assert pane.locator('.duo-app-button[data-app=gallery]').count()==1
 pane.locator('.duo-home-done').click()
 page.screenshot(path=str(out/'folded.png'))
 print(page.evaluate("({state:PeakDuo.getState(),grid:[...document.querySelectorAll('.duo-app-grid')].map(n=>({height:n.clientHeight,scroll:n.scrollHeight,count:n.children.length})),dock:[...document.querySelectorAll('.duo-dock')].map(n=>n.getBoundingClientRect().toJSON())})"))
 page.locator('.duo-fold-button').click();page.wait_for_timeout(900);page.screenshot(path=str(out/'unfolded.png'))
 page.locator('.duo-orientation-button').click();page.wait_for_timeout(900);page.screenshot(path=str(out/'portrait.png'))
 page.locator('.duo-side-power').click();page.wait_for_timeout(500);assert not page.evaluate('PeakDuo.getState().powered')
 page.locator('.duo-side-power').click();page.wait_for_timeout(500);assert page.locator('.duo-lock-screen').is_visible();page.screenshot(path=str(out/'lock-portrait.png'))
 page.locator('.duo-orientation-button').click();page.wait_for_timeout(800);page.screenshot(path=str(out/'lock-landscape.png'))
 page.locator('.duo-fold-button').click();page.wait_for_timeout(800);page.screenshot(path=str(out/'lock-folded.png'))
 page.locator('.duo-lock-screen input').fill('9999');page.locator('.duo-lock-submit').click();page.wait_for_timeout(300);assert page.locator('.duo-lock-screen').is_visible()
 page.locator('.duo-lock-screen input').fill('1234');page.locator('.duo-lock-submit').click();page.wait_for_timeout(300)
 assert page.locator('.duo-lock-screen').is_visible()
 preview_unlock = page.evaluate("async()=>{try{await PeakPhoneTransport('Devices/unlock',{PIN:'1234'});return 'resolved'}catch(error){return error.message}}")
 assert 'needs the live FiveM server' in preview_unlock
 print('POWER LOCK PASS; errors:',errors);assert not errors
 b.close()
