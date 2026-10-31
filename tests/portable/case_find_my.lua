base('qbcore');loadrel('config.lua');loadrel('sv_config.lua')
addPlayer(1,'OWNER');addPlayer(2,'RECIPIENT');addPlayer(3,'OTHER')
local simRows={
 ['SIM-OWNER']={sim_id='SIM-OWNER',phone_number='5550102001',owner_citizenid='OWNER'},
 ['SIM-RECIPIENT']={sim_id='SIM-RECIPIENT',phone_number='5550102002',owner_citizenid='RECIPIENT'},
 ['SIM-OTHER']={sim_id='SIM-OTHER',phone_number='5550102003',owner_citizenid='OTHER'},
}
local active={
 [1]={DeviceId='DUO-OWNER',SimId='SIM-OWNER',PhoneNumber='5550102001',Generation=4,Status='active'},
 [2]={DeviceId='DUO-RECIPIENT',SimId='SIM-RECIPIENT',PhoneNumber='5550102002',Generation=7,Status='active'},
 [3]={DeviceId='DUO-OTHER',SimId='SIM-OTHER',PhoneNumber='5550102003',Generation=2,Status='active'},
}
Phone.Devices={active=function(src)return copy(active[tonumber(src)])end}
function Phone.getPlayer(src)
 local raw=Phone.rawPlayer(src);if not raw then return nil end
 local d=raw.PlayerData
 return {PlayerData={citizenid=d.citizenid,charinfo={firstname=d.charinfo.firstname,lastname=d.charinfo.lastname}}}
end
function GetSimCardBySimId(id)return copy(simRows[id])end
function Phone.simCitizenId(src)local sim=active[tonumber(src)] and simRows[active[tonumber(src)].SimId];return sim and (sim.owner_citizenid or sim.sim_id)end
function Phone.sameSim(src,cid)return Phone.simCitizenId(src)==cid end
function DoesEntityExist(entity)return PLAYERS[tonumber(entity)]~=nil end
BUCKETS={};COORDS={[1]=vector3(101,202,30),[2]=vector3(303,404,40),[3]=vector3(505,606,50)}
local contacts={{id=11,citizenid='OWNER',name='J. Lee · studio',phone='5550102002'}}
local shares={};local sequence=0;local freshReads=0;local dbFail=nil;local race=nil;local startSource=nil
FINDMY_TIME=2000000000;os.time=function()return FINDMY_TIME end
local function isActive(row,at)return row and (row.expires_at==nil or tonumber(row.expires_at)>at)end
local function byId(id)return shares[id]end
local function erase(predicate)for id,row in pairs(shares)do if predicate(row)then shares[id]=nil end end end
PhoneDB.one=function(sql,v)
 v=v or {}
 if sql:find('sim_cards WHERE phone_number',1,true)then
  for _,row in pairs(simRows)do if row.phone_number==v[1]then return copy(row)end end
  return nil
 end
 if sql:find('SELECT charinfo FROM peak_phone_characters',1,true)then
  local names={OWNER={'Avery','Owner'},RECIPIENT={'Jordan','Lee'},OTHER={'Maya','Chen'},TRANSFERRED={'Taylor','Brooks'}}
  local n=names[v[1]];if not n then return nil end
  return {charinfo=json.encode({firstname=n[1],lastname=n[2]})}
 end
 if sql:find('FROM phone_contacts',1,true)then
  for _,row in ipairs(contacts)do if row.citizenid==v[1]and row.phone==v[2]then return copy(row)end end
  return nil
 end
 if sql:find('FROM peak_phone_location_shares',1,true)then
  if sql:find('owner_sim_cid=?',1,true)then
   freshReads=freshReads+1
   if race=='revoke-first-on-second-fresh' and freshReads==2 then Phone.FindMy.versions['SHARE-FIRST']=(Phone.FindMy.versions['SHARE-FIRST']or 0)+1 end
   if race=='owner-device-change-on-first-fresh' and freshReads==1 then active[1].DeviceId='DUO-OWNER-NEW';Phone.FindMy.sessionChanged(1,'OWNER')end
   if race=='owner-device-change-on-second-fresh' and freshReads==2 then active[1].DeviceId='DUO-OWNER-NEW';Phone.FindMy.sessionChanged(1,'OWNER')end
   if race=='owner-source-reused-on-second-fresh' and freshReads==2 then PLAYERS[1].PlayerData.citizenid='TRANSFERRED' end
   if race=='recipient-source-reused-on-second-fresh' and freshReads==2 then PLAYERS[2].PlayerData.citizenid='TRANSFERRED' end
   if race=='recipient-bucket-changed-on-second-fresh' and freshReads==2 then BUCKETS[2]=8 end
   local r=byId(v[1]);return r and r.owner_cid==v[2]and r.owner_sim_cid==v[3]and r.owner_sim_id==v[4]and r.owner_phone==v[5]and r.owner_device_id==v[6]and r.target_cid==v[7]and r.target_sim_cid==v[8]and r.target_sim_id==v[9]and r.target_phone==v[10]and isActive(r,FINDMY_TIME*1000)and {share_id=r.share_id}or nil
  end
  if sql:find('WHERE share_id=?',1,true)then
   local r=byId(v[1])
   if sql:find('target_cid=?',1,true)and sql:find('owner_cid=?',1,true)then
    if race=='actor-swap-after-save'and sql:find('AND target_cid=?',1,true)then PLAYERS[startSource].PlayerData.citizenid='TRANSFERRED'end
    return r and r.owner_cid==v[2]and r.target_cid==v[3]and {share_id=r.share_id}or nil
   end
   if sql:find('owner_cid=?',1,true)then return r and r.owner_cid==v[2]and {share_id=r.share_id}or nil end
   return r and {share_id=r.share_id}or nil
  end
 end
 return nil
