RegisterNUICallback('Crypto/GetCrypto',function(_,cb)
    cb(type(Config)=='table' and type(Config.Crypto)=='table' and Config.Crypto or {})
end)

RegisterNUICallback('Crypto/GetOperation',function(data,cb)
    local result=Peak.SendCallback('peak-phone:Server:Crypto:GetOperation',data)
    if type(result)~='table' then return cb({__phoneError=true,error='The in-game wallet status could not be read.'}) end
    cb(result)
end)

for _,operation in ipairs({'BuyCrypto','SellCrypto','TransferCrypto'}) do
    RegisterNUICallback('Crypto/'..operation,function(data,cb)
        local result=Peak.SendCallback('peak-phone:Server:Crypto:'..operation,data)
        if type(result)~='table' then return cb({__phoneError=true,error='The wallet did not return a transaction result. Keep the reference and check its status before trying again.'}) end
        if result.Success==true then UpdatePlayerData() end
        cb(result)
    end)
end
