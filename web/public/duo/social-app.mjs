import {createFrostedSurface} from './frosted-surface.mjs';
/** Y: an in-game social client, not an integration with the external X service.
 * Posts/activity and profiles/follows/premium are server-persisted.
 * Bookmarks, mutes and drafts are explicitly device-local and scoped to server + SIM.
 */
import {NativeView,el,icon,avatar,value,rows,isRows,safeImage,relativeTime,dateTime,field,byteLength,readLocal,writeLocal} from './native-kit.mjs?rev=owner-config-20261015';
export function normalizePosts(data){return rows(data).filter(p=>p&&Number.isSafeInteger(Number(p.Id))&&Number(p.Id)>0).map(p=>({...p,Id:Number(p.Id),Images:rows(p.Images).length?rows(p.Images):(p.Image?[p.Image]:[])})).sort((a,b)=>b.Id-a.Id);}
export function postMatches(p,query){const q=String(query||'').trim().toLowerCase();return !q||[p.Msg,p.Sender,p.Name].some(t=>String(t||'').toLowerCase().includes(q));}
export function canPublish(draft){return byteLength(draft.Msg||'')<=1000&&rows(draft.Images).length<=4&&!!(String(draft.Msg||'').trim()||rows(draft.Images).length||draft.QuoteId);}
const NAV=[['home','Home','home'],['explore','Explore','search'],['notifications','Notifications','bell'],['bookmarks','Bookmarks','bookmark'],['messages','Messages','mail']];
const plainName=p=>String(p?.Name||p?.Sender||'Unknown').replace(/_/g,' ');
const handle=p=>String(p?.Username||p?.Sender||'unknown').replace(/^@/,'');
function yEditor(view,title,kind,actionLabel,action,{onClose}={}){
 const panel=view.openSheet(title,{header:false,onClose});panel.classList.add('nx-y-editor','nx-y-editor-'+kind);
 const nav=el('header','nx-y-editor-nav');nav.append(view.textButton('Cancel','',()=>view.closeSheet(),'nx-y-editor-cancel'),el('h2','',title));
 const done=view.textButton(actionLabel,'',()=>action?.(done),'nx-y-editor-done');nav.append(done);panel.append(nav);return {panel,done};
}
export class SocialApp extends NativeView {
 constructor(options){
  super(options);this.element.classList.add('nx-y');this.element.setAttribute('aria-label','Y');
  this.me=value(this.stores?.PlayerData)||{};this.cid=String(this.me.Cid||'');
  this.posts=[];this.notifications=[];this.myProfile={Cid:this.cid,Name:this.me.CharName||this.me.Name||'Your profile',Username:(this.me.CharName||'').replace(/ /g,'_')};
  this.profileRequest=0;this.view='home';this.feed='for-you';this.query='';this.explore='latest';this.profileFilter='posts';this.history=[];this.limit=40;this.loading=true;this.error='';this.busy=new Set();this.session='';this.targetGeneration=0;this.navigationGeneration=0;this.targetQueue=Promise.resolve();this.reloading=false;this.reloadAgain=false;this.reloadPromise=null;
  this.saved=readLocal(this.context,'y-bookmarks',{session:'',ids:[]});if(!this.saved||!Array.isArray(this.saved.ids))this.saved={session:'',ids:[]};
  this.bookmarks=new Set(this.saved.ids.map(Number));this.muted=new Set(rows(readLocal(this.context,'y-muted',[])).map(String));
  this.render();this.initialLoad=this.reload();
  this.messages(d=>{if(d.Action==='Y/SetPosts'&&isRows(d.Posts)){this.posts=normalizePosts(d.Posts);this.updateBody();this.scheduleActivity();}else if(['Y/SocialChanged','AppRefresh/y'].includes(d.Action))this.scheduleActivity();});
 }
 scheduleActivity(){clearTimeout(this.activityTimer);this.activityTimer=setTimeout(async()=>{try{const meta=await this.send('Y/GetSocialState',{});if(this.alive&&meta?.Success){this.acceptMeta(meta);this.updateBadge();if(this.view==='notifications')this.updateBody();}}catch{/* Explicit refresh displays transport errors; do not spam passive toasts. */}},250);}
 acceptMeta(meta){this.notifications=rows(meta.Notifications);this.session=String(meta.Session||'');if(this.saved.session!==this.session){this.bookmarks.clear();this.saved={session:this.session,ids:[]};writeLocal(this.context,'y-bookmarks',this.saved);}}
 scheduleReload(){clearTimeout(this.reloadTimer);this.reloadTimer=setTimeout(()=>this.reload(),180);}
 async reload(){
  if(this.reloading){this.reloadAgain=true;return this.reloadPromise;}
  this.reloading=true;this.error='';
  this.reloadPromise=(async()=>{
   try{
    const [feed,meta,profile]=await Promise.all([this.send('Y/GetFeed',{}),this.send('Y/GetSocialState',{}),this.send('Y/GetProfile',{})]);
    if(!this.alive)return;if(!feed?.Success||!isRows(feed.Posts))throw Error('Y returned an invalid feed.');if(!meta||meta.Success!==true)throw Error('Social features are unavailable. Install the matching Y client and server update.');
    const posts=normalizePosts(feed.Posts),threadPost=this.view==='thread'?this.posts.find(post=>post.Id===Number(this.threadId)):null;
    if(threadPost&&!posts.some(post=>post.Id===threadPost.Id))posts.push(threadPost);
    this.posts=posts.sort((a,b)=>b.Id-a.Id);this.feedCursor=feed.Next;this.feedHasMore=!!feed.HasMore;this.acceptMeta(meta);
    if(profile&&typeof profile==='object'&&profile.Cid)this.myProfile=profile;
    if(this.view==='profile'&&this.profileCid===this.cid)this.profile=this.myProfile;
   }catch(e){if(this.alive)this.error=e.message;}finally{
    this.reloading=false;if(this.alive){this.loading=false;this.updateBody();this.updateBadge();if(this.reloadAgain){this.reloadAgain=false;this.scheduleReload();}}
   }
  })();
  return this.reloadPromise;
 }
 updateBadge(){const n=this.notifications.filter(n=>n.Unread).length,b=this.element.querySelector('.nx-y-bottom [data-tab=notifications]');if(b){b.querySelector('.nx-badge')?.remove();if(n)b.append(el('span','nx-badge',n>99?'99+':n));}}
 go(view,extra={},remember=false,{preserveTarget=false}={}){if(!preserveTarget)this.targetGeneration++;this.navigationGeneration++;if(remember)this.history.push({view:this.view,threadId:this.threadId,profileCid:this.profileCid,profile:this.profile});else this.history=[];this.view=view;Object.assign(this,extra);this.limit=40;this.render();if(view==='notifications')this.markRead();}
 back(){this.targetGeneration++;this.navigationGeneration++;const previous=this.history.pop();if(previous){Object.assign(this,previous);this.render();}else this.go('home');}
 render(){
  this.dockBlur?.destroy();this.closeSheet();this.element.replaceChildren();const header=el('header','nx-y-header');
  if(['thread','profile'].includes(this.view))header.append(this.button('Back','back',()=>this.back()));
  else{const b=this.button('Account menu',null,()=>this.accountMenu(),'nx-account');b.replaceChildren(avatar(this.myProfile.Name,this.myProfile.Avatar));header.append(b);}
  const title={home:'Y',explore:'Explore',notifications:'Notifications',bookmarks:'Bookmarks',thread:'Post',profile:'Profile'}[this.view]||'Y';header.append(el('h1',this.view==='home'?'nx-y-wordmark':'',title),this.button('Refresh Y','refresh',()=>this.reload()));this.element.append(header);
  if(this.view==='home')this.element.append(this.tabs([['for-you','For you'],['following','Following']],this.feed,id=>{this.feed=id;this.render();},'nx-y-feed-tabs'));
  if(this.view==='explore'){const tools=el('div','nx-y-tools');tools.append(this.search('Search posts, people or #topics',q=>{this.query=q;this.limit=40;this.updateBody();clearTimeout(this.searchTimer);if(q.trim().length>=2)this.searchTimer=setTimeout(()=>this.remoteSearch(q),250);},this.query),this.tabs([['latest','Latest'],['top','Top'],['people','People']],this.explore,id=>{this.explore=id;this.render();},'nx-y-feed-tabs'));this.element.append(tools);}
  this.body=el('div','nx-scroll nx-y-body');this.element.append(this.body);this.updateBody();
  if(!['thread','profile'].includes(this.view)){this.compose=this.button('Compose post','plus',()=>this.composer(),'nx-y-compose');this.element.append(this.compose);}
  this.element.append(this.tabs(NAV,this.view,id=>id==='messages'?this.openApp?.('messages'):this.go(id),'nx-tabs nx-y-bottom'));this.dockBlur=createFrostedSurface({bar:this.element.querySelector('.nx-y-bottom'),source:this.body});this.updateBadge();
 }
 updateBody(){
  if(!this.body?.isConnected)return;const scroll=this.body.scrollTop;this.body.replaceChildren();
  if(this.loading&&!this.posts.length){this.body.append(this.empty('Opening Y…','Fetching the latest from your city.','at-sign'));return;}
  if(this.error){this.body.append(this.empty('Could not refresh Y',this.error,'wifi',()=>this.reload()));if(!this.posts.length)return;}
  if(this.view==='profile'){this.renderProfile();this.body.scrollTop=scroll;return;}
  if(this.view==='thread'){this.renderThread();this.body.scrollTop=scroll;return;}
  if(this.view==='notifications'){this.renderNotifications();this.body.scrollTop=scroll;return;}
  let list=this.posts.filter(p=>!p.ReplyTo&&!this.muted.has(String(p.Cid)));
  if(this.view==='home'&&this.feed==='following')list=list.filter(p=>p.IsFollowing||String(p.Cid)===this.cid);
  if(this.view==='bookmarks'){this.body.append(el('p','nx-y-context','Saved on this device for this character.'));list=this.posts.filter(p=>this.bookmarks.has(p.Id));if(!list.length){this.body.append(this.empty('Keep the good posts','Use the bookmark button on a post to save it here.','bookmark'));return;}}
  if(this.view==='explore'){
   if(this.explore==='people'){this.renderPeople();this.body.scrollTop=scroll;return;}
   if(!this.query.trim())this.renderTopics();list=this.posts.filter(p=>!p.RepostOf&&!this.muted.has(String(p.Cid))&&postMatches(p,this.query));
   if(this.explore==='top')list.sort((a,b)=>(Number(b.LikeCount||0)+Number(b.ReplyCount||0))-(Number(a.LikeCount||0)+Number(a.ReplyCount||0))||b.Id-a.Id);
  }
  if(!list.length)this.body.append(this.empty(this.feed==='following'&&this.view==='home'?'Find your people':'Nothing here yet',this.feed==='following'&&this.view==='home'?'Follow people from their profiles to see their posts here.':'Try another search, or start the conversation.','message-circle'));
  this.appendPosts(list);if(this.feedHasMore&&['home','explore'].includes(this.view))this.body.append(this.textButton('Load older posts','plus',()=>this.loadOlder(),'nx-load-more'));this.body.scrollTop=scroll;
 }
 async loadOlder(){if(!this.feedCursor||this.loadingOlder)return;this.loadingOlder=true;try{const feed=await this.checked('Y/GetFeed',{Before:this.feedCursor});const known=new Set(this.posts.map(p=>p.Id));this.posts.push(...normalizePosts(feed.Posts).filter(p=>!known.has(p.Id)));this.posts.sort((a,b)=>b.Id-a.Id);this.feedCursor=feed.Next;this.feedHasMore=!!feed.HasMore;this.updateBody();}catch(e){this.notify(e.message);}finally{this.loadingOlder=false;}}
 appendPosts(list){for(const p of list.slice(0,this.limit))this.body.append(this.postCard(p));if(list.length>this.limit)this.body.append(this.textButton('Load more posts','plus',()=>{this.limit+=40;this.updateBody();},'nx-load-more'));}
 richText(text){const node=el('div','nx-post-text');for(const token of String(text||'').split(/((?:#|@)[\p{L}\p{N}_]+)/u)){if(/^[#@][\p{L}\p{N}_]+$/u.test(token)){const b=this.textButton(token,null,()=>{this.query=token;this.explore=token[0]==='@'?'people':'latest';this.go('explore');},'nx-inline-link');node.append(b);}else node.append(document.createTextNode(token));}return node;}
 image(url,alt,cls=''){const safe=safeImage(url);if(!safe)return el('span','nx-image-unavailable','Image unavailable');const img=new Image();img.src=safe;img.alt=alt;img.className=cls;img.loading='lazy';img.referrerPolicy='no-referrer';img.addEventListener('error',()=>{img.replaceWith(el('span','nx-image-unavailable','Image unavailable'));},{once:true});return img;}
 postCard(entry,{detail=false,compact=false}={}){
  const card=el('article','nx-post'+(detail?' nx-post-detail':'')+(compact?' nx-post-compact':''));card.dataset.postId=String(entry.Id);
  const p=entry.RepostOf?(this.posts.find(p=>p.Id===Number(entry.RepostOf))||entry.Original):entry;
  if(entry.RepostOf){const line=el('div','nx-repost-label');line.innerHTML=icon('repeat');line.append(this.textButton(`${plainName(entry)} reposted`,null,()=>this.showProfile(entry.Cid)));card.append(line);}
  if(!p){card.append(el('p','nx-y-context','This post is no longer available.'));return card;}
  const grid=el('div','nx-post-grid'),av=this.button(`View ${plainName(p)} profile`,null,()=>this.showProfile(p.Cid),'nx-post-avatar');av.replaceChildren(avatar(plainName(p),p.Avatar));grid.append(av);
  const content=el('div','nx-post-content'),head=el('div','nx-post-heading'),name=this.textButton(plainName(p),null,()=>this.showProfile(p.Cid),'nx-post-name');head.append(name);
  if(p.IsPremium){const badge=el('span','nx-verified');badge.innerHTML=icon('check');badge.title='Y Premium';head.append(badge);}
  head.append(el('span','nx-post-handle','@'+handle(p)),el('time','',relativeTime(p.Timestamp)));
  if(!compact)head.append(this.button('Post options','more',()=>this.postMenu(p),'nx-post-more'));content.append(head);
  if(p.ReplyTo){const reply=this.textButton('Replying to a post',null,()=>this.thread(Number(p.ReplyTo)),'nx-reply-context');content.append(reply);}
  content.append(this.richText(p.Msg));
  const images=rows(p.Images).length?rows(p.Images):p.Image?[p.Image]:[];
  if(images.length){const media=el('div','nx-post-media');media.dataset.count=String(Math.min(4,images.length));for(const [i,url]of images.slice(0,4).entries()){const b=this.button('Open image '+(i+1),null,()=>this.showImage(url),'nx-media-tile');b.replaceChildren(this.image(url,`Image ${i+1} attached to this post`));media.append(b);}content.append(media);}
  if(p.QuoteId){const quoted=this.posts.find(q=>q.Id===Number(p.QuoteId))||p.Quote;const quote=this.button('Open quoted post',null,()=>this.thread(Number(p.QuoteId)),'nx-quote');if(quoted){quote.replaceChildren(el('strong','',plainName(quoted)),el('span','nx-muted','@'+handle(quoted)),el('p','',String(quoted.Msg||'Image post').slice(0,220)));}else quote.textContent='Quoted post is no longer available.';content.append(quote);}
  if(detail)content.append(el('p','nx-post-date',dateTime(p.Timestamp)));
  if(!compact){const actions=el('div','nx-post-actions');for(const [name,glyph,count,on,fn] of [
   ['Reply','message-circle',p.ReplyCount,false,()=>this.composer({ReplyTo:p.Id})],
   [p.HasReposted?'Undo repost or quote':'Repost or quote','repeat',p.RepostCount,p.HasReposted,()=>this.repostMenu(p)],
   [p.HasLiked?'Unlike':'Like','heart',p.LikeCount,p.HasLiked,()=>this.like(p)],
   [this.bookmarks.has(p.Id)?'Remove bookmark':'Bookmark','bookmark',null,this.bookmarks.has(p.Id),()=>this.toggleBookmark(p)],
   ['Share post','share',null,false,()=>this.sharePost(p)]]){
    const b=this.button(name,glyph,fn,'nx-post-action');b.dataset.kind=glyph;if(count!=null)b.append(el('span','',Number(count)||0));if(['heart','bookmark','repeat'].includes(glyph))b.setAttribute('aria-pressed',String(!!on));b.disabled=this.busy.has(glyph+':'+p.Id);actions.append(b);
   }content.append(actions);
   card.tabIndex=0;card.setAttribute('aria-label',`Post by ${plainName(p)}`);card.addEventListener('click',e=>{if(!e.target.closest('button,a,input,textarea'))this.thread(p.Id);});card.addEventListener('keydown',e=>{if(e.target===card&&['Enter',' '].includes(e.key)){e.preventDefault();this.thread(p.Id);}});
  }
  grid.append(content);card.append(grid);return card;
 }
 showImage(url){const p=this.openSheet('Image');p.classList.add('nx-image-sheet');p.append(this.image(url,'Attached image'));}
 async mergeRemote(route,data,{guard=()=>true}={}){const result=await this.send(route,data);if(!result?.Success||!isRows(result.Posts))throw Error(result?.Message||'Y returned invalid results.');if(!this.alive||!guard())return false;const merged=new Map(this.posts.map(p=>[p.Id,p]));for(const post of normalizePosts(result.Posts))merged.set(post.Id,post);this.posts=[...merged.values()].sort((a,b)=>b.Id-a.Id);this.updateBody();return result;}
 async remoteSearch(query){try{await this.mergeRemote('Y/Search',{Query:query});}catch(e){if(this.alive)this.notify(e.message);}}
 async openTarget(target={}, {isCurrent=()=>true}={}){
  const id=Number(target.PostId);if(!Number.isSafeInteger(id)||id<1)return false;
  const generation=++this.targetGeneration;
  const current=()=>this.alive&&generation===this.targetGeneration&&isCurrent();
  const run=async()=>{
   try{
    if(!current())return false;
    await this.initialLoad;
    while(this.reloading&&this.reloadPromise){const pending=this.reloadPromise;await pending;if(!current())return false;if(this.reloadPromise===pending)break;}
    if(!current())return false;
    return await this.thread(id,{requestGeneration:generation,guard:current});
   }catch(error){if(current())this.notify(error.message);return false;}
  };
  const task=this.targetQueue.then(run,run);this.targetQueue=task.catch(()=>false);return task;
 }
 async thread(id,{requestGeneration=null,guard=()=>true}={}){
  const targetGeneration=requestGeneration==null?++this.targetGeneration:requestGeneration;
  this.go('thread',{threadId:Number(id)},true,{preserveTarget:true});const navigation=this.navigationGeneration;
  const current=()=>this.alive&&targetGeneration===this.targetGeneration&&navigation===this.navigationGeneration&&guard();
  if(!current())return false;
  const restorePriorView=()=>{if(this.alive&&targetGeneration===this.targetGeneration&&navigation===this.navigationGeneration)this.back();};
  try{const result=await this.mergeRemote('Y/GetThread',{Id:Number(id)},{guard:current});if(result===false&&!guard())restorePriorView();return result;}
  catch(e){if(!guard())restorePriorView();else if(this.alive&&targetGeneration===this.targetGeneration&&navigation===this.navigationGeneration)this.notify(e.message);return false;}
 }
 renderThread(){const p=this.posts.find(p=>p.Id===this.threadId);if(!p){this.body.append(this.empty('Post unavailable','It may have been deleted, moderated, or cleared when the server restarted.','message-circle'));return;}
  if(p.ReplyTo){const parent=this.posts.find(q=>q.Id===Number(p.ReplyTo));this.body.append(parent?this.postCard(parent):el('p','nx-y-context','The original post is no longer available.'));}
  this.body.append(this.postCard(p,{detail:true}),this.textButton('Post your reply','message-circle',()=>this.composer({ReplyTo:p.Id}),'nx-thread-reply'));
  const replies=this.posts.filter(q=>Number(q.ReplyTo)===p.Id).sort((a,b)=>a.Id-b.Id);if(!replies.length)this.body.append(el('p','nx-y-context','Be the first to reply.'));this.appendPosts(replies);
 }
 async like(p){await this.mutate('heart:'+p.Id,async()=>{const r=await this.checked('Y/ToggleLike',{Id:p.Id});p.HasLiked=r.HasLiked;p.LikeCount=r.LikeCount;});}
 async mutate(key,fn){if(this.busy.has(key))return;this.busy.add(key);this.updateBody();try{await fn();if(this.alive)this.scheduleReload();}finally{this.busy.delete(key);if(this.alive)this.updateBody();}}
 toggleBookmark(p){if(this.bookmarks.has(p.Id))this.bookmarks.delete(p.Id);else this.bookmarks.add(p.Id);this.saved={session:this.session,ids:[...this.bookmarks].slice(-2000)};if(!writeLocal(this.context,'y-bookmarks',this.saved))this.notify('Bookmark updated for this visit. Device storage is unavailable.');this.updateBody();}
 repostMenu(p){const sheet=this.openSheet('Repost');sheet.append(this.textButton(p.HasReposted?'Undo repost':'Repost','repeat',async()=>{this.closeSheet();await this.mutate('repeat:'+p.Id,async()=>{const r=await this.checked('Y/ToggleRepost',{Id:p.Id});p.HasReposted=r.HasReposted;p.RepostCount=r.RepostCount;});}),this.textButton('Quote post','edit',()=>this.composer({QuoteId:p.Id})));}
 sharePost(p){const panel=this.openSheet('Share post');const text=`${plainName(p)} (@${handle(p)}) on Y: ${p.Msg||'Image post'}${p.Image?' '+p.Image:''}`;panel.append(el('p','nx-note','Share a text copy. Y is your server’s in-game social network, not the external X website.'),this.textButton('Copy post text','share',()=>this.copy(text)),this.textButton('Send as SMS','message-circle',()=>this.shareSMS(text)));}
 shareSMS(text){const sheet=yEditor(this,'Send post by SMS','share','Send',done=>this.submitY(done,async()=>{const target=phone.input.value.trim(),body=message.input.value.trim();if(!target||!body)throw Error('Enter a phone number and message.');await this.checked('Messages/SendMessage',{Phone:target,Message:body,Attachments:[]});this.closeSheet();this.notify('Message sent.');},sheet.panel)),panel=sheet.panel;const context=el('div','nx-y-share-context');context.append(el('p','',String(text).slice(0,280)));const phone=field('To',{type:'tel',maxLength:24}),message=field('Message',{tag:'textarea',value:text,maxLength:1000});phone.input.inputMode='tel';phone.input.autocomplete='tel';panel.append(context,phone.wrapper,message.wrapper);sheet.done.disabled=!phone.input.value.trim();phone.input.addEventListener('input',()=>sheet.done.disabled=!phone.input.value.trim()||!message.input.value.trim());message.input.addEventListener('input',()=>sheet.done.disabled=!phone.input.value.trim()||!message.input.value.trim());}
 postMenu(p){const panel=this.openSheet('Post options');if(String(p.Cid)===this.cid)panel.append(this.textButton('Delete post','trash',()=>this.confirm('Delete post?','This removes the post and its reposts for everyone. Replies will remain with an unavailable parent.',async()=>{await this.checked('Y/DeletePost',{Id:p.Id});this.posts=this.posts.filter(q=>q.Id!==p.Id&&Number(q.RepostOf)!==p.Id);this.closeSheet();this.updateBody();this.scheduleReload();}),'nx-danger'));
  else panel.append(this.textButton('View profile','users',()=>{this.closeSheet();this.showProfile(p.Cid);}),this.textButton('Mute this account on this device','bell-off',()=>{this.muted.add(String(p.Cid));writeLocal(this.context,'y-muted',[...this.muted]);this.closeSheet();this.updateBody();this.notify('Account muted on this device.');}),this.textButton('Report post','flag',()=>this.confirm('Report post?','Send this post to your server’s moderation system. Reports are limited to one per character.',async()=>{await this.checked('Y/ReportPost',{Id:p.Id});this.closeSheet();this.notify('Report sent.');})));
  panel.append(this.textButton('Copy post text','share',()=>this.copy(p.Msg||'')));
 }
 submitY(button,fn,parent){if(this.yEditorBusy)return;this.yEditorBusy=true;button.disabled=true;button.setAttribute('aria-busy','true');try{return Promise.resolve(fn()).catch(error=>{if(this.alive&&this.sheet?.panel===parent){parent.querySelector('.nx-y-editor-error')?.remove();const status=el('p','nx-y-editor-error',error.message||'The action could not be completed.');status.setAttribute('role','alert');parent.append(status);}else if(this.alive)this.notify(error.message||'The action could not be completed.');}).finally(()=>{this.yEditorBusy=false;if(button.isConnected){button.disabled=false;button.removeAttribute('aria-busy');}});}catch(error){this.yEditorBusy=false;button.disabled=false;button.removeAttribute('aria-busy');this.notify(error.message||'The action could not be completed.');return null;}}
 confirm(title,body,fn){const sheet=yEditor(this,title,'confirm','Confirm',done=>this.submitY(done,async()=>{await fn();if(this.sheet?.panel===sheet.panel)this.closeSheet();},sheet.panel)),panel=sheet.panel,context=el('div','nx-y-confirm-context');context.append(el('p','',body));panel.append(context);sheet.done.classList.add('is-destructive');}
 renderTopics(){const counts=new Map();for(const p of this.posts.filter(p=>!p.RepostOf))for(const tag of new Set(String(p.Msg||'').match(/#[\p{L}\p{N}_]+/gu)||[]))counts.set(tag.toLowerCase(),(counts.get(tag.toLowerCase())||0)+1);if(!counts.size)return;const box=el('section','nx-topics');box.append(el('h2','','In your city'));for(const [tag,count]of [...counts].sort((a,b)=>b[1]-a[1]).slice(0,5)){const b=this.button('Search '+tag,null,()=>{this.query=tag;this.render();});b.replaceChildren(el('strong','',tag),el('span','nx-muted',`${count} post${count===1?'':'s'}`));box.append(b);}this.body.append(box);}
 renderPeople(){const people=new Map();people.set(this.cid,this.myProfile);for(const p of this.posts)if(!people.has(String(p.Cid)))people.set(String(p.Cid),p);const q=this.query.toLowerCase().replace(/^@/,'');let count=0;for(const [cid,p]of people){if(!postMatches({...p,Sender:handle(p)},q))continue;count++;const b=this.button('View '+plainName(p)+' profile',null,()=>this.showProfile(cid),'nx-person-row');const title=el('div');title.append(el('strong','',plainName(p)),el('span','nx-muted','@'+handle(p)));b.replaceChildren(avatar(plainName(p),p.Avatar),title);this.body.append(b);}if(!count)this.body.append(this.empty('No people found','Search the name or handle of someone posting in this city.','users'));}
 async showProfile(cid){cid=String(cid||this.cid);this.profile=null;this.profileError='';this.go('profile',{profileCid:cid},true);const request=++this.profileRequest;try{const [data]=await Promise.all([this.send('Y/GetProfile',cid===this.cid?{}:{Cid:cid}),this.mergeRemote('Y/GetProfilePosts',{Cid:cid})]);if(!this.alive||this.profileCid!==cid||request!==this.profileRequest)return;if(!data||typeof data!=='object'||!data.Cid)throw Error('This profile is unavailable.');const observed=this.posts.find(p=>String(p.Cid)===cid);if(data.Name==='Unknown'&&observed){data.Name=plainName(observed);data.Username=handle(observed);data.Avatar=observed.Avatar;}this.profile=data;}catch(e){if(this.alive&&this.profileCid===cid)this.profileError=e.message;}finally{if(this.alive&&this.view==='profile'&&this.profileCid===cid)this.updateBody();}}
 renderProfile(){const p=this.profile;if(!p){this.body.append(this.empty(this.profileError?'Profile unavailable':'Opening profile…',this.profileError||'Fetching profile and follow information.','users',this.profileError?()=>this.showProfile(this.profileCid):null));return;}
  const hero=el('section','nx-profile'),banner=el('div','nx-profile-banner');if(safeImage(p.Banner))banner.append(this.image(p.Banner,'Profile banner'));hero.append(banner);const top=el('div','nx-profile-top');top.append(avatar(p.Name,p.Avatar,'nx-avatar-large'));const mine=String(p.Cid)===this.cid;
  const control=this.textButton(mine?'Edit profile':p.IsFollowing?'Following':'Follow',null,()=>mine?this.editProfile(p):this.follow(p),'nx-profile-follow');control.disabled=this.busy.has('follow:'+p.Cid);top.append(control);hero.append(top,el('h2','',p.Name),el('p','nx-muted','@'+handle(p)));if(p.Bio)hero.append(el('p','nx-profile-bio',p.Bio));const counts=el('div','nx-profile-counts');for(const [n,label]of [[p.Following,'Following'],[p.Followers,'Followers']]){const c=el('span');c.append(el('strong','',Number(n)||0),document.createTextNode(' '+label));counts.append(c);}hero.append(counts);this.body.append(hero);
  const tabs=[['posts','Posts'],['replies','Replies'],['media','Media']];if(mine)tabs.push(['likes','Likes']);this.body.append(this.tabs(tabs,this.profileFilter,id=>{this.profileFilter=id;this.limit=40;this.updateBody();},'nx-y-feed-tabs'));
  const list=this.posts.filter(post=>this.profileFilter==='likes'?post.HasLiked:String(post.Cid)===String(p.Cid)&&(this.profileFilter==='replies'?!!post.ReplyTo:this.profileFilter==='media'?!!(rows(post.Images).length||post.Image):!post.ReplyTo));if(!list.length)this.body.append(this.empty('No '+this.profileFilter+' yet',mine?'Your activity will appear here.':'Check back after this person posts.','message-circle'));this.appendPosts(list);
 }
 async follow(p){await this.mutate('follow:'+p.Cid,async()=>{const response=await this.checked('Y/ToggleFollow',{TargetCid:String(p.Cid)});const delta=response.IsFollowing?1:-1;p.IsFollowing=response.IsFollowing;p.Followers=Math.max(0,Number(p.Followers||0)+delta);for(const post of this.posts)if(String(post.Cid)===String(p.Cid))post.IsFollowing=p.IsFollowing;});}
 editProfile(p){const sheet=yEditor(this,'Edit profile','profile','Save',done=>this.submitY(done,async()=>{const data={Name:name.input.value.trim(),Bio:bio.input.value,Avatar:av.input.value.trim(),Banner:banner.input.value.trim()};if(!data.Name||byteLength(data.Name)>100||byteLength(data.Bio)>1000||[data.Avatar,data.Banner].some(u=>u&&!safeImage(u)))throw Error('Check the name, bio length and HTTPS image URLs.');await this.checked('Y/UpdateProfile',data);if(!this.alive)return;this.profile={...p,...data};this.myProfile=this.profile;this.closeSheet();this.updateBody();this.scheduleReload();},sheet.panel)),panel=sheet.panel;const name=field('Display name',{value:p.Name,maxLength:100}),bio=field('Bio',{tag:'textarea',value:p.Bio||'',maxLength:1000}),av=field('Avatar image URL',{value:safeImage(p.Avatar),placeholder:'https://…',maxLength:2048}),banner=field('Banner image URL',{value:safeImage(p.Banner),placeholder:'https://…',maxLength:2048});const hero=el('div','nx-y-profile-preview');const bannerPreview=el('div','nx-y-profile-banner-preview');if(safeImage(p.Banner)){const image=this.image(p.Banner,'Profile banner');bannerPreview.append(image);}const identity=el('div','nx-y-profile-identity'),identityText=el('div');identityText.append(el('strong','',p.Name),el('small','','@'+handle(p)));identity.append(avatar(p.Name,p.Avatar,'nx-avatar-large'),identityText);hero.append(bannerPreview,identity);panel.append(hero,el('p','nx-y-editor-section','PROFILE'),name.wrapper,bio.wrapper,el('p','nx-y-editor-section','PHOTOS'),av.wrapper,banner.wrapper,el('p','nx-note','Your handle comes from your character’s name. Images must use HTTPS.'));
  const refresh=()=>{identity.querySelector('.nx-avatar')?.replaceWith(avatar(name.input.value.trim()||p.Name,av.input.value,'nx-avatar-large'));identity.querySelector('strong').textContent=name.input.value.trim()||'Your profile';const handleNode=identity.querySelector('small');if(handleNode)handleNode.textContent='@'+(name.input.value.trim()||handle(p)).replace(/\s+/g,'_');bannerPreview.replaceChildren();if(safeImage(banner.input.value))bannerPreview.append(this.image(banner.input.value,'Profile banner'));};for(const input of [name.input,av.input,banner.input])input.addEventListener('input',refresh);
  name.input.addEventListener('input',()=>{sheet.done.disabled=!name.input.value.trim();});sheet.done.disabled=!name.input.value.trim();sheet.done.setAttribute('aria-label','Save profile');
 }
 renderNotifications(){if(!this.notifications.length){this.body.append(this.empty('You’re all caught up','Replies, likes, reposts, follows and mentions will appear here during this server session.','bell'));return;}const labels={like:'liked your post',reply:'replied to your post',quote:'quoted your post',repost:'reposted your post',follow:'followed you',mention:'mentioned you'};for(const n of this.notifications){const b=this.button('Open notification',null,()=>n.PostId?this.thread(Number(n.PostId)):this.showProfile(n.ActorCid),'nx-notification');b.dataset.unread=String(!!n.Unread);const mark=el('span','nx-notification-icon');mark.innerHTML=icon(n.Type==='like'?'heart':n.Type==='follow'?'user-plus':n.Type==='repost'?'repeat':'message-circle');const text=el('div');text.append(el('strong','',`${String(n.Sender||'Someone').replace(/_/g,' ')} ${labels[n.Type]||'interacted with you'}`));if(n.Text)text.append(el('p','',String(n.Text).slice(0,160)));text.append(el('small','',relativeTime(n.Timestamp)));b.replaceChildren(mark,text);this.body.append(b);}}
 async markRead(){try{await this.checked('Y/MarkNotificationsRead',{});if(this.alive){this.notifications=this.notifications.map(n=>({...n,Unread:false}));this.updateBadge();}}catch(e){if(this.alive)this.notify(e.message);}}
 accountMenu(){const p=this.openSheet('Your account');p.append(this.textButton('Your profile','users',()=>{this.closeSheet();this.showProfile(this.cid);}),this.textButton('Your draft','edit',()=>this.composer()),this.textButton('Muted accounts on this device','bell-off',()=>this.mutedAccounts()),this.textButton('Y Premium','check',()=>this.premium()),el('p','nx-note','Posts, activity, profiles and follows are saved by the server. Drafts, bookmarks and mutes are local to this device.'));
 }
 mutedAccounts(){const p=this.openSheet('Muted accounts');if(!this.muted.size){p.append(el('p','nx-note','You have not muted anyone on this device.'));return;}for(const cid of this.muted){const actor=this.posts.find(post=>String(post.Cid)===cid);p.append(this.textButton('Unmute '+(actor?plainName(actor):cid),'bell',()=>{this.muted.delete(cid);writeLocal(this.context,'y-muted',[...this.muted]);this.mutedAccounts();this.updateBody();}));}}
 async premium(){const p=this.openSheet('Y Premium');p.append(el('p','nx-note','Loading current status…'));try{const status=await this.send('Y/GetPremiumStatus',{});if(!this.alive||this.sheet?.panel!==p)return;if(!status||typeof status!=='object')throw Error('Premium status unavailable.');p.querySelector('.nx-note').textContent=status.IsPremium?'Your badge is active. Removing it does not refund the original purchase. There is no recurring charge.':'A premium badge for 30 days costs $50 in-game. This uses your existing server wallet; no real money or recurring subscription.';p.append(this.textButton(status.IsPremium?'Remove badge':'Purchase for $50 in-game',null,()=>this.confirm(status.IsPremium?'Remove premium badge?':'Confirm $50 in-game purchase',status.IsPremium?'The badge will be removed without a refund.':'This debits $50 from your character’s bank for 30 days of Y Premium.',async()=>{const result=await this.checked('Y/TogglePremium',{});if(this.alive){this.closeSheet();this.notify(result.Message||'Premium updated.');this.scheduleReload();}}),'nx-primary nx-submit'));}catch(e){if(this.alive&&this.sheet?.panel===p){p.querySelector('.nx-note').textContent=e.message;}}}
 composer(context={}){
  const stored=readLocal(this.context,'y-draft',{});let draft={Msg:typeof stored?.Msg==='string'?stored.Msg:'',Images:rows(stored?.Images).filter(safeImage).slice(0,4),...(stored?.session===this.session?{ReplyTo:stored.ReplyTo,QuoteId:stored.QuoteId}:{}),...context};
  if(context.ReplyTo)delete draft.QuoteId;if(context.QuoteId)delete draft.ReplyTo;
  if(draft.ReplyTo&&!this.posts.some(p=>p.Id===Number(draft.ReplyTo)))delete draft.ReplyTo;if(draft.QuoteId&&!this.posts.some(p=>p.Id===Number(draft.QuoteId)))delete draft.QuoteId;
  let complete=false,sending=false,storageWarning=false;
  const save=()=>{if(complete)return;if(!writeLocal(this.context,'y-draft',{...draft,session:this.session})&&!storageWarning){storageWarning=true;this.notify('Device storage is full. Keep this draft open to avoid losing it.');}};
  const sheet=yEditor(this,draft.ReplyTo?'Reply':draft.QuoteId?'Quote post':'New post','compose',draft.ReplyTo?'Reply':'Post',done=>this.submitY(done,async()=>{if(sending||!canPublish(draft))throw Error('Add text or an image, and keep the post within 1,000 bytes.');sending=true;sheet.done.disabled=true;text.disabled=true;panel.querySelectorAll('button').forEach(b=>b.disabled=true);try{await this.checked('Y/CreatePost',{Msg:draft.Msg,Images:draft.Images,...(draft.ReplyTo?{ReplyTo:draft.ReplyTo}:{}),...(draft.QuoteId?{QuoteId:draft.QuoteId}:{})});if(!this.alive)return;complete=true;writeLocal(this.context,'y-draft',{});this.closeSheet();this.notify(draft.ReplyTo?'Reply posted.':'Post published.');await this.reload();}catch(error){if(this.alive){const status=el('p','nx-y-editor-error',error.message||'Could not post. Your draft is kept.');status.setAttribute('role','alert');panel.append(status);}throw error;}finally{sending=false;if(this.sheet?.panel===panel){text.disabled=false;panel.querySelectorAll('button').forEach(b=>b.disabled=false);update();}}},panel),{onClose:save}),panel=sheet.panel;panel.classList.add('nx-composer');
  const author=el('div','nx-composer-author');author.append(avatar(this.myProfile.Name,this.myProfile.Avatar),el('strong','',this.myProfile.Name));panel.append(author);
  const ref=this.posts.find(p=>p.Id===Number(draft.ReplyTo||draft.QuoteId));if(ref)panel.append(el('p','nx-y-context',`${draft.ReplyTo?'Replying to':'Quoting'} @${handle(ref)}: ${String(ref.Msg||'Image post').slice(0,100)}`));
  const text=el('textarea','nx-composer-text');text.placeholder=draft.ReplyTo?'Post your reply':'What’s happening in your city?';text.value=draft.Msg;text.maxLength=1000;text.setAttribute('aria-label','Post text');panel.append(text);
  const attachments=el('div','nx-composer-attachments'),picker=el('div','nx-composer-picker');picker.hidden=true;panel.append(attachments,picker);
  const tools=el('div','nx-composer-tools'),counter=el('span','nx-counter');let post;
  const update=()=>{draft.Msg=text.value;counter.textContent=`${byteLength(draft.Msg)} / 1000 bytes`;counter.dataset.over=String(byteLength(draft.Msg)>1000);sheet.done.disabled=sending||!canPublish(draft);save();};
  const renderImages=()=>{attachments.replaceChildren();for(const [index,url]of draft.Images.entries()){const tile=el('div');tile.append(this.image(url,'Attached image'),this.button('Remove image '+(index+1),'close',()=>{draft.Images.splice(index,1);renderImages();update();}));attachments.append(tile);}update();};
  const addImage=url=>{const safe=safeImage(url);if(!safe||!/^https:\/\//.test(safe)){this.notify('Use a valid HTTPS image URL.');return false;}if(draft.Images.includes(safe)){this.notify('That image is already attached.');return false;}if(draft.Images.length>=4){this.notify('You can attach up to four images.');return false;}draft.Images.push(safe);renderImages();return true;};
  tools.append(this.button('Attach images from Gallery','image',async()=>{picker.hidden=!picker.hidden;if(picker.hidden)return;picker.replaceChildren(el('p','nx-note','Loading Gallery…'));try{const photos=await this.send('Gallery/GetPhotos',{});if(!this.alive||this.sheet?.panel!==panel)return;if(!isRows(photos))throw Error('Gallery unavailable.');picker.replaceChildren();if(!rows(photos).length)picker.append(el('p','nx-note','Your Gallery has no photos yet. You can also attach an HTTPS image URL.'));for(const photo of rows(photos).slice(0,100)){const b=this.button('Attach Gallery photo',null,()=>addImage(photo.photo_url),'nx-gallery-pick');b.replaceChildren(this.image(photo.photo_url,'Gallery photo'));picker.append(b);}}catch(e){picker.replaceChildren(el('p','nx-note',e.message));}}),this.button('Attach image URL','plus',()=>{picker.hidden=false;picker.replaceChildren();const f=field('HTTPS image URL',{placeholder:'https://…',maxLength:2048});picker.append(f.wrapper,this.textButton('Attach image',null,()=>{if(addImage(f.input.value)){picker.hidden=true;f.input.value='';}}));f.input.focus();}),counter);panel.append(tools);
  const footer=el('div','nx-composer-footer');footer.append(el('span','nx-muted','Everyone in your server'),counter);panel.append(footer);this.listen(text,'input',update);renderImages();sheet.done.setAttribute('aria-label',draft.ReplyTo?'Post reply':'Publish post');queueMicrotask(()=>text.focus());
 }
 handleEscape(){if(super.handleEscape())return true;if(['thread','profile'].includes(this.view)){this.back();return true;}return false;}
 $destroy(){this.dockBlur?.destroy();clearTimeout(this.reloadTimer);clearTimeout(this.activityTimer);clearTimeout(this.searchTimer);super.$destroy();}
}