end
PhoneDB.query=function(sql,v)
 v=v or {}
 if dbFail=='targetRows'and sql:find('target_sim_cid=?',1,true)then error('database unavailable')end
 if sql:find('FROM phone_contacts c LEFT JOIN sim_cards',1,true)then
  local result={};for _,c in ipairs(contacts)do if c.citizenid==v[1]then local sim;for _,s in pairs(simRows)do if s.phone_number==c.phone then sim=s;break end end;result[#result+1]={id=c.id,name=c.name,phone=c.phone,sim_id=sim and sim.sim_id,owner_citizenid=sim and sim.owner_citizenid}end end;return result
 end
 if sql:find('FROM peak_phone_location_shares',1,true)then
  local result={}
  if sql:find('owner_cid=? AND owner_sim_id=? AND target_cid=? AND target_sim_id=?',1,true)then
   for _,r in pairs(shares)do if r.owner_cid==v[1]and r.owner_sim_id==v[2]and r.target_cid==v[3]and r.target_sim_id==v[4]then result[#result+1]=copy(r)end end
  elseif sql:find('SELECT owner_cid,target_cid,target_sim_id,expires_at',1,true)then
   for _,r in pairs(shares)do if (r.owner_cid==v[1]and isActive(r,v[2]))or(r.target_cid==v[3]and r.target_sim_id==v[4]and isActive(r,v[5]))then result[#result+1]={owner_cid=r.owner_cid,target_cid=r.target_cid,target_sim_id=r.target_sim_id,expires_at=r.expires_at}end end
  elseif sql:find('WHERE target_cid=? AND target_sim_cid=?',1,true)then
   for _,r in pairs(shares)do if r.target_cid==v[1]and r.target_sim_cid==v[2]and r.target_sim_id==v[3]and r.target_phone==v[4]and isActive(r,v[5])then result[#result+1]=copy(r)end end
   table.sort(result,function(a,b)return (tonumber(a.created_at)or 0)>(tonumber(b.created_at)or 0)end)
  elseif sql:find('WHERE owner_cid=? AND (expires_at',1,true)then
   for _,r in pairs(shares)do if r.owner_cid==v[1]and isActive(r,v[2])then result[#result+1]=copy(r)end end
  elseif sql:find('SELECT share_id FROM peak_phone_location_shares',1,true)then
   for _,r in pairs(shares)do
    local match=sql:find('owner_device_id=?',1,true)and r.owner_device_id==v[1]and r.owner_cid==v[2]
     or sql:find('target_cid=? AND target_sim_id=?',1,true)and r.target_cid==v[1]and r.target_sim_id==v[2]
     or sql:find('owner_cid=? OR target_cid=?',1,true)and(r.owner_cid==v[1]or r.target_cid==v[2])
     or sql:find('expires_at IS NOT NULL',1,true)and r.expires_at and r.expires_at<=v[1]
    if match then result[#result+1]={share_id=r.share_id}end
   end
  end
  return result
 end
 return {}
end
PhoneDB.transaction=function(statements)
 local s=statements[1];local v=s.values;startSource=1
 local contact,ownerSim,targetSim
 for _,c in ipairs(contacts)do if c.citizenid==v[23]and c.id==v[24]and c.phone==v[25]and c.name==v[26]then contact=c end end
 ownerSim=simRows[v[17]];targetSim=simRows[v[20]]
 if not contact or not ownerSim or ownerSim.owner_citizenid~=v[18]or ownerSim.phone_number~=v[19]or not targetSim or targetSim.owner_citizenid~=v[21]or targetSim.phone_number~=v[22]then return true end
 local row={share_id=v[1],owner_cid=v[2],owner_sim_cid=v[3],owner_sim_id=v[4],owner_phone=v[5],owner_device_id=v[6],owner_name=v[7],target_cid=v[8],target_sim_cid=v[9],target_sim_id=v[10],target_phone=v[11],contact_name=v[12],target_name=v[13],duration=v[14],created_at=v[15],expires_at=v[16]}
 erase(function(old)return old.owner_cid==row.owner_cid and old.owner_sim_id==row.owner_sim_id and old.target_cid==row.target_cid and old.target_sim_id==row.target_sim_id end)
 shares[row.share_id]=row;return true
end
PhoneDB.update=function(sql,v)
 if sql:find('DELETE FROM peak_phone_location_shares',1,true)then
  local n=0
  if sql:find('WHERE share_id=? AND owner_cid=?',1,true)then local r=shares[v[1]];if r and r.owner_cid==v[2]then shares[v[1]]=nil;n=1 end
  elseif sql:find('owner_device_id=? AND owner_cid=?',1,true)then erase(function(r)return r.owner_device_id==v[1]and r.owner_cid==v[2]end)
  elseif sql:find('target_cid=? AND target_sim_id=?',1,true)then erase(function(r)return r.target_cid==v[1]and r.target_sim_id==v[2]end)
  elseif sql:find('owner_cid=? OR target_cid=?',1,true)then erase(function(r)return r.owner_cid==v[1]or r.target_cid==v[2]end)
  end
  return n==0 and 1 or n
 end
 return 1
end
PhoneDB.insert=function()return 1 end
loadrel('server/sv_findmy.lua')
local function call(name,src,data,advance)
 if advance~=false then CLOCK=CLOCK+1100 end
 return rpc('peak-phone:Server:FindMy:'..name,src,data)
end
local function resolve(phone)CLOCK=CLOCK+5100;return call('ResolveRecipient',1,{Phone=phone},false)end
local function start(id,duration)CLOCK=CLOCK+5100;return call('StartSharing',1,{ConfirmationId=id,Duration=duration},false)end
local function activeShares()local n=0;for _ in pairs(shares)do n=n+1 end;return n end
local pending=resolve('5550102002');check(pending.Success,'saved contact resolves');eq(pending.Contact.Name,'J. Lee · studio');eq(pending.Recipient.Name,'Jordan Lee');eq(pending.Recipient.Phone,'5550102002')
check(not resolve('5550102999').Success,'unsaved number cannot be resolved')
local sameContact=contacts[#contacts+1];sameContact={id=12,citizenid='OWNER',name='My other line',phone='5550102001'};contacts[#contacts+1]=sameContact
check(not resolve('5550102001').Success,'cannot share with the same character on another SIM');contacts[#contacts]=nil
local started=start(pending.ConfirmationId,'one_hour');check(started.Success,'one-hour share starts');eq(started.Duration,'one_hour');eq(started.ExpiresAt,FINDMY_TIME*1000+3600000)
local first;for _,r in pairs(shares)do first=r end
eq(first.owner_cid,'OWNER');eq(first.owner_sim_id,'SIM-OWNER');eq(first.owner_device_id,'DUO-OWNER');eq(first.target_cid,'RECIPIENT');eq(first.target_sim_id,'SIM-RECIPIENT');eq(first.duration,'one_hour')
eq(first.x,nil,'database share row never stores coordinates');eq(first.location,nil,'database share row never stores location')
local invalid=resolve('5550102002');check(not start(invalid.ConfirmationId,'forever').Success,'duration is allowlisted')
local renew=resolve('5550102002');check(start(renew.ConfirmationId,'until_stopped').Success,'existing pair can be renewed');eq(activeShares(),1,'renewal replaces the same pair');local renewed;for _,r in pairs(shares)do renewed=r end;eq(renewed.expires_at,nil,'until-stopped share has no expiry')
local unauthorized=call('GetState',3);check(unauthorized.Success);eq(#unauthorized.Incoming,0,'unrelated character cannot enumerate incoming shares');eq(#unauthorized.Outgoing,0,'unrelated character cannot enumerate outgoing shares')
local inbound={share_id='SHARE-LIVE',owner_cid='OWNER',owner_sim_cid='OWNER',owner_sim_id='SIM-OWNER',owner_phone='5550102001',owner_device_id='DUO-OWNER',owner_name='Avery Owner',target_cid='RECIPIENT',target_sim_cid='RECIPIENT',target_sim_id='SIM-RECIPIENT',target_phone='5550102002',contact_name='Jordan',target_name='Jordan Lee',duration='one_hour',created_at=FINDMY_TIME*1000,expires_at=FINDMY_TIME*1000+3600000}
shares[inbound.share_id]=copy(inbound)
local live=call('GetState',2);check(live.Success);local found;for _,p in ipairs(live.Incoming)do if p.ShareId=='SHARE-LIVE'then found=p end end
check(found and found.Available,'authorized same-bucket recipient sees live position');eq(found.Location.x,101);eq(found.Location.y,202);eq(found.Location.z,30)
BUCKETS[1]=4;local separate=call('GetState',2);local isolated;for _,p in ipairs(separate.Incoming)do if p.ShareId=='SHARE-LIVE'then isolated=p end end
check(isolated and not isolated.Available,'different routing bucket withholds coordinates');eq(isolated.Status,'Different instance');eq(isolated.Location,nil);BUCKETS[1]=nil
-- Every owner validation and fresh permission query finishes before the final
-- sweep. A later row's yield must invalidate an earlier observation.
local second=copy(inbound);second.share_id='SHARE-SECOND';second.owner_cid='OTHER';second.owner_sim_cid='OTHER';second.owner_sim_id='SIM-OTHER';second.owner_phone='5550102003';second.owner_device_id='DUO-OTHER';second.owner_name='Maya Chen';second.created_at=inbound.created_at-1;shares[second.share_id]=second
erase(function(r)return r.share_id~='SHARE-SECOND' end);freshReads=0;race='revoke-first-on-second-fresh';Phone.FindMy.versions['SHARE-FIRST']=0;inbound.share_id='SHARE-FIRST';shares['SHARE-FIRST']=copy(inbound);shares['SHARE-LIVE']=nil
local raced=call('GetState',2);local firstObservation;for _,p in ipairs(raced.Incoming)do if p.ShareId=='SHARE-FIRST'then firstObservation=p end end
check(firstObservation==nil or not firstObservation.Available,'later yielding permission lookup invalidates earlier coordinate sample');if firstObservation then eq(firstObservation.Location,nil)end
race='owner-source-reused-on-second-fresh';freshReads=0;local reused=call('GetState',2);local oldOwner
for _,p in ipairs(reused.Incoming)do if p.ShareId=='SHARE-FIRST'then oldOwner=p end end
check(oldOwner and not oldOwner.Available,'reused owner source cannot publish prior character position');eq(oldOwner.Location,nil);PLAYERS[1].PlayerData.citizenid='OWNER'
race='owner-device-change-on-first-fresh';freshReads=0;local sameRowChange=call('GetState',2);local sameRowOwner
for _,p in ipairs(sameRowChange.Incoming)do if p.ShareId=='SHARE-FIRST'then sameRowOwner=p end end
check(sameRowOwner and not sameRowOwner.Available,'identity epoch bump during a row permission lookup blocks that row');eq(sameRowOwner.Location,nil);active[1].DeviceId='DUO-OWNER';Phone.FindMy.sessionChanged(1,'OWNER')
local otherRow=shares['SHARE-SECOND'];shares['SHARE-SECOND']=nil
local cached=copy(inbound);cached.share_id='SHARE-CACHED';cached.created_at=inbound.created_at-2;shares[cached.share_id]=cached
race='owner-device-change-on-second-fresh';freshReads=0;local cachedOwnerChange=call('GetState',2);local guarded=0
for _,p in ipairs(cachedOwnerChange.Incoming)do if p.ShareId=='SHARE-FIRST'or p.ShareId=='SHARE-CACHED'then check(not p.Available,'cached owner epoch bump during a later row blocks cached position');eq(p.Location,nil);guarded=guarded+1 end end
eq(guarded,2,'both rows sharing one cached owner are checked against the original epoch');active[1].DeviceId='DUO-OWNER';Phone.FindMy.sessionChanged(1,'OWNER');shares['SHARE-CACHED']=nil;shares['SHARE-SECOND']=otherRow
race='recipient-source-reused-on-second-fresh';freshReads=0;local sourceReuse=call('GetState',2);check(not sourceReuse.Success,'recipient source reuse invalidates the complete batch');PLAYERS[2].PlayerData.citizenid='RECIPIENT';race=nil
local before=activeShares();pending=resolve('5550102002');simRows['SIM-RECIPIENT'].owner_citizenid='TRANSFERRED';check(not start(pending.ConfirmationId,'one_day').Success,'SIM owner transfer invalidates recipient confirmation');eq(activeShares(),before,'failed transfer confirmation inserts no share');simRows['SIM-RECIPIENT'].owner_citizenid='RECIPIENT'
FINDMY_TIME=FINDMY_TIME+3601;local expired=call('GetState',2);for _,p in ipairs(expired.Incoming)do check(p.ShareId~='SHARE-FIRST','expired share is not returned')end;FINDMY_TIME=FINDMY_TIME-3601
dbFail='targetRows';local unavailable=call('GetState',2);check(not unavailable.Success,'database query failure returns fail-closed error');dbFail=nil
-- Ordinary disconnect preserves durable until-stopped consent; it carries no
-- coordinate while the sender is offline.
local ownerSession=PLAYERS[1];local durableCount=activeShares();event('playerDropped',1);PLAYERS[1]=nil;local offline=call('GetState',2);check(offline.Success);check(activeShares()==durableCount,'disconnect does not revoke durable consent');PLAYERS[1]=ownerSession
-- Owner-controlled revoke and semantic SIM/device hooks delete affected rows.
local own=resolve('5550102002');check(start(own.ConfirmationId,'one_day').Success);local outgoing=call('GetState',1);local ownId=outgoing.Outgoing[1]and outgoing.Outgoing[1].ShareId;check(ownId,'outgoing share is visible to its sender')
check(call('StopSharing',1,{ShareId=ownId}).Success,'sender can stop own share');check(not shares[ownId],'revoke deletes durable consent')
shares['SIM-BOUND']={share_id='SIM-BOUND',target_cid='RECIPIENT',target_sim_id='SIM-RECIPIENT',owner_cid='OTHER',owner_sim_id='SIM-OTHER',owner_device_id='DUO-OTHER'}
Phone.FindMy.simChanged(2,'RECIPIENT','DUO-RECIPIENT','SIM-RECIPIENT','RECIPIENT');eq(shares['SIM-BOUND'],nil,'SIM change revokes recipient-bound permission')
-- A destination identity can change after SQL saves but before the last raw
-- source check; no permission is left behind for the reused source.
local beforeLate=activeShares();local late=resolve('5550102002');race='actor-swap-after-save';local lateResult=start(late.ConfirmationId,'one_day');check(not lateResult.Success,'late character swap fails final actor guard');race=nil;PLAYERS[1].PlayerData.citizenid='OWNER';check(activeShares()<=beforeLate,'late identity race leaves no newly saved share')
check(not call('StartSharing',1,{ConfirmationId='forged',Duration='one_hour'}).Success,'client cannot forge confirmation token')
shares['UNOWNED']={share_id='UNOWNED',owner_cid='OTHER',target_cid='RECIPIENT',target_sim_id='SIM-RECIPIENT'}
check(call('StopSharing',1,{ShareId='UNOWNED'}).Success and shares['UNOWNED']~=nil,'unrelated character cannot stop another owner share')
local function capFixture(direction,count)
 erase(function()return true end)
 Phone.FindMy.confirmations={}
 local pair=copy(inbound);pair.share_id='CAP-PAIR';pair.expires_at=nil;shares[pair.share_id]=pair
 for i=1,count do
  local row=copy(pair);row.share_id='CAP-'..direction..'-'..i;row.created_at=pair.created_at-i
  if direction=='outgoing'then row.target_cid='TARGET-'..i;row.target_sim_cid='TARGET-'..i;row.target_sim_id='SIM-TARGET-'..i;row.target_phone='55501'..string.format('%06d',i)
  else row.owner_cid='SENDER-'..i;row.owner_sim_cid='SENDER-'..i;row.owner_sim_id='SIM-SENDER-'..i;row.owner_phone='55502'..string.format('%06d',i)end
  shares[row.share_id]=row
 end
end
-- Renewing an exact pair does not consume a second slot. At the existing cap
-- the renewal succeeds; one more distinct permission is rejected.
capFixture('outgoing',31);local atOutgoingCap=resolve('5550102002');check(start(atOutgoingCap.ConfirmationId,'one_day').Success,'renewal at outgoing cap excludes its existing pair')
capFixture('outgoing',32);local overOutgoing=resolve('5550102002');local outgoingLimited=start(overOutgoing.ConfirmationId,'one_day');check(not outgoingLimited.Success and outgoingLimited.Msg:find('limit'),'outgoing share limit rejects a new pair at capacity')
capFixture('incoming',63);local atIncomingCap=resolve('5550102002');local incomingRenew=start(atIncomingCap.ConfirmationId,'one_day');check(incomingRenew.Success,'renewal at incoming cap excludes its existing pair: '..tostring(incomingRenew.Msg))
capFixture('incoming',64);local overIncoming=resolve('5550102002');local incomingLimited=start(overIncoming.ConfirmationId,'one_day');check(not incomingLimited.Success and incomingLimited.Msg:find('limit'),'incoming share limit rejects a new pair at capacity')
erase(function()return true end);CLOCK=CLOCK+10000
for _=1,3 do check(call('GetState',2,{},false).Success,'state polling remains available under its per-player allowance')end
local throttled=call('GetState',2,{},false);check(not throttled.Success and throttled.Msg:find('refresh'),'rapid state polling is rate limited')
