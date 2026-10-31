"""Diagnostic Chromium CPU/layout breakdown; does not establish GTA/CEF FPS."""
import json, os, base64, collections
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT=Path(os.environ.get('PROFILE_OUT',str(Path(__file__).resolve().parents[1]/'artifacts/performance/fold-profile.json')))
OUT.parent.mkdir(parents=True,exist_ok=True)
EXPERIMENT_CSS=os.environ.get('PROFILE_CSS','')
EXPERIMENT_JS=Path(os.environ['PROFILE_JS']).read_text(encoding='utf-8') if os.environ.get('PROFILE_JS') else ''
with sync_playwright() as p:
    options={'headless':True}
    if os.environ.get('CHROMIUM_PATH'):options['executable_path']=os.environ['CHROMIUM_PATH']
    browser=p.chromium.launch(**options)
    results=[]
    for label,url in [('baseline',os.environ.get('BASELINE_URL','http://127.0.0.1:8792')),('candidate',os.environ.get('PREVIEW_URL','http://127.0.0.1:8791'))]:
        context=browser.new_context(viewport={'width':1440,'height':1000})
        page=context.new_page();page.goto(url);page.wait_for_function('window.PeakDuo?.preview');page.wait_for_timeout(700)
        if label=='candidate' and EXPERIMENT_CSS:page.add_style_tag(content=EXPERIMENT_CSS)
        if label=='candidate' and EXPERIMENT_JS:page.evaluate(EXPERIMENT_JS)
        cdp=context.new_cdp_session(page);cdp.send('Performance.enable')
        page.evaluate("""async()=>{
          const moduleUrl=performance.getEntriesByType('resource').find(r=>r.name.includes('/duo/fold-motion.mjs'))?.name;
          if(!moduleUrl)throw Error('Loaded fold module not found');
          const {FoldMotion}=await import(moduleUrl);
          window.foldProfile=[];
          for(const name of ['snapshot','cloneVisibleTree','poseStyleProperties','freezeSnapshotStyles','cloneSnapshotTree','restoreScroll','copyTreeScroll','scopeIds','play']){
            const fn=FoldMotion.prototype[name];FoldMotion.prototype[name]=function(...args){const start=performance.now();try{return fn.apply(this,args)}finally{foldProfile.push({name,ms:performance.now()-start})}};
          }
        }""")
        for app in [None,'messages','calendar']:
            if app:page.evaluate('id=>PeakDuo.openApp(id,"left")',app)
            else:page.evaluate('PeakDuo.home("left")')
            page.wait_for_timeout(400)
            for direction in ['unfold','fold']:
                trace=bool(os.environ.get('PROFILE_TRACE')) and label=='candidate' and app=='calendar' and direction=='unfold'
                trace_done={}
                if trace:
                    cdp.on('Tracing.tracingComplete',lambda params:trace_done.update(params))
                    cdp.send('Tracing.start',{'categories':'devtools.timeline,disabled-by-default-devtools.timeline.invalidationTracking','transferMode':'ReturnAsStream'})
                before={x['name']:x['value'] for x in cdp.send('Performance.getMetrics')['metrics']}
                action=page.evaluate("""()=>{
                  foldProfile=[];const root=document.querySelector('#duo'),bank=root.querySelector('.duo-screenbank'),nodes=bank.querySelectorAll('*').length,start=performance.now();PeakDuo.fold();const synchronousMs=performance.now()-start,methods={};for(const sample of foldProfile){const total=methods[sample.name]??={count:0,inclusiveMs:0,maxMs:0};total.count++;total.inclusiveMs+=sample.ms;total.maxMs=Math.max(total.maxMs,sample.ms);}return {synchronousMs,nodes,methods};
                }""")
                page.wait_for_function("!document.querySelector('#duo').classList.contains('duo-folding')")
                after={x['name']:x['value'] for x in cdp.send('Performance.getMetrics')['metrics']}
                metrics={k:after[k]-before[k] for k in ['LayoutCount','RecalcStyleCount','LayoutDuration','RecalcStyleDuration','ScriptDuration','TaskDuration']}
                results.append({'runtime':label,'app':app or 'home','direction':direction,**action,'metrics':metrics})
                if trace:
                    cdp.send('Tracing.end')
                    for _ in range(100):
                        if trace_done.get('stream'):break
                        page.wait_for_timeout(100)
                    stream=trace_done['stream'];chunks=[]
                    while True:
                        chunk=cdp.send('IO.read',{'handle':stream})
                        chunks.append(base64.b64decode(chunk['data']).decode() if chunk.get('base64Encoded') else chunk['data'])
                        if chunk.get('eof'):break
                    cdp.send('IO.close',{'handle':stream})
                    events=json.loads(''.join(chunks))['traceEvents'];invalidations=[x for x in events if 'InvalidationTracking' in x.get('name','')]
                    names={}
                    for event in invalidations:
                        data=event.get('args',{}).get('data',{});node_id=data.get('nodeId')
                        if not node_id or node_id in names:continue
                        try:
                            node=cdp.send('DOM.describeNode',{'backendNodeId':node_id})['node'];attrs=dict(zip(node.get('attributes',[])[::2],node.get('attributes',[])[1::2]));names[node_id]={'name':node['nodeName'],'class':attrs.get('class',''),'id':attrs.get('id','')}
                        except Exception:names[node_id]={'unavailable':True}
                    reasons=collections.Counter((x.get('name'),str(x.get('args',{}).get('data',{}).get('reason'))) for x in invalidations)
                    functions=collections.Counter();selectors=collections.Counter();node_counts=collections.Counter()
                    for event in invalidations:
                        data=event.get('args',{}).get('data',{});node_counts[data.get('nodeId')]+=1
                        if data.get('reason')=='Related style rule':
                            stack=data.get('stackTrace') or [];frame=stack[0] if stack else {}
                            functions[(frame.get('functionName','no-stack'),frame.get('lineNumber',0))]+=1
                        for selector in data.get('selectors',[]):selectors[selector.get('selector','')]+=1
                    details={'eventCount':len(invalidations),'reasons':[{'event':key[0],'reason':key[1],'count':count} for key,count in reasons.most_common()],
                             'relatedStyleFunctions':[{'function':key[0],'line':key[1],'count':count} for key,count in functions.most_common()],
                             'nodes':[{'node':names.get(node_id),'count':count} for node_id,count in node_counts.most_common(30)],
                             'selectors':[{'selector':selector,'count':count} for selector,count in selectors.most_common(30)]}
                    if os.environ.get('PROFILE_RAW_TRACE_OUT'):Path(os.environ['PROFILE_RAW_TRACE_OUT']).write_text(json.dumps({'events':invalidations,'nodes':names},indent=2),encoding='utf-8')
                    OUT.with_name('fold-style-invalidations.json').write_text(json.dumps(details,indent=2),encoding='utf-8')
        context.close()
    browser.close()
OUT.write_text(json.dumps({'method':'CDP Performance metrics over complete fold transitions; local synthetic runtime','candidateCss':EXPERIMENT_CSS,'candidateJavascript':EXPERIMENT_JS,'results':results},indent=2),encoding='utf-8')
for r in results:
    print(json.dumps({'runtime':r['runtime'],'app':r['app'],'direction':r['direction'],'synchronousMs':r['synchronousMs'],'metrics':r['metrics']}),flush=True)
