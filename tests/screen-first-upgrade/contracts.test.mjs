/** Pure helper, contract and synthetic-state tests. Browser/native tests are separate. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {normalizePhone,relativeTime,byteLength,collectionKey,readLocal,writeLocal,isRows,safeImage,resultOK} from '../../web/public/duo/native-kit.mjs';
import {isMissed} from '../../web/public/duo/phone-app.mjs';
import {percent,vehicleState} from '../../web/public/duo/vehicle-app.mjs';
import {normalizePosts,postMatches,canPublish} from '../../web/public/duo/social-app.mjs';
import {createUpgradeFixture} from '../../web/public/duo/upgrade-preview.mjs';
const root=new URL('../../',import.meta.url);
const read=name=>readFileSync(fileURLToPath(new URL(name,root)),'utf8');

test('dialer strips formatting, preserves telephone symbols, caps length',()=>{
 assert.equal(normalizePhone(' +1 (555) 010-2002 '),'+15550102002');
 assert.equal(normalizePhone('*123#'),'*123#');assert.equal(normalizePhone(null),'');
 assert.equal(normalizePhone('1'.repeat(50)).length,24);
});
test('missed calls never classify successful or outgoing calls as missed',()=>{
 for(const Status of ['missed','ringing','failed','unanswered'])assert.equal(isMissed({Incoming:true,Status}),true);
 assert.equal(isMissed({Incoming:false,Status:'missed'}),false);
 assert.equal(isMissed({Incoming:true,Status:'ended'}),false);
});
test('time accepts seconds and milliseconds without invalid placeholders',()=>{
 const now=1_800_000_000_000;assert.equal(relativeTime(now-120_000,now),'2m');
 assert.equal(relativeTime((now-7200_000)/1000,now),'2h');
 assert.equal(relativeTime('bad',now),'');assert.equal(relativeTime(now+100,now),'now');
});
test('health respects actual scale, clamps values and distinguishes unavailable',()=>{
 assert.equal(percent(960,1000),96);assert.equal(percent(87.6),88);assert.equal(percent(-2),0);
 assert.equal(percent(120),100);for(const v of [null,undefined,'','bad',Infinity])assert.equal(percent(v),null);
});
test('vehicle status supports numeric zero without treating it as missing',()=>{
 assert.equal(vehicleState(0),'outside');assert.equal(vehicleState(1),'parked');assert.equal(vehicleState(2),'impound');
 assert.equal(vehicleState('Inside'),'parked');assert.equal(vehicleState('DEPOT'),'impound');assert.equal(vehicleState(null),'unknown');
});
test('post input accepts actual empty Lua array shape but not malformed data',()=>{
 assert.equal(isRows({}),true);assert.equal(isRows([]),true);assert.equal(isRows(null),false);assert.equal(isRows({Error:'no'}),false);
 assert.deepEqual(normalizePosts({}),[]);assert.deepEqual(normalizePosts([{Id:0},{Id:-1},{Id:'bad'},{Id:2,Image:'https://i.imgur.com/a.jpg'},{Id:'5',Msg:'new'}]).map(p=>p.Id),[5,2]);
});
test('publishing enforces UTF-8 byte limit and at most four attachments',()=>{
 assert.equal(byteLength('é'),2);assert.equal(byteLength('😀'),4);
 assert.equal(canPublish({Msg:'é'.repeat(500)}),true);assert.equal(canPublish({Msg:'é'.repeat(501)}),false);
 assert.equal(canPublish({Msg:'   '}),false);assert.equal(canPublish({QuoteId:1}),true);
 assert.equal(canPublish({Images:['https://i.imgur.com/a.jpg']}),true);assert.equal(canPublish({Msg:'ok',Images:Array(5).fill('x')}),false);
});
test('post search is case-insensitive for author, handle and hashtags',()=>{
 const p={Name:'Maya Chen',Sender:'Maya_Chen',Msg:'Working on #Duo'};
 for(const q of ['MAYA','duo','chen',''])assert.equal(postMatches(p,q),true);assert.equal(postMatches(p,'unmatched'),false);
});
test('media rejects scripting, plain HTTP, credentials and traversal',()=>{
 for(const u of ['javascript:alert(1)','data:image/svg+xml,<svg/>','http://example.com/a','https://a:b@example.com/x','./images/../../x'])assert.equal(safeImage(u),'');
 assert.equal(safeImage('https://i.imgur.com/a.jpg'),'https://i.imgur.com/a.jpg');assert.equal(safeImage('./images/ios/y.svg'),'./images/ios/y.svg');
});
test('local social keys isolate server and character without delimiter collision',()=>{
 const a=collectionKey({server:'one',identity:'A'},'y-draft');
 assert.notEqual(a,collectionKey({server:'two',identity:'A'},'y-draft'));
 assert.notEqual(a,collectionKey({server:'one',identity:'B'},'y-draft'));
 assert.notEqual(collectionKey({server:'a:b',identity:'c'},'d'),collectionKey({server:'a',identity:'b:c'},'d'));
});
test('local storage failures do not crash and are not silently reported as persisted',()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem(){throw Error('blocked');},setItem(){throw Error('full');}}});
 try{assert.deepEqual(readLocal({},'x',{fallback:true}),{fallback:true});assert.equal(writeLocal({},'x',{}),false);}finally{if(previous)Object.defineProperty(globalThis,'localStorage',previous);else delete globalThis.localStorage;}
});
test('native actions accept explicit success only',()=>{
 for(const r of [{Success:false},{},{error:'denied'},false,null])assert.equal(Boolean(resultOK(r)),false);
 for(const r of [true,'Ok',{Success:true}])assert.equal(Boolean(resultOK(r)),true);
});
test('screen-first style is wired before mandatory CEF transparent fallback',()=>{
 const html=read('web/public/index.html');const styles=[...html.matchAll(/<link[^>]*href="([^"]+)"/g)].map(m=>m[1].split('?')[0]);
 assert(styles.includes('./duo/upgrade.css'));assert.equal(styles.at(-1),'./duo/nui-safe.css');
 const css=read('web/public/duo/upgrade.css');assert.doesNotMatch(css,/(?:backdrop-filter|filter)\s*:\s*(?!none\b)[^;}]+/);
 assert(css.includes('--duo-rail:0vh'));assert(css.includes('.nx-native-host{top:3.7vh!important}'));
});
test('folded and expanded docks share one exact visual rule',()=>{
 const upgrade=read('web/public/duo/upgrade.css'),css=read('web/public/duo/social-refresh.css');
 const rule=css.match(/#duo\[data-expanded\]\[data-layout\] \.duo-dock\{([^}]+)\}/)?.[1]||'';
 assert.match(rule,/display:grid/);assert.match(rule,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
 assert.match(rule,/justify-items:center/);assert.match(rule,/gap:0/);assert.match(rule,/padding:\.8vh 1\.3vh/);
 assert.match(rule,/width:min\(100%,34vh\)/);assert.match(rule,/height:6\.7vh/);assert.match(rule,/border-radius:2\.2vh/);
 assert.match(rule,/background:[^}]+!important/);assert.match(rule,/box-shadow:/);
 assert.doesNotMatch(css,/#duo\[data-expanded=true\]\[data-layout=full\] \.duo-dock\{[^}]+(?:width|height|padding|background|border-radius):/);
 assert.match(css,/@keyframes duo-dock-open-settle/);assert.match(css,/@keyframes duo-dock-fold-settle/);
 assert.match(upgrade,/#duo\[data-expanded=true\]\[data-layout=full\] \.duo-app-grid\{[^}]*grid-template-columns:repeat\(4,/);
});
test('hand assist waits for the safe window and supports folding and unfolding',()=>{
 const src=read('client/cl_duo_prop.lua');
 assert.match(src,/v\.assistOpening=expanded/);assert.match(src,/if v\.assistOpening then return true end/);
 assert.doesNotMatch(src,/C\.LeftHand\.Enabled and expanded and/);
});
test('fold cover copies a screen instead of inheriting rear camera styling',()=>{
 const src=read('web/public/duo/fold-motion.mjs');assert(src.includes('duo-fold-cover'));
 assert(!src.includes('duo-fold-back'));assert(src.includes('cloneNode(true)'));
});
test('native social app stays in-city and exposes persisted paged posts',()=>{
 const src=read('web/public/duo/social-app.mjs');assert(src.includes('not the external X'));
 assert(src.includes("this.send('Y/GetFeed'"));assert(src.includes('Load older posts'));assert(src.includes('new TextEncoder')===false);
 for(const f of ['phone-app.mjs','vehicle-app.mjs','social-app.mjs','native-kit.mjs'])assert.doesNotMatch(read('web/public/duo/'+f),/getUserMedia|getDisplayMedia|mediaDevices/);
});
test('preview writes fail once, retain state and can be retried',async()=>{
 const f=createUpgradeFixture();f.failOnce('Y/CreatePost','Expected rejection');
 await assert.rejects(f.send('Y/CreatePost',{Msg:'retry'}),/Expected rejection/);assert.equal(f.state.posts.length,3);
 const r=await f.send('Y/CreatePost',{Msg:'retry'});assert.equal(r.Success,true);assert.equal(r.Post.Id,4);
});
test('preview reply and quote relationships are allocated without overwriting',async()=>{
 const f=createUpgradeFixture();const reply=await f.send('Y/CreatePost',{Msg:'reply',ReplyTo:3});const quote=await f.send('Y/CreatePost',{Msg:'quote',QuoteId:3});
 assert.notEqual(reply.Post.Id,quote.Post.Id);assert.equal(f.state.posts.find(p=>p.Id===3).ReplyCount,1);assert.equal(f.state.posts.find(p=>p.Id===3).QuoteCount,1);
});
test('preview like/repost is reversible, owner deletion is enforced',async()=>{
 const f=createUpgradeFixture();await f.send('Y/ToggleLike',{Id:3});assert.equal(f.state.posts[2].HasLiked,true);await f.send('Y/ToggleLike',{Id:3});assert.equal(f.state.posts[2].LikeCount,4);
 await f.send('Y/ToggleRepost',{Id:3});assert.equal(f.state.posts.length,4);await f.send('Y/ToggleRepost',{Id:3});assert.equal(f.state.posts.length,3);
 assert.equal((await f.send('Y/DeletePost',{Id:3})).Success,false);
 assert.equal((await f.send('Y/DeletePost',{Id:1})).Success,true);
});
test('preview reports synthetic scope and never fabricates premium transactions',async()=>{
 const f=createUpgradeFixture();const meta=await f.send('Y/GetSocialState');assert.equal(meta.PersistentPosts,false);assert.match(meta.Session,/synthetic/);
 await assert.rejects(f.send('Y/TogglePremium'),/live FiveM/);
});
