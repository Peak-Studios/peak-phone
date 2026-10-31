-- Find My permissions are durable; coordinates are ephemeral server samples.
-- The NUI and clients never submit a location or enumerate another player's shares.
Phone.FindMy = Phone.FindMy or {}
local M = Phone.FindMy
M.epochs, M.versions, M.revoking, M.confirmations, M.sourceCid = {}, {}, {}, {}, {}

local DURATIONS = { one_hour = 3600000, one_day = 86400000, until_stopped = false }
local MAX_OUTGOING, MAX_INCOMING = 32, 64
local function now() return os.time() * 1000 end
local function fail(message) return Phone.publicError(message) end
local function rawCid(src)
    if not src or GetPlayerName(src) == nil then return nil end
    local ok, raw = pcall(Phone.rawPlayer, src)
    return ok and raw and Phone.rawIdentity(raw) or nil
end
local function currentCid(src)
    local cid = rawCid(src)
    return Phone.text(cid, 128) and cid or nil
end
local function epoch(cid) return M.epochs[cid] or 0 end
local function bump(cid)
    if cid then M.epochs[cid] = epoch(cid) + 1 end
end
local function finalActor(src, cid, expectedEpoch)
    return cid ~= nil and GetPlayerName(src) ~= nil and rawCid(src) == cid and
        (expectedEpoch == nil or epoch(cid) == expectedEpoch)
end
local function characterName(raw)
    local value = Phone.decode(raw and raw.charinfo)
    return Phone.trim((value.firstname or '') .. ' ' .. (value.lastname or ''))
end
local function savedCharacterName(cid)
    local row = PhoneDB.one('SELECT charinfo FROM peak_phone_characters WHERE citizenid=?', { cid })
    local name = row and characterName(row)
    return name ~= '' and name or nil
end
local function identity(src)
    src = tonumber(src)
    local cid = currentCid(src)
    if not cid then return nil, 'Character is unavailable.' end
    local prior = M.sourceCid[src]
    if prior and prior ~= cid then M.characterChanged(src, prior) end
    M.sourceCid[src] = cid
    local expectedEpoch = epoch(cid)

    -- These framework, profile, device, and SIM projections may yield. Do all
    -- of them before the raw player/session guard at the end of this function.
    local player = Phone.getPlayer(src)
    if not player or player.PlayerData.citizenid ~= cid then return nil, 'Character changed.' end
    local active = Phone.Devices and Phone.Devices.active and Phone.Devices.active(src)
    if not active or active.Status ~= 'active' or not active.DeviceId or not active.SimId or not active.PhoneNumber then
        return nil, 'Insert an active SIM to use live location sharing.'
    end
    local sim = GetSimCardBySimId(active.SimId)
    local phone = Phone.phone(active.PhoneNumber)
    if not sim or sim.sim_id ~= active.SimId or Phone.phone(sim.phone_number) ~= phone or not phone then
        return nil, 'The active SIM could not be verified.'
    end
    local simCid = Phone.simCitizenId(src)
    local expectedSimCid = sim.owner_citizenid or sim.sim_id
    if not expectedSimCid or simCid ~= expectedSimCid or not Phone.sameSim(src, expectedSimCid) then
        return nil, 'The active SIM changed. Reopen Maps and try again.'
    end
    if not finalActor(src, cid, expectedEpoch) then return nil, 'Character or phone identity changed.' end
    return {
        source = src, cid = cid, simCid = expectedSimCid, simId = sim.sim_id,
        phone = phone, deviceId = active.DeviceId, generation = tonumber(active.Generation),
        name = Phone.trim(player.PlayerData.charinfo.firstname .. ' ' .. player.PlayerData.charinfo.lastname),
        epoch = expectedEpoch,
    }
