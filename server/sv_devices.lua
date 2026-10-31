-- Physical device identity. Durable state is server-owned; NUI never decides ownership or lock state.
Phone.Devices = Phone.Devices or {}
local D=Phone.Devices
local changed
local function now() return os.time()*1000 end
local function random(prefix,n) return prefix..Phone.random(n,'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ') end
local function character(src)
    local p=Phone.getPlayer(src)
    return p,p and p.PlayerData.citizenid
end
local function physicalItem(src,device)
    if device.inventory_mode=='count' then return Phone.hasPhone(src) and {Mode='count'} or nil end
    return Phone.findDeviceItem(src,device.device_id)
end
local access
local function peakInventory()
    if GetResourceState('peak-inventory')~='started' then return false end
    local adapter=exports['peak-bridge']:GetInventoryName()
    -- Peak's forwarding resources expose the original inventory name to QBCore.
    -- Their manifest identifies the backend; an unrelated QB inventory is not Peak.
    return adapter=='peak-inventory' or type(adapter)=='string' and GetResourceMetadata(adapter,'peak_inventory_bridge',0)=='yes'
end
local function same(a,b)
    if type(a)~=type(b) then return false end
    if type(a)~='table' then return a==b end
    for k,v in pairs(a) do if not same(v,b[k]) then return false end end
    for k in pairs(b) do if a[k]==nil then return false end end
    return true
end
-- Adopt an unregistered Peak Inventory handset without replacing the item or
-- reviving another device's ownership, PIN, SIM, or lost/revoked status.
function D.initializeItem(src,slot)
    return Phone.withLocks({'phone-device-item:'..tostring(src)},function()
        local p,cid=character(src)
        local item=p and Phone.inventorySlot(src,slot)
        if not item or item.Name~=PhoneConfig.PhoneItem or item.Amount~=1 then return false,'Phone item is unavailable.' end
        if item.Info.device_id~=nil then return false,'This phone already has an identity.' end
        if not peakInventory() or Phone.inventoryMode()~='unique' then return false,'This inventory does not support device adoption.' end
        local count=PhoneDB.one('SELECT COUNT(*) n FROM peak_phone_devices WHERE owner_citizenid=?',{cid})
        if not count or tonumber(count.n)>=PhoneConfig.Devices.MaxOwned then return false,'Device limit reached.' end
        for _=1,12 do
            local id=random('DUO-',12)
            local inserted=PhoneDB.update('INSERT IGNORE INTO peak_phone_devices(device_id,owner_citizenid,label,inventory_mode,created_at,updated_at) VALUES (?,?,?,?,?,?)',{id,cid,'Peak Duo','unique',now(),now()})
            if inserted and inserted>0 then
                local currentPlayer,currentCid=character(src)
                local currentItem=currentPlayer and Phone.inventorySlot(src,slot)
                local saved,reason=false,'Phone item changed.'
                if currentCid==cid and currentItem and currentItem.Name==item.Name and currentItem.Amount==1 and same(currentItem.Info,item.Info) then
                    local info=Phone.copy(item.Info);info.device_id=id;info.label=info.label or 'Peak Duo'
                    local called
                    called,saved,reason=pcall(function() return exports['peak-inventory']:SetMetadata(src,slot,info) end)
                    if not called then saved=false;reason='Phone identity could not be saved.' end
                end
                if saved then return true,{DeviceId=id,InventoryMode='unique'} end
                PhoneDB.update('DELETE FROM peak_phone_devices WHERE device_id=? AND owner_citizenid=?',{id,cid})
                return false,reason
            end
        end
        return false,'Could not allocate a device identity.'
    end)
end
local function ensure(src)
    local p,cid=character(src);if not p then return nil end
    local session=PhoneDB.one('SELECT * FROM peak_phone_device_sessions WHERE citizenid=?',{cid})
    local equipped=Phone.inventorySlot(src,PhoneConfig.PhoneSlot)
    if equipped and equipped.Name==PhoneConfig.PhoneItem and equipped.Info.device_id==nil and Phone.inventoryMode()=='unique' and peakInventory() then
        local initialized=D.initializeItem(src,PhoneConfig.PhoneSlot)
        if not initialized then return nil end
        equipped=Phone.inventorySlot(src,PhoneConfig.PhoneSlot)
    end
    local equippedId=equipped and equipped.Name==PhoneConfig.PhoneItem and equipped.Info.device_id
    if Phone.text(equippedId,64) then
        if not access(cid,equippedId) then return nil end
        if not session or session.device_id~=equippedId then
            local saved=PhoneDB.update([[INSERT INTO peak_phone_device_sessions(citizenid,device_id,generation,unlocked,updated_at) VALUES (?,?,1,0,?) ON DUPLICATE KEY UPDATE device_id=VALUES(device_id),generation=generation+1,unlocked=0,updated_at=VALUES(updated_at)]],{cid,equippedId,now()})
            if saved==nil or saved==false then return nil end
            session=PhoneDB.one('SELECT * FROM peak_phone_device_sessions WHERE citizenid=?',{cid})
            if changed then changed(src,cid,'Active device changed') end
        end
        return session and session.device_id==equippedId and session or nil
    end
    if session then return session end
    local device=PhoneDB.one([[SELECT d.* FROM peak_phone_devices d LEFT JOIN peak_phone_device_access a ON a.device_id=d.device_id AND a.citizenid=? WHERE d.owner_citizenid=? OR (a.citizenid=? AND (a.expires_at IS NULL OR a.expires_at>?)) ORDER BY d.created_at LIMIT 1]],{cid,cid,cid,now()})
    if not device then
        local owned=PhoneDB.one('SELECT COUNT(*) n FROM peak_phone_devices WHERE owner_citizenid=?',{cid})
        if tonumber(owned and owned.n or 0)>=PhoneConfig.Devices.MaxOwned then return nil end
        local active=PhoneDB.one('SELECT sim_id FROM sim_cards WHERE phone_number=? AND owner_citizenid=?',{p.PlayerData.charinfo.phone,cid})
        for _=1,12 do
            local id=random('DUO-',12)
            -- Existing generic phone items have no stable metadata. Bootstrap them in
            -- compatibility mode; newly purchased devices use the configured unique mode.
            local ok=PhoneDB.update('INSERT IGNORE INTO peak_phone_devices(device_id,owner_citizenid,label,sim_id,inventory_mode,created_at,updated_at) VALUES (?,?,?,?,?,?,?)',{id,cid,'Peak Duo',active and active.sim_id or nil,'count',now(),now()})
            if ok and ok>0 then device={device_id=id};break end
        end
    end
    if not device then return nil end
    PhoneDB.query('INSERT INTO peak_phone_device_sessions(citizenid,device_id,generation,unlocked,updated_at) VALUES (?,?,1,0,?)',{cid,device.device_id,now()})
    return PhoneDB.one('SELECT * FROM peak_phone_device_sessions WHERE citizenid=?',{cid})
