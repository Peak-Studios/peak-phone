Phone = Phone or { Version = '3.0.0' }
PhonePeak = PhonePeak or { Functions = {}, Shared = {}, Player = {}, Commands = {}, VSync = {} }
PhoneServices = PhoneServices or {}
PhoneIntegration = PhoneIntegration or { Callbacks = {}, Client = {}, Capabilities = {} }

function Phone.started(name)
    return type(name) == 'string' and GetResourceState(name) == 'started'
end
function Phone.trim(v)
    return type(v) == 'string' and v:match('^%s*(.-)%s*$') or ''
end
function Phone.text(v, max, allowEmpty)
    return type(v) == 'string' and #v <= (max or 2048) and (allowEmpty or #Phone.trim(v) > 0) and not v:find('%z')
end
-- Typed counterpart to Phone.text. Keep Phone.text as a predicate for its many
-- existing callers; use this when the validated value itself is required.
function Phone.string(v, max, allowEmpty)
    if not Phone.text(v, max, allowEmpty) then return nil end
    return Phone.trim(v)
end
function Phone.number(v, max, allowZero)
    local n = tonumber(v)
    if not n or n ~= n or n == math.huge or n == -math.huge or n % 1 ~= 0 then return nil end
    if n < (allowZero and 0 or 1) or n > (max or 1000000000) then return nil end
    return n
end
function Phone.phone(v)
    if type(v) ~= 'string' and type(v) ~= 'number' then return nil end
    local s = tostring(v):gsub('[%s%-%(%)%+]','')
    if #s < 3 or #s > 20 or s:find('%D') then return nil end
    return s
end
function Phone.copy(v)
    if type(v) ~= 'table' then return v end
    local r = {}; for k,x in pairs(v) do r[k] = Phone.copy(x) end; return r
end
function Phone.decode(v, default)
    if type(v) == 'table' then return v end
    if type(v) ~= 'string' then return default or {} end
    local ok, r = pcall(json.decode,v); return ok and type(r)=='table' and r or (default or {})
end
function Phone.random(length, alphabet)
    local r = {}; for i=1,length do local n=math.random(1,#alphabet);r[i]=alphabet:sub(n,n) end
    return table.concat(r)
end
function Phone.token()
    -- Uniqueness, NOT authentication. Membership is always checked against server source + character.
    return ('%x-%s'):format(GetGameTimer(),Phone.random(24,'0123456789abcdef'))
end
PhonePeak.Shared.RandomInt = function(n) return Phone.random(n,'0123456789') end
PhonePeak.Shared.RandomStr = function(n) return Phone.random(n,'abcdefghijklmnopqrstuvwxyz') end
PhonePeak.Shared.HashVehicles = {}
PhonePeak.Player.CreatePhoneNumber = function() return PhoneConfig.NumberPrefix..PhonePeak.Shared.RandomInt(PhoneConfig.NumberDigits) end

Phone.LegacyRequirements = {
    housing = { 'peak-housing' }, employment = { 'peak-businesses','peak-financials' },
    busdriver = { 'peak-busdriver' }, lumberjack = { 'peak-lumberjack' },
    guber = { 'peak-guber' }, racing = { 'peak-racing' }, ['time-trials'] = { 'peak-racing' },
    cars = { 'peak-businesses','peak-vehicles' }, bankbusters = { 'peak-heists' }, tierup = { 'peak-heists' },
    debt = { 'peak-misc' }, armazoon = { 'peak-armazoon' },
}
function Phone.legacyAvailable(id)
    if not PhoneConfig.LegacyGameplay or not Phone.started('peak-core') then return false end
    local deps = Phone.LegacyRequirements[id]; if not deps then return false end
    for _,r in ipairs(deps) do if not Phone.started(r) then return false end end
    return true
end
function Phone.integrationAvailable(id)
    return PhoneIntegration.Capabilities[id] == true or Phone.legacyAvailable(id)
end
