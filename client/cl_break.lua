Phone.Break={busy=false,opened=false,generation=0}
local B=Phone.Break
local objects,pieces={},{}
local controls={24,25,37,44,21,22,23,30,31,38,200,244}
local function erase(object)
    if object and DoesEntityExist(object) then DeleteEntity(object) end
end
local function cleanup()
    B.generation=B.generation+1
    for hash in pairs(B.models or {}) do SetModelAsNoLongerNeeded(hash) end;B.models={}
    for _,object in ipairs(objects) do erase(object) end
    objects={};pieces={}
    if B.dict then
        if B.ped and DoesEntityExist(B.ped) then StopAnimTask(B.ped,B.dict,B.clip or '',4.0) end
        RemoveAnimDict(B.dict)
    end
    if B.expression and B.ped and DoesEntityExist(B.ped) then ClearFacialIdleAnimOverride(B.ped) end
    SetNuiFocus(false,false);SendNUIMessage({Action='PhoneBreak/Close'})
    B.busy=false;B.opened=false;B.dict=nil;B.ped=nil;B.expression=nil
    LocalPlayer.state:set('peakPhoneBreaking',false,false)
end
local function load(kind,name)
    local request,loaded=kind=='anim' and RequestAnimDict or RequestModel,kind=='anim' and HasAnimDictLoaded or HasModelLoaded
    if kind=='model' then B.models=B.models or {};B.models[name]=true end
    request(name);local limit=GetGameTimer()+8000
    while not loaded(name) and GetGameTimer()<limit do Wait(25) end
    return loaded(name)
end
local function attach(object,parent,bone,profile)
    local p,r=profile.Position,profile.Rotation
    AttachEntityToEntity(object,parent,bone,p[1],p[2],p[3],r[1],r[2],r[3],false,false,false,true,2,true)
