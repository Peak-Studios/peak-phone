Peak = Peak or PhonePeak

Peakify = Peakify or {}
Peakify.Boomboxes = Peakify.Boomboxes or {}
Peakify.Carried = Peakify.Carried or {}
Peakify.ActiveSessions = Peakify.ActiveSessions or {}

local PeakifyConfig = {
    DefaultRadius = 25.0,
    DefaultVolume = 0.35,
    MaxRadius = 60.0,
    MinRadius = 8.0,
    ConnectDistanceBoombox = 4.0,
    ConnectDistanceVehicle = 6.0,
}

local function PeakifyNow()
    return os.time() * 1000
end

local function Clamp(Value, Min, Max)
    Value = tonumber(Value) or Min
    if Value < Min then return Min end
    if Value > Max then return Max end
    return Value
end

local function Trim(Value)
    if type(Value) ~= "string" then return "" end
    return (Value:gsub("^%s+", ""):gsub("%s+$", ""))
end

local function TrimPlate(Value)
    return Trim(Value or ""):gsub("%s+", "")
end

local function GetPlayerFromSource(Source)
    return Peak.Functions.GetPlayer(Source)
end

local function GetCitizenId(Source)
    local Player = GetPlayerFromSource(Source)
    if not Player then return nil end
    return Player.PlayerData.citizenid
end

local function GetCharacterName(Player)
    if not Player then return "Unknown Player" end
    return ("%s %s"):format(Player.PlayerData.charinfo.firstname, Player.PlayerData.charinfo.lastname)
end

local function DetectProvider(Url)
    local LowerUrl = string.lower(Url or "")
    if (Url or ""):match("^https://api%.audius%.co/v1/tracks/%w+/stream%?app_name=PeakMusic$") then
        return "audius"
    elseif string.find(LowerUrl, "spotify") then
        return "spotify"
    elseif string.find(LowerUrl, "soundcloud") then
        return "soundcloud"
    elseif string.find(LowerUrl, "youtu") then
        return "youtube"
    end

    return "link"
end

local function BuildTrackTitle(Url)
    local Provider = DetectProvider(Url)
    if Provider == "spotify" then
        return "Spotify Link"
    elseif Provider == "soundcloud" then
        return "SoundCloud Link"
    elseif Provider == "youtube" then
        return "YouTube Link"
    end

    return "Saved Link"
end

local function GetCitizenName(CitizenId)
    local Online = Peak.Functions.GetPlayerByCitizenId(CitizenId)
    if Online then
        return GetCharacterName(Online)
    end

    local Result = PhoneDB.query("SELECT `charinfo` FROM `peak_phone_characters` WHERE `citizenid` = @CitizenId LIMIT 1", {
        ['@CitizenId'] = CitizenId
    })

    if Result and Result[1] and Result[1].charinfo then
        local Charinfo = json.decode(Result[1].charinfo)
        if Charinfo and Charinfo.firstname and Charinfo.lastname then
            return ("%s %s"):format(Charinfo.firstname, Charinfo.lastname)
        end
    end

    return CitizenId
end

local function PlaylistHasAccess(Source, PlaylistId)
    local CitizenId = GetCitizenId(Source)
    if not CitizenId then return false end

    local Result = PhoneDB.query([[
        SELECT p.id
        FROM `phone_peakify_playlists` p
        LEFT JOIN `phone_peakify_playlist_collaborators` c ON c.playlist_id = p.id
        WHERE p.id = @PlaylistId
          AND (p.citizenid = @CitizenId OR c.citizenid = @CitizenId)
        LIMIT 1
    ]], {
        ['@PlaylistId'] = PlaylistId,
        ['@CitizenId'] = CitizenId,
    })

    return Result and Result[1] ~= nil
end

local function PlaylistIsOwner(Source, PlaylistId)
    local CitizenId = GetCitizenId(Source)
    if not CitizenId then return false end

    local Result = PhoneDB.query("SELECT `id` FROM `phone_peakify_playlists` WHERE `id` = @PlaylistId AND `citizenid` = @CitizenId LIMIT 1", {
        ['@PlaylistId'] = PlaylistId,
        ['@CitizenId'] = CitizenId,
    })

    return Result and Result[1] ~= nil
end

