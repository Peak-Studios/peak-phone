local labels={weazelnews='Weazel News',bin='International News'}
local function networkLabel(network)
    return Phone.ownerNewsLabel and Phone.ownerNewsLabel(network) or labels[network]
end
local function journalist(src,network)
    if not labels[network] then return false end
    if PhoneIntegration.IsJournalist then return PhoneIntegration.IsJournalist(src,network)==true end
    local p=Peak.Functions.GetPlayer(src);return p and PhoneConfig.NewsJobs[p.PlayerData.job.name]==true or false
end
local function articles(network)
    if not labels[network] then return {} end
    local rows=PhoneDB.query('SELECT * FROM phone_newsarticles WHERE network=? ORDER BY timestamp DESC LIMIT 100',{network})
    for _,r in ipairs(rows) do r.images=Phone.decode(r.images,{}) end;return rows
end
Peak.Functions.CreateCallback('peak-phone:Server:News:IsJournalist',function(src,cb,data) cb(journalist(src,data.Network)) end)
Peak.Functions.CreateCallback('peak-phone:Server:News:GetArticles',function(src,cb,data) cb(articles(data.Network)) end)
Peak.Functions.CreateCallback('peak-phone:Server:News:SaveArticle',function(src,cb,data)
    local p=Peak.Functions.GetPlayer(src);local images=Phone.attachmentList(data.Images);local content=Phone.cleanHTML(data.Content)
    if not p or not journalist(src,data.Network) or not content or not images or not Phone.text(data.Title,150) then return cb(Phone.publicError('A journalist job, title, and valid content are required.')) end
    local id=p.PlayerData.citizenid;local author=p.PlayerData.charinfo.firstname..' '..p.PlayerData.charinfo.lastname
    if data.Id then
        local row=PhoneDB.one('SELECT author_cid,network FROM phone_newsarticles WHERE id=?',{Phone.number(data.Id,2147483647) or 0})
        if not row or row.network~=data.Network or (row.author_cid~=id and not Peak.Functions.HasPermission(src,'admin')) then return cb(Phone.publicError('Only the author or an administrator can edit this article.')) end
        PhoneDB.update('UPDATE phone_newsarticles SET title=?,content=?,images=? WHERE id=?',{data.Title,content,json.encode(images),data.Id})
    else
        PhoneDB.insert('INSERT INTO phone_newsarticles (network,title,content,images,author,author_cid,timestamp) VALUES (?,?,?,?,?,?,?)',{data.Network,data.Title,content,json.encode(images),author,id,os.time()*1000})
        TriggerClientEvent('peak-phone:Client:News:NewArticle',-1,data.Network=='weazelnews' and 'news' or 'bin',networkLabel(data.Network),data.Title,author,'')
    end
    cb(articles(data.Network))
end)
Peak.Functions.CreateCallback('peak-phone:Server:News:DeleteArticle',function(src,cb,data)
    local p=Peak.Functions.GetPlayer(src);local row=PhoneDB.one('SELECT * FROM phone_newsarticles WHERE id=?',{Phone.number(data.id or data.Id,2147483647) or 0})
    if not p or not row or not journalist(src,row.network) or (row.author_cid~=p.PlayerData.citizenid and not Peak.Functions.HasPermission(src,'admin')) then return cb(false) end
    cb(PhoneDB.update('DELETE FROM phone_newsarticles WHERE id=?',{row.id})>0)
end)
