if not Phone.legacyAvailable('racing') then return end
RegisterNUICallback("Racing/GetTracks", function(Data, Cb)
    local Result = exports['peak-racing']:GetTracks(Data)
    Cb(Result)
end)

RegisterNUICallback("Racing/GetRaces", function(Data, Cb)
    local Result = Peak.SendCallback("peak-racing:Server:GetRaces", Data.IsGov)
    Cb(Result)
end)

RegisterNUICallback("Racing/GetRaceById", function(Data, Cb)
    local Result = exports['peak-racing']:GetRaceById(Data.Id)
    Cb(Result)
end)

RegisterNUICallback("Racing/GetLeaderboard", function(Data, Cb)
    local Result = exports['peak-racing']:GetTrackLeaderboard(Data.Id)
    Cb(Result)
end)

RegisterNUICallback("Racing/SetGPS", function(Data, Cb)
    exports['peak-racing']:SetGPS(Data)
    Cb("Ok")
end)

RegisterNUICallback("Racing/Preview", function(Data, Cb)
    exports['peak-racing']:Preview(Data)
    Cb("Ok")
end)

RegisterNUICallback("Racing/CreateRace", function(Data, Cb)
    local Result = exports['peak-racing']:CreateRace(Data)
    Cb(Result)
end)

RegisterNUICallback("Racing/StartRace", function(Data, Cb)
    exports['peak-racing']:StartRace()
    Cb("Ok")
end)

RegisterNUICallback("Racing/EndRace", function(Data, Cb)
    exports['peak-racing']:EndRace()
    Cb("Ok")
end)

RegisterNUICallback("Racing/LeaveRace", function(Data, Cb)
    exports['peak-racing']:LeaveRace(Data)
    Cb("Ok")
end)

RegisterNUICallback("Racing/JoinRace", function(Data, Cb)
    local Result = exports['peak-racing']:JoinRace(Data)
    Cb(Result)
end)

RegisterNUICallback("Racing/GetTexts", function(Data, Cb)
    local Result = exports['peak-racing']:GetRaceTexts(Data)
    Cb(Result)
end)

RegisterNUICallback("Racing/SendMessage", function(Data, Cb)
    exports['peak-racing']:SendTextMessage(Data)
    Cb("Ok")
end)

-- Creation
RegisterNUICallback("Racing/CanCreateTracks", function(Data, Cb)
    local Result = exports['peak-racing']:CanCreateTracks(Data)
    Cb(Result)
end)

RegisterNUICallback("Racing/IsCreatingTrack", function(Data, Cb)
    local Result = exports['peak-racing']:IsCreatingTrack(Data)
    Cb(Result)
end)

RegisterNUICallback("Racing/CreateRaceTrack", function(Data, Cb)
    local Result = exports['peak-racing']:CreateRaceTrack(Data)
    Cb(Result)
end)

RegisterNUICallback("Racing/CancelCreation", function(Data, Cb)
    local Result = exports['peak-racing']:CancelCreation(Data)
    Cb(Result)
end)

RegisterNUICallback("Racing/SaveRaceTrack", function(Data, Cb)
    local Result = exports['peak-racing']:SaveRaceTrack(Data)
    Cb(Result)
end)

-- Exports
exports("UpdateRacingChat", function(Data)
    if not IsPhoneAppMounted('racing') and not IsPhoneAppMounted('time-trials') then
        Notification("new-racing-text-" .. Data.RaceId .. "-" .. math.random(1, 999), "fas fa-flag-checkered", { "white", "#039380" }, "Racing", Data.Texts[1].TimestampLabel.." - "..Data.Texts[1].Message)
        SetAppUnread("racing")
        return
    end

    Data.Action = "Racing/UpdateChat"
    SendNUIMessage(Data)
end)