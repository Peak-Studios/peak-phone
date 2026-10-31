-- Camera frames never travel through an arbitrary URL fetch or public API key.
Phone.Upload={busy={}}
function Phone.Upload.configured() return Phone.started('screenshot-basic') and GetConvar('phone_media_api_key','')~='' end
local function owner(src) local p=Peak.Functions.GetPlayer(src);return p,p and p.PlayerData.citizenid end
local function ownedPhoto(src,id)
    local p,cid=owner(src);id=Phone.number(id,2147483647);if not p or not id then return end
    return PhoneDB.one('SELECT * FROM phone_photos WHERE id=? AND citizenid=?',{id,cid}),p
end
local function save(src,cid,url)
    url=Phone.mediaURL(url);if not url or not Phone.sameCharacter(src,cid) then return false end
    return Phone.withLocks({'photos:'..cid},function()
        local count=PhoneDB.one('SELECT COUNT(*) n FROM phone_photos WHERE citizenid=?',{cid});if tonumber(count.n)>=PhoneConfig.Media.MaxPhotos then return false end
        local id=PhoneDB.insert('INSERT INTO phone_photos (citizenid,photo_url,timestamp) VALUES (?,?,?)',{cid,url,os.time()*1000})
        if not id then return false end
        if Phone.sameCharacter(src,cid) then TriggerClientEvent('peak-phone:Client:Gallery:RefreshPhotos',src) end
        return true
    end)
end
Peak.Functions.CreateCallback('peak-phone:Server:Gallery:GetPhotos',function(src,cb)
    local _,id=owner(src);if not id then return cb({}) end
    cb(PhoneDB.query('SELECT * FROM phone_photos WHERE citizenid=? ORDER BY timestamp DESC,id DESC LIMIT 500',{id}))
end)
local function upload(data,extension,cb)
    PerformHttpRequest('https://api.fivemanage.com/api/v3/file/base64',function(status,body)
        local result=Phone.decode(body);local url=result.data and Phone.mediaURL(result.data.url)
        if status~=200 or not url then
            print(('[peak-phone] Gallery provider rejected upload (HTTP %s).'):format(tostring(status)))
            return cb(nil)
        end
        cb(url)
    end,'POST',json.encode({base64=data,filename='phone-'..Phone.token()..'.'..extension}),
        {['Content-Type']='application/json',Authorization=GetConvar('phone_media_api_key',''),['User-Agent']='Peak-Duo/3.0'}, {followLocation=false})
