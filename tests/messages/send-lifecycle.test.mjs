import test from 'node:test';
import assert from 'node:assert/strict';
import {MessagesApp,groupPermissions} from '../../web/public/duo/messages-app.mjs';
import {readLocal,writeLocal} from '../../web/public/duo/native-kit.mjs';

function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};}
function withStorage(run){const original=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),values=new Map();Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)}});return Promise.resolve().then(()=>run(values)).finally(()=>{if(original)Object.defineProperty(globalThis,'localStorage',original);else delete globalThis.localStorage;});}
function makeApp(){const app=Object.create(MessagesApp.prototype),calls={checked:[],banks:[],receipts:[],notices:[],closed:0,loaded:0};Object.assign(app,{alive:true,context:{identity:'cid-1',server:'test'},thread:{kind:'direct',id:'5550000002',title:'Jordan'},threadEpoch:4,replyTo:17,calls,send:async(route,payload)=>{calls.bank={route,payload};calls.banks.push({route,payload});return {Success:true}},checked:async(route,payload)=>{calls.checked.push({route,payload});return {Success:true,RequestId:42}},sendThreadMessage:async(payload,attachments,destination)=>{calls.receipts.push({payload,attachments,destination});calls.checked.push({route:destination.kind==='group'?'Groups/SendMessage':'Messages/SendMessage',payload:{...(destination.kind==='group'?{GroupId:destination.id}:{Phone:destination.id}),...payload,Attachments:attachments}});return {Success:true}},closeSheet(){calls.closed++},loadThread:async()=>{calls.loaded++},notify(message){calls.notices.push(message)}});return app;}

test('a delayed transfer receipt stays in its captured conversation after switching threads',async()=>withStorage(async()=>{
 const app=makeApp(),bank=deferred(),destination=app.captureDestination();app.send=()=>bank.promise;
 const operation=app.sendCash(destination,'5550000002',25,'Dinner',{});
 app.thread={kind:'direct',id:'5550000003',title:'Taylor'};app.threadEpoch++;
 bank.resolve({Success:true,OperationId:'operation-1234567890'});await operation;
 assert.equal(app.calls.checked[0].route,'Messages/SendMessage');assert.equal(app.calls.checked[0].payload.Phone,'5550000002');assert.equal(app.calls.closed,0);assert.equal(app.calls.loaded,0);
}));

test('a delayed request response posts its receipt to the captured conversation',async()=>withStorage(async()=>{
 const app=makeApp(),request=deferred(),destination=app.captureDestination();app.checked=async(route,payload)=>{if(route==='Wenmo/CreateRequest')return request.promise;app.calls.checked.push({route,payload});return {Success:true}};
 const operation=app.requestCash(destination,'5550000002',25,'Dinner',{});
 app.thread={kind:'group',id:'GRP77777777',title:'New group'};app.threadEpoch++;
 request.resolve({Success:true,RequestId:42});await operation;
 assert.equal(app.calls.checked.at(-1).route,'Messages/SendMessage');assert.equal(app.calls.checked.at(-1).payload.Phone,'5550000002');assert.equal(app.calls.closed,0);assert.equal(app.calls.loaded,0);
}));

test('a delayed request payment response cannot route its receipt to a newer thread',async()=>withStorage(async()=>{
 const app=makeApp(),payment=deferred(),destination=app.captureDestination();app.send=()=>payment.promise;
 const operation=app.payRequest({requestId:77},destination);
 app.thread={kind:'group',id:'GRP77777777',title:'New group'};app.threadEpoch++;
 payment.resolve({Success:true,OperationId:'payment-1234567890'});await operation;
 assert.equal(app.calls.checked[0].route,'Messages/SendMessage');assert.equal(app.calls.checked[0].payload.Phone,'5550000002');assert.equal(app.calls.closed,0);assert.equal(app.calls.loaded,0);
}));

test('stale text completion preserves the newer reply and does not reload the new thread',async()=>withStorage(async()=>{
 const app=makeApp(),send=deferred(),destination=app.captureDestination(),input={value:'hello'};app.checked=()=>send.promise;
 writeLocal(app.context,'messages-draft:direct:5550000002',{text:'hello',nonce:'text-operation-123456'});
 const operation=app.sendTextMessage('hello','text-operation-123456',17,destination,input);
 app.thread={kind:'direct',id:'5550000003',title:'Taylor'};app.threadEpoch++;app.replyTo=99;
 send.resolve({Success:true});await operation;
 assert.equal(app.replyTo,99);assert.equal(input.value,'hello');assert.equal(app.calls.loaded,0);
}));

