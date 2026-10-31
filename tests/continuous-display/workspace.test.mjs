import {test} from 'node:test';import assert from 'node:assert/strict';
import {initialWorkspace,reduceWorkspace as R,visibleApps,isPaneVisible} from '../../web/public/duo/workspace.mjs';
import {recordingMime} from '../../web/public/duo/recording-service.mjs';
import {gameCaptureUV} from '../../web/public/duo/game-capture.mjs';
import {RECORDING_LIMITS,RecordingStore} from '../../web/public/duo/recording-store.mjs';
import {orientationFrames} from '../../web/public/duo/orientation-motion.mjs';
import {FoldMotion} from '../../web/public/duo/fold-motion.mjs';

test('fold reversal follows painted animation time including pending, paused and finished poses',()=>{
 for(const [from,to,currentTime,expected] of [[0,1,null,0],[1,0,0,1],[0,1,190,.25],[1,0,380,.5],[0,1,760,1]]){
  const root={dataset:{expanded:'false'},classList:{remove(){}}},bank={style:{removeProperty(){}}};
  const motion=new FoldMotion(root,bank);
  motion.transition={from,to,duration:760,start:performance.now()-500,animation:{currentTime}};
  motion.cancel();assert.equal(motion.phase,expected);assert.equal(motion.transition,null);
 }
});
const pair=()=>R(R(initialWorkspace(true,'full'),{type:'OPEN',app:'messages',side:'left'}),{type:'OPEN',app:'mails',side:'right'});
test('quarter-turn frames fit the rotated rectangle at every phase on small and wide viewports',()=>{
 for(const viewport of [{width:390,height:844},{width:1280,height:720},{width:2560,height:1080}])for(const angle of [-90,90]){
  const width=viewport.height*.55,height=viewport.height*.8,to={x:viewport.width-width/2-24,y:viewport.height-height/2-24};
  const frames=orientationFrames({angle,scaleX:1.035,scaleY:1.035,from:to,to,width,height,viewport});
  assert.equal(frames.length,61);
  for(const frame of frames){
   const parts=frame.transform.match(/translate\(([-.\d]+)px,([-.\d]+)px\) rotate\(([-.\d]+)deg\) scale\(([-.\d]+),([-.\d]+)\)/);
   assert.ok(parts);const [,dx,dy,turn,sx,sy]=parts.map(Number),r=turn*Math.PI/180;
   const w=width*sx*Math.abs(Math.cos(r))+height*sy*Math.abs(Math.sin(r)),h=width*sx*Math.abs(Math.sin(r))+height*sy*Math.abs(Math.cos(r));
   assert.ok(to.x+dx-w/2>=15.99&&to.x+dx+w/2<=viewport.width-15.99);
   assert.ok(to.y+dy-h/2>=15.99&&to.y+dy+h/2<=viewport.height-15.99);
   assert.ok(Math.abs(sx/sy-1)<.001,'viewport fitting uses uniform scale');
  }
  assert.ok(frames[0].transform.includes(`rotate(${angle}deg)`));assert.ok(frames.at(-1).transform.includes('rotate(0deg)'));
 }
});
test('expanded full screen shows only focused app and retains the other',()=>{const s=pair();assert.deepEqual(visibleApps(s),['mails']);assert.equal(s.panes.left.app,'messages');assert.equal(isPaneVisible(s,'left'),false);});
test('switch to split shows both without changing app state',()=>{const s=pair(),n=R(s,{type:'LAYOUT',value:'split'});assert.deepEqual(n.panes,s.panes);assert.deepEqual(visibleApps(n),['messages','mails']);});
test('folded split becomes one full cover workspace',()=>{const s=R(R(pair(),{type:'LAYOUT',value:'split'}),{type:'TOGGLE'});assert.deepEqual(visibleApps(s),['mails']);assert.equal(s.layout,'split');assert.deepEqual(visibleApps(R(s,{type:'TOGGLE'})),['messages','mails']);});
test('move into occupied pane swaps rather than duplicates or destroys',()=>{const s=R(pair(),{type:'MOVE',from:'left',side:'right'});assert.equal(s.panes.right.app,'messages');assert.equal(s.panes.left.app,'mails');assert.equal(s.active,'right');});
test('moving to same pane is a no-op on content',()=>{const s=pair();assert.deepEqual(R(s,{type:'MOVE',from:'right',side:'right'}).panes,s.panes);});
test('ratio clamps at 40/60 and ignores malformed input',()=>{for(const [v,expected]of [[0,.4],[1,.6],[.55,.55]])assert.equal(R(pair(),{type:'RATIO',value:v}).ratio,expected);for(const value of [NaN,Infinity,'0.4',null])assert.equal(R(pair(),{type:'RATIO',value}).ratio,.5);});
test('reset clears character apps but keeps display preferences',()=>{const s=R(R(pair(),{type:'RATIO',value:.6}),{type:'RESET'});assert.equal(s.ratio,.6);assert.equal(s.layout,'full');assert.equal(s.panes.left.app,null);assert.equal(s.panes.right.app,null);});
test('invalid layout does not corrupt workspace',()=>assert.equal(R(pair(),{type:'LAYOUT',value:'invalid'}).layout,'full'));
test('reducers never mutate input state',()=>{const s=pair(),before=JSON.stringify(s);for(const action of [{type:'LAYOUT',value:'split'},{type:'MOVE',side:'left'},{type:'RATIO',value:.6},{type:'RESET'}])R(s,action);assert.equal(JSON.stringify(s),before);});
test('hidden phone has no visible apps in either mode',()=>{assert.deepEqual(visibleApps(pair(),false),[]);assert.deepEqual(visibleApps(R(pair(),{type:'LAYOUT',value:'split'}),false),[]);});
test('codec negotiation follows whether the composed stream contains live audio',()=>{const seen=[];const Recorder={isTypeSupported:t=>{seen.push(t);return true;}};assert.equal(recordingMime(Recorder),'video/webm;codecs=vp8');assert.deepEqual(seen,['video/webm;codecs=vp8']);seen.length=0;assert.equal(recordingMime(Recorder,{audio:true}),'video/webm;codecs=vp8,opus');assert.deepEqual(seen,['video/webm;codecs=vp8,opus']);assert.equal(recordingMime({isTypeSupported:t=>t==='video/webm'}),'video/webm');});
test('missing encoder fails closed',()=>{assert.throws(()=>recordingMime({}),/not supported/);assert.throws(()=>recordingMime({isTypeSupported:()=>false}),/No supported/);});
test('saved recordings use upright texture coordinates without changing the live-call default',()=>{assert.deepEqual(gameCaptureUV(false),[0,0,1,0,0,1,1,1]);assert.deepEqual(gameCaptureUV(),[0,1,1,1,0,0,1,0]);});
test('video limits are bounded and immutable',()=>{assert.equal(RECORDING_LIMITS.seconds,60);assert.equal(RECORDING_LIMITS.count,20);assert.ok(RECORDING_LIMITS.clipBytes<=24*1024*1024);assert.ok(Object.isFrozen(RECORDING_LIMITS));});
test('storage validates owner/type/size before touching database',async()=>{const s=new RecordingStore();await assert.rejects(s.save('',new Blob(['x'],{type:'video/webm'})),/Open a character/);await assert.rejects(s.save('a',new Blob(['x'],{type:'text/html'})),/no playable/);await assert.rejects(s.save('a',new Blob([new Uint8Array(RECORDING_LIMITS.clipBytes+1)],{type:'video/webm'})),/24 MB/);});
