Peak = PhonePeak
SoundMuters = {}
IsNetworkEnabled = true

RegisterCommand("+setPhoneNetwork", function(source, args)
    if source ~= 0 then return end

    if tostring(args[1] or ''):lower() == 'true' then
        IsNetworkEnabled = true
    else
        IsNetworkEnabled = false
    end

    TriggerClientEvent("peak-phone:Client:SetNetworkState", -1, IsNetworkEnabled)

    print("[PHONE]: Network Status set to " .. tostring(IsNetworkEnabled))
end)

RegisterNetEvent("peak-phone:Server:SetSoundState")
AddEventHandler("peak-phone:Server:SetSoundState", function(Toggle)
    local Source = source
    SoundMuters[Source] = Toggle == true
end)

Peak.Functions.CreateCallback("peak-phone:Server:GetNetworkState", function(Source, Cb)
    Cb(IsNetworkEnabled)
end)

Peak.Functions.CreateCallback("peak-phone:Server:Networks:IsNearNetwork", function(Source, Cb)
    local Coords = GetEntityCoords(GetPlayerPed(Source))
    if not IsNetworkEnabled then return Cb(false) end

    for k, v in ipairs(Config.Networks) do
        if #(v.Center - Coords) <= v.Size and v.Enabled(Source) then
            Cb(true)
            return
        end
    end

    if PeakifyGetNearbyNetworks then
        local DynamicNetworks = PeakifyGetNearbyNetworks(Source)
        if DynamicNetworks and #DynamicNetworks > 0 then
            return Cb(true)
        end
    end

    Cb(false)
end)

