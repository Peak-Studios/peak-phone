-- Optional custom hold loads asynchronously and never overrides stale actions.
base('qbcore')
loadrel('shared/duo_prop.lua')
local currentVisual
Phone={Client={Generation=7},DuoProp={getLocalVisual=function()return currentVisual end}}
local plays,stops,threads={}, {}, {}
local playing={}
local dictLoaded,dead=true,false
local stockDelay=0
local playerPed,timer=1,1000
function GetEntityModel(ped)return ped==1 and 101 or 202 end
function GetHashKey(name)return name=='mp_m_freemode_01' and 101 or 202 end
function PlayerPedId()return playerPed end
function DoesEntityExist(entity)return entity~=0 end
function IsEntityDead()return dead end
IsPhoneOpen=true
CallData=nil
function RequestAnimDict()end
function HasAnimDictLoaded(dict)return dict=='cellphone@' or dictLoaded end
function SetEntityAnimCurrentTime()end
function GetGameTimer()return timer end
function Wait(ms)timer=timer+ms end
function CreateThread(fn)threads[#threads+1]=fn end
function IsEntityPlayingAnim(_,dict,clip)
    if dict=='cellphone@' and stockDelay>0 then stockDelay=stockDelay-1;return false end
    return playing[clip]==true
end
function TaskPlayAnim(_,_,clip,_,_,duration,flag,_,_,_,_)
    plays[#plays+1]={clip=clip,duration=duration,flag=flag};playing[clip]=true
end
function StopAnimTask(_,_,clip)stops[#stops+1]=clip;playing[clip]=false end
AddEventHandler=function()end
loadrel('client/cl_duo_hand.lua')
local H=Phone.DuoHand
local v={ped=1,generation=7,ready=true,reduced=false,fallback=false}
H.prepare(v);currentVisual=v;eq(v.handPrefix,'peak_simfold_male')

local configuredHold=v.profile.HoldClip
eq(configuredHold,'peak_simfold_male_hold','male profile enables the compiled hold clip')
v.profile.HoldClip=nil
check(not H.hold(v),'no hold clip configured until its YCD asset is present')
eq(#plays,0,'missing optional hold does not issue a task for an absent clip')
H.stop(v,true)
eq(plays[#plays].clip,'cellphone_text_read_base','stock hold remains the fallback')
v.profile.HoldClip=configuredHold
playing={};dictLoaded=true
check(H.hold(v),'configured hold clip starts')
eq(plays[#plays].clip,'peak_simfold_male_hold')
eq(plays[#plays].duration,-1,'hold loops until the phone closes')
eq(plays[#plays].flag,49,'hold stays upper-body and looping')
eq(v.handMode,'hold')

v.expanded=true;v.phase=0.5;v.start=timer
H.start(v)
eq(stops[#stops],'peak_simfold_male_hold','fold transition replaces custom hold')
eq(plays[#plays].clip,'peak_simfold_male_unfold')
eq(v.handMode,'transition')
local transitionClip=v.handClip
check(not H.hold(v),'hold request is rejected during an active fold transition')
eq(v.handClip,transitionClip,'a late initial-open callback cannot stop the fold task')
v.start=nil;playing[v.handClip]=false
H.stop(v,true)
eq(plays[#plays].clip,'peak_simfold_male_hold','completed transition returns to configured hold')

-- On initial open the animation dictionary can still be loading. Keep the
-- stock pose, then switch to the authored hold once the request completes.
H.stop(v,false);playing={};dictLoaded=false
local threadStart=#threads
check(H.hold(v),'initial hold remains pending while its dictionary loads')
local loader=threads[threadStart+1]
eq(plays[#plays].clip,'cellphone_text_read_base','stock pose remains visible during load')
dictLoaded=true;loader()
eq(plays[#plays].clip,'peak_simfold_male_hold','initial-open retry starts the authored hold')

-- FiveM may report the stock phone task as absent for a frame immediately
-- after TaskPlayAnim; allow a short startup grace before treating it as an
-- interruption.
H.stop(v,false);playing={};dictLoaded=false;stockDelay=1;threadStart=#threads
check(H.hold(v),'brief stock-task startup delay still queues the authored hold')
loader=threads[threadStart+1];dictLoaded=true;loader()
eq(plays[#plays].clip,'peak_simfold_male_hold','brief task-start delay does not cancel the custom hold')

-- A generation change between request and load must never apply to the next character.
H.stop(v,false);playing={};dictLoaded=false
threadStart=#threads;check(H.hold(v),'generation case queues a hold load');loader=threads[threadStart+1]
Phone.Client.Generation=8;dictLoaded=true;local before=#plays;loader()
eq(#plays,before,'stale generation does not schedule another animation')
eq(v.handClip,nil,'stale generation clears the pending hold')
Phone.Client.Generation=7

-- Replacing the local ped invalidates the load before any task is issued.
dictLoaded=false;threadStart=#threads;check(H.hold(v),'entity case queues a hold load');loader=threads[threadStart+1]
playerPed=2;dictLoaded=true;before=#plays;loader()
eq(#plays,before,'changed player entity is ignored');playerPed=1

-- Death, phone close, and an active dial all invalidate the pending load.
for _,case in ipairs({'death','close','call'}) do
    dictLoaded=false;IsPhoneOpen=true;dead=false;CallData=nil
    threadStart=#threads;check(H.hold(v),case..' case queues a hold load');loader=threads[threadStart+1]
    if case=='death' then dead=true elseif case=='close' then IsPhoneOpen=false else CallData={Dialing=true} end
    dictLoaded=true;before=#plays;loader()
    eq(#plays,before,case..' does not schedule a custom hold')
end
dead=false;IsPhoneOpen=true;CallData=nil

-- A fold request cancels a pending open hold while the shared dictionary is
-- loading. After that fold settles, its custom hold resumes through a bounded
-- retry only while the stock phone pose still owns the task slot.
dictLoaded=false;threadStart=#threads;check(H.hold(v),'transition case queues a hold load');loader=threads[threadStart+1]
v.phase=0.5;v.expanded=true;v.start=timer;H.start(v);dictLoaded=true;before=#plays;loader()
eq(#plays,before,'transition supersedes the pending hold');eq(v.handClip,nil)
v.start=nil

dictLoaded=false;playing={};v.phase=0.5;v.expanded=false;v.start=timer;H.start(v)
check(v.holdAfterTransition==true,'unloaded fold records a post-transition hold')
v.start=nil;before=#threads;H.sample(v,timer)
check(#threads>before,'settled fold schedules the bounded custom hold loader')
loader=threads[#threads];dictLoaded=true;loader()
eq(plays[#plays].clip,'peak_simfold_male_hold','settled fold returns to the custom hold')

-- The authored hold can start when the dictionary arrives even if the stock
-- task was displaced; the phone is still open and owns the held prop.
H.stop(v,false);playing={};dictLoaded=false;threadStart=#threads
check(H.hold(v),'interruption case queues a custom hold load');loader=threads[threadStart+1]
playing['cellphone_text_read_base']=false;dictLoaded=true;before=#plays;loader()
eq(plays[#plays].clip,'peak_simfold_male_hold','late dictionary restores the authored grip')

-- The request is bounded and keeps the stock pose when the clip never arrives.
H.stop(v,false);dictLoaded=false;threadStart=#threads;check(H.hold(v),'timeout case queues a hold load');loader=threads[threadStart+1]
local timeoutStart=timer;loader()
check((timer-timeoutStart)>=PhoneDuoPropConfig.HandLoadTimeout,'missing dictionary retry ends at its timeout')
eq(v.handClip,nil,'missing dictionary never records a custom clip as playing')

IsPhoneOpen=false
H.stop(v,false)
eq(v.handClip,nil,'phone close clears the custom hold task')

-- The shipped prop must stay in a phone pose when a streamed dictionary is
-- unavailable or an idle task is displaced after the initial open.
IsPhoneOpen=true;dictLoaded=false;playing={};v.start=nil;v.holdRetryAt=nil
H.ensureHold(v)
check(v.holdPending~=nil,'unloaded custom dictionary starts a bounded request')
eq(plays[#plays].clip,'cellphone_text_read_base','stock pose covers dictionary loading')
playing['cellphone_text_read_base']=false
local playCount=#plays
H.ensureHold(v)
eq(#plays,playCount+1,'idle watchdog restores a displaced stock pose')
H.stop(v,false)
dictLoaded=true;playing={}
H.ensureHold(v)
eq(plays[#plays].clip,'peak_simfold_male_hold','loaded dictionary replaces stock pose')
timer=timer+350;dictLoaded=false;playing['peak_simfold_male_hold']=false
H.ensureHold(v)
eq(v.handClip,nil,'stale hold state is cleared after the clip disappears')
eq(plays[#plays].clip,'cellphone_text_read_base','stock pose resumes after custom clip disappears')
dictLoaded=true;v.holdRetryAt=nil
playing['peak_simfold_male_hold']=false;v.handClip=nil;v.handMode=nil
H.ensureHold(v)
eq(plays[#plays].clip,'peak_simfold_male_hold','idle watchdog restores an interrupted authored grip')
v.simGesture='insert';playing={};playCount=#plays
H.ensureHold(v)
eq(#plays,playCount,'SIM gesture owns the animation slot')

-- Camera takeover releases tracked phone holds and leaves other ped tasks alone.
v.simGesture=nil;v.profile.HoldClip=configuredHold;H.stop(v,false);playing={};dictLoaded=true
check(H.hold(v),'camera case starts the custom phone pose')
playing.unrelated_task=true;local cameraStopCount=#stops
check(H.suspendForCamera(v),'camera can suspend its own phone pose')
eq(#stops,cameraStopCount+1,'camera suspension releases only the tracked custom hold')
eq(stops[#stops],'peak_simfold_male_hold');check(playing.unrelated_task,'unrelated task survives custom hold cleanup')
eq(v.handClip,nil);eq(v.handMode,nil)

v.profile.HoldClip=nil;playing={};H.stop(v,true)
eq(plays[#plays].clip,'cellphone_text_read_base','camera fallback starts the owned stock phone hold')
eq(v.stockHoldClip,'cellphone_text_read_base')
playing.unrelated_task=true;cameraStopCount=#stops;check(H.suspendForCamera(v))
eq(#stops,cameraStopCount+1,'camera suspension also releases its tracked stock hold')
eq(stops[#stops],'cellphone_text_read_base');check(playing.unrelated_task,'unrelated task survives stock hold cleanup')
eq(v.stockHoldClip,nil)
