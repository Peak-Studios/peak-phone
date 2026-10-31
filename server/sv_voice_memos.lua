-- Bounded, private recording transport. Audio is never broadcast as a public URL.
Phone.VoiceMemos={uploads={},tickets={},sessions={}}
local V=Phone.VoiceMemos
local MAX_BYTES,CHUNK=8*1024*1024,49152
local PREPARE_MS,START_LEAD_MS=120000,1000
local publishPlayback
local function identity(src) return Phone.rawIdentity(Phone.rawPlayer(src)) end
local function current(src,cid,number) return identity(src)==cid and Phone.activeNumber(src)==number end
local function fail(cb,msg) cb(Phone.publicError(msg)) end
local function validId(id) return type(id)=='string' and #id==37 and id:match('^MEMO%-%x+$') end
local function meta(id) if not validId(id) then return nil end;return PhoneDB.one('SELECT id,owner_cid,name,mime,size_bytes,duration_ms,CHAR_LENGTH(data_base64) encoded_size FROM peak_phone_voice_memos WHERE id=?',{id}) end
local function sessionValid(s,ignorePreparationExpiry)
 if not current(s.source,s.cid,s.number) or Phone.hasPhone and not Phone.hasPhone(s.source) or GetPlayerRoutingBucket(s.source)~=s.bucket or (s.started and GetGameTimer()-s.started>=s.duration or not s.started and not ignorePreparationExpiry and GetGameTimer()-s.created>PREPARE_MS) then return false end
 local ped=GetPlayerPed(s.source);if not ped or ped==0 then return false end
 if s.output=='vehicle' then return DoesEntityExist(s.vehicle) and GetVehiclePedIsIn(ped,false)==s.vehicle end
 return true
end
local function gainFor(s,src,validated)
 if not identity(src) then return nil end
 if not validated and not sessionValid(s) or GetPlayerRoutingBucket(src)~=s.bucket then return nil end
 if validated and (identity(s.source)~=s.cid or GetPlayerRoutingBucket(s.source)~=s.bucket or Phone.hasPhone and not Phone.hasPhone(s.source)) then return nil end
 local ownerPed=GetPlayerPed(s.source);if not ownerPed or ownerPed==0 then return nil end
 local ped=GetPlayerPed(src);if not ped or ped==0 then return nil end
 if s.output=='vehicle' then return DoesEntityExist(s.vehicle) and GetVehiclePedIsIn(ownerPed,false)==s.vehicle and GetVehiclePedIsIn(ped,false)==s.vehicle and .8 or nil end
 local a,b=GetEntityCoords(ownerPed),GetEntityCoords(ped)
 local distance=math.sqrt((a.x-b.x)^2+(a.y-b.y)^2+(a.z-b.z)^2)
 if distance>=20 then return nil end;return math.max(0,1-distance/20)*.85
end
local function startPrepared(id,s)
 if s.started then return end
 if not sessionValid(s,true) then V.sessions[id]=nil;return end
 local ready=true
 for src,cid in pairs(s.participants) do
  if identity(src)~=cid or gainFor(s,src,true)==nil then s.participants[src]=nil
  elseif s.ready[src]~=cid then ready=false end
 end
 local timedOut=GetGameTimer()-s.created>=PREPARE_MS
 if s.ready[s.source]==s.cid and (ready or timedOut) then s.started=GetGameTimer()+START_LEAD_MS
 elseif timedOut then V.sessions[id]=nil end
end
local function canRead(src,row)
 local cid=identity(src);if not cid or not row then return false end
 if row.owner_cid==cid then return true end
 if Phone.hasPhone and not Phone.hasPhone(src) then return false end
 local number=Phone.activeNumber(src);if not number then return false end
 -- IDs are strict hex; JSON IDs cannot contain SQL wildcard characters.
 local pattern='%"id":"'..row.id..'"%'
 local direct=PhoneDB.one('SELECT id FROM phone_messages WHERE (from_phone=? OR to_phone=?) AND attachments LIKE ? LIMIT 1',{number,number,pattern})
 if direct then return current(src,cid,number) end
 local group=PhoneDB.one('SELECT m.id FROM phone_group_messages m INNER JOIN phone_group_members gm ON gm.group_id=m.group_id WHERE gm.phone=? AND m.attachments LIKE ? LIMIT 1',{number,pattern})
 return group~=nil and current(src,cid,number)
