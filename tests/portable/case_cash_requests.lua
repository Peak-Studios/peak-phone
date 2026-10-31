base('qbcore');Citizen.CreateThread=CreateThread;Citizen.Wait=Wait;addPlayer(1,'requester-cid');addPlayer(2,'payer-cid');local originalRequester,originalPayer=PLAYERS[1],PLAYERS[2]
PLAYERS[1].PlayerData.charinfo.phone='5550000001';PLAYERS[2].PlayerData.charinfo.phone='5550000002'
loadrel('server/sv_simcard.lua');loadrel('bridge/wallet.lua');loadrel('server/sv_wenmo.lua')
eq(Phone.messageBody('data:audio/webm;base64,GkXfo59ChoE='),true,'server accepts a real EBML marker with following WebM bytes')
eq(Phone.messageBody('data:audio/webm;base64,AAAAAA=='),false,'server rejects a forged non-WebM prefix')
local requests,ledger,cashEvents={}, {}, {};local nextRequest=0;local flipCreateRead,flipLedgerInsert,flipAfterTransaction=nil,nil,nil;local flipDuringActive,flipActiveAfterLedgerInsert,flipActiveAfterDebitPending=nil,nil,nil;local flipGroupAfterLedgerInsert,flipGroupOnDebit,flipGroupOnCredit,flipGroupBeforeTransaction=nil,nil,nil,nil;local notices,refreshes={},{}
local group='GRP12345678';local members={[group]={['5550000001']=true,['5550000002']=true}}
local savedRemove,savedAdd=Phone.removeMoney,Phone.addMoney
Phone.notify=function(src,message)notices[#notices+1]={src=src,message=message}end
Phone.refresh=function(src)refreshes[#refreshes+1]=src end
local function flipActor(src,cid,phone)
 if cid then PLAYERS[src]={PlayerData={source=src,citizenid=cid,charinfo={firstname='Replacement',lastname='Actor',phone=phone},metadata={},items={},job={name='unemployed',grade=0}}};Phone.Server.Profiles[cid]={citizenid=cid,phone_number=phone,charinfo={firstname='Replacement',lastname='Actor'},metadata={},crypto={}};return end
 local player=PLAYERS[src];Phone.Server.Profiles[player.PlayerData.citizenid].phone_number=phone
end
local originalActive=Phone.activeNumber
Phone.activeNumber=function(src)
 local number=originalActive(src)
 if flipDuringActive and flipDuringActive.source==src then local flip=flipDuringActive;flipDuringActive=nil;flipActor(flip.source,flip.cid,flip.phone) end
 return number
end
local function removeGroupMember(phone) members[group][phone]=nil end
PhoneDB.one=function(sql,p)
 if sql:find('FROM phone_cash_requests WHERE requester_cid=? AND client_nonce=?',1,true) then
  local found;for _,row in pairs(requests)do if row.requester_cid==p[1] and row.client_nonce==p[2] then found=row;break end end
  if flipCreateRead then local flip=flipCreateRead;flipCreateRead=nil;flipActor(1,nil,flip) end
  return found and {id=found.id,requester_phone=found.requester_phone,payer_phone=found.payer_phone,group_id=found.group_id,amount=found.amount,comment=found.comment,status=found.status} or nil
 elseif sql:find('FROM phone_cash_requests WHERE id=?',1,true) then return copy(requests[tonumber(p[1])])
 elseif sql:find('FROM peak_phone_ledger WHERE operation_id=?',1,true) then return copy(ledger[p[1]])
 elseif sql:find('status NOT IN',1,true) then
  for _,row in pairs(ledger)do if (row.from_citizenid==p[1] or row.to_citizenid==p[2]) and row.status~='complete' and row.status~='refunded' and row.status~='rejected' then return {operation_id=row.operation_id} end end
 elseif sql:find('SELECT requester_cid,requester_phone,payer_phone,group_id FROM phone_cash_requests',1,true) then
  local row=requests[tonumber(p[1])];return row and {requester_cid=row.requester_cid,requester_phone=row.requester_phone,payer_phone=row.payer_phone,group_id=row.group_id} or nil
 elseif sql:find('SELECT from_cid,to_cid,from_phone,to_phone,group_id FROM phone_cash_events',1,true) then
  local row=cashEvents[p[1]];return row and copy(row) or nil
 elseif sql:find('SELECT owner_citizenid FROM sim_cards WHERE phone_number=?',1,true) then
  for cid,profile in pairs(Phone.Server.Profiles)do if profile.phone_number==p[1] then return {owner_citizenid=cid} end end
 elseif sql:find('SELECT group_id FROM phone_group_members WHERE group_id=? AND phone=?',1,true) then
  return members[p[1]] and members[p[1]][p[2]] and {group_id=p[1]} or nil
 end
 return nil
end
PhoneDB.update=function(sql,p)
 if sql:find('INSERT INTO peak_phone_ledger',1,true) then
  if ledger[p[1]] then return 0 end
  ledger[p[1]]={operation_id=p[1],from_citizenid=p[2],to_citizenid=p[3],amount=p[4],comment=p[5],status=p[6]}
  if flipLedgerInsert then local flip=flipLedgerInsert;flipLedgerInsert=nil;flipActor(flip.source,flip.cid,flip.phone) end
  if flipActiveAfterLedgerInsert then flipDuringActive=flipActiveAfterLedgerInsert;flipActiveAfterLedgerInsert=nil end
  if flipGroupAfterLedgerInsert then local phone=flipGroupAfterLedgerInsert;flipGroupAfterLedgerInsert=nil;removeGroupMember(phone) end
  return 1
 elseif sql:find('UPDATE peak_phone_ledger SET status=?',1,true) then
  local row=ledger[p[3]];if not row then return 0 end;row.status=p[1]
  if p[1]=='debit_pending' and flipActiveAfterDebitPending then flipDuringActive=flipActiveAfterDebitPending;flipActiveAfterDebitPending=nil end
  return 1
 elseif sql:find('UPDATE phone_cash_requests',1,true) then
  local requestId=tonumber(p[#p]);if sql:find('operation_id=NULL',1,true) then requestId=tonumber(p[2]) end
  local row=requests[requestId];if not row then return 0 end
  if sql:find("status='paid'",1,true) then row.status='paid';row.operation_id=p[1]
  elseif sql:find("status='declined'",1,true) then row.status='declined'
  elseif sql:find("status='review'",1,true) then row.status='review';if p[1] and type(p[1])=='string' then row.operation_id=p[1] end
  elseif sql:find('operation_id=NULL',1,true) then row.operation_id=nil
  elseif sql:find('SET operation_id=?,updated_at=? WHERE id=? AND status=',1,true) then row.operation_id=p[1] end
  return 1
 end
 error('Unexpected request update: '..sql)
end
PhoneDB.insert=function(sql,p)
 if sql:find('INSERT INTO phone_cash_requests',1,true) then
  nextRequest=nextRequest+1;local id=nextRequest
  requests[id]={id=id,requester_cid=p[1],requester_phone=p[2],payer_cid=p[3],payer_phone=p[4],group_id=p[5]~='' and p[5] or nil,amount=p[6],comment=p[7],client_nonce=p[8],status=p[9],created_at=p[10],updated_at=p[11]}
  return id
 end
 error('Unexpected request insert: '..sql)
end
PhoneDB.transaction=function(rows)
 if flipGroupBeforeTransaction then local phone=flipGroupBeforeTransaction;flipGroupBeforeTransaction=nil;removeGroupMember(phone) end
 local function groupStillBound(q,p)
  if not q:find('phone_group_members',1,true) then return true end
  local g,a,b=p[#p-3],p[#p-2],p[#p]
  return members[g] and members[g][a] and members[g][b] or false
 end
 for _,statement in ipairs(rows)do
  local p,q=statement.values,statement.query
  if q:find('INSERT INTO phone_wenmo',1,true) then
   -- This fixture does not exercise the WENMO screen history beyond proving one committed payment.
  elseif q:find("UPDATE peak_phone_ledger SET status='complete'",1,true) then
   if groupStillBound(q,p) and ledger[p[2]] then ledger[p[2]].status='complete' end
  elseif q:find("UPDATE phone_cash_requests SET status='paid'",1,true) then
   local row=requests[tonumber(p[3])];local journal=ledger[p[5]]
   if groupStillBound(q,p) and row and journal and journal.status=='complete' then row.status='paid';row.operation_id=p[1] end
  elseif q:find('INSERT INTO phone_cash_events',1,true) then
   local fromRequest=q:find('FROM phone_cash_requests r',1,true)~=nil;local op=fromRequest and p[1] or p[1];local journal=ledger[fromRequest and p[10] or p[9]]
   local request=fromRequest and requests[tonumber(p[9])] or nil
   if groupStillBound(q,p) and journal and journal.status=='complete' and (not fromRequest or (request and request.status=='paid')) then
    cashEvents[op]={operation_id=op,from_cid=p[2],to_cid=p[3],from_phone=p[4],to_phone=p[5],group_id=p[6]~='' and p[6] or nil,amount=p[7]}
   end
  end
 end
 if flipAfterTransaction then local flip=flipAfterTransaction;flipAfterTransaction=nil;flipActor(flip.source,flip.cid,flip.phone) end
 return true
end
local function call(route,src,payload) CLOCK=CLOCK+4000;return rpc('peak-phone:Server:Wenmo:'..route,src,payload) end
local function create(nonce,amount,phone,groupId)
 return call('CreateRequest',1,{Phone=phone or '5550000002',Amount=amount or 40,Comment='lunch',ClientNonce=nonce,GroupId=groupId})
end
local function pay(id,operation) return call('PayRequest',2,{RequestId=id,OperationId=operation}) end
local function decline(id) return call('DeclineRequest',2,{RequestId=id}) end

local created=create('create-request-0001');eq(created.Success,true);local firstId=created.RequestId;eq(requests[firstId].status,'pending')
local replay=create('create-request-0001');eq(replay.Success,true);eq(replay.Replayed,true);eq(replay.RequestId,firstId);eq(nextRequest,1,'duplicate request nonce inserts one request')
local tampered=create('create-request-0001',41);eq(tampered.Success,false,'same nonce with a different amount is rejected');eq(nextRequest,1)

local beforeWrites=#MONEY_WRITES;local paid=pay(firstId,'pay-request-op-0001');eq(paid.Success,true);eq(requests[firstId].status,'paid');eq(MONEY[2].bank,960);eq(MONEY[1].bank,1040);eq(#MONEY_WRITES,beforeWrites+2,'one payer debit and one recipient credit')
local writesAfterPay=#MONEY_WRITES;local paidReplay=pay(firstId,'pay-request-op-0001');eq(paidReplay.Success,true);eq(paidReplay.Replayed,true);eq(#MONEY_WRITES,writesAfterPay,'double pay replay has no second debit or credit')
eq(decline(firstId).Success,false,'paid request cannot be declined')
check(Phone.validateCashMessage(1,'5550000002',nil,{{type='cash-request',requestId=firstId}}),'request receipt is bound to its requesting character')
eq(Phone.validateCashMessage(2,'5550000001',nil,{{type='cash-request',requestId=firstId}}),false,'payer cannot forge the request receipt')
eq(Phone.validateCashMessage(2,'5550000001',nil,{{type='cash-transfer',operationId='unknown-operation-0001'}}),false,'unknown cash transfer reference is rejected')
check(Phone.validateCashMessage(2,'5550000001',nil,{{type='cash-transfer',operationId='pay-request-op-0001'}}),'committed payment receipt is validated against both characters and SIMs')

local declineFirst=create('create-request-0002');local declined=decline(declineFirst.RequestId);eq(declined.Success,true);eq(requests[declineFirst.RequestId].status,'declined');eq(pay(declineFirst.RequestId,'pay-request-op-0002').Success,false,'declined request cannot be paid')

local staleCreateBefore=nextRequest;flipCreateRead='5550000099';local staleCreate=create('create-request-stale-01');eq(staleCreate.Success,false,'request creation rechecks requester SIM after its replay lookup');eq(nextRequest,staleCreateBefore,'stale requester lookup cannot commit');flipActor(1,nil,'5550000001')

local stalePayRequest=create('create-request-0005');flipLedgerInsert={source=2,phone='5550000099'};beforeWrites=#MONEY_WRITES
local stalePay=pay(stalePayRequest.RequestId,'pay-request-stale-01');eq(stalePay.Success,false,'payment rechecks payer SIM after the journal insert yield');eq(#MONEY_WRITES,beforeWrites,'stale payer SIM is rejected before the wallet debit');eq(ledger['pay-request-stale-01'].status,'rejected');flipActor(2,nil,'5550000002')

local staleCidRequest=create('create-request-0006');flipLedgerInsert={source=2,cid='replacement-payer',phone='5550000098'};beforeWrites=#MONEY_WRITES
local staleCidPay=pay(staleCidRequest.RequestId,'pay-request-stale-cid-01');eq(staleCidPay.Success,false,'payment rechecks payer character after the journal insert yield');eq(#MONEY_WRITES,beforeWrites,'stale payer character is rejected before the wallet debit');eq(ledger['pay-request-stale-cid-01'].status,'rejected');PLAYERS[2]=originalPayer

beforeWrites=#MONEY_WRITES;flipActiveAfterLedgerInsert={source=1,cid='replacement-active-sender',phone='5550000097'}
local activeChangedAtRead=call('SendMoney',1,{Phone='5550000002',Amount=13,Comment='active number yield',OperationId='cash-active-number-yield-0001'})
eq(activeChangedAtRead.Success,false,'SendMoney rechecks the character after the active-SIM read yields');eq(ledger['cash-active-number-yield-0001'].status,'rejected');eq(#MONEY_WRITES,beforeWrites,'active-SIM identity switch after journal insert cannot debit')
PLAYERS[1]=originalRequester

beforeWrites=#MONEY_WRITES;flipActiveAfterDebitPending={source=1,cid='replacement-wallet-sender',phone='5550000096'}
local activeChangedBeforeDebit=call('SendMoney',1,{Phone='5550000002',Amount=13,Comment='wallet actor guard',OperationId='cash-wallet-actor-yield-0001'})
eq(activeChangedBeforeDebit.Success,false,'wallet debit rechecks the character after its active-SIM read yields');eq(ledger['cash-wallet-actor-yield-0001'].status,'rejected');eq(#MONEY_WRITES,beforeWrites,'wallet actor identity switch prevents the money export')
PLAYERS[1]=originalRequester

local staleNoticeRequest=create('create-request-0007');local noticesBefore=#notices;local refreshesBefore=#refreshes;flipAfterTransaction={source=1,cid='replacement-requester',phone='5550000097'}
local paidDuringSwitch=pay(staleNoticeRequest.RequestId,'pay-request-notify-race-01');eq(paidDuringSwitch.Success,true,'committed payment remains successful after the final transaction');eq(#notices,noticesBefore,'recycled requester source receives no payment notification');for i=refreshesBefore+1,#refreshes do eq(refreshes[i],2,'only the still-current payer is refreshed')end;PLAYERS[1]=originalRequester

local refundRequest=create('create-request-0003');local added=Phone.addMoney;Phone.addMoney=function(src,...)
 if src==1 then return false,false end;return added(src,...)
end
beforeWrites=#MONEY_WRITES;local failedCredit=pay(refundRequest.RequestId,'pay-request-op-0003');eq(failedCredit.Success,false);eq(ledger['pay-request-op-0003'].status,'refunded');eq(requests[refundRequest.RequestId].status,'pending');eq(requests[refundRequest.RequestId].operation_id,nil);eq(MONEY[2].bank,920);eq(MONEY[1].bank,1080);eq(#MONEY_WRITES,beforeWrites+2,'known recipient failure is refunded exactly once')
Phone.addMoney=added

local uncertainRequest=create('create-request-0004');Phone.addMoney=function(src,...)
 if src==1 then error('unknown recipient credit outcome') end;return added(src,...)
end
beforeWrites=#MONEY_WRITES;local ambiguous=pay(uncertainRequest.RequestId,'pay-request-op-0004');eq(ambiguous.Success,false);eq(ambiguous.Status,'review');eq(ledger['pay-request-op-0004'].status,'review');eq(requests[uncertainRequest.RequestId].status,'review');eq(MONEY[2].bank,880);eq(MONEY[1].bank,1080);eq(#MONEY_WRITES,beforeWrites+1,'ambiguous credit is held for review and never refunded blindly')
local ambiguousWrites=#MONEY_WRITES;local ambiguousReplay=pay(uncertainRequest.RequestId,'pay-request-op-0004');eq(ambiguousReplay.Success,false);check(ambiguousReplay.Msg:find('under review',1,true)~=nil,'ambiguous payment retry stays under review');eq(ledger['pay-request-op-0004'].status,'review');eq(#MONEY_WRITES,ambiguousWrites,'retry of an ambiguous payment remains bound to its operation and adds no second debit')
Phone.addMoney=added
ledger['pay-request-op-0004'].status='complete' -- Isolate the next debit fault fixture after asserting the ambiguous request stays review-only.

local savedFramework=Phone.Server.Framework or 'qbcore';Phone.Server.Framework='qbox'
local removed=Phone.removeMoney;Phone.removeMoney=function(src,...)
 local ok,detail=removed(src,...);if src==2 then return false end;return ok,detail
end
local debitBankBefore=MONEY[2].bank;local debitRecipientBefore=MONEY[1].bank;beforeWrites=#MONEY_WRITES
local debitMutatedFalse=call('SendMoney',2,{Phone='5550000001',Amount=17,Comment='ambiguous debit',OperationId='qbox-debit-mutate-false-0001'})
eq(debitMutatedFalse.Success,false);eq(debitMutatedFalse.Status,'review','Qbox debit false after mutation is ambiguous');eq(ledger['qbox-debit-mutate-false-0001'].status,'review')
eq(MONEY[2].bank,debitBankBefore-17,'mutated debit is recorded once');eq(MONEY[1].bank,debitRecipientBefore,'ambiguous debit is not credited');eq(#MONEY_WRITES,beforeWrites+1,'ambiguous debit is never blindly refunded or retried')
local debitRetry=call('SendMoney',2,{Phone='5550000001',Amount=17,Comment='ambiguous debit',OperationId='qbox-debit-mutate-false-0001'});eq(debitRetry.Success,false);eq(#MONEY_WRITES,beforeWrites+1,'same ambiguous debit reference performs no second money write')
Phone.removeMoney=removed
ledger['qbox-debit-mutate-false-0001'].status='complete' -- Fixture operator reconciles this ambiguous test before the next operation.

local mutationCreditRequest=create('qbox-credit-mutate-false-0001',21);local requestorBefore=MONEY[1].bank;local payerBefore=MONEY[2].bank;beforeWrites=#MONEY_WRITES
Phone.addMoney=function(src,...)
 local ok,detail=added(src,...);if src==1 then return false end;return ok,detail
end
local creditMutatedFalse=pay(mutationCreditRequest.RequestId,'qbox-credit-mutate-false-op-0001')
eq(creditMutatedFalse.Success,false);eq(creditMutatedFalse.Status,'review','Qbox credit false after mutation is ambiguous');eq(ledger['qbox-credit-mutate-false-op-0001'].status,'review');eq(requests[mutationCreditRequest.RequestId].status,'review')
eq(MONEY[2].bank,payerBefore-21,'payer debit is retained for reconciliation');eq(MONEY[1].bank,requestorBefore+21,'recipient credit is retained once');eq(#MONEY_WRITES,beforeWrites+2,'ambiguous credit is not blindly refunded')
local creditRetry=pay(mutationCreditRequest.RequestId,'qbox-credit-mutate-false-op-0001');eq(creditRetry.Success,false);eq(#MONEY_WRITES,beforeWrites+2,'same ambiguous payment reference performs no extra money write')
Phone.addMoney=added;Phone.Server.Framework=savedFramework
ledger['qbox-credit-mutate-false-op-0001'].status='complete' -- Fixture operator reconciles the committed credit before later group cases.

local function groupSend(operation,amount)
 return call('SendMoney',1,{Phone='5550000002',Amount=amount or 12,Comment='group lunch',OperationId=operation,MessageContext={FromPhone='5550000001',ToPhone='5550000002',GroupId=group}})
end
local function restoreGroup() members[group]['5550000001']=true;members[group]['5550000002']=true end
local originalRemove=Phone.removeMoney
Phone.removeMoney=function(src,...)
 local result=originalRemove(src,...)
 if flipGroupOnDebit==src then flipGroupOnDebit=nil;removeGroupMember(src==1 and '5550000001' or '5550000002') end
 return result
end
local originalGroupAdd=Phone.addMoney
Phone.addMoney=function(src,...)
 local result=originalGroupAdd(src,...)
 if flipGroupOnCredit==src then flipGroupOnCredit=nil;removeGroupMember(src==1 and '5550000001' or '5550000002') end
 return result
end
local writesBeforeGroup=#MONEY_WRITES;flipGroupAfterLedgerInsert='5550000001'
local removedAtBegin=groupSend('group-send-membership-ledger-0001')
eq(removedAtBegin.Success,false,'SendMoney rechecks group membership after W.begin yields');eq(ledger['group-send-membership-ledger-0001'].status,'rejected');eq(#MONEY_WRITES,writesBeforeGroup,'SendMoney membership removed during journal insert performs no debit or credit');restoreGroup()

writesBeforeGroup=#MONEY_WRITES;local bankBeforeDebit=MONEY[1].bank;flipGroupOnDebit=1
local removedAfterDebit=groupSend('group-send-membership-debit-0001')
eq(removedAfterDebit.Success,false);eq(removedAfterDebit.Status,'refunded','SendMoney refunds after membership disappears after debit');eq(ledger['group-send-membership-debit-0001'].status,'refunded');eq(#MONEY_WRITES,writesBeforeGroup+2,'group SendMoney debit is returned exactly once');eq(MONEY[1].bank,bankBeforeDebit);restoreGroup()

local payRemovedAtBegin=create('group-pay-membership-ledger-0001',18,'5550000002',group);writesBeforeGroup=#MONEY_WRITES;flipGroupAfterLedgerInsert='5550000002'
local payNoDebit=pay(payRemovedAtBegin.RequestId,'group-pay-membership-ledger-op-0001')
eq(payNoDebit.Success,false,'PayRequest rechecks group membership after W.begin yields');eq(ledger['group-pay-membership-ledger-op-0001'].status,'rejected');eq(#MONEY_WRITES,writesBeforeGroup,'PayRequest membership removed during journal insert performs no debit or credit');eq(requests[payRemovedAtBegin.RequestId].status,'pending');restoreGroup()

local payRemovedAfterDebitRequest=create('group-pay-membership-debit-0001',18,'5550000002',group);writesBeforeGroup=#MONEY_WRITES;bankBeforeDebit=MONEY[2].bank;flipGroupOnDebit=2
local payRefund=pay(payRemovedAfterDebitRequest.RequestId,'group-pay-membership-debit-op-0001')
eq(payRefund.Success,false);eq(payRefund.Status,'refunded','PayRequest refunds after group membership disappears after debit');eq(ledger['group-pay-membership-debit-op-0001'].status,'refunded');eq(#MONEY_WRITES,writesBeforeGroup+2,'group payment debit is returned exactly once');eq(MONEY[2].bank,bankBeforeDebit);eq(requests[payRemovedAfterDebitRequest.RequestId].operation_id,nil);restoreGroup()

local payRemovedAfterCreditRequest=create('group-pay-membership-credit-0001',18,'5550000002',group);writesBeforeGroup=#MONEY_WRITES;local noticesBeforeGroup=#notices;local eventsBeforeGroup=#EMITTED;flipGroupOnCredit=1
local payReview=pay(payRemovedAfterCreditRequest.RequestId,'group-pay-membership-credit-op-0001')
eq(payReview.Success,false);eq(payReview.Status,'review','PayRequest is held for review after recipient credit if group membership disappears');eq(ledger['group-pay-membership-credit-op-0001'].status,'review');eq(requests[payRemovedAfterCreditRequest.RequestId].status,'review');eq(cashEvents['group-pay-membership-credit-op-0001'],nil,'review payment has no committed cash receipt');eq(#MONEY_WRITES,writesBeforeGroup+2,'post-credit review preserves the debit and credit for reconciliation');eq(#notices,noticesBeforeGroup,'stale group payment emits no notification');eq(#EMITTED,eventsBeforeGroup,'stale group payment emits no receipt event');restoreGroup();ledger['group-pay-membership-credit-op-0001'].status='complete'

writesBeforeGroup=#MONEY_WRITES;noticesBeforeGroup=#notices;eventsBeforeGroup=#EMITTED;flipGroupBeforeTransaction='5550000002'
local removedAtCommit=groupSend('group-send-membership-commit-0001')
eq(removedAtCommit.Success,false,'SendMoney transaction gates journal completion on group membership');eq(ledger['group-send-membership-commit-0001'].status,'review');eq(cashEvents['group-send-membership-commit-0001'],nil,'commit-time group removal inserts no cash receipt');eq(#MONEY_WRITES,writesBeforeGroup+2,'commit-time removal preserves already completed bank effects for review');eq(#notices,noticesBeforeGroup,'commit-time removal suppresses notifications');eq(#EMITTED,eventsBeforeGroup,'commit-time removal emits no receipt event')
Phone.removeMoney=originalRemove;Phone.addMoney=originalGroupAdd
