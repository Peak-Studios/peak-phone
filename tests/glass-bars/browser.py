"""Synthetic phone layout and physical display checks in Chromium."""
import io, json, statistics
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[2]
source = (Path(__file__).with_name('browser-contract.mjs')).read_text().replace('export async function', 'async function')
with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1276, 'height': 800})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto('http://127.0.0.1:8791/?glass-bars-contract')
    page.wait_for_function('window.PeakDuo?.preview')
    result = page.evaluate('async()=>{' + source + ';return await runGlassBarsContract();}')
    # Sparse opaque stripes expose sharp content leaking through a transparent replica.
    rect = page.evaluate('''async()=>{
      PeakDuo.setLayout('full');if(PeakDuo.getState().workspace.expanded)PeakDuo.fold();
      await new Promise(r=>setTimeout(r,900));await PeakDuo.openApp('y');await new Promise(r=>setTimeout(r,800));
      const y=document.querySelector('.duo-pane[data-active=true] .nx-y'),body=y.querySelector('.nx-y-body'),nav=y.querySelector('.nx-y-bottom');
      body.style.position='relative';body.scrollTop=0;
      const b=body.getBoundingClientRect(),n=nav.getBoundingClientRect(),stripe=document.createElement('div');
      stripe.style.cssText=`position:absolute;left:0;top:${n.top-b.top-30}px;width:100%;height:160px;background:repeating-linear-gradient(90deg,#fff 0 3px,transparent 3px 6px)`;
      body.append(stripe);nav.querySelectorAll(':scope > button').forEach(e=>e.style.visibility='hidden');
      await new Promise(r=>setTimeout(r,500));return n.toJSON();
    }''')
    def contrast():
        image = Image.open(io.BytesIO(page.screenshot())).convert('RGB')
        values = [sum(image.getpixel((x, int(rect['y']+rect['height']/2))))/3
                  for x in range(int(rect['x']+40), int(rect['right']-40))]
        return statistics.mean(abs(a-b) for a,b in zip(values,values[1:]))
    fixed = contrast()
    page.evaluate("document.querySelector('.nx-y-bottom > .duo-surface-blur').style.background='transparent'")
    page.wait_for_timeout(200)
    leaking = contrast()
    assert leaking > 5 and fixed < leaking * .2, (fixed, leaking)
    result['pixelRegression'] = {'fixedContrast': fixed, 'transparentContrast': leaking}
    assert not errors, errors
    print(json.dumps(result, indent=2))
    browser.close()
