-- Durable media ledger with FiveManage V3 presigned browser uploads. The API key
-- remains server-side; uploaded objects are verified through the provider before use.
Phone.Media=Phone.Media or {}
local M=Phone.Media
local MAX_VIDEO=24*1024*1024
M.Grants=M.Grants or {}
M.BeginLocks=M.BeginLocks or {}
local function actor(src) local p=Peak.Functions.GetPlayer(src);return p,p and p.PlayerData.citizenid end
local function reply(cb,value) if cb then cb(value) end end
local function mediaQuota(cid) return PhoneDB.one("SELECT COUNT(*) items,COALESCE(SUM(size_bytes),0) bytes FROM peak_phone_media WHERE owner_cid=? AND status IN ('pending','verifying','complete') AND deleted_at IS NULL",{cid}) end
local function withinMediaQuota(quota,items,bytes)
 local usedItems=tonumber(quota and quota.items);local usedBytes=tonumber(quota and quota.bytes)
 if not usedItems or not usedBytes then return false end
 return usedItems+(items or 0)<=tonumber(PhoneConfig.Media.MaxHostedItems or 0)
    and usedBytes+(bytes or 0)<=tonumber(PhoneConfig.Media.MaxHostedBytes or 0)
end
local function api(path,method,body,cb)
 local key=GetConvar('phone_media_api_key','');if key=='' then return cb(false,'Media provider is not configured.') end
 PerformHttpRequest('https://api.fivemanage.com/api/v3/file/'..path,function(status,response)
  local result=Phone.decode(response);local code=tonumber(status) or 0;cb(code>=200 and code<300,result)
 end,method or 'GET',body or '',{Authorization=key,['Content-Type']='application/json'},{followLocation=false})
