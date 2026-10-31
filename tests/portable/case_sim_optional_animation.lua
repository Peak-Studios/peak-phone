base('qbcore');RegisterNetEvent=Phone.NativeRegisterNetEvent
local nui={};RegisterNUICallback=function(name,fn)nui[name]=fn end
SendNUIMessage=function()end
PlayerPedId=function()return 1 end
local dead,vehicle,folding=false,false,false
DoesEntityExist=function()return true end
IsEntityDead=function()return dead end
IsPedRagdoll=function()return false end
IsPedInAnyVehicle=function()return vehicle end
Phone.Client={Ready=true,Generation=1,Data={metadata={}}};IsPhoneOpen=false
PhoneDuoPropConfig={};local visual={body=2}
Phone.DuoProp={held=false,getLocalVisual=function()return visual end,setHasSim=function()end,
 setHeld=function(value)Phone.DuoProp.held=value end,setSimGesture=function(op)return not (op and folding)end,flushPendingAccept=function()end}
loadrel('client/cl_sim_gesture.lua');loadrel('client/cl_devices.lua')
local committed,cancelled=0,0
local function rpcMock(route)
 if route:find('inventoryInspect',1,true)then return {Success=true,Generation=1}end
 if route:find('simBegin',1,true)then return {Success=true,OperationId='op',Token='token'}end
 if route:find('simCommit',1,true)then committed=committed+1;return {Success=true}end
 if route:find('simCancel',1,true)then cancelled=cancelled+1;return {Success=true}end
 error(route)
end
Phone.rpc=rpcMock;Peak.SendCallback=rpcMock;Phone.refreshClient=function()return true end
local function inventory(action)
 local result=EXPORTED.InventorySim({Action=action,PhoneSlot=107,SimSlot=8})
 check(result.Success,'inventory '..action..' must not require animation')
 eq(Phone.SimGesture.inventoryHeld,false);eq(Phone.DuoProp.held,false)
end
inventory('insert');inventory('remove');eq(committed,2)
STARTED['peak-sim-assets']=true
resource('peak-sim-assets',{Play=function()error('cosmetic playback unavailable')end})
vehicle=true;inventory('insert');vehicle=false
folding=true;inventory('remove');folding=false
visual=nil;inventory('insert');visual={body=2}
CallData={CallId='stale'};inventory('remove');CallData=nil
inventory('insert');eq(committed,7);eq(cancelled,0)
Phone.SimGesture.busy=true
check(not EXPORTED.InventorySim({Action='insert'}).Success);eq(committed,7)
Phone.SimGesture.busy=false
resource('peak-sim-assets',{Play=function()Phone.Client.Generation=2;return true end})
check(not EXPORTED.InventorySim({Action='insert'}).Success,'identity changes must cancel')
eq(committed,7);eq(cancelled,1)