local function GetSavedTracks(CitizenId)
    local Tracks = PhoneDB.query([[
        SELECT `id`, `url`, `title`, `provider`, `created_at`
        FROM `phone_peakify_tracks`
        WHERE `citizenid` = @CitizenId
        ORDER BY `created_at` DESC
    ]], {
        ['@CitizenId'] = CitizenId
    }) or {}

    for i = 1, #Tracks do
        Tracks[i].created_at = tonumber(Tracks[i].created_at) or PeakifyNow()
    end

    return Tracks
end

local function GetPlaylists(CitizenId)
    local Playlists = PhoneDB.query([[
        SELECT DISTINCT p.id, p.citizenid, p.name, p.description, p.created_at
        FROM `phone_peakify_playlists` p
        LEFT JOIN `phone_peakify_playlist_collaborators` c ON c.playlist_id = p.id
        WHERE p.citizenid = @CitizenId OR c.citizenid = @CitizenId
        ORDER BY p.created_at DESC
    ]], {
        ['@CitizenId'] = CitizenId
    }) or {}

    for i = 1, #Playlists do
        local Playlist = Playlists[i]
        Playlist.created_at = tonumber(Playlist.created_at) or PeakifyNow()
        Playlist.isOwner = Playlist.citizenid == CitizenId
        Playlist.ownerName = GetCitizenName(Playlist.citizenid)

        Playlist.collaborators = PhoneDB.query([[
            SELECT `citizenid`
            FROM `phone_peakify_playlist_collaborators`
            WHERE `playlist_id` = @PlaylistId
            ORDER BY `citizenid` ASC
        ]], {
            ['@PlaylistId'] = Playlist.id
        }) or {}

        for j = 1, #Playlist.collaborators do
            local CollaboratorId = Playlist.collaborators[j].citizenid
            Playlist.collaborators[j] = {
                citizenid = CollaboratorId,
                name = GetCitizenName(CollaboratorId)
            }
        end

        Playlist.tracks = PhoneDB.query([[
            SELECT pt.id, pt.url, pt.title, pt.provider, pt.created_at, l.position
            FROM `phone_peakify_playlist_tracks` l
            INNER JOIN `phone_peakify_tracks` pt ON pt.id = l.track_id
            WHERE l.playlist_id = @PlaylistId
            ORDER BY l.position ASC, l.id ASC
        ]], {
            ['@PlaylistId'] = Playlist.id
        }) or {}
    end

    return Playlists
end

local function GetSessionPayload(Session)
    return {
        NetworkId = Session.NetworkId,
        DeviceType = Session.DeviceType,
        Url = Session.Url,
        Title = Session.Title,
        Provider = Session.Provider,
        Radius = Session.Radius,
        Volume = Session.Volume,
        EntityNetId = Session.EntityNetId,
        Coords = Session.Coords,
        VehiclePlate = Session.VehiclePlate,
        BoomboxId = Session.BoomboxId,
        Paused = Session.Paused == true,
        UpdatedAt = Session.UpdatedAt,
    }
end

local function BroadcastSessionPlay(Session)
    TriggerClientEvent("peak-phone:Client:Peakify:PlaySession", -1, GetSessionPayload(Session))
end

local function BroadcastSessionPause(Session)
    TriggerClientEvent("peak-phone:Client:Peakify:PauseSession", -1, {
        NetworkId = Session.NetworkId,
        Paused = Session.Paused == true,
    })
end

local function BroadcastSessionStop(NetworkId)
    TriggerClientEvent("peak-phone:Client:Peakify:StopSession", -1, {
        NetworkId = NetworkId
    })
end

local function StopSession(NetworkId)
    if not Peakify.ActiveSessions[NetworkId] then return end
    Peakify.ActiveSessions[NetworkId] = nil
    BroadcastSessionStop(NetworkId)
end

local function DeleteBoombox(BoomboxId, GiveItemBack)
    local Boombox = Peakify.Boomboxes[BoomboxId]
    if not Boombox then return false end

    StopSession(Boombox.NetworkId)

    if Boombox.Entity and DoesEntityExist(Boombox.Entity) then
        DeleteEntity(Boombox.Entity)
    end

    if GiveItemBack and Boombox.OwnerSource then
        local Player = GetPlayerFromSource(Boombox.OwnerSource)
        if Player then
            Player.Functions.AddItem('boombox', 1, false, false, true, false)
        end
    end

    Peakify.Boomboxes[BoomboxId] = nil
    return true
