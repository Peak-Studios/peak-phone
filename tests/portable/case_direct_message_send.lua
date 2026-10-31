base('qbcore');Citizen.CreateThread=CreateThread;Citizen.Wait=Wait;addPlayer(1,'direct-cid');PLAYERS[1].PlayerData.charinfo.phone='5550000001'
loadrel('server/sv_simcard.lua');loadrel('server/sv_messages.lua');IsNetworkEnabled=true
local own,target='5550000001','5550000002';local messages,byNonce={},{};local nextId=100;local inserts=0
local flipReplay,flipReply,flipNextCash,flipPreinsertCash,flipAfterInsert=nil,nil,false,false,false;local cashValidationCount=0
local sensitiveFlipNeedle,sensitiveFlipKind=nil,nil
local activeFlipPending=false
local originalActive=Phone.activeNumber
local function replaceActor()
 PLAYERS[1]={PlayerData={source=1,citizenid='replacement-cid',charinfo={firstname='New',lastname='Actor',phone='5550000098'},metadata={},items={},job={name='unemployed',grade={level=0}}}}
 Phone.Server.Profiles['replacement-cid']={citizenid='replacement-cid',phone_number='5550000098',charinfo={firstname='New',lastname='Actor'},metadata={},crypto={}}
end
Phone.activeNumber=function(src)
 local number=originalActive(src)
 if activeFlipPending and src==1 then activeFlipPending=false;replaceActor() end
 return number
end
local function flipAfterRead(sql)
 if sensitiveFlipNeedle and sql:find(sensitiveFlipNeedle,1,true) then
  local kind=sensitiveFlipKind;sensitiveFlipNeedle=nil;sensitiveFlipKind=nil
  if kind=='cid' then
   replaceActor()
  elseif kind=='active-cid' then
   activeFlipPending=true
  else Phone.Server.Profiles['direct-cid'].phone_number='5550000099' end
 end
end
local originalPlayer=PLAYERS[1]
PhoneDB.one=function(sql,p)
 if sql:find('SELECT id FROM sim_cards WHERE phone_number=?',1,true) then return {id=1}
 elseif sql:find('SELECT id,timestamp FROM phone_messages WHERE from_phone=? AND client_nonce=?',1,true) then
  local row=byNonce[p[1]..':'..p[2]];local result=row and {id=row.id,timestamp=row.timestamp} or nil;flipAfterRead(sql);return result
 elseif sql:find('SELECT id FROM phone_messages WHERE id=? AND (from_phone=? OR to_phone=?)',1,true) then
  local row=messages[tonumber(p[1])];local result=row and (row.from_phone==p[2] or row.to_phone==p[3]) and {id=row.id} or nil;flipAfterRead(sql);return result
 elseif sql:find('SELECT id,timestamp,to_phone,message,attachments,reply_to FROM phone_messages WHERE from_phone=? AND client_nonce=?',1,true) then
  local row=byNonce[p[1]..':'..p[2]];if flipReplay then flipReplay=false;Phone.Server.Profiles['direct-cid'].phone_number='5550000099' end
  return row and {id=row.id,timestamp=row.timestamp,to_phone=row.to_phone,message=row.message,attachments=row.attachments,reply_to=row.reply_to} or nil
 elseif sql:find('SELECT id FROM phone_messages WHERE id=? AND',1,true) then
  local row=messages[tonumber(p[1])];if flipReply then flipReply=false;Phone.Server.Profiles['direct-cid'].phone_number='5550000099' end
  if row and ((row.from_phone==p[2] and row.to_phone==p[3]) or (row.from_phone==p[4] and row.to_phone==p[5])) then return {id=row.id} end
 end
 flipAfterRead(sql)
 return nil
end
local originalQuery,originalUpdate=PhoneDB.query,PhoneDB.update;local sensitiveWrites=0
PhoneDB.query=function(sql,p)
 local result={}
 if sql:find('SELECT m.*,COALESCE(pref.muted,0) muted FROM phone_messages m JOIN',1,true) or sql:find('message LIKE',1,true) or sql:find('SELECT * FROM phone_messages WHERE id<? AND ((from_phone=?',1,true) then
  result={{id=77,from_phone=target,to_phone=own,message='private old SIM message',attachments='[]',timestamp=1,unread=1,reply_to=nil,muted=0}}
 elseif sql:find('SELECT * FROM phone_messages WHERE',1,true) and sql:find(' AND id<=?',1,true) then
  result={{id=77,from_phone=target,to_phone=own,message='around target',attachments='[]',timestamp=1,unread=1}}
 elseif sql:find('SELECT message_id,actor_phone,reaction FROM phone_message_reactions',1,true) then result={} end
 flipAfterRead(sql);return result
