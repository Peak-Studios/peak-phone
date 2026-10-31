if not Phone.legacyAvailable('bankbusters') then return end
RegisterNUICallback("BankBusters/GetBusters", function(Data, Cb)
    local Result = Peak.SendCallback("peak-phone:Server:GetBusters")
    Cb(Result)
end)

RegisterNUICallback("BankBusters/ClaimHeist", function(Data, Cb)
    local Result = Peak.SendCallback("peak-phone:Server:ClaimHeist", Data)
    Cb(Result)
end)