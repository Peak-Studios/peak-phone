// Read-only synthetic data for visual tests. This file is never shipped in NUI.
(() => {
  const initial=window.PeakPhoneTransport;
  let transport;
  const reads = {
    'BankBusters/GetBusters': [{Label:'Fleeca opportunity',Time:3600,Claimers:[]},{Label:'Paleto opportunity',Time:1800,Claimers:['PREVIEW']},{Label:'Expired opportunity',Time:0,Claimers:[]}],
    'Facetime/GetContacts': [{Contact:'Jordan Lee',Phone:'5550102002'}],
    'Calls/GetCalls': [{Contact:'Jordan Lee',Phone:'5550102002',Timestamp:Date.now()-120000,Incoming:true}],
    'Messages/GetInbox': {Success:true,Conversations:[{Peer:'5550102002',Name:'Jordan Lee',Message:'Meet you at the studio.',Timestamp:Date.now(),Unread:true}]},
    'Messages/GetHistory': {Success:true,Messages:[{Id:1,Message:'Meet you at the studio.',Timestamp:Date.now(),Own:false,Attachments:[]},{Id:2,Message:'See you there!',Timestamp:Date.now(),Own:true,Attachments:[]}]},
    'Social/GetSession': {Success:true,profile:{id:1,cid:'PREVIEW',name:'Alex Morgan',handle:'alex.morgan',avatar:'',bio:'A little room to breathe.'}},
    'Social/GetFeed': {Success:true,posts:[{id:1,author:{id:2,name:'Jordan Lee',handle:'jordan.lee',avatar:''},created_at:Date.now(),caption:'A little more room for your day.',likes:2,comments:0,media:[{type:'image',url:'./duo/wallpaper.svg'}]}]},
    'Social/GetStories': {Success:true,posts:[],server_time:Date.now()},
    'Social/GetBingeDeck': {Success:true,profiles:[{id:2,cid:'PREVIEW2',name:'Jordan Lee',handle:'jordan.lee',avatar:'./duo/wallpaper.svg',photos:['./duo/wallpaper.svg'],bio:'Exploring the city, one coffee at a time.',interests:['Coffee','Art'],prompts:['A perfect city afternoon starts at the studio.']}],next:null},
    'Gallery/GetPhotos': [{id:1,citizenid:'PREVIEW',photo_url:'./images/vagos_sultan_whip_1774164749576.png',timestamp:Date.now()},{id:2,citizenid:'PREVIEW',photo_url:'./images/asdASDasd.png',timestamp:Date.now()-86400000}],
    'YellowPages/GetPosts': [{Id:1,Cid:'PREVIEW2',Title:'Studio delivery',Category:'Services',Msg:'Supplies delivered around Los Santos.',Sender:'Jordan Lee',Phone:'5550102002',Image:'./duo/wallpaper.svg',Timestamp:Date.now(),ExpiresAt:Date.now()+86400000}],
    'KiloLive/List': {Success:true,streams:[]},
    'Jobs/State': {Success:true,ready:true,source:1,jobs:[{id:'studio',name:'Studio delivery',description:'Bring supplies to the studio.',reward:250,minMembers:1,maxMembers:4,stepCount:2,timeoutMinutes:30,account:'bank'}],groups:[],offers:[],group:false},
    'Jobs/Admin': {Success:true,definitions:[],audit:[],rewards:[],limits:{}},
    'Contacts/PendingAirShares': [],
    'Y/GetFeed': {Success:true,Posts:[{Id:1,Cid:'PREVIEW2',Name:'Jordan Lee',Sender:'Jordan_Lee',Msg:'Small details make a difference. #LosSantos',Timestamp:Date.now(),Images:[],LikeCount:2,ReplyCount:0,RepostCount:0,QuoteCount:0}],Next:null,HasMore:false}
  };
  Object.defineProperty(window,'PeakPhoneTransport',{
    configurable:true,
    get:()=>transport,
    set:original=>{ transport=(event,data)=>Object.hasOwn(reads,event)?Promise.resolve(structuredClone(reads[event])):original(event,data); }
  });
  if(initial)window.PeakPhoneTransport=initial;
})();
