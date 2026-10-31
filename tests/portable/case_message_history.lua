base('qbcore');Citizen.CreateThread=CreateThread;Citizen.Wait=Wait;addPlayer(1,'history-cid');PLAYERS[1].PlayerData.charinfo.phone='5550000001';loadrel('server/sv_simcard.lua');loadrel('server/sv_messages.lua');loadrel('server/sv_groups.lua')
local peer,group='5550000002','GRP12345678';local member=Phone.activeNumber(1);local directRows,groupRows={},{};local directDeleted,groupDeleted=false,false;local deleteDirectAfterPrev,deleteGroupAfterPrev=false,false;local memberLookups,flipDuringFinalMembership=0,nil;local activeOverride,originalActive=nil,nil
local function rowsAround(rows,limit,accept,descending)
 local out={};for _,row in ipairs(rows)do if accept(row)then out[#out+1]=row end end
 table.sort(out,function(a,b)if descending then return a.id>b.id end;return a.id<b.id end)
 while #out>limit do table.remove(out)end;return out
end
local function hasRow(rows,id,deleted)return not deleted and rows[tonumber(id)]~=nil end
local function fixtureRows()
 directRows={
  [1]={id=1,from_phone=peer,to_phone=member,message='older one',attachments='',timestamp=1000,unread=0},
  [2]={id=2,from_phone=peer,to_phone=member,message='older two',attachments='',timestamp=2000,unread=0},
  [3]={id=3,from_phone=peer,to_phone=member,message=string.rep('x',900000),attachments='',timestamp=3000,unread=0},
  [4]={id=4,from_phone=peer,to_phone=member,message='target',attachments='',timestamp=4000,unread=0},
  [5]={id=5,from_phone=member,to_phone=peer,message='newer one',attachments='',timestamp=5000,unread=0},
  [6]={id=6,from_phone=member,to_phone=peer,message=string.rep('y',900000),attachments='',timestamp=6000,unread=0},
  [7]={id=7,from_phone=member,to_phone=peer,message='newer two',attachments='',timestamp=7000,unread=0},
 }
 groupRows={}
 for id,row in pairs(directRows)do groupRows[id]={id=id,group_id=group,sender_phone=row.from_phone==member and member or peer,message=row.message,attachments='{}',timestamp=row.timestamp,reply_to=nil}end
 directDeleted=false;groupDeleted=false;deleteDirectAfterPrev=false;deleteGroupAfterPrev=false
end
fixtureRows()
PhoneDB.query=function(sql,p)
 if sql:find('SELECT * FROM phone_messages WHERE',1,true) then
  if sql:find('id<=?',1,true)then local out=rowsAround(directRows,14,function(r)return r.id<=p[#p] and not(directDeleted and r.id==4)end,true);if deleteDirectAfterPrev then directDeleted=true;deleteDirectAfterPrev=false end;return out end
  if sql:find('id>?',1,true)then return rowsAround(directRows,13,function(r)return r.id>p[#p]end,false)end
 elseif sql:find('SELECT * FROM phone_group_messages WHERE',1,true)then
  if sql:find('id<=?',1,true)then local out=rowsAround(groupRows,14,function(r)return r.id<=p[2] and not(groupDeleted and r.id==4)end,true);if deleteGroupAfterPrev then groupDeleted=true;deleteGroupAfterPrev=false end;return out end
  if sql:find('id>?',1,true)then return rowsAround(groupRows,13,function(r)return r.id>p[2]end,false)end
 elseif sql:find('FROM phone_message_reactions',1,true)or sql:find('FROM phone_group_message_reactions',1,true)then return {}
 elseif sql:find('SELECT * FROM `phone_group_members`',1,true)then
  local result=p['@GroupId']==group and p['@Phone']==member and {{phone=member}} or {}
  memberLookups=memberLookups+1
  if memberLookups==2 and flipDuringFinalMembership then
   if flipDuringFinalMembership=='sim' then activeOverride='5550000009'
   else PLAYERS[1]={PlayerData={source=1,citizenid='history-replacement-cid',charinfo={firstname='New',lastname='Actor',phone=member},metadata={},items={},job={name='unemployed',grade=0}}} end
   flipDuringFinalMembership=nil
  end
  return result
 elseif sql:find('SELECT * FROM `phone_contacts`',1,true)then return {{name='Friend'}}
 end
 return {}
end
PhoneDB.one=function(sql,p)
 if sql:find('SELECT id FROM phone_messages WHERE id=? AND',1,true)then
  if hasRow(directRows,p[1],directDeleted)then return {id=p[1]}end;return nil
 elseif sql:find('SELECT id FROM phone_group_messages WHERE id=? AND group_id=?',1,true)then
  if hasRow(groupRows,p[1],groupDeleted)and p[2]==group then return {id=p[1]}end;return nil
 elseif sql:find('SELECT id FROM phone_messages WHERE',1,true)then
  local bound=tonumber(p[#p]);for _,row in pairs(directRows)do if not directDeleted or row.id~=4 then if sql:find('id<?',1,true)and row.id<bound then return {id=row.id}elseif sql:find('id>?',1,true)and row.id>bound then return {id=row.id}end end end
 elseif sql:find('SELECT id FROM phone_group_messages WHERE',1,true)then
  local bound=tonumber(p[2]);for _,row in pairs(groupRows)do if not groupDeleted or row.id~=4 then if sql:find('id<?',1,true)and row.id<bound then return {id=row.id}elseif sql:find('id>?',1,true)and row.id>bound then return {id=row.id}end end end
 end
 return nil
end
PhoneDB.update=function()return 1 end
originalActive=Phone.activeNumber;Phone.activeNumber=function(src)return activeOverride or originalActive(src)end

local direct=rpc('peak-phone:Server:Messages:GetHistoryAround',1,{Phone=peer,MessageId=4})
check(direct.Success);eq(#direct.Messages,2,'direct around window is capped at the first over-budget row in each direction')
eq(direct.Messages[1].Id,4,'direct target remains present');eq(direct.Messages[2].Id,5,'direct newer rows stay contiguous after a farther large row is skipped')
fixtureRows();deleteDirectAfterPrev=true
local deletedDirect=rpc('peak-phone:Server:Messages:GetHistoryAround',1,{Phone=peer,MessageId=4})
eq(deletedDirect.Success,false,'direct target deleted between around reads returns unavailable instead of opening neighboring messages')

fixtureRows();local grouped=rpc('peak-phone:Server:Groups:GetMessagesAround',1,{GroupId=group,AroundId=4})
check(grouped.Success);eq(#grouped.Messages,2,'group around window is capped at the first over-budget row in each direction')
eq(grouped.Messages[1].Id,4,'group target remains present');eq(grouped.Messages[2].Id,5,'group newer rows stay contiguous after a farther large row is skipped')
fixtureRows();deleteGroupAfterPrev=true
local deletedGroup=rpc('peak-phone:Server:Groups:GetMessagesAround',1,{GroupId=group,AroundId=4})
eq(deletedGroup.Success,false,'group target deleted between around reads returns unavailable instead of opening neighboring messages')

local originalPlayer=PLAYERS[1]
fixtureRows();memberLookups=0;activeOverride=nil;flipDuringFinalMembership='sim'
local staleSim=rpc('peak-phone:Server:Groups:GetMessagesAround',1,{GroupId=group,AroundId=4})
eq(staleSim.Success,false,'SIM changes during the final membership query must reject group history')
check(staleSim.Messages==nil,'old SIM history is not returned after a final membership yield')
eq(memberLookups,2,'the second membership read is the final authorization query')
PLAYERS[1]=originalPlayer;activeOverride=nil
fixtureRows();memberLookups=0;activeOverride=member;flipDuringFinalMembership='character'
local staleCharacter=rpc('peak-phone:Server:Groups:GetMessagesAround',1,{GroupId=group,AroundId=4})
eq(staleCharacter.Success,false,'character changes during the final membership query must reject group history')
check(staleCharacter.Messages==nil,'old character history is not returned after a final membership yield')
eq(memberLookups,2,'character case reaches the final membership authorization query')
activeOverride=nil;Phone.activeNumber=originalActive;PLAYERS[1]=originalPlayer
