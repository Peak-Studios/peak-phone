-- Mail uses character identity, not a native framework users/players schema.
local function send(id,sender,subject,message,button)
    if not Phone.text(id,128) or not Phone.text(sender,150) or not Phone.text(subject,150) or not Phone.cleanHTML(message) then return false end
    local timestamp=os.time()*1000
    local mailid=PhoneDB.insert('INSERT INTO phone_mails (citizenid,sender,subject,message,`read`,timestamp,button) VALUES (?,?,?,?,0,?,?)',{id,sender,subject,message,timestamp,button and json.encode(button) or 'null'})
    if not mailid then return false end
    local p=Peak.Functions.GetPlayerByCitizenId(id)
    if p then TriggerClientEvent('peak-phone:Client:Mails:AddMail',p.PlayerData.source,{id=mailid,sender=sender,subject=subject,message=message,timestamp=timestamp,button=button,read=0}) end
    return true
end
exports('SendMailToCitizenId',send)
RegisterNetEvent('peak-phone:Server:Mails:AddMail',function(from,subject,msg,target,button)
    local p=Peak.Functions.GetPlayer(tonumber(target or source));if p then send(p.PlayerData.citizenid,from,subject,msg,button) end
end)
Peak.Functions.CreateCallback('peak-phone:Server:Mails:GetMails',function(src,cb)
    local p=Peak.Functions.GetPlayer(src);if not p then return cb({}) end
    local rows=PhoneDB.query('SELECT * FROM phone_mails WHERE citizenid=? ORDER BY timestamp DESC,id DESC LIMIT 100',{p.PlayerData.citizenid})
    for _,r in ipairs(rows) do local b=Phone.decode(r.button);r.button=next(b) and b or nil end;cb(rows)
end)
Peak.Functions.CreateCallback('peak-phone:Server:Mails:DeleteMail',function(src,cb,id)
    local p=Peak.Functions.GetPlayer(src);local n=Phone.number(id,2147483647);if not p or not n then return cb(false) end
    cb(PhoneDB.update('DELETE FROM phone_mails WHERE id=? AND citizenid=?',{n,p.PlayerData.citizenid})>0)
end)
RegisterNetEvent('peak-phone:Server:Mails:MarkAsRead',function(id)
    local src=source;local p=Peak.Functions.GetPlayer(src);local n=Phone.number(id,2147483647);if p and n then PhoneDB.update('UPDATE phone_mails SET `read`=1 WHERE id=? AND citizenid=?',{n,p.PlayerData.citizenid}) end
end)
local function sendPlayer(src,data)
    local p=Peak.Functions.GetPlayer(src);local number=Phone.activeNumber(src);local target=type(data)=='table' and Phone.phone(data.targetPhone)
    if not p or not number or not target or not Phone.text(data.subject,150) or not Phone.cleanHTML(data.message) or not IsNetworkEnabled then return false end
    local sim=PhoneDB.one('SELECT owner_citizenid FROM sim_cards WHERE phone_number=?',{target});if not sim or not Phone.sameCharacter(src,p.PlayerData.citizenid) then return false end
    return send(sim.owner_citizenid,number,data.subject,data.message,nil)
end
Peak.Functions.CreateCallback('peak-phone:Server:Mails:SendMail',function(src,cb,data) cb(sendPlayer(src,data)) end)
RegisterNetEvent('peak-phone:Server:Mails:SendMail',function(data) local src=source;local ok=sendPlayer(src,data);TriggerClientEvent('Peak:Notify',src,ok and 'Mail sent.' or 'Mail could not be sent.',ok and 'success' or 'error') end)
RegisterNetEvent('Admin:Server:SendMail',function(data)
    local src=source;if not Peak.Functions.HasPermission(src,'admin') then return end
    local target=Peak.Functions.GetPlayer(tonumber(data.player));if target then send(target.PlayerData.citizenid,data.From,data.Subject,data.Message) end
end)
