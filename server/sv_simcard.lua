-- Character-owned SIM registry works with both slot inventories and ESX's count-only inventory.
-- Existing numbers are imported once by the bootstrap; there is no mandatory 'phone in slot 3'.
function FormatPhoneForDisplay(number) return tostring(number or '') end
function GenerateSimId() return 'SIM-'..Phone.random(12,'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ') end
function GetSimCardBySimId(id)
    if not Phone.text(id,20) then return nil end
    return PhoneDB.one('SELECT * FROM sim_cards WHERE sim_id=?',{id})
end
function GetSimCardByPhoneNumber(number)
    number=Phone.phone(number);if not number then return nil end
    return PhoneDB.one('SELECT * FROM sim_cards WHERE phone_number=?',{number})
end
function CreateSimCard(cid)
    if not Phone.text(cid,128) then return nil end
    local owned=PhoneDB.one('SELECT COUNT(*) n FROM sim_cards WHERE owner_citizenid=?',{cid})
    if owned and tonumber(owned.n)>=PhoneConfig.MaxOwnedSIMs then return nil end
    for _=1,12 do
        local id,number=GenerateSimId(),PhonePeak.Player.CreatePhoneNumber()
        if not GetSimCardByPhoneNumber(number) then
            local ok,value=pcall(PhoneDB.insert,'INSERT INTO sim_cards (sim_id,phone_number,owner_citizenid,created_at) VALUES (?,?,?,?)',{id,number,cid,os.time()*1000})
            if ok and value then return {SimId=id,PhoneNumber=number} end
        end
    end
    return nil
end
function GetActivePhoneNumber(src)
    -- Once physical identity is configured, inaccessible/lost/locked sessions
    -- fail closed instead of silently reviving the character's old number.
    if Phone.Devices and Phone.Devices.active then local active=Phone.Devices.active(src);return active and active.PhoneNumber or nil end
    local p=Phone.getPlayer(src);if not p or not Phone.hasPhone(src) then return nil end
    return p.PlayerData.charinfo.phone
end
function GetSourceByPhoneNumber(number)
    number=Phone.phone(number);if not number then return nil end
    for _,id in ipairs(GetPlayers()) do
        local src=tonumber(id)
        if GetActivePhoneNumber(src)==number then return src end
    end
end
function GetActiveSimData(src)
    if Phone.Devices and Phone.Devices.active then local active=Phone.Devices.active(src);return active and active.PhoneNumber and active or nil end
    local number=GetActivePhoneNumber(src);if not number then return nil end
    local row=GetSimCardByPhoneNumber(number)
    return row and {PhoneNumber=number,SimId=row.sim_id} or nil
end
exports('CreateSimCard',CreateSimCard)
exports('GetSimCardBySimId',GetSimCardBySimId)
exports('GetSimCardByPhoneNumber',GetSimCardByPhoneNumber)
exports('GetActivePhoneNumber',GetActivePhoneNumber)
exports('GetSourceByPhoneNumber',GetSourceByPhoneNumber)
exports('GetActiveSimData',GetActiveSimData)
Peak.Functions.CreateCallback('peak-phone:Server:HasActiveSim',function(src,cb)
    if Phone.Devices and Phone.Devices.syncSimItems then Phone.Devices.syncSimItems(src) end
    local sim=GetActiveSimData(src)
    local device=Phone.Devices and Phone.Devices.active and Phone.Devices.active(src) or nil
    cb({HasSim=sim~=nil,SimData=sim,DeviceData=device,HasBurnerSim=Phone.hasItem(src,'burner_sim',1)})
end)
Peak.Functions.CreateCallback('peak-phone:Server:GetActivePhoneNumber',function(src,cb) cb(GetActivePhoneNumber(src)) end)
-- The old inventory-specific insert/remove events are deliberately not registered: an untrusted
-- client may not move SIM ownership or discard inventory items. Physical changes go through
-- Settings > SIM and the prepare-animation-commit flow in sv_devices.lua.
RegisterNetEvent('peak-phone:Server:RegisterSimCard',function()
    Phone.notify(source,'Your main SIM is provisioned automatically. Use Settings > SIM for physical SIM changes.','inform')
end)
CreateThread(function()
    PhoneDB.wait()
    -- Server-only API for provisioning additional SIMs, e.g. from a server-owned shop purchase.
    -- Do not expose CreateSimCard directly as an unvalidated network event.
end)
Phone.activeNumber=GetActivePhoneNumber
Phone.sourceByPhone=GetSourceByPhoneNumber
