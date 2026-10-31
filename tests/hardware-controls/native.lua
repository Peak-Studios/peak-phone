local callbacks,events,sounds={},{},{}
Phone={started=function()return true end};Peak={};PhonePeak=Peak
Citizen={CreateThread=function()end};CreateThread=Citizen.CreateThread
function RegisterNUICallback(name,fn)callbacks[name]=fn end
function RegisterNetEvent()end
function AddEventHandler(name,fn)events[name]=fn end
function RegisterCommand()end
function GetCurrentResourceName()return 'peak-phone'end
function PlayerPedId()return 1 end
function GetEntityCoords()return {x=0,y=0,z=0}end
exports={xsound={soundExists=function(_,id)return sounds[id]~=nil end,
Destroy=function(_,id)sounds[id]=nil end,Distance=function()end,
PlayUrlPos=function(_,id,url,volume)sounds[id]=volume end,
setVolume=function(_,id,volume)sounds[id]=volume end}}
CurrentNetwork='peakify-vehicle-test'
dofile('client/cl_hardware.lua');dofile('client/cl_peakify.lua')
events['peak-phone:Client:Peakify:PlaySession']({NetworkId=CurrentNetwork,Url='https://example.test/song.mp3',Volume=.8})
events['peak-phone:Client:Peakify:PlaySession']({NetworkId='peakify-boombox-other',Url='https://example.test/other.mp3',Volume=.6})
local function near(value,expected)assert(math.abs(value-expected)<.000001,tostring(value)..' ~= '..expected)end
local function set(data)local result;callbacks['Phone/MediaOutput'](data,function(value)result=value end);return result end
near(sounds['peakify_peakify-vehicle-test'],.56);near(sounds['peakify_peakify-boombox-other'],.6)
assert(set({Volume=.5,Powered=true}).Success);near(sounds['peakify_peakify-vehicle-test'],.4)
source=65535;events['peak-phone:Client:Peakify:VolumeSession']({NetworkId=CurrentNetwork,Volume=.4});near(sounds['peakify_peakify-vehicle-test'],.2)
assert(set({Volume=.9,Powered=false}).Success);near(sounds['peakify_peakify-vehicle-test'],0);near(sounds['peakify_peakify-boombox-other'],.6)
assert(set({Volume=.9,Powered=true}).Success);near(sounds['peakify_peakify-vehicle-test'],.36)
assert(not set({Volume=0/0,Powered=true}).Success);assert(not set({Volume=2,Powered=true}).Success);assert(not set({Volume=.2,Powered='yes'}).Success)
CurrentNetwork='peakify-boombox-other';Phone.refreshMusicOutput();near(sounds['peakify_peakify-vehicle-test'],.4);near(sounds['peakify_peakify-boombox-other'],.54)
CurrentNetwork='';Phone.refreshMusicOutput();near(sounds['peakify_peakify-boombox-other'],.6)
print('PASS native music output: playback, server updates, phone volume, power, invalid input, output switches and other listeners')
