local callbacks={};local rows={};local ids=0;local playerCid={[1]='one',[2]='two',[3]='three'};local numbers={[1]='111',[2]='222',[3]='333'}
local clock=0
function GetGameTimer()return clock end
function GetPlayers()return {'1','2','3'}end
local buckets={[1]=0,[2]=0,[3]=1};local positions={[1]={x=0,y=0,z=0},[2]={x=5,y=0,z=0},[3]={x=1,y=0,z=0}};local vehicles={};local direct={};local insertFails=false;local equipped=true;local listenerEquipped=true;local numberReads={};local shareRateBlocked=false
Phone={rate=function()return not shareRateBlocked end,hasPhone=function(src)if src==2 then return listenerEquipped end;return equipped end,rawPlayer=function(src)return playerCid[src] end,rawIdentity=function(v)return v end,activeNumber=function(src)numberReads[src]=(numberReads[src] or 0)+1;return numbers[src] end,
 random=function(n)ids=ids+1;return string.rep('a',n-4)..string.format('%04x',ids)end,
 string=function(v,n)return type(v)=='string' and #v>0 and #v<=n and v or nil end,
 phone=function(v)return type(v)=='string' and v:match('^%d+$') and v or nil end,
 publicError=function(msg)return {Success=false,Msg=msg}end,
 sendMessage=function()return {Success=true}end}
