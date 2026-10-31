"""Maintained Playwright regression for the restored Services and Crypto routes.

All routes use local synthetic preview fixtures. This test does not contact FiveM,
an installed framework, SQL, an exchange, or a real phone number.
"""
from pathlib import Path
import json, os, sys, traceback
from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tests'))
from browser_harness import mount_offline
OUT=Path(os.environ.get('IOS_REFRESH_OUT',str(ROOT/'artifacts/ios-refresh')))
OUT.mkdir(parents=True,exist_ok=True)
checks=[]

def ok(name,condition=True,detail=None):
    if not condition: raise AssertionError(name+': '+str(detail))
    checks.append({'name':name,'passed':True})
    print('PASS',name,flush=True)

def launch(browser,width=1280,height=900):
    page=browser.new_page(viewport={'width':width,'height':height},device_scale_factor=1)
    page.set_default_timeout(6000)
    errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
    mount_offline(page,nui=False,open_phone=False)
    page.evaluate('async()=>await PeakDuo.open()')
    page.wait_for_timeout(140)
    page.evaluate('''()=>{
      const send=window.PeakPhoneTransport;window.__cryptoWrites=[];window.__cryptoExactReads=[];window.__cryptoSimulateDurableOfflineRejection=false;window.__cryptoDurableOfflineOperation=null;window.__cryptoSimulateReviewGateRace=false;window.__cryptoReviewGateAppearedAtSubmit=false;window.__cryptoReviewGateOperation=null;
      window.PeakPhoneTransport=async(event,data)=>{
        if(/^Crypto\\/(BuyCrypto|SellCrypto|TransferCrypto)$/.test(event)){
          const key=Array.from({length:localStorage.length},(_,i)=>localStorage.key(i)).find(value=>value.includes('crypto-pending'));
          let saved=null;try{saved=key?JSON.parse(localStorage.getItem(key)):null;}catch{}
          window.__cryptoWrites.push({event,data:structuredClone(data),saved});
        }
        if(event==='Crypto/TransferCrypto'&&(window.__cryptoSimulateDurableOfflineRejection||window.__cryptoSimulateReviewGateRace)){
          const race=window.__cryptoSimulateReviewGateRace;
          const message=race?'Another wallet transaction needs administrator review. This Crypto action was not submitted.':'Choose a different online character with an active phone.';
          const result={Success:false,Msg:message,Error:message,OperationId:data.OperationId,Status:'rejected'};
          window.__cryptoDurableOfflineOperation=data.OperationId;
          if(race){window.__cryptoReviewGateAppearedAtSubmit=true;window.__cryptoReviewGateOperation=data.OperationId;PeakDuo.cryptoPreview.setWalletReviewRequired(true);}
          window.__cryptoWrites.at(-1).response=structuredClone(result);
          return result;
        }
        if(event==='Crypto/GetOperation'&&data.OperationId&&(data.OperationId===window.__cryptoDurableOfflineOperation||data.OperationId===window.__cryptoReviewGateOperation)){
          window.__cryptoExactReads.push(data.OperationId);
          const saved=window.__cryptoWrites.at(-1)?.saved;
          const status={Success:true,Balances:{shungite:12},Limits:{MaxCryptoUnits:1000,MaxTransfer:100000},Operation:{OperationId:data.OperationId,Status:'rejected',Kind:'TRANSFER',CryptoId:saved?.CryptoId||'shungite',Units:saved?.Amount||1,Amount:saved?.Amount||1},WalletReviewRequired:data.OperationId===window.__cryptoReviewGateOperation};
          window.__cryptoWrites.at(-1).exactStatus=structuredClone(status);
          return status;
        }
        return send(event,data);
      };
    }''')
    return page,errors

def count(page,event):
    return page.evaluate('(e)=>PeakDuo.requests.filter(r=>r.event===e).length',event)

def install(page,name):
    page.evaluate("async()=>await PeakDuo.openApp('store','left',{external:true})")
    page.wait_for_timeout(100)
    page.get_by_role('searchbox',name='Search available apps').fill(name)
    row=page.locator('.ios-store-row[data-app-id="'+name.lower()+'"]')
    expect(row).to_have_count(1)
    row.get_by_role('button',name='Install '+name,exact=True).click()
    page.wait_for_timeout(140)
    return row

def open_app(page,name,side='left'):
    opened=page.evaluate('([id,side])=>PeakDuo.openApp(id,side,{external:true})',[name.lower(),side])
    page.wait_for_selector('.duo-app-instance[data-app="'+name.lower()+'"]:not(:empty)')
    page.wait_for_timeout(200)
    return opened

