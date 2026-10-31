base('qbcore');loadrel('config.lua');loadrel('sv_config.lua')
addPlayer(1,'SENDER');addPlayer(2,'RECEIVER');addPlayer(3,'THIRD');addPlayer(4,'OTHER')
local written=0;local quota=0;local deleted=false;local fail=false;local afterRead;local afterInsert;local afterDeviceLookup;local afterSameCharacter
local phoneCheckHook
Wait=function(ms)CLOCK=(CLOCK+ms)%4294967296;if ON_WAIT then ON_WAIT() end end
local realHasPhone=Phone.hasPhone
Phone.hasPhone=function(src)
    local result=realHasPhone(src)
    if phoneCheckHook then
        local hook=phoneCheckHook
        if hook(src) then phoneCheckHook=nil end
    end
    return result
end
PhoneDB.one=function(sql,args)
    if afterRead then local fn=afterRead;afterRead=nil;fn() end
    if sql:find('COUNT',1,true) then return {n=quota} end
    if args[1]==10 and args[2]=='SENDER' and not deleted then return {id=10,photo_url='https://i.imgur.com/fixture.jpg'} end
end
PhoneDB.insert=function(sql,args)
    if fail then return nil end
    written=written+1;eq(args[1],'RECEIVER')
    if afterInsert then local fn=afterInsert;afterInsert=nil;fn() end
    return written
end
local realSameCharacter=Phone.sameCharacter
Phone.sameCharacter=function(src,cid)
    local same=realSameCharacter(src,cid)
    if afterSameCharacter then local fn=afterSameCharacter;afterSameCharacter=nil;fn(src,cid,same) end
    return same
end
loadrel('server/sv_sharedrop.lua')
local function call(route,src,data)return rpc('peak-phone:sharedrop:'..route,src,data)end
local function on(src,value)check(call('Enabled',src,{Enabled=value}).Success)end
local requestSerial=0
local function request()
    requestSerial=requestSerial+1
    local requestToken='fixture-request-'..requestSerial
    return call('Request',1,{PhotoId=10,TargetSource=2,RequestToken=requestToken}),requestToken
