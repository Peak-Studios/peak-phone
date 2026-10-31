base('qbcore');loadrel('config.lua');loadrel('sv_config.lua');addPlayer(1,'OWNER');addPlayer(2,'BORROWER')
local locked=false;local generation=7;local failBackup=false;local writes={};local transactions={};local contactCount=1;local existing={}
Phone.Devices={active=function()return {DeviceId='DUO-OWNER',Generation=generation,Locked=locked,Status='active'}end}
local saved=json.encode({{name='Alice',phone='5550102'}})
PhoneDB.one=function(sql,args)
 if sql:find('SELECT * FROM peak_phone_devices',1,true) then return args[2]=='OWNER' and {device_id='DUO-OWNER',inventory_mode='count',owner_citizenid='OWNER'} or nil end
 if sql:find('SELECT contacts,preferences',1,true) then return args[1]==12 and args[2]=='OWNER' and {contacts=saved,preferences=json.encode({['Phone.DisableMovement']=true})} or nil end
 if sql:find('COUNT(*) n FROM phone_contacts',1,true) then return {n=contactCount} end
end
PhoneDB.query=function(sql,args)if sql:find('SELECT name,phone',1,true)then return {{name='Alice',phone='5550102'}}end;if sql:find('SELECT phone FROM phone_contacts',1,true)then return existing end;return {}end
PhoneDB.insert=function(sql,args)writes[#writes+1]={sql=sql,args=copy(args)};if not failBackup then return 12 end end
PhoneDB.update=function(sql,args)writes[#writes+1]={sql=sql,args=copy(args)};return 1 end
PhoneDB.transaction=function(statements)transactions[#transactions+1]=copy(statements);return true end
loadrel('server/sv_device_backup.lua')
check(not rpc('peak-phone:devices:backup',2,{Generation=7}).Success,'borrowers cannot back up owner data')
locked=true;check(not rpc('peak-phone:devices:backup',1,{Generation=7}).Success,'locked backup fails closed')
check(not rpc('peak-phone:devices:reset',1,{Generation=6,Confirm='RESET'}).Success,'stale reset cannot clear PIN')
check(not rpc('peak-phone:devices:reset',1,{Generation=7,Confirm='reset'}).Success,'reset requires explicit confirmation')
failBackup=true;check(not rpc('peak-phone:devices:reset',1,{Generation=7,Confirm='RESET'}).Success);eq(#transactions,0,'backup failure prevents reset')
failBackup=false;local reset=rpc('peak-phone:devices:reset',1,{Generation=7,Confirm='RESET'});check(reset.Success);eq(reset.BackupId,12)
eq(#transactions,1);eq(#transactions[1],2);check(transactions[1][1].query:find('pin_hash=NULL',1,true),'reset removes PIN')
for _,statement in ipairs(transactions[1])do check(not statement.query:find('phone_contacts',1,true),'reset preserves contacts')end
locked=false;check(not rpc('peak-phone:devices:restore',1,{Generation=7,BackupId=99}).Success,'foreign/missing backup rejected')
local restored=rpc('peak-phone:devices:restore',1,{Generation=7,BackupId=12});check(restored.Success);eq(restored.Preferences['Phone.DisableMovement'],true)
check(transactions[2][1].query:find('WHERE NOT EXISTS',1,true),'restore adds missing contacts only')
local backup=rpc('peak-phone:devices:backup',1,{Generation=7,Preferences={['Phone.DisableMovement']=false,secret='not a preference'}});check(backup.Success)
local prefs=json.decode(writes[#writes].args[4]);eq(prefs.secret,nil,'backup excludes unrecognized preferences');eq(prefs['Phone.DisableMovement'],false)
contactCount=1000;local transactionCount=#transactions
check(not rpc('peak-phone:devices:restore',1,{Generation=7,BackupId=12}).Success,'restore cannot exceed the readable 1000-contact limit')
eq(#transactions,transactionCount,'over-limit restore makes no writes')
existing={{phone='5550102'}}
check(rpc('peak-phone:devices:restore',1,{Generation=7,BackupId=12}).Success,'restoring existing contacts at the limit succeeds')
eq(#transactions,transactionCount,'existing contacts are not inserted again')
existing={};contactCount=998;saved=json.encode({{name='Alice',phone='5550102'},{name='Duplicate',phone='5550102'}})
check(rpc('peak-phone:devices:restore',1,{Generation=7,BackupId=12}).Success)
eq(#transactions[#transactions],1,'duplicate backup numbers add a single contact')
