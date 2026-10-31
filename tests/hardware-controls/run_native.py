"""Run phone output contracts using the existing Lua 5.4/Lupa test adapter."""
from pathlib import Path
import os
import runpy

ROOT = Path(__file__).resolve().parents[2]
adapter = runpy.run_path(str(ROOT / 'tests/portable/lua_runner.py'))
os.chdir(ROOT)
case = ROOT / 'tests/hardware-controls/native.lua'
adapter['run'](case.read_text(encoding='utf-8'), str(case), execute=True)
