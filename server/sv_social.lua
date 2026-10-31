-- Character-authenticated KiloGram / Binge. No passwords, framework table writes,
-- client-supplied identity, browser-local shared state, or remote URL fetches.
local C=PhoneConfig.Social
local DB=PhoneDB
local function now() return os.time()*1000 end
local function no(message) return Phone.publicError(message) end
local function success(data) data=data or {};data.Success=true;return data end
local function num(v) return Phone.number(v,2147483647) end
local function page(v) return Phone.number(v,2147483647,true) or 0 end
local function nonce(v) return type(v)=='string' and #v>=16 and #v<=64 and v:match('^[%w%-]+$') and v or nil end
local function trim(v,max,empty) local s=Phone.trim(v);return Phone.text(s,max,empty) and s or nil end
local function exists(sql,args) return DB.one(sql,args)~=nil end
local function blocked(a,b)
 return exists('SELECT profile_id FROM peak_phone_social_blocks WHERE (profile_id=? AND target_id=?) OR (profile_id=? AND target_id=?) LIMIT 1',{a,b,b,a})
end
local function public(p)
 if not p then return nil end
 return {id=tonumber(p.id),app=p.app,handle=p.handle,name=p.display_name,bio=p.bio,avatar=p.avatar,
  photos=Phone.decode(p.photos),prompts=Phone.decode(p.prompts),interests=Phone.decode(p.interests),
  hidden=tonumber(p.hidden)==1,created_at=tonumber(p.created_at)}
end
local function target(me,id,allowHidden)
 id=num(id);if not id then return nil end
 local p=DB.one('SELECT * FROM peak_phone_social_profiles WHERE id=? AND app=? AND suspended=0',{id,me.app})
 if not p or (id~=tonumber(me.id) and blocked(me.id,id)) then return nil end
 if me.app=='binge' and id~=tonumber(me.id) and tonumber(p.hidden)==1 and not allowHidden then return nil end
 return p
end
local function post(me,id)
 id=num(id);if not id or me.app~='kilogram' then return nil end
 local p=DB.one([[SELECT t.* FROM peak_phone_social_posts t JOIN peak_phone_social_profiles a ON a.id=t.profile_id WHERE t.id=? AND a.app=? AND a.suspended=0 AND (t.expires_at=0 OR t.expires_at>? OR EXISTS(SELECT 1 FROM peak_phone_social_highlight_stories hs JOIN peak_phone_social_highlights h ON h.id=hs.highlight_id WHERE hs.post_id=t.id AND h.profile_id=t.profile_id))]],{id,me.app,now()})
 if not p or blocked(me.id,p.profile_id) then return nil end
 return p
end
local function pair(a,b) a,b=tonumber(a),tonumber(b);return math.min(a,b),math.max(a,b) end
local function match(a,b) local lo,hi=pair(a,b);return DB.one('SELECT id,created_at FROM peak_phone_social_matches WHERE low_id=? AND high_id=?',{lo,hi}) end
local function mutual(a,b)
 return exists('SELECT profile_id FROM peak_phone_social_follows WHERE profile_id=? AND target_id=?',{a,b}) and exists('SELECT profile_id FROM peak_phone_social_follows WHERE profile_id=? AND target_id=?',{b,a})
end
local function messaging(me,id)
 local p=target(me,id,true);if not p or tonumber(p.id)==tonumber(me.id) then return nil end
 if me.app=='binge' then local m=match(me.id,p.id);if m then return p,m end
 elseif mutual(me.id,p.id) then return p end
 return nil
end
local function push(p,kind)
 local player=Peak.Functions.GetPlayerByCitizenId(p.citizenid)
 local src=player and player.PlayerData.source
 if src and Phone.sameCharacter(src,p.citizenid) then
  TriggerClientEvent('peak-phone:Client:Social:Changed',src,{App=p.app,Kind=kind})
 end
end
local function activity(to,from,kind,postId)
 if tonumber(to.id)==tonumber(from.id) or blocked(to.id,from.id) then return end
 -- Collapse repeated likes / follows / matches instead of allowing notification spam.
 if not exists('SELECT id FROM peak_phone_social_activity WHERE profile_id=? AND actor_id=? AND kind=? AND COALESCE(post_id,0)=? AND created_at>? LIMIT 1',{to.id,from.id,kind,postId or 0,now()-3600000}) then
  DB.insert('INSERT INTO peak_phone_social_activity(profile_id,actor_id,kind,post_id,created_at) VALUES(?,?,?,NULLIF(?,0),?)',{to.id,from.id,kind,postId or 0,now()})
 end
 push(to,kind)
end
local function profileInfo(me,p)
 local result=public(p)
 if me.app=='kilogram' then
  result.followers=tonumber((DB.one('SELECT COUNT(*) n FROM peak_phone_social_follows WHERE target_id=?',{p.id}) or {}).n) or 0
  result.following=tonumber((DB.one('SELECT COUNT(*) n FROM peak_phone_social_follows WHERE profile_id=?',{p.id}) or {}).n) or 0
  result.posts=tonumber((DB.one("SELECT COUNT(*) n FROM peak_phone_social_posts WHERE profile_id=? AND kind<>'story'",{p.id}) or {}).n) or 0
  result.followed=exists('SELECT profile_id FROM peak_phone_social_follows WHERE profile_id=? AND target_id=?',{me.id,p.id})
  result.can_message=tonumber(me.id)~=tonumber(p.id) and mutual(me.id,p.id)
 else result.can_message=match(me.id,p.id)~=nil end
 result.own=tonumber(me.id)==tonumber(p.id);return result
