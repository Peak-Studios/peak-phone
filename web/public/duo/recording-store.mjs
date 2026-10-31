/** Local-only video library. IndexedDB is a cache, not a server permission boundary. */
export const RECORDING_LIMITS=Object.freeze({seconds:60,clipBytes:24*1024*1024,ownerBytes:128*1024*1024,totalBytes:256*1024*1024,count:20});
const DB='peak-duo-local-media-v1';
const req=r=>new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error||Error('Local video storage is unavailable.'));});
const done=tx=>{const promise=new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error||Error('Could not save the clip. Free local storage and retry.'));});promise.catch(()=>{});return promise;};
export class RecordingStore {
 constructor(){this.opening=null;}
 async db(){
  if(!globalThis.indexedDB)throw Error('Local video storage is unavailable in this browser.');
  if(!this.opening)this.opening=new Promise((resolve,reject)=>{
   const r=indexedDB.open(DB,1);
   r.onupgradeneeded=()=>{const db=r.result;const meta=db.createObjectStore('metadata',{keyPath:'id'});meta.createIndex('owner','owner',{unique:false});db.createObjectStore('blobs',{keyPath:'id'});};
   r.onerror=()=>{this.opening=null;reject(r.error||Error('Cannot open local video library.'));};
   r.onblocked=()=>{this.opening=null;reject(Error('Close other phone previews and retry opening the local library.'));};
   r.onsuccess=()=>{const db=r.result;db.onversionchange=()=>{db.close();this.opening=null;};resolve(db);};
  });
  return this.opening;
 }
 async list(owner){if(!owner)return [];const db=await this.db();return (await req(db.transaction('metadata').objectStore('metadata').index('owner').getAll(owner))).sort((a,b)=>b.createdAt-a.createdAt);}
 async save(owner,blob,info={}){
  if(!owner||typeof owner!=='string')throw Error('Open a character’s phone before recording.');
  if(!(blob instanceof Blob)||!blob.size||!blob.type.startsWith('video/'))throw Error('The recorder produced no playable video.');
  if(blob.size>RECORDING_LIMITS.clipBytes)throw Error('Clip exceeds the 24 MB limit. Record a shorter clip.');
  const db=await this.db(),tx=db.transaction(['metadata','blobs'],'readwrite'),complete=done(tx);
  // Quota checks and writes share one transaction: concurrent saves cannot bypass limits.
  const all=await req(tx.objectStore('metadata').getAll());
  const own=all.filter(x=>x.owner===owner),sum=items=>items.reduce((n,x)=>n+(Number(x.size)||0),0);
  if(own.length>=RECORDING_LIMITS.count||sum(own)+blob.size>RECORDING_LIMITS.ownerBytes||sum(all)+blob.size>RECORDING_LIMITS.totalBytes){tx.abort();await complete.catch(()=>{});throw Error('Local video library is full. Delete a clip in Photos → Videos and try again.');}
  const id=crypto.randomUUID(),meta={id,owner,createdAt:Date.now(),size:blob.size,mime:blob.type,duration:Math.max(0,Math.min(65,Number(info.duration)||0)),audio:!!info.audio,preview:!!info.preview,width:Number(info.width)||1280,height:Number(info.height)||720};
  tx.objectStore('metadata').add(meta);tx.objectStore('blobs').add({id,owner,blob});await complete;
  window.dispatchEvent(new CustomEvent('duo:recordings-changed',{detail:{owner}}));return meta;
 }
 async get(owner,id){const db=await this.db();const value=await req(db.transaction('blobs').objectStore('blobs').get(id));if(!value||value.owner!==owner)throw Error('This clip is not in the current phone’s local library.');return value.blob;}
 async patch(owner,id,changes={}){const db=await this.db(),tx=db.transaction('metadata','readwrite'),complete=done(tx),store=tx.objectStore('metadata'),meta=await req(store.get(id));if(!meta||meta.owner!==owner){tx.abort();await complete.catch(()=>{});throw Error('This clip is not in the current phone’s local library.');}store.put({...meta,...changes,id:meta.id,owner:meta.owner});await complete;}
 async remove(owner,id){const db=await this.db(),tx=db.transaction(['metadata','blobs'],'readwrite'),complete=done(tx);const meta=await req(tx.objectStore('metadata').get(id));if(meta?.owner===owner){tx.objectStore('metadata').delete(id);tx.objectStore('blobs').delete(id);}await complete;window.dispatchEvent(new CustomEvent('duo:recordings-changed',{detail:{owner}}));}
}
