-- Server owns discovery, consent, phase timing and the eventual gallery write.
local enabled, sessions, occupied, cooldown = {}, {}, {}, {}
local ANIMATION_DURATION_MS, ANIMATION_START_DELAY_MS = 3200, 800
local MIN_COMPLETION_MS = ANIMATION_DURATION_MS + ANIMATION_START_DELAY_MS
local TIMER_WRAP = 4294967296
-- Capture source before framework/device checks can yield. Phase events have
-- their own session, identity, proximity and consent checks below.
local function listen(name,fn)
    local register,on=Phone.NativeRegisterNetEvent or RegisterNetEvent,Phone.NativeAddEventHandler or AddEventHandler
    register(name)
    on(name,function(...)
        local src=tonumber(source)
        if not src or src<0 or not GetPlayerName(src) then return end
        if Phone.rate and not Phone.rate(src,name,12,1000) then return end
        fn(src,...)
    end)
end
local function actor(src)
    -- Do not build the full projected phone player here: projection can yield
    -- while profile/device state loads, which is unsafe in the final liveness
    -- guard immediately before persistence.
    local ok,raw=pcall(Phone.rawPlayer,src)
    if not ok or not raw then return nil end
    local identityOk,cid=pcall(Phone.rawIdentity,raw)
    return identityOk and cid or nil
end
local function eligible(src)
    return actor(src) and Phone.hasPhone(src) and enabled[src]==actor(src) and GetPlayerPed(src)~=0
end
local function unlocked(src)
    if not Phone.Devices or not Phone.Devices.active then return true end
    local device=Phone.Devices.active(src)
    return device and not device.Locked and device.Status=='active'
end
local function near(a,b,max)
    return a~=b and GetPlayerRoutingBucket(a)==GetPlayerRoutingBucket(b)
        and GetPlayerPed(a)~=0 and GetPlayerPed(b)~=0
        and #(GetEntityCoords(GetPlayerPed(a))-GetEntityCoords(GetPlayerPed(b)))<=max
end
local function sameCharacter(src,cid)
    local ok,same=pcall(Phone.sameCharacter,src,cid)
    return ok and same==true
end
local function emit(s,phase,extra)
    if PhoneDuoPropConfig and PhoneDuoPropConfig.Debug then
        print(('[ShareDrop] sender=%d receiver=%d phase=%s'):format(s.sender,s.receiver,phase))
    end
    for _,src in ipairs({s.sender,s.receiver}) do
        local expectedCid=src==s.sender and s.senderCid or s.receiverCid
        local ok,cid=pcall(actor,src)
        -- A source ID may now refer to a different character. Never send the
        -- previous character's phase or private photo URL to that client.
        if ok and cid==expectedCid and sameCharacter(src,expectedCid) and GetPlayerName(src) then
            local peer=src==s.sender and s.receiver or s.sender
            TriggerClientEvent('peak-phone:sharedrop:phase',src,{Id=s.id,Phase=phase,Peer=peer,
                Receiver=src==s.receiver,Name=GetPlayerName(peer),Kind=s.kind or 'photo',
                PhotoUrl=s.kind~='location' and s.photo and s.photo.photo_url or nil,
                Location=s.kind=='location' and s.consented and s.location or nil,
                RequestToken=src==s.sender and s.requestToken or nil,Data=extra})
        end
    end
end
local function finish(s,phase)
    if sessions[s.id]~=s then return end
    sessions[s.id]=nil;occupied[s.sender]=nil;occupied[s.receiver]=nil
    emit(s,phase or 'cancelled')
end
local function sessionLive(s,phase,max)
    -- actor() only reads raw identity, but follow it with sameCharacter() so
    -- an adapter lookup that yielded cannot authorize the identity it captured
    -- before a character swap.
    if actor(s.sender)~=s.senderCid or actor(s.receiver)~=s.receiverCid
        or not sameCharacter(s.sender,s.senderCid) or not sameCharacter(s.receiver,s.receiverCid) then return false end
    if not GetPlayerName(s.sender) or not GetPlayerName(s.receiver)
        or enabled[s.sender]~=s.senderCid or enabled[s.receiver]~=s.receiverCid
        or GetPlayerPed(s.sender)==0 or GetPlayerPed(s.receiver)==0 or not near(s.sender,s.receiver,max) then return false end
    -- Raw framework checks may yield. Session and phase membership are the
    -- final checks so a drop, cancellation or phase advance cannot leave an
    -- apparently live stale session.
    return sessions[s.id]==s and s.phase==phase
end
local function requestLive(src,target,senderCid,receiverCid)
    -- The caller runs this only after database, inventory and device checks.
    -- Re-read both identities after those yielding operations, then finish on
    -- synchronous consent, occupancy and world-state checks before registration.
    if actor(src)~=senderCid or actor(target)~=receiverCid
        or not sameCharacter(src,senderCid) or not sameCharacter(target,receiverCid) then return false end
    return GetPlayerName(src) and GetPlayerName(target)
        and enabled[src]==senderCid and enabled[target]==receiverCid
        and not occupied[src] and not occupied[target]
        and near(src,target,5.0) and (cooldown[src] or 0)<=os.time()
