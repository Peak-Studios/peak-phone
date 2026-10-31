base('esx');addPlayer(1,'char1:LICENSE-A');addPlayer(2,'char3:LICENSE-B');addPlayer(3,'char5:LICENSE-C')
local ledger={};local transactions={};local profiles=Phone.Server.Profiles;local dbWallets={};local statusReadFailures={};local insertFaults={};local failTerminalMark=false
function PhoneDB.one(q,p)
 if q:find('SELECT status FROM peak_phone_ledger WHERE operation_id=?',1,true)then
  local failure=statusReadFailures[p[1]]
  if failure then
   if failure.skip>0 then failure.skip=failure.skip-1
   else statusReadFailures[p[1]]=nil;if failure.mode=='throw' then error('synthetic ledger status read failure') else return nil end end
  end
 end
 if q:find('operation_id=?',1,true)then
  local row=ledger[p[1]];if not row then return nil end
  if q:find('from_citizenid=?',1,true)then
   if row.from_citizenid~=p[2] then return nil end
   if q:find("comment LIKE 'CRYPTO BUY %'",1,true) and not (row.comment:match('^CRYPTO BUY ') or row.comment:match('^CRYPTO SELL ') or row.comment:match('^CRYPTO TRANSFER ')) then return nil end
  end
  return copy(row)
 end
 if q:find('status NOT IN',1,true)then
  if q:find("comment LIKE 'CRYPTO BUY %'",1,true)then
   for _,v in pairs(ledger)do if v.from_citizenid==p[1] and (v.comment:match('^CRYPTO BUY ') or v.comment:match('^CRYPTO SELL ') or v.comment:match('^CRYPTO TRANSFER ')) and v.status~='complete'and v.status~='refunded'and v.status~='rejected'then return copy(v)end end
  else
   for _,v in pairs(ledger)do if (v.from_citizenid==p[1]or v.to_citizenid==p[2]) and v.status~='complete'and v.status~='refunded'and v.status~='rejected'then return {operation_id=v.operation_id}end end
  end
 end
 if q:find('SELECT crypto',1,true)then
  local cid=p[1];if not dbWallets[cid] then dbWallets[cid]=copy(profiles[cid].crypto) end
  return {crypto=copy(dbWallets[cid])}
 end