def visible_wallet(page):
    return page.locator('.duo-app-instance[data-app="crypto"] .nx-crypto').is_visible()

def prepare_folded(page):
    page.evaluate("if(PeakDuo.getState().workspace.expanded)PeakDuo.fold()")
    page.wait_for_function('PeakDuo.getState().workspace.expanded===false')
    page.wait_for_timeout(220)

def prepare_narrow_folded(page):
    page.set_viewport_size({'width':390,'height':844})
    prepare_folded(page)

def wallet_outcome_visibility(page):
    return page.evaluate('''()=>{
      const outcome=document.querySelector('.nx-wallet-outcome'),body=outcome?.closest('.nx-restored-body');
      if(!outcome||!body)return null;
      const panel=outcome.getBoundingClientRect(),viewport=body.getBoundingClientRect();
      const visible=Math.max(0,Math.min(panel.bottom,viewport.bottom)-Math.max(panel.top,viewport.top));
      return {scrollTop:body.scrollTop,panelTop:panel.top,panelBottom:panel.bottom,viewportTop:viewport.top,viewportBottom:viewport.bottom,visibleFraction:visible/panel.height};
    }''')

def wallet_outcome_geometry(page):
    return page.evaluate('''()=>{
      const panel=document.querySelector('.nx-wallet-outcome');if(!panel)return null;
      const rect=panel.getBoundingClientRect(),reason=panel.querySelector('.nx-wallet-outcome-reason');
      const children=[...panel.children].map(node=>{const box=node.getBoundingClientRect();return {tag:node.tagName.toLowerCase(),width:node.clientWidth,scrollWidth:node.scrollWidth,left:box.left,right:box.right};});
      const width=document.documentElement.clientWidth;
      return {viewport:width,expanded:PeakDuo.getState().workspace.expanded,flexDirection:getComputedStyle(panel).flexDirection,panelWidth:panel.clientWidth,panelScrollWidth:panel.scrollWidth,panelLeft:rect.left,panelRight:rect.right,reasonWidth:reason?.getBoundingClientRect().width??0,children,overflow:document.documentElement.scrollWidth>width+1||panel.scrollWidth>panel.clientWidth+1||children.some(row=>row.scrollWidth>row.width+1||row.left<rect.left-1||row.right>rect.right+1)};
    }''')

def no_horizontal_overflow(page):
    return page.evaluate('''()=>{
      const width=document.documentElement.clientWidth;
      const duo=document.querySelector('#duo');
      const visible=node=>{const style=getComputedStyle(node);return node.getClientRects().length&&style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity)>0;};
      const nodes=Array.from(document.querySelectorAll('.duo-pane,.duo-app-instance[data-app="crypto"],.duo-app-instance[data-app="services"],.nx-crypto,.nx-services')).filter(visible);
      const rect=duo?.getBoundingClientRect();
      return document.documentElement.scrollWidth<=width+1&&(!rect||(rect.left>=-1&&rect.right<=width+1))&&nodes.every(node=>node.scrollWidth<=node.clientWidth+1);
    }''')

def overflow_details(page):
    return page.evaluate('''()=>({viewport:document.documentElement.clientWidth,document:document.documentElement.scrollWidth,nodes:[document.body,...document.querySelectorAll('#duo,.duo-pane[data-active="true"],.duo-app-instance[data-app="crypto"],.duo-app-instance[data-app="services"]')].filter(node=>node&&node.getClientRects().length).map(node=>({selector:node.id||node.className||node.getAttribute('data-app'),width:node.clientWidth,scrollWidth:node.scrollWidth,left:Math.round(node.getBoundingClientRect().left),right:Math.round(node.getBoundingClientRect().right),display:getComputedStyle(node).display,visibility:getComputedStyle(node).visibility}))})''')

def test_install_and_service(page):
    install(page,'Services')
    ok('Services installs through the existing App Store route',count(page,'InstallApp')>=1 and page.evaluate("PeakPhoneLegacy.get(PeakPhoneLegacy.stores.InstalledApps).services===true"))
    open_app(page,'Services')
    expect(page.locator('.nx-services')).to_contain_text('Jordan Lee')
    expect(page.locator('.nx-services')).to_contain_text('Tow')
    before=count(page,'Contacts/Call')
    page.get_by_role('button',name='Call Jordan Lee',exact=True).click()
    page.wait_for_timeout(100)
    ok('Services preview reports the direct call was not placed',count(page,'Contacts/Call')==before+1 and 'No call was placed' in page.locator('.nx-services').inner_text())

