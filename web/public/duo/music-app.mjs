/** Peak Music: verified Audius catalog and native audio playback.
 * Libraries and world-speaker playback retain the server-authoritative Peakify contracts.
 * Keep the `peakify` app ID, database tables and NUI endpoint names for save compatibility.
 */
import { el, action, labelledAction, artwork, emptyState, safeAudioURL, resultOK } from './ui-kit.mjs?rev=owner-config-20261015';
import { icon } from './icons.mjs?rev=owner-config-20261015';
import { MusicSearch, youtubeID, audiusID, normalizeMusicText, formatDuration, savedTitle } from './music-search.mjs';
import { CatalogAudioPlayer } from './music-audio.mjs';

import {copyText} from './clipboard.mjs';

const sameID=(a,b)=>String(a)===String(b);
const isMusicNetwork=id=>/^peakify-(boombox|vehicle|carried)-/.test(String(id||''));
const providerName=p=>({audius:'Audius · Verified artist',youtube:'Saved YouTube link',soundcloud:'SoundCloud link',spotify:'Spotify link',link:'Audio link'}[p]||'Audio link');
const humanDevice=id=>id?.startsWith('peakify-vehicle-')?'Vehicle radio':id?.startsWith('peakify-carried-')?'Carried speaker':id?.startsWith('peakify-boombox-')?'Boombox':'Choose a speaker';

