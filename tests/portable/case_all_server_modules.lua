base('qbcore');Citizen.CreateThread=CreateThread;Citizen.Wait=Wait
loadrel('config.lua');loadrel('sv_config.lua');addPlayer(1,'BOOTSTRAP')
loadrel('jobs/settings.lua');loadrel('jobs/validation.lua');loadrel('shared/kilogram-live.lua');loadrel('bridge/wallet.lua');loadrel('integrations/server.lua')
local manifest=LoadResourceFile('peak-phone','fxmanifest.lua')
for file in manifest:gmatch("'(server/[^']+%.lua)'")do loadrel(file);TEST_COUNT=TEST_COUNT+1 end
local n=0;for _ in pairs(Phone.Server.Callbacks)do n=n+1 end
eq(n,225,'callbacks actually registered, count='..n)
for _,name in ipairs({'GetSocialState','MarkNotificationsRead','ToggleRepost','DeletePost'}) do check(Phone.Server.Callbacks['peak-phone:Server:Y:'..name],'new Y route '..name) end
for _,route in ipairs({'peak-phone:Server:Messages:GetInbox','peak-phone:Server:Messages:GetHistoryAround','peak-phone:Server:Messages:SetReaction','peak-phone:Server:Groups:GetMessagesAround','peak-phone:Server:Groups:SetReaction'}) do check(Phone.Server.Callbacks[route],'Messages route '..route) end
eq(Phone.framework(),'qbcore');check(Phone.capabilities(1).calculator.available);eq(Phone.capabilities(1).housing.available,false)
-- Stock fresh-core initialization must not call unavailable peak-* resource exports.
local p=rpc('peak-phone:portable:bootstrap',1);check(p and p.PlayerData.citizenid=='BOOTSTRAP');check(p.HasPhone)

-- App RPCs retain the explicit source across SQL yields and return saved state.
local savedQuery=PhoneDB.query
local appRows={}
PhoneDB.query=function(sql,params)
    source=nil
    if sql:match('INSERT IGNORE INTO phone_installed_apps') then appRows[params[2]]=true
    elseif sql:match('DELETE FROM phone_installed_apps') then appRows[params[2]]=nil
    elseif sql:match('SELECT app_id FROM phone_installed_apps') then
        local rows={};for id in pairs(appRows) do rows[#rows+1]={app_id=id} end;return rows
    else error('Unexpected app query: '..sql) end
    return {affectedRows=1}
end
local result=rpc('peak-phone:Server:InstallApp',1,'binge')
check(result.Success);check(result.InstalledApps.binge)
result=rpc('peak-phone:Server:InstallApp',1,'binge');check(result.Success,'idempotent install')
result=rpc('peak-phone:Server:UninstallApp',1,'binge');check(result.Success);eq(result.InstalledApps.binge,nil)
result=rpc('peak-phone:Server:InstallApp',1,'unknown-app');eq(result.Success,false)
PhoneDB.query=function()error('database unavailable')end
local ok=pcall(rpc,'peak-phone:Server:InstallApp',1,'binge');eq(ok,false,'SQL errors reach RPC error response')
PhoneDB.query=savedQuery
