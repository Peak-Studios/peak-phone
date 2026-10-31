base('qbcore');addPlayer(1,'SENDER');addPlayer(2,'RECEIVER');RegisterNetEvent=Phone.NativeRegisterNetEvent
local nui,handlers,messages,sent,played={},{},{},{},{}
RegisterNUICallback=function(name,fn)nui[name]=fn end
AddEventHandler=function(name,fn)handlers[name]=fn end
TriggerServerEvent=function(name,...)sent[#sent+1]={name=name,args=table.pack(...)}end
SendNUIMessage=function(data)messages[#messages+1]=data end
PlayerPedId=function()return 1 end
joaat=function(name)return name=='mp_m_freemode_01' and 100 or 200 end
local model,dead,vehicle,ragdoll,loaded,playing=100,false,false,false,true,true
GetEntityModel=function()return model end
IsPedDeadOrDying=function()return dead end
IsPedInAnyVehicle=function()return vehicle end
IsPedRagdoll=function()return ragdoll end
GetPlayerFromServerId=function(id)return id end
GetNetworkTimeAccurate=function()return CLOCK%4294967296 end
GetTimeDifference=function(a,b)local d=(a-b)%4294967296;if d>=2147483648 then d=d-4294967296 end;return d end
RequestAnimDict=function()end;HasAnimDictLoaded=function()return loaded end
local duration=3.2;GetAnimDuration=function()return duration end
Peak.Functions.Notify=function()end
GetOffsetFromEntityInWorldCoords=function()return vector3(0,.95,0)end
GetEntityHeading=function()return 0 end
local approached,turned,cleared,stopped,restored=0,0,0,0,0
TaskFollowNavMeshToCoord=function(...)approached=approached+1 end
TaskTurnPedToFaceEntity=function(...)turned=turned+1 end
ClearPedTasks=function()cleared=cleared+1 end
StopAnimTask=function()stopped=stopped+1 end
StartPhoneAnim=function()restored=restored+1 end
local animationStarted
TaskPlayAnim=function(...)played[#played+1]=table.pack(...);animationStarted=CLOCK end
local seeks={};SetEntityAnimCurrentTime=function(...)seeks[#seeks+1]=table.pack(...)end
IsEntityPlayingAnim=function()return playing end
GetEntityAnimCurrentTime=function()
    if not animationStarted then return 0 end
    return math.min(1,math.max(0,GetTimeDifference(CLOCK,animationStarted)/(duration*1000)))
end
DisableControlAction=function()end
OpenPhone=function()IsPhoneOpen=true end
Wait=function(ms)CLOCK=(CLOCK+math.max(1,ms))%4294967296;if ON_WAIT then ON_WAIT() end end
Phone.Client={Ready=true,Generation=1};IsPhoneOpen=true
Peak.SendCallback=function(route,data)return {Success=true,Enabled=data and data.Enabled}end
loadrel('client/cl_sharedrop.lua')
local function callback(name,data)
    local r;nui['ShareDrop/'..name](data or {},function(result)r=result end);return r
end
local function phase(name,receiver,start,id)
    source=65535
    EVENTS['peak-phone:sharedrop:phase']({Id=id or 'test',Phase=name,Peer=2,Receiver=receiver,Data={Start=start or (CLOCK+800)%4294967296,Duration=3200}})
end
check(callback('Enabled',{Enabled=true}).Enabled)
vehicle=true;check(not callback('Request',{PhotoId=1,TargetSource=2}).Success);vehicle=false
dead=true;check(not callback('Respond',{Id='test',Accept=true}).Success);dead=false
model=300;check(not callback('Request',{}).Success);model=100
CallData={Dialing=true};check(not callback('Request',{}).Success);CallData=nil
check(callback('Respond',{Id='test',Accept=false}).Success,'Decline remains available while unavailable')
check(callback('Request',{PhotoId=1,TargetSource=2}).Success)
-- Receiver walks under its own owner. Sender never controls or teleports the remote ped.
COORDS={[2]=vector3(0,3,0)}
phase('offer',true);local offerThreads=#THREADS;phase('offer',true);check(not Phone.ShareDropActive and #THREADS==offerThreads,'A duplicate offer does not start another session')
phase('approach',true);check(Phone.ShareDropActive)
local approachThread=#THREADS;phase('approach',true);eq(#THREADS,approachThread,'Duplicate approach phase does not start another walker')
ON_WAIT=function()COORDS={[2]=vector3(0,.95,0)}end
THREADS[#THREADS]();ON_WAIT=nil
eq(approached,1);eq(cleared,1);eq(turned,1)
eq(sent[#sent].name,'peak-phone:sharedrop:ready');eq(sent[#sent].args[1],'test')
phase('animation',true);THREADS[#THREADS]()
eq(#played,1);eq(played[1][2],'peak_sharedrop_male');eq(played[1][3],'peak_sharedrop_male_receive')
eq(played[1][7],50,'One-shot upper-body secondary task holds the authored final frame')
eq(played[1][7]%2,0,'Animation must not use the loop flag')
eq(played[1][6],-1,'Native duration cannot cut off the validated clip before its final progress sample')
eq(played[1][8],1.0,'Animation must play at normal speed, including an on-time start')
eq(sent[#sent].name,'peak-phone:sharedrop:done')
eq(#seeks,0,'The full authored clip always starts at frame zero')
check(messages[#messages].Action=='ShareDrop/Transfer')
phase('complete',true);check(not Phone.ShareDropActive);eq(stopped,1);eq(restored,1)
-- Female sender uses the other profile and does not walk toward the receiver.
model=200;phase('offer',false);phase('approach',false);THREADS[#THREADS]()
eq(approached,1);eq(turned,2)
phase('animation',false);THREADS[#THREADS]()
eq(played[2][2],'peak_sharedrop_female');eq(played[2][3],'peak_sharedrop_female_send')
phase('cancelled',false);check(not Phone.ShareDropActive)
-- Missing clips time out without sending a ready or done acknowledgement.
loaded=false;phase('offer',false);phase('approach',false);THREADS[#THREADS]()
eq(sent[#sent].name,'peak-phone:sharedrop:cancel');eq(#played,2)
phase('cancelled',false);loaded=true
duration=0;phase('offer',false);phase('approach',false);THREADS[#THREADS]()
eq(sent[#sent].name,'peak-phone:sharedrop:cancel','A dictionary without the requested clip cannot start transfer')
phase('cancelled',false);duration=3.2
-- A clip that never starts must never acknowledge completion.
playing=false;phase('offer',false);phase('approach',false);THREADS[#THREADS]()
phase('animation',false);THREADS[#THREADS]()
eq(sent[#sent].name,'peak-phone:sharedrop:cancel');phase('cancelled',false)
phase('offer',false);callback('Cancel',{Id='wrong'});local previous=#sent
callback('Cancel',{Id='test'});eq(#sent,previous+1);eq(sent[#sent].args[1],'test')
handlers['Peak:Client:OnPlayerUnload']();eq(sent[#sent].name,'peak-phone:sharedrop:disable');check(not Phone.ShareDropActive)
-- Remote events may never be injected by local scripts.
source=0;EVENTS['peak-phone:sharedrop:phase']({Id='injected',Phase='offer',Peer=2})
check(not Phone.ShareDropActive)
playing=true;callback('Enabled',{Enabled=true});phase('offer',false);phase('approach',false);THREADS[#THREADS]()
local playedBeforeLate=#played;local sentBeforeLate=#sent
phase('animation',false,(CLOCK-160)%4294967296);THREADS[#THREADS]()
eq(#played,playedBeforeLate,'A late peer is cancelled instead of skipping the clip intro')
eq(#seeks,0,'No animation time seek is used for synchronization')
eq(sent[#sent].name,'peak-phone:sharedrop:cancel')
check(#sent>sentBeforeLate)
phase('complete',false)
local cancelBeforeLocalOffer=#sent
callback('Cancel',{Id='pending-before-local-offer'})
eq(#sent,cancelBeforeLocalOffer+1,'A request ID is forwarded even before its phase event creates a local session')
eq(sent[#sent].name,'peak-phone:sharedrop:cancel')
eq(sent[#sent].args[1],'pending-before-local-offer')

-- Both the scheduled start and full clip remain correct across network-clock wrap.
CLOCK=4294967000
duration=3.3
phase('offer',false);phase('approach',false);THREADS[#THREADS]()
local playedBeforeWrap=#played
phase('animation',false);THREADS[#THREADS]()
eq(#played,playedBeforeWrap+1,'A shared start spanning the clock wrap still plays the whole clip')
eq(#seeks,0,'Clock wrap never causes a forward seek')
eq(sent[#sent].name,'peak-phone:sharedrop:done','Completion ACK follows the end sample after clock wrap')
phase('complete',false)
duration=3.2

phase('offer',false);phase('approach',false);THREADS[#THREADS]()
local sentBeforeStop=#sent
handlers['onClientResourceStop']('other-resource')
eq(#sent,sentBeforeStop,'Stopping another resource leaves ShareDrop active')
handlers['onClientResourceStop']('peak-phone')
eq(sent[#sent].name,'peak-phone:sharedrop:cancel','Stopping this client resource cancels the server session')
check(not Phone.ShareDropActive,'Resource stop releases the local gesture')

-- A terminal event from an old character generation cannot restore its photo
-- or phase into the new character's phone.
phase('offer',false,nil,'old-generation')
local sentBeforeGeneration=#sent;local messagesBeforeGeneration=#messages
Phone.Client.Generation=Phone.Client.Generation+1
phase('complete',false,nil,'old-generation')
eq(sent[#sent].name,'peak-phone:sharedrop:cancel','Stale terminal event cancels any still-live server session')
check(not Phone.ShareDropActive,'Stale terminal event releases the old local gesture')
eq(#messages,messagesBeforeGeneration+1,'Stale terminal event does not reach the ShareDrop UI')
eq(messages[#messages].Action,'Duo/Reset','Stale terminal event clears the old UI instead')
check(#sent>sentBeforeGeneration)
