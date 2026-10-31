Peak = PhonePeak
LoggedIn, PlayerJob = false, {}

RegisterNetEvent('Peak:Client:OnPlayerLoaded')
AddEventHandler('Peak:Client:OnPlayerLoaded', function()
    PlayerJob = Peak.Functions.GetPlayerData().job
    LoggedIn = true
    InitPhone(false)
    -- Call history is now loaded from database on demand
end)

RegisterNetEvent('Peak:Client:OnPlayerUnload')
AddEventHandler('Peak:Client:OnPlayerUnload', function()
    LoggedIn = false
    if ResetNotifications then ResetNotifications() else NotificationsIds = {} end
    if ClearCallHistory then ClearCallHistory() end
    ClosePhone(true)
    PhoneVisibleApps, PhoneMountedApps = {}, {}
    ActiveSimData = nil
    SendNUIMessage({ Action = 'Duo/Reset' })
end)

RegisterNetEvent('Peak:Player:SetPlayerData')
AddEventHandler('Peak:Player:SetPlayerData', function()
	if not IsPhoneOpen then return end
    Citizen.SetTimeout(100, function()
        UpdatePlayerData()
    end)
end)

RegisterNetEvent("peak-hud:Client:OnPreferenceUpdate")
AddEventHandler("peak-hud:Client:OnPreferenceUpdate", function(Preferences)
    SendNUIMessage({
        Action = "SetPhoneBrand",
        Brand = Preferences['Phone.Brand']
    })

    SendNUIMessage({
        Action = "SetPhoneBackground",
        Background = Preferences['Phone.Background']
    })

    SendNUIMessage({
        Action = "SetEmbedsEnabled",
        Enabled = Preferences['Images.Embedded']
    })

    if Preferences['Phone.Ringtone'] then
        TriggerServerEvent('peak-phone:Server:UpdateRingtone', Preferences['Phone.Ringtone'])
    end
end)

-- Code
CurrentApp, CurrentNetwork, IsNetworkEnabled = 'home', '', true
-- Visibility is separate from focus: both panes can receive live updates.
PhoneVisibleApps, PhoneMountedApps, PhoneDuoTyping, PhoneDuoCursor = {}, {}, false, true
local PhoneDuoSession, PhoneDuoRevision = nil, -1
local PhoneDuoOpenPayload = nil

function IsPhoneAppVisible(App)
    return IsPhoneOpen and PhoneVisibleApps[App] == true
end

function IsPhoneAppMounted(App)
    return PhoneMountedApps[App] == true
end
NotificationsIds, IsPhoneOpen, InCamera = {}, false, false
local NotificationSequence = 0
local MAX_NOTIFICATION_RECORDS = 32
local MAX_NOTIFICATION_AGE = 60 * 60 * 1000
ActiveSimData = nil  -- Stores the current SIM card data when phone is opened
CameraIsSelfie = false -- Rear lens is the default when the camera opens.

local function notificationNow()
    if type(GetGameTimer) == 'function' then return GetGameTimer() end
    return math.floor(os.clock() * 1000)
end

local function forgetNotification(Id, notification)
    if NotificationsIds[Id] ~= notification then return false end
    NotificationsIds[Id] = nil
    SendNUIMessage({ Action = 'RemoveNotification', Id = Id, Token = notification.Token })
    return true
end

