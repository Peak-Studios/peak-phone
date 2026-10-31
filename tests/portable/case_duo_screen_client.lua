-- The owner's display must retain a DUI when 16 remote screens are visible.
PhoneDuoPropConfig={}
PhoneDuoMotion={}
Phone={}
function GetCurrentResourceName() return 'peak-phone' end
local created=0
function CreateDui() created=created+1;return created end
function CreateThread() end
local code=LoadResourceFile('peak-phone','client/cl_duo_prop.lua')
local prefix=code:sub(1,assert(code:find('local function endpoint',1,true))-1)
local acquire,slots=assert(load(prefix..' return screenAcquire,screenSlots,screenFold'))()
local remote={}
for id=1,16 do
    remote[id]={id=id,screenFrame='image'}
    check(acquire(remote[id])~=nil,'remote slot '..id..' allocated')
end
eq(#slots,16,'DUI pool is bounded')
local owner={id='self',screenFrame='image'}
check(acquire(owner)~=nil,'owner reclaims a remote slot')
check(owner.screenSlot.owner==owner,'owner has a dedicated slot')
eq(#slots,16,'owner does not grow the DUI pool')
local evicted=0
for _,v in ipairs(remote) do if not v.screenSlot then evicted=evicted+1 end end
eq(evicted,1,'exactly one remote is displaced')

-- A stable first frame must survive a DUI whose document starts listening late.
local startupThreads,sent={},{}
function CreateThread(fn) startupThreads[#startupThreads+1]=fn end
function IsDuiAvailable()return true end
function CreateRuntimeTxd(name)return name end
function CreateRuntimeTextureFromDuiHandle()end
function GetDuiHandle(dui)return dui end
function RequestStreamedTextureDict()end
function HasStreamedTextureDictLoaded()return true end
function AddReplaceTexture()end
function SendDuiMessage(_,message)sent[#sent+1]=json.decode(message)end
local startAcquire,update,draw,sendFold=assert(load(prefix..' return screenAcquire,screenUpdate,screenDraw,screenFold'))()
local stable={id='self',screenFrame='unchanged-first-frame'}
local stableSlot=startAcquire(stable)
eq(#sent,0,'frame waits for runtime texture creation')
startupThreads[1]()
eq(sent[1].type,'pose','settled orientation is sent before display content')
eq(sent[1].orientation,'landscape','owner orientation reaches the DUI')
eq(sent[2].frame,'unchanged-first-frame','first frame sent when texture is ready')
update(stable,'unchanged-first-frame')
eq(#sent,2,'identical frame is not needlessly sent during capture')
CLOCK=CLOCK+1000;draw(stable,stableSlot)
eq(#sent,3,'stable frame retried after the late document attaches its listener')
eq(sent[3].frame,'unchanged-first-frame','retry preserves actual display content')
local transition={expanded=false,reduced=false,startedAt=CLOCK-380,duration=1520}
local previousCount=#sent;sendFold(stableSlot,transition)
eq(#sent,previousCount,'fold signal waits until the DUI document listener is ready')
stableSlot.documentReady=true;sendFold(stableSlot,transition)
eq(sent[#sent].type,'fold','late DUI startup replays the fold signal')
eq(sent[#sent].expanded,false,'fold signal carries the destination pose')
eq(sent[#sent].progress,.25,'late fold signal keeps hinge progress')
