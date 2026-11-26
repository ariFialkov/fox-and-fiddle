"""Fetch more Meshy library clips onto the existing Sal rig and append them to clips.json as new batches.
usage: anim_fetch2.py   (edit CLIPS below; already-fetched names are skipped)"""
import json, sys
sys.path.insert(0, '/home/claude/scripts')
import meshy
from meshy import download
A = '/home/claude/models/west/anim/'
CLIPS = {33: 'sitIdle', 32: 'sitIdleF', 343: 'sitDrink', 304: 'sitFistPump', 354: 'sitClap', 364: 'sitArmsCrossed',
         307: 'sitTalk', 356: 'sitLeanBack', 355: 'sitFingerWag', 357: 'sitThumbsUp',
         342: 'standDrink', 412: 'victory', 26: 'angryStomp', 316: 'headache', 409: 'fingerWag', 318: 'handRub',
         59: 'victoryCheer', 306: 'cheerOneHand', 245: 'idle5', 247: 'idle7'}
PATHS = meshy.PATHS; PATHS['rigging'] = '/v1/rigging'; PATHS['animations'] = '/v1/animations'
rid = json.load(open(A + 'rig.json'))['rig_task_id']
meta = json.load(open(A + 'clips.json'))
have = {n for b in meta['batches'] for n in b}
ids = [i for i, n in CLIPS.items() if n not in have]
start = len(meta['batches'])
jobs = {}
for k in range(0, len(ids), 10):
    jobs[f'batch{start + k // 10}'] = ('animations', meshy.create('animations', {'rig_task_id': rid, 'action_ids': ids[k:k + 10],
                                                                                 'post_process': {'operation_type': 'change_fps', 'fps': 30}}))
print('jobs', list(jobs), flush=True)
done = meshy.wait_all(jobs, timeout=1800)
ok = True
for name, t in sorted(done.items()):
    if t['status'] == 'SUCCEEDED':
        download(t['result']['animation_glb_url'], A + f'{name}.glb'); print(name, 'saved', flush=True)
    else:
        ok = False; print(name, t['status'], t.get('task_error'), flush=True)
if ok:
    for k in range(0, len(ids), 10):
        meta['batches'].append([CLIPS[i] for i in ids[k:k + 10]])
    meta['ids'] += ids
    json.dump(meta, open(A + 'clips.json', 'w'))
    print('clips.json updated', flush=True)
