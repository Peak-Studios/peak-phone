local Peak = PhonePeak

-- Emergency job types that should appear in Services
local EmergencyJobs = {
    'police',
    'ambulance', 
    'bcso',
    'sasp',
    'ranger',
    'fire'
}

-- NUI Callback: Get available emergency workers
RegisterNUICallback("Services/GetEmergencyWorkers", function(Data, Cb)
    local Result = Peak.SendCallback("peak-phone:Server:Services:GetEmergencyWorkers")
    if type(Result)~='table' then return Cb({__phoneError=true,error='The emergency directory could not be refreshed.'}) end
    Cb(Result)
end)

-- NUI Callback: Get available tow/impound workers
RegisterNUICallback("Services/GetTowWorkers", function(Data, Cb)
    local Result = Peak.SendCallback("peak-phone:Server:Services:GetTowWorkers")
    if type(Result)~='table' then return Cb({__phoneError=true,error='The tow directory could not be refreshed.'}) end
    Cb(Result)
end)
