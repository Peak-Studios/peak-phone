import test from 'node:test';
import assert from 'node:assert/strict';
import {MessagesApp,webmDataUri} from '../../web/public/duo/messages-app.mjs';

const validWebM=Uint8Array.from([0x1a,0x45,0xdf,0xa3]);
function makeApp(){
 const app=Object.create(MessagesApp.prototype);const sent=[];const messages=[];
 Object.assign(app,{alive:true,thread:{kind:'direct',id:'5550000002',title:'Jordan'},threadEpoch:4,recordingGeneration:7,recording:null,recordingTimer:null,voiceReview:null,replyTo:null,context:{identity:'cid-1'},sent,messages,
  isHidden:()=>false,renderThread(){},showRecordingTray(){},notify(message){messages.push(message)},
  send:async(route,payload)=>{sent.push({route,payload});return {Success:true}},loadThread:async()=>{}});
 return app;
}
function recordFor(app){return {thread:{...app.thread},epoch:app.threadEpoch,identity:app.context.identity,generation:app.recordingGeneration,replyTo:17,recorder:null,stream:null,chunks:[new Uint8Array([1])],cancelled:false};}
function installGlobals(values){const old=new Map();for(const [key,value] of Object.entries(values)){old.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});}return()=>{for(const [key,descriptor] of old){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}};}
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};}
function makeStream(){const track={stopped:false,stop(){this.stopped=true}};return {track,getTracks:()=>[track]};}
function recorderFactory({constructorError=null,startError=null}={}){
 const created=[];
 class Recorder{
  static isTypeSupported(type){return type==='audio/webm;codecs=opus'||type==='audio/webm';}
  constructor(stream,options){if(constructorError)throw constructorError;this.stream=stream;this.options=options;this.listeners=new Map();this.state='inactive';created.push(this);}
  addEventListener(type,callback){const listeners=this.listeners.get(type)||[];listeners.push(callback);this.listeners.set(type,listeners);}
  start(){if(startError)throw startError;this.state='recording';}
  stop(){this.state='inactive';this.emit('stop');}
  emit(type,event={}){for(const callback of this.listeners.get(type)||[])callback(event);}
 }
 return {Recorder,created};
}

test('voice encoder enforces a WebM EBML header and the bounded raw size',()=>{
 assert.equal(webmDataUri(validWebM),'data:audio/webm;base64,GkXfow==');
 assert.throws(()=>webmDataUri(Uint8Array.from([0,0,0,0])),/WebM header/);
 const oversized=new Uint8Array(54001);oversized.set(validWebM);
 assert.throws(()=>webmDataUri(oversized),/too large/);
});

test('cancelling while getUserMedia is pending stops tracks returned afterward',async()=>{
 const pending=deferred();let stopped=0,constructed=0;
 class Recorder{static isTypeSupported(){return true}constructor(){constructed++;}}
 const restore=installGlobals({MediaRecorder:Recorder,navigator:{mediaDevices:{getUserMedia:()=>pending.promise}}});
 try{
  const app=makeApp();const starting=app.startRecording();const record=app.recording;assert.ok(record);app.stopRecording(true);
  pending.resolve({getTracks:()=>[{stop(){stopped++;}}]});await starting;
  assert.equal(stopped,1);assert.equal(constructed,0);assert.equal(app.recording,null);assert.equal(app.voiceReview,null);assert.equal(app.sent.length,0);
 }finally{restore();}
});

test('switching threads during Blob.arrayBuffer prevents a stale voice preview',async()=>{
 const pending=deferred();const app=makeApp();const record=recordFor(app);app.recording=record;
 class DeferredBlob{constructor(){this.size=4}arrayBuffer(){return pending.promise}}
 const restore=installGlobals({Blob:DeferredBlob});
 try{
  const finishing=app.finishRecording(record);app.thread={kind:'direct',id:'5550000003',title:'A different chat'};
  pending.resolve(validWebM.buffer);await finishing;
  assert.equal(app.voiceReview,null);assert.equal(app.sent.length,0);
 }finally{restore();}
});

test('finishing records a review only; transport runs only after explicit send',async()=>{
 const app=makeApp();const record=recordFor(app);app.recording=record;
 class ImmediateBlob{constructor(){this.size=4}async arrayBuffer(){return validWebM.buffer}}
 const restore=installGlobals({Blob:ImmediateBlob});
 try{
  await app.finishRecording(record);
  assert.ok(app.voiceReview);assert.equal(app.sent.length,0,'recording stop never sends by itself');
  await app.sendVoiceReview();
  assert.equal(app.sent.length,1);assert.equal(app.sent[0].route,'Messages/SendMessage');
  assert.equal(app.sent[0].payload.Phone,'5550000002');assert.equal(app.sent[0].payload.ReplyTo,17);assert.equal(app.voiceReview,null);
 }finally{restore();}
});

test('microphone startup constructs and starts MediaRecorder with the selected WebM MIME type',async()=>{
 const stream=makeStream(),factory=recorderFactory();
 const restore=installGlobals({MediaRecorder:factory.Recorder,navigator:{mediaDevices:{getUserMedia:async()=>stream}}});
 try{
  const app=makeApp();await app.startRecording();
  assert.equal(factory.created.length,1);assert.equal(factory.created[0].options.mimeType,'audio/webm;codecs=opus');assert.equal(factory.created[0].state,'recording');
  assert.equal(app.recording.recorder,factory.created[0]);assert.equal(app.recording.starting,false);assert.deepEqual(app.messages,[]);
  app.stopRecording(true);assert.equal(stream.track.stopped,true);
 }finally{restore();}
});

