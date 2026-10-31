-- Persistent, expiring classifieds. Legacy routes stay intact, IDs no longer shift.
YellowPages={Posts={}}
local C=PhoneConfig.YellowPages
local categories={Services=true,Vehicles=true,Property=true,Jobs=true,Events=true,Other=true}
local function stamp() return os.time()*1000 end
Peak.Functions.CreateCallback('peak-phone:Server:YellowPages:GetPosts',function(src,cb)
 local p=Phone.getPlayer(src);if not p then return cb({}) end
 local rows=PhoneDB.query('SELECT * FROM peak_phone_yellowpages WHERE expires_at>? ORDER BY id DESC LIMIT 200',{stamp()})
 local out={};for _,r in ipairs(rows) do out[#out+1]={Id=tonumber(r.id),Cid=r.citizenid,Own=r.citizenid==p.PlayerData.citizenid,Sender=r.sender,Phone=r.phone,Title=r.title,Category=r.category,Msg=r.message,Image=r.image,Timestamp=tonumber(r.created_at),ExpiresAt=tonumber(r.expires_at)} end
 cb(out)
end)
Peak.Functions.CreateCallback('peak-phone:Server:YellowPages:PostAd',function(src,cb,d)
 d=type(d)=='table' and d or {};local p=Phone.getPlayer(src);local number=p and GetActivePhoneNumber(src)
 local msg=Phone.trim(d.Msg);local title=Phone.trim(d.Title or 'Community listing');local image=Phone.safeImage(d.Image or '')
 if not number or not Phone.text(msg,2000) or not Phone.text(title,80) or not image or not categories[d.Category or 'Other'] then return cb(Phone.publicError('Add a title, a message and an optional image from an allowed HTTPS host.')) end
 if not Phone.rate(src,'yp:post',3,30000) then return cb(Phone.publicError('Please wait before posting another listing.')) end
 local cid=p.PlayerData.citizenid
 local key=type(d.Nonce)=='string' and #d.Nonce>=16 and #d.Nonce<=64 and d.Nonce:match('^[%w%-]+$') and d.Nonce or Phone.token()
 cb(Phone.withLocks({'yp:'..cid},function()
  local old=PhoneDB.one('SELECT id FROM peak_phone_yellowpages WHERE citizenid=? AND client_nonce=?',{cid,key});if old then return {Success=true,Id=tonumber(old.id)} end
  local count=PhoneDB.one('SELECT COUNT(*) n FROM peak_phone_yellowpages WHERE citizenid=? AND expires_at>?',{cid,stamp()})
  if tonumber(count.n)>=C.MaxPerCharacter then return Phone.publicError('Remove an active listing before adding another.') end
  if not Phone.sameCharacter(src,cid) or GetActivePhoneNumber(src)~=number then return Phone.publicError('Your character or SIM changed.') end
  local name=Phone.trim(p.PlayerData.charinfo.firstname..' '..p.PlayerData.charinfo.lastname):sub(1,100)
  local id=PhoneDB.insert('INSERT INTO peak_phone_yellowpages(citizenid,sender,phone,title,category,message,image,client_nonce,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?)',{cid,name,number,title,d.Category or 'Other',msg,image,key,stamp(),stamp()+C.AdHours*3600000})
  TriggerClientEvent('peak-phone:Client:YellowPages:Refresh',-1)
  return {Success=true,Id=tonumber(id)}
 end))
end)
Peak.Functions.CreateCallback('peak-phone:Server:YellowPages:RemoveAd',function(src,cb,d)
 local p=Phone.getPlayer(src);if not p then return cb(Phone.publicError('Character unavailable.')) end
 local cid=p.PlayerData.citizenid
 cb(Phone.withLocks({'yp:'..cid},function()
  local id=type(d)=='table' and Phone.number(d.Id)
  if not id then local r=PhoneDB.one('SELECT id FROM peak_phone_yellowpages WHERE citizenid=? ORDER BY id DESC LIMIT 1',{cid});id=r and r.id end
  if not id or not Phone.sameCharacter(src,cid) then return Phone.publicError('Listing unavailable.') end
  if PhoneDB.update('DELETE FROM peak_phone_yellowpages WHERE id=? AND citizenid=?',{id,cid})<1 then return Phone.publicError('You can only remove your own listing.') end
  TriggerClientEvent('peak-phone:Client:YellowPages:Refresh',-1);return {Success=true}
 end))
end)
RegisterCommand('clearyp',function(src)
 if src~=0 and not Peak.Functions.HasPermission(src,'admin') then return end
 PhoneDB.update('DELETE FROM peak_phone_yellowpages',{})
 TriggerClientEvent('peak-phone:Client:YellowPages:Refresh',-1)
end,false)
CreateThread(function()
 PhoneDB.wait()
 while true do
  local ok,err=pcall(PhoneDB.update,'DELETE FROM peak_phone_yellowpages WHERE expires_at<=?',{stamp()})
  if not ok then print('[Peak Yellow Pages] Cleanup failed: '..tostring(err)) end
  Wait(3600000)
 end
end)
