-- One authoritative registry for voice + video. A player cannot be in both at once.
Phone.Calls={sessions={},bySource={},guests={},channels={}}
local function nativeNet(name, handler) Phone.NativeRegisterNetEvent(name); Phone.NativeAddEventHandler(name, handler) end
local C=Phone.Calls
local function videoAudioMode() return PhoneConfig.Video.AudioMode=='webrtc' and 'webrtc' or 'voice' end
local function liveBusy(a,b)
    local live=Phone.KiloLive
    return live and live.bySource and (live.bySource[a] or live.bySource[b])
end
local function alive(member)
    if not member or not Phone.sameCharacter(member.src,member.cid) or not Phone.hasPhone(member.src) then return false end
    local raw=Phone.rawPlayer(member.src);local meta=raw and ((raw.PlayerData and raw.PlayerData.metadata) or raw.metadata) or {}
    if raw and not raw.PlayerData and type(raw.getMeta)=='function' then
        local ok,value=pcall(raw.getMeta);if ok and type(value)=='table' then meta=value end
    end
    return not meta.isdead and not meta.ishandcuffed and IsNetworkEnabled~=false
end
local function peer(call,src) return src==call.a.src and call.b or call.a end
function C.member(src,id)
    if type(id)~='string' then return nil end
    local call=C.sessions[id]
    if not call or C.bySource[src]~=id then return nil end
    local member=call.a.src==src and call.a or (call.b.src==src and call.b)
    if not member or not Phone.sameCharacter(src,member.cid) then return nil end
    return call,member,peer(call,src)
end
local function state(call,member)
    local other=peer(call,member.src)
    return {CallId=call.id,Caller=call.a.src,Target=call.b.src,Peer=other.src,Phone=other.number,
        CallerPhone=call.a.number,TargetPhone=call.b.number,CallerName=call.a.name,TargetName=call.b.name,
        ContactName=member.contact,Incoming=member.src==call.b.src,Dialing=call.status=='ringing',
        Status=call.status,Kind=call.kind,Speaker=member.speaker==true,StartedAt=call.startedAt,
        Muted=member.muted==true,PeerMuted=other.muted==true,PeerCameraEnabled=other.camera~=false,
        AudioMode=call.kind=='video' and videoAudioMode() or 'voice'}
end
function C.publish(call)
    for _,member in ipairs({call.a,call.b}) do
        if Phone.sameCharacter(member.src,member.cid) then
            TriggerClientEvent('peak-phone:Client:SetCallData',member.src,state(call,member))
            if call.kind=='video' then TriggerClientEvent('peak-phone:portable:videoState',member.src,state(call,member)) end
        end
    end
end
local function voiceSet(src,channel)
    if not Phone.started(PhoneConfig.VoiceResource) then return false end
    local ok,result=pcall(function() return exports[PhoneConfig.VoiceResource]:setPlayerCall(src,channel) end)
    -- pma-voice returns nil on success; an adapter may explicitly reject with false.
    return ok and result~=false
end
local function clearVoice(src,channel)
    if GetPlayerName(src) and Player(src).state.callChannel==channel then voiceSet(src,0) end
end
local function history(call)
    for _,member in ipairs({call.a,call.b}) do
        local other=peer(call,member.src)
        PhoneDB.query('INSERT INTO phone_calls(citizenid,phone,contact,incoming,timestamp,session_id,status) VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE status=VALUES(status)',
            {member.cid,other.number,member.contact,member.src==call.b.src and 1 or 0,call.createdAt,call.id,call.startedAt and 'completed' or (call.status=='ringing' and 'missed' or 'failed')})
        if Phone.sameCharacter(member.src,member.cid) then TriggerClientEvent('peak-phone:Client:AddCall',member.src,{Phone=other.number,Contact=member.contact,Incoming=member.src==call.b.src,Timestamp=call.createdAt,Status=call.status}) end
    end
