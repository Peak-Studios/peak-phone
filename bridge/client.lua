Phone.Client={Data={metadata={},charinfo={},money={crypto={}},job={name='unemployed'}},HasPhone=false,Items={},Capabilities={},OwnerConfig={},Device=nil,Ready=false,Generation=0}
local PC=Phone.Client
local nextRequest,pending=0,{}
local nativeNui=RegisterNUICallback
local nuiRoutes={}

RegisterNetEvent('peak-phone:portable:response',function(id,ok,data)
    if source~=65535 then return end
    local request=pending[id];if not request then return end;pending[id]=nil
    request:resolve({ok=ok==true,data=data})
end)
function Phone.rpc(name,...)
    nextRequest=(nextRequest%2147483646)+1;local id=nextRequest;local p=promise.new();pending[id]=p
    local args=table.pack(...)
    TriggerServerEvent('peak-phone:portable:rpc',id,name,args,PC.Device and PC.Device.Generation)
    SetTimeout(25000,function() if pending[id] then pending[id]=nil;p:resolve({ok=false,data='Phone callback timed out. Check server logs before retrying a payment.'}) end end)
    local answer=Citizen.Await(p)
    if not answer.ok then error(tostring(answer.data),0) end
    return answer.data
end
function Phone.invalidatePending(message)
    PC.Generation=PC.Generation+1
    for id,p in pairs(pending) do pending[id]=nil;p:resolve({ok=false,data=message or 'Phone identity changed. Do not retry automatically.'}) end
end
PhonePeak.SendCallback=function(name,...)
    if name=='Peak:GetTax' then return 0 end
    if not name:match('^peak%-phone:') and name~='Lumberjack/GetData' and Phone.started('peak-core') then
        return exports['peak-core']:GetCoreObject().SendCallback(name,...)
    end
    return Phone.rpc(name,...)
end
PhonePeak.Functions.TriggerCallback=function(name,cb,...)
    local args=table.pack(...)
    CreateThread(function()
        local ok,result=pcall(PhonePeak.SendCallback,name,table.unpack(args,1,args.n))
        if not ok then PhonePeak.Functions.Notify(result,'error');cb(nil) else cb(result) end
    end)
end
PhonePeak.TriggerServer=function(name,...) TriggerServerEvent(name,...) end
PhonePeak.Functions.GetPlayerData=function() return PC.Data end
PhonePeak.Functions.Notify=function(text,kind,duration)
    kind=({primary='inform',info='inform'})[kind] or kind or 'inform'
    if kind~='error' and kind~='success' and kind~='warning' then kind='inform' end
    lib.notify({title='Peak Duo',description=tostring(text),type=kind,duration=duration or 5000})
end
RegisterNetEvent('peak-phone:portable:notify',function(...) if source==65535 then PhonePeak.Functions.Notify(...) end end)
-- Compatibility with server notifications emitted by retained phone features.
RegisterNetEvent('Peak:Notify',function(...) if source==65535 then PhonePeak.Functions.Notify(...) end end)
PhonePeak.AddKeybind=function(id,category,label,key,cb)
    local name='peakduo_'..id
    RegisterCommand('+'..name,function() CreateThread(function() local ok,err=pcall(cb,true);if not ok then PhonePeak.Functions.Notify(err,'error') end end) end,false)
    RegisterCommand('-'..name,function() cb(false) end,false)
    RegisterKeyMapping('+'..name,category..': '..label,'keyboard',id=='openMobile' and PhoneConfig.OpenKey or key)
end
PhonePeak.Functions.GetStreetLabel=function(coords)
    local a,b=GetStreetNameAtCoord(coords.x,coords.y,coords.z)
    return GetStreetNameFromHashKey(a)..(b~=0 and ' / '..GetStreetNameFromHashKey(b) or '')
end
PhonePeak.Functions.SetVehiclePlate=function(vehicle,plate) SetVehicleNumberPlateText(vehicle,plate) end
PhonePeak.VSync.GetVehicleMods=function(vehicle) return lib.getVehicleProperties(vehicle) end
PhonePeak.VSync.ApplyVehicleMods=function(vehicle,props) return lib.setVehicleProperties(vehicle,props) end
PhonePeak.VSync.DeleteVehicle=function(vehicle) if NetworkHasControlOfEntity(vehicle) then DeleteEntity(vehicle) end end

