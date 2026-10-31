"""Renderer sanitation, capability gating and updated video app integration in actual Chromium."""
from pathlib import Path
import os,json,sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from browser_harness import mount_offline
from playwright.sync_api import sync_playwright
R=Path(__file__).resolve().parents[2]
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1600,'height':1000});errors=[];page.on('pageerror',lambda e:errors.append(str(e)));mount_offline(page,nui=True)
 result=page.evaluate('''async()=>{
 const results=[];const check=(name,ok)=>{results.push({name,passed:!!ok});if(!ok)throw Error(name);};
 const bad=['<img src=x onerror="window.pwned=1">','<svg><g onload="window.pwned=1"></g></svg>','<math><mtext><img src=x onerror="window.pwned=1"></mtext></math>','<a href="javascript:window.pwned=1">link</a>','<iframe srcdoc="<script>parent.pwned=1<\\/script>"></iframe>','<p style="background-image:url(javascript:alert(1))" onclick="window.pwned=1">text</p>','<script>window.pwned=1<\\/script>','<form id=PeakDuo><input name=openApp></form>'];
 for(let i=0;i<bad.length;i++){const box=document.createElement('div');box.innerHTML=window.PeakDuoSanitize(bad[i]);document.body.append(box);check('Unsafe rich-text sample '+(i+1)+' is reconstructed safely',!box.querySelector('img,svg,math,iframe,script,form,[onclick],[onerror],[href],[src]'));box.remove();}
 const safe=window.PeakDuoSanitize('<h2>Heading</h2><p class="ql-align-center">Hello <strong>World</strong></p><ul><li>One</li></ul>');
 check('Document formatting survives',safe.includes('<strong>World</strong>')&&safe.includes('ql-align-center')&&safe.includes('<li>One</li>'));
 window.dispatchEvent(new MessageEvent('message',{data:{Action:'Duo/Capabilities',Capabilities:{housing:{available:false,reason:'Missing housing adapter'},facetime:{available:true},calculator:{available:true}}}}));
 window.PeakDuo.openApp('housing','left');await new Promise(r=>setTimeout(r,80));
 check('Unavailable gameplay integration explains missing dependency',document.body.innerText.includes('Missing housing adapter'));
 window.PeakDuo.openApp('facetime','left');await new Promise(r=>setTimeout(r,80));
 check('New video view replaces legacy FaceTime',!!document.querySelector('.duo-video-app'));
 window.PeakDuo.openApp('calculator','right');await new Promise(r=>setTimeout(r,80));
 check('Video and calculator instances coexist',!!document.querySelector('[data-app="facetime"]')&&!!document.querySelector('[data-app="calculator"]'));
 check('No injected script executed',!window.pwned);
 return {results,passed:results.length,liveFiveM:false};
 }''')
 result['pageErrors']=errors;assert not errors,errors
 (R/'artifacts/portable/browser-safety-results.json').parent.mkdir(parents=True,exist_ok=True);(R/'artifacts/portable/browser-safety-results.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2));b.close()