def test_crypto_flow(page,errors):
    install(page,'Crypto')
    ok('Crypto installs through the existing App Store route',count(page,'InstallApp')>=2 and page.evaluate("PeakPhoneLegacy.get(PeakPhoneLegacy.stores.InstalledApps).crypto===true"))
    open_app(page,'Crypto')
    expect(page.locator('.nx-crypto')).to_contain_text('IN-GAME VIRTUAL BALANCES')
    expect(page.locator('.nx-crypto')).to_contain_text('Shungite')

    page.get_by_role('button',name='Buy Shungite',exact=True).click()
    page.get_by_role('button',name='Review purchase',exact=True).click()
    expect(page.get_by_role('dialog',name='Review purchase')).to_be_visible()
    page.get_by_role('dialog',name='Review purchase').get_by_role('button',name='Cancel',exact=True).click()
    ok('Cancelling review creates no write and saves no operation reference',count(page,'Crypto/BuyCrypto')==0 and page.evaluate("Array.from({length:localStorage.length},(_,i)=>localStorage.key(i)).every(key=>!key.includes('crypto-pending'))"))

    page.get_by_role('button',name='Buy Shungite',exact=True).click()
    page.get_by_role('spinbutton',name='Amount in whole units').fill('2')
    page.get_by_role('button',name='Review purchase',exact=True).click()
    dialog=page.get_by_role('dialog',name='Review purchase')
    operation_id=dialog.locator('.nx-operation-reference').inner_text().replace('Reference · ','')
    page.evaluate('PeakDuo.cryptoPreview.setWalletReviewRequired(true)')
    dialog.get_by_role('button',name='Confirm purchase',exact=True).click()
    page.wait_for_timeout(250)
    audit=page.evaluate('window.__cryptoWrites')
    ok('One reviewed purchase saves that exact ID before its single POST',len(audit)==1 and audit[0]['data']['OperationId']==operation_id and audit[0]['saved']['OperationId']==operation_id and count(page,'Crypto/BuyCrypto')==1,audit)
    expect(page.locator('.nx-wallet-outcome')).to_contain_text('Synthetic preview result')
    expect(page.locator('.nx-wallet-outcome')).to_contain_text(operation_id)
    ok('The completed exact reference remains visible beside the wallet-wide review block',page.evaluate('(id)=>PeakDuo.cryptoPreview.operations().some(row=>row.OperationId===id&&row.Status===\'complete\')',operation_id))
    expect(page.locator('.nx-crypto')).to_contain_text('Another in-game wallet operation needs review.')
    expect(page.get_by_role('button',name='Buy Shungite',exact=True)).to_be_disabled()
    key=page.evaluate("Array.from({length:localStorage.length},(_,i)=>localStorage.key(i)).find(value=>value.includes('crypto-pending'))")
    before_pending_value=page.evaluate('(key)=>localStorage.getItem(key)',key)
    page.get_by_role('button',name='Buy Shungite',exact=True).evaluate('(button)=>button.click()')
    page.wait_for_timeout(100)
    ok('A completed exact read plus another wallet review blocks a new write reference',count(page,'Crypto/BuyCrypto')==1 and page.evaluate('(key)=>localStorage.getItem(key)',key)==before_pending_value)

    page.locator('#duo').screenshot(path=str(OUT/'restored-apps-crypto-full.png'))
    page.evaluate("PeakDuo.setLayout('split'); PeakDuo.openApp('services','right',{external:true})")
    page.wait_for_function("!document.querySelector('#duo').classList.contains('duo-folding')&&!document.querySelector('#duo').classList.contains('duo-orientation-turning')")
    ok('Crypto and Services render together in split view without horizontal overflow',page.evaluate("PeakDuo.getState().workspace.layout==='split'") and no_horizontal_overflow(page),{'state':page.evaluate('PeakDuo.getState()'),'measurements':overflow_details(page)})
    page.locator('#duo').screenshot(path=str(OUT/'restored-apps-split.png'))
    page.evaluate('PeakDuo.fold()');page.wait_for_timeout(850)
    folded_state=page.evaluate('PeakDuo.getState()');folded_overflow=no_horizontal_overflow(page)
    ok('Fold keeps the active app visible and contained',not folded_state['workspace']['expanded'] and folded_overflow,{'expanded':folded_state['workspace']['expanded'],'visible':folded_state['visible'],'overflow':folded_overflow,'layout':folded_state['workspace']['layout'],'measurements':overflow_details(page)})
    page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(250)
    page.evaluate("PeakDuo.setLayout('full'); PeakDuo.openApp('crypto','left',{external:true})")
    page.wait_for_timeout(250)
    ok('Crypto full view fits a 390 px phone viewport',visible_wallet(page) and no_horizontal_overflow(page))
    page.locator('#duo').screenshot(path=str(OUT/'restored-apps-crypto-390x844.png'))

    page.evaluate("async()=>await PeakDuo.openApp('store','left',{external:true})")
    page.wait_for_timeout(100);page.get_by_role('searchbox',name='Search available apps').fill('Crypto')
    row=page.locator('.ios-store-row[data-app-id="crypto"]')
    row.get_by_role('button',name='Remove Crypto',exact=True).click();page.wait_for_timeout(120)
    ok('Crypto uninstalls through the existing App Store route',count(page,'UninstallApp')==1 and page.evaluate("PeakPhoneLegacy.get(PeakPhoneLegacy.stores.InstalledApps).crypto===undefined"))
    page.evaluate("async()=>await PeakDuo.openApp('store','left',{external:true})")
    page.wait_for_timeout(100);page.get_by_role('searchbox',name='Search available apps').fill('Services')
    row=page.locator('.ios-store-row[data-app-id="services"]')
    row.get_by_role('button',name='Remove Services',exact=True).click();page.wait_for_timeout(120)
    ok('Services uninstalls through the existing App Store route',count(page,'UninstallApp')==2 and page.evaluate("PeakPhoneLegacy.get(PeakPhoneLegacy.stores.InstalledApps).services===undefined"))
    ok('Restored-app lifecycle has no uncaught browser errors',not errors,errors)