export class MusicApp {
 constructor({target,props:{send,stores,notify=()=>{}}}){
  this.target=target;this.send=send;this.stores=stores;this.notify=notify;
  this.tracks=[];this.playlists=[];this.network='';this.session=null;this.tab='home';this.filter='songs';
  this.playlistID=null;this.query='';this.pending=false;this.loading=true;this.error='';this.destroyed=false;
  this.volume=35;this.radius=25;this.readGeneration=0;this.deviceGeneration=0;this.sheetType='';this.sheetData=null;
  this.node=el('section','pm-app');this.node.setAttribute('aria-label','Peak Music');target.append(this.node);
  this.header=el('header','pm-header');this.content=el('div','pm-content');this.content.tabIndex=-1;
  this.footer=el('div','pm-footer');this.player=el('div','pm-mini');this.nav=el('nav','pm-tabs');this.nav.setAttribute('aria-label','Peak Music sections');
  this.footer.append(this.player,this.nav);this.live=el('div','pm-live');this.live.setAttribute('role','status');this.live.setAttribute('aria-live','polite');
  this.sheet=el('div','pm-sheet-shade');this.sheet.hidden=true;this.node.append(this.header,this.content,this.footer,this.live,this.sheet);
  this.catalog=new MusicSearch({send:this.send,changed:()=>this.renderSearchResults()});
  this.audioPlayer=new CatalogAudioPlayer({send:this.send,changed:()=>{if(!this.destroyed){this.renderPlayer();this.updateAudioProgress();}},ended:()=>this.nextTrack(1)});
  this.render();this.unsub=stores.CurrentNetwork.subscribe(id=>{
   const next=String(id||'');if(next===this.network)return;
   this.network=next;this.session=null;++this.deviceGeneration;this.renderPlayer();this.renderHeader();this.refreshDevice();
  });
  this.refresh();this.refreshDevice();
  this.poll=setInterval(()=>{if(this.isVisible()&&isMusicNetwork(this.network)&&!this.pending)this.refreshDevice();},4500);
  this.sheet.addEventListener('click',e=>{if(e.target===this.sheet&&!this.pending)this.closeSheet();});
  this.node.addEventListener('keydown',e=>{
   if(e.key!=='Tab'||this.sheet.hidden)return;
   const focus=[...this.sheet.querySelectorAll('button,input,textarea,select,[tabindex="0"]')].filter(x=>!x.disabled&&x.getClientRects().length);
   if(!focus.length)return;const index=focus.indexOf(document.activeElement);
   if(e.shiftKey&&index<=0){e.preventDefault();focus.at(-1).focus();}else if(!e.shiftKey&&index===focus.length-1){e.preventDefault();focus[0].focus();}
  });
 }
 isVisible(){const pane=this.node.closest('.duo-pane');return !this.destroyed&&this.node.isConnected&&!this.target.hidden&&pane?.dataset.visible==='true'&&pane?.dataset.home!=='true';}
 say(message,error=false){if(this.destroyed)return;this.live.textContent=message;this.live.dataset.error=String(error);clearTimeout(this.toastTimer);this.toastTimer=setTimeout(()=>{if(!this.destroyed)this.live.textContent='';},6000);}
 async refresh(){
  const gen=++this.readGeneration;
  try{
   const data=await this.send('Peakify/GetState',{});if(this.destroyed||gen!==this.readGeneration)return;
   if(!data||!Array.isArray(data.Tracks)||!Array.isArray(data.Playlists))throw Error('The music library did not return valid data.');
   this.tracks=data.Tracks.filter(t=>t&&t.id!=null);this.playlists=data.Playlists.filter(p=>p&&p.id!=null);
   if(this.playlistID&&!this.playlists.some(p=>sameID(p.id,this.playlistID)))this.playlistID=null;
   this.error='';
  }catch(e){if(this.destroyed||gen!==this.readGeneration)return;this.error=e.message||'Could not load your music.';}
  this.loading=false;if(!this.destroyed){this.renderContent(true);this.renderPlayer();}
 }
 async refreshDevice(){
  const network=this.network,gen=++this.deviceGeneration;
  if(!isMusicNetwork(network)){this.session=null;this.renderPlayer();return;}
  try{
   const data=await this.send('Peakify/GetDeviceState',{NetworkId:network});
   if(this.destroyed||gen!==this.deviceGeneration||network!==this.network)return;
   const previous=JSON.stringify(this.session);this.session=data&&data.NetworkId===network?data:null;
   if(previous!==JSON.stringify(this.session)){this.renderPlayer();if(this.sheetType==='now'&&!this.pending)this.nowPlaying(true);}
  }catch{/* A failed refresh never invents a new playback state or clears a known good one. */}
 }
 async perform(event,payload,after){
  if(this.pending||this.destroyed)return false;this.pending=true;this.node.dataset.busy='true';
  const operationMark=this.network;
  try{
   const response=await this.send(event,payload);
   if(this.destroyed)return false;
   if(!resultOK(response))throw Error(response?.Message||response?.Msg||'The server could not complete this action.');
   if(after)await after(response,operationMark);return true;
  }catch(e){if(!this.destroyed){this.say(e.message||'The request failed. Please try again.',true);const local=this.sheet.querySelector('.pm-form-error');if(local)local.textContent=e.message||'The request failed.';}return false;}
  finally{this.pending=false;if(!this.destroyed){this.node.dataset.busy='false';this.renderPlayer();}}
 }
 render(){this.renderHeader();this.renderContent();this.renderPlayer();this.renderTabs();}
 renderHeader(){
  this.header.replaceChildren();const title=el('div','pm-brand');title.innerHTML=icon('music');title.append(el('span','','Peak Music'));
  const tools=el('div','pm-header-actions');tools.append(action('Refresh library','refresh',()=>this.refresh(),'ios-round-button'),action('Choose audio output','headphones',()=>this.devices(),'ios-round-button'),action('Add music','plus',()=>this.addMenu(),'ios-round-button pm-accent'));
  this.header.append(title,tools);
 }
 navigate(tab){this.tab=tab;this.playlistID=null;this.renderContent();this.renderTabs();this.content.scrollTop=0;}
 renderTabs(){
  this.nav.replaceChildren(...[['home','Home','home'],['library','Library','library'],['search','Search','search']].map(([id,title,glyph])=>{
   const b=labelledAction(title,glyph,()=>this.navigate(id),'pm-tab');b.dataset.active=String(this.tab===id);b.setAttribute('aria-current',this.tab===id?'page':'false');return b;
  }));
 }
 renderContent(keepScroll=false){
  if(this.destroyed)return;const scroll=this.content.scrollTop;this.content.replaceChildren();
  if(this.loading){this.content.append(emptyState('music','Loading your library','Your saved songs and playlists will appear here.'));return;}
  if(this.error){const error=emptyState('cloud','Library unavailable',this.error);error.append(labelledAction('Try again','refresh',()=>this.refresh(),'pm-button'));this.content.append(error);if(!this.tracks.length&&this.tab!=='search')return;}
  if(this.playlistID){this.renderPlaylist();}
  else if(this.tab==='home')this.renderHome();else if(this.tab==='library')this.renderLibrary();else this.renderSearch();
  if(keepScroll)this.content.scrollTop=scroll;
 }
 section(title,more,fn){const bar=el('div','pm-section-title');bar.append(el('h2','',title));if(more)bar.append(action(more,null,fn,'pm-text-button'));return bar;}
 renderHome(){
  const title=el('div','pm-page-title');title.append(el('h1','','Home'),el('p','','A soundtrack for your city.'));this.content.append(title);
  const hero=el('button','pm-hero');hero.type='button';hero.setAttribute('aria-label',this.tracks.length?'Browse recently added music':'Add your first song');
  hero.append(artwork('peak-music-home','',true));const copy=el('div','pm-hero-copy');copy.append(el('span','pm-kicker','YOUR LIBRARY'),el('strong','',this.tracks.length?'Your music.\nYour moment.':'Make it\nyour soundtrack.'),el('span','pm-hero-sub',this.tracks.length?`${this.tracks.length} saved ${this.tracks.length===1?'song':'songs'} · Always within reach`:'Save a song to start your collection'));
  hero.append(copy);hero.addEventListener('click',()=>this.tracks.length?this.navigate('library'):this.trackForm());this.content.append(hero);
  this.content.append(this.section('Recently added',this.tracks.length?'See all':'Add song',()=>this.tracks.length?this.navigate('library'):this.trackForm()));
  if(this.tracks.length){const strip=el('div','pm-cover-strip');for(const track of this.tracks.slice(0,6)){
   const item=el('button','pm-cover-card');item.type='button';item.append(artwork(track.id+':'+track.title),el('strong','',track.title||'Untitled song'),el('span','',providerName(track.provider)));item.addEventListener('click',()=>this.trackMenu(track));strip.append(item);
  }this.content.append(strip);}else this.content.append(el('p','pm-empty-inline','Songs you save will appear here. Nothing is added automatically.'));
  this.content.append(this.section('Made by you','New playlist',()=>this.playlistForm()));
  if(this.playlists.length){for(const playlist of this.playlists.slice(0,3))this.content.append(this.playlistRow(playlist));}
  else this.content.append(this.promoRow('playlist','A place for every mood','Collect your favorites in a playlist.',()=>this.playlistForm()));
 }
 promoRow(glyph,title,sub,fn){const b=el('button','pm-promo');b.type='button';b.innerHTML=icon(glyph);const c=el('span','pm-row-copy');c.append(el('strong','',title),el('small','',sub));b.append(c);b.insertAdjacentHTML('beforeend',icon('chevron'));b.addEventListener('click',fn);return b;}
 renderLibrary(){
  this.content.append(el('h1','pm-large-title','Library'));
  const segmented=el('div','ios-segmented');for(const [id,name] of [['songs','Songs'],['playlists','Playlists']]){const b=action(name,null,()=>{this.filter=id;this.renderContent();},'');b.dataset.active=String(this.filter===id);b.setAttribute('aria-pressed',String(this.filter===id));segmented.append(b);}this.content.append(segmented);
  if(this.filter==='songs'){
   this.content.append(this.section(`${this.tracks.length} ${this.tracks.length===1?'song':'songs'}`,'Add song',()=>this.trackForm()));
   if(this.tracks.length)this.content.append(this.trackList(this.tracks));else this.content.append(emptyState('music','Your library starts here','Tap Add song to search by song or artist name.'));
  }else{
   this.content.append(this.section('Your playlists','Create',()=>this.playlistForm()));
   if(this.playlists.length)for(const playlist of this.playlists)this.content.append(this.playlistRow(playlist));else this.content.append(emptyState('playlist','Make a playlist','Keep a collection for the drive, the studio, or any moment.'));
  }
 }
 renderSearch(){
  this.content.append(el('h1','pm-large-title','Search'));
  this.content.append(action('About Audius music',null,()=>this.catalogConsent(),'pm-text-button'));
  const form=el('form','pm-catalog-search');const label=el('label','pm-search');label.innerHTML=icon('search');
  const input=el('input');input.type='search';input.placeholder='Search songs or artists';input.setAttribute('aria-label','Search songs or artists');input.value=this.query;input.maxLength=120;input.autocomplete='off';label.append(input);
  const submit=action('Search songs','search',()=>{},'ios-round-button');submit.type='submit';form.append(label,submit);this.content.append(form);
  this.searchResults=el('div','pm-search-results');this.searchResults.setAttribute('aria-live','polite');this.content.append(this.searchResults);
  input.addEventListener('input',()=>{this.query=input.value;this.catalog.setQuery(this.query);});
  form.addEventListener('submit',e=>{e.preventDefault();this.catalog.submit();});this.renderSearchResults();
 }
 renderSearchResults(){
  const results=this.searchResults;if(this.destroyed||this.tab!=='search'||!results?.isConnected)return;
  const state=this.catalog.state;results.replaceChildren();results.setAttribute('aria-busy',String(state.loading));
  const q=normalizeMusicText(this.query);
  if(!q){results.append(emptyState('search','Find your next song','Type a song or artist. Close spellings and stylized titles are matched automatically.'));return;}
  results.append(this.section('Verified artists on Audius'),el('p','pm-empty-inline','Free audio from artists verified by Audius. This smaller catalog may not include every song.'));
  if(state.loading)results.append(el('p','pm-empty-inline','Searching the music catalog…'));
  else if(state.error){const error=emptyState('cloud','Search unavailable',state.error);error.append(labelledAction('Try search again','refresh',()=>this.catalog.submit(),'pm-button'));results.append(error);}
  else if(state.tracks.length){
   const list=el('div','pm-song-list');list.setAttribute('role','list');
   state.tracks.forEach((track,index)=>list.append(this.catalogRow(track,index)));results.append(list);
  }else if(state.searched)results.append(emptyState('search','No playable matches','Try adding the artist name or changing the spelling. Only available, free tracks from verified Audius artists are shown.'));
  else results.append(el('p','pm-empty-inline','Enter at least two characters to search.'));
  const tracks=this.tracks.filter(t=>normalizeMusicText(t.title).includes(q));
  const playlists=this.playlists.filter(p=>normalizeMusicText(p.name).includes(q));
  if(tracks.length)results.append(this.section('In your library'),this.trackList(tracks));
  if(playlists.length){results.append(this.section('Your playlists'));for(const p of playlists)results.append(this.playlistRow(p));}
 }
 catalogRow(track,index){
  const row=el('div','pm-song-row pm-catalog-row');row.setAttribute('role','listitem');
  const main=el('button','pm-song-main');main.type='button';main.setAttribute('aria-label','Play '+track.title);
  const image=el('img','pm-catalog-art');image.src=track.artwork;image.alt='';image.loading='lazy';image.referrerPolicy='no-referrer';main.append(image);
  const copy=el('span','pm-row-copy');if(index===0)copy.append(el('span','pm-top-match','PEAK MUSIC MATCH'));
  copy.append(el('strong','',track.title),el('small','',[track.channel,'Verified on Audius',formatDuration(track.duration)].filter(Boolean).join(' · ')));main.append(copy);main.addEventListener('click',()=>this.play(track));
  const saved=this.findCatalogTrack(track);const save=action(saved?'Saved to library':'Save '+track.title,saved?'check':'plus',()=>this.saveCatalog(track),'pm-song-more');save.disabled=!!saved;
  const more=action('Options for '+track.title,'more',()=>this.catalogMenu(track),'pm-song-more');row.append(main,save,more);return row;
 }
 findCatalogTrack(track){const id=audiusID(track.providerId||track.url);return this.tracks.find(t=>id&&audiusID(t.url)===id);}
 async saveCatalog(track,{playlist=false}={}){
  let saved=this.findCatalogTrack(track);
  if(!saved){
   const ok=await this.perform('Peakify/SaveTrack',{Url:track.url,Title:savedTitle(track.title)},async()=>{await this.refresh();this.say('Song saved to your library.');});
   if(!ok||this.destroyed)return;saved=this.findCatalogTrack(track);
  }
  this.renderSearchResults();
  if(playlist&&saved)this.choosePlaylist(saved);
  else if(playlist)this.say('Song saved, but the refreshed library is unavailable. Reopen the library to add it to a playlist.',true);
 }
 catalogMenu(track){
  this.openSheet(track.title,'catalog-menu');this.sheetBody.append(this.trackRowSummary(track));
  this.sheetAction('Play audio','Listen on this phone.','play',()=>this.play(track));
  this.sheetAction(this.findCatalogTrack(track)?'Saved to library':'Save to library','Title and link are filled automatically.','plus',()=>this.saveCatalog(track));
  this.sheetAction('Add to playlist','Saves the song first when needed.','playlist',()=>this.saveCatalog(track,{playlist:true}));
 }
 async playCatalog(track){
  const ok=await this.audioPlayer.play(track);
  if(this.destroyed)return;
  if(ok)this.nowPlaying();else if(this.audioPlayer.error)this.say(this.audioPlayer.error,true);
 }
 catalogConsent(){
  this.openSheet('About Audius music','catalog-privacy');
  this.sheetBody.append(el('p','pm-helper','Music uses the free Audius catalog. Search text is sent through this server to Audius. Audio and artwork load directly from Audius and its content providers. No API key or Audius account is needed.'),el('p','pm-helper','Only artists marked verified by Audius and freely streamable songs are shown. Availability can change, and this catalog does not include every commercial release. Saved links and playlists remain associated with your character; delete them in Library.'));
  for(const [title,url] of [['Audius Terms','https://audius.co/legal/terms-of-use'],['Audius Privacy','https://audius.co/legal/privacy-policy']]){const link=el('a','pm-text-button',title);link.href=url;link.target='_blank';link.rel='noopener noreferrer';this.sheetBody.append(link);}
 }
 trackList(tracks,playlist=null){const list=el('div','pm-song-list');list.setAttribute('role','list');for(const track of tracks)list.append(this.trackRow(track,playlist));return list;}
 trackRow(track,playlist){
  const row=el('div','pm-song-row');row.setAttribute('role','listitem');const main=el('button','pm-song-main');main.type='button';main.setAttribute('aria-label','Play '+(track.title||'song'));main.append(artwork(track.id+':'+track.title));
  const copy=el('span','pm-row-copy');copy.append(el('strong','',track.title||'Untitled song'),el('small','',providerName(track.provider)));main.append(copy);main.addEventListener('click',()=>this.play(track));
  const more=action('Options for '+(track.title||'song'),'more',()=>this.trackMenu(track,playlist),'pm-song-more');row.append(main,more);return row;
 }
 playlistRow(playlist){
  const row=el('button','pm-playlist-row');row.type='button';row.append(artwork('playlist-'+playlist.id));const text=el('span','pm-row-copy');text.append(el('strong','',playlist.name||'Playlist'),el('small','',`${(playlist.tracks||[]).length} songs${playlist.isOwner?' · By you':playlist.ownerName?' · '+playlist.ownerName:' · Shared'}`));row.append(text);row.insertAdjacentHTML('beforeend',icon('chevron'));row.addEventListener('click',()=>{this.playlistID=playlist.id;this.tab='library';this.renderContent();this.renderTabs();this.content.scrollTop=0;});return row;
 }
 renderPlaylist(){
  const p=this.playlists.find(p=>sameID(p.id,this.playlistID));if(!p)return;
  this.content.append(labelledAction('Library','back',()=>{this.playlistID=null;this.renderContent();},'pm-back'));
  const banner=el('div','pm-playlist-banner');banner.append(artwork('playlist-'+p.id,'',true),el('h1','',p.name||'Playlist'),el('p','',p.description||'Your collection, together.'),el('small','',p.isOwner?'Created by you':p.ownerName||'Shared playlist'));this.content.append(banner);
  const buttons=el('div','pm-playlist-actions');const play=labelledAction('Play first','play',()=>p.tracks?.length&&this.play(p.tracks[0]),'pm-button');play.disabled=!p.tracks?.length;
  buttons.append(play,labelledAction('Add songs','plus',()=>this.addPlaylistTracks(p),'pm-button pm-secondary'),action('Playlist options','more',()=>this.playlistMenu(p),'ios-round-button'));this.content.append(buttons);
  this.content.append(this.section('Songs'));
  this.content.append(p.tracks?.length?this.trackList(p.tracks,p):emptyState('music','No songs yet','Add a saved song to this playlist.'));
 }
 renderPlayer(){
  if(this.destroyed)return;this.player.replaceChildren();
  const audio=this.audioPlayer;
  if(audio?.track||audio?.loading||audio?.error){
   const info=el('button','pm-mini-info');info.type='button';info.append(artwork(audio.track?.id||'quiet'));const text=el('span','pm-row-copy');text.append(el('strong','',audio.track?.title||'Loading audio'),el('small','',audio.error|| (audio.loading?'Checking availability…':(audio.audio.paused?'Paused':'Playing')+' · This phone')));info.append(text);info.setAttribute('aria-label','Open Now Playing');info.addEventListener('click',()=>this.nowPlaying());
   const toggle=action(audio.audio.paused?'Resume playback':'Pause playback',audio.audio.paused?'play':'pause',()=>this.togglePause(),'pm-mini-toggle');toggle.disabled=!audio.track||audio.loading;
   this.player.append(info,toggle);return;
  }
  const session=this.session;const info=el('button','pm-mini-info');info.type='button';info.append(artwork(session?.Url||'quiet'));const text=el('span','pm-row-copy');text.append(el('strong','',session?.Title||'Not playing'),el('small','',session?(session.Paused?'Paused':'Playing')+' · '+humanDevice(this.network):isMusicNetwork(this.network)?'Speaker connected':humanDevice(this.network)));info.append(text);info.setAttribute('aria-label',session?'Open Now Playing':'Choose music output');info.addEventListener('click',()=>session?this.nowPlaying():this.devices());
  const toggle=action(session?.Paused?'Resume playback':'Pause playback',session?.Paused?'play':'pause',()=>this.togglePause(),'pm-mini-toggle');toggle.disabled=!session||this.pending;
  this.player.append(info,toggle,action('Audio output','headphones',()=>this.devices(),'pm-mini-output'));
 }
 async play(track,{keepNow=false}={}){
  if(audiusID(track.providerId||track.url))return this.playCatalog(track);
  if(youtubeID(track.url))return this.say('This saved YouTube link needs a new match. Search the Audius catalog to play audio.',true);
  if(!isMusicNetwork(this.network)){this.say('Choose a nearby boombox, carried speaker, or vehicle radio first.');return this.devices();}
  const url=safeAudioURL(track.url);if(!url){this.say('This song needs a valid HTTPS audio URL.',true);return;}
  this.audioPlayer.stop();
  const network=this.network;
  await this.perform('Peakify/Play',{NetworkId:network,Url:url,Title:track.title||'',Radius:this.radius,Volume:this.volume/100},response=>{
   if(network!==this.network)return;
   this.session=response.Session||null;this.say('Playback sent to '+humanDevice(network).toLowerCase()+'.');if(keepNow&&this.sheetType==='now'&&this.session)this.nowPlaying(true);else this.closeSheet(true);this.renderPlayer();
  });
 }
 async togglePause(){
  if(this.audioPlayer.track)return this.audioPlayer.toggle();
  if(!this.session)return;const id=this.network,paused=!this.session.Paused;
  await this.perform('Peakify/Pause',{NetworkId:id,Paused:paused},()=>{if(id===this.network&&this.session){this.session={...this.session,Paused:paused};if(this.sheetType==='now')this.nowPlaying(true);}});
 }
 async stop(){if(this.audioPlayer.track||this.audioPlayer.loading){this.audioPlayer.stop();this.closeSheet(true);return;}const id=this.network;await this.perform('Peakify/Stop',{NetworkId:id},()=>{if(id===this.network)this.session=null;this.closeSheet(true);this.say('Playback stopped.');});}
 async nextTrack(direction){
  const list=this.playlistID?(this.playlists.find(p=>sameID(p.id,this.playlistID))?.tracks||[]):this.tracks;
  if(!list.length)return;const current=list.findIndex(t=>t.url===(this.audioPlayer.track?.url||this.session?.Url));const next=current<0?0:(current+direction+list.length)%list.length;await this.play(list[next],{keepNow:this.sheetType==='now'});
 }
 openSheet(title,type,{preserveFocus=false}={}){
  if(this.destroyed)return null;
  const previousLabel=preserveFocus&&this.sheet.contains(document.activeElement)?document.activeElement.getAttribute('aria-label'):null;
  if(this.sheet.hidden)this.focusBeforeSheet=document.activeElement;
  this.sheetType=type;this.sheet.hidden=false;this.header.inert=true;this.content.inert=true;this.footer.inert=true;
  this.sheet.replaceChildren();const panel=el('section','pm-sheet');panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','false');panel.setAttribute('aria-label',title);panel.tabIndex=-1;
  const handle=el('div','pm-sheet-handle');handle.setAttribute('aria-hidden','true');const h=el('header','pm-sheet-header');h.append(el('h2','',title),action('Close '+title,'close',()=>this.closeSheet(),'ios-round-button'));this.live.classList.add('pm-sheet-feedback');panel.append(handle,h,this.live);
  this.sheetBody=el('div','pm-sheet-body');panel.append(this.sheetBody);this.sheet.append(panel);
  if(previousLabel)queueMicrotask(()=>{if(this.destroyed||this.sheet.hidden)return;const label=/^(Pause|Resume) playback$/.test(previousLabel)?(this.session?.Paused?'Resume playback':'Pause playback'):previousLabel;[...this.sheet.querySelectorAll('[aria-label]')].find(n=>n.getAttribute('aria-label')===label)?.focus();});
  if(!preserveFocus)queueMicrotask(()=>{if(!this.destroyed&&!this.sheet.hidden)(this.sheet.querySelector('input,textarea,button')||panel).focus();});return this.sheetBody;
 }
 closeSheet(force=false){
  if(this.pending&&!force)return;this.sheet.hidden=true;this.sheet.replaceChildren();this.live.classList.remove('pm-sheet-feedback');this.node.append(this.live);this.sheetType='';this.header.inert=false;this.content.inert=false;this.footer.inert=false;
  const old=this.focusBeforeSheet;this.focusBeforeSheet=null;if(old?.isConnected&&!old.closest('[inert]'))old.focus();
 }
 handleEscape(){if(this.sheet.hidden)return false;this.closeSheet();return true;}
 sheetAction(title,sub,glyph,fn,danger=false){const row=this.promoRow(glyph,title,sub,fn);if(danger)row.classList.add('pm-danger');this.sheetBody.append(row);return row;}
 addMenu(){this.openSheet('Add to your music','add');this.sheetAction('Find a song','Search by title or artist. No link needed.','search',()=>this.trackForm());this.sheetAction('New playlist','Build a collection of saved songs.','playlist',()=>this.playlistForm());this.sheetAction('Import licensed audio link','Advanced: your own permitted audio source.','music',()=>this.linkForm());}
 field(form,label,name,{value='',type='text',placeholder='',max=255,multiline=false,required=true}={}){
  const wrap=el('label','pm-form-field');wrap.append(el('span','',label));const input=el(multiline?'textarea':'input');input.name=name;input.value=String(value);if(!multiline)input.type=type;input.placeholder=placeholder;input.maxLength=max;input.required=required;input.autocomplete='off';wrap.append(input);form.append(wrap);return input;
 }
 openEditor(title,type,label,run){const body=this.openSheet(title,type),panel=body.parentElement;panel.classList.add('pm-editor-sheet','pm-editor-'+type);panel.querySelector('.pm-sheet-header')?.remove();const nav=el('header','pm-editor-nav');nav.append(action('Cancel',null,()=>this.closeSheet(),'pm-editor-cancel'),el('h2','',title));const done=action(label,null,()=>{if(done.disabled||this.pending)return;try{Promise.resolve(run(done)).catch(error=>{if(this.sheetBody===body){let status=body.querySelector('.pm-editor-error');if(!status){status=el('p','pm-editor-error');status.setAttribute('role','alert');body.prepend(status);}status.textContent=error.message||'The action could not be completed.';}else this.say(error.message||'The action could not be completed.',true);});}catch(error){this.say(error.message||'The action could not be completed.',true);}},'pm-editor-done');nav.append(done);panel.insertBefore(nav,this.live);body.classList.add('pm-editor-body');return {body,panel,done};}
 formSubmit(form,label,fn,submitButton=null){const error=el('p','pm-form-error');error.setAttribute('role','alert');const submit=submitButton||el('button','pm-button pm-submit',label);if(!submitButton){submit.type='submit';form.append(error,submit);}else{form.append(error);submit.setAttribute('aria-label',label);}form.addEventListener('submit',async e=>{e.preventDefault();if(this.pending||!form.reportValidity())return;error.textContent='';submit.disabled=true;submit.setAttribute('aria-busy','true');try{await fn(new FormData(form),error);}catch(e){error.textContent=e.message||'The action could not be completed.';}finally{if(submit.isConnected){submit.disabled=false;submit.removeAttribute('aria-busy');}}});}
 trackForm(){this.closeSheet(true);this.navigate('search');this.content.querySelector('input[type=search]')?.focus();}
 linkForm(){
  const form=el('form','pm-form'),editor=this.openEditor('Add song','song-form','Add to library',()=>form.requestSubmit());this.field(form,'Song title','title',{placeholder:'Give this song a name'});this.field(form,'Audio URL','url',{placeholder:'https://…',type:'url',max:1024});
  form.append(el('p','pm-helper','Use an HTTPS audio link you have permission to play. A Spotify or streaming-service page is not necessarily a playable audio file.'));
  this.formSubmit(form,'Add to library',async(data,error)=>{const url=safeAudioURL(data.get('url'));if(!url){error.textContent='Enter an HTTPS URL without a username or password.';return;}await this.perform('Peakify/SaveTrack',{Url:url,Title:String(data.get('title')).trim()},async()=>{this.closeSheet(true);await this.refresh();this.say('Song added to your library.');});},editor.done);editor.body.append(form);
 }
 playlistForm(){
  const form=el('form','pm-form'),editor=this.openEditor('New playlist','playlist-form','Create',()=>form.requestSubmit());this.field(form,'Name','name',{placeholder:'Give your playlist a name',max:100});this.field(form,'Description','description',{placeholder:'Set the mood',multiline:true,required:false});
  this.formSubmit(form,'Create playlist',async data=>{await this.perform('Peakify/CreatePlaylist',{Name:String(data.get('name')).trim(),Description:String(data.get('description')).trim()},async()=>{this.closeSheet(true);this.tab='library';this.filter='playlists';await this.refresh();this.renderTabs();this.say('Playlist created.');});},editor.done);editor.body.append(form);
 }
 confirm(title,body,fn){const actionLabel=/remove/i.test(title)?'Remove':/purchase/i.test(title)?'Confirm':'Delete',editor=this.openEditor(title,'confirm',actionLabel,async()=>fn());const context=el('div','pm-confirm-context');context.append(el('span','pm-confirm-mark','♪'),el('p','pm-confirm-copy',body));editor.body.append(context);editor.done.classList.add('pm-danger-button');}
 trackMenu(track,playlist=null){
  this.openSheet(track.title||'Song','song-menu');this.sheetBody.append(this.trackRowSummary(track));
  this.sheetAction('Play song',humanDevice(this.network),'play',()=>this.play(track));this.sheetAction('Add to playlist','Keep it in a collection.','playlist',()=>this.choosePlaylist(track));
  if(playlist)this.sheetAction('Remove from playlist','The song stays in its owner’s library.','trash',()=>this.confirm('Remove song?',`Remove “${track.title}” from this playlist?`,()=>this.perform('Peakify/RemoveTrackFromPlaylist',{PlaylistId:playlist.id,TrackId:track.id},async()=>{this.closeSheet(true);await this.refresh();})),true);
  if(this.tracks.some(t=>sameID(t.id,track.id)))this.sheetAction('Delete from library','Also removes the song from playlists.','trash',()=>this.confirm('Delete song?',`Delete “${track.title}” from your library and its playlists?`,()=>this.perform('Peakify/DeleteTrack',{TrackId:track.id},async()=>{this.closeSheet(true);await this.refresh();this.say('Song deleted.');})),true);
 }
 trackRowSummary(track){const row=el('div','pm-song-summary');row.append(artwork(track.id+':'+track.title));const copy=el('div','pm-row-copy');copy.append(el('strong','',track.title||'Song'),el('small','',providerName(track.provider)));row.append(copy);return row;}
 choosePlaylist(track){
  this.openSheet('Add to playlist','choose-playlist');if(!this.playlists.length){this.sheetBody.append(emptyState('playlist','Create a playlist first','Your new playlist will appear here.'));this.sheetAction('New playlist','','plus',()=>this.playlistForm());return;}
  for(const p of this.playlists){const exists=(p.tracks||[]).some(t=>sameID(t.id,track.id));const b=this.sheetAction(p.name,exists?'Already added':`${(p.tracks||[]).length} songs`,exists?'check':'playlist',()=>this.perform('Peakify/AddTrackToPlaylist',{PlaylistId:p.id,TrackId:track.id},async()=>{this.closeSheet(true);await this.refresh();this.say('Added to playlist.');}));b.disabled=exists;}
 }
 addPlaylistTracks(p){this.openSheet('Add songs','add-playlist-tracks');if(!this.tracks.length){this.sheetBody.append(emptyState('music','Save a song first','Your saved songs will appear here.'));this.sheetAction('Add song','','plus',()=>this.trackForm());return;}for(const t of this.tracks){const exists=(p.tracks||[]).some(x=>sameID(x.id,t.id));const b=this.sheetAction(t.title,exists?'Already added':providerName(t.provider),exists?'check':'plus',()=>this.perform('Peakify/AddTrackToPlaylist',{PlaylistId:p.id,TrackId:t.id},async()=>{await this.refresh();this.addPlaylistTracks(this.playlists.find(x=>sameID(x.id,p.id))||p);this.say('Song added.');}));b.disabled=exists;}}
 playlistMenu(p){
  this.openSheet(p.name||'Playlist','playlist-menu');this.sheetAction('Collaborators',`${(p.collaborators||[]).length} collaborators`,'users',()=>this.collaborators(p));
  this.sheetAction('Copy reference','Share this playlist’s ID with a collaborator.','share',()=>this.copyReference(p));
  if(p.isOwner)this.sheetAction('Delete playlist','Saved songs stay in their libraries.','trash',()=>this.confirm('Delete playlist?',`Delete “${p.name}” and its collaborator access?`,()=>this.perform('Peakify/DeletePlaylist',{PlaylistId:p.id},async()=>{this.closeSheet(true);this.playlistID=null;await this.refresh();})),true);
 }
 async copyReference(p){
  const text=`Peak Music playlist #${p.id} — ${p.name}`;
  const copied=await copyText(text);
  if(!this.destroyed)this.notify(copied?'Copied.':'Could not copy. Try again.');
  return copied;
 }
 collaborators(p){
  const form=p.isOwner?el('form','pm-form'):null,editor=this.openEditor('Collaborators','collaborators',p.isOwner?'Add':'Done',()=>form?form.requestSubmit():this.closeSheet());editor.body.append(el('p','pm-helper',p.isOwner?'People you add can manage songs in this playlist.':'Only the playlist owner can change collaborators.'));
  for(const c of p.collaborators||[]){const row=el('div','pm-collaborator');const text=el('div','pm-row-copy');text.append(el('strong','',c.name||c.citizenid),el('small','',c.citizenid));row.append(text);if(p.isOwner)row.append(action('Remove '+(c.name||c.citizenid),'close',()=>this.perform('Peakify/RemoveCollaborator',{PlaylistId:p.id,CitizenId:c.citizenid},async()=>{await this.refresh();const next=this.playlists.find(x=>sameID(x.id,p.id));if(next)this.collaborators(next);else this.closeSheet(true);}),'ios-round-button'));editor.body.append(row);}
  if(p.isOwner){this.field(form,'Character ID','citizenid',{placeholder:'Exact character ID',max:160});this.formSubmit(form,'Add collaborator',data=>this.perform('Peakify/AddCollaborator',{PlaylistId:p.id,CitizenId:String(data.get('citizenid')).trim()},async()=>{await this.refresh();const next=this.playlists.find(x=>sameID(x.id,p.id));if(next)this.collaborators(next);else this.closeSheet(true);}),editor.done);editor.body.append(form);}
 }
 async devices(){
  this.openSheet('Audio output','devices');const body=this.sheetBody;body.append(el('p','pm-helper','Audius catalog audio plays on this phone. Licensed audio links can play through a nearby boombox, a carried speaker, or a vehicle you are sitting in. Connecting here also changes the phone’s current network.'));
  const list=el('div','pm-device-list','Looking for nearby speakers…');body.append(list);
  try{const networks=await this.send('Network/GetNetworks',{});if(this.destroyed||this.sheetBody!==body)return;
   const choices=Array.isArray(networks)?networks.filter(n=>n&&isMusicNetwork(n.Id)):[];list.replaceChildren();
   if(!choices.length)list.append(emptyState('headphones','No nearby speakers','Sit in a vehicle or place/carry a boombox, then refresh.'));
   for(const n of choices){const b=this.promoRow(n.Kind==='vehicle'?'car':'speaker',n.Name||humanDevice(n.Id),this.network===n.Id?'Connected':'Tap to connect',()=>this.perform('Network/Connect',{Network:n.Id,Password:''},()=>{this.network=String(n.Id);this.stores.CurrentNetwork.set(this.network);this.closeSheet(true);this.refreshDevice();this.say('Speaker connected.');}));b.dataset.selected=String(this.network===n.Id);list.append(b);}
   body.append(labelledAction('Refresh speakers','refresh',()=>this.devices(),'pm-button pm-secondary'));
  }catch(e){if(this.sheetBody===body){list.replaceChildren(emptyState('headphones','Could not find speakers',e.message));body.append(labelledAction('Try again','refresh',()=>this.devices(),'pm-button'));}}
  if(this.sheetBody===body){
   body.append(el('h3','pm-output-title','Playback settings'));
   for(const [name,label,min,max,step,unit] of [['volume','Volume',5,100,1,'%'],['radius','Range',8,60,1,' m']]){
    const wrap=el('label','pm-slider');const cap=el('span','');const value=el('strong','',this[name]+unit);cap.append(el('span','',label),value);const slider=el('input');slider.type='range';slider.min=min;slider.max=max;slider.step=step;slider.value=this[name];slider.setAttribute('aria-label',label);slider.addEventListener('input',()=>{this[name]=Number(slider.value);value.textContent=this[name]+unit;});wrap.append(cap,slider);body.append(wrap);
   }
   body.append(el('p','pm-helper','These settings apply when you start a song. The existing audio backend does not expose seamless seeking or live output updates.'));
   if(this.session)body.append(labelledAction('Apply & restart song','refresh',()=>this.play({url:this.session.Url,title:this.session.Title}),'pm-button'));
   if(this.network.startsWith('peakify-carried-'))body.append(labelledAction('Stop carrying boombox','speaker',()=>this.perform('Peakify/StopCarry',{},()=>{this.closeSheet(true);this.say('Stopped carrying boombox.');this.refreshDevice();}),'pm-button pm-secondary'));
  }
 }
 updateAudioProgress(){
  if(this.sheetType!=='audio-now')return;
  const a=this.audioPlayer,slider=this.sheet.querySelector('[aria-label="Seek song"]');
  const duration=Number.isFinite(a.audio.duration)?a.audio.duration:(a.track?.duration||0);
  if(slider){slider.max=duration;slider.value=a.audio.currentTime||0;slider.disabled=!duration;}
  const time=this.sheet.querySelector('.pm-audio-time');if(time)time.textContent=`${formatDuration(a.audio.currentTime)||'0:00'} / ${formatDuration(duration)||'0:00'}`;
  const toggle=this.sheet.querySelector('.pm-transport-primary');if(toggle){toggle.setAttribute('aria-label',a.audio.paused?'Resume playback':'Pause playback');toggle.innerHTML=icon(a.audio.paused?'play':'pause');}
  const status=this.sheet.querySelector('.pm-audio-status');if(status)status.textContent=a.error||(a.audio.paused?'Paused':'Playing on this phone');
 }
 nowPlaying(preserveFocus=false){
  const a=this.audioPlayer;
  if(a.track){
   const t=a.track;this.openSheet('Now Playing','audio-now',{preserveFocus});this.sheetBody.classList.add('pm-now');
   const image=el('img','pm-audio-cover');image.src=t.artwork;image.alt='';image.referrerPolicy='no-referrer';this.sheetBody.append(image,el('h2','pm-now-title',t.title),el('p','pm-now-sub',t.channel+' · Verified on Audius'),el('p','pm-audio-status'));
   const seek=el('input','pm-audio-seek');seek.type='range';seek.min=0;seek.step=1;seek.setAttribute('aria-label','Seek song');seek.addEventListener('change',()=>a.seek(Number(seek.value)));this.sheetBody.append(seek,el('p','pm-audio-time'));
   const controls=el('div','pm-now-controls');controls.append(action('Play previous saved song','previous',()=>this.nextTrack(-1),'pm-transport'),action('Pause playback','pause',()=>a.toggle(),'pm-transport pm-transport-primary'),action('Play next saved song','next',()=>this.nextTrack(1),'pm-transport'));this.sheetBody.append(controls,labelledAction('Save song','plus',()=>this.saveCatalog(t),'pm-text-button'),labelledAction('Stop','stop',()=>this.stop(),'pm-text-button'),el('p','pm-helper','Audio only · Use the phone side buttons for volume. Putting the phone away stops playback.'));
   this.updateAudioProgress();return;
  }
  if(!this.session)return this.devices();const s=this.session;this.openSheet('Now Playing','now',{preserveFocus});this.sheetBody.classList.add('pm-now');
  this.sheetBody.append(artwork(s.Url,s.Provider==='link'?'PEAK MUSIC':'',true),el('h2','pm-now-title',s.Title||'Untitled song'),el('p','pm-now-sub',humanDevice(this.network)),el('p','pm-stream-label',s.Paused?'PAUSED':'PLAYING ON SPEAKER'));
  const controls=el('div','pm-now-controls');const previous=action('Play previous saved song','previous',()=>this.nextTrack(-1),'pm-transport');const next=action('Play next saved song','next',()=>this.nextTrack(1),'pm-transport');const selection=this.playlistID?(this.playlists.find(p=>sameID(p.id,this.playlistID))?.tracks||[]):this.tracks;previous.disabled=next.disabled=!selection.length;
  controls.append(previous,action(s.Paused?'Resume playback':'Pause playback',s.Paused?'play':'pause',()=>this.togglePause(),'pm-transport pm-transport-primary'),next);this.sheetBody.append(controls);
  const actions=el('div','pm-now-actions');actions.append(labelledAction('Output','headphones',()=>this.devices(),'pm-text-button'),labelledAction('Stop','stop',()=>this.stop(),'pm-text-button'));this.sheetBody.append(actions);
  this.sheetBody.append(el('p','pm-helper','Sound plays in the game world. Skipping selects another saved song; playback availability depends on the audio URL.'));
 }
 $destroy(){this.destroyed=true;this.catalog.destroy();this.audioPlayer.destroy();++this.readGeneration;++this.deviceGeneration;this.unsub?.();clearInterval(this.poll);clearTimeout(this.toastTimer);this.node.remove();}
}
