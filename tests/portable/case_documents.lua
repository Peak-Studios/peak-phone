base('qbcore');addPlayer(1,'OWNER');addPlayer(2,'SHARE');addPlayer(3,'OTHER')

local documents,nextId = {},0
local writes,inserts,queries = 0,0,0
local writeMode,insertMode,queryMode,queryHook,afterWriteHook = nil,nil,nil,nil,nil
local activeCid = {[1]='OWNER',[2]='SHARE',[3]='OTHER'}
Phone.sameCharacter=function(src,expected)return activeCid[tonumber(src)]==expected end

local function document(id,owner,kind,title,content,finalized)
    return {id=id,citizenid=owner,type=kind,title=title,content=content,sharees={},signatures={},finalized=finalized or 0}
end
local function has(list,value)for _,item in ipairs(list or {}) do if item==value then return true end end;return false end
documents[1]=document(1,'OWNER',5,'Contract','<p>Fixture</p>',0);nextId=1
local function rowsForCharacter(owner)
    local count=0
    for _,row in pairs(documents) do if row.citizenid==owner then count=count+1 end end
    return count
end
local function assertDocLock(id)
    check(Phone.Locks['document:'..tostring(id)]==true,'row mutation must hold the canonical document lock')
end

function PhoneDB.query(sql,p)
    queries=queries+1
    if queryMode=='nil' then
        queryMode=nil
        if queryHook then local hook=queryHook;queryHook=nil;hook(sql,p,nil) end
        return nil
    end
    if queryMode=='throw' then
        queryMode=nil
        if queryHook then local hook=queryHook;queryHook=nil;hook(sql,p,nil) end
        error('synthetic query failure')
    end
    local result={}
    if sql:find('COUNT(*) n',1,true) then result={{n=rowsForCharacter(p[1])}}
    elseif sql:find('GROUP BY type',1,true) then
        local grouped={}
        for _,row in pairs(documents) do
            if row.citizenid==p[1] or has(row.sharees,p[2]) then
                local kind=tonumber(row.type)
                if kind and kind>=0 and kind<=5 then
                    local item=grouped[kind] or {type=kind,total=0,upper_id=0}
                    item.total=item.total+1
                    item.upper_id=math.max(item.upper_id,tonumber(row.id) or 0)
                    grouped[kind]=item
                end
            end
        end
        for _,item in pairs(grouped) do result[#result+1]=item end
    elseif sql:find('ORDER BY id DESC LIMIT 50',1,true) and not sql:find('LIMIT 500',1,true) then
        local kind,upper,cursor,owner,viewer
        if sql:find('id<?',1,true) then kind,upper,cursor,owner,viewer=tonumber(p[1]),tonumber(p[2]),tonumber(p[3]),p[4],p[5]
        else kind,upper,owner,viewer=tonumber(p[1]),tonumber(p[2]),p[3],p[4] end
        local selected={}
        for _,row in pairs(documents) do
            local id=tonumber(row.id)
            if tonumber(row.type)==kind and id and id<=upper and (not cursor or id<cursor)
                and (row.citizenid==owner or has(row.sharees,viewer)) then selected[#selected+1]=row end
        end
        table.sort(selected,function(a,b)return tonumber(a.id)>tonumber(b.id) end)
        for index,row in ipairs(selected) do
            if index>50 then break end
            local encodedSignatures=json.encode(row.signatures or {})
            result[#result+1]={id=row.id,type=row.type,title=row.title,citizenid=row.citizenid,finalized=row.finalized,
                signatures=#encodedSignatures<=65536 and copy(row.signatures) or nil,
                signatures_bytes=#encodedSignatures,has_sharees=#(row.sharees or {})>0 and 1 or 0}
        end
    elseif sql:find('ORDER BY id DESC LIMIT 500',1,true) then
        for _,row in pairs(documents) do
            if tonumber(row.type)==tonumber(p[1]) and (row.citizenid==p[2] or has(row.sharees,p[3])) then result[#result+1]=copy(row) end
        end
    elseif sql:find('AS shared_with_character',1,true) then
        local row=documents[tonumber(p[2])]
        if row then
            local contentBytes=#tostring(row.content or '')
            local signaturesJson=json.encode(row.signatures or {})
            local shareesJson=json.encode(row.sharees or {})
            result[1]={id=row.id,type=row.type,title=row.title,citizenid=row.citizenid,finalized=row.finalized,
                content=contentBytes<=100000 and row.content or nil,content_bytes=contentBytes,
                signatures=#signaturesJson<=65536 and copy(row.signatures) or nil,signatures_bytes=#signaturesJson,
                sharees=#shareesJson<=16384 and copy(row.sharees) or nil,sharees_bytes=#shareesJson,
                shared_with_character=has(row.sharees,p[1]) and 1 or 0}
        end
    elseif sql:find('FROM phone_documents WHERE id=?',1,true) then
        local row=documents[tonumber(p[1])]
        if row then result[1]=copy(row) end
    else
        error('Unexpected document query: '..sql)
    end
    if queryHook then local hook=queryHook;queryHook=nil;hook(sql,p,result) end
    return result
end

local function checkLockForWrite(sql,p)
    local id
    if sql:find('SET title=',1,true) then id=p[3]
    elseif sql:find('SET sharees=',1,true) or sql:find('SET signatures=',1,true) then id=p[2]
    else id=p[1] end
    assertDocLock(id)
end

function PhoneDB.update(sql,p)
    writes=writes+1
    checkLockForWrite(sql,p)
    local mode=writeMode;writeMode=nil
    if mode=='throw-before' then error('synthetic storage error before write') end
    if mode=='zero' then return 0 end
    local id,affected
    if sql:find('SET title=',1,true) then
        id=tonumber(p[3]);local row=documents[id]
        if row and (row.title~=p[1] or row.content~=p[2]) then row.title=p[1];row.content=p[2];affected=1 else affected=0 end
    elseif sql:find('SET finalized=1',1,true) then
        id=tonumber(p[1]);local row=documents[id]
        if row and tonumber(row.finalized)~=1 then row.finalized=1;affected=1 else affected=0 end
    elseif sql:find('SET signatures=?',1,true) then
        id=tonumber(p[2]);local row=documents[id]
        if row then row.signatures=Phone.decode(p[1],{});affected=1 else affected=0 end
    elseif sql:find('SET sharees=?',1,true) then
        id=tonumber(p[2]);local row=documents[id]
        if row then row.sharees=Phone.decode(p[1],{});affected=1 else affected=0 end
    elseif sql:find('DELETE FROM phone_documents',1,true) then
        id=tonumber(p[1]);if documents[id] and documents[id].citizenid==p[2] then documents[id]=nil;affected=1 else affected=0 end
    else error('Unexpected document write: '..sql) end
    if afterWriteHook then local hook=afterWriteHook;afterWriteHook=nil;hook(sql,p) end
    if mode=='nil-after' then return nil end
    if mode=='throw-after' then error('synthetic storage error after write') end
    return affected
end

function PhoneDB.insert(sql,p)
    inserts=inserts+1
    if sql:find('INSERT INTO phone_documents',1,true) then
        check(Phone.Locks['document-create:'..tostring(p[1])]==true,'create must hold the per-character document lock')
    else error('Unexpected document insert: '..sql) end
    local mode=insertMode;insertMode=nil
    if mode=='throw-before' then error('synthetic insert failure before write') end
    if mode=='zero' then return 0 end
    nextId=nextId+1
    local row
    if #p==4 then row=document(nextId,p[1],p[2],p[3],p[4],0)
    else row={id=nextId,citizenid=p[1],type=p[2],title=p[3],content=p[4],signatures=Phone.decode(p[5],{}),sharees=Phone.decode(p[6],{}),finalized=p[7]} end
    documents[nextId]=row
    if mode=='persist-nil' or mode=='throw-after' then
        if mode=='throw-after' then error('synthetic insert acknowledgment lost after write') end
        return nil
    end
    if mode=='invalid-id' then return 0 end
    return nextId
end

loadrel('server/sv_document.lua')
local function r(name,src,data)return rpc('peak-phone:Server:Documents:'..name,src,data)end
local function fail(result,message)
    check(type(result)=='table' and result.Success==false,message or 'operation should fail')
end
local function eventCount(name)
    local count=0;for _,entry in ipairs(EMITTED) do if entry.name==name then count=count+1 end end;return count
end

-- Notes opts into a status envelope so a true empty result stays distinct
-- from a failed read. Existing consumers keep receiving the legacy row table.
local legacyDocuments=r('GetDocuments',1,{Type=5})
check(type(legacyDocuments)=='table' and legacyDocuments[1] and legacyDocuments[1].id==1,'legacy document reads keep their raw row shape')
eq(legacyDocuments.Success,nil,'legacy document reads do not gain an envelope')
local emptyNotes=r('GetDocuments',1,{Type=0,StatusEnvelope=true})
check(emptyNotes.Success==true and type(emptyNotes.Rows)=='table','a successful empty read has an explicit success envelope')
eq(#emptyNotes.Rows,0,'a successful empty read remains genuinely empty')
local expectedNotes=r('GetDocuments',1,{Type=0,StatusEnvelope=true,ExpectedCid='OWNER'})
check(expectedNotes.Success==true,'a Notes read accepts its current expected character ID')
local beforeStaleExpected=queries
activeCid[1]='OTHER'
local staleExpected=r('GetDocuments',1,{Type=0,StatusEnvelope=true,ExpectedCid='OWNER'})
eq(staleExpected.Success,false,'an old Notes view cannot read after the active character changes')
eq(staleExpected.Status,'identity','a stale expected character is an explicit identity denial')
eq(staleExpected.Rows,nil,'a stale expected character receives no rows')
eq(queries,beforeStaleExpected,'a stale expected character is denied before querying storage')
activeCid[1]='OWNER'
local invalidRead=r('GetDocuments',1,{Type=6,StatusEnvelope=true})
eq(invalidRead.Success,false,'invalid Notes category is reported as a failed read')
eq(invalidRead.Status,'invalid','invalid Notes category has an explicit status')
local queriesBeforeInvalidRead=queries
queryMode='nil'
local nilRead=r('GetDocuments',1,{Type=5,StatusEnvelope=true})
eq(nilRead.Success,false,'nil database result is not an empty Notes list')
eq(nilRead.Status,'unavailable','nil database result is classified as unavailable')
eq(nilRead.Rows,nil,'failed database result contains no rows')
queryMode='throw'
local throwingRead=r('GetDocuments',1,{Type=5,StatusEnvelope=true})
eq(throwingRead.Success,false,'throwing database query is not an empty Notes list')
eq(throwingRead.Status,'unavailable','throwing database query is classified as unavailable')
eq(queries,queriesBeforeInvalidRead+2,'unavailable reads still attempt exactly one query each')
queryHook=function(sql)if sql:find('ORDER BY id DESC LIMIT 500',1,true) then activeCid[1]='OTHER' end end
queryMode='nil'
local switchedNilRead=r('GetDocuments',1,{Type=5,StatusEnvelope=true,ExpectedCid='OWNER'})
eq(switchedNilRead.Success,false,'nil database result after a CID switch fails the Notes read')
eq(switchedNilRead.Status,'identity','CID switch takes precedence over classifying a nil query result')
eq(switchedNilRead.Rows,nil,'nil query result after a CID switch returns no rows')
activeCid[1]='OWNER'
queryHook=function(sql)if sql:find('ORDER BY id DESC LIMIT 500',1,true) then activeCid[1]='OTHER' end end
queryMode='throw'
local switchedThrowRead=r('GetDocuments',1,{Type=5,StatusEnvelope=true,ExpectedCid='OWNER'})
eq(switchedThrowRead.Success,false,'throwing database query after a CID switch fails the Notes read')
eq(switchedThrowRead.Status,'identity','CID switch takes precedence over classifying a thrown query')
eq(switchedThrowRead.Rows,nil,'thrown query after a CID switch returns no rows')
activeCid[1]='OWNER'
queryHook=function(sql)
    if sql:find('ORDER BY id DESC LIMIT 500',1,true) then activeCid[1]='OTHER' end
end
local switchedRead=r('GetDocuments',1,{Type=5,StatusEnvelope=true,ExpectedCid='OWNER'})
eq(switchedRead.Success,false,'identity change during the query fails the Notes read')
eq(switchedRead.Status,'identity','identity change during the query is explicit')
eq(switchedRead.Rows,nil,'rows from the previous character are never returned after a yielded identity change')
activeCid[1]='OWNER'

-- The native Notes catalog returns an exact count summary and bounded keyset
-- pages. The fixture executes the SQL scope/order/cursor/limit below instead
-- of manufacturing a pre-paginated response.
for index=1,501 do
    nextId=nextId+1
    local row=document(nextId,'SHARE',0,'Shared note '..index,string.rep('<p>private body</p>',300),0)
    row.sharees={'OWNER'}
    if index==501 then row.signatures={{Cid='OWNER',Signed='true',Name=string.rep('x',9000)},{Cid='SHARE',Signed=false}} end
    documents[nextId]=row
end
for index=1,50 do
    nextId=nextId+1
    documents[nextId]=document(nextId,'OWNER',1,'Exact page '..index,'<p>Exact-multiple fixture</p>',0)
end
nextId=nextId+1
local ownedShared=document(nextId,'OWNER',5,'Shared contract','<p>Owner body</p>',1)
ownedShared.sharees={'SHARE'}
ownedShared.signatures={{Cid='OWNER',Signed='true'},{Cid='SHARE',Signed=false}}
documents[nextId]=ownedShared
local summaryQueries=queries
local summary=r('GetNotesSummary',1,{ExpectedCid='OWNER'})
check(summary.Success==true and #summary.Types==6,'summary returns all six exact type counts')
eq(summary.Types[1].Type,0,'summary includes type zero')
eq(summary.Types[1].Count,501,'summary counts all shared rows, including rows after 500')
eq(summary.Types[1].UpperId,502,'summary upper ID bounds the type-zero catalog snapshot')
eq(summary.Types[2].Count,50,'summary reports the exact-multiple category count')
eq(summary.Types[6].Type,5,'summary includes the last type')
eq(summary.Types[6].Count,2,'summary includes the existing and owner-shared contracts')
eq(queries,summaryQueries+1,'summary uses one grouped query')
nextId=nextId+1
local insertedAfterSummary=document(nextId,'SHARE',0,'After snapshot','<p>Must not shift the catalog cursor</p>',0)
insertedAfterSummary.sharees={'OWNER'}
documents[nextId]=insertedAfterSummary
local firstPage=r('GetNotesMetadataPage',1,{ExpectedCid='OWNER',Type=0,UpperId=summary.Types[1].UpperId})
check(firstPage.Success==true and #firstPage.Rows==50 and firstPage.Done==false,'metadata page returns at most 50 authorized rows')
eq(firstPage.Rows[1].id,summary.Types[1].UpperId,'metadata page is sorted by descending ID')
eq(firstPage.Rows[1].signatureCount,2,'metadata preserves signature total')
eq(firstPage.Rows[1].signedCount,1,'metadata preserves legacy string-true signature state')
check(#json.encode(documents[firstPage.Rows[1].id].signatures)>8192 and #json.encode(documents[firstPage.Rows[1].id].signatures)<=65536,'signature regression fixture lies between the former and supported projection limits')
check(firstPage.Rows[1].shared==true,'shared-to-current metadata is labeled shared')
eq(firstPage.Rows[1].content,nil,'metadata never returns note HTML')
eq(firstPage.Rows[1].sharees,nil,'metadata never returns a sharee array')
eq(firstPage.Rows[1].signatures,nil,'metadata never returns a signatures array')
eq(firstPage.NextCursor,firstPage.Rows[#firstPage.Rows].id,'page cursor is the final returned ID')
local secondPage=r('GetNotesMetadataPage',1,{ExpectedCid='OWNER',Type=0,UpperId=summary.Types[1].UpperId,Cursor=firstPage.NextCursor})
check(secondPage.Success==true and #secondPage.Rows==50,'second metadata page advances by cursor')
check(secondPage.Rows[1].id<firstPage.NextCursor,'second page contains strictly older IDs')
for index=2,#secondPage.Rows do check(secondPage.Rows[index-1].id>secondPage.Rows[index].id,'each page is strictly descending') end
local allSeen,allRows={},{}
local function addPageRows(rows)
    for _,row in ipairs(rows) do
        check(not allSeen[row.id],'keyset pages never repeat a canonical ID')
        allSeen[row.id]=true
        allRows[#allRows+1]=row
    end
end
addPageRows(firstPage.Rows)
local cursor,done=firstPage.NextCursor,firstPage.Done
while not done do
    local page=r('GetNotesMetadataPage',1,{ExpectedCid='OWNER',Type=0,UpperId=summary.Types[1].UpperId,Cursor=cursor})
    check(page.Success==true,'deep shared-note keyset page succeeds')
    addPageRows(page.Rows)
    cursor,done=page.NextCursor,page.Done
end
eq(#allRows,501,'keyset traversal reaches every pre-summary shared note')
eq(allRows[#allRows].id,2,'deepest shared-note page reaches the oldest canonical ID')
check(not allSeen[insertedAfterSummary.id],'post-summary inserts beyond UpperId cannot shift the captured result set')
for index=2,#allRows do check(allRows[index-1].id>allRows[index].id,'the complete catalog traversal stays globally descending') end
documents[2]=nil
local afterDeleteSeen,afterDeleteCount={},0
local deleteCursor,deleteDone=nil,false
while not deleteDone do
    local page=r('GetNotesMetadataPage',1,{ExpectedCid='OWNER',Type=0,UpperId=summary.Types[1].UpperId,Cursor=deleteCursor})
    check(page.Success==true,'a deletion during the captured keyset window remains readable')
    for _,row in ipairs(page.Rows) do
        check(not afterDeleteSeen[row.id],'deletion during traversal does not duplicate later IDs')
        afterDeleteSeen[row.id]=true;afterDeleteCount=afterDeleteCount+1
    end
    deleteCursor,deleteDone=page.NextCursor,page.Done
end
eq(afterDeleteCount,500,'a deleted old row creates only a stable hole in the captured result set')
check(not afterDeleteSeen[2] and not afterDeleteSeen[insertedAfterSummary.id],'deleted and post-summary IDs are both absent from the retraversal')
local exactFirst=r('GetNotesMetadataPage',1,{ExpectedCid='OWNER',Type=1,UpperId=summary.Types[2].UpperId})
check(exactFirst.Success==true and #exactFirst.Rows==50 and exactFirst.Done==false,'an exact-multiple page keeps its continuation cursor')
local exactFinal=r('GetNotesMetadataPage',1,{ExpectedCid='OWNER',Type=1,UpperId=summary.Types[2].UpperId,Cursor=exactFirst.NextCursor})
check(exactFinal.Success==true and #exactFinal.Rows==0 and exactFinal.Done==true and exactFinal.NextCursor==nil,'an exact-multiple traversal ends with a truthful empty page')
local ownSharedPage=r('GetNotesMetadataPage',1,{ExpectedCid='OWNER',Type=5,UpperId=summary.Types[6].UpperId})
check(ownSharedPage.Success==true and ownSharedPage.Rows[1].shared==true,'owner documents with sharees keep their shared badge')
eq(ownSharedPage.Rows[1].signatureCount,2,'owned shared document retains signature total')
eq(ownSharedPage.Rows[1].signedCount,1,'owned shared document retains signed count')
local detail=r('GetNoteDetail',1,{ExpectedCid='OWNER',Id=firstPage.Rows[1].id})
check(detail.Success==true and detail.Row.content==documents[firstPage.Rows[1].id].content,'authorized detail returns full content on demand')
local missingDetail=r('GetNoteDetail',1,{ExpectedCid='OWNER',Id=2147483647})
eq(missingDetail.Status,'missing','a missing detail row has an explicit status')
local deniedId=firstPage.Rows[1].id
documents[deniedId].sharees={}
eq(r('GetNoteDetail',1,{ExpectedCid='OWNER',Id=deniedId}).Status,'denied','revoked sharing blocks later detail access')
local beforeBadCursor=queries
eq(r('GetNotesMetadataPage',1,{ExpectedCid='OWNER',Type=0,UpperId=summary.Types[1].UpperId,Cursor=summary.Types[1].UpperId}).Status,'invalid','cursor at or above the upper ID is rejected')
eq(queries,beforeBadCursor,'invalid cursor is rejected before a database query')
local beforeMissingCid=queries
eq(r('GetNotesSummary',1,{}).Status,'identity','missing expected character ID fails closed')
eq(queries,beforeMissingCid,'missing expected CID does not query storage')
queryMode='nil'
eq(r('GetNotesSummary',1,{ExpectedCid='OWNER'}).Status,'unavailable','summary database failure is explicit')
queryHook=function(sql)if sql:find('GROUP BY type',1,true) then activeCid[1]='OTHER' end end
eq(r('GetNotesSummary',1,{ExpectedCid='OWNER'}).Status,'identity','summary rechecks character after its database query')
activeCid[1]='OWNER'
queryHook=function(sql)if sql:find('ORDER BY id DESC LIMIT 50',1,true) then activeCid[1]='OTHER' end end
eq(r('GetNotesMetadataPage',1,{ExpectedCid='OWNER',Type=0,UpperId=summary.Types[1].UpperId}).Status,'identity','metadata page rechecks character after its database query')
activeCid[1]='OWNER'
queryHook=function(sql,p)if sql:find('AS shared_with_character',1,true) and tonumber(p[2])==firstPage.Rows[2].id then activeCid[1]='OTHER' end end
eq(r('GetNoteDetail',1,{ExpectedCid='OWNER',Id=firstPage.Rows[2].id}).Status,'identity','detail rechecks character after its database query')
activeCid[1]='OWNER'
nextId=nextId+1
local oversizedSignatures=document(nextId,'OWNER',4,'Too many signatures','<p>Small body</p>',0)
oversizedSignatures.signatures={{Name=string.rep('x',66000)}}
documents[nextId]=oversizedSignatures
local oversizedPage=r('GetNotesMetadataPage',1,{ExpectedCid='OWNER',Type=4,UpperId=nextId})
eq(oversizedPage.Status,'invalid','oversized signature arrays fail clearly instead of producing truncated counts')
nextId=nextId+1
local oversizedDetail=document(nextId,'SHARE',0,'Large legacy body',string.rep('x',100001),0)
oversizedDetail.sharees={'OWNER'}
documents[nextId]=oversizedDetail
eq(r('GetNoteDetail',1,{ExpectedCid='OWNER',Id=nextId}).Status,'oversize','authorized oversized detail gets a clear response')
eq(r('GetNoteDetail',3,{ExpectedCid='OTHER',Id=nextId}).Status,'denied','oversized content does not bypass detail authorization')

-- Payloads are shape-checked before a field such as Type is read.
local beforeMalformedQueries=queries
eq(#r('GetDocuments',1,nil),0,'malformed get payload returns an empty list')
fail(r('SaveDocument',1,nil),'malformed save payload')
fail(r('Finalize',1,nil),'malformed finalize payload')
fail(r('AddSharee',1,nil),'malformed share payload')
eq(r('GetDocumentById',2,nil),nil,'malformed detail payload is denied')
eq(queries,beforeMalformedQueries,'malformed payloads do not query document storage')

-- Owner, share, character, and category checks all happen before a write.
eq(r('GetDocumentById',2,{Id=1}),nil,'uninvited recipient cannot read')
fail(r('SaveDocument',2,{Id=1,Type=5,Title='Stolen',Content='bad'}),'nonowner edit')
eq(writes,0,'nonowner edit does not write')
fail(r('SaveDocument',1,{Id=1,Type=0,Title='Wrong type',Content='bad'}),'existing type mismatch')
eq(documents[1].title,'Contract','mismatched type leaves row unchanged')

-- Equivalent numeric representations must all contend for the same row lock.
-- Exercise the real callback/event registrations with the fixture lock held so
-- a subtype-derived key cannot sneak through and write or emit an access effect.
local idForms={1,1.0,'1','1.0','1e0'}
check(math.type(idForms[1])=='integer' and math.type(idForms[2])=='float','fixture covers Lua integer and float ID values')
local function resetContract(finalized,sharees,signatures)
    local row=document(1,'OWNER',5,'Contract','<p>Fixture</p>',finalized or 0)
    row.sharees=copy(sharees or {})
    row.signatures=copy(signatures or {})
    documents[1]=row
end
local lockRoutes={
    {name='SaveDocument',run=function(id)return r('SaveDocument',1,{Id=id,Type=5,Title='Locked edit',Content='<p>Blocked</p>'})end},
    {name='Finalize',run=function(id)return r('Finalize',1,{Id=id})end},
    {name='RequestSignature',prepare=function()resetContract(1,{'SHARE'},{});check(r('AddSharee',1,{Id=1,Cid='SHARE'}).Success)end,
        run=function(id)return r('RequestSignature',1,{Id=id,Cid='SHARE'})end},
    {name='SignDocument',prepare=function()resetContract(1,{'SHARE'},{{Cid='SHARE',Signed=false}})end,
        run=function(id)return r('SignDocument',2,{Id=id})end},
    {name='AddSharee',run=function(id)return r('AddSharee',1,{Id=id,Cid='SHARE'})end},
    {name='ShareLocal',run=function(id)return r('ShareLocal',1,{Id=id})end},
    {name='AcceptShare',prepare=function()resetContract(0,{},{});check(r('AddSharee',1,{Id=1,Cid='SHARE'}).Success)end,
        run=function(id)event('peak-phone:Server:Documents:AcceptShare',2,{Id=id})end},
    {name='DeleteDocument',run=function(id)return r('DeleteDocument',1,{Id=id})end},
    {name='DropQRCode',run=function(id)return r('DropQRCode',1,{Id=id})end}
}
for _,route in ipairs(lockRoutes) do
    for index,idForm in ipairs(idForms) do
        resetContract(0,{}, {})
        if route.prepare then route.prepare() end
        local lockKey='document:1'
        local rowBefore=json.encode(documents[1])
        local writesBefore,eventsBefore,clockBefore=writes,#EMITTED,CLOCK
        Phone.Locks[lockKey]=true
        route.run(idForm)
        check(CLOCK>clockBefore,route.name..' representation '..index..' waited on the held canonical lock')
        eq(writes,writesBefore,route.name..' representation '..index..' makes no database write while locked')
        eq(#EMITTED,eventsBefore,route.name..' representation '..index..' emits no effect while locked')
        eq(documents[1] and json.encode(documents[1]),rowBefore,route.name..' representation '..index..' leaves the row unchanged')
        eq(Phone.Locks[lockKey],true,route.name..' representation '..index..' does not release another operation lock')
        Phone.Locks[lockKey]=nil
    end
end

-- After release, every accepted representation still addresses row 1.
resetContract(0,{}, {})
for index,idForm in ipairs(idForms) do
    local title='Canonical form '..index
    local result=r('SaveDocument',1,{Id=idForm,Type=5,Title=title,Content='<p>Fixture</p>'})
    check(result.Success and tonumber(result.Id)==1,'released ID form '..index..' updates the same row')
    eq(documents[1].title,title,'released ID form '..index..' persists to row 1')
end

-- QR deletion locks on the database-derived drop.Id, which can itself arrive
-- from the driver as a float even when the original request used an integer.
resetContract(0,{}, {})
documents[1].id=1.0
COORDS={[1]=vector3(0,0,0)}
check(r('DropQRCode',1,{Id='1.0'}).Success,'float database ID can be placed as a QR drop')
local dbFloatDropId
for key,value in pairs(r('GetDroppedNotes',1)) do if value.Id==1.0 then dbFloatDropId=key end end
check(dbFloatDropId~=nil,'float database ID remains in the drop fixture')
local qrEventsBefore=eventCount('peak-phone:Client:Documents:SetDrop')
local qrClockBefore=CLOCK
Phone.Locks['document:1']=true
event('peak-phone:Server:Documents:DeleteQRCode',1,dbFloatDropId)
check(CLOCK>qrClockBefore,'DeleteQRCode contends on the canonical key from floating row.id')
eq(eventCount('peak-phone:Client:Documents:SetDrop'),qrEventsBefore,'locked DeleteQRCode does not announce drop removal')
check(r('GetDroppedNotes',1)[dbFloatDropId]~=nil,'locked DeleteQRCode keeps the QR drop')
Phone.Locks['document:1']=nil
event('peak-phone:Server:Documents:DeleteQRCode',1,dbFloatDropId)
eq(r('GetDroppedNotes',1)[dbFloatDropId],nil,'released DeleteQRCode removes the QR drop')

-- Restore the original row for the remaining ownership and persistence cases.
documents[1]=document(1,'OWNER',5,'Contract','<p>Fixture</p>',0)

-- Public Note creation is limited to UI-supported types, but successful rows
-- are inserted under the character serialization key and return real IDs.
for _,kind in ipairs({0,2,5}) do
    local result=r('SaveDocument',1,{Type=kind,Title='Public '..kind,Content='<p>Stored</p>'})
    check(result.Success==true and result.Id>1,'supported type creates a note with an ID')
    eq(documents[result.Id].type,kind);eq(documents[result.Id].citizenid,'OWNER')
end
for _,kind in ipairs({1,3,4}) do
    local before=inserts
    fail(r('SaveDocument',1,{Type=kind,Title='Forbidden '..kind,Content='<p>Stored</p>'}),'public creation must reject protected type')
    eq(inserts,before,'protected creation makes no insert')
end
local beforeTrusted=inserts
for kind=0,5 do event('peak-phone:Server:Documents:AddDocument',0,'TRUSTED-'..kind,{Type=kind,Title='Trusted '..kind,Content='<p>Source integration</p>'}) end
eq(inserts,beforeTrusted+6,'trusted server integration keeps all six document categories')
for kind=0,5 do
    local found=false;for _,row in pairs(documents) do if row.citizenid=='TRUSTED-'..kind and row.type==kind then found=true end end
    check(found,'trusted AddDocument category '..kind..' remains supported')
end
event('peak-phone:Server:Documents:AddDocument',0,'TRUSTED-DEFAULT',{Title='Default type',Content='<p>Source integration</p>'})
local defaultFound=false;for _,row in pairs(documents) do if row.citizenid=='TRUSTED-DEFAULT' and row.type==0 then defaultFound=true end end
check(defaultFound,'trusted AddDocument retains its default Notes category')

-- Update success requires a matching persisted category and content. A true
-- no-op is safe after the authorized reread; failed writes are not successes.
local changed=r('SaveDocument',1,{Id=1,Type=5,Title='Revised contract',Content='<p>New wording</p>'})
check(changed.Success and changed.Id==1,'authorized update reports the existing ID')
local writesBeforeNoop=writes
check(r('SaveDocument',1,{Id=1,Type=5,Title='Revised contract',Content='<p>New wording</p>'}).Success,'verified unchanged update is a no-op success')
eq(writes,writesBeforeNoop,'unchanged update avoids a write')
writeMode='zero'
fail(r('SaveDocument',1,{Id=1,Type=5,Title='Unchanged by failed write',Content='<p>Still old</p>'}),'zero-row update without desired state is failure')
eq(documents[1].title,'Revised contract','failed update preserves the stored row')
writeMode='nil-after'
local beforeAmbiguous=writes
local uncertain=r('SaveDocument',1,{Id=1,Type=5,Title='May have persisted',Content='<p>Check Notes</p>'})
fail(uncertain,'nil write acknowledgment must remain uncertain')
check(uncertain.Msg:find('may have been saved',1,true)~=nil,'uncertain write tells the user to check before retrying')
eq(writes,beforeAmbiguous+1,'ambiguous update is never automatically retried')
eq(documents[1].title,'May have persisted','test models a write that committed before its acknowledgment was lost')
local beforeVerifiedNoop=writes
check(r('SaveDocument',1,{Id=1,Type=5,Title='May have persisted',Content='<p>Check Notes</p>'}).Success,'later explicit retry can verify the existing state as a no-op')
eq(writes,beforeVerifiedNoop,'verified no-op does not duplicate a write')

-- Byte limits use Lua string length, so multibyte titles are rejected before
-- hitting storage. Invalid insert results and missing count rows are failures.
fail(r('SaveDocument',1,{Type=0,Title=string.rep('界',51),Content='<p>Small</p>'}),'title limit is UTF-8 bytes')
local beforeInvalidInsert=inserts;insertMode='invalid-id'
fail(r('SaveDocument',1,{Type=0,Title='Invalid insert ID',Content='<p>No ack</p>'}),'invalid insert ID')
eq(inserts,beforeInvalidInsert+1)
insertMode='persist-nil'
local beforeNilInsert=inserts
local nilInsert=r('SaveDocument',1,{Type=0,Title='Insert ack lost',Content='<p>May exist</p>'})
fail(nilInsert,'missing insert ID is uncertain failure')
check(nilInsert.Msg:find('may have been saved',1,true)~=nil,'missing ID explains possible persistence')
eq(inserts,beforeNilInsert+1,'create without operation ID is not auto-retried or title-matched')
local uncertainCreateExists=false;for _,row in pairs(documents) do if row.title=='Insert ack lost' then uncertainCreateExists=true end end
check(uncertainCreateExists,'nil insert acknowledgment may leave a persisted row')
queryMode='nil';local beforeUnavailableInsert=inserts
fail(r('SaveDocument',1,{Type=0,Title='Count unavailable',Content='<p>Must not insert</p>'}),'nil count query is storage unavailable')
eq(inserts,beforeUnavailableInsert,'cannot create when the per-character count is unavailable')

-- Character transitions during yielded reads stop the write. A transition
-- immediately after an acknowledged write leaves an explicit uncertain result.
queryHook=function(sql)
    if sql:find('COUNT(*) n',1,true) then activeCid[1]='OTHER' end
end
local beforeLostCreate=inserts
fail(r('SaveDocument',1,{Type=0,Title='Character lost before create',Content='<p>Safe</p>'}),'character changed after count lookup')
eq(inserts,beforeLostCreate,'lost character before insert')
activeCid[1]='OWNER'
queryHook=function(sql,p)if sql:find('FROM phone_documents WHERE id=?',1,true) and tonumber(p[1])==1 then activeCid[1]='OTHER' end end
local beforeLostUpdate=writes
fail(r('SaveDocument',1,{Id=1,Type=5,Title='Lost identity update',Content='<p>Safe</p>'}),'character changed after row lookup')
eq(writes,beforeLostUpdate,'lost character before update')
activeCid[1]='OWNER'
afterWriteHook=function()activeCid[1]='OTHER'end
local lostAfterWrite=r('SaveDocument',1,{Id=1,Type=5,Title='Changed as identity switched',Content='<p>Persisted maybe</p>'})
fail(lostAfterWrite,'identity change after write does not report success')
check(lostAfterWrite.Msg:find('status is uncertain',1,true)~=nil,'post-write identity change reports uncertainty')
activeCid[1]='OWNER'

-- Sharing, finalizing, signatures, and delete use the same document lock and
-- never emit a successful access effect when persistence fails.
fail(r('RequestSignature',1,{Id=1,Cid='SHARE'}),'contract must be finalized and shared first')
fail(r('AddSharee',3,{Id=1,Cid='SHARE'}),'only owner can invite')
local beforeInvite=eventCount('peak-phone:Client:Notification')
check(r('AddSharee',1,{Id=1,Cid='SHARE'}).Success,'owner invites online character')
eq(eventCount('peak-phone:Client:Notification'),beforeInvite+1,'invite notification is sent')
local beforeForce=eventCount('peak-phone:Client:Documents:ForceDocument')
local beforeUpdateNotice=eventCount('peak-phone:Client:UpdateNotification')
writeMode='zero'
event('peak-phone:Server:Documents:AcceptShare',2,{Id=1})
eq(#documents[1].sharees,0,'failed acceptance does not persist or grant access')
eq(eventCount('peak-phone:Client:Documents:ForceDocument'),beforeForce,'failed acceptance sends no document')
eq(eventCount('peak-phone:Client:UpdateNotification'),beforeUpdateNotice,'failed acceptance does not announce success')
writeMode='nil-after'
event('peak-phone:Server:Documents:AcceptShare',2,{Id=1})
eq(eventCount('peak-phone:Client:Documents:ForceDocument'),beforeForce,'ambiguous share write grants no access')
eq(eventCount('peak-phone:Client:UpdateNotification'),beforeUpdateNotice,'ambiguous share does not announce success')
event('peak-phone:Server:Documents:AcceptShare',2,{Id=1})
check(r('GetDocumentById',2,{Id=1})~=nil,'a later explicit acceptance confirms the persisted share')
eq(eventCount('peak-phone:Client:Documents:ForceDocument'),beforeForce+1)
eq(eventCount('peak-phone:Client:UpdateNotification'),beforeUpdateNotice+1)

-- Temporary nearby views authorize the new detail endpoint only while the
-- server-side grant is live; they do not mutate the persistent share list.
local realOsTime=os.time
local tempNow=realOsTime()-1200
os.time=function()return tempNow end
COORDS={[1]=vector3(0,0,0),[2]=vector3(0,0,0),[3]=vector3(0,0,0)}
local temporaryShare=r('ShareLocal',1,{Id=1})
check(temporaryShare.Success and temporaryShare.Count==2,'local sharing creates nearby temporary invitations')
event('peak-phone:Server:Documents:AcceptShare',3,{Id=1})
check(r('GetNoteDetail',3,{ExpectedCid='OTHER',Id=1}).Success==true,'authorized nearby temporary view reads through the Notes detail endpoint')
eq(#documents[1].sharees,1,'temporary detail authorization does not persist another sharee')
tempNow=tempNow+601
eq(r('GetNoteDetail',3,{ExpectedCid='OTHER',Id=1}).Status,'denied','expired temporary view is denied by the Notes detail endpoint')
os.time=realOsTime

fail(r('Finalize',2,{Id=1}),'recipient cannot finalize')
writeMode='zero'
fail(r('Finalize',1,{Id=1}),'failed finalize is not success')
eq(documents[1].finalized,0,'failed finalize leaves the contract editable')
check(r('Finalize',1,{Id=1}).Success,'confirmed finalization succeeds')
eq(documents[1].finalized,1)
local beforeFinalizedNoop=writes
check(r('Finalize',1,{Id=1}).Success,'already-finalized contract is an authorized no-op')
eq(writes,beforeFinalizedNoop)

writeMode='zero'
fail(r('RequestSignature',1,{Id=1,Cid='SHARE'}),'failed signature request write')
eq(#documents[1].signatures,0,'failed request does not add a signature')
check(r('RequestSignature',1,{Id=1,Cid='SHARE'}).Success,'persisted signature request succeeds')
local beforeDuplicateRequest=writes
fail(r('RequestSignature',1,{Id=1,Cid='SHARE'}),'duplicate signature request is rejected')
eq(writes,beforeDuplicateRequest)
fail(r('SignDocument',3,{Id=1}),'uninvited character cannot sign')
writeMode='zero'
fail(r('SignDocument',2,{Id=1}),'failed signature write')
check(documents[1].signatures[1].Signed==false,'failed signing does not persist the signature')
check(r('SignDocument',2,{Id=1}).Success,'persisted signature succeeds')
local beforeSignedNoop=writes
check(r('SignDocument',2,{Id=1}).Success,'already-signed document is a verified no-op')
eq(writes,beforeSignedNoop)

-- QR drops are removed only after the owned database row is confirmed gone.
COORDS={[1]=vector3(0,0,0),[2]=vector3(0,0,0),[3]=vector3(100,0,0)}
check(r('DropQRCode',1,{Id=1}).Success,'owner can place a QR drop')
local drops=r('GetDroppedNotes',1);local dropId
for key,value in pairs(drops) do if value.Id==1 then dropId=key end end
check(dropId~=nil,'created drop is visible')
eq(r('GetDocumentById',3,{Id=1}),nil,'far-away note does not grant read')
eq(r('GetNoteDetail',3,{ExpectedCid='OTHER',Id=1}).Status,'denied','far-away note does not grant Notes detail access')
BUCKETS={[3]=2};COORDS[3]=vector3(0,0,0)
eq(r('GetDocumentById',3,{Id=1}),nil,'cross-bucket note does not grant read')
eq(r('GetNoteDetail',3,{ExpectedCid='OTHER',Id=1}).Status,'denied','cross-bucket drop does not grant Notes detail access')
BUCKETS[3]=nil
check(r('GetNoteDetail',2,{ExpectedCid='SHARE',Id=1}).Success==true,'same-bucket permanent share still reads through Notes detail')
writeMode='zero'
fail(r('DeleteDocument',1,{Id=1}),'failed delete is not success')
check(r('GetDroppedNotes',1)[dropId]~=nil,'failed delete keeps the QR drop visible')
check(r('GetDocumentById',2,{Id=1})~=nil,'failed delete keeps the invited reader access intact')
check(r('DeleteDocument',3,{Id=1}).Success==false,'nonowner cannot delete')
check(r('DeleteDocument',1,{Id=1}).Success,'confirmed delete succeeds')
eq(r('GetDocumentById',2,{Id=1}),nil,'deleted document is no longer available')
eq(r('GetDroppedNotes',1)[dropId],nil,'confirmed deletion removes the QR drop')

-- A trusted write failure remains silent and never advertises a fabricated ID.
insertMode='throw-before'
local beforeTrustedFailure=inserts
event('peak-phone:Server:Documents:AddDocument',0,'TRUSTED-FAIL',{Type=3,Title='Failed trusted insert',Content='<p>Storage error</p>'})
eq(inserts,beforeTrustedFailure+1)
local trustedFailed=false;for _,row in pairs(documents) do if row.citizenid=='TRUSTED-FAIL' then trustedFailed=true end end
check(not trustedFailed,'trusted AddDocument failure does not create an in-memory row')

check(true,'document persistence failure, type, ownership, sharing, and mutation checks completed')
