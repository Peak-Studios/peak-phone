Calls = {
    Calls = {},
    Loaded = false
}

function ClearCallHistory()
    Calls.Calls = {}
    Calls.Loaded = false
end

function LoadCallHistory()
    if Calls.Loaded then return end
    local Result = Peak.SendCallback("peak-phone:Server:Calls:GetCalls")
    Calls.Calls = Result or {}
    Calls.Loaded = true
end

RegisterNUICallback("Calls/GetCalls", function(Data, Cb)
    LoadCallHistory()
    Cb(Calls.Calls)
end)

RegisterNetEvent("peak-phone:Client:AddCall")
AddEventHandler("peak-phone:Client:AddCall", function(Data)
    -- History is persisted by the authoritative call service, not by a client request.
    
    -- Add to local cache (insert at beginning for newest first)
    table.insert(Calls.Calls, 1, Data)
    SetAppUnread("calls")
end)
AddEventHandler("Peak:Client:OnPlayerUnload", ClearCallHistory)
