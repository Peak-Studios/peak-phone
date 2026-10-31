-- Native Job Center routes and streamed world interactions. No peak-jobmanager dependency.
local CFG=PhoneConfig.Jobs
local state={jobs={},group=false};local peds,blips={},{};local working=false;local generation=0
local function response(value)
    if type(value)=='table' and value.Success==false then return {__phoneError=true,error=value.Msg or value.Error or 'Job request failed.'} end
    return value
end
local function apply(value)
    if type(value)~='table' or value.Success~=true then return end
    -- An administrator may move/rename an existing hub while clients are nearby.
    local prior={};for _,j in ipairs(state.jobs or {}) do prior[j.id]=j end
    for _,j in ipairs(value.jobs or {}) do
        local old=prior[j.id]
        if old and (old.ped~=j.ped or old.name~=j.name or json.encode(old.hub)~=json.encode(j.hub)) then
            if peds[j.id] and DoesEntityExist(peds[j.id]) then DeleteEntity(peds[j.id]) end;peds[j.id]=nil
            if blips[j.id] then RemoveBlip(blips[j.id]);blips[j.id]=nil end
        end
    end
    state=value;SendNUIMessage({Action='Jobs/State',Data=value})
end
local function refresh()
    if not CFG.Enabled or not Phone.Client or not Phone.Client.Ready then return end
    local n=generation;local ok,value=pcall(Peak.SendCallback,'peak-phone:Jobs:State')
    if ok and n==generation then apply(value) end
end
for route,callback in pairs({State='State',Action='Action',Admin='Admin'}) do
    RegisterNUICallback('Jobs/'..route,function(data,cb)
        local value=Peak.SendCallback('peak-phone:Jobs:'..callback,data)
        if callback=='State' then apply(value) end
        cb(response(value))
        if callback=='Action' and type(value)=='table' and value.Success then refresh() end
    end)
end
RegisterNUICallback('Jobs/Position',function(_,cb)
    local permission=Peak.SendCallback('peak-phone:Jobs:Admin')
    if not permission or not permission.Success then return cb({__phoneError=true,error='Administrator access required.'}) end
    local p=GetEntityCoords(PlayerPedId());cb({Success=true,x=p.x,y=p.y,z=p.z,w=GetEntityHeading(PlayerPedId())})
end)
RegisterNUICallback('Jobs/Waypoint',function(data,cb)
    -- Resolve the stable job ID, never the filtered list index or untrusted coordinate input.
    local value=Peak.SendCallback('peak-phone:Jobs:State');apply(value)
    local coords
    if data.active and state.group and state.group.task then coords=state.group.task.coords
    else for _,job in ipairs(state.jobs or {}) do if job.id==data.jobId then coords=job.hub;break end end end
    if not coords then return cb({__phoneError=true,error='Location unavailable.'}) end
    SetNewWaypoint(coords.x+0.0,coords.y+0.0);cb({Success=true})
end)
RegisterNetEvent('peak-phone:Jobs:State',function(value) if source==65535 then apply(value) end end)
RegisterNetEvent('peak-phone:Jobs:Refresh',function() if source==65535 then CreateThread(refresh) end end)
RegisterNetEvent('peak-phone:Jobs:Ended',function(data)
    if source~=65535 then return end
    if working and lib.progressActive() then lib.cancelProgress() end
    state.group=false;SendNUIMessage({Action='Jobs/Ended',Data=data});CreateThread(refresh)
end)
local scenarios={clipboard='WORLD_HUMAN_CLIPBOARD',hammer='WORLD_HUMAN_HAMMERING',clean='WORLD_HUMAN_JANITOR',garden='WORLD_HUMAN_GARDENER_PLANT',fish='WORLD_HUMAN_STAND_FISHING',weld='WORLD_HUMAN_WELDING'}
local function perform()
    if working then return end;working=true;local n=generation
    local ok,err=pcall(function()
        local current=Peak.SendCallback('peak-phone:Jobs:TaskState');local g=current and current.group
        if not g or g.status~='active' or not current.run then return end
        local data={action='begin',run=current.run,step=g.step}
        local r=Peak.SendCallback('peak-phone:Jobs:Task',data)
        if not r or not r.Success then lib.notify({title='Job Center',description=r and r.Msg or 'Task unavailable.',type='error'});return end
        if n~=generation then return end
        if ClosePhone and IsPhoneOpen then ClosePhone() end
        local options={duration=r.duration*1000,label=r.task.label,position='bottom',canCancel=true,useWhileDead=false,
            disable={move=r.task.type~='drive',car=true,combat=true}}
        if scenarios[r.task.scenario] and r.task.type~='drive' then options.anim={scenario=scenarios[r.task.scenario]} end
        local done=lib.progressCircle(options)
        if n~=generation then return end
        data.action=done and 'finish' or 'abort';data.token=r.token
        local result=Peak.SendCallback('peak-phone:Jobs:Task',data)
        if not result or not result.Success then lib.notify({title='Job Center',description=result and result.Msg or 'Task was not accepted.',type='error'}) end
        refresh()
    end)
    working=false
    if not ok then print('[peak-phone/jobs] '..tostring(err));lib.notify({title='Job Center',description='Task failed. Check the server console.',type='error'}) end