-- Every NUI callback acknowledges exactly once, including timeouts and exceptions.
RegisterNUICallback=function(name,fn)
    assert(not nuiRoutes[name],'Duplicate NUI callback: '..name);nuiRoutes[name]=true
    nativeNui(name,function(data,cb)
        local done=false
        local function reply(value) if done then return end;done=true;cb(value==nil and false or value) end
        if type(data)~='table' then return reply({__phoneError=true,error='Invalid request payload'}) end
        if PC.Device and PC.Device.Locked and not name:match('^Devices/') and name~='ClosePhone' and name~='SetCurrentApp' and name~='Phone/MediaOutput' and name~='Phone/DuoTyping' and name~='Phone/PhysicalScreenFrame' and name~='Phone/PhysicalScreenStatus' then return reply({__phoneError=true,error='Unlock this device in Settings.'}) end
        SetTimeout((name:find('Capture') or name:find('Selfie')) and 120000 or 26000,function() reply({__phoneError=true,error='The server did not finish this action. Do not automatically retry a payment.'}) end)
        local ok,err=pcall(fn,data,reply)
        if not ok then print('[Peak Duo] '..name..': '..tostring(err));reply({__phoneError=true,error=tostring(err)}) end
    end)
end
local refreshPromise=nil
local function applySnapshot(snapshot)
    if type(snapshot)~='table' or not snapshot.PlayerData or not snapshot.PlayerData.citizenid then return false end
    local changed=PC.Data.citizenid and PC.Data.citizenid~=snapshot.PlayerData.citizenid
    local lost=PC.Ready and not snapshot.HasPhone
    local deviceChanged=PC.Device and snapshot.Device and PC.Device.DeviceId~=snapshot.Device.DeviceId
    if changed or lost or deviceChanged then TriggerEvent('Peak:Client:OnPlayerUnload');PC.Ready=false end
    PC.Data=snapshot.PlayerData;PC.HasPhone=snapshot.HasPhone==true;PC.Items=snapshot.Items or {};PC.Capabilities=snapshot.Capabilities or {};PC.OwnerConfig=snapshot.OwnerConfig or {};PC.Device=snapshot.Device
    SendNUIMessage({Action='Duo/Capabilities',Capabilities=PC.Capabilities,OwnerConfig=PC.OwnerConfig,Version=Phone.Version})
    if PC.HasPhone and not PC.Ready then
        PC.Ready=true;TriggerEvent('Peak:Client:OnPlayerLoaded');TriggerEvent('peak-ui:Ready')
    elseif PC.Ready then TriggerEvent('Peak:Player:SetPlayerData');TriggerEvent('Peak:Client:OnPlayerUpdate',PC.Data) end
    return true
end
function Phone.refreshClient()
    if refreshPromise then
        local shared=Citizen.Await(refreshPromise)
        return shared.ok,shared.data
    end
    local current=promise.new();refreshPromise=current
    local generation=PC.Generation
    local ok,result=pcall(Phone.rpc,'peak-phone:portable:bootstrap')
    local applied=ok and generation==PC.Generation and applySnapshot(result) or false
    refreshPromise=nil
    current:resolve({ok=applied==true,data=result})
    return applied==true,result
end
function Phone.refreshAfterIdentityChange(generation)
    local expected=tonumber(generation) or PC.Generation
    CreateThread(function()
        -- A bootstrap already in flight can be cancelled by invalidatePending.
        -- Let its owner clear the shared promise, then fetch the new generation.
        while refreshPromise and expected==PC.Generation do Wait(10) end
        if expected==PC.Generation then Phone.refreshClient() end
    end)
end
RegisterNetEvent('peak-phone:portable:player',function(data)
    if source~=65535 or type(data)~='table' then return end
    if PC.Data.citizenid~=data.citizenid then return end
    PC.Data=data;TriggerEvent('Peak:Player:SetPlayerData');TriggerEvent('Peak:Client:OnPlayerUpdate',data)
end)
local refreshGeneration=0
local function queueRefresh()
    refreshGeneration=refreshGeneration+1;local n=refreshGeneration
    SetTimeout(350,function() if n==refreshGeneration then Phone.refreshClient() end end)
