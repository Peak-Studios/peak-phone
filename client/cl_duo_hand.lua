-- Authored freemode clips. No runtime IK, new entities or network events.
Phone.DuoHand = {}
local H,C = Phone.DuoHand,PhoneDuoPropConfig
local function profile(ped)
    local model=GetEntityModel(ped)
    if model==GetHashKey('mp_m_freemode_01') then return 'male' end
    if model==GetHashKey('mp_f_freemode_01') then return 'female' end
end
function H.prepare(v)
    if not C.HandAnimation or not C.HandAnimation.Enabled then return end
    local sex=profile(v.ped);if not sex then return end
    local p=C.Profiles and C.Profiles[sex]
    v.sex=sex;v.profile=p
    RequestAnimDict('peak_sharedrop_'..sex)
    v.handDictionary=p and p.FoldDictionary or ('peak_duo_hand_'..sex)
    v.handPrefix=p and p.FoldPrefix or ('peak_duo_'..sex)
    RequestAnimDict(v.handDictionary)
end
local function canRestore(v)
    return not Phone.ShareDropActive and v.ped==PlayerPedId() and IsPhoneOpen and not (CallData and CallData.Dialing)
        and not v.simGesture and not InCamera and not Phone.VideoCameraActive and not Phone.KiloLiveCameraActive
        and Phone.Client and tonumber(v.generation)==tonumber(Phone.Client.Generation)
        and DoesEntityExist(v.ped) and not IsEntityDead(v.ped)
end
local function stockHold(v)
    if not canRestore(v) then return false end
    if not HasAnimDictLoaded('cellphone@') then
        RequestAnimDict('cellphone@')
        return false
    end
    if IsEntityPlayingAnim(v.ped,'cellphone@','cellphone_text_read_base',3) then return true end
    TaskPlayAnim(v.ped,'cellphone@','cellphone_text_read_base',8.0,3.0,-1,49,1.0,false,false,false)
    v.stockHoldClip='cellphone_text_read_base'
    return true
end
local function clearPending(v)
    v.holdRequest=(v.holdRequest or 0)+1
    v.holdPending=nil;v.holdPendingClip=nil
end
local function canHold(v,clip)
    if type(clip)~='string' or clip=='' or not v.handDictionary or not v.ready or v.reduced or v.fallback
        or not canRestore(v) or v.handMode=='transition' or v.handClip or v.start then return false end
    if Phone.DuoProp and Phone.DuoProp.getLocalVisual and Phone.DuoProp.getLocalVisual()~=v then return false end
    return v.profile and v.profile.HoldClip==clip
end
local function stockPosePlaying(v)
    return IsEntityPlayingAnim(v.ped,'cellphone@','cellphone_text_read_base',3)
end
function H.hold(v)
    local clip=v.profile and v.profile.HoldClip
    if type(clip)~='string' or clip=='' or not v.handDictionary or not v.ready or v.reduced or v.fallback
        or not canRestore(v) then return false end
    if v.handMode=='transition' or v.start then return false end
    if v.handMode=='hold' and v.handClip==clip then
        if HasAnimDictLoaded(v.handDictionary) and IsEntityPlayingAnim(v.ped,v.handDictionary,clip,3) then return true end
        if (GetGameTimer()-(v.handStarted or 0))%4294967296<300 then return true end
        H.stop(v,false)
        v.holdRetryAt=GetGameTimer()+15000
        stockHold(v)
        return true
    end
    if v.handClip then H.stop(v,false) end
    if not canHold(v,clip) then return false end
    if not HasAnimDictLoaded(v.handDictionary) then
        if v.holdPending and v.holdPendingClip==clip then return true end
        clearPending(v)
        local request=v.holdRequest;v.holdPending=request;v.holdPendingClip=clip
        RequestAnimDict(v.handDictionary)
        stockHold(v) -- Keep the ordinary phone pose while the optional dictionary loads.
        CreateThread(function()
            local started=GetGameTimer();local lastRequest=started
            while v.holdPending==request do
                if not canHold(v,clip) then clearPending(v);return end
                local elapsed=(GetGameTimer()-started)%4294967296
                if HasAnimDictLoaded(v.handDictionary) then
                    v.holdPending=nil;v.holdPendingClip=nil
                    if v.holdRequest==request then H.hold(v) end
                    return
                end
                if elapsed>=math.max(1,tonumber(C.HandLoadTimeout) or 15000) then
                    clearPending(v);v.holdRetryAt=GetGameTimer()+15000;stockHold(v);return
                end
                if (GetGameTimer()-lastRequest)%4294967296>=500 then
                    RequestAnimDict(v.handDictionary);lastRequest=GetGameTimer()
                end
                Wait(50)
            end
        end)
        return true
    end
    TaskPlayAnim(v.ped,v.handDictionary,clip,8.0,8.0,-1,49,1.0,false,false,false)
    v.handClip=clip;v.handMode='hold';v.handStarted=GetGameTimer()
    -- A missing optional hold clip must fall back to the stock phone pose.
    -- After a valid clip starts, later interruption is left to the other task.
    CreateThread(function()
        local verified=false
        while v.handMode=='hold' and v.handClip==clip do
            if not canRestore(v) then H.stop(v,false);return end
            local playing=IsEntityPlayingAnim(v.ped,v.handDictionary,clip,3)
            if playing then verified=true
            elseif verified then
                v.handClip=nil;v.handMode=nil;v.handStarted=nil;stockHold(v);return
            elseif (GetGameTimer()-v.handStarted)%4294967296>=250 then
                v.handClip=nil;v.handMode=nil;v.handStarted=nil
                v.holdRetryAt=GetGameTimer()+15000;stockHold(v);return
            end
            Wait(50)
        end
    end)
    return true
