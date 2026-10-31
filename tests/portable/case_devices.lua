-- Exercise the real device callbacks. These checks intentionally verify values
-- passed to SQL, not source strings, so the Phone.text boolean regression is caught.
base('qbcore');loadrel('config.lua');loadrel('sv_config.lua');addPlayer(1,'OWNER');addPlayer(2,'TARGET')
COORDS={[1]=vector3(0,0,0),[2]=vector3(1,0,0)}
local session={citizenid='OWNER',device_id='DUO-REAL',generation=7,unlocked=1}
local device={device_id='DUO-REAL',owner_citizenid='OWNER',label='Owner Duo',status='active',sim_id=nil,pin_hash=nil}
local sims={['SIM-REAL']={sim_id='SIM-REAL',phone_number='5550102',owner_citizenid='OWNER',inventory_issued=1}}
local writes={};local transactionResult=true;local transactionOwner='TARGET';local simQueryRows
PhoneDB.one=function(sql,args)
 if sql:find('peak_phone_device_sessions',1,true) then return session end
 if sql:find('CASE WHEN d.owner_citizenid',1,true) then local id=args[4];return id=='DUO-REAL' and device or nil end
 if sql:find('FROM sim_cards WHERE sim_id',1,true) then return sims[args[1]] end
 if sql:find('SELECT device_id FROM peak_phone_devices WHERE sim_id=?',1,true) then return device.sim_id==args[1] and {device_id=device.device_id} or nil end
 if sql:find('COUNT(*) n FROM sim_cards WHERE owner_citizenid',1,true) then return {n=0} end
 if sql:find('FROM sim_cards WHERE phone_number',1,true) then return nil end
 if sql:find('WHERE sim_id=? AND device_id<>?',1,true) then return nil end
 if sql:find('SELECT owner_citizenid',1,true) then return {owner_citizenid=transactionOwner} end
 if sql:find('SELECT device_id FROM peak_phone_devices WHERE device_id=? AND sim_id=?',1,true) then return {device_id=device.device_id} end
 if sql:find('SELECT device_id FROM peak_phone_devices WHERE device_id=? AND sim_id IS NULL',1,true) then return device.sim_id==nil and {device_id=device.device_id} or nil end
 if sql:find('COUNT(*) n FROM peak_phone_devices',1,true) then return {n=0} end
 return nil
end
PhoneDB.query=function(sql,args)
 if sql:find('SELECT d.device_id',1,true) then return {{device_id='DUO-REAL',label='Owner Duo',owner_citizenid='OWNER',status='active',access_type='owner'}} end
 if sql:find('SELECT s.sim_id',1,true) then return simQueryRows or {{sim_id='SIM-REAL',phone_number='5550102',owner_citizenid='OWNER'}} end
 return {}
