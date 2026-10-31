-- Peak Maps: isolated, framework-independent NUI adapter. No server or DB changes.
-- GPS samples come from GTA V's current route; never generate a straight-line road route.
local cached, cachedAt = nil, 0
local function point(value)
    if type(value) ~= 'table' and type(value) ~= 'vector3' then return nil end
    local x, y = tonumber(value.x), tonumber(value.y)
    if not x or not y or x ~= x or y ~= y or math.abs(x) > 16000 or math.abs(y) > 16000 then return nil end
    return { x = x, y = y, z = tonumber(value.z) or 0.0 }
end
local function waypoint()
    if not IsWaypointActive() then return nil end
    local blip = GetFirstBlipInfoId(8)
    if blip == 0 or not DoesBlipExist(blip) then return nil end
    return point(GetBlipInfoIdCoord(blip))
end
local function same(a, b)
    return a and b and math.abs(a.x - b.x) < 3.0 and math.abs(a.y - b.y) < 3.0
end
local function readState()
    local now = GetGameTimer()
    if cached and now - cachedAt >= 0 and now - cachedAt < 900 then return cached end
    local ped = PlayerPedId()
    if ped == 0 or not DoesEntityExist(ped) then return { Success = false, Message = 'Player is not ready.' } end
    local coords = GetEntityCoords(ped)
    local streetHash = GetStreetNameAtCoord(coords.x, coords.y, coords.z)
    local street = streetHash and GetStreetNameFromHashKey(streetHash) or ''
    local zone = GetLabelText(GetNameOfZone(coords.x, coords.y, coords.z))
    if zone == 'NULL' then zone = '' end
    local destination, route, complete = waypoint(), {}, false
    if destination and type(GetPosAlongGpsTypeRoute) == 'function' then
        -- Bounded work. 384 samples cover up to 19 km without a road-graph dependency.
        for i = 0, 383 do
            local ok, found, raw = pcall(GetPosAlongGpsTypeRoute, true, i * 50.0, 0)
            if not ok or not found then break end
            local sample = point(raw)
            if not sample then break end
            if #route > 0 and same(route[#route], sample) then break end
            route[#route + 1] = sample
            if math.sqrt((sample.x-destination.x)^2+(sample.y-destination.y)^2) < 60.0 then complete = true; break end
        end
    end
    cached = { Success = true, player = point(coords), heading = GetEntityHeading(ped),
        street = street, zone = zone, waypoint = destination or false, route = route,
        routeComplete = complete, routeSource = #route > 1 and 'game-gps' or 'game-hud', sampledAt = now }
    cachedAt = now
    return cached
end
RegisterNUICallback('Maps/GetState', function(_, cb)
    local ok, result = pcall(readState)
    cb(ok and result or { Success = false, Message = 'Game GPS is unavailable.' })
end)
RegisterNUICallback('Maps/SetWaypoint', function(data, cb)
    local target = point(data)
    if not target then cb({ Success = false, Message = 'Invalid world coordinates.' }); return end
    SetNewWaypoint(target.x + 0.0, target.y + 0.0)
    cached = nil
    cb({ Success = true, waypoint = target })
end)
RegisterNUICallback('Maps/ClearWaypoint', function(data, cb)
    local expected, current = point(data), waypoint()
    if current and not same(expected, current) then
        cb({ Success = false, Message = 'Your game waypoint changed. Refresh Maps before ending this route.' }); return
    end
    if current then SetWaypointOff() end
    cached = nil
    cb({ Success = true })
end)

-- The background poll owns live People blips, so markers keep updating when
-- Maps is closed. The server sends coordinates only in the caller's private
-- callback response after rechecking consent, identity, and routing bucket.
local liveBlips = {}
local enabledValue = GetResourceKvpString('peakduo:findmy:map-blips')
local liveBlipsEnabled = enabledValue ~= '0'
local lastPeopleSuccess = 0
local function sessionSnapshot()
    local pc = Phone.Client or {}
    local device = pc.Device or {}
    return { generation = pc.Generation, cid = pc.Data and pc.Data.citizenid,
        deviceId = device.DeviceId, deviceGeneration = device.Generation,
        simId = device.SimId, phone = device.PhoneNumber }
end
local function sameSession(a)
    local b = sessionSnapshot()
    return a.generation == b.generation and a.cid == b.cid and a.deviceId == b.deviceId and
        a.deviceGeneration == b.deviceGeneration and a.simId == b.simId and a.phone == b.phone
end
local peopleStateRequest
local function requestPeopleState()
    -- The People screen refresh and background blip timer share one in-flight
    -- callback, so the same client cannot race two ordinary polls into the
    -- server rate limit.
    if peopleStateRequest then return Citizen.Await(peopleStateRequest) end
    local pending = promise.new()
    peopleStateRequest = pending
    local ok, result = pcall(Peak.SendCallback, 'peak-phone:Server:FindMy:GetState')
    local response = { ok = ok, result = result }
    if peopleStateRequest == pending then peopleStateRequest = nil end
    pending:resolve(response)
    return response
end
local function clearPeopleBlips()
    for id, blip in pairs(liveBlips) do
        if blip and DoesBlipExist(blip) then RemoveBlip(blip) end
        liveBlips[id] = nil
    end
end
local function validLocation(p)
    if type(p) ~= 'table' then return false end
    local x, y, z = tonumber(p.x), tonumber(p.y), tonumber(p.z)
    return x and y and z and x == x and y == y and z == z and
        math.abs(x) <= 16000 and math.abs(y) <= 16000 and math.abs(z) <= 4000
end
local function applyPeopleState(result)
    if not liveBlipsEnabled or type(result) ~= 'table' or result.Success ~= true or type(result.Incoming) ~= 'table' then
        clearPeopleBlips(); return false
    end
    local seen = {}
    for _, person in ipairs(result.Incoming) do
        if type(person) == 'table' and person.Available == true and type(person.ShareId) == 'string' and
            #person.ShareId <= 80 and validLocation(person.Location) then
            local id, point = person.ShareId, person.Location
            seen[id] = true
            local blip = liveBlips[id]
            if not blip or not DoesBlipExist(blip) then
                blip = AddBlipForCoord(point.x + 0.0, point.y + 0.0, point.z + 0.0)
                if blip and blip ~= 0 then
                    liveBlips[id] = blip
                    SetBlipSprite(blip, 280)
                    SetBlipScale(blip, 0.9)
                    SetBlipColour(blip, 3)
                    SetBlipAsShortRange(blip, false)
                    BeginTextCommandSetBlipName('STRING')
                    AddTextComponentString(type(person.Name) == 'string' and person.Name ~= '' and person.Name or 'Shared location')
                    EndTextCommandSetBlipName(blip)
                end
            else
                SetBlipCoords(blip, point.x + 0.0, point.y + 0.0, point.z + 0.0)
            end
        end
    end
    for id, blip in pairs(liveBlips) do
        if not seen[id] then if DoesBlipExist(blip) then RemoveBlip(blip) end; liveBlips[id] = nil end
    end
    return true
end
RegisterNUICallback('Maps/GetPeopleState', function(_, cb)
    local session = sessionSnapshot()
    local response = requestPeopleState()
    local ok, result = response.ok, response.result
    if not ok or not sameSession(session) or type(result) ~= 'table' or result.Success ~= true then
        clearPeopleBlips(); lastPeopleSuccess = 0
        cb({ Success = false, Message = not ok and 'Live location sharing is temporarily unavailable.' or
            (type(result) == 'table' and result.Message) or 'Phone identity changed. Refresh Maps.' })
        return
    end
    lastPeopleSuccess = GetGameTimer()
    applyPeopleState(result)
    cb(result)
end)
local function findMyRequest(route, data, cb, message)
    local ok, result = pcall(Peak.SendCallback, route, data)
    if not ok then cb({ Success = false, Message = message }); return end
    cb(result)
end
RegisterNUICallback('Maps/ResolveRecipient', function(data, cb)
    findMyRequest('peak-phone:Server:FindMy:ResolveRecipient', data, cb, 'The saved recipient could not be verified.')
end)
RegisterNUICallback('Maps/GetShareContacts', function(_, cb)
    findMyRequest('peak-phone:Server:FindMy:GetShareContacts', {}, cb, 'Saved contacts are temporarily unavailable.')
end)
RegisterNUICallback('Maps/StartSharing', function(data, cb)
    findMyRequest('peak-phone:Server:FindMy:StartSharing', data, cb, 'Live sharing could not be started.')
end)
RegisterNUICallback('Maps/StopSharing', function(data, cb)
    findMyRequest('peak-phone:Server:FindMy:StopSharing', data, cb, 'The share could not be stopped.')
end)
RegisterNUICallback('Maps/GetBlipPreference', function(_, cb)
    cb({ Success = true, Enabled = liveBlipsEnabled })
end)
RegisterNUICallback('Maps/SetBlipPreference', function(data, cb)
    if type(data) ~= 'table' or type(data.Enabled) ~= 'boolean' then
        cb({ Success = false, Message = 'Choose whether shared locations appear on the GTA map.' }); return
    end
    liveBlipsEnabled = data.Enabled
    SetResourceKvp('peakduo:findmy:map-blips', liveBlipsEnabled and '1' or '0')
    if not liveBlipsEnabled then clearPeopleBlips() end
    cb({ Success = true, Enabled = liveBlipsEnabled })
end)

CreateThread(function()
    while true do
        Wait(6500)
            if liveBlipsEnabled and Phone.Client and Phone.Client.Ready and Phone.Client.HasPhone then
                local session = sessionSnapshot()
                local response = requestPeopleState()
                local ok, result = response.ok, response.result
            if ok and sameSession(session) and type(result) == 'table' and result.Success == true then
                lastPeopleSuccess = GetGameTimer()
                applyPeopleState(result)
            else
                clearPeopleBlips(); lastPeopleSuccess = 0
            end
        else
            clearPeopleBlips()
        end
    end
end)
AddEventHandler('Peak:Client:OnPlayerUnload', function()
    clearPeopleBlips(); lastPeopleSuccess = 0
end)
RegisterNetEvent('peak-phone:portable:identityChanged', function()
    if source == 65535 then clearPeopleBlips(); lastPeopleSuccess = 0 end
end)
CreateThread(function()
    while true do
        Wait(1000)
        if liveBlipsEnabled and lastPeopleSuccess > 0 and GetGameTimer() - lastPeopleSuccess > 12000 then clearPeopleBlips() end
    end
end)
AddEventHandler('onClientResourceStop', function(name)
    if name == GetCurrentResourceName() then clearPeopleBlips() end
end)
