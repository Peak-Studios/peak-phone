if not Phone.legacyAvailable('busdriver') then return end
local Peak = PhonePeak
local PlayerData = {}

AddEventHandler("Peak:Client:OnPlayerLoaded", function()
    PlayerData = Peak.Functions.GetPlayerData()
end)

AddEventHandler("Peak:Client:OnPlayerUnload", function()
    PlayerData = {}
end)

RegisterNetEvent("Peak:Client:OnPlayerUpdate", function(data)
    PlayerData = data
end)

RegisterNUICallback("BusDriver/GetData", function(Data, Cb)
    print("DEBUG: BusDriver/GetData NUI Callback triggered")
    local cid = PlayerData and PlayerData.citizenid
    if not cid then 
        print("DEBUG: No CID found")
        return Cb({ success = false }) 
    end

    print("DEBUG: Triggering peak-busdriver:Server:GetData")
    Peak.Functions.TriggerCallback('peak-busdriver:Server:GetData', function(result)
        print("DEBUG: Server Callback returned: ", result)
        if result then
            Cb({ success = true, data = result })
        else
            Cb({ success = false })
        end
    end)
end)