end
PhoneDB.update=function(sql,p)sensitiveWrites=sensitiveWrites+1;return 1 end
PhoneDB.insert=function(sql,p)
 check(sql:find('INSERT INTO phone_messages',1,true)~=nil,'direct send uses the phone_messages table')
 check(sql:find('FROM (SELECT 1 AS anchor) AS seed LEFT JOIN phone_messages AS reply_target',1,true)~=nil and sql:find('WHERE ? IS NULL OR reply_target.id IS NOT NULL',1,true)~=nil,'direct reply target is checked by a supported commit-time join')
 local reply=tonumber(p[7]);if reply then local row=messages[reply];if not row or row.id~=tonumber(p[8]) or not ((row.from_phone==p[9] and row.to_phone==p[10]) or (row.from_phone==p[11] and row.to_phone==p[12])) then return nil end end
 nextId=nextId+1;inserts=inserts+1;local row={id=nextId,from_phone=p[1],to_phone=p[2],message=p[3],attachments=p[4],timestamp=p[5],client_nonce=p[6],reply_to=reply}
 messages[row.id]=row;byNonce[p[1]..':'..p[6]]=row
 if flipAfterInsert then flipAfterInsert=false;PLAYERS[1]={PlayerData={source=1,citizenid='replacement-cid',charinfo={firstname='New',lastname='Actor',phone='5550000098'},metadata={},items={},job={name='unemployed',grade={level=0}}}};Phone.Server.Profiles['replacement-cid']={citizenid='replacement-cid',phone_number='5550000098',charinfo={firstname='New',lastname='Actor'},metadata={},crypto={}} end
 return row.id
end
Phone.validateCashMessage=function()
 cashValidationCount=cashValidationCount+1
 if flipNextCash then flipNextCash=false;Phone.Server.Profiles['direct-cid'].phone_number='5550000099' end
 if flipPreinsertCash and cashValidationCount==2 then flipPreinsertCash=false;Phone.Server.Profiles['direct-cid'].phone_number='5550000098' end
 return true
end
Phone.Server.Profiles['direct-cid'].phone_number=own
local function send(payload) return Phone.sendMessage(1,payload) end
local first=send({Phone=target,Message='Hello there',OperationId='direct-message-op-0001'})
eq(first.Success,true);eq(messages[first.MessageId].to_phone,target);eq(inserts,1)
local replay=send({Phone=target,Message='Hello there',OperationId='direct-message-op-0001'})
eq(replay.Success,true);eq(replay.Replayed,true);eq(replay.MessageId,first.MessageId);eq(inserts,1,'exact direct-message replay does not insert twice')
local changedBody=send({Phone=target,Message='Different content',OperationId='direct-message-op-0001'})
eq(changedBody.Success,false,'same nonce with different message content is rejected');eq(inserts,1)
local changedTarget=send({Phone='5550000003',Message='Hello there',OperationId='direct-message-op-0001'})
eq(changedTarget.Success,false,'same nonce with another destination is rejected');eq(inserts,1)

local activeBefore=inserts;local activeCalls=0;local wrappedActive=Phone.activeNumber
Phone.activeNumber=function(src)
 local number=wrappedActive(src);if src==1 then activeCalls=activeCalls+1;if activeCalls==2 then replaceActor() end end;return number
end
local yieldedActor=send({Phone=target,Message='Do not cross character switch',OperationId='direct-message-active-yield-0001'})
eq(yieldedActor.Success,false,'direct send detects a character change during the active-SIM read');eq(inserts,activeBefore,'active-SIM yield cannot commit under a replacement character')
Phone.activeNumber=wrappedActive;PLAYERS[1]=originalPlayer;Phone.Server.Profiles['direct-cid'].phone_number=own

messages[77]={id=77,from_phone=target,to_phone=own,message='Reply target',attachments='[]',timestamp=1}
flipReply=true;local before=inserts
local staleReply=send({Phone=target,Message='Reply',ReplyTo=77,OperationId='direct-message-reply-0001'})
eq(staleReply.Success,false,'direct send rechecks the actor after its reply-target lookup');eq(inserts,before,'stale actor cannot insert a reply');Phone.Server.Profiles['direct-cid'].phone_number=own

cashValidationCount=0;flipNextCash=true;before=inserts
local staleCashValidation=send({Phone=target,Message='',Attachments={{type='cash-request',requestId=19}},OperationId='direct-message-cash-0001'})
eq(staleCashValidation.Success,false,'cash validation read is followed by an actor/SIM check');eq(inserts,before,'stale cash validation cannot insert a message');Phone.Server.Profiles['direct-cid'].phone_number=own

