-- Separate configuration: existing PhoneConfig and server secrets are untouched.
PhoneDuoPropConfig = {
    Enabled = true, AssetResource = 'peak-duo-prop', SimAssetResource = 'peak-sim-assets',
    Body = 'peak_duo_body', Leaf = 'peak_duo_leaf', Fallback = 'prop_npc_phone_02',
    Bone = 57005, -- SKEL_R_Hand: stable palm frame, independent of prop helper tracks.
    -- The original working phone hold used PH_R_Hand with zero local rotation.
    -- Its transform and attachment flags are used when a custom clip is absent.
    StockBone = 28422, StockPosition = {0.0,0.0,0.0}, StockRotation = {0.0,0.0,0.0},
    -- Candidate hand calibration. Verify against male/female freemode and custom peds.
    Profiles = {
        male={Position={0.10461194068193436,0.009398740716278553,-0.04391052946448326},Rotation={-27.86067630375134,102.3350714285219,-94.18513261651178},TrayHandPosition={0.14776554703712463,0.08765113353729248,0.025007253512740135},TrayHandRotation={-65.77742646213412,115.74931707161683,83.08451110192112},FoldDictionary='peak_sim_fold_male',FoldPrefix='peak_simfold_male',HoldClip='peak_simfold_male_hold'},
        female={Position={0.10569895058870316,0.007950776256620884,-0.044760119169950485},Rotation={-30.239221380316582,108.22712728584423,-92.82694950005474},TrayHandPosition={0.12455159425735474,0.020956803113222122,0.037119023501873016},TrayHandRotation={66.53608972419329,-62.28500730553403,101.33048037520726},FoldDictionary='peak_sim_fold_female',FoldPrefix='peak_simfold_female',HoldClip='peak_simfold_female_hold'},
    },
    Position = {0.171893105, 0.026394643, -0.043291479}, Rotation = {-25.910961239, 68.665804179, -53.600155398},
    Hinge = {0.0391875, 0.0, 0.0}, Folded = 180.0, Expanded = 0.0,
    PeekAngle = 156.0, PeekDuration = 280,
    Duration = 1520, OrientationDuration = 620, ReducedDuration = 1, LoadTimeout = 2000, HandLoadTimeout = 15000,
    Tray={Model='peak_sim_tray',Card='peak_sim_card',Position={0.024,0,-0.048},Travel=0.022},
    HandAnimation = {Enabled = true, Reach = 320, Hinge = 880, Release = 320},
    -- Panel contact is leaf-local; wrist clearance is body-local, so closing
    -- the leaf cannot swing the wrist across the right-hand grip.
    LeftHand = {Enabled = true, Contact = {0.073, -0.003, 0.037},
        WristOffset = {0.065, -0.022, 0.035},
        -- The support hand engages in the safe near-open window in both
        -- directions. Driving IK through the middle of the hinge sweep can
        -- route the forearm through the torso.
        EngageAngle = 24.0, BlendIn = 190, BlendOut = 260, Settle = 140},
    Distance = 100.0, Debug = true,
    -- Only players within this distance receive the live physical display.
    ScreenDistance = 5.0,
}
PhoneDuoMotion = {}
local M = PhoneDuoMotion
-- Right-handed hand frame: local X follows the forearm, local Y points toward
-- the phone's top (thumb side on the reference rig). No animated wrist rotation
-- feeds back into this target. Returns nil for an invalid/zero-length reach.
function M.wristQuaternion(dx,dy,dz,ux,uy,uz)
    local n=math.sqrt(dx*dx+dy*dy+dz*dz)
    if n<.0001 then return nil end
    local x,y,z=dx/n,dy/n,dz/n
    local dot=x*ux+y*uy+z*uz
    local vx,vy,vz=ux-dot*x,uy-dot*y,uz-dot*z
    local vn=math.sqrt(vx*vx+vy*vy+vz*vz)
    if vn<.0001 then
        ux,uy,uz=0,1,0;if math.abs(y)>.9 then ux,uy=1,0 end
        dot=x*ux+y*uy+z*uz;vx,vy,vz=ux-dot*x,uy-dot*y,uz-dot*z
        vn=math.sqrt(vx*vx+vy*vy+vz*vz)
    end
    vx,vy,vz=vx/vn,vy/vn,vz/vn
    local wx,wy,wz=y*vz-z*vy,z*vx-x*vz,x*vy-y*vx
    local tr=x+vy+wz;local qx,qy,qz,qw
    if tr>0 then
        local s=math.sqrt(tr+1)*2;qw=.25*s;qx=(vz-wy)/s;qy=(wx-z)/s;qz=(y-vx)/s
    elseif x>vy and x>wz then
        local s=math.sqrt(1+x-vy-wz)*2;qw=(vz-wy)/s;qx=.25*s;qy=(vx+y)/s;qz=(wx+z)/s
    elseif vy>wz then
        local s=math.sqrt(1+vy-x-wz)*2;qw=(wx-z)/s;qx=(vx+y)/s;qy=.25*s;qz=(wy+vz)/s
    else
        local s=math.sqrt(1+wz-x-vy)*2;qw=(y-vx)/s;qx=(wx+z)/s;qy=(wy+vz)/s;qz=.25*s
    end
    return {qx,qy,qz,qw}
