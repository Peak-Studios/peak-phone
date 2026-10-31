local C,M=PhoneDuoPropConfig,PhoneDuoMotion
local P={held=false,expanded=false,reduced=false,orientation='landscape',revision=0,ack=0,token=nil,visuals={},remote={},packet=-1,stopped=false,
    peekStartedAt=nil,peekDuration=0,peekSession=nil,peekRevision=-1}
local publish
Phone.DuoProp=P

-- Fixed-size DUI pool. A runtime texture belongs to one visible handset at a
-- time; recycling slots avoids leaking textures as players enter and leave.
local screenSlots={}
local function screenSend(slot,frame)
    if not slot or not slot.ready then return end
    SendDuiMessage(slot.dui,json.encode(frame and {type='frame',frame=frame} or {type='frame',clear=true}))
end
local function screenPose(slot,v)
    if not slot or not slot.ready or not v then return end
    SendDuiMessage(slot.dui,json.encode({type='pose',expanded=v.expanded==true,
        orientation=v.expanded and v.orientation=='portrait' and 'portrait' or 'landscape'}))
end
local function screenFold(slot,transition)
    if not slot or not slot.ready or not slot.documentReady or not transition then return end
    local elapsed=(GetGameTimer()-transition.startedAt)%4294967296
    if not transition.reduced and elapsed>=transition.duration then return end
    P.screenFoldSequence=(P.screenFoldSequence or 0)+1
    SendDuiMessage(slot.dui,json.encode({type='fold',sequence=P.screenFoldSequence,
        expanded=transition.expanded,reduced=transition.reduced,duration=transition.duration,
        fromPhase=transition.fromPhase,progress=transition.reduced and 1 or math.min(1,elapsed/math.max(1,transition.duration))}))
end
local function foldDuration(v,expanded,reduced,now)
    if reduced then return C.ReducedDuration end
    if M.sample then M.sample(v,now) end
    local phase=tonumber(v.phase)
    if not phase then return C.Duration end
    return math.max(1,C.Duration*math.abs((expanded and 1 or 0)-phase))
end
local function beginScreenFold(v,expanded,reduced,now,duration,fromPhase)
    local current=v.screenTransition
    if current and current.expanded==expanded and current.reduced==reduced then
        local elapsed=(now-current.startedAt)%4294967296
        if current.reduced or elapsed<current.duration then return current end
    end
    duration=duration or foldDuration(v,expanded,reduced,now)
    v.screenTransition={expanded=expanded,reduced=reduced,startedAt=now,duration=duration,fromPhase=fromPhase}
    screenFold(v.screenSlot,v.screenTransition)
    return v.screenTransition
end
local function screenRelease(v)
    local slot=v.screenSlot
    if not slot then return end
    for _,key in ipairs({'screenBody','screenLeaf'}) do if v[key] and DoesEntityExist(v[key]) then DeleteEntity(v[key]) end;v[key]=nil end
    v.screenSlot=nil;slot.owner=nil;slot.frame=nil;slot.rendered=false;screenSend(slot,nil)
end
local function screenAcquire(v)
    if v.screenSlot then return v.screenSlot end
    local slot
    for _,candidate in ipairs(screenSlots) do if not candidate.owner then slot=candidate;break end end
    if not slot and v.id=='self' then
        for _,candidate in ipairs(screenSlots) do
            if candidate.owner and candidate.owner.id~='self' then screenRelease(candidate.owner);slot=candidate;break end
        end
    end
    if not slot and #screenSlots<16 then
        local number=#screenSlots+1
        local dui=CreateDui(('https://cfx-nui-%s/web/public/duo/physical-screen.html?slot=%d&rev=phone-f05-calculator-safe-area-photos-notes-20261016c'):format(GetCurrentResourceName(),number),2048,1024)
        if not dui then return nil end
        slot={dui=dui,txd='peak_duo_screen_'..number,txn='live',owner=nil,ready=false,number=number}
        screenSlots[number]=slot
        CreateThread(function()
            local started=GetGameTimer()
            while not P.stopped and not IsDuiAvailable(dui) and (GetGameTimer()-started)%4294967296<10000 do Wait(50) end
            if P.stopped or not IsDuiAvailable(dui) then return end
            CreateRuntimeTextureFromDuiHandle(CreateRuntimeTxd(slot.txd),slot.txn,GetDuiHandle(dui))
            RequestStreamedTextureDict('peak_duo_live',false)
            while not P.stopped and not HasStreamedTextureDictLoaded('peak_duo_live') and (GetGameTimer()-started)%4294967296<15000 do Wait(50) end
            if P.stopped then return end
            AddReplaceTexture('peak_duo_live',('peak_duo_live_%02d'):format(slot.number),slot.txd,slot.txn)
            slot.ready=true
            if slot.owner then
                screenPose(slot,slot.owner)
                if slot.frame then screenSend(slot,slot.frame) end
                screenFold(slot,slot.owner.screenTransition)
            end
        end)
    end
    if not slot then return nil end
    slot.owner=v;v.screenSlot=slot;slot.frame=v.screenFrame
    screenPose(slot,v)
    if slot.frame then screenSend(slot,slot.frame) else screenSend(slot,nil) end
    screenFold(slot,v.screenTransition)
    return slot
end
local function screenUpdate(v,frame)
    v.screenFrame=frame
    local slot=v.screenSlot
    if slot and slot.frame~=frame then slot.frame=frame;screenSend(slot,frame) end
end

local function screenDraw(v,slot)
    if not slot.ready then return end
    -- IsDuiAvailable precedes the document's module/load events. Retry the latest
    -- frame so a late document listener or a reload can recover the image.
    if slot.frame and (GetGameTimer()-(slot.resentAt or 0))%4294967296>=1000 then
        slot.resentAt=GetGameTimer();screenSend(slot,slot.frame)
    end
    -- Native rounded emissive display meshes follow the authored glass. Each
    -- slot has an isolated material; replacing it cannot change another phone.
    for _,part in ipairs({'body','leaf'}) do
        local parent=v[part];local key=part=='body' and 'screenBody' or 'screenLeaf'
        local hash=GetHashKey(('peak_duo_screen_%s_%02d'):format(part,slot.number))
        if parent and DoesEntityExist(parent) and not v[key] then
            if not HasModelLoaded(hash) then RequestModel(hash)
            else
                local p=GetEntityCoords(parent)
                local entity=CreateObjectNoOffset(hash,p.x,p.y,p.z,false,false,false)
                if entity and entity~=0 then
                    SetEntityAsMissionEntity(entity,true,true);SetEntityCollision(entity,false,false)
                    SetEntityCompletelyDisableCollision(entity,true,false)
                    AttachEntityToEntity(entity,parent,-1,0.0,0.0,0.0,0.0,0.0,0.0,false,false,false,false,2,true)
                    v[key]=entity
                end
                SetModelAsNoLongerNeeded(hash)
            end
        end
    end
