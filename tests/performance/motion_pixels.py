"""Compare painted fold frames, not just geometry, on the two served runtimes."""
import json,os
from pathlib import Path
from PIL import Image,ImageChops
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'artifacts/performance/motion-pixels';OUT.mkdir(parents=True,exist_ok=True)
urls={'baseline':os.environ.get('BASELINE_URL','http://127.0.0.1:8792'),'candidate':os.environ.get('PREVIEW_URL','http://127.0.0.1:8791')}
cases=[]
with sync_playwright() as p:
 options={'headless':True}
 if os.environ.get('CHROMIUM_PATH'):options['executable_path']=os.environ['CHROMIUM_PATH']
 browser=p.chromium.launch(**options)
 for label,url in urls.items():
  context=browser.new_context(viewport={'width':1440,'height':1000});page=context.new_page()
  page.add_init_script('const ActualDate=Date;globalThis.Date=class extends ActualDate{constructor(...args){super(...(args.length?args:[1791745200000]));}};')
  page.goto(url);page.wait_for_function('window.PeakDuo?.preview');page.wait_for_timeout(700)
  page.evaluate("""async()=>{const moduleUrl=performance.getEntriesByType('resource').find(r=>r.name.includes('/duo/fold-motion.mjs'))?.name;if(!moduleUrl)throw Error('Loaded fold module not found');const {FoldMotion}=await import(moduleUrl);const play=FoldMotion.prototype.play;FoldMotion.prototype.play=function(...args){const result=play.apply(this,args);clearTimeout(this.timer);this.timer=setTimeout(()=>this.cancel(),60000);window.motionInspector=this;return result;};}""")
  for app in ['home','calendar']:
   page.evaluate("async id=>{PeakDuo.setPhoneSetting('motion',true);if(PeakDuo.getState().workspace.expanded)PeakDuo.fold();if(id==='home')PeakDuo.home('left');else await PeakDuo.openApp(id,'left');}",app);page.wait_for_timeout(350)
   # Normalize the one intentional quality correction in the reference UI;
   # these comparisons isolate performance/motion changes. Actual CTA contrast
   # is independently checked in both themes by the appearance suite.
   if label=='baseline' and app=='calendar':
    page.evaluate("()=>{for(const b of document.querySelectorAll('.u27-agenda > .nx-button')){b.classList.remove('u27-secondary');b.classList.add('nx-primary');}}")
   for orientation in ['landscape','portrait']:
    page.evaluate("orientation=>{PeakDuo.setPhoneSetting('motion',true);if(!PeakDuo.getState().workspace.expanded)PeakDuo.fold();const root=document.querySelector('#duo');if(root.dataset.orientation!==orientation)root.querySelector('.duo-orientation-button').click();PeakDuo.fold();PeakDuo.setPhoneSetting('motion',false);}",orientation);page.wait_for_timeout(350)
    for direction in ['unfold','fold']:
     page.evaluate("PeakDuo.fold();for(const a of document.querySelector('#duo').getAnimations({subtree:true}))a.pause()")
     for time in [160,380,600]:
      page.evaluate("time=>{for(const a of document.querySelector('#duo').getAnimations({subtree:true}))a.currentTime=time;}",time);page.wait_for_timeout(35)
      name=f'{app}-{orientation}-{direction}-{time}';page.locator('#duo').screenshot(path=str(OUT/f'{label}-{name}.png'))
      if label=='candidate':cases.append(name)
     # Complete the sampled pose before starting the next independent case.
     # Cancellation now correctly preserves a paused partial hinge phase.
     page.evaluate("async()=>{for(const a of motionInspector.animations)a.finish();await new Promise(r=>setTimeout(r,800));motionInspector.cancel();}");page.wait_for_timeout(180)
  context.close()
 browser.close()
report=[]
for name in cases:
 before=Image.open(OUT/f'baseline-{name}.png').convert('RGB');after=Image.open(OUT/f'candidate-{name}.png').convert('RGB')
 assert before.size==after.size,(name,before.size,after.size)
 diff=ImageChops.difference(before,after);significant=sum(max(pixel)>3 for pixel in diff.getdata());total=before.width*before.height
 report.append({'case':name,'referenceCalendarCTAClassNormalized':name.startswith('calendar-'),'changedPixels':sum(any(pixel) for pixel in diff.getdata()),'significantPixels':significant,'totalPixels':total,'ratio':significant/total});diff.save(OUT/f'diff-{name}.png')
(OUT/'comparison.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report,indent=2),flush=True)
assert all(r['ratio']<.001 for r in report),report
