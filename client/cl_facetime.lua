-- Game camera lifecycle. It never captures the user's desktop, webcam, or another player's camera.
local active,generation=nil,0
Phone.VideoCameraActive=false
Phone.Camera=Phone.Camera or {}
local function cameraReady()
    return type(Phone.Camera.acquire)=='function' and type(Phone.Camera.release)=='function' and type(Phone.Camera.owns)=='function'
end
local function releaseCam()
    if active and cameraReady() then Phone.Camera.release('video',active.id) end
end
local function enableCam()
    if not active or not active.requested or not IsPhoneOpen or not cameraReady() then return false end
    if Phone.Camera.owns('video',active.id) then return true end
    local ok,front=Phone.Camera.acquire('video',active.id,active.front)
    if ok then active.front=front==true end
    return ok==true
end
local function captureState()
    if active then
        SendNUIMessage({Action='Video/CaptureState',CallId=active.id,Enabled=Phone.VideoCameraActive,Requested=active.requested,Front=active.front})
        TriggerServerEvent('peak-phone:portable:callCameraState',active.id,Phone.VideoCameraActive==true)
    end
end
function Phone.onPhoneVisibility(visible)
    if not active then return end
    if visible and active.requested then enableCam() else releaseCam() end
    captureState()
end
local function restoreVoice()
    if not active or not active.ourMute or not Phone.started(PhoneConfig.VoiceResource) then return end
    pcall(function()
        local voice=exports[PhoneConfig.VoiceResource]
        if voice:isPlayerMuted(active.peer) then voice:toggleMutePlayer(active.peer) end
    end)
    active.ourMute=false
end
local function stop(id,reason)
    if active and id and active.id~=id then return end
    generation=generation+1
    restoreVoice();releaseCam()
    local old=active;active=nil
    if Phone.rememberCallClosed then Phone.rememberCallClosed(id or (old and old.id)) end
    SendNUIMessage({Action='Video/Stop',CallId=id or (old and old.id),Reason=reason or 'Call ended'})
end
Phone.stopVideo=stop
local previousCameraLost=Phone.Camera.onLost
Phone.Camera.onLost=function(kind,id)
    if previousCameraLost then pcall(previousCameraLost,kind,id) end
    if kind=='video' and active and active.id==id then
        active.requested=false
        captureState()
    end