end
local function targetForPhone(phone)
    local sim = PhoneDB.one('SELECT sim_id,phone_number,owner_citizenid FROM sim_cards WHERE phone_number=?', { phone })
    if not sim or not Phone.text(sim.sim_id, 20) or Phone.phone(sim.phone_number) ~= phone or not Phone.text(sim.owner_citizenid, 128) then
        return nil, 'This saved contact has no verifiable SIM owner.'
    end
    local expectedCid, expectedSimId = sim.owner_citizenid, sim.sim_id
    local expectedEpoch = epoch(expectedCid)
    local name = savedCharacterName(expectedCid)
    if not name then return nil, 'This SIM is not linked to a character profile.' end
    -- Character/profile reads yield. Re-read the SIM binding afterwards so a
    -- transferred number cannot inherit a confirmation made for its prior owner.
    local current = PhoneDB.one('SELECT sim_id,phone_number,owner_citizenid FROM sim_cards WHERE phone_number=?', { phone })
    if not current or current.sim_id ~= expectedSimId or current.owner_citizenid ~= expectedCid or
        Phone.phone(current.phone_number) ~= phone or epoch(expectedCid) ~= expectedEpoch then
        return nil, 'The saved contact recipient changed. Resolve it again.'
    end
    return { cid = expectedCid, simCid = expectedCid, simId = expectedSimId, phone = phone, name = name, epoch = expectedEpoch }
end
local function verifySavedContact(actor, phone)
    local row = PhoneDB.one('SELECT id,name,phone FROM phone_contacts WHERE citizenid=? AND phone=? ORDER BY id LIMIT 1', { actor.simCid, phone })
    if not row or Phone.phone(row.phone) ~= phone then return nil, 'Choose a contact saved on your active SIM.' end
    local name = Phone.string(row.name, 100)
    if not name then return nil, 'This contact has an invalid name.' end
    return { id = tonumber(row.id), name = name, phone = phone }
end
local function activeShare(row, at)
    return row and (not row.expires_at or tonumber(row.expires_at) > at)
end
local function markShare(id, revoking)
    M.versions[id] = (M.versions[id] or 0) + 1
    M.revoking[id] = revoking == true or nil
end
local function markRows(rows)
    for _, row in ipairs(rows or {}) do if row.share_id then markShare(row.share_id, true) end end
end
local function removeRows(selectSql, deleteSql, values)
    local rows = PhoneDB.query(selectSql, values) or {}
    markRows(rows)
    local result = PhoneDB.update(deleteSql, values)
    local removed = result ~= nil and result ~= false
    -- A failed durable revoke keeps the in-memory deny bit set. That prevents
    -- a later poll from publishing a row which is still present in SQL.
    if removed then for _, row in ipairs(rows) do if row.share_id then M.revoking[row.share_id] = nil end end end
    return removed
end
local function durationLabel(value)
    return value == 'one_hour' and '1 hour' or value == 'one_day' and '1 day' or 'Until stopped'
end
local function expiryCleanup()
    local rows = PhoneDB.query('SELECT share_id FROM peak_phone_location_shares WHERE expires_at IS NOT NULL AND expires_at<=? LIMIT 128', { now() }) or {}
    if #rows > 0 then removeRows(
        'SELECT share_id FROM peak_phone_location_shares WHERE expires_at IS NOT NULL AND expires_at<=? LIMIT 128',
        'DELETE FROM peak_phone_location_shares WHERE expires_at IS NOT NULL AND expires_at<=?', { now() }) end
end

