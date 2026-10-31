-- Invitations bind the recipient and coordinates on the server; the NUI never supplies accepted coordinates.
local pending={}
local function invite(src,target,title,anonymous)
    local a,b=Phone.getPlayer(src),Phone.getPlayer(target)
    if not a or not b or src==target or not Phone.hasPhone(target) then return false end
    local id=Phone.token();pending[id]={src=target,cid=b.PlayerData.citizenid,coords=GetEntityCoords(GetPlayerPed(src)),expires=os.time()+60}
    local prefix=anonymous and 'Pinger' or 'Messages';local accept=anonymous and 'AcceptPing' or 'AcceptLocation';local decline=anonymous and 'DeclinePing' or 'DeclineLocation'
    TriggerClientEvent('peak-phone:Client:Notification',target,'location-request-'..id,'fas fa-map-pin',{'white','#4ade80'},title,'Shared location. Accept to set a map marker.',false,true,
        'peak-phone:Server:'..prefix..':'..accept,'peak-phone:Server:'..prefix..':'..decline,{HideOnAction=true,PingId=id})
    return true
end
RegisterNetEvent('peak-phone:Server:Pinger:SendPing',function(data)
    local src=source;if type(data)~='table' or not Phone.text(tostring(data.Id or ''),128) or not Phone.rate(src,'location',2,5000) or not IsNetworkEnabled then return end
    local target=Peak.Functions.GetPlayerByCitizenId(tostring(data.Id))
    if target then invite(src,target.PlayerData.source,'Anonymous',true) end
end)
RegisterNetEvent('peak-phone:Server:Messages:SendLocation',function(data)
    local src=source;local number=type(data)=='table' and Phone.phone(data.TargetPhone)
    if not number or not Phone.rate(src,'location',2,5000) or not IsNetworkEnabled then return end
    local p=Phone.getPlayer(src);local own=GetActivePhoneNumber(src);local target=GetSourceByPhoneNumber(number)
    if not p or not own then return end
    if not target then return Phone.notify(src,'Live location sharing requires the recipient to be online.','inform') end
    local receiver=Phone.getPlayer(target);if not receiver or not Phone.sameCharacter(src,p.PlayerData.citizenid) then return end
    if not invite(src,target,GetContactName(receiver.PlayerData.citizenid,own),false) then return end
    PhoneDB.insert("INSERT INTO phone_messages(from_phone,to_phone,message,attachments,timestamp,unread) VALUES (?,?,'[Location Shared]','[]',?,1)",{own,number,os.time()*1000})
    TriggerClientEvent('peak-phone:Client:Messages:RefreshMessagesChat',src,{},false)
    TriggerClientEvent('peak-phone:Client:Messages:RefreshMessagesChat',target,{Name=GetContactName(receiver.PlayerData.citizenid,own),Phone=own,Message='[Location Shared]'},true)
end)
local function resolve(src,data,accept)
    local id=type(data)=='table' and data.PingId;local invitation=type(id)=='string' and pending[id]
    if not invitation or invitation.src~=src or invitation.expires<os.time() or not Phone.sameCharacter(src,invitation.cid) then return end
    pending[id]=nil
    if accept then TriggerClientEvent('peak-phone:Client:Pinger:SetBlip',src,invitation.coords) end
end
for _,v in ipairs({{'Pinger','AcceptPing',true},{'Pinger','DeclinePing',false},{'Messages','AcceptLocation',true},{'Messages','DeclineLocation',false}}) do
    RegisterNetEvent('peak-phone:Server:'..v[1]..':'..v[2],function(data)resolve(source,data,v[3])end)
end
CreateThread(function() while true do Wait(30000);for id,v in pairs(pending) do if v.expires<os.time() then pending[id]=nil end end end end)
