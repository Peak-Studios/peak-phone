import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import { PhoneMediaOutput } from '../../web/public/duo/media-output.mjs';
const saved=new Map();const storage={getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v)};
class Media extends EventTarget {
  constructor(volume=1){super();this.value=volume;this.muted=true;}
  get volume(){return this.value;}
  set volume(value){this.value=value;this.dispatchEvent(new Event('volumechange'));}
}
const output=new PhoneMediaOutput({storage});output.selectDevice('server:character:phone');
const feed=new Media(),remoteCall=new Media(.6);output.register(feed);output.register(remoteCall);
assert.equal(feed.volume,.7);assert.equal(remoteCall.volume,.42);assert.equal(feed.muted,true);
output.setVolume(.5);assert.equal(feed.volume,.5);assert.equal(remoteCall.volume,.3);
remoteCall.volume=1;assert.equal(remoteCall.volume,.5);
output.step(1);assert.equal(feed.volume,.55);assert.equal(remoteCall.volume,.55);
output.setVolume(0);assert.equal(feed.volume,0);assert.equal(remoteCall.volume,0);
output.setVolume(.4);output.setPowered(false);assert.equal(feed.volume,0);assert.equal(remoteCall.volume,0);
const late=new Media();output.register(late);assert.equal(late.volume,0);
output.setPowered(true);assert.equal(late.volume,.4);assert.equal(feed.volume,.4);assert.equal(feed.muted,true);
output.setVolume(5);assert.equal(output.volume,1);output.setVolume(-5);assert.equal(output.volume,0);
assert.equal(output.setVolume(NaN),false);assert.equal(output.setPowered('false'),false);
output.setVolume(.25);output.setPowered(false);output.selectDevice('other-phone');assert.equal(output.volume,.7);assert.equal(output.powered,true);
output.selectDevice('server:character:phone');assert.equal(output.volume,.25);assert.equal(output.powered,false);
output.unregister(feed);output.setVolume(.9);assert.equal(feed.volume,0);
const sent=[];let release;const queued=new PhoneMediaOutput({storage,send:async(_,data)=>{sent.push(data);await new Promise(resolve=>release=resolve);return {Success:true};}});
queued.setVolume(.1);queued.setVolume(.2);queued.setVolume(.3);queued.setPowered(false);
assert.equal(sent.length,1);release();await new Promise(resolve=>setImmediate(resolve));
assert.equal(sent.length,2);assert.deepEqual(sent[1],{Volume:.3,Powered:false});release();
console.log('PASS phone audio: scaling, app mute, zero, power, new media, external levels, identity persistence, cleanup and latest output delivery');


// A rejected in-flight request must not strand a newer volume/power snapshot.
const deliveries=[];let rejectFirst;
const resilient=new PhoneMediaOutput({storage,send:async(_,data)=>{
  deliveries.push(data);
  if(deliveries.length===1)await new Promise((_,reject)=>rejectFirst=reject);
  return {Success:true};
}});
let errors=0;resilient.addEventListener('error',()=>errors++);
resilient.setVolume(.2);resilient.setVolume(.8);resilient.setPowered(false);
rejectFirst(Error('temporary transport failure'));
await new Promise(resolve=>setImmediate(resolve));
assert.equal(errors,1);assert.equal(deliveries.length,2);
assert.deepEqual(deliveries[1],{Volume:.8,Powered:false});
assert.equal(resilient.sending,false);assert.equal(resilient.pending,false);
resilient.destroy();resilient.setVolume(.4);assert.equal(deliveries.length,2);

// Native start events arriving late cannot reacquire capture or microphone.
const {VideoService}=await import('../../web/public/duo/video-service.mjs');
const {phoneMedia}=await import('../../web/public/duo/media-output.mjs');
let captures=0,microphones=0;
const video=new VideoService({send:async()=>({Success:true}),captureFactory:()=>{captures++;throw Error('unexpected capture');},getMicrophone:()=>{microphones++;throw Error('unexpected microphone');}});
phoneMedia.setPowered(false);
await video.handle({Action:'Video/Start',CallId:'late',AudioMode:'webrtc'});
await video.start({CallId:'late-direct',AudioMode:'webrtc'});
assert.equal(captures,0);assert.equal(microphones,0);assert.equal(video.session,null);
video.destroy();phoneMedia.setPowered(true);
console.log('PASS review regressions: failure drain, destroyed output, power-off capture guard');

test('exterior caps use opposite edges and rotate onto the landscape frame',()=>{
 const css=readFileSync(new URL('../../web/public/duo/hardware-controls.css',import.meta.url),'utf8');
 assert.match(css,/\.duo-chassis>\.duo-volume-up\{left:-1\.2vh;right:auto/);
 assert.match(css,/\.duo-chassis>\.duo-volume-down\{left:-1\.2vh;right:auto/);
 assert.match(css,/\.duo-chassis>\.duo-side-power\{left:auto;right:-1\.2vh/);
 assert.match(css,/#duo\[data-expanded=true\]\[data-orientation=landscape\] \.duo-chassis>\.duo-side-button:before\{[^}]*height:\.26vh/);
});
