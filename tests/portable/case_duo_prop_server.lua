-- A nil/invalid event source must not index the hello throttle or notify a player.
local handlers, sent = {}, {}
PhoneDuoPropConfig={Distance=30,Debug=false}
Phone={
    NativeRegisterNetEvent=function(name) handlers[name]=handlers[name] or false end,
    NativeAddEventHandler=function(name,fn) handlers[name]=fn end,
    rawPlayer=function(src) return (src==0 or src==1) and {cid='CID-'..src} or nil end,
    rawIdentity=function(raw) return raw and raw.cid end,
}
function GetPlayerName(src) return (src==0 or src==1) and 'Player' or nil end
function GetGameTimer() return 5000 end
function GetPlayerPed() return 0 end
function TriggerClientEvent(name,destination,...)
    sent[#sent+1]={name=name,destination=destination,args={...}}
end
function CreateThread() end
function RegisterCommand() end
loadrel('server/duo_prop.lua')

source=nil
handlers['peak-phone:duoProp:hello']()
eq(#sent,0,'nil event source ignored')
source=0
handlers['peak-phone:duoProp:hello']()
eq(#sent,1,'player zero receives initialization')
eq(sent[1].destination,0,'player zero stays source-bound')
source=1
handlers['peak-phone:duoProp:hello']()
eq(#sent,2,'valid player receives initialization')
eq(sent[2].destination,1,'initialization stays source-bound')
handlers['peak-phone:duoProp:hello']()
eq(#sent,2,'repeated hello is throttled')
