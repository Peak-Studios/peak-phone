/** Run from the resource directory: node --test tools/test-ui-atlas.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {dateKey,localDateTime,monthCells,validEvents,displayDuration} from '../web/public/duo/calendar-core.mjs';
import {project,unproject,validPoint,parseCoordinates,distance,validRoute} from '../web/public/duo/map-core.mjs';
import {MAP_CONFIG} from '../web/public/duo/map-config.mjs';
import {moveHomeItem} from '../web/public/duo/home-editor-app.mjs';
import {MemoStore} from '../web/public/duo/memo-store.mjs';
import {APPS,availableApps} from '../web/public/duo/catalog.mjs';
import {appIcon} from '../web/public/duo/ios-icons.mjs';
import {readLocal,writeLocal,collectionKey} from '../web/public/duo/native-kit.mjs';

test('calendar uses local components, not a UTC-sliced datetime',()=>{
 const d=new Date(2028,1,29,23,45);assert.equal(dateKey(d),'2028-02-29');assert.equal(localDateTime(d),'2028-02-29T23:45');
});
test('leap February produces 42 continuous cells including 29 days in month',()=>{
 const rows=monthCells(2028,1);assert.equal(rows.length,42);assert.equal(rows.filter(r=>r.inMonth).length,29);assert.equal(rows[0].date.getDay(),0);assert.equal(new Set(rows.map(r=>r.key)).size,42);
 for(let i=1;i<rows.length;i++){const d=new Date(rows[i-1].date);d.setDate(d.getDate()+1);assert.equal(rows[i].key,dateKey(d));}
});
test('non-leap February and year boundaries',()=>{
 assert.equal(monthCells(2027,1).filter(r=>r.inMonth).length,28);assert.ok(monthCells(2027,0).some(r=>r.key.startsWith('2026-12')));
 assert.ok(monthCells(2027,11).some(r=>r.key.startsWith('2028-01')));
});
test('invalid stored calendar events cannot crash rendering',()=>{
 const good={id:'existing',title:'Appointment',at:'2027-05-04T10:00',notes:'Preserved'};
 assert.deepEqual(validEvents([null,1,{}, {...good,at:'bad'},good]),[good]);assert.deepEqual(validEvents({}),[]);
});
test('stopwatch and timer formatting handles long and negative durations',()=>{
 assert.equal(displayDuration(-1),'00:00');assert.equal(displayDuration(61550,true),'01:01.55');assert.equal(displayDuration(3661000),'01:01:01');
});
test('atlas origin matches the upstream transform',()=>assert.deepEqual(project({x:0,y:0},0),{x:117.3,y:172.8}));
test('atlas projection round-trips real places at every zoom, including fractional zoom',()=>{
 for(const z of [0,1,2,3,3.7,4,5])for(const p of MAP_CONFIG.places){const r=unproject(project(p,z),z);assert.ok(Math.abs(p.x-r.x)<1e-8);assert.ok(Math.abs(p.y-r.y)<1e-8);}
});
test('GTA north projects upward, east projects right',()=>{const a=project({x:0,y:0}),b=project({x:10,y:10});assert.ok(b.x>a.x);assert.ok(b.y<a.y);});
test('coordinate input validates rather than interpreting arbitrary markup or URLs',()=>{
 assert.deepEqual(parseCoordinates(' 215.8, -810.1 '),{x:215.8,y:-810.1});assert.deepEqual(parseCoordinates('-12;35'),{x:-12,y:35});
 for(const s of ['NaN, 0','Infinity, 0','16001, 0','<script>','https://example.com','1,2,3'])assert.equal(parseCoordinates(s),null);
 assert.equal(validPoint({x:NaN,y:0}),false);assert.equal(validPoint({x:'1',y:2}),false);
});
test('distance is actual Euclidean world distance, not a claimed driving ETA',()=>{assert.equal(distance({x:0,y:0},{x:3,y:4}),5);assert.equal(distance(null,{}),null);});
test('GPS route drawing rejects invalid points and is bounded to 384 samples',()=>{assert.equal(validRoute(Array.from({length:500},(_,i)=>({x:i,y:i}))).length,384);assert.deepEqual(validRoute([null,{x:1,y:2}]),[{x:1,y:2}]);});
test('atlas uses the pinned source or local vendored tiles, and destinations have real numeric coordinates',()=>{
 assert.ok(MAP_CONFIG.tileTemplate.includes('00e4c30b797aa3993435664769a905c14224a1a2') || MAP_CONFIG.tileTemplate === './duo/map-atlas/{z}/{x}/{y}.jpg');assert.equal(MAP_CONFIG.tileSize,256);assert.ok(MAP_CONFIG.places.every(validPoint));
});
test('home reorder preserves unique IDs and does not mutate the previous layout',()=>{
 const initial=['a','b','c'];assert.deepEqual(moveHomeItem(initial,'c','a'),['c','a','b']);assert.deepEqual(initial,['a','b','c']);assert.deepEqual(moveHomeItem(initial,'a','missing'),['b','c','a']);
});
test('admin-only Job Creator remains permission gated',()=>{assert.equal(availableApps({capabilities:{}}).some(a=>a.id==='jobcreator'),false);assert.equal(availableApps({capabilities:{jobcreator:{available:true}}}).some(a=>a.id==='jobcreator'),true);});
test('every catalog app has a distinct SVG icon without remote or font assets',()=>{
 const gradientIds=new Set();for(const app of APPS){const svg=appIcon(app);assert.match(svg,/class="ios-app-icon"/);assert.doesNotMatch(svg,/<image|https?:|<svg x="15"/);const id=svg.match(/id="(ic-[^"]+)"/)[1];assert.ok(!gradientIds.has(id));gradientIds.add(id);}
 assert.equal(gradientIds.size,APPS.length);
});
test('local utility storage remains server/character scoped and reports quota failures',()=>{
 const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v)};
 const a={server:'one',identity:'character'},b={server:'two',identity:'character'};assert.notEqual(collectionKey(a,'timers'),collectionKey(b,'timers'));
 assert.equal(writeLocal(a,'timers',[1]),true);assert.deepEqual(readLocal(a,'timers',[]),[1]);assert.deepEqual(readLocal(b,'timers',[]),[]);
 globalThis.localStorage.setItem=()=>{throw Error('quota');};assert.equal(writeLocal(a,'timers',[2]),false);delete globalThis.localStorage;
});
test('memo writes resolve at transaction commit, not merely request success',async()=>{
 const request={},tx={objectStore:()=>({put:()=>request})};const store=new MemoStore();store.db=async()=>({transaction:()=>tx});let complete=false;
 const pending=store.put({id:'one'}).then(()=>{complete=true;});await Promise.resolve();request.result='one';request.onsuccess();await Promise.resolve();assert.equal(complete,false);tx.oncomplete();await pending;assert.equal(complete,true);
});
test('memo transaction abort rejects even after request success',async()=>{
 const request={},tx={objectStore:()=>({put:()=>request}),error:Error('quota')};const store=new MemoStore();store.db=async()=>({transaction:()=>tx});const pending=store.put({id:'one'});await Promise.resolve();request.onsuccess();tx.onabort();await assert.rejects(pending,/quota/);
});
test('memo storage can retry after a synchronous IndexedDB opening failure',async()=>{
 let calls=0;const db={};const store=new MemoStore({open(){calls++;if(calls===1)throw Error('denied');const req={result:db};queueMicrotask(()=>req.onsuccess());return req;}});
 await assert.rejects(store.db(),/denied/);assert.equal(await store.db(),db);assert.equal(calls,2);
});
test('memo listing preserves the original owner and blob contract',async()=>{
 const store=new MemoStore();const rows=[{owner:'a',id:'old',createdAt:1,blob:new Blob(['old'])},{owner:'a',id:'new',createdAt:2,blob:new Blob(['new'])},{owner:'b',blob:new Blob(['private'])},{owner:'a',blob:'not audio'}];store.transaction=async()=>rows;
 assert.deepEqual((await store.all('a')).map(r=>r.id),['new','old']);
});
test('CEF transparency safeguards remain the last stylesheet',async()=>{
 const text=await readFile(new URL('../web/public/index.html',import.meta.url),'utf8');const styles=[...text.matchAll(/<link[^>]+href="([^"]+\.css)"/g)].map(m=>m[1]);assert.equal(styles.at(-1),'./duo/nui-safe.css');assert.ok(styles.indexOf('./duo/native-refresh.css')<styles.length-1);
});