end
RegisterNetEvent('peak-phone:portable:videoState',function(data)
    if source~=65535 or (data and Phone.isCallClosed(data.CallId)) then return end
    SendNUIMessage({Action='Video/State',Data=data})
end)
RegisterNetEvent('peak-phone:portable:rtcStart',function(data)
    if source~=65535 or type(data)~='table' or type(data.CallId)~='string' then return end
    if Phone.isCallClosed(data.CallId) or (active and active.id==data.CallId) then return end
    if active then stop(active.id,'Another call started') end
    generation=generation+1;local myGeneration=generation;Phone.callRevision=(Phone.callRevision or 0)+1
    active={id=data.CallId,peer=tonumber(data.Peer),front=true,fov=60.0,requested=true,lastSeen=GetGameTimer()}
    CreateThread(function()
        local ok,creds=pcall(Peak.SendCallback,'peak-phone:Server:GetWebRTCCredentials',data.CallId)
        if myGeneration~=generation or not active or active.id~=data.CallId then return end
        if not ok or not creds or not creds.Success then
            TriggerServerEvent('peak-phone:portable:rtcAbort',data.CallId);stop(data.CallId,'Video relay unavailable');Peak.Functions.Notify('Video relay could not be reached. Ask an administrator to run phone_doctor.','error');return
        end
        if not IsPhoneOpen then OpenPhone(true) end
        if not IsPhoneOpen or not enableCam() then
            TriggerServerEvent('peak-phone:portable:rtcAbort',data.CallId);stop(data.CallId,'Camera unavailable');Peak.Functions.Notify('Close any other game camera before answering a video call.','error');return
        end
        SendNUIMessage({Action='Video/Start',CallId=data.CallId,Peer=data.Peer,Initiator=data.Initiator,ContactName=data.ContactName,
            IceServers=creds.IceServers,RelayOnly=PhoneConfig.Video.RelayOnly,Width=PhoneConfig.Video.Width,Height=PhoneConfig.Video.Height,
            FPS=PhoneConfig.Video.FPS,Bitrate=PhoneConfig.Video.Bitrate,ConnectionTimeout=PhoneConfig.Video.ConnectionTimeout,
            AudioMode=PhoneConfig.Video.AudioMode or 'voice'})
        captureState()
        CreateThread(function()
            while active and active.id==data.CallId and generation==myGeneration do
                if GetGameTimer()-active.lastSeen>24000 then
                    TriggerServerEvent('peak-phone:portable:rtcAbort',data.CallId);stop(data.CallId,'Video interface stopped responding');break
                end
                if Phone.VideoCameraActive and cameraReady() and Phone.Camera.owns('video',data.CallId) then
                    DisablePlayerFiring(PlayerId(),true)
                    DisableControlAction(0,24,true);DisableControlAction(0,25,true);DisableControlAction(0,140,true)
                    if IsPauseMenuActive() or IsEntityDead(PlayerPedId()) then
                        TriggerServerEvent('peak-phone:portable:rtcAbort',data.CallId);stop(data.CallId,'Camera stopped');break
                    end
                    Wait(0)
                else Wait(150) end
            end
        end)
    end)
end)
RegisterNetEvent('peak-phone:portable:rtcStop',function(id,reason) if source==65535 then stop(id,reason) end end)
RegisterNetEvent('peak-phone:portable:rtcOffer',function(id,restart) if source==65535 then SendNUIMessage({Action='Video/Offer',CallId=id,Restart=restart==true}) end end)
RegisterNetEvent('peak-phone:portable:signal',function(id,data) if source==65535 then SendNUIMessage({Action='Video/Signal',CallId=id,Signal=data}) end end)
AddEventHandler('Peak:Client:OnPlayerUnload',function() stop(nil,'Character unloaded') end)
AddEventHandler('onClientResourceStop',function(name) if name==GetCurrentResourceName() then releaseCam();restoreVoice();active=nil end end)
RegisterNUICallback('Facetime/GetContacts',function(_,cb) cb(Peak.SendCallback('peak-phone:Server:Contacts:GetContacts')) end)
RegisterNUICallback('Facetime/StartCall',function(data,cb) cb(Peak.SendCallback('peak-phone:portable:videoDial',data)) end)
RegisterNUICallback('Facetime/AnswerCall',function(data,cb) cb(Peak.SendCallback('peak-phone:portable:answer',data.CallId)) end)
RegisterNUICallback('Facetime/EndCall',function(data,cb)
    local id=data.CallId or (active and active.id)
    if type(id)=='string' then
        stop(id,'Call ended')
        if Phone.applyCallState then Phone.applyCallState(nil,id,'Call ended') end
        TriggerServerEvent('peak-phone:Server:Contacts:DeclineCall',{CallId=id})
        cb({Success=true}) -- local acknowledgement; the authoritative stop is broadcast separately
    else cb({Success=false}) end
end)
RegisterNUICallback('Facetime/Ready',function(data,cb) cb(Peak.SendCallback('peak-phone:portable:rtcReady',data.CallId)) end)
RegisterNUICallback('Facetime/Signal',function(data,cb)
    if active and data.CallId==active.id then TriggerServerEvent('peak-phone:portable:signal',data.CallId,data.Signal);return cb(true) end
    cb(false)
end)
RegisterNUICallback('Facetime/Status',function(data,cb)
    if not active or active.id~=data.CallId then return cb(false) end
    if data.Status=='connected' and PhoneConfig.Video.AudioMode=='webrtc' and PhoneConfig.Video.SuppressDuplicateProximity~=false and Phone.started(PhoneConfig.VoiceResource) then
        pcall(function()
            local voice=exports[PhoneConfig.VoiceResource]
            if not voice:isPlayerMuted(active.peer) then voice:toggleMutePlayer(active.peer);active.ourMute=true end
        end)
    end
    TriggerServerEvent('peak-phone:portable:rtcStatus',data.CallId,data.Status);cb(true)
end)
RegisterNUICallback('Facetime/Heartbeat',function(data,cb)
    if active and active.id==data.CallId then active.lastSeen=GetGameTimer();TriggerServerEvent('peak-phone:portable:rtcHeartbeat',data.CallId);return cb(true) end;cb(false)
end)
RegisterNUICallback('Facetime/Abort',function(data,cb)
    if type(data)~='table' or type(data.CallId)~='string' or #data.CallId>80 then return cb(false) end
    -- Send even after local cleanup: the server authenticates membership, and a
    -- failed local request must not leave the other participant waiting.
    TriggerServerEvent('peak-phone:portable:rtcAbort',data.CallId)
    if (active and active.id==data.CallId) or (CallData and CallData.CallId==data.CallId) then
        stop(data.CallId,'Video stopped')
        if Phone.applyCallState then Phone.applyCallState(nil,data.CallId,'Video stopped') end
    end;cb(true)
end)
RegisterNUICallback('Facetime/ToggleVideo',function(data,cb)
    if not active or active.id~=data.CallId or type(data.Enabled)~='boolean' then return cb({Success=false}) end
    active.requested=data.Enabled
    if active.requested then
        if not enableCam() then active.requested=false;captureState();return cb({Success=false,Msg='The game camera is in use. Close the other camera and try again.'}) end
    else releaseCam() end
    captureState();cb({Success=true,Enabled=Phone.VideoCameraActive,Requested=active.requested})
end)
RegisterNUICallback('Facetime/FlipCamera',function(data,cb)
    if not active or active.id~=data.CallId then return cb({Success=false}) end
    if Phone.VideoCameraActive then
        if type(Phone.Camera.flipFor)~='function' then return cb({Success=false,Msg='The game camera is not available.'}) end
        local result=Phone.Camera.flipFor('video',active.id)
        if not result.Success then return cb(result) end
        active.front=result.Front==true
    else active.front=not active.front end
    captureState();cb({Success=true,Front=active.front})
end)
RegisterNUICallback('Facetime/ZoomCamera',function(data,cb)
    cb(false)
end)
