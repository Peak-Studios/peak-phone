Peak = Peak or PhonePeak

local PeakifySessions = {}
local PeakifyFollowThreads = {}
local PeakifyPlacement = {
    Active = false,
    Slot = nil,
    Ghost = nil,
}
local PeakifyCarrying = {
    Active = false,
    Slot = nil,
    Handle = nil,
}

local function PeakifySoundId(NetworkId)
    return "peakify_" .. tostring(NetworkId or ""):gsub("[^%w_%-]", "_")
end
local function OutputVolume(session)
    local volume=session.Volume or .35
    if session.NetworkId==CurrentNetwork and Phone.MediaOutput then
        volume=volume*(Phone.MediaOutput.Powered and Phone.MediaOutput.Volume or 0)
    end
    return volume
end
function Phone.refreshMusicOutput()
    if not Phone.started('xsound') then return end
    for network,session in pairs(PeakifySessions) do
        local sound=PeakifySoundId(network)
        if exports.xsound:soundExists(sound) then exports.xsound:setVolume(sound,OutputVolume(session)) end
    end
end

local function DestroyPeakifySound(NetworkId)
    if not Phone.started("xsound") then return end
    local SoundId = PeakifySoundId(NetworkId)
    if exports.xsound:soundExists(SoundId) then
        exports.xsound:Destroy(SoundId)
    end
end

local function EnsurePeakifyFollowThread(Session)
    if not Session or not Session.EntityNetId then return end
    if PeakifyFollowThreads[Session.NetworkId] then return end

    PeakifyFollowThreads[Session.NetworkId] = true

    Citizen.CreateThread(function()
        local SoundId = PeakifySoundId(Session.NetworkId)
        while Phone.started("xsound") and PeakifySessions[Session.NetworkId] and exports.xsound:soundExists(SoundId) do
            local Entity = NetworkGetEntityFromNetworkId(Session.EntityNetId)
            if Entity ~= 0 and DoesEntityExist(Entity) then
                exports.xsound:Position(SoundId, GetEntityCoords(Entity))
            end
            Citizen.Wait(500)
        end

        PeakifyFollowThreads[Session.NetworkId] = nil
    end)
end

local function PlayPeakifySession(Session)
    if not Phone.started("xsound") then return end
    if not Session or not Session.NetworkId or not Session.Url then return end

    PeakifySessions[Session.NetworkId] = Session

    local SoundId = PeakifySoundId(Session.NetworkId)
    local Coords = Session.Coords and vector3(Session.Coords.x + 0.0, Session.Coords.y + 0.0, Session.Coords.z + 0.0) or GetEntityCoords(PlayerPedId())

    if exports.xsound:soundExists(SoundId) then
        exports.xsound:Destroy(SoundId)
    end

    exports.xsound:PlayUrlPos(SoundId, Session.Url, OutputVolume(Session), Coords, true)
    exports.xsound:Distance(SoundId, Session.Radius or 25.0)
    exports.xsound:setVolume(SoundId, OutputVolume(Session))

    if Session.Paused then
        exports.xsound:Pause(SoundId)
    end

    EnsurePeakifyFollowThread(Session)
end

local function StopPeakifyPlacement()
    PeakifyPlacement.Active = false
    PeakifyPlacement.Slot = nil

    if PeakifyPlacement.Ghost and DoesEntityExist(PeakifyPlacement.Ghost) then
        DeleteEntity(PeakifyPlacement.Ghost)
    end

    PeakifyPlacement.Ghost = nil
end