local function resolve(src, data)
    if not Phone.rate(src, 'findmy-resolve', 4, 5000) then return fail('Wait a moment before resolving another contact.') end
    local actor, err = identity(src)
    if not actor then return fail(err) end
    local phone = type(data) == 'table' and Phone.phone(data.Phone)
    if not phone then return fail('Choose a valid saved contact.') end
    local contact, contactErr = verifySavedContact(actor, phone)
    if not contact then return fail(contactErr) end
    local target, targetErr = targetForPhone(phone)
    if not target then return fail(targetErr) end
    if actor.cid == target.cid then return fail('Choose someone else to share with.') end
    local id = Phone.token()
    local perSource = 0
    for token, confirmation in pairs(M.confirmations) do
        if confirmation.expires <= now() then M.confirmations[token] = nil
        elseif confirmation.src == src then perSource = perSource + 1 end
    end
    if perSource >= 4 then return fail('Finish or dismiss a pending recipient confirmation first.') end
    local confirmation = {
        id = id, src = src, owner = actor, contact = contact, target = target,
        expires = now() + 60000,
    }
    if not finalActor(src, actor.cid, actor.epoch) or epoch(target.cid) ~= target.epoch then return fail('Your character or SIM changed.') end
    M.confirmations[id] = confirmation
    return { Success = true, ConfirmationId = id, Contact = { Name = contact.name, Phone = phone },
        Recipient = { Name = target.name, Phone = target.phone }, ExpiresAt = confirmation.expires }
end

