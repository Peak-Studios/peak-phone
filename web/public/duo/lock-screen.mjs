export class LockScreen {
 constructor({bank,send,onUnlock,icon}){this.send=send;this.onUnlock=onUnlock;this.icon=icon;this.node=document.createElement('section');this.node.className='duo-lock-screen';this.node.setAttribute('aria-label','Phone lock screen');bank.append(this.node);this.node.hidden=true;this.busy=false;}
 setWallpaper(value){this.node.style.backgroundImage=value?`linear-gradient(0deg,#0005,#0001),url(${JSON.stringify(value)})`:'';}
 show(generation){this.generation=generation;this.mode='unlock';this.node.hidden=false;this.render();}
 hide(){this.node.hidden=true;this.node.replaceChildren();}
 render(){
  this.node.innerHTML=`<div class="duo-lock-mark">${this.icon('lock')}</div><p class="duo-lock-date"></p><h1 class="duo-lock-time"></h1><div class="duo-lock-card"><h2></h2><p class="duo-lock-copy"></p><label><span></span><input autocomplete="off"></label><p class="duo-lock-error" role="alert"></p><button class="duo-lock-submit" type="button"></button><div class="duo-lock-links"></div></div><p class="duo-lock-footer">PEAK DUO · Your space, protected</p>`;
  const now=new Date();this.node.querySelector('.duo-lock-date').textContent=now.toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'});this.node.querySelector('.duo-lock-time').textContent=now.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit',hour12:false});
  const input=this.node.querySelector('input'),copy=this.node.querySelector('.duo-lock-copy'),title=this.node.querySelector('h2'),label=this.node.querySelector('label span'),submit=this.node.querySelector('.duo-lock-submit'),links=this.node.querySelector('.duo-lock-links');
  if(this.mode==='unlock'){title.textContent='Unlock your phone';copy.textContent='Enter your device PIN.';label.textContent='PIN';input.type='password';input.inputMode='numeric';input.maxLength=6;submit.textContent='Unlock';}
  if(this.mode==='recover'){title.textContent='Recover your phone';copy.textContent='Use the one-time code saved when you set your PIN.';label.textContent='Recovery code';input.type='text';input.maxLength=32;submit.textContent='Use recovery code';}
  if(this.mode==='reset'){title.textContent='Reset device';copy.textContent='Only the owner can reset this phone. We save a contacts backup first. Your contacts, SIM and accounts remain saved; the PIN and device preferences are reset.';label.textContent='Type RESET to confirm';input.type='text';input.maxLength=5;submit.textContent='Back up and reset';}
  const link=(text,mode)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=()=>{if(!this.busy){this.mode=mode;this.render();}};links.append(b);};
  if(this.mode==='unlock'){link('Forgot PIN?','recover');}else {link('Back to unlock','unlock');if(this.mode==='recover')link('Forgot recovery code? Reset device','reset');}
  const perform=async()=>{
   if(this.busy)return;this.busy=true;submit.disabled=true;input.disabled=true;this.node.querySelector('.duo-lock-error').textContent='';
   const mode=this.mode;
   try{const result=await this.send('Devices/'+(mode==='unlock'?'unlock':mode==='recover'?'recover':'reset'),{Generation:this.generation,PIN:input.value,Code:input.value.trim(),Confirm:input.value.trim()});
    if(result?.Success!==true)throw Error(result?.Error||result?.Msg||'The phone could not finish this action.');
    input.value='';if(mode==='unlock'){this.hide();this.onUnlock();}else this.node.querySelector('.duo-lock-copy').textContent='Device recovered. Reopen your phone to continue.';
   }catch(error){if(!this.node.hidden)this.node.querySelector('.duo-lock-error').textContent=error.message;}finally{this.busy=false;submit.disabled=false;input.disabled=false;}
  };
  submit.onclick=perform;input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();perform();}});
 }
}
