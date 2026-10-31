if not Phone.legacyAvailable('housing') then return end
Peak.Functions.CreateCallback("peak-phone:Server:CanRealtor", function(Source, Cb)
    Cb(Peak.Functions.HasPermission(Source, "dev") or Peak.Functions.HasPermission(Source, "admin") or Peak.Functions.HasPermission(Source, "god"))
end)

Peak.Functions.CreateCallback("peak-phone:Server:Housing:GetHouses", function(Source, Cb)
    local Player = Peak.Functions.GetPlayer(Source)
    if Player == nil then return end

    local Houses = exports['peak-housing']:GetHouses()
    local Retval = {}

    for k, v in pairs(Houses) do
        local HasKeys = v.Owner == Player.PlayerData.citizenid
        if HasKeys then goto SkipKeyholders end
        for _, Cid in pairs(v.Keyholders) do
            if Cid == Player.PlayerData.citizenid then
                HasKeys = true
                break
            end
        end
        ::SkipKeyholders::

        if HasKeys then
            v.IsOwner = v.Owner == Player.PlayerData.citizenid
            Retval[#Retval + 1] = v
        end
    end

    Cb(Retval)
end)