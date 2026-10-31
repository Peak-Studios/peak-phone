/** Preserve the existing IndexedDB store. Writes resolve only after transaction commit. */
export class MemoStore {
 constructor(factory=globalThis.indexedDB){this.factory=factory;this.opening=null;}
 db(){
  if(!this.factory)return Promise.reject(Error('Voice memo storage is unavailable in this browser.'));
  if(!this.opening){
   const opening=new Promise((resolve,reject)=>{
    const r=this.factory.open('peak-duo-voice-memos-v1',1);let blocked=false;
    r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('memos'))r.result.createObjectStore('memos',{keyPath:'id'});};
    r.onerror=()=>reject(r.error||Error('Could not open recordings.'));
    r.onblocked=()=>{blocked=true;reject(Error('Close another phone preview before opening recordings.'));};
    r.onsuccess=()=>{if(blocked){r.result.close();return;}r.result.onversionchange=()=>{r.result.close();this.opening=null;};resolve(r.result);};
   });
   this.opening=opening.catch(error=>{this.opening=null;throw error;});
  }
  return this.opening;
 }
 async transaction(mode,operation){const db=await this.db();return new Promise((resolve,reject)=>{const tx=db.transaction('memos',mode);let value;const request=operation(tx.objectStore('memos'));request.onsuccess=()=>{value=request.result;};tx.oncomplete=()=>resolve(value);tx.onerror=tx.onabort=()=>reject(tx.error||request.error||Error('The recording could not be saved. Device storage may be full.'));});}
 async all(owner){const rows=await this.transaction('readonly',s=>s.getAll());return rows.filter(r=>r.owner===owner&&r.blob instanceof Blob).sort((a,b)=>b.createdAt-a.createdAt);}
 put(row){return this.transaction('readwrite',s=>s.put(row));}
 remove(id){return this.transaction('readwrite',s=>s.delete(id));}
}
export const memoStore=new MemoStore();
