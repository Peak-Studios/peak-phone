Peak = PhonePeak

-- Follow NPWD's native mobile-camera lifecycle. GTA owns the camera lens and
-- selfie pose; do not layer a scripted camera, animation or arm IK over it.
Phone = Phone or {}
Phone.Camera = Phone.Camera or {}
local camera = {
    active=false, front=false, mobileCreated=false, ped=nil, previous=nil, owner=nil,
    kind=nil, sessionId=nil, yaw=0.0, pitch=0.0, renderYaw=0.0, renderPitch=0.0,
}
CameraIsSelfie = false
Phone.VideoCameraActive=false
Phone.KiloLiveCameraActive=false

local function clamp(value, low, high)
    return math.max(low, math.min(high, value))
end

local function renderingScriptCamera()
    local handle=GetRenderingCam()
    if handle and DoesCamExist(handle) then return handle end
    return nil
end

local function activeOwnerIsOurs()
    local rendering=renderingScriptCamera()
    return rendering==nil or rendering==camera.owner
end

local function frontCamera(front)
    -- The front-camera native used by NPWD's cl_photo.ts. This is distinct
    -- from CELL_CAM_ACTIVATE_SELFIE_MODE (0x015C49A93E3E086E).
    Citizen.InvokeNative(0x2491A93618B7D838,front)
end

local function resetFraming()
    camera.yaw,camera.pitch,camera.renderYaw,camera.renderPitch=0.0,0.0,0.0,0.0
    Citizen.InvokeNative(0x1B0B4AEED5B9B41C,0.0) -- horizontal offset [-1,1]
    Citizen.InvokeNative(0xD6ADE981781FCA09,0.0) -- head pitch [-1,1]
end

local function suspendPhoneHold(ped)
    local hand=Phone.DuoHand
    local visual=Phone.DuoProp and Phone.DuoProp.getLocalVisual and Phone.DuoProp.getLocalVisual()
    if hand and hand.suspendForCamera and visual and visual.ped==ped then
        hand.suspendForCamera(visual)
    end
    -- StartPhoneAnim also owns this stock hold independently of DuoHand.
    if IsEntityPlayingAnim(ped,'cellphone@','cellphone_text_read_base',3) then
        StopAnimTask(ped,'cellphone@','cellphone_text_read_base',1.0)
    end
end

local function hideLocalPhone()
    local visual=Phone.DuoProp and Phone.DuoProp.getLocalVisual and Phone.DuoProp.getLocalVisual()
    if not visual then return end
    -- The native mobile camera supplies its own phone/arm presentation. Keep
    -- the custom foldable prop out of the local shot rather than rendering two.
    for _,entity in pairs({visual.body,visual.leaf}) do
        if entity and entity~=0 and DoesEntityExist(entity) then SetEntityLocallyInvisible(entity) end
    end
end

local function restorePriorState(restore)
    local prior=camera.previous
    camera.previous=nil
    if not prior or restore==false then return end
    SetFollowPedCamViewMode(prior.pedView)
    SetFollowVehicleCamViewMode(prior.vehicleView)
    DisplayRadar(not prior.radarHidden)
    if IsPhoneOpen then
        SetNuiFocus(prior.focus,prior.focus)
        SetNuiFocusKeepInput(prior.keepInput)
    else
        SetNuiFocus(false,false)
        SetNuiFocusKeepInput(false)
    end
end

local function stopCamera(notifyLost)
    if not camera.active and not camera.mobileCreated then return false end
    local ownsCurrentView=activeOwnerIsOurs()
    local previousKind,previousId=camera.kind,camera.sessionId
    camera.active=false
    -- Release only the native mobile session we created. Never call
    -- RenderScriptCams/DestroyCam: another resource may now own a scripted cam.
    if camera.mobileCreated then
        if ownsCurrentView then resetFraming();frontCamera(false) end
        CellCamActivate(false,false)
        DestroyMobilePhone()
        camera.mobileCreated=false
    end
    camera.front=false;camera.owner=nil;camera.ped=nil;camera.kind=nil;camera.sessionId=nil
    CameraIsSelfie=false;InCamera=false;Phone.VideoCameraActive=false;Phone.KiloLiveCameraActive=false
    restorePriorState(ownsCurrentView)
    if Phone.DuoProp then Phone.DuoProp.refresh() end
    if notifyLost and previousKind and previousKind~='photo' and Phone.Camera.onLost then
        pcall(Phone.Camera.onLost,previousKind,previousId)
    end
    return true
