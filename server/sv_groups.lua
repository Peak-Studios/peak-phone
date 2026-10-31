-- =============================================
-- Group Messaging Server Logic
-- =============================================

-- Automatic DB Migration
Citizen.CreateThread(function()
    local result = PhoneDB.query("SHOW COLUMNS FROM `phone_group_members` LIKE 'is_admin'")
    if not result or #result == 0 then
        print("[peak-phone] Adding missing 'is_admin' column to phone_group_members...")
        PhoneDB.query("ALTER TABLE `phone_group_members` ADD COLUMN `is_admin` TINYINT(1) NOT NULL DEFAULT 0")
        print("[peak-phone] Migration complete.")
    end
end)

local MAX_GROUP_MEMBERS = 15

-- Helper: Generate unique group ID
local function GenerateGroupId()
    return "GRP" .. Peak.Shared.RandomInt(8)
end

-- Helper: Get contact name for a member
local function GetMemberName(Cid, Phone)
    local Result = PhoneDB.query('SELECT * FROM `phone_contacts` WHERE `citizenid` = @Cid AND `phone` = @Phone', { 
        ['@Cid'] = Cid, 
        ['@Phone'] = Phone 
    })
    if Result[1] then
        return Result[1].name
    end
    -- Fallback to formatted phone
    return string.gsub(Phone, "(%d%d)(%d%d%d%d%d%d%d%d)", "%1 %2")
end

-- Helper: Check if player is member of group
local function IsGroupMember(GroupId, Phone)
    local Result = PhoneDB.query('SELECT * FROM `phone_group_members` WHERE `group_id` = @GroupId AND `phone` = @Phone', {
        ['@GroupId'] = GroupId,
        ['@Phone'] = Phone
    })
    return Result[1] ~= nil
end

-- Helper: Check if player is group creator
local function IsGroupCreator(GroupId, Phone)
    local Result = PhoneDB.query('SELECT * FROM `phone_groups` WHERE `group_id` = @GroupId AND `creator_phone` = @Phone', {
        ['@GroupId'] = GroupId,
        ['@Phone'] = Phone
    })
    return Result[1] ~= nil
end

-- Helper: Check if player is group admin
local function IsGroupAdmin(GroupId, Phone)
    local Result = PhoneDB.query('SELECT * FROM `phone_group_members` WHERE `group_id` = @GroupId AND `phone` = @Phone AND `is_admin` = 1', {
        ['@GroupId'] = GroupId,
        ['@Phone'] = Phone
    })
    return Result[1] ~= nil
end

-- Helper: Get group member count
local function GetGroupMemberCount(GroupId)
    local Result = PhoneDB.query('SELECT COUNT(*) as count FROM `phone_group_members` WHERE `group_id` = @GroupId', {
        ['@GroupId'] = GroupId
    })
    return Result[1] and Result[1].count or 0
end

-- Helper: Get all online members of a group
local function GetOnlineGroupMembers(GroupId, ExcludePhone)
    local Members = {}
    local Result = PhoneDB.query('SELECT phone FROM `phone_group_members` WHERE `group_id` = @GroupId', {
        ['@GroupId'] = GroupId
    })
    
    for _, v in pairs(Result) do
        if v.phone ~= ExcludePhone then
            local Player = Peak.Functions.GetPlayerByPhone(v.phone)
            if Player then
                table.insert(Members, Player)
            end
        end
    end
    
    return Members
end

