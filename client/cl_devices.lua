local routes={lock='lock',list='list',select='select',unlock='unlock',setPin='setPin',recover='recover',lend='lend',transfer='transfer',status='status',backup='backup',restore='restore',reset='reset'}
for nui,server in pairs(routes) do
    RegisterNUICallback('Devices/'..nui,function(data,cb)
        local generation=Phone.Client.Generation
        local ok,result=pcall(Peak.SendCallback,'peak-phone:devices:'..server,data)
        if generation~=Phone.Client.Generation then return cb({Success=false,Error='Character changed. Reopen Settings.'}) end
        if ok and result and result.Success and nui=='lock' then Phone.Client.Device=Phone.Client.Device or {};Phone.Client.Device.Locked=true end
        if ok and result and result.Success and nui=='unlock' then Phone.Client.Device=Phone.Client.Device or {};Phone.Client.Device.Locked=false;SendNUIMessage({Action='Duo/DeviceUnlocked'}) end
        if ok and result and result.Success and nui=='restore' and type(result.Preferences)=='table' then
            for key,value in pairs(result.Preferences) do PhoneServices['peak-hud']:SetPreferenceById(key,value) end
            TriggerEvent('peak-hud:Client:ReloadPreferences')
        end
        cb(ok and result or {Success=false,Error=tostring(result)})
    end)
