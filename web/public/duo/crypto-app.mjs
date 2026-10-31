import {NativeView,el,value,readLocal,writeLocal,normalizePhone,errorMessage} from './native-kit.mjs?rev=owner-config-20261015';

const MAX_CLIENT_INTEGER=Number.MAX_SAFE_INTEGER;
const terminalStatuses=new Set(['complete','rejected','refunded']);
const statusCopy={
 prepared:'Saved by the server; checking the current state.',
 debit_pending:'The bank debit is unresolved. Do not send again.',
 debited:'The bank debit was recorded; the wallet update needs review.',
 credit_pending:'The in-game bank credit is unresolved. Do not send again.',
 refund_pending:'A refund is unresolved. Do not send again.',
 review:'Administrator review is required. Do not send again.',
 complete:'The server confirmed this operation.',
 refunded:'The server confirmed that the virtual balance was returned.',
 rejected:'The server declined this operation before completion.',
 unknown:'The current state could not be verified. Keep the reference.',
};

function validId(value){return typeof value==='string'&&/^[A-Za-z0-9-]{16,64}$/.test(value);}
function validPending(value){
 return !!value&&typeof value==='object'&&!Array.isArray(value)&&validId(value.OperationId)
  &&['BUY','SELL','TRANSFER'].includes(value.Kind)&&typeof value.CryptoId==='string'&&/^[\w-]{1,32}$/.test(value.CryptoId)
  &&Number.isSafeInteger(Number(value.Amount))&&Number(value.Amount)>0;
}
function newOperationId(){
 const source=globalThis.crypto;
 if(typeof source?.randomUUID==='function')return source.randomUUID();
 if(typeof source?.getRandomValues==='function'){
  const bytes=source.getRandomValues(new Uint8Array(16));
  const id=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  if(validId(id))return id;
 }
 throw Error('A secure transaction reference could not be created on this device.');
}
function normalizeCatalog(value){
 if(!Array.isArray(value))throw Error('The configured currency catalog is invalid.');
 return value.map(row=>{
  const Id=String(row?.Id||'').trim(),Label=String(row?.Label||Id).trim(),Cost=Number(row?.Costs);
  if(!/^[\w-]{1,32}$/.test(Id)||!Label||Label.length>60||!Number.isSafeInteger(Cost)||Cost<1)throw Error('A currency is missing its configured ID, name or fixed unit price.');
  return {Id,Label,Cost,CanBuy:row.Purchasable!==false&&row.CanBuy!==false,CanSell:row.CanSell!==false,Icon:String(row.Icon||'')};
 });
}
function normalizeBalances(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('The character wallet returned invalid balances.');
 const balances={};
 for(const [id,amount] of Object.entries(value)){
  const parsed=Number(amount);
  if(!/^[\w-]{1,32}$/.test(id)||!Number.isSafeInteger(parsed)||parsed<0)continue;
  balances[id]=parsed;
 }
 return balances;
}
function normalizeLimits(value){
 const MaxCryptoUnits=Number(value?.MaxCryptoUnits),MaxTransfer=Number(value?.MaxTransfer);
 if(!Number.isSafeInteger(MaxCryptoUnits)||MaxCryptoUnits<1||!Number.isSafeInteger(MaxTransfer)||MaxTransfer<1)throw Error('The server wallet limits could not be read.');
 return {MaxCryptoUnits,MaxTransfer};
}
function formatNumber(amount){return Number(amount).toLocaleString(undefined,{maximumFractionDigits:0});}
function formatBank(amount){return '$'+formatNumber(amount)+' in-game';}
function operationFromServer(row){
 if(!row||!validId(row.OperationId)||!['BUY','SELL','TRANSFER'].includes(row.Kind)||typeof row.CryptoId!=='string')return null;
 const Units=Number(row.Units??(row.Kind==='TRANSFER'?row.Amount:0));
 return {OperationId:row.OperationId,Kind:row.Kind,CryptoId:row.CryptoId,Amount:Number.isSafeInteger(Units)&&Units>0?Units:0,
  UnitPrice:Number.isSafeInteger(Number(row.UnitPrice))?Number(row.UnitPrice):0,Total:Number.isSafeInteger(Number(row.Amount))?Number(row.Amount):0,Status:String(row.Status||'unknown')};
}

