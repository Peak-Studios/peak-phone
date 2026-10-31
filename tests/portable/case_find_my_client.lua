base('qbcore')
Phone.Client={Ready=true,HasPhone=true,Generation=3,Data={citizenid='PLAYER'},Device={DeviceId='DEVICE-1',Generation=7,SimId='SIM-1',PhoneNumber='5550102001'}}
Peak={}
local routes,events,handlers={}, {}, {}
RegisterNUICallback=function(name,fn)assert(not routes[name]);routes[name]=fn end
RegisterNetEvent=function(name,fn)events[name]=fn end
AddEventHandler=function(name,fn)handlers[name]=fn end
GetResourceKvpString=function(key)eq(key,'peakduo:findmy:map-blips');return nil end
local kvp={};SetResourceKvp=function(key,value)kvp[key]=value end
GetCurrentResourceName=function()return 'peak-phone'end
local blips,nextBlip={},0
DoesBlipExist=function(id)return blips[id]~=nil end
AddBlipForCoord=function(x,y,z)nextBlip=nextBlip+1;blips[nextBlip]={x=x,y=y,z=z};return nextBlip end
SetBlipCoords=function(id,x,y,z)if blips[id]then blips[id]={x=x,y=y,z=z}end end
SetBlipSprite=function()end;SetBlipScale=function()end;SetBlipColour=function()end;SetBlipAsShortRange=function()end
BeginTextCommandSetBlipName=function()end;AddTextComponentString=function()end;EndTextCommandSetBlipName=function()end
local removed=0
RemoveBlip=function(id)if blips[id]then blips[id]=nil;removed=removed+1 end end
local serverState={Success=true,Incoming={{ShareId='share-live',Name='Jordan Lee',Available=true,Location={x=10,y=20,z=3}}},Outgoing={},Contacts={}}
local calls=0
Peak.SendCallback=function(name)eq(name,'peak-phone:Server:FindMy:GetState');calls=calls+1;return copy(serverState)end
THREADS={};local nativeWait=Wait
Wait=function(ms)CLOCK=CLOCK+ms;return coroutine.yield(ms)end
Citizen.Wait=Wait;Citizen.CreateThread=CreateThread
promise={new=function()return {resolve=function(self,value)self.value=value end}end}
Citizen.Await=function(value)if value.value~=nil then return value.value end;local resumed=coroutine.yield(value);return resumed or value.value end
loadrel('client/cl_maps.lua')
local function invoke(name,data)
 local count,result=0,nil;assert(routes[name],name)(data or {},function(value)count=count+1;result=value end)
 eq(count,1,'NUI callback response '..name);return result
end
local function liveState()serverState={Success=true,Incoming={{ShareId='share-live',Name='Jordan Lee',Available=true,Location={x=10,y=20,z=3}}},Outgoing={},Contacts={}}end
local function markerCount()local n=0;for _ in pairs(blips)do n=n+1 end;return n end

-- Default-on background polling continues with the phone closed, while the
-- People NUI refresh joins an already-running state request rather than
-- launching a duplicate callback.
local background=coroutine.create(THREADS[1]);local bgStarted,bgValue=coroutine.resume(background);check(bgStarted,tostring(bgValue));eq(coroutine.status(background),'suspended','background poll pauses at first wait; yielded='..tostring(bgValue))
local networkCalls=0;Peak.SendCallback=function(name)eq(name,'peak-phone:Server:FindMy:GetState');networkCalls=networkCalls+1;return coroutine.yield('server-pending')end
local polled=coroutine.resume(background);check(polled);eq(networkCalls,1,'background timer queries while Maps is closed')
local nuiResult
local ui=coroutine.create(function()routes['Maps/GetPeopleState']({},function(result)nuiResult=result end)end)
local uiOk,waiting=coroutine.resume(ui);check(uiOk);check(type(waiting)=='table','UI awaits the background request promise');eq(networkCalls,1,'overlapping UI/background polls coalesce')
local state={Success=true,Incoming={{ShareId='share-live',Name='Jordan Lee',Available=true,Location={x=10,y=20,z=3}}},Outgoing={},Contacts={}}
local bgResume,bgError=coroutine.resume(background,state);check(bgResume,'background response resume: '..tostring(bgError));local uiResume,uiError=coroutine.resume(ui);check(uiResume,'UI coalesced resume: '..tostring(uiError));check(nuiResult and nuiResult.Success,'coalesced UI response is successful: '..tostring(nuiResult and nuiResult.Message));eq(markerCount(),1);eq(calls,0)
eq(blips[1].x,10);eq(kvp['peakduo:findmy:map-blips'],nil,'unset KVP leaves background blips enabled by default')
Peak.SendCallback=function(name)eq(name,'peak-phone:Server:FindMy:GetState');calls=calls+1;return copy(serverState)end

