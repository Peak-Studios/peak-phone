/** Offline, deterministic compatibility build. Requires Node 18+, no npm install.
 * The source hash deliberately fails closed if the supplied legacy app build changes.
 * New interface source lives in web/public/duo/ and is served as ES modules.
 */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {disableBackdropFilters}=require('./nui-safe-css.cjs');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'web/legacy/bundle.original.js'),'utf8');
const spec=JSON.parse(fs.readFileSync(path.join(root,'web/legacy/patches.json'),'utf8'));
const hash=crypto.createHash('sha256').update(source).digest('hex');
if(hash!==spec.sha256)throw new Error('Legacy bundle does not match the reviewed source. Rebase and re-test patches before building.');
let output=source;
let previous=source.length;
for(const p of [...spec.patches].sort((a,b)=>b.start-a.start)){
 if(p.start<0||p.end>previous||p.end<=p.start)throw new Error('Invalid or overlapping compatibility patch: '+p.description);
 output=output.slice(0,p.start)+p.text+output.slice(p.end);previous=p.start;
}
output=output.replace(/^var app=/,'window.PeakPhoneLegacy=');
output=output.replaceAll('nui://peak-phone/web/public/','./');
// Keep browser preview detection independent of the optional invokeNative global.
output=output.replace('$t=()=>!window.invokeNative','$t=()=>!window.GetParentResourceName');
fs.mkdirSync(path.join(root,'web/public/build'),{recursive:true});
fs.writeFileSync(path.join(root,'web/public/build/duo-legacy.js'),output);
console.log('Duo app adapter built:',Buffer.byteLength(output),'bytes');
console.log('Source SHA-256:',hash);
// Keep the reviewed app styles, without remote font imports or a cursor-resource dependency.
const originalCss=fs.readFileSync(path.join(root,'web/legacy/bundle.original.css'),'utf8');
const css=disableBackdropFilters(originalCss.replace(/@import\s+url\([^)]*\);?/g,'')
 .replaceAll('cursor:url("nui://peak-cursor/cursor.png") 0 0, auto !important','cursor:auto !important')
 .replaceAll('cursor:url("nui://peak-cursor/pointer.png") 0 0, pointer !important','cursor:pointer !important'));
if(css.includes('nui://peak-cursor')||/@import\s+url\(/.test(css))throw Error('Unreviewed external style dependency');
fs.writeFileSync(path.join(root,'web/public/build/bundle.css'),css);
