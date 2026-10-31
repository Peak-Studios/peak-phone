CallData=nil
local Contacts={Suggestions={}}
local animationGeneration=0
RegisterNetEvent('peak-phone:Client:AddContactSuggestion',function(data)
    if type(data)~='table' then return end
    data.Id=#Contacts.Suggestions+1;Contacts.Suggestions[data.Id]=data
    if IsPhoneAppMounted('contacts') then Contacts.SetSuggestedContacts() end
    if not IsPhoneAppVisible('contacts') then Notification('new-contact-suggestion-'..data.Id,'fas fa-phone-alt',{'white','#029587'},data.Name,'Contact details shared.');SetAppUnread('contacts') end
end)
function Phone.applyCallState(data,id,reason)
    if data==false then data=nil end
    if data and (type(data)~='table' or type(data.CallId)~='string' or Phone.isCallClosed(data.CallId)) then return end
    if not data and id and CallData and CallData.CallId~=id then return end
    local previous=CallData;CallData=data;Phone.callRevision=(Phone.callRevision or 0)+1
    if not data then Phone.rememberCallClosed(id or (previous and previous.CallId)) end
    if Phone.syncCallAudio then Phone.syncCallAudio(data) end
    if Phone.emitCallState then Phone.emitCallState(id or (previous and previous.CallId),reason) end
    if not data or not data.Dialing then SendNUIMessage({Action='Video/Ring',Enabled=false,CallId=id or (data and data.CallId) or (previous and previous.CallId)}) end
    if not data then
        local endedId=id or (previous and previous.CallId)
        if endedId and Phone.stopVideo then Phone.stopVideo(endedId,reason or 'Call ended') end
        animationGeneration=animationGeneration+1
        StopAnimTask(PlayerPedId(),'cellphone@','cellphone_text_to_call',1.0)
        if not IsPhoneOpen then Phone.removeProp() end
        return
    end
    if data.Kind=='voice' and (not previous or previous.CallId~=data.CallId) then
        animationGeneration=animationGeneration+1;local n=animationGeneration
        CreateThread(function()
            RequestAnimDict('cellphone@');local deadline=GetGameTimer()+5000
            while not HasAnimDictLoaded('cellphone@') and GetGameTimer()<deadline do Wait(20) end
            if not HasAnimDictLoaded('cellphone@') then return end
            while n==animationGeneration and CallData and CallData.CallId==data.CallId do
                if not IsPhoneOpen and (not CallData.Incoming or not CallData.Dialing) and not IsEntityPlayingAnim(PlayerPedId(),'cellphone@','cellphone_text_to_call',3) then
                    TaskPlayAnim(PlayerPedId(),'cellphone@','cellphone_text_to_call',3.0,-1.0,-1,50,0.0,false,false,false);Phone.addProp()
                end
                Wait(500)
            end
        end)
    end
end
RegisterNetEvent('peak-phone:Client:SetCallData',function(data,id,reason)
    if source==65535 then Phone.applyCallState(data,id,reason) end
end)
RegisterNetEvent('peak-phone:portable:ring',function(enabled,incoming,id)
    if source~=65535 or (id and Phone.isCallClosed(id)) and enabled then return end
    if enabled and CallData and (CallData.CallId~=id or not CallData.Dialing) then return end
    local data=enabled==true and Phone.ringtoneData(incoming) or {Action='Video/Ring',Enabled=false}
    data.CallId=id;SendNUIMessage(data)
end)
AddEventHandler('Peak:Client:OnPlayerUnload',function() CallData=nil;animationGeneration=animationGeneration+1;Contacts.Suggestions={};SendNUIMessage({Action='Video/Ring',Enabled=false}) end)
RegisterNetEvent('peak-phone:Client:Contacts:ReceiveAirShare',function(data)
    if source~=65535 then return end
    SendNUIMessage({Action='Contacts/IncomingShare',Data=data})
    if not IsPhoneOpen then Notification('airshare-'..tostring(data.SenderSource),'fas fa-share-alt',{'white','#3b82f6'},'AirShare','A contact was shared by '..tostring(data.SenderName)) end
end)
function Contacts.SetContacts() SendNUIMessage({Action='Contacts/SetContacts',Contacts=Peak.SendCallback('peak-phone:Server:Contacts:GetContacts')}) end
function Contacts.SetSuggestedContacts() SendNUIMessage({Action='Contacts/SetSuggestedContacts',Contacts=Contacts.Suggestions}) end
RegisterNUICallback('Contacts/GetContacts',function(_,cb) cb(Peak.SendCallback('peak-phone:Server:Contacts:GetContacts')) end)
RegisterNUICallback('Contacts/GetSuggestions',function(_,cb) cb(Contacts.Suggestions) end)
for route,operation in pairs({CreateContact='AddContacts',EditContact='EditContact',DeleteContact='DeleteContact'}) do
    RegisterNUICallback('Contacts/'..route,function(data,cb)
        local result=Peak.SendCallback('peak-phone:Server:Contacts:'..operation,data)
        if not result then return cb({__phoneError=true,error='The contact could not be saved. Check its name/number and ownership.'}) end
        Contacts.SetContacts()
        if data.IsSuggestion then local id=tonumber(data.SuggestionId);if id and id>=1 and id<=#Contacts.Suggestions then table.remove(Contacts.Suggestions,id) end end
        Contacts.SetSuggestedContacts();cb('Ok')
    end)
