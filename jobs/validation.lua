-- Shared, data-only schema. Never accepts Lua, custom event names, SQL or arbitrary callbacks.
Phone.JobSchema = {Version=1, Types={visit=true,work=true,deliver=true,collect=true,drive=true},
    Scenarios={none=true,clipboard=true,hammer=true,clean=true,garden=true,fish=true,weld=true},
    VehicleTypes={automobile=true,bike=true,boat=true,heli=true,plane=true}}
local S=Phone.JobSchema
local function finite(n,lo,hi) return type(n)=='number' and n==n and n>=lo and n<=hi and n~=math.huge end
local function integer(n,lo,hi) return finite(n,lo,hi) and n%1==0 end
function S.coords(v)
    if type(v)~='table' or not finite(v.x,-20000,20000) or not finite(v.y,-20000,20000) or not finite(v.z,-200,4000) then return nil end
    local h=v.w or v.heading or 0;if not finite(h,-360,360) then return nil end
    return {x=v.x,y=v.y,z=v.z,w=h}
end
function S.validate(d)
    local cfg=PhoneConfig.Jobs
    if type(d)~='table' then return nil,'Job must be an object.' end
    if type(d.id)~='string' or #d.id>48 or not d.id:match('^[a-z][a-z0-9_%-]+$') then return nil,'ID needs 2–48 lowercase letters, numbers, underscores or hyphens.' end
    if not Phone.text(d.name,70) or not Phone.text(d.description or '',700,true) then return nil,'Use a name up to 70 characters and description up to 700.' end
    local hub=S.coords(d.hub);if not hub then return nil,'Invalid meeting-point coordinates.' end
    if not integer(d.reward,0,cfg.MaxRewardPerMember) or (d.account~='cash' and d.account~='bank') then return nil,'Invalid reward or wallet account.' end
    if not integer(d.minMembers,1,cfg.MaxGroupSize) or not integer(d.maxMembers,d.minMembers,cfg.MaxGroupSize) then return nil,'Invalid group size.' end
    if not integer(d.timeoutMinutes,5,180) then return nil,'Time limit must be 5–180 minutes.' end
    local model=d.ped or '';if model~='' and (not Phone.text(model,60) or not model:match('^[%w_]+$')) then return nil,'Invalid NPC model.' end
    local role=d.requiredJob or '';if role~='' and (not Phone.text(role,48) or not role:match('^[%w_%-]+$')) then return nil,'Invalid required framework job.' end
    if type(d.steps)~='table' or #d.steps<1 or #d.steps>cfg.MaxSteps then return nil,'Add 1–'..cfg.MaxSteps..' ordered steps.' end
    local out={schema=1,id=d.id,name=Phone.trim(d.name),description=Phone.trim(d.description or ''),hub=hub,ped=model,
        enabled=d.enabled==true,reward=d.reward,account=d.account,minMembers=d.minMembers,maxMembers=d.maxMembers,
        timeoutMinutes=d.timeoutMinutes,requiredJob=role,steps={},requirements={}}
    if d.vehicle and d.vehicle~=false then
        local v=d.vehicle;local point=type(v)=='table' and S.coords(v.spawn)
        if not point or not Phone.text(v.model,60) or not v.model:match('^[%w_]+$') or not S.VehicleTypes[v.type] then return nil,'Choose a vehicle model, type and spawn position.' end
        if (point.x-hub.x)^2+(point.y-hub.y)^2+(point.z-hub.z)^2>10000 then return nil,'Vehicle spawn must be within 100 metres of the meeting point.' end
        out.vehicle={model=v.model,type=v.type,spawn=point}
    end
    if d.requirements~=nil and type(d.requirements)~='table' then return nil,'Item requirements must be a list.' end
    if #(d.requirements or {})>8 then return nil,'At most eight required items.' end
    for _,r in ipairs(d.requirements or {}) do
        if type(r)~='table' or not Phone.text(r.item,60) or not r.item:match('^[%w_%-]+$') or not integer(r.count,1,100) then return nil,'Invalid item requirement.' end
        out.requirements[#out.requirements+1]={item=r.item,count=r.count}
    end
    local total=0
    for i,t in ipairs(d.steps) do
        local pos=type(t)=='table' and S.coords(t.coords)
        if not pos or not Phone.text(t.label,120) or not S.Types[t.type] or not S.Scenarios[t.scenario or 'none'] then return nil,'Invalid label, coordinates, type or animation in step '..i end
        if not integer(t.duration,2,120) or not finite(t.radius,1,20) then return nil,'Step '..i..': duration 2–120 seconds, radius 1–20 metres.' end
        if t.type=='drive' and not out.vehicle then return nil,'Driving steps require an assigned vehicle.' end
        out.steps[i]={label=Phone.trim(t.label),type=t.type,coords=pos,duration=t.duration,radius=t.radius,scenario=t.scenario or 'none'};total=total+t.duration
    end
    if total>=out.timeoutMinutes*60 then return nil,'Time limit must exceed the combined task durations.' end
    return out
end