end
local function valid(s,max,expectedPhase)
    local phase=expectedPhase or s.phase
    if not sessionLive(s,phase,max) or not eligible(s.sender) or not eligible(s.receiver) then return false end
    if not unlocked(s.sender) or not unlocked(s.receiver) then return false end
    -- Phone inventory and device adapters may yield. Recheck session ownership,
    -- phase, character identity and proximity after all yielding authorization.
    if not eligible(s.sender) or not eligible(s.receiver) then return false end
    return sessionLive(s,phase,max)
end
Peak.Functions.CreateCallback('peak-phone:sharedrop:Enabled',function(src,cb,data)
    if type(data)~='table' or type(data.Enabled)~='boolean' or not actor(src) or not Phone.hasPhone(src) then return cb({Success=false}) end
    enabled[src]=data.Enabled and actor(src) or nil
    local active=occupied[src] and sessions[occupied[src]]
    if active and active.phase~='saving' then finish(active) end
    cb({Success=true,Enabled=enabled[src]~=nil})
end)
Peak.Functions.CreateCallback('peak-phone:sharedrop:Nearby',function(src,cb)
    local list={}
    if eligible(src) and not occupied[src] then
        for _,id in ipairs(GetPlayers()) do
            local target=tonumber(id)
            if eligible(target) and not occupied[target] and near(src,target,5.0) and unlocked(target) then
                list[#list+1]={source=target,name=GetPlayerName(target),distance=math.floor(#(GetEntityCoords(GetPlayerPed(src))-GetEntityCoords(GetPlayerPed(target)))*10)/10}
            end
        end
    end
    cb({Success=true,Players=list})
end)
Peak.Functions.CreateCallback('peak-phone:sharedrop:Request',function(src,cb,data)
    data=type(data)=='table' and data or {}
    local target=Phone.number(data.TargetSource,65535)
    local kind=data.Kind==nil and 'photo' or data.Kind
    local photoId=kind=='photo' and Phone.number(data.PhotoId,2147483647) or nil
    local location=kind=='location' and Phone.locationAttachment(data.Location) or nil
    local requestToken=data.RequestToken
    if not target or (kind=='photo' and not photoId) or (kind=='location' and not location)
        or (kind~='photo' and kind~='location') or type(requestToken)~='string' or #requestToken<1 or #requestToken>128 then
        return cb({Success=false,Error='ShareDrop is unavailable. Both players must enable it and be nearby.'})
    end
    -- Bind this attempt to both characters before any yielding inventory or
    -- device authorization. A later character cannot inherit the request.
    local senderCid,receiverCid=actor(src),actor(target)
    if not senderCid or not receiverCid or not eligible(src) or not eligible(target)
        or actor(src)~=senderCid or actor(target)~=receiverCid or occupied[src] or occupied[target]
        or not near(src,target,5.0) or (cooldown[src] or 0)>os.time() then
        return cb({Success=false,Error='ShareDrop is unavailable. Both players must enable it and be nearby.'})
    end
    local photo
    if kind=='photo' then
        photo=PhoneDB.one('SELECT * FROM phone_photos WHERE id=? AND citizenid=?',{photoId,senderCid})
        if not photo or not Phone.mediaURL(photo.photo_url) then
            return cb({Success=false,Error='Photo or recipient is unavailable.'})
        end
    end
    -- Inventory and device adapters can yield. Do all of them before the final
    -- raw identity/consent/occupancy/bucket check, bound to the captured CIDs.
    if not eligible(src) or not eligible(target) or not unlocked(src) or not unlocked(target)
        or not requestLive(src,target,senderCid,receiverCid) then
        return cb({Success=false,Error='ShareDrop is unavailable. Both players must enable it and be nearby.'})
    end
    cooldown[src]=os.time()+3
    local s={id=Phone.token(),sender=src,receiver=target,senderCid=senderCid,receiverCid=receiverCid,
        kind=kind,photo=photo,location=location,requestToken=requestToken,phase='offer',expires=os.time()+25}
    sessions[s.id]=s;occupied[src]=s.id;occupied[target]=s.id
    emit(s,'offer');cb({Success=true,Id=s.id})
end)
Peak.Functions.CreateCallback('peak-phone:sharedrop:Respond',function(src,cb,data)
    local s=type(data)=='table' and sessions[data.Id]
    if not s or s.receiver~=src or s.phase~='offer' then return cb({Success=false}) end
    if data.Accept~=true or not valid(s,5.0,'offer') then finish(s);return cb({Success=true}) end
    s.consented=true;s.phase='approach';s.expires=os.time()+15;s.ready={};emit(s,'approach');cb({Success=true})
end)
listen('peak-phone:sharedrop:ready',function(src,id,clock)
    local s=type(id)=='string' and sessions[id]
    if not s or (src~=s.sender and src~=s.receiver) or s.phase~='approach' then return end
    if not valid(s,5.0,'approach') then return finish(s) end
    if s.ready[src] then return end
    if type(clock)~='number' or clock~=math.floor(clock) or clock<-2147483648 or clock>4294967295 then return end
    clock=clock%4294967296
    s.ready[src]=clock
    if not s.ready[s.sender] or not s.ready[s.receiver] or not near(s.sender,s.receiver,1.25) then return end
    s.phase='animation';s.expires=os.time()+10;s.started=GetGameTimer();s.done={};s.completionPending=false
    emit(s,'animation',{Start=(clock+ANIMATION_START_DELAY_MS)%TIMER_WRAP,Duration=ANIMATION_DURATION_MS})
end)
local function saveAfterBothAnimations(s)
    if sessions[s.id]~=s or s.phase~='animation' or not s.done[s.sender] or not s.done[s.receiver] or s.completionPending then return end
    s.completionPending=true
    CreateThread(function()
        while sessions[s.id]==s and s.phase=='animation' do
            local elapsed=(GetGameTimer()-s.started)%TIMER_WRAP
            local remaining=MIN_COMPLETION_MS-elapsed
            if remaining<=0 then break end
            Wait(math.min(remaining,500))
        end
        if sessions[s.id]~=s or s.phase~='animation' then return end
        if not valid(s,1.6,'animation') then return finish(s) end
        s.phase='saving'
        local ok,result=pcall(function()
            if s.kind=='location' then
                if type(Phone.sendMessage)~='function' or not valid(s,1.6,'saving') then return false end
                local receiverPhone=Phone.activeNumber(s.receiver)
                local attachment=Phone.locationAttachment(s.location)
                if not receiverPhone or not attachment or not valid(s,1.6,'saving') then return false end
                local sent=Phone.sendMessage(s.sender,{Phone=receiverPhone,Message=attachment.label,
                    Attachments={attachment},OperationId='sharedrop-'..s.id})
                return type(sent)=='table' and sent.Success==true
            end
            return Phone.withLocks({'photos:'..s.receiverCid},function()
                if not valid(s,1.6,'saving') then return false end
                local photo=PhoneDB.one('SELECT id FROM phone_photos WHERE id=? AND citizenid=?',{s.photo.id,s.senderCid})
                local count=PhoneDB.one('SELECT COUNT(*) n FROM phone_photos WHERE citizenid=?',{s.receiverCid})
                if not photo or tonumber(count and count.n or 0)>=PhoneConfig.Media.MaxPhotos
                    or not valid(s,1.6,'saving') or not sessionLive(s,'saving',1.6) then return false end
                local id=PhoneDB.insert('INSERT INTO phone_photos(citizenid,photo_url,timestamp) VALUES(?,?,?)',{s.receiverCid,s.photo.photo_url,os.time()*1000})
                return type(id)=='number' and id>0
            end)
        end)
        if ok and result then
            if sessions[s.id]~=s or s.phase~='saving' then return end
            local receiverOk,receiverCid=pcall(actor,s.receiver)
            if receiverOk and receiverCid==s.receiverCid and GetPlayerName(s.receiver) then
                TriggerClientEvent('peak-phone:Client:Gallery:RefreshPhotos',s.receiver)
            end
            -- finish()/emit() checks each recipient's current character again.
            finish(s,'complete')
        else finish(s,'failed') end
    end)
end
listen('peak-phone:sharedrop:done',function(src,id)
    local s=type(id)=='string' and sessions[id]
    if not s or (src~=s.sender and src~=s.receiver) or s.phase~='animation' then return end
    if s.done[src] then return end
    if not valid(s,1.6,'animation') then return finish(s) end
    s.done[src]=true
    saveAfterBothAnimations(s)
end)
listen('peak-phone:sharedrop:cancel',function(src,id)
    local s=type(id)=='string' and sessions[id]
    if s and (s.sender==src or s.receiver==src) and s.phase~='saving' then finish(s) end
end)
listen('peak-phone:sharedrop:disable',function(src)
    enabled[src]=nil
    local active=occupied[src] and sessions[occupied[src]]
    if active and active.phase~='saving' then finish(active) end
end)
AddEventHandler('playerDropped',function()
    local src=source;local active=occupied[src] and sessions[occupied[src]];if active then finish(active) end
    enabled[src]=nil;cooldown[src]=nil
end)
AddEventHandler('onResourceStop',function(name)
    if name~=GetCurrentResourceName() then return end
    local active={}
    for _,s in pairs(sessions) do active[#active+1]=s end
    for _,s in ipairs(active) do finish(s) end
    enabled={};sessions={};occupied={};cooldown={}
end)
CreateThread(function()
    while true do
        Wait(500)
        for _,s in pairs(sessions) do
            if s.phase~='saving' and (os.time()>=s.expires or not valid(s,s.phase=='animation' and 1.6 or 5.0,s.phase)) then finish(s) end
        end
    end
end)