end
for _,event in ipairs({'QBCore:Client:OnPlayerLoaded','QBCore:Player:SetPlayerData','QBCore:Client:OnJobUpdate','esx:playerLoaded','esx:setJob','esx:setAccountMoney','esx:setPlayerData','esx:addInventoryItem','esx:removeInventoryItem'}) do
    RegisterNetEvent(event,queueRefresh)
end
AddEventHandler('ox_inventory:updateInventory',queueRefresh)
RegisterNetEvent('peak-phone:portable:inventoryChanged',function() if source==65535 then queueRefresh() end end)
local function unload()
    Phone.invalidatePending('Character unloaded. The previous operation must not be retried automatically.')
    TriggerServerEvent('peak-phone:portable:logout')
    TriggerEvent('Peak:Client:OnPlayerUnload');PC.Ready=false;PC.HasPhone=false
    PC.Data={metadata={},charinfo={},money={crypto={}},job={name='unemployed'}};PC.Device=nil
end
RegisterNetEvent('QBCore:Client:OnPlayerUnload',unload)
RegisterNetEvent('esx:onPlayerLogout',unload)
RegisterNetEvent('peak-phone:portable:unload',function() if source==65535 then unload() end end)
AddEventHandler('onClientResourceStop',function(name)
    if name==GetCurrentResourceName() then
        for id,p in pairs(pending) do pending[id]=nil;p:resolve({ok=false,data='Phone resource stopped'}) end
        Phone.removeProp();SetNuiFocus(false,false);SetNuiFocusKeepInput(false)
        lib.hideTextUI()
    elseif name=='qb-core' or name=='qbx_core' or name=='es_extended' then unload() end
end)
CreateThread(function()
    while not NetworkIsPlayerActive(PlayerId()) do Wait(500) end
    Wait(1000)
    while true do
        Phone.refreshClient();Wait(PC.Ready and 15000 or 5000)
    end
end)
RegisterCommand('phone',function() if OpenPhone then OpenPhone(true) end end,false)
exports('UsePhone',function() if OpenPhone then OpenPhone(true) end end)
RegisterNetEvent('peak-phone:portable:use',function() if OpenPhone then OpenPhone(true) end end)

-- Portable preferences live per character in KVP, not in a separate HUD resource.
local function prefsKey() return 'peakduo:preferences:'..tostring(PC.Data.citizenid or 'pending') end
local function preferences()
    local p=Phone.copy(PhoneConfig.DefaultPreferences)
    p['Notifications.SMS']=true;p['Notifications.Tweet']=true;p['Notifications.Email']=true;p['Images.Embedded']=true
    local saved=Phone.decode(GetResourceKvpString(prefsKey()))
    for k,v in pairs(saved) do if p[k]~=nil then p[k]=v end end
    -- The prior release stored movement-blocking as its default. Migrate that
    -- legacy value once, after which Settings remains fully user-controlled.
    local movementKey=prefsKey()..':movement-v2'
    if GetResourceKvpInt(movementKey)~=1 then
        if saved['Phone.DisableMovement']==nil then p['Phone.DisableMovement']=false;SetResourceKvp(prefsKey(),json.encode(p)) end
        SetResourceKvpInt(movementKey,1)
    end
    return p
