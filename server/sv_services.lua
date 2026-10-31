-- Services lists public, on-duty player contacts. A worker call remains a
-- person-to-person call; DisplayPhone is only a directory label.
local DEFAULT_EMERGENCY_JOBS={police=true,ambulance=true,bcso=true,sasp=true,ranger=true,fire=true}
local DEFAULT_TOW_JOBS={tow=true,mechanic=true,impound=true}
local MASKED_SERVICE_NUMBERS={police='911',bcso='911',sasp='911',ranger='911'}
local AVATAR_CACHE={}
local Peak=PhonePeak

local function jobSet(name,default)
    local config=type(PhoneConfig)=='table' and PhoneConfig[name]
    if type(config)~='table' then return default end
    return config
end

local function phoneAvatar(number)
    if not number then return nil end
    if AVATAR_CACHE[number] then return AVATAR_CACHE[number] end
    local ok,rows=pcall(PhoneDB.query,"SELECT avatar FROM `phone_profiles` WHERE `phone` = @Phone",{['@Phone']=number})
    local avatar=ok and type(rows)=='table' and rows[1] and rows[1].avatar or nil
    if type(avatar)=='string' and #avatar<=2048 then AVATAR_CACHE[number]=avatar;return avatar end
end

local function playerFor(source)
    local ok,player=pcall(function() return Peak.Functions.GetPlayer(source) end)
    return ok and player or nil
end

local function activePhone(source)
    local ok,number=pcall(function() return exports['peak-phone']:GetActivePhoneNumber(source) end)
    if not ok then return nil end
    return Phone.phone(number)
end

local function workerName(data)
    local first=type(data)=='table' and Phone.trim(tostring(data.firstname or data.firstName or '')) or ''
    local last=type(data)=='table' and Phone.trim(tostring(data.lastname or data.lastName or '')) or ''
    local name=Phone.trim(first..' '..last)
    if name=='' or #name>100 then return 'On-duty worker' end
    return name
end

local function listWorkers(source,kind)
    local player=playerFor(source)
    if not player or type(player.PlayerData)~='table' then return {} end
    local jobField=kind=='emergency' and 'EmergencyJobs' or 'TowJobs'
    local jobs=jobSet(jobField,kind=='emergency' and DEFAULT_EMERGENCY_JOBS or DEFAULT_TOW_JOBS)
    local masked=kind=='emergency' and MASKED_SERVICE_NUMBERS or nil
    local ok,players=pcall(Peak.GetPlayers)
    if not ok or type(players)~='table' then return {} end
    local workers,seen={},{}
    for _,entry in pairs(players) do
        local targetSource=type(entry)=='table' and tonumber(entry.ServerId) or tonumber(entry)
        if targetSource and targetSource~=tonumber(source) then
            local target=playerFor(targetSource)
            local data=target and target.PlayerData
            local job=type(data)=='table' and data.job
            local jobName=type(job)=='table' and job.name
            if type(jobName)=='string' and jobs[jobName] and job.onduty==true then
                local number=activePhone(targetSource)
                if number and not seen[targetSource] and not seen[number] then
                    seen[targetSource]=true;seen[number]=true
                    workers[#workers+1]={
                        Source=targetSource,
                        Name=workerName(data.charinfo),
                        Job=jobName,
                        Phone=number,
                        DisplayPhone=masked and masked[jobName] or nil,
                        Avatar=phoneAvatar(number)
                    }
                end
            end
        end
    end
    table.sort(workers,function(a,b)
        local left,right=string.lower(a.Name),string.lower(b.Name)
        if left==right then return a.Source<b.Source end
        return left<right
    end)
    return workers
end

Peak.Functions.CreateCallback('peak-phone:Server:Services:GetEmergencyWorkers',function(src,cb)
    local ok,result=pcall(listWorkers,src,'emergency')
    cb(ok and result or Phone.publicError('The emergency directory is unavailable.'))
end)

Peak.Functions.CreateCallback('peak-phone:Server:Services:GetTowWorkers',function(src,cb)
    local ok,result=pcall(listWorkers,src,'tow')
    cb(ok and result or Phone.publicError('The tow directory is unavailable.'))
end)

local function getImpoundOnDutyCount()
    local ok,players=pcall(Peak.GetPlayers)
    if not ok or type(players)~='table' then return 0 end
    local count=0
    for _,entry in pairs(players) do
        local source=type(entry)=='table' and tonumber(entry.ServerId) or tonumber(entry)
        local player=source and playerFor(source)
        local job=player and player.PlayerData and player.PlayerData.job
        if type(job)=='table' and job.name=='impound' and job.onduty==true then count=count+1 end
    end
    return count
end

exports('GetImpoundOnDutyCount',getImpoundOnDutyCount)
