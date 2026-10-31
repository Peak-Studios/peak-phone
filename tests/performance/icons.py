"""Render all 1,895 icon masks to prove URL compaction preserves their pixels."""
import os,re,json
from pathlib import Path
from PIL import Image,ImageChops
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'artifacts/performance/icons';OUT.mkdir(parents=True,exist_ok=True)
urls={'baseline':os.environ.get('BASELINE_URL','http://127.0.0.1:8792'),'candidate':os.environ.get('PREVIEW_URL','http://127.0.0.1:8791')}
report={}
with sync_playwright() as p:
 options={'headless':True}
 if os.environ.get('CHROMIUM_PATH'):options['executable_path']=os.environ['CHROMIUM_PATH']
 browser=p.chromium.launch(**options)
 for label,url in urls.items():
  context=browser.new_context(viewport={'width':1000,'height':2200},device_scale_factor=1)
  page=context.new_page();css=page.request.get(url+'/duo/legacy-icons.css').text();names=re.findall(r'\.([a-zA-Z0-9-]+)\{--fa-mask:',css)
  assert len(names)==1895,(label,len(names))
  page.set_content('<!doctype html><html><head></head><body><main id="gallery">'+''.join(f'<div class="cell"><i class="fas {name}"></i></div>' for name in names)+'</main></body></html>')
  page.add_style_tag(content=css)
  page.add_style_tag(content='html,body{margin:0;background:#080a0d;color:#fafafa}#gallery{width:960px;display:grid;grid-template-columns:repeat(30,32px)}.cell{width:32px;height:32px;display:grid;place-items:center}i.fas{font-size:24px;width:24px;height:24px;line-height:1}')
  page.wait_for_timeout(1500)
  page.locator('#gallery').screenshot(path=str(OUT/f'{label}.png'),animations='disabled')
  report[label]={'count':len(names),'cssBytes':len(css.encode())};context.close()
 browser.close()
before=Image.open(OUT/'baseline.png').convert('RGB');after=Image.open(OUT/'candidate.png').convert('RGB');assert before.size==after.size
diff=ImageChops.difference(before,after);changed=sum(any(pixel) for pixel in diff.getdata());diff.save(OUT/'diff.png')
report['changedPixels']=changed;report['totalPixels']=before.width*before.height
(OUT/'comparison.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report,indent=2),flush=True)
assert changed==0,report
