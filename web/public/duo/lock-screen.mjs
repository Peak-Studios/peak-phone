// iOS-style lock screen: a glanceable clock that opens a passcode keypad.
// PINs are 4–6 digits (validated on the server); six digits submit automatically.
const KEYS=[['1',''],['2','ABC'],['3','DEF'],['4','GHI'],['5','JKL'],['6','MNO'],['7','PQRS'],['8','TUV'],['9','WXYZ']];
const MIN=4,MAX=6;
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;};

export class LockScreen {
 constructor({bank,send,onUnlock,icon}){
  this.send=send;this.onUnlock=onUnlock;this.icon=icon;this.busy=false;this.clockTimer=0;
  this.node=el('section','duo-lock-screen');this.node.setAttribute('aria-label','Phone lock screen');this.node.tabIndex=-1;
  bank.append(this.node);this.node.hidden=true;
  this.node.addEventListener('keydown',event=>this.onKey(event));
 }
 setWallpaper(value){this.node.style.setProperty('--duo-lock-wallpaper',value?`url(${JSON.stringify(value)})`:'');}
 show(generation){this.generation=generation;this.mode='unlock';this.stage='lock';this.node.hidden=false;this.render();}
 hide(){this.node.hidden=true;clearInterval(this.clockTimer);this.clockTimer=0;this.node.replaceChildren();}

 render(){
  clearInterval(this.clockTimer);this.clockTimer=0;
  this.node.dataset.stage=this.mode==='unlock'?this.stage:'card';
  this.node.replaceChildren();
  if(this.mode!=='unlock')return this.renderCard();
  if(this.stage==='lock')return this.renderGlance();
  this.renderPasscode();
 }

