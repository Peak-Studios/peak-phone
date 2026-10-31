RegisterNUICallback("News/IsJournalist", function(Data, Cb) Cb(Peak.SendCallback("peak-phone:Server:News:IsJournalist", Data)) end)

RegisterNUICallback("News/GetArticles", function(Data, Cb)
    local Result = Peak.SendCallback("peak-phone:Server:News:GetArticles", Data)
    Cb(Result)
end)

RegisterNUICallback("News/SaveArticle", function(Data, Cb)
    local Result = Peak.SendCallback("peak-phone:Server:News:SaveArticle", Data)
    Cb(Result)
end)

RegisterNUICallback("News/DeleteArticle", function(Data, Cb)
    Cb(Peak.SendCallback("peak-phone:Server:News:DeleteArticle", Data))
end)

RegisterNetEvent("peak-phone:Client:News:NewArticle")
AddEventHandler("peak-phone:Client:News:NewArticle", function(NewsApp, NewsNetwork, Title, Author, Content)
    if not IsPhoneAppVisible(NewsApp) then
        SetAppUnread(NewsApp)
        Notification("new-news-" .. math.random(1, 99999), "fas fa-rss", { "white", "#1d1d1d" }, NewsNetwork, ("TRENDING: %s - %s"):format(Author, Title))
    end
end)