end
local function phase()return EMITTED[#EMITTED].args[1].Phase end
local function receiverOfferedSince(start)
    for i=start+1,#EMITTED do
        local e=EMITTED[i];local data=e.args[1]
        if e.src==2 and e.name=='peak-phone:sharedrop:phase' and data and data.Phase=='offer' then return true end
    end
    return false
end
local function receiverSawPhotoSince(start)
    for i=start+1,#EMITTED do
        local e=EMITTED[i];local data=e.args[1]
        if e.src==2 and e.name=='peak-phone:sharedrop:phase' and data
            and data.PhotoUrl=='https://i.imgur.com/fixture.jpg' then return true end
    end
    return false
end
local function bothDone(id)
    event('peak-phone:sharedrop:done',1,id)
    event('peak-phone:sharedrop:done',2,id)
    THREADS[#THREADS]()
end
local function afterClip(id,elapsed)
    CLOCK=(CLOCK+(elapsed or 4000))%4294967296
    bothDone(id)
end
on(1,true)
check(not request().Success,'Receiver must opt in')
on(2,true)
eq(#call('Nearby',1).Players,1)
BUCKETS={[2]=2};check(not request().Success);eq(#call('Nearby',1).Players,0);BUCKETS={}
COORDS={[2]=vector3(6,0,0)};check(not request().Success);COORDS={}
check(not call('Request',2,{PhotoId=10,TargetSource=1,RequestToken='fixture-wrong-owner'}).Success,'Photo must belong to sender')
-- Recipient consent cannot be forged by a third party or the sender.
local r,requestToken=request();check(r.Success);eq(phase(),'offer');eq(written,0)
local senderOffer,receiverOffer
for i=#EMITTED-1,#EMITTED do
    local emitted=EMITTED[i]
    if emitted.name=='peak-phone:sharedrop:phase' and emitted.args[1].Id==r.Id then
        if emitted.src==1 then senderOffer=emitted.args[1] elseif emitted.src==2 then receiverOffer=emitted.args[1] end
    end
end
eq(senderOffer.RequestToken,requestToken,'Sender offer is tied to its initiating request token')
eq(receiverOffer.RequestToken,nil,'Receiver does not receive the sender UI request token')
check(not call('Respond',1,{Id=r.Id,Accept=true}).Success)
check(not call('Respond',3,{Id=r.Id,Accept=true}).Success)
check(call('Respond',2,{Id=r.Id,Accept=false}).Success);eq(phase(),'cancelled');eq(written,0)
local realTime=os.time;local seconds=100000;os.time=function()return seconds end
seconds=realTime()+30

-- The sender can change identity during the recipient's final Phone.hasPhone
-- lookup. Do not register or expose the photo, and leave both sources free.
local senderSwapChecks=0;local senderSwapEvents=#EMITTED
phoneCheckHook=function(src)
    if src==2 then
        senderSwapChecks=senderSwapChecks+1
        if senderSwapChecks==2 then PLAYERS[1].PlayerData.citizenid='OTHER';return true end
    end
end
local senderSwap=request()
eq(senderSwap.Success,false,'Sender character switch during final recipient inventory authorization rejects Request')
eq(senderSwapChecks,2,'Sender race is injected during the post-photo recipient lookup')
check(not receiverOfferedSince(senderSwapEvents),'Stale sender photo is never offered to the receiver')
check(not receiverSawPhotoSince(senderSwapEvents),'Stale sender photo URL is never emitted after the sender identity changes')
PLAYERS[1].PlayerData.citizenid='SENDER';on(1,true)
eq(#call('Nearby',1).Players,1,'Rejected sender race leaves both phones unoccupied')

-- Capture the recipient identity before authorization too. Even if a new
-- recipient opts in during its lookup, the old sender request cannot follow it.
seconds=seconds+30
local receiverSwapChecks=0;local receiverSwapEvents=#EMITTED
phoneCheckHook=function(src)
    if src==2 then
        receiverSwapChecks=receiverSwapChecks+1
        if receiverSwapChecks==2 then
            phoneCheckHook=nil
            PLAYERS[2].PlayerData.citizenid='OTHER'
            on(2,true)
            return true
        end
    end
end
local receiverSwap=request()
eq(receiverSwap.Success,false,'Recipient character switch during final authorization rejects Request')
eq(receiverSwapChecks,2,'Recipient race is injected during the post-photo recipient lookup')
check(not receiverOfferedSince(receiverSwapEvents),'A request cannot silently follow a replacement recipient character')
check(not receiverSawPhotoSince(receiverSwapEvents),'A replacement recipient cannot receive the captured sender photo URL')
PLAYERS[2].PlayerData.citizenid='RECEIVER';on(2,true)
eq(#call('Nearby',1).Players,1,'Rejected recipient race leaves both phones unoccupied')

local function offerAndAccept()
    seconds=seconds+30;local r=request();check(r.Success)
    check(call('Respond',2,{Id=r.Id,Accept=true}).Success);eq(phase(),'approach')
    return r.Id
end
local function begin()
    local id=offerAndAccept()
    local clock=CLOCK%4294967296
    event('peak-phone:sharedrop:ready',1,id,clock);eq(phase(),'approach')
    event('peak-phone:sharedrop:ready',1,id,clock);eq(phase(),'approach','Duplicate readiness cannot advance the same peer twice')
    event('peak-phone:sharedrop:ready',2,id,clock);eq(phase(),'animation')
    local animation=EMITTED[#EMITTED].args[1].Data
    eq(animation.Start,(clock+800)%4294967296,'Shared start keeps a future scheduling window')
    eq(animation.Duration,3200,'Server duration matches the authored one-shot clip')
    event('peak-phone:sharedrop:ready',1,id,clock);eq(phase(),'animation','Late readiness replay cannot reschedule an active animation')
    return id
end
local id=begin()
event('peak-phone:sharedrop:done',3,id);eq(written,0)
CLOCK=CLOCK+100;event('peak-phone:sharedrop:done',1,id);eq(phase(),'animation','One early peer ACK cannot commit or end the session');eq(written,0)
event('peak-phone:sharedrop:cancel',1,id);eq(phase(),'cancelled','Explicit cancel still stops a pending one-peer completion')
id=begin();CLOCK=(CLOCK+3999)%4294967296
event('peak-phone:sharedrop:done',1,id);event('peak-phone:sharedrop:done',1,id);eq(written,0,'Duplicate completion from one peer is counted once')
event('peak-phone:sharedrop:done',2,id);eq(written,0,'Server waits for the scheduled lead plus the full clip')
THREADS[#THREADS]();eq(written,1);eq(phase(),'complete')
event('peak-phone:sharedrop:done',2,id);eq(written,1,'Replay cannot duplicate a photo')
id=begin();quota=PhoneConfig.Media.MaxPhotos;afterClip(id)
eq(phase(),'failed');eq(written,1);quota=0
id=begin();deleted=true;afterClip(id)
eq(phase(),'failed');eq(written,1);deleted=false
id=begin();COORDS={[2]=vector3(3,0,0)};CLOCK=(CLOCK+4000)%4294967296
event('peak-phone:sharedrop:done',1,id);eq(phase(),'cancelled');eq(written,1);COORDS={}
id=begin();PLAYERS[2].PlayerData.citizenid='OTHER';CLOCK=(CLOCK+4000)%4294967296
event('peak-phone:sharedrop:done',1,id);eq(phase(),'cancelled');eq(written,1);PLAYERS[2].PlayerData.citizenid='RECEIVER'
on(2,true);id=begin();on(2,false);eq(phase(),'cancelled');eq(written,1);on(2,true)
id=begin();event('playerDropped',2);eq(phase(),'cancelled');eq(written,1);eq(#call('Nearby',1).Players,0);on(2,true)
-- Database failures fail closed and leave both players available for another request.
id=begin();fail=true;afterClip(id)
eq(phase(),'failed');eq(written,1);fail=false
-- Recheck occupancy after a yielding ownership read.
seconds=seconds+30;afterRead=function()on(2,false)end
check(not request().Success);eq(written,1)
-- Framework/device reads can yield and clear the engine source. Phase handlers
-- retain the captured player ID rather than re-reading that global afterwards.
on(2,true)
local deviceReadCount=0
Phone.Devices={active=function(src)
    source=0;deviceReadCount=deviceReadCount+1
    if afterDeviceLookup then
        local fn=afterDeviceLookup
        if fn(src,deviceReadCount) then afterDeviceLookup=nil end
    end
    return {Status='active',Locked=false}
end}
id=begin();afterClip(id)
eq(phase(),'complete');eq(written,2,'Source survives yielding device authorization')

-- Cancellation during the yielding authorization cannot emit a later phase.
seconds=seconds+30;local cancelledRequest=request();check(cancelledRequest.Success)
local respondEvents=#EMITTED;deviceReadCount=0
afterDeviceLookup=function(src)
    if src==2 then event('peak-phone:sharedrop:cancel',2,cancelledRequest.Id);return true end
end
check(call('Respond',2,{Id=cancelledRequest.Id,Accept=true}).Success)
eq(phase(),'cancelled','Cancel during final consent authorization removes the request')
local emittedApproach=false
for i=respondEvents+1,#EMITTED do
    local e=EMITTED[i];local data=e.args[1]
    if e.name=='peak-phone:sharedrop:phase' and data and data.Id==cancelledRequest.Id and data.Phase=='approach' then emittedApproach=true end
end
check(not emittedApproach,'A removed consent request cannot emit approach after device authorization yields')

-- A ready participant cannot advance to animation if the other player cancels
-- while its last device authorization lookup is yielding.
seconds=seconds+30;local cancelledReady=request();check(cancelledReady.Success)
check(call('Respond',2,{Id=cancelledReady.Id,Accept=true}).Success)
deviceReadCount=0;event('peak-phone:sharedrop:ready',2,cancelledReady.Id,CLOCK)
local readyEvents=#EMITTED;deviceReadCount=0
afterDeviceLookup=function(src)
    if src==2 then event('peak-phone:sharedrop:cancel',2,cancelledReady.Id);return true end
end
event('peak-phone:sharedrop:ready',1,cancelledReady.Id,CLOCK)
eq(phase(),'cancelled','Cancellation during ready authorization removes the approach session')
local emittedAnimation=false
for i=readyEvents+1,#EMITTED do
    local e=EMITTED[i];local data=e.args[1]
    if e.name=='peak-phone:sharedrop:phase' and data and data.Id==cancelledReady.Id and data.Phase=='animation' then emittedAnimation=true end
end
check(not emittedAnimation,'A removed ready session cannot emit animation after device authorization yields')

-- The final device authorization can yield. A disconnect that removes the
-- session during that lookup must be seen by the non-yielding pre-insert guard.
id=begin();CLOCK=(CLOCK+4000)%4294967296
event('peak-phone:sharedrop:done',1,id);event('peak-phone:sharedrop:done',2,id)
local finalSave=THREADS[#THREADS];deviceReadCount=0
local beforeFinalRace=written
afterDeviceLookup=function(src,count)
    if src==2 and count==6 then event('playerDropped',2);return true end
end
finalSave()
eq(phase(),'cancelled','Disconnect during the last unlocked lookup removes the saving session')
eq(written,beforeFinalRace,'Session removed during final device authorization cannot insert a Gallery row')
on(2,true)

-- A removal inside the final raw identity check is caught by the last session
-- membership guard; the old full projected actor could yield here after its
-- initial membership check.
id=begin();CLOCK=(CLOCK+4000)%4294967296
event('peak-phone:sharedrop:done',1,id);event('peak-phone:sharedrop:done',2,id)
local sameCharacterSave=THREADS[#THREADS];deviceReadCount=0
local beforeIdentityRace=written;local identityRaceFired=false
afterDeviceLookup=function(src,count)
    if src==2 and count==6 then
        afterSameCharacter=function()
            identityRaceFired=true
            event('playerDropped',2)
        end
        return true
    end
end
sameCharacterSave()
check(identityRaceFired,'Final raw identity race fixture reaches the ShareDrop identity guard')
eq(phase(),'cancelled','Disconnect during the final raw identity check invalidates saving')
eq(written,beforeIdentityRace,'Session removed during the final identity check cannot insert a Gallery row')
on(2,true)

-- ShareDrop identity validation stays on the minimal raw-player path rather
-- than constructing the full profile/device projection.
local fullProjection=Peak.Functions.GetPlayer;local projectionReads=0
Peak.Functions.GetPlayer=function(src) projectionReads=projectionReads+1;return fullProjection(src) end
id=begin();CLOCK=(CLOCK+4000)%4294967296
event('peak-phone:sharedrop:done',1,id);event('peak-phone:sharedrop:done',2,id)
local rawIdentitySave=THREADS[#THREADS];deviceReadCount=0
local projectionsBefore=projectionReads
rawIdentitySave()
eq(phase(),'complete','Raw identity checks still permit a valid transfer')
eq(projectionReads,projectionsBefore,'ShareDrop liveness does not yield through a full player projection')
Peak.Functions.GetPlayer=fullProjection

-- If either player cancels while both ACKs wait for the server's minimum, no write occurs.
id=begin();event('peak-phone:sharedrop:done',1,id);event('peak-phone:sharedrop:done',2,id)
local pending=THREADS[#THREADS];event('peak-phone:sharedrop:cancel',2,id);pending()
eq(phase(),'cancelled');eq(written,3,'Cancel invalidates a delayed completion task')

-- Identity and distance are rechecked after the scheduling delay, not only when ACKs arrive.
id=begin();event('peak-phone:sharedrop:done',1,id);event('peak-phone:sharedrop:done',2,id)
local identityWait=THREADS[#THREADS];ON_WAIT=function()PLAYERS[2].PlayerData.citizenid='OTHER';ON_WAIT=nil end
identityWait();eq(phase(),'cancelled');eq(written,3);PLAYERS[2].PlayerData.citizenid='RECEIVER'
id=begin();event('peak-phone:sharedrop:done',1,id);event('peak-phone:sharedrop:done',2,id)
local distanceWait=THREADS[#THREADS];ON_WAIT=function()COORDS={[2]=vector3(3,0,0)};ON_WAIT=nil end
distanceWait();eq(phase(),'cancelled');eq(written,3);COORDS={}

id=begin();event('onResourceStop',0,'other-resource');eq(phase(),'animation')
event('onResourceStop',0,'peak-phone');eq(phase(),'cancelled');eq(written,3,'Resource stop cancels without persisting')

-- Server animation-completion minimum uses wrap-safe elapsed time.
on(1,true);on(2,true);CLOCK=4294967000;id=begin();afterClip(id)
eq(phase(),'complete');eq(written,4,'Wrapped timer still admits only the full scheduled clip')

-- A character switch during a yielding insert cannot receive the old photo
-- refresh or a private phase. The other, still-matching participant can finish.
id=begin();local eventStart=#EMITTED
afterInsert=function()PLAYERS[2].PlayerData.citizenid='OTHER'end;afterClip(id)
eq(phase(),'complete');eq(written,5)
local leakedReceiver=false
for i=eventStart+1,#EMITTED do
    local e=EMITTED[i];local data=e.args[1]
    if e.src==2 and (e.name=='peak-phone:Client:Gallery:RefreshPhotos'
        or (e.name=='peak-phone:sharedrop:phase' and data and data.PhotoUrl)) then leakedReceiver=true end
end
check(not leakedReceiver,'Switched receiver gets no prior-character photo or phase after insert')
PLAYERS[2].PlayerData.citizenid='RECEIVER'

id=begin();eventStart=#EMITTED
afterInsert=function()PLAYERS[1].PlayerData.citizenid='OTHER'end;afterClip(id)
eq(phase(),'complete');eq(written,6)
local leakedSender=false;local refreshedReceiver=false
for i=eventStart+1,#EMITTED do
    local e=EMITTED[i];local data=e.args[1]
    if e.src==1 and e.name=='peak-phone:sharedrop:phase' then leakedSender=true end
    if e.src==2 and e.name=='peak-phone:Client:Gallery:RefreshPhotos' then refreshedReceiver=true end
end
check(not leakedSender,'Switched sender gets no prior-character terminal phase or photo URL')
check(refreshedReceiver,'Matching recipient still refreshes the Gallery after a completed insert')
PLAYERS[1].PlayerData.citizenid='SENDER'

-- Location ShareDrop validates points on the server, hides coordinates until
-- the recipient accepts, then persists the attachment after both animations.
local actualActiveNumber,actualSendMessage=Phone.activeNumber,Phone.sendMessage
local locationMessages={}
Phone.activeNumber=function(src)return src==2 and '5550102002' or '5550102001'end
Phone.sendMessage=function(src,data)
    locationMessages[#locationMessages+1]={src=src,data=data}
    return {Success=true,MessageId=#locationMessages}
end
local function locationRequest(location,kind)
    seconds=seconds+30;requestSerial=requestSerial+1
    return call('Request',1,{Kind=kind or 'location',Location=location,TargetSource=2,RequestToken='fixture-location-'..requestSerial})
end
local function phaseFor(id,src,want)
    for i=#EMITTED,1,-1 do local e=EMITTED[i];local d=e.args[1]
        if e.src==src and e.name=='peak-phone:sharedrop:phase' and d and d.Id==id and d.Phase==want then return d end
    end
end
check(not locationRequest({type='location',x=10000.01,y=0}).Success,'Out-of-bounds x is rejected')
check(not locationRequest({type='location',x=0,y=15000.01}).Success,'Out-of-bounds y is rejected')
check(not locationRequest({type='location',x=0/0,y=0}).Success,'NaN location is rejected')
check(not locationRequest({type='location',x=0,y=0},'cash').Success,'Unknown ShareDrop kind is rejected')
local location={type='location',x=215.8,y=-810.1,label='Legion Square'}
local locationOffer=locationRequest(location);check(locationOffer.Success,'Valid location requests a ShareDrop offer')
local beforeConsent=phaseFor(locationOffer.Id,2,'offer');eq(beforeConsent.Kind,'location');eq(beforeConsent.Location,nil,'Offer hides location coordinates before consent');eq(beforeConsent.PhotoUrl,nil,'Location offer never emits a photo URL')
check(call('Respond',2,{Id=locationOffer.Id,Accept=true}).Success);local afterConsent=phaseFor(locationOffer.Id,2,'approach')
check(afterConsent and afterConsent.Location,'Recipient sees location only after accepting')
event('peak-phone:sharedrop:cancel',2,locationOffer.Id);eq(phase(),'cancelled');eq(#locationMessages,0,'Consent without completing animations does not send a location')

local function beginLocation()
    local result=locationRequest(location);check(result.Success)
    local offer=phaseFor(result.Id,2,'offer');eq(offer.Location,nil);eq(offer.PhotoUrl,nil)
    check(call('Respond',2,{Id=result.Id,Accept=true}).Success)
    local consented=phaseFor(result.Id,2,'approach');eq(consented.Location.x,location.x,'Accepted location is available to both animation clients')
    local clock=CLOCK%4294967296
    event('peak-phone:sharedrop:ready',1,result.Id,clock);event('peak-phone:sharedrop:ready',2,result.Id,clock)
    eq(phase(),'animation')
    return result.Id
end
local locationId=beginLocation();COORDS={[2]=vector3(3,0,0)};afterClip(locationId)
eq(phase(),'cancelled','Peer must remain in proximity at save time');eq(#locationMessages,0,'Moved-away peer receives no message')
COORDS={}
locationId=beginLocation();PLAYERS[2].PlayerData.citizenid='OTHER';afterClip(locationId)
eq(phase(),'cancelled','Receiver identity is rechecked at save time');eq(#locationMessages,0,'Replacement character receives no message')
PLAYERS[2].PlayerData.citizenid='RECEIVER';on(2,true)
locationId=beginLocation();afterClip(locationId)
eq(phase(),'complete');eq(#locationMessages,1,'Completed location transfer saves exactly one message')
local savedLocation=locationMessages[1];eq(savedLocation.src,1);eq(savedLocation.data.Phone,'5550102002');eq(savedLocation.data.Message,'Legion Square')
eq(savedLocation.data.Attachments[1].type,'location');eq(savedLocation.data.Attachments[1].x,location.x);eq(savedLocation.data.Attachments[1].y,location.y)
eq(savedLocation.data.OperationId,'sharedrop-'..locationId,'Location message has a stable operation ID')
eq(savedLocation.data.Attachments[1].photo_url,nil,'Location attachment never contains a photo URL')
event('peak-phone:sharedrop:done',2,locationId);eq(#locationMessages,1,'Completion replay cannot duplicate a location message')
Phone.activeNumber,Phone.sendMessage=actualActiveNumber,actualSendMessage
os.time=realTime
