-- Read-only current game weather adapter. No provider, server, or database calls.
local WEATHER_TYPES = {
    'EXTRASUNNY', 'CLEAR', 'CLOUDS', 'SMOG', 'FOGGY', 'OVERCAST', 'RAIN', 'THUNDER',
    'CLEARING', 'NEUTRAL', 'SNOW', 'BLIZZARD', 'SNOWLIGHT', 'XMAS', 'HALLOWEEN'
}
local weatherByHash = {}
for _, name in ipairs(WEATHER_TYPES) do
    if type(GetHashKey) == 'function' then
        local ok, hash = pcall(GetHashKey, name)
        if ok and type(hash) == 'number' then weatherByHash[hash] = name end
    end
end

local CACHE_MS = 1200
local cached

local function finite(value)
    return type(value) == 'number' and value == value and value > -math.huge and value < math.huge
end

local function session()
    local pc = Phone and Phone.Client
    if not pc or pc.Ready ~= true or pc.HasPhone ~= true then return nil, 'Weather is unavailable until your phone is ready.' end
    local device = pc.Device or {}
    if device.Locked == true or (device.Status ~= nil and device.Status ~= 'active') then
        return nil, 'Unlock your phone to view current game weather.'
    end
    local data = pc.Data or {}
    local server = ''
    if type(GetCurrentServerEndpoint) == 'function' then
        local ok, value = pcall(GetCurrentServerEndpoint)
        if ok and type(value) == 'string' then server = value end
    end
    local key = table.concat({tostring(server or ''), tostring(data.citizenid or ''),
        tostring(device.DeviceId or ''), tostring(device.Generation or ''),
        tostring(device.SimId or ''), tostring(device.PhoneNumber or ''), tostring(pc.Generation or '')}, '\31')
    return { key = key, generation = pc.Generation, cid = data.citizenid,
        deviceId = device.DeviceId, deviceGeneration = device.Generation,
        simId = device.SimId, phone = device.PhoneNumber }
end

local function sameSession(before)
    local after = session()
    return after and after.key == before.key
end

local function weatherName(hash)
    if not finite(hash) then return nil end
    return weatherByHash[hash]
end

local function readLocation()
    if type(PlayerPedId) ~= 'function' or type(GetEntityCoords) ~= 'function' or type(GetNameOfZone) ~= 'function' then return nil end
    local ok, ped = pcall(PlayerPedId)
    if not ok or not finite(ped) or ped == 0 then return nil end
    local coordsOk, coords = pcall(GetEntityCoords, ped, false)
    if not coordsOk or type(coords) ~= 'table' and type(coords) ~= 'vector3' then return nil end
    local x, y, z = tonumber(coords.x), tonumber(coords.y), tonumber(coords.z)
    if not finite(x) or not finite(y) or not finite(z) or math.abs(x) > 16000 or math.abs(y) > 16000 or math.abs(z) > 4000 then return nil end
    local zoneOk, zone = pcall(GetNameOfZone, x, y, z)
    if not zoneOk or type(zone) ~= 'string' or zone == '' or #zone > 32 then return nil end
    if type(GetLabelText) ~= 'function' then return nil end
    local labelOk, label = pcall(GetLabelText, zone)
    if not labelOk or type(label) ~= 'string' or label == '' or label == 'NULL' or label == zone or #label > 64 then return nil end
    return label
end

local function readTransition(current)
    if type(GetWeatherTypeTransition) ~= 'function' then return nil end
    local ok, first, second, percent = pcall(GetWeatherTypeTransition)
    if not ok or not finite(percent) or percent <= 0 or percent >= 1 then return nil end
    local from, to = weatherName(first), weatherName(second)
    if not from or not to or from == to or current ~= from then return nil end
    return { from = from, to = to, percent = percent }
end

local function readWindBearing()
    if type(GetWindDirection) ~= 'function' then return nil end
    local ok, heading = pcall(function()
        local direction = GetWindDirection()
        if type(direction) ~= 'table' and type(direction) ~= 'vector3' then return nil end
        local x, y = tonumber(direction.x), tonumber(direction.y)
        if not finite(x) or not finite(y) or math.abs(x) > 1000000 or math.abs(y) > 1000000 then return nil end
        if x * x + y * y < 0.000000000001 then return nil end
        -- Cfx's documented math.atan(x, y) order gives a clockwise XY bearing from north (+Y).
        local value = math.deg(math.atan(x, y)) % 360
        if not finite(value) or value < 0 or value > 360 then return nil end
        return value
    end)
    if ok then return heading end
    return nil
end

local function sample(before)
    local result = { Success = true, Location = readLocation() or false, GameTime = false, Transition = false,
        Condition = { Known = false, Code = false, Label = 'Conditions unavailable' },
        Wind = { Available = false, MetersPerSecond = false, Bearing = false }, SampledAt = false }

    if type(GetClockHours) == 'function' and type(GetClockMinutes) == 'function' then
        local clockOk, hour, minute = pcall(function() return GetClockHours(), GetClockMinutes() end)
        if clockOk and finite(hour) and finite(minute) and hour >= 0 and hour <= 23 and minute >= 0 and minute <= 59 then
            result.GameTime = { Hour = math.floor(hour), Minute = math.floor(minute) }
        end
    end

    if type(GetPrevWeatherTypeHashName) == 'function' then
        local weatherOk, hash = pcall(GetPrevWeatherTypeHashName)
        local code = weatherOk and weatherName(hash) or nil
        if code then
            result.Condition = { Known = true, Code = code, Label = code }
            result.Transition = readTransition(code) or false
        end
    end

    if type(GetWindSpeed) == 'function' then
        local windOk, speed = pcall(GetWindSpeed)
        if windOk and finite(speed) and speed >= 0 and speed <= 100 then
            result.Wind = { Available = true, MetersPerSecond = speed, Bearing = readWindBearing() or false }
        end
    end

    if type(GetGameTimer) == 'function' then
        local timerOk, now = pcall(GetGameTimer)
        if timerOk and finite(now) and now >= 0 then result.SampledAt = math.floor(now) end
    end

    if not sameSession(before) then return nil, 'Phone identity changed while Weather was reading the game state.' end
    if result.SampledAt then cached = { key = before.key, at = result.SampledAt, value = result } end
    return result
end

RegisterNUICallback('Weather/GetState', function(_, cb)
    local before, reason = session()
    if not before then cb({ Success = false, Error = reason }); return end
    local nowOk, now = pcall(GetGameTimer)
    if nowOk and finite(now) and cached and cached.key == before.key then
        local age = (now - cached.at) % 4294967296
        if age < CACHE_MS then cb(cached.value); return end
    end
    local ok, result, err = pcall(sample, before)
    if not ok then cb({ Success = false, Error = 'Current game weather could not be read.' }); return end
    if not result then cb({ Success = false, Error = err or 'Current game weather could not be read.' }); return end
    cb(result)
end)
