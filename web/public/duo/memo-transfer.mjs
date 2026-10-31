const MAX_BYTES=8*1024*1024,CHUNK=49152;
let queue=Promise.resolve();
// All app and world-player transfers share a queue to respect server rate limits.
function request(checked,route,data){const result=queue.then(async()=>{await new Promise(resolve=>setTimeout(resolve,110));return checked('VoiceMemos/'+route,data);});queue=result.catch(()=>{});return result;}
export function validateMemoMetadata(meta){if(!/^MEMO-[a-f0-9]{32}$/.test(meta?.MemoId)||!Number.isInteger(meta.SizeBytes)||meta.SizeBytes<4||meta.SizeBytes>MAX_BYTES||meta.Mime!=='audio/webm'||!Number.isInteger(meta.Chunks)||meta.Chunks!==Math.ceil(Math.ceil(meta.SizeBytes/3)*4/CHUNK)||typeof meta.Ticket!=='string'||!meta.Ticket)throw Error('The recording response is invalid.');return meta;}
export async function ensureUploaded(row,checked,{alive=()=>true}={}){
 if(!(row?.blob instanceof Blob)||row.blob.size<4||row.blob.size>MAX_BYTES)throw Error('Choose a recording up to 8 MB.');
 const bytes=new Uint8Array(await row.blob.arrayBuffer());if(bytes[0]!==0x1a||bytes[1]!==0x45||bytes[2]!==0xdf||bytes[3]!==0xa3)throw Error('This recording is not supported WebM audio.');
 const duration=Math.round(Number(row.durationMs??row.duration));if(!Number.isInteger(duration)||duration<1||duration>1200000)throw Error('Choose a recording up to 20 minutes.');
 const begin=await request(checked,'BeginUpload',{OperationId:'memo-'+row.id,Name:String(row.name||'Recording').slice(0,100),Mime:'audio/webm',SizeBytes:bytes.length,DurationMs:duration});if(begin.MemoId)return begin;
 if(!/^MEMO-[a-f0-9]{32}$/.test(begin.UploadId)||begin.ChunkSize!==CHUNK)throw Error('The recording upload response is invalid.');
 let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));const encoded=btoa(binary);
 try{
 for(let index=0;index*CHUNK<encoded.length;index++){if(!alive())throw Error('Recording upload cancelled.');await request(checked,'UploadChunk',{UploadId:begin.UploadId,Index:index,Data:encoded.slice(index*CHUNK,(index+1)*CHUNK)});}
 if(!alive())throw Error('Recording upload cancelled.');return await request(checked,'CompleteUpload',{UploadId:begin.UploadId});
 }catch(error){await request(checked,'AbortUpload',{UploadId:begin.UploadId}).catch(()=>{});throw error;}
}
export async function downloadMemo(metadata,checked,{alive=()=>true,onDescribe}={}){
 const meta=validateMemoMetadata(await request(checked,'Describe',{MemoId:metadata.MemoId??metadata.id,...(metadata.SessionId?{SessionId:metadata.SessionId}:{})}));let encoded='';
 onDescribe?.(meta);
 for(let index=0;index<meta.Chunks;index++){if(!alive())throw Error('Recording download cancelled.');const result=await request(checked,'GetChunk',{Ticket:meta.Ticket,Index:index});const expected=Math.min(CHUNK,Math.ceil(meta.SizeBytes/3)*4-index*CHUNK);if(typeof result.Data!=='string'||result.Data.length!==expected||!/^[A-Za-z0-9+/]+=*$/.test(result.Data))throw Error('The recording data is invalid.');encoded+=result.Data;}
 const binary=atob(encoded);if(binary.length!==meta.SizeBytes)throw Error('The recording is incomplete.');const bytes=Uint8Array.from(binary,char=>char.charCodeAt(0));if(bytes[0]!==0x1a||bytes[1]!==0x45||bytes[2]!==0xdf||bytes[3]!==0xa3)throw Error('This recording is not supported WebM audio.');return new Blob([bytes],{type:meta.Mime});
}
