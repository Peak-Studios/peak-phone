import test from 'node:test';
import assert from 'node:assert/strict';
import { MusicSearch, audiusID, normalizeMusicText, normalizeTrack, rankTracks, decodeTitle, formatDuration, savedTitle } from '../../web/public/duo/music-search.mjs';
const track = (id,title,channel='Artist') => {
 const providerId=String(id).padStart(11,'0');
 return {id:providerId,providerId,provider:'audius',verified:true,title,channel,artwork:`https://creatornode.audius.co/artwork/${providerId}.jpg`,duration:191};
};
const pending = () => { let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject}; };
const original=track(1,'Travis Scott - FE!N (Official Audio)','Travis Scott');
const remix=track(2,'FEIN slowed remix','Remix Channel');

test('Fein ranks FE!N by Travis Scott ahead of remixes and unrelated uploads',()=>{
 const result=rankTracks('Fein',[remix,track(3,'Fein reaction video'),original,track(4,'Another song')]);
 assert.equal(result[0].id,original.id);assert.equal(result[0].title,original.title);
});
test('numbered, close-spelling songs keep the requested number exact',()=>{
 const result=rankTracks('morphiniya 17',[track(1,"L’Morphine - Lmorphiniya 16 (Official Audio)","L’Morphine"),track(2,'morphiniya 17 remix'),track(3,"L’Morphine - Lmorphiniya17 (Official Audio)","L’Morphine")]);
 assert.equal(result[0].id,track(3,'').id);
 assert.equal(rankTracks('morphiniya 17',[track(1,'Morphiniya 170'),track(2,'Lmorphiniya 17')])[0].id,track(2,'').id);
});
test('explicitly requesting a remix prioritizes that version',()=>assert.equal(rankTracks('fein remix',[original,remix])[0].id,remix.id));
test('normalization preserves non-Latin words and handles apostrophes and accents',()=>{
 assert.equal(normalizeMusicText("L’Morphine – FE!N"),'lmorphine fein');
 assert.equal(normalizeMusicText('Beyoncé'), 'beyonce');
 assert.equal(normalizeMusicText('موسيقى 17'), 'موسيقى 17');
 assert.equal(normalizeMusicText('Lmorphiniya17'),'lmorphiniya 17');
});
test('only canonical Audius IDs and HTTPS stream URLs are accepted',()=>{
 const id='abcDEf012';for(const v of [id,`https://api.audius.co/v1/tracks/${id}/stream`,`https://api.audius.co/v1/tracks/${id}/stream?app_name=PeakMusic`])assert.equal(audiusID(v),id);
 for(const v of [`https://api.audius.co.evil.invalid/v1/tracks/${id}/stream`,`https://user@api.audius.co/v1/tracks/${id}/stream`,`http://api.audius.co/v1/tracks/${id}/stream`,`https://api.audius.co:8443/v1/tracks/${id}/stream`,'javascript:alert(1)','bad-id!','https://evil.invalid/v1/tracks/abcdefghijk/stream'])assert.equal(audiusID(v),null);
});
test('Audius tracks require server verification; text and stream URLs are normalized safely',()=>{
 const value=normalizeTrack({...track(1,'&lt;img src=x onerror=alert(1)&gt;'),artwork:'javascript:alert(1)',url:'https://evil.invalid'});
 assert.equal(value.title,'<img src=x onerror=alert(1)>');assert.equal(value.artwork,'');
 assert.equal(value.url,`https://api.audius.co/v1/tracks/${value.id}/stream?app_name=PeakMusic`);
 assert.equal(normalizeTrack({...track(2,'unverified'),verified:false}),null);
 assert.equal(normalizeTrack({...track(3,'wrong provider'),provider:'youtube'}),null);
 assert.equal(normalizeTrack({...track(4,'invalid ID'),providerId:'https://api.audius.co.evil.invalid/v1/tracks/fake/stream'}),null);
 assert.equal(rankTracks('song',[track(1,'Song'),track(1,'Song duplicate'),{id:'evil',title:'Song'},null]).length,1);
 assert.equal(decodeTitle('&#x1F3B5; &amp; &#39;'),"🎵 & '");
 assert.equal(normalizeTrack({id:'bad',title:'test'}),null);
});
test('save compatibility truncates by UTF-8 bytes without corrupting international titles',()=>{
 const title=savedTitle('🎵'.repeat(100));assert.equal(new TextEncoder().encode(title).length,252);assert.equal([...title].length,63);
 assert.equal(savedTitle(original.title),original.title);
});
test('duration formatting is bounded and human readable',()=>{assert.equal(formatDuration(191),'3:11');assert.equal(formatDuration(3661),'1:01:01');assert.equal(formatDuration(0),'');assert.equal(normalizeTrack({...track(1,'s'),duration:-3}).duration,0);});
test('latest query wins even when requests finish out of order',async()=>{
 const a=pending(),b=pending();let count=0;const s=new MusicSearch({send:()=>++count===1?a.promise:b.promise,delay:50000});
 s.setQuery('fein');const first=s.submit();s.setQuery('morphiniya 17');const second=s.submit();b.resolve({Success:true,Tracks:[track(3,'Lmorphiniya17')]});await second;
 a.resolve({Success:true,Tracks:[original]});await first;assert.equal(s.state.query,'morphiniya 17');assert.equal(s.state.tracks[0].id,track(3,'').id);s.destroy();
});
test('clearing a query or destroying the controller ignores an in-flight response',async()=>{
 for(const stop of [s=>s.setQuery(''),s=>s.destroy()]){const d=pending();const s=new MusicSearch({send:()=>d.promise,delay:50000});s.setQuery('fein');const job=s.submit();stop(s);d.resolve({Success:true,Tracks:[original]});await job;assert.deepEqual(s.state.tracks,[]);s.destroy();}
});
test('short and oversized queries never call the server, debouncing emits only the latest',async()=>{
 const calls=[];const s=new MusicSearch({send:async(event,data)=>{calls.push([event,data]);return{Success:true,Tracks:[]};},delay:10});
 for(const q of ['', 'f', 'x'.repeat(121)]){s.setQuery(q);await s.submit();}assert.equal(calls.length,0);
 s.setQuery('fe');s.setQuery('fei');s.setQuery('fein');await new Promise(r=>setTimeout(r,40));assert.deepEqual(calls,[['Peakify/Search',{Query:'fein'}]]);s.destroy();
});
test('API errors, invalid payloads and empty Lua tables have distinct honest states',async()=>{
 for(const response of [{Success:false,Message:'Key missing'},{Success:true,Tracks:42},{Success:true,Tracks:null}]){const s=new MusicSearch({send:async()=>response,delay:50000});s.setQuery('fein');await s.submit();assert.ok(s.state.error);assert.equal(s.state.loading,false);s.destroy();}
 for(const Tracks of [[],{}]){const s=new MusicSearch({send:async()=>({Success:true,Tracks}),delay:50000});s.setQuery('fein');await s.submit();assert.equal(s.state.error,'');assert.deepEqual(s.state.tracks,[]);s.destroy();}
});
