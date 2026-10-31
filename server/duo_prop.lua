-- Cosmetic states only. Player state bags are owner-writable, so we use validated
-- source-bound events and server-origin snapshots instead. No model/entity input.
local C=PhoneDuoPropConfig
local peers, serial, helloAt = {}, 0, {}
local register = Phone.NativeRegisterNetEvent or RegisterNetEvent
local on = Phone.NativeAddEventHandler or AddEventHandler
-- Capture the engine source in a direct handler. The compatibility registration
-- wrapper can lose it before a callback runs and spam a generic phone error.
local function listen(name, handler)
    register(name)
    on(name, function(...)
        local src=tonumber(source)
        if not src or src<0 or not GetPlayerName(src) then return end
        handler(src,...)
    end)
end
local function identity(src)
    local ok, raw = pcall(Phone.rawPlayer, src)
    return ok and Phone.rawIdentity(raw) or nil
end
local broadcast
local function clearOwnerFrames(owner)
    for _,viewer in pairs(peers) do
        local budget=viewer.screenBudget
        if budget then budget.pending[owner]=nil;budget.delivered[owner]=nil;budget.last[owner]=nil end
    end
end
Phone.DuoProp=Phone.DuoProp or {}
function Phone.DuoProp.invalidateIdentity(src,cid)
    src=tonumber(src);local s=src and peers[src]
    if not s or s.identityRevoked or (cid and cid~=s.cid) then return false end
    -- Device/session mutations call this before their delayed client close. Revoke
    -- the old phone generation synchronously so queued and incoming captures stop.
    s.identityRevoked=true;s.deviceGeneration=nil;s.held=false;s.screenFrame=nil;s.version=s.version+1
    if s.screenBudget then s.screenBudget.pending={};s.screenBudget.delivered={};s.screenBudget.last={} end
    clearOwnerFrames(src);broadcast()
    return true
end
local function nextSerial() serial=serial+1; return serial end
local function init(src,cid)
    if peers[src] then clearOwnerFrames(src) end
    local s={token=nextSerial(),cid=cid,revision=-1,held=false,expanded=false,reduced=false,orientation='landscape',simOperation=false,simAt=0,hasSim=false,deviceGeneration=nil,identityRevoked=false,version=0,credit=12,at=GetGameTimer(),packet=0,cache={},screenAt=0,screenSeq=0,screenBudget={credit=131072,at=GetGameTimer(),last={},pending={}}}
    peers[src]=s
    TriggerClientEvent('peak-phone:duoProp:init',src,s.token)
    return s
