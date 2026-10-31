-- Equipped hardware selects its own device identity and never inherits a PIN
-- session from the previously equipped phone.
base('qbcore');loadrel('config.lua');loadrel('sv_config.lua');addPlayer(1,'OWNER')
local session={citizenid='OWNER',device_id='DUO-OLD',generation=7,unlocked=1}
local equipped='DUO-NEW'
local allowed=true
local writes=0
Phone.inventorySlot=function(_,slot)
    if slot~=107 or not equipped then return nil end
    return {Name='phone',Amount=1,Info={device_id=equipped},Slot=107}
end
Phone.findDeviceItem=function(_,id)return equipped==id and {Mode='unique',Slot=107} or nil end
PhoneDB.one=function(sql,args)
    if sql:find('peak_phone_characters',1,true) then
        return {citizenid='OWNER',phone_number='5550000001',charinfo={firstname='Test',lastname='Citizen'},metadata={},crypto={}}
    end
    if sql:find('peak_phone_device_sessions',1,true) then return copy(session) end
    if sql:find('CASE WHEN d.owner_citizenid',1,true) and allowed then
        return {device_id=args[4],owner_citizenid='OWNER',status='active',inventory_mode='unique',pin_hash='existing-pin'}
    end
end
PhoneDB.update=function(sql,args)
    check(sql:find('unlocked=0',1,true),'new hardware invalidates prior unlock')
    writes=writes+1
    session.device_id=args[2];session.generation=session.generation+1;session.unlocked=0
    return 1
end
Phone.Server.Profiles.OWNER={citizenid='OWNER',phone_number='5550000001',charinfo={phone='5550000001'},metadata={},crypto={}}
loadrel('server/sv_devices.lua')
local selected=Phone.Devices.active(1)
eq(selected.DeviceId,'DUO-NEW','hardware identity follows the equipment slot')
eq(selected.Generation,8,'old device generation is retired')
check(selected.Locked,'replacement phone requires its PIN')
eq(writes,1,'one durable session update')
Phone.Devices.active(1);eq(writes,1,'stable equipment does not rewrite its session')
equipped=false;eq(Phone.Devices.active(1),nil,'unequipped phone cannot be active')
equipped='DUO-STOLEN';allowed=false
eq(Phone.Devices.active(1),nil,'inventory possession cannot bypass device ownership')
eq(writes,1,'unauthorized hardware does not replace the session')
local stoppedCall,stoppedLive
Phone.Calls={stopFor=function(src)stoppedCall=src end}
Phone.KiloLive={bySource={[1]='fixture-live'},stop=function(live)stoppedLive=live end}
equipped=false;INVENTORY[1].phone=0
EVENTS['peak-inventory:server:changed']({'player:qbcore:OWNER'})
eq(stoppedCall,1,'unequipping stops the server call even if client hangup is rejected')
eq(stoppedLive,'fixture-live','unequipping stops the server livestream')
eq(EMITTED[#EMITTED].name,'peak-phone:portable:inventoryChanged','client equipment snapshot is refreshed')
