-- Owner-authored settings stay in sv_config.lua and are reduced to a bounded,
-- text-only payload before being sent to a client.
local UI_APPS = {
    calls=true,messages=true,services=true,crypto=true,mails=true,contacts=true,gallery=true,camera=true,
    peakify=true,documents=true,settings=true,maps=true,calendar=true,clock=true,weather=true,voicememos=true,
    homeedit=true,details=true,store=true,housing=true,y=true,kilogram=true,binge=true,wenmo=true,vehicles=true,
    jobcenter=true,jobcreator=true,busdriver=true,lumberjack=true,bin=true,calculator=true,yellowpages=true,
    racing=true,['time-trials']=true,cars=true,facetime=true,guber=true,bankbusters=true,
}
local DEFAULT_ORDER = {
    'calls','messages','services','crypto','mails','contacts','gallery','camera','peakify','documents','settings',
    'maps','calendar','clock','weather','voicememos','homeedit','details','store','housing','y','kilogram','binge',
    'wenmo','vehicles','jobcenter','jobcreator','busdriver','lumberjack','bin','calculator','yellowpages','racing',
    'time-trials','cars','facetime','guber','bankbusters',
}
local DEFAULT_DOCK = {'calls','messages','mails','contacts'}
local STORE_IDS = {
    kilogram=true,binge=true,y=true,wenmo=true,vehicles=true,services=true,crypto=true,jobcenter=true,
    busdriver=true,lumberjack=true,peakify=true,bin=true,calculator=true,yellowpages=true,
}
local ICONS = {
    phone=true,['message-circle']=true,shield=true,wallet=true,mail=true,users=true,flower=true,camera=true,
    music=true,notebook=true,settings=true,navigation=true,timer=true,weather=true,['id-card']=true,
    ['app-store']=true,home=true,['at-sign']=true,heart=true,car=true,briefcase=true,bus=true,tree=true,
    globe=true,calculator=true,megaphone=true,flag=true,video=true,landmark=true,building=true,newspaper=true,
    map=true,radio=true,headphones=true,scale=true,chart=true,receipt=true,shield=true,heart=true,
}
local NETWORK_IDS = {bennys=true,pdm=true,lostmc=true,losmuertos=true,darkwolves=true,flightschool=true,deathsinners=true}
local NEWS_NETWORKS = {weazelnews=true,bin=true}
local DEFAULT_NEWS_LABELS = {weazelnews='Weazel News',bin='International News'}
local DEFAULT_SERVICE_SECTIONS = {
    emergency={title='Emergency',description='emergency workers'},
    tow={title='Tow',description='tow operators'},
}
local DEFAULT_SERVICE_JOB_LABELS = {
    police='Police officer',ambulance='Paramedic',bcso='Deputy sheriff',sasp='State trooper',
    ranger='Park ranger',fire='Firefighter',tow='Tow operator',mechanic='Mechanic',impound='Tow operator',
}

local function safeText(value,limit,fallback)
    local text=Phone.string(value,limit or 120)
    if not text or text=='' or text:find('[%c<>]') then return fallback end
    return text
end
local function safeId(value)
    return type(value)=='string' and #value<=48 and value:match('^[a-z][a-z0-9_%-]*$') and value or nil
end
local function safeNumber(value,min,max)
    local n=tonumber(value)
    if not n or n~=n or n==math.huge or n==-math.huge or n<min or n>max then return nil end
    return n
end
local function textMap(source,allowed,maxLength)
    local out={}
    if type(source)~='table' then return out end
    for id,value in pairs(source) do
        if safeId(id) and (not allowed or allowed[id]) then
            local text=safeText(value,maxLength)
            if text then out[id]=text end
        end
    end
    return out
