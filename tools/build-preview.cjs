/** Create a standalone browser preview using the exact shipped UI and embedded local images. */
const fs=require('node:fs'),path=require('node:path');const root=path.resolve(__dirname,'..'),pub=path.join(root,'web/public');
const out=process.argv[2]?path.resolve(process.argv[2]):path.join(root,'preview-output/Peak-Duo-Preview.html');
const modules=Object.fromEntries(fs.readdirSync(path.join(pub,'duo')).filter(f=>f.endsWith('.mjs')).map(f=>[f,fs.readFileSync(path.join(pub,'duo',f),'utf8')]));
const assets={};function collect(dir){for(const ent of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,ent.name);if(ent.isDirectory())collect(f);else{const ext=path.extname(f).slice(1);if(['png','jpg','jpeg','webp','svg'].includes(ext)){const key=path.relative(pub,f).replaceAll(path.sep,'/');assets[key]='data:image/'+({jpg:'jpeg',svg:'svg+xml'}[ext]||ext)+';base64,'+fs.readFileSync(f).toString('base64');}}}}collect(path.join(pub,'images'));
const data={modules,assets,css:[...fs.readFileSync(path.join(pub,'index.html'),'utf8').matchAll(/<link\s+rel="stylesheet"\s+href="\.\/([^"]+)"/g)].map(m=>fs.readFileSync(path.join(pub,m[1]),'utf8')),scripts:['duo/sanitize.js','duo/voice-notes.js'].map(f=>fs.readFileSync(path.join(pub,f),'utf8')),legacy:fs.readFileSync(path.join(pub,'build/duo-legacy.js'),'utf8')};
const html=String.raw`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Peak Duo · Browser Preview</title></head><body><script id="duo-files" type="application/json">${JSON.stringify(data).replaceAll('<','\\u003c')}</script><script type="module">
const files=JSON.parse(document.getElementById('duo-files').textContent);document.getElementById('duo-files').remove();
const resolveAsset=value=>{if(typeof value!=='string')return value;const key=value.replace(/^nui:\/\/peak-phone\/web\/public\//,'').replace(/^\.\//,'');return files.assets[key]||value;};
const set=Element.prototype.setAttribute;Element.prototype.setAttribute=function(key,value){return set.call(this,key,this.tagName==='IMG'&&key==='src'?resolveAsset(value):value);};
const desc=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');Object.defineProperty(HTMLImageElement.prototype,'src',{...desc,set(value){desc.set.call(this,resolveAsset(value));}});
for(const source of files.css){const s=document.createElement('style');s.textContent=source;document.head.append(s);}
for(const source of [...files.scripts,files.legacy]){const app=document.createElement('script');app.textContent=source;document.head.append(app);}
const urls={};function build(name){if(urls[name])return urls[name];const source=files.modules[name].replace(/(['"])\.\/([^'"\n]+\.mjs)\1/g,(_,quote,dep)=>quote+build(dep)+quote);return urls[name]=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));}
import(build('shell.mjs')).catch(error=>{console.error(error);document.body.append(Object.assign(document.createElement('pre'),{textContent:error.message}));});
</script></body></html>`;
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,html);console.log('Standalone preview:',out,Buffer.byteLength(html),'bytes');
