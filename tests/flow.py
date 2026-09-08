"""Exercise actual Panorama event payloads against actual Lua, without Dota or real cfg writes."""
import json
from pathlib import Path
import re
import runpy
import subprocess

repo = Path(__file__).resolve().parents[1]
storage = runpy.run_path(str(repo / 'tests/storage.py'))
lua, table = storage['lua'], storage['table']
lua.execute("ShowMMR:Init({networkid='[U:1:12345]'}); commands={}")


def plain(value):
    if hasattr(value, 'items'):
        return {str(key): plain(item) for key, item in value.items()}
    return value


worker = """
const step = require('./tests/panorama.js').step;
require('node:readline').createInterface({input: process.stdin}).on('line', line => {
    process.stdout.write(JSON.stringify(step(JSON.parse(line))) + '\\n');
});
"""
with subprocess.Popen(['node', '-e', worker], cwd=repo, stdin=subprocess.PIPE,
                      stdout=subprocess.PIPE, text=True) as node:
    def observe(now, mmr, epoch, previous, classes=('Lost',), **options):
        message = dict(now=now, mmr=str(mmr), row=dict(epoch=epoch, classes=classes), previous=previous,
                       tables=plain(lua.globals().nettables), **options)
        node.stdin.write(json.dumps(message) + '\n')
        node.stdin.flush()
        line = node.stdout.readline()
        assert line, 'Panorama worker exited unexpectedly'
        events = json.loads(line)
        handlers = {'ShowMMR_Baseline': 'Baseline', 'ShowMMR_Refresh': 'Refresh'}
        for event in events:
            mod = lua.globals().ShowMMR
            mod[handlers[event['name']]](mod, None, table(event['payload']))
        return events

    # Current native history observation seeds only pending, not an invented result.
    assert not observe(1783500000, 7000, 1783404000, 1783304000)
    assert observe(1783500004, 7000, 1783404000, 1783304000)[0]['name'] == 'ShowMMR_Baseline'
    lua.execute('assert(ShowMMR.pending.phase==1 and next(ShowMMR.data)==nil)')

    # Reconstruct the saved marker from actual queued commands, then simulate restart.
    bindings = {}
    for command in lua.globals().commands.values():
        match = re.fullmatch(r'bindss 3 (JOY\d+) "(.*)";', command)
        if match:
            bindings[match[1]] = match[2]
    lua.globals().files['cfg/user_keys_12345_slot3.vcfg'] = table({'bindings': bindings})
    lua.execute("ShowMMR.user=nil; ShowMMR:Init({networkid='[U:1:12345]'}); commands={}")
    lua.execute('assert(ShowMMR.pending.mmr==7000 and ShowMMR.pending.at==1783500004)')

    # A disconnected player opens history before the game has finished.
    assert not observe(1783502500, 6975, 1783501000, 1783404000, playClasses=['CanReconnect'])
    assert not observe(1783502504, 6975, 1783501000, 1783404000, playClasses=['CanReconnect'])
    # Even apparently idle UI cannot finalize a row whose recorded duration is unfinished.
    assert not observe(1783502600, 6975, 1783501000, 1783404000)
    assert not observe(1783502604, 6975, 1783501000, 1783404000)
    # After completion, wait for GC to update MMR instead of saving a zero delta.
    assert not observe(1783503000, 7000, 1783501000, 1783404000)
    assert not observe(1783503004, 7000, 1783501000, 1783404000)
    lua.execute('assert(#commands==0 and ShowMMR.pending.mmr==7000)')
    # Stable but conflicting native result/rating cannot consume the baseline.
    observe(1783503005, 6975, 1783501000, 1783404000, classes=['Won'])
    observe(1783503009, 6975, 1783501000, 1783404000, classes=['Won'])
    lua.execute('assert(#commands==0 and ShowMMR.pending.mmr==7000 and next(ShowMMR.data)==nil)')
    assert not observe(1783503010, 6975, 1783501000, 1783404000)
    assert observe(1783503014, 6975, 1783501000, 1783404000)[0]['name'] == 'ShowMMR_Refresh'
    lua.execute('assert(ShowMMR.data[1783501000][2]==-25 and ShowMMR.pending.previous==1783501000)')

    # Snapshot acknowledgement and subsequent UI reload cannot rewrite the result.
    lua.execute('commands={}')
    assert not observe(1783503020, 6975, 1783501000, 1783404000)
    assert not observe(1783503024, 6975, 1783501000, 1783404000)
    lua.execute('assert(#commands==0 and ShowMMR.data[1783501000][2]==-25)')

    # Loss then win returns to the original rating, but each nonzero result must
    # save separately even with a hidden profile scanner running between captures.
    assert not observe(1783508000, 7000, 1783505000, 1783501000, classes=['Won'])
    assert observe(1783508004, 7000, 1783505000, 1783501000, classes=['Won'])[0]['name'] == 'ShowMMR_Refresh'
    lua.execute('assert(ShowMMR.data[1783501000][2]==-25 and ShowMMR.data[1783505000][2]==25)')
    lua.execute('assert(ShowMMR.pending.mmr==7000 and ShowMMR.pending.previous==1783505000)')
    lua.execute('commands={}')
    assert not observe(1783508010, 7000, 1783505000, 1783501000, classes=['Won'])
    assert not observe(1783508014, 7000, 1783505000, 1783501000, classes=['Won'])
    lua.execute('assert(#commands==0)')

    # Several unseen ranked games do not become one fictitious +50 result.
    assert not observe(1783515000, 7050, 1783511000, 1783507000, classes=['Won'])
    observe(1783515004, 7050, 1783511000, 1783507000, classes=['Won'])
    lua.execute('assert(ShowMMR.pending.phase==3 and ShowMMR.pending.reason==1 and ShowMMR.data[1783511000]==nil)')
    node.stdin.close()
    assert node.wait(timeout=10) == 0

print('Panorama -> Lua -> simulated binding reload -> Panorama recovery checks passed')
