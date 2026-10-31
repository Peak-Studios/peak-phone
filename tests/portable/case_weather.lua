local callbacks = {}
RegisterNUICallback = function(name, fn)
    assert(not callbacks[name], 'duplicate native route ' .. name)
    callbacks[name] = fn
end

local hashes = {}
for index, name in ipairs({
    'EXTRASUNNY', 'CLEAR', 'CLOUDS', 'SMOG', 'FOGGY', 'OVERCAST', 'RAIN', 'THUNDER',
    'CLEARING', 'NEUTRAL', 'SNOW', 'BLIZZARD', 'SNOWLIGHT', 'XMAS', 'HALLOWEEN'
}) do hashes[name] = index * 100 end
GetHashKey = function(name) return hashes[name] end
Phone = { Client = {
    Ready = true, HasPhone = true, Generation = 3, Data = { citizenid = 'cid-weather-a' },
    Device = { Status = 'active', Locked = false, DeviceId = 'device-a', Generation = 4,
        SimId = 'sim-a', PhoneNumber = '5550000001' }
} }

local now, weatherHash, windSpeed, clockHour, clockMinute = 1000, hashes.CLEAR, 4.2, 18, 24
local windDirection = vector3(1, 1, 0)
local transition = { hashes.CLEAR, hashes.RAIN, 0.25 }
local reads = { weather = 0, clock = 0, wind = 0, location = 0 }
GetGameTimer = function() return now end
GetCurrentServerEndpoint = function() return '127.0.0.1:30120' end
GetClockHours = function() reads.clock = reads.clock + 1; return clockHour end
GetClockMinutes = function() return clockMinute end
GetPrevWeatherTypeHashName = function() reads.weather = reads.weather + 1; return weatherHash end
GetWeatherTypeTransition = function() return table.unpack(transition) end
GetWindSpeed = function() reads.wind = reads.wind + 1; return windSpeed end
GetWindDirection = function() return windDirection end
PlayerPedId = function() return 1 end
GetEntityCoords = function() return vector3(100, 200, 30) end
GetNameOfZone = function() reads.location = reads.location + 1; return 'VINE' end
GetLabelText = function(code) return code == 'VINE' and 'Vinewood' or 'NULL' end
loadrel('client/cl_weather.lua')

local function read()
    local called, result = 0, nil
    callbacks['Weather/GetState']({}, function(value) called = called + 1; result = value end)
    eq(called, 1, 'Weather responds exactly once')
    return result
end

local first = read()
check(first.Success, 'ready unlocked phone returns a current game sample')
eq(first.Location, 'Vinewood', 'location comes from GTA zone label')
eq(first.GameTime.Hour, 18, 'game clock hour uses game time')
eq(first.GameTime.Minute, 24, 'game clock minute uses game time')
eq(first.Condition.Code, 'CLEAR', 'known weather hash maps to its real native type')
eq(first.Wind.MetersPerSecond, 4.2, 'native wind speed remains in documented m/s')
check(math.abs(first.Wind.Bearing - 45) < 0.000001, 'diagonal native XY vector maps to its clockwise bearing from north')
eq(first.Transition.to, 'RAIN', 'safe in-progress native transition is available')
check(not first.Forecast and not first.Temperature, 'the current sample does not invent forecast or temperature')

now = now + 1199
local cached = read()
eq(reads.weather, 1, 'native sample is bounded by the short cache')
eq(cached.SampledAt, first.SampledAt, 'same identity receives its cached snapshot')
now = now + 1
read()
eq(reads.weather, 2, 'cache expires at its exact boundary')

local function assertWindBearing(x, y, expected, direction)
    windDirection = vector3(x, y, 0)
    now = now + 1200
    local sample = read()
    check(math.abs(sample.Wind.Bearing - expected) < 0.000001,
        direction .. ' world XY vector produces the expected clockwise compass bearing')
end
assertWindBearing(0, 1, 0, 'north')
assertWindBearing(1, 0, 90, 'east')
assertWindBearing(0, -1, 180, 'south')
assertWindBearing(-1, 0, 270, 'west')

Phone.Client.Device.SimId = nil
now = now + 1200
local noSim = read()
check(noSim.Success, 'game-local weather is allowed without an active SIM')

weatherHash = 99999
now = now + 1200
local unknown = read()
check(unknown.Condition.Known == false and unknown.Condition.Code == false,
    'an unknown weather hash stays unknown rather than defaulting to CLEAR')
eq(unknown.Transition, false, 'unknown current weather suppresses transition claims')

weatherHash = hashes.CLEAR
transition = { hashes.CLEAR, hashes.RAIN, 100 }
windSpeed = 101
clockHour = 24
windDirection = vector3(0, 0, 0)
now = now + 1200
local malformed = read()
check(malformed.Success, 'invalid optional natives do not crash the native sample')
check(malformed.GameTime == false, 'out-of-range game time is reported unavailable')
check(malformed.Wind.Available == false, 'out-of-range wind speed is unavailable')
check(malformed.Wind.Bearing == false, 'zero-length wind vector has no compass bearing')
check(malformed.Transition == false, 'out-of-range transition percentage is unavailable')

windSpeed, clockHour, clockMinute = 3, 9, 5
windDirection, transition = vector3(0, 1, 0), { hashes.CLEAR, hashes.RAIN, 0.5 }
local oldGeneration = Phone.Client.Generation
GetClockMinutes = function() Phone.Client.Generation = oldGeneration + 1; return clockMinute end
now = now + 1200
local changed = read()
check(changed.Success == false, 'identity change during the sample rejects its result')
check(changed.Error:find('identity changed', 1, true), 'identity-change rejection explains the stale read')
GetClockMinutes = function() return clockMinute end

Phone.Client.Generation = oldGeneration
Phone.Client.Device.Locked = true
now = now + 1200
local locked = read()
check(locked.Success == false, 'locked device cannot read live game conditions')
Phone.Client.Device.Locked = false
Phone.Client.Ready = false
now = now + 1200
local unready = read()
check(unready.Success == false, 'unready client cannot read live game conditions')

Phone.Client.Ready = true
Phone.Client.Generation = oldGeneration + 2
GetCurrentServerEndpoint = function() error('server endpoint not available') end
now = now + 1200
local unavailableEndpoint = read()
check(unavailableEndpoint.Success, 'endpoint native failure does not expose or invent game data')
eq(unavailableEndpoint.Condition.Code, 'CLEAR', 'current condition still uses the GTA native')
