-- Y social upgrade. Existing profile/follow/premium tables and billing are retained.
-- Posts, reactions, notifications and reports are restored from durable SQL state.
YApp = {Posts={},Reports={},PremiumUsers={},FollowsReady=false,PersistentReady=false,Follows={},NextId=0,PostCount=0,
    Notifications={},NotificationSeq=0,Session=tostring(os.time())..'-'..tostring(math.random(100000,999999))}
local function fail(message) return {Success=false,Message=message} end
local function readyError() return fail('Y is restoring server data. Try again shortly.') end
local function ready() return YApp.PersistentReady==true end
local function idOf(data)
    local id=type(data)=='table' and tonumber(data.Id)
    if id and id>=1 and id%1==0 then return id end
end
local function displayName(p) return (p.PlayerData.charinfo.firstname or '')..' '..(p.PlayerData.charinfo.lastname or '') end
local function postLock(id) return 'y:post:'..tostring(id) end
local function postCreationLock() return 'y:feed:create' end
local function postReferenceLocks(data)
    local locks={postCreationLock()}
    for _,field in ipairs({'ReplyTo','QuoteId','RepostOf'}) do
        local id=data[field]
        if id then locks[#locks+1]=postLock(id) end
    end
    return locks
end
local function public(post,cid,depth)
    if not post then return nil end
    local out={}
    for _,key in ipairs({'Cid','Id','Msg','Image','Avatar','Sender','Name','Timestamp','IsPremium','ReplyTo','QuoteId','RepostOf','Kind','ReplyCount','RepostCount','QuoteCount'}) do out[key]=post[key] end
    out.Images={};for _,image in ipairs(post.Images or (post.Image and {post.Image}) or {}) do out.Images[#out.Images+1]=image end
    out.HasLiked=post.Likes and post.Likes[cid]==true or false;out.LikeCount=post.LikeCount or 0
    out.HasReposted=post.Reposts and post.Reposts[cid]~=nil or false
    out.IsFollowing=YApp.Follows[post.Cid] and YApp.Follows[post.Cid][cid]==true or false
    if not depth then
        if post.RepostOf then out.Original=public(YApp.Posts[post.RepostOf],cid,1) end
        if post.QuoteId then out.Quote=public(YApp.Posts[post.QuoteId],cid,1) end
    end
    return out
end
local function refreshed() TriggerClientEvent('peak-phone:Client:Y:Refresh',-1) end
local function socialNotice(target,actor,kind,post)
    if not target or target==actor.PlayerData.citizenid then return end
    local cid=actor.PlayerData.citizenid
    local saved,id=pcall(PhoneDB.insert,'INSERT INTO peak_phone_y_notifications(citizenid,actor_cid,kind,post_id,sender,text,created_at) VALUES(?,?,?,?,?,?,?)',{target,cid,kind,post and post.Id or nil,displayName(actor),post and post.Msg or '',os.time()*1000})
    if not saved then return false end
    id=tonumber(id)
    if not id then return false end
    YApp.NotificationSeq=math.max(YApp.NotificationSeq,id)
    local list=YApp.Notifications[target] or {};YApp.Notifications[target]=list
    table.insert(list,1,{Id=id,Type=kind,ActorCid=cid,Sender=displayName(actor),PostId=post and post.Id,
        Text=post and post.Msg or '',Timestamp=os.time()*1000,Unread=true})
    while #list>100 do table.remove(list) end
    return true
end
YApp.SocialNotice=socialNotice
function YApp.GetAvatar(cid,fallback)
    local result=PhoneDB.query('SELECT avatar FROM player_twitter_profiles WHERE citizenid = @Cid',{['@Cid']=cid})
    return result[1] and result[1].avatar or fallback
end
Citizen.CreateThread(function()
    PhoneDB.execute('CREATE TABLE IF NOT EXISTS `player_twitter_follows` (`follower_cid` VARCHAR(50), `target_cid` VARCHAR(50), PRIMARY KEY (`follower_cid`, `target_cid`))',{},function()
        local result=PhoneDB.query('SELECT * FROM player_twitter_follows')
        if result then for _,v in ipairs(result) do YApp.Follows[v.target_cid]=YApp.Follows[v.target_cid] or {};YApp.Follows[v.target_cid][v.follower_cid]=true end;YApp.FollowsReady=true end
    end)
end)
Citizen.CreateThread(function()
    local function mustRows(rows,label)
        if type(rows)~='table' then error('Y restore could not read '..label) end
        return rows
    end
    while not YApp.PersistentReady do
      local ok,err=pcall(function()
        PhoneDB.wait()
        local maximumRows=mustRows(PhoneDB.query('SELECT COALESCE(MAX(id),0) maximum FROM peak_phone_y_posts',{}),'post maximum')
        local maximum=tonumber(maximumRows[1] and maximumRows[1].maximum)
        if not maximum or maximum<0 or maximum%1~=0 then error('Y restore received an invalid post maximum') end
        local postRows=mustRows(PhoneDB.query('SELECT * FROM peak_phone_y_posts WHERE deleted_at IS NULL ORDER BY id ASC LIMIT 10000',{}),'posts')
        local reactionRows=mustRows(PhoneDB.query("SELECT post_id,citizenid FROM peak_phone_y_reactions WHERE kind='like'",{}),'reactions')
        local notificationRows=mustRows(PhoneDB.query('SELECT * FROM peak_phone_y_notifications ORDER BY id DESC LIMIT 10000',{}),'notifications')
        local reportRows=mustRows(PhoneDB.query("SELECT post_id,reporter_cid FROM peak_phone_y_reports WHERE status IN ('open','review')",{}),'reports')
        local restoredPosts,restoredReports,restoredNotifications={},{},{}
        local nextId,postCount,notificationSeq=maximum,0,0
        for _,r in ipairs(postRows) do
            local post={Id=tonumber(r.id),Cid=r.citizenid,Name=r.name,Sender=r.sender,Avatar=r.avatar,Msg=r.message,
                Images=Phone.decode(r.images,{}),Timestamp=tonumber(r.created_at),ReplyTo=tonumber(r.reply_to),QuoteId=tonumber(r.quote_id),RepostOf=tonumber(r.repost_of),Kind=r.kind,
                Likes={},Reposts={},LikeCount=0,RepostCount=0,ReplyCount=0,QuoteCount=0}
            if not post.Id or post.Id<1 or post.Id%1~=0 or type(post.Cid)~='string' or type(post.Images)~='table' then error('Y restore found an invalid post row') end
            post.Image=post.Images[1]
            restoredPosts[post.Id]=post;nextId=math.max(nextId,post.Id);postCount=postCount+1
        end
        for _,post in pairs(restoredPosts) do
            if post.ReplyTo and restoredPosts[post.ReplyTo] then restoredPosts[post.ReplyTo].ReplyCount=restoredPosts[post.ReplyTo].ReplyCount+1 end
            if post.QuoteId and restoredPosts[post.QuoteId] then restoredPosts[post.QuoteId].QuoteCount=restoredPosts[post.QuoteId].QuoteCount+1 end
            if post.RepostOf and restoredPosts[post.RepostOf] then local parent=restoredPosts[post.RepostOf];parent.Reposts[post.Cid]=post.Id;parent.RepostCount=parent.RepostCount+1 end
        end
        for _,r in ipairs(reactionRows) do local post=restoredPosts[tonumber(r.post_id)];if post and type(r.citizenid)=='string' then post.Likes[r.citizenid]=true;post.LikeCount=post.LikeCount+1 end end
        for _,r in ipairs(notificationRows) do
            local id=tonumber(r.id);if not id then error('Y restore found an invalid notification row') end
            notificationSeq=math.max(notificationSeq,id)
            local list=restoredNotifications[r.citizenid] or {};restoredNotifications[r.citizenid]=list
            if #list<100 then list[#list+1]={Id=id,Type=r.kind,ActorCid=r.actor_cid,Sender=r.sender,PostId=tonumber(r.post_id),Text=r.text,Timestamp=tonumber(r.created_at),Unread=not r.read_at} end
        end
        for _,r in ipairs(reportRows) do
            local id=tonumber(r.post_id)
            if not id or id<1 or id%1~=0 or type(r.reporter_cid)~='string' then error('Y restore found an invalid report row') end
            local report=restoredReports[id] or {Count=0,Reporters={}}
            if not report.Reporters[r.reporter_cid] then report.Reporters[r.reporter_cid]=true;report.Count=report.Count+1 end
            restoredReports[id]=report
        end
        YApp.Posts=restoredPosts;YApp.Reports=restoredReports;YApp.Notifications=restoredNotifications
        YApp.NextId=nextId;YApp.PostCount=postCount;YApp.NotificationSeq=notificationSeq;YApp.PersistentReady=true
      end)
      if not ok then
        print('[peak-phone] Y persistent restoration failed; feed and mutations remain disabled until database reads succeed.')
        Wait(15000)
      end
    end
end)
Citizen.CreateThread(function()
    local result=PhoneDB.query('SELECT citizenid FROM player_twitter_premium WHERE expiration > @Time',{['@Time']=os.time()})
    for _,v in ipairs(result or {}) do YApp.PremiumUsers[v.citizenid]=true end
end)
Peak.Functions.CreateCallback('peak-phone:Server:Y:GetPosts',function(src,cb)
    if not ready() then return cb(readyError()) end
    local p=Peak.Functions.GetPlayer(src);if not p then return cb({}) end
    local posts={};for _,post in pairs(YApp.Posts) do posts[#posts+1]=public(post,p.PlayerData.citizenid) end
    table.sort(posts,function(a,b)return (a.Id or 0)>(b.Id or 0) end);while #posts>50 do table.remove(posts) end;cb(posts)
end)
Peak.Functions.CreateCallback('peak-phone:Server:Y:GetFeed',function(src,cb,data)
    if not ready() then return cb(readyError()) end
    local p=Peak.Functions.GetPlayer(src);if not p then return cb(fail('Character unavailable.')) end
    local before=tonumber(type(data)=='table' and data.Before) or math.huge;local posts={}
    for _,post in pairs(YApp.Posts) do if post.Id<before then posts[#posts+1]=public(post,p.PlayerData.citizenid) end end
    table.sort(posts,function(a,b)return a.Id>b.Id end);local more=#posts>30;while #posts>30 do table.remove(posts) end
    cb({Success=true,Posts=posts,Next=more and posts[#posts].Id or nil,HasMore=more})
end)
local function boundedPosts(src,data,predicate)
    if not ready() then return readyError() end
    local p=Peak.Functions.GetPlayer(src);if not p then return fail('Character unavailable.') end
    data=type(data)=='table' and data or {};local before=tonumber(data.Before) or math.huge;local posts={}
    for _,post in pairs(YApp.Posts) do if post.Id<before and predicate(post,data,p.PlayerData.citizenid) then posts[#posts+1]=public(post,p.PlayerData.citizenid) end end
    table.sort(posts,function(a,b)return a.Id>b.Id end);local more=#posts>30;while #posts>30 do table.remove(posts) end
    return {Success=true,Posts=posts,Next=more and posts[#posts].Id or nil,HasMore=more}
end
Peak.Functions.CreateCallback('peak-phone:Server:Y:GetThread',function(src,cb,data)
    local root=idOf(data);cb(boundedPosts(src,data,function(post)return post.Id==root or post.ReplyTo==root end))
end)
Peak.Functions.CreateCallback('peak-phone:Server:Y:GetProfilePosts',function(src,cb,data)
    local cid=Phone.string(type(data)=='table' and data.Cid,128);if not cid then return cb(fail('Profile unavailable.')) end
    cb(boundedPosts(src,data,function(post)return post.Cid==cid end))
end)
Peak.Functions.CreateCallback('peak-phone:Server:Y:Search',function(src,cb,data)
    local q=Phone.string(type(data)=='table' and data.Query,80);if not q or #q<2 then return cb(fail('Enter at least two characters.')) end;q=q:lower()
    cb(boundedPosts(src,data,function(post)return tostring(post.Msg):lower():find(q,1,true) or tostring(post.Name):lower():find(q,1,true) or tostring(post.Sender):lower():find(q,1,true) end))
end)
Peak.Functions.CreateCallback('peak-phone:Server:Y:GetSocialState',function(src,cb)
    local p=Peak.Functions.GetPlayer(src);if not p then return cb(fail('Character unavailable.')) end
    cb({Success=true,Session=YApp.Session,Notifications=YApp.Notifications[p.PlayerData.citizenid] or {},MaxPostBytes=1000,MaxImages=4,PersistentPosts=YApp.PersistentReady})
end)
Peak.Functions.CreateCallback('peak-phone:Server:Y:MarkNotificationsRead',function(src,cb)
    if not ready() then return cb(readyError()) end
    local p=Peak.Functions.GetPlayer(src);if not p then return cb(fail('Character unavailable.')) end
    local at=os.time()*1000;local saved=PhoneDB.update('UPDATE peak_phone_y_notifications SET read_at=? WHERE citizenid=? AND read_at IS NULL',{at,p.PlayerData.citizenid})
    if saved==nil or saved==false then return cb(fail('Notification read state could not be saved.')) end
    for _,n in ipairs(YApp.Notifications[p.PlayerData.citizenid] or {}) do n.Unread=false end;cb({Success=true})
end)
local function postProfile(p,cid)
    local profiles=PhoneDB.query('SELECT name, avatar FROM player_twitter_profiles WHERE citizenid = @Cid',{['@Cid']=cid})
    return profiles and profiles[1] or {}
end
local function insertPost(p,data,profile)
    if not ready() then return nil end
    local cid=p.PlayerData.citizenid
    if not Phone.sameCharacter(p.PlayerData.source,cid) then return nil end
    if YApp.PostCount>=10000 then return nil end
    if data.ReplyTo and not YApp.Posts[data.ReplyTo] then return nil end
    if data.QuoteId and not YApp.Posts[data.QuoteId] then return nil end
    if data.RepostOf then
        local parent=YApp.Posts[data.RepostOf]
        if not parent or parent.RepostOf or (parent.Reposts and parent.Reposts[cid]) then return nil end
    end
    -- IDs never rewind or get reused. The referenced post lock is held across the
    -- awaited insert so delete/repost/reply operations cannot invalidate this link.
    YApp.NextId=YApp.NextId+1;YApp.PostCount=YApp.PostCount+1
    local post={Id=YApp.NextId,Cid=cid,Name=profile.name or displayName(p),Sender=displayName(p):gsub('%s','_'),
        Avatar=profile.avatar or p.PlayerData.metadata.phone_pfp,Msg=data.Msg or '',Images=data.Images or {},
        Timestamp=os.time()*1000,IsPremium=YApp.PremiumUsers[cid] or false,Likes={},LikeCount=0,Reposts={},RepostCount=0,ReplyCount=0,QuoteCount=0,
        ReplyTo=data.ReplyTo,QuoteId=data.QuoteId,RepostOf=data.RepostOf,Kind=data.RepostOf and 'repost' or data.ReplyTo and 'reply' or 'post'}
    local saved=PhoneDB.update('INSERT INTO peak_phone_y_posts(id,citizenid,name,sender,avatar,message,images,kind,reply_to,quote_id,repost_of,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',{post.Id,cid,post.Name,post.Sender,post.Avatar or '',post.Msg,json.encode(post.Images),post.Kind,post.ReplyTo,post.QuoteId,post.RepostOf,post.Timestamp})
    if not saved or saved<1 then YApp.PostCount=math.max(0,YApp.PostCount-1);return nil end
    post.Image=post.Images[1];YApp.Posts[post.Id]=post
    if data.ReplyTo then local parent=YApp.Posts[data.ReplyTo];parent.ReplyCount=(parent.ReplyCount or 0)+1;socialNotice(parent.Cid,p,'reply',post) end
    if data.QuoteId then local parent=YApp.Posts[data.QuoteId];parent.QuoteCount=(parent.QuoteCount or 0)+1;socialNotice(parent.Cid,p,'quote',post) end
    return post
end
local function newPost(p,data,lockHeld,profile)
    if not ready() or not p then return nil end
    local cid=p.PlayerData.citizenid
    profile=profile or postProfile(p,cid)
    local function insert() return insertPost(p,data,profile) end
    if lockHeld then return insert() end
    local locks=postReferenceLocks(data)
    return Phone.withLocks(locks,insert)
end
-- Gallery shares use the same allocator, counts and sanitized broadcast as composed posts.
function YApp.CreatePhotoPost(src,p,caption,image)
    if not ready() or not p or YApp.PostCount>=10000 or not Phone.text(caption,1000,true) or not Phone.mediaURL(image) then return false end
    local post=newPost(p,{Msg=caption,Images={image}});if not post then return false end
    TriggerClientEvent('peak-phone:Client:Y:CreatePost',-1,post.Id,public(post,''));refreshed()
    return true
end
Peak.Functions.CreateCallback('peak-phone:Server:Y:CreatePost',function(src,cb,data)
    if not ready() then return cb(readyError()) end
    local p=Peak.Functions.GetPlayer(src);if not p then return cb(fail('Character unavailable.')) end
    if type(data)~='table' or not Phone.text(data.Msg,1000,true) or YApp.PostCount>=10000 then return cb(fail('Post is invalid or the session feed is full.')) end
    local images={};local supplied=data.Images or (data.Image and data.Image~='' and {data.Image}) or {}
    if type(supplied)~='table' or #supplied>4 then return cb(fail('Attach up to four images.')) end
    for _,image in pairs(supplied) do if #images>=4 or not Phone.mediaURL(image) then return cb(fail('An image URL is invalid.')) end;images[#images+1]=image end
    local reply=data.ReplyTo~=nil and tonumber(data.ReplyTo) or nil;local quote=data.QuoteId~=nil and tonumber(data.QuoteId) or nil
    if (data.ReplyTo~=nil and (not reply or not YApp.Posts[reply])) or (data.QuoteId~=nil and (not quote or not YApp.Posts[quote])) or (reply and quote) then return cb(fail('The referenced post is no longer available.')) end
    if not data.Msg:match('%S') and #images==0 and not quote then return cb(fail('Write a post or attach an image.')) end
    local post=newPost(p,{Msg=data.Msg,Images=images,ReplyTo=reply,QuoteId=quote})
    if not post then return cb(fail('The character or referenced post changed. Please refresh.')) end
    -- Mention notices resolve only to existing, observed character handles, never a supplied recipient ID.
    local mentioned={};for handle in data.Msg:gmatch('@([%w_]+)') do for _,candidate in pairs(YApp.Posts) do
        if candidate.Sender:lower()==handle:lower() and candidate.Cid~=p.PlayerData.citizenid and not mentioned[candidate.Cid] then
            mentioned[candidate.Cid]=true;socialNotice(candidate.Cid,p,'mention',post)
        end
    end end
    TriggerClientEvent('peak-phone:Client:Y:CreatePost',-1,post.Id,public(post,''));refreshed()
    TriggerEvent('peak-logs:Server:Log','twitter','Y Post Posted',('User: [%s] - %s\nMessage: %s'):format(src,p.PlayerData.citizenid,data.Msg),'green')
    cb({Success=true,Post=public(post,p.PlayerData.citizenid)})
end)
Peak.Functions.CreateCallback('peak-phone:Server:Y:ToggleLike',function(src,cb,data)
    if not ready() then return cb(readyError()) end
    local p=Peak.Functions.GetPlayer(src);local id=idOf(data)
    if not p or not id then return cb(fail('Post unavailable.')) end
    local cid=p.PlayerData.citizenid
    local result=Phone.withLocks({postLock(id)},function()
        if not Phone.sameCharacter(src,cid) then return fail('Character changed. Reopen Y.') end
        local post=YApp.Posts[id]
        if not post or post.RepostOf then return fail('Post unavailable.') end
        post.Likes=post.Likes or {}
        local liked=not post.Likes[cid]
        local persisted
        if liked then
            persisted=PhoneDB.update("INSERT IGNORE INTO peak_phone_y_reactions(post_id,citizenid,kind,created_at) VALUES(?,?,'like',?)",{id,cid,os.time()*1000})
        else
            persisted=PhoneDB.update("DELETE FROM peak_phone_y_reactions WHERE post_id=? AND citizenid=? AND kind='like'",{id,cid})
        end
        local affected=tonumber(persisted)
        if affected==nil or affected<0 then return fail('The reaction could not be saved.') end
        post.Likes[cid]=liked and true or nil
        if affected>0 then post.LikeCount=math.max(0,(post.LikeCount or 0)+(liked and 1 or -1)) end
        if liked and affected>0 then socialNotice(post.Cid,p,'like',post) end
        TriggerClientEvent('peak-phone:Client:Y:UpdatePostLikes',-1,id,post.LikeCount or 0);refreshed()
        return {Success=true,HasLiked=liked,LikeCount=post.LikeCount or 0}
    end)
    cb(result)
end)
local function removePostMemory(id)
    local post=YApp.Posts[id];if not post then return end
    if post.ReplyTo and YApp.Posts[post.ReplyTo] then local parent=YApp.Posts[post.ReplyTo];parent.ReplyCount=math.max(0,(parent.ReplyCount or 1)-1) end
    if post.QuoteId and YApp.Posts[post.QuoteId] then local parent=YApp.Posts[post.QuoteId];parent.QuoteCount=math.max(0,(parent.QuoteCount or 1)-1) end
    if post.RepostOf and YApp.Posts[post.RepostOf] then local parent=YApp.Posts[post.RepostOf];parent.Reposts[post.Cid]=nil;parent.RepostCount=math.max(0,(parent.RepostCount or 1)-1) end
    YApp.Posts[id]=nil;YApp.Reports[id]=nil;YApp.PostCount=math.max(0,YApp.PostCount-1)
    TriggerClientEvent('peak-phone:Client:Y:RemovePost',-1,id)
end
local function removePost(id)
    if not YApp.Posts[id] then return false end
    local changed=PhoneDB.update('UPDATE peak_phone_y_posts SET deleted_at=? WHERE id=? AND deleted_at IS NULL',{os.time()*1000,id});if changed==nil or changed==false then return false end
    removePostMemory(id);return true
end
Peak.Functions.CreateCallback('peak-phone:Server:Y:ToggleRepost',function(src,cb,data)
    if not ready() then return cb(readyError()) end
    local p=Peak.Functions.GetPlayer(src);local id=idOf(data)
    if not p or not id then return cb(fail('Post unavailable.')) end
    local cid=p.PlayerData.citizenid;local initial=YApp.Posts[id];local profile
    if initial and not (initial.Reposts and initial.Reposts[cid]) then profile=postProfile(p,cid) end
    local result=Phone.withLocks({postCreationLock(),postLock(id)},function()
        if not Phone.sameCharacter(src,cid) then return fail('Character changed. Reopen Y.') end
        local post=YApp.Posts[id]
        if not post or post.RepostOf then return fail('Post unavailable.') end
        post.Reposts=post.Reposts or {};local active=post.Reposts[cid]~=nil
        if active then
            if not removePost(post.Reposts[cid]) then return fail('The repost could not be removed safely. Retry shortly.') end
        else
            if YApp.PostCount>=10000 then return fail('The session feed is full.') end
            profile=profile or postProfile(p,cid)
            local entry=newPost(p,{RepostOf=id},true,profile)
            if not entry then return fail('Post changed while reposting. Please refresh.') end
            post.Reposts[cid]=entry.Id;post.RepostCount=(post.RepostCount or 0)+1
            socialNotice(post.Cid,p,'repost',post)
        end
        refreshed();return {Success=true,HasReposted=not active,RepostCount=post.RepostCount}
    end)
    cb(result)
end)
Peak.Functions.CreateCallback('peak-phone:Server:Y:DeletePost',function(src,cb,data)
    if not ready() then return cb(readyError()) end
    local p=Peak.Functions.GetPlayer(src);local id=idOf(data);local initial=id and YApp.Posts[id]
    if not p or not initial then return cb(fail('Post unavailable.')) end
    local cid=p.PlayerData.citizenid;local locks={postLock(id)}
    if initial.ReplyTo then locks[#locks+1]=postLock(initial.ReplyTo) end
    if initial.QuoteId then locks[#locks+1]=postLock(initial.QuoteId) end
    if initial.RepostOf then locks[#locks+1]=postLock(initial.RepostOf) end
    local result=Phone.withLocks(locks,function()
        if not Phone.sameCharacter(src,cid) then return fail('Character changed. Reopen Y.') end
        local post=YApp.Posts[id]
        if not post then return fail('Post unavailable.') end
        if post.Cid~=cid and not Peak.Functions.HasPermission(src,'admin') and not Peak.Functions.HasPermission(src,'god') then return fail('You can only delete your own posts.') end
        local linked={};for key,v in pairs(YApp.Posts) do if v.RepostOf==id then linked[#linked+1]=key end end
        linked[#linked+1]=id;local at=os.time()*1000
        local saved=PhoneDB.update('UPDATE peak_phone_y_posts SET deleted_at=? WHERE deleted_at IS NULL AND (id=? OR repost_of=?)',{at,id,id})
        if saved==nil or saved==false then return fail('The post and its reposts could not be removed safely. Retry shortly.') end
        for _,key in ipairs(linked) do removePostMemory(key) end
        refreshed();return {Success=true}
    end)
    cb(result)
end)
Peak.Functions.CreateCallback('peak-phone:Server:Y:ReportPost',function(src,cb,data)
    if not ready() then return cb(readyError()) end
    local p=Peak.Functions.GetPlayer(src);local id=idOf(data);local post=id and YApp.Posts[id]
    if not p or not post then return cb(fail('Post unavailable.')) end
    local cid=p.PlayerData.citizenid;local report=YApp.Reports[id] or {Count=0,Reporters={}}
    if report.Reporters[cid] then return cb(fail('You already reported this post.')) end
    local saved=PhoneDB.update("INSERT IGNORE INTO peak_phone_y_reports(post_id,reporter_cid,reason,detail,status,created_at) VALUES(?,?,?,'','open',?)",{id,cid,'reported',os.time()*1000});if not saved or saved<1 then return cb(fail('You already reported this post or the report could not be saved.')) end
    report.Reporters[cid]=true;report.Count=report.Count+1;YApp.Reports[id]=report
    TriggerEvent('peak-logs:Server:Log','twitter','Y Post Reported',('Reporter: %s\nSender: %s\nMessage: %s'):format(cid,post.Cid,post.Msg),'yellow')
    if report.Count>=20 then PhoneDB.update("UPDATE peak_phone_y_reports SET status='review' WHERE post_id=? AND status='open'",{id}) end
    cb({Success=true})
end)
Peak.Commands.Add('cleary','Clear all Y posts',{},false,function(src)
    if not ready() then return TriggerClientEvent('Peak:Notify',src,'Y is restoring server data. Try again shortly.','error',5000) end
    local p=Peak.Functions.GetPlayer(src);if not p then return end
    local at=os.time()*1000
    local ok=Phone.withLocks({postCreationLock()},function()
        local locks={};for id in pairs(YApp.Posts) do locks[#locks+1]=postLock(id) end
        local function clear()
            if not PhoneDB.transaction({{query='UPDATE peak_phone_y_posts SET deleted_at=? WHERE deleted_at IS NULL',values={at}},{query="INSERT INTO peak_phone_y_moderation_audit(actor_cid,action,target_type,target_id,detail,created_at) VALUES (?,'clear_all','feed','all','Administrative clear',?)",values={p.PlayerData.citizenid,at}}}) then return false end
            YApp.Posts={};YApp.PostCount=0
            -- NextId intentionally never rewinds: old bookmark IDs cannot point to new posts.
            TriggerClientEvent('peak-phone:Client:Y:ResetPosts',-1);refreshed();return true
        end
        if #locks==0 then return clear() end
        return Phone.withLocks(locks,clear)
    end)
    if not ok then return TriggerClientEvent('Peak:Notify',src,'Y could not be cleared safely.','error',5000) end
end,'admin')
Peak.Commands.Add('checkypremium','Check your Y Premium status',{},false,function(src)
    local p=Peak.Functions.GetPlayer(src);if not p then return end
    local r=PhoneDB.query('SELECT expiration FROM player_twitter_premium WHERE citizenid = @Cid',{['@Cid']=p.PlayerData.citizenid})
    local expiry=r[1] and tonumber(r[1].expiration) or 0
    TriggerClientEvent('Peak:Notify',src,expiry>os.time() and ('Premium active until '..os.date('%Y-%m-%d %H:%M:%S',expiry)) or 'You do not have Y Premium','primary',5000)
end)
RegisterNetEvent('Admin:Server:PostTwat')
AddEventHandler('Admin:Server:PostTwat',function(data)
    local src=source;local p=Peak.Functions.GetPlayer(src)
    if not ready() or not p or (not Peak.Functions.HasPermission(src,'admin') and not Peak.Functions.HasPermission(src,'god')) then return end
    if type(data)~='table' or not Phone.text(data.Message,1000) or not Phone.text(data.Poster,100) or YApp.PostCount>=10000 then return end
    local post=newPost(p,{Msg=data.Message});if not post then return end;post.Sender=data.Poster:gsub('%s','_');post.Name=data.Poster
    TriggerClientEvent('peak-phone:Client:Y:CreatePost',-1,post.Id,public(post,''));refreshed()
    TriggerEvent('peak-logs:Server:Log','twitter','Y Post Posted (Admin)',('User: %s\nMessage: %s'):format(p.PlayerData.citizenid,data.Message),'green')
end)

-- Y Premium Subscription
Peak.Functions.CreateCallback("peak-phone:Server:Y:GetPremiumStatus", function(Source, Cb)
    local Player = Peak.Functions.GetPlayer(Source)
    if Player == nil then return Cb(false) end

    local Result = PhoneDB.query("SELECT expiration FROM player_twitter_premium WHERE citizenid = @Cid", {
        ['@Cid'] = Player.PlayerData.citizenid
    })

    if Result[1] then
        local IsPremium = (tonumber(Result[1].expiration) or 0) > os.time()
        Cb({
            IsPremium = IsPremium,
            Expiration = Result[1].expiration
        })
    else
        Cb({ IsPremium = false })
    end
end)

Peak.Functions.CreateCallback("peak-phone:Server:Y:TogglePremium",function(src,cb,data)
    local p=Phone.getPlayer(src);if not p then return cb({Success=false,Message='Character unavailable.'}) end
    local cid=p.PlayerData.citizenid;local W=Phone.Wallet;local id=W.reference(data)
    local result=Phone.withLocks({'profile:'..cid,'operation:'..id},function()
        if not Phone.sameCharacter(src,cid) then return Phone.publicError('Character changed.') end
        local previous=PhoneDB.one('SELECT * FROM peak_phone_ledger WHERE operation_id=?',{id})
        if previous then
            local _,old=W.begin(id,cid,cid,50,'Y PREMIUM');old.IsPremium=YApp.PremiumUsers[cid]==true;return old
        end
        local row=PhoneDB.one('SELECT expiration FROM player_twitter_premium WHERE citizenid=?',{cid})
        if row and tonumber(row.expiration)>os.time() then
            PhoneDB.update('DELETE FROM player_twitter_premium WHERE citizenid=?',{cid});YApp.PremiumUsers[cid]=nil
            return {Success=true,IsPremium=false,Message='Premium badge removed. No refund or recurring charge.'}
        end
        local begun,old=W.begin(id,cid,cid,50,'Y PREMIUM');if not begun then return old end
        local paid,error=W.debit(id,src,cid,50);if not paid then return error end
        local expires=os.time()+30*24*60*60
        local saved=PhoneDB.transaction({
            {query='INSERT INTO player_twitter_premium(citizenid,expiration) VALUES (?,?) ON DUPLICATE KEY UPDATE expiration=VALUES(expiration)',values={cid,expires}},
            {query="UPDATE peak_phone_ledger SET status='complete',updated_at=? WHERE operation_id=?",values={os.time()*1000,id}}
        })
        if not saved then return W.refund(id,src,cid,50) end
        YApp.PremiumUsers[cid]=true;if Phone.sameCharacter(src,cid) then Phone.refresh(src) end
        return {Success=true,IsPremium=true,Expiration=expires,Message='Premium badge enabled for 30 days.',OperationId=id}
    end)
    result.Message=result.Message or result.Msg;cb(result)
end)

-- Profile Management
Peak.Functions.CreateCallback("peak-phone:Server:Y:GetProfile", function(Source, Cb, Data)
    local Player = Peak.Functions.GetPlayer(Source)
    if Player == nil then return Cb(false) end

    Data = type(Data)=='table' and Data or {}
    if Data.Cid and not Phone.text(Data.Cid,128) then return Cb(false) end
    local TargetCid = Data.Cid or Player.PlayerData.citizenid

    -- Fetch Profile Data
    local Result = PhoneDB.query("SELECT * FROM player_twitter_profiles WHERE citizenid = @Cid", {
        ['@Cid'] = TargetCid
    })
    
    local Profile = {}
    if Result[1] then
        -- Map lowercase DB columns to PascalCase keys for UI
        local Row = Result[1]
        Profile = {
            Name = Row.name or "",
            Username = Row.username or "",
            Bio = Row.bio or "",
            Avatar = Row.avatar or "./images/default_profile.png",
            Banner = Row.banner or "",
            Followers = Row.followers or 0,
            Following = Row.following or 0
        }
    else
        -- Return basic info if no profile exists
        if Data.Cid then
            -- Fetching other user (offline or no profile)
            Profile = { 
                Name = "Unknown",
                Username = "unknown",
                Avatar = "./images/default_profile.png",
                Bio = "",
                Followers = 0,
                Following = 0
            }
        else
            -- Self default - use player's character name
            Profile = {
                Name = Player.PlayerData.charinfo.firstname .. " " .. Player.PlayerData.charinfo.lastname,
                Username = string.gsub(Player.PlayerData.charinfo.firstname .. "_" .. Player.PlayerData.charinfo.lastname, "%s", ""),
                Avatar = Player.PlayerData.metadata.phone_pfp or "./images/default_profile.png",
                Bio = "",
                Followers = 0,
                Following = 0
            }
        end
    end

    -- Add Premium Status
    local PremiumResult = PhoneDB.query("SELECT expiration FROM player_twitter_premium WHERE citizenid = @Cid", {
        ['@Cid'] = TargetCid
    })
    if PremiumResult[1] and (tonumber(PremiumResult[1].expiration) or 0) > os.time() then
        Profile.IsPremium = true
    else
        Profile.IsPremium = false
    end

    -- Add Following Status
    if YApp.Follows[TargetCid] and YApp.Follows[TargetCid][Player.PlayerData.citizenid] then
        Profile.IsFollowing = true
    else
        Profile.IsFollowing = false
    end

    Profile.Cid, Profile.CitizenId = TargetCid, TargetCid
    Profile.Followers, Profile.Following = 0, 0
    for _, Follows in pairs(YApp.Follows) do
        if Follows[TargetCid] then Profile.Following = Profile.Following + 1 end
    end
    for _, Following in pairs(YApp.Follows[TargetCid] or {}) do
        if Following then Profile.Followers = Profile.Followers + 1 end
    end
    Cb(Profile)
end)

Peak.Functions.CreateCallback("peak-phone:Server:Y:UpdateProfile", function(Source, Cb, Data)
    local Player = Peak.Functions.GetPlayer(Source)
    if Player == nil then return Cb(false) end

    if type(Data)~='table' then return Cb(false) end
    local Cid = Player.PlayerData.citizenid
    local Name = Data.Name or (Player.PlayerData.charinfo.firstname .. " " .. Player.PlayerData.charinfo.lastname)
    local Bio = Data.Bio or ""
    local Avatar = Data.Avatar or ""
    local Banner = Data.Banner or ""
    if not Phone.text(Name,100) or not Phone.text(Bio,1000,true) then return Cb(false) end
    if Avatar=='./images/default_profile.png' then Avatar='' end
    if not Phone.safeImage(Avatar) or not Phone.safeImage(Banner) then return Cb(false) end
    local Username = string.gsub(Player.PlayerData.charinfo.firstname .. "_" .. Player.PlayerData.charinfo.lastname, "%s", ""):sub(1,100)

    -- Check if profile exists
    local Result = PhoneDB.query("SELECT citizenid FROM player_twitter_profiles WHERE citizenid = @Cid", {
        ['@Cid'] = Cid
    })

    if Result[1] then
        PhoneDB.execute("UPDATE player_twitter_profiles SET name = @Name, bio = @Bio, avatar = @Avatar, banner = @Banner WHERE citizenid = @Cid", {
            ['@Cid'] = Cid,
            ['@Name'] = Name,
            ['@Bio'] = Bio,
            ['@Avatar'] = Avatar,
            ['@Banner'] = Banner
        })
    else
        PhoneDB.execute("INSERT INTO player_twitter_profiles (citizenid, name, username, bio, avatar, banner) VALUES (@Cid, @Name, @Username, @Bio, @Avatar, @Banner)", {
            ['@Cid'] = Cid,
            ['@Name'] = Name,
            ['@Username'] = Username,
            ['@Bio'] = Bio,
            ['@Avatar'] = Avatar,
            ['@Banner'] = Banner
        })
    end

    for _,post in pairs(YApp.Posts) do if post.Cid==Cid then post.Name=Name;post.Avatar=Avatar end end
    refreshed()
    Cb(true)
end)
-- Complete the existing Follow UI against the existing follows table. Identity is never accepted from NUI.
local FollowWrites = {}
Peak.Functions.CreateCallback("peak-phone:Server:Y:ToggleFollow", function(Source, Cb, Data)
    local Player = Peak.Functions.GetPlayer(Source)
    local TargetCid = type(Data) == "table" and Data.TargetCid or nil
    if not Player or type(TargetCid) ~= "string" or #TargetCid < 1 or #TargetCid > 128 then
        return Cb({ Success = false, Message = "Invalid profile." })
    end
    if not YApp.FollowsReady then return Cb({ Success = false, Message = "Profiles are still loading. Try again shortly." }) end
    local Cid = Player.PlayerData.citizenid
    if Cid == TargetCid then return Cb({ Success = false, Message = "You cannot follow yourself." }) end
    local Key = Cid .. ":" .. TargetCid
    if FollowWrites[Key] then return Cb({ Success = false, Message = "A follow change is already pending." }) end
    FollowWrites[Key] = true
    local IsFollowing = not (YApp.Follows[TargetCid] and YApp.Follows[TargetCid][Cid])
    local Ok, Result = pcall(function()
        local Target = PhoneDB.query("SELECT citizenid FROM peak_phone_characters WHERE citizenid = @Target LIMIT 1", { ['@Target'] = TargetCid })
        if not Target or not Target[1] then return false end
        local Query = IsFollowing and "INSERT IGNORE INTO player_twitter_follows (follower_cid, target_cid) VALUES (@Cid, @Target)"
            or "DELETE FROM player_twitter_follows WHERE follower_cid = @Cid AND target_cid = @Target"
        return PhoneDB.query(Query, { ['@Cid'] = Cid, ['@Target'] = TargetCid })
    end)
    FollowWrites[Key] = nil
    if not Ok or Result == nil or Result == false then
        return Cb({ Success = false, Message = "The follow change could not be saved." })
    end
    YApp.Follows[TargetCid] = YApp.Follows[TargetCid] or {}
    YApp.Follows[TargetCid][Cid] = IsFollowing and true or nil
    if IsFollowing then socialNotice(TargetCid,Player,'follow') end
    refreshed()
    Cb({ Success = true, IsFollowing = IsFollowing })
end)