local function StartPeakifyPlacement(Slot)
    if PeakifyPlacement.Active then
        StopPeakifyPlacement()
    end

    local Model = GetHashKey("prop_boombox_01")
    RequestModel(Model)
    while not HasModelLoaded(Model) do
        Citizen.Wait(10)
    end

    PeakifyPlacement.Active = true
    PeakifyPlacement.Slot = Slot
    PeakifyPlacement.Ghost = CreateObject(Model, 0.0, 0.0, 0.0, false, false, false)
    SetEntityAlpha(PeakifyPlacement.Ghost, 180, false)
    SetEntityCollision(PeakifyPlacement.Ghost, false, false)

    Peak.Functions.Notify("Aim at the ground and press E to place your boombox. Backspace cancels.", "primary")

    Citizen.CreateThread(function()
        while PeakifyPlacement.Active do
            local Ped = PlayerPedId()
            local PlayerCoords = GetEntityCoords(Ped)
            local Hit, Pos = PhoneServices['peak-ui']:RayCastGamePlayCamera(6.0)
            local CanPlace = Hit and #(PlayerCoords - Pos) <= 4.5

            DisableControlAction(0, 24, true)
            DisableControlAction(0, 25, true)
            DisableControlAction(0, 140, true)
            DisableControlAction(0, 141, true)
            DisableControlAction(0, 142, true)
            DisableControlAction(0, 38, true)
            DisableControlAction(0, 177, true)

            if Hit then
                SetEntityCoordsNoOffset(PeakifyPlacement.Ghost, Pos.x, Pos.y, Pos.z, false, false, false)
                PlaceObjectOnGroundProperly(PeakifyPlacement.Ghost)
                SetEntityHeading(PeakifyPlacement.Ghost, GetEntityHeading(Ped))

                DrawMarker(
                    0,
                    Pos.x, Pos.y, Pos.z + 0.5,
                    0.0, 0.0, 0.0,
                    0.0, 0.0, 0.0,
                    0.15, 0.15, 0.15,
                    CanPlace and 80 or 220,
                    CanPlace and 220 or 80,
                    120,
                    180,
                    false, false, 2, false, nil, nil, false
                )
            end

            if CanPlace and IsDisabledControlJustReleased(0, 38) then
                local GhostCoords = GetEntityCoords(PeakifyPlacement.Ghost)
                local Heading = GetEntityHeading(PeakifyPlacement.Ghost)
                local Result = Peak.SendCallback("peak-phone:Server:Peakify:PlaceBoombox", {
                    Slot = PeakifyPlacement.Slot,
                    Coords = {
                        x = GhostCoords.x,
                        y = GhostCoords.y,
                        z = GhostCoords.z,
                    },
                    Heading = Heading,
                })

                if Result and Result.Success then
                    Peak.Functions.Notify("Boombox placed.", "success")
                else
                    Peak.Functions.Notify(Result and Result.Message or "Could not place the boombox.", "error")
                end

                StopPeakifyPlacement()
                break
            end

            if IsDisabledControlJustReleased(0, 177) then
                StopPeakifyPlacement()
                break
            end

            Citizen.Wait(0)
        end

        SetModelAsNoLongerNeeded(Model)
    end)
end

local function StopPeakifyCarry()
    if not PeakifyCarrying.Active then return end

    PeakifyCarrying.Active = false
    PeakifyCarrying.Slot = nil

    if PeakifyCarrying.Handle and DoesEntityExist(PeakifyCarrying.Handle) then
        DeleteEntity(PeakifyCarrying.Handle)
    end
    PeakifyCarrying.Handle = nil

    ClearPedTasks(PlayerPedId())
end

local function StartPeakifyCarry(Slot)
    if PeakifyCarrying.Active then
        StopPeakifyCarry()
    end

    local Success = Peak.SendCallback("peak-phone:Server:Peakify:StartCarry", { Slot = Slot })
    if not Success then
        return Peak.Functions.Notify("Could not carry the boombox.", "error")
    end

    local Model = GetHashKey("prop_boombox_01")
    RequestModel(Model)
    while not HasModelLoaded(Model) do
        Citizen.Wait(10)
    end

    local Ped = PlayerPedId()
    local Coords = GetEntityCoords(Ped)
    
    PeakifyCarrying.Active = true
    PeakifyCarrying.Slot = Slot
    PeakifyCarrying.Handle = CreateObject(Model, Coords.x, Coords.y, Coords.z, true, true, false)
    
    -- Attach to shoulder (roughly)
    -- Bone: 24818 (Spine3)
    AttachEntityToEntity(PeakifyCarrying.Handle, Ped, GetPedBoneIndex(Ped, 24818), 0.1, -0.15, 0.35, -10.0, 100.0, 90.0, true, true, false, true, 1, true)

    Peak.Functions.Notify("You are now carrying a boombox. Use the phone to play music. Drop it via the inventory or command.", "success")

    local AnimDict = "anim@heists@box_carry@"
    RequestAnimDict(AnimDict)
    while not HasAnimDictLoaded(AnimDict) do
        Citizen.Wait(10)
    end

    Citizen.CreateThread(function()
        while PeakifyCarrying.Active do
            if not IsEntityPlayingAnim(Ped, AnimDict, "idle", 3) then
                TaskPlayAnim(Ped, AnimDict, "idle", 5.0, 5.0, -1, 49, 1.0, 0, 0, 0)
            end

            -- Restrictions
            DisableControlAction(0, 21, true) -- Sprint
            DisableControlAction(0, 22, true) -- Jump
            DisableControlAction(0, 23, true) -- Enter Vehicle
            DisableControlAction(0, 25, true) -- Aim
            DisableControlAction(0, 24, true) -- Attack

            if IsPedInAnyVehicle(Ped, false) or IsEntityDead(Ped) then
                StopPeakifyCarry()
                Peak.SendCallback("peak-phone:Server:Peakify:StopCarry")
                break
            end

            Citizen.Wait(0)
        end
        
        RemoveAnimDict(AnimDict)
        SetModelAsNoLongerNeeded(Model)
    end)
