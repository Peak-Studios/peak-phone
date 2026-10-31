from pathlib import Path
import sys,json
root=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else Path.cwd()
sys.path.insert(0,str(root/'tests/portable'))
from lua_runner import run
preamble=r'''
Phone={Client={Ready=true,Generation=1,Data={metadata={}}}}
PhoneDuoPropConfig={}; PhoneDuoMotion={}
IsPhoneOpen=true; CallData=nil
function CreateThread(fn) end
function AddEventHandler(...) end
function RegisterNetEvent(...) end
function RegisterCommand(...) end
function PlayerPedId() return 1 end
function DoesEntityExist(...) return true end
function IsEntityDead(...) return false end
function IsPedRagdoll(...) return false end
function IsPedInAnyVehicle(...) return false end
function GetGameTimer() return 1000 end
function GetResourceState(...) return 'started' end
function GetCurrentResourceName() return 'peak-phone' end
PLAY_COUNT=0; HOLD_COUNT=0; PLAY_RESULT=false; PLAY_MUTATION=nil
Phone.DuoHand={hold=function(v) HOLD_COUNT=HOLD_COUNT+1;HOLD_VISUAL=v end}
exports={['peak-sim-assets']={Play=function(...)
 PLAY_COUNT=PLAY_COUNT+1
 if PLAY_MUTATION=='close' then IsPhoneOpen=false elseif PLAY_MUTATION=='call' then CallData={Dialing=true} end
 return PLAY_RESULT,PLAY_RESULT and 'complete' or 'cancelled'
end,Cancel=function(...) end}}
'''
lua=preamble+'\n'+(root/'client/cl_duo_prop.lua').read_text()+'\n'+(root/'client/cl_sim_gesture.lua').read_text()+r'''
local P,S=Phone.DuoProp,Phone.SimGesture
P.visuals.self={ready=true,body=2,fallback=false}
local ok,err=S.run('insert')
print('normal_insert_success='..tostring(ok)..'; error='..tostring(err)..'; animation_calls='..PLAY_COUNT)
assert(ok==false and PLAY_COUNT==1 and S.visual==nil,'Insert cancellation must play and clean up')
local ok2,err2=S.run('remove')
print('normal_remove_success='..tostring(ok2)..'; error='..tostring(err2)..'; animation_calls='..PLAY_COUNT)
assert(ok2==false and PLAY_COUNT==2 and S.visual==nil)
-- Cancellation must preserve the last server-confirmed state, regardless of
-- which animation was previewed.
S.visual=P.visuals.self;P.hasSim=false
local ok3,err3=S.run('insert')
print('seeded_visual_cancel_insert_success='..tostring(ok3)..'; hasSim='..tostring(P.hasSim)..'; animation_calls='..PLAY_COUNT)
assert(ok3==false and P.hasSim==false)
S.visual=P.visuals.self;P.hasSim=true
local ok4,err4=S.run('remove')
print('seeded_visual_cancel_remove_success='..tostring(ok4)..'; hasSim='..tostring(P.hasSim)..'; animation_calls='..PLAY_COUNT)
assert(ok4==false and P.hasSim==true)
-- Successful completion restores the optional phone hold after the SIM clip
-- releases the upper-body task slot. Cancellation and close/call races do not.
PLAY_RESULT=true;PLAY_MUTATION=nil;IsPhoneOpen=true;CallData=nil;local visual=P.visuals.self
local ok5=S.run('insert')
print('successful_sim_hold_restore='..tostring(ok5)..'; hold_calls='..HOLD_COUNT)
assert(ok5==true and HOLD_COUNT==1 and HOLD_VISUAL==visual,'successful SIM gesture restores the Duo phone hold')
PLAY_MUTATION='close';local holdsBefore=HOLD_COUNT;local ok6=S.run('remove')
print('close_during_sim_hold_restore='..tostring(ok6)..'; hold_calls='..HOLD_COUNT)
assert(ok6==false and HOLD_COUNT==holdsBefore,'phone close during SIM gesture must not restore the hold')
PLAY_MUTATION='call';IsPhoneOpen=true;CallData=nil;holdsBefore=HOLD_COUNT;local ok7=S.run('insert')
assert(ok7==false and HOLD_COUNT==holdsBefore,'active call after SIM animation must not restore the hold')
TEST_COUNT=7
'''
# Execute source in the Lua fixture without changing the repository.

run(lua,'sim_review_actual_client_sources',True)
