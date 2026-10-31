local function nativeNet(name, handler) Phone.NativeRegisterNetEvent(name); Phone.NativeAddEventHandler(name, handler) end
function FormatPhone(number) return tostring(number or '') end
function GetContactName(cid,number)
    local row=PhoneDB.one('SELECT name FROM phone_contacts WHERE citizenid=? AND phone=? LIMIT 1',{cid,tostring(number)})
    return row and row.name or tostring(number or '')
end
local function actor(src) local p=Phone.getPlayer(src);return p,p and p.PlayerData.citizenid end
local function contact(data)
    if type(data)~='table' then return end
    local name=data.Name or data.name;local number=Phone.phone(data.Phone or data.phone)
    if not Phone.text(name,100) or not number then return end
    return Phone.trim(name),number
end
local function insertContact(src,cid,name,number)
    return Phone.withLocks({'contacts:'..cid},function()
        if not Phone.sameCharacter(src,cid) then return false end
        -- Accepting the same number twice must not create duplicate contacts or rename an existing one.
        local existing=PhoneDB.one('SELECT id FROM phone_contacts WHERE citizenid=? AND phone=? LIMIT 1',{cid,number})
        if existing then return true end
        local total=PhoneDB.one('SELECT COUNT(*) AS n FROM phone_contacts WHERE citizenid=?',{cid})
        if total and tonumber(total.n)>=1000 then return false end
        if not Phone.sameCharacter(src,cid) then return false end
        local inserted=PhoneDB.insert('INSERT INTO phone_contacts(citizenid,name,phone) VALUES (?,?,?)',{cid,name,number})
        return tonumber(inserted)~=nil and tonumber(inserted)>0
    end)
end
Peak.Functions.CreateCallback('peak-phone:Server:Contacts:GetContacts',function(src,cb)
    local p,cid=actor(src);if not p then return cb({}) end
    cb(PhoneDB.query('SELECT c.*,p.avatar FROM phone_contacts c LEFT JOIN phone_profiles p ON p.phone=c.phone WHERE c.citizenid=? ORDER BY c.name LIMIT 1000',{cid}))
end)
Peak.Functions.CreateCallback('peak-phone:Server:Contacts:AddContacts',function(src,cb,data)
    local p,cid=actor(src);local name,number=contact(data);if not p or not name then return cb(false) end
    cb(insertContact(src,cid,name,number))
end)
Peak.Functions.CreateCallback('peak-phone:Server:Contacts:EditContact',function(src,cb,data)
    local p,cid=actor(src);local name,number=contact(data);local id=type(data)=='table' and Phone.number(data.Id or data.id or data.ContactId)
    if not p or not name or not id then return cb(false) end
    cb(Phone.withLocks({'contacts:'..cid},function()
        local row=PhoneDB.one('SELECT id FROM phone_contacts WHERE citizenid=? AND phone=? AND id<>? LIMIT 1',{cid,number,id})
        if row or not Phone.sameCharacter(src,cid) then return false end
        local owned=PhoneDB.one('SELECT id FROM phone_contacts WHERE id=? AND citizenid=?',{id,cid});if not owned then return false end
        if not Phone.sameCharacter(src,cid) then return false end
        PhoneDB.update('UPDATE phone_contacts SET name=?,phone=? WHERE id=? AND citizenid=?',{name,number,id,cid});return true
    end))
end)
Peak.Functions.CreateCallback('peak-phone:Server:Contacts:DeleteContact',function(src,cb,data)
    local p,cid=actor(src);local id=type(data)=='table' and Phone.number(data.Id or data.id or data.ContactId)
    if not p or not id then return cb(false) end
    cb(Phone.withLocks({'contacts:'..cid},function()
        if not Phone.sameCharacter(src,cid) then return false end
        return PhoneDB.update('DELETE FROM phone_contacts WHERE id=? AND citizenid=?',{id,cid})>0
    end))
end)
Peak.Functions.CreateCallback('peak-phone:Server:Contacts:GetProfile',function(src,cb)
    local number=GetActivePhoneNumber(src);if not number then return cb({}) end
    cb(PhoneDB.one('SELECT phone,avatar FROM phone_profiles WHERE phone=?',{number}) or {})
end)
local function updateProfile(src,data)
    local p,cid=actor(src);local number=p and GetActivePhoneNumber(src)
    local url=type(data)=='table' and Phone.safeImage(data.avatar)
    if not number or not url then return Phone.publicError('Use an allowed HTTPS image URL, or an empty value to remove it.') end
    return Phone.withLocks({'contacts:'..cid},function()
        if not Phone.sameCharacter(src,cid) or GetActivePhoneNumber(src)~=number then return Phone.publicError('Character or SIM changed.') end
        PhoneDB.update('INSERT INTO phone_profiles(phone,avatar) VALUES (?,?) ON DUPLICATE KEY UPDATE avatar=VALUES(avatar)',{number,url})
        if Phone.sameCharacter(src,cid) then p.Functions.SetMetaData('phone_pfp',url) end
        return {Success=true,avatar=url}
    end)
