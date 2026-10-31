-- Shared voice/video controls. Only the call's own audio adjustments are restored.
-- pma receive mute is call-peer specific, not a global microphone privacy switch.
local audio,closed,closedOrder={},{},{}
Phone.callRevision=0
function Phone.isCallClosed(id) return type(id)=='string' and closed[id]==true end
function Phone.rememberCallClosed(id)
    if type(id)~='string' or closed[id] then return end
    closed[id]=true;closedOrder[#closedOrder+1]=id;Phone.callRevision=Phone.callRevision+1
    if #closedOrder>64 then closed[table.remove(closedOrder,1)]=nil end
end
local function voice() return exports[PhoneConfig.VoiceResource] end
local function capabilities()
    if not Phone.started(PhoneConfig.VoiceResource) then return false,false end
    local mute=pcall(function() voice():isPlayerMuted(GetPlayerServerId(PlayerId())) end)
    local output,value=pcall(function() return voice():getCallVolume() end)
    return mute,output and type(value)=='number'
end
local function preserveMutes()
    -- pma's volume resync also writes muted receivers. Reapply its mute map so a
    -- volume change cannot make a blocked or call-muted person audible again.
    if type(MumbleSetVolumeOverrideByServerId)~='function' then return end
    local ok,muted=pcall(function() return voice():getMutedPlayers() end)
    if ok and type(muted)=='table' then
        for src,isMuted in pairs(muted) do
            if isMuted and tonumber(src) then MumbleSetVolumeOverrideByServerId(tonumber(src),0.0) end
        end
    elseif audio.peer then
        local success,isMuted=pcall(function() return voice():isPlayerMuted(audio.peer) end)
        if success and isMuted then MumbleSetVolumeOverrideByServerId(audio.peer,0.0) end
    end
end
local function restoreMute()
    if audio.ownedMute and audio.peer and Phone.started(PhoneConfig.VoiceResource) then
        pcall(function()
            if voice():isPlayerMuted(audio.peer) then
                voice():toggleMutePlayer(audio.peer)
                -- toggleMutePlayer resets distance attenuation. An ongoing call
                -- must resume its call volume, including when the peer is far away.
                if CallData and CallData.CallId==audio.id and type(MumbleSetVolumeOverrideByServerId)=='function' then
                    local volume=voice():getCallVolume()
                    if type(volume)=='number' then MumbleSetVolumeOverrideByServerId(audio.peer,volume/100) end
                end
            end
        end)
    end
    audio.ownedMute=false
end
function Phone.restoreCallAudio()
    restoreMute()
    if audio.baseVolume~=nil and audio.appliedVolume~=nil and Phone.started(PhoneConfig.VoiceResource) then
        pcall(function()
            -- Preserve an independent volume adjustment from another interface.
            if math.abs(voice():getCallVolume()-audio.appliedVolume)<0.1 then
                voice():setCallVolume(audio.baseVolume);preserveMutes()
            end
        end)
    end
    audio={}
end
function Phone.syncCallAudio(data)
    if not data or (audio.id and audio.id~=data.CallId) then Phone.restoreCallAudio() end
    if not data then return end
    audio.id=data.CallId;audio.peer=tonumber(data.Peer)
    if data.AudioMode~='webrtc' and data.PeerMuted and audio.peer then
        local ok=pcall(function()
            if not voice():isPlayerMuted(audio.peer) then voice():toggleMutePlayer(audio.peer);audio.ownedMute=true end
        end)
        if not ok then SendNUIMessage({Action='Calls/ControlError',Message='The voice adapter does not support call mute.'}) end
    else restoreMute() end
end
function Phone.emitCallState(id,reason)
    local data=CallData
    if data then
        local mute,output=capabilities()
        data.MuteSupported=data.AudioMode=='webrtc' or mute
        data.OutputSupported=data.AudioMode=='webrtc' or output
        data.LocalSpeaker=audio.speaker==true
    end
    SendNUIMessage({Action='Calls/State',Data=data or false,CallId=id or (data and data.CallId),Reason=reason})
end
function Phone.setCallOutput(enabled)
    if not CallData or CallData.Status=='ringing' or CallData.AudioMode=='webrtc' or type(enabled)~='boolean' then
        return {Success=false,Msg='No active game-voice call.'}
    end
    local ok=pcall(function()
        if audio.baseVolume==nil then audio.baseVolume=voice():getCallVolume() end
        assert(type(audio.baseVolume)=='number','Call volume unavailable')
        audio.appliedVolume=enabled and 100 or audio.baseVolume
        voice():setCallVolume(audio.appliedVolume);audio.speaker=enabled;preserveMutes()
    end)
    if not ok then return {Success=false,Msg='Audio output is not supported by this voice adapter.'} end
    Phone.emitCallState();return {Success=true,Speaker=audio.speaker}
end
RegisterNUICallback('Calls/GetState',function(_,cb)
    local revision=Phone.callRevision
    local result=Peak.SendCallback('peak-phone:Server:Calls:State')
    if type(result)=='table' and result.Success then
        if revision==Phone.callRevision and Phone.applyCallState then Phone.applyCallState(result.Data or nil) end
        -- Never return an obsolete RPC snapshot over a more recent push event.
        result.Data=CallData or false
    end
    cb(result)
end)
RegisterNUICallback('Calls/AnswerCall',function(data,cb)
    if type(data)~='table' or Phone.isCallClosed(data.CallId) then return cb({Success=false}) end
    cb(Peak.SendCallback('peak-phone:portable:answer',data.CallId))
end)
RegisterNUICallback('Calls/EndCall',function(data,cb)
    local id=type(data)=='table' and data.CallId or (CallData and CallData.CallId)
    if type(id)~='string' then return cb({Success=false,Msg='No call to end.'}) end
    Phone.rememberCallClosed(id)
    if Phone.applyCallState then Phone.applyCallState(nil,id,'Call ended')
    elseif Phone.stopVideo then Phone.stopVideo(id,'Call ended') end
    TriggerServerEvent('peak-phone:Server:Contacts:DeclineCall',{CallId=id})
    cb({Success=true})
end)
RegisterNUICallback('Calls/ToggleMute',function(data,cb)
    if type(data)~='table' or not CallData or CallData.CallId~=data.CallId then return cb({Success=false,Msg='This call has ended.'}) end
    local supported=capabilities()
    if CallData.AudioMode~='webrtc' and not supported then return cb({Success=false,Msg='Call mute is not supported by the configured voice adapter.'}) end
    cb(Peak.SendCallback('peak-phone:Server:Calls:Mute',data))
end)
RegisterNUICallback('Calls/AudioOutput',function(data,cb)
    if type(data)~='table' or not CallData or CallData.CallId~=data.CallId then return cb({Success=false}) end
    cb(Phone.setCallOutput(data.Speaker))
end)
RegisterNUICallback('Calls/Heartbeat',function(data,cb)
    if type(data)~='table' or not CallData or data.CallId~=CallData.CallId then return cb({Success=false}) end
    TriggerServerEvent('peak-phone:portable:callHeartbeat',data.CallId);cb({Success=true})
end)
AddEventHandler('Peak:Client:OnPlayerUnload',function()
    if CallData then Phone.rememberCallClosed(CallData.CallId) end
    Phone.callRevision=Phone.callRevision+1;Phone.restoreCallAudio();CallData=nil;SendNUIMessage({Action='Calls/Reset'})
end)
AddEventHandler('onClientResourceStop',function(name)
    if name==GetCurrentResourceName() or name==PhoneConfig.VoiceResource then Phone.restoreCallAudio() end
end)
