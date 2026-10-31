/** Compact quoted SVG data URLs without changing SVG bytes or CSS semantics. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const cssPath=path.join(root,'web/public/duo/legacy-icons.css');
const baselinePath=path.join(root,'tests/contracts/legacy-icons-integrity.json');
const URI=/data:image\/svg\+xml,([^"\r\n]+)/g;
const safe=new Set([..." :/=?+&,;()[]{}!'*@$^~-._"].map(character=>'%'+character.charCodeAt(0).toString(16).toUpperCase().padStart(2,'0')));
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
function compactCss(css){
 return css.replace(URI,(_,encoded)=>{
  const svg=decodeURIComponent(encoded);
  const compact=encodeURIComponent(svg).replace(/%[0-9a-f]{2}/gi,escape=>safe.has(escape.toUpperCase())?String.fromCharCode(parseInt(escape.slice(1),16)):escape);
  if(decodeURIComponent(compact)!==svg)throw Error('SVG data changed during URL compaction');
  return 'data:image/svg+xml,'+compact;
 });
}
function fingerprint(css){
 let masks=0;
 const normalized=css.replace(/\r\n/g,'\n').replace(URI,(_,encoded)=>{masks++;return 'data:image/svg+xml,sha256:'+hash(Buffer.from(decodeURIComponent(encoded),'utf8'));});
 return {masks,normalizedSha256:hash(normalized)};
}
if(require.main===module){
 const original=fs.readFileSync(cssPath,'utf8'),before=fingerprint(original);
 if(process.argv.includes('--record-baseline')){
  if(fs.existsSync(baselinePath))throw Error('The immutable icon baseline already exists');
  fs.writeFileSync(baselinePath,JSON.stringify({sourceCommit:'6129680222662bb14d16c7764e42657a027ed15b',...before},null,2)+'\n');
 }
 const expected=JSON.parse(fs.readFileSync(baselinePath,'utf8'));
 if(before.masks!==expected.masks||before.normalizedSha256!==expected.normalizedSha256)throw Error('CSS/SVG contents differ from the reviewed icon baseline');
 const compact=compactCss(original),after=fingerprint(compact);
 if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Icon bindings or SVG bytes changed');
 fs.writeFileSync(cssPath,compact);
 console.log(JSON.stringify({masks:after.masks,beforeBytes:Buffer.byteLength(original),afterBytes:Buffer.byteLength(compact),savedBytes:Buffer.byteLength(original)-Buffer.byteLength(compact)}));
}
module.exports={compactCss,fingerprint};