Peak.Functions.CreateCallback("peak-phone:Server:Networks:GetNetworks", function(Source, Cb)
    local Coords = GetEntityCoords(GetPlayerPed(Source))
    if not IsNetworkEnabled then return Cb({}) end

    local Retval = {}
    for k, v in ipairs(Config.Networks) do
        if #(v.Center - Coords) <= v.Size and v.Enabled(Source) then
            Retval[#Retval + 1] = {
                Id = v.Id,
                Name = Phone.ownerNetworkLabel(v.Id, v.Name),
            }
        end
    end

    if PeakifyGetNearbyNetworks then
        local DynamicNetworks = PeakifyGetNearbyNetworks(Source)
        for i = 1, #(DynamicNetworks or {}) do
            Retval[#Retval + 1] = DynamicNetworks[i]
        end
    end

    Cb(Retval)
end)

Peak.Functions.CreateCallback("peak-phone:Server:Networks:Connect", function(Source, Cb, Data)
    local Coords = GetEntityCoords(GetPlayerPed(Source))
    local Retval = { Success = false }

    if not Data or not Phone.text(Data.Network,100) or not IsNetworkEnabled then
        return Cb({Success=false})
    end

    for k, v in pairs(Config.Networks) do
        if #(v.Center - Coords) <= v.Size and v.Enabled(Source) then
            if v.Id == Data.Network and (not v.Password or v.Password == Data.Password) then
                Retval = { Success = true, Coords = v.Center, Size = v.Size }
            end
        end
    end

    if not Retval.Success and PeakifyTryConnectNetwork then
        local DynamicRetval = PeakifyTryConnectNetwork(Source, Data.Network)
        if DynamicRetval and DynamicRetval.Success then
            Retval = DynamicRetval
        end
    end

    Cb(Retval)
end)

exports("IsNetworkDisabled", function()
    return IsNetworkEnabled == false
end)

-- Profile Picture System
local PhoneAvatars = {}

Citizen.CreateThread(function()
    PhoneDB.query([[
        CREATE TABLE IF NOT EXISTS `phone_profiles` (
            `phone` VARCHAR(50) NOT NULL,
            `avatar` LONGTEXT,
            PRIMARY KEY (`phone`)
        );
    ]])

    PhoneDB.query([[
        CREATE TABLE IF NOT EXISTS `phone_installed_apps` (
            `phone` VARCHAR(50) NOT NULL,
            `app_id` VARCHAR(50) NOT NULL,
            PRIMARY KEY (`phone`, `app_id`)
        );
    ]])
end)

function GetAvatarsForPhones(list)
    local args,marks,seen={},{},{}
    for i,value in ipairs(type(list)=='table' and list or {}) do
        if i>200 then break end
        local n=Phone.phone(value)
        if n and not seen[n] then seen[n]=true;args[#args+1]=n;marks[#marks+1]='?' end
    end
    if #args==0 then return {} end
    local result={}
    for _,row in ipairs(PhoneDB.query('SELECT phone,avatar FROM phone_profiles WHERE phone IN ('..table.concat(marks,',')..')',args)) do result[row.phone]=row.avatar end
    return result
end

RegisterNetEvent("peak-phone:Server:UpdateProfilePicture")
AddEventHandler("peak-phone:Server:UpdateProfilePicture", function(Url)
    local Source = source
    local Player = Peak.Functions.GetPlayer(Source)
    if not Player then return end
    
    local Phone = Player.PlayerData.charinfo.phone
    
    Url = _G.Phone.safeImage(Url)
    if not Url then return end
    -- Update Metadata
    Player.Functions.SetMetaData("phone_pfp", Url)
    
    -- Update DB
    PhoneDB.execute("INSERT INTO `phone_profiles` (`phone`, `avatar`) VALUES (@Phone, @Avatar) ON DUPLICATE KEY UPDATE `avatar` = @Avatar", {
        ['@Phone'] = Phone,
        ['@Avatar'] = Url
    })
    
    -- Update Cache
    PhoneAvatars[Phone] = Url
end)

Peak.Functions.CreateCallback("peak-phone:Server:GetProfilePicture", function(Source, Cb, Phone)
    Phone = _G.Phone.phone(Phone)
    if not Phone then return Cb(nil) end
    if PhoneAvatars[Phone] then
        Cb(PhoneAvatars[Phone])
    else
        local Result = PhoneDB.query("SELECT avatar FROM `phone_profiles` WHERE `phone` = @Phone", { ['@Phone'] = Phone })
        if Result[1] then
            PhoneAvatars[Phone] = Result[1].avatar
            Cb(Result[1].avatar)
        else
            Cb(nil)
        end
    end
end)

-- App Store System
Peak.Functions.CreateCallback("peak-phone:Server:GetInstalledApps", function(Source, Cb)
    local Player = Peak.Functions.GetPlayer(Source)
    if not Player then return Cb({}) end
    local Phone = Player.PlayerData.charinfo.phone

    local Result = PhoneDB.query("SELECT app_id FROM `phone_installed_apps` WHERE `phone` = @Phone", {
        ['@Phone'] = Phone
    })

    local Installed = {}
    for _, row in ipairs(Result) do
        Installed[row.app_id] = true
    end
    Cb(Installed)
end)

local function changeInstalledApp(Source, Cb, AppId, installing)
    if type(AppId) ~= 'string' or not Phone.AppIds[AppId] then
        return Cb({Success=false, Message='Unknown app.'})
    end
    local Player = Peak.Functions.GetPlayer(Source)
    if not Player then return Cb({Success=false, Message='Character is not ready.'}) end
    local number = Player.PlayerData.charinfo.phone
    if not Phone.phone(number) then return Cb({Success=false, Message='No active phone number.'}) end
    local sql = installing
        and 'INSERT IGNORE INTO phone_installed_apps (phone, app_id) VALUES (?, ?)'
        or 'DELETE FROM phone_installed_apps WHERE phone = ? AND app_id = ?'
    PhoneDB.query(sql, {number, AppId})
    local rows = PhoneDB.query('SELECT app_id FROM phone_installed_apps WHERE phone = ?', {number})
    local installed = {}
    for _, row in ipairs(rows) do installed[row.app_id] = true end
    if (installed[AppId] == true) ~= installing then
        return Cb({Success=false, Message='The app change could not be saved.'})
    end
    Cb({Success=true, InstalledApps=installed})
end
Peak.Functions.CreateCallback('peak-phone:Server:InstallApp', function(Source, Cb, AppId)
    changeInstalledApp(Source, Cb, AppId, true)
end)
Peak.Functions.CreateCallback('peak-phone:Server:UninstallApp', function(Source, Cb, AppId)
    changeInstalledApp(Source, Cb, AppId, false)
end)
