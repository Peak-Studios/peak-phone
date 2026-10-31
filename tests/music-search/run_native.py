"""Run catalog tests with the repository's Lua 5.4 adapter; no live provider calls."""
from pathlib import Path
import os
import runpy

ROOT = Path(__file__).resolve().parents[2]
adapter = runpy.run_path(str(ROOT / 'tests/portable/lua_runner.py'))
os.chdir(ROOT)
for name in ['server/sv_music_search.lua', 'client/cl_music_search.lua', 'fxmanifest.lua']:
    adapter['run']((ROOT / name).read_text(encoding='utf-8'), name)
case = ROOT / 'tests/music-search/native.lua'
adapter['run'](case.read_text(encoding='utf-8'), str(case), execute=True)
