/** Opt-in synthetic KiloGram data for the browser's physical phone preview. */
export function createKilogramPreview() {
 const now=Date.now(), picture='./images/vagos_sultan_whip_1774164749576.png';
 const me={id:1,name:'Alex Morgan',handle:'alex.morgan',bio:'Los Santos, SA',avatar:picture,posts:12,followers:159,following:1006,photos:[]};
 const other={id:2,name:'Jordan Lee',handle:'jordan.lee',bio:'Around the city.',avatar:picture,posts:6,followers:230,following:91,followed:true,can_message:true};
 const post=id=>({id,kind:'image',caption:'Golden hour in the city. A little moment worth keeping.',media:[{url:picture,type:'image'}],likes:128,comments:1,created_at:now-3600000,author:other,own:false});
 const gifts={rose:{name:'Rose',emoji:'🌹',coins:5},puppy:{name:'Puppy',emoji:'🐶',coins:120},sports_car:{name:'Sports car',emoji:'🏎️',coins:800}};
 const packs=[{Id:'starter',Coins:100,BankCost:1000,Label:'100 coins'},{Id:'supporter',Coins:550,BankCost:5000,Label:'550 coins'}];
 let coins=100, nextComment=2;
 let comments=[{id:1,body:'Love this view!',created_at:now-120000,can_delete:true,author:other}];
 return async (event,data={})=>{
  const route=event.replace(/^(Social|KiloLive)\//,'');
  if(event==='KiloLive/List')return {Success:true,streams:[],relay_ready:true,settings:{maxViewers:20,maxSeconds:600,allowMicrophone:true}};
  if(event==='KiloLive/Wallet')return {Success:true,coins,host:false,giftsEnabled:true,gifts,coinPacks:packs,cashoutRate:1};
  if(event==='KiloLive/PurchaseCoins'){const pack=packs.find(item=>item.Id===data.PackId);if(!pack)return {Success:false,Msg:'Coin pack unavailable.'};coins+=pack.Coins;return {Success:true,coins,added:pack.Coins};}
  if(event==='KiloLive/CashOut'){const amount=Number(data.Coins);if(!Number.isSafeInteger(amount)||amount<1||amount>coins)return {Success:false,Msg:'Invalid amount.'};coins-=amount;return {Success:true,coins,bankAmount:amount};}
  if(event==='KiloLive/Gift'){const price=gifts[data.GiftId]?.coins;if(!price||price>coins)return {Success:false,Msg:'Insufficient coins.'};coins-=price;return {Success:true,coins};}
  const result=route==='GetSession'?{profile:me,story_hours:24,max_photos:5}
   :route==='GetProfile'?{profile:Number(data.Id)===2?other:me}
   :route==='GetFeed'?{posts:data.Before?[]:Array.from({length:5},(_,i)=>post(12-i))}
   :route==='GetStories'?{posts:[],server_time:now}
   :route==='GetStoryArchive'?{posts:[],server_time:now}
   :route==='GetHighlights'?{highlights:[]}
   :route==='GetPeople'?{profiles:[other]}
   :route==='GetConversations'?{conversations:[]}
   :route==='GetComments'?{comments:comments.slice()}
   :route==='GetActivity'?{activity:[]}
   :route==='GetBlocked'?{profiles:[]}
   :null;
  if(result)return {Success:true,...result};
  if(route==='CreateComment'){
   const body=String(data.Body||'').trim();if(!body)return {Success:false,Msg:'Enter a comment.'};
   const comment={id:nextComment++,body,created_at:Date.now(),can_delete:true,author:me};comments.push(comment);return {Success:true,id:comment.id};
  }
  if(route==='DeleteComment'){comments=comments.filter(item=>item.id!==Number(data.Id));return {Success:true};}
  return {Success:false,Msg:'This action is unavailable in the synthetic preview.'};
 };
}
