if not Phone.legacyAvailable('cars') then return end
local TestDrive, SpawningTestDrive = false, false

RegisterNUICallback("Cars/GetShopData", function(Data, Cb)
    local Result = Peak.SendCallback("peak-businesses:Server:VehicleShop:GetShopData", CurrentNetwork)
    Cb(Result)
end)

RegisterNUICallback("Cars/GetVehicles", function(Data, Cb)
    local Result = Peak.SendCallback("peak-phone:Server:GetVehicles", CurrentNetwork)
    Cb(Result)
end)

RegisterNUICallback("Cars/SetDisplay", function(Data, Cb)
    TriggerServerEvent("peak-businesses:Server:ChangeVehicle", CurrentNetwork, Data.Spot, Data.Vehicle)
    Cb("Ok")
end)

RegisterNUICallback("Cars/GetTestDriving", function(Data, Cb)
    Cb(TestDrive)
end)

RegisterNUICallback("Cars/TestDrive", function(Data, Cb)
    Cb("Ok")
    if TestDrive or SpawningTestDrive then
        return Peak.Functions.Notify("You already have a test drive out..", "error")
    end

    SpawningTestDrive = true

    local IsLockdown = PhoneServices['peak-cityhall']:IsLockdownActive("business-" .. CurrentNetwork)
    if IsLockdown and not PhoneServices['peak-cityhall']:IsGov() then
        SpawningTestDrive = false
        return Peak.Functions.Notify("Business is in lockdown..", "error")
    end

    TriggerServerEvent("peak-businesses:Server:VehicleShop:TestDrive", CurrentNetwork, Data.Vehicle, false)
    local Result = Peak.SendCallback("peak-businesses:Server:VehicleShop:GetShopData", CurrentNetwork)

    local Plate = tostring('TDRIVE' .. math.random(11, 99))
    local NetId = Peak.SendCallback("Peak:server:spawn:vehicle", Data.Vehicle, { x = Result.TestPos.x, y = Result.TestPos.y, z = Result.TestPos.z, a = Result.TestPos.w }, false, Plate)
    while not NetworkDoesEntityExistWithNetworkId(NetId) do Citizen.Wait(100) end
    
    local Vehicle = NetToVeh(NetId)
    while not DoesEntityExist(Vehicle) do Citizen.Wait(100) end

    NetworkFadeInEntity(Vehicle, true)
    NetworkRequestControlOfEntity(Vehicle)

    TriggerServerEvent("peak-businesses:Server:AutoCare:LoadParts", Plate)
    exports['peak-vehicles']:SetVehicleKeys(Plate, true, false)
    exports['peak-vehicles']:SetFuelLevel(Vehicle, 100.0)

    Citizen.SetTimeout(1000, function()
        exports['peak-vehicles']:LoadVehicleMeta(Vehicle, nil)
        NetworkRegisterEntityAsNetworked(Vehicle)
        Peak.Functions.SetVehiclePlate(Vehicle, Plate)
        TestDrive = Data
        TestDrive.Shop = CurrentNetwork
        TestDrive.Entity = Vehicle
        SpawningTestDrive = false
        TaskWarpPedIntoVehicle(PlayerPedId(), Vehicle, -1)

        SendNUIMessage({
            Action = "Cars/SetTestDriving",
            TestDrive = TestDrive,
        })

        local Preset = Peak.SendCallback("peak-businesses:Server:VehicleShop:GetPreset", TestDrive.Shop, TestDrive.Vehicle)
        if Preset and next(Preset) ~= nil then
            Peak.VSync.ApplyVehicleMods(Vehicle, Preset)
        end
    end)
end)

RegisterNUICallback("Cars/ReturnCar", function(Data, Cb)
    TriggerServerEvent("peak-businesses:Server:VehicleShop:TestDrive", TestDrive.Shop, TestDrive.Vehicle, true)
    Peak.VSync.DeleteVehicle(TestDrive.Entity)
    TestDrive = false
    SendNUIMessage({
        Action = "Cars/SetTestDriving",
        TestDrive = TestDrive,
    })
    Cb("Ok")
end)

RegisterNUICallback("Cars/SavePreset", function(Data, Cb)
    TriggerServerEvent("peak-businesses:Server:VehicleShop:SetPreset", TestDrive.Shop, TestDrive.Vehicle, Peak.VSync.GetVehicleMods(TestDrive.Entity))
    Cb("Ok")
end)

RegisterNUICallback("Cars/Sell", function(Data, Cb)
    local IsLockdown = PhoneServices['peak-cityhall']:IsLockdownActive("business-" .. CurrentNetwork)
    if IsLockdown and not PhoneServices['peak-cityhall']:IsGov() then
        Cb("Ok")
        return Peak.Functions.Notify("Business is in lockdown..", "error")
    end

    TriggerServerEvent("peak-businesses:Server:VehicleShop:SellVehicle", TestDrive, Data, VehToNet(TestDrive.Entity))
    Cb("Ok")
end)

RegisterNetEvent("peak-phone:Client:Cars:SetTestDrive")
AddEventHandler("peak-phone:Client:Cars:SetTestDrive", function(Data)
    TestDrive = Data
    SendNUIMessage({
        Action = "Cars/SetTestDriving",
        TestDrive = TestDrive,
    })
end)