end
-- A single short-lived write mutex makes mutual likes, account creation, blocks and
-- unmatching atomic relative to one another. SQL constraints provide a second layer.
-- Reads remain concurrent. Scale this into ordered pair locks only with concurrency tests.
local function register(route,write,fn,optional)
 Peak.Functions.CreateCallback('peak-phone:Server:Social:'..route,function(src,cb,data)
  data=type(data)=='table' and data or {}
  if not C.Enabled or (data.App~='kilogram' and data.App~='binge') or C[data.App]==false then return cb(no('This app is disabled.')) end
  if IsNetworkEnabled==false then return cb(no('The city phone network is offline.')) end
  if not Phone.rate(src,write and 'social:write' or 'social:read',write and 18 or 90,10000) then return cb(no('Too many requests. Wait a moment.')) end
  local player=Phone.getPlayer(src);if not player then return cb(no('Character unavailable.')) end
  local cid=player.PlayerData.citizenid
  local function run()
   local me=DB.one('SELECT * FROM peak_phone_social_profiles WHERE citizenid=? AND app=?',{cid,data.App})
   if me and tonumber(me.suspended)==1 then return no('This profile is suspended. Contact a server moderator.') end
   if not me and not optional then return no('Create your profile first.') end
   if not Phone.sameCharacter(src,cid) then return no('Your character changed. Reopen the app.') end
   return fn(src,me,data,cid,player)
  end
  local result=write and Phone.withLocks({'social:write'},run) or run()
  cb(result or no('The social service returned no result.'))
 end)
