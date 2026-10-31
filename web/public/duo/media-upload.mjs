const operationId=()=>globalThis.crypto?.randomUUID?.()||`upload-${Date.now()}-${Math.random().toString(16).slice(2)}`;
/** Upload a local clip directly to a short-lived provider URL, then ask the
 * server to verify provider metadata. The long-lived provider key never enters NUI. */
export async function uploadRecording({store,owner,clip,send,onProgress=()=>{},signal}){
 if(signal?.aborted)throw new DOMException('Upload aborted','AbortError');
 const blob=await store.get(owner,clip.id),op=clip.uploadOperation||operationId();
 if(!clip.uploadOperation)await store.patch(owner,clip.id,{uploadOperation:op});
 const grant=await send('Media/Begin',{OperationId:op,Mime:blob.type,Size:blob.size,DurationMs:Math.round((clip.duration||0)*1000),Width:clip.width,Height:clip.height});
 if(signal?.aborted)throw new DOMException('Upload aborted','AbortError');
 if(!grant?.Success)throw Error(grant?.Message||'A secure upload could not be started.');
 if(grant.Status==='complete'){await store.patch(owner,clip.id,{uploadOperation:op,hostedMediaId:grant.MediaId,hostedUrl:grant.Url,uploadObjectId:null,uploadStatus:'complete'});onProgress({state:'complete',loaded:blob.size,total:blob.size});return grant;}
 if(grant.Status==='verifying'&&clip.uploadObjectId){
  onProgress({state:'verifying',loaded:blob.size,total:blob.size});
  const result=await send('Media/Finalize',{MediaId:grant.MediaId,ObjectId:clip.uploadObjectId});
  if(!result?.Success)throw Error(result?.Message||'The uploaded clip could not be reconciled.');
  await store.patch(owner,clip.id,{hostedMediaId:result.MediaId,hostedUrl:result.Url,uploadObjectId:null,uploadStatus:'complete'});
  onProgress({state:'complete',loaded:blob.size,total:blob.size});return result;
 }
 if(!grant.UploadUrl)throw Error('Upload reservation requires reconciliation before retrying.');
 await store.patch(owner,clip.id,{uploadObjectId:null,uploadStatus:'uploading'});
 const form=new FormData();form.append('file',blob,`peak-duo-${clip.id}.webm`);form.append('filename',`peak-duo-${clip.id}.webm`);form.append('path','peak-phone/videos');form.append('metadata',JSON.stringify({mediaId:grant.MediaId,operationId:op}));
 onProgress({state:'uploading',loaded:0,total:blob.size});
 const {status,payload}=await new Promise((resolve,reject)=>{const xhr=new XMLHttpRequest();let settled=false,sent=false,abort=()=>{};const settle=(fn,value)=>{if(settled)return;settled=true;signal?.removeEventListener('abort',abort);fn(value);};xhr.open('POST',grant.UploadUrl);xhr.responseType='json';xhr.upload.onprogress=e=>{if(e.lengthComputable)onProgress({state:'uploading',loaded:e.loaded,total:e.total});};xhr.onerror=()=>settle(reject,Error('The media upload connection failed.'));xhr.onabort=()=>settle(reject,new DOMException('Upload aborted','AbortError'));xhr.onload=()=>settle(resolve,{status:xhr.status,payload:xhr.response});abort=()=>{if(settled)return;if(!sent){settle(reject,new DOMException('Upload aborted','AbortError'));return;}try{xhr.abort();}catch{settle(reject,new DOMException('Upload aborted','AbortError'));}};signal?.addEventListener('abort',abort,{once:true});xhr.onloadend=()=>signal?.removeEventListener('abort',abort);if(signal?.aborted)abort();else{sent=true;try{xhr.send(form);}catch(error){settle(reject,error);}}});
 if(status<200||status>=300||!payload?.data?.id)throw Error(payload?.error||'The media provider rejected the upload.');
 await store.patch(owner,clip.id,{hostedMediaId:grant.MediaId,uploadObjectId:payload.data.id,uploadStatus:'verifying'});
 onProgress({state:'verifying',loaded:blob.size,total:blob.size});
 if(signal?.aborted)throw new DOMException('Upload aborted','AbortError');
 const result=await send('Media/Finalize',{MediaId:grant.MediaId,ObjectId:payload.data.id});
 if(!result?.Success)throw Error(result?.Message||'The uploaded clip could not be verified.');
 await store.patch(owner,clip.id,{uploadOperation:op,hostedMediaId:result.MediaId,hostedUrl:result.Url,uploadObjectId:null,uploadStatus:'complete'});
 onProgress({state:'complete',loaded:blob.size,total:blob.size});return {...result,OperationId:op};
}