end
function H.ensureHold(v)
    if not v.handDictionary or not v.ready or v.reduced or v.fallback or not canRestore(v) then return end
    if v.start or v.handMode=='transition' then
        if not HasAnimDictLoaded(v.handDictionary) then stockHold(v) end
        return
    end
    if v.handMode=='hold' and v.handClip then
        if HasAnimDictLoaded(v.handDictionary) and IsEntityPlayingAnim(v.ped,v.handDictionary,v.handClip,3) then return end
        if (GetGameTimer()-(v.handStarted or 0))%4294967296>=300 then
            H.stop(v,false)
            v.holdRetryAt=GetGameTimer()+15000
            stockHold(v)
            return
        end
    end
    if v.holdPending then stockHold(v);return end
    local retryReady=not v.holdRetryAt or (GetGameTimer()-v.holdRetryAt)%4294967296<2147483648
    if retryReady then
        if H.hold(v) then return end
    end
    stockHold(v)
end
function H.stop(v,restore)
    clearPending(v)
    v.holdAfterTransition=nil
    local clip=v.handClip
    if clip then
        local playing=DoesEntityExist(v.ped) and IsEntityPlayingAnim(v.ped,v.handDictionary,clip,3)
        if playing and v.ped==PlayerPedId() then StopAnimTask(v.ped,v.handDictionary,clip,8.0) end
    end
    v.handClip=nil;v.handMode=nil;v.handStarted=nil
    if restore and canRestore(v) then
        if H.hold(v) then return end
        stockHold(v)
    end
end
-- Camera takes over only the phone poses this controller started. Other
-- animation tasks on the ped are left for their owners to manage.
function H.suspendForCamera(v)
    if not v or v.ped~=PlayerPedId() then return false end
    clearPending(v)
    v.holdAfterTransition=nil
    local clip=v.handClip
    if clip then
        local playing=DoesEntityExist(v.ped) and IsEntityPlayingAnim(v.ped,v.handDictionary,clip,3)
        if playing then StopAnimTask(v.ped,v.handDictionary,clip,1.0) end
    end
    v.handClip=nil;v.handMode=nil;v.handStarted=nil
    local stock=v.stockHoldClip
    if stock and DoesEntityExist(v.ped) and IsEntityPlayingAnim(v.ped,'cellphone@',stock,3) then
        StopAnimTask(v.ped,'cellphone@',stock,1.0)
    end
    v.stockHoldClip=nil
    return true
end
function H.start(v)
    clearPending(v)
    v.holdAfterTransition=nil
    if not v.handDictionary or v.reduced or not v.ready or v.fallback then H.stop(v,true);return end
    if v.ped~=PlayerPedId() then return end -- owning client's animation replicates normally
    if not IsPhoneOpen or (CallData and CallData.Dialing) then return end
    if not HasAnimDictLoaded(v.handDictionary) then
        RequestAnimDict(v.handDictionary)
        if v.start then
            if v.handClip then H.stop(v,false) end
            v.holdAfterTransition=true
            stockHold(v)
        end
        return
    end
    H.stop(v,false)
    v.handClip=v.handPrefix..(v.expanded and '_unfold' or '_fold')
    v.handMode='transition'
    v.handStarted=GetGameTimer()
    TaskPlayAnim(v.ped,v.handDictionary,v.handClip,8.0,8.0,-1,50,1.0,false,false,false)
    SetEntityAnimCurrentTime(v.ped,v.handDictionary,v.handClip,v.expanded and v.phase or 1-v.phase)
end
function H.sample(v,now)
    if not v.handDictionary then return false end
    if v.ped~=PlayerPedId() then
        -- Read the replicated clip's actual phase rather than racing its arrival
        -- with our discrete prop-state packet. Never task another player's ped.
        for _,suffix in ipairs({'_unfold','_fold'}) do
            local clip=v.handPrefix..suffix
            if IsEntityPlayingAnim(v.ped,v.handDictionary,clip,3) then
                local t=GetEntityAnimCurrentTime(v.ped,v.handDictionary,clip)
                v.angle=PhoneDuoMotion.phaseAngle(suffix=='_unfold' and t or 1-t)
                return t<.9999
            end
        end
        return false
    end
    if not v.handClip then
        if v.holdAfterTransition and not v.start then
            v.holdAfterTransition=nil
            if canRestore(v) then H.hold(v) end
        end
        return false
    end
    if v.handMode=='hold' then return false end
    if not v.start then H.stop(v,true);return false end
    if IsEntityDead(v.ped) or not IsPhoneOpen or (CallData and CallData.Dialing) then H.stop(v,false);return false end
    if (now-v.handStarted)%4294967296>150 and not IsEntityPlayingAnim(v.ped,v.handDictionary,v.handClip,3) then
        H.stop(v,false);return false -- respect other tasks and interruptions
    end
    SetEntityAnimCurrentTime(v.ped,v.handDictionary,v.handClip,v.expanded and v.phase or 1-v.phase)
    return true
end
AddEventHandler('onClientResourceStop',function(name)
    if name~=GetCurrentResourceName() then return end
    for _,dict in ipairs({'peak_duo_hand_male','peak_duo_hand_female','peak_sim_fold_male','peak_sim_fold_female'}) do RemoveAnimDict(dict) end
end)