end
local function capture(src,request)
    local _,cid=owner(src);if not cid then return false,'Character unavailable.' end
    if not Phone.text(request,64) then return false,'Invalid capture request.' end
    if Phone.Upload.busy[cid] and Phone.Upload.busy[cid]>os.time() then return false,'Please wait before taking another photo.' end
    if not Phone.Upload.configured() then return false,'Photo capture needs screenshot-basic and a configured media key.' end
    Phone.Upload.busy[cid]=os.time()+45
    local finished=false
    local function complete(ok,url,message)
        if finished then return end;finished=true;Phone.Upload.busy[cid]=os.time()+PhoneConfig.Media.UploadCooldown
        if not Phone.sameCharacter(src,cid) then return end
        TriggerClientEvent('peak-phone:portable:captureComplete',src,request,ok,message)
        if ok then TriggerClientEvent('peak-phone:Client:Gallery:PhotoCaptured',src,url) end
    end
    SetTimeout(40000,function()
        print('[peak-phone] Gallery capture timed out waiting for screenshot or upload.')
        complete(false,nil,'Photo capture timed out. Please try again.')
    end)
    CreateThread(function()
        local ok=pcall(function() exports['screenshot-basic']:requestClientScreenshot(src,{encoding='jpg',quality=0.75},function(err,data)
            if finished then return end
            local mime,payload
            if type(data)=='string' and #data<=6000000 then mime,payload=data:match('^data:(image/[%w]+);base64,([A-Za-z0-9+/=]+)$') end
            local extension=({['image/jpeg']='jpg',['image/jpg']='jpg',['image/png']='png',['image/webp']='webp'})[mime]
            if err or not payload or not extension or not Phone.sameCharacter(src,cid) then
                print(('[peak-phone] Gallery screenshot rejected (error=%s, mime=%s, bytes=%s).'):format(tostring(err~=nil and err~=false),tostring(mime),type(data)=='string' and #data or 0))
                return complete(false,nil,'Could not obtain the camera image. Please try again.')
            end
            upload(data,extension,function(url)
                if finished then return end
                if not url then return complete(false,nil,'Photo upload failed. Please try again.') end
                CreateThread(function()
                    if finished then return end
                    local good,stored=pcall(save,src,cid,url)
                    if not good then print('[peak-phone] Gallery database save failed: '..tostring(stored)) end
                    complete(good and stored==true,url,'Photo could not be saved. Check your Gallery quota.')
                end)
            end)
        end) end)
        if not ok then complete(false,nil,'Could not start the camera capture.') end
    end)
    return true
end
Peak.Functions.CreateCallback('peak-phone:Server:Gallery:BeginCapture',function(src,cb,request)
    local ok,message=capture(src,request);cb({Success=ok,Msg=message})
end)
-- Retain the old event for compatibility, but current clients use an acknowledged RPC.
RegisterNetEvent('peak-phone:Server:Gallery:RequestServerScreenshot',function()
    local src=source;local ok,message=capture(src,'legacy')
    if not ok then TriggerClientEvent('Peak:Notify',src,message,'error') end
end)
local alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
local function base64(bytes)
    return (bytes:gsub('...',function(chunk)
        local a,b,c=chunk:byte(1,3);local n=(a<<16)|(b<<8)|c
        return alphabet:sub((n>>18)+1,(n>>18)+1)..alphabet:sub(((n>>12)&63)+1,((n>>12)&63)+1)..alphabet:sub(((n>>6)&63)+1,((n>>6)&63)+1)..alphabet:sub((n&63)+1,(n&63)+1)
    end):sub(1,(#bytes//3)*4))..(function()
        local rest=#bytes%3;if rest==0 then return '' end
        local a,b=bytes:byte(#bytes-rest+1,#bytes);local n=(a<<16)|((b or 0)<<8)
        return alphabet:sub((n>>18)+1,(n>>18)+1)..alphabet:sub(((n>>12)&63)+1,((n>>12)&63)+1)..(rest==2 and alphabet:sub(((n>>6)&63)+1,((n>>6)&63)+1) or '=')..'='
    end)()
end
local function importDiscord(src,url,cb)
    local _,cid=owner(src)
    if not cid or GetConvar('phone_media_api_key','')=='' then return cb(false) end
    if Phone.Upload.busy[cid] and Phone.Upload.busy[cid]>os.time() then return cb(false) end
    -- Only fetch official attachment paths. Never follow a redirect or accept an arbitrary remote host.
    if not url:match('^https://cdn%.discordapp%.com/attachments/%d+/%d+/') and not url:match('^https://media%.discordapp%.net/attachments/%d+/%d+/') then return cb(false) end
    Phone.Upload.busy[cid]=os.time()+22
    local finished=false
    local function complete(ok)
        if finished then return end;finished=true;Phone.Upload.busy[cid]=os.time()+PhoneConfig.Media.UploadCooldown;cb(ok)
    end
    SetTimeout(20000,function() complete(false) end)
    PerformHttpRequest(url,function(status,body)
        if finished then return end
        if status~=200 or type(body)~='string' or #body>4000000 or not Phone.sameCharacter(src,cid) then return complete(false) end
        local mime,extension
        if body:sub(1,3)=='\255\216\255' then mime,extension='image/jpeg','jpg'
        elseif body:sub(1,8)=='\137PNG\13\10\26\10' then mime,extension='image/png','png'
        elseif body:sub(1,6)=='GIF87a' or body:sub(1,6)=='GIF89a' then mime,extension='image/gif','gif'
        elseif body:sub(1,4)=='RIFF' and body:sub(9,12)=='WEBP' then mime,extension='image/webp','webp' end
        if not mime then return complete(false) end
        upload('data:'..mime..';base64,'..base64(body),extension,function(hosted)
            if finished then return end
            if not hosted then return complete(false) end
            CreateThread(function()
                if finished then return end
                local ok,stored=pcall(save,src,cid,hosted);complete(ok and stored==true)
            end)
        end)
    end,'GET','',{['User-Agent']='Peak-Duo/3.0'},{followLocation=false})
end
local function near(a,b)
    local ap,bp=GetPlayerPed(a),GetPlayerPed(b);return ap~=0 and bp~=0 and GetPlayerRoutingBucket(a)==GetPlayerRoutingBucket(b) and #(GetEntityCoords(ap)-GetEntityCoords(bp))<=5.0
end
local function share(src,target,photo,p)
    if not Peak.Functions.GetPlayer(target) or not Phone.hasPhone(target) then return false end
    TriggerClientEvent('peak-phone:Client:Gallery:ReceiveSharedPhoto',target,{PhotoUrl=photo.photo_url,FromName=p.PlayerData.charinfo.firstname..' '..p.PlayerData.charinfo.lastname,FromPhone=Phone.activeNumber(src)})
    return true
end
local function action(src,name,data)
    data=type(data)=='table' and data or {PhotoId=data}
    if name=='ImportPhoto' then local _,id=owner(src);return id and save(src,id,data.PhotoUrl) or false end
    local photo,p=ownedPhoto(src,data.PhotoId);if not photo then return false end
    if name=='DeletePhoto' then
        local n=PhoneDB.update('DELETE FROM phone_photos WHERE id=? AND citizenid=?',{photo.id,p.PlayerData.citizenid})
        TriggerClientEvent('peak-phone:Client:Gallery:RefreshPhotos',src);return n>0
    end
    if not Phone.mediaURL(photo.photo_url) then return false end
    if name=='SharePhoto' then local target=Phone.number(data.TargetSource,65535);return target and near(src,target) and share(src,target,photo,p) or false end
    if name=='ShareToAllNearby' then local count=0;for _,s in ipairs(GetPlayers()) do local t=tonumber(s);if t~=src and near(src,t) and share(src,t,photo,p) then count=count+1 end end;return count>0 end
    if name=='ShareToSpecificPlayer' then
        if not Phone.text(data.Target,128) then return false end
        local target=Peak.Functions.GetPlayerByCitizenId(data.Target) or Peak.Functions.GetPlayerByPhone(data.Target)
        return target and share(src,target.PlayerData.source,photo,p) or false
    end
    if name=='PostToTwatter' then
        if not IsNetworkEnabled or not YApp or not Phone.text(data.Caption or '',1000,true) then return false end
        return YApp.CreatePhotoPost(src,p,data.Caption or '',photo.photo_url)
    end
    return false
end
Peak.Functions.CreateCallback('peak-phone:portable:gallery',function(src,cb,name,data)
    if name=='ImportPhoto' and type(data)=='table' then
        local url=Phone.mediaURL(data.PhotoUrl)
        if url and (url:match('^https://cdn%.discordapp%.com/') or url:match('^https://media%.discordapp%.net/')) then return importDiscord(src,url,cb) end
    end
    cb(action(src,name,data))
end)
for _,name in ipairs({'DeletePhoto','SharePhoto','ShareToSpecificPlayer','ShareToAllNearby','PostToTwatter'}) do
    RegisterNetEvent('peak-phone:Server:Gallery:'..name,function(data) local src=source;action(src,name,data) end)
end
RegisterNetEvent('peak-phone:Server:Gallery:SavePhoto',function(url) local src=source;action(src,'ImportPhoto',{PhotoUrl=url}) end)
-- No SaveCameraCapture network event: only this server's screenshot request callback can upload bytes.
