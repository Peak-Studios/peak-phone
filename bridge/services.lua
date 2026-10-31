-- Server services owned by the phone. No fake framework resources are exported.
local B = exports['peak-bridge']
Phone.Locks = {}
function Phone.sameCharacter(src, cid)
    local ok, raw = pcall(Phone.rawPlayer, src)
    return ok and raw and Phone.rawIdentity(raw) == cid
end
function Phone.withLocks(keys, fn)
    local unique, sorted = {}, {}
    for _, k in ipairs(keys) do if not unique[k] then unique[k]=true;sorted[#sorted+1]=k end end
    table.sort(sorted)
    local deadline = GetGameTimer() + 18000
    while true do
        local busy=false;for _,k in ipairs(sorted) do if Phone.Locks[k] then busy=true;break end end
        if not busy then break end
        if GetGameTimer()>deadline then error('Operation is busy; wait before trying again.') end
        Wait(20)
    end
    for _,k in ipairs(sorted) do Phone.Locks[k]=true end
    local result=table.pack(pcall(fn))
    for _,k in ipairs(sorted) do Phone.Locks[k]=nil end
    if not result[1] then error(result[2]) end
    return table.unpack(result,2,result.n)
end
function Phone.publicError(message)
    return {Success=false, Msg=message, Error=message}
end
function Phone.commas(value)
    local s=tostring(math.floor(tonumber(value) or 0));local negative=s:sub(1,1)=='-'
    if negative then s=s:sub(2) end
    s=s:reverse():gsub('(%d%d%d)','%1,'):reverse():gsub('^,','')
    return (negative and '-' or '')..s
end
function Phone.mediaURL(url, allowEmpty)
    if allowEmpty and url=='' then return '' end
    if not Phone.text(url,PhoneConfig.Media.MaxURLLength) then return nil end
    local host=url:match('^https://([^/%?#]+)')
    if not host or host:find('[@:]') or url:find('[%s<>"\'\\%c]') then return nil end
    host=host:lower()
    for _,allowed in ipairs(PhoneConfig.Media.AllowedHosts) do if host==allowed:lower() then return url end end
    return nil
end
function Phone.safeImage(url) return Phone.mediaURL(url,true) end
function Phone.locationAttachment(value)
    if type(value)~='table' or value.type~='location' then return nil end
    local x,y=tonumber(value.x),tonumber(value.y)
    if not x or not y or x~=x or y~=y or x==math.huge or x==-math.huge or y==math.huge or y==-math.huge
        or x< -10000 or x>10000 or y< -10000 or y>15000 then return nil end
    local label=Phone.string(value.label,80) or 'Shared location'
    return {type='location',x=math.floor(x*100+0.5)/100,y=math.floor(y*100+0.5)/100,label=label}
end
function Phone.attachmentList(value)
    if value==nil then return {} end
    if type(value)~='table' or #value>5 then return nil end
    local entries,last=0,0
    for key in pairs(value) do
        if type(key)~='number' or key<1 or key>5 or key%1~=0 then return nil end
        entries=entries+1;if key>last then last=key end
    end
    if entries~=last then return nil end
    local out={}
    for _,v in ipairs(value) do
        if type(v)=='string' then local u=Phone.mediaURL(v);if not u then return nil end;out[#out+1]=u
        elseif type(v)=='table' then
            if v.type=='location' then
                local location=Phone.locationAttachment(v);if not location then return nil end;out[#out+1]=location
            elseif v.type=='voice-memo' then
                if type(v.id)~='string' or #v.id~=37 or not v.id:match('^MEMO%-%x+$') then return nil end
                local name=Phone.string(v.name,100);local duration=Phone.number(v.durationMs,1200000)
                if not name or not duration then return nil end
                out[#out+1]={type='voice-memo',id=v.id,name=name,durationMs=duration}
            elseif v.type=='cash-request' then
                local id=Phone.number(v.requestId,2147483647)
                if not id then return nil end
                out[#out+1]={type='cash-request',requestId=id}
            elseif v.type=='cash-transfer' then
                local id=Phone.string(v.operationId,80)
                if not id or not id:match('^[%w%-]+$') then return nil end
                out[#out+1]={type='cash-transfer',operationId=id}
            else
                local u=Phone.mediaURL(v.url or v.Url or v.URL);if not u then return nil end
                out[#out+1]={url=u,type='image'}
            end
        else return nil end
    end
    return out
end
function Phone.sameAttachments(saved,expected)
    if type(saved)~='string' or type(expected)~='table' then return false end
    local ok,decoded=pcall(json.decode,saved)
    if not ok or type(decoded)~='table' then return false end
    local normalized=Phone.attachmentList(decoded)
    if not normalized then return false end
    local function same(a,b)
        if type(a)~=type(b) then return false end
        if type(a)~='table' then return a==b end
        -- Renaming a recording changes its label, not its immutable message reference.
        if a.type=='voice-memo' or b.type=='voice-memo' then return a.type==b.type and a.id==b.id and a.durationMs==b.durationMs end
        for key,value in pairs(a) do if not same(value,b[key]) then return false end end
        for key in pairs(b) do if a[key]==nil then return false end end
        return true
    end
    return same(normalized,expected)
end
function Phone.hasCashAttachment(attachments)
    for _,attachment in ipairs(attachments or {}) do
        if type(attachment)=='table' and (attachment.type=='cash-request' or attachment.type=='cash-transfer') then return true end
    end
    return false
end
function Phone.messagePreview(message,attachments)
    if type(message)=='string' and message:match('^data:audio/webm;') then return 'Voice message' end
    if type(message)=='string' and message~='' then return message end
    for _,attachment in ipairs(attachments or {}) do
        if type(attachment)=='table' and attachment.type=='voice-memo' then return 'Voice recording' end
        if type(attachment)=='table' and attachment.type=='cash-request' then return 'iFruit Cash request' end
        if type(attachment)=='table' and attachment.type=='cash-transfer' then return 'iFruit Cash payment' end
        if type(attachment)=='table' and attachment.type=='location' then return 'Shared location' end
        if (type(attachment)=='table' and (attachment.type=='image' or attachment.url)) or type(attachment)=='string' then return 'Photo' end
    end
    return 'New message'
end
function Phone.messageBody(value)
    if type(value)~='string' then return false end
    if value:sub(1,5)=='data:' then
        if #value>80000 then return false end
        local encoded=value:match('^data:audio/webm;base64,(.+)$');if not encoded or #encoded%4~=0 then return false end
        local body,padding=encoded:match('^([A-Za-z0-9+/]+)(=*)$');if not body or #padding>2 or #body<6 then return false end
        local marker=body:sub(6,6)
        return body:sub(1,5)=='GkXfo' and ('wxyz0123456789+/'):find(marker,1,true)~=nil
    end
    return Phone.text(value,4000,true)
end

function Phone.cleanHTML(html)
    -- Rich text is stored for the Quill editor, but rendered only through the bundled DOM sanitizer.
    if not Phone.text(html,100000,true) then return nil end
    return html
end
Phone.AppIds={}
for _,id in ipairs({'kilogram','binge','calls','messages','mails','contacts','gallery','camera','documents','settings','details','store','housing','y','wenmo','services','vehicles','debt','crypto','jobcenter','jobcreator','busdriver','lumberjack','employment','peakify','news','bin','calculator','yellowpages','doj','pinger','tierup','racing','time-trials','cars','facetime','guber','bankbusters'}) do Phone.AppIds[id]=true end
local builtin={calls=true,messages=true,mails=true,contacts=true,gallery=true,camera=true,documents=true,settings=true,details=true,store=true}
function Phone.capabilities(src)
    local caps={}
    for id in pairs(Phone.AppIds) do caps[id]={available=true,reason=''} end
    for id,deps in pairs(Phone.LegacyRequirements) do
        caps[id]={available=Phone.integrationAvailable(id),reason='Requires a gameplay integration: '..table.concat(deps,', ')}
    end
    caps.jobcenter={available=PhoneConfig.Jobs.Enabled and Phone.Jobs and Phone.Jobs.ready or false,reason='Job Center is initializing or disabled. Run phone_doctor.'}
    caps.jobcreator={available=PhoneConfig.Jobs.Enabled and Phone.Jobs and Phone.Jobs.admin(src) or false,reason='Administrator access is required.'}
    for _,id in ipairs({'kilogram','binge'}) do caps[id]={available=PhoneConfig.Social.Enabled and PhoneConfig.Social[id]~=false,reason='This social app is disabled by the server owner.'} end
    local hasSim=true
    if Phone.Devices and Phone.Devices.active then
        local device=Phone.Devices.active(src);hasSim=device~=nil and device.SimId~=nil and device.PhoneNumber~=nil
    end
    if not hasSim then
        local reason='Insert a SIM in Settings to use calls, messages and contacts.'
        caps.messages={available=false,reason=reason};caps.contacts={available=false,reason=reason}
    end
    local voice=Phone.started(PhoneConfig.VoiceResource) and GetConvarInt('voice_enableCalls',1)==1
    caps.calls={available=hasSim and voice,reason=not hasSim and 'Insert a SIM in Settings to make calls.' or 'Start pma-voice with voice_enableCalls enabled.'}
    local turn=Phone.RTC and Phone.RTC.configured and Phone.RTC.configured()
    caps.facetime={available=hasSim and PhoneConfig.Video.Enabled and (turn or not PhoneConfig.Video.RequireTURN),reason=not hasSim and 'Insert a SIM in Settings to make video calls.' or 'Configure a TURN relay in server.cfg. Run phone_doctor for details.'}
    caps.camera={available=Phone.Upload and Phone.Upload.configured and Phone.Upload.configured() or false,reason='Photo capture needs screenshot-basic and a server-side upload provider. Gallery URL imports are separate.'}
    caps.peakify={available=Phone.started('xsound'),reason='Start xsound to enable music playback.'}
    -- A stock garage can be listed without authorizing arbitrary vehicle spawning or ownership changes.
    caps.vehicles={available=true,reason='',features={tracking=true,sales=PhoneConfig.EnableVehicleSales and PhoneIntegration.Capabilities.vehicleSales==true}}
    -- Owner job rules are server-calculated. The UI hint is not authorization;
    -- add presentation-only app capabilities even for IDs outside Phone.AppIds,
    -- then every phone RPC checks the same rule in Phone.authorized.
    for id in pairs(Phone.OwnerUIApps or {}) do
        if not caps[id] then caps[id]={available=true,reason=''} end
    end
    for id,cap in pairs(caps) do
        if not Phone.ownerAppAllowed(src,id) then
            cap.ownerAccess=false
            cap.available=false
            cap.reason='Your current job does not have access to this app.'
        end
    end
    return caps
end
PhonePeak.Functions.CreateCallback('peak-phone:portable:bootstrap',function(src,cb)
    local p=Phone.getPlayer(src);if not p then return cb(nil) end
    local items={}
    for _,name in ipairs({PhoneConfig.PhoneItem,'burner_sim','simcard','boombox','racing_usb'}) do
        local ok,n=pcall(function() return B:GetItemCount(src,name) end);items[name]=ok and tonumber(n) or 0
    end
    cb({PlayerData=p.PlayerData,HasPhone=Phone.hasPhone(src),Items=items,Capabilities=Phone.capabilities(src),OwnerConfig=Phone.ownerPublicConfig(),Device=Phone.Devices and Phone.Devices.active and Phone.Devices.active(src) or nil,Version=Phone.Version})
end)
-- Native social premium uses the same framework bank wallet as Wenmo.
PhoneServices['peak-financials']={}
local money=PhoneServices['peak-financials']
function money:GetAccountBalance(account)
    local p=PhonePeak.Functions.GetPlayerByCitizenId(tostring(account or ''))
    return p and Phone.nativeMoney(p.PlayerData.source,'bank') or 0
end
function money:GetFinancialAccountById(account)
    local p=PhonePeak.Functions.GetPlayerByCitizenId(tostring(account or ''))
    return p and {AccountId=p.PlayerData.citizenid,Owner=p.PlayerData.citizenid,CitizenId=p.PlayerData.citizenid} or nil
end
function money:RemoveMoneyFromAccount(cid,from,account,amount,kind,reason)
    if tostring(cid)~=tostring(account) then return false end
    local p=PhonePeak.Functions.GetPlayerByCitizenId(tostring(cid))
    return p and Phone.removeMoney(p.PlayerData.source,'bank',amount,reason or kind) or false
end
function money:AddMoneyToAccount(cid,from,account,amount,kind,reason)
    local p=PhonePeak.Functions.GetPlayerByCitizenId(tostring(account))
    return p and Phone.addMoney(p.PlayerData.source,'bank',amount,reason or kind) or false
end
Phone.NativeAddEventHandler('onResourceStop',function(name)
    if name==GetCurrentResourceName() then return end
    local core={['qb-core']=true,qbx_core=true,es_extended=true,['peak-core']=true,['peak-bridge']=true}
    if core[name] then
        if Phone.Calls then Phone.Calls.stopAll('Framework stopped') end
        Phone.Server.Profiles={};Phone.Server.Framework=nil
        TriggerClientEvent('peak-phone:portable:unload',-1)
    end
    for key,owner in pairs(Phone.IntegrationOwners or {}) do
        if owner==name then
            PhoneIntegration.Callbacks[key]=nil;Phone.IntegrationOwners[key]=nil
            if Phone.IntegrationApps then Phone.IntegrationApps[key]=nil end
        end
    end
    for key,owner in pairs(Phone.CapabilityOwners or {}) do
        if owner==name then PhoneIntegration.Capabilities[key]=nil;Phone.CapabilityOwners[key]=nil end
    end
    local changed=false
    for key,owner in pairs(Phone.AdapterOwners or {}) do
        if owner==name then PhoneIntegration[key]=nil;Phone.AdapterOwners[key]=nil;changed=true end
    end
    if changed then
        for _,src in ipairs(GetPlayers()) do TriggerClientEvent('peak-phone:portable:capabilitiesChanged',tonumber(src)) end
    end
end)
Phone.NativeRegisterNetEvent('peak-phone:portable:logout')
Phone.NativeAddEventHandler('peak-phone:portable:logout',function()
    local src=tonumber(source);if Phone.Calls then Phone.Calls.stopFor(src,'Character changed') end
end)
CreateThread(function()
    PhoneDB.wait()
    local deadline=GetGameTimer()+30000
    while (not Phone.started('peak-bridge') or not B:IsReady()) and GetGameTimer()<deadline do Wait(250) end
    local ok,err=pcall(Phone.framework)
    if not ok then print('[Peak Duo] '..tostring(err));return end
    B:RegisterUsableItem(PhoneConfig.PhoneItem,function(src) TriggerClientEvent('peak-phone:portable:use',src) end)
    print(('[Peak Duo %s] Adapter: %s. Run phone_doctor in the server console.'):format(Phone.Version,Phone.framework()))
end)
RegisterCommand('phone_doctor',function(src)
    if src~=0 and not PhonePeak.Functions.HasPermission(src,'admin') then return end
    local function log(s) print('[Peak Duo] '..s);if src~=0 then TriggerClientEvent('chat:addMessage',src,{args={'Peak Duo',s}}) end end
    log('Version '..Phone.Version..' | SQL: '..(PhoneDB.Ready and 'ready' or tostring(PhoneDB.Error or 'waiting')))
    local ok,core=pcall(Phone.framework);log('Framework: '..(ok and core or 'not ready'))
    for _,res in ipairs({'ox_lib','oxmysql','peak-bridge',PhoneConfig.VoiceResource,'xsound','screenshot-basic'}) do log(res..': '..GetResourceState(res)) end
    if PhoneDB.Ready then
        local rows=PhoneDB.query("SELECT operation_id,status FROM peak_phone_ledger WHERE status NOT IN ('complete','refunded','rejected') ORDER BY created_at DESC LIMIT 10")
        log('Unresolved wallet journal operations: '..#rows..' (never retry these automatically)')
        for _,r in ipairs(rows) do log(r.operation_id..' / '..r.status) end
    end
    log('Job Center: '..((Phone.Jobs and Phone.Jobs.ready) and 'ready' or (Phone.Jobs and Phone.Jobs.error or 'starting')))
    log('TURN: '..((Phone.RTC and Phone.RTC.configured()) and 'configured (connectivity still needs a two-player test)' or 'not available')..(Phone.RTC and Phone.RTC.lastHttpStatus and ('; last credential HTTP '..tostring(Phone.RTC.lastHttpStatus)) or ''))
    log('Live ESX/QB/Qbox and camera/TURN tests must be run on your server; startup checks are not those tests.')
end,false)