end

local function SyncPeakifySessions()
    local Sessions = Peak.SendCallback("peak-phone:Server:Peakify:GetSessions")
    if type(Sessions) ~= "table" then return end

    for i = 1, #Sessions do
        PlayPeakifySession(Sessions[i])
    end
end

RegisterNUICallback("Peakify/GetState", function(Data, Cb)
    Cb(Peak.SendCallback("peak-phone:Server:Peakify:GetState"))
end)

RegisterNUICallback("Peakify/GetSessions", function(Data, Cb)
    Cb(Peak.SendCallback("peak-phone:Server:Peakify:GetSessions"))
end)

RegisterNUICallback("Peakify/GetDeviceState", function(Data, Cb)
    Cb(Peak.SendCallback("peak-phone:Server:Peakify:GetDeviceState", Data))
end)

RegisterNUICallback("Peakify/SaveTrack", function(Data, Cb)
    Cb(Peak.SendCallback("peak-phone:Server:Peakify:SaveTrack", Data))
end)

RegisterNUICallback("Peakify/DeleteTrack", function(Data, Cb)
    Cb(Peak.SendCallback("peak-phone:Server:Peakify:DeleteTrack", Data))
end)

RegisterNUICallback("Peakify/CreatePlaylist", function(Data, Cb)
    Cb(Peak.SendCallback("peak-phone:Server:Peakify:CreatePlaylist", Data))
end)

RegisterNUICallback("Peakify/DeletePlaylist", function(Data, Cb)
    Cb(Peak.SendCallback("peak-phone:Server:Peakify:DeletePlaylist", Data))
end)

RegisterNUICallback("Peakify/AddTrackToPlaylist", function(Data, Cb)
    Cb(Peak.SendCallback("peak-phone:Server:Peakify:AddTrackToPlaylist", Data))
end)

RegisterNUICallback("Peakify/RemoveTrackFromPlaylist", function(Data, Cb)
    Cb(Peak.SendCallback("peak-phone:Server:Peakify:RemoveTrackFromPlaylist", Data))
end)

RegisterNUICallback("Peakify/AddCollaborator", function(Data, Cb)
    Cb(Peak.SendCallback("peak-phone:Server:Peakify:AddCollaborator", Data))
end)

RegisterNUICallback("Peakify/RemoveCollaborator", function(Data, Cb)
    Cb(Peak.SendCallback("peak-phone:Server:Peakify:RemoveCollaborator", Data))
end)

RegisterNUICallback("Peakify/Play", function(Data, Cb)
    Cb(Peak.SendCallback("peak-phone:Server:Peakify:Play", Data))
end)

RegisterNUICallback("Peakify/Pause", function(Data, Cb)
    Cb(Peak.SendCallback("peak-phone:Server:Peakify:Pause", Data))
end)

RegisterNUICallback("Peakify/Volume", function(Data, Cb)
    Cb(Peak.SendCallback("peak-phone:Server:Peakify:Volume", Data))
end)

RegisterNUICallback("Peakify/Stop", function(Data, Cb)
    Cb(Peak.SendCallback("peak-phone:Server:Peakify:Stop", Data))
end)

RegisterNetEvent('Peak:Client:OnPlayerLoaded')
AddEventHandler('Peak:Client:OnPlayerLoaded', function()
    Citizen.SetTimeout(2500, function()
        SyncPeakifySessions()
    end)
end)

RegisterNetEvent("peak-phone:Client:Peakify:UseBoombox")
AddEventHandler("peak-phone:Client:Peakify:UseBoombox", function(Slot)
    if IsPedInAnyVehicle(PlayerPedId(), false) then
        return Peak.Functions.Notify("Step out of the vehicle before managing the boombox.", "error")
    end

    PhoneServices['peak-ui']:OpenContextMenu({
        MainMenuItems = {
            {
                Title = 'Place on Ground',
                Desc = 'Find a spot to place your speakers.',
                Icon = 'location-dot',
                Data = {
                    Event = 'peak-phone:Client:Peakify:Internal:BeginPlacement',
                    Args = { { Slot = Slot } }
                }
            },
            {
                Title = 'Carry on Shoulder',
                Desc = 'Walk around with your music.',
                Icon = 'person-walking-luggage',
                Data = {
                    Event = 'peak-phone:Client:Peakify:Internal:BeginCarry',
                    Args = { { Slot = Slot } }
                }
            }
        }
    })
end)

