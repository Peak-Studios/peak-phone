"""Compare two exact runtimes; synthetic browser measurements, not GTA FPS.

Start the baseline preview on 8792 and candidate on 8791. Override the URLs
with BASELINE_URL / PREVIEW_URL and Chromium with CHROMIUM_PATH.
"""
import json, os, statistics
from pathlib import Path
from PIL import Image, ImageChops
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(os.environ.get('PERFORMANCE_OUT', str(ROOT / 'artifacts/performance')))
OUT.mkdir(parents=True, exist_ok=True)
URLS = {'baseline': os.environ.get('BASELINE_URL', 'http://127.0.0.1:8792'),
        'candidate': os.environ.get('PREVIEW_URL', 'http://127.0.0.1:8791')}
NAVIGATION = """async()=>{
 const root=document.querySelector('#duo'),icons=[...root.querySelectorAll('.duo-app-button')],results=[];
 for(const id of ['calls','messages','documents','weather','calculator','mails','contacts','maps','calendar','clock','settings','gallery']){
  const start=performance.now();const opened=await PeakDuo.openApp(id,'left');
  const ms=performance.now()-start;await new Promise(r=>setTimeout(r,300));
  results.push({id,opened,ms,retainedIcons:icons.filter(n=>n.isConnected).length});
 }
 return {results,totalIcons:icons.length,errors:PeakDuo.getState().errors};
}"""
IDLE = """async()=>{
 const {createScreenCapture,encodeDisplay}=await import('/duo/screen-capture.mjs'),root=document.querySelector('#duo'),bank=root.querySelector('.duo-screenbank');let encodes=0,sends=0;
 const capture=createScreenCapture({bank,isVisible:()=>true,isExpanded:()=>false,encode:async snapshot=>{encodes++;return encodeDisplay(snapshot);},send:async()=>{sends++;return {Success:true};}});
 await new Promise(r=>setTimeout(r,2300));capture.destroy();return {encodes,sends};
}"""
MOTION = """async()=>{
 const {createScreenCapture}=await import('/duo/screen-capture.mjs'),root=document.querySelector('#duo'),bank=root.querySelector('.duo-screenbank');
 let sends=0;const capture=createScreenCapture({bank,isVisible:()=>true,isExpanded:()=>PeakDuo.getState().workspace.expanded,send:async()=>{sends++;return {Success:true};}});
 const deltas=[],phases=[];let previous=performance.now(),running=true,phase=null;
 const sample=now=>{const delta=now-previous;deltas.push(delta);phase?.intervals.push(delta);previous=now;if(running)requestAnimationFrame(sample);};requestAnimationFrame(sample);
 const begin=name=>{phase={name,intervals:[],started:performance.now()};phases.push(phase);};
 const settled=async()=>{const start=performance.now();do{await new Promise(requestAnimationFrame);}while((root.classList.contains('duo-folding')||root.classList.contains('duo-orientation-turning'))&&performance.now()-start<4000);};
 for(let i=0;i<2;i++){begin(PeakDuo.getState().workspace.expanded?'fold':'unfold');PeakDuo.fold();await settled();phase.elapsedMs=performance.now()-phase.started;if(PeakDuo.getState().workspace.expanded){begin('orientation');root.querySelector('.duo-orientation-button').click();await settled();phase.elapsedMs=performance.now()-phase.started;}}
 begin('scroll');
 const app=root.querySelector('.duo-app-instance:not([hidden])');
 const scroller=document.createElement('div');scroller.style.cssText='position:absolute;inset:20px;overflow:auto;background:white;color:black';
 for(let i=0;i<200;i++){const row=document.createElement('p');row.textContent=`Scroll stress fixture row ${i}: retained content and physical display.`;scroller.append(row);}app.append(scroller);
 if(scroller)for(let i=0;i<20;i++){scroller.scrollTop=i%2?0:scroller.scrollHeight;await new Promise(requestAnimationFrame);}
 phase.elapsedMs=performance.now()-phase.started;running=false;capture.destroy();scroller.remove();deltas.sort((a,b)=>a-b);
 const stages=phases.map(({name,intervals,elapsedMs})=>{intervals.sort((a,b)=>a-b);return {name,elapsedMs,frames:intervals.length,p95:intervals[Math.floor(intervals.length*.95)]??null,max:intervals.length?Math.max(...intervals):null,over50:intervals.filter(n=>n>50).length};});
 return {frames:deltas.length,p50:deltas[Math.floor(deltas.length*.5)],p95:deltas[Math.floor(deltas.length*.95)],max:Math.max(...deltas),over50:deltas.filter(n=>n>50).length,sends,scrollExercised:!!scroller,stages};
}"""
with sync_playwright() as p:
    options = {'headless': True}
    if os.environ.get('CHROMIUM_PATH'): options['executable_path'] = os.environ['CHROMIUM_PATH']
    browser = p.chromium.launch(**options)
    report = {'limits': 'Synthetic local Chromium; timings are diagnostic, not FiveM/CEF acceptance.', 'runs': [], 'visual': []}
    for run in range(3):
        for label in (['baseline','candidate'] if run % 2 == 0 else ['candidate','baseline']):
            context = browser.new_context(viewport={'width':1440,'height':1000}, reduced_motion='no-preference')
            page = context.new_page(); errors=[]
            page.on('pageerror',lambda error: errors.append(str(error)))
            page.goto(URLS[label], wait_until='load'); page.wait_for_function('window.PeakDuo?.preview')
            page.wait_for_timeout(700)
            resources = page.evaluate("performance.getEntriesByType('resource').map(r=>({name:r.name.split('/').pop(),bytes:r.decodedBodySize,start:r.startTime,duration:r.duration}))")
            if label=='candidate':
                assert not any(x['name'].endswith('.wav') for x in resources), resources
                assert sum(x['name']=='duo-legacy.js' for x in resources)==1, resources
            idle = page.evaluate(IDLE)
            navigation = page.evaluate(NAVIGATION)
            motion = page.evaluate(MOTION)
            report['runs'].append({'runtime':label,'run':run,'resources':resources,'idle':idle,'navigation':navigation,'motion':motion,'runtimeErrors':errors})
            assert not errors, errors
            assert all(r['opened'] for r in navigation['results']), navigation
            if label == 'candidate': assert all(r['retainedIcons']==navigation['totalIcons'] for r in navigation['results']), navigation
            context.close()
    # Identical fixtures and reduced motion settle the exact same design for
    # pixel comparisons; real motion remains covered above and by fold contracts.
    for label in URLS:
        context=browser.new_context(viewport={'width':1440,'height':1000})
        page=context.new_page()
        page.add_init_script("const ActualDate=Date;globalThis.Date=class extends ActualDate{constructor(...args){super(...(args.length?args:[1791745200000]));}};")
        page.goto(URLS[label]);page.wait_for_function('window.PeakDuo?.preview')
        page.evaluate("PeakDuo.setPhoneSetting('motion',true);PeakDuo.sendPreview({Action:'SetTime',Hours:12,Minutes:0})")
        for name,app,expanded,orientation in [('home',None,False,'landscape'),('messages','messages',False,'landscape'),('notes-portrait','documents',True,'portrait'),('calculator-landscape','calculator',True,'landscape')]:
            page.evaluate("async ({app,expanded,orientation})=>{if(PeakDuo.getState().workspace.expanded!==expanded)PeakDuo.fold();const root=document.querySelector('#duo');if(expanded&&root.dataset.orientation!==orientation)root.querySelector('.duo-orientation-button').click();if(app)await PeakDuo.openApp(app,'left');else PeakDuo.home('left');}",{'app':app,'expanded':expanded,'orientation':orientation})
            page.wait_for_timeout(700)
            if app=='documents':page.wait_for_function("!document.querySelector('.duo-app-instance[data-app=documents]')?.textContent.includes('Loading your folders')")
            page.locator('#duo').screenshot(path=str(OUT/f'{label}-{name}.png'),animations='disabled')
        context.close()
    for name in ['home','messages','notes-portrait','calculator-landscape']:
        before=Image.open(OUT/f'baseline-{name}.png').convert('RGBA');after=Image.open(OUT/f'candidate-{name}.png').convert('RGBA')
        assert before.size==after.size,(name,before.size,after.size)
        diff=ImageChops.difference(before.convert('RGB'),after.convert('RGB'))
        changed=sum(any(pixel) for pixel in diff.getdata());significant=sum(max(pixel)>3 for pixel in diff.getdata());total=before.width*before.height
        diff.save(OUT/f'diff-{name}.png')
        report['visual'].append({'scene':name,'changedPixels':changed,'significantPixels':significant,'totalPixels':total,'ratio':significant/total})
    context=browser.new_context(viewport={'width':1440,'height':1000});page=context.new_page();page.goto(URLS['candidate']);page.wait_for_function('window.PeakDuo?.preview')
    report['catalogSweep']=page.evaluate("""async()=>{
      const {APPS}=await import('/duo/catalog.mjs'),results=[];
      for(const app of APPS){const before=PeakDuo.getState().errors.length;const opened=await PeakDuo.openApp(app.id,'left');await new Promise(r=>setTimeout(r,100));results.push({id:app.id,opened,errors:PeakDuo.getState().errors.slice(before)});if(app.id==='camera')PeakDuo.sendPreview({Action:'ShowCameraOverlay',Visible:false});}
      return results;
    }""")
    context.close()
    for label in URLS:
        runs=[r for r in report['runs'] if r['runtime']==label]
        report[label]={'navigationMedianMs':statistics.median(x['ms'] for r in runs for x in r['navigation']['results']),
                       'navigationP95Ms':sorted(x['ms'] for r in runs for x in r['navigation']['results'])[int(36*.95)],
                       'motionP95Ms':statistics.median(r['motion']['p95'] for r in runs),
                       'decodedStartupBytes':statistics.median(sum(x['bytes'] for x in r['resources']) for r in runs)}
    (OUT/'comparison.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k!='runs'},indent=2),flush=True)
    assert all(v['ratio']<.001 for v in report['visual']),report['visual']
    browser.close()
