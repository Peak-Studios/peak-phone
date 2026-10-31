-- Real client Lua control/state/camera modules. FiveM/pma exports are deterministic fakes.
base('qbcore');RegisterNetEvent=Phone.NativeRegisterNetEvent -- client environment has no server event wrapper
local nui,handlers,messages,sent={},{},{},{}
RegisterNUICallback=function(n,f)check(not nui[n],'Unique NUI route '..n);nui[n]=f end
AddEventHandler=function(n,f)handlers[n]=handlers[n] or {};table.insert(handlers[n],f)end
SendNUIMessage=function(d)messages[#messages+1]=copy(d)end
TriggerServerEvent=function(n,...)sent[#sent+1]={name=n,args=table.pack(...)}end
PlayerId=function()return 1 end;PlayerPedId=function()return 1 end;GetPlayerServerId=function()return 1 end
StopAnimTask=function()end;Phone.removeProp=function()end;Phone.addProp=function()end;IsPhoneOpen=true
local volume,muted,overrides=50,{[9]=true},{}
Peak.Functions.Notify=function(text,kind)CALLS[#CALLS+1]={text=text,kind=kind}end
MumbleSetVolumeOverrideByServerId=function(src,v)overrides[src]=v end
resource('pma-voice',{
 isPlayerMuted=function(_,src)return muted[src]==true end,getMutedPlayers=function()return muted end,
 toggleMutePlayer=function(_,src)muted[src]=not muted[src] or nil;overrides[src]=muted[src] and 0 or -1 end,
 getCallVolume=function()return volume end,
 setCallVolume=function(_,v)volume=v;overrides[2]=v/100;overrides[9]=v/100 end,
})
local renders,camExists={},{}
local scriptCamCalls,mobileCreates,mobileDestroys=0,0,0
local nativeCalls={}
GetRenderingCam=function()return _rendering or 0 end;DoesCamExist=function(c)return camExists[c]==true end
CreateCam=function()scriptCamCalls=scriptCamCalls+1;camExists[50]=true;return 50 end
DestroyCam=function(c)camExists[c]=nil end
RenderScriptCams=function(enabled)renders[#renders+1]=enabled;_rendering=enabled and 50 or 0 end
CreateMobilePhone=function()mobileCreates=mobileCreates+1;camExists[50]=true end
CellCamActivate=function(enabled)if enabled then _rendering=50 elseif _rendering==50 then _rendering=0 end end
DestroyMobilePhone=function()mobileDestroys=mobileDestroys+1;camExists[50]=nil;if _rendering==50 then _rendering=0 end end
Citizen=Citizen or {};Citizen.CreateThread=CreateThread;Citizen.Wait=Wait
Citizen.InvokeNative=function(hash,value)nativeCalls[#nativeCalls+1]={hash=hash,value=value}end
IsEntityDead=function()return false end;IsPauseMenuActive=function()return false end;DoesEntityExist=function(entity)return entity~=nil and entity~=0 end
IsEntityPlayingAnim=function()return false end;GetFrameTime=function()return 1/60 end
GetFollowPedCamViewMode=function()return 2 end;GetFollowVehicleCamViewMode=function()return 1 end
SetFollowPedCamViewMode=function()end;SetFollowVehicleCamViewMode=function()end
IsRadarHidden=function()return false end;DisplayRadar=function()end
IsNuiFocused=function()return true end;IsNuiFocusKeepingInput=function()return true end
SetNuiFocus=function()end;SetNuiFocusKeepInput=function()end
DisablePlayerFiring=function()end;DisableControlAction=function()end;HideHudAndRadarThisFrame=function()end
GetPedBoneCoords=function()return vector3(0,0,1.6)end
GetOffsetFromEntityInWorldCoords=function()return vector3(0,0.8,1.6)end
SetCamCoord=function()end;PointCamAtCoord=function()end;SetCamRot=function()end;SetCamFov=function()end;GetEntityHeading=function()return 0 end
Peak.SendCallback=function()return {Success=true}end
loadrel('client/cl_call_ui.lua');loadrel('client/cl_contacts.lua');loadrel('client/cl_camera.lua');loadrel('client/cl_facetime.lua')
local function call(id,extra)local d={CallId=id,Kind='video',Status='active',AudioMode='voice',Peer=2};for k,v in pairs(extra or {})do d[k]=v end;return d end
local function invoke(name,data)local count,result=0,nil;assert(nui[name],name)(data or {},function(v)count=count+1;result=v end);eq(count,1,'NUI callback responds once: '..name);return result end
Phone.applyCallState(call('A'))
check(invoke('Calls/AudioOutput',{CallId='A',Speaker=true}).Success);eq(volume,100);eq(overrides[9],0,'Existing player mute survives volume resync');eq(CallData.LocalSpeaker,true)
Phone.applyCallState(call('A',{PeerMuted=true}));eq(muted[2],true)
check(invoke('Calls/AudioOutput',{CallId='A',Speaker=false}).Success);eq(overrides[2],0,'Call mute survives output change')
Phone.applyCallState(call('A',{PeerMuted=false}));eq(muted[2],nil);eq(overrides[2],0.5,'Unmute restores full call reception, not distance attenuation')
muted[2]=true;Phone.applyCallState(call('A',{PeerMuted=true}));Phone.applyCallState(call('A',{PeerMuted=false}));eq(muted[2],true,'Preexisting external mute never undone');muted[2]=nil
Phone.applyCallState(call('A',{PeerMuted=true}));check(Phone.setCallOutput(true).Success)
volume=73 -- changed by another UI after this phone applied 100
check(invoke('Calls/EndCall',{CallId='A'}).Success);eq(CallData,nil);eq(muted[2],nil);eq(muted[9],true);eq(volume,73,'Preserves independent volume setting')
check(Phone.isCallClosed('A'));eq(sent[#sent].name,'peak-phone:Server:Contacts:DeclineCall')
Phone.applyCallState(call('A'));eq(CallData,nil,'Late state push cannot reopen ended call')
event('peak-phone:portable:rtcStart',65535,{CallId='A'});eq(Phone.VideoCameraActive,false)
Phone.applyCallState(call('B'));Phone.applyCallState(nil,'A');eq(CallData.CallId,'B','Old stop cannot dismiss current call')
-- A State RPC that yielded must not overwrite a newer local or pushed state.
local old=copy(CallData),response
Peak.SendCallback=function(name)eq(name,'peak-phone:Server:Calls:State');return coroutine.yield('waiting')end
local co=coroutine.create(function()nui['Calls/GetState']({},function(v)response=v end)end)
check(coroutine.resume(co));invoke('Calls/EndCall',{CallId='B'});check(coroutine.resume(co,{Success=true,Data=old}));eq(response.Data,false);eq(CallData,nil)
co=coroutine.create(function()nui['Calls/GetState']({},function(v)response=v end)end)
check(coroutine.resume(co));Phone.applyCallState(call('C'));check(coroutine.resume(co,{Success=true,Data=false}));eq(response.Data.CallId,'C','Late empty snapshot cannot end new call')
-- Abort remains deliverable after local media/state is already gone.
invoke('Calls/EndCall',{CallId='C'});local before=#sent
check(invoke('Facetime/Abort',{CallId='C'}));eq(#sent,before+1);eq(sent[#sent].name,'peak-phone:portable:rtcAbort')
-- Camera startup waits for credentials; cancellation invalidates the waiting generation.
Peak.SendCallback=function()return coroutine.yield('credentials')end
local thread=#THREADS+1;event('peak-phone:portable:rtcStart',65535,{CallId='D',Peer=2,Initiator=true})
co=coroutine.create(THREADS[thread]);check(coroutine.resume(co));Phone.stopVideo('D');check(coroutine.resume(co,{Success=true,IceServers={}}));eq(Phone.VideoCameraActive,false);eq(next(camExists),nil)
-- Real control flow acquires, pauses, flips, resumes, then releases ONLY our game camera.
Peak.SendCallback=function()return {Success=true,IceServers={}}end
Phone.applyCallState(call('E'));thread=#THREADS+1;event('peak-phone:portable:rtcStart',65535,{CallId='E',Peer=2,Initiator=true});THREADS[thread]()
eq(Phone.VideoCameraActive,true);check(camExists[50]);eq(scriptCamCalls,0,'FaceTime shares the native mobile camera')
check(invoke('Facetime/FlipCamera',{CallId='E'}).Front==false)
local paused=invoke('Facetime/ToggleVideo',{CallId='E',Enabled=false});eq(paused.Enabled,false);eq(camExists[50],nil)
check(invoke('Facetime/ToggleVideo',{CallId='E',Enabled=true}).Enabled);_rendering=99;camExists[99]=true
local renderCount=#renders;invoke('Calls/EndCall',{CallId='E'});eq(Phone.VideoCameraActive,false);eq(camExists[50],nil);eq(camExists[99],true);eq(#renders,renderCount,'Does not disable another resource camera')
check(mobileCreates>=2 and mobileDestroys>=2,'native mobile sessions release on pause and end')
-- Network sender authentication and unload restoration.
event('peak-phone:Client:SetCallData',123,call('untrusted'));eq(CallData,nil)
Phone.applyCallState(call('F'));Phone.setCallOutput(true)
for _,handler in ipairs(handlers['Peak:Client:OnPlayerUnload'])do handler()end
eq(CallData,nil);check(Phone.isCallClosed('F'));eq(Phone.VideoCameraActive,false)
