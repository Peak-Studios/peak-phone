import { GlassView, avatar, el, icon, isRows, normalizePhone, readLocal, rows, safeImage, writeLocal } from './glass-kit.mjs?rev=owner-config-20261015';

const STYLE_ID = 'peak-duo-mail-styles';
let composeStatusSequence = 0;
const KEEP_TAGS = new Set(['A','B','BLOCKQUOTE','BR','DIV','EM','H1','H2','H3','HR','I','IMG','LI','OL','P','SPAN','STRONG','TABLE','TBODY','TD','TH','THEAD','TR','U','UL']);
const DROP_TAGS = new Set(['AUDIO','BUTTON','EMBED','FORM','IFRAME','OBJECT','SCRIPT','STYLE','SVG','VIDEO']);

function ensureMailStyles() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID) || String(import.meta.url).startsWith('blob:')) return;
  const link = document.createElement('link');
  link.id = STYLE_ID;
  link.rel = 'stylesheet';
  link.href = new URL('./mail.css', import.meta.url).href;
  document.head.append(link);
}
ensureMailStyles();

function rawMailId(mail) { return mail?.id ?? mail?.Id ?? mail?.mailid ?? mail?.MailId ?? mail?.mailId; }
export function mailId(mail) {
  const value = rawMailId(mail);
  return value == null ? '' : String(value);
}
export function mailTimestamp(mail) {
  const value = Number(mail?.timestamp ?? mail?.Timestamp ?? mail?.date ?? mail?.Date ?? 0);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value < 1e12 ? value * 1000 : value;
}
export function mailIsRead(mail) {
  const value = mail?.read ?? mail?.Read;
  return value === true || value === 1 || value === '1' || value === 'true';
}
export function mailPreviewText(value) {
  const source = String(value ?? '');
  if (typeof DOMParser === 'undefined') return source.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const parsed = new DOMParser().parseFromString(source, 'text/html');
  parsed.body.querySelectorAll('script,style').forEach(node => node.remove());
  return (parsed.body.textContent || '').replace(/\s+/g, ' ').trim();
}
export function filterMailRows(mails, query = '', filter = 'all', contacts = []) {
  const term = String(query).trim().toLocaleLowerCase();
  const names = new Map();
  for (const contact of rows(contacts)) {
    const phone = normalizePhone(contact?.phone ?? contact?.Phone);
    const name = String(contact?.name ?? contact?.Name ?? '').trim();
    if (phone && name) names.set(phone, name);
  }
  return rows(mails).filter(mail => {
    if (filter === 'unread' && mailIsRead(mail)) return false;
    if (!term) return true;
    const sender = String(mail?.sender ?? mail?.Sender ?? '');
    return [sender, names.get(normalizePhone(sender)) || '', mail?.subject, mail?.Subject, mailPreviewText(mail?.message ?? mail?.Message)]
      .join(' ').toLocaleLowerCase().includes(term);
  });
}
export function groupMailRows(mails, now = Date.now()) {
  const current = new Date(now);
  const today = new Date(current.getFullYear(), current.getMonth(), current.getDate()).getTime();
  const yesterday = new Date(current.getFullYear(), current.getMonth(), current.getDate() - 1).getTime();
  const groups = new Map();
  for (const mail of mails) {
    const stamp = mailTimestamp(mail);
    const label = stamp >= today ? 'Today' : stamp >= yesterday ? 'Yesterday' : 'Earlier';
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(mail);
  }
  return groups;
}
export function formatMailTime(mail, now = Date.now()) {
  const stamp = mailTimestamp(mail);
  if (!stamp) return 'Time unavailable';
  const date = new Date(stamp), current = new Date(now);
  if (date.toDateString() === current.toDateString()) return date.toLocaleTimeString(undefined, { hour:'numeric', minute:'2-digit' });
  if (date.getFullYear() === current.getFullYear()) return date.toLocaleDateString(undefined, { month:'short', day:'numeric' });
  return date.toLocaleDateString(undefined, { year:'numeric', month:'short', day:'numeric' });
}
const senderOf = mail => String(mail?.sender ?? mail?.Sender ?? 'Unknown sender').trim() || 'Unknown sender';
const subjectOf = mail => String(mail?.subject ?? mail?.Subject ?? '(No subject)').trim() || '(No subject)';
const bodyOf = mail => String(mail?.message ?? mail?.Message ?? '');
function replyPhone(mail) {
  const phone = normalizePhone(senderOf(mail));
  return /^\+?\d{3,24}$/.test(phone) ? phone : '';
}
function trustedMailAction(button) {
  if (!button || typeof button !== 'object' || (button.event ?? button.Event) !== 'Mails/SetGPS') return null;
  const data = button.data ?? button.Data;
  if (!data || typeof data !== 'object') return null;
  const x = Number(data.x ?? data.X), y = Number(data.y ?? data.Y);
  if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 10000 || Math.abs(y) > 10000) return null;
  return { event:'Mails/SetGPS', data:{x,y}, label:String(button.label ?? button.Label ?? 'Open location').slice(0,64) };
}
function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
function composeBodyHTML(value) {
  return String(value).trim().split(/\n\s*\n/).map(part => '<p>' + escapeHTML(part).replace(/\n/g,'<br>') + '</p>').join('');
}
function safeMailLink(raw) {
  try {
    const url = new URL(String(raw || '').trim());
    if (url.username || url.password || !['http:','https:','mailto:'].includes(url.protocol)) return '';
    return url.href;
  } catch { return ''; }
}
function appendMailNode(node, parent) {
  if (node.nodeType === Node.TEXT_NODE) { parent.append(document.createTextNode(node.nodeValue || '')); return; }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const tag = node.tagName;
  if (DROP_TAGS.has(tag)) return;
  if (!KEEP_TAGS.has(tag)) { for (const child of node.childNodes) appendMailNode(child,parent); return; }
  if (tag === 'A') {
    const href = safeMailLink(node.getAttribute('href'));
    if (!href) { for (const child of node.childNodes) appendMailNode(child,parent); return; }
    const link = document.createElement('a');
    link.href = href; link.target = '_blank'; link.rel = 'noopener noreferrer';
    for (const child of node.childNodes) appendMailNode(child,link);
    parent.append(link);
    return;
  }
  if (tag === 'IMG') {
    const src = safeImage(node.getAttribute('src') || '');
    if (!src) return;
    const image = document.createElement('img');
    image.src = src;
    image.alt = String(node.getAttribute('alt') || 'Email image').slice(0,180);
    image.loading = 'lazy';
    image.decoding = 'async';
    image.referrerPolicy = 'no-referrer';
    parent.append(image);
    return;
  }
  const safe = document.createElement(tag.toLowerCase());
  for (const child of node.childNodes) appendMailNode(child,safe);
  parent.append(safe);
}
function mailBodyFragment(markup) {
  const fragment = document.createDocumentFragment();
  const parsed = new DOMParser().parseFromString(String(markup ?? ''),'text/html');
  for (const child of parsed.body.childNodes) appendMailNode(child,fragment);
  return fragment;
}
function orderedMails(data) {
  return rows(data).filter(mail => mail && typeof mail === 'object').slice().sort((a,b) => {
    const date = mailTimestamp(b) - mailTimestamp(a);
    if (date) return date;
    const left = Number(mailId(a)), right = Number(mailId(b));
    return Number.isFinite(left) && Number.isFinite(right) ? right-left : mailId(b).localeCompare(mailId(a));
  });
}

