local HoldState = false
local HoldAnim = { "cellphone@", "cellphone_text_read_base" }
local CallAnim = { "cellphone@", "cellphone_text_to_call" }

function StartPhoneAnim()
    if Phone.ShareDropActive or InCamera then return end
    local AnimTable = HoldAnim
    local Generation = Phone.Client.Generation
    local Started = GetGameTimer()

    RequestAnimDict(AnimTable[1])
    while not HasAnimDictLoaded(AnimTable[1]) do
        if (GetGameTimer() - Started) % 4294967296 >= 5000 or Generation ~= Phone.Client.Generation or not IsPhoneOpen then return end
        Citizen.Wait(10)
    end

    if Generation ~= Phone.Client.Generation or not IsPhoneOpen or not Phone.Client.Ready or InCamera then return end
    TaskPlayAnim(PlayerPedId(), AnimTable[1], AnimTable[2], 1.0, 3.0, -1, 49, 0, 0, 0, 0)
    PhoneServices['peak-assets']:AddProp("Phone")
end

function StopPhoneAnim()
    StopAnimTask(PlayerPedId(), HoldAnim[1], HoldAnim[2], 1.0)
    if not CallData or CallData.Dialing == nil then
        PhoneServices['peak-assets']:RemoveProp()
    end
end