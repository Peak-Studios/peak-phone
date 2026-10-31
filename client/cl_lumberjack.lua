if not Phone.legacyAvailable('lumberjack') then return end
RegisterNUICallback("Lumberjack/GetData", function(data, cb)
    local result = Peak.SendCallback("Lumberjack/GetData")
    if result and result.data then
        cb({ success = true, data = result.data })
    else
        cb({ success = false })
    end
end)
