if not Phone.legacyAvailable('guber') then return end
local Peak = PhonePeak

-- NUI CALLBACKS

RegisterNUICallback('peak-guber:server:getAvailableCourses', function(data, cb)
    Peak.Functions.TriggerCallback('peak-guber:server:getAvailableCourses', function(result)
        cb(result or {})
    end)
end)

RegisterNUICallback('peak-guber:server:changeDuty', function(data, cb)
    Peak.Functions.TriggerCallback('peak-guber:server:changeDuty', function(result)
        cb(result)
    end, data)
end)

RegisterNUICallback('peak-guber:server:takecourse', function(courseId, cb)
    TriggerServerEvent('peak-guber:server:takecourse', courseId)
    cb('ok')
end)

RegisterNUICallback('peak-guber:server:clientRated', function(data, cb)
    Peak.Functions.TriggerCallback('peak-guber:server:clientRated', function(result)
        cb(result)
    end, data)
end)

RegisterNUICallback('peak-guber:client:requestRide', function(data, cb)
    local coords = GetEntityCoords(PlayerPedId())
    local dest = vector3(data.destination.x, data.destination.y, data.destination.z)
    
    TriggerServerEvent('peak-guber:server:addPlayerCourse', {
        destination = dest,
        pickup = coords,
        distance = #(coords - dest),
        passengers = 1
    })
    cb("ok")
end)

RegisterNUICallback('peak-guber:client:cancelRide', function(data, cb)
    TriggerServerEvent('peak-guber:server:cancelPlayerRide')
    cb("ok")
end)

-- Get waypoint coordinates for destination
RegisterNUICallback('peak-guber:client:getWaypoint', function(data, cb)
    local waypointBlip = GetFirstBlipInfoId(8)
    if DoesBlipExist(waypointBlip) then
        local coords = GetBlipInfoIdCoord(waypointBlip)
        local _, groundZ = GetGroundZFor_3dCoord(coords.x, coords.y, coords.z + 100.0, true)
        cb({
            hasWaypoint = true,
            coords = {x = coords.x, y = coords.y, z = groundZ or coords.z}
        })
    else
        cb({ hasWaypoint = false })
    end
end)

-- Get driver duty status and current course from peak-guber
RegisterNUICallback('peak-guber:client:getDutyStatus', function(data, cb)
    local onDuty = exports['peak-guber']:GetDutyStatus()
    local currentCourse = exports['peak-guber']:GetCurrentCourse()
    local rate = exports['peak-guber']:GetDriverRate()
    cb({
        onDuty = onDuty or false,
        activeCourse = currentCourse,
        rate = rate or 5.0
    })
end)

-- Cancel current driver course
RegisterNUICallback('peak-guber:client:cancelCourse', function(data, cb)
    exports['peak-guber']:CancelCurrentCourse()
    cb("ok")
end)

-- EVENTS FROM GUBER RESOURCE TO PHONE NUI

RegisterNetEvent('peak-phone:client:GuberNewCourse', function(course)
    SendNUIMessage({
        Action = "peak-guber:client:newcourse",
        Data = course
    })
end)

RegisterNetEvent('peak-phone:client:GuberRemoveCourse', function(cid)
    SendNUIMessage({
        Action = "peak-guber:client:delcourse",
        Data = cid
    })
end)

RegisterNetEvent('peak-phone:client:GuberCourseStarted', function(course)
    SendNUIMessage({
        Action = "peak-guber:client:startcourse",
        Data = course
    })
end)

RegisterNetEvent('peak-phone:client:GuberJobDone', function(newRate)
    SendNUIMessage({
        Action = "peak-guber:client:jobdone",
        Data = newRate
    })
end)

RegisterNetEvent('peak-phone:client:GuberJobCancelled', function()
    SendNUIMessage({
        Action = "peak-guber:client:jobcancelled"
    })
end)

RegisterNetEvent('peak-phone:client:GuberDriverAssigned', function(data)
    SendNUIMessage({
        Action = "peak-guber:client:driverassigned",
        Data = data
    })
end)

RegisterNetEvent('peak-phone:client:GuberRideFinished', function(data)
    SendNUIMessage({
        Action = "peak-guber:client:clientdone",
        Data = data
    })
end)

RegisterNetEvent('peak-phone:client:GuberRideCancelled', function(courseId)
    SendNUIMessage({
        Action = "peak-guber:client:clientcancelled",
        Data = courseId
    })
end)

RegisterNetEvent('peak-phone:client:GuberTimeout', function()
    SendNUIMessage({
        Action = "peak-guber:client:timeout"
    })
end)

RegisterNetEvent('peak-phone:client:GuberDriverHere', function()
    SendNUIMessage({
        Action = "peak-guber:client:driverhere"
    })
end)

RegisterNetEvent('peak-phone:client:GuberDriverProgress', function()
    SendNUIMessage({
        Action = "peak-guber:client:driverprogress"
    })
end)

RegisterNetEvent('peak-phone:client:GuberDriverArrived', function()
    SendNUIMessage({
        Action = "peak-guber:client:driverarrived"
    })
end)

-- Forward onduty/offduty to NUI
RegisterNetEvent('peak-guber:client:onduty', function(rate)
    SendNUIMessage({
        Action = "peak-guber:client:onduty",
        Data = rate
    })
end)

RegisterNetEvent('peak-guber:client:offduty', function()
    SendNUIMessage({
        Action = "peak-guber:client:offduty"
    })
end)
