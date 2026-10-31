if not Phone.legacyAvailable('armazoon') then return end
-- Armazoon: Claim delivery from mail button (server event is invoked from client)
RegisterNUICallback("Armazoon/ClaimDelivery", function(Data, Cb)
    local orderId = Data and (Data.orderId or Data.OrderId)
    if orderId then
        TriggerServerEvent("peak-armazoon:Server:ClaimDelivery", orderId)
    end
    Cb({})
end)