end
local function endpoint(expanded) return expanded and C.Expanded or C.Folded end
local function dispose(v)
    screenRelease(v)
    if Phone.DuoHand then Phone.DuoHand.stop(v,false) end
    v.cancelled=true
    for _,key in ipairs({'wristTarget','simCard','simTray','leaf','body'}) do
        if v[key] and DoesEntityExist(v[key]) then DeleteEntity(v[key]) end
        v[key]=nil
    end
end
local function remove(id)
    local v=P.visuals[id];if v then dispose(v);P.visuals[id]=nil end
end
local function attachLeaf(v)
    if not v.leaf or not DoesEntityExist(v.leaf) or not v.body or not DoesEntityExist(v.body) then return end
    -- No skeleton: -1 attaches to the drawable origin. Z is the calibrated hinge.
    AttachEntityToEntity(v.leaf,v.body,-1,C.Hinge[1],C.Hinge[2],C.Hinge[3],0.0,0.0,v.angle,false,false,false,false,2,true)
end
local function authoredPosePlaying(v)
    local drop=v.sex and ('peak_sharedrop_'..v.sex)
    if drop and HasAnimDictLoaded(drop) then
        for _,role in ipairs({'send','receive'}) do
            if IsEntityPlayingAnim(v.ped,drop,drop..'_'..role,3) then return true end
        end
    end
    if v.ped==PlayerPedId() and Phone.ShareDropActive then return true end
    if not v.handDictionary or not HasAnimDictLoaded(v.handDictionary) then return false end
    for _,clip in ipairs({v.profile and v.profile.HoldClip or '',v.handPrefix..'_fold',v.handPrefix..'_unfold'}) do
        if clip~='' and IsEntityPlayingAnim(v.ped,v.handDictionary,clip,3) then return true end
    end
    return false
end
local function attachmentMode(v)
    if v.fallback then return 'fallback' end
    -- The freemode profile was fitted against the GTA reading pose as well as
    -- the derived Duo clips. Keep that fit whenever either pose is playing.
    if authoredPosePlaying(v) or (HasAnimDictLoaded('cellphone@') and IsEntityPlayingAnim(v.ped,'cellphone@','cellphone_text_read_base',3)) then
        return 'authored'
    end
    return 'stock'
end
local function attachBody(v)
    local mode=attachmentMode(v)
    local profile=v.profile or (C.Profiles and C.Profiles[v.sex])
    local pos,rot,bone=profile and profile.Position or C.Position,profile and profile.Rotation or C.Rotation,C.Bone
    if mode=='stock' then pos=C.StockPosition;rot=C.StockRotation;bone=C.StockBone end
    if v.fallback then pos={0,0,0};rot={0,0,0};bone=28422 end
    if not v.fallback then pos=v.positionOverride or pos;rot=v.rotationOverride or rot end
    if not v.fallback then pos=M.portraitHandOffset(pos,v.orientationLift) end
    -- Spin the complete handset around its screen normal. The leaf remains
    -- hinge-local, so its fold sweep rotates with the chassis as one device.
    local turnAngle=tonumber(v.orientationAngle) or 0
    if math.abs(turnAngle)>.001 then
        rot=M.authoredEulerZXY(M.multiplyQuaternion(M.authoredQuaternion(rot),M.authoredQuaternion({0,turnAngle,0})))
    end
    if mode=='stock' or mode=='fallback' then
        -- Commit 8b8a9a8's attachment frame; retain the custom Duo drawable.
        AttachEntityToEntity(v.body,v.ped,GetPedBoneIndex(v.ped,bone),pos[1],pos[2],pos[3],rot[1],rot[2],rot[3],true,true,false,true,1,true)
    else
        local boneIndex=GetPedBoneIndex(v.ped,bone)
        local function attach(rotation,order)
            AttachEntityToEntity(v.body,v.ped,boneIndex,pos[1],pos[2],pos[3],rotation[1],rotation[2],rotation[3],false,false,false,true,order,true)
            ProcessEntityAttachments(v.body)
        end
        if not v.authoredRotationOrder then
            -- Measure the real bone attachment frame, then compare each native
            -- Euler convention to the Blender quaternion. No yields or extra
            -- entities: intermediate probes cannot be rendered between frames.
            attach({0,0,0},2)
            local frame={GetEntityQuaternion(v.body)}
            local target=M.multiplyQuaternion(frame,M.authoredQuaternion(rot))
            local bestOrder,bestScore=2,-1
            for _,order in ipairs({2,4,0,1,3,5}) do
                attach(rot,order)
                local score=M.quaternionAgreement(target,{GetEntityQuaternion(v.body)})
                if score>bestScore then bestOrder,bestScore=order,score end
                if score>.999999 then break end
            end
            v.authoredRotationOrder=bestOrder
            if C.Debug then
                print(('[Peak Duo grip] profile=%s order=%d error=%.4f degrees'):format(
                    v.sex or 'custom',bestOrder,math.deg(2*math.acos(bestScore))))
            end
        end
        attach(rot,v.authoredRotationOrder)
    end
    v.attachmentMode=mode
end
local function syncAttachment(v)
    if v.ready and v.body and DoesEntityExist(v.body) and v.attachmentMode~=attachmentMode(v) then attachBody(v) end
end
local function attachSeatedTray(v)
    if not v.simTray or not DoesEntityExist(v.simTray) or not v.body or not DoesEntityExist(v.body) then return end
    local p=C.Tray.Position
    AttachEntityToEntity(v.simTray,v.body,-1,p[1],p[2],p[3],0.0,0.0,0.0,false,false,false,false,2,true)
    if v.simCard and DoesEntityExist(v.simCard) then AttachEntityToEntity(v.simCard,v.simTray,-1,0.0,0.0,0.0,0.0,0.0,0.0,false,false,false,false,2,true) end
    -- An inserted tray/card is inside the housing. The SIM adapter owns the
    -- exposed props during insertion/removal; do not float a card on the glass.
    local visible=false
    SetEntityVisible(v.simTray,visible,false);if v.simCard then SetEntityVisible(v.simCard,visible and v.hasSim==true,false) end
end
local function load(name,v)
    local hash=GetHashKey(name)
    if not IsModelInCdimage(hash) or not IsModelValid(hash) then return nil end
    RequestModel(hash);local start=GetGameTimer()
    while not HasModelLoaded(hash) do
        if v.cancelled or P.stopped or (GetGameTimer()-start)%4294967296>=C.LoadTimeout then SetModelAsNoLongerNeeded(hash);return nil end
        RequestModel(hash)
        Wait(10)
    end
    if v.cancelled then SetModelAsNoLongerNeeded(hash);return nil end
    return hash