end
Peak.Functions.CreateCallback('peak-phone:Server:Contacts:UpdateProfile',function(src,cb,data) cb(updateProfile(src,data)) end)
RegisterNetEvent('peak-phone:Server:Contacts:UpdateProfile',function(data) updateProfile(tonumber(source),data) end)
local function near(a,b,radius)
    if a==b or GetPlayerRoutingBucket(a)~=GetPlayerRoutingBucket(b) then return false end
    local ap,bp=GetPlayerPed(a),GetPlayerPed(b)
    return ap~=0 and bp~=0 and #(GetEntityCoords(ap)-GetEntityCoords(bp))<=(radius or 5.0)
end
Phone.nearPlayers=near
Peak.Functions.CreateCallback('peak-phone:Server:Contacts:GetNearbyPlayers',function(src,cb)
    local out={};local _,cid=actor(src);if not cid then return cb(out) end
    for _,value in ipairs(GetPlayers()) do
        local target=tonumber(value)
        if near(src,target,5.0) and Player(target).state.phoneOpen==true and Phone.hasPhone(target) then
            local p=Phone.getPlayer(target)
            if p then
                local number=p.PlayerData.charinfo.phone
                local profile=PhoneDB.one('SELECT avatar FROM phone_profiles WHERE phone=?',{number})
                if Phone.sameCharacter(src,cid) and Phone.sameCharacter(target,p.PlayerData.citizenid) and near(src,target,5.0) then
                    out[#out+1]={Source=target,Name=Phone.trim(p.PlayerData.charinfo.firstname..' '..p.PlayerData.charinfo.lastname),Phone=number,Avatar=profile and profile.avatar}
                end
            end
        end
        if #out>=32 then break end
    end
    cb(out)
end)
Phone.ContactShares={};local shares=Phone.ContactShares
local function request(src,data)
    local target=type(data)=='table' and Phone.number(data.TargetSource,65535)
    if not target or not near(src,target,5) or Player(target).state.phoneOpen~=true or not Phone.hasPhone(target) then return Phone.publicError('The other player must be nearby with their phone open.') end
    if not Phone.rate(src,'airshare',2,5000) then return Phone.publicError('Wait a moment before sharing again.') end
    local p,cid=actor(src);local recipient,rcid=actor(target);if not p or not recipient then return Phone.publicError('Character unavailable.') end
    local name=Phone.trim(p.PlayerData.charinfo.firstname..' '..p.PlayerData.charinfo.lastname)
    local card={Name=name,Phone=p.PlayerData.charinfo.phone,name=name,phone=p.PlayerData.charinfo.phone}
    if type(data.Contact)=='table' then
        local n=Phone.phone(data.Contact.Phone or data.Contact.phone)
        if not n then return Phone.publicError('Invalid contact number.') end
        if n~=card.Phone then
            local row=PhoneDB.one('SELECT name,phone FROM phone_contacts WHERE citizenid=? AND phone=? LIMIT 1',{cid,n})
            if not row then return Phone.publicError('You can only share your own card or a saved contact.') end
            card={Name=row.name,Phone=row.phone,name=row.name,phone=row.phone}
        end
    end
    local avatars=GetAvatarsForPhones({card.Phone,p.PlayerData.charinfo.phone});card.Avatar=avatars[card.Phone];card.avatar=card.Avatar
    if not Phone.sameCharacter(src,cid) or not Phone.sameCharacter(target,rcid) or not near(src,target,5) or Player(target).state.phoneOpen~=true then return Phone.publicError('A player moved away or changed character.') end
    local total,inbox=0,0
    for id,s in pairs(shares) do
        if s.expires<GetGameTimer() then shares[id]=nil else total=total+1;if s.targetCid==rcid then inbox=inbox+1 end end
    end
    if total>=256 or inbox>=3 then return Phone.publicError('The recipient has pending requests to review first.') end
    local id=Phone.token();local payload={RequestId=id,SenderSource=src,SenderName=name,SenderAvatar=avatars[p.PlayerData.charinfo.phone],Contact=card,ExpiresIn=60}
    shares[id]={src=src,cid=cid,target=target,targetCid=rcid,expires=GetGameTimer()+60000,payload=payload}
    TriggerClientEvent('peak-phone:Client:Contacts:ReceiveAirShare',target,payload)
    return {Success=true,RequestId=id}
end
Peak.Functions.CreateCallback('peak-phone:Server:Contacts:RequestAirShare',function(src,cb,data) cb(request(src,data)) end)
RegisterNetEvent('peak-phone:Server:Contacts:RequestAirShare',function(data)
    local src=tonumber(source);local result=request(src,data);if not result.Success then Phone.notify(src,result.Msg,'error') end
end)
Peak.Functions.CreateCallback('peak-phone:Server:Contacts:PendingAirShares',function(src,cb)
    local _,cid=actor(src);local out={}
    for _,s in pairs(shares) do
        if s.target==src and s.targetCid==cid and s.expires>GetGameTimer() and Phone.sameCharacter(s.src,s.cid) then
            local payload=Phone.copy(s.payload);payload.ExpiresIn=math.floor((s.expires-GetGameTimer())/1000);out[#out+1]=payload
        end
    end
    cb({Success=true,requests=out})
end)
Peak.Functions.CreateCallback('peak-phone:Server:Contacts:RespondAirShare',function(src,cb,data)
    local id=type(data)=='table' and data.RequestId;local s=id and shares[id];local _,cid=actor(src)
    if not s or s.target~=src or s.targetCid~=cid or s.expires<GetGameTimer() or not Phone.sameCharacter(s.src,s.cid) then return cb(Phone.publicError('This share expired or belongs to another character.')) end
    if data.Accept~=true then shares[id]=nil;return cb({Success=true}) end
    if s.busy then return cb(Phone.publicError('This share is already being saved.')) end
    s.busy=true
    local ok,result=pcall(insertContact,src,cid,s.payload.Contact.name,s.payload.Contact.phone)
    if not ok or not result then s.busy=false;return cb(Phone.publicError('Contact could not be saved. Your contact list may be full.')) end
    shares[id]=nil
    if Phone.sameCharacter(src,cid) then TriggerClientEvent('peak-phone:Client:Contacts:Refresh',src) end
    cb({Success=true})
end)
local function clearSource(src)
    for id,s in pairs(shares) do if s.src==src or s.target==src then shares[id]=nil end end
end
Phone.NativeAddEventHandler('playerDropped',function() clearSource(tonumber(source)) end)
nativeNet('peak-phone:Contacts:Logout',function() clearSource(tonumber(source)) end)
CreateThread(function() while true do Wait(15000);for id,s in pairs(shares) do if s.expires<GetGameTimer() then shares[id]=nil end end end end)
