-- Screen frames must remain source-bound, bucket-bound, proximity-bound, and rate-limited.
local handlers,events={},{}
local now=5000
local deviceGenerations={}
local characterCids={}
PhoneDuoPropConfig={Distance=30,ScreenDistance=5,Debug=false}
Phone={NativeRegisterNetEvent=function(name) handlers[name]=false end,
    NativeAddEventHandler=function(name,fn) handlers[name]=fn end,
    rawPlayer=function(src) return {cid=characterCids[src] or 'cid-'..src} end,
    rawIdentity=function(raw) return raw.cid end,
    Devices={active=function(src) return {Generation=deviceGenerations[src]} end}}
function GetPlayerName(src) return src>=1 and src<=7 and 'Player' or nil end
function GetGameTimer() return now end
function GetPlayerPed(src) return src+100 end
function DoesEntityExist() return true end
function GetEntityHealth() return 100 end
function GetEntityCoords(ped)
    local x=({[101]=0,[102]=3,[103]=8,[104]=1,[105]=2,[106]=2,[107]=2})[ped]
    return {x=x,y=0,z=0}
end
function GetPlayerRoutingBucket(src) return src==4 and 2 or 1 end
function NetworkGetNetworkIdFromEntity(ped) return ped+100 end
function TriggerClientEvent(name,destination,...)
    events[#events+1]={name=name,destination=destination,args={...}}
end
function TriggerLatentClientEvent(name,destination,bps,...)
    eq(bps,131072,'viewer latent bandwidth is bounded')
    events[#events+1]={name=name,destination=destination,args={...}}
end
local screenThreads={};function CreateThread(fn)screenThreads[#screenThreads+1]=fn end
function RegisterCommand() end
loadrel('server/duo_prop.lua')
local tokens={}
for src=1,7 do deviceGenerations[src]=1 end
for src=1,4 do
    source=src;handlers['peak-phone:duoProp:hello']()
    for _,event in ipairs(events) do
        if event.name=='peak-phone:duoProp:init' and event.destination==src then tokens[src]=event.args[1] end
    end
end
source=1;handlers['peak-phone:duoProp:set'](tokens[1],0,true,false,false,false,false,'landscape',deviceGenerations[1])
local sequence={}
local function sendFrame(src,payload,expanded,orientation,override)
    source=src
    sequence[src]=override or ((sequence[src] or 0)+1)
    handlers['peak-phone:duoScreen:frame'](tokens[src],payload,expanded,sequence[src],orientation or 'landscape',deviceGenerations[src])
end
local function countFrames()
    local receivers={}
    for _,event in ipairs(events) do
        if event.name=='peak-phone:duoScreen:frame' then receivers[#receivers+1]=event.destination end
    end
    return receivers
end
local frame='duo2:'..string.rep('A',120)
sendFrame(1,frame,false)
local received=countFrames()
eq(#received,1,'one close viewer receives frame')
eq(received[1],2,'far and other-bucket viewers receive nothing')
now=5100;sendFrame(1,frame,false)
eq(#countFrames(),1,'frame flood is throttled')
now=5600;sendFrame(1,'data:text/html;base64,'..string.rep('A',120),false)
eq(#countFrames(),1,'wrong media type rejected')
sendFrame(2,frame,false)
eq(#countFrames(),1,'wrong generation rejected')
sendFrame(1,'duo2:'..string.rep('A',65536),false)
eq(#countFrames(),1,'oversized frame rejected')
sendFrame(1,frame,false)
eq(#countFrames(),2,'valid later frame reaches close viewer')
for src=5,7 do
    source=src;handlers['peak-phone:duoProp:hello']()
    for _,event in ipairs(events) do
        if event.name=='peak-phone:duoProp:init' and event.destination==src then tokens[src]=event.args[1] end
    end
end
for _,src in ipairs({3,5,6,7}) do
    source=src;handlers['peak-phone:duoProp:set'](tokens[src],0,true,false,false,false,false,'landscape',deviceGenerations[src])
end
local large='duo2:'..string.rep('A',32760)
now=6200
for _,src in ipairs({1,3,5,6,7}) do
    sendFrame(src,large,false)
end
local toTwo=0
for _,event in ipairs(events) do
    if event.name=='peak-phone:duoScreen:frame' and event.destination==2 then toTwo=toTwo+1 end
end
eq(toTwo,6,'viewer egress budget admits only four large new frames')
now=6700;source=7
local newest='duo2:'..string.rep('B',32760)
sendFrame(7,newest,false)
local delivered=false
for _,event in ipairs(events) do
    if event.name=='peak-phone:duoScreen:frame' and event.destination==2
        and event.args[1]==7 and event.args[4]==newest then delivered=true end
end
check(delivered,'pending viewer receives the newest coalesced frame')
-- Arrival order must not turn a newer app screen back into an old lock screen.
now=8000;source=1
local latest='duo2:'..string.rep('C',120)
sendFrame(1,latest,false,'landscape',100)
now=8300;local before=#countFrames()
sendFrame(1,frame,false,'landscape',99)
eq(#countFrames(),before,'Out-of-order owner frame rejected')
-- A viewer approaching a stationary owner receives the cached latest display.
local oldCoords=GetEntityCoords
GetEntityCoords=function(ped)if ped==103 then return {x=2,y=0,z=0}end;return oldCoords(ped)end
Wait=function()coroutine.yield()end
local drain=coroutine.create(screenThreads[1]);check(coroutine.resume(drain));now=9000;check(coroutine.resume(drain))
local replayed=false
for _,event in ipairs(events)do
    if event.name=='peak-phone:duoScreen:frame' and event.destination==3 and event.args[1]==1 and event.args[4]==latest then replayed=true end
end
check(replayed,'New nearby viewer gets latest frame without another owner UI update')
-- Portrait is synchronized through the owner snapshot and relayed frame protocol.
now=10000;source=5
handlers['peak-phone:duoProp:set'](tokens[5],1,true,true,false,false,true,'portrait',deviceGenerations[5])
local portraitSnapshot=false
for _,event in ipairs(events) do
    if event.name=='peak-phone:duoProp:snapshot' and event.destination==2 then
        for _,s in ipairs(event.args[3] or {}) do if s.owner==5 and s.expanded and s.orientation=='portrait' and s.deviceGeneration==deviceGenerations[5] then portraitSnapshot=true end end
    end
end
check(portraitSnapshot,'owner snapshot carries the settled portrait orientation')
sendFrame(5,frame,true,'portrait')
local portraitRelay=false
for _,event in ipairs(events) do
    if event.name=='peak-phone:duoScreen:frame' and event.destination==2 and event.args[1]==5 and event.args[4]==frame and event.args[5]==true and event.args[6]=='portrait' and event.args[7]==deviceGenerations[5] then portraitRelay=true end
end
check(portraitRelay,'nearby viewer receives portrait frame with matching pose')
local beforeInvalid=#countFrames()
sendFrame(5,frame,false,'portrait')
eq(#countFrames(),beforeInvalid,'folded portrait capture is rejected')
sendFrame(5,frame,true,'landscape')
eq(#countFrames(),beforeInvalid,'frame whose orientation differs from owner snapshot is rejected')
now=11000
local beforeIdentityInvalidation=#countFrames()
deviceGenerations[5]=2
check(Phone.DuoProp.invalidateIdentity(5,'cid-5'),'server identity mutation synchronously revokes the active prop generation')
sendFrame(5,frame,true,'portrait')
eq(#countFrames(),beforeIdentityInvalidation,'capture arriving after identity invalidation is rejected')
source=5;handlers['peak-phone:duoProp:set'](tokens[5],2,true,true,false,false,true,'portrait',deviceGenerations[5])
eq(#countFrames(),beforeIdentityInvalidation,'stale prop token cannot rebind itself to a new device generation')
local ownerRemoved=false
for i=#events,1,-1 do local event=events[i]
    if event.name=='peak-phone:duoProp:snapshot' and event.destination==2 then
        ownerRemoved=true;for _,s in ipairs(event.args[3] or {}) do if s.owner==5 then ownerRemoved=false;break end end
        break
    end
end
check(ownerRemoved,'identity invalidation removes the stale owner from snapshots')
now=14000;source=5;handlers['peak-phone:duoProp:hello']()
for _,event in ipairs(events) do if event.name=='peak-phone:duoProp:init' and event.destination==5 then tokens[5]=event.args[1] end end
source=5;handlers['peak-phone:duoProp:set'](tokens[5],0,true,true,false,false,true,'portrait',deviceGenerations[5])
now=14500;sendFrame(5,frame,true,'portrait')
check(#countFrames()>beforeIdentityInvalidation,'reopened current device generation can relay a fresh capture')
local beforeCharacterSwap=#countFrames()
characterCids[5]='new-character-5';now=15000
sendFrame(5,frame,true,'portrait')
eq(#countFrames(),beforeCharacterSwap,'old character cannot relay before the periodic identity refresh')