end
register('GetSession',false,function(src,me,d)
 return success({profile=me and profileInfo(me,me) or nil,story_hours=C.StoryHours,max_photos=C.MaxPhotos,media_hosts=PhoneConfig.Media.AllowedHosts})
end,true)
register('SaveProfile',true,function(src,me,d,cid)
 local handle=trim(d.Handle,24);handle=handle and handle:lower()
 local name,bio=trim(d.Name,60),trim(d.Bio or '',500,true)
 if not handle or #handle<3 or not handle:match('^[a-z0-9][a-z0-9_.]+$') or not name or not bio then return no('Use a 3–24 character handle (letters, numbers, dots, underscores), a name and a short bio.') end
 local photos=Phone.attachmentList(d.Photos or {});local avatar=Phone.safeImage(d.Avatar or '')
 if not photos or #photos>(C.MaxPhotos or 5) or not avatar then return no('Use image URLs from an allowed HTTPS media host.') end
 for _,url in ipairs(photos) do if type(url)~='string' then return no('Profile photos must be image URLs.') end end
 if d.App=='binge' and #photos<1 then return no('Add at least one photo of your in-game character.') end
 local prompts,interests={},{}
 if type(d.Prompts)~='table' or #d.Prompts>3 or type(d.Interests)~='table' or #d.Interests>10 then return no('Use up to 3 prompts and 10 interests.') end
 for _,v in ipairs(d.Prompts) do local s=trim(v,180);if not s then return no('Each prompt must be 1–180 bytes.') end;prompts[#prompts+1]=s end
 for _,v in ipairs(d.Interests) do local s=trim(v,32);if not s then return no('Each interest must be 1–32 bytes.') end;interests[#interests+1]=s end
 if exists('SELECT id FROM peak_phone_social_profiles WHERE app=? AND handle=? AND id<>?',{d.App,handle,me and me.id or 0}) then return no('That handle is already taken.') end
 if me then
  DB.update('UPDATE peak_phone_social_profiles SET handle=?,display_name=?,bio=?,avatar=?,photos=?,prompts=?,interests=?,hidden=?,updated_at=? WHERE id=?',{handle,name,bio,avatar,json.encode(photos),json.encode(prompts),json.encode(interests),d.Hidden==true and 1 or 0,now(),me.id})
 else
  DB.insert('INSERT INTO peak_phone_social_profiles(app,citizenid,handle,display_name,bio,avatar,photos,prompts,interests,hidden,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',{d.App,cid,handle,name,bio,avatar,json.encode(photos),json.encode(prompts),json.encode(interests),d.Hidden==true and 1 or 0,now(),now()})
 end
 local p=DB.one('SELECT * FROM peak_phone_social_profiles WHERE citizenid=? AND app=?',{cid,d.App});return success({profile=profileInfo(p,p)})
end,true)
register('DeleteAccount',true,function(src,me,d)
 if d.Confirm~='DELETE' then return no('Type DELETE to confirm deleting this profile and its content.') end
 DB.update('DELETE FROM peak_phone_social_profiles WHERE id=?',{me.id})
 if Phone.KiloLive then Phone.KiloLive.removeProfile(tonumber(me.id),'Profile removed') end
 return success()
end)
register('GetProfile',false,function(src,me,d)
 local p=target(me,d.Id or me.id);if not p then return no('Profile unavailable.') end
 return success({profile=profileInfo(me,p)})
end)
local function likeQuery(q) return '%'..q:gsub('[\\%%_]','\\%0')..'%' end
register('GetPeople',false,function(src,me,d)
 if me.app~='kilogram' then return no('Use Binge discovery to find characters.') end
 local q=trim(d.Query or '',60,true);if not q then return no('Search is too long.') end
 local list=DB.query([[SELECT p.* FROM peak_phone_social_profiles p WHERE p.app=? AND p.suspended=0 AND p.id>? AND (p.display_name LIKE ? OR p.handle LIKE ?) AND NOT EXISTS(SELECT 1 FROM peak_phone_social_blocks b WHERE (b.profile_id=? AND b.target_id=p.id) OR (b.profile_id=p.id AND b.target_id=?)) ORDER BY p.id LIMIT 31]],{me.app,page(d.After),likeQuery(q),likeQuery(q),me.id,me.id})
 local out={};for i,p in ipairs(list) do if i<=30 then out[#out+1]=public(p) end end
 return success({profiles=out,next=#list>30 and tonumber(list[30].id) or nil})
end)
local function feed(me,d,stories)
 local params={me.id,me.id,me.id,me.id,now()}
 local sql=[[SELECT t.*,p.handle,p.display_name,p.avatar,
 (SELECT COUNT(*) FROM peak_phone_social_likes l WHERE l.post_id=t.id) like_count,
 (SELECT COUNT(*) FROM peak_phone_social_comments c WHERE c.post_id=t.id) comment_count,
 EXISTS(SELECT 1 FROM peak_phone_social_likes l WHERE l.profile_id=? AND l.post_id=t.id) liked,
 EXISTS(SELECT 1 FROM peak_phone_social_saves s WHERE s.profile_id=? AND s.post_id=t.id) saved
 FROM peak_phone_social_posts t JOIN peak_phone_social_profiles p ON p.id=t.profile_id
 WHERE p.app='kilogram' AND p.suspended=0
 AND NOT EXISTS(SELECT 1 FROM peak_phone_social_blocks b WHERE (b.profile_id=? AND b.target_id=p.id) OR (b.profile_id=p.id AND b.target_id=?))
 AND (t.expires_at=0 OR t.expires_at>?)]]
 if stories then sql=sql.." AND t.kind='story'" else sql=sql.." AND t.kind<>'story'" end
 if d.Kind=='reel' and not stories then sql=sql.." AND t.kind='reel'" end
 if d.Following==true then sql=sql..' AND (p.id=? OR EXISTS(SELECT 1 FROM peak_phone_social_follows f WHERE f.profile_id=? AND f.target_id=p.id))';params[#params+1]=me.id;params[#params+1]=me.id end
 if d.Saved==true and not stories then sql=sql..' AND EXISTS(SELECT 1 FROM peak_phone_social_saves s WHERE s.profile_id=? AND s.post_id=t.id)';params[#params+1]=me.id end
 if d.ProfileId then local p=target(me,d.ProfileId);if not p then return no('Profile unavailable.') end;sql=sql..' AND p.id=?';params[#params+1]=p.id end
 if page(d.Before)>0 then sql=sql..' AND t.id<?';params[#params+1]=page(d.Before) end
 local limit=stories and 40 or math.min(30,C.PageSize or 20)
 sql=sql..' ORDER BY t.id DESC LIMIT '..(limit+1)
 local result=DB.query(sql,params);local out={}
 for i,p in ipairs(result) do if i<=limit then out[#out+1]={id=tonumber(p.id),kind=p.kind,caption=p.caption,media=Phone.decode(p.media),created_at=tonumber(p.created_at),expires_at=tonumber(p.expires_at),likes=tonumber(p.like_count),comments=tonumber(p.comment_count),liked=tonumber(p.liked)==1,saved=tonumber(p.saved)==1,own=tonumber(p.profile_id)==tonumber(me.id),author={id=tonumber(p.profile_id),name=p.display_name,handle=p.handle,avatar=p.avatar}} end end
 return success({posts=out,next=#result>limit and tonumber(result[limit].id) or nil,server_time=now()})
end
register('GetFeed',false,function(src,me,d) if me.app~='kilogram' then return no('Photos are available in KiloGram.') end;return feed(me,d,false) end)
register('GetStories',false,function(src,me,d) if me.app~='kilogram' then return no('Stories are available in KiloGram.') end;return feed(me,d,true) end)
-- Expired stories stay private to their owner, unless explicitly published in a highlight.
local function archivedStory(p,owner,highlight)
 return {id=tonumber(p.id),kind='story',caption=p.caption,media=Phone.decode(p.media),created_at=tonumber(p.created_at),expires_at=tonumber(p.expires_at),highlight=highlight,author={id=tonumber(owner.id),name=owner.display_name,handle=owner.handle,avatar=owner.avatar}}
end
register('GetStoryArchive',false,function(src,me,d)
 if me.app~='kilogram' then return no('Stories are available in KiloGram.') end
 local before=page(d.Before)
 local list=DB.query("SELECT * FROM peak_phone_social_posts WHERE profile_id=? AND kind='story' AND (?=0 OR id<?) ORDER BY id DESC LIMIT 41",{me.id,before,before})
 local out={};for i,p in ipairs(list) do if i<=40 then out[#out+1]=archivedStory(p,me,false) end end
 return success({posts=out,next=#list>40 and tonumber(list[40].id) or nil,server_time=now()})
end)
register('GetHighlights',false,function(src,me,d)
 if me.app~='kilogram' then return no('Highlights are available in KiloGram.') end
 local owner=target(me,d.ProfileId or me.id);if not owner then return no('Profile unavailable.') end
 local list=DB.query('SELECT * FROM peak_phone_social_highlights WHERE profile_id=? ORDER BY id LIMIT 20',{owner.id})
 local out={}
 for _,h in ipairs(list) do
  local stories=DB.query([[SELECT t.* FROM peak_phone_social_highlight_stories s JOIN peak_phone_social_posts t ON t.id=s.post_id WHERE s.highlight_id=? AND t.profile_id=? AND t.kind='story' ORDER BY s.position LIMIT 50]],{h.id,owner.id})
  local posts={};for _,p in ipairs(stories) do posts[#posts+1]=archivedStory(p,owner,true) end
  out[#out+1]={id=tonumber(h.id),title=h.title,posts=posts,own=tonumber(owner.id)==tonumber(me.id)}
 end
 return success({highlights=out})
end)
register('SaveHighlight',true,function(src,me,d)
 if me.app~='kilogram' then return no('Highlights are available in KiloGram.') end
 local title=trim(d.Title,48);local id=d.Id and num(d.Id)
 if not title or (d.Id and not id) or type(d.StoryIds)~='table' or #d.StoryIds<1 or #d.StoryIds>50 then return no('Choose a title and 1–50 stories.') end
 if id and not exists('SELECT id FROM peak_phone_social_highlights WHERE id=? AND profile_id=?',{id,me.id}) then return no('Highlight unavailable.') end
 if not id and tonumber((DB.one('SELECT COUNT(*) n FROM peak_phone_social_highlights WHERE profile_id=?',{me.id}) or {}).n or 0)>=20 then return no('Use up to 20 highlights.') end
 local ids,seen={},{}
 for _,value in ipairs(d.StoryIds) do
  local storyId=num(value)
  if not storyId or seen[storyId] or not exists("SELECT id FROM peak_phone_social_posts WHERE id=? AND profile_id=? AND kind='story'",{storyId,me.id}) then return no('Choose only your own available stories, once each.') end
  seen[storyId]=true;ids[#ids+1]=storyId
 end
 -- One transaction prevents partial collections if a database write fails.
 local statements={}
 if not id then
  statements[#statements+1]={query='INSERT INTO peak_phone_social_highlights(profile_id,title,created_at) VALUES(?,?,?)',values={me.id,title,now()}}
 else
  statements[#statements+1]={query='UPDATE peak_phone_social_highlights SET title=? WHERE id=? AND profile_id=?',values={title,id,me.id}}
  statements[#statements+1]={query='DELETE FROM peak_phone_social_highlight_stories WHERE highlight_id=?',values={id}}
 end
 for position,storyId in ipairs(ids) do
  statements[#statements+1]={query='INSERT INTO peak_phone_social_highlight_stories(highlight_id,post_id,position) VALUES('..(id and '?' or 'LAST_INSERT_ID()')..',?,?)',values=id and {id,storyId,position} or {storyId,position}}
 end
 if not DB.transaction(statements) then return no('Highlight could not be saved. Try again.') end
 return success()
end)
register('DeleteHighlight',true,function(src,me,d)
 if me.app~='kilogram' or not num(d.Id) then return no('Highlight unavailable.') end
 DB.update('DELETE FROM peak_phone_social_highlights WHERE id=? AND profile_id=?',{num(d.Id),me.id});return success()
end)
register('CreatePost',true,function(src,me,d)
 if me.app~='kilogram' then return no('Posting is available in KiloGram.') end
 local kind=d.Kind;local caption=trim(d.Caption or '',2200,true);local key=nonce(d.Nonce)
 if (kind~='image' and kind~='reel' and kind~='story') or not caption or not key then return no('Invalid post. Reopen the composer.') end
 local previous=DB.one('SELECT id FROM peak_phone_social_posts WHERE profile_id=? AND client_nonce=?',{me.id,key});if previous then return success({id=tonumber(previous.id)}) end
 if type(d.Media)~='table' or #d.Media<1 or #d.Media>(kind=='image' and math.min(5,C.MaxPhotos) or 1) then return no('Choose photos, or one video for a reel or story.') end
 local media={}
 for _,item in ipairs(d.Media) do
 if type(item)~='table' or (item.type~='image' and item.type~='video') or not Phone.mediaURL(item.url) then return no('Use media from an allowed HTTPS host. Local clips need hosting first.') end
  if kind=='reel' and item.type~='video' or kind=='image' and item.type~='image' then return no('Reels need video. Photo posts need images.') end
  if item.type=='video' and not DB.one("SELECT id FROM peak_phone_media WHERE owner_cid=? AND public_url=? AND status='complete' AND deleted_at IS NULL",{me.citizenid,item.url}) then return no('Choose a verified hosted video from your own media library.') end
  media[#media+1]={url=item.url,type=item.type}
 end
 local count=DB.one("SELECT COUNT(*) n FROM peak_phone_social_posts WHERE profile_id=? AND ((?='story' AND kind='story' AND expires_at>?) OR (?<>'story' AND kind<>'story'))",{me.id,kind,now(),kind})
 if tonumber(count.n)>=(kind=='story' and C.MaxStories or C.MaxPosts) then return no('Your post limit is reached. Remove an old post first.') end
 if not Phone.rate(src,'social:post',3,30000) then return no('Wait before sharing another post.') end
 local id=DB.insert('INSERT INTO peak_phone_social_posts(profile_id,kind,caption,media,client_nonce,expires_at,created_at) VALUES(?,?,?,?,?,?,?)',{me.id,kind,caption,json.encode(media),key,kind=='story' and now()+C.StoryHours*3600000 or 0,now()})
 if not id then return no('The post was not committed.') end
 for _,item in ipairs(media) do if item.type=='video' then local record=DB.one("SELECT id FROM peak_phone_media WHERE owner_cid=? AND public_url=? AND status='complete'",{me.citizenid,item.url});if record then DB.update("INSERT IGNORE INTO peak_phone_media_references(media_id,owner_cid,destination_type,destination_id,created_at) VALUES(?,?,'kilogram',?,?)",{record.id,me.citizenid,tostring(id),now()}) end end end
 return success({id=tonumber(id)})
end)
register('DeletePost',true,function(src,me,d)
 local p=me.app=='kilogram' and num(d.Id) and DB.one('SELECT * FROM peak_phone_social_posts WHERE id=? AND profile_id=?',{num(d.Id),me.id});if not p then return no('You can only delete your own post.') end
 DB.update('DELETE FROM peak_phone_social_posts WHERE id=? AND profile_id=?',{p.id,me.id});return success()
end)
for _,entry in ipairs({{'SetLike','peak_phone_social_likes','liked'},{'SetSave','peak_phone_social_saves','saved'}}) do
 local route,tbl,key=table.unpack(entry)
 register(route,true,function(src,me,d)
  local p=post(me,d.Id);if not p or p.kind=='story' or type(d.Enabled)~='boolean' then return no('Post unavailable.') end
  if d.Enabled then
   DB.update('INSERT IGNORE INTO '..tbl..'(profile_id,post_id,created_at) VALUES(?,?,?)',{me.id,p.id,now()})
   if key=='liked' then local owner=target(me,p.profile_id);if owner then activity(owner,me,'like',p.id) end end
  else DB.update('DELETE FROM '..tbl..' WHERE profile_id=? AND post_id=?',{me.id,p.id}) end
  local count=DB.one('SELECT COUNT(*) n FROM '..tbl..' WHERE post_id=?',{p.id})
  return success({[key]=d.Enabled,count=tonumber(count.n)})
 end)
end
register('SetFollow',true,function(src,me,d)
 local p=target(me,d.Id);if me.app~='kilogram' or not p or tonumber(p.id)==tonumber(me.id) or type(d.Enabled)~='boolean' then return no('Profile unavailable.') end
 if d.Enabled then
  DB.update('INSERT IGNORE INTO peak_phone_social_follows(profile_id,target_id,created_at) VALUES(?,?,?)',{me.id,p.id,now()});activity(p,me,'follow')
 else DB.update('DELETE FROM peak_phone_social_follows WHERE profile_id=? AND target_id=?',{me.id,p.id}) end
 return success({profile=profileInfo(me,p)})
end)
register('GetComments',false,function(src,me,d)
 local p=post(me,d.Id);if not p or p.kind=='story' then return no('Post unavailable.') end
 local result=DB.query([[SELECT c.id,c.body,c.created_at,c.profile_id,p.display_name,p.handle,p.avatar FROM peak_phone_social_comments c JOIN peak_phone_social_profiles p ON p.id=c.profile_id WHERE c.post_id=? AND c.id>? AND p.suspended=0 AND NOT EXISTS(SELECT 1 FROM peak_phone_social_blocks b WHERE (b.profile_id=? AND b.target_id=p.id) OR (b.profile_id=p.id AND b.target_id=?)) ORDER BY c.id LIMIT 41]],{p.id,page(d.After),me.id,me.id})
 local out={};for i,c in ipairs(result) do if i<=40 then out[#out+1]={id=tonumber(c.id),body=c.body,created_at=tonumber(c.created_at),can_delete=tonumber(c.profile_id)==tonumber(me.id) or tonumber(p.profile_id)==tonumber(me.id),author={id=tonumber(c.profile_id),name=c.display_name,handle=c.handle,avatar=c.avatar}} end end
 return success({comments=out,next=#result>40 and tonumber(result[40].id) or nil})
end)
register('CreateComment',true,function(src,me,d)
 local p=post(me,d.Id);local body=trim(d.Body,1000);local key=nonce(d.Nonce)
 if not p or p.kind=='story' or not body or not key then return no('Enter a comment of up to 1,000 bytes.') end
 local previous=DB.one('SELECT id FROM peak_phone_social_comments WHERE profile_id=? AND client_nonce=?',{me.id,key});if previous then return success({id=tonumber(previous.id)}) end
 local count=DB.one('SELECT COUNT(*) n FROM peak_phone_social_comments WHERE post_id=?',{p.id});if tonumber(count.n)>=C.MaxComments then return no('This post has reached its comment limit.') end
 local id=DB.insert('INSERT INTO peak_phone_social_comments(profile_id,post_id,body,client_nonce,created_at) VALUES(?,?,?,?,?)',{me.id,p.id,body,key,now()})
 local owner=target(me,p.profile_id);if owner then activity(owner,me,'comment',p.id) end
 return success({id=tonumber(id)})
end)
register('DeleteComment',true,function(src,me,d)
 local id=num(d.Id);local c=id and DB.one('SELECT * FROM peak_phone_social_comments WHERE id=?',{id});local p=c and post(me,c.post_id)
 if not c or not p or (tonumber(c.profile_id)~=tonumber(me.id) and tonumber(p.profile_id)~=tonumber(me.id)) then return no('You cannot delete this comment.') end
 DB.update('DELETE FROM peak_phone_social_comments WHERE id=?',{id});return success()
end)
register('GetBingeDeck',false,function(src,me,d)
 if me.app~='binge' then return no('Discovery is available in Binge.') end
 local q=trim(d.Query or '',32,true);if not q then return no('Search is too long.') end
 local result=DB.query([[SELECT p.* FROM peak_phone_social_profiles p WHERE p.app='binge' AND p.suspended=0 AND p.hidden=0 AND p.id<>? AND p.id>? AND (p.display_name LIKE ? OR p.interests LIKE ?)
 AND NOT EXISTS(SELECT 1 FROM peak_phone_social_blocks b WHERE (b.profile_id=? AND b.target_id=p.id) OR (b.profile_id=p.id AND b.target_id=?))
 AND NOT EXISTS(SELECT 1 FROM peak_phone_social_swipes s WHERE s.profile_id=? AND s.target_id=p.id)
 AND NOT EXISTS(SELECT 1 FROM peak_phone_social_matches m WHERE (m.low_id=? AND m.high_id=p.id) OR (m.high_id=? AND m.low_id=p.id)) ORDER BY p.id LIMIT 21]],{me.id,page(d.After),likeQuery(q),likeQuery(q),me.id,me.id,me.id,me.id,me.id})
 local out={};for i,p in ipairs(result) do if i<=20 then out[#out+1]=public(p) end end
 return success({profiles=out,next=#result>20 and tonumber(result[20].id) or nil})
end)
register('BingeSwipe',true,function(src,me,d)
 local p=target(me,d.Id);if me.app~='binge' or not p or tonumber(p.id)==tonumber(me.id) or (d.Decision~='like' and d.Decision~='pass') then return no('This character is unavailable.') end
 local previous=match(me.id,p.id);if previous then return success({matched=true,match_id=tonumber(previous.id),profile=public(p)}) end
 -- A decision is idempotent and cannot be rewritten to manufacture a match.
 local old=DB.one('SELECT decision FROM peak_phone_social_swipes WHERE profile_id=? AND target_id=?',{me.id,p.id})
 if old then return success({matched=false,decision=old.decision}) end
 local lo,hi=pair(me.id,p.id)
 local other=DB.one('SELECT decision FROM peak_phone_social_swipes WHERE profile_id=? AND target_id=?',{p.id,me.id})
 local matched=d.Decision=='like' and other and other.decision=='like'
 local queries={{query='INSERT INTO peak_phone_social_swipes(profile_id,target_id,decision,created_at) VALUES(?,?,?,?)',values={me.id,p.id,d.Decision,now()}}}
 if matched then queries[#queries+1]={query='INSERT IGNORE INTO peak_phone_social_matches(low_id,high_id,created_at) VALUES(?,?,?)',values={lo,hi,now()}} end
 if not DB.transaction(queries) then return no('The decision could not be saved. Try again later.') end
 local m=matched and match(lo,hi)
 if m then activity(p,me,'match');activity(me,p,'match') end
 return success({matched=m~=nil and m~=false,match_id=m and tonumber(m.id) or nil,profile=m and public(p) or nil})
end)
register('GetMatches',false,function(src,me,d)
 if me.app~='binge' then return no('Matches are available in Binge.') end
 local list=DB.query([[SELECT m.id match_id,m.created_at matched_at,p.* FROM peak_phone_social_matches m JOIN peak_phone_social_profiles p ON p.id=IF(m.low_id=?,m.high_id,m.low_id) WHERE (m.low_id=? OR m.high_id=?) AND p.suspended=0 AND m.id>? AND NOT EXISTS(SELECT 1 FROM peak_phone_social_blocks b WHERE (b.profile_id=? AND b.target_id=p.id) OR (b.profile_id=p.id AND b.target_id=?)) ORDER BY m.id LIMIT 31]],{me.id,me.id,me.id,page(d.After),me.id,me.id})
 local out={};for i,p in ipairs(list) do if i<=30 then
  local last=DB.one('SELECT body,created_at FROM peak_phone_social_messages WHERE match_id=? ORDER BY id DESC LIMIT 1',{p.match_id})
  local count=DB.one('SELECT COUNT(*) n FROM peak_phone_social_messages WHERE match_id=? AND recipient_id=? AND read_at=0',{p.match_id,me.id})
  out[#out+1]={profile=public(p),match_id=tonumber(p.match_id),created_at=tonumber(p.matched_at),last=last,unread=tonumber(count.n)}
 end end
 return success({matches=out,next=#list>30 and tonumber(list[30].match_id) or nil})
end)
register('Unmatch',true,function(src,me,d)
 local p=target(me,d.Id,true);if me.app~='binge' or not p then return no('Match unavailable.') end
 local m=match(me.id,p.id);if not m then return success() end
 DB.update('DELETE FROM peak_phone_social_matches WHERE id=?',{m.id})
 -- Both decisions stay recorded. Discovery will not immediately rematch this pair.
 push(p,'unmatch');return success()
end)
register('GetConversations',false,function(src,me,d)
 if me.app~='kilogram' then return no('Use your matches in Binge.') end
 local list=DB.query([[SELECT p.*,x.last_id FROM (SELECT IF(m.sender_id=?,m.recipient_id,m.sender_id) other_id,MAX(m.id) last_id FROM peak_phone_social_messages m WHERE (m.sender_id=? OR m.recipient_id=?) GROUP BY IF(m.sender_id=?,m.recipient_id,m.sender_id)) x JOIN peak_phone_social_profiles p ON p.id=x.other_id
 WHERE p.app='kilogram' AND p.suspended=0
 AND EXISTS(SELECT 1 FROM peak_phone_social_follows f WHERE f.profile_id=? AND f.target_id=p.id)
 AND EXISTS(SELECT 1 FROM peak_phone_social_follows f WHERE f.profile_id=p.id AND f.target_id=?)
 AND NOT EXISTS(SELECT 1 FROM peak_phone_social_blocks b WHERE (b.profile_id=? AND b.target_id=p.id) OR (b.profile_id=p.id AND b.target_id=?)) AND (?=0 OR x.last_id<?) ORDER BY x.last_id DESC LIMIT 31]],{me.id,me.id,me.id,me.id,me.id,me.id,me.id,me.id,page(d.Before),page(d.Before)})
 local out={};for i,p in ipairs(list) do if i<=30 then
  local last=DB.one('SELECT body,created_at FROM peak_phone_social_messages WHERE id=?',{p.last_id})
  local count=DB.one('SELECT COUNT(*) n FROM peak_phone_social_messages WHERE sender_id=? AND recipient_id=? AND read_at=0',{p.id,me.id})
  out[#out+1]={profile=public(p),last=last,unread=tonumber(count.n)}
 end end
 return success({conversations=out,next=#list>30 and tonumber(list[30].last_id) or nil})
end)
register('GetMessages',false,function(src,me,d)
 local p,m=messaging(me,d.Id);if not p then return no(me.app=='binge' and 'You can only message a current match.' or 'Direct messages require both accounts to follow each other.') end
 local query='SELECT id,sender_id,body,created_at,read_at FROM peak_phone_social_messages WHERE ((sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?))'
 local params={me.id,p.id,p.id,me.id};local after,before=page(d.After),page(d.Before)
 if after>0 then query=query..' AND id>?';params[#params+1]=after elseif before>0 then query=query..' AND id<?';params[#params+1]=before end
 query=query..(after>0 and ' ORDER BY id ASC' or ' ORDER BY id DESC')..' LIMIT 41'
 local result=DB.query(query,params);local out,highest={},0
 for i,r in ipairs(result) do if i<=40 then out[#out+1]={id=tonumber(r.id),body=r.body,own=tonumber(r.sender_id)==tonumber(me.id),created_at=tonumber(r.created_at),read_at=tonumber(r.read_at)};highest=math.max(highest,tonumber(r.id)) end end
 if highest>0 then DB.update('UPDATE peak_phone_social_messages SET read_at=? WHERE sender_id=? AND recipient_id=? AND id<=? AND read_at=0',{now(),p.id,me.id,highest}) end
 return success({messages=out,next=#result>40 and tonumber(result[40].id) or nil,profile=public(p)})
end)
register('SendMessage',true,function(src,me,d)
 local p,m=messaging(me,d.Id);local body=trim(d.Body,2000);local key=nonce(d.Nonce)
 if not p then return no(me.app=='binge' and 'You can only message a current match.' or 'Direct messages require a mutual follow.') end
 if not body or not key then return no('Enter a message of up to 2,000 bytes.') end
 local previous=DB.one('SELECT id FROM peak_phone_social_messages WHERE sender_id=? AND client_nonce=?',{me.id,key});if previous then return success({id=tonumber(previous.id)}) end
 local id=DB.insert('INSERT INTO peak_phone_social_messages(sender_id,recipient_id,match_id,body,client_nonce,created_at) VALUES(?,?,NULLIF(?,0),?,?,?)',{me.id,p.id,m and m.id or 0,body,key,now()})
 -- Bounded per-pair history. Do not broadcast private message content.
 local cutoff=DB.one('SELECT id FROM peak_phone_social_messages WHERE (sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?) ORDER BY id DESC LIMIT 1 OFFSET '..math.max(1,C.MaxMessages),{me.id,p.id,p.id,me.id})
 if cutoff then DB.update('DELETE FROM peak_phone_social_messages WHERE id<=? AND ((sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?))',{cutoff.id,me.id,p.id,p.id,me.id}) end
 push(p,'message');return success({id=tonumber(id)})
end)
register('GetActivity',false,function(src,me,d)
 local list=DB.query([[SELECT a.*,p.display_name,p.handle,p.avatar FROM peak_phone_social_activity a JOIN peak_phone_social_profiles p ON p.id=a.actor_id WHERE a.profile_id=? AND (?=0 OR a.id<?) AND p.suspended=0 AND NOT EXISTS(SELECT 1 FROM peak_phone_social_blocks b WHERE (b.profile_id=? AND b.target_id=p.id) OR (b.profile_id=p.id AND b.target_id=?)) ORDER BY a.id DESC LIMIT 41]],{me.id,page(d.Before),page(d.Before),me.id,me.id})
 local out={};for i,a in ipairs(list) do if i<=40 then out[#out+1]={id=tonumber(a.id),kind=a.kind,post_id=a.post_id and tonumber(a.post_id),created_at=tonumber(a.created_at),read=tonumber(a.read_at)>0,actor={id=tonumber(a.actor_id),name=a.display_name,handle=a.handle,avatar=a.avatar}} end end
 return success({activity=out,next=#list>40 and tonumber(list[40].id) or nil})
end)
register('MarkActivityRead',true,function(src,me,d)
 DB.update('UPDATE peak_phone_social_activity SET read_at=? WHERE profile_id=? AND id<=? AND read_at=0',{now(),me.id,page(d.Until)});return success()
end)
register('SetBlock',true,function(src,me,d)
 local id=num(d.Id);local p=id and DB.one('SELECT * FROM peak_phone_social_profiles WHERE id=? AND app=?',{id,me.app})
 if not p or id==tonumber(me.id) or type(d.Enabled)~='boolean' then return no('Invalid profile.') end
 if d.Enabled then
  local lo,hi=pair(me.id,p.id)
  if not DB.transaction({
   {query='INSERT IGNORE INTO peak_phone_social_blocks(profile_id,target_id,created_at) VALUES(?,?,?)',values={me.id,p.id,now()}},
   {query='DELETE FROM peak_phone_social_follows WHERE (profile_id=? AND target_id=?) OR (profile_id=? AND target_id=?)',values={me.id,p.id,p.id,me.id}},
   {query='DELETE FROM peak_phone_social_matches WHERE low_id=? AND high_id=?',values={lo,hi}},
   {query='DELETE FROM peak_phone_social_activity WHERE (profile_id=? AND actor_id=?) OR (profile_id=? AND actor_id=?)',values={me.id,p.id,p.id,me.id}}
  }) then return no('The block could not be saved.') end
 else DB.update('DELETE FROM peak_phone_social_blocks WHERE profile_id=? AND target_id=?',{me.id,p.id}) end
 if Phone.KiloLive and me.app=='kilogram' then Phone.KiloLive.privacyChanged(tonumber(me.id),tonumber(p.id)) end
 push(p,'privacy');return success()
end)
register('GetBlocked',false,function(src,me,d)
 local list=DB.query('SELECT p.* FROM peak_phone_social_blocks b JOIN peak_phone_social_profiles p ON p.id=b.target_id WHERE b.profile_id=? AND p.id>? ORDER BY p.id LIMIT 41',{me.id,page(d.After)})
 local out={};for i,p in ipairs(list) do if i<=40 then out[#out+1]=public(p) end end
 return success({profiles=out,next=#list>40 and tonumber(list[40].id) or nil})
end)
register('Report',true,function(src,me,d)
 local reasons={harassment=true,spam=true,impersonation=true,inappropriate=true,other=true}
 local p=target(me,d.Id,true);local detail=trim(d.Detail or '',500,true)
 if not p or tonumber(p.id)==tonumber(me.id) or not reasons[d.Reason] or not detail then return no('Select a reason and a valid profile.') end
 local item=d.PostId and post(me,d.PostId) or nil
 if d.PostId and (not item or tonumber(item.profile_id)~=tonumber(p.id)) then return no('Post unavailable.') end
 if not Phone.rate(src,'social:report',3,60000) then return no('Wait before submitting another report.') end
 DB.insert('INSERT INTO peak_phone_social_reports(app,reporter_id,target_id,post_id,reason,detail,created_at) VALUES(?,?,?,NULLIF(?,0),?,?,?)',{me.app,me.id,p.id,item and item.id or 0,d.Reason,detail,now()})
 return success()
end)
-- Server console, ACE permission, or the framework's admin role. No unguarded admin RPC.
RegisterCommand('phone_social',function(src,args)
 if src~=0 and not IsPlayerAceAllowed(tostring(src),C.ModerationAce) and not Peak.Functions.HasPermission(src,'admin') then return end
 local op,id=args[1],num(args[2])
 local function out(text) if src==0 then print('[Peak Social] '..text) else Phone.notify(src,text,'primary',10000) end end
 local ok,err=pcall(function()
  if op=='reports' then
   local list=DB.query("SELECT id,app,target_id,post_id,reason,detail FROM peak_phone_social_reports WHERE status='open' ORDER BY id DESC LIMIT 20",{})
   for _,r in ipairs(list) do out(json.encode(r)) end;if #list==0 then out('No open reports.') end
  elseif id and (op=='suspend' or op=='restore') then DB.update('UPDATE peak_phone_social_profiles SET suspended=? WHERE id=?',{op=='suspend' and 1 or 0,id});if op=='suspend' and Phone.KiloLive then Phone.KiloLive.removeProfile(id,'Profile suspended') end;out('Profile moderation updated.')
  elseif id and op=='delete-post' then DB.update('DELETE FROM peak_phone_social_posts WHERE id=?',{id});out('Post removed, if it existed.')
  elseif id and op=='resolve' then DB.update("UPDATE peak_phone_social_reports SET status='resolved' WHERE id=?",{id});out('Report resolved, if it existed.')
  else out('phone_social reports | suspend <profileId> | restore <profileId> | delete-post <postId> | resolve <reportId>') end
 end)
 if not ok then print('[Peak Social] Moderation failed: '..tostring(err));out('Moderation failed. Check the server log.') end
end,false)
CreateThread(function()
 DB.wait()
 while true do
  local ok,err=pcall(function()
   -- Story expiry hides stories from the public rail; retain them for the owner's archive.
   DB.update('DELETE FROM peak_phone_social_activity WHERE created_at<?',{now()-30*86400000})
  end)
  if not ok then print('[Peak Social] Cleanup failed: '..tostring(err)) end
  Wait(3600000)
 end
end)