test('a failed receipt retains the original destination with the committed transfer',async()=>withStorage(async()=>{
 const app=makeApp(),destination=app.captureDestination();app.sendThreadMessage=async()=>{throw Error('network timeout')};
 await assert.rejects(app.sendCash(destination,'5550000002',25,'Dinner',{}),/receipt is not in Messages yet/);
 const pending=readLocal(app.context,'messages-cash:direct:5550000002',null);
 assert.equal(pending.state,'receipt');assert.equal(pending.destination.kind,'direct');assert.equal(pending.destination.id,'5550000002');assert.equal(pending.destination.identity,'cid-1');
}));

test('a terminal transfer rejection keeps its audit reference and a reviewed retry gets a new operation',async()=>withStorage(async()=>{
 const app=makeApp(),destination=app.captureDestination(),results=[{Success:false,Status:'rejected',Msg:'Insufficient balance.'},{Success:true,OperationId:'bank-commit-01'}];app.send=async(route,payload)=>{app.calls.banks.push({route,payload});return results.shift();};
 await assert.rejects(app.sendCash(destination,'5550000002',25,'Dinner',{}),/Transfer reference .* was rejected/);
 const first=app.calls.banks[0].payload.OperationId;assert.equal(readLocal(app.context,'messages-cash:direct:5550000002',null),null);
 const audit=readLocal(app.context,'messages-cash-audit:direct:5550000002',[]);assert.equal(audit[0].operationId,first);assert.equal(audit[0].status,'rejected');
 await app.sendCash(destination,'5550000002',25,'Dinner',{});const retry=app.calls.banks[1].payload.OperationId;assert.notEqual(retry,first);assert.equal(app.calls.receipts.length,1);
}));

test('an ambiguous transfer remains bound to its exact operation and cannot create a fresh attempt',async()=>withStorage(async()=>{
 const app=makeApp(),destination=app.captureDestination(),results=[{Success:false,Status:'review',Msg:'Outcome under review.'},{Success:false,Msg:'Bridge unavailable.'},{Success:false,Status:'credit_pending',Msg:'Credit is pending.'}];app.send=async(route,payload)=>{app.calls.banks.push({route,payload});return results.shift();};
 await assert.rejects(app.sendCash(destination,'5550000002',25,'Dinner',{}),/retry only this same transfer/);const pending=readLocal(app.context,'messages-cash:direct:5550000002',null),operation=pending.operationId;
 await assert.rejects(app.sendCash(destination,'5550000003',25,'Dinner',{}),/different transfer/);await assert.rejects(app.sendCash(destination,'5550000002',25,'Dinner',{}),/retry only this same transfer/);
 await assert.rejects(app.sendCash(destination,'5550000002',25,'Dinner',{}),/retry only this same transfer/);assert.equal(app.calls.banks.length,3);assert.ok(app.calls.banks.every(call=>call.payload.OperationId===operation));assert.deepEqual(readLocal(app.context,'messages-cash-audit:direct:5550000002',[]),[]);
}));

test('a refunded request payment retains its audit reference and a later pay gets a new operation',async()=>withStorage(async()=>{
 const app=makeApp(),destination=app.captureDestination(),results=[{Success:false,Status:'refunded',Msg:'The payment was refunded.'},{Success:true,OperationId:'payment-commit-01'}];app.send=async(route,payload)=>{app.calls.banks.push({route,payload});return results.shift();};
 await app.payRequest({requestId:77},destination);const first=app.calls.banks[0].payload.OperationId;assert.equal(readLocal(app.context,'messages-pay-request:77',null),null);
 const audit=readLocal(app.context,'messages-cash-audit:direct:5550000002',[]);assert.equal(audit[0].operationId,first);assert.equal(audit[0].status,'refunded');assert.match(app.calls.notices[0],new RegExp(first));
 await app.payRequest({requestId:77},destination);assert.notEqual(app.calls.banks[1].payload.OperationId,first);assert.equal(app.calls.receipts.length,1);
}));

