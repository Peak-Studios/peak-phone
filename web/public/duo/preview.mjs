/** Synthetic browser fixtures, never imported by a FiveM session. No real transactions or messages. */
import { APPS } from './catalog.mjs?rev=owner-config-20261015';
import { createUpgradeFixture } from './upgrade-preview.mjs';
import { createMusicFixture } from './music-preview.mjs';
import { createKilogramPreview } from './kilogram-preview.mjs';
import { newJob } from './jobs-app.mjs';
const jobsPreview=typeof location!=='undefined'&&new URLSearchParams(location.search).get('jobs')==='1';
export const musicFixture=createMusicFixture();
const kilogramPreview=typeof location!=='undefined'&&new URLSearchParams(location.search).has('kilogram')?createKilogramPreview():null;
export const previewPlayer = { Id: 1, Cid: 'PREVIEW', BankId: '8001', PhoneNumber: '5550102001', DeviceId:'DUO-PREVIEW0001',DeviceGeneration:1,DeviceLocked:false,HasSim:true,CharName: 'Alex Morgan', Name:'Alex Morgan', Job:'unemployed', Cash:275, Bank:8450, Crypto:{ SHUNG:12, GNE:4 }, Casino:0, RoomId:201 };
export const installed = Object.fromEntries(APPS.filter(a=>!a.builtin&&!['services','crypto'].includes(a.id)).map(a=>[a.id,true]));
const restoredPreviewParams=typeof location!=='undefined'?new URLSearchParams(location.search):new URLSearchParams();
const servicesPreviewMode=restoredPreviewParams.get('services')||'full';
let cryptoPreviewMode=restoredPreviewParams.get('crypto')||'full';
let weatherPreviewMode=restoredPreviewParams.get('weather')||'full';
let weatherPreviewReads=0;
let weatherWindVector={x:Math.sin(42*Math.PI/180),y:Math.cos(42*Math.PI/180)};
const cryptoCatalog=[
 {Icon:'caret-square-up',Label:'Shungite',Id:'SHUNG',Costs:100,Purchasable:true},
 {Icon:'horse-head',Label:'Guinea',Id:'GNE',Costs:100,Purchasable:false},
 {Icon:'shield-check',Label:'Evidentia',Id:'EVD',Costs:100,Purchasable:false},
 {Icon:'theater-masks',Label:'XTF',Id:'XTF',Costs:1000,Purchasable:false},
];
let previewCryptoBalances=cryptoPreviewMode==='empty'?{}:structuredClone(previewPlayer.Crypto);
let previewCryptoBank=previewPlayer.Bank;
let previewCryptoMutations=0;
let previewCryptoWalletReviewRequired=false;
const previewCryptoLedger=new Map();
const serviceDirectories={
 emergency:[{Source:202,Name:'Jordan Lee',Job:'police',Phone:'5550102002',DisplayPhone:'911',Avatar:''}],
 tow:[{Source:204,Name:'Sam Rivera',Job:'tow',Phone:'5550102004',Avatar:''}],
};
export const cryptoPreviewFixture={
 get mutations(){return previewCryptoMutations;},
 balances(){return structuredClone(previewCryptoBalances);},
 get bank(){return previewCryptoBank;},
 setMode(value){cryptoPreviewMode=String(value||'full');},
 setWalletReviewRequired(value){previewCryptoWalletReviewRequired=value===true;},
 operations(){return [...previewCryptoLedger.values()].map(value=>structuredClone(value));},
};
export const weatherPreviewFixture={
 get reads(){return weatherPreviewReads;},
 setMode(value){weatherPreviewMode=String(value||'full');},
 setWindVector(x,y){
  const east=Number(x),north=Number(y);
  if(!Number.isFinite(east)||!Number.isFinite(north)||Math.hypot(east,north)<0.000001)throw Error('Set a finite non-zero synthetic wind vector.');
  weatherWindVector={x:east,y:north};
 },
};
const contacts = [
 {id:1,cid:'PREVIEW2',name:'Jordan Lee',phone:'5550102002',avatar:'',note:'Design studio',favorite:true},
 {id:2,cid:'PREVIEW3',name:'Maya Chen',phone:'5550102003',avatar:'',note:'Coffee on Saturday'},
 {id:3,cid:'PREVIEW4',name:'Sam Rivera',phone:'5550102004',avatar:'',note:'Garage'},
 {id:4,cid:'PREVIEW5',name:'Taylor Brooks',phone:'5550102005',avatar:'',note:''},
];
const now = Date.now();
const notesPreviewParams = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const notesScaleFixture = notesPreviewParams.get('notes') === 'scale';
let previewDocuments = notesPreviewParams.get('notes') === 'empty' ? [] : notesScaleFixture ? [
 ...Array.from({length:250},(_,index)=>({id:1001+index,citizenid:'PREVIEW',type:0,title:`Scale note ${String(index+1).padStart(3,'0')}`,content:index===0?`${'A'.repeat(2048)}<p>café 世界 &amp; notes</p><script>hidden-body-token</script>${'A'.repeat(2000)}`:'A'.repeat(4096),signatures:[],sharees:[],finalized:0})),
 ...Array.from({length:250},(_,index)=>({id:2001+index,citizenid:'PREVIEW',type:5,title:`Scale contract ${String(index+1).padStart(3,'0')}`,content:'A'.repeat(4096),signatures:[],sharees:[],finalized:index%11===0?1:0})),
] : [
 {id:501,citizenid:'PREVIEW',type:0,title:'Studio ideas',content:'<p>Choose a quiet corner for the next shoot.</p><ul><li>☐ Bring the reflector</li><li>☑ Charge the camera</li></ul>',signatures:[],sharees:[],finalized:0},
 {id:502,citizenid:'PREVIEW',type:1,title:'Driver license',content:'<p>License details stay in the existing document category.</p>',signatures:[],sharees:[],finalized:0},
 {id:503,citizenid:'PREVIEW',type:2,title:'Lease scan',content:'<p>Keep a copy with the move-in paperwork.</p>',signatures:[],sharees:[],finalized:0},
 {id:504,citizenid:'PREVIEW',type:3,title:'Vehicle registration',content:'<p>Registration copy for the Sultan.</p>',signatures:[],sharees:[],finalized:0},
 {id:505,citizenid:'PREVIEW',type:4,title:'Apartment records',content:'<p>Maintenance notes and building details.</p>',signatures:[],sharees:[],finalized:0},
 {id:506,citizenid:'PREVIEW',type:5,title:'Studio rental agreement',content:'<p>Rental terms for the photo studio.</p>',signatures:[],sharees:['PREVIEW2'],finalized:1},
 {id:507,citizenid:'PREVIEW',type:5,title:'Draft location agreement',content:'<p>Review the schedule before signing.</p>',signatures:[],sharees:[],finalized:0},
 {id:508,citizenid:'PREVIEW2',type:5,title:'Jordan’s location release',content:'<p>Shared for your signature.</p>',signatures:[{Cid:'PREVIEW',Name:'Alex Morgan',Signed:false}],sharees:['PREVIEW'],finalized:1},
];
let nextPreviewDocumentId = 509;
const notesPreviewFault = event => notesPreviewParams.get('notes') === 'error' || notesPreviewParams.get('notes') === `fail-${event.slice('Documents/'.length).toLowerCase()}`;
function notesFixture(event, data = {}) {
 if (notesPreviewFault(event)) {
  if (['Documents/GetDocuments','Documents/GetNotesSummary','Documents/GetNotesMetadataPage','Documents/GetNoteDetail'].includes(event) && (data.StatusEnvelope === true || event !== 'Documents/GetDocuments')) return {Success:false,Status:'unavailable',Message:'Synthetic Notes preview failure. No server data was changed.'};
  return {Success:false,Message:'Synthetic Notes preview failure. No server data was changed.'};
 }
 if (event === 'Documents/GetNotesSummary') {
  if (typeof data.ExpectedCid !== 'string' || data.ExpectedCid !== 'PREVIEW') return {Success:false,Status:'identity',Message:'Your character changed while Notes was loading.'};
  const types=Array.from({length:6},(_,type)=>{
   const matching=previewDocuments.filter(note=>note.type===type&&(note.citizenid==='PREVIEW'||note.sharees.includes('PREVIEW')));
   return {Type:type,Count:matching.length,UpperId:matching.reduce((upper,note)=>Math.max(upper,note.id),0)};
  });
  return {Success:true,Types:types};
 }
 if (event === 'Documents/GetNotesMetadataPage') {
  const type=Number(data.Type),upper=Number(data.UpperId),cursor=data.Cursor==null?null:Number(data.Cursor);
  if (typeof data.ExpectedCid !== 'string' || data.ExpectedCid !== 'PREVIEW') return {Success:false,Status:'identity',Message:'Your character changed while Notes was loading.'};
  if (!Number.isInteger(type)||type<0||type>5||!Number.isSafeInteger(upper)||upper<1||(cursor!=null&&(!Number.isSafeInteger(cursor)||cursor<1||cursor>=upper))) return {Success:false,Status:'invalid',Message:'The requested Notes page is invalid.'};
  const matching=previewDocuments.filter(note=>note.type===type&&note.id<=upper&&(cursor==null||note.id<cursor)&&(note.citizenid==='PREVIEW'||note.sharees.includes('PREVIEW'))).sort((a,b)=>b.id-a.id).slice(0,50);
  const rows=matching.map(note=>({id:note.id,type:note.type,title:note.title,citizenid:note.citizenid,finalized:Number(note.finalized)===1,
   signatureCount:note.signatures.length,signedCount:note.signatures.filter(signature=>signature.Signed===true||signature.Signed===1||signature.Signed==='1'||signature.Signed==='true').length,
   shared:note.citizenid!=='PREVIEW'||note.sharees.length>0}));
  return {Success:true,Type:type,Rows:rows,Done:rows.length<50,NextCursor:rows.length===50?rows.at(-1).id:null};
 }
 if (event === 'Documents/GetNoteDetail') {
  if (typeof data.ExpectedCid !== 'string' || data.ExpectedCid !== 'PREVIEW') return {Success:false,Status:'identity',Message:'Your character changed while Notes was loading.'};
  const note=previewDocuments.find(item=>String(item.id)===String(data.Id));
  if (!note) return {Success:false,Status:'missing',Message:'This note is no longer available.'};
  if (note.citizenid!=='PREVIEW'&&!note.sharees.includes('PREVIEW')) return {Success:false,Status:'denied',Message:'You no longer have permission to open this note.'};
  if (new TextEncoder().encode(note.content).length>100000) return {Success:false,Status:'oversize',Message:'This note is too large to load safely.'};
  return {Success:true,Row:structuredClone(note)};
 }
 if (event === 'Documents/GetDocuments') {
  const type = Number(data.Type);
  if (!Number.isInteger(type) || type < 0 || type > 5) {
   return data.StatusEnvelope === true ? {Success:false,Status:'invalid',Message:'The requested Notes category is invalid.'} : [];
  }
  const result = structuredClone(previewDocuments.filter(note => note.type === type && (note.citizenid === 'PREVIEW' || note.sharees.includes('PREVIEW'))).sort((a,b)=>b.id-a.id));
  return data.StatusEnvelope === true ? {Success:true,Rows:result} : result;
 }
 const note = previewDocuments.find(item => String(item.id) === String(data.Id));
 const owner = note?.citizenid === 'PREVIEW';
 if (event === 'Documents/SaveDocument') {
  const title = String(data.Title || '').trim(), content = String(data.Content || '');
  if (!title || title.length > 150 || content.length > 100000 || !Number.isInteger(Number(data.Type)) || Number(data.Type) < 0 || Number(data.Type) > 5) return {Success:false,Message:'A title, supported category, and valid note content are required.'};
  if (data.Id != null) {
   if (!owner || Number(note.finalized) === 1) return {Success:false,Message:'Only the owner can edit an unfinished preview note.'};
   note.title=title; note.content=content; return {Success:true,Id:note.id};
  }
  const created={id:nextPreviewDocumentId++,citizenid:'PREVIEW',type:Number(data.Type),title,content,signatures:[],sharees:[],finalized:0}; previewDocuments.push(created);
  return {Success:true,Id:created.id};
 }
 if (event === 'Documents/Finalize') {
  if (!owner || note.type !== 5) return {Success:false,Message:'Only the owner can finalize a contract.'};
  note.finalized=1; return {Success:true};
 }
 if (event === 'Documents/RequestSignature') {
  const cid=String(data.Cid || '');
  if (!owner || note.type !== 5 || Number(note.finalized)!==1 || !(note.citizenid===cid || note.sharees.includes(cid))) return {Success:false,Message:'Share and finalize this contract before requesting a signature.'};
  if (note.signatures.some(signature=>signature.Cid===cid)) return {Success:false,Message:'Signature already requested.'};
  const name=cid==='PREVIEW2'?'Jordan Lee':cid==='PREVIEW'?'Alex Morgan':cid;
  note.signatures.push({Cid:cid,Name:name,Signed:false}); return {Success:true,Signatures:structuredClone(note.signatures)};
 }
 if (event === 'Documents/SignDocument') {
  if (!note || !(note.citizenid==='PREVIEW'||note.sharees.includes('PREVIEW')) || Number(note.finalized)!==1) return {Success:false,Message:'This preview contract is not available for signing.'};
  const signature=note.signatures.find(item=>item.Cid==='PREVIEW');
  if (!signature) return {Success:false,Message:'You were not invited to sign this contract.'};
  signature.Signed=true; signature.Timestamp=Date.now(); return {Success:true,Signatures:structuredClone(note.signatures)};
 }
 if (event === 'Documents/DeleteDocument') {
  if (!owner) return {Success:false,Message:'Only the owner can delete this preview note.'};
  previewDocuments=previewDocuments.filter(item=>item!==note); return {Success:true};
 }
 if (event === 'Documents/ShareLocal') return {Success:false,Message:'Nearby sharing requires the live FiveM world.'};
 if (event === 'Documents/DropQRCode') return {Success:false,Message:'Placing a QR code requires the live FiveM world.'};
 if (event === 'Documents/AddSharee') return {Success:false,Message:'Character invitations are disabled in browser preview.'};
 return null;
}
const emptyGalleryPreview = typeof location !== 'undefined' && new URLSearchParams(location.search).get('gallery') === 'empty';
const galleryPhotos = emptyGalleryPreview ? [] : [
 {id:1201,photo_url:'./images/vagos_sultan_whip_1774164749576.png',timestamp:now-3*60*60*1000},
 {id:1200,photo_url:'./images/asdASDasd.png',timestamp:now-26*60*60*1000},
];
const previewImageUrl = value => {if(typeof value!=='string')return false;if(/^\.\/(?:images|duo)\/[\w./-]+$/.test(value)&&!value.includes('..'))return true;try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password;}catch{return false;}};
const previewMailId = mail => String(mail?.id ?? mail?.Id ?? mail?.mailid ?? mail?.MailId ?? mail?.mailId);
const chat = { to_phone:'5550102002',name:'Jordan Lee',avatar:'',unread:0,messages:[
 {Id:2,Message:'Meet at the studio at six?',Timestamp:now-120000,Sender:'5550102002',Receiver:previewPlayer.PhoneNumber,Attachments:[],Phone:'5550102002',Type:'text'},
 {Id:1,Message:'The new workspace looks great.',Timestamp:now-300000,Sender:'5550102002',Receiver:previewPlayer.PhoneNumber,Attachments:[],Phone:'5550102002',Type:'text'},
]};
const previewInbox=[{Id:2,Peer:'5550102002',Message:'Meet at the studio at six?',Timestamp:now-120000,Unread:1,Reactions:[]}];
const previewHistory=[
 {Id:1,Phone:'5550102002',Message:'The new workspace looks great.',Timestamp:now-300000,Own:true,Attachments:[],Reactions:[]},
 {Id:2,Phone:'5550102002',Message:'Meet at the studio at six?',Timestamp:now-120000,Own:false,Attachments:[],Reactions:[]},
];
let mails = [
 {MailId:12,sender:'5550102002',subject:'A little more room to work',message:'<p>The studio looks great after the move. The big table is ready whenever you are.</p><p>This inbox uses synthetic preview data.</p>',timestamp:now-420000,read:0},
 {id:11,mailid:11,sender:'5550102003',subject:'Saturday coffee?',message:'<p>Want to meet at the café around eleven?</p>',timestamp:now-3600000,read:1},
 {id:10,mailid:10,sender:'City Services',subject:'Your appointment is confirmed',message:'<p>Your appointment is booked for Friday at 10:30. See you then.</p>',timestamp:now-7200000,read:0,button:{event:'Mails/SetGPS',label:'Open appointment location',data:{x:214.4,y:-810.6}}},
 {id:9,mailid:9,sender:'5550102004',subject:'Re: Garage estimate',message:'<p>Parts arrived this morning. I can finish the repair by the end of the day.</p><script>window.__mailInjected=true</script><img src="x" onerror="window.__mailInjected=true"><a href="javascript:window.__mailInjected=true" onclick="window.__mailInjected=true">unsafe link</a><a href="">empty link</a>',timestamp:now-86400000,read:1},
 {MailId:8,sender:'5550102005',subject:'The photos from Sunday',message:'<p>I sent the gallery link to the group. The sunset shots came out well.</p>',timestamp:now-90000000,read:0},
 {id:7,mailid:7,sender:'Transit Office',subject:'Route 8 service update',message:'<p>Service is back to its regular schedule after 6 PM.</p>',timestamp:now-2*86400000,read:1,button:{event:'Phone/SetPreference',label:'Untrusted preview action',data:{Id:'Phone.Background',Value:'https://example.invalid/'}}},
 {id:6,mailid:6,sender:'5550102002',subject:'Lunch next week',message:'<p>Could you do Tuesday? I know a quiet spot near the park.</p>',timestamp:now-3*86400000,read:1},
 {id:5,mailid:5,sender:'Northside Market',subject:'Your order is ready',message:'<p>Your order is ready for pickup at the front counter.</p>',timestamp:now-4*86400000,read:0},
 {id:4,mailid:4,sender:'5550102003',subject:'A note about the keys',message:'<p>I left the spare set with the front desk.</p>',timestamp:now-5*86400000,read:1},
 {id:3,mailid:3,sender:'Community Board',subject:'Weekend volunteer sign-up',message:'<p>There are still a few spots open for Saturday morning.</p>',timestamp:now-6*86400000,read:1},
 {id:2,mailid:2,sender:'5550102004',subject:'The old record player',message:'<p>It is working again. The loose wire was an easy fix.</p>',timestamp:now-8*86400000,read:1},
 {id:1,mailid:1,sender:'5550102005',subject:'Invoice for the repair',message:'<p>The receipt is attached to the paper copy I left for you.</p>',timestamp:now-10*86400000,read:1},
];
export const ringtoneSettingsFixture={options:[]};
const preferences = {'Phone.Background':'duo/wallpaper.svg','Phone.Ringtone':'phone.phoneRing',RingtoneOptions:ringtoneSettingsFixture.options,'Images.Embedded':true,'Notifications.SMS':true,'Notifications.Email':true,'Notifications.Tweet':true};
const previewDevice={device_id:'DUO-PREVIEW0001',label:'Alex’s Peak Duo',owner_citizenid:'PREVIEW',sim_id:'SIM-PREVIEW',status:'active',has_pin:1,access_type:'owner',active:true,unlocked:true};
let mapBlipsEnabled=true;
const mapPeopleState={Success:true,CanShare:true,Contacts:[
 {Id:1,Name:'J. Lee · studio',Phone:'5550102002',Resolvable:true},
 {Id:2,Name:'Maya Chen',Phone:'5550102003',Resolvable:true},
 {Id:3,Name:'Old number',Phone:'5550102999',Resolvable:false},
],Outgoing:[{ShareId:'preview-out-1',Name:'Sam Rivera',Recipient:'Sam Rivera',Phone:'5550102004',Duration:'1 day'}],Incoming:[
 {ShareId:'preview-in-1',Name:'Maya Chen',Phone:'5550102003',Duration:'1 hour',Available:true,Status:'Live',Location:{x:215.8,y:-810.1,z:30}},
 {ShareId:'preview-in-2',Name:'Taylor Brooks',Phone:'5550102005',Duration:'Until stopped',Available:false,Status:'Different instance'},
]};
export const requests=[];
const previewDelays=new Map();
export function setPreviewDelay(event,milliseconds) {
 const delay=Number(milliseconds);
 if(typeof event!=='string'||!event||!Number.isFinite(delay)||delay<0)throw Error('Invalid synthetic preview delay.');
 previewDelays.set(event,Math.min(delay,5000));
}
// A two-second FFmpeg test-tone Opus/WebM sample exercises playback without recording from a microphone.
const previewVoice='data:audio/webm;base64,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';
const directMessages=[
 {Id:98,From:'5550102002',To:previewPlayer.PhoneNumber,SenderName:'Jordan Lee',Own:false,Message:'I found a quieter corner with room for the backdrop and the light stands.',Attachments:[],Timestamp:now-1200000,Reactions:[]},
 {Id:99,From:previewPlayer.PhoneNumber,To:'5550102002',SenderName:'Alex Morgan',Own:true,Message:'Nice. I’ll bring the camera kit and the extra batteries.',Attachments:[],Timestamp:now-900000,Reactions:[]},
 {Id:101,From:'5550102002',To:previewPlayer.PhoneNumber,SenderName:'Jordan Lee',Own:false,Message:'The new workspace looks great.',Attachments:[],Timestamp:now-300000,Reactions:[{Phone:'5550102003',Reaction:'👍'}]},
 {Id:102,From:previewPlayer.PhoneNumber,To:'5550102002',SenderName:'Alex Morgan',Own:true,Message:'Meet at the studio at six?',Attachments:[],Timestamp:now-120000,Reactions:[]},
 {Id:103,From:'5550102002',To:previewPlayer.PhoneNumber,SenderName:'Jordan Lee',Own:false,Message:previewVoice,Attachments:[],Timestamp:now-30000,Reactions:[]},
];
const cashMessages=[
 {Id:301,From:'5550102003',To:previewPlayer.PhoneNumber,SenderName:'Maya Chen',Own:false,Message:'',Attachments:[{type:'cash-request',requestId:'PREVIEW-REQUEST-01',amount:42,comment:'Studio supplies',status:'pending',Incoming:true}],Timestamp:now-90000,Reactions:[]},
 {Id:302,From:'5550102003',To:previewPlayer.PhoneNumber,SenderName:'Maya Chen',Own:false,Message:'',Attachments:[{type:'cash-request',requestId:'PREVIEW-REQUEST-DECLINE',amount:8,comment:'Coffee',status:'pending',Incoming:true}],Timestamp:now-80000,Reactions:[]},
];
const longMessages=[
 {Id:401,From:'5550102004',To:previewPlayer.PhoneNumber,SenderName:'Sam Rivera',Own:false,Message:'Saturday plan: the west garage is open after noon. I can set aside the lift, pull the tool cart over, and keep the back bay clear so we can finish the build without rushing.',Attachments:[],Timestamp:now-7200000,Reactions:[]},
 {Id:402,From:previewPlayer.PhoneNumber,To:'5550102004',SenderName:'Alex Morgan',Own:true,Message:'That works. I’ll be there at one with the parts list and the new brackets.',Attachments:[],Timestamp:now-6600000,Reactions:[]},
 {Id:403,From:'5550102004',To:previewPlayer.PhoneNumber,SenderName:'Sam Rivera',Own:false,Message:'Perfect. Text me when you’re close and I’ll open the side door.',Attachments:[],Timestamp:now-6000000,Reactions:[]},
];
const groupId='GRP20261005001';
const groupMessages=[
 {Id:201,Sender:'5550102003',SenderName:'Maya Chen',Own:false,Message:'I’ll bring the camera and lights.',Attachments:[],Timestamp:now-180000,Reactions:[{Phone:'5550102004',Reaction:'🔥'}]},
 {Id:202,Sender:previewPlayer.PhoneNumber,SenderName:'Alex Morgan',Own:true,Message:'Perfect. See everyone at six!',Attachments:[],Timestamp:now-60000,Reactions:[]},
];
const groupFixture={group_id:groupId,name:'Studio Crew',creator_phone:previewPlayer.PhoneNumber,is_creator:true,member_count:4,created_at:now-86400000,has_unread:true,last_message:{Sender:previewPlayer.PhoneNumber,SenderName:'Alex Morgan',Message:groupMessages[1].Message,Attachments:[],Timestamp:groupMessages[1].Timestamp}};
const groups={[groupId]:groupFixture};
const syntheticCashRequests=new Map();
syntheticCashRequests.set('PREVIEW-REQUEST-01',{requestId:'PREVIEW-REQUEST-01',requesterPhone:'5550102003',payerPhone:previewPlayer.PhoneNumber,groupId:'',amount:42,comment:'Studio supplies',status:'pending'});
syntheticCashRequests.set('PREVIEW-REQUEST-DECLINE',{requestId:'PREVIEW-REQUEST-DECLINE',requesterPhone:'5550102003',payerPhone:previewPlayer.PhoneNumber,groupId:'',amount:8,comment:'Coffee',status:'pending'});
const syntheticCashEvents=new Map();
let previewRequestSequence=1;
let previewMessageSequence=600;
let previewCameraIsSelfie=false;
const groupMembers=[
 {phone:previewPlayer.PhoneNumber,name:'Alex Morgan',is_creator:true,is_admin:true},
 {phone:'5550102002',name:'Jordan Lee',is_creator:false,is_admin:false},
 {phone:'5550102003',name:'Maya Chen',is_creator:false,is_admin:true},
 {phone:'5550102004',name:'Sam Rivera',is_creator:false,is_admin:false},
];
const isPreviewWebm=value=>{if(typeof value!=='string'||value.length>80000||!value.startsWith('data:audio/webm;base64,'))return false;try{const bytes=atob(value.slice('data:audio/webm;base64,'.length));return bytes.length>=4&&bytes.charCodeAt(0)===0x1a&&bytes.charCodeAt(1)===0x45&&bytes.charCodeAt(2)===0xdf&&bytes.charCodeAt(3)===0xa3;}catch{return false;}};
export const messagesFixture={
 failures:new Map(),
 failOnce(event,message='Synthetic Messages preview failure.'){this.failures.set(event,message);},
 deliverIncomingAudio(uri){if(!isPreviewWebm(uri))throw Error('The preview only accepts valid WebM audio.');const message={Id:++previewMessageSequence,From:'5550102002',To:previewPlayer.PhoneNumber,SenderName:'Jordan Lee',Own:false,Message:uri,Attachments:[],Timestamp:Date.now(),Reactions:[]};directMessages.push(message);return message.Id;},
};
const notify = data => window.dispatchEvent(new MessageEvent('message',{data,source:window}));
export const upgradeFixture=createUpgradeFixture({notify});
export async function mockSend(event, data={}) {
 if(typeof event==='string'&&event.startsWith('VoiceMemos/'))throw Error('Voice Memos sharing and nearby playback require a live FiveM connection. Browser preview only supports local recordings played on this device.');
 requests.push({event,data:structuredClone(data),time:Date.now()});
 if(requests.length>500)requests.shift();
 const weatherModeAtRequest=event==='Weather/GetState'?weatherPreviewMode:null;
 const weatherVectorAtRequest=event==='Weather/GetState'?{...weatherWindVector}:null;
 const builtInDelay=cryptoPreviewMode==='delay'&&/^Crypto\/(?:BuyCrypto|SellCrypto|TransferCrypto)$/.test(event)?900:35;
 await new Promise(r=>setTimeout(r,previewDelays.get(event)??builtInDelay));
 if(messagesFixture.failures.has(event)){const message=messagesFixture.failures.get(event);messagesFixture.failures.delete(event);throw Error(message);}
 await new Promise(r=>setTimeout(r,35));
 if(event==='Weather/GetState'){
  weatherPreviewReads++;
  if(weatherModeAtRequest==='error')throw Error('Synthetic current game weather read failed.');
  if(weatherModeAtRequest==='unknown')return {Success:true,PreviewOnly:true,SampleKind:'synthetic-preview',Location:false,GameTime:{Hour:28,Minute:73},Condition:{Known:false,Code:'UNKNOWN'},Wind:{Available:true,MetersPerSecond:Infinity,Bearing:NaN},Transition:{from:'UNKNOWN',to:'CLEAR',percent:0.5},SampledAt:Date.now()};
  const bearing=(Math.atan2(weatherVectorAtRequest.x,weatherVectorAtRequest.y)*180/Math.PI+360)%360;
  return {Success:true,PreviewOnly:true,SampleKind:'synthetic-preview',Location:'Downtown Vinewood',GameTime:{Hour:weatherModeAtRequest==='night'?22:weatherModeAtRequest==='day'?14:18,Minute:24},Condition:{Known:true,Code:'CLEAR'},Wind:{Available:true,MetersPerSecond:4.2,Bearing:bearing},Transition:{from:'CLEAR',to:'RAIN',percent:0.24},SampledAt:Date.now()};
 }
 // Synthetic preview calls still need their normal UI keepalive to resolve successfully.
 if(event==='Calls/Heartbeat')return typeof data?.CallId==='string'&&data.CallId?{Success:true}:{Success:false};
 if(jobsPreview&&event==='Jobs/Admin')return {Success:true,definitions:[{...newJob(),id:'preview_studio',name:'Studio delivery',description:'Synthetic contract editor preview.',revision:1}],audit:[],rewards:[]};
 if(jobsPreview&&event==='Jobs/State')return {Success:true,ready:true,jobs:[],groups:[],offers:[],group:false};
 if(kilogramPreview&&(event.startsWith('Social/')||event.startsWith('KiloLive/')))return kilogramPreview(event,data);
 if(event.startsWith('Peakify/'))return musicFixture.send(event,data);
 if(event.startsWith('Y/')||event==='Calls/GetCalls'||event==='Vehicles/GetVehicles')return upgradeFixture.send(event,data);
 if(event==='Services/GetEmergencyWorkers'||event==='Services/GetTowWorkers'){
  const kind=event==='Services/GetEmergencyWorkers'?'emergency':'tow';
  if(servicesPreviewMode==='error'||servicesPreviewMode==='malformed'||(servicesPreviewMode==='partial'&&kind==='tow')){
   if(servicesPreviewMode==='malformed')return {Success:true,Workers:[]};
   throw Error('Synthetic Services preview failure. No live directory was queried.');
  }
  return structuredClone(servicesPreviewMode==='empty'?[]:serviceDirectories[kind]);
 }
 if(event==='Contacts/Call')return {Success:false,PreviewOnly:true,Msg:'Synthetic preview only. No call was placed.'};
 if(event==='Crypto/GetCrypto'){
  if(cryptoPreviewMode==='catalog-error')throw Error('Synthetic currency catalog preview failure.');
  return structuredClone(cryptoPreviewMode==='empty'?[]:cryptoCatalog);
 }
 if(event==='Crypto/GetOperation'){
  if(cryptoPreviewMode==='error')throw Error('Synthetic wallet status preview failure.');
  const id=String(data.OperationId||'');
  const row=id?previewCryptoLedger.get(id):[...previewCryptoLedger.values()].find(item=>!['complete','rejected','refunded'].includes(item.Status));
  if(id&&!row)return {Success:false,Msg:'No synthetic operation exists for this reference.'};
  return {Success:true,Balances:structuredClone(previewCryptoBalances),Operation:row?structuredClone(row):null,Limits:{MaxCryptoUnits:100000,MaxTransfer:1000000},WalletReviewRequired:previewCryptoWalletReviewRequired,PreviewOnly:true};
 }
 if(/^Crypto\/(?:BuyCrypto|SellCrypto|TransferCrypto)$/.test(event)){
  const kind=event.endsWith('BuyCrypto')?'BUY':event.endsWith('SellCrypto')?'SELL':'TRANSFER';
  const id=String(data.OperationId||''),coin=cryptoCatalog.find(item=>item.Id===String(data.CryptoId||'')),amount=Number(data.Amount);
  const validReference=/^[A-Za-z0-9-]{16,64}$/.test(id);
  if(!validReference||!coin||!Number.isSafeInteger(amount)||amount<1)return {Success:false,PreviewOnly:true,Msg:'Synthetic preview rejected the invalid operation details.'};
  const existing=previewCryptoLedger.get(id);
  if(existing){
   const same=existing.Kind===kind&&existing.CryptoId===coin.Id&&existing.Units===amount;
   return same?{Success:existing.Status==='complete',OperationId:id,Status:existing.Status,PreviewOnly:true,Msg:'Synthetic operation reference already recorded.'}:{Success:false,OperationId:id,Status:'review',PreviewOnly:true,Msg:'Synthetic operation reference does not match.'};
  }
  const total=kind==='TRANSFER'?amount:amount*coin.Costs;
  const operation={OperationId:id,Status:'prepared',Kind:kind,CryptoId:coin.Id,Units:amount,Amount:total};
  const validRecipient=kind!=='TRANSFER'||/^[0-9]{3,20}$/.test(String(data.Phone||''));
  const canBuy=coin.Purchasable!==false&&coin.CanBuy!==false;
  const canSell=coin.CanSell!==false;
  let rejection='';
  if(kind==='BUY'&&!canBuy)rejection='This synthetic currency is not configured for purchase.';
  else if(kind==='SELL'&&(!canSell||Number(previewCryptoBalances[coin.Id]||0)<amount))rejection='This synthetic currency cannot be sold in the requested amount.';
  else if(kind==='TRANSFER'&&(!validRecipient||String(data.Phone)===previewPlayer.PhoneNumber||Number(previewCryptoBalances[coin.Id]||0)<amount))rejection='Choose an online synthetic recipient and an available balance.';
  else if(!Number.isSafeInteger(total)||total<1)rejection='The synthetic total exceeds the supported range.';
  if(rejection){operation.Status='rejected';previewCryptoLedger.set(id,operation);return {Success:false,OperationId:id,Status:'rejected',PreviewOnly:true,Msg:rejection};}
  if(cryptoPreviewMode==='uncertain')operation.Status='review';
  else if(cryptoPreviewMode==='pending'||cryptoPreviewMode==='delay')operation.Status='credit_pending';
  else if(cryptoPreviewMode==='reject')operation.Status='rejected';
  else if(cryptoPreviewMode==='refund')operation.Status='refunded';
  else operation.Status='complete';
  previewCryptoLedger.set(id,operation);
  if(operation.Status==='complete'){
   if(kind==='BUY'){previewCryptoBalances[coin.Id]=(Number(previewCryptoBalances[coin.Id])||0)+amount;previewCryptoBank-=total;}
   else if(kind==='SELL'){previewCryptoBalances[coin.Id]-=amount;previewCryptoBank+=total;}
   else previewCryptoBalances[coin.Id]-=amount;
   previewCryptoMutations++;
  }
  return {Success:operation.Status==='complete',OperationId:id,Status:operation.Status,PreviewOnly:true,Msg:operation.Status==='complete'?'Synthetic preview result only; no game wallet changed.':'Synthetic preview operation recorded; no game wallet changed.'};
 }
 if(event==='Messages/GetInbox')return {Success:true,Conversations:[
  {Peer:'5550102002',Name:'Jordan Lee',Message:previewVoice,Timestamp:now-30000,Unread:true,Attachments:[]},
  {Peer:'5550102003',Name:'Maya Chen',Message:'',Timestamp:now-90000,Unread:true,Attachments:cashMessages[0].Attachments},
  {Peer:'5550102004',Name:'Sam Rivera',Message:longMessages[2].Message,Timestamp:now-6000000,Unread:false,Attachments:[]},
 ]};
 if(event==='Messages/GetHistoryAround'){const fixture=data.Phone==='5550102003'?cashMessages:data.Phone==='5550102004'?longMessages:directMessages;return {Success:true,Messages:structuredClone(fixture),HasMore:false,HasMoreAfter:false};}
 if(event==='Groups/GetMessagesAround')return {Success:true,Messages:structuredClone(groupMessages),HasMore:false,HasMoreAfter:false};
 if(event==='Groups/GetGroups')return structuredClone(groups);
 if(event==='Groups/GetInfo'&&data.GroupId===groupId)return {name:groupFixture.name,is_creator:true,members:structuredClone(groupMembers)};
 if(event==='Groups/SetReaction'||event==='Messages/SetReaction'){
  const thread=event.startsWith('Groups/')?groupMessages:directMessages,message=thread.find(item=>Number(item.Id)===Number(data.MessageId));
  if(!message)return {Success:false,Msg:'That preview message is unavailable.'};
  message.Reactions=message.Reactions.filter(item=>String(item.Phone)!==previewPlayer.PhoneNumber);
  if(data.Reaction)message.Reactions.push({Phone:previewPlayer.PhoneNumber,Reaction:String(data.Reaction)});
  return {Success:true};
 }
 if(event==='Wenmo/CreateRequest'){
  const requestId='PREVIEW-CREATED-REQUEST-'+String(previewRequestSequence++).padStart(2,'0');
  syntheticCashRequests.set(requestId,{requestId,requesterPhone:previewPlayer.PhoneNumber,payerPhone:String(data.Phone||''),amount:Number(data.Amount)||0,comment:String(data.Comment||''),groupId:String(data.GroupId||''),status:'pending'});
  return {Success:true,Status:'pending',RequestId:requestId};
 }
 if(event==='Wenmo/SendMoney'){
  const operationId=String(data.OperationId||'PREVIEW-TRANSFER-'+previewRequestSequence++),recipient=String(data.Phone||'');
  if(!isFinite(Number(data.Amount))||Number(data.Amount)<1||!/^\d{3,20}$/.test(recipient))return {Success:false,Status:'rejected',Msg:'Synthetic preview transfer details are invalid.'};
  syntheticCashEvents.set(operationId,{operationId,fromPhone:previewPlayer.PhoneNumber,toPhone:recipient,amount:Number(data.Amount),groupId:String(data.MessageContext?.GroupId||data.GroupId||''),status:'paid'});
  return {Success:true,Status:'paid',OperationId:operationId};
 }
 if(event==='Wenmo/PayRequest'){
  const request=syntheticCashRequests.get(String(data.RequestId||''));if(!request||request.status!=='pending'||request.payerPhone!==previewPlayer.PhoneNumber)return {Success:false,Status:'rejected',Msg:'Synthetic preview request is unavailable.'};
  const operationId=String(data.OperationId||'PREVIEW-PAYMENT-'+previewRequestSequence++);request.status='paid';
  syntheticCashEvents.set(operationId,{operationId,fromPhone:previewPlayer.PhoneNumber,toPhone:request.requesterPhone,amount:request.amount,groupId:request.groupId,status:'paid'});
  for(const message of cashMessages)for(const attachment of message.Attachments||[])if(attachment.type==='cash-request'&&String(attachment.requestId)===request.requestId)attachment.status='paid';
  return {Success:true,Status:'paid',OperationId:operationId};
 }
  if(event==='Wenmo/DeclineRequest'){
  const request=syntheticCashRequests.get(String(data.RequestId||''));if(!request||request.status!=='pending'||request.payerPhone!==previewPlayer.PhoneNumber)return {Success:false,Status:'rejected',Msg:'Synthetic preview request is unavailable.'};request.status='declined';
  for(const message of cashMessages)for(const attachment of message.Attachments||[])if(attachment.type==='cash-request'&&String(attachment.requestId)===request.requestId)attachment.status='declined';
  return {Success:true,Status:'declined'};
  }
  if(event==='Messages/SendMessage'&&Array.isArray(data.Attachments)&&data.Attachments.length>0&&data.Attachments.length<=5&&data.Attachments.every(item=>item?.type==='image'&&previewImageUrl(item.url))){
   const phone=String(data.Phone||''),thread=phone==='5550102002'?directMessages:phone==='5550102003'?cashMessages:phone==='5550102004'?longMessages:null;
   if(!thread)return {Success:false,Msg:'The synthetic preview has no conversation for this phone.'};
   const message={Id:++previewMessageSequence,From:previewPlayer.PhoneNumber,To:phone,SenderName:previewPlayer.CharName,Own:true,Message:String(data.Message||''),Attachments:structuredClone(data.Attachments),Timestamp:Date.now(),Reactions:[]};thread.push(message);return {Success:true,MessageId:message.Id};
  }
  if(event==='Messages/SendMessage'&&(!Array.isArray(data.Attachments)||data.Attachments.length===0)&&isPreviewWebm(data.Message)){
   const phone=String(data.Phone||''),thread=phone==='5550102002'?directMessages:phone==='5550102004'?longMessages:null;if(!thread)return {Success:false,Msg:'The synthetic preview voice message has no fixture for this conversation.'};
   const message={Id:++previewMessageSequence,From:previewPlayer.PhoneNumber,To:phone,SenderName:previewPlayer.CharName,Own:true,Message:data.Message,Attachments:[],Timestamp:Date.now(),Reactions:[]};thread.push(message);return {Success:true,MessageId:message.Id};
  }
  if((event==='Messages/SendMessage'||event==='Groups/SendMessage')&&(!Array.isArray(data.Attachments)||data.Attachments.length===0)&&typeof data.Message==='string'&&data.Message.trim()&&data.Message.length<=4000&&!isPreviewWebm(data.Message)){
   const group=event==='Groups/SendMessage',phone=String(data.Phone||''),thread=group?groupMessages:phone==='5550102002'?directMessages:phone==='5550102003'?cashMessages:phone==='5550102004'?longMessages:null;
   if(!thread)return {Success:false,Msg:'The synthetic preview has no conversation for this recipient.'};
   const message={Id:++previewMessageSequence,From:previewPlayer.PhoneNumber,To:phone,Sender:previewPlayer.PhoneNumber,SenderName:previewPlayer.CharName,Own:true,Message:data.Message,Attachments:[],Timestamp:Date.now(),Reactions:[]};
   if(group)message.GroupId=String(data.GroupId||'');thread.push(message);return {Success:true,MessageId:message.Id};
  }
  if(event==='Messages/SendMessage'||event==='Groups/SendMessage'){
  const attachments=Array.isArray(data.Attachments)?data.Attachments:[],requestAttachment=attachments.find(item=>item?.type==='cash-request'),transferAttachment=attachments.find(item=>item?.type==='cash-transfer');
  const request=requestAttachment&&syntheticCashRequests.get(String(requestAttachment.requestId)),transfer=transferAttachment&&syntheticCashEvents.get(String(transferAttachment.operationId));
  const receipt=request||transfer;if(!receipt)return {Success:false,Msg:'The synthetic preview only accepts its locally created cash receipt.'};
  const group=event==='Groups/SendMessage',groupTarget=String(data.GroupId||''),phoneTarget=String(data.Phone||'');
  const from=transfer?.fromPhone||previewPlayer.PhoneNumber,to=transfer?.toPhone||request?.payerPhone;
  const expectedGroup=String(receipt.groupId||'');if((group&&(!expectedGroup||groupTarget!==expectedGroup))||(!group&&(expectedGroup||phoneTarget!==(request?.payerPhone||transfer?.toPhone))))return {Success:false,Msg:'The synthetic receipt does not match its original conversation.'};
  const message={Id:++previewMessageSequence,From:from,To:to,Sender:from,SenderName:previewPlayer.CharName,Own:true,Message:'',Timestamp:Date.now(),Reactions:[]};
  if(request)message.Attachments=[{type:'cash-request',requestId:request.requestId,amount:request.amount,comment:request.comment,status:request.status||'pending',Incoming:false}];
  else message.Attachments=[{type:'cash-transfer',operationId:transfer.operationId,amount:transfer.amount,Incoming:transfer.toPhone===previewPlayer.PhoneNumber}];
  if(group){message.GroupId=groupTarget;groupMessages.push(message);}
  else if(phoneTarget==='5550102003')cashMessages.push(message);
  else if(phoneTarget==='5550102002')directMessages.push(message);
  else if(phoneTarget==='5550102004')longMessages.push(message);
  else return {Success:false,Msg:'The synthetic receipt has no fixture for this phone.'};
  if(request)syntheticCashRequests.delete(request.requestId);
  return {Success:true,MessageId:message.Id};
 }
 if (event.startsWith('Documents/')) { const result=notesFixture(event,data); if(result!==null)return result; }
 const reads = {
  GetProfilePicture:'',GetInstalledApps:installed,'Phone/GetPreferences':preferences,
  'Contacts/GetContacts':contacts,'Facetime/GetContacts':contacts,'Contacts/GetSuggestions':[], 'Contacts/GetNearbyPlayers':[], 'Gallery/GetNearbyPlayers':[{source:202,name:'Jordan Lee',distance:2},{source:203,name:'Maya Chen',distance:4}],
  'Contacts/GetProfile':{avatar:'',name:previewPlayer.CharName,phone:previewPlayer.PhoneNumber},'Contacts/CheckMission3Invite':{canInvite:false,canKick:false},
  'Devices/list':{Success:true,Generation:1,InventoryMode:'unique',Devices:[previewDevice],Sims:[{sim_id:'SIM-PREVIEW',phone_number:previewPlayer.PhoneNumber,owner_citizenid:'PREVIEW',device_id:previewDevice.device_id}]},
  'Calls/GetCalls':[], 'Messages/GetChats':[chat],'Messages/GetInbox':{Success:true,Conversations:previewInbox,Next:null,HasMore:false},'Messages/GetHistory':{Success:true,Messages:previewHistory,Next:null,HasMore:false},'Groups/GetGroups':[], 'Groups/GetMessages':[],
  'Maps/GetPeopleState':mapPeopleState,
  'Mails/GetMails':mails,'Gallery/GetPhotos':galleryPhotos,'Details/GetLicenses':{driver:true,business:false,weapon:false},
  'Wenmo/GetBankData':{Balance:8450,Transactions:[]},'Vehicles/GetVehicles':[], 'Debt/GetDebt':[],
  'Crypto/GetCrypto':[],'Employment/GetBusinesses':[], 'Employment/GetFinancialAccess':false,
  'News/GetArticles':[],'News/IsJournalist':true,
  'JobCenter/GetJobs':[],'JobCenter/GetJobGroups':[],'JobCenter/GetTaskActivity':0,
  'BusDriver/GetData':{data:{Level:1,Experience:0,TotalExperience:0,TotalEarnings:0,DailyExperience:0,Progress:{Current:1,Next:2,Progress:0}}},
  'Lumberjack/GetData':{data:{Level:1,Experience:0,TotalExperience:0,TotalEarnings:0,DailyExperience:0,Progress:{Current:1,Next:2,Progress:0}}},
  'Racing/CanCreateTracks':false,'Racing/IsCreatingTrack':false,'Racing/GetRaces':[],'Racing/GetTracks':[], 'Racing/GetLeaderboard':[],
  'BankBusters/GetBusters':[],'TierUp/GetGroup':false,'DOJ/GetUsers':{IsDOJ:false,Users:[]},
  'Cars/GetShopData':{BusinessName:'Dealership',MaxPositions:3},'Cars/GetTestDriving':false,'Cars/GetVehicles':[],
  'Housing/GetHouses':{QuickEdit:false,Houses:[]},'Housing/CanRealtor':false,'Housing/GetKeys':[],
  'Housing/IsNearAnyHouse':false,'Housing/IsNearHouse':false,'Housing/GetCurrentHouse':false,
  'Services/GetEmergencyWorkers':[], 'Services/GetTowWorkers':[],
  'Network/GetNetworks':[{Id:'pdm',Name:'Dealership'},{Id:'peakify-boombox-preview',Name:'Studio speaker (preview)',Kind:'boombox'}],
  'YellowPages/GetPosts':[],'Y/GetPosts':[],'Y/GetPremiumStatus':{IsPremium:false,Expiration:0},
  'Y/GetProfile':{Name:previewPlayer.CharName,Sender:'alex',Cid:'PREVIEW',Bio:'Building something new.',Avatar:'',Followers:0,Following:0,IsFollowing:false},
  'Facetime/GetCallState':{InCall:false,CallData:null,VideoEnabled:true,AudioEnabled:true},
  'peak-guber:server:getAvailableCourses':[], 'peak-guber:client:getDutyStatus':{onDuty:false,activeCourse:null,rate:5},'peak-guber:client:getWaypoint':{hasWaypoint:false,coords:null},
 };
 if(Object.prototype.hasOwnProperty.call(reads,event))return structuredClone(reads[event]);
 if(event==='Maps/GetShareContacts')return {Success:true,Contacts:structuredClone(mapPeopleState.Contacts)};
 if(event==='Maps/GetBlipPreference')return {Success:true,Enabled:mapBlipsEnabled};
 if(event==='Maps/SetBlipPreference'){if(typeof data.Enabled!=='boolean')return {Success:false,Message:'Choose whether shared locations appear on the GTA map.'};mapBlipsEnabled=data.Enabled;return {Success:true,Enabled:mapBlipsEnabled};}
 if(event==='Maps/ResolveRecipient'){
  const contact=mapPeopleState.Contacts.find(item=>item.Phone===data.Phone&&item.Resolvable);
  const person=contacts.find(item=>item.phone===data.Phone);
  if(!contact||!person)return {Success:false,Message:'Choose one of your saved contacts.'};
  return {Success:true,ConfirmationId:'PREVIEW-RECIPIENT-CONFIRM',Contact:{Name:contact.Name,Phone:contact.Phone},Recipient:{Name:person.name,Phone:person.phone},ExpiresAt:Date.now()+60000};
 }
 if(event==='Maps/StartSharing'||event==='Maps/StopSharing')throw Error('Live location sharing requires the FiveM server. Preview mode does not create or revoke shares.');
 if(event==='Phone/SetPreference'){preferences[data.Id]=data.Value;return 'Ok';}
 if(event==='Gallery/DeletePhoto'){
  const id=Number(data.PhotoId),before=galleryPhotos.length;
  if(!Number.isSafeInteger(id)||id<1)return {Success:false,Msg:'That preview photo is unavailable.'};
  for(let index=galleryPhotos.length-1;index>=0;index--)if(Number(galleryPhotos[index]?.id)===id)galleryPhotos.splice(index,1);
  return {Success:galleryPhotos.length<before};
 }
 if(event==='Utils/SetWaypoint')return 'ok';
 if(event==='Messages/SendLocation')return 'Ok';
 if(event==='InstallApp'){installed[data.AppId]=true;return {Success:true,InstalledApps:{...installed}};}
 if(event==='UninstallApp'){delete installed[data.AppId];return {Success:true,InstalledApps:{...installed}};}
 if(event==='Network/Connect'){notify({Action:'SetCurrentNetwork',Network:data.Network});return true;}
 if(event==='Network/Disconnect'){notify({Action:'SetCurrentNetwork',Network:''});return 'Ok';}
 if(event==='Phone/Selfie'){previewCameraIsSelfie=false;notify({Action:'ClosePhone'});notify({Action:'ShowCameraOverlay',Visible:true,IsSelfie:previewCameraIsSelfie});return 'Ok';}
 if(event==='Phone/ExitCamera'){previewCameraIsSelfie=false;notify({Action:'ShowCameraOverlay',Visible:false});notify(previewOpen());return 'Ok';}
 if(event==='Phone/FlipCamera'){previewCameraIsSelfie=!previewCameraIsSelfie;return {Success:true,IsSelfie:previewCameraIsSelfie};}
 if(event==='Phone/CapturePhoto')throw Error('A game camera is not available in browser preview.');
 if(event==='Mails/SendMail')return data.targetPhone==='5550102999'?false:true;
 if(event==='Mails/MarkAsRead'){const mail=mails.find(item=>previewMailId(item)===String(data.id??data.Id));if(mail)mail.read=1;return 'Ok';}
 if(event==='Mails/DeleteMail'){const before=mails.length;mails=mails.filter(item=>previewMailId(item)!==String(data.id??data.Id));return mails.length<before;}
 if(event==='Mails/SetGPS')return 'ok';
 if(event==='Contacts/AddContact'||event==='Contacts/CreateContact'){contacts.push({id:Date.now(),name:data.Name,phone:data.Phone,avatar:''});notify({Action:'Contacts/SetContacts',Contacts:contacts});return true;}
 if(event==='Phone/MediaOutput')return {Success:true,Volume:data.Volume,Powered:data.Powered};
 if(['Phone/Flashlight','SetCurrentApp','ClosePhone','Phone/DuoTyping','Phone/DuoReady','Phone/ToggleSounds','Notifications/Click','Notifications/Dismiss','Contacts/ToggleSpeaker','Groups/SetRead','Messages/SetRead','Messages/MarkAllAsRead','Mails/ReadMail','Messages/SetChatRead','Documents/SetEditing','Contacts/UpdateProfile','Gallery/SetPhotoId'].includes(event))return 'Ok';
 // Do not pretend that a fictional banking, calling, mission, or external service action succeeded.
 throw Error(`“${event}” needs the live FiveM server. Browser preview contains UI fixtures only.`);
}
export function previewOpen(){return {Action:'OpenPhone',Weather:'EXTRASUNNY',HasVPN:true,HasRacingUsb:true,HasPDRacingUsb:false,RacingAlias:'Preview',Time:[18,24],IsNearNetwork:true,IsNetworkEnabled:true,PlayerData:previewPlayer,...(jobsPreview?{Capabilities:{jobcreator:{available:true}}}:{})};}
