import test from 'node:test';
import assert from 'node:assert/strict';
import {copyText} from '../web/public/duo/clipboard.mjs';

function clipboardDocument(result = true) {
  const editor = {isConnected:true,selectionStart:2,selectionEnd:4,selectionDirection:'forward',focus(){this.focused=true;},setSelectionRange(start,end,direction){this.range=[start,end,direction];}};
  const state = {appended:false,removed:false,copied:null};
  const field = {style:{},setAttribute(){},focus(){},select(){},remove(){state.removed=true;}};
  const doc = {activeElement:editor,body:{append(node){assert.equal(node,field);state.appended=true;}},createElement(tag){assert.equal(tag,'textarea');return field;},execCommand(command){assert.equal(command,'copy');state.copied=field.value;return result;}};
  return {doc,editor,state};
}

test('FiveM CEF copy uses the active click and restores an editor without showing a select sheet',async()=>{
  const {doc,editor,state}=clipboardDocument();
  let modernCalls=0;
  assert.equal(await copyText('5550102002',{doc,nav:{clipboard:{writeText(){modernCalls++;}}}}),true);
  assert.equal(state.copied,'5550102002');assert.equal(state.appended,true);assert.equal(state.removed,true);
  assert.equal(editor.focused,true);assert.deepEqual(editor.range,[2,4,'forward']);assert.equal(modernCalls,0);
});

test('Clipboard API is used when legacy copy is blocked',async()=>{
  const {doc,state}=clipboardDocument(false);let modern='';
  assert.equal(await copyText('Waypoint 10, 20',{doc,nav:{clipboard:{async writeText(value){modern=value;}}}}),true);
  assert.equal(modern,'Waypoint 10, 20');assert.equal(state.removed,true);
});

test('a browser that rejects both copy paths never reports success',async()=>{
  const {doc,state}=clipboardDocument(false);
  assert.equal(await copyText('private text',{doc,nav:{clipboard:{async writeText(){throw Error('blocked');}}}}),false);
  assert.equal(state.removed,true);
  assert.equal(await copyText('private text',{doc:null,nav:{}}),false);
});