end
RegisterNUICallback('Contacts/DeleteSuggested',function(data,cb)
    local id=tonumber(data.Id);if id and id>=1 and id<=#Contacts.Suggestions then table.remove(Contacts.Suggestions,id) end
    Contacts.SetSuggestedContacts();cb('Ok')
end)
RegisterNUICallback('Contacts/Call',function(data,cb) cb(Peak.SendCallback('peak-phone:Server:Calls:Dial',data)) end)
RegisterNUICallback('Contacts/ToggleSpeaker',function(_,cb)
    if CallData and CallData.Kind=='voice' then
        if PhoneConfig.AllowSpeakerGuests==true then TriggerServerEvent('peak-phone:Server:Contacts:ToggleSpeaker',{CallId=CallData.CallId,Enabled=not CallData.Speaker})
        elseif Phone.setCallOutput then return cb(Phone.setCallOutput(not CallData.LocalSpeaker)) end
    end
    cb('Ok')
end)
for route,operation in pairs({GetProfile='GetProfile',GetNearbyPlayers='GetNearbyPlayers'}) do RegisterNUICallback('Contacts/'..route,function(_,cb) cb(Peak.SendCallback('peak-phone:Server:Contacts:'..operation)) end) end
for _,route in ipairs({'UpdateProfile','RequestAirShare','PendingAirShares','RespondAirShare'}) do
    RegisterNUICallback('Contacts/'..route,function(data,cb)
        local result=Peak.SendCallback('peak-phone:Server:Contacts:'..route,data)
        if type(result)~='table' or result.Success~=true then return cb({__phoneError=true,error=type(result)=='table' and result.Msg or 'Contact request failed.'}) end
        cb(result)
    end)
end
RegisterNetEvent('peak-phone:Client:Contacts:Refresh',function() if source==65535 then Contacts.SetContacts() end end)
AddEventHandler('Peak:Client:OnPlayerUnload',function() TriggerServerEvent('peak-phone:Contacts:Logout');SendNUIMessage({Action='Contacts/ClearShares'}) end)
RegisterNUICallback('Contacts/CheckMission3Invite',function(data,cb)
    if not Phone.started('peak-lamarmissions') or not Phone.started('peak-core') then return cb({canInvite=false,canKick=false}) end
    local result=Peak.SendCallback('peak-lamarmissions:Server:M3:CheckInviteEligibility',data.phone)
    cb({canInvite=result=='can_invite',canKick=result=='can_kick'})
end)
for route,event in pairs({InviteToMission3='InvitePlayer',KickFromMission3='KickMember'}) do
    RegisterNUICallback('Contacts/'..route,function(data,cb)
        if not Phone.started('peak-lamarmissions') or not Phone.started('peak-core') then return cb(false) end
        TriggerServerEvent('peak-lamarmissions:Server:M3:'..event,data.phone);cb(true)
    end)
end
