-- Durable journal around non-transactional framework wallet exports. No silent retries or guessed refunds.
Phone.Wallet={}
local W=Phone.Wallet
local terminal={complete=true,refunded=true,rejected=true}
function W.reference(data)
    local id=type(data)=='table' and data.OperationId
    if type(id)~='string' or #id<16 or #id>64 or not id:match('^[%w%-]+$') then return Phone.token() end
    return id
end
function W.pending(cid)
    return PhoneDB.one("SELECT operation_id FROM peak_phone_ledger WHERE (from_citizenid=? OR to_citizenid=?) AND status NOT IN ('complete','refunded','rejected') LIMIT 1",{cid,cid})
end
function W.begin(id,from,to,amount,comment)
    local previous=PhoneDB.one('SELECT * FROM peak_phone_ledger WHERE operation_id=?',{id})
    if previous then
        if previous.from_citizenid~=from or previous.to_citizenid~=to or tonumber(previous.amount)~=amount or previous.comment~=comment then return false,Phone.publicError('Transaction reference does not match.') end
        return false,{Success=previous.status=='complete',Msg=previous.status=='complete' and 'Already completed.' or 'This transaction must not be retried. Reference: '..id,OperationId=id,Status=previous.status}
    end
    if W.pending(from) or (to~=from and W.pending(to)) then return false,Phone.publicError('A wallet transaction needs administrator review. Run phone_doctor; do not retry it.') end
    local ok,inserted=pcall(PhoneDB.update,'INSERT INTO peak_phone_ledger(operation_id,from_citizenid,to_citizenid,amount,comment,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
        {id,from,to,amount,comment,'prepared',os.time()*1000,os.time()*1000})
    if not ok or inserted==nil or inserted==false or (type(inserted)=='number' and inserted<1) then
        return false,Phone.publicError('Wallet transaction could not be recorded. No money was moved.')
    end
    return true
end
function W.mark(id,status)
    local ok,updated=pcall(PhoneDB.update,'UPDATE peak_phone_ledger SET status=?,updated_at=? WHERE operation_id=?',{status,os.time()*1000,id})
    return ok and updated~=nil and updated~=false and (type(updated)~='number' or updated>0)
end
function W.uncertain(id)
    return {Success=false,Msg='Transaction requires administrator review. Do not send it again. Reference: '..id,OperationId=id,Status='review'}
end
function W.rejected(id,message)
    return {Success=false,Msg=message,Error=message,OperationId=id,Status='rejected'}
end
function W.exportCall(fn,...)
    local ok,result,detail=pcall(fn,...)
    return ok,result==true,result,detail
end
function W.confirmedNoChange(ok,result,detail)
    if not ok then return false end
    if detail=='invalid' or detail=='insufficient' then return true end
    -- The installed peak-bridge QBCore adapter returns literal false only for
    -- a pre-mutation rejection. Qbox/ESX/peak-core adapters may collapse an
    -- exception or post-mutation failure into false, so those stay ambiguous.
    return Phone.framework()=='qbcore' and result==false and detail==false
end
local function actorCurrent(src,cid,phone) return (not phone or Phone.activeNumber(src)==phone) and Phone.sameCharacter(src,cid) end
function W.refund(id,src,cid,amount,phone)
    if not W.mark(id,'refund_pending') then return W.uncertain(id) end
    if not actorCurrent(src,cid,phone) then return W.uncertain(id) end
    local ok,done=W.exportCall(Phone.addMoney,src,PhoneConfig.Money.Account,amount,'peak-duo-refund:'..id)
    if not ok or not done then return W.uncertain(id) end
    if not actorCurrent(src,cid,phone) then return W.uncertain(id) end
    if not W.mark(id,'refunded') then return W.uncertain(id) end
    return {Success=false,Msg='The transfer could not complete. Your money was returned.',OperationId=id,Status='refunded'}
end
function W.debit(id,src,cid,amount,phone)
    if not actorCurrent(src,cid,phone) then if not W.mark(id,'rejected') then return false,W.uncertain(id) end;return false,W.rejected(id,'Character or SIM changed before the wallet debit.') end
    if not W.mark(id,'debit_pending') then return false,W.uncertain(id) end
    if not actorCurrent(src,cid,phone) then if not W.mark(id,'rejected') then return false,W.uncertain(id) end;return false,W.rejected(id,'Character or SIM changed before the wallet debit.') end
    local ok,done,result,detail=W.exportCall(Phone.removeMoney,src,PhoneConfig.Money.Account,amount,'peak-duo:'..id)
    if not ok then W.mark(id,'review');return false,W.uncertain(id) end
    if not actorCurrent(src,cid,phone) then return false,W.uncertain(id) end
    if not done then
        if not W.confirmedNoChange(ok,result,detail) then W.mark(id,'review');return false,W.uncertain(id) end
        if not W.mark(id,'rejected') then return false,W.uncertain(id) end
        local message=detail=='insufficient' and 'Insufficient balance.' or 'The wallet declined the transaction.'
        return false,W.rejected(id,message)
    end
    if not W.mark(id,'debited') then return false,W.uncertain(id) end
    return true
end
