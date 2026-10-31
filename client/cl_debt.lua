if not Phone.legacyAvailable('debt') then return end
RegisterNUICallback("Debt/GetDebt", function(Data, Cb)
    local Result = Peak.SendCallback("peak-misc:Server:GetDebts")
    Cb(Result)
end)

RegisterNUICallback("Debt/PayDebt", function(Data, Cb)
    local Result = Peak.SendCallback("peak-misc:Server:PayDebt", Data)
    Cb(Result)
end)