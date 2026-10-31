Peak = PhonePeak

-- Get nearby players for sharing
function GetNearbyPlayers()
    local PlayerPed = PlayerPedId()
    local PlayerCoords = GetEntityCoords(PlayerPed)
    local NearbyPlayers = {}

    for _, targetId in ipairs(GetActivePlayers()) do
        local LocalPlayerId = PlayerId()
        if targetId ~= LocalPlayerId then
            local TargetPed = GetPlayerPed(targetId)
            if TargetPed ~= 0 then
                local TargetCoords = GetEntityCoords(TargetPed)
                local Distance = #(PlayerCoords - TargetCoords)

                if Distance <= 5.0 then
                    local ServerId = GetPlayerServerId(targetId)
                    local TargetName = GetPlayerName(targetId)
                    NearbyPlayers[#NearbyPlayers + 1] = {
                        source = ServerId,
                        name = TargetName,
                        distance = math.floor(Distance)
                    }
                end
            end
        end
    end

    return NearbyPlayers
end

-- Refresh gallery photos
RegisterNetEvent('peak-phone:Client:Gallery:RefreshPhotos')
AddEventHandler('peak-phone:Client:Gallery:RefreshPhotos', function()
    if not IsPhoneAppMounted('gallery') then return end
    
    SendNUIMessage({
        Action = "Gallery/RefreshPhotos"
    })
end)

-- NUI Callbacks
RegisterNUICallback("Gallery/GetPhotos", function(Data, Cb)
    local Photos = Peak.SendCallback("peak-phone:Server:Gallery:GetPhotos")
    
    -- Check if we are in Mission 3 Photo Mode and update NUI
    local isMissionMode = false
    if Phone.started('peak-lamarmissions') then local ok,value=pcall(function() return exports['peak-lamarmissions']:IsMission3PhotoMode() end);isMissionMode=ok and value==true end
    SendNUIMessage({
        Action = "Gallery/SetLamarMode",
        Enabled = isMissionMode
    })
    
    Cb(Photos)
end)

RegisterNUICallback("Gallery/DeletePhoto", function(Data, Cb)
    Cb(Peak.SendCallback("peak-phone:portable:gallery", "DeletePhoto", Data))
end)

RegisterNUICallback("Gallery/GetNearbyPlayers", function(Data, Cb)
    local NearbyPlayers = GetNearbyPlayers()
    Cb(NearbyPlayers)
end)

RegisterNUICallback("Gallery/SharePhoto", function(Data, Cb)
    Cb(Peak.SendCallback("peak-phone:portable:gallery", "SharePhoto", Data))
end)

RegisterNUICallback("Gallery/PostToTwatter", function(Data, Cb)
    Cb(Peak.SendCallback("peak-phone:portable:gallery", "PostToTwatter", Data))
end)

RegisterNUICallback("Gallery/ShareToSpecificPlayer", function(Data, Cb)
    Cb(Peak.SendCallback("peak-phone:portable:gallery", "ShareToSpecificPlayer", Data))
end)

RegisterNUICallback("Gallery/ShareToAllNearby", function(Data, Cb)
    Cb(Peak.SendCallback("peak-phone:portable:gallery", "ShareToAllNearby", Data))
end)

RegisterNUICallback("Gallery/SendInMessage", function(Data, Cb)
    if not Data.PhotoUrl or not Data.Phone then return Cb(false) end

    -- Send message with photo as attachment
    local Result = Peak.SendCallback("peak-phone:Server:Messages:SendMessage", {
        Phone = Data.Phone,
        Message = Data.Message or "",
        Attachments = {Data.PhotoUrl}
    })

    Cb(Result)
end)

RegisterNUICallback("Gallery/ImportPhoto", function(Data, Cb)
    Cb(Peak.SendCallback("peak-phone:portable:gallery", "ImportPhoto", Data))
end)

RegisterNUICallback("UpdateProfilePicture", function(Data, Cb)
    TriggerServerEvent("peak-phone:Server:UpdateProfilePicture", Data)
    Cb(true)
end)

-- Capture is already saved by the server. Refresh the native Photos view when
-- the phone is still open; never reopen the phone or show a post-to-Y prompt.
RegisterNetEvent('peak-phone:Client:Gallery:PhotoCaptured')
AddEventHandler('peak-phone:Client:Gallery:PhotoCaptured', function()
    if not IsPhoneOpen then return end
    SendNUIMessage({ Action = "Gallery/RefreshPhotos" })
end)

-- Handle shared photo received
RegisterNetEvent('peak-phone:Client:Gallery:ReceiveSharedPhoto')
AddEventHandler('peak-phone:Client:Gallery:ReceiveSharedPhoto', function(Data)
    -- Show notification
    Notification(
        "shared-photo-" .. GetGameTimer(),
        "fas fa-image",
        { "white", "#667eea" },
        "Photo Shared",
        Data.FromName .. " shared a photo with you",
        false,
        false,
        function(NotifData)
            -- Accept: Open gallery with shared photo
            Citizen.Wait(500)
            if not IsNotificationCurrent(NotifData.Id, NotifData.Token) then return end
            SendNUIMessage({
                Action = "SetCurrentApp",
                App = "gallery"
            })
            Citizen.Wait(300)
            if not IsNotificationCurrent(NotifData.Id, NotifData.Token) then return end
            SendNUIMessage({
                Action = "Gallery/SharedPhoto",
                PhotoUrl = Data.PhotoUrl,
                FromName = Data.FromName
            })
        end,
        nil,
        { PhotoUrl = Data.PhotoUrl }
    )
end)

-- Handle screenshot request from server (fallback method)
RegisterNetEvent('peak-phone:Client:Gallery:TakeScreenshot')
AddEventHandler('peak-phone:Client:Gallery:TakeScreenshot', function(ScreenshotId)
    -- This would be handled by a screenshot resource if available
end)

-- Mission 3: Send photo to Lamar
RegisterNUICallback("Gallery/SendToLamar", function(Data, Cb)
    if not Data or not Data.PhotoUrl then
        return Cb(false)
    end
    if not Phone.started('peak-lamarmissions') then return Cb(false) end
    TriggerServerEvent('peak-lamarmissions:Server:M3:PhotoSentToLamar', Data.PhotoUrl)
    Cb(true)
end)

-- Mission 3: Toggle Lamar send mode in Gallery
RegisterNetEvent('peak-phone:Client:Gallery:SetLamarMode')
AddEventHandler('peak-phone:Client:Gallery:SetLamarMode', function(enabled)
    SendNUIMessage({
        Action = "Gallery/SetLamarMode",
        Enabled = enabled or false
    })
end)