test('review and unknown request-payment failures keep the same operation locked',async()=>withStorage(async()=>{
 const app=makeApp(),destination=app.captureDestination(),results=[{Success:false,Status:'review',Msg:'Outcome under review.'},{Success:false,Msg:'No response status.'}];app.send=async(route,payload)=>{app.calls.banks.push({route,payload});return results.shift();};
 await app.payRequest({requestId:88},destination);const pending=readLocal(app.context,'messages-pay-request:88',null),operation=pending.operationId;
 await app.payRequest({requestId:88},destination);assert.equal(app.calls.banks.length,2);assert.equal(app.calls.banks[1].payload.OperationId,operation);assert.equal(readLocal(app.context,'messages-pay-request:88',null).operationId,operation);assert.deepEqual(readLocal(app.context,'messages-cash-audit:direct:5550000002',[]),[]);
}));

test('destroyed Messages keeps a committed transfer receipt retry in its original identity scope',async()=>withStorage(async()=>{
 const app=makeApp(),destination=app.captureDestination(),bank=deferred();app.send=()=>bank.promise;
 const operation=app.sendCash(destination,'5550000002',25,'Dinner',{});app.context.identity='cid-2';app.alive=false;bank.resolve({Success:true,OperationId:'committed-transfer-123'});await operation;
 const original={server:'test',identity:'cid-1'};const receipt=readLocal(original,'messages-cash:direct:5550000002',null);
 assert.equal(receipt.state,'receipt');assert.equal(receipt.operationId,'committed-transfer-123');assert.equal(app.calls.receipts.length,0);assert.equal(app.calls.notices.length,0);assert.equal(app.calls.loaded,0);assert.equal(app.calls.closed,0);
}));

test('destroyed Messages keeps a created request receipt retry in its original identity scope',async()=>withStorage(async()=>{
 const app=makeApp(),destination=app.captureDestination(),created=deferred();app.checked=route=>route==='Wenmo/CreateRequest'?created.promise:Promise.resolve({Success:true});
 const operation=app.requestCash(destination,'5550000002',25,'Dinner',{});app.context.identity='cid-2';app.alive=false;created.resolve({Success:true,RequestId:314});await operation;
 const receipt=readLocal({server:'test',identity:'cid-1'},'messages-cash-request:direct:5550000002',null);
 assert.equal(receipt.state,'receipt');assert.equal(receipt.requestId,314);assert.equal(app.calls.receipts.length,0);assert.equal(app.calls.notices.length,0);assert.equal(app.calls.loaded,0);assert.equal(app.calls.closed,0);
}));

test('destroyed Messages keeps a completed payment receipt retry in its original identity scope',async()=>withStorage(async()=>{
 const app=makeApp(),destination=app.captureDestination(),paid=deferred();app.send=()=>paid.promise;
 const operation=app.payRequest({requestId:88},destination);app.context.identity='cid-2';app.alive=false;paid.resolve({Success:true,OperationId:'committed-payment-456'});await operation;
 const receipt=readLocal({server:'test',identity:'cid-1'},'messages-pay-request:88',null);
 assert.equal(receipt.state,'receipt');assert.equal(receipt.requestId,88);assert.equal(receipt.operationId,'committed-payment-456');assert.equal(app.calls.receipts.length,0);assert.equal(app.calls.notices.length,0);assert.equal(app.calls.loaded,0);assert.equal(app.calls.closed,0);
}));

test('group controls follow the viewer role and protect creators and peer admins',()=>{
 const members=[{phone:'creator',is_creator:true,is_admin:true},{phone:'viewer',is_creator:false,is_admin:true},{phone:'admin',is_creator:false,is_admin:true},{phone:'member',is_creator:false,is_admin:false}];
 const adminView={members,is_creator:false},creatorView={members,is_creator:true},ordinary=members[3],peerAdmin=members[2],creator=members[0];
 assert.equal(groupPermissions(adminView,'viewer').canManageMembers,true);assert.equal(groupPermissions(adminView,'viewer',ordinary).canRemove,true);assert.equal(groupPermissions(adminView,'viewer',peerAdmin).canRemove,false);assert.equal(groupPermissions(adminView,'viewer',peerAdmin).canToggleAdmin,false);assert.equal(groupPermissions(adminView,'viewer',creator).canRemove,false);
 assert.equal(groupPermissions(adminView,'member').canManageMembers,false);assert.equal(groupPermissions(adminView,'member',peerAdmin).canRemove,false);assert.equal(groupPermissions(creatorView,'creator',peerAdmin).canToggleAdmin,true);assert.equal(groupPermissions(creatorView,'creator',peerAdmin).canRemove,true);assert.equal(groupPermissions(creatorView,'creator',creator).canRemove,false);
});
