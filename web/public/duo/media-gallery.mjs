import { icon } from './icons.mjs?rev=owner-config-20261015';
import { PhotosLibrary } from './photos-library.mjs?rev=owner-config-20261015';
import { uploadRecording } from './media-upload.mjs';
const time=value=>{const n=Math.floor(value||0);return `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`;};
const dayKey=date=>date?`${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`:'unknown';
const dayLabel=date=>{if(!date)return 'Date unavailable';const now=new Date(),yesterday=new Date();yesterday.setDate(now.getDate()-1);if(dayKey(date)===dayKey(now))return 'Today';if(dayKey(date)===dayKey(yesterday))return 'Yesterday';return date.toLocaleDateString(undefined,{month:'long',day:'numeric',year:'numeric'});};
const stamp=value=>{const n=Number(value);if(Number.isFinite(n)&&n>0)return n<1e12?n*1000:n;const d=Date.parse(value);return Number.isFinite(d)?d:0;};
/** Server Photos and the separately stored on-device video library. */
export class MediaGalleryApp {
 constructor({target,props:{legacy,store,owner,notify,send}}){
  Object.assign(this,{target,store,owner,notify,send});this.generation=0;this.urls=new Set();this.tab='photos';this.dead=false;this.uploads=new Map();
  target.classList.add('duo-media-gallery');
  this.albumFilter='all';this.albumGeneration=0;
  target.innerHTML='<div class="duo-media-tabs" role="group" aria-label="Media library"><button type="button" data-tab="photos" aria-pressed="true">Photos</button><button type="button" data-tab="albums" aria-pressed="false">Albums</button><button type="button" data-tab="videos" aria-pressed="false">Videos <small>On device</small></button></div><div class="duo-server-photos"></div><div class="duo-media-albums" hidden></div><div class="duo-local-videos" hidden></div><div class="duo-video-viewer" hidden></div>';
  this.photo=target.querySelector('.duo-server-photos');this.albums=target.querySelector('.duo-media-albums');this.local=target.querySelector('.duo-local-videos');this.viewer=target.querySelector('.duo-video-viewer');
  this.onShellMessage=event=>{if(event.source&&event.source!==window&&event.source!==window.parent)return;if(event.data?.Action==='Gallery/SharedPhoto')this.select('photos',{refresh:false});};window.addEventListener('message',this.onShellMessage);
  this.photos=new PhotosLibrary({target:this.photo,props:{owner,notify,send}});
  target.querySelector('.duo-media-tabs').addEventListener('click',event=>{const tab=event.target.closest('[data-tab]')?.dataset.tab;if(tab)this.select(tab);});
  this.onAlbumClick=event=>this.albumClick(event);this.albums.addEventListener('click',this.onAlbumClick);
  this.onPhotosChanged=event=>{if(event.detail?.owner!==this.owner())return;this.albumPhotos=event.detail.photos||[];if(this.tab==='albums'&&!this.albumLoadingToken)this.renderAlbums({reload:false});};target.addEventListener('duo:photos-changed',this.onPhotosChanged);
  this.onChange=e=>{if(e.detail.owner===this.owner()){if(this.tab==='videos')this.refresh();else if(this.tab==='albums')this.renderAlbums();}};window.addEventListener('duo:recordings-changed',this.onChange);
  this.observer=new MutationObserver(()=>{if(target.hidden||target.inert)this.viewer.querySelector('video')?.pause();});this.observer.observe(target,{attributes:true,attributeFilter:['hidden','inert']});
  this.seedPreviewVideo();
 }
 select(tab,{refresh=true}={}){this.tab=tab;++this.albumGeneration;this.closeViewer();if(tab!=='photos')this.photos.closePhoto();for(const b of this.target.querySelectorAll('[data-tab]'))b.setAttribute('aria-pressed',String(tab===b.dataset.tab));this.photo.hidden=tab!=='photos';this.albums.hidden=tab!=='albums';this.local.hidden=tab!=='videos';if(tab==='videos')this.refresh();else if(tab==='albums')this.renderAlbums();else if(refresh)this.photos.refresh().catch(error=>this.photos.showError(error));}
 async seedPreviewVideo(){
  if(typeof window.GetParentResourceName==='function'||new URLSearchParams(location.search).get('gallery')!=='video')return;
  const owner=this.owner();if(!owner)return;
  try{
   if((await this.store.list(owner)).length||this.dead)return;
   const response=await fetch('./duo/fixtures/gallery-preview.mp4',{cache:'force-cache',credentials:'same-origin'});if(!response.ok)return;
   const blob=new Blob([await response.arrayBuffer()],{type:'video/mp4'});if(this.dead||owner!==this.owner())return;
   await this.store.save(owner,blob,{duration:3,audio:false,preview:true,width:480,height:480});
  }catch{/* Synthetic browser-only fixture is optional. */}
 }
 async renderAlbums({reload=true}={}){
  const token=++this.albumGeneration,owner=this.owner();this.albums.replaceChildren();
  const header=document.createElement('header');header.className='duo-albums-header';const heading=document.createElement('div');heading.className='duo-albums-heading';const title=document.createElement('h1');title.textContent='Albums';const note=document.createElement('p');note.textContent='Collections from your saved photos and on-device videos.';heading.append(title,note);header.append(heading);this.albums.append(header);
  let photoError='',videoError='';
  if(reload){let clips=[];this.albumLoadingToken=token;await Promise.all([
   this.photos.refresh().catch(error=>{photoError=error.message||'Photos are unavailable.';}),
   this.store.list(owner).then(value=>{clips=value;}).catch(error=>{videoError=error.message||'Videos are unavailable.';})
  ]);if(this.dead||token!==this.albumGeneration||owner!==this.owner()||this.tab!=='albums')return;this.albumLoadingToken=null;this.albumPhotos=this.photos.photos.slice();this.albumClips=clips;this.albumErrors={photoError,videoError};}
  if(this.dead||token!==this.albumGeneration||owner!==this.owner()||this.tab!=='albums')return;
  const photos=this.albumPhotos||[],clips=this.albumClips||[];({photoError='',videoError=''}=this.albumErrors||{});const items=[
   ...photos.map((photo,index)=>({kind:'photo',photo,index,stamp:stamp(photo.timestamp)})),
   ...clips.map(clip=>({kind:'video',clip,stamp:Number(clip.createdAt)||0}))
  ].sort((a,b)=>b.stamp-a.stamp);
  const filters=document.createElement('div');filters.className='duo-album-filters';filters.setAttribute('role','group');filters.setAttribute('aria-label','Album collection');
  for(const [id,label,count] of [['all','All',items.length],['photos','Photos',photos.length],['videos','Videos',clips.length]]){
   const button=document.createElement('button');button.type='button';button.dataset.albumFilter=id;button.setAttribute('aria-pressed',String(id===this.albumFilter));const name=document.createElement('span');name.textContent=label;const number=document.createElement('small');number.textContent=String(count);button.append(name,number);filters.append(button);
  }
  const content=document.createElement('main');content.className='duo-albums-scroll';content.setAttribute('aria-label','Saved media albums');
  const filtered=items.filter(item=>this.albumFilter==='all'||item.kind===this.albumFilter.slice(0,-1));
  if(photoError||videoError){const error=document.createElement('p');error.className='duo-album-load-note';error.textContent=[photoError,videoError].filter(Boolean).join(' ');content.append(error);}
  if(!filtered.length){const empty=document.createElement('div');empty.className='duo-albums-empty';empty.innerHTML=icon(this.albumFilter==='videos'?'video':'image');const h=document.createElement('h2');h.textContent=this.albumFilter==='videos'?'No videos yet':'Your albums are ready for memories';const p=document.createElement('p');p.textContent=this.albumFilter==='videos'?'Record a clip in Camera and it will appear here.':'Take a photo or record a video to see it grouped here by date.';empty.append(h,p);content.append(empty);}
  else{
   const groups=new Map();for(const item of filtered){const date=item.stamp?new Date(item.stamp):null,key=dayKey(date);if(!groups.has(key))groups.set(key,{label:dayLabel(date),items:[]});groups.get(key).items.push(item);}
   for(const group of groups.values()){const section=document.createElement('section');section.className='duo-album-day';const title=document.createElement('h2');title.textContent=group.label;const grid=document.createElement('div');grid.className='duo-album-grid';
    for(const item of group.items){const button=document.createElement('button');button.type='button';button.className='duo-album-item';button.dataset.albumKind=item.kind;button.dataset.albumId=String(item.kind==='photo'?item.photo.id:item.clip.id);button.setAttribute('aria-label',item.kind==='photo'?'Open photo':'Play video');
     if(item.kind==='photo'){const image=new Image();image.src=item.photo.photo_url;image.alt='';image.loading='lazy';image.referrerPolicy='no-referrer';button.append(image);}
     else{const art=document.createElement('span');art.className='duo-album-video-art';art.innerHTML=icon('play');const duration=document.createElement('small');duration.textContent=time(item.clip.duration);art.append(duration);if(item.clip.preview){const preview=document.createElement('em');preview.className='duo-album-video-preview';preview.textContent='Preview';art.append(preview);}button.append(art);}
     grid.append(button);
    }
    section.append(title,grid);content.append(section);
   }
  }
  this.albums.append(filters,content);
 }
 albumClick(event){
  const filter=event.target.closest('[data-album-filter]')?.dataset.albumFilter;
  if(filter){this.albumFilter=filter;this.renderAlbums({reload:false});return;}
  const tile=event.target.closest('[data-album-kind]');if(!tile)return;
  const kind=tile.dataset.albumKind,id=tile.dataset.albumId;
  if(kind==='photo'){const index=this.photos.photos.findIndex(photo=>String(photo.id)===id);if(index<0)return;const photo=this.photos.photos[index];this.select('photos');this.photos.showPhoto(photo,index);}
  else{const clipId=id,owner=this.owner();this.store.list(owner).then(clips=>{if(this.dead||owner!==this.owner()||this.tab!=='albums')return;const clip=clips.find(item=>String(item.id)===clipId);if(clip){this.select('videos');this.play(clip);}}).catch(error=>this.notify(error.message));}
 }
 async refresh(){
  const token=++this.generation,owner=this.owner();this.local.replaceChildren();const heading=document.createElement('h2');heading.textContent='Your videos';this.local.append(heading);
  const note=document.createElement('p');note.className='duo-local-note';note.textContent='Saved on this device for this SIM. Not uploaded or synced. Clearing the FiveM browser cache removes these clips.';this.local.append(note);
  try{
   const list=await this.store.list(owner);if(this.dead||token!==this.generation||owner!==this.owner())return;
   const count=document.createElement('p');count.className='duo-local-count';count.textContent=`${list.length} of 20 clips · ${(list.reduce((n,x)=>n+x.size,0)/1048576).toFixed(1)} MB`;this.local.append(count);
   if(!list.length){const empty=document.createElement('div');empty.className='duo-video-empty';empty.innerHTML=icon('video');const title=document.createElement('h3');title.textContent='Keep a moving memory.';const text=document.createElement('p');text.textContent='Open Camera, choose Video, and tap the red record button. Your clips appear here.';empty.append(title,text);this.local.append(empty);return;}
   const grid=document.createElement('div');grid.className='duo-video-grid';this.local.append(grid);
   for(const clip of list){const button=document.createElement('button');button.type='button';button.className='duo-video-card';button.innerHTML=`<span class="duo-video-art">${icon('play')}<span>${time(clip.duration)}</span></span>`;const title=document.createElement('strong');title.textContent=new Date(clip.createdAt).toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});const detail=document.createElement('small');detail.textContent=`${clip.preview?'Preview · ':''}${clip.audio?'Microphone':'Silent'} · ${(clip.size/1048576).toFixed(1)} MB`;const upload=document.createElement('span');upload.className='duo-video-upload';upload.textContent=clip.uploadStatus==='complete'||this.uploads.get(clip.id)?.state==='complete'?'Hosted':'Upload';upload.tabIndex=0;upload.role='button';const start=async event=>{event.stopPropagation();const prior=this.uploads.get(clip.id);if(prior?.busy){prior.controller.abort();upload.textContent='Cancelling…';return;}const controller=new AbortController(),state={busy:true,state:'starting',controller};this.uploads.set(clip.id,state);upload.textContent='Preparing… · Cancel';try{const result=await uploadRecording({store:this.store,owner:this.owner(),clip,send:this.send,signal:controller.signal,onProgress:p=>{state.state=p.state;upload.textContent=p.state==='uploading'?`Uploading ${Math.round(p.loaded/p.total*100)||0}% · Cancel`:p.state==='verifying'?'Verifying…':'Hosted';}});if(controller.signal.aborted)return;Object.assign(state,{busy:false,state:'complete',result});upload.textContent='Hosted';this.notify('Video uploaded and verified. Choose KiloGram to publish it.');}catch(error){Object.assign(state,{busy:false,state:controller.signal.aborted?'cancelled':'failed'});upload.textContent='Retry upload';if(!controller.signal.aborted)this.notify(error.message);}};upload.addEventListener('click',start);upload.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();start(e);}});button.append(title,detail,upload);button.addEventListener('click',()=>this.play(clip));grid.append(button);}
  }catch(error){if(!this.dead){const text=document.createElement('p');text.className='duo-local-error';text.textContent=error.message;this.local.append(text);}}
 }
 async play(clip){
  this.closeViewer();const token=++this.playGeneration,owner=this.owner();
  try{const blob=await this.store.get(owner,clip.id);if(this.dead||token!==this.playGeneration||owner!==this.owner())return;const url=URL.createObjectURL(blob);this.urls.add(url);
   this.viewer.hidden=false;this.viewer.innerHTML='<header><button type="button" data-back>Done</button><span>On this device</span><button type="button" data-delete>Delete</button></header>';
   const video=document.createElement('video');video.controls=true;video.playsInline=true;video.preload='metadata';video.src=url;video.setAttribute('aria-label','Recorded video');this.viewer.append(video);
   // Chunked WebM may omit a duration. Seek once to resolve browser metadata, then rewind.
   video.addEventListener('loadedmetadata',()=>{if(!Number.isFinite(video.duration)){video.currentTime=1e10;video.addEventListener('seeked',()=>{video.currentTime=0;},{once:true});}},{once:true});
   this.viewer.querySelector('[data-back]').addEventListener('click',()=>this.closeViewer());
   const remove=this.viewer.querySelector('[data-delete]');let armed=false;remove.addEventListener('click',async()=>{if(!armed){armed=true;remove.textContent='Confirm delete';return;}remove.disabled=true;try{await this.store.remove(owner,clip.id);this.closeViewer();}catch(error){remove.disabled=false;this.notify(error.message);}});
  }catch(error){this.notify(error.message);}
 }
 closeViewer(){this.playGeneration=(this.playGeneration||0)+1;const video=this.viewer.querySelector('video');if(video){video.pause();video.removeAttribute('src');video.load();}this.viewer.hidden=true;this.viewer.replaceChildren();for(const url of this.urls)URL.revokeObjectURL(url);this.urls.clear();}
 handleEscape(){if(this.photos?.handleEscape?.())return true;if(!this.viewer.hidden){this.closeViewer();return true;}return false;}
 $destroy(){this.dead=true;++this.generation;++this.albumGeneration;for(const state of this.uploads.values())state.controller?.abort();this.closeViewer();this.observer.disconnect();window.removeEventListener('message',this.onShellMessage);window.removeEventListener('duo:recordings-changed',this.onChange);this.target.removeEventListener('duo:photos-changed',this.onPhotosChanged);this.albums.removeEventListener('click',this.onAlbumClick);this.photos.$destroy();this.target.replaceChildren();}
}