end
function Phone.hasMemoAttachment(attachments)
 for _,a in ipairs(attachments or {}) do if type(a)=='table' and a.type=='voice-memo' then return true end end;return false
end
function Phone.validateMemoAttachments(src,attachments)
 for _,a in ipairs(attachments) do if type(a)=='table' and a.type=='voice-memo' then
  local row=meta(a.id);if not canRead(src,row) then return false end
  a.name=row.name;a.durationMs=tonumber(row.duration_ms)
 end end;return true
end
local function callback(route,fn)
 Peak.Functions.CreateCallback('peak-phone:Server:VoiceMemos:'..route,function(src,cb,data) fn(src,cb,type(data)=='table' and data or {}) end)
end
callback('BeginUpload',function(src,cb,d)
 local cid,number=identity(src),Phone.activeNumber(src)
 local size,duration=tonumber(d.SizeBytes),tonumber(d.DurationMs)
 local name,op=Phone.string(d.Name,100),Phone.string(d.OperationId,80)
 if not cid or not name or not op or d.Mime~='audio/webm' or not size or size%1~=0 or size<4 or size>MAX_BYTES or not duration or duration%1~=0 or duration<1 or duration>1200000 then return fail(cb,'Choose a valid WebM recording up to 8 MB and 20 minutes.') end
 local previous=PhoneDB.one('SELECT id,name,duration_ms,size_bytes FROM peak_phone_voice_memos WHERE owner_cid=? AND operation_id=?',{cid,op})
 if not current(src,cid,number) then return fail(cb,'Character or SIM changed.') end
 if previous then
  if tonumber(previous.duration_ms)~=duration or tonumber(previous.size_bytes)~=size then return fail(cb,'The recording reference changed.') end
  if previous.name~=name then PhoneDB.update('UPDATE peak_phone_voice_memos SET name=? WHERE id=? AND owner_cid=?',{name,previous.id,cid});if not current(src,cid,number) then return fail(cb,'Character or SIM changed.') end end
  return cb({Success=true,MemoId=previous.id,Name=name,DurationMs=duration})
 end
 local reserved=0
 for id,u in pairs(V.uploads) do
  if u.expires<GetGameTimer() or not current(u.source,u.cid,u.number) then V.uploads[id]=nil
  else if u.cid==cid then return fail(cb,'Another recording is still uploading. Wait a moment.') end;reserved=reserved+u.size end
 end
 if reserved+size>64*1024*1024 then return fail(cb,'Recording uploads are busy. Try again shortly.') end
 -- Reserve before the database yield so simultaneous begins cannot evade quotas.
 local id='MEMO-'..Phone.random(32,'0123456789abcdef')
 local u={source=src,cid=cid,number=number,size=size,duration=duration,name=name,op=op,chunks={},next=0,expires=GetGameTimer()+180000}
 V.uploads[id]=u
 local quota=PhoneDB.one('SELECT COUNT(*) items,COALESCE(SUM(size_bytes),0) bytes FROM peak_phone_voice_memos WHERE owner_cid=?',{cid})
 if not current(src,cid,number) or tonumber(quota and quota.items or 0)>=80 or tonumber(quota and quota.bytes or 0)+size>32*1024*1024 then V.uploads[id]=nil;return fail(cb,'Recording storage is full or your identity changed.') end
 cb({Success=true,UploadId=id,ChunkSize=CHUNK})
end)
callback('UploadChunk',function(src,cb,d)
 local u=V.uploads[d.UploadId];local index=tonumber(d.Index);local data=d.Data
 if not u or u.source~=src or not current(src,u.cid,u.number) or u.expires<GetGameTimer() or u.completing then return fail(cb,'The recording upload expired.') end
 local encoded=math.ceil(u.size/3)*4;local count=math.ceil(encoded/CHUNK)
 local expected=index and math.min(CHUNK,encoded-index*CHUNK) or 0
 if not index or index%1~=0 or index<0 or index>=count or type(data)~='string' or #data~=expected or not data:match('^[A-Za-z0-9+/]+=*$') or data:find('=',1,true) and index~=count-1 then return fail(cb,'Invalid recording chunk.') end
 if index<u.next then return cb(u.chunks[index+1]==data and {Success=true} or Phone.publicError('Recording chunk changed.')) end
 if index~=u.next then return fail(cb,'Recording chunks arrived out of order.') end
 u.chunks[index+1]=data;u.next=u.next+1;cb({Success=true})
end)
callback('AbortUpload',function(src,cb,d)
 local u=V.uploads[d.UploadId];if u and u.source==src and identity(src)==u.cid and not u.completing then V.uploads[d.UploadId]=nil end;cb({Success=true})
end)
callback('CompleteUpload',function(src,cb,d)
 local u=V.uploads[d.UploadId]
 if not u or u.source~=src or not current(src,u.cid,u.number) or u.expires<GetGameTimer() or u.completing then return fail(cb,'The recording upload expired.') end
 local raw=table.concat(u.chunks);local encoded=math.ceil(u.size/3)*4
 local padding=(3-u.size%3)%3
 if #raw~=encoded or not raw:match('^GkXfo[wxyz0-9+/]') or (padding>0 and raw:sub(-padding)~=string.rep('=',padding)) or (padding==0 and raw:find('=',1,true)) or raw:sub(1,#raw-padding):find('=',1,true) then return fail(cb,'Recording data is incomplete or invalid.') end
 u.completing=true
 local ok,inserted=pcall(PhoneDB.insert,'INSERT INTO peak_phone_voice_memos(id,owner_cid,operation_id,name,mime,size_bytes,duration_ms,data_base64,created_at) VALUES(?,?,?,?,?,?,?,?,?)',{d.UploadId,u.cid,u.op,u.name,'audio/webm',u.size,u.duration,raw,os.time()*1000})
 V.uploads[d.UploadId]=nil
 if not ok or inserted==nil or inserted==false then return fail(cb,'The recording could not be saved. Retry using the same reference.') end
 local saved=meta(d.UploadId);if not saved or saved.owner_cid~=u.cid then return fail(cb,'The recording could not be verified. Retry using the same reference.') end
 if not current(src,u.cid,u.number) then return fail(cb,'Recording saved under your prior identity. Refresh before sharing.') end
 cb({Success=true,MemoId=d.UploadId,Name=u.name,DurationMs=u.duration})
end)
callback('Describe',function(src,cb,d)
 local row=meta(d.MemoId);local cid=identity(src);local world=d.SessionId~=nil
 local function allowed()
  if identity(src)~=cid or not row then return false end
  if world then local session=V.sessions[d.SessionId];return session and session.memo==row.id and gainFor(session,src)~=nil end
  return canRead(src,row)
 end
 if not allowed() then return fail(cb,'This recording is unavailable.') end
 local ticket=Phone.random(48,'0123456789abcdef')
 if not allowed() then return fail(cb,'Recording access changed.') end
 local count,oldest,expiry=0,nil,math.huge
 for id,t in pairs(V.tickets) do if t.source==src then count=count+1;if t.expires<expiry then oldest,expiry=id,t.expires end end end
 if count>=8 and oldest then V.tickets[oldest]=nil end
 -- World tickets are bound to one playback session and never bootstrap a listener device.
 V.tickets[ticket]={source=src,cid=cid,number=not world and Phone.activeNumber(src) or nil,row=row,expires=GetGameTimer()+180000,world=world,session=d.SessionId}
 cb({Success=true,Ticket=ticket,MemoId=row.id,Name=row.name,Mime=row.mime,SizeBytes=tonumber(row.size_bytes),DurationMs=tonumber(row.duration_ms),Chunks=math.ceil(tonumber(row.encoded_size)/CHUNK)})
end)
callback('GetChunk',function(src,cb,d)
 local t=V.tickets[d.Ticket];local index=tonumber(d.Index)
 local function allowed() return t and t.source==src and t.expires>GetGameTimer() and identity(src)==t.cid and (t.world and V.sessions[t.session] and V.sessions[t.session].memo==t.row.id and gainFor(V.sessions[t.session],src)~=nil or not t.world and Phone.activeNumber(src)==t.number and canRead(src,t.row)) end
 if not allowed() or not index or index%1~=0 or index<0 or index>=math.ceil(tonumber(t.row.encoded_size)/CHUNK) then return fail(cb,'Recording access expired.') end
 local chunk=PhoneDB.one('SELECT SUBSTRING(data_base64,?,?) data FROM peak_phone_voice_memos WHERE id=?',{index*CHUNK+1,CHUNK,t.row.id})
 if not allowed() or not chunk then return fail(cb,'Recording access expired.') end
 t.chunks=t.chunks or {};t.chunks[index]=true
 local total=math.ceil(tonumber(t.row.encoded_size)/CHUNK);local complete=true
 for part=0,total-1 do if not t.chunks[part] then complete=false;break end end
 t.complete=complete
 cb({Success=true,Data=chunk.data})
end)
callback('PlaybackReady',function(src,cb,d)
 local s=V.sessions[d.SessionId];local t=V.tickets[d.Ticket];local cid=identity(src)
 if not s or not t or not t.world or t.session~=d.SessionId or t.source~=src or t.cid~=cid or not t.complete or t.expires<=GetGameTimer() or gainFor(s,src)==nil then return fail(cb,'Recording playback access expired.') end
 if s.ready[src]==cid then cb({Success=true});return end
 s.ready[src]=cid;startPrepared(d.SessionId,s)
 cb({Success=true});publishPlayback()
end)
callback('Share',function(src,cb,d)
 if not Phone.rate(src,'voice-memo-share',1,1000) then return fail(cb,'Wait a moment before sharing another recording.') end
 local row=meta(d.MemoId);local cid,number=identity(src),Phone.activeNumber(src);local op=Phone.string(d.OperationId,60)
 if not canRead(src,row) or not number or not op or type(d.Phones)~='table' or #d.Phones<1 or #d.Phones>15 then return fail(cb,'Choose up to 15 valid recipients.') end
 local targets,seen={},{}
 for key,value in pairs(d.Phones) do local p=Phone.phone(value);if type(key)~='number' or key%1~=0 or key<1 or key>#d.Phones or not p or seen[p] then return fail(cb,'Choose distinct phone numbers.') end;seen[p]=true;targets[#targets+1]=p end
 if #targets~=#d.Phones then return fail(cb,'Choose valid recipients.') end
 local sent,failed={},{}
 for _,p in ipairs(targets) do
  if not current(src,cid,number) then return fail(cb,'Your identity changed. Some recordings may already have been sent.') end
  local result=Phone.sendMessage(src,{Phone=p,Message='',Attachments={{type='voice-memo',id=row.id,name=row.name,durationMs=tonumber(row.duration_ms)}},OperationId=op..'-'..p})
  if result and result.Success then sent[#sent+1]=p else failed[#failed+1]=p end
 end
 cb({Success=#failed==0,Sent=sent,Failed=failed,Msg=#failed>0 and 'Some recipients could not receive the recording. Retry to send only the remaining messages.' or nil})
end)
callback('StartPlayback',function(src,cb,d)
 local row=meta(d.MemoId);local cid,number=identity(src),Phone.activeNumber(src)
 if not canRead(src,row) or (d.Output~='speaker' and d.Output~='vehicle') then return fail(cb,'This recording cannot be played here.') end
 local ped=GetPlayerPed(src);if not ped or ped==0 or not current(src,cid,number) then return fail(cb,'Your character is unavailable.') end
 local vehicle=GetVehiclePedIsIn(ped,false)
 if d.Output=='vehicle' and (vehicle==0 or not DoesEntityExist(vehicle)) then return fail(cb,'Enter a vehicle to play this recording on its radio.') end
 for id,s in pairs(V.sessions) do if s.source==src or d.Output=='vehicle' and s.vehicle==vehicle then V.sessions[id]=nil end end
 local id=Phone.random(32,'0123456789abcdef')
 local s={source=src,cid=cid,number=number,memo=row.id,name=row.name,duration=tonumber(row.duration_ms),created=GetGameTimer(),ready={},participants={},output=d.Output,vehicle=d.Output=='vehicle' and vehicle or nil,bucket=GetPlayerRoutingBucket(src)}
 V.sessions[id]=s
 for _,raw in ipairs(GetPlayers()) do local listener=tonumber(raw);if gainFor(s,listener,true)~=nil then s.participants[listener]=identity(listener) end end
 s.participants[src]=cid
 cb({Success=true,SessionId=id,MemoId=row.id,Output=d.Output,DurationMs=tonumber(row.duration_ms)})
 publishPlayback()
end)
callback('StopPlayback',function(src,cb,d)
 for id,s in pairs(V.sessions) do if s.source==src and (d.SessionId==nil or id==d.SessionId) then V.sessions[id]=nil end end;cb({Success=true})
end)
local listeners={}
publishPlayback=function()
 -- Account/SIM validation may read the database. Do it once per session;
 -- each listener still checks current characters, inventory, bucket and range.
 for id,s in pairs(V.sessions) do if not sessionValid(s) then V.sessions[id]=nil end end
 local nextListeners={}
 for _,raw in ipairs(GetPlayers()) do local src=tonumber(raw);local sessions={}
  for id,s in pairs(V.sessions) do local gain=gainFor(s,src,true);if gain then sessions[#sessions+1]={SessionId=id,MemoId=s.memo,Name=s.name,DurationMs=s.duration,Preparing=s.started==nil,ElapsedMs=s.started and GetGameTimer()-s.started or 0,Output=s.output,Gain=gain,IsOwner=src==s.source} end end
  table.sort(sessions,function(a,b) if a.IsOwner~=b.IsOwner then return a.IsOwner end;if a.Gain~=b.Gain then return a.Gain>b.Gain end;return a.SessionId<b.SessionId end)
  while #sessions>4 do table.remove(sessions) end
  if #sessions>0 or listeners[src] then TriggerClientEvent('peak-phone:Client:VoiceMemos:PlaybackState',src,{Sessions=sessions}) end
  if #sessions>0 then nextListeners[src]=true end
 end;listeners=nextListeners
end
CreateThread(function()
 while true do Wait(1000)
  for id,u in pairs(V.uploads) do if u.expires<GetGameTimer() or not current(u.source,u.cid,u.number) then V.uploads[id]=nil end end
  for id,t in pairs(V.tickets) do if t.expires<GetGameTimer() or identity(t.source)~=t.cid then V.tickets[id]=nil end end
  for id,s in pairs(V.sessions) do startPrepared(id,s) end
  publishPlayback()
 end
end)
AddEventHandler('playerDropped',function() local src=source;listeners[src]=nil;for id,s in pairs(V.sessions) do if s.source==src then V.sessions[id]=nil end end;for id,u in pairs(V.uploads) do if u.source==src then V.uploads[id]=nil end end;for id,t in pairs(V.tickets) do if t.source==src then V.tickets[id]=nil end end end)
AddEventHandler('onResourceStop',function(resource) if resource~=GetCurrentResourceName() then return end;for src in pairs(listeners) do TriggerClientEvent('peak-phone:Client:VoiceMemos:PlaybackState',src,{Sessions={}}) end end)
