-- The legacy app ABI lives inside this resource only. All player state comes from a real core.
local bridge = exports['peak-bridge']
Phone.Server = { Profiles = {}, Initializing = {}, Framework = nil, Callbacks = {}, Events = {}, Rate = {} }
local PS=Phone.Server
local originalRegister, originalAdd = RegisterNetEvent, AddEventHandler
Phone.NativeRegisterNetEvent, Phone.NativeAddEventHandler = originalRegister, originalAdd

function Phone.framework()
    if PS.Framework then return PS.Framework end
    if not Phone.started('peak-bridge') or not bridge:IsReady() then error('peak-bridge is not ready') end
    local actual=bridge:GetFrameworkName()
    local expected=PhoneConfig.Framework
    if expected=='qb' then expected='qbcore' elseif expected=='qbx' then expected='qbox' end
    if expected~='auto' and expected~=actual then error('PhoneConfig.Framework does not match peak-bridge: '..tostring(actual)) end
    if actual~='qbcore' and actual~='qbox' and actual~='esx' and actual~='peak-core' then
        error('Supported phone cores are QBCore, Qbox and ESX; detected '..tostring(actual))
    end
    PS.Framework=actual;return actual
end
function Phone.rawPlayer(src)
    -- FiveM server IDs are zero-based. Source 0 is a real player when
    -- GetPlayerName(0) is populated, so rejecting it strands that character.
    src=tonumber(src);if not src or src<0 then return nil end
    local f=Phone.framework()
    if f=='qbox' then return exports.qbx_core:GetPlayer(src) end
    return bridge:GetPlayer(src)
end
function Phone.rawIdentity(raw)
    if not raw then return nil end
    if raw.PlayerData then return raw.PlayerData.citizenid end
    return raw.identifier or (raw.getIdentifier and raw.getIdentifier())
end
function Phone.rawCharacter(raw)
    if raw.PlayerData then return Phone.copy(raw.PlayerData.charinfo or {}) end
    local name=raw.getName and raw.getName() or ''
    local first,last=name:match('^(%S+)%s+(.+)$');first=first or name;last=last or ''
    local function get(k) if raw.get then local ok,v=pcall(raw.get,k);if ok then return v end end end
    return {firstname=get('firstName') or first,lastname=get('lastName') or last,birthdate=get('dateofbirth')}
end
local function importPhone(raw)
    -- Prefer an installed SIM from the original stack without rewriting inventory data.
    local items=raw.PlayerData and raw.PlayerData.items or {}
    for _,v in pairs(items or {}) do
        if (v.name or v.Item)==PhoneConfig.PhoneItem then
            local info=v.info or v.Info or v.metadata or {}
            local sim=info.InsertedSim
            if sim and Phone.phone(sim.PhoneNumber) then return Phone.phone(sim.PhoneNumber) end
        end
    end
    return Phone.phone(Phone.rawCharacter(raw).phone)
