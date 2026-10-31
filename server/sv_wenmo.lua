local W=Phone.Wallet
local function actor(src)
    local number=Phone.activeNumber(src);local p=Phone.getPlayer(src)
    return p,number,p and p.PlayerData.citizenid
end
local function validOperation(value)
    local id=Phone.string(value,64)
    return id and #id>=16 and id:match('^[%w%-]+$') and id or nil
end
local function groupId(value)
    if value==nil or value=='' then return nil end
    local id=Phone.string(value,50)
    return id and id:match('^GRP%d+$') and id or false
end
local function isMember(id,number)
    return id and PhoneDB.one('SELECT group_id FROM phone_group_members WHERE group_id=? AND phone=?',{id,number})~=nil
end
local function groupMembersCurrent(id,firstPhone,secondPhone)
    return not id or (isMember(id,firstPhone) and isMember(id,secondPhone))
end
local function groupCommitGuard(id,firstPhone,secondPhone)
    if not id then return '',{} end
    return ' AND EXISTS (SELECT 1 FROM phone_group_members WHERE group_id=? AND phone=?) AND EXISTS (SELECT 1 FROM phone_group_members WHERE group_id=? AND phone=?)',
        {id,firstPhone,id,secondPhone}
end

Peak.Functions.CreateCallback('peak-phone:Server:Wenmo:GetBankData',function(src,cb)
    local p=Phone.getPlayer(src);if not p then return cb({Balance=0,Transactions={}}) end
    local cid=p.PlayerData.citizenid
    local rows=PhoneDB.query('SELECT * FROM phone_wenmo WHERE from_citizenid=? OR to_citizenid=? ORDER BY id DESC LIMIT 100',{cid,cid})
    local entries={}
    for _,r in ipairs(rows or {}) do local outgoing=r.from_citizenid==cid
        entries[#entries+1]={Name=Peak.Functions.GetPlayerCharName(outgoing and r.to_citizenid or r.from_citizenid),Comment=r.comment,Amount=tonumber(r.amount),Timestamp=tonumber(r.timestamp),IsSender=outgoing,Type='WENMO'}
    end
    cb({Balance=Phone.nativeMoney(src,PhoneConfig.Money.Account),Transactions=entries})
end)

Peak.Functions.CreateCallback('peak-phone:Server:Wenmo:SendMoney',function(src,cb,data)
    data=type(data)=='table' and data or {}
    local amount=Phone.number(data.Amount,PhoneConfig.Money.MaxTransfer)
    local number=Phone.phone(data.Phone)
    local comment=data.Comment==nil and 'No comment' or data.Comment
    local context=data.MessageContext
    if context~=nil and type(context)~='table' then return cb(Phone.publicError('The Messages payment destination is invalid.')) end
    local messageOperation=context and validOperation(data.OperationId)
    local fromPhone=Phone.activeNumber(src)
    local contextTarget=context and Phone.phone(context.ToPhone)
    local contextGroup=context and groupId(context.GroupId)
    if not amount or not number or not Phone.text(comment,255,true) or not Phone.rate(src,'money',2,2000) then return cb(Phone.publicError('Enter a valid whole-number amount, phone number and short comment.')) end
    if context and not messageOperation then return cb(Phone.publicError('A stable Messages payment reference is required.')) end
    if context and (contextGroup==false or contextTarget~=number or context.FromPhone~=fromPhone) then return cb(Phone.publicError('The Messages payment destination changed. Reopen the transfer.')) end
    if contextGroup and not groupMembersCurrent(contextGroup,fromPhone,number) then return cb(Phone.publicError('Both people must be members of that group.')) end
    local a=Phone.getPlayer(src);local b=Peak.Functions.GetPlayerByPhone(number)
    if not a or not b or a.PlayerData.citizenid==b.PlayerData.citizenid then return cb(Phone.publicError('The other player must be online and cannot be yourself.')) end
    local bs=b.PlayerData.source;local ac,bc=a.PlayerData.citizenid,b.PlayerData.citizenid;local id=messageOperation or W.reference(data)
    cb(Phone.withLocks({'profile:'..ac,'profile:'..bc,'operation:'..id},function()
        local function actorsCurrent()
            local fromNow=Phone.activeNumber(src);local toNow=Phone.activeNumber(bs)
            return fromNow==fromPhone and toNow==number and Phone.sameCharacter(src,ac) and Phone.sameCharacter(bs,bc)
        end
        local function participantsCurrent() return groupMembersCurrent(contextGroup,fromPhone,number) and actorsCurrent() end
        if not participantsCurrent() then return Phone.publicError('Both players must still have the selected active characters, SIMs and group membership.') end
        local ready,previous=W.begin(id,ac,bc,amount,comment);if not ready then return previous end
        if not participantsCurrent() then W.mark(id,'rejected');return W.rejected(id,'A character, SIM or group membership changed before the wallet debit.') end
        local debited,result=W.debit(id,src,ac,amount,fromPhone);if not debited then return result end
        if not participantsCurrent() then return W.refund(id,src,ac,amount,fromPhone) end
        if not W.mark(id,'credit_pending') then return W.uncertain(id) end
        if not participantsCurrent() then return W.refund(id,src,ac,amount,fromPhone) end
        local ok,done,result,detail=W.exportCall(Phone.addMoney,bs,PhoneConfig.Money.Account,amount,'peak-duo:'..id)
        if not ok then W.mark(id,'review');return W.uncertain(id) end
        if not done then
            if not W.confirmedNoChange(ok,result,detail) then W.mark(id,'review');return W.uncertain(id) end
            return W.refund(id,src,ac,amount,fromPhone)
        end
        if not participantsCurrent() then W.mark(id,'review');return W.uncertain(id) end
        local commitGuard,commitParams=groupCommitGuard(contextGroup,fromPhone,number)
        local completionValues={os.time()*1000,id}
        for _,value in ipairs(commitParams) do completionValues[#completionValues+1]=value end
        local statements={
            {query="UPDATE peak_phone_ledger SET status='complete',updated_at=? WHERE operation_id=? AND status='credit_pending'"..commitGuard,values=completionValues},
            {query="INSERT INTO phone_wenmo(from_citizenid,to_citizenid,amount,comment,timestamp) SELECT ?,?,?,?,? FROM peak_phone_ledger WHERE operation_id=? AND status='complete'",values={ac,bc,amount,comment,os.time()*1000,id}}
        }
        if context then statements[#statements+1]={query="INSERT INTO phone_cash_events(operation_id,from_cid,to_cid,from_phone,to_phone,group_id,amount,created_at) SELECT ?,?,?,?,?,NULLIF(?,''),?,? FROM peak_phone_ledger WHERE operation_id=? AND status='complete'",values={id,ac,bc,fromPhone,number,contextGroup or '',amount,os.time()*1000,id}} end
        local saved=PhoneDB.transaction(statements)
        local committed=saved and PhoneDB.one('SELECT status FROM peak_phone_ledger WHERE operation_id=?',{id})
        if not saved or not committed or committed.status~='complete' then W.mark(id,'review');return W.uncertain(id) end
        if Phone.activeNumber(bs)==number and Phone.sameCharacter(bs,bc) then Phone.notify(bs,'iFruit Cash: $'..Phone.commas(amount)..' received.','success');TriggerClientEvent('peak-phone:Client:SetAppUnread',bs,'wenmo');Phone.refresh(bs) end
        if Phone.activeNumber(src)==fromPhone and Phone.sameCharacter(src,ac) then Phone.refresh(src) end
        return {Success=true,OperationId=id}
    end))
end)

Peak.Functions.CreateCallback('peak-phone:Server:Wenmo:CreateRequest',function(src,cb,data)
    data=type(data)=='table' and data or {}
    local p,requesterPhone,requesterCid=actor(src)
    local payerPhone=Phone.phone(data.Phone);local amount=Phone.number(data.Amount,PhoneConfig.Money.MaxTransfer)
    local comment=data.Comment==nil and '' or data.Comment;local nonce=validOperation(data.ClientNonce);local group=groupId(data.GroupId)
    if not p or not requesterPhone or not amount or not payerPhone or not nonce or not Phone.text(comment,255,true) or group==false or not Phone.rate(src,'cash-request',4,3000) then return cb(Phone.publicError('Enter a valid recipient, whole-dollar amount and short note.')) end
    if payerPhone==requesterPhone then return cb(Phone.publicError('Choose someone else to request money from.')) end
    if group and not groupMembersCurrent(group,requesterPhone,payerPhone) then return cb(Phone.publicError('Choose a member of this group.')) end
    local payer=Peak.Functions.GetPlayerByPhone(payerPhone)
    if not payer then return cb(Phone.publicError('The person must be online with that active SIM to receive a request.')) end
    local payerCid=payer.PlayerData.citizenid
    local payerSource=payer.PlayerData.source
    if payerCid==requesterCid then return cb(Phone.publicError('Choose another character.')) end
    local function actorsCurrent()
        local requesterNow=Phone.activeNumber(src);local payerNow=Phone.activeNumber(payerSource)
        return requesterNow==requesterPhone and payerNow==payerPhone
            and Phone.sameCharacter(src,requesterCid) and Phone.sameCharacter(payerSource,payerCid)
    end
    if not actorsCurrent() then return cb(Phone.publicError('The person must be online with that active SIM to receive a request.')) end
    cb(Phone.withLocks({'cash-request-create:'..requesterCid..':'..nonce},function()
        if not actorsCurrent() then return Phone.publicError('A character or SIM changed.') end
        local existing=PhoneDB.one('SELECT id,requester_phone,payer_phone,group_id,amount,comment,status FROM phone_cash_requests WHERE requester_cid=? AND client_nonce=?',{requesterCid,nonce})
        if not actorsCurrent() then return Phone.publicError('A character or SIM changed.') end
        if existing then
            if existing.requester_phone~=requesterPhone or existing.payer_phone~=payerPhone or existing.group_id~=group or tonumber(existing.amount)~=amount or existing.comment~=Phone.trim(comment) then return Phone.publicError('Request reference does not match.') end
            return {Success=true,RequestId=tonumber(existing.id),Status=existing.status,Replayed=true}
        end
        if group and not groupMembersCurrent(group,requesterPhone,payerPhone) then return Phone.publicError('Choose a member of this group.') end
        if not actorsCurrent() then return Phone.publicError('A character or SIM changed before the request was saved.') end
        local now=os.time()*1000
        local id=PhoneDB.insert("INSERT INTO phone_cash_requests(requester_cid,requester_phone,payer_cid,payer_phone,group_id,amount,comment,client_nonce,status,created_at,updated_at) VALUES(?,?,?, ?,NULLIF(?,''),?,?,?,?,?,?)",{requesterCid,requesterPhone,payerCid,payerPhone,group or '',amount,Phone.trim(comment),nonce,'pending',now,now})
        if not id or tonumber(id)<=0 then return Phone.publicError('The request was not saved. Retry with the same request reference.') end
        if not actorsCurrent() then return Phone.publicError('The request was saved, but a character or SIM changed. Reopen the same conversation to retry its receipt.') end
        return {Success=true,RequestId=tonumber(id),Status='pending'}
    end))
end)

Peak.Functions.CreateCallback('peak-phone:Server:Wenmo:PayRequest',function(src,cb,data)
    data=type(data)=='table' and data or {}
    local p,payerPhone,payerCid=actor(src);local requestId=Phone.number(data.RequestId,2147483647);local operation=validOperation(data.OperationId)
    if not p or not payerPhone or not requestId or not operation or not Phone.rate(src,'cash-pay',2,3000) then return cb(Phone.publicError('Payment request is unavailable.')) end
    local initial=PhoneDB.one('SELECT * FROM phone_cash_requests WHERE id=?',{requestId})
    local initialPhone=Phone.activeNumber(src)
    if initialPhone~=payerPhone or not Phone.sameCharacter(src,payerCid) then return cb(Phone.publicError('Your character or SIM changed. Reopen the request.')) end
    if not initial or initial.payer_phone~=payerPhone or initial.payer_cid~=payerCid then return cb(Phone.publicError('This request is not addressed to your active character.')) end
    local requestSource=Peak.Functions.GetPlayerByCitizenId(initial.requester_cid)
    if not requestSource then return cb(Phone.publicError('The requester must be online with the original SIM.')) end
    local initialRequesterPhone=Phone.activeNumber(requestSource.PlayerData.source)
    if initialRequesterPhone~=initial.requester_phone or not Phone.sameCharacter(requestSource.PlayerData.source,initial.requester_cid) then return cb(Phone.publicError('The requester must be online with the original SIM.')) end
        if initial.group_id and not groupMembersCurrent(initial.group_id,payerPhone,initial.requester_phone) then return cb(Phone.publicError('The group membership changed.')) end
    cb(Phone.withLocks({'cash-request:'..requestId,'profile:'..payerCid,'profile:'..initial.requester_cid,'operation:'..operation},function()
        local request=PhoneDB.one('SELECT * FROM phone_cash_requests WHERE id=?',{requestId})
        if not request then return Phone.publicError('This request no longer matches your active character and SIM.') end
        local currentPayerPhone=Phone.activeNumber(src)
        if request.payer_phone~=currentPayerPhone or request.payer_phone~=payerPhone or request.payer_cid~=payerCid or not Phone.sameCharacter(src,payerCid) then return Phone.publicError('This request no longer matches your active character and SIM.') end
        if request.status=='paid' then
            if request.operation_id~=operation then return Phone.publicError('This request has already been paid. Refresh the conversation.') end
            return {Success=true,Status='paid',OperationId=request.operation_id,Replayed=true}
        end
        if request.status=='review' then return Phone.publicError('This payment is under review. Do not try again.') end
        if request.status~='pending' then return Phone.publicError('This request is no longer payable.') end
        if request.group_id and not groupMembersCurrent(request.group_id,payerPhone,request.requester_phone) then return Phone.publicError('The group membership changed.') end
        local payee=Peak.Functions.GetPlayerByCitizenId(request.requester_cid)
        if not payee or Phone.activeNumber(payee.PlayerData.source)~=request.requester_phone or not Phone.sameCharacter(payee.PlayerData.source,request.requester_cid) then return Phone.publicError('The requester must stay online with the original SIM.') end
        local payeeSource=payee.PlayerData.source
        local function actorsCurrent()
            local payerNow=Phone.activeNumber(src);local requesterNow=Phone.activeNumber(payeeSource)
            return payerNow==payerPhone and requesterNow==request.requester_phone
                and Phone.sameCharacter(src,payerCid) and Phone.sameCharacter(payeeSource,request.requester_cid)
        end
        local function participantsCurrent() return groupMembersCurrent(request.group_id,payerPhone,request.requester_phone) and actorsCurrent() end
        if request.operation_id and request.operation_id~=operation then
            local old=PhoneDB.one('SELECT status FROM peak_phone_ledger WHERE operation_id=?',{request.operation_id})
            if old and (old.status=='rejected' or old.status=='refunded') then
                local cleared=PhoneDB.update('UPDATE phone_cash_requests SET operation_id=NULL,updated_at=? WHERE id=? AND status=\'pending\' AND operation_id=?',{os.time()*1000,requestId,request.operation_id})
                if cleared==nil or cleared==false then return Phone.publicError('The prior attempt could not be cleared. Do not retry.') end
                if not participantsCurrent() then return Phone.publicError('A character, SIM or group membership changed while the prior attempt was cleared.') end
                request.operation_id=nil
            else
                return Phone.publicError('This request already has payment reference '..tostring(request.operation_id)..'. Review it before trying again.')
            end
        end
        if not participantsCurrent() then return Phone.publicError('The payer, requester or group membership changed before payment.') end
        local ready,previous=W.begin(operation,payerCid,request.requester_cid,tonumber(request.amount),request.comment)
        if not ready then
            if previous.Success or previous.Status=='review' or previous.Status=='prepared' or previous.Status=='debit_pending' or previous.Status=='debited' or previous.Status=='credit_pending' or previous.Status=='refund_pending' then
                PhoneDB.update("UPDATE phone_cash_requests SET status='review',operation_id=?,updated_at=? WHERE id=? AND status='pending'",{operation,os.time()*1000,requestId})
                if previous.Success then return Phone.publicError('This operation reference already belongs to a completed transfer.') end
            end
            return previous
        end
        if not participantsCurrent() then W.mark(operation,'rejected');return Phone.publicError('A character, SIM or group membership changed before payment.') end
        local reserved=PhoneDB.update('UPDATE phone_cash_requests SET operation_id=?,updated_at=? WHERE id=? AND status=\'pending\' AND operation_id IS NULL',{operation,os.time()*1000,requestId})
        if reserved==nil or reserved==false or (type(reserved)=='number' and reserved<1) then
            W.mark(operation,'rejected')
            return Phone.publicError('The request changed before payment. No money was moved.')
        end
        if not actorsCurrent() then
            PhoneDB.update("UPDATE phone_cash_requests SET status='review',operation_id=?,updated_at=? WHERE id=? AND status='pending'",{operation,os.time()*1000,requestId})
            W.mark(operation,'rejected')
            return Phone.publicError('A character or SIM changed before payment. Review the request before retrying.')
        end
        if not groupMembersCurrent(request.group_id,payerPhone,request.requester_phone) then
            PhoneDB.update('UPDATE phone_cash_requests SET operation_id=NULL,updated_at=? WHERE id=? AND status=\'pending\' AND operation_id=?',{os.time()*1000,requestId,operation})
            W.mark(operation,'rejected')
            return Phone.publicError('The group membership changed before payment. No money was moved.')
        end
        local debited,result=W.debit(operation,src,payerCid,tonumber(request.amount),payerPhone)
        if not debited then
            if result.Status=='review' then PhoneDB.update("UPDATE phone_cash_requests SET status='review',operation_id=?,updated_at=? WHERE id=?",{operation,os.time()*1000,requestId})
            elseif result.Status=='rejected' then PhoneDB.update('UPDATE phone_cash_requests SET operation_id=NULL,updated_at=? WHERE id=? AND status=\'pending\' AND operation_id=?',{os.time()*1000,requestId,operation}) end
            return result
        end
        if not participantsCurrent() then
            if not actorsCurrent() then
                PhoneDB.update("UPDATE phone_cash_requests SET status='review',operation_id=?,updated_at=? WHERE id=?",{operation,os.time()*1000,requestId})
                return W.uncertain(operation)
            end
            local refunded=W.refund(operation,src,payerCid,tonumber(request.amount),payerPhone)
            if refunded.Status=='refunded' then PhoneDB.update('UPDATE phone_cash_requests SET operation_id=NULL,updated_at=? WHERE id=? AND status=\'pending\' AND operation_id=?',{os.time()*1000,requestId,operation})
            else PhoneDB.update("UPDATE phone_cash_requests SET status='review',operation_id=?,updated_at=? WHERE id=?",{operation,os.time()*1000,requestId}) end
            return refunded
        end
        if Phone.activeNumber(src)~=payerPhone or not Phone.sameCharacter(src,payerCid) then
            PhoneDB.update("UPDATE phone_cash_requests SET status='review',operation_id=?,updated_at=? WHERE id=?",{operation,os.time()*1000,requestId})
            return W.uncertain(operation)
        end
        if not W.mark(operation,'credit_pending') then
            PhoneDB.update("UPDATE phone_cash_requests SET status='review',updated_at=? WHERE id=?",{os.time()*1000,requestId})
            return W.uncertain(operation)
        end
        if not participantsCurrent() then
            local refunded=W.refund(operation,src,payerCid,tonumber(request.amount),payerPhone)
            if refunded.Status=='refunded' then PhoneDB.update('UPDATE phone_cash_requests SET operation_id=NULL,updated_at=? WHERE id=? AND status=\'pending\' AND operation_id=?',{os.time()*1000,requestId,operation})
            else PhoneDB.update("UPDATE phone_cash_requests SET status='review',updated_at=? WHERE id=?",{os.time()*1000,requestId}) end
            return refunded
        end
        local ok,done,result,detail=W.exportCall(Phone.addMoney,payee.PlayerData.source,PhoneConfig.Money.Account,tonumber(request.amount),'peak-duo:'..operation)
        if not ok then
            PhoneDB.update("UPDATE phone_cash_requests SET status='review',operation_id=?,updated_at=? WHERE id=?",{operation,os.time()*1000,requestId});W.mark(operation,'review')
            return W.uncertain(operation)
        end
        if not done then
            if not W.confirmedNoChange(ok,result,detail) then
                PhoneDB.update("UPDATE phone_cash_requests SET status='review',operation_id=?,updated_at=? WHERE id=?",{operation,os.time()*1000,requestId});W.mark(operation,'review')
                return W.uncertain(operation)
            end
            local refunded=W.refund(operation,src,payerCid,tonumber(request.amount),payerPhone)
            if refunded.Status=='refunded' then PhoneDB.update('UPDATE phone_cash_requests SET operation_id=NULL,updated_at=? WHERE id=? AND status=\'pending\' AND operation_id=?',{os.time()*1000,requestId,operation})
            else PhoneDB.update("UPDATE phone_cash_requests SET status='review',updated_at=? WHERE id=?",{os.time()*1000,requestId}) end
            return refunded
        end
        if not participantsCurrent() then
            PhoneDB.update("UPDATE phone_cash_requests SET status='review',operation_id=?,updated_at=? WHERE id=?",{operation,os.time()*1000,requestId})
            W.mark(operation,'review');return W.uncertain(operation)
        end
        local now=os.time()*1000
        local commitGuard,commitParams=groupCommitGuard(request.group_id,payerPhone,request.requester_phone)
        local completionValues={now,operation,requestId,operation}
        for _,value in ipairs(commitParams) do completionValues[#completionValues+1]=value end
        local paidValues={operation,now,requestId,operation}
        for _,value in ipairs(commitParams) do paidValues[#paidValues+1]=value end
        local historyValues={payerCid,request.requester_cid,tonumber(request.amount),request.comment,now,requestId,operation}
        for _,value in ipairs(commitParams) do historyValues[#historyValues+1]=value end
        local eventValues={operation,payerCid,request.requester_cid,payerPhone,request.requester_phone,request.group_id or '',tonumber(request.amount),now,requestId,operation}
        for _,value in ipairs(commitParams) do eventValues[#eventValues+1]=value end
        local saved=PhoneDB.transaction({
            {query="UPDATE peak_phone_ledger SET status='complete',updated_at=? WHERE operation_id=? AND status='credit_pending' AND EXISTS (SELECT 1 FROM phone_cash_requests WHERE id=? AND status='pending' AND operation_id=?)"..commitGuard,values=completionValues},
            {query="UPDATE phone_cash_requests SET status='paid',operation_id=?,updated_at=? WHERE id=? AND status='pending' AND operation_id=? AND EXISTS (SELECT 1 FROM peak_phone_ledger WHERE operation_id=? AND status='complete')"..commitGuard,values=(function() local values={operation,now,requestId,operation,operation};for _,value in ipairs(commitParams) do values[#values+1]=value end;return values end)()},
            {query="INSERT INTO phone_wenmo(from_citizenid,to_citizenid,amount,comment,timestamp) SELECT ?,?,?,?,? FROM phone_cash_requests r JOIN peak_phone_ledger l ON l.operation_id=r.operation_id WHERE r.id=? AND r.status='paid' AND r.operation_id=? AND l.status='complete'"..commitGuard,values=historyValues},
            {query="INSERT INTO phone_cash_events(operation_id,from_cid,to_cid,from_phone,to_phone,group_id,amount,created_at) SELECT ?,?,?,?,?,NULLIF(?,''),?,? FROM phone_cash_requests r JOIN peak_phone_ledger l ON l.operation_id=r.operation_id WHERE r.id=? AND r.status='paid' AND r.operation_id=? AND l.status='complete'"..commitGuard,values=eventValues}
        })
        if not saved then
            PhoneDB.update("UPDATE phone_cash_requests SET status='review',operation_id=?,updated_at=? WHERE id=?",{operation,now,requestId})
            W.mark(operation,'review');return W.uncertain(operation)
        end
        local finalRequest=PhoneDB.one('SELECT status,operation_id FROM phone_cash_requests WHERE id=?',{requestId})
        local finalLedger=PhoneDB.one('SELECT status FROM peak_phone_ledger WHERE operation_id=?',{operation})
        if not finalRequest or finalRequest.status~='paid' or finalRequest.operation_id~=operation or not finalLedger or finalLedger.status~='complete' then
            PhoneDB.update("UPDATE phone_cash_requests SET status='review',operation_id=?,updated_at=? WHERE id=?",{operation,now,requestId})
            W.mark(operation,'review');return W.uncertain(operation)
        end
        if Phone.activeNumber(payee.PlayerData.source)==request.requester_phone and Phone.sameCharacter(payee.PlayerData.source,request.requester_cid) then Phone.notify(payee.PlayerData.source,'iFruit Cash: $'..Phone.commas(request.amount)..' received.','success');Phone.refresh(payee.PlayerData.source) end
        if Phone.activeNumber(src)==payerPhone and Phone.sameCharacter(src,payerCid) then Phone.refresh(src) end
        return {Success=true,Status='paid',OperationId=operation}
    end))
end)

Peak.Functions.CreateCallback('peak-phone:Server:Wenmo:DeclineRequest',function(src,cb,data)
    data=type(data)=='table' and data or {}
    local p,number,cid=actor(src);local id=Phone.number(data.RequestId,2147483647)
    if not p or not number or not id then return cb(Phone.publicError('Request unavailable.')) end
    cb(Phone.withLocks({'cash-request:'..id},function()
        local row=PhoneDB.one('SELECT payer_phone,payer_cid,status FROM phone_cash_requests WHERE id=?',{id})
        if not row or Phone.activeNumber(src)~=number or not Phone.sameCharacter(src,cid) or row.payer_phone~=number or row.payer_cid~=cid then return Phone.publicError('This request is not addressed to your active character and SIM.') end
        if row.status=='declined' then return {Success=true,Status='declined',Replayed=true} end
        if row.status~='pending' then return Phone.publicError('Only a pending request can be declined.') end
        local changed=PhoneDB.update("UPDATE phone_cash_requests SET status='declined',updated_at=? WHERE id=? AND status='pending'",{os.time()*1000,id})
        if changed==nil or changed==false or (type(changed)=='number' and changed<1) then return Phone.publicError('The request could not be updated.') end
        return {Success=true,Status='declined'}
    end))
end)

-- The message rows carry opaque references only; server-side rows hold every amount and participant.
function Phone.validateCashMessage(src,targetPhone,targetGroup,attachments)
    local own=Phone.activeNumber(src);local player=Phone.getPlayer(src);if not own or not player then return false end
    local normalizedGroup=groupId(targetGroup)
    if normalizedGroup==false or normalizedGroup~=targetGroup then return false end
    for _,attachment in ipairs(attachments or {}) do
        if attachment.type=='cash-request' then
            local row=PhoneDB.one('SELECT requester_cid,requester_phone,payer_phone,group_id FROM phone_cash_requests WHERE id=?',{attachment.requestId})
            if not row or row.requester_cid~=player.PlayerData.citizenid or row.requester_phone~=own then return false end
            if targetGroup then
                if row.group_id~=targetGroup or not isMember(targetGroup,own) or not isMember(targetGroup,row.payer_phone) then return false end
            elseif row.group_id~=nil or row.payer_phone~=targetPhone then return false end
        elseif attachment.type=='cash-transfer' then
            local row=PhoneDB.one('SELECT from_cid,to_cid,from_phone,to_phone,group_id FROM phone_cash_events WHERE operation_id=?',{attachment.operationId})
            if not row or row.from_cid~=player.PlayerData.citizenid or row.from_phone~=own then return false end
            if targetPhone then
                local sim=PhoneDB.one('SELECT owner_citizenid FROM sim_cards WHERE phone_number=?',{targetPhone})
                if not sim or sim.owner_citizenid~=row.to_cid then return false end
            end
            if targetGroup then
                if row.group_id~=targetGroup or not isMember(targetGroup,own) or not isMember(targetGroup,row.to_phone) then return false end
            elseif row.group_id~=nil or row.to_phone~=targetPhone then return false end
        end
    end
    return true
end

function Phone.decorateCashAttachments(viewerPhone,targetGroup,attachments)
    local out={}
    for _,attachment in ipairs(attachments or {}) do
        if attachment.type=='cash-request' then
            local row=PhoneDB.one('SELECT id,requester_phone,payer_phone,group_id,amount,comment,status FROM phone_cash_requests WHERE id=?',{attachment.requestId})
            local visible=row and (targetGroup and row.group_id==targetGroup or not targetGroup and (row.requester_phone==viewerPhone or row.payer_phone==viewerPhone))
            if visible then
                out[#out+1]={type='cash-request',requestId=tonumber(row.id),amount=tonumber(row.amount),comment=row.comment,status=row.status,Incoming=row.payer_phone==viewerPhone}
            end
        elseif attachment.type=='cash-transfer' then
            local row=PhoneDB.one('SELECT operation_id,from_phone,to_phone,group_id,amount FROM phone_cash_events WHERE operation_id=?',{attachment.operationId})
            local visible=row and (targetGroup and row.group_id==targetGroup or not targetGroup and (row.from_phone==viewerPhone or row.to_phone==viewerPhone))
            if visible then out[#out+1]={type='cash-transfer',operationId=row.operation_id,amount=tonumber(row.amount),Incoming=row.to_phone==viewerPhone} end
        else out[#out+1]=attachment end
    end
    return out
end
