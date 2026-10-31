RegisterNUICallback("Mails/GetMails", function(Data, Cb)
    Peak.Functions.TriggerCallback('peak-phone:Server:Mails:GetMails', function(Mails)
        Cb(Mails)
    end)
end)

RegisterNUICallback("Mails/DeleteMail", function(Data, Cb)
    Peak.Functions.TriggerCallback('peak-phone:Server:Mails:DeleteMail', function(Success)
        Cb(Success)
    end, Data.id)
end)

RegisterNUICallback("Mails/MarkAsRead", function(Data, Cb)
    TriggerServerEvent('peak-phone:Server:Mails:MarkAsRead', Data.id)
    Cb(true)
end)

RegisterNUICallback("Mails/SendMail", function(Data, Cb)
    Cb(Peak.SendCallback('peak-phone:Server:Mails:SendMail', Data))
end)

RegisterNUICallback("Mails/ImportOldMails", function(Data, Cb)
    Cb(false) -- Client-authored legacy imports are not trusted. Use a server-side migration.
end)

-- Set GPS waypoint from email button
RegisterNUICallback("Mails/SetGPS", function(Data, Cb)
    if Data and Data.x and Data.y then
        SetNewWaypoint(Data.x + 0.0, Data.y + 0.0)
        Peak.Functions.Notify("GPS waypoint set!", "success")
    end
    Cb("ok")
end)

RegisterNetEvent("peak-phone:Client:Mails:AddMail")
AddEventHandler("peak-phone:Client:Mails:AddMail", function(Data)
    if IsPhoneAppMounted('mails') then
        SendNUIMessage({
            Action = "Mails/UpdateMails",
            Mail = Data,
        })
    end
    if not IsPhoneAppVisible('mails') then
        if PhoneServices['peak-hud']:GetPreferenceById('Notifications.Email') then
            Notification("new-mail-" .. math.random(111, 999), "fas fa-envelope-open", { "white", "#44B5C4" }, 'Email', Data.message, nil, nil, nil, nil, {
                App = "mails",
                Action = "Mails/OpenMail",
                Id = Data.id,
            })
        end
        SetAppUnread("mails")
    end
end)