end

local function startSession(kind,sessionId,front)
    if camera.active then
        if camera.kind==kind and camera.sessionId==sessionId then return true,camera.front end
        return false,'The game camera is already in use.'
    end
    if not IsPhoneOpen then return false,'Open the phone before using Camera.' end
    if (kind~='video' and Phone.VideoCameraActive) or (kind~='live' and Phone.KiloLiveCameraActive) or InCamera then
        return false,'Close the active video camera before using Camera.'
    end
    if renderingScriptCamera() then return false,'Another game camera is already active.' end
    local ped=PlayerPedId()
    if ped==0 or IsEntityDead(ped) then return false,'Camera is unavailable while you are down.' end
    local focus=true
    if type(IsNuiFocused)=='function' then focus=IsNuiFocused() end
    local keepInput=false
    if type(IsNuiFocusKeepingInput)=='function' then keepInput=IsNuiFocusKeepingInput() end
    camera.previous={pedView=GetFollowPedCamViewMode(),vehicleView=GetFollowVehicleCamViewMode(),
        radarHidden=IsRadarHidden(),focus=focus,keepInput=keepInput}
    camera.active=true;camera.front=front==true;camera.ped=ped;camera.kind=kind;camera.sessionId=sessionId
    InCamera=kind=='photo';Phone.VideoCameraActive=kind=='video';Phone.KiloLiveCameraActive=kind=='live'
    CameraIsSelfie=camera.front
    suspendPhoneHold(ped)
    -- CREATE_MOBILE_PHONE is required by CELL_CAM_ACTIVATE, even with a custom
    -- phone UI. Mark ownership first so a failed activation can be unwound.
    camera.mobileCreated=true
    local ok=pcall(function()
        CreateMobilePhone(1)
        CellCamActivate(true,true)
        frontCamera(camera.front)
        resetFraming()
    end)
    camera.owner=renderingScriptCamera()
    if not ok then
        stopCamera(false)
        return false,'The native phone camera could not start.'
    end
    DisplayRadar(false)
    if kind=='photo' then SetNuiFocus(true,true);SetNuiFocusKeepInput(false) end
    if Phone.DuoProp then Phone.DuoProp.refresh() end
    return true,camera.front
end

function Phone.Camera.start()
    return startSession('photo',nil,false)
end

function Phone.Camera.acquire(kind,sessionId,front)
    if (kind~='video' and kind~='live') or type(sessionId)~='string' or #sessionId<1 or #sessionId>128 then
        return false,'The game camera owner is invalid.'
    end
    return startSession(kind,sessionId,front)
end

function Phone.Camera.release(kind,sessionId)
    if not camera.active or camera.kind~=kind or camera.sessionId~=sessionId then return false end
    return stopCamera(false)
end

function Phone.Camera.owns(kind,sessionId)
    return camera.active and camera.kind==kind and camera.sessionId==sessionId and activeOwnerIsOurs()
end

local function flip(kind,sessionId)
    if not camera.active or camera.kind~=kind or camera.sessionId~=sessionId then
        return {Success=false,Msg='The camera is not open.',IsSelfie=false}
    end
    if not activeOwnerIsOurs() then
        stopCamera(true)
        if kind=='photo' then SendNUIMessage({Action='ShowCameraOverlay',Visible=false}) end
        return {Success=false,Msg='Another game camera took control.',IsSelfie=false}
    end
    local front=not camera.front
    frontCamera(front)
    camera.front=front;CameraIsSelfie=front
    resetFraming()
    return {Success=true,IsSelfie=front,Front=front}
end

function Phone.Camera.flip() return flip('photo',nil) end
function Phone.Camera.flipFor(kind,sessionId) return flip(kind,sessionId) end

function Phone.Camera.orbit(data)
    if not camera.active or type(data)~='table' then return {Success=false} end
    local dx,dy=tonumber(data.Dx),tonumber(data.Dy)
    if not dx or not dy or dx~=dx or dy~=dy or math.abs(dx)==math.huge or math.abs(dy)==math.huge then
        return {Success=false}
    end
    if not activeOwnerIsOurs() then return {Success=false} end
    dx,dy=clamp(dx,-45.0,45.0),clamp(dy,-20.0,20.0)
    if camera.front then
        camera.yaw=clamp(camera.yaw-dx,-45.0,45.0)
        camera.pitch=clamp(camera.pitch-dy,-20.0,20.0)
    else
        SetGameplayCamRelativeHeading(GetGameplayCamRelativeHeading()-dx)
        SetGameplayCamRelativePitch(clamp(GetGameplayCamRelativePitch()+dy,-70.0,70.0),1.0)
    end
    return {Success=true}
