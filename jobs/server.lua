-- Peak Phone contract engine. All money, membership, progress and definitions are server-owned.
Phone.Jobs={ready=false,definitions={},groups={},bySource={},offers={},cooldowns={},sequence=0}
local J,S,CFG=Phone.Jobs,Phone.JobSchema,PhoneConfig.Jobs
local function now() return GetGameTimer() end
local function failure(s) return Phone.publicError(s) end
local function count(t) local n=0;for _ in pairs(t) do n=n+1 end;return n end
local function identity(src)
    if type(src)~='number' or src<1 then return nil end
    local p=Phone.getPlayer(src);if not p then return nil end
    return {src=src,cid=p.PlayerData.citizenid,name=Phone.trim(p.PlayerData.charinfo.firstname..' '..p.PlayerData.charinfo.lastname),job=p.PlayerData.job}
end
local function still(m) return m and Phone.sameCharacter(m.src,m.cid) end
local function position(src)
    local p=GetPlayerPed(src);if not p or p==0 then return nil end
    return GetEntityCoords(p)
end
local function near(src,c,r)
    local p=position(src);return p and ((p.x-c.x)^2+(p.y-c.y)^2+(p.z-c.z)^2)<=r*r
end
local function healthy(src)
    local ped=GetPlayerPed(src);if not ped or ped==0 then return false end
    if GetEntityHealth and GetEntityHealth(ped)<=0 then return false end
    local raw=Phone.rawPlayer(src);local meta=raw and raw.PlayerData and raw.PlayerData.metadata
    if not meta and raw and raw.getMeta then local ok,v=pcall(raw.getMeta);if ok then meta=v end end
    meta=type(meta)=='table' and meta or {}
    return not meta.isdead and not meta.inlaststand and not meta.ishandcuffed
end
function J.admin(src)
    if src==0 then return true end
    if IsPlayerAceAllowed(src,CFG.AdminAce) or IsPlayerAceAllowed(src,'peak.phone.admin') then return true end
    return CFG.AllowFrameworkAdmins and PhonePeak.Functions.HasPermission(src,'admin')==true
end
local function allowed(m,d,bucket)
    if not still(m) or not Phone.hasPhone(m.src) or not healthy(m.src) or (bucket and GetPlayerRoutingBucket(m.src)~=bucket) then return false,'A member is unavailable or in a different instance.' end
    local p=Phone.getPlayer(m.src)
    if d.requiredJob~='' and (not p.PlayerData.job or p.PlayerData.job.name~=d.requiredJob) then return false,'This contract requires the '..d.requiredJob..' framework job.' end
    for _,r in ipairs(d.requirements) do
        local ok,n=pcall(function() return exports['peak-bridge']:GetItemCount(m.src,r.item) end)
        if not ok or (tonumber(n) or 0)<r.count then return false,'Required item: '..r.item..' × '..r.count end
    end
    return true
end
local function mine(src)
    local g=J.groups[J.bySource[src]];local m=g and g.members[src]
    if not g or not still(m) then return nil end
    return g,m
