base('qbcore');addPlayer(1,'A');addPlayer(2,'B');addPlayer(3,'C');IsNetworkEnabled=true;Config={SpeakerProximityRange=5}
loadrel('server/sv_simcard.lua');loadrel('server/sv_contacts.lua');loadrel('server/sv_calls.lua')
Phone.RTC={configured=function()return true end,revoke=function()end};loadrel('server/sv_facetime.lua')
-- This case exercises explicit WebRTC audio; default game-voice video is covered by call_edges.
PhoneConfig.Video.AudioMode='webrtc'
local C=Phone.Calls;local started=C.start(1,'5550000002','video');check(started.Success);local id=started.CallId
eq(C.sessions[id].status,'ringing');eq(C.member(3,id),nil,'third party cannot join');eq(C.answer(1,id),false,'caller cannot accept for callee');eq(C.answer(3,id),false)
eq(rpc('peak-phone:portable:rtcReady',1,id),false,'no ready before consent');eq(C.answer(2,id),true);eq(C.answer(2,id),false,'no repeated acceptance')
eq(C.sessions[id].status,'negotiating');eq(Player(1).state.callChannel,0,'video does not join voice channel');eq(C.start(3,'5550000002','video').Success,false,'callee busy')
eq(rpc('peak-phone:portable:rtcReady',1,id),true);check(not C.sessions[id].offerIssued,'both must be ready');eq(rpc('peak-phone:portable:rtcReady',2,id),true);check(C.sessions[id].offerIssued)
local function sentSignals()local n=0;for _,e in ipairs(EMITTED)do if e.name=='peak-phone:portable:signal'then n=n+1 end end;return n end
local offer={type='description',description={type='offer',sdp='v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n'}}
event('peak-phone:portable:signal',3,id,offer);eq(sentSignals(),0,'outsider signal blocked')
event('peak-phone:portable:signal',2,id,offer);eq(sentSignals(),0,'wrong role offer blocked')
event('peak-phone:portable:signal',1,id,offer);eq(sentSignals(),1);event('peak-phone:portable:signal',1,id,offer);eq(sentSignals(),1,'duplicate offer rejected')
event('peak-phone:portable:signal',1,id,{type='ice',candidate={candidate='candidate:x typ host',sdpMid='0',sdpMLineIndex=0}});eq(sentSignals(),1,'relay policy blocks host trickle')
event('peak-phone:portable:signal',1,id,{type='ice',candidate={candidate='candidate:x typ relay',sdpMid='0',sdpMLineIndex=0}});eq(sentSignals(),2)
event('peak-phone:portable:signal',2,id,{type='description',description={type='answer',sdp='v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n'}});eq(sentSignals(),3);eq(C.sessions[id].offerPending,false)
event('peak-phone:portable:rtcStatus',1,id,'connected');eq(C.sessions[id].status,'negotiating');event('peak-phone:portable:rtcStatus',2,id,'connected');eq(C.sessions[id].status,'active')
eq(rpc('peak-phone:portable:hangup',3,id).Success,false);eq(rpc('peak-phone:portable:hangup',1,id).Success,true);eq(C.sessions[id],nil);eq(C.bySource[2],nil)
event('peak-phone:portable:signal',1,id,offer);eq(sentSignals(),3,'stale signaling ignored');eq(Player(1).state.phoneCall,nil)
CLOCK=CLOCK+6000;local voice=C.start(1,'5550000002','voice');check(voice.Success);eq(C.answer(2,voice.CallId),true)
check(Player(1).state.callChannel>0);eq(Player(1).state.callChannel,Player(2).state.callChannel)
C.stop(voice.CallId);eq(Player(1).state.callChannel,0);eq(Player(2).state.callChannel,0)
CLOCK=CLOCK+6000;local old=C.start(1,'5550000002','video');check(old.Success);addPlayer(2,'REUSED');eq(C.member(2,old.CallId),nil,'source reuse does not confer membership');eq(C.answer(2,old.CallId),false)
C.stopAll('test');eq(next(C.sessions),nil);eq(next(C.bySource),nil)