test('denied microphone permission produces actionable feedback without leaving a recording active',async()=>{
 const denied=Object.assign(new Error('permission denied'),{name:'NotAllowedError'});
 const restore=installGlobals({MediaRecorder:recorderFactory().Recorder,navigator:{mediaDevices:{getUserMedia:async()=>{throw denied;}}}});
 try{
  const app=makeApp();await app.startRecording();
  assert.deepEqual(app.messages,['Allow microphone access to record a voice message.']);assert.equal(app.recording,null);assert.equal(app.recordingGeneration,9);
 }finally{restore();}
});

test('MediaRecorder construction failure releases the microphone and reports the startup error',async()=>{
 const stream=makeStream(),factory=recorderFactory({constructorError:new Error('constructor failed')});
 const restore=installGlobals({MediaRecorder:factory.Recorder,navigator:{mediaDevices:{getUserMedia:async()=>stream}}});
 try{
  const app=makeApp();await app.startRecording();
  assert.equal(stream.track.stopped,true);assert.equal(app.recording,null);assert.equal(app.messages.length,1);assert.match(app.messages[0],/microphone/i);
 }finally{restore();}
});

test('MediaRecorder start failure stops its stream and reports the startup error',async()=>{
 const stream=makeStream(),factory=recorderFactory({startError:new Error('start failed')});
 const restore=installGlobals({MediaRecorder:factory.Recorder,navigator:{mediaDevices:{getUserMedia:async()=>stream}}});
 try{
  const app=makeApp();await app.startRecording();
  assert.equal(factory.created.length,1);assert.equal(stream.track.stopped,true);assert.equal(app.recording,null);assert.equal(app.messages.length,1);assert.match(app.messages[0],/microphone/i);
 }finally{restore();}
});

test('a permission rejection after manual cancellation stays quiet',async()=>{
 const pending=deferred(),denied=Object.assign(new Error('permission denied'),{name:'NotAllowedError'});
 const restore=installGlobals({MediaRecorder:recorderFactory().Recorder,navigator:{mediaDevices:{getUserMedia:()=>pending.promise}}});
 try{
  const app=makeApp(),starting=app.startRecording();app.stopRecording(true);pending.reject(denied);await starting;
  assert.deepEqual(app.messages,[]);assert.equal(app.recording,null);
 }finally{restore();}
});

test('a permission rejection after the conversation changes stays quiet',async()=>{
 const pending=deferred(),denied=Object.assign(new Error('permission denied'),{name:'NotAllowedError'});
 const restore=installGlobals({MediaRecorder:recorderFactory().Recorder,navigator:{mediaDevices:{getUserMedia:()=>pending.promise}}});
 try{
  const app=makeApp(),starting=app.startRecording();app.thread={kind:'direct',id:'5550000003',title:'Another chat'};app.threadEpoch++;pending.reject(denied);await starting;
  assert.deepEqual(app.messages,[]);assert.equal(app.recording,null);
 }finally{restore();}
});

test('a delayed error from a cancelled recorder cannot cancel or report against its replacement',async()=>{
 const first=makeStream(),second=makeStream(),streams=[first,second],factory=recorderFactory();
 const restore=installGlobals({MediaRecorder:factory.Recorder,navigator:{mediaDevices:{getUserMedia:async()=>streams.shift()}}});
 try{
  const app=makeApp();await app.startRecording();const oldRecord=app.recording,oldRecorder=oldRecord.recorder;app.stopRecording(true);
  await app.startRecording();const newRecord=app.recording;oldRecorder.emit('error');
  assert.equal(app.recording,newRecord);assert.equal(newRecord.cancelled,false);assert.equal(second.track.stopped,false);assert.deepEqual(app.messages,[]);
  app.stopRecording(true);assert.equal(second.track.stopped,true);
 }finally{restore();}
});

test('incoming refresh releases replaced voice players while preserving composer audio and recording',async()=>{
 const app=makeApp(),removed=[],released=[];
 app.audioNodes=new Set();app.pendingMedia=new Set();app.audioReleases=new Map();app.messages=new Map();
 const scroller={scrollTop:12,scrollHeight:400,clientHeight:200,isConnected:true,contains:audio=>audio.inMessages,replaceChildren(){assert.equal([...app.audioNodes].filter(a=>a.inMessages).length,1);}};
 app.element={querySelector:()=>scroller};app.data=async()=>({Messages:[]});
 const addAudio=(name,inMessages)=>{const audio={name,inMessages,pause(){removed.push(name)},removeAttribute(){},load(){}};const release=()=>released.push(name);app.audioNodes.add(audio);app.pendingMedia.add(release);app.audioReleases.set(audio,release);return audio;};
 const reviewAudio=addAudio('review',false);addAudio('old',true);let generation=0;
 app.buildMessageList=()=>{assert.equal([...app.audioNodes].filter(a=>a.inMessages).length,0,'old players are released before new players register');addAudio('fresh'+(++generation),true);return {};};
 const recording={active:true},review={uri:'review'},draft={value:'unfinished message'};app.recording=recording;app.voiceReview=review;app.draft=draft;
 const restore=installGlobals({requestAnimationFrame:callback=>callback()});
 try{
  assert.equal(await app.refreshActiveThread(),true);assert.equal(await app.refreshActiveThread(),true);
  assert.deepEqual(removed,['old','fresh1']);assert.deepEqual(released,['old','fresh1']);
  assert.equal(app.audioNodes.size,2);assert.equal(app.pendingMedia.size,2);assert.equal(app.audioReleases.size,2);assert.ok(app.audioNodes.has(reviewAudio));
  assert.equal(app.recording,recording);assert.equal(app.voiceReview,review);assert.equal(app.draft,draft);
  app.clearThreadAudio();assert.equal(app.pendingMedia.size,0);assert.equal(app.audioNodes.size,0);assert.equal(app.audioReleases.size,0);assert.ok(released.includes('review'));
 }finally{restore();}
});
