-- Preview adapter. It changes no SIM ownership, inventory, phone number or SQL.
-- Caller owns phone visibility, fold locking, call exclusion and transaction lifecycle.
local active, stopped = nil, false
local function elapsed(s) return (GetGameTimer()-s) % 4294967296 end
local function smooth(x)
    x=math.max(0,math.min(1,x));return x*x*x*(x*(6*x-15)+10)
end
local function profile(ped)
    local model=GetEntityModel(ped)
    if model==GetHashKey('mp_m_freemode_01') then return PeakSimProfiles.male,'male' end
    if model==GetHashKey('mp_f_freemode_01') then return PeakSimProfiles.female,'female' end
end
local function attach(o,parent,bone,p,r,ped)
    AttachEntityToEntity(o,parent,bone,p[1],p[2],p[3],r[1],r[2],r[3],false,false,false,ped,2,true)
end
local function clean(s)
    if DoesEntityExist(s.ped) and s.clip and IsEntityPlayingAnim(s.ped,s.dict,s.clip,3) then
        StopAnimTask(s.ped,s.dict,s.clip,4.0)
    end
    for _,key in ipairs({'card','tray'}) do
        if s[key] and DoesEntityExist(s[key]) then DeleteEntity(s[key]) end
        s[key]=nil
    end
    for _,hash in ipairs(s.models) do SetModelAsNoLongerNeeded(hash) end
    if s.dict then RemoveAnimDict(s.dict) end
    if active==s then active=nil end
end
local function valid(s)
    return not s.cancelled and not stopped and PlayerPedId()==s.ped
        and DoesEntityExist(s.body) and DoesEntityExist(s.ped)
        and not IsEntityDead(s.ped) and not IsPedRagdoll(s.ped)
        and not IsPedInAnyVehicle(s.ped,false) and GetEntitySpeed(s.ped)<.35
        and GetResourceState('peak-duo-prop')=='started'
end
local function model(name,s)
    local hash=GetHashKey(name)
    if not IsModelInCdimage(hash) or not IsModelValid(hash) then return nil end
    s.models[#s.models+1]=hash;RequestModel(hash);local start=GetGameTimer()
    while not HasModelLoaded(hash) do
        if not valid(s) or elapsed(start)>2000 then return nil end
        Wait(0)
    end
    local p=GetEntityCoords(s.ped);local obj=CreateObjectNoOffset(hash,p.x,p.y,p.z,false,false,false)
    if not obj or obj==0 then return nil end
    SetEntityAsMissionEntity(obj,true,true);SetEntityCollision(obj,false,false)
    return obj
end
local function play(s,p,sex)
    s.dict='peak_sim_'..sex
    s.clip=s.dict..'_'..s.operation..(s.expanded and '_open' or '_closed')
    RequestAnimDict(s.dict);local start=GetGameTimer()
    while not HasAnimDictLoaded(s.dict) do
        if not valid(s) or elapsed(start)>2000 then return false,'animation-unavailable' end
        Wait(0)
    end
    s.tray=model('peak_sim_tray',s);if not s.tray then return false,'tray-unavailable' end
    s.card=model('peak_sim_card',s);if not s.card then return false,'card-unavailable' end
    attach(s.card,s.tray,-1,{0,0,0},{0,0,0},false)
    TaskPlayAnim(s.ped,s.dict,s.clip,4.0,4.0,-1,50,1.0,false,false,false)
    start=GetGameTimer();local last=-1;local progressed=GetGameTimer()
    while valid(s) do
        local playing=IsEntityPlayingAnim(s.ped,s.dict,s.clip,3)
        if not playing and elapsed(start)>250 then return false,'animation-interrupted' end
        local phase=playing and GetEntityAnimCurrentTime(s.ped,s.dict,s.clip) or 0
        if phase<last-.05 then return false,'animation-restarted' end
        if phase>last+.0001 then progressed=GetGameTimer();last=phase end
        if elapsed(start)>4000 or elapsed(progressed)>700 then return false,'animation-timeout' end
        local t=phase*3
        local inHand=(s.operation=='insert' and t<.8) or (s.operation=='remove' and t>1.9)
        if inHand then
            local h=p.trayHandAttachment
            attach(s.tray,s.ped,GetPedBoneIndex(s.ped,h.bone),h.position,h.rotation,true)
        else
            local stroke=smooth((t-1.15)/.75)
            local travel=.022*(s.operation=='insert' and (1-stroke) or stroke)
            attach(s.tray,s.body,-1,{-.024,0,-.06905-travel},{0,0,0},false)
        end
        if phase>=.995 then return true,'preview-complete' end
        Wait(0)
    end
    return false,'cancelled'
end
exports('IsBusy',function() return active~=nil end)
exports('Cancel',function() if active then active.cancelled=true end end)
exports('GetProfile',function(ped) return profile(ped) end)
exports('Preview',function(body,operation,expanded)
    if GetConvarInt('peak_sim_preview',0)~=1 then return false,'preview-disabled' end
    if active then return false,'busy' end
    if operation~='insert' and operation~='remove' then return false,'invalid-operation' end
    if type(expanded)~='boolean' then return false,'invalid-fold-state' end
    local ped=PlayerPedId();local p,sex=profile(ped)
    if not p then return false,'unsupported-ped' end
    if not DoesEntityExist(body) or GetEntityModel(body)~=GetHashKey('peak_duo_body') then return false,'wrong-phone-model' end
    local s={body=body,ped=ped,operation=operation,expanded=expanded,models={}};active=s
    if not valid(s) then clean(s);return false,'invalid-state' end
    local ok,result,reason=xpcall(function() return play(s,p,sex) end,debug.traceback)
    clean(s)
    if not ok then print('[Peak SIM preview] '..tostring(result));return false,'preview-error' end
    return result,reason
end)
exports('Play',function(body,operation,expanded)
    if active then return false,'busy' end
    if operation~='insert' and operation~='remove' then return false,'invalid-operation' end
    if type(expanded)~='boolean' then return false,'invalid-fold-state' end
    local ped=PlayerPedId();local p,sex=profile(ped)
    if not p then return false,'unsupported-ped' end
    if not DoesEntityExist(body) or GetEntityModel(body)~=GetHashKey('peak_duo_body') then return false,'wrong-phone-model' end
    local s={body=body,ped=ped,operation=operation,expanded=expanded,models={}};active=s
    if not valid(s) then clean(s);return false,'invalid-state' end
    local ok,result,reason=xpcall(function() return play(s,p,sex) end,debug.traceback)
    clean(s)
    if not ok then print('[Peak SIM] '..tostring(result));return false,'animation-error' end
    return result,reason
end)
AddEventHandler('onClientResourceStop',function(name)
    if name==GetCurrentResourceName() then stopped=true;if active then active.cancelled=true;clean(active) end end
end)