end
local function object(hash,ped)
    local p=GetEntityCoords(ped)
    local o=CreateObjectNoOffset(hash,p.x,p.y,p.z,false,false,false)
    if not o or o==0 then return nil end
    SetEntityAsMissionEntity(o,true,true);SetEntityCollision(o,false,false)
    SetEntityCompletelyDisableCollision(o,true,false);SetEntityCanBeDamaged(o,false)
    return o
end
local function assist(v,now)
    local hand=C.LeftHand
    if not v.assistRequestedAt then
        if not v.wristTarget then return false end
        v.wristRelease=v.wristRelease or now
        if (now-v.wristRelease)%4294967296<hand.BlendOut then return true end
        if DoesEntityExist(v.wristTarget) then DeleteEntity(v.wristTarget) end
        v.wristTarget=nil;v.wristRelease=nil;v.wristQuaternion=nil;v.wristAt=nil
        return false
    end
    if v.cancelled or v.fallback or not v.ready or not v.leaf
        or not DoesEntityExist(v.leaf) or not DoesEntityExist(v.ped) or IsEntityDead(v.ped) then
        v.assistRequestedAt=nil;v.assistStart=nil;return assist(v,now)
    end
    if (now-v.assistRequestedAt)%4294967296 >= v.assistDuration then
        -- SET_IK_TARGET lasts one update. Ceasing requests releases only our
        -- left-arm override using BlendOut; never clear the ped's other tasks.
        v.assistRequestedAt=nil;v.assistStart=nil;return assist(v,now)
    end
    -- Keep the stock phone hold animation in charge through the unsafe middle
    -- of the hinge sweep. Opening requests remain pending until the leaf is
    -- clear of the torso; closing requests release as soon as it leaves that
    -- safe near-open window. This makes both directions visible without ever
    -- dragging the wrist across the body.
    if math.abs(v.angle-C.Expanded)>(hand.EngageAngle or 24.0) then
        if v.assistOpening then return true end
        v.assistRequestedAt=nil;v.assistStart=nil;return assist(v,now)
    end
    if not v.assistStart then
        v.assistStart=now;v.wristProbe=nil;v.wristFallback=false
    end
    local p,w=hand.Contact,hand.WristOffset
    -- ARM_LEFT=3; hand-bone target=1. Do not use animation-tag ALLOW (16):
    -- the stock phone hold clip does not promise an arm-IK allow tag.
    -- Compute from the very same angle used by attachLeaf, avoiding a frame of
    -- stale child-entity transforms while the hinge attachment is updated.
    local a=math.rad(v.angle);local c,s=math.cos(a),math.sin(a)
    local q=GetOffsetFromEntityInWorldCoords(v.body,
        C.Hinge[1]+c*p[1]-s*p[2]+w[1],C.Hinge[2]+s*p[1]+c*p[2]+w[2],C.Hinge[3]+p[3]+w[3])
    SetPedCanArmIk(v.ped,true)
    v.wristRelease=nil
    local elbow=GetPedBoneCoords(v.ped,61163,0.0,0.0,0.0)
    local handPos=GetPedBoneCoords(v.ped,18905,0.0,0.0,0.0)
    local origin=GetOffsetFromEntityInWorldCoords(v.body,0.0,0.0,0.0)
    local up=GetOffsetFromEntityInWorldCoords(v.body,0.0,0.0,1.0)
    local rotation=M.wristQuaternion(q.x-elbow.x,q.y-elbow.y,q.z-elbow.z,up.x-origin.x,up.y-origin.y,up.z-origin.z)
    if not v.wristProbe then v.wristProbe={at=now,pos=handPos} end
    if not v.wristProbe.checked and (now-v.wristProbe.at)%4294967296>=220 then
        local initial=v.wristProbe.pos
        local moved=math.sqrt((handPos.x-initial.x)^2+(handPos.y-initial.y)^2+(handPos.z-initial.z)^2)
        local gap=math.sqrt((handPos.x-q.x)^2+(handPos.y-q.y)^2+(handPos.z-q.z)^2)
        v.wristProbe.checked=true
        if moved<.008 and gap>.08 then v.wristFallback=true end
        if C.Debug then print(('[Peak Duo wrist] moved=%.3fm gap=%.3fm mode=%s'):format(moved,gap,v.wristFallback and 'position-fallback' or 'oriented')) end
    end
    if C.Debug and not v.wristProbe.poseLogged and (now-v.wristProbe.at)%4294967296>=560 then
        v.wristProbe.poseLogged=true
        local fingerAxis=GetPedBoneCoords(v.ped,18905,.05,0.0,0.0)
        local ax,ay,az=handPos.x-elbow.x,handPos.y-elbow.y,handPos.z-elbow.z
        local bx,by,bz=fingerAxis.x-handPos.x,fingerAxis.y-handPos.y,fingerAxis.z-handPos.z
        local denom=math.sqrt((ax*ax+ay*ay+az*az)*(bx*bx+by*by+bz*bz))
        local bend=denom>.000001 and math.deg(math.acos(math.max(-1,math.min(1,(ax*bx+ay*by+az*bz)/denom)))) or -1
        print(('[Peak Duo wrist] bend=%.1fdeg mode=%s'):format(bend,v.wristFallback and 'position-fallback' or 'oriented'))
    end
    if rotation and not v.wristFallback then
        if not v.wristTarget or not DoesEntityExist(v.wristTarget) then
            v.wristTarget=object(GetEntityModel(v.body),v.ped)
            if v.wristTarget then SetEntityAlpha(v.wristTarget,0,false) else v.wristFallback=true end
        end
        if v.wristTarget then
            -- Transparent, not render-disabled. Keep the entity available to
            -- native IK; target root 0 follows the working entity-target API.
            local dt=v.wristAt and (now-v.wristAt)%4294967296 or 0
            v.wristQuaternion=M.blendQuaternion(v.wristQuaternion,rotation,1-math.exp(-dt/80))
            v.wristAt=now;local r=v.wristQuaternion
            SetEntityCoordsNoOffset(v.wristTarget,q.x,q.y,q.z,false,false,false)
            SetEntityQuaternion(v.wristTarget,r[1],r[2],r[3],r[4])
            SetIkTarget(v.ped,3,v.wristTarget,0,0.0,0.0,0.0,64,hand.BlendIn,hand.BlendOut)
        end
    end
    if not rotation or v.wristFallback then
        SetIkTarget(v.ped,3,0,-1,q.x,q.y,q.z,1,hand.BlendIn,hand.BlendOut)
    end
    return true