end
local function clear()
    generation=generation+1;state={jobs={},group=false}
    if working and lib.progressActive() then lib.cancelProgress() end
    for _,p in pairs(peds) do if DoesEntityExist(p) then DeleteEntity(p) end end;peds={}
    for _,b in pairs(blips) do RemoveBlip(b) end;blips={}
end
AddEventHandler('Peak:Client:OnPlayerUnload',function() clear();TriggerServerEvent('peak-phone:Jobs:Logout') end)
AddEventHandler('Peak:Client:OnPlayerLoaded',function() CreateThread(function() Wait(1500);refresh() end) end)
AddEventHandler('onResourceStop',function(name) if name==GetCurrentResourceName() then clear() end end)
CreateThread(function() while true do Wait(15000);refresh() end end)
CreateThread(function()
    while true do
        Wait(1500)
        if CFG.Enabled then
            local player=GetEntityCoords(PlayerPedId());local wanted={};local quota=0;local n=generation
            for _,job in ipairs(state.jobs or {}) do
                local h=job.hub;local distance=(player.x-h.x)^2+(player.y-h.y)^2+(player.z-h.z)^2
                if CFG.SpawnHubPeds and distance<6400 and quota<12 and job.ped~='' then
                    wanted[job.id]=true;quota=quota+1
                    if not peds[job.id] then
                        local hash=GetHashKey(job.ped)
                        if IsModelInCdimage(hash) and IsModelAPed(hash) then
                            RequestModel(hash);local deadline=GetGameTimer()+3000
                            while not HasModelLoaded(hash) and GetGameTimer()<deadline and n==generation do Wait(25) end
                            if HasModelLoaded(hash) and n==generation then
                                local ped=CreatePed(4,hash,h.x,h.y,h.z-1,h.w,false,true)
                                if ped~=0 then SetEntityInvincible(ped,true);SetBlockingOfNonTemporaryEvents(ped,true);FreezeEntityPosition(ped,true);peds[job.id]=ped end
                            end
                            SetModelAsNoLongerNeeded(hash)
                        end
                    end
                end
                if CFG.ShowHubBlips and not blips[job.id] then
                    local b=AddBlipForCoord(h.x,h.y,h.z);SetBlipSprite(b,407);SetBlipScale(b,0.6);SetBlipAsShortRange(b,true)
                    BeginTextCommandSetBlipName('STRING');AddTextComponentString(job.name);EndTextCommandSetBlipName(b);blips[job.id]=b
                end
            end
            for id,p in pairs(peds) do if not wanted[id] then if DoesEntityExist(p) then DeleteEntity(p) end;peds[id]=nil end end
            local existing={};for _,j in ipairs(state.jobs or {}) do existing[j.id]=true end
            for id,b in pairs(blips) do if not CFG.ShowHubBlips or not existing[id] then RemoveBlip(b);blips[id]=nil end end
        end
    end
end)
CreateThread(function()
    while true do
        local sleep=800;local g=state.group;local t=g and g.status=='active' and g.task
        local player=GetEntityCoords(PlayerPedId());local point,label,radius
        if t then point=t.coords;label=t.label;radius=t.radius
        elseif not g then
            local best=100
            for _,j in ipairs(state.jobs or {}) do local h=j.hub;local d=(player.x-h.x)^2+(player.y-h.y)^2+(player.z-h.z)^2
                if d<best then point=h;label='Open Job Center';radius=3;best=d end
            end
        end
        if point then
            local dist=(player.x-point.x)^2+(player.y-point.y)^2+(player.z-point.z)^2
            if dist<1600 then
                sleep=0;DrawMarker(1,point.x,point.y,point.z-1,0,0,0,0,0,0,1.2,1.2,0.3,80,160,230,120,false,false,2,false,nil,nil,false)
                if dist<=radius*radius and not working and not IsPhoneOpen then
                    BeginTextCommandDisplayHelp('STRING');AddTextComponentSubstringPlayerName('~INPUT_CONTEXT~ '..label);EndTextCommandDisplayHelp(0,false,true,-1)
                    if IsControlJustReleased(0,38) then
                        if t then CreateThread(perform)
                        else if OpenPhone then OpenPhone(true) end;SendNUIMessage({Action='Jobs/Open'}) end
                    end
                end
            end
        end
        Wait(sleep)
    end
end)
