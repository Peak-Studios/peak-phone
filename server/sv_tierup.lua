if not Phone.legacyAvailable('tierup') then return end
local GroupInvitations = {}

Peak.Functions.CreateCallback("peak-phone:Server:TierUp:GetPlayerGroup", function(Source, Cb)
    local Player = Peak.Functions.GetPlayer(Source)
    if Player == nil then return end

    local Group = GetPlayerGroup(Player.PlayerData.citizenid)

    if not Group or Group == nil then
        return Cb(false)
    end

    Cb(Group)
end)

Peak.Functions.CreateCallback("peak-phone:Server:TierUp:CreateGroup", function(Source, Cb)
    local Player = Peak.Functions.GetPlayer(Source)
    if Player == nil then return end

    if IsPlayerInGroup(Player.PlayerData.citizenid) then
        Cb({ Success = false, Msg = "You're already in a group!" })
        return
    end

    local Result = PhoneDB.query("INSERT INTO `phone_tierup` (`members`) VALUES (@Members)", {
        ['@Members'] = json.encode({{Cid = Player.PlayerData.citizenid}})
    })

    Cb({Success = true })
end)

Peak.Functions.CreateCallback("peak-phone:Server:TierUp:InviteParticipate", function(Source, Cb, Data)
    local Player = Peak.Functions.GetPlayer(Source)
    if Player == nil then return end

    local Target = Peak.Functions.GetPlayerByCitizenId(Data.Cid)
    if Target == nil then
        Cb({ Success = false, Msg = "Invalid Player" })
        return
    end

    if not IsPlayerInGroup(Player.PlayerData.citizenid) then
        Cb({ Success = false, Msg = "You're not in a group!" })
        return
    end

    if IsPlayerInGroup(Target.PlayerData.citizenid) then
        Cb({ Success = false, Msg = "Player is already in a group!" })
        return
    end

    local Group = GetPlayerGroup(Player.PlayerData.citizenid)
    if Group.members[1].Cid ~= Player.PlayerData.citizenid then
        Cb({ Success = false, Msg = "Only the owner can do this!" })
        return
    end

    TriggerClientEvent("peak-phone:Client:Notification", Target.PlayerData.source, "tierup-invite-" .. Target.PlayerData.citizenid, "fas fa-trophy", { "white", "transparent" }, "TierUp! Invitation", Player.PlayerData.charinfo.firstname .. " " .. Player.PlayerData.charinfo.lastname .. " has invited you to participate in a TierUp group!", false, true, "peak-phone:Server:TierUp:AcceptInvite", "peak-phone:Client:RemoveNotificationById", { Id = "tierup-invite-" .. Target.PlayerData.citizenid, GroupId = Group.id })

    if GroupInvitations[Group.id] == nil then
        GroupInvitations[Group.id] = {}
    end

    GroupInvitations[Group.id][Target.PlayerData.citizenid] = true

    Cb({Success = true })
end)

Peak.Functions.CreateCallback("peak-phone:Server:TierUp:LeaveGroup", function(Source, Cb)
    local Player = Peak.Functions.GetPlayer(Source)
    if Player == nil then return end

    local Group = GetPlayerGroup(Player.PlayerData.citizenid)
    if not Group or Group == nil then
        Cb({ Success = false, Msg = "You're not in a group!" })
        return
    end

    for k, v in pairs(Group.members) do
        if v.Cid == Player.PlayerData.citizenid then
            table.remove(Group.members, k)
            break
        end
    end

    PhoneDB.query("UPDATE `phone_tierup` SET `members` = @Members WHERE `id` = @Id", {
        ['@Id'] = Group.id,
        ['@Members'] = json.encode(Group.members),
    })

    Cb({Success = true })
end)

Peak.Functions.CreateCallback("peak-phone:Server:TierUp:KickMember", function(Source, Cb, Data)
    local Player = Peak.Functions.GetPlayer(Source)
    if Player == nil then return end

    local Group = GetPlayerGroup(Player.PlayerData.citizenid)
    if not Group or Group == nil then
        Cb({ Success = false, Msg = "You're not in a group!" })
        return
    end

    if Group.members[1].Cid ~= Player.PlayerData.citizenid then
        Cb({ Success = false, Msg = "Only the owner can do this!" })
    end

    for k, v in pairs(Group.members) do
        if v.Cid == Data.Cid then
            table.remove(Group.members, k)
            break
        end
    end

    PhoneDB.query("UPDATE `phone_tierup` SET `members` = @Members WHERE `id` = @Id", {
        ['@Id'] = Group.id,
        ['@Members'] = json.encode(Group.members),
    })

    Cb({Success = true })
end)

