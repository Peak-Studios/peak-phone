RegisterNUICallback("Details/GetLicenses", function(Data, Cb)
    local Result = Peak.SendCallback("peak-phone:Server:Details:GetLicenses")
    Cb(Result)
end)