end
local function orderedIds(value,maxCount)
    local out,seen={},{}
    if type(value)~='table' then return out end
    for _,id in ipairs(value) do
        if #out>=(maxCount or #DEFAULT_ORDER) then break end
        if UI_APPS[id] and not seen[id] then out[#out+1]=id;seen[id]=true end
    end
    return out
end
local function completeOrder(value)
    local out=orderedIds(value)
    local seen={}
    for _,id in ipairs(out) do seen[id]=true end
    for _,id in ipairs(DEFAULT_ORDER) do
        if not seen[id] and #out<#DEFAULT_ORDER then out[#out+1]=id;seen[id]=true end
    end
    return out
end
local function jobRules(value)
    local out={}
    if type(value)~='table' then return out end
    for appId,jobs in pairs(value) do
        if UI_APPS[appId] and type(jobs)=='table' then
            local set={}
            for key,entry in pairs(jobs) do
                local job=type(key)=='number' and entry or (entry==true and key or nil)
                job=safeId(job)
                if job then set[job]=true end
            end
            if next(set) then out[appId]=set end -- invalid or empty rules safely mean unrestricted
        end
    end
    return out
end
local function hiddenApps(value)
    local out={}
    if type(value)~='table' then return out end
    for key,entry in pairs(value) do
        local id=type(key)=='number' and entry or (entry==true and key or nil)
        if UI_APPS[id] then out[id]=true end
    end
    return out
end
local function placeList(value)
    local out,seen={},{}
    if type(value)~='table' then return out end
    for _,item in ipairs(value) do
        if #out>=100 then break end
        if type(item)=='table' then
            local id=safeId(item.id or item.Id)
            local name=safeText(item.name or item.Name,80)
            local x=safeNumber(item.x or item.X,-12000,12000)
            local y=safeNumber(item.y or item.Y,-12000,12000)
            local z=safeNumber(item.z or item.Z,-2000,4000)
            if id and name and x and y and not seen[id] then
                local place={id=id,name=name,x=x,y=y}
                local area=safeText(item.area or item.Area,60)
                local category=safeText(item.category or item.Category,40)
                if area then place.area=area end
                if category then place.category=category end
                if z then place.z=z end
                out[#out+1]=place;seen[id]=true
            end
        end
    end
    return out
end
local function storeEntries(value)
    local out={}
    if type(value)~='table' then return out end
    for id,item in pairs(value) do
        if STORE_IDS[id] and type(item)=='table' then
            local entry={}
            local description=safeText(item.Description or item.description,280)
            local category=safeText(item.Category or item.category,40)
            if description then entry.description=description end
            if category then entry.category=category end
            if next(entry) then out[id]=entry end
        end
    end
    return out
end
local function normalize()
    local input=type(PhoneOwnerConfig)=='table' and PhoneOwnerConfig or {}
    local apps=type(input.Apps)=='table' and input.Apps or {}
    local defaults=type(apps.Defaults)=='table' and apps.Defaults or {}
    local order=completeOrder(defaults.Order)
    local dock=orderedIds(defaults.Dock,4)
    if #dock==0 then dock=Phone.copy(DEFAULT_DOCK) end

    local networkLabels=textMap(type(input.Networks)=='table' and input.Networks.Labels,nil,80)
    for id in pairs(networkLabels) do if not NETWORK_IDS[id] then networkLabels[id]=nil end end
    local news=type(input.News)=='table' and input.News or {}
    local newsLabels=textMap(news.NetworkLabels,NEWS_NETWORKS,80)
    for id,label in pairs(DEFAULT_NEWS_LABELS) do if not newsLabels[id] then newsLabels[id]=label end end
    local services=type(input.Services)=='table' and input.Services or {}
    local sections={}
    for id,base in pairs(DEFAULT_SERVICE_SECTIONS) do
        local section=type(services.Sections)=='table' and services.Sections[id] or nil
        section=type(section)=='table' and section or {}
        sections[id]={
            title=safeText(section.Title or section.title,60,base.title),
            description=safeText(section.Description or section.description,80,base.description),
        }
    end
    local jobLabels=textMap(services.JobLabels,nil,60)
    for id,label in pairs(DEFAULT_SERVICE_JOB_LABELS) do if not jobLabels[id] then jobLabels[id]=label end end
    local store=type(input.Store)=='table' and input.Store or {}
    local featured=store.FeaturedApp or store.featuredApp
    if not STORE_IDS[featured] then featured='peakify' end
    local storeApps=storeEntries(store.Apps or store.apps)
    local icons=textMap(apps.Icons,nil,48)
    for id,value in pairs(icons) do if not ICONS[value] then icons[id]=nil end end
    local labels=textMap(apps.Labels,nil,48)
    for id in pairs(labels) do if not UI_APPS[id] then labels[id]=nil end end

    return {
        public={
            apps={labels=labels,icons=icons,defaults={order=order,dock=dock}},
            maps={places=placeList(type(input.Maps)=='table' and input.Maps.Places or nil)},
            networks={labels=networkLabels},
            services={
                title=safeText(services.Title,60,'Services'),
                subtitle=safeText(services.Subtitle,80,'On-duty directory'),
                sections=sections,jobLabels=jobLabels,
            },
            news={
                title=safeText(news.Title,80,'Binsbergen'),
                tagline=safeText(news.Tagline,120,'The latest, in perspective.'),
                networkLabels=newsLabels,
            },
            store={
                title=safeText(store.Title,60,'App Store'),
                kicker=safeText(store.Kicker,60,'MADE FOR YOUR CITY'),
                featuredApp=featured,
                featuredTitle=safeText(store.FeaturedTitle,60,'Peak Music'),
                featuredTagline=safeText(store.FeaturedTagline,140,'All your favorites. One beautiful library.'),
                apps=storeApps,
            },
        },
        jobAccess=jobRules(apps.JobAccess),
        hidden=hiddenApps(apps.Hidden),
    }
end

local OWNER=normalize()
Phone.OwnerUIApps=UI_APPS
function Phone.ownerPublicConfig()
    return Phone.copy(OWNER.public)
end
function Phone.ownerNewsLabel(network)
    return OWNER.public.news.networkLabels[network] or DEFAULT_NEWS_LABELS[network]
end
function Phone.ownerNetworkLabel(network,fallback)
    return OWNER.public.networks.labels[network] or fallback
end
function Phone.ownerAppAllowed(src,appId)
    if OWNER.hidden[appId] then return false end
    local allowed=OWNER.jobAccess[appId]
    if not allowed then return true end
    local ok,player=pcall(function() return PhonePeak.Functions.GetPlayer(src) end)
    local job=ok and player and player.PlayerData and player.PlayerData.job
    return type(job)=='table' and type(job.name)=='string' and allowed[job.name]==true or false
end
function Phone.ownerAppForRequest(name,args,src)
    if type(name)~='string' then return nil end
    local payload=type(args)=='table' and (type(args[1])=='table' and args[1] or args) or {}

    -- These actions finish or decline an existing request/session rather than
    -- opening an app. Keep them usable when the corresponding app is hidden;
    -- the receiving handler still validates call/request membership.
    if name=='peak-phone:portable:hangup' or name=='peak-phone:portable:rtcAbort' or
        name=='peak-phone:Server:Contacts:DeclineCall' or name=='peak-phone:Server:Messages:DeclineLocation' or
        name=='peak-phone:Server:Pinger:DeclinePing' then return nil end
    if name=='peak-phone:Server:Contacts:RespondAirShare' and payload.Accept~=true then return nil end

    -- Gallery exposes one legacy screenshot trigger that runs the same camera
    -- capture pipeline as BeginCapture. Keep it behind Camera; social posts
    -- still require Gallery and the Y provider through ownerAppsForRequest.
    if name=='peak-phone:Server:Gallery:RequestServerScreenshot' then return 'camera' end
    if name=='peak-phone:Server:Gallery:PostToTwatter' or name=='peak-phone:portable:gallery' then return 'gallery' end

    -- The shared answer and credential routes serve both voice and video calls.
    -- Use the server-owned session kind so a video call cannot bypass FaceTime
    -- access by taking the voice-call route (or the reverse).
    if name=='peak-phone:portable:answer' or name=='peak-phone:Server:Contacts:AnswerContact' or
        name=='peak-phone:Server:GetWebRTCCredentials' then
        local callId=type(payload.CallId)=='string' and payload.CallId or
            (type(args)=='table' and type(args[1])=='string' and args[1] or nil)
        local source=tonumber(src)
        local call=source and callId and Phone.Calls and type(Phone.Calls.member)=='function' and select(1,Phone.Calls.member(source,callId)) or nil
        if call then return call.kind=='video' and 'facetime' or 'calls' end
        return nil -- Invalid/non-member sessions are rejected by the call handler itself.
    end

    -- The remaining portable call routes are lifecycle/session traffic. New
    -- sessions are gated below by videoDial (facetime); hangup/rtcAbort and
    -- membership-checked signaling/heartbeats must remain alive to end calls.
    -- Device recovery, bootstrap, resource logout, and nearby ShareDrop routes
    -- are also intentionally system-owned rather than app-owned.
    local explicit=Phone.IntegrationApps and Phone.IntegrationApps[name]
    if explicit and UI_APPS[explicit] then return explicit end
    if name:match('InstallApp$') or name:match('UninstallApp$') or name:match('GetInstalledApps$') then return 'store' end
    if name:match('^peak%-phone:Server:Vehicles:') then return 'vehicles' end
    if name:match('^peak%-phone:Server:GetVehicles$') or name:match('^peak%-phone:Server:Cars:') then return 'cars' end
    local direct={
        ['peak-phone:Server:DialContact']='calls',
        ['peak-phone:Server:GetProfilePicture']='contacts',
        ['peak-phone:Server:UpdateProfilePicture']='contacts',
        ['peak-phone:Server:HasUnreadConversations']='messages',
        ['peak-phone:Server:GetNetworkState']='settings',
        ['peak-phone:Server:GetActivePhoneNumber']='settings',
        ['peak-phone:Server:RegisterSimCard']='settings',
        ['peak-phone:Server:SetSoundState']='settings',
        ['peak-phone:Server:UpdateRingtone']='settings',
        ['peak-phone:Server:GetBusters']='bankbusters',
        ['peak-phone:Server:ClaimHeist']='bankbusters',
        ['peak-phone:Server:CanRealtor']='housing',
        ['peak-phone:portable:videoDial']='facetime',
        ['peak-phone:portable:trackVehicle']='vehicles',
        ['peak-phone:portable:vehicleAction']='vehicles',
        ['peak-phone:Server:Gallery:BeginCapture']='camera',
        ['Lumberjack/GetData']='lumberjack',
        ['Admin:Server:SendMail']='mails',
        ['Admin:Server:PostTwat']='y',
    }
    if direct[name] then return direct[name] end
    local callContactEvent=name:match('^peak%-phone:Server:Contacts:ToggleSpeaker$')
    if name:match('^peak%-phone:Server:Calls:') or callContactEvent or name:match('^peak%-phone:Server:Contacts:Call') then return 'calls' end
    local section=name:match('^peak%-phone:Server:([^:]+):')
    local mapped={
        Messages='messages',Groups='messages',Contacts='contacts',Gallery='gallery',Media='gallery',Documents='documents',
        Mails='mails',YellowPages='yellowpages',Details='details',
        News='bin',Services='services',Wenmo='wenmo',Crypto='crypto',FindMy='maps',Maps='maps',
        Networks='settings',Network='settings',Jobs='jobcenter',JobCreator='jobcreator',BusDriver='busdriver',
        JobCenter='jobcenter',Cars='cars',Lumberjack='lumberjack',Y='y',KiloLive='kilogram',Social='kilogram',Peakify='peakify',
        Bankbusters='bankbusters',Busters='bankbusters',Racing='racing',TimeTrials='time-trials',Housing='housing',
        VoiceMemos='voicememos',Pinger='maps',Guber='guber',
    }
    local appId=mapped[section]
    if section=='Social' then
        local requested=payload.App or payload.app or payload.Type
        if requested=='binge' or requested=='kilogram' then appId=requested end
    end
    if appId and UI_APPS[appId] then return appId end
    return nil
end
function Phone.ownerAppsForRequest(name,args,src)
    local apps,seen={},{}
    local function add(appId)
        if type(appId)=='string' and not seen[appId] then apps[#apps+1]=appId;seen[appId]=true end
    end
    add(Phone.ownerAppForRequest(name,args,src))
    local payload=type(args)=='table' and (type(args[1])=='table' and args[1] or args) or {}
    local action=type(args)=='table' and type(args[1])=='string' and args[1] or payload.Action or payload.action
    if name=='peak-phone:Server:Gallery:PostToTwatter' or
        (name=='peak-phone:portable:gallery' and action=='PostToTwatter') then
        add('gallery')
        add('y')
    end
    return apps
end