-- A server-side unavailable status or query failure removes an existing marker.
serverState={Success=true,Incoming={{ShareId='share-live',Available=false,Status='Different instance'}},Outgoing={},Contacts={}}
check(invoke('Maps/GetPeopleState').Success);eq(markerCount(),0,'unavailable response removes stale marker')
liveState();check(invoke('Maps/GetPeopleState').Success);eq(markerCount(),1)
serverState={Success=false,Message='temporarily unavailable'}
local failed=invoke('Maps/GetPeopleState');check(not failed.Success);eq(markerCount(),0,'failed UI refresh immediately clears stale markers')

-- The background path also clears a previous marker on query failure.
liveState();check(invoke('Maps/GetPeopleState').Success);eq(markerCount(),1)
serverState={Success=true,Incoming={{ShareId='share-live',Available=true,Location={x=10,y=20,z=3}}},Outgoing={},Contacts={}}
check(coroutine.resume(background)); -- next 6.5-second timer; response is current live state
eq(markerCount(),1)
serverState={Success=false,Message='temporarily unavailable'}
check(coroutine.resume(background));eq(markerCount(),0,'background failure clears marker')

-- Preference is locally persisted and immediately removes all game blips.
liveState();check(invoke('Maps/GetPeopleState').Success);eq(markerCount(),1)
local pref=invoke('Maps/SetBlipPreference',{Enabled=false});check(pref.Success);eq(kvp['peakduo:findmy:map-blips'],'0');eq(markerCount(),0)
invoke('Maps/SetBlipPreference',{Enabled=true});eq(kvp['peakduo:findmy:map-blips'],'1')

-- No late state callback may repopulate a marker after any phone-session,
-- character, physical-device, or SIM identity changes during its yield.
local function rejectsLate(change,restore,label)
 liveState();check(invoke('Maps/GetPeopleState').Success);eq(markerCount(),1)
 Peak.SendCallback=function(name)eq(name,'peak-phone:Server:FindMy:GetState');return coroutine.yield('late-state')end
 local result
 local pendingRead=coroutine.create(function()routes['Maps/GetPeopleState']({},function(value)result=value end)end)
 local ok,value=coroutine.resume(pendingRead);check(ok);eq(value,'late-state')
 change()
 check(coroutine.resume(pendingRead,serverState));check(not result.Success,label..' invalidates stale response');eq(markerCount(),0,label..' keeps old blip removed')
 restore()
 Peak.SendCallback=function(name)eq(name,'peak-phone:Server:FindMy:GetState');return copy(serverState)end
end
rejectsLate(function()Phone.Client.Data.citizenid='REUSED'end,function()Phone.Client.Data.citizenid='PLAYER'end,'character switch')
rejectsLate(function()Phone.Client.Device.SimId='SIM-2'end,function()Phone.Client.Device.SimId='SIM-1'end,'SIM change')
rejectsLate(function()Phone.Client.Device.Generation=8 end,function()Phone.Client.Device.Generation=7 end,'device generation change')
rejectsLate(function()Phone.Client.Generation=4 end,function()Phone.Client.Generation=3 end,'phone session generation change')

-- Resource stop and identity lifecycle events are explicit cleanup boundaries.
liveState();check(invoke('Maps/GetPeopleState').Success);eq(markerCount(),1)
handlers['onClientResourceStop']('peak-phone');eq(markerCount(),0,'resource stop removes all markers')
liveState();check(invoke('Maps/GetPeopleState').Success);eq(markerCount(),1)
source=65535;events['peak-phone:portable:identityChanged']();eq(markerCount(),0,'identity event removes all markers')
liveState();check(invoke('Maps/GetPeopleState').Success);eq(markerCount(),1)
handlers['Peak:Client:OnPlayerUnload']();eq(markerCount(),0,'unload removes all markers')