end
local function publicGroup(g)
    local members={};for _,m in pairs(g.members) do members[#members+1]={source=m.src,name=m.name,ready=m.ready==true,leader=m.src==g.leader} end
    table.sort(members,function(a,b)return a.source<b.source end)
    return {id=g.id,jobId=g.job.id,jobName=g.job.name,name=g.name,status=g.status,leader=g.leader,members=members,maxMembers=g.job.maxMembers,
        step=g.step or 0,stepCount=#g.job.steps,task=g.step and g.job.steps[g.step] or nil,
        remaining=g.deadline and math.max(0,math.floor((g.deadline-now())/1000)) or nil,
        vehicle=g.netId,reward=g.job.reward,account=g.job.account}
end
function J.state(src)
    local me=identity(src);if not me then return failure('Character not ready.') end
    local jobs,groups,offers={},{},{}
    for _,d in pairs(J.definitions) do
        if d.enabled then jobs[#jobs+1]={id=d.id,name=d.name,description=d.description,hub=d.hub,ped=d.ped,reward=d.reward,account=d.account,
            minMembers=d.minMembers,maxMembers=d.maxMembers,requiredJob=d.requiredJob,requirements=d.requirements,stepCount=#d.steps,timeoutMinutes=d.timeoutMinutes,vehicle=d.vehicle} end
    end
    table.sort(jobs,function(a,b)return a.name<b.name end)
    for _,g in pairs(J.groups) do if g.bucket==GetPlayerRoutingBucket(src) then groups[#groups+1]=publicGroup(g) end end
    table.sort(groups,function(a,b)return a.id<b.id end)
    for id,o in pairs(J.offers) do
        local g=J.groups[o.group]
        if o.expires>now() and g and still(o.from) and still(o.to) and o.to.cid==me.cid and o.to.src==src then
            offers[#offers+1]={id=id,kind=o.kind,from=o.from.name,group=g.name,job=g.job.name,remaining=math.floor((o.expires-now())/1000)}
        end
    end
    local own=mine(src)
    return {Success=true,ready=J.ready,admin=J.admin(src),source=src,jobs=jobs,groups=groups,offers=offers,group=own and publicGroup(own) or false}
end
local function push(g)
    for src,m in pairs(g.members) do if still(m) then TriggerClientEvent('peak-phone:Jobs:State',src,J.state(src)) end end
end
local function cleanup(g,reason)
    if not g then return end
    J.groups[g.id]=nil
    for id,o in pairs(J.offers) do if o.group==g.id then J.offers[id]=nil end end
    if g.vehicle and DoesEntityExist(g.vehicle) then
        if Phone.started('qbx_vehiclekeys') then for _,m in pairs(g.members) do if still(m) then pcall(function() exports.qbx_vehiclekeys:RemoveKeys(m.src,g.vehicle,true) end) end end end
        if type(PhoneJobVehicleCleanup)=='function' then pcall(PhoneJobVehicleCleanup,g.vehicle,g.netId,g.plate) end
        DeleteEntity(g.vehicle)
    end
    for src,m in pairs(g.members) do
        if J.bySource[src]==g.id then J.bySource[src]=nil end
        if still(m) then
            TriggerClientEvent('peak-phone:Jobs:Ended',src,{reason=reason or 'Contract closed'})
            Phone.notify(src,reason or 'Contract closed','inform')
        end
    end
end
local function audit(actor,job,action,rev,definition)
    return {query='INSERT INTO peak_phone_job_audit(job_id,actor,action,revision,definition,created_at) VALUES(?,?,?,?,?,?)',values={job,actor,action,rev,json.encode(definition),os.time()*1000}}
end
local function resetReady(g) for _,m in pairs(g.members) do m.ready=false end end
local function spawn(g)
    local v=g.job.vehicle;if not v then return true end
    -- Do not spawn on top of another vehicle. All entities are created/owned by the server.
    if GetAllVehicles then for _,e in ipairs(GetAllVehicles()) do
        if DoesEntityExist(e) and GetEntityRoutingBucket(e)==g.bucket then
            local p=GetEntityCoords(e);if (p.x-v.spawn.x)^2+(p.y-v.spawn.y)^2+(p.z-v.spawn.z)^2<16 then return false,'The job vehicle spawn is occupied.' end
        end
    end end
    local p=v.spawn;local entity=CreateVehicleServerSetter(GetHashKey(v.model),v.type,p.x,p.y,p.z,p.w)
    if not entity or entity==0 then return false,'The configured vehicle could not be spawned.' end
    g.vehicle=entity
    SetEntityRoutingBucket(entity,g.bucket)
    local untilAt=now()+4000
    while not DoesEntityExist(entity) and now()<untilAt do Wait(25) end
    if not DoesEntityExist(entity) then return false,'Vehicle creation timed out.' end
    if SetEntityOrphanMode then SetEntityOrphanMode(entity,2) end
    g.netId=NetworkGetNetworkIdFromEntity(entity)
    g.plate='PJ'..Phone.token():gsub('[^%w]',''):sub(-6):upper()
    SetVehicleNumberPlateText(entity,g.plate)
    -- Qbox has a documented entity-based server key API. Other key/fuel systems
    -- can be connected with the server-only setup/cleanup hooks in sv_config.lua.
    if Phone.started('qbx_vehiclekeys') then
        for _,m in pairs(g.members) do if still(m) then exports.qbx_vehiclekeys:GiveKeys(m.src,entity,true) end end
    end
    if type(PhoneJobVehicleSetup)=='function' then
        local members={};for _,m in pairs(g.members) do members[#members+1]=m.src end
        if PhoneJobVehicleSetup(entity,g.netId,g.plate,members)==false then return false,'The server vehicle integration rejected this job vehicle.' end
    end
    g.netId=NetworkGetNetworkIdFromEntity(entity)
    return true
end
local function start(g)
    if g.status~='lobby' or count(g.members)<g.job.minMembers then return failure('Not enough members.') end
    local current=J.definitions[g.job.id]
    if not current or not current.enabled then return failure('This job was disabled. Create a different group.') end
    if current.revision~=g.job.revision then return failure('The job was updated. Leave this lobby and create a new group.') end
    for _,m in pairs(g.members) do
        local ok,why=allowed(m,g.job,g.bucket);if not ok then return failure(why) end
        if not m.ready or not near(m.src,g.job.hub,CFG.CheckInRadius) then return failure('Every member must be ready and at the meeting point.') end
        if (J.cooldowns[m.cid] or 0)>now() then return failure('A member must wait before starting another contract.') end
    end
    g.status='starting'
    local ran,ok,why=pcall(spawn,g)
    if not ran then print('[peak-phone/jobs] Vehicle creation failed: '..tostring(ok));ok=false;why='Vehicle creation failed. Check the configured model and server artifact.' end
    if not ok then cleanup(g,why);return failure(why) end
    -- Entity creation may yield; do not start a run for a replaced/disconnected character.
    for _,m in pairs(g.members) do local valid=allowed(m,g.job,g.bucket);if not valid then cleanup(g,'A member became unavailable.');return failure('Group changed.') end end
    J.sequence=J.sequence+1;g.run=Phone.token()..'-'..J.sequence;g.status='active';g.step=1;g.ticket=nil;g.deadline=now()+g.job.timeoutMinutes*60000
    for _,m in pairs(g.members) do m.completed=0 end
    push(g);return {Success=true}
end
local function finish(g)
    g.status='finishing';g.ticket=nil
    local eligible={};local last=g.job.steps[#g.job.steps]
    for _,m in pairs(g.members) do
        local ok=allowed(m,g.job,g.bucket)
        if ok and near(m.src,last.coords,CFG.MemberFinishRadius) then eligible[#eligible+1]=m end
    end
    table.sort(eligible,function(a,b)return a.src<b.src end)
    local queries={};local stamp=os.time()*1000
    for i,m in ipairs(eligible) do
        m.operation=g.run..':'..i
        queries[#queries+1]={query='INSERT INTO peak_phone_job_rewards(operation_id,run_id,citizenid,job_id,amount,account,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',
            values={m.operation,g.run,m.cid,g.job.id,g.job.reward,g.job.account,'prepared',stamp,stamp}}
    end
    if #queries>0 and not PhoneDB.transaction(queries) then error('Reward journal could not be committed; no payment attempted.') end
    local review=false
    for _,m in ipairs(eligible) do
        local id=m.operation;J.cooldowns[m.cid]=now()+CFG.CooldownSeconds*1000
        local status='rejected'
        if still(m) and Phone.hasPhone(m.src) then
            -- Commit intent before invoking an external, non-transactional wallet.
            local moved=PhoneDB.update("UPDATE peak_phone_job_rewards SET status='applying',updated_at=? WHERE operation_id=? AND status='prepared'",{os.time()*1000,id})
            if moved~=1 then error('Reward already claimed or journal unavailable.') end
            if still(m) then
                local ok,paid=true,true
                if g.job.reward>0 then ok,paid=pcall(Phone.addMoney,m.src,g.job.account,g.job.reward,'peak-phone-job:'..id) end
                status=ok and paid==true and 'paid' or 'review'
            end
        end
        PhoneDB.update('UPDATE peak_phone_job_rewards SET status=?,updated_at=? WHERE operation_id=?',{status,os.time()*1000,id})
        if status=='review' then review=true end
        if still(m) then Phone.notify(m.src,status=='paid' and ('Contract reward: $'..g.job.reward..' ('..g.job.account..')') or 'Reward requires administrator review. Do not repeat the payment.','inform') end
    end
    cleanup(g,review and 'Contract completed; a payment needs review.' or 'Contract completed. Eligible members were paid.')
    return {Success=true}
end
local function save(src,data)
    if not J.admin(src) then return failure('Administrator access required.') end
    local actor=identity(src);if not actor then return failure('Character not ready.') end
    local d,why=S.validate(data.definition);if not d then return failure(why) end
    local previous=J.definitions[d.id];local expected=tonumber(data.revision)
    if not expected or expected%1~=0 or expected~=(previous and previous.revision or 0) then return failure('Revision conflict. Reload before editing; your draft was not saved.') end
    if not previous and count(J.definitions)>=CFG.MaxDefinitions then return failure('Job limit reached.') end
    d.revision=expected+1
    local queries={}
    if previous then
        queries[1]={query='UPDATE peak_phone_jobs SET definition=?,revision=?,updated_by=?,updated_at=? WHERE id=?',values={json.encode(d),d.revision,actor.cid,os.time()*1000,d.id}}
    else queries[1]={query='INSERT INTO peak_phone_jobs(id,definition,revision,updated_by,updated_at) VALUES(?,?,?,?,?)',values={d.id,json.encode(d),d.revision,actor.cid,os.time()*1000}} end
    queries[2]=audit(actor.cid,d.id,previous and 'update' or 'create',d.revision,d)
    if not still(actor) or not J.admin(src) then return failure('Permission or character changed.') end
    if not PhoneDB.transaction(queries) then return failure('Database rejected the change.') end
    J.definitions[d.id]=d
    TriggerClientEvent('peak-phone:Jobs:Refresh',-1)
    return {Success=true,definition=d}
end
local function action(src,data)
    if not J.ready or not CFG.Enabled then return failure('Job Center is not ready. Run phone_doctor.') end
    if type(data)~='table' or not Phone.text(data.action,30) then return failure('Invalid action.') end
    if not Phone.rate(src,'job-actions',8,3000) then return failure('Too many actions; try again shortly.') end
    local me=identity(src);if not me or not Phone.hasPhone(src) then return failure('Character or phone unavailable.') end
    if data.action=='save' then return save(src,data) end
    local g=mine(src)
    if data.action=='create' then
        if g or J.bySource[src] then return failure('Leave your current group first.') end
        local d=J.definitions[data.jobId];if not d or not d.enabled then return failure('Job unavailable.') end
        if count(J.groups)>=CFG.MaxGroups then return failure('There are too many active groups.') end
        if not Phone.text(data.name,45) then return failure('Give your group a name (1–45 characters).') end
        local ok,why=allowed(me,d);if not ok then return failure(why) end
        if not near(src,d.hub,CFG.CheckInRadius) then return failure('Go to the meeting point first.') end
        local id=Phone.token();g={id=id,name=Phone.trim(data.name),job=Phone.copy(d),leader=src,members={[src]=me},bucket=GetPlayerRoutingBucket(src),status='lobby'}
        J.groups[id]=g;J.bySource[src]=id;push(g)
    elseif data.action=='request' or data.action=='invite' then
        local target,group,kind
        if data.action=='request' then
            if g or J.bySource[src] then return failure('You are already in a group.') end
            group=J.groups[data.groupId];target=group and identity(group.leader);kind='request'
        else
            if not g or g.leader~=src then return failure('Only the group leader can invite.') end
            group=g;target=identity(Phone.number(data.target,65535));kind='invite'
        end
        if not target or target.src==src or not group or group.status~='lobby' or count(group.members)>=group.job.maxMembers then return failure('Player or lobby unavailable.') end
        if kind=='invite' and J.bySource[target.src] then return failure('That player already has a group.') end
        local ok,why=allowed(me,group.job,group.bucket);if not ok then return failure(why) end
        ok,why=allowed(target,group.job,group.bucket);if not ok then return failure(why) end
        if not near(src,group.job.hub,CFG.CheckInRadius) or not near(target.src,group.job.hub,CFG.CheckInRadius) then return failure('Both players must be at the meeting point.') end
        for _,o in pairs(J.offers) do if o.from.cid==me.cid and o.to.cid==target.cid and o.group==group.id and o.expires>now() then return failure('A request is already pending.') end end
        if count(J.offers)>=512 then return failure('Invitation queue full.') end
        local id=Phone.token();J.offers[id]={group=group.id,kind=kind,from=me,to=target,expires=now()+CFG.InvitationSeconds*1000}
        TriggerClientEvent('peak-phone:Jobs:Refresh',target.src);Phone.notify(target.src,me.name..' sent a Job Center '..kind..'.','inform')
    elseif data.action=='respond' then
        local o=J.offers[data.offerId]
        if not o or o.to.cid~=me.cid or o.to.src~=src or not still(o.from) or o.expires<=now() then return failure('Request expired or belongs to another character.') end
        J.offers[data.offerId]=nil
        if data.accept~=true then return {Success=true} end
        local group=J.groups[o.group];local newcomer=o.kind=='invite' and me or o.from
        if not group or group.status~='lobby' or (o.kind=='request' and group.leader~=src) or (o.kind=='invite' and group.leader~=o.from.src) or J.bySource[newcomer.src] or count(group.members)>=group.job.maxMembers then return failure('Group changed or is full.') end
        local ok,why=allowed(newcomer,group.job,group.bucket);if not ok then return failure(why) end
        if not near(newcomer.src,group.job.hub,CFG.CheckInRadius) then return failure('Player left the meeting point.') end
        group.members[newcomer.src]=newcomer;J.bySource[newcomer.src]=group.id;resetReady(group);push(group)
    elseif data.action=='leave' or data.action=='cancel' then
        if not g then return failure('You are not in a group.') end
        if data.action=='cancel' and g.leader~=src then return failure('Only the leader can cancel for everyone.') end
        if g.status~='lobby' or count(g.members)==1 or data.action=='cancel' then cleanup(g,'Contract cancelled; no reward paid.')
        else g.members[src]=nil;J.bySource[src]=nil;if g.leader==src then g.leader=next(g.members) end;resetReady(g);push(g);TriggerClientEvent('peak-phone:Jobs:Ended',src,{reason='You left the group.'}) end
    elseif data.action=='kick' or data.action=='promote' then
        local target=Phone.number(data.target,65535)
        if not g or g.status~='lobby' or g.leader~=src or not target or not g.members[target] or target==src then return failure('Leader action requires another lobby member.') end
        if data.action=='promote' then g.leader=target else g.members[target]=nil;J.bySource[target]=nil;TriggerClientEvent('peak-phone:Jobs:Ended',target,{reason='Removed from the lobby.'}) end
        resetReady(g);push(g)
    elseif data.action=='ready' then
        if not g or g.status~='lobby' then return failure('Join a lobby first.') end
        local ok,why=allowed(me,g.job,g.bucket);if not ok then return failure(why) end
        if not near(src,g.job.hub,CFG.CheckInRadius) then return failure('Go to the meeting point before readying.') end
        g.members[src].ready=data.ready==true;push(g)
    elseif data.action=='start' then
        if not g or g.leader~=src then return failure('Only the leader can start.') end
        return start(g)
    else return failure('Unsupported job action.') end
    return {Success=true}
end
local function taskAction(src,data)
    local g,m=mine(src)
    if type(data)~='table' or not g or g.status~='active' or data.run~=g.run or data.step~=g.step then return failure('This task is no longer active.') end
    local t=g.job.steps[g.step];local ok,why=allowed(m,g.job,g.bucket)
    if not ok then return failure(why) end
    if now()>g.deadline then cleanup(g,'Contract timed out.');return failure('Contract timed out.') end
    if not near(src,t.coords,t.radius) then return failure('Move closer to the task marker.') end
    if t.type=='drive' and (not g.vehicle or not DoesEntityExist(g.vehicle) or GetVehiclePedIsIn(GetPlayerPed(src),false)~=g.vehicle) then return failure('Use the assigned job vehicle.') end
    if data.action=='begin' then
        if g.ticket and g.ticket.expires>now() then return failure('Another member is already working on this step.') end
        g.ticket={id=Phone.token(),src=src,cid=m.cid,at=now(),expires=now()+(t.duration+CFG.TicketGraceSeconds)*1000}
        return {Success=true,token=g.ticket.id,duration=t.duration,task=t}
    end
    local ticket=g.ticket
    if not ticket or ticket.id~=data.token or ticket.src~=src or ticket.cid~=m.cid or ticket.expires<now() then return failure('Task ticket expired or is not yours.') end
    if data.action=='abort' then g.ticket=nil;return {Success=true} end
    if data.action~='finish' then return failure('Invalid task operation.') end
    if now()-ticket.at<t.duration*1000 then return failure('Task completed too quickly.') end
    -- Consume before any SQL/export call. A duplicate finish cannot pay or advance twice.
    g.ticket=nil;m.completed=m.completed+1
    if g.step==#g.job.steps then
        local success,result=pcall(finish,g)
        if not success then print('[peak-phone/jobs] Reward failure: '..tostring(result));cleanup(g,'Contract closed. Payment journal needs administrator review.');return failure('Payment requires administrator review; do not retry.') end
        return result
    end
    g.step=g.step+1;push(g);return {Success=true}
end
local function register(name,fn,lock)
    PhonePeak.Functions.CreateCallback('peak-phone:Jobs:'..name,function(src,cb,data)
        if not CFG.Enabled then return cb(failure('Job Center disabled.')) end
        if not Phone.hasPhone(src) then return cb(failure('Phone item required.')) end
        local result=lock and Phone.withLocks({'peak-phone-jobs'},function() return fn(src,data or {}) end) or fn(src,data or {})
        cb(result)
    end)
end
register('State',J.state)
register('Action',action,true)
register('Task',taskAction,true)
register('TaskState',function(src)
    local g=mine(src);return {Success=true,run=g and g.run,group=g and publicGroup(g) or false}
end)
register('Admin',function(src)
    if not J.admin(src) then return failure('Administrator access required.') end
    local definitions={};for _,d in pairs(J.definitions) do definitions[#definitions+1]=d end
    table.sort(definitions,function(a,b)return a.name<b.name end)
    return {Success=true,definitions=definitions,limits={maxReward=CFG.MaxRewardPerMember,maxSteps=CFG.MaxSteps,maxGroupSize=CFG.MaxGroupSize},
        audit=PhoneDB.query('SELECT job_id,actor,action,revision,created_at FROM peak_phone_job_audit ORDER BY id DESC LIMIT 40'),
        rewards=PhoneDB.query("SELECT operation_id,citizenid,job_id,amount,account,status,created_at FROM peak_phone_job_rewards WHERE status NOT IN ('paid','rejected') ORDER BY created_at DESC LIMIT 40")}
end)
-- Legacy phone read contract. Mutating peak-jobmanager events are deliberately NOT exposed.
PhonePeak.Functions.CreateCallback('peak-phone:Server:JobCenter:GetJobs',function(src,cb)
    local out={};for _,j in ipairs(J.state(src).jobs or {}) do out[#out+1]={JobId=j.id,JobName=j.name,Coords=j.hub,GroupSize=j.maxMembers,BasePayment=j.reward,VPNRequired=false,Icon='fas fa-briefcase'} end;cb(out)
end)
function CalculateSalaryRate() return 1 end
function GetJobGroupCount(id) local n=0;for _,g in pairs(J.groups) do if g.job.id==id then n=n+1 end end;return n end
exports('CalculateSalaryRate',CalculateSalaryRate);exports('GetJobGroupCount',GetJobGroupCount)
exports('GetJobDefinitions',function() return Phone.copy(J.definitions) end)
exports('GetJobGroup',function(src) local g=mine(tonumber(src));return g and publicGroup(g) or false end)
local function depart(src)
    Phone.withLocks({'peak-phone-jobs'},function()
        local g=J.groups[J.bySource[src]]
        if g then cleanup(g,'A group member disconnected or changed character; contract cancelled.') end
        for id,o in pairs(J.offers) do if o.from.src==src or o.to.src==src then J.offers[id]=nil end end
    end)
end
Phone.NativeAddEventHandler('playerDropped',function() local src=tonumber(source);CreateThread(function() depart(src) end) end)
Phone.NativeRegisterNetEvent('peak-phone:Jobs:Logout',function() local src=tonumber(source);CreateThread(function() depart(src) end) end)
Phone.NativeAddEventHandler('onResourceStop',function(name)
    if name==GetCurrentResourceName() or name=='peak-bridge' or name=='qb-core' or name=='qbx_core' or name=='es_extended' then
        local all={};for _,g in pairs(J.groups) do all[#all+1]=g end;for _,g in ipairs(all) do cleanup(g,'Job service stopped.') end
    end
end)
CreateThread(function()
    if not CFG.Enabled then return end
    PhoneDB.wait()
    local ok,err=pcall(function()
        if PhoneConfig.AutoMigrate then
            local sql=assert(LoadResourceFile(GetCurrentResourceName(),'jobs/schema.sql')):gsub('%-%-[^\n]*','')
            for statement in sql:gmatch('([^;]+);') do if statement:find('%S') then PhoneDB.query(statement,{}) end end
        end
        local defaults=json.decode(assert(LoadResourceFile(GetCurrentResourceName(),'jobs/defaults.json')))
        for _,d in ipairs(defaults) do
            local valid,why=S.validate(d);assert(valid,why);valid.revision=1
            PhoneDB.query('INSERT IGNORE INTO peak_phone_jobs(id,definition,revision,updated_by,updated_at) VALUES(?,?,?,?,?)',{valid.id,json.encode(valid),1,'seed',os.time()*1000})
        end
        for _,row in ipairs(PhoneDB.query('SELECT id,definition,revision FROM peak_phone_jobs')) do
            local d,why=S.validate(Phone.decode(row.definition,{}))
            if d and d.id==row.id then d.revision=tonumber(row.revision);J.definitions[d.id]=d else print('[peak-phone/jobs] Invalid persisted definition '..row.id..': '..tostring(why)) end
        end
        -- Ambiguous wallet calls are NEVER replayed at startup.
        PhoneDB.update("UPDATE peak_phone_job_rewards SET status='review' WHERE status IN ('applying','prepared')",{})
        -- Persistent cooldown prevents reconnect/restart from bypassing a recent payment.
        for _,row in ipairs(PhoneDB.query('SELECT citizenid,MAX(created_at) AS at FROM peak_phone_job_rewards WHERE created_at>? GROUP BY citizenid',{os.time()*1000-CFG.CooldownSeconds*1000})) do
            J.cooldowns[row.citizenid]=now()+math.max(0,tonumber(row.at)+CFG.CooldownSeconds*1000-os.time()*1000)
        end
    end)
    if not ok then J.error=tostring(err);print('^1[peak-phone/jobs] Not ready: '..J.error..'^7');return end
    J.ready=true;TriggerClientEvent('peak-phone:Jobs:Refresh',-1);TriggerClientEvent('peak-phone:portable:capabilitiesChanged',-1)
    print('[peak-phone/jobs] '..count(J.definitions)..' contract definitions loaded.')
end)
CreateThread(function()
    while true do
        Wait(1000)
        Phone.withLocks({'peak-phone-jobs'},function()
            for id,o in pairs(J.offers) do if o.expires<now() or not still(o.from) or not still(o.to) then J.offers[id]=nil end end
            local expired={}
            for _,g in pairs(J.groups) do
                local bad=g.deadline and now()>g.deadline
                for _,m in pairs(g.members) do if not still(m) or GetPlayerRoutingBucket(m.src)~=g.bucket then bad=true end end
                if bad then expired[#expired+1]=g
                elseif g.ticket then
                    local t=g.job.steps[g.step];local m=g.members[g.ticket.src]
                    if not m or not healthy(m.src) or not near(m.src,t.coords,t.radius) or g.ticket.expires<now() then g.ticket=nil end
                end
            end
            for _,g in ipairs(expired) do cleanup(g,'Contract timed out or a member left the instance.') end
        end)
    end
end)