Peak.Functions.CreateCallback("peak-phone:Server:TierUp:TransferOwnership", function(Source, Cb, Data)
    local Player = Peak.Functions.GetPlayer(Source)
    if Player == nil then return end

    local Group = GetPlayerGroup(Player.PlayerData.citizenid)
    if not Group or Group == nil then
        Cb({ Success = false, Msg = "You're not in a group!" })
        return
    end

    if Group.members[1].Cid ~= Player.PlayerData.citizenid then
        Cb({ Success = false, Msg = "Only the owner can do this!" })
    end

    for k, v in pairs(Group.members) do
        if v.Cid == Data.Cid then
            v.Cid = Player.PlayerData.citizenid
            break
        end
    end

    Group.members[1].Cid = Data.Cid

    PhoneDB.query("UPDATE `phone_tierup` SET `members` = @Members WHERE `id` = @Id", {
        ['@Id'] = Group.id,
        ['@Members'] = json.encode(Group.members),
    })

    Cb({Success = true })
end)

Peak.Functions.CreateCallback("peak-phone:Server:TierUp:DeleteGroup", function(Source, Cb)
    local Player = Peak.Functions.GetPlayer(Source)
    if Player == nil then return end

    if not IsPlayerInGroup(Player.PlayerData.citizenid) then
        Cb({ Success = false, Msg = "You're not in a group!" })
        return
    end

    local Group = GetPlayerGroup(Player.PlayerData.citizenid)
    if Group.members[1].Cid ~= Player.PlayerData.citizenid then
        Cb({ Success = false, Msg = "Only the owner can do this!" })
    end

    PhoneDB.query("DELETE FROM `phone_tierup` WHERE `id` = @Id", {
        ['@Id'] = Group.id
    })

    Cb({Success = true })
end)

RegisterNetEvent("peak-phone:Server:TierUp:AcceptInvite")
AddEventHandler("peak-phone:Server:TierUp:AcceptInvite", function(Data)
    local Source = source

    local Player = Peak.Functions.GetPlayer(Source)
    if not Player then
        TriggerClientEvent('peak-phone:Client:UpdateNotification', Source, Data.Id, true, true, false, "Invalid Invitation!", true)
        return
    end

    local Group = GetGroupById(Data.GroupId)
    if not Group or Group == nil then
        TriggerClientEvent('peak-phone:Client:UpdateNotification', Source, Data.Id, true, true, false, "Invalid Invitation!", true)
        return
    end

    if not GroupInvitations[Data.GroupId] or not GroupInvitations[Data.GroupId][Player.PlayerData.citizenid] then
        TriggerClientEvent('peak-phone:Client:UpdateNotification', Source, Data.Id, true, true, false, "Invalid Invitation!", true)
        return
    end

    TriggerClientEvent('peak-phone:Client:UpdateNotification', Source, Data.Id, true, true, false, "Invitation accepted.", true)

    table.insert(Group.members, {Cid = Player.PlayerData.citizenid})

    PhoneDB.query("UPDATE `phone_tierup` SET `members` = @Members WHERE `id` = @Id", {
        ['@Id'] = Group.id,
        ['@Members'] = json.encode(Group.members),
    })
end)

function GetPlayerGroup(Cid)
    local Result = PhoneDB.query("SELECT * FROM `phone_tierup` WHERE JSON_SEARCH(members, 'one', @Cid, NULL, '$[*].Cid') IS NOT NULL", {
        ['@Cid'] = Cid
    })

    if Result == nil or Result[1] == nil then
        return nil
    end

    Result[1].members = json.decode(Result[1].members)
    for k, v in pairs(Result[1].members) do
        v.Name = Peak.Functions.GetPlayerCharName(v.Cid)
        v.Online = Peak.Functions.GetPlayerByCitizenId(v.Cid) ~= nil
    end

    Result[1].Progression = exports['peak-heists']:GetProgressionByExperience(Result[1].experience)

    return Result[1]
end
exports("GetPlayerGroup", GetPlayerGroup)

function GetGroupById(Id)
    local Result = PhoneDB.query("SELECT * FROM `phone_tierup` WHERE `id` = @Id", {
        ['@Id'] = Id
    })

    if Result == nil or Result[1] == nil then
        return nil
    end

    Result[1].members = json.decode(Result[1].members)
    for k, v in pairs(Result[1].members) do
        v.Name = Peak.Functions.GetPlayerCharName(v.Cid)
        v.Online = Peak.Functions.GetPlayerByCitizenId(v.Cid) ~= nil
    end

    Result[1].Progression = exports['peak-heists']:GetProgressionByExperience(Result[1].experience)

    return Result[1]
end
exports("GetGroupById", GetGroupById)

function IsPlayerInGroup(Cid)
    local Result = GetPlayerGroup(Cid)
    return Result ~= nil
end
exports("IsPlayerInGroup", IsPlayerInGroup)