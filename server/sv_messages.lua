local function messagesActorCurrent(src,cid,number)
    return cid and number and Phone.activeNumber(src)==number and Phone.sameCharacter(src,cid)
end
Peak.Functions.CreateCallback('peak-phone:Server:HasUnreadConversations',function(src,cb)
    local p=Peak.Functions.GetPlayer(src);local number=Phone.activeNumber(src);local cid=p and p.PlayerData.citizenid
    if not p or not number then return cb(false) end
    local row=PhoneDB.one('SELECT COUNT(*) n FROM phone_messages WHERE to_phone=? AND unread=1',{number})
    if not messagesActorCurrent(src,cid,number) then return cb(false) end
    cb((tonumber(row and row.n) or 0)>0)
end)
Peak.Functions.CreateCallback('peak-phone:Server:Messages:GetChats',function(src,cb)
    local p=Peak.Functions.GetPlayer(src);local number=Phone.activeNumber(src);local cid=p and p.PlayerData.citizenid;if not p or not number then return cb({}) end
    local rows=PhoneDB.query('SELECT * FROM phone_messages WHERE from_phone=? OR to_phone=? ORDER BY timestamp DESC,id DESC LIMIT 1500',{number,number})
    local chats,phones,bytes={},{},0
    for _,r in ipairs(rows) do
        bytes=bytes+#(r.message or '')+#(r.attachments or '')+250;if bytes>1000000 then break end
        local other=r.to_phone==number and r.from_phone or r.to_phone
        if not chats[other] then chats[other]={from_phone=number,to_phone=other,name=GetContactName(p.PlayerData.citizenid,other),messages={}};phones[#phones+1]=other end
        chats[other].messages[#chats[other].messages+1]={Id=tonumber(r.id),Sender=r.from_phone,Message=r.message,Attachments=Phone.decode(r.attachments,{}),Timestamp=tonumber(r.timestamp) or 0,Unread=tonumber(r.unread),Read=tonumber(r.unread)==0,ReplyTo=tonumber(r.reply_to)}
    end
    local avatars=#phones>0 and GetAvatarsForPhones(phones) or {};for other,c in pairs(chats) do c.Avatar=avatars[other] end
    if not messagesActorCurrent(src,cid,number) then return cb({}) end
    cb(chats)
end)
-- Also used by Gallery through a trusted server call, not a spoofable source argument from a client.
function Phone.sendMessage(src,data)
    data=type(data)=='table' and data or {}
    local p=Peak.Functions.GetPlayer(src);local number=Phone.activeNumber(src);local target=Phone.phone(data.Phone)
    local cid=p and p.PlayerData.citizenid;local body=data.Message or '';local attachments=Phone.attachmentList(data.Attachments)
    local reply
    if data.ReplyTo~=nil and data.ReplyTo~='' then reply=Phone.number(data.ReplyTo,2147483647);if not reply then return Phone.publicError('The replied-to message is unavailable.') end end
    if not p or not number or not target or not Phone.messageBody(body) or not attachments or (body=='' and #attachments==0) then return Phone.publicError('Enter a valid number and a message or supported attachment.') end
    local function currentActor() return Phone.activeNumber(src)==number and Phone.sameCharacter(src,cid) end
    if not currentActor() then return Phone.publicError('Character or SIM changed.') end
    if Phone.hasMemoAttachment and Phone.hasMemoAttachment(attachments) and not Phone.validateMemoAttachments(src,attachments) then return Phone.publicError('That recording is unavailable to you.') end
    if not currentActor() then return Phone.publicError('Character or SIM changed while checking the recording.') end
    if Phone.hasCashAttachment(attachments) and (not Phone.validateCashMessage or not Phone.validateCashMessage(src,target,nil,attachments)) then return Phone.publicError('That iFruit Cash item does not belong in this conversation.') end
    if not currentActor() then return Phone.publicError('Character or SIM changed while validating the cash receipt.') end
    if not IsNetworkEnabled then return Phone.publicError('Phone network is unavailable.') end
    local targetExists=PhoneDB.one('SELECT id FROM sim_cards WHERE phone_number=?',{target})
    if not currentActor() then return Phone.publicError('Character or SIM changed while checking the recipient.') end
    if not targetExists then return Phone.publicError('That phone number does not exist.') end
    local nonce=Phone.string(data.OperationId or data.Nonce,80) or Phone.token()
    local encodedAttachments=json.encode(attachments)
    local previous=PhoneDB.one('SELECT id,timestamp,to_phone,message,attachments,reply_to FROM phone_messages WHERE from_phone=? AND client_nonce=?',{number,nonce})
    if not currentActor() then return Phone.publicError('Character or SIM changed while checking the message reference.') end
    if previous then
        if previous.to_phone~=target or previous.message~=body or not Phone.sameAttachments(previous.attachments,attachments) or tonumber(previous.reply_to)~=reply then return Phone.publicError('Message reference does not match the saved destination or content.') end
        return {Success=true,MessageId=tonumber(previous.id),Timestamp=tonumber(previous.timestamp),OperationId=nonce,Replayed=true}
    end
    if reply then
        local parent=PhoneDB.one('SELECT id FROM phone_messages WHERE id=? AND ((from_phone=? AND to_phone=?) OR (from_phone=? AND to_phone=?))',{reply,number,target,target,number})
        if not currentActor() then return Phone.publicError('Character or SIM changed while checking the replied-to message.') end
        if not parent then return Phone.publicError('The replied-to message is unavailable.') end
    end
    if Phone.hasCashAttachment(attachments) then
        if not Phone.validateCashMessage or not Phone.validateCashMessage(src,target,nil,attachments) then return Phone.publicError('That iFruit Cash item does not belong in this conversation.') end
        if not currentActor() then return Phone.publicError('Character or SIM changed while revalidating the cash receipt.') end
    end
    if not currentActor() then return Phone.publicError('Character or SIM changed before saving the message.') end
    local timestamp=os.time()*1000
    local messageId=PhoneDB.insert([[INSERT INTO phone_messages (from_phone,to_phone,message,attachments,timestamp,unread,client_nonce,reply_to)
        SELECT ?,?,?,?,?,1,?,?
        FROM (SELECT 1 AS anchor) AS seed LEFT JOIN phone_messages AS reply_target
          ON reply_target.id=? AND ((reply_target.from_phone=? AND reply_target.to_phone=?) OR (reply_target.from_phone=? AND reply_target.to_phone=?))
        WHERE ? IS NULL OR reply_target.id IS NOT NULL
    ]],{number,target,body,encodedAttachments,timestamp,nonce,reply,reply,number,target,target,number,reply})
    if not messageId or tonumber(messageId)<=0 then return Phone.publicError('The message or replied-to message was not saved. Retry with the same operation ID.') end
    if not currentActor() then return Phone.publicError('The message was saved, but your phone identity changed. Reconcile before retrying.') end
    TriggerClientEvent('peak-phone:Client:Messages:RefreshMessagesChat',src,{Phone=target,MessageId=tonumber(messageId)},false)
    local preference=PhoneDB.one('SELECT muted FROM phone_conversation_preferences WHERE owner_phone=? AND peer_phone=?',{target,number})
    local to=Phone.sourceByPhone(target);local recipient=to and Peak.Functions.GetPlayer(to)
    if recipient then TriggerClientEvent('peak-phone:Client:Messages:RefreshMessagesChat',to,{Name=GetContactName(Phone.simCitizenId(to),number),Phone=number,MessageId=tonumber(messageId),Muted=tonumber(preference and preference.muted or 0)==1,Message=Phone.messagePreview(body,attachments)},true) end
    return {Success=true,MessageId=tonumber(messageId),Timestamp=timestamp,OperationId=nonce}
end
Peak.Functions.CreateCallback('peak-phone:Server:Messages:SendMessage',function(src,cb,data) cb(Phone.sendMessage(src,data)) end)
RegisterNetEvent('peak-phone:Server:Messages:SetChatRead',function(data)
    local src=source;local p=Peak.Functions.GetPlayer(src);local cid=p and p.PlayerData.citizenid;local number=Phone.activeNumber(src);local other=type(data)=='table' and Phone.phone(data.ToPhone)
    if number and other and messagesActorCurrent(src,cid,number) then PhoneDB.update('UPDATE phone_messages SET unread=0 WHERE from_phone=? AND to_phone=?',{other,number}) end
end)
RegisterNetEvent('peak-phone:Server:Messages:MarkAllAsRead',function()
    local src=source;local p=Peak.Functions.GetPlayer(src);local cid=p and p.PlayerData.citizenid;local number=Phone.activeNumber(src);if not number or not messagesActorCurrent(src,cid,number) then return end
    PhoneDB.update('UPDATE phone_messages SET unread=0 WHERE to_phone=?',{number})
    if messagesActorCurrent(src,cid,number) then TriggerClientEvent('peak-phone:Client:Messages:RefreshMessagesChat',src,{},false) end
end)

local function messageActor(src)
    local p=Peak.Functions.GetPlayer(src);local number=Phone.activeNumber(src)
    return p,number
end
local function cursor(data)
    local n=tonumber(type(data)=='table' and (data.Before or data.After));return n and n>0 and math.floor(n) or nil
end
local function dto(row,viewerPhone)
    local attachments=Phone.decode(row.attachments,{})
    if Phone.decorateCashAttachments then attachments=Phone.decorateCashAttachments(viewerPhone,nil,attachments) end
    return {Id=tonumber(row.id),From=row.from_phone,To=row.to_phone,Message=row.message,Attachments=attachments,Timestamp=tonumber(row.timestamp) or 0,Unread=tonumber(row.unread)==1,Read=tonumber(row.unread)==0,ReplyTo=tonumber(row.reply_to),Reactions={}}
end
local function attachReactions(items)
    if #items==0 then return end
    local ids,marks={},{ }
    for _,item in ipairs(items) do ids[#ids+1]=item.Id;marks[#marks+1]='?' end
    local grouped={}
    for _,row in ipairs(PhoneDB.query('SELECT message_id,actor_phone,reaction FROM phone_message_reactions WHERE message_id IN ('..table.concat(marks,',')..') ORDER BY created_at,actor_phone',ids) or {}) do
        local id=tonumber(row.message_id);grouped[id]=grouped[id] or {};grouped[id][#grouped[id]+1]={Phone=row.actor_phone,Reaction=row.reaction}
    end
    for _,item in ipairs(items) do item.Reactions=grouped[item.Id] or {} end
end
Peak.Functions.CreateCallback('peak-phone:Server:Messages:GetInbox',function(src,cb,data)
    local p,number=messageActor(src);local cid=p and p.PlayerData.citizenid;if not p or not number then return cb(Phone.publicError('Phone identity is unavailable.')) end
    local before=cursor(data) or 2147483647
    local rows=PhoneDB.query([[SELECT m.*,COALESCE(pref.muted,0) muted FROM phone_messages m JOIN (SELECT CASE WHEN from_phone=? THEN to_phone ELSE from_phone END peer,MAX(id) last_id FROM phone_messages WHERE from_phone=? OR to_phone=? GROUP BY peer) x ON x.last_id=m.id LEFT JOIN phone_conversation_preferences pref ON pref.owner_phone=? AND pref.peer_phone=x.peer WHERE x.last_id<? ORDER BY x.last_id DESC LIMIT 41]],{number,number,number,number,before})
    if not messagesActorCurrent(src,cid,number) then return cb(Phone.publicError('Phone identity changed. Refresh your inbox.')) end
    local out={};for i,row in ipairs(rows or {}) do if i<=40 then local item=dto(row,number);item.Peer=row.from_phone==number and row.to_phone or row.from_phone;item.Muted=tonumber(row.muted)==1;out[#out+1]=item end end
    attachReactions(out)
    if not messagesActorCurrent(src,cid,number) then return cb(Phone.publicError('Phone identity changed. Refresh your inbox.')) end
    cb({Success=true,Conversations=out,Next=#rows>40 and tonumber(rows[40].id) or nil,HasMore=#rows>40})
end)
Peak.Functions.CreateCallback('peak-phone:Server:Messages:GetHistory',function(src,cb,data)
    local p,number=messageActor(src);local cid=p and p.PlayerData.citizenid;local peer=type(data)=='table' and Phone.phone(data.Phone);if not p or not number or not peer then return cb(Phone.publicError('Conversation unavailable.')) end
    local before=cursor(data) or 2147483647
    local rows=PhoneDB.query([[SELECT * FROM phone_messages WHERE id<? AND ((from_phone=? AND to_phone=?) OR (from_phone=? AND to_phone=?)) ORDER BY id DESC LIMIT 51]],{before,number,peer,peer,number})
    if not messagesActorCurrent(src,cid,number) then return cb(Phone.publicError('Phone identity changed. Refresh the conversation.')) end
    local out={};for i,row in ipairs(rows or {}) do if i<=50 then local item=dto(row,number);item.Own=row.from_phone==number;out[#out+1]=item end end
    if not messagesActorCurrent(src,cid,number) then return cb(Phone.publicError('Phone identity changed. Refresh your inbox.')) end
    attachReactions(out)
    if not messagesActorCurrent(src,cid,number) then return cb(Phone.publicError('Phone identity changed. Refresh the conversation.')) end
    local read=PhoneDB.update('UPDATE phone_messages SET unread=0 WHERE from_phone=? AND to_phone=? AND unread=1',{peer,number})
    if read==nil or read==false then return cb(Phone.publicError('Conversation read state could not be saved.')) end
    if not messagesActorCurrent(src,cid,number) then return cb(Phone.publicError('Phone identity changed. Refresh the conversation.')) end
    cb({Success=true,Messages=out,Next=#rows>50 and tonumber(rows[50].id) or nil,HasMore=#rows>50})
end)
Peak.Functions.CreateCallback('peak-phone:Server:Messages:GetHistoryAround',function(src,cb,data)
    data=type(data)=='table' and data or {}
    local p,number=messageActor(src);local cid=p and p.PlayerData.citizenid;local peer=Phone.phone(data.Phone)
    local around=Phone.number(data.MessageId,2147483647);local before=Phone.number(data.Before,2147483647);local after=Phone.number(data.After,2147483647)
    if not p or not number or not peer then return cb(Phone.publicError('Conversation unavailable.')) end
    local pair='((from_phone=? AND to_phone=?) OR (from_phone=? AND to_phone=?))'
    local rows,prev,nextRows={},nil,nil
    if around then
        local target=PhoneDB.one('SELECT id FROM phone_messages WHERE id=? AND '..pair,{around,number,peer,peer,number})
        if not messagesActorCurrent(src,cid,number) then return cb(Phone.publicError('Phone identity changed. Refresh the conversation.')) end
        if not target then return cb(Phone.publicError('That message is unavailable in this conversation.')) end
        prev=PhoneDB.query('SELECT * FROM phone_messages WHERE '..pair..' AND id<=? ORDER BY id DESC LIMIT 14',{number,peer,peer,number,around}) or {}
        nextRows=PhoneDB.query('SELECT * FROM phone_messages WHERE '..pair..' AND id>? ORDER BY id ASC LIMIT 13',{number,peer,peer,number,around}) or {}
        if not messagesActorCurrent(src,cid,number) then return cb(Phone.publicError('Phone identity changed. Refresh the conversation.')) end
        local retainedTarget=PhoneDB.one('SELECT id FROM phone_messages WHERE id=? AND '..pair,{around,number,peer,peer,number})
        if not messagesActorCurrent(src,cid,number) then return cb(Phone.publicError('Phone identity changed. Refresh the conversation.')) end
        if not retainedTarget or tonumber(retainedTarget.id)~=around or not prev[1] or tonumber(prev[1].id)~=around then return cb(Phone.publicError('That message is no longer available in this conversation.')) end
        local chosen,used={},0
        local function keep(row)
            local size=#(row.message or '')+#(row.attachments or '')+256
            if used+size>900000 then return false end
            used=used+size;chosen[#chosen+1]=row;return true
        end
        if not keep(prev[1]) then return cb(Phone.publicError('That message is too large to open safely.')) end
        local keepPrevious,keepNext=true,true
        for distance=1,12 do
            if keepPrevious and prev[distance+1] and not keep(prev[distance+1]) then keepPrevious=false end
            if keepNext and nextRows[distance] and not keep(nextRows[distance]) then keepNext=false end
        end
        table.sort(chosen,function(a,b)return tonumber(a.id)<tonumber(b.id) end);rows=chosen
    elseif after then
        nextRows=PhoneDB.query('SELECT * FROM phone_messages WHERE '..pair..' AND id>? ORDER BY id ASC LIMIT 51',{number,peer,peer,number,after}) or {}
        local bytes=0
        for i,row in ipairs(nextRows) do local size=#(row.message or '')+#(row.attachments or '')+256;if i>50 or (bytes+size>900000 and #rows>0) then break end;bytes=bytes+size;rows[#rows+1]=row end
    else
        local cursor=before or 2147483647
        prev=PhoneDB.query('SELECT * FROM phone_messages WHERE '..pair..' AND id<? ORDER BY id DESC LIMIT 51',{number,peer,peer,number,cursor}) or {}
        local bytes=0
        for i,row in ipairs(prev) do local size=#(row.message or '')+#(row.attachments or '')+256;if i>50 or (bytes+size>900000 and #rows>0) then break end;bytes=bytes+size;rows[#rows+1]=row end
        table.sort(rows,function(a,b)return tonumber(a.id)<tonumber(b.id) end)
    end
    local out={}
    for _,row in ipairs(rows) do local item=dto(row,number);item.Own=row.from_phone==number;out[#out+1]=item end
    attachReactions(out)
    if not messagesActorCurrent(src,cid,number) then return cb(Phone.publicError('Phone identity changed. Refresh your inbox.')) end
    local hasBefore,hasAfter,nextCursor,afterCursor
    local oldest=#out>0 and out[1].Id or nil;local newest=#out>0 and out[#out].Id or nil
    hasBefore=oldest and PhoneDB.one('SELECT id FROM phone_messages WHERE '..pair..' AND id<? LIMIT 1',{number,peer,peer,number,oldest})~=nil or false
    hasAfter=newest and PhoneDB.one('SELECT id FROM phone_messages WHERE '..pair..' AND id>? LIMIT 1',{number,peer,peer,number,newest})~=nil or false
    nextCursor=hasBefore and oldest or nil;afterCursor=hasAfter and newest or nil
    if not messagesActorCurrent(src,cid,number) then return cb(Phone.publicError('Phone identity changed. Refresh the conversation.')) end
    local read=PhoneDB.update('UPDATE phone_messages SET unread=0 WHERE from_phone=? AND to_phone=? AND unread=1',{peer,number})
    if read==nil or read==false then return cb(Phone.publicError('Conversation read state could not be saved.')) end
    if Phone.activeNumber(src)~=number or not Phone.sameCharacter(src,cid) then return cb(Phone.publicError('Phone identity changed. Refresh the conversation.')) end
    cb({Success=true,Messages=out,Next=nextCursor,HasMore=hasBefore,After=afterCursor,HasMoreAfter=hasAfter})
end)
Peak.Functions.CreateCallback('peak-phone:Server:Messages:Search',function(src,cb,data)
    local p,number=messageActor(src);local cid=p and p.PlayerData.citizenid;local term=Phone.string(type(data)=='table' and data.Query,80);if not p or not number or not term then return cb(Phone.publicError('Enter a search term.')) end
    local before=cursor(data) or 2147483647
    local rows=PhoneDB.query([[SELECT * FROM phone_messages WHERE id<? AND (from_phone=? OR to_phone=?) AND message LIKE ? ESCAPE '\\' ORDER BY id DESC LIMIT 51]],{before,number,number,'%'..term:gsub('([%%_\\])','\\%1')..'%'})
    if not messagesActorCurrent(src,cid,number) then return cb(Phone.publicError('Phone identity changed. Refresh your inbox.')) end
    local out={};for i,row in ipairs(rows or {}) do if i<=50 then local item=dto(row,number);item.Own=row.from_phone==number;out[#out+1]=item end end
    if not messagesActorCurrent(src,cid,number) then return cb(Phone.publicError('Phone identity changed. Refresh your inbox.')) end
    cb({Success=true,Messages=out,Next=#rows>50 and tonumber(rows[50].id) or nil,HasMore=#rows>50})
end)
Peak.Functions.CreateCallback('peak-phone:Server:Messages:GetOperation',function(src,cb,data)
    local p,number=messageActor(src);local cid=p and p.PlayerData.citizenid;local nonce=Phone.string(type(data)=='table' and (data.OperationId or data.Nonce),80);if not p or not number or not nonce then return cb(Phone.publicError('Operation unavailable.')) end
    local row=PhoneDB.one('SELECT id,timestamp FROM phone_messages WHERE from_phone=? AND client_nonce=?',{number,nonce})
    if not messagesActorCurrent(src,cid,number) then return cb(Phone.publicError('Phone identity changed. Refresh your inbox.')) end
    cb({Success=true,Committed=row~=nil,MessageId=row and tonumber(row.id) or nil,Timestamp=row and tonumber(row.timestamp) or nil})
end)
Peak.Functions.CreateCallback('peak-phone:Server:Messages:SetReaction',function(src,cb,data)
    local p,number=messageActor(src);local cid=p and p.PlayerData.citizenid;local id=tonumber(data and data.MessageId);local reaction=Phone.string(data and data.Reaction or '',24,true)
    if not p or not number or not id or reaction==nil then return cb(Phone.publicError('Reaction unavailable.')) end
    local owned=PhoneDB.one('SELECT id FROM phone_messages WHERE id=? AND (from_phone=? OR to_phone=?)',{id,number,number})
    if not messagesActorCurrent(src,cid,number) then return cb(Phone.publicError('Phone identity changed. Refresh the conversation.')) end
    if not owned then return cb(Phone.publicError('Message unavailable.')) end
    local ok
    if reaction=='' then
        ok=PhoneDB.update('DELETE r FROM phone_message_reactions r INNER JOIN phone_messages m ON m.id=r.message_id WHERE m.id=? AND (m.from_phone=? OR m.to_phone=?) AND r.actor_phone=?',{id,number,number,number})
    else
        ok=PhoneDB.update('INSERT INTO phone_message_reactions(message_id,actor_phone,reaction,created_at) SELECT m.id,?,?,? FROM phone_messages m WHERE m.id=? AND (m.from_phone=? OR m.to_phone=?) ON DUPLICATE KEY UPDATE reaction=VALUES(reaction),created_at=VALUES(created_at)',{number,reaction,os.time()*1000,id,number,number})
    end
    if ok==nil or ok==false or (reaction~='' and type(ok)=='number' and ok<1) then return cb(Phone.publicError('Reaction was not saved.')) end
    if not messagesActorCurrent(src,cid,number) then return cb(Phone.publicError('Phone identity changed. Refresh the conversation.')) end
    cb({Success=true})
end)
Peak.Functions.CreateCallback('peak-phone:Server:Messages:SetMute',function(src,cb,data)
    local p,number=messageActor(src);local cid=p and p.PlayerData.citizenid;local peer=Phone.phone(data and data.Phone);if not p or not number or not peer or type(data.Muted)~='boolean' then return cb(Phone.publicError('Conversation unavailable.')) end
    if not messagesActorCurrent(src,cid,number) then return cb(Phone.publicError('Phone identity changed. Refresh the conversation.')) end
    local ok=PhoneDB.update('INSERT INTO phone_conversation_preferences(owner_phone,peer_phone,muted,updated_at) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE muted=VALUES(muted),updated_at=VALUES(updated_at)',{number,peer,data.Muted and 1 or 0,os.time()*1000})
    if ok==nil or ok==false then return cb(Phone.publicError('Preference was not saved.')) end
    if not messagesActorCurrent(src,cid,number) then return cb(Phone.publicError('Phone identity changed. Refresh your settings.')) end
    cb({Success=true,Muted=data.Muted})
end)
Peak.Functions.CreateCallback('peak-phone:Server:Messages:GetMute',function(src,cb,data)
    local p,number=messageActor(src);local peer=Phone.phone(data and data.Phone);if not p or not number or not peer then return cb(Phone.publicError('Conversation unavailable.')) end
    local cid=p.PlayerData.citizenid
    local row=PhoneDB.one('SELECT muted FROM phone_conversation_preferences WHERE owner_phone=? AND peer_phone=?',{number,peer})
    if not messagesActorCurrent(src,cid,number) then return cb(Phone.publicError('Phone identity changed. Refresh your settings.')) end
    cb({Success=true,Muted=tonumber(row and row.muted or 0)==1})
end)
