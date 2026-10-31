import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureUploaded,downloadMemo,validateMemoMetadata} from '../../web/public/duo/memo-transfer.mjs';
import {initWorldMemoPlayback} from '../../web/public/duo/memo-world-player.mjs';
const id='MEMO-'+'a'.repeat(32),bytes=new Uint8Array([0x1a,0x45,0xdf,0xa3]);
test('memo upload reserves then sends bounded chunks and commits without a public URL',async()=>{
 const calls=[];const result=await ensureUploaded({id:'local-one',name:'Note',duration:1000,blob:new Blob([bytes])},async(route,data)=>{calls.push({route,data});return route.endsWith('BeginUpload')?{Success:true,UploadId:id,ChunkSize:49152}:route.endsWith('CompleteUpload')?{Success:true,MemoId:id}:{Success:true};});
 assert.equal(result.MemoId,id);assert.deepEqual(calls.map(c=>c.route),['VoiceMemos/BeginUpload','VoiceMemos/UploadChunk','VoiceMemos/CompleteUpload']);assert.equal(calls[1].data.Data,'GkXfow==');assert.equal(calls[0].data.SizeBytes,4);
});
test('memo downloads validate length, format and chunk count before decoding',async()=>{
 assert.throws(()=>validateMemoMetadata({MemoId:id,SizeBytes:9000000,Mime:'audio/webm',Chunks:1,Ticket:'ticket'}));
 const checked=async(route)=>route.endsWith('Describe')?{MemoId:id,SizeBytes:4,Mime:'audio/webm',Chunks:1,Ticket:'ticket'}:{Data:'GkXfow=='};
 const blob=await downloadMemo({id},checked);assert.equal(blob.type,'audio/webm');assert.deepEqual(new Uint8Array(await blob.arrayBuffer()),bytes);
 await assert.rejects(downloadMemo({id},async(route)=>route.endsWith('Describe')?{MemoId:id,SizeBytes:4,Mime:'audio/webm',Chunks:1,Ticket:'ticket'}:{Data:'AAAAAAAA'}),/incomplete/);
});
test('identity/app cancellation stops upload before sending audio',async()=>{
 let calls=0;await assert.rejects(ensureUploaded({id:'cancel',duration:1000,blob:new Blob([bytes])},async()=>{calls++;return {UploadId:id,ChunkSize:49152};},{alive:()=>false}),/cancelled/);assert.equal(calls,2);
});
test('world audio survives phone close but stops and revokes URLs when server removes session',async()=>{
 const target=new EventTarget(),created=[],revoked=[];
 class FakeAudio extends EventTarget{constructor(){super();this.duration=10;this.currentTime=0;this.paused=true;}play(){this.paused=false;return Promise.resolve();}pause(){this.paused=true;}removeAttribute(){}load(){if(this.src)this.dispatchEvent(new Event('loadedmetadata'));}}
 const dispose=initWorldMemoPlayback(async(route)=>route.endsWith('Describe')?{Success:true,MemoId:id,SizeBytes:4,Mime:'audio/webm',Chunks:1,Ticket:'ticket'}:{Success:true,Data:'GkXfow=='},{target,audioFactory:()=>{const a=new FakeAudio();created.push(a);return a;},urlAPI:{createObjectURL:()=> 'blob:test',revokeObjectURL:url=>revoked.push(url)}});
 try{target.dispatchEvent(new MessageEvent('message',{data:{Action:'VoiceMemos/PlaybackState',Sessions:[{SessionId:'session',MemoId:id,ElapsedMs:0,DurationMs:10000,Gain:.5}]}}));await new Promise(resolve=>setTimeout(resolve,350));assert.equal(created.length,1);assert.equal(created[0].paused,false);
 created[0].duration=Infinity;target.dispatchEvent(new MessageEvent('message',{data:{Action:'VoiceMemos/PlaybackState',Sessions:[{SessionId:'session',MemoId:id,ElapsedMs:4000,DurationMs:10000,Gain:.2}]}}));assert.equal(created[0].volume,.2);assert.ok(created[0].currentTime>=4);
 target.dispatchEvent(new MessageEvent('message',{data:{Action:'Phone/Close'}}));assert.equal(created[0].paused,false);
 target.dispatchEvent(new MessageEvent('message',{data:{Action:'VoiceMemos/PlaybackState',Sessions:[]}}));assert.equal(created[0].paused,true);assert.deepEqual(revoked,['blob:test']);}finally{dispose();}
});
test('failed world decoding does not redownload the same session on every heartbeat',async()=>{
 const target=new EventTarget();let reads=0;
 class RejectedAudio extends EventTarget{play(){return Promise.reject(Error('Unsupported media'));}pause(){}removeAttribute(){}load(){if(this.src)this.dispatchEvent(new Event('loadedmetadata'));}}
 const dispose=initWorldMemoPlayback(async(route)=>{reads++;return route.endsWith('Describe')?{Success:true,MemoId:id,SizeBytes:4,Mime:'audio/webm',Chunks:1,Ticket:'ticket'}:{Success:true,Data:'GkXfow=='};},{target,audioFactory:()=>new RejectedAudio(),urlAPI:{createObjectURL:()=> 'blob:invalid',revokeObjectURL(){}}});
 const state={Action:'VoiceMemos/PlaybackState',Sessions:[{SessionId:'bad-session',MemoId:id,ElapsedMs:0,DurationMs:10000,Gain:.5}]};
 try{target.dispatchEvent(new MessageEvent('message',{data:state}));await new Promise(resolve=>setTimeout(resolve,350));assert.equal(reads,3);target.dispatchEvent(new MessageEvent('message',{data:state}));await new Promise(resolve=>setTimeout(resolve,150));assert.equal(reads,3);}finally{dispose();}
});
test('short world memos prepare without consuming duration and start without waiting for a heartbeat',async()=>{
 const target=new EventTarget(),audios=[],routes=[],revoked=[];let clock=0;
 class PreparedAudio extends EventTarget{constructor(){super();this.readyState=1;this.duration=.5;this.currentTime=0;this.paused=true;this.plays=0;}play(){this.plays++;this.paused=false;return Promise.resolve();}pause(){this.paused=true;}removeAttribute(){this.src='';}load(){if(this.src)this.dispatchEvent(new Event('loadedmetadata'));}}
 const dispose=initWorldMemoPlayback(async(route)=>{routes.push(route);return route.endsWith('Describe')?{Success:true,MemoId:id,SizeBytes:4,Mime:'audio/webm',Chunks:1,Ticket:'ticket'}:route.endsWith('GetChunk')?{Success:true,Data:'GkXfow=='}:{Success:true};},{target,now:()=>clock,audioFactory:()=>{const audio=new PreparedAudio();audios.push(audio);return audio;},urlAPI:{createObjectURL:()=> 'blob:prepared',revokeObjectURL:url=>revoked.push(url)}});
 const emit=state=>target.dispatchEvent(new MessageEvent('message',{data:{Action:'VoiceMemos/PlaybackState',Sessions:state?[{SessionId:'prepared',MemoId:id,DurationMs:500,Gain:.5,...state}]:[]}}));
 try{emit({Preparing:true,ElapsedMs:0});clock=40000;await new Promise(resolve=>setTimeout(resolve,350));assert.equal(audios.length,1);assert.equal(audios[0].plays,0);assert(routes.includes('VoiceMemos/PlaybackReady'));
 emit({Preparing:false,ElapsedMs:-20});clock+=20;await new Promise(resolve=>setTimeout(resolve,35));assert.equal(audios[0].plays,1);assert.equal(audios[0].currentTime,0,'opening is retained after slow preparation');
 emit(null);assert.equal(audios[0].paused,true);assert.deepEqual(revoked,['blob:prepared']);
 }finally{dispose();}
});