local function start(src, data)
    if not Phone.rate(src, 'findmy-start', 2, 5000) then return fail('Wait a moment before sharing again.') end
    local confirmationId = type(data) == 'table' and Phone.string(data.ConfirmationId, 80)
    local confirmation = confirmationId and M.confirmations[confirmationId]
    if not confirmation or confirmation.src ~= src or confirmation.expires <= now() then return fail('Resolve and confirm the saved recipient again.') end
    local duration = type(data) == 'table' and data.Duration
    local length = DURATIONS[duration]
    if length == nil then return fail('Choose one hour, one day, or Until stopped.') end

    -- Serialize with physical SIM commits and per-character/device permission
    -- changes. The confirmation token is server-owned and bound to this session.
    return Phone.withLocks({ 'phone-sim-commit', 'findmy-cid:' .. confirmation.owner.cid,
        'findmy-device:' .. confirmation.owner.deviceId, 'findmy-cid:' .. confirmation.target.cid }, function()
        if M.confirmations[confirmationId] ~= confirmation or confirmation.expires <= now() then
            return fail('Recipient confirmation expired. Review it again.')
        end
        local actor, identityErr = identity(src)
        if not actor then return fail(identityErr) end
        if actor.cid ~= confirmation.owner.cid or actor.simCid ~= confirmation.owner.simCid or
            actor.simId ~= confirmation.owner.simId or actor.phone ~= confirmation.owner.phone or
            actor.deviceId ~= confirmation.owner.deviceId or actor.generation ~= confirmation.owner.generation or
            actor.epoch ~= confirmation.owner.epoch then return fail('Your character, SIM, or phone changed. Review the recipient again.') end
        local contact, contactErr = verifySavedContact(actor, confirmation.contact.phone)
        if not contact or contact.id ~= confirmation.contact.id or contact.name ~= confirmation.contact.name then
            return fail(contactErr or 'The saved contact changed. Review the recipient again.')
        end
        local target, targetErr = targetForPhone(confirmation.target.phone)
        if not target or target.cid ~= confirmation.target.cid or target.simId ~= confirmation.target.simId or
            target.phone ~= confirmation.target.phone or target.name ~= confirmation.target.name or
            target.epoch ~= confirmation.target.epoch then
            return fail(targetErr or 'The recipient SIM or character changed. Resolve the contact again.')
        end
        if actor.cid == target.cid then return fail('Choose someone else to share with.') end

        local rows = PhoneDB.query('SELECT share_id,expires_at FROM peak_phone_location_shares WHERE owner_cid=? AND owner_sim_id=? AND target_cid=? AND target_sim_id=?',
            { actor.cid, actor.simId, target.cid, target.simId }) or {}
        local outgoing, incoming = 0, 0
        -- This exact pair is being renewed, so it consumes no additional slot.
        local countQuery = PhoneDB.query([[SELECT owner_cid,target_cid,target_sim_id,expires_at FROM peak_phone_location_shares
            WHERE (owner_cid=? AND (expires_at IS NULL OR expires_at>?))
               OR (target_cid=? AND target_sim_id=? AND (expires_at IS NULL OR expires_at>?)) LIMIT 256]],
            { actor.cid, now(), target.cid, target.simId, now() }) or {}
        for _, row in ipairs(countQuery) do
            local samePair = row.owner_cid == actor.cid and row.target_cid == target.cid and row.target_sim_id == target.simId
            if row.owner_cid == actor.cid and not samePair then outgoing = outgoing + 1 end
            if row.target_cid == target.cid and row.target_sim_id == target.simId and not samePair then incoming = incoming + 1 end
        end
        if outgoing >= MAX_OUTGOING or incoming >= MAX_INCOMING then return fail('A location sharing limit was reached. Stop an older share first.') end

        local at = now()
        local expires = length and (at + length) or nil
        local shareId = Phone.token()
        if not finalActor(src, actor.cid, actor.epoch) or M.confirmations[confirmationId] ~= confirmation then
            return fail('Your phone session changed. Review the recipient again.')
        end
        local saved = PhoneDB.transaction({
            { query = [[INSERT INTO peak_phone_location_shares
                (share_id,owner_cid,owner_sim_cid,owner_sim_id,owner_phone,owner_device_id,owner_name,target_cid,target_sim_cid,target_sim_id,target_phone,contact_name,target_name,duration,created_at,expires_at)
                SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?
                FROM phone_contacts c
                JOIN sim_cards o ON o.sim_id=? AND o.owner_citizenid=? AND o.phone_number=?
                JOIN sim_cards t ON t.sim_id=? AND t.owner_citizenid=? AND t.phone_number=?
                WHERE c.citizenid=? AND c.id=? AND c.phone=? AND c.name=?
                ON DUPLICATE KEY UPDATE share_id=VALUES(share_id),owner_sim_cid=VALUES(owner_sim_cid),
                    owner_phone=VALUES(owner_phone),owner_device_id=VALUES(owner_device_id),owner_name=VALUES(owner_name),
                    target_sim_cid=VALUES(target_sim_cid),target_phone=VALUES(target_phone),contact_name=VALUES(contact_name),
                    target_name=VALUES(target_name),duration=VALUES(duration),created_at=VALUES(created_at),expires_at=VALUES(expires_at)]],
                values = { shareId, actor.cid, actor.simCid, actor.simId, actor.phone, actor.deviceId, actor.name,
                    target.cid, target.simCid, target.simId, target.phone, contact.name, target.name,
                    duration, at, expires, actor.simId, actor.simCid, actor.phone, target.simId,
                    target.cid, target.phone, actor.simCid, contact.id, contact.phone, contact.name } },
        })
        if not saved then return fail('The live sharing permission could not be saved.') end
        local verified = PhoneDB.one('SELECT share_id FROM peak_phone_location_shares WHERE share_id=? AND owner_cid=? AND target_cid=?',
            { shareId, actor.cid, target.cid })
        if not verified or not finalActor(src, actor.cid, actor.epoch) or epoch(target.cid) ~= target.epoch or
            M.confirmations[confirmationId] ~= confirmation then
            PhoneDB.update('DELETE FROM peak_phone_location_shares WHERE share_id=? AND owner_cid=?', { shareId, actor.cid })
            return fail('Your character or SIM changed while sharing was saved.')
        end
        for _, old in ipairs(rows) do if old.share_id then markShare(old.share_id, false) end end
        M.versions[shareId] = (M.versions[shareId] or 0) + 1
        M.confirmations[confirmationId] = nil
        return { Success = true, ShareId = shareId, Duration = duration, ExpiresAt = expires }
    end)
end