def test_durable_offline_rejection_releases_wallet(browser,theme):
    page,errors=launch(browser)
    prepare_folded(page)
    page.evaluate('(theme)=>PeakDuo.setPhoneSetting("appearance",theme)',theme)
    page.wait_for_function('(theme)=>document.querySelector("#duo").dataset.theme===theme',arg=theme)
    page.wait_for_timeout(220)
    settled=page.evaluate('''()=>({theme:document.querySelector('#duo').dataset.theme,background:getComputedStyle(document.querySelector('#duo')).backgroundColor,foreground:getComputedStyle(document.querySelector('#duo')).color})''')
    ok(theme+' palette settles before the rejection is submitted',settled['theme']==theme,settled)
    install(page,'Crypto');open_app(page,'Crypto')
    page.evaluate('window.__cryptoSimulateDurableOfflineRejection=true')
    page.get_by_role('button',name='Transfer Shungite',exact=True).click()
    sheet=page.get_by_role('dialog',name='Transfer virtual currency')
    sheet.get_by_role('textbox',name='Recipient phone').fill('5550000004')
    sheet.get_by_role('button',name='Review transfer',exact=True).click()
    dialog=page.get_by_role('dialog',name='Review transfer')
    operation_id=dialog.locator('.nx-operation-reference').inner_text().replace('Reference · ','')
    page.evaluate('PeakDuo.cryptoPreview.setWalletReviewRequired(true)')
    page.wait_for_timeout(220)
    ok(theme+' transfer review remains in the settled palette before submit',page.locator('#duo').get_attribute('data-theme')==theme and dialog.is_visible())
    page.locator('#duo').screenshot(path=str(OUT/f'restored-apps-transfer-rejected-{theme}-normal-fold-before-submit.png'))
    prepare_narrow_folded(page)
    page.wait_for_function('(theme)=>document.querySelector("#duo").dataset.theme===theme',arg=theme)
    ok(theme+' palette remains settled at folded 390px before submit',page.locator('#duo').get_attribute('data-theme')==theme and dialog.is_visible())
    page.locator('#duo').screenshot(path=str(OUT/f'restored-apps-transfer-rejected-{theme}-390-fold-before-submit.png'))
    exact_before=page.evaluate('window.__cryptoExactReads.length')
    generic_before=page.evaluate('()=>PeakDuo.requests.filter(r=>r.event===\'Crypto/GetOperation\'&&!r.data.OperationId).length')
    dialog.get_by_role('button',name='Confirm transfer',exact=True).click();page.wait_for_timeout(220)
    outcome=page.locator('.nx-wallet-outcome')
    rejection_check_index=len(checks)
    ok('The server-shaped durable offline rejection resolves its exact saved reference and preserves the rejection reason',len(page.evaluate('window.__cryptoWrites'))==1 and page.evaluate('window.__cryptoWrites[0].saved.OperationId')==operation_id and page.evaluate('window.__cryptoWrites[0].response.Status')=='rejected' and outcome.is_visible() and operation_id in outcome.inner_text() and 'Choose a different online character with an active phone.' in outcome.inner_text())
    no_pending=page.evaluate("""()=>{const key=Array.from({length:localStorage.length},(_,i)=>localStorage.key(i)).find(key=>key.includes('crypto-pending'));if(!key)return true;try{return JSON.parse(localStorage.getItem(key))===null;}catch{return false;}}""")
    ok('Exact rejected status clears only its own reference',no_pending and page.evaluate('(args)=>window.__cryptoExactReads.filter(id=>id===args[0]).length===args[1]+1',[operation_id,exact_before]),{'no_pending':no_pending})
    ok('A fresh generic wallet read preserves another review block after rejection',page.evaluate('(count)=>PeakDuo.requests.filter(r=>r.event===\'Crypto/GetOperation\'&&!r.data.OperationId).length===count+1',generic_before) and 'Another in-game wallet operation needs review.' in page.locator('.nx-crypto').inner_text() and page.get_by_role('button',name='Buy Shungite',exact=True).is_disabled())
    geometry=wallet_outcome_geometry(page)
    ok(theme+' rejected outcome uses readable full-width lines on folded 390px phone',geometry is not None and geometry['viewport']==390 and geometry['expanded'] is False and geometry['flexDirection']=='column' and geometry['reasonWidth']>=geometry['panelWidth']*.9 and not geometry['overflow'],geometry)
    outcome.scroll_into_view_if_needed()
    page.wait_for_timeout(220)
    narrow_visible=wallet_outcome_visibility(page)
    ok(theme+' narrow terminal rejection is in view before raw screenshot capture',narrow_visible is not None and narrow_visible['visibleFraction']>=.9,narrow_visible)
    page.wait_for_timeout(220)
    narrow_screen=OUT/f'restored-apps-transfer-rejected-{theme}-390-fold.png'
    narrow_pixels=OUT/f'restored-apps-transfer-rejected-{theme}-390-fold-outcome.png'
    page.locator('#duo').screenshot(path=str(narrow_screen))
    outcome.screenshot(path=str(narrow_pixels),animations='disabled')
    page.set_viewport_size({'width':1280,'height':900});page.wait_for_timeout(300)
    normal_geometry=wallet_outcome_geometry(page)
    ok(theme+' rejected outcome remains readable on the normal folded phone',normal_geometry is not None and normal_geometry['viewport']==1280 and normal_geometry['expanded'] is False and normal_geometry['flexDirection']=='column' and normal_geometry['reasonWidth']>=normal_geometry['panelWidth']*.9 and not normal_geometry['overflow'],normal_geometry)
    outcome.scroll_into_view_if_needed();page.wait_for_timeout(220)
    normal_visible=wallet_outcome_visibility(page)
    ok(theme+' normal-fold terminal rejection is in view before raw screenshot capture',normal_visible is not None and normal_visible['visibleFraction']>=.9,normal_visible)
    normal_screen=OUT/f'restored-apps-transfer-rejected-{theme}-normal-fold.png'
    normal_pixels=OUT/f'restored-apps-transfer-rejected-{theme}-normal-fold-outcome.png'
    page.locator('#duo').screenshot(path=str(normal_screen))
    outcome.screenshot(path=str(normal_pixels),animations='disabled')
    checks[rejection_check_index]['evidence']={'theme':theme,'operation_id':operation_id,'exact_reads_before':exact_before,'exact_reads_after':len(page.evaluate('window.__cryptoExactReads')),'generic_reads_before':generic_before,'generic_reads_after':page.evaluate('()=>PeakDuo.requests.filter(r=>r.event===\'Crypto/GetOperation\'&&!r.data.OperationId).length'),'narrow_geometry':geometry,'narrow_visible_outcome':narrow_visible,'narrow_handset_screenshot':str(narrow_screen),'narrow_outcome_pixels':str(narrow_pixels),'normal_geometry':normal_geometry,'normal_visible_outcome':normal_visible,'normal_handset_screenshot':str(normal_screen),'normal_outcome_pixels':str(normal_pixels)}
    ok('Definitive-rejection workflow has no uncaught browser errors',not errors,errors)
    page.close()

