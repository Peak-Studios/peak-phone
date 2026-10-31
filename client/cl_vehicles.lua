Vehicles={Vehicles={}}
RegisterNUICallback('Vehicles/GetVehicles',function(Data,Cb)
    local rows=Peak.SendCallback('peak-phone:Server:Vehicles:GetVehicles')
    if type(rows)=='table' and not rows.__phoneError then for _,v in ipairs(rows) do
        local hash=tonumber(v.Model) or GetHashKey(tostring(v.Model));local key=GetDisplayNameFromVehicleModel(hash);local label=GetLabelText(key)
        if label and label~='NULL' and label~='' then v.Label=label end
    end end;Cb(rows)
end)
RegisterNUICallback('Vehicles/TrackVehicle',function(Data,Cb)
    local r=Peak.SendCallback('peak-phone:portable:trackVehicle',Data.Plate)
    if type(r)=='table' and r.x and r.y then SetNewWaypoint(r.x+0.0,r.y+0.0);Cb(true)
    else Peak.Functions.Notify('Vehicle is parked, unavailable, or in another routing bucket.','error');Cb(false) end
end)
for action,endpoint in pairs({spawn='Vehicles/SpawnVehicle',sell='Vehicles/SellVehicle'}) do
    RegisterNUICallback(endpoint,function(Data,Cb)
        local r=Peak.SendCallback('peak-phone:portable:vehicleAction',action,Data)
        if type(r)=='table' and r.Success==false then Peak.Functions.Notify(r.Msg or r.Error,'error') end;Cb(r)
    end)
end