local function revoke(src, data)
    if not Phone.rate(src, 'findmy-stop', 4, 5000) then return fail('Wait a moment before stopping another share.') end
    local cid = currentCid(src)
    local id = type(data) == 'table' and Phone.string(data.ShareId, 80)
    if not cid or not id then return fail('Choose a valid share to stop.') end
    return Phone.withLocks({ 'findmy-cid:' .. cid, 'findmy-share:' .. id }, function()
        local row = PhoneDB.one('SELECT share_id FROM peak_phone_location_shares WHERE share_id=? AND owner_cid=?', { id, cid })
        if not row then return { Success = true } end
        if not finalActor(src, cid) then return fail('Your character changed before sharing could be stopped.') end
        markShare(id, true)
        local result = PhoneDB.update('DELETE FROM peak_phone_location_shares WHERE share_id=? AND owner_cid=?', { id, cid })
        if result == nil or result == false then return fail('The share could not be stopped. Try again.') end
        M.revoking[id] = nil
        return { Success = true }
    end)
end

local function sourceFor(cid)
    for _, value in ipairs(GetPlayers()) do
        local src = tonumber(value)
        if src and rawCid(src) == cid then return src end
    end
end
local function validWorldPoint(value)
    if type(value) ~= 'table' and type(value) ~= 'vector3' then return nil end
    local x, y, z = tonumber(value.x), tonumber(value.y), tonumber(value.z)
    if not x or not y or not z or x ~= x or y ~= y or z ~= z or
        math.abs(x) > 16000 or math.abs(y) > 16000 or math.abs(z) > 4000 then return nil end
    return { x = x, y = y, z = z }