end
function Phone.profile(src,raw)
    local cid=Phone.rawIdentity(raw)
    if not Phone.text(cid,128) then return nil end
    if PS.Profiles[cid] then return PS.Profiles[cid] end
    if PS.Initializing[cid] then
        local untilAt=GetGameTimer()+30000
        while PS.Initializing[cid] and GetGameTimer()<untilAt do Wait(25) end
        if PS.Profiles[cid] then return PS.Profiles[cid] end
        if PS.Initializing[cid] then error('Character initialization timed out') end
    end
    PS.Initializing[cid]=true
    local ok,result=pcall(function()
        PhoneDB.wait()
        local row=PhoneDB.one('SELECT * FROM peak_phone_characters WHERE citizenid = ?', {cid})
        if not row then
            local preferred=importPhone(raw)
            local prior=PhoneDB.one('SELECT phone_number FROM sim_cards WHERE owner_citizenid = ? ORDER BY id LIMIT 1',{cid})
            preferred=preferred or (prior and prior.phone_number)
            for attempt=1,12 do
                local number=attempt==1 and preferred or PhonePeak.Player.CreatePhoneNumber()
                number=number or PhonePeak.Player.CreatePhoneNumber()
                local taken=PhoneDB.one('SELECT owner_citizenid FROM sim_cards WHERE phone_number = ?',{number})
                if not taken or taken.owner_citizenid==cid then
                    local sim='SIM-'..PhonePeak.Shared.RandomStr(8)..PhonePeak.Shared.RandomInt(4)
                    local char=Phone.rawCharacter(raw);char.phone=number;char.account=cid
                    local nativeCrypto=raw.PlayerData and raw.PlayerData.money and raw.PlayerData.money.crypto
                    local crypto=type(nativeCrypto)=='table' and nativeCrypto or {}
                    local success=PhoneDB.transaction({
                        {query='INSERT INTO peak_phone_characters (citizenid, phone_number, charinfo, metadata, crypto, created_at) VALUES (?, ?, ?, ?, ?, ?)',values={cid,number,json.encode(char),'{}',json.encode(crypto),os.time()*1000}},
                        {query='INSERT IGNORE INTO sim_cards (sim_id,phone_number,owner_citizenid,created_at) VALUES (?, ?, ?, ?)',values={sim,number,cid,os.time()*1000}},
                    })
                    if success then row=PhoneDB.one('SELECT * FROM peak_phone_characters WHERE citizenid=?',{cid});break end
                end
            end
            if not row then error('Could not reserve a unique phone number; check database permissions') end
            for _,app in ipairs(PhoneConfig.DefaultApps) do
                PhoneDB.query('INSERT IGNORE INTO phone_installed_apps (phone,app_id) VALUES (?,?)',{row.phone_number,app})
            end
        end
        row.metadata=Phone.decode(row.metadata);row.crypto=Phone.decode(row.crypto);row.charinfo=Phone.decode(row.charinfo)
        return row
    end)
    PS.Initializing[cid]=nil
    if not ok then error(result) end
    PS.Profiles[cid]=result;return result
end
function Phone.saveProfile(row)
    -- Crypto has dedicated transactional writers. Leaving it out of profile saves
    -- prevents a queued SIM update from replaying an old wallet snapshot.
    PhoneDB.query('UPDATE peak_phone_characters SET phone_number=?,charinfo=?,metadata=? WHERE citizenid=?',
        {row.phone_number,json.encode(row.charinfo),json.encode(row.metadata),row.citizenid})
end
function Phone.hasItem(src,item,count)
    return bridge:HasItem(tonumber(src),item,count or 1)==true
end
function Phone.hasPhone(src)
    if not Phone.hasItem(src,PhoneConfig.PhoneItem,1) then return false end
    local item=Phone.inventorySlot(src,PhoneConfig.PhoneSlot)
    return item~=nil and item.Name==PhoneConfig.PhoneItem and item.Amount>=1
end
function Phone.inventoryMode()
    local configured=PhoneConfig.Devices and PhoneConfig.Devices.InventoryMode
    if configured=='count' or configured=='unique' then return configured end
    local name=tostring(bridge:GetInventoryName() or ''):lower()
    if name=='ox_inventory' or name=='peak-inventory' or name:find('qb%-inventory') or name:find('qbox') then return 'unique' end
    return 'count'
end
function Phone.addItem(src,item,count,metadata,slot) return bridge:AddItem(tonumber(src),item,count or 1,metadata or {},slot)==true end
function Phone.removeItem(src,item,count,slot) return bridge:RemoveItem(tonumber(src),item,count or 1,slot)==true end
function Phone.carriedItems(src,name)
    local inv=tostring(bridge:GetInventoryName() or ''):lower()
    if inv=='ox_inventory' then
        local ok,items=pcall(function() return exports.ox_inventory:Search(src,'slots',name) end)
        if ok and type(items)=='table' then return items end
    elseif inv=='peak-inventory' or inv=='qb-inventory' then
        local ok,items=pcall(function() return exports[inv]:GetItemsByName(src,name) end)
        if ok and type(items)=='table' then return items end
    end
    local raw=Phone.rawPlayer(src);return raw and raw.PlayerData and raw.PlayerData.items or {}
