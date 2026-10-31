-- Server owns identity, timing and the durable replacement. Client progress is cosmetic.
local pending = {}
local function fail(message) return {Success=false,Error=message} end
local function alive(src)
    local player=Phone.getPlayer(src)
    local meta=player and player.PlayerData.metadata or {}
    local ped=GetPlayerPed(src)
    return player and ped~=0 and GetEntityHealth(ped)>0 and not meta.isdead and not meta.ishandcuffed
end
local function same(a,b)
    if type(a)~=type(b) then return false end
    if type(a)~='table' then return a==b end
    for k,v in pairs(a) do if not same(v,b[k]) then return false end end
    for k in pairs(b) do if a[k]==nil then return false end end
    return true
end
PhonePeak.Functions.CreateCallback('peak-phone:break:begin',function(src,cb,data)
    if pending[src] and GetGameTimer()<pending[src].expires then return cb(fail('A phone break is already running.')) end
    pending[src]=nil
    local slot=tonumber(data and data.Slot)
    if not slot or slot%1~=0 or not alive(src) then return cb(fail('You cannot break a phone now.')) end
    if GetResourceState('peak-inventory')~='started' then return cb(fail('Phone breaking requires the Peak Inventory transaction adapter.')) end
    local health=exports['peak-inventory']:Health()
    if not health or health.backend~='native' then return cb(fail('Phone breaking is unavailable with this inventory backend.')) end
    local item=Phone.inventorySlot(src,slot)
    if not item or item.Name~=PhoneConfig.PhoneItem or item.Amount~=1 then return cb(fail('Select one intact phone in your inventory.')) end
    local player=Phone.getPlayer(src)
    local token=Phone.random(32,'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ')
    pending[src]={slot=slot,info=Phone.copy(item.Info),cid=player.PlayerData.citizenid,token=token,
        start=GetGameTimer(),last=0,count=0,expires=GetGameTimer()+30000}
    cb({Success=true,Token=token})
end)
RegisterNetEvent('peak-phone:break:press',function(token)
    local src=source;local op=pending[src];local time=GetGameTimer()
    if not op or token~=op.token or time>op.expires or time-op.start<PhoneBreakTiming.Prepare-100
        or time-op.last<90 or op.count>=PhoneBreakTiming.Target then return end
    op.last=time;op.count=op.count+1
end)
PhonePeak.Functions.CreateCallback('peak-phone:break:cancel',function(src,cb,data)
    if pending[src] and pending[src].token==(data and data.Token) then pending[src]=nil end
    cb({Success=true})
end)
PhonePeak.Functions.CreateCallback('peak-phone:break:commit',function(src,cb,data)
    local op=pending[src]
    if not op or op.token~=(data and data.Token) then return cb(fail('The phone break expired.')) end
    pending[src]=nil -- one attempt; replays never consume a second phone
    local player=Phone.getPlayer(src);local item=Phone.inventorySlot(src,op.slot)
    if GetGameTimer()>op.expires or GetGameTimer()-op.start<PhoneBreakTiming.Prepare+PhoneBreakTiming.MinimumEffort-200
        or op.count<PhoneBreakTiming.Target or not alive(src)
        or not player or player.PlayerData.citizenid~=op.cid or not item or item.Name~=PhoneConfig.PhoneItem
        or item.Amount~=1 or not same(item.Info,op.info) then return cb(fail('The phone changed or you did not break it in time.')) end
    local ok,reason=exports['peak-inventory']:BreakPhone(src,op.slot,op.info)
    if not ok then return cb(fail('Phone kept intact: '..tostring(reason))) end
    if Phone.Calls and Phone.Calls.stopFor then Phone.Calls.stopFor(src,'Phone broken') end
    if Phone.KiloLive and Phone.KiloLive.bySource and Phone.KiloLive.stop then
        local live=Phone.KiloLive.bySource[src];if live then Phone.KiloLive.stop(live,'Phone broken') end
    end
    SetTimeout(100,function() TriggerClientEvent('peak-phone:portable:identityChanged',src,'Your phone is broken. Fix it in DigitanDen.') end)
    cb({Success=true})
end)
PhonePeak.Functions.CreateCallback('peak-phone:break:status',function(src,cb)
    local equipped=Phone.inventorySlot(src,PhoneConfig.PhoneSlot)
    if equipped and equipped.Name=='broken_phone_duo' then return cb({Broken=true}) end
    if Phone.hasPhone(src) then return cb({Broken=false}) end
    for _,item in pairs(Phone.carriedItems(src,'broken_phone_duo')) do
        if (item.name or item.Item)=='broken_phone_duo' then return cb({Broken=true}) end
    end
    cb({Broken=false})
end)
AddEventHandler('playerDropped',function() pending[source]=nil end)
CreateThread(function()
    while true do Wait(30000);for src,op in pairs(pending) do if GetGameTimer()>op.expires then pending[src]=nil end end end
end)