def test_wallet_review_gate_race(browser):
    page,errors=launch(browser)
    prepare_folded(page)
    install(page,'Crypto');open_app(page,'Crypto')
    transfer=page.get_by_role('button',name='Transfer Shungite',exact=True)
    ok('Wallet review gate has not appeared before the valid transfer is submitted',transfer.is_enabled() and 'Another in-game wallet operation needs review.' not in page.locator('.nx-crypto').inner_text())
    page.evaluate('window.__cryptoSimulateReviewGateRace=true')
    transfer.click()
    sheet=page.get_by_role('dialog',name='Transfer virtual currency')
    sheet.get_by_role('textbox',name='Recipient phone').fill('5550000002')
    sheet.get_by_role('button',name='Review transfer',exact=True).click()
    dialog=page.get_by_role('dialog',name='Review transfer')
    operation_id=dialog.locator('.nx-operation-reference').inner_text().replace('Reference · ','')
    generic_before=count(page,'Crypto/GetOperation')
    dialog.get_by_role('button',name='Confirm transfer',exact=True).click()
    page.wait_for_function('(id)=>document.querySelector(".nx-wallet-outcome")?.textContent.includes(id)',arg=operation_id)
    outcome=page.locator('.nx-wallet-outcome')
    no_pending=page.evaluate("""()=>{const key=Array.from({length:localStorage.length},(_,i)=>localStorage.key(i)).find(key=>key.includes('crypto-pending'));if(!key)return true;try{return JSON.parse(localStorage.getItem(key))===null;}catch{return false;}}""")
    exact_reads=page.evaluate('(id)=>window.__cryptoExactReads.filter(saved=>saved===id).length',operation_id)
    race_check_index=len(checks)
    ok('A wallet-review race after submit resolves this exact reference without sending a transfer',page.evaluate('window.__cryptoReviewGateAppearedAtSubmit') and page.evaluate('window.__cryptoWrites.length')==1 and page.evaluate('window.__cryptoWrites[0].data.Phone')=='5550000002' and page.evaluate('window.__cryptoWrites[0].saved.OperationId')==operation_id and page.evaluate('window.__cryptoWrites[0].response.Status')=='rejected' and page.evaluate('window.__cryptoWrites[0].response.Msg')=='Another wallet transaction needs administrator review. This Crypto action was not submitted.' and exact_reads==1 and no_pending and operation_id in outcome.inner_text())
    page.wait_for_function('(count)=>PeakDuo.requests.filter(r=>r.event===\'Crypto/GetOperation\'&&!r.data.OperationId).length>count',arg=generic_before)
    ok('Resolving the race rejection retains the new wallet-wide review block',page.evaluate('window.__cryptoWrites[0].exactStatus.WalletReviewRequired===true') and 'Another in-game wallet operation needs review.' in page.locator('.nx-crypto').inner_text() and page.get_by_role('button',name='Buy Shungite',exact=True).is_disabled())
    normal_race_geometry=wallet_outcome_geometry(page)
    ok('Wallet-review race outcome remains readable on the normal folded phone',normal_race_geometry is not None and normal_race_geometry['viewport']==1280 and normal_race_geometry['expanded'] is False and normal_race_geometry['flexDirection']=='column' and normal_race_geometry['reasonWidth']>=normal_race_geometry['panelWidth']*.9 and not normal_race_geometry['overflow'],normal_race_geometry)
    outcome.scroll_into_view_if_needed()
    page.wait_for_timeout(220)
    normal_race_visible=wallet_outcome_visibility(page)
    ok('Normal-fold wallet-review race outcome is in view before raw screenshot capture',normal_race_visible is not None and normal_race_visible['visibleFraction']>=.9,normal_race_visible)
    normal_race_screen=OUT/'restored-apps-transfer-wallet-review-race-normal-fold.png'
    normal_race_pixels=OUT/'restored-apps-transfer-wallet-review-race-normal-fold-outcome.png'
    page.locator('#duo').screenshot(path=str(normal_race_screen))
    outcome.screenshot(path=str(normal_race_pixels),animations='disabled')
    prepare_narrow_folded(page)
    narrow_race_geometry=wallet_outcome_geometry(page)
    ok('Wallet-review race outcome keeps readable width on folded 390px phone',narrow_race_geometry is not None and narrow_race_geometry['viewport']==390 and narrow_race_geometry['expanded'] is False and narrow_race_geometry['flexDirection']=='column' and narrow_race_geometry['reasonWidth']>=narrow_race_geometry['panelWidth']*.9 and not narrow_race_geometry['overflow'],narrow_race_geometry)
    outcome.scroll_into_view_if_needed();page.wait_for_timeout(220)
    narrow_race_visible=wallet_outcome_visibility(page)
    ok('Narrow-fold wallet-review race outcome is in view before raw screenshot capture',narrow_race_visible is not None and narrow_race_visible['visibleFraction']>=.85,narrow_race_visible)
    narrow_race_screen=OUT/'restored-apps-transfer-wallet-review-race-390-fold.png'
    narrow_race_pixels=OUT/'restored-apps-transfer-wallet-review-race-390-fold-outcome.png'
    page.locator('#duo').screenshot(path=str(narrow_race_screen))
    outcome.screenshot(path=str(narrow_race_pixels),animations='disabled')
    checks[race_check_index]['evidence']={'operation_id':operation_id,'exact_reads':exact_reads,'generic_reads_after':count(page,'Crypto/GetOperation'),'normal_geometry':normal_race_geometry,'normal_visible_outcome':normal_race_visible,'normal_handset_screenshot':str(normal_race_screen),'normal_outcome_pixels':str(normal_race_pixels),'narrow_geometry':narrow_race_geometry,'narrow_visible_outcome':narrow_race_visible,'narrow_handset_screenshot':str(narrow_race_screen),'narrow_outcome_pixels':str(narrow_race_pixels)}
    ok('Wallet-review race workflow has no uncaught browser errors',not errors,errors)
    page.close()

