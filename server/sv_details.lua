Peak.Functions.CreateCallback('peak-phone:Server:Details:GetLicenses',function(src,cb)
    local p=Peak.Functions.GetPlayer(src);if not p then return cb({}) end
    if PhoneIntegration.GetLicenses then return cb(PhoneIntegration.GetLicenses(src,p.PlayerData.citizenid)) end
    local licenses=Phone.copy(p.PlayerData.metadata.licenses or {})
    if Phone.framework()=='esx' then
        local exists=PhoneDB.one('SELECT COUNT(*) n FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?',{'user_licenses'})
        if exists and tonumber(exists.n)>0 then
            for _,r in ipairs(PhoneDB.query('SELECT type FROM user_licenses WHERE owner=?',{p.PlayerData.citizenid})) do licenses[r.type]=true end
            licenses.driver=licenses.driver or licenses.drive or false
        end
    end
    cb(licenses)
end)
