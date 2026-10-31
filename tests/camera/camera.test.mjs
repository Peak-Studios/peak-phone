import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL(`../../${path}`,import.meta.url),'utf8');

test('native photo camera keeps correlated server capture and snapshot cleanup',()=>{
 const lua=read('client/cl_camera.lua');
 assert.match(lua,/CreateMobilePhone\(1\)/);
 assert.match(lua,/CellCamActivate\(true,true\)/);
 assert.match(lua,/0x2491A93618B7D838,front/);
 assert.match(lua,/DestroyMobilePhone\(\)/);
 assert.match(lua,/restorePriorState\(ownsCurrentView\)/);
 assert.match(lua,/Peak\.SendCallback,'peak-phone:Server:Gallery:BeginCapture'/);
});

test('native camera owns its pose without competing scripted cameras or IK',()=>{
 const lua=read('client/cl_camera.lua');
 assert.doesNotMatch(lua,/\b(CreateCam|RenderScriptCams|DestroyCam|TaskPlayAnim|SetIkTarget)\s*\(/);
 assert.match(lua,/hand\.suspendForCamera/);
 const anim=read('client/cl_anim.lua');
 assert.match(anim,/not Phone\.Client\.Ready or InCamera then return end/);
});

test('camera framing drags cover both lenses and use confirmed native state',()=>{
 const ui=read('web/public/duo/camera-ui.mjs');
 assert.match(ui,/result\?\.Success===true&&typeof facing==='boolean'/);
 assert.match(ui,/send\('Phone\/CameraOrbit',delta\)/);
 assert.doesNotMatch(ui,/!this\.front\|\|event\.button/);
 assert.match(read('web/public/duo/shell.mjs'),/cameraUI\.setFacing\(data\.IsSelfie\)/);
});

test('camera controls size to the display and retain stale-exit recovery',()=>{
 assert.match(read('web/public/duo/camera-refresh.css'),/container-type:size/);
 assert.match(read('web/public/duo/camera-ui.mjs'),/this\.onExit\?\.\(\)/);
});

test('browser preview begins rear and keeps lens flips truthful',()=>{
 const preview=read('web/public/duo/preview.mjs');
 assert.match(preview,/let previewCameraIsSelfie=false/);
 assert.match(preview,/previewCameraIsSelfie=!previewCameraIsSelfie;return \{Success:true,IsSelfie:previewCameraIsSelfie\}/);
});