export class CryptoApp extends NativeView{
 constructor(options){
  super(options);this.element.classList.add('nx-restored-app','nx-crypto');
  this.preview=options.props?.preview===true;this.catalog=[];this.balances=null;this.limits=null;this.catalogState='loading';this.walletState='loading';
  this.catalogError='';this.walletError='';this.walletBlocked=false;this.lastUpdated=0;this.readSequence=0;this.writeBusy=false;this.identityChanged=false;this.lastOutcome=null;
  const saved=readLocal(this.context,'crypto-pending',null);this.pending=validPending(saved)?{...saved,Status:String(saved.Status||'unknown')}:null;this.pendingCorrupt=saved!=null&&!this.pending;
  this.identityKey=this.playerIdentity(value(this.stores?.PlayerData));
  if(this.stores?.PlayerData?.subscribe)this.off.push(this.stores.PlayerData.subscribe(player=>{
   const next=this.playerIdentity(player);
   if(!this.identityKey){this.identityKey=next;return;}
   if(next!==this.identityKey)this.invalidateIdentity();
  }));
  this.render();this.refresh();
 }
 playerIdentity(player){return JSON.stringify([String(player?.Cid||''),String(player?.DeviceId||''),String(player?.DeviceGeneration||''),String(player?.PhoneNumber||'')]);}
 invalidateIdentity(){
  if(this.identityChanged)return;
  this.identityChanged=true;this.readSequence++;this.pending=null;this.draft=null;this.balances=null;this.closeSheet();this.render();
 }
 render(){
  if(!this.alive)return;
  const refresh=this.button('Refresh wallet','refresh',()=>this.refresh(),'nx-header-action');refresh.disabled=this.writeBusy;
  const header=this.header('Crypto','Character wallet',[refresh]);
  this.element.replaceChildren(header);const body=el('div','nx-restored-body nx-crypto-body');
  body.append(el('p','nx-crypto-disclaimer','IN-GAME VIRTUAL BALANCES · No external wallets, market feed or real-money crypto service.'));
  if(this.preview)body.append(el('p','nx-preview-note','SYNTHETIC PREVIEW · changes stay in this browser fixture and never reach a game wallet.'));
  if(this.identityChanged){body.append(this.empty('Character changed','This wallet view has been cleared. Reopen Crypto from the active character.','id-card'));this.element.append(body);return;}
  if(this.pendingCorrupt){body.append(this.pendingPanel(null,'A saved operation reference could not be read. Do not create another wallet action until the original outcome is checked.'));}
  else if(this.pending){body.append(this.pendingPanel(this.pending,this.walletError));}
  if(this.walletBlocked&&!this.pending&&!this.pendingCorrupt)body.append(this.pendingPanel(null,'Another in-game wallet operation needs review. No Crypto action will be submitted until it is resolved.'));
  if(this.lastOutcome&&!this.pending&&!this.pendingCorrupt)body.append(this.outcomePanel(this.lastOutcome));
  if(this.walletState==='loading'&&!this.balances){body.append(el('p','nx-restored-state','Loading the character wallet…'));}
  else if(this.walletState==='error')body.append(this.empty('Wallet unavailable',this.walletError||'The character wallet could not be read. Retry to view its current state.','wallet',()=>this.refresh()));
  else if(this.walletState==='ready'){
   body.append(el('div','nx-restored-section-heading nx-crypto-wallet-heading',this.lastUpdated?`Character balance · ${new Date(this.lastUpdated).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}`:'Character balance'));
   if(!this.catalog.length&&this.catalogState==='ready')body.append(this.empty('No currencies configured','The server has not configured any in-game virtual currencies.','wallet'));
   else if(this.catalogState==='error')body.append(this.empty('Currency catalog unavailable',this.catalogError,'wallet',()=>this.refresh()));
   else if(this.catalogState==='loading'&&!this.catalog.length)body.append(el('p','nx-restored-state','Loading configured currencies…'));
   else for(const coin of this.catalog)body.append(this.coinRow(coin));
  }
  body.append(el('p','nx-restored-footnote','Unit prices are fixed server configuration. The server enforces transaction and balance limits.'));
  this.element.append(body);
 }
 coinRow(coin){
  const amount=Number(this.balances?.[coin.Id]||0),row=el('article','nx-coin-row');row.dataset.currency=coin.Id;
  const icon=el('div','nx-coin-mark');icon.setAttribute('aria-hidden','true');icon.textContent=coin.Id.slice(0,2);row.append(icon);
  const detail=el('div','nx-coin-detail');detail.append(el('strong','',coin.Label),el('span','',coin.Id),el('span','',`$${formatNumber(coin.Cost)} fixed in-game unit price`));row.append(detail);
  const balance=el('div','nx-coin-balance');balance.append(el('strong','',formatNumber(amount)),el('span','','character units'));row.append(balance);
  const actions=el('div','nx-coin-actions');const ready=this.walletState==='ready'&&!this.pending&&!this.pendingCorrupt&&!this.walletBlocked&&!this.writeBusy;
  const buy=this.textButton('Buy','',()=>this.openAmountSheet(coin,'BUY'),'nx-coin-action');buy.disabled=!ready||!coin.CanBuy;buy.setAttribute('aria-label',coin.CanBuy?`Buy ${coin.Label}`:`Buy ${coin.Label} unavailable`);if(!coin.CanBuy)buy.title='The server does not allow purchases of this currency.';
  const sell=this.textButton('Sell','',()=>this.openAmountSheet(coin,'SELL'),'nx-coin-action');sell.disabled=!ready||!coin.CanSell||amount<1;sell.setAttribute('aria-label',coin.CanSell?`Sell ${coin.Label}`:`Sell ${coin.Label} unavailable`);if(!coin.CanSell)sell.title='The server does not allow sales of this currency.';
  const transfer=this.textButton('Transfer','',()=>this.openAmountSheet(coin,'TRANSFER'),'nx-coin-action');transfer.disabled=!ready||amount<1;transfer.setAttribute('aria-label',`Transfer ${coin.Label}`);
  actions.append(buy,sell,transfer);row.append(actions);return row;
 }
 pendingPanel(operation,message=''){
  const panel=el('section','nx-wallet-operation');panel.setAttribute('aria-label','Unresolved wallet operation');
  panel.append(el('span','nx-eyebrow','REFERENCE · DO NOT REPEAT'),el('h2','',operation?statusCopy[operation.Status]||statusCopy.unknown:'Wallet status needs review'));
  if(operation){
   const label=operation.Kind==='BUY'?'Purchase':operation.Kind==='SELL'?'Sale':'Transfer';
   panel.append(el('p','',`${label} · ${operation.CryptoId}${operation.Amount?` · ${formatNumber(operation.Amount)} units`:''}`));
   const exact=el('code','nx-operation-reference',operation.OperationId);panel.append(exact);
   panel.append(el('small','nx-operation-status','Server status: '+String(operation.Status||'unknown')));
  }
  if(message)panel.append(el('p','nx-restored-error-copy',message));
  if(!this.identityChanged&&operation?.OperationId){const check=this.textButton(this.writeBusy?'Checking…':'Check status','refresh',()=>this.checkStatus(operation.OperationId),'nx-inline-action');check.disabled=this.writeBusy;panel.append(check);}
  else if(!this.identityChanged&&!operation){panel.append(this.textButton('Check wallet status','refresh',()=>this.refresh(),'nx-inline-action'));}
  if(this.preview)panel.append(el('small','nx-preview-note','Synthetic status only · no live transaction exists.'));
  return panel;
 }
 outcomePanel(operation){
  const panel=el('section','nx-wallet-outcome');panel.setAttribute('role','status');
   const reason=operation.Status==='rejected'&&typeof operation.StatusMessage==='string'?operation.StatusMessage.trim().slice(0,240):'';
   const text=operation.Status==='complete'?(operation.Kind==='BUY'?'Purchase':operation.Kind==='SELL'?'Sale':'Transfer')+' confirmed by the server.':operation.Status==='refunded'?'The server confirmed the virtual balance was returned.':'The server confirmed the operation was rejected.';
  panel.append(el('strong','',this.preview?'Synthetic preview result':text),el('code','nx-operation-reference',operation.OperationId));
   if(reason)panel.append(el('p','nx-wallet-outcome-reason',reason));
  if(this.preview)panel.append(el('small','','No game wallet or server balance changed.'));
  return panel;
 }
 async refresh(){
  if(!this.alive||this.identityChanged)return;
  const sequence=++this.readSequence;this.catalogState='loading';this.walletState='loading';this.catalogError='';this.walletError='';this.render();
  const reference=this.pending?.OperationId;
  const reads=await Promise.allSettled([
   this.send('Crypto/GetCrypto',{}),this.send('Crypto/GetOperation',reference?{OperationId:reference}:{})
  ]);
  if(!this.alive||this.identityChanged||sequence!==this.readSequence)return;
  const [catalog,wallet]=reads;
  if(catalog.status==='rejected'){this.catalogState='error';this.catalogError=catalog.reason?.message||'The currency catalog could not be read.';}
  else try{this.catalog=normalizeCatalog(catalog.value);this.catalogState='ready';}catch(error){this.catalogState='error';this.catalogError=error.message;}
  if(wallet.status==='rejected'){this.walletState='error';this.walletError=wallet.reason?.message||'The character wallet could not be read.';}
  else try{
   const result=wallet.value;
   if(result?.Success!==true)throw Error(errorMessage(result,'The character wallet could not be read.'));
   this.balances=normalizeBalances(result.Balances);this.limits=normalizeLimits(result.Limits);this.walletBlocked=result.WalletReviewRequired===true;this.walletState='ready';this.lastUpdated=Date.now();
   const operation=operationFromServer(result.Operation);
   if(operation)this.applyStatus(operation,reference);
   else if(this.pending&&reference)this.pending={...this.pending,Status:'unknown'};
  }catch(error){this.walletState='error';this.walletError=error.message||'The character wallet returned invalid data.';}
  this.render();
 }
 onActivate(){if(this.alive&&!this.identityChanged)this.refresh();}
 applyStatus(operation,requestedId){
  if(requestedId&&operation.OperationId!==requestedId){this.walletState='error';this.walletError='The returned operation does not match the saved reference.';return;}
  this.pendingCorrupt=false;
  if(!this.pending){this.pending={...operation};}
  if(this.pending.OperationId!==operation.OperationId){this.walletBlocked=true;return;}
  this.pending={...this.pending,Status:operation.Status,Kind:operation.Kind,CryptoId:operation.CryptoId,Amount:operation.Amount||this.pending.Amount,Total:operation.Total||this.pending.Total};
  if(terminalStatuses.has(operation.Status)){
   this.lastOutcome={...this.pending,...operation};this.pending=null;this.pendingCorrupt=false;writeLocal(this.context,'crypto-pending',null);
  }else writeLocal(this.context,'crypto-pending',this.pending);
 }
 async checkStatus(operationId,{force=false}={}){
  if(!validId(operationId)||(this.writeBusy&&!force)||this.identityChanged)return;
  this.writeBusy=true;this.render();
  try{
   const result=await this.send('Crypto/GetOperation',{OperationId:operationId});
   if(!this.alive||this.identityChanged||this.pending?.OperationId!==operationId)return;
   if(result?.Success!==true)throw Error(errorMessage(result,'The server could not verify this operation.'));
   this.balances=normalizeBalances(result.Balances);this.limits=normalizeLimits(result.Limits);this.walletBlocked=result.WalletReviewRequired===true;const operation=operationFromServer(result.Operation);
   if(!operation||operation.OperationId!==operationId)throw Error('The server did not return the saved operation. Keep its reference and ask an administrator.');
   this.walletState='ready';this.lastUpdated=Date.now();this.applyStatus(operation,operationId);this.walletError='';
  }catch(error){if(this.alive&&!this.identityChanged){this.walletError=error.message||'The status check failed.';this.pending={...this.pending,Status:'unknown'};writeLocal(this.context,'crypto-pending',this.pending);}}
  finally{this.writeBusy=false;if(this.alive&&!this.identityChanged)this.render();}
 }
 openAmountSheet(coin,kind){
  if(this.pending||this.pendingCorrupt||this.walletBlocked||this.walletState!=='ready'||this.identityChanged)return;
  const title=kind==='BUY'?'Buy in-game currency':kind==='SELL'?'Sell in-game currency':'Transfer virtual currency';
  const panel=this.openSheet(title);panel.classList.add('nx-crypto-entry-sheet');
  panel.append(el('span','nx-eyebrow',coin.Id+' · '+coin.Label));
  const amount=el('label','nx-crypto-field');amount.append(el('span','',kind==='TRANSFER'?'Amount to transfer':'Amount in whole units'));
  const input=el('input');input.type='number';input.inputMode='numeric';input.min='1';input.step='1';const unitLimit=this.limits?.MaxCryptoUnits||MAX_CLIENT_INTEGER;input.max=String(Math.min(unitLimit,kind==='TRANSFER'?unitLimit:Math.floor((this.limits?.MaxTransfer||MAX_CLIENT_INTEGER)/coin.Cost)));input.value='1';input.autocomplete='off';input.setAttribute('aria-label','Amount in whole units');amount.append(input);panel.append(amount);
  let recipientField=null;
  if(kind==='TRANSFER'){
   recipientField=el('label','nx-crypto-field');recipientField.append(el('span','','Recipient phone'));
   const phone=el('input');phone.type='tel';phone.inputMode='tel';phone.maxLength=24;phone.autocomplete='off';phone.placeholder='Online character phone';phone.setAttribute('aria-label','Recipient phone');recipientField.append(phone);panel.append(recipientField);
  }
  const price=el('p','nx-crypto-price-preview',`Fixed unit price · ${formatBank(coin.Cost)}`);panel.append(price);
  if(kind!=='TRANSFER'){
   const update=()=>{const units=Number(input.value),total=units*coin.Cost;price.textContent=Number.isSafeInteger(units)&&units>0&&Number.isSafeInteger(total)?`Fixed unit price · ${formatBank(coin.Cost)} · total ${formatBank(total)}`:'Enter a positive whole-unit amount with a valid total.';};
   this.listen(input,'input',update);update();
  }
  const limitCopy=kind==='TRANSFER'?`${formatNumber(unitLimit)} units per operation.`:`${formatNumber(unitLimit)} units and ${formatBank(this.limits?.MaxTransfer||MAX_CLIENT_INTEGER)} maximum total.`;
  const actionCopy=kind==='BUY'?'This uses the character’s in-game bank balance.':kind==='SELL'?'A sale credits the character’s in-game bank balance.':'The recipient must be online. Transfers move virtual units between characters.';
  panel.append(el('p','nx-restored-footnote',`${actionCopy} Server limits: ${limitCopy}`));
  const review=this.textButton('Review '+(kind==='BUY'?'purchase':kind==='SELL'?'sale':'transfer'),'chevron',()=>{
   const units=Number(input.value);
   if(!Number.isSafeInteger(units)||units<1)throw Error('Enter a positive whole-unit amount.');
   if(units>unitLimit)throw Error(`The server limit is ${formatNumber(unitLimit)} units per operation.`);
   if((kind==='SELL'||kind==='TRANSFER')&&units>Number(this.balances?.[coin.Id]||0))throw Error('The character does not have enough units for this action.');
   if(kind!=='TRANSFER'&&(!Number.isSafeInteger(units*coin.Cost)||units*coin.Cost>(this.limits?.MaxTransfer||MAX_CLIENT_INTEGER)))throw Error('The fixed in-game total exceeds the server transaction limit.');
   const phone=kind==='TRANSFER'?normalizePhone(recipientField.querySelector('input').value):'';
   if(kind==='TRANSFER'&&!/^[0-9]{3,20}$/.test(phone))throw Error('Enter the phone number of an online character.');
   this.showReview({OperationId:newOperationId(),Kind:kind,CryptoId:coin.Id,Amount:units,UnitPrice:coin.Cost,Total:kind==='TRANSFER'?null:units*coin.Cost,Phone:phone,Label:coin.Label});
  },'nx-editor-submit nx-primary');panel.append(review);
 }
 showReview(draft){
  this.closeSheet();this.draft=draft;
  const title=draft.Kind==='BUY'?'Review purchase':draft.Kind==='SELL'?'Review sale':'Review transfer';
  const panel=this.openSheet(title);panel.classList.add('nx-crypto-review-sheet');
  panel.append(el('span','nx-eyebrow','IN-GAME VIRTUAL CURRENCY'),el('h2','',draft.Label),el('p','nx-crypto-review-row',`Operation · ${draft.Kind.toLowerCase()}`),el('p','nx-crypto-review-row',`Amount · ${formatNumber(draft.Amount)} ${draft.CryptoId} units`));
  if(draft.Kind==='TRANSFER')panel.append(el('p','nx-crypto-review-row','Recipient · '+draft.Phone));
  else panel.append(el('p','nx-crypto-review-row',`Fixed unit price · ${formatBank(draft.UnitPrice)}`),el('p','nx-crypto-review-total',`${draft.Kind==='BUY'?'Debit from':'Credit to'} in-game bank · ${formatBank(draft.Total)}`));
  panel.append(el('p','nx-crypto-disclaimer','These are fictional, character-owned game balances. This action does not connect to an external exchange or move real cryptocurrency.'));
  panel.append(el('p','nx-operation-reference','Reference · '+draft.OperationId));
  const confirm=this.textButton('Confirm '+(draft.Kind==='BUY'?'purchase':draft.Kind==='SELL'?'sale':'transfer'),'check',()=>this.submit(draft,confirm),'nx-editor-submit nx-primary nx-crypto-confirm');
  panel.append(confirm);
 }
 async submit(draft,button){
  if(this.writeBusy||this.pending||this.pendingCorrupt||this.walletBlocked||this.identityChanged)return;
  if(!validId(draft.OperationId))throw Error('A valid transaction reference is required.');
  const pending={OperationId:draft.OperationId,Kind:draft.Kind,CryptoId:draft.CryptoId,Amount:draft.Amount,UnitPrice:draft.UnitPrice,Total:draft.Total,Phone:draft.Phone,Status:'prepared'};
  if(!writeLocal(this.context,'crypto-pending',pending))throw Error('The operation reference could not be saved on this device. The wallet was not contacted.');
  this.pending=pending;this.lastOutcome=null;this.writeBusy=true;button.disabled=true;this.closeSheet();this.render();
  try{
   const route={BUY:'Crypto/BuyCrypto',SELL:'Crypto/SellCrypto',TRANSFER:'Crypto/TransferCrypto'}[draft.Kind];
   const payload={OperationId:draft.OperationId,CryptoId:draft.CryptoId,Amount:draft.Amount,...(draft.Kind==='TRANSFER'?{Phone:draft.Phone}:{})};
   const result=await this.send(route,payload);
   if(!this.alive||this.identityChanged||this.pending?.OperationId!==draft.OperationId)return;
   if(result?.PreviewOnly===true)this.pending={...this.pending,Status:String(result.Status||'unknown'),PreviewOnly:true};
   else if(result?.OperationId===draft.OperationId&&typeof result.Status==='string')this.pending={...this.pending,Status:result.Status};
    if(result?.PreviewOnly!==true&&result?.OperationId===draft.OperationId&&result.Status==='rejected'&&typeof result.Msg==='string'&&result.Msg.trim()){
     this.pending={...this.pending,StatusMessage:result.Msg.trim().slice(0,240)};
    }
   writeLocal(this.context,'crypto-pending',this.pending);
   await this.checkStatus(draft.OperationId,{force:true});
    // Exact status resolves this reference. Re-read unscoped wallet state after
    // a rejection so a different in-game operation still keeps the wallet blocked.
    if(result?.PreviewOnly!==true&&result?.OperationId===draft.OperationId&&result.Status==='rejected'
      &&!this.pending&&this.lastOutcome?.OperationId===draft.OperationId)await this.refresh();
  }catch(error){
   if(this.alive&&!this.identityChanged&&this.pending?.OperationId===draft.OperationId){
    this.pending={...this.pending,Status:'unknown'};writeLocal(this.context,'crypto-pending',this.pending);
    this.walletError='No final response was received. Keep this reference and check status before taking another action.';
   }
  }finally{this.writeBusy=false;if(this.alive&&!this.identityChanged)this.render();}
 }
 $destroy(){this.readSequence++;this.draft=null;super.$destroy();}
}

export {normalizeCatalog,normalizeBalances,normalizeLimits,validId as isValidCryptoOperationId};
