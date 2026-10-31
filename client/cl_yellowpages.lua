YellowPages={Posts={}}
local generation=0
local function fetch()
 local ok,result=pcall(Peak.SendCallback,'peak-phone:Server:YellowPages:GetPosts')
 if not ok or type(result)~='table' then return nil end
 return result
end
function InitYellowPages() YellowPages.Posts=fetch() or {} end
function YellowPages.SetPosts() SendNUIMessage({Action='YellowPages/SetPosts',Posts=YellowPages.Posts}) end
RegisterNUICallback('YellowPages/GetPosts',function(_,cb)
 local token=generation
 local result=fetch()
 if token~=generation then return cb({__phoneError=true,error='Your character changed.'}) end
 if not result then return cb({__phoneError=true,error='Listings are unavailable. Try again.'}) end
 YellowPages.Posts=result;cb(result)
end)
for _,route in ipairs({'PostAd','RemoveAd'}) do
 RegisterNUICallback('YellowPages/'..route,function(data,cb)
  local ok,result=pcall(Peak.SendCallback,'peak-phone:Server:YellowPages:'..route,data or {})
  cb(ok and type(result)=='table' and result or {Success=false,Error='The listing could not be updated.'})
 end)
end
RegisterNetEvent('peak-phone:Client:YellowPages:Refresh',function()
 if source~=65535 then return end
 SendNUIMessage({Action='YellowPages/Refresh'})
 if not IsPhoneAppVisible('yellowpages') then SetAppUnread('yellowpages') end
end)
AddEventHandler('Peak:Client:OnPlayerUnload',function() generation=generation+1;YellowPages.Posts={} end)
