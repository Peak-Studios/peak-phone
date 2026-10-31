for _,framework in ipairs({'qbcore','qbox','esx'}) do
 base(framework);addPlayer(1,'A');addPlayer(2,'B');addPlayer(3,'C');COORDS={};BUCKETS={};CLOCK=CLOCK+100000
 if framework=='esx' then
  -- AirDrop requires the configured equipped-phone slot; inventory mapping is
  -- outside this contacts/sharing contract.
  Phone.inventorySlot=function(_,slot)return {Name='phone',Amount=1,Slot=slot,Info={test=true}}end
 end
 for i=1,3 do Player(i).state.phoneOpen=true end
 local rows,sequence={},0;local insertFailure=false
 PhoneDB.one=function(sql,v)
  if sql:find('phone_profiles',1,true) then return nil end
  if sql:find('COUNT(*)',1,true) then local n=0;for _,r in pairs(rows)do if r.citizenid==v[1]then n=n+1 end end;return{n=n}end
  if sql:find('WHERE id=? AND citizenid=?',1,true)then local r=rows[v[1]];return r and r.citizenid==v[2]and copy(r)or nil end
  if sql:find('phone_contacts',1,true)then for _,r in pairs(rows)do if r.citizenid==v[1]and r.phone==v[2]and(not v[3]or r.id~=v[3])then return copy(r)end end end
  return nil
 end
 PhoneDB.insert=function(sql,v)if insertFailure then return nil end;sequence=sequence+1;rows[sequence]={id=sequence,citizenid=v[1],name=v[2],phone=v[3]};return sequence end
 PhoneDB.update=function(sql,v)
  if sql:find('DELETE FROM phone_contacts',1,true)then local r=rows[v[1]];if r and r.citizenid==v[2]then rows[v[1]]=nil;return 1 end;return 0 end
  if sql:find('UPDATE phone_contacts',1,true)then local r=rows[v[3]];if r and r.citizenid==v[4]then r.name=v[1];r.phone=v[2];return 1 end;return 0 end
  return 1
 end
 GetActivePhoneNumber=function(src)local p=Phone.getPlayer(src);return p and p.PlayerData.charinfo.phone end
 GetAvatarsForPhones=function()return{}end
 loadrel('server/sv_contacts.lua')
 local function cb(name,src,data)return rpc('peak-phone:Server:Contacts:'..name,src,data)end
 local function share(src,data)CLOCK=CLOCK+6000;return cb('RequestAirShare',src,data)end
 local function bad(r,msg)check(type(r)=='table'and r.Success==false,msg)end
 eq(cb('AddContacts',1,{Name='Saved person',Phone='5551111111'}),true);eq(sequence,1)
 eq(cb('AddContacts',1,{Name='Do not rename',Phone='5551111111'}),true);eq(sequence,1);eq(rows[1].name,'Saved person')
 eq(cb('AddContacts',1,{Name='Invalid',Phone='<script>'}),false)
 eq(cb('DeleteContact',2,{ContactId=1}),false,'Delete is owner scoped');check(rows[1])
 eq(cb('EditContact',2,{ContactId=1,Name='Hijacked',Phone='5559999999'}),false);eq(rows[1].name,'Saved person')
 eq(cb('EditContact',1,{ContactId=1,Name='Edited',Phone='5551111111'}),true);eq(rows[1].name,'Edited')
 eq(cb('AddContacts',1,{Name='Temporary',Phone='5552222222'}),true);eq(cb('DeleteContact',1,{ContactId=2}),true,'Real NUI ContactId field works');eq(rows[2],nil)
 local request=share(1,{TargetSource=2,Contact={Name='Forged administrator',Phone='5550000001'}});check(request.Success)
 local card=Phone.ContactShares[request.RequestId].payload.Contact;eq(card.Name,'Test Citizen','Self identity is authoritative')
 eq(cb('PendingAirShares',3).requests[1],nil);eq(#cb('PendingAirShares',2).requests,1,'Request persists with Contacts unmounted')
 bad(cb('RespondAirShare',3,{RequestId=request.RequestId,Accept=true}),'Wrong recipient cannot accept');eq(sequence,2)
 check(cb('RespondAirShare',2,{RequestId=request.RequestId,Accept=true}).Success);eq(sequence,3);eq(rows[3].citizenid,'B');eq(rows[3].phone,'5550000001')
 bad(cb('RespondAirShare',2,{RequestId=request.RequestId,Accept=true}),'No share replay');eq(sequence,3)
 request=share(1,{TargetSource=2,Contact={name='Forged',phone='5551111111'}});check(request.Success);eq(Phone.ContactShares[request.RequestId].payload.Contact.name,'Edited')
 check(cb('RespondAirShare',2,{RequestId=request.RequestId,Accept=false}).Success);eq(sequence,3,'Decline creates no row')
 bad(share(3,{TargetSource=2,Contact={Phone='5551111111'}}),'Other character cannot share an unsaved third-party card')
 COORDS[2]=vector3(10,0,0);bad(share(1,{TargetSource=2}),'Distance checked');COORDS[2]=nil
 BUCKETS[2]=1;bad(share(1,{TargetSource=2}),'Bucket checked');BUCKETS[2]=nil
 Player(2).state.phoneOpen=false;bad(share(1,{TargetSource=2}),'Recipient open state checked');Player(2).state.phoneOpen=true
 INVENTORY[2].phone=0;bad(share(1,{TargetSource=2}),'Recipient phone checked');INVENTORY[2].phone=1
 request=share(1,{TargetSource=2});check(request.Success);CLOCK=CLOCK+60001;bad(cb('RespondAirShare',2,{RequestId=request.RequestId,Accept=true}),'Expired share rejected')
 request=share(1,{TargetSource=2});check(request.Success);addPlayer(2,'REPLACED');bad(cb('RespondAirShare',2,{RequestId=request.RequestId,Accept=true}),'Source reuse cannot inherit consent');addPlayer(2,'B')
 request=share(1,{TargetSource=2});check(request.Success);event('peak-phone:Contacts:Logout',1);eq(next(Phone.ContactShares),nil,'Logout clears inbound and outbound shares')
 request=share(1,{TargetSource=3,Contact={Phone='5551111111'}});check(request.Success);insertFailure=true
 bad(cb('RespondAirShare',3,{RequestId=request.RequestId,Accept=true}),'Failed insert does not claim delivery');check(Phone.ContactShares[request.RequestId]);insertFailure=false
 check(cb('RespondAirShare',3,{RequestId=request.RequestId,Accept=true}).Success);eq(Phone.ContactShares[request.RequestId],nil)
 bad(cb('UpdateProfile',1,{avatar='javascript:alert(1)'}),'Unsafe avatar rejected')
 eq(#cb('GetNearbyPlayers',1),2,'Cross-framework nearby identity lookup')
end