end
Peak.Functions.CreateCallback('peak-phone:Server:Media:Begin',function(src,cb,data)
 local p,cid=actor(src);data=type(data)=='table' and data or {};local op=Phone.string(data.OperationId,80)
 local mime=Phone.string(data.Mime,100);local size=Phone.number(data.Size,MAX_VIDEO);local duration=Phone.number(math.floor(tonumber(data.DurationMs) or 0),65000,true)
 if not p or not cid or not op or not mime or not size or not duration or not mime:match('^video/webm') then return reply(cb,Phone.publicError('Only a valid WebM clip up to 24 MB can be uploaded.')) end
 local width=Phone.number(data.Width,8192,true) or 0;local height=Phone.number(data.Height,8192,true) or 0
 local old=PhoneDB.one('SELECT * FROM peak_phone_media WHERE owner_cid=? AND operation_id=?',{cid,op})
 if old then
  if old.deleted_at then return reply(cb,Phone.publicError('This upload was removed. Record a new clip before retrying.')) end
  if old.mime~=mime or tonumber(old.size_bytes)~=size or tonumber(old.duration_ms or 0)~=duration or tonumber(old.width or 0)~=width or tonumber(old.height or 0)~=height then
   return reply(cb,Phone.publicError('This upload ID belongs to different clip details. Record a new clip before retrying.'))
  end
  if old.status=='complete' then return reply(cb,{Success=true,MediaId=old.id,Status='complete',Url=old.public_url,Replayed=true}) end
  local grant=M.Grants[old.id]
  if old.status=='pending' and grant and tonumber(grant.expires or 0)>os.time()*1000 and tonumber(old.upload_expires_at or 0)>os.time()*1000 then
   return reply(cb,{Success=true,MediaId=old.id,Status='pending',UploadUrl=grant.url,ExpiresAt=tonumber(old.upload_expires_at),MaxBytes=MAX_VIDEO,Replayed=true})
  end
  if old.status=='verifying' then
   return reply(cb,{Success=true,MediaId=old.id,Status='verifying',ExpiresAt=tonumber(old.upload_expires_at),NeedsReconcile=true})
  end
  if old.status~='pending' and old.status~='expired' and old.status~='failed' then return reply(cb,Phone.publicError('Upload reservation is unavailable. Record a new clip before retrying.')) end
 end
 if M.BeginLocks[cid] then return reply(cb,Phone.publicError('Another upload is being prepared. Retry this clip in a moment.')) end
 M.BeginLocks[cid]=op
 local finished=false
 local function finish(value)
  if finished then return end
  finished=true
  if M.BeginLocks[cid]==op then M.BeginLocks[cid]=nil end
  return reply(cb,value)
 end
 local function begin()
  local reset=old and (old.status=='expired' or old.status=='failed')
  local quota=mediaQuota(cid)
  if not quota then return finish(Phone.publicError('Hosted media quota could not be checked. Retry shortly.')) end
  if not withinMediaQuota(quota,reset and 1 or (old and 0 or 1),reset and size or (old and 0 or size)) then
   return finish(Phone.publicError('Hosted media quota reached. Remove older clips before uploading.'))
  end
  local id=old and old.id or 'MEDIA-'..Phone.random(32,'0123456789abcdef');local expires=os.time()*1000+5*60*1000
  local started,requestError=pcall(api,'presigned-url?expiresAt='..math.floor(expires/1000),'GET','',function(ok,result)
   local callbackOk,callbackError=xpcall(function()
    if not ok or not Phone.sameCharacter(src,cid) then return finish(Phone.publicError(old and 'A replacement upload URL could not be created.' or 'A secure upload URL could not be created.')) end
    local url=result and result.data and result.data.presignedUrl
    if not Phone.text(url,4096) or (not url:match('^https://[^/]*fivemanage%.com/') and not url:match('^https://fmapi%.net/')) then return finish(Phone.publicError('The provider returned an invalid upload URL.')) end
    if old then
     local updated=PhoneDB.update("UPDATE peak_phone_media SET status='pending',object_key=NULL,public_url=NULL,upload_expires_at=?,updated_at=? WHERE id=? AND owner_cid=? AND status IN ('pending','expired','failed')",{expires,os.time()*1000,id,cid})
     if not updated or updated<1 then return finish(Phone.publicError('The upload reservation changed. Reconcile before retrying.')) end
    else
     local inserted=PhoneDB.insert('INSERT INTO peak_phone_media(id,owner_cid,operation_id,provider,mime,media_type,size_bytes,duration_ms,width,height,visibility,status,upload_expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,\'pending\',?,?,?)',{id,cid,op,'fivemanage',mime,'video',size,duration,width,height,'public',expires,os.time()*1000,os.time()*1000})
     if not inserted then return finish(Phone.publicError('The upload reservation was not saved.')) end
    end
    M.Grants[id]={url=url,expires=expires}
    finish({Success=true,MediaId=id,Status='pending',UploadUrl=url,ExpiresAt=expires,MaxBytes=MAX_VIDEO,Replayed=old~=nil})
   end,function(value) return tostring(value) end)
   if not callbackOk then
    print(('[peak-phone] media reservation callback failed safely: %s'):format(tostring(callbackError)))
    finish(Phone.publicError('The upload reservation could not be prepared. Retry shortly.'))
   end
  end)
  if not started then return finish(Phone.publicError(requestError or 'A secure upload URL could not be created.')) end
 end
 local ok,err=xpcall(begin,function(value) return tostring(value) end)
 if not ok then
  print(('[peak-phone] media reservation failed safely: %s'):format(tostring(err)))
  finish(Phone.publicError('The upload reservation could not be prepared. Retry shortly.'))
 end
end)
Peak.Functions.CreateCallback('peak-phone:Server:Media:Finalize',function(src,cb,data)
 local p,cid=actor(src);local id=Phone.string(type(data)=='table' and data.MediaId,64);local object=Phone.string(type(data)=='table' and data.ObjectId,255)
 if not p or not cid or not id or not object or not object:match('^[%w%._%-%/]+$') then return reply(cb,Phone.publicError('Upload result is invalid.')) end
 local lookedUp,row=pcall(PhoneDB.one,"SELECT * FROM peak_phone_media WHERE id=? AND owner_cid=? AND status IN ('pending','verifying')",{id,cid})
 if not lookedUp then return reply(cb,Phone.publicError('Upload reservation could not be checked. Retry shortly.')) end
 if not row then
  local doneOk,done=pcall(PhoneDB.one,"SELECT * FROM peak_phone_media WHERE id=? AND owner_cid=? AND status='complete'",{id,cid})
  if not doneOk then return reply(cb,Phone.publicError('Upload completion could not be checked. Retry shortly.')) end
  return reply(cb,done and {Success=true,MediaId=id,Url=done.public_url,Status='complete',Replayed=true} or Phone.publicError('Upload reservation is unavailable.'))
 end
 if row.status=='pending' and (tonumber(row.upload_expires_at) or 0)<os.time()*1000 then
  local expiredOk,expired=pcall(PhoneDB.update,"UPDATE peak_phone_media SET status='expired',updated_at=? WHERE id=? AND owner_cid=? AND status='pending'",{os.time()*1000,id,cid})
  if not expiredOk or expired==nil or expired==false or expired<1 then return reply(cb,Phone.publicError('Upload expiration could not be saved. Retry shortly.')) end
  M.Grants[id]=nil;return reply(cb,Phone.publicError('Upload reservation expired.'))
 end
 if row.status=='verifying' then
  if row.object_key~=object then return reply(cb,Phone.publicError('A different upload is already being verified.')) end
 else
  local claimOk,claimed=pcall(PhoneDB.update,"UPDATE peak_phone_media SET status='verifying',object_key=?,updated_at=? WHERE id=? AND owner_cid=? AND status='pending'",{object,os.time()*1000,id,cid})
  if not claimOk or not claimed or claimed<1 then return reply(cb,Phone.publicError('Upload verification changed. Reconcile before retrying.')) end
 end
 local replied=false
 local function finish(value) if replied then return end;replied=true;return reply(cb,value) end
 local function verified(ok,result)
  local bodyOk,bodyError=xpcall(function()
   if not Phone.sameCharacter(src,cid) then return finish(Phone.publicError('Your character changed while the upload was being verified. Reconcile before retrying.')) end
   if not ok then return finish(Phone.publicError('Media provider is unavailable. Retry verification of the saved upload.')) end
   local file=result and result.data or nil;local url=file and Phone.mediaURL(file.url);local actualSize=file and tonumber(file.size);local actualType=file and tostring(file.type or '')
   local metadata=file and (file.metadata or file.meta);if type(metadata)=='string' then metadata=Phone.decode(metadata) end
   local belongs=type(metadata)=='table' and metadata.mediaId==id and metadata.operationId==row.operation_id
   if not file or not belongs or not url or tostring(file.id)~=object or not actualSize or actualSize<1 or actualSize>MAX_VIDEO or actualSize~=tonumber(row.size_bytes) or not actualType:match('^video/webm') then
    local failedOk,failed=pcall(PhoneDB.update,"UPDATE peak_phone_media SET status='failed',updated_at=? WHERE id=? AND owner_cid=? AND status='verifying' AND object_key=?",{os.time()*1000,id,cid,object})
    if not failedOk or not failed or failed<1 then return finish(Phone.publicError('Provider verification failed; reservation state is unresolved. Retry verification.')) end
    return finish(Phone.publicError('Provider verification failed; the local clip was kept.'))
   end
   local updateOk,updated=pcall(PhoneDB.update,"UPDATE peak_phone_media SET status='complete',public_url=?,object_key=?,mime=?,size_bytes=?,updated_at=? WHERE id=? AND owner_cid=? AND status='verifying' AND object_key=?",{url,object,actualType,actualSize,os.time()*1000,id,cid,object})
   if not updateOk or not updated or updated<1 then
    local doneOk,done=pcall(PhoneDB.one,"SELECT public_url,object_key FROM peak_phone_media WHERE id=? AND owner_cid=? AND status='complete'",{id,cid})
    if doneOk and done and done.object_key==object then M.Grants[id]=nil;return finish({Success=true,MediaId=id,Url=done.public_url,Status='complete',Replayed=true}) end
    return finish(Phone.publicError('Upload completed but database finalization is unresolved. Reconcile before retrying.'))
   end
   M.Grants[id]=nil;finish({Success=true,MediaId=id,Url=url,Status='complete'})
  end,function(value) return tostring(value) end)
  if not bodyOk then
   print(('[peak-phone] media verification callback failed safely: %s'):format(tostring(bodyError)))
   finish(Phone.publicError('Upload verification could not be completed. Retry verification of the saved upload.'))
  end
 end
 local started,requestError=pcall(api,object,'GET','',verified)
 if not started then finish(Phone.publicError(requestError or 'Media provider is unavailable. Retry verification of the saved upload.')) end
end)
CreateThread(function()
 while true do
  Wait(60000);local cutoff=os.time()*1000
  PhoneDB.update("UPDATE peak_phone_media SET status='expired',updated_at=? WHERE status='pending' AND upload_expires_at<?",{cutoff,cutoff})
  for id,grant in pairs(M.Grants) do if tonumber(grant.expires or 0)<cutoff then M.Grants[id]=nil end end
 end
end)
Peak.Functions.CreateCallback('peak-phone:Server:Media:List',function(src,cb,data)
 local p,cid=actor(src);if not p then return reply(cb,Phone.publicError('Character unavailable.')) end
 local before=tonumber(data and data.Before) or 9223372036854775807
 local rows=PhoneDB.query("SELECT id,public_url,thumbnail_url,mime,media_type,size_bytes,duration_ms,width,height,visibility,status,created_at FROM peak_phone_media WHERE owner_cid=? AND created_at<? AND deleted_at IS NULL ORDER BY created_at DESC,id DESC LIMIT 51",{cid,before})
 local out={};for i,row in ipairs(rows or {}) do if i<=50 then out[#out+1]=row end end
 reply(cb,{Success=true,Media=out,Next=#rows>50 and tonumber(rows[50].created_at) or nil,HasMore=#rows>50})
end)
function M.ownedComplete(src,id)
 local p,cid=actor(src);id=Phone.string(id,64);if not p or not id then return nil end
 return PhoneDB.one("SELECT * FROM peak_phone_media WHERE id=? AND owner_cid=? AND status='complete' AND deleted_at IS NULL",{id,cid})
end
