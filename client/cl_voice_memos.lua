for _,route in ipairs({'BeginUpload','UploadChunk','AbortUpload','CompleteUpload','Describe','GetChunk','PlaybackReady','Share','StartPlayback','StopPlayback'}) do
 RegisterNUICallback('VoiceMemos/'..route,function(data,cb) cb(Peak.SendCallback('peak-phone:Server:VoiceMemos:'..route,data or {})) end)
end
RegisterNetEvent('peak-phone:Client:VoiceMemos:PlaybackState',function(data)
 SendNUIMessage({Action='VoiceMemos/PlaybackState',Sessions=type(data)=='table' and data.Sessions or {}})
end)
AddEventHandler('onResourceStop',function(resource) if resource==GetCurrentResourceName() then SendNUIMessage({Action='VoiceMemos/PlaybackState',Sessions={}}) end end)
