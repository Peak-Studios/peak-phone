-- All existing Y routes remain registered. Results are no longer replaced with false success.
YApp={Posts={}}
local refreshing,refreshAgain,epoch=false,false,0
local function fetch(name,...)
    local ok,result=pcall(Peak.SendCallback,name,...)
    if not ok then return {__phoneError=true,error=tostring(result)} end
    return result
end
function YApp.SetPosts() SendNUIMessage({Action='Y/SetPosts',Posts=YApp.Posts}) end
local function refresh()
    if refreshing then refreshAgain=true;return end;refreshing=true
    local generation=epoch
    Citizen.CreateThread(function()
        repeat
            refreshAgain=false
            local posts=fetch('peak-phone:Server:Y:GetPosts')
            if generation~=epoch then return end
            if type(posts)=='table' and not posts.__phoneError then YApp.Posts=posts end
            if IsPhoneAppMounted('y') then YApp.SetPosts();SendNUIMessage({Action='Y/SocialChanged'}) end
        until not refreshAgain
        refreshing=false
    end)
end
function InitY() refresh() end
RegisterNUICallback('Y/GetPosts',function(_,cb)
    local generation=epoch
    Citizen.CreateThread(function()
        local posts=fetch('peak-phone:Server:Y:GetPosts')
        if generation~=epoch then cb({__phoneError=true,Message='Character changed.'});return end
        if type(posts)=='table' and not posts.__phoneError then YApp.Posts=posts end
        cb(posts or {})
    end)
end)
-- Single registration per endpoint; server resolves the actor from source, never from the UI.
for _,route in ipairs({'GetFeed','GetThread','GetProfilePosts','Search','CreatePost','ReportPost','GetProfile','UpdateProfile','GetPremiumStatus','TogglePremium','ToggleLike','ToggleFollow','ToggleRepost','DeletePost','GetSocialState','MarkNotificationsRead'}) do
    RegisterNUICallback('Y/'..route,function(data,cb)
        Citizen.CreateThread(function()
            local generation=epoch
            local result=fetch('peak-phone:Server:Y:'..route,data or {})
            if generation~=epoch then cb({__phoneError=true,error='Character changed.'});return end
            if type(result)=='table' and result.Success and route=='ToggleLike' then
                for _,post in ipairs(YApp.Posts) do if post.Id==tonumber(data.Id) then post.HasLiked=result.HasLiked;post.LikeCount=result.LikeCount;break end end
            end
            if route=='TogglePremium' and type(result)=='table' and result.Message then Peak.Functions.Notify(result.Message,result.Success and 'success' or 'error',5000) end
            cb(result==nil and {Success=false,Message='No response from Y.'} or result)
        end)
    end)
end
RegisterNUICallback('Y/OpenMessages',function(_,cb) SendNUIMessage({Action='SwitchToApp',App='messages'});cb('Ok') end)
RegisterNetEvent('peak-phone:Client:Y:Refresh',function() if source~=65535 then return end;refresh() end)
RegisterNetEvent('peak-phone:Client:Y:UpdatePostLikes',function(id,count)
    if source~=65535 then return end
    for _,post in ipairs(YApp.Posts) do if post.Id==id then post.LikeCount=count;break end end
    if IsPhoneAppMounted('y') then YApp.SetPosts() end
end)
RegisterNetEvent('peak-phone:Client:Y:CreatePost',function(id,data)
    if source~=65535 or type(data)~='table' then return end
    local found=false;for _,post in ipairs(YApp.Posts) do if post.Id==id then found=true;break end end
    if not found then table.insert(YApp.Posts,data) end
    if IsPhoneAppMounted('y') then YApp.SetPosts() end
    if not IsPhoneAppVisible('y') then
        SetAppUnread('y')
        if PhoneServices['peak-hud']:GetPreferenceById('Notifications.Tweet') then Notification('new-y-'..tostring(id),'fas fa-comment',{'white','#000000'},'@'..tostring(data.Sender or 'Y'),tostring(data.Msg or ''),nil,nil,nil,nil,{App='y',PostId=tonumber(id)}) end
    end
end)
RegisterNetEvent('peak-phone:Client:Y:RemovePost',function(id)
    if source~=65535 then return end
    for index,post in ipairs(YApp.Posts) do if post.Id==id then table.remove(YApp.Posts,index);break end end
    if IsPhoneAppMounted('y') then YApp.SetPosts() end
end)
RegisterNetEvent('peak-phone:Client:Y:ResetPosts',function()
    if source~=65535 then return end;YApp.Posts={};if IsPhoneAppMounted('y') then YApp.SetPosts() end
end)
AddEventHandler('Peak:Client:OnPlayerUnload',function() epoch=epoch+1;refreshing=false;refreshAgain=false;YApp.Posts={} end)
