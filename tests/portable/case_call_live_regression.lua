-- Execute the shipped server registries with mocked framework/SQL/relay boundaries.
local engineRegister,engineAdd=RegisterNetEvent,AddEventHandler
for _,framework in ipairs({'qbcore','qbox','esx'}) do
 RegisterNetEvent,AddEventHandler=engineRegister,engineAdd
 base(framework);for src=1,4 do addPlayer(src,'C'..src);Player(src).state.callChannel=0 end
 if framework=='esx' then
  -- The call/live race fixture requires a phone in the configured dedicated
  -- slot; inventory translation itself is covered by the bridge tests.
  Phone.inventorySlot=function(_,slot)return {Name='phone',Amount=1,Slot=slot,Info={test=true}}end
 end
 CLOCK=CLOCK+100000;IsNetworkEnabled=true;Config={SpeakerProximityRange=5}
 loadrel('shared/kilogram-live.lua')
 local profiles={};for src=1,4 do profiles['C'..src]={id=src,citizenid='C'..src,handle='user'..src,display_name='User '..src,suspended=0} end
 PhoneDB.one=function(sql,v)if sql:find('peak_phone_social_profiles',1,true)then return profiles[v[1]] end end
 local queryHook
 PhoneDB.query=function(sql,v)if queryHook then local f=queryHook;queryHook=nil;f(sql,v)end;return{}end
 GetContactName=function(_,n)return n end
 GetSourceByPhoneNumber=function(n)for src=1,4 do if n=='555000000'..src then return src end end;return false end
 local revoked={}
 Phone.RTC={configured=function()return true end,revoke=function(id,src)revoked[#revoked+1]={id,src}end,
 liveCredentials=function()return {{urls={'turn:relay.invalid:3478?transport=tcp'},username='fixture',credential='fixture'}}end}
 loadrel('server/sv_calls.lua');loadrel('server/sv_facetime.lua');loadrel('server/sv_kilogram_live.lua')
 local C,L=Phone.Calls,Phone.KiloLive
 local function live(route,src,data)return rpc('peak-phone:Server:KiloLive:'..route,src,data or {})end
 local function dial(src,n,kind)CLOCK=CLOCK+6000;return C.start(src,'555000000'..n,kind or 'voice')end
 local function packet(env,extra)local d={SessionId=env.session.id,Token=env.token};for k,v in pairs(extra or {})do d[k]=v end;return d end
 local host=live('Start',1,{Title='Regression live'});check(host.Success,host.Msg)
 eq(dial(2,1).Success,false,'Cannot call a broadcaster')
 check(live('Ready',1,packet(host,{HasAudio=false})).Success)
 local a=live('Join',2,{SessionId=host.session.id});check(a.Success,a.Msg)
 local b=live('Join',3,{SessionId=host.session.id});check(b.Success,b.Msg)
 check(live('Ready',2,packet(a)).Success);check(live('Ready',3,packet(b)).Success)
 eq(dial(4,2).Success,false,'Cannot call a live viewer')
 eq(live('DropPeer',2,packet(a,{Peer=3,PeerToken=b.token})).Success,false,'Viewer cannot drop another viewer')
 check(live('DropPeer',1,packet(host,{Peer=2,PeerToken='obsolete-token'})).Success)
 check(L.sessions[host.session.id].members[2],'Wrong peer token cannot eject a viewer')
 local function signal(src,env,peer,token,value)
  event('peak-phone:Server:KiloLive:Signal',src,packet(env,{Peer=peer,PeerToken=token,Signal=value}))
 end
 local function countSignals()
  local n=0;for _,e in ipairs(EMITTED)do if e.name=='peak-phone:Client:KiloLive:Event' and e.args[1].Kind=='signal' and e.args[1].SessionId==host.session.id then n=n+1 end end;return n
 end
 local offer={type='description',description={type='offer',sdp='v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n'}}
 local before=countSignals()
 signal(2,a,3,b.token,offer);eq(countSignals(),before,'Viewer-to-viewer signaling blocked')
 signal(4,a,1,host.token,offer);eq(countSignals(),before,'Forged membership blocked')
 signal(1,host,2,a.token,offer);eq(countSignals(),before+1)
 signal(2,a,1,host.token,{type='description',description={type='answer',sdp=offer.description.sdp}});eq(countSignals(),before+2)
 signal(1,host,2,a.token,{type='ice',candidate={candidate='candidate:1 1 udp 1 127.0.0.1 1234 typ host',sdpMid='0',sdpMLineIndex=0}})
 eq(countSignals(),before+2,'Relay-only policy blocks host candidates')
 signal(1,host,2,a.token,{type='ice',candidate=false});eq(countSignals(),before+3,'End-of-candidates accepted')
 check(live('DropPeer',1,packet(host,{Peer=2,PeerToken=a.token})).Success)
 eq(L.bySource[2],nil);check(L.sessions[host.session.id].members[3],'One failed viewer leaves others connected')
 check(L.sessions[host.session.id].members[1],'Host reservation preserved')
 local retryable=false;for _,e in ipairs(EMITTED)do local d=e.args[1];if e.name=='peak-phone:Client:KiloLive:Event' and e.src==2 and d.Kind=='ended' and d.Token==a.token then retryable=d.Data.retryable end end
 eq(retryable,true,'Transport error offers retry, not completed-broadcast messaging')
 local retry=live('Join',2,{SessionId=host.session.id});check(retry.Success,retry.Msg);check(retry.token~=a.token)
 live('Leave',2,packet(a));eq(L.bySource[2],host.session.id,'Late leave cannot remove rejoined member')
 signal(2,a,1,host.token,offer);eq(countSignals(),before+3,'Old token cannot signal after retry')
 check(live('Leave',1,packet(host)).Success);eq(next(L.sessions),nil);eq(next(L.bySource),nil);eq(next(L.byProfile),nil)
 -- Block-map lookup may yield: a call that appears meanwhile wins the reservation.
 queryHook=function()C.bySource[1]='concurrent-call'end
 CLOCK=CLOCK+11000;eq(live('Start',1,{Title='Racing start'}).Success,false);eq(L.bySource[1],nil);C.bySource[1]=nil
 local host2=live('Start',1,{Title='Another broadcast'});check(host2.Success);check(live('Ready',1,packet(host2)).Success)
 queryHook=function()C.bySource[2]='concurrent-call'end
 eq(live('Join',2,{SessionId=host2.session.id}).Success,false);eq(L.bySource[2],nil);C.bySource[2]=nil
 live('Leave',1,packet(host2))
 -- Contact lookup may also yield: a reserved live prevents a call from taking over.
 GetContactName=function(_,n)L.bySource[2]='concurrent-live';return n end
 eq(dial(1,2,'video').Success,false);eq(C.bySource[1],nil);L.bySource[2]=nil
 GetContactName=function(_,n)return n end
 local v=dial(1,2,'video');check(v.Success);check(C.answer(2,v.CallId));eq(C.sessions[v.CallId].status,'negotiating')
 check(Player(1).state.callChannel>0,'Default video uses game voice');eq(Player(1).state.callChannel,Player(2).state.callChannel)
 eq(rpc('peak-phone:Server:Calls:Mute',3,{CallId=v.CallId,Muted=true}).Success,false)
 check(rpc('peak-phone:Server:Calls:Mute',1,{CallId=v.CallId,Muted=true}).Success)
 local state=rpc('peak-phone:Server:Calls:State',2);eq(state.Data.PeerMuted,true);eq(state.Data.AudioMode,'voice')
 C.stop(v.CallId);eq(Player(1).state.callChannel,0);eq(Player(2).state.callChannel,0)
 PhoneConfig.Video.AudioMode='webrtc'
 v=dial(1,2,'video');check(v.Success);check(C.answer(2,v.CallId));eq(Player(1).state.callChannel,0);eq(Player(2).state.callChannel,0)
 eq(rpc('peak-phone:Server:Calls:State',1).Data.AudioMode,'webrtc')
 C.stop(v.CallId);check(#revoked>=8,'Credentials revoked after leaving calls and live rooms')
end
