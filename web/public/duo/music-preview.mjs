/** SYNTHETIC browser fixtures only. Imported exclusively by preview.mjs, never a FiveM session.
 * No actual media is streamed, no database is written, and no real money or accounts are used. */
export function createMusicFixture(){
 let seq=10;const state={Tracks:[
  {id:1,title:'Coastline',url:'https://example.invalid/demo/coastline.mp3',provider:'link',created_at:4},
  {id:2,title:'Blue Hour',url:'https://example.invalid/demo/blue-hour.mp3',provider:'link',created_at:3},
  {id:3,title:'Night Drive',url:'https://example.invalid/demo/night-drive.mp3',provider:'link',created_at:2},
  {id:4,title:'Slow Morning',url:'https://example.invalid/demo/slow-morning.mp3',provider:'link',created_at:1}
 ],Playlists:[]};state.Playlists=[{id:1,name:'After hours',description:'A collection for the way home.',citizenid:'PREVIEW',isOwner:true,ownerName:'Alex Morgan',collaborators:[],tracks:[state.Tracks[0],state.Tracks[2]]}];
 const sessions=new Map();let fail=null,delay=0;
 const clone=v=>structuredClone(v);const find=id=>state.Playlists.find(p=>String(p.id)===String(id));
 async function send(event,data={}){
  if(delay)await new Promise(r=>setTimeout(r,delay));
  if(fail&&event===fail.event){const f=fail;fail=null;if(f.throw)throw Error(f.message);return {Success:false,Message:f.message};}
  const p=find(data.PlaylistId),t=state.Tracks.find(t=>String(t.id)===String(data.TrackId));
  switch(event){
   case 'Peakify/Search':return {Success:true,Tracks:[
    {id:'demoTrack01',provider:'audius',verified:true,title:'Coastline',channel:'Preview verified artist',duration:191},
    {id:'demoTrack02',provider:'audius',verified:true,title:'Night Drive',channel:'Preview verified artist',duration:242},
    {id:'demoTrack03',provider:'audius',verified:false,title:'Unverified upload',channel:'Preview uploader',duration:220}
   ]}; // Fictional metadata only; never stream a fixture from a real provider.
   case 'Peakify/ResolveCatalog':return {Success:false,Message:'Synthetic preview has no real audio. Connect to the test server for playback.'};
   case 'Peakify/GetState':return clone(state);
   case 'Peakify/GetDeviceState':return clone(sessions.get(data.NetworkId)||null);
   case 'Peakify/GetSessions':return clone([...sessions.values()]);
   case 'Peakify/SaveTrack':if(!state.Tracks.some(t=>t.url===data.Url))state.Tracks.unshift({id:++seq,title:data.Title,url:data.Url,provider:data.Url.startsWith('https://api.audius.co/v1/tracks/')?'audius':'link',created_at:Date.now()});return {Success:true};
   case 'Peakify/DeleteTrack':if(!t)return false;state.Tracks=state.Tracks.filter(x=>x!==t);for(const p of state.Playlists)p.tracks=p.tracks.filter(x=>x.id!==t.id);return true;
   case 'Peakify/CreatePlaylist':state.Playlists.unshift({id:++seq,name:data.Name,description:data.Description,citizenid:'PREVIEW',isOwner:true,ownerName:'Alex Morgan',collaborators:[],tracks:[]});return true;
   case 'Peakify/DeletePlaylist':if(!p?.isOwner)return false;state.Playlists=state.Playlists.filter(x=>x!==p);return true;
   case 'Peakify/AddTrackToPlaylist':if(!p||!t)return false;if(!p.tracks.some(x=>x.id===t.id))p.tracks.push(t);return true;
   case 'Peakify/RemoveTrackFromPlaylist':if(!p)return false;p.tracks=p.tracks.filter(x=>String(x.id)!==String(data.TrackId));return true;
   case 'Peakify/AddCollaborator':if(!p?.isOwner)return false;if(!p.collaborators.some(c=>c.citizenid===data.CitizenId))p.collaborators.push({citizenid:data.CitizenId,name:data.CitizenId});return true;
   case 'Peakify/RemoveCollaborator':if(!p?.isOwner)return false;p.collaborators=p.collaborators.filter(x=>x.citizenid!==data.CitizenId);return true;
   case 'Peakify/Play':{const s={NetworkId:data.NetworkId,Url:data.Url,Title:data.Title,Radius:data.Radius,Volume:data.Volume,DeviceType:'boombox',Provider:'link',Paused:false};sessions.set(data.NetworkId,s);return {Success:true,Session:clone(s)};}
   case 'Peakify/Pause':{const s=sessions.get(data.NetworkId);if(!s)return false;s.Paused=data.Paused;return true;}
   case 'Peakify/Volume':{const s=sessions.get(data.NetworkId);if(!s||!Number.isFinite(data.Volume)||data.Volume<0||data.Volume>1)return false;s.Volume=data.Volume;return true;}
   case 'Peakify/Stop':return sessions.delete(data.NetworkId);
   case 'Peakify/StopCarry':return true;
  }
  throw Error('Unknown music fixture contract: '+event);
 }
 return {state,sessions,send,failOnce(event,message='Synthetic rejected request',throws=false){fail={event,message,throw:throws};},setDelay(ms){delay=ms;}};
}
