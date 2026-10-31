Messages = {
    CurrentChat = nil,
}

function Messages.SetChats()
    local Result = Peak.SendCallback("peak-phone:Server:Messages:GetChats")
    SendNUIMessage({
        Action = "Messages/SetChats",
        Chats = Result,
    })
end

RegisterNUICallback("Messages/GetChats", function(Data, Cb)
    local Result = Peak.SendCallback("peak-phone:Server:Messages:GetChats")
    Cb(Result)
end)

RegisterNUICallback("Messages/SetChatRead", function(Data, Cb)
    TriggerServerEvent('peak-phone:Server:Messages:SetChatRead', Data)
    Cb("Ok")
end)

RegisterNUICallback("Messages/MarkAllAsRead", function(Data, Cb)
    TriggerServerEvent('peak-phone:Server:Messages:MarkAllAsRead', {})
    Cb("Ok")
end)

RegisterNUICallback("Messages/SendMessage", function(Data, Cb)
    local Result = Peak.SendCallback("peak-phone:Server:Messages:SendMessage", Data)
    Cb(Result)
end)

for _, Route in ipairs({"GetInbox", "GetHistory", "GetHistoryAround", "Search", "GetOperation", "SetReaction", "SetMute", "GetMute"}) do
    RegisterNUICallback("Messages/" .. Route, function(Data, Cb)
        Cb(Peak.SendCallback("peak-phone:Server:Messages:" .. Route, Data or {}))
    end)
end

RegisterNetEvent("peak-phone:Client:Messages:RefreshMessagesChat")
AddEventHandler("peak-phone:Client:Messages:RefreshMessagesChat", function(Data, Notify)
    if Notify and not IsPhoneAppVisible('messages') then
        if Data.Muted~=true and PhoneServices['peak-hud']:GetPreferenceById('Notifications.SMS') then
            Notification("new-sms-" .. Data.Phone .. '-' .. math.random(1, 999), "fas fa-comment", { "white", "#8FC24C" }, Data.Name, Data.Message, nil, nil, nil, nil, {App='messages',Phone=Data.Phone,MessageId=tonumber(Data.MessageId)})
        end
        SetAppUnread("messages")
        if not IsPhoneAppMounted('messages') then return end
    end

    SendNUIMessage({Action='Messages/Refresh',Phone=type(Data)=='table' and Data.Phone or nil,
        MessageId=type(Data)=='table' and tonumber(Data.MessageId) or nil})
    Messages.SetChats()
end)
