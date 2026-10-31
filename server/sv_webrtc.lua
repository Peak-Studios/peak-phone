-- Long-lived API keys are read only from NON-replicated server convars (set, never setr/sets).
Phone.RTC={cache={},pending={},lastHttpStatus=nil,retryAt=0}
local RTC=Phone.RTC
local function provider() return GetConvar('phone_turn_provider','cloudflare') end
local function cfConfig()
    return GetConvar('phone_turn_key_id',''),GetConvar('phone_turn_api_token','')
end
function RTC.configured()
    if RTC.retryAt and GetGameTimer()<RTC.retryAt then return false end
    if provider()=='coturn' then return #GetConvar('phone_turn_shared_secret','')>=32 and GetConvar('phone_turn_urls','')~='' end
    if provider()=='cloudflare' then local id,token=cfConfig();return #id>=8 and id:match('^[%w_-]+$')~=nil and #token>=20 end
    return false
end
local function validate(data,requireTurn)
    if type(data)~='table' or type(data.iceServers)~='table' or #data.iceServers>10 then return nil end
    local servers,hasTurn={ },false
    for _,server in ipairs(data.iceServers) do
        local urls=type(server.urls)=='string' and {server.urls} or server.urls
        if type(urls)=='table' and #urls<=10 then
            local kept={}
            for _,url in ipairs(urls) do
                if Phone.text(url,512) and (url:match('^stun:') or url:match('^turn:') or url:match('^turns:')) and not url:find(':53[%?%s]') and not url:match(':53$') then
                    kept[#kept+1]=url
                    if url:match('^turns?:') then
                        if not Phone.text(server.username,512) or not Phone.text(server.credential,1024) then return nil end
                        hasTurn=true
                    end
                end
            end
            if #kept>0 then servers[#servers+1]={urls=kept,username=server.username,credential=server.credential} end
        end
    end
    if requireTurn==nil then requireTurn=PhoneConfig.Video.RequireTURN end
    if requireTurn and not hasTurn then return nil end
    return servers
end
local function cfRevoke(username)
    local id,token=cfConfig()
    if not Phone.text(username,512) or not username:match('^[%w_:%-]+$') or id=='' then return end
    local encoded=username:gsub(':','%%3A')
    PerformHttpRequest('https://rtc.live.cloudflare.com/v1/turn/keys/'..id..'/credentials/'..encoded..'/revoke',function(status)
        if status~=204 and PhoneConfig.Debug then print('[Peak Duo] TURN revocation returned status '..tostring(status)) end
    end,'POST','',{Authorization='Bearer '..token,['Content-Type']='application/json',['User-Agent']='PeakPhone/2.1 (FiveM TURN)'})
end
function RTC.revoke(callId,src)
    local key=callId..':'..src;local record=RTC.cache[key];RTC.cache[key]=nil
    if record and record.provider=='cloudflare' then
        local seen={}
        for _,server in ipairs(record.servers) do
            if server.username and not seen[server.username] then seen[server.username]=true;cfRevoke(server.username) end
        end
    end
end
local function mint(callId,src,authorize,lifetime,requireTurn)
    local key=callId..':'..src
    if RTC.cache[key] then return RTC.cache[key].servers end
    if RTC.pending[key] then
        local deadline=GetGameTimer()+11000
        while RTC.pending[key] and GetGameTimer()<deadline do Wait(20) end
        return RTC.cache[key] and RTC.cache[key].servers
    end
    RTC.pending[key]=true
    local ttl=math.min(14400,(lifetime or PhoneConfig.CallMaxSeconds)+180)
    local ok,data=pcall(function()
        if provider()=='coturn' then return exports[GetCurrentResourceName()]:PeakPhoneCoturnCredentials(ttl) end
        if not RTC.configured() then return nil end
        local id,token=cfConfig();local p=promise.new();local settled=false
        local function finish(value) if not settled then settled=true;p:resolve(value) end end
        SetTimeout(10000,function() finish(false) end)
        PerformHttpRequest('https://rtc.live.cloudflare.com/v1/turn/keys/'..id..'/credentials/generate-ice-servers',function(status,body)
            RTC.lastHttpStatus=status
            if status==201 then RTC.retryAt=0
            else
                -- A present key is not proof that Cloudflare accepts it. Back off
                -- failed issuance so the next dial reports a relay problem up front.
                RTC.retryAt=GetGameTimer()+((status==401 or status==403) and 60000 or 10000)
                print('[Peak Duo] TURN credential issuance failed (HTTP '..tostring(status)..'). Check the TURN key ID/token and provider access.')
            end
            local parsed
            if status==201 and type(body)=='string' and #body<=32768 then
                local valid,result=pcall(json.decode,body);if valid then parsed=result end
            end
            if settled then
                -- A response arriving after timeout still minted a credential; revoke rather than leak it.
                if parsed and type(parsed.iceServers)=='table' then for _,v in ipairs(parsed.iceServers) do if v.username then cfRevoke(v.username) end end end
                return
            end
            finish(parsed or false)
        end,'POST',json.encode({ttl=ttl}),{Authorization='Bearer '..token,['Content-Type']='application/json',['User-Agent']='PeakPhone/2.1 (FiveM TURN)'})
        return Citizen.Await(p)
    end)
    local servers=ok and validate(data,requireTurn)
    if servers then
        RTC.cache[key]={servers=servers,provider=provider()}
        local allowed
        if authorize then allowed=authorize()
        else
            local call=Phone.Calls.member(src,callId)
            allowed=call and call.kind=='video' and call.status~='ringing'
        end
        if not allowed then RTC.revoke(callId,src);servers=nil end
    end
    RTC.pending[key]=nil
    return servers
end
Peak.Functions.CreateCallback('peak-phone:Server:GetWebRTCCredentials',function(src,cb,callId)
    local call=Phone.Calls.member(src,callId)
    if not call or call.kind~='video' or call.status=='ringing' then return cb({Success=false,Error='No accepted video session.'}) end
    if not RTC.configured() and not PhoneConfig.Video.RequireTURN then return cb({Success=true,IceServers={}}) end
    local servers=mint(callId,src)
    if not servers then Phone.Calls.stop(callId,'TURN credentials could not be issued');return cb({Success=false,Error='TURN relay unavailable. Run phone_doctor on the server.'}) end
    cb({Success=true,IceServers=servers})
end)

-- Separate membership namespace; never treats a public live ID as a call ID.
function RTC.liveCredentials(id,src,token,lifetime,requireTurn)
    local function authorized()
        return Phone.KiloLive and Phone.KiloLive.member(src,id,token)~=nil
    end
    if not authorized() then return nil end
    if not RTC.configured() then return not requireTurn and {} or nil end
    local servers=mint('kilolive:'..id,src,authorized,lifetime,requireTurn)
    if not authorized() then RTC.revoke('kilolive:'..id,src);return nil end
    return servers
end
