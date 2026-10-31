"""Build a server-ready release zip: peak-phone + peak-duo-prop + peak-sim-assets.

Usage: python tools/package-release.py [output.zip]
Only tracked files are packaged; development folders are left out.
"""
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
version = next(l.split("'")[1] for l in (ROOT / 'fxmanifest.lua').read_text(encoding='utf-8').splitlines() if l.startswith('version '))
out = Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / 'artifacts' / f'peak-phone-{version}.zip').resolve()
out.parent.mkdir(parents=True, exist_ok=True)

DEV = ('tests/', 'tools/', 'docs/', 'extras/', 'web/src/', 'web/legacy/', '.github/', 'artifacts/')
DEV_FILES = {'package.json', 'web/package.json', 'web/package-lock.json', 'web/rollup.config.js', '.gitignore', '.gitattributes'}
COMPANIONS = {'extras/peak-duo-prop/': 'peak-duo-prop/', 'extras/peak-sim-assets/': 'peak-sim-assets/'}

files = subprocess.run(['git', 'ls-files'], cwd=ROOT, capture_output=True, text=True, check=True).stdout.splitlines()
count = 0
with zipfile.ZipFile(out, 'x', zipfile.ZIP_DEFLATED) as z:
    for f in files:
        target = None
        for prefix, dest in COMPANIONS.items():
            if f.startswith(prefix):
                target = dest + f[len(prefix):]
        if target is None and not f.startswith(DEV) and f not in DEV_FILES:
            target = 'peak-phone/' + f
        if target:
            z.write(ROOT / f, target); count += 1
print(f'Wrote {out} ({count} files)')
