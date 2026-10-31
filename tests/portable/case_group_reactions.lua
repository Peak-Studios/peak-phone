base('qbcore');Citizen.CreateThread=CreateThread;Citizen.Wait=Wait;addPlayer(1,'char1:LICENSE-A');addPlayer(2,'char3:LICENSE-B')
loadrel('server/sv_simcard.lua');loadrel('server/sv_groups.lua');IsNetworkEnabled=true
local groupA,groupB='GRP12345678','GRP87654321';local own,other='5550000001','5550000002'
local members={[groupA]={[own]=true,[other]=true},[groupB]={[own]=true}}
local messages={[77]={id=77,group_id=groupA}};local savedByNonce={}
local reactions={[77]={[other]='😂'}};local writes,readCalls,targetReads,messageCommits=0,0,0,0
local flipAt,flipReplayNext,flipAfterInsert=false,false,false
PhoneDB.query=function(sql,params)
 readCalls=readCalls+1
 if sql:find('SELECT * FROM `phone_group_members`',1,true) then
  local group,phone=params['@GroupId'],params['@Phone'];local found=members[group] and members[group][phone]
  if found then return {{group_id=group,phone=phone}} end;return {}
 elseif sql:find('SELECT phone FROM `phone_group_members`',1,true) or sql:find('SELECT phone FROM phone_group_members',1,true) then
  local group=params['@GroupId'];local out={};for phone in pairs(members[group] or {}) do out[#out+1]={phone=phone} end;return out
 elseif sql:find('SELECT name FROM phone_groups',1,true) then return {{name='Test Group'}}
 elseif sql:find('FROM phone_contacts',1,true) then return {} end
 return {}
end
PhoneDB.one=function(sql,params)
 readCalls=readCalls+1
 if sql:find('SELECT id,timestamp,message,attachments,reply_to FROM phone_group_messages',1,true) then
  local key=params[1]..':'..params[2]..':'..params[3];local row=savedByNonce[key]
  if flipReplayNext then flipReplayNext=false;Phone.Server.Profiles['char1:LICENSE-A'].phone_number='5550000099' end
  return row and {id=row.id,timestamp=row.timestamp,message=row.message,attachments=row.attachments,reply_to=row.reply_to} or nil
 elseif sql:find('SELECT id FROM phone_group_messages',1,true) then
  targetReads=targetReads+1;local row=messages[params[1]];local result=row and row.group_id==params[2] and {id=row.id} or nil
  if flipAt and targetReads==flipAt then Phone.Server.Profiles['char1:LICENSE-A'].phone_number='5550000099' end
  return result
 end
 return nil
end
PhoneDB.update=function(sql,params)
 writes=writes+1
 if sql:find('INSERT INTO phone_group_message_reactions',1,true) then
  local actor,reaction,member,msgId,group=params[1],params[2],params[4],params[5],params[6]
  local row=messages[msgId];if not row or row.group_id~=group or actor~=member or not (members[group] and members[group][member]) then return 0 end
  reactions[msgId]=reactions[msgId] or {};reactions[msgId][actor]=reaction;return 1
 elseif sql:find('DELETE r FROM phone_group_message_reactions',1,true) then
  local member,msgId,group,actor=params[1],params[2],params[3],params[4];local row=messages[msgId]
  if row and row.group_id==group and member==actor and members[group] and members[group][member] and reactions[msgId] then reactions[msgId][actor]=nil;return 1 end
  return 0
 end
 error('Unexpected group update: '..sql)
end
PhoneDB.insert=function(sql,params)
 messageCommits=messageCommits+1
 check(sql:find('FROM phone_group_members AS current_member',1,true),'commit SQL binds current group membership')
 check(sql:find('LEFT JOIN phone_group_messages AS reply_target',1,true) and sql:find('reply_target.id IS NOT NULL',1,true),'commit SQL uses a cardinality-safe group-bound reply join')
 check(not sql:find('EXISTS (SELECT 1 FROM phone_group_messages',1,true),'commit SQL avoids the MySQL insert-target subquery restriction')
 local group,phone,reply=params.GroupId,params.Phone,params.ReplyTo
 if not (members[group] and members[group][phone]) or (reply and (not messages[reply] or messages[reply].group_id~=group)) then return 0 end
 local id=77+messageCommits;local row={id=id,group_id=group,sender_phone=phone,message=params.Message,attachments=params.Attachments,client_nonce=params.Nonce,timestamp=params.Timestamp,reply_to=reply}
 messages[id]=row;savedByNonce[group..':'..phone..':'..params.Nonce]=row
 if flipAfterInsert then
  flipAfterInsert=false;PLAYERS[1]={PlayerData={source=1,citizenid='REPLACEMENT-CID',charinfo={firstname='New',lastname='Actor',phone='5550000099'},items={},job={name='unemployed',grade=0},metadata={}}}
  Phone.Server.Profiles['REPLACEMENT-CID']={citizenid='REPLACEMENT-CID',phone_number='5550000099',charinfo={firstname='New',lastname='Actor'},metadata={},crypto={}}
 end
 return id
end
local added=rpc('peak-phone:Server:Groups:SetReaction',1,{GroupId=groupA,MessageId=77,Reaction='❤️'})
eq(added.Success,true);eq(reactions[77][own],'❤️');eq(reactions[77][other],'😂','another member reaction is preserved')
local refreshed=0;for _,entry in ipairs(EMITTED) do if entry.name=='peak-phone:Client:Groups:RefreshMessages' and entry.args[1].MessageId==77 then refreshed=refreshed+1;eq(entry.args[2],false,'reaction refresh must not create a message notification') end end;eq(refreshed,2,'all online group members refresh')
local removed=rpc('peak-phone:Server:Groups:SetReaction',1,{GroupId=groupA,MessageId=77,Reaction=''})
eq(removed.Success,true);eq(reactions[77][own],nil);eq(reactions[77][other],'😂','remove only this actor reaction')
local beforeWrites=writes;local wrongTarget=rpc('peak-phone:Server:Groups:SetReaction',1,{GroupId=groupB,MessageId=77,Reaction='👍'})
eq(wrongTarget.Success,false,'message ID is bound to the caller-specified group');eq(writes,beforeWrites,'wrong-group target is never written')
Phone.Server.Profiles['char1:LICENSE-A'].phone_number=own;flipAt=targetReads+2;beforeWrites=writes
local changed=rpc('peak-phone:Server:Groups:SetReaction',1,{GroupId=groupA,MessageId=77,Reaction='🔥'})
eq(changed.Success,false,'revalidate the active SIM after yielded membership/message reads');eq(writes,beforeWrites,'stale identity cannot write a reaction');Phone.Server.Profiles['char1:LICENSE-A'].phone_number=own;flipAt=nil
local sent=rpc('peak-phone:Server:Groups:SendMessage',1,{GroupId=groupA,Message='Hello group',OperationId='group-op-1234567890'})
eq(sent.Success,true);check(sent.MessageId and sent.MessageId>0,'group send returns committed message ID');eq(messages[sent.MessageId].group_id,groupA)
local originalDecode=json.decode;json.decode=function(raw)
 if raw=='GROUP_REORDERED_KEYS' then return {{operationId='group-ref-0000000001',type='cash-transfer'},{requestId=23,type='cash-request'}} end
 if raw=='GROUP_MALFORMED_REF' then return {{type='cash-transfer',operationId='bad reference'}} end
 if raw=='GROUP_MALFORMED_OBJECT' then return {junk='bad'} end
 if raw=='GROUP_SPARSE_ARRAY' then return {[3]={type='cash-request',requestId=23}} end
 return originalDecode(raw)
end
Phone.validateCashMessage=function()return true end
local pair={{type='cash-transfer',operationId='group-ref-0000000001'},{type='cash-request',requestId=23}}
local plain=rpc('peak-phone:Server:Groups:SendMessage',1,{GroupId=groupA,Message='No attachments',OperationId='group-empty-attachments-replay-0001'});eq(plain.Success,true)
savedByNonce[groupA..':'..own..':group-empty-attachments-replay-0001'].attachments='GROUP_MALFORMED_OBJECT'
local malformedObject=rpc('peak-phone:Server:Groups:SendMessage',1,{GroupId=groupA,Message='No attachments',OperationId='group-empty-attachments-replay-0001'});eq(malformedObject.Success,false,'malformed group attachment object cannot replay as an empty list')
savedByNonce[groupA..':'..own..':group-empty-attachments-replay-0001'].attachments='GROUP_SPARSE_ARRAY'
local sparseObject=rpc('peak-phone:Server:Groups:SendMessage',1,{GroupId=groupA,Message='No attachments',OperationId='group-empty-attachments-replay-0001'});eq(sparseObject.Success,false,'sparse group attachment array is rejected')
local cashSent=rpc('peak-phone:Server:Groups:SendMessage',1,{GroupId=groupA,Message='',Attachments=pair,OperationId='group-attachments-replay-0001'});eq(cashSent.Success,true,'group cash attachment fixture commits')
savedByNonce[groupA..':'..own..':group-attachments-replay-0001'].attachments='GROUP_REORDERED_KEYS'
local keyOrderReplay=rpc('peak-phone:Server:Groups:SendMessage',1,{GroupId=groupA,Message='',Attachments=pair,OperationId='group-attachments-replay-0001'});eq(keyOrderReplay.Success,true,'reordered JSON object keys preserve group attachment replay')
savedByNonce[groupA..':'..own..':group-attachments-replay-0001'].attachments='GROUP_MALFORMED_REF'
local malformedReplay=rpc('peak-phone:Server:Groups:SendMessage',1,{GroupId=groupA,Message='',Attachments=pair,OperationId='group-attachments-replay-0001'});eq(malformedReplay.Success,false,'malformed stored group cash reference is rejected')
savedByNonce[groupA..':'..own..':group-attachments-replay-0001'].attachments='GROUP_REORDERED_KEYS'
local changedAttachment=rpc('peak-phone:Server:Groups:SendMessage',1,{GroupId=groupA,Message='',Attachments={{type='cash-transfer',operationId='group-ref-changed-0001'},{type='cash-request',requestId=23}},OperationId='group-attachments-replay-0001'})
eq(changedAttachment.Success,false,'changed group cash operation reference is rejected')
local reorderedArray=rpc('peak-phone:Server:Groups:SendMessage',1,{GroupId=groupA,Message='',Attachments={pair[2],pair[1]},OperationId='group-attachments-replay-0001'})
eq(reorderedArray.Success,false,'reordered group attachment array is rejected')
json.decode=originalDecode;Phone.validateCashMessage=nil
local sentEvents=0;for _,entry in ipairs(EMITTED) do if entry.name=='peak-phone:Client:Groups:RefreshMessages' and entry.args[1].MessageId==sent.MessageId then sentEvents=sentEvents+1 end end;eq(sentEvents,2,'sender and online group member refresh after commit')
local beforeCommits,beforeEvents=messageCommits,#EMITTED
Phone.validateCashMessage=function()Phone.Server.Profiles['char1:LICENSE-A'].phone_number='5550000099';return true end
local staleCash=rpc('peak-phone:Server:Groups:SendMessage',1,{GroupId=groupA,Message='',Attachments={{type='cash-request',requestId=91}},OperationId='cash-op-1234567890'})
eq(staleCash.Success,false,'cash validation yield is followed by active identity check');eq(messageCommits,beforeCommits,'stale cash reference is not inserted');eq(#EMITTED,beforeEvents,'stale cash action emits no refresh')
Phone.validateCashMessage=nil;Phone.Server.Profiles['char1:LICENSE-A'].phone_number=own
flipAt=targetReads+1;beforeCommits=messageCommits
local staleReply=rpc('peak-phone:Server:Groups:SendMessage',1,{GroupId=groupA,Message='Reply',ReplyTo=77,OperationId='reply-op-1234567890'})
eq(staleReply.Success,false,'reply-target read is followed by active identity check');eq(messageCommits,beforeCommits,'stale reply is not inserted')
flipAt=nil;Phone.Server.Profiles['char1:LICENSE-A'].phone_number=own;flipReplayNext=true;beforeCommits=messageCommits
local staleReplay=rpc('peak-phone:Server:Groups:SendMessage',1,{GroupId=groupA,Message='Replay',OperationId='replay-op-1234567890'})
eq(staleReplay.Success,false,'replay lookup yield is followed by active identity check');eq(messageCommits,beforeCommits,'stale replay reference is not inserted')
Phone.Server.Profiles['char1:LICENSE-A'].phone_number=own;local original=PLAYERS[1];flipAfterInsert=true;beforeEvents=#EMITTED
local changedAfterCommit=rpc('peak-phone:Server:Groups:SendMessage',1,{GroupId=groupA,Message='Saved while identity changed',OperationId='switch-op-1234567890'})
eq(changedAfterCommit.Success,false,'post-insert identity change returns a reconciliation error');eq(#EMITTED,beforeEvents,'post-insert identity change cannot notify the new source occupant')
PLAYERS[1]=original
local oversized={};for i=1,15 do oversized[i]='5550000'..tostring(100+i) end;local beforeReads=readCalls;beforeCommits=messageCommits
local tooMany=rpc('peak-phone:Server:Groups:CreateGroup',1,{Name='Too many members',Members=oversized})
eq(tooMany.Success,false,'group creation rejects more than 14 invitees');eq(readCalls,beforeReads,'oversized group payload triggers no database reads');eq(messageCommits,beforeCommits,'oversized group payload performs no writes')
