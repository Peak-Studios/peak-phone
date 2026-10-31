-- In-game virtual currencies only. No exchange API, real-money custody or market feed.
local W=Phone.Wallet

local function cryptoList()
    return type(Config)=='table' and type(Config.Crypto)=='table' and Config.Crypto or {}
end

local function currency(data)
    if type(data)~='table' then return end
    local list=cryptoList()
    if data.CryptoId~=nil then
        for _,coin in ipairs(list) do
            if type(coin)=='table' and coin.Id==data.CryptoId then return coin end
        end
        return
    end
    local index=Phone.number(data.Id,#list)
    return index and list[index]
end

local function validOperation(value)
    return type(value)=='string' and #value>=16 and #value<=64 and value:match('^[%w%-]+$')~=nil
end

local function unitPrice(coin)
    if type(coin)~='table' then return end
    return Phone.number(coin.Costs,PhoneConfig.Money.MaxTransfer)
end

local function canBuy(coin)
    return type(coin)=='table' and coin.Purchasable~=false and coin.CanBuy~=false
end

local function canSell(coin)
    return type(coin)=='table' and coin.CanSell~=false and unitPrice(coin)~=nil
end

local function totalPrice(coin,amount)
    local unit=unitPrice(coin)
    if not unit or not amount then return end
    return Phone.number(unit*amount,PhoneConfig.Money.MaxTransfer)
end

local function wallet(cid)
    local row=PhoneDB.one('SELECT crypto FROM peak_phone_characters WHERE citizenid=?',{cid})
    if not row then return nil end
    local value=Phone.decode(row.crypto)
    return type(value)=='table' and value or {}
end

local function cache(cid,coins)
    if Phone.Server.Profiles[cid] then Phone.Server.Profiles[cid].crypto=coins end
end

local function actor(src)
    local p=Phone.getPlayer(src)
    if not p or type(p.PlayerData)~='table' or type(p.PlayerData.citizenid)~='string' then return end
    local cid=p.PlayerData.citizenid
    local phone=Phone.activeNumber(src)
    if not phone or not Phone.sameCharacter(src,cid) then return end
    return p,cid,phone
end

local function actorsCurrent(src,cid,phone)
    return Phone.sameCharacter(src,cid) and Phone.activeNumber(src)==phone
end

local function reject(id,message)
    if not W.mark(id,'rejected') then return W.uncertain(id) end
    return W.rejected(id,message)
end

local function confirmedStatus(id,status)
    local ok,row=pcall(PhoneDB.one,'SELECT status FROM peak_phone_ledger WHERE operation_id=?',{id})
    return ok and row and row.status==status
end

local function markReview(id)
    W.mark(id,'review')
    return W.uncertain(id)
end

local function recordPrewriteRejection(id,src,cid,phone,toCid,amount,comment,message)
    -- A known pre-write rejection can be journaled even when another wallet
    -- operation is under review so this exact reference remains resolvable.
    -- This writes only a terminal no-balance-change row; it never relaxes the
    -- wallet-wide review gate.
    local readOk,previous=pcall(PhoneDB.one,'SELECT * FROM peak_phone_ledger WHERE operation_id=?',{id})
    if not actorsCurrent(src,cid,phone) then return Phone.publicError('Your character or SIM changed before the wallet action.') end
    if not readOk then return W.uncertain(id) end
    if previous then return Phone.publicError('Transaction reference already exists. Check its saved operation status.') end
    local insertedOk,inserted=pcall(PhoneDB.update,
        'INSERT INTO peak_phone_ledger(operation_id,from_citizenid,to_citizenid,amount,comment,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
        {id,cid,toCid,amount,comment,'rejected',os.time()*1000,os.time()*1000})
    if not actorsCurrent(src,cid,phone) then return Phone.publicError('Your character or SIM changed before the wallet action.') end
    if not insertedOk or inserted==nil or inserted==false or (type(inserted)=='number' and inserted<1) then
        -- A failed insert can be a unique-ID race or an ambiguous DB outcome.
        -- Never overwrite it or tell the client this invocation was rejected.
        local racedOk,raced=pcall(PhoneDB.one,'SELECT * FROM peak_phone_ledger WHERE operation_id=?',{id})
        if not actorsCurrent(src,cid,phone) then return Phone.publicError('Your character or SIM changed before the wallet action.') end
        if racedOk and raced then return Phone.publicError('Transaction reference already exists. Check its saved operation status.') end
        return W.uncertain(id)
    end
    local statusOk,row=pcall(PhoneDB.one,'SELECT status FROM peak_phone_ledger WHERE operation_id=?',{id})
    if not actorsCurrent(src,cid,phone) then return Phone.publicError('Your character or SIM changed before the wallet action.') end
    if not statusOk or not row or row.status~='rejected' then return W.uncertain(id) end
    return W.rejected(id,message)
end

local function beginOrRejectWalletReview(id,src,cid,phone,toCid,amount,comment)
    local started,result=W.begin(id,cid,toCid,amount,comment)
    if started then return true end
    if not actorsCurrent(src,cid,phone) then return false,Phone.publicError('Your character or SIM changed before the wallet action.') end
    -- W.begin remains the authority and keeps its unconditional review gate.
    -- Only its specific no-ID pre-write gate result is safe to turn into a
    -- terminal no-op row; duplicate IDs, insert failures and ambiguous outcomes
    -- remain exactly as W.begin returned them.
    if type(result)=='table' and result.OperationId==nil
        and result.Msg=='A wallet transaction needs administrator review. Run phone_doctor; do not retry it.' then
        return false,recordPrewriteRejection(id,src,cid,phone,toCid,amount,comment,
            'Another wallet transaction needs administrator review. This Crypto action was not submitted.')
    end
    return false,result
end

local function commitResult(id,success,message,status)
    return {Success=success==true,OperationId=id,Status=status,Msg=message}
end

Peak.Functions.CreateCallback('peak-phone:Server:Crypto:GetOperation',function(src,cb,data)
    data=type(data)=='table' and data or {}
    local _,cid,phone=actor(src)
    if not cid or not Phone.rate(src,'crypto-status',12,1000) then
        return cb(Phone.publicError('The in-game wallet status is unavailable.'))
    end
    local supplied=data.OperationId~=nil
    if supplied and not validOperation(data.OperationId) then
        return cb(Phone.publicError('The transaction reference is invalid.'))
    end
    local coins=wallet(cid)
    if not coins or not actorsCurrent(src,cid,phone) then
        return cb(Phone.publicError('Your character or SIM changed. Reopen the phone.'))
    end
    local operation
    local query,params
    if supplied then
        query=[[SELECT operation_id,status,amount,comment FROM peak_phone_ledger
            WHERE operation_id=? AND from_citizenid=?
              AND (comment LIKE 'CRYPTO BUY %' OR comment LIKE 'CRYPTO SELL %' OR comment LIKE 'CRYPTO TRANSFER %')
            LIMIT 1]]
        params={data.OperationId,cid}
    else
        query=[[SELECT operation_id,status,amount,comment FROM peak_phone_ledger
            WHERE from_citizenid=?
              AND (comment LIKE 'CRYPTO BUY %' OR comment LIKE 'CRYPTO SELL %' OR comment LIKE 'CRYPTO TRANSFER %')
              AND status NOT IN ('complete','refunded','rejected')
            ORDER BY created_at DESC LIMIT 1]]
        params={cid}
    end
    local row=PhoneDB.one(query,params)
    if not actorsCurrent(src,cid,phone) then
        return cb(Phone.publicError('Your character or SIM changed. Reopen the phone.'))
    end
    if row then
        local id=tostring(row.operation_id or '')
        local kind,coinId,units=tostring(row.comment or ''):match('^CRYPTO (%u+) ([%w_%-]+) (%d+)$')
        if not kind then kind,coinId=tostring(row.comment or ''):match('^CRYPTO (TRANSFER) ([%w_%-]+)$') end
        if not validOperation(id) or not ({BUY=true,SELL=true,TRANSFER=true})[kind] or not coinId or not coinId:match('^[%w_%-]+$') then
            row=nil
        else
            local status=row.status
            local known={prepared=true,debit_pending=true,debited=true,credit_pending=true,refund_pending=true,review=true,complete=true,refunded=true,rejected=true}
            if not known[status] then status='review' end
            operation={OperationId=id,Status=status,Kind=kind,CryptoId=coinId,Units=Phone.number(units,PhoneConfig.Money.MaxCryptoUnits),Amount=Phone.number(row.amount,PhoneConfig.Money.MaxTransfer,true)}
        end
    end
    local pending=W.pending(cid)
    local terminal=operation and ({complete=true,refunded=true,rejected=true})[operation.Status]
    if supplied and not operation then
        return cb(Phone.publicError('No matching in-game operation is available to this character.'))
    end
    if not actorsCurrent(src,cid,phone) then
        return cb(Phone.publicError('Your character or SIM changed. Reopen the phone.'))
    end
    cb({Success=true,Balances=coins,Operation=operation,
        Limits={MaxCryptoUnits=PhoneConfig.Money.MaxCryptoUnits,MaxTransfer=PhoneConfig.Money.MaxTransfer},
        WalletReviewRequired=pending~=nil and (operation==nil or terminal==true)})
end)

Peak.Functions.CreateCallback('peak-phone:Server:Crypto:BuyCrypto',function(src,cb,data)
    local coin=currency(data)
    local amount=type(data)=='table' and Phone.number(data.Amount,PhoneConfig.Money.MaxCryptoUnits)
    local total=amount and totalPrice(coin,amount)
    local p,cid,phone=actor(src)
    local id=type(data)=='table' and data.OperationId
    if not p or not canBuy(coin) or not amount or not total or not validOperation(id) then
        return cb(Phone.publicError('This currency cannot be purchased, or the amount or transaction reference is invalid.'))
    end
    cb(Phone.withLocks({'profile:'..cid,'operation:'..id},function()
        if not actorsCurrent(src,cid,phone) then return Phone.publicError('Your character or SIM changed before the purchase.') end
        local started,old=beginOrRejectWalletReview(id,src,cid,phone,cid,total,'CRYPTO BUY '..coin.Id..' '..amount)
        if not started then return old end
        if not actorsCurrent(src,cid,phone) then return reject(id,'Your character or SIM changed before the purchase.') end
        local coins=wallet(cid)
        if not coins then return markReview(id) end
        local balance=(tonumber(coins[coin.Id]) or 0)+amount
        if balance>PhoneConfig.Money.MaxCryptoUnits then return reject(id,'Wallet limit reached.') end
        local done,result=W.debit(id,src,cid,total,phone)
        if not done then return result end
        if not actorsCurrent(src,cid,phone) then return W.uncertain(id) end
        coins[coin.Id]=balance
        local saved=PhoneDB.transaction({
            {query='UPDATE peak_phone_characters SET crypto=? WHERE citizenid=?',values={json.encode(coins),cid}},
            {query="UPDATE peak_phone_ledger SET status='complete',updated_at=? WHERE operation_id=?",values={os.time()*1000,id}}
        })
        if not saved then return W.refund(id,src,cid,total,phone) end
        cache(cid,coins)
        if not confirmedStatus(id,'complete') then return markReview(id) end
        if actorsCurrent(src,cid,phone) then Phone.refresh(src) end
        return commitResult(id,true,'Purchase complete.','complete')
    end))
end)

Peak.Functions.CreateCallback('peak-phone:Server:Crypto:SellCrypto',function(src,cb,data)
    local coin=currency(data)
    local amount=type(data)=='table' and Phone.number(data.Amount,PhoneConfig.Money.MaxCryptoUnits)
    local total=amount and totalPrice(coin,amount)
    local p,cid,phone=actor(src)
    local id=type(data)=='table' and data.OperationId
    if not p or not canSell(coin) or not amount or not total or not validOperation(id) then
        return cb(Phone.publicError('This currency cannot be sold, or the amount or transaction reference is invalid.'))
    end
    cb(Phone.withLocks({'profile:'..cid,'operation:'..id},function()
        if not actorsCurrent(src,cid,phone) then return Phone.publicError('Your character or SIM changed before the sale.') end
        local started,old=beginOrRejectWalletReview(id,src,cid,phone,cid,total,'CRYPTO SELL '..coin.Id..' '..amount)
        if not started then return old end
        if not actorsCurrent(src,cid,phone) then return reject(id,'Your character or SIM changed before the sale.') end
        local coins=wallet(cid)
        if not coins then return markReview(id) end
        local owned=tonumber(coins[coin.Id]) or 0
        if owned<amount then return reject(id,'Insufficient in-game currency.') end
        coins[coin.Id]=owned-amount
        local removed=PhoneDB.transaction({
            {query='UPDATE peak_phone_characters SET crypto=? WHERE citizenid=?',values={json.encode(coins),cid}},
            {query="UPDATE peak_phone_ledger SET status='credit_pending',updated_at=? WHERE operation_id=?",values={os.time()*1000,id}}
        })
        if not removed then return reject(id,'The in-game database declined the sale.') end
        cache(cid,coins)
        if not confirmedStatus(id,'credit_pending') then return markReview(id) end
        if not actorsCurrent(src,cid,phone) then return markReview(id) end
        local ok,paid,result,detail=W.exportCall(Phone.addMoney,src,PhoneConfig.Money.Account,total,'peak-duo:'..id)
        if not ok then return markReview(id) end
        if not paid then
            if not W.confirmedNoChange(ok,result,detail) then return markReview(id) end
            local restoredCoins=wallet(cid)
            if not restoredCoins then return markReview(id) end
            restoredCoins[coin.Id]=(tonumber(restoredCoins[coin.Id]) or 0)+amount
            local restored=PhoneDB.transaction({
                {query='UPDATE peak_phone_characters SET crypto=? WHERE citizenid=?',values={json.encode(restoredCoins),cid}},
                {query="UPDATE peak_phone_ledger SET status='refunded',updated_at=? WHERE operation_id=?",values={os.time()*1000,id}}
            })
            if not restored then return markReview(id) end
            cache(cid,restoredCoins)
            if not confirmedStatus(id,'refunded') then return markReview(id) end
            if actorsCurrent(src,cid,phone) then Phone.refresh(src) end
            return commitResult(id,false,'The bank declined the credit. Your in-game currency was returned.','refunded')
        end
        if not actorsCurrent(src,cid,phone) then return markReview(id) end
        if not W.mark(id,'complete') then return W.uncertain(id) end
        if not confirmedStatus(id,'complete') then return markReview(id) end
        if actorsCurrent(src,cid,phone) then Phone.refresh(src) end
        return commitResult(id,true,'Sale complete.','complete')
    end))
end)

Peak.Functions.CreateCallback('peak-phone:Server:Crypto:TransferCrypto',function(src,cb,data)
    local coin=currency(data)
    local amount=type(data)=='table' and Phone.number(data.Amount,PhoneConfig.Money.MaxCryptoUnits)
    local recipient=type(data)=='table' and Phone.phone(data.Phone)
    local p,cid,phone=actor(src)
    local id=type(data)=='table' and data.OperationId
    if not p or not coin or not amount or not validOperation(id) then
        return cb(Phone.publicError('Choose a valid currency, amount and different online recipient, with a valid transaction reference.'))
    end
    local comment='CRYPTO TRANSFER '..coin.Id..' '..amount
    local target=recipient and Peak.Functions.GetPlayerByPhone(recipient)
    local targetData=target and type(target.PlayerData)=='table' and target.PlayerData
    local targetCid=targetData and type(targetData.citizenid)=='string' and targetData.citizenid or nil
    local targetSource=targetData and tonumber(targetData.source)
    if not targetCid or targetCid==cid then
        return cb(Phone.withLocks({'profile:'..cid,'operation:'..id},function()
            if not actorsCurrent(src,cid,phone) then return Phone.publicError('Your character or SIM changed before the transfer.') end
            return recordPrewriteRejection(id,src,cid,phone,cid,amount,comment,'Choose a different online character with an active phone.')
        end))
    end
    local function senderCurrent()
        return actorsCurrent(src,cid,phone)
    end
    local function recipientCurrent()
        return targetSource and Phone.sameCharacter(targetSource,targetCid)
            and Phone.activeNumber(targetSource)==recipient
    end
    cb(Phone.withLocks({'profile:'..cid,'profile:'..targetCid,'operation:'..id},function()
        -- A sender identity/SIM change leaves the original write scope and must
        -- stay an error. A target disconnect or SIM change is a definite
        -- pre-write rejection for this saved reference, recorded under both
        -- known profile locks.
        if not senderCurrent() then return Phone.publicError('Your character or SIM changed before the transfer.') end
        if not recipientCurrent() then
            return recordPrewriteRejection(id,src,cid,phone,targetCid,amount,comment,'The recipient is no longer online with the selected active phone.')
        end
        local started,old=beginOrRejectWalletReview(id,src,cid,phone,targetCid,amount,comment)
        if not started then return old end
        if not senderCurrent() then return W.uncertain(id) end
        if not recipientCurrent() then return reject(id,'The recipient disconnected or changed phones before the transfer.') end
        local from,to=wallet(cid),wallet(targetCid)
        if not from or not to then return markReview(id) end
        local current=tonumber(from[coin.Id]) or 0
        local recipientBalance=tonumber(to[coin.Id]) or 0
        if current<amount or recipientBalance+amount>PhoneConfig.Money.MaxCryptoUnits then
            return reject(id,'Insufficient currency or recipient wallet limit reached.')
        end
        from[coin.Id]=current-amount;to[coin.Id]=recipientBalance+amount
        local saved=PhoneDB.transaction({
            {query='UPDATE peak_phone_characters SET crypto=? WHERE citizenid=?',values={json.encode(from),cid}},
            {query='UPDATE peak_phone_characters SET crypto=? WHERE citizenid=?',values={json.encode(to),targetCid}},
            {query="UPDATE peak_phone_ledger SET status='complete',updated_at=? WHERE operation_id=?",values={os.time()*1000,id}}
        })
        if not saved then return reject(id,'The in-game database declined the transfer.') end
        cache(cid,from);cache(targetCid,to)
        if not confirmedStatus(id,'complete') then return markReview(id) end
        if recipientCurrent() then
            Phone.refresh(targetSource)
            Phone.notify(targetSource,amount..' '..coin.Id..' received.','success')
        end
        if senderCurrent() then Phone.refresh(src) end
        return commitResult(id,true,'Transfer complete.','complete')
    end))
end)