export class MailApp extends GlassView {
  constructor(options) {
    super(options);
    this.element.classList.add('mail-app');
    this.element.setAttribute('aria-label','Mail');
    this.mails=[]; this.contacts=[]; this.filter='all'; this.searchQuery='';
    this.currentView='inbox'; this.selectedMail=null; this.loading=true; this.loadError=''; this.loadEpoch=0; this.navigationGeneration=0; this.openRequestGeneration=0;
    this.composeDraftId=''; this.composeRecipient=''; this.composeSubject=''; this.composeMessage=''; this.composeGeneration=0; this.sendingDrafts=new Set();
    this.renderInbox();
    this.loadPromise=this.refreshInbox();
    this.messages(data => {
      if (data.Action==='Mails/UpdateMails' && data.Mail && typeof data.Mail==='object') {
        const id=mailId(data.Mail);
        this.mails=[data.Mail,...this.mails.filter(mail => !id || mailId(mail)!==id)];
        if (this.selectedMail && id && mailId(this.selectedMail)===id) this.selectedMail=data.Mail;
        if (this.currentView==='inbox') this.renderInbox();
        else if (this.currentView==='detail' && id && mailId(this.selectedMail)===id) this.renderDetail();
      } else if (data.Action==='Mails/ImportCompleted') this.loadPromise=this.refreshInbox();
    });
  }
  senderName(mail) {
    const sender=senderOf(mail), phone=normalizePhone(sender);
    const contact=this.contacts.find(item => normalizePhone(item?.phone ?? item?.Phone)===phone);
    return String(contact?.name ?? contact?.Name ?? sender);
  }
  async refreshInbox() {
    const epoch=++this.loadEpoch; this.loading=true; this.loadError='';
    if (this.currentView==='inbox' && this.list) this.updateRefreshState();
    try {
      const [mailResult,contactResult]=await Promise.all([
        this.send('Mails/GetMails',{}),this.send('Contacts/GetContacts',{}).catch(()=>[])
      ]);
      if (!this.alive || epoch!==this.loadEpoch) return false;
      if (!isRows(mailResult)) throw Error('The server returned an invalid inbox.');
      this.mails=orderedMails(mailResult); this.contacts=rows(contactResult);
      if (this.selectedMail) {
        const current=this.mails.find(mail => mailId(mail)===mailId(this.selectedMail));
        if (current) this.selectedMail=current;
      }
      return true;
    } catch (error) {
      if (this.alive && epoch===this.loadEpoch) this.loadError=error?.message || 'Mail could not be loaded.';
      return false;
    } finally {
      if (this.alive && epoch===this.loadEpoch) {
        this.loading=false;
        if (this.currentView==='inbox') this.renderInbox();
        else if (this.currentView==='detail' && this.selectedMail) this.renderDetail();
      }
    }
  }
  updateRefreshState() {
    if (!this.refreshButton) return;
    this.refreshButton.disabled=this.loading;
    this.refreshButton.setAttribute('aria-busy',String(this.loading));
    this.refreshButton.classList.toggle('is-loading',this.loading);
  }
  renderInbox() {
    this.closeSheet(); this.currentView='inbox'; this.element.dataset.view='inbox'; this.element.replaceChildren();
    const header=el('header','mail-header'), heading=el('div','mail-heading');
    heading.append(el('h1','',this.filter==='unread'?'Unread':'Inbox'));
    const unread=this.mails.filter(mail => !mailIsRead(mail)).length;
    const count=el('p','mail-account-line');
    count.textContent=unread+' unread · '+this.mails.length+' messages';
    heading.append(count);
    this.refreshButton=this.button('Refresh mail','refresh',()=>{this.loadPromise=this.refreshInbox();},'mail-icon-button mail-refresh');
    this.updateRefreshState(); header.append(heading,this.refreshButton);
    const filters=el('nav','mail-filters'); filters.setAttribute('aria-label','Message filter');
    for (const [id,label] of [['all','Inbox'],['unread','Unread'+(unread?' · '+unread:'')]]) {
      const button=el('button','mail-filter',label); button.type='button';
      button.setAttribute('aria-pressed',String(this.filter===id));
      button.addEventListener('click',()=>{if(this.filter===id)return;this.navigationGeneration++;this.filter=id;this.renderInbox();});
      filters.append(button);
    }
    this.list=el('main','mail-list');
    this.list.setAttribute('aria-label',this.filter==='unread'?'Unread messages':'Inbox messages');
    this.body=this.list;
    this.element.append(header,filters,this.list,this.renderDock());
    this.renderRows();
  }
  renderDock() {
    const dock=el('footer','mail-dock');
    const boxes=this.button('Choose mailbox','mail',()=>this.openMailboxes(),'mail-dock-action');
    const search=el('label','mail-search'); search.innerHTML=icon('search');
    const input=el('input'); input.type='search'; input.value=this.searchQuery;
    input.placeholder='Search'; input.setAttribute('aria-label','Search mail'); input.autocomplete='off'; input.spellcheck=false;
    input.addEventListener('input',()=>{this.navigationGeneration++;this.searchQuery=input.value;this.renderRows({keepScroll:true});});
    search.append(input);
    const compose=this.button('Compose mail','edit',()=>this.startCompose(),'mail-dock-action mail-compose-action');
    dock.append(boxes,search,compose); return dock;
  }
  renderRows({keepScroll=false}={}) {
    if (!this.list) return;
    const scrollTop=keepScroll?this.list.scrollTop:0; this.list.replaceChildren();
    const visible=filterMailRows(this.mails,this.searchQuery,this.filter,this.contacts);
    if (this.loading && !this.mails.length) { this.list.append(this.state('Loading your inbox','Your messages will appear here.','mail',true)); return; }
    if (this.loadError && !this.mails.length) {
      const empty=this.state('Mail is unavailable',this.loadError,'mail');
      empty.append(this.textButton('Try again','refresh',()=>{this.loadPromise=this.refreshInbox();},'mail-state-action'));
      this.list.append(empty); return;
    }
    if (!visible.length) {
      const title=this.searchQuery?'No results':this.filter==='unread'?'You’re all caught up':'No mail yet';
      const text=this.searchQuery?'Try another sender, subject, or phrase.':this.filter==='unread'?'Unread messages will show up here.':'New messages will appear here.';
      this.list.append(this.state(title,text,'mail')); return;
    }
    if (this.loadError) {
      const banner=el('div','mail-inline-error',this.loadError); banner.setAttribute('role','status');
      banner.append(this.textButton('Retry','refresh',()=>{this.loadPromise=this.refreshInbox();},'mail-inline-retry')); this.list.append(banner);
    }
    for (const [group,messages] of groupMailRows(visible)) {
      const section=el('section','mail-group'); section.setAttribute('aria-label',group);
      section.append(el('h2','mail-group-label',group));
      const rowsHost=el('div','mail-group-rows');
      for (const mail of messages) rowsHost.append(this.renderMailRow(mail));
      section.append(rowsHost); this.list.append(section);
    }
    this.list.scrollTop=scrollTop;
  }
  renderMailRow(mail) {
    const sender=this.senderName(mail), subject=subjectOf(mail), preview=mailPreviewText(bodyOf(mail)), read=mailIsRead(mail);
    const row=this.surfaceButton(sender+': '+subject,()=>this.openMail(mail),'mail-row');
    row.setAttribute('aria-label',(read?'':'Unread. ')+sender+'. '+subject+'. '+preview+'. '+formatMailTime(mail));
    row.dataset.unread=String(!read);
    row.append(el('span','mail-unread-dot'));
    const contact=this.contacts.find(item=>normalizePhone(item?.phone ?? item?.Phone)===normalizePhone(senderOf(mail)));
    row.append(avatar(sender,mail.avatar ?? mail.Avatar ?? contact?.avatar,'mail-avatar'));
    const copy=el('span','mail-row-copy');
    copy.append(el('span','mail-sender',sender),el('span','mail-subject',subject),el('span','mail-preview',preview || 'No message preview'));
    row.append(copy,el('time','mail-time',formatMailTime(mail)));
    return row;
  }
  state(title,description,glyph='mail',loading=false) {
    const panel=el('section','mail-state'+(loading?' is-loading':'')); panel.setAttribute('role',loading?'status':'region');
    const symbol=el('span','mail-state-icon'); symbol.innerHTML=icon(glyph);
    panel.append(symbol,el('h2','',title),el('p','',description)); return panel;
  }
  openMailboxes() {
    const panel=this.openSheet('Mailboxes',{header:false});panel.classList.add('mail-editor-sheet','mail-mailboxes-sheet');
    this.navigationGeneration++;
    const nav=el('header','mail-editor-nav');nav.append(this.textButton('Cancel','',()=>this.closeSheet(),'mail-editor-cancel'),el('h2','','Mailboxes'),this.textButton('Done','',()=>this.closeSheet(),'mail-editor-done'));
    const unreadCount=this.mails.filter(mail => !mailIsRead(mail)).length;
    panel.append(nav,el('p','mail-sheet-description','Choose which messages appear in your inbox.'));
    const inbox=this.textButton('Inbox · '+this.mails.length,'mail',()=>{this.filter='all';this.closeSheet();this.renderInbox();},'mail-sheet-row');
    inbox.setAttribute('aria-pressed',String(this.filter==='all'));
    const unread=this.textButton('Unread · '+unreadCount,'mail',()=>{this.filter='unread';this.closeSheet();this.renderInbox();},'mail-sheet-row');
    unread.setAttribute('aria-pressed',String(this.filter==='unread'));
    const group=el('div','mail-mailbox-options');group.append(inbox,unread);panel.append(group);
  }
  openMail(mail,{navigationGeneration=null,requestGeneration=null}={}) {
    if (navigationGeneration==null) { this.navigationGeneration++; this.openRequestGeneration++; }
    else if (navigationGeneration!==this.navigationGeneration || requestGeneration!==this.openRequestGeneration) return false;
    this.selectedMail=this.mails.find(item => mailId(item)===mailId(mail)) || mail;
    this.currentView='detail'; this.renderDetail();
    if (!mailIsRead(this.selectedMail)) this.markRead(this.selectedMail);
    return true;
  }
  async openById(id,{isCurrent=()=>true}={}) {
    const wanted=String(id ?? '');
    if (!wanted || !isCurrent()) return false;
    const requestGeneration=++this.openRequestGeneration;
    const navigationGeneration=++this.navigationGeneration;
    if (!this.mails.length && this.loading && this.loadPromise) await this.loadPromise;
    if (!this.alive || !isCurrent() || requestGeneration!==this.openRequestGeneration || navigationGeneration!==this.navigationGeneration) return false;
    let mail=this.mails.find(item => mailId(item)===wanted);
    if (!mail) {
      await this.refreshInbox();
      if (!this.alive || !isCurrent() || requestGeneration!==this.openRequestGeneration || navigationGeneration!==this.navigationGeneration) return false;
      mail=this.mails.find(item => mailId(item)===wanted);
    }
    if (!this.alive || !isCurrent() || requestGeneration!==this.openRequestGeneration || navigationGeneration!==this.navigationGeneration) return false;
    if (!mail) {
      this.currentView='inbox'; this.selectedMail=null; this.renderInbox();
      this.notify('That message is no longer available.');
      return false;
    }
    return this.openMail(mail,{navigationGeneration,requestGeneration});
  }
  async markRead(mail) {
    const id=mailId(mail), serverId=rawMailId(mail);
    if (!id || serverId==null) return;
    this.mails=this.mails.map(item => mailId(item)===id?{...item,read:1}:item);
    this.selectedMail=this.mails.find(item => mailId(item)===id) || {...mail,read:1};
    try { await this.checked('Mails/MarkAsRead',{id:serverId}); }
    catch (error) {
      if (!this.alive) return;
      this.mails=this.mails.map(item => mailId(item)===id?{...item,read:0}:item);
      if (this.selectedMail && mailId(this.selectedMail)===id) this.selectedMail={...this.selectedMail,read:0};
      this.notify(error?.message || 'The message could not be marked as read.');
    }
  }
  renderDetail() {
    const mail=this.selectedMail; if (!mail) return this.renderInbox();
    this.closeSheet(); this.currentView='detail'; this.element.dataset.view='detail'; this.element.replaceChildren();
    const header=el('header','mail-detail-header');
    header.append(this.button('Back to inbox','back',()=>this.showInbox(),'mail-back-button'),el('span','mail-detail-label','Message'));
    const actions=el('div','mail-detail-header-actions'), phone=replyPhone(mail);
    const reply=this.button(phone?'Reply to message':'Reply unavailable for this notice','reply',()=>this.startCompose(mail),'mail-icon-button');
    reply.disabled=!phone;
    actions.append(reply,this.button('Delete message','trash',()=>this.confirmDelete(mail),'mail-icon-button mail-delete-button'));
    header.append(actions);
    const content=el('main','mail-detail-content'); content.setAttribute('aria-label','Message from '+this.senderName(mail));
    content.append(el('h1','mail-detail-subject',subjectOf(mail)));
    const senderRow=el('div','mail-detail-sender');
    const contact=this.contacts.find(item=>normalizePhone(item?.phone ?? item?.Phone)===normalizePhone(senderOf(mail)));
    senderRow.append(avatar(this.senderName(mail),mail.avatar ?? mail.Avatar ?? contact?.avatar,'mail-avatar mail-avatar-large'));
    const senderCopy=el('div','mail-detail-sender-copy'); senderCopy.append(el('strong','',this.senderName(mail)));
    const raw=senderOf(mail); if (raw!==this.senderName(mail)) senderCopy.append(el('span','mail-detail-address',raw));
    senderCopy.append(el('time','mail-detail-time',formatMailTime(mail))); senderRow.append(senderCopy); content.append(senderRow);
    const body=el('article','mail-body'); body.setAttribute('aria-label','Message content');
    body.append(mailBodyFragment(bodyOf(mail))); content.append(body);
    const rawAction=mail.button ?? mail.Button, action=trustedMailAction(rawAction);
    if (action) {
      const button=this.textButton(action.label,'navigation',()=>this.submit(button,async()=>{
        await this.checked(action.event,action.data); this.notify('Mail action completed.');
      },content),'mail-message-action');
      content.append(button);
    } else if (rawAction && typeof rawAction==='object' && (rawAction.event || rawAction.Event)) {
      const note=el('p','mail-action-unavailable','This message contains an action this phone does not support.');
      note.setAttribute('role','status'); content.append(note);
    }
    const footer=el('footer','mail-detail-footer');
    footer.append(this.textButton('Reply','reply',()=>this.startCompose(mail),'mail-footer-action mail-reply-action'));
    footer.append(this.textButton('Delete','trash',()=>this.confirmDelete(mail),'mail-footer-action mail-delete-action'));
    footer.querySelector('.mail-reply-action').disabled=!phone;
    this.element.append(header,content,footer); this.body=content;
  }
  showInbox() { this.navigationGeneration++; this.selectedMail=null; this.renderInbox(); }
  startCompose(replyTo=null) {
    this.navigationGeneration++; this.composeGeneration++;
    const phone=replyTo?replyPhone(replyTo):'';
    if (replyTo && !phone) { this.notify('This notice can’t be replied to.'); return; }
    this.composeDraftId=replyTo?mailId(replyTo):'new';
    const saved=readLocal(this.context,'mail-draft:'+this.composeDraftId,null), subject=replyTo?subjectOf(replyTo):'';
    this.composeRecipient=typeof saved?.recipient==='string'?saved.recipient:phone;
    this.composeSubject=typeof saved?.subject==='string'?saved.subject:(replyTo?(/^re\s*:/i.test(subject)?subject:'Re: '+subject):'');
    this.composeMessage=typeof saved?.message==='string'?saved.message:'';
    this.composeErrors={recipient:false,subject:false,message:false}; this.composeReply=!!replyTo; this.currentView='compose'; this.renderCompose();
  }
  renderCompose() {
    this.closeSheet(); this.currentView='compose'; this.element.dataset.view='compose'; this.element.replaceChildren();
    const header=el('header','mail-compose-header');
    header.append(this.textButton('Cancel','close',()=>this.showInbox(),'mail-compose-cancel'),el('h1','',this.composeReply?'Reply':'New Message'));
    const form=el('form','mail-compose-form'), recipient=el('input');
    recipient.type='tel'; recipient.inputMode='tel'; recipient.autocomplete='off'; recipient.maxLength=24; recipient.value=this.composeRecipient;
    recipient.placeholder='Phone number'; recipient.setAttribute('aria-label','To');
    const to=el('label','mail-compose-field'); to.append(el('span','','To'),recipient);
    const subject=el('input'); subject.type='text'; subject.autocomplete='off'; subject.maxLength=150; subject.value=this.composeSubject;
    subject.placeholder='Add a subject'; subject.setAttribute('aria-label','Subject');
    const subjectField=el('label','mail-compose-field'); subjectField.append(el('span','','Subject'),subject);
    const message=el('textarea'); message.maxLength=10000; message.value=this.composeMessage; message.placeholder='Write your message…';
    message.setAttribute('aria-label','Message');
    const messageField=el('label','mail-compose-message'); messageField.append(message);
    const status=el('div','mail-compose-status');
    status.id='mail-compose-status-'+(++composeStatusSequence); status.setAttribute('aria-live','polite');
    const send=this.button('Send mail','arrow-up',()=>{},'mail-send-button'); send.type='submit';
    send.setAttribute('aria-describedby',status.id); header.append(send);
    const updateSendState=()=>{
      const missing=[];
      if (!/^\+?\d{3,24}$/.test(normalizePhone(recipient.value))) missing.push('a valid phone number');
      if (!subject.value.trim()) missing.push('a subject');
      if (!message.value.trim()) missing.push('a message');
      const pending=this.sendingDrafts.has(this.composeDraftId);
      send.disabled=missing.length>0||pending;
      const failed=status.dataset.state==='error'||status.querySelector('.gx-status-error');
      status.dataset.state=pending?'sending':failed?'error':missing.length?'guidance':'ready';
      if(!pending&&failed)return;
      status.textContent=pending?'Sending…':missing.length
        ? (missing.length===3?'Add a recipient, subject, and message to enable Send.':'Complete '+missing.join(' and ')+' to enable Send.')
        : 'Ready to send.';
    };
    this.composeReadiness={draftId:this.composeDraftId,generation:this.composeGeneration,refresh:updateSendState};
    updateSendState();
    const footer=el('footer','mail-compose-footer');
    footer.append(el('span','mail-compose-hint','Draft saved on this phone'));
    form.append(header,to,subjectField,messageField,status,footer);
    form.addEventListener('input',()=>{
      this.composeRecipient=recipient.value; this.composeSubject=subject.value; this.composeMessage=message.value;
      writeLocal(this.context,'mail-draft:'+this.composeDraftId,{recipient:this.composeRecipient,subject:this.composeSubject,message:this.composeMessage});
      status.replaceChildren();status.dataset.state='';status.removeAttribute('role'); for (const input of [recipient,subject,message]) input.removeAttribute('aria-invalid');
      updateSendState();
    });
    form.addEventListener('submit',event=>{
      event.preventDefault(); this.composeRecipient=recipient.value; this.composeSubject=subject.value; this.composeMessage=message.value;
      this.sendCompose(send,status,{recipient,subject,message});
    });
    this.element.append(form); this.body=form;
    queueMicrotask(()=>{if(this.currentView==='compose')(this.composeReply?message:recipient).focus();});
  }
  refreshCurrentComposeReadiness(draftId) {
    if (!this.alive || this.currentView!=='compose' || this.composeDraftId!==draftId) return;
    const mounted=this.composeReadiness;
    if (mounted?.draftId===draftId && mounted.generation===this.composeGeneration) mounted.refresh?.();
  }
  async sendCompose(button,status,inputs) {
    const draftId=this.composeDraftId;
    const draftGeneration=this.composeGeneration;
    const snapshot={recipient:this.composeRecipient,subject:this.composeSubject,message:this.composeMessage};
    const targetPhone=normalizePhone(snapshot.recipient);
    const errors={recipient:!(/^\+?\d{3,24}$/.test(targetPhone)),subject:!snapshot.subject.trim(),message:!snapshot.message.trim()};
    for (const [key,input] of Object.entries(inputs)) input.setAttribute('aria-invalid',String(errors[key]));
    this.composeErrors=errors;
    if (errors.recipient) {status.dataset.state='error';inputs.recipient.focus();status.textContent='Enter a valid phone number.';return;}
    if (errors.subject) {status.dataset.state='error';inputs.subject.focus();status.textContent='Add a subject before sending.';return;}
    if (errors.message) {status.dataset.state='error';inputs.message.focus();status.textContent='Write a message before sending.';return;}
    if (this.sendingDrafts.has(draftId)) {status.dataset.state='error';status.textContent='This draft is already being sent.';return;}
    status.replaceChildren();status.dataset.state='sending';status.setAttribute('role','status');
    this.sendingDrafts.add(draftId);
    this.refreshCurrentComposeReadiness(draftId);
    button.disabled=true;button.setAttribute('aria-busy','true');
    try {
      await this.checked('Mails/SendMail',{targetPhone,subject:snapshot.subject.trim(),message:composeBodyHTML(snapshot.message)});
      if (!this.alive) return;
      const sameComposer=this.currentView==='compose' && this.composeDraftId===draftId;
      const currentSnapshot=sameComposer && this.composeGeneration===draftGeneration
        && this.composeRecipient===snapshot.recipient && this.composeSubject===snapshot.subject && this.composeMessage===snapshot.message;
      const saved=readLocal(this.context,'mail-draft:'+draftId,null);
      const savedSnapshot=saved && saved.recipient===snapshot.recipient && saved.subject===snapshot.subject && saved.message===snapshot.message;
      const newerComposerOwnsDraft=sameComposer && this.composeGeneration!==draftGeneration;
      if (!currentSnapshot) {
        if (!newerComposerOwnsDraft && savedSnapshot) writeLocal(this.context,'mail-draft:'+draftId,{recipient:'',subject:'',message:''});
        this.notify(sameComposer?'Mail sent. Your newer draft was kept.':'Mail sent.');
        return;
      }
      writeLocal(this.context,'mail-draft:'+draftId,{recipient:'',subject:'',message:''});
      this.composeRecipient='';this.composeSubject='';this.composeMessage='';this.selectedMail=null;this.filter='all';this.searchQuery='';
      this.currentView='inbox'; this.composeReadiness=null; this.renderInbox(); this.notify('Mail sent.');
    } catch(error) {
      if (!this.alive) return;
      if (this.currentView==='compose'&&this.composeDraftId===draftId&&this.composeGeneration===draftGeneration&&status.isConnected) {
        status.dataset.state='error';status.setAttribute('role','alert');status.textContent=error?.message||'Mail could not be sent.';
        button.disabled=false;button.removeAttribute('aria-busy');
      } else if (this.currentView!=='compose'||this.composeDraftId!==draftId||this.composeGeneration!==draftGeneration) this.notify('The earlier mail could not be sent. Its saved draft is still available.');
    } finally {
      this.sendingDrafts.delete(draftId);
      if (this.alive&&button.isConnected) button.removeAttribute('aria-busy');
      if (this.alive) this.refreshCurrentComposeReadiness(draftId);
    }
  }
  confirmDelete(mail) {
    this.navigationGeneration++;
    const navigationGeneration=this.navigationGeneration;
    const id=mailId(mail), serverId=rawMailId(mail);
    if (!id || serverId==null) {this.notify('This message can’t be deleted.');return;}
    const panel=this.openSheet('Delete message?',{header:false});panel.classList.add('mail-editor-sheet','mail-confirm-editor');
    const nav=el('header','mail-editor-nav');nav.append(this.textButton('Cancel','',()=>this.closeSheet(),'mail-editor-cancel'),el('h2','','Delete message?'),el('span','mail-editor-spacer'));
    const context=el('div','mail-delete-context'),copy=el('div','mail-delete-copy');copy.append(el('strong','',this.senderName(mail)),el('small','',subjectOf(mail)));context.append(avatar(this.senderName(mail),mail.avatar??mail.Avatar,'mail-avatar'),copy);
    panel.append(nav,context,el('p','mail-sheet-description','This message will be removed from your inbox.'));
    panel.append(this.textButton('Keep message','back',()=>this.closeSheet(),'mail-sheet-row'));
    const remove=this.textButton('Delete message','trash',()=>this.submit(remove,async()=>{
      await this.checked('Mails/DeleteMail',{id:serverId});
      if (!this.alive) return;
      const stillCurrent=this.navigationGeneration===navigationGeneration && this.sheet?.panel===panel;
      this.mails=this.mails.filter(item=>mailId(item)!==id);
      if (stillCurrent) {
        this.selectedMail=null; this.currentView='inbox';
        this.closeSheet(); this.renderInbox();
      } else if (this.currentView==='inbox') this.renderInbox();
      this.notify('Message deleted.');
    },panel),'mail-sheet-row mail-sheet-danger');
    panel.append(remove);
  }
  $destroy() { this.loadEpoch++; super.$destroy(); }
  handleEscape() {
    if (super.handleEscape()) return true;
    if (this.currentView!=='inbox') {this.showInbox();return true;}
    if (this.searchQuery) {this.searchQuery='';this.renderInbox();return true;}
    return false;
  }
}