end
local function sampleOrientation(v,now)
    if not v.orientationStart then return false end
    local elapsed=(now-v.orientationStart)%4294967296
    local t=math.min(1,elapsed/math.max(1,v.orientationDuration or 1))
    v.orientationAngle,v.orientationLift=M.orientationPose(v.orientationFrom,v.orientationTarget,
        v.orientationLiftFrom or 0,v.orientationLiftTarget or 0,t)
    if t>=1 then
        v.orientationAngle=v.orientationTarget;v.orientationLift=v.orientationLiftTarget or 0
        v.orientationStart=nil
    end
    return v.orientationStart~=nil
end
local function animate()
    if P.animating then return end
    P.animating=true
    CreateThread(function()
        while not P.stopped do
            local active=false
            for _,v in pairs(P.visuals) do
                local now=GetGameTimer()
                if v.start then M.sample(v,now);attachLeaf(v);active=active or v.start~=nil end
                if v.orientationStart then
                    local turning=sampleOrientation(v,now)
                    if v.ready and v.body and DoesEntityExist(v.body) then attachBody(v) end
                    active=active or turning
                end
                if v.handDictionary then
                    if Phone.DuoHand.sample(v,now) then active=true;attachLeaf(v) end
                elseif not v.peeking and assist(v,now) then active=true end
            end
            if not active then break end
            Wait(0)
        end
        P.animating=false
    end)
end
local function orient(v,orientation,reduced)
    orientation=v.expanded and orientation=='portrait' and 'portrait' or 'landscape'
    local fromOrientation=v.orientation
    local now=GetGameTimer()
    if v.orientationStart then sampleOrientation(v,now) end
    local targetAngle=M.orientationTurn(orientation)
    v.orientation=orientation
    screenPose(v.screenSlot,v)
    if math.abs((v.orientationAngle or 0)-targetAngle)<.001 then
        v.orientationAngle=targetAngle;v.orientationLift=M.orientationLift(orientation);v.orientationStart=nil;return
    end
    v.orientationFrom=v.orientationAngle or 0
    v.orientationTarget=targetAngle
    v.orientationLiftFrom=v.orientationLift or M.orientationLift(fromOrientation)
    v.orientationLiftTarget=M.orientationLift(orientation)
    v.orientationDuration=reduced and C.ReducedDuration or (C.OrientationDuration or 620)
    if v.orientationDuration<=1 then
        v.orientationAngle=targetAngle;v.orientationLift=v.orientationLiftTarget;v.orientationStart=nil
        if v.ready and v.body and DoesEntityExist(v.body) then attachBody(v) end
        return
    end
    v.orientationStart=now;animate()
end
local function target(v,expanded,reduced)
    v.expanded,v.reduced=expanded,reduced
    local now=GetGameTimer()
    if M.sample then M.sample(v,now) end
    local fromPhase=tonumber(v.phase)
    M.retarget(v,endpoint(expanded),now,reduced and C.ReducedDuration or C.Duration)
    beginScreenFold(v,expanded,reduced,now,v.duration,fromPhase)
    if v.handDictionary then
        v.assistRequestedAt=nil;Phone.DuoHand.start(v)
    elseif C.LeftHand and C.LeftHand.Enabled and v.start and v.ready and not v.fallback and not reduced then
        v.assistRequestedAt=now;v.assistStart=nil;v.assistOpening=expanded
        v.assistDuration=v.duration+C.LeftHand.Settle
        v.wristProbe=nil;v.wristFallback=false
    else
        v.assistRequestedAt=nil;v.assistStart=nil
    end
    animate()
end
local function create(id,ped,expanded,reduced,generation,orientation,deviceGeneration)
    orientation=expanded and orientation=='portrait' and 'portrait' or 'landscape'
    local v={id=id,ped=ped,angle=endpoint(expanded),expanded=expanded,reduced=reduced,
        orientation=orientation,orientationAngle=M.orientationTurn(orientation),orientationLift=M.orientationLift(orientation),generation=generation,deviceGeneration=deviceGeneration}
    if id=='self' then v.screenFrame=P.localScreenFrame end
    if id~='self' and P.remoteFrames[id] and P.remoteFrames[id].generation==generation
        and P.remoteFrames[id].deviceGeneration==deviceGeneration and P.remoteFrames[id].orientation==orientation and P.remoteFrames[id].expanded==expanded then
        v.screenFrame=P.remoteFrames[id].frame
    end
    P.visuals[id]=v
    if Phone.DuoHand then Phone.DuoHand.prepare(v) end
    CreateThread(function()
        local body,leaf
        if C.Profiles and not v.profile then
            v.fallback=true;body=load(C.Fallback,v)
        elseif C.Enabled and GetResourceState(C.AssetResource)=='started' and GetResourceState(C.SimAssetResource)=='started' then
            body=load(C.Body,v);if body then leaf=load(C.Leaf,v) end
        end
        if body and not v.fallback and not leaf then SetModelAsNoLongerNeeded(body);body=nil end
        if not body then v.fallback=true;body=load(C.Fallback,v) end
        if v.cancelled or not DoesEntityExist(ped) or not body then
            if body then SetModelAsNoLongerNeeded(body) end
            if leaf then SetModelAsNoLongerNeeded(leaf) end
            if P.visuals[id]==v then remove(id) end
            return
        end
        v.body=object(body,ped);SetModelAsNoLongerNeeded(body)
        if v.body and leaf then v.leaf=object(leaf,ped) end
        if leaf then SetModelAsNoLongerNeeded(leaf) end
        if not v.body or (not v.fallback and not v.leaf) then
            -- Partial custom creation must not leave a half or retry every frame.
            for _,key in ipairs({'leaf','body'}) do if v[key] then DeleteEntity(v[key]);v[key]=nil end end
            local fallback=load(C.Fallback,v)
            if fallback and not v.cancelled and DoesEntityExist(ped) then v.fallback=true;v.body=object(fallback,ped) end
            if fallback then SetModelAsNoLongerNeeded(fallback) end
            if not v.body then if P.visuals[id]==v then remove(id) else dispose(v) end;return end
        end
        attachBody(v);M.sample(v,GetGameTimer());attachLeaf(v);v.ready=true
        if id=='self' and C.Debug then
            CreateThread(function()
                for _,delay in ipairs({3000,16000}) do
                    Wait(delay)
                    if P.visuals.self~=v or not v.ready or not DoesEntityExist(v.body) or not DoesEntityExist(v.ped) then return end
                    local hand=GetPedBoneCoords(v.ped,57005,0.0,0.0,0.0)
                    local leftHand=GetPedBoneCoords(v.ped,18905,0.0,0.0,0.0)
                    local body=GetEntityCoords(v.body)
                    local function gap(a,b) return math.floor(math.sqrt((a.x-b.x)^2+(a.y-b.y)^2+(a.z-b.z)^2)*1000+.5) end
                    local min,max=GetModelDimensions(GetEntityModel(v.body))
                    TriggerServerEvent('peak-phone:duoProp:diagnostic',P.token,{
                        fallback=v.fallback==true,profile=v.sex or 'none',mode=v.handMode or 'none',attachment=v.attachmentMode,
                        holdPlaying=v.handDictionary and v.handClip and IsEntityPlayingAnim(v.ped,v.handDictionary,v.handClip,3) or false,
                        animLoaded=v.handDictionary and HasAnimDictLoaded(v.handDictionary) or false,
                        stockLoaded=HasAnimDictLoaded('cellphone@'),
                        stockPlaying=IsEntityPlayingAnim(v.ped,'cellphone@','cellphone_text_read_base',3),
                        phoneOpen=IsPhoneOpen==true,clientReady=Phone.Client.Ready==true,
                        generationMatch=tonumber(v.generation)==tonumber(Phone.Client.Generation),
                        pedMatch=v.ped==PlayerPedId(),handPending=v.holdPending~=nil,
                        handDictionary=v.handDictionary or 'none',handClip=v.handClip or 'none',
                        handDiagnostic=Phone.DuoHand and type(Phone.DuoHand.diagnostic)=='function' and Phone.DuoHand.diagnostic(v) or {},
                        handGap=gap(hand,body),leftHandGap=gap(leftHand,body),
                        length=math.floor((max.z-min.z)*1000+.5),width=math.floor((max.x-min.x)*1000+.5)})
                end
            end)
        end
        if not v.fallback and C.Tray then
            local trayHash=load(C.Tray.Model,v);local cardHash=load(C.Tray.Card,v)
            if trayHash and cardHash and not v.cancelled then
                v.simTray=object(trayHash,ped);v.simCard=object(cardHash,ped);attachSeatedTray(v)
            end
            if trayHash then SetModelAsNoLongerNeeded(trayHash) end;if cardHash then SetModelAsNoLongerNeeded(cardHash) end
        end
        if not v.cancelled and P.held and Phone.DuoHand then Phone.DuoHand.hold(v) end
    end)
    return v