end
function C.stop(id,reason)
    local call=C.sessions[id];if not call or call.ending then return end
    call.ending=true;C.sessions[id]=nil
    C.bySource[call.a.src]=nil;C.bySource[call.b.src]=nil
    if call.channel then
        C.channels[call.channel]=nil
        clearVoice(call.a.src,call.channel);clearVoice(call.b.src,call.channel)
        for src,guest in pairs(C.guests) do if guest.call==id then clearVoice(src,call.channel);C.guests[src]=nil end end
    end
    for _,member in ipairs({call.a,call.b}) do
        if Phone.RTC then Phone.RTC.revoke(id,member.src) end
        if Phone.sameCharacter(member.src,member.cid) then
            TriggerClientEvent('peak-phone:Client:SetCallData',member.src,nil,id,reason or 'Call ended')
            TriggerClientEvent('peak-phone:portable:rtcStop',member.src,id,reason or 'Call ended')
            TriggerClientEvent('peak-phone:portable:ring',member.src,false,false,call.id)
            TriggerClientEvent('peak-phone:Client:RemoveNotification',member.src,'contacts-dial-'..id)
            TriggerClientEvent('peak-phone:Client:RemoveNotification',member.src,'facetime-'..id)
            Player(member.src).state:set('phoneCall',nil,true)
        end
    end
    CreateThread(function() local ok,err=pcall(history,call);if not ok then print('[Peak Duo] Call history could not be saved: '..tostring(err)) end end)