end

local function FindBoomboxByNetId(NetId)
    for BoomboxId, Boombox in pairs(Peakify.Boomboxes) do
        if tonumber(Boombox.NetId) == tonumber(NetId) then
            return BoomboxId, Boombox
        end
    end

    return nil, nil
end

local function GetBoomboxNetworkId(BoomboxId)
    return ("peakify-boombox-%s"):format(BoomboxId)
end

local function GetVehicleNetworkId(Plate)
    return ("peakify-vehicle-%s"):format(TrimPlate(Plate))
end

local function GetCarriedNetworkId(CitizenId)
    return ("peakify-carried-%s"):format(CitizenId)
end

local function ResolveNetworkTarget(Source, NetworkId)
    if type(NetworkId) ~= "string" or NetworkId == "" then
        return nil
    end

    local PlayerPed = GetPlayerPed(Source)
    if PlayerPed <= 0 then return nil end
    local PlayerCoords = GetEntityCoords(PlayerPed)

    if string.match(NetworkId, "^peakify%-boombox%-") then
        local BoomboxId = string.gsub(NetworkId, "^peakify%-boombox%-", "")
        local Boombox = Peakify.Boomboxes[BoomboxId]
        if not Boombox then return nil end
        if #(PlayerCoords - Boombox.Coords) > PeakifyConfig.ConnectDistanceBoombox then
            return nil
        end

        return {
            Success = true,
            Kind = "boombox",
            NetworkId = NetworkId,
            EntityNetId = Boombox.NetId,
            Coords = Boombox.Coords,
            Size = PeakifyConfig.ConnectDistanceBoombox + 2.0,
            BoomboxId = BoomboxId,
        }
    end

    if string.match(NetworkId, "^peakify%-vehicle%-") then
        local Vehicle = GetVehiclePedIsIn(PlayerPed, false)
        if Vehicle == 0 then return nil end

        local Plate = TrimPlate(GetVehicleNumberPlateText(Vehicle))
        if NetworkId ~= GetVehicleNetworkId(Plate) then
            return nil
        end

        return {
            Success = true,
            Kind = "vehicle",
            NetworkId = NetworkId,
            EntityNetId = NetworkGetNetworkIdFromEntity(Vehicle),
            Coords = GetEntityCoords(Vehicle),
            Size = PeakifyConfig.ConnectDistanceVehicle + 4.0,
            VehiclePlate = Plate,
        }
    end

    if string.match(NetworkId, "^peakify%-carried%-") then
        local CitizenId = string.gsub(NetworkId, "^peakify%-carried%-", "")
        local TargetSource = nil
        
        -- Find the player currently carrying this session (could be anyone if collaborative, but usually local)
        -- Actually, we check if the citizenId is carrying.
        if Peakify.Carried[CitizenId] then
            local CarrierSource = Peakify.Carried[CitizenId].Source
            local CarrierPed = GetPlayerPed(CarrierSource)
            if CarrierPed > 0 then
                return {
                    Success = true,
                    Kind = "carried",
                    NetworkId = NetworkId,
                    EntityNetId = NetworkGetNetworkIdFromEntity(CarrierPed),
                    Coords = GetEntityCoords(CarrierPed),
                    Size = 10.0, -- Carried speakers are always close to the owner
                }
            end
        end
    end

    return nil
end

