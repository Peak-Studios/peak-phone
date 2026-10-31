/** Synthetic social/garage fixtures. Loaded ONLY by preview.mjs, never by game mode.
 * They deliberately do not simulate calls, money movement or vehicle spawning.
 */
export function createUpgradeFixture({notify=()=>{},now=Date.now()}={}) {
 const me={Cid:'PREVIEW',Name:'Alex Morgan',Username:'Alex_Morgan',Avatar:'',Banner:'',Bio:'A little more room for everything.',Followers:2,Following:1,IsFollowing:false};
 const profiles=[me,{Cid:'PREVIEW2',Name:'Jordan Lee',Username:'Jordan_Lee',Bio:'Designing things that feel effortless.',Avatar:'',Banner:'',Followers:12,Following:8,IsFollowing:true},{Cid:'PREVIEW3',Name:'Maya Chen',Username:'Maya_Chen',Bio:'Coffee, city walks and good conversations.',Avatar:'',Banner:'',Followers:8,Following:3,IsFollowing:false}];
 const posts=[{Id:1,Cid:me.Cid,Msg:'One screen for your day. Two when you need a little more space. #Duo',Timestamp:now-3600000},{Id:2,Cid:'PREVIEW2',Msg:'Small details make a difference. A good interface gets out of your way. #Design #Duo',Timestamp:now-1200000},{Id:3,Cid:'PREVIEW3',Msg:'Fresh coffee and an open afternoon. What is everyone working on? #LosSantos',Timestamp:now-240000}].map(p=>({...p,Name:profiles.find(a=>a.Cid===p.Cid).Name,Sender:profiles.find(a=>a.Cid===p.Cid).Username,Images:[],Avatar:'',LikeCount:p.Id+1,ReplyCount:0,RepostCount:0,QuoteCount:0,HasLiked:false,HasReposted:false,IsFollowing:p.Cid==='PREVIEW2'}));
 const state={posts,profiles,notifications:[{Id:1,Type:'follow',ActorCid:'PREVIEW2',Sender:'Jordan Lee',Timestamp:now-200000,Unread:true}],session:'synthetic-preview-session',nextId:3,failures:new Map()};
 const vehicles=[{Plate:'DUO 01',Label:'Obey Tailgater S',Model:'tailgater2',Garage:'Alta Street Garage',State:'Inside',Fuel:76,Engine:960,Body:910,Vin:'PREVIEW-001'},{Plate:'CITY 08',Label:'Karin Sultan',Model:'sultan',Garage:'Legion Square',State:'Outside',Fuel:42,Engine:875,Body:940,Vin:'PREVIEW-002'},{Plate:'SEA 19',Label:'Vapid Dominator',Model:'dominator',Garage:'City Impound',State:'Depot',Fuel:21,Engine:720,Body:690,Vin:'PREVIEW-003'}];
 const calls=[{Phone:'5550102002',Contact:'Jordan Lee',Timestamp:now-210000,Incoming:true,Status:'ended'},{Phone:'5550102003',Contact:'Maya Chen',Timestamp:now-1500000,Incoming:true,Status:'missed'},{Phone:'5550102004',Contact:'Sam Rivera',Timestamp:now-7200000,Incoming:false,Status:'ended'},{Phone:'5550102099',Contact:'5550102099',Timestamp:now-86400000,Incoming:false,Status:'ended'}];
 const clone=v=>structuredClone(v);
 const changed=()=>notify({Action:'Y/SetPosts',Posts:clone(posts)});
 function remove(id){const at=posts.findIndex(p=>p.Id===id);if(at<0)return;const [p]=posts.splice(at,1);for(const [key,count]of [['ReplyTo','ReplyCount'],['QuoteId','QuoteCount'],['RepostOf','RepostCount']]){const parent=posts.find(q=>q.Id===p[key]);if(parent){parent[count]=Math.max(0,parent[count]-1);if(key==='RepostOf')parent.HasReposted=false;}}}
 async function send(event,data={}) {
  if(state.failures.has(event)){const text=state.failures.get(event);state.failures.delete(event);throw Error(text);}
  if(event==='Calls/GetCalls')return clone(calls);
  if(event==='Vehicles/GetVehicles')return clone(vehicles);
  if(!event.startsWith('Y/'))return undefined;
  const p=posts.find(p=>p.Id===Number(data.Id));
  switch(event){
   case 'Y/GetPosts':return clone(posts);
   case 'Y/GetFeed':return {Success:true,Posts:clone(posts),Next:null,HasMore:false};
   case 'Y/GetThread':{
    const target=posts.find(post=>post.Id===Number(data.Id));
    if(!target)return {Success:false,Message:'That preview post is unavailable.'};
    const thread=posts.filter(post=>post.Id===target.Id||Number(post.ReplyTo)===target.Id||Number(post.QuoteId)===target.Id);
    return {Success:true,Posts:clone(thread)};
   }
   case 'Y/GetProfilePosts':return {Success:true,Posts:clone(posts.filter(p=>p.Cid===data.Cid)),Next:null,HasMore:false};
   case 'Y/Search':return {Success:true,Posts:clone(posts.filter(p=>[p.Msg,p.Name,p.Sender].some(s=>String(s||'').toLowerCase().includes(String(data.Query||'').toLowerCase())))),Next:null,HasMore:false};
   case 'Y/GetSocialState':return {Success:true,Session:state.session,Notifications:clone(state.notifications),PersistentPosts:false,MaxImages:4,MaxPostBytes:1000};
   case 'Y/GetProfile':return clone(profiles.find(p=>p.Cid===(data.Cid||me.Cid))||false);
   case 'Y/UpdateProfile':Object.assign(me,data);for(const p of posts)if(p.Cid===me.Cid){p.Name=me.Name;p.Avatar=me.Avatar;}changed();return true;
   case 'Y/CreatePost':{
    if(new TextEncoder().encode(data.Msg||'').length>1000)return {Success:false,Message:'Post exceeds the server byte limit.'};
    if(data.ReplyTo&&!posts.some(p=>p.Id===data.ReplyTo)||data.QuoteId&&!posts.some(p=>p.Id===data.QuoteId))return {Success:false,Message:'Referenced post unavailable.'};
    const post={...data,Id:++state.nextId,Cid:me.Cid,Name:me.Name,Sender:me.Username,Avatar:me.Avatar,Timestamp:Date.now(),Images:data.Images||[],LikeCount:0,ReplyCount:0,RepostCount:0,QuoteCount:0,HasLiked:false};post.Image=post.Images[0];posts.push(post);
    for(const [key,count]of [['ReplyTo','ReplyCount'],['QuoteId','QuoteCount']]){const parent=posts.find(p=>p.Id===data[key]);if(parent)parent[count]++;}changed();return {Success:true,Post:clone(post)};
   }
   case 'Y/ToggleLike':if(!p)return {Success:false};p.HasLiked=!p.HasLiked;p.LikeCount+=p.HasLiked?1:-1;changed();return {Success:true,HasLiked:p.HasLiked,LikeCount:p.LikeCount};
   case 'Y/ToggleRepost':if(!p)return {Success:false};if(p.HasReposted){const entry=posts.find(q=>q.RepostOf===p.Id&&q.Cid===me.Cid);if(entry)remove(entry.Id);}else{p.HasReposted=true;p.RepostCount++;posts.push({Id:++state.nextId,Cid:me.Cid,Name:me.Name,Sender:me.Username,Timestamp:Date.now(),RepostOf:p.Id,Images:[]});}changed();return {Success:true,HasReposted:p.HasReposted,RepostCount:p.RepostCount};
   case 'Y/DeletePost':if(!p||p.Cid!==me.Cid)return {Success:false,Message:'Only your own posts can be deleted.'};for(const q of [...posts])if(q.RepostOf===p.Id)remove(q.Id);remove(p.Id);changed();return {Success:true};
   case 'Y/ToggleFollow':{const profile=profiles.find(p=>p.Cid===data.TargetCid);if(!profile||profile===me)return {Success:false};profile.IsFollowing=!profile.IsFollowing;profile.Followers+=profile.IsFollowing?1:-1;for(const post of posts)if(post.Cid===profile.Cid)post.IsFollowing=profile.IsFollowing;changed();return {Success:true,IsFollowing:profile.IsFollowing};}
   case 'Y/MarkNotificationsRead':for(const n of state.notifications)n.Unread=false;return {Success:true};
   case 'Y/GetPremiumStatus':return {IsPremium:false};
   case 'Y/ReportPost':return p?{Success:true}:{Success:false};
   default:throw Error('This action needs the live FiveM server; preview cannot perform it.');
  }
 }
 return {state,send,failOnce:(event,message='Synthetic server rejection')=>state.failures.set(event,message)};
}
