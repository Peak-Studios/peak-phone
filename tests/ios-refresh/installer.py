from pathlib import Path
import tempfile,shutil,subprocess,json,hashlib,sys
import argparse
parser=argparse.ArgumentParser(description='Test the UI patch in temporary resource copies only.')
parser.add_argument('--patch',type=Path,required=True)
parser.add_argument('--baseline',type=Path,required=True)
args=parser.parse_args()
P=args.patch.resolve();B=args.baseline.resolve();OUT=Path(__file__).resolve().parents[2]/'artifacts/ios-refresh/installer-tests.json'
checks=[]
def ok(name,value=True):
 if not value:raise AssertionError(name)
 checks.append({'name':name,'passed':True});print('PASS',name)
def hashes(root):return {str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in root.rglob('*') if p.is_file()}
with tempfile.TemporaryDirectory() as td:
 t=Path(td);patch=t/'patch';shutil.copytree(P,patch,ignore=shutil.ignore_patterns('backups','__pycache__'));r=t/'peak-phone';shutil.copytree(B,r);original=hashes(r);manifest=json.loads((patch/'patch-manifest.json').read_text());items=manifest['files']
 def run(*args):
  ret=subprocess.run([sys.executable,str(patch/'apply_ui_refresh.py'),'--resource',str(r),*map(str,args)],capture_output=True,text=True)
  return ret.returncode,json.loads(ret.stdout)
 code,data=run();ok('Dry run returns ready with no writes',code==0 and data['status']=='ready' and hashes(r)==original)
 target=patch/'payload'/items[0]['path'];saved=target.read_bytes();target.write_bytes(saved+b'corrupted')
 code,data=run('--apply');ok('Corrupt payload rejected before writes',code==1 and hashes(r)==original);target.write_bytes(saved)
 existing=next(x for x in items if x['before_sha256']);target=r/existing['path'];saved=target.read_bytes();target.write_bytes(saved+b'local edit')
 code,data=run('--apply');ok('Modified input file causes no-write conflict',code==2 and target.read_bytes()==saved+b'local edit');target.write_bytes(saved)
 new=next(x for x in items if x['before_sha256'] is None);target=r/new['path'];target.parent.mkdir(parents=True,exist_ok=True);target.write_text('Preexisting user data')
 code,data=run('--apply');ok('New-file collision never overwritten',code==2 and target.read_text()=='Preexisting user data');target.unlink()
 # Simulate an unexpected existing link in the live asset tree.
 link=r/'web/public/duo/ios.css';outside=t/'outside.css';outside.write_text('outside');link.symlink_to(outside)
 code,data=run('--apply');ok('Symlink in a target path is rejected',code==1 and outside.read_text()=='outside');link.unlink()
 backup=t/'backup';code,data=run('--apply','--backup-dir',backup)
 ok('Apply succeeds and creates a backup manifest',code==0 and data['status']=='applied' and (backup/'backup.json').is_file())
 actual=hashes(r);ok('Every installed file matches its post-update digest',all(actual.get(x['path'])==x['after_sha256'] for x in items))
 protected=[path for path in original if path.endswith('.lua') or path.startswith(('server/','bridge/','integrations/','sql/','config-examples/','shared/')) or path=='fxmanifest.lua']
 ok('All protected backend/config files remain unchanged',all(actual[x]==original[x] for x in protected))
 code,data=run('--apply');ok('Second apply is a no-op',code==0 and data['status']=='already_applied' and hashes(r)==actual)
 code,data=run('--rollback',backup);ok('Rollback dry run does not write',code==0 and data['status']=='ready' and hashes(r)==actual)
 target=r/existing['path'];saved=target.read_bytes();target.write_bytes(saved+b'new edit')
 code,data=run('--rollback',backup,'--apply');ok('Rollback refuses later modifications',code==2 and target.read_bytes()==saved+b'new edit');target.write_bytes(saved)
 code,data=run('--rollback',backup,'--apply');ok('Rollback restores exact baseline and removes added files',code==0 and data['status']=='rolled_back' and hashes(r)==original)
 code,data=run('--rollback',backup,'--apply');ok('Repeated rollback is a no-op',code==0 and data['files']==0 and hashes(r)==original)
 ok('Original working source was never modified',hashes(B)==original)
OUT.parent.mkdir(parents=True,exist_ok=True);OUT.write_text(json.dumps(checks,indent=2));print(len(checks),'installer checks passed.')