function PeakifyGetNearbyNetworks(Source)
    local Retval = {}
    local PlayerPed = GetPlayerPed(Source)
    if PlayerPed <= 0 then return Retval end

    local PlayerCoords = GetEntityCoords(PlayerPed)
    for BoomboxId, Boombox in pairs(Peakify.Boomboxes) do
        if #(PlayerCoords - Boombox.Coords) <= PeakifyConfig.ConnectDistanceBoombox then
            Retval[#Retval + 1] = {
                Id = Boombox.NetworkId,
                Name = Boombox.Label,
                Kind = "boombox",
                EntityNetId = Boombox.NetId,
                Coords = Boombox.Coords,
                Size = PeakifyConfig.ConnectDistanceBoombox + 2.0,
            }
        end
    end

    local Vehicle = GetVehiclePedIsIn(PlayerPed, false)
    if Vehicle ~= 0 then
        local Plate = TrimPlate(GetVehicleNumberPlateText(Vehicle))
        Retval[#Retval + 1] = {
            Id = GetVehicleNetworkId(Plate),
            Name = ("Vehicle Radio %s"):format(Plate),
            Kind = "vehicle",
            EntityNetId = NetworkGetNetworkIdFromEntity(Vehicle),
            Coords = GetEntityCoords(Vehicle),
            Size = PeakifyConfig.ConnectDistanceVehicle + 4.0,
        }
    end

    -- Check for carried speakers nearby
    local Players = Peak.Functions.GetPlayers()
    for _, ServerId in pairs(Players) do
        local TargetCitizenId = GetCitizenId(ServerId)
        if TargetCitizenId and Peakify.Carried[TargetCitizenId] then
            local CarrierPed = GetPlayerPed(ServerId)
            local CarrierCoords = GetEntityCoords(CarrierPed)
            if #(PlayerCoords - CarrierCoords) <= 5.0 then
                Retval[#Retval + 1] = {
                    Id = GetCarriedNetworkId(TargetCitizenId),
                    Name = (ServerId == Source) and "My Carried Speaker" or ("%s's Speaker"):format(GetCharacterName(GetPlayerFromSource(ServerId))),
                    Kind = "carried",
                    EntityNetId = NetworkGetNetworkIdFromEntity(CarrierPed),
                    Coords = CarrierCoords,
                    Size = 8.0,
                }
            end
        end
    end

    return Retval
end

function PeakifyTryConnectNetwork(Source, NetworkId)
    return ResolveNetworkTarget(Source, NetworkId)
end

Citizen.CreateThread(function()
    PhoneDB.query([[
        CREATE TABLE IF NOT EXISTS `phone_peakify_tracks` (
            `id` INT NOT NULL AUTO_INCREMENT,
            `citizenid` VARCHAR(50) NOT NULL,
            `url` VARCHAR(1024) NOT NULL,
            `title` VARCHAR(255) NOT NULL,
            `provider` VARCHAR(32) NOT NULL,
            `created_at` BIGINT NOT NULL,
            PRIMARY KEY (`id`),
            INDEX `idx_peakify_tracks_citizenid` (`citizenid`)
        );
    ]])

    PhoneDB.query([[
        CREATE TABLE IF NOT EXISTS `phone_peakify_playlists` (
            `id` INT NOT NULL AUTO_INCREMENT,
            `citizenid` VARCHAR(50) NOT NULL,
            `name` VARCHAR(100) NOT NULL,
            `description` VARCHAR(255) NULL,
            `created_at` BIGINT NOT NULL,
            PRIMARY KEY (`id`),
            INDEX `idx_peakify_playlists_citizenid` (`citizenid`)
        );
    ]])

    PhoneDB.query([[
        CREATE TABLE IF NOT EXISTS `phone_peakify_playlist_tracks` (
            `id` INT NOT NULL AUTO_INCREMENT,
            `playlist_id` INT NOT NULL,
            `track_id` INT NOT NULL,
            `position` INT NOT NULL DEFAULT 0,
            PRIMARY KEY (`id`),
            INDEX `idx_peakify_playlist_tracks_playlist` (`playlist_id`)
        );
    ]])

    PhoneDB.query([[
        CREATE TABLE IF NOT EXISTS `phone_peakify_playlist_collaborators` (
            `playlist_id` INT NOT NULL,
            `citizenid` VARCHAR(50) NOT NULL,
            PRIMARY KEY (`playlist_id`, `citizenid`)
        );
    ]])
end)

Peak.Functions.CreateCallback("peak-phone:Server:Peakify:GetState", function(Source, Cb)
    local CitizenId = GetCitizenId(Source)
    if not CitizenId then
        return Cb({ Tracks = {}, Playlists = {} })
    end

    Cb({
        Tracks = GetSavedTracks(CitizenId),
        Playlists = GetPlaylists(CitizenId),
    })
end)