def request_count(page,event):
    return page.evaluate('(e)=>PeakDuo.requests.filter(r=>r.event===e).length',event)

def return_via_app_switcher(page,name):
    gesture=page.get_by_role('button',name='Home on left')
    box=gesture.bounding_box();x=box['x']+box['width']/2;y=box['y']+box['height']/2
    page.mouse.move(x,y);page.mouse.down();page.mouse.move(x,y-260,steps=8);page.wait_for_timeout(270);page.mouse.up()
    switcher=page.get_by_role('dialog',name='App Switcher');expect(switcher).to_be_visible()
    page.wait_for_timeout(500)
    parked='Crypto' if name=='Crypto' else 'Services'
    for _ in range(3):
        selected=page.locator('.duo-switcher-card[data-selected="true"]').get_attribute('data-app')
        if selected==parked.lower():break
        page.keyboard.press('ArrowRight');page.wait_for_timeout(500)
    else:raise AssertionError('The retained '+parked+' app could not be centered in the switcher.')
    page.locator('#duo').screenshot(path=str(OUT/f'restored-apps-{parked.lower()}-parked-in-switcher.png'))
    switcher.get_by_role('button',name='Return to '+name,exact=True).click();page.wait_for_timeout(240)

def test_retained_activation_refreshes(browser):
    page,errors=launch(browser)
    install(page,'Services');install(page,'Crypto')
    open_app(page,'Crypto')
    crypto_status=request_count(page,'Crypto/GetOperation');crypto_balance=request_count(page,'Crypto/GetCrypto')
    open_app(page,'Services')
    return_via_app_switcher(page,'Crypto')
    page.wait_for_function("(count)=>PeakDuo.requests.filter(r=>r.event==='Crypto/GetOperation').length>count",arg=crypto_status)
    page.wait_for_function("(count)=>PeakDuo.requests.filter(r=>r.event==='Crypto/GetCrypto').length>count",arg=crypto_balance)
    ok('Switching from Services back to retained Crypto refreshes balances and exact status',request_count(page,'Crypto/GetOperation')>crypto_status and request_count(page,'Crypto/GetCrypto')>crypto_balance)
    page.locator('#duo').screenshot(path=str(OUT/'restored-apps-crypto-reopened.png'))
    checks[-1]['evidence']={'Crypto/GetOperation_before':crypto_status,'Crypto/GetOperation_after':request_count(page,'Crypto/GetOperation'),'Crypto/GetCrypto_before':crypto_balance,'Crypto/GetCrypto_after':request_count(page,'Crypto/GetCrypto'),'screenshot':str(OUT/'restored-apps-crypto-reopened.png'),'parked_app_screenshot':str(OUT/'restored-apps-crypto-parked-in-switcher.png')}
    open_app(page,'Services')
    services_emergency=request_count(page,'Services/GetEmergencyWorkers');services_tow=request_count(page,'Services/GetTowWorkers')
    open_app(page,'Crypto')
    return_via_app_switcher(page,'Services')
    page.wait_for_function("(count)=>PeakDuo.requests.filter(r=>r.event==='Services/GetEmergencyWorkers').length>count",arg=services_emergency)
    page.wait_for_function("(count)=>PeakDuo.requests.filter(r=>r.event==='Services/GetTowWorkers').length>count",arg=services_tow)
    ok('Switching from Crypto back to retained Services refreshes both worker lists',request_count(page,'Services/GetEmergencyWorkers')>services_emergency and request_count(page,'Services/GetTowWorkers')>services_tow)
    page.locator('#duo').screenshot(path=str(OUT/'restored-apps-services-reopened.png'))
    checks[-1]['evidence']={'Services/GetEmergencyWorkers_before':services_emergency,'Services/GetEmergencyWorkers_after':request_count(page,'Services/GetEmergencyWorkers'),'Services/GetTowWorkers_before':services_tow,'Services/GetTowWorkers_after':request_count(page,'Services/GetTowWorkers'),'screenshot':str(OUT/'restored-apps-services-reopened.png'),'parked_app_screenshot':str(OUT/'restored-apps-services-parked-in-switcher.png')}
    ok('Retained app-switcher refreshes have no uncaught browser errors',not errors,errors)
    page.close()

