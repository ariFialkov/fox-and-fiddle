"""Build characters on the v2 skeleton (parallel), quantize into the game. usage: build_v2_all.py [names...]"""
import json, subprocess, sys, os
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, '/home/claude/scripts')
from west_char_cast import CAST
V2_OV = json.load(open('/home/claude/scripts/v2_overrides.json')) if os.path.exists('/home/claude/scripts/v2_overrides.json') else {}
names = sys.argv[1:] or list(CAST)
def one(n):
    f, h, ov = CAST[n]
    ov = dict(ov)
    ov.update(V2_OV.get(n, {}))
    if 'mouthY' in ov: ov.pop('mouthDY', None)
    r = subprocess.run(['python3', '/home/claude/scripts/west_char_rig.py', n, str(f), json.dumps(ov)], capture_output=True, text=True, env=dict(os.environ, RIGV2='1'))
    if r.returncode: return f'{n}: FAILED {r.stderr[-400:]}'
    subprocess.run(['/home/claude/rt/node_modules/.bin/gltfpack', '-i', f'/home/claude/models/west/chars/parts_v2/{n}.glb', '-o', f'/home/claude/verify/public/western/characters/v2/{n}-v2.glb', '-kn', '-km', '-ke'], capture_output=True)
    return n + ': ' + ' | '.join(l.strip() for l in r.stdout.splitlines() if 'hair cards' in l or 'bridges' in l or 'mouth at' in l or 'eyes at' in l or 'scale S' in l)
with ThreadPoolExecutor(6) as ex:
    for line in ex.map(one, names): print(line)
