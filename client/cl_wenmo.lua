RegisterNUICallback("Wenmo/GetBankData", function(Data, Cb)
    local Result = Peak.SendCallback("peak-phone:Server:Wenmo:GetBankData")
    Cb(Result)
end)

RegisterNUICallback("Wenmo/SendMoney", function(Data, Cb)
    local Result = Peak.SendCallback("peak-phone:Server:Wenmo:SendMoney", Data)
    if Result.Success then
        UpdatePlayerData()
        -- Frontend refreshes data via LoadTransactions -> GetBankData, so no need to push updates here
    end
    Cb(Result)
end)

for _, Route in ipairs({"CreateRequest", "PayRequest", "DeclineRequest"}) do
    RegisterNUICallback("Wenmo/" .. Route, function(Data, Cb)
        local Result = Peak.SendCallback("peak-phone:Server:Wenmo:" .. Route, Data or {})
        if Route == "PayRequest" and Result and Result.Success then UpdatePlayerData() end
        Cb(Result)
    end)
end
