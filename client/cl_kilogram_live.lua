-- Game-camera and NUI bridge dedicated to KiloGram. No webcam/desktop capture.
local active,pending=nil,false
local generation=0
Phone.KiloLiveCameraActive=false
Phone.Camera=Phone.Camera or {}
local function cameraReady()
    return type(Phone.Camera.acquire)=='function' and type(Phone.Camera.release)=='function'
end
local function failure(message) return {Success=false,Error=message,Msg=message} end
local function releaseCamera()
    if active and cameraReady() then Phone.Camera.release('live',active.id) end
end
local function stop(reason,notifyServer)
    generation=generation+1
    local previous=active
    releaseCamera()
    active=nil
    if previous then
        if notifyServer then TriggerServerEvent('peak-phone:Server:KiloLive:Leave',{SessionId=previous.id,Token=previous.token}) end
        SendNUIMessage({Action='KiloLive/Event',SessionId=previous.id,Token=previous.token,Kind='ended',Data={reason=reason or 'Live closed'}})
    end
end
local previousCameraLost=Phone.Camera and Phone.Camera.onLost
if Phone.Camera then
    Phone.Camera.onLost=function(kind,id)
        if previousCameraLost then pcall(previousCameraLost,kind,id) end
        if kind=='live' and active and active.id==id then stop('The broadcast camera was interrupted.',true) end
    end
end
local function startCamera()
    if not active or active.role~='host' or not cameraReady() then return false end
    local ok,front=Phone.Camera.acquire('live',active.id,active.front)
    if ok then active.front=front==true end
    return ok==true
end
local function matches(data)
    return active and type(data)=='table' and data.SessionId==active.id and data.Token==active.token
end
for _,route in ipairs({'List','Start','Join','Ready','State','Status','Comment','React','Moderate','Recipients','DropPeer','Leave','Wallet','PurchaseCoins','Gift','CashOut'}) do
    RegisterNUICallback('KiloLive/'..route,function(data,cb)
        data=type(data)=='table' and data or {}
        local opening=route=='Start' or route=='Join'
        if opening then
            if active or pending then return cb(failure('A live session is already open or connecting.')) end
            if not IsPhoneAppVisible('kilogram') then return cb(failure('Open KiloGram before joining a live.')) end
            if route=='Start' and (InCamera or Phone.VideoCameraActive) then return cb(failure('Close Camera or the video call first.')) end
            pending=true
        elseif route~='List' and route~='Recipients' and route~='Wallet' and route~='PurchaseCoins' and route~='CashOut' and not matches(data) then
            return cb(route=='Leave' and {Success=true} or failure('This live session has ended.'))
        end
        if (route=='Wallet' or route=='PurchaseCoins' or route=='Gift' or route=='CashOut') and not IsPhoneAppVisible('kilogram') then
            return cb(failure('Open KiloGram first.'))
        end
        local epoch=generation
        CreateThread(function()
            local ok,result=pcall(Peak.SendCallback,'peak-phone:Server:KiloLive:'..route,data)
            if opening then pending=false end
            if not ok or type(result)~='table' then return cb(failure('The live service could not be reached. Try again.')) end
            if opening and result.Success then
                if epoch~=generation or not IsPhoneAppVisible('kilogram') or active then
                    TriggerServerEvent('peak-phone:Server:KiloLive:Leave',{SessionId=result.session.id,Token=result.token})
                    return cb(failure('The phone was closed while the live was connecting.'))
                end
                active={id=result.session.id,token=result.token,role=result.role,front=true,lastSeen=GetGameTimer()}
                if active.role=='host' and not startCamera() then
                    stop('Close other game cameras before broadcasting.',true)
                    return cb(failure('The game camera is busy. Close other cameras and try again.'))
                end
            elseif epoch~=generation and route~='Leave' then
                return cb(failure('The live session changed. Reopen KiloGram.'))
            end
            if route=='Leave' and matches(data) then stop('You left the live.',not result.Success) end
            cb(result)
        end)
    end)
end
RegisterNUICallback('KiloLive/Heartbeat',function(data,cb)
    if not matches(data) then return cb(failure('Live closed.')) end
    active.lastSeen=GetGameTimer()
    TriggerServerEvent('peak-phone:Server:KiloLive:Heartbeat',{SessionId=active.id,Token=active.token})
    cb({Success=true})
end)
RegisterNUICallback('KiloLive/Signal',function(data,cb)
    if not matches(data) then return cb(failure('Live closed.')) end
    TriggerServerEvent('peak-phone:Server:KiloLive:Signal',data)
    cb({Success=true})
end)
RegisterNUICallback('KiloLive/FlipCamera',function(data,cb)
    if not matches(data) or active.role~='host' or not Phone.KiloLiveCameraActive or type(Phone.Camera.flipFor)~='function' then return cb(failure('There is no active broadcast camera.')) end
    local result=Phone.Camera.flipFor('live',active.id)
    if not result.Success then return cb(failure(result.Msg or 'The broadcast camera could not switch lenses.')) end
    active.front=result.Front==true
    cb({Success=true,Front=active.front})
end)
RegisterNetEvent('peak-phone:Client:KiloLive:Event',function(data)
    if source~=65535 or type(data)~='table' then return end
    if matches(data) then
        if data.Kind=='ended' then
            -- Keep the server's end summary; do not replace it with a local duplicate.
            generation=generation+1;releaseCamera();active=nil
        end
        SendNUIMessage({Action='KiloLive/Event',SessionId=data.SessionId,Token=data.Token,Kind=data.Kind,Data=data.Data})
    end
end)
RegisterNetEvent('peak-phone:Client:KiloLive:Directory',function()
    if source==65535 then SendNUIMessage({Action='KiloLive/Directory'}) end
end)
CreateThread(function()
    while true do
        if active then
            if not IsPhoneAppVisible('kilogram') or IsEntityDead(PlayerPedId()) or IsPauseMenuActive()
                or GetGameTimer()-active.lastSeen>40000 then
                stop('The phone or live screen was closed.',true)
            elseif active.role=='host' then
                if type(Phone.Camera.owns)=='function' and Phone.Camera.owns('live',active.id) then
                    DisablePlayerFiring(PlayerId(),true)
                    DisableControlAction(0,24,true);DisableControlAction(0,25,true);DisableControlAction(0,140,true)
                end
            end
        end
        Wait(active and active.role=='host' and 0 or 200)
    end
end)
AddEventHandler('Peak:Client:OnPlayerUnload',function() stop('Your character changed.',true) end)
AddEventHandler('onResourceStop',function(name)
    if name==GetCurrentResourceName() then stop('Phone resource stopped.',true) end
end)