end
local function getState(src)
    if not Phone.rate(src, 'findmy-state', 3, 1000) then return fail('Wait for the next location refresh.') end
    local cid = currentCid(src)
    if not cid then return fail('Character is unavailable.') end
    local actor, actorErr = identity(src)
    local contacts, outgoing, incoming = {}, {}, {}

    for _, row in ipairs(PhoneDB.query([[SELECT share_id,contact_name,target_name,target_phone,duration,created_at,expires_at
        FROM peak_phone_location_shares WHERE owner_cid=? AND (expires_at IS NULL OR expires_at>?)
        ORDER BY created_at DESC LIMIT 32]], { cid, now() }) or {}) do
        outgoing[#outgoing + 1] = { ShareId = row.share_id, Name = row.contact_name, Recipient = row.target_name,
            Phone = row.target_phone, Duration = durationLabel(row.duration), ExpiresAt = tonumber(row.expires_at) }
    end

    local recipientBucket = GetPlayerRoutingBucket(src)
    local targetRows = {}
    if actor then
        targetRows = PhoneDB.query([[SELECT share_id,owner_cid,owner_sim_cid,owner_sim_id,owner_phone,owner_device_id,owner_name,
            target_cid,target_sim_cid,target_sim_id,target_phone,contact_name,target_name,duration,expires_at
            FROM peak_phone_location_shares WHERE target_cid=? AND target_sim_cid=? AND target_sim_id=? AND target_phone=?
            AND (expires_at IS NULL OR expires_at>?) ORDER BY created_at DESC LIMIT 64]],
            { actor.cid, actor.simCid, actor.simId, actor.phone, now() }) or {}
    end
    local pending, ownerCache = {}, {}
    for _, row in ipairs(targetRows) do
        local version = M.versions[row.share_id] or 0
        local item = { ShareId = row.share_id, Name = row.owner_name, Phone = row.owner_phone,
            Duration = durationLabel(row.duration), ExpiresAt = tonumber(row.expires_at), Available = false,
            Status = 'Offline' }
        local ownerSource = sourceFor(row.owner_cid)
        local ownerBucket = ownerSource and GetPlayerRoutingBucket(ownerSource) or nil
        local owner
        if ownerSource and ownerBucket == recipientBucket then
            if ownerCache[ownerSource] == nil then ownerCache[ownerSource] = identity(ownerSource) or false end
            local candidate = ownerCache[ownerSource]
            if candidate and candidate.cid == row.owner_cid and candidate.simCid == row.owner_sim_cid and
                candidate.simId == row.owner_sim_id and candidate.phone == row.owner_phone and
                candidate.deviceId == row.owner_device_id then owner = candidate end
        end
        if owner then
            item.Name = owner.name ~= '' and owner.name or row.owner_name
            item.Status = ownerBucket == recipientBucket and 'Location unavailable' or 'Different instance'
        elseif ownerSource then
            item.Status = 'Location unavailable'
        end
        local fresh = PhoneDB.one([[SELECT share_id FROM peak_phone_location_shares WHERE share_id=?
            AND owner_cid=? AND owner_sim_cid=? AND owner_sim_id=? AND owner_phone=? AND owner_device_id=?
            AND target_cid=? AND target_sim_cid=? AND target_sim_id=? AND target_phone=?
            AND (expires_at IS NULL OR expires_at>?) ]],
            { row.share_id, row.owner_cid, row.owner_sim_cid, row.owner_sim_id, row.owner_phone, row.owner_device_id,
                row.target_cid, row.target_sim_cid, row.target_sim_id, row.target_phone, now() })
        -- Keep identity()'s validated epoch from before the fresh permission
        -- query yields; recapturing it here could bless an identity change.
        pending[#pending + 1] = { item = item, row = row, version = version, ownerSource = ownerSource,
            ownerEpoch = owner and owner.epoch or nil, ownerBucket = ownerBucket, ownerValid = owner ~= nil,
            persisted = fresh ~= nil, targetEpoch = actor.epoch }
    end

    -- Every operation above can yield. Validate the whole batch after all
    -- lookups, then sample points with no yielding operation until return.
    if actor and (not finalActor(src, actor.cid, actor.epoch) or GetPlayerRoutingBucket(src) ~= recipientBucket) then
        return fail('Character or phone identity changed.')
    end
    local at = now()
    for _, observation in ipairs(pending) do
        local row, item, ownerSource = observation.row, observation.item, observation.ownerSource
        local ownerSessionValid = ownerSource ~= nil and
            finalActor(ownerSource, row.owner_cid, observation.ownerEpoch) and
            GetPlayerRoutingBucket(ownerSource) == observation.ownerBucket
        local ownerStillValid = observation.ownerValid and ownerSessionValid
        local targetStillValid = actor ~= nil and finalActor(src, actor.cid, observation.targetEpoch) and
            GetPlayerRoutingBucket(src) == recipientBucket
        local ownerBucket = ownerStillValid and GetPlayerRoutingBucket(ownerSource) or nil
        if ownerSource and not ownerSessionValid then item.Status = 'Location unavailable' end
        if ownerSessionValid and ownerBucket ~= recipientBucket then item.Status = 'Different instance' end
        if ownerSessionValid and ownerBucket == recipientBucket and not ownerStillValid then item.Status = 'Location unavailable' end
        local permissionValid = observation.persisted and targetStillValid and ownerStillValid and
            not M.revoking[row.share_id] and (M.versions[row.share_id] or 0) == observation.version and
            (not row.expires_at or tonumber(row.expires_at) > at)
        if permissionValid and ownerBucket == recipientBucket then
            local ownerPed, recipientPed = GetPlayerPed(ownerSource), GetPlayerPed(src)
            if ownerPed and ownerPed ~= 0 and recipientPed and recipientPed ~= 0 and
                DoesEntityExist(ownerPed) and DoesEntityExist(recipientPed) then
                local point = validWorldPoint(GetEntityCoords(ownerPed))
                if point then item.Available = true; item.Status = 'Live'; item.Location = point; item.SampledAt = at
                else item.Status = 'Location unavailable' end
            else item.Status = 'Location unavailable' end
        end
        if observation.persisted and targetStillValid and not M.revoking[row.share_id] and
            (M.versions[row.share_id] or 0) == observation.version and
            (not row.expires_at or tonumber(row.expires_at) > at) then incoming[#incoming + 1] = item end
    end
    if not finalActor(src, cid, actor and actor.epoch) then return fail('Character or phone identity changed.') end
    M.sourceCid[src] = cid
    return { Success = true, Contacts = contacts, Outgoing = outgoing, Incoming = incoming,
        CanShare = actor ~= nil, UnavailableReason = actor and nil or actorErr }
end

local function getShareContacts(src)
    if not Phone.rate(src, 'findmy-contacts', 3, 1000) then return fail('Wait for the next saved-contact refresh.') end
    local actor, err = identity(src)
    if not actor then return fail(err) end
    local contacts = {}
    for _, row in ipairs(PhoneDB.query([[SELECT c.id,c.name,c.phone,s.sim_id,s.owner_citizenid
        FROM phone_contacts c LEFT JOIN sim_cards s ON s.phone_number=c.phone
        WHERE c.citizenid=? ORDER BY c.name LIMIT 1000]], { actor.simCid }) or {}) do
        contacts[#contacts + 1] = { Id = tonumber(row.id), Name = Phone.string(row.name, 100) or 'Contact',
            Phone = Phone.phone(row.phone) or '', Resolvable = not not (Phone.text(row.sim_id, 20) and Phone.text(row.owner_citizenid, 128)) }
    end
    local active = Phone.Devices and Phone.Devices.active and Phone.Devices.active(src)
    if not active or active.Status ~= 'active' or
        active.DeviceId ~= actor.deviceId or active.SimId ~= actor.simId or
        Phone.phone(active.PhoneNumber) ~= actor.phone or tonumber(active.Generation) ~= actor.generation or
        not Phone.sameSim(src, actor.simCid) or not finalActor(src, actor.cid, actor.epoch) then
        return fail('Character or phone identity changed. Refresh Maps.')
    end
    return { Success = true, Contacts = contacts }
end

function M.revokeDevice(deviceId, cid)
    if not Phone.text(deviceId, 32) or not Phone.text(cid, 128) then return false end
    return Phone.withLocks({ 'findmy-device:' .. deviceId }, function()
        return removeRows('SELECT share_id FROM peak_phone_location_shares WHERE owner_device_id=? AND owner_cid=?',
            'DELETE FROM peak_phone_location_shares WHERE owner_device_id=? AND owner_cid=?', { deviceId, cid })
    end)
end
function M.revokeRecipientSim(cid, simId)
    if not Phone.text(cid, 128) or not Phone.text(simId, 20) then return false end
    bump(cid)
    return removeRows('SELECT share_id FROM peak_phone_location_shares WHERE target_cid=? AND target_sim_id=?',
        'DELETE FROM peak_phone_location_shares WHERE target_cid=? AND target_sim_id=?', { cid, simId })
end
function M.sessionChanged(src, cid)
    -- Device/session generation changes invalidate pending confirmations and
    -- in-flight observations, but do not revoke durable live-share consent.
    bump(cid)
    for key, item in pairs(M.confirmations) do
        if item.owner.cid == cid or item.target.cid == cid then M.confirmations[key] = nil end
    end
    if src then M.sourceCid[tonumber(src)] = cid end
end
function M.simChanged(src, cid, deviceId, oldSimId, oldSimCid)
    bump(cid)
    M.confirmations = M.confirmations or {}
    for key, item in pairs(M.confirmations) do if item.owner.cid == cid then M.confirmations[key] = nil end end
    if deviceId then M.revokeDevice(deviceId, cid) end
    if oldSimId then M.revokeRecipientSim(oldSimCid or cid, oldSimId) end
    M.sourceCid[tonumber(src)] = cid
end
function M.deviceSelected(src, cid, oldDeviceId, newDeviceId, oldSimId, oldSimCid)
    if oldDeviceId == newDeviceId then return end
    bump(cid)
    for key, item in pairs(M.confirmations) do if item.owner.cid == cid then M.confirmations[key] = nil end end
    if oldDeviceId then M.revokeDevice(oldDeviceId, cid) end
    if oldSimId then M.revokeRecipientSim(oldSimCid or cid, oldSimId) end
    M.sourceCid[tonumber(src)] = cid
end
function M.deviceTransferred(src, cid, deviceId, simId, simCid)
    bump(cid)
    for key, item in pairs(M.confirmations) do if item.owner.cid == cid then M.confirmations[key] = nil end end
    if deviceId then M.revokeDevice(deviceId, cid) end
    if simId then M.revokeRecipientSim(simCid or cid, simId) end
    M.sourceCid[tonumber(src)] = cid
end
function M.characterChanged(src, cid)
    bump(cid)
    for key, item in pairs(M.confirmations) do if item.owner.cid == cid or item.target.cid == cid then M.confirmations[key] = nil end end
    removeRows('SELECT share_id FROM peak_phone_location_shares WHERE owner_cid=? OR target_cid=?',
        'DELETE FROM peak_phone_location_shares WHERE owner_cid=? OR target_cid=?', { cid, cid })
    if src then M.sourceCid[tonumber(src)] = nil end
end

Peak.Functions.CreateCallback('peak-phone:Server:FindMy:GetState', function(src, cb)
    local ok, result = pcall(getState, src)
    if not ok then
        print('[Peak Duo] Find My state failed: ' .. tostring(result))
        return cb(fail('Live location sharing is temporarily unavailable.'))
    end
    cb(result)
end)
Peak.Functions.CreateCallback('peak-phone:Server:FindMy:GetShareContacts', function(src, cb)
    local ok, result = pcall(getShareContacts, src)
    if not ok then print('[Peak Duo] Find My contact list failed: ' .. tostring(result));return cb(fail('Saved contacts are temporarily unavailable.')) end
    cb(result)
end)
Peak.Functions.CreateCallback('peak-phone:Server:FindMy:ResolveRecipient', function(src, cb, data)
    local ok, result = pcall(resolve, src, data)
    if not ok then print('[Peak Duo] Find My recipient resolution failed: ' .. tostring(result));return cb(fail('The saved recipient could not be verified.')) end
    cb(result)
end)
Peak.Functions.CreateCallback('peak-phone:Server:FindMy:StartSharing', function(src, cb, data)
    local ok, result = pcall(start, src, data)
    if not ok then print('[Peak Duo] Find My start failed: ' .. tostring(result));return cb(fail('Live sharing could not be started.')) end
    cb(result)
end)
Peak.Functions.CreateCallback('peak-phone:Server:FindMy:StopSharing', function(src, cb, data)
    local ok, result = pcall(revoke, src, data)
    if not ok then print('[Peak Duo] Find My stop failed: ' .. tostring(result));return cb(fail('The share could not be stopped.')) end
    cb(result)
end)

Phone.NativeAddEventHandler('peak-phone:portable:logout', function()
    local src = tonumber(source)
    local cid = src and M.sourceCid[src]
    if cid then M.characterChanged(src, cid) end
end)
Phone.NativeAddEventHandler('playerDropped', function()
    local src = tonumber(source)
    if src then M.sourceCid[src] = nil end -- durable consent resumes only for the same bound character/SIM.
end)
CreateThread(function()
    while true do
        Wait(15000)
        local ok, err = pcall(expiryCleanup)
        if not ok then print('[Peak Duo] Find My expiry cleanup failed: ' .. tostring(err)) end
        for token, confirmation in pairs(M.confirmations) do if confirmation.expires <= now() then M.confirmations[token] = nil end end
    end
end)
CreateThread(function()
    while true do
        Wait(3000)
        for _, value in ipairs(GetPlayers()) do
            local src = tonumber(value)
            local previous, current = src and M.sourceCid[src], src and currentCid(src)
            if previous and current and previous ~= current then
                local ok, err = pcall(M.characterChanged, src, previous)
                if not ok then print('[Peak Duo] Find My character cleanup failed: ' .. tostring(err)) end
            elseif src and current then M.sourceCid[src] = current end
        end
    end
end)
