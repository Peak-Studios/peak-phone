import test from 'node:test';
import assert from 'node:assert/strict';
import {AppSwitcherHistory,cycleQuickSwitch,sanitizeAppPreview} from '../web/public/duo/app-switcher.mjs';

class FakeElement {
  constructor(tag,attributes={},children=[]) {
    this.tagName=tag.toUpperCase();this.tag=this.tagName.toLowerCase();this.attrs=new Map(Object.entries(attributes));
    this.children=[];this.parentElement=null;this.value=attributes.value||'';this._disabled=false;this.style={removeProperty(){}};
    this.disabled=Object.hasOwn(attributes,'disabled');for(const child of children)this.append(child);
  }
  get attributes(){return [...this.attrs].map(([name,value])=>({name,value}));}
  get childNodes(){return this.children;}
  get disabled(){return this._disabled;}
  set disabled(value){this._disabled=!!value;if(this._disabled)this.attrs.set('disabled','');}
  append(child){child.parentElement=this;this.children.push(child);return child;}
  cloneNode(deep=false){const copy=new FakeElement(this.tag,Object.fromEntries(this.attrs));copy.value=this.value;copy._disabled=this._disabled;if(deep)for(const child of this.children)copy.append(child.cloneNode(true));return copy;}
  querySelectorAll(selector){if(selector!=='*')throw Error(`Unsupported selector ${selector}`);const all=[];const visit=node=>{for(const child of node.children){all.push(child);visit(child);}};visit(this);return all;}
  matches(selector){return selector.split(',').some(raw=>{const part=raw.trim().toLowerCase();if(part==='[tabindex]')return this.attrs.has('tabindex');const typed=part.match(/^([a-z]+)\[type=([a-z]+)\]$/);return typed?this.tag===typed[1]&&this.attrs.get('type')===typed[2]:this.tag===part;});}
  setAttribute(name,value){this.attrs.set(name,String(value));}
  getAttribute(name){return this.attrs.get(name)??null;}
  removeAttribute(name){this.attrs.delete(name);}
  remove(){if(!this.parentElement)return;const parent=this.parentElement;parent.children=parent.children.filter(child=>child!==this);this.parentElement=null;}
  replaceWith(...nodes){if(!this.parentElement)return;const parent=this.parentElement,index=parent.children.indexOf(this);parent.children.splice(index,1,...nodes);this.parentElement=null;for(const node of nodes)node.parentElement=parent;}
  get outerHTML(){const attrs=[...this.attrs].map(([name,value])=>value===''?` ${name}`:` ${name}="${String(value).replaceAll('&','&amp;').replaceAll('"','&quot;')}"`).join('');const body=this.children.map(child=>child.outerHTML).join('');return `<${this.tag}${attrs}>${body}</${this.tag}>`;}
}

test('AppSwitcherHistory maintains bounded most-recent-first entries and volatile previews',()=>{
 const history=new AppSwitcherHistory(3);
 assert.deepEqual(history.remember('maps','<div>map</div>'),[]);
 history.remember('messages','<div>draft-free</div>');history.remember('maps','<div>new map</div>');
 assert.deepEqual(history.list(),['maps','messages']);assert.equal(history.preview('maps'),'<div>new map</div>');
 assert.deepEqual(history.remember('mails','<div>mail</div>'),[]);
 assert.deepEqual(history.remember('calculator','<div>calc</div>'),['messages']);
 assert.deepEqual(history.list(),['calculator','mails','maps']);assert.equal(history.preview('messages'),'');
 history.activate('mails');assert.deepEqual(history.list(),['calculator','maps']);assert.equal(history.preview('mails'),'');
 assert.equal(history.dismiss('maps'),true);assert.equal(history.dismiss('missing'),false);assert.deepEqual(history.list(),['calculator']);
 history.clear();assert.deepEqual(history.list(),[]);assert.equal(history.preview('calculator'),'');
});

test('quick switching starts with the newest recent app in either direction, then follows a stable cycle',()=>{
 const first=cycleQuickSwitch('home',['maps','messages','mails'],1);assert.equal(first.target,'maps');
 const second=cycleQuickSwitch('maps',['home','messages','mails'],1,first);assert.equal(second.target,'messages');
 const third=cycleQuickSwitch('messages',['maps','home','mails'],1,second);assert.equal(third.target,'mails');
 const fourth=cycleQuickSwitch('mails',['messages','maps','home'],1,third);assert.equal(fourth.target,'home');
 const backwards=cycleQuickSwitch('home',['maps','messages','mails'],-1);assert.equal(backwards.target,'maps');
 assert.equal(cycleQuickSwitch('home',['maps'],-1).target,'maps');assert.equal(cycleQuickSwitch('home',['maps'],1).target,'maps');
 assert.equal(cycleQuickSwitch('home',[],1).target,null);
});

test('preview sanitizer strips interactive identity and remote actions but keeps local appearance',()=>{
 const input=new FakeElement('input',{id:'draft',name:'message',type:'password',value:'secret',autofocus:''});
 const button=new FakeElement('button',{id:'send',onclick:'steal()',tabindex:'0'});
 const link=new FakeElement('a',{href:'javascript:alert(1)',target:'_blank'});
 const image=new FakeElement('img',{src:'/duo/icons/map.png',alt:'Map'});
 const remoteImage=new FakeElement('img',{src:'https://tracker.invalid/pixel.png'});
 const form=new FakeElement('form',{id:'compose',action:'/send'},[input,button,link]);
 const script=new FakeElement('script',{},[]);
  const draftOverlay=new FakeElement('span',{class:'duo-mirror-control-overlay'},[new FakeElement('span',{class:'duo-mirror-control-text'})]);
  const app=new FakeElement('section',{'data-app':'messages',id:'live-messages',onclick:'run()'},[form,image,remoteImage,script,draftOverlay]);
 const markup=sanitizeAppPreview(app,'https://phone.test/duo/index.html');
 assert.match(markup,/data-app="messages"/);assert.match(markup,/src="\/duo\/icons\/map\.png"/);
  assert.doesNotMatch(markup,/id=|name=|autofocus|onclick|javascript:|target=|action=|tracker\.invalid|<script|<form|duo-mirror-control/);
 for(const tag of ['input','button']){const opening=markup.match(new RegExp(`<${tag}[^>]*>`))?.[0]||'';assert.match(opening,/disabled/);assert.match(opening,/tabindex="-1"/);assert.match(opening,/aria-hidden="true"/);}
 assert.doesNotMatch(markup,/value="secret"/);
});
