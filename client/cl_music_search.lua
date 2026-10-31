-- Existing phone RPC authorization, device-generation and timeout guards apply.
RegisterNUICallback('Peakify/Search', function(data, cb)
    if type(data) ~= 'table' or type(data.Query) ~= 'string' or #data.Query > 512 then
        return cb({ Success = false, Message = 'Enter a song or artist name.' })
    end
    cb(Peak.SendCallback('peak-phone:Server:Peakify:Search', { Query = data.Query }))
end)

RegisterNUICallback('Peakify/ResolveCatalog', function(data, cb)
    if type(data) ~= 'table' or type(data.Id) ~= 'string' or #data.Id > 32 or not data.Id:match('^%w+$') then
        return cb({Success=false,Message='Select a valid Audius track.'})
    end
    cb(Peak.SendCallback('peak-phone:Server:Peakify:ResolveCatalog', {Id=data.Id}))
end)
