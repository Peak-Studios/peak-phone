-- One shared bridge. Every callback responds, including errors / character changes.
local generation=0
local routes={'GetSession','SaveProfile','DeleteAccount','GetProfile','GetPeople','GetFeed','GetStories','GetStoryArchive','GetHighlights','SaveHighlight','DeleteHighlight','CreatePost','DeletePost','SetLike','SetSave','SetFollow','GetComments','CreateComment','DeleteComment','GetBingeDeck','BingeSwipe','GetMatches','Unmatch','GetConversations','GetMessages','SendMessage','GetActivity','MarkActivityRead','SetBlock','GetBlocked','Report'}
for _,route in ipairs(routes) do
 RegisterNUICallback('Social/'..route,function(data,cb)
  local token=generation
  CreateThread(function()
   local ok,result=pcall(Peak.SendCallback,'peak-phone:Server:Social:'..route,type(data)=='table' and data or {})
   if token~=generation then return cb({Success=false,Error='Your character changed. Reopen the app.'}) end
   if not ok then return cb({Success=false,Error='Social request failed. Check the server and try again.'}) end
   cb(type(result)=='table' and result or {Success=false,Error='Social service unavailable.'})
  end)
 end)
end
RegisterNetEvent('peak-phone:Client:Social:Changed',function(data)
 if source~=65535 or type(data)~='table' or (data.App~='kilogram' and data.App~='binge') then return end
 SendNUIMessage({Action='Social/Changed',App=data.App,Kind=data.Kind})
 if not IsPhoneAppVisible(data.App) then
  SetAppUnread(data.App)
  if data.Kind=='message' or data.Kind=='match' then Notification('social-'..data.App,'fas fa-comment',{'white','#9560a9'},data.App=='binge' and 'Binge' or 'KiloGram',data.Kind=='match' and 'You have a new match.' or 'You have a new message.') end
 end
end)
AddEventHandler('Peak:Client:OnPlayerUnload',function() generation=generation+1 end)
