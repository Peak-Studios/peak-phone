local flashlight = false

RegisterNUICallback('Phone/Flashlight', function(data, cb)
    if type(data) ~= 'table' or type(data.Enabled) ~= 'boolean' then return cb(false) end
    flashlight = data.Enabled
    cb('Ok')
end)

CreateThread(function()
    while true do
        if flashlight then
            local ped = PlayerPedId()
            if IsPedDeadOrDying(ped, true) then flashlight = false
            else
                local pos, direction = GetEntityCoords(ped), GetEntityForwardVector(ped)
                DrawSpotLight(pos.x + direction.x * .4, pos.y + direction.y * .4, pos.z + .8,
                    direction.x, direction.y, -.12, 255, 247, 225, 18.0, 2.0, 1.0, 20.0, 1.0)
            end
            Wait(0)
        else Wait(200) end
    end
end)
