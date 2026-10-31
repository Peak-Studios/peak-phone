if not Phone.legacyAvailable('cars') then return end
Peak.Functions.CreateCallback('peak-phone:Server:GetVehicles', function(Source, Cb, Shop)
    local Retval = {}
    local Result = PhoneDB.query("SELECT * FROM `server_vehicles` WHERE `shop` = @Shop ORDER BY `vehicle` DESC", {
        ['@Shop'] = Shop
    })

    local function GetEconomyVehiclePrice(BasePrice, Class)
        Class = string.upper(Class or '')
        local Multipliers = {
            E = 0.03,
            D = 0.04,
            C = 0.06,
            B = 0.09,
            A = 0.14,
            S = 0.22,
        }
        return math.ceil((BasePrice or 0) * (Multipliers[Class] or 1.0))
    end

    for k, v in pairs(Result) do
        local SharedData = Peak.Shared.HashVehicles[GetHashKey(v.vehicle)]
        if SharedData == nil then goto Skip end

        Retval[#Retval + 1] = {
            Vehicle = v.vehicle,
            Stock = v.stock,
            Name = SharedData.Name,
            Class = SharedData.Class,
            Price = GetEconomyVehiclePrice(SharedData.Price, SharedData.Class),
        }

        ::Skip::
    end

    Cb(Retval)
end)