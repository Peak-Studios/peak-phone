/** Generate or verify the shipped runtime manifest. Text uses canonical LF so
 * Git archive/checkouts remain verifiable across Windows and Linux; binary
 * assets remain byte-exact. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),manifest=path.join(root,'tests/contracts/runtime-sha256.json');
const roots=['bridge','client','integrations','jobs','server','shared','web/public'];
const rootFiles=['config.lua','fxmanifest.lua','sv_config.lua'],files=[];
function walk(rel){for(const entry of fs.readdirSync(path.join(root,rel),{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const name=path.posix.join(rel.replaceAll('\\','/'),entry.name);if(entry.isDirectory())walk(name);else files.push(name)}}
for(const rel of roots)if(fs.existsSync(path.join(root,rel)))walk(rel);
for(const rel of rootFiles)if(fs.existsSync(path.join(root,rel)))files.push(rel);
files.sort();
const textExtensions=new Set(['.css','.html','.js','.json','.lua','.md','.mjs','.scss','.sql','.svg','.txt','.xml','.yaml','.yml']);
const hash=name=>{let body=fs.readFileSync(path.join(root,name));if(textExtensions.has(path.extname(name).toLowerCase()))body=Buffer.from(body.toString('utf8').replace(/\r\n/g,'\n'),'utf8');return crypto.createHash('sha256').update(body).digest('hex');};
if(process.argv.includes('--write')){
 const output={release:require(path.join(root,'package.json')).version,generatedAt:new Date().toISOString(),files:Object.fromEntries(files.map(name=>[name,hash(name)]))};
 fs.writeFileSync(manifest,JSON.stringify(output,null,2)+'\n');
 console.log(`Wrote reviewed runtime manifest for ${files.length} files.`);process.exit(0);
}
const expected=JSON.parse(fs.readFileSync(manifest,'utf8'));let failures=0;
for(const name of files)if(!expected.files[name]){console.error('UNREVIEWED:',name);failures++;}
for(const [name,wanted]of Object.entries(expected.files)){let actual;try{actual=hash(name)}catch{actual='MISSING'}if(actual!==wanted){console.error('CHANGED:',name);failures++;}}
console.log(`${files.length-failures}/${files.length} discovered runtime files match the reviewed manifest.`);
if(failures){console.error('Run npm run manifest:write only after reviewing every intended runtime change.');process.exitCode=1;}