cashValidationCount=0;flipPreinsertCash=true;before=inserts
local stalePrecommit=send({Phone=target,Message='',Attachments={{type='cash-request',requestId=20}},OperationId='direct-message-cash-0002'})
eq(stalePrecommit.Success,false,'cash receipt is revalidated before the insert and identity is checked after that read');eq(inserts,before,'stale precommit cash check cannot insert a message');Phone.Server.Profiles['direct-cid'].phone_number=own

cashValidationCount=0;Phone.validateCashMessage=function()cashValidationCount=cashValidationCount+1;return true end
local cash=send({Phone=target,Message='',Attachments={{type='cash-transfer',operationId='cash-ref-0000000001'}},OperationId='direct-message-cash-0003'})
eq(cash.Success,true,'valid cash receipt is revalidated before message commit');eq(cashValidationCount,2);eq(inserts,before+1)
local savedDecode=json.decode;json.decode=function(raw)
 if raw=='DIRECT_REORDERED_KEYS' then return {{operationId='direct-ref-0000000001',type='cash-transfer'},{requestId=19,type='cash-request'}} end
 if raw=='DIRECT_MALFORMED_REF' then return {{type='cash-transfer',operationId='bad reference'}} end
 if raw=='DIRECT_MALFORMED_OBJECT' then return {junk='bad'} end
 if raw=='DIRECT_SPARSE_ARRAY' then return {[3]={type='cash-request',requestId=19}} end
 return savedDecode(raw)
end
local pair={{type='cash-transfer',operationId='direct-ref-0000000001'},{type='cash-request',requestId=19}}
local plain=send({Phone=target,Message='No attachments',OperationId='direct-empty-attachments-replay-0001'});eq(plain.Success,true)
byNonce[own..':direct-empty-attachments-replay-0001'].attachments='DIRECT_MALFORMED_OBJECT'
local malformedObject=send({Phone=target,Message='No attachments',OperationId='direct-empty-attachments-replay-0001'});eq(malformedObject.Success,false,'malformed direct attachment object cannot replay as an empty list')
byNonce[own..':direct-empty-attachments-replay-0001'].attachments='DIRECT_SPARSE_ARRAY'
local sparseObject=send({Phone=target,Message='No attachments',OperationId='direct-empty-attachments-replay-0001'});eq(sparseObject.Success,false,'sparse direct attachment array is rejected')
local pairSent=send({Phone=target,Message='',Attachments=pair,OperationId='direct-attachments-replay-0001'});eq(pairSent.Success,true,'direct cash attachment fixture commits')
byNonce[own..':direct-attachments-replay-0001'].attachments='DIRECT_REORDERED_KEYS'
local keyOrderReplay=send({Phone=target,Message='',Attachments=pair,OperationId='direct-attachments-replay-0001'});eq(keyOrderReplay.Success,true,'reordered JSON object keys preserve direct attachment replay')
byNonce[own..':direct-attachments-replay-0001'].attachments='DIRECT_MALFORMED_REF'
local malformedReplay=send({Phone=target,Message='',Attachments=pair,OperationId='direct-attachments-replay-0001'});eq(malformedReplay.Success,false,'malformed stored direct cash reference is rejected')
byNonce[own..':direct-attachments-replay-0001'].attachments='DIRECT_REORDERED_KEYS'
local changedAttachment=send({Phone=target,Message='',Attachments={{type='cash-transfer',operationId='direct-ref-changed-0001'},{type='cash-request',requestId=19}},OperationId='direct-attachments-replay-0001'})
eq(changedAttachment.Success,false,'changed direct cash operation reference is rejected')
local reorderedArray=send({Phone=target,Message='',Attachments={pair[2],pair[1]},OperationId='direct-attachments-replay-0001'})
eq(reorderedArray.Success,false,'reordered direct attachment array is rejected')
json.decode=savedDecode

