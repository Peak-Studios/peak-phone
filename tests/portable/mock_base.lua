TEST_COUNT=0
function check(v,msg) assert(v,msg or debug.traceback('Check failed')); TEST_COUNT=TEST_COUNT+1 end
function eq(a,b,msg) check(a==b,(msg or '')..' expected '..tostring(b)..', got '..tostring(a)) end
function copy(v) if type(v)~='table' then return v end;local t={};for k,x in pairs(v) do t[k]=copy(x) end;return t end
-- Stable JSON encoder and fixture decoder. The real runtime's CJSON/MessagePack is NOT under test.
local encoded={}
local function encode(v)
 if v==nil then return 'null' elseif type(v)=='string' then return string.format('%q',v) elseif type(v)=='number' or type(v)=='boolean' then return tostring(v) end
 local ks={};for k in pairs(v) do ks[#ks+1]=k end;table.sort(ks,function(a,b)return tostring(a)<tostring(b)end)
 local r={};for _,k in ipairs(ks) do r[#r+1]=encode(tostring(k))..':'..encode(v[k]) end
 local s='{'..table.concat(r,',')..'}';encoded[s]=copy(v);return s
end
json={encode=encode,decode=function(s) if s=='{}' or s=='[]' then return {} elseif s=='null' then return nil end;if encoded[s] then return copy(encoded[s]) end;error('Not a JSON fixture') end}
CLOCK=1000;THREADS={};TIMERS={};EVENTS={};EMITTED={};COMMANDS={};EXPORTED={};CALLS={};CONVARS={}
function GetGameTimer() return CLOCK end
function Wait(ms) CLOCK=CLOCK+ms;if ON_WAIT then ON_WAIT() end end
function CreateThread(fn) THREADS[#THREADS+1]=fn end
function SetTimeout(ms,fn) TIMERS[#TIMERS+1]={at=CLOCK+ms,fn=fn} end
function RegisterNetEvent(name,fn) if fn then EVENTS[name]=fn end end
function AddEventHandler(name,fn) EVENTS[name]=fn end
function TriggerClientEvent(name,src,...) EMITTED[#EMITTED+1]={name=name,src=src,args=table.pack(...)} end
function TriggerEvent(name,...) CALLS[#CALLS+1]={name=name,args={...}} end
function RegisterCommand(name,fn) COMMANDS[name]=fn end
function GetCurrentResourceName() return 'peak-phone' end
function GetInvokingResource() return 'test-integration' end
function GetConvar(name,def) return CONVARS[name] or def end
function GetConvarInt(name,def) return tonumber(CONVARS[name]) or def end
function GetResourceState(name) return (STARTED or {})[name] and 'started' or 'missing' end
function IsPlayerAceAllowed(src,permission) return false end
function GetHashKey(s) return #s end
function LoadResourceFile(_,name) local f=assert(io.open(ROOT..'/'..name,'r'));local s=f:read('*a');f:close();return s end
function GetPlayerName(src) return PLAYERS[tonumber(src)] and ('Player '..src) end
function GetPlayers() local t={};for src in pairs(PLAYERS or {}) do t[#t+1]=tostring(src) end;table.sort(t);return t end
local states={}
function Player(src) if not states[src] then local s={callChannel=0};function s:set(k,v)self[k]=v end;states[src]={state=s} end;return states[src] end
function GetPlayerRoutingBucket(src) return (BUCKETS or {})[src] or 0 end
local vec={};vec.__index=vec;vec.__sub=function(a,b)return setmetatable({x=a.x-b.x,y=a.y-b.y,z=a.z-b.z},vec)end;vec.__len=function(a)return math.sqrt(a.x*a.x+a.y*a.y+a.z*a.z)end
function vector3(x,y,z)return setmetatable({x=x,y=y,z=z},vec)end
vector4=function(x,y,z,w)local v=vector3(x,y,z);v.w=w;return v end
function GetPlayerPed(src) return PLAYERS[tonumber(src)] and tonumber(src) or 0 end
function GetEntityCoords(ped) return (COORDS or {})[ped] or vector3(0,0,0) end
function GetAllVehicles() return {} end
function GetEntityRoutingBucket() return 0 end
function PerformHttpRequest(...) error('Unexpected HTTP in unit fixture') end
promise={new=function()return {resolve=function(self,v)self.value=v end}end};Citizen={Await=function(p)return p.value end}
local RESOURCES={}
exports=setmetatable({}, {__index=function(_,name)return RESOURCES[name] or error('Unexpected export resource '..name)end,__call=function(_,name,fn)EXPORTED[name]=fn end})
function resource(name,obj) RESOURCES[name]=obj end
function loadrel(name) local s=LoadResourceFile('peak-phone',name);return assert(load(s,'@'..name,'t',_ENV))() end
function base(framework)
 STARTED={['peak-bridge']=true,oxmysql=true,ox_lib=true,['pma-voice']=true};PLAYERS={};MONEY={};INVENTORY={};MONEY_WRITES={}
 Config={};loadrel('config.lua');loadrel('sv_config.lua')
 resource('peak-bridge',{
 IsReady=function()return true end,GetFrameworkName=function()return framework end,GetPlayer=function(_,src)return PLAYERS[tonumber(src)]end,
 GetInventoryName=function()return framework=='esx' and 'esx_inventory' or 'ox_inventory'end,
 HasItem=function(_,src,item,n)return ((INVENTORY[src] or {})[item] or 0)>=n end,GetItemCount=function(_,src,item)return (INVENTORY[src] or {})[item] or 0 end,
 GetMoney=function(_,src,account)return MONEY[src] and MONEY[src][account] or 0 end,
 RemoveMoney=function(_,src,n,account,reason) MONEY_WRITES[#MONEY_WRITES+1]={src=src,n=-n};MONEY[src][account]=MONEY[src][account]-n;return true end,
 AddMoney=function(_,src,n,account,reason) MONEY_WRITES[#MONEY_WRITES+1]={src=src,n=n};MONEY[src][account]=MONEY[src][account]+n;return true end,
 AddItem=function()return true end,RemoveItem=function()return true end,RegisterUsableItem=function()end,
 GetFramework=function()return {Functions={HasPermission=function()return false end}}end,
 })
 resource('qbx_core',{GetPlayer=function(_,src)return PLAYERS[tonumber(src)]end})
 resource('pma-voice',{setPlayerCall=function(_,src,channel)Player(src).state.callChannel=channel end})
 resource('ox_inventory',{GetSlot=function(_,src,slot)return {name='phone',count=1,slot=slot,metadata={test=true}}end,Search=function(_,src,kind,item)return {{name=item,count=1,slot=3,metadata={device_id='DUO-REAL'}}}end})
 resource('peak-phone',setmetatable({}, {__index=function(_,key)return function(_,...)return assert(EXPORTED[key],key)(...)end end}))
 loadrel('shared/settings.lua');loadrel('shared/portable.lua');loadrel('bridge/server.lua');loadrel('server/owner_config.lua');Peak=PhonePeak
 PhoneDB={Ready=true,wait=function()end,one=function()return nil end,query=function()return {} end,update=function()return 1 end,insert=function()return 1 end,transaction=function()return true end}
 loadrel('bridge/services.lua')
 function addPlayer(src,cid)
   if framework=='esx' then PLAYERS[src]={identifier=cid,job={name='police',grade=2,grade_name='Officer'},getName=function()return 'Test Citizen'end,get=function(key)if key=='firstName'then return 'Test'elseif key=='lastName'then return 'Citizen'end end}
   else PLAYERS[src]={PlayerData={source=src,citizenid=cid,charinfo={firstname='Test',lastname='Citizen'},job={name='police',grade={level=2}},metadata={},items={}}} end
   MONEY[src]={bank=1000,cash=200};INVENTORY[src]={phone=1}
   Phone.Server.Profiles[cid]={citizenid=cid,phone_number='555000000'..src,charinfo={firstname='Test',lastname='Citizen'},metadata={},crypto={['testcoin']=100}}
 end
 function rpc(name,src,...)
   local callback=assert(Phone.Server.Callbacks[name],'Missing callback '..name);local called,result=0,nil
   callback(src,function(value)called=called+1;result=value end,...)
   assert(called==1,'Callback response count '..name..' '..called);return result
 end
 function event(name,src,...) source=src;return assert(EVENTS[name],'Missing event '..name)(...) end
end
