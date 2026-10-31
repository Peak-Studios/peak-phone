-- Execute actual module registrations. Game frames/native implementations are not simulated.
base('qbcore');Citizen.CreateThread=CreateThread;Citizen.Wait=Wait;Citizen.SetTimeout=SetTimeout
local callbacks={};RegisterNUICallback=function(name,fn)assert(not callbacks[name],'duplicate native route '..name);callbacks[name]=fn end
function RegisterKeyMapping()end
function PlayerPedId()return 1 end
function PlayerId()return 1 end
function GetResourceKvpString()return nil end
function SetResourceKvp()end
function SendNUIMessage()end
function SetNuiFocus()end
function SetNuiFocusKeepInput()end
lib={notify=function()end,hideTextUI=function()end}
loadrel('config.lua');loadrel('bridge/client.lua');loadrel('integrations/client.lua')
local files=CLIENT_LUA_FILES or {}
if #files==0 then local pipe=assert(io.popen('find "'..ROOT..'/client" -maxdepth 1 -type f -name "*.lua" | sort'));for name in pipe:lines()do files[#files+1]=name:sub(#ROOT+2)end;pipe:close() end
for _,name in ipairs(files)do loadrel(name);TEST_COUNT=TEST_COUNT+1 end
check(callbacks['Contacts/CreateContact'],'Missing route Contacts/CreateContact');check(callbacks['Facetime/StartCall'],'Missing route Facetime/StartCall');check(callbacks['Documents/SaveDocument'],'Missing route Documents/SaveDocument');check(callbacks['Messages/SendMessage'],'Missing route Messages/SendMessage');check(callbacks['Groups/SetReaction'],'Missing route Groups/SetReaction')
eq(callbacks['Housing/GetHouses'],nil,'no unsupported gameplay route registered')
local native={};for k in pairs(callbacks)do native[#native+1]=k end;table.sort(native)
-- Isolate registration coverage from integration availability: legacy modules themselves are
-- preserved and can register when their external resources are present. No operation is run.
Phone.legacyAvailable=function()return true end
for _,name in ipairs(files)do if LoadResourceFile('peak-phone',name):match('^if not Phone.legacyAvailable')then loadrel(name)end end
local all={};for k in pairs(callbacks)do all[#all+1]=k end;table.sort(all)
local out=assert(io.open(ROOT..'/tests/contracts/nui-routes.json','w'))
local function arr(t)local s={};for _,v in ipairs(t)do s[#s+1]=string.format('%q',v)end;return '['..table.concat(s,',')..']'end
out:write('{"native":'..arr(native)..',"withLegacyRegistration":'..arr(all)..',"liveFiveM":false}');out:close()
eq(#native,284,'native route count');eq(#all,362,'native + preserved legacy route count')
for _,name in ipairs({'GetSocialState','MarkNotificationsRead','ToggleRepost','DeletePost'}) do check(callbacks['Y/'..name],'new Y route '..name) end

check(callbacks['Peakify/Search'],'catalog search route registered');check(callbacks['Phone/MediaOutput'],'hardware output route registered')
check(callbacks['Notifications/Dismiss'],'safe notification dismiss route registered')
check(callbacks['Weather/GetState'],'read-only current game weather route registered')

local previousTones=PhoneConfig.Ringtones.Custom
local previousHud=PhoneServices and PhoneServices['peak-hud']
PhoneConfig.Ringtones.Custom={{id='studio-bell',label='Studio Bell',src='ringtones/studio-bell.ogg'},
    {id='custom',label='Reserved',src='ringtones/reserved.wav'},{id='bad id',label='Unsafe',src='ringtones/unsafe.wav'},
    {id='bad-source',label='Unsafe Source',src='http://example.invalid/tone.wav'}}
PhoneServices=PhoneServices or {};PhoneServices['peak-hud']={GetPreferenceById=function(_,id) return id=='Phone.Ringtone' and 'ringtones.stilldre' or nil end}
local settingsPreferences;callbacks['Phone/GetPreferences']({},function(value)settingsPreferences=value end)
eq(settingsPreferences['Phone.Ringtone'],'ringtones.stilldre','legacy ringtone preference is preserved by the config bridge')
eq(#settingsPreferences.RingtoneOptions,1,'only validated configured ringtones are exposed to Settings')
eq(settingsPreferences.RingtoneOptions[1].id,'studio-bell','custom ringtone ID is bridged to Settings')
eq(settingsPreferences.RingtoneOptions[1].label,'Studio Bell','custom ringtone label is bridged to Settings')
eq(Phone.ringtoneId('ringtones.stilldre'),'pulse','legacy Still DRE preference remains an audio alias')
PhoneConfig.Ringtones.Custom=previousTones;PhoneServices['peak-hud']=previousHud

-- Notification actions and ignores must be bound to the exact offered generation.
PhoneServices=PhoneServices or {}
PhoneServices['peak-inventory']={HasEnoughOfItem=function()return true end}
local sentMessages,accepts={},0
SendNUIMessage=function(message)sentMessages[#sentMessages+1]=message end
IsPhoneOpen=true
local token1=Notification('notif-race','fas fa-bell',{'white','#123456'},'First','Private first offer',nil,nil,function()accepts=accepts+1 end,nil,{})
local token2=Notification('notif-race','fas fa-bell',{'white','#123456'},'Second','Replacement offer',nil,nil,function()accepts=accepts+10 end,nil,{})
check(token1~=token2,'reused notification IDs get a new token')
eq(sentMessages[#sentMessages].Token,token2,'notification token is sent to NUI')
local staleClick
callbacks['Notifications/Click']({Id='notif-race',Token=tostring(token1),Accepted=true},function(result)staleClick=result end)
check(staleClick.Stale==true,'old notification click is rejected')
eq(accepts,0,'stale action callback does not run')
local staleDismiss
callbacks['Notifications/Dismiss']({Id='notif-race',Token=tostring(token1)},function(result)staleDismiss=result end)
eq(NotificationsIds['notif-race'].Token,token2,'old dismiss cannot remove replacement offer')
local sentBeforeStaleUpdate=#sentMessages
check(not UpdateNotification('notif-race',false,false,nil,nil,false,true,nil,nil,token1),'old token cannot update a replacement offer')
eq(#sentMessages,sentBeforeStaleUpdate,'stale update does not reach the current NUI card')
check(not RemoveNotification('notif-race',token1),'old token cannot remove a replacement offer')
eq(#sentMessages,sentBeforeStaleUpdate,'stale removal does not reach the current NUI card')
check(not UpdateNotification('untracked-notification',false,false,nil,nil,false,true),'untracked stale update is ignored')
check(not RemoveNotification('untracked-notification'),'untracked stale removal is ignored')
local realCurrent=IsNotificationCurrent
local boundaryChecks=0
IsNotificationCurrent=function(id,token)boundaryChecks=boundaryChecks+1;if boundaryChecks==2 then return false end;return realCurrent(id,token)end
local boundaryToken=Notification('notif-boundary','fas fa-bell',{'white','#123456'},'Boundary','Lock during dispatch',nil,nil,function()accepts=accepts+1000 end,nil,{})
local boundaryResult
callbacks['Notifications/Click']({Id='notif-boundary',Token=tostring(boundaryToken),Accepted=true},function(result)boundaryResult=result end)
IsNotificationCurrent=realCurrent
check(boundaryResult.Stale==true and accepts==0,'lock at callback boundary blocks the action')
check(not NotificationsIds['notif-boundary'].ActionStarted,'blocked callback leaves no partially consumed action state')
NotificationsIds['notif-boundary']=nil
local token3
NotificationsIds['notif-race'].OnAccept=function()token3=Notification('notif-race','fas fa-bell',{'white','#123456'},'Third','A newer offer',nil,nil,nil,nil,{})end
local accepted
callbacks['Notifications/Click']({Id='notif-race',Token=tostring(token2),Accepted=true},function(result)accepted=result end)
check(accepted.Success and accepted.Consumed,'current accept is acknowledged')
check(token3 and NotificationsIds['notif-race'].Token==token3,'late action completion does not clear a newer offer')
check(IsNotificationCurrent('notif-race',token3),'current offer identity is recognized')
ResetNotifications()
check(not IsNotificationCurrent('notif-race',token3),'session reset invalidates outstanding offer callbacks')
local identityActionCalls=0
local identityToken=Notification('notif-identity-boundary','fas fa-bell',{'white','#123456'},'Private','Must expire before identity reset',nil,nil,function()identityActionCalls=identityActionCalls+1 end,nil,{})
local identityBoundaryOrder={}
local realResetNotifications,realSendNUIMessage=ResetNotifications,SendNUIMessage
ResetNotifications=function()identityBoundaryOrder[#identityBoundaryOrder+1]='reset';realResetNotifications()end
SendNUIMessage=function(message)if message and message.Action=='Duo/IdentityChanging'then identityBoundaryOrder[#identityBoundaryOrder+1]='nui'end;realSendNUIMessage(message)end
source=1;EVENTS['peak-phone:portable:identityInvalidating']('Spoofed event');source=nil
check(IsNotificationCurrent('notif-identity-boundary',identityToken),'untrusted identity invalidation cannot clear notification actions')
local generationBeforeIdentity=Phone.Client.Generation
source=65535;EVENTS['peak-phone:portable:identityInvalidating']('Device identity changed.');source=nil
ResetNotifications,SendNUIMessage=realResetNotifications,realSendNUIMessage
check(Phone.Client.Generation==generationBeforeIdentity+1,'trusted identity invalidation rejects pending phone callbacks first')
check(table.concat(identityBoundaryOrder,',')=='reset,nui','trusted identity invalidation clears callback registry immediately before NUI')
local identityClick
callbacks['Notifications/Click']({Id='notif-identity-boundary',Token=tostring(identityToken),Accepted=true},function(result)identityClick=result end)
check(identityClick.Stale==true and identityActionCalls==0,'identity-invalidating event rejects click tokens before the later full reset')
local dismissed=0
Notification('notif-ignore','fas fa-bell',{'white','#123456'},'Ignore','No callback',nil,nil,function()accepts=accepts+100 end,nil,{})
local ignoreToken=NotificationsIds['notif-ignore'].Token
callbacks['Notifications/Dismiss']({Id='notif-ignore',Token=tostring(ignoreToken)},function()dismissed=dismissed+1 end)
eq(dismissed,1,'ignore responds to its own route')
eq(accepts,0,'ignore never accepts the notification')
eq(NotificationsIds['notif-ignore'],nil,'ignore only clears the matching action record')
SendNUIMessage=function()end

-- Closed/locked screens cannot invoke a retained callback, and records stay
-- bounded even when notifications arrive without an open NUI surface.
local oldTimer=GetGameTimer
local now=1000
GetGameTimer=function()return now end
IsPhoneOpen=false
local closedCalls=0
local closedToken=Notification('notif-closed','fas fa-bell',{'white','#123456'},'Closed','Must not accept while closed',nil,nil,function()closedCalls=closedCalls+1 end,nil,{})
local closedResult
callbacks['Notifications/Click']({Id='notif-closed',Token=tostring(closedToken),Accepted=true},function(result)closedResult=result end)
check(closedResult.Stale==true and closedCalls==0,'closed phone cannot dispatch notification callback')
IsPhoneOpen=true
local oldClient=Phone and Phone.Client
Phone=Phone or {};Phone.Client={Device={Locked=true}}
local lockedToken=Notification('notif-locked','fas fa-bell',{'white','#123456'},'Private','Must not accept while locked',nil,nil,function()closedCalls=closedCalls+1 end,nil,{})
local lockedResult
callbacks['Notifications/Click']({Id='notif-locked',Token=tostring(lockedToken),Accepted=true},function(result)lockedResult=result end)
check(lockedResult.Stale==true and closedCalls==0,'locked phone cannot dispatch notification callback')
Phone.Client=oldClient
ResetNotifications()

local refreshToken=Notification('notif-refresh','fas fa-phone-alt',{'white','#123456'},'Call','Long running call',false,false,function()end,nil,{HideOnAction=false})
now=now+50*60*1000
check(UpdateNotification('notif-refresh',false,false,nil,nil,false,false,nil,nil,refreshToken),'current explicit update refreshes retained notification')
now=now+50*60*1000
check(IsNotificationCurrent('notif-refresh',refreshToken),'timer/action record remains valid after an explicit refresh')
now=now+11*60*1000
check(not IsNotificationCurrent('notif-refresh',refreshToken),'stale callback expires after its bounded lifetime')

local boundedTokens={}
for index=1,40 do boundedTokens[index]=Notification('notif-cap-'..index,'fas fa-bell',{'white','#123456'},'Bounded','Record '..index,nil,nil,nil,nil,{}) end
local retained=0
for _ in pairs(NotificationsIds)do retained=retained+1 end
eq(retained,32,'Lua notification callback registry has a hard record cap')
check(not IsNotificationCurrent('notif-cap-1',boundedTokens[1]),'oldest callback is evicted when the record cap is exceeded')
ResetNotifications()
GetGameTimer=oldTimer
