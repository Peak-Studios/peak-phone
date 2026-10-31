-- Character-scoped documents, explicit invitations, immutable finalized content.
local drops, invites, views, nextDrop = {}, {}, {}, 0
local maxDocumentId = 2147483647
local createTypes = {[0]=true,[2]=true,[5]=true}
local storageUnavailable = 'Notes storage is unavailable. Your draft remains here; try again when storage is available.'
local storageUncertain = 'The server could not confirm this document change. It may have been saved. Keep your draft and check Notes before trying again.'
local writeFailed = 'The document was not changed. Your draft remains here; try again when storage is available.'

local function cid(src)
    local player = Peak.Functions.GetPlayer(src)
    return player and player.PlayerData and player.PlayerData.citizenid or nil
end

local function decode(row)
    if row then
        row.sharees = Phone.decode(row.sharees,{})
        row.signatures = Phone.decode(row.signatures,{})
    end
    return row
end

local function canonicalId(value)
    local id = Phone.number(value,maxDocumentId)
    return id and math.tointeger(id) or nil
end

local function validId(data)
    if type(data) ~= 'table' then return nil end
    return canonicalId(data.Id)
end

local function documentKey(id)
    local canonical = canonicalId(id)
    return canonical and ('document:' .. tostring(canonical)) or nil
end

local function creationKey(id)
    return 'document-create:' .. tostring(id)
end

-- Keep an explicit success/missing/error distinction. PhoneDB.one() collapses
-- an empty result and a nil driver result into the same value.
local function readDocument(id)
    local rows = PhoneDB.query('SELECT * FROM phone_documents WHERE id=?',{id})
    if type(rows) ~= 'table' then return false,nil end
    if type(rows[1]) ~= 'table' then return true,nil end
    return true,decode(rows[1])
end

local function isInteger(value)
    return type(value) == 'number' and value == value and value >= 0 and value % 1 == 0
end

local function contains(list,id)
    for _,value in ipairs(list or {}) do if value == id then return true end end
    return false
end

local function near(src,coords,bucket,range)
    local ped = GetPlayerPed(src)
    return ped ~= 0 and GetPlayerRoutingBucket(src) == bucket and #(GetEntityCoords(ped)-coords) <= range
end

local function canRead(src,row,id)
    if not row or not id then return false end
    if row.citizenid == id or contains(row.sharees,id) then return true end
    if views[id..':'..row.id] and views[id..':'..row.id] > os.time() then return true end
    for _,drop in pairs(drops) do
        if drop.Id == row.id and near(src,drop.Coords,drop.Bucket,3.0) then return true end
    end
    return false
end

local function errorResult(message)
    return Phone.publicError(message or 'Document unavailable or permission denied.')
end

local function register(name,fn)
    Peak.Functions.CreateCallback('peak-phone:Server:Documents:'..name,fn)
end

local function locked(keys,fn)
    local ok,result = pcall(Phone.withLocks,keys,fn)
    if ok then return result end
    return nil
end

local function lockedCallback(cb,keys,fn)
    local result = locked(keys,fn)
    if type(result) ~= 'table' then result = errorResult(storageUncertain) end
    cb(result)
end

local function lockedDocument(src,id,permissionMessage,authorize,fn)
    local character = cid(src)
    if not character or not Phone.sameCharacter(src,character) then return errorResult('Character changed. Reopen Notes and try again.') end
    local key = documentKey(id)
    if not key then return errorResult() end
    local result = locked({key},function()
        if not Phone.sameCharacter(src,character) then return errorResult('Character changed. Reopen Notes and try again.') end
        local readOk,row = readDocument(id)
        if not readOk then return errorResult(storageUnavailable) end
        if not row or not authorize(src,row,character) then return errorResult(permissionMessage) end
        if not Phone.sameCharacter(src,character) then return errorResult('Character changed. Reopen Notes and try again.') end
        return fn(character,row)
    end)
    return type(result) == 'table' and result or errorResult(storageUncertain)
end

