local ANIMATION_DURATION_MS = 3200
local START_DELAY_MS = 800
local MIN_START_NOTICE_MS = 200
local MAX_START_LATENESS_MS = 100
-- AF_UPPERBODY | AF_HOLD_LAST_FRAME | AF_SECONDARY. AF_LOOPING is not set.
local ANIMATION_FLAGS = 50
local disabledControls = {21,22,23,24,25,30,31,44,140,141,142}
local session, enabled = nil, false

local function available()
    local ped=PlayerPedId()
    local model=GetEntityModel(ped)
    if Phone.DuoProp and Phone.DuoProp.getLocalVisual then
        local visual=Phone.DuoProp.getLocalVisual()
        if not visual or not visual.ready or visual.fallback or visual.start then return false end
    end
    return Phone.Client.Ready and IsPhoneOpen and not IsPedDeadOrDying(ped,true) and not IsPedInAnyVehicle(ped,false)
        and not (Phone.Client.Device and Phone.Client.Device.Locked)
        and not IsPedRagdoll(ped) and not InCamera and not Phone.VideoCameraActive and not Phone.KiloLiveCameraActive
        and not (CallData and CallData.Dialing) and not (Phone.DuoProp and Phone.DuoProp.simOperation)
        and (model==joaat('mp_m_freemode_01') or model==joaat('mp_f_freemode_01'))
end

local function release(expected)
    if expected and session~=expected then return end
    local current=session
    if current then
        if current.moving then ClearPedTasks(PlayerPedId()) end
        if current.dict then StopAnimTask(PlayerPedId(),current.dict,current.clip,3.0) end
    end
    Phone.ShareDropActive=false
    session=nil
    if IsPhoneOpen and Phone.Client.Ready then StartPhoneAnim() end
end

local function cancel(current)
    if session==current then TriggerServerEvent('peak-phone:sharedrop:cancel',current.id) end
end

for _,name in ipairs({'Enabled','Nearby','Request','Respond'}) do
    RegisterNUICallback('ShareDrop/'..name,function(data,cb)
        if name=='Request' or (name=='Respond' and type(data)=='table' and data.Accept==true) then
            if not available() then return cb({Success=false,Error='Open your phone on foot to use ShareDrop.'}) end
        end
        local result=Peak.SendCallback('peak-phone:sharedrop:'..name,data)
        if name=='Enabled' and result and result.Success then enabled=result.Enabled end
        cb(result)
    end)
end

RegisterNUICallback('ShareDrop/Cancel',function(data,cb)
    if type(data)=='table' and type(data.Id)=='string' and #data.Id>0 and #data.Id<=128 then
        -- The NUI request response can beat its phase event. Forward the ID
        -- even before this client has installed the local session; the server
        -- verifies that this player belongs to it.
        TriggerServerEvent('peak-phone:sharedrop:cancel',data.Id)
    end
    cb({Success=true})
end)

local allowedTransitions={
    offer={approach=true,cancelled=true},
    approach={animation=true,cancelled=true},
    animation={complete=true,cancelled=true,failed=true}
}
local terminal={complete=true,cancelled=true,failed=true}