end
access=function(cid,id)
    return PhoneDB.one([[SELECT d.*,CASE WHEN d.owner_citizenid=? THEN 'owner' ELSE a.access_type END access_type FROM peak_phone_devices d LEFT JOIN peak_phone_device_access a ON a.device_id=d.device_id AND a.citizenid=? AND (a.expires_at IS NULL OR a.expires_at>?) WHERE d.device_id=? AND (d.owner_citizenid=? OR a.citizenid=?)]],{cid,cid,now(),id,cid,cid})
end
local function current(src,requireUnlocked,generation)
    local p,cid=character(src);if not p then return nil,'Character is unavailable.' end
    local s=ensure(src);if not s then return nil,'No usable phone device is available.' end
    if generation and tonumber(generation)~=tonumber(s.generation) then return nil,'Device identity changed. Reopen Settings.' end
    local d=access(cid,s.device_id);if not d then return nil,'Device access was revoked.' end
    local item=physicalItem(src,d);if not item then return nil,'The selected physical device is not in your inventory.' end
    if d.status~='active' then return nil,d.status=='lost' and 'This device is marked lost.' or 'This device was revoked.' end
    if requireUnlocked and d.pin_hash and tonumber(s.unlocked)~=1 then return nil,'Unlock this device first.' end
    return {player=p,cid=cid,session=s,device=d,item=item}
end
local function setActiveNumber(ctx)
    local number=nil
    -- Hardware access never grants the SIM owner's identity. A borrower may use
    -- the device, but only a SIM owned by their current character is active.
    if ctx.device.sim_id then
        local sim=GetSimCardBySimId(ctx.device.sim_id)
        if sim and sim.owner_citizenid==ctx.cid then number=sim.phone_number end
    end
    local row=Phone.profile(ctx.player.PlayerData.source,ctx.player.Raw)
    if number and row.phone_number~=number then row.phone_number=number;row.charinfo.phone=number;Phone.saveProfile(row) end
    return number
end
-- Resolve without calling getPlayer: its phone view uses this helper too.
function D.numberFor(src,cid)
    local session=PhoneDB.one('SELECT * FROM peak_phone_device_sessions WHERE citizenid=?',{cid})
    if not session then return nil,false end
    local device=session and access(cid,session.device_id)
    if not device or device.status~='active' or not physicalItem(src,device) then return nil,true end
    local sim=device.sim_id and GetSimCardBySimId(device.sim_id)
    return sim and sim.owner_citizenid==cid and sim.phone_number or nil,true
end
changed=function(src,cid,reason)
    if Phone.DuoProp and Phone.DuoProp.invalidateIdentity then Phone.DuoProp.invalidateIdentity(src,cid) end
    TriggerClientEvent('peak-phone:portable:identityInvalidating',src,reason or 'Device identity changed')
    Phone.Server.Profiles[cid]=nil
    if Phone.FindMy and Phone.FindMy.sessionChanged then Phone.FindMy.sessionChanged(src,cid) end
    if Phone.Calls and Phone.Calls.stopFor then Phone.Calls.stopFor(src,reason or 'Device identity changed') end
    if Phone.KiloLive and Phone.KiloLive.bySource and Phone.KiloLive.stop then
        local live=Phone.KiloLive.bySource[tonumber(src)];if live then Phone.KiloLive.stop(live,reason or 'Device identity changed') end
    end
    SetTimeout(100,function() TriggerClientEvent('peak-phone:portable:identityChanged',src,reason or 'Device identity changed') end)
end
local function sourceFor(cid)
    for _,value in ipairs(GetPlayers()) do
        local src=tonumber(value);local p=src and Phone.getPlayer(src)
        if p and p.PlayerData.citizenid==cid then return src end
    end
end
local function invalidateDevice(id,reason)
    local sessions=PhoneDB.query('SELECT citizenid FROM peak_phone_device_sessions WHERE device_id=?',{id}) or {}
    local updated=PhoneDB.update('UPDATE peak_phone_device_sessions SET generation=generation+1,unlocked=0,updated_at=? WHERE device_id=?',{now(),id})
    if updated==nil or updated==false then return false end
    for _,session in ipairs(sessions) do local src=sourceFor(session.citizenid);if src then changed(src,session.citizenid,reason) end end
    return true
end
function D.active(src)
    local p,cid=character(src);if not p then return nil end
    local session=ensure(src);if not session then return nil end
    local device=access(cid,session.device_id);if not device or not physicalItem(src,device) then return nil end
    local ctx={player=p,cid=cid,session=session,device=device}
    local number=device.status=='active' and setActiveNumber(ctx) or nil
    return {PhoneNumber=number,SimId=number and device.sim_id or nil,DeviceId=device.device_id,Generation=session.generation,Locked=device.pin_hash~=nil and tonumber(session.unlocked)~=1,Status=device.status}
