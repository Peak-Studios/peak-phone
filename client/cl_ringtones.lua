local builtin = {default=true,chime=true,seaside=true,orbit=true,pulse=true}
local aliases = {['phone.phoneRing']='default',['ringtones.seaside']='seaside',['ringtones.stilldre']='pulse'}
local function customTone(tone)
    if type(tone)~='table' or type(tone.id)~='string' or #tone.id>40
        or not tone.id:match('^[a-z0-9][a-z0-9_-]*$') or builtin[tone.id] or tone.id=='custom' then return nil end
    local src=Phone.ringtoneSource(tone.src)
    if not src then return nil end
    local label=type(tone.label)=='string' and tone.label or tone.id
    label=label:gsub('[%z\1-\31\127]',' '):gsub('^%s+',''):gsub('%s+$',''):sub(1,64)
    if label=='' then label=tone.id end
    return {id=tone.id,label=label}
end
function Phone.ringtoneOptions()
    local options,seen={},{}
    for _,tone in ipairs(PhoneConfig.Ringtones.Custom or {}) do
        local option=customTone(tone)
        if option and not seen[option.id] then options[#options+1]=option;seen[option.id]=true end
    end
    return options
end
function Phone.ringtoneSource(value)
    if type(value)~='string' or #value>2048 or value:find('%s') then return nil end
    local host=value:match('^https://([^/]+)/.+')
    if host and (host:match('^[%w%.%-]+$') or host:match('^[%w%.%-]+:%d+$')) and not value:find('\\',1,true) then return value end
    if value:match('^ringtones/[%w_./%-]+$') and not value:find('..',1,true) and
        (value:match('%.wav$') or value:match('%.ogg$') or value:match('%.mp3$')) then return value end
end
function Phone.ringtoneId(id)
    id=aliases[id] or id
    if builtin[id] or id=='custom' then return id end
    for _,tone in ipairs(PhoneConfig.Ringtones.Custom or {}) do
        local option=customTone(tone)
        if option and option.id==id then return id end
    end
    return 'default'
end
function Phone.ringtoneData(incoming)
    local hud=PhoneServices['peak-hud']
    local id=Phone.ringtoneId(hud:GetPreferenceById('Phone.Ringtone'))
    local custom
    if id=='custom' then custom=Phone.ringtoneSource(hud:GetPreferenceById('Phone.CustomRingtone'))
    else for _,tone in ipairs(PhoneConfig.Ringtones.Custom or {}) do if tone.id==id then custom=Phone.ringtoneSource(tone.src) end end end
    return {Action='Video/Ring',Enabled=true,Incoming=incoming==true,Sound=id,CustomSound=custom,CallId=CallData and CallData.CallId}
end
