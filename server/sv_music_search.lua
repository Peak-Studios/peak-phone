-- Keyless Audius catalog. Only verified artists with free, available audio streams.
local cache, pending, players = {}, {}, {}
local minute, minuteCount, day, dayCount, blockedUntil = 0, 0, 0, 0, 0
local clock = os.time
local MAX_CACHE, MAX_WAITERS = 256, 32
local function setting(name, default, low, high)
    local value = tonumber(GetConvar(name, tostring(default))) or default
    return math.floor(math.max(low, math.min(high, value)))
end
local function failure(code, message)
    return { Success = false, Code = code, Message = message, Tracks = {} }
end
local function encode(value)
    return (value:gsub('([^%w%-_%.~])', function(c) return ('%%%02X'):format(c:byte()) end))
end
local function validId(value)
    return type(value) == 'string' and #value >= 1 and #value <= 32 and not value:find('[^%w]')
end
local function text(value, max)
    if type(value) ~= 'string' then return '' end
    -- Reject invalid UTF-8; byte truncation could otherwise corrupt titles.
    local size = utf8.len(value)
    if not size then return '' end
    value = value:gsub('[%z\1-\31\127]', ' ')
    if size > max then value = value:sub(1, (utf8.offset(value, max + 1) or (#value + 1)) - 1) end
    return value
end
local function dto(track)
    if type(track) ~= 'table' or not validId(track.id) or type(track.user) ~= 'table' then return nil end
    local user = track.user
    if user.is_verified ~= true or user.is_available == false or user.is_deactivated == true
        or track.is_streamable ~= true or track.is_stream_gated ~= false or track.is_available == false
        or track.is_unlisted == true or track.is_delete == true then return nil end
    local title, artist = text(track.title, 255), text(user.name, 160)
    if title == '' or artist == '' then return nil end
    local art = type(track.artwork) == 'table' and track.artwork['480x480'] or ''
    if type(art) ~= 'string' or #art > 2048 or not art:match('^https://[%w%.%-]+/') or art:find('[%z\1-\32\127]') then art = '' end
    return { id=track.id, providerId=track.id, provider='audius', verified=true, title=title, channel=artist,
        duration=math.max(0, math.min(86400, tonumber(track.duration) or 0)), artwork=art,
        url='https://api.audius.co/v1/tracks/' .. track.id .. '/stream?app_name=PeakMusic' }
end
local function prune(now)
    local count, oldestKey, oldest = 0, nil, math.huge
    for key, value in pairs(cache) do
        if value.expires <= now then cache[key] = nil
        else
            count = count + 1
            if value.used < oldest then oldest, oldestKey = value.used, key end
        end
    end
    if count >= MAX_CACHE and oldestKey then cache[oldestKey] = nil end
end
local function providerAllowance(now)
    if now < blockedUntil then return false, 'provider_busy', 'The music catalog is temporarily unavailable. Try again later.' end
    local currentMinute, currentDay = math.floor(now / 60), math.floor(now / 86400)
    if currentMinute ~= minute then minute, minuteCount = currentMinute, 0 end
    if currentDay ~= day then day, dayCount = currentDay, 0 end
    if minuteCount >= setting('peak_music_search_per_minute',30,1,300)
        or dayCount >= setting('peak_music_search_per_day',100,1,10000) then
        return false, 'quota_guard', 'The server music-search allowance is reached. Try again later.'
    end
    minuteCount, dayCount = minuteCount + 1, dayCount + 1
    return true
end

Peak.Functions.CreateCallback('peak-phone:Server:Peakify:Search', function(source, cb, data)
    local player = Peak.Functions.GetPlayer(source)
    if not player or not player.PlayerData or not player.PlayerData.citizenid then
        return cb(failure('not_ready', 'Your character is not ready. Reopen the phone.'))
    end
    local query = type(data) == 'table' and data.Query or nil
    if type(query) ~= 'string' or #query > 512 or query:find('[%z\1-\31\127]') then
        return cb(failure('invalid_query', 'Enter a song or artist name.'))
    end
    query = query:match('^%s*(.-)%s*$'):gsub('%s+', ' ')
    local size = utf8.len(query)
    if not size or size < 2 or size > 120 then
        return cb(failure('invalid_query', 'Search using 2 to 120 characters.'))
    end
    local now, cid = clock(), player.PlayerData.citizenid
    local rate = players[source]
    if not rate or rate.cid ~= cid or now - rate.start >= 60 then
        rate = { cid = cid, start = now, count = 0 }; players[source] = rate
    end
    if rate.count >= setting('peak_music_search_player_per_minute', 20, 1, 60) then
        return cb(failure('rate_limited', 'Too many searches. Please wait a minute.'))
    end
    rate.count = rate.count + 1
    local cacheKey = query:lower()
    prune(now)
    if cache[cacheKey] and cache[cacheKey].expires > now then
        cache[cacheKey].used = now
        return cb({ Success = true, Provider = 'audius', Tracks = cache[cacheKey].tracks, Cached = true })
    end
    if pending[cacheKey] then
        if #pending[cacheKey].waiters >= MAX_WAITERS then
            return cb(failure('busy', 'This search is busy. Try again shortly.'))
        end
        pending[cacheKey].waiters[#pending[cacheKey].waiters + 1] = cb
        return
    end
    local allowed, code, message = providerAllowance(now)
    if not allowed then return cb(failure(code,message)) end
    local job = { waiters = { cb }, done = false }
    pending[cacheKey] = job
    local function finish(result)
        if job.done then return end
        job.done = true
        if pending[cacheKey] == job then pending[cacheKey] = nil end
        if result.Success then
            prune(clock())
            cache[cacheKey] = { tracks = result.Tracks, used = clock(),
                expires = clock() + setting('peak_music_search_cache_seconds', 3600, 60, 86400) }
        end
        for _, reply in ipairs(job.waiters) do pcall(reply, result) end
        job.waiters = {}
    end
    SetTimeout(15000, function()
        finish(failure('timeout', 'Music search timed out. Please try again.'))
    end)
    local sent = pcall(PerformHttpRequest, 'https://api.audius.co/v1/tracks/search?query=' .. encode(query) .. '&limit=50&includePurchaseable=false&app_name=PeakMusic', function(status, body)
        if job.done then return end
        local ok, payload = false, nil
        if type(body) == 'string' and #body <= 2097152 then ok, payload = pcall(json.decode, body) end
        if status ~= 200 or not ok or type(payload) ~= 'table' or type(payload.data) ~= 'table' then
            if status == 429 or status == 403 then blockedUntil = clock() + 60 end
            return finish(failure('provider_error', 'Audius is temporarily unavailable. Try again shortly.'))
        end
        local tracks, seen = {}, {}
        for _, item in ipairs(payload.data) do
            local track = dto(item)
            if track and not seen[track.id] and #tracks < 25 then tracks[#tracks+1]=track;seen[track.id]=true end
        end
        finish({ Success=true, Provider='audius', Tracks=tracks })
    end, 'GET', '', { ['Accept']='application/json', ['User-Agent']='PeakMusic/1.0' }, { followLocation=false })
    if not sent then finish(failure('provider_error', 'The server could not contact Audius. Try again.')) end
end)
AddEventHandler('playerDropped', function() players[source] = nil end)

local resolving = {}
Peak.Functions.CreateCallback('peak-phone:Server:Peakify:ResolveCatalog', function(source, cb, data)
    local player = Peak.Functions.GetPlayer(source)
    if not player or not player.PlayerData or not player.PlayerData.citizenid then return cb(failure('not_ready','Reopen the phone after your character loads.')) end
    local id = type(data) == 'table' and data.Id or nil
    if not validId(id) then return cb(failure('invalid_track','Select a valid Audius track.')) end
    local now, cid = clock(), player.PlayerData.citizenid
    local rate = resolving[source]
    if not rate or rate.cid ~= cid or now-rate.start >= 60 then rate={cid=cid,start=now,count=0};resolving[source]=rate end
    if rate.count >= 30 then return cb(failure('rate_limited','Wait a minute before starting more songs.')) end
    rate.count=rate.count+1
    local allowed,code,message=providerAllowance(now)
    if not allowed then return cb(failure(code,message)) end
    local done=false
    local function finish(result)
        if done then return end;done=true
        local current=Peak.Functions.GetPlayer(source)
        if not current or not current.PlayerData or current.PlayerData.citizenid ~= cid then result=failure('not_ready','Your character changed. Reopen Music.') end
        cb(result)
    end
    SetTimeout(15000,function() finish(failure('timeout','Audio lookup timed out. Try again.')) end)
    local sent=pcall(PerformHttpRequest,'https://api.audius.co/v1/tracks/' .. id .. '?app_name=PeakMusic',function(status,body)
        if done then return end
        local ok,payload=false,nil
        if type(body)=='string' and #body <= 1048576 then ok,payload=pcall(json.decode,body) end
        local track
        if status==403 or status==429 then blockedUntil=clock()+60 end
        if status==200 and ok and type(payload)=='table' and type(payload.data)=='table' then track=dto(payload.data[1] or payload.data) end
        if not track or track.id ~= id then return finish(failure('unavailable','This song is no longer free and available from a verified Audius artist.')) end
        finish({Success=true,Provider='audius',Track=track})
    end,'GET','',{['Accept']='application/json', ['User-Agent']='PeakMusic/1.0'},{followLocation=false})
    if not sent then finish(failure('provider_error','Could not reach Audius. Try again.')) end
end)
AddEventHandler('playerDropped',function() resolving[source]=nil end)