end
function Phone.findDeviceItem(src,deviceId)
    if Phone.inventoryMode()~='unique' then return Phone.hasPhone(src) and {Mode='count'} or nil end
    local items=Phone.carriedItems(src,PhoneConfig.PhoneItem)
    for _,item in pairs(items) do local meta=item.metadata or item.info or item.Info or {};if (item.name or item.Item)==PhoneConfig.PhoneItem and tonumber(item.slot or item.Slot)==PhoneConfig.PhoneSlot and meta.device_id==deviceId then return {Mode='unique',Slot=item.slot or item.Slot,Metadata=meta} end end
    return nil
end
function Phone.findSimItem(src,simId)
    local name=PhoneConfig.SimItem or 'simcard'
    local items=Phone.carriedItems(src,name)
    for _,item in pairs(items) do
        local meta=item.metadata or item.info or item.Info or {}
        if (item.name or item.Item)==name and meta.sim_id==simId then
            return {Slot=item.slot or item.Slot,Metadata=meta}
        end
    end
    return nil
end
function Phone.inventorySlot(src,slot)
    slot=Phone.number(slot,1000);if not slot then return nil end
    local inv=bridge:GetInventoryName();local raw
    if inv=='ox_inventory' then raw=exports.ox_inventory:GetSlot(src,slot)
    else
        if inv=='peak-inventory' or inv=='qb-inventory' then
            local ok,value=pcall(function() return exports[inv]:GetItemBySlot(src,slot) end)
            if ok then raw=value end
        end
        local player=Phone.rawPlayer(src)
        if not raw and player and player.PlayerData then
            raw=(player.PlayerData.items or {})[slot] or (player.PlayerData.items or {})[tostring(slot)]
            if not raw and player.Functions and player.Functions.GetItemBySlot then raw=player.Functions.GetItemBySlot(slot) end
        end
    end
    if not raw then return nil end
    return {Item=raw.name or raw.Item,Name=raw.name or raw.Item,Amount=raw.count or raw.amount or raw.Amount or 1,
        Info=Phone.copy(raw.metadata or raw.info or raw.Info or {}),Slot=raw.slot or raw.Slot or slot}
end
function Phone.notify(src,message,kind,duration)
    TriggerClientEvent('peak-phone:portable:notify',tonumber(src),tostring(message),kind or 'inform',duration or 5000)
end
function Phone.nativeMoney(src,account)
    local n=bridge:GetMoney(src,account or 'bank');return tonumber(n) or 0
end
function Phone.removeMoney(src,account,amount,reason)
    amount=Phone.number(amount,1000000000);if not amount then return false,'invalid' end
    if Phone.nativeMoney(src,account)<amount then return false,'insufficient' end
    -- No implicit ESX overdrafts: peak-bridge's ESX primitive alone does not check balance.
    local result=bridge:RemoveMoney(src,amount,account,reason or 'peak-duo')
    return result==true,result
end
function Phone.addMoney(src,account,amount,reason)
    amount=Phone.number(amount,1000000000);if not amount then return false,'invalid' end
    local result=bridge:AddMoney(src,amount,account,reason or 'peak-duo')
    return result==true,result
