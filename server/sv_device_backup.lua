-- Backups belong to characters, independently of a phone/SIM and its PIN.
local function context(src,data,locked)
    local player=Phone.getPlayer(src);local active=player and Phone.Devices.active(src)
    if not player or not active or not active.DeviceId or active.Status~='active' then return nil,'Phone is unavailable.' end
    if not locked and active.Locked then return nil,'Unlock your phone first.' end
    if not data or tonumber(data.Generation)~=tonumber(active.Generation) then return nil,'Device identity changed. Reopen your phone.' end
    local cid=player.PlayerData.citizenid
    local device=PhoneDB.one('SELECT * FROM peak_phone_devices WHERE device_id=? AND owner_citizenid=?',{active.DeviceId,cid})
    if not device or not (device.inventory_mode=='count' and Phone.hasPhone(src) or Phone.findDeviceItem(src,device.device_id)) then return nil,'Only the owner carrying this phone can manage its backup or reset.' end
    return {cid=cid,device=device,active=active}
end
local function preferences(data)
    local out={};for key,default in pairs(PhoneConfig.DefaultPreferences or {}) do
        local value=type(data)=='table' and data[key]
        if type(value)==type(default) and (type(value)~='string' or #value<=2048) and (type(value)~='number' or (value==value and math.abs(value)<=1000000)) then out[key]=value end
    end
    for _,key in ipairs({'Notifications.SMS','Notifications.Tweet','Notifications.Email','Images.Embedded'}) do if type(data)=='table' and type(data[key])=='boolean' then out[key]=data[key] end end
    return out
end
local function backup(ctx,prefs)
    local contacts=PhoneDB.query('SELECT name,phone FROM phone_contacts WHERE citizenid=? ORDER BY id LIMIT 1000',{ctx.cid}) or {}
    local id=PhoneDB.insert('INSERT INTO peak_phone_backups(citizenid,device_id,contacts,preferences,created_at) VALUES (?,?,?,?,?)',{ctx.cid,ctx.device.device_id,json.encode(contacts),json.encode(preferences(prefs)),os.time()*1000})
    if not id then return nil end
    -- Retain the most recent five; resolve IDs first so MariaDB accepts DELETE.
    local older=PhoneDB.query('SELECT id FROM peak_phone_backups WHERE citizenid=? ORDER BY id DESC LIMIT 100 OFFSET 5',{ctx.cid}) or {}
    for _,row in ipairs(older) do PhoneDB.update('DELETE FROM peak_phone_backups WHERE citizenid=? AND id=?',{ctx.cid,row.id}) end
    return id,#contacts
end
PhonePeak.Functions.CreateCallback('peak-phone:devices:backup',function(src,cb,data)
    local ctx,err=context(src,data,false);if not ctx then return cb(Phone.publicError(err)) end
    cb(Phone.withLocks({'contacts:'..ctx.cid,'device-backup:'..ctx.cid},function()
        local current,reason=context(src,data,false);if not current or current.cid~=ctx.cid then return Phone.publicError(reason or 'Character changed.') end
        local id,count=backup(current,data.Preferences);return id and {Success=true,BackupId=id,Contacts=count} or Phone.publicError('Backup could not be saved.')
    end))
end)
PhonePeak.Functions.CreateCallback('peak-phone:devices:restore',function(src,cb,data)
    local ctx,err=context(src,data,false);if not ctx then return cb(Phone.publicError(err)) end
    local id=Phone.number(data.BackupId,9007199254740991);if not id then return cb(Phone.publicError('Choose a saved backup.')) end
    cb(Phone.withLocks({'contacts:'..ctx.cid,'device-backup:'..ctx.cid},function()
        local row=PhoneDB.one('SELECT contacts,preferences FROM peak_phone_backups WHERE id=? AND citizenid=?',{id,ctx.cid})
        if not row then return Phone.publicError('That backup does not belong to this character.') end
        local ctxNow,reason=context(src,data,false);if not ctxNow or ctxNow.cid~=ctx.cid then return Phone.publicError(reason or 'Character changed.') end
        local saved=Phone.decode(row.contacts);local statements={};local total=PhoneDB.one('SELECT COUNT(*) n FROM phone_contacts WHERE citizenid=?',{ctx.cid})
        local present={};for _,contact in ipairs(PhoneDB.query('SELECT phone FROM phone_contacts WHERE citizenid=? LIMIT 1000',{ctx.cid}) or {}) do present[contact.phone]=true end
        for i,contact in ipairs(saved) do
            if i>1000 then break end
            local name,number=Phone.string(contact.name,100),Phone.phone(contact.phone)
            if name and number and not present[number] then
                present[number]=true
                statements[#statements+1]={query='INSERT INTO phone_contacts(citizenid,name,phone) SELECT ?,?,? WHERE NOT EXISTS (SELECT 1 FROM phone_contacts WHERE citizenid=? AND phone=?)',values={ctx.cid,name,number,ctx.cid,number}}
            end
        end
        if tonumber(total and total.n or 0)+#statements>1000 then return Phone.publicError('Too many contacts to restore safely.') end
        if #statements>0 and not PhoneDB.transaction(statements) then return Phone.publicError('Contacts could not be restored.') end
        return {Success=true,Preferences=preferences(Phone.decode(row.preferences))}
    end))
end)
PhonePeak.Functions.CreateCallback('peak-phone:devices:reset',function(src,cb,data)
    local ctx,err=context(src,data,true);if not ctx then return cb(Phone.publicError(err)) end
    if data.Confirm~='RESET' then return cb(Phone.publicError('Type RESET to confirm.')) end
    cb(Phone.withLocks({'contacts:'..ctx.cid,'device-backup:'..ctx.cid},function()
        local current,reason=context(src,data,true);if not current or current.cid~=ctx.cid then return Phone.publicError(reason or 'Character changed.') end
        local id=backup(current,data.Preferences);if not id then return Phone.publicError('Reset stopped because the backup could not be saved.') end
        local committed=PhoneDB.transaction({
            {query='UPDATE peak_phone_devices SET pin_hash=NULL,pin_salt=NULL,recovery_hash=NULL,recovery_salt=NULL,failed_unlocks=0,locked_until=0,updated_at=? WHERE device_id=? AND owner_citizenid=?',values={os.time()*1000,ctx.device.device_id,ctx.cid}},
            {query='UPDATE peak_phone_device_sessions SET generation=generation+1,unlocked=0,updated_at=? WHERE device_id=?',values={os.time()*1000,ctx.device.device_id}},
        })
        if not committed then return Phone.publicError('Device reset could not be saved. Your backup is retained.') end
        if Phone.DuoProp and Phone.DuoProp.invalidateIdentity then Phone.DuoProp.invalidateIdentity(src,ctx.cid) end
        TriggerClientEvent('peak-phone:portable:identityInvalidating',src,'Phone lock and settings reset; contacts retained.')
        TriggerClientEvent('peak-phone:portable:deviceReset',src)
        SetTimeout(100,function()TriggerClientEvent('peak-phone:portable:identityChanged',src,'Phone lock and settings reset; contacts retained.')end)
        return {Success=true,BackupId=id}
    end))
end)
