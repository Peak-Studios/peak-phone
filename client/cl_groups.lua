-- =============================================
-- Group Messaging Client Logic
-- =============================================

Groups = {
    CurrentGroup = nil,
}

function Groups.SetGroups()
    local Result = Peak.SendCallback("peak-phone:Server:Groups:GetGroups")
    SendNUIMessage({
        Action = "Groups/SetGroups",
        Groups = Result,
    })
end

-- =============================================
-- NUI Callbacks
-- =============================================

RegisterNUICallback("Groups/GetGroups", function(Data, Cb)
    local Result = Peak.SendCallback("peak-phone:Server:Groups:GetGroups")
    Cb(Result)
end)

RegisterNUICallback("Groups/CreateGroup", function(Data, Cb)
    local Result = Peak.SendCallback("peak-phone:Server:Groups:CreateGroup", Data)
    if Result.Success then
        Groups.SetGroups()
    end
    Cb(Result)
end)

RegisterNUICallback("Groups/SetReaction", function(Data, Cb)
    Cb(Peak.SendCallback("peak-phone:Server:Groups:SetReaction", Data or {}))
end)

RegisterNUICallback("Groups/GetMessages", function(Data, Cb)
    local Result = Peak.SendCallback("peak-phone:Server:Groups:GetMessages", Data)
    Cb(Result)
end)

RegisterNUICallback("Groups/GetMessagesAround", function(Data, Cb)
    Cb(Peak.SendCallback("peak-phone:Server:Groups:GetMessagesAround", Data or {}))
end)

RegisterNUICallback("Groups/SendMessage", function(Data, Cb)
    Data=type(Data)=='table' and Data or {}
    Data.OperationId=Data.OperationId or ('group-'..GetGameTimer()..'-'..math.random(100000,999999))
    local Result = Peak.SendCallback("peak-phone:Server:Groups:SendMessage", Data)
    Cb(Result)
end)

RegisterNUICallback("Groups/GetInfo", function(Data, Cb)
    local Result = Peak.SendCallback("peak-phone:Server:Groups:GetInfo", Data)
    Cb(Result)
end)

RegisterNUICallback("Groups/AddMember", function(Data, Cb)
    local Result = Peak.SendCallback("peak-phone:Server:Groups:AddMember", Data)
    Cb(Result)
end)

RegisterNUICallback("Groups/RemoveMember", function(Data, Cb)
    local Result = Peak.SendCallback("peak-phone:Server:Groups:RemoveMember", Data)
    Cb(Result)
end)

RegisterNUICallback("Groups/ToggleAdmin", function(Data, Cb)
    local Result = Peak.SendCallback("peak-phone:Server:Groups:ToggleAdmin", Data)
    Cb(Result)
end)

RegisterNUICallback("Groups/LeaveGroup", function(Data, Cb)
    local Result = Peak.SendCallback("peak-phone:Server:Groups:LeaveGroup", Data)
    if Result.Success then
        Groups.SetGroups()
    end
    Cb(Result)
end)

RegisterNUICallback("Groups/SetRead", function(Data, Cb)
    TriggerServerEvent('peak-phone:Server:Groups:SetRead', Data)
    Cb("Ok")
end)

-- =============================================
-- Server Events
-- =============================================

RegisterNetEvent("peak-phone:Client:Groups:RefreshGroups")
AddEventHandler("peak-phone:Client:Groups:RefreshGroups", function(Data, Notify)
    if Notify and not IsPhoneAppVisible('messages') then
        if PhoneServices['peak-hud']:GetPreferenceById('Notifications.SMS') then
            Notification("new-group-" .. (Data.GroupId or '') .. '-' .. math.random(1, 999), "fas fa-users", { "white", "#8FC24C" }, Data.Name or "Group", "You've been added to a group", nil, nil, nil, nil, { App = 'messages', GroupId = Data.GroupId, GroupName = Data.Name or 'Group' })
        end
        SetAppUnread("messages")
        if not IsPhoneAppMounted('messages') then return end
    end

    SendNUIMessage({Action='Groups/RefreshGroups',GroupId=type(Data)=='table' and Data.GroupId or nil,
        GroupName=type(Data)=='table' and Data.Name or nil})
    Groups.SetGroups()
end)

RegisterNetEvent("peak-phone:Client:Groups:RefreshMessages")
AddEventHandler("peak-phone:Client:Groups:RefreshMessages", function(Data, Notify)
    if Notify and not IsPhoneAppVisible('messages') then
        if PhoneServices['peak-hud']:GetPreferenceById('Notifications.SMS') then
            local Message = Data.Message or "New message"
            if #Message > 30 then
                Message = string.sub(Message, 1, 30) .. "..."
            end
            Notification("new-group-msg-" .. Data.GroupId .. '-' .. math.random(1, 999), "fas fa-users", { "white", "#8FC24C" }, Data.GroupName or "Group", Data.SenderName .. ": " .. Message, nil, nil, nil, nil, {App='messages',GroupId=Data.GroupId,GroupName=Data.GroupName,MessageId=tonumber(Data.MessageId)})
        end
        SetAppUnread("messages")
        if not IsPhoneAppMounted('messages') then return end
    end

    -- Refresh messages if viewing this group
    SendNUIMessage({
        Action = "Groups/RefreshMessages",
        GroupId = Data.GroupId,
        GroupName = Data.GroupName,
        SenderName = Data.SenderName,
        MessageId = tonumber(Data.MessageId),
        Message = Data.Message
    })
end)