 renderGlance(){
  const glance=el('div','duo-lock-glance'),mark=el('div','duo-lock-mark'),date=el('p','duo-lock-date'),time=el('h1','duo-lock-time');
  mark.innerHTML=this.icon('lock');glance.append(mark,date,time);
  const tick=()=>{const now=new Date();date.textContent=now.toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'});time.textContent=now.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit',hour12:false});};
  tick();this.clockTimer=setInterval(tick,15000);
  const reveal=el('button','duo-lock-reveal');reveal.type='button';reveal.setAttribute('aria-label','Open passcode keypad');
  reveal.append(el('span','duo-lock-hint','Swipe up or tap to unlock'),el('span','duo-lock-bar'));
  this.node.append(glance,reveal);
  // Swipe up anywhere (or click/tap) opens the keypad.
  let startY=null;
  this.node.onpointerdown=event=>{startY=event.clientY;};
  this.node.onpointerup=event=>{if(startY==null)return;const moved=startY-event.clientY;startY=null;if(this.stage==='lock'&&(moved>30||Math.abs(moved)<6))this.openPasscode();};
  this.node.focus({preventScroll:true});
 }

 openPasscode(prefill=''){this.stage='passcode';this.node.onpointerdown=this.node.onpointerup=null;this.render();if(prefill)this.append(prefill);}

 renderPasscode(){
  const pass=el('div','duo-lock-pass'),head=el('div','duo-lock-head'),mark=el('div','duo-lock-mark');mark.innerHTML=this.icon('lock');
  this.prompt=el('h2','duo-lock-prompt','Enter Passcode');
  this.dots=el('div','duo-lock-dots');this.dots.setAttribute('aria-hidden','true');
  this.input=el('input','duo-lock-input');Object.assign(this.input,{type:'password',inputMode:'numeric',autocomplete:'off',maxLength:MAX});
  this.input.setAttribute('aria-label','Passcode');
  this.submit=el('button','duo-lock-submit');this.submit.type='button';this.submit.setAttribute('aria-label','Unlock');this.submit.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  this.error=el('p','duo-lock-error');this.error.setAttribute('role','alert');
  const entry=el('div','duo-lock-entry');entry.append(this.dots,this.input,this.submit);
  head.append(mark,this.prompt,entry,this.error);
  const pad=el('div','duo-keypad');
  for(const [digit,letters] of KEYS)pad.append(this.key(digit,letters));
  this.forgot=el('button','duo-key-text','Forgot?');this.forgot.type='button';this.forgot.onclick=()=>{if(!this.busy){this.mode='recover';this.render();}};
  this.back=el('button','duo-key-text','Cancel');this.back.type='button';
  this.back.onclick=()=>{if(this.busy)return;if(this.input.value){this.input.value=this.input.value.slice(0,-1);this.update();}else{this.stage='lock';this.render();}};
  pad.append(this.forgot,this.key('0',''),this.back);
  for(const b of pad.querySelectorAll('button'))b.addEventListener('pointerdown',event=>event.preventDefault()); // keep the input focused
  pass.append(head,pad);this.node.append(pass);
  this.input.addEventListener('input',()=>{this.input.value=this.input.value.replace(/\D/g,'').slice(0,MAX);this.update();if(this.input.value.length===MAX)this.perform();});
  this.submit.onclick=()=>this.perform();
  this.update();this.input.focus({preventScroll:true});
 }

 key(digit,letters){
  const b=el('button','duo-key');b.type='button';b.dataset.digit=digit;b.setAttribute('aria-label',digit);
  b.append(el('span','duo-key-digit',digit));if(letters)b.append(el('span','duo-key-letters',letters));
  b.onclick=()=>this.append(digit);return b;
 }

 append(digit){
  if(this.busy||!this.input||this.input.value.length>=MAX)return;
  this.input.value+=digit;this.update();
  if(this.input.value.length===MAX)this.perform();
 }

 update(){
  const n=this.input.value.length,slots=Math.max(MIN,Math.min(MAX,n+(n>=MIN&&n<MAX?1:0)));
  this.dots.replaceChildren(...Array.from({length:slots},(_,i)=>el('span',i<n?'duo-lock-dot is-filled':'duo-lock-dot')));
  this.submit.hidden=n<MIN;this.back.textContent=n?'Delete':'Cancel';
  if(n)this.error.textContent='';
 }

 onKey(event){
  if(this.node.hidden||this.mode!=='unlock')return;
  if(this.stage==='lock'){
   if(/^\d$/.test(event.key)){event.preventDefault();this.openPasscode(event.key);}
   else if(event.key==='Enter'||event.key===' '||event.key==='ArrowUp'){event.preventDefault();this.openPasscode();}
   return;
  }
  if(event.key==='Enter'){event.preventDefault();this.perform();}
  else if(event.key==='Escape'){event.preventDefault();this.stage='lock';this.render();}
 }

 async perform(){
  if(this.busy||!this.input)return;
  const pin=this.input.value;if(pin.length<MIN){this.reject('Enter a 4–6 digit passcode.');return;}
  this.busy=true;this.node.classList.add('is-busy');
  try{
   const result=await this.send('Devices/unlock',{Generation:this.generation,PIN:pin,Code:'',Confirm:''});
   if(result?.Success!==true)throw Error(result?.Error||result?.Msg||'Wrong passcode');
   this.input.value='';this.hide();this.onUnlock();
  }catch(error){if(!this.node.hidden)this.reject(error.message||'Wrong passcode');}
  finally{this.busy=false;this.node.classList.remove('is-busy');}
 }

 reject(message){
  if(!this.input)return;
  this.input.value='';this.update();this.error.textContent=message;
  this.dots.classList.remove('is-wrong');void this.dots.offsetWidth;this.dots.classList.add('is-wrong');
  this.input.focus({preventScroll:true});
 }

 // Recovery and reset keep a simple sheet: they take text, not a numeric passcode.
 renderCard(){
  const card=el('div','duo-lock-card'),title=el('h2'),copy=el('p','duo-lock-copy'),label=el('label'),span=el('span'),input=el('input'),error=el('p','duo-lock-error'),submit=el('button','duo-lock-card-submit'),links=el('div','duo-lock-links');
  input.autocomplete='off';error.setAttribute('role','alert');submit.type='button';label.append(span,input);
  if(this.mode==='recover'){title.textContent='Recover your phone';copy.textContent='Use the one-time code saved when you set your PIN.';span.textContent='Recovery code';input.type='text';input.maxLength=32;submit.textContent='Use recovery code';}
  if(this.mode==='reset'){title.textContent='Reset device';copy.textContent='Only the owner can reset this phone. We save a contacts backup first. Your contacts, SIM and accounts remain saved; the PIN and device preferences are reset.';span.textContent='Type RESET to confirm';input.type='text';input.maxLength=5;submit.textContent='Back up and reset';}
  const link=(text,mode)=>{const b=el('button','',text);b.type='button';b.onclick=()=>{if(!this.busy){this.mode=mode;this.stage='passcode';this.render();}};links.append(b);};
  link('Back to passcode','unlock');if(this.mode==='recover')link('Forgot recovery code? Reset device','reset');
  card.append(title,copy,label,error,submit,links);this.node.append(card);
  const perform=async()=>{
   if(this.busy)return;this.busy=true;submit.disabled=true;input.disabled=true;error.textContent='';
   const mode=this.mode;
   try{const result=await this.send('Devices/'+mode,{Generation:this.generation,PIN:'',Code:input.value.trim(),Confirm:input.value.trim()});
    if(result?.Success!==true)throw Error(result?.Error||result?.Msg||'The phone could not finish this action.');
    input.value='';copy.textContent='Device recovered. Reopen your phone to continue.';
   }catch(e){if(!this.node.hidden)error.textContent=e.message;}finally{this.busy=false;submit.disabled=false;input.disabled=false;}
  };
  submit.onclick=perform;input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();perform();}});
  input.focus({preventScroll:true});
 }
}
