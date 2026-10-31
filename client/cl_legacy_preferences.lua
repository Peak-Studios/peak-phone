-- Safe, allowlisted import from the OPTIONAL old-name compatibility shim.
local function legacyUI()
    if GetResourceState('peak-phone')~='started' then return {} end
    local ok,value=pcall(function() return exports['peak-phone']:ReadLegacyUI() end)
    return ok and Phone.decode(value,{}) or {}
end
RegisterNUICallback('Phone/LegacyPreferences',function(_,cb) cb(legacyUI()) end)
AddEventHandler('peak-phone:compat:UIReady',function()
    if GetInvokingResource()=='peak-phone' then SendNUIMessage({Action='Duo/LegacyPreferences',Values=legacyUI()}) end
end)