end
function M.blendQuaternion(a,b,t)
    if not a then return b end
    local sign=a[1]*b[1]+a[2]*b[2]+a[3]*b[3]+a[4]*b[4]<0 and -1 or 1
    local q,n={},0
    for i=1,4 do q[i]=a[i]+(b[i]*sign-a[i])*t;n=n+q[i]*q[i] end
    n=math.sqrt(n);for i=1,4 do q[i]=q[i]/n end
    return q
end
function M.ease(x)
    if x <= 0 then return 0 end
    if x >= 1 then return 1 end
    -- CSS cubic-bezier(.2,.72,.18,1): solve Bx(t)=elapsed, then evaluate By(t).
    local lo, hi = 0.0, 1.0
    for _ = 1, 24 do
        local t = (lo + hi) * 0.5
        local bx = 3*(1-t)*(1-t)*t*.2 + 3*(1-t)*t*t*.18 + t*t*t
        if bx < x then lo = t else hi = t end
    end
    local t = (lo + hi) * .5
    return 3*(1-t)*(1-t)*t*.72 + 3*(1-t)*t*t + t*t*t
end
function M.orientationTurn(orientation)
    return orientation=='portrait' and -90 or 0
end
function M.orientationLift(orientation)
    return orientation=='portrait' and .012 or 0
end
function M.portraitHandOffset(position,lift)
    return {position[1],position[2],position[3]+(tonumber(lift) or 0)}
end
function M.orientationPose(fromAngle,toAngle,fromLift,toLift,progress)
    local eased=M.ease(math.max(0,math.min(1,tonumber(progress) or 0)))
    return fromAngle+(toAngle-fromAngle)*eased,fromLift+(toLift-fromLift)*eased
end
function M.sample(s, now)
    if not s.start then return s.angle end
    local elapsed = (now - s.start) % 4294967296
    local t = math.min(1, elapsed / math.max(1, s.duration))
    if s.fromPhase then
        s.phase=s.fromPhase+(s.targetPhase-s.fromPhase)*t
        s.angle=M.phaseAngle(s.phase)
    else s.angle = s.from + (s.target - s.from)*M.ease(t) end
    if t >= 1 then s.angle = s.target; s.start = nil end
    return s.angle
end
function M.retarget(s, angle, now, duration)
    M.sample(s, now)
    s.from, s.target, s.start, s.duration = s.angle, angle, now, duration
    if angle==0 or angle==180 then
        s.phase=s.phase or (s.angle==0 and 1 or 0)
        s.fromPhase=s.phase;s.targetPhase=angle==0 and 1 or 0
        s.duration=math.max(1,duration*math.abs(s.targetPhase-s.phase))
        if duration<=1 then s.phase=s.targetPhase;s.angle=angle;s.start=nil end
    else s.fromPhase=nil;s.phase=nil end
    if (s.fromPhase and math.abs(s.phase-s.targetPhase)<.000001) or
        (not s.fromPhase and math.abs(s.angle-angle)<.001) then s.angle=angle; s.start=nil end
end
function M.phaseAngle(phase)
    local hand=PhoneDuoPropConfig.HandAnimation
    local x=math.max(0,math.min(1,(phase*PhoneDuoPropConfig.Duration-hand.Reach)/hand.Hinge))
    local eased=x*x*x*(x*(6*x-15)+10)
    return 180*(1-eased)
end

-- Blender to_euler('ZXY') uses fixed-axis rotations: Ry * Rx * Rz.
-- Keep the authored transform explicit instead of assuming GTA's Euler enum
-- has the same convention. Quaternions below use x,y,z,w component order.
function M.multiplyQuaternion(a,b)
    return {a[4]*b[1]+a[1]*b[4]+a[2]*b[3]-a[3]*b[2],
        a[4]*b[2]-a[1]*b[3]+a[2]*b[4]+a[3]*b[1],
        a[4]*b[3]+a[1]*b[2]-a[2]*b[1]+a[3]*b[4],
        a[4]*b[4]-a[1]*b[1]-a[2]*b[2]-a[3]*b[3]}
end
function M.authoredQuaternion(rotation)
    local x,y,z=math.rad(rotation[1])*.5,math.rad(rotation[2])*.5,math.rad(rotation[3])*.5
    return M.multiplyQuaternion(M.multiplyQuaternion({0,math.sin(y),0,math.cos(y)},
        {math.sin(x),0,0,math.cos(x)}),{0,0,math.sin(z),math.cos(z)})
end
function M.authoredEulerZXY(q)
    local x,y,z,w=q[1],q[2],q[3],q[4]
    local r11=1-2*(y*y+z*z);local r12=2*(x*y-z*w)
    local r13=2*(x*z+y*w);local r21=2*(x*y+z*w)
    local r22=1-2*(x*x+z*z);local r23=2*(y*z-x*w)
    local r33=1-2*(x*x+y*y)
    local ex=math.asin(math.max(-1,math.min(1,-r23)))
    local ey,ez
    if math.abs(math.cos(ex))>0.000001 then
        ey=math.atan(r13,r33);ez=math.atan(r21,r22)
    else
        local sx=ex>=0 and 1 or -1
        ey=math.atan(sx*r12,r11);ez=0
    end
    return {math.deg(ex),math.deg(ey),math.deg(ez)}
end
function M.quaternionAgreement(a,b)
    local dot,aa,bb=0,0,0
    for i=1,4 do dot=dot+a[i]*b[i];aa=aa+a[i]*a[i];bb=bb+b[i]*b[i] end
    if aa<.000001 or bb<.000001 then return 0 end
    return math.min(1,math.abs(dot)/math.sqrt(aa*bb))
end
