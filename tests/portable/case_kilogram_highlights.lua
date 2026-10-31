-- Execute the real social callbacks. SQL fixtures cover access boundaries and write construction.
base('qbcore');loadrel('config.lua');loadrel('sv_config.lua');addPlayer(1,'OWNER');addPlayer(2,'OTHER')
local me={id=1,citizenid='OWNER',app='kilogram',handle='owner',display_name='Owner',suspended=0}
local other={id=2,citizenid='OTHER',app='kilogram',handle='other',display_name='Other',suspended=0}
local old={id=10,profile_id=1,kind='story',caption='Old story',media=json.encode({{url='https://i.imgur.com/a.jpg',type='image'}}),created_at=1000,expires_at=2000}
local denied=false;local transaction;local transactionOK=true;local writes={};local archiveArgs
PhoneDB.one=function(sql,args)
 if sql:find('citizenid=? AND app=?',1,true) then local profile=copy(args[1]=='OWNER' and me or other);profile.app=args[2];return profile end
 if sql:find('FROM peak_phone_social_blocks',1,true) then return denied and {profile_id=1} or nil end
 if sql:find('COUNT(*) n FROM peak_phone_social_highlights',1,true) then return {n=0} end
 if sql:find('FROM peak_phone_social_highlights WHERE id=? AND profile_id=?',1,true) then return args[1]==7 and args[2]==1 and {id=7} or nil end
 if sql:find("kind='story'",1,true) then return args[1]==10 and args[2]==1 and old or nil end
 if sql:find('FROM peak_phone_social_posts WHERE id=? AND profile_id=?',1,true) then return args[1]==10 and args[2]==1 and old or nil end
 if sql:find('WHERE id=? AND app=?',1,true) then return args[1]==1 and me or args[1]==2 and other or nil end
end
PhoneDB.query=function(sql,args)
 if sql:find("kind='story' AND (?=0",1,true) then archiveArgs=args;return args[1]==1 and {old} or {} end
 if sql:find('FROM peak_phone_social_highlights WHERE profile_id=?',1,true) then return args[1]==1 and {{id=7,title='City',profile_id=1}} or {} end
 if sql:find('JOIN peak_phone_social_posts t ON t.id=s.post_id',1,true) then return {old} end
 return {}
end
PhoneDB.transaction=function(statements) transaction=statements;return transactionOK end
PhoneDB.update=function(sql,args) writes[#writes+1]={sql=sql,args=args};return 1 end
Phone.rate=function()return true end
loadrel('server/sv_social.lua')
local function call(route,src,data) data=data or {};data.App=data.App or 'kilogram';return rpc('peak-phone:Server:Social:'..route,src,data) end
local function reject(route,src,data) local result=call(route,src,data);check(not result.Success,'must reject '..route) end
local result=call('GetStoryArchive',1,{ProfileId=2});eq(#result.posts,1);eq(archiveArgs[1],1,'archive identity cannot be forged');eq(result.posts[1].expires_at,2000)
result=call('GetStoryArchive',2,{ProfileId=1});eq(#result.posts,0)
result=call('GetHighlights',2,{ProfileId=1});eq(#result.highlights,1);eq(result.highlights[1].posts[1].highlight,true);eq(result.highlights[1].own,false)
denied=true;reject('GetHighlights',2,{ProfileId=1});denied=false
reject('GetHighlights',1,{ProfileId=99});reject('GetStoryArchive',1,{App='binge'})
for _,data in ipairs({{Title='',StoryIds={10}},{Title='City',StoryIds={}},{Title=string.rep('x',49),StoryIds={10}},{Title='City',StoryIds={999}},{Title='City',StoryIds={10,10}},{Id=8,Title='City',StoryIds={10}}}) do reject('SaveHighlight',1,data) end
reject('SaveHighlight',2,{Title='Stolen',StoryIds={10},ProfileId=1})
check(call('SaveHighlight',1,{Title='City',StoryIds={10}}).Success)
eq(#transaction,2);check(transaction[1].query:find('INSERT INTO peak_phone_social_highlights',1,true));eq(transaction[1].values[1],1);check(transaction[2].query:find('LAST_INSERT_ID()',1,true));eq(transaction[2].values[1],10)
check(call('SaveHighlight',1,{Id=7,Title='Updated',StoryIds={10}}).Success);eq(#transaction,3);eq(transaction[1].values[2],7);eq(transaction[3].values[1],7)
transactionOK=false;reject('SaveHighlight',1,{Title='City',StoryIds={10}});transactionOK=true
check(call('DeleteHighlight',2,{Id=7,ProfileId=1}).Success);eq(writes[#writes].args[2],2,'delete is bound to authenticated owner')
check(call('DeletePost',1,{Id=10}).Success,'expired owner story can be deleted');eq(writes[#writes].args[2],1)
reject('DeletePost',2,{Id=10})
check(not LoadResourceFile('peak-phone','server/sv_social.lua'):find('DELETE FROM peak_phone_social_posts WHERE expires_at',1,true),'expiry must retain archive')
