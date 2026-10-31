if not Phone.legacyAvailable('housing') then return end
RegisterNUICallback("Housing/CanRealtor", function(Data, Cb)
    local Result = exports['peak-housing']:CanRealtor()
    Cb(Result)
end)

RegisterNUICallback("Housing/CreateHouse", function(Data, Cb)
    local Id = Peak.Shared.RandomInt(6)
    Data.Name = (Peak.Functions.GetStreetLabel()):lower() .. '-' .. Id
    Data.Adress = Peak.Functions.GetStreetLabel() .. ' ' .. Id
    local Result = Peak.SendCallback("peak-housing:Server:CreateHouse", Data)
    Cb(Result)
end)

RegisterNUICallback("Housing/EditHouse", function(Data, Cb)
    local CurrentHouse = exports['peak-housing']:GetCurrentHouse()
    if not CurrentHouse then return Cb(false) end

    local Result = Peak.SendCallback("peak-housing:Server:EditHouse", Data, CurrentHouse)
    Cb(Result)
end)

RegisterNUICallback("Housing/GetCurrentHouse", function(Data, Cb)
    local Result = exports['peak-housing']:GetCurrentHouse()
    Cb(Result)
end)

RegisterNUICallback("Housing/GetHouses", function(Data, Cb)
    local Result = { QuickEdit = false }
    local Houses = Peak.SendCallback("peak-phone:Server:Housing:GetHouses")
    Result.Houses = Houses

    local CurrentHouse = exports['peak-housing']:GetCurrentHouse()
    if CurrentHouse and exports['peak-housing']:IsInside() and exports['peak-housing']:HasKeyToCurrent() then Result.QuickEdit = true end

    Cb(Result)
end)

RegisterNUICallback("Housing/IsNearHouse", function(Data, Cb)
    local Result = false

    if Data.Id then
        local CurrentHouse = exports['peak-housing']:GetCurrentHouse()
        if CurrentHouse and CurrentHouse.Id == Data.Id then
            Result = (exports['peak-housing']:CanRealtor() or exports['peak-housing']:HasKeyToCurrent())
        else
            local House = exports['peak-housing']:GetHouse(Data.Id)
            if House then
                Result = #(GetEntityCoords(PlayerPedId()) - vector3(House.Coords.x, House.Coords.y, House.Coords.z)) <= 50.0 and (exports['peak-housing']:CanRealtor() or exports['peak-housing']:HasKeyToHouseId(Data.Id))
            end
        end
    else
        Result = exports['peak-housing']:IsInside() and (exports['peak-housing']:CanRealtor() or exports['peak-housing']:HasKeyToCurrent())
    end

    Cb(Result)
end)

RegisterNUICallback("Housing/IsNearAnyHouse", function(Data, Cb)
    local CurrentHouse = exports['peak-housing']:GetCurrentHouse()
    Cb(CurrentHouse and (exports['peak-housing']:CanRealtor() or exports['peak-housing']:HasKeyToCurrent()) or false)
end)

RegisterNUICallback("Housing/SetInteractLocation", function(Data, Cb)
    local CurrentHouse = exports['peak-housing']:GetCurrentHouse()

    if Data.Interaction ~= 'Furniture' then
        if Data.HouseId or CurrentHouse and CurrentHouse.Id then
            local House = exports['peak-housing']:GetHouse(Data.HouseId or CurrentHouse.Id)
            if exports['peak-housing']:IsInside() or #(GetEntityCoords(PlayerPedId()) - vector3(House.Coords.x, House.Coords.y, House.Coords.z)) <= 50.0 then
                TriggerServerEvent("peak-housing:Server:SetInteractLocation", Data.HouseId or CurrentHouse.Id, Data.Interaction, GetEntityCoords(PlayerPedId()), GetEntityHeading(PlayerPedId()), exports['peak-housing']:IsInside())
            else
                Peak.Functions.Notify("This is too far..", "error")
            end
        end
    elseif Data.Interaction == "Garage" then
        if exports['peak-housing']:IsInside() then return Peak.Functions.Notify("Garage must be outside..", "error") end
        TriggerServerEvent("peak-housing:Server:SetInteractLocation", Data.HouseId or CurrentHouse.Id, Data.Interaction, GetEntityCoords(PlayerPedId()), GetEntityHeading(PlayerPedId()))
    else
        if CurrentHouse and (not Data.HouseId or Data.HouseId == CurrentHouse.Id) and exports['peak-housing']:IsInside() then
            ClosePhone(true)
            Citizen.SetTimeout(100, function()
                TriggerEvent('peak-housing:Client:OpenFurniture', CurrentHouse.Id)
            end)
        end
    end

    Cb("Ok")
end)

RegisterNUICallback("Housing/SetGPS", function(Data, Cb)
    local House = exports['peak-housing']:GetHouse(Data.HouseId)
    if not House then return end

    SetNewWaypoint(House.Coords.x, House.Coords.y)

    Cb("Ok")
end)

RegisterNUICallback("Housing/ToggleLock", function(Data, Cb)
    local House = exports['peak-housing']:GetHouse(Data.HouseId)
    if not House then return end

    TriggerEvent('peak-housing:Client:LockProperty', Data.HouseId)

    Cb("Ok")
end)

RegisterNUICallback("Housing/SellHouse", function(Data, Cb)
    local House = exports['peak-housing']:GetHouse(Data.HouseId)
    if not House then return end

    local Result = Peak.SendCallback("peak-housing:Server:SellHouse", Data.HouseId)
    Cb({Success = Result})
end)

RegisterNUICallback("Housing/PurchaseHouse", function(Data, Cb)
    local House = exports['peak-housing']:GetHouse(Data.HouseId)
    if not House then return end

    local Result = Peak.SendCallback("peak-housing:Server:PurchaseHouse", Data.HouseId)
    Cb(Result)
end)

RegisterNUICallback("Housing/GetKeys", function(Data, Cb)
    local House = exports['peak-housing']:GetHouse(Data.HouseId)
    if not House then return end

    local Result = Peak.SendCallback("peak-housing:Server:GetHousingKeys", Data.HouseId)
    Cb(Result)
end)

RegisterNUICallback("Housing/AddKeys", function(Data, Cb)
    local House = exports['peak-housing']:GetHouse(Data.HouseId)
    if not House then return end

    TriggerServerEvent("peak-housing:Server:SetKeyState", Data.HouseId, Data.Target, true)
    Cb("Ok")
end)

RegisterNUICallback("Housing/RemoveKeys", function(Data, Cb)
    local House = exports['peak-housing']:GetHouse(Data.HouseId)
    if not House then return end

    TriggerServerEvent("peak-housing:Server:SetKeyState", Data.HouseId, Data.Target, false)
    Cb("Ok")
end)

RegisterNUICallback("Housing/DeleteHouse", function(Data, Cb)
    local House = exports['peak-housing']:GetCurrentHouse()
    if House == nil then return end

    TriggerServerEvent("peak-housing:Server:DeleteHouse", House.Id)
    Cb("Ok")
end)

RegisterNUICallback("Housing/SellLocation", function(Data, Cb)
    local House = exports['peak-housing']:GetCurrentHouse()
    if House == nil then return end

    TriggerServerEvent("peak-housing:Server:SellLocation", House.Id, Data)
    Cb("Ok")
end)