RegisterNetEvent('peak-phone:sharedrop:phase',function(data)
    if source~=65535 or type(data)~='table' or type(data.Id)~='string' or #data.Id<1 or #data.Id>128 then return end
    local current=session
    if data.Phase=='offer' then
        if type(data.Peer)~='number' or data.Peer%1~=0 or data.Peer<0 or type(data.Receiver)~='boolean' then return end
        if current then
            if current.id==data.Id and current.phase=='offer' then return end
            return
        end
        current={id=data.Id,peer=data.Peer,receiver=data.Receiver,generation=Phone.Client.Generation,phase='offer'}
        session=current
        if current.receiver and not IsPhoneOpen then OpenPhone(true,false) end
    else
        if not current or current.id~=data.Id then return end
        if current.generation~=Phone.Client.Generation then
            cancel(current)
            release(current)
            SendNUIMessage({Action='Duo/Reset'})
            return
        end
        if terminal[data.Phase] then
            if current.phase=='terminal' or not allowedTransitions[current.phase] then return end
            current.phase='terminal'
        else
            if not allowedTransitions[current.phase] or not allowedTransitions[current.phase][data.Phase] then return end
            current.phase=data.Phase
        end
    end

    SendNUIMessage({Action='ShareDrop/Phase',Data=data})
    if data.Phase=='approach' then
        if not available() then return cancel(current) end
        Phone.ShareDropActive=true
        local visual=Phone.DuoProp and Phone.DuoProp.getLocalVisual and Phone.DuoProp.getLocalVisual()
        if visual and Phone.DuoHand then Phone.DuoHand.stop(visual,false) end
        local sex=GetEntityModel(PlayerPedId())==joaat('mp_f_freemode_01') and 'female' or 'male'
        current.dict='peak_sharedrop_'..sex
        current.clip='peak_sharedrop_'..sex..'_'..(current.receiver and 'receive' or 'send')
        RequestAnimDict(current.dict)
        CreateThread(function()
            local deadline=(GetNetworkTimeAccurate()+12000)%4294967296
            while session==current and GetTimeDifference(deadline,GetNetworkTimeAccurate())>0 do
                local peer=GetPlayerFromServerId(current.peer)
                if peer==-1 or not available() then break end
                local ped,other=PlayerPedId(),GetPlayerPed(peer)
                local pos=GetEntityCoords(other)
                local distance=#(GetEntityCoords(ped)-pos)
                if current.receiver and math.abs(distance-.95)>.06 then
                    if not current.moving then
                        local dest=GetOffsetFromEntityInWorldCoords(other,0.0,.95,0.0)
                        TaskFollowNavMeshToCoord(ped,dest.x,dest.y,dest.z,1.0,10000,.025,false,GetEntityHeading(other)+180.0)
                        current.moving=true
                    end
                elseif distance>=.89 and distance<=1.05 and HasAnimDictLoaded(current.dict) then
                    local duration=GetAnimDuration(current.dict,current.clip)
                    if math.abs(duration-(ANIMATION_DURATION_MS/1000))>.15 then
                        print(('[ShareDrop] Invalid streamed clip %s/%s duration=%s'):format(current.dict,current.clip,tostring(duration)))
                        Peak.Functions.Notify('ShareDrop animation could not load. Please reconnect and try again.','error')
                        cancel(current)
                        return
                    end
                    current.clipDurationMs=duration*1000
                    if current.moving then ClearPedTasks(ped);current.moving=false end
                    TaskTurnPedToFaceEntity(ped,other,500)
                    Wait(550)
                    if session~=current then return end
                    if not available() or GetPlayerFromServerId(current.peer)==-1 then return cancel(current) end
                    TriggerServerEvent('peak-phone:sharedrop:ready',current.id,GetNetworkTimeAccurate())
                    return
                end
                Wait(100)
            end
            if session==current then cancel(current) end
        end)
    elseif data.Phase=='animation' then
        local animation=type(data.Data)=='table' and data.Data or nil
        local start=animation and animation.Start
        local duration=animation and animation.Duration
        if type(start)~='number' or start%1~=0 or type(duration)~='number' or duration~=ANIMATION_DURATION_MS
            or not current.dict or not current.clip or not current.clipDurationMs or not HasAnimDictLoaded(current.dict) then
            return cancel(current)
        end
        start=start%4294967296
        CreateThread(function()
            local remaining=GetTimeDifference(start,GetNetworkTimeAccurate())
            if remaining<MIN_START_NOTICE_MS then return cancel(current) end
            while session==current and remaining>0 do
                if not available() then return cancel(current) end
                Wait(0)
                remaining=GetTimeDifference(start,GetNetworkTimeAccurate())
            end
            if session~=current or not available() then return cancel(current) end
            local now=GetNetworkTimeAccurate()
            local lateBy=-GetTimeDifference(start,now)
            if lateBy>MAX_START_LATENESS_MS then return cancel(current) end

            local ped=PlayerPedId()
            -- Let the validated one-shot reach its held final sample; the
            -- server completion phase, not a native duration cutoff, releases it.
            TaskPlayAnim(ped,current.dict,current.clip,4.0,4.0,-1,ANIMATION_FLAGS,1.0,false,false,false)
            current.animationStarted=GetNetworkTimeAccurate()
            current.lastAnimationProgress=0
            current.lastProgressClock=current.animationStarted
            current.sawAnimationProgress=false
            SendNUIMessage({Action='ShareDrop/Transfer',Id=current.id,Elapsed=0,Duration=ANIMATION_DURATION_MS})

            while session==current and current.phase=='animation' do
                local tick=GetNetworkTimeAccurate()
                local elapsed=GetTimeDifference(tick,current.animationStarted)
                local active=IsEntityPlayingAnim(PlayerPedId(),current.dict,current.clip,3)
                local progress=GetEntityAnimCurrentTime(PlayerPedId(),current.dict,current.clip)
                if not available() then return cancel(current) end
                if type(progress)~='number' or progress<0 or progress>1.01 then return cancel(current) end
                if progress>current.lastAnimationProgress+.0005 then
                    current.lastAnimationProgress=progress
                    current.lastProgressClock=tick
                    if progress>.01 then current.sawAnimationProgress=true end
                elseif progress+.002<current.lastAnimationProgress then
                    return cancel(current)
                end
                if current.sawAnimationProgress and progress>=.999 and elapsed>=current.clipDurationMs-35 then
                    current.done=true
                    TriggerServerEvent('peak-phone:sharedrop:done',current.id)
                    CreateThread(function()
                        while session==current and current.phase=='animation' do
                            if not available() then return cancel(current) end
                            for _,control in ipairs(disabledControls) do DisableControlAction(0,control,true) end
                            Wait(0)
                        end
                    end)
                    return
                end
                if not active and elapsed>150 then return cancel(current) end
                if elapsed>math.max(ANIMATION_DURATION_MS,current.clipDurationMs)+1000 or GetTimeDifference(tick,current.lastProgressClock)>450 then
                    return cancel(current)
                end
                for _,control in ipairs(disabledControls) do DisableControlAction(0,control,true) end
                Wait(0)
            end
        end)
    elseif terminal[data.Phase] then
        release(current)
    end
end)

CreateThread(function()
    while true do
        Wait(150)
        if session and (not enabled or not IsPhoneOpen or not Phone.Client.Ready or session.generation~=Phone.Client.Generation
            or (Phone.Client.Device and Phone.Client.Device.Locked)
            or IsPedDeadOrDying(PlayerPedId(),true) or IsPedInAnyVehicle(PlayerPedId(),false)) then
            cancel(session)
            release()
        end
    end
end)

AddEventHandler('Peak:Client:OnPlayerUnload',function()
    enabled=false
    TriggerServerEvent('peak-phone:sharedrop:disable')
    release()
end)
AddEventHandler('onClientResourceStop',function(name)
    if name~=GetCurrentResourceName() then return end
    if session then cancel(session) end
    release()
end)