-- A numeric driver acknowledgment followed by a read that proves the desired
-- state is required before a mutation is treated as complete. Nil/throwing
-- acknowledgments remain uncertain and must never trigger an automatic retry.
local function persistDocument(src,character,id,sql,params,verify,zeroMessage)
    if not Phone.sameCharacter(src,character) then return nil,errorResult('Character changed. The save status is uncertain; check Notes before retrying.') end
    local called,affected = pcall(PhoneDB.update,sql,params)
    if not called or not isInteger(affected) then return nil,errorResult(storageUncertain) end
    if not Phone.sameCharacter(src,character) then return nil,errorResult('Character changed. The save status is uncertain; check Notes before retrying.') end
    local readOk,row = readDocument(id)
    if not readOk then return nil,errorResult(storageUncertain) end
    if not Phone.sameCharacter(src,character) then return nil,errorResult('Character changed. The save status is uncertain; check Notes before retrying.') end
    if verify(row) then return row end
    if affected == 0 then return nil,errorResult(zeroMessage or writeFailed) end
    return nil,errorResult(storageUncertain)
end

-- Native Notes reads are deliberately separate from the legacy document API.
-- They return a bounded metadata catalogue and fetch HTML only after an
-- explicit detail request. JSON_CONTAINS remains part of the authorization
-- predicate and may scan rows; LIMIT bounds returned rows and transport only.
local notesPageLimit = 50
local notesMetadataByteLimit = 131072
local notesSignatureProjectionByteLimit = 65536
local notesDetailContentByteLimit = 100000
local notesDetailSignatureByteLimit = 65536
local notesDetailShareeByteLimit = 16384
local notesDetailSignatureLimit = 50
local notesDetailShareeLimit = 100
local notesDetailResponseByteLimit = 1000000

local function notesReadFailure(cb,status,message)
    cb({Success=false,Status=status,Message=message})
end

local function notesExpectedCharacter(src,data)
    if type(data) ~= 'table' then return nil,'invalid' end
    local expected = data.ExpectedCid
    if type(expected) ~= 'string' or #expected < 1 or #expected > 128 then return nil,'identity' end
    local character = cid(src)
    if not character or expected ~= character or not Phone.sameCharacter(src,character) then return nil,'identity' end
    return character
end

local function notesCharacterCurrent(src,character)
    return cid(src) == character and Phone.sameCharacter(src,character)
end

local function notesResponseFits(value,limit)
    local ok,encoded = pcall(json.encode,value)
    return ok and type(encoded) == 'string' and #encoded <= limit
end

local function notesSignatureCounts(value)
    local signatures = Phone.decode(value,{})
    local total,signed = 0,0
    if type(signatures) == 'table' then
        for _,signature in ipairs(signatures) do
            if type(signature) == 'table' then
                total = total + 1
                if signature.Signed == true or signature.Signed == 1 or signature.Signed == '1' or signature.Signed == 'true' then signed = signed + 1 end
            end
        end
    end
    return total,signed
end