end
function Phone.getPlayer(src)
    src=tonumber(src);local raw=Phone.rawPlayer(src);if not raw then return nil end
    local cid=Phone.rawIdentity(raw);if not cid then return nil end
    local row=Phone.profile(src,raw);if not row then return nil end
    local data=raw.PlayerData and Phone.copy(raw.PlayerData) or {}
    local job=Phone.copy(data.job or raw.job or (raw.getJob and raw.getJob()) or {name='unemployed',label='Unemployed',grade=0})
    if type(job.grade)~='table' then job.grade={level=tonumber(job.grade) or 0,name=job.grade_name or 'Employee'} end
    if job.onduty==nil then job.onduty=true end
    data.source=src;data.citizenid=cid;data.job=job
    data.charinfo=Phone.rawCharacter(raw);data.charinfo.phone=row.phone_number;data.charinfo.account=cid
    data.charinfo.firstname=data.charinfo.firstname or '';data.charinfo.lastname=data.charinfo.lastname or ''
    data.metadata=data.metadata or {}
    if not raw.PlayerData and raw.getMeta then local ok,meta=pcall(raw.getMeta);if ok and type(meta)=='table' then data.metadata=Phone.copy(meta) end end
    for k,v in pairs(row.metadata) do if k:match('^phone') then data.metadata[k]=v end end
    data.metadata.licenses=data.metadata.licenses or data.metadata.licences or {}
    data.metadata.apartmentid=data.metadata.apartmentid or ''
    data.money={cash=Phone.nativeMoney(src,'cash'),bank=Phone.nativeMoney(src,'bank'),casino=0,crypto=Phone.copy(row.crypto)}
    local p={PlayerData=data,Functions={},Raw=raw};local fn=p.Functions
    fn.Notify=function(msg,kind,time) Phone.notify(src,msg,kind,time) end
    fn.HasEnoughOfItem=function(item,count) return Phone.hasItem(src,item,count) end
    fn.GetItemBySlot=function(slot) return Phone.inventorySlot(src,slot) end
    fn.AddItem=function(item,amount,slot,info) return bridge:AddItem(src,item,amount,type(info)=='table' and info or {},tonumber(slot))==true end
    fn.RemoveItem=function(item,amount,slot) return bridge:RemoveItem(src,item,amount,tonumber(slot))==true end
    fn.AddMoney=function(account,amount,reason) return Phone.addMoney(src,account,amount,reason) end
    fn.RemoveMoney=function(account,amount,reason) return Phone.removeMoney(src,account,amount,reason) end
    fn.SetMetaData=function(key,value)
        assert(type(key)=='string' and key:match('^phone') and #key<=64,'Phone may only write phone-owned metadata')
        Phone.withLocks({'profile:'..cid},function()
            if not Phone.sameCharacter(src,cid) then return end
            local current=PhoneDB.one('SELECT metadata FROM peak_phone_characters WHERE citizenid=?',{cid})
            local metadata=Phone.decode(current and current.metadata);metadata[key]=value
            PhoneDB.update('UPDATE peak_phone_characters SET metadata=? WHERE citizenid=?',{json.encode(metadata),cid});row.metadata=metadata
        end);Phone.refresh(src)
    end
    local function coins(id,amount,remove)
        amount=Phone.number(amount,PhoneConfig.Money.MaxCryptoUnits);if not amount or not Phone.text(id,64) then return false end
        return Phone.withLocks({'profile:'..cid},function()
            if not Phone.sameCharacter(src,cid) or (Phone.Wallet and Phone.Wallet.pending(cid)) then return false end
            local current=PhoneDB.one('SELECT crypto FROM peak_phone_characters WHERE citizenid=?',{cid});local c=Phone.decode(current and current.crypto)
            local total=(tonumber(c[id]) or 0)+(remove and -amount or amount)
            if total<0 or total>PhoneConfig.Money.MaxCryptoUnits then return false end
            c[id]=total;PhoneDB.update('UPDATE peak_phone_characters SET crypto=? WHERE citizenid=?',{json.encode(c),cid});row.crypto=c;Phone.refresh(src);return true
        end)
    end
    fn.AddCrypto=function(id,amount) return coins(id,amount,false) end
    fn.RemoveCrypto=function(id,amount) return coins(id,amount,true) end
    return p
end
-- Legacy phone content is keyed by the SIM's original character. Keep that
-- data accessible through the inserted card without changing gameplay identity.
function Phone.simCitizenId(src)
    local active=GetActiveSimData and GetActiveSimData(src)
    local sim=active and active.SimId and GetSimCardBySimId(active.SimId)
    if sim then return sim.owner_citizenid or sim.sim_id end
    if not Phone.Devices then local p=Phone.getPlayer(src);return p and p.PlayerData.citizenid end
end
function Phone.sameSim(src,cid) return cid~=nil and Phone.simCitizenId(src)==cid end
PhonePeak.Functions.GetPlayer=Phone.getPlayer
PhonePeak.Functions.GetPlayers=function() local t={};for _,v in ipairs(GetPlayers()) do t[#t+1]=tonumber(v) end;return t end
PhonePeak.GetPlayers=function() local t={};for _,v in ipairs(GetPlayers()) do t[#t+1]={ServerId=tonumber(v)} end;return t end
PhonePeak.Functions.GetPlayerByCitizenId=function(cid)
    for _,v in ipairs(GetPlayers()) do local raw=Phone.rawPlayer(v);if Phone.rawIdentity(raw)==cid then return Phone.getPlayer(v) end end
end
PhonePeak.Functions.GetPlayerByPhone=function(number)
    number=Phone.phone(number);if not number then return nil end
    for _,v in ipairs(GetPlayers()) do local p=Phone.getPlayer(v);if p and p.PlayerData.charinfo.phone==number then return p end end
end
PhonePeak.Functions.GetPlayerCharName=function(cid)
    local p=PhonePeak.Functions.GetPlayerByCitizenId(cid);local c
    if p then c=p.PlayerData.charinfo else local r=PhoneDB.one('SELECT charinfo FROM peak_phone_characters WHERE citizenid=?',{cid});c=r and Phone.decode(r.charinfo) end
    return c and Phone.trim((c.firstname or '')..' '..(c.lastname or '')) or 'Unknown Citizen'
end
PhonePeak.Functions.GetPlayerCharNameByPhone=function(number)
    local r=PhoneDB.one('SELECT citizenid FROM peak_phone_characters WHERE phone_number=?',{Phone.phone(number) or ''})
    return r and PhonePeak.Functions.GetPlayerCharName(r.citizenid)
end
PhonePeak.Functions.HasPermission=function(src,role)
    if tonumber(src)==0 and not GetPlayerName(0) then return true end
    if IsPlayerAceAllowed(tostring(src),'peak.phone.admin') then return true end
    if Phone.framework()=='esx' then local p=Phone.rawPlayer(src);local g=p and p.getGroup and p.getGroup();return g=='admin' or g=='superadmin' end
    if Phone.framework()=='qbox' then return IsPlayerAceAllowed(tostring(src),role=='god' and 'group.god' or 'group.admin') end
    local core=bridge:GetFramework();return core and core.Functions and core.Functions.HasPermission and core.Functions.HasPermission(src,role)==true or false
end
PhonePeak.Commands.Add=function(name,help,args,required,fn,permission)
    RegisterCommand(name,function(src,argv,raw)
        if permission and permission~='user' and not PhonePeak.Functions.HasPermission(src,permission) then return end
        fn(src,argv,raw)
    end,false)
end
function Phone.refresh(src)
    local p=Phone.getPlayer(src);if not p then return end
    TriggerClientEvent('peak-phone:portable:player',src,p.PlayerData)
end
-- Token buckets are resource-local and do not replace ownership checks in each operation.
function Phone.rate(src,key,limit,window)
    local now=GetGameTimer();local id=tostring(src)..':'..key;local r=PS.Rate[id]
    if not r or now-r.at>=(window or 1000) then r={at=now,count=0};PS.Rate[id]=r end
    r.count=r.count+1;return r.count<=(limit or 10)
end
function Phone.authorized(src,name,args)
    src=tonumber(src);if not src or src<0 then return true end
    if not Phone.rate(src,'all',100,1000) or not Phone.rate(src,name,12,1000) then return false,'Too many phone requests. Wait a moment and try again.' end
    local ok,bytes=pcall(json.encode,args or {});if not ok or #bytes>131072 then return false end
    if not Phone.rawPlayer(src) then return false,'Your character is still loading. Try again in a moment.' end
    local ownerApps=Phone.ownerAppsForRequest and Phone.ownerAppsForRequest(name,args,src)
    if type(ownerApps)~='table' then
        ownerApps={}
        local ownerApp=Phone.ownerAppForRequest and Phone.ownerAppForRequest(name,args,src)
        if ownerApp then ownerApps[1]=ownerApp end
    end
    for _,ownerApp in ipairs(ownerApps) do
        if not Phone.ownerAppAllowed(src,ownerApp) then
            return false,'Your current job does not have access to this app.'
        end
    end
    -- Broken devices cannot satisfy hasPhone; these handlers validate their own
    -- carried slot/identity and never expose the working phone's applications.
    if name:match('^peak%-phone:break:') then return true end
    -- Nearby listeners need no phone: reads and decoder-ready acknowledgements
    -- remain bound to a loaded character, ticket and authorized live session.
    if name=='peak-phone:Server:VoiceMemos:Describe' or name=='peak-phone:Server:VoiceMemos:GetChunk' or name=='peak-phone:Server:VoiceMemos:PlaybackReady' then return true end
    if not Phone.hasPhone(src) then return false,'Move your phone into the dedicated Phone slot first.' end
    local recovery=name=='peak-phone:portable:bootstrap' or name=='peak-phone:Server:HasActiveSim' or name=='peak-phone:Server:Networks:IsNearNetwork' or name:match('^peak%-phone:break:') or name:match('devices:') or name:match('Devices/') or name:match('ClosePhone$') or name:match('DuoTyping$') or name:match('SetCurrentApp$')
    local cleanup=name:match('[Hh]angup') or name:match('[Ee]ndCall') or name:match('[Rr]eject') or name:match('rtcAbort') or name:match('[Ll]eaveLive') or name:match('[Ll]ogout$') or name:match(':FindMy:GetState$')
    if recovery or cleanup or not Phone.Devices or not Phone.Devices.active then return true end
    local active=Phone.Devices.active(src)
    if not active or not active.DeviceId then return false,'Phone identity is still loading. Reopen your phone.' end
    if active.Status~='active' then return false,'This phone is marked lost or revoked.' end
    if active.Locked then return false,'Unlock your phone to use this app.' end
    local simRequired=name:match(':Calls:') or name:match(':Messages:') or name:match(':Contacts:') or
        name:match('DialContact$') or name:match('portable:videoDial$') or name:match('portable:answer$') or
        name:match('portable:rtcReady$') or name:match('portable:signal$') or
        name:match('portable:rtcStatus$') or name:match('portable:rtcHeartbeat$')
    if simRequired and (not active.SimId or not active.PhoneNumber) then return false,'Insert a SIM card to use cellular apps.' end
    -- Expose the context for synchronous handlers; each durable service still
    -- revalidates its own object and identity after yields.
    Phone.OperationContexts=Phone.OperationContexts or {};Phone.OperationContexts[src]={DeviceId=active.DeviceId,SimId=active.SimId,PhoneNumber=active.PhoneNumber,Generation=active.Generation}
    return true,nil,active.Generation
end
local internalOnly={
 ['peak-phone:Server:Mails:AddMail']=true,['peak-phone:Server:Mails:ImportOldMails']=true,
 ['peak-phone:Server:Documents:AddDocument']=true,['peak-financials:Server:OnMoneyAddedToAccount']=true,
 ['peak-phone:Server:RefreshJobs']=true,['peak-phone:Server:UpdateJobCounters']=true,
}
local function guarded(name,fn)
    return function(...)
        local src=tonumber(source) or 0;local args=table.pack(...)
        local playerSource=src>=0 and GetPlayerName(src)~=nil
        if playerSource then
            if internalOnly[name] then return end
            local valid,allowed=pcall(Phone.authorized,src,name,args)
            if not valid or not allowed then return end
        end
        local ok,err=pcall(fn,table.unpack(args,1,args.n))
        if not ok then
            print(('[Peak Duo] Handler %s failed: %s'):format(name,tostring(err)))
            if playerSource then Phone.notify(src,'The phone could not finish that action. Check phone_doctor on the server.','error') end
        end
    end
end
-- Wrap registrations made by retained feature modules. Non-phone engine events stay untouched.
local function owned(name) return name:match('^peak%-phone:') or name:match('^Admin:Server:') or internalOnly[name] end
RegisterNetEvent=function(name,fn)
    -- Cfx sets the authoritative `source` when invoking a separately attached
    -- handler. The callback overload loses that context when it is retained and
    -- called through this compatibility wrapper, so phone events use the
    -- canonical register-then-attach form.
    if fn and owned(name) then originalRegister(name);return originalAdd(name,guarded(name,fn)) end
    return originalRegister(name,fn)
end
AddEventHandler=function(name,fn)
    if owned(name) then return originalAdd(name,guarded(name,fn)) end
    return originalAdd(name,fn)
end
PhonePeak.Functions.CreateCallback=function(name,fn)
    assert(type(name)=='string' and type(fn)=='function','Invalid callback registration')
    assert(not PS.Callbacks[name],'Duplicate phone callback: '..name)
    PS.Callbacks[name]=fn
end
PhonePeak.RegisterServer=function(name,fn)
    RegisterNetEvent(name,function(...) local src=tonumber(source) or 0;fn(src,...) end)
end
originalAdd('peak-inventory:server:changed',function(ids)
    if type(ids)~='table' then return end
    local changed={};for _,id in ipairs(ids) do changed[id]=true end
    for _,value in ipairs(GetPlayers()) do
        local src=tonumber(value);local raw=src and Phone.rawPlayer(src);local cid=raw and Phone.rawIdentity(raw)
        if cid and changed['player:'..Phone.framework()..':'..cid] then
            if not Phone.hasPhone(src) then
                if Phone.Calls and Phone.Calls.stopFor then Phone.Calls.stopFor(src,'Phone unequipped') end
                local live=Phone.KiloLive and Phone.KiloLive.bySource and Phone.KiloLive.bySource[src]
                if live and Phone.KiloLive.stop then Phone.KiloLive.stop(live,'Phone unequipped') end
            end
            TriggerClientEvent('peak-phone:portable:inventoryChanged',src)
        end
    end
end)
originalRegister('peak-phone:portable:rpc')
originalAdd('peak-phone:portable:rpc',function(id,name,args,deviceGeneration)
    local src=tonumber(source)
    if not src or src<0 or not Phone.number(id,2147483647) or not Phone.text(name,150) or type(args)~='table' then return end
    local encodedOK,encoded=pcall(json.encode,args)
    if not encodedOK or #encoded>131072 or (args.n and not Phone.number(args.n,20,true)) or #args>20 then return end
    local cid,ready,reason
    local okAuth=pcall(function()
        local raw=Phone.rawPlayer(src);cid=Phone.rawIdentity(raw)
        if name=='peak-phone:portable:bootstrap' then ready=raw and Phone.rate(src,'bootstrap',20,5000)
        else
            local currentGeneration
            ready,reason,currentGeneration=Phone.authorized(src,name,args)
            if ready and currentGeneration and tonumber(deviceGeneration)~=tonumber(currentGeneration) then ready=false;reason='Phone identity changed. Reopen your phone.' end
        end
    end)
    if not okAuth or not ready or not cid then
        TriggerClientEvent('peak-phone:portable:response',src,id,false,reason or (not cid and 'Your character is still loading. Try again in a moment.' or 'Phone readiness could not be checked. Reopen your phone.'));return
    end
    local handler=PS.Callbacks[name] or PhoneIntegration.Callbacks[name]
    if not handler then TriggerClientEvent('peak-phone:portable:response',src,id,false,'Integration callback is not installed: '..name);return end
    local done=false
    local function reply(ok,data)
        if done then return end;done=true
        local check,current=pcall(Phone.rawPlayer,src)
        if not check or Phone.rawIdentity(current)~=cid then return end
        TriggerClientEvent('peak-phone:portable:response',src,id,ok,data)
    end
    SetTimeout(24000,function() reply(false,'Server operation timed out. A write may still complete; do not retry automatically.') end)
    local ok,err=pcall(handler,src,function(value) reply(true,value) end,table.unpack(args,1,args.n or #args))
    if not ok then print('[Peak Duo] Callback '..name..' failed: '..tostring(err));reply(false,'Server action failed. Check phone_doctor and the server console.') end
end)
originalAdd('playerDropped',function()
    local src=tonumber(source)
    for id in pairs(PS.Rate) do if id:match('^'..src..':') then PS.Rate[id]=nil end end
    -- Profiles are per CHARACTER, never per reused player source.
end)
exports('GetPortableFramework',function() return Phone.framework() end)
exports('RegisterPhoneCallback',function(name,fn,appId)
    assert(GetInvokingResource() and type(name)=='string' and #name>0 and #name<=128 and not name:find('[%c]') and type(fn)=='function','Server resource export required')
    assert(appId==nil or (type(appId)=='string' and Phone.OwnerUIApps and Phone.OwnerUIApps[appId]),'Unknown phone app ID')
    assert(not PS.Callbacks[name] and not PhoneIntegration.Callbacks[name],'Callback already registered')
    PhoneIntegration.Callbacks[name]=fn
    Phone.IntegrationOwners=Phone.IntegrationOwners or {};Phone.IntegrationOwners[name]=GetInvokingResource()
    if appId then Phone.IntegrationApps=Phone.IntegrationApps or {};Phone.IntegrationApps[name]=appId end
end)
local adapterHooks={GetVehicles=true,TrackVehicle=true,SpawnVehicle=true,SellVehicle=true,IsJournalist=true}
exports('RegisterPhoneAdapter',function(hooks)
    local resource=GetInvokingResource()
    assert(resource and type(hooks)=='table','Server resource export required')
    local staged={}
    for name,fn in pairs(hooks) do
        assert(adapterHooks[name] and type(fn)=='function','Unsupported phone adapter hook: '..tostring(name))
        assert(type(PhoneIntegration[name])~='function','Phone adapter hook is already registered: '..name)
        staged[name]=fn
    end
    assert(next(staged),'RegisterPhoneAdapter requires at least one supported hook')
    Phone.AdapterOwners=Phone.AdapterOwners or {}
    for name,fn in pairs(staged) do PhoneIntegration[name]=fn;Phone.AdapterOwners[name]=resource end
    CreateThread(function() for _,src in ipairs(GetPlayers()) do TriggerClientEvent('peak-phone:portable:capabilitiesChanged',tonumber(src)) end end)
end)
exports('SetPhoneCapability',function(id,enabled)
    assert(GetInvokingResource(),'Server resource export required');PhoneIntegration.Capabilities[id]=enabled==true
    Phone.CapabilityOwners=Phone.CapabilityOwners or {};Phone.CapabilityOwners[id]=GetInvokingResource()
    CreateThread(function() for _,src in ipairs(GetPlayers()) do TriggerClientEvent('peak-phone:portable:capabilitiesChanged',tonumber(src)) end end)
end)