local emitted=#EMITTED;flipAfterInsert=true
local switched=send({Phone=target,Message='Saved before source replacement',OperationId='direct-message-switch-0001'})
eq(switched.Success,false,'post-insert source replacement returns reconciliation error');eq(#EMITTED,emitted,'recycled source gets no message refresh after insert');PLAYERS[1]=originalPlayer;Phone.Server.Profiles['direct-cid'].phone_number=own

local staleInbox;sensitiveFlipNeedle='SELECT m.*,COALESCE(pref.muted,0) muted FROM phone_messages m JOIN';sensitiveFlipKind='active-cid'
staleInbox=rpc('peak-phone:Server:Messages:GetInbox',1,{})
eq(staleInbox.Success,false,'GetInbox suppresses rows when the character changes during the active-SIM recheck');check(staleInbox.Conversations==nil,'stale inbox never returns old-character conversation data');PLAYERS[1]=originalPlayer;Phone.Server.Profiles['direct-cid'].phone_number=own

local staleInboxReactions;sensitiveFlipNeedle='SELECT message_id,actor_phone,reaction FROM phone_message_reactions';sensitiveFlipKind='active-cid'
staleInboxReactions=rpc('peak-phone:Server:Messages:GetInbox',1,{})
eq(staleInboxReactions.Success,false,'GetInbox suppresses rows when the character changes during the reaction recheck');check(staleInboxReactions.Conversations==nil,'post-reaction stale inbox never returns old-character conversation data');PLAYERS[1]=originalPlayer;Phone.Server.Profiles['direct-cid'].phone_number=own

local readsBefore=sensitiveWrites;sensitiveFlipNeedle='SELECT * FROM phone_messages WHERE id<? AND ((from_phone=?';sensitiveFlipKind='cid'
local staleHistory=rpc('peak-phone:Server:Messages:GetHistory',1,{Phone=target})
eq(staleHistory.Success,false,'GetHistory suppresses old-character rows after its read');eq(sensitiveWrites,readsBefore,'stale GetHistory does not clear old-SIM unread state');PLAYERS[1]=originalPlayer;Phone.Server.Profiles['direct-cid'].phone_number=own

messages[77]={id=77,from_phone=target,to_phone=own,message='around',attachments='[]',timestamp=1,unread=1}
readsBefore=sensitiveWrites;sensitiveFlipNeedle='AND id<? LIMIT 1';sensitiveFlipKind='sim'
local staleAround=rpc('peak-phone:Server:Messages:GetHistoryAround',1,{Phone=target,MessageId=77})
eq(staleAround.Success,false,'around cursor read revalidates SIM before the legacy read update');eq(sensitiveWrites,readsBefore,'stale cursor cannot clear old-SIM unread state');Phone.Server.Profiles['direct-cid'].phone_number=own

local savedDecorator=Phone.decorateCashAttachments
Phone.decorateCashAttachments=function(viewer,group,attachments)replaceActor();return attachments end
local staleSearch=rpc('peak-phone:Server:Messages:Search',1,{Query='private'})
eq(staleSearch.Success,false,'Search rechecks the character after attachment decoration reads');check(staleSearch.Messages==nil,'stale search never returns message data after decoration');Phone.decorateCashAttachments=savedDecorator;PLAYERS[1]=originalPlayer;Phone.Server.Profiles['direct-cid'].phone_number=own

sensitiveFlipNeedle='SELECT id,timestamp FROM phone_messages WHERE from_phone=? AND client_nonce=?';sensitiveFlipKind='cid'
local staleOperation=rpc('peak-phone:Server:Messages:GetOperation',1,{OperationId='direct-message-op-0001'})
eq(staleOperation.Success,false,'GetOperation suppresses old-character commit status');check(staleOperation.Committed==nil,'stale operation query never returns commit details');PLAYERS[1]=originalPlayer;Phone.Server.Profiles['direct-cid'].phone_number=own

local reactionWrites=sensitiveWrites;sensitiveFlipNeedle='SELECT id FROM phone_messages WHERE id=? AND (from_phone=? OR to_phone=?)';sensitiveFlipKind='sim'
local staleReaction=rpc('peak-phone:Server:Messages:SetReaction',1,{MessageId=77,Reaction='❤️'})
eq(staleReaction.Success,false,'direct reaction rechecks identity after target ownership read');eq(sensitiveWrites,reactionWrites,'stale direct reaction performs no write');Phone.Server.Profiles['direct-cid'].phone_number=own

local muteCalls=0;local currentActive=Phone.activeNumber;Phone.activeNumber=function(src)muteCalls=muteCalls+1;return muteCalls==1 and own or '5550000099'end
local staleMute=rpc('peak-phone:Server:Messages:SetMute',1,{Phone=target,Muted=true})
eq(staleMute.Success,false,'SetMute checks identity again before saving its preference');eq(sensitiveWrites,reactionWrites,'stale SetMute performs no write');Phone.activeNumber=currentActive
PhoneDB.query=originalQuery;PhoneDB.update=originalUpdate;Phone.Server.Profiles['direct-cid'].phone_number=own

local memoId='MEMO-'..string.rep('a',32)
local memoSaved=json.encode({{type='voice-memo',id=memoId,name='Old title',durationMs=1000}})
check(Phone.sameAttachments(memoSaved,{{type='voice-memo',id=memoId,name='New title',durationMs=1000}}),'Rename preserves recording retry identity')
check(not Phone.sameAttachments(memoSaved,{{type='voice-memo',id='MEMO-'..string.rep('b',32),name='New title',durationMs=1000}}),'Different recording cannot reuse message reference')
