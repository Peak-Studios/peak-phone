-- Actual job callbacks under mocked FiveM/framework/SQL boundaries, repeated for all framework bridges.
for _,framework in ipairs({'qbcore','qbox','esx'}) do
 base(framework);addPlayer(1,'A');addPlayer(2,'B');addPlayer(3,'C');COORDS={};BUCKETS={};CLOCK=CLOCK+100000
 if framework=='esx' then Phone.inventorySlot=function(_,slot)return {Name='phone',Amount=1,Slot=slot,Info={test=true}}end end
 IsPlayerAceAllowed=function(src,permission)return src==1 and permission==PhoneConfig.Jobs.AdminAce end
 local journal,transactions={},{}
 PhoneDB.transaction=function(qs)
  transactions[#transactions+1]=copy(qs)
  for _,q in ipairs(qs) do if q.query:find('INSERT INTO peak_phone_job_rewards',1,true) then local v=q.values;assert(not journal[v[1]],'Duplicate journal key');journal[v[1]]={status=v[7],amount=v[5],cid=v[3]} end end
  return true
 end
 PhoneDB.update=function(sql,v)
  if sql:find("SET status='applying'",1,true) then local row=journal[v[2]];if row and row.status=='prepared' then row.status='applying';return 1 end;return 0 end
  if sql:find('SET status=?',1,true) then local row=journal[v[3]];assert(row);row.status=v[1];return 1 end
  return 1
 end
 loadrel('jobs/settings.lua');loadrel('jobs/validation.lua');loadrel('jobs/server.lua');local J=Phone.Jobs;J.ready=true;local watchdog=THREADS[#THREADS]
 local d={id='test_job',name='Test route',description='Fixture',enabled=true,ped='',reward=125,account='cash',minMembers=1,maxMembers=3,timeoutMinutes=5,requiredJob='',requirements={},hub={x=0,y=0,z=0,w=0},steps={{type='work',label='Work here',coords={x=0,y=0,z=0},radius=3,duration=2,scenario='none'}}}
 local function action(src,data)CLOCK=CLOCK+4000;return rpc('peak-phone:Jobs:Action',src,data)end
 local function bad(r,msg)check(type(r)=='table' and r.Success==false,msg)end
 local function good(r,msg)check(type(r)=='table' and r.Success==true,msg);return r end
 eq(J.admin(1),true);eq(J.admin(2),false);bad(rpc('peak-phone:Jobs:Admin',2),'Admin read denied')
 bad(action(2,{action='save',definition=d,revision=0}),'Forged save denied');eq(next(J.definitions),nil)
 for _,field in ipairs({'reward','timeoutMinutes','minMembers','maxMembers'}) do local v=copy(d);v[field]=math.huge;check(not Phone.JobSchema.validate(v),'Finite '..field)end
 local v=copy(d);v.steps[1].coords.x=0/0;check(not Phone.JobSchema.validate(v),'NaN denied')
 v=copy(d);v.steps[1].type='server_event';check(not Phone.JobSchema.validate(v),'No executable step')
 v=copy(d);v.steps[1].type='drive';check(not Phone.JobSchema.validate(v),'No driving without assigned vehicle')
 v=copy(d);v.requirements={{item='lockpick',count=-2}};check(not Phone.JobSchema.validate(v))
 v=copy(d);v.unknownEvent='pay';v.steps[1].code='unsafe';local sanitized=assert(Phone.JobSchema.validate(v));eq(sanitized.unknownEvent,nil);eq(sanitized.steps[1].code,nil)
 local saved=good(action(1,{action='save',definition=d,revision=0}));eq(saved.definition.revision,1);eq(#transactions,1)
 bad(action(1,{action='save',definition=d,revision=0}),'Stale revision denied');eq(#transactions,1)
 COORDS[1]=vector3(100,0,0);bad(action(1,{action='create',jobId=d.id,name='Far away'}));COORDS[1]=nil
 good(action(1,{action='create',jobId=d.id,name='Crew'}));local g=J.groups[J.bySource[1]];check(g);eq(g.members[2],nil)
 good(action(2,{action='request',groupId=g.id}));local offer=next(J.offers);check(offer);eq(g.members[2],nil,'Request is not consent')
 bad(action(3,{action='respond',offerId=offer,accept=true}),'Other source cannot accept');eq(g.members[2],nil)
 good(action(1,{action='respond',offerId=offer,accept=true}));check(g.members[2]);bad(action(1,{action='respond',offerId=offer,accept=true}),'No invitation replay')
 bad(action(2,{action='kick',target=1}),'Only leader may kick');bad(action(2,{action='start'}),'Only leader may start')
 bad(action(1,{action='start'}),'Readiness required');good(action(1,{action='ready',ready=true}));good(action(2,{action='ready',ready=true}));good(action(1,{action='start'}));eq(g.status,'active')
 local payload={action='begin',run=g.run,step=1};bad(rpc('peak-phone:Jobs:Task',3,payload),'Outsider denied')
 COORDS[1]=vector3(50,0,0);bad(rpc('peak-phone:Jobs:Task',1,payload),'Position verified');COORDS[1]=nil
 local ticket=good(rpc('peak-phone:Jobs:Task',1,payload));bad(rpc('peak-phone:Jobs:Task',2,payload),'One ticket owner')
 payload.action='finish';payload.token=ticket.token;bad(rpc('peak-phone:Jobs:Task',1,payload),'Premature finish');eq(#MONEY_WRITES,0)
 bad(rpc('peak-phone:Jobs:Task',2,payload),'Stolen ticket rejected');CLOCK=CLOCK+2100;good(rpc('peak-phone:Jobs:Task',1,payload))
 eq(J.bySource[1],nil);eq(J.bySource[2],nil);eq(#MONEY_WRITES,2);eq(MONEY[1].cash,325);eq(MONEY[2].cash,325)
 bad(rpc('peak-phone:Jobs:Task',1,payload),'Final task replay rejected');eq(#MONEY_WRITES,2)
 for _,row in pairs(journal)do eq(row.status,'paid');eq(row.amount,125)end
 eq(Phone.getPlayer(1).PlayerData.job.name,'police','Contracts do not overwrite framework role')
 good(action(1,{action='create',jobId=d.id,name='Cooldown check'}));good(action(1,{action='ready',ready=true}));bad(action(1,{action='start'}),'Cooldown survives same-player rerun');good(action(1,{action='leave'}))
 -- No payout occurs when a vehicle native throws. Owned partial entities are cleaned up.
 d.vehicle={model='adder',type='automobile',spawn={x=0,y=0,z=0,w=0}};good(action(1,{action='save',definition=d,revision=1}));CLOCK=CLOCK+200000
 good(action(1,{action='create',jobId=d.id,name='Vehicle failure'}));good(action(1,{action='ready',ready=true}));CreateVehicleServerSetter=function()error('mock native failure')end
 bad(action(1,{action='start'}),'Native exception returned as failure');eq(J.bySource[1],nil);eq(#MONEY_WRITES,2)
 -- Scope changes cancel a run before further tasks/rewards.
 d.vehicle=nil;good(action(1,{action='save',definition=d,revision=2}));good(action(1,{action='create',jobId=d.id,name='Bucket cleanup'}));good(action(1,{action='ready',ready=true}));good(action(1,{action='start'}))
 BUCKETS[1]=10;local oldWait=Wait;Wait=function()coroutine.yield()end;local co=coroutine.create(watchdog);assert(coroutine.resume(co));assert(coroutine.resume(co));Wait=oldWait
 eq(J.bySource[1],nil,'Bucket change cancelled');eq(#MONEY_WRITES,2);BUCKETS[1]=nil
 -- Database failure is fail-closed and cannot acknowledge a saved job.
 PhoneDB.transaction=function()return false end;bad(action(1,{action='save',definition=d,revision=3}));eq(J.definitions[d.id].revision,3)
 IsPlayerAceAllowed=function()return false end
end
