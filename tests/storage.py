"""Run with Python + lupa installed. Executes actual Lua 5.1; mocks only Dota APIs."""
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
from types import ModuleType, SimpleNamespace

from lupa.lua51 import LuaRuntime

MOD = Path(__file__).resolve().parents[1] / "Minify/mods/Show MMR"
source = (MOD / 'files/scripts/vscripts/core/coreinit.lua').read_text()
client = LuaRuntime()
client.execute('''
    IsServer = function() return false end
    print = function(message) observed = message end
    SendToConsole = function() error('client discovery must not execute commands') end
''')
client.execute(source)
assert client.globals().ShowMMR is None
assert 'server=false client_console=function' in client.globals().observed
lua = LuaRuntime(unpack_returned_tuples=True)


def table(value):
    if isinstance(value, dict):
        return lua.table_from({k: table(v) for k, v in value.items()})
    if isinstance(value, list):
        return lua.table_from([table(v) for v in value])
    return value


lua.globals().decode_json = lambda text: table(json.loads(text))
lua.execute('''
    IsServer = function() return true end
    class = function(t) return t end
    ListenToGameEvent = function() end
    Dynamic_Wrap = function(t, name) return t[name] end
    commands, files, nettables = {}, {}, {}
    SendToServerConsole = function(command) table.insert(commands, command) end
    LoadKeyValues = function(path) return files[path] end
    json = {decode = function(text) return decode_json(text) end}
    CustomGameEventManager = {RegisterListener = function() end}
    CustomNetTables = {SetTableValue = function(_, _, key, value) nettables[key] = value end}
''')
lua.execute(source)
lua.execute('''
    ShowMMR:Init({networkid = 'invalid'})
    assert(ShowMMR.user == nil)
    ShowMMR:Init({networkid = '[U:1:123]'})
    assert(nettables.state.count == 0)
    ShowMMR:Refresh(nil, {user='123', time=1783404000, previous=0, mmr=6000})
    assert(next(ShowMMR.data) == nil and #commands == 0, 'no backfilled delta without a pre-match baseline')
    ShowMMR:Baseline(nil, {user='123', idle=1, calibrated=1, mmr=6000, at=1783404001, previous=1783404000})
    local writes = #commands
    ShowMMR:Refresh(nil, {user='123', time=1783405000, previous=1783404000, mmr=6000,
        idle=1, calibrated=1, finished=1, outcome=1, at=1783406000})
    ShowMMR:Refresh(nil, {user='456', time=1783405000, previous=1783404000, mmr=6025})
    ShowMMR:Refresh(nil, {user='123', time=1783405000, previous=1783404000, mmr=0/0})
    assert(#commands == writes)
    local conflicting = {user='123', time=1783405000, previous=1783404000, mmr=6025,
        idle=1, calibrated=1, finished=1, outcome=-1, at=1783406000}
    ShowMMR:Refresh(nil, conflicting)
    assert(#commands == writes and next(ShowMMR.data) == nil and ShowMMR.pending.mmr == 6000,
        'positive MMR with a loss result must retain pending without writes')
    conflicting.outcome = nil
    ShowMMR:Refresh(nil, conflicting)
    assert(#commands == writes, 'missing outcome must not consume pending')
    ShowMMR:Refresh(nil, {user='123', time=1783405000, previous=1783404000, mmr=6025, change=999,
        idle=1, calibrated=1, finished=1, outcome=1, at=1783406000})
    assert(ShowMMR.data[1783405000][2] == 25)
    writes = #commands
    ShowMMR:Refresh(nil, {user='123', time=1783405000, previous=1783404000, mmr=6100, change=0})
    assert(#commands == writes and ShowMMR.data[1783405000][2] == 25)
    ShowMMR:Init({networkid = '[U:1:123]'})
    assert(ShowMMR.data[1783405000][2] == 25)
    ShowMMR:Refresh(nil, {user='123', time=1783407000, previous=1783406000, mmr=6075,
        idle=1, calibrated=1, finished=1, outcome=1, at=1783408000})
    assert(ShowMMR.data[1783407000] == nil and ShowMMR.pending.phase == 3, 'gap retains evidence, never aggregate +50')
    assert(nettables.state.count == 1)
    assert(ShowMMR:ReadBindings({JOY1='1783404000:[6000,25]', JOY32='showmmr_user:123'})[1783404000][2] == 25)
    assert(ShowMMR:ReadBindings({JOY1='1783404000:[6000,'}) == nil)
    assert(ShowMMR:ReadBindings({JOY1='1783404000:[6000,25]', JOY32='showmmr_user:456'}) == nil)
    assert(ShowMMR:ReadBindings({JOY2='+attack'}) == nil)
    assert(ShowMMR:ReadBindings({JOY1='1783404000:[6000,25]', JOY2='1783404000:[6000,25]'}) == nil)
    ShowMMR.data = {}
    for i=1,700 do ShowMMR.data[1783404000+i] = {100000,-100000} end
    commands = {}
    ShowMMR:Save()
    assert(nettables.state.count <= 620 and nettables.state.count > 500)
    local reloaded = {JOY32='showmmr_user:123'}
    for _,command in ipairs(commands) do
        local key,value = command:match('^bindss 3 (JOY%d+) "(.*)";$')
        if key then
            assert(#value <= 500)
            reloaded[key] = value
        end
    end
    local saved = ShowMMR:ReadBindings(reloaded)
    assert(saved and saved[1783404700] and not saved[1783404001])
    files['cfg/user_keys_456_slot3.vcfg'] = {bindings={JOY1='+attack'}}
    ShowMMR:Init({networkid = '[U:1:456]'})
    assert(ShowMMR.blocked and nettables.state.count == 0)
    writes = #commands
    ShowMMR:Refresh(nil, {user='456', time=1783408000, previous=0, mmr=6000})
    assert(#commands == writes, 'occupied storage must not be overwritten')
''')

