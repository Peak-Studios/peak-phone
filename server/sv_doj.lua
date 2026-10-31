local Statusses = {}

Peak.Functions.CreateCallback("peak-phone:Server:DOJ:GetUsers", function(Source, Cb, Data)
    local Player = Peak.Functions.GetPlayer(Source)
    if Player == nil then return Cb({IsDOJ=false,Users={}}) end

    local Retval = {
        IsDOJ = PhoneConfig.DOJJobs[Player.PlayerData.job.name] == true,
        Users = {},
    }

    for k, v in pairs(Peak.GetPlayers()) do
        local Target = Peak.Functions.GetPlayer(v.ServerId)

        if not Target or not PhoneConfig.DOJJobs[Target.PlayerData.job.name] then
            goto Skip
        end

        table.insert(Retval.Users, {
            Cid = Target.PlayerData.citizenid,
            CharName = Target.PlayerData.charinfo.firstname .. " " .. Target.PlayerData.charinfo.lastname,
            Number = Target.PlayerData.charinfo.phone,
            Status = Statusses[Target.PlayerData.citizenid] or "Bezet",
            Job = Target.PlayerData.job.name,
        })

        ::Skip::
    end

    Cb(Retval)
end)

Peak.RegisterServer("peak-phone:Server:DOJ:SetStatus", function(Source, Data)
    local Player = Peak.Functions.GetPlayer(Source)
    if not Player or not PhoneConfig.DOJJobs[Player.PlayerData.job.name] or type(Data)~='table' or not Phone.text(Data.Status,60) then return end

    Statusses[Player.PlayerData.citizenid] = Data.Status
end)