local function pruneNotifications(now)
    now = now or notificationNow()
    local active = {}
    for id, notification in pairs(NotificationsIds) do
        local age = now - (notification.CreatedAt or now)
        if age < 0 or age >= (notification.Lifetime or MAX_NOTIFICATION_AGE) then
            forgetNotification(id, notification)
        else
            active[#active + 1] = { Id = id, Record = notification }
        end
    end
    table.sort(active, function(a, b)
        if a.Record.CreatedAt == b.Record.CreatedAt then return a.Record.Sequence < b.Record.Sequence end
        return a.Record.CreatedAt < b.Record.CreatedAt
    end)
    while #active > MAX_NOTIFICATION_RECORDS do
        local oldest = table.remove(active, 1)
        forgetNotification(oldest.Id, oldest.Record)
    end
end

function ResetNotifications()
    for id, notification in pairs(NotificationsIds) do
        forgetNotification(id, notification)
    end
    NotificationsIds = {}
end

function IsNotificationCurrent(Id, Token)
    pruneNotifications()
    local notification = NotificationsIds[tostring(Id or '')]
    return IsPhoneOpen == true and notification ~= nil and tostring(notification.Token) == tostring(Token)
        and not (Phone and Phone.Client and Phone.Client.Device and Phone.Client.Device.Locked == true)
end

Citizen.CreateThread(function()
    while true do
        Citizen.Wait(30000)
        pruneNotifications()
    end
end)

-- Loops
Citizen.CreateThread(function()
    Peak.AddKeybind("openMobile", "Phone", "Open", "M", OpenPhone)
    Peak.AddKeybind("phoneAnwser", "Phone", "Answer", "", function(IsPressed)
        if not IsPressed then return end

        local PlayerData = Peak.Functions.GetPlayerData()
        if PlayerData.metadata.ishandcuffed or PlayerData.metadata.isdead then return end

        if CallData == nil or not CallData.Dialing then return end
        TriggerServerEvent('peak-phone:Server:Contacts:AnswerContact', {CallId = CallData.CallId})
    end)

    Peak.AddKeybind("phoneDecline", "Phone", "Hang Up", "", function(IsPressed)
        if not IsPressed then return end

        local PlayerData = Peak.Functions.GetPlayerData()
        if PlayerData.metadata.ishandcuffed or PlayerData.metadata.isdead then return end

        if CallData == nil then return end
        TriggerServerEvent('peak-phone:Server:Contacts:DeclineCall', {CallId = CallData.CallId})
    end)

    -- No idle per-frame suppression of the native pause menu.
end)

-- NUI Callbacks
RegisterNUICallback("SetCurrentApp", function(Data, Cb)
    Data = type(Data) == "table" and Data or {}
    local Revision = tonumber(Data.Revision) or 0
    if Revision ~= Revision or Revision % 1 ~= 0 or Revision < 0 or Revision > 2147483646 then return Cb("Ok") end
    local Session = tostring(Data.Session or "legacy")
    if PhoneDuoSession ~= nil and PhoneDuoSession ~= Session then return Cb("Ok") end
    if PhoneDuoSession == nil then PhoneDuoSession = Session end
    if Revision <= PhoneDuoRevision then return Cb("Ok") end
    PhoneDuoRevision = Revision
    local Orientation = Data.Orientation == "portrait" and "portrait" or "landscape"
    if Phone.DuoProp then Phone.DuoProp.accept(Data.Expanded, Data.ReducedMotion, Orientation, Session, Revision) end
    local App = type(Data.App) == "string" and Data.App or "home"
    local Changed = CurrentApp ~= App
    CurrentApp = IsPhoneOpen and App or "home"
    PhoneVisibleApps, PhoneMountedApps = {}, {}
    if type(Data.MountedApps) == "table" then
        for Index, MountedApp in ipairs(Data.MountedApps) do
            if Index > 3 then break end -- two workspaces and a live video-call service
            if type(MountedApp) == "string" then PhoneMountedApps[MountedApp] = true end
        end
    end
    if IsPhoneOpen then
        if type(Data.VisibleApps) == "table" then
            for Index, VisibleApp in ipairs(Data.VisibleApps) do
                if Index > 2 then break end
                if type(VisibleApp) == "string" then PhoneVisibleApps[VisibleApp] = true end
            end
        elseif App ~= "home" then
            PhoneVisibleApps[App] = true
        end
    end
    if Changed and IsPhoneOpen then TriggerEvent('peak-ui:Tutorial:PhoneAppOpened', CurrentApp) end
    Cb("Ok")
end)

local function ApplyPhoneInputMode()
    -- Keep the cursor available to the phone; only pass movement controls through in gameplay mode.
    SetNuiFocus(true, true)
    SetNuiFocusKeepInput(not PhoneDuoCursor and not PhoneDuoTyping)
end

RegisterNUICallback("Phone/DuoTyping", function(Data, Cb)
    PhoneDuoTyping = IsPhoneOpen and type(Data) == "table" and Data.Typing == true
    if IsPhoneOpen and not InCamera then ApplyPhoneInputMode()
    else SetNuiFocusKeepInput(false) end
    Cb("Ok")
end)
RegisterNUICallback("Phone/SetInputMode",function(Data,Cb)
    if not IsPhoneOpen or InCamera then return Cb(false) end
    local DisableMovement=PhoneServices['peak-hud']:GetPreferenceById('Phone.DisableMovement')
    PhoneDuoCursor=DisableMovement or not (type(Data)=='table' and Data.Mode=='gameplay')
    ApplyPhoneInputMode()
    Cb({Success=not DisableMovement,Mode=PhoneDuoCursor and 'cursor' or 'gameplay'})
end)
local PhoneInputLastToggle = -1000
local function TogglePhoneInput()
    if not IsPhoneOpen or InCamera or PhoneDuoTyping then return false end
    local Now = GetGameTimer()
    if Now - PhoneInputLastToggle < 250 then return false end
    PhoneInputLastToggle = Now
    PhoneDuoCursor = not PhoneDuoCursor
    ApplyPhoneInputMode()
    return true
end
RegisterNUICallback('Phone/ToggleInput',function(_,Cb)
    Cb({Success=TogglePhoneInput(),Mode=PhoneDuoCursor and 'cursor' or 'gameplay'})
end)
RegisterCommand('phoneinput',function()
    if not IsPhoneOpen or InCamera or PhoneDuoTyping then return end
    if PhoneServices['peak-hud']:GetPreferenceById('Phone.DisableMovement') then return Peak.Functions.Notify('Enable gameplay input in Settings first.','error') end
    if TogglePhoneInput() then Peak.Functions.Notify(PhoneDuoCursor and 'Phone cursor mode' or 'Phone gameplay mode','primary',1800) end
end,false)
RegisterKeyMapping('phoneinput','Toggle phone cursor / gameplay input','keyboard','F6')
RegisterCommand('phoneinputalt',function()
    -- NUI owns ALT in cursor mode; gameplay focus uses this keymapping to hand it back.
    if not PhoneDuoCursor then TogglePhoneInput() end
end,false)
RegisterKeyMapping('phoneinputalt','Toggle phone cursor / gameplay input','keyboard','LMENU')

RegisterNUICallback("Phone/DuoReady", function(Data, Cb)
    local reloaded = type(Data)=="table" and PhoneDuoSession and Data.Session~=PhoneDuoSession
    -- A browser reload destroyed the accepted RTC peer. End the old call on
    -- both clients instead of replaying a spinner without a media transport.
    if reloaded and CallData and CallData.Kind=="video" and not CallData.Dialing then
        TriggerServerEvent('peak-phone:portable:rtcAbort',CallData.CallId)
        if Phone.stopVideo then Phone.stopVideo(CallData.CallId,'Video interface reloaded. Please call again.') end
    end
    if type(Data) == "table" and type(Data.Session) == "string" then
        PhoneDuoSession, PhoneDuoRevision = Data.Session, -1
    end
    if Phone.emitCallState then Phone.emitCallState() end
    if CallData and CallData.Dialing then
        SendNUIMessage({Action='Video/Ring',Enabled=true,Incoming=CallData.Incoming==true})
    end
    -- Replay UI state only. Do not re-run InitPhone, re-charge, re-register or duplicate business events.
    TriggerEvent("peak-hud:Client:ReloadPreferences")
    SendNUIMessage({ Action = "SetCurrentNetwork", Network = CurrentNetwork })
    if LoggedIn then
        Citizen.CreateThread(function()
            SendNUIMessage({ Action = "SetTax", Tax = Peak.SendCallback("Peak:GetTax") })
            if JobCenter and JobCenter.SetJobCenterData then pcall(JobCenter.SetJobCenterData) end
        end)
    end
    if IsPhoneOpen and PhoneDuoOpenPayload then
        SendNUIMessage(PhoneDuoOpenPayload)
        UpdatePlayerData()
    end
    Cb("Ok")
end)

RegisterNUICallback("ClosePhone", function(Data, Cb)
    ClosePhone(false)

    if Data.Crash then
        InitPhone(true)
    end

    Cb("Ok")
end)

RegisterNUICallback("Notifications/Click", function(Data, Cb)
    local Id, Token = tostring(Data.Id or ''), tostring(Data.Token or '')
    if Token == '' or not IsNotificationCurrent(Id, Token) then
        return Cb({ Success = false, Stale = true })
    end
    local NotifData = NotificationsIds[Id]
    if NotifData == nil or tostring(NotifData.Token) ~= Token then return Cb({ Success = false, Stale = true }) end
    if NotifData.ActionStarted and not (NotifData.Data and NotifData.Data.HideOnAction == false) then
        return Cb({ Success = false, Stale = true, Consumed = true })
    end
    local NotificationCallback = NotifData.OnAccept
    if not Data.Accepted then NotificationCallback = NotifData.OnReject end

    -- Recheck at the callback boundary so a lock/close/reset between request
    -- arrival and callback dispatch cannot consume an old private offer.
    if not IsNotificationCurrent(Id, Token) then return Cb({ Success = false, Stale = true }) end
    NotifData.ActionStarted = true

    if type(NotificationCallback) == 'function' then
        NotificationCallback(NotifData)
    elseif type(NotificationCallback) == 'string' then
        if string.find(NotificationCallback:lower(), ':server:') then
            TriggerServerEvent(NotificationCallback, NotifData.Data)
        else
            TriggerEvent(NotificationCallback, NotifData.Data)
        end
    end

    local consumed = not NotifData.Data or NotifData.Data.HideOnAction ~= false
    if consumed and NotificationsIds[Id] == NotifData and tostring(NotificationsIds[Id].Token) == Token then NotificationsIds[Id] = nil end

    Cb({ Success = true, Consumed = consumed })
end)

RegisterNUICallback("Notifications/Dismiss", function(Data, Cb)
    local Id, Token = tostring(Data.Id or ''), tostring(Data.Token or '')
    pruneNotifications()
    local notification = NotificationsIds[Id]
    if Token ~= '' and notification ~= nil and tostring(notification.Token) == Token then
        NotificationsIds[Id] = nil
    end
    Cb("Ok")
end)

RegisterNUICallback("Network/GetNetworks", function(Data, Cb)
    local Result = Peak.SendCallback("peak-phone:Server:Networks:GetNetworks")
    Cb(Result)
end)

RegisterNUICallback("Network/Connect", function(Data, Cb)
    local Result = Peak.SendCallback("peak-phone:Server:Networks:Connect", Data)
    if Result and Result.Success then
        CurrentNetwork = Data.Network
        if Phone.refreshMusicOutput then Phone.refreshMusicOutput() end
        SendNUIMessage({
            Action = "SetCurrentNetwork",
            Network = Data.Network
        })

        Citizen.CreateThread(function()
            while true do
                local CurrentCoords = Result.Coords
                local ConnectedEntity = Result.EntityNetId and NetworkGetEntityFromNetworkId(Result.EntityNetId) or 0

                if ConnectedEntity ~= 0 and DoesEntityExist(ConnectedEntity) then
                    CurrentCoords = GetEntityCoords(ConnectedEntity)
                end

                local ShouldDisconnect = #(GetEntityCoords(PlayerPedId()) - CurrentCoords) > Result.Size

                if Result.Kind == "vehicle" then
                    local CurrentVehicle = GetVehiclePedIsIn(PlayerPedId(), false)
                    if CurrentVehicle == 0 then
                        ShouldDisconnect = true
                    elseif CurrentNetwork and string.match(CurrentNetwork, "^peakify%-vehicle%-") then
                        local CurrentPlate = string.upper((GetVehicleNumberPlateText(CurrentVehicle) or ""):gsub("%s+", ""))
                        local TargetPlate = string.upper(tostring(Result.VehiclePlate or ""):gsub("%s+", ""))
                        if TargetPlate == "" or CurrentPlate ~= TargetPlate then
                            ShouldDisconnect = true
                        end
                    elseif Result.EntityNetId and NetworkGetNetworkIdFromEntity(CurrentVehicle) ~= Result.EntityNetId then
                        ShouldDisconnect = true
                    end
                end

                if ShouldDisconnect then
                    CurrentNetwork = ''
                    if Phone.refreshMusicOutput then Phone.refreshMusicOutput() end
                    SendNUIMessage({
                        Action = "SetCurrentNetwork",
                        Network = CurrentNetwork
                    })
                    break
                end
                Citizen.Wait(1000)
            end
        end)
    end
    Cb(Result and Result.Success or false)
end)

RegisterNUICallback("Phone/ToggleSounds", function(Data, Cb)
    TriggerServerEvent('peak-phone:Server:SetSoundState', Data.State)
    Cb("Ok")
end)

RegisterNUICallback("Phone/GetPreferences", function(Data, Cb)
    local Preferences = {
        ['Notifications.SMS'] = PhoneServices['peak-hud']:GetPreferenceById('Notifications.SMS'),
        ['Notifications.Tweet'] = PhoneServices['peak-hud']:GetPreferenceById('Notifications.Tweet'),
        ['Notifications.Email'] = PhoneServices['peak-hud']:GetPreferenceById('Notifications.Email'),
        ['Images.Embedded'] = PhoneServices['peak-hud']:GetPreferenceById('Images.Embedded'),
        ['Phone.Ringtone'] = PhoneServices['peak-hud']:GetPreferenceById('Phone.Ringtone'),
        RingtoneOptions = Phone.ringtoneOptions and Phone.ringtoneOptions() or {},
        ['Phone.Background'] = PhoneServices['peak-hud']:GetPreferenceById('Phone.Background'),
        ['Phone.DisableMovement'] = PhoneServices['peak-hud']:GetPreferenceById('Phone.DisableMovement')
    }
    Cb(Preferences)
end)

RegisterNUICallback("Phone/SetPreference", function(Data, Cb)
    if Data.Id and Data.Value ~= nil then
        PhoneServices['peak-hud']:SetPreferenceById(Data.Id, Data.Value)
        Cb("Ok")
    else
        Cb("Error")
    end
end)

RegisterNUICallback("GetProfilePicture", function(Data, Cb)
    local Avatar = Peak.SendCallback("peak-phone:Server:GetProfilePicture", Data.Phone)
    Cb(Avatar)
end)

local function ExitCameraMode()
    if Phone.Camera then Phone.Camera.stop() end
    InCamera = false
    DisablePause = false
    if Phone.DuoProp then Phone.DuoProp.refresh() end
    SendNUIMessage({ Action = "ShowCameraOverlay", Visible = false })
end

RegisterNUICallback("Phone/Selfie", function(Data, Cb)
    if Phone.VideoCameraActive or Phone.KiloLiveCameraActive then return Cb({__phoneError=true,error="End the video call or KiloGram live before using Camera."}) end
    if not IsPhoneOpen then return Cb({__phoneError=true,error="Open the phone before using Camera."}) end
    local opened,selfie
    if Phone.Camera then opened,selfie=Phone.Camera.start() end
    -- A stale wildcard-loaded camera module can acknowledge startup without
    -- owning a session. Never show a camera overlay for that false success.
    if opened and not InCamera then
        ExitCameraMode()
        return Cb({__phoneError=true,error="Camera initialization failed. Check the installed camera scripts."})
    end
    if not opened then
        return Cb({__phoneError=true,error=type(selfie)=='string' and selfie or "Another game camera is already active."})
    end
    SendNUIMessage({ Action = "ShowCameraOverlay", Visible = true, IsSelfie = selfie==true })

    Citizen.CreateThread(function()
        while InCamera do
            -- Back button to exit camera
            if IsControlJustPressed(0, 177) then
                -- Let NUI flush the final video chunk before destroying the camera.
                SendNUIMessage({ Action = "Camera/ExitRequested" })
            end
            
            Citizen.Wait(0)
        end
    end)

    -- Little workaround, because disabling the 199 and 200 key does not work (199 = P / 200 = ESC (pause menu alternate))
    Citizen.CreateThread(function()
        while InCamera do
            SetPauseMenuActive(false)
            
            Citizen.Wait(0)
        end
    end)

    Cb('Ok')
end)

-- NUI callback: Flip camera from the on-screen button
RegisterNUICallback("Phone/FlipCamera", function(Data, Cb)
    if not InCamera or not Phone.Camera then
        ExitCameraMode()
        return Cb({Success=false,Msg="Open Camera before switching lenses."})
    end
    local result=Phone.Camera.flip()
    if result.Success then SendNUIMessage({Action='ShowCameraOverlay',Visible=true,IsSelfie=result.IsSelfie}) end
    Cb(result)
end)

-- NUI callback: Exit camera from the on-screen button
RegisterNUICallback("Phone/ExitCamera", function(Data, Cb)
    -- Also acknowledge and clear a stale overlay after native ownership loss.
    ExitCameraMode()
    Cb('Ok')
end)

-- NUI callback: Capture photo from the on-screen button
RegisterNUICallback("Phone/CapturePhoto", function(Data, Cb)
    Cb({Success=CapturePhoto()==true})
end)

RegisterNUICallback("Utils/SetWaypoint", function(Data, Cb)
    SetNewWaypoint(Data.x, Data.y)
    Cb("ok")
end)

-- App Store Callbacks
RegisterNUICallback("GetInstalledApps", function(Data, Cb)
    local Apps = Peak.SendCallback("peak-phone:Server:GetInstalledApps")
    Cb(Apps)
end)

RegisterNUICallback("InstallApp", function(Data, Cb)
    local Result = Peak.SendCallback("peak-phone:Server:InstallApp", Data.AppId)
    if type(Result) == 'table' and Result.Success then
        SendNUIMessage({Action='AppInstalled', AppId=Data.AppId})
    end
    Cb(Result)
end)

RegisterNUICallback("UninstallApp", function(Data, Cb)
    local Result = Peak.SendCallback("peak-phone:Server:UninstallApp", Data.AppId)
    if type(Result) == 'table' and Result.Success then
        SendNUIMessage({Action='AppUninstalled', AppId=Data.AppId})
    end
    Cb(Result)
end)

RegisterNetEvent("peak-phone:Client:AppInstalled")
AddEventHandler("peak-phone:Client:AppInstalled", function(AppId)
    SendNUIMessage({
        Action = "AppInstalled",
        AppId = AppId
    })
    Peak.Functions.Notify("App installed successfully", "success")
end)

RegisterNetEvent("peak-phone:Client:AppUninstalled")
AddEventHandler("peak-phone:Client:AppUninstalled", function(AppId)
    SendNUIMessage({
        Action = "AppUninstalled",
        AppId = AppId
    })
    Peak.Functions.Notify("App uninstalled", "success")
end)

-- Functions
function InitPhone(Crashed)
    InitYellowPages()
    InitY()
    InitDocuments()

    SendNUIMessage({
        Action = "SetTax",
        Tax = Peak.SendCallback("Peak:GetTax")
    })

    local HasUnreadConversations = Peak.SendCallback("peak-phone:Server:HasUnreadConversations")
    if HasUnreadConversations then
        SetAppUnread("messages")
        Peak.Functions.Notify("You have unread messages.")
    end

    -- Always reload preferences to ensure wallpaper and brand are sent to NUI
    TriggerEvent("peak-hud:Client:ReloadPreferences")

    IsNetworkEnabled = Peak.SendCallback("peak-phone:Server:GetNetworkState")

    -- Sync Ringtone
    local Ringtone = PhoneServices['peak-hud']:GetPreferenceById('Phone.Ringtone')
    if Ringtone then
        TriggerServerEvent('peak-phone:Server:UpdateRingtone', Ringtone)
    end
end

function GetNearNetwork()
    local IsNearNetwork = Peak.SendCallback("peak-phone:Server:Networks:IsNearNetwork")
    return IsNearNetwork
end

local function OpenPhoneInternal(IsPressed)
    if not IsPressed then return end

    local refreshed = Phone.refreshClient()
    if not LoggedIn then
        local now = GetGameTimer()
        if not PhoneLastReadinessNotice or now - PhoneLastReadinessNotice >= 2500 then
            PhoneLastReadinessNotice = now
            local hasCharacter = Phone.Client and Phone.Client.Data and Phone.Client.Data.citizenid
            local message = hasCharacter and Phone.Client.HasPhone == false
                and "You do not have your phone device."
                or (refreshed and "Phone inventory state is still loading. Try again in a moment." or "Phone could not load your character. Reconnect or ask staff to run phone_doctor.")
            Peak.Functions.Notify(message, "error")
        end
        return
    end
    local PlayerData = Peak.Functions.GetPlayerData()
    if PlayerData.metadata.isdead or PlayerData.metadata.ishandcuffed then return end
    
    -- The inventory adapter accepts the phone in any slot.
    if not PhoneServices['peak-inventory']:HasEnoughOfItem(PhoneConfig.PhoneItem,1) then
        Peak.Functions.Notify("You do not have your phone device.", "error")
        return
    end
    
    -- Check for SIM card in phone
    local Result = Peak.SendCallback("peak-phone:Server:HasActiveSim")
    local HasSim = Result and Result.HasSim
    local SimData = Result and Result.SimData
    local DeviceData = Result and Result.DeviceData
    
    if not DeviceData then
        Peak.Functions.Notify("Phone identity is not ready. Ask staff to run phone_doctor.", "error")
        return
    end
    
    -- Store the active SIM data for use in phone
    ActiveSimData = SimData
    if Phone.DuoProp then Phone.DuoProp.setHasSim(HasSim==true) end

    TriggerEvent('peak-ui:Tutorial:PhoneOpened')

    IsPhoneOpen = true
    LocalPlayer.state:set('phoneOpen', true, true) -- Sync phone open state for AirShare
    local HasVPN = (Result and Result.HasBurnerSim) or PhoneServices['peak-inventory']:HasEnoughOfItem('burner_sim', 1)
    local HasRacingUsb, HasPDRacingUsb, RacingAlias = false, false, ''
    if Phone.integrationAvailable('racing') then
        local ok, values = pcall(function() return exports['peak-racing']:HasRacingUsb() end)
        if ok and type(values)=='table' then HasRacingUsb, HasPDRacingUsb, RacingAlias = table.unpack(values) end
    end

    PhoneDuoTyping,PhoneDuoCursor = false,true
    ApplyPhoneInputMode()

    Citizen.CreateThread(function()
        while IsPhoneOpen do
            Citizen.Wait(0)

            -- Mouse movement belongs to the phone; gameplay mode still allows movement, sprint and jump.
            DisableControlAction(0, 1, true)
            DisableControlAction(0, 2, true)

            -- disable pause
            DisableControlAction(0, 199, true)
            DisableControlAction(0, 200, true)

            -- disable attack
            DisableControlAction(0, 24, true)
            DisableControlAction(0, 25, true)
            DisableControlAction(0, 68, true)
            DisableControlAction(0, 69, true)
            DisableControlAction(0, 70, true)
            DisableControlAction(0, 91, true)
            DisableControlAction(0, 92, true)
            DisableControlAction(0, 114, true)
            DisableControlAction(0, 121, true)
            DisableControlAction(0, 140, true)
            DisableControlAction(0, 141, true)
            DisableControlAction(0, 142, true)
            DisableControlAction(0, 257, true)
            DisableControlAction(0, 263, true)
            DisableControlAction(0, 264, true)
            DisableControlAction(0, 331, true)

            -- E belongs to the foldable interface, not world interactions or the vehicle horn.
            DisableControlAction(0, 38, true)
            DisableControlAction(0, 51, true)
            DisableControlAction(0, 86, true)
            -- disable chat
            DisableControlAction(0, 245, true)
        end

        SetNuiFocusKeepInput(false)
    end)

    local PhoneNumberToUse = ''
    if ActiveSimData and ActiveSimData.PhoneNumber then
        PhoneNumberToUse = ActiveSimData.PhoneNumber
    end

    local Time = PhoneServices['peak-sync']:GetCurrentTime()
    PhoneDuoOpenPayload = {
        Action = "OpenPhone",
        -- Local IndexedDB videos are scoped by server + character + active SIM.
        ServerKey = tostring(GetCurrentServerEndpoint() or "unknown"),
        Capabilities = Phone.Client.Capabilities,
        OwnerConfig = Phone.Client.OwnerConfig or {},
        HasVPN = HasVPN,
        HasRacingUsb = HasRacingUsb,
        HasPDRacingUsb = HasPDRacingUsb,
        RacingAlias = RacingAlias,
        Weather = PhoneServices['peak-sync']:GetCurrentWeather(),
        Time = {Time.Hour, Time.Minute},
        IsNearNetwork = GetNearNetwork(),
        IsNetworkEnabled = IsNetworkEnabled,
        PlayerData = {
            Id = PlayerData.source,
            Cid = PlayerData.citizenid,
            BankId = PlayerData.charinfo.account,
            PhoneNumber = PhoneNumberToUse,  -- Use SIM phone number
            DeviceId = DeviceData.DeviceId,
            DeviceGeneration = DeviceData.Generation,
            SimId = DeviceData.SimId,
            DeviceLocked = DeviceData.Locked == true or DeviceData.Status ~= 'active',
            DeviceStatus = DeviceData.Status,
            HasSim = HasSim == true,
            Cash = PlayerData.money.cash,
            Bank = PhoneServices['peak-financials']:GetAccountBalance(PlayerData.charinfo.account),
            Casino = PlayerData.money.casino,
            Crypto = PlayerData.money.crypto,
            RoomId = PlayerData.metadata.apartmentid,
            Job = PlayerData.job.name,
            CharName = PlayerData.charinfo.firstname .. ' ' .. PlayerData.charinfo.lastname
        },
    }
    SendNUIMessage(PhoneDuoOpenPayload)

    StartPhoneAnim()
    if Phone.onPhoneVisibility then Phone.onPhoneVisibility(true) end
    
end

function OpenPhone(IsPressed)
    local ok, err = pcall(OpenPhoneInternal, IsPressed)
    if ok then return end
    -- Opening is transactional from the player's perspective: no failed callback
    -- may leave NUI focus, input capture, animation, or replicated open state behind.
    ClosePhone(true)
    print('[Peak Duo] Phone open failed: ' .. tostring(err))
    Peak.Functions.Notify('The phone could not open. Staff can check the server console.', 'error')
end

local MusicMoveActive = false
RegisterCommand('movemusic', function()
    if not PhoneDuoSession then
        Peak.Functions.Notify('The phone interface is still loading. Try again in a moment.', 'error')
        return
    end
    if IsPhoneOpen or InCamera then
        Peak.Functions.Notify('Put the phone away before moving the music player.', 'error')
        return
    end
    MusicMoveActive = true
    SetNuiFocus(true, true)
    SetNuiFocusKeepInput(false)
    SendNUIMessage({Action='Music/Move'})
end, false)

RegisterNUICallback('Music/FinishMove', function(_, Cb)
    if MusicMoveActive then
        MusicMoveActive = false
        if not IsPhoneOpen and not InCamera then
            SetNuiFocus(false, false)
            SetNuiFocusKeepInput(false)
        end
    end
    Cb({Success=true})
end)

RegisterNUICallback('Music/OpenPhone', function(_, Cb)
    if MusicMoveActive then MusicMoveActive = false end
    OpenPhone(true)
    if IsPhoneOpen then SendNUIMessage({Action='SwitchToApp', App='peakify'}) end
    Cb({Success=IsPhoneOpen})
end)

function ClosePhone(Forced)
    local wasPhotoCamera=InCamera
    if Phone.Camera then Phone.Camera.stop() end
    if Phone.onPhoneVisibility then Phone.onPhoneVisibility(false) end
    IsPhoneOpen, CurrentApp = false, ""
    LocalPlayer.state:set('phoneOpen', false, true) -- Sync phone open state for AirShare
    StopPhoneAnim()
    SetNuiFocus(false, false)
    SetNuiFocusKeepInput(false)
    PhoneDuoTyping, PhoneVisibleApps = false, {}
    if wasPhotoCamera then InCamera=false;DisablePause=false;SendNUIMessage({Action="ShowCameraOverlay",Visible=false}) end
    PhoneDuoOpenPayload = nil
    -- Always acknowledge the visual close, including exports and non-forced internal closes.
    SendNUIMessage({ Action = "ClosePhone" })
end
exports("ClosePhone", ClosePhone)

AddEventHandler("onResourceStop", function(ResourceName)
    if ResourceName ~= GetCurrentResourceName() then return end
    if Phone.Camera then Phone.Camera.stop() end
    if IsPhoneOpen or InCamera or MusicMoveActive then
        SetNuiFocus(false, false)
        SetNuiFocusKeepInput(false)
        LocalPlayer.state:set('phoneOpen', false, true)
        StopPhoneAnim()
    end
    InCamera=false
end)

RegisterNetEvent("peak-phone:Client:ClosePhone", ClosePhone)

function SetAppUnread(App)
    SendNUIMessage({
        Action = "SetAppUnread",
        App = App
    })
end
exports("SetAppUnread", SetAppUnread)

RegisterNetEvent("peak-phone:Client:SetAppUnread", SetAppUnread)

function UpdatePlayerData()
    local PlayerData = Peak.Functions.GetPlayerData()
    local DeviceData = Phone.Client and Phone.Client.Device or {}
    
    -- Use SIM phone number if available
    local PhoneNumberToUse = DeviceData.PhoneNumber or PlayerData.charinfo.phone
    if ActiveSimData and ActiveSimData.PhoneNumber then
        PhoneNumberToUse = ActiveSimData.PhoneNumber
    end
    
    SendNUIMessage({
        Action = "UpdatePlayerData",
        PlayerData = {
            Id = PlayerData.source,
            Cid = PlayerData.citizenid,
            BankId = PlayerData.charinfo.account,
            PhoneNumber = PhoneNumberToUse, -- Uses active SIM number
            Cash = PlayerData.money.cash,
            Bank = PhoneServices['peak-financials']:GetAccountBalance(PlayerData.charinfo.account),
            Casino = PlayerData.money.casino,
            Crypto = PlayerData.money.crypto,
            RoomId = PlayerData.metadata.apartmentid,
            DeviceId = DeviceData.DeviceId,
            DeviceGeneration = DeviceData.Generation,
            SimId = DeviceData.SimId,
            HasSim = DeviceData.SimId ~= nil,
            Job = PlayerData.job.name,
            CharName = PlayerData.charinfo.firstname .. ' ' .. PlayerData.charinfo.lastname
        },
    })
end

--[[
    You can pass custom data into `Data` table, but there's also a few Data entries that you can use to control the notification, these are:
    - HideOnAction = true/false
        Auto hide notification when Accept/Reject button is clicked.
]]

function Notification(Id, Icon, IconColor, Title, Text, ShowTimer, ShowCountdown, OnAccept, OnReject, Data)
    -- Removed LoggedIn check - if player can open phone, they're logged in
    if not PhoneServices['peak-inventory']:HasEnoughOfItem("phone", 1) then
        return
    end

    pruneNotifications()
    NotificationSequence = NotificationSequence + 1
    local key = tostring(Id or '')
    local token = NotificationSequence
    local now = notificationNow()
    NotificationsIds[key] = {
        OnAccept = OnAccept,
        OnReject = OnReject,
        Data = Data,
        Id = key,
        Token = token,
        CreatedAt = now,
        Lifetime = MAX_NOTIFICATION_AGE,
        Sequence = NotificationSequence,
    }
    pruneNotifications(now)

    SendNUIMessage({
        Action = "Notification",
        Id = key,
        Token = token,
        IconColor = IconColor[1],
        BgColor = IconColor[2],
        Icon = Icon,
        Title = Title,
        Text = Text,
        ShowTimer = ShowTimer,
        ShowCountdown = ShowCountdown,
        Data = Data,
        HasAccept = OnAccept ~= nil,
        HasReject = OnReject ~= nil,
        HasSpeaker = Data and Data.HasSpeaker or false,
        SpeakerEnabled = Data and Data.SpeakerEnabled or false,
    })
    return token
end

RegisterNetEvent("peak-phone:Client:Notification")
AddEventHandler("peak-phone:Client:Notification", function(...)
    Notification(...)
end)

function UpdateNotification(Id, RemoveTimer, RemoveCountdown, Title, Text, RemoveActions, HideImmediately, HasSpeaker, SpeakerEnabled, Token)
    local key = tostring(Id or '')
    pruneNotifications()
    local notification = NotificationsIds[key]
    if notification == nil or (Token ~= nil and tostring(notification.Token) ~= tostring(Token)) then return false end
    if notification then notification.CreatedAt = notificationNow() end
    if RemoveActions then
        NotificationsIds[key] = nil
    end

    SendNUIMessage({
        Action = "UpdateNotification",
        Id = key,
        Token = notification and notification.Token or Token,
        RemoveTimer = RemoveTimer,
        RemoveCountdown = RemoveCountdown,
        Title = Title,
        Text = Text,
        RemoveActions = RemoveActions,
        HideImmediately = HideImmediately,
        HasSpeaker = HasSpeaker,
        SpeakerEnabled = SpeakerEnabled,
    })
    return true
end

RegisterNetEvent("peak-phone:Client:UpdateNotification")
AddEventHandler("peak-phone:Client:UpdateNotification", function(...)
    if not PhoneServices['peak-inventory']:HasEnoughOfItem("phone", 1) then
        return
    end

    UpdateNotification(...)
end)

function RemoveNotification(Id, Token)
    if not PhoneServices['peak-inventory']:HasEnoughOfItem("phone", 1) then
        return
    end

    local key = tostring(Id or '')
    pruneNotifications()
    local notification = NotificationsIds[key]
    if notification == nil or (Token ~= nil and tostring(notification.Token) ~= tostring(Token)) then return false end
    NotificationsIds[key] = nil
    SendNUIMessage({
        Action = "RemoveNotification",
        Id = key,
        Token = notification and notification.Token or Token,
    })
    return true
end

RegisterNetEvent("peak-phone:Client:RemoveNotification")
AddEventHandler("peak-phone:Client:RemoveNotification", function(...)
    RemoveNotification(...)
end)

RegisterNetEvent("peak-phone:Client:RemoveNotificationById")
AddEventHandler("peak-phone:Client:RemoveNotificationById", function(Data)
    UpdateNotification(Data.Id, true, true, nil, nil, true, true)
end)

exports("Notification", Notification)
exports("UpdateNotification", UpdateNotification)
exports("RemoveNotification", RemoveNotification)

RegisterNetEvent("peak-phone:Client:SetNetworkState")
AddEventHandler("peak-phone:Client:SetNetworkState", function(State)
    IsNetworkEnabled = State
    SendNUIMessage({ Action = "Duo/NetworkState", Enabled = State })
end)
