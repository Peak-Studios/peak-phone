import test from 'node:test';
import assert from 'node:assert/strict';
import {bindVerticalSlider} from '../web/public/duo/control-center.mjs';
class Input extends EventTarget {
 min='20'; max='100'; value='50'; disabled=false; isConnected=true;
 focus() {} setPointerCapture(id){this.pointer=id;} hasPointerCapture(id){return this.pointer===id;} releasePointerCapture(){this.pointer=null;}
 getBoundingClientRect(){return {bottom:200,height:100,left:100,width:100};}
}
function fixture(options={}){const input=new Input();let pending,id=0,changes=0,updates=0;const stop=bindVerticalSlider(input,{request:fn=>(pending=fn,++id),cancel:()=>pending=null,...options});input.addEventListener('input',()=>updates++);input.addEventListener('change',()=>changes++);return {input,stop,step(time){const fn=pending;pending=null;fn?.(time);},get changes(){return changes},get updates(){return updates}};}
function emit(target,name,props={}){const e=new Event(name,{cancelable:true});Object.assign(e,props);target.dispatchEvent(e);return e;}
test('held arrows use elapsed animation time, ignore OS repeat, clamp and stop on release',()=>{
 const f=fixture();emit(f.input,'keydown',{key:'ArrowUp',repeat:false});f.step(0);for(let t=20;t<=1000;t+=20)f.step(t);assert.equal(Number(f.input.value),86);emit(f.input,'keydown',{key:'ArrowUp',repeat:true});assert.equal(Number(f.input.value),86);emit(f.input,'keyup',{key:'ArrowUp'});f.step(1200);assert.equal(Number(f.input.value),86);assert.equal(f.changes,1);assert(f.updates>20);
 emit(f.input,'keydown',{key:'ArrowDown'});f.step(2000);for(let t=2020;t<=5000;t+=20)f.step(t);assert.equal(Number(f.input.value),20);f.stop();assert.equal(f.changes,2);
});
test('pointer drag maps vertical height independently of native CEF range orientation',()=>{
 const f=fixture();emit(f.input,'pointerdown',{button:0,pointerId:1,clientY:150});assert.equal(Number(f.input.value),50);emit(f.input,'pointermove',{pointerId:1,clientY:120});assert.equal(Number(f.input.value),80);emit(f.input,'pointerup',{pointerId:1});assert.equal(f.changes,1);emit(f.input,'pointermove',{pointerId:1,clientY:100});assert.equal(Number(f.input.value),80);
});
test('blur and removal cancel a held key; disabled controls cannot start',()=>{
 const f=fixture();emit(f.input,'keydown',{key:'ArrowDown'});emit(f.input,'blur');f.step(1000);assert.equal(Number(f.input.value),49);assert.equal(f.changes,1);f.input.disabled=true;emit(f.input,'keydown',{key:'ArrowUp'});assert.equal(Number(f.input.value),49);
 f.input.disabled=false;emit(f.input,'keydown',{key:'ArrowUp'});f.input.isConnected=false;f.step(1200);assert.equal(f.changes,2);
});

test('Settings brightness uses horizontal geometry with the same held-key engine',()=>{const f=fixture({vertical:false});emit(f.input,'pointerdown',{button:0,pointerId:1,clientX:150});assert.equal(Number(f.input.value),60);emit(f.input,'pointermove',{pointerId:1,clientX:200});assert.equal(Number(f.input.value),100);emit(f.input,'pointerup',{pointerId:1});assert.equal(f.changes,1);});