lua.execute('''
    -- Pending baselines use only the existing account-marker binding.
    ShowMMR:Init({networkid='[U:1:999]'})
    commands = {}
    ShowMMR:Baseline(nil, {user='999', idle=1, calibrated=1, mmr=7000, at=1783500000, previous=1783404000})
    assert(#commands == 2 and commands[1]:match('^bindss 3 JOY32 '))
    assert(next(ShowMMR.data) == nil and ShowMMR.pending.phase == 1)
    local marker = ShowMMR:Marker()
    assert(#marker < 500)
    local decoded, valid = ShowMMR:ReadPending(marker)
    assert(valid and decoded.mmr == 7000 and decoded.previous == 1783404000)
    local _, bad = ShowMMR:ReadPending(marker .. ':extra')
    assert(not bad)
    _, bad = ShowMMR:ReadPending(marker:gsub('user:999', 'user:123'))
    assert(not bad)
    local writes = #commands
    ShowMMR:Baseline(nil, {user='999', idle=1, calibrated=1, mmr=7000, at=1783500010, previous=1783404000})
    ShowMMR:Baseline(nil, {user='999', idle=0, calibrated=1, mmr=7025, at=1783500010, previous=1783404000})
    ShowMMR:Begin(nil, {user='123', before_start=1, at=1783500100, match_id='8883733433'})
    ShowMMR:Begin(nil, {user='999', before_start=0, at=1783500100, match_id='8883733433'})
    assert(#commands == writes and ShowMMR:Marker() == marker)
    ShowMMR:Begin(nil, {user='999', before_start=1, at=1783500100, match_id='8883733433'})
    assert(ShowMMR.pending.phase == 2 and ShowMMR.pending.mmr == 7000)
    writes = #commands
    ShowMMR:Begin(nil, {user='999', before_start=1, at=1783500200, match_id='8883733433'})
    assert(#commands == writes, 'reconnect must not re-arm or refresh a baseline')

    -- Simulate disk bytes after an early exit, then discard runtime state and reload.
    files['cfg/user_keys_999_slot3.vcfg'] = {bindings={JOY32=ShowMMR:Marker()}}
    ShowMMR.user = nil
    ShowMMR:Init({networkid='[U:1:999]'})
    assert(ShowMMR.pending.phase == 2 and ShowMMR.pending.match_id == '8883733433')
    assert(ShowMMR.pending.mmr == 7000 and nettables.state.pending.mmr == 7000)
    writes = #commands
    local result = {user='999', idle=1, calibrated=1, finished=0, outcome=1, mmr=7025,
        time=1783501000, previous=1783404000, at=1783504000, match_id='8883733433'}
    ShowMMR:Refresh(nil, result)
    result.finished, result.idle = 1, 0
    ShowMMR:Refresh(nil, result)
    result.idle, result.mmr = 1, 7000
    ShowMMR:Refresh(nil, result)
    result.mmr, result.match_id = 7025, '8883733434'
    ShowMMR:Refresh(nil, result)
    assert(#commands == writes and ShowMMR.pending.phase == 2 and next(ShowMMR.data) == nil)
    result.match_id = '8883733433'
    ShowMMR:Refresh(nil, result)
    assert(ShowMMR.data[1783501000][2] == 25)
    assert(ShowMMR.pending.phase == 1 and ShowMMR.pending.previous == 1783501000)
    writes = #commands
    ShowMMR:Refresh(nil, result)
    assert(#commands == writes, 'duplicate reconciliation must not write')

    -- A second match/gap cannot silently replace pending evidence.
    ShowMMR:Begin(nil, {user='999', before_start=1, at=1783505000, match_id='8883733435'})
    ShowMMR:Begin(nil, {user='999', before_start=1, at=1783506000, match_id='8883733436'})
    assert(ShowMMR.pending.phase == 3 and ShowMMR.pending.reason == 2)
    assert(ShowMMR.pending.match_id == '8883733435' and ShowMMR.pending.mmr == 7025)
    marker = ShowMMR:Marker()
    ShowMMR:Baseline(nil, {user='999', idle=1, calibrated=1, mmr=7075, at=1783510000, previous=1783509000})
    assert(ShowMMR:Marker() == marker)

    -- If a start notification was missed, a persisted pre-match anchor can still recover
    -- exactly one later completed ranked row. A nonconsecutive row remains uncertain.
    ShowMMR:Init({networkid='[U:1:998]'})
    ShowMMR:Baseline(nil, {user='998', idle=1, calibrated=1, mmr=7000, at=1783500000, previous=1783404000})
    ShowMMR:Refresh(nil, {user='998', idle=1, calibrated=1, finished=1, outcome=-1, mmr=6975,
        time=1783501000, previous=1783404000, at=1783504000})
    assert(ShowMMR.data[1783501000][2] == -25)
    ShowMMR:Refresh(nil, {user='998', idle=1, calibrated=1, finished=1, outcome=1, mmr=7025,
        time=1783508000, previous=1783506000, at=1783510000})
    assert(ShowMMR.pending.phase == 3 and ShowMMR.pending.reason == 1)
    assert(ShowMMR.data[1783508000] == nil)

    files['C:/Program Files (x86)/Steam/userdata/997/570/local/cfg/user_keys_0_slot3.vcfg'] = {}
    files['cfg/user_keys_997_slot3.vcfg'] = {bindings={JOY32='showmmr_user:997', JOY1='1783404000:[6000,25]'}}
    ShowMMR:Init({networkid='[U:1:997]'})
    assert(next(ShowMMR.data) == nil and ShowMMR.pending == nil, 'empty primary must not resurrect fallback')
    ShowMMR:Baseline(nil, {user='997', idle=1, calibrated=1, mmr=7000, at=1783500000, previous=1783404000})
    ShowMMR:Begin(nil, {user='997', before_start=1, at=1783500100, match_id='18446744073709551615'})
    decoded, valid = ShowMMR:ReadPending(ShowMMR:Marker())
    assert(valid and decoded.match_id == '18446744073709551615')
    _, bad = ShowMMR:ReadPending(ShowMMR:Marker():gsub('18446744073709551615', '18446744073709551616'))
    assert(not bad, 'uint64 overflow must not silently round a match ID')
    ShowMMR:Refresh(nil, {user='997', calibrated=0})
    assert(ShowMMR.pending.phase == 3 and ShowMMR.pending.reason == 3 and ShowMMR.pending.mmr == 7000)
    writes = #commands
    ShowMMR:Refresh(nil, {user='997', idle=1, calibrated=1, finished=1, outcome=1, mmr=8000,
        time=1783501000, previous=1783404000, at=1783504000, match_id='18446744073709551615'})
    assert(#commands == writes and next(ShowMMR.data) == nil, 'calibration uncertainty must not become a match delta')
''')

# Exercise the patch hook against a fake Minify output folder.
with tempfile.TemporaryDirectory() as temporary:
    core = ModuleType('core')
    core.constants = SimpleNamespace(minify_dota_compile_output_path=temporary)
    core.steam = SimpleNamespace(ROOT='D:/Custom Steam')
    sys.modules['core'] = core
    spec = importlib.util.spec_from_file_location('show_mmr_hook', MOD / 'script.py')
    hook = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(hook)
    hook.main()
    assert 'D:/Custom Steam' in (Path(temporary) / 'scripts/show_mmr_paths.txt').read_text()
print('Lua storage and Minify hook regression checks passed')
