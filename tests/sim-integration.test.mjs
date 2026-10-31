import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('all regenerated SIM and matched fold assets are shipped as RSC7 containers',()=>{
  const names=['peak_sim_phone_body.ydr','peak_sim_card.ydr','peak_sim_tray.ydr','peak_sim.ytyp','peak_sim_male.ycd','peak_sim_female.ycd','peak_sim_fold_male.ycd','peak_sim_fold_female.ycd'];
  for(const name of names) assert.equal(fs.readFileSync(path.join(root,'extras/peak-sim-assets/stream',name)).subarray(0,4).toString(),'RSC7',name);
});
test('phone uses the new body, sex-specific grip and matching fold dictionaries together',()=>{
  const shared=read('shared/duo_prop.lua'),hand=read('client/cl_duo_hand.lua'),manifest=read('fxmanifest.lua');
  assert.match(shared,/Body = 'peak_duo_body'/);assert.match(shared,/peak_sim_fold_male/);assert.match(shared,/peak_sim_fold_female/);
  assert.match(hand,/p\.FoldDictionary/);assert.match(hand,/p\.FoldPrefix/);assert.match(manifest,/'peak-sim-assets'/);
});
test('SIM UI is prepare-play-commit and durable state is not changed at begin',()=>{
  const bridge=read('client/cl_devices.lua'),server=read('server/sv_devices.lua');
  assert.ok(bridge.indexOf('devices:simBegin')<bridge.indexOf('Phone.SimGesture.run'));assert.ok(bridge.indexOf('Phone.SimGesture.run')<bridge.indexOf('devices:simCommit'));
  const begin=server.slice(server.indexOf("devices:simBegin"),server.indexOf("devices:simCancel"));assert.doesNotMatch(begin,/UPDATE peak_phone_devices/);
  assert.match(server,/op\.completed/);assert.match(server,/simBusy\(src\)/);assert.match(server,/op\.expires/);
});
test('observer implementation moves props but never tasks another ped',()=>{
  const gesture=read('client/cl_sim_gesture.lua'),prop=read('client/cl_duo_prop.lua');
  const adapter=read('extras/peak-sim-assets/client.lua');
  assert.doesNotMatch(gesture,/TaskPlayAnim/);assert.doesNotMatch(gesture,/GetEntityAnimCurrentTime/);
  assert.match(gesture,/local t=math\.min\(3\.0,elapsed\/1000\)/);
  assert.match(adapter,/GetEntityAnimCurrentTime/);assert.match(prop,/simOperation/);assert.match(prop,/simTray/);
});
