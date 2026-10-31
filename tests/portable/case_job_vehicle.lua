for _,framework in ipairs({'qbcore','qbox','esx'}) do
 base(framework);addPlayer(1,'A');COORDS={};BUCKETS={};CLOCK=CLOCK+100000
 if framework=='esx' then Phone.inventorySlot=function(_,slot)return {Name='phone',Amount=1,Slot=slot,Info={test=true}}end end
 local alive,setup,removed,plate={},nil,0,nil;local gives,takes=0,0
 CreateVehicleServerSetter=function()alive[99]=true;return 99 end
 DoesEntityExist=function(e)return alive[e]==true end
 DeleteEntity=function(e)alive[e]=nil end
 SetEntityRoutingBucket=function(e,b)eq(e,99);eq(b,0)end
 SetEntityOrphanMode=function()end
 SetVehicleNumberPlateText=function(_,s)plate=s end
 NetworkGetNetworkIdFromEntity=function(e)return e+1000 end
 GetVehiclePedIsIn=function()return 0 end
 if framework=='qbox' then STARTED.qbx_vehiclekeys=true;resource('qbx_vehiclekeys',{GiveKeys=function(_,src,e)eq(src,1);eq(e,99);gives=gives+1 end,RemoveKeys=function(_,src,e)eq(src,1);eq(e,99);takes=takes+1 end})end
 PhoneJobVehicleSetup=function(e,n,p,m)setup={e,n,p,m};return true end
 PhoneJobVehicleCleanup=function(e,n,p)removed=removed+1;eq(e,99);eq(n,1099);eq(p,plate)end
 loadrel('jobs/settings.lua');loadrel('jobs/validation.lua');loadrel('jobs/server.lua');local J=Phone.Jobs;J.ready=true
 local d=assert(Phone.JobSchema.validate({id='vehicle_job',name='Assigned van',description='',enabled=true,hub={x=0,y=0,z=0},reward=100,account='cash',minMembers=1,maxMembers=1,timeoutMinutes=5,vehicle={model='speedo',type='automobile',spawn={x=1,y=1,z=0}},steps={{label='Park here',type='drive',duration=2,radius=3,coords={x=0,y=0,z=0}}}}));d.revision=1;J.definitions[d.id]=d
 local function action(a)CLOCK=CLOCK+4000;return rpc('peak-phone:Jobs:Action',1,a)end
 check(action({action='create',jobId=d.id,name='Crew'}).Success);check(action({action='ready',ready=true}).Success);check(action({action='start'}).Success)
 eq(setup[1],99);eq(setup[2],1099);eq(setup[3],plate);eq(setup[4][1],1);check(#plate<=8);check(plate:match('^PJ'))
 local g=J.groups[J.bySource[1]];local t={action='begin',run=g.run,step=1}
 eq(rpc('peak-phone:Jobs:Task',1,t).Success,false,'No driving step on foot');GetVehiclePedIsIn=function()return 99 end
 check(rpc('peak-phone:Jobs:Task',1,t).Success,'Assigned entity accepted');check(action({action='cancel'}).Success)
 eq(removed,1);eq(alive[99],nil);eq(#MONEY_WRITES,0)
 if framework=='qbox'then eq(gives,1);eq(takes,1)end
 PhoneJobVehicleSetup=nil;PhoneJobVehicleCleanup=nil
end
