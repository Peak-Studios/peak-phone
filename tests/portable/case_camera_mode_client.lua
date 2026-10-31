PhonePeak={Functions={GetPlayerData=function()return {citizenid='CAMERA'}end,Notify=function()end}}
PhonePeak.SendCallback=function()return {Success=true}end
local phoneVisual={ped=1,body=10,leaf=11}
local cameraHoldSuspends,refreshes=0,0
Phone={VideoCameraActive=false,KiloLiveCameraActive=false,DuoProp={
    refresh=function()refreshes=refreshes+1 end,
    getLocalVisual=function()return phoneVisual end,
},DuoHand={suspendForCamera=function(v)
    cameraHoldSuspends=cameraHoldSuspends+1
    return v==phoneVisual
end}}
InCamera=false;IsPhoneOpen=true;CameraIsSelfie=false
local callbacks,handlers={},{}
RegisterNUICallback=function(name,fn)callbacks[name]=fn end
AddEventHandler=function(name,fn)handlers[name]=fn end
RegisterNetEvent=function(name,fn)if fn then handlers[name]=fn end end
SendNUIMessage=function(data)MESSAGES[#MESSAGES+1]=data end
MESSAGES={};THREADS={};CreateThread=function(fn)THREADS[#THREADS+1]=fn end

local ped,dead,paused=1,false,false
local radarHidden,focus,keepInput=false,true,true
local pedView,vehicleView=2,1
local renderingCam,mobileCam=0,0
local existingCams={}
local createdPhones,destroyedPhones,cellActivations=0,0,{}
local nativeCalls,hiddenEntities={},{}
local gameHeading,gamePitch=0,0
function PlayerPedId()return ped end
function IsEntityDead()return dead end
function IsPauseMenuActive()return paused end
function DoesEntityExist(entity)return entity~=nil and entity~=0 end
function IsEntityPlayingAnim()return false end
function StopAnimTask()end
function GetRenderingCam()return renderingCam end
function DoesCamExist(cam)return existingCams[cam]==true end
function CreateMobilePhone()createdPhones=createdPhones+1;mobileCam=40;existingCams[mobileCam]=true end
function CellCamActivate(active,selfie)
    cellActivations[#cellActivations+1]={active=active,selfie=selfie}
    if active then renderingCam=mobileCam elseif renderingCam==mobileCam then renderingCam=0 end
end
function DestroyMobilePhone()
    destroyedPhones=destroyedPhones+1
    if renderingCam==mobileCam then renderingCam=0 end
    existingCams[mobileCam]=nil;mobileCam=0
end
function CitizenInvokeNative(hash,value)nativeCalls[#nativeCalls+1]={hash=hash,value=value}end
Citizen={CreateThread=CreateThread,Wait=Wait,InvokeNative=CitizenInvokeNative}
function GetFollowPedCamViewMode()return pedView end
function GetFollowVehicleCamViewMode()return vehicleView end
function SetFollowPedCamViewMode(value)pedView=value end
function SetFollowVehicleCamViewMode(value)vehicleView=value end
function IsRadarHidden()return radarHidden end
function DisplayRadar(show)radarHidden=not show end
function IsNuiFocused()return focus end
function IsNuiFocusKeepingInput()return keepInput end
function SetNuiFocus(a,b)focus=a and b end
function SetNuiFocusKeepInput(value)keepInput=value end
function GetFrameTime()return 1/60 end
function GetGameplayCamRelativeHeading()return gameHeading end
function GetGameplayCamRelativePitch()return gamePitch end
function SetGameplayCamRelativeHeading(value)gameHeading=value end
function SetGameplayCamRelativePitch(value)gamePitch=value end
function SetEntityLocallyInvisible(entity)hiddenEntities[#hiddenEntities+1]=entity end
function HideHudAndRadarThisFrame()end
function DisablePlayerFiring()end
function DisableControlAction()end
function PlayerId()return 1 end
ClosePhone=function()IsPhoneOpen=false;Phone.Camera.stop()end

loadrel('client/cl_camera.lua')
local started,front=Phone.Camera.start()
check(started);eq(front,false);check(InCamera);eq(CameraIsSelfie,false)
eq(createdPhones,1,'native mobile camera was created')
check(cellActivations[1].active and cellActivations[1].selfie,'native phone camera activated')
eq(radarHidden,true,'camera hides radar while active')
eq(focus,true);eq(keepInput,false,'camera releases gameplay input while controls are focused')
eq(cameraHoldSuspends,1,'camera suspends the existing phone hold')
eq(nativeCalls[1].hash,0x2491A93618B7D838,'rear-facing native selected on open')

local selfie=Phone.Camera.flip();check(selfie.Success);eq(selfie.IsSelfie,true);eq(CameraIsSelfie,true)
eq(nativeCalls[#nativeCalls-2].hash,0x2491A93618B7D838,'lens switch uses the native phone camera')
eq(nativeCalls[#nativeCalls-2].value,true)
check(Phone.Camera.orbit({Dx=12,Dy=-4}).Success,'selfie framing input accepted')
local originalWait=Wait
Wait=function()error('camera frame complete')end
pcall(THREADS[1]);Wait=originalWait
local hasYaw,hasPitch=false,false
for _,call in ipairs(nativeCalls) do
    if call.hash==0x1B0B4AEED5B9B41C then hasYaw=true end
    if call.hash==0xD6ADE981781FCA09 then hasPitch=true end
end
check(hasYaw and hasPitch,'selfie framing is applied through camera natives')
local rear=Phone.Camera.flip();check(rear.Success);eq(rear.IsSelfie,false);eq(CameraIsSelfie,false)
check(Phone.Camera.orbit({Dx=6,Dy=3}).Success,'rear framing input accepted')
eq(gameHeading,-6);eq(gamePitch,3)

Phone.Camera.stop();check(not InCamera);eq(CameraIsSelfie,false)
eq(destroyedPhones,1,'native phone camera destroyed on close')
eq(renderingCam,0);eq(radarHidden,false);eq(pedView,2);eq(vehicleView,1)
eq(focus,true);eq(keepInput,true,'original NUI input state restored')

Phone.VideoCameraActive=true
local refused=Phone.Camera.start();check(not refused,'FaceTime camera ownership blocks another camera');eq(createdPhones,1)
Phone.VideoCameraActive=false;Phone.KiloLiveCameraActive=true
refused=Phone.Camera.start();check(not refused,'KiloGram camera ownership blocks another camera');eq(createdPhones,1)
Phone.KiloLiveCameraActive=false

-- A camera started by another resource cannot be acquired or disabled.
renderingCam=900;existingCams[900]=true
refused=Phone.Camera.start();check(not refused,'existing scripted camera is not stolen');eq(renderingCam,900)
renderingCam=0;existingCams[900]=nil

-- Losing ownership releases only this phone camera and preserves new-owner state.
local owned=Phone.Camera.start();check(owned);local ownedCam=renderingCam
renderingCam=901;existingCams[901]=true;pedView,vehicleView=1,2;radarHidden=false;focus=false;keepInput=true
local oldWait=Wait;Wait=function()error('camera frame complete')end;pcall(THREADS[1]);Wait=oldWait
check(not InCamera,'camera exits after another resource takes the view')
eq(renderingCam,901,'new camera remains active')
eq(pedView,1);eq(vehicleView,2);eq(radarHidden,false);eq(focus,false);eq(keepInput,true)
check(destroyedPhones>=2 and ownedCam~=901,'only the phone-owned native session was destroyed')

-- Resource stop invokes the same owner-safe cleanup path.
renderingCam=0;existingCams[901]=nil;IsPhoneOpen=true
local final=Phone.Camera.start();check(final)
handlers.onClientResourceStop('peak-phone')
check(not InCamera);eq(renderingCam,0);eq(radarHidden,false)