end
function P.getLocalVisual() local v=P.visuals.self;return v and v.ready and v or nil end
function P.setSimGesture(operation)
    local v=P.visuals.self;if not v or v.fallback then return false end
    if operation and (v.start or v.handMode=='transition') then return false end
    -- Release the prior secondary hold before the SIM task starts. Its watcher
    -- must not stop that task a frame later while cleaning up the old hold.
    if operation and Phone.DuoHand then Phone.DuoHand.stop(v,false) end
    v.simGesture=operation or nil;v.hasSim=P.hasSim==true;P.simOperation=operation or false;attachSeatedTray(v);publish();return true
end
function P.setHasSim(value) P.hasSim=value==true;local v=P.visuals.self;if v then v.hasSim=P.hasSim;attachSeatedTray(v) end end
function P.invalidateScreen()
    P.pendingScreen=nil;P.localScreenFrame=nil;P.remoteFrames={};P.pendingRemoteFrames={}
    for _,v in pairs(P.visuals) do v.screenFrame=nil;local slot=v.screenSlot;if slot then slot.frame=nil;screenSend(slot,nil) end end
end
publish=function()
    P.revision=P.revision+1;P.sentAt=GetGameTimer()
    local device=Phone.Client and Phone.Client.Device
    if P.token then TriggerServerEvent('peak-phone:duoProp:set',P.token,P.revision,P.effective==true,P.expanded,P.reduced,P.simOperation or false,P.hasSim==true,P.orientation,device and tonumber(device.Generation)) end
end
local function desired()
    local ped=PlayerPedId()
    local metadata=Phone.Client.Data and Phone.Client.Data.metadata or {}
    return (P.held or P.isPeekActive()) and Phone.Client.Ready and not metadata.isdead and not IsEntityDead(ped)
end
function P.isPeekActive(now)
    if not P.peekStartedAt then return false end
    now=now or GetGameTimer()
    if (now-P.peekStartedAt)%4294967296>=P.peekDuration then
        P.peekStartedAt=nil;P.peekDuration=0
        return false
    end
    return true
end
local function retargetPeekAngle(v,angle,duration)
    local now=GetGameTimer()
    M.sample(v,now)
    v.from,v.target,v.start,v.duration=v.angle,angle,now,math.max(1,tonumber(duration) or 1)
    v.fromPhase=nil;v.phase=nil;v.targetPhase=nil
    if math.abs(v.angle-angle)<.001 then v.angle=angle;v.start=nil end
    animate()
end
function P.refresh()
    local held=desired();local ped=PlayerPedId()
    if held~=P.effective then P.effective=held;publish() end
    local v=P.visuals.self
    if not held then P.localScreenFrame=nil;remove('self');return end
    if v and (v.ped~=ped or v.generation~=Phone.Client.Generation or v.cancelled
        or (v.ready and (not DoesEntityExist(v.body) or (v.leaf and not DoesEntityExist(v.leaf))))) then
        remove('self');v=nil
    end
    if not v then v=create('self',ped,P.expanded,P.reduced,Phone.Client.Generation,P.orientation,Phone.Client.Device and Phone.Client.Device.Generation);v.hasSim=P.hasSim==true end
    if v then
        local peeking=P.isPeekActive()
        local targetAngle=peeking and math.max(C.Expanded,math.min(C.Folded,tonumber(C.PeekAngle) or 156)) or endpoint(P.expanded)
        local wasPeeking=v.peeking==true
        v.peeking=peeking
        if peeking and (not wasPeeking or math.abs((v.target or v.angle)-targetAngle)>.001) then retargetPeekAngle(v,targetAngle,C.PeekDuration)
        elseif wasPeeking and not peeking then retargetPeekAngle(v,targetAngle,C.PeekDuration) end
        if v.orientation~=(P.expanded and P.orientation or 'landscape') then orient(v,P.orientation,P.reduced) end
        if P.held and Phone.DuoHand then Phone.DuoHand.ensureHold(v) end
        syncAttachment(v)
    end
end
function P.setHeld(held)
    P.held=held==true;P.refresh()
end
function P.setPeek(active,duration)
    active=active==true
    if active then
        P.peekStartedAt=GetGameTimer()
        P.peekDuration=math.max(1000,math.min(60000,tonumber(duration) or 6000))
    else
        P.peekStartedAt=nil;P.peekDuration=0
    end
    P.refresh()