end
PhoneServices['peak-hud']={
    GetPreferenceById=function(_,id) return preferences()[id] end,
    SetPreferenceById=function(_,id,value)
        local p=preferences();if p[id]==nil then error('Unknown phone preference') end
        if type(p[id])~=type(value) then error('Incorrect preference type') end
        if type(value)=='string' and #value>2048 then error('Preference too long') end
        p[id]=value;SetResourceKvp(prefsKey(),json.encode(p));TriggerEvent('peak-hud:Client:OnPreferenceUpdate',p)
    end,
}
AddEventHandler('peak-hud:Client:ReloadPreferences',function() TriggerEvent('peak-hud:Client:OnPreferenceUpdate',preferences()) end)
PhoneServices['peak-financials']={GetAccountBalance=function() return tonumber(PC.Data.money.bank) or 0 end}
PhoneServices['peak-inventory']={
    IsItemInSlot=function(_,item) if item==PhoneConfig.PhoneItem or item=='phone' then return PC.HasPhone end;return (PC.Items[item] or 0)>0 end,
    HasEnoughOfItem=function(_,item,count) if item=='phone' then return PC.HasPhone end;return (PC.Items[item] or 0)>=(count or 1) end,
}
local weatherNames={'EXTRASUNNY','CLEAR','CLOUDS','SMOG','FOGGY','OVERCAST','RAIN','THUNDER','CLEARING','NEUTRAL','SNOW','BLIZZARD','SNOWLIGHT','XMAS','HALLOWEEN'}
PhoneServices['peak-sync']={
    GetCurrentTime=function() return {Hour=GetClockHours(),Minute=GetClockMinutes()} end,
    GetCurrentWeather=function() local hash=GetPrevWeatherTypeHashName();for _,name in ipairs(weatherNames) do if GetHashKey(name)==hash then return name end end;return 'CLEAR' end,
}
-- The articulated controller owns the phone model and its hold lifecycle.
function Phone.removeProp() if Phone.DuoProp then Phone.DuoProp.setHeld(false) end end
function Phone.addProp() if Phone.DuoProp then Phone.DuoProp.setHeld(true) end end
PhoneServices['peak-assets']={AddProp=function() Phone.addProp() end,RemoveProp=function() Phone.removeProp() end}
PhoneServices['peak-ui']={
    ShowInteraction=function(_,text) lib.showTextUI(text) end,
    HideInteraction=function() lib.hideTextUI() end,
    OpenContextMenu=function(_,spec)
        local options={}
        for _,entry in ipairs(spec.MainMenuItems or {}) do
            local d=entry.Data or {};options[#options+1]={title=entry.Title,description=entry.Desc,icon=entry.Icon,
                onSelect=function() if d.Event then TriggerEvent(d.Event,table.unpack(d.Args or {})) end end}
        end
        lib.registerContext({id='peak-duo-context',title='Peak Duo',options=options});lib.showContext('peak-duo-context')
    end,
    RayCastGamePlayCamera=function(_,distance)
        local rot=GetGameplayCamRot(2);local pos=GetGameplayCamCoord();local z=math.rad(rot.z);local x=math.rad(rot.x)
        local dir=vector3(-math.sin(z)*math.abs(math.cos(x)),math.cos(z)*math.abs(math.cos(x)),math.sin(x));local dst=pos+dir*(distance or 6.0)
        local handle=StartShapeTestRay(pos.x,pos.y,pos.z,dst.x,dst.y,dst.z,-1,PlayerPedId(),0)
        local status,hit,coords=GetShapeTestResult(handle);local deadline=GetGameTimer()+200
        while status==1 and GetGameTimer()<deadline do Wait(0);status,hit,coords=GetShapeTestResult(handle) end
        return status==2 and hit==1,coords
    end,
    AddEyeEntry=function(_,id,spec)
        if not Phone.started('ox_target') then return end
        local opts={};for _,o in ipairs(spec.Options or {}) do
            opts[#opts+1]={name=o.Name,label=o.Label,icon=o.Icon,distance=spec.Distance or 2,
                canInteract=o.Enabled,onSelect=function(data) local p=Phone.copy(o.EventParams or {});p.Entity=data.entity;TriggerEvent(o.EventName,p,data.entity) end}
        end
        exports.ox_target:addModel(spec.Model,opts)
    end,
}
PhoneServices['peak-cityhall']={IsGov=function() return PhoneConfig.EmergencyJobs[PC.Data.job.name]==true or PhoneConfig.DOJJobs[PC.Data.job.name]==true end,
    IsLockdownActive=function(_,id) if Phone.started('peak-cityhall') then return exports['peak-cityhall']:IsLockdownActive(id) end;return false end}
-- Optional gameplay resources can register routes without changing the retained app components.
-- Routes are not arbitrary event proxies: a named server callback still performs authorization.
local externalRoutes={}
exports('RegisterPhoneRoute',function(nuiName,callbackName)
    local resource=GetInvokingResource()
    assert(resource and Phone.text(nuiName,150) and Phone.text(callbackName,150) and callbackName:match('^peak%-phone:'),'Invalid integration route')
    assert(not nuiRoutes[nuiName],'This NUI route already exists')
    externalRoutes[nuiName]=resource
    RegisterNUICallback(nuiName,function(data,cb)
        if not Phone.started(resource) then return cb({__phoneError=true,error='The gameplay integration is offline.'}) end
        cb(Phone.rpc(callbackName,data))
    end)
end)

RegisterNetEvent("peak-phone:portable:capabilitiesChanged",function() if source==65535 then queueRefresh() end end)