register('GetNotesSummary',function(src,cb,data)
    local character,status = notesExpectedCharacter(src,data)
    if not character then return notesReadFailure(cb,status,'The active character could not be verified. Reopen Notes and try again.') end
    local called,rows = pcall(PhoneDB.query,
        'SELECT type,COUNT(*) AS total,MAX(id) AS upper_id FROM phone_documents WHERE (citizenid=? OR (JSON_VALID(sharees) AND JSON_CONTAINS(sharees,JSON_QUOTE(?)))) GROUP BY type',
        {character,character})
    if not notesCharacterCurrent(src,character) then
        return notesReadFailure(cb,'identity','Your character changed while Notes was loading. Reopen Notes to refresh it.')
    end
    if not called or type(rows) ~= 'table' then
        return notesReadFailure(cb,'unavailable','Notes storage is temporarily unavailable. Try again later.')
    end
    local types = {}
    for kind=0,5 do types[kind] = {Type=kind,Count=0,UpperId=0} end
    for _,row in ipairs(rows) do
        local kind = type(row) == 'table' and Phone.number(row.type,5,true) or nil
        local count = type(row) == 'table' and tonumber(row.total) or nil
        local upper = type(row) == 'table' and canonicalId(row.upper_id) or nil
        if not kind or not isInteger(count) or count < 0 or (count > 0 and (not upper or upper < 1)) then
            return notesReadFailure(cb,'invalid','Notes could not load safely. Reopen Notes and try again.')
        end
        types[kind] = {Type=kind,Count=count,UpperId=upper or 0}
    end
    local result = {Success=true,Types={}}
    for kind=0,5 do result.Types[#result.Types+1] = types[kind] end
    if not notesResponseFits(result,notesMetadataByteLimit) then
        return notesReadFailure(cb,'invalid','Notes could not load safely. Reopen Notes and try again.')
    end
    cb(result)
end)

register('GetNotesMetadataPage',function(src,cb,data)
    local character,status = notesExpectedCharacter(src,data)
    if not character then return notesReadFailure(cb,status,'The active character could not be verified. Reopen Notes and try again.') end
    local kind = Phone.number(data.Type,5,true)
    local upper = canonicalId(data.UpperId)
    local cursor = data.Cursor == nil and nil or canonicalId(data.Cursor)
    if not kind or not upper or upper < 1 or (data.Cursor ~= nil and (not cursor or cursor < 1 or cursor >= upper)) then
        return notesReadFailure(cb,'invalid','The requested Notes page is invalid. Refresh Notes and try again.')
    end

    local sql,params
    if cursor then
        sql = 'SELECT id,type,title,citizenid,finalized,CASE WHEN COALESCE(OCTET_LENGTH(signatures),0)<=65536 THEN signatures ELSE NULL END AS signatures,COALESCE(OCTET_LENGTH(signatures),0) AS signatures_bytes,CASE WHEN JSON_VALID(sharees) THEN CASE WHEN JSON_LENGTH(sharees)>0 THEN 1 ELSE 0 END ELSE 0 END AS has_sharees FROM phone_documents WHERE type=? AND id<=? AND id<? AND (citizenid=? OR (JSON_VALID(sharees) AND JSON_CONTAINS(sharees,JSON_QUOTE(?)))) ORDER BY id DESC LIMIT 50'
        params = {kind,upper,cursor,character,character}
    else
        sql = 'SELECT id,type,title,citizenid,finalized,CASE WHEN COALESCE(OCTET_LENGTH(signatures),0)<=65536 THEN signatures ELSE NULL END AS signatures,COALESCE(OCTET_LENGTH(signatures),0) AS signatures_bytes,CASE WHEN JSON_VALID(sharees) THEN CASE WHEN JSON_LENGTH(sharees)>0 THEN 1 ELSE 0 END ELSE 0 END AS has_sharees FROM phone_documents WHERE type=? AND id<=? AND (citizenid=? OR (JSON_VALID(sharees) AND JSON_CONTAINS(sharees,JSON_QUOTE(?)))) ORDER BY id DESC LIMIT 50'
        params = {kind,upper,character,character}
    end
    local called,rows = pcall(PhoneDB.query,sql,params)
    if not notesCharacterCurrent(src,character) then
        return notesReadFailure(cb,'identity','Your character changed while Notes was loading. Reopen Notes to refresh it.')
    end
    if not called or type(rows) ~= 'table' then
        return notesReadFailure(cb,'unavailable','Notes storage is temporarily unavailable. Try again later.')
    end
    if #rows > notesPageLimit then return notesReadFailure(cb,'invalid','Notes returned an oversized page. Refresh Notes and try again.') end
    local metadata,previousId = {},math.huge
    for _,row in ipairs(rows) do
        local id = type(row) == 'table' and canonicalId(row.id) or nil
        local rowType = type(row) == 'table' and Phone.number(row.type,5,true) or nil
        local title = type(row) == 'table' and row.title or nil
        local owner = type(row) == 'table' and row.citizenid or nil
        if not id or id < 1 or id > upper or id >= previousId or (cursor and id >= cursor)
            or rowType ~= kind or type(title) ~= 'string' or #title > 150
            or type(owner) ~= 'string' or #owner > 128 then
            return notesReadFailure(cb,'invalid','Notes returned invalid metadata. Refresh Notes and try again.')
        end
        previousId = id
        local signaturesBytes = tonumber(row.signatures_bytes)
        if not isInteger(signaturesBytes) or signaturesBytes > notesSignatureProjectionByteLimit then
            return notesReadFailure(cb,'invalid','This Notes page has signature metadata that is too large to summarize safely. Refresh Notes and try again.')
        end
        local signatureCount,signedCount = notesSignatureCounts(row.signatures)
        metadata[#metadata+1] = {
            id=id,type=rowType,title=title,citizenid=owner,
            finalized=tonumber(row.finalized) == 1,signatureCount=signatureCount,signedCount=signedCount,
            shared=owner ~= character or tonumber(row.has_sharees) == 1,
        }
    end
    local result = {Success=true,Type=kind,Rows=metadata,Done=#metadata < notesPageLimit,
        NextCursor=#metadata == notesPageLimit and metadata[#metadata].id or nil}
    if not notesResponseFits(result,notesMetadataByteLimit) then
        return notesReadFailure(cb,'invalid','This Notes page is too large to load safely. Refresh Notes and try again.')
    end
    cb(result)
end)

register('GetNoteDetail',function(src,cb,data)
    local character,status = notesExpectedCharacter(src,data)
    if not character then return notesReadFailure(cb,status,'The active character could not be verified. Reopen Notes and try again.') end
    local id = validId(data)
    if not id then return notesReadFailure(cb,'invalid','This note has an invalid ID. Refresh Notes and try again.') end
    local called,rows = pcall(PhoneDB.query,
        'SELECT id,type,title,citizenid,finalized,CASE WHEN COALESCE(OCTET_LENGTH(content),0)<=100000 THEN content ELSE NULL END AS content,COALESCE(OCTET_LENGTH(content),0) AS content_bytes,CASE WHEN COALESCE(OCTET_LENGTH(signatures),0)<=65536 THEN signatures ELSE NULL END AS signatures,COALESCE(OCTET_LENGTH(signatures),0) AS signatures_bytes,CASE WHEN COALESCE(OCTET_LENGTH(sharees),0)<=16384 THEN sharees ELSE NULL END AS sharees,COALESCE(OCTET_LENGTH(sharees),0) AS sharees_bytes,CASE WHEN JSON_VALID(sharees) AND JSON_CONTAINS(sharees,JSON_QUOTE(?)) THEN 1 ELSE 0 END AS shared_with_character FROM phone_documents WHERE id=?',
        {character,id})
    if not notesCharacterCurrent(src,character) then
        return notesReadFailure(cb,'identity','Your character changed while Notes was loading. Reopen Notes to refresh it.')
    end
    if not called or type(rows) ~= 'table' then
        return notesReadFailure(cb,'unavailable','Notes storage is temporarily unavailable. Try again later.')
    end
    local source = type(rows[1]) == 'table' and rows[1] or nil
    if not source then return notesReadFailure(cb,'missing','This note was deleted or is no longer available.') end
    local signaturesBytes,shareesBytes,contentBytes = tonumber(source.signatures_bytes),tonumber(source.sharees_bytes),tonumber(source.content_bytes)
    local row = {
        id=canonicalId(source.id),type=Phone.number(source.type,5,true),title=source.title,
        citizenid=source.citizenid,finalized=source.finalized,content=source.content,
        signatures={},sharees={},
    }
    if row.id ~= id or not row.type or type(row.title) ~= 'string' or type(row.citizenid) ~= 'string'
        or not isInteger(signaturesBytes) or not isInteger(shareesBytes) or not isInteger(contentBytes) then
        return notesReadFailure(cb,'invalid','This note could not be summarized safely. Refresh Notes and try again.')
    end
    if tonumber(source.shared_with_character) ~= 1 and not canRead(src,row,character) then
        return notesReadFailure(cb,'denied','You no longer have permission to open this note.')
    end
    if contentBytes > notesDetailContentByteLimit or signaturesBytes > notesDetailSignatureByteLimit
        or shareesBytes > notesDetailShareeByteLimit or type(row.content) ~= 'string' then
        return notesReadFailure(cb,'oversize','This note is too large to load safely. Your saved note remains unchanged.')
    end
    row.signatures = Phone.decode(source.signatures,{})
    row.sharees = Phone.decode(source.sharees,{})
    if type(row.signatures) ~= 'table' or type(row.sharees) ~= 'table'
        or #row.signatures > notesDetailSignatureLimit or #row.sharees > notesDetailShareeLimit then
        return notesReadFailure(cb,'oversize','This note is too large to load safely. Your saved note remains unchanged.')
    end
    local result = {Success=true,Row=row}
    if not notesResponseFits(result,notesDetailResponseByteLimit) then
        return notesReadFailure(cb,'oversize','This note is too large to load safely. Your saved note remains unchanged.')
    end
    cb(result)
end)

register('GetDocuments',function(src,cb,data)
    if type(data) ~= 'table' then return cb({}) end
    local statusEnvelope = data.StatusEnvelope == true
    local function readFailure(status,message)
        if statusEnvelope then return cb({Success=false,Status=status,Message=message}) end
        return cb({})
    end
    local character = cid(src)
    local kind = Phone.number(data.Type,5,true)
    if not kind then return readFailure('invalid','The requested Notes category is invalid.') end
    local expectedCid = data.ExpectedCid
    local expectedIdentityMatches = expectedCid == nil
        or (type(expectedCid) == 'string' and #expectedCid <= 128 and expectedCid == character)
    if not character or not Phone.sameCharacter(src,character) or not expectedIdentityMatches then
        return readFailure('identity','The active character could not be verified. Reopen Notes and try again.')
    end
    local called,rows = pcall(PhoneDB.query,
        'SELECT * FROM phone_documents WHERE type=? AND (citizenid=? OR (JSON_VALID(sharees) AND JSON_CONTAINS(sharees,JSON_QUOTE(?)))) ORDER BY id DESC LIMIT 500',
        {kind,character,character})
    if not Phone.sameCharacter(src,character) or (expectedCid ~= nil and cid(src) ~= expectedCid) then
        return readFailure('identity','Your character changed while Notes was loading. Reopen Notes to refresh it.')
    end
    if not called or type(rows) ~= 'table' then
        return readFailure('unavailable','Notes storage is temporarily unavailable. Try again later.')
    end
    for _,row in ipairs(rows) do decode(row) end
    if statusEnvelope then return cb({Success=true,Rows=rows}) end
    cb(rows)
end)

register('SaveDocument',function(src,cb,data)
    if type(data) ~= 'table' then return cb(errorResult('A valid note is required. Your draft remains here.')) end
    local character = cid(src)
    local kind = Phone.number(data.Type,5,true)
    local html = Phone.cleanHTML(data.Content)
    if not character or not kind or not Phone.text(data.Title,150) or not html then
        return cb(errorResult('A title of at most 150 bytes and valid note content are required. Your draft remains here.'))
    end

    if data.Id ~= nil then
        local id = validId(data)
        if not id then return cb(errorResult('This note has an invalid ID. Your draft remains here.')) end
        return lockedCallback(cb,{documentKey(id)},function()
            if not Phone.sameCharacter(src,character) then return errorResult('Character changed. Reopen Notes and try again.') end
            local readOk,row = readDocument(id)
            if not readOk then return errorResult(storageUnavailable) end
            if not row or row.citizenid ~= character or tonumber(row.finalized) == 1 then
                return errorResult('Only the owner can edit an unfinished document.')
            end
            if tonumber(row.type) ~= kind then return errorResult('This document category changed. Reload Notes before editing it.') end
            if not Phone.sameCharacter(src,character) then return errorResult('Character changed. Reopen Notes and try again.') end
            if row.title == data.Title and row.content == html then return {Success=true,Id=row.id} end
            local persisted,failure = persistDocument(src,character,id,
                'UPDATE phone_documents SET title=?,content=? WHERE id=? AND citizenid=? AND finalized=0 AND type=?',
                {data.Title,html,id,character,kind},
                function(current)
                    return current and Phone.number(current.id,maxDocumentId) == id and current.citizenid == character
                        and tonumber(current.type) == kind and tonumber(current.finalized) ~= 1
                        and current.title == data.Title and current.content == html
                end)
            if not persisted then return failure end
            return {Success=true,Id=persisted.id}
        end)
    end

    if not createTypes[kind] then return cb(errorResult('This document category cannot be created here.')) end
    return lockedCallback(cb,{creationKey(character)},function()
        if not Phone.sameCharacter(src,character) then return errorResult('Character changed. Reopen Notes and try again.') end
        local counts = PhoneDB.query('SELECT COUNT(*) n FROM phone_documents WHERE citizenid=?',{character})
        if type(counts) ~= 'table' or type(counts[1]) ~= 'table' then return errorResult(storageUnavailable) end
        local count = tonumber(counts[1].n)
        if not isInteger(count) then return errorResult(storageUnavailable) end
        if count >= 500 then return errorResult('Document limit reached.') end
        if not Phone.sameCharacter(src,character) then return errorResult('Character changed. Reopen Notes and try again.') end
        local called,inserted = pcall(PhoneDB.insert,
            "INSERT INTO phone_documents (citizenid,type,title,content,signatures,sharees,finalized) VALUES (?,?,?,?,'[]','[]',0)",
            {character,kind,data.Title,html})
        if not called or not Phone.sameCharacter(src,character) then return errorResult(storageUncertain) end
        local id = canonicalId(inserted)
        if not id or id < 1 then return errorResult(storageUncertain) end
        local readOk,row = readDocument(id)
        if not readOk or not row or row.citizenid ~= character or tonumber(row.type) ~= kind
            or tonumber(row.finalized) == 1 or row.title ~= data.Title or row.content ~= html
            or not Phone.sameCharacter(src,character) then
            return errorResult(storageUncertain)
        end
        return {Success=true,Id=id}
    end)
end)

register('GetDocumentById',function(src,cb,data)
    local id = validId(data)
    local character = cid(src)
    if not id or not character or not Phone.sameCharacter(src,character) then return cb(nil) end
    local called,readOk,row = pcall(readDocument,id)
    if not called or not readOk or not Phone.sameCharacter(src,character) then return cb(nil) end
    cb(canRead(src,row,character) and row or nil)
end)

register('GetDocumentSignatures',function(src,cb,data)
    local id = validId(data)
    local character = cid(src)
    if not id or not character or not Phone.sameCharacter(src,character) then return cb({}) end
    local called,readOk,row = pcall(readDocument,id)
    if not called or not readOk or not Phone.sameCharacter(src,character) or not canRead(src,row,character) then return cb({}) end
    cb(row.signatures)
end)

register('Finalize',function(src,cb,data)
    local id = validId(data)
    if not id then return cb(errorResult()) end
    local result = lockedDocument(src,id,'Only the owner can finalize this contract.',
        function(_,row,character) return row.citizenid == character and tonumber(row.type) == 5 end,
        function(character,row)
            if tonumber(row.type) ~= 5 then return errorResult('Only contracts can be finalized.') end
            if tonumber(row.finalized) == 1 then return {Success=true} end
            local persisted,failure = persistDocument(src,character,id,
                'UPDATE phone_documents SET finalized=1 WHERE id=? AND citizenid=? AND type=5 AND finalized=0',
                {id,character},function(current)
                    return current and current.citizenid == character and tonumber(current.type) == 5 and tonumber(current.finalized) == 1
                end)
            if not persisted then return failure end
            return {Success=true}
        end)
    cb(result)
end)

register('RequestSignature',function(src,cb,data)
    if type(data) ~= 'table' then return cb(errorResult()) end
    local id = validId(data)
    if not id or not Phone.text(data.Cid,128) then return cb(errorResult()) end
    local character = cid(src)
    if not character then return cb(errorResult('Character changed. Reopen Notes and try again.')) end
    local result = lockedDocument(src,id,'Share and finalize this contract before requesting a signature.',
        function(_,row,owner)
            return row.citizenid == owner and tonumber(row.finalized) == 1 and tonumber(row.type) == 5
                and (row.citizenid == data.Cid or contains(row.sharees,data.Cid))
        end,
        function(owner,row)
            if tonumber(row.type) ~= 5 or tonumber(row.finalized) ~= 1
                or not (row.citizenid == data.Cid or contains(row.sharees,data.Cid)) then
                return errorResult('Share and finalize this contract before requesting a signature.')
            end
            for _,signature in ipairs(row.signatures) do
                if signature.Cid == data.Cid then return errorResult('Signature already requested.') end
            end
            if #row.signatures >= 50 then return errorResult('Signature limit reached.') end
            if not Phone.sameCharacter(src,owner) then return errorResult('Character changed. Reopen Notes and try again.') end
            local name = Peak.Functions.GetPlayerCharName(data.Cid) or data.Cid
            row.signatures[#row.signatures+1] = {Cid=data.Cid,Name=name,Signed=false}
            local encoded = json.encode(row.signatures)
            local persisted,failure = persistDocument(src,owner,id,
                'UPDATE phone_documents SET signatures=? WHERE id=? AND citizenid=? AND type=5 AND finalized=1',
                {encoded,id,owner},function(current)
                    if not current or current.citizenid ~= owner or tonumber(current.type) ~= 5 or tonumber(current.finalized) ~= 1 then return false end
                    for _,signature in ipairs(current.signatures) do
                        if signature.Cid == data.Cid and signature.Name == name and signature.Signed == false then return true end
                    end
                    return false
                end)
            if not persisted then return failure end
            return {Success=true,Signatures=persisted.signatures}
        end)
    cb(result)
end)

register('SignDocument',function(src,cb,data)
    local id = validId(data)
    if not id then return cb(errorResult()) end
    local result = lockedDocument(src,id,'Document is not available for signing.',
        function(source,row,character) return canRead(source,row,character) and tonumber(row.finalized) == 1 end,
        function(character,row)
            if tonumber(row.finalized) ~= 1 then return errorResult('Document is not available for signing.') end
            local found
            for _,signature in ipairs(row.signatures) do
                if signature.Cid == character then
                    found = signature
                    if signature.Signed == true then return {Success=true,Signatures=row.signatures} end
                    signature.Signed = true
                    signature.Timestamp = os.time()*1000
                end
            end
            if not found then return errorResult('You were not invited to sign this document.') end
            if not Phone.sameCharacter(src,character) then return errorResult('Character changed. Reopen Notes and try again.') end
            local encoded = json.encode(row.signatures)
            local persisted,failure = persistDocument(src,character,id,
                'UPDATE phone_documents SET signatures=? WHERE id=? AND finalized=1',
                {encoded,id},function(current)
                    if not current or tonumber(current.finalized) ~= 1 then return false end
                    for _,signature in ipairs(current.signatures) do
                        if signature.Cid == character and signature.Signed == true then return true end
                    end
                    return false
                end)
            if not persisted then return failure end
            return {Success=true,Signatures=persisted.signatures}
        end)
    cb(result)
end)

local function invite(src,target,row,temporary)
    local targetId = cid(target)
    if not targetId or not Phone.sameCharacter(src,row.citizenid) or not Phone.sameCharacter(target,targetId) then return false end
    local key = targetId..':'..row.id
    invites[key] = {expires=os.time()+60,temporary=temporary,owner=row.citizenid}
    TriggerClientEvent('peak-phone:Client:Notification',target,'view-document-'..row.id,'fas fa-folder',{'white','transparent'},
        'View Document','A document is being shared with you.',false,true,'peak-phone:Server:Documents:AcceptShare','',{Id=row.id})
    return true
end

register('AddSharee',function(src,cb,data)
    if type(data) ~= 'table' then return cb(errorResult('Only the owner can share a document with an online character.')) end
    local id = validId(data)
    if not id or not Phone.text(data.Cid,128) then return cb(errorResult('Only the owner can share a document with an online character.')) end
    local result = lockedDocument(src,id,'Only the owner can share a document with an online character.',
        function(_,row,character) return row.citizenid == character end,
        function(character,row)
            local target = Peak.Functions.GetPlayerByCitizenId(data.Cid)
            local targetSource = target and (target.PlayerData and target.PlayerData.source or target.source)
            if not target or not targetSource or not Phone.sameCharacter(src,character) or not Phone.sameCharacter(targetSource,data.Cid) then
                return errorResult('Only the owner can share a document with an online character.')
            end
            if not invite(src,targetSource,row,false) then return errorResult('The character invitation could not be sent.') end
            return {Success=true}
        end)
    cb(result)
end)

register('ShareLocal',function(src,cb,data)
    if type(data) ~= 'table' then return cb(errorResult()) end
    local id = validId(data)
    if not id then return cb(errorResult()) end
    local result = lockedDocument(src,id,'Only the owner can share a document.',
        function(_,row,character) return row.citizenid == character end,
        function(character,row)
            local ped = GetPlayerPed(src)
            if ped == 0 then return errorResult() end
            local coords,bucket,count = GetEntityCoords(ped),GetPlayerRoutingBucket(src),0
            for _,value in ipairs(GetPlayers()) do
                local target = tonumber(value)
                if target ~= src and Phone.sameCharacter(src,character) and near(target,coords,bucket,3.0)
                    and invite(src,target,row,true) then count=count+1 end
            end
            return {Success=true,Count=count}
        end)
    cb(result)
end)

RegisterNetEvent('peak-phone:Server:Documents:AcceptShare',function(data)
    if type(data) ~= 'table' then return end
    local src = source
    local character = cid(src)
    local id = validId(data)
    if not character or not id or not Phone.sameCharacter(src,character) then return end
    local inviteKey = character..':'..id
    local invitation = invites[inviteKey]
    if not invitation or invitation.expires < os.time() then return end
    locked({documentKey(id)},function()
        if not Phone.sameCharacter(src,character) then return end
        local readOk,row = readDocument(id)
        if not readOk or not row or row.citizenid ~= invitation.owner or not Phone.sameCharacter(src,character) then return end
        if invitation.temporary then
            views[inviteKey] = os.time()+600
        elseif not contains(row.sharees,character) then
            if #row.sharees >= 100 or not Phone.sameCharacter(src,character) then return end
            row.sharees[#row.sharees+1] = character
            local encoded = json.encode(row.sharees)
            local persisted = persistDocument(src,character,id,
                'UPDATE phone_documents SET sharees=? WHERE id=? AND citizenid=?',
                {encoded,id,row.citizenid},function(current)
                    return current and current.citizenid == invitation.owner and contains(current.sharees,character)
                end)
            if not persisted then return end
            row = persisted
        end
        if not Phone.sameCharacter(src,character) then return end
        if invites[inviteKey] == invitation then invites[inviteKey] = nil end
        TriggerClientEvent('peak-phone:Client:Documents:ForceDocument',src,row)
        TriggerClientEvent('peak-phone:Client:UpdateNotification',src,'view-document-'..id,true,true,false,'Opening...',true)
    end)
end)

local function removeDrop(key)
    drops[key] = nil
    TriggerClientEvent('peak-phone:Client:Documents:SetDrop',-1,key,nil)
end

register('DeleteDocument',function(src,cb,data)
    local id = validId(data)
    if not id then return cb(errorResult()) end
    local result = lockedDocument(src,id,'Only the owner can delete this document.',
        function(_,row,character) return row.citizenid == character end,
        function(character,row)
            if not Phone.sameCharacter(src,character) then return errorResult('Character changed. Reopen Notes and try again.') end
            local called,affected = pcall(PhoneDB.update,'DELETE FROM phone_documents WHERE id=? AND citizenid=?',{id,character})
            if not called or not isInteger(affected) then return errorResult(storageUncertain) end
            if not Phone.sameCharacter(src,character) then return errorResult('Character changed. The delete status is uncertain; check Notes before retrying.') end
            local readOk,current = readDocument(id)
            if not readOk or not Phone.sameCharacter(src,character) then return errorResult(storageUncertain) end
            if current then
                if affected == 0 then return errorResult(writeFailed) end
                return errorResult(storageUncertain)
            end
            for key,drop in pairs(drops) do if drop.Id == row.id then removeDrop(key) end end
            return {Success=true}
        end)
    cb(result)
end)

register('GetDroppedNotes',function(src,cb)
    local visible = {}
    for key,drop in pairs(drops) do if drop.Bucket == GetPlayerRoutingBucket(src) then visible[key] = drop end end
    cb(visible)
end)

register('DropQRCode',function(src,cb,data)
    local id = validId(data)
    if not id then return cb(errorResult()) end
    local result = lockedDocument(src,id,'Only the owner can place a QR code for this document.',
        function(_,row,character) return row.citizenid == character end,
        function(character,row)
            local ped = GetPlayerPed(src)
            if ped == 0 then return errorResult() end
            if not Phone.sameCharacter(src,character) then return errorResult('Character changed. Reopen Notes and try again.') end
            local total,own = 0,0
            for _,drop in pairs(drops) do total=total+1;if drop.Owner == character then own=own+1 end end
            if total >= 100 or own >= 10 then return errorResult('Dropped-note limit reached.') end
            nextDrop = nextDrop+1
            drops[nextDrop] = {Id=row.id,Coords=GetEntityCoords(ped),Bucket=GetPlayerRoutingBucket(src),Owner=character}
            TriggerClientEvent('peak-phone:Client:Documents:SetDrop',-1,nextDrop,drops[nextDrop])
            return {Success=true}
        end)
    cb(result)
end)

RegisterNetEvent('peak-phone:Server:Documents:DeleteQRCode',function(dropId)
    local src = source
    local id = Phone.number(dropId,maxDocumentId)
    local drop = id and drops[id]
    local character = cid(src)
    if not drop or not character or drop.Owner ~= character or not Phone.sameCharacter(src,character) then return end
    local key = documentKey(drop.Id)
    if not key then return end
    locked({key},function()
        local current = drops[id]
        if current and current.Id == drop.Id and current.Owner == character and Phone.sameCharacter(src,character)
            and near(src,current.Coords,current.Bucket,3.0) then removeDrop(id) end
    end)
end)

-- Trusted server-resource integration only; the event gate rejects client-originated calls.
RegisterNetEvent('peak-phone:Server:Documents:AddDocument',function(id,data)
    if not Phone.text(id,128) or type(data) ~= 'table' or not Phone.text(data.Title,150) or not Phone.cleanHTML(data.Content) then return end
    local kind = (data.Type == nil or data.Type == false) and 0 or Phone.number(data.Type,5,true)
    if kind == nil then return end
    locked({creationKey(id)},function()
        pcall(PhoneDB.insert,
            'INSERT INTO phone_documents (citizenid,type,title,content,signatures,sharees,finalized) VALUES (?,?,?,?,?,?,?)',
            {id,kind,data.Title,data.Content,json.encode(data.Signatures or {}),json.encode(data.Sharees or {}),data.Finalized==1 and 1 or 0})
    end)
end)

CreateThread(function()
    while true do
        Wait(60000)
        local now = os.time()
        for key,value in pairs(invites) do if value.expires < now then invites[key]=nil end end
        for key,value in pairs(views) do if value < now then views[key]=nil end end
    end
end)
