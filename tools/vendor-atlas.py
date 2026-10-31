#!/usr/bin/env python3
"""Optionally vendor the pinned atlas for offline FiveM clients. Python 3.9+.

Run from the resource directory: python tools/vendor-atlas.py --activate
No third-party Python packages are required. No game/server configuration is changed.
The default resource already uses the remote atlas; this is optional self-hosting.
"""
from __future__ import annotations
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import json
from pathlib import Path
import re
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

PIN = '00e4c30b797aa3993435664769a905c14224a1a2'
BASE = f'https://raw.githubusercontent.com/SToXiT/gta-v-map-leaflet_-fire_borne/{PIN}/mapStyles/styleAtlas'
ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'web/public/duo/map-atlas'
CONFIG = ROOT / 'web/public/duo/map-config.mjs'

def is_jpeg(data: bytes) -> bool:
    return 64 < len(data) < 2 * 1024 * 1024 and data.startswith(b'\xff\xd8\xff') and data.endswith(b'\xff\xd9')

def get_tile(tile: tuple[int,int,int]) -> tuple[str,str]:
    z,x,y = tile
    relative = f'{z}/{x}/{y}.jpg'
    target = DEST / relative
    if target.is_file():
        data = target.read_bytes()
        if is_jpeg(data):
            return relative, hashlib.sha256(data).hexdigest()
    error = None
    for attempt in range(3):
        try:
            req = Request(f'{BASE}/{relative}', headers={'User-Agent':'Peak-Phone-Atlas-Vendor/1.0'})
            with urlopen(req, timeout=25) as response:
                data = response.read(2 * 1024 * 1024 + 1)
            if not is_jpeg(data):
                raise ValueError('The upstream response is not a bounded complete JPEG.')
            target.parent.mkdir(parents=True, exist_ok=True)
            temporary = target.with_suffix('.jpg.part')
            temporary.write_bytes(data)
            temporary.replace(target)
            return relative, hashlib.sha256(data).hexdigest()
        except (HTTPError, URLError, TimeoutError, ValueError, OSError) as exc:
            error = exc
            if isinstance(exc, HTTPError) and exc.code in (403,404):
                break
            if attempt < 2:
                time.sleep(1 + attempt)
    raise RuntimeError(f'{relative}: {error}')

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--activate', action='store_true', help='Switch Maps to local tiles ONLY after every tile is available.')
    parser.add_argument('--workers',type=int,default=4,choices=range(1,9),metavar='1..8')
    args = parser.parse_args()
    if not CONFIG.is_file():
        parser.error('Keep this tool inside the complete phone resource.')
    tiles=[(z,x,y) for z in range(6) for x in range(2**z) for y in range(2**z)]
    print(f'Vendoring {len(tiles)} atlas JPEG tiles from pinned revision {PIN}.')
    results,errors={},[]
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures=[pool.submit(get_tile,tile) for tile in tiles]
        for count,future in enumerate(as_completed(futures),1):
            try:
                name,digest=future.result();results[name]=digest
            except Exception as error:
                errors.append(str(error))
            if count % 100 == 0 or count == len(tiles):
                print(f'{count}/{len(tiles)} checked; {len(errors)} failed.',flush=True)
    DEST.mkdir(parents=True, exist_ok=True)
    (DEST/'manifest.json').write_text(json.dumps({'source':BASE,'commit':PIN,'sha256':results,'errors':errors},indent=2)+'\n',encoding='utf-8')
    if errors:
        print('\n'.join(errors[:20]),file=sys.stderr)
        print('Atlas incomplete. Map configuration was NOT changed. Fix connectivity and rerun; valid tiles are reused.',file=sys.stderr)
        return 1
    if args.activate:
        content=CONFIG.read_text(encoding='utf-8')
        # Match the live setting only, not the commented example.
        updated,count=re.subn(r"(?m)^(\s*)tileTemplate:'[^']*',",r"\1tileTemplate:'./duo/map-atlas/{z}/{x}/{y}.jpg',",content,count=1)
        if count != 1:
            print('Tiles downloaded, but the config format changed. Update tileTemplate manually.',file=sys.stderr)
            return 1
        backup=CONFIG.with_suffix('.mjs.before-local-atlas')
        if not backup.exists():
            backup.write_text(content,encoding='utf-8')
        temporary=CONFIG.with_suffix('.mjs.tmp');temporary.write_text(updated,encoding='utf-8');temporary.replace(CONFIG)
        print('All tiles verified. Maps now uses the local atlas; restart the phone resource.')
    else:
        print('All tiles verified. Run again with --activate to switch Maps to offline mode.')
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