Peak.Functions.CreateCallback("peak-phone:Server:Peakify:GetSessions", function(Source, Cb)
    local Sessions = {}
    for NetworkId, Session in pairs(Peakify.ActiveSessions) do
        Sessions[#Sessions + 1] = GetSessionPayload(Session)
    end
    Cb(Sessions)
end)

Peak.Functions.CreateCallback("peak-phone:Server:Peakify:GetDeviceState", function(Source, Cb, Data)
    local NetworkId = Data and Data.NetworkId
    local Session = NetworkId and Peakify.ActiveSessions[NetworkId] or nil
    Cb(Session and GetSessionPayload(Session) or nil)
end)

Peak.Functions.CreateCallback("peak-phone:Server:Peakify:SaveTrack", function(Source, Cb, Data)
    local CitizenId = GetCitizenId(Source)
    if not CitizenId then return Cb({ Success = false }) end

    local Url = Trim(Data and Data.Url or "")
    if Url == "" then
        return Cb({ Success = false, Message = "A link is required." })
    end

    local Title = Trim(Data and Data.Title or "")
    if Title == "" then
        Title = BuildTrackTitle(Url)
    end

    local Existing = PhoneDB.query("SELECT `id` FROM `phone_peakify_tracks` WHERE `citizenid` = @CitizenId AND `url` = @Url LIMIT 1", {
        ['@CitizenId'] = CitizenId,
        ['@Url'] = Url,
    })

    if Existing and Existing[1] then
        return Cb({ Success = true, TrackId = Existing[1].id })
    end

    PhoneDB.execute("INSERT INTO `phone_peakify_tracks` (`citizenid`, `url`, `title`, `provider`, `created_at`) VALUES (@CitizenId, @Url, @Title, @Provider, @CreatedAt)", {
        ['@CitizenId'] = CitizenId,
        ['@Url'] = Url,
        ['@Title'] = string.sub(Title, 1, 255),
        ['@Provider'] = DetectProvider(Url),
        ['@CreatedAt'] = PeakifyNow(),
    })

    Cb({ Success = true })
end)

Peak.Functions.CreateCallback("peak-phone:Server:Peakify:DeleteTrack", function(Source, Cb, Data)
    local CitizenId = GetCitizenId(Source)
    local TrackId = tonumber(Data and Data.TrackId or 0)
    if not CitizenId or TrackId <= 0 then return Cb(false) end

    local Track = PhoneDB.query("SELECT `id` FROM `phone_peakify_tracks` WHERE `id` = @TrackId AND `citizenid` = @CitizenId LIMIT 1", {
        ['@TrackId'] = TrackId,
        ['@CitizenId'] = CitizenId,
    })

    if not Track or not Track[1] then
        return Cb(false)
    end

    PhoneDB.execute("DELETE FROM `phone_peakify_playlist_tracks` WHERE `track_id` = @TrackId", {
        ['@TrackId'] = TrackId
    })
    PhoneDB.execute("DELETE FROM `phone_peakify_tracks` WHERE `id` = @TrackId", {
        ['@TrackId'] = TrackId
    })

    Cb(true)
end)

Peak.Functions.CreateCallback("peak-phone:Server:Peakify:CreatePlaylist", function(Source, Cb, Data)
    local CitizenId = GetCitizenId(Source)
    if not CitizenId then return Cb(false) end

    local Name = Trim(Data and Data.Name or "")
    if Name == "" then
        return Cb(false)
    end

    PhoneDB.execute("INSERT INTO `phone_peakify_playlists` (`citizenid`, `name`, `description`, `created_at`) VALUES (@CitizenId, @Name, @Description, @CreatedAt)", {
        ['@CitizenId'] = CitizenId,
        ['@Name'] = string.sub(Name, 1, 100),
        ['@Description'] = string.sub(Trim(Data and Data.Description or ""), 1, 255),
        ['@CreatedAt'] = PeakifyNow(),
    })

    Cb(true)
end)

Peak.Functions.CreateCallback("peak-phone:Server:Peakify:DeletePlaylist", function(Source, Cb, Data)
    local PlaylistId = tonumber(Data and Data.PlaylistId or 0)
    if PlaylistId <= 0 or not PlaylistIsOwner(Source, PlaylistId) then
        return Cb(false)
    end

    PhoneDB.execute("DELETE FROM `phone_peakify_playlist_collaborators` WHERE `playlist_id` = @PlaylistId", {
        ['@PlaylistId'] = PlaylistId
    })
    PhoneDB.execute("DELETE FROM `phone_peakify_playlist_tracks` WHERE `playlist_id` = @PlaylistId", {
        ['@PlaylistId'] = PlaylistId
    })
    PhoneDB.execute("DELETE FROM `phone_peakify_playlists` WHERE `id` = @PlaylistId", {
        ['@PlaylistId'] = PlaylistId
    })

    Cb(true)
end)

Peak.Functions.CreateCallback("peak-phone:Server:Peakify:AddTrackToPlaylist", function(Source, Cb, Data)
    local PlaylistId = tonumber(Data and Data.PlaylistId or 0)
    local TrackId = tonumber(Data and Data.TrackId or 0)
    if PlaylistId <= 0 or TrackId <= 0 or not PlaylistHasAccess(Source, PlaylistId) then
        return Cb(false)
    end

    local MaxPosition = PhoneDB.query("SELECT COALESCE(MAX(`position`), -1) AS `position` FROM `phone_peakify_playlist_tracks` WHERE `playlist_id` = @PlaylistId", {
        ['@PlaylistId'] = PlaylistId
    })
    local NextPosition = (MaxPosition and MaxPosition[1] and tonumber(MaxPosition[1].position) or -1) + 1

    PhoneDB.execute("INSERT INTO `phone_peakify_playlist_tracks` (`playlist_id`, `track_id`, `position`) VALUES (@PlaylistId, @TrackId, @Position)", {
        ['@PlaylistId'] = PlaylistId,
        ['@TrackId'] = TrackId,
        ['@Position'] = NextPosition,
    })

    Cb(true)
end)

Peak.Functions.CreateCallback("peak-phone:Server:Peakify:RemoveTrackFromPlaylist", function(Source, Cb, Data)
    local PlaylistId = tonumber(Data and Data.PlaylistId or 0)
    local TrackId = tonumber(Data and Data.TrackId or 0)
    if PlaylistId <= 0 or TrackId <= 0 or not PlaylistHasAccess(Source, PlaylistId) then
        return Cb(false)
    end

    PhoneDB.execute("DELETE FROM `phone_peakify_playlist_tracks` WHERE `playlist_id` = @PlaylistId AND `track_id` = @TrackId LIMIT 1", {
        ['@PlaylistId'] = PlaylistId,
        ['@TrackId'] = TrackId,
    })

    Cb(true)
end)

Peak.Functions.CreateCallback("peak-phone:Server:Peakify:AddCollaborator", function(Source, Cb, Data)
    local PlaylistId = tonumber(Data and Data.PlaylistId or 0)
    local Collaborator = Trim(Data and Data.CitizenId or "")
    if PlaylistId <= 0 or Collaborator == "" or not PlaylistIsOwner(Source, PlaylistId) then
        return Cb(false)
    end

    local OwnerId = GetCitizenId(Source)
    if OwnerId == Collaborator then
        return Cb(false)
    end

    PhoneDB.execute("INSERT IGNORE INTO `phone_peakify_playlist_collaborators` (`playlist_id`, `citizenid`) VALUES (@PlaylistId, @CitizenId)", {
        ['@PlaylistId'] = PlaylistId,
        ['@CitizenId'] = Collaborator,
    })

    Cb(true)
end)

Peak.Functions.CreateCallback("peak-phone:Server:Peakify:RemoveCollaborator", function(Source, Cb, Data)
    local PlaylistId = tonumber(Data and Data.PlaylistId or 0)
    local Collaborator = Trim(Data and Data.CitizenId or "")
    if PlaylistId <= 0 or Collaborator == "" or not PlaylistIsOwner(Source, PlaylistId) then
        return Cb(false)
    end

    PhoneDB.execute("DELETE FROM `phone_peakify_playlist_collaborators` WHERE `playlist_id` = @PlaylistId AND `citizenid` = @CitizenId", {
        ['@PlaylistId'] = PlaylistId,
        ['@CitizenId'] = Collaborator,
    })

    Cb(true)
end)

Peak.Functions.CreateCallback("peak-phone:Server:Peakify:Play", function(Source, Cb, Data)
    local Target = ResolveNetworkTarget(Source, Data and Data.NetworkId or "")
    if not Target or not Target.Success then
        return Cb({ Success = false, Message = "Connect to a nearby boombox or vehicle first." })
    end

    local Url = Trim(Data and Data.Url or "")
    if Url == "" then
        return Cb({ Success = false, Message = "A link is required." })
    end

    local Session = {
        NetworkId = Target.NetworkId,
        DeviceType = Target.Kind,
        Url = Url,
        Title = Trim(Data and Data.Title or "") ~= "" and Trim(Data.Title) or BuildTrackTitle(Url),
        Provider = DetectProvider(Url),
        Radius = Clamp(Data and Data.Radius, PeakifyConfig.MinRadius, PeakifyConfig.MaxRadius),
        Volume = Clamp(Data and Data.Volume, 0.05, 1.0),
        EntityNetId = Target.EntityNetId,
        Coords = Target.Coords,
        VehiclePlate = Target.VehiclePlate,
        BoomboxId = Target.BoomboxId,
        OwnerSource = Source,
        OwnerCitizenId = GetCitizenId(Source),
        Paused = false,
        UpdatedAt = PeakifyNow(),
    }

    Peakify.ActiveSessions[Target.NetworkId] = Session
    BroadcastSessionPlay(Session)

    Cb({
        Success = true,
        Session = GetSessionPayload(Session),
    })
end)

Peak.Functions.CreateCallback("peak-phone:Server:Peakify:Pause", function(Source, Cb, Data)
    local NetworkId = Data and Data.NetworkId or nil
    local Session = NetworkId and Peakify.ActiveSessions[NetworkId] or nil
    if not Session then return Cb(false) end

    local Target = ResolveNetworkTarget(Source, NetworkId)
    if not Target or not Target.Success then
        return Cb(false)
    end

    Session.Paused = Data and Data.Paused == true
    Session.UpdatedAt = PeakifyNow()
    BroadcastSessionPause(Session)
    Cb(true)
end)

Peak.Functions.CreateCallback("peak-phone:Server:Peakify:Volume", function(Source, Cb, Data)
    if type(Data) ~= 'table' or type(Data.NetworkId) ~= 'string' or #Data.NetworkId > 128 then return Cb(false) end
    local Volume = Data.Volume
    if type(Volume) ~= 'number' or Volume ~= Volume or Volume < 0 or Volume > 1 then return Cb(false) end
    local Session = Peakify.ActiveSessions[Data.NetworkId]
    if not Session then return Cb(false) end
    -- Reuse the server's entity, proximity and installed-device authority.
    local Target = ResolveNetworkTarget(Source, Data.NetworkId)
    if not Target or not Target.Success then return Cb(false) end
    Session.Volume = Volume
    Session.UpdatedAt = PeakifyNow()
    TriggerClientEvent('peak-phone:Client:Peakify:VolumeSession', -1, { NetworkId = Session.NetworkId, Volume = Volume })
    Cb(true)
end)

Peak.Functions.CreateCallback("peak-phone:Server:Peakify:Stop", function(Source, Cb, Data)
    local NetworkId = Data and Data.NetworkId or nil
    local Session = NetworkId and Peakify.ActiveSessions[NetworkId] or nil
    if not Session then return Cb(false) end

    if Session.OwnerCitizenId ~= GetCitizenId(Source) then
        return Cb(false)
    end

    StopSession(NetworkId)
    Cb(true)
end)

Peak.Functions.CreateCallback("peak-phone:Server:Peakify:PlaceBoombox", function(Source, Cb, Data)
    local Player = GetPlayerFromSource(Source)
    if not Player then return Cb({ Success = false }) end

    local Slot = tonumber(Data and Data.Slot or 0)
    local Item = Slot > 0 and Player.Functions.GetItemBySlot(Slot) or nil
    if not Item or Item.Item ~= "boombox" then
        return Cb({ Success = false, Message = "You need a boombox item to place one." })
    end

    local Coords = vector3(tonumber(Data.Coords.x) + 0.0, tonumber(Data.Coords.y) + 0.0, tonumber(Data.Coords.z) + 0.0)
    local Heading = tonumber(Data.Heading) + 0.0

    if #(GetEntityCoords(GetPlayerPed(Source)) - Coords) > 5.0 then
        return Cb({ Success = false, Message = "That placement is too far away." })
    end

    if not Player.Functions.RemoveItem("boombox", 1, Slot, true) then
        return Cb({ Success = false, Message = "Could not remove boombox from inventory." })
    end

    local Model = GetHashKey("prop_boombox_01")
    local Entity = CreateObjectNoOffset(Model, Coords.x, Coords.y, Coords.z, true, true, false)
    if not Entity or Entity == 0 then
        Player.Functions.AddItem("boombox", 1, false, false, true, false)
        return Cb({ Success = false, Message = "Failed to place the boombox." })
    end

    SetEntityHeading(Entity, Heading)
    FreezeEntityPosition(Entity, true)
    local NetId = NetworkGetNetworkIdFromEntity(Entity)

    local BoomboxId = ("%s-%s"):format(Player.PlayerData.citizenid, tostring(PeakifyNow() + math.random(111, 999)))
    Peakify.Boomboxes[BoomboxId] = {
        Id = BoomboxId,
        Entity = Entity,
        NetId = NetId,
        Coords = Coords,
        OwnerSource = Source,
        OwnerCitizenId = Player.PlayerData.citizenid,
        Label = ("%s's Boombox"):format(Player.PlayerData.charinfo.firstname),
        NetworkId = GetBoomboxNetworkId(BoomboxId),
    }

    Cb({ Success = true })
end)

Peak.Functions.CreateCallback("peak-phone:Server:Peakify:PickupBoombox", function(Source, Cb, Data)
    local NetId = tonumber(Data and Data.NetId or 0)
    local BoomboxId, Boombox = FindBoomboxByNetId(NetId)
    if not BoomboxId or not Boombox then return Cb(false) end

    if Boombox.OwnerCitizenId ~= GetCitizenId(Source) then
        return Cb(false)
    end

    if #(GetEntityCoords(GetPlayerPed(Source)) - Boombox.Coords) > 3.0 then
        return Cb(false)
    end

    DeleteBoombox(BoomboxId, true)
    Cb(true)
end)

Peak.Functions.CreateCallback("peak-phone:Server:Peakify:StartCarry", function(Source, Cb, Data)
    local Player = GetPlayerFromSource(Source)
    if not Player then return Cb(false) end

    local Slot = tonumber(Data and Data.Slot or 0)
    local Item = Slot > 0 and Player.Functions.GetItemBySlot(Slot) or nil
    if not Item or Item.Item ~= "boombox" then
        return Cb(false)
    end

    if not Player.Functions.RemoveItem("boombox", 1, Slot, true) then
        return Cb(false)
    end

    local CitizenId = Player.PlayerData.citizenid
    Peakify.Carried[CitizenId] = {
        Source = Source,
        CitizenId = CitizenId,
        NetworkId = GetCarriedNetworkId(CitizenId)
    }

    Cb(true)
end)

Peak.Functions.CreateCallback("peak-phone:Server:Peakify:StopCarry", function(Source, Cb)
    local CitizenId = GetCitizenId(Source)
    if not CitizenId or not Peakify.Carried[CitizenId] then return Cb(false) end

    local Player = GetPlayerFromSource(Source)
    if Player then
        Player.Functions.AddItem("boombox", 1, false, false, true, false)
    end

    StopSession(Peakify.Carried[CitizenId].NetworkId)
    Peakify.Carried[CitizenId] = nil
    
    Cb(true)
end)

AddEventHandler("playerDropped", function()
    local Source = source

    local BoomboxIds = {}
    for BoomboxId, Boombox in pairs(Peakify.Boomboxes) do
        if Boombox.OwnerSource == Source then
            BoomboxIds[#BoomboxIds + 1] = BoomboxId
        end
    end

    for i = 1, #BoomboxIds do
        DeleteBoombox(BoomboxIds[i], false)
    end

    local CitizenId = GetCitizenId(Source)
    if CitizenId and Peakify.Carried[CitizenId] then
        StopSession(Peakify.Carried[CitizenId].NetworkId)
        Peakify.Carried[CitizenId] = nil
    end

    local SessionIds = {}
    for NetworkId, Session in pairs(Peakify.ActiveSessions) do
        if Session.OwnerSource == Source then
            SessionIds[#SessionIds + 1] = NetworkId
        end
    end

    for i = 1, #SessionIds do
        StopSession(SessionIds[i])
    end
end)

AddEventHandler("onResourceStop", function(ResourceName)
    if ResourceName ~= GetCurrentResourceName() then return end

    local BoomboxIds = {}
    for BoomboxId in pairs(Peakify.Boomboxes) do
        BoomboxIds[#BoomboxIds + 1] = BoomboxId
    end

    for i = 1, #BoomboxIds do
        DeleteBoombox(BoomboxIds[i], false)
    end

    for NetworkId in pairs(Peakify.ActiveSessions) do
        BroadcastSessionStop(NetworkId)
    end
end)
