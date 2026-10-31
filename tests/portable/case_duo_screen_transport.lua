local code=LoadResourceFile('peak-phone','client/cl_duo_prop.lua')
local snapshot=code:sub(assert(code:find("RegisterNetEvent('peak-phone:duoProp:snapshot'",1,true)),assert(code:find('P.remoteFrames={}',code:find("RegisterNetEvent('peak-phone:duoProp:snapshot'",1,true),true))-1)
local transport=code:sub(assert(code:find('local function sendPendingScreen',1,true)),assert(code:find('CreateThread(function()\n    while not P.stopped do\n        local active=false',1,true))-1)
P={token=10,packet=0,effective=true,expanded=false,orientation='landscape',visuals={},remote={},remoteFrames={}}
Phone={Client={Device={Generation=7}}};IsPhoneOpen=true;source=65535
local calls,renders,nui={},{},{}
function RegisterNUICallback(name,fn)nui[name]=fn end
function RegisterNetEvent(name,fn)EVENTS[name]=fn end
function screenUpdate(v,frame)renders[#renders+1]=frame;v.screenFrame=frame end
function remove()end;function target(v,expanded)v.expanded=expanded end
function orient(v,orientation)v.orientation=orientation;v.orientationAngle=orientation=='portrait' and -90 or 0 end
function attachSeatedTray()end
function TriggerLatentServerEvent(name,bps,token,frame,expanded,sequence,orientation,deviceGeneration)calls[#calls+1]={frame=frame,expanded=expanded,sequence=sequence,orientation=orientation,deviceGeneration=deviceGeneration}end
local pump=assert(load(snapshot..'\n'..transport..' return sendPendingScreen'))()
local lock='duo2:'..string.rep('A',120);local app='duo2:'..string.rep('B',120)
local function capture(frame,expanded,orientation)nui['Phone/PhysicalScreenFrame']({Frame=frame,LocalFrame=frame,Expanded=expanded,Orientation=orientation,DeviceGeneration=7},function(r)check(r.Success)end)end
CLOCK=1000;capture(lock,false,'landscape');eq(#calls,1);eq(calls[1].expanded,false,'owner folded capture preserves false');eq(calls[1].orientation,'landscape');eq(calls[1].deviceGeneration,7,'owner event carries the server-issued device generation')
CLOCK=1100;capture(app,false,'landscape');eq(#calls,1,'Network cooldown defers final UI change')
CLOCK=1300;pump();eq(#calls,2);eq(calls[2].frame,app,'Final app update flushes without another NUI frame');check(calls[2].sequence>calls[1].sequence)
P.expanded=true;P.orientation='portrait';CLOCK=1400;capture(app,true,'portrait');CLOCK=1600;pump();eq(calls[#calls].orientation,'portrait','owner portrait capture carries orientation')
P.visuals[2]={generation=9,deviceGeneration=7,expanded=false,reduced=false,hasSim=false,orientation='landscape'}
EVENTS['peak-phone:duoScreen:frame'](2,9,4,lock,true,'portrait',6);eq(#renders,0,'early frame with a different device generation is only pending')
EVENTS['peak-phone:duoScreen:frame'](2,9,5,app,true,'portrait',7);eq(#renders,0,'Early server frame awaits authenticated prop snapshot')
check(P.pendingRemoteFrames[2]);P.visuals[2]={generation=9,expanded=false,reduced=false,hasSim=false,orientation='landscape'}
EVENTS['peak-phone:duoProp:snapshot'](10,1,{{owner=2,generation=9,deviceGeneration=7,revision=1,ped=100,expanded=true,reduced=false,orientation='portrait',hasSim=false,simOperation=false}})
eq(renders[#renders],app,'Early latest frame is replayed after snapshot');eq(P.visuals[2].orientation,'portrait');eq(P.visuals[2].orientationAngle,-90,'remote portrait pose matches owner quarter turn')
EVENTS['peak-phone:duoScreen:frame'](2,9,4,lock,true,'portrait',7);eq(renders[#renders],app,'Old lock frame cannot replace app')
EVENTS['peak-phone:duoScreen:frame'](2,8,6,lock,true,'portrait',7);eq(renders[#renders],app,'Previous character generation rejected')
source='';EVENTS['peak-phone:duoScreen:frame'](2,9,6,lock,true,'portrait',7);eq(renders[#renders],app,'Cfx local TriggerEvent source rejected')
source=0;EVENTS['peak-phone:duoScreen:frame'](2,9,6,lock,true,'portrait',6);eq(renders[#renders],app,'Previous device-session generation rejected')
EVENTS['peak-phone:duoScreen:frame'](2,9,6,lock,true,'portrait',7);eq(renders[#renders],lock,'Cfx latent server source net:0 accepted')
EVENTS['peak-phone:duoScreen:frame'](2,9,7,app,false,'portrait',7);eq(renders[#renders],lock,'Folded portrait frame rejected')
source=1;EVENTS['peak-phone:duoScreen:frame'](2,9,8,app,true,'portrait',7);eq(renders[#renders],lock,'Other numeric source rejected')
