-- KiloGram live sessions are intentionally ephemeral. Media uses WebRTC, never FiveM events.
-- Identity, room capacity, roles, blocks, moderation and signaling routes are server-authoritative.
local DB, C = PhoneDB, PhoneConfig.KiloLive
local L = { sessions = {}, bySource = {}, byProfile = {}, privacyRevision = 0 }
Phone.KiloLive = L
DB.query([[CREATE TABLE IF NOT EXISTS `peak_phone_kilogram_wallets` (
    `profile_id` BIGINT UNSIGNED NOT NULL,
    `coins` BIGINT UNSIGNED NOT NULL DEFAULT 0,
    `updated_at` BIGINT NOT NULL,
    PRIMARY KEY (`profile_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4]])
DB.query([[CREATE TABLE IF NOT EXISTS `peak_phone_kilogram_gift_ledger` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `operation_id` VARCHAR(64) NOT NULL,
    `from_profile` BIGINT UNSIGNED NOT NULL,
    `to_profile` BIGINT UNSIGNED NOT NULL,
    `kind` VARCHAR(24) NOT NULL,
    `item_id` VARCHAR(32) NOT NULL DEFAULT '',
    `coins` BIGINT UNSIGNED NOT NULL,
    `bank_amount` BIGINT UNSIGNED NOT NULL DEFAULT 0,
    `created_at` BIGINT NOT NULL,
    PRIMARY KEY (`id`), UNIQUE KEY `uq_peak_kgift_operation` (`operation_id`),
    KEY `ix_peak_kgift_from` (`from_profile`,`id`), KEY `ix_peak_kgift_to` (`to_profile`,`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4]])
local gifts = {
    rose = { name='Rose', emoji='🌹', coins=5 },
    puppy = { name='Puppy', emoji='🐶', coins=120 },
    sports_car = { name='Sports car', emoji='🏎️', coins=800 },
    jet = { name='Private jet', emoji='✈️', coins=2500 },
}
local function yes(v) v=v or {};v.Success=true;return v end
local function no(v) return Phone.publicError(v) end
local function clock() return os.time()*1000 end
local function integer(v,lo,hi,default)
    local n=tonumber(v)
    if not n or n~=n or n==math.huge or n==-math.huge then return default end
    return math.max(lo,math.min(hi,math.floor(n)))
end
local function settings()
    return {
        maxStreams=integer(C.MaxStreams,1,16,4), maxViewers=integer(C.MaxViewers,1,16,8),
        maxSeconds=integer(C.MaxSeconds,60,10800,1800),
        width=integer(C.Width,180,540,360),height=integer(C.Height,320,960,640),
        fps=integer(C.FPS,5,30,20),bitrate=integer(C.Bitrate,150000,1500000,600000),
        connectionTimeout=integer(C.ConnectionTimeout,10,60,25),
        heartbeatTimeout=integer(C.HeartbeatTimeout,25,90,35),
        commentBytes=integer(C.CommentBytes,80,500,240),commentHistory=integer(C.CommentHistory,10,100,60),
        relayOnly=C.RelayOnly~=false,requireTurn=C.RequireTURN~=false or C.RelayOnly~=false,
        allowMicrophone=C.AllowMicrophone~=false,
    }
end
local function enabled()
    return C.Enabled~=false and PhoneConfig.Social.Enabled and PhoneConfig.Social.kilogram~=false and IsNetworkEnabled~=false
end
local function publicProfile(p)
    return {id=tonumber(p.id),handle=p.handle,name=p.display_name,avatar=p.avatar or ''}
end
local function profile(src)
    if not enabled() then return nil,'KiloGram live is unavailable while the phone network or app is disabled.' end
    local p=Phone.getPlayer(src)
    if not p then return nil,'Character unavailable.' end
    local cid=p.PlayerData.citizenid
    local me=DB.one("SELECT * FROM peak_phone_social_profiles WHERE citizenid=? AND app='kilogram'",{cid})
    if not me then return nil,'Create your KiloGram profile first.' end
    if tonumber(me.suspended)==1 then return nil,'This profile is suspended.' end
    if not Phone.sameCharacter(src,cid) then return nil,'Your character changed. Reopen KiloGram.' end
    return me
end
local function blockMap(id)
    local result={}
    for _,b in ipairs(DB.query('SELECT profile_id,target_id FROM peak_phone_social_blocks WHERE profile_id=? OR target_id=?',{id,id}) or {}) do
        result[tonumber(b.profile_id)==tonumber(id) and tonumber(b.target_id) or tonumber(b.profile_id)]=true
    end
    return result
end
function L.member(src,id,token)
    src=tonumber(src)
    if not src or type(id)~='string' or #id>80 then return nil end
    local room=L.sessions[id]
    local m=room and room.members[src]
    if not m or (token and m.token~=token) or not Phone.sameCharacter(src,m.cid) then return nil end
    return room,m
end
local function count(room,all)
    local n=0
    for _,m in pairs(room.members) do if m.role=='viewer' and (all or m.connected) then n=n+1 end end
    return n
end
local function summary(room)
    return {id=room.id,title=room.title,author=room.host.profile,started_at=room.startedAt or room.createdAt,
        viewers=count(room),likes=room.likes,unique_viewers=room.uniqueCount,comments_enabled=room.commentsEnabled,
        has_audio=room.hasAudio,status=room.status,max_viewers=room.options.maxViewers}
end
local function emit(room,m,kind,data)
    if not Phone.sameCharacter(m.src,m.cid) then return end
    TriggerClientEvent('peak-phone:Client:KiloLive:Event',m.src,{SessionId=room.id,Token=m.token,Kind=kind,Data=data or {}})
end
local function each(room,kind,data)
    for _,m in pairs(room.members) do emit(room,m,kind,data) end
end
local directoryPending=false
local function directory()
    if directoryPending then return end
    directoryPending=true
    SetTimeout(500,function()
        directoryPending=false
        -- No names, room IDs, counts or profile content are exposed through this global invalidation.
        TriggerClientEvent('peak-phone:Client:KiloLive:Directory',-1)
    end)
end
local function publicComment(c)
    return c and {id=c.id,author=c.author,body=c.body,created_at=c.created_at} or nil
end
local function roomState(room,m)
    local comments,people={},{ }
    for _,c in ipairs(room.comments) do
        if not m.blocks[c.author.id] then comments[#comments+1]=publicComment(c) end
    end
    for _,v in pairs(room.members) do
        if v.ready and not m.blocks[v.profile.id] then
            people[#people+1]={profile=v.profile,role=v.role,connected=v.role=='host' or v.connected,
                muted=room.muted[v.profile.id]==true}
        end
    end
    table.sort(people,function(a,b) if a.role~=b.role then return a.role=='host' end;return a.profile.id<b.profile.id end)
    return {session=summary(room),comments=comments,people=people,
        pinned=room.pinned and not m.blocks[room.pinned.author.id] and publicComment(room.pinned) or nil,
        muted=room.muted[m.profile.id]==true,sequence=room.sequence}
end
local function publish(room)
    each(room,'summary',summary(room))
end
local function resync(room)
    for _,m in pairs(room.members) do emit(room,m,'state',roomState(room,m)) end
end
function L.stop(id,reason)
    local room=L.sessions[id]
    if not room then return end
    -- Detach first: late credential responses, ICE packets and repeat leaves cannot revive a stream.
    L.sessions[id]=nil
    for src,m in pairs(room.members) do
        if L.bySource[src]==id then L.bySource[src]=nil end
        if L.byProfile[m.profile.id]==src then L.byProfile[m.profile.id]=nil end
        emit(room,m,'ended',{reason=reason or 'Live ended',session=summary(room)})
        Phone.RTC.revoke('kilolive:'..id,src)
    end
    directory()
end
function L.leave(src,id,token,reason,retryable)
    if type(token)~='string' then return end
    src=tonumber(src)
    local room,m=L.member(src,id,token)
    if not room then return end
    if m.role=='host' then return L.stop(id,reason or 'The broadcaster ended this live.') end
    room.members[src]=nil
    if L.bySource[src]==id then L.bySource[src]=nil end
    if L.byProfile[m.profile.id]==src then L.byProfile[m.profile.id]=nil end
    emit(room,m,'ended',{reason=reason or 'You left the live.',session=summary(room),retryable=retryable==true})
    room.host.candidates[m.token]=nil
    emit(room,room.host,'peer-left',{source=src,token=m.token})
    Phone.RTC.revoke('kilolive:'..id,src)
    publish(room);directory()
end
local function detachStale(src,reason)
    local id=L.bySource[src];local room=id and L.sessions[id];local m=room and room.members[src]
    if not m then L.bySource[src]=nil;return end
    if m.role=='host' then L.stop(id,reason);return end
    -- Disconnect cleanup must not depend on the player still having a character.
    room.members[src]=nil;L.bySource[src]=nil
    if L.byProfile[m.profile.id]==src then L.byProfile[m.profile.id]=nil end
    emit(room,m,'ended',{reason=reason or 'Live session closed',session=summary(room)})
    room.host.candidates[m.token]=nil
    emit(room,room.host,'peer-left',{source=src,token=m.token})
    Phone.RTC.revoke('kilolive:'..id,src);publish(room);directory()
end
function L.removeProfile(id,reason)
    local src=L.byProfile[tonumber(id)]
    if src then detachStale(src,reason or 'Profile unavailable') end
end
function L.privacyChanged(a,b)
    L.privacyRevision=L.privacyRevision+1
    local revision=L.privacyRevision
    local maps={[a]=blockMap(a),[b]=blockMap(b)}
    if revision~=L.privacyRevision then return L.privacyChanged(a,b) end
    -- New joins snapshot this revision; concurrent changes are rechecked before admission.
    for _,id in ipairs({a,b}) do
        local src=L.byProfile[id];local rid=src and L.bySource[src];local room=rid and L.sessions[rid]
        local m=room and room.members[src]
        if m then m.blocks=maps[id] end
    end
    local remove={}
    for id,room in pairs(L.sessions) do
        for src,m in pairs(room.members) do
            if m.role=='viewer' and (m.blocks[room.host.profile.id] or room.host.blocks[m.profile.id]) then
                remove[#remove+1]={src=src,id=id,token=m.token}
            end
        end
    end
    for _,r in ipairs(remove) do L.leave(r.src,r.id,r.token,'This live is no longer available to this profile.') end
    if revision==L.privacyRevision then for _,room in pairs(L.sessions) do resync(room) end end
    directory()
end
local function register(name,limit,fn,requiresProfile)
    Peak.Functions.CreateCallback('peak-phone:Server:KiloLive:'..name,function(src,cb,data)
        data=type(data)=='table' and data or {}
        if not Phone.rate(src,'kilolive:'..name,limit or 20,10000) then return cb(no('Slow down and try again in a moment.')) end
        local me,err
        if requiresProfile then me,err=profile(src);if not me then return cb(no(err)) end end
        local ok,result=pcall(fn,src,data,me)
        if not ok then
            print('[KiloGram Live] '..name..' failed: '..tostring(result))
            return cb(no('Live service unavailable. Check the server log and try again.'))
        end
        cb(result or no('The live service returned no result.'))
    end)
end
local function membership(src,data)
    if type(data.Token)~='string' or #data.Token>80 then return end
    return L.member(src,data.SessionId,data.Token)
end
local function envelope(room,m,ice)
    local result=roomState(room,m)
    result.token=m.token;result.role=m.role;result.source=m.src
    result.hostSource=room.host.src;result.hostToken=room.host.token
    result.iceServers=ice or {};result.settings=room.options
    return yes(result)
end
local function newMember(src,me,role,blocks)
    return {src=src,cid=me.citizenid,profile=publicProfile(me),role=role,blocks=blocks,token=Phone.token(),
        ready=false,connected=false,lastSeen=GetGameTimer(),joinedAt=GetGameTimer(),candidates={},offers=0}
end
register('List',20,function(src,d,me)
    local options=settings();local blocks=blockMap(me.id);local streams={}
    if not Phone.sameCharacter(src,me.citizenid) then return no('Your character changed.') end
    for _,room in pairs(L.sessions) do
        if room.status=='live' and not blocks[room.host.profile.id] and not room.host.blocks[tonumber(me.id)] and not room.banned[tonumber(me.id)] then
            streams[#streams+1]=summary(room)
        end
    end
    table.sort(streams,function(a,b) return a.started_at>b.started_at end)
    return yes({streams=streams,settings=options,relay_ready=not options.requireTurn or Phone.RTC.configured()})
end,true)
register('Start',3,function(src,d,me)
    if Phone.Calls and Phone.Calls.bySource[src] then return no('End your call before starting a live broadcast.') end
    local options=settings()
    local title=Phone.trim(d.Title)
    if not Phone.text(title,80) or title:find('[\r\n]') then return no('Give your live a title of 1–80 bytes.') end
    if options.requireTurn and not Phone.RTC.configured() then return no('The server needs TURN configured before live video is available. Ask an administrator to run phone_doctor.') end
    local revision=L.privacyRevision;local blocks=blockMap(me.id)
    if revision~=L.privacyRevision then return no('Privacy settings changed. Please try again.') end
    if not Phone.sameCharacter(src,me.citizenid) then return no('Your character changed.') end
    if L.bySource[src] or L.byProfile[tonumber(me.id)] then return no('Leave the current live session first.') end
    local total=0;for _ in pairs(L.sessions) do total=total+1 end
    if total>=options.maxStreams then return no('All live broadcast slots are in use. Try again shortly.') end
    if Phone.Calls and Phone.Calls.bySource[src] then return no('End your call before starting a live broadcast.') end
    -- Reservation occurs without a yield; TURN requests happen after capacity is reserved.
    local m=newMember(src,me,'host',blocks)
    local id='kg-'..Phone.token()
    local room={id=id,title=title,host=m,members={[src]=m},options=options,createdAt=clock(),
        status='preparing',comments={},commentNonces={},nonceOrder={},commentsEnabled=true,muted={},banned={},
        sequence=0,likes=0,unique={},uniqueCount=0,hasAudio=false}
    L.sessions[id]=room;L.bySource[src]=id;L.byProfile[m.profile.id]=src
    local issued,ice=pcall(Phone.RTC.liveCredentials,id,src,m.token,options.maxSeconds,options.requireTurn)
    if not issued or not ice or not L.member(src,id,m.token) then L.stop(id,'Live relay unavailable');return no('TURN credentials could not be issued. Check the relay configuration.') end
    m.lastSeen=GetGameTimer()
    return envelope(room,m,ice)
end,true)
register('Join',8,function(src,d,me)
    if Phone.Calls and Phone.Calls.bySource[src] then return no('End your call before joining a live broadcast.') end
    local room=type(d.SessionId)=='string' and L.sessions[d.SessionId]
    if not room or room.status~='live' then return no('This live has ended or is no longer available.') end
    if L.bySource[src] or L.byProfile[tonumber(me.id)] then return no('Leave your current live session first.') end
    local revision=L.privacyRevision;local blocks=blockMap(me.id)
    if revision~=L.privacyRevision then return no('Privacy settings changed. Try joining again.') end
    if not Phone.sameCharacter(src,me.citizenid) or L.sessions[room.id]~=room or room.status~='live' then return no('This live is no longer available.') end
    if blocks[room.host.profile.id] or room.host.blocks[tonumber(me.id)] or room.banned[tonumber(me.id)] then return no('This live is unavailable to this profile.') end
    if L.bySource[src] or L.byProfile[tonumber(me.id)] then return no('A live session is already opening.') end
    if count(room,true)>=room.options.maxViewers then return no('This live is full. Try again when a viewer leaves.') end
    if Phone.Calls and Phone.Calls.bySource[src] then return no('End your call before joining a live broadcast.') end
    local m=newMember(src,me,'viewer',blocks)
    room.members[src]=m;L.bySource[src]=room.id;L.byProfile[m.profile.id]=src
    local issued,ice=pcall(Phone.RTC.liveCredentials,room.id,src,m.token,room.options.maxSeconds,room.options.requireTurn)
    if not issued or not ice or not L.member(src,room.id,m.token) then L.leave(src,room.id,m.token,'Live relay unavailable');return no('The video relay could not be reached.') end
    m.lastSeen=GetGameTimer()
    return envelope(room,m,ice)
end,true)
register('Ready',8,function(src,d)
    local room,m=membership(src,d)
    if not room or not enabled() then return no('This live session is no longer available.') end
    if m.ready then return yes(roomState(room,m)) end
    m.ready=true;m.lastSeen=GetGameTimer()
    if m.role=='host' then
        room.status='live';room.startedAt=clock();room.hasAudio=d.HasAudio==true and room.options.allowMicrophone
        directory();publish(room)
    else
        if room.status~='live' then return no('The broadcaster is not ready.') end
        emit(room,room.host,'peer-ready',{source=src,token=m.token,profile=m.profile})
    end
    return yes(roomState(room,m))
end)
register('State',25,function(src,d)
    local room,m=membership(src,d);if not room then return no('This live session has ended.') end
    return yes(roomState(room,m))
end)
register('Status',30,function(src,d)
    local room,m=membership(src,d);if not room or not m.ready then return no('This live session has ended.') end
    if m.role~='viewer' then return yes() end
    local connected=d.Connected==true
    if m.connected~=connected then
        m.connected=connected;m.disconnectedAt=not connected and GetGameTimer() or nil
        if connected and not room.unique[m.profile.id] then room.unique[m.profile.id]=true;room.uniqueCount=room.uniqueCount+1 end
        publish(room);directory()
    end
    return yes()
end)
register('Comment',5,function(src,d)
    local room,m=membership(src,d)
    if not room or room.status~='live' or not m.ready then return no('Join a live before commenting.') end
    if not room.commentsEnabled or room.muted[m.profile.id] then return no('Comments are currently disabled for you in this live.') end
    local body,key=Phone.trim(d.Body),d.Nonce
    if not Phone.text(body,room.options.commentBytes) or body:find('[\r\n]') or not Phone.text(key,64) or #key<16 or not key:match('^[%w%-]+$') then return no('Enter a short, single-line comment.') end
    local nonceKey=m.profile.id..':'..key
    if room.commentNonces[nonceKey] then return yes({id=room.commentNonces[nonceKey]}) end
    room.sequence=room.sequence+1
    local comment={id=room.sequence,author=m.profile,body=body,created_at=clock(),nonce_key=nonceKey}
    room.comments[#room.comments+1]=comment;room.commentNonces[nonceKey]=comment.id
    room.nonceOrder[#room.nonceOrder+1]=nonceKey
    if #room.nonceOrder>200 then room.commentNonces[table.remove(room.nonceOrder,1)]=nil end
    if #room.comments>room.options.commentHistory then table.remove(room.comments,1) end
    for _,v in pairs(room.members) do if not v.blocks[m.profile.id] then emit(room,v,'comment',publicComment(comment)) end end
    return yes({id=comment.id})
end)
register('React',8,function(src,d)
    local room,m=membership(src,d)
    if not room or room.status~='live' or not m.ready then return no('Join this live to react.') end
    room.likes=room.likes+1
    each(room,'reaction',{likes=room.likes})
    return yes({likes=room.likes})
end)
register('Moderate',15,function(src,d)
    local room,m=membership(src,d)
    if not room then return no('This live session has ended.') end
    if d.Mode=='delete-comment' then
        local id=Phone.number(d.Id,2147483647)
        for i,c in ipairs(room.comments) do
            if c.id==id then
                if m.role~='host' and m.profile.id~=c.author.id then return no('You can only remove your own comments.') end
                table.remove(room.comments,i)
                if room.pinned and room.pinned.id==id then room.pinned=nil end
                room.sequence=room.sequence+1;resync(room);return yes()
            end
        end
        return no('This comment is no longer available.')
    end
    if m.role~='host' then return no('Only the broadcaster can manage this live.') end
    if d.Mode=='comments' then
        if type(d.Enabled)~='boolean' then return no('Invalid comment setting.') end
        room.commentsEnabled=d.Enabled
    elseif d.Mode=='audio' then
        room.hasAudio=d.Enabled==true and room.options.allowMicrophone
    elseif d.Mode=='pin' then
        room.pinned=nil
        if d.Id then
            local id=Phone.number(d.Id,2147483647)
            for _,c in ipairs(room.comments) do if c.id==id then room.pinned=c;break end end
            if not room.pinned then return no('This comment is no longer available.') end
        end
    elseif d.Mode=='mute' or d.Mode=='kick' then
        local id=Phone.number(d.ProfileId,2147483647);local target
        for _,v in pairs(room.members) do if v.profile.id==id then target=v end end
        if not target or target.role~='viewer' then return no('That viewer is no longer here.') end
        if d.Mode=='kick' then
            room.banned[id]=true;L.leave(target.src,room.id,target.token,'The broadcaster removed you from this live.')
        else room.muted[id]=d.Enabled==true end
    else return no('Unknown live moderation action.') end
    room.sequence=room.sequence+1;resync(room);return yes()
end)
register('Recipients',15,function(src,d,me)
    -- Existing mutual-follow DM rules; no new messaging privilege is introduced.
    local after=Phone.number(d.After,2147483647,true) or 0
    local q=Phone.trim(d.Query):sub(1,60);q='%'..q:gsub('[\\%%_]','\\%0')..'%'
    local rows=DB.query([[SELECT p.* FROM peak_phone_social_profiles p
        JOIN peak_phone_social_follows f ON f.target_id=p.id AND f.profile_id=?
        JOIN peak_phone_social_follows r ON r.profile_id=p.id AND r.target_id=?
        WHERE p.app='kilogram' AND p.suspended=0 AND p.id>? AND (p.display_name LIKE ? OR p.handle LIKE ?)
        AND NOT EXISTS(SELECT 1 FROM peak_phone_social_blocks b WHERE
            (b.profile_id=? AND b.target_id=p.id) OR (b.profile_id=p.id AND b.target_id=?))
        ORDER BY p.id LIMIT 31]],{me.id,me.id,after,q,q,me.id,me.id})
    local out={};for i,p in ipairs(rows) do if i<=30 then out[#out+1]=publicProfile(p) end end
    return yes({profiles=out,next=#rows>30 and tonumber(rows[30].id) or nil})
end,true)
local function ensureWallet(profileId)
    DB.update('INSERT IGNORE INTO peak_phone_kilogram_wallets(profile_id,coins,updated_at) VALUES(?,0,?)',{profileId,clock()})
    return DB.one('SELECT coins FROM peak_phone_kilogram_wallets WHERE profile_id=?',{profileId})
end
local function walletInfo(profileId)
    local row=ensureWallet(profileId)
    return tonumber(row and row.coins) or 0
end
local function operationId(data)
    local id=type(data)=='table' and data.OperationId
    if type(id)~='string' or #id<16 or #id>64 or not id:match('^[%w%-]+$') then return nil end
    return id
end
local function followerGate(hostProfileId)
    if C.GiftsFollowerGateEnabled~=true then return true end
    local minimum=math.max(0,math.floor(tonumber(C.GiftsMinimumFollowers) or 50))
    local row=DB.one('SELECT COUNT(*) n FROM peak_phone_social_follows WHERE target_id=?',{hostProfileId})
    return (tonumber(row and row.n) or 0)>=minimum
end
register('Wallet',20,function(src,d,me)
    local room,m=membership(src,d)
    if d.SessionId and (not room or not m.ready) then return no('This live session has ended.') end
    return yes({coins=walletInfo(me.id),host=m~=nil and m.role=='host',giftsEnabled=C.GiftsEnabled~=false,
        gifts=gifts,coinPacks=C.CoinPacks or {},cashoutRate=math.max(1,math.floor(tonumber(C.CoinsPerBankDollar) or 1))})
end,true)
register('PurchaseCoins',4,function(src,d,me)
    local room,m=membership(src,d)
    if d.SessionId and (not room or not m.ready) then return no('This live session has ended.') end
    local id=operationId(d);if not id then return no('This purchase reference is invalid. Reopen the wallet and try again.') end
    local pack
    for _,candidate in ipairs(C.CoinPacks or {}) do if candidate.Id==d.PackId then pack=candidate;break end end
    local coins=pack and Phone.number(pack.Coins,1000000)
    local cost=pack and Phone.number(pack.BankCost,100000000)
    if not coins or not cost or coins<1 or cost<1 then return no('That coin pack is unavailable.') end
    local cid=me.citizenid
    return Phone.withLocks({'profile:'..cid,'operation:'..id},function()
        if not Phone.sameCharacter(src,cid) then return no('Your character changed. Reopen KiloGram and try again.') end
        local ready,previous=Phone.Wallet.begin(id,cid,cid,cost,'KiloGram coin pack: '..pack.Id)
        if not ready then return previous end
        local debited,result=Phone.Wallet.debit(id,src,cid,cost)
        if not debited then return result end
        local saved=DB.transaction({
            {query='INSERT IGNORE INTO peak_phone_kilogram_wallets(profile_id,coins,updated_at) VALUES(?,0,?)',values={me.id,clock()}},
            {query='UPDATE peak_phone_kilogram_wallets SET coins=coins+?,updated_at=? WHERE profile_id=?',values={coins,clock(),me.id}},
            {query="INSERT INTO peak_phone_kilogram_gift_ledger(operation_id,from_profile,to_profile,kind,item_id,coins,bank_amount,created_at) VALUES(?,?,?,'purchase',?,?,?,?)",values={id,me.id,me.id,pack.Id,coins,cost,clock()}},
            {query="UPDATE peak_phone_ledger SET status='complete',updated_at=? WHERE operation_id=?",values={clock(),id}},
        })
        if not saved then return Phone.Wallet.refund(id,src,cid,cost) end
        Phone.refresh(src)
        return yes({coins=walletInfo(me.id),added=coins})
    end)
end,true)
register('Gift',5,function(src,d,me)
    local room,m=membership(src,d)
    if not C.GiftsEnabled or not room or room.status~='live' or not m.ready or m.role~='viewer' then return no('Gifts are available to viewers in a live broadcast.') end
    if room.host.blocks[m.profile.id] or m.blocks[room.host.profile.id] or room.banned[m.profile.id] then return no('Gifts are unavailable in this live.') end
    if not followerGate(room.host.profile.id) then return no('The broadcaster needs at least '..tostring(C.GiftsMinimumFollowers or 50)..' followers to receive gifts.') end
    local id=operationId(d);if not id then return no('This gift reference is invalid. Please try again.') end
    local gift=gifts[d.GiftId]
    local coins=gift and Phone.number(gift.coins,1000000)
    if not gift or not coins or coins<1 then return no('That gift is unavailable.') end
    local fromCid,toCid=m.cid,room.host.cid
    return Phone.withLocks({'profile:'..fromCid,'profile:'..toCid,'operation:'..id},function()
        local currentRoom=L.member(src,room.id,m.token)
        if not currentRoom or not Phone.sameCharacter(src,fromCid) then return no('Your live session changed. Reopen KiloGram and try again.') end
        local duplicate=DB.one('SELECT operation_id FROM peak_phone_kilogram_gift_ledger WHERE operation_id=?',{id})
        if duplicate then return no('This gift was already sent.') end
        local senderBalance=walletInfo(m.profile.id)
        if senderBalance<coins then return no('Not enough coins. Buy a coin pack to send this gift.') end
        ensureWallet(room.host.profile.id)
        local saved=DB.transaction({
            {query='UPDATE peak_phone_kilogram_wallets SET coins=coins-?,updated_at=? WHERE profile_id=? AND coins>=?',values={coins,clock(),m.profile.id,coins}},
            {query='UPDATE peak_phone_kilogram_wallets SET coins=coins+?,updated_at=? WHERE profile_id=?',values={coins,clock(),room.host.profile.id}},
            {query="INSERT INTO peak_phone_kilogram_gift_ledger(operation_id,from_profile,to_profile,kind,item_id,coins,bank_amount,created_at) VALUES(?,?,?,'gift',?,?,0,?)",values={id,m.profile.id,room.host.profile.id,d.GiftId,coins,clock()}},
        })
        if not saved then return no('The gift could not be completed. Your coins were not charged.') end
        local event={sender=m.profile,gift={id=d.GiftId,name=gift.name,emoji=gift.emoji,coins=coins}}
        for _,member in pairs(room.members) do
            if not member.blocks[m.profile.id] then emit(room,member,'gift',event) end
        end
        return yes({coins=walletInfo(m.profile.id)})
    end)
end,true)
register('CashOut',3,function(src,d,me)
    local room,m=membership(src,d)
    if d.SessionId and (not room or not m.ready) then return no('This live session has ended.') end
    local id=operationId(d);if not id then return no('This conversion reference is invalid. Please try again.') end
    local coins=Phone.number(d.Coins,100000000)
    local rate=math.max(1,math.floor(tonumber(C.CoinsPerBankDollar) or 1))
    if not coins or coins<rate then return no('Enter a valid number of coins to convert.') end
    if coins%rate~=0 then return no('Choose a whole multiple of '..rate..' coins. Your remaining coins stay in your wallet.') end
    local payout=math.floor(coins/rate)
    if payout<1 then return no('This conversion is below the minimum.') end
    local cid=me.citizenid
    return Phone.withLocks({'profile:'..cid,'operation:'..id},function()
        if not Phone.sameCharacter(src,cid) then return no('Your character changed. Reopen KiloGram and try again.') end
        if walletInfo(me.id)<coins then return no('You do not have enough coins for this withdrawal.') end
        local ready,previous=Phone.Wallet.begin(id,cid,cid,payout,'KiloGram live coin cash-out')
        if not ready then return previous end
        local saved=DB.transaction({
            {query='UPDATE peak_phone_kilogram_wallets SET coins=coins-?,updated_at=? WHERE profile_id=? AND coins>=?',values={coins,clock(),me.id,coins}},
            {query="INSERT INTO peak_phone_kilogram_gift_ledger(operation_id,from_profile,to_profile,kind,item_id,coins,bank_amount,created_at) VALUES(?,?,?,'cashout','',?,?,?)",values={id,me.id,me.id,coins,payout,clock()}},
            {query="UPDATE peak_phone_ledger SET status='credit_pending',updated_at=? WHERE operation_id=?",values={clock(),id}},
        })
        if not saved then Phone.Wallet.mark(id,'rejected');return no('Not enough gift coins or the conversion could not be saved.') end
        if not Phone.sameCharacter(src,cid) then return Phone.Wallet.uncertain(id) end
        local ok,paid=Phone.Wallet.exportCall(Phone.addMoney,src,PhoneConfig.Money.Account,payout,'kilogram-live-cashout:'..id)
        if not ok then return Phone.Wallet.uncertain(id) end
        if not paid then
            DB.transaction({
                {query='UPDATE peak_phone_kilogram_wallets SET coins=coins+?,updated_at=? WHERE profile_id=?',values={coins,clock(),me.id}},
                {query='DELETE FROM peak_phone_kilogram_gift_ledger WHERE operation_id=?',values={id}},
                {query="UPDATE peak_phone_ledger SET status='refunded',updated_at=? WHERE operation_id=?",values={clock(),id}},
            })
            return no('The bank declined the deposit. Your coins were returned.')
        end
        Phone.Wallet.mark(id,'complete');Phone.refresh(src)
        return yes({coins=walletInfo(me.id),bankAmount=payout})
    end)
end,true)
register('DropPeer',20,function(src,d)
    local room,m=membership(src,d)
    if not room or m.role~='host' then return no('Only the broadcaster can release a viewer connection.') end
    local peer=room.members[tonumber(d.Peer)]
    if peer and peer.role=='viewer' and peer.token==d.PeerToken then
        local reason=d.Reason=='relay' and 'Live video could not reach the relay. Try joining again; if it repeats, ask an administrator to check TURN with phone_doctor.'
            or 'The video connection could not be established. Try joining again.'
        L.leave(peer.src,room.id,peer.token,reason,true)
    end
    return yes()
end)
register('Leave',20,function(src,d)
    L.leave(src,d.SessionId,d.Token,'Live ended')
    return yes()
end)
-- Lightweight heartbeats and signaling avoid a database round-trip per ICE candidate.
-- RegisterNetEvent's callback overload calls the current global AddEventHandler.
-- That is wrapped by the legacy bridge and may yield before our source capture.
-- Attach directly: these routes validate membership and have their own limits.
local function listen(name,handler)
    Phone.NativeRegisterNetEvent(name)
    Phone.NativeAddEventHandler(name,handler)
end
listen('peak-phone:Server:KiloLive:Heartbeat',function(d)
    local src=tonumber(source)
    if type(d)~='table' or not Phone.rate(src,'kilolive:heartbeat',3,5000) then return end
    local room,m=membership(src,d)
    if not room then return end
    if not enabled() or not Phone.hasPhone(src) then return detachStale(src,'The phone network or phone item is unavailable.') end
    m.lastSeen=GetGameTimer()
end)
listen('peak-phone:Server:KiloLive:Leave',function(d)
    if type(d)=='table' then L.leave(tonumber(source),d.SessionId,d.Token,'Live ended') end
end)
listen('peak-phone:Server:KiloLive:Signal',function(d)
    local src=tonumber(source)
    if type(d)~='table' or not Phone.rate(src,'kilolive:signals',400,10000) then return end
    local room,m=membership(src,d)
    local peer=room and room.members[tonumber(d.Peer)]
    if not room or not m.ready or not peer or not peer.ready or peer.token~=d.PeerToken or m.role==peer.role or room.status~='live' then return end
    if not enabled() or not Phone.sameCharacter(peer.src,peer.cid) then return end
    local data=d.Signal
    if type(data)~='table' then return end
    local signal
    local viewer=m.role=='viewer' and m or peer
    if data.type=='description' then
        local desc=data.description
        if type(desc)~='table' or not Phone.text(desc.sdp,50000) or not desc.sdp:match('^v=0') or desc.sdp:find('m=application',1,true) then return end
        if desc.type=='offer' and m.role=='host' and not viewer.offerPending and viewer.offers<4 then
            viewer.offerPending=true;viewer.offers=viewer.offers+1
        elseif desc.type=='answer' and m.role=='viewer' and viewer.offerPending then viewer.offerPending=false
        else return end
        signal={type='description',description={type=desc.type,sdp=desc.sdp}}
    elseif data.type=='ice' then
        local v=data.candidate
        m.candidates[peer.token]=(m.candidates[peer.token] or 0)+1
        if m.candidates[peer.token]>512 then return end
        if v==false then signal={type='ice',candidate=false}
        elseif type(v)=='table' and Phone.text(v.candidate,4096,true)
            and (v.sdpMid==nil or Phone.text(v.sdpMid,64,true))
            and (v.sdpMLineIndex==nil or Phone.number(v.sdpMLineIndex,10,true)) then
            if room.options.relayOnly and v.candidate~='' and not v.candidate:find(' typ relay',1,true) then return end
            signal={type='ice',candidate={candidate=v.candidate,sdpMid=v.sdpMid,sdpMLineIndex=v.sdpMLineIndex,
                usernameFragment=Phone.text(v.usernameFragment,256,true) and v.usernameFragment or nil}}
        end
    elseif data.type=='restart' and m.role=='viewer' and Phone.rate(src,'kilolive:restart',2,30000) then
        viewer.offerPending=false;signal={type='restart'}
    end
    if signal then emit(room,peer,'signal',{source=src,token=m.token,signal=signal}) end
end)
AddEventHandler('playerDropped',function() detachStale(tonumber(source),'A player disconnected.') end)
AddEventHandler('onResourceStop',function(name)
    if name~=GetCurrentResourceName() then return end
    local ids={};for id in pairs(L.sessions) do ids[#ids+1]=id end
    for _,id in ipairs(ids) do L.stop(id,'Phone resource stopped') end
end)
CreateThread(function()
    while true do
        Wait(5000)
        local stale,expired={},{ }
        for id,room in pairs(L.sessions) do
            if not enabled() or clock()-room.createdAt>room.options.maxSeconds*1000 then expired[#expired+1]=id
            else
                for src,m in pairs(room.members) do
                    if not Phone.sameCharacter(src,m.cid) or GetGameTimer()-m.lastSeen>room.options.heartbeatTimeout*1000
                        or (not m.ready and GetGameTimer()-m.joinedAt>30000)
                        or (m.role=='viewer' and not m.connected and GetGameTimer()-(m.disconnectedAt or m.joinedAt)>(room.options.connectionTimeout+20)*1000) then
                        stale[#stale+1]=src
                    end
                end
            end
        end
        for _,id in ipairs(expired) do L.stop(id,'The live reached its time limit or the phone network went offline.') end
        for _,src in ipairs(stale) do detachStale(src,'Live connection timed out.') end
    end
end)
-- Uses the same moderator permission as KiloGram reports. Never a client-controlled permission flag.
RegisterCommand('phone_live',function(src,args)
    if src~=0 and not IsPlayerAceAllowed(tostring(src),PhoneConfig.Social.ModerationAce) and not Peak.Functions.HasPermission(src,'admin') then return end
    local function out(s) if src==0 then print('[KiloGram Live] '..s) else Phone.notify(src,s,'primary',10000) end end
    if args[1]=='stop' and type(args[2])=='string' then
        if L.sessions[args[2]] then L.stop(args[2],'A server moderator ended this live.');out('Live stopped.') else out('Live not found.') end
    else
        local n=0;for id,room in pairs(L.sessions) do n=n+1;out(id..' @'..room.host.profile.handle..' | '..count(room)..' viewers | '..room.title) end
        if n==0 then out('No live streams.') end
        out('phone_live | phone_live stop <live-id>')
    end
end,false)
