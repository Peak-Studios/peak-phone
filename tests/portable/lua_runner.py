"""Current portable Lua syntax and deterministic mocked contract suite (not FXServer)."""
from pathlib import Path
import ctypes as C, ctypes.util, json, re
ROOT=Path(__file__).resolve().parents[2]
try: lib=C.CDLL(ctypes.util.find_library('lua5.4') or 'liblua5.4.so.0')
except OSError: lib=None
if lib:
    lib.luaL_newstate.restype=C.c_void_p
    lib.luaL_openlibs.argtypes=[C.c_void_p]
    lib.luaL_loadbufferx.argtypes=[C.c_void_p,C.c_char_p,C.c_size_t,C.c_char_p,C.c_char_p]
    lib.lua_pcallk.argtypes=[C.c_void_p,C.c_int,C.c_int,C.c_int,C.c_longlong,C.c_void_p]
    lib.lua_tolstring.argtypes=[C.c_void_p,C.c_int,C.c_void_p];lib.lua_tolstring.restype=C.c_char_p
    lib.lua_getglobal.argtypes=[C.c_void_p,C.c_char_p]
    lib.lua_tointegerx.argtypes=[C.c_void_p,C.c_int,C.c_void_p];lib.lua_tointegerx.restype=C.c_longlong
    lib.lua_close.argtypes=[C.c_void_p]
def run(text,name,execute=False):
    if not lib:
        try:
            from lupa import LuaRuntime
            lua=LuaRuntime(unpack_returned_tuples=True)
            if execute:
                try: lua.execute(text,name)
                except Exception as exc: raise AssertionError(f'{name}: {exc}') from exc
            else:
                valid,error=lua.eval('function(source,name) local chunk,err=load(source,name); return chunk~=nil,err end')(text,name)
                if not valid: raise AssertionError(error)
            return int(lua.globals().TEST_COUNT or 0) if execute else 0
        except ImportError as exc: raise RuntimeError('Install Lua 5.4 or the developer-only lupa package to run Lua verification.') from exc
    L=lib.luaL_newstate();lib.luaL_openlibs(L);raw=text.encode()
    status=lib.luaL_loadbufferx(L,raw,len(raw),name.encode(),None)
    if status==0 and execute:status=lib.lua_pcallk(L,0,0,0,0,None)
    if status:
        msg=lib.lua_tolstring(L,-1,None).decode();lib.lua_close(L);raise AssertionError(msg)
    count=0
    if execute:lib.lua_getglobal(L,b'TEST_COUNT');count=lib.lua_tointegerx(L,-1,None)
    lib.lua_close(L);return count
if __name__=='__main__':
    syntax=[];adapted=[]
    for f in sorted([p for d in ['bridge','shared','client','server','integrations','jobs'] for p in (ROOT/d).glob('*.lua')]+[ROOT/'config.lua',ROOT/'sv_config.lua',ROOT/'fxmanifest.lua']):
        text=f.read_text()
        try:run(text,str(f))
        except AssertionError:
            patched=re.sub(r'(?<![\w\"\'])`([A-Za-z_][\w]*)`',r'GetHashKey("\1")',text)
            if patched==text:raise
            run(patched,str(f));adapted.append(str(f.relative_to(ROOT)))
        syntax.append(str(f.relative_to(ROOT)))
    results={}
    base=(ROOT/'tests/portable/mock_base.lua').read_text()
    def lua_literal(v):
        if v is None: return 'nil'
        if isinstance(v,bool): return 'true' if v else 'false'
        if isinstance(v,str): return json.dumps(v,ensure_ascii=False)
        if isinstance(v,(int,float)): return str(v)
        if isinstance(v,list): return '{'+','.join(map(lua_literal,v))+'}'
        return '{'+','.join('['+lua_literal(k)+']='+lua_literal(x) for k,x in v.items())+'}'
    # JSON-decoding is outside the fixture; validate the real shipped definitions.
    base+='\nJOB_DEFAULTS='+lua_literal(json.loads((ROOT/'jobs/defaults.json').read_text()))+'\n'
    base+='\nCLIENT_LUA_FILES='+lua_literal([str(p.relative_to(ROOT)).replace('\\','/') for p in sorted((ROOT/'client').glob('*.lua'))])+'\n'
    for f in sorted((ROOT/'tests/portable').glob('case_*.lua')):
        results[f.name]=run('ROOT='+json.dumps(str(ROOT))+'\n'+base+'\n'+f.read_text(),f.name,True)
    report={'syntax_files':len(syntax),'syntax_passed':syntax,'cfx_hash_literals_adapted':adapted,'mocked_checks':results,'mocked_total':sum(results.values()),'liveFiveM':False,'liveMySQL':False,'actualPeakBridge':False}
    (ROOT/'artifacts/portable/lua-results.json').parent.mkdir(parents=True,exist_ok=True);(ROOT/'artifacts/portable/lua-results.json').write_text(json.dumps(report,indent=2))
    print(json.dumps({k:v for k,v in report.items() if k!='syntax_passed'},indent=2))