end
PhoneDB.update=function(sql,args)
 writes[#writes+1]={sql=sql,args=copy(args)}
 if sql:find('UPDATE sim_cards SET inventory_issued=1',1,true) then local sim=sims[args[1]];if sim and sim.owner_citizenid==args[2] and tonumber(sim.inventory_issued or 0)==0 then sim.inventory_issued=1;return 1 end;return 0 end
 if sql:find('UPDATE sim_cards SET inventory_issued=0',1,true) then local sim=sims[args[1]];if sim and sim.owner_citizenid==args[2] and tonumber(sim.inventory_issued or 0)==1 then sim.inventory_issued=0;return 1 end;return 0 end
 if sql:find('DELETE FROM sim_cards',1,true) then local sim=sims[args[1]];if sim and sim.owner_citizenid==args[2] then sims[args[1]]=nil;return 1 end;return 0 end
 if sql:find('SET sim_id=?',1,true) and sql:find('peak_phone_devices',1,true) then device.sim_id=args[1] elseif sql:find('SET sim_id=NULL',1,true) then device.sim_id=nil end
 return 1
end
local simSequence=0;PhonePeak.Player.CreatePhoneNumber=function()simSequence=simSequence+1;return '555100'..string.format('%04d',simSequence) end
PhoneDB.insert=function(sql,args)
 if sql:find('INSERT INTO sim_cards',1,true) then sims[args[1]]={sim_id=args[1],phone_number=args[2],owner_citizenid=args[3],inventory_issued=0};return 1 end
 return 1
end
PhoneDB.transaction=function() return transactionResult end
loadrel('server/sv_simcard.lua');loadrel('server/sv_devices.lua')
Phone.carriedItems=function(_,name)
 if name=='phone' then return {{name='phone',count=1,slot=PhoneConfig.PhoneSlot,metadata={device_id='DUO-REAL'}}} end
 return {}
end
Phone.findDeviceItem=function(_,id)return id=='DUO-REAL' and {Mode='unique',Slot=PhoneConfig.PhoneSlot,Metadata={device_id=id}} or nil end
local inventory={[7]={Name='simcard',Amount=1,Info={sim_id='SIM-REAL',phone_number='5550102'},Slot=7}}
local inventoryMutations=0
Phone.inventorySlot=function(_,slot) if tonumber(slot)==PhoneConfig.PhoneSlot then return {Name='phone',Amount=1,Info={device_id='DUO-REAL'},Slot=PhoneConfig.PhoneSlot} end;return inventory[tonumber(slot)] end
Phone.findSimItem=function(_,id)for slot,item in pairs(inventory) do if item.Name==PhoneConfig.SimItem and item.Info.sim_id==id then return {Slot=slot,Metadata=item.Info} end end end
Phone.removeItem=function(_,name,count,slot)inventoryMutations=inventoryMutations+1;if name==PhoneConfig.PhoneItem then return true end;local item=inventory[tonumber(slot)];if item and item.Name==name then inventory[tonumber(slot)]=nil;return true end;return false end
Phone.addItem=function(_,name,count,metadata,slot)inventoryMutations=inventoryMutations+1;if name==PhoneConfig.PhoneItem then return true end;slot=tonumber(slot) or 99;if inventory[slot] then return false end;inventory[slot]={Name=name,Amount=count,Info=copy(metadata),Slot=slot};return true end
local selectResult=rpc('peak-phone:devices:select',1,{DeviceId='  DUO-REAL  '});check(selectResult.Success);eq(writes[#writes].args[1],'DUO-REAL','device selector must retain validated ID')
Phone.Server.Profiles.OWNER={citizenid='OWNER',phone_number='5550000001',charinfo={firstname='Test',lastname='Citizen'},metadata={},crypto={}}
writes={};local prepared=rpc('peak-phone:devices:simBegin',1,{Generation=7,Action='insert',SimId=' SIM-REAL '});check(prepared.Success);eq(#writes,0,'SIM begin must not mutate durable state')
local simResult=rpc('peak-phone:devices:simCommit',1,{Generation=7,OperationId=prepared.OperationId,Token=prepared.Token});check(simResult.Success);eq(writes[1].args[1],'SIM-REAL','SIM commit must retain validated ID')
local replay=rpc('peak-phone:devices:simCommit',1,{Generation=7,OperationId=prepared.OperationId,Token=prepared.Token});check(replay.Success);eq(writes[1].args[1],'SIM-REAL','SIM commit replay must be idempotent')
eq(inventory[7],nil,'successful insertion consumes the physical SIM item')
device.sim_id=nil;sims['SIM-REAL'].inventory_issued=1;inventory[7]={Name='simcard',Amount=1,Info={sim_id='SIM-REAL',phone_number='5550102'},Slot=7}
local originalGetPlayer=Phone.getPlayer;local currentCid='OWNER'
Phone.getPlayer=function(src)return {PlayerData={source=src,citizenid=currentCid,charinfo={phone='5550000001'}}}end
local originalOwner,originalDeviceSim=sims['SIM-REAL'].owner_citizenid,device.sim_id
currentCid='BORROWER';session.citizenid='BORROWER';device.sim_id='SIM-REAL'
local writesBeforeBorrower=#writes;local mutationsBeforeBorrower=inventoryMutations
local borrowerRemove=rpc('peak-phone:devices:simBegin',1,{Generation=7,Action='remove'});check(not borrowerRemove.Success,'borrower cannot remove the prior owner SIM')
local borrowerSwap=rpc('peak-phone:devices:simBegin',1,{Generation=7,Action='insert',SimId='SIM-BORROWER'});check(not borrowerSwap.Success,'borrower cannot replace the prior owner SIM')
eq(#writes,writesBeforeBorrower,'borrower SIM requests do not mutate SQL state');eq(inventoryMutations,mutationsBeforeBorrower,'borrower SIM requests do not mutate inventory')
session.citizenid='OWNER';currentCid='OWNER';device.sim_id=nil
local targetChanged=rpc('peak-phone:devices:simBegin',1,{Generation=7,Action='insert',SimId='SIM-REAL'});check(targetChanged.Success)
writesBeforeBorrower=#writes;mutationsBeforeBorrower=inventoryMutations;sims['SIM-REAL'].owner_citizenid='TARGET'
local targetCommit=rpc('peak-phone:devices:simCommit',1,{OperationId=targetChanged.OperationId,Token=targetChanged.Token});check(not targetCommit.Success,'commit rechecks requested SIM ownership')
eq(#writes,writesBeforeBorrower,'changed requested SIM owner is rejected before SQL mutation');eq(inventoryMutations,mutationsBeforeBorrower,'changed requested SIM owner is rejected before inventory mutation')
sims['SIM-REAL'].owner_citizenid=originalOwner
local previousSim={sim_id='SIM-OLD',phone_number='5550103',owner_citizenid='OWNER',inventory_issued=1};sims['SIM-OLD']=previousSim;inventory[7]={Name='simcard',Amount=1,Info={sim_id='SIM-REAL',phone_number='5550102'},Slot=7};device.sim_id='SIM-OLD'
local swapPrior=rpc('peak-phone:devices:simBegin',1,{Generation=7,Action='insert',SimId='SIM-REAL'});check(swapPrior.Success)
writesBeforeBorrower=#writes;mutationsBeforeBorrower=inventoryMutations;previousSim.owner_citizenid='TARGET'
local changedPrior=rpc('peak-phone:devices:simCommit',1,{OperationId=swapPrior.OperationId,Token=swapPrior.Token});check(not changedPrior.Success,'commit rechecks ownership of the previously inserted SIM')
eq(#writes,writesBeforeBorrower,'changed prior SIM owner is rejected before SQL mutation');eq(inventoryMutations,mutationsBeforeBorrower,'changed prior SIM owner is rejected before inventory mutation')
previousSim.owner_citizenid='OWNER';device.sim_id='SIM-REAL'
local removePrior=rpc('peak-phone:devices:simBegin',1,{Generation=7,Action='remove'});check(removePrior.Success)
writesBeforeBorrower=#writes;mutationsBeforeBorrower=inventoryMutations;sims['SIM-REAL'].owner_citizenid='TARGET'
local changedRemove=rpc('peak-phone:devices:simCommit',1,{OperationId=removePrior.OperationId,Token=removePrior.Token});check(not changedRemove.Success,'remove commit rechecks SIM ownership')
eq(#writes,writesBeforeBorrower,'changed remove SIM owner is rejected before SQL mutation');eq(inventoryMutations,mutationsBeforeBorrower,'changed remove SIM owner is rejected before inventory mutation')
sims['SIM-REAL'].owner_citizenid='OWNER';device.sim_id=nil
local foreign={sim_id='SIM-FOREIGN',phone_number='5550104',owner_citizenid='TARGET',inventory_issued=0};sims[foreign.sim_id]=foreign;simQueryRows={{sim_id=foreign.sim_id}}
writesBeforeBorrower=#writes;mutationsBeforeBorrower=inventoryMutations
check(not Phone.Devices.syncSimItems(1),'direct SIM sync refuses an unexpected foreign-owned row')
eq(#writes,writesBeforeBorrower,'direct sync ownership check happens before SQL mutation');eq(inventoryMutations,mutationsBeforeBorrower,'direct sync ownership check happens before inventory mutation')
simQueryRows=nil;sims[foreign.sim_id]=nil
local blank={Name='simcard',Amount=1,Info={manufacturer='Peak'},Slot=8};inventory[8]=blank
local blankBegin=rpc('peak-phone:devices:simBegin',1,{Generation=7,Action='insert',SimSlot=8});check(blankBegin.Success,'blank physical SIM can be provisioned')
local blankId=inventory[8].Info.sim_id;check(blankId and sims[blankId] and sims[blankId].owner_citizenid=='OWNER','provisioned SIM belongs to the current character')
check(inventory[8].Info.manufacturer=='Peak' and sims[blankId].inventory_issued==1,'provisioning stamps the same physical slot and preserves metadata')
rpc('peak-phone:devices:simCancel',1,{OperationId=blankBegin.OperationId,Token=blankBegin.Token})
local nextBlank={Name='simcard',Amount=1,Info={manufacturer='Peak'},Slot=9};inventory[9]=nextBlank
local moveBlankDuringCreate=false;local originalInsert=PhoneDB.insert
PhoneDB.insert=function(sql,args)local result=originalInsert(sql,args);if moveBlankDuringCreate and sql:find('INSERT INTO sim_cards',1,true) then inventory[9]={Name='phone',Amount=1,Info={device_id='DUO-REAL'},Slot=9} end;return result end
moveBlankDuringCreate=true;local cardCount=0;for _ in pairs(sims) do cardCount=cardCount+1 end;mutationsBeforeBorrower=inventoryMutations
local movedBlank=rpc('peak-phone:devices:simBegin',1,{Generation=7,Action='insert',SimSlot=9});moveBlankDuringCreate=false
local cardCountAfter=0;for _ in pairs(sims) do cardCountAfter=cardCountAfter+1 end
check(not movedBlank.Success and cardCountAfter==cardCount,'blank card is rolled back when the source slot changes during provisioning')
eq(inventoryMutations,mutationsBeforeBorrower,'slot revalidation happens before inventory mutation')
PhoneDB.insert=originalInsert;Phone.getPlayer=originalGetPlayer;session.citizenid='OWNER';device.sim_id=originalDeviceSim
Phone.Server.Profiles.OWNER={citizenid='OWNER',phone_number='5550000001',charinfo={firstname='Test',lastname='Citizen'},metadata={},crypto={}}
local emittedBeforeFailedTransfer=#EMITTED
transactionResult=false;local failed=rpc('peak-phone:devices:transfer',1,{Generation=7,Target=2});check(not failed.Success);eq(#EMITTED,emittedBeforeFailedTransfer,'failed transfer must not invalidate clients')
transactionResult=true;transactionOwner='TARGET';local moved=rpc('peak-phone:devices:transfer',1,{Generation=7,Target=2});check(moved.Success)
Phone.Server.Profiles.OWNER={citizenid='OWNER',phone_number='5550000001',charinfo={firstname='Test',lastname='Citizen'},metadata={},crypto={}}
writes={};local issued,payload=EXPORTED.IssueDevice(1,' My Custom Duo ');check(issued,tostring(payload));eq(payload.Label,'My Custom Duo');eq(writes[1].args[3],'My Custom Duo')
