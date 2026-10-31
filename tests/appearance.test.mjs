import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createAppearance, resolveAppearance} from '../web/public/duo/appearance.mjs';
import {wallpaperInkRegions} from '../web/public/duo/wallpaper-ink.mjs';

test('automatic appearance follows system changes, explicit choices persist and ignore them', () => {
  const previous = globalThis.document;
  globalThis.document = {querySelectorAll:()=>[]};
  try {
    let saved='system', listener, updates=0;
    const media={matches:false,addEventListener:(_,fn)=>listener=fn,removeEventListener:(_,fn)=>assert.equal(fn,listener)};
    const root={dataset:{},style:{}};
    const controller=createAppearance({root,read:()=>saved,write:(_,v)=>saved=v,media,changed:()=>updates++});
    assert.equal(root.dataset.theme,'light');
    media.matches=true;listener();assert.equal(root.dataset.theme,'dark');
    controller.set('light');assert.equal(saved,'light');
    listener();assert.equal(root.dataset.theme,'light');assert.equal(updates,3);
    assert.throws(()=>controller.set('invalid'));assert.equal(saved,'light');
    controller.destroy();
  } finally {globalThis.document=previous;}
});

test('invalid persisted appearance safely resolves to dark',()=>{
  for(const value of [null,{},'unknown'])assert.equal(resolveAppearance(value,false),'dark');
});

test('Photos cache revisions invalidate both stylesheet graphs and the DUI entry',()=>{
  const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
  const index=read('../web/public/index.html'),mirror=read('../web/public/duo/physical-screen.mjs');
  const mirrorHtml=read('../web/public/duo/physical-screen.html'),dui=read('../client/cl_duo_prop.lua');
  for(const [name,revision] of [['photos','photos-theme-20261015'],['app-editor-families','app-editor-families-theme-20261015']]){
    assert.ok(index.includes(`./duo/${name}.css?rev=${revision}`),`NUI must load the current ${name} stylesheet`);
    assert.ok(mirror.includes(`s==='${name}'?'?rev=${revision}'`),`physical display must load the current ${name} stylesheet`);
  }
  assert.ok(mirrorHtml.includes('physical-screen.mjs?rev=phone-f05-calculator-safe-area-photos-notes-20261016c'));
  assert.ok(dui.includes('physical-screen.html?slot=%d&rev=phone-f05-calculator-safe-area-photos-notes-20261016c'));
});

test('wallpaper sampling chooses contrasting ink independently for each home zone',()=>{
  const pixels=(color)=>{const out=new Uint8ClampedArray(32*32*4);for(let i=0;i<out.length;i+=4){out[i]=color[0];out[i+1]=color[1];out[i+2]=color[2];out[i+3]=255;}return out;};
  assert.deepEqual(wallpaperInkRegions(pixels([255,255,255]),32,32),{status:'dark',heading:'dark',grid:'dark'});
  assert.deepEqual(wallpaperInkRegions(pixels([0,0,0]),32,32),{status:'light',heading:'light',grid:'light'});
  assert.equal(wallpaperInkRegions(pixels([160,160,160]),32,32).grid,'light');
  const mixed=pixels([8,8,8]);for(let y=0;y<32;y++)for(let x=0;x<32;x++){const i=(y*32+x)*4;if(y<12)for(let c=0;c<3;c++)mixed[i+c]=255;}
  assert.equal(wallpaperInkRegions(mixed,32,32).status,'dark');
  assert.equal(wallpaperInkRegions(mixed,32,32).grid,'light');
});

function auditColorPair(foreground,background) {
  const box={left:0,top:0,right:100,bottom:100,width:100,height:100};
  const text={tagName:'P',classList:[],childNodes:[{nodeType:3,textContent:'Readable label'}],parentElement:null,
    closest:()=>null,checkVisibility:()=>true,getBoundingClientRect:()=>box};
  const root={tagName:'MAIN',classList:[],parentElement:null,querySelectorAll:()=>[text],getBoundingClientRect:()=>box};text.parentElement=root;
  const styles=new Map([[text,{color:foreground,backgroundColor:'rgba(0, 0, 0, 0)',backgroundImage:'none',opacity:'1',fontSize:'16px',fontWeight:'400'}],
    [root,{color:'rgb(0, 0, 0)',backgroundColor:background,backgroundImage:'none',opacity:'1',fontSize:'16px',fontWeight:'400'}]]);
  const context={window:{},document:{},getComputedStyle:node=>styles.get(node)};
  vm.runInNewContext(readFileSync(new URL('./appearance/contrast-audit.js',import.meta.url),'utf8'),context);
  return context.window.auditPhoneContrast(root);
}

test('contrast audit measures normalized color(srgb) channels instead of treating them as RGB bytes',()=>{
  const numeric=auditColorPair('rgb(28, 28, 30)','color(srgb 0.9 0.940784 0.985098)');
  assert.equal(numeric.measured,1);assert.equal(numeric.failures.length,0);assert.equal(numeric.unmeasured.length,0);
  const percent=auditColorPair('rgb(28 28 30)','color(srgb 90% 94.0784% 98.5098% / 100%)');
  assert.equal(percent.measured,1);assert.equal(percent.failures.length,0);assert.equal(percent.unmeasured.length,0);
  const lowContrast=auditColorPair('rgb(255 255 255)','color(srgb .6 .6 .6)');
  assert.equal(lowContrast.measured,1);assert.equal(lowContrast.failures.length,1);
  assert.ok(Math.abs(lowContrast.failures[0].background[0]-153)<0.01);
  assert.ok(lowContrast.failures[0].ratio>2.8&&lowContrast.failures[0].ratio<2.9,`unexpected normalized sRGB contrast ratio ${lowContrast.failures[0].ratio}`);
});

test('contrast audit clamps signed exponent RGB inputs, composites percentage alpha and flags unsupported profiles as unmeasured',()=>{
  const translucent=auditColorPair('rgb(-1e1 0% 0 / 50%)','rgb(100%, 100%, 100%)');
  assert.equal(translucent.measured,1);assert.equal(translucent.failures.length,1);
  assert.ok(Math.abs(translucent.failures[0].background[0]-255)<0.01);
  assert.ok(translucent.failures[0].ratio>3.9&&translucent.failures[0].ratio<4.1,`unexpected alpha composite ratio ${translucent.failures[0].ratio}`);
  const unsupported=auditColorPair('rgb(28, 28, 30)','color(display-p3 0.9 0.94 0.98)');
  assert.equal(unsupported.measured,0);assert.equal(unsupported.failures.length,0);
  assert.match(unsupported.unmeasured[0].reason,/unsupported CSS color syntax or profile/);
});
