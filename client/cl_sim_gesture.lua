Phone.SimGesture={busy=false,cancelled=false}
local S,C=Phone.SimGesture,PhoneDuoPropConfig
local function valid(ped,body,generation)
    local metadata=Phone.Client.Data and Phone.Client.Data.metadata or {}
    return Phone.Client.Ready and Phone.Client.Generation==generation and (IsPhoneOpen or S.inventoryHeld)
        and not CallData and not metadata.isdead
        and DoesEntityExist(ped) and not IsEntityDead(ped) and not IsPedRagdoll(ped)
        and not IsPedInAnyVehicle(ped,false) and DoesEntityExist(body)
        and Phone.DuoProp and Phone.DuoProp.getLocalVisual()==S.visual
end
function S.cancel()
    if not S.busy then return end
    S.cancelled=true
    if GetResourceState('peak-sim-assets')=='started' then exports['peak-sim-assets']:Cancel() end
end
function S.run(operation)
    if S.busy then return false,'A SIM operation is already running.' end
    if operation~='insert' and operation~='remove' then return false,'Invalid SIM operation.' end
    -- SIM ownership remains server-authoritative; animation is a best-effort
    -- visual aid and must not block a valid inventory operation.
    if GetResourceState('peak-sim-assets')~='started' then return true end
    local visual=Phone.DuoProp and Phone.DuoProp.getLocalVisual()
    if not visual or visual.fallback or not visual.body then return true end
    local ped,generation=PlayerPedId(),Phone.Client.Generation
    S.visual=visual
    if not valid(ped,visual.body,generation) then S.visual=nil;return true end
    if not Phone.DuoProp.setSimGesture(operation) then S.visual=nil;return true end
    S.busy,S.cancelled=true,false
    CreateThread(function()
        while S.busy and not S.cancelled do
            if not valid(ped,visual.body,generation) then S.cancel();break end
            Wait(50)
        end
    end)
    local called,ok,reason=pcall(function() return exports['peak-sim-assets']:Play(visual.body,operation,Phone.DuoProp.expanded==true) end)
    if not called then reason=ok;ok=false end
    if ok and (S.cancelled or not valid(ped,visual.body,generation)) then ok=false;reason='cancelled' end
    S.busy=false;Phone.DuoProp.setSimGesture(nil);Phone.DuoProp.flushPendingAccept()
    local restoreHold=ok and valid(ped,visual.body,generation) and not visual.start
    S.visual=nil
    if Phone.Client.Generation~=generation or not Phone.Client.Ready then return false,'Phone identity changed during the SIM operation.' end
    if not ok then return true end
    if restoreHold and Phone.DuoHand then Phone.DuoHand.hold(visual) end
    return true
end

-- Remote peds replicate the owner's authored task. Observers only move the
-- already-created tray/card props; they never task another player's ped.
CreateThread(function()
    while true do
        local active=false;local prop=Phone.DuoProp
        if prop then
            local now=GetGameTimer()
            for id,state in pairs(prop.remote or {}) do
                local v=prop.visuals and prop.visuals[id]
                if v and v.ready and v.simTray and state.simOperation and state.simAt then
                    active=true;v.simGesture=state.simOperation
                    SetEntityVisible(v.simTray,true,false);if v.simCard then SetEntityVisible(v.simCard,true,false) end
                    local elapsed=(now-(state.localSimAt or now))%4294967296;local t=math.min(3.0,elapsed/1000)
                    -- The owner's animation is clock-driven; GTA's reported
                    -- phase may jump to 1.0 before the gesture finishes.
                    local inHand=(state.simOperation=='insert' and t<.8) or (state.simOperation=='remove' and t>1.9)
                    if inHand and v.profile then
                        local p,r=v.profile.TrayHandPosition,v.profile.TrayHandRotation
                        AttachEntityToEntity(v.simTray,v.ped,GetPedBoneIndex(v.ped,18905),p[1],p[2],p[3],r[1],r[2],r[3],false,false,false,true,2,true)
                    else
                        local x=math.max(0,math.min(1,(t-1.15)/.75));local smooth=x*x*x*(x*(6*x-15)+10)
                        local travel=C.Tray.Travel*(state.simOperation=='insert' and (1-smooth) or smooth);local p=C.Tray.Position
                        AttachEntityToEntity(v.simTray,v.body,-1,p[1],p[2],p[3]-travel,0.0,0.0,0.0,false,false,false,false,2,true)
                    end
                end
            end
        end
        Wait(active and 0 or 100)
    end
end)
AddEventHandler('Peak:Client:OnPlayerUnload',S.cancel)
AddEventHandler('onClientResourceStop',function(name) if name==GetCurrentResourceName() or name=='peak-sim-assets' then S.cancel() end end)
