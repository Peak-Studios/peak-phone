for _,framework in ipairs({'qbcore','qbox','esx'}) do
 base(framework);addPlayer(1,'A');addPlayer(2,'B');addPlayer(3,'C');IsNetworkEnabled=true;Config={SpeakerProximityRange=5};CLOCK=CLOCK+100000
 if framework=='esx' then
  -- Model the dedicated inventory slot for the ESX adapter; call-edge tests
  -- do not exercise inventory backend translation.
  Phone.inventorySlot=function(_,slot)return {Name='phone',Amount=1,Slot=slot,Info={test=true}}end
 end
 for i=1,3 do Player(i).state.callChannel=0 end
 GetContactName=function(_,n)return n end;GetActivePhoneNumber=function(src)return Phone.getPlayer(src).PlayerData.charinfo.phone end
 GetSourceByPhoneNumber=function(n)for src in pairs(PLAYERS)do if GetActivePhoneNumber(src)==n then return src end end;return false end
 loadrel('server/sv_calls.lua');Phone.RTC={configured=function()return true end,revoke=function()end};loadrel('server/sv_facetime.lua');local watchdog=THREADS[#THREADS];local C=Phone.Calls
 local function dial(kind)CLOCK=CLOCK+6000;return C.start(1,'5550000002',kind or 'voice')end
 local c=dial();check(c.Success);Player(2).state.callChannel=7878;eq(C.answer(2,c.CallId),false,'Foreign channel appeared while ringing');eq(Player(2).state.callChannel,7878,'Other resource channel preserved');C.stop(c.CallId);Player(2).state.callChannel=0
 resource('pma-voice',{setPlayerCall=function()return false end});c=dial();check(c.Success);eq(C.answer(2,c.CallId),false,'Export failure is not success');eq(C.bySource[1],nil);eq(C.bySource[2],nil)
 resource('pma-voice',{setPlayerCall=function(_,src,ch)Player(src).state.callChannel=ch end})
 if framework=='esx'then PLAYERS[1].getMeta=function()return{isdead=true}end else PLAYERS[1].PlayerData.metadata.isdead=true end
 eq(dial().Success,false,'Raw framework incapacitation checked')
 if framework=='esx'then PLAYERS[1].getMeta=function()return{}end else PLAYERS[1].PlayerData.metadata.isdead=false end
 c=dial();check(c.Success);check(C.answer(2,c.CallId));event('peak-phone:Server:Contacts:ToggleSpeaker',1,{CallId=c.CallId,Enabled=true});eq(C.sessions[c.CallId].a.speaker,nil,'Unsafe legacy speaker guests require explicit opt-in');C.stop(c.CallId)
 -- Cancellation during a yielding voice-adapter export cannot resurrect the call.
 c=dial();check(c.Success);local cancelId=c.CallId;local didCancel=false
 resource('pma-voice',{setPlayerCall=function(_,src,ch)
  if ch~=0 and not didCancel then didCancel=true;C.stop(cancelId,'Cancelled while answering') end
  Player(src).state.callChannel=ch
 end})
 eq(C.answer(2,cancelId),false);eq(C.bySource[1],nil);eq(C.bySource[2],nil);eq(Player(1).state.callChannel,0);eq(Player(2).state.callChannel,0)
 resource('pma-voice',{setPlayerCall=function(_,src,ch)Player(src).state.callChannel=ch end})
 c=dial('video');check(c.Success);check(C.answer(2,c.CallId));event('peak-phone:portable:rtcStatus',1,c.CallId,'connected');event('peak-phone:portable:rtcStatus',2,c.CallId,'connected');eq(C.sessions[c.CallId].status,'negotiating','Cannot claim connected before media readiness/SDP')
 check(rpc('peak-phone:portable:rtcReady',1,c.CallId));check(rpc('peak-phone:portable:rtcReady',2,c.CallId))
 local sdp='v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n'
 event('peak-phone:portable:signal',1,c.CallId,{type='description',description={type='offer',sdp=sdp}})
 event('peak-phone:portable:signal',2,c.CallId,{type='description',description={type='answer',sdp=sdp}})
 event('peak-phone:portable:rtcStatus',1,c.CallId,'connected');event('peak-phone:portable:rtcStatus',2,c.CallId,'connected');eq(C.sessions[c.CallId].status,'active')
 event('peak-phone:portable:rtcStatus',1,c.CallId,'disconnected');check(C.sessions[c.CallId].reconnectAt)
 CLOCK=CLOCK+(PhoneConfig.Video.ConnectionTimeout+1)*1000;C.sessions[c.CallId].heartbeat={[1]=CLOCK,[2]=CLOCK}
 local oldWait=Wait;Wait=function()coroutine.yield()end;local co=coroutine.create(watchdog);assert(coroutine.resume(co));assert(coroutine.resume(co));Wait=oldWait
 eq(C.sessions[c.CallId],nil,'Disconnected media times out even if page still sends heartbeat');eq(C.bySource[1],nil);eq(C.bySource[2],nil)
end