end
local function snapshot(src, viewer)
    if viewer.identityRevoked then return end
    if identity(src)~=viewer.cid then Phone.DuoProp.invalidateIdentity(src,viewer.cid);return end
    local list, cache = {}, {}
    local bucket=GetPlayerRoutingBucket(src)
    local ped=GetPlayerPed(src)
    if ped==0 then return end
    local here=GetEntityCoords(ped)
    for owner,s in pairs(peers) do
        if owner~=src and s.held then
            if identity(owner)~=s.cid then
                if not s.identityRevoked then Phone.DuoProp.invalidateIdentity(owner,s.cid) end
            else
            if GetPlayerRoutingBucket(owner)==bucket then
            local other=GetPlayerPed(owner)
            if other~=0 and DoesEntityExist(other) and GetEntityHealth(other)>0 then
                local pos=GetEntityCoords(other)
                local dx,dy,dz=here.x-pos.x,here.y-pos.y,here.z-pos.z
                if dx*dx+dy*dy+dz*dz <= (C.Distance+20)^2 then
                    local net=NetworkGetNetworkIdFromEntity(other)
                    cache[owner]=s.token..':'..s.version..':'..net..':'..tostring(s.deviceGeneration)
                    list[#list+1]={owner=owner,generation=s.token,deviceGeneration=s.deviceGeneration,revision=s.version,expanded=s.expanded,reduced=s.reduced,orientation=s.orientation,ped=net,simOperation=s.simOperation,simAt=s.simAt,hasSim=s.hasSim}
                end
            end
            end
            end
        end
    end
    local changed=false
    for k,v in pairs(cache) do if viewer.cache[k]~=v then changed=true;break end end
    if not changed then for k in pairs(viewer.cache) do if cache[k]==nil then changed=true;break end end end
    if not changed then return end
    viewer.cache=cache;viewer.packet=viewer.packet+1
    TriggerClientEvent('peak-phone:duoProp:snapshot',src,viewer.token,viewer.packet,list)
end
 broadcast=function()
    for src,viewer in pairs(peers) do snapshot(src,viewer) end
end
listen('peak-phone:duoProp:hello',function(src)
    local now=GetGameTimer()
    if helloAt[src] and (now-helloAt[src])%4294967296 < 2000 then return end
    helloAt[src]=now
    local cid=identity(src);if not cid then return end
    init(src,cid);broadcast()
end)
listen('peak-phone:duoProp:set',function(src,token,revision,held,expanded,reduced,simOperation,hasSim,orientation,deviceGeneration)
    local s=peers[src]
    if not s or token~=s.token or s.identityRevoked then return end
    if type(revision)~='number' or revision~=revision or revision%1~=0 or revision<0 or revision>2147483646 or revision<s.revision then return end
    if type(held)~='boolean' or type(expanded)~='boolean' or type(reduced)~='boolean' or type(hasSim)~='boolean'
        or type(deviceGeneration)~='number' or deviceGeneration%1~=0 or deviceGeneration<1 then return end
    if (orientation~='landscape' and orientation~='portrait') or (not expanded and orientation~='landscape') then return end
    if simOperation~=false and simOperation~='insert' and simOperation~='remove' then return end
    local now=GetGameTimer();s.credit=math.min(12,s.credit+((now-s.at)%4294967296)*.012);s.at=now
    if s.credit<1 then return end
    s.credit=s.credit-1
    local cid=identity(src)
    if not cid then return end
    if cid~=s.cid then init(src,cid);broadcast();return end
    if s.deviceGeneration~=deviceGeneration then
        local active=Phone.Devices and Phone.Devices.active and Phone.Devices.active(src)
        -- active() can yield through database work. Recheck all source-bound state
        -- after it returns so a replaced peer cannot inherit this authentication.
        if peers[src]~=s or s.token~=token or s.identityRevoked or identity(src)~=cid
            or not active or tonumber(active.Generation)~=deviceGeneration then return end
        s.deviceGeneration=deviceGeneration
    end
    if revision==s.revision then TriggerClientEvent('peak-phone:duoProp:ack',src,s.token,revision);return end
    s.revision=revision
    if not held then s.screenFrame=nil;clearOwnerFrames(src) end
    if s.held~=held or s.expanded~=expanded or s.reduced~=reduced or s.orientation~=orientation or s.simOperation~=simOperation or s.hasSim~=hasSim then
        s.held,s.expanded,s.reduced,s.orientation=held,expanded,reduced,orientation
        if s.simOperation~=simOperation then s.simOperation=simOperation;s.simAt=simOperation and GetGameTimer() or 0 end
        s.hasSim=hasSim
        s.version=s.version+1;broadcast()
    end
    TriggerClientEvent('peak-phone:duoProp:ack',src,s.token,revision)
end)
-- A screen frame is a bounded compressed display tree of the owner's visible display. Source and
-- proximity are checked here; clients cannot choose recipients or impersonate
-- another handset. Only the newest pending frame per owner/viewer is held in
-- memory; frames are never persisted.
local function screenNear(owner,viewer,radius)
    if GetPlayerRoutingBucket(owner)~=GetPlayerRoutingBucket(viewer) then return false end
    local ped,other=GetPlayerPed(owner),GetPlayerPed(viewer)
    if ped==0 or other==0 or not DoesEntityExist(ped) or not DoesEntityExist(other)
        or GetEntityHealth(ped)<=0 or GetEntityHealth(other)<=0 then return false end
    local a,b=GetEntityCoords(ped),GetEntityCoords(other)
    local dx,dy,dz=a.x-b.x,a.y-b.y,a.z-b.z
    return dx*dx+dy*dy+dz*dz<=radius*radius
end
local function drainScreens(now)
    local radius=math.max(0,math.min(20,tonumber(C.ScreenDistance) or 5))
    for viewer,recipient in pairs(peers) do
        local budget=recipient.screenBudget
        budget.delivered=budget.delivered or {}
        if recipient.identityRevoked or identity(viewer)~=recipient.cid then
            if not recipient.identityRevoked then Phone.DuoProp.invalidateIdentity(viewer,recipient.cid) end
            budget.pending={};budget.delivered={};budget.last={}
        else
        if (now-(budget.replayAt or 0))%4294967296>=1000 then
            budget.replayAt=now
            local queued=0;for _ in pairs(budget.pending) do queued=queued+1 end
            for owner,state in pairs(peers) do
                if owner~=viewer then
                    if state.held and identity(owner)~=state.cid then
                        if not state.identityRevoked then Phone.DuoProp.invalidateIdentity(owner,state.cid) end
                        budget.pending[owner]=nil;budget.delivered[owner]=nil
                    else
                    if not state.held or not screenNear(owner,viewer,radius) then
                        budget.delivered[owner]=nil;budget.pending[owner]=nil
                    elseif state.screenFrame and not state.identityRevoked and state.deviceGeneration==state.screenFrame.deviceGeneration and budget.delivered[owner]~=(state.token..':'..state.screenFrame.sequence)
                        and (budget.pending[owner] or queued<16) then
                        if not budget.pending[owner] then queued=queued+1 end
                        budget.pending[owner]=state.screenFrame
                    end
                    end
                end
            end
        end
        budget.credit=math.min(131072,budget.credit+((now-budget.at)%4294967296)*131.072)
        budget.at=now
        for _=1,16 do
            local chosen,entry,oldest
            for owner,candidate in pairs(budget.pending) do
                local state=peers[owner]
                if state and state.held and identity(owner)~=state.cid then
                    if not state.identityRevoked then Phone.DuoProp.invalidateIdentity(owner,state.cid) end
                    budget.pending[owner]=nil;budget.delivered[owner]=nil
                elseif not state or state.identityRevoked or not state.held or state.token~=candidate.token
                    or state.deviceGeneration~=candidate.deviceGeneration or not screenNear(owner,viewer,radius) then
                    budget.pending[owner]=nil
                elseif not state.identityRevoked and state.deviceGeneration==candidate.deviceGeneration and budget.credit>=#candidate.frame and (now-(budget.last[owner] or 0))%4294967296>=250 then
                    local prior=budget.last[owner] or -1
                    if not chosen or prior<oldest or (prior==oldest and owner<chosen) then
                        chosen,entry,oldest=owner,candidate,prior
                    end
                end
            end
            if not chosen then break end
            budget.pending[chosen]=nil;budget.credit=budget.credit-#entry.frame;budget.last[chosen]=now
            budget.delivered[chosen]=entry.token..':'..entry.sequence
            TriggerLatentClientEvent('peak-phone:duoScreen:frame',viewer,131072,chosen,entry.token,entry.sequence,entry.frame,entry.expanded,entry.orientation,entry.deviceGeneration)
        end
        end
    end
end
listen('peak-phone:duoScreen:frame',function(src,token,frame,expanded,sequence,orientation,deviceGeneration)
    local s=peers[src]
    if not s or token~=s.token or s.identityRevoked then return end
    if identity(src)~=s.cid then Phone.DuoProp.invalidateIdentity(src,s.cid);return end
    if not s.held or type(expanded)~='boolean' or expanded~=s.expanded
        or type(deviceGeneration)~='number' or deviceGeneration%1~=0 or deviceGeneration<1 or deviceGeneration~=s.deviceGeneration
        or (orientation~='landscape' and orientation~='portrait') or orientation~=s.orientation then return end
    if type(frame)~='string' or #frame<100 or #frame>65536
        or not frame:match('^duo2:[A-Za-z0-9+/=]+$') then return end
    if sequence~=nil and (type(sequence)~='number' or sequence%1~=0 or sequence<1 or sequence>2147483646 or sequence<=s.screenSeq) then return end
    local now=GetGameTimer()
    if (now-s.screenAt)%4294967296<250 then return end
    local ped=GetPlayerPed(src)
    if ped==0 or not DoesEntityExist(ped) or GetEntityHealth(ped)<=0 then return end
    s.screenAt=now;s.screenSeq=sequence or (s.screenSeq+1)
    s.screenFrame={token=s.token,deviceGeneration=s.deviceGeneration,sequence=s.screenSeq,frame=frame,expanded=expanded,orientation=orientation}
    local radius=math.max(0,math.min(20,tonumber(C.ScreenDistance) or 5))
    for viewer,recipient in pairs(peers) do
        if viewer~=src and screenNear(src,viewer,radius) then
            local pending=recipient.screenBudget.pending
            if pending[src] then pending[src]={token=s.token,deviceGeneration=s.deviceGeneration,sequence=s.screenSeq,frame=frame,expanded=expanded,orientation=orientation}
            else
                local count=0;for _ in pairs(pending) do count=count+1 end
                if count<16 then pending[src]={token=s.token,deviceGeneration=s.deviceGeneration,sequence=s.screenSeq,frame=frame,expanded=expanded,orientation=orientation} end
            end
        end
    end
    drainScreens(now)
end)
CreateThread(function()
    while true do Wait(100);drainScreens(GetGameTimer()) end
end)
on('playerDropped',function() peers[source]=nil;helloAt[source]=nil;broadcast() end)
-- Framework logout in the actual phone is also source-bound. A new generation
-- invalidates any delayed handset updates from the previous character.
listen('peak-phone:duoProp:reset',function(src,token)
    local s=peers[src]
    if s and token==s.token then peers[src]=nil;broadcast() end
end)
local diagnosticAt={}
local screenProbes={}
RegisterCommand('duoprop_screen_probe',function(src)
    if src~=0 or not C.Debug then return end
    local now=GetGameTimer()
    for viewer,state in pairs(peers) do
        screenProbes[viewer]={nonce=now,expires=now+10000,token=state.token}
        print(('[Peak Duo relay] owner=%d held=%s expanded=%s token=%d sequence=%d bytes=%d'):format(
            viewer,tostring(state.held),tostring(state.expanded),state.token,state.screenSeq,state.screenFrame and #state.screenFrame.frame or 0))
        TriggerClientEvent('peak-phone:duoScreen:probe',viewer,now)
    end
end,false)
listen('peak-phone:duoScreen:probeResult',function(src,token,nonce,data)
    local probe=screenProbes[src]
    if not probe or probe.token~=token or probe.nonce~=nonce or GetGameTimer()>probe.expires or type(data)~='table' then return end
    screenProbes[src]=nil
    local function integer(value,max) return type(value)=='number' and value%1==0 and value>=-1 and value<=(max or 2147483646) and value or -1 end
    print(('[Peak Duo relay client] viewer=%d held=%s captured=%d sent=%d remote=%d reassembly=%s'):format(
        src,tostring(data.held==true),integer(data.sequence),integer(data.sent),integer(data.remote,16),data.reassembly=='true' and 'true' or 'other'))
    if type(data.visuals)~='table' then return end
    for i,v in ipairs(data.visuals) do
        if i>17 then break end
        if type(v)=='table' then
            print(('[Peak Duo relay visual] viewer=%d owner=%d generation=%d ready=%s bytes=%d slot=%d texture=%s document=%s rendered=%s body=%s leaf=%s'):format(
                src,integer(v.owner,65535),integer(v.generation),tostring(v.ready==true),integer(v.frameBytes,65536),integer(v.slot,16),
                tostring(v.texture==true),tostring(v.document==true),tostring(v.rendered==true),tostring(v.bodyMesh==true),tostring(v.leafMesh==true)))
        end
    end
end)
listen('peak-phone:duoProp:diagnostic',function(src,token,data)
    if not C.Debug or type(data)~='table' or not peers[src] or peers[src].token~=token then return end
    local now=GetGameTimer()
    if diagnosticAt[src] and (now-diagnosticAt[src])%4294967296<15000 then return end
    diagnosticAt[src]=now
    local function mm(value) return type(value)=='number' and value>=0 and value<=500 and math.floor(value) or -1 end
    local profile=({male=true,female=true,none=true})[data.profile] and data.profile or 'invalid'
    local mode=({hold=true,transition=true,none=true})[data.mode] and data.mode or 'other'
    local attachment=({stock=true,authored=true,fallback=true})[data.attachment] and data.attachment or 'unknown'
    local hand=type(data.handDiagnostic)=='table' and data.handDiagnostic or {}
    local function count(value) return type(value)=='number' and value>=0 and value<100000 and math.floor(value) or -1 end
    print(('[Peak Duo prop] source=%d profile=%s fallback=%s mode=%s attachment=%s clip=%s dictLoaded=%s stockLoaded=%s stock=%s open=%s ready=%s generation=%s ped=%s pending=%s dict=%s requestedClip=%s rightHandGap=%dmm leftHandGap=%dmm body=%dx%dmm'):format(
        src,profile,tostring(data.fallback==true),mode,attachment,tostring(data.holdPlaying==true),
        tostring(data.animLoaded==true),tostring(data.stockLoaded==true),tostring(data.stockPlaying==true),
        tostring(data.phoneOpen==true),tostring(data.clientReady==true),tostring(data.generationMatch==true),
        tostring(data.pedMatch==true),tostring(data.handPending==true),
        tostring(type(data.handDictionary)=='string' and data.handDictionary:sub(1,40) or 'invalid'),
        tostring(type(data.handClip)=='string' and data.handClip:sub(1,40) or 'invalid'),
        mm(data.handGap),mm(data.leftHandGap),mm(data.width),mm(data.length)))
    print(('[Peak Duo hand] source=%d restore=%s sim=%s camera=%s video=%s live=%s stockAttempts=%d blocked=%d requests=%d loads=%d customStarts=%d verified=%d'):format(
        src,tostring(hand.canRestore==true),tostring(hand.simGesture==true),tostring(hand.inCamera==true),
        tostring(hand.videoCamera==true),tostring(hand.liveCamera==true),count(hand.stockAttemptCount),
        count(hand.stockBlockedCount),count(hand.stockRequestCount),count(hand.stockLoadedCount),
        count(hand.customStartCount),count(hand.customVerifiedCount)))
end)
CreateThread(function()
    while true do
        Wait(1000)
        for src,s in pairs(peers) do
            if not GetPlayerName(src) then peers[src]=nil
            elseif identity(src)~=s.cid then init(src,identity(src)) end
        end
        broadcast() -- routing/stream proximity checks; transmits only differences
    end
end)
RegisterCommand('duoprop_calibrate',function(src)
    if src>0 and C.Debug and IsPlayerAceAllowed(src,'peakduo.calibrate') then
        TriggerClientEvent('peak-phone:duoProp:debugPermit',src)
    end
end,false)