-- =============================================
-- Create Group
-- =============================================
Peak.Functions.CreateCallback("peak-phone:Server:Groups:CreateGroup", function(Source, Cb, Data)
    Data=type(Data)=='table' and Data or {}
    if type(Data.Members)~='table' then return Cb(Phone.publicError('Select between 1 and 14 group contacts.')) end
    local count=0
    for key in pairs(Data.Members) do
        count=count+1
        if count>MAX_GROUP_MEMBERS-1 or type(key)~='number' or key%1~=0 or key<1 or key>MAX_GROUP_MEMBERS-1 then return Cb(Phone.publicError('Select between 1 and 14 group contacts.')) end
    end
    if count<1 then return Cb(Phone.publicError('Select at least one member.')) end
    for index=1,count do if Data.Members[index]==nil then return Cb(Phone.publicError('Choose valid group contacts.')) end end
    if not Phone.text(Data.Name,100) then return Cb(Phone.publicError('Group name is required.')) end
    if not IsNetworkEnabled then return Cb(Phone.publicError('No internet access.')) end
    local Player=Phone.getPlayer(Source);local CitizenId=Player and Player.PlayerData.citizenid;local MyPhone=Phone.activeNumber(Source)
    if not Player or not CitizenId or not MyPhone then return Cb(Phone.publicError('No active character or SIM.')) end
    if not Phone.rate(Source,'group-create',4,3000) then return Cb(Phone.publicError('Please wait before creating another group.')) end
    local Members,Seen={},{}
    for index=1,count do
        local number=Phone.phone(Data.Members[index])
        if not number or number==MyPhone or Seen[number] then return Cb(Phone.publicError('Group members must be distinct contacts other than yourself.')) end
        Seen[number]=true;Members[#Members+1]=number
    end
    for _,number in ipairs(Members) do
        if not PhoneDB.one('SELECT phone_number FROM sim_cards WHERE phone_number=?',{number}) then return Cb(Phone.publicError('Every member must have a valid phone SIM.')) end
    end
    local currentPhone=Phone.activeNumber(Source);local sameCharacter=Phone.sameCharacter(Source,CitizenId)
    if currentPhone~=MyPhone or not sameCharacter then return Cb(Phone.publicError('Character or SIM changed.')) end
    local GroupId=GenerateGroupId()
    for _=1,4 do if not PhoneDB.one('SELECT group_id FROM phone_groups WHERE group_id=?',{GroupId}) then break end;GroupId=GenerateGroupId() end
    currentPhone=Phone.activeNumber(Source);sameCharacter=Phone.sameCharacter(Source,CitizenId)
    if currentPhone~=MyPhone or not sameCharacter then return Cb(Phone.publicError('Character or SIM changed.')) end
    local Timestamp=os.time()*1000;local GroupName=Phone.trim(Data.Name)
    local statements={{query='INSERT INTO phone_groups(group_id,name,creator_phone,created_at) VALUES(?,?,?,?)',values={GroupId,GroupName,MyPhone,Timestamp}},
        {query='INSERT INTO phone_group_members(group_id,phone,joined_at) VALUES(?,?,?)',values={GroupId,MyPhone,Timestamp}}}
    for _,number in ipairs(Members) do statements[#statements+1]={query='INSERT INTO phone_group_members(group_id,phone,joined_at) VALUES(?,?,?)',values={GroupId,number,Timestamp}} end
    if not PhoneDB.transaction(statements) then return Cb(Phone.publicError('The group was not saved. Try again.')) end
    currentPhone=Phone.activeNumber(Source);sameCharacter=Phone.sameCharacter(Source,CitizenId)
    if currentPhone~=MyPhone or not sameCharacter then return Cb(Phone.publicError('The group was saved under your prior phone identity. Refresh Messages before continuing.')) end
    for _,number in ipairs(Members) do
        local MemberPlayer=Peak.Functions.GetPlayerByPhone(number)
        if MemberPlayer then
            local recipient=tonumber(MemberPlayer.PlayerData.source);local recipientCid=MemberPlayer.PlayerData.citizenid
            local recipientPhone=recipient and Phone.activeNumber(recipient)
            if recipient and recipientPhone==number and Phone.sameCharacter(recipient,recipientCid) and Phone.activeNumber(Source)==MyPhone and Phone.sameCharacter(Source,CitizenId) then
                TriggerClientEvent('peak-phone:Client:Groups:RefreshGroups',recipient,{Name=GroupName,GroupId=GroupId},true)
            end
        end
    end
    if Phone.activeNumber(Source)~=MyPhone or not Phone.sameCharacter(Source,CitizenId) then return Cb(Phone.publicError('Character or SIM changed. Refresh Messages.')) end
    TriggerEvent('peak-logs:Server:Log','groups','Group Created',('User: [%s] - %s\nGroup: %s - %s\nMembers: %s'):format(Source,CitizenId,GroupId,GroupName,json.encode(Members)),'green')
    Cb({Success=true,GroupId=GroupId})
end)

-- =============================================
-- Get Groups
-- =============================================
Peak.Functions.CreateCallback("peak-phone:Server:Groups:GetGroups", function(Source, Cb)
    local Player = Peak.Functions.GetPlayer(Source)
    if Player == nil then return Cb({}) end

    local MyPhone = exports['peak-phone']:GetActivePhoneNumber(Source)
    if not MyPhone then return Cb({}) end

    -- Get all groups player is member of
    local GroupMemberships = PhoneDB.query([[
        SELECT g.*, gm.joined_at 
        FROM phone_groups g 
        INNER JOIN phone_group_members gm ON g.group_id = gm.group_id 
        WHERE gm.phone = @Phone
        ORDER BY g.created_at DESC
    ]], { ['@Phone'] = MyPhone })

    local Groups = {}

    for _, group in pairs(GroupMemberships) do
        -- Get latest message for this group
        local LatestMessage = PhoneDB.query([[
            SELECT * FROM phone_group_messages 
            WHERE group_id = @GroupId 
            ORDER BY timestamp DESC 
            LIMIT 1
        ]], { ['@GroupId'] = group.group_id })

        -- Get member count
        local MemberCount = GetGroupMemberCount(group.group_id)

        -- Get read status
        local ReadStatus = PhoneDB.query([[
            SELECT last_read_timestamp FROM phone_group_read_status 
            WHERE group_id = @GroupId AND phone = @Phone
        ]], { ['@GroupId'] = group.group_id, ['@Phone'] = MyPhone })

        local LastReadTimestamp = ReadStatus[1] and ReadStatus[1].last_read_timestamp or 0
        local HasUnread = false

        if LatestMessage[1] and LatestMessage[1].timestamp > LastReadTimestamp and LatestMessage[1].sender_phone ~= MyPhone then
            HasUnread = true
        end

        local LastMsg = LatestMessage[1]
        local LastMessageData = nil
        if LastMsg then
            LastMessageData = {
                Sender = LastMsg.sender_phone,
                SenderName = GetMemberName(Player.PlayerData.citizenid, LastMsg.sender_phone),
                Message = LastMsg.message,
                Attachments = json.decode(LastMsg.attachments) or {},
                Timestamp = LastMsg.timestamp
            }
        end

        Groups[group.group_id] = {
            group_id = group.group_id,
            name = group.name,
            creator_phone = group.creator_phone,
            is_creator = group.creator_phone == MyPhone,
            member_count = MemberCount,
            created_at = group.created_at,
            has_unread = HasUnread,
            last_message = LastMessageData
        }
    end

    Cb(Groups)
end)

-- =============================================
-- Get Group Messages
-- =============================================
Peak.Functions.CreateCallback("peak-phone:Server:Groups:GetMessages", function(Source, Cb, Data)
    local Player = Peak.Functions.GetPlayer(Source)
    if Player == nil then return Cb({}) end

    local MyPhone = exports['peak-phone']:GetActivePhoneNumber(Source)
    if not MyPhone then return Cb({}) end

    if not IsGroupMember(Data.GroupId, MyPhone) then
        return Cb({})
    end

    local before=tonumber(Data.Before) or 2147483647
    local Messages = PhoneDB.query([[
        SELECT * FROM phone_group_messages 
        WHERE group_id = @GroupId AND id < @Before
        ORDER BY id DESC LIMIT 101
    ]], { ['@GroupId'] = Data.GroupId, ['@Before'] = before })

    local FormattedMessages = {}
    for i, msg in ipairs(Messages) do
        if i<=100 then
        table.insert(FormattedMessages, {
            Id = msg.id,
            Sender = msg.sender_phone,
            Own = msg.sender_phone == MyPhone,
            SenderName = GetMemberName(Player.PlayerData.citizenid, msg.sender_phone),
            Message = msg.message,
            Attachments = json.decode(msg.attachments) or {},
            ReplyTo = tonumber(msg.reply_to),
            Timestamp = msg.timestamp
        })
        end
    end

    Cb(FormattedMessages)
end)

-- Native Messages can open an authenticated notification target without making the
-- older Svelte client change its existing array response.
Peak.Functions.CreateCallback('peak-phone:Server:Groups:GetMessagesAround',function(Source,Cb,Data)
    Data=type(Data)=='table' and Data or {}
    local Player=Peak.Functions.GetPlayer(Source);local MyPhone=Phone.activeNumber(Source);local CitizenId=Player and Player.PlayerData.citizenid
    local GroupId=Phone.string(Data.GroupId,50);local before=Phone.number(Data.Before,2147483647);local after=Phone.number(Data.After,2147483647);local around=Phone.number(Data.AroundId,2147483647)
    if GroupId and not GroupId:match('^GRP%d+$') then GroupId=nil end
    if not Player or not MyPhone or not GroupId or not IsGroupMember(GroupId,MyPhone) then return Cb(Phone.publicError('Group conversation unavailable.')) end
    local rows,previous,nextRows={},nil,nil
    if around then
        local target=PhoneDB.one('SELECT id FROM phone_group_messages WHERE id=? AND group_id=?',{around,GroupId})
        if not target then return Cb(Phone.publicError('That message is unavailable in this group.')) end
        previous=PhoneDB.query('SELECT * FROM phone_group_messages WHERE group_id=? AND id<=? ORDER BY id DESC LIMIT 14',{GroupId,around}) or {}
        nextRows=PhoneDB.query('SELECT * FROM phone_group_messages WHERE group_id=? AND id>? ORDER BY id ASC LIMIT 13',{GroupId,around}) or {}
        local retainedTarget=PhoneDB.one('SELECT id FROM phone_group_messages WHERE id=? AND group_id=?',{around,GroupId})
        if not retainedTarget or tonumber(retainedTarget.id)~=around or not previous[1] or tonumber(previous[1].id)~=around then return Cb(Phone.publicError('That message is no longer available in this group.')) end
        local chosen,used={},0
        local function keep(row)
            local size=#(row.message or '')+#(row.attachments or '')+260
            if used+size>900000 then return false end
            used=used+size;chosen[#chosen+1]=row;return true
        end
        if not keep(previous[1]) then return Cb(Phone.publicError('That message is too large to open safely.')) end
        local keepPrevious,keepNext=true,true
        for distance=1,12 do
            if keepPrevious and previous[distance+1] and not keep(previous[distance+1]) then keepPrevious=false end
            if keepNext and nextRows[distance] and not keep(nextRows[distance]) then keepNext=false end
        end
        table.sort(chosen,function(a,b)return tonumber(a.id)<tonumber(b.id) end);rows=chosen
    elseif after then
        nextRows=PhoneDB.query('SELECT * FROM phone_group_messages WHERE group_id=? AND id>? ORDER BY id ASC LIMIT 51',{GroupId,after}) or {}
        local bytes=0
        for i,row in ipairs(nextRows) do local size=#(row.message or '')+#(row.attachments or '')+260;if i>50 or (bytes+size>900000 and #rows>0) then break end;bytes=bytes+size;rows[#rows+1]=row end
    else
        local cursor=before or 2147483647
        previous=PhoneDB.query('SELECT * FROM phone_group_messages WHERE group_id=? AND id<? ORDER BY id DESC LIMIT 51',{GroupId,cursor}) or {}
        local bytes=0
        for i,row in ipairs(previous) do local size=#(row.message or '')+#(row.attachments or '')+260;if i>50 or (bytes+size>900000 and #rows>0) then break end;bytes=bytes+size;rows[#rows+1]=row end
        table.sort(rows,function(a,b)return tonumber(a.id)<tonumber(b.id) end)
    end
    local messages={}
    for _,msg in ipairs(rows) do
        messages[#messages+1]={Id=tonumber(msg.id),Sender=msg.sender_phone,Own=msg.sender_phone==MyPhone,SenderName=GetMemberName(Player.PlayerData.citizenid,msg.sender_phone),Message=msg.message,Attachments=Phone.decorateCashAttachments and Phone.decorateCashAttachments(MyPhone,GroupId,json.decode(msg.attachments) or {}) or (json.decode(msg.attachments) or {}),ReplyTo=tonumber(msg.reply_to),Timestamp=tonumber(msg.timestamp),Reactions={}}
    end
    if #messages>0 then
        local marks,ids={},{}
        for _,item in ipairs(messages) do marks[#marks+1]='?';ids[#ids+1]=item.Id end
        local grouped={}
        for _,reaction in ipairs(PhoneDB.query('SELECT message_id,actor_phone,reaction FROM phone_group_message_reactions WHERE message_id IN ('..table.concat(marks,',')..') ORDER BY created_at,actor_phone',ids) or {}) do
            local id=tonumber(reaction.message_id);grouped[id]=grouped[id] or {};grouped[id][#grouped[id]+1]={Phone=reaction.actor_phone,Reaction=reaction.reaction}
        end
        for _,item in ipairs(messages) do item.Reactions=grouped[item.Id] or {} end
    end
    local nextCursor,afterCursor,hasMore,hasMoreAfter
    local oldest=#messages>0 and messages[1].Id or nil;local newest=#messages>0 and messages[#messages].Id or nil
    hasMore=oldest and PhoneDB.one('SELECT id FROM phone_group_messages WHERE group_id=? AND id<? LIMIT 1',{GroupId,oldest})~=nil or false
    hasMoreAfter=newest and PhoneDB.one('SELECT id FROM phone_group_messages WHERE group_id=? AND id>? LIMIT 1',{GroupId,newest})~=nil or false
    nextCursor=hasMore and oldest or nil;afterCursor=hasMoreAfter and newest or nil
    if not IsGroupMember(GroupId,MyPhone) or Phone.activeNumber(Source)~=MyPhone or not Phone.sameCharacter(Source,CitizenId) then return Cb(Phone.publicError('Group membership or phone identity changed. Refresh the conversation.')) end
    Cb({Success=true,Messages=messages,Next=nextCursor,HasMore=hasMore,After=afterCursor,HasMoreAfter=hasMoreAfter})
end)

-- Reactions are scoped to a group membership and one message in that same group.
Peak.Functions.CreateCallback('peak-phone:Server:Groups:SetReaction',function(Source,Cb,Data)
    Data=type(Data)=='table' and Data or {}
    local Player=Phone.getPlayer(Source);local CitizenId=Player and Player.PlayerData.citizenid;local MyPhone=Phone.activeNumber(Source)
    local GroupId=Phone.string(Data.GroupId,50);local MessageId=Phone.number(Data.MessageId,2147483647);local Reaction=Phone.string(Data.Reaction,24,true)
    local allowed={['❤️']=true,['👍']=true,['😂']=true,['😮']=true,['😢']=true,['🔥']=true,['🙏']=true}
    if not Player or not CitizenId or not MyPhone or not GroupId or not GroupId:match('^GRP%d+$') or not MessageId or Reaction==nil or (Reaction~='' and not allowed[Reaction]) then return Cb(Phone.publicError('Reaction unavailable.')) end
    if not Phone.rate(Source,'group-reaction',20,1000) or not IsGroupMember(GroupId,MyPhone) then return Cb(Phone.publicError('Group conversation unavailable.')) end
    local target=PhoneDB.one('SELECT id FROM phone_group_messages WHERE id=? AND group_id=?',{MessageId,GroupId})
    if not target then return Cb(Phone.publicError('That message is unavailable in this group.')) end
    local memberReady=IsGroupMember(GroupId,MyPhone)
    local targetReady=PhoneDB.one('SELECT id FROM phone_group_messages WHERE id=? AND group_id=?',{MessageId,GroupId})
    local currentPhone=Phone.activeNumber(Source)
    local sameCharacter=Phone.sameCharacter(Source,CitizenId)
    if not memberReady or not targetReady or currentPhone~=MyPhone or not sameCharacter then return Cb(Phone.publicError('Character, SIM, or group membership changed.')) end
    local ok
    if Reaction=='' then
        ok=PhoneDB.update('DELETE r FROM phone_group_message_reactions r INNER JOIN phone_group_messages m ON m.id=r.message_id INNER JOIN phone_group_members gm ON gm.group_id=m.group_id AND gm.phone=? WHERE m.id=? AND m.group_id=? AND r.actor_phone=?',{MyPhone,MessageId,GroupId,MyPhone})
    else
        ok=PhoneDB.update('INSERT INTO phone_group_message_reactions(message_id,actor_phone,reaction,created_at) SELECT m.id,?,?,? FROM phone_group_messages m INNER JOIN phone_group_members gm ON gm.group_id=m.group_id AND gm.phone=? WHERE m.id=? AND m.group_id=? ON DUPLICATE KEY UPDATE reaction=VALUES(reaction),created_at=VALUES(created_at)',{MyPhone,Reaction,os.time()*1000,MyPhone,MessageId,GroupId})
    end
    if ok==nil or ok==false or (Reaction~='' and type(ok)=='number' and ok<1) then return Cb(Phone.publicError('Reaction was not saved.')) end
    local targetAfter=PhoneDB.one('SELECT id FROM phone_group_messages WHERE id=? AND group_id=?',{MessageId,GroupId})
    local memberAfter=IsGroupMember(GroupId,MyPhone)
    local phoneAfter=Phone.activeNumber(Source)
    local characterAfter=Phone.sameCharacter(Source,CitizenId)
    if not targetAfter or not memberAfter or phoneAfter~=MyPhone or not characterAfter then return Cb(Phone.publicError('Character, SIM, or group membership changed. Refresh the conversation.')) end
    local recipients={}
    for _,Member in ipairs(GetOnlineGroupMembers(GroupId,nil)) do
        local recipient=tonumber(Member.PlayerData.source);local recipientPhone=recipient and Phone.activeNumber(recipient)
        if recipient and recipientPhone==Member.PlayerData.charinfo.phone then recipients[#recipients+1]=recipient end
    end
    local targetBroadcast=PhoneDB.one('SELECT id FROM phone_group_messages WHERE id=? AND group_id=?',{MessageId,GroupId})
    local memberBroadcast=IsGroupMember(GroupId,MyPhone)
    local phoneBroadcast=Phone.activeNumber(Source)
    local characterBroadcast=Phone.sameCharacter(Source,CitizenId)
    if not targetBroadcast or not memberBroadcast or phoneBroadcast~=MyPhone or not characterBroadcast then return Cb(Phone.publicError('Character, SIM, or group membership changed. Refresh the conversation.')) end
    for _,recipient in ipairs(recipients) do TriggerClientEvent('peak-phone:Client:Groups:RefreshMessages',recipient,{GroupId=GroupId,MessageId=MessageId},false) end
    Cb({Success=true,MessageId=MessageId})
end)

-- =============================================
-- Send Group Message
-- =============================================
Peak.Functions.CreateCallback("peak-phone:Server:Groups:SendMessage", function(Source, Cb, Data)
    Data=type(Data)=='table' and Data or {}
    local Player=Phone.getPlayer(Source);local CitizenId=Player and Player.PlayerData.citizenid;local MyPhone=Phone.activeNumber(Source)
    local GroupId=Phone.string(Data.GroupId,50)
    if GroupId and not GroupId:match('^GRP%d+$') then GroupId=nil end
    if not Player or not CitizenId or not MyPhone or not GroupId then return Cb(Phone.publicError('Group conversation unavailable.')) end
    if not IsNetworkEnabled then return Cb(Phone.publicError('No internet access.')) end
    if not Phone.rate(Source,'group-message',8,1000) then return Cb(Phone.publicError('Please wait before sending another group message.')) end
    if not IsGroupMember(GroupId,MyPhone) then return Cb(Phone.publicError('You are not a member of this group.')) end
    local message=Data.Message or '';local attachments=Phone.attachmentList(Data.Attachments)
    if not Phone.messageBody(message) or not attachments or (message=='' and #attachments==0) then return Cb(Phone.publicError('Invalid group message.')) end
    if Phone.hasMemoAttachment and Phone.hasMemoAttachment(attachments) and not Phone.validateMemoAttachments(Source,attachments) then return Cb(Phone.publicError('That recording is unavailable to you.')) end
    if Phone.activeNumber(Source)~=MyPhone or not Phone.sameCharacter(Source,CitizenId) then return Cb(Phone.publicError('Character or SIM changed.')) end
    if Phone.hasCashAttachment(attachments) and (not Phone.validateCashMessage or not Phone.validateCashMessage(Source,nil,GroupId,attachments)) then return Cb(Phone.publicError('That iFruit Cash item does not belong in this conversation.')) end
    local reply=Phone.number(Data.ReplyTo,2147483647)
    if Data.ReplyTo~=nil and not reply then return Cb(Phone.publicError('The replied-to message is unavailable in this group.')) end
    local nonce=Phone.string(Data.OperationId,80)
    if not nonce then return Cb(Phone.publicError('A stable operation ID is required.')) end
    local attachmentJson=json.encode(attachments);local Timestamp=os.time()*1000
    local function actorCurrent() local phone=Phone.activeNumber(Source);local same=Phone.sameCharacter(Source,CitizenId);return phone==MyPhone and same end
    if reply and not PhoneDB.one('SELECT id FROM phone_group_messages WHERE group_id=? AND id=?',{GroupId,reply}) then return Cb(Phone.publicError('The replied-to message is unavailable in this group.')) end
    local replay=PhoneDB.one('SELECT id,timestamp,message,attachments,reply_to FROM phone_group_messages WHERE group_id=? AND sender_phone=? AND client_nonce=?',{GroupId,MyPhone,nonce})
    local memberReady=IsGroupMember(GroupId,MyPhone)
    local replyReady=not reply or PhoneDB.one('SELECT id FROM phone_group_messages WHERE group_id=? AND id=?',{GroupId,reply})~=nil
    if not actorCurrent() or not memberReady or not replyReady then return Cb(Phone.publicError('Character, SIM, group membership, or reply target changed. Refresh the conversation.')) end
    if replay then
        if replay.message~=message or not Phone.sameAttachments(replay.attachments,attachments) or tonumber(replay.reply_to)~=reply then return Cb(Phone.publicError('Message reference does not match the saved message.')) end
        return Cb({Success=true,Id=tonumber(replay.id),MessageId=tonumber(replay.id),Timestamp=tonumber(replay.timestamp),Replayed=true})
    end
    local ok,MessageId=pcall(PhoneDB.insert,[[
        INSERT INTO phone_group_messages (group_id,sender_phone,message,attachments,client_nonce,timestamp,reply_to)
        SELECT @GroupId,@Phone,@Message,@Attachments,@Nonce,@Timestamp,@ReplyTo
        FROM phone_group_members AS current_member
        LEFT JOIN phone_group_messages AS reply_target
          ON reply_target.group_id=@GroupId AND reply_target.id=@ReplyTo
        WHERE current_member.group_id=@GroupId AND current_member.phone=@Phone
          AND (@ReplyTo IS NULL OR reply_target.id IS NOT NULL)
    ]],{GroupId=GroupId,Phone=MyPhone,Message=message,Attachments=attachmentJson,Nonce=nonce,Timestamp=Timestamp,ReplyTo=reply})
    if not ok then return Cb(Phone.publicError('The group message could not be committed. Reopen Messages to check before retrying.')) end
    MessageId=tonumber(MessageId)
    if not MessageId or MessageId<1 then return Cb(Phone.publicError('Group membership or reply target changed before the message was saved.')) end
    local memberAfter=IsGroupMember(GroupId,MyPhone)
    if not actorCurrent() or not memberAfter then return Cb(Phone.publicError('The message was saved under your prior phone identity. Refresh the conversation before retrying.')) end
    local GroupInfo=PhoneDB.query('SELECT name FROM phone_groups WHERE group_id=@GroupId',{['@GroupId']=GroupId})
    local GroupName=GroupInfo[1] and GroupInfo[1].name or 'Group'
    local OnlineMembers=GetOnlineGroupMembers(GroupId,MyPhone);local recipients={}
    for _,Member in ipairs(OnlineMembers) do
        local recipient=tonumber(Member.PlayerData.source);local recipientCid=Member.PlayerData.citizenid;local recipientPhone=recipient and Phone.activeNumber(recipient)
        if recipient and recipientPhone==Member.PlayerData.charinfo.phone then
            local senderName=GetMemberName(recipientCid,MyPhone)
            recipients[#recipients+1]={source=recipient,cid=recipientCid,phone=recipientPhone,senderName=senderName}
        end
    end
    local latestMembers=PhoneDB.query('SELECT phone FROM phone_group_members WHERE group_id=@GroupId',{['@GroupId']=GroupId}) or {};local inGroup={}
    for _,member in ipairs(latestMembers) do inGroup[member.phone]=true end
    local currentPhone=Phone.activeNumber(Source);local sameCharacter=Phone.sameCharacter(Source,CitizenId)
    if currentPhone~=MyPhone or not sameCharacter or not inGroup[MyPhone] then return Cb(Phone.publicError('The message was saved, but the conversation identity changed. Refresh before retrying.')) end
    TriggerClientEvent('peak-phone:Client:Groups:RefreshMessages',Source,{GroupId=GroupId,MessageId=MessageId},false)
    for _,recipient in ipairs(recipients) do
        if inGroup[recipient.phone] and Phone.activeNumber(recipient.source)==recipient.phone and Phone.sameCharacter(recipient.source,recipient.cid) then
            TriggerClientEvent('peak-phone:Client:Groups:RefreshMessages',recipient.source,{GroupId=GroupId,GroupName=GroupName,MessageId=MessageId,SenderName=recipient.senderName,Message=Phone.messagePreview(message,attachments)},true)
        end
    end
    Cb({Success=true,Id=MessageId,MessageId=MessageId,Timestamp=Timestamp})
end)

-- =============================================
-- Get Group Info
-- =============================================
Peak.Functions.CreateCallback("peak-phone:Server:Groups:GetInfo", function(Source, Cb, Data)
    local Player = Peak.Functions.GetPlayer(Source)
    if Player == nil then return Cb({}) end

    local MyPhone = exports['peak-phone']:GetActivePhoneNumber(Source)
    if not MyPhone then return Cb({}) end

    if not IsGroupMember(Data.GroupId, MyPhone) then
        return Cb({})
    end

    -- Get group details
    local GroupData = PhoneDB.query('SELECT * FROM phone_groups WHERE group_id = @GroupId', {
        ['@GroupId'] = Data.GroupId
    })

    if not GroupData[1] then
        return Cb({})
    end

    -- Get members
    local Members = PhoneDB.query('SELECT * FROM phone_group_members WHERE group_id = @GroupId ORDER BY joined_at ASC', {
        ['@GroupId'] = Data.GroupId
    })

    local MemberList = {}
    for _, member in pairs(Members) do
        table.insert(MemberList, {
            phone = member.phone,
            name = GetMemberName(Player.PlayerData.citizenid, member.phone),
            joined_at = member.joined_at,
            is_creator = member.phone == GroupData[1].creator_phone,
            is_admin = (member.is_admin == true or tonumber(member.is_admin) == 1)
        })
    end

    Cb({
        group_id = GroupData[1].group_id,
        name = GroupData[1].name,
        creator_phone = GroupData[1].creator_phone,
        is_creator = GroupData[1].creator_phone == MyPhone,
        created_at = GroupData[1].created_at,
        members = MemberList
    })
end)

-- =============================================
-- Add Group Member
-- =============================================
Peak.Functions.CreateCallback("peak-phone:Server:Groups:AddMember", function(Source, Cb, Data)
    local Player = Peak.Functions.GetPlayer(Source)
    if Player == nil then return Cb({Success = false, Msg = "Invalid Player"}) end

    local MyPhone = exports['peak-phone']:GetActivePhoneNumber(Source)
    if not MyPhone then return Cb({Success = false, Msg = "No SIM card detected"}) end

    if not IsGroupCreator(Data.GroupId, MyPhone) and not IsGroupAdmin(Data.GroupId, MyPhone) then
        return Cb({Success = false, Msg = "Only the group creator or admins can add members"})
    end

    local CurrentCount = GetGroupMemberCount(Data.GroupId)
    if CurrentCount >= MAX_GROUP_MEMBERS then
        return Cb({Success = false, Msg = "Group is full (max " .. MAX_GROUP_MEMBERS .. " members)"})
    end

    if IsGroupMember(Data.GroupId, Data.Phone) then
        return Cb({Success = false, Msg = "This person is already in the group"})
    end

    local Timestamp = os.time() * 1000

    PhoneDB.query("INSERT INTO phone_group_members (group_id, phone, joined_at) VALUES (@GroupId, @Phone, @Timestamp)", {
        ['@GroupId'] = Data.GroupId,
        ['@Phone'] = Data.Phone,
        ['@Timestamp'] = Timestamp
    })

    -- Get group name for notification
    local GroupInfo = PhoneDB.query('SELECT name FROM phone_groups WHERE group_id = @GroupId', {
        ['@GroupId'] = Data.GroupId
    })
    local GroupName = GroupInfo[1] and GroupInfo[1].name or "Group"

    -- Notify new member if online
    local NewMember = Peak.Functions.GetPlayerByPhone(Data.Phone)
    if NewMember then
        TriggerClientEvent('peak-phone:Client:Groups:RefreshGroups', NewMember.PlayerData.source, {
            Name = GroupName,
            GroupId = Data.GroupId
        }, true)
    end

    Cb({Success = true})
end)

-- =============================================
-- Remove Group Member
-- =============================================
Peak.Functions.CreateCallback("peak-phone:Server:Groups:RemoveMember", function(Source, Cb, Data)
    local Player = Peak.Functions.GetPlayer(Source)
    if Player == nil then return Cb({Success = false, Msg = "Invalid Player"}) end

    local MyPhone = exports['peak-phone']:GetActivePhoneNumber(Source)
    if not MyPhone then return Cb({Success = false, Msg = "No SIM card detected"}) end

    if not IsGroupCreator(Data.GroupId, MyPhone) and not IsGroupAdmin(Data.GroupId, MyPhone) then
        return Cb({Success = false, Msg = "Only the group creator or admins can remove members"})
    end

    if Data.Phone == MyPhone then
        return Cb({Success = false, Msg = "You cannot remove yourself. Use 'Leave Group' instead."})
    end

    -- Check permissions: Admin cannot kick Creator or other Admins (unless Creator)
    local IsCreator = IsGroupCreator(Data.GroupId, MyPhone)
    local TargetIsCreator = IsGroupCreator(Data.GroupId, Data.Phone)
    if TargetIsCreator then
         return Cb({Success = false, Msg = "Cannot remove the group creator"})
    end

    if not IsCreator then
        -- Sender is just an Admin
        local TargetIsAdmin = IsGroupAdmin(Data.GroupId, Data.Phone)
        if TargetIsAdmin then
             return Cb({Success = false, Msg = "Admins cannot remove other admins"})
        end
    end


    PhoneDB.query("DELETE FROM phone_group_members WHERE group_id = @GroupId AND phone = @Phone", {
        ['@GroupId'] = Data.GroupId,
        ['@Phone'] = Data.Phone
    })

    -- Also remove their read status
    PhoneDB.query("DELETE FROM phone_group_read_status WHERE group_id = @GroupId AND phone = @Phone", {
        ['@GroupId'] = Data.GroupId,
        ['@Phone'] = Data.Phone
    })

    -- Notify removed member if online
    local RemovedMember = Peak.Functions.GetPlayerByPhone(Data.Phone)
    if RemovedMember then
        TriggerClientEvent('peak-phone:Client:Groups:RefreshGroups', RemovedMember.PlayerData.source, {}, false)
    end

    Cb({Success = true})
end)

-- =============================================
-- Leave Group
-- =============================================
Peak.Functions.CreateCallback("peak-phone:Server:Groups:LeaveGroup", function(Source, Cb, Data)
    local Player = Peak.Functions.GetPlayer(Source)
    if Player == nil then return Cb({Success = false, Msg = "Invalid Player"}) end

    local MyPhone = exports['peak-phone']:GetActivePhoneNumber(Source)
    if not MyPhone then return Cb({Success = false, Msg = "No SIM card detected"}) end

    if not IsGroupMember(Data.GroupId, MyPhone) then
        return Cb({Success = false, Msg = "You are not a member of this group"})
    end

    -- If creator is leaving, delete the whole group
    if IsGroupCreator(Data.GroupId, MyPhone) then
        -- Notify all members before deletion
        local OnlineMembers = GetOnlineGroupMembers(Data.GroupId, MyPhone)
        for _, Member in pairs(OnlineMembers) do
            TriggerClientEvent('peak-phone:Client:Groups:RefreshGroups', Member.PlayerData.source, {}, false)
        end

        -- Delete all group data
        PhoneDB.query("DELETE FROM phone_group_messages WHERE group_id = @GroupId", { ['@GroupId'] = Data.GroupId })
        PhoneDB.query("DELETE FROM phone_group_members WHERE group_id = @GroupId", { ['@GroupId'] = Data.GroupId })
        PhoneDB.query("DELETE FROM phone_group_read_status WHERE group_id = @GroupId", { ['@GroupId'] = Data.GroupId })
        PhoneDB.query("DELETE FROM phone_groups WHERE group_id = @GroupId", { ['@GroupId'] = Data.GroupId })

        return Cb({Success = true, Deleted = true})
    end

    -- Regular member leaving
    PhoneDB.query("DELETE FROM phone_group_members WHERE group_id = @GroupId AND phone = @Phone", {
        ['@GroupId'] = Data.GroupId,
        ['@Phone'] = MyPhone
    })

    PhoneDB.query("DELETE FROM phone_group_read_status WHERE group_id = @GroupId AND phone = @Phone", {
        ['@GroupId'] = Data.GroupId,
        ['@Phone'] = MyPhone
    })

    Cb({Success = true})
end)

-- =============================================
-- Set Group Read Status
-- =============================================
RegisterNetEvent("peak-phone:Server:Groups:SetRead")
AddEventHandler("peak-phone:Server:Groups:SetRead", function(Data)
    local Source = source
    local Player = Peak.Functions.GetPlayer(Source)
    if Player == nil then return end

    local MyPhone = exports['peak-phone']:GetActivePhoneNumber(Source)
    if not MyPhone then return end
    local Timestamp = os.time() * 1000

    PhoneDB.query([[
        INSERT INTO phone_group_read_status (group_id, phone, last_read_timestamp) 
        VALUES (@GroupId, @Phone, @Timestamp)
        ON DUPLICATE KEY UPDATE last_read_timestamp = @Timestamp
    ]], {
        ['@GroupId'] = Data.GroupId,
        ['@Phone'] = MyPhone,
        ['@Timestamp'] = Timestamp
    })
end)

-- =============================================
-- Check for Unread Group Messages
-- =============================================
Peak.Functions.CreateCallback("peak-phone:Server:Groups:HasUnread", function(Source, Cb)
    local Player = Peak.Functions.GetPlayer(Source)
    if Player == nil then return Cb(false) end

    local MyPhone = exports['peak-phone']:GetActivePhoneNumber(Source)
    if not MyPhone then return Cb(false) end

    local Result = PhoneDB.query([[
        SELECT gm.group_id, gm.timestamp, COALESCE(grs.last_read_timestamp, 0) as last_read
        FROM phone_group_messages gm
        INNER JOIN phone_group_members gmem ON gm.group_id = gmem.group_id
        LEFT JOIN phone_group_read_status grs ON gm.group_id = grs.group_id AND grs.phone = @Phone
        WHERE gmem.phone = @Phone AND gm.sender_phone != @Phone
        AND gm.timestamp > COALESCE(grs.last_read_timestamp, 0)
        LIMIT 1
    ]], { ['@Phone'] = MyPhone })

    Cb(Result[1] ~= nil)
end)

-- =============================================
-- Toggle Group Admin
-- =============================================
Peak.Functions.CreateCallback("peak-phone:Server:Groups:ToggleAdmin", function(Source, Cb, Data)
    local Player = Peak.Functions.GetPlayer(Source)
    if Player == nil then return Cb({Success = false, Msg = "Invalid Player"}) end

    local MyPhone = exports['peak-phone']:GetActivePhoneNumber(Source)
    if not MyPhone then return Cb({Success = false, Msg = "No SIM card detected"}) end

    if not IsGroupCreator(Data.GroupId, MyPhone) then
        return Cb({Success = false, Msg = "Only the group creator can manage admins"})
    end

    if Data.Phone == MyPhone then
        return Cb({Success = false, Msg = "You are the creator"})
    end

    local NewState = Data.State and 1 or 0
    PhoneDB.query("UPDATE phone_group_members SET is_admin = @State WHERE group_id = @GroupId AND phone = @Phone", {
        ['@GroupId'] = Data.GroupId,
        ['@Phone'] = Data.Phone,
        ['@State'] = NewState
    })

    -- Notify member
    local Member = Peak.Functions.GetPlayerByPhone(Data.Phone)
    if Member then
        TriggerClientEvent('peak-phone:Client:Groups:RefreshGroups', Member.PlayerData.source, {
            Name = "Group Update", 
            GroupId = Data.GroupId
        }, false)
    end
    
    Cb({Success = true})
end)