end
local function prop(name,parent,bone,profile)
    local hash=joaat(name);local pos=GetEntityCoords(B.ped)
    if not HasModelLoaded(hash) then error('A phone break model was unloaded.') end
    local object=CreateObject(hash,pos.x,pos.y,pos.z,true,true,false)
    if object==0 then error('A phone break model could not be created.') end
    objects[#objects+1]=object;SetEntityCollision(object,false,false)
    attach(object,parent,bone,profile);return object
end
local function expression(name)
    B.expression=true;SetFacialIdleAnimOverride(B.ped,name,0)
end
local function protect()
    for _,control in ipairs(controls) do DisableControlAction(0,control,true) end
end
local function viable()
    local ped=PlayerPedId();local data=Peak.Functions.GetPlayerData();local meta=data and data.metadata or {}
    return (not B.ped or ped==B.ped) and not IsEntityDead(ped) and not IsPedRagdoll(ped)
        and not IsPedInAnyVehicle(ped,false) and not meta.ishandcuffed and not meta.isdead
end
local function waitSafe(ms)
    local endAt,generation=GetGameTimer()+ms,B.generation
    while GetGameTimer()<endAt do if not B.busy or B.generation~=generation or not viable() then return false end;protect();Wait(0) end
    return true
end
local function play(phase,loop)
    B.clip='peak_break_v2_'..B.sex..'_'..phase
    -- Full-body clips carry the planted feet, pelvis, spine and facial tracks.
    TaskPlayAnim(B.ped,B.dict,B.clip,6.0,-6.0,-1,loop and 1 or 2,0,false,false,false)
end
local function timeline(phase,cues)
    play(phase,false)
    local duration=PhoneBreakTiming.Durations[phase];local start,generation=GetGameTimer(),B.generation;local nextCue=1;local seen=false
    while GetGameTimer()-start<duration+1800 do
        if not B.busy or B.generation~=generation or not viable() then return false end
        protect()
        if IsEntityPlayingAnim(B.ped,B.dict,B.clip,3) then
            seen=true
            local time=GetEntityAnimCurrentTime(B.ped,B.dict,B.clip)*duration
            -- Read the animation playhead: late frames still run every crossed cue.
            while cues and cues[nextCue] and time>=cues[nextCue].at do cues[nextCue].run();nextCue=nextCue+1 end
            if time>=duration-35 then return not cues or nextCue>#cues end
        elseif seen or GetGameTimer()-start>1000 then return false end
        Wait(0)
    end
    return false
end
local function caption(stage)
    SendNUIMessage({Action='PhoneBreak/Stage',Stage=stage})
end
local function replace(side,stage)
    erase(pieces[side]);local hand=side=='right' and 57005 or 18905;local profile=PhoneBreakProfiles[B.sex][side=='right' and 'Right' or 'Left']
    pieces[side]=prop('peak_duo_v2_'..side..'_'..stage,B.ped,GetPedBoneIndex(B.ped,hand),profile)
end
local function bridge(length)
    erase(pieces.bridge)
    pieces.bridge=prop('peak_duo_v2_bridge_'..length,pieces.right,0,{Position={.039,.0045,0},Rotation={0,0,-33.231552}})
end
exports('InventoryBreak',function(slot)
    if B.busy or IsPhoneOpen or IsNuiFocused() or not viable() then return {Success=false,Error='Close the phone and stand on foot to break it.'} end
    B.generation=B.generation+1;local generation=B.generation
    B.busy=true;B.ped=PlayerPedId();LocalPlayer.state:set('peakPhoneBreaking',true,false)
    local token,committed,profile
    local ok,result=xpcall(function()
        local answer=lib.alertDialog({header='Break your Peak Duo?',content='You will destroy this phone. It will need repair in DigitanDen.',centered=true,cancel=true,labels={confirm='Yes, break it',cancel='No'}})
        if answer~='confirm' then return {Success=false,Error='Cancelled.'} end
        if B.generation~=generation then return {Success=false,Error='Cancelled.'} end
        B.sex=GetEntityModel(B.ped)==joaat('mp_f_freemode_01') and 'female' or 'male';B.dict='peak_break_v2_'..B.sex
        if not load('anim',B.dict) then return {Success=false,Error='The phone break animation could not load.'} end
        for phase in pairs(PhoneBreakTiming.Durations) do
            if GetAnimDuration(B.dict,'peak_break_v2_'..B.sex..'_'..phase)<=0 then return {Success=false,Error='The phone break animation is incomplete.'} end
        end
        for _,side in ipairs({'right','left'}) do for _,stage in ipairs({'clean','stress','tear','broken'}) do
            if not load('model',joaat('peak_duo_v2_'..side..'_'..stage)) then return {Success=false,Error='The phone break models could not load.'} end
        end end
        for _,length in ipairs({25,55,95}) do
            if not load('model',joaat('peak_duo_v2_bridge_'..length)) then return {Success=false,Error='The phone flex cable could not load.'} end
        end
        if B.generation~=generation then return {Success=false,Error='Cancelled.'} end
        local prepared=Phone.rpc('peak-phone:break:begin',{Slot=slot})
        if B.generation~=generation then
            if prepared and prepared.Token then pcall(Phone.rpc,'peak-phone:break:cancel',{Token=prepared.Token}) end
            return {Success=false,Error='Cancelled.'}
        end
        if not prepared or not prepared.Success then return prepared or {Success=false,Error='Phone unavailable.'} end
        token=prepared.Token;profile=PhoneBreakProfiles[B.sex]
        CreateThread(function() while B.busy and B.generation==generation do protect();Wait(0) end end)
        replace('right','clean')
        -- Before the support hand grips, both intact halves travel as one phone.
        pieces.left=prop('peak_duo_v2_left_clean',pieces.right,0,{Position={.078,.0045,0},Rotation={0,0,0}})
        expression('mood_stressed_1')
        if not timeline('prepare',{{at=PhoneBreakTiming.Cues.grip,run=function()
            attach(pieces.left,B.ped,GetPedBoneIndex(B.ped,18905),profile.Left)
        end}}) then return {Success=false,Error='Interrupted. Your phone is intact.'} end
        local phase='strain_low';play(phase,true)
        SendNUIMessage({Action='PhoneBreak/Start',Duration=PhoneBreakTiming.Window,Target=PhoneBreakTiming.Target});caption('low')
        local start,last,count=GetGameTimer(),0,0;local pendingPhase
        while GetGameTimer()-start<PhoneBreakTiming.Window do
            local time=GetGameTimer();protect()
            if B.generation~=generation or not B.busy or not viable() or IsDisabledControlJustPressed(0,200) then return {Success=false,Error='Interrupted. Your phone is intact.'} end
            if not IsEntityPlayingAnim(B.ped,B.dict,B.clip,3) and time-start>1000 then return {Success=false,Error='Interrupted. Your phone is intact.'} end
            if count<PhoneBreakTiming.Target and IsDisabledControlJustPressed(0,38) and time-last>=110 then
                last=time;count=count+1;TriggerServerEvent('peak-phone:break:press',token)
                SendNUIMessage({Action='PhoneBreak/Progress',Count=count,Remaining=math.max(0,PhoneBreakTiming.Window-(time-start))})
                if phase=='strain_low' and count>=10 then pendingPhase='strain_mid' elseif phase=='strain_mid' and count>=20 then pendingPhase='strain_high' end
            end
            -- Effort changes on a relaxed loop boundary, avoiding a hand/hinge jump.
            if pendingPhase and phase~=pendingPhase and GetEntityAnimCurrentTime(B.ped,B.dict,B.clip)>.94 then
                phase=pendingPhase;play(phase,true);caption(phase=='strain_high' and 'high' or 'mid')
                if phase=='strain_high' then expression('mood_angry_1') end
            end
            if phase=='strain_mid' and count>=20 then pendingPhase='strain_high' end
            if count>=PhoneBreakTiming.Target and time-start>=PhoneBreakTiming.MinimumEffort then break end
            Wait(0)
        end
        if count<PhoneBreakTiming.Target then return {Success=false,Error='You could not break it. Your phone is intact.'} end
        play('brace',true);caption('brace')
        if not waitSafe(250) then return {Success=false,Error='Interrupted. Your phone is intact.'} end
        local response=Phone.rpc('peak-phone:break:commit',{Token=token});token=nil
        if not response or not response.Success then return response or {Success=false,Error='Phone replacement failed.'} end
        committed=response
        if B.generation~=generation then return committed end
        local C=PhoneBreakTiming.Cues
        if timeline('snap',{
            {at=C.stress,run=function() replace('right','stress');replace('left','stress');caption('stress') end},
            {at=C.tear,run=function() replace('right','tear');replace('left','tear');caption('tear') end},
            {at=C.bridge25,run=function() bridge(25) end},
            {at=C.bridge55,run=function() bridge(55) end},
            {at=C.bridge95,run=function() bridge(95) end},
            {at=C.separate,run=function() erase(pieces.bridge);pieces.bridge=nil;replace('right','broken');replace('left','broken');expression('mood_stressed_1');caption('separate') end}
        }) then
            caption('inspect')
            if timeline('inspect') then
                caption('pocket')
                timeline('pocket',{
                    {at=C.leftPocket,run=function() erase(pieces.left);pieces.left=nil end},
                    {at=C.rightPocket,run=function() erase(pieces.right);pieces.right=nil end}
                })
            end
        end
        return committed
    end,function(err) return tostring(err) end)
    if token then pcall(Phone.rpc,'peak-phone:break:cancel',{Token=token}) end
    if B.generation~=generation then return committed or {Success=false,Error='Cancelled.'} end
    -- Only an uncommitted operation can return the intact device to a pocket.
    if not committed and profile and viable() and B.dict then
        SendNUIMessage({Action='PhoneBreak/Close'});expression('mood_stressed_1')
        pcall(timeline,'abort',{{at=PhoneBreakTiming.Durations.abort*.18,run=function()
            if pieces.left and pieces.right then attach(pieces.left,pieces.right,0,{Position={.078,.0045,0},Rotation={0,0,0}}) end
        end}})
    end
    cleanup()
    if not ok then result=committed or {Success=false,Error='Phone break stopped: '..tostring(result)} end
    if result and result.Error and result.Error~='Cancelled.' then Peak.Functions.Notify(result.Error,'error') end
    return result
end)
function B.tryOpen()
    if B.busy then return true end
    if B.opened then cleanup();return true end
    local ok,result=pcall(Phone.rpc,'peak-phone:break:status',{})
    if not ok or not result or not result.Broken then return false end
    local data=Peak.Functions.GetPlayerData();local meta=data and data.metadata or {}
    if meta.isdead or meta.ishandcuffed then return true end
    B.opened=true;SetNuiFocus(true,true);SendNUIMessage({Action='PhoneBreak/OpenBroken'});return true
end
RegisterNUICallback('PhoneBreak/Close',function(_,cb) if not B.busy then cleanup() end;cb({Success=true}) end)
AddEventHandler('onResourceStop',function(name) if name==GetCurrentResourceName() then cleanup() end end)
RegisterNetEvent('Peak:Client:OnPlayerUnload',cleanup)
