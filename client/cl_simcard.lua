function FormatPhoneForDisplay(number) return tostring(number or '') end
RegisterCommand('phonesim',function()
    Peak.Functions.Notify('Open the phone, then use Settings > SIM. Physical SIM changes include the full animation.','inform',8000)
end,false)
RegisterNetEvent('peak-phone:portable:simChanged',function(number)
    if source~=65535 then return end
    if ClosePhone then ClosePhone(true) end
    if ResetNotifications then ResetNotifications() end
    ActiveSimData=nil;SendNUIMessage({Action='Duo/Reset'})
    if ClearCallHistory then ClearCallHistory() end
    Phone.refreshClient();Peak.Functions.Notify('Active number: '..tostring(number),'success')
end)
