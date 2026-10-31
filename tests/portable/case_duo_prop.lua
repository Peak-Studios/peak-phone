-- Exercise the actual prop phase mapping against the shipped 1.52s clip timing.
loadrel('shared/duo_prop.lua')
local config=PhoneDuoPropConfig
eq(config.StockBone,28422,'stock fallback uses GTA phone helper bone')
eq(config.StockPosition[1],0,'stock fallback keeps the original horizontal offset')
eq(config.StockPosition[2],0,'stock fallback keeps the original depth offset')
eq(config.StockPosition[3],0,'stock fallback keeps the original height offset')
eq(config.StockRotation[1],0,'stock fallback keeps the original roll')
eq(config.StockRotation[2],0,'stock fallback keeps the original pitch')
eq(config.StockRotation[3],0,'stock fallback presents the display to the player')
eq(config.Duration,1520,'fold animation duration')
eq(config.HandAnimation.Reach,320,'fold reach phase')
eq(config.HandAnimation.Hinge,880,'fold hinge phase')
eq(config.HandAnimation.Release,320,'fold release phase')
eq(config.HandAnimation.Reach+config.HandAnimation.Hinge+config.HandAnimation.Release,
    config.Duration,'hand phases must cover the animation')

local motion=PhoneDuoMotion
local hingeStart=config.HandAnimation.Reach/config.Duration
local hingeMid=(config.HandAnimation.Reach+config.HandAnimation.Hinge*.5)/config.Duration
local hingeEnd=(config.HandAnimation.Reach+config.HandAnimation.Hinge)/config.Duration
eq(motion.phaseAngle(0),180,'phone stays open during reach')
check(math.abs(motion.phaseAngle(hingeStart)-180)<.001,'hinge begins after reach')
check(math.abs(motion.phaseAngle(hingeMid)-90)<.001,'hinge midpoint remains half folded')
check(math.abs(motion.phaseAngle(hingeEnd))<.001,'phone finishes folding before release')
check(math.abs(motion.phaseAngle(1))<.001,'phone stays folded during release')

local state={angle=180}
motion.retarget(state,0,0,config.Duration)
motion.sample(state,320)
eq(state.angle,180,'reach phase preserves open angle')
motion.sample(state,760)
check(math.abs(state.angle-90)<.001,'hinge reaches midpoint at 760ms')
motion.sample(state,1200)
eq(state.angle,0,'hinge completes at 1200ms')
motion.sample(state,1520)
eq(state.angle,0,'fold transition completes at 1520ms')

eq(motion.orientationTurn('landscape'),0,'landscape handset pose is unturned')
eq(motion.orientationTurn('portrait'),-90,'portrait handset top stays upright')
eq(motion.orientationLift('landscape'),0,'landscape handset uses its calibrated grip height')
eq(motion.orientationLift('portrait'),.012,'portrait handset targets a 1.2cm hand-clearance lift')
local halfTurn,halfLift=motion.orientationPose(0,-90,0,.012,.5)
check(halfTurn<0 and halfTurn>-90,'portrait rotation eases through intermediate angles')
check(halfLift>0 and halfLift<.012,'portrait hand clearance eases without a position jump')
local reverseTurn,reverseLift=motion.orientationPose(halfTurn,0,halfLift,0,0)
eq(reverseTurn,halfTurn,'reversing rotation starts from the current angle')
eq(reverseLift,halfLift,'reversing rotation starts from the current hand clearance')
local endTurn,endLift=motion.orientationPose(0,-90,0,.012,1)
eq(endTurn,-90,'portrait rotation settles at its upright endpoint')
eq(endLift,.012,'portrait clearance settles at its raised endpoint')
local basePosition={.1,.02,-.04}
local landscapePosition=motion.portraitHandOffset(basePosition,motion.orientationLift('landscape'))
local portraitPosition=motion.portraitHandOffset(basePosition,motion.orientationLift('portrait'))
eq(landscapePosition[3],basePosition[3],'landscape grip keeps its authored height')
eq(portraitPosition[3],basePosition[3]+.012,'portrait grip lifts the handset clear of the palm')
eq(basePosition[3],-.04,'portrait lift does not mutate the shared hand profile')

-- Independent quaternions exported by Blender 5.2 from both fitted profiles.
local originalReferences={male={-0.6565619111061096,0.4041774868965149,-0.318098247051239,0.5517069101333618},
 female={-0.6719411015510559,0.4284941256046295,-0.26419591903686523,0.5432204604148865}}
local references={}
for sex,q in pairs(originalReferences) do
    references[sex]=q
end
for sex,q in pairs(references) do
    check(motion.quaternionAgreement(motion.authoredQuaternion(config.Profiles[sex].Rotation),q)>.99999999,
        sex..' attachment must reproduce the Blender matrix')
end

-- Execute attachment selection against a native adapter with differing Euler
-- conventions and a rotated bone frame. This catches world/local mixups too.
Phone={}
local nativeCalls=0
local boneFrame=motion.authoredQuaternion({18,37,-24})
local attached=boneFrame
function GetPedBoneIndex(_,bone)return bone end
function HasAnimDictLoaded()return true end
function IsEntityPlayingAnim()return true end
function DoesEntityExist()return true end
function ProcessEntityAttachments()end
function GetEntityQuaternion()return table.unpack(attached)end
function AttachEntityToEntity(body,ped,bone,px,py,pz,x,y,z,a,b,c,d,order)
    nativeCalls=nativeCalls+1
    local q=motion.authoredQuaternion({x,y,z})
    if order~=4 and (x~=0 or y~=0 or z~=0) then q=motion.authoredQuaternion({y,z,x}) end
    attached=motion.multiplyQuaternion(boneFrame,q)
end
local code=LoadResourceFile('peak-phone','client/cl_duo_prop.lua')
local prefix=code:sub(1,assert(code:find('local function attachSeatedTray',1,true))-1)
local attachBody=assert(load(prefix..' return attachBody'))()
local visual={body=10,ped=1,sex='male',profile=config.Profiles.male,handDictionary='test',handPrefix='test'}
attachBody(visual)
eq(visual.authoredRotationOrder,4,'select native convention matching Blender')
check(motion.quaternionAgreement(attached,motion.multiplyQuaternion(boneFrame,references.male))>.99999999)
local before=nativeCalls;attachBody(visual);eq(nativeCalls,before+1,'reuse calibration without per-frame search')
