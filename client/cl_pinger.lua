local PingerBlip = nil

RegisterNUICallback("Pinger/SendPing", function(Data, Cb)
    PlaySound(-1, "Click_Fail", "WEB_NAVIGATION_SOUNDS_PHONE", 0, 0, 1)
    TriggerServerEvent("peak-phone:Server:Pinger:SendPing", Data)

    Cb("Ok")
end)

RegisterNUICallback("Messages/SendLocation", function(Data, Cb)
    PlaySound(-1, "Click_Fail", "WEB_NAVIGATION_SOUNDS_PHONE", 0, 0, 1)
    TriggerServerEvent("peak-phone:Server:Messages:SendLocation", Data)

    Cb("Ok")
end)

RegisterNetEvent("peak-phone:Client:Pinger:SetBlip")
AddEventHandler("peak-phone:Client:Pinger:SetBlip", function(Coords)
    if DoesBlipExist(PingerBlip) then
        RemoveBlip(PingerBlip)
    end
    local x, y, z = table.unpack(Coords)
    if type(Coords) == "table" and not x then
        x, y, z = Coords.x, Coords.y, Coords.z
    end
    
    if not x or not y or not z then return end -- Guard against invalid coords

    PingerBlip = AddBlipForCoord(x, y, z)
    SetBlipSprite(PingerBlip, 280)
    SetBlipScale(PingerBlip, 1.2)
    SetBlipColour(PingerBlip, 4)
    SetBlipAsShortRange(PingerBlip, false)
    BeginTextCommandSetBlipName("STRING")
    AddTextComponentString("Accepted GPS Position")
    EndTextCommandSetBlipName(PingerBlip)

    Peak.Functions.Notify("GPS ping is marked on the map.", "success")
    Citizen.SetTimeout((60 * 1000) * 1, function()
        if DoesBlipExist(PingerBlip) then
            RemoveBlip(PingerBlip)
        end
    end)
end)