end

Phone.Camera.stop=stopCamera

CreateThread(function()
    while true do
        if camera.active then
            local ped=PlayerPedId()
            if not IsPhoneOpen or ped~=camera.ped or ped==0 or IsEntityDead(ped) or IsPauseMenuActive() then
                if IsPhoneOpen then ClosePhone(true) else
                    local kind=camera.kind
                    stopCamera(true)
                    if kind=='photo' then SendNUIMessage({Action='ShowCameraOverlay',Visible=false}) end
                end
            elseif not activeOwnerIsOurs() then
                local kind=camera.kind
                stopCamera(true)
                if kind=='photo' then SendNUIMessage({Action='ShowCameraOverlay',Visible=false}) end
            else
                HideHudAndRadarThisFrame()
                DisablePlayerFiring(PlayerId(),true)
                for _,control in ipairs({0,24,25,37,44,68,69,70,91,92,140,141,142,257,261,262,263,264}) do
                    DisableControlAction(0,control,true)
                end
                hideLocalPhone()
                if camera.front then
                    local dt=clamp(GetFrameTime() or 0.016,0.0,0.1)
                    local blend=1.0-math.exp(-13.0*dt)
                    camera.renderYaw=camera.renderYaw+(camera.yaw-camera.renderYaw)*blend
                    camera.renderPitch=camera.renderPitch+(camera.pitch-camera.renderPitch)*blend
                    Citizen.InvokeNative(0x1B0B4AEED5B9B41C,camera.renderYaw/45.0)
                    Citizen.InvokeNative(0xD6ADE981781FCA09,camera.renderPitch/20.0)
                end
            end
            Wait(0)
        else
            Wait(250)
        end
    end
end)

RegisterNUICallback('Phone/CameraOrbit',function(data,cb) cb(Phone.Camera.orbit(data)) end)
AddEventHandler('Peak:Client:OnPlayerUnload',function() stopCamera() end)
AddEventHandler('onClientResourceStop',function(name)
    if name==GetCurrentResourceName() then stopCamera() end
end)

-- Correlate acknowledgements so an older timeout cannot clear a newer capture.
IsCapturingPhoto = false
local captureRequest,captureSequence=nil,0
local function finish(request,ok,message)
    if request~=captureRequest then return end
    captureRequest=nil;IsCapturingPhoto=false
    Peak.Functions.Notify(ok and 'Photo saved to Gallery.' or (message or 'Photo capture failed.'),ok and 'success' or 'error')
    SendNUIMessage({Action='Camera/PhotoResult',Success=ok,Message=message})
end
function CapturePhoto()
    if IsCapturingPhoto or not InCamera then return false end
    local player=Peak.Functions.GetPlayerData()
    if not player or not player.citizenid then return false end
    captureSequence=captureSequence+1
    local request=tostring(GetGameTimer())..'-'..captureSequence
    captureRequest=request;IsCapturingPhoto=true
    Peak.Functions.Notify('Capturing photo...','info')
    SetTimeout(45000,function() finish(request,false,'Photo capture timed out. Please try again.') end)
    CreateThread(function()
        local ok,result=pcall(Peak.SendCallback,'peak-phone:Server:Gallery:BeginCapture',request)
        if not ok or type(result)~='table' or not result.Success then
            finish(request,false,ok and type(result)=='table' and result.Msg or 'Could not start capture. Open and unlock your phone, then try again.')
        end
    end)
    return true
end

-- Camera capture thread (handles Enter key press)
Citizen.CreateThread(function()
    while true do
        Citizen.Wait(0)

        if InCamera and IsPhoneOpen then
            if IsControlJustPressed(0, 191) then
                -- NUI chooses Photo or Video; one shutter owns both modes.
                SendNUIMessage({ Action = "Camera/Shutter" })
            end
        else
            Citizen.Wait(500)
        end
    end
end)

exports('InCamera', function()
    return InCamera
end)

RegisterNetEvent('peak-phone:portable:captureComplete',function(request,ok,message)
    if source~=65535 then return end
    finish(request,ok==true,message)
end)
