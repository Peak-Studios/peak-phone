-- Execute the current Y and Gallery code with server-derived identities and a bound DB fixture.
base('qbcore');Citizen.CreateThread=CreateThread;Citizen.Wait=Wait
loadrel('config.lua');loadrel('sv_config.lua');addPlayer(1,'ACTOR');addPlayer(2,'OTHER')
local failDB=false;local sqlCalls={};local afterQuery
PhoneDB.query=function(sql,args)
 sqlCalls[#sqlCalls+1]={sql=sql,args=args}
 if failDB then error('DB unavailable (fixture)') end
 if afterQuery then local f=afterQuery;afterQuery=nil;f() end
 if sql:find('SELECT COALESCE(MAX(id),0) maximum FROM peak_phone_y_posts',1,true) then return {{maximum=0}} end
 if sql:find('FROM peak_phone_characters',1,true) then return args['@Target']=='MISSING' and {} or {{citizenid=args['@Target']}} end
 if sql:find('name, avatar',1,true) then return {{name='Display '..args['@Cid'],avatar=''}} end
 return {}
end
PhoneDB.execute=function(sql,args,cb) local r=PhoneDB.query(sql,args);if cb then cb(r) end;return r end
local threadsBeforeY=#THREADS;loadrel('server/sv_y.lua');YApp.FollowsReady=true
local function call(route,src,data)return rpc('peak-phone:Server:Y:'..route,src,data)end
local notRestored=call('CreatePost',1,{Msg='Not ready yet'});check(notRestored.Success==false and notRestored.Message=='Y is restoring server data. Try again shortly.','Mutations stay gated during persistent restore')
local pendingState=call('GetSocialState',1,{});check(pendingState.Success and pendingState.PersistentPosts==false,'Social state reports an incomplete persistent restore')
THREADS[threadsBeforeY+2]()
check(YApp.PersistentReady,'Successful DB restoration opens Y mutations')
local function create(src,msg,extra)local data=extra or {};data.Msg=msg;local r=call('CreatePost',src,data);check(r.Success,r.Message);return r.Post end
local function rejects(route,src,data)local r=call(route,src,data);check(r==false or not r.Success,'Should reject '..route);return r end
-- Create validates type, byte length, meaningful content, image host and references.
for _,data in ipairs({{}, {Msg=12},{Msg=string.rep('a',1001)},{Msg='   '},{Msg='x',Images={'https://unapproved.invalid/photo.png'}},{Msg='x',Images={'http://i.imgur.com/photo.jpg'}},{Msg='x',Images='not a list'},{Msg='x',ReplyTo=123},{Msg='x',QuoteId='bad'},{Msg='x',Images={'https://i.imgur.com/a','https://i.imgur.com/b','https://i.imgur.com/c','https://i.imgur.com/d','https://i.imgur.com/e'}}}) do rejects('CreatePost',1,data) end
eq(YApp.PostCount,0)
local first=create(1,'Hello #Duo',{Cid='FORGED',Images={'https://i.imgur.com/test-fixture.jpg'}})
eq(first.Cid,'ACTOR');eq(first.Id,1);eq(first.Name,'Display ACTOR');eq(#first.Images,1);eq(first.Likes,nil,'Never expose viewer identity map');eq(first.HasLiked,false)
local second=create(2,'Second post');eq(second.Id,2)
local r=call('ToggleLike',2,{Id=first.Id,Cid='FORGED'});check(r.Success and r.HasLiked);eq(r.LikeCount,1);check(YApp.Posts[1].Likes.OTHER);eq(YApp.Posts[1].Likes.FORGED,nil)
local function byId(rows,id)for _,post in ipairs(rows)do if post.Id==id then return post end end end
local a=call('GetPosts',1,{});eq(byId(a,first.Id).HasLiked,false);a=call('GetPosts',2,{});eq(byId(a,first.Id).HasLiked,true);eq(byId(a,first.Id).Likes,nil)
r=call('ToggleLike',2,{Id=first.Id});check(r.Success and not r.HasLiked);eq(r.LikeCount,0)
local meta=call('GetSocialState',1,{});check(meta.Success and #meta.Notifications==1);eq(meta.Notifications[1].Type,'like');eq(meta.PersistentPosts,true);check(meta.Session~='')
r=call('MarkNotificationsRead',1,{});check(r.Success);eq(call('GetSocialState',1,{}).Notifications[1].Unread,false)
local reply=create(2,'A reply',{ReplyTo=1});eq(YApp.Posts[1].ReplyCount,1);eq(reply.ReplyTo,1)
local quote=create(2,'A quote',{QuoteId=1});eq(YApp.Posts[1].QuoteCount,1);eq(quote.Quote.Id,1)
rejects('CreatePost',1,{Msg='Both',ReplyTo=1,QuoteId=2})
r=call('ToggleRepost',2,{Id=1});check(r.Success and r.HasReposted);eq(YApp.Posts[1].RepostCount,1)
local repostId=YApp.Posts[1].Reposts.OTHER;check(YApp.Posts[repostId]);rejects('ToggleRepost',1,{Id=repostId});rejects('ToggleLike',1,{Id=repostId})
r=call('ToggleRepost',2,{Id=1});check(r.Success and not r.HasReposted);eq(YApp.Posts[1].RepostCount,0);eq(YApp.Posts[repostId],nil)
-- Delete only owned posts; deleting reply/quote updates the original's counters.
rejects('DeletePost',2,{Id=1});check(YApp.Posts[1]);check(call('DeletePost',2,{Id=reply.Id}).Success);eq(YApp.Posts[1].ReplyCount,0)
check(call('DeletePost',2,{Id=quote.Id}).Success);eq(YApp.Posts[1].QuoteCount,0)
check(call('ToggleRepost',2,{Id=1}).Success);repostId=YApp.Posts[1].Reposts.OTHER
check(call('DeletePost',1,{Id=1}).Success);eq(YApp.Posts[repostId],nil);eq(YApp.Posts[1],nil)
local nextPost=create(1,'Monotonic ID');check(nextPost.Id>repostId)
-- Follow writes use actual actor, no self/missing targets, rollback on DB failure.
rejects('ToggleFollow',1,{TargetCid='ACTOR'});rejects('ToggleFollow',1,{TargetCid='MISSING'})
r=call('ToggleFollow',1,{TargetCid='OTHER',Cid='FORGED'});check(r.Success and r.IsFollowing);check(YApp.Follows.OTHER.ACTOR);eq(YApp.Follows.OTHER.FORGED,nil)
eq(call('GetProfile',1,{Cid='OTHER'}).Followers,1);eq(call('GetProfile',1,{}).Following,1)
failDB=true;rejects('ToggleFollow',1,{TargetCid='OTHER'});check(YApp.Follows.OTHER.ACTOR);failDB=false
r=call('ToggleFollow',1,{TargetCid='OTHER'});check(r.Success and not r.IsFollowing)
rejects('UpdateProfile',1,{Name=string.rep('a',101)});rejects('UpdateProfile',1,{Name='Test',Avatar='javascript:alert(1)'})
check(call('UpdateProfile',1,{Name='Renamed',Bio='A bio',Avatar='',Banner=''}));eq(YApp.Posts[nextPost.Id].Name,'Renamed')
-- Gallery allocator cannot collide with composed posts, including after deletion.
local player=Peak.Functions.GetPlayer(1);local before=YApp.NextId
check(YApp.CreatePhotoPost(1,player,'Gallery caption','https://i.imgur.com/photo.jpg'));eq(YApp.NextId,before+1);eq(YApp.Posts[before+1].Images[1],'https://i.imgur.com/photo.jpg')
local newer=create(1,'After gallery');eq(newer.Id,before+2);check(YApp.Posts[before+1])
check(not YApp.CreatePhotoPost(1,player,'Wrong host','https://not-allowed.invalid/test.jpg'))
loadrel('server/sv_gallery.lua');IsNetworkEnabled=true
PhoneDB.one=function(sql,args) if sql:find('FROM phone_photos',1,true) and args[2]=='ACTOR' then return {id=1,photo_url='https://i.imgur.com/owned.jpg',citizenid='ACTOR'} end end
check(rpc('peak-phone:portable:gallery',1,'PostToTwatter',{PhotoId=1,Caption='Owned photo'}));eq(YApp.Posts[YApp.NextId].Msg,'Owned photo')
check(not rpc('peak-phone:portable:gallery',2,'PostToTwatter',{PhotoId=1,Caption='Not mine'}))
-- Character switch during awaited profile resolution must prevent new post mutation.
before=YApp.NextId;afterQuery=function()PLAYERS[1].PlayerData.citizenid='CHANGED'end
rejects('CreatePost',1,{Msg='Stale character'});eq(YApp.NextId,before);PLAYERS[1].PlayerData.citizenid='ACTOR'
-- Reports deduplicate per actor, admin clear keeps IDs monotonic and old IDs cannot alias.
check(call('ReportPost',1,{Id=second.Id}).Success);rejects('ReportPost',1,{Id=second.Id});eq(YApp.Reports[second.Id].Count,1)
local originalPermission=Peak.Functions.HasPermission;Peak.Functions.HasPermission=function(src)return src==1 end
before=YApp.NextId;COMMANDS.cleary(1);eq(YApp.PostCount,0);eq(YApp.NextId,before);eq(next(YApp.Posts),nil)
Peak.Functions.HasPermission=originalPermission
local last=create(1,'New feed');eq(last.Id,before+1)
