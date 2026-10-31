RegisterNUICallback("DOJ/GetUsers", function(Data, Cb)
    local Result = Peak.SendCallback("peak-phone:Server:DOJ:GetUsers")
    Cb(Result)
end)

RegisterNUICallback("DOJ/SetStatus", function(Data, Cb)
    Peak.TriggerServer("peak-phone:Server:DOJ:SetStatus", Data)
    Cb("ok")
end)