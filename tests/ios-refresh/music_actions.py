"""Additional Music actions against a stateful synthetic server contract."""
from pathlib import Path
import json,os,sys,traceback
from playwright.sync_api import sync_playwright
from offline import offline_html
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'artifacts/ios-refresh';checks=[]
def ok(name,value=True):
 if not value:raise AssertionError(name)
 checks.append({'name':name,'passed':True});print('PASS',name,flush=True)
def click(pg,name,scope=None):
 (scope or pg).get_by_role('button',name=name,exact=True).click();pg.wait_for_timeout(150)
def option(pg,text):pg.locator('.pm-sheet .pm-promo').filter(has_text=text).click();pg.wait_for_timeout(100)
def run():
 with sync_playwright() as p:
  b=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
  pg=b.new_page(viewport={'width':1920,'height':1080});pg.set_default_timeout(6000);pg.route('**/*',lambda r:r.abort());errors=[];pg.on('pageerror',lambda e:errors.append(str(e)))
  pg.set_content(offline_html());pg.wait_for_function('document.documentElement.dataset.duoReady==="true"');pg.wait_for_timeout(500);pg.evaluate("PeakDuo.openApp('peakify','left',{external:true})");pg.wait_for_timeout(180)
  click(pg,'Library',pg.locator('.pm-tabs'));click(pg,'Options for Coastline');option(pg,'Add to playlist')
  ok('Duplicate playlist additions are visibly disabled',pg.locator('.pm-sheet .pm-promo').filter(has_text='After hours').is_disabled())
  pg.keyboard.press('Escape');click(pg,'Playlists',pg.locator('.ios-segmented'));pg.locator('.pm-playlist-row').click();pg.wait_for_timeout(100)
  click(pg,'Options for Coastline');option(pg,'Remove from playlist');click(pg,'Cancel',pg.locator('.pm-confirm-actions'))
  ok('Cancelling removal keeps playlist relation',pg.locator('.pm-song-row').count()==2)
  click(pg,'Options for Coastline');option(pg,'Remove from playlist');click(pg,'Delete',pg.locator('.pm-confirm-actions'))
  ok('Confirmed playlist removal reloads server relation',pg.locator('.pm-song-row').count()==1)
  ok('Removed playlist song remains in owned library',pg.evaluate("window.PeakDuo.previewAdapter.musicFixture.state.Tracks.length")==4)
  click(pg,'Playlist options');option(pg,'Delete playlist');click(pg,'Delete',pg.locator('.pm-confirm-actions'))
  ok('Owner can delete playlist without deleting tracks',pg.evaluate("(()=>{const s=window.PeakDuo.previewAdapter.musicFixture.state;return !s.Playlists.length && s.Tracks.length===4;})()"))
  click(pg,'Songs',pg.locator('.ios-segmented'));click(pg,'Options for Coastline');option(pg,'Delete from library');click(pg,'Delete',pg.locator('.pm-confirm-actions'))
  ok('Deleting a song reloads owned songs',pg.locator('.pm-song-row').count()==3)
  pg.evaluate("PeakPhoneLegacy.stores.CurrentNetwork.set('peakify-boombox-preview')");click(pg,'Play Blue Hour');click(pg,'Open Now Playing')
  ok('Now Playing feedback is in layout, not over transport buttons',pg.locator('.pm-sheet-feedback').evaluate('(n)=>getComputedStyle(n).position')=='static')
  click(pg,'Play next saved song');ok('Next selects next saved song through existing Play callback','Night Drive' in pg.locator('.pm-mini').inner_text())
  ok('Skipping retains the Now Playing sheet and keyboard focus',pg.locator('.pm-now').count()==1 and pg.evaluate('document.activeElement?.getAttribute("aria-label")')=='Play next saved song')
  click(pg,'Play previous saved song');ok('Previous selects previous saved song through existing Play callback','Blue Hour' in pg.locator('.pm-mini').inner_text())
  pg.keyboard.press('Escape');pg.wait_for_timeout(80)
  pg.evaluate("{const f=window.PeakDuo.previewAdapter.musicFixture;f.state.Playlists.push({id:99,name:'Shared collection',description:'Test shared access',isOwner:false,ownerName:'Someone else',collaborators:[],tracks:[f.state.Tracks[0]]});}")
  click(pg,'Refresh library',pg.locator('.pm-header'));click(pg,'Playlists',pg.locator('.ios-segmented'));pg.locator('.pm-playlist-row').click();pg.wait_for_timeout(80)
  click(pg,'Playlist options');ok('Shared playlist does not expose owner delete',pg.locator('.pm-sheet .pm-promo').filter(has_text='Delete playlist').count()==0)
  option(pg,'Collaborators');ok('Shared playlist does not expose collaborator writes',pg.locator('.pm-sheet input').count()==0 and 'Only the playlist owner' in pg.locator('.pm-sheet').inner_text());pg.keyboard.press('Escape')
  # Keyboard containment is scoped to this app; the other pane remains usable.
  click(pg,'Add music',pg.locator('.pm-header'));option(pg,'Add song');pg.keyboard.press('Tab');pg.keyboard.press('Tab');pg.keyboard.press('Tab');pg.keyboard.press('Tab')
  ok('Music sheet contains keyboard focus',pg.evaluate('!!document.activeElement.closest(".pm-sheet")'))
  pg.evaluate('PeakDuo.fold()');pg.wait_for_timeout(760);pg.evaluate("PeakDuo.openApp('calculator','right',{external:true})");pg.wait_for_timeout(120)
  ok('Music dialog leaves second workspace interactive',pg.locator('.duo-app-instance[data-app=calculator]').is_visible() and not pg.locator('.duo-pane[data-side=right]').evaluate('n=>n.inert'))
  ok('All additional actions complete without uncaught browser errors',not errors)
  pg.close();b.close()
if __name__=='__main__':
 try:run()
 except Exception as e:
  checks.append({'name':'FAILED','passed':False,'error':str(e),'traceback':traceback.format_exc()});(OUT/'music-actions.json').write_text(json.dumps(checks,indent=2));traceback.print_exc();sys.exit(1)
 (OUT/'music-actions.json').write_text(json.dumps(checks,indent=2));print(f'{len(checks)} additional Music action checks passed; mocked services only.')