AddEventHandler("peak-phone:Client:Peakify:Internal:BeginPlacement", function(Data)
    StartPeakifyPlacement(Data.Slot)
end)

AddEventHandler("peak-phone:Client:Peakify:Internal:BeginCarry", function(Data)
    StartPeakifyCarry(Data.Slot)
end)

RegisterNetEvent("peak-phone:Client:Peakify:PlaySession")
AddEventHandler("peak-phone:Client:Peakify:PlaySession", function(Session)
    PlayPeakifySession(Session)
end)

RegisterNetEvent("peak-phone:Client:Peakify:PauseSession")
AddEventHandler("peak-phone:Client:Peakify:PauseSession", function(Data)
    local Session = PeakifySessions[Data.NetworkId]
    if not Session then return end

    Session.Paused = Data.Paused == true

    local SoundId = PeakifySoundId(Data.NetworkId)
    if not exports.xsound:soundExists(SoundId) then return end

    if Session.Paused then
        exports.xsound:Pause(SoundId)
    else
        exports.xsound:Resume(SoundId)
    end
end)

RegisterNetEvent("peak-phone:Client:Peakify:VolumeSession")
AddEventHandler("peak-phone:Client:Peakify:VolumeSession", function(Data)
    if source ~= 65535 or type(Data) ~= 'table' or type(Data.NetworkId) ~= 'string' then return end
    local Volume = Data.Volume
    if type(Volume) ~= 'number' or Volume ~= Volume or Volume < 0 or Volume > 1 then return end
    local Session = PeakifySessions[Data.NetworkId]
    if not Session then return end
    Session.Volume = Volume
    if not Phone.started('xsound') then return end
    local SoundId = PeakifySoundId(Data.NetworkId)
    if exports.xsound:soundExists(SoundId) then exports.xsound:setVolume(SoundId, OutputVolume(Session)) end
end)

RegisterNetEvent("peak-phone:Client:Peakify:StopSession")
AddEventHandler("peak-phone:Client:Peakify:StopSession", function(Data)
    PeakifySessions[Data.NetworkId] = nil
    DestroyPeakifySound(Data.NetworkId)
end)

RegisterNetEvent("peak-ui:Ready")
AddEventHandler("peak-ui:Ready", function()
    PhoneServices['peak-ui']:AddEyeEntry(GetHashKey("prop_boombox_01"), {
        Type = 'Model',
        Model = "prop_boombox_01",
        SpriteDistance = 7.0,
        Distance = 2.0,
        Options = {
            {
                Name = 'pickup_peakify_boombox',
                Icon = 'fas fa-box-open',
                Label = 'Pick up Boombox',
                EventType = 'Client',
                EventName = 'peak-phone:Client:Peakify:PickupBoombox',
                EventParams = {},
                Enabled = function()
                    return true
                end,
            },
        }
    })
end)

RegisterNetEvent("peak-phone:Client:Peakify:PickupBoombox")
AddEventHandler("peak-phone:Client:Peakify:PickupBoombox", function(Data, Entity)
    if not Entity or Entity == 0 then return end

    local NetId = NetworkGetNetworkIdFromEntity(Entity)
    local Success = Peak.SendCallback("peak-phone:Server:Peakify:PickupBoombox", {
        NetId = NetId
    })

    if Success then
        Peak.Functions.Notify("Boombox packed up.", "success")
    else
        Peak.Functions.Notify("You can only pick up your own nearby boombox.", "error")
    end
end)

AddEventHandler("onResourceStart", function(ResourceName)
    if ResourceName ~= GetCurrentResourceName() then return end
    Citizen.SetTimeout(2500, function()
        SyncPeakifySessions()
    end)
end)

AddEventHandler("onResourceStop", function(ResourceName)
    if ResourceName ~= GetCurrentResourceName() then return end

    StopPeakifyPlacement()
    StopPeakifyCarry()

    for NetworkId in pairs(PeakifySessions) do
        DestroyPeakifySound(NetworkId)
    end
end)

-- The UI already exposes this action; use the existing server-authoritative carry operation.
RegisterNUICallback("Peakify/StopCarry", function(_, Cb)
    local Result = Peak.SendCallback("peak-phone:Server:Peakify:StopCarry")
    Cb(Result)
end)
