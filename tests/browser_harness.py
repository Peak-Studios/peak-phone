from pathlib import Path
import json,re
from playwright.sync_api import sync_playwright
ROOT=(Path(__file__).resolve().parents[1]/'web'/'public').resolve()
def local_asset_path(specifier):
    relative=specifier.split('?',1)[0].split('#',1)[0]
    asset=(ROOT/relative).resolve()
    try:asset.relative_to(ROOT)
    except ValueError:raise ValueError(f'Offline browser asset escapes public root: {specifier!r}')
    return asset
def mount_offline(page,nui=False,open_phone=True):
    # Render shipped files in memory as an offline deterministic browser fixture.
    index=(ROOT/'index.html').read_text(encoding='utf-8')
    head=''.join(re.findall(r'<meta\b[^>]*>|<style\b[^>]*>[\s\S]*?</style>',index,re.I))
    page.set_content('<!doctype html><html><head>'+head+'<base href="https://phone-preview.invalid/"></head><body></body></html>')
    page.evaluate('''()=>{const create=()=>{const values=new Map();return {get length(){return values.size},key:i=>Array.from(values.keys())[i]??null,getItem:k=>values.has(String(k))?values.get(String(k)):null,setItem:(k,v)=>values.set(String(k),String(v)),removeItem:k=>values.delete(String(k)),clear:()=>values.clear()}};for(const key of ['localStorage','sessionStorage'])Object.defineProperty(window,key,{configurable:true,value:create()});}''')
    for href in re.findall(r'<link\s+rel="stylesheet"\s+href="\./([^"]+)"',index):
        page.add_style_tag(content=local_asset_path(href).read_text(encoding='utf-8'))
    page.add_script_tag(content=local_asset_path('duo/sanitize.js').read_text(encoding='utf-8'))
    page.add_script_tag(content=local_asset_path('duo/voice-notes.js').read_text(encoding='utf-8'))
    page.add_script_tag(content=local_asset_path('build/duo-legacy.js').read_text(encoding='utf-8'))
    # Adapt only module resolution, never application logic, for in-memory loading.
    modules={p.name:p.read_text(encoding='utf-8') for p in local_asset_path('duo').glob('*.mjs')}
    page.evaluate(r'''async ({modules,nui,open_phone})=>{
        window.postMessage = data => window.dispatchEvent(new MessageEvent('message',{data,source:window}));
        if(nui){window.GetParentResourceName=()=> 'peak-phone';window.Peer=class{};}
        const urls={};
        function build(name){
            if(urls[name])return urls[name];
            if(!Object.prototype.hasOwnProperty.call(modules,name))throw new Error(`Offline browser module is outside the fixture map: ${name}`);
            const source=modules[name].replace(/(['"])\.\/([^'"\n]+?\.mjs)(?:\?[^'"\n]*)?\1/g,(_,quote,dep)=>quote+build(dep)+quote);
            return urls[name]=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
        }
        window.__previewFixtures=await import(build('preview.mjs'));
        if(nui)window.fetch=async (url,options)=>{
           const event=String(url).replace('https://peak-phone/','');
           const data=JSON.parse(options?.body||'{}');
           try {const value=await window.__previewFixtures.mockSend(event,data);return {ok:true,status:200,text:async()=>JSON.stringify(value)}}
           catch(error){return {ok:false,status:500,text:async()=>''}}
        };
        await import(build('shell.mjs'));
        if(nui&&open_phone)window.dispatchEvent(new MessageEvent('message',{data:window.__previewFixtures.previewOpen()}));
    }''',{'modules':modules,'nui':nui,'open_phone':open_phone})
    page.wait_for_timeout(700)
