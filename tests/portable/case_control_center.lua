local text=LoadResourceFile('peak-phone','server/sv_peakify.lua')
local block=text:match('(Peak.Functions.CreateCallback%("peak%-phone:Server:Peakify:Volume".-)\nPeak.Functions.CreateCallback%("peak%-phone:Server:Peakify:Stop"')
check(block,'volume route exists')
local callback,allowed,broadcasts=nil,true,0
local sessions={radio={NetworkId='radio',Volume=.35,Paused=true,Url='https://example.com/song.mp3'}}
local env={type=type,Peak={Functions={CreateCallback=function(_,fn)callback=fn end}},Peakify={ActiveSessions=sessions},PeakifyNow=function()return 123 end,
ResolveNetworkTarget=function()return {Success=allowed}end,TriggerClientEvent=function(name,target,data)eq(name,'peak-phone:Client:Peakify:VolumeSession');eq(target,-1);eq(data.Volume,.6);broadcasts=broadcasts+1 end}
assert(load(block,'volume','t',env))()
local function call(data)local result;callback(1,function(value)result=value end,data);return result end
for _,data in ipairs({{}, {NetworkId='radio',Volume=-1},{NetworkId='radio',Volume=2},{NetworkId='radio',Volume='0.5'},{NetworkId='radio',Volume=0/0},{NetworkId='missing',Volume=.6}})do eq(call(data),false)end
eq(call(nil),false)
allowed=false;eq(call({NetworkId='radio',Volume=.6}),false);eq(sessions.radio.Volume,.35);eq(broadcasts,0)
allowed=true;eq(call({NetworkId='radio',Volume=.6}),true);eq(sessions.radio.Volume,.6);eq(sessions.radio.Paused,true);eq(sessions.radio.Url,'https://example.com/song.mp3');eq(broadcasts,1)
local nui,thread,draws,dead=nil,nil,0,false
local env2={type=type,RegisterNUICallback=function(name,fn)eq(name,'Phone/Flashlight');nui=fn end,CreateThread=function(fn)thread=coroutine.create(fn)end,
PlayerPedId=function()return 1 end,IsPedDeadOrDying=function()return dead end,GetEntityCoords=function()return {x=0,y=0,z=0}end,GetEntityForwardVector=function()return {x=0,y=1,z=0}end,
DrawSpotLight=function()draws=draws+1 end,Wait=function(ms)coroutine.yield(ms)end}
assert(load(LoadResourceFile('peak-phone','client/cl_control_center.lua'),'flashlight','t',env2))()
local function toggle(data)local value;nui(data,function(r)value=r end);return value end
eq(toggle({Enabled='yes'}),false);eq(toggle({Enabled=true}),'Ok');check(coroutine.resume(thread));eq(draws,1)
eq(toggle({Enabled=false}),'Ok');check(coroutine.resume(thread));eq(draws,1)
eq(toggle({Enabled=true}),'Ok');dead=true;check(coroutine.resume(thread));eq(draws,1);dead=false;check(coroutine.resume(thread));eq(draws,1)
