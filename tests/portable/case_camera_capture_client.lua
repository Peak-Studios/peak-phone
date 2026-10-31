PhonePeak={Functions={GetPlayerData=function()return {citizenid='PHOTO'}end,Notify=function(message,kind)CALLS[#CALLS+1]={message=message,kind=kind}end}}
PhonePeak.SendCallback=function(_,request)return {Success=true}end
InCamera=true;Citizen.CreateThread=CreateThread;Citizen.Wait=Wait
RegisterNUICallback=function()end
local messages={};SendNUIMessage=function(data)messages[#messages+1]=data end
loadrel('client/cl_camera.lua');THREADS={}
check(CapturePhoto());check(IsCapturingPhoto);check(not CapturePhoto());THREADS[1]();local request=tostring(CLOCK)..'-1'
source=0;EVENTS['peak-phone:portable:captureComplete'](request,true);check(IsCapturingPhoto,'Local completion injection ignored')
source=65535;EVENTS['peak-phone:portable:captureComplete']('wrong',true);check(IsCapturingPhoto)
EVENTS['peak-phone:portable:captureComplete'](request,true);check(not IsCapturingPhoto);eq(messages[#messages].Action,'Camera/PhotoResult');eq(messages[#messages].Success,true)
local oldTimeout=TIMERS[1].fn;THREADS={};PhonePeak.SendCallback=function()return {Success=false,Msg='Unlock your phone.'}end
check(CapturePhoto());oldTimeout();check(IsCapturingPhoto,'Old timeout cannot clear a new capture');THREADS[1]();check(not IsCapturingPhoto);eq(CALLS[#CALLS].message,'Unlock your phone.')
THREADS={};PhonePeak.SendCallback=function()error('Denied')end;check(CapturePhoto());THREADS[1]();check(not IsCapturingPhoto)
THREADS={};PhonePeak.SendCallback=function()return {Success=true}end;check(CapturePhoto());TIMERS[#TIMERS].fn();check(not IsCapturingPhoto);eq(messages[#messages].Success,false)