def test_uncertain_reopen_and_identity(browser,field):
    page,errors=launch(browser)
    install(page,'Crypto');open_app(page,'Crypto')
    page.evaluate("PeakDuo.cryptoPreview.setMode('uncertain')")
    page.get_by_role('button',name='Buy Shungite',exact=True).click()
    page.get_by_role('button',name='Review purchase',exact=True).click()
    dialog=page.get_by_role('dialog',name='Review purchase')
    operation_id=dialog.locator('.nx-operation-reference').inner_text().replace('Reference · ','')
    dialog.get_by_role('button',name='Confirm purchase',exact=True).click();page.wait_for_timeout(220)
    ok('Uncertain action remains attached to its original reference',page.locator('.nx-operation-reference').filter(has_text=operation_id).count()==1 and 'Do not send again' in page.locator('.nx-crypto').inner_text())
    writes=count(page,'Crypto/BuyCrypto');exact_reads=page.evaluate('(id)=>PeakDuo.requests.filter(r=>r.event===\'Crypto/GetOperation\'&&r.data.OperationId===id).length',operation_id)
    page.evaluate("PeakDuo.home('left')");page.wait_for_timeout(120)
    page.evaluate("async()=>await PeakDuo.openApp('crypto','left',{external:true})");page.wait_for_timeout(220)
    after_reads=page.evaluate('(id)=>PeakDuo.requests.filter(r=>r.event===\'Crypto/GetOperation\'&&r.data.OperationId===id).length',operation_id)
    ok('Reopening an uncertain action performs only its exact read, never a second write',count(page,'Crypto/BuyCrypto')==writes==1 and after_reads==exact_reads+1)
    player=page.evaluate('PeakPhoneLegacy.get(PeakPhoneLegacy.stores.PlayerData)')
    page.evaluate('(data)=>PeakPhoneLegacy.stores.PlayerData.set({...data,["'+field+'"]:data["'+field+'"]+"-CHANGED"})',player)
    page.wait_for_timeout(100)
    ok(field+' change clears the mounted wallet view','Character changed' in page.locator('.nx-crypto').inner_text() and count(page,'Crypto/BuyCrypto')==1)
    ok(field+' change causes no browser errors',not errors,errors)
    page.close()

