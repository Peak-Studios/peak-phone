Phone.MediaOutput = {Volume=.7, Powered=true}
RegisterNUICallback('Phone/MediaOutput',function(data,cb)
    local volume=data.Volume
    if type(volume)~='number' or volume~=volume or volume<0 or volume>1 or type(data.Powered)~='boolean' then
        return cb({Success=false,Error='Invalid phone output setting.'})
    end
    Phone.MediaOutput.Volume=volume;Phone.MediaOutput.Powered=data.Powered
    if Phone.refreshMusicOutput then Phone.refreshMusicOutput() end
    cb({Success=true,Volume=volume,Powered=data.Powered})
end)