end
local giveSimItem
local function inventoryDevice(src,slot)
    if tonumber(slot)~=PhoneConfig.PhoneSlot then return nil,'Move your phone into the dedicated Phone slot first.' end
    local item=Phone.inventorySlot(src,slot)
    if not item or item.Name~=PhoneConfig.PhoneItem then return nil,'That pocket slot no longer contains a phone.' end
    local ctx,err=current(src,false)
    if not ctx then return nil,err end
    local id=item.Info and item.Info.device_id
    if id and id~=ctx.device.device_id then return nil,'Select that device in Settings before opening its SIM tray.' end
    if ctx.device.inventory_mode=='unique' and not id then return nil,'That phone item has no device identity.' end
    return ctx
end
PhonePeak.Functions.CreateCallback('peak-phone:devices:inventoryInspect',function(src,cb,data)
    local ctx,err=inventoryDevice(src,data and data.PhoneSlot);if not ctx then return cb(Phone.publicError(err)) end
    local sim=ctx.device.sim_id and GetSimCardBySimId(ctx.device.sim_id)
    cb({Success=true,Generation=ctx.session.generation,DeviceId=ctx.device.device_id,Label=ctx.device.label,
        Locked=ctx.device.pin_hash~=nil and tonumber(ctx.session.unlocked)~=1,
        Sim=sim and {sim_id=sim.sim_id,phone_number=sim.phone_number} or nil})
end)
PhonePeak.Functions.CreateCallback('peak-phone:devices:list',function(src,cb)
    local p,cid=character(src);if not p then return cb(Phone.publicError('Character is unavailable.')) end
    local session=ensure(src);if not session then return cb(Phone.publicError('No phone device is available.')) end
    local devices=PhoneDB.query([[SELECT d.device_id,d.label,d.owner_citizenid,d.sim_id,d.status,d.pin_hash IS NOT NULL has_pin,CASE WHEN d.owner_citizenid=? THEN 'owner' ELSE a.access_type END access_type,a.expires_at FROM peak_phone_devices d LEFT JOIN peak_phone_device_access a ON a.device_id=d.device_id AND a.citizenid=? AND (a.expires_at IS NULL OR a.expires_at>?) WHERE d.owner_citizenid=? OR a.citizenid=? ORDER BY d.created_at]],{cid,cid,now(),cid,cid})
    local sims=PhoneDB.query('SELECT s.sim_id,s.phone_number,s.owner_citizenid,s.inventory_issued,d.device_id FROM sim_cards s LEFT JOIN peak_phone_devices d ON d.sim_id=s.sim_id WHERE s.owner_citizenid=? ORDER BY s.id',{cid})
    local availableSims,simWarning={},nil
    for _,sim in ipairs(sims) do
        if not sim.device_id and tonumber(sim.inventory_issued)==0 and not giveSimItem(src,sim.sim_id,nil,cid) then
            simWarning='The SIM card could not be placed in your inventory. Make one slot available, then refresh Settings.'
        else
            availableSims[#availableSims+1]=sim
        end
    end
    for _,d in ipairs(devices) do d.active=d.device_id==session.device_id;d.unlocked=d.active and (not d.has_pin or tonumber(session.unlocked)==1) end
    local backups=PhoneDB.query('SELECT id,created_at,device_id FROM peak_phone_backups WHERE citizenid=? ORDER BY id DESC LIMIT 5',{cid})
    cb({Success=true,Generation=session.generation,Devices=devices,Sims=availableSims,SimWarning=simWarning,Backups=backups,InventoryMode=Phone.inventoryMode(),LendingHours=PhoneConfig.Devices.LendingHours})
end)
PhonePeak.Functions.CreateCallback('peak-phone:devices:select',function(src,cb,data)
    local p,cid=character(src);local id=Phone.string(data and data.DeviceId,32);if not p or not id then return cb(Phone.publicError('Invalid device.')) end
    local d=access(cid,id);if not d or d.status~='active' then return cb(Phone.publicError('That device is not available.')) end
    if not physicalItem(src,d) then return cb(Phone.publicError('That physical device is not in your inventory.')) end
    local s=ensure(src);if not s then return cb(Phone.publicError('Device session is unavailable.')) end
    local previous=access(cid,s.device_id);local oldSimId=previous and previous.sim_id
    local oldSim=oldSimId and GetSimCardBySimId(oldSimId)
    local updated=PhoneDB.update('UPDATE peak_phone_device_sessions SET device_id=?,generation=generation+1,unlocked=?,updated_at=? WHERE citizenid=? AND generation=?',{id,d.pin_hash and 0 or 1,now(),cid,s.generation})
    if not updated or updated<1 then return cb(Phone.publicError('Device selection changed before it could be saved. Reopen Settings.')) end
    if Phone.FindMy and Phone.FindMy.deviceSelected then Phone.FindMy.deviceSelected(src,cid,s.device_id,id,oldSimId,oldSim and oldSim.owner_citizenid) end
    changed(src,cid,'Active device changed');cb({Success=true,Locked=d.pin_hash~=nil})
end)
PhonePeak.Functions.CreateCallback('peak-phone:devices:lock',function(src,cb,data)
    local ctx,err=current(src,false,data and data.Generation);if not ctx then return cb(Phone.publicError(err)) end
    local updated=PhoneDB.update('UPDATE peak_phone_device_sessions SET unlocked=0,updated_at=? WHERE citizenid=? AND device_id=? AND generation=?',{now(),ctx.cid,ctx.device.device_id,ctx.session.generation})
    if not updated or updated<1 then return cb(Phone.publicError('Device changed. Reopen your phone.')) end
    cb({Success=true})
end)
PhonePeak.Functions.CreateCallback('peak-phone:devices:unlock',function(src,cb,data)
    local ctx,err=current(src,false,data and data.Generation);if not ctx then return cb(Phone.publicError(err)) end
    local pin=tostring(data and data.PIN or '');if not pin:match('^%d%d%d%d%d?%d?$') then return cb(Phone.publicError('Enter a 4–6 digit PIN.')) end
    if not ctx.device.pin_hash then PhoneDB.update('UPDATE peak_phone_device_sessions SET unlocked=1 WHERE citizenid=?',{ctx.cid});return cb({Success=true}) end
    if tonumber(ctx.device.locked_until)>now() then return cb(Phone.publicError('Too many attempts. Try again later.')) end
    local ok=PhoneDB.one('SELECT device_id FROM peak_phone_devices WHERE device_id=? AND pin_hash=SHA2(CONCAT(pin_salt,?),256)',{ctx.device.device_id,pin})
    if not ok then
        local attempts=tonumber(ctx.device.failed_unlocks or 0)+1;local untilAt=attempts>=PhoneConfig.Devices.PINAttempts and now()+PhoneConfig.Devices.PINLockSeconds*1000 or 0
        PhoneDB.update('UPDATE peak_phone_devices SET failed_unlocks=?,locked_until=?,updated_at=? WHERE device_id=?',{untilAt>0 and 0 or attempts,untilAt,now(),ctx.device.device_id})
        return cb(Phone.publicError(untilAt>0 and 'Too many attempts. Device temporarily locked.' or 'Incorrect PIN.'))
    end
    PhoneDB.update('UPDATE peak_phone_devices SET failed_unlocks=0,locked_until=0,updated_at=? WHERE device_id=?',{now(),ctx.device.device_id});PhoneDB.update('UPDATE peak_phone_device_sessions SET unlocked=1 WHERE citizenid=?',{ctx.cid});cb({Success=true})
end)
PhonePeak.Functions.CreateCallback('peak-phone:devices:setPin',function(src,cb,data)
    local ctx,err=current(src,true,data and data.Generation);if not ctx then return cb(Phone.publicError(err)) end
    if ctx.device.owner_citizenid~=ctx.cid then return cb(Phone.publicError('Only the device owner can change its PIN.')) end
    local pin=tostring(data.PIN or '');if not pin:match('^%d%d%d%d%d?%d?$') then return cb(Phone.publicError('Use a 4–6 digit PIN.')) end
    local salt,recovery,rsalt=random('',32),random('',16),random('',32)
    PhoneDB.update('UPDATE peak_phone_devices SET pin_salt=?,pin_hash=SHA2(CONCAT(?,?),256),recovery_salt=?,recovery_hash=SHA2(CONCAT(?,?),256),failed_unlocks=0,locked_until=0,updated_at=? WHERE device_id=?',{salt,salt,pin,rsalt,rsalt,recovery,now(),ctx.device.device_id})
    PhoneDB.update('UPDATE peak_phone_device_sessions SET unlocked=1 WHERE citizenid=?',{ctx.cid});cb({Success=true,RecoveryCode=recovery})
end)
PhonePeak.Functions.CreateCallback('peak-phone:devices:recover',function(src,cb,data)
    local ctx,err=current(src,false,data and data.Generation);if not ctx then return cb(Phone.publicError(err)) end
    local code=tostring(data.Code or '')
    local ok=PhoneDB.one('SELECT device_id FROM peak_phone_devices WHERE device_id=? AND owner_citizenid=? AND recovery_hash=SHA2(CONCAT(recovery_salt,?),256)',{ctx.device.device_id,ctx.cid,code})
    if not ok then return cb(Phone.publicError('Recovery code is invalid.')) end
    PhoneDB.update('UPDATE peak_phone_devices SET pin_hash=NULL,pin_salt=NULL,recovery_hash=NULL,recovery_salt=NULL,failed_unlocks=0,locked_until=0,updated_at=? WHERE device_id=?',{now(),ctx.device.device_id});PhoneDB.update('UPDATE peak_phone_device_sessions SET unlocked=1,generation=generation+1 WHERE citizenid=?',{ctx.cid});changed(src,ctx.cid,'Device recovered');cb({Success=true})
end)
local function nearbyTarget(src,value)
    local target=tonumber(value);if not target or target==src or not GetPlayerName(target) then return nil end
    local a,b=GetPlayerPed(src),GetPlayerPed(target);if a<=0 or b<=0 or #(GetEntityCoords(a)-GetEntityCoords(b))>4.0 then return nil end
    return target
end
PhonePeak.Functions.CreateCallback('peak-phone:devices:lend',function(src,cb,data)
    local ctx,err=current(src,true,data and data.Generation);if not ctx then return cb(Phone.publicError(err)) end
    local target=nearbyTarget(src,data.Target);if ctx.device.owner_citizenid~=ctx.cid or not target then return cb(Phone.publicError('Choose a nearby player.')) end
    local tp,tcid=character(target);if not tp then return cb(Phone.publicError('Target character is unavailable.')) end
    local expires=now()+PhoneConfig.Devices.LendingHours*3600000
    local updated=PhoneDB.update('INSERT INTO peak_phone_device_access(device_id,citizenid,access_type,granted_by,expires_at,created_at) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE access_type=VALUES(access_type),granted_by=VALUES(granted_by),expires_at=VALUES(expires_at)',{ctx.device.device_id,tcid,'borrowed',ctx.cid,expires,now()})
    if updated==nil or updated==false then return cb(Phone.publicError('Temporary access could not be saved.')) end
    cb({Success=true,ExpiresAt=expires})
end)
PhonePeak.Functions.CreateCallback('peak-phone:devices:transfer',function(src,cb,data)
    local ctx,err=current(src,true,data and data.Generation);if not ctx then return cb(Phone.publicError(err)) end
    local target=nearbyTarget(src,data.Target);if ctx.device.owner_citizenid~=ctx.cid or not target then return cb(Phone.publicError('Choose a nearby player.')) end
    local tp,tcid=character(target);if not tp then return cb(Phone.publicError('Target character is unavailable.')) end
    local movedItem=false
    if ctx.item.Mode=='unique' then
        if not Phone.removeItem(src,PhoneConfig.PhoneItem,1,ctx.item.Slot) then return cb(Phone.publicError('The physical device could not be removed from your inventory.')) end
        if not Phone.addItem(target,PhoneConfig.PhoneItem,1,{device_id=ctx.device.device_id,label=ctx.device.label}) then
            Phone.addItem(src,PhoneConfig.PhoneItem,1,{device_id=ctx.device.device_id,label=ctx.device.label},ctx.item.Slot)
            return cb(Phone.publicError('The target inventory is full. The device was returned to you.'))
        end
        movedItem=true
    end
    local committed=PhoneDB.transaction({{query='UPDATE peak_phone_devices SET owner_citizenid=?,sim_id=NULL,updated_at=? WHERE device_id=? AND owner_citizenid=?',values={tcid,now(),ctx.device.device_id,ctx.cid}},{query='DELETE FROM peak_phone_device_access WHERE device_id=?',values={ctx.device.device_id}}})
    if not committed then
        if movedItem then Phone.removeItem(target,PhoneConfig.PhoneItem,1);Phone.addItem(src,PhoneConfig.PhoneItem,1,{device_id=ctx.device.device_id,label=ctx.device.label},ctx.item.Slot) end
        return cb(Phone.publicError('The transfer was not committed. The physical item was reconciled.'))
    end
    local owner=PhoneDB.one('SELECT owner_citizenid FROM peak_phone_devices WHERE device_id=?',{ctx.device.device_id})
    if not owner or owner.owner_citizenid~=tcid then return cb(Phone.publicError('The transfer outcome is unresolved. Reopen Settings before retrying.')) end
    local transferredSim=ctx.device.sim_id and GetSimCardBySimId(ctx.device.sim_id)
    if Phone.FindMy and Phone.FindMy.deviceTransferred then Phone.FindMy.deviceTransferred(src,ctx.cid,ctx.device.device_id,ctx.device.sim_id,transferredSim and transferredSim.owner_citizenid) end
    if not invalidateDevice(ctx.device.device_id,'Device transferred') then return cb(Phone.publicError('Ownership changed, but session invalidation is unresolved. Reopen the phone.')) end
    -- The recipient may not yet have selected this hardware, but their device
    -- list changed and must be refreshed immediately.
    TriggerClientEvent('peak-phone:portable:identityInvalidating',target,'A device was transferred to you')
    TriggerClientEvent('peak-phone:portable:identityChanged',target,'A device was transferred to you');cb({Success=true})
end)
local simOperations={}
local function simItemName() return PhoneConfig.SimItem or 'simcard' end
giveSimItem=function(src,id,slot,expectedOwner)
    local p,cid=character(src)
    if not expectedOwner or not p or cid~=expectedOwner then return false end
    local sim=GetSimCardBySimId(id)
    if not sim or sim.owner_citizenid~=expectedOwner then return false end
    if PhoneDB.one('SELECT device_id FROM peak_phone_devices WHERE sim_id=?',{id}) then return false end
    local carried=Phone.findSimItem(src,id)
    if carried then
        local currentPlayer,currentCid=character(src)
        if not currentPlayer or currentCid~=expectedOwner or not Phone.sameCharacter(src,expectedOwner) then return false end
        if tonumber(sim.inventory_issued)==1 then return true end
        local claimed=PhoneDB.update('UPDATE sim_cards SET inventory_issued=1 WHERE sim_id=? AND owner_citizenid=? AND inventory_issued=0 AND NOT EXISTS (SELECT 1 FROM peak_phone_devices WHERE sim_id=?)',{id,expectedOwner,id})
        if claimed and claimed>0 then return true end
        local current=GetSimCardBySimId(id)
        return current and current.owner_citizenid==expectedOwner and tonumber(current.inventory_issued)==1
    end
    if tonumber(sim.inventory_issued)==1 then return false end
    local claimed=PhoneDB.update('UPDATE sim_cards SET inventory_issued=1 WHERE sim_id=? AND owner_citizenid=? AND inventory_issued=0 AND NOT EXISTS (SELECT 1 FROM peak_phone_devices WHERE sim_id=?)',{id,expectedOwner,id})
    if not claimed or claimed<1 then return false end
    local currentPlayer,currentCid=character(src)
    if not currentPlayer or currentCid~=expectedOwner or not Phone.sameCharacter(src,expectedOwner) then
        PhoneDB.update('UPDATE sim_cards SET inventory_issued=0 WHERE sim_id=? AND owner_citizenid=? AND inventory_issued=1 AND NOT EXISTS (SELECT 1 FROM peak_phone_devices WHERE sim_id=?)',{id,expectedOwner,id})
        return false
    end
    if Phone.addItem(src,simItemName(),1,{sim_id=id,phone_number=sim.phone_number,description='SIM '..sim.phone_number},slot) then return true end
    PhoneDB.update('UPDATE sim_cards SET inventory_issued=0 WHERE sim_id=? AND owner_citizenid=? AND inventory_issued=1 AND NOT EXISTS (SELECT 1 FROM peak_phone_devices WHERE sim_id=?)',{id,expectedOwner,id})
    return false
end
exports('IssueSimCard',function(target)
    if not GetInvokingResource() then return false,'IssueSimCard is server-only.' end
    target=tonumber(target)
    local _,cid=character(target);if not cid then return false,'Player is unavailable.' end
    return Phone.withLocks({'phone-sim-issue:'..cid},function()
        local created=CreateSimCard(cid)
        if not created then return false,'SIM limit reached or registration failed.' end
        if giveSimItem(target,created.SimId,nil,cid) then return true,created end
        PhoneDB.update('DELETE FROM sim_cards WHERE sim_id=? AND owner_citizenid=? AND inventory_issued=0 AND NOT EXISTS (SELECT 1 FROM peak_phone_devices WHERE sim_id=?)',{created.SimId,cid,created.SimId})
        return false,'SIM could not be placed in the inventory; issuance was rolled back.'
    end)
end)
local function takeSimItem(src,id,expectedOwner,expectedDevice)
    local p,cid=character(src)
    if not p or not expectedOwner or cid~=expectedOwner then return false end
    local sim=GetSimCardBySimId(id)
    local attached=PhoneDB.one('SELECT device_id FROM peak_phone_devices WHERE sim_id=?',{id})
    if not sim or sim.owner_citizenid~=expectedOwner or not attached or attached.device_id~=expectedDevice then return false end
    local item=Phone.findSimItem(src,id)
    local currentPlayer,currentCid=character(src)
    if not item or not currentPlayer or currentCid~=expectedOwner or not Phone.sameCharacter(src,expectedOwner) then return false end
    if not Phone.removeItem(src,simItemName(),1,item.Slot) then return false end
    if Phone.findSimItem(src,id) then return false end
    local taken=1
    if tonumber(sim.inventory_issued)==1 then taken=PhoneDB.update('UPDATE sim_cards SET inventory_issued=0 WHERE sim_id=? AND owner_citizenid=? AND inventory_issued=1',{id,expectedOwner}) end
    if not taken or taken<1 then
        local currentPlayer,currentCid=character(src)
        if currentPlayer and currentCid==expectedOwner then Phone.addItem(src,simItemName(),1,item.Metadata or {sim_id=id,phone_number=sim.phone_number,description='SIM '..sim.phone_number},item.Slot) end
        return false
    end
    return true
end
function D.syncSimItems(src)
    local _,cid=character(src);if not cid then return false end
    local sims=PhoneDB.query('SELECT s.sim_id FROM sim_cards s LEFT JOIN peak_phone_devices d ON d.sim_id=s.sim_id WHERE s.owner_citizenid=? AND d.device_id IS NULL AND s.inventory_issued=0',{cid}) or {}
    for _,sim in ipairs(sims) do if not giveSimItem(src,sim.sim_id,nil,cid) then return false end end
    return true
end
local function simBusy(src)
    return Phone.Calls and Phone.Calls.bySource[tonumber(src)] or Phone.KiloLive and Phone.KiloLive.bySource and Phone.KiloLive.bySource[tonumber(src)]
end
local function provisionBlankSim(src,slot,expectedOwner)
    local numericSlot=Phone.number(slot,1000)
    if not numericSlot or not expectedOwner then return nil end
    return Phone.withLocks({'phone-sim-slot:'..tostring(src)..':'..tostring(numericSlot),'phone-sim-issue:'..expectedOwner},function()
        local p,cid=character(src)
        local item=p and Phone.inventorySlot(src,numericSlot)
        if not p or cid~=expectedOwner or not item or item.Name~=simItemName() or item.Amount~=1 or item.Info.sim_id~=nil then return nil end
        local card=CreateSimCard(cid)
        if not card then return nil end
        local currentPlayer,currentCid=character(src)
        local currentItem=currentPlayer and Phone.inventorySlot(src,numericSlot)
        if currentCid~=cid or not currentItem or currentItem.Name~=item.Name or not same(currentItem.Info,item.Info) then
            PhoneDB.update('DELETE FROM sim_cards WHERE sim_id=? AND owner_citizenid=? AND inventory_issued=0 AND NOT EXISTS (SELECT 1 FROM peak_phone_devices WHERE sim_id=?)',{card.SimId,cid,card.SimId})
            return nil
        end
        local claimed=PhoneDB.update('UPDATE sim_cards SET inventory_issued=1 WHERE sim_id=? AND owner_citizenid=? AND inventory_issued=0',{card.SimId,cid})
        if not claimed or claimed<1 then
            PhoneDB.update('DELETE FROM sim_cards WHERE sim_id=? AND owner_citizenid=? AND inventory_issued=0 AND NOT EXISTS (SELECT 1 FROM peak_phone_devices WHERE sim_id=?)',{card.SimId,cid,card.SimId})
            return nil
        end
        local info=Phone.copy(item.Info or {})
        info.sim_id=card.SimId;info.phone_number=card.PhoneNumber;info.description='SIM '..card.PhoneNumber
        local beforeRemovePlayer,beforeRemoveCid=character(src)
        local beforeRemoveItem=beforeRemovePlayer and Phone.inventorySlot(src,numericSlot)
        if beforeRemoveCid~=cid or not beforeRemoveItem or beforeRemoveItem.Name~=item.Name or beforeRemoveItem.Amount~=1 or not same(beforeRemoveItem.Info,item.Info) then
            PhoneDB.update('DELETE FROM sim_cards WHERE sim_id=? AND owner_citizenid=? AND inventory_issued=1 AND NOT EXISTS (SELECT 1 FROM peak_phone_devices WHERE sim_id=?)',{card.SimId,cid,card.SimId})
            return nil
        end
        if not Phone.removeItem(src,simItemName(),1,item.Slot) then
            PhoneDB.update('DELETE FROM sim_cards WHERE sim_id=? AND owner_citizenid=? AND inventory_issued=1 AND NOT EXISTS (SELECT 1 FROM peak_phone_devices WHERE sim_id=?)',{card.SimId,cid,card.SimId})
            return nil
        end
        local afterRemove,afterCid=character(src)
        local afterItem=afterRemove and Phone.inventorySlot(src,numericSlot)
        if afterCid~=cid or afterItem then
            if afterCid==cid and not afterItem then Phone.addItem(src,simItemName(),1,item.Info or {},numericSlot) end
            PhoneDB.update('DELETE FROM sim_cards WHERE sim_id=? AND owner_citizenid=? AND inventory_issued=1 AND NOT EXISTS (SELECT 1 FROM peak_phone_devices WHERE sim_id=?)',{card.SimId,cid,card.SimId})
            return nil
        end
        if not Phone.addItem(src,simItemName(),1,info,numericSlot) then
            local restored=Phone.addItem(src,simItemName(),1,item.Info or {},numericSlot)
            if not restored then print(('[peak-phone] Failed to restore blank SIM for source %s slot %s'):format(src,numericSlot)) end
            PhoneDB.update('DELETE FROM sim_cards WHERE sim_id=? AND owner_citizenid=? AND inventory_issued=1 AND NOT EXISTS (SELECT 1 FROM peak_phone_devices WHERE sim_id=?)',{card.SimId,cid,card.SimId})
            return nil
        end
        return card.SimId
    end)
end
PhonePeak.Functions.CreateCallback('peak-phone:devices:simBegin',function(src,cb,data)
    local ctx,err=current(src,true,data and data.Generation);if not ctx then return cb(Phone.publicError(err)) end
    if data and data.PhoneSlot then
        local selected,reason=inventoryDevice(src,data.PhoneSlot)
        if not selected or selected.device.device_id~=ctx.device.device_id then return cb(Phone.publicError(reason or 'The phone item changed.')) end
    end
    if simBusy(src) then return cb(Phone.publicError('End the active call or broadcast before changing the SIM.')) end
    local prior=simOperations[src]
    if prior and prior.expires>now() and not prior.completed then return cb(Phone.publicError('A SIM operation is already in progress.')) end
    local action=data and data.Action;local id
    local priorSim=ctx.device.sim_id and GetSimCardBySimId(ctx.device.sim_id)
    if ctx.device.sim_id and (not priorSim or priorSim.owner_citizenid~=ctx.cid) then return cb(Phone.publicError('You do not own the SIM inserted in this device.')) end
    if action=='remove' then
        if not ctx.device.sim_id then return cb(Phone.publicError('This device has no SIM to remove.')) end
    elseif action=='insert' then
        id=Phone.string(data.SimId,20)
        if data.SimSlot then
            local item=Phone.inventorySlot(src,data.SimSlot)
            if not item or item.Name~=simItemName() then return cb(Phone.publicError('That pocket slot no longer contains a SIM card.')) end
            id=item.Info.sim_id
            if id==nil then id=provisionBlankSim(src,data.SimSlot,ctx.cid) end
        end
        local sim=id and GetSimCardBySimId(id)
        if not sim or sim.owner_citizenid~=ctx.cid then return cb(Phone.publicError('You do not own that SIM.')) end
        if not Phone.findSimItem(src,id) then return cb(Phone.publicError('Carry that physical SIM card in your inventory.')) end
        if ctx.device.sim_id==id then return cb(Phone.publicError('That SIM is already inserted.')) end
        local used=PhoneDB.one('SELECT device_id FROM peak_phone_devices WHERE sim_id=? AND device_id<>?',{id,ctx.device.device_id})
        if used then return cb(Phone.publicError('That SIM is already inserted in another device.')) end
    else return cb(Phone.publicError('Invalid SIM action.')) end
    local target=data and data.TargetSlot
    if target and (not Phone.number(target,1000) or Phone.inventorySlot(src,target)) then return cb(Phone.publicError('Drop the SIM into an empty pocket slot.')) end
    local operation={id=random('SIM-',16),token=random('',32),src=src,cid=ctx.cid,device=ctx.device.device_id,generation=tonumber(ctx.session.generation),action=action,sim=id,prior=ctx.device.sim_id,expires=now()+15000,phoneSlot=data and data.PhoneSlot,simSlot=data and data.SimSlot,targetSlot=target}
    simOperations[src]=operation;cb({Success=true,OperationId=operation.id,Token=operation.token,ExpiresAt=operation.expires})
end)
PhonePeak.Functions.CreateCallback('peak-phone:devices:simCancel',function(src,cb,data)
    local op=simOperations[src]
    if op and data and data.OperationId==op.id and data.Token==op.token and not op.completed then simOperations[src]=nil end
    cb({Success=true})
end)
local function simCommit(src,cb,data)
    local op=simOperations[src]
    if not op or not data or data.OperationId~=op.id or data.Token~=op.token then return cb(Phone.publicError('The SIM operation expired. Refresh before retrying.')) end
    if op.completed then return cb(op.result) end
    if op.expires<=now() then simOperations[src]=nil;return cb(Phone.publicError('The SIM operation expired. Refresh before retrying.')) end
    if simBusy(src) then simOperations[src]=nil;return cb(Phone.publicError('A call or broadcast interrupted the SIM operation.')) end
    local ctx,err=current(src,true,op.generation);if not ctx or ctx.cid~=op.cid or ctx.device.device_id~=op.device then simOperations[src]=nil;return cb(Phone.publicError(err or 'Device identity changed.')) end
    if op.phoneSlot then local selected=inventoryDevice(src,op.phoneSlot);if not selected or selected.device.device_id~=op.device then simOperations[src]=nil;return cb(Phone.publicError('The phone moved during the animation.')) end end
    if op.simSlot then local item=Phone.inventorySlot(src,op.simSlot);if not item or item.Name~=simItemName() or item.Info.sim_id~=op.sim then simOperations[src]=nil;return cb(Phone.publicError('The SIM moved during the animation.')) end end
    if op.targetSlot and Phone.inventorySlot(src,op.targetSlot) then simOperations[src]=nil;return cb(Phone.publicError('The destination pocket is no longer empty.')) end
    if op.action=='insert' and not Phone.findSimItem(src,op.sim) then simOperations[src]=nil;return cb(Phone.publicError('The physical SIM card left your inventory.')) end
    local oldSim=op.prior and GetSimCardBySimId(op.prior)
    if op.prior and (not oldSim or oldSim.owner_citizenid~=op.cid) then simOperations[src]=nil;return cb(Phone.publicError('You no longer own the SIM previously inserted in this device.')) end
    if op.action=='insert' then
        local sim=GetSimCardBySimId(op.sim)
        if not sim or sim.owner_citizenid~=op.cid then simOperations[src]=nil;return cb(Phone.publicError('SIM ownership changed before commit.')) end
        local used=PhoneDB.one('SELECT device_id FROM peak_phone_devices WHERE sim_id=? AND device_id<>?',{op.sim,op.device})
        if used then simOperations[src]=nil;return cb(Phone.publicError('That SIM was claimed by another device.')) end
    end
    local updated
    if op.action=='remove' then
        updated=PhoneDB.update('UPDATE peak_phone_devices SET sim_id=NULL,updated_at=? WHERE device_id=? AND sim_id=?',{now(),op.device,op.prior})
    else
        local ok,result=pcall(PhoneDB.update,'UPDATE peak_phone_devices SET sim_id=?,updated_at=? WHERE device_id=? AND (sim_id <=> ?)',{op.sim,now(),op.device,op.prior})
        if not ok then simOperations[src]=nil;return cb(Phone.publicError('That SIM was claimed by another device. Refresh and retry.')) end;updated=result
    end
    if not updated or updated<1 then simOperations[src]=nil;return cb(Phone.publicError('Device state changed during the animation. Refresh before retrying.')) end
    local persisted=op.action=='insert' and PhoneDB.one('SELECT device_id FROM peak_phone_devices WHERE device_id=? AND sim_id=?',{op.device,op.sim}) or PhoneDB.one('SELECT device_id FROM peak_phone_devices WHERE device_id=? AND sim_id IS NULL',{op.device})
    if not persisted then simOperations[src]=nil;return cb(Phone.publicError('The SIM outcome is unresolved. Refresh before retrying.')) end
    if op.action=='remove' then
        if not giveSimItem(src,op.prior,op.targetSlot,op.cid) then
            PhoneDB.update('UPDATE peak_phone_devices SET sim_id=? WHERE device_id=? AND sim_id IS NULL',{op.prior,op.device})
            simOperations[src]=nil;return cb(Phone.publicError('Make inventory space for the removed SIM, then retry.'))
        end
    else
        if not takeSimItem(src,op.sim,op.cid,op.device) then
            PhoneDB.update('UPDATE peak_phone_devices SET sim_id=? WHERE device_id=? AND sim_id=?',{op.prior,op.device,op.sim})
            simOperations[src]=nil;return cb(Phone.publicError('The physical SIM card could not be taken. Refresh and retry.'))
        end
        if op.prior and not giveSimItem(src,op.prior,nil,op.cid) then
            PhoneDB.update('UPDATE peak_phone_devices SET sim_id=? WHERE device_id=? AND sim_id=?',{op.prior,op.device,op.sim})
            giveSimItem(src,op.sim,nil,op.cid)
            simOperations[src]=nil;return cb(Phone.publicError('Make inventory space for the previous SIM, then retry.'))
        end
    end
    if Phone.FindMy and Phone.FindMy.simChanged then
        Phone.FindMy.simChanged(src,op.cid,op.device,op.prior,oldSim and oldSim.owner_citizenid)
    end
    if not invalidateDevice(op.device,'SIM changed') then simOperations[src]=nil;return cb(Phone.publicError('The SIM changed, but session invalidation is unresolved. Reopen the phone.')) end
    op.completed=true;op.result={Success=true};op.expires=now()+30000;cb(op.result)
end
PhonePeak.Functions.CreateCallback('peak-phone:devices:simCommit',function(src,cb,data)
    return Phone.withLocks({'phone-sim-commit'},function() return simCommit(src,cb,data) end)
end)
AddEventHandler('playerDropped',function() simOperations[source]=nil end)
PhonePeak.Functions.CreateCallback('peak-phone:devices:status',function(src,cb,data)
    local p,cid=character(src);local session=ensure(src);if not p or not session or tonumber(data and data.Generation)~=tonumber(session.generation) then return cb(Phone.publicError('Device identity changed. Reopen Settings.')) end
    local requested=Phone.string(data and data.DeviceId,32) or session.device_id
    local device=access(cid,requested);local status=data.Status
    if not device or device.owner_citizenid~=cid or (status~='active' and status~='lost' and status~='revoked') then return cb(Phone.publicError('Invalid device status.')) end
    if device.status=='revoked' then return cb(Phone.publicError('A revoked device cannot be restored from the phone.')) end
    local updated=PhoneDB.update('UPDATE peak_phone_devices SET status=?,updated_at=? WHERE device_id=? AND owner_citizenid=?',{status,now(),device.device_id,cid})
    if not updated or updated<1 then return cb(Phone.publicError('Device status was not changed.')) end
    if not invalidateDevice(device.device_id,'Device status changed') then return cb(Phone.publicError('Status changed, but session invalidation is unresolved. Reopen the phone.')) end
    cb({Success=true})
end)
-- Server-only purchase/shop hook. The caller remains responsible for charging before issuing.
exports('IssueDevice',function(target,label)
    if not GetInvokingResource() then return false,'IssueDevice is server-only.' end
    local p,cid=character(tonumber(target));if not p then return false,'Player is unavailable.' end
    local count=PhoneDB.one('SELECT COUNT(*) n FROM peak_phone_devices WHERE owner_citizenid=?',{cid})
    if tonumber(count and count.n or 0)>=PhoneConfig.Devices.MaxOwned then return false,'Device limit reached.' end
    label=Phone.string(label,60) or 'Peak Duo'
    for _=1,12 do
        local id=random('DUO-',12)
        local mode=Phone.inventoryMode();local ok=PhoneDB.update('INSERT IGNORE INTO peak_phone_devices(device_id,owner_citizenid,label,inventory_mode,created_at,updated_at) VALUES (?,?,?,?,?,?)',{id,cid,label,mode,now(),now()})
        if ok and ok>0 then
            if mode=='unique' and not Phone.addItem(tonumber(target),PhoneConfig.PhoneItem,1,{device_id=id,label=label}) then PhoneDB.update('DELETE FROM peak_phone_devices WHERE device_id=? AND owner_citizenid=?',{id,cid});return false,'Inventory was full; device issuance was rolled back.' end
            return true,{DeviceId=id,Label=label,InventoryMode=mode}
        end
    end
    return false,'Could not allocate a unique device ID.'
end)
exports('InitializeDeviceItem',function(target,slot)
    if not GetInvokingResource() then return false,'InitializeDeviceItem is server-only.' end
    return D.initializeItem(tonumber(target),tonumber(slot))
end)
exports('GetActiveDevice',function(target) return D.active(tonumber(target)) end)
