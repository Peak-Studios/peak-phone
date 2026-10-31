"""Exercise the shipped SIM adapter's playback gate with a mocked game clock."""
from pathlib import Path
from lupa import LuaRuntime

source = (Path(__file__).resolve().parents[1] / 'extras/peak-sim-assets/client.lua').read_text()
prelude = r'''
PeakSimProfiles={male={trayHandAttachment={bone=1,position={0,0,0},rotation={0,0,0}}}}
exports={}; function exports.Register() end
setmetatable(exports,{__call=function(_,name,fn) exports[name]=fn end})
function CreateThread(_) end
function AddEventHandler(...) end
function GetGameTimer() return clock end
function Wait(ms) clock=clock+math.max(ms,100);if interruptAt and clock>=interruptAt then interrupt=true end end
function GetEntityModel(entity) return entity==1 and 10 or 20 end
function GetHashKey(name) if name=='mp_m_freemode_01' then return 10 end
  if name=='peak_duo_body' then return 20 end return 30 end
function PlayerPedId() return 1 end
function DoesEntityExist(_) return true end
function IsEntityDead(_) return false end
function IsPedRagdoll(_) return false end
function IsPedInAnyVehicle(...) return false end
function GetEntitySpeed(_) return 0 end
function GetResourceState(_) return 'started' end
function IsModelInCdimage(_) return true end
function IsModelValid(_) return true end
function RequestModel(_) end
function HasModelLoaded(_) return true end
function GetEntityCoords(_) return {x=0,y=0,z=0} end
function CreateObjectNoOffset(...) return 3 end
function SetEntityAsMissionEntity(...) end
function SetEntityCollision(...) end
function AttachEntityToEntity(entity,parent,_,x,y,z,...)
  if entity==3 then samples[#samples+1]={clock=clock,parent=parent,z=z} end
end
function GetPedBoneIndex(_,bone) return bone end
function RequestAnimDict(_) end
function HasAnimDictLoaded(_) return true end
function TaskPlayAnim(_,_,_,_,_,duration,flags,...)
  taskStarted=clock
  if duration~=-1 or flags~=50 then interrupt=true end
end
function IsEntityPlayingAnim(...) return taskStarted~=nil and clock-taskStarted<3100 and not interrupt end
function GetEntityAnimCurrentTime(_,_,_)
  if not taskStarted then return 0 end
  return math.max(0,math.min(1,(clock-taskStarted)/2800))
end
function StopAnimTask(...) end
function DeleteEntity(...) end
function SetModelAsNoLongerNeeded(_) end
function RemoveAnimDict(_) end
function GetCurrentResourceName() return 'peak-sim-assets' end
function GetConvarInt(...) return 1 end
'''

lua = LuaRuntime(unpack_returned_tuples=True)
lua.execute(prelude + source)
for interrupt_at, expected in [(None, True), (400, False)]:
    lua.globals().clock = 0
    lua.globals().taskStarted = None
    lua.globals().interrupt = False
    lua.globals().interruptAt = interrupt_at
    lua.execute('samples={}')
    result, reason = lua.globals().exports.Play(2, 'remove', False)
    assert result is expected, (interrupt_at, result, reason)
    if expected:
        samples = lua.globals().samples
        assert len(samples) >= 20
        assert any(sample['parent'] == 2 for sample in samples.values())
        assert any(sample['parent'] == 1 for sample in samples.values())
    assert lua.globals().exports.IsBusy() is False
print('SIM adapter playback gate: complete and interrupted cases OK')

prop = LuaRuntime(unpack_returned_tuples=True)
prop.execute(r'''
Phone={DuoHand={stop=function(v,restore) stopCount=stopCount+1;v.handMode=nil end}}
PhoneDuoPropConfig={};PhoneDuoMotion={};stopCount=0
function CreateThread(_) end
function AddEventHandler(...) end
function RegisterNUICallback(...) end
function RegisterNetEvent(...) end
function RegisterCommand(...) end
function GetGameTimer() return 0 end
function DoesEntityExist(_) return true end
'''+(Path(__file__).resolve().parents[1] / 'client/cl_duo_prop.lua').read_text()+r'''
local P=Phone.DuoProp
P.visuals.self={ready=true,body=2,fallback=false,handMode='hold'}
assert(P.setSimGesture('remove')==true and stopCount==1)
assert(P.visuals.self.simGesture=='remove' and P.visuals.self.handMode==nil)
assert(P.setSimGesture(nil)==true and stopCount==1)
P.visuals.self.start=true
assert(P.setSimGesture('insert')==false and stopCount==1)
''')
print('SIM gesture clears the competing hold and rejects an active fold')