end
RegisterNUICallback('Phone/PeekProp',function(data,cb)
    local session=type(data)=='table' and data.Session
    local revision=type(data)=='table' and tonumber(data.Revision)
    if type(data)~='table' or type(data.Active)~='boolean' or type(session)~='string' or #session<8 or #session>128
        or not revision or revision%1~=0 or revision<1 then cb({Success=false});return end
    if session~=P.peekSession then
        local incomingEpoch=tonumber(session:match('^(%d+)%-'))
        local currentEpoch=type(P.peekSession)=='string' and tonumber(P.peekSession:match('^(%d+)%-')) or nil
        if incomingEpoch and currentEpoch and incomingEpoch<currentEpoch then cb({Success=true,Stale=true});return end
        P.peekSession=session;P.peekRevision=-1
    end
    if revision<=P.peekRevision then cb({Success=true,Stale=true});return end
    P.peekRevision=revision
    if data.Active then
        local device=Phone.Client and Phone.Client.Device
        if IsPhoneOpen or not Phone.Client.Ready or (device and device.Locked) then P.setPeek(false);cb({Success=false});return end
        P.setPeek(true,data.LeaseMs)
    else P.setPeek(false) end
    cb({Success=true})
end)
function P.accept(expanded,reduced,orientation,session,revision)
    if type(expanded)~='boolean' or type(reduced)~='boolean'
        or (orientation~='landscape' and orientation~='portrait') then return end
    orientation=expanded and orientation=='portrait' and 'portrait' or 'landscape'
    if Phone.SimGesture and Phone.SimGesture.busy then P.pendingAccept={expanded,reduced,orientation,session,revision};return end
    P.session,P.uiRevision=session,revision
    local foldChanged=P.expanded~=expanded or P.reduced~=reduced
    local orientationChanged=P.orientation~=orientation
    if not foldChanged and not orientationChanged then return end
    P.expanded,P.reduced,P.orientation=expanded,reduced,orientation
    if P.visuals.self then
        if foldChanged then target(P.visuals.self,expanded,reduced) end
        if orientationChanged then orient(P.visuals.self,orientation,reduced) end
    end
    publish()
end
function P.flushPendingAccept()
    local pending=P.pendingAccept;P.pendingAccept=nil
    if pending then P.accept(table.unpack(pending)) end
end
function P.reset()
    P.held=false;P.effective=false;P.simOperation=false;P.orientation='landscape'
    P.peekStartedAt=nil;P.peekDuration=0;P.peekSession=nil;P.peekRevision=-1
    if P.token then TriggerServerEvent('peak-phone:duoProp:reset',P.token) end
    P.token=nil;P.remote={};P.remoteFrames={};P.localScreenFrame=nil;P.screenNetworkAt=0;P.packet=-1;P.session=nil;P.uiRevision=nil
    for id in pairs(P.visuals) do remove(id) end
end
RegisterNetEvent('peak-phone:duoProp:init',function(token)
    if source~=65535 or type(token)~='number' then return end
    if P.token and token<=P.token then return end
    if P.token then P.held=false;P.effective=false;remove('self') end
    P.token=token;P.packet=-1;P.remote={};P.remoteFrames={};P.pendingRemoteFrames={};P.localScreenFrame=nil;P.screenNetworkAt=0;P.screenSequence=0;P.pendingScreen=nil;P.revision=0;P.ack=0
    for id in pairs(P.visuals) do if id~='self' then remove(id) end end
    publish()
end)
RegisterNetEvent('peak-phone:duoProp:ack',function(token,revision)
    if source==65535 and token==P.token and type(revision)=='number' then P.ack=math.max(P.ack,revision) end
end)
RegisterNetEvent('peak-phone:duoProp:snapshot',function(token,packet,list)
    if source~=65535 or token~=P.token or type(packet)~='number' or packet<=P.packet or type(list)~='table' then return end
    P.packet=packet
    local nextState={}
    for i,s in ipairs(list) do
        if i>1024 then break end
        if type(s)=='table' and type(s.owner)=='number' and type(s.generation)=='number' and type(s.deviceGeneration)=='number' and type(s.revision)=='number' and type(s.ped)=='number' and type(s.expanded)=='boolean' and type(s.reduced)=='boolean' and type(s.hasSim)=='boolean'
            and (s.orientation=='landscape' or s.orientation=='portrait') and (s.expanded or s.orientation=='landscape')
            and (s.simOperation==false or s.simOperation=='insert' or s.simOperation=='remove') then
            local old=P.remote[s.owner]
            if old and s.generation==old.generation and s.revision<old.revision then s=old end
            if s.simOperation then s.localSimAt=old and old.simOperation==s.simOperation and old.simAt==s.simAt and old.localSimAt or GetGameTimer() end
            nextState[s.owner]=s
            local pending=P.pendingRemoteFrames and P.pendingRemoteFrames[s.owner]
            if pending then
                if pending.generation==s.generation and pending.deviceGeneration==s.deviceGeneration and pending.expanded==s.expanded and pending.orientation==s.orientation
                    and (GetGameTimer()-pending.at)%4294967296<5000 then P.remoteFrames[s.owner]=pending end
                P.pendingRemoteFrames[s.owner]=nil
            end
            local v=P.visuals[s.owner]
            if v and v.generation~=s.generation then remove(s.owner);v=nil end
            if v and v.deviceGeneration~=s.deviceGeneration then v.deviceGeneration=s.deviceGeneration;v.screenFrame=nil;screenUpdate(v,nil) end
            if v and (v.expanded~=s.expanded or v.reduced~=s.reduced) then target(v,s.expanded,s.reduced) end
            if v and v.orientation~=s.orientation then orient(v,s.orientation,s.reduced) end
            if v and (v.simGesture~=s.simOperation or v.hasSim~=s.hasSim) then v.simGesture=s.simOperation or nil;v.hasSim=s.hasSim;attachSeatedTray(v) end
            local frame=P.remoteFrames[s.owner]
            if v and frame and frame.generation==s.generation and frame.deviceGeneration==s.deviceGeneration and frame.expanded==s.expanded and frame.orientation==s.orientation then screenUpdate(v,frame.frame) end
        end
    end
    P.remote=nextState
    for id in pairs(P.remoteFrames or {}) do if not nextState[id] then P.remoteFrames[id]=nil end end
    for id in pairs(P.visuals) do if id~='self' and not nextState[id] then remove(id) end end
end)
P.remoteFrames={}
RegisterNUICallback('Phone/PhysicalScreenStatus',function(data,cb)
    local number=type(data)=='table' and tonumber(data.Slot)
    local slot=number and screenSlots[number]
    if not slot then return cb({Success=false}) end
    if data.State=='ready' then
        -- DUI availability precedes its message listener; replay the current
        -- frame and fold phase only after the document confirms it is ready.
        slot.documentReady=true;screenSend(slot,slot.frame);screenFold(slot,slot.owner and slot.owner.screenTransition)
    elseif data.State=='rendered' then slot.rendered=true
    elseif data.State=='error' then
        slot.rendered=false
        local reason=tostring(data.Error or 'Unknown display error'):sub(1,160)
        if reason~=slot.error then slot.error=reason;print('[Peak Duo display] '..reason) end
    end
    cb({Success=true})
end)
RegisterNUICallback('Phone/PhysicalScreenFold',function(data,cb)
    if type(data)~='table' or type(data.Expanded)~='boolean' or type(data.ReducedMotion)~='boolean'
        or not P.token or not P.effective or not IsPhoneOpen then cb({Success=false});return end
    local v=P.visuals.self
    if v then
        local now=GetGameTimer()
        if M.sample then M.sample(v,now) end
        local fromPhase=tonumber(v.phase)
        beginScreenFold(v,data.Expanded,data.ReducedMotion,now,foldDuration(v,data.Expanded,data.ReducedMotion,now),fromPhase)
    end
    cb({Success=true})
end)
local function sendPendingScreen()
    local entry=P.pendingScreen
    if not entry then return end
    if not P.token or not P.effective or not IsPhoneOpen then P.pendingScreen=nil;return end
    local device=Phone.Client and Phone.Client.Device
    if not device or tonumber(entry.deviceGeneration)~=tonumber(device.Generation) then P.invalidateScreen();return end
    local now=GetGameTimer()
    P.screenCredit=math.min(131072,(P.screenCredit or 131072)+((now-(P.screenCreditAt or now))%4294967296)*131.072)
    P.screenCreditAt=now
    if (now-(P.screenNetworkAt or 0))%4294967296<250 or P.screenCredit<#entry.frame+128 then return end
    P.screenCredit=P.screenCredit-#entry.frame-128;P.screenNetworkAt=now;P.pendingScreen=nil
    TriggerLatentServerEvent('peak-phone:duoScreen:frame',131072,P.token,entry.frame,entry.expanded,entry.sequence,entry.orientation,entry.deviceGeneration)
    P.screenSentCount=(P.screenSentCount or 0)+1
