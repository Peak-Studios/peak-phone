for _,Route in ipairs({'Begin','Finalize','List'}) do
 RegisterNUICallback('Media/'..Route,function(Data,Cb)
  Cb(Peak.SendCallback('peak-phone:Server:Media:'..Route,Data or {}))
 end)
end