Peak={Functions={CreateCallback=function(name,fn)callbacks[name:match('VoiceMemos:(.+)$')]=fn end}}
function GetPlayerRoutingBucket(src)return buckets[src]end
function GetPlayerPed(src)return playerCid[src] and src or 0 end
function GetEntityCoords(ped)return positions[ped]end
function GetVehiclePedIsIn(ped)return vehicles[ped] or 0 end
function DoesEntityExist(entity)return entity==10 end
PhoneDB={one=function(sql,args)
 if sql:find('COUNT',1,true)then return {items=0,bytes=0}end
 if sql:find('phone_messages',1,true)then return direct[args[1]] and {id=1} or nil end
 if sql:find('phone_group_messages',1,true)then return nil end
 if sql:find('operation_id',1,true)then for _,r in pairs(rows)do if r.owner_cid==args[1] and r.op==args[2] then return r end end;return nil end
 if sql:find('SUBSTRING',1,true)then local r=rows[args[3]];return r and {data=r.data:sub(args[1],args[1]+args[2]-1)} end
 return rows[args[1]]
end,update=function(_,a)if rows[a[2]] and rows[a[2]].owner_cid==a[3] then rows[a[2]].name=a[1];return 1 end;return 0 end,
insert=function(_,a)if insertFails then return nil end;rows[a[1]]={id=a[1],owner_cid=a[2],op=a[3],name=a[4],mime=a[5],size_bytes=a[6],duration_ms=a[7],data=a[8],encoded_size=#a[8]};return 1 end}
dofile(ROOT..'/server/sv_voice_memos.lua')
local function call(route,src,data)local result;callbacks[route](src,function(r)result=r end,data or {});return result end
check(not call('BeginUpload',1,{SizeBytes=9000000}).Success,'Oversized upload rejected')
local upload=call('BeginUpload',1,{Name='Test',OperationId='test',Mime='audio/webm',SizeBytes=4,DurationMs=10000})
check(upload.Success,'Valid reservation');check(not call('UploadChunk',2,{UploadId=upload.UploadId,Index=0,Data='GkXfow=='}).Success,'Upload owned by actor')
check(not call('UploadChunk',1,{UploadId=upload.UploadId,Index=1,Data='GkXfow=='}).Success,'Out of order rejected')
check(call('UploadChunk',1,{UploadId=upload.UploadId,Index=0,Data='GkXfow=='}).Success,'Chunk accepted')
local completed=call('CompleteUpload',1,{UploadId=upload.UploadId});check(completed.Success,'Persistence acknowledged');local memo=completed.MemoId
local renamed=call('BeginUpload',1,{Name='Renamed',OperationId='test',Mime='audio/webm',SizeBytes=4,DurationMs=10000});eq(renamed.MemoId,memo,'Rename reuses immutable recording');eq(rows[memo].name,'Renamed')
numbers[1]=nil;check(call('StartPlayback',1,{MemoId=memo,Output='speaker'}).Success,'Speaker playback does not require a SIM');call('StopPlayback',1);numbers[1]='111'
check(not call('Describe',2,{MemoId=memo}).Success,'Unshared private memo rejected')
local start=call('StartPlayback',1,{MemoId=memo,Output='speaker'});check(start.Success,'Owner speaker session')
listenerEquipped=false;local priorReads=numberReads[2] or 0
local heard=call('Describe',2,{MemoId=memo,SessionId=start.SessionId});check(heard.Success,'Nearby listener can download without inventory requirement');eq(numberReads[2] or 0,priorReads,'World read does not bootstrap listener phone identity');listenerEquipped=true
check(not call('Describe',3,{MemoId=memo,SessionId=start.SessionId}).Success,'Other routing bucket rejected')
check(not call('Share',2,{MemoId=memo,Phones={'333'},OperationId='steal'}).Success,'Hearing is not permission to share')
check(not call('StartPlayback',2,{MemoId=memo,Output='speaker'}).Success,'Hearing is not permission to replay')
check(call('GetChunk',2,{Ticket=heard.Ticket,Index=0}).Success,'Authorized listener fetch')
positions[2].x=25;check(not call('GetChunk',2,{Ticket=heard.Ticket,Index=0}).Success,'Moving away revokes ticket');positions[2].x=5
call('StopPlayback',1);check(not call('GetChunk',2,{Ticket=heard.Ticket,Index=0}).Success,'Stopping revokes world ticket')
local secondStart=call('StartPlayback',1,{MemoId=memo,Output='speaker'});call('StopPlayback',1,{SessionId=start.SessionId});check(Phone.VoiceMemos.sessions[secondStart.SessionId]~=nil,'Stale cleanup cannot stop a newer playback session');check(not call('GetChunk',2,{Ticket=heard.Ticket,Index=0}).Success,'Restarting same memo does not revive old session ticket');local unequip=call('Describe',2,{MemoId=memo,SessionId=secondStart.SessionId});check(unequip.Success);equipped=false;check(not call('GetChunk',2,{Ticket=unequip.Ticket,Index=0}).Success,'Unequipping owner phone revokes world ticket');equipped=true
local simTicket=call('Describe',2,{MemoId=memo,SessionId=secondStart.SessionId});check(simTicket.Success);numbers[1]='999';check(not call('GetChunk',2,{Ticket=simTicket.Ticket,Index=0}).Success,'Owner SIM change revokes world playback');numbers[1]='111';call('StopPlayback',1)
direct['222']=true;local shared=call('Describe',2,{MemoId=memo});check(shared.Success,'Existing message grants playback')
call('StartPlayback',1,{MemoId=memo,Output='speaker'});call('StopPlayback',1);check(call('GetChunk',2,{Ticket=shared.Ticket,Index=0}).Success,'Message playback is independent of world session lifecycle')
direct['222']=false;check(not call('GetChunk',2,{Ticket=shared.Ticket,Index=0}).Success,'Revoked message access invalidates ticket')
check(not call('StartPlayback',1,{MemoId=memo,Output='vehicle'}).Success,'Vehicle radio requires a vehicle')
vehicles[1]=10;vehicles[2]=10;local vehicleStart=call('StartPlayback',1,{MemoId=memo,Output='vehicle'});check(vehicleStart.Success,'Vehicle session accepted')
local radio=call('Describe',2,{MemoId=memo,SessionId=vehicleStart.SessionId});check(radio.Success,'Same-vehicle listener accepted');vehicles[2]=0
check(not call('GetChunk',2,{Ticket=radio.Ticket,Index=0}).Success,'Leaving vehicle revokes radio ticket')
vehicles[2]=10;vehicles[1]=0;check(not call('Describe',2,{MemoId=memo,SessionId=vehicleStart.SessionId}).Success,'Owner leaving stops radio authorization')
local own=call('Describe',1,{MemoId=memo});check(own.Success);playerCid[1]='changed'
check(not call('GetChunk',1,{Ticket=own.Ticket,Index=0}).Success,'Character change revokes owner ticket');playerCid[1]='one'
local upload2=call('BeginUpload',1,{Name='Fail',OperationId='fail',Mime='audio/webm',SizeBytes=4,DurationMs=1000});check(upload2.Success)
call('UploadChunk',1,{UploadId=upload2.UploadId,Index=0,Data='GkXfow=='});insertFails=true
check(not call('CompleteUpload',1,{UploadId=upload2.UploadId}).Success,'Failed insert never acknowledged')
local cancelled=call('BeginUpload',1,{Name='Cancel',OperationId='cancel',Mime='audio/webm',SizeBytes=4,DurationMs=1000});check(cancelled.Success)
call('AbortUpload',2,{UploadId=cancelled.UploadId});check(Phone.VoiceMemos.uploads[cancelled.UploadId]~=nil,'Another actor cannot cancel upload')
call('AbortUpload',1,{UploadId=cancelled.UploadId});eq(Phone.VoiceMemos.uploads[cancelled.UploadId],nil,'Owner cancellation releases reservation')
-- Run one real broadcast tick, then stop the fixture's infinite loop.
positions[4]={x=2,y=0,z=0};buckets[4]=0
function GetPlayerPed(src)return positions[src] and src or 0 end
function GetPlayers()return {'1','2','3','4'}end
call('StartPlayback',1,{MemoId=memo,Output='speaker'});EMITTED={}
local waits=0;ON_WAIT=function()waits=waits+1;if waits==2 then error('end broadcast fixture')end end
pcall(THREADS[#THREADS]);ON_WAIT=nil
eq(#EMITTED,2,'Only same-bucket nearby players receive playback metadata')
eq(EMITTED[1].args[1].Sessions[1].MemoId,memo);check(EMITTED[1].args[1].Sessions[1].IsOwner)
check(EMITTED[2].args[1].Sessions[1].Gain<EMITTED[1].args[1].Sessions[1].Gain,'Speaker volume attenuates with distance')
call('StopPlayback',1);EMITTED={};waits=0;ON_WAIT=function()waits=waits+1;if waits==2 then error('end broadcast fixture')end end
pcall(THREADS[#THREADS]);ON_WAIT=nil
eq(#EMITTED,2,'Prior listeners receive an explicit stop');eq(#EMITTED[1].args[1].Sessions,0);eq(#EMITTED[2].args[1].Sessions,0)

local sharedBatch=call('Share',1,{MemoId=memo,Phones={'222','333'},OperationId='batch'});check(sharedBatch.Success);eq(#sharedBatch.Sent,2,'Contact batch reports each confirmed send')
shareRateBlocked=true;check(not call('Share',1,{MemoId=memo,Phones={'222'},OperationId='batch2'}).Success,'Batch sharing has its own flood limit')
shareRateBlocked=false
-- Preparation must not consume a short recording's playback duration.
rows[memo].duration_ms=500;EMITTED={}
local prepared=call('StartPlayback',1,{MemoId=memo,Output='speaker'});local session=Phone.VoiceMemos.sessions[prepared.SessionId]
check(session~=nil and session.started==nil,'New speaker session prepares before starting its clock')
check(#EMITTED>=2 and EMITTED[1].args[1].Sessions[1].Preparing,'Preparation is published immediately, even for a sub-second memo')
clock=40000
local ownerTicket=call('Describe',1,{MemoId=memo,SessionId=prepared.SessionId})
check(ownerTicket.Success,'Slow preparation does not expire at memo duration')
check(not call('PlaybackReady',1,{SessionId=prepared.SessionId,Ticket=ownerTicket.Ticket}).Success,'Ready requires the complete authorized download')
check(call('GetChunk',1,{Ticket=ownerTicket.Ticket,Index=0}).Success)
check(call('PlaybackReady',1,{SessionId=prepared.SessionId,Ticket=ownerTicket.Ticket}).Success)
eq(session.started,nil,'Owner readiness waits for initial nearby listener')
local listenerTicket=call('Describe',2,{MemoId=memo,SessionId=prepared.SessionId});check(listenerTicket.Success)
check(not call('PlaybackReady',3,{SessionId=prepared.SessionId,Ticket=listenerTicket.Ticket}).Success,'A different source cannot acknowledge another ticket')
check(call('GetChunk',2,{Ticket=listenerTicket.Ticket,Index=0}).Success)
positions[2].x=25;check(not call('PlaybackReady',2,{SessionId=prepared.SessionId,Ticket=listenerTicket.Ticket}).Success,'Leaving range revokes preparation acknowledgement');positions[2].x=5
check(call('PlaybackReady',2,{SessionId=prepared.SessionId,Ticket=listenerTicket.Ticket}).Success)
eq(session.started,41000,'All prepared listeners receive a future synchronized start')
local scheduled=session.started;check(call('PlaybackReady',2,{SessionId=prepared.SessionId,Ticket=listenerTicket.Ticket}).Success);eq(session.started,scheduled,'Repeated readiness does not restart playback')
clock=41499;check(call('GetChunk',2,{Ticket=listenerTicket.Ticket,Index=0}).Success,'Entire short duration remains authorized after preparation')
clock=41500;check(not call('GetChunk',2,{Ticket=listenerTicket.Ticket,Index=0}).Success,'Authorization ends at actual playback completion')
local function tick()local n=0;ON_WAIT=function()n=n+1;if n==2 then error('end preparation tick')end end;pcall(THREADS[#THREADS]);ON_WAIT=nil end
local timeout=call('StartPlayback',1,{MemoId=memo,Output='speaker'});local timeoutTicket=call('Describe',1,{MemoId=memo,SessionId=timeout.SessionId});call('GetChunk',1,{Ticket=timeoutTicket.Ticket,Index=0});call('PlaybackReady',1,{SessionId=timeout.SessionId,Ticket=timeoutTicket.Ticket})
clock=clock+120000;tick();check(Phone.VoiceMemos.sessions[timeout.SessionId].started~=nil,'Ready owner starts after bounded wait for unavailable listener')
call('StopPlayback',1)
local neverReady=call('StartPlayback',1,{MemoId=memo,Output='speaker'});clock=clock+120000;tick();eq(Phone.VoiceMemos.sessions[neverReady.SessionId],nil,'Preparation with no ready owner expires without playback')
local crowd={'1','2'}
for src=4,101 do crowd[#crowd+1]=tostring(src);playerCid[src]='listener-'..src;positions[src]={x=2,y=0,z=0};buckets[src]=0 end
function GetPlayers()return crowd end
local beforeReads=numberReads[1] or 0
call('StartPlayback',1,{MemoId=memo,Output='speaker'})
check((numberReads[1] or 0)-beforeReads<=3,'Initial publication validates owner once rather than once per hundred listeners')
beforeReads=numberReads[1] or 0;tick()
check((numberReads[1] or 0)-beforeReads<=2,'Preparation and broadcast owner checks are bounded independently of listener count')
numbers[1]='changed';tick();eq(next(Phone.VoiceMemos.sessions),nil,'Bounded broadcast validation still revokes owner SIM changes')
