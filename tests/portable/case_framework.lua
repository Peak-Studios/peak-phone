for _,core in ipairs({'qbcore','qbox','esx'}) do
 base(core);addPlayer(1,core=='esx' and 'char2:license:0123456789012345678901234567890123456789' or 'CID-A')
 if core=='esx' then Phone.inventorySlot=function(_,slot)return {Name='phone',Amount=1,Slot=slot,Info={test=true}}end end
 local cid=Phone.rawIdentity(PLAYERS[1]);local p=Phone.getPlayer(1)
 eq(Phone.framework(),core,'native selection');eq(p.PlayerData.citizenid,cid,'full character identifier')
 eq(p.PlayerData.charinfo.phone,'5550000001','logical number');eq(p.PlayerData.job.grade.level,2,'normalized grade');eq(p.PlayerData.money.bank,1000)
 check(Phone.hasPhone(1),'phone inventory');eq(Phone.removeMoney(1,'bank',1001),false);eq(#MONEY_WRITES,0,'no overdraft')
 eq(Phone.removeMoney(1,'bank',-1),false);eq(Phone.removeMoney(1,'bank',0/0),false)
 eq(Phone.removeMoney(1,'bank',120),true);eq(MONEY[1].bank,880);eq(Phone.addMoney(1,'bank',20),true);eq(MONEY[1].bank,900)
 INVENTORY[1].phone=0;eq(Phone.hasPhone(1),false);eq(Phone.authorized(1,'any',{}),false)
 PhoneConfig.RequirePhoneItem=false;eq(Phone.hasPhone(1),false,'missing phone still fails the dedicated-slot check despite the legacy toggle');PhoneConfig.RequirePhoneItem=true;INVENTORY[1].phone=1
 eq(Phone.sameCharacter(1,'another'),false);eq(Phone.sameCharacter(1,cid),true)
 local ok=pcall(p.Functions.SetMetaData,'admin',true);eq(ok,false,'only phone metadata mutable')
 check(Phone.mediaURL('https://i.imgur.com/photo.png'));eq(Phone.mediaURL('https://i.imgur.com.evil.test/p'),nil);eq(Phone.mediaURL('https://i.imgur.com@evil.test/p'),nil);eq(Phone.mediaURL('http://i.imgur.com/p'),nil)
 local n=0;RegisterNetEvent('peak-phone:Server:Mails:AddMail',function()n=n+1 end);event('peak-phone:Server:Mails:AddMail',1);eq(n,0,'client cannot forge system mail');event('peak-phone:Server:Mails:AddMail',0);eq(n,1,'server integration still callable')
 -- Old-character RPC results are never sent to a replacement character at the same source.
 local saved;PhonePeak.Functions.CreateCallback('fixture:async',function(_,cb)saved=cb end)
 event('peak-phone:portable:rpc',1,11,'fixture:async',{n=0});check(saved,'rpc captured')
 local before=#EMITTED;addPlayer(1,'NEW-CID');saved({secret='old character'});eq(#EMITTED,before,'discard stale reply')
 local unlocked=false;pcall(function()Phone.withLocks({'a','a'},function()error('fixture error')end)end);eq(Phone.Locks.a,nil,'lock released on error')
 Phone.withLocks({'b','a'},function()unlocked=Phone.Locks.a and Phone.Locks.b end);check(unlocked);eq(next(Phone.Locks),nil)
end

-- FiveM may assign server ID 0 to a connected player. The portable bridge
-- must bootstrap and authorize that player instead of treating it as console.
base('qbcore');addPlayer(0,'CID-ZERO')
check(Phone.rawPlayer(0),'source zero raw player')
eq(Phone.getPlayer(0).PlayerData.citizenid,'CID-ZERO','source zero normalized player')
PhonePeak.Functions.CreateCallback('fixture:source-zero',function(src,cb)
 cb({PlayerData=Phone.getPlayer(src).PlayerData})
end)
local emittedBefore=#EMITTED
event('peak-phone:portable:rpc',0,77,'fixture:source-zero',{n=0})
eq(#EMITTED,emittedBefore+1,'source zero rpc replied')
local zeroReply=EMITTED[#EMITTED]
eq(zeroReply.name,'peak-phone:portable:response','source zero response event')
eq(zeroReply.src,0,'source zero response target')
eq(zeroReply.args[2],true,'source zero rpc accepted')
eq(zeroReply.args[3].PlayerData.citizenid,'CID-ZERO','source zero character returned')

-- Bounded voice-note data is admitted only through its explicit WebM shape.
check(Phone.messageBody('hello'))
check(Phone.messageBody(''))
check(Phone.messageBody('data:audio/webm;base64,GkXfo59ChoE='))
eq(Phone.messageBody('data:image/png;base64,GkXfAAAA=='),false)
eq(Phone.messageBody('data:audio/webm;base64,AAAA'),false)
eq(Phone.messageBody('data:audio/webm;base64,GkXf<script>'),false)
eq(Phone.messageBody(string.rep('a',4001)),false)
eq(Phone.messageBody('data:audio/webm;base64,GkXf'..string.rep('A',80000)),false)
