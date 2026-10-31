-- Stock QB/Qbox/ESX ownership reads. Garage spawning and sales belong to a configured garage provider.
local function rows(src)
    local p=Peak.Functions.GetPlayer(src);if not p then return {} end
    if PhoneIntegration.GetVehicles then return PhoneIntegration.GetVehicles(src,p.PlayerData.citizenid) end
    local framework=Phone.framework();local tableName=framework=='esx' and 'owned_vehicles' or 'player_vehicles'
    local exists=PhoneDB.one('SELECT COUNT(*) n FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?',{tableName})
    if not exists or tonumber(exists.n)==0 then return {} end
    if framework=='esx' then return PhoneDB.query('SELECT * FROM owned_vehicles WHERE owner=? LIMIT 500',{p.PlayerData.citizenid}) end
    return PhoneDB.query('SELECT * FROM player_vehicles WHERE citizenid=? LIMIT 500',{p.PlayerData.citizenid})
end
local function owned(src,plate)
    if not Phone.text(plate,20) then return false end
    for _,r in ipairs(rows(src)) do if Phone.trim(r.plate)==Phone.trim(plate) then return true end end
    return false
end
Peak.Functions.CreateCallback('peak-phone:Server:Vehicles:GetVehicles',function(src,cb)
    local result={};for _,r in ipairs(rows(src)) do
        local props=Phone.decode(r.vehicle,{});local meta=Phone.decode(r.metadata,{});local model=props.model or r.vehicle
        result[#result+1]={Icon='car',Plate=r.plate,State=(r.state=='in' or tonumber(r.state)==1 or tonumber(r.stored)==1) and 'Inside' or (r.state=='depot' or tonumber(r.state)==2) and 'Depot' or 'Outside',Label=tostring(r.label or model or 'Vehicle'),Garage=r.garage or 'Garage',Engine=tonumber(r.engine or meta.Engine or props.engineHealth) or 1000,Body=tonumber(r.body or meta.Body or props.bodyHealth) or 1000,Fuel=tonumber(r.fuel or meta.Fuel or props.fuelLevel) or 0,Vin=r.vinnumber or '',Model=model}
    end;cb(result)
end)
Peak.Functions.CreateCallback('peak-phone:portable:trackVehicle',function(src,cb,plate)
    if not owned(src,plate) then return cb(false) end
    if PhoneIntegration.TrackVehicle then return cb(PhoneIntegration.TrackVehicle(src,plate)) end
    for _,v in ipairs(GetAllVehicles()) do
        if Phone.trim(GetVehicleNumberPlateText(v))==Phone.trim(plate) and GetEntityRoutingBucket(v)==GetPlayerRoutingBucket(src) then local c=GetEntityCoords(v);return cb({x=c.x,y=c.y,z=c.z}) end
    end;cb(false)
end)
Peak.Functions.CreateCallback('peak-phone:portable:vehicleAction',function(src,cb,action,data)
    if type(data)~='table' or not owned(src,data.Plate) then return cb(Phone.publicError('You do not own this vehicle.')) end
    if action=='spawn' and PhoneIntegration.SpawnVehicle then return cb(PhoneIntegration.SpawnVehicle(src,data.Plate)) end
    if action=='sell' and PhoneConfig.EnableVehicleSales and PhoneIntegration.SellVehicle then return cb(PhoneIntegration.SellVehicle(src,data)) end
    cb(Phone.publicError('This server has not configured a garage '..tostring(action)..' integration.'))
end)
-- The vulnerable legacy AcceptVehicleOffer event is not registered. No client can invent a sale.