end
CreateThread(function() while not P.stopped do Wait(100);sendPendingScreen() end end)
RegisterNUICallback('Phone/PhysicalScreenFrame',function(data,cb)
    local frame=type(data)=='table' and data.Frame or nil
    local localFrame=type(data)=='table' and data.LocalFrame or nil
    local expanded,orientation,deviceGeneration
    if type(data)=='table' then expanded=data.Expanded;orientation=data.Orientation;deviceGeneration=data.DeviceGeneration end
    local device=Phone.Client and Phone.Client.Device
    local function valid(value,limit)
        return type(value)=='string' and #value>=100 and #value<=limit and
            value:match('^duo2:[A-Za-z0-9+/=]+$')~=nil
    end
    if not P.token or not P.effective or (not IsPhoneOpen and not P.isPeekActive()) or not valid(frame,65536) or not valid(localFrame,65536)
        or type(expanded)~='boolean' or (orientation~='landscape' and orientation~='portrait')
        or (not expanded and orientation~='landscape') or expanded~=P.expanded or orientation~=P.orientation
        or type(deviceGeneration)~='number' or deviceGeneration%1~=0 or deviceGeneration<1 or not device
        or tonumber(deviceGeneration)~=tonumber(device.Generation)
        then P.invalidateScreen();cb({Success=false});return end
    local v=P.visuals.self
    P.localScreenFrame=localFrame
    if v then screenUpdate(v,localFrame) end
    if not IsPhoneOpen then P.pendingScreen=nil;cb({Success=true,LocalOnly=true});return end
    P.screenSequence=(P.screenSequence or 0)+1
    P.pendingScreen={frame=frame,expanded=expanded,orientation=orientation,sequence=P.screenSequence,deviceGeneration=deviceGeneration}
    sendPendingScreen()
    cb({Success=true})
end)
RegisterNetEvent('peak-phone:duoScreen:frame',function(owner,generation,sequence,frame,expanded,orientation,deviceGeneration)
    -- Cfx's latent-event reassembler emits net:0 on clients, whereas ordinary
    -- server events use net:65535. Local TriggerEvent uses a nonnumeric source.
    if (source~=0 and source~=65535) or type(owner)~='number' or type(generation)~='number' or type(sequence)~='number'
        or owner%1~=0 or owner<0 or owner>65535 or generation%1~=0 or sequence%1~=0 or sequence<1
        or type(frame)~='string' or #frame<100 or #frame>65536 or not frame:match('^duo2:[A-Za-z0-9+/=]+$') or type(expanded)~='boolean'
        or (orientation~='landscape' and orientation~='portrait') or (not expanded and orientation~='landscape')
        or type(deviceGeneration)~='number' or deviceGeneration%1~=0 or deviceGeneration<1 then return end
    local state=P.remote[owner]
    local previous=P.remoteFrames[owner]
    if not state then
        P.pendingRemoteFrames=P.pendingRemoteFrames or {}
        local pending=P.pendingRemoteFrames[owner];local count=0
        for id,entry in pairs(P.pendingRemoteFrames) do
            if (GetGameTimer()-entry.at)%4294967296>=5000 then P.pendingRemoteFrames[id]=nil else count=count+1 end
        end
        if (pending or count<16) and (not pending or pending.generation~=generation or pending.deviceGeneration~=deviceGeneration or sequence>pending.sequence) then
            P.pendingRemoteFrames[owner]={generation=generation,deviceGeneration=deviceGeneration,sequence=sequence,frame=frame,expanded=expanded,orientation=orientation,at=GetGameTimer()}
        end
        return
    end
    if state.generation~=generation or state.deviceGeneration~=deviceGeneration or state.expanded~=expanded or state.orientation~=orientation or
        (previous and previous.generation==generation and previous.deviceGeneration==deviceGeneration and sequence<=previous.sequence) then return end
    P.remoteFrames[owner]={generation=generation,deviceGeneration=deviceGeneration,sequence=sequence,frame=frame,expanded=expanded,orientation=orientation}
    local v=P.visuals[owner]
    if v and v.generation==generation then screenUpdate(v,frame) end
end)
CreateThread(function()
    while not P.stopped do
        local active=false
        local own=PlayerPedId();local here=GetEntityCoords(own)
        local radius=math.max(0,math.min(20,tonumber(C.ScreenDistance) or 5))
        for id,v in pairs(P.visuals) do
            local visible=v.ready and not v.fallback and v.body and DoesEntityExist(v.body)
            if visible and id~='self' then
                local pos=GetEntityCoords(v.ped)
                local dx,dy,dz=here.x-pos.x,here.y-pos.y,here.z-pos.z
                visible=dx*dx+dy*dy+dz*dz<=radius*radius
            end
            if visible and v.screenFrame then
                local slot=screenAcquire(v)
                if slot and slot.ready then screenDraw(v,slot);active=true end
            else screenRelease(v) end
        end
        Wait(active and 0 or 100)
    end
end)
CreateThread(function()
    local nextHello=0
    while not P.stopped do
        local now=GetGameTimer()
        if P.debugActive and P.debugUntil and now>=P.debugUntil then
            P.held=P.debugPrior;P.debugActive=false;P.debugUntil=nil
            if P.visuals.self then target(P.visuals.self,P.expanded,P.reduced) end
        end
        if Phone.Client.Ready and not P.token and now>=nextHello then TriggerServerEvent('peak-phone:duoProp:hello');nextHello=now+2500 end
        P.refresh()
        if P.token and P.ack<P.revision and (now-(P.sentAt or 0))%4294967296>=500 then
            -- Retry only unacknowledged changes; no heartbeat traffic when idle.
            local device=Phone.Client and Phone.Client.Device
            P.sentAt=now;TriggerServerEvent('peak-phone:duoProp:set',P.token,P.revision,P.effective==true,P.expanded,P.reduced,P.simOperation or false,P.hasSim==true,P.orientation,device and tonumber(device.Generation))
        end
        local own=PlayerPedId();local here=GetEntityCoords(own)
        for id,s in pairs(P.remote) do
            local player=GetPlayerFromServerId(id);local ped=player~=-1 and GetPlayerPed(player) or 0
            local visible=ped~=0 and DoesEntityExist(ped) and not IsEntityDead(ped) and NetworkGetNetworkIdFromEntity(ped)==s.ped
            if visible then local pos=GetEntityCoords(ped);local dx,dy,dz=here.x-pos.x,here.y-pos.y,here.z-pos.z;visible=dx*dx+dy*dy+dz*dz<=C.Distance*C.Distance end
            local v=P.visuals[id]
            if v and (not visible or v.ped~=ped or (v.ready and (not DoesEntityExist(v.body) or (v.leaf and not DoesEntityExist(v.leaf))))) then remove(id);v=nil end
            if visible and not v then v=create(id,ped,s.expanded,s.reduced,s.generation,s.orientation,s.deviceGeneration);v.simGesture=s.simOperation or nil;v.hasSim=s.hasSim end
            if visible and v then syncAttachment(v) end
        end
        Wait(200)
    end
end)
AddEventHandler('Peak:Client:OnPlayerUnload',P.reset)
AddEventHandler('onClientResourceStop',function(name)
    if name==GetCurrentResourceName() then
        P.stopped=true;P.reset()
        for _,slot in ipairs(screenSlots) do RemoveReplaceTexture('peak_duo_live',('peak_duo_live_%02d'):format(slot.number));DestroyDui(slot.dui) end
    elseif name==C.AssetResource or name==C.SimAssetResource then for id in pairs(P.visuals) do remove(id) end end
end)
AddEventHandler('onClientResourceStart',function(name)
    if name==C.AssetResource or name==C.SimAssetResource then for id in pairs(P.visuals) do remove(id) end end
end)
RegisterNetEvent('peak-phone:duoProp:debugPermit',function()
    if source==65535 and C.Debug then P.debugUntil=GetGameTimer()+60000;print('[Peak Duo] Calibration permitted for 60 seconds. /duoprop_angle 0..180; /duoprop_offset x y z rx ry rz; /duoprop_done') end
end)
local function permitted() return C.Debug and P.debugUntil and GetGameTimer()<P.debugUntil end
RegisterCommand('duoprop_screen',function()
    if not C.Debug then return end
    local v=P.visuals.self;local slot=v and v.screenSlot
    print('[Peak Duo display] '..json.encode({held=P.held,visualReady=v and v.ready or false,
        frameBytes=v and v.screenFrame and #v.screenFrame or 0,
        slot=slot and slot.number or 0,textureReady=slot and slot.ready or false,
        documentReady=slot and slot.documentReady or false,rendered=slot and slot.rendered or false,
        bodyMesh=v and v.screenBody and DoesEntityExist(v.screenBody) or false,
        leafMesh=v and v.screenLeaf and DoesEntityExist(v.screenLeaf) or false,
        error=slot and slot.error or ''}))
end,false)
RegisterNetEvent('peak-phone:duoScreen:probe',function(nonce)
    if source~=65535 or not C.Debug or type(nonce)~='number' then return end
    local visuals={}
    for id,v in pairs(P.visuals) do
        local slot=v.screenSlot
        visuals[#visuals+1]={owner=id=='self' and -1 or id,generation=v.generation,ready=v.ready==true,
            frameBytes=v.screenFrame and #v.screenFrame or 0,slot=slot and slot.number or 0,
            texture=slot and slot.ready==true or false,document=slot and slot.documentReady==true or false,
            rendered=slot and slot.rendered==true or false,bodyMesh=v.screenBody and DoesEntityExist(v.screenBody) or false,
            leafMesh=v.screenLeaf and DoesEntityExist(v.screenLeaf) or false}
        if #visuals>=17 then break end
    end
    local remote=0;for _ in pairs(P.remoteFrames) do remote=remote+1 end
    TriggerServerEvent('peak-phone:duoScreen:probeResult',P.token,nonce,{sequence=P.screenSequence or 0,
        sent=P.screenSentCount or 0,remote=remote,held=P.effective==true,visuals=visuals,
        reassembly=GetConvar('sv_enableNetEventReassembly','unset')})
end)
RegisterCommand('duoprop_angle',function(_,args)
    if not permitted() then return end
    local angle=tonumber(args[1]);if not angle or angle~=angle or angle<0 or angle>180 then return end
    if not P.debugActive then P.debugPrior=P.held;P.debugActive=true end
    P.setHeld(true);local v=P.visuals.self
    if v then
        if Phone.DuoHand then Phone.DuoHand.stop(v,true) end
        M.retarget(v,angle,GetGameTimer(),C.Duration);animate()
    end
end,false)
RegisterCommand('duoprop_offset',function(_,args)
    if not permitted() then return end
    local values={}
    for i=1,6 do values[i]=tonumber(args[i]);if not values[i] or values[i]~=values[i] or math.abs(values[i])>(i<=3 and .3 or 360) then return end end
    local v=P.visuals.self
    -- Apply to the active attachment frame (authored or stock), not a dormant
    -- global/profile default, so the calibration command moves the visible prop.
    if v then
        v.positionOverride={values[1],values[2],values[3]}
        v.rotationOverride={values[4],values[5],values[6]}
    else
        C.Position={values[1],values[2],values[3]}
        C.Rotation={values[4],values[5],values[6]}
    end
    if v and v.ready then attachBody(v) end
    print('[Peak Duo] Candidate transform: '..table.concat(values,', '))
end,false)
RegisterCommand('duoprop_done',function()
    if not permitted() then return end
    P.debugUntil=nil
    if P.debugActive then P.debugActive=false;P.setHeld(P.debugPrior) end
    if P.visuals.self then target(P.visuals.self,P.expanded,P.reduced) end
end,false)