end
function C.stopFor(src,reason) local id=C.bySource[tonumber(src)];if id then C.stop(id,reason) end end
function C.stopAll(reason) local ids={};for id in pairs(C.sessions) do ids[#ids+1]=id end;for _,id in ipairs(ids) do C.stop(id,reason) end end
function IsCallOngoingByPhone(number)
    number=Phone.phone(number)
    for _,call in pairs(C.sessions) do if call.a.number==number or call.b.number==number then return true end end
    return false
end
exports('IsCallOngoingByPhone',IsCallOngoingByPhone)
local function clearGuest(src)
    local guest=C.guests[src]
    if guest then clearVoice(src,guest.channel);C.guests[src]=nil end
end
local function freeChannel()
    for _=1,30 do
        local n=math.random(1000000,2147483646);local taken=C.channels[n]
        for _,src in ipairs(GetPlayers()) do if Player(tonumber(src)).state.callChannel==n then taken=true;break end end
        if not taken then return n end
    end
end
function C.start(src,number,kind)
    if type(number)=='table' then number=number.Number end
    number=Phone.phone(number);kind=kind=='video' and 'video' or 'voice'
    if not number or not Phone.rate(src,'dial',2,5000) then return Phone.publicError('Invalid number or too many calls. Try again shortly.') end
    local needsVoice=kind=='voice' or (kind=='video' and videoAudioMode()=='voice')
    if needsVoice and (not Phone.started(PhoneConfig.VoiceResource) or GetConvarInt('voice_enableCalls',1)~=1) then return Phone.publicError('Voice service is not available.') end
    if kind=='video' and (not PhoneConfig.Video.Enabled or (PhoneConfig.Video.RequireTURN and (not Phone.RTC or not Phone.RTC.configured()))) then return Phone.publicError('Video relay is not configured. Ask an administrator to run phone_doctor.') end
    local a=Phone.getPlayer(src);local target=GetSourceByPhoneNumber(number)
    local b=target and Phone.getPlayer(target)
    if not a or not b or src==target then return Phone.publicError('This number is unavailable.') end
    local ac,bc=a.PlayerData.citizenid,b.PlayerData.citizenid
    return Phone.withLocks({'call:'..src,'call:'..target},function()
        if C.bySource[src] or C.bySource[target] then return Phone.publicError('One of the phones is busy.') end
        -- A call must not silently take over a broadcaster's camera or audio.
        if liveBusy(src,target) then return Phone.publicError('Leave the KiloGram live before starting a call.') end
        if not Phone.sameCharacter(src,ac) or not Phone.sameCharacter(target,bc) then return Phone.publicError('Character changed.') end
        clearGuest(src);clearGuest(target)
        if (tonumber(Player(src).state.callChannel) or 0)~=0 or (tonumber(Player(target).state.callChannel) or 0)~=0 then return Phone.publicError('Another resource is already using a call channel.') end
        local call={id=Phone.token(),kind=kind,status='ringing',createdAt=os.time()*1000,created=GetGameTimer(),ready={},connected={},signalCount={},offerPending=false,restarts=0}
        call.a={src=src,cid=ac,number=a.PlayerData.charinfo.phone,name=Phone.trim(a.PlayerData.charinfo.firstname..' '..a.PlayerData.charinfo.lastname)}
        call.b={src=target,cid=bc,number=b.PlayerData.charinfo.phone,name=Phone.trim(b.PlayerData.charinfo.firstname..' '..b.PlayerData.charinfo.lastname)}
        if not alive(call.a) or not alive(call.b) then return Phone.publicError('A phone is unavailable or the network is offline.') end
        call.a.contact=GetContactName(ac,call.b.number);call.b.contact=GetContactName(bc,call.a.number)
        if not alive(call.a) or not alive(call.b) then return Phone.publicError('Call could not be started.') end
        -- Contact lookup can yield; a live may have reserved either player meanwhile.
        if liveBusy(src,target) then return Phone.publicError('Leave the KiloGram live before starting a call.') end
        C.sessions[call.id]=call;C.bySource[src]=call.id;C.bySource[target]=call.id
        local prefix=kind=='video' and 'facetime-' or 'contacts-dial-'
        local icon=kind=='video' and 'fas fa-video' or 'fas fa-phone-alt'
        for _,member in ipairs({call.a,call.b}) do
            TriggerClientEvent('peak-phone:Client:Notification',member.src,prefix..call.id,icon,{'white','#029587'},member.contact,
                member.src==src and 'Calling…' or (kind=='video' and 'Incoming video call' or 'Incoming call'),false,false,
                member.src==target and 'peak-phone:Server:Contacts:AnswerContact' or nil,'peak-phone:Server:Contacts:DeclineCall',{HideOnAction=false,CallId=call.id})
            TriggerClientEvent('peak-phone:portable:ring',member.src,true,member.src==target,call.id)
            Player(member.src).state:set('phoneCall',kind,true)
        end
        C.publish(call)
        CreateThread(function()
            for _,m in ipairs({call.a,call.b}) do
                local other=peer(call,m.src)
                pcall(PhoneDB.query,'INSERT IGNORE INTO phone_calls(citizenid,phone,contact,incoming,timestamp,session_id,status) VALUES (?,?,?,?,?,?,?)',{m.cid,other.number,m.contact,m.src==call.b.src and 1 or 0,call.createdAt,call.id,'started'})
            end
        end)
        return {Success=true,CallId=call.id}
    end)
end
function C.answer(src,id)
    local call=C.member(src,id)
    if not call or call.b.src~=src or call.status~='ringing' then return false end
    if not alive(call.a) or not alive(call.b) then C.stop(id,'Phone unavailable');return false end
    -- A different resource may have acquired voice while this phone was ringing.
    for _,m in ipairs({call.a,call.b}) do
        if (tonumber(Player(m.src).state.callChannel) or 0)~=0 then
            C.stop(id,'Another resource is already using a call channel.');return false
        end
    end
    -- Change state before calling exports or making any async requests.
    call.status=call.kind=='video' and 'negotiating' or 'active';call.answered=GetGameTimer()
    local usesVoice=call.kind=='voice' or (call.kind=='video' and videoAudioMode()=='voice')
    if usesVoice then
        call.channel=freeChannel()
        if not call.channel then C.stop(id,'No voice channel available');return false end
        C.channels[call.channel]=id
        for _,m in ipairs({call.a,call.b}) do
            if not voiceSet(m.src,call.channel) then C.stop(id,'Voice service failed');return false end
            -- A custom voice adapter can yield. Do not publish or start media for
            -- a call that was cancelled while its export was awaiting a result.
            if C.sessions[id]~=call or call.ending then
                clearVoice(call.a.src,call.channel);clearVoice(call.b.src,call.channel);return false
            end
            if not alive(call.a) or not alive(call.b) then C.stop(id,'Phone unavailable');return false end
        end
        if call.kind=='voice' then call.startedAt=os.time()*1000 end
    end
    for _,member in ipairs({call.a,call.b}) do
        TriggerClientEvent('peak-phone:portable:ring',member.src,false,false,call.id)
        TriggerClientEvent('peak-phone:Client:RemoveNotification',member.src,(call.kind=='video' and 'facetime-' or 'contacts-dial-')..id)
        if call.kind=='voice' then
            TriggerClientEvent('peak-phone:Client:Notification',member.src,'contacts-dial-'..id,'fas fa-phone-alt',{'white','#029587'},member.contact,nil,true,false,nil,
                'peak-phone:Server:Contacts:DeclineCall',{HideOnAction=false,CallId=id,HasSpeaker=PhoneConfig.AllowSpeakerGuests==true,SpeakerEnabled=false})
        else
            TriggerClientEvent('peak-phone:portable:rtcStart',member.src,{CallId=id,Peer=peer(call,member.src).src,Initiator=member.src==call.a.src,ContactName=member.contact})
        end
    end
    C.publish(call);return true
end
RegisterNetEvent('peak-phone:Server:DialContact',function(data)
    local src=source;local result=C.start(src,type(data)=='table' and data.Phone,'voice')
    if not result.Success then Phone.notify(src,result.Msg,'error') end
end)
RegisterNetEvent('peak-phone:Server:Contacts:AnswerContact',function(data) if type(data)=='table' then C.answer(source,data.CallId) end end)
RegisterNetEvent('peak-phone:Server:Contacts:DeclineCall',function(data)
    if type(data)=='table' and C.member(source,data.CallId) then C.stop(data.CallId,'Call ended') end
end)
RegisterNetEvent('peak-phone:Server:Contacts:ToggleSpeaker',function(data)
    if type(data)~='table' then return end
    local call,member=C.member(source,data.CallId)
    if PhoneConfig.AllowSpeakerGuests~=true or not call or call.kind~='voice' or call.status~='active' or type(data.Enabled)~='boolean' then return end
    member.speaker=data.Enabled;C.publish(call)
    TriggerClientEvent('peak-phone:Client:UpdateNotification',source,'contacts-dial-'..call.id,false,false,nil,nil,false,false,true,member.speaker)
end)
-- Native call controls share the same authorization as notification/keybind controls.
Peak.Functions.CreateCallback('peak-phone:Server:Calls:State',function(src,cb)
    local call,who=C.member(src,C.bySource[src])
    cb({Success=true,Data=call and state(call,who) or false})
end)
Peak.Functions.CreateCallback('peak-phone:Server:Calls:Dial',function(src,cb,data)
    cb(C.start(src,type(data)=='table' and data.Phone,'voice'))
end)
Peak.Functions.CreateCallback('peak-phone:Server:Calls:Mute',function(src,cb,data)
    local call,who=C.member(src,type(data)=='table' and data.CallId)
    if not call or call.status=='ringing' or type(data.Muted)~='boolean' then return cb({Success=false,Msg='This call is no longer active.'}) end
    if not Phone.rate(src,'call-mute',8,1000) then return cb({Success=false,Msg='Please wait before changing mute again.'}) end
    who.muted=data.Muted;C.publish(call);cb({Success=true,Muted=who.muted})
end)
nativeNet('peak-phone:portable:callHeartbeat',function(id)
    local src=tonumber(source);local call=C.member(src,id)
    if not call or not Phone.rate(src,'call-heartbeat',2,3000) then return end
    call.uiHeartbeat=call.uiHeartbeat or {};call.uiHeartbeat[src]=GetGameTimer()
end)
nativeNet('peak-phone:portable:callCameraState',function(id,enabled)
    local src=tonumber(source);local call,who=C.member(src,id)
    if not call or call.kind~='video' or call.status=='ringing' or type(enabled)~='boolean' or not Phone.rate(src,'call-camera',12,1000) then return end
    if who.camera~=enabled then who.camera=enabled;C.publish(call) end
end)
Peak.Functions.CreateCallback('peak-phone:Server:Calls:GetCalls',function(src,cb)
    local p=Phone.getPlayer(src);if not p then return cb({}) end
    local rows=PhoneDB.query('SELECT c.*,p.avatar FROM phone_calls c LEFT JOIN phone_profiles p ON p.phone=c.phone WHERE c.citizenid=? ORDER BY c.timestamp DESC,c.id DESC LIMIT 100',{p.PlayerData.citizenid})
    for _,r in ipairs(rows) do r.Incoming=tonumber(r.incoming)==1;r.Phone=r.phone;r.Contact=r.contact;r.Timestamp=tonumber(r.timestamp);r.Avatar=r.avatar;r.Status=r.status end
    cb(rows)
end)
-- Historical clients can refresh, but cannot forge history entries.
Peak.Functions.CreateCallback('peak-phone:Server:Calls:AddCall',function(_,cb) cb(false) end)
Phone.NativeAddEventHandler('playerDropped',function() C.stopFor(tonumber(source),'Player disconnected');clearGuest(tonumber(source)) end)
Phone.NativeAddEventHandler('onResourceStop',function(name) if name==GetCurrentResourceName() or name==PhoneConfig.VoiceResource then C.stopAll('Phone service stopped') end end)
local function refreshSpeakers()
    local desired={}
    for id,call in pairs(C.sessions) do
        if PhoneConfig.AllowSpeakerGuests==true and call.kind=='voice' and call.status=='active' then
            local count=0
            for _,s in ipairs(GetPlayers()) do
                local src=tonumber(s)
                if not C.bySource[src] and count<8 then
                    local channel=tonumber(Player(src).state.callChannel) or 0
                    local old=C.guests[src]
                    if channel==0 or (old and old.call==id and channel==call.channel) then
                        local speaker=false
                        for _,member in ipairs({call.a,call.b}) do
                            if member.speaker and Phone.nearPlayers and Phone.nearPlayers(src,member.src,math.min(tonumber(Config.SpeakerProximityRange) or 5,8)) then speaker=true;break end
                        end
                        if speaker and not desired[src] then
                            desired[src]={call=id,channel=call.channel};count=count+1
                        end
                    end
                end
            end
        end
    end
    for src,g in pairs(C.guests) do if not desired[src] or desired[src].call~=g.call then clearVoice(src,g.channel);C.guests[src]=nil end end
    for src,g in pairs(desired) do if not C.guests[src] and voiceSet(src,g.channel) then C.guests[src]=g end end
end
CreateThread(function()
    while true do
        Wait(1000)
        local stale={};local now=GetGameTimer()
        for id,call in pairs(C.sessions) do
            local ok,available=pcall(function() return alive(call.a) and alive(call.b) end)
            if not ok or not available then stale[#stale+1]={id,'Phone unavailable'}
            elseif call.status=='ringing' and now-call.created>PhoneConfig.CallRingSeconds*1000 then stale[#stale+1]={id,'No answer'}
            elseif call.kind=='voice' and call.status=='active' and (now-((call.uiHeartbeat or {})[call.a.src] or call.answered)>35000 or now-((call.uiHeartbeat or {})[call.b.src] or call.answered)>35000) then stale[#stale+1]={id,'Call interface stopped responding'}
            elseif call.status=='negotiating' and now-call.answered>(PhoneConfig.Video.ConnectionTimeout+10)*1000 then stale[#stale+1]={id,'Video connection timed out'}
            elseif call.answered and now-call.answered>PhoneConfig.CallMaxSeconds*1000 then stale[#stale+1]={id,'Maximum call duration reached'} end
        end
        for _,v in ipairs(stale) do C.stop(v[1],v[2]) end
        local ok,err=pcall(refreshSpeakers);if not ok and PhoneConfig.Debug then print('[Peak Duo] Speaker update: '..tostring(err)) end
    end
end)