end
function PhoneDB.query(q,p)
 if q:find('INSERT INTO peak_phone_ledger',1,true)then ledger[p[1]]={operation_id=p[1],from_citizenid=p[2],to_citizenid=p[3],amount=p[4],comment=p[5],status=p[6]};return {} end
 if q:find('UPDATE peak_phone_ledger SET status=?',1,true)then ledger[p[3]].status=p[1];return {}end
 if q:find('UPDATE peak_phone_characters SET phone_number=?',1,true)then
  if q:find('crypto=?',1,true)then dbWallets[p[#p]]=copy(Phone.decode(p[4]))end
  return {}
 end
 return {}
end
function PhoneDB.update(q,p)
 if q:find('INSERT INTO peak_phone_ledger',1,true)then
  local fault=insertFaults[p[1]];if fault then insertFaults[p[1]]=nil
   if fault.mode=='throw' then error('synthetic ledger insert failure') end
   if fault.mode=='unique_race' then ledger[p[1]]=copy(fault.row);return 0 end
   if fault.mode=='nil_after_persist' then ledger[p[1]]={operation_id=p[1],from_citizenid=p[2],to_citizenid=p[3],amount=p[4],comment=p[5],status=p[6]};return nil end
  end
  ledger[p[1]]={operation_id=p[1],from_citizenid=p[2],to_citizenid=p[3],amount=p[4],comment=p[5],status=p[6]};return 1
 end
 if q:find('UPDATE peak_phone_ledger SET status=?',1,true)then if failTerminalMark and p[1]=='complete' then return 0 end;ledger[p[3]].status=p[1];return 1 end
 return 1
end
function PhoneDB.transaction(rows)
 for _,r in ipairs(rows)do
  if r.query:find('phone_wenmo',1,true)then transactions[#transactions+1]=r.values end
  if r.query:find("UPDATE peak_phone_ledger SET status='complete'",1,true)then ledger[r.values[2]].status='complete' end
  if r.query:find("UPDATE peak_phone_ledger SET status='credit_pending'",1,true)then ledger[r.values[2]].status='credit_pending' end
  if r.query:find("UPDATE peak_phone_ledger SET status='refunded'",1,true)then ledger[r.values[2]].status='refunded' end
  if r.query:find('SET crypto=?',1,true)then dbWallets[r.values[2]]=copy(Phone.decode(r.values[1]))end
 end;return true
end
loadrel('bridge/wallet.lua');Phone.activeNumber=function(src)local p=Phone.getPlayer(src);return p and p.PlayerData.charinfo.phone end;loadrel('server/sv_wenmo.lua')
local function send(data)CLOCK=CLOCK+2100;return rpc('peak-phone:Server:Wenmo:SendMoney',1,data)end
local data={Phone='5550000002',Amount=100,Comment='fixture',OperationId='1234567890abcdef'}
eq(send(data).Success,true);eq(MONEY[1].bank,900);eq(MONEY[2].bank,1100);eq(#transactions,1);eq(ledger[data.OperationId].status,'complete')
eq(send(data).Success,true,'retry acknowledges recorded result');eq(MONEY[1].bank,900);eq(#MONEY_WRITES,2,'no duplicate debit or credit')
local tamper=copy(data);tamper.Amount=200;eq(send(tamper).Success,false);eq(MONEY[1].bank,900)
local bad={Phone='5550000002',Amount=-50};eq(send(bad).Success,false)
local insufficient={Phone='5550000002',Amount=901,OperationId='insufficient0001'};eq(send(insufficient).Success,false);eq(MONEY[1].bank,900);eq(ledger[insufficient.OperationId].status,'rejected')
-- A wallet exception may have happened after a real debit: never blindly retry or refund.
local saved=Phone.addMoney;Phone.addMoney=function()error('unknown credit outcome')end
local ambiguous={Phone='5550000002',Amount=20,OperationId='ambiguous-credit-01'};eq(send(ambiguous).Success,false);eq(ledger[ambiguous.OperationId].status,'review');eq(MONEY[1].bank,880);eq(MONEY[2].bank,1100)
Phone.addMoney=saved;eq(send({Phone='5550000002',Amount=10,OperationId='new-operation-0001'}).Success,false,'unreconciled wallet is blocked');eq(MONEY[1].bank,880)
-- ESX may collapse a failed credit into false after mutation, so retain the debit for review.
ledger[ambiguous.OperationId].status='complete' -- fixture operator has reconciled it, NOT production recovery code.
Phone.addMoney=function(src,...)if src==2 then return false end;return saved(src,...)end
local writesBeforeReview=#MONEY_WRITES;local rejected={Phone='5550000002',Amount=10,OperationId='explicit-reject-01'};local uncertain=send(rejected)
eq(uncertain.Success,false);eq(uncertain.Status,'review');eq(MONEY[1].bank,870);eq(MONEY[2].bank,1100);eq(ledger[rejected.OperationId].status,'review');eq(#MONEY_WRITES,writesBeforeReview+1,'ESX false credit result is not blindly refunded')
ledger[rejected.OperationId].status='complete' -- Fixture operator reconciles the ambiguous ESX outcome before isolated crypto assertions.
Phone.addMoney=saved
Config={Crypto={{Id='testcoin',Costs=2,CanBuy=true}}};loadrel('server/sv_crypto.lua')
local ac,bc=Phone.rawIdentity(PLAYERS[1]),Phone.rawIdentity(PLAYERS[2]);local aa,bb=profiles[ac].crypto.testcoin,profiles[bc].crypto.testcoin
local function ledgerCount()local n=0;for _ in pairs(ledger)do n=n+1 end;return n end
local beforeInvalidCoins,beforeInvalidBank,beforeInvalidWrites,beforeInvalidRows=profiles[ac].crypto.testcoin,MONEY[1].bank,#MONEY_WRITES,ledgerCount()
local missingId=rpc('peak-phone:Server:Crypto:BuyCrypto',1,{CryptoId='testcoin',Amount=5})
eq(missingId.Success,false,'missing operation IDs are rejected before writes');eq(profiles[ac].crypto.testcoin,beforeInvalidCoins);eq(MONEY[1].bank,beforeInvalidBank);eq(#MONEY_WRITES,beforeInvalidWrites);eq(ledgerCount(),beforeInvalidRows)
local invalidId=rpc('peak-phone:Server:Crypto:BuyCrypto',1,{CryptoId='testcoin',Amount=5,OperationId='bad ref'})
eq(invalidId.Success,false,'malformed operation IDs are rejected before writes');eq(profiles[ac].crypto.testcoin,beforeInvalidCoins);eq(MONEY[1].bank,beforeInvalidBank);eq(#MONEY_WRITES,beforeInvalidWrites);eq(ledgerCount(),beforeInvalidRows)
local tr={CryptoId='testcoin',Amount=5,Phone='5550000002',OperationId='crypto-transfer-001'}
eq(rpc('peak-phone:Server:Crypto:TransferCrypto',1,tr).Success,true);eq(profiles[ac].crypto.testcoin,aa-5);eq(profiles[bc].crypto.testcoin,bb+5)
eq(rpc('peak-phone:Server:Crypto:TransferCrypto',1,tr).Success,true);eq(profiles[ac].crypto.testcoin,aa-5,'idempotent crypto transfer')
local reviewBlockId='crypto-review-block-001'
ledger[reviewBlockId]={operation_id=reviewBlockId,from_citizenid=ac,to_citizenid=ac,amount=1,comment='CRYPTO BUY testcoin 1',status='review'}
local offlineId='crypto-transfer-offline-001';local offlineCoins=profiles[ac].crypto.testcoin
local offline=rpc('peak-phone:Server:Crypto:TransferCrypto',1,{CryptoId='testcoin',Amount=2,Phone='5550000004',OperationId=offlineId})
eq(offline.Success,false);eq(offline.OperationId,offlineId,'offline recipient rejection is bound to the saved reference');eq(offline.Status,'rejected');eq(ledger[offlineId].status,'rejected','offline rejection is durable');eq(profiles[ac].crypto.testcoin,offlineCoins,'offline rejection does not debit the sender');eq(Phone.Wallet.pending(ac).operation_id,reviewBlockId,'a safe rejection does not clear another wallet review')
local offlineRead=rpc('peak-phone:Server:Crypto:GetOperation',1,{OperationId=offlineId})
eq(offlineRead.Success,true);eq(offlineRead.Operation.OperationId,offlineId);eq(offlineRead.Operation.Status,'rejected','lost acknowledgement can resolve the persisted rejection');eq(offlineRead.WalletReviewRequired,true,'exact rejection status preserves the wallet-wide review block')
local blockedCoins=profiles[ac].crypto.testcoin;local blockedTransferId='crypto-transfer-blocked-001'
local blockedTransfer=rpc('peak-phone:Server:Crypto:TransferCrypto',1,{CryptoId='testcoin',Amount=2,Phone='5550000002',OperationId=blockedTransferId})
eq(blockedTransfer.Success,false,'normal transfers still respect another wallet review');eq(blockedTransfer.OperationId,blockedTransferId);eq(blockedTransfer.Status,'rejected','a pre-write wallet-review block resolves this saved reference');eq(ledger[blockedTransferId].status,'rejected','blocked transfer is journaled only as a no-op rejection');eq(profiles[ac].crypto.testcoin,blockedCoins)
local blockedTransferRead=rpc('peak-phone:Server:Crypto:GetOperation',1,{OperationId=blockedTransferId})
eq(blockedTransferRead.Success,true);eq(blockedTransferRead.Operation.Status,'rejected');eq(blockedTransferRead.WalletReviewRequired,true,'resolving a blocked transfer preserves the other wallet review')
ledger[reviewBlockId].status='complete'
local function withReviewRace(id,action)
 local saved=Phone.Wallet.begin;local blockId='race-block-'..id
 Phone.Wallet.begin=function(operationId,from,to,amount,comment)
  if operationId==id then ledger[blockId]={operation_id=blockId,from_citizenid=ac,to_citizenid=ac,amount=1,comment='CRYPTO BUY testcoin 1',status='review'} end
  return saved(operationId,from,to,amount,comment)
 end
 local packed=table.pack(pcall(action));Phone.Wallet.begin=saved
 if not packed[1] then error(packed[2]) end
 return packed[2],blockId
end
local raceBuyId='crypto-buy-review-race-001';local beforeRaceBuyCoins,beforeRaceBuyBank,beforeRaceBuyWrites=profiles[ac].crypto.testcoin,MONEY[1].bank,#MONEY_WRITES
local raceBuy,raceBuyBlock=withReviewRace(raceBuyId,function()return rpc('peak-phone:Server:Crypto:BuyCrypto',1,{CryptoId='testcoin',Amount=2,OperationId=raceBuyId})end)
eq(raceBuy.Success,false);eq(raceBuy.OperationId,raceBuyId);eq(raceBuy.Status,'rejected');eq(ledger[raceBuyId].status,'rejected');eq(raceBuy.Msg,'Another wallet transaction needs administrator review. This Crypto action was not submitted.')
eq(profiles[ac].crypto.testcoin,beforeRaceBuyCoins);eq(MONEY[1].bank,beforeRaceBuyBank);eq(#MONEY_WRITES,beforeRaceBuyWrites,'Buy review race never reaches the bank export');eq(ledger[raceBuyBlock].status,'review')
local raceBuyRead=rpc('peak-phone:Server:Crypto:GetOperation',1,{OperationId=raceBuyId});eq(raceBuyRead.Success,true);eq(raceBuyRead.Operation.Status,'rejected');eq(raceBuyRead.WalletReviewRequired,true,'Buy exact rejection read keeps the competing review block')
ledger[raceBuyBlock].status='complete'
local raceSellId='crypto-sell-review-race-001';local beforeRaceSellCoins,beforeRaceSellBank,beforeRaceSellWrites=profiles[ac].crypto.testcoin,MONEY[1].bank,#MONEY_WRITES
local raceSell,raceSellBlock=withReviewRace(raceSellId,function()return rpc('peak-phone:Server:Crypto:SellCrypto',1,{CryptoId='testcoin',Amount=2,OperationId=raceSellId})end)
eq(raceSell.Success,false);eq(raceSell.OperationId,raceSellId);eq(raceSell.Status,'rejected');eq(ledger[raceSellId].status,'rejected');eq(raceSell.Msg,'Another wallet transaction needs administrator review. This Crypto action was not submitted.')
eq(profiles[ac].crypto.testcoin,beforeRaceSellCoins);eq(MONEY[1].bank,beforeRaceSellBank);eq(#MONEY_WRITES,beforeRaceSellWrites,'Sell review race never reaches the bank export');eq(ledger[raceSellBlock].status,'review')
local raceSellRead=rpc('peak-phone:Server:Crypto:GetOperation',1,{OperationId=raceSellId});eq(raceSellRead.Success,true);eq(raceSellRead.Operation.Status,'rejected');eq(raceSellRead.WalletReviewRequired,true,'Sell exact rejection read keeps the competing review block')
ledger[raceSellBlock].status='complete'
local raceTransferId='crypto-transfer-review-race-001';local beforeRaceTransferFrom,beforeRaceTransferTo=profiles[ac].crypto.testcoin,profiles[bc].crypto.testcoin
local raceTransfer,raceTransferBlock=withReviewRace(raceTransferId,function()return rpc('peak-phone:Server:Crypto:TransferCrypto',1,{CryptoId='testcoin',Amount=2,Phone='5550000002',OperationId=raceTransferId})end)
eq(raceTransfer.Success,false);eq(raceTransfer.OperationId,raceTransferId);eq(raceTransfer.Status,'rejected');eq(ledger[raceTransferId].status,'rejected');eq(raceTransfer.Msg,'Another wallet transaction needs administrator review. This Crypto action was not submitted.')
eq(profiles[ac].crypto.testcoin,beforeRaceTransferFrom);eq(profiles[bc].crypto.testcoin,beforeRaceTransferTo);eq(ledger[raceTransferBlock].status,'review')
local raceTransferRead=rpc('peak-phone:Server:Crypto:GetOperation',1,{OperationId=raceTransferId});eq(raceTransferRead.Success,true);eq(raceTransferRead.Operation.Status,'rejected');eq(raceTransferRead.WalletReviewRequired,true,'transfer exact rejection read keeps the competing review block')
ledger[raceTransferBlock].status='complete'
local savedActiveNumber=Phone.activeNumber;Phone.activeNumber=function(src)if src==2 then return nil end;return savedActiveNumber(src)end
local staleId='crypto-transfer-stale-sim-001';local staleCoins=profiles[ac].crypto.testcoin
local stale=rpc('peak-phone:Server:Crypto:TransferCrypto',1,{CryptoId='testcoin',Amount=2,Phone='5550000002',OperationId=staleId})
Phone.activeNumber=savedActiveNumber
eq(stale.Success,false);eq(stale.OperationId,staleId,'a known recipient with an inactive SIM resolves the saved reference');eq(stale.Status,'rejected');eq(stale.Msg,'The recipient is no longer online with the selected active phone.');eq(ledger[staleId].to_citizenid,bc);eq(ledger[staleId].status,'rejected');eq(profiles[ac].crypto.testcoin,staleCoins,'a stale SIM rejection does not debit the sender')
local staleRead=rpc('peak-phone:Server:Crypto:GetOperation',1,{OperationId=staleId})
eq(staleRead.Success,true);eq(staleRead.Operation.Status,'rejected','known inactive-SIM rejection is durable')
local lateId='crypto-transfer-late-disconnect-001';local lateCoinsFrom,lateCoinsTo=profiles[ac].crypto.testcoin,profiles[bc].crypto.testcoin
local savedWalletBegin=Phone.Wallet.begin;local activeDuringLateTransfer=Phone.activeNumber
Phone.Wallet.begin=function(id,...)
 local started,old=savedWalletBegin(id,...)
 if id==lateId and started then Phone.activeNumber=function(src)if src==2 then return nil end;return activeDuringLateTransfer(src)end end
 return started,old
end
local late=rpc('peak-phone:Server:Crypto:TransferCrypto',1,{CryptoId='testcoin',Amount=2,Phone='5550000002',OperationId=lateId})
Phone.Wallet.begin=savedWalletBegin;Phone.activeNumber=activeDuringLateTransfer
eq(late.Success,false);eq(late.OperationId,lateId);eq(late.Status,'rejected');eq(late.Msg,'The recipient disconnected or changed phones before the transfer.');eq(ledger[lateId].status,'rejected','late target change is terminal before any balance update');eq(profiles[ac].crypto.testcoin,lateCoinsFrom);eq(profiles[bc].crypto.testcoin,lateCoinsTo)
local savedWithLocks=Phone.withLocks;local originalPlayer=PLAYERS[1];local originalIdentifier=originalPlayer.identifier;local originalCitizenId=originalPlayer.PlayerData and originalPlayer.PlayerData.citizenid
Phone.withLocks=function(keys,fn)
 local scoped=false;for _,key in ipairs(keys)do if key=='operation:crypto-transfer-stale-sender-001' then scoped=true end end
 if not scoped then return savedWithLocks(keys,fn) end
 originalPlayer.identifier='stale-sender-identity'
 if originalPlayer.PlayerData then originalPlayer.PlayerData.citizenid='stale-sender-identity' end
 local packed=table.pack(pcall(savedWithLocks,keys,fn))
 originalPlayer.identifier=originalIdentifier
 if originalPlayer.PlayerData then originalPlayer.PlayerData.citizenid=originalCitizenId end
 if not packed[1] then error(packed[2]) end
 return table.unpack(packed,2,packed.n)
end
local staleSenderId='crypto-transfer-stale-sender-001';local senderCoins=profiles[ac].crypto.testcoin
local staleSender=rpc('peak-phone:Server:Crypto:TransferCrypto',1,{CryptoId='testcoin',Amount=2,Phone='5550000002',OperationId=staleSenderId})
Phone.withLocks=savedWithLocks
eq(staleSender.Success,false);eq(staleSender.Status,nil,'changed sender identity is not called a definite rejection');eq(ledger[staleSenderId],nil,'changed sender is not journaled under the stale identity');eq(profiles[ac].crypto.testcoin,senderCoins)
local function staleCallerIdentity()originalPlayer.identifier='journal-stale-identity';if originalPlayer.PlayerData then originalPlayer.PlayerData.citizenid='journal-stale-identity'end end
local function restoreCallerIdentity()originalPlayer.identifier=originalIdentifier;if originalPlayer.PlayerData then originalPlayer.PlayerData.citizenid=originalCitizenId end end
local beforeJournalYieldCoins=profiles[ac].crypto.testcoin;local firstReadId='crypto-transfer-journal-first-read-001';local savedOne=PhoneDB.one
PhoneDB.one=function(q,p)local result=savedOne(q,p);if q:find('SELECT * FROM peak_phone_ledger WHERE operation_id=?',1,true)and p[1]==firstReadId then staleCallerIdentity()end;return result end
local firstReadPacked=table.pack(pcall(function()return rpc('peak-phone:Server:Crypto:TransferCrypto',1,{CryptoId='testcoin',Amount=2,Phone='5550000004',OperationId=firstReadId})end))
PhoneDB.one=savedOne;restoreCallerIdentity();if not firstReadPacked[1]then error(firstReadPacked[2])end
local firstReadStale=firstReadPacked[2]
eq(firstReadStale.Success,false);eq(firstReadStale.OperationId,nil,'identity change during the journal preflight does not return a rejection for the old character');eq(ledger[firstReadId],nil,'identity change after the journal preflight prevents inserting under the old identity');eq(profiles[ac].crypto.testcoin,beforeJournalYieldCoins)
local finalReadId='crypto-transfer-journal-final-read-001';savedOne=PhoneDB.one
PhoneDB.one=function(q,p)local result=savedOne(q,p);if q:find('SELECT status FROM peak_phone_ledger WHERE operation_id=?',1,true)and p[1]==finalReadId then staleCallerIdentity()end;return result end
local finalReadPacked=table.pack(pcall(function()return rpc('peak-phone:Server:Crypto:TransferCrypto',1,{CryptoId='testcoin',Amount=2,Phone='5550000004',OperationId=finalReadId})end))
PhoneDB.one=savedOne;restoreCallerIdentity();if not finalReadPacked[1]then error(finalReadPacked[2])end
local finalReadStale=finalReadPacked[2]
eq(finalReadStale.Success,false);eq(finalReadStale.OperationId,nil,'identity change during final journal read does not return the prior character result');eq(ledger[finalReadId].status,'rejected','a journal row written before identity change remains authoritative');eq(profiles[ac].crypto.testcoin,beforeJournalYieldCoins)
local finalReadOwner=rpc('peak-phone:Server:Crypto:GetOperation',1,{OperationId=finalReadId});eq(finalReadOwner.Success,true);eq(finalReadOwner.Operation.Status,'rejected','the original character can resolve the retained journal row after identity restoration')
-- Give the exact owner-status checks below a fresh window; this fixture runs all requests at one mock timestamp.
CLOCK=CLOCK+1000
local beforeInsertFaultCoins,beforeInsertFaultBank,beforeInsertFaultWrites=profiles[ac].crypto.testcoin,MONEY[1].bank,#MONEY_WRITES
local nilAckId='crypto-transfer-insert-nil-ack-001';insertFaults[nilAckId]={mode='nil_after_persist'}
local nilAck=rpc('peak-phone:Server:Crypto:TransferCrypto',1,{CryptoId='testcoin',Amount=2,Phone='5550000004',OperationId=nilAckId})
eq(nilAck.Success,false);eq(nilAck.OperationId,nil,'nil insert acknowledgement does not assert which row won');eq(nilAck.Status,nil);eq(ledger[nilAckId].status,'rejected','the synthetic insert committed before losing its acknowledgement')
eq(profiles[ac].crypto.testcoin,beforeInsertFaultCoins);eq(MONEY[1].bank,beforeInsertFaultBank);eq(#MONEY_WRITES,beforeInsertFaultWrites,'an insert acknowledgement loss never reaches a wallet export')
local nilAckRead=rpc('peak-phone:Server:Crypto:GetOperation',1,{OperationId=nilAckId});eq(nilAckRead.Success,true);eq(nilAckRead.Operation.Status,'rejected','the exact owner read recovers the persisted no-op after the lost acknowledgement');eq(nilAckRead.Balances.testcoin,beforeInsertFaultCoins);eq(nilAckRead.WalletReviewRequired,false)
local throwInsertId='crypto-transfer-insert-throws-001';insertFaults[throwInsertId]={mode='throw'}
local throwInsert=rpc('peak-phone:Server:Crypto:TransferCrypto',1,{CryptoId='testcoin',Amount=2,Phone='5550000004',OperationId=throwInsertId})
eq(throwInsert.Success,false);eq(throwInsert.OperationId,throwInsertId);eq(throwInsert.Status,'review','a thrown insert with no row stays uncertain');eq(ledger[throwInsertId],nil,'a thrown pre-write insert leaves no false terminal row')
eq(profiles[ac].crypto.testcoin,beforeInsertFaultCoins);eq(MONEY[1].bank,beforeInsertFaultBank);eq(#MONEY_WRITES,beforeInsertFaultWrites)
local throwInsertRead=rpc('peak-phone:Server:Crypto:GetOperation',1,{OperationId=throwInsertId});eq(throwInsertRead.Success,false,'an absent row cannot be claimed as rejected or exactly recovered')
local uniqueRaceId='crypto-transfer-insert-unique-race-001';local authoritativeRow={operation_id=uniqueRaceId,from_citizenid=ac,to_citizenid=ac,amount=6,comment='CRYPTO BUY testcoin 3',status='review',created_at=123,updated_at=456}
insertFaults[uniqueRaceId]={mode='unique_race',row=authoritativeRow}
local uniqueRace=rpc('peak-phone:Server:Crypto:TransferCrypto',1,{CryptoId='testcoin',Amount=2,Phone='5550000004',OperationId=uniqueRaceId})
eq(uniqueRace.Success,false);eq(uniqueRace.OperationId,nil,'unique-ID conflict does not relabel the existing row as this rejection');eq(uniqueRace.Status,nil);eq(ledger[uniqueRaceId].status,'review');eq(ledger[uniqueRaceId].comment,authoritativeRow.comment);eq(ledger[uniqueRaceId].amount,authoritativeRow.amount);eq(ledger[uniqueRaceId].updated_at,authoritativeRow.updated_at,'unique-ID conflict never overwrites the authoritative row')
eq(profiles[ac].crypto.testcoin,beforeInsertFaultCoins);eq(MONEY[1].bank,beforeInsertFaultBank);eq(#MONEY_WRITES,beforeInsertFaultWrites,'unique-ID conflict never reaches a balance or bank write')
local uniqueRaceRead=rpc('peak-phone:Server:Crypto:GetOperation',1,{OperationId=uniqueRaceId});eq(uniqueRaceRead.Success,true);eq(uniqueRaceRead.Operation.OperationId,uniqueRaceId);eq(uniqueRaceRead.Operation.Status,'review','the exact owner read recovers the original review row');eq(uniqueRaceRead.Operation.Kind,'BUY');eq(uniqueRaceRead.Operation.Units,3);eq(Phone.Wallet.pending(ac).operation_id,uniqueRaceId,'existing uncertain row remains the active wallet review')
ledger[uniqueRaceId].status='complete' -- Fixture operator resolves the preserved review before unrelated cases.
local reusedOffline=copy(tr);reusedOffline.Phone='5550000004'
local reusedResponse=rpc('peak-phone:Server:Crypto:TransferCrypto',1,reusedOffline)
eq(reusedResponse.Status,nil,'a reused applied reference is not relabeled as rejected');eq(profiles[ac].crypto.testcoin,offlineCoins,'an offline retry cannot repeat an earlier transfer')
local reusedRead=rpc('peak-phone:Server:Crypto:GetOperation',1,{OperationId=tr.OperationId})
eq(reusedRead.Success,true);eq(reusedRead.Operation.Status,'complete','the owned earlier operation remains authoritative')
local sellId='crypto-sale-success-001';local bankBeforeSale=MONEY[1].bank;local writesBeforeSale=#MONEY_WRITES;local coinsBeforeSale=profiles[ac].crypto.testcoin
local sale=rpc('peak-phone:Server:Crypto:SellCrypto',1,{CryptoId='testcoin',Amount=5,OperationId=sellId})
eq(sale.Success,true);eq(sale.Status,'complete');eq(ledger[sellId].status,'complete');eq(MONEY[1].bank,bankBeforeSale+10);eq(profiles[ac].crypto.testcoin,coinsBeforeSale-5);eq(#MONEY_WRITES,writesBeforeSale+1)
local replaySale=rpc('peak-phone:Server:Crypto:SellCrypto',1,{CryptoId='testcoin',Amount=5,OperationId=sellId})
eq(replaySale.Success,true,'completed sell replays acknowledge the ledger');eq(MONEY[1].bank,bankBeforeSale+10,'completed sell never credits twice');eq(#MONEY_WRITES,writesBeforeSale+1)
local racedReplayWrites=#MONEY_WRITES;local racedReplayBank=MONEY[1].bank
local racedReplay,racedReplayBlock=withReviewRace(sellId,function()return rpc('peak-phone:Server:Crypto:SellCrypto',1,{CryptoId='testcoin',Amount=5,OperationId=sellId})end)
eq(racedReplay.Success,true,'an existing completed ID remains authoritative when a new review appears');eq(racedReplay.OperationId,sellId);eq(racedReplay.Status,'complete');eq(ledger[sellId].status,'complete');eq(MONEY[1].bank,racedReplayBank);eq(#MONEY_WRITES,racedReplayWrites,'existing completed ID never reaches the bank export');eq(ledger[racedReplayBlock].status,'review')
ledger[racedReplayBlock].status='complete'
local pendingId='crypto-sale-mark-fails-001';local beforePendingBank=MONEY[1].bank;local beforePendingWrites=#MONEY_WRITES;local beforePendingCoins=profiles[ac].crypto.testcoin
failTerminalMark=true
local uncertainSale=rpc('peak-phone:Server:Crypto:SellCrypto',1,{CryptoId='testcoin',Amount=5,OperationId=pendingId})
eq(uncertainSale.Success,false,'a failed terminal ledger mark cannot report success');eq(uncertainSale.Status,'review');eq(uncertainSale.OperationId,pendingId);eq(ledger[pendingId].status,'credit_pending');eq(MONEY[1].bank,beforePendingBank+10,'bank credit occurred once');eq(profiles[ac].crypto.testcoin,beforePendingCoins-5);eq(#MONEY_WRITES,beforePendingWrites+1)
local unresolved=rpc('peak-phone:Server:Crypto:GetOperation',1,{OperationId=pendingId})
eq(unresolved.Success,true);eq(unresolved.Operation.Status,'credit_pending');eq(unresolved.Operation.OperationId,pendingId);eq(unresolved.Balances.testcoin,beforePendingCoins-5)
local blockedReplay=rpc('peak-phone:Server:Crypto:SellCrypto',1,{CryptoId='testcoin',Amount=5,OperationId=pendingId})
eq(blockedReplay.Success,false);eq(MONEY[1].bank,beforePendingBank+10,'unresolved sell is never credited again');eq(#MONEY_WRITES,beforePendingWrites+1)
failTerminalMark=false
local ownedRead=rpc('peak-phone:Server:Crypto:GetOperation',1,{OperationId=sellId});eq(ownedRead.Success,true);eq(ownedRead.Operation.Status,'complete')
local otherOwner=rpc('peak-phone:Server:Crypto:GetOperation',2,{OperationId=sellId});eq(otherOwner.Success,false,'operation status is owner-only')
local nonCryptoId='noncryptooperation0001'
ledger[nonCryptoId]={operation_id=nonCryptoId,from_citizenid=ac,to_citizenid=ac,amount=10,comment='WENMO transfer',status='complete'}
local wrongNamespace=rpc('peak-phone:Server:Crypto:GetOperation',1,{OperationId=nonCryptoId});eq(wrongNamespace.Success,false,'Crypto status cannot read other ledger namespaces')

-- Crypto DB snapshots are separate from profile cache objects. A later SIM/profile save must not restore stale units.
ledger[pendingId].status='complete' -- The fixture operator resolves the prior sale before starting independent cache cases.
local function saveProfileAndCheck(cid)
 Phone.saveProfile(profiles[cid]);eq(dbWallets[cid].testcoin,Phone.decode(PhoneDB.one('SELECT crypto FROM peak_phone_characters WHERE citizenid=?',{cid}).crypto).testcoin,'profile save retains committed Crypto units')
end
local originalProfileQuery=PhoneDB.query;local queuedProfileSave
PhoneDB.query=function(q,p)
 if q:find('UPDATE peak_phone_characters SET phone_number=?',1,true)then queuedProfileSave={query=q,values=copy(p)};return {}end
 return originalProfileQuery(q,p)
end
Phone.saveProfile(profiles[ac]);PhoneDB.query=originalProfileQuery
check(queuedProfileSave and not queuedProfileSave.query:find('crypto=?',1,true),'SIM profile save does not snapshot the Crypto column')
local concurrentlyCommitted=copy(dbWallets[ac]);concurrentlyCommitted.testcoin=concurrentlyCommitted.testcoin+1
PhoneDB.transaction({{query='UPDATE peak_phone_characters SET crypto=? WHERE citizenid=?',values={json.encode(concurrentlyCommitted),ac}}})
PhoneDB.query(queuedProfileSave.query,queuedProfileSave.values)
eq(dbWallets[ac].testcoin,concurrentlyCommitted.testcoin,'queued SIM profile persistence cannot overwrite a concurrent Crypto commit')
profiles[ac].crypto=copy(concurrentlyCommitted)
local buyReadId='crypto-buy-status-read-001';local beforeBuyRead=profiles[ac].crypto.testcoin
statusReadFailures[buyReadId]={skip=0,mode='missing'}
local buyStatusUnverified=rpc('peak-phone:Server:Crypto:BuyCrypto',1,{CryptoId='testcoin',Amount=2,OperationId=buyReadId})
eq(buyStatusUnverified.Success,false);eq(buyStatusUnverified.Status,'review');eq(dbWallets[ac].testcoin,beforeBuyRead+2);eq(profiles[ac].crypto.testcoin,beforeBuyRead+2,'buy cache updates before failed ledger verification');saveProfileAndCheck(ac)
ledger[buyReadId].status='complete' -- Fixture operator reconciles the read failure; the cached/DB state remains the committed buy.

local transferReadId='crypto-transfer-status-read-001';local beforeTransferFrom=profiles[ac].crypto.testcoin;local beforeTransferTo=profiles[bc].crypto.testcoin
statusReadFailures[transferReadId]={skip=0,mode='throw'}
local transferStatusUnverified=rpc('peak-phone:Server:Crypto:TransferCrypto',1,{CryptoId='testcoin',Amount=3,Phone='5550000002',OperationId=transferReadId})
eq(transferStatusUnverified.Success,false);eq(transferStatusUnverified.Status,'review');eq(dbWallets[ac].testcoin,beforeTransferFrom-3);eq(dbWallets[bc].testcoin,beforeTransferTo+3)
eq(profiles[ac].crypto.testcoin,beforeTransferFrom-3,'sender cache updates before failed transfer verification');eq(profiles[bc].crypto.testcoin,beforeTransferTo+3,'recipient cache updates before failed transfer verification');saveProfileAndCheck(ac);saveProfileAndCheck(bc)
ledger[transferReadId].status='complete' -- Fixture operator reconciles the read failure; both transfer participants keep the committed units.

local restoreReadId='crypto-sell-restore-read-001';local beforeRestore=profiles[ac].crypto.testcoin
local savedAddMoney,savedFramework=Phone.addMoney,Phone.framework
Phone.addMoney=function()return false,false end;Phone.framework=function()return 'qbcore' end
statusReadFailures[restoreReadId]={skip=1,mode='missing'}
local restoreStatusUnverified=rpc('peak-phone:Server:Crypto:SellCrypto',1,{CryptoId='testcoin',Amount=1,OperationId=restoreReadId})
Phone.addMoney,Phone.framework=savedAddMoney,savedFramework
eq(restoreStatusUnverified.Success,false);eq(restoreStatusUnverified.Status,'review');eq(dbWallets[ac].testcoin,beforeRestore);eq(profiles[ac].crypto.testcoin,beforeRestore,'sale restoration cache updates before failed ledger verification');saveProfileAndCheck(ac)
ledger[restoreReadId].status='refunded' -- Fixture operator reconciles the read failure; restored units are durable and cached.

-- Nil optional service metadata keeps the shared emergency/tow job defaults usable.
PLAYERS[2].job.name='tow';PLAYERS[3].job.name='police';PhoneConfig.EmergencyJobs=nil;PhoneConfig.TowJobs=nil
EXPORTED.GetActivePhoneNumber=function(src)local p=Phone.getPlayer(src);return p and p.PlayerData.charinfo.phone end
loadrel('server/sv_services.lua')
local emergency=rpc('peak-phone:Server:Services:GetEmergencyWorkers',1)
local tow=rpc('peak-phone:Server:Services:GetTowWorkers',1)
eq(#emergency,1,'default emergency job metadata remains available');eq(emergency[1].Source,3);eq(emergency[1].Phone,'5550000003')
eq(#tow,1,'default tow job metadata remains available');eq(tow[1].Source,2);eq(tow[1].Phone,'5550000002')