end
local simBusy=false
RegisterNUICallback('Devices/sim',function(data,cb)
    if simBusy then return cb({Success=false,Error='A SIM operation is already running.'}) end
    simBusy=true
    local finished,prepared,commitStarted=false,nil,false
    local function finish(result)
        if finished then return end
        finished=true
        simBusy=false
        pcall(SendNUIMessage,{Action='Devices/SimProgress',State=result and result.Success and 'complete' or 'failed'})
        cb(result)
    end
    local function execute()
        local generation=Phone.Client.Generation
        SendNUIMessage({Action='Devices/SimProgress',State='preparing'})
        local ok,result=pcall(Peak.SendCallback,'peak-phone:devices:simBegin',data)
        if not ok or not result or not result.Success then return finish(ok and result or {Success=false,Error=tostring(result)}) end
        prepared=result
        SendNUIMessage({Action='Devices/SimProgress',State='animating'})
        local played,reason=Phone.SimGesture.run(data.Action)
        if not played then
            pcall(Peak.SendCallback,'peak-phone:devices:simCancel',{OperationId=prepared.OperationId,Token=prepared.Token})
            return finish({Success=false,Error=reason})
        end
        if generation~=Phone.Client.Generation then
            pcall(Peak.SendCallback,'peak-phone:devices:simCancel',{OperationId=prepared.OperationId,Token=prepared.Token})
            return finish({Success=false,Error='Character changed. Reopen Settings.'})
        end
        SendNUIMessage({Action='Devices/SimProgress',State='committing'})
        commitStarted=true
        local committedOk,commitResult=pcall(Peak.SendCallback,'peak-phone:devices:simCommit',{OperationId=prepared.OperationId,Token=prepared.Token,Generation=generation})
        if committedOk and commitResult and commitResult.Success and Phone.DuoProp then pcall(Phone.DuoProp.setHasSim,data.Action=='insert') end
        -- The invalidation event and callback may arrive in either order. Always
        -- reconcile from the server; animation alone never commits visual state.
        local refreshed,refreshError=pcall(Phone.refreshClient)
        if not refreshed and committedOk and commitResult and commitResult.Success then
            commitResult.ReconcilePending=true;commitResult.ReconcileError=tostring(refreshError)
        end
        finish(committedOk and commitResult or {Success=false,Error=tostring(commitResult)})
    end
    local ok,err=xpcall(execute,function(value) return tostring(value) end)
    if not ok then
        if prepared and not commitStarted then pcall(Peak.SendCallback,'peak-phone:devices:simCancel',{OperationId=prepared.OperationId,Token=prepared.Token}) end
        pcall(Phone.refreshClient)
        finish({Success=false,Error='SIM operation failed safely: '..tostring(err)})
    end
end)
RegisterNetEvent('peak-phone:portable:deviceReset',function()
    if source~=65535 then return end
    DeleteResourceKvp('peakduo:preferences:'..tostring(Phone.Client.Data.citizenid or 'pending'))
    TriggerEvent('peak-hud:Client:ReloadPreferences')
    SendNUIMessage({Action='Duo/FactoryReset'})
end)
-- Inventory remains responsible for focus. These exports hold the physical
-- handset temporarily and use the same server-authorized YCD/commit flow.
exports('InventoryDevice',function(slot)
    local ok,result=pcall(Phone.rpc,'peak-phone:devices:inventoryInspect',{PhoneSlot=slot})
    return ok and result or {Success=false,Error=tostring(result)}
end)
local inventoryBusy=false
exports('InventorySim',function(data)
    if inventoryBusy or Phone.SimGesture.busy then return {Success=false,Error='A SIM operation is already running.'} end
    if type(data)~='table' then return {Success=false,Error='Invalid SIM request.'} end
    inventoryBusy=true
    local priorHeld=Phone.DuoProp and Phone.DuoProp.held
    local ok,result=pcall(function()
        local ready=Phone.refreshClient();if not ready then return {Success=false,Error='Phone inventory state is still loading.'} end
        local device=Phone.rpc('peak-phone:devices:inventoryInspect',{PhoneSlot=data.PhoneSlot})
        if not device.Success then return device end
        if device.Locked then return {Success=false,Error='Unlock this phone before changing its SIM.'} end
        local prepared=Phone.rpc('peak-phone:devices:simBegin',{Generation=device.Generation,PhoneSlot=data.PhoneSlot,Action=data.Action,SimSlot=data.SimSlot,TargetSlot=data.TargetSlot})
        if not prepared.Success then return prepared end
        Phone.SimGesture.inventoryHeld=true
        if Phone.DuoProp then Phone.DuoProp.setHasSim(device.Sim~=nil);Phone.DuoProp.setHeld(true) end
        local played,reason=Phone.SimGesture.run(data.Action)
        if not played then pcall(Phone.rpc,'peak-phone:devices:simCancel',{OperationId=prepared.OperationId,Token=prepared.Token});return {Success=false,Error=reason} end
        return Phone.rpc('peak-phone:devices:simCommit',{OperationId=prepared.OperationId,Token=prepared.Token})
    end)
    Phone.SimGesture.inventoryHeld=false
    if Phone.DuoProp and not priorHeld and not IsPhoneOpen then Phone.DuoProp.setHeld(false) end
    inventoryBusy=false
    return ok and result or {Success=false,Error=tostring(result)}
end)
RegisterNetEvent('peak-phone:portable:identityChanged',function(reason)
    if source~=65535 then return end
    Phone.invalidatePending('Device identity changed. Do not retry automatically.')
    if ResetNotifications then ResetNotifications() end
    ActiveSimData=nil
    if IsPhoneOpen and ClosePhone then ClosePhone(true) else Phone.removeProp() end
    -- Breaking already owns the screen. Inventory replacement must not hide
    -- its fracture/inspection sequence while the new identity is refreshed.
    if not (Phone.Break and Phone.Break.busy) then SendNUIMessage({Action='Duo/Reset',Reason=reason}) end
    Phone.refreshAfterIdentityChange(Phone.Client.Generation)
    Peak.Functions.Notify(reason or 'Phone identity changed.','inform')
end)
RegisterNetEvent('peak-phone:portable:identityInvalidating',function(reason)
    if source~=65535 then return end
    Phone.invalidatePending('Device identity changed. Do not retry automatically.')
    if ResetNotifications then ResetNotifications() end
    SendNUIMessage({Action='Duo/IdentityChanging',Reason=reason,DeviceGeneration=Phone.Client.Device and Phone.Client.Device.Generation})
end)
