-- Media packets never traverse FiveM net events; only authenticated SDP/ICE signaling does.
local function nativeNet(name, handler) Phone.NativeRegisterNetEvent(name); Phone.NativeAddEventHandler(name, handler) end
local C=Phone.Calls
Peak.Functions.CreateCallback('peak-phone:portable:videoDial',function(src,cb,data)
    cb(C.start(src,type(data)=='table' and data.Phone,'video'))
end)
Peak.Functions.CreateCallback('peak-phone:portable:answer',function(src,cb,id) cb({Success=C.answer(src,id)}) end)
Peak.Functions.CreateCallback('peak-phone:portable:hangup',function(src,cb,id)
    if C.member(src,id) then C.stop(id,'Call ended');return cb({Success=true}) end
    cb({Success=false})
end)
Peak.Functions.CreateCallback('peak-phone:portable:rtcReady',function(src,cb,id)
    local call=C.member(src,id)
    if not call or call.kind~='video' or call.status=='ringing' then return cb(false) end
    call.ready[src]=true;call.heartbeat=call.heartbeat or {};call.heartbeat[src]=GetGameTimer()
    if call.ready[call.a.src] and call.ready[call.b.src] and not call.offerIssued then
        call.offerIssued=true
        TriggerClientEvent('peak-phone:portable:rtcOffer',call.a.src,id,false)
    end
    cb(true)
end)
local function member(src,id)
    local call,who,other=C.member(src,id)
    if not call or call.kind~='video' or call.status=='ringing' then return end
    return call,who,other
end
nativeNet('peak-phone:portable:signal',function(id,data)
    local src=tonumber(source);local call,who,other=member(src,id)
    if not call or not call.ready[src] or not call.offerIssued or type(data)~='table' or not Phone.rate(src,'rtc-signal',80,1000) then return end
    local encodedOK,encoded=pcall(json.encode,data);if not encodedOK or #encoded>60000 then return end
    local signal
    if data.type=='description' then
        local d=data.description
        if type(d)~='table' or not Phone.text(d.sdp,50000) or not d.sdp:match('^v=0') or d.sdp:find('m=application',1,true) then return end
        if d.type=='offer' and src==call.a.src and not call.offerPending and (call.offers or 0)<3 then call.offerPending=true;call.offers=(call.offers or 0)+1
        elseif d.type=='answer' and src==call.b.src and call.offerPending then call.offerPending=false;call.answerReceived=true
        else return end
        signal={type='description',description={type=d.type,sdp=d.sdp}}
    elseif data.type=='ice' then
        local candidate=data.candidate
        call.signalCount[src]=(call.signalCount[src] or 0)+1
        if call.signalCount[src]>512 then return end
        if candidate==false then signal={type='ice',candidate=false}
        elseif type(candidate)=='table' and Phone.text(candidate.candidate,4096,true) and (candidate.sdpMid==nil or Phone.text(candidate.sdpMid,64,true)) and (candidate.sdpMLineIndex==nil or Phone.number(candidate.sdpMLineIndex,10,true)) then
            if PhoneConfig.Video.RelayOnly and candidate.candidate~='' and not candidate.candidate:find(' typ relay',1,true) then return end
            signal={type='ice',candidate={candidate=candidate.candidate,sdpMid=candidate.sdpMid,sdpMLineIndex=candidate.sdpMLineIndex,usernameFragment=Phone.text(candidate.usernameFragment,256,true) and candidate.usernameFragment or nil}}
        end
    end
    if signal and Phone.sameCharacter(other.src,other.cid) then TriggerClientEvent('peak-phone:portable:signal',other.src,id,signal) end
end)
nativeNet('peak-phone:portable:rtcStatus',function(id,status)
    local src=tonumber(source);local call=member(src,id)
    if not call or not Phone.rate(src,'rtc-status',10,1000) then return end
    if status=='connected' then
        if not call.ready[call.a.src] or not call.ready[call.b.src] or not call.answerReceived then return end
        call.connected[src]=true
        if call.connected[call.a.src] and call.connected[call.b.src] then
            call.reconnectAt=nil
            if call.status~='active' then call.status='active';call.startedAt=call.startedAt or os.time()*1000;C.publish(call) end
        end
    elseif status=='closed' then C.stop(id,'Video connection ended')
    elseif status=='disconnected' or status=='failed' then
        if not call.answerReceived then return end
        call.connected[src]=false
        local now=GetGameTimer();call.reconnectAt=call.reconnectAt or now
        if call.status=='active' then call.status='reconnecting';C.publish(call) end
        -- Both peers can report the same outage. Issue one bounded restart, not
        -- two simultaneous offers, and never renew the recovery deadline here.
        if call.restarts<2 and not call.offerPending and (not call.lastRestart or now-call.lastRestart>5000) then
            call.restarts=call.restarts+1;call.lastRestart=now
            TriggerClientEvent('peak-phone:portable:rtcOffer',call.a.src,id,true)
        end
    end
end)
nativeNet('peak-phone:portable:rtcHeartbeat',function(id)
    local src=tonumber(source);local call=member(src,id)
    if not call or not Phone.rate(src,'rtc-heartbeat',2,3000) then return end
    call.heartbeat=call.heartbeat or {};call.heartbeat[src]=GetGameTimer()
end)
nativeNet('peak-phone:portable:rtcAbort',function(id)
    if C.member(tonumber(source),id) then C.stop(id,'Video ended. Check camera availability and the server relay before calling again.') end
end)
CreateThread(function()
    while true do
        Wait(5000)
        local now=GetGameTimer();local stale={}
        for id,call in pairs(C.sessions) do
            if call.kind=='video' and call.status~='ringing' then
                for _,m in ipairs({call.a,call.b}) do
                    local t=call.heartbeat and call.heartbeat[m.src]
                    if now-(t or call.answered or call.created)>22000 or (call.reconnectAt and now-call.reconnectAt>20000) then stale[#stale+1]=id;break end
                end
            end
        end
        for _,id in ipairs(stale) do C.stop(id,'Video client stopped responding') end
    end
end)