def test_storage_failure(browser):
    page,errors=launch(browser)
    install(page,'Crypto');open_app(page,'Crypto')
    page.evaluate('''()=>{const original=localStorage.setItem.bind(localStorage);localStorage.setItem=(key,value)=>{if(String(key).includes('crypto-pending'))throw new Error('Synthetic local storage unavailable');return original(key,value);};}''')
    page.get_by_role('button',name='Buy Shungite',exact=True).click()
    page.get_by_role('button',name='Review purchase',exact=True).click()
    page.get_by_role('dialog',name='Review purchase').get_by_role('button',name='Confirm purchase',exact=True).click()
    page.wait_for_timeout(120)
    ok('Storage failure prevents the write route and leaves no saved operation ID',count(page,'Crypto/BuyCrypto')==0 and page.evaluate("Array.from({length:localStorage.length},(_,i)=>localStorage.key(i)).every(key=>!key.includes('crypto-pending'))"))
    ok('Storage-failure workflow has no uncaught browser errors',not errors,errors)
    page.close()

def run():
 with sync_playwright() as playwright:
  browser=playwright.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
  page,errors=launch(browser)
  test_install_and_service(page)
  test_crypto_flow(page,errors)
  page.close()
  test_durable_offline_rejection_releases_wallet(browser,'light')
  test_durable_offline_rejection_releases_wallet(browser,'dark')
  test_wallet_review_gate_race(browser)
  test_retained_activation_refreshes(browser)
  test_uncertain_reopen_and_identity(browser,'Cid')
  test_uncertain_reopen_and_identity(browser,'DeviceId')
  test_storage_failure(browser)
  browser.close()
  (OUT/'restored-apps-browser-tests.json').write_text(json.dumps(checks,indent=2))
  print(f'{len(checks)} restored-app browser checks passed. Synthetic preview only.')

if __name__=='__main__':
 try:run()
 except Exception as error:
  checks.append({'name':'FAILED','passed':False,'error':str(error),'traceback':traceback.format_exc()})
  (OUT/'restored-apps-browser-tests.json').write_text(json.dumps(checks,indent=2));traceback.print_exc();sys.